const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const {
    IS_BETA,
    APP_ROOT,
    SERVER_DIR,
    LOCAL_APP_DIR,
    runtimeState
} = require('./app-context');

const UNC_CACHE = '//192.168.206.116/Z/_SYNC_CACHE';

// In-memory directory & order caches shared across fs/sync/ia modules
const serverDirCache = new Map();
const rcloneDirCache = new Map();
const SERVER_CACHE_TTL = 3 * 60 * 1000; // 3 minutes
const RCLONE_CACHE_TTL = 60 * 1000; // 1 minute
const dirSizeMemoryCache = new Map();
const ordersFileMemoryCache = new Map();
const ordersResponseCache = { time: 0, rawOrders: [] };

function getLocalSyncCacheDir() {
    const appDir = APP_ROOT;
    const isGitRepo = fs.existsSync(path.join(appDir, '.git')) || SERVER_DIR.toLowerCase().includes('github');
    if (isGitRepo) {
        const localDevCache = path.resolve(LOCAL_APP_DIR, '_SYNC_CACHE');
        try { fs.ensureDirSync(localDevCache); } catch (e) {}
        return localDevCache;
    }
    const localAppCache = path.join(appDir, '_SYNC_CACHE');
    try { fs.ensureDirSync(localAppCache); } catch (e) {}
    return localAppCache;
}

/**
 * Candidate local sync cache dirs for read-only lookups:
 * When IS_BETA, checks Pipeta_Beta/_SYNC_CACHE first and C:/TOOLS/APPS/Pipeta/_SYNC_CACHE second
 * so Beta immediately sees existing local catalogs without duplicating 100MB+.
 */
function getReadSyncCacheCandidateDirs() {
    const primary = getLocalSyncCacheDir();
    const list = [primary];
    if (IS_BETA) {
        const mainLocalCache = path.resolve('C:/TOOLS/APPS/Pipeta/_SYNC_CACHE');
        if (path.resolve(primary).toLowerCase() !== mainLocalCache.toLowerCase()) {
            list.push(mainLocalCache);
        }
    }
    return list;
}

function isLocalWorkerAliveQuick() {
    if (runtimeState.localWorkerPid) {
        try {
            process.kill(runtimeState.localWorkerPid, 0);
            return true;
        } catch (e) {
            runtimeState.localWorkerProcess = null;
            runtimeState.localWorkerPid = null;
        }
    }
    try {
        const localStatus = path.join(getLocalSyncCacheDir(), 'worker_status.json');
        if (fs.existsSync(localStatus)) {
            const data = fs.readJsonSync(localStatus);
            const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
            if (diff < 20 && data.workerId && data.workerId.includes('local_worker')) {
                return true;
            }
        }
    } catch (e) {}
    return false;
}

let cachedCentralCacheDir = { time: 0, dir: null };

function getCentralCacheDir() {
    // 0. If a Local Worker is active on this machine, ALWAYS use local cache dir
    if (isLocalWorkerAliveQuick() || runtimeState.localWorkerPid) {
        return getLocalSyncCacheDir();
    }

    const now = Date.now();
    if (cachedCentralCacheDir.dir && (now - cachedCentralCacheDir.time < 15000)) {
        return cachedCentralCacheDir.dir;
    }

    const setAndReturn = (d) => {
        cachedCentralCacheDir = { time: now, dir: d };
        return d;
    };

    // 0.1 Recent local_worker heartbeat (< 45s)
    try {
        const localStatus = path.join(getLocalSyncCacheDir(), 'worker_status.json');
        if (fs.existsSync(localStatus)) {
            const data = fs.readJsonSync(localStatus);
            const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
            if (diff < 45 && data.workerId && data.workerId.includes('local_worker')) {
                return setAndReturn(getLocalSyncCacheDir());
            }
        }
    } catch (e) {}

    // 0.2 External/remote machine -> local cache dir
    if (global.isExternalMachine || runtimeState.cachedEnvState?.isExternalMachine) {
        return setAndReturn(getLocalSyncCacheDir());
    }

    // 1. Z:/_SYNC_CACHE active central worker heartbeat (< 45s)
    try {
        const zStatus = path.join('Z:/_SYNC_CACHE', 'worker_status.json');
        if (fs.existsSync(zStatus)) {
            const data = fs.readJsonSync(zStatus);
            const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
            if (diff < 45 && !data.workerId?.includes('local_worker')) return setAndReturn('Z:/_SYNC_CACHE');
        }
    } catch (e) {}

    // 2. UNC_CACHE active heartbeat (< 45s)
    try {
        const uncStatus = path.join(UNC_CACHE, 'worker_status.json');
        if (fs.existsSync(uncStatus)) {
            const data = fs.readJsonSync(uncStatus);
            const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
            if (diff < 45) return setAndReturn(UNC_CACHE);
        }
    } catch (e) {}

    // 3. If Z: is a local subst (dev VM) and UNC_CACHE exists, prefer UNC_CACHE
    try {
        if (fs.existsSync(UNC_CACHE)) {
            const substOut = execSync('subst', { encoding: 'utf8', timeout: 500 });
            if (/Z:\\: =>/i.test(substOut)) {
                return setAndReturn(UNC_CACHE);
            }
        }
    } catch (e) {}

    // 4. Standard Z:/_SYNC_CACHE
    if (fs.existsSync('Z:/_SYNC_CACHE')) {
        return setAndReturn('Z:/_SYNC_CACHE');
    }

    // 5. UNC_CACHE fallback
    if (fs.existsSync(UNC_CACHE)) {
        return setAndReturn(UNC_CACHE);
    }

    // 6. Local app cache fallback
    return setAndReturn(getLocalSyncCacheDir());
}

function getOrdersDir() {
    return path.join(getCentralCacheDir(), 'requests');
}

function getAllOrdersCandidateDirs() {
    const primaryDir = getOrdersDir();
    const dirs = [primaryDir];
    const localDir = path.join(getLocalSyncCacheDir(), 'requests');
    if (path.resolve(primaryDir).toLowerCase() !== path.resolve(localDir).toLowerCase()) {
        dirs.push(localDir);
    }
    const zDir = 'Z:/_SYNC_CACHE/requests';
    if (fs.existsSync(zDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(zDir).toLowerCase())) {
        dirs.push(zDir);
    }
    const sDir = 'S:/_SYNC_CACHE/requests';
    if (fs.existsSync(sDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(sDir).toLowerCase())) {
        dirs.push(sDir);
    }
    const uncDir = path.join(UNC_CACHE, 'requests');
    try {
        if (fs.existsSync(uncDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(uncDir).toLowerCase())) {
            dirs.push(uncDir);
        }
    } catch(e) {}
    return dirs;
}

function writeOrderFileAtomic(finalPath, jsonStr) {
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(finalPath, '.json');
    const tmpPath = path.join(dir, `${base}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`);
    fs.writeFileSync(tmpPath, jsonStr, 'utf8');
    try {
        fs.renameSync(tmpPath, finalPath);
    } catch (renErr) {
        fs.writeFileSync(finalPath, jsonStr, 'utf8');
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (e) {}
    }
}

function safeParseOrderJson(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') return null;
    try {
        return JSON.parse(rawContent);
    } catch (e) {
        // Auto-reparación tolerante ante cola truncada/corrupta por SMB (e.g. '}completedAt":...')
        const candidates = [
            rawContent.indexOf('}\n'),
            rawContent.indexOf('}\r\n'),
            rawContent.lastIndexOf('}')
        ].filter(i => i > 0);
        for (const cut of candidates) {
            try {
                return JSON.parse(rawContent.slice(0, cut + 1));
            } catch (e2) {}
        }
        return null;
    }
}

function saveOrderInCandidateDirs(orderId, orderData) {
    const candidateDirs = getAllOrdersCandidateDirs();
    const jsonStr = JSON.stringify(orderData, null, 2);
    let primaryFile = null;
    for (const dir of candidateDirs) {
        try {
            const p = path.join(dir, `${orderId}.json`);
            writeOrderFileAtomic(p, jsonStr);
            ordersFileMemoryCache.delete(p);
            if (!primaryFile) primaryFile = p;
        } catch (e) {}
    }
    ordersResponseCache.time = 0;
    return primaryFile || path.join(getOrdersDir(), `${orderId}.json`);
}

function getServerUncRoot() {
    try {
        const cfgFile = path.join(APP_ROOT, 'config/settings.json');
        if (fs.existsSync(cfgFile)) {
            const cfg = fs.readJsonSync(cfgFile);
            if (cfg.centralServerUnc) return cfg.centralServerUnc.replace(/\\/g, '/').replace(/\/+$/, '');
        }
    } catch (e) {}

    if (process.env.PIPETA_SERVER_UNC) {
        return process.env.PIPETA_SERVER_UNC.replace(/\\/g, '/').replace(/\/+$/, '');
    }

    if (fs.existsSync('S:/INTERNO')) {
        return 'S:';
    }

    return '//192.168.206.116/Z';
}

function ensureServerUncAccess(uncPath = null) {
    if (global.isExternalMachine) return false;
    const root = (uncPath || getServerUncRoot()).replace(/\//g, '\\');
    try {
        if (fs.existsSync(root)) return true;
    } catch (e) {}
    try {
        execSync(`net use "${root}" /persistent:no`, { encoding: 'utf8', timeout: 3000, windowsHide: true });
        if (fs.existsSync(root)) return true;
    } catch (e) {}
    try {
        execSync(`net use "${root}" "Laspadmin.321" /user:"nonstop.tv\\lasp-mpastorino" /persistent:no`, { encoding: 'utf8', timeout: 4000, windowsHide: true });
        return fs.existsSync(root);
    } catch (e) {
        return false;
    }
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0) + ' ' + units[i];
}

function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024));
    return (bytesPerSec / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function getDirectoryFilesAndSize(dirPath) {
    const files = [];
    let totalBytes = 0;
    function walk(currentDir, relPrefix = '') {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const lowerName = entry.name.toLowerCase();
                if (lowerName === 'thumbs.db' || lowerName === 'desktop.ini' || lowerName === '.ds_store' || lowerName.endsWith('.tmp')) {
                    continue;
                }
                const fullEntryPath = path.join(currentDir, entry.name).replace(/\\/g, '/');
                const relEntryPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    walk(fullEntryPath, relEntryPath);
                } else if (entry.isFile()) {
                    try {
                        const st = fs.statSync(fullEntryPath);
                        files.push({ fullPath: fullEntryPath, relPath: relEntryPath, size: st.size, mtimeMs: st.mtimeMs });
                        totalBytes += st.size;
                    } catch (e) {
                        files.push({ fullPath: fullEntryPath, relPath: relEntryPath, size: 0, mtimeMs: 0 });
                    }
                }
            }
        } catch (e) {}
    }
    walk(dirPath);
    return { files, totalBytes };
}

module.exports = {
    getLocalSyncCacheDir,
    getReadSyncCacheCandidateDirs,
    isLocalWorkerAliveQuick,
    UNC_CACHE,
    getCentralCacheDir,
    getOrdersDir,
    getAllOrdersCandidateDirs,
    writeOrderFileAtomic,
    safeParseOrderJson,
    saveOrderInCandidateDirs,
    getServerUncRoot,
    ensureServerUncAccess,
    formatBytes,
    formatSpeed,
    getDirectoryFilesAndSize,
    serverDirCache,
    rcloneDirCache,
    SERVER_CACHE_TTL,
    RCLONE_CACHE_TTL,
    dirSizeMemoryCache,
    ordersFileMemoryCache,
    ordersResponseCache
};
