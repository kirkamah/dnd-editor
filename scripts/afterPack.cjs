// electron-builder afterPack hook. We ship UNSIGNED (no Apple Developer cert),
// but macOS — especially Apple Silicon — refuses to launch a binary with no
// signature at all. So we apply an ad-hoc signature (`codesign -s -`) to the
// packaged .app. The recipient still bypasses Gatekeeper once via right-click →
// Open (or `xattr -dr com.apple.quarantine`).
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  try {
    execSync(`codesign --force --deep --sign - ${JSON.stringify(appPath)}`, { stdio: 'inherit' });
    console.log(`[afterPack] ad-hoc signed ${appPath}`);
  } catch (e) {
    console.warn(`[afterPack] ad-hoc codesign failed: ${e.message}`);
  }
};
