const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const execa = require('execa');
const os = require('os');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

function step(onProgress, msg){ if(typeof onProgress === 'function') onProgress(msg); }

function streamSha256(filePath){
  return new Promise((resolve,reject)=>{
    const hash = crypto.createHash('sha256');
    const s = fs.createReadStream(filePath);
    s.on('data', d => hash.update(d));
    s.on('end', ()=> resolve(hash.digest('hex')));
    s.on('error', reject);
  });
}

function makeManifest(dir, base, sha){
  const manifest = {
    title: base,
    creator: "Sound Recording Copyright",
    date_created_utc: new Date().toISOString(),
    sha256_master: sha,
    license_short: `© ${new Date().getFullYear()} Sound Recording Copyright. All rights reserved. No training/scraping.`,
    canonical_url: `https://yoursite.com/artifacts/${base}`,
    notes: "Generated automatically."
  };
  const p = path.join(dir, `${base}_manifest.json`);
  fs.writeFileSync(p, JSON.stringify(manifest,null,2));
  return p;
}

async function otsStamp(manifestPath){
  try{
    await execa('ots', ['stamp', manifestPath], {stdio:'inherit'});
    return `${manifestPath}.ots`;
  }catch(e){
    fs.writeFileSync(`${manifestPath}.ots.pending`, 'pending');
    return `${manifestPath}.ots.pending`;
  }
}

async function watermarkImage(pythonBin, scriptPath, input, message, output){
  await execa(pythonBin, [scriptPath, 'image-embed', input, message, output], {stdio:'inherit'});
  const { stdout } = await execa(pythonBin, [scriptPath, 'image-extract', output], {stdio:'pipe'});
  if(!stdout.trim() || !message.startsWith(stdout.trim().slice(0,16))) throw new Error('Image watermark verify failed');
}

async function watermarkAudio(input, message, output){
  const payload = message.slice(0,32);
  async function tryAudiowmark(inFile, outFile){
    try{
      await execa('audiowmark', ['-e', '-t', payload, inFile, outFile], {stdio:'pipe'});
      const { stdout } = await execa('audiowmark', ['-d', outFile], {stdio:'pipe'});
      if(!stdout.includes(payload)) throw new Error('Audiowmark verify failed');
      return true;
    }catch(_){ return false; }
  }
  const ext = path.extname(input).toLowerCase();
  if(ext === '.mp3'){
    const tmpWavIn = path.join(os.tmpdir(), `${path.basename(input,'.mp3')}_in.wav`);
    const tmpWavOut = path.join(os.tmpdir(), `${path.basename(input,'.mp3')}_out.wav`);
    await execa(ffmpegPath, ['-y','-i', input, tmpWavIn]);
    const ok = await tryAudiowmark(tmpWavIn, tmpWavOut);
    if(ok){
      await execa(ffmpegPath, ['-y','-i', tmpWavOut, '-codec:a','libmp3lame','-b:a','192k', output]);
      return;
    }
  } else if(ext === '.wav'){
    const ok = await tryAudiowmark(input, output);
    if(ok) return;
  }
  await execa(ffmpegPath, ['-y','-i', input, '-c','copy', '-metadata', `comment=WMK_${payload}`, output]);
  fs.writeFileSync(path.join(path.dirname(output), `${path.basename(output, ext)}_NEEDS_AUDIOWMARK.txt`),
    'Install audiowmark (MacPorts: sudo port install audiowmark) for robust audio watermarking.');
}

async function watermarkVideoFrames(pythonBin, scriptPath, input, message, tmpDir){
  const { stdout } = await execa(pythonBin, [scriptPath, 'video-frames', input, message, tmpDir], {stdio:'pipe'});
  return JSON.parse(stdout);
}

async function processFile(filePath, opts = {}, onProgress) {
  // default: conform/reformat ON unless explicitly set false
  const conform = opts.conform !== false;

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  const outPath = path.join(dir, `${base}_protected${ext}`);

  step(onProgress, 'Hashing…');
  const sha = await streamSha256(filePath);

  step(onProgress, 'Writing manifest…');
  const manifestPath = makeManifest(dir, base, sha);

  step(onProgress, 'Timestamping (OTS)…');
  const otsPath = await otsStamp(manifestPath);

  if (ext === '.jpg' || ext === '.png') {
    step(onProgress, 'Watermarking image…');
    const py = process.env.PYTHON_BIN || 'python3';
    const script = path.join(__dirname, '../python/wm.py');
    await watermarkImage(py, script, filePath, sha, outPath);
  }
  else if (ext === '.wav' || ext === '.mp3') {
    step(onProgress, 'Watermarking audio…');
    await watermarkAudio(filePath, sha, outPath);
  }
  else if (ext === '.mp4' || ext === '.mov') {
    step(onProgress, 'Watermarking video frames (this can take a while)…');
    const py = process.env.PYTHON_BIN || 'python3';
    const script = path.join(__dirname, '../python/wm.py');

    const os = require('os');
    const framesDir = path.join(os.tmpdir(), `proofdrop_frames_${Date.now()}`);
    fs.mkdirSync(framesDir, { recursive: true });

    const meta = await watermarkVideoFrames(py, script, filePath, sha, framesDir);

    step(onProgress, 'Extracting audio…');
    const tmpAudio = path.join(framesDir, 'audio.wav');
    await execa(ffmpegPath, ['-y', '-i', filePath, '-vn', '-acodec', 'pcm_s16le', '-ar', '48000', '-ac', '2', tmpAudio]);

    step(onProgress, conform ? 'Encoding (social spec)…' : 'Encoding (keep source shape)…');
    const framesGlob = path.join(framesDir, '*.png');
    const outMp4 = path.join(dir, `${base}_protected.mp4`);
    await encodeVideo(framesGlob, tmpAudio, outMp4, meta.fps, meta.orientation, conform);
  }
  else {
    throw new Error('Unsupported file type');
  }

  step(onProgress, 'Done.');
  return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
}


module.exports = { processFile };
