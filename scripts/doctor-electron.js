const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

function ok(cmd, args = []) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return result.status === 0;
}

let pkgVersion = 'n/a';
let foundPkg = false;

try {
  pkgVersion = require('electron/package.json').version;
  foundPkg = true;
} catch {
  // leave defaults; handled below
}

const viaNpx = ok('npx', ['electron', '--version']);
const dist =
  fs.existsSync('node_modules/electron/dist/Electron.app') ||
  fs.existsSync('node_modules/electron/dist/electron');

if (!foundPkg || !viaNpx || !dist) {
  console.error('✗ Electron not installed correctly');
  process.exit(1);
}

console.log(`✓ Electron OK (pkg ${pkgVersion})`);
