// scripts/proofdrop-check.js
//⋄ run this BEFORE build to be sure ffmpeg/ffprobe are findable

const { spawnSync } = require("node:child_process");

function check(bin) {
  const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

const okFfmpeg = check("ffmpeg");
const okFfprobe = check("ffprobe");

if (!okFfmpeg || !okFfprobe) {
  console.error("✗ proofdrop: ffmpeg/ffprobe not resolvable on this machine");
  process.exit(1);
}

console.log("✓ proofdrop: ffmpeg/ffprobe available");
