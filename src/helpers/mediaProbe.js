const { resolveFfprobe } = require('./ffbinary');

const execa = (...args) => import('execa').then(m => m.execa(...args));

const ffprobePath = resolveFfprobe();

async function hasAudio(input){
  try{
    const { stdout } = await execa(ffprobePath, [
      '-v','error',
      '-select_streams','a',
      '-show_entries','stream=index',
      '-of','csv=p=0',
      input
    ], {stdio:'pipe'});
    return Boolean(stdout && stdout.trim().length);
  }catch(_){
    return false;
  }
}

async function audioPresenceLabel(input){
  return (await hasAudio(input)) ? 'has audio' : 'no audio';
}

module.exports = {
  hasAudio,
  audioPresenceLabel
};
