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

async function requestDownloadGhostItem(item, e, forcedTargetType) {
    if (e) e.stopPropagation();
    const isDir = !!item.isDirectory || !!item.isDir;
    const typeLabel = isDir ? 'Carpeta' : 'Archivo';
    const targetType = forcedTargetType || (window.syncComparisonMode === 'server' || window.viewLocationMode === 'server' ? 'server' : 'drive');
    const proj = (typeof settings !== 'undefined' && settings?.currentProject?.name) ? settings.currentProject.name : 'surf_love';

    // 1. DESCARGA DESDE SERVER CENTRAL
    if (targetType === 'server') {
        const src = item.serverPath || item.onlinePath || item.path;
        const dest = item.targetLocalPath || item.path;
        const sizeStr = item.size ? ` (${(item.size / (1024 * 1024)).toFixed(1)} MB)` : '';

        const msg = `📥 DESCARGAR DESDE SERVIDOR CENTRAL:\n` +
                    `══════════════════════════════════════════════════\n` +
                    `• Elemento: ${item.name}${sizeStr}\n` +
                    `• Tipo: ${typeLabel}\n` +
                    `• Origen (Server): ${src}\n` +
                    `• Destino (Local): ${dest}\n` +
                    `• Método: Copia de red central\n` +
                    `══════════════════════════════════════════════════\n\n` +
                    `¿Copiar ahora a tu disco local Z:?`;
        if (!confirm(msg)) return;

        try {
            const res = await fetch('/api/sync/request-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: proj,
                    transferType: 'server',
                    user: (typeof getPipetaCurrentUser === 'function' ? getPipetaCurrentUser() : 'artista'),
                    items: [{
                        name: item.name,
                        isDir: isDir,
                        relativePath: item.relativePath || item.name,
                        serverPath: src,
                        targetLocalPath: dest,
                        size: item.size || 0
                    }]
                })
            });
            const data = await res.json();
            if (data.success) {
                if (e && e.target) {
                    e.target.innerHTML = '⏳ Descargando...';
                    e.target.style.opacity = '0.6';
                    e.target.style.pointerEvents = 'none';
                }
                const toastMsg = `Descarga desde Server iniciada para: ${item.name}`;
                if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                    settings.showToast(toastMsg, 'info', 4, `Destino: ${dest}`);
                }
                if (window.syncQueueUI) {
                    window.syncQueueUI.fetchStatus();
                    window.syncQueueUI.open();
                }
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `[DESCARGA SERVER] Iniciada transferencia: ${item.name} (${typeLabel}) -> ${dest}`, 'pending');
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
    const sizeStr = item.size ? ` (${(item.size / (1024 * 1024)).toFixed(1)} MB)` : '';

    const msg = `📥 DESCARGAR DESDE GOOGLE DRIVE:\n` +
                `══════════════════════════════════════════════════\n` +
                `• Elemento: ${item.name}${sizeStr}\n` +
                `• Tipo: ${typeLabel}\n` +
                `• Origen (Drive): ${src}\n` +
                `• Destino (Local): ${dest}\n` +
                `• Método: Orden de descarga vía Worker / Rclone\n` +
                `══════════════════════════════════════════════════\n\n` +
                `¿Deseas enviar la orden de descarga al Worker?`;

    if (!confirm(msg)) return;

    try {
        const res = await fetch('/api/sync/request-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: proj,
                user: (typeof getPipetaCurrentUser === 'function' ? getPipetaCurrentUser() : 'artista'),
                items: [{
                    name: item.name,
                    isDir: isDir,
                    relativePath: item.relativePath || item.name,
                    onlinePath: item.onlinePath || src,
                    targetLocalPath: dest,
                    size: item.size || 0
                }]
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
    const typeLabel = isDir ? 'Carpeta' : 'Archivo';
    const targetType = forcedTargetType || (window.syncComparisonMode === 'server' || window.viewLocationMode === 'server' ? 'server' : 'drive');
    const proj = (typeof settings !== 'undefined' && settings?.currentProject?.name) ? settings.currentProject.name : 'surf_love';

    // 1. SUBIDA A SERVER CENTRAL
    if (targetType === 'server') {
        const src = item.path;
        const dest = item.serverPath || item.path;
        const sizeStr = item.size ? ` (${(item.size / (1024 * 1024)).toFixed(1)} MB)` : '';

        const msg = `⬆️ SUBIR A SERVIDOR CENTRAL:\n` +
                    `══════════════════════════════════════════════════\n` +
                    `• Elemento: ${item.name}${sizeStr}\n` +
                    `• Tipo: ${typeLabel}\n` +
                    `• Origen (Local): ${src}\n` +
                    `• Destino (Server): ${dest}\n` +
                    `• Método: Copia de red central\n` +
                    `══════════════════════════════════════════════════\n\n` +
                    `¿Copiar ahora al almacenamiento central del estudio?`;
        if (!confirm(msg)) return;

        try {
            const res = await fetch('/api/sync/request-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: proj,
                    transferType: 'server',
                    user: (typeof getPipetaCurrentUser === 'function' ? getPipetaCurrentUser() : 'artista'),
                    items: [{
                        name: item.name,
                        isDir: isDir,
                        relativePath: item.relativePath || item.name,
                        localPath: src,
                        targetServerPath: dest,
                        size: item.size || 0
                    }]
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
                    PipetaConsole.log('sync', `[SUBIDA SERVER] Iniciada transferencia: ${item.name} (${typeLabel}) -> ${dest}`, 'pending');
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
    const sizeStr = item.size ? ` (${(item.size / (1024 * 1024)).toFixed(1)} MB)` : '';

    const msg = `⬆️ SUBIR A GOOGLE DRIVE:\n` +
                `══════════════════════════════════════════════════\n` +
                `• Elemento: ${item.name}${sizeStr}\n` +
                `• Tipo: ${typeLabel}\n` +
                `• Origen (Local): ${src}\n` +
                `• Destino (Drive): ${dest}\n` +
                `• Método: Orden de subida vía Worker / Rclone\n` +
                `══════════════════════════════════════════════════\n\n` +
                `¿Deseas encolar la subida de este elemento a la nube?`;

    if (!confirm(msg)) return;

    try {
        const res = await fetch('/api/sync/request-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: proj,
                user: (typeof getPipetaCurrentUser === 'function' ? getPipetaCurrentUser() : 'artista'),
                items: [{
                    name: item.name,
                    isDir: isDir,
                    localPath: item.path,
                    size: item.size || 0
                }]
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
                if (typeof refreshCurrentView === 'function') refreshCurrentView();
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

    for (let depth = 0; depth < chain.length; depth++) {
        const col = container.children[depth];
        if (!col) break;

        const targetPath = chain[depth];
        const normTarget = clean(targetPath);
        const blocks = Array.from(col.children);

        let foundBlock = null;
        for (const block of blocks) {
            const itemPath = block.getAttribute('data-path');
            const normItem = itemPath ? clean(itemPath) : '';

            if (normItem === normTarget) {
                foundBlock = block;
                break;
            }
        }

        if (foundBlock) {
            foundBlock.classList.add('active');

            // If this is a directory and not the last item, load next column
            if (foundBlock.getAttribute('data-isdir') === 'true') {
                await loadNextPipetaColumn(container, chain[depth], depth + 1, containerId);
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
