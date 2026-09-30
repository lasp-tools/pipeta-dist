const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync, exec, spawn } = require('child_process');
const net = require('net');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Resolver directorio central de caché y cola
function getCentralCacheDir() {
    if (process.env.PIPETA_CACHE_ROOT && fs.existsSync(process.env.PIPETA_CACHE_ROOT)) {
        return process.env.PIPETA_CACHE_ROOT;
    }
    // 1. Si S:/_SYNC_CACHE existe (caso LASP-VM mapeado al verdadero SAN del estudio)
    if (fs.existsSync('S:/_SYNC_CACHE')) {
        return 'S:/_SYNC_CACHE';
    }
    // 2. Si Z:/_SYNC_CACHE existe (ruta canónica en servidor o VMs con Z: operativo)
    if (fs.existsSync('Z:/_SYNC_CACHE')) {
        return 'Z:/_SYNC_CACHE';
    }
    // 3. Si UNC existe en red
    const unc = '//192.168.206.116/Z/_SYNC_CACHE';
    if (fs.existsSync(unc)) {
        return unc;
    }
    // 4. Fallback local
    return path.join(__dirname, '../_SYNC_CACHE');
}

const CACHE_ROOT = getCentralCacheDir();
const ORDERS_DIR = path.join(CACHE_ROOT, 'requests');
const WORKERS_DIR = path.join(CACHE_ROOT, 'workers');
const PAUSE_FLAG_FILE = path.join(CACHE_ROOT, 'queue_paused.flag');

function getAllOrdersCandidateDirs() {
    const dirs = [];
    if (ORDERS_DIR) dirs.push(ORDERS_DIR);
    const sDir = 'S:/_SYNC_CACHE/requests';
    if (fs.existsSync(sDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(sDir).toLowerCase())) {
        dirs.push(sDir);
    }
    const zDir = 'Z:/_SYNC_CACHE/requests';
    if (fs.existsSync(zDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(zDir).toLowerCase())) {
        dirs.push(zDir);
    }
    const uncDir = '//192.168.206.116/Z/_SYNC_CACHE/requests';
    if (fs.existsSync(uncDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(uncDir).toLowerCase())) {
        dirs.push(uncDir);
    }
    const localDir = path.join(__dirname, '../_SYNC_CACHE/requests');
    if (fs.existsSync(localDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(localDir).toLowerCase())) {
        dirs.push(localDir);
    }
    return dirs;
}

function getAllWorkersCandidateDirs() {
    const dirs = [];
    if (WORKERS_DIR) dirs.push(WORKERS_DIR);
    const sDir = 'S:/_SYNC_CACHE/workers';
    if (fs.existsSync(sDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(sDir).toLowerCase())) {
        dirs.push(sDir);
    }
    const zDir = 'Z:/_SYNC_CACHE/workers';
    if (fs.existsSync(zDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(zDir).toLowerCase())) {
        dirs.push(zDir);
    }
    const uncDir = '//192.168.206.116/Z/_SYNC_CACHE/workers';
    if (fs.existsSync(uncDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(uncDir).toLowerCase())) {
        dirs.push(uncDir);
    }
    const localDir = path.join(__dirname, '../_SYNC_CACHE/workers');
    if (fs.existsSync(localDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(localDir).toLowerCase())) {
        dirs.push(localDir);
    }
    return dirs;
}

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

function saveOrderAcrossAllCandidates(orderId, orderData) {
    const dirs = getAllOrdersCandidateDirs();
    for (const d of dirs) {
        try {
            if (!fs.existsSync(d)) fs.ensureDirSync(d);
            const p = path.join(d, `${orderId}.json`);
            fs.writeJsonSync(p, orderData, { spaces: 2 });
        } catch(e) {}
    }
}

// ---------------------------------------------------------------------------
// AGREGADOR DE NODOS (WORKERS)
// ---------------------------------------------------------------------------
const memoryWorkersCache = new Map();

// ---------------------------------------------------------------------------
// SEGUIMIENTO DE REINICIO DE NODOS (WORKERS)
// ---------------------------------------------------------------------------
const restartingNodes = new Map();

function getRestartStatus(hostname) {
    if (!hostname) return null;
    const key = hostname.toLowerCase();
    const info = restartingNodes.get(key);
    if (!info) return null;

    const now = Date.now();
    const elapsed = Math.round((now - info.startTime) / 1000);

    // Banderas de reinicio
    const flagFiles = [
        path.join(CACHE_ROOT, `restart_${key}.flag`),
        `S:/_SYNC_CACHE/restart_${key}.flag`,
        `Z:/_SYNC_CACHE/restart_${key}.flag`,
        path.join(CACHE_ROOT, 'restart_worker.flag'),
        `S:/_SYNC_CACHE/restart_worker.flag`,
        `Z:/_SYNC_CACHE/restart_worker.flag`
    ];
    const flagStillExists = flagFiles.some(f => {
        try { return fs.existsSync(f); } catch(e) { return false; }
    });

    // Limpiar si ya completó hace más de 45 segundos
    if (info.status === 'completed' && elapsed > 45) {
        restartingNodes.delete(key);
        return null;
    }
    if (info.status === 'timeout' && elapsed > 90) {
        restartingNodes.delete(key);
        return null;
    }

    // Buscar si el worker ya reportó con nuevo PID o con ping posterior a startTime
    const cur = memoryWorkersCache ? Array.from(memoryWorkersCache.values()).find(w => (w.hostname || '').toLowerCase() === key) : null;
    const pingTime = (cur && cur.lastPing) ? new Date(cur.lastPing).getTime() : 0;
    const isRecentPing = (now - pingTime) <= 20000;
    const hasNewPid = cur && cur.pid && info.oldPid && (cur.pid !== info.oldPid);
    const hasFreshPing = cur && isRecentPing && (pingTime > info.startTime + 2500);

    if (hasNewPid || (hasFreshPing && !flagStillExists && elapsed >= 8)) {
        info.status = 'completed';
        info.step = 4;
        info.newPid = cur ? cur.pid : (info.newPid || 'OK');
        info.message = `Worker en línea con PID ${info.newPid}`;
        info.completedAt = info.completedAt || now;
        return { ...info, elapsed };
    }

    if (elapsed > 45) {
        info.status = 'timeout';
        info.message = 'Tiempo de espera prolongado (45s). El worker puede estar cargando o el script supervisor no está en bucle.';
        return { ...info, elapsed };
    }

    if (flagStillExists) {
        info.step = 1;
        info.message = 'Orden emitida. Esperando que el Worker reconozca la bandera y detenga su proceso actual...';
    } else {
        if (elapsed < 12) {
            info.step = 2;
            info.message = 'Worker apagó su proceso previo. Supervisor de Windows esperando cuenta regresiva de 10s...';
        } else {
            info.step = 3;
            info.message = 'Supervisor relanzando worker y realizando chequeos de inicio...';
        }
    }

    return { ...info, elapsed };
}

function getRegisteredWorkers() {
    const candidateDirs = getAllWorkersCandidateDirs();
    const workersMap = new Map();

    // 0. Sembrar con memoria activa previa
    for (const [k, v] of memoryWorkersCache.entries()) {
        workersMap.set(k, v);
    }

    // 1. Escanear directorio workers/*.json
    for (const dir of candidateDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const fullP = path.join(dir, file);
                    const data = fs.readJsonSync(fullP);
                    if (data && data.workerId) {
                        const existing = workersMap.get(data.workerId);
                        if (!existing || new Date(data.lastPing) > new Date(existing.lastPing)) {
                            workersMap.set(data.workerId, data);
                            memoryWorkersCache.set(data.workerId, data);
                        }
                    }
                } catch(e) {}
            }
        } catch(e) {}
    }

    // 2. Escanear archivo heredado worker_status.json en cada raíz de caché
    const statusCandidates = [
        path.join(CACHE_ROOT, 'worker_status.json'),
        'S:/_SYNC_CACHE/worker_status.json',
        'Z:/_SYNC_CACHE/worker_status.json',
        '//192.168.206.116/Z/_SYNC_CACHE/worker_status.json',
        path.join(__dirname, '../_SYNC_CACHE/worker_status.json')
    ];

    for (const sf of statusCandidates) {
        if (!fs.existsSync(sf)) continue;
        try {
            const data = fs.readJsonSync(sf);
            if (data && data.workerId) {
                const existing = workersMap.get(data.workerId);
                if (!existing || new Date(data.lastPing) > new Date(existing.lastPing)) {
                    // Si no tiene IP registrada, deducir por hostname si es lasp-virt-030 (VM 105)
                    if (!data.ip) {
                        if (data.hostname && data.hostname.toLowerCase().includes('virt-030')) {
                            data.ip = '192.168.206.105';
                        }
                    }
                    workersMap.set(data.workerId, data);
                    memoryWorkersCache.set(data.workerId, data);
                }
            }
        } catch(e) {}
    }

    const now = Date.now();

    // 3. Agrupar por Hostname para que una máquina nunca aparezca duplicada
    const hostMap = new Map();
    for (const [wId, w] of workersMap.entries()) {
        const hKey = (w.hostname || wId).toLowerCase();
        const existing = hostMap.get(hKey);
        if (!existing || new Date(w.lastPing) > new Date(existing.lastPing)) {
            if (existing && existing.workerId !== w.workerId) {
                memoryWorkersCache.delete(existing.workerId);
                const oldCandidates = [
                    path.join(WORKERS_DIR, `${existing.workerId}.json`),
                    path.join('S:/_SYNC_CACHE/workers', `${existing.workerId}.json`),
                    path.join('Z:/_SYNC_CACHE/workers', `${existing.workerId}.json`)
                ];
                for (const oldF of oldCandidates) {
                    if (fs.existsSync(oldF)) {
                        try { fs.removeSync(oldF); } catch(e){}
                    }
                }
            }
            hostMap.set(hKey, w);
        } else {
            memoryWorkersCache.delete(wId);
            const oldCandidates = [
                path.join(WORKERS_DIR, `${wId}.json`),
                path.join('S:/_SYNC_CACHE/workers', `${wId}.json`),
                path.join('Z:/_SYNC_CACHE/workers', `${wId}.json`)
            ];
            for (const oldF of oldCandidates) {
                if (fs.existsSync(oldF)) {
                    try { fs.removeSync(oldF); } catch(e){}
                }
            }
        }
    }

    // Garantizar que nodos canónicos del estudio siempre figuren aunque estén apagados
    if (!hostMap.has('lasp-virt-030')) {
        hostMap.set('lasp-virt-030', {
            workerId: 'worker_lasp-virt-030_default',
            hostname: 'lasp-virt-030',
            ip: '192.168.206.105',
            pid: null,
            platform: 'win32',
            status: 'offline',
            activeTask: null,
            lastPing: null,
            rcloneAvailable: true
        });
    }

    const localHost = os.hostname().toLowerCase();
    if (!hostMap.has(localHost)) {
        hostMap.set(localHost, {
            workerId: `worker_${localHost}_default`,
            hostname: os.hostname(),
            ip: getPrimaryIPv4(),
            pid: null,
            platform: os.platform(),
            status: 'offline',
            activeTask: null,
            lastPing: null,
            rcloneAvailable: true
        });
    }

    const result = [];
    for (const w of hostMap.values()) {
        const pingTime = w.lastPing ? new Date(w.lastPing).getTime() : 0;
        const diffSeconds = pingTime > 0 ? Math.max(0, Math.round((now - pingTime) / 1000)) : 999999;
        const isRecent = pingTime > 0 && diffSeconds <= 20;

        // Conservar historial de nodos conocidos hasta 30 días para que nunca desaparezcan del panel
        if (!isRecent && pingTime > 0 && diffSeconds > 30 * 86400) {
            continue;
        }

        const hKey = (w.hostname || '').toLowerCase();
        const restartInfo = getRestartStatus(hKey);
        const isRestarting = restartInfo && restartInfo.status === 'in_progress';
        const justRestarted = restartInfo && restartInfo.status === 'completed' && restartInfo.elapsed <= 25;

        let health = 'offline';
        if (isRestarting) {
            health = 'restarting';
        } else if (w.status === 'stopped') {
            health = 'stopped';
        } else if (isRecent) {
            health = w.status || 'idle';
        } else {
            health = 'offline';
        }

        result.push({
            workerId: w.workerId,
            hostname: w.hostname || 'Desconocido',
            ip: w.ip || 'N/A',
            pid: w.pid || null,
            platform: w.platform || 'win32',
            status: health,
            activeTask: w.activeTask || null,
            lastPing: w.lastPing,
            lastPingSecondsAgo: diffSeconds,
            isOnline: !!((isRecent && health !== 'stopped') || isRestarting),
            isRestarting: !!isRestarting,
            justRestarted: !!justRestarted,
            restartStatus: restartInfo || null,
            rcloneAvailable: !!w.rcloneAvailable,
            rcloneConf: w.rcloneConf || null,
            system: w.system || null
        });
    }

    // Ordenar: Online primeros, luego por hostname
    result.sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return a.hostname.localeCompare(b.hostname);
    });

    return result;
}

// ---------------------------------------------------------------------------
// AGREGADOR DE COLA Y TAREAS
// ---------------------------------------------------------------------------
function getQueueOrders() {
    const candidateDirs = getAllOrdersCandidateDirs();
    const ordersMap = new Map();

    for (const dir of candidateDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const fullP = path.join(dir, file);
                    const data = fs.readJsonSync(fullP);
                    if (data && data.id) {
                        const existing = ordersMap.get(data.id);
                        // Conservar la versión más reciente en caso de múltiples candidatos
                        if (!existing || (data.status === 'processing' && existing.status !== 'processing')) {
                            ordersMap.set(data.id, { ...data, _filePath: fullP });
                        }
                    }
                } catch(e) {}
            }
        } catch(e) {}
    }

    const orders = Array.from(ordersMap.values()).map(o => {
        const priority = Number.isFinite(o.priority) 
            ? o.priority 
            : (o.type === 'higgsfield_ingest' || o.type === 'refresh_folder' ? 80 : 50);

        return {
            id: o.id,
            type: o.type || 'download',
            project: o.project || 'STUDIO',
            user: o.user || 'Artista',
            priority,
            status: o.status || 'pending',
            worker: o.worker || null,
            workerHostname: o.workerHostname || null,
            createdAt: o.createdAt || null,
            startedAt: o.startedAt || null,
            completedAt: o.completedAt || null,
            durationSeconds: o.durationSeconds || null,
            progress: o.progress || null,
            itemsCount: Array.isArray(o.items) ? o.items.length : 0,
            items: o.items || [],
            error: o.error || null,
            errors: o.errors || null,
            result: o.result || null
        };
    });

    // Ordenar:
    // 1. processing primero
    // 2. pending (ordenado por priority DESC, luego createdAt ASC)
    // 3. paused
    // 4. completadas / fallidas / canceladas (más recientes primero)
    orders.sort((a, b) => {
        const statusRank = (s) => {
            if (s === 'processing') return 1;
            if (s === 'pending') return 2;
            if (s === 'paused') return 3;
            return 4;
        };
        const rankA = statusRank(a.status);
        const rankB = statusRank(b.status);
        if (rankA !== rankB) return rankA - rankB;

        if (a.status === 'pending') {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        }

        const dateA = new Date(a.completedAt || a.startedAt || a.createdAt || 0);
        const dateB = new Date(b.completedAt || b.startedAt || b.createdAt || 0);
        return dateB - dateA;
    });

    return orders;
}

function isQueuePaused() {
    return fs.existsSync(PAUSE_FLAG_FILE) || fs.existsSync('S:/_SYNC_CACHE/queue_paused.flag');
}

// ---------------------------------------------------------------------------
// ENDPOINTS REST
// ---------------------------------------------------------------------------

// 1. Resumen y Estado General
app.get('/api/server/status', (req, res) => {
    try {
        const workers = getRegisteredWorkers();
        const orders = getQueueOrders();
        const queuePaused = isQueuePaused();

        const activeWorkers = workers.filter(w => w.isOnline);
        const processingTasks = orders.filter(o => o.status === 'processing');
        const pendingTasks = orders.filter(o => o.status === 'pending');
        const pausedTasks = orders.filter(o => o.status === 'paused');
        const completedTasks = orders.filter(o => o.status === 'completed' || o.status === 'completed_with_errors');
        const failedTasks = orders.filter(o => o.status === 'failed');

        res.json({
            success: true,
            version: '1.0.0',
            serverHost: os.hostname(),
            serverIp: getPrimaryIPv4(),
            serverPort: PORT,
            cacheRoot: CACHE_ROOT,
            queuePaused,
            counts: {
                totalWorkers: workers.length,
                onlineWorkers: activeWorkers.length,
                totalOrders: orders.length,
                processing: processingTasks.length,
                pending: pendingTasks.length,
                paused: pausedTasks.length,
                completed: completedTasks.length,
                failed: failedTasks.length
            }
        });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Lista de Workers
app.get('/api/server/workers', (req, res) => {
    try {
        const workers = getRegisteredWorkers();
        res.json({ success: true, workers });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Cola de Tareas
app.get('/api/server/queue', (req, res) => {
    try {
        const { status, project, user, type, search } = req.query;
        let orders = getQueueOrders();

        if (status && status !== 'all') {
            orders = orders.filter(o => o.status === status);
        }
        if (project && project !== 'all') {
            orders = orders.filter(o => o.project?.toLowerCase() === project.toLowerCase());
        }
        if (user && user !== 'all') {
            orders = orders.filter(o => o.user?.toLowerCase() === user.toLowerCase());
        }
        if (type && type !== 'all') {
            orders = orders.filter(o => o.type?.toLowerCase() === type.toLowerCase());
        }
        if (search) {
            const q = search.toLowerCase();
            orders = orders.filter(o => 
                o.id.toLowerCase().includes(q) ||
                (o.project && o.project.toLowerCase().includes(q)) ||
                (o.user && o.user.toLowerCase().includes(q)) ||
                (o.items && o.items.some(i => (i.name && i.name.toLowerCase().includes(q)) || (i.onlinePath && i.onlinePath.toLowerCase().includes(q))))
            );
        }

        res.json({ success: true, count: orders.length, orders });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3b. Reiniciar Worker específico
app.post('/api/server/worker/:id/restart', (req, res) => {
    try {
        const { id } = req.params;
        const workers = getRegisteredWorkers();
        const target = workers.find(w => w.workerId === id || w.hostname.toLowerCase() === id.toLowerCase());
        const hostname = target ? target.hostname.toLowerCase() : id.toLowerCase();
        const oldPid = target ? target.pid : null;

        const targets = [
            path.join(CACHE_ROOT, `restart_${hostname}.flag`),
            path.join(CACHE_ROOT, `restart_${id}.flag`),
            `S:/_SYNC_CACHE/restart_${hostname}.flag`,
            `Z:/_SYNC_CACHE/restart_${hostname}.flag`
        ];

        for (const f of targets) {
            try {
                const dir = path.dirname(f);
                if (fs.existsSync(dir)) {
                    fs.writeJsonSync(f, { requestedAt: new Date().toISOString(), requestedBy: 'admin', target: hostname });
                }
            } catch(e){}
        }

        // Registrar en mapa de reinicio activo
        restartingNodes.set(hostname, {
            hostname,
            startTime: Date.now(),
            oldPid: oldPid,
            step: 1,
            status: 'in_progress',
            newPid: null,
            message: 'Orden de reinicio depositada en la red'
        });

        console.log(`[PIPETA SERVER] Solicitud de reinicio emitida para worker: ${hostname} (PID anterior: ${oldPid || 'N/A'})`);
        res.json({ success: true, message: `Reinicio solicitado para nodo ${hostname}`, oldPid });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3c. Consultar estado en tiempo real del reinicio de un nodo
app.get('/api/server/worker/:id/restart-status', (req, res) => {
    try {
        const { id } = req.params;
        const status = getRestartStatus(id);
        if (!status) {
            return res.json({ success: true, active: false });
        }
        res.json({ success: true, active: true, ...status });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3d. Reiniciar todos los workers
app.post('/api/server/worker/restart-all', (req, res) => {
    try {
        const targets = [
            path.join(CACHE_ROOT, 'restart_worker.flag'),
            'S:/_SYNC_CACHE/restart_worker.flag',
            'Z:/_SYNC_CACHE/restart_worker.flag'
        ];
        for (const f of targets) {
            try {
                const dir = path.dirname(f);
                if (fs.existsSync(dir)) {
                    fs.writeJsonSync(f, { requestedAt: new Date().toISOString(), requestedBy: 'admin' });
                }
            } catch(e){}
        }

        const workers = getRegisteredWorkers();
        for (const w of workers) {
            if (w.hostname) {
                restartingNodes.set(w.hostname.toLowerCase(), {
                    hostname: w.hostname,
                    startTime: Date.now(),
                    oldPid: w.pid || null,
                    step: 1,
                    status: 'in_progress',
                    newPid: null,
                    message: 'Orden de reinicio global emitida'
                });
            }
        }

        console.log(`[PIPETA SERVER] Solicitud de reinicio emitida para TODOS los workers`);
        res.json({ success: true, message: 'Reinicio solicitado para todos los workers' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3e. Levantar Worker Local en este Servidor (LASP-VM)
app.post('/api/server/worker/start-local', (req, res) => {
    try {
        const workers = getRegisteredWorkers();
        const localHost = os.hostname().toLowerCase();
        const localOnline = workers.find(w => w.hostname.toLowerCase() === localHost && w.isOnline);
        if (localOnline) {
            return res.json({ success: false, message: `Ya hay un worker activo en este equipo (PID: ${localOnline.pid})` });
        }

        const scriptCandidates = [
            path.join(__dirname, '../Launch_Pipeta_Worker.bat'),
            path.join(__dirname, '../Launch_Worker.bat'),
            'Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/Launch_Pipeta_Worker.bat',
            'S:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/Launch_Pipeta_Worker.bat'
        ];
        let scriptPath = null;
        for (const p of scriptCandidates) {
            if (fs.existsSync(p)) { scriptPath = p; break; }
        }

        if (!scriptPath) {
            return res.status(404).json({ success: false, error: 'No se encontró script Launch_Pipeta_Worker.bat' });
        }

        const subprocess = spawn('cmd.exe', ['/c', 'start', '""', scriptPath], {
            detached: true,
            stdio: 'ignore'
        });
        subprocess.unref();

        console.log(`[PIPETA SERVER] Worker local iniciado exitosamente en ${os.hostname()}`);
        res.json({ success: true, message: `Worker local iniciado en ${os.hostname()}` });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3f. Despertar / Levantar un Worker remoto o local
app.post('/api/server/worker/:id/wake', async (req, res) => {
    try {
        const { id } = req.params;
        const workers = getRegisteredWorkers();
        const target = workers.find(w => w.workerId === id || w.hostname.toLowerCase() === id.toLowerCase());
        const hostname = target ? target.hostname : id;
        const ip = target ? target.ip : null;

        // Si es este mismo equipo servidor
        if (hostname.toLowerCase() === os.hostname().toLowerCase() || ip === '127.0.0.1' || ip === getPrimaryIPv4()) {
            const scriptPath = path.join(__dirname, '../Launch_Pipeta_Worker.bat');
            const subprocess = spawn('cmd.exe', ['/c', 'start', '""', scriptPath], {
                detached: true,
                stdio: 'ignore'
            });
            subprocess.unref();
            return res.json({ success: true, reachable: true, message: `Worker local iniciado en ${hostname}` });
        }

        if (!ip || ip === 'N/A') {
            return res.json({ success: false, reachable: false, message: `No se conoce la dirección IP del nodo ${hostname}` });
        }

        // 1. Probar conectividad TCP / SMB con el equipo remoto
        const isReachable = await new Promise(resolve => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
            socket.on('error', () => { socket.destroy(); resolve(false); });
            socket.connect(445, ip);
        });

        if (!isReachable) {
            return res.json({
                success: false,
                reachable: false,
                message: `El nodo ${hostname} (${ip}) está APAGADO a nivel de máquina/hardware. Encienda la máquina virtual en el hipervisor (VMware/Proxmox) o encienda el equipo físico.`
            });
        }

        // 2. Si responde en la red, intentar iniciar vía Tarea Programada de Windows si existe
        exec(`schtasks /run /s ${ip} /tn "PipetaWorker"`, (err) => {
            if (!err) {
                return res.json({
                    success: true,
                    reachable: true,
                    message: `Orden de inicio enviada con éxito al nodo ${hostname} (${ip}) vía Tarea Programada.`
                });
            }

            // Fallback WMI
            const remoteCmd = `cmd.exe /c S:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\Launch_Pipeta_Worker.bat`;
            exec(`wmic /node:"${ip}" process call create "${remoteCmd}"`, (wErr, wOut) => {
                if (!wErr && wOut && wOut.includes('ReturnValue = 0;')) {
                    return res.json({
                        success: true,
                        reachable: true,
                        message: `Worker lanzado en ${hostname} (${ip}) vía WMI.`
                    });
                }

                return res.json({
                    success: false,
                    reachable: true,
                    message: `El nodo ${hostname} (${ip}) está ENCENDIDO, pero Windows requiere iniciar la consola localmente o mediante la Tarea Programada 'PipetaWorker'. En esa máquina ejecute 'Launch_Pipeta_Worker.bat'.`
                });
            });
        });

    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3g. Olvidar / Eliminar registro de nodo obsoleto
app.delete('/api/server/worker/:id', (req, res) => {
    try {
        const { id } = req.params;
        const workers = getRegisteredWorkers();
        const target = workers.find(w => w.workerId === id || w.hostname.toLowerCase() === id.toLowerCase());
        const hostname = target ? target.hostname.toLowerCase() : id.toLowerCase();

        memoryWorkersCache.delete(id);
        if (target) memoryWorkersCache.delete(target.workerId);

        const candidates = [
            path.join(WORKERS_DIR, `${id}.json`),
            path.join('S:/_SYNC_CACHE/workers', `${id}.json`),
            path.join('Z:/_SYNC_CACHE/workers', `${id}.json`)
        ];
        if (target && target.workerId) {
            candidates.push(path.join(WORKERS_DIR, `${target.workerId}.json`));
            candidates.push(path.join('S:/_SYNC_CACHE/workers', `${target.workerId}.json`));
            candidates.push(path.join('Z:/_SYNC_CACHE/workers', `${target.workerId}.json`));
        }

        for (const f of candidates) {
            if (fs.existsSync(f)) {
                try { fs.removeSync(f); } catch(e){}
            }
        }

        res.json({ success: true, message: `Nodo ${hostname} eliminado del registro` });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Pausar / Reanudar Cola Global
app.post('/api/server/queue/pause', (req, res) => {
    try {
        const { paused } = req.body;
        const targetState = paused !== undefined ? !!paused : !isQueuePaused();

        const targets = [PAUSE_FLAG_FILE, 'S:/_SYNC_CACHE/queue_paused.flag', 'Z:/_SYNC_CACHE/queue_paused.flag'];
        for (const f of targets) {
            const dir = path.dirname(f);
            if (fs.existsSync(dir)) {
                if (targetState) {
                    fs.writeJsonSync(f, { pausedAt: new Date().toISOString(), pausedBy: 'admin' });
                } else {
                    if (fs.existsSync(f)) fs.removeSync(f);
                }
            }
        }

        console.log(`[PIPETA SERVER] Cola global ${targetState ? 'PAUSADA' : 'REANUDADA'} por administrador`);
        res.json({ success: true, queuePaused: targetState });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Cambiar Prioridad de una Tarea (1 al 100)
app.post('/api/server/task/:id/priority', (req, res) => {
    try {
        const { id } = req.params;
        const priority = Math.min(100, Math.max(1, parseInt(req.body.priority, 10) || 50));

        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const data = fs.readJsonSync(filePath);
                    data.priority = priority;
                    data.priorityUpdatedAt = new Date().toISOString();
                    fs.writeJsonSync(filePath, data, { spaces: 2 });
                    found = true;
                } catch(e) {}
            }
        }

        if (!found) {
            return res.status(404).json({ success: false, error: `Orden ${id} no encontrada` });
        }

        console.log(`[PIPETA SERVER] Prioridad de orden ${id} ajustada a: ${priority}`);
        res.json({ success: true, id, priority });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Pausar Tarea Individual
app.post('/api/server/task/:id/pause', (req, res) => {
    try {
        const { id } = req.params;
        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const data = fs.readJsonSync(filePath);
                    if (data.status === 'pending') {
                        data.status = 'paused';
                        data.pausedAt = new Date().toISOString();
                        fs.writeJsonSync(filePath, data, { spaces: 2 });
                        found = true;
                    } else {
                        return res.status(400).json({ success: false, error: `No se puede pausar una tarea en estado '${data.status}'` });
                    }
                } catch(e) {}
            }
        }

        if (!found) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        res.json({ success: true, id, status: 'paused' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Reanudar Tarea Individual Pausada
app.post('/api/server/task/:id/resume', (req, res) => {
    try {
        const { id } = req.params;
        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const data = fs.readJsonSync(filePath);
                    if (data.status === 'paused') {
                        data.status = 'pending';
                        delete data.pausedAt;
                        fs.writeJsonSync(filePath, data, { spaces: 2 });
                        found = true;
                    } else {
                        return res.status(400).json({ success: false, error: `La tarea no está pausada (estado actual: '${data.status}')` });
                    }
                } catch(e) {}
            }
        }

        if (!found) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        res.json({ success: true, id, status: 'pending' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. Cancelar Tarea (En proceso o pendiente)
app.post('/api/server/task/:id/cancel', (req, res) => {
    try {
        const { id } = req.params;
        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const data = fs.readJsonSync(filePath);
                    data.status = 'cancelled';
                    data.cancelledAt = new Date().toISOString();
                    data.cancelledBy = 'admin';
                    fs.writeJsonSync(filePath, data, { spaces: 2 });
                    found = true;
                } catch(e) {}
            }
        }

        if (!found) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        console.log(`[PIPETA SERVER] Orden ${id} cancelada por administrador`);
        res.json({ success: true, id, status: 'cancelled' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 9. Reintentar Tarea (Retry con 1 clic)
app.post('/api/server/task/:id/retry', (req, res) => {
    try {
        const { id } = req.params;
        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const data = fs.readJsonSync(filePath);
                    data.status = 'pending';
                    data.retriedAt = new Date().toISOString();
                    delete data.error;
                    delete data.errors;
                    delete data.cancelledAt;
                    delete data.completedAt;
                    delete data.durationSeconds;
                    delete data.worker;
                    delete data.workerHostname;
                    delete data.startedAt;
                    if (data.progress) {
                        data.progress.percentage = 0;
                        data.progress.speedFormatted = '0 B/s';
                        data.progress.etaSeconds = null;
                    }
                    fs.writeJsonSync(filePath, data, { spaces: 2 });
                    found = true;
                } catch(e) {}
            }
        }

        if (!found) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        console.log(`[PIPETA SERVER] Orden ${id} puesta en reintento (estado: pending)`);
        res.json({ success: true, id, status: 'pending' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 10. Eliminar Tarea de la Cola / Historial
app.post('/api/server/task/:id/delete', (req, res) => {
    try {
        const { id } = req.params;
        const dirs = getAllOrdersCandidateDirs();
        let deleted = false;

        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    fs.removeSync(filePath);
                    deleted = true;
                } catch(e) {}
            }
        }

        if (!deleted) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        console.log(`[PIPETA SERVER] Orden ${id} eliminada permanentemente`);
        res.json({ success: true, id, deleted: true });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 11. Limpiar Todo el Historial Finalizado
app.post('/api/server/queue/clear-history', (req, res) => {
    try {
        const dirs = getAllOrdersCandidateDirs();
        const finishedStatuses = ['completed', 'completed_with_errors', 'failed', 'cancelled'];
        let count = 0;

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            try {
                const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
                for (const f of files) {
                    const fullP = path.join(dir, f);
                    try {
                        const data = fs.readJsonSync(fullP);
                        if (data && finishedStatuses.includes(data.status)) {
                            fs.removeSync(fullP);
                            count++;
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }

        console.log(`[PIPETA SERVER] Historial limpiado: ${count} órdenes eliminadas`);
        res.json({ success: true, clearedCount: count });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 12. Server-Sent Events (SSE) para Actualizaciones en Vivo sin Recargas
app.get('/api/server/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendSnapshot = () => {
        try {
            const workers = getRegisteredWorkers();
            const orders = getQueueOrders();
            const queuePaused = isQueuePaused();

            const payload = JSON.stringify({
                timestamp: new Date().toISOString(),
                queuePaused,
                workers,
                orders: orders.slice(0, 100),
                counts: {
                    totalWorkers: workers.length,
                    onlineWorkers: workers.filter(w => w.isOnline).length,
                    totalOrders: orders.length,
                    processing: orders.filter(o => o.status === 'processing').length,
                    pending: orders.filter(o => o.status === 'pending').length,
                    paused: orders.filter(o => o.status === 'paused').length,
                    completed: orders.filter(o => o.status === 'completed' || o.status === 'completed_with_errors').length,
                    failed: orders.filter(o => o.status === 'failed').length
                }
            });
            res.write(`data: ${payload}\n\n`);
        } catch(e) {}
    };

    // Envío inicial inmediato
    sendSnapshot();

    // Pulso cada 1 segundo
    const interval = setInterval(sendSnapshot, 1000);

    req.on('close', () => {
        clearInterval(interval);
    });
});

// Servir frontend administrativo
const UI_DIR = path.join(__dirname, 'admin_ui');
app.use(express.static(UI_DIR));
app.get('*', (req, res) => {
    res.sendFile(path.join(UI_DIR, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log('================================================================');
    console.log('       PIPETA SERVER - CONTROL Y SUPERVISIÓN DE WORKERS');
    console.log('================================================================');
    console.log(` Puerto:            ${PORT}`);
    console.log(` URL Local:         http://localhost:${PORT}`);
    console.log(` URL Red Local:     http://${getPrimaryIPv4()}:${PORT}`);
    console.log(` Cache Detectada:   ${CACHE_ROOT}`);
    console.log(` Órdenes Dir:       ${ORDERS_DIR}`);
    console.log(` Workers Dir:       ${WORKERS_DIR}`);
    console.log('================================================================\n');
});
