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

async function getDecoratedTreeItems(dirPath, rawItems) {
    const mode = window.viewLocationMode || 'local';
    const compMode = window.syncComparisonMode || 'off';
    const normDirPath = (dirPath || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

    // 1. Si estamos en LOCAL y la comparación está apagada (OFF), retornar inmediatamente sin catálogo
    if (mode === 'local' && compMode === 'off') {
        return (rawItems || []).map(i => ({ ...i }));
    }

    const decorated = [];
    const localNames = new Set((rawItems || []).map(i => i.name.toLowerCase()));

    // 2. COMPARACIÓN LOCAL vs GOOGLE DRIVE
    if (mode === 'local' && compMode === 'drive') {
        if (typeof loadActiveProjectSyncCatalog === 'function' && !window.pipetaSyncCatalog) {
            await loadActiveProjectSyncCatalog();
        }

        const catalogChildren = window.pipetaSyncCatalogLookup?.byParentLocalPath?.get(normDirPath) || [];
        const catalogMap = new Map(catalogChildren.map(c => [c.name.toLowerCase(), c]));

        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            const catItem = catalogMap.get(item.name.toLowerCase());
            if (catItem) {
                itemCopy.syncStatus = 'matched_drive';
                itemCopy.onlinePath = catItem.onlinePath;
                itemCopy.targetLocalPath = catItem.targetLocalPath;
            } else {
                itemCopy.syncStatus = 'upload_drive';
                itemCopy.targetLocalPath = item.path;
            }
            decorated.push(itemCopy);
        }

        // Inyectar nodos FANTASMA (están en Drive pero faltan en Local Z)
        for (const catItem of catalogChildren) {
            if (!localNames.has(catItem.name.toLowerCase())) {
                decorated.push({
                    name: catItem.name,
                    isDirectory: !!catItem.isDir,
                    path: catItem.targetLocalPath,
                    isGhost: true,
                    size: catItem.size || 0,
                    onlinePath: catItem.onlinePath,
                    targetLocalPath: catItem.targetLocalPath,
                    syncStatus: 'ghost_drive'
                });
            }
        }
    } 
    // 3. COMPARACIÓN LOCAL vs SERVIDOR CENTRAL REAL (S:)
    else if (mode === 'local' && compMode === 'server') {
        const serverPrefix = (typeof settings !== 'undefined' && settings.centralServerPath) 
            ? settings.centralServerPath.replace(/\/+$/, '') 
            : 'S:';
        const serverFolder = dirPath.replace(/^Z:/i, serverPrefix);

        let serverItems = [];
        try {
            const sData = await fetchDir(serverFolder);
            if (sData && sData.items && !sData.error) {
                serverItems = sData.items;
            }
        } catch (e) {}

        const serverNames = new Map(serverItems.map(s => [s.name.toLowerCase(), s]));

        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            const sMatch = serverNames.get(item.name.toLowerCase());
            itemCopy.targetLocalPath = item.path;
            itemCopy.serverPath = item.path.replace(/^Z:/i, serverPrefix);

            if (sMatch) {
                itemCopy.syncStatus = 'matched_server';
            } else {
                itemCopy.syncStatus = 'upload_server';
            }
            decorated.push(itemCopy);
        }

        // Inyectar nodos FANTASMA del Server (están en S: pero faltan en Z:)
        for (const sItem of serverItems) {
            if (!localNames.has(sItem.name.toLowerCase())) {
                const targetLocal = sItem.path.replace(new RegExp('^' + serverPrefix, 'i'), 'Z:');
                decorated.push({
                    name: sItem.name,
                    isDirectory: !!sItem.isDirectory,
                    path: targetLocal,
                    isGhost: true,
                    size: sItem.size || 0,
                    serverPath: sItem.path,
                    targetLocalPath: targetLocal,
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
            let localTarget = item.path;
            const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
            if (proj?.roots) {
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

            const normTarget = itemCopy.targetLocalPath.toLowerCase();
            const inLocal = window.pipetaSyncCatalogLookup?.byLocalPath?.has(normTarget);
            itemCopy.syncStatus = inLocal ? 'matched_drive' : 'ghost_drive';
            decorated.push(itemCopy);
        }
    }
    // 5. MODO EXPLORACIÓN DIRECTA DE SERVER CENTRAL
    else if (mode === 'server') {
        const serverPrefix = (typeof settings !== 'undefined' && settings.centralServerPath) 
            ? settings.centralServerPath.replace(/\/+$/, '') 
            : 'S:';

        for (const item of (rawItems || [])) {
            const itemCopy = { ...item };
            itemCopy.serverPath = item.path;
            itemCopy.targetLocalPath = item.path.replace(new RegExp('^' + serverPrefix, 'i'), 'Z:');

            // Consultar si existe en local
            const normTarget = itemCopy.targetLocalPath.toLowerCase();
            const inLocal = window.pipetaSyncCatalogLookup?.byLocalPath?.has(normTarget);
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

    // Cargar catálogo solo si explícitamente se requiere para Drive
    if ((mode === 'drive' || (mode === 'local' && compMode === 'drive')) && !window.pipetaSyncCatalog) {
        if (typeof loadActiveProjectSyncCatalog === 'function') {
            await loadActiveProjectSyncCatalog();
        }
    }

    const data = await fetchDir(rootPath);
    if (!data.error) {
        container.innerHTML = "";
        const rawItems = data.items || [];
        let itemsToRender = rawItems;

        // Apply filter if active and it's the project tree
        if (window.pipetaUseFilter && containerId === 'tree-work') {
            const filterList = window.pipetaFilterList;
            itemsToRender = rawItems.filter(i => {
                return filterList.some(w => i.name.toLowerCase() === w.toLowerCase());
            });
        }

        const decoratedItems = await getDecoratedTreeItems(rootPath, itemsToRender);

        if (decoratedItems.length === 0) {
            container.innerHTML = `<div style="padding:10px; color:#666; font-style:italic;">Carpeta vacía o sin elementos</div>`;
            return;
        }

        for (const item of decoratedItems) {
            const node = createTreeNode(item, 0);
            container.appendChild(node);

            const normPath = item.path.replace(/\\/g, '/').toLowerCase();
            if (item.isDirectory && expandedPaths.has(normPath)) {
                await toggleNode(node, item, 0, node.querySelector('.tree-node'));
            }
        }
    } else {
        container.innerHTML = `<div style="color:red; padding:10px;">Error: ${data.error}</div>`;
    }
}

function createTreeNode(item, level) {
    const wrapper = document.createElement('div');
    wrapper.className = 'node-wrapper' + (item.isGhost ? ' sync-ghost-wrapper' : '');
    wrapper._item = item;

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

    const icon = item.isDirectory ? '📁' : '📄';
    const arrow = item.isDirectory ? `<span class="tree-arrow" style="font-size:0.7em; color:#666; margin-right:4px;">▶</span>` : '';

    // Insignias de Sincronización explícitas y transparentes
    let badgeHtml = '';
    const status = item.syncStatus;

    if (status === 'matched_drive') {
        badgeHtml = `<span class="sync-badge-ok" title="✓ En Local (Sincronizado con Google Drive)">✓</span>`;
    } else if (status === 'matched_server') {
        badgeHtml = `<span class="sync-badge-ok" title="✓ En Local (Idéntico en Servidor Central S:)">✓</span>`;
    } else if (status === 'upload_drive') {
        const dest = item.onlinePath || 'Google Drive';
        badgeHtml = `<span class="sync-badge-action sync-badge-upload" onclick="event.stopPropagation(); requestUploadLocalItem(this.closest('.node-wrapper')._item, event, 'drive')" title="Subir a Google Drive (${dest})">⬆️ Subir a Drive</span>`;
    } else if (status === 'upload_server') {
        const dest = item.serverPath || 'S:';
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
            const rawItems = (data && data.items) ? data.items : [];
            const decoratedItems = await getDecoratedTreeItems(item.path, rawItems);

            if (decoratedItems.length === 0) {
                container.innerHTML = `<div style="padding-left:${(level + 1) * 20 + 10}px; color:#555; font-size:0.8rem; font-style:italic;">(Carpeta vacía)</div>`;
            } else {
                for (const child of decoratedItems) {
                    const node = createTreeNode(child, level + 1);
                    container.appendChild(node);

                    const normChildPath = child.path.replace(/\\/g, '/').toLowerCase();
                    if (child.isDirectory && expandedPaths.has(normChildPath)) {
                        await toggleNode(node, child, level + 1, node.querySelector('.tree-node'));
                    }
                }
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

    if (item.isDirectory) {
        try {
            // Try to read vfx_control.json
            // We use the new API.fs.readFile which returns content string or null
            // Note: vfx_control.json path
            const metaPath = item.path + "/vfx_control.json";

            // We need to implement a quiet read that doesn't log error to console if file missing
            // But API.fs.readFile logs error. That is fine for now or we can improve API.
            const content = await API.fs.readFile(metaPath);

            // Race Check: Ensure selection hasn't changed
            if (document.getElementById('selectionPath').innerText !== item.path) return;

            // Store context for repair buttons (avoids HTML attribute escaping issues)
            window._inspectorCtx = {
                path: item.path,
                name: item.name,
                presetId: null,
                missing: []
            };

            if (content) {
                let meta = null;
                try { meta = JSON.parse(content); } catch (e) { }

                if (meta) {
                    const dateStr = meta.creation_date ? new Date(meta.creation_date).toLocaleString() : '-';

                    // --- INTEGRITY CHECK (WITH METADATA) ---
                    let integrityHTML = '';
                    if (meta.preset_id && window.Inspector) {
                        const report = await window.Inspector.validate(item.path, meta.preset_id, meta);

                        // Build findings HTML
                        const findingsLines = report.findings.map(f => {
                            const icon = f.type === 'ok' ? '✅' : f.type === 'warn' ? '⚠️' : f.type === 'error' ? '❌' : 'ℹ️';
                            const color = f.type === 'ok' ? '#4CAF50' : f.type === 'warn' ? '#FF9800' : f.type === 'error' ? '#f44336' : '#888';
                            return `<div style="display:flex; align-items:center; gap:6px; padding:2px 0;">
                                        <span>${icon}</span>
                                        <span style="font-size:0.8rem; color:${color};">${f.msg}</span>
                                    </div>`;
                        }).join('');

                        // Add JSON present indicator
                        const jsonOk = `<div style="display:flex; align-items:center; gap:6px; padding:2px 0;">
                                            <span>✅</span>
                                            <span style="font-size:0.8rem; color:#4CAF50;">vfx_control.json presente</span>
                                        </div>`;

                        // Repair button if missing folders
                        let repairBtn = '';
                        if (report.missing && report.missing.length > 0) {
                            window._inspectorCtx.missing = report.missing;
                            repairBtn = `<button style="width:100%; border:none; background:#d32f2f; color:white; padding:5px; border-radius:3px; cursor:pointer; margin-top:5px;"
                                                 onclick="Inspector.fixMissing(window._inspectorCtx.path, window._inspectorCtx.missing).then(c => { alert('Reparado: ' + c + ' carpetas.'); updateDetailsPanel({path:window._inspectorCtx.path, name:window._inspectorCtx.name, isDirectory:true}); })">
                                            Reparar Estructura
                                         </button>`;
                        }

                        integrityHTML = `
                            <div style="margin-top:10px; padding:8px; border:1px solid #333; border-radius:4px; background: rgba(255,255,255,0.02);">
                                <div style="font-size:0.7rem; color:#666; margin-bottom:4px; text-transform:uppercase;">Integridad</div>
                                ${findingsLines}
                                ${jsonOk}
                                ${repairBtn}
                            </div>
                        `;
                    }

                    const metaHTML = `
                        <div id="prop-metadata-section" style="margin-top:20px; border-top:1px solid #333; padding-top:10px; animation: fadeIn 0.3s;">
                            <div class="panel-heading" style="padding-left:0; color:var(--accent);">Metadata & Integridad</div>
                            
                            <div class="prop-row">
                                <span class="prop-label">Tipo:</span>
                                <span style="color:#fff;">${meta.node_name || '-'}</span>
                            </div>
                             <div class="prop-row">
                                <span class="prop-label">Creado por:</span>
                                <span style="color:#aaa;">${meta.user || 'System'}</span>
                            </div>
                            <div class="prop-row">
                                <span class="prop-label">Fecha:</span>
                                <span style="color:#aaa; font-size:0.7rem;">${dateStr}</span>
                            </div>
                             <div class="prop-row">
                                <span class="prop-label">Preset ID:</span>
                                <span style="color:#aaa; font-size:0.7rem;">${meta.preset_id || '-'}</span>
                            </div>
                            ${integrityHTML}
                        </div>
                    `;
                    panel.insertAdjacentHTML('beforeend', metaHTML);
                }
            } else {
                // ====== NO METADATA -> AUDIT ======
                if (window.Inspector) {
                    const suggestedId = window.Inspector.guessPresetId(item.path);
                    if (suggestedId) {
                        const report = await window.Inspector.validate(item.path, suggestedId);
                        const presetName = report.presetName || suggestedId;

                        // Build stacked findings
                        const findingsLines = report.findings.map(f => {
                            const icon = f.type === 'ok' ? '✅' : f.type === 'warn' ? '⚠️' : f.type === 'error' ? '❌' : 'ℹ️';
                            const color = f.type === 'ok' ? '#4CAF50' : f.type === 'warn' ? '#FF9800' : f.type === 'error' ? '#f44336' : '#888';
                            return `<div style="display:flex; align-items:center; gap:6px; padding:2px 0;">
                                        <span>${icon}</span>
                                        <span style="font-size:0.8rem; color:${color};">${f.msg}</span>
                                    </div>`;
                        }).join('');

                        // ====== DETERMINE ACTIONS ======
                        const jsonMissing = `<div style="display:flex; align-items:center; gap:6px; padding:2px 0;">
                                                <span>⚠️</span>
                                                <span style="font-size:0.8rem; color:#FF9800;">Falta <code style="background:#333; padding:0 4px; border-radius:3px;">vfx_control.json</code></span>
                                             </div>`;
                        let actionBtn = '';
                        let showJsonMissing = true;

                        // SPECIAL CASE: Invalid category → no JSON button, show delete/move
                        const isInvalidCategory = report.level === 'category' && report.findings.some(f => f.type === 'error');

                        if (isInvalidCategory) {
                            showJsonMissing = false; // categories don't need JSON indicator
                            // Check if folder is empty
                            const dirCheck = await API.fetchDir(item.path);
                            const hasContent = dirCheck && dirCheck.items && dirCheck.items.length > 0;

                            if (!hasContent) {
                                // EMPTY → Delete button
                                actionBtn = `<button style="width:100%; background:#f44336; border:none; color:white; padding:6px; border-radius:4px; font-weight:bold; cursor:pointer; margin-top:6px;"
                                                    onclick="if(confirm('¿Borrar la carpeta vacía \\'${item.name}\\'?')) { API.fs.delete('${item.path.replace(/\\/g, '\\\\')}').then(() => { if(window.loadDirectory) loadDirectory('${item.path.replace(/\\/g, '\\\\').split('\\\\').slice(0, -1).join('\\\\')}'); }); }">
                                                🗑️ Borrar carpeta vacía
                                            </button>`;
                            } else {
                                // HAS CONTENT → Move to valid category
                                const catOptions = (report.expectedCategories || []).map(c =>
                                    `<option value="${c}">${c}</option>`
                                ).join('');

                                actionBtn = `
                                    <div style="margin-top:6px;">
                                        <label style="font-size:0.75rem; color:#aaa;">Mover contenido a:</label>
                                        <select id="inspector-move-target" style="width:100%; background:#222; color:#fff; border:1px solid #555; padding:4px; border-radius:3px; margin:4px 0;">
                                            ${catOptions}
                                        </select>
                                        <button style="width:100%; background:#FF9800; border:none; color:black; padding:6px; border-radius:4px; font-weight:bold; cursor:pointer;"
                                                onclick="
                                                    const target = document.getElementById('inspector-move-target').value;
                                                    if(!target) return;
                                                    const srcPath = '${item.path.replace(/\\/g, '\\\\')}';
                                                    const parentPath = srcPath.substring(0, srcPath.lastIndexOf('\\\\'));
                                                    const destPath = parentPath + '\\\\' + target + '\\\\' + '${item.name}';
                                                    if(confirm('¿Mover \\'${item.name}\\' dentro de \\'' + target + '\\' como asset?')) {
                                                        API.fs.rename(srcPath, destPath).then(r => {
                                                            if(r.error) { alert('Error: ' + r.error); }
                                                            else { alert('Movido correctamente.'); if(window.loadDirectory) loadDirectory(parentPath); }
                                                        });
                                                    }
                                                ">
                                            📦 Mover como asset a categoría
                                        </button>
                                    </div>`;
                            }
                        } else {
                            // NORMAL CASE: Show Oficializar / Reparar
                            window._inspectorCtx.presetId = suggestedId;
                            window._inspectorCtx.missing = report.missing || [];
                            if (report.missing && report.missing.length > 0) {
                                actionBtn = `<button style="width:100%; background:#FF9800; border:none; color:black; padding:6px; border-radius:4px; font-weight:bold; cursor:pointer; margin-top:6px;"
                                                    onclick="if(confirm('Se crearán las carpetas faltantes y el archivo de control. ¿Seguir?')) { var c=window._inspectorCtx; Inspector.fixMissing(c.path, c.missing).then(function(){ return Inspector.injectMetadata(c.path, c.presetId, 'PipetaFix'); }).then(function(){ updateDetailsPanel({path:c.path, name:c.name, isDirectory:true}); }); }">
                                                🛠️ Reparar y Oficializar
                                            </button>`;
                            } else {
                                actionBtn = `<button style="width:100%; background:#FF9800; border:none; color:black; padding:6px; border-radius:4px; font-weight:bold; cursor:pointer; margin-top:6px;"
                                                    onclick="var c=window._inspectorCtx; Inspector.injectMetadata(c.path, c.presetId, 'PipetaAudit').then(function(){ updateDetailsPanel({path:c.path, name:c.name, isDirectory:true}); })">
                                                📋 Oficializar (Crear JSON)
                                            </button>`;
                            }
                        }

                        const auditHTML = `
                            <div id="prop-metadata-section" style="margin-top:20px; border-top:1px solid #333; padding-top:10px; animation: fadeIn 0.3s;">
                                <div class="panel-heading" style="padding-left:0; color:#888;">Auditoría Estructural</div>
                                <div style="padding:8px; border:1px solid #333; border-radius:4px; background: rgba(255,255,255,0.02);">
                                    ${findingsLines}
                                    ${showJsonMissing ? jsonMissing : ''}
                                    ${actionBtn}
                                </div>
                            </div>
                        `;
                        panel.insertAdjacentHTML('beforeend', auditHTML);
                    }
                }
            }
        } catch (e) {
            console.error("Inspector panel error:", e);
        }
    }
}
