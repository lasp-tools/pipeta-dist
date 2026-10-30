const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync, exec, spawn } = require('child_process');
const REMOTE_STUDIO_SSH = 'ssh -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o ConnectTimeout=3 lasp-linux@192.168.206.111';
const net = require('net');
const app = express();
const PORT = process.env.PORT || 3005;
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// ---------------------------------------------------------------------------
// AUTENTICACIÓN Y SEGURIDAD REMOTA (Opción 1: Pantalla Negra + Token)
// ---------------------------------------------------------------------------
const PIPETA_ADMIN_USER = 'lasp';
const PIPETA_ADMIN_PASS = 'Lasp_Pipeta_2026!';
const PIPETA_API_TOKEN = 'lasp-pipeta-sec-token-2026';
function isLocalRequest(req) {
    if (req.headers['cf-connecting-ip'] || req.headers['cf-ray']) {
        return false;
    }
    const ip = req.socket?.remoteAddress || '';
    if (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('192.168.206.')) {
        return true;
    }
    return false;
}
// Endpoint de verificación de origen (LAN vs Remoto)
app.get('/api/auth/check', (req, res) => {
    const isLocal = isLocalRequest(req);
    res.json({ isLocal });
});
// Endpoint de login con credenciales
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (username === PIPETA_ADMIN_USER && password === PIPETA_ADMIN_PASS) {
        return res.json({ success: true, token: PIPETA_API_TOKEN });
    }
    return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' });
});
// Middleware de protección para endpoints de datos
app.use((req, res, next) => {
    // 1. Peticiones locales (Munro LAN) pasan libremente
    if (isLocalRequest(req)) {
        return next();
    }
    // 2. Páginas base y rutas públicas de autenticación
    if (
        req.path === '/' || 
        req.path === '/index.html' || 
        req.path === '/favicon.ico' || 
        req.path === '/api/auth/check' || 
        req.path === '/api/auth/login' ||
        req.path === '/api/server/set-public-url'
    ) {
        return next();
    }
    // 3. Validación de token para APIs y SSE (vía header, query param o Authorization Bearer)
    const token = req.headers['x-pipeta-token'] || req.query?.token || req.headers['authorization']?.replace('Bearer ', '');
    if (token && token === PIPETA_API_TOKEN) {
        return next();
    }
    // 4. Bloqueo para cualquier otra petición externa sin token
    return res.status(401).json({ success: false, error: 'Unauthorized: Se requiere autenticación' });
});
try {
    const multiSedeRouter = require('./helpers/multi_sede_router');
    app.use('/api/sync/v2', multiSedeRouter);
} catch (e) {
    console.warn('[SERVER WARN] No se pudo cargar multi_sede_router:', e.message);
}
// Resolver directorio central de caché y cola
function getCentralCacheDir() {
    if (process.env.PIPETA_CACHE_ROOT && fs.existsSync(process.env.PIPETA_CACHE_ROOT)) {
        return process.env.PIPETA_CACHE_ROOT;
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

const CLIENTS_DIR = path.join(CACHE_ROOT, 'clients');
try { fs.ensureDirSync(CLIENTS_DIR); } catch(e) {}

function getAllClientsCandidateDirs() {
    const dirs = [];
    if (CLIENTS_DIR) dirs.push(CLIENTS_DIR);
    const zDir = 'Z:/_SYNC_CACHE/clients';
    if (fs.existsSync(zDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(zDir).toLowerCase())) {
        dirs.push(zDir);
    }
    const uncDir = '//192.168.206.116/Z/_SYNC_CACHE/clients';
    if (fs.existsSync(uncDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(uncDir).toLowerCase())) {
        dirs.push(uncDir);
    }
    const localDir = path.join(__dirname, '../_SYNC_CACHE/clients');
    if (fs.existsSync(localDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(localDir).toLowerCase())) {
        dirs.push(localDir);
    }
    return dirs;
}

function deduceSede(ip, req) {
    if (req && (req.headers['cf-connecting-ip'] || req.headers['cf-ray'])) {
        return 'Remoto (Cloudflare)';
    }
    const sIp = String(ip || (req?.socket?.remoteAddress) || '');
    if (sIp.includes('192.168.206.') || sIp.includes('192.168.200.')) return 'LASP (Munro)'; // Munro: placa principal 206 + secundaria 200
    if (sIp.includes('192.168.10.') || sIp.includes('192.168.106.') || sIp.includes('192.168.1.')) return 'WeNonStop (Madrid)';
    if (sIp.includes('10.') || sIp.includes('172.')) return 'VPN / Remoto';
    if (sIp.includes('127.0.0.1') || sIp.includes('::1')) return 'Local Server';
    return 'Remoto / Freelance';
}

const PAUSE_FLAG_FILE = path.join(CACHE_ROOT, 'queue_paused.flag');
function getAllOrdersCandidateDirs() {
    const dirs = [];
    if (ORDERS_DIR) dirs.push(ORDERS_DIR);
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
    } catch(e) { console.error("[SSE ERROR]", e); }
    return '127.0.0.1';
}
function saveOrderAcrossAllCandidates(orderId, orderData) {
    const dirs = getAllOrdersCandidateDirs();
    for (const d of dirs) {
        try {
            if (!fs.existsSync(d)) fs.ensureDirSync(d);
            const p = path.join(d, `${orderId}.json`);
            fs.writeJsonSync(p, orderData, { spaces: 2 });
        } catch(e) { console.error("!!! CRITICAL SSE ERROR !!!", e.stack || e); }
    }
}
// ---------------------------------------------------------------------------
// SINCRONIZADOR DE BASE DE DATOS CENTRAL (MONGODB - LXC 121)
// ---------------------------------------------------------------------------
let mongoDb = null;
try {
    mongoDb = require('./helpers/mongo_db');
} catch (e) {}
let mongoOrdersCache = [];
let mongoWorkersCache = [];
async function refreshMongoCache() {
    if (!mongoDb) return;
    try {
        const db = await mongoDb.getDb();
        if (db) {
            const rawOrders = await db.collection('orders').find().sort({ updated_at: -1 }).limit(100).toArray();
            mongoOrdersCache = rawOrders.map(o => {
                let createdAtStr = null;
                if (o.createdAt) createdAtStr = String(o.createdAt);
                else if (o.created_at) {
                    createdAtStr = (typeof o.created_at.toISOString === 'function') ? o.created_at.toISOString() : String(o.created_at);
                }
                return {
                    id: o.id,
                    type: o.type || 'upload',
                    project: o.project || 'STUDIO',
                    user: o.user || o.created_by || 'Artista',
                    priority: o.priority || 50,
                    status: o.status === 'queued' ? 'pending' : (o.status || 'pending'),
                    path: o.path || null,
                    targetType: o.targetType || null,
                    worker: o.worker || null,
                    workerHostname: o.workerHostname || null,
                    createdAt: createdAtStr,
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
            const rawWorkers = await db.collection('workers').find().toArray();
            mongoWorkersCache = rawWorkers.map(w => {
                const hbTime = (w.last_heartbeat && typeof w.last_heartbeat.toISOString === 'function')
                    ? w.last_heartbeat.toISOString()
                    : (w.last_heartbeat ? String(w.last_heartbeat) : null);
                const pingIso = w.lastPing || hbTime || new Date().toISOString();
                return {
                    workerId: w.worker_id || w.workerId,
                    hostname: w.hostname || 'Desconocido',
                    ip: w.ip || 'N/A',
                    pid: w.pid || null,
                    platform: w.platform || 'win32',
                    status: w.status || 'idle',
                    activeTask: w.activeTask || null,
                    lastPing: pingIso,
                    last_heartbeat: hbTime,
                    rcloneAvailable: w.rcloneAvailable !== false,
                    rcloneConf: w.rcloneConf || null,
                    system: w.system || null
                };
            });
        }
    } catch (e) {}
}
setInterval(refreshMongoCache, 1500);
setTimeout(refreshMongoCache, 200);
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
                `Z:/_SYNC_CACHE/restart_${key}.flag`,
        path.join(CACHE_ROOT, 'restart_worker.flag'),
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
                } catch(e) { /* ignore glitch */ }
            }
        } catch(e) {}
    }
    // 2. Escanear archivo heredado worker_status.json en cada raíz de caché
    const statusCandidates = [
        path.join(CACHE_ROOT, 'worker_status.json'),
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
    // 2.b Fusionar workers registrados en MongoDB (LXC 121)
    for (const mw of mongoWorkersCache) {
        if (mw && mw.workerId) {
            const existing = workersMap.get(mw.workerId);
            const mwTime = mw.last_heartbeat ? new Date(mw.last_heartbeat).getTime() : (mw.lastPing ? new Date(mw.lastPing).getTime() : 0);
            const exTime = existing ? (existing.last_heartbeat ? new Date(existing.last_heartbeat).getTime() : (existing.lastPing ? new Date(existing.lastPing).getTime() : 0)) : 0;
            if (!existing || mwTime >= exTime) {
                workersMap.set(mw.workerId, mw);
                memoryWorkersCache.set(mw.workerId, mw);
            }
        }
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
// localHost omitido por requerimiento
    const result = [];
    for (const w of hostMap.values()) {
        const hKey = (w.hostname || '').toLowerCase();
        if (hKey === 'lasp-pipeta-server' || hKey === 'lasp-vm' || hKey === 'localhost') {
            continue;
        }
        const hbTime = w.last_heartbeat ? new Date(w.last_heartbeat).getTime() : 0;
        const pingTime = w.lastPing ? new Date(w.lastPing).getTime() : 0;
        const effectiveTime = hbTime > 0 ? hbTime : pingTime;
        const diffSeconds = effectiveTime > 0 ? Math.max(0, Math.round((now - effectiveTime) / 1000)) : 999999;
        const isRecent = effectiveTime > 0 && diffSeconds <= 20;
        // Conservar historial de nodos conocidos hasta 30 días para que nunca desaparezcan del panel
        if (!isRecent && pingTime > 0 && diffSeconds > 30 * 86400) {
            continue;
        }
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
    // Fusionar órdenes registradas en MongoDB (LXC 121)
    for (const mo of mongoOrdersCache) {
        if (mo && mo.id && !ordersMap.has(mo.id)) {
            ordersMap.set(mo.id, mo);
        }
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
            path: o.path || null,
            targetType: o.targetType || null,
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
    return fs.existsSync(PAUSE_FLAG_FILE);
}
// ---------------------------------------------------------------------------
// ENDPOINTS REST
// ---------------------------------------------------------------------------
// 1. Resumen y Estado General
// Client debug log endpoint
let currentPublicUrl = null;
try {
    const pubPath = path.join(__dirname, 'public_url.txt');
    if (fs.existsSync(pubPath)) {
        currentPublicUrl = fs.readFileSync(pubPath, 'utf8').trim();
    }
} catch(e) {}
// =========================================================================
// ENDPOINTS DE CATÁLOGOS MODULARES CENTRALIZADOS (DRIVE Y SERVER / SMB)
// =========================================================================
// 1. Obtener manifiesto o sub-catálogo específico (JSON)
app.get('/api/sync/catalog/:project/modular', (req, res) => {
    try {
        const projectName = req.params.project;
        const type = (req.query.type === 'drive') ? 'drive' : 'server';
        const subKey = req.query.sub; // ej: 'assets2D', 'episodios/A01', etc.
        const projectsDir = path.join(CACHE_ROOT, 'projects');
        let resolvedProject = projectName;
        if (fs.existsSync(projectsDir)) {
            const dirs = fs.readdirSync(projectsDir);
            const found = dirs.find(d => d.toLowerCase() === projectName.toLowerCase());
            if (found) resolvedProject = found;
        }
        let targetFile = null;
        if (!subKey || subKey === 'manifest') {
            targetFile = path.join(projectsDir, resolvedProject, type, 'manifest.json');
        } else {
            const cleanSub = subKey.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.json$/i, '');
            targetFile = path.join(projectsDir, resolvedProject, type, `${cleanSub}.json`);
        }
        if (fs.existsSync(targetFile)) {
            res.setHeader('Cache-Control', 'public, max-age=5');
            return res.sendFile(path.resolve(targetFile));
        }
        return res.status(404).json({ 
            success: false, 
            error: `Catálogo no encontrado: ${resolvedProject}/${type}/${subKey || 'manifest'}` 
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});
// 2. Descargar paquete modular completo de un proyecto (.tar.gz) para hidratación ultrarrápida
app.get('/api/sync/catalog/:project/bundle', (req, res) => {
    try {
        const projectName = req.params.project;
        const type = req.query.type; // 'drive' | 'server' | undefined (ambos)
        const projectsDir = path.join(CACHE_ROOT, 'projects');
        let resolvedProject = projectName;
        if (fs.existsSync(projectsDir)) {
            const dirs = fs.readdirSync(projectsDir);
            const found = dirs.find(d => d.toLowerCase() === projectName.toLowerCase());
            if (found) resolvedProject = found;
        }
        let targetDir = path.join(projectsDir, resolvedProject);
        if (type === 'drive' || type === 'server') {
            targetDir = path.join(targetDir, type);
        }
        if (!fs.existsSync(targetDir)) {
            return res.status(404).json({ success: false, error: `Directorio de proyecto no encontrado: ${resolvedProject}` });
        }
        const { spawn } = require('child_process');
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${resolvedProject}_${type || 'all'}_catalog.tar.gz"`);
        const tar = spawn('tar', ['-czf', '-', '-C', targetDir, '.']);
        tar.stdout.pipe(res);
        tar.stderr.on('data', () => {});
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});
// 3. Listar proyectos disponibles en el servidor
app.get('/api/sync/catalog/available-projects', (req, res) => {
    try {
        const projectsDir = path.join(CACHE_ROOT, 'projects');
        if (!fs.existsSync(projectsDir)) {
            return res.json({ success: true, projects: [] });
        }
        const dirs = fs.readdirSync(projectsDir).filter(f => {
            const fp = path.join(projectsDir, f);
            try { return fs.statSync(fp).isDirectory(); } catch(e) { return false; }
        });
        return res.json({ success: true, projects: dirs });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});
app.post('/api/server/set-public-url', (req, res) => {
    if (req.body && req.body.publicUrl) {
        currentPublicUrl = req.body.publicUrl;
        console.log('[PIPETA SERVER] URL pública registrada:', currentPublicUrl);
    }
    res.json({ success: true, publicUrl: currentPublicUrl });
});
app.post('/api/client-log', (req, res) => {
    console.log('[BROWSER LOG]', JSON.stringify(req.body));
    res.json({ ok: true });
});
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
            officialVersion: getOfficialStudioVersion(),
            serverHost: os.hostname(),
            serverIp: getPrimaryIPv4(),
            serverPort: PORT,
            cacheRoot: CACHE_ROOT,
            queuePaused,
            publicUrl: currentPublicUrl,
            workers,
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
        // Depositar bandera también en VM 111 (origen real del _SYNC_CACHE que leen los workers vía S:).
        // El bridge hace rsync --delete 111 -> 121, por lo que una bandera escrita sólo en 121 se pierde.
        try {
            const flagJson = JSON.stringify({ requestedAt: new Date().toISOString(), requestedBy: 'admin', target: hostname });
            const b64 = Buffer.from(flagJson).toString('base64');
            const safeHost = hostname.replace(/[^a-z0-9_.-]/gi, '');
            exec(`${REMOTE_STUDIO_SSH} "echo ${b64} | base64 -d > /mnt/z/_SYNC_CACHE/restart_${safeHost}.flag"`, { timeout: 8000 }, (err) => {
                if (err) console.warn(`[PIPETA SERVER] No se pudo depositar bandera de reinicio en VM 111: ${err.message}`);
            });
        } catch(e){}
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
            path.join(__dirname, '../Launch_Worker.bat'),
            path.join(__dirname, '../Launch_Pipeta_Worker.bat'),
            'Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/Launch_Worker.bat',
            'Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/Launch_Pipeta_Worker.bat',
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
            const scriptPath = fs.existsSync(path.join(__dirname, '../Launch_Worker.bat')) ? path.join(__dirname, '../Launch_Worker.bat') : path.join(__dirname, '../Launch_Pipeta_Worker.bat');
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
            const remoteCmd = `cmd.exe /c Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\Launch_Pipeta_Worker.bat`;
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
            path.join('Z:/_SYNC_CACHE/workers', `${id}.json`)
        ];
        if (target && target.workerId) {
            candidates.push(path.join(WORKERS_DIR, `${target.workerId}.json`));
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
// Helper para actualizar archivos JSON de órdenes en VM 111 (/mnt/z/_SYNC_CACHE/requests) sin condiciones de carrera con rsync
function updateRemoteVm111Orders(ids, patchFields = {}, unsetFields = []) {
    try {
        const list = Array.isArray(ids) ? ids : [ids];
        if (list.length === 0) return 0;
        const pyScript = `
import os, json
ids = ${JSON.stringify(list)}
patch = ${JSON.stringify(patchFields)}
unsets = ${JSON.stringify(unsetFields)}
count = 0
for oid in ids:
    fp = f"/mnt/z/_SYNC_CACHE/requests/{oid}.json"
    if os.path.exists(fp):
        try:
            with open(fp, "r", encoding="utf-8") as f:
                d = json.load(f)
            d.update(patch)
            for k in unsets:
                d.pop(k, None)
            if "retriedAt" in patch and isinstance(d.get("progress"), dict):
                d["progress"]["percentage"] = 0
                d["progress"]["speedFormatted"] = "0 B/s"
                d["progress"]["etaSeconds"] = None
            with open(fp, "w", encoding="utf-8") as f:
                json.dump(d, f, indent=2)
            count += 1
        except Exception:
            pass
print(f"UPDATED:{count}")
`.trim();
        const b64 = Buffer.from(pyScript, 'utf8').toString('base64');
        const out = execSync(`${REMOTE_STUDIO_SSH} "python3 -c \\"import base64; exec(base64.b64decode('${b64}').decode('utf-8'))\\""`, { timeout: 4000 }).toString();
        const m = out.match(/UPDATED:(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
    } catch (e) {
        return 0;
    }
}

// 4. Pausar / Reanudar Cola Global
app.post('/api/server/queue/pause', (req, res) => {
    try {
        const { paused } = req.body;
        const targetState = paused !== undefined ? !!paused : !isQueuePaused();
        const targets = [PAUSE_FLAG_FILE, 'Z:/_SYNC_CACHE/queue_paused.flag'];
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
        // Propagar bandera a VM 111
        try {
            if (targetState) {
                execSync(`${REMOTE_STUDIO_SSH} 'echo "{\\"pausedAt\\":\\"${new Date().toISOString()}\\",\\"pausedBy\\":\\"admin\\"}" > /mnt/z/_SYNC_CACHE/queue_paused.flag'`, { timeout: 3000 });
            } else {
                execSync(`${REMOTE_STUDIO_SSH} 'rm -f /mnt/z/_SYNC_CACHE/queue_paused.flag'`, { timeout: 3000 });
            }
        } catch (e) {}
        console.log(`[PIPETA SERVER] Cola global ${targetState ? 'PAUSADA' : 'REANUDADA'} por administrador`);
        res.json({ success: true, queuePaused: targetState });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 5. Cambiar Prioridad de una Tarea (1 al 100)
app.post('/api/server/task/:id/priority', async (req, res) => {
    try {
        const { id } = req.params;
        const priority = Math.min(100, Math.max(1, parseInt(req.body.priority, 10) || 50));
        const nowIso = new Date().toISOString();
        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        // 1. Actualizar en almacenamiento central VM 111 primero (para que rsync no lo pise)
        if (updateRemoteVm111Orders([id], { priority, priorityUpdatedAt: nowIso }) > 0) {
            found = true;
        }

        // 2. Actualizar en directorios candidatos locales
        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const data = fs.readJsonSync(filePath);
                    data.priority = priority;
                    data.priorityUpdatedAt = nowIso;
                    fs.writeJsonSync(filePath, data, { spaces: 2 });
                    found = true;
                } catch(e) {}
            }
        }

        // 3. Actualizar en caché en memoria y en MongoDB
        for (const mo of mongoOrdersCache) {
            if (mo && mo.id === id) {
                mo.priority = priority;
                found = true;
            }
        }
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    const mRes = await db.collection('orders').updateMany(
                        { $or: [{ id: id }, { order_id: id }] },
                        { $set: { priority, priorityUpdatedAt: nowIso, updated_at: new Date() } }
                    );
                    if (mRes.matchedCount > 0 || mRes.modifiedCount > 0) found = true;
                    await refreshMongoCache();
                }
            } catch(e) {}
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
app.post('/api/server/task/:id/pause', async (req, res) => {
    try {
        const { id } = req.params;
        const nowIso = new Date().toISOString();
        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        if (updateRemoteVm111Orders([id], { status: 'paused', pausedAt: nowIso }) > 0) {
            found = true;
        }

        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const data = fs.readJsonSync(filePath);
                    if (data.status === 'pending') {
                        data.status = 'paused';
                        data.pausedAt = nowIso;
                        fs.writeJsonSync(filePath, data, { spaces: 2 });
                        found = true;
                    } else {
                        return res.status(400).json({ success: false, error: `No se puede pausar una tarea en estado '${data.status}'` });
                    }
                } catch(e) {}
            }
        }

        for (const mo of mongoOrdersCache) {
            if (mo && mo.id === id) {
                mo.status = 'paused';
                found = true;
            }
        }
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    const mRes = await db.collection('orders').updateMany(
                        { $or: [{ id: id }, { order_id: id }] },
                        { $set: { status: 'paused', pausedAt: nowIso, updated_at: new Date() } }
                    );
                    if (mRes.matchedCount > 0) found = true;
                    await refreshMongoCache();
                }
            } catch(e) {}
        }

        if (!found) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        res.json({ success: true, id, status: 'paused' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 7. Reanudar Tarea Individual Pausada
app.post('/api/server/task/:id/resume', async (req, res) => {
    try {
        const { id } = req.params;
        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        if (updateRemoteVm111Orders([id], { status: 'pending' }, ['pausedAt']) > 0) {
            found = true;
        }

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

        for (const mo of mongoOrdersCache) {
            if (mo && mo.id === id) {
                mo.status = 'pending';
                found = true;
            }
        }
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    const mRes = await db.collection('orders').updateMany(
                        { $or: [{ id: id }, { order_id: id }] },
                        { $set: { status: 'pending', updated_at: new Date() }, $unset: { pausedAt: "" } }
                    );
                    if (mRes.matchedCount > 0) found = true;
                    await refreshMongoCache();
                }
            } catch(e) {}
        }

        if (!found) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        res.json({ success: true, id, status: 'pending' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 8. Cancelar Tarea (En proceso o pendiente)
app.post('/api/server/task/:id/cancel', async (req, res) => {
    try {
        const { id } = req.params;
        const nowIso = new Date().toISOString();
        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        if (updateRemoteVm111Orders([id], { status: 'cancelled', cancelledAt: nowIso, cancelledBy: 'admin' }) > 0) {
            found = true;
        }

        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const data = fs.readJsonSync(filePath);
                    data.status = 'cancelled';
                    data.cancelledAt = nowIso;
                    data.cancelledBy = 'admin';
                    fs.writeJsonSync(filePath, data, { spaces: 2 });
                    found = true;
                } catch(e) {}
            }
        }

        for (const mo of mongoOrdersCache) {
            if (mo && mo.id === id) {
                mo.status = 'cancelled';
                found = true;
            }
        }
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    const mRes = await db.collection('orders').updateMany(
                        { $or: [{ id: id }, { order_id: id }] },
                        { $set: { status: 'cancelled', cancelledAt: nowIso, cancelledBy: 'admin', updated_at: new Date() } }
                    );
                    if (mRes.matchedCount > 0) found = true;
                    await refreshMongoCache();
                }
            } catch(e) {}
        }

        if (!found) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        console.log(`[PIPETA SERVER] Orden ${id} cancelada por administrador`);
        res.json({ success: true, id, status: 'cancelled' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 9. Reintentar Tarea (Retry con 1 clic)
app.post('/api/server/task/:id/retry', async (req, res) => {
    try {
        const { id } = req.params;
        const nowIso = new Date().toISOString();
        const dirs = getAllOrdersCandidateDirs();
        let found = false;

        if (updateRemoteVm111Orders([id], { status: 'pending', retriedAt: nowIso }, ['error', 'errors', 'cancelledAt', 'completedAt', 'durationSeconds', 'worker', 'workerHostname', 'startedAt']) > 0) {
            found = true;
        }

        for (const dir of dirs) {
            const filePath = path.join(dir, `${id}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const data = fs.readJsonSync(filePath);
                    data.status = 'pending';
                    data.retriedAt = nowIso;
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

        for (const mo of mongoOrdersCache) {
            if (mo && mo.id === id) {
                mo.status = 'pending';
                found = true;
            }
        }
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    const mRes = await db.collection('orders').updateMany(
                        { $or: [{ id: id }, { order_id: id }] },
                        {
                            $set: { status: 'pending', retriedAt: nowIso, updated_at: new Date() },
                            $unset: { error: "", errors: "", cancelledAt: "", completedAt: "", durationSeconds: "", worker: "", workerHostname: "", startedAt: "" }
                        }
                    );
                    if (mRes.matchedCount > 0) found = true;
                    await refreshMongoCache();
                }
            } catch(e) {}
        }

        if (!found) return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        console.log(`[PIPETA SERVER] Orden ${id} puesta en reintento (estado: pending)`);
        res.json({ success: true, id, status: 'pending' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 10. Eliminar Tarea de la Cola / Historial
app.post('/api/server/task/:id/delete', async (req, res) => {
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
        // Borrar en almacenamiento central VM 111
        try {
            execSync(`${REMOTE_STUDIO_SSH} 'rm -f /mnt/z/_SYNC_CACHE/requests/${id}.json'`, { timeout: 4000 });
            deleted = true;
        } catch(e) {}

        // Borrar en MongoDB
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    const mRes = await db.collection('orders').deleteMany({
                        $or: [{ id: id }, { order_id: id }]
                    });
                    if (mRes.deletedCount > 0) deleted = true;
                    await refreshMongoCache();
                }
            } catch(e) {}
        }
        console.log(`[PIPETA SERVER] Orden ${id} eliminada permanentemente`);
        res.json({ success: true, id, deleted: true });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 11. Limpiar Todo el Historial Finalizado
app.post('/api/server/queue/clear-history', async (req, res) => {
    try {
        const dirs = getAllOrdersCandidateDirs();
        const finishedStatuses = ['completed', 'completed_with_errors', 'failed', 'cancelled'];
        let count = 0;

        // A. Limpieza local en directorios candidatos (incluyendo archivos corruptos con status finalizado)
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            try {
                const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
                for (const f of files) {
                    const fullP = path.join(dir, f);
                    try {
                        let isFinished = false;
                        try {
                            const data = fs.readJsonSync(fullP);
                            if (data && finishedStatuses.includes(data.status)) isFinished = true;
                        } catch(e) {
                            const raw = fs.readFileSync(fullP, 'utf8');
                            if (raw.includes('"completed"') || raw.includes('"failed"') || raw.includes('"cancelled"') || raw.includes('"completedAt"')) {
                                isFinished = true;
                            }
                        }
                        if (isFinished) {
                            fs.removeSync(fullP);
                            count++;
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        }

        // B. Limpieza remota en el almacenamiento central del estudio (VM 111: /mnt/z/_SYNC_CACHE/requests)
        try {
            execSync(`${REMOTE_STUDIO_SSH} "python3 /home/lasp-linux/clean_vm111.py"`, { timeout: 10000 });
            console.log('[PIPETA SERVER] Órdenes finalizadas eliminadas del almacenamiento central en VM 111');
        } catch(e) {
            console.warn('[PIPETA SERVER WARN] Error al ejecutar limpieza en VM 111:', e.message);
        }

        // C. Limpiar en base de datos MongoDB
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    const mRes = await db.collection('orders').deleteMany({
                        $or: [
                            { status: { $in: finishedStatuses } },
                            { completedAt: { $exists: true, $ne: null } }
                        ]
                    });
                    count += (mRes.deletedCount || 0);
                    await refreshMongoCache();
                }
            } catch(e) {}
        }

        console.log(`[PIPETA SERVER] Historial limpiado: ${count} órdenes eliminadas en total`);
        res.json({ success: true, clearedCount: count });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 11b. Operaciones Masivas / Batch (Delete, Cancel, Retry, Priority, Requeue All)
app.post('/api/server/tasks/batch', async (req, res) => {
    try {
        const { action, ids, priority } = req.body || {};
        const dirs = getAllOrdersCandidateDirs();
        let affectedCount = 0;

        if (action === 'requeue_all_failed') {
            for (const dir of dirs) {
                if (!fs.existsSync(dir)) continue;
                try {
                    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
                    for (const f of files) {
                        const fullP = path.join(dir, f);
                        try {
                            const data = fs.readJsonSync(fullP);
                            if (data && (data.status === 'failed' || data.status === 'cancelled')) {
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
                                fs.writeJsonSync(fullP, data, { spaces: 2 });
                                affectedCount++;
                            }
                        } catch(e) {}
                    }
                } catch(e) {}
            }
            if (mongoDb) {
                try {
                    const db = await mongoDb.getDb();
                    if (db) {
                        const mRes = await db.collection('orders').updateMany(
                            { status: { $in: ['failed', 'cancelled'] } },
                            {
                                $set: { status: 'pending', retriedAt: new Date().toISOString() },
                                $unset: { error: "", errors: "", cancelledAt: "", completedAt: "", durationSeconds: "", worker: "", workerHostname: "", startedAt: "" }
                            }
                        );
                        affectedCount += (mRes.modifiedCount || 0);
                        await refreshMongoCache();
                    }
                } catch(e) {}
            }
            console.log(`[PIPETA SERVER BATCH] Reencoladas ${affectedCount} tareas fallidas/canceladas`);
            return res.json({ success: true, action, affectedCount });
        }

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de IDs vacía' });
        }

        const idSet = new Set(ids);
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            for (const id of idSet) {
                const filePath = path.join(dir, `${id}.json`);
                if (!fs.existsSync(filePath)) continue;
                try {
                    if (action === 'delete') {
                        fs.removeSync(filePath);
                        affectedCount++;
                    } else if (action === 'cancel') {
                        const data = fs.readJsonSync(filePath);
                        data.status = 'cancelled';
                        data.cancelledAt = new Date().toISOString();
                        data.cancelledBy = 'admin';
                        fs.writeJsonSync(filePath, data, { spaces: 2 });
                        affectedCount++;
                    } else if (action === 'retry') {
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
                        affectedCount++;
                    } else if (action === 'priority') {
                        const newP = Math.min(100, Math.max(1, parseInt(priority, 10) || 50));
                        const data = fs.readJsonSync(filePath);
                        data.priority = newP;
                        data.priorityUpdatedAt = new Date().toISOString();
                        fs.writeJsonSync(filePath, data, { spaces: 2 });
                        affectedCount++;
                    }
                } catch(e) {}
            }
        }

        // Sincronizar acción en lote en almacenamiento central VM 111
        try {
            if (action === 'delete') {
                const rmFiles = ids.map(id => `/mnt/z/_SYNC_CACHE/requests/${id}.json`).join(' ');
                if (rmFiles) {
                    execSync(`${REMOTE_STUDIO_SSH} 'rm -f ${rmFiles}'`, { timeout: 4000 });
                }
            } else if (action === 'cancel') {
                affectedCount += updateRemoteVm111Orders(ids, { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: 'admin' });
            } else if (action === 'retry') {
                affectedCount += updateRemoteVm111Orders(ids, { status: 'pending', retriedAt: new Date().toISOString() }, ['error', 'errors', 'cancelledAt', 'completedAt', 'durationSeconds', 'worker', 'workerHostname', 'startedAt']);
            } else if (action === 'priority') {
                const newP = Math.min(100, Math.max(1, parseInt(priority, 10) || 50));
                affectedCount += updateRemoteVm111Orders(ids, { priority: newP, priorityUpdatedAt: new Date().toISOString() });
            }
        } catch(e) {}

        // Sincronizar acción en lote en MongoDB
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    if (action === 'delete') {
                        const mRes = await db.collection('orders').deleteMany({
                            $or: [{ id: { $in: ids } }, { order_id: { $in: ids } }]
                        });
                        affectedCount += (mRes.deletedCount || 0);
                    } else if (action === 'cancel') {
                        await db.collection('orders').updateMany(
                            { $or: [{ id: { $in: ids } }, { order_id: { $in: ids } }] },
                            { $set: { status: 'cancelled', cancelledAt: new Date().toISOString(), cancelledBy: 'admin' } }
                        );
                    } else if (action === 'retry') {
                        await db.collection('orders').updateMany(
                            { $or: [{ id: { $in: ids } }, { order_id: { $in: ids } }] },
                            {
                                $set: { status: 'pending', retriedAt: new Date().toISOString() },
                                $unset: { error: "", errors: "", cancelledAt: "", completedAt: "", durationSeconds: "", worker: "", workerHostname: "", startedAt: "" }
                            }
                        );
                    } else if (action === 'priority') {
                        const newP = Math.min(100, Math.max(1, parseInt(priority, 10) || 50));
                        await db.collection('orders').updateMany(
                            { $or: [{ id: { $in: ids } }, { order_id: { $in: ids } }] },
                            { $set: { priority: newP, priorityUpdatedAt: new Date().toISOString() } }
                        );
                    }
                    await refreshMongoCache();
                }
            } catch(e) {}
        }

        console.log(`[PIPETA SERVER BATCH] Acción '${action}' aplicada a ${affectedCount} tareas (disco + MongoDB)`);
        res.json({ success: true, action, affectedCount });
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
                officialVersion: getOfficialStudioVersion(),
                publicUrl: currentPublicUrl,
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
    }
    // Envío inicial inmediato
    sendSnapshot();
    // Pulso cada 1 segundo
    const interval = setInterval(sendSnapshot, 1000);
    req.on('close', () => {
        clearInterval(interval);
    });
});
// ---------------------------------------------------------------------------
// TELEMETRÍA Y REGISTRO DE FLOTA DE EQUIPOS (Mecanismos A y B)
// ---------------------------------------------------------------------------
let mongoClientsCache = [];
async function refreshMongoClientsCache() {
    if (!mongoDb) return;
    try {
        const db = await mongoDb.getDb();
        if (db) {
            mongoClientsCache = await db.collection('clients').find().sort({ lastSeen: -1 }).limit(200).toArray();
        }
    } catch(e) {}
}
setInterval(refreshMongoClientsCache, 10000);
setTimeout(refreshMongoClientsCache, 1000);

// ---------------------------------------------------------------------------
// VERSIÓN LIVE: se lee directamente del config.js de Pipeta publicado en el Z del estudio
// (VM 111: /mnt/z/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/ui/js/config.js). Sin pasos manuales.
// ---------------------------------------------------------------------------
let liveStudioVersionCache = null;
let liveStudioVersionCheckedAt = 0;
function refreshLiveStudioVersion() {
    const remoteCfg = '/mnt/z/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/ui/js/config.js';
    exec(`${REMOTE_STUDIO_SSH} "grep -m1 -o 'APP_VERSION *= *[^;]*' ${remoteCfg}"`, { timeout: 8000 }, (err, stdout) => {
        if (err || !stdout) return;
        const m = String(stdout).match(/["']([^"']+)["']/);
        if (m && m[1]) {
            const v = m[1].trim();
            if (v !== liveStudioVersionCache) {
                console.log(`[PIPETA SERVER] 🚀 Versión live detectada en Z del estudio: ${v}`);
            }
            liveStudioVersionCache = v;
            liveStudioVersionCheckedAt = Date.now();
        }
    });
}
setInterval(refreshLiveStudioVersion, 30000);
setTimeout(refreshLiveStudioVersion, 500);

function getOfficialStudioVersion() {
    // 1. Fuente de verdad: config.js publicado en Z (cache válido por 5 minutos)
    if (liveStudioVersionCache && (Date.now() - liveStudioVersionCheckedAt) < 5 * 60 * 1000) {
        return liveStudioVersionCache;
    }
    // 1.b Rutas locales directas al config.js publicado (cuando el server corre en Windows)
    for (const cfg of ['S:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/ui/js/config.js']) {
        try {
            if (fs.existsSync(cfg)) {
                const m = fs.readFileSync(cfg, 'utf8').match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
                if (m) return m[1].trim();
            }
        } catch(e) {}
    }
    // 2. Fallbacks heredados
    const candidates = [
        '/opt/_SYNC_CACHE/studio_version.json',
        path.join(CACHE_ROOT, 'studio_version.json'),
        'Z:/_SYNC_CACHE/studio_version.json',
        'S:/_SYNC_CACHE/studio_version.json'
    ];
    for (const p of candidates) {
        if (p && fs.existsSync(p)) {
            try {
                const d = fs.readJsonSync(p);
                if (d && d.version) return d.version.trim();
            } catch(e) {}
        }
    }
    try {
        const configPath = path.join(__dirname, '../ui/js/config.js');
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf8');
            const m = raw.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
            if (m) return m[1].trim();
        }
    } catch(e) {}
    try {
        const zConfig = 'Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS\Pipeta/ui/js/config.js';
        if (fs.existsSync(zConfig)) {
            const raw = fs.readFileSync(zConfig, 'utf8');
            const m = raw.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
            if (m) return m[1].trim();
        }
    } catch(e) {}
    return "v1.1.52";
}

const clientUpdateStatus = new Map();
const clientConfigSyncStatus = new Map(); // hostname -> { status: 'queued' | 'executing', at: timestamp }


function getRegisteredClients() {
    const clientsMap = new Map();
    const candidateDirs = getAllClientsCandidateDirs();

    // A. Escanear JSONs en disco (Mecanismo B: instalador/bat y Mecanismo A offline)
    for (const dir of candidateDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
            for (const f of files) {
                try {
                    const fullP = path.join(dir, f);
                    const data = fs.readJsonSync(fullP);
                    const hName = (data.hostname || f.replace(/^client_/, '').replace(/\.json$/, '')).toLowerCase();
                    if (!clientsMap.has(hName) || new Date(data.lastSeen || data.updatedAt || 0) > new Date(clientsMap.get(hName).lastSeen || 0)) {
                        clientsMap.set(hName, {
                            ...data,
                            hostname: data.hostname || hName,
                            source: data.source || 'disk_footprint'
                        });
                    }
                } catch(e) {}
            }
        } catch(e) {}
    }

    // B. Fusionar con MongoDB (Mecanismo A en tiempo real)
    for (const mc of mongoClientsCache) {
        const hName = (mc.hostname || '').toLowerCase();
        if (!hName) continue;
        const existing = clientsMap.get(hName);
        const mcTime = new Date(mc.lastSeen || mc.updatedAt || 0).getTime();
        const exTime = existing ? new Date(existing.lastSeen || existing.updatedAt || 0).getTime() : 0;
        if (!existing || mcTime >= exTime) {
            clientsMap.set(hName, {
                ...mc,
                source: 'mongodb'
            });
        }
    }

    const now = Date.now();
    const targetVersion = getOfficialStudioVersion();

    const clientsList = Array.from(clientsMap.values()).map(c => {
        const lastSeenDate = c.lastSeen ? new Date(c.lastSeen) : (c.updatedAt ? new Date(c.updatedAt) : null);
        const diffSeconds = lastSeenDate ? Math.max(0, Math.round((now - lastSeenDate.getTime()) / 1000)) : 999999;
        const isOnline = diffSeconds <= 300; // Activo en los últimos 5 minutos

        let versionMatch = 'unknown';
        if (c.version) {
            versionMatch = (c.version.trim() === targetVersion) ? 'latest' : 'outdated';
        }

        return {
            hostname: c.hostname || 'Desconocido',
            osUser: c.osUser || c.user || c.username || 'N/A',
            ramonUser: c.ramonUser || c.tacticUser || 'Sin asignar',
            version: c.version || 'v1.0.0',
            versionStatus: versionMatch,
            ip: c.ip || c.ipLocal || 'Desconocida',
            sede: (() => {
                const ipSede = deduceSede(c.ip || c.ipLocal, null);
                if (ipSede === 'LASP (Munro)') return ipSede; // IP del estudio (206/200) => Munro aunque el cliente reporte "Remoto"
                const raw = c.sede || ipSede;
                if (raw.toLowerCase().includes('munro')) return 'LASP (Munro)';
                if (raw.toLowerCase().includes('nonstop') || raw.toLowerCase().includes('madrid')) return 'WeNonStop (Madrid)';
                return raw;
            })(),
            platform: c.platform || 'win32',
            lastSeen: lastSeenDate ? lastSeenDate.toISOString() : null,
            lastSeenSecondsAgo: diffSeconds,
            isOnline,
            hasPendingUpdate: clientUpdateStatus.has((c.hostname || '').toLowerCase()),
            hasPendingConfigSync: clientConfigSyncStatus.has((c.hostname || '').toLowerCase()),
            installedAt: c.installedAt || c.firstSeen || null,
            source: c.source
        };
    });

    // Orden determinista por defecto: por Hostname ascendente para evitar saltos de orden en pings
    clientsList.sort((a, b) => {
        const hostA = String(a.hostname || '').toLowerCase();
        const hostB = String(b.hostname || '').toLowerCase();
        return hostA.localeCompare(hostB, undefined, { numeric: true, sensitivity: 'base' });
    });

    return clientsList;
}

// Endpoint para recibir telemetría / ping de clientes Pipeta (Mecanismo A) y huellas del instalador (Mecanismo B)
app.post('/api/server/telemetry/client-ping', async (req, res) => {
    try {
        const {
            hostname,
            version,
            osUser,
            ramonUser,
            ip,
            sede,
            platform = 'win32',
            source = 'app_ping',
            installedAt
        } = req.body || {};

        if (!hostname) {
            return res.status(400).json({ success: false, error: 'hostname es requerido' });
        }

        // IP efectiva: priorizar la placa principal 206. El socket TCP que llega al server
        // sale por la 206 aunque el cliente haya reportado su placa secundaria (200).
        const socketIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace(/^::ffff:/, '').split(',')[0].trim();
        const reportedIps = [ip, ...(Array.isArray(req.body?.ips) ? req.body.ips : [])].filter(Boolean).map(String);
        const ip206 = [...reportedIps, socketIp].find(x => x.startsWith('192.168.206.'));
        const effectiveIp = ip206 || ip || socketIp || '';
        let effectiveSede = deduceSede(effectiveIp, req);
        if (sede) {
            if (sede.toLowerCase().includes('munro')) effectiveSede = 'LASP (Munro)';
            else if (sede.toLowerCase().includes('nonstop') || sede.toLowerCase().includes('madrid')) effectiveSede = 'WeNonStop (Madrid)';
        }
        const nowIso = new Date().toISOString();

        const clientDoc = {
            hostname: String(hostname).toLowerCase().trim(),
            version: version || 'v1.1.50',
            osUser: osUser || 'Artista',
            ramonUser: ramonUser || 'Sin asignar',
            ip: effectiveIp,
            sede: effectiveSede,
            platform,
            source,
            lastSeen: nowIso,
            updatedAt: nowIso
        };
        if (installedAt) clientDoc.installedAt = installedAt;

        // 1. Guardar en disco local/red para persistencia inmediata
        try {
            const diskDirs = getAllClientsCandidateDirs();
            for (const d of diskDirs) {
                if (fs.existsSync(d)) {
                    fs.writeJsonSync(path.join(d, `client_${clientDoc.hostname}.json`), clientDoc, { spaces: 2 });
                    break;
                }
            }
        } catch(e) {}

        // 2. Guardar/Upsert en MongoDB
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    await db.collection('clients').updateOne(
                        { hostname: clientDoc.hostname },
                        {
                            $set: clientDoc,
                            $setOnInsert: { firstSeen: nowIso }
                        },
                        { upsert: true }
                    );
                }
            } catch(e) {}
        }

        // 3. Auto-registro del usuario (Ramón / dominio) en Users del Server con rol por defecto
        try { autoRegisterServerUser(clientDoc.ramonUser, clientDoc.osUser, clientDoc.hostname); } catch(e) {}
        const hostLower = String(hostname).toLowerCase().trim();
        const currentTargetVer = getOfficialStudioVersion();
        let command = null;

        if (clientUpdateStatus.has(hostLower)) {
            const upInfo = clientUpdateStatus.get(hostLower);

            if (upInfo.status === 'queued') {
                // Primer ping tras el click del admin: Entregar comando de reinstalacion / actualizacion
                command = 'reinstall';
                upInfo.status = 'executing';
                upInfo.sentAt = Date.now();
                console.log(`[PIPETA SERVER] ⚡ Enviando orden de REINSTALACIÓN / ACTUALIZACIÓN a equipo: ${hostLower.toUpperCase()} (Objetivo: ${currentTargetVer})`);
            } else if (upInfo.status === 'executing') {
                const elapsed = Date.now() - (upInfo.sentAt || 0);
                const clientUptime = Number(req.body.uptime ?? 9999);

                // Deteccion infalible de reinicio completado:
                // El equipo ya reinicio (uptime < 25s) y han transcurrido al menos 4 segundos desde el envio
                // O ya reporta la version y han pasado mas de 8s
                const isTargetVer = version && (version.trim() === currentTargetVer || version.trim() >= currentTargetVer);
                if (isTargetVer || (elapsed > 3000 && clientUptime < 25) || elapsed > 90000) {
                    clientUpdateStatus.delete(hostLower);
                    console.log(`[PIPETA SERVER] ✅ Equipo ${hostLower.toUpperCase()} completó reinstalación/actualización exitosamente.`);
                } else if (elapsed > 180000) {
                    // Timeout de seguridad tras 3 minutos
                    clientUpdateStatus.delete(hostLower);
                    console.warn(`[PIPETA SERVER] ⚠️ Tiempo de espera agotado para equipo ${hostLower.toUpperCase()}`);
                } else {
                    // En proceso de sincronizar/reiniciar: NUNCA reenviar comando para evitar loops de consola!
                    command = null;
                }
            }
        } else if (clientConfigSyncStatus.has(hostLower)) {
            const cfgInfo = clientConfigSyncStatus.get(hostLower);
            if (cfgInfo.status === 'queued') {
                command = 'sync_config';
                cfgInfo.status = 'executing';
                cfgInfo.sentAt = Date.now();
                console.log(`[PIPETA SERVER] ⚙️ Enviando orden de SINCRONIZACIÓN DE CONFIGURACIONES a equipo: ${hostLower.toUpperCase()}`);
            } else if (cfgInfo.status === 'executing') {
                const elapsed = Date.now() - (cfgInfo.sentAt || 0);
                const clientSync = Number(req.body.lastConfigSync || 0);
                if (clientSync >= (cfgInfo.sentAt - 2000) || elapsed > 8000) {
                    clientConfigSyncStatus.delete(hostLower);
                    console.log(`[PIPETA SERVER] ✅ Sincronización de configuraciones y proyectos completada exitosamente en equipo: ${hostLower.toUpperCase()}`);
                } else if (elapsed > 120000) {
                    clientConfigSyncStatus.delete(hostLower);
                } else {
                    command = null;
                }
            }
        }
        res.json({
            success: true,
            command,
            targetVersion: currentTargetVer,
            client: clientDoc
        });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Órdenes de actualización pendientes por hostname (con persistencia de estado)
// Endpoint para cancelar orden de actualización de un equipo
app.delete('/api/server/client/:hostname/update', (req, res) => {
    try {
        const hostname = String(req.params.hostname || '').toLowerCase().trim();
        if (!hostname) return res.status(400).json({ success: false, error: 'Hostname requerido' });

        clientUpdateStatus.delete(hostname);

        const flagDirs = getAllClientsCandidateDirs().map(d => path.join(path.dirname(d), 'flags'));
        for (const fd of flagDirs) {
            try {
                const fp = path.join(fd, `update_${hostname}.flag`);
                if (fs.existsSync(fp)) fs.removeSync(fp);
            } catch(e) {}
        }

        console.log(`[PIPETA SERVER] ⏹ Orden de actualización CANCELADA para equipo: ${hostname.toUpperCase()}`);
        res.json({ success: true, hostname, cancelled: true });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/server/client/:hostname/update', (req, res) => {
    try {
        const hostname = String(req.params.hostname || '').toLowerCase().trim();
        if (!hostname) return res.status(400).json({ success: false, error: 'Hostname requerido' });

        clientUpdateStatus.set(hostname, { status: 'queued', at: Date.now() });

        // Crear flag file en almacenamiento de red como fallback
        const flagDirs = getAllClientsCandidateDirs().map(d => path.join(path.dirname(d), 'flags'));
        for (const fd of flagDirs) {
            try {
                fs.ensureDirSync(fd);
                fs.writeFileSync(path.join(fd, `update_${hostname}.flag`), new Date().toISOString());
            } catch(e) {}
        }

        console.log(`[PIPETA SERVER] 🚀 Orden de actualización remota ENCOLADA para equipo: ${hostname.toUpperCase()}`);
        res.json({ success: true, hostname, queued: true });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/server/clients/batch-update', (req, res) => {
    try {
        const { hostnames } = req.body;
        if (!Array.isArray(hostnames) || hostnames.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de hostnames requerida' });
        }

        const normalized = hostnames.map(h => String(h).toLowerCase().trim()).filter(Boolean);
        const flagDirs = getAllClientsCandidateDirs().map(d => path.join(path.dirname(d), 'flags'));

        for (const h of normalized) {
            clientUpdateStatus.set(h, { status: 'queued', at: Date.now() });
            for (const fd of flagDirs) {
                try {
                    fs.ensureDirSync(fd);
                    fs.writeFileSync(path.join(fd, `update_${h}.flag`), new Date().toISOString());
                } catch(e) {}
            }
        }

        console.log(`[PIPETA SERVER] 🚀 Órdenes de actualización en lote encoladas para ${normalized.length} equipos: ${normalized.join(', ').toUpperCase()}`);
        res.json({ success: true, count: normalized.length, hostnames: normalized });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint para remover un equipo individual del registro


// ---------------------------------------------------------------------------
// GESTIÓN DE CONFIGURACIONES DE USUARIOS Y PROYECTOS (PRESETS MAESTROS)
// ---------------------------------------------------------------------------
function getServerPresetsDir() {
    const p1 = '/opt/_SYNC_CACHE/presets';
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(__dirname, 'presets');
    if (!fs.existsSync(p2)) fs.mkdirSync(p2, { recursive: true });
    return p2;
}

function getServerProjectsDir() {
    const dir = path.join(getServerPresetsDir(), 'Projects');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// Endpoints para sincronizacion de solo configuraciones / presets / proyectos
app.post('/api/server/client/:hostname/sync-config', (req, res) => {
    try {
        const hostname = String(req.params.hostname || '').toLowerCase().trim();
        if (!hostname) return res.status(400).json({ success: false, error: 'Hostname requerido' });

        clientConfigSyncStatus.set(hostname, { status: 'queued', at: Date.now() });
        console.log(`[PIPETA SERVER] ⚙️ Orden de sincronización de configuraciones ENCOLADA para equipo: ${hostname.toUpperCase()}`);
        res.json({ success: true, hostname, queued: true });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/server/clients/batch-sync-config', (req, res) => {
    try {
        const { hostnames } = req.body;
        if (!Array.isArray(hostnames) || hostnames.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de hostnames requerida' });
        }

        const normalized = hostnames.map(h => String(h).toLowerCase().trim()).filter(Boolean);
        for (const h of normalized) {
            clientConfigSyncStatus.set(h, { status: 'queued', at: Date.now() });
        }

        console.log(`[PIPETA SERVER] ⚙️ Órdenes de sincronización de configuraciones encoladas para ${normalized.length} equipos: ${normalized.join(', ').toUpperCase()}`);
        res.json({ success: true, count: normalized.length, hostnames: normalized });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/server/client/:hostname/sync-config', (req, res) => {
    try {
        const hostname = String(req.params.hostname || '').toLowerCase().trim();
        if (!hostname) return res.status(400).json({ success: false, error: 'Hostname requerido' });
        clientConfigSyncStatus.delete(hostname);
        res.json({ success: true, hostname, cancelled: true });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});



// API: Obtener configuraciones de usuarios y roles

// Helper para invocar ramon_client.py de forma segura en el servidor
function runServerRamonBridge(args, timeoutMs = 15000) {
    return new Promise((resolve) => {
        const pyBin = process.platform === 'win32' ? 'python' : 'python3';
        const scriptPath = path.join(__dirname, 'helpers', 'ramon_client.py');
        const pyProc = spawn(pyBin, [scriptPath, ...args], {
            timeout: timeoutMs
        });

        let stdout = '';
        let stderr = '';

        pyProc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
        pyProc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

        pyProc.on('close', (code) => {
            if (code !== 0 && !stdout.trim()) {
                resolve({ success: false, error: stderr.trim() || `Process exited with code ${code}` });
                return;
            }
            try {
                const parsed = JSON.parse(stdout.trim());
                resolve(parsed);
            } catch (err) {
                resolve({ success: false, error: `Invalid JSON output: ${stdout}` });
            }
        });

        pyProc.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });
    });
}

// Endpoint para consultar usuarios activos de Ramón (TACTIC)
app.get('/api/server/ramon-users', async (req, res) => {
    try {
        const resData = await runServerRamonBridge(['users'], 15000);
        res.json(resData);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint seguro para invocar comandos de Ramón desde clientes remotos (0 LAN requerida)
app.post('/api/server/ramon/bridge', async (req, res) => {
    try {
        const { args } = req.body || {};
        if (!Array.isArray(args) || args.length === 0) {
            return res.status(400).json({ success: false, error: "Array 'args' requerido" });
        }
        const cmd = args[0];
        // Solo permitir comandos de solo lectura
        if (!['login', 'ping', 'tasks', 'project_tasks', 'projects', 'users'].includes(cmd)) {
            return res.status(403).json({ success: false, error: `Comando Ramón no permitido: ${cmd}` });
        }
        const result = await runServerRamonBridge(args, 25000);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// PERSISTENCIA DE USERS_CONFIG + AUTO-REGISTRO DE USUARIOS NUEVOS
// ---------------------------------------------------------------------------
async function loadServerUsersConfig() {
    const filePath = path.join(getServerPresetsDir(), 'users_config.json');
    if (fs.existsSync(filePath)) {
        try { return fs.readJsonSync(filePath); } catch(e) {}
    }
    if (mongoDb) {
        try {
            const db = await mongoDb.getDb();
            const doc = db ? await db.collection('presets').findOne({ id: 'users_config' }) : null;
            if (doc && doc.data) return doc.data;
        } catch(e) {}
    }
    return null;
}

async function persistUsersConfig(config) {
    const presetsDir = getServerPresetsDir();
    fs.ensureDirSync(presetsDir);
    fs.writeJsonSync(path.join(presetsDir, 'users_config.json'), config, { spaces: 2 });

    // Mirroring a rutas de presets en red si están disponibles
    const mirrorDirs = [
        CACHE_ROOT,
        'Z:\\_SYNC_CACHE',
        'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets',
        'S:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets',
        '/mnt/stornext/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/presets'
    ];
    for (const md of mirrorDirs) {
        try {
            if (md && fs.existsSync(md)) {
                fs.writeJsonSync(path.join(md, 'users_config.json'), config, { spaces: 2 });
            }
        } catch(mErr) {}
    }

    // Propagar a VM 111 (/mnt/z/_SYNC_CACHE/users_config.json y presets) para lectura inmediata del Worker
    try {
        const b64Cfg = Buffer.from(JSON.stringify(config, null, 2), 'utf8').toString('base64');
        const pyWrite = `import os,base64; data=base64.b64decode('${b64Cfg}'); [open(p,'wb').write(data) for p in ['/mnt/z/_SYNC_CACHE/users_config.json','/mnt/z/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/presets/users_config.json'] if os.path.exists(os.path.dirname(p))]`;
        execSync(`${REMOTE_STUDIO_SSH} "python3 -c \\"${pyWrite}\\""`, { timeout: 4000 });
    } catch (e) {}

    // Guardar en MongoDB
    if (mongoDb) {
        try {
            const db = await mongoDb.getDb();
            await db.collection('presets').updateOne(
                { id: 'users_config' },
                { $set: { id: 'users_config', data: config, updatedAt: new Date().toISOString() } },
                { upsert: true }
            );
        } catch(e) {}
    }
}

const INVALID_AUTO_USERS = new Set(['', 'sin asignar', 'n/a', 'artista', 'admin', 'user', 'system', 'desconocido', 'lasp-service', 'administrator', 'administrador']);
const autoRegisterInFlight = new Set();
let autoRegisterChain = Promise.resolve();

function normalizeLoginName(v) {
    return String(v || '').trim().toLowerCase().replace(/^.*\\/, ''); // quita prefijo DOMINIO\
}

function autoRegisterServerUser(ramonUser, osUser, hostname) {
    // Prioridad: usuario de Ramón; si no hay, usuario de dominio con prefijo lasp-
    let login = normalizeLoginName(ramonUser);
    if (INVALID_AUTO_USERS.has(login)) {
        const os2 = normalizeLoginName(osUser);
        login = (os2.startsWith('lasp-') && !INVALID_AUTO_USERS.has(os2)) ? os2 : '';
    }
    if (!login || INVALID_AUTO_USERS.has(login) || autoRegisterInFlight.has(login)) return;
    autoRegisterInFlight.add(login);

    // Serializar escrituras para evitar carreras entre pings simultáneos
    autoRegisterChain = autoRegisterChain.then(async () => {
        try {
            const config = await loadServerUsersConfig();
            if (!config || !Array.isArray(config.users) || !Array.isArray(config.roles)) return;
            if (config.autoRegisterRamonUsers === false) return;

            const clean = login.replace(/^lasp-/, '');
            const exists = config.users.some(u => {
                const l = String(u.laspUser || '').trim().toLowerCase();
                const n = String(u.username || '').trim().toLowerCase();
                const i = String(u.id || '').trim().toLowerCase();
                return l === login || n === login || i === `u_${login}` || l === `lasp-${clean}` || n === clean;
            });
            if (exists) return;

            const defaultRole = config.roles.some(r => r.id === config.defaultRamonRole) ? config.defaultRamonRole : 'user';
            const roleObj = config.roles.find(r => r.id === defaultRole);
            config.users.push({
                id: `u_${login.replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString().slice(-4)}`,
                username: login,
                firstName: '',
                lastName: '',
                laspUser: login,
                role: defaultRole,
                email: '',
                notes: `Auto-registrado al iniciar Pipeta en ${String(hostname || '').toUpperCase()} (${new Date().toISOString().slice(0, 10)})`,
                avatarColor: (roleObj && roleObj.color) || '#00bcd4',
                isSystem: false,
                authSource: 'ramon',
                autoRegistered: true,
                permissionOverrides: {}
            });
            await persistUsersConfig(config);
            console.log(`[PIPETA SERVER] 👤 Usuario nuevo auto-registrado: ${login} (rol: ${defaultRole}) desde ${hostname}`);
        } catch (e) {
            console.warn(`[PIPETA SERVER] Error auto-registrando usuario ${login}: ${e.message}`);
        } finally {
            autoRegisterInFlight.delete(login);
        }
    });
}

// Barrido inicial: registrar usuarios de equipos ya conocidos que nunca se sumaron
setTimeout(() => {
    try {
        for (const c of getRegisteredClients()) {
            autoRegisterServerUser(c.ramonUser, c.osUser, c.hostname);
        }
    } catch(e) {}
}, 15000);

app.get('/api/server/users-config', async (req, res) => {
    try {
        const filePath = path.join(getServerPresetsDir(), 'users_config.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readJsonSync(filePath);
            return res.json({ success: true, config: data });
        }
        
        // Fallback desde MongoDB si existe
        if (mongoDb) {
            const db = await mongoDb.getDb();
            const doc = await db.collection('presets').findOne({ id: 'users_config' });
            if (doc && doc.data) {
                return res.json({ success: true, config: doc.data });
            }
        }

        // Default básico si no existe
        res.json({
            success: true,
            config: {
                roles: [
                    { id: 'admin', name: 'Administrador', description: 'Control total', color: '#ff9800', isSystem: true, permissions: { access_explorer: true, manageUsers: true, manageSettings: true } },
                    { id: 'user', name: 'Artista', description: 'Operador estándar', color: '#00bcd4', isSystem: true, permissions: { access_explorer: true, manageUsers: false } }
                ],
                users: [
                    { id: 'u_admin', username: 'admin', firstName: 'Admin', lastName: '', role: 'admin', laspUser: '', avatarColor: '#ff9800', isSystem: true }
                ]
            }
        });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Guardar configuraciones de usuarios y roles
app.post('/api/server/users-config', async (req, res) => {
    try {
        const { config } = req.body;
        if (!config || !Array.isArray(config.roles) || !Array.isArray(config.users)) {
            return res.status(400).json({ success: false, error: 'Estructura de configuración inválida' });
        }

        await persistUsersConfig(config);

        console.log(`[PIPETA SERVER] 👤 Configuraciones de usuarios y roles actualizadas exitosamente (${config.users.length} usuarios, ${config.roles.length} roles).`);
        res.json({ success: true, message: 'Configuraciones de usuario guardadas' });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Distribuir configuraciones de usuario a todos los puestos
app.post('/api/server/users-config/distribute', async (req, res) => {
    try {
        const clients = getRegisteredClients();
        const targetClients = clients.filter(c => c.sede && c.sede.includes('Munro'));
        for (const c of targetClients) {
            clientConfigSyncStatus.set((c.hostname || '').toLowerCase(), { status: 'queued', at: Date.now() });
        }
        console.log(`[PIPETA SERVER] 📡 Distribuyendo configuraciones de usuario a ${targetClients.length} puestos.`);
        res.json({ success: true, count: targetClients.length, message: `Configuraciones encoladas para ${targetClients.length} equipos` });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Obtener lista completa de proyectos del estudio
app.get('/api/server/projects-config', async (req, res) => {
    try {
        const projDir = getServerProjectsDir();
        if (!fs.existsSync(projDir)) fs.ensureDirSync(projDir);
        const files = fs.readdirSync(projDir).filter(f => f.endsWith('.json'));
        const projects = [];

        for (const f of files) {
            try {
                const data = fs.readJsonSync(path.join(projDir, f));
                projects.push({
                    file: f,
                    ...data,
                    id: data.id || f.replace('.json', ''),
                    name: data.name || f.replace('.json', ''),
                    isBase: !!(data.isBase || f === 'base.json' || data.id === 'proj_base')
                });
            } catch(e) {}
        }

        // Ordenar: Base primero, luego alfabéticamente
        projects.sort((a, b) => {
            if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        res.json({ success: true, count: projects.length, projects });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Guardar o crear proyecto completo (con presets IA, templates y rutas)
app.post('/api/server/projects-config', async (req, res) => {
    try {
        const { project, originalFile } = req.body;
        if (!project || !project.name) {
            return res.status(400).json({ success: false, error: 'Nombre de proyecto requerido' });
        }

        const projDir = getServerProjectsDir();
        fs.ensureDirSync(projDir);

        let fileName = project.file;
        if (!fileName) {
            if (project.isBase || project.id === 'proj_base') {
                fileName = 'base.json';
            } else {
                const clean = project.name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_');
                fileName = `${clean}.json`;
            }
        }

        // Si se renombró o duplicó con otro archivo, limpiar el viejo si se especificó
        if (originalFile && originalFile !== fileName && originalFile !== 'base.json') {
            const oldPath = path.join(projDir, originalFile);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const projectPayload = {
            ...project,
            file: fileName,
            id: project.id || (project.isBase ? 'proj_base' : `proj_${Date.now()}`),
            name: project.name,
            client: project.client || '',
            projectCode: project.projectCode || '',
            isBase: !!(project.isBase || fileName === 'base.json' || project.id === 'proj_base'),
            overrideBasePresets: !!project.overrideBasePresets,
            roots: project.roots || {},
            defaultShotPresetId: project.defaultShotPresetId || 'master_shot',
            defaultAssetPresetId: project.defaultAssetPresetId || 'master_asset',
            templates: project.templates || {},
            iaPresets: project.iaPresets || {},
            updatedAt: new Date().toISOString()
        };

        const filePath = path.join(projDir, fileName);
        fs.writeJsonSync(filePath, projectPayload, { spaces: 2 });

        // Guardar en MongoDB
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                await db.collection('presets').updateOne(
                    { id: `project_${fileName.replace('.json', '')}` },
                    { $set: { id: `project_${fileName.replace('.json', '')}`, data: projectPayload, updatedAt: new Date().toISOString() } },
                    { upsert: true }
                );
            } catch(mErr){}
        }

        console.log(`[PROJECTS] 📁 Proyecto guardado: ${fileName} (${projectPayload.name})`);
        res.json({ success: true, file: fileName, project: projectPayload });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Eliminar proyecto
app.delete('/api/server/projects-config/:name', async (req, res) => {
    try {
        const target = decodeURIComponent(req.params.name || '').toLowerCase().trim();
        if (!target) return res.status(400).json({ success: false, error: 'Identificador de proyecto requerido' });

        if (target === 'base.json' || target === 'proyecto base' || target === 'base') {
            return res.status(400).json({ success: false, error: 'No se puede eliminar la plantilla del Proyecto Base' });
        }

        const projDir = getServerProjectsDir();
        const files = fs.readdirSync(projDir).filter(f => f.endsWith('.json'));
        let deleted = false;

        for (const f of files) {
            if (f === 'base.json') continue;
            let match = false;
            if (f.toLowerCase() === target || f.toLowerCase().replace('.json', '') === target) {
                match = true;
            } else {
                try {
                    const d = fs.readJsonSync(path.join(projDir, f));
                    if ((d.name && d.name.toLowerCase() === target) || (d.id && d.id.toLowerCase() === target)) {
                        match = true;
                    }
                } catch(e){}
            }

            if (match) {
                fs.unlinkSync(path.join(projDir, f));
                deleted = true;
                if (mongoDb) {
                    try {
                        const db = await mongoDb.getDb();
                        await db.collection('presets').deleteOne({ id: `project_${f.replace('.json', '')}` });
                    } catch(mErr){}
                }
                break;
            }
        }

        if (deleted) {
            res.json({ success: true, message: `Proyecto "${target}" eliminado` });
        } else {
            res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
        }
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/server/projects-config/distribute', async (req, res) => {
    try {
        const clients = getRegisteredClients();
        const targetClients = clients.filter(c => c.sede && c.sede.includes('Munro'));
        for (const c of targetClients) {
            clientConfigSyncStatus.set((c.hostname || '').toLowerCase(), { status: 'queued', at: Date.now() });
        }
        console.log(`[PIPETA SERVER] 📡 Distribuyendo proyectos a ${targetClients.length} puestos.`);
        res.json({ success: true, count: targetClients.length, message: `Proyectos encolados para ${targetClients.length} equipos` });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Paquete de sincronizacion de presets completo (para que clientes lo descarguen por HTTP)
app.get('/api/server/presets/bundle', async (req, res) => {
    try {
        const presetsDir = getServerPresetsDir();
        const bundle = {};

        const safeRead = (filePath) => {
            try {
                if (!fs.existsSync(filePath)) return null;
                const txt = fs.readFileSync(filePath, 'utf-8').trim();
                if (!txt) return {};
                return JSON.parse(txt);
            } catch(e) {
                return null;
            }
        };

        // 1. users_config.json
        const uData = safeRead(path.join(presetsDir, 'users_config.json'));
        if (uData) bundle['users_config.json'] = uData;

        // 2. pipeline_config.json
        const pData = safeRead(path.join(presetsDir, 'pipeline_config.json'));
        if (pData) bundle['pipeline_config.json'] = pData;

        // 3. status_config.json
        const sData = safeRead(path.join(presetsDir, 'status_config.json'));
        if (sData) bundle['status_config.json'] = sData;

        // 4. Projects/*.json
        bundle['Projects'] = {};
        const pDir = path.join(presetsDir, 'Projects');
        if (fs.existsSync(pDir)) {
            const pFiles = fs.readdirSync(pDir).filter(f => f.endsWith('.json'));
            for (const pf of pFiles) {
                const projData = safeRead(path.join(pDir, pf));
                if (projData) bundle['Projects'][pf] = projData;
            }
        }

        res.json({ success: true, bundle, updatedAt: new Date().toISOString() });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});




app.delete('/api/server/client/:hostname', async (req, res) => {
    try {
        const hostname = String(req.params.hostname || '').toLowerCase().trim();
        if (!hostname) return res.status(400).json({ success: false, error: 'Hostname requerido' });

        // 1. Borrar de directorios en disco (local y Z:/_SYNC_CACHE)
        const candidateDirs = getAllClientsCandidateDirs();
        for (const dir of candidateDirs) {
            const p = path.join(dir, `client_${hostname}.json`);
            if (fs.existsSync(p)) {
                try { fs.removeSync(p); } catch(e) {}
            }
        }

        // 2. Borrar de VM 111 si está accesible
        try {
            execSync(`${REMOTE_STUDIO_SSH} "rm -f /mnt/z/_SYNC_CACHE/clients/client_${hostname}.json"`, { timeout: 3000 });
        } catch(e) {}

        // 3. Borrar de MongoDB
        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    await db.collection('clients').deleteMany({
                        hostname: { $regex: new RegExp(`^${hostname}$`, 'i') }
                    });
                }
            } catch(e) {}
        }

        mongoClientsCache = mongoClientsCache.filter(c => (c.hostname || '').toLowerCase() !== hostname);
        console.log(`[PIPETA SERVER] Equipo ${hostname.toUpperCase()} removido del registro de flota`);
        res.json({ success: true, hostname });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint para remover múltiples equipos seleccionados (batch)
app.post('/api/server/clients/batch-delete', async (req, res) => {
    try {
        const { hostnames } = req.body;
        if (!Array.isArray(hostnames) || hostnames.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de hostnames requerida' });
        }

        const normalizedHosts = hostnames.map(h => String(h).toLowerCase().trim()).filter(Boolean);
        const candidateDirs = getAllClientsCandidateDirs();

        for (const h of normalizedHosts) {
            for (const dir of candidateDirs) {
                const p = path.join(dir, `client_${h}.json`);
                if (fs.existsSync(p)) {
                    try { fs.removeSync(p); } catch(e) {}
                }
            }
            try {
                execSync(`${REMOTE_STUDIO_SSH} "rm -f /mnt/z/_SYNC_CACHE/clients/client_${h}.json"`, { timeout: 2000 });
            } catch(e) {}
        }

        if (mongoDb) {
            try {
                const db = await mongoDb.getDb();
                if (db) {
                    await db.collection('clients').deleteMany({
                        hostname: { $in: normalizedHosts.map(h => new RegExp(`^${h}$`, 'i')) }
                    });
                }
            } catch(e) {}
        }

        mongoClientsCache = mongoClientsCache.filter(c => !normalizedHosts.includes((c.hostname || '').toLowerCase()));
        console.log(`[PIPETA SERVER] ${normalizedHosts.length} equipos removidos en lote del registro: ${normalizedHosts.join(', ').toUpperCase()}`);
        res.json({ success: true, count: normalizedHosts.length, hostnames: normalizedHosts });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint para consultar la lista de clientes/equipos detectados
app.get('/api/server/clients', (req, res) => {
    try {
        const currentTargetVer = getOfficialStudioVersion();
        const clients = getRegisteredClients();
        const counts = {
            total: clients.length,
            online: clients.filter(c => c.isOnline).length,
            munro: clients.filter(c => c.sede.includes('Munro')).length,
            nonstop: clients.filter(c => c.sede.includes('Nonstop')).length,
            remote: clients.filter(c => c.sede.includes('Remoto') || c.sede.includes('VPN')).length,
            outdated: clients.filter(c => c.versionStatus === 'outdated').length
        };
        res.json({ success: true, officialVersion: currentTargetVer, counts, clients });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// LOGS Y CONSOLA DE DIAGNÓSTICO EN VIVO
// ---------------------------------------------------------------------------
const serverLogsBuffer = [];
const MAX_SERVER_LOGS = 600;

function pushServerLog(type, msg, status) {
    const now = new Date();
    const time = now.toLocaleTimeString('es-AR', { hour12: false });
    const isoTime = now.toISOString();
    const entry = {
        type: type || 'system',
        status: status || (type === 'error' ? 'error' : (type === 'warn' ? 'warn' : 'info')),
        message: String(msg),
        time,
        isoTime
    };
    serverLogsBuffer.push(entry);
    if (serverLogsBuffer.length > MAX_SERVER_LOGS) {
        serverLogsBuffer.shift();
    }
}

// Interceptar console.log, console.warn y console.error
const origConsoleLog = console.log;
const origConsoleWarn = console.warn;
const origConsoleError = console.error;

console.log = function(...args) {
    origConsoleLog.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    let type = 'system';
    if (msg.includes('QUEUE') || msg.includes('Orden') || msg.includes('orden') || msg.includes('Historial') || msg.includes('BATCH') || msg.includes('sync')) {
        type = 'sync';
    } else if (msg.includes('telemetry') || msg.includes('client') || msg.includes('ping') || msg.includes('worker') || msg.includes('Worker')) {
        type = 'telemetry';
    }
    pushServerLog(type, msg, 'info');
};

console.warn = function(...args) {
    origConsoleWarn.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    pushServerLog('warn', msg, 'warn');
};

console.error = function(...args) {
    origConsoleError.apply(console, args);
    const msg = args.map(a => (typeof a === 'object' ? (a.stack || JSON.stringify(a)) : String(a))).join(' ');
    pushServerLog('error', msg, 'error');
};

// Cargar líneas recientes de PM2 si existen
try {
    const pm2ErrPath = '/root/.pm2/logs/pipeta-server-error.log';
    if (fs.existsSync(pm2ErrPath)) {
        const errContent = fs.readFileSync(pm2ErrPath, 'utf8');
        const errLines = errContent.split('\n').filter(l => l.trim().length > 0).slice(-15);
        for (const l of errLines) {
            pushServerLog('error', l, 'error');
        }
    }
} catch(e) {}

// Endpoints de logs
app.get('/api/server/logs', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 200;
    res.json({
        success: true,
        total: serverLogsBuffer.length,
        logs: serverLogsBuffer.slice(-limit)
    });
});

app.delete('/api/server/logs', (req, res) => {
    serverLogsBuffer.length = 0;
    pushServerLog('system', 'Consola del servidor limpiada por el usuario', 'info');
    res.json({ success: true });
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
