#!/usr/bin/env node
const path = require('path');
const { audioPresenceLabel } = require('../src/helpers/mediaProbe');

const root = path.join(__dirname, '..');
const fixtures = [
  { file: 'fixtures/audio-tone.wav', expect: 'has audio' },
  { file: 'fixtures/blank.png', expect: 'no audio' }
];

async function main(){
  let exitCode = 0;
  for (const { file, expect } of fixtures){
    const full = path.join(root, file);
    try{
      const result = await audioPresenceLabel(full);
      const ok = result === expect;
      const mark = ok ? '✓' : '✗';
      console.log(`${mark} ${file}: ${result}`);
      if (!ok){
        console.log(`  expected: ${expect}`);
        exitCode = 1;
      }
    }catch(err){
      exitCode = 1;
      console.log(`✗ ${file}: error ${err.message || err}`);
    }
  }
  process.exit(exitCode);
}

main();
