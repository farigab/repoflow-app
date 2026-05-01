const path = require('node:path');
const { patchExecutableResources } = require('./electron-icon-tools.cjs');

async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const executableName = `${context.packager.appInfo.productFilename}.exe`;
  const executablePath = path.join(context.appOutDir, executableName);
  await patchExecutableResources(executablePath, {
    productName: context.packager.appInfo.productName,
    companyName: context.packager.appInfo.companyName,
    version: context.packager.appInfo.version,
    exeName: executableName,
    internalName: context.packager.appInfo.productFilename
  });
}

module.exports = {
  afterPack
};
