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
function resolveRemoteInfo(fullPath) {
    const norm = normalizeSlash(fullPath);
    let driveName = '';
    let relPath = '';

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
    const teamDriveId = drives[driveName] || null;

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
function runRcloneWithProgress(args, onProgress) {
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
            activeRcloneProc = null;
            reject(err);
        });

        proc.on('close', (code) => {
            activeRcloneProc = null;
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
            await runRcloneWithProgress(args, onProgress);
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
                await runRcloneWithProgress(args, onProgress);
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
                await runRcloneWithProgress(fallbackArgs, onProgress);
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

        if (!onlineTarget) {
            throw new Error(`Parámetros de ruta incompletos para subida: local='${localSource}', onlineTarget='${onlineTarget}'`);
        }

        if (!fs.existsSync(localSource)) {
            throw new Error(`El archivo o carpeta de origen no existe localmente: ${localSource}`);
        }

        const remote = resolveRemoteInfo(onlineTarget);
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
            await runRcloneWithProgress(args, onProgress);
        } else {
            const args = [
                '--config', rcloneConf,
                'copyto',
                localSource,
                `lasp-drive:${remote.relPath}`,
                '--drive-team-drive', remote.teamDriveId
            ];
            await runRcloneWithProgress(args, onProgress);
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
 * Revisa la cola de órdenes en Z:\_SYNC_CACHE\requests\ y directorios candidatos
 */
async function processQueue() {
    if (isProcessing) return;

    // Verificar si la cola global está pausada
    const pauseFlag = path.join(CACHE_ROOT, 'queue_paused.flag');
    if (fs.existsSync(pauseFlag)) {
        updateHeartbeat('paused', null);
        return;
    }

    const candidateDirs = getCandidateOrdersDirs();
    const seenOrders = new Set();
    const pendingOrders = [];

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
                    if (!seenOrders.has(data.id)) {
                        seenOrders.add(data.id);
                        pendingOrders.push({ data, fullPath, dir });
                    }
                }
            } catch (e) {}
        }
    }

    if (pendingOrders.length === 0) return;

    // Ordenar por prioridad DESC y desempate FIFO por createdAt ASC
    pendingOrders.sort((a, b) => {
        const getPriority = (d) => {
            if (Number.isFinite(d.priority)) return d.priority;
            if (d.type === 'higgsfield_ingest' || d.type === 'refresh_folder') return 80;
            return 50;
        };
        const pA = getPriority(a.data);
        const pB = getPriority(b.data);
        if (pB !== pA) return pB - pA;
        return new Date(a.data.createdAt) - new Date(b.data.createdAt);
    });

    // Reclamar atómicamente la primera orden libre (seguro ante múltiples workers concurrentes)
    let selected = null;
    let orderData = null;
    let pendingOrderFile = null;

    for (const cand of pendingOrders) {
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
                    selected = cand;
                    orderData = check;
                    pendingOrderFile = cand.fullPath;
                    break;
                }
            }
        } catch (claimErr) {
            continue;
        }
    }

    if (!selected || !orderData) return;

    isProcessing = true;
    currentOrder = orderData.id;
    const startTime = Date.now();

    // Petición de refresco quirúrgico de subcarpeta específica
    if (orderData.type === 'refresh_folder') {
        const targetType = orderData.targetType || (orderData.path?.toLowerCase().startsWith('g:') ? 'drive' : 'server');
        log(`🔄 Petición de refresco de carpeta recibida: [${orderData.project}] '${orderData.path}' (${targetType.toUpperCase()}) (Usuario: ${orderData.user})`);
        orderData.status = 'processing';
        orderData.worker = WORKER_ID;
        orderData.startedAt = new Date().toISOString();
        saveOrderDataAcrossCandidates(orderData, pendingOrderFile);

        updateHeartbeat('refreshing_folder', { project: orderData.project, path: orderData.path });

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
            log(`✅ Refresco de carpeta '${orderData.path}' (${targetType.toUpperCase()}) completado por Worker (${res.itemsCount || 0} items)`);
        } catch (err) {
            log(`❌ Error al refrescar carpeta '${orderData.path}': ${err.message}`);
            orderData.status = 'failed';
            orderData.error = err.message;
            orderData.completedAt = new Date().toISOString();
            orderData.processedBy = WORKER_ID;
            saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
        } finally {
            isProcessing = false;
            currentOrder = null;
            updateHeartbeat('idle', null);
        }
        return;
    }

    // Petición de consulta de metadata de Higgsfield para clientes offline
    if (orderData.type === 'query_higgsfield_job') {
        const jobId = orderData.jobId;
        log(`⚡ [HIGGSFIELD WORKER] Petición de consulta de Job recibida: ${jobId} (Usuario: ${orderData.user})`);
        orderData.status = 'processing';
        orderData.worker = WORKER_ID;
        orderData.startedAt = new Date().toISOString();
        saveOrderDataAcrossCandidates(orderData, pendingOrderFile);

        updateHeartbeat('querying_higgsfield', { jobId });

        try {
            const hfApi = require('./higgsfield_api');
            const details = await hfApi.fetchJobDetails(jobId);
            orderData.result = details;
            orderData.status = (details && details.success) ? 'completed' : 'failed';
            orderData.completedAt = new Date().toISOString();
            orderData.durationSeconds = Math.round((Date.now() - startTime) / 1000);
            orderData.processedBy = WORKER_ID;
            saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
            log(`✅ [HIGGSFIELD WORKER] Consulta de Job ${jobId} completada con éxito`);
        } catch (err) {
            log(`❌ [HIGGSFIELD WORKER] Error al consultar Job ${jobId}: ${err.message}`);
            orderData.status = 'failed';
            orderData.error = err.message;
            orderData.completedAt = new Date().toISOString();
            orderData.processedBy = WORKER_ID;
            saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
        } finally {
            isProcessing = false;
            currentOrder = null;
            updateHeartbeat('idle', null);
        }
        return;
    }

    const itemsCount = Array.isArray(orderData.items) ? orderData.items.length : 0;
    log(`🔔 Nueva orden tomada: ${orderData.id} [${orderData.type.toUpperCase()}] de usuario '${orderData.user}' (${itemsCount} items)`);

    // Marcar como en proceso
    orderData.status = 'processing';
    orderData.worker = WORKER_ID;
    orderData.startedAt = new Date().toISOString();
    saveOrderDataAcrossCandidates(orderData, pendingOrderFile);

    updateHeartbeat('processing', {
        orderId: orderData.id,
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
            // Comprobar si la orden fue cancelada antes de iniciar el siguiente item
            try {
                const fresh = fs.readJsonSync(pendingOrderFile);
                if (fresh.status === 'cancelled') {
                    wasCancelled = true;
                    orderData.status = 'cancelled';
                    orderData.cancelledAt = fresh.cancelledAt || new Date().toISOString();
                    orderData.cancelledBy = fresh.cancelledBy || 'user';
                    log(`🛑 Orden ${orderData.id} cancelada antes del item ${i + 1}`);
                    break;
                }
            } catch (e) {}

            const item = orderData.items[i];
            log(`  [${i + 1}/${orderData.items.length}] Procesando ${item.name || item.relPath || item.path}...`);

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

                    // Chequear si se solicitó cancelación durante la transferencia
                    try {
                        const fresh = fs.readJsonSync(pendingOrderFile);
                        if (fresh.status === 'cancelled') {
                            wasCancelled = true;
                            orderData.status = 'cancelled';
                            orderData.cancelledAt = fresh.cancelledAt || new Date().toISOString();
                            orderData.cancelledBy = fresh.cancelledBy || 'user';
                            log(`🛑 Cancelación durante transferencia detectada para orden ${orderData.id}. Abortando Rclone...`);
                            if (activeRcloneProc) {
                                try { activeRcloneProc.kill(); } catch (kErr) {}
                            }
                        }
                    } catch (e) {}

                    if (!wasCancelled) {
                        saveOrderDataAcrossCandidates(orderData, pendingOrderFile);
                        updateHeartbeat('processing', {
                            orderId: orderData.id,
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
                    log(`  ⏹ Transferencia de item interrumpida por cancelación de la orden`);
                    break;
                }
                failedCount++;
                log(`  ❌ Error en item ${item.name}: ${err.message}`);
                errors.push({ item: item.name, error: err.message });
            }
        }

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
        isProcessing = false;
        currentOrder = null;
        updateHeartbeat('idle', null);
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
