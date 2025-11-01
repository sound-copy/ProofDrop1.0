const path = require('path');
const fs = require('fs');

function fileIfExists(candidate){
  if (!candidate) return null;
  try{
    return fs.existsSync(candidate) ? candidate : null;
  }catch(_){
    return null;
  }
}

function maybeResourcesPath(binaryName){
  const base = process.resourcesPath || '';
  if (!base) return null;
  return fileIfExists(path.join(base, 'ffmpeg', binaryName));
}

function resolveFromDev(pkgName, prop){
  try{
    const mod = require(pkgName);
    const candidate = prop ? mod[prop] : mod;
    return fileIfExists(candidate);
  }catch(_){
    return null;
  }
}

function resolveFfmpeg(){
  const env = fileIfExists(process.env.FFMPEG_PATH);
  if (env) return env;
  const bundled = maybeResourcesPath('ffmpeg');
  if (bundled) return bundled;
  const dev = resolveFromDev('ffmpeg-static');
  if (dev) return dev;
  return 'ffmpeg';
}

function resolveFfprobe(){
  const env = fileIfExists(process.env.FFPROBE_PATH);
  if (env) return env;
  const bundled = maybeResourcesPath('ffprobe');
  if (bundled) return bundled;
  const dev = resolveFromDev('ffprobe-static', 'path');
  if (dev) return dev;
  return 'ffprobe';
}

module.exports = {
  resolveFfmpeg,
  resolveFfprobe
};
