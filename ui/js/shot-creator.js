// ------------------------------------------
// --- SHOT CREATOR MODULE ---
// ------------------------------------------

const ShotCreator = {
    isVisible: false,
    container: null,
    currentContext: { client: null, project: null, category: null, valid: false },
    categoryNodes: [], // In Shot context, this might be Sequences or Episodes if marked as Category
    processNodes: [],
    mediaFolderNodes: [], // For mirror path subfolders
    presets: [],
    selectedPreset: null,
    presetsPath: "C:\\TOOLS\\APPS\\Pipeta\\presets\\ShotDesigner",
    autoNamingEnabled: false,
    createVersionZero: true,
    createTemplateV001: localStorage.getItem('pipeta_sc_create_template_v001') === 'true',
    templateSource: localStorage.getItem('pipeta_sc_template_source') || 'reference',
    manualTemplatePath: localStorage.getItem('pipeta_sc_manual_template_path') || '',
    systemInfo: { username: "unknown" },

    toggleTemplateV001: (checked) => {
        ShotCreator.createTemplateV001 = checked;
        localStorage.setItem('pipeta_sc_create_template_v001', checked ? 'true' : 'false');
        ShotCreator.render();
    },

    setTemplateSource: (source) => {
        ShotCreator.templateSource = source;
        localStorage.setItem('pipeta_sc_template_source', source);
        ShotCreator.render();
    },

    browseManualTemplate: async () => {
        const res = await API.system.pickFile('Z:\\', 'Archivos de Template (*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt)|*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt|Todos los archivos (*.*)|*.*');
        if (res && res.success && res.path) {
            ShotCreator.manualTemplatePath = res.path;
            localStorage.setItem('pipeta_sc_manual_template_path', res.path);
            ShotCreator.render();
        }
    },

    getTemplateFileForProcess: async (processName, childNode) => {
        const cleanProc = (processName || '').toLowerCase().trim();
        const activeProjId = localStorage.getItem('pipeta_active_project_id');
        let currentProj = (settings?.projects || []).find(p => p.id === activeProjId) || settings?.currentProject;

        if (ShotCreator.templateSource === 'manual') {
            if (ShotCreator.manualTemplatePath) {
                const ext = '.' + ShotCreator.manualTemplatePath.split('.').pop();
                return { sourcePath: ShotCreator.manualTemplatePath, ext: ext };
            }
            return null;
        }

        if (ShotCreator.templateSource === 'custom') {
            const customMap = currentProj?.templates?.customTemplates?.shots || {};
            const customPath = customMap[cleanProc] || customMap[processName];
            if (customPath) {
                const ext = '.' + customPath.split('.').pop();
                return { sourcePath: customPath, ext: ext };
            }
            return null;
        }

        // Default: 'reference'
        const workRoot = currentProj?.roots?.work || ShotCreator.getWorkRoot() || 'Z:/';
        const refSub = currentProj?.templates?.referenceShotRoot || 'episodios/templates';
        const fullRefRoot = refSub.startsWith('Z:') || refSub.startsWith('C:') || refSub.startsWith('/') ? refSub : `${workRoot}/${refSub}`.replace(/\\/g, '/');

        try {
            const res = await API.templates.findReference(fullRefRoot, cleanProc);
            if (res && res.found && res.filePath) {
                return { sourcePath: res.filePath, ext: res.ext || ('.' + res.fileName.split('.').pop()) };
            }
        } catch(e) {
            console.error("Error looking up reference template in ShotCreator:", e);
        }
        return null;
    },

    // Batch Mode State
    // Hierarchy State
    hierarchy: {
        episodes: [],
        scenes: []
    },
    creationLevel: 'shot', // 'episode' | 'scene' | 'shot'
    selectedParentEpisode: null,
    selectedParentScene: null,

    switchMode: (newMode) => {
        ShotCreator.mode = newMode;
        if (newMode === 'batch') {
            ShotCreator.loadShotsForCategory();
        }
        ShotCreator.render();
    },

    setCreationLevel: async (level) => {
        ShotCreator.creationLevel = level;
        await ShotCreator.loadHierarchy(level);
        ShotCreator.render();
    },

    loadHierarchy: async (targetLevel) => {
        // We only need to load episodes if level is scene or shot
        // We only need to load scenes if level is shot AND we have an episode selected
        if (targetLevel === 'episode') return;

        ShotCreator.hierarchy.episodes = [];
        let seqRoot = ShotCreator.getSequencesRoot();

        if (seqRoot) {
            try {
                const data = await API.fetchDir(seqRoot);
                if (data && data.items) {
                    ShotCreator.hierarchy.episodes = data.items.filter(i => i.isDirectory).map(i => i.name).sort();
                }
            } catch (e) { console.error("Error loading Episodes", e); }
        }

        if (targetLevel === 'shot' && ShotCreator.selectedParentEpisode) {
            await ShotCreator.loadScenesForEpisode(ShotCreator.selectedParentEpisode);
        }
    },

    loadScenesForEpisode: async (episodeName) => {
        ShotCreator.hierarchy.scenes = [];
        if (!episodeName || !ShotCreator.selectedPreset) return;

        // Use getFullResolvedPath with a dummy name to find where scenes live
        // We Temporarily set selectedParentEpisode to ensure the path is resolved for the target episode
        const prevEp = ShotCreator.selectedParentEpisode;
        ShotCreator.selectedParentEpisode = episodeName;
        const dummyPath = ShotCreator.getFullResolvedPath('scene', 'DUMMY');
        ShotCreator.selectedParentEpisode = prevEp;

        if (dummyPath) {
            try {
                const folderPath = dummyPath.substring(0, dummyPath.lastIndexOf('/'));
                console.log("ShotCreator: Loading scenes from", folderPath);
                const data = await API.fetchDir(folderPath);
                if (data && data.items) {
                    // Filter: Only directories
                    ShotCreator.hierarchy.scenes = data.items.filter(i => i.isDirectory).map(i => i.name).sort();
                }
            } catch (e) {
                console.warn("ShotCreator: Error listing scenes directory", e);
            }
        }
    },

    // Helper to find the relative path from Project Node to the Container of the target level
    getRelativeContainerPath: (level) => {
        if (!ShotCreator.selectedPreset || !ShotCreator.selectedPreset.nodes) return null;

        let targetNode = null;
        if (level === 'episode') targetNode = ShotCreator.selectedPreset.nodes.find(n => n.isEpisode);
        else if (level === 'scene') targetNode = ShotCreator.selectedPreset.nodes.find(n => n.isScene);
        else if (level === 'shot') targetNode = ShotCreator.selectedPreset.nodes.find(n => n.isShot || n.isAssetFocus);

        if (!targetNode) return null;

        // We want the path to the PARENT of the target node (the container)
        // e.g. if Episode is in "episodios", we want "episodios"
        // if Episode is child of Project directly, result is ""

        let pathParts = [];
        let currentNode = ShotCreator.selectedPreset.nodes.find(n => n.id === targetNode.parent);

        while (currentNode) {
            // Stop if we hit Project Node, Client Node, or Root (assuming context handles up to Project)
            if (currentNode.isProjectNode || currentNode.isClientNode || currentNode.id === 'root') {
                break;
            }
            pathParts.unshift(currentNode.name);
            currentNode = ShotCreator.selectedPreset.nodes.find(n => n.id === currentNode.parent);
        }

        return pathParts.join('/');
    },

    // New Helper to build the final path on disk for a target item (Episode, Scene or Shot)
    // based on the preset hierarchy and selected parents.
    getFullResolvedPath: (level, itemName, isMirror = false) => {
        if (!ShotCreator.selectedPreset || !ShotCreator.selectedPreset.nodes) return null;

        // 1. Find the target node in the preset
        let targetNode = null;
        if (level === 'episode') targetNode = ShotCreator.selectedPreset.nodes.find(n => n.isEpisode);
        else if (level === 'scene') targetNode = ShotCreator.selectedPreset.nodes.find(n => n.isScene);
        else if (level === 'shot') targetNode = ShotCreator.selectedPreset.nodes.find(n => n.isShot || n.isAssetFocus);

        if (!targetNode) return null;

        // 2. If Mirror, find the mirror node
        if (isMirror) {
            const mirrorConn = ShotCreator.selectedPreset.connections?.find(c =>
                (c.from === targetNode.id || c.to === targetNode.id) && (c.fromPort === 'mirror' || c.toPort === 'mirror')
            );
            if (!mirrorConn) return null;
            const mirrorNodeId = (mirrorConn.from === targetNode.id) ? mirrorConn.to : mirrorConn.from;
            targetNode = ShotCreator.selectedPreset.nodes.find(n => n.id === mirrorNodeId);
            if (!targetNode) return null;
        }

        // 3. Traverse UP all the way to root / unit to build exact path
        let pathParts = [];
        let currentNode = targetNode;
        let hasUnitRoot = false;

        const projNode = ShotCreator.selectedPreset.nodes.find(n => n.isProjectNode);
        const projNick = projNode?.nickExample || projNode?.nickVarName || "SURF";
        const epVal = (level === 'episode') ? itemName : (ShotCreator.selectedParentEpisode || "EPISODIO");
        const scnVal = (level === 'scene') ? itemName : (ShotCreator.selectedParentScene || "ESCENA");
        const shotVal = itemName;

        const pathCtx = {
            project: ShotCreator.currentContext.project || projNode?.name || "PROYECTO",
            client: ShotCreator.currentContext.client || "CLIENTE",
            episode: epVal,
            scene: scnVal,
            shot: shotVal,
            nick: projNick,
            vars: {
                'NICK': projNick,
                'EP': epVal,
                'ESC': scnVal,
                'SEQ': scnVal,
                'SHOT': shotVal
            }
        };

        while (currentNode) {
            if (currentNode.type === 'unit' || currentNode.id === 'root') {
                let unitName = currentNode.name.replace(/[:/\\]/g, '');
                pathParts.unshift(unitName + ':');
                hasUnitRoot = true;
                break;
            }

            let name = currentNode.name;

            const nodeNameLower = (currentNode.name || '').toLowerCase();
            const nodeVarLower = (currentNode.variableName || '').toLowerCase();
            const isClientNode = currentNode.isClientNode || nodeNameLower === 'cliente' || ['cliente', 'client'].includes(nodeVarLower);
            const isProjectNode = currentNode.isProjectNode || ['proyecto', 'proy', 'project'].includes(nodeNameLower) || ['proyecto', 'project', 'proy'].includes(nodeVarLower);

            // If node has Name Constructor active, resolve its full pattern
            if (currentNode.nameConfig && currentNode.nameConfig.enabled && currentNode.nameConfig.pattern) {
                name = ShotCreator.resolveNodePattern(currentNode.nameConfig.pattern, pathCtx, currentNode);
            } else if (isClientNode) {
                name = ShotCreator.currentContext.client || "atresmedia";
            } else if (isProjectNode) {
                name = ShotCreator.currentContext.project || projNode?.name || "surf_love";
            } else if (currentNode.isEpisode || ['ep', 'episodio'].includes(nodeVarLower)) {
                name = epVal;
            } else if (currentNode.isScene || ['esc', 'seq', 'escena', 'secuencia'].includes(nodeVarLower)) {
                name = scnVal;
            } else if (currentNode.isShot || ['shot', 'shotname'].includes(nodeVarLower)) {
                name = shotVal;
            }

            pathParts.unshift(name);

            // Go up (Priority to parentOnline in mirror if parent is missing or unit)
            let parentNode = (currentNode.parent) ? ShotCreator.selectedPreset.nodes.find(n => n.id === currentNode.parent) : null;
            let parentIsUnit = (parentNode && parentNode.type === 'unit');

            if (isMirror && currentNode.parentOnline && (!parentNode || parentIsUnit)) {
                currentNode = ShotCreator.selectedPreset.nodes.find(n => n.id === currentNode.parentOnline);
            } else {
                currentNode = parentNode;
            }
        }

        if (hasUnitRoot) {
            return pathParts.join('/');
        } else {
            const fallbackRoot = isMirror
                ? (ShotCreator.currentContext.mediaRoot || (typeof settings !== 'undefined' && settings.currentProject?.roots?.media?.replace(/\\/g, '/')) || "")
                : (ShotCreator.currentContext.workRoot || (typeof settings !== 'undefined' && settings.currentProject?.roots?.work?.replace(/\\/g, '/')) || "");
            return (fallbackRoot ? fallbackRoot + "/" : "") + pathParts.join('/');
        }
    },

    getMirrorPath: (level, itemName) => {
        return ShotCreator.getFullResolvedPath(level, itemName, true);
    },

    getSequencesRoot: () => {
        // Try resolving dummy episode path to find its parent directory
        const dummyEpPath = ShotCreator.getFullResolvedPath('episode', 'DUMMY');
        if (dummyEpPath) {
            return dummyEpPath.substring(0, dummyEpPath.lastIndexOf('/'));
        }
        const workRoot = ShotCreator.currentContext.workRoot || (typeof settings !== 'undefined' && settings.currentProject?.roots?.work?.replace(/\\/g, '/')) || "";
        return workRoot ? (workRoot + "/episodios") : null;
    },

    handleSelectionChange: (path) => {
        if (!ShotCreator.isVisible) return;

        // Reset Hierarchy selection on context change (optional, but safer)
        // ShotCreator.selectedParentEpisode = null;
        // ShotCreator.selectedParentScene = null;

        ShotCreator.resolveContext(path || "");

        // If in Batch Mode, re-load targets
        if (ShotCreator.mode === 'batch') {
            ShotCreator.loadShotsForCategory();
        } else {
            // Check context to auto-select hierarchy parents
            ShotCreator.autoDetectHierarchyFromContext();
            ShotCreator.render();
        }
    },

    autoDetectHierarchyFromContext: async () => {
        const path = ShotCreator.currentContext.resolvedPath;
        if (!path) return;

        const relativeContainer = ShotCreator.getRelativeContainerPath('episode') || "sequences";
        const seqRoot = ShotCreator.getSequencesRoot();

        if (!seqRoot) return;

        // 1. Always load the list of episodes (regardless of current level, to populate dropdowns)
        try {
            console.log("ShotCreator: Loading episodes from", seqRoot);
            const data = await API.fetchDir(seqRoot);
            if (data && data.items) {
                ShotCreator.hierarchy.episodes = data.items.filter(i => i.isDirectory).map(i => i.name).sort();
                console.log("ShotCreator: Loaded episodes", ShotCreator.hierarchy.episodes);
                // Force render here just in case initial render happened with empty list
                if (ShotCreator.isVisible) ShotCreator.render();
            } else {
                console.warn("ShotCreator: No items found in sequences root");
            }
        } catch (e) { console.error("Error auto-loading episodes list", e); }

        const lower = path.toLowerCase();
        // Check if our path is inside the sequences root
        // seqRoot might be something like "P:/Project/sequences"
        // path might be "P:/Project/sequences/EP01/SC01"

        const seqRootKey = seqRoot.toLowerCase();

        if (lower.startsWith(seqRootKey)) {
            const rel = path.substring(seqRootKey.length); // e.g. "/EP01/SC01"
            const parts = rel.split('/').filter(p => p); // ["EP01", "SC01"]

            if (parts.length >= 1) {
                const epName = parts[0];
                // Validate if it exists in our loaded list (optional, but good for safety)
                if (ShotCreator.hierarchy.episodes.includes(epName)) {
                    ShotCreator.selectedParentEpisode = epName;

                    // If we are deep in hierarchy, maybe we should switch creation level?
                    // User didn't ask explicitly, but if I select a Scene, I probably want to create a Shot.
                    // If I select an Episode, I probably want to create a Scene.
                    // Let's at least set the defaults.

                    if (parts.length >= 2) {
                        // We are in a scene
                        ShotCreator.selectedParentScene = parts[1];
                        // Also load scenes for this episode
                        await ShotCreator.loadScenesForEpisode(epName);
                    } else {
                        // We are in an episode
                        // Load scenes just in case
                        await ShotCreator.loadScenesForEpisode(epName);
                    }
                }
            }
        }
        ShotCreator.render();
    },

    handleParentEpisodeChange: (val) => {
        ShotCreator.selectedParentEpisode = val;
        ShotCreator.selectedParentScene = null; // Reset scene
        ShotCreator.loadScenesForEpisode(val).then(() => {
            ShotCreator.render();
        });
    },

    handleParentSceneChange: (val) => {
        ShotCreator.selectedParentScene = val;
        ShotCreator.render();
    },

    setInjectionScope: (newScope) => {
        ShotCreator.injectionScope = newScope;
        ShotCreator.loadShotsForCategory(); // Refresh selection logic
    },

    loadShotsForCategory: async () => {
        // Refactored to use Hierarchy
        let path = null;
        const root = ShotCreator.getSequencesRoot();

        if (!root) return;

        // Path depends on selection
        if (ShotCreator.selectedParentEpisode && ShotCreator.selectedParentScene) {
            path = root + "/" + ShotCreator.selectedParentEpisode + "/" + ShotCreator.selectedParentScene;
        } else if (ShotCreator.selectedParentEpisode) {
            path = root + "/" + ShotCreator.selectedParentEpisode;
        }

        // ... Existing Logic for finding shots ...
        // (Simplified for brevity, assuming validateAndConfirm handles the final path)
        if (path) {
            // ... fetchDir ...
            // Update foundShots
        }
        ShotCreator.render();
    },

    toggleSelectAll: () => {
        if (ShotCreator.selectedShots && ShotCreator.foundShots && ShotCreator.selectedShots.length === ShotCreator.foundShots.length) {
            ShotCreator.selectedShots = [];
        } else if (ShotCreator.foundShots) {
            ShotCreator.selectedShots = ShotCreator.foundShots.map(s => s.path);
        }
        ShotCreator.render();
    },

    // loadShotsForCategory Duplicate stub removed

    init: async () => {
        ShotCreator.container = document.getElementById('shot-creator-window');
        if (!ShotCreator.container) {
            console.error("ShotCreator: Container #shot-creator-window not found.");
            return;
        }
        // Resize Window (15% larger)
        // Original min was 400x300. New: 460x345
        // Resize Window (Larger default for visibility)
        ShotCreator.container.style.width = "800px";
        ShotCreator.container.style.height = "750px";

        if (window.API && API.system) {
            ShotCreator.systemInfo = await API.system.getInfo();
        }

        await ShotCreator.loadPresets();
        ShotCreator.loadHierarchy('shot'); // Pre-load episodes
        ShotCreator.render();
    },

    loadPresets: async () => {
        ShotCreator.presets = [];
        try {
            if (window.API && API.fs && API.fs.getFiles) {
                const files = await API.fs.getFiles(ShotCreator.presetsPath);
                for (const f of files) {
                    if (f.endsWith('.json')) {
                        const content = await API.fs.readFile(ShotCreator.presetsPath + "\\" + f);
                        if (content) {
                            try {
                                const preset = JSON.parse(content);
                                ShotCreator.presets.push(preset);
                            } catch (e) {
                                console.error("Error parsing preset:", f, e);
                            }
                        }
                    }
                }
            }
            // Add Default Preset if empty
            if (ShotCreator.presets.length === 0) {
                // Optionally add a dummy preset or warn
            }

            // Restore last selected preset
            const lastId = localStorage.getItem('pipeta_sc_last_preset');
            if (lastId) {
                const found = ShotCreator.presets.findIndex(p => p.id === lastId);
                if (found !== -1) {
                    ShotCreator.selectPreset(found);
                }
            }
        } catch (e) {
            console.error("ShotCreator: Error loading presets", e);
        }
    },

    open: async () => {
        if (!ShotCreator.container) await ShotCreator.init();
        await ShotCreator.loadPresets();

        // Resolve context immediately
        ShotCreator.resolveContext();
        await ShotCreator.autoDetectHierarchyFromContext();

        ShotCreator.isVisible = true;
        ShotCreator.container.style.display = 'flex';
        document.getElementById('sidebarCreatorBtn')?.classList.add('active');
        ShotCreator.render();
    },

    close: () => {
        ShotCreator.isVisible = false;
        if (ShotCreator.container) {
            ShotCreator.container.style.display = 'none';
        }
        if (typeof AssetCreator === 'undefined' || !AssetCreator.isVisible) {
            document.getElementById('sidebarCreatorBtn')?.classList.remove('active');
        }
    },

    selectProject: async (projId) => {
        if (typeof settings !== 'undefined' && settings.projects) {
            const proj = settings.projects.find(p => p.id === projId);
            if (proj) {
                settings.currentProject = proj;
                localStorage.setItem('pipeta_active_project_id', proj.id);
                ShotCreator.resolveContext(proj.roots?.work || "");
                await ShotCreator.autoDetectHierarchyFromContext();
                ShotCreator.render();
            }
        }
    },

    selectPreset: (index) => {
        if (index === "" || index === null) {
            ShotCreator.selectedPreset = null;
        } else {
            ShotCreator.selectedPreset = ShotCreator.presets[index];
            ShotCreator.analyzePreset(ShotCreator.selectedPreset);
            // Save persistence
            if (ShotCreator.selectedPreset) {
                localStorage.setItem('pipeta_sc_last_preset', ShotCreator.selectedPreset.id);
            }
        }
        ShotCreator.render();
    },

    analyzePreset: (preset) => {
        if (!preset || !preset.nodes) return;

        // Find Shot/Asset focused node for processes
        // Support isShot flag, isAssetFocus flag, or names SHOT/ASSET (case-insensitive)
        const shotNode = preset.nodes.find(n =>
            n.isShot ||
            n.isAssetFocus ||
            (n.name && (n.name.toUpperCase() === 'SHOT' || n.name.toUpperCase() === 'ASSET' || n.name === 'ShotName'))
        );
        ShotCreator.processNodes = [];
        ShotCreator.mediaFolderNodes = [];

        if (shotNode) {
            const hasExplicit = preset.nodes.some(n => n.isProcess === true);
            if (hasExplicit) {
                ShotCreator.processNodes = preset.nodes.filter(n => n.isProcess === true && n.type !== 'file');
            } else {
                ShotCreator.processNodes = preset.nodes.filter(n => n.parent === shotNode.id && n.type !== 'file' && n.isProcess !== false && !n.isExternalTcl);
            }

            // Find if ShotNode has a Mirror connection
            const mirrorConn = preset.connections?.find(c => (c.from === shotNode.id || c.to === shotNode.id) && (c.fromPort === 'mirror' || c.toPort === 'mirror'));
            if (mirrorConn) {
                const mirrorNodeId = (mirrorConn.from === shotNode.id) ? mirrorConn.to : mirrorConn.from;
                const mirrorShotNode = preset.nodes.find(n => n.id === mirrorNodeId);
                if (mirrorShotNode) {
                    // Collect children of the MIRROR version of ShotName
                    ShotCreator.mediaFolderNodes = preset.nodes.filter(n => n.parent === mirrorShotNode.id);
                }
            }
        }

        // Find Episode node for standard folders
        const episodeNode = preset.nodes.find(n => n.isEpisode);
        ShotCreator.episodeFolderNodes = [];
        if (episodeNode) {
            ShotCreator.episodeFolderNodes = preset.nodes.filter(n => n.parent === episodeNode.id && n.type !== 'file');
        }

        // Also re-resolve context
        ShotCreator.resolveContext();
    },

    // Process Selection Persistence & Master Toggle
    getSavedSelectedProcesses: (presetId) => {
        if (!presetId) return null;
        try {
            const raw = localStorage.getItem('pipeta_sc_selected_procs_' + presetId);
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return null;
    },

    saveSelectedProcesses: () => {
        if (!ShotCreator.selectedPreset) return;
        const presetId = ShotCreator.selectedPreset.id;
        const checked = Array.from(document.querySelectorAll('.sc-proc-chk:checked')).map(el => el.value);
        try {
            localStorage.setItem('pipeta_sc_selected_procs_' + presetId, JSON.stringify(checked));
        } catch(e) {}
    },

    toggleAllProcesses: (checked) => {
        const checkboxes = document.querySelectorAll('.sc-proc-chk');
        checkboxes.forEach(cb => { cb.checked = checked; });
        ShotCreator.saveSelectedProcesses();
    },

    handleProcessCheckChange: () => {
        const checkboxes = Array.from(document.querySelectorAll('.sc-proc-chk'));
        const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
        const masterCb = document.getElementById('chk-proc-all');
        if (masterCb) masterCb.checked = allChecked;
        ShotCreator.saveSelectedProcesses();
    },

    // Result tags like [proyecto], [Episodio], etc into strings based on current UI state
    resolvePatternTags: (pattern, itemName = "") => {
        if (!pattern) return "";
        let res = pattern;
        const ctx = ShotCreator.currentContext;

        if (ctx) {
            res = res.replace(/\[proyecto\]/gi, ctx.project || "PROYECTO")
                .replace(/\[Cliente\]/gi, ctx.client || "CLIENTE");
        }

        if (ShotCreator.selectedParentEpisode) {
            res = res.replace(/\[Episodio\]/gi, ShotCreator.selectedParentEpisode);
        }
        if (ShotCreator.selectedParentScene) {
            res = res.replace(/\[Escena\]/gi, ShotCreator.selectedParentScene);
        }

        // Handle [Shot] tag if it's there
        if (itemName) {
            res = res.replace(/\[Shot\]/gi, itemName);
        }

        return res;
    },

    autoGenerateName: async (mode = 'episode') => {
        if (!ShotCreator.selectedPreset) return;

        const input = document.getElementById('sc-item-name');
        if (!input) return;

        // Visual feedback
        if (mode === 'current') input.setAttribute('placeholder', 'Calculando...');

        let targetNode = null;
        if (ShotCreator.creationLevel === 'episode') targetNode = ShotCreator.selectedPreset.nodes.find(n => n.isEpisode);
        else if (ShotCreator.creationLevel === 'scene') targetNode = ShotCreator.selectedPreset.nodes.find(n => n.isScene);
        else if (ShotCreator.creationLevel === 'shot') targetNode = ShotCreator.selectedPreset.nodes.find(n => n.isShot || n.isAssetFocus);

        if (!targetNode) {
            console.warn("ShotCreator: No target node for level", ShotCreator.creationLevel);
            return;
        }

        // Fallback pattern if missing config
        let pattern = (targetNode.nameConfig && targetNode.nameConfig.pattern) ? targetNode.nameConfig.pattern : (ShotCreator.creationLevel === 'episode' ? "EP[00]" : "SH[0000]");

        // Resolve tags now
        pattern = ShotCreator.resolvePatternTags(pattern);

        // Determine parent path to check for existing items (more robust for nested levels)
        let parentPath = ShotCreator.getSequencesRoot();
        if (ShotCreator.creationLevel !== 'episode') {
            const fullPath = ShotCreator.getFullResolvedPath(ShotCreator.creationLevel, "TEMP_NAME");
            if (fullPath) parentPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        }

        if (!parentPath) {
            console.warn("ShotCreator: Could not determine Parent Root for naming.");
            input.placeholder = "Error de ruta";
            return;
        }

        console.log("ShotCreator: naming params", { mode, pattern, parentPath });

        try {
            let items = [];
            try {
                const data = await API.fetchDir(parentPath);
                if (data && data.items) {
                    items = data.items.filter(i => i.isDirectory).map(i => i.name);
                }
            } catch (e) {
                console.warn("ShotCreator: Directory not found or empty (using default start).", parentPath);
            }

            // 1. Build Regex
            // Support both "[00]" and "[counter(1)##]"
            // We need to normalize the pattern first or handle both match types.

            // Standardize complex patterns to simple placeholders for regex building
            // complex: [counter(1)##] -> we care about the padding length (# count) and order

            let normalizedPattern = pattern;
            let counterSpecs = []; // { index: 0, padding: 2, original: "[...]" }

            // Regex for complex: \[counter\((\d+)\)(#+)\]
            const complexRegex = /\[counter\((\d+)\)(#+)\]/g;
            const simpleRegex = /\[(0+)\]/g;

            let matchType = 'none';

            // Check Complex First
            let complexMatches = [...pattern.matchAll(complexRegex)];
            if (complexMatches.length > 0) {
                matchType = 'complex';
                complexMatches.forEach(m => {
                    counterSpecs.push({
                        index: parseInt(m[1], 10) - 1, // 1-based to 0-based
                        padding: m[2].length,
                        original: m[0]
                    });
                });
                // Sort by index just in case they appear out of order in string (unlikely but good practice)
                counterSpecs.sort((a, b) => a.index - b.index);
            } else {
                // Check Simple
                const simpleMatches = [...pattern.matchAll(simpleRegex)];
                if (simpleMatches.length > 0) {
                    matchType = 'simple';
                    simpleMatches.forEach((m, idx) => {
                        counterSpecs.push({
                            index: idx,
                            padding: m[1].length,
                            original: m[0]
                        });
                    });
                }
            }

            if (counterSpecs.length === 0) {
                console.warn("ShotCreator: Pattern has no counters.");
                input.value = pattern;
                return;
            }

            // Build Regex string
            let regexStr = "^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            counterSpecs.forEach(spec => {
                // Escape the original string to match it literally in the regexStr before replacing
                const escapedOriginal = spec.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regexStr = regexStr.replace(escapedOriginal, "(\\d+)");
            });
            const regex = new RegExp(regexStr + "$", "i");

            // 2. Parse all existing items
            const parsedItems = items.map(name => {
                const m = name.match(regex);
                return m ? m.slice(1).map(v => parseInt(v, 10)) : null;
            }).filter(v => v);

            console.log("ShotCreator: Found parsed items", parsedItems);

            // 3. Determine next values
            let nextVals = counterSpecs.map(() => 1);

            console.log("ShotCreator: Found parsed items", parsedItems);

            if (mode === 'episode') { // +EP
                // 1. Try to read from Input
                const inputVal = input.value || "";
                const inputMatch = inputVal.match(regex);

                if (inputMatch) {
                    // If input has valid pattern, increment based on INPUT
                    // e.g. Input: CAP03S1 -> +EP -> CAP04S1
                    nextVals = inputMatch.slice(1).map(v => parseInt(v, 10));
                    nextVals[0]++;
                    // Reset segments? Usually yes for new episode.
                    for (let i = 1; i < nextVals.length; i++) nextVals[i] = 1;
                } else {
                    // Fallback to Disk if input is empty/invalid
                    let maxEp = 0;
                    parsedItems.forEach(v => { if (v[0] > maxEp) maxEp = v[0]; });
                    nextVals[0] = maxEp + 1;
                    // Reset sub-counters
                    for (let i = 1; i < nextVals.length; i++) nextVals[i] = 1;
                }

            } else if (mode === 'segment') { // +SEG
                const inputVal = input.value || "";
                const inputMatch = inputVal.match(regex);

                if (inputMatch) {
                    // Increment based on INPUT
                    nextVals = inputMatch.slice(1).map(v => parseInt(v, 10));
                    nextVals[nextVals.length - 1]++;
                } else {
                    // Fallback to Disk if input is invalid
                    const latest = parsedItems.slice().sort((a, b) => {
                        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
                        return 0;
                    }).pop();
                    if (latest) {
                        nextVals = [...latest];
                        nextVals[nextVals.length - 1]++;
                    }
                }

            } else if (mode === 'current') { // Auto-Nombre (Check)
                // Find absolute latest
                const latest = parsedItems.slice().sort((a, b) => {
                    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
                    return 0;
                }).pop();

                if (latest) {
                    // USER REQUEST: Detect last episode and increment SEGMENT.
                    // Example: CAP11S4 -> CAP11S5
                    nextVals = [...latest];
                    nextVals[nextVals.length - 1]++;
                }
                // If NO items exist, nextVals is [1, 1], which is correct start.
            } else if (typeof mode === 'number') { // Generic Increment (+1, +10)
                const inputVal = input.value || "";
                const inputMatch = inputVal.match(regex);

                if (inputMatch) {
                    nextVals = inputMatch.slice(1).map(v => parseInt(v, 10));
                } else {
                    const latest = parsedItems.slice().sort((a, b) => {
                        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
                        return 0;
                    }).pop();
                    if (latest) {
                        nextVals = [...latest];
                    } else {
                        // Start basis
                        nextVals[nextVals.length - 1] = 0;
                    }
                }

                // Standard Increment: +1 normally, +10 snaps to next 10s
                if (mode === 10) {
                    nextVals[nextVals.length - 1] = Math.floor(nextVals[nextVals.length - 1] / 10) * 10 + 10;
                } else {
                    nextVals[nextVals.length - 1] += mode;
                }
            }

            // 4. Update UI
            let resultName = pattern;
            counterSpecs.forEach((spec, idx) => {
                const valStr = String(nextVals[idx]).padStart(spec.padding, '0');
                // Replace the ORIGINAL string (e.g. [counter(1)##] or [00])
                resultName = resultName.replace(spec.original, valStr);
            });

            if (targetNode.nameConfig && targetNode.nameConfig.forceUpper) {
                resultName = resultName.toUpperCase();
            }

            input.value = resultName;

        } catch (e) {
            console.error("ShotCreator: Error in autoGenerateName", e);
            input.placeholder = "Error (ver consola)";
        }
    },

    resolveContext: (specificPath) => {
        ShotCreator.currentContext = { client: null, project: null, category: null, valid: false, resolvedPath: null, isRoot: false, projectRoot: null, workRoot: null, mediaRoot: null };

        let path = specificPath || (typeof selectedContextPath !== 'undefined' && selectedContextPath) || null;
        if (path) {
            path = path.replace(/\\/g, '/');
            ShotCreator.currentContext.resolvedPath = path;
        }

        let matchedProj = null;

        // 1. Try matching path against configured projects in settings.projects
        if (path && typeof settings !== 'undefined' && settings.projects && settings.projects.length > 0) {
            const pLower = path.toLowerCase();
            for (const proj of settings.projects) {
                const workR = (proj.roots?.work || "").replace(/\\/g, '/').toLowerCase();
                const mediaR = (proj.roots?.media || "").replace(/\\/g, '/').toLowerCase();
                const onlWorkR = (proj.roots?.onlineWork || "").replace(/\\/g, '/').toLowerCase();
                const onlMediaR = (proj.roots?.onlineMedia || "").replace(/\\/g, '/').toLowerCase();

                if ((workR && workR.length > 3 && pLower.startsWith(workR)) ||
                    (mediaR && mediaR.length > 3 && pLower.startsWith(mediaR)) ||
                    (onlWorkR && onlWorkR.length > 3 && pLower.startsWith(onlWorkR)) ||
                    (onlMediaR && onlMediaR.length > 3 && pLower.startsWith(onlMediaR))) {
                    matchedProj = proj;
                    break;
                }
            }
        }

        // 2. Fallback to settings.currentProject or first project
        if (!matchedProj && typeof settings !== 'undefined') {
            matchedProj = settings.currentProject || (settings.projects && settings.projects[0]) || null;
        }

        if (matchedProj) {
            ShotCreator.currentContext.valid = true;
            ShotCreator.currentContext.projectObj = matchedProj;
            ShotCreator.currentContext.client = matchedProj.client || "cliente";
            ShotCreator.currentContext.project = matchedProj.projectCode || matchedProj.name;
            ShotCreator.currentContext.workRoot = (matchedProj.roots?.work || "").replace(/\\/g, '/');
            ShotCreator.currentContext.mediaRoot = (matchedProj.roots?.media || "").replace(/\\/g, '/');
            ShotCreator.currentContext.projectRoot = ShotCreator.currentContext.workRoot;
        }
    },

    render: () => {
        if (!ShotCreator.container) return;

        const currentProjId = (ShotCreator.currentContext?.projectObj?.id) || (typeof settings !== 'undefined' && settings.currentProject ? settings.currentProject.id : '');
        const projectOptions = (typeof settings !== 'undefined' && settings.projects ? settings.projects : []).map(p =>
            `<option value="${p.id}" ${p.id === currentProjId ? 'selected' : ''}>${p.name}</option>`
        ).join('');

        const presetOptions = ShotCreator.presets.map((p, index) =>
            `<option value="${index}" ${ShotCreator.selectedPreset && ShotCreator.selectedPreset.id === p.id ? 'selected' : ''}>${p.name}</option>`
        ).join('');

        let contentHTML = '';
        let createBtnState = 'disabled';

        // --- OVERLAY CONTAINER ---
        const overlayHTML = `
            <div id="sc-overlay" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:10; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
                <div id="sc-overlay-content"></div>
            </div>
        `;

        if (ShotCreator.selectedPreset) {
            const ctx = ShotCreator.currentContext;
            let contextClass = ctx.valid ? 'ctx-valid' : 'ctx-warning';
            let contextMsg = ctx.valid
                ? `<span style="color:#8f8; font-weight:bold;">✓ Contexto Válido</span>`
                : `<span style="color:#f88; font-weight:bold;">⚠ Contexto Desconocido</span>`;

            // --- HIERARCHY SELECTORS ---
            // Level Selector (Episode | Scene | Shot)
            let levelSelectorHTML = `
                <div style="display:flex; margin-bottom:10px; border:1px solid #444; border-radius:4px; overflow:hidden;">
                     <button onclick="ShotCreator.setCreationLevel('episode')" style="flex:1; padding:6px; border:none; cursor:pointer; background:${ShotCreator.creationLevel === 'episode' ? '#444' : '#222'}; color:${ShotCreator.creationLevel === 'episode' ? '#fff' : '#888'}; font-weight:bold;">Episodio</button>
                     <button onclick="ShotCreator.setCreationLevel('scene')" style="flex:1; padding:6px; border:none; cursor:pointer; background:${ShotCreator.creationLevel === 'scene' ? '#444' : '#222'}; color:${ShotCreator.creationLevel === 'scene' ? '#fff' : '#888'}; font-weight:bold;">Escena</button>
                     <button onclick="ShotCreator.setCreationLevel('shot')" style="flex:1; padding:6px; border:none; cursor:pointer; background:${ShotCreator.creationLevel === 'shot' ? '#444' : '#222'}; color:${ShotCreator.creationLevel === 'shot' ? '#fff' : '#888'}; font-weight:bold;">Shot</button>
                </div>
            `;

            // Ep Dropdown (Visible for Scene & Shot)
            let episodeSelectHTML = "";
            if (ShotCreator.creationLevel !== 'episode') { // Show for Scene & Shot
                const epOpts = ShotCreator.hierarchy.episodes.map(e => `<option value="${e}" ${ShotCreator.selectedParentEpisode === e ? 'selected' : ''}>${e}</option>`).join('');
                episodeSelectHTML = `
                    <div class="form-group compact">
                        <label>Episodio Padre</label>
                        <select onchange="ShotCreator.handleParentEpisodeChange(this.value)" style="width:100%; padding:6px; background:#222; color:white; border:1px solid #444; border-radius:4px;">
                            <option value="">-- Seleccionar Episodio --</option>
                            ${epOpts}
                        </select>
                    </div>
                `;
            }

            // Scene Dropdown (Visible for Shot)
            let sceneSelectHTML = "";
            if (ShotCreator.creationLevel === 'shot') {
                const scOpts = ShotCreator.hierarchy.scenes.map(s => `<option value="${s}" ${ShotCreator.selectedParentScene === s ? 'selected' : ''}>${s}</option>`).join('');
                sceneSelectHTML = `
                    <div class="form-group compact">
                        <label>Escena Padre</label>
                        <select onchange="ShotCreator.handleParentSceneChange(this.value)" style="width:100%; padding:6px; background:#222; color:white; border:1px solid #444; border-radius:4px;" ${!ShotCreator.selectedParentEpisode ? 'disabled' : ''}>
                            <option value="">-- Seleccionar Escena --</option>
                            ${scOpts}
                        </select>
                    </div>
                `;
            }

            // --- PROCESSES & FOLDERS ---
            let rightColContentHTML = "";
            let processesItemsHTML = "";

            if (ShotCreator.creationLevel === 'episode') {
                const foldersHTML = (ShotCreator.episodeFolderNodes || []).map(node => `
                    <div style="display:flex; align-items:center; margin-bottom:6px;">
                        <input type="checkbox" id="chk-ep-folder-${node.id}" checked class="sc-ep-folder-chk" value="${node.id}" style="accent-color:var(--accent);">
                        <label for="chk-ep-folder-${node.id}" style="margin-left:8px; font-size:0.9rem; cursor:pointer; color:#ccc;">${node.name}</label>
                    </div>
                `).join('');

                rightColContentHTML = `
                     <div style="flex:1; background:#1a1a1a; padding:10px; border-radius:4px; border:1px solid #333; overflow-y:auto;">
                         <label style="display:block; margin-bottom:8px; color:#aaa; font-weight:bold; font-size:0.85rem; border-bottom:1px solid #333; padding-bottom:4px;">Carpetas Estándar</label>
                         ${foldersHTML}
                    </div>
                `;
            } else {
                const savedProcs = ShotCreator.getSavedSelectedProcesses(ShotCreator.selectedPreset.id);
                const allProcsChecked = ShotCreator.processNodes.length > 0 && (
                    savedProcs === null || 
                    ShotCreator.processNodes.every(p => savedProcs.includes(p.id))
                );

                ShotCreator.processNodes.forEach(proc => {
                    const isChecked = savedProcs === null ? true : savedProcs.includes(proc.id);
                    processesItemsHTML += `
                        <div style="display:flex; align-items:center; margin-bottom:6px;">
                            <input type="checkbox" id="chk-proc-${proc.id}" ${isChecked ? 'checked' : ''} 
                                   class="sc-proc-chk" value="${proc.id}" 
                                   onchange="ShotCreator.handleProcessCheckChange()"
                                   style="accent-color:var(--accent); cursor:pointer;">
                            <label for="chk-proc-${proc.id}" style="margin-left:8px; font-size:0.9rem; cursor:pointer; user-select:none; color:#ccc;">${proc.name}</label>
                        </div>
                    `;
                });

                if (ShotCreator.creationLevel === 'shot') {
                    let mediaItemsHTML = "";
                    ShotCreator.mediaFolderNodes.forEach(node => {
                        mediaItemsHTML += `
                            <div style="display:flex; align-items:center; margin-bottom:6px;">
                                <input type="checkbox" id="chk-media-${node.id}" checked class="sc-media-chk" value="${node.id}" style="accent-color:var(--accent);">
                                <label for="chk-media-${node.id}" style="margin-left:8px; font-size:0.9rem; cursor:pointer; user-select:none; color:#ccc;">${node.name}</label>
                            </div>
                        `;
                    });

                    rightColContentHTML = `
                        <div style="flex:1; display:flex; flex-direction:column; gap:10px; overflow:hidden;">
                            <div style="flex:1; background:#1a1a1a; padding:10px; border-radius:4px; border:1px solid #333; overflow-y:auto;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #333; padding-bottom:4px;">
                                    <label style="color:#aaa; font-weight:bold; font-size:0.85rem; margin-bottom:0;">Procesos (Proyecto)</label>
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <input type="checkbox" id="chk-proc-all" ${allProcsChecked ? 'checked' : ''} 
                                               onchange="ShotCreator.toggleAllProcesses(this.checked)" 
                                               style="accent-color:var(--accent); cursor:pointer; width:13px; height:13px;">
                                        <label for="chk-proc-all" style="font-size:0.75rem; color:var(--accent); cursor:pointer; user-select:none; font-weight:bold; margin-bottom:0;">Todos</label>
                                    </div>
                                </div>
                                ${processesItemsHTML || '<div style="font-size:0.75rem; color:#666; font-style:italic;">No hay procesos definidos con isProcess: true</div>'}
                            </div>
                            <div style="flex:1; background:#1e1e1e; padding:10px; border-radius:4px; border:1px solid #444; overflow-y:auto; border-top: 4px solid #444;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #333; padding-bottom:4px;">
                                    <label style="color:var(--accent); font-weight:bold; font-size:0.85rem;">Estructura Media (Mirror)</label>
                                    <div style="display:flex; gap:8px;">
                                        <div style="display:flex; align-items:center; gap:4px;">
                                            <input type="checkbox" id="sc-media-full" checked style="accent-color:var(--accent); width:12px; height:12px;">
                                            <label for="sc-media-full" style="font-size:0.7rem; color:#888; cursor:pointer;">Ruta Completa</label>
                                        </div>
                                    </div>
                                </div>
                                ${mediaItemsHTML || '<div style="font-size:0.75rem; color:#555; font-style:italic;">No hay carpetas de media definidas en mirror</div>'}
                            </div>
                        </div>
                    `;
                } else {
                    rightColContentHTML = `
                        <div style="flex:1; background:#1a1a1a; padding:10px; border-radius:4px; border:1px solid #333; overflow-y:auto;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #333; padding-bottom:4px;">
                                <label style="color:#aaa; font-weight:bold; font-size:0.85rem; margin-bottom:0;">Procesos a Crear</label>
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <input type="checkbox" id="chk-proc-all" ${allProcsChecked ? 'checked' : ''} 
                                           onchange="ShotCreator.toggleAllProcesses(this.checked)" 
                                           style="accent-color:var(--accent); cursor:pointer; width:13px; height:13px;">
                                    <label for="chk-proc-all" style="font-size:0.75rem; color:var(--accent); cursor:pointer; user-select:none; font-weight:bold; margin-bottom:0;">Todos</label>
                                </div>
                            </div>
                            ${processesItemsHTML || '<div style="font-size:0.75rem; color:#666; font-style:italic;">No hay procesos definidos con isProcess: true</div>'}
                        </div>
                    `;
                }
            }

            // --- DESTINATION SELECTOR ---
            let destinationHTML = `
                <div style="background:#1a1a1a; padding:10px; border-radius:4px; border:1px solid #333; margin-top:10px;">
                    <label style="display:block; margin-bottom:8px; color:#aaa; font-weight:bold; font-size:0.85rem; border-bottom:1px solid #333; padding-bottom:4px;">Estructura a Crear</label>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; gap:15px;">
                            <div style="display:flex; align-items:center;">
                                <input type="checkbox" id="sc-dest-project" checked style="accent-color:var(--accent);">
                                <label for="sc-dest-project" style="margin-left:6px; color:#ddd; font-size:0.9rem;">Estructura Proyecto</label>
                            </div>
                            <div style="display:flex; align-items:center;">
                                <input type="checkbox" id="sc-dest-media" style="accent-color:var(--accent);">
                                <label for="sc-dest-media" style="margin-left:6px; color:#ddd; font-size:0.9rem;">Estructura Media</label>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            contentHTML = `
                <div style="display:flex; gap:20px; height:100%; overflow:hidden;">
                    <!-- LEFT COLUMN -->
                    <div style="flex:1; display:flex; flex-direction:column; gap:10px;">
                        <!-- Context -->
                        <div style="font-size:0.85rem; padding:10px; background:#222; border-radius:4px; border-left: 4px solid ${ctx.valid ? '#4CAF50' : '#F44336'};">
                             <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span style="color:#aaa;">Cliente:</span> <b style="color:#fff;">${ctx.client || '?'}</b>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span style="color:#aaa;">Proyecto:</span> <b style="color:#fff;">${ctx.project || '?'}</b>
                            </div>
                            <div style="text-align:right; font-size:0.75rem;">${contextMsg}</div>
                        </div>

                        ${levelSelectorHTML}
                        ${episodeSelectHTML}
                        ${sceneSelectHTML}
                        
                         <div class="form-group compact">
                            <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:5px;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <label style="margin-bottom:0;">Nombre (${ShotCreator.creationLevel})</label>
                                    <div style="display:flex; align-items:center; gap:5px; margin-left:10px; border-left:1px solid #444; padding-left:10px;">
                                        <input type="checkbox" id="sc-chk-auto-name" onchange="ShotCreator.autoNamingEnabled = this.checked; if(this.checked) ShotCreator.autoGenerateName('current');" ${ShotCreator.autoNamingEnabled ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer; width:14px; height:14px;">
                                        <label for="sc-chk-auto-name" style="font-size:0.7rem; color:#888; cursor:pointer; user-select:none; margin-bottom:0;">Auto-Nombre</label>
                                    </div>
                                </div>
                                ${ShotCreator.creationLevel === 'episode' ? `
                                    <div style="display:flex; gap:5px;">
                                        <button onclick="ShotCreator.autoGenerateName('episode')" title="Siguiente Episodio (+EP)" style="background:#333; color:var(--accent); border:1px solid #444; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer; font-weight:bold;">+ EP</button>
                                        <button onclick="ShotCreator.autoGenerateName('segment')" title="Siguiente Segmento (+SEG)" style="background:#333; color:#4CAF50; border:1px solid #444; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer; font-weight:bold;">+ SEG</button>
                                    </div>
                                ` : `
                                    <div style="display:flex; gap:5px;">
                                        <button onclick="ShotCreator.autoGenerateName(1)" title="Incrementar +1" style="background:#333; color:var(--accent); border:1px solid #444; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer; font-weight:bold;">+1</button>
                                        <button onclick="ShotCreator.autoGenerateName(10)" title="Incrementar +10" style="background:#333; color:var(--accent); border:1px solid #444; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer; font-weight:bold;">+10</button>
                                    </div>
                                `}
                            </div>
                            <input type="text" id="sc-item-name" placeholder="Ej: ${ShotCreator.creationLevel === 'episode' ? 'EP_01' : (ShotCreator.creationLevel === 'scene' ? 'SC_010' : 'SH_0010')}" value="" style="width:100%; padding:8px; background:#000; color:#fff; border:1px solid var(--accent); font-weight:bold; font-size:1rem;">
                        </div>
                        
                        ${destinationHTML}

                    </div>

                    <!-- RIGHT COLUMN -->
                    <div style="flex:1; padding-left:10px; display:flex; flex-direction:column; gap:10px;">
                        ${rightColContentHTML}
                        
                        <!-- File Options -->
                        <div style="flex:0 0 auto; background:#181818; padding:10px; border-radius:4px; border:1px solid #333;">
                             <label style="display:block; margin-bottom:8px; color:#aaa; font-weight:bold; font-size:0.85rem; border-bottom:1px solid #333; padding-bottom:4px;">Opciones de Archivo</label>
                             
                             <div style="display:flex; align-items:center; margin-bottom:6px;">
                                  <input type="checkbox" id="chk-v0-files" onchange="ShotCreator.createVersionZero = this.checked" ${ShotCreator.createVersionZero ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;">
                                  <label for="chk-v0-files" style="margin-left:8px; font-size:0.85rem; cursor:pointer; color:#ccc;">Crear Archivos Versión Cero (.txt)</label>
                              </div>

                              <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                                  <div style="display:flex; align-items:center;">
                                      <input type="checkbox" id="chk-template-v001-sc" onchange="ShotCreator.toggleTemplateV001(this.checked)" ${ShotCreator.createTemplateV001 ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;">
                                      <label for="chk-template-v001-sc" style="margin-left:8px; font-size:0.85rem; color:#fff; font-weight:bold; cursor:pointer;">📄 Crear v001 con Template</label>
                                  </div>

                                  ${ShotCreator.createTemplateV001 ? `
                                      <div style="display:flex; flex-direction:column; gap:8px; padding:10px; background:#12151c; border:1px solid #28303d; border-radius:4px; margin-left:22px; font-size:0.8rem;">
                                          <div>
                                              <label style="color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">Origen del Template:</label>
                                              <select onchange="ShotCreator.setTemplateSource(this.value)" style="width:100%; background:#1c222d; border:1px solid #3a4556; color:#fff; padding:4px 8px; border-radius:3px; font-size:0.8rem;">
                                                  <option value="reference" ${ShotCreator.templateSource === 'reference' ? 'selected' : ''}>⭐ Reference Episode / Root (Default Proyecto)</option>
                                                  <option value="custom" ${ShotCreator.templateSource === 'custom' ? 'selected' : ''}>🛠️ Custom Template (Configurado por Proceso)</option>
                                                  <option value="manual" ${ShotCreator.templateSource === 'manual' ? 'selected' : ''}>📁 Create From... (Elegir archivo a mano)</option>
                                              </select>
                                          </div>

                                          ${ShotCreator.templateSource === 'reference' ? `
                                              <div style="color:#888; font-size:0.75rem; background:#181d26; padding:6px 8px; border-radius:3px; border:1px solid #28303d;">
                                                  Ruta: <b style="color:var(--accent); font-family:monospace;">${settings?.currentProject?.templates?.referenceShotRoot || 'episodios/templates'}</b>
                                                  <div style="color:#666; margin-top:2px;">Clona la última versión encontrada en esa carpeta.</div>
                                              </div>
                                          ` : ''}

                                          ${ShotCreator.templateSource === 'custom' ? `
                                              <div style="color:#888; font-size:0.75rem; background:#181d26; padding:6px 8px; border-radius:3px; border:1px solid #28303d;">
                                                  <span>Usa los templates específicos configurados por proceso en <b>Configuración > Proyectos > Templates</b>.</span>
                                              </div>
                                          ` : ''}

                                          ${ShotCreator.templateSource === 'manual' ? `
                                              <div style="display:flex; flex-direction:column; gap:4px;">
                                                  <label style="color:#aaa; font-size:0.75rem;">Archivo Base a Clonar:</label>
                                                  <div style="display:flex; gap:6px;">
                                                      <input type="text" value="${escapeHtml(ShotCreator.manualTemplatePath || '')}" 
                                                             placeholder="Seleccionar archivo .nk, .blend, .psd..." 
                                                             onchange="ShotCreator.manualTemplatePath = this.value; localStorage.setItem('pipeta_sc_manual_template_path', this.value);"
                                                             style="flex:1; background:#1c222d; border:1px solid #3a4556; color:#fff; padding:4px 6px; font-size:0.75rem; border-radius:3px; font-family:monospace;">
                                                      <button class="btn" onclick="ShotCreator.browseManualTemplate()" style="background:#263238; border:1px solid #37474f; color:#fff; padding:4px 8px; font-size:0.75rem; cursor:pointer;">📁</button>
                                                  </div>
                                              </div>
                                          ` : ''}
                                      </div>
                                  ` : ''}
                              </div>

                              <div style="display:flex; align-items:center;">
                                  <input type="checkbox" id="sc-inject-meta" checked style="accent-color:#4CAF50; cursor:pointer;">
                                  <label for="sc-inject-meta" title="Inyecta un archivo vfx_control.json con metadatos del preset" style="margin-left:8px; color:#888; font-size:0.8rem; cursor:pointer;">Inyectar vfx_control.json</label>
                              </div>
                        </div>
                    </div>
                </div>
            `;
            createBtnState = '';
        } else {
            contentHTML = `<div style="flex:1; display:flex; align-items:center; justify-content:center; color:#666; font-style:italic;">Selecciona un preset para comenzar.</div>`;
        }

        ShotCreator.container.innerHTML = `
            <div class="validator-header" style="display:flex; align-items:center; justify-content:space-between; height:46px; padding:0 15px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <img src="icons/asset_creator.svg" style="width:18px;">
                    <span style="font-size:0.95rem; font-weight:bold; color:#fff; margin-right:4px;">Creator</span>
                    <div style="display:flex; background:#181818; border-radius:4px; padding:2px; border:1px solid #333; gap:2px;">
                        <button type="button" class="creator-tab-btn" onclick="CreatorWindow.switchTo('asset')" style="background:transparent; color:#888; border:none; border-radius:3px; padding:3px 12px; font-size:0.78rem; cursor:pointer;">
                            📦 Asset Creator
                        </button>
                        <button type="button" class="creator-tab-btn active" onclick="CreatorWindow.switchTo('shot')" style="background:#2b3a4a; color:#fff; font-weight:bold; border:none; border-radius:3px; padding:3px 12px; font-size:0.78rem; cursor:pointer;">
                            🎬 Shot Creator
                        </button>
                    </div>
                </div>
                <div style="flex:1; cursor:grab; height:100%;" id="shot-creator-drag"></div>
                 <div class="win-controls">
                    <button onclick="CreatorWindow.close()">×</button>
                </div>
            </div>
            <div class="validator-body" style="padding: 20px; display:flex; flex-direction: column; background:#111; position:relative;">
                ${overlayHTML}
                <div style="display:flex; gap:15px; margin-top:0; margin-bottom:15px;">
                    <div class="form-group" style="flex:1; margin:0;">
                        <label style="color:#888; font-size:0.8rem;">Proyecto</label>
                        <select onchange="ShotCreator.selectProject(this.value)" style="width:100%; padding:8px; background:#222; color:white; border:1px solid #444; border-radius:4px;">
                            ${projectOptions}
                        </select>
                    </div>
                    <div class="form-group" style="flex:1; margin:0;">
                        <label style="color:#888; font-size:0.8rem;">Preset Seleccionado</label>
                        <select onchange="ShotCreator.selectPreset(this.value)" style="width:100%; padding:8px; background:#222; color:white; border:1px solid #444; border-radius:4px;">
                            <option value="">-- Seleccionar --</option>
                            ${presetOptions}
                        </select>
                    </div>
                </div>
                ${contentHTML}
            </div>
            <div class="settings-footer" style="padding: 15px 20px;">
                <div style="flex:1"></div>
                <button class="btn btn-primary" onclick="ShotCreator.validateAndConfirm()" style="background:var(--accent); color:black; border:none; padding:10px 30px; border-radius:4px; font-weight:bold; cursor:pointer; pointer-events:${createBtnState ? 'none' : 'all'}; opacity:${createBtnState ? '0.5' : '1'};">CREAR ESTRUCTURA</button>
            </div>
        `;

        ShotCreator.makeDraggable();
    },

    showOverlay: (html) => {
        const ov = document.getElementById('sc-overlay');
        const content = document.getElementById('sc-overlay-content');
        if (ov && content) {
            content.innerHTML = html;
            ov.style.display = 'flex';
        }
    },

    hideOverlay: () => {
        const ov = document.getElementById('sc-overlay');
        if (ov) {
            ov.style.display = 'none';
        }
    },

    validateAndConfirm: async () => {
        if (!ShotCreator.selectedPreset) return;

        const itemNameInput = document.getElementById('sc-item-name');
        const itemName = itemNameInput ? itemNameInput.value.trim() : "";

        if (!itemName) {
            ShotCreator.showOverlay(`
                <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                <div style="font-size:1.2rem; color:#fff;">Falta el Nombre</div>
                <button onclick="ShotCreator.hideOverlay()" style="margin-top:20px; padding:8px 20px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer;">Entendido</button>
            `);
            return;
        }

        // Parent Validation
        if (ShotCreator.creationLevel === 'scene' && !ShotCreator.selectedParentEpisode) {
            ShotCreator.showOverlay(`
                <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                <div style="font-size:1.2rem; color:#fff;">Selecciona un Episodio Padre</div>
                <button onclick="ShotCreator.hideOverlay()" style="margin-top:20px; padding:8px 20px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer;">Entendido</button>
            `);
            return;
        }
        if (ShotCreator.creationLevel === 'shot' && (!ShotCreator.selectedParentEpisode || !ShotCreator.selectedParentScene)) {
            ShotCreator.showOverlay(`
                <div style="font-size:2rem; margin-bottom:10px;">⚠️</div>
                <div style="font-size:1.2rem; color:#fff;">Selecciona Episodio y Escena Padre</div>
                <button onclick="ShotCreator.hideOverlay()" style="margin-top:20px; padding:8px 20px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer;">Entendido</button>
            `);
            return;
        }

        // --- NEW PATH RESOLUTION ---
        const targetPath = ShotCreator.getFullResolvedPath(ShotCreator.creationLevel, itemName, false);
        const mirrorPath = ShotCreator.getFullResolvedPath(ShotCreator.creationLevel, itemName, true);

        if (!targetPath) {
            ShotCreator.showOverlay(`<div style="font-size:1.2rem; color:#f88;">Error: No se pudo resolver la ruta de destino. Revisa el preset.</div>`);
            return;
        }

        const checkedProcs = Array.from(document.querySelectorAll('.sc-proc-chk:checked')).map(cb => cb.value);
        const checkedEpFolders = Array.from(document.querySelectorAll('.sc-ep-folder-chk:checked')).map(cb => cb.value);
        const checkedMediaNodes = Array.from(document.querySelectorAll('.sc-media-chk:checked')).map(cb => cb.value);

        const destProject = document.getElementById('sc-dest-project')?.checked || false;
        const destMedia = document.getElementById('sc-dest-media')?.checked || false;
        const destMediaFull = document.getElementById('sc-media-full')?.checked || false;
        const injectMeta = document.getElementById('sc-inject-meta')?.checked || false;

        ShotCreator.pendingCreation = {
            mode: 'create',
            shotName: itemName,
            categoryPath: targetPath.substring(0, targetPath.lastIndexOf('/')),
            targets: [],
            checkedProcs,
            checkedEpFolders,
            checkedMediaNodes,
            destProject,
            destMedia,
            destMediaFull,
            injectMeta,
            fullTargetPath: targetPath,
            mirrorTargetPath: mirrorPath,
            level: ShotCreator.creationLevel
        };

        // Build Confirmation Info
        let pathsHtml = "";

        if (destProject) {
            pathsHtml += `
                <div style="margin-bottom:8px; text-align:left; background:#222; padding:8px; border-radius:4px; border-left:3px solid var(--accent);">
                    <div style="color:var(--accent); font-weight:bold; font-size:0.85rem;">Estructura Proyecto</div>
                    <div style="color:#ccc; font-size:0.8rem; word-break:break-all;">${targetPath}</div>
                    <div style="color:#666; font-size:0.75rem; margin-top:2px;">(Jerarquía del Preset)</div>
                </div>
             `;
        }

        if (destMedia) {
            if (mirrorPath) {
                pathsHtml += `
                    <div style="margin-bottom:8px; text-align:left; background:#222; padding:8px; border-radius:4px; border-left:3px solid #ff9800;">
                        <div style="color:#ff9800; font-weight:bold; font-size:0.85rem;">Estructura Media (Mirror)</div>
                        <div style="color:#ccc; font-size:0.8rem; word-break:break-all;">${mirrorPath}</div>
                        <div style="color:#666; font-size:0.75rem; margin-top:2px;">(Reconstruido desde el Preset)</div>
                    </div>
                 `;
            } else {
                pathsHtml += `
                    <div style="margin-bottom:8px; text-align:left; background:#222; padding:8px; border-radius:4px; border-left:3px solid #F44336;">
                        <div style="color:#F44336; font-weight:bold; font-size:0.85rem;">Estructura Media (Error)</div>
                        <div style="color:#ccc; font-size:0.8rem;">No se encontró conexión Mirror en el preset para este nivel.</div>
                    </div>
                 `;
            }
        }

        if (pathsHtml === "") {
            pathsHtml = `<div style="color:#f88; margin-bottom:10px;">⚠️ No se ha seleccionado ninguna estructura para crear.</div>`;
        }

        ShotCreator.showOverlay(`
            <h3 style="margin-top:0;">Confirmar Creación</h3>
            <div style="max-height:300px; overflow-y:auto; width:100%; padding:0 10px; margin-bottom:15px;">
                ${pathsHtml}
            </div>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button onclick="ShotCreator.hideOverlay()" style="padding:8px 15px; background:#333; color:white; border:none; cursor:pointer;">Cancelar</button>
                <button onclick="ShotCreator.executeCreation()" style="padding:8px 20px; background:var(--accent); color:black; border:none; font-weight:bold; cursor:pointer;" ${pathsHtml.includes('⚠️') || pathsHtml.includes('(Error)') ? 'disabled style="opacity:0.5"' : ''}>CONFIRMAR</button>
            </div>
        `);
    },

    executeCreation: async () => {
        const { mode, shotName, categoryPath, targetCategoryNode, targets, checkedProcs, checkedMediaNodes, fullTargetPath, level, checkedEpFolders, destProject, destMedia, destMediaFull, mirrorTargetPath, injectMeta } = ShotCreator.pendingCreation;

        ShotCreator.showOverlay(`
            <div class="spinner-large" style="border-top-color:var(--accent);"></div>
            <div style="margin-top:15px; color:#ccc;">${mode === 'create' ? 'Creando estructura...' : 'Inyectando procesos...'}</div>
        `);

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('create', `[SHOT CREATOR] 🎬 ${mode === 'create' ? `Creando ${level.toUpperCase()}: '${shotName}'` : `Inyectando procesos en ${targets.length} planos`} (Episodio: ${ShotCreator.selectedParentEpisode || '-'}, Escena: ${ShotCreator.selectedParentScene || '-'}) [Preset: ${ShotCreator.selectedPreset?.name || 'Shot Preset'}]`, 'info');
        }

        // Ensure Category Path exists
        if (!ShotCreator.currentContext.category && targetCategoryNode && mode === 'create') {
            try { await API.fs.mkdir(categoryPath); } catch (e) { }
        }

        // Find Project Node (Main Logic)
        let mainNode = null;
        if (level === 'episode') mainNode = ShotCreator.selectedPreset.nodes.find(n => n.isEpisode);
        else if (level === 'scene') mainNode = ShotCreator.selectedPreset.nodes.find(n => n.isScene);
        else if (level === 'shot') mainNode = ShotCreator.selectedPreset.nodes.find(n => n.isShot || n.isAssetFocus);

        try {
            if (mode === 'create') {
                const finalPath = fullTargetPath || (categoryPath + "/" + shotName);

                // 1. Create Project Structure
                if (destProject && mainNode) {
                    try {
                        const res = await API.fs.mkdir(finalPath);
                        if (res && res.error) console.error("Error creating target:", finalPath, res.error);

                        const allAllowed = checkedProcs.concat(checkedEpFolders);

                        // Inject Root Metadata
                        if (injectMeta) await ShotCreator.writeMetadataFile(mainNode, finalPath);

                        await ShotCreator.createNodesRecursively(mainNode.id, finalPath, ShotCreator.selectedPreset.nodes, allAllowed, shotName, true, {}, injectMeta);
                        if (typeof PipetaConsole !== 'undefined') {
                            PipetaConsole.log('create', ` ↳ [SHOT WORK] 📁 Estructura creada en: ${finalPath}`, 'ok');
                        }
                    } catch (err) {
                        console.error("Error creating project structure:", finalPath, err);
                    }
                }

                // 2. Create Media Structure (Mirror)
                if (destMedia && mirrorTargetPath && mainNode) {
                    try {
                        const res = await API.fs.mkdir(mirrorTargetPath);
                        if (res && res.error) console.error("Error creating mirror target:", mirrorTargetPath, res.error);

                        // Find Mirror Node to start recursion from
                        const mirrorConn = ShotCreator.selectedPreset.connections.find(c => c.from === mainNode.id && (c.fromPort === 'mirror' || c.toPort === 'mirror'));
                        if (mirrorConn) {
                            const mirrorNodeId = (mirrorConn.from === mainNode.id) ? mirrorConn.to : mirrorConn.from;
                            const mirrorNode = ShotCreator.selectedPreset.nodes.find(n => n.id === mirrorNodeId);

                            // Inject Root Metadata
                            if (injectMeta && mirrorNode) await ShotCreator.writeMetadataFile(mirrorNode, mirrorTargetPath);

                            // For Mirror, we pass 'checkedMediaNodes' and the 'destMediaFull' flag
                            await ShotCreator.createNodesRecursively(mirrorNodeId, mirrorTargetPath, ShotCreator.selectedPreset.nodes, checkedMediaNodes, shotName, destMediaFull, {}, injectMeta);
                            if (typeof PipetaConsole !== 'undefined') {
                                PipetaConsole.log('create', ` ↳ [SHOT MEDIA] 📁 Espejo creado en: ${mirrorTargetPath}`, 'ok');
                            }
                        }
                    } catch (err) {
                        console.error("Error creating mirror structure:", mirrorTargetPath, err);
                    }
                }

                // Refresh Hierarchy
                if (level === 'episode' || level === 'scene') {
                    await ShotCreator.loadHierarchy(level === 'episode' ? 'scene' : 'shot');
                }

            } else {
                // Batch (Shots only)
                if (mainNode) {
                    for (const shotPath of targets) {
                        const currentShotName = shotPath.trim().replace(/\\/g, '/').split('/').pop();
                        await ShotCreator.createNodesRecursively(mainNode.id, shotPath, ShotCreator.selectedPreset.nodes, checkedProcs, currentShotName);
                        if (typeof PipetaConsole !== 'undefined') {
                            PipetaConsole.log('create', ` ↳ [SHOT INJECT] 📁 Procesos inyectados en: ${shotPath}`, 'ok');
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Critical Error in executeCreation", e);
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('create', `[SHOT CREATOR] ❌ Error en creación: ${e.message}`, 'error');
            }
            ShotCreator.showOverlay(`
                <div style="font-size:2rem; margin-bottom:10px;">❌</div>
                <div style="color:#f88;">Error Crítico</div>
                <div style="font-size:0.8rem; color:#666; margin-top:5px;">${e.message}</div>
                <button onclick="ShotCreator.hideOverlay()" style="margin-top:15px; padding:8px 15px; background:#333; color:white; border:none; cursor:pointer;">Cerrar</button>
            `);
            return;
        }

        // Clear input on success
        if (mode === 'create') {
            const nameInput = document.getElementById('sc-item-name');
            if (nameInput) nameInput.value = "";
        }
        if (typeof loadShotList === 'function') loadShotList();
        if (typeof refreshCurrentView === 'function') refreshCurrentView();

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('create', `[SHOT CREATOR] ✅ ${level.toUpperCase()} '${shotName}' creado con éxito en Proyecto y Media.`, 'ok');
        }

        ShotCreator.showOverlay(`
            <div style="font-size:2.5rem; margin-bottom:10px;">✅</div>
            <div style="font-size:1.2rem; color:#8f8; font-weight:bold; margin-bottom:10px;">¡Estructura Creada Exitosamente!</div>
            <div style="font-size:0.85rem; color:#ccc; max-width:550px; text-align:left; background:#222; padding:10px; border-radius:4px; margin-bottom:15px;">
                ${destProject ? `<div style="margin-bottom:6px; word-break:break-all;"><b style="color:var(--accent);">Proyecto:</b> ${fullTargetPath || categoryPath}</div>` : ''}
                ${destMedia && mirrorTargetPath ? `<div style="word-break:break-all;"><b style="color:#ff9800;">Media:</b> ${mirrorTargetPath}</div>` : ''}
            </div>
            <button onclick="ShotCreator.hideOverlay(); ShotCreator.render();" style="padding:8px 25px; background:var(--accent); color:black; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">LISTO</button>
        `);
    },

    // Helper to resolve all possible tags in a name/pattern
    resolveNodePattern: (pattern, ctx, node = null) => {
        if (!pattern) return "";
        let res = pattern;

        // 1. Global context keys
        const globals = {
            'proyecto': ctx.project || "PROYECTO",
            'Project': ctx.project || "PROYECTO",
            'PROYECTO': ctx.project || "PROYECTO",
            'Cliente': ctx.client || "CLIENTE",
            'Client': ctx.client || "CLIENTE",
            'CLIENTE': ctx.client || "CLIENTE",
            'Episodio': ctx.episode || "EPISODIO",
            'Episode': ctx.episode || "EPISODIO",
            'EP': ctx.episode || "EPISODIO",
            'Escena': ctx.scene || "ESCENA",
            'Scene': ctx.scene || "ESCENA",
            'ESC': ctx.scene || "ESCENA",
            'SEQ': ctx.scene || "ESCENA",
            'SceneName': ctx.scene || "ESCENA",
            'Shot': ctx.shot || "SHOT",
            'SHOT': ctx.shot || "SHOT",
            'ASSET': ctx.shot || "SHOT",
            'SHOTNAME': ctx.shotNameResolved || ctx.vars?.['SHOTNAME'] || ctx.shot || "SHOT",
            'SHOT_NAME': ctx.shotNameResolved || ctx.vars?.['SHOT_NAME'] || ctx.shot || "SHOT",
            'NICK': ctx.nick || ctx.vars?.['NICK'] || "NICK",
            'PROC': ctx.proceso || "PROCESO",
            'PROCESO': ctx.proceso || "PROCESO"
        };

        for (const [key, val] of Object.entries(globals)) {
            const regex = new RegExp('\\[' + key + '\\]', 'gi');
            res = res.replace(regex, val);
        }

        // 2. Hierarchy Variables (passed in ctx.vars)
        if (ctx.vars) {
            for (const [key, val] of Object.entries(ctx.vars)) {
                if (globals[key]) continue; // Skip globals already handled
                const regex = new RegExp('\\[' + key + '\\]', 'gi');
                res = res.replace(regex, val);
            }
        }

        // 3. Versioning (Default v000 or custom like v001)
        if (res.match(/\[VER\]|\[version\]|\[SceneVersion\]/i)) {
            const pad = (node && node.nameConfig) ? node.nameConfig.versionPadding : 3;
            const prefix = (node && node.nameConfig && node.nameConfig.versionPrefix === false) ? '' : 'v';
            const verNum = (ctx.versionNumber !== undefined) ? ctx.versionNumber : 0;
            const vStr = prefix + String(verNum).padStart(pad || 3, '0');
            res = res.replace(/\[VER\]/gi, vStr)
                .replace(/\[version\]/gi, vStr)
                .replace(/\[SceneVersion\]/gi, vStr);
        }

        // 4. Counters (Default start)
        res = res.replace(/\[RenderCounter(#+)\]/gi, (match, hashes) => {
            return '1'.padStart(hashes.length, '0'); // Start at 1, padded to hash count
        });

        // 5. Clean up / replace [ext]
        if (ctx.extension) {
            const cleanExt = ctx.extension.startsWith('.') ? ctx.extension : '.' + ctx.extension;
            res = res.replace(/\.?\[ext\]/gi, cleanExt);
        } else {
            res = res.replace(/\.?\[ext\]/gi, '');
        }

        if (node && node.nameConfig && node.nameConfig.forceUpper) {
            res = res.toUpperCase();
        }

        return res;
    },

    writeMetadataFile: async (node, fullPath) => {
        if (!ShotCreator.selectedPreset || !node) return;
        const metaData = {
            preset_id: ShotCreator.selectedPreset.id,
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
            user: ShotCreator.systemInfo ? ShotCreator.systemInfo.username : "unknown"
        };
        const metaPath = fullPath + "/vfx_control.json";
        try {
            await API.fs.writeFile(metaPath, JSON.stringify(metaData, null, 2));
        } catch (e) {
            console.error("Error injecting metadata to:", metaPath, e);
        }
    },

    createNodesRecursively: async (parentId, parentPath, allNodes, allowedProcesses = [], shotName = "", isFullMedia = true, inheritedVars = {}, injectMeta = false) => {
        const levelWeight = { 'episode': 1, 'scene': 2, 'shot': 3 };
        const currentWeight = levelWeight[ShotCreator.creationLevel] || 99;

        const projNode = ShotCreator.selectedPreset?.nodes?.find(n => n.isProjectNode);
        const projNick = projNode?.nickExample || projNode?.nickVarName || "SURF";

        // Calculate resolved shot folder name if in shot level
        let shotResolvedName = shotName;
        const shotNode = allNodes.find(n => n.isShot || n.isAssetFocus);
        if (shotNode && shotNode.nameConfig && shotNode.nameConfig.enabled && shotNode.nameConfig.pattern) {
            const baseCtx = {
                project: ShotCreator.currentContext.project,
                client: ShotCreator.currentContext.client,
                episode: ShotCreator.selectedParentEpisode,
                scene: ShotCreator.selectedParentScene,
                shot: shotName,
                nick: projNick,
                vars: { 'NICK': projNick, 'EP': ShotCreator.selectedParentEpisode, 'ESC': ShotCreator.selectedParentScene, 'SEQ': ShotCreator.selectedParentScene, 'SHOT': shotName }
            };
            shotResolvedName = ShotCreator.resolveNodePattern(shotNode.nameConfig.pattern, baseCtx, shotNode);
        }

        const shotInputKey = shotNode?.shotInputVar || 'SHOT';
        const shotOutputKey = shotNode?.variableName || 'SHOTNAME';

        const children = allNodes.filter(n => n.parent === parentId);
        for (const child of children) {
            // --- Depth Safeguard ---
            let nodeWeight = 0;
            if (child.isEpisode) nodeWeight = 1;
            else if (child.isScene) nodeWeight = 2;
            else if (child.isShot || child.isAssetFocus) nodeWeight = 3;

            if (nodeWeight > currentWeight) continue;

            // Skip externally generated nodes (TCL/Nuke generated on render)
            if (child.isExternalTcl) continue;

            // Process/Folder Filter Logic
            const isFilterableNode = (ShotCreator.processNodes || []).concat(ShotCreator.episodeFolderNodes || []).concat(ShotCreator.mediaFolderNodes || []).find(p => p.id === child.id);
            if (isFilterableNode) {
                if (!allowedProcesses.includes(child.id)) {
                    continue;
                }
            }

            // Build Context for this node
            const ctx = {
                project: ShotCreator.currentContext.project,
                client: ShotCreator.currentContext.client,
                episode: ShotCreator.selectedParentEpisode,
                scene: ShotCreator.selectedParentScene,
                shot: shotName,
                nick: projNick,
                shotNameResolved: shotResolvedName,
                proceso: inheritedVars['PROCESO'] || inheritedVars['PROC'] || "PROCESO",
                vars: {
                    'NICK': projNick,
                    'EP': ShotCreator.selectedParentEpisode,
                    'ESC': ShotCreator.selectedParentScene,
                    'SEQ': ShotCreator.selectedParentScene,
                    'SHOT': shotName,
                    [shotInputKey]: shotName,
                    'SHOTNAME': shotResolvedName,
                    'SHOT_NAME': shotResolvedName,
                    [shotOutputKey]: shotResolvedName,
                    ...inheritedVars
                }
            };

            // --- CONNECTION LOOKUP LOGIC ---
            // Check if this node has incoming connections from other nodes (e.g., Process Node -> Render Folder)
            // If so, we resolve the source node's name and adds its 'variableName' to our context.
            if (ShotCreator.selectedPreset && ShotCreator.selectedPreset.connections) {
                const incomingConn = ShotCreator.selectedPreset.connections.find(c => c.to === child.id);
                if (incomingConn) {
                    const sourceNode = allNodes.find(n => n.id === incomingConn.from);
                    if (sourceNode) {
                        // Build a source-specific context: find the source node's own process parent
                        const sourceCtx = { ...ctx };
                        let srcParent = sourceNode;
                        while (srcParent) {
                            const p = allNodes.find(n => n.id === srcParent.parent);
                            if (p && p.isProcess) {
                                sourceCtx.proceso = p.name;
                                break;
                            }
                            srcParent = p;
                            if (!srcParent) break;
                        }

                        let sourceName = sourceNode.name;
                        if (sourceNode.nameConfig && sourceNode.nameConfig.enabled && sourceNode.nameConfig.pattern) {
                            sourceName = ShotCreator.resolveNodePattern(sourceNode.nameConfig.pattern, sourceCtx, sourceNode);
                        } else {
                            sourceName = ShotCreator.resolveNodePattern(sourceNode.name, sourceCtx, sourceNode);
                        }

                        // 1. Inject variableName if defined
                        if (sourceNode.variableName) {
                            ctx.vars[sourceNode.variableName] = sourceName;
                        }

                        // 2. CRITICAL: If the source is a PROCESS, we must set ctx.proceso = sourceName
                        // This fixes [PROCESO] resolving to literal "PROCESO" string
                        if (sourceNode.isProcess) {
                            ctx.proceso = sourceName;
                            // Also inject common variants for safety
                            ctx.vars['PROC'] = sourceName;
                            ctx.vars['PROCESO'] = sourceName;
                        }
                    }
                }
            }
            // -------------------------------

            // Find Process name if needed (climb up hierarchy)
            let tempSearch = child;
            while (tempSearch) {
                const parentNode = allNodes.find(n => n.id === tempSearch.parent);
                if (parentNode && parentNode.isProcess) { ctx.proceso = parentNode.name; break; }
                tempSearch = parentNode;
                if (!tempSearch) break;
            }

            let finalName = child.name;
            if (child.nameConfig && child.nameConfig.enabled && child.nameConfig.pattern) {
                finalName = ShotCreator.resolveNodePattern(child.nameConfig.pattern, ctx, child);
            } else {
                // Even without pattern, resolve tags in node name
                finalName = ShotCreator.resolveNodePattern(child.name, ctx, child);
            }

            // If this node defines a variable itself, save it for its children (hierarchy)
            if (child.variableName) {
                ctx.vars[child.variableName] = finalName;
            }

            if (child.type === 'file') {
                let templateCopied = false;
                if (ShotCreator.createTemplateV001) {
                    const tpl = await ShotCreator.getTemplateFileForProcess(ctx.proceso, child);
                    if (tpl && tpl.sourcePath) {
                        // Resolve canonical file name with v001 and real template extension
                        let v001Ctx = { ...ctx, versionNumber: 1, extension: tpl.ext };
                        let v001Name = child.name;
                        if (child.nameConfig && child.nameConfig.enabled && child.nameConfig.pattern) {
                            v001Name = ShotCreator.resolveNodePattern(child.nameConfig.pattern, v001Ctx, child);
                        } else {
                            v001Name = ShotCreator.resolveNodePattern(child.name, v001Ctx, child);
                        }

                        // Ensure proper extension
                        const dotIdx = v001Name.lastIndexOf('.');
                        if (dotIdx !== -1 && (v001Name.length - dotIdx) <= 6) {
                            v001Name = v001Name.substring(0, dotIdx);
                        }
                        v001Name += tpl.ext;

                        const destFilePath = parentPath + "/" + v001Name;
                        try {
                            await API.fs.copy(tpl.sourcePath, destFilePath);
                            templateCopied = true;
                            console.log("[ShotCreator] Template v001 created:", destFilePath, "from:", tpl.sourcePath);
                        } catch(err) {
                            console.error("[ShotCreator] Error copying template v001:", err);
                        }
                    }
                }

                if (!templateCopied && ShotCreator.createVersionZero) {
                    const fullFileName = finalName + ".txt";
                    const filePath = parentPath + "/" + fullFileName;
                    try { await API.fs.writeFile(filePath, ""); } catch (e) { }
                }
                continue;
            }

            // Folder Creation
            const fullPath = parentPath + "/" + finalName;
            try { await API.fs.mkdir(fullPath); } catch (e) { }

            // --- METADATA INJECTION (vfx_control.json) ---
            if (injectMeta) {
                await ShotCreator.writeMetadataFile(child, fullPath);
            }
            // ----------------------------------------------

            // Recurse
            if (isFullMedia || !isFilterableNode) {
                await ShotCreator.createNodesRecursively(child.id, fullPath, allNodes, allowedProcesses, shotName, isFullMedia, ctx.vars, injectMeta);
            }
        }
    },

    makeDraggable: () => {
        const header = document.getElementById('shot-creator-drag');
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
                ShotCreator.container.style.top = (ShotCreator.container.offsetTop - pos2) + "px";
                ShotCreator.container.style.left = (ShotCreator.container.offsetLeft - pos1) + "px";
                ShotCreator.container.style.transform = "none"; // Remove centering
            };
        };
    }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => ShotCreator.init());
