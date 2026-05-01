import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, resolve } from 'node:path';

const rceditPath = resolve('node_modules/electron-winstaller/vendor/rcedit.exe');
const iconPath = resolve('media/icon.ico');
const targetExecutables = [
  resolve('node_modules/electron/dist/electron.exe'),
  resolve('release/win-unpacked/RepoFlow.exe')
];

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function runRcedit(targetPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(rceditPath, [targetPath, '--set-icon', iconPath], {
      stdio: 'inherit'
    });

    child.once('error', rejectPromise);
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`rcedit failed for ${targetPath} with exit code ${code ?? 'unknown'}`));
    });
  });
}

if (!await fileExists(iconPath)) {
  throw new Error(`Icon file not found: ${iconPath}`);
}

if (!await fileExists(rceditPath)) {
  throw new Error(`rcedit executable not found: ${rceditPath}`);
}

for (const targetPath of targetExecutables) {
  if (!await fileExists(targetPath)) {
    continue;
  }

  await runRcedit(targetPath);
  console.log(`Patched icon for ${basename(targetPath)}`);
}
