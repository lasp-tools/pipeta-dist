const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { writeJsonAtomicSync } = require('../core/json-atomic');
const { spawn, exec, execSync } = require('child_process');
const catalogGenerator = require('../sync_catalog_generator');
const {
    APP_ROOT,
    SERVER_DIR,
    runtimeState
} = require('../core/app-context');
const {
    RCLONE_PATH,
    rcloneAvailable,
    rcloneVersion,
    replicateEmptyDirectories
} = require('../core/rclone');
const {
    runEnvironmentDetection,
    checkInternetQuickly,
    getCachedEnvState,
    setLocationMode,
    PIPETA_SERVER_TOKEN,
    getPipetaServerCandidateUrls,
    isFreelanceLocked
} = require('../core/env-detector');
const {
    getLocalSyncCacheDir,
    getReadSyncCacheCandidateDirs,
    isLocalWorkerAliveQuick,
    UNC_CACHE,
    getCentralCacheDir,
    getOrdersDir,
    getAllOrdersCandidateDirs,
    saveOrderInCandidateDirs,
    isStudioCentralAvailable,
    centralServerRequest,
    getServerUncRoot,
    ensureServerUncAccess,
    formatSpeed,
    getDirectoryFilesAndSize,
    serverDirCache,
    rcloneDirCache,
    ordersFileMemoryCache,
    ordersResponseCache
} = require('../core/sync-paths');
const { activeLocalTransfers, runLocalTransferOrder } = require('../core/local-transfer');
const { resolveSmbCandidate, classifyFileComparison, getNextAvailableSuffixPath } = require('../core/catalog-paths');

const router = express.Router();

const pulledOrdersToLocal = new Set();
const runLocalTransfer = (orderId, orderData, filePath) =>
    runLocalTransferOrder(orderId, orderData, filePath, { ensureSyncWorkerRunning, catalogGenerator });

async function autoPullCompletedDownloadToVSub(order) {
    if (!order || order.status !== 'completed' || order.type !== 'download') return;
    if (pulledOrdersToLocal.has(order.id)) return;

    const cachedEnvState = getCachedEnvState();
    const isVsub = !global.isExternalMachine && !cachedEnvState?.zInfo?.isRealServer;
    if (!isVsub) return;

    const myHost = (os.hostname() || '').toLowerCase();
    const myUser = (os.userInfo ? os.userInfo().username : '').toLowerCase();
    const isMyOrder = (order.requestHost && order.requestHost.toLowerCase() === myHost) ||
                      (order.user && order.user.toLowerCase() === myUser);
    if (!isMyOrder) return;

    pulledOrdersToLocal.add(order.id);

    const items = order.items || [];
    if (!items.length) return;

    console.log(`[PULL TO VSUB] 📥 Orden #${order.id} completada en StorNext por Worker Central. Copiando a disco local vsubs Z:...`);

    const uncRoot = getServerUncRoot() || '//192.168.206.116/Z';
    if (uncRoot) {
        ensureServerUncAccess(uncRoot);
    }

    setImmediate(async () => {
        for (const it of items) {
            const destPath = (it.targetLocalPath || it.localPath || it.path || '').replace(/\\/g, '/');
            if (!destPath) continue;

            const srcCandidates = [
                destPath.replace(/^[a-zA-Z]:/i, 'S:'),
                destPath.replace(/^[a-zA-Z]:/i, uncRoot || '//192.168.206.116/Z')
            ];

            let foundSrc = null;
            for (const s of srcCandidates) {
                try {
                    if (fs.existsSync(s)) {
                        foundSrc = s;
                        break;
                    }
                } catch (e) {}
            }

            if (foundSrc) {
                try {
                    const st = fs.statSync(foundSrc);
                    if (st.isDirectory()) {
                        const q = String.fromCharCode(34);
                        exec(`robocopy ${q}${foundSrc}${q} ${q}${destPath}${q} /E /XO /XN /XC /NFL /NDL /NJH /NJS /R:1 /W:1`, () => {
                            console.log(`[PULL TO VSUB] ✅ Carpeta sincronizada a Z: local: ${destPath}`);
                        });
                    } else {
                        const destExists = fs.existsSync(destPath);
                        if (!destExists || (fs.statSync(destPath).size !== st.size)) {
                            await streamCopyFile(foundSrc, destPath, null);
                            console.log(`[PULL TO VSUB] ✅ Archivo sincronizado a Z: local: ${destPath}`);
                        }
                    }
                } catch (err) {
                    console.warn(`[PULL TO VSUB] Error copiando ${foundSrc} a ${destPath}:`, err.message);
                }
            }
        }
    });
}

function triggerStage2LocalPull(orderData) {
    if (!orderData || !orderData.id || activeLocalTransfers.has(orderData.id)) return;
    console.log(`[TWO-STAGE DOWNLOAD] 📥 Iniciando Etapa 2/2 (SMB -> Local) para orden ${orderData.id}...`);
    orderData.status = 'processing';
    orderData.currentStage = 2;
    orderData.stageLabel = 'Etapa 2/2: Copiando desde Servidor SMB a Disco Local...';
    orderData.worker = `local_${os.hostname()}`;
    const uncRoot = getServerUncRoot() || '//192.168.206.116/Z';
    if (Array.isArray(orderData.items)) {
        orderData.items.forEach(it => {
            const targetLocal = (it.targetLocalPath || it.localPath || it.path || '').replace(/\\/g, '/');
            it.serverPath = targetLocal.replace(/^[a-zA-Z]:/i, uncRoot);
        });
    }
    const ordersDir = getOrdersDir();
    const filePath = path.join(ordersDir, `${orderData.id}.json`);
    saveOrderInCandidateDirs(orderData.id, orderData);
    runLocalTransfer(orderData.id, orderData, filePath).catch(err => {
        console.error(`[TWO-STAGE DOWNLOAD] Error en Etapa 2/2 (${orderData.id}):`, err);
    });
}

function checkLocalWorkerRunning() {
    return isLocalWorkerAliveQuick();
}

function isCentralWorkerAlive() {
    try {
        const candidates = ['Z:/_SYNC_CACHE/worker_status.json', path.join(UNC_CACHE, 'worker_status.json')];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                const data = fs.readJsonSync(p);
                const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
                if (diff < 45 && !data.workerId?.includes('local_worker')) {
                    return true;
                }
            }
        }
    } catch (e) {}
    return false;
}

function startLocalWorkerBackground() {
    if (checkLocalWorkerRunning()) {
        return { success: true, pid: runtimeState.localWorkerPid, message: 'Worker local ya está en ejecución' };
    }

    const nodeExe = process.execPath;
    const workerScript = path.join(SERVER_DIR, 'sync_worker.js');

    const logDir = getLocalSyncCacheDir();
    try { fs.ensureDirSync(logDir); } catch (e) {}
    const logFile = path.join(logDir, 'local_worker.log');
    let outStream = 'ignore';
    try {
        outStream = fs.openSync(logFile, 'a');
    } catch (e) {}

    const child = spawn(nodeExe, [workerScript, '--local'], {
        detached: true,
        stdio: ['ignore', outStream, outStream],
        windowsHide: true,
        cwd: APP_ROOT,
        env: {
            ...process.env,
            PIPETA_LOCAL_WORKER: '1'
        }
    });

    child.on('exit', (code, signal) => {
        console.log(`[SYNC WORKER] Local Worker finalizó (código: ${code}, señal: ${signal})`);
        runtimeState.localWorkerProcess = null;
        runtimeState.localWorkerPid = null;
    });

    child.unref();
    runtimeState.localWorkerProcess = child;
    runtimeState.localWorkerPid = child.pid;

    console.log(`[SYNC WORKER] Local Worker iniciado en segundo plano (PID: ${runtimeState.localWorkerPid})`);
    return { success: true, pid: runtimeState.localWorkerPid, message: 'Worker local iniciado con éxito en segundo plano' };
}

function stopLocalWorker() {
    if (runtimeState.localWorkerPid) {
        try {
            process.kill(runtimeState.localWorkerPid);
            console.log(`[SYNC WORKER] Local Worker detenido por cambio de modo (PID: ${runtimeState.localWorkerPid})`);
        } catch (e) {}
        runtimeState.localWorkerProcess = null;
        runtimeState.localWorkerPid = null;
    }
}

function ensureSyncWorkerRunning() {
    const cachedEnvState = getCachedEnvState();
    const isExternal = !!(global.isExternalMachine || cachedEnvState?.isExternalMachine);
    if (!isExternal) {
        return; // Never auto-start in studio LAN workstations
    }

    if (isCentralWorkerAlive()) return;
    if (checkLocalWorkerRunning()) return;
    console.log('[SYNC WORKER] Equipo externo (Home Office) detectado sin worker central. Iniciando Worker Local automáticamente...');
    startLocalWorkerBackground();
}

let zombieCleanupDoneOnBoot = false;

function sanitizeZombieOrders(force = false) {
    if (!force && zombieCleanupDoneOnBoot && activeLocalTransfers.size === 0) return;
    zombieCleanupDoneOnBoot = true;
    try {
        const localReqDir = path.join(getLocalSyncCacheDir(), 'requests');
        const candidateDirs = [localReqDir];
        const myLocalWorkerId = 'local_' + os.hostname();

        for (const dir of candidateDirs) {
            if (!fs.existsSync(dir)) continue;
            let files = [];
            try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { continue; }
            for (const f of files) {
                const filePath = path.join(dir, f);
                try {
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (!content || !content.id) continue;

                    if (content.status === 'processing') {
                        const isLocalMachine = content.processedBy === myLocalWorkerId || content.workerId === myLocalWorkerId || !content.processedBy;
                        const isRunningInMemory = activeLocalTransfers.has(content.id);

                        if (isLocalMachine && !isRunningInMemory) {
                            content.status = 'interrupted';
                            content.error = 'Transferencia interrumpida al cerrar o reiniciar Pipeta';
                            content.currentSpeed = 'Interrumpido';
                            content.updatedAt = new Date().toISOString();
                            try {
                                writeJsonAtomicSync(filePath, content, 2);
                                console.log(`[ZOMBIE CLEANUP] Orden huérfana local ${content.id} saneada -> 'interrupted'`);
                            } catch (writeErr) {
                                console.warn(`[ZOMBIE CLEANUP] No se pudo actualizar orden ${content.id}:`, writeErr.message);
                            }
                        }
                    }

                    if (content.status === 'pending') {
                        const createdAtMs = content.createdAt ? new Date(content.createdAt).getTime() : 0;
                        const orderTs = parseInt((content.id.match(/_(\d{10,15})_/) || [])[1] || '0', 10);
                        const effectiveTs = createdAtMs || orderTs;
                        const ageMs = Date.now() - effectiveTs;

                        if (effectiveTs > 0 && ageMs > 3 * 3600 * 1000) {
                            content.status = 'cancelled';
                            content.cancelledAt = new Date().toISOString();
                            content.cancelledBy = 'system_zombie_cleaner';
                            content.error = 'Orden pendiente residual expirada (más de 3 horas sin worker)';
                            content.updatedAt = new Date().toISOString();
                            try {
                                writeJsonAtomicSync(filePath, content, 2);
                                console.log(`[ZOMBIE CLEANUP] Orden pendiente residual ${content.id} expirada -> 'cancelled'`);
                            } catch (writeErr) {
                                console.warn(`[ZOMBIE CLEANUP] No se pudo actualizar orden ${content.id}:`, writeErr.message);
                            }
                        }
                    }
                } catch (e) {}
            }
        }
    } catch (err) {
        console.warn('[ZOMBIE CLEANUP] Error en sanitizeZombieOrders:', err.message);
    }
}

async function forwardCancelToMasterServer(orderIds, user) {
    if (!orderIds || !orderIds.length) return;
    const urls = getPipetaServerCandidateUrls();
    for (const baseUrl of urls) {
        for (const oid of orderIds) {
            try {
                const url = `${baseUrl.replace(/\/+$/, '')}/api/server/task/${oid}/cancel`;
                await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-pipeta-token': PIPETA_SERVER_TOKEN
                    },
                    body: JSON.stringify({ user: user || 'user' }),
                    signal: AbortSignal.timeout(2000)
                });
            } catch (e) {}
        }
    }
}

async function forwardClearHistoryToMasterServer(user, role) {
    const urls = getPipetaServerCandidateUrls();
    for (const baseUrl of urls) {
        try {
            const url = `${baseUrl.replace(/\/+$/, '')}/api/server/queue/clear-history`;
            await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-pipeta-token': PIPETA_SERVER_TOKEN
                },
                body: JSON.stringify({ user: user || 'user', role: role || 'user' }),
                signal: AbortSignal.timeout(2500)
            });
        } catch (e) {}
    }
}

let lastCentralOrdersSyncTime = 0;
async function syncOrdersWithCentralMaster() {
    const urls = getPipetaServerCandidateUrls();
    for (const baseUrl of urls) {
        try {
            const url = `${baseUrl.replace(/\/+$/, '')}/api/server/queue`;
            const resp = await fetch(url, {
                headers: { 'x-pipeta-token': PIPETA_SERVER_TOKEN },
                signal: AbortSignal.timeout(3000)
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.success && Array.isArray(data.orders)) {
                    const centralOrderMap = new Map();
                    data.orders.forEach(o => { if (o && o.id) centralOrderMap.set(o.id, o); });

                    const localReqDir = path.join(getLocalSyncCacheDir(), 'requests');
                    if (fs.existsSync(localReqDir)) {
                        const files = fs.readdirSync(localReqDir).filter(f => f.endsWith('.json'));
                        for (const f of files) {
                            const p = path.join(localReqDir, f);
                            try {
                                const localOrder = fs.readJsonSync(p);
                                if (!localOrder || !localOrder.id) continue;

                                if (centralOrderMap.has(localOrder.id)) {
                                    const cOrder = centralOrderMap.get(localOrder.id);
                                    if (cOrder.status && cOrder.status !== localOrder.status) {
                                        localOrder.status = cOrder.status;
                                        if (cOrder.progress) localOrder.progress = cOrder.progress;
                                        localOrder.updatedAt = new Date().toISOString();
                                        writeJsonAtomicSync(p, localOrder, 2);
                                        ordersFileMemoryCache.delete(p);
                                    }
                                } else if (localOrder.status === 'pending') {
                                    const createdAtMs = localOrder.createdAt ? new Date(localOrder.createdAt).getTime() : 0;
                                    const orderTs = parseInt((localOrder.id.match(/_(\d{10,15})_/) || [])[1] || '0', 10);
                                    const ageMs = Date.now() - (createdAtMs || orderTs);
                                    if (ageMs > 25 * 60 * 1000) {
                                        localOrder.status = 'cancelled';
                                        localOrder.cancelledAt = new Date().toISOString();
                                        localOrder.cancelledBy = 'server_sync_cleanup';
                                        localOrder.error = 'No encontrada en servidor central (finalizada o eliminada)';
                                        writeJsonAtomicSync(p, localOrder, 2);
                                        ordersFileMemoryCache.delete(p);
                                        console.log(`[CENTRAL SYNC] Orden local huérfana ${localOrder.id} saneada -> 'cancelled'`);
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                    ordersResponseCache.time = 0;
                    break;
                }
            }
        } catch (e) {}
    }
}

function readOrderJsonCached(filePath) {
    try {
        const cached = ordersFileMemoryCache.get(filePath);
        if (cached && cached.isTerminal && (Date.now() - cached.checkedAt < 60000)) {
            return cached.data;
        }
        if (!fs.existsSync(filePath)) return null;
        const st = fs.statSync(filePath);
        if (cached && cached.mtimeMs === st.mtimeMs) {
            cached.checkedAt = Date.now();
            return cached.data;
        }
        let raw = fs.readFileSync(filePath, 'utf8');
        if (raw.includes('} },')) {
            raw = raw.replace('} },', '},');
        }
        if (raw.includes('} "completedAt"') || raw.includes('}\r\n "completedAt"') || raw.includes('}\n "completedAt"') || raw.includes('}completedAt"')) {
            raw = raw.replace(/\}\s*"?completedAt"?/g, ',\n  "status": "completed",\n  "completedAt"');
        }
        let content = null;
        try {
            content = JSON.parse(raw);
        } catch (parseErr) {
            let depth = 0;
            let endIdx = -1;
            for (let i = 0; i < raw.length; i++) {
                if (raw[i] === '{') depth++;
                else if (raw[i] === '}') {
                    depth--;
                    if (depth === 0) { endIdx = i; break; }
                }
            }
            if (endIdx > 0) {
                try {
                    content = JSON.parse(raw.substring(0, endIdx + 1));
                    if (raw.includes('completedAt') || raw.includes('"status": "completed"')) {
                        content.status = 'completed';
                    }
                } catch (e2) {}
            }
        }
        if (!content || !content.id) return null;
        const isTerminal = ['completed', 'completed_with_errors', 'failed', 'cancelled', 'interrupted'].includes(content?.status);
        ordersFileMemoryCache.set(filePath, {
            mtimeMs: st.mtimeMs,
            checkedAt: Date.now(),
            isTerminal,
            data: content
        });
        return content;
    } catch (e) {
        return null;
    }
}

let syncSupervisorTimer = null;
function startSyncSupervisor() {
    if (syncSupervisorTimer) return syncSupervisorTimer;
    syncSupervisorTimer = setInterval(() => {
        try {
            const cachedEnvState = getCachedEnvState();
            const isExternal = !!(global.isExternalMachine || cachedEnvState?.isExternalMachine);
            if (!isExternal) return;

            const localReqDir = path.join(getLocalSyncCacheDir(), 'requests');
            if (!fs.existsSync(localReqDir)) return;
            let files = [];
            try { files = fs.readdirSync(localReqDir).filter(f => f.endsWith('.json')); } catch (e) { return; }
            let hasPending = false;
            for (const f of files) {
                const data = readOrderJsonCached(path.join(localReqDir, f));
                if (data && data.status === 'pending' && data.type !== 'server_download' && data.type !== 'server_upload') {
                    hasPending = true;
                    break;
                }
            }
            if (hasPending) {
                ensureSyncWorkerRunning();
            }
        } catch (e) {}
    }, 5000);
    return syncSupervisorTimer;
}

// --- SYNC ROUTES ---
router.get('/api/sync/detect-env', async (req, res) => {
    try {
        const force = req.query.force === 'true';
        const cachedEnvState = getCachedEnvState();
        if (!force && cachedEnvState) {
            return res.json({ ...cachedEnvState, cached: true });
        }
        const state = await runEnvironmentDetection();
        res.json(state);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/set-location-mode', async (req, res) => {
    try {
        const { mode } = req.body;
        if (!['auto', 'studio', 'home'].includes(mode)) {
            return res.status(400).json({ success: false, error: 'Modo inválido. Valores permitidos: auto, studio, home' });
        }
        if (isFreelanceLocked() && mode !== 'home') {
            return res.status(403).json({ success: false, freelanceLocked: true, error: 'Instalación bloqueada en Modo Freelance (requiere usuario Admin para desbloquear)' });
        }
        setLocationMode(mode);
        if (mode === 'studio') {
            stopLocalWorker();
        }
        const state = await runEnvironmentDetection();
        console.log(`[ENV PERFIL] Perfil de ubicación cambiado manualmente a: ${mode.toUpperCase()} (isExternalMachine=${state.isExternalMachine})`);
        res.json({ success: true, locationMode: mode, env: state });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/sync/catalogs', async (req, res) => {
    try {
        const list = await catalogGenerator.listAvailableCatalogs();
        res.json({ success: true, catalogs: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/sync/catalog/:project', async (req, res) => {
    try {
        const projectName = req.params.project;
        const catalog = await catalogGenerator.loadProjectCatalog(projectName);
        if (!catalog) {
            return res.status(404).json({ success: false, error: `Catálogo no encontrado para el proyecto ${projectName}` });
        }
        res.json({ success: true, catalog });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/sync/server-catalog/:project', async (req, res) => {
    try {
        const cachedEnvState = getCachedEnvState();
        if (cachedEnvState && cachedEnvState.isExternalMachine) {
            return res.status(404).json({ success: false, isExternal: true, error: 'Catálogo de servidor deshabilitado en equipos externos' });
        }
        const projectName = req.params.project;
        if (typeof catalogGenerator.loadServerCatalog === 'function') {
            const catalog = await catalogGenerator.loadServerCatalog(projectName);
            if (catalog) {
                return res.json({ success: true, catalog });
            }
        }
        res.status(404).json({ success: false, error: `Catálogo de servidor no encontrado para ${projectName}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/sync/catalog/status/:project', (req, res) => {
    try {
        const projectName = req.params.project;
        const hasLocal = getReadSyncCacheCandidateDirs().some(d =>
            fs.existsSync(path.join(d, 'projects', projectName, 'drive', 'manifest.json'))
        );
        const netManifest = path.join('Z:/_SYNC_CACHE/projects', projectName, 'drive', 'manifest.json');
        const hasNetwork = fs.existsSync(netManifest);
        res.json({ success: true, project: projectName, hasLocalManifest: hasLocal, hasNetworkManifest: hasNetwork });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/api/sync/catalog/init-project', async (req, res) => {
    try {
        const { projectName } = req.body || {};
        if (!projectName) return res.status(400).json({ success: false, error: 'projectName requerido' });

        console.log(`[CATALOG INIT] Inicializando catálogo modular para proyecto: ${projectName}`);
        if (typeof catalogGenerator.syncLocalCacheFromNetwork === 'function') {
            catalogGenerator.syncLocalCacheFromNetwork(projectName);
        }

        let driveManifest = typeof catalogGenerator.getModularManifest === 'function'
            ? catalogGenerator.getModularManifest(projectName, 'drive')
            : null;

        if (!driveManifest && typeof catalogGenerator.generateProjectCatalog === 'function') {
            try {
                console.log(`[CATALOG INIT] Generando catálogo modular inicial para ${projectName}...`);
                await catalogGenerator.generateProjectCatalog(projectName, { mode: 'auto' });
                driveManifest = catalogGenerator.getModularManifest(projectName, 'drive');
            } catch (e) {
                console.warn(`[CATALOG INIT] No se pudo generar catálogo inicial de Drive: ${e.message}`);
            }
        }

        const serverManifest = typeof catalogGenerator.getModularManifest === 'function'
            ? catalogGenerator.getModularManifest(projectName, 'server')
            : null;

        res.json({
            success: true,
            project: projectName,
            hasDriveManifest: !!driveManifest,
            hasServerManifest: !!serverManifest,
            manifest: driveManifest || serverManifest
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/api/sync/catalog/clear-cache', (req, res) => {
    try {
        serverDirCache.clear();
        if (typeof catalogGenerator.clearMemoryCaches === 'function') {
            catalogGenerator.clearMemoryCaches();
        }
        res.json({ success: true, message: 'Caché de servidor y catálogos en memoria limpiada' });
    } catch (e) {
        res.json({ success: true });
    }
});

router.post('/api/sync/catalog/generate', async (req, res) => {
    try {
        const { project, mode, type } = req.body;
        if (!project) {
            return res.status(400).json({ success: false, error: 'Parámetro project requerido' });
        }
        serverDirCache.clear();

        const hasInternet = checkInternetQuickly();
        if (!hasInternet && (type === 'drive' || !type)) {
            const triggerFile = path.join(getOrdersDir(), '..', 'catalog_refresh_trigger.json');
            fs.ensureDirSync(path.dirname(triggerFile));
            fs.writeJsonSync(triggerFile, {
                project,
                mode: mode || 'auto',
                type: type || 'drive',
                requestedAt: new Date().toISOString()
            }, { spaces: 2 });
            return res.json({ success: true, delegated: true, message: `Petición enviada al Worker central para escanear ${project}` });
        }

        let result = {};
        if (type === 'server') {
            result = await catalogGenerator.generateServerCatalog(project, { mode: mode || 'auto' });
        } else if (type === 'drive') {
            result = await catalogGenerator.generateProjectCatalog(project, { mode: mode || 'auto' });
        } else {
            const driveRes = await catalogGenerator.generateProjectCatalog(project, { mode: mode || 'auto' }).catch(e => ({ error: e.message }));
            let serverRes = null;
            if (typeof catalogGenerator.generateServerCatalog === 'function') {
                serverRes = await catalogGenerator.generateServerCatalog(project, { mode: mode || 'auto' }).catch(e => ({ error: e.message }));
            }
            result = { success: true, drive: driveRes, server: serverRes };
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/catalog/check-freshness', async (req, res) => {
    try {
        const { project, type = 'drive', ttlSeconds = 20 } = req.body;
        if (!project) {
            return res.status(400).json({ success: false, error: 'Parámetro project requerido' });
        }

        const cachedEnvState = getCachedEnvState();
        const isExternal = !!(global.isExternalMachine || cachedEnvState?.isExternalMachine);
        const canon = (typeof catalogGenerator.resolveCanonicalProjectName === 'function')
            ? catalogGenerator.resolveCanonicalProjectName(project)
            : project;

        const effectiveTtl = Math.max(1, Number(ttlSeconds) || (isExternal ? 30 : 20));

        // 1. Verificar manifest local en SSD
        const localCacheDir = getLocalSyncCacheDir();
        const localManifest = path.join(localCacheDir, 'projects', canon, type, 'manifest.json');
        let localMtime = 0;
        let localExists = false;

        if (fs.existsSync(localManifest)) {
            try {
                localMtime = fs.statSync(localManifest).mtimeMs;
                localExists = true;
            } catch (e) {}
        }

        const now = Date.now();
        const localAgeSec = localExists ? Math.round((now - localMtime) / 1000) : 999999;

        // 2. En red de estudio (Munro): verificar si en el almacenamiento central hay un manifest más nuevo
        let hasNewerOnNetwork = false;
        let networkAgeSec = null;

        if (!isExternal) {
            const netCandidates = [
                path.join('S:/_SYNC_CACHE/projects', canon, type, 'manifest.json'),
                path.join('Z:/_SYNC_CACHE/projects', canon, type, 'manifest.json'),
                path.join(UNC_CACHE, 'projects', canon, type, 'manifest.json')
            ];

            for (const nc of netCandidates) {
                if (fs.existsSync(nc) && path.resolve(nc).toLowerCase() !== path.resolve(localManifest).toLowerCase()) {
                    try {
                        const netMtime = fs.statSync(nc).mtimeMs;
                        networkAgeSec = Math.round((now - netMtime) / 1000);
                        if (netMtime > localMtime + 500) {
                            hasNewerOnNetwork = true;
                        }
                        break;
                    } catch (e) {}
                }
            }

            // Si hay uno nuevo en red de estudio, sincronizarlo al SSD local inmediatamente
            if (hasNewerOnNetwork) {
                try {
                    if (typeof catalogGenerator.syncLocalCacheFromNetwork === 'function') {
                        catalogGenerator.syncLocalCacheFromNetwork(canon);
                    }
                } catch (e) {}
                return res.json({
                    success: true,
                    isFresh: true,
                    needRefresh: false,
                    syncedFromNetwork: true,
                    localAgeSec: 0,
                    networkAgeSec
                });
            }

            // También verificar con Pipeta Server si estamos en VM sin acceso directo
            const hasDirectServer = !!(fs.existsSync('S:/INTERNO') || fs.existsSync('//192.168.206.116/Z/INTERNO'));
            if (!hasDirectServer && !hasNewerOnNetwork) {
                try {
                    const serverUrls = (typeof catalogGenerator.getCentralServerUrls === 'function')
                        ? catalogGenerator.getCentralServerUrls()
                        : ['http://192.168.206.121:3005'];
                    for (const baseUrl of serverUrls) {
                        try {
                            const modUrl = `${baseUrl.replace(/\/+$/, '')}/api/sync/catalog/${encodeURIComponent(canon)}/modular?type=${type}`;
                            const srvResp = await fetch(modUrl, {
                                headers: { 'x-pipeta-token': PIPETA_SERVER_TOKEN },
                                signal: AbortSignal.timeout(1500)
                            });
                            if (srvResp.ok) {
                                const srvData = await srvResp.json();
                                if (srvData && srvData.generatedAt) {
                                    const srvTime = new Date(srvData.generatedAt).getTime();
                                    const srvAgeSec = Math.round((now - srvTime) / 1000);
                                    if (srvTime > localMtime + 1000) {
                                        // Servidor central tiene un catálogo más nuevo, descargarlo
                                        if (typeof catalogGenerator.fetchSubCatalogFromCentralServer === 'function') {
                                            catalogGenerator.fetchSubCatalogFromCentralServer(canon, type, 'manifest.json');
                                        }
                                        return res.json({
                                            success: true,
                                            isFresh: true,
                                            needRefresh: false,
                                            syncedFromCentralServer: true,
                                            srvAgeSec
                                        });
                                    }
                                    networkAgeSec = srvAgeSec;
                                }
                            }
                            break;
                        } catch (e) {}
                    }
                } catch (e) {}
            }
        }

        // 3. Evaluar frescura según TTL
        const effectiveAge = (networkAgeSec !== null) ? Math.min(localAgeSec, networkAgeSec) : localAgeSec;
        if (localExists && effectiveAge < effectiveTtl) {
            return res.json({
                success: true,
                isFresh: true,
                needRefresh: false,
                localAgeSec,
                networkAgeSec,
                effectiveTtl
            });
        }

        // Si expiró o no existe: requiere refresco
        return res.json({
            success: true,
            isFresh: false,
            needRefresh: true,
            localAgeSec,
            networkAgeSec,
            effectiveTtl,
            isExternal
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/catalog/refresh-folder', async (req, res) => {
    try {
        const { project, path: folderPath, type: reqType } = req.body;
        if (!project || !folderPath) {
            return res.status(400).json({ success: false, error: 'Parámetros project y path requeridos' });
        }

        const cachedEnvState = getCachedEnvState();
        const safeP = folderPath.replace(/\\/g, '/');
        const isServer = reqType === 'server';
        const catType = isServer ? 'server' : 'drive';
        const isExternal = !!(global.isExternalMachine || cachedEnvState?.isExternalMachine);

        serverDirCache.clear();
        if (typeof catalogGenerator.clearMemoryCaches === 'function') {
            catalogGenerator.clearMemoryCaches();
        }

        const hasRealServer = !!(fs.existsSync('S:/INTERNO') || fs.existsSync('//192.168.206.116/Z/INTERNO') || (cachedEnvState?.zInfo?.isRealServer && typeof catalogGenerator.isZDriveNetwork === 'function' && catalogGenerator.isZDriveNetwork()));

        if (catType === 'server' && !isExternal && hasRealServer && typeof catalogGenerator.refreshSubCatalog === 'function') {
            try {
                const srvModularRes = await catalogGenerator.refreshSubCatalog(project, safeP, 'server');
                if (srvModularRes && srvModularRes.success) {
                    serverDirCache.clear();
                    if (typeof catalogGenerator.clearMemoryCaches === 'function') {
                        catalogGenerator.clearMemoryCaches();
                    }
                    if (typeof catalogGenerator.clearFreshnessCache === 'function') {
                        catalogGenerator.clearFreshnessCache(project, 'server');
                    }
                    return res.json(srvModularRes);
                }
            } catch (localModularErr) {
                console.warn('[CATALOG REFRESH FOLDER] Falló refreshSubCatalog directo:', localModularErr.message);
            }
        }

        if (catType === 'server') {
            if (isExternal) {
                return res.status(404).json({ success: false, isExternal: true, error: 'Catálogo de servidor no disponible en modo remoto' });
            }
            if (!hasRealServer || !fs.existsSync(safeP)) {
                console.log(`[CATALOG REFRESH FOLDER] Equipo sin acceso físico directo a '${safeP}'. Delegando a Pipeta Server...`);
                const serverUrls = typeof catalogGenerator.getCentralServerUrls === 'function'
                    ? catalogGenerator.getCentralServerUrls()
                    : ['http://192.168.206.121:3005'];
                let lastErr = null;
                for (const baseUrl of serverUrls) {
                    try {
                        const postUrl = `${baseUrl.replace(/\/+$/, '')}/api/server/refresh-folder`;
                        const postPayload = {
                            project,
                            path: folderPath,
                            type: catType,
                            user: (os.userInfo ? os.userInfo().username : 'unknown')
                        };

                        const fetchResp = await fetch(postUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-pipeta-token': 'lasp-pipeta-sec-token-2026'
                            },
                            body: JSON.stringify(postPayload),
                            signal: AbortSignal.timeout(6000)
                        });

                        const parsed = await fetchResp.json();
                        if (parsed && parsed.success) {
                            serverDirCache.clear();
                            if (typeof catalogGenerator.clearMemoryCaches === 'function') {
                                catalogGenerator.clearMemoryCaches();
                            }
                            if (typeof catalogGenerator.clearFreshnessCache === 'function') {
                                catalogGenerator.clearFreshnessCache(project, 'server');
                            }
                            // Hidratar inmediatamente manifest y subcatálogo desde Pipeta Server (HTTP)
                            if (typeof catalogGenerator.fetchSubCatalogFromCentralServer === 'function') {
                                try {
                                    catalogGenerator.fetchSubCatalogFromCentralServer(project, 'server', 'manifest.json');
                                    const subName = parsed.subCatalog || (parsed.result && parsed.result.subCatalog);
                                    if (subName) {
                                        catalogGenerator.fetchSubCatalogFromCentralServer(project, 'server', subName);
                                    }
                                } catch (fErr) {}
                            }
                            return res.json(parsed.result || { success: true, fromPipetaServer: true, subCatalog: parsed.subCatalog, itemsCount: parsed.itemsCount });
                        } else if (parsed && parsed.error) {
                            lastErr = parsed.error;
                        }
                    } catch (e) {
                        lastErr = e.message;
                    }
                }
                if (lastErr) {
                    return res.status(500).json({ success: false, error: lastErr });
                }
            }
        }

        if (catType === 'drive') {
            const hasInternet = checkInternetQuickly();
            if (hasInternet) {
                if (typeof catalogGenerator.refreshSubCatalog === 'function') {
                    try {
                        const modularRes = await catalogGenerator.refreshSubCatalog(project, safeP, 'drive');
                        if (modularRes && modularRes.success) {
                            return res.json(modularRes);
                        }
                    } catch (localModularErr) {
                        console.warn('[CATALOG REFRESH FOLDER] Falló refreshSubCatalog (drive):', localModularErr.message);
                    }
                }
                try {
                    const result = await catalogGenerator.refreshCatalogSubfolder(project, folderPath);
                    if (result && result.success) {
                        return res.json(result);
                    }
                } catch (localErr) {
                    console.warn('[CATALOG REFRESH FOLDER] Falló ejecución local rclone:', localErr.message);
                }
            }
        }

        if (isExternal) {
            return res.status(500).json({ success: false, error: 'No se pudo refrescar la carpeta en modo remoto (verifique conexión o ejecute worker local)' });
        }

        console.log(`[CATALOG REFRESH FOLDER] Delegando consulta de '${folderPath}' (${catType}) al Worker central en servidor...`);
        const ordersDir = getOrdersDir();
        if (!fs.existsSync(ordersDir)) {
            fs.mkdirSync(ordersDir, { recursive: true });
        }

        const reqId = `rf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const reqFile = path.join(ordersDir, `${reqId}.json`);

        fs.writeJsonSync(reqFile, {
            id: reqId,
            type: 'refresh_folder',
            project,
            path: folderPath,
            targetType: catType,
            status: 'pending',
            priority: 90,
            user: os.userInfo ? os.userInfo().username : 'unknown',
            createdAt: new Date().toISOString()
        }, { spaces: 2 });

        const waitStart = Date.now();
        while (Date.now() - waitStart < 15000) {
            await new Promise(r => setTimeout(r, 400));
            if (fs.existsSync(reqFile)) {
                try {
                    const data = fs.readJsonSync(reqFile);
                    if (data.status === 'completed') {
                        try { fs.removeSync(reqFile); } catch (e) {}
                        serverDirCache.clear();
                        rcloneDirCache.clear();
                        if (typeof catalogGenerator.clearMemoryCaches === 'function') {
                            catalogGenerator.clearMemoryCaches();
                        }
                        if (typeof catalogGenerator.syncLocalCacheFromNetwork === 'function') {
                            try { catalogGenerator.syncLocalCacheFromNetwork(project); } catch (e) {}
                        }
                        return res.json(data.result || { success: true, delegated: true });
                    } else if (data.status === 'failed') {
                        try { fs.removeSync(reqFile); } catch (e) {}
                        return res.status(500).json({ success: false, error: data.error || 'Worker no pudo refrescar la carpeta' });
                    }
                } catch (readErr) {}
            }
        }

        return res.status(504).json({ success: false, error: 'Tiempo de espera agotado esperando al Worker de sincronización' });
    } catch (err) {
        console.error('[CATALOG REFRESH FOLDER] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/request-download', async (req, res) => {
    try {
        const { project, items, user, transferType, type } = req.body;
        if (!project || !items || !items.length) {
            return res.status(400).json({ success: false, error: 'Parámetros project e items son requeridos' });
        }

        const cachedEnvState = getCachedEnvState();
        const isExternal = !!(global.isExternalMachine || cachedEnvState?.isExternalMachine);

        const ordersDir = getOrdersDir();
        if (!fs.existsSync(ordersDir)) {
            fs.mkdirSync(ordersDir, { recursive: true });
        }

        const isServer = transferType === 'server' || type === 'server_download';
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const priority = Math.min(100, Math.max(1, Number(req.body.priority) || 50));
        const orderData = {
            id: orderId,
            type: isServer ? 'server_download' : 'download',
            project,
            user: user || (os.userInfo ? os.userInfo().username : 'unknown'),
            requestHost: os.hostname(),
            createdAt: new Date().toISOString(),
            status: isServer ? 'processing' : 'pending',
            priority,
            items
        };

        const filePath = saveOrderInCandidateDirs(orderId, orderData);

        let allExistOnCentral = false;
        if (!isServer && !isExternal && !cachedEnvState?.zInfo?.isRealServer) {
            try {
                const uncRoot = getServerUncRoot() || '//192.168.206.116/Z';
                if (uncRoot) ensureServerUncAccess(uncRoot);
                allExistOnCentral = items.every(it => {
                    const targetLocal = (it.targetLocalPath || it.localPath || it.path || '').replace(/\\/g, '/');
                    if (!targetLocal) return false;
                    const sCand = targetLocal.replace(/^[a-zA-Z]:/i, 'S:');
                    const uncCand = targetLocal.replace(/^[a-zA-Z]:/i, uncRoot);
                    return fs.existsSync(sCand) || fs.existsSync(uncCand);
                });
            } catch (e) {
                allExistOnCentral = false;
            }
        }

        if (allExistOnCentral) {
            console.log(`[SYNC ORDER] 🚀 Optimización LAN: Todos los ítems solicitados ya residen en StorNext. Copiando directamente al disco local: ${orderId}`);
            orderData.type = 'server_download';
            orderData.stageLabel = 'Descargando desde Servidor Central (LAN Fast-Lane)...';
            orderData.status = 'processing';
            orderData.targetHost = os.hostname();
            const uncRoot = getServerUncRoot() || '//192.168.206.116/Z';
            items.forEach(it => {
                const targetLocal = (it.targetLocalPath || it.localPath || it.path || '').replace(/\\/g, '/');
                it.serverPath = targetLocal.replace(/^[a-zA-Z]:/i, uncRoot);
            });
            saveOrderInCandidateDirs(orderId, orderData);
            runLocalTransfer(orderId, orderData, filePath).catch(err => {
                console.error(`[LOCAL DOWNLOAD] Error en orden optimizada ${orderId}:`, err);
            });
            return res.json({ success: true, orderId, count: items.length, status: 'processing', priority, source: 'stornext_fast_lane' });
        }

        if (isServer) {
            console.log(`[SYNC ORDER] Orden de descarga de SERVIDOR iniciada localmente: ${orderId} (${items.length} items) [Prioridad: ${priority}]`);
            runLocalTransfer(orderId, orderData, filePath).catch(err => {
                console.error(`[LOCAL DOWNLOAD] Error en orden ${orderId}:`, err);
            });
            res.json({ success: true, orderId, count: items.length, status: 'processing', priority });
        } else if (!isExternal && isNotRealServer) {
            // MUNRO CON Z VIRTUAL: Descarga desde Google Drive en 2 etapas:
            // Etapa 1: Worker central descarga desde Drive a StorNext SMB
            // Etapa 2: Copia LAN automática desde StorNext SMB a disco local Z:
            orderData.twoStage = true;
            orderData.twoStageType = 'download';
            orderData.type = 'download';
            orderData.currentStage = 1;
            orderData.stageLabel = 'Etapa 1/2: Worker Central descargando de Drive a Servidor SMB...';
            orderData.status = 'pending';
            orderData.requestHost = os.hostname();
            orderData.targetRole = 'central_worker';
            const uncRoot = getServerUncRoot() || '//192.168.206.116/Z';
            items.forEach(it => {
                const targetLocal = (it.targetLocalPath || it.localPath || it.path || '').replace(/\\/g, '/');
                it.serverPath = targetLocal.replace(/^[a-zA-Z]:/i, uncRoot);
            });
            saveOrderInCandidateDirs(orderId, orderData);
            console.log(`[SYNC ORDER] 🚀 Descarga desde Drive en 2 ETAPAS iniciada: ${orderId} (${items.length} items) - Etapa 1: Drive -> Z SMB`);
            ensureSyncWorkerRunning();
            return res.json({ success: true, orderId, count: items.length, status: 'pending', priority, twoStage: true });
        } else {
            console.log(`[SYNC ORDER] Orden de descarga de DRIVE creada para Worker: ${orderId} (${items.length} items) para ${project} [Prioridad: ${priority}]`);
            ensureSyncWorkerRunning();
            res.json({ success: true, orderId, count: items.length, status: 'pending', priority });
        }
    } catch (err) {
        console.error('Sync request-download error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/request-upload', async (req, res) => {
    try {
        const { project, items, user, transferType, type } = req.body;
        if (!project || !items || !items.length) {
            return res.status(400).json({ success: false, error: 'Parámetros project e items son requeridos' });
        }

        const ordersDir = getOrdersDir();
        if (!fs.existsSync(ordersDir)) {
            fs.mkdirSync(ordersDir, { recursive: true });
        }

        const isServer = transferType === 'server' || type === 'server_upload';

        const sanitizedItems = items.map(it => {
            const itemCopy = { ...it };
            if (!isServer) {
                const currentOnline = itemCopy.onlinePath || itemCopy.targetOnlinePath;
                const isAlreadyDrive = currentOnline && (
                    currentOnline.toLowerCase().startsWith('g:/') ||
                    currentOnline.toLowerCase().includes('unidades compartidas') ||
                    currentOnline.toLowerCase().startsWith('lasp-drive:')
                );
                if (!isAlreadyDrive) {
                    const localP = itemCopy.localPath || itemCopy.path || itemCopy.targetLocalPath;
                    const resolvedOnline = (typeof catalogGenerator.resolveLocalToOnlinePath === 'function')
                        ? catalogGenerator.resolveLocalToOnlinePath(localP, project)
                        : null;
                    if (resolvedOnline) {
                        itemCopy.onlinePath = resolvedOnline;
                    }
                }
            }
            return itemCopy;
        });

        const orderId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const priority = Math.min(100, Math.max(1, Number(req.body.priority) || 50));
        const env = getCachedEnvState() || {};
        const isNotRealServer = !env?.zInfo?.isRealServer || (typeof isZRealServer === 'function' && !isZRealServer());
        const isExternal = !!env.isExternalMachine;

        const orderData = {
            id: orderId,
            type: isServer ? 'server_upload' : 'upload',
            project,
            user: user || (os.userInfo ? os.userInfo().username : 'unknown'),
            createdAt: new Date().toISOString(),
            status: isServer ? 'processing' : 'pending',
            priority,
            items: sanitizedItems
        };

        if (isServer) {
            const filePath = saveOrderInCandidateDirs(orderId, orderData);
            console.log(`[SYNC ORDER] Orden de subida a SERVIDOR iniciada localmente: ${orderId} (${items.length} items) [Prioridad: ${priority}]`);
            runLocalTransfer(orderId, orderData, filePath).catch(err => {
                console.error(`[LOCAL UPLOAD] Error en orden ${orderId}:`, err);
            });
            return res.json({ success: true, orderId, count: items.length, status: 'processing', priority });
        }

        if (isNotRealServer && !isExternal) {
            // MUNRO CON Z VIRTUAL: Subida a Drive en 2 etapas dentro de la misma tarea:
            // Etapa 1: Copiar local Z vsub -> StorNext SMB (\\192.168.206.116\Z)
            // Etapa 2: Worker central sube desde StorNext SMB a Google Drive
            const uncRoot = getServerUncRoot() || '//192.168.206.116/Z';
            if (uncRoot) ensureServerUncAccess(uncRoot);

            sanitizedItems.forEach(it => {
                const srcPath = (it.localPath || it.path || '').replace(/\\/g, '/');
                it.targetServerPath = srcPath.replace(/^[a-zA-Z]:/i, uncRoot);
            });

            // Fast-Lane: Si TODOS los archivos ya existen con idéntico tamaño en StorNext SMB y no se forzó overwrite:
            let allExistOnSmbAndIdentical = false;
            if (req.body.conflictResolution !== 'overwrite') {
                try {
                    const pairsToCheck = [];
                    for (const it of sanitizedItems) {
                        const localP = (it.localPath || it.path || '').replace(/\\/g, '/');
                        if (!localP || !fs.existsSync(localP)) continue;
                        const isDir = it.isDir || fs.statSync(localP).isDirectory();
                        if (!isDir) {
                            pairsToCheck.push({ localFile: localP, smbFile: it.targetServerPath, knownSize: null });
                        } else {
                            const scan = getDirectoryFilesAndSize(localP);
                            for (const f of scan.files) {
                                pairsToCheck.push({
                                    localFile: f.fullPath,
                                    smbFile: f.fullPath.replace(/^[a-zA-Z]:/i, uncRoot),
                                    knownSize: f.size
                                });
                            }
                        }
                    }

                    let identicalChecked = 0;
                    let failedAny = false;
                    const FL_BATCH = 32;
                    for (let i = 0; i < pairsToCheck.length && !failedAny; i += FL_BATCH) {
                        const batch = pairsToCheck.slice(i, i + FL_BATCH);
                        await Promise.all(batch.map(async ({ localFile, smbFile, knownSize }) => {
                            if (failedAny) return;
                            try {
                                const smbStat = await fs.promises.stat(smbFile);
                                const locSize = knownSize !== null ? knownSize : (await fs.promises.stat(localFile)).size;
                                if (smbStat.size === locSize) {
                                    identicalChecked++;
                                } else {
                                    failedAny = true;
                                }
                            } catch (e) {
                                failedAny = true;
                            }
                        }));
                    }
                    if (pairsToCheck.length > 0 && !failedAny && identicalChecked === pairsToCheck.length) {
                        allExistOnSmbAndIdentical = true;
                    }
                } catch (e) {
                    allExistOnSmbAndIdentical = false;
                }
            }

            if (allExistOnSmbAndIdentical) {
                // FAST-LANE DIRECTO A ETAPA 2 (Worker Central -> Drive)
                orderData.twoStage = true;
                orderData.twoStageType = 'upload';
                orderData.currentStage = 2;
                orderData.stageLabel = 'Etapa 2/2: En cola con Worker Central (Subiendo a Drive)...';
                orderData.status = 'pending';
                orderData.targetRole = 'central_worker';
                orderData.fastLaneSmbSkipped = true;
                orderData.conflictResolution = req.body.conflictResolution || 'default';

                const filePath = saveOrderInCandidateDirs(orderId, orderData);
                console.log(`[SYNC ORDER] ⚡ FAST-LANE: Archivos ya idénticos en StorNext SMB. Saltando Etapa 1 directamente a Worker Central: ${orderId} (${items.length} items)`);
                ensureSyncWorkerRunning();
                return res.json({ success: true, orderId, count: items.length, status: 'pending', priority, twoStage: true, fastLane: true });
            }

            orderData.twoStage = true;
            orderData.twoStageType = 'upload';
            orderData.currentStage = 1;
            orderData.stageLabel = 'Etapa 1/2: Copiando a Servidor SMB...';
            orderData.status = 'processing';
            orderData.worker = `local_${os.hostname()}`;
            orderData.targetHost = os.hostname();
            orderData.conflictResolution = req.body.conflictResolution || 'default';

            const filePath = saveOrderInCandidateDirs(orderId, orderData);
            console.log(`[SYNC ORDER] 🚀 Subida a Drive en 2 ETAPAS iniciada: ${orderId} (${items.length} items) - Etapa 1: Local -> Z SMB`);
            runLocalTransfer(orderId, orderData, filePath).catch(err => {
                console.error(`[TWO-STAGE UPLOAD] Error en Etapa 1 (${orderId}):`, err);
            });
            return res.json({ success: true, orderId, count: items.length, status: 'processing', priority, twoStage: true });
        }

        if (isNotRealServer && isExternal) {
            // FREELANCE HOME: Sube derecho con Rclone local a Google Drive
            orderData.targetHost = os.hostname();
            const filePath = saveOrderInCandidateDirs(orderId, orderData);
            console.log(`[SYNC ORDER] Orden de subida a DRIVE (Freelance Home): ${orderId} (${items.length} items) para ${project}`);
            startLocalWorkerBackground();
            return res.json({ success: true, orderId, count: items.length, status: 'pending', priority });
        }

        // Puesto con Z SMB Real
        const filePath = saveOrderInCandidateDirs(orderId, orderData);
        console.log(`[SYNC ORDER] Orden de subida a DRIVE creada para Worker Central: ${orderId} (${items.length} items) para ${project} [Prioridad: ${priority}]`);
        ensureSyncWorkerRunning();
        res.json({ success: true, orderId, count: items.length, status: 'pending', priority });
    } catch (err) {
        console.error('Sync request-upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/check-upload-conflicts', async (req, res) => {
    try {
        const { project, items = [], targetType = 'drive' } = req.body;
        const env = getCachedEnvState() || {};
        const isNotRealServer = !env?.zInfo?.isRealServer || (typeof isZRealServer === 'function' && !isZRealServer());
        const isExternal = !!env.isExternalMachine;

        // Solo aplica en máquinas con Z virtual y acceso a SMB
        if (!isNotRealServer || isExternal) {
            return res.json({ success: true, hasConflicts: false, allIdentical: false, conflicts: [], summary: { totalFiles: 0, identical: 0, conflicts: 0, missing: 0 } });
        }

        const uncRoot = getServerUncRoot() || '//192.168.206.116/Z';
        if (uncRoot) ensureServerUncAccess(uncRoot);

        const conflicts = [];
        let totalFiles = 0;
        let identicalCount = 0;
        let missingCount = 0;
        const filesToCheck = [];

        for (const it of items) {
            const localP = (it.localPath || it.path || '').replace(/\\/g, '/');
            if (!localP || !fs.existsSync(localP)) continue;

            const isDir = it.isDir || fs.statSync(localP).isDirectory();
            if (!isDir) {
                filesToCheck.push({
                    localFilePath: localP,
                    displayRelPath: path.basename(localP),
                    displayName: it.name || path.basename(localP)
                });
            } else {
                const dirScan = getDirectoryFilesAndSize(localP);
                for (const f of dirScan.files) {
                    filesToCheck.push({
                        localFilePath: f.fullPath,
                        displayRelPath: f.relPath,
                        displayName: path.basename(f.relPath)
                    });
                }
            }
        }

        const BATCH_SIZE = 32;
        for (let i = 0; i < filesToCheck.length; i += BATCH_SIZE) {
            const batch = filesToCheck.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async ({ localFilePath, displayRelPath, displayName }) => {
                totalFiles++;
                const smbP = resolveSmbCandidate(localFilePath, uncRoot);
                try {
                    const [stLocal, stSmb] = await Promise.all([
                        fs.promises.stat(localFilePath),
                        fs.promises.stat(smbP)
                    ]);
                    // Si tienen exactamente el mismo tamaño (>0), es el mismo archivo aunque la copia SMB tenga otro mtime
                    if (stLocal.size === stSmb.size && stLocal.size > 0) {
                        identicalCount++;
                        return;
                    }
                    const status = classifyFileComparison(stLocal, stSmb);
                    if (status === 'identical') {
                        identicalCount++;
                    } else {
                        conflicts.push({
                            name: displayName || path.basename(localFilePath),
                            relativePath: displayRelPath || path.basename(localFilePath),
                            localPath: localFilePath,
                            smbPath: smbP,
                            type: status,
                            localSize: stLocal.size,
                            smbSize: stSmb.size,
                            localMtime: new Date(stLocal.mtimeMs).toISOString(),
                            smbMtime: new Date(stSmb.mtimeMs).toISOString()
                        });
                    }
                } catch (e) {
                    missingCount++;
                }
            }));
        }

        const allIdentical = totalFiles > 0 && identicalCount === totalFiles;
        const hasConflicts = conflicts.length > 0;

        return res.json({
            success: true,
            hasConflicts,
            allIdentical,
            conflicts,
            summary: {
                totalFiles,
                identical: identicalCount,
                conflicts: conflicts.length,
                missing: missingCount
            }
        });
    } catch (err) {
        console.error('Error in check-upload-conflicts:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Cache en memoria para sets de rutas de Drive por subcatálogo (evita re-parsear JSONs de 20+ MB en cada clic).
 */
const modularDriveSetCache = new Map();
const modularDriveSetInFlight = new Map();

function normDriveLookupPath(p) {
    return (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * Obtiene o pre-calienta en memoria el Set de rutas locales presentes en Drive para una carpeta/proyecto.
 * @param {string} project
 * @param {string} cleanFolder
 * @returns {Promise<Set<string>|null>}
 */
async function getOrWarmDriveSet(project, cleanFolder) {
    if (!project) return null;
    const canonProj = (typeof catalogGenerator.resolveCanonicalProjectName === 'function')
        ? catalogGenerator.resolveCanonicalProjectName(project)
        : project;
    const modDir = canonProj ? path.join(getLocalSyncCacheDir(), 'projects', canonProj, 'drive') : null;
    const normClean = normDriveLookupPath(cleanFolder);

    if (modDir && fs.existsSync(modDir)) {
        const manifestPath = path.join(modDir, 'manifest.json');
        let subFiles = [];
        if (fs.existsSync(manifestPath)) {
            try {
                const man = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
                const subs = man && man.subCatalogs ? Object.values(man.subCatalogs) : [];
                const matched = subs.filter(s => {
                    const pref = (s.prefix || '').toLowerCase();
                    return pref && (normClean.includes('/' + pref + '/') || normClean.endsWith('/' + pref));
                });
                subFiles = (matched.length > 0 ? matched : subs).map(s => s.file).filter(Boolean);
            } catch (e) {}
        }
        if (subFiles.length === 0) {
            const collectJson = (dir, base = '') => {
                for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                    const rel = base ? `${base}/${ent.name}` : ent.name;
                    if (ent.isDirectory()) collectJson(path.join(dir, ent.name), rel);
                    else if (ent.name.endsWith('.json') && ent.name !== 'manifest.json') subFiles.push(rel);
                }
            };
            try { collectJson(modDir); } catch (e) {}
        }

        const cacheKey = `${canonProj}::${subFiles.slice().sort().join(',')}`;
        const mtimeSig = subFiles.map(sf => {
            try { return fs.statSync(path.join(modDir, sf)).mtimeMs; } catch (e) { return 0; }
        }).join('|');

        const cachedEntry = modularDriveSetCache.get(cacheKey);
        if (cachedEntry && cachedEntry.mtimeSig === mtimeSig) {
            return cachedEntry.set;
        }
        if (modularDriveSetInFlight.has(cacheKey)) {
            return modularDriveSetInFlight.get(cacheKey);
        }

        const loadPromise = (async () => {
            const drvSet = new Set();
            for (const sf of subFiles) {
                const fp = path.join(modDir, sf);
                if (!fs.existsSync(fp)) continue;
                try {
                    const raw = await fs.promises.readFile(fp, 'utf8');
                    const data = JSON.parse(raw);
                    const arr = data.items || data.flatList || data;
                    if (Array.isArray(arr)) {
                        for (const it of arr) {
                            if (it && it.targetLocalPath) drvSet.add(normDriveLookupPath(it.targetLocalPath));
                        }
                    }
                } catch (e) {}
            }
            if (drvSet.size > 0) {
                modularDriveSetCache.set(cacheKey, { ts: Date.now(), mtimeSig, set: drvSet });
                return drvSet;
            }
            return null;
        })();

        modularDriveSetInFlight.set(cacheKey, loadPromise);
        try {
            const resSet = await loadPromise;
            if (resSet) return resSet;
        } finally {
            modularDriveSetInFlight.delete(cacheKey);
        }
    }

    const drvCatalog = await catalogGenerator.loadProjectCatalog(project);
    if (drvCatalog && Array.isArray(drvCatalog.flatList)) {
        const drvSet = new Set();
        for (const it of drvCatalog.flatList) {
            if (it && it.targetLocalPath) drvSet.add(normDriveLookupPath(it.targetLocalPath));
        }
        if (drvSet.size > 0) return drvSet;
    }
    return null;
}

router.warmDriveSetForPath = (project, folderPath) => {
    if (!project || !folderPath) return;
    setImmediate(() => {
        getOrWarmDriveSet(project, folderPath).catch(() => {});
    });
};

/**
 * Resuelve únicamente los archivos o subcarpetas dentro de una carpeta local
 * que aún no existen en el destino (Drive o Servidor Central).
 */
router.post('/api/sync/resolve-pending-folder-upload', async (req, res) => {
    try {
        const { project, folderPath, targetType = 'drive' } = req.body || {};
        const cleanFolder = (folderPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
        if (!cleanFolder || !fs.existsSync(cleanFolder) || !fs.statSync(cleanFolder).isDirectory()) {
            return res.status(400).json({ success: false, error: 'Carpeta local inválida o inexistente' });
        }

        const normPath = (p) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        const env = getCachedEnvState() || {};
        const isNotRealServer = !env?.zInfo?.isRealServer || (typeof isZRealServer === 'function' && !isZRealServer());
        const isExternal = !!env.isExternalMachine;
        const uncRoot = getServerUncRoot() || '//192.168.206.116/Z';

        let existsOnTarget = () => false;
        let useSmbDirListing = false;

        if (targetType === 'server') {
            if (isNotRealServer && !isExternal) {
                if (uncRoot) ensureServerUncAccess(uncRoot);
                useSmbDirListing = true;
            } else if (project && typeof catalogGenerator.loadServerCatalog === 'function') {
                const srvCatalog = await catalogGenerator.loadServerCatalog(project);
                const srvSet = new Set();
                if (srvCatalog && Array.isArray(srvCatalog.flatList)) {
                    for (const it of srvCatalog.flatList) {
                        if (it.targetLocalPath) srvSet.add(normPath(it.targetLocalPath));
                    }
                }
                existsOnTarget = (localP) => srvSet.has(normPath(localP));
            }
        } else {
            const drvSet = await getOrWarmDriveSet(project, cleanFolder);
            if (!drvSet || drvSet.size === 0) {
                return res.json({ success: false, fallbackFullFolder: true, error: 'Catálogo de Drive no disponible' });
            }
            existsOnTarget = (localP) => drvSet.has(normPath(localP));
        }

        const IGNORED_NAMES = new Set(['_gsdata_', '.git', 'node_modules', 'thumbs.db', 'desktop.ini', '.ds_store']);
        const pendingItems = [];
        let totalBytes = 0;

        const walkPending = (dirPath, relPrefix = '') => {
            let entries = [];
            try {
                entries = fs.readdirSync(dirPath, { withFileTypes: true });
            } catch (e) {
                return;
            }
            let smbDirNames = null;
            if (useSmbDirListing) {
                smbDirNames = new Set();
                try {
                    const smbDir = resolveSmbCandidate(dirPath, uncRoot);
                    for (const name of fs.readdirSync(smbDir)) {
                        smbDirNames.add(name.toLowerCase());
                    }
                } catch (e) {}
            }
            const entryExistsOnTarget = (entryName, fullP) => {
                if (smbDirNames !== null) return smbDirNames.has(entryName.toLowerCase());
                return existsOnTarget(fullP);
            };
            const dirPendingFiles = [];
            const dirPendingDirs = [];

            for (const entry of entries) {
                const lower = entry.name.toLowerCase();
                if (IGNORED_NAMES.has(lower) || lower.endsWith('.tmp')) continue;

                const fullP = `${dirPath}/${entry.name}`;
                const relP = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

                if (entry.isDirectory()) {
                    if (!entryExistsOnTarget(entry.name, fullP)) {
                        pendingItems.push({
                            name: entry.name,
                            isDir: true,
                            localPath: fullP,
                            relativePath: relP,
                            size: 0
                        });
                    } else {
                        dirPendingDirs.push({ fullP, relP });
                    }
                } else {
                    if (!entryExistsOnTarget(entry.name, fullP)) {
                        dirPendingFiles.push({ entry, fullP, relP });
                    }
                }
            }

            // Si hay > 5 archivos sueltos faltantes dentro de una subcarpeta, colapsar la subcarpeta a isDir:true
            // para que rclone copy use --transfers 8 en paralelo en lugar de N procesos copyto secuenciales.
            if (dirPath !== cleanFolder && dirPendingFiles.length > 5 && dirPendingDirs.length === 0) {
                pendingItems.push({
                    name: path.posix.basename(dirPath),
                    isDir: true,
                    localPath: dirPath,
                    relativePath: relPrefix || path.posix.basename(dirPath),
                    size: 0
                });
                return;
            }

            for (const { entry, fullP, relP } of dirPendingFiles) {
                pendingItems.push({
                    name: entry.name,
                    isDir: false,
                    localPath: fullP,
                    relativePath: relP,
                    size: 0
                });
            }

            for (const sub of dirPendingDirs) {
                walkPending(sub.fullP, sub.relP);
            }
        };

        walkPending(cleanFolder);

        // Calcular tamaño real de TODOS los pendingItems en paralelo (con límite de tiempo de 2.5s)
        const sizeDeadline = Date.now() + 2500;
        const calcDirSizeAsync = async (dPath) => {
            if (Date.now() > sizeDeadline) return 0;
            let sum = 0;
            let ents;
            try {
                ents = await fs.promises.readdir(dPath, { withFileTypes: true });
            } catch (e) {
                return 0;
            }
            const fileStats = [];
            const subDirs = [];
            for (const ent of ents) {
                const l = ent.name.toLowerCase();
                if (IGNORED_NAMES.has(l) || l.endsWith('.tmp')) continue;
                const p = `${dPath}/${ent.name}`;
                if (ent.isDirectory()) subDirs.push(p);
                else fileStats.push(fs.promises.stat(p).then(st => st.size || 0).catch(() => 0));
            }
            if (fileStats.length > 0) {
                const sizes = await Promise.all(fileStats);
                for (const s of sizes) sum += s;
            }
            for (const sd of subDirs) {
                if (Date.now() > sizeDeadline) break;
                sum += await calcDirSizeAsync(sd);
            }
            return sum;
        };

        const BATCH = 64;
        for (let idx = 0; idx < pendingItems.length; idx += BATCH) {
            if (Date.now() > sizeDeadline) break;
            const slice = pendingItems.slice(idx, idx + BATCH);
            await Promise.all(slice.map(async (it) => {
                try {
                    it.size = it.isDir
                        ? await calcDirSizeAsync(it.localPath)
                        : ((await fs.promises.stat(it.localPath)).size || 0);
                    totalBytes += it.size;
                } catch (e) {}
            }));
        }

        return res.json({ success: true, items: pendingItems, count: pendingItems.length, totalBytes });
    } catch (err) {
        console.error('Error in resolve-pending-folder-upload:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/resolve-upload-conflict', async (req, res) => {
    try {
        const { project, items = [], conflicts = [], action = 'rename_01' } = req.body;
        if (action !== 'rename_01') {
            return res.json({ success: true, action, items });
        }

        const renamedMap = new Map();

        for (const c of conflicts) {
            const targetPath = (c.localPath || '').replace(/\\/g, '/');
            if (targetPath && fs.existsSync(targetPath)) {
                try {
                    const { newName, newPath } = getNextAvailableSuffixPath(targetPath);
                    fs.renameSync(targetPath, newPath);
                    renamedMap.set(targetPath, { oldPath: targetPath, newPath, newName });
                    console.log(`[CONFLICT RESOLVE] Renombrado local de protección: ${path.basename(targetPath)} -> ${newName}`);
                } catch (renErr) {
                    console.error(`[CONFLICT RESOLVE] Error renombrando ${targetPath}:`, renErr.message);
                }
            }
        }

        const updatedItems = items.map(it => {
            const normP = (it.localPath || it.path || '').replace(/\\/g, '/');
            if (renamedMap.has(normP)) {
                const info = renamedMap.get(normP);
                const updated = { ...it, path: info.newPath, localPath: info.newPath, name: info.newName };
                if (typeof catalogGenerator.resolveLocalToOnlinePath === 'function') {
                    const resOnline = catalogGenerator.resolveLocalToOnlinePath(info.newPath, project);
                    if (resOnline) updated.onlinePath = resOnline;
                }
                return updated;
            }
            return it;
        });

        return res.json({ success: true, action: 'rename_01', items: updatedItems, renamed: Array.from(renamedMap.values()) });
    } catch (err) {
        console.error('Error in resolve-upload-conflict:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/sync/orders', async (req, res) => {
    try {
        sanitizeZombieOrders(false);

        const now = Date.now();
        if ((global.isExternalMachine || !fs.existsSync('Z:/_SYNC_CACHE')) && (now - lastCentralOrdersSyncTime > 4000)) {
            lastCentralOrdersSyncTime = now;
            syncOrdersWithCentralMaster().catch(() => {});
        }

        const { user, role, onlyMyTasks } = req.query;
        let orders = [];

        if (activeLocalTransfers.size === 0 && (now - ordersResponseCache.time < 1500)) {
            orders = ordersResponseCache.rawOrders.map(o => ({ ...o }));
        } else {
            const candidateDirs = getAllOrdersCandidateDirs();
            const seenOrders = new Set();
            let centralFetchedOk = false;
            const terminalStatuses = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled']);

            const mergeAndHookOrder = (content) => {
                if (!content || !content.id || seenOrders.has(content.id)) return;
                if (content.type === 'refresh_folder') return;
                seenOrders.add(content.id);
                if (activeLocalTransfers.has(content.id)) {
                    const act = activeLocalTransfers.get(content.id);
                    if (act && act.orderData) {
                        Object.assign(content, JSON.parse(JSON.stringify(act.orderData)));
                    }
                }
                content.priority = Number.isFinite(content.priority)
                    ? content.priority
                    : (content.type === 'higgsfield_ingest' || content.type === 'refresh_folder' ? 80 : 50);
                orders.push(content);
                if (content.status === 'completed' && content.type === 'download') {
                    autoPullCompletedDownloadToVSub(content);
                }
                if (content.twoStage && content.twoStageType === 'download' && content.status === 'pending_local_pull') {
                    const isTarget = content.targetHost && content.targetHost.toLowerCase() === os.hostname().toLowerCase();
                    if (isTarget && !activeLocalTransfers.has(content.id)) {
                        triggerStage2LocalPull(content);
                    }
                }
            };

            if (isStudioCentralAvailable()) {
                const centralRes = await centralServerRequest('GET', '/api/server/queue', null, 1500);
                if (centralRes && centralRes.ok && centralRes.data && centralRes.data.success && Array.isArray(centralRes.data.orders)) {
                    centralFetchedOk = true;
                    for (const centralOrder of centralRes.data.orders) {
                        mergeAndHookOrder({ ...centralOrder });
                    }
                }
            }

            for (const dir of candidateDirs) {
                if (!fs.existsSync(dir)) continue;
                let files = [];
                try {
                    files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
                    files.sort((a, b) => {
                        const ta = parseInt((a.match(/_(\d{10,15})_/) || [])[1] || '0', 10);
                        const tb = parseInt((b.match(/_(\d{10,15})_/) || [])[1] || '0', 10);
                        return tb - ta;
                    });
                    files = files.slice(0, 35);
                } catch (e) { continue; }

                for (const f of files) {
                    const fullP = path.join(dir, f);
                    if (f.startsWith('rf_')) {
                        try {
                            const st = fs.statSync(fullP);
                            if (now - st.mtimeMs > 30000) {
                                fs.unlinkSync(fullP);
                                continue;
                            }
                        } catch (e) {}
                    }

                    const content = readOrderJsonCached(fullP);
                    if (content && content.id && !seenOrders.has(content.id)) {
                        if (centralFetchedOk && terminalStatuses.has(content.status)) {
                            continue;
                        }
                        mergeAndHookOrder(content);
                    }
                }
            }

            for (const [activeId, active] of activeLocalTransfers.entries()) {
                if (!seenOrders.has(activeId) && active && active.orderData) {
                    seenOrders.add(activeId);
                    orders.unshift(JSON.parse(JSON.stringify(active.orderData)));
                }
            }

            orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            ordersResponseCache.time = now;
            ordersResponseCache.rawOrders = orders;
        }

        const isAdmin = role === 'admin' || role === 'administrator' || role === 'superuser' || role === 'lead';
        if (user && !isAdmin && onlyMyTasks !== 'false') {
            const reqUser = user.toLowerCase();
            orders = orders.filter(o => {
                const oUser = (o.user || '').toLowerCase();
                return oUser === reqUser || oUser === 'artista' || oUser === 'user' || oUser === 'unknown' || !oUser;
            });
        } else if (user && isAdmin && onlyMyTasks === 'true') {
            const reqUser = user.toLowerCase();
            orders = orders.filter(o => {
                const oUser = (o.user || '').toLowerCase();
                return oUser === reqUser || oUser === 'artista' || oUser === 'user' || oUser === 'unknown' || !oUser;
            });
        }

        res.json({ success: true, orders: orders.slice(0, 50) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/orders/priority', async (req, res) => {
    try {
        const { orderId, priority } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, error: 'orderId es requerido' });
        }
        const prioNum = Math.min(100, Math.max(1, parseInt(priority, 10) || 50));
        const candidateDirs = getAllOrdersCandidateDirs();
        let found = false;
        for (const dir of candidateDirs) {
            const filePath = path.join(dir, `${orderId}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const orderData = fs.readJsonSync(filePath);
                    orderData.priority = prioNum;
                    orderData.priorityUpdatedAt = new Date().toISOString();
                    writeJsonAtomicSync(filePath, orderData, 2);
                    ordersFileMemoryCache.delete(filePath);
                    ordersResponseCache.time = 0;
                    found = true;
                } catch (e) {
                    // Si el JSON quedó corrupto por escritura concurrente, eliminarlo para destrabar la cola
                    try {
                        fs.unlinkSync(filePath);
                        ordersFileMemoryCache.delete(filePath);
                        ordersResponseCache.time = 0;
                        found = true;
                        console.warn(`[SYNC ORDER] JSON corrupto eliminado al actualizar prioridad: ${filePath}`);
                    } catch (_) {}
                }
            }
        }
        if (isStudioCentralAvailable()) {
            const centralRes = await centralServerRequest('POST', `/api/server/task/${encodeURIComponent(orderId)}/priority`, { priority: prioNum }, 2000);
            if (centralRes && centralRes.ok && centralRes.data && centralRes.data.success) {
                found = true;
                ordersResponseCache.time = 0;
            }
        }
        if (!found) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }
        console.log(`[SYNC ORDER] Prioridad de orden ${orderId} cambiada a ${prioNum}`);
        res.json({ success: true, orderId, priority: prioNum });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/orders/cancel', async (req, res) => {
    try {
        const { orderId, user, role } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, error: 'orderId es requerido' });
        }

        if (activeLocalTransfers.has(orderId)) {
            const activeTransfer = activeLocalTransfers.get(orderId);
            activeTransfer.isCancelled = true;
            try { activeTransfer.abortController.abort(); } catch (e) {}
            console.log(`[LOCAL TRANSFER] Señal de aborto enviada a transferencia local activa: ${orderId}`);
        }

        const candidateDirs = getAllOrdersCandidateDirs();
        let found = false;
        for (const dir of candidateDirs) {
            const filePath = path.join(dir, `${orderId}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const orderData = fs.readJsonSync(filePath);
                    const isAdmin = role === 'admin' || role === 'administrator' || role === 'superuser' || role === 'lead';
                    if (user && !isAdmin && orderData.user && orderData.user.toLowerCase() !== user.toLowerCase() && orderData.user !== 'artista') {
                        return res.status(403).json({ success: false, error: 'No tienes permisos para cancelar esta tarea' });
                    }
                    orderData.status = 'cancelled';
                    orderData.cancelledAt = new Date().toISOString();
                    orderData.cancelledBy = user || 'user';
                    if (orderData.progress) {
                        orderData.progress.speedFormatted = 'Cancelado';
                        orderData.progress.etaSeconds = 0;
                    }
                    writeJsonAtomicSync(filePath, orderData, 2);
                    ordersFileMemoryCache.delete(filePath);
                    ordersResponseCache.time = 0;
                    found = true;
                } catch (e) {
                    // Si el JSON quedó corrupto por escritura concurrente, eliminarlo para destrabar la cola
                    try {
                        fs.unlinkSync(filePath);
                        ordersFileMemoryCache.delete(filePath);
                        ordersResponseCache.time = 0;
                        found = true;
                        console.warn(`[SYNC ORDER] JSON corrupto eliminado al cancelar: ${filePath}`);
                    } catch (_) {}
                }
            }
        }
        let centralCancelled = false;
        if (isStudioCentralAvailable()) {
            const centralRes = await centralServerRequest('POST', `/api/server/task/${encodeURIComponent(orderId)}/cancel`, { user: user || 'user', role }, 2000);
            if (centralRes && centralRes.ok && centralRes.data && centralRes.data.success) {
                found = true;
                centralCancelled = true;
                ordersResponseCache.time = 0;
            }
        }
        if (!found) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        console.log(`[SYNC ORDER] Orden ${orderId} marcada como CANCELADA por '${user || 'user'}'`);
        if (!centralCancelled && !isFreelanceLocked()) {
            forwardCancelToMasterServer([orderId], user).catch(() => {});
        }
        res.json({ success: true, message: 'Orden cancelada exitosamente', status: 'cancelled' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/orders/cancel-all', async (req, res) => {
    try {
        const { user, role } = req.body;
        const isAdmin = role === 'admin' || role === 'administrator' || role === 'superuser' || role === 'lead';
        const candidateDirs = getAllOrdersCandidateDirs();
        let cancelledCount = 0;
        const nowIso = new Date().toISOString();
        const cancelledIds = [];

        for (const [activeId, active] of activeLocalTransfers.entries()) {
            const orderUser = active.orderData?.user || '';
            if (isAdmin || !user || orderUser.toLowerCase() === user.toLowerCase() || orderUser === 'artista') {
                active.isCancelled = true;
                try { active.abortController.abort(); } catch (e) {}
                cancelledIds.push(activeId);
            }
        }
        for (const cid of cancelledIds) {
            activeLocalTransfers.delete(cid);
        }

        for (const dir of candidateDirs) {
            if (!fs.existsSync(dir)) continue;
            let files = [];
            try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { continue; }
            for (const f of files) {
                const filePath = path.join(dir, f);
                try {
                    const orderData = fs.readJsonSync(filePath);
                    if (!orderData || !orderData.id) continue;
                    if (orderData.status !== 'pending' && orderData.status !== 'processing') continue;

                    const oUser = (orderData.user || '').toLowerCase();
                    if (!isAdmin && user && oUser && oUser !== user.toLowerCase() && oUser !== 'artista') {
                        continue;
                    }

                    orderData.status = 'cancelled';
                    orderData.cancelledAt = nowIso;
                    orderData.cancelledBy = user || 'user';
                    if (orderData.progress) {
                        orderData.progress.speedFormatted = 'Cancelado';
                        orderData.progress.etaSeconds = 0;
                    }
                    writeJsonAtomicSync(filePath, orderData, 2);
                    ordersFileMemoryCache.delete(filePath);
                    cancelledCount++;
                    if (!cancelledIds.includes(orderData.id)) {
                        cancelledIds.push(orderData.id);
                    }
                } catch (e) {
                    // Limpiar JSONs corruptos durante cancelación masiva
                    try {
                        fs.unlinkSync(filePath);
                        ordersFileMemoryCache.delete(filePath);
                        cancelledCount++;
                        console.warn(`[SYNC ORDERS] JSON corrupto eliminado en cancel-all: ${filePath}`);
                    } catch (_) {}
                }
            }
        }

        ordersResponseCache.time = 0;
        forwardCancelToMasterServer(cancelledIds, user).catch(() => {});

        console.log(`[SYNC ORDERS] Cancelación masiva ejecutada por '${user || 'user'}': ${cancelledCount} orden(es) cancelada(s).`);
        res.json({ success: true, cancelledCount, cancelledIds });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/orders/clear-history', (req, res) => {
    try {
        const { user, role } = req.body;
        const candidateDirs = getAllOrdersCandidateDirs();
        const isAdmin = role === 'admin' || role === 'administrator' || role === 'superuser' || role === 'lead';
        const finishedStatuses = ['completed', 'completed_with_errors', 'failed', 'cancelled'];
        let clearedCount = 0;

        for (const dir of candidateDirs) {
            if (!fs.existsSync(dir)) continue;
            let files = [];
            try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { continue; }
            for (const f of files) {
                const filePath = path.join(dir, f);
                try {
                    const data = readOrderJsonCached(filePath) || fs.readJsonSync(filePath);
                    if (finishedStatuses.includes(data.status)) {
                        if (!user || isAdmin || (data.user && (data.user.toLowerCase() === user.toLowerCase() || data.user === 'artista'))) {
                            fs.removeSync(filePath);
                            ordersFileMemoryCache.delete(filePath);
                            clearedCount++;
                        }
                    }
                } catch (e) {}
            }
        }
        ordersResponseCache.time = 0;
        console.log(`[SYNC ORDER] Historial limpiado: ${clearedCount} órdenes eliminadas por '${user || 'user'}'`);
        forwardClearHistoryToMasterServer(user, role).catch(() => {});
        res.json({ success: true, clearedCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/sync/worker/local-status', (req, res) => {
    try {
        const isRunning = checkLocalWorkerRunning();
        let heartbeatAlive = false;
        let diffSeconds = 999;
        let workerHostname = null;

        try {
            const statusFile = path.join(getCentralCacheDir(), 'worker_status.json');
            if (fs.existsSync(statusFile)) {
                const data = fs.readJsonSync(statusFile);
                diffSeconds = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
                heartbeatAlive = diffSeconds < 25 && (data.workerId?.includes('local_worker') || data.hostname === os.hostname());
                workerHostname = data.hostname;
            }
        } catch (e) {}

        const active = isRunning || heartbeatAlive;
        res.json({
            success: true,
            isRunning: active,
            pid: runtimeState.localWorkerPid || null,
            hostname: workerHostname || os.hostname(),
            diffSeconds: Math.round(diffSeconds)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/worker/start-local', (req, res) => {
    try {
        const result = startLocalWorkerBackground();
        res.json(result);
    } catch (err) {
        console.error('[SYNC WORKER] Error iniciando worker local:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/sync/worker/stop-local', (req, res) => {
    try {
        let killed = false;
        if (runtimeState.localWorkerPid) {
            try {
                execSync(`taskkill /PID ${runtimeState.localWorkerPid} /T /F`, { stdio: 'ignore' });
                killed = true;
            } catch (e) {
                try { process.kill(runtimeState.localWorkerPid, 'SIGKILL'); killed = true; } catch (err) {}
            }
            runtimeState.localWorkerProcess = null;
            runtimeState.localWorkerPid = null;
        }

        try {
            const statusFile = path.join(getCentralCacheDir(), 'worker_status.json');
            if (fs.existsSync(statusFile)) {
                const data = fs.readJsonSync(statusFile);
                if (data.workerId && data.workerId.includes('local_worker')) {
                    fs.removeSync(statusFile);
                }
            }
            const localStatusFile = path.join(getLocalSyncCacheDir(), 'worker_status.json');
            if (fs.existsSync(localStatusFile)) {
                fs.removeSync(localStatusFile);
            }
        } catch (e) {}

        console.log('[SYNC WORKER] Local Worker detenido');
        res.json({ success: true, message: killed ? 'Worker local detenido exitosamente' : 'No había worker activo' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/sync/worker/logs', (req, res) => {
    try {
        const logFile = path.join(getCentralCacheDir(), 'local_worker.log');
        const fallbackLog = path.join(getLocalSyncCacheDir(), 'local_worker.log');
        const target = fs.existsSync(logFile) ? logFile : (fs.existsSync(fallbackLog) ? fallbackLog : null);
        if (!target) {
            return res.json({ success: true, logs: 'No hay registros del worker aún.' });
        }
        const content = fs.readFileSync(target, 'utf8');
        const lines = content.split('\n');
        const lastLines = lines.slice(-80).join('\n');
        res.json({ success: true, logs: lastLines });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

let cachedWorkerStatusResp = { time: 0, payload: null };

router.get('/api/sync/worker-status', (req, res) => {
    try {
        const now = Date.now();
        if (cachedWorkerStatusResp.payload && (now - cachedWorkerStatusResp.time < 2500)) {
            return res.json(cachedWorkerStatusResp.payload);
        }

        const isLocalRunning = checkLocalWorkerRunning();

        try {
            const localStatusFile = path.join(getLocalSyncCacheDir(), 'worker_status.json');
            if (fs.existsSync(localStatusFile)) {
                const localData = fs.readJsonSync(localStatusFile);
                const diffSeconds = (Date.now() - new Date(localData.lastPing).getTime()) / 1000;
                if (diffSeconds < 25 && (localData.workerId?.includes('local_worker') || isLocalRunning)) {
                    localData.isAlive = true;
                    localData.diffSeconds = Math.round(diffSeconds);
                    localData.isLocal = true;
                    const payload = { success: true, status: localData, isLocalWorkerRunning: true };
                    cachedWorkerStatusResp = { time: now, payload };
                    return res.json(payload);
                }
            }
        } catch (e) {}

        const centralCache = getCentralCacheDir();
        const statusFile = path.join(centralCache, 'worker_status.json');
        if (fs.existsSync(statusFile)) {
            const status = fs.readJsonSync(statusFile);
            const diffSeconds = (Date.now() - new Date(status.lastPing).getTime()) / 1000;
            status.isAlive = diffSeconds < 45;
            status.diffSeconds = Math.round(diffSeconds);
            const isLocal = isLocalRunning || (status.workerId && status.workerId.includes('local_worker')) || status.hostname === os.hostname();
            status.isLocal = isLocal;
            const payload = { success: true, status, isLocalWorkerRunning: isLocalRunning || (isLocal && status.isAlive) };
            cachedWorkerStatusResp = { time: now, payload };
            return res.json(payload);
        }

        const payload = {
            success: true,
            status: { isAlive: false, message: 'Worker no detectado' },
            isLocalWorkerRunning: isLocalRunning
        };
        cachedWorkerStatusResp = { time: now, payload };
        res.json(payload);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- RCLONE INTEGRATION ROUTES ---
router.get('/api/rclone/status', (req, res) => {
    res.json({
        available: rcloneAvailable,
        version: rcloneVersion,
        path: RCLONE_PATH
    });
});

router.post('/api/rclone/syncStream', async (req, res) => {
    const { items, onlyFolders = false, direction = 'push' } = req.body;
    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Missing items array' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    function fmtSpeed(bytesPerSec) {
        if (bytesPerSec >= 1024 * 1024 * 1024) return (bytesPerSec / (1024 * 1024 * 1024)).toFixed(1) + ' GB/s';
        if (bytesPerSec >= 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
        if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
        return bytesPerSec.toFixed(0) + ' B/s';
    }

    function fmtEta(seconds) {
        if (!seconds || seconds <= 0 || !isFinite(seconds)) return '0s';
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins < 60) return `${mins}m ${secs}s`;
        const hours = Math.floor(mins / 60);
        const remMins = mins % 60;
        return `${hours}h ${remMins}m`;
    }

    let totalBytesAll = 0;
    const fileStatsList = [];
    for (const item of items) {
        let size = 0;
        if (!onlyFolders && !item.onlyFolders && !item.isDirectory) {
            try {
                if (fs.existsSync(item.src)) {
                    const st = fs.statSync(item.src);
                    size = st.size;
                }
            } catch (e) { size = 0; }
        }
        fileStatsList.push({ ...item, size });
        totalBytesAll += size;
    }

    let totalTransferredBytes = 0;
    const startTime = Date.now();
    const results = [];
    const dirLabel = direction === 'push' ? 'Subida (Upload)' : 'Descarga (Download)';

    for (let i = 0; i < fileStatsList.length; i++) {
        const item = fileStatsList[i];
        const baseName = path.basename(item.src) || (item.isDirectory ? 'Carpeta' : 'Archivo');

        try {
            if (onlyFolders || item.onlyFolders) {
                if (item.isDirectory) {
                    await replicateEmptyDirectories(item.src, item.dest);
                } else {
                    await fs.ensureDir(path.dirname(item.dest));
                }
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'mkdir_only' });

                const totalPct = Math.round(((i + 1) / fileStatsList.length) * 100);
                res.write(JSON.stringify({
                    type: 'progress',
                    direction: dirLabel,
                    itemIndex: i + 1,
                    totalItems: fileStatsList.length,
                    filename: baseName,
                    filePercent: 100,
                    totalPercent: totalPct,
                    speedText: 'Estructura',
                    etaText: '--'
                }) + '\n');
                continue;
            }

            if (item.isDirectory) {
                await fs.ensureDir(item.dest);
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'mkdir' });
                const totalPct = totalBytesAll > 0
                    ? Math.round((totalTransferredBytes / totalBytesAll) * 100)
                    : Math.round(((i + 1) / fileStatsList.length) * 100);
                res.write(JSON.stringify({
                    type: 'progress',
                    direction: dirLabel,
                    itemIndex: i + 1,
                    totalItems: fileStatsList.length,
                    filename: `📁 ${baseName}`,
                    filePercent: 100,
                    totalPercent: totalPct,
                    speedText: 'Carpeta',
                    etaText: '--'
                }) + '\n');
                continue;
            }

            await fs.ensureDir(path.dirname(item.dest));

            if (!item.size || item.size === 0) {
                await fs.copyFile(item.src, item.dest);
                totalTransferredBytes += (item.size || 0);
            } else {
                await new Promise((resolve, reject) => {
                    let isResolved = false;
                    const safeResolve = () => {
                        if (!isResolved) {
                            isResolved = true;
                            resolve();
                        }
                    };
                    const safeReject = (err) => {
                        if (!isResolved) {
                            isResolved = true;
                            reject(err);
                        }
                    };

                    const readStream = fs.createReadStream(item.src);
                    const writeStream = fs.createWriteStream(item.dest);
                    let fileTransferred = 0;
                    let lastProgressEmit = Date.now();

                    readStream.on('data', (chunk) => {
                        fileTransferred += chunk.length;
                        totalTransferredBytes += chunk.length;

                        const now = Date.now();
                        if (now - lastProgressEmit > 100 || fileTransferred >= item.size) {
                            lastProgressEmit = now;
                            const elapsedSec = Math.max(0.1, (now - startTime) / 1000);
                            const speedBytesPerSec = totalTransferredBytes / elapsedSec;
                            const remainingBytes = Math.max(0, totalBytesAll - totalTransferredBytes);
                            const etaSec = speedBytesPerSec > 0 ? Math.round(remainingBytes / speedBytesPerSec) : 0;

                            const filePct = item.size > 0 ? Math.min(100, Math.round((fileTransferred / item.size) * 100)) : 100;
                            const totalPct = totalBytesAll > 0 ? Math.min(100, Math.round((totalTransferredBytes / totalBytesAll) * 100)) : Math.round(((i + 1) / fileStatsList.length) * 100);

                            res.write(JSON.stringify({
                                type: 'progress',
                                direction: dirLabel,
                                itemIndex: i + 1,
                                totalItems: fileStatsList.length,
                                filename: baseName,
                                filePercent: filePct,
                                totalPercent: totalPct,
                                speedText: fmtSpeed(speedBytesPerSec),
                                etaText: fmtEta(etaSec)
                            }) + '\n');
                        }
                    });

                    readStream.on('error', safeReject);
                    writeStream.on('error', safeReject);
                    writeStream.on('finish', safeResolve);
                    writeStream.on('close', safeResolve);

                    readStream.pipe(writeStream);
                });
            }

            const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
            const speedBytesPerSec = totalTransferredBytes / elapsedSec;
            const remainingBytes = Math.max(0, totalBytesAll - totalTransferredBytes);
            const etaSec = speedBytesPerSec > 0 ? Math.round(remainingBytes / speedBytesPerSec) : 0;
            const totalPct = totalBytesAll > 0 ? Math.min(100, Math.round((totalTransferredBytes / totalBytesAll) * 100)) : Math.round(((i + 1) / fileStatsList.length) * 100);

            res.write(JSON.stringify({
                type: 'progress',
                direction: dirLabel,
                itemIndex: i + 1,
                totalItems: fileStatsList.length,
                filename: baseName,
                filePercent: 100,
                totalPercent: totalPct,
                speedText: fmtSpeed(speedBytesPerSec),
                etaText: fmtEta(etaSec)
            }) + '\n');

            results.push({ src: item.src, dest: item.dest, success: true, engine: 'stream' });
        } catch (err) {
            console.error(`[SYNC STREAM] Error on ${item.src}:`, err);
            results.push({ src: item.src, dest: item.dest, success: false, error: err.message });
        }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.write(JSON.stringify({
        type: 'complete',
        direction: dirLabel,
        total: fileStatsList.length,
        succeeded,
        failed,
        results
    }) + '\n');
    res.end();
});

router.post('/api/rclone/syncBatch', async (req, res) => {
    const { items, engine = 'auto', onlyFolders = false } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Missing items array' });

    const results = [];
    const useRclone = (engine === 'rclone' && rcloneAvailable) || (engine === 'auto' && rcloneAvailable);
    const usedEngine = onlyFolders ? 'mkdir_only' : (useRclone ? 'rclone' : 'native');

    if (!onlyFolders && engine === 'rclone' && !rcloneAvailable) {
        return res.status(503).json({ error: 'Rclone forced but not available', engine: 'none' });
    }

    for (const item of items) {
        try {
            if (onlyFolders || item.onlyFolders) {
                if (item.isDirectory) {
                    await replicateEmptyDirectories(item.src, item.dest);
                } else {
                    await fs.ensureDir(path.dirname(item.dest));
                }
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'mkdir_only' });
                continue;
            }

            if (useRclone) {
                try {
                    await new Promise((resolve, reject) => {
                        const args = item.isDirectory
                            ? ['copy', item.src, item.dest, '--create-empty-src-dirs', '--ignore-size', '--inplace', '--no-check-dest']
                            : ['copyto', item.src, item.dest, '--ignore-size', '--inplace', '--no-check-dest'];

                        console.log(`[RCLONE] ${args.join(' ')}`);
                        const proc = spawn(RCLONE_PATH, args, { windowsHide: true });

                        let stderr = '';
                        proc.stderr.on('data', d => { stderr += d.toString(); });
                        proc.on('close', code => {
                            if (code === 0) resolve();
                            else reject(new Error(`rclone exit ${code}: ${stderr}`));
                        });
                        proc.on('error', reject);
                    });
                    results.push({ src: item.src, dest: item.dest, success: true, engine: 'rclone' });
                } catch (rErr) {
                    console.warn(`[RCLONE] Fallback nativo activado tras aviso: ${rErr.message}`);
                    if (item.isDirectory) {
                        await fs.ensureDir(item.dest);
                    } else {
                        await fs.ensureDir(path.dirname(item.dest));
                    }
                    await fs.copy(item.src, item.dest, { overwrite: true });
                    results.push({ src: item.src, dest: item.dest, success: true, engine: 'native_fallback' });
                }
            } else {
                if (item.isDirectory) {
                    await fs.ensureDir(item.dest);
                } else {
                    await fs.ensureDir(path.dirname(item.dest));
                }
                await fs.copy(item.src, item.dest, { overwrite: true });
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'native' });
            }
        } catch (err) {
            console.error(`[SYNC] Error: ${err.message}`);
            results.push({ src: item.src, dest: item.dest, success: false, error: err.message, engine: usedEngine });
        }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    res.json({
        total: items.length,
        succeeded,
        failed,
        engine: usedEngine,
        results
    });
});

router.ensureSyncWorkerRunning = ensureSyncWorkerRunning;
router.stopLocalWorker = stopLocalWorker;
router.sanitizeZombieOrders = sanitizeZombieOrders;
router.startSyncSupervisor = startSyncSupervisor;

module.exports = router;
