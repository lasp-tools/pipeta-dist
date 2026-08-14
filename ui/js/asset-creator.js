// ------------------------------------------
// --- ASSET CREATOR MODULE ---
// ------------------------------------------

const AssetCreator = {
    isVisible: false,
    container: null,
    currentContext: { client: null, project: null, category: null, valid: false },
    categoryNodes: [],
    processNodes: [],
    presets: [],
    selectedPreset: null,
    presetsPath: "C:\\TOOLS\\APPS\\Pipeta\\presets\\AssetDesigner",
    systemInfo: { username: "unknown" },

    // Batch Mode State
    mode: 'create', // 'create' | 'batch'
    injectionScope: 'explorer',
    createVersionZero: false,
    foundAssets: [],
    selectedAssets: [],

    switchMode: (newMode) => {
        AssetCreator.mode = newMode;
        if (newMode === 'batch') {
            AssetCreator.loadAssetsForCategory();
        }
        AssetCreator.render();
    },

    handleSelectionChange: (path) => {
        if (!AssetCreator.isVisible) return;

        // Always refresh validation logic in background
        AssetCreator.resolveContext(path || "");

        // If in Batch Mode, re-load assets based on new selection
        if (AssetCreator.mode === 'batch') {
            AssetCreator.loadAssetsForCategory();
        } else {
            // In Create Mode, update context display
            AssetCreator.render();
        }
    },

    setInjectionScope: (newScope) => {
        AssetCreator.injectionScope = newScope;
        AssetCreator.loadAssetsForCategory(); // Refresh selection logic
    },

    loadAssetsForCategory: async () => {
        const ctx = AssetCreator.currentContext;
        // Priority: Dropdown Category > Context Category
        let targetCategoryNode = null;
        const catSelect = document.getElementById('ac-category-select');
        if (catSelect && catSelect.value) {
            targetCategoryNode = AssetCreator.categoryNodes.find(n => n.id === catSelect.value);
        } else {
            targetCategoryNode = ctx.category;
        }

        if (!targetCategoryNode) return;

        let path = null;
        let basePath = (typeof selectedContextPath !== 'undefined' && selectedContextPath)
            ? selectedContextPath.replace(/\\/g, '/')
            : (ctx.resolvedPath || "");

        // Robust Path Finding (Anchor to Assets Root)
        if (basePath) {
            const lower = basePath.toLowerCase();
            const idx = lower.lastIndexOf('/assets');

            if (idx !== -1) {
                // Found /assets anchor
                // Example: Z:/Proj/Assets/Characters/Bob -> Z:/Proj/Assets/Characters
                path = basePath.substring(0, idx + 7) + "/" + targetCategoryNode.name;
            } else if (ctx.isRoot) {
                // At Project Root -> Append /assets/Category
                path = basePath + "/assets/" + targetCategoryNode.name;
            } else {
                // Fallback: Best effort relative path
                path = basePath + "/assets/" + targetCategoryNode.name;
            }
        }

        if (path) {
            AssetCreator.foundAssets = [];
            AssetCreator.selectedAssets = [];
            try {
                if (window.API && API.fetchDir) {
                    const data = await API.fetchDir(path);
                    if (data && data.items) {
                        AssetCreator.foundAssets = data.items.filter(i => i.isDirectory).map(i => ({
                            name: i.name,
                            path: i.path
                        }));

                        // PRE-SELECTION LOGIC
                        if (AssetCreator.foundAssets.length > 0) {
                            // Check if current path (basePath) matches one of these assets or is inside one
                            const currentPath = basePath.toLowerCase();

                            // Find specific asset
                            const match = AssetCreator.foundAssets.find(a => {
                                const aPath = a.path.replace(/\\/g, '/').toLowerCase();
                                return currentPath === aPath || currentPath.startsWith(aPath + '/');
                            });

                            if (AssetCreator.injectionScope === 'explorer') {
                                if (match) AssetCreator.selectedAssets = [match.path];
                                else AssetCreator.selectedAssets = [];
                            } else {
                                AssetCreator.selectedAssets = AssetCreator.foundAssets.map(a => a.path);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("Error loading assets", e);
            }
            AssetCreator.render();
        }
    },

    toggleSelectAll: () => {
        if (AssetCreator.selectedAssets.length === AssetCreator.foundAssets.length) {
            AssetCreator.selectedAssets = [];
        } else {
            AssetCreator.selectedAssets = AssetCreator.foundAssets.map(a => a.path);
        }
        AssetCreator.render();
    },

    toggleAssetSelection: (path) => {
        const idx = AssetCreator.selectedAssets.indexOf(path);
        if (idx === -1) AssetCreator.selectedAssets.push(path);
        else AssetCreator.selectedAssets.splice(idx, 1);
        AssetCreator.render();
    },

    renderAssetList: () => {
        let assetsToShow = AssetCreator.foundAssets;

        if (AssetCreator.injectionScope === 'explorer') {
            // Show only selected ones
            assetsToShow = AssetCreator.foundAssets.filter(a => AssetCreator.selectedAssets.includes(a.path));
        }

        if (assetsToShow.length === 0) {
            if (AssetCreator.injectionScope === 'explorer') {
                return `<div style="padding:10px; color:#aaa; font-style:italic; text-align:center;">Ningún asset seleccionado.<br><span style="font-size:0.8rem; color:#666;">Selecciona una carpeta dentro de la categoría.</span></div>`;
            }
            return `<div style="padding:10px; color:#666; font-style:italic; text-align:center;">No se encontraron assets en esta categoría.</div>`;
        }

        return assetsToShow.map(asset => `
            <div style="display:flex; align-items:center; padding:4px; border-bottom:1px solid #222; hover:background:#222;">
                <input type="checkbox" 
                       id="chk-asset-${asset.name.replace(/[^a-zA-Z0-9]/g, '_')}" 
                       ${AssetCreator.selectedAssets.includes(asset.path) ? 'checked' : ''} 
                       onchange="AssetCreator.toggleAssetSelection('${asset.path.replace(/\\/g, '\\\\')}')"
                       style="margin-right:8px; accent-color:var(--accent);">
                <label for="chk-asset-${asset.name.replace(/[^a-zA-Z0-9]/g, '_')}" style="cursor:pointer; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.9rem; color:#ffffff; font-weight:bold;">${asset.name}</label>
            </div>
        `).join('');
    },

    init: async () => {
        AssetCreator.container = document.getElementById('asset-creator-window');
        if (!AssetCreator.container) {
            console.error("AssetCreator: Container #asset-creator-window not found.");
            return;
        }
        if (window.API && API.system) {
            AssetCreator.systemInfo = await API.system.getInfo();
        }
        await AssetCreator.loadPresets();
        AssetCreator.render();
    },

    loadPresets: async () => {
        AssetCreator.presets = [];
        try {
            if (window.API && API.fs && API.fs.getFiles) {
                const files = await API.fs.getFiles(AssetCreator.presetsPath);
                for (const f of files) {
                    if (f.endsWith('.json')) {
                        const content = await API.fs.readFile(AssetCreator.presetsPath + "\\" + f);
                        if (content) {
                            try {
                                const preset = JSON.parse(content);
                                AssetCreator.presets.push(preset);
                            } catch (e) {
                                console.error("Error parsing preset:", f, e);
                            }
                        }
                    }
                }
            }

            // Restore last selected preset
            const lastId = localStorage.getItem('pipeta_ac_last_preset');
            if (lastId) {
                const found = AssetCreator.presets.findIndex(p => p.id === lastId);
                if (found !== -1) {
                    AssetCreator.selectPreset(found);
                }
            }

        } catch (e) {
            console.error("AssetCreator: Error loading presets", e);
        }
    },

    open: async () => {
        if (!AssetCreator.container) await AssetCreator.init();
        await AssetCreator.loadPresets(); // Re-load or just ensure loaded

        // Resolve context immediately upon opening
        AssetCreator.resolveContext();

        AssetCreator.isVisible = true;
        AssetCreator.container.style.display = 'flex';
        AssetCreator.render();
    },

    close: () => {
        AssetCreator.isVisible = false;
        if (AssetCreator.container) {
            AssetCreator.container.style.display = 'none';
        }
    },

    selectPreset: (index) => {
        if (index === "" || index === null) {
            AssetCreator.selectedPreset = null;
        } else {
            AssetCreator.selectedPreset = AssetCreator.presets[index];
            AssetCreator.analyzePreset(AssetCreator.selectedPreset);
            // Save persistence
            if (AssetCreator.selectedPreset) {
                localStorage.setItem('pipeta_ac_last_preset', AssetCreator.selectedPreset.id);
            }
        }
        AssetCreator.render();
    },

    analyzePreset: (preset) => {
        if (!preset || !preset.nodes) return;

        // 1. Find Categories
        AssetCreator.categoryNodes = preset.nodes.filter(n => n.isCategory);

        // 2. Find Asset Root and Processes
        const assetNode = preset.nodes.find(n => n.isAssetFocus || n.name === 'ASSET');
        AssetCreator.processNodes = [];
        if (assetNode) {
            // Processes are children of Asset Node
            AssetCreator.processNodes = preset.nodes.filter(n => n.parent === assetNode.id && n.type !== 'file');
        }

        // 3. Re-Resolve context with new preset
        AssetCreator.resolveContext();
    },

    resolveContext: () => {
        AssetCreator.currentContext = { client: null, project: null, category: null, valid: false, resolvedPath: null, isRoot: false };

        // Normalize path
        let path = (typeof selectedContextPath !== 'undefined' && selectedContextPath) ? selectedContextPath.replace(/\\/g, '/') : null;
        if (!path) {
            // No path selected, try to use Project Settings Root directly
            if (typeof settings !== 'undefined' && settings.currentProject) {
                const roots = getCurrentRoots();
                path = roots.work ? roots.work.replace(/\\/g, '/') : null;
                if (path) {
                    AssetCreator.currentContext.client = settings.currentProject.client;
                    AssetCreator.currentContext.project = settings.currentProject.projectCode || settings.currentProject.name;
                    AssetCreator.currentContext.valid = true;
                    AssetCreator.currentContext.isRoot = true;
                    AssetCreator.currentContext.resolvedPath = path;
                    return;
                }
            }
            return;
        }

        AssetCreator.currentContext.resolvedPath = path;

        // --- STRATEGY 1: TAG-BASED DETECTION (Explicit Nodes in Preset) ---
        // If the selected preset has nodes tagged as 'isClientNode' or 'isProjectNode', use them to map the path.
        if (AssetCreator.selectedPreset && AssetCreator.selectedPreset.nodes) {
            const clientNode = AssetCreator.selectedPreset.nodes.find(n => n.isClientNode);
            const projectNode = AssetCreator.selectedPreset.nodes.find(n => n.isProjectNode);

            if (clientNode || projectNode) {
                // We need to match the directory structure. 
                // Heuristic: Split path and try to align with the preset depth? 
                // Hard to know "where" we are in absolute terms without a root anchor.

                // Better approach using Settings as Root Anchor:
                // 1. Identify which Project Root we are in (Z or M)
                // 2. Relative path from Root -> Map to Preset Tags

                let relativePath = null;
                if (typeof settings !== 'undefined' && settings.projects) {
                    // Check against ALL projects to find which one owns this path
                    for (const proj of settings.projects) {
                        const localRoot = proj.roots.work ? proj.roots.work.replace(/\\/g, '/') : "";
                        const onlineRoot = proj.roots.onlineWork ? proj.roots.onlineWork.replace(/\\/g, '/') : "";

                        if (localRoot && path.toLowerCase().startsWith(localRoot.toLowerCase())) {
                            relativePath = path.substring(localRoot.length);
                        } else if (onlineRoot && path.toLowerCase().startsWith(onlineRoot.toLowerCase())) {
                            relativePath = path.substring(onlineRoot.length);
                        }

                        if (relativePath !== null) {
                            // Match Found!
                            AssetCreator.currentContext.valid = true;
                            // Fallback values from Settings (override if Tags found)
                            AssetCreator.currentContext.client = proj.client;
                            AssetCreator.currentContext.project = proj.projectCode || proj.name;

                            // Clean relative path
                            if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
                            const parts = relativePath.split('/');

                            // If the Preset has explicit structure tags, we could essentially verify them here,
                            // but since we matched the Project Root, we effectively know the Client/Project 
                            // from the Settings.

                            // However, if the user wants to derive Client/Project FROM the path using tags 
                            // (e.g. if Settings are generic or not matching), we'd need to know the Root depth of the preset.
                            // Assuming Root Node in Preset = Project Root.

                            // Let's stick to Settings for identifying Client/Project mainly.
                            // But let's check for CATEGORY using the path.

                            // Check for Asset/Category using Preset
                            // If path is "Assets/Category", parts = ['assets', 'Category']

                            if (parts.length >= 2 && parts[0].toLowerCase() === 'assets') {
                                const potentialCat = parts[1];
                                const catMatch = AssetCreator.categoryNodes.find(n => n.name.toLowerCase() === potentialCat.toLowerCase());
                                if (catMatch) AssetCreator.currentContext.category = catMatch;
                            }

                            // Strategy 1 Done
                            return;
                        }
                    }
                }
            }
        }

        // --- STRATEGY 2: SETTINGS.PROJECTS MATCHING (Robust Automatic) ---
        // (This is basically what we did inside Strategy 1, but without relying on Preset Tags explicitly yet)
        // If Strategy 1 didn't return, it means we didn't find a Project Root match OR preset didn't have tags to force logic.

        if (typeof settings !== 'undefined' && settings.projects) {
            for (const proj of settings.projects) {
                const localRoot = proj.roots.work ? proj.roots.work.replace(/\\/g, '/') : "";
                const onlineRoot = proj.roots.onlineWork ? proj.roots.onlineWork.replace(/\\/g, '/') : "";

                // Normalize for comparison
                const pLower = path.toLowerCase();

                if ((localRoot && pLower.startsWith(localRoot.toLowerCase())) ||
                    (onlineRoot && pLower.startsWith(onlineRoot.toLowerCase()))) {

                    AssetCreator.currentContext.valid = true;
                    AssetCreator.currentContext.client = proj.client;
                    AssetCreator.currentContext.project = proj.projectCode || proj.name;
                    AssetCreator.currentContext.isRoot = (pLower === localRoot.toLowerCase() || pLower === onlineRoot.toLowerCase());

                    // Attempt Category Detection
                    // Get relative path
                    let root = (localRoot && pLower.startsWith(localRoot.toLowerCase())) ? localRoot : onlineRoot;
                    let rel = path.substring(root.length);
                    if (rel.startsWith('/')) rel = rel.substring(1);

                    const parts = rel.split('/');

                    // Expectation: assets/Category/...
                    const assetsIdx = parts.findIndex(p => p.toLowerCase() === 'assets');
                    if (assetsIdx !== -1 && parts.length > assetsIdx + 1) {
                        const potentialCat = parts[assetsIdx + 1];
                        const catMatch = AssetCreator.categoryNodes.find(n => n.name.toLowerCase() === potentialCat.toLowerCase());
                        if (catMatch) AssetCreator.currentContext.category = catMatch;
                    }

                    return;
                }
            }
        }

        // --- STRATEGY 3: HEURISTIC (Legacy/Fallback) ---
        // If path is somehow outside known roots but looks like structure
        const parts = path.split('/');
        const assetsIdx = parts.findIndex(p => p.toLowerCase() === 'assets');

        if (assetsIdx !== -1 && assetsIdx >= 2) {
            AssetCreator.currentContext.valid = true; // Semi-valid (guessed)
            AssetCreator.currentContext.project = parts[assetsIdx - 1];
            AssetCreator.currentContext.client = parts[assetsIdx - 2];

            if (parts.length > assetsIdx + 1) {
                const potentialCat = parts[assetsIdx + 1];
                const catMatch = AssetCreator.categoryNodes.find(n => n.name.toLowerCase() === potentialCat.toLowerCase());
                if (catMatch) AssetCreator.currentContext.category = catMatch;
            }
        }
    },

    handleCategoryChange: (catId) => {
        const cat = AssetCreator.categoryNodes.find(n => n.id === catId);
        AssetCreator.currentContext.category = cat;
        if (AssetCreator.mode === 'batch') {
            AssetCreator.loadAssetsForCategory();
        }
        AssetCreator.render();
    },

    render: () => {
        if (!AssetCreator.container) return;

        const presetOptions = AssetCreator.presets.map((p, index) =>
            `<option value="${index}" ${AssetCreator.selectedPreset && AssetCreator.selectedPreset.id === p.id ? 'selected' : ''}>${p.name || 'Sin Nombre'}</option>`
        ).join('');

        let contentHTML = '';
        let createBtnState = 'disabled';

        // --- OVERLAY CONTAINER ---
        const overlayHTML = `
            <div id="ac-overlay" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:10; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
                <div id="ac-overlay-content"></div>
            </div>
        `;

        if (AssetCreator.selectedPreset) {
            // --- CONTEXT INFO ---
            const ctx = AssetCreator.currentContext;
            let contextClass = ctx.valid ? 'ctx-valid' : 'ctx-warning';
            let contextMsg = ctx.valid
                ? `<span style="color:#8f8; font-weight:bold;">✓ Contexto Válido</span>`
                : `<span style="color:#f88; font-weight:bold;">⚠ Contexto Desconocido</span>`;

            // --- CATEGORY SELECTOR ---
            const currentCatId = ctx.category ? ctx.category.id : "";
            const catOpts = AssetCreator.categoryNodes.map(c =>
                `<option value="${c.id}" ${c.id === currentCatId ? 'selected' : ''}>${c.name}</option>`
            ).join('');

            let categoryHTML = `
                <div class="form-group compact">
                    <label>Categoría</label>
                    <select id="ac-category-select" onchange="AssetCreator.handleCategoryChange(this.value)" style="width:100%; padding:6px; background:#222; color:white; border:1px solid #444; border-radius:4px;">
                        <option value="">-- Seleccionar --</option>
                        ${catOpts}
                    </select>
                </div>`;

            // --- PROCESSES CHECKBOXES ---
            let processesItemsHTML = "";
            if (AssetCreator.processNodes.length === 0) {
                processesItemsHTML += `<div style="color:#666; font-style:italic; font-size:0.8rem;">No hay procesos variables.</div>`;
            } else {
                AssetCreator.processNodes.forEach(proc => {
                    processesItemsHTML += `
                        <div style="display:flex; align-items:center; margin-bottom:6px;">
                            <input type="checkbox" id="chk-proc-${proc.id}" checked class="ac-proc-chk" value="${proc.id}" style="accent-color:var(--accent);">
                            <label for="chk-proc-${proc.id}" style="margin-left:8px; font-size:0.9rem; cursor:pointer; user-select:none; color:#ccc;">${proc.name}</label>
                        </div>
                    `;
                });
            }

            contentHTML = `
                <div style="display:flex; gap:20px; height:100%; overflow:hidden;">
                    <!-- LEFT COLUMN: Config -->
                    <div style="flex:1; display:flex; flex-direction:column; gap:10px;">
                        
                        <!-- Context Box -->
                        <div style="font-size:0.85rem; padding:10px; background:#222; border-radius:4px; border-left: 4px solid ${ctx.valid ? '#4CAF50' : '#F44336'};">
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span style="color:#aaa;">Cliente:</span> <b style="color:#fff;">${ctx.client || '?'}</b>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span style="color:#aaa;">Proyecto:</span> <b style="color:#fff;">${ctx.project || '?'}</b>
                            </div>
                            <div style="text-align:right; font-size:0.75rem; margin-top:5px;">${contextMsg}</div>
                        </div>

                        ${categoryHTML}
                        
                        <!-- MODE TOGGLE -->
                        <div style="display:flex; margin-bottom:10px; border:1px solid #444; border-radius:4px; overflow:hidden;">
                             <button onclick="AssetCreator.switchMode('create')" style="flex:1; padding:6px; border:none; cursor:pointer; background:${AssetCreator.mode === 'create' ? 'var(--accent)' : '#222'}; color:${AssetCreator.mode === 'create' ? '#000' : '#aaa'}; font-weight:bold;">Nuevo Asset</button>
                             <button onclick="AssetCreator.switchMode('batch')" style="flex:1; padding:6px; border:none; cursor:pointer; background:${AssetCreator.mode === 'batch' ? 'var(--accent)' : '#222'}; color:${AssetCreator.mode === 'batch' ? '#000' : '#aaa'}; font-weight:bold;">Inyectar Procesos</button>
                        </div>

                        ${AssetCreator.mode === 'create' ? `
                            <div class="form-group compact">
                                <label>Nombre del Asset</label>
                                <input type="text" id="ac-asset-name" placeholder="Ej: Character_Name" value="" style="width:100%; padding:8px; background:#000; color:#fff; border:1px solid var(--accent); font-weight:bold; font-size:1rem;">
                            </div>
                        ` : `
                            <div class="form-group compact" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                                <div style="display:flex; gap:10px; margin-bottom:10px; font-size:0.8rem; border-bottom:1px solid #333; padding-bottom:10px;">
                                    <div onclick="AssetCreator.setInjectionScope('explorer')" 
                                         style="flex:1; padding:6px; cursor:pointer; text-align:center; border-radius:4px; border:1px solid #444; ${AssetCreator.injectionScope === 'explorer' ? 'background:var(--accent); color:black; font-weight:bold;' : 'background:#222; color:#888;'}">
                                        Seleccionados en Explorer
                                    </div>
                                    <div onclick="AssetCreator.setInjectionScope('category')" 
                                         style="flex:1; padding:6px; cursor:pointer; text-align:center; border-radius:4px; border:1px solid #444; ${AssetCreator.injectionScope === 'category' ? 'background:var(--accent); color:black; font-weight:bold;' : 'background:#222; color:#888;'}">
                                        Dentro de Categoría
                                    </div>
                                </div>
                                
                                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                    <label>Assets (${AssetCreator.injectionScope === 'explorer' ? AssetCreator.selectedAssets.length : AssetCreator.foundAssets.length})</label>
                                    ${AssetCreator.injectionScope === 'category' ?
                    `<button onclick="AssetCreator.toggleSelectAll()" style="font-size:0.7rem; padding:2px 6px; background:#444; border:none; color:white; cursor:pointer;">${AssetCreator.selectedAssets.length === AssetCreator.foundAssets.length && AssetCreator.foundAssets.length > 0 ? 'Deseleccionar' : 'Todos'}</button>`
                    : ''}
                                </div>
                                <div style="flex:1; overflow-y:auto; background:#111; border:1px solid #333; padding:5px;">
                                    ${AssetCreator.renderAssetList()}
                                </div>
                            </div>
                        `}
                    </div>

                    <!-- RIGHT COLUMN: Processes & Options -->
                    <div style="flex:1; padding-left:10px; display:flex; flex-direction:column; gap:10px;">
                        
                        <!-- Processes List -->
                        <div style="flex:1; background:#1a1a1a; padding:10px; border-radius:4px; border:1px solid #333; overflow-y:auto;">
                             <label style="display:block; margin-bottom:8px; color:#aaa; font-weight:bold; font-size:0.85rem; border-bottom:1px solid #333; padding-bottom:4px;">Procesos a Crear</label>
                             ${processesItemsHTML}
                        </div>

                        <!-- File Options -->
                        <div style="flex:0 0 auto; background:#1a1a1a; padding:10px; border-radius:4px; border:1px solid #333;">
                             <label style="display:block; margin-bottom:8px; color:#aaa; font-weight:bold; font-size:0.85rem; border-bottom:1px solid #333; padding-bottom:4px;">Opciones de Archivo</label>
                             
                             <div style="display:flex; align-items:center; margin-bottom:6px;">
                                 <input type="checkbox" id="chk-v0-files" onchange="AssetCreator.createVersionZero = this.checked" ${AssetCreator.createVersionZero ? 'checked' : ''} style="accent-color:var(--accent);">
                                 <label for="chk-v0-files" style="margin-left:8px; font-size:0.9rem; cursor:pointer; color:#ccc;">Crear Archivos Versión Cero (.txt)</label>
                             </div>

                             <div style="display:flex; align-items:center; margin-bottom:6px;">
                                 <input type="checkbox" id="ac-inject-meta" checked style="accent-color:#4CAF50;">
                                 <label for="ac-inject-meta" title="Inyecta un archivo vfx_control.json con metadatos del preset" style="margin-left:6px; color:#888; font-size:0.75rem; cursor:pointer;">Inyectar vfx_control</label>
                             </div>

                             <div style="display:flex; align-items:center; opacity:0.5;" title="Próximamente">
                                 <input type="checkbox" disabled style="accent-color:var(--accent);">
                                 <label style="margin-left:8px; font-size:0.9rem; cursor:not-allowed; color:#888;">Usar Template (Coming Soon)</label>
                             </div>
                        </div>
                    </div>
                </div>
            `;

            createBtnState = '';
        } else {
            contentHTML = `<div style="flex:1; display:flex; align-items:center; justify-content:center; color:#666; font-style:italic;">Selecciona un preset para comenzar.</div>`;
        }

        AssetCreator.container.innerHTML = `
            <div class="validator-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="icons/asset_creator.svg" style="width:18px;">
                    <span style="font-size:1rem; font-weight:bold;">Asset Creator</span>
                </div>
                <div style="flex:1; cursor:grab; height:100%;" id="asset-creator-drag"></div>
                <div class="win-controls">
                    <button onclick="AssetCreator.close()">×</button>
                </div>
            </div>
            
            <div class="validator-body" style="padding: 20px; display:flex; flex-direction: column; background:#111; position:relative;">
                ${overlayHTML}
                <div class="form-group" style="margin-top:0; margin-bottom:15px;">
                    <label style="color:#888;">Preset Seleccionado</label>
                    <select onchange="AssetCreator.selectPreset(this.value)" style="width:100%; padding:8px; background:#222; color:white; border:1px solid #444; border-radius:4px; font-size:0.95rem;">
                        <option value="">-- Seleccionar --</option>
                        ${presetOptions}
                    </select>
                </div>
                ${contentHTML}
            </div>
            
            <div class="settings-footer" style="padding: 15px 20px; border-top:1px solid #222;">
                <!-- <button class="btn" style="background:#333; color:white;" onclick="AssetCreator.close()">Cerrar</button> -->
                <div style="flex:1"></div>
                <button class="btn btn-primary" onclick="AssetCreator.validateAndConfirm()" style="background:var(--accent); color:black; border:none; padding:10px 30px; border-radius:4px; font-weight:bold; font-size:1rem; cursor:pointer; opacity:${createBtnState ? '0.5' : '1'}; pointer-events:${createBtnState ? 'none' : 'all'};">CREAR ESTRUCTURA</button>
            </div>
        `;

        AssetCreator.makeDraggable();
    },

    showOverlay: (content) => {
        const ov = document.getElementById('ac-overlay');
        const cont = document.getElementById('ac-overlay-content');
        if (ov && cont) {
            cont.innerHTML = content;
            ov.style.display = 'flex';
        }
    },

    hideOverlay: () => {
        const ov = document.getElementById('ac-overlay');
        if (ov) ov.style.display = 'none';
    },

    validateAndConfirm: async () => {
        if (!AssetCreator.selectedPreset) return;

        // 1. Validate based on Mode
        let assetName = "";
        let targets = [];

        if (AssetCreator.mode === 'create') {
            const nameInput = document.getElementById('ac-asset-name');
            assetName = nameInput ? nameInput.value.trim() : "";
            if (!assetName) {
                AssetCreator.showOverlay(`
                    <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                    <div style="font-size:1.2rem; color:#fff; margin-bottom:20px;">Falta el Nombre del Asset</div>
                    <button onclick="AssetCreator.hideOverlay()" style="padding:8px 20px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer;">Entendido</button>
                `);
                return;
            }
        } else {
            // Batch Mode
            if (AssetCreator.selectedAssets.length === 0) {
                AssetCreator.showOverlay(`
                    <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                    <div style="font-size:1.2rem; color:#fff; margin-bottom:20px;">Selecciona al menos un Asset</div>
                    <button onclick="AssetCreator.hideOverlay()" style="padding:8px 20px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer;">Entendido</button>
                `);
                return;
            }
            targets = AssetCreator.selectedAssets;
        }

        // 2. Resolve Category (Dropdown takes priority if visible)
        let targetCategoryNode = AssetCreator.currentContext.category;
        const catSelect = document.getElementById('ac-category-select');
        if (catSelect && catSelect.value) {
            targetCategoryNode = AssetCreator.categoryNodes.find(n => n.id === catSelect.value);
        }

        if (!targetCategoryNode && AssetCreator.categoryNodes.length > 0) {
            AssetCreator.showOverlay(`
                <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                <div style="font-size:1.2rem; color:#fff; margin-bottom:20px;">Selecciona una Categoría</div>
                <button onclick="AssetCreator.hideOverlay()" style="padding:8px 20px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer;">Entendido</button>
            `);
            return;
        }

        // 3. Resolve Roots (Find Assets Root Anchor)
        let basePath = AssetCreator.currentContext.resolvedPath || (typeof selectedContextPath !== 'undefined' && selectedContextPath ? selectedContextPath.replace(/\\/g, '/') : "");
        let categoryPath = "";

        // Strategy: Find '/assets' in the path to anchor ourselves
        const lowerPath = basePath.toLowerCase();
        let assetsIndex = lowerPath.lastIndexOf('/assets');

        if (assetsIndex !== -1) {
            // Found '/assets' anchor.
            // Truncate path to include '/assets', discarding any subfolders (e.g. current category)
            // Example: Z:/Proj/Assets/Characters -> Z:/Proj/Assets
            // Example: Z:/Proj/Assets -> Z:/Proj/Assets
            const assetsRoot = basePath.substring(0, assetsIndex + 7);
            categoryPath = assetsRoot + "/" + targetCategoryNode.name;
        } else {
            // 'assets' not found.
            // Fallback: Assume Project Root context or generic folder structure.
            // Check if we are at a known Project Root
            let isProjectRoot = false;
            // Use resolveContext's logic if possible
            if (AssetCreator.currentContext.isRoot) isProjectRoot = true;

            if (isProjectRoot) {
                // At Project Root -> Append /assets/Category
                categoryPath = basePath + "/assets/" + targetCategoryNode.name;
            } else {
                // Unknown deep path without 'assets' keyword.
                // Best effort: Append /assets/Category relative to current path?
                // Or treat current path as Root?
                // Let's assume standard structure:
                categoryPath = basePath + "/assets/" + targetCategoryNode.name;
            }
        }

        // 4. Get Processes
        // We capture readable names for confirmation
        let processListHTML = "";
        const checkedProcsInputs = Array.from(document.querySelectorAll('.ac-proc-chk:checked'));
        const checkedProcs = checkedProcsInputs.map(cb => cb.value);

        if (checkedProcs.length > 0) {
            const names = checkedProcsInputs.map(cb => {
                const label = document.querySelector(`label[for="${cb.id}"]`);
                return label ? label.innerText : cb.value;
            });
            processListHTML = `<ul style="text-align:left; margin:10px 0; color:#ccc;">${names.map(n => `<li>${n}</li>`).join('')}</ul>`;
        } else {
            processListHTML = `<div style="color:#666; margin:10px 0;">(Sin procesos adicionales)</div>`;
        }

        // 5. Construct Preview Msg
        let title = AssetCreator.mode === 'create' ? "Crear Asset" : "Inyectar en Assets";
        let targetMsg = AssetCreator.mode === 'create'
            ? `<div style="font-size:1.4rem; color:var(--accent); font-weight:bold; margin-bottom:5px;">${assetName}</div><div style="font-size:0.8rem; color:#888;">En: ${categoryPath}</div>`
            : `<div style="font-size:1.2rem; color:var(--accent); font-weight:bold; margin-bottom:5px;">${targets.length} Assets Seleccionados</div><div style="font-size:0.8rem; color:#888;">En: ${categoryPath}</div>`;

        // Save execution context
        AssetCreator.pendingCreation = {
            mode: AssetCreator.mode,
            assetName,
            categoryPath,
            targetCategoryNode,
            targets,
            checkedProcs,
            injectMeta: document.getElementById('ac-inject-meta')?.checked || false
        };

        AssetCreator.showOverlay(`
            <div style="text-align:left; width:100%;">
                <h3 style="margin-top:0;">${title}</h3>
                <div style="margin-bottom:15px; text-align:center;">
                    ${targetMsg}
                </div>
                <div>
                     <span style="color:#888;">Procesos:</span>
                     ${processListHTML}
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                <button onclick="AssetCreator.hideOverlay()" style="padding:8px 15px; background:#333; color:white; border:none; border-radius:4px; cursor:pointer;">Cancelar</button>
                <button onclick="AssetCreator.executeCreation()" style="padding:8px 20px; background:var(--accent); color:black; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">CONFIRMAR</button>
            </div>
        `);
    },

    executeCreation: async () => {
        const { mode, assetName, categoryPath, targetCategoryNode, targets, checkedProcs, injectMeta } = AssetCreator.pendingCreation;

        // Change Overlay to Loading
        AssetCreator.showOverlay(`
            <div class="spinner-large" style="border-top-color:var(--accent);"></div>
            <div style="margin-top:15px; color:#ccc;">${mode === 'create' ? 'Creando estructura...' : 'Inyectando procesos...'}</div>
        `);

        // Ensure Category Path exists
        if (!AssetCreator.currentContext.category && targetCategoryNode && mode === 'create') {
            try { await API.fs.mkdir(categoryPath); } catch (e) { }
        }

        let assetNode = AssetCreator.selectedPreset.nodes.find(n => n.isAssetFocus || n.name === 'ASSET');

        try {
            if (mode === 'create') {
                const assetRootPath = categoryPath + "/" + assetName;
                const res = await API.fs.mkdir(assetRootPath);
                if (res && res.error) throw new Error(res.error);

                // Create Nodes
                if (assetNode) {
                    if (injectMeta) await AssetCreator.writeMetadataFile(assetNode, assetRootPath);
                    await AssetCreator.createNodesRecursively(assetNode.id, assetRootPath, AssetCreator.selectedPreset.nodes, checkedProcs, assetName, injectMeta);
                }
            } else {
                // Batch
                for (const assetPath of targets) {
                    // assetPath is the full existing paths
                    // We need to inject nodes inside it.
                    if (assetNode) {
                        // Extract Name for Placeholders
                        const currentAssetName = assetPath.trim().replace(/\\/g, '/').split('/').pop();
                        if (injectMeta) await AssetCreator.writeMetadataFile(assetNode, assetPath);
                        await AssetCreator.createNodesRecursively(assetNode.id, assetPath, AssetCreator.selectedPreset.nodes, checkedProcs, currentAssetName, injectMeta);
                    }
                }
            }
        } catch (e) {
            AssetCreator.showOverlay(`
                <div style="font-size:2rem; margin-bottom:10px;">❌</div>
                <div style="font-size:1.2rem; color:#F44336; margin-bottom:10px;">Error</div>
                <div style="color:#aaa; font-size:0.9rem;">${e.message}</div>
                <button onclick="AssetCreator.hideOverlay()" style="margin-top:15px; padding:8px 20px; background:#333; color:white; border:none; border-radius:4px;">Cerrar</button>
             `);
            return;
        }

        // SUCCESS
        AssetCreator.showOverlay(`
            <div style="font-size:3rem; margin-bottom:10px;">✅</div>
            <div style="font-size:1.5rem; color:#fff; font-weight:bold;">${mode === 'create' ? 'Creado con Éxito' : 'Actualización Completa'}</div>
        `);

        if (typeof refreshCurrentView === 'function') refreshCurrentView();

        setTimeout(() => {
            AssetCreator.hideOverlay();
            if (mode === 'create') {
                const nameInput = document.getElementById('ac-asset-name');
                if (nameInput) nameInput.value = "";
            } else {
                AssetCreator.selectedAssets = [];
                AssetCreator.render(); // Refresh list to clear selection
            }
        }, 2000);
    },

    writeMetadataFile: async (node, fullPath) => {
        if (!AssetCreator.selectedPreset || !node) return;
        const metaData = {
            preset_id: AssetCreator.selectedPreset.id,
            node_id: node.id,
            node_name: node.name,
            node_config: {
                nameConfig: node.nameConfig || null,
                processConfig: node.processConfig || null,
                isRenderFolder: node.isRenderFolder || false,
                isRenderFile: node.isRenderFile || false,
                variableName: node.variableName || null
            },
            creation_date: new Date().toISOString(),
            user: AssetCreator.systemInfo ? AssetCreator.systemInfo.username : "unknown"
        };
        const metaPath = fullPath + "/vfx_control.json";
        try {
            await API.fs.writeFile(metaPath, JSON.stringify(metaData, null, 2));
        } catch (e) {
            console.error("Error injecting metadata to:", metaPath, e);
        }
    },

    createNodesRecursively: async (parentId, parentPath, allNodes, allowedProcesses = [], assetName = "", injectMeta = false) => {
        const children = allNodes.filter(n => n.parent === parentId);
        for (const child of children) {

            // Process Filter Logic
            const isProcessNode = AssetCreator.processNodes.find(p => p.id === child.id);
            if (isProcessNode) {
                if (!allowedProcesses.includes(child.id)) {
                    continue;
                }
            }

            if (child.type === 'file') {
                if (AssetCreator.createVersionZero) {

                    let fileName = child.name;
                    // IF Name Constructor Enabled, use Pattern
                    if (child.nameConfig && child.nameConfig.enabled && child.nameConfig.pattern) {
                        fileName = child.nameConfig.pattern;
                    }

                    // --- Variable Replacement ---
                    // [ASSET] placeholder
                    if (assetName) {
                        fileName = fileName.replace(/\[ASSET\]/gi, assetName)
                            .replace(/{Asset}/gi, assetName)
                            .replace(/{{Asset}}/gi, assetName);
                    }

                    // [PROCESO] / [PROC] placeholder
                    if (fileName.match(/\[PROC\]|\[PROCESO\]/i)) {
                        let procName = "Process";
                        let tempCurr = child;
                        // Traverse up to find Process Node
                        while (tempCurr) {
                            // Find parent node in allNodes
                            const p = allNodes.find(n => n.id === tempCurr.parent);
                            if (p && p.isProcess) {
                                procName = p.name;
                                break;
                            }
                            tempCurr = p;
                            if (!tempCurr) break;
                        }
                        fileName = fileName.replace(/\[PROC\]/gi, procName).replace(/\[PROCESO\]/gi, procName);
                    }

                    // [VER] / [version] -> v000
                    if (fileName.match(/\[VER\]|\[version\]/i)) {
                        const pad = child.nameConfig?.versionPadding || 3;
                        const prefix = (child.nameConfig?.versionPrefix !== false) ? 'v' : '';
                        const vStr = prefix + '0'.padStart(pad, '0');
                        fileName = fileName.replace(/\[VER\]/gi, vStr).replace(/\[version\]/gi, vStr);
                    }

                    // [ext] Handling: Remove tag and optional preceding dot
                    fileName = fileName.replace(/\.?\[ext\]/gi, '');

                    // Remove existing extension if any (fallback for fixed names)
                    const lastDot = fileName.lastIndexOf('.');
                    if (lastDot !== -1 && lastDot > 0 && (fileName.length - lastDot) <= 5) {
                        fileName = fileName.substring(0, lastDot);
                    }

                    // Force .txt
                    fileName += ".txt";

                    // Context placeholders
                    const ctx = AssetCreator.currentContext;
                    if (ctx.client) fileName = fileName.replace(/\[Client\]/gi, ctx.client).replace(/{Client}/gi, ctx.client);
                    if (ctx.project) fileName = fileName.replace(/\[Project\]/gi, ctx.project).replace(/{Project}/gi, ctx.project);

                    const fullPath = parentPath + "/" + fileName;
                    try {
                        await API.fs.writeFile(fullPath, "");
                    } catch (e) {
                        console.error("Error creating v0 file:", fullPath, e);
                    }
                }
                continue;
            }

            const fullPath = parentPath + "/" + child.name;
            try { await API.fs.mkdir(fullPath); } catch (e) { }

            // Metadata Injection
            if (injectMeta) {
                await AssetCreator.writeMetadataFile(child, fullPath);
            }

            await AssetCreator.createNodesRecursively(child.id, fullPath, allNodes, allowedProcesses, assetName, injectMeta);
        }
    },

    makeDraggable: () => {
        const header = document.getElementById('asset-creator-drag');
        if (!header) return;

        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        header.onmousedown = (e) => {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = () => {
                document.onmouseup = null;
                document.onmousemove = null;
            };
            document.onmousemove = (e) => {
                e = e || window.event;
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                AssetCreator.container.style.top = (AssetCreator.container.offsetTop - pos2) + "px";
                AssetCreator.container.style.left = (AssetCreator.container.offsetLeft - pos1) + "px";
                AssetCreator.container.style.transform = "none"; // Remove centering
            };
        };
    }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => AssetCreator.init());
