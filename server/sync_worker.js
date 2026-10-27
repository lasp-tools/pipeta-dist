const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const catalogGenerator = require('./sync_catalog_generator');

process.on('uncaughtException', (err) => {
    try {
        const timestamp = new Date().toLocaleTimeString('es-ES', { hour12: false });
        console.error(`[${timestamp}] [WORKER ERROR] Excepción no capturada:`, err?.message || err, err?.stack || '');
    } catch(e) {}
});

process.on('unhandledRejection', (reason, promise) => {
    try {
        const timestamp = new Date().toLocaleTimeString('es-ES', { hour12: false });
        console.error(`[${timestamp}] [WORKER WARN] Rechazo de promesa no manejado:`, reason);
    } catch(e) {}
});

const isLocalMode = process.argv.includes('--local') || process.env.PIPETA_LOCAL_WORKER === '1';

const UNC_CACHE = '//192.168.206.116/Z/_SYNC_CACHE';
const CACHE_ROOT = isLocalMode 
    ? path.join(__dirname, '../_SYNC_CACHE')
    : (fs.existsSync('Z:/_SYNC_CACHE') 
        ? 'Z:/_SYNC_CACHE' 
        : (fs.existsSync(UNC_CACHE) ? UNC_CACHE : path.join(__dirname, '../_SYNC_CACHE')));

const ORDERS_DIR = path.join(CACHE_ROOT, 'requests');
const STATUS_FILE = path.join(CACHE_ROOT, 'worker_status.json');
const TRIGGER_FILE = path.join(CACHE_ROOT, 'catalog_refresh_trigger.json');

function findRcloneExe() {
    const candidates = [
        path.join(__dirname, '../tools/rclone/rclone.exe'),
        'C:/TOOLS/APPS/Pipeta/tools/rclone/rclone.exe',
        'Z:/INTERNO/TOOLS/Instaladores/rclone/rclone.exe',
        'C:/Program Files/rclone/rclone.exe'
    ];
    for (const c of candidates) {
        if (c && fs.existsSync(c)) return c.replace(/\\/g, '/');
    }
    return 'rclone';
}

function findRcloneConf() {
    const candidates = [
        path.join(__dirname, '../tools/rclone/rclone.conf'),
        'C:/TOOLS/APPS/Pipeta/tools/rclone/rclone.conf',
        'Z:/INTERNO/TOOLS/Instaladores/rclone.conf',
        '//192.168.206.116/Z/INTERNO/TOOLS/Instaladores/rclone.conf',
        path.join(process.env.APPDATA || '', 'rclone/rclone.conf'),
        path.join(os.homedir(), '.config/rclone/rclone.conf'),
        path.join(os.homedir(), 'rclone.conf')
    ];
    for (const c of candidates) {
        if (c && fs.existsSync(c)) return c.replace(/\\/g, '/');
    }
    return null;
}

function getCandidateOrdersDirs() {
    const dirs = [];
    if (ORDERS_DIR) dirs.push(ORDERS_DIR);
    const localDir = path.join(__dirname, '../_SYNC_CACHE/requests');
    if (!dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(localDir).toLowerCase()) && fs.existsSync(localDir)) {
        dirs.push(localDir);
    }

    const zDir = 'Z:/_SYNC_CACHE/requests';
    if (!dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(zDir).toLowerCase()) && fs.existsSync(zDir)) {
        dirs.push(zDir);
    }
    const uncDir = '//192.168.206.116/Z/_SYNC_CACHE/requests';
    if (!dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(uncDir).toLowerCase()) && fs.existsSync(uncDir)) {
        dirs.push(uncDir);
    }
    return dirs;
}

function saveOrderDataAcrossCandidates(orderData, primaryFilePath = null) {
    if (!orderData || !orderData.id) return;
    const fname = `${orderData.id}.json`;
    const dirs = getCandidateOrdersDirs();
    for (const d of dirs) {
        try {
            if (!fs.existsSync(d)) fs.ensureDirSync(d);
            const p = path.join(d, fname);
            fs.writeJsonSync(p, orderData, { spaces: 2 });
        } catch (e) {}
    }
    if (primaryFilePath) {
        try {
            fs.writeJsonSync(primaryFilePath, orderData, { spaces: 2 });
        } catch (e) {}
    }
}

const RCLONE_EXE = findRcloneExe();
const RCLONE_CONF = findRcloneConf();

const WORKER_ID = `${isLocalMode ? 'local_worker' : 'worker'}_${os.hostname()}_${process.pid}`;
let isProcessing = false;
let currentOrder = null;
let teamDrivesMap = null;
let activeRcloneProc = null;

// Pool de Concurrencia y Carril Rápido (Fast-Lane)
const activeTransfers = new Map(); // orderId -> { id, user, type, startedAt }
const activeFastTasks = new Set(); // orderId de refresh_folder / query_higgsfield_job
const activeRcloneProcs = new Map(); // orderId -> ChildProcess
const MAX_WORKER_CONCURRENT_TRANSFERS = 4;
const MAX_FAST_CONCURRENT_TASKS = 4;

let cachedUsersConfig = null;
let cachedUsersConfigTime = 0;

function loadWorkerUsersConfig() {
    const now = Date.now();
    if (cachedUsersConfig && (now - cachedUsersConfigTime < 5000)) {
        return cachedUsersConfig;
    }
    const candidates = [
        path.join(CACHE_ROOT, 'users_config.json'),
        'Z:/_SYNC_CACHE/users_config.json',
        'Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/presets/users_config.json',
        path.join(__dirname, '../presets/users_config.json')
    ];
    for (const p of candidates) {
        try {
            if (p && fs.existsSync(p)) {
                cachedUsersConfig = fs.readJsonSync(p);
                cachedUsersConfigTime = now;
                return cachedUsersConfig;
            }
        } catch (e) {}
    }
    return cachedUsersConfig || { roles: [], users: [] };
}

function getUserMaxConcurrentTransfers(username) {
    try {
        const cfg = loadWorkerUsersConfig();
        const rawUser = String(username || '').trim().toLowerCase();
        const cleanUser = rawUser.replace(/^lasp-/, '');
        const users = Array.isArray(cfg.users) ? cfg.users : [];
        const roles = Array.isArray(cfg.roles) ? cfg.roles : [];

        const userObj = users.find(u => {
            const uLasp = String(u.laspUser || '').trim().toLowerCase();
            const uName = String(u.username || '').trim().toLowerCase();
            const uId = String(u.id || '').trim().toLowerCase();
            return (rawUser && (uLasp === rawUser || uName === rawUser || uId === rawUser || uLasp === `lasp-${cleanUser}`));
        });

        // 1. Override específico por usuario
        if (userObj && userObj.maxConcurrentDownloadsOverride !== undefined && userObj.maxConcurrentDownloadsOverride !== null && userObj.maxConcurrentDownloadsOverride !== '' && userObj.maxConcurrentDownloadsOverride !== 'inherit') {
            const ov = parseInt(userObj.maxConcurrentDownloadsOverride, 10);
            if (Number.isFinite(ov) && ov >= 1) {
                return Math.min(6, Math.max(1, ov));
            }
        }

        // 2. Límite configurado en el Rol del usuario
        const roleId = (userObj && userObj.role) ? userObj.role : (cfg.defaultRamonRole || 'user');
        const roleObj = roles.find(r => r.id === roleId);
        if (roleObj && Number.isFinite(Number(roleObj.maxConcurrentDownloads)) && Number(roleObj.maxConcurrentDownloads) >= 1) {
            return Math.min(6, Math.max(1, parseInt(roleObj.maxConcurrentDownloads, 10)));
        }

        // 3. Fallback por defecto según jerarquía de rol
        if (roleId === 'admin') return 3;
        if (roleId === 'lead') return 2;
        return 1;
    } catch (e) {
        return 1;
    }
}

function syncLegacyProcessingFlags() {
    isProcessing = activeTransfers.size > 0;
    if (activeTransfers.size === 0) {
        currentOrder = null;
    } else {
        const firstKey = activeTransfers.keys().next().value;
        currentOrder = activeTransfers.size === 1 ? firstKey : `${firstKey} (+${activeTransfers.size - 1} en paralelo)`;
    }
}

function log(msg, ...args) {
    const timestamp = new Date().toLocaleTimeString('es-ES', { hour12: false });
    console.log(`[${timestamp}] [WORKER] ${msg}`, ...args);
}

function normalizeSlash(p) {
    if (!p) return '';
    return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Obtiene el mapa de Team Drives de Google Drive
 */
function getDrives() {
    if (!teamDrivesMap) {
        teamDrivesMap = catalogGenerator.getTeamDrivesMap ? catalogGenerator.getTeamDrivesMap() : {};
    }
    return teamDrivesMap;
}

/**
 * Resuelve una ruta a su Team Drive ID y ruta relativa dentro del drive
 */
function resolveRemoteInfo(fullPath, projectName = null) {
    let norm = normalizeSlash(fullPath);
    let driveName = '';
    let relPath = '';

    // Si la ruta recibida no parece un destino de Google Drive (ej: viene como Z:/INTERNO/MEDIA/... o Z:/...),
    // intentar resolverla automáticamente a su equivalente en Google Drive
    if (!norm.match(/(?:Unidades compartidas\/|lasp-drive:)/i)) {
        if (typeof catalogGenerator.resolveLocalToOnlinePath === 'function') {
            const resolved = catalogGenerator.resolveLocalToOnlinePath(norm, projectName);
            if (resolved && resolved !== norm && resolved.match(/(?:Unidades compartidas\/|lasp-drive:)/i)) {
                log(`[RESOLVE WORKER] Ruta corregida de local a Drive: '${norm}' -> '${resolved}'`);
                norm = normalizeSlash(resolved);
            }
        }
    }

    const match = norm.match(/(?:Unidades compartidas\/|lasp-drive:)([^/]+)(?:\/(.*))?$/i);
    if (match) {
        driveName = match[1].toLowerCase();
        relPath = match[2] || '';
    } else {
        const parts = norm.split('/');
        driveName = parts[0].toLowerCase();
        relPath = parts.slice(1).join('/');
    }

    const drives = getDrives();
    let teamDriveId = drives[driveName] || null;

    // Fallback: si no matchea exacto, probar con sufijo _media o sin él si coincide con projectName
    if (!teamDriveId && projectName) {
        const pNorm = String(projectName).toLowerCase().trim();
        if (drives[pNorm]) {
            teamDriveId = drives[pNorm];
            driveName = pNorm;
        } else if (drives[`${pNorm}_media`]) {
            teamDriveId = drives[`${pNorm}_media`];
            driveName = `${pNorm}_media`;
        }
    }

    return { driveName, relPath, teamDriveId };
}

/**
 * Resuelve la ruta local considerando las letras de unidad en Server vs Dev
 */
function resolveLocalPathForWorker(p) {
    if (!p) return '';
    return p.replace(/\\/g, '/');
}

const WORKERS_DIR = path.join(CACHE_ROOT, 'workers');

function getPrimaryIPv4() {
    try {
        const nets = os.networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
                        return net.address;
                    }
                }
            }
        }
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
    } catch(e) {}
    return '127.0.0.1';
}

const WORKER_IP = getPrimaryIPv4();

/**
 * Actualiza el archivo de latido (heartbeat) para que Pipeta UI y Pipeta Server conozcan el estado del Worker
 */
function updateHeartbeat(status = 'idle', activeTask = null) {
    try {
        fs.ensureDirSync(CACHE_ROOT);
        fs.ensureDirSync(WORKERS_DIR);
        const data = {
            workerId: WORKER_ID,
            hostname: os.hostname(),
            ip: WORKER_IP,
            pid: process.pid,
            platform: os.platform(),
            status,
            activeTask,
            lastPing: new Date().toISOString(),
            rcloneAvailable: fs.existsSync(RCLONE_EXE),
            rcloneConf: RCLONE_CONF,
            engine: 'concurrent-v2',
            activeTransfersCount: (() => { try { return activeTransfers.size; } catch (e) { return 0; } })(),
            activeFastCount: (() => { try { return activeFastTasks.size; } catch (e) { return 0; } })(),
            maxConcurrentTransfers: (() => { try { return MAX_WORKER_CONCURRENT_TRANSFERS; } catch (e) { return 1; } })(),
            system: {
                totalMem: os.totalmem(),
                freeMem: os.freemem(),
                uptime: Math.round(os.uptime())
            }
        };

        // 1. Archivo individual de nodo en workers/
        const workerNodeFile = path.join(WORKERS_DIR, `${WORKER_ID}.json`);
        fs.writeJsonSync(workerNodeFile, data, { spaces: 2 });

        // 2. Archivo heredado para clientes anteriores de Pipeta:
        // Solo actualizar si somos el worker propietario o si el archivo no existe o el worker anterior no emite ping (< 20s)
        let canUpdateLegacyStatus = true;
        try {
            if (fs.existsSync(STATUS_FILE)) {
                const cur = fs.readJsonSync(STATUS_FILE);
                if (cur && cur.workerId && cur.workerId !== WORKER_ID) {
                    const diff = (Date.now() - new Date(cur.lastPing).getTime()) / 1000;
                    if (diff < 20) {
                        canUpdateLegacyStatus = false;
                    }
                }
            }
        } catch(e) {}

        // No sobreescribir STATUS_FILE de produccion desde la maquina de desarrollo (LASP-VM)
        if (canUpdateLegacyStatus && !(CACHE_ROOT.toUpperCase().startsWith('S:') && os.hostname().toLowerCase().includes('vm'))) {
            fs.writeJsonSync(STATUS_FILE, data, { spaces: 2 });
        }
    } catch (e) {
        // Silenciar errores de heartbeat
    }
}

function cleanupWorkerNode() {
    try {
        const workerNodeFile = path.join(WORKERS_DIR, `${WORKER_ID}.json`);
        if (fs.existsSync(workerNodeFile)) {
            const data = fs.readJsonSync(workerNodeFile);
            data.status = 'stopped';
            data.stoppedAt = new Date().toISOString();
            fs.writeJsonSync(workerNodeFile, data, { spaces: 2 });
        }
    } catch(e) {}
}

process.on('SIGINT', () => { cleanupWorkerNode(); process.exit(0); });
process.on('SIGTERM', () => { cleanupWorkerNode(); process.exit(0); });

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

/**
 * Ejecuta Rclone en segundo plano capturando métricas de progreso (--stats 1s --use-json-log)
 */
function runRcloneWithProgress(args, onProgress, orderId = null) {
    return new Promise((resolve, reject) => {
        const rcloneExe = findRcloneExe();
        const fullArgs = [
            ...args,
            '--stats', '1s',
            '--use-json-log',
            '-v'
        ];

        const proc = spawn(rcloneExe, fullArgs, {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        activeRcloneProc = proc;
        if (orderId) activeRcloneProcs.set(orderId, proc);

        let stderrBuffer = '';
        let stdoutBuffer = '';
        const recentErrors = [];

        function handleLine(line) {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
                recentErrors.push(trimmed);
                if (recentErrors.length > 10) recentErrors.shift();
                return;
            }
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && parsed.msg && (parsed.level === 'error' || parsed.level === 'warning')) {
                    recentErrors.push(parsed.msg);
                    if (recentErrors.length > 10) recentErrors.shift();
                }
                if (parsed && parsed.stats && typeof onProgress === 'function') {
                    const stats = parsed.stats;
                    const totalBytes = stats.totalBytes || 0;
                    const transferredBytes = stats.bytes || 0;
                    let percentage = totalBytes > 0 ? (transferredBytes / totalBytes) * 100 : 0;
                    percentage = Math.min(100, Math.max(0, Math.round(percentage * 10) / 10));

                    onProgress({
                        percentage,
                        transferredBytes,
                        totalBytes,
                        speedBytesPerSec: stats.speed || 0,
                        speedFormatted: formatSpeed(stats.speed || 0),
                        etaSeconds: (stats.eta !== null && stats.eta !== undefined) ? stats.eta : null,
                        transfers: stats.transfers || 0,
                        totalTransfers: stats.totalTransfers || 0
                    });
                }
            } catch (e) {}
        }

        proc.stderr.on('data', (chunk) => {
            stderrBuffer += chunk.toString();
            const lines = stderrBuffer.split(/\r?\n/);
            stderrBuffer = lines.pop();
            for (const line of lines) {
                handleLine(line);
            }
        });

        proc.stdout.on('data', (chunk) => {
            stdoutBuffer += chunk.toString();
            const lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop();
            for (const line of lines) {
                handleLine(line);
            }
        });

        proc.on('error', (err) => {
            if (activeRcloneProc === proc) activeRcloneProc = null;
            if (orderId) activeRcloneProcs.delete(orderId);
            reject(err);
        });

        proc.on('close', (code) => {
            if (activeRcloneProc === proc) activeRcloneProc = null;
            if (orderId) activeRcloneProcs.delete(orderId);
            if (stderrBuffer) handleLine(stderrBuffer);
            if (stdoutBuffer) handleLine(stdoutBuffer);
            if (code === 0) {
                resolve();
            } else {
                const errorDetail = recentErrors.join(' | ') || `código de salida ${code}`;
                reject(new Error(`rclone falló (${code}): ${errorDetail}`));
            }
        });
    });
}

/**
 * Procesa una transferencia individual con Rclone reportando progreso
 */
async function executeRcloneTransfer(type, item, orderData = null, onProgress = null) {
    const rcloneExe = findRcloneExe();
    if (!fs.existsSync(rcloneExe) && rcloneExe !== 'rclone') {
        throw new Error(`rclone.exe no encontrado en: ${rcloneExe}`);
    }
    const rcloneConf = findRcloneConf();
    if (!rcloneConf) {
        throw new Error(`rclone.conf no encontrado en las rutas del sistema`);
    }

    const isDir = !!item.isDir;
    const orderId = orderData?.id || null;

    if (type === 'download') {
        const onlinePath = item.onlinePath || item.path;
        const targetLocal = resolveLocalPathForWorker(item.targetLocalPath || item.localPath);

        if (!onlinePath || !targetLocal) {
            throw new Error(`Parámetros de ruta incompletos para descarga: online='${onlinePath}', targetLocal='${targetLocal}'`);
        }

        const remote = resolveRemoteInfo(onlinePath);
        if (!remote.teamDriveId) {
            throw new Error(`No se pudo resolver el Team Drive de Google Drive para: ${onlinePath}`);
        }

        log(`📥 Descargando: '${remote.driveName}:${remote.relPath}' -> '${targetLocal}'`);

        if (isDir) {
            fs.ensureDirSync(targetLocal);
            const args = [
                '--config', rcloneConf,
                'copy',
                `lasp-drive:${remote.relPath}`,
                targetLocal,
                '--drive-team-drive', remote.teamDriveId,
                '--create-empty-src-dirs',
                '--transfers', '4',
                '--checkers', '8'
            ];
            await runRcloneWithProgress(args, onProgress, orderId);
        } else {
            fs.ensureDirSync(path.dirname(targetLocal));
            const args = [
                '--config', rcloneConf,
                'copyto',
                `lasp-drive:${remote.relPath}`,
                targetLocal,
                '--drive-team-drive', remote.teamDriveId
            ];
            try {
                await runRcloneWithProgress(args, onProgress, orderId);
            } catch (copyErr) {
                // Fallback con directory copy si copyto falla por rutas complejas de Google Drive
                const targetDir = path.dirname(targetLocal);
                const remoteDir = path.dirname(remote.relPath).replace(/\\/g, '/');
                const fileName = path.basename(remote.relPath);
                const sourceRemote = (remoteDir === '.' || !remoteDir) ? 'lasp-drive:' : `lasp-drive:${remoteDir}`;

                const fallbackArgs = [
                    '--config', rcloneConf,
                    'copy',
                    sourceRemote,
                    targetDir,
                    '--drive-team-drive', remote.teamDriveId,
                    '--include', `${fileName}*`
                ];
                await runRcloneWithProgress(fallbackArgs, onProgress, orderId);
            }
        }
    } else if (type === 'upload') {
        const rawSource = item.targetLocalPath || item.localPath || item.path;
        const localSource = resolveLocalPathForWorker(rawSource);
        let onlineTarget = item.onlinePath;

        if (!localSource) {
            throw new Error(`Ruta de origen local faltante para subida`);
        }

        // Si no se proporcionó onlinePath explícito, deducirlo mediante las raíces del proyecto
        if (!onlineTarget && orderData && orderData.project) {
            const config = catalogGenerator.getProjectConfig(orderData.project);
            if (config && config.roots) {
                const normLocal = normalizeSlash(localSource);
                const normWorkLocal = normalizeSlash(config.roots.work);
                const normMediaLocal = normalizeSlash(config.roots.media);

                if (normWorkLocal && normLocal.toLowerCase().startsWith(normWorkLocal.toLowerCase())) {
                    const subRel = normLocal.substring(normWorkLocal.length).replace(/^\/+/, '');
                    onlineTarget = `${config.roots.onlineWork || `G:/Unidades compartidas/${orderData.project}`}/${subRel}`;
                } else if (normMediaLocal && normLocal.toLowerCase().startsWith(normMediaLocal.toLowerCase())) {
                    const subRel = normLocal.substring(normMediaLocal.length).replace(/^\/+/, '');
                    onlineTarget = `${config.roots.onlineMedia || `G:/Unidades compartidas/${orderData.project}_media`}/${subRel}`;
                }
            }
        }

        if (!onlineTarget || (!onlineTarget.toLowerCase().startsWith('g:/') && !onlineTarget.toLowerCase().includes('unidades compartidas') && !onlineTarget.toLowerCase().startsWith('lasp-drive:'))) {
            if (typeof catalogGenerator.resolveLocalToOnlinePath === 'function') {
                const autoResolved = catalogGenerator.resolveLocalToOnlinePath(onlineTarget || localSource, orderData?.project);
                if (autoResolved) {
                    onlineTarget = autoResolved;
                }
            }
        }

        if (!onlineTarget) {
            throw new Error(`Parámetros de ruta incompletos para subida: local='${localSource}', onlineTarget='${onlineTarget}'`);
        }

        if (!fs.existsSync(localSource)) {
            throw new Error(`El archivo o carpeta de origen no existe localmente: ${localSource}`);
        }

        const remote = resolveRemoteInfo(onlineTarget, orderData?.project);
        if (!remote.teamDriveId) {
            throw new Error(`No se pudo resolver el Team Drive de Google Drive para: ${onlineTarget}`);
        }

        log(`📤 Subiendo: '${localSource}' -> '${remote.driveName}:${remote.relPath}'`);

        if (isDir) {
            const args = [
                '--config', rcloneConf,
                'copy',
                localSource,
                `lasp-drive:${remote.relPath}`,
                '--drive-team-drive', remote.teamDriveId,
                '--transfers', '4',
                '--checkers', '8'
            ];
            await runRcloneWithProgress(args, onProgress, orderId);
        } else {
            const args = [
                '--config', rcloneConf,
                'copyto',
                localSource,
                `lasp-drive:${remote.relPath}`,
                '--drive-team-drive', remote.teamDriveId
            ];
            await runRcloneWithProgress(args, onProgress, orderId);
        }
    } else if (type === 'higgsfield_ingest') {
        const hfApi = require('./higgsfield_api');
        log(`⚡ [HIGGSFIELD WORKER] Ingestando: ${item.canonicalName || item.jobId}`);
        await hfApi.processHiggsfieldIngest({
            ...item,
            createLedger: item.createLedger !== false,
            downloadRefs: !!item.downloadRefs,
            preserveOriginal: item.preserveOriginal !== false,
            targetSubfolders: item.targetSubfolders || ['wip'],
            userName: orderData.user || 'Worker'
        });
        if (onProgress) {
            onProgress({ percentage: 100 });
        }
    } else {
        throw new Error(`Tipo de operación desconocido: ${type}`);
    }
}

/**
 * Ejecuta operaciones livianas de catálogo/metadatos en un carril paralelo (Fast-Lane) sin bloquear transferencias
 */
async function executeFastOrder(orderData, pendingOrderFile) {
    const startTime = Date.now();
    activeFastTasks.add(orderData.id);

    try {
        if (orderData.type === 'refresh_folder') {
            const targetType = orderData.targetType || (orderData.path?.toLowerCase().startsWith('g:') ? 'drive' : 'server');
            log(`🔄 [FAST-LANE] Refresco de carpeta en paralelo: [${orderData.project}] '${orderData.path}' (${targetType.toUpperCase()}) (Usuario: ${orderData.user})`);
            orderData.status = 'processing';
            orderData.worker = WORKER_ID;
            orderData.startedAt = new Date().toISOString();
            saveOrderDataAcrossCandidates(orderData, pendingOrderFile);

            if (activeTransfers.size === 0) {
                updateHeartbeat('refreshing_folder', { project: orderData.project, path: orderData.path });
            }

            try {
                let res;
                if (typeof catalogGenerator.refreshSubCatalog === 'function') {
                    res = await catalogGenerator.refreshSubCatalog(orderData.project, orderData.path, targetType);
                } else {
                    res = await catalogGenerator.refreshCatalogSubfolder(orderData.project, orderData.path);
                }
                orderData.result = res;
                orderData.status = (res && res.success) ? 'completed' : 'failed';
                orderData.completedAt = new Date().toISOString();
                orderData.durationSeconds = Math.round((Date.now() - startTime) / 1000);
                orderData.processedBy = WORKER_ID;
                saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
                log(`✅ [FAST-LANE] Refresco de carpeta '${orderData.path}' (${targetType.toUpperCase()}) completado (${res?.itemsCount || 0} items)`);
            } catch (err) {
                log(`❌ [FAST-LANE] Error al refrescar carpeta '${orderData.path}': ${err.message}`);
                orderData.status = 'failed';
                orderData.error = err.message;
                orderData.completedAt = new Date().toISOString();
                orderData.processedBy = WORKER_ID;
                saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
            }
            return;
        }

        if (orderData.type === 'query_higgsfield_job') {
            const jobId = orderData.jobId;
            log(`⚡ [FAST-LANE] Consulta de Job Higgsfield recibida: ${jobId} (Usuario: ${orderData.user})`);
            orderData.status = 'processing';
            orderData.worker = WORKER_ID;
            orderData.startedAt = new Date().toISOString();
            saveOrderDataAcrossCandidates(orderData, pendingOrderFile);

            try {
                const hfApi = require('./higgsfield_api');
                const details = await hfApi.fetchJobDetails(jobId);
                orderData.result = details;
                orderData.status = (details && details.success) ? 'completed' : 'failed';
                orderData.completedAt = new Date().toISOString();
                orderData.durationSeconds = Math.round((Date.now() - startTime) / 1000);
                orderData.processedBy = WORKER_ID;
                saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
                log(`✅ [FAST-LANE] Consulta de Job ${jobId} completada con éxito`);
            } catch (err) {
                log(`❌ [FAST-LANE] Error al consultar Job ${jobId}: ${err.message}`);
                orderData.status = 'failed';
                orderData.error = err.message;
                orderData.completedAt = new Date().toISOString();
                orderData.processedBy = WORKER_ID;
                saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
            }
            return;
        }
    } finally {
        activeFastTasks.delete(orderData.id);
        if (activeTransfers.size === 0 && activeFastTasks.size === 0) {
            updateHeartbeat('idle', null);
        }
    }
}

/**
 * Ejecuta una transferencia pesada (download / upload / higgsfield_ingest) dentro del Pool Concurrente
 */
async function executeHeavyOrder(orderData, pendingOrderFile) {
    const startTime = Date.now();
    const itemsCount = Array.isArray(orderData.items) ? orderData.items.length : 0;
    const userLimit = getUserMaxConcurrentTransfers(orderData.user);
    log(`🔔 Orden tomada en Pool (${activeTransfers.size}/${MAX_WORKER_CONCURRENT_TRANSFERS}): ${orderData.id} [${orderData.type.toUpperCase()}] de '${orderData.user}' (Cupo usuario: ${userLimit}) (${itemsCount} items)`);

    orderData.status = 'processing';
    orderData.worker = WORKER_ID;
    orderData.startedAt = new Date().toISOString();
    saveOrderDataAcrossCandidates(orderData, pendingOrderFile);

    updateHeartbeat('processing', {
        orderId: orderData.id,
        activeCount: activeTransfers.size,
        type: orderData.type,
        project: orderData.project,
        itemsTotal: orderData.items.length
    });

    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    try {
        let lastProgressWrite = 0;
        let wasCancelled = false;

        for (let i = 0; i < orderData.items.length; i++) {
            // Comprobar si la orden fue cancelada o si cambió su prioridad antes de iniciar el siguiente item
            try {
                const fresh = fs.readJsonSync(pendingOrderFile);
                if (fresh && Number.isFinite(fresh.priority)) {
                    orderData.priority = fresh.priority;
                    if (fresh.priorityUpdatedAt) orderData.priorityUpdatedAt = fresh.priorityUpdatedAt;
                }
                if (fresh && fresh.status === 'cancelled') {
                    wasCancelled = true;
                    orderData.status = 'cancelled';
                    orderData.cancelledAt = fresh.cancelledAt || new Date().toISOString();
                    orderData.cancelledBy = fresh.cancelledBy || 'user';
                    log(`🛑 Orden ${orderData.id} cancelada antes del item ${i + 1}`);
                    break;
                }
            } catch (e) {}

            const item = orderData.items[i];
            log(`  [${orderData.id}] [${i + 1}/${orderData.items.length}] Procesando ${item.name || item.relPath || item.path}...`);

            const itemProgressCallback = (p) => {
                const baseItemWeight = 100 / orderData.items.length;
                const overallPct = (i * baseItemWeight) + ((p.percentage || 0) * baseItemWeight / 100);

                orderData.progress = {
                    percentage: Math.min(100, Math.max(0, Math.round(overallPct * 10) / 10)),
                    itemPercentage: p.percentage || 0,
                    transferredBytes: p.transferredBytes || 0,
                    totalBytes: p.totalBytes || 0,
                    speedBytesPerSec: p.speedBytesPerSec || 0,
                    speedFormatted: p.speedFormatted || '0 B/s',
                    etaSeconds: p.etaSeconds,
                    currentFile: item.name || item.relativePath || path.basename(item.path || ''),
                    itemIndex: i + 1,
                    itemsTotal: orderData.items.length
                };

                const now = Date.now();
                if (now - lastProgressWrite >= 800) {
                    lastProgressWrite = now;

                    // Chequear si se solicitó cancelación o cambio de prioridad durante la transferencia
                    try {
                        const fresh = fs.readJsonSync(pendingOrderFile);
                        if (fresh && Number.isFinite(fresh.priority)) {
                            orderData.priority = fresh.priority;
                            if (fresh.priorityUpdatedAt) orderData.priorityUpdatedAt = fresh.priorityUpdatedAt;
                        }
                        if (fresh && fresh.status === 'cancelled') {
                            wasCancelled = true;
                            orderData.status = 'cancelled';
                            orderData.cancelledAt = fresh.cancelledAt || new Date().toISOString();
                            orderData.cancelledBy = fresh.cancelledBy || 'user';
                            log(`🛑 Cancelación durante transferencia detectada para orden ${orderData.id}. Abortando Rclone...`);
                            const procToKill = activeRcloneProcs.get(orderData.id);
                            if (procToKill) {
                                try { procToKill.kill(); } catch (kErr) {}
                            }
                        }
                    } catch (e) {}

                    if (!wasCancelled) {
                        saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
                        updateHeartbeat('processing', {
                            orderId: currentOrder || orderData.id,
                            activeCount: activeTransfers.size,
                            type: orderData.type,
                            project: orderData.project,
                            progress: orderData.progress
                        });
                    }
                }
            };

            try {
                await executeRcloneTransfer(orderData.type, item, orderData, itemProgressCallback);
                successCount++;
            } catch (err) {
                if (wasCancelled) {
                    log(`  ⏹ Transferencia de item interrumpida por cancelación de la orden ${orderData.id}`);
                    break;
                }
                failedCount++;
                log(`  ❌ Error en item ${item.name} (${orderData.id}): ${err.message}`);
                errors.push({ item: item.name, error: err.message });
            }
        }

        // Sincronizar prioridad final desde disco por si fue editada en el último segundo
        try {
            const freshFinal = fs.readJsonSync(pendingOrderFile);
            if (freshFinal && Number.isFinite(freshFinal.priority)) {
                orderData.priority = freshFinal.priority;
                if (freshFinal.priorityUpdatedAt) orderData.priorityUpdatedAt = freshFinal.priorityUpdatedAt;
            }
        } catch (e) {}

        if (wasCancelled) {
            orderData.status = 'cancelled';
            orderData.completedAt = new Date().toISOString();
            orderData.durationSeconds = Math.round((Date.now() - startTime) / 1000);
            orderData.processedBy = WORKER_ID;
            saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
            log(`🛑 Orden ${orderData.id} registrada como CANCELADA`);
            return;
        }

        const durationSeconds = Math.round((Date.now() - startTime) / 1000);

        if (orderData.progress) {
            orderData.progress.percentage = 100;
            orderData.progress.speedFormatted = 'Completado';
            orderData.progress.etaSeconds = 0;
        }

        if (failedCount === 0) {
            orderData.status = 'completed';
            log(`✅ Orden ${orderData.id} COMPLETADA con éxito (${successCount} items en ${durationSeconds}s)`);
        } else if (successCount > 0) {
            orderData.status = 'completed_with_errors';
            orderData.errors = errors;
            log(`⚠️ Orden ${orderData.id} completada parcialmente (${successCount} OK, ${failedCount} fallaron)`);
        } else {
            orderData.status = 'failed';
            orderData.errors = errors;
            log(`❌ Orden ${orderData.id} FALLÓ completamente`);
        }

        // Actualización quirúrgica del catálogo en Google Drive / Server tras transferencias exitosas
        if ((orderData.type === 'upload' || orderData.type === 'download') && successCount > 0) {
            log(`📝 Actualizando catálogos para ${successCount} items transferidos con éxito (${orderData.type})...`);
            const parentFolders = new Set();

            for (const item of orderData.items) {
                try {
                    if (orderData.type === 'upload' && typeof catalogGenerator.recordTransferredItem === 'function') {
                        catalogGenerator.recordTransferredItem(orderData.project, item, 'drive');
                    }
                    const localP = item.targetLocalPath || item.localPath || item.path;
                    const folder = localP ? path.dirname(localP).replace(/\\/g, '/') : null;
                    if (folder) parentFolders.add(folder);
                } catch (recErr) {
                    log(`⚠️ Error registrando item en catálogo (${item.name}): ${recErr.message}`);
                }
            }

            for (const folder of parentFolders) {
                try {
                    log(`🔄 Sincronizando sub-catálogo con Google Drive para: '${folder}'...`);
                    if (typeof catalogGenerator.refreshSubCatalog === 'function') {
                        await catalogGenerator.refreshSubCatalog(orderData.project, folder, 'drive');
                    } else if (typeof catalogGenerator.refreshCatalogSubfolder === 'function') {
                        await catalogGenerator.refreshCatalogSubfolder(orderData.project, folder);
                    }
                } catch (rfErr) {
                    log(`⚠️ Advertencia al refrescar sub-catálogo con Google Drive: ${rfErr.message}`);
                }
            }
        }

        orderData.completedAt = new Date().toISOString();
        orderData.durationSeconds = durationSeconds;
        orderData.processedBy = WORKER_ID;

        saveOrderDataAcrossCandidates(orderData, pendingOrderFile);

    } catch (fatalErr) {
        log(`💥 Error fatal procesando orden ${orderData.id}: ${fatalErr.message}`);
        orderData.status = 'failed';
        orderData.error = fatalErr.message;
        orderData.completedAt = new Date().toISOString();
        saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
    } finally {
        activeTransfers.delete(orderData.id);
        syncLegacyProcessingFlags();
        updateHeartbeat(activeTransfers.size > 0 ? 'processing' : 'idle', currentOrder);
    }
}

/**
 * Revisa la cola de órdenes en Z:\_SYNC_CACHE\requests\ y directorios candidatos
 * Despacha inmediatamente tareas livianas (Fast-Lane) y administra el Pool Concurrente por Rol/Usuario
 */
async function processQueue() {
    const candidateDirs = getCandidateOrdersDirs();
    const seenOrders = new Set();
    const pendingFastOrders = [];
    const pendingHeavyOrders = [];

    for (const dir of candidateDirs) {
        if (!fs.existsSync(dir)) continue;
        let files = [];
        try {
            files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        } catch (e) {
            continue;
        }

        for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
                const data = fs.readJsonSync(fullPath);
                if (data && data.status === 'pending' && data.type !== 'server_download' && data.type !== 'server_upload') {
                    if (!seenOrders.has(data.id) && !activeTransfers.has(data.id) && !activeFastTasks.has(data.id)) {
                        seenOrders.add(data.id);
                        if (data.type === 'refresh_folder' || data.type === 'query_higgsfield_job') {
                            pendingFastOrders.push({ data, fullPath, dir });
                        } else {
                            pendingHeavyOrders.push({ data, fullPath, dir });
                        }
                    }
                }
            } catch (e) {}
        }
    }

    // 1. CARRIL RÁPIDO (FAST-LANE): Ejecutar refresh_folder / query_higgsfield_job en paralelo sin esperar descargas/subidas
    if (pendingFastOrders.length > 0 && activeFastTasks.size < MAX_FAST_CONCURRENT_TASKS) {
        pendingFastOrders.sort((a, b) => new Date(a.data.createdAt || 0) - new Date(b.data.createdAt || 0));
        for (const cand of pendingFastOrders) {
            if (activeFastTasks.size >= MAX_FAST_CONCURRENT_TASKS) break;
            try {
                const fresh = fs.readJsonSync(cand.fullPath);
                if (fresh && fresh.status === 'pending') {
                    fresh.status = 'processing';
                    fresh.worker = WORKER_ID;
                    fresh.workerHostname = os.hostname();
                    fresh.startedAt = new Date().toISOString();
                    saveOrderDataAcrossCandidates(fresh, cand.fullPath);

                    const check = fs.readJsonSync(cand.fullPath);
                    if (check && check.worker === WORKER_ID && check.status === 'processing') {
                        executeFastOrder(check, cand.fullPath).catch(e => log(`Error en Fast-Lane (${check.id}): ${e.message}`));
                    }
                }
            } catch (e) {}
        }
    }

    // Verificar si la cola global de transferencias pesadas está pausada
    const pauseFlag = path.join(CACHE_ROOT, 'queue_paused.flag');
    if (fs.existsSync(pauseFlag)) {
        if (activeTransfers.size === 0) updateHeartbeat('paused', null);
        return;
    }

    // 2. POOL DE TRANSFERENCIAS PESADAS: Evaluar slots disponibles y cupos por Rol / Override de Usuario
    if (pendingHeavyOrders.length === 0 || activeTransfers.size >= MAX_WORKER_CONCURRENT_TRANSFERS) {
        return;
    }

    // Ordenar por prioridad DESC y desempate FIFO por createdAt ASC
    pendingHeavyOrders.sort((a, b) => {
        const getPriority = (d) => {
            if (Number.isFinite(d.priority)) return d.priority;
            if (d.type === 'higgsfield_ingest') return 80;
            return 50;
        };
        const pA = getPriority(a.data);
        const pB = getPriority(b.data);
        if (pB !== pA) return pB - pA;
        return new Date(a.data.createdAt || 0) - new Date(b.data.createdAt || 0);
    });

    for (const cand of pendingHeavyOrders) {
        if (activeTransfers.size >= MAX_WORKER_CONCURRENT_TRANSFERS) break;

        const orderUser = String(cand.data.user || 'artista').trim().toLowerCase();
        const userMaxAllowed = getUserMaxConcurrentTransfers(orderUser);

        // Contar cuántas transferencias activas tiene este usuario actualmente en el pool
        let userCurrentActive = 0;
        for (const activeInfo of activeTransfers.values()) {
            if (activeInfo.user === orderUser) {
                userCurrentActive++;
            }
        }

        // Si el usuario ya alcanzó su límite de concurrencia por Rol/Override, saltar a la siguiente orden
        if (userCurrentActive >= userMaxAllowed) {
            continue;
        }

        try {
            const fresh = fs.readJsonSync(cand.fullPath);
            if (fresh && fresh.status === 'pending') {
                fresh.status = 'processing';
                fresh.worker = WORKER_ID;
                fresh.workerHostname = os.hostname();
                fresh.startedAt = new Date().toISOString();
                saveOrderDataAcrossCandidates(fresh, cand.fullPath);

                const check = fs.readJsonSync(cand.fullPath);
                if (check && check.worker === WORKER_ID && check.status === 'processing') {
                    activeTransfers.set(check.id, {
                        id: check.id,
                        user: orderUser,
                        type: check.type,
                        startedAt: Date.now()
                    });
                    syncLegacyProcessingFlags();
                    executeHeavyOrder(check, cand.fullPath).catch(e => log(`Error en Heavy Pool (${check.id}): ${e.message}`));
                }
            }
        } catch (claimErr) {
            continue;
        }
    }
}

/**
 * Revisa si se solicitó refrescar algún catálogo
 */
async function checkCatalogTriggers() {
    if (isProcessing) return;

    if (fs.existsSync(TRIGGER_FILE)) {
        try {
            const trigger = fs.readJsonSync(TRIGGER_FILE);
            fs.removeSync(TRIGGER_FILE);

            const project = trigger.project || 'all';
            log(`🔄 Trigger de catálogo detectado para: ${project}`);

            const allProjects = catalogGenerator.getAllProjectNames ? catalogGenerator.getAllProjectNames() : ['surf_love'];
            const targetProjects = (project === 'all') ? allProjects : [project];

            for (const p of targetProjects) {
                updateHeartbeat('refreshing_catalog', { project: p });
                log(`🔄 Refrescando catálogo para proyecto: ${p}`);
                if (!trigger.type || trigger.type === 'drive' || trigger.type === 'both') {
                    await catalogGenerator.generateProjectCatalog(p, { mode: trigger.mode || 'auto' });
                }
                if ((!trigger.type || trigger.type === 'server' || trigger.type === 'both') && typeof catalogGenerator.generateServerCatalog === 'function') {
                    await catalogGenerator.generateServerCatalog(p, { mode: trigger.mode || 'auto' });
                }
                log(`✅ Catálogos de ${p} actualizados exitosamente`);
            }
            updateHeartbeat('idle', null);
        } catch (e) {
            log(`❌ Error procesando trigger de catálogo: ${e.message}`);
            updateHeartbeat('idle', null);
        }
    }
}

const RESTART_FILE = path.join(CACHE_ROOT, 'restart_worker.flag');
const HOST_RESTART_FILE = path.join(CACHE_ROOT, `restart_${os.hostname().toLowerCase()}.flag`);
const WORKER_RESTART_FILE = path.join(CACHE_ROOT, `restart_${WORKER_ID}.flag`);

/**
 * Ciclo principal del Worker
 */
async function runLoop() {
    try {
        if (!isProcessing) {
            let shouldRestart = false;
            let flagToRemove = null;
            if (fs.existsSync(WORKER_RESTART_FILE)) {
                shouldRestart = true;
                flagToRemove = WORKER_RESTART_FILE;
            } else if (fs.existsSync(HOST_RESTART_FILE)) {
                shouldRestart = true;
                flagToRemove = HOST_RESTART_FILE;
            } else if (fs.existsSync(RESTART_FILE)) {
                shouldRestart = true;
                flagToRemove = RESTART_FILE;
            }

            if (shouldRestart) {
                log(`🔄 Bandera de reinicio detectada (${flagToRemove}). Saliendo limpiamente para auto-reinicio...`);
                updateHeartbeat('restarting', null);
                try { if (flagToRemove && fs.existsSync(flagToRemove)) fs.removeSync(flagToRemove); } catch(e){}
                process.exit(0);
            }
        }
        updateHeartbeat(isProcessing ? 'processing' : 'idle', currentOrder);
        await checkCatalogTriggers();
        await processQueue();
    } catch (e) {
        log(`Error en ciclo de worker: ${e.message}`);
    }
}

/**
 * Verificación inicial al arrancar el Worker
 */
async function startupCheck() {
    console.log('================================================================');
    console.log('      PIPETA SYNC DAEMON & QUEUE WORKER (VFX STUDIO)');
    console.log('================================================================');
    console.log(`Worker ID:      ${WORKER_ID}`);
    console.log(`Host:           ${os.hostname()} (${os.platform()})`);
    console.log(`Cache Root:     ${CACHE_ROOT}`);
    console.log(`Orders Dir:     ${ORDERS_DIR}`);
    console.log(`Rclone Bin:     ${RCLONE_EXE} [${fs.existsSync(RCLONE_EXE) ? 'OK' : 'MISSING'}]`);
    console.log(`Rclone Conf:    ${RCLONE_CONF || 'NO CONFIG'} [${RCLONE_CONF && fs.existsSync(RCLONE_CONF) ? 'OK' : 'MISSING'}]`);
    console.log('================================================================\n');

    fs.ensureDirSync(CACHE_ROOT);
    fs.ensureDirSync(ORDERS_DIR);

    // Cargar Team Drives
    const drives = getDrives();
    const driveNames = Object.keys(drives);
    log(`Conectado a Google Drive con éxito (${driveNames.length} Team Drives detectados)`);

    if (isLocalMode) {
        updateHeartbeat('idle', null);
        log(`🚀 Local Worker en línea en segundo plano y escuchando órdenes de transferencia...\n`);
        setInterval(runLoop, 1000);
        setInterval(async () => {
            if (!isProcessing) {
                log(`⏰ [LOCAL] Refresco periódico (1h) de catálogos Google Drive iniciado...`);
                const projectsToRefresh = catalogGenerator.getAllProjectNames ? catalogGenerator.getAllProjectNames() : ['surf_love'];
                for (const proj of projectsToRefresh) {
                    if (isProcessing) break;
                    try {
                        log(`⏰ [LOCAL] Refrescando catálogo Google Drive de: ${proj}`);
                        await catalogGenerator.generateProjectCatalog(proj, { mode: 'auto' });
                    } catch (e) {
                        log(`⚠️ [LOCAL] Error en refresco periódico de ${proj}: ${e.message}`);
                    }
                }
            }
        }, 60 * 60 * 1000);
        return;
    }

    // Verificar si existen los catálogos de todos los proyectos activos; si no, generarlos automáticamente
    const allProjects = catalogGenerator.getAllProjectNames ? catalogGenerator.getAllProjectNames() : ['surf_love'];
    log(`📋 Verificando catálogos de proyectos activos (${allProjects.join(', ')})...`);

    for (const proj of allProjects) {
        const driveManifest = path.join(CACHE_ROOT, 'projects', proj, 'drive', 'manifest.json');
        const conf = catalogGenerator.getProjectConfig ? catalogGenerator.getProjectConfig(proj) : null;
        const aliasDriveManifest = (conf && conf.projectCode) ? path.join(CACHE_ROOT, 'projects', conf.projectCode, 'drive', 'manifest.json') : null;

        if (!fs.existsSync(driveManifest) && (!aliasDriveManifest || !fs.existsSync(aliasDriveManifest))) {
            log(`ℹ️ No se detectó catálogo modular de Google Drive para '${proj}'. Generándolo automáticamente por primera vez...`);
            try {
                updateHeartbeat('initializing_catalog', { project: proj });
                await catalogGenerator.generateProjectCatalog(proj, { mode: 'auto' });
                log(`✅ Catálogo modular offline de '${proj}' generado exitosamente.`);
            } catch (e) {
                log(`⚠️ No se pudo generar catálogo modular inicial de ${proj}: ${e.message}`);
            }
        } else {
            log(`✓ Catálogo modular offline de '${proj}' disponible en cache.`);
        }

        const serverManifest = path.join(CACHE_ROOT, 'projects', proj, 'server', 'manifest.json');
        const aliasServerManifest = (conf && conf.projectCode) ? path.join(CACHE_ROOT, 'projects', conf.projectCode, 'server', 'manifest.json') : null;

        if (!fs.existsSync(serverManifest) && (!aliasServerManifest || !fs.existsSync(aliasServerManifest))) {
            log(`ℹ️ No se detectó catálogo modular del servidor para '${proj}'. Generándolo automáticamente por primera vez...`);
            try {
                updateHeartbeat('initializing_server_catalog', { project: proj });
                if (typeof catalogGenerator.generateServerCatalog === 'function') {
                    await catalogGenerator.generateServerCatalog(proj);
                }
                log(`✅ Catálogo modular de servidor de '${proj}' generado exitosamente.`);
            } catch (e) {
                log(`⚠️ No se pudo generar catálogo modular inicial de servidor para ${proj}: ${e.message}`);
            }
        } else {
            log(`✓ Catálogo modular de servidor de '${proj}' disponible en cache.`);
        }
    }

    updateHeartbeat('idle', null);
    log(`🚀 Worker en línea y escuchando órdenes de transferencia...\n`);

    // Bucle de sondeo: cada 1 segundo para respuesta rápida a órdenes y refrescos
    setInterval(runLoop, 1000);

    // Bucle de refresco de catálogos periódicos: cada 1 hora para todos los proyectos activos
    setInterval(async () => {
        if (!isProcessing) {
            log(`⏰ Refresco periódico (1h) de catálogos activos iniciado...`);
            const projectsToRefresh = catalogGenerator.getAllProjectNames ? catalogGenerator.getAllProjectNames() : ['surf_love'];
            for (const proj of projectsToRefresh) {
                if (isProcessing) break;
                try {
                    log(`⏰ Refrescando catálogos de proyecto: ${proj}`);
                    await catalogGenerator.generateProjectCatalog(proj, { mode: 'auto' });
                    if (typeof catalogGenerator.generateServerCatalog === 'function') {
                        await catalogGenerator.generateServerCatalog(proj);
                    }
                } catch (e) {
                    log(`⚠️ Error en refresco periódico de ${proj}: ${e.message}`);
                }
            }
            log(`✅ Refresco periódico (1h) completado.`);
        }
    }, 60 * 60 * 1000);
}

// Iniciar worker
startupCheck().catch(err => {
    console.error('Error fatal al iniciar Pipeta Sync Worker:', err);
    process.exit(1);
});
