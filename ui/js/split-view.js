// ------------------------------------------
// --- STANDARD SPLIT BROWSER (TREE) ---
// ------------------------------------------

// Persistence State
const expandedPaths = new Set();
window.explorerExpandedPaths = expandedPaths;

function getExplorerRelativePath(fullPath) {
    if (!fullPath) return '';
    const norm = fullPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    
    // Check known root patterns
    // 1. Media
    const mediaMatch = norm.match(/(?:(?:[a-z]:)?\/interno\/media\/[^\/]+\/[^\/]+|\/unidades compartidas\/[^\/]+_media)(.*)$/i);
    if (mediaMatch) {
        return 'media:' + (mediaMatch[1] || '');
    }
    // 2. Work
    const workMatch = norm.match(/(?:(?:[a-z]:)?\/(?:interno\/)?(?:atresmedia\/[^\/]+|[^\/]+)|\/unidades compartidas\/[^\/]+)(.*)$/i);
    if (workMatch) {
        return 'work:' + (workMatch[1] || '');
    }
    
    if (typeof getCurrentRoots === 'function') {
        const roots = getCurrentRoots();
        if (roots) {
            const normWork = (roots.work || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
            const normMedia = (roots.media || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
            if (normMedia && norm.startsWith(normMedia)) {
                return 'media:' + norm.substring(normMedia.length);
            }
            if (normWork && norm.startsWith(normWork)) {
                return 'work:' + norm.substring(normWork.length);
            }
        }
    }
    return norm.replace(/^[a-z]:/i, '');
}
window.getExplorerRelativePath = getExplorerRelativePath;

function isPathExpanded(path) {
    if (!path) return false;
    const norm = path.replace(/\\/g, '/').toLowerCase();
    const rel = getExplorerRelativePath(path);
    return expandedPaths.has(norm) || (rel && expandedPaths.has(rel));
}
window.isPathExpanded = isPathExpanded;

function setPathExpanded(path, expand) {
    if (!path) return;
    const norm = path.replace(/\\/g, '/').toLowerCase();
    const rel = getExplorerRelativePath(path);
    if (expand) {
        expandedPaths.add(norm);
        if (rel) expandedPaths.add(rel);
    } else {
        expandedPaths.delete(norm);
        if (rel) expandedPaths.delete(rel);
    }
}
window.setPathExpanded = setPathExpanded;

function showExplorerLoading(containerId = null, text = 'Cargando contenido...') {
    const targets = containerId 
        ? [document.getElementById(containerId)].filter(Boolean)
        : [
            document.getElementById('split-pane-project'), 
            document.getElementById('split-pane-media'),
            document.getElementById('pipeta-project-container')?.parentElement,
            document.getElementById('pipeta-media-container')?.parentElement
          ].filter(Boolean);

    targets.forEach(pane => {
        let overlay = pane.querySelector('.explorer-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'explorer-loading-overlay active';
            overlay.innerHTML = `
                <div class="explorer-loading-spinner"></div>
                <div class="explorer-loading-text">${text}</div>
            `;
            pane.appendChild(overlay);
        } else {
            overlay.classList.add('active');
            const textEl = overlay.querySelector('.explorer-loading-text');
            if (textEl) textEl.textContent = text;
        }
    });
}
window.showExplorerLoading = showExplorerLoading;

function hideExplorerLoading(containerId = null) {
    const targets = containerId 
        ? [document.getElementById(containerId)].filter(Boolean)
        : document.querySelectorAll('.explorer-loading-overlay');

    targets.forEach(item => {
        const overlay = item.classList.contains('explorer-loading-overlay') 
            ? item 
            : item.querySelector('.explorer-loading-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.remove();
        }
    });
}
window.hideExplorerLoading = hideExplorerLoading;

async function initBrowser() {
    window.activeBrowserRenderToken = (window.activeBrowserRenderToken || 0) + 1;
    const currentToken = window.activeBrowserRenderToken;

    document.body.classList.add('pipeta-fast-rendering');
    showExplorerLoading(null, 'Actualizando vista...');

    try {
        const roots = getCurrentRoots();
        const mode = window.viewLocationMode || 'local';
        const modeLabel = mode === 'drive' ? '☁️ DRIVE' : (mode === 'server' ? '🗄️ SERVER' : '💻 LOCAL');

        // Set Header Labels
        const workLabel = document.getElementById('label-work-path');
        const mediaLabel = document.getElementById('label-media-path');
        if (workLabel) workLabel.innerHTML = `<span style="font-size:0.7rem; background:#1c2430; color:#88c0d0; padding:1px 5px; border-radius:3px; margin-right:6px;">${modeLabel}</span>${roots.work}`;
        if (mediaLabel) mediaLabel.innerHTML = `<span style="font-size:0.7rem; background:#1c2430; color:#88c0d0; padding:1px 5px; border-radius:3px; margin-right:6px;">${modeLabel}</span>${roots.media}`;

        await Promise.all([
            loadRootTree(roots.work, 'tree-work', currentToken),
            loadRootTree(roots.media, 'tree-media', currentToken)
        ]);

        // Calculate folder sizes (async, non-blocking)
        if (typeof updateFolderSizes === 'function') updateFolderSizes();
    } finally {
        hideExplorerLoading();
        setTimeout(() => {
            document.body.classList.remove('pipeta-fast-rendering');
        }, 50);
    }
}

async function getDecoratedTreeItems(dirPath, rawItems, allRawItems = null) {
    const mode = window.viewLocationMode || 'local';
    const compMode = window.syncComparisonMode || 'off';
    const normDirPath = (dirPath || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

    // 1. Si estamos en LOCAL y la comparación está apagada (OFF), retornar inmediatamente sin catálogo
    if (mode === 'local' && compMode === 'off') {
        return (rawItems || []).map(i => ({ ...i }));
    }

    const decorated = [];
    const localNames = new Set(((allRawItems || rawItems) || []).map(i => i.name.toLowerCase()));

    // 2. COMPARACIÓN LOCAL vs GOOGLE DRIVE
    if (mode === 'local' && compMode === 'drive') {
        let driveItems = [];
        try {
            const dData = await fetchDir(dirPath, { localSource: 'drive_catalog' });
            if (dData && dData.items && !dData.error && dData.items.length > 0) {
                driveItems = dData.items;
            }
        } catch (e) {}

        let catalogChildren = driveItems;
        if (catalogChildren.length === 0 && window.pipetaSyncCatalogLookup?.byParentLocalPath) {
            catalogChildren = window.pipetaSyncCatalogLookup.byParentLocalPath.get(normDirPath) || [];
        }

        const catalogMap = new Map(catalogChildren.map(c => [c.name.toLowerCase(), c]));

        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            const catItem = catalogMap.get(item.name.toLowerCase());
            if (catItem) {
                itemCopy.syncStatus = 'matched_drive';
                itemCopy.onlinePath = catItem.onlinePath || catItem.path;
                itemCopy.targetLocalPath = catItem.targetLocalPath || item.path;
                itemCopy.remoteSize = catItem.size || 0;
                itemCopy.remoteModTime = catItem.modTime || null;

                // Deep Compare: Comprobar peso y fecha
                if (window.deepCompareMode && !item.isDirectory && !catItem.isDir && !catItem.isDirectory) {
                    const localSize = Number(item.size) || 0;
                    const remoteSize = Number(catItem.size) || 0;
                    if (localSize === 0 && remoteSize > 0) {
                        itemCopy.syncStatus = 'mismatch_drive';
                        itemCopy.mismatchReason = 'zero_size';
                    } else if (remoteSize > 0 && Math.abs(localSize - remoteSize) > 0) {
                        itemCopy.syncStatus = 'mismatch_drive';
                        itemCopy.mismatchReason = 'size_diff';
                    } else if (item.mtime && catItem.modTime) {
                        const localTime = new Date(item.mtime).getTime();
                        const remoteTime = new Date(catItem.modTime).getTime();
                        if (remoteTime - localTime > 3000) {
                            itemCopy.syncStatus = 'outdated_local';
                            itemCopy.mismatchReason = 'newer_remote';
                        }
                    }
                }

                if (catItem.hasPendingSync) {
                    itemCopy.hasPendingSync = catItem.hasPendingSync;
                    itemCopy.pendingType = catItem.pendingType;
                    itemCopy.pendingCount = catItem.pendingCount;
                }
            } else {
                itemCopy.syncStatus = 'upload_drive';
                itemCopy.targetLocalPath = item.path;
            }
            decorated.push(itemCopy);
        }

        // Inyectar nodos FANTASMA (están en Drive pero faltan en Local Z)
        for (const catItem of catalogChildren) {
            if (!localNames.has(catItem.name.toLowerCase())) {
                const targetLocal = catItem.targetLocalPath || (normDirPath + '/' + catItem.name);
                decorated.push({
                    name: catItem.name,
                    isDirectory: !!(catItem.isDir || catItem.isDirectory),
                    path: targetLocal,
                    isGhost: true,
                    size: catItem.size || 0,
                    onlinePath: catItem.onlinePath || catItem.path,
                    targetLocalPath: targetLocal,
                    syncStatus: 'ghost_drive'
                });
            }
        }
    } 
    // 3. COMPARACIÓN LOCAL vs SERVIDOR CENTRAL (Catálogo Central)
    else if (mode === 'local' && compMode === 'server') {
        let serverItems = [];
        try {
            const sData = await fetchDir(dirPath, { localSource: 'server_catalog' });
            if (sData && sData.items && !sData.error) {
                serverItems = sData.items;
            }
        } catch (e) {}

        const serverNames = new Map(serverItems.map(s => [s.name.toLowerCase(), s]));

        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            const sMatch = serverNames.get(item.name.toLowerCase());
            itemCopy.targetLocalPath = item.path;
            itemCopy.serverPath = item.path;

            if (sMatch) {
                itemCopy.syncStatus = 'matched_server';
                itemCopy.remoteSize = sMatch.size || 0;
                itemCopy.remoteModTime = sMatch.modTime || null;

                // Deep Compare: Comprobar peso y fecha
                if (window.deepCompareMode && !item.isDirectory && !sMatch.isDir && !sMatch.isDirectory) {
                    const localSize = Number(item.size) || 0;
                    const remoteSize = Number(sMatch.size) || 0;
                    if (localSize === 0 && remoteSize > 0) {
                        itemCopy.syncStatus = 'mismatch_server';
                        itemCopy.mismatchReason = 'zero_size';
                    } else if (remoteSize > 0 && Math.abs(localSize - remoteSize) > 0) {
                        itemCopy.syncStatus = 'mismatch_server';
                        itemCopy.mismatchReason = 'size_diff';
                    } else if (item.mtime && sMatch.modTime) {
                        const localTime = new Date(item.mtime).getTime();
                        const remoteTime = new Date(sMatch.modTime).getTime();
                        if (remoteTime - localTime > 3000) {
                            itemCopy.syncStatus = 'outdated_local';
                            itemCopy.mismatchReason = 'newer_remote';
                        }
                    }
                }

                if (sMatch.hasPendingSync) {
                    itemCopy.hasPendingSync = sMatch.hasPendingSync;
                    itemCopy.pendingType = sMatch.pendingType;
                    itemCopy.pendingCount = sMatch.pendingCount;
                }
            } else {
                itemCopy.syncStatus = 'upload_server';
            }
            decorated.push(itemCopy);
        }

        // Inyectar nodos FANTASMA del Server (están en Server pero faltan en Local)
        for (const sItem of serverItems) {
            if (!localNames.has(sItem.name.toLowerCase())) {
                decorated.push({
                    name: sItem.name,
                    isDirectory: !!sItem.isDirectory,
                    path: sItem.path,
                    isGhost: true,
                    size: sItem.size || 0,
                    serverPath: sItem.path,
                    targetLocalPath: sItem.path,
                    syncStatus: 'ghost_server'
                });
            }
        }
    }
    // 4. MODO EXPLORACIÓN DIRECTA DE DRIVE
    else if (mode === 'drive') {
        const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
        const oWork = (proj?.roots?.onlineWork || '').replace(/\\/g, '/');
        const oMedia = (proj?.roots?.onlineMedia || '').replace(/\\/g, '/');

        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            let localTarget = item.targetLocalPath || item.path;
            if (!item.targetLocalPath && proj?.roots) {
                if (oWork && localTarget.toLowerCase().startsWith(oWork.toLowerCase())) {
                    localTarget = proj.roots.work + localTarget.substring(oWork.length);
                } else if (oMedia && localTarget.toLowerCase().startsWith(oMedia.toLowerCase())) {
                    localTarget = proj.roots.media + localTarget.substring(oMedia.length);
                }
            }
            itemCopy.targetLocalPath = localTarget.replace(/\\/g, '/');
            itemCopy.onlinePath = item.onlinePath || item.path;

            let inLocal = false;
            if (typeof item.localExists === 'boolean') {
                inLocal = item.localExists;
            } else if (window.pipetaSyncCatalogLookup?.byLocalPath) {
                const normTarget = itemCopy.targetLocalPath.toLowerCase();
                inLocal = window.pipetaSyncCatalogLookup.byLocalPath.has(normTarget);
            }

            itemCopy.syncStatus = inLocal ? 'matched_drive' : 'ghost_drive';
            decorated.push(itemCopy);
        }
    }
    // 5. MODO EXPLORACIÓN DE SERVER CENTRAL (Catálogo)
    else if (mode === 'server') {
        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            itemCopy.serverPath = item.serverPath || item.path;
            itemCopy.targetLocalPath = item.targetLocalPath || item.path;

            let inLocal = false;
            if (typeof item.localExists === 'boolean') {
                inLocal = item.localExists;
            } else if (window.pipetaServerCatalogLookup?.byLocalPath) {
                const normTarget = itemCopy.targetLocalPath.toLowerCase();
                inLocal = window.pipetaServerCatalogLookup.byLocalPath.has(normTarget);
            }
            itemCopy.syncStatus = inLocal ? 'matched_server' : 'ghost_server';
            decorated.push(itemCopy);
        }
    } else {
        return (rawItems || []).map(i => ({ ...i }));
    }

    decorated.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
    });

    return decorated;
}
async function loadRootTree(rootPath, containerId, token = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!container.hasChildNodes() || container.children.length === 0) {
        container.innerHTML = `<div style="padding:10px; color:#666;">Cargando...</div>`;
    }

    try {
        const data = await fetchDir(rootPath);
        if (token && token !== window.activeBrowserRenderToken) return;

        if (!data.error) {
            const allDiskItems = data.items || [];
            const decoratedItems = await getDecoratedTreeItems(rootPath, allDiskItems, allDiskItems);
            if (token && token !== window.activeBrowserRenderToken) return;

            const filteredItems = (typeof window.filterExplorerItems === 'function')
                ? window.filterExplorerItems(decoratedItems, containerId, rootPath, allDiskItems)
                : decoratedItems;
            const finalItems = (typeof collapseImageSequences === 'function') 
                ? collapseImageSequences(filteredItems) 
                : filteredItems;

            if (token && token !== window.activeBrowserRenderToken) return;
            container.innerHTML = "";

            if (finalItems.length === 0) {
                const mode = window.viewLocationMode || 'local';
                const curProj = (typeof settings !== 'undefined') ? settings.currentProject : null;
                const projName = curProj?.id || curProj?.name || 'surf_love';

                // Si estamos en Drive o Server y no hay elementos cargados por catálogo
                if ((mode === 'drive' || mode === 'server') && (!data.fromCatalog || !data.exists)) {
                    container.innerHTML = `
                        <div class="empty-catalog-card" style="margin: 25px 10px; padding: 22px 16px; background: rgba(28, 36, 48, 0.85); border: 1px dashed rgba(136, 192, 208, 0.4); border-radius: 8px; text-align: center; box-shadow: 0 4px 14px rgba(0,0,0,0.25);">
                            <div style="font-size: 1.8rem; margin-bottom: 6px;">⚡</div>
                            <div style="font-weight: 600; color: #eceff4; font-size: 0.95rem; margin-bottom: 6px;">Catálogo no cargado localmente</div>
                            <div style="font-size: 0.78rem; color: #8892b0; margin-bottom: 15px; line-height: 1.4;">
                                El catálogo modular de <b>${projName}</b> no está en este equipo.<br>Cárgalo desde la red para explorar en modo ${mode.toUpperCase()}.
                            </div>
                            <button onclick="window.initProjectCatalog('${projName}')" style="background: linear-gradient(135deg, #5e81ac, #81a1c1); color: #fff; border: none; padding: 8px 18px; border-radius: 5px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(94, 129, 172, 0.4);">
                                ⚡ Cargar Catálogo de Proyecto
                            </button>
                        </div>
                    `;
                    return;
                }

                const emptyMsg = window.explorerOnlyMyTasks
                    ? `<div style="padding:15px; color:#aaa; font-style:italic; line-height:1.4;">
                         🔒 <b>Filtro Ramón activo:</b><br>
                         No tienes tareas asignadas en este proyecto.
                       </div>`
                    : `<div style="padding:10px; color:#666; font-style:italic;">Carpeta vacía o sin elementos</div>`;
                container.innerHTML = emptyMsg;
                return;
            }

            const fragment = document.createDocumentFragment();
            for (const item of finalItems) {
                const node = createTreeNode(item, 0, containerId);
                fragment.appendChild(node);
            }
            container.appendChild(fragment);

            // Expandir nodos ya guardados una vez que el árbol está en el DOM
            for (const node of container.children) {
                const item = node._item;
                if (item && item.isDirectory) {
                    const normPath = item.path.replace(/\\/g, '/').toLowerCase();
                    const shouldAutoExpand = window.explorerOnlyMyTasks && finalItems.length <= 2;
                    if (isPathExpanded(normPath) || shouldAutoExpand) {
                        await toggleNode(node, item, 0, node.querySelector('.tree-node'));
                    }
                }
            }
        } else {
            container.innerHTML = `<div style="color:#ff6b6b; padding:10px;">Error: ${data.error}</div>`;
        }
    } catch (err) {
        if (token && token !== window.activeBrowserRenderToken) return;
        console.error(`[EXPLORER] Error cargando ${rootPath}:`, err);
        container.innerHTML = `<div style="color:#ff6b6b; padding:10px;">Error al cargar contenido: ${err.message}</div>`;
    }
}

function createTreeNode(item, level, containerId = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'node-wrapper' + (item.isGhost ? ' sync-ghost-wrapper' : '');
    wrapper._item = item;
    wrapper._containerId = containerId;

    const row = document.createElement('div');
    row.className = 'tree-node' + (item.isGhost ? ' sync-ghost' : '');
    row.setAttribute('data-path', item.path);
    row.setAttribute('data-isdir', item.isDirectory);
    row.style.paddingLeft = `${level * 20 + 10}px`;
    wrapper._row = row;

    // Persistence: Selection State
    if (window.selectedPaths.has(item.path)) {
        row.classList.add('selected');
    }

    const icon = item.isDirectory ? '📁' : (item.isSequence ? '🎞️' : '📄');
    const arrow = item.isDirectory ? `<span class="tree-arrow" style="font-size:0.7em; color:#666; margin-right:4px;">▶</span>` : '';

    // Insignias de Sincronización explícitas y transparentes
    let badgeHtml = '';
    const status = item.syncStatus;

    if (status === 'matched_drive') {
        if (item.isDirectory && item.hasPendingSync) {
            const pCount = item.pendingCount ? ` (${item.pendingCount})` : '';
            const isUp = item.pendingType === 'upload';
            const actionText = isUp ? '⬆️* Subir' : '⬇️* Bajar';
            const actionCall = isUp ? `requestUploadLocalItem(this.closest('.node-wrapper')._item, event, 'drive')` : `requestDownloadGhostItem(this.closest('.node-wrapper')._item, event, 'drive')`;
            badgeHtml = `<span class="sync-badge-action sync-badge-pending-folder" onclick="event.stopPropagation(); ${actionCall}" title="* Esta carpeta contiene ${item.pendingCount || 'varios'} archivo(s) pendientes de sincronizar con Google Drive">${actionText}${pCount}</span>`;
        } else {
            badgeHtml = `<span class="sync-badge-ok" title="✓ En Local (Sincronizado con Google Drive)">✓</span>`;
        }
    } else if (status === 'matched_server') {
        if (item.isDirectory && item.hasPendingSync) {
            const pCount = item.pendingCount ? ` (${item.pendingCount})` : '';
            const isUp = item.pendingType === 'upload';
            const actionText = isUp ? '⬆️* Subir' : '⬇️* Bajar';
            const actionCall = isUp ? `requestUploadLocalItem(this.closest('.node-wrapper')._item, event, 'server')` : `requestDownloadGhostItem(this.closest('.node-wrapper')._item, event, 'server')`;
            badgeHtml = `<span class="sync-badge-action sync-badge-pending-folder" onclick="event.stopPropagation(); ${actionCall}" title="* Esta carpeta contiene ${item.pendingCount || 'varios'} archivo(s) pendientes de sincronizar con Servidor Central">${actionText}${pCount}</span>`;
        } else {
            badgeHtml = `<span class="sync-badge-ok" title="✓ En Local (Idéntico en Servidor Central)">✓</span>`;
        }
    } else if (status === 'upload_drive') {
        const dest = item.onlinePath || 'Google Drive';
        badgeHtml = `<span class="sync-badge-action sync-badge-upload" onclick="event.stopPropagation(); requestUploadLocalItem(this.closest('.node-wrapper')._item, event, 'drive')" title="Subir a Google Drive (${dest})">⬆️ Subir a Drive</span>`;
    } else if (status === 'upload_server') {
        const dest = item.serverPath || 'Servidor Central';
        badgeHtml = `<span class="sync-badge-action sync-badge-upload" onclick="event.stopPropagation(); requestUploadLocalItem(this.closest('.node-wrapper')._item, event, 'server')" title="Copiar a Servidor Central (${dest})">⬆️ Subir a Server</span>`;
    } else if (status === 'ghost_drive') {
        badgeHtml = `<span class="sync-badge-action sync-badge-download" onclick="event.stopPropagation(); requestDownloadGhostItem(this.closest('.node-wrapper')._item, event, 'drive')" title="Descargar desde Google Drive hacia tu disco local Z:">⬇️ Bajar de Drive</span>`;
    } else if (status === 'ghost_server') {
        badgeHtml = `<span class="sync-badge-action sync-badge-download" onclick="event.stopPropagation(); requestDownloadGhostItem(this.closest('.node-wrapper')._item, event, 'server')" title="Copiar desde Servidor Central hacia tu disco local Z:">⬇️ Bajar de Server</span>`;
    } else if (status === 'partial_drive' || status === 'partial_server') {
        const targetType = status === 'partial_server' ? 'server' : 'drive';
        const labelTarget = targetType === 'server' ? 'Server' : 'Drive';
        const missingCount = item.missingFramesCount || (item.missingFrames ? item.missingFrames.length : 1);
        badgeHtml = `<span class="sync-badge-action sync-badge-download" style="background:#d08770; color:#fff;" onclick="event.stopPropagation(); requestDownloadGhostItem(this.closest('.node-wrapper')._item, event, '${targetType}')" title="Secuencia incompleta: faltan ${missingCount} frames en disco local. Clic para bajar los frames faltantes desde ${labelTarget}">⬇️* Bajar (${missingCount} faltantes)</span>`;
    } else if (status === 'mismatch_drive' || status === 'mismatch_server') {
        const targetType = status === 'mismatch_server' ? 'server' : 'drive';
        const labelTarget = targetType === 'server' ? 'Server' : 'Drive';
        const lMb = item.size ? (item.size / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB';
        const rMb = item.remoteSize ? (item.remoteSize / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB';
        badgeHtml = `<span class="sync-badge-action sync-badge-download" style="background:#bf616a; color:#fff;" onclick="event.stopPropagation(); requestDownloadGhostItem(this.closest('.node-wrapper')._item, event, '${targetType}')" title="Diferencia de peso detectada (Local: ${lMb} ≠ ${labelTarget}: ${rMb}). Clic para re-descargar versión íntegra">⚠️* Peso difiere (${lMb} vs ${rMb})</span>`;
    } else if (status === 'outdated_local') {
        const targetType = (window.syncComparisonMode === 'server') ? 'server' : 'drive';
        const labelTarget = targetType === 'server' ? 'Server' : 'Drive';
        badgeHtml = `<span class="sync-badge-action sync-badge-download" style="background:#ebcb8b; color:#2e3440; font-weight:bold;" onclick="event.stopPropagation(); requestDownloadGhostItem(this.closest('.node-wrapper')._item, event, '${targetType}')" title="El archivo en ${labelTarget} es más reciente que el local. Clic para actualizar">⬇️* Actualizar (Más nuevo)</span>`;
    }

    row.innerHTML = `
        <span style="display:flex; align-items:center; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${arrow}${icon} <span style="margin-left:5px;">${item.name}</span>
        </span>
        ${badgeHtml}
    `;

    row.onclick = async (e) => {
        e.stopPropagation();

        if (e.shiftKey || e.ctrlKey) {
            // Multi-Select
            SelectionManager.toggle(item.path, row);
        } else {
            // Single Select
            SelectionManager.clear();
            SelectionManager.add(item.path, row);
        }

        updateDetailsPanel(item);
        if (item.isDirectory && !e.shiftKey) {
            const wasHidden = !wrapper._childrenContainer || wrapper._childrenContainer.style.display === 'none';
            await toggleNode(wrapper, item, level, row);
            if (wasHidden && typeof triggerTreeMirror === 'function') {
                triggerTreeMirror(item.path);
            }
        } else if (typeof triggerTreeMirror === 'function') {
            triggerTreeMirror(item.path);
        }
    };
    wrapper.appendChild(row);

    if (item.isDirectory) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'node-children';
        childrenContainer.style.display = 'none';
        wrapper.appendChild(childrenContainer);
        wrapper._childrenContainer = childrenContainer;
        wrapper._loaded = false;
    }
    return wrapper;
}

async function toggleNode(wrapper, item, level, rowElement) {
    const container = wrapper._childrenContainer;
    if (!container) return;
    if (wrapper._loadingPromise) {
        return wrapper._loadingPromise;
    }
    const isHidden = container.style.display === 'none';
    const arrowSpan = rowElement.querySelector('.tree-arrow') || rowElement.querySelector('span');

    if (arrowSpan) arrowSpan.innerHTML = isHidden ? '▼' : '▶';

    if (isHidden) {
        container.style.display = 'block';
        setPathExpanded(item.path, true);

        if (!wrapper._loaded) {
            container.innerHTML = `<div style="padding-left:${(level + 1) * 20 + 10}px; color:#666;">Cargando...</div>`;
            wrapper._loadingPromise = (async () => {
                try {
                    const data = await fetchDir(item.path);
                    container.innerHTML = "";
                    const allDiskItems = (data && data.items) ? data.items : [];
                    const decoratedItems = await getDecoratedTreeItems(item.path, allDiskItems, allDiskItems);
                    const containerId = wrapper._containerId || ((wrapper.closest && wrapper.closest('#tree-work')) ? 'tree-work' : 'tree-media');
                    const filteredItems = (typeof window.filterExplorerItems === 'function')
                        ? window.filterExplorerItems(decoratedItems, containerId, item.path, allDiskItems)
                        : decoratedItems;
                    const finalItems = (typeof collapseImageSequences === 'function')
                        ? collapseImageSequences(filteredItems)
                        : filteredItems;

                    if (finalItems.length === 0) {
                        const emptyChildMsg = window.explorerOnlyMyTasks
                            ? `<div style="padding-left:${(level + 1) * 20 + 10}px; color:#666; font-size:0.8rem; font-style:italic;">(Sin tareas asignadas en esta carpeta)</div>`
                            : `<div style="padding-left:${(level + 1) * 20 + 10}px; color:#555; font-size:0.8rem; font-style:italic;">(Carpeta vacía)</div>`;
                        container.innerHTML = emptyChildMsg;
                    } else {
                        const fragment = document.createDocumentFragment();
                        const assignedSet = (window.explorerOnlyMyTasks && typeof window.getExplorerAssignedTaskNames === 'function')
                            ? window.getExplorerAssignedTaskNames()
                            : new Set();

                        const nodesToExpand = [];
                        for (const child of finalItems) {
                            const node = createTreeNode(child, level + 1, containerId);
                            fragment.appendChild(node);

                            const normChildPath = child.path.replace(/\\/g, '/').toLowerCase();
                            const childNameLower = (child.name || '').toLowerCase();
                            // Auto-expandir carpetas intermedias en la ruta hacia la tarea, deteniéndose en la tarea asignada
                            const isTargetTask = assignedSet.has(childNameLower);
                            const shouldAutoExpandChild = window.explorerOnlyMyTasks && !isTargetTask && finalItems.length <= 2;

                            if (child.isDirectory && (isPathExpanded(normChildPath) || shouldAutoExpandChild)) {
                                nodesToExpand.push({ node, child });
                            }
                        }
                        container.appendChild(fragment);
                        for (const { node, child } of nodesToExpand) {
                            await toggleNode(node, child, level + 1, node.querySelector('.tree-node'));
                        }
                    }
                    wrapper._loaded = true;
                } catch (err) {
                    console.error("Error al desplegar nodo:", err);
                    container.innerHTML = `<div style="padding-left:${(level + 1) * 20 + 10}px; color:#e06c75; font-size:0.8rem;">(Error al cargar carpeta)</div>`;
                    wrapper._loaded = false;
                } finally {
                    wrapper._loadingPromise = null;
                }
            })();
            await wrapper._loadingPromise;
        }
    } else {
        container.style.display = 'none';
        setPathExpanded(item.path, false);
    }
}

async function updateDetailsPanel(item) {
    const lbl = document.getElementById('selectionName');
    if (lbl) lbl.innerText = item.name;
    const pathDisplay = document.getElementById('selectionPath');
    if (pathDisplay) pathDisplay.innerText = item.path;

    // --- METADATA DISPLAY ---
    const panel = document.getElementById('toolsPanel-Browser');
    if (!panel) return;

    // Clear previous metadata section if exists
    const existingMeta = document.getElementById('prop-metadata-section');
    if (existingMeta) existingMeta.remove();

    if (item.isSequence) {
        const seqSection = document.createElement('div');
        seqSection.id = 'prop-metadata-section';
        seqSection.className = 'prop-section';
        const sizeMb = item.size ? (item.size / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB';
        seqSection.innerHTML = `
            <div class="prop-row" style="margin-top:10px;">
                <span class="prop-label">Tipo:</span>
                <span style="color:#88c0d0; font-weight:bold;">🎞️ Secuencia de Imágenes</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">Frames:</span>
                <span style="color:#ebcb8b; font-weight:bold;">${item.frameCount} frames</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">Rango:</span>
                <span style="font-family:monospace;">${item.startFrame} ➔ ${item.endFrame}</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">Tamaño Total:</span>
                <span style="font-family:monospace;">${sizeMb}</span>
            </div>
        `;
        panel.appendChild(seqSection);
        return;
    }

    if (window.viewLocationMode === 'server' || item.isServer) {
        const infoSection = document.createElement('div');
        infoSection.id = 'prop-metadata-section';
        infoSection.className = 'prop-section';
        const sizeStr = item.size ? (typeof _formatSize === 'function' ? _formatSize(item.size) : item.size + ' B') : (item.isDirectory ? 'Carpeta' : '-');
        infoSection.innerHTML = `
            <div class="prop-row" style="margin-top:10px;">
                <span class="prop-label">Origen:</span>
                <span style="color:#a3be8c; font-weight:bold;">🗄️ Servidor Central (Catálogo)</span>
            </div>
            <div class="prop-row">
                <span class="prop-label">Tipo:</span>
                <span style="color:#d8dee9;">${item.isDirectory ? 'Carpeta remota' : 'Archivo remoto'}</span>
            </div>
            ${item.size ? `<div class="prop-row"><span class="prop-label">Tamaño:</span><span style="font-family:monospace;">${sizeStr}</span></div>` : ''}
        `;
        panel.appendChild(infoSection);
        return;
    }
}

// --- PROPIEDADES PANEL COLLAPSE / EXPAND ---
function togglePropertiesPanel(forceState) {
    const panel = document.getElementById('toolsPanel-Browser');
    const tab = document.getElementById('propertiesPanelExpandTab');
    if (!panel) return;

    let willBeVisible;
    if (typeof forceState === 'boolean') {
        willBeVisible = forceState;
    } else {
        willBeVisible = panel.classList.contains('collapsed');
    }

    if (willBeVisible) {
        panel.classList.remove('collapsed');
        if (tab) tab.style.display = 'none';
        window.isPropertiesPanelVisible = true;
    } else {
        panel.classList.add('collapsed');
        if (tab) tab.style.display = 'flex';
        window.isPropertiesPanelVisible = false;
    }

    try {
        localStorage.setItem('pipeta_properties_panel_visible', willBeVisible ? 'true' : 'false');
    } catch (e) {}

    // Update toolbar button if present
    const btn = document.getElementById('btnTogglePropertiesToolbar');
    if (btn) {
        if (willBeVisible) {
            btn.classList.add('active');
            const img = btn.querySelector('img');
            if (img) img.style.opacity = '1';
        } else {
            btn.classList.remove('active');
            const img = btn.querySelector('img');
            if (img) img.style.opacity = '0.4';
        }
    }
}

function initPropertiesPanelState() {
    try {
        const saved = localStorage.getItem('pipeta_properties_panel_visible');
        if (saved === 'true') {
            togglePropertiesPanel(true);
        } else {
            togglePropertiesPanel(false);
        }
    } catch (e) {
        togglePropertiesPanel(false);
    }
}

window.togglePropertiesPanel = togglePropertiesPanel;
window.initPropertiesPanelState = initPropertiesPanelState;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initPropertiesPanelState());
} else {
    initPropertiesPanelState();
}

window.initProjectCatalog = async function(projName) {
    if (!projName) {
        projName = (typeof settings !== 'undefined' && settings.currentProject)
            ? (settings.currentProject.id || settings.currentProject.name)
            : 'surf_love';
    }

    const btns = document.querySelectorAll('.empty-catalog-card button');
    btns.forEach(b => {
        b.disabled = true;
        b.innerHTML = '⏳ Sincronizando catálogo...';
    });

    try {
        const res = await fetch('/api/sync/catalog/init-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectName: projName })
        }).then(r => r.json());

        if (res && res.success) {
            if (typeof loadActiveProjectSyncCatalog === 'function') {
                await loadActiveProjectSyncCatalog(true);
            }
            if (typeof initBrowser === 'function') {
                await initBrowser();
            }
        } else {
            alert('No se pudo inicializar el catálogo: ' + (res?.error || 'Error desconocido'));
            btns.forEach(b => {
                b.disabled = false;
                b.innerHTML = '⚡ Cargar Catálogo de Proyecto';
            });
        }
    } catch(e) {
        alert('Error al conectar con el servidor: ' + e.message);
        btns.forEach(b => {
            b.disabled = false;
            b.innerHTML = '⚡ Cargar Catálogo de Proyecto';
        });
    }
};

function updateParentFolderBadge(wrapper) {
    if (!wrapper || !wrapper._item || !wrapper._item.isDirectory) return;
    const item = wrapper._item;
    const row = wrapper._row || wrapper.querySelector('.tree-node');
    if (!row) return;

    let remainingPending = 0;
    if (wrapper._childrenContainer && wrapper._loaded) {
        const childBadges = wrapper._childrenContainer.querySelectorAll(':scope > .node-wrapper > .tree-node .sync-badge-action');
        remainingPending = childBadges.length;
    } else if (typeof item.pendingCount === 'number') {
        remainingPending = Math.max(0, item.pendingCount - 1);
        item.pendingCount = remainingPending;
    }

    const badgeContainer = row.querySelector('.sync-badge-action') || row.querySelector('.sync-badge-ok');
    if (remainingPending > 0) {
        const isUp = item.pendingType === 'upload';
        const actionText = isUp ? '⬆️* Subir' : '⬇️* Bajar';
        const targetType = (item.syncStatus === 'matched_server' || item.syncStatus === 'ghost_server') ? 'server' : 'drive';
        const actionCall = isUp ? `requestUploadLocalItem(this.closest('.node-wrapper')._item, event, '${targetType}')` : `requestDownloadGhostItem(this.closest('.node-wrapper')._item, event, '${targetType}')`;
        const newBadge = document.createElement('span');
        newBadge.className = 'sync-badge-action sync-badge-pending-folder';
        newBadge.onclick = (e) => { e.stopPropagation(); eval(actionCall); };
        newBadge.title = `* Esta carpeta contiene ${remainingPending} archivo(s) pendientes de sincronizar`;
        newBadge.innerText = `${actionText} (${remainingPending})`;
        if (badgeContainer) badgeContainer.replaceWith(newBadge);
    } else {
        item.hasPendingSync = false;
        item.pendingCount = 0;
        const okBadge = document.createElement('span');
        okBadge.className = 'sync-badge-ok';
        okBadge.title = '✓ En Local (Sincronizado)';
        okBadge.textContent = '✓';
        if (badgeContainer) badgeContainer.replaceWith(okBadge);
    }
}

async function refreshFolderChildrenInPlace(wrapper, item) {
    const container = wrapper._childrenContainer;
    if (!container) return;

    try {
        const data = await fetchDir(item.path);
        if (data.error) return;

        const allDiskItems = data.items || [];
        const decoratedItems = await getDecoratedTreeItems(item.path, allDiskItems, allDiskItems);
        const containerId = wrapper._containerId || ((wrapper.closest && wrapper.closest('#tree-work')) ? 'tree-work' : 'tree-media');
        const filteredItems = (typeof window.filterExplorerItems === 'function')
            ? window.filterExplorerItems(decoratedItems, containerId, item.path, allDiskItems)
            : decoratedItems;
        const finalItems = (typeof collapseImageSequences === 'function')
            ? collapseImageSequences(filteredItems)
            : filteredItems;

        container.innerHTML = "";
        if (finalItems.length === 0) {
            const emptyChildMsg = window.explorerOnlyMyTasks
                ? `<div style="padding-left:20px; color:#666; font-size:0.8rem; font-style:italic;">(Sin tareas asignadas en esta carpeta)</div>`
                : `<div style="padding-left:20px; color:#555; font-size:0.8rem; font-style:italic;">(Carpeta vacía)</div>`;
            container.innerHTML = emptyChildMsg;
        } else {
            const level = Math.floor(parseInt((wrapper._row?.style?.paddingLeft || '10px').replace('px', ''), 10) / 20);
            const fragment = document.createDocumentFragment();
            for (const child of finalItems) {
                const node = createTreeNode(child, level + 1, containerId);
                fragment.appendChild(node);
            }
            container.appendChild(fragment);

            for (const node of container.children) {
                const childItem = node._item;
                if (childItem && childItem.isDirectory) {
                    const normChildPath = childItem.path.replace(/\\/g, '/').toLowerCase();
                    if (isPathExpanded(normChildPath)) {
                        await toggleNode(node, childItem, level + 1, node.querySelector('.tree-node'));
                    }
                }
            }
        }
        wrapper._loaded = true;
    } catch (err) {
        console.error('[EXPLORER] Error refrescando hijos de carpeta in-place:', err);
    }
}

async function updateTransferredItemsInDOM(order) {
    if (!order || !order.items || order.items.length === 0) return false;
    let anyUpdated = false;

    for (const it of order.items) {
        const targetPath = (it.targetLocalPath || it.localPath || it.path || '').replace(/\\/g, '/');
        if (!targetPath) continue;
        const normTarget = targetPath.toLowerCase();
        const isDir = !!(it.isDir || it.isDirectory);
        let foundNode = false;

        // 1. Nodos del árbol del explorador (Split view)
        const allRows = document.querySelectorAll('.tree-node');
        for (const row of allRows) {
            const p = (row.getAttribute('data-path') || '').replace(/\\/g, '/').toLowerCase();
            if (p === normTarget) {
                anyUpdated = true;
                foundNode = true;
                const wrapper = row.closest('.node-wrapper');
                if (wrapper) {
                    row.classList.remove('sync-ghost');
                    wrapper.classList.remove('sync-ghost-wrapper');

                    if (wrapper._item) {
                        wrapper._item.isGhost = false;
                        wrapper._item.syncStatus = order.transferType === 'server' ? 'matched_server' : 'matched_drive';
                        wrapper._item.hasPendingSync = false;
                        wrapper._item.pendingCount = 0;
                    }

                    const badgeAction = row.querySelector('.sync-badge-action');
                    if (badgeAction) {
                        const okBadge = document.createElement('span');
                        okBadge.className = 'sync-badge-ok';
                        okBadge.title = '✓ En Local (Sincronizado)';
                        okBadge.textContent = '✓';
                        badgeAction.replaceWith(okBadge);
                    }

                    // Si es una carpeta y estaba abierta, refrescar solo sus hijos in-place
                    if (isDir && wrapper._childrenContainer && wrapper._childrenContainer.style.display !== 'none') {
                        await refreshFolderChildrenInPlace(wrapper, wrapper._item || { path: targetPath, isDirectory: true });
                    }

                    // Actualizar insignias de las carpetas padre hacia arriba
                    let parentContainer = row.closest('.node-children');
                    while (parentContainer) {
                        const parentWrapper = parentContainer.closest('.node-wrapper');
                        if (!parentWrapper) break;
                        updateParentFolderBadge(parentWrapper);
                        parentContainer = parentWrapper.parentElement?.closest('.node-children');
                    }
                }
            }
        }

        // Si el archivo específico no estaba en el DOM (ej. descargado dentro de una carpeta ya abierta)
        if (!foundNode) {
            const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
            const normParent = parentPath.toLowerCase();
            for (const row of allRows) {
                const p = (row.getAttribute('data-path') || '').replace(/\\/g, '/').toLowerCase();
                if (p === normParent) {
                    const wrapper = row.closest('.node-wrapper');
                    if (wrapper && wrapper._childrenContainer && wrapper._childrenContainer.style.display !== 'none') {
                        await refreshFolderChildrenInPlace(wrapper, wrapper._item || { path: parentPath, isDirectory: true });
                        anyUpdated = true;
                        updateParentFolderBadge(wrapper);
                        let parentContainer = row.closest('.node-children');
                        while (parentContainer) {
                            const parentWrapper = parentContainer.closest('.node-wrapper');
                            if (!parentWrapper) break;
                            updateParentFolderBadge(parentWrapper);
                            parentContainer = parentWrapper.parentElement?.closest('.node-children');
                        }
                    }
                    break;
                }
            }
        }

        // 2. Bloques de vista Miller Columns (Pipeta view)
        const allBlocks = document.querySelectorAll('.pipeta-block');
        for (const block of allBlocks) {
            const p = (block.getAttribute('data-path') || '').replace(/\\/g, '/').toLowerCase();
            if (p === normTarget) {
                anyUpdated = true;
                block.classList.remove('sync-ghost');
                const badgeAction = block.querySelector('.sync-badge-action');
                if (badgeAction) {
                    const okSpan = document.createElement('span');
                    okSpan.className = 'sync-badge-ok';
                    okSpan.style.marginLeft = '8px';
                    okSpan.textContent = '✓';
                    badgeAction.replaceWith(okSpan);
                }
            }
        }
    }

    return anyUpdated;
}

window.updateParentFolderBadge = updateParentFolderBadge;
window.refreshFolderChildrenInPlace = refreshFolderChildrenInPlace;
window.updateTransferredItemsInDOM = updateTransferredItemsInDOM;

