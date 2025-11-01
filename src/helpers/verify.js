const path = require('path');
const fs = require('fs');
const os = require('os');
const execa = (...args) => import('execa').then(m => m.execa(...args));
const { resolveFfmpeg } = require('./ffbinary');
const ffmpegPath = resolveFfmpeg();

(async ()=>{
  const file = process.argv[2];
  if(!file){ console.error('Usage: node src/helpers/verify.js /path/to/file'); process.exit(1); }
  const ext = path.extname(file).toLowerCase();
  const pythonBin = process.env.PYTHON_BIN || 'python3';
  const wmPy = path.join(__dirname, '../python/wm.py');

  if(ext === '.jpg' || ext === '.png'){
    const { stdout } = await execa(pythonBin, [wmPy, 'image-extract', file], {stdio:'pipe'});
    console.log(stdout.trim()); process.exit(0);
  }

  if(ext === '.wav' || ext === '.mp3'){
    try {
      let wav = file;
      if(ext === '.mp3'){
        wav = path.join(os.tmpdir(), `verify_${Date.now()}.wav`);
        await execa(ffmpegPath, ['-y','-i', file, '-acodec','pcm_s16le','-ar','48000','-ac','2', wav]);
      }
      const { stdout } = await execa('audiowmark', ['-d', wav], {stdio:'pipe'});
      console.log(stdout.trim()); process.exit(0);
    } catch {
      console.error('No audiowmark found or no payload detected.'); process.exit(2);
    }
  }

  if(ext === '.mp4' || ext === '.mov'){
    const tmpDir = path.join(os.tmpdir(), `vfy_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    await execa(ffmpegPath, ['-y','-i', file, '-vf','fps=1', path.join(tmpDir, 'vf_%03d.png')]);
    const files = fs.readdirSync(tmpDir).filter(f=>f.endsWith('.png'));
    for(const g of files){
      const p = path.join(tmpDir, g);
      const { stdout } = await execa(pythonBin, [wmPy, 'image-extract', p], {stdio:'pipe'});
      const msg = stdout.trim();
      if(msg && msg.length >= 16){ console.log(msg); process.exit(0); }
    }
    console.error('No watermark detected on sampled frames'); process.exit(2);
  }

  console.error('Unsupported file type'); process.exit(2);
})().catch(e=>{ console.error(e.message||e); process.exit(2); });
