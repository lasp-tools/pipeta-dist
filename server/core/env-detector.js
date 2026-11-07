const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { spawn, execSync } = require('child_process');
const {
    VERSION,
    CHANNEL,
    IS_BETA,
    APP_ROOT,
    LOCAL_APP_DIR,
    NETWORK_APP_DIR,
    PROD_STUDIO_DIR,
    UPDATER_BAT,
    UPDATING_FLAG_FILE,
    ENV_STATE_FILE,
    runtimeState
} = require('./app-context');
const { rcloneAvailable, rcloneVersion } = require('./rclone');
const { getLocalSyncCacheDir, getReadSyncCacheCandidateDirs } = require('./sync-paths');

const PIPETA_SERVER_TOKEN = 'lasp-pipeta-sec-token-2026';

// Seed activeRamonUser from last_ramon_user.json on startup
try {
    for (const cacheDir of getReadSyncCacheCandidateDirs()) {
        const lastUserFile = path.join(cacheDir, 'last_ramon_user.json');
        if (fs.existsSync(lastUserFile)) {
            const uData = fs.readJsonSync(lastUserFile);
            if (uData && uData.user) {
                runtimeState.activeRamonUser = String(uData.user).trim();
                break;
            }
        }
    }
} catch (e) {}

// Fast Studio Network Detection (synchronous, 0ms LAN check)
function detectStudioNetworkSync() {
    let isStudioLAN = false;
    try {
        const ifaces = os.networkInterfaces();
        for (const name of Object.keys(ifaces)) {
            for (const iface of ifaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    if (iface.address.startsWith('192.168.206.')) {
                        isStudioLAN = true;
                        break;
                    }
                }
            }
            if (isStudioLAN) break;
        }
    } catch (e) {}
    const hasZ = fs.existsSync('Z:\\');
    global.isExternalMachine = !isStudioLAN;
    global.hasZDrive = hasZ;
    console.log(`[ENV FAST-DETECT] Red de Estudio = ${isStudioLAN ? 'SI (LAN Munro)' : 'NO (Freelance/Casa)'} | Externo = ${global.isExternalMachine ? 'SI' : 'NO'} | Disco Z = ${hasZ ? 'MONTAJE OK' : 'NO DISPONIBLE'}`);
    return { isStudioLAN, isExternalMachine: global.isExternalMachine, hasZ };
}

// Initial immediate detection of Z: (Real vs Virtual Subst)
try {
    const substCheck = execSync('subst', { encoding: 'utf8', timeout: 1500 });
    global.isZRealServer = !(/Z:\\: =>/i.test(substCheck));
} catch (e) {
    global.isZRealServer = true;
}

// Cached Environment & Persistent Internet Detection
let cachedEnvState = null;
let locationMode = 'auto'; // 'auto' | 'studio' | 'home'

try {
    if (fs.existsSync(ENV_STATE_FILE)) {
        cachedEnvState = fs.readJsonSync(ENV_STATE_FILE);
        runtimeState.cachedEnvState = cachedEnvState;
        if (cachedEnvState && cachedEnvState.locationMode) {
            locationMode = cachedEnvState.locationMode;
        }
        if (locationMode === 'studio') {
            global.isExternalMachine = false;
            global.isStudioNetworkDetected = true;
        } else if (locationMode === 'home') {
            global.isExternalMachine = true;
            global.isStudioNetworkDetected = false;
        } else if (cachedEnvState && typeof cachedEnvState.isExternalMachine === 'boolean') {
            global.isExternalMachine = cachedEnvState.isExternalMachine;
        }
        if (cachedEnvState && typeof cachedEnvState.zInfo === 'object') {
            global.isZRealServer = cachedEnvState.zInfo.isRealServer !== false;
            global.zInfo = cachedEnvState.zInfo;
        }
        console.log(`[ENV CACHE] Estado cargado de disco: Internet = ${cachedEnvState?.hasInternet ? 'ONLINE' : 'OFFLINE'} | Perfil = ${locationMode} | Externo = ${global.isExternalMachine ? 'SI' : 'NO'}`);
    }
} catch (e) {}
global.locationMode = locationMode;

function getCachedEnvState() {
    return cachedEnvState;
}

function getLocationMode() {
    return global.locationMode || locationMode || 'auto';
}

function setLocationMode(mode) {
    locationMode = mode;
    global.locationMode = mode;
}

async function runEnvironmentDetection() {
    const https = require('https');
    let hasInternet = false;
    try {
        const probeHttps = (probeUrl) => new Promise((resolve, reject) => {
            const req = https.get(probeUrl, { timeout: 3000 }, (res) => {
                res.destroy();
                if (res.statusCode >= 200 && res.statusCode < 500) resolve(true);
                else reject(new Error('bad status'));
            });
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            req.on('error', (err) => { req.destroy(); reject(err); });
        });
        hasInternet = await Promise.any([
            probeHttps('https://1.1.1.1/cdn-cgi/trace'),
            probeHttps('https://www.gstatic.com/generate_204')
        ]);
    } catch (e) {
        hasInternet = false;
    }

    const hasDriveG = fs.existsSync('G:/Unidades compartidas') || fs.existsSync('G:/');
    const hasSyncCache = fs.existsSync('Z:/_SYNC_CACHE') || getReadSyncCacheCandidateDirs().some(d => fs.existsSync(d));

    let zInfo = { isRealServer: true, type: 'network', target: 'Servidor Central SMB' };

    try {
        const substOut = execSync('subst', { encoding: 'utf8', timeout: 1500 });
        const match = substOut.match(/Z:\\: => ([^\r\n]+)/i);
        if (match) {
            zInfo = { isRealServer: false, type: 'subst', target: match[1].trim() };
        }
    } catch (e) {}

    if (zInfo.isRealServer) {
        try {
            const netOut = execSync('cmd.exe /c "net use z:"', { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] });
            const m = netOut.match(/(?:Nombre remoto|Remote name)\s+([^\r\n]+)/i);
            if (m) {
                zInfo = { isRealServer: true, type: 'network', target: m[1].trim() };
            }
        } catch (e) {
            if (fs.existsSync('Z:/')) {
                zInfo = { isRealServer: true, type: 'network', target: 'Servidor Central' };
            }
        }
    }

    let isStudioNetwork = false;
    let ramonHost = null;
    try {
        const ramonCacheFile = path.join(os.tmpdir ? os.tmpdir() : (process.env.TEMP || 'C:\\Windows\\Temp'), 'pipeta_ramon_host.txt');
        if (fs.existsSync(ramonCacheFile)) {
            ramonHost = fs.readFileSync(ramonCacheFile, 'utf8').trim();
        }
    } catch (e) {}

    const net = require('net');
    try {
        isStudioNetwork = await new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(400);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });
            socket.connect(80, '192.168.206.140');
        });
    } catch (e) {
        isStudioNetwork = false;
    }

    const isRemoteRamon = !!(ramonHost && (ramonHost.includes('8075') || ramonHost.includes('https://')));

    const activeLocationMode = global.locationMode || locationMode || 'auto';
    let isExternalMachine = !isStudioNetwork || isRemoteRamon;
    if (activeLocationMode === 'studio') {
        isExternalMachine = false;
        isStudioNetwork = true;
    } else if (activeLocationMode === 'home') {
        isExternalMachine = true;
        isStudioNetwork = false;
    }

    // Keep global.* synchronized for sync_catalog_generator.js & sync_worker.js
    global.isExternalMachine = isExternalMachine;
    global.isStudioNetworkDetected = isStudioNetwork;
    global.isZRealServer = !!zInfo.isRealServer;
    global.zInfo = zInfo;

    let recommendedMode = 'offline_catalog';
    if (hasInternet) {
        recommendedMode = hasDriveG ? 'online_gdrive' : 'online_rclone';
    }

    cachedEnvState = {
        success: true,
        hasInternet,
        hasDriveG,
        hasSyncCache,
        isStudioNetwork,
        isExternalMachine,
        locationMode: activeLocationMode,
        ramonHost,
        recommendedMode,
        zInfo,
        rcloneAvailable,
        rcloneVersion,
        detectedAt: new Date().toISOString()
    };
    runtimeState.cachedEnvState = cachedEnvState;

    try {
        fs.ensureDirSync(path.dirname(ENV_STATE_FILE));
        fs.writeJsonSync(ENV_STATE_FILE, cachedEnvState, { spaces: 2 });
        console.log(`[ENV DETECT] Estado persistido en ${ENV_STATE_FILE}: Internet = ${hasInternet ? 'ONLINE' : 'OFFLINE'}, Red Estudio = ${isStudioNetwork ? 'SÍ' : 'NO (Remoto/Externo)'}, Perfil = ${activeLocationMode.toUpperCase()}, Z = ${zInfo.isRealServer ? 'Servidor Real' : 'Local/Subst'}`);
    } catch (e) {}

    return cachedEnvState;
}

function checkInternetQuickly() {
    if (cachedEnvState && typeof cachedEnvState.hasInternet === 'boolean') {
        return cachedEnvState.hasInternet;
    }
    return false;
}

function getAllLocalIps() {
    const out = [];
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
            }
        }
    } catch (e) {}
    return out;
}

function getPrimaryLocalIpLegacy() {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    if (iface.address.startsWith('192.168.')) {
                        return iface.address;
                    }
                }
            }
        }
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
    } catch (e) {}
    return '127.0.0.1';
}

function getPrimaryLocalIp() {
    const ips = getAllLocalIps();
    const pick = ips.find(a => a.startsWith('192.168.206.'))
        || ips.find(a => a.startsWith('192.168.106.'))
        || ips.find(a => a.startsWith('192.168.'))
        || ips[0];
    if (pick) return pick;
    return getPrimaryLocalIpLegacy();
}

function getSedeFromIp(ip) {
    if (!ip) return 'Remoto';
    if (ip.startsWith('192.168.206.') || ip.startsWith('192.168.200.')) return 'Munro';
    if (ip.startsWith('192.168.106.')) return 'Nonstop';
    return 'Remoto';
}

function getPipetaServerCandidateUrls() {
    const list = [];
    if (!global.isExternalMachine) {
        list.push('http://192.168.206.121:3005');
        if (process.env.PIPETA_SERVER_URL) {
            list.push(process.env.PIPETA_SERVER_URL);
        }
        return [...new Set(list)];
    }
    if (process.env.PIPETA_SERVER_URL) {
        list.push(process.env.PIPETA_SERVER_URL);
    }
    list.push('https://piano-exclusively-function-michael.trycloudflare.com');
    list.push('https://pipeta.lasp.co');
    return [...new Set(list)];
}

function executeRemoteUpdate() {
    if (runtimeState.isRemoteUpdating) return;
    runtimeState.isRemoteUpdating = true;
    console.log(`[PIPETA REMOTE UPDATE] 🚨 Solicitud de actualización remota recibida (${CHANNEL}). Ejecutando Handoff Updater...`);
    try {
        const candidates = [
            path.join(NETWORK_APP_DIR, UPDATER_BAT),
            path.join(PROD_STUDIO_DIR, UPDATER_BAT),
            path.join(APP_ROOT, UPDATER_BAT),
            path.join(LOCAL_APP_DIR, UPDATER_BAT)
        ];
        const targetBat = candidates.find(p => {
            try { return fs.existsSync(p); } catch (e) { return false; }
        });
        if (targetBat) {
            try { fs.writeFileSync(UPDATING_FLAG_FILE, new Date().toISOString(), 'utf8'); } catch (e) {}
            const handoffPath = path.join(os.tmpdir(), IS_BETA ? 'pipeta_beta_remote_handoff.bat' : 'pipeta_remote_handoff.bat');
            const tmpUpdater = path.join(os.tmpdir(), IS_BETA ? 'pipeta_beta_remote_updater_exec.bat' : 'pipeta_remote_updater_exec.bat');
            try { fs.copyFileSync(targetBat, tmpUpdater); } catch (e) {}
            const runnerToCall = fs.existsSync(tmpUpdater) ? tmpUpdater : targetBat;
            const batContent = [
                '@echo off',
                'timeout /t 2 /nobreak >nul',
                `call "${runnerToCall}" --unattended "${LOCAL_APP_DIR}"`,
                `if exist "${UPDATING_FLAG_FILE}" del /f /q "${UPDATING_FLAG_FILE}" >nul 2>&1`,
                'exit'
            ].join('\r\n');
            fs.writeFileSync(handoffPath, batContent, 'ascii');
            const child = spawn('cmd.exe', ['/c', 'start', '""', '/min', handoffPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();
            setTimeout(() => {
                process.exit(0);
            }, 800);
        } else {
            runtimeState.isRemoteUpdating = false;
            console.error(`[PIPETA REMOTE UPDATE ERROR] No se encontró ${UPDATER_BAT}`);
        }
    } catch (err) {
        runtimeState.isRemoteUpdating = false;
        console.error('[PIPETA REMOTE UPDATE ERROR]', err);
    }
}

let configSyncInFlight = null;

async function syncConfigsFromMasterNetwork(options = {}) {
    const force = !!(options && options.force);
    if (!force && runtimeState.lastConfigSyncTimestamp > 0 && (Date.now() - runtimeState.lastConfigSyncTimestamp < 15000)) {
        return true;
    }
    if (configSyncInFlight) {
        return configSyncInFlight;
    }

    configSyncInFlight = (async () => {
        try {
            console.log('[CONFIG SYNC] ⚙️ Sincronizando presets, proyectos y permisos desde el servidor maestro...');
            const localPresets = path.join(APP_ROOT, 'presets');
            await fs.ensureDir(localPresets);

            let bundleDownloaded = false;
            const timeoutMs = global.isExternalMachine ? 4000 : 2000;

            // 1. Try HTTP bundle from Pipeta Server
            for (const baseUrl of getPipetaServerCandidateUrls()) {
                const url = `${baseUrl.replace(/\/+$/, '')}/api/server/presets/bundle`;
                try {
                    const resp = await fetch(url, {
                        headers: { 'x-pipeta-token': PIPETA_SERVER_TOKEN },
                        signal: AbortSignal.timeout(timeoutMs)
                    });
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && data.success && data.bundle) {
                            const b = data.bundle;
                            try {
                                await fs.ensureDir(localPresets);
                                if (b['pipeline_config.json']) await fs.writeJson(path.join(localPresets, 'pipeline_config.json'), b['pipeline_config.json'], { spaces: 2 });
                                if (b['status_config.json']) await fs.writeJson(path.join(localPresets, 'status_config.json'), b['status_config.json'], { spaces: 2 });
                                if (b['users_config.json']) {
                                    const targetUsersFile = path.join(localPresets, 'users_config.json');
                                    const existingCfg = (await fs.pathExists(targetUsersFile)) ? await fs.readJson(targetUsersFile) : { users: [], activeUser: '' };
                                    const existingUsers = Array.isArray(existingCfg.users) ? existingCfg.users : [];
                                    const serverUsers = Array.isArray(b['users_config.json'].users) ? b['users_config.json'].users : [];
                                    const merged = { ...b['users_config.json'] };
                                    
                                    const mergedMap = new Map();
                                    for (const su of serverUsers) {
                                        const key = String(su.laspUser || su.username || su.id || '').toLowerCase();
                                        if (key) mergedMap.set(key, { ...su });
                                    }
                                    for (const lu of existingUsers) {
                                        const key = String(lu.laspUser || lu.username || lu.id || '').toLowerCase();
                                        if (mergedMap.has(key)) {
                                            const su = mergedMap.get(key);
                                            mergedMap.set(key, {
                                                ...su,
                                                ...lu,
                                                role: su.role || lu.role,
                                                assignedProjects: su.assignedProjects || lu.assignedProjects || [],
                                                permissionOverrides: su.permissionOverrides || lu.permissionOverrides || {},
                                                maxConcurrentDownloadsOverride: su.maxConcurrentDownloadsOverride !== undefined
                                                    ? su.maxConcurrentDownloadsOverride
                                                    : lu.maxConcurrentDownloadsOverride
                                            });
                                        } else {
                                            mergedMap.set(key, { ...lu });
                                        }
                                    }
                                    merged.users = Array.from(mergedMap.values());
                                    merged.activeUser = existingCfg.activeUser || b['users_config.json'].activeUser || '';
                                    await fs.writeJson(targetUsersFile, merged, { spaces: 2 });
                                }
                                if (b['Projects']) {
                                    const ptd = path.join(localPresets, 'Projects');
                                    await fs.ensureDir(ptd);
                                    for (const [pfn, pcontent] of Object.entries(b['Projects'])) {
                                        await fs.writeJson(path.join(ptd, pfn), pcontent, { spaces: 2 });
                                    }
                                }
                            } catch (dErr) {}
                            bundleDownloaded = true;
                            if (url.startsWith('https://') && cachedEnvState) {
                                cachedEnvState.hasInternet = true;
                            }
                            console.log(`[CONFIG SYNC] ✅ Configuraciones maestras sincronizadas por HTTP desde ${url}`);
                            break;
                        }
                    }
                } catch (httpErr) {}
            }

            // 2. Fallback via Robocopy from S:/Z: in LAN
            // If IS_BETA: read master presets from Beta's NETWORK_APP_DIR / PROD_STUDIO_DIR first;
            // fall back to Main Pipeta/presets ONLY as a read-only seed if Beta presets don't exist yet,
            // and NEVER overwrite Main C:\TOOLS\APPS\Pipeta!
            if (!bundleDownloaded && !global.isExternalMachine) {
                const appFolderName = IS_BETA ? 'Pipeta_Beta' : 'Pipeta';
                const primaryMasterDirs = [
                    path.join(PROD_STUDIO_DIR, 'presets'),
                    path.join(NETWORK_APP_DIR, 'presets'),
                    `\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\${appFolderName}\\presets`
                ];

                let foundMaster = null;
                let isReadOnlySeed = false;

                for (const d of primaryMasterDirs) {
                    if (await fs.pathExists(path.join(d, 'users_config.json'))) {
                        foundMaster = d;
                        break;
                    }
                }

                if (!foundMaster && IS_BETA && !(await fs.pathExists(path.join(localPresets, 'users_config.json')))) {
                    const seedDirs = [
                        'S:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets',
                        'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets',
                        '\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets'
                    ];
                    for (const sd of seedDirs) {
                        if (await fs.pathExists(path.join(sd, 'users_config.json'))) {
                            foundMaster = sd;
                            isReadOnlySeed = true;
                            break;
                        }
                    }
                }

                const normLocal = path.resolve(localPresets).toLowerCase();
                const isMainPipetaTarget = normLocal.includes('c:\\tools\\apps\\pipeta') && !normLocal.includes('pipeta_beta');
                const safeTarget = !(IS_BETA && isMainPipetaTarget);

                if (foundMaster && safeTarget && path.resolve(foundMaster).toLowerCase() !== normLocal) {
                    try {
                        const roboFlags = isReadOnlySeed ? '/E /XO /XN /XC' : '/MIR';
                        execSync(`robocopy "${foundMaster}" "${localPresets}" ${roboFlags} /R:1 /W:1 /NFL /NDL /NJH /NJS`, { timeout: 15000 });
                        console.log(`[CONFIG SYNC] ✅ Presets actualizados desde ${foundMaster}${isReadOnlySeed ? ' (seed inicial)' : ''}`);
                    } catch (e) {}
                }
            }

            runtimeState.lastConfigSyncTimestamp = Date.now();
            return true;
        } finally {
            configSyncInFlight = null;
        }
    })();

    return configSyncInFlight;
}

async function sendClientTelemetryPing() {
    try {
        const hostname = os.hostname() || process.env.COMPUTERNAME || 'unknown';
        const ip = getPrimaryLocalIp();
        const windowsUser = process.env.USERNAME || (os.userInfo && os.userInfo().username) || '';
        const sede = getSedeFromIp(ip);

        const payload = {
            hostname,
            ip,
            version: VERSION,
            channel: CHANNEL,
            user: runtimeState.activeRamonUser || '',
            ramonUser: runtimeState.activeRamonUser || '',
            windowsUser,
            osUser: windowsUser,
            sede,
            uptime: Math.round(process.uptime()),
            lastConfigSync: runtimeState.lastConfigSyncTimestamp,
            ips: getAllLocalIps(),
            pid: process.pid,
            source: IS_BETA ? 'client_ping_beta' : 'client_ping'
        };

        let httpSuccess = false;
        for (const baseUrl of getPipetaServerCandidateUrls()) {
            const url = `${baseUrl.replace(/\/+$/, '')}/api/server/telemetry/client-ping`;
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-pipeta-token': PIPETA_SERVER_TOKEN
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(3500)
                });
                if (resp.ok) {
                    httpSuccess = true;
                    try {
                        const data = await resp.json();
                        if (data && (data.command === 'update' || data.command === 'reinstall')) {
                            if (!IS_BETA || data.channel === 'beta') {
                                console.log(`[PIPETA TELEMETRY] Orden de actualización remota recibida desde ${url}`);
                                executeRemoteUpdate();
                            }
                        } else if (data && data.command === 'sync_config') {
                            syncConfigsFromMasterNetwork().then(() => {
                                setTimeout(() => {
                                    sendClientTelemetryPing().catch(() => {});
                                }, 800);
                            });
                        }
                    } catch (e) {}
                    break;
                }
            } catch (httpErr) {}
        }

        // Check network update flag (channel-isolated)
        try {
            const flagDirs = ['Z:/_SYNC_CACHE/flags', '//192.168.206.116/Z/_SYNC_CACHE/flags'];
            const flagFile = IS_BETA
                ? `update_beta_${hostname.toLowerCase()}.flag`
                : `update_${hostname.toLowerCase()}.flag`;
            for (const fd of flagDirs) {
                const fPath = path.join(fd, flagFile);
                if (fs.existsSync(fPath)) {
                    try { fs.removeSync(fPath); } catch (e) {}
                    executeRemoteUpdate();
                    break;
                }
            }
        } catch (e) {}

        // Resilient shared network folder fallback if HTTP fails
        if (!httpSuccess) {
            try {
                const fileName = IS_BETA ? `client_beta_${hostname}.json` : `client_${hostname}.json`;
                const netDirs = [
                    'Z:/_SYNC_CACHE/clients',
                    '//192.168.206.116/Z/_SYNC_CACHE/clients'
                ];
                for (const dir of netDirs) {
                    try {
                        fs.ensureDirSync(dir);
                        fs.writeJsonSync(path.join(dir, fileName), payload, { spaces: 2 });
                        break;
                    } catch (dErr) {}
                }
            } catch (diskErr) {}
        }
    } catch (err) {}
}

module.exports = {
    detectStudioNetworkSync,
    runEnvironmentDetection,
    checkInternetQuickly,
    getCachedEnvState,
    getLocationMode,
    setLocationMode,
    getAllLocalIps,
    getPrimaryLocalIp,
    getPrimaryLocalIpLegacy,
    getSedeFromIp,
    PIPETA_SERVER_TOKEN,
    getPipetaServerCandidateUrls,
    syncConfigsFromMasterNetwork,
    sendClientTelemetryPing,
    executeRemoteUpdate
};
