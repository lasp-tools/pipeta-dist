// ------------------------------------------
// --- STANDARD SPLIT BROWSER (TREE) ---
// ------------------------------------------

// Persistence State
const expandedPaths = new Set();

async function initBrowser() {
    const roots = getCurrentRoots();
    const mode = window.viewLocationMode || 'local';
    const modeLabel = mode === 'drive' ? '☁️ DRIVE' : (mode === 'server' ? '🗄️ SERVER' : '💻 LOCAL');

    // Pre-cargar catálogo de sincronización
    if (typeof loadActiveProjectSyncCatalog === 'function') {
        await loadActiveProjectSyncCatalog();
    }

    // Set Header Labels
    const workLabel = document.getElementById('label-work-path');
    const mediaLabel = document.getElementById('label-media-path');
    if (workLabel) workLabel.innerHTML = `<span style="font-size:0.7rem; background:#1c2430; color:#88c0d0; padding:1px 5px; border-radius:3px; margin-right:6px;">${modeLabel}</span>${roots.work}`;
    if (mediaLabel) mediaLabel.innerHTML = `<span style="font-size:0.7rem; background:#1c2430; color:#88c0d0; padding:1px 5px; border-radius:3px; margin-right:6px;">${modeLabel}</span>${roots.media}`;

    await loadRootTree(roots.work, 'tree-work');
    await loadRootTree(roots.media, 'tree-media');

    // Calculate folder sizes (async, non-blocking)
    if (typeof updateFolderSizes === 'function') updateFolderSizes();
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
        if (catalogChildren.length === 0) {
            if (typeof loadActiveProjectSyncCatalog === 'function' && !window.pipetaSyncCatalog) {
                await loadActiveProjectSyncCatalog();
            }
            catalogChildren = window.pipetaSyncCatalogLookup?.byParentLocalPath?.get(normDirPath) || [];
        }

        const catalogMap = new Map(catalogChildren.map(c => [c.name.toLowerCase(), c]));

        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            const catItem = catalogMap.get(item.name.toLowerCase());
            if (catItem) {
                itemCopy.syncStatus = 'matched_drive';
                itemCopy.onlinePath = catItem.onlinePath || catItem.path;
                itemCopy.targetLocalPath = catItem.targetLocalPath || item.path;
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
        if (typeof loadActiveProjectSyncCatalog === 'function' && !window.pipetaSyncCatalog) {
            await loadActiveProjectSyncCatalog();
        }

        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            let localTarget = item.targetLocalPath || item.path;
            const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
            if (!item.targetLocalPath && proj?.roots) {
                const oWork = (proj.roots.onlineWork || '').replace(/\\/g, '/');
                const oMedia = (proj.roots.onlineMedia || '').replace(/\\/g, '/');
                if (oWork && localTarget.toLowerCase().startsWith(oWork.toLowerCase())) {
                    localTarget = proj.roots.work + localTarget.substring(oWork.length);
                } else if (oMedia && localTarget.toLowerCase().startsWith(oMedia.toLowerCase())) {
                    localTarget = proj.roots.media + localTarget.substring(oMedia.length);
                }
            }
            itemCopy.targetLocalPath = localTarget.replace(/\\/g, '/');
            itemCopy.onlinePath = item.path;

            let inLocal = false;
            if (typeof item.localExists === 'boolean') {
                inLocal = item.localExists;
            } else {
                const normTarget = itemCopy.targetLocalPath.toLowerCase();
                inLocal = window.pipetaSyncCatalogLookup?.byLocalPath?.has(normTarget);
            }

            itemCopy.syncStatus = inLocal ? 'matched_drive' : 'ghost_drive';
            decorated.push(itemCopy);
        }
    }
    // 5. MODO EXPLORACIÓN DE SERVER CENTRAL (Catálogo)
    else if (mode === 'server') {
        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            itemCopy.serverPath = item.path;
            itemCopy.targetLocalPath = item.path;

            // Consultar si existe en local
            const normTarget = itemCopy.targetLocalPath.toLowerCase();
            const inLocal = window.pipetaServerCatalogLookup?.byLocalPath?.has(normTarget);
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

async function loadRootTree(rootPath, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div style="padding:10px; color:#666;">Cargando...</div>`;

    const mode = window.viewLocationMode || 'local';
    const compMode = window.syncComparisonMode || 'off';

    // Cargar catálogo si explícitamente se requiere para Drive o Server
    if ((mode === 'drive' || mode === 'server' || compMode === 'drive' || compMode === 'server') && (!window.pipetaSyncCatalog || !window.pipetaServerCatalog)) {
        if (typeof loadActiveProjectSyncCatalog === 'function') {
            await loadActiveProjectSyncCatalog();
        }
    }

    const data = await fetchDir(rootPath);
    if (!data.error) {
        container.innerHTML = "";
        const allDiskItems = data.items || [];
        const decoratedItems = await getDecoratedTreeItems(rootPath, allDiskItems, allDiskItems);
        const filteredItems = (typeof window.filterExplorerItems === 'function')
            ? window.filterExplorerItems(decoratedItems, containerId, rootPath, allDiskItems)
            : decoratedItems;
        const finalItems = (typeof collapseImageSequences === 'function') 
            ? collapseImageSequences(filteredItems) 
            : filteredItems;

        if (finalItems.length === 0) {
            container.innerHTML = `<div style="padding:10px; color:#666; font-style:italic;">Carpeta vacía o sin elementos</div>`;
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
                if (expandedPaths.has(normPath)) {
                    await toggleNode(node, item, 0, node.querySelector('.tree-node'));
                }
            }
        }
    } else {
        container.innerHTML = `<div style="color:red; padding:10px;">Error: ${data.error}</div>`;
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
        badgeHtml = `<span class="sync-badge-ok" title="✓ En Local (Sincronizado con Google Drive)">✓</span>`;
    } else if (status === 'matched_server') {
        badgeHtml = `<span class="sync-badge-ok" title="✓ En Local (Idéntico en Servidor Central)">✓</span>`;
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
        if (item.isDirectory && !e.shiftKey) toggleNode(wrapper, item, level, row);

        if (typeof triggerTreeMirror === 'function') {
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
    const isHidden = container.style.display === 'none';
    const arrowSpan = rowElement.querySelector('.tree-arrow') || rowElement.querySelector('span');

    if (arrowSpan) arrowSpan.innerHTML = isHidden ? '▼' : '▶';

    if (isHidden) {
        container.style.display = 'block';
        expandedPaths.add(item.path.replace(/\\/g, '/').toLowerCase());

        if (!wrapper._loaded) {
            container.innerHTML = `<div style="padding-left:${(level + 1) * 20 + 10}px; color:#666;">Cargando...</div>`;
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
                container.innerHTML = `<div style="padding-left:${(level + 1) * 20 + 10}px; color:#555; font-size:0.8rem; font-style:italic;">(Carpeta vacía)</div>`;
            } else {
                const fragment = document.createDocumentFragment();
                for (const child of finalItems) {
                    const node = createTreeNode(child, level + 1, containerId);
                    fragment.appendChild(node);

                    const normChildPath = child.path.replace(/\\/g, '/').toLowerCase();
                    if (child.isDirectory && expandedPaths.has(normChildPath)) {
                        await toggleNode(node, child, level + 1, node.querySelector('.tree-node'));
                    }
                }
                container.appendChild(fragment);
            }
            wrapper._loaded = true;
        }
    } else {
        container.style.display = 'none';
        expandedPaths.delete(item.path.replace(/\\/g, '/').toLowerCase());
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
