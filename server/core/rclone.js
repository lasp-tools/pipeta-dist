const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const { APP_ROOT } = require('./app-context');

const primaryRclonePath = path.join(APP_ROOT, 'tools/rclone/rclone.exe');
const fallbackRclonePath = 'C:/TOOLS/APPS/Pipeta/tools/rclone/rclone.exe';
const RCLONE_PATH = fs.existsSync(primaryRclonePath)
    ? primaryRclonePath
    : (fs.existsSync(fallbackRclonePath) ? fallbackRclonePath : primaryRclonePath);

let rcloneAvailable = false;
let rcloneVersion = null;

try {
    if (fs.existsSync(RCLONE_PATH)) {
        const ver = execSync(`"${RCLONE_PATH}" version`, { timeout: 5000 }).toString();
        const match = ver.match(/rclone (v[\d.]+)/);
        rcloneVersion = match ? match[1] : 'unknown';
        rcloneAvailable = true;
        console.log(`[RCLONE] Detected: ${rcloneVersion} at ${RCLONE_PATH}`);
    } else {
        console.log('[RCLONE] Not found. Native copy will be used.');
    }
} catch (e) {
    console.log('[RCLONE] Check error:', e.message);
}

async function replicateEmptyDirectories(srcDir, destDir) {
    await fs.ensureDir(destDir);
    try {
        const entries = await fs.readdir(srcDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const srcSub = path.join(srcDir, entry.name);
                const destSub = path.join(destDir, entry.name);
                await replicateEmptyDirectories(srcSub, destSub);
            }
        }
    } catch (e) {
        console.warn(`[MKDIR_ONLY] Error en ${srcDir}:`, e.message);
    }
}

module.exports = {
    RCLONE_PATH,
    rcloneAvailable,
    rcloneVersion,
    replicateEmptyDirectories
};
