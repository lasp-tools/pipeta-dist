// ------------------------------------------
// --- ASSET CREATOR MODULE ---
// ------------------------------------------

const AssetCreator = {
    isVisible: false,
    container: null,
    currentContext: { client: null, project: null, projectObj: null, mainCategory: null, category: null, valid: false, resolvedPath: null, isRoot: false },
    mainCategoryNodes: [],
    categoryNodes: [],
    selectedMainCatId: null,
    selectedSubCatId: null,
    processNodes: [],
    presets: [],
    selectedPreset: null,
    presetsPath: "C:\\TOOLS\\APPS\\Pipeta\\presets\\AssetDesigner",
    systemInfo: { username: "unknown" },

    // Batch Mode State
    mode: 'create', // 'create' | 'batch'
    injectionScope: 'explorer',
    createVersionZero: false,
    createTemplateV001: localStorage.getItem('pipeta_ac_create_template_v001') === 'true',
    templateSource: localStorage.getItem('pipeta_ac_template_source') || 'reference',
    manualTemplatePath: localStorage.getItem('pipeta_ac_manual_template_path') || '',
    foundAssets: [],
    selectedAssets: [],

    toggleTemplateV001: (checked) => {
        AssetCreator.createTemplateV001 = checked;
        localStorage.setItem('pipeta_ac_create_template_v001', checked ? 'true' : 'false');
        AssetCreator.render();
    },

    setTemplateSource: (source) => {
        AssetCreator.templateSource = source;
        localStorage.setItem('pipeta_ac_template_source', source);
        AssetCreator.render();
    },

    browseManualTemplate: async () => {
        const res = await API.system.pickFile('Z:\\', 'Archivos de Template (*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt)|*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt|Todos los archivos (*.*)|*.*');
        if (res && res.success && res.path) {
            AssetCreator.manualTemplatePath = res.path;
            localStorage.setItem('pipeta_ac_manual_template_path', res.path);
            AssetCreator.render();
        }
    },

    getTemplateFileForProcess: async (processName, childNode) => {
        const cleanProc = (processName || '').toLowerCase().trim();
        const activeProjId = localStorage.getItem('pipeta_active_project_id');
        let currentProj = (settings?.projects || []).find(p => p.id === activeProjId) || settings?.currentProject;

        if (AssetCreator.templateSource === 'manual') {
            if (AssetCreator.manualTemplatePath) {
                const ext = '.' + AssetCreator.manualTemplatePath.split('.').pop();
                return { sourcePath: AssetCreator.manualTemplatePath, ext: ext };
            }
            return null;
        }

        if (AssetCreator.templateSource === 'custom') {
            const customMap = currentProj?.templates?.customTemplates?.assets || {};
            const customPath = customMap[cleanProc] || customMap[processName];
            if (customPath) {
                const ext = '.' + customPath.split('.').pop();
                return { sourcePath: customPath, ext: ext };
            }
            return null;
        }

        // Default: 'reference'
        const workRoot = currentProj?.roots?.work || 'Z:/';
        const refSub = currentProj?.templates?.referenceAssetRoot || 'assets2D/templates';
        const fullRefRoot = refSub.startsWith('Z:') || refSub.startsWith('C:') || refSub.startsWith('/') ? refSub : `${workRoot}/${refSub}`.replace(/\\/g, '/');

        try {
            const res = await API.templates.findReference(fullRefRoot, cleanProc);
            if (res && res.found && res.filePath) {
                return { sourcePath: res.filePath, ext: res.ext || ('.' + res.fileName.split('.').pop()) };
            }
        } catch(e) {
            console.error("Error looking up reference template in AssetCreator:", e);
        }
        return null;
    },

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

    getTargetCategoryPath: () => {
        const ctx = AssetCreator.currentContext;
        let rootPath = "";
        if (ctx.projectObj?.roots?.work) {
            rootPath = ctx.projectObj.roots.work.replace(/\\/g, '/');
        } else if (typeof settings !== 'undefined' && settings.currentProject?.roots?.work) {
            rootPath = settings.currentProject.roots.work.replace(/\\/g, '/');
        } else if (ctx.resolvedPath) {
            rootPath = ctx.resolvedPath.replace(/\\/g, '/');
        }

        const mainCat = AssetCreator.mainCategoryNodes.find(n => n.id === AssetCreator.selectedMainCatId);
        const subCat = AssetCreator.categoryNodes.find(n => n.id === AssetCreator.selectedSubCatId);

        let parts = [rootPath];
        if (mainCat) parts.push(mainCat.name);
        if (subCat && (!mainCat || subCat.id !== mainCat.id)) parts.push(subCat.name);

        return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
    },

    loadAssetsForCategory: async () => {
        const path = AssetCreator.getTargetCategoryPath();
        if (!path) return;

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
                    const basePath = (typeof selectedContextPath !== 'undefined' && selectedContextPath)
                        ? selectedContextPath.replace(/\\/g, '/').toLowerCase()
                        : "";

                    if (AssetCreator.foundAssets.length > 0) {
                        const match = AssetCreator.foundAssets.find(a => {
                            const aPath = a.path.replace(/\\/g, '/').toLowerCase();
                            return basePath === aPath || basePath.startsWith(aPath + '/');
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
            assetsToShow = AssetCreator.foundAssets.filter(a => AssetCreator.selectedAssets.includes(a.path));
        }

        if (assetsToShow.length === 0) {
            if (AssetCreator.injectionScope === 'explorer') {
                return '<div style="padding:10px; color:#aaa; font-style:italic; text-align:center;">Ningún asset seleccionado.<br><span style="font-size:0.8rem; color:#666;">Selecciona una carpeta dentro de la categoría en el explorador.</span></div>';
            }
            return '<div style="padding:10px; color:#666; font-style:italic; text-align:center;">No se encontraron assets en esta categoría.</div>';
        }

        return assetsToShow.map(asset => `
            <div style="display:flex; align-items:center; padding:4px; border-bottom:1px solid #222;">
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
        const seenIds = new Set();
        const seenFiles = new Set();
        const searchDirs = [
            AssetCreator.presetsPath,
            "Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets\\AssetDesigner"
        ];

        try {
            if (window.API && API.fs && API.fs.getFiles) {
                for (const dir of searchDirs) {
                    try {
                        const files = await API.fs.getFiles(dir);
                        if (files && Array.isArray(files)) {
                            for (const f of files) {
                                if (f.endsWith('.json')) {
                                    const fileBase = f.toLowerCase();
                                    if (seenFiles.has(fileBase)) continue;
                                    const content = await API.fs.readFile(dir + "\\" + f);
                                    if (content) {
                                        try {
                                            const preset = JSON.parse(content);
                                            const pId = preset.id || f.replace('.json', '');
                                            if (seenIds.has(pId)) continue;
                                            preset.id = pId;
                                            AssetCreator.presets.push(preset);
                                            seenIds.add(pId);
                                            seenFiles.add(fileBase);
                                        } catch (e) {
                                            console.error("Error parsing preset:", f, e);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (dirErr) {}
                }
            }

            // Restore last selected preset or project default / master_asset
            const lastId = localStorage.getItem('pipeta_ac_last_preset');
            const targetDefaultId = (typeof settings !== 'undefined' && settings.activeProject && settings.activeProject.defaultAssetPresetId)
                ? settings.activeProject.defaultAssetPresetId
                : 'master_asset';

            if (lastId) {
                const found = AssetCreator.presets.findIndex(p => p.id === lastId);
                if (found !== -1) {
                    AssetCreator.selectPreset(found);
                } else if (AssetCreator.presets.length > 0) {
                    const defIdx = AssetCreator.presets.findIndex(p => p.id === targetDefaultId || p.name?.toLowerCase() === targetDefaultId.toLowerCase());
                    AssetCreator.selectPreset(defIdx !== -1 ? defIdx : 0);
                }
            } else if (AssetCreator.presets.length > 0) {
                const defIdx = AssetCreator.presets.findIndex(p => p.id === targetDefaultId || p.name?.toLowerCase() === targetDefaultId.toLowerCase());
                AssetCreator.selectPreset(defIdx !== -1 ? defIdx : 0);
            }

        } catch (e) {
            console.error("AssetCreator: Error loading presets", e);
        }
    },

    open: async () => {
        if (!AssetCreator.container) await AssetCreator.init();
        await AssetCreator.loadPresets();
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

    selectProject: async (projId) => {
        if (typeof settings !== 'undefined' && settings.projects) {
            const proj = settings.projects.find(p => p.id === projId);
            if (proj) {
                settings.currentProject = proj;
                localStorage.setItem('pipeta_active_project_id', proj.id);
                AssetCreator.resolveContext(proj.roots?.work || "");
                if (AssetCreator.mode === 'batch') {
                    await AssetCreator.loadAssetsForCategory();
                }
                AssetCreator.render();
            }
        }
    },

    selectPreset: (index) => {
        if (index === "" || index === null || index === undefined) {
            AssetCreator.selectedPreset = null;
        } else {
            AssetCreator.selectedPreset = AssetCreator.presets[index];
            AssetCreator.analyzePreset(AssetCreator.selectedPreset);
            if (AssetCreator.selectedPreset) {
                localStorage.setItem('pipeta_ac_last_preset', AssetCreator.selectedPreset.id);
            }
        }
        AssetCreator.render();
    },

    analyzePreset: (preset) => {
        if (!preset || !preset.nodes) {
            AssetCreator.mainCategoryNodes = [];
            AssetCreator.categoryNodes = [];
            AssetCreator.selectedMainCatId = null;
            AssetCreator.selectedSubCatId = null;
            AssetCreator.processNodes = [];
            return;
        }

        // 1. Detect Main Categories and Subcategories
        AssetCreator.mainCategoryNodes = preset.nodes.filter(n => n.isMainCategory);
        AssetCreator.categoryNodes = preset.nodes.filter(n => n.isCategory);

        // Fallback: If no isMainCategory nodes exist, check if there are top-level categories
        if (AssetCreator.mainCategoryNodes.length === 0) {
            const allCatIds = new Set(AssetCreator.categoryNodes.map(c => c.id));
            const topCats = AssetCreator.categoryNodes.filter(c => !allCatIds.has(c.parent));
            if (topCats.length > 0 && topCats.length < AssetCreator.categoryNodes.length) {
                AssetCreator.mainCategoryNodes = topCats;
            }
        }

        // Default Main Category
        if (!AssetCreator.selectedMainCatId || !AssetCreator.mainCategoryNodes.some(m => m.id === AssetCreator.selectedMainCatId)) {
            AssetCreator.selectedMainCatId = AssetCreator.mainCategoryNodes.length > 0 ? AssetCreator.mainCategoryNodes[0].id : null;
        }

        // Default Subcategory for the active Main Category
        const availableSubCats = AssetCreator.getSubCategories(AssetCreator.selectedMainCatId);
        if (!AssetCreator.selectedSubCatId || !availableSubCats.some(s => s.id === AssetCreator.selectedSubCatId)) {
            AssetCreator.selectedSubCatId = availableSubCats.length > 0 ? availableSubCats[0].id : (AssetCreator.categoryNodes[0]?.id || null);
        }

        // Update Processes
        AssetCreator.updateProcessesForSelection();

        // Re-Resolve context with new preset
        AssetCreator.resolveContext();
    },

    getSubCategories: (mainCatId) => {
        if (!AssetCreator.selectedPreset || !AssetCreator.selectedPreset.nodes) return [];
        if (!mainCatId) return AssetCreator.categoryNodes;
        const subCats = AssetCreator.selectedPreset.nodes.filter(n => n.isCategory && n.parent === mainCatId);
        return subCats.length > 0 ? subCats : AssetCreator.categoryNodes;
    },

    updateProcessesForSelection: () => {
        if (!AssetCreator.selectedPreset || !AssetCreator.selectedPreset.nodes) {
            AssetCreator.processNodes = [];
            return;
        }

        const nodes = AssetCreator.selectedPreset.nodes;
        const targetSubCatId = AssetCreator.selectedSubCatId;
        const targetMainCatId = AssetCreator.selectedMainCatId;

        // Find items directly under the selected subcategory (or main category)
        const relevantItemNodes = nodes.filter(n => 
            (n.isItem || n.isAssetFocus || n.isVariable) && 
            (n.parent === targetSubCatId || (targetSubCatId && n.id === targetSubCatId) || (!targetSubCatId && n.parent === targetMainCatId))
        );

        const itemIds = new Set(relevantItemNodes.map(i => i.id));
        const matchedProcesses = [];
        const seenProcIds = new Set();

        // 1. Direct children processes of matching items
        nodes.forEach(n => {
            if (n.isProcess || (n.type === 'folder' && relevantItemNodes.some(item => n.parent === item.id))) {
                if (relevantItemNodes.some(item => n.parent === item.id)) {
                    if (!seenProcIds.has(n.id)) {
                        seenProcIds.add(n.id);
                        matchedProcesses.push(n);
                    }
                }
            }
        });

        // 2. Processes connected via additionalParents to any of our matching items
        nodes.forEach(n => {
            if (n.isProcess && n.processConfig && Array.isArray(n.processConfig.additionalParents)) {
                const isLinked = n.processConfig.additionalParents.some(pId => itemIds.has(pId));
                if (isLinked && !seenProcIds.has(n.id)) {
                    seenProcIds.add(n.id);
                    matchedProcesses.push(n);
                }
            }
        });

        // 3. Fallback: If no processes found through item nodes, search direct processes under subcategory
        if (matchedProcesses.length === 0 && targetSubCatId) {
            nodes.forEach(n => {
                if (n.isProcess && n.parent === targetSubCatId && !seenProcIds.has(n.id)) {
                    seenProcIds.add(n.id);
                    matchedProcesses.push(n);
                }
            });
        }

        // 4. Fallback: All processes in preset if none matched branch
        if (matchedProcesses.length === 0) {
            nodes.forEach(n => {
                if (n.isProcess && !seenProcIds.has(n.id)) {
                    seenProcIds.add(n.id);
                    matchedProcesses.push(n);
                }
            });
        }

        AssetCreator.processNodes = matchedProcesses;
    },

    // Process Selection Persistence & Master Toggle
    getSavedSelectedProcesses: (presetId, subCatId) => {
        if (!presetId) return null;
        try {
            const key = 'pipeta_ac_selected_procs_' + presetId + (subCatId ? '_' + subCatId : '');
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return null;
    },

    saveSelectedProcesses: () => {
        if (!AssetCreator.selectedPreset) return;
        const presetId = AssetCreator.selectedPreset.id;
        const subCatId = AssetCreator.selectedSubCatId;
        const checked = Array.from(document.querySelectorAll('.ac-proc-chk:checked')).map(el => el.value);
        try {
            const key = 'pipeta_ac_selected_procs_' + presetId + (subCatId ? '_' + subCatId : '');
            localStorage.setItem(key, JSON.stringify(checked));
        } catch(e) {}
    },

    toggleAllProcesses: (checked) => {
        const checkboxes = document.querySelectorAll('.ac-proc-chk');
        checkboxes.forEach(cb => { cb.checked = checked; });
        AssetCreator.saveSelectedProcesses();
    },

    handleProcessCheckChange: () => {
        const checkboxes = Array.from(document.querySelectorAll('.ac-proc-chk'));
        const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
        const masterCb = document.getElementById('chk-proc-all-ac');
        if (masterCb) masterCb.checked = allChecked;
        AssetCreator.saveSelectedProcesses();
    },

    resolveContext: (customPath) => {
        AssetCreator.currentContext = { client: null, project: null, projectObj: null, mainCategory: null, category: null, valid: false, resolvedPath: null, isRoot: false };

        let path = customPath || (typeof selectedContextPath !== 'undefined' && selectedContextPath ? selectedContextPath.replace(/\\/g, '/') : null);

        // Fallback to active project if no path
        if (!path && typeof settings !== 'undefined' && settings.currentProject) {
            const proj = settings.currentProject;
            AssetCreator.currentContext.valid = true;
            AssetCreator.currentContext.projectObj = proj;
            AssetCreator.currentContext.client = proj.client || "cliente";
            AssetCreator.currentContext.project = proj.projectCode || proj.name;
            AssetCreator.currentContext.workRoot = (proj.roots?.work || "").replace(/\\/g, '/');
            AssetCreator.currentContext.mediaRoot = (proj.roots?.media || "").replace(/\\/g, '/');
            AssetCreator.currentContext.resolvedPath = AssetCreator.currentContext.workRoot;
            AssetCreator.currentContext.isRoot = true;
            path = AssetCreator.currentContext.workRoot;
        }

        if (!path) return;

        AssetCreator.currentContext.resolvedPath = path;

        // Match against known projects in settings
        if (typeof settings !== 'undefined' && settings.projects) {
            const pLower = path.toLowerCase();
            for (const proj of settings.projects) {
                const localRoot = proj.roots?.work ? proj.roots.work.replace(/\\/g, '/').toLowerCase() : "";
                const onlineRoot = proj.roots?.onlineWork ? proj.roots.onlineWork.replace(/\\/g, '/').toLowerCase() : "";

                if ((localRoot && pLower.startsWith(localRoot)) || (onlineRoot && pLower.startsWith(onlineRoot))) {
                    AssetCreator.currentContext.valid = true;
                    AssetCreator.currentContext.projectObj = proj;
                    AssetCreator.currentContext.client = proj.client;
                    AssetCreator.currentContext.project = proj.projectCode || proj.name;
                    AssetCreator.currentContext.workRoot = proj.roots?.work ? proj.roots.work.replace(/\\/g, '/') : "";

                    const activeRoot = localRoot && pLower.startsWith(localRoot) ? localRoot : onlineRoot;
                    let rel = path.substring(activeRoot.length);
                    if (rel.startsWith('/')) rel = rel.substring(1);
                    const parts = rel.split('/').filter(Boolean);

                    AssetCreator.currentContext.isRoot = (parts.length === 0);

                    // Try to match Main Category from path
                    if (parts.length > 0 && AssetCreator.mainCategoryNodes.length > 0) {
                        const mMatch = AssetCreator.mainCategoryNodes.find(m => m.name.toLowerCase() === parts[0].toLowerCase());
                        if (mMatch) {
                            AssetCreator.selectedMainCatId = mMatch.id;
                            AssetCreator.currentContext.mainCategory = mMatch;

                            // Try to match Subcategory from next path part
                            if (parts.length > 1) {
                                const subCats = AssetCreator.getSubCategories(mMatch.id);
                                const sMatch = subCats.find(s => s.name.toLowerCase() === parts[1].toLowerCase());
                                if (sMatch) {
                                    AssetCreator.selectedSubCatId = sMatch.id;
                                    AssetCreator.currentContext.category = sMatch;
                                }
                            }
                        }
                    } else if (parts.length > 0 && AssetCreator.categoryNodes.length > 0) {
                        const cMatch = AssetCreator.categoryNodes.find(c => c.name.toLowerCase() === parts[0].toLowerCase());
                        if (cMatch) {
                            AssetCreator.selectedSubCatId = cMatch.id;
                            AssetCreator.currentContext.category = cMatch;
                        }
                    }

                    AssetCreator.updateProcessesForSelection();
                    return;
                }
            }
        }

        // Active project fallback if path wasn't inside known project roots
        if (!AssetCreator.currentContext.valid && typeof settings !== 'undefined' && settings.currentProject) {
            const proj = settings.currentProject;
            AssetCreator.currentContext.valid = true;
            AssetCreator.currentContext.projectObj = proj;
            AssetCreator.currentContext.client = proj.client || "cliente";
            AssetCreator.currentContext.project = proj.projectCode || proj.name;
            AssetCreator.currentContext.workRoot = (proj.roots?.work || "").replace(/\\/g, '/');
            AssetCreator.currentContext.mediaRoot = (proj.roots?.media || "").replace(/\\/g, '/');
        }

        AssetCreator.updateProcessesForSelection();
    },

    handleMainCategoryChange: (mainCatId) => {
        AssetCreator.selectedMainCatId = mainCatId;
        const subCats = AssetCreator.getSubCategories(mainCatId);
        AssetCreator.selectedSubCatId = subCats.length > 0 ? subCats[0].id : null;
        AssetCreator.updateProcessesForSelection();

        if (AssetCreator.mode === 'batch') {
            AssetCreator.loadAssetsForCategory();
        }
        AssetCreator.render();
    },

    handleSubCategoryChange: (subCatId) => {
        AssetCreator.selectedSubCatId = subCatId;
        AssetCreator.updateProcessesForSelection();

        if (AssetCreator.mode === 'batch') {
            AssetCreator.loadAssetsForCategory();
        }
        AssetCreator.render();
    },

    render: () => {
        if (!AssetCreator.container) return;

        const currentProjId = (AssetCreator.currentContext?.projectObj?.id) || (typeof settings !== 'undefined' && settings.currentProject ? settings.currentProject.id : '');
        const projectOptions = (typeof settings !== 'undefined' && settings.projects ? settings.projects : []).map(p =>
            `<option value="${p.id}" ${p.id === currentProjId ? 'selected' : ''}>${p.name}</option>`
        ).join('');

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
            let contextMsg = ctx.valid
                ? '<span style="color:#8f8; font-weight:bold;">✓ Contexto Válido</span>'
                : '<span style="color:#f88; font-weight:bold;">⚠ Contexto Desconocido</span>';

            // --- CATEGORY & SUBCATEGORY SELECTORS ---
            const hasMainCats = AssetCreator.mainCategoryNodes.length > 0;
            const mainCatOpts = AssetCreator.mainCategoryNodes.map(m =>
                `<option value="${m.id}" ${m.id === AssetCreator.selectedMainCatId ? 'selected' : ''}>${m.name}</option>`
            ).join('');

            const availableSubCats = AssetCreator.getSubCategories(AssetCreator.selectedMainCatId);
            const subCatOpts = availableSubCats.map(s =>
                `<option value="${s.id}" ${s.id === AssetCreator.selectedSubCatId ? 'selected' : ''}>${s.name}</option>`
            ).join('');

            let categoryHTML = '';
            if (hasMainCats) {
                categoryHTML = `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                        <div class="form-group compact">
                            <label style="color:#ffca28; font-weight:bold;">Categoría Principal</label>
                            <select id="ac-main-category-select" onchange="AssetCreator.handleMainCategoryChange(this.value)" style="width:100%; padding:6px; background:#222; color:white; border:1px solid #ff9800; border-radius:4px; font-weight:bold;">
                                ${mainCatOpts}
                            </select>
                        </div>
                        <div class="form-group compact">
                            <label style="color:#4fc3f7; font-weight:bold;">Subcategoría</label>
                            <select id="ac-sub-category-select" onchange="AssetCreator.handleSubCategoryChange(this.value)" style="width:100%; padding:6px; background:#222; color:white; border:1px solid #2196f3; border-radius:4px; font-weight:bold;">
                                ${subCatOpts}
                            </select>
                        </div>
                    </div>
                `;
            } else {
                categoryHTML = `
                    <div class="form-group compact">
                        <label style="color:#ffca28; font-weight:bold;">Categoría</label>
                        <select id="ac-sub-category-select" onchange="AssetCreator.handleSubCategoryChange(this.value)" style="width:100%; padding:6px; background:#222; color:white; border:1px solid #444; border-radius:4px;">
                            ${subCatOpts}
                        </select>
                    </div>
                `;
            }

            // --- PROCESSES CHECKBOXES ---
            let processesItemsHTML = "";
            const savedProcs = AssetCreator.getSavedSelectedProcesses(AssetCreator.selectedPreset.id, AssetCreator.selectedSubCatId);
            const allProcsChecked = AssetCreator.processNodes.length > 0 && (
                savedProcs === null || 
                AssetCreator.processNodes.every(p => savedProcs.includes(p.id))
            );

            if (AssetCreator.processNodes.length === 0) {
                processesItemsHTML += '<div style="color:#666; font-style:italic; font-size:0.8rem; padding:10px; text-align:center;">No hay procesos configurados para esta subcategoría.</div>';
            } else {
                AssetCreator.processNodes.forEach(proc => {
                    const isChecked = savedProcs === null ? true : savedProcs.includes(proc.id);
                    processesItemsHTML += `
                        <div style="display:flex; align-items:center; margin-bottom:6px; padding:4px 6px; background:rgba(255,255,255,0.03); border-radius:3px;">
                            <input type="checkbox" id="chk-proc-${proc.id}" ${isChecked ? 'checked' : ''} class="ac-proc-chk" value="${proc.id}" onchange="AssetCreator.handleProcessCheckChange()" style="accent-color:var(--accent); cursor:pointer;">
                            <label for="chk-proc-${proc.id}" style="margin-left:8px; font-size:0.9rem; cursor:pointer; user-select:none; color:#eee; font-weight:500;">${proc.name}</label>
                        </div>
                    `;
                });
            }

            contentHTML = `
                <div style="display:flex; gap:20px; height:100%; overflow:hidden;">
                    <!-- LEFT COLUMN: Config -->
                    <div style="flex:1.1; display:flex; flex-direction:column; gap:10px;">
                        
                        <!-- Context Box -->
                        <div style="font-size:0.85rem; padding:10px; background:#1c1c1c; border-radius:4px; border-left: 4px solid ${ctx.valid ? '#4CAF50' : '#F44336'};">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span style="color:#888;">Cliente:</span> <b style="color:#fff;">${ctx.client || '?'}</b>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span style="color:#888;">Proyecto:</span> <b style="color:#fff;">${ctx.project || '?'}</b>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span style="color:#888;">Ruta Destino:</span> <span style="color:#aaa; font-family:monospace; font-size:0.75rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px;" title="${AssetCreator.getTargetCategoryPath()}">${AssetCreator.getTargetCategoryPath() || '-'}</span>
                            </div>
                            <div style="text-align:right; font-size:0.75rem; margin-top:4px;">${contextMsg}</div>
                        </div>

                        ${categoryHTML}
                        
                        <!-- MODE TOGGLE -->
                        <div style="display:flex; margin-top:2px; margin-bottom:6px; border:1px solid #444; border-radius:4px; overflow:hidden;">
                             <button onclick="AssetCreator.switchMode('create')" style="flex:1; padding:7px; border:none; cursor:pointer; background:${AssetCreator.mode === 'create' ? 'var(--accent)' : '#222'}; color:${AssetCreator.mode === 'create' ? '#000' : '#aaa'}; font-weight:bold; font-size:0.85rem;">Nuevo Asset</button>
                             <button onclick="AssetCreator.switchMode('batch')" style="flex:1; padding:7px; border:none; cursor:pointer; background:${AssetCreator.mode === 'batch' ? 'var(--accent)' : '#222'}; color:${AssetCreator.mode === 'batch' ? '#000' : '#aaa'}; font-weight:bold; font-size:0.85rem;">Inyectar Procesos</button>
                        </div>

                        ${AssetCreator.mode === 'create' ? `
                            <div class="form-group compact">
                                <label style="font-weight:bold;">Nombre del Asset</label>
                                <input type="text" id="ac-asset-name" placeholder="Ej: Character_Name, Prop_Sword, etc." value="" style="width:100%; padding:8px; background:#000; color:#fff; border:1px solid var(--accent); font-weight:bold; font-size:1rem; border-radius:4px; box-sizing:border-box;">
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
                    `<button onclick="AssetCreator.toggleSelectAll()" style="font-size:0.7rem; padding:2px 6px; background:#444; border:none; color:white; cursor:pointer; border-radius:3px;">${AssetCreator.selectedAssets.length === AssetCreator.foundAssets.length && AssetCreator.foundAssets.length > 0 ? 'Deseleccionar' : 'Todos'}</button>`
                    : ''}
                                </div>
                                <div style="flex:1; overflow-y:auto; background:#111; border:1px solid #333; padding:5px; border-radius:4px;">
                                    ${AssetCreator.renderAssetList()}
                                </div>
                            </div>
                        `}
                    </div>

                    <!-- RIGHT COLUMN: Processes & Options -->
                    <div style="flex:0.9; display:flex; flex-direction:column; gap:10px;">
                        
                        <!-- Processes List -->
                        <div style="flex:1; background:#181818; padding:10px; border-radius:4px; border:1px solid #333; display:flex; flex-direction:column; overflow:hidden;">
                             <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #333; padding-bottom:6px;">
                                 <label style="color:#aaa; font-weight:bold; font-size:0.85rem; margin:0;">Procesos a Crear (${AssetCreator.processNodes.length})</label>
                                 <div style="display:flex; align-items:center; gap:6px;">
                                     <input type="checkbox" id="chk-proc-all-ac" ${allProcsChecked ? 'checked' : ''} 
                                            onchange="AssetCreator.toggleAllProcesses(this.checked)" 
                                            style="accent-color:var(--accent); cursor:pointer; width:13px; height:13px;">
                                     <label for="chk-proc-all-ac" style="font-size:0.75rem; color:var(--accent); cursor:pointer; user-select:none; font-weight:bold; margin-bottom:0;">Todos</label>
                                 </div>
                             </div>
                             <div style="flex:1; overflow-y:auto; padding-right:4px;">
                                 ${processesItemsHTML}
                             </div>
                        </div>

                        <!-- File Options -->
                        <div style="flex:0 0 auto; background:#181818; padding:10px; border-radius:4px; border:1px solid #333;">
                             <label style="display:block; margin-bottom:8px; color:#aaa; font-weight:bold; font-size:0.85rem; border-bottom:1px solid #333; padding-bottom:4px;">Opciones de Archivo</label>
                             
                             <div style="display:flex; align-items:center; margin-bottom:6px;">
                                 <input type="checkbox" id="chk-v0-files" onchange="AssetCreator.createVersionZero = this.checked" ${AssetCreator.createVersionZero ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;">
                                 <label for="chk-v0-files" style="margin-left:8px; font-size:0.85rem; cursor:pointer; color:#ccc;">Crear Archivos Versión Cero (.txt)</label>
                             </div>

                             <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                                 <div style="display:flex; align-items:center;">
                                     <input type="checkbox" id="chk-template-v001-ac" onchange="AssetCreator.toggleTemplateV001(this.checked)" ${AssetCreator.createTemplateV001 ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;">
                                     <label for="chk-template-v001-ac" style="margin-left:8px; font-size:0.85rem; color:#fff; font-weight:bold; cursor:pointer;">📄 Crear v001 con Template</label>
                                 </div>

                                 ${AssetCreator.createTemplateV001 ? `
                                     <div style="display:flex; flex-direction:column; gap:8px; padding:10px; background:#12151c; border:1px solid #28303d; border-radius:4px; margin-left:22px; font-size:0.8rem;">
                                         <div>
                                             <label style="color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">Origen del Template:</label>
                                             <select onchange="AssetCreator.setTemplateSource(this.value)" style="width:100%; background:#1c222d; border:1px solid #3a4556; color:#fff; padding:4px 8px; border-radius:3px; font-size:0.8rem;">
                                                 <option value="reference" ${AssetCreator.templateSource === 'reference' ? 'selected' : ''}>⭐ Reference Asset (Default Proyecto)</option>
                                                 <option value="custom" ${AssetCreator.templateSource === 'custom' ? 'selected' : ''}>🛠️ Custom Template (Configurado por Proceso)</option>
                                                 <option value="manual" ${AssetCreator.templateSource === 'manual' ? 'selected' : ''}>📁 Create From... (Elegir archivo a mano)</option>
                                             </select>
                                         </div>

                                         ${AssetCreator.templateSource === 'reference' ? `
                                             <div style="color:#888; font-size:0.75rem; background:#181d26; padding:6px 8px; border-radius:3px; border:1px solid #28303d;">
                                                 Ruta: <b style="color:var(--accent); font-family:monospace;">${settings?.currentProject?.templates?.referenceAssetRoot || 'assets2D/templates'}</b>
                                                 <div style="color:#666; margin-top:2px;">Clona la última versión encontrada en esa carpeta.</div>
                                             </div>
                                         ` : ''}

                                         ${AssetCreator.templateSource === 'custom' ? `
                                             <div style="color:#888; font-size:0.75rem; background:#181d26; padding:6px 8px; border-radius:3px; border:1px solid #28303d;">
                                                 <span>Usa los templates específicos configurados por proceso en <b>Configuración > Proyectos > Templates</b>.</span>
                                             </div>
                                         ` : ''}

                                         ${AssetCreator.templateSource === 'manual' ? `
                                             <div style="display:flex; flex-direction:column; gap:4px;">
                                                 <label style="color:#aaa; font-size:0.75rem;">Archivo Base a Clonar:</label>
                                                 <div style="display:flex; gap:6px;">
                                                     <input type="text" value="${escapeHtml(AssetCreator.manualTemplatePath || '')}" 
                                                            placeholder="Seleccionar archivo .blend, .psd, .hip..." 
                                                            onchange="AssetCreator.manualTemplatePath = this.value; localStorage.setItem('pipeta_ac_manual_template_path', this.value);"
                                                            style="flex:1; background:#1c222d; border:1px solid #3a4556; color:#fff; padding:4px 6px; font-size:0.75rem; border-radius:3px; font-family:monospace;">
                                                     <button class="btn" onclick="AssetCreator.browseManualTemplate()" style="background:#263238; border:1px solid #37474f; color:#fff; padding:4px 8px; font-size:0.75rem; cursor:pointer;">📁</button>
                                                 </div>
                                             </div>
                                         ` : ''}
                                     </div>
                                 ` : ''}
                             </div>

                             <div style="display:flex; align-items:center;">
                                 <input type="checkbox" id="ac-inject-meta" checked style="accent-color:#4CAF50; cursor:pointer;">
                                 <label for="ac-inject-meta" title="Inyecta un archivo vfx_control.json con metadatos del preset" style="margin-left:8px; color:#888; font-size:0.8rem; cursor:pointer;">Inyectar vfx_control.json</label>
                             </div>
                        </div>
                    </div>
                </div>
            `;

            createBtnState = '';
        } else {
            contentHTML = '<div style="flex:1; display:flex; align-items:center; justify-content:center; color:#666; font-style:italic;">Selecciona un preset para comenzar.</div>';
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
            
            <div class="validator-body" style="padding: 16px 20px; display:flex; flex-direction: column; background:#111; position:relative;">
                ${overlayHTML}
                <div style="display:flex; gap:15px; margin-top:0; margin-bottom:12px;">
                    <div class="form-group" style="flex:1; margin:0;">
                        <label style="color:#888; font-size:0.8rem;">Proyecto</label>
                        <select onchange="AssetCreator.selectProject(this.value)" style="width:100%; padding:7px; background:#222; color:white; border:1px solid #444; border-radius:4px; font-size:0.95rem;">
                            ${projectOptions}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1; margin:0;">
                        <label style="color:#888; font-size:0.8rem;">Preset Seleccionado</label>
                        <select onchange="AssetCreator.selectPreset(this.value)" style="width:100%; padding:7px; background:#222; color:white; border:1px solid #444; border-radius:4px; font-size:0.95rem;">
                            <option value="">-- Seleccionar --</option>
                            ${presetOptions}
                        </select>
                    </div>
                </div>
                ${contentHTML}
            </div>
            
            <div class="settings-footer" style="padding: 12px 20px; border-top:1px solid #222; display:flex; align-items:center;">
                <div style="flex:1"></div>
                <button class="btn btn-primary" onclick="AssetCreator.validateAndConfirm()" style="background:var(--accent); color:black; border:none; padding:10px 28px; border-radius:4px; font-weight:bold; font-size:0.95rem; cursor:pointer; opacity:${createBtnState ? '0.5' : '1'}; pointer-events:${createBtnState ? 'none' : 'all'};">CREAR ESTRUCTURA</button>
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

        // 2. Resolve Target Category Path
        const targetCategoryPath = AssetCreator.getTargetCategoryPath();
        if (!targetCategoryPath) {
            AssetCreator.showOverlay(`
                <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                <div style="font-size:1.2rem; color:#fff; margin-bottom:20px;">Selecciona una Categoría Válida</div>
                <button onclick="AssetCreator.hideOverlay()" style="padding:8px 20px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer;">Entendido</button>
            `);
            return;
        }

        // 3. Get Selected Processes
        const checkedProcsInputs = Array.from(document.querySelectorAll('.ac-proc-chk:checked'));
        const checkedProcs = checkedProcsInputs.map(cb => cb.value);

        let processListHTML = "";
        if (checkedProcs.length > 0) {
            const names = checkedProcsInputs.map(cb => {
                const label = document.querySelector(`label[for="${cb.id}"]`);
                return label ? label.innerText : cb.value;
            });
            processListHTML = `<ul style="text-align:left; margin:10px 0; color:#ccc; max-height:120px; overflow-y:auto;">${names.map(n => `<li>${n}</li>`).join('')}</ul>`;
        } else {
            processListHTML = '<div style="color:#666; margin:10px 0;">(Sin procesos adicionales)</div>';
        }

        // 4. Construct Preview Msg
        let title = AssetCreator.mode === 'create' ? "Crear Asset" : "Inyectar en Assets";
        let targetMsg = AssetCreator.mode === 'create'
            ? `<div style="font-size:1.4rem; color:var(--accent); font-weight:bold; margin-bottom:5px;">${assetName}</div><div style="font-size:0.8rem; color:#888;">En: ${targetCategoryPath}</div>`
            : `<div style="font-size:1.2rem; color:var(--accent); font-weight:bold; margin-bottom:5px;">${targets.length} Assets Seleccionados</div><div style="font-size:0.8rem; color:#888;">En: ${targetCategoryPath}</div>`;

        // Save execution context
        AssetCreator.pendingCreation = {
            mode: AssetCreator.mode,
            assetName,
            categoryPath: targetCategoryPath,
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
                     <span style="color:#888;">Procesos a crear:</span>
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
        const { mode, assetName, categoryPath, targets, checkedProcs, injectMeta } = AssetCreator.pendingCreation;

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('create', `[ASSET CREATOR] 🎨 ${mode === 'create' ? `Creando nuevo asset '${assetName}'` : `Inyectando procesos en ${targets.length} asset(s)`} en ${categoryPath} [Preset: ${AssetCreator.selectedPreset?.name || 'Asset Preset'}]`, 'info');
        }

        // Change Overlay to Loading
        AssetCreator.showOverlay(`
            <div class="spinner-large" style="border-top-color:var(--accent);"></div>
            <div style="margin-top:15px; color:#ccc;">${mode === 'create' ? 'Creando estructura...' : 'Inyectando procesos...'}</div>
        `);

        // Ensure Category Directory exists
        try { await API.fs.mkdir(categoryPath); } catch (e) { }

        // Find relevant item node for this subcategory
        const nodes = AssetCreator.selectedPreset.nodes;
        const targetSubCatId = AssetCreator.selectedSubCatId;
        const targetMainCatId = AssetCreator.selectedMainCatId;

        let itemNode = nodes.find(n => 
            (n.isItem || n.isAssetFocus || n.isVariable) && 
            (n.parent === targetSubCatId || (targetSubCatId && n.id === targetSubCatId) || (!targetSubCatId && n.parent === targetMainCatId))
        );

        if (!itemNode) {
            itemNode = nodes.find(n => n.isAssetFocus || n.name === 'ASSET');
        }

        try {
            if (mode === 'create') {
                const assetRootPath = (categoryPath + "/" + assetName).replace(/\/+/g, '/');
                const res = await API.fs.mkdir(assetRootPath);
                if (res && res.error) throw new Error(res.error);

                if (itemNode && injectMeta) {
                    await AssetCreator.writeMetadataFile(itemNode, assetRootPath);
                }

                // Create all checked processes inside the new asset folder
                for (const procId of checkedProcs) {
                    const procNode = nodes.find(n => n.id === procId);
                    if (procNode) {
                        const procPath = assetRootPath + "/" + procNode.name;
                        try { await API.fs.mkdir(procPath); } catch (e) { }
                        if (injectMeta) await AssetCreator.writeMetadataFile(procNode, procPath);
                        await AssetCreator.createNodesRecursively(procNode.id, procPath, nodes, checkedProcs, assetName, injectMeta);
                    }
                }

                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('create', ` ↳ [ASSET] 📁 Estructura creada: ${assetRootPath}`, 'ok');
                }
            } else {
                // Batch injection
                for (const assetPath of targets) {
                    const currentAssetName = assetPath.trim().replace(/\\/g, '/').split('/').pop();
                    if (itemNode && injectMeta) {
                        await AssetCreator.writeMetadataFile(itemNode, assetPath);
                    }

                    for (const procId of checkedProcs) {
                        const procNode = nodes.find(n => n.id === procId);
                        if (procNode) {
                            const procPath = (assetPath + "/" + procNode.name).replace(/\/+/g, '/');
                            try { await API.fs.mkdir(procPath); } catch (e) { }
                            if (injectMeta) await AssetCreator.writeMetadataFile(procNode, procPath);
                            await AssetCreator.createNodesRecursively(procNode.id, procPath, nodes, checkedProcs, currentAssetName, injectMeta);
                        }
                    }

                    if (typeof PipetaConsole !== 'undefined') {
                        PipetaConsole.log('create', ` ↳ [ASSET INJECT] 📁 Procesos inyectados en: ${assetPath}`, 'ok');
                    }
                }
            }
        } catch (e) {
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('create', `[ASSET CREATOR] ❌ Error en creación: ${e.message}`, 'error');
            }
            AssetCreator.showOverlay(`
                <div style="font-size:2rem; margin-bottom:10px;">❌</div>
                <div style="font-size:1.2rem; color:#F44336; margin-bottom:10px;">Error</div>
                <div style="color:#aaa; font-size:0.9rem;">${e.message}</div>
                <button onclick="AssetCreator.hideOverlay()" style="margin-top:15px; padding:8px 20px; background:#333; color:white; border:none; border-radius:4px;">Cerrar</button>
             `);
            return;
        }

        // SUCCESS
        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('create', `[ASSET CREATOR] ✅ ${mode === 'create' ? `Asset '${assetName}' creado con éxito` : `Inyección completada en ${targets.length} asset(s)`}`, 'ok');
        }

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
                AssetCreator.render();
            }
        }, 1800);
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
        const metaPath = (fullPath + "/vfx_control.json").replace(/\/+/g, '/');
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
            const isProcessNode = child.isProcess;
            if (isProcessNode) {
                if (!allowedProcesses.includes(child.id)) {
                    continue;
                }
            }

            if (child.type === 'file') {
                let procName = "Process";
                let tempCurr = child;
                while (tempCurr) {
                    const p = allNodes.find(n => n.id === tempCurr.parent);
                    if (p && p.isProcess) {
                        procName = p.name;
                        break;
                    }
                    tempCurr = p;
                    if (!tempCurr) break;
                }

                let templateCopied = false;
                if (AssetCreator.createTemplateV001) {
                    const tpl = await AssetCreator.getTemplateFileForProcess(procName, child);
                    if (tpl && tpl.sourcePath) {
                        let fileName = child.name;
                        if (child.nameConfig && child.nameConfig.enabled && child.nameConfig.pattern) {
                            fileName = child.nameConfig.pattern;
                        }

                        if (assetName) {
                            fileName = fileName.replace(/\[ASSET\]/gi, assetName)
                                .replace(/{Asset}/gi, assetName)
                                .replace(/{{Asset}}/gi, assetName);
                        }

                        fileName = fileName.replace(/\[PROC\]/gi, procName).replace(/\[PROCESO\]/gi, procName);

                        if (fileName.match(/\[VER\]|\[version\]/i)) {
                            const pad = child.nameConfig?.versionPadding || 3;
                            const prefix = (child.nameConfig?.versionPrefix !== false) ? 'v' : '';
                            const vStr = prefix + '1'.padStart(pad, '0');
                            fileName = fileName.replace(/\[VER\]/gi, vStr).replace(/\[version\]/gi, vStr);
                        }

                        fileName = fileName.replace(/\.?\[ext\]/gi, '');
                        const lastDot = fileName.lastIndexOf('.');
                        if (lastDot !== -1 && lastDot > 0 && (fileName.length - lastDot) <= 5) {
                            fileName = fileName.substring(0, lastDot);
                        }
                        fileName += tpl.ext;

                        const ctx = AssetCreator.currentContext;
                        if (ctx.client) fileName = fileName.replace(/\[Client\]/gi, ctx.client).replace(/{Client}/gi, ctx.client);
                        if (ctx.project) fileName = fileName.replace(/\[Project\]/gi, ctx.project).replace(/{Project}/gi, ctx.project);

                        const fullPath = (parentPath + "/" + fileName).replace(/\/+/g, '/');
                        try {
                            await API.fs.copy(tpl.sourcePath, fullPath);
                            templateCopied = true;
                            console.log("[AssetCreator] Template v001 created:", fullPath, "from:", tpl.sourcePath);
                        } catch(err) {
                            console.error("[AssetCreator] Error copying template v001:", err);
                        }
                    }
                }

                if (!templateCopied && AssetCreator.createVersionZero) {
                    let fileName = child.name;
                    if (child.nameConfig && child.nameConfig.enabled && child.nameConfig.pattern) {
                        fileName = child.nameConfig.pattern;
                    }

                    // Variable Replacements
                    if (assetName) {
                        fileName = fileName.replace(/\[ASSET\]/gi, assetName)
                            .replace(/{Asset}/gi, assetName)
                            .replace(/{{Asset}}/gi, assetName);
                    }

                    fileName = fileName.replace(/\[PROC\]/gi, procName).replace(/\[PROCESO\]/gi, procName);

                    if (fileName.match(/\[VER\]|\[version\]/i)) {
                        const pad = child.nameConfig?.versionPadding || 3;
                        const prefix = (child.nameConfig?.versionPrefix !== false) ? 'v' : '';
                        const vStr = prefix + '0'.padStart(pad, '0');
                        fileName = fileName.replace(/\[VER\]/gi, vStr).replace(/\[version\]/gi, vStr);
                    }

                    fileName = fileName.replace(/\.?\[ext\]/gi, '');
                    const lastDot = fileName.lastIndexOf('.');
                    if (lastDot !== -1 && lastDot > 0 && (fileName.length - lastDot) <= 5) {
                        fileName = fileName.substring(0, lastDot);
                    }

                    fileName += ".txt";

                    const ctx = AssetCreator.currentContext;
                    if (ctx.client) fileName = fileName.replace(/\[Client\]/gi, ctx.client).replace(/{Client}/gi, ctx.client);
                    if (ctx.project) fileName = fileName.replace(/\[Project\]/gi, ctx.project).replace(/{Project}/gi, ctx.project);

                    const fullPath = (parentPath + "/" + fileName).replace(/\/+/g, '/');
                    try {
                        await API.fs.writeFile(fullPath, "");
                    } catch (e) {
                        console.error("Error creating v0 file:", fullPath, e);
                    }
                }
                continue;
            }

            const fullPath = (parentPath + "/" + child.name).replace(/\/+/g, '/');
            try { await API.fs.mkdir(fullPath); } catch (e) { }

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
                AssetCreator.container.style.transform = "none";
            };
        };
    }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => AssetCreator.init());
