import { basename, resolve } from 'node:path';
import iconTools from './electron-icon-tools.cjs';

const { patchExecutableResources } = iconTools;

const targetPath = resolve('node_modules/electron/dist/electron.exe');
await patchExecutableResources(targetPath);
console.log(`Patched resources for ${basename(targetPath)}`);
