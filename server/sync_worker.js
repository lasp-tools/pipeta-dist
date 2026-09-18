const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const catalogGenerator = require('./sync_catalog_generator');

const UNC_CACHE = '//192.168.206.116/Z/_SYNC_CACHE';
const CACHE_ROOT = fs.existsSync('Z:/_SYNC_CACHE') 
    ? 'Z:/_SYNC_CACHE' 
    : (fs.existsSync(UNC_CACHE) ? UNC_CACHE : path.join(__dirname, '../_SYNC_CACHE'));
const ORDERS_DIR = path.join(CACHE_ROOT, 'requests');
const STATUS_FILE = path.join(CACHE_ROOT, 'worker_status.json');
const TRIGGER_FILE = path.join(CACHE_ROOT, 'catalog_refresh_trigger.json');

const RCLONE_EXE = path.join(__dirname, '../tools/rclone/rclone.exe');
const RCLONE_CONF = fs.existsSync('Z:/INTERNO/TOOLS/Instaladores/rclone.conf')
    ? 'Z:/INTERNO/TOOLS/Instaladores/rclone.conf'
    : (fs.existsSync(path.join(__dirname, '../tools/rclone/rclone.conf'))
        ? path.join(__dirname, '../tools/rclone/rclone.conf')
        : null);

const WORKER_ID = `worker_${os.hostname()}_${process.pid}`;
let isProcessing = false;
let currentOrder = null;
let teamDrivesMap = null;

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
 * Resuelve la ruta local considerando las letras de unidad en Server (Z:) vs Dev (S:)
 */
function resolveLocalPathForWorker(p) {
    if (!p) return '';
    return p.replace(/\\/g, '/');
}

/**
 * Actualiza el archivo de latido (heartbeat) para que Pipeta UI conozca el estado del Worker
 */
function updateHeartbeat(status = 'idle', activeTask = null) {
    try {
        fs.ensureDirSync(CACHE_ROOT);
        const data = {
            workerId: WORKER_ID,
            hostname: os.hostname(),
            platform: os.platform(),
            status,
            activeTask,
            lastPing: new Date().toISOString(),
            rcloneAvailable: fs.existsSync(RCLONE_EXE),
            rcloneConf: RCLONE_CONF
        };
        fs.writeJsonSync(STATUS_FILE, data, { spaces: 2 });
    } catch (e) {
        // Silenciar errores de heartbeat
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

/**
 * Ejecuta Rclone en segundo plano capturando métricas de progreso (--stats 1s --use-json-log)
 */
function runRcloneWithProgress(args, onProgress) {
    return new Promise((resolve, reject) => {
        const fullArgs = [
            ...args,
            '--stats', '1s',
            '--use-json-log',
            '-v'
        ];

        const proc = spawn(RCLONE_EXE, fullArgs, {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderrBuffer = '';
        let stdoutBuffer = '';

        function handleLine(line) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return;
            try {
                const parsed = JSON.parse(trimmed);
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
            reject(err);
        });

        proc.on('close', (code) => {
            if (stderrBuffer) handleLine(stderrBuffer);
            if (stdoutBuffer) handleLine(stdoutBuffer);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`rclone terminó con código de salida ${code}`));
            }
        });
    });
}

/**
 * Procesa una transferencia individual con Rclone reportando progreso
 */
async function executeRcloneTransfer(type, item, orderData = null, onProgress = null) {
    if (!fs.existsSync(RCLONE_EXE)) {
        throw new Error(`rclone.exe no encontrado en: ${RCLONE_EXE}`);
    }
    if (!RCLONE_CONF) {
        throw new Error(`rclone.conf no encontrado`);
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
                '--config', RCLONE_CONF,
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
                '--config', RCLONE_CONF,
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
                    '--config', RCLONE_CONF,
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
                '--config', RCLONE_CONF,
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
                '--config', RCLONE_CONF,
                'copyto',
                localSource,
                `lasp-drive:${remote.relPath}`,
                '--drive-team-drive', remote.teamDriveId
            ];
            await runRcloneWithProgress(args, onProgress);
        }
    } else {
        throw new Error(`Tipo de operación desconocido: ${type}`);
    }
}

/**
 * Revisa la cola de órdenes en Z:\_SYNC_CACHE\requests\
 */
async function processQueue() {
    if (isProcessing) return;
    if (!fs.existsSync(ORDERS_DIR)) return;

    let files = [];
    try {
        files = fs.readdirSync(ORDERS_DIR).filter(f => f.endsWith('.json'));
    } catch (e) {
        return;
    }

    if (files.length === 0) return;

    // Buscar la orden pendiente más antigua (FIFO)
    let pendingOrderFile = null;
    let orderData = null;

    for (const file of files) {
        const fullPath = path.join(ORDERS_DIR, file);
        try {
            const data = fs.readJsonSync(fullPath);
            if (data.status === 'pending' && data.type !== 'server_download' && data.type !== 'server_upload') {
                if (!orderData || new Date(data.createdAt) < new Date(orderData.createdAt)) {
                    orderData = data;
                    pendingOrderFile = fullPath;
                }
            }
        } catch (e) {}
    }

    if (!orderData || !pendingOrderFile) return;

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
        try { fs.writeJsonSync(pendingOrderFile, orderData, { spaces: 2 }); } catch (e) {}

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
            fs.writeJsonSync(pendingOrderFile, orderData, { spaces: 2 });
            log(`✅ Refresco de carpeta '${orderData.path}' (${targetType.toUpperCase()}) completado por Worker (${res.itemsCount || 0} items)`);
        } catch (err) {
            log(`❌ Error al refrescar carpeta '${orderData.path}': ${err.message}`);
            orderData.status = 'failed';
            orderData.error = err.message;
            orderData.completedAt = new Date().toISOString();
            orderData.processedBy = WORKER_ID;
            try { fs.writeJsonSync(pendingOrderFile, orderData, { spaces: 2 }); } catch (e) {}
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
    try {
        fs.writeJsonSync(pendingOrderFile, orderData, { spaces: 2 });
    } catch (e) {}

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

        for (let i = 0; i < orderData.items.length; i++) {
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
                    try { fs.writeJsonSync(pendingOrderFile, orderData, { spaces: 2 }); } catch (e) {}
                    updateHeartbeat('processing', {
                        orderId: orderData.id,
                        type: orderData.type,
                        project: orderData.project,
                        progress: orderData.progress
                    });
                }
            };

            try {
                await executeRcloneTransfer(orderData.type, item, orderData, itemProgressCallback);
                successCount++;
            } catch (err) {
                failedCount++;
                log(`  ❌ Error en item ${item.name}: ${err.message}`);
                errors.push({ item: item.name, error: err.message });
            }
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
                    const folder = item.localPath ? path.dirname(item.localPath).replace(/\\/g, '/') : null;
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

        fs.writeJsonSync(pendingOrderFile, orderData, { spaces: 2 });

    } catch (fatalErr) {
        log(`💥 Error fatal procesando orden ${orderData.id}: ${fatalErr.message}`);
        orderData.status = 'failed';
        orderData.error = fatalErr.message;
        orderData.completedAt = new Date().toISOString();
        try {
            fs.writeJsonSync(pendingOrderFile, orderData, { spaces: 2 });
        } catch (e) {}
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

            const project = trigger.project || 'surf_love';
            log(`🔄 Trigger de catálogo detectado para proyecto: ${project}`);

            updateHeartbeat('refreshing_catalog', { project });
            await catalogGenerator.generateProjectCatalog(project, { mode: 'auto' });
            if (typeof catalogGenerator.generateServerCatalog === 'function') {
                await catalogGenerator.generateServerCatalog(project);
            }
            log(`✅ Catálogos (Drive y Server) de ${project} actualizados exitosamente por trigger`);
            updateHeartbeat('idle', null);
        } catch (e) {
            log(`❌ Error procesando trigger de catálogo: ${e.message}`);
            updateHeartbeat('idle', null);
        }
    }
}

const RESTART_FILE = path.join(CACHE_ROOT, 'restart_worker.flag');

/**
 * Ciclo principal del Worker
 */
async function runLoop() {
    try {
        if (!isProcessing && fs.existsSync(RESTART_FILE)) {
            log(`🔄 Bandera de reinicio detectada (${RESTART_FILE}). Saliendo limpiamente para auto-reinicio...`);
            try { fs.removeSync(RESTART_FILE); } catch(e){}
            process.exit(0);
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

    // Verificar si existe el catálogo principal (surf_love); si no, generarlo
    const surfLoveCatalog = path.join(CACHE_ROOT, 'surf_love.json');
    if (!fs.existsSync(surfLoveCatalog)) {
        log(`ℹ️ No se detectó catálogo offline de 'surf_love'. Generándolo por primera vez...`);
        try {
            updateHeartbeat('initializing_catalog', { project: 'surf_love' });
            await catalogGenerator.generateProjectCatalog('surf_love', { mode: 'auto' });
            log(`✅ Catálogo offline de 'surf_love' generado exitosamente.`);
        } catch (e) {
            log(`⚠️ No se pudo generar catálogo inicial de surf_love: ${e.message}`);
        }
    } else {
        log(`✓ Catálogo offline de 'surf_love' disponible en cache.`);
    }

    // Verificar si existe el catálogo del servidor (server_surf_love); si no, generarlo
    const surfLoveServerCatalog = path.join(CACHE_ROOT, 'server_surf_love.json');
    if (!fs.existsSync(surfLoveServerCatalog)) {
        log(`ℹ️ No se detectó catálogo del servidor de 'surf_love'. Generándolo por primera vez...`);
        try {
            updateHeartbeat('initializing_server_catalog', { project: 'surf_love' });
            if (typeof catalogGenerator.generateServerCatalog === 'function') {
                await catalogGenerator.generateServerCatalog('surf_love');
            }
            log(`✅ Catálogo de servidor de 'surf_love' generado exitosamente.`);
        } catch (e) {
            log(`⚠️ No se pudo generar catálogo inicial de servidor: ${e.message}`);
        }
    } else {
        log(`✓ Catálogo de servidor de 'surf_love' disponible en cache.`);
    }

    updateHeartbeat('idle', null);
    log(`🚀 Worker en línea y escuchando órdenes de transferencia...\n`);

    // Bucle de sondeo: cada 1 segundo para respuesta rápida a órdenes y refrescos
    setInterval(runLoop, 1000);

    // Bucle de refresco de catálogos periódicos: cada 15 minutos
    setInterval(async () => {
        if (!isProcessing) {
            log(`⏰ Refresco periódico de catálogos activos iniciado...`);
            try {
                await catalogGenerator.generateProjectCatalog('surf_love', { mode: 'auto' });
                if (typeof catalogGenerator.generateServerCatalog === 'function') {
                    await catalogGenerator.generateServerCatalog('surf_love');
                }
                log(`✅ Refresco periódico completado.`);
            } catch (e) {
                log(`Advertencia en refresco periódico: ${e.message}`);
            }
        }
    }, 15 * 60 * 1000);
}

// Iniciar worker
startupCheck().catch(err => {
    console.error('Error fatal al iniciar Pipeta Sync Worker:', err);
    process.exit(1);
});
