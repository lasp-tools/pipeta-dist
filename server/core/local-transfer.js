const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { getCachedEnvState } = require('./env-detector');
const {
    getLocalSyncCacheDir,
    getAllOrdersCandidateDirs,
    writeOrderFileAtomic,
    getServerUncRoot,
    ensureServerUncAccess,
    formatSpeed,
    getDirectoryFilesAndSize,
    serverDirCache,
    rcloneDirCache,
    ordersFileMemoryCache,
    ordersResponseCache
} = require('./sync-paths');

const activeLocalTransfers = new Map();
const ensuredDirsCache = new Set();

function ensureDirCached(dir) {
    if (!dir) return;
    try {
        if (!ensuredDirsCache.has(dir) || !fs.existsSync(dir)) {
            fs.ensureDirSync(dir);
            ensuredDirsCache.add(dir);
        }
    } catch (e) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            ensuredDirsCache.add(dir);
        } catch (err2) {
            console.error('[FS] Error creando directorio ' + dir + ':', err2.message);
        }
    }
}

function streamCopyFile(srcFile, destFile, onChunk, abortSignal = null) {
    return new Promise((resolve, reject) => {
        if (abortSignal && abortSignal.aborted) {
            return reject(new Error('TRANSF_ABORTED'));
        }
        try {
            ensureDirCached(path.dirname(destFile));
            const readStream = fs.createReadStream(srcFile, { highWaterMark: 1024 * 1024 * 2 });
            const writeStream = fs.createWriteStream(destFile, { highWaterMark: 1024 * 1024 * 2 });

            const onAbort = () => {
                try { readStream.destroy(); } catch (e) {}
                try { writeStream.destroy(); } catch (e) {}
                try { if (fs.existsSync(destFile)) fs.removeSync(destFile); } catch (e) {}
                reject(new Error('TRANSF_ABORTED'));
            };

            if (abortSignal) {
                abortSignal.addEventListener('abort', onAbort, { once: true });
            }

            readStream.on('data', (chunk) => {
                if (onChunk) onChunk(chunk.length);
            });

            readStream.on('error', (err) => {
                if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
                try { writeStream.destroy(); } catch (e) {}
                reject(err);
            });

            writeStream.on('error', (err) => {
                if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
                try { readStream.destroy(); } catch (e) {}
                reject(err);
            });

            writeStream.on('finish', async () => {
                if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
                try {
                    const srcStat = await fs.promises.stat(srcFile);
                    await fs.promises.utimes(destFile, srcStat.atime, srcStat.mtime);
                } catch (e) {}
                resolve();
            });

            readStream.pipe(writeStream);
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Ejecuta una orden de transferencia física en LAN (Local <-> SMB).
 * @param {string} orderId
 * @param {object} orderData
 * @param {string} filePath
 * @param {{ ensureSyncWorkerRunning?: () => void, catalogGenerator?: any }} [deps]
 */
async function runLocalTransferOrder(orderId, orderData, filePath, deps = {}) {
    const { ensureSyncWorkerRunning = () => {}, catalogGenerator = {} } = deps;
    const startTime = Date.now();
    const abortController = new AbortController();
    const candidateDirs = getAllOrdersCandidateDirs();
    const activeTransfer = {
        abortController,
        isCancelled: false,
        currentDestFile: null,
        orderData,
        filePath,
        candidateDirs
    };
    activeLocalTransfers.set(orderId, activeTransfer);

    orderData.status = 'processing';
    orderData.startedAt = new Date().toISOString();
    orderData.worker = `local_${os.hostname()}`;

    let inFlightWrite = null;
    const persistOrder = (isTerminal = false) => {
        const jsonStr = JSON.stringify(orderData, null, 2);
        for (const dir of candidateDirs) {
            const p = path.join(dir, `${orderId}.json`);
            ordersFileMemoryCache.set(p, {
                mtimeMs: Date.now(),
                checkedAt: Date.now(),
                isTerminal,
                data: JSON.parse(jsonStr)
            });
        }
        ordersResponseCache.time = 0;

        try {
            const localReqDir = path.join(getLocalSyncCacheDir(), 'requests');
            fs.ensureDirSync(localReqDir);
            writeOrderFileAtomic(path.join(localReqDir, `${orderId}.json`), jsonStr);
        } catch (e) {}

        const localReqDirLower = path.resolve(path.join(getLocalSyncCacheDir(), 'requests')).toLowerCase();
        const targetDirs = candidateDirs.filter(dir => path.resolve(dir).toLowerCase() !== localReqDirLower);

        if (isTerminal) {
            inFlightWrite = null;
            for (const dir of targetDirs) {
                try {
                    writeOrderFileAtomic(path.join(dir, `${orderId}.json`), jsonStr);
                } catch (e) {}
            }
        } else if (!inFlightWrite) {
            inFlightWrite = Promise.all(targetDirs.map(async (dir) => {
                try {
                    await fs.writeFile(path.join(dir, `${orderId}.json`), jsonStr, 'utf8');
                } catch (e) {}
            })).finally(() => { inFlightWrite = null; });
        }
    };

    persistOrder(false);

    const env = getCachedEnvState() || {};
    const isNotRealServer = !env?.zInfo?.isRealServer;
    const uncRoot = isNotRealServer ? getServerUncRoot() : null;
    if (isNotRealServer && uncRoot) {
        ensureServerUncAccess(uncRoot);
    }

    const isDownload = orderData.type === 'server_download' || (orderData.twoStage && orderData.twoStageType === 'download' && orderData.currentStage === 2);
    const itemsPlan = [];
    let grandTotalBytes = 0;

    for (const it of orderData.items) {
        let src = '';
        let dest = '';

        if (isDownload) {
            src = (it.serverPath || '').replace(/\\/g, '/');
            if (!src || src.toLowerCase().startsWith('g:/') || src.toLowerCase().includes('unidades compartidas')) {
                const cand = (it.targetLocalPath || it.localPath || it.path || '').replace(/\\/g, '/');
                src = (isNotRealServer && uncRoot) ? cand.replace(/^[a-zA-Z]:/i, uncRoot) : cand;
            }
            if (isNotRealServer && uncRoot && src.toLowerCase().startsWith('z:/')) {
                src = src.replace(/^z:/i, uncRoot);
            }
            dest = (it.targetLocalPath || it.localPath || it.path || '').replace(/\\/g, '/');
            if (dest.toLowerCase().startsWith('z:/') && !fs.existsSync('Z:/') && fs.existsSync('D:/Z')) {
                dest = dest.replace(/^z:/i, 'D:/Z');
            }
        } else {
            src = (it.localPath || it.path || '').replace(/\\/g, '/');
            if (src.toLowerCase().startsWith('z:/') && !fs.existsSync('Z:/') && fs.existsSync('D:/Z')) {
                src = src.replace(/^z:/i, 'D:/Z');
            }
            dest = (it.targetServerPath || it.serverPath || '').replace(/\\/g, '/');
            if (!dest) {
                const cand = (it.localPath || it.path || '').replace(/\\/g, '/');
                dest = (isNotRealServer && uncRoot) ? cand.replace(/^[a-zA-Z]:/i, uncRoot) : cand;
            }
            if (isNotRealServer && uncRoot && dest.toLowerCase().startsWith('z:/')) {
                dest = dest.replace(/^z:/i, uncRoot);
            }
        }

        if (!src || !dest) continue;
        src = src.replace(/\\/g, '/');
        dest = dest.replace(/\\/g, '/');

        let isDir = !!it.isDir || !!it.isDirectory;
        let filesList = [];
        let itemBytes = 0;

        try {
            if (fs.existsSync(src)) {
                const st = fs.statSync(src);
                isDir = st.isDirectory();
                if (isDir) {
                    const dirData = getDirectoryFilesAndSize(src);
                    filesList = dirData.files;
                    itemBytes = dirData.totalBytes;
                } else {
                    itemBytes = st.size;
                    filesList = [{ fullPath: src, relPath: path.basename(src), size: itemBytes, mtimeMs: st.mtimeMs }];
                }
            }
        } catch (e) {
            console.warn(`[LOCAL TRANSFER] Error al analizar ${src}:`, e.message);
        }

        grandTotalBytes += itemBytes;
        itemsPlan.push({ src, dest, isDir, filesList, itemBytes, it });
    }

    let overallTransferredBytes = 0;
    let lastProgressWrite = 0;
    let windowStartTime = Date.now();
    let windowBytesTransferred = 0;
    let lastSpeed = 0;

    const updateProgress = (force = false, currentFileName = '', itemIndex = 1) => {
        if (activeTransfer.isCancelled || abortController.signal.aborted) return;
        const now = Date.now();
        if (!force && (now - lastProgressWrite < 800)) return;

        const timeDiffSec = (now - windowStartTime) / 1000;
        if (timeDiffSec >= 0.8) {
            lastSpeed = Math.round(windowBytesTransferred / timeDiffSec);
            windowBytesTransferred = 0;
            windowStartTime = now;
        }

        const avgSpeed = (now - startTime > 200)
            ? Math.round(overallTransferredBytes / Math.max(0.2, (now - startTime) / 1000))
            : lastSpeed;
        const currentSpeed = lastSpeed > 0 ? lastSpeed : avgSpeed;

        const remainingBytes = Math.max(0, grandTotalBytes - overallTransferredBytes);
        const etaSeconds = (currentSpeed > 0 && remainingBytes > 0) ? Math.round(remainingBytes / currentSpeed) : 0;
        const pct = grandTotalBytes > 0
            ? Math.min(100, Math.round((overallTransferredBytes / grandTotalBytes) * 1000) / 10)
            : 0;

        orderData.progress = {
            percentage: pct,
            transferredBytes: overallTransferredBytes,
            totalBytes: grandTotalBytes,
            speedBytesPerSec: currentSpeed,
            speedFormatted: formatSpeed(currentSpeed),
            etaSeconds,
            currentFile: currentFileName,
            itemIndex,
            itemsTotal: itemsPlan.length
        };

        lastProgressWrite = now;
        persistOrder(false);
    };

    const errors = [];
    try {
        for (let i = 0; i < itemsPlan.length; i++) {
            if (activeTransfer.isCancelled || abortController.signal.aborted) {
                throw new Error('TRANSF_ABORTED');
            }

            const plan = itemsPlan[i];
            const normSrc = path.resolve(plan.src.replace(/\//g, '\\')).toLowerCase();
            const normDest = path.resolve(plan.dest.replace(/\//g, '\\')).toLowerCase();

            if (normSrc === normDest) {
                console.log(`[LOCAL TRANSFER] Origen y destino idénticos, omitiendo copia física: ${plan.src}`);
                overallTransferredBytes += plan.itemBytes;
                updateProgress(true, path.basename(plan.src), i + 1);
                continue;
            }

            if (plan.isDir) {
                ensureDirCached(plan.dest);
            }

            let lastRemoteCancelCheck = 0;
            const checkRemoteCancel = async () => {
                if (activeTransfer.isCancelled || abortController.signal.aborted) {
                    throw new Error('TRANSF_ABORTED');
                }
                const now = Date.now();
                if (now - lastRemoteCancelCheck > 2500) {
                    lastRemoteCancelCheck = now;
                    try {
                        for (const dir of candidateDirs) {
                            const p = path.join(dir, `${orderId}.json`);
                            if (fs.existsSync(p)) {
                                const fresh = fs.readJsonSync(p);
                                if (fresh && fresh.status === 'cancelled') {
                                    activeTransfer.isCancelled = true;
                                    abortController.abort();
                                    throw new Error('TRANSF_ABORTED');
                                }
                            }
                        }
                    } catch (chkErr) {
                        if (chkErr.message === 'TRANSF_ABORTED') throw chkErr;
                    }
                }
            };

            const CONCURRENCY = Math.min(8, Math.max(1, plan.filesList.length));
            let fileIndex = 0;

            const runWorker = async () => {
                while (fileIndex < plan.filesList.length) {
                    if (activeTransfer.isCancelled || abortController.signal.aborted) {
                        throw new Error('TRANSF_ABORTED');
                    }

                    await checkRemoteCancel();

                    const currentIndex = fileIndex++;
                    if (currentIndex >= plan.filesList.length) break;
                    const file = plan.filesList[currentIndex];
                    if (!file) break;

                    const lowerName = path.basename(file.relPath).toLowerCase();
                    if (lowerName === 'thumbs.db' || lowerName === 'desktop.ini' || lowerName === '.ds_store' || lowerName.endsWith('.tmp')) {
                        continue;
                    }

                    const targetFilePath = plan.isDir
                        ? path.join(plan.dest, file.relPath).replace(/\\/g, '/')
                        : plan.dest;

                    activeTransfer.currentDestFile = targetFilePath;

                    // Omitir copia física si el archivo ya existe con idéntico tamaño y mtime similar
                    if (orderData.conflictResolution !== 'overwrite') {
                        try {
                            if (fs.existsSync(targetFilePath)) {
                                const stDest = fs.statSync(targetFilePath);
                                if (stDest.size === file.size && (file.mtimeMs ? Math.abs(stDest.mtimeMs - file.mtimeMs) < 3000 : true)) {
                                    overallTransferredBytes += file.size;
                                    windowBytesTransferred += file.size;
                                    updateProgress(false, path.basename(file.relPath), i + 1);
                                    continue;
                                }
                            }
                        } catch (stErr) {}
                    }

                    try {
                        await streamCopyFile(file.fullPath, targetFilePath, (chunkBytes) => {
                            overallTransferredBytes += chunkBytes;
                            windowBytesTransferred += chunkBytes;
                            updateProgress(false, path.basename(file.relPath), i + 1);
                        }, abortController.signal);
                    } catch (copyErr) {
                        if (copyErr.message === 'TRANSF_ABORTED' || activeTransfer.isCancelled) {
                            throw copyErr;
                        }
                        if (lowerName === 'thumbs.db' || lowerName === 'desktop.ini' || lowerName === '.ds_store') {
                            console.warn(`[LOCAL TRANSFER] Omitiendo archivo de sistema bloqueado: ${file.relPath}`);
                        } else {
                            errors.push({ file: file.relPath, error: copyErr.message });
                            console.error(`[LOCAL TRANSFER] Error copiando ${file.fullPath}:`, copyErr.message);
                        }
                    } finally {
                        activeTransfer.currentDestFile = null;
                    }
                }
            };

            const workers = [];
            for (let w = 0; w < CONCURRENCY; w++) {
                workers.push(runWorker());
            }

            await Promise.all(workers);
        }

        if (activeTransfer.isCancelled || abortController.signal.aborted) {
            throw new Error('TRANSF_ABORTED');
        }

        if (orderData.twoStage && errors.length === 0) {
            if (orderData.twoStageType === 'upload' || !orderData.twoStageType) {
                console.log(`[TWO-STAGE UPLOAD] ✅ Etapa 1/2 (Local -> SMB) completada para ${orderId}. Transfiriendo a Etapa 2/2 (Worker Central -> Drive)...`);
                orderData.currentStage = 2;
                orderData.stageLabel = 'Etapa 2/2: En cola con Worker Central (Subiendo a Drive)...';
                orderData.status = 'pending';
                orderData.targetRole = 'central_worker';
                delete orderData.targetHost;
                delete orderData.worker;
                orderData.stage1CompletedAt = new Date().toISOString();
                orderData.progress = {
                    percentage: 0,
                    speedFormatted: 'En cola central...',
                    transferredBytes: 0,
                    totalBytes: grandTotalBytes,
                    currentFile: 'Esperando turno de worker central'
                };
                activeLocalTransfers.delete(orderId);
                persistOrder(true);
                ensureSyncWorkerRunning();
                return;
            } else if (orderData.twoStageType === 'download') {
                console.log(`[TWO-STAGE DOWNLOAD] ✅ Etapa 2/2 (SMB -> Local) completada para ${orderId}. Archivos ya disponibles en Z: local.`);
                orderData.stageLabel = 'Descarga completada en disco local';
            }
        }

        orderData.status = errors.length === 0 ? 'completed' : (errors.length < itemsPlan.length ? 'completed_with_errors' : 'failed');
        orderData.completedAt = new Date().toISOString();
        orderData.durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        if (orderData.progress) {
            orderData.progress.percentage = 100;
            orderData.progress.transferredBytes = grandTotalBytes;
            orderData.progress.speedFormatted = 'Completado';
            orderData.progress.etaSeconds = 0;
        }
        if (errors.length > 0) orderData.errors = errors;

        persistOrder(true);

        serverDirCache.clear();
        rcloneDirCache.clear();
        if (typeof catalogGenerator.clearMemoryCaches === 'function') {
            catalogGenerator.clearMemoryCaches();
        }

        if (orderData.type === 'server_upload' && typeof catalogGenerator.refreshSubCatalog === 'function') {
            for (const plan of itemsPlan) {
                try {
                    const folder = path.dirname(plan.dest).replace(/\\/g, '/');
                    catalogGenerator.refreshSubCatalog(orderData.project, folder, 'server').catch(() => {});
                } catch (e) {}
            }
        }
    } catch (err) {
        if (err.message === 'TRANSF_ABORTED' || activeTransfer.isCancelled) {
            console.log(`[LOCAL TRANSFER] Orden ${orderId} CANCELADA con éxito. Deteniendo streams y limpiando.`);
            orderData.status = 'cancelled';
            orderData.cancelledAt = new Date().toISOString();
            if (orderData.progress) {
                orderData.progress.speedFormatted = 'Cancelado';
                orderData.progress.etaSeconds = 0;
            }
            if (activeTransfer.currentDestFile) {
                try { if (fs.existsSync(activeTransfer.currentDestFile)) fs.removeSync(activeTransfer.currentDestFile); } catch (e) {}
            }
            persistOrder(true);
            return;
        }

        console.error(`[LOCAL TRANSFER ORDER] Error en ${orderId}:`, err);
        orderData.status = 'failed';
        orderData.error = err.message;
        orderData.completedAt = new Date().toISOString();
        orderData.durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        persistOrder(true);
    } finally {
        activeLocalTransfers.delete(orderId);
    }
}

module.exports = {
    activeLocalTransfers,
    ensureDirCached,
    streamCopyFile,
    runLocalTransferOrder
};
