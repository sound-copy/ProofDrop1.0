const { spawnSync } = require('node:child_process');

function check(bin) {
  const result = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  return result.status === 0;
}

if (!check('ffmpeg') || !check('ffprobe')) {
  console.error('✗ ffmpeg/ffprobe not resolvable');
  process.exit(1);
}

console.log('✓ ffmpeg/ffprobe available');
