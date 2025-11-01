const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const execa = (...args) => import('execa').then(m => m.execa(...args));
const { resolveFfmpeg, resolveFfprobe } = require('./ffbinary');
const { hasAudio } = require('./mediaProbe');

const ffmpegPath = resolveFfmpeg();
const ffprobePath = resolveFfprobe();

function step(onProgress, msg){ if (typeof onProgress === 'function') onProgress(msg); }

function streamSha256(p){
  return new Promise((resolve,reject)=>{
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(p);
    s.on('data', d=>h.update(d));
    s.on('end', ()=>resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

function outName(dir, base, ext, watermark){
  const tag = watermark ? '_protected' : '_converted';
  return path.join(dir, `${base}${tag}${ext}`);
}

function resolvePyScript(){
  const resPath = path.join(process.resourcesPath || '', 'python', 'wm.py');
  if (fs.existsSync(resPath)) return resPath;
  const unpacked = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'src', 'python', 'wm.py');
  if (fs.existsSync(unpacked)) return unpacked;
  const devPath = path.join(__dirname, '../python/wm.py');
  return devPath;
}

function resolvePythonBin(){
  const c1 = path.join(os.homedir(), '.proofdrop-venv', 'bin', 'python');
  if (fs.existsSync(c1)) return c1;
  const c2 = process.env.PYTHON_BIN;
  if (c2 && fs.existsSync(c2)) return c2;
  return 'python3';
}

function ffext(p){ return path.extname(p).toLowerCase(); }
const IMG_EXTS = new Set(['.png','.jpg','.jpeg','.tif','.tiff','.bmp','.webp']);
const VID_EXTS = new Set(['.mp4','.mov','.m4v','.mkv','.webm','.gif']);
const AUD_EXTS = new Set(['.wav','.mp3','.m4a','.aif','.aiff','.flac']);

function inputLoopArgs(ext){
  return (ext === '.webp' || ext === '.gif') ? ['-ignore_loop','1'] : [];
}

async function isAnimatedWebP(input){
  try{
    const { stdout } = await execa(ffprobePath, [
      '-v','error',
      '-select_streams','v:0',
      '-count_frames',
      '-show_entries','stream=nb_read_frames,codec_name,codec_type',
      '-of','json',
      input
    ], {stdio:'pipe'});
    const j = JSON.parse(stdout || '{}');
    const s = j.streams && j.streams[0];
    const n = s && parseInt(s.nb_read_frames, 10);
    return Number.isFinite(n) && n > 1;
  }catch(_){ return false; }
}

function makeManifest(dir, base, sha){
  const manifest = {
    title: base,
    creator: "Sound Recording Copyright",
    date_created_utc: new Date().toISOString(),
    sha256_master: sha,
    license_short: `© ${new Date().getFullYear()} Sound Recording Copyright. All rights reserved.`,
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
  }catch(_){
    fs.writeFileSync(`${manifestPath}.ots.pending`, 'pending');
    return `${manifestPath}.ots.pending`;
  }
}

async function watermarkImage(pythonBin, scriptPath, input, message, output){
  await execa(pythonBin, [scriptPath, 'image-embed', input, message, output], {stdio:'pipe'});
  if(!fs.existsSync(output)) throw new Error('Image embed produced no output');
  try{ await execa(pythonBin, [scriptPath, 'image-extract', output], {stdio:'pipe'}); }catch(_){}
}

async function watermarkAudioGeneric(input, message, output){
  const payload = message.slice(0,32);
  const tmpWavIn  = path.join(os.tmpdir(), `pd_${Date.now()}_in.wav`);
  const tmpWavOut = path.join(os.tmpdir(), `pd_${Date.now()}_out.wav`);
  await execa(ffmpegPath, ['-y','-i', input, '-vn', '-acodec','pcm_s16le', '-ar','48000', '-ac','2', tmpWavIn]);
  try{ await execa('audiowmark', ['-e','-t', payload, tmpWavIn, tmpWavOut], {stdio:'pipe'}); }
  catch(_){ fs.copyFileSync(tmpWavIn, tmpWavOut); }
  const ext = ffext(output);
  if (ext === '.mp3') await execa(ffmpegPath, ['-y','-i', tmpWavOut, '-c:a','libmp3lame','-b:a','320k','-ar','44100', output]);
  else if (ext === '.wav') await execa(ffmpegPath, ['-y','-i', tmpWavOut, '-c','copy', output]);
  else if (ext === '.m4a' || ext === '.mp4') await execa(ffmpegPath, ['-y','-i', tmpWavOut, '-c:a','aac','-b:a','192k', output]);
  else if (ext === '.aif' || ext === '.aiff') await execa(ffmpegPath, ['-y','-i', tmpWavOut, '-c:a','pcm_s16be', output]);
  else if (ext === '.flac') await execa(ffmpegPath, ['-y','-i', tmpWavOut, '-c:a','flac', output]);
  else await execa(ffmpegPath, ['-y','-i', tmpWavOut, '-c:a','aac','-b:a','192k', output]);
}

async function passthru(input, output){
  await execa(ffmpegPath, ['-y','-i', input, '-c','copy', output], {stdio:'inherit'});
}
async function imageCopy(input, output){
  fs.copyFileSync(input, output);
}


/* ---------- Hardened WebP/TIFF/GIF → PNG (still) ---------- */
async function webpToPngStill(input, output){
  const animated = await isAnimatedWebP(input).catch(()=>false);
  if (animated) throw new Error('Animated WebP is not supported');

  try{
    await execa(ffmpegPath, [
      '-y',
      '-i', input,
      '-frames:v','1',
      '-map_metadata','-1',
      '-vf','format=rgba',
      '-c:v','png',
      '-compression_level','9',
      output
    ], {stdio:'inherit'});
    return;
  }catch(_){}

  try{
    await execa('sips', ['-s','format','png', input, '--out', output], {stdio:'inherit'});
    return;
  }catch(_){}

  try{
    await execa('magick', [input, output], {stdio:'inherit'});
    return;
  }catch(e){
    throw new Error('Failed to decode still WebP → PNG (ffmpeg/sips/magick unavailable).');
  }
}

/* REPLACE: generic imageToPng uses special WebP path, keeps prior TIFF/GIF hardening */
async function imageToPng(input, output, srcExt){
  const e = (srcExt || '').toLowerCase();
  if (e === '.webp'){
    return webpToPngStill(input, output);
  }
  try{
    await execa(ffmpegPath, [
      '-y',
      ...(e === '.gif' ? ['-ignore_loop','1'] : []),
      '-probesize','100M',
      '-analyzeduration','100M',
      '-err_detect','ignore_err',
      '-i', input,
      '-frames:v','1',
      '-map_metadata','-1',
      '-vf','format=rgba',
      '-c:v','png',
      '-compression_level','9',
      output
    ], {stdio:'inherit'});
  }catch(firstErr){
    if (e === '.tif' || e === '.tiff'){
      try{
        await execa('sips', ['-s','format','png', input, '--out', output], {stdio:'inherit'});
        return;
      }catch(_){}
    }
    throw firstErr;
  }
}

/* ---------- Image encoders ---------- */
async function imageToWebpLossy(input, output){
  await execa(ffmpegPath, ['-y','-i', input, '-map_metadata','-1','-c:v','libwebp','-lossless','0','-q:v','75','-compression_level','6', output], {stdio:'inherit'});
}
// (imageToMp4 exists below as the sturdier version)

/* ---------- Video / Audio helpers ---------- */
async function videoToImage(input, outPath, srcExt){
  await execa(ffmpegPath, [
    '-y',
    ...inputLoopArgs(srcExt),
    '-probesize','100M',
    '-analyzeduration','100M',
    '-i', input,
    '-frames:v','1',
    '-vf','format=rgba',
    outPath
  ], {stdio:'inherit'});
}
async function audioToVideo(input, outPath){
  await execa(ffmpegPath, [
    '-y',
    '-f','lavfi','-i','color=size=1280x720:rate=30:color=black',
    '-i',input,
    '-shortest',
    '-c:v','libx264','-preset','ultrafast','-crf','30',
    '-c:a','aac','-b:a','192k',
    outPath
  ], {stdio:'inherit'});
}

async function imageToMp4(input, outPath){
  await execa(ffmpegPath, [
    '-y',
    '-loop','1',
    '-framerate','30',
    '-t','5',
    '-i', input,
    '-c:v','libx264',
    '-preset','slow',
    '-crf','21',
    '-pix_fmt','yuv420p',
    '-movflags','+faststart',
    outPath
  ], {stdio:'inherit'});
}

async function imageToWebmVp8(input, outPath){
  await execa(ffmpegPath, [
    '-y',
    '-loop','1',
    '-framerate','30',
    '-t','5',
    '-i', input,
    '-c:v','libvpx',
    '-crf','22',
    '-b:v','0',
    '-quality','good',
    '-cpu-used','2',
    '-auto-alt-ref','1',
    '-lag-in-frames','25',
    '-pix_fmt','yuv420p',
    '-an',
    outPath
  ], {stdio:'inherit'});
}

/* ---------- MP4 encoders ---------- */
async function encodeMp4H264(input, outPath, srcExt){
  const preset = (srcExt === '.webp') ? 'medium' : 'slow';
  await execa(ffmpegPath, [
    '-y',
    ...inputLoopArgs(srcExt),
    '-probesize','100M',
    '-analyzeduration','100M',
    '-i',input,
    '-c:v','libx264','-preset',preset,'-crf','21','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','192k',
    '-movflags','+faststart',
    outPath
  ], {stdio:'inherit'});
}
async function encodeMp4H265(input, outPath, srcExt){
  await execa(ffmpegPath, [
    '-y',
    ...inputLoopArgs(srcExt),
    '-probesize','100M',
    '-analyzeduration','100M',
    '-i',input,
    '-c:v','libx265','-preset','slow','-crf','24','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','192k',
    '-movflags','+faststart',
    outPath
  ], {stdio:'inherit'});
}

/* ---------- Robust GIF (single-pass, no temp palette file) ---------- */
async function encodeGifPreset(input, outPath, limit, fps){
  const palette = path.join(os.tmpdir(), `pd_palette_${Date.now()}.png`);
  const scaleExpr = `scale=trunc(iw*min(1\\,${limit}/max(iw\\,ih))/2)*2:trunc(ih*min(1\\,${limit}/max(iw\\,ih))/2)*2:flags=lanczos`;

  await execa(ffmpegPath, [
    '-y',
    '-probesize','100M',
    '-analyzeduration','100M',
    '-i', input,
    '-vf', `fps=${fps},${scaleExpr},palettegen=reserve_transparent=1:max_colors=128:stats_mode=full`,
    palette
  ], {stdio:'inherit'});

  await execa(ffmpegPath, [
    '-y',
    '-probesize','100M',
    '-analyzeduration','100M',
    '-i', input,
    '-i', palette,
    '-filter_complex', `fps=${fps},${scaleExpr}[x];[x][1:v]paletteuse=dither=floyd_steinberg:alpha_threshold=128`,
    '-loop','0',
    outPath
  ], {stdio:'inherit'});
}

/* ---------- WebM VP8 (updated quality) ---------- */
async function encodeWebmVp8Video(input, outPath, srcExt){
  await execa(ffmpegPath, [
    '-y',
    ...inputLoopArgs(srcExt),
    '-probesize','100M',
    '-analyzeduration','100M',
    '-i',input,
    '-c:v','libvpx',
    '-crf','22',
    '-b:v','0',
    '-quality','good',
    '-cpu-used','2',
    '-auto-alt-ref','1',
    '-lag-in-frames','25',
    '-c:a','libopus','-b:a','128k',
    outPath
  ], {stdio:'inherit'});
}
async function encodeWebmVp8AudioOnly(input, outPath){
  await execa(ffmpegPath, [
    '-y',
    '-i',input,
    '-vn',
    '-c:a','libopus','-b:a','128k',
    '-f','webm',
    outPath
  ], {stdio:'inherit'});
}

/* ---------- WebP animated out ---------- */
async function encodeWebpAnimated(input, outPath, srcExt){
  await execa(ffmpegPath, [
    '-y',
    ...inputLoopArgs(srcExt),
    '-probesize','100M',
    '-analyzeduration','100M',
    '-i', input,
    '-an',
    '-filter:v','fps=20',
    '-vsync','0',
    '-c:v','libwebp',
    '-q:v','75',
    '-compression_level','6',
    '-loop','0',
    outPath
  ], {stdio:'inherit'});
}

/* ================= core ================= */
async function processFile(filePath, opts={}, onProgress){
  const dir = path.dirname(filePath);
  const ext = ffext(filePath);
  const base = path.basename(filePath, ext);
  step(onProgress, `ffmpeg=${ffmpegPath}`);
  step(onProgress, `preset=${String(opts.preset||'thru')} watermark=${!!opts.watermark}`);
  const pythonBin = resolvePythonBin();
  const script = resolvePyScript();

  step(onProgress, 'Hashing…');
  const sha = await streamSha256(filePath);

  let manifestPath = null, otsPath = null;
  if (opts.watermark){
    step(onProgress, 'Writing manifest…');
    manifestPath = makeManifest(dir, base, sha);
    step(onProgress, 'Timestamping (OTS)…');
    otsPath = await otsStamp(manifestPath);
  }

  let isImg = IMG_EXTS.has(ext);
  let isVid = VID_EXTS.has(ext);
  const isAud = AUD_EXTS.has(ext);

  if (ext === '.webp'){
    const anim = await isAnimatedWebP(filePath);
    if (anim){ isVid = true; isImg = false; }
  }

  if (!isImg && !isVid && !isAud) throw new Error('Unsupported file type');

  const preset = String(opts.preset || 'thru');

  if (isImg){
    if (opts.watermark){
      const stamped = outName(dir, base, ext, true);
      step(onProgress, 'Watermarking image…');
      await watermarkImage(pythonBin, script, filePath, sha, stamped);
      if (preset === 'png'){ const out = outName(dir, base, '.png', true); await imageToPng(stamped, out, ext); }
      else if (preset === 'webp'){ const out = outName(dir, base, '.webp', true); await imageToWebpLossy(stamped, out); }
      else if (preset === 'mp4_h264'){ const out = outName(dir, base, '.mp4', true); await imageToMp4(stamped, out); }
      else if (preset === 'mp4_h265'){ const out = outName(dir, base, '.mp4', true); await encodeMp4H265(stamped, out, ext); }
      else if (preset === 'webm_vp8'){ const out = outName(dir, base, '.webm', true); await imageToWebmVp8(stamped, out); }
      else if (preset === 'gif_480_18'){ const out = outName(dir, base, '.gif', true); await encodeGifPreset(stamped, out, 480, 18, ext); }
      else if (preset === 'gif_720_24'){ const out = outName(dir, base, '.gif', true); await encodeGifPreset(stamped, out, 720, 24, ext); }
      else if (preset === 'webp_anim'){ const out = outName(dir, base, '.webp', true); await encodeWebpAnimated(stamped, out, ext); }
      else { /* thru keeps stamped */ }
    }else{
      if (preset === 'png'){ const out = outName(dir, base, '.png', false); await imageToPng(filePath, out, ext); }
      else if (preset === 'webp'){ const out = outName(dir, base, '.webp', false); await imageToWebpLossy(filePath, out); }
      else if (preset === 'mp4_h264'){ const out = outName(dir, base, '.mp4', false); await imageToMp4(filePath, out); }
      else if (preset === 'mp4_h265'){ const out = outName(dir, base, '.mp4', false); await encodeMp4H265(filePath, out, ext); }
      else if (preset === 'webm_vp8'){ const out = outName(dir, base, '.webm', false); await imageToWebmVp8(filePath, out); }
      else if (preset === 'gif_480_18'){ const out = outName(dir, base, '.gif', false); await encodeGifPreset(filePath, out, 480, 18, ext); }
      else if (preset === 'gif_720_24'){ const out = outName(dir, base, '.gif', false); await encodeGifPreset(filePath, out, 720, 24, ext); }
      else if (preset === 'webp_anim'){ const out = outName(dir, base, '.webp', false); await encodeWebpAnimated(filePath, out, ext); }
      else { const out = outName(dir, base, ext, false); await imageCopy(filePath, out); }
    }
    return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
  }

  if (isAud){
    if (preset === 'mp3'){
      const out = outName(dir, base, '.mp3', opts.watermark);
      if (!(await hasAudio(filePath))) throw new Error('No audio stream in source (nothing to extract)');
      if (opts.watermark) await watermarkAudioGeneric(filePath, sha, out);
      else await execa(ffmpegPath, ['-y','-i', filePath, '-vn', '-c:a','libmp3lame','-b:a','320k','-ar','44100', out], {stdio:'inherit'});
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'wav' || preset === 'thru'){
      const out = outName(dir, base, '.wav', opts.watermark);
      if (!(await hasAudio(filePath))) throw new Error('No audio stream in source (nothing to extract)');
      if (opts.watermark) await watermarkAudioGeneric(filePath, sha, out);
      else await execa(ffmpegPath, ['-y','-i', filePath, '-vn', '-c:a','pcm_s16le','-ar','48000','-ac','2', out], {stdio:'inherit'});
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    // UPDATED: audio-only MP4 (no black video)
    if (preset === 'mp4_h264'){
      const out = outName(dir, base, '.mp4', opts.watermark);
      await execa(ffmpegPath, ['-y','-i', filePath, '-vn', '-c:a','aac','-b:a','192k', '-movflags','+faststart', out], {stdio:'inherit'});
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'mp4_h265'){
      const out = outName(dir, base, '.mp4', opts.watermark);
      await execa(ffmpegPath, ['-y','-i', filePath, '-vn', '-c:a','aac','-b:a','192k', '-movflags','+faststart', out], {stdio:'inherit'});
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'webm_vp8'){
      const out = outName(dir, base, '.webm', opts.watermark);
      await encodeWebmVp8AudioOnly(filePath, out);
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'webp' || preset === 'png' || preset === 'gif_480_18' || preset === 'gif_720_24' || preset === 'webp_anim'){
      throw new Error('Unsupported conversion: audio → image');
    }
    const out = outName(dir, base, '.wav', opts.watermark);
    if (!(await hasAudio(filePath))) throw new Error('No audio stream in source (nothing to extract)');
    await execa(ffmpegPath, ['-y','-i', filePath, '-vn', '-c:a','pcm_s16le','-ar','48000','-ac','2', out], {stdio:'inherit'});
    return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
  }

  if (isVid){
    if (!opts.watermark && preset === 'thru'){
      const out = outName(dir, base, ext, false);
      step(onProgress, 'Passthru copy…');
      await passthru(filePath, out);
      return { output_dir: dir, base, manifest: null, ots: null };
    }
    if (preset === 'png'){
      const out = outName(dir, base, '.png', opts.watermark);
      await videoToImage(filePath, out, ext);
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'webp'){
      const out = outName(dir, base, '.webp', opts.watermark);
      await encodeWebpAnimated(filePath, out, ext);
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    // UPDATED: guard for absent audio when extracting
    if (preset === 'mp3'){
      const out = outName(dir, base, '.mp3', opts.watermark);
      if (!(await hasAudio(filePath))) throw new Error('No audio stream in source (nothing to extract)');
      await execa(ffmpegPath, ['-y','-i', filePath, '-vn', '-c:a','libmp3lame','-b:a','320k','-ar','44100', out], {stdio:'inherit'});
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'wav'){
      const out = outName(dir, base, '.wav', opts.watermark);
      if (!(await hasAudio(filePath))) throw new Error('No audio stream in source (nothing to extract)');
      await execa(ffmpegPath, ['-y','-i', filePath, '-vn', '-acodec','pcm_s16le','-ar','48000','-ac','2', out], {stdio:'inherit'});
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'gif_480_18'){
      const out = outName(dir, base, '.gif', opts.watermark);
      await encodeGifPreset(filePath, out, 480, 18, ext);
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'gif_720_24'){
      const out = outName(dir, base, '.gif', opts.watermark);
      await encodeGifPreset(filePath, out, 720, 24, ext);
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'webm_vp8'){
      const out = outName(dir, base, '.webm', opts.watermark);
      await encodeWebmVp8Video(filePath, out, ext);
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'mp4_h265'){
      const out = outName(dir, base, '.mp4', opts.watermark);
      await encodeMp4H265(filePath, out, ext);
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    if (preset === 'mp4_h264' || preset === 'thru'){
      const out = outName(dir, base, '.mp4', opts.watermark);
      await encodeMp4H264(filePath, out, ext);
      return { output_dir: dir, base, manifest: manifestPath, ots: otsPath };
    }
    throw new Error('Unsupported preset for video');
  }

  throw new Error('Unhandled path');
}

module.exports = { processFile };
