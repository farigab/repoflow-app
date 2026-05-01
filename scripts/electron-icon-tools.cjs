const { access } = require('node:fs/promises');
const { constants } = require('node:fs');
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const packageMetadata = require('../package.json');

const rceditPath = resolve('node_modules/electron-winstaller/vendor/rcedit.exe');
const iconPath = resolve('media/icon.ico');
const defaultProductName = packageMetadata.build?.productName || packageMetadata.name;
const defaultCompanyName = packageMetadata.author || defaultProductName;
const defaultVersion = packageMetadata.version || '0.0.0';

function normalizeWindowsVersion(version) {
  const numericParts = String(version)
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part) && part >= 0)
    .slice(0, 4);

  while (numericParts.length < 4) {
    numericParts.push(0);
  }

  return numericParts.join('.');
}

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

function buildRceditArgs(targetPath, options = {}) {
  const productName = options.productName || defaultProductName;
  const companyName = options.companyName || defaultCompanyName;
  const productVersion = options.version || defaultVersion;
  const fileVersion = normalizeWindowsVersion(productVersion);
  const exeName = options.exeName || `${productName}.exe`;
  const internalName = options.internalName || productName;

  return [
    targetPath,
    '--set-icon', iconPath,
    '--set-version-string', 'FileDescription', productName,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'CompanyName', companyName,
    '--set-version-string', 'InternalName', internalName,
    '--set-version-string', 'OriginalFilename', exeName,
    '--set-file-version', fileVersion,
    '--set-product-version', fileVersion
  ];
}

async function patchExecutableResources(targetPath, options = {}) {
  if (!await fileExists(iconPath)) {
    throw new Error(`Icon file not found: ${iconPath}`);
  }

  if (!await fileExists(rceditPath)) {
    throw new Error(`rcedit executable not found: ${rceditPath}`);
  }

  if (!await fileExists(targetPath)) {
    throw new Error(`Executable not found: ${targetPath}`);
  }

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(rceditPath, buildRceditArgs(targetPath, options), {
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

module.exports = {
  patchExecutableResources
};
