// ------------------------------------------
// --- PIPETA (MILLER COLUMNS) LOGIC ---
// ------------------------------------------

// State: Store the active path chain for each container
window.pipetaState = {
    'pipeta-project-container': [],
    'pipeta-media-container': []
};

// --- SYNC LAYER OVERLAY STATE ---
window.pipetaSyncLayer = localStorage.getItem('pipeta_sync_layer_mode') || 'off'; // 'off' | 'drive' | 'server'
window.pipetaSyncCatalog = null;
window.pipetaSyncCatalogLookup = {
    byLocalPath: new Map(),
    byParentLocalPath: new Map()
};

function normalizeSyncPath(p) {
    if (!p) return '';
    return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

let _catalogLoadPromise = null;
async function loadActiveProjectSyncCatalog(force = false) {
    const projName = (typeof settings !== 'undefined' && settings.currentProject && settings.currentProject.name) 
        ? settings.currentProject.name 
        : 'surf_love';
    
    if (force || (window.pipetaSyncCatalog && window.pipetaSyncCatalog.project !== projName)) {
        window.pipetaSyncCatalog = null;
        window.pipetaServerCatalog = null;
        window.pipetaSyncCatalogLookup = null;
        window.pipetaServerCatalogLookup = null;
    }

    const mode = window.viewLocationMode || 'local';
    const compMode = window.syncComparisonMode || 'off';

    const needDrive = (mode === 'drive' || compMode === 'drive');
    const needServer = (mode === 'server' || compMode === 'server') && (typeof canUseServerMode === 'function' ? canUseServerMode() : false);

    if (!force) {
        const driveReady = !needDrive || (window.pipetaSyncCatalog && window.pipetaSyncCatalog.project === projName);
        const serverReady = !needServer || (window.pipetaServerCatalog && window.pipetaServerCatalog.project === projName);
        if (driveReady && serverReady) {
            return window.pipetaServerCatalog || window.pipetaSyncCatalog;
        }
    }

    if (_catalogLoadPromise) return _catalogLoadPromise;

    _catalogLoadPromise = (async () => {
        try {
            // 1. Cargar catálogo de Google Drive
            if (needDrive && (!window.pipetaSyncCatalog || window.pipetaSyncCatalog.project !== projName)) {
                let res = await fetch(`/api/sync/catalog/${projName}`).then(r => r.json()).catch(() => null);
                if (res && res.success && res.catalog) {
                    window.pipetaSyncCatalog = res.catalog;
                    indexSyncCatalog(res.catalog);
                    console.log(`[SYNC LAYER] Catálogo Drive cargado para ${projName}: ${res.catalog.stats?.totalFiles || 0} archivos indexados.`);
                }
            }

            // 2. Cargar catálogo de Servidor Central
            if (needServer && (!window.pipetaServerCatalog || window.pipetaServerCatalog.project !== projName)) {
                let sRes = await fetch(`/api/sync/server-catalog/${projName}`).then(r => r.json()).catch(() => null);
                if (sRes && sRes.success && sRes.catalog) {
                    window.pipetaServerCatalog = sRes.catalog;
                    indexServerCatalog(sRes.catalog);
                    console.log(`[SYNC LAYER] Catálogo Servidor cargado para ${projName}: ${sRes.catalog.stats?.totalFiles || 0} archivos indexados.`);
                }
            }

            return window.pipetaServerCatalog || window.pipetaSyncCatalog;
        } catch (e) {
            console.warn("[SYNC LAYER] Error cargando catálogo:", e);
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `❌ Error cargando catálogo para '${projName}': ${e.message}`, 'error');
            }
        } finally {
            _catalogLoadPromise = null;
        }
        return null;
    })();

    return _catalogLoadPromise;
}

function indexSyncCatalog(catalog) {
    const byLocal = new Map();
    const byParent = new Map();

    if (catalog && catalog.flatList) {
        for (const item of catalog.flatList) {
            const normPath = normalizeSyncPath(item.targetLocalPath);
            byLocal.set(normPath, item);

            const parent = normPath.substring(0, normPath.lastIndexOf('/'));
            if (!byParent.has(parent)) {
                byParent.set(parent, []);
            }
            byParent.get(parent).push(item);
        }
    }

    window.pipetaSyncCatalogLookup = {
        byLocalPath: byLocal,
        byParentLocalPath: byParent
    };
}

function indexServerCatalog(catalog) {
    const byLocal = new Map();
    const byServer = new Map();
    const byParent = new Map();

    if (catalog && catalog.flatList) {
        for (const item of catalog.flatList) {
            if (item.targetLocalPath) {
                const normLocal = normalizeSyncPath(item.targetLocalPath);
                byLocal.set(normLocal, item);
            }
            if (item.serverPath) {
                const normServer = normalizeSyncPath(item.serverPath);
                byServer.set(normServer, item);

                const parent = normServer.substring(0, normServer.lastIndexOf('/'));
                if (!byParent.has(parent)) {
                    byParent.set(parent, []);
                }
                byParent.get(parent).push(item);
            }
        }
    }

    window.pipetaServerCatalogLookup = {
        byLocalPath: byLocal,
        byServerPath: byServer,
        byParentServerPath: byParent
    };
}

async function toggleSyncLayer(mode) {
    window.pipetaSyncLayer = mode;
    localStorage.setItem('pipeta_sync_layer_mode', mode);

    if (mode !== 'off') {
        await loadActiveProjectSyncCatalog();
    }

    if (typeof updateHeaderTools === 'function') {
        updateHeaderTools('view-browser');
    }
    if (typeof initPipetaView === 'function') {
        initPipetaView();
    }
}

function showSyncConfirmDialog({
    title = 'Confirmar Transferencia',
    icon = '⚡',
    actionType = 'download', // 'download' | 'upload'
    targetType = 'drive',    // 'drive' | 'server'
    name = '',
    isDir = false,
    isSequence = false,
    size = 0,
    src = '',
    dest = '',
    srcLabel = 'Origen',
    destLabel = 'Destino',
    method = '',
    confirmText = 'Aceptar',
    cancelText = 'Cancelar'
}) {
    return new Promise((resolve) => {
        const existingOverlay = document.getElementById('sync-confirm-overlay');
        if (existingOverlay) existingOverlay.remove();

        const isDownload = actionType === 'download';
        const isDrive = targetType === 'drive';
        const typeLabel = isDir ? 'Carpeta' : (isSequence ? 'Secuencia de Imágenes' : 'Archivo');
        const itemIcon = isDir ? '📁' : (isSequence ? '🎞️' : '📄');

        let sizeStr = '';
        if (size && size > 0) {
            if (size >= 1024 * 1024 * 1024) {
                sizeStr = (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
            } else if (size >= 1024 * 1024) {
                sizeStr = (size / (1024 * 1024)).toFixed(1) + ' MB';
            } else if (size >= 1024) {
                sizeStr = (size / 1024).toFixed(1) + ' KB';
            } else {
                sizeStr = size + ' B';
            }
        }

        const accentColor = isDrive ? '#00e5ff' : '#ab47bc';
        const confirmBtnBg = isDownload
            ? 'linear-gradient(135deg, #0288d1, #00bcd4)'
            : 'linear-gradient(135deg, #2e7d32, #43a047)';
        const confirmBtnShadow = isDownload
            ? 'rgba(0, 188, 212, 0.4)'
            : 'rgba(76, 175, 80, 0.4)';

        const srcIcon = isDownload ? (isDrive ? '☁️' : '🏢') : '💾';
        const destIcon = isDownload ? '💾' : (isDrive ? '☁️' : '🏢');
        const srcColor = isDownload ? (isDrive ? '#00bcd4' : '#ab47bc') : '#4caf50';
        const destColor = isDownload ? '#4caf50' : (isDrive ? '#00bcd4' : '#ab47bc');
        const targetBadge = isDrive ? 'Google Drive' : 'Servidor Central';

        const overlay = document.createElement('div');
        overlay.id = 'sync-confirm-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            z-index: 10500;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const win = document.createElement('div');
        win.id = 'sync-confirm-window';
        win.className = 'validator-window';
        win.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 580px;
            max-width: 92vw;
            background: #0f1217;
            border: 1px solid #232b38;
            border-radius: 8px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 1px rgba(255,255,255,0.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: #eceff4;
            font-family: inherit;
        `;

        win.innerHTML = `
            <!-- HEADER (DRAGGABLE) -->
            <div id="sync-confirm-header" style="background:#161c24; border-bottom:1px solid #232b38; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.15rem;">${icon}</span>
                    <b style="font-size:0.92rem; color:#fff; font-weight:600;">${title}</b>
                </div>
                <button id="sync-confirm-close-btn" class="icon-btn-mini" style="color:#f44336; background:transparent; border:none; cursor:pointer; font-size:1.1rem; line-height:1; padding:2px 6px;" title="Cerrar (Esc)">✕</button>
            </div>

            <!-- SUB-BAR -->
            <div style="background:#11151c; border-bottom:1px solid #232b38; padding:6px 14px; display:flex; justify-content:space-between; align-items:center; font-size:0.76rem; color:#8892b0;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${accentColor};"></span>
                    <span style="color:#d8dee9; font-weight:600;">${targetBadge}</span>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                    <span>⚙️</span>
                    <span>${method}</span>
                </div>
            </div>

            <!-- BODY -->
            <div style="padding:16px; background:#0f1217; display:flex; flex-direction:column; gap:12px;">
                <!-- ITEM CARD -->
                <div style="background:rgba(255,255,255,0.03); border:1px solid #232b38; border-radius:6px; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                        <span style="font-size:1.4rem; flex-shrink:0;">${itemIcon}</span>
                        <div style="min-width:0; flex:1;">
                            <div style="font-weight:600; color:#fff; font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${name}">${name}</div>
                            <div style="font-size:0.75rem; color:#8892b0; margin-top:2px;">
                                ${typeLabel}${sizeStr ? ` • <span style="color:#d8dee9; font-weight:500;">${sizeStr}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    ${sizeStr ? `<span style="background:rgba(0,229,255,0.1); border:1px solid rgba(0,229,255,0.25); color:#00e5ff; border-radius:4px; padding:2px 8px; font-size:0.75rem; font-weight:bold; flex-shrink:0;">${sizeStr}</span>` : ''}
                </div>

                ${isDir ? `
                <div style="background:rgba(255,152,0,0.08); border:1px solid rgba(255,152,0,0.25); border-radius:5px; padding:8px 12px; font-size:0.75rem; color:#ffb74d; display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1rem;">📂</span>
                    <span><b>Transferencia de Carpeta Completa:</b> Se procesarán todos los archivos y subcarpetas contenidos en este nivel.</span>
                </div>
                ` : ''}

                <!-- ORIGEN -->
                <div>
                    <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:${srcColor}; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                        <span>${srcIcon}</span> <span>Origen (${srcLabel})</span>
                    </div>
                    <div style="background:#141a22; border:1px solid #232b38; border-radius:5px; padding:7px 10px; font-family:Consolas, Monaco, monospace; font-size:0.77rem; color:#d8dee9; word-break:break-all; user-select:all; line-height:1.4; max-height:65px; overflow-y:auto;" title="Clic para seleccionar">${src}</div>
                </div>

                <!-- DESTINO -->
                <div>
                    <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:${destColor}; margin-bottom:4px; display:flex; align-items:center; gap:5px;">
                        <span>${destIcon}</span> <span>Destino (${destLabel})</span>
                    </div>
                    <div style="background:#141a22; border:1px solid #232b38; border-radius:5px; padding:7px 10px; font-family:Consolas, Monaco, monospace; font-size:0.77rem; color:#d8dee9; word-break:break-all; user-select:all; line-height:1.4; max-height:65px; overflow-y:auto;" title="Clic para seleccionar">${dest}</div>
                </div>
            </div>

            <!-- FOOTER -->
            <div style="background:#11151c; border-top:1px solid #232b38; padding:12px 16px; display:flex; justify-content:flex-end; align-items:center; gap:10px;">
                <button id="sync-confirm-cancel-btn" style="background:#1a202c; border:1px solid #2d3748; color:#aaa; border-radius:5px; padding:7px 16px; font-size:0.82rem; cursor:pointer; font-weight:500; transition:all 0.15s;" onmouseover="this.style.color='#fff'; this.style.borderColor='#4a5568'" onmouseout="this.style.color='#aaa'; this.style.borderColor='#2d3748'">
                    ${cancelText}
                </button>
                <button id="sync-confirm-ok-btn" style="background:${confirmBtnBg}; color:#fff; border:none; border-radius:5px; padding:7px 20px; font-size:0.82rem; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 10px ${confirmBtnShadow}; transition:all 0.15s;">
                    ${confirmText}
                </button>
            </div>
        `;

        overlay.appendChild(win);
        document.body.appendChild(overlay);

        // DRAG FUNCTIONALITY
        const header = win.querySelector('#sync-confirm-header');
        header.onmousedown = (e) => {
            if (e.target.closest('button')) return;
            const rect = win.getBoundingClientRect();
            const shiftX = e.clientX - rect.left;
            const shiftY = e.clientY - rect.top;

            win.style.transform = 'none';
            win.style.left = rect.left + 'px';
            win.style.top = rect.top + 'px';

            function onMouseMove(moveEvent) {
                win.style.left = (moveEvent.clientX - shiftX) + 'px';
                win.style.top = (moveEvent.clientY - shiftY) + 'px';
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        function cleanup(result) {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            resolve(result);
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                cleanup(true);
            }
        }

        document.addEventListener('keydown', onKeyDown);

        win.querySelector('#sync-confirm-close-btn').onclick = () => cleanup(false);
        win.querySelector('#sync-confirm-cancel-btn').onclick = () => cleanup(false);
        win.querySelector('#sync-confirm-ok-btn').onclick = () => cleanup(true);

        overlay.onclick = (e) => {
            if (e.target === overlay) cleanup(false);
        };

        setTimeout(() => {
            const okBtn = win.querySelector('#sync-confirm-ok-btn');
            if (okBtn) okBtn.focus();
        }, 50);
    });
}

window.showSyncConfirmDialog = showSyncConfirmDialog;

function buildItemsForSyncOrder(item, operationType, targetType) {
    const isDir = !!item.isDirectory || !!item.isDir;
    if (item.isSequence && Array.isArray(item.missingFrames) && item.missingFrames.length > 0 && operationType === 'download') {
        return item.missingFrames.map(f => ({
            name: f.name,
            isDir: false,
            relativePath: f.relativePath || f.name,
            serverPath: f.serverPath || f.path,
            onlinePath: f.onlinePath || f.path,
            localPath: f.path || f.targetLocalPath,
            targetLocalPath: f.targetLocalPath || f.path,
            targetServerPath: f.serverPath || f.path,
            size: f.size || 0
        }));
    }
    if (item.isSequence && Array.isArray(item.items) && item.items.length > 0) {
        return item.items.map(f => ({
            name: f.name,
            isDir: false,
            relativePath: f.relativePath || f.name,
            serverPath: f.serverPath || f.path,
            onlinePath: f.onlinePath || f.path,
            localPath: f.path || f.targetLocalPath,
            targetLocalPath: f.targetLocalPath || f.path,
            targetServerPath: f.serverPath || f.path,
            size: f.size || 0
        }));
    }
    const src = targetType === 'server'
        ? (operationType === 'download' ? (item.serverPath || item.onlinePath || item.path) : item.path)
        : (operationType === 'download' ? (item.onlinePath || item.path) : item.path);
    const dest = targetType === 'server'
        ? (operationType === 'download' ? (item.targetLocalPath || item.path) : (item.serverPath || item.path))
        : (operationType === 'download' ? (item.targetLocalPath || item.path) : (item.onlinePath || item.path));

    return [{
        name: item.name,
        isDir: isDir,
        relativePath: item.relativePath || item.name,
        serverPath: targetType === 'server' ? (operationType === 'download' ? src : dest) : undefined,
        onlinePath: targetType === 'drive' ? (operationType === 'download' ? src : dest) : undefined,
        localPath: operationType === 'upload' ? src : undefined,
        targetLocalPath: operationType === 'download' ? dest : undefined,
        targetServerPath: (operationType === 'upload' && targetType === 'server') ? dest : undefined,
        size: item.size || 0
    }];
}

async function requestDownloadGhostItem(item, e, forcedTargetType) {
    if (e) e.stopPropagation();
    const isDir = !!item.isDirectory || !!item.isDir;
    const typeLabel = isDir ? 'Carpeta' : (item.isSequence ? 'Secuencia' : 'Archivo');
    const targetType = forcedTargetType || (window.syncComparisonMode === 'server' || window.viewLocationMode === 'server' ? 'server' : 'drive');
    const proj = (typeof settings !== 'undefined' && settings?.currentProject?.name) ? settings.currentProject.name : 'surf_love';

    const transferItems = buildItemsForSyncOrder(item, 'download', targetType);
    const totalBytes = transferItems.reduce((acc, it) => acc + (it.size || 0), 0) || item.size || 0;
    const isPartial = item.isSequence && Array.isArray(item.missingFrames) && item.missingFrames.length > 0;
    const displaySeqName = isPartial ? `${item.name} (${item.missingFrames.length} frames faltantes)` : item.name;

    // 1. DESCARGA DESDE SERVER CENTRAL
    if (targetType === 'server') {
        const src = item.serverPath || item.onlinePath || item.path;
        const dest = item.targetLocalPath || item.path;

        const confirmed = await showSyncConfirmDialog({
            title: isPartial ? 'Descargar Frames Faltantes (Server)' : 'Descargar desde Servidor Central',
            icon: '📥',
            actionType: 'download',
            targetType: 'server',
            name: displaySeqName,
            isDir: isDir,
            isSequence: !!item.isSequence,
            size: totalBytes,
            src: src,
            dest: dest,
            srcLabel: 'Server Central',
            destLabel: 'Disco Local Z:',
            method: 'Copia directa de red LAN',
            confirmText: '⬇️ Queue Download'
        });
        if (!confirmed) return;

        try {
            const res = await fetch('/api/sync/request-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: proj,
                    transferType: 'server',
                    user: (typeof getPipetaCurrentUser === 'function' ? getPipetaCurrentUser() : 'artista'),
                    items: transferItems
                })
            });
            const data = await res.json();
            if (data.success) {
                if (e && e.target) {
                    e.target.innerHTML = '⏳ Descargando...';
                    e.target.style.opacity = '0.6';
                    e.target.style.pointerEvents = 'none';
                }
                const toastMsg = `Descarga desde Server iniciada para: ${displaySeqName}`;
                if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                    settings.showToast(toastMsg, 'info', 4, `Destino: ${dest}`);
                }
                if (window.syncQueueUI) {
                    window.syncQueueUI.fetchStatus();
                    window.syncQueueUI.open();
                }
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `[DESCARGA SERVER] Iniciada transferencia: ${displaySeqName} (${transferItems.length} ítems) -> ${dest}`, 'pending');
                }
            } else {
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `❌ Error al iniciar descarga de ${item.name}: ${data.error}`, 'error');
                }
                alert(`❌ Error al iniciar descarga: ${data.error}`);
            }
        } catch(err) {
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `❌ Error de red con server LAN: ${err.message}`, 'error');
            }
            alert(`❌ Error de conexión: ${err.message}`);
        }
        return;
    }

    // 2. DESCARGA DESDE GOOGLE DRIVE (Vía Worker / Rclone)
    const src = item.onlinePath || `Google Drive (${proj})`;
    const dest = item.targetLocalPath || item.path;

    const confirmed = await showSyncConfirmDialog({
        title: isPartial ? 'Descargar Frames Faltantes (Drive)' : 'Descargar desde Google Drive',
        icon: '☁️',
        actionType: 'download',
        targetType: 'drive',
        name: displaySeqName,
        isDir: isDir,
        isSequence: !!item.isSequence,
        size: totalBytes,
        src: src,
        dest: dest,
        srcLabel: 'Google Drive',
        destLabel: 'Disco Local Z:',
        method: 'Orden de descarga vía Worker / Rclone',
        confirmText: '⬇️ Queue Download'
    });
    if (!confirmed) return;

    try {
        const res = await fetch('/api/sync/request-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: proj,
                user: (typeof getPipetaCurrentUser === 'function' ? getPipetaCurrentUser() : 'artista'),
                items: transferItems
            })
        });
        const data = await res.json();
        if (data.success) {
            if (e && e.target) {
                e.target.innerHTML = '⏳ Descargando...';
                e.target.style.opacity = '0.6';
                e.target.style.pointerEvents = 'none';
            }
            const toastMsg = `Orden de descarga #${data.orderId.slice(-6)} encolada para: ${item.name}`;
            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast(toastMsg, 'success', 4, `Destino: ${dest}`);
            } else {
                alert(`✅ ${toastMsg}`);
            }
            if (window.syncQueueUI) {
                window.syncQueueUI.fetchStatus();
                window.syncQueueUI.open();
            }
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `[DESCARGA DRIVE] Orden #${data.orderId.slice(-6)} encolada para Worker: ${item.name} (${typeLabel}) -> ${dest}`, 'pending');
            }
        } else {
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `❌ Error al encolar descarga de ${item.name}: ${data.error}`, 'error');
            }
            alert(`❌ Error al encolar descarga: ${data.error}`);
        }
    } catch(err) {
        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `❌ Fallo de conexión al solicitar descarga: ${err.message}`, 'error');
        }
        alert(`❌ Error de conexión: ${err.message}`);
    }
}

async function requestUploadLocalItem(item, e, forcedTargetType) {
    if (e) e.stopPropagation();
    const isDir = !!item.isDirectory || !!item.isDir;
    const typeLabel = isDir ? 'Carpeta' : (item.isSequence ? 'Secuencia' : 'Archivo');
    const targetType = forcedTargetType || (window.syncComparisonMode === 'server' || window.viewLocationMode === 'server' ? 'server' : 'drive');
    const proj = (typeof settings !== 'undefined' && settings?.currentProject?.name) ? settings.currentProject.name : 'surf_love';

    const transferItems = buildItemsForSyncOrder(item, 'upload', targetType);
    const totalBytes = transferItems.reduce((acc, it) => acc + (it.size || 0), 0) || item.size || 0;

    // 1. SUBIDA A SERVER CENTRAL
    if (targetType === 'server') {
        const src = item.path;
        const dest = item.serverPath || item.path;

        const confirmed = await showSyncConfirmDialog({
            title: 'Subir a Servidor Central',
            icon: '⬆️',
            actionType: 'upload',
            targetType: 'server',
            name: item.name,
            isDir: isDir,
            isSequence: !!item.isSequence,
            size: totalBytes,
            src: src,
            dest: dest,
            srcLabel: 'Disco Local Z:',
            destLabel: 'Server Central',
            method: 'Copia directa de red LAN',
            confirmText: '⬆️ Queue Upload'
        });
        if (!confirmed) return;

        try {
            const res = await fetch('/api/sync/request-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: proj,
                    transferType: 'server',
                    user: (typeof getPipetaCurrentUser === 'function' ? getPipetaCurrentUser() : 'artista'),
                    items: transferItems
                })
            });
            const data = await res.json();
            if (data.success) {
                if (e && e.target) {
                    e.target.innerHTML = '⏳ Subiendo...';
                    e.target.style.opacity = '0.6';
                    e.target.style.pointerEvents = 'none';
                }
                const toastMsg = `Subida a Server Central iniciada para: ${item.name}`;
                if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                    settings.showToast(toastMsg, 'info', 4, `Destino: ${dest}`);
                }
                if (window.syncQueueUI) {
                    window.syncQueueUI.fetchStatus();
                    window.syncQueueUI.open();
                }
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `[SUBIDA SERVER] Iniciada transferencia: ${item.name} (${transferItems.length} ítems) -> ${dest}`, 'pending');
                }
            } else {
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `❌ Error al iniciar subida de ${item.name}: ${data.error}`, 'error');
                }
                alert(`❌ Error al iniciar subida al server: ${data.error}`);
            }
        } catch(err) {
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `❌ Error de red con server LAN: ${err.message}`, 'error');
            }
            alert(`❌ Error de conexión: ${err.message}`);
        }
        return;
    }

    // 2. SUBIDA A GOOGLE DRIVE (Vía Worker / Rclone)
    const src = item.path;
    const dest = item.onlinePath || `Google Drive (${proj})`;

    const confirmed = await showSyncConfirmDialog({
        title: 'Subir a Google Drive',
        icon: '☁️',
        actionType: 'upload',
        targetType: 'drive',
        name: item.name,
        isDir: isDir,
        isSequence: !!item.isSequence,
        size: totalBytes,
        src: src,
        dest: dest,
        srcLabel: 'Disco Local Z:',
        destLabel: 'Google Drive',
        method: 'Orden de subida vía Worker / Rclone',
        confirmText: '⬆️ Queue Upload'
    });
    if (!confirmed) return;

    try {
        const res = await fetch('/api/sync/request-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: proj,
                user: (typeof getPipetaCurrentUser === 'function' ? getPipetaCurrentUser() : 'artista'),
                items: transferItems
            })
        });
        const data = await res.json();
        if (data.success) {
            // Inyección optimista inmediata en el catálogo en memoria (< 1ms)
            if (window.pipetaSyncCatalogLookup) {
                const normLocal = normalizeSyncPath(item.path);
                window.pipetaSyncCatalogLookup.byLocalPath.set(normLocal, {
                    name: item.name,
                    targetLocalPath: item.path,
                    onlinePath: item.onlinePath || `Google Drive (${proj})`,
                    isDir: isDir
                });
                const parent = normLocal.substring(0, normLocal.lastIndexOf('/'));
                if (window.pipetaSyncCatalogLookup.byParentLocalPath.has(parent)) {
                    const list = window.pipetaSyncCatalogLookup.byParentLocalPath.get(parent);
                    if (!list.some(x => (x.name || '').toLowerCase() === item.name.toLowerCase())) {
                        list.push({
                            name: item.name,
                            isDir: isDir,
                            targetLocalPath: item.path,
                            onlinePath: item.onlinePath || `Google Drive (${proj})`
                        });
                    }
                }
            }

            if (e && e.target) {
                e.target.innerHTML = '⏳ Subiendo...';
                e.target.style.opacity = '0.6';
                e.target.style.pointerEvents = 'none';
            }

            const toastMsg = `Orden de subida #${data.orderId.slice(-6)} encolada para: ${item.name}`;
            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast(toastMsg, 'success', 4, `Origen: ${item.path}`);
            } else {
                alert(`✅ ${toastMsg}`);
            }
            if (window.syncQueueUI) {
                window.syncQueueUI.fetchStatus();
                window.syncQueueUI.open();
            }
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `[SUBIDA DRIVE] Orden #${data.orderId.slice(-6)} encolada para Worker: ${item.name} desde ${item.path}`, 'pending');
            }
        } else {
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `❌ Error al encolar subida de ${item.name}: ${data.error}`, 'error');
            }
            alert(`❌ Error al encolar subida: ${data.error}`);
        }
    } catch(err) {
        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `❌ Fallo de conexión al solicitar subida: ${err.message}`, 'error');
        }
        alert(`❌ Error de conexión: ${err.message}`);
    }
}

async function initPipetaView() {
    document.body.classList.add('pipeta-fast-rendering');
    if (typeof showExplorerLoading === 'function') {
        showExplorerLoading(null, 'Actualizando vista...');
    }

    try {
        const roots = getCurrentRoots();
        // Set Header Labels
        const workLabel = document.getElementById('label-work-path-pipeta');
        const mediaLabel = document.getElementById('label-media-path-pipeta');
        if (workLabel) workLabel.innerText = roots.work;
        if (mediaLabel) mediaLabel.innerText = roots.media;

        // Filter Logic
        const filter = window.pipetaUseFilter ? window.pipetaFilterList : null;

        // Cargar catálogo de sincronización en segundo plano sin bloquear renderizado
        if (typeof loadActiveProjectSyncCatalog === 'function' && !window.pipetaSyncCatalog && !window.pipetaServerCatalog) {
            loadActiveProjectSyncCatalog().catch(() => {});
        }

        await Promise.all([
            initPipetaPane(roots.work, 'pipeta-project-container', filter),
            initPipetaPane(roots.media, 'pipeta-media-container', null)
        ]);
    } finally {
        if (typeof hideExplorerLoading === 'function') {
            hideExplorerLoading();
        }
        setTimeout(() => {
            document.body.classList.remove('pipeta-fast-rendering');
        }, 50);
    }
}

function togglePipetaFilter() {
    window.pipetaUseFilter = !window.pipetaUseFilter;
    updateHeaderTools('view-browser'); // Refresh toolbar buttons
    refreshCurrentView(); // Re-render whatever view is active
}

async function initPipetaPane(rootPath, containerId, filterList) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Save current state BEFORE clearing
    const savedChain = window.pipetaState[containerId] || [];

    container.innerHTML = '<div style="color:#666; padding:20px;">Cargando...</div>';

    const data = await fetchDir(rootPath);
    container.innerHTML = "";

    if (!data.error && data.items) {
        await renderPipetaColumn(container, data.items, 0, containerId, rootPath);

        // Restore from saved chain
        if (savedChain.length > 0) {
            await restorePipetaFromChain(container, savedChain, containerId);
        }
    } else {
        container.innerHTML = `<div style="color:red; padding:20px;">Error: ${data.error}</div>`;
    }
}

// Simple restoration: iterate through saved path chain and click each
async function restorePipetaFromChain(container, chain, containerId) {
    const clean = (p) => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
    const getRel = (typeof window.getExplorerRelativePath === 'function')
        ? window.getExplorerRelativePath
        : (p) => clean(p);

    for (let depth = 0; depth < chain.length; depth++) {
        const col = container.children[depth];
        if (!col) break;

        const targetPath = chain[depth];
        const normTarget = clean(targetPath);
        const relTarget = getRel(targetPath);
        const blocks = Array.from(col.children);

        let foundBlock = null;
        for (const block of blocks) {
            const itemPath = block.getAttribute('data-path');
            if (itemPath) {
                const normItem = clean(itemPath);
                const relItem = getRel(itemPath);
                if (normItem === normTarget || (relTarget && relItem === relTarget)) {
                    foundBlock = block;
                    break;
                }
            }
        }

        if (foundBlock) {
            foundBlock.classList.add('active');
            const actualPath = foundBlock.getAttribute('data-path') || targetPath;

            // If this is a directory and not the last item, load next column
            if (foundBlock.getAttribute('data-isdir') === 'true') {
                await loadNextPipetaColumn(container, actualPath, depth + 1, containerId);
            }

            // Restore selection visual for final item
            if (depth === chain.length - 1 && window.selectedPaths.has(chain[depth])) {
                foundBlock.classList.add('selected');
            }
        } else {
            // Path no longer exists, stop restoration
            break;
        }
    }
    updatePipetaBreadcrumbs(containerId);
}

async function renderPipetaColumn(container, items, colIndex, containerId, parentPath = '') {
    while (container.children.length > colIndex) {
        container.removeChild(container.lastChild);
    }

    const colDiv = document.createElement('div');
    colDiv.className = 'miller-column';

    const locMode = window.viewLocationMode || 'local';
    const compMode = window.syncComparisonMode || 'off';
    const syncActive = (locMode === 'local' && compMode !== 'off');
    const syncMode = compMode;
    const normParent = normalizeSyncPath(parentPath);

    let remoteChildren = [];
    const remoteChildrenByName = new Map();

    if (syncActive) {
        if (syncMode === 'drive') {
            try {
                const dData = await fetchDir(parentPath, { localSource: 'drive_catalog' });
                if (dData && dData.items && !dData.error && dData.items.length > 0) {
                    remoteChildren = dData.items.map(d => ({
                        name: d.name,
                        isDir: !!(d.isDirectory || d.isDir),
                        onlinePath: d.onlinePath || d.path,
                        targetLocalPath: d.targetLocalPath || (parentPath ? parentPath.replace(/\/+$/, '') + '/' + d.name : d.path),
                        size: d.size || 0
                    }));
                }
            } catch (e) {}

            if (remoteChildren.length === 0) {
                remoteChildren = window.pipetaSyncCatalogLookup?.byParentLocalPath?.get(normParent) || [];
            }
        } else if (syncMode === 'server' && parentPath) {
            // Primero intentar desde el catálogo de servidor ya indexado en memoria (0 ms)
            const memServerItems = window.pipetaServerCatalogLookup?.byParentServerPath?.get(normParent) ||
                                   window.pipetaServerCatalogLookup?.byParentLocalPath?.get(normParent);
            if (memServerItems && memServerItems.length > 0) {
                remoteChildren = memServerItems.map(s => ({
                    name: s.name,
                    isDir: !!s.isDir,
                    onlinePath: s.serverPath || s.path,
                    serverPath: s.serverPath || s.path,
                    targetLocalPath: parentPath.replace(/\/+$/, '') + '/' + s.name,
                    size: s.size || 0
                }));
            } else {
                try {
                    const sData = await fetchDir(parentPath, { localSource: 'server_catalog' });
                    if (sData && sData.items) {
                        remoteChildren = sData.items.map(s => ({
                            name: s.name,
                            isDir: s.isDirectory,
                            onlinePath: s.path,
                            serverPath: s.path,
                            targetLocalPath: parentPath.replace(/\/+$/, '') + '/' + s.name,
                            size: s.size || 0
                        }));
                    }
                } catch(e) {
                    console.warn("[SYNC SERVER] Error leyendo server folder:", e);
                }
            }
        }

        for (const rItem of remoteChildren) {
            remoteChildrenByName.set(rItem.name.toLowerCase(), rItem);
        }
    }

    const allLocalNames = new Set((items || []).map(i => (i.name || '').toLowerCase()));

    const filteredItems = (typeof window.filterExplorerItems === 'function')
        ? window.filterExplorerItems(items, containerId, parentPath, items)
        : items;

    const finalItems = (typeof collapseImageSequences === 'function') ? collapseImageSequences(filteredItems) : filteredItems;
    const finalRemoteChildren = (typeof collapseImageSequences === 'function') ? collapseImageSequences(remoteChildren) : remoteChildren;

    const filteredRemoteChildren = (typeof window.filterExplorerItems === 'function')
        ? window.filterExplorerItems(finalRemoteChildren, containerId, parentPath, items)
        : finalRemoteChildren;

    const renderedNames = new Set();

    // 1. Items locales existentes
    finalItems.forEach(item => {
        renderedNames.add(item.name.toLowerCase());
        const block = document.createElement('div');
        block.className = 'pipeta-block';

        const nameSpan = document.createElement('span');
        nameSpan.innerText = (item.isSequence ? '🎞️ ' : '') + item.name;
        nameSpan.style.overflow = 'hidden';
        nameSpan.style.textOverflow = 'ellipsis';
        nameSpan.style.whiteSpace = 'nowrap';
        nameSpan.style.flex = '1';
        block.appendChild(nameSpan);

        if (!item.isDirectory) {
            block.style.borderColor = '#333';
            block.style.color = '#777';
        }

        block._itemData = item;
        block.setAttribute('data-path', item.path);
        block.setAttribute('data-isdir', item.isDirectory);

        // Sync Initial State
        if (window.selectedPaths.has(item.path)) {
            block.classList.add('selected');
        }

        // Capa de Sincronización
        if (syncActive) {
            const inRemote = remoteChildrenByName.has(item.name.toLowerCase());
            if (inRemote) {
                block.classList.add('sync-matched');
                const okBadge = document.createElement('span');
                okBadge.className = 'sync-badge-ok';
                okBadge.innerText = '✓';
                okBadge.title = syncMode === 'server' ? '✓ Idéntico en Server Central (S:)' : '✓ Sincronizado con Google Drive';
                block.appendChild(okBadge);
            } else {
                block.classList.add('sync-pending-upload');
                const upBtn = document.createElement('span');
                upBtn.className = 'sync-badge-action sync-badge-upload';
                upBtn.innerHTML = syncMode === 'server' ? '⬆️ Subir a Server' : '⬆️ Subir a Drive';
                upBtn.title = syncMode === 'server' ? 'Copiar a Servidor Central Real (S:)' : 'Subir a Google Drive';
                upBtn.onclick = (e) => requestUploadLocalItem(item, e, syncMode);
                block.appendChild(upBtn);
            }
        }

        block.onclick = (e) => {
            e.stopPropagation();

            // Interaction Logic
            if (e.shiftKey || e.ctrlKey) {
                SelectionManager.toggle(item.path, block);
            } else {
                SelectionManager.clear();
                SelectionManager.add(item.path, block);
            }

            Array.from(colDiv.children).forEach(c => c.classList.remove('active'));
            block.classList.add('active');

            // UPDATE STATE: Store the path chain up to this point
            const chain = [];
            for (let i = 0; i <= colIndex; i++) {
                const col = container.children[i];
                if (col) {
                    const activeBlock = col.querySelector('.pipeta-block.active');
                    if (activeBlock) {
                        chain.push(activeBlock.getAttribute('data-path'));
                    }
                }
            }
            if (chain.length === colIndex) {
                chain.push(item.path);
            } else {
                chain[colIndex] = item.path;
            }
            window.pipetaState[containerId] = chain;

            if (item.isDirectory) {
                loadNextPipetaColumn(container, item.path, colIndex + 1, containerId);
            } else {
                window.pipetaState[containerId] = chain.slice(0, colIndex + 1);
                while (container.children.length > colIndex + 1) {
                    container.removeChild(container.lastChild);
                }
            }

            updateDesignContext();
            updatePipetaBreadcrumbs(containerId);

            if (isMirrorMode && !isMirroringInProgress) {
                triggerMirrorSelection(containerId);
            }
        };

        colDiv.appendChild(block);
    });

    // 2. Elementos Fantasma (Están en catálogo/server pero FALTAN en local)
    if (syncActive && filteredRemoteChildren.length > 0) {
        filteredRemoteChildren.forEach(catItem => {
            if (!allLocalNames.has((catItem.name || '').toLowerCase())) {
                const ghostBlock = document.createElement('div');
                ghostBlock.className = 'pipeta-block sync-ghost';
                ghostBlock.setAttribute('data-path', catItem.targetLocalPath);
                ghostBlock.setAttribute('data-isdir', catItem.isDir);
                const sourceLabel = syncMode === 'server' ? 'Server Central' : 'Google Drive';
                ghostBlock.title = `Disponible en ${sourceLabel}: ${catItem.onlinePath}\nDestino Local: ${catItem.targetLocalPath}`;

                const ghostNameSpan = document.createElement('span');
                ghostNameSpan.innerText = (catItem.isDir ? '📁 ' : (catItem.isSequence ? '🎞️ ' : '📄 ')) + catItem.name;
                ghostNameSpan.style.overflow = 'hidden';
                ghostNameSpan.style.textOverflow = 'ellipsis';
                ghostNameSpan.style.whiteSpace = 'nowrap';
                ghostNameSpan.style.flex = '1';
                ghostBlock.appendChild(ghostNameSpan);

                const downBtn = document.createElement('span');
                downBtn.className = 'sync-badge-action sync-badge-download';
                downBtn.innerHTML = syncMode === 'server' ? '⬇️ Bajar de Server' : '⬇️ Bajar de Drive';
                downBtn.title = `Disponible en ${sourceLabel} — Clic para descargar a tu Z: local`;
                downBtn.onclick = (e) => requestDownloadGhostItem(catItem, e, syncMode);
                ghostBlock.appendChild(downBtn);

                ghostBlock.onclick = async (e) => {
                    e.stopPropagation();
                    Array.from(colDiv.children).forEach(c => c.classList.remove('active'));
                    ghostBlock.classList.add('active');

                    if (catItem.isDir) {
                        await loadNextPipetaColumn(container, catItem.targetLocalPath, colIndex + 1, containerId);
                    } else {
                        requestDownloadGhostItem(catItem, e, syncMode);
                    }
                };

                colDiv.appendChild(ghostBlock);
            }
        });
    }

    if (colDiv.children.length === 0) {
        const emptyText = window.explorerOnlyMyTasks
            ? '🔒 Sin tareas asignadas aquí'
            : '(Carpeta vacía)';
        colDiv.innerHTML = `<div style="padding:15px; color:#666; font-size:0.8rem; font-style:italic; text-align:center;">${emptyText}</div>`;
    }

    container.appendChild(colDiv);
    container.scrollLeft = container.scrollWidth;
}

async function loadNextPipetaColumn(container, path, colIndex, containerId) {
    const data = await fetchDir(path);
    if (!data.error && data.items) {
        await renderPipetaColumn(container, data.items, colIndex, containerId, path);
    } else {
        // En caso de carpeta fantasma (que aún no existe localmente), renderizar columna vacía con items del catálogo
        await renderPipetaColumn(container, [], colIndex, containerId, path);
    }
}

async function jumpToPipetaDepth(containerId, depth) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const chain = window.pipetaState[containerId] || [];
    if (depth >= chain.length) return;

    window.pipetaState[containerId] = chain.slice(0, depth + 1);

    while (container.children.length > depth + 1) {
        container.removeChild(container.lastChild);
    }

    const currentCol = container.children[depth];
    if (currentCol) {
        const targetPath = chain[depth];
        const clean = (p) => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
        const normTarget = clean(targetPath);

        Array.from(currentCol.children).forEach(block => {
            const itemPath = block.getAttribute('data-path');
            if (itemPath && clean(itemPath) === normTarget) {
                block.classList.add('active');
            } else {
                block.classList.remove('active');
            }
        });
    }

    updatePipetaBreadcrumbs(containerId);
}

function updatePipetaBreadcrumbs(containerId) {
    const breadcrumbsId = containerId === 'pipeta-project-container' 
        ? 'pipeta-breadcrumbs-work' 
        : 'pipeta-breadcrumbs-media';

    const bar = document.getElementById(breadcrumbsId);
    if (!bar) return;

    const chain = window.pipetaState[containerId] || [];
    if (chain.length === 0) {
        bar.innerHTML = '<span style="color:#555;">(Raíz)</span>';
        return;
    }

    bar.innerHTML = chain.map((p, idx) => {
        const name = p.replace(/\\/g, '/').split('/').filter(Boolean).pop() || p;
        const isLast = idx === chain.length - 1;
        return `
            <span class="crumb-item ${isLast ? 'active' : ''}" 
                  onclick="jumpToPipetaDepth('${containerId}', ${idx})" 
                  title="${p}">
                ${name}
            </span>
            ${!isLast ? '<span class="crumb-sep">›</span>' : ''}
        `;
    }).join('');
}
