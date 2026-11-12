// ------------------------------------------
// --- SYNC LAYER OVERLAY & GHOST ENGINE ---
// ------------------------------------------

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
const _autoInitCatalogTried = new Set();
window.isSyncCatalogLoading = false;
async function loadActiveProjectSyncCatalog(force = false) {
    const projName = (typeof settings !== 'undefined' && settings.currentProject && settings.currentProject.name)
        ? settings.currentProject.name
        : 'surf_love';

    if (typeof window.isProjectAllowedForUser === 'function' && !window.isProjectAllowedForUser(projName)) {
        console.warn(`[SYNC LAYER] 🔒 Proyecto '${projName}' no asignado al usuario actual. Omitiendo descarga e indexacion de catalogo.`);
        return null;
    }

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
        window.isSyncCatalogLoading = true;
        try {
            // 1. Cargar catálogo de Google Drive
            if (needDrive && (!window.pipetaSyncCatalog || window.pipetaSyncCatalog.project !== projName)) {
                let res = await fetch(`/api/sync/catalog/${projName}`).then(r => r.json()).catch(() => null);
                if ((!res || !res.success || !res.catalog) && !_autoInitCatalogTried.has(projName)) {
                    _autoInitCatalogTried.add(projName);
                    console.log(`[SYNC LAYER] Inicializando catálogo Drive en segundo plano para ${projName}...`);
                    fetch('/api/sync/catalog/init-project', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectName: projName })
                    }).then(r => r.json()).then(async (initRes) => {
                        if (initRes && initRes.success && initRes.hasDriveManifest) {
                            await loadActiveProjectSyncCatalog(true);
                            if (typeof refreshCurrentView === 'function') refreshCurrentView();
                        }
                    }).catch(() => {});
                } else if (res && res.success && res.catalog) {
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
            window.isSyncCatalogLoading = false;
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
    if (typeof initBrowser === 'function') {
        await initBrowser();
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

function showSyncUploadConflictDialog(conflicts = []) {
    return new Promise((resolve) => {
        const existing = document.getElementById('sync-upload-conflict-overlay');
        if (existing) existing.remove();

        function formatBytes(bytes) {
            if (!bytes || bytes <= 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0) + ' ' + units[i];
        }

        const overlay = document.createElement('div');
        overlay.id = 'sync-upload-conflict-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.65);
            backdrop-filter: blur(4px);
            z-index: 10600;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const win = document.createElement('div');
        win.id = 'sync-upload-conflict-window';
        win.className = 'validator-window';
        win.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 620px;
            max-width: 94vw;
            background: #0f1217;
            border: 1px solid #ff9800;
            border-radius: 8px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 15px rgba(255,152,0,0.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: #eceff4;
            font-family: inherit;
        `;

        const itemsListHtml = conflicts.map(c => {
            let badgeHtml = '';
            if (c.type === 'smb_newer') {
                badgeHtml = '<span style="background:rgba(244,67,54,0.18); color:#ff5252; border:1px solid #f44336; border-radius:3px; padding:2px 6px; font-size:0.7rem; font-weight:bold;">🔴 Servidor más nuevo</span>';
            } else if (c.type === 'local_newer') {
                badgeHtml = '<span style="background:rgba(255,152,0,0.18); color:#ffb74d; border:1px solid #ff9800; border-radius:3px; padding:2px 6px; font-size:0.7rem; font-weight:bold;">🟡 Local más nuevo</span>';
            } else {
                badgeHtml = '<span style="background:rgba(255,193,7,0.18); color:#ffe082; border:1px solid #ffc107; border-radius:3px; padding:2px 6px; font-size:0.7rem; font-weight:bold;">🟠 Tamaño diferente</span>';
            }

            const localDate = c.localMtime ? new Date(c.localMtime).toLocaleString() : '—';
            const smbDate = c.smbMtime ? new Date(c.smbMtime).toLocaleString() : '—';

            return `
                <div style="background:#131720; border:1px solid #232b38; border-radius:5px; padding:8px 10px; display:flex; flex-direction:column; gap:4px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:bold; color:#fff; font-size:0.8rem; word-break:break-all;">📄 ${c.name}</span>
                        ${badgeHtml}
                    </div>
                    <div style="font-size:0.72rem; color:#888; display:flex; gap:16px;">
                        <span><b style="color:#4caf50;">Local:</b> ${formatBytes(c.localSize)} • <span style="color:#aaa;">${localDate}</span></span>
                        <span><b style="color:#ce93d8;">Servidor SMB:</b> ${formatBytes(c.smbSize)} • <span style="color:#aaa;">${smbDate}</span></span>
                    </div>
                </div>
            `;
        }).join('');

        win.innerHTML = `
            <!-- HEADER -->
            <div id="sync-conflict-header" style="background:#1a1f29; border-bottom:1px solid #2a3444; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.15rem;">⚠️</span>
                    <b style="font-size:0.92rem; color:#fff; font-weight:600;">Conflicto de Versión en Servidor Central (SMB)</b>
                </div>
                <button id="sync-conflict-close-btn" class="icon-btn-mini" style="color:#f44336; background:transparent; border:none; cursor:pointer; font-size:1.1rem; line-height:1; padding:2px 6px;" title="Cerrar (Esc)">✕</button>
            </div>

            <!-- SUB-BAR -->
            <div style="background:#11151c; border-bottom:1px solid #232b38; padding:8px 14px; font-size:0.76rem; color:#d8dee9; line-height:1.4;">
                Se detectó que <b>${conflicts.length} archivo(s)</b> ya existen en el Servidor Central con diferencias de versión o tamaño respecto a tu copia local.<br>
                <span style="color:#8892b0;">¿Cómo deseas proceder para la subida a Drive?</span>
            </div>

            <!-- CONFLICTS LIST -->
            <div style="padding:12px 14px; max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; background:#0b0d11;">
                ${itemsListHtml}
            </div>

            <!-- ACTIONS FOOTER -->
            <div style="background:#131822; border-top:1px solid #232b38; padding:10px 14px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <button id="sync-conflict-cancel-btn" style="background:#222733; color:#d8dee9; border:1px solid #333d4e; border-radius:4px; padding:6px 14px; font-size:0.78rem; font-weight:600; cursor:pointer;">
                    ✕ Cancelar
                </button>
                <div style="display:flex; gap:8px;">
                    <button id="sync-conflict-rename-btn" style="background:#2e7d32; color:#fff; border:1px solid #4caf50; border-radius:4px; padding:6px 14px; font-size:0.78rem; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" title="Guarda una nueva copia correlativa _01 para no pisar el archivo">
                        📄 Guardar como _01
                    </button>
                    <button id="sync-conflict-overwrite-btn" style="background:#d32f2f; color:#fff; border:1px solid #f44336; border-radius:4px; padding:6px 14px; font-size:0.78rem; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:5px;" title="Sobrescribe el archivo en el Servidor Central y luego sube a Drive">
                        ⚠️ Pisar en Servidor y Subir
                    </button>
                </div>
            </div>
        `;

        overlay.appendChild(win);
        document.body.appendChild(overlay);

        function cleanup(choice) {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            resolve(choice);
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup('cancel');
            }
        }
        document.addEventListener('keydown', onKeyDown);

        win.querySelector('#sync-conflict-close-btn').onclick = () => cleanup('cancel');
        win.querySelector('#sync-conflict-cancel-btn').onclick = () => cleanup('cancel');
        win.querySelector('#sync-conflict-rename-btn').onclick = () => cleanup('rename_01');
        win.querySelector('#sync-conflict-overwrite-btn').onclick = () => cleanup('overwrite');
        overlay.onclick = (e) => {
            if (e.target === overlay) cleanup('cancel');
        };
    });
}

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
        return item.items.map(f => {
            const fOnline = f.onlinePath || (typeof window.resolveLocalToOnlinePath === 'function' ? window.resolveLocalToOnlinePath(f.path) : f.path);
            return {
                name: f.name,
                isDir: false,
                relativePath: f.relativePath || f.name,
                serverPath: f.serverPath || f.path,
                onlinePath: fOnline,
                localPath: f.path || f.targetLocalPath,
                targetLocalPath: f.targetLocalPath || f.path,
                targetServerPath: f.serverPath || f.path,
                size: f.size || 0
            };
        });
    }
    const resolvedOnline = item.onlinePath || (typeof window.resolveLocalToOnlinePath === 'function' ? window.resolveLocalToOnlinePath(item.path) : item.path);
    const src = targetType === 'server'
        ? (operationType === 'download' ? (item.serverPath || item.onlinePath || item.path) : item.path)
        : (operationType === 'download' ? (item.onlinePath || item.path) : item.path);
    const dest = targetType === 'server'
        ? (operationType === 'download' ? (item.targetLocalPath || item.path) : (item.serverPath || item.path))
        : (operationType === 'download' ? (item.targetLocalPath || item.path) : resolvedOnline);

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
    const resolvedTarget = forcedTargetType || (window.syncComparisonMode === 'server' || window.viewLocationMode === 'server' ? 'server' : 'drive');
    if (resolvedTarget === 'drive' && typeof window.checkUserPermission === 'function' && !window.checkUserPermission('explorer_allow_drive')) {
        if (typeof PipetaConsole !== 'undefined') PipetaConsole.log('sync', 'Descarga desde Google Drive bloqueada por política de usuario.', 'warn');
        alert("🔒 Acción sobre Google Drive bloqueada por permisos de tu usuario.");
        return;
    }
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
                    const row = e.target.closest('.tree-node');
                    if (row) {
                        const badges = row.querySelectorAll('.sync-badge-action, .sync-badge-inline');
                        badges.forEach(b => {
                            b.innerHTML = b.classList.contains('sync-badge-inline') ? '⏳' : '⏳ Descargando...';
                            b.style.opacity = '0.6';
                            b.style.pointerEvents = 'none';
                        });
                    } else {
                        e.target.innerHTML = '⏳ Descargando...';
                        e.target.style.opacity = '0.6';
                        e.target.style.pointerEvents = 'none';
                    }
                }
                const toastMsg = `Descarga desde Server iniciada para: ${displaySeqName}`;
                if (typeof window.showSyncNotification === 'function') {
                    window.showSyncNotification(toastMsg, 'info', 4, `Destino: ${dest}`);
                } else if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                    settings.showToast(toastMsg, 'info', 4, `Destino: ${dest}`);
                }
                if (window.syncQueueUI) {
                    window.syncQueueUI.fetchStatus();
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
        } catch (err) {
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
                const row = e.target.closest('.tree-node');
                if (row) {
                    const badges = row.querySelectorAll('.sync-badge-action, .sync-badge-inline');
                    badges.forEach(b => {
                        b.innerHTML = b.classList.contains('sync-badge-inline') ? '⏳' : '⏳ Descargando...';
                        b.style.opacity = '0.6';
                        b.style.pointerEvents = 'none';
                    });
                } else {
                    e.target.innerHTML = '⏳ Descargando...';
                    e.target.style.opacity = '0.6';
                    e.target.style.pointerEvents = 'none';
                }
            }
            const toastMsg = `Orden de descarga #${data.orderId.slice(-6)} encolada para: ${item.name}`;
            if (typeof window.showSyncNotification === 'function') {
                window.showSyncNotification(toastMsg, 'success', 4, `Destino: ${dest}`);
            } else if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast(toastMsg, 'success', 4, `Destino: ${dest}`);
            } else {
                alert(`✅ ${toastMsg}`);
            }
            if (window.syncQueueUI) {
                window.syncQueueUI.fetchStatus();
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
    } catch (err) {
        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `❌ Fallo de conexión al solicitar descarga: ${err.message}`, 'error');
        }
        alert(`❌ Error de conexión: ${err.message}`);
    }
}

async function requestUploadLocalItem(item, e, forcedTargetType) {
    if (e) e.stopPropagation();
    const resolvedTarget = forcedTargetType || (window.syncComparisonMode === 'server' || window.viewLocationMode === 'server' ? 'server' : 'drive');
    if (resolvedTarget === 'drive' && typeof window.checkUserPermission === 'function' && !window.checkUserPermission('explorer_allow_drive')) {
        if (typeof PipetaConsole !== 'undefined') PipetaConsole.log('sync', 'Subida a Google Drive bloqueada por política de usuario.', 'warn');
        alert("🔒 Acción sobre Google Drive bloqueada por permisos de tu usuario.");
        return;
    }
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
                    const row = e.target.closest('.tree-node');
                    if (row) {
                        const badges = row.querySelectorAll('.sync-badge-action, .sync-badge-inline');
                        badges.forEach(b => {
                            b.innerHTML = b.classList.contains('sync-badge-inline') ? '⏳' : '⏳ Subiendo...';
                            b.style.opacity = '0.6';
                            b.style.pointerEvents = 'none';
                        });
                    } else {
                        e.target.innerHTML = '⏳ Subiendo...';
                        e.target.style.opacity = '0.6';
                        e.target.style.pointerEvents = 'none';
                    }
                }
                const toastMsg = `Subida a Server Central iniciada para: ${item.name}`;
                if (typeof window.showSyncNotification === 'function') {
                    window.showSyncNotification(toastMsg, 'info', 4, `Destino: ${dest}`);
                } else if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                    settings.showToast(toastMsg, 'info', 4, `Destino: ${dest}`);
                }
                if (window.syncQueueUI) {
                    window.syncQueueUI.fetchStatus();
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
        } catch (err) {
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `❌ Error de red con server LAN: ${err.message}`, 'error');
            }
            alert(`❌ Error de conexión: ${err.message}`);
        }
        return;
    }

    // 2. SUBIDA A GOOGLE DRIVE (Vía Worker / Rclone)
    const src = item.path;
    let dest = item.onlinePath;
    if (!dest && typeof window.resolveLocalToOnlinePath === 'function') {
        dest = window.resolveLocalToOnlinePath(src, proj);
    }
    if (!dest) {
        dest = `Google Drive (${proj})`;
    }

    // Pre-chequeo de conflictos y fast-lane contra StorNext SMB
    let conflictResolution = 'default';
    let finalTransferItems = transferItems;

    try {
        const chkRes = await fetch('/api/sync/check-upload-conflicts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: proj, items: transferItems, targetType: 'drive' })
        }).then(r => r.json());

        if (chkRes.success && chkRes.hasConflicts && chkRes.conflicts && chkRes.conflicts.length > 0) {
            const userChoice = await showSyncUploadConflictDialog(chkRes.conflicts);
            if (userChoice === 'cancel' || !userChoice) {
                return; // Aborta subida
            } else if (userChoice === 'overwrite') {
                conflictResolution = 'overwrite';
            } else if (userChoice === 'rename_01') {
                const renRes = await fetch('/api/sync/resolve-upload-conflict', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: proj, items: transferItems, conflicts: chkRes.conflicts, action: 'rename_01' })
                }).then(r => r.json());

                if (renRes.success && renRes.items) {
                    finalTransferItems = renRes.items;
                    if (renRes.renamed && renRes.renamed.length > 0) {
                        const renNames = renRes.renamed.map(r => r.newName).join(', ');
                        if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                            settings.showToast(`Archivos protegidos como copia: ${renNames}`, 'info', 4);
                        }
                    }
                }
            }
        } else if (chkRes.success && chkRes.allIdentical) {
            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast('⚡ Archivos ya idénticos en Servidor SMB. Subiendo directamente a Drive vía Worker Central.', 'info', 4);
            }
        }
    } catch (chkErr) {
        console.warn('Pre-check conflict check skipped:', chkErr);
    }

    const confirmed = await showSyncConfirmDialog({
        title: 'Subir a Google Drive',
        icon: '☁️',
        actionType: 'upload',
        targetType: 'drive',
        name: (finalTransferItems[0] && finalTransferItems[0].name) || item.name,
        isDir: isDir,
        isSequence: !!item.isSequence,
        size: totalBytes,
        src: (finalTransferItems[0] && finalTransferItems[0].localPath) || src,
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
                items: finalTransferItems,
                conflictResolution
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
                    onlinePath: dest,
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
                const row = e.target.closest('.tree-node');
                if (row) {
                    const badges = row.querySelectorAll('.sync-badge-action, .sync-badge-inline');
                    badges.forEach(b => {
                        b.innerHTML = b.classList.contains('sync-badge-inline') ? '⏳' : '⏳ Subiendo...';
                        b.style.opacity = '0.6';
                        b.style.pointerEvents = 'none';
                    });
                } else {
                    e.target.innerHTML = '⏳ Subiendo...';
                    e.target.style.opacity = '0.6';
                    e.target.style.pointerEvents = 'none';
                }
            }

            const toastMsg = `Orden de subida #${data.orderId.slice(-6)} encolada para: ${item.name}`;
            if (typeof window.showSyncNotification === 'function') {
                window.showSyncNotification(toastMsg, 'success', 4, `Origen: ${item.path}`);
            } else if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast(toastMsg, 'success', 4, `Origen: ${item.path}`);
            } else {
                alert(`✅ ${toastMsg}`);
            }
            if (window.syncQueueUI) {
                window.syncQueueUI.fetchStatus();
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
    } catch (err) {
        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `❌ Fallo de conexión al solicitar subida: ${err.message}`, 'error');
        }
        alert(`❌ Error de conexión: ${err.message}`);
    }
}

// Expose all Sync Overlay API functions on window.*
window.normalizeSyncPath = normalizeSyncPath;
window.loadActiveProjectSyncCatalog = loadActiveProjectSyncCatalog;
window.indexSyncCatalog = indexSyncCatalog;
window.indexServerCatalog = indexServerCatalog;
window.toggleSyncLayer = toggleSyncLayer;
window.showSyncConfirmDialog = showSyncConfirmDialog;
window.showSyncUploadConflictDialog = showSyncUploadConflictDialog;
window.buildItemsForSyncOrder = buildItemsForSyncOrder;
window.requestDownloadGhostItem = requestDownloadGhostItem;
window.requestUploadLocalItem = requestUploadLocalItem;
