import { basename, resolve } from 'node:path';
import iconTools from './electron-icon-tools.cjs';

if (process.platform !== 'win32') {
  console.warn('This script is intended to be run on Windows. Skipping resource patching.');
  process.exit(0);
}

const { patchExecutableResources } = iconTools;

const targetPath = resolve('node_modules/electron/dist/electron.exe');
await patchExecutableResources(targetPath);
console.log(`Patched resources for ${basename(targetPath)}`);
