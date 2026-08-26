// ============================================================
// --- SHOT NAVIGATOR MODULE (PIPETA WORKFLOW TRACKER) ---
// ============================================================

const ShotNavigator = {
    initialized: false,
    container: null,
    
    // Data State
    project: null,
    shotPreset: null,
    users: [],
    roles: [],
    statuses: [],
    activeUser: null,
    
    // Workflow State
    trackerData: { shots: {} },
    trackerFilePath: null,
    availableProcesses: [],
    
    // UI Navigation & Filters
    selectedEpisode: 'ALL',
    selectedScene: 'ALL',
    selectedStatus: 'ALL',
    selectedProcess: 'ALL',
    searchQuery: '',
    onlyMyShots: false,
    selectedShotId: null,
    
    // Multi-Selection & Expansion State
    selectedShotKeys: new Set(),
    expandedShotKeys: new Set(),
    rootStatusMode: 'auto', // 'auto' | 'general' | '[proc_id]'

    // In-Memory Performance Caches
    workflowLoaded: false,
    _cachedProcesses: null,
    _cachedUsers: null,
    _cachedStatuses: null,
    _cachedUserOptionsHtml: '',
    _cachedStatusOptionsHtml: '',
    _cachedProcOptionsHtml: '',
    
    init: async (force = false) => {
        ShotNavigator.container = document.getElementById('view-shot-navigator');
        if (!ShotNavigator.container) return;
        
        if (!ShotNavigator.initialized || force) {
            await ShotNavigator.loadDependencies(force);
            await ShotNavigator.loadWorkflow(force);
            ShotNavigator.initialized = true;
        }
        ShotNavigator.render();
    },

    loadDependencies: async (force = false) => {
        // 1. Current Project
        if (typeof settings !== 'undefined') {
            ShotNavigator.project = settings.currentProject || settings.getBaseProject();
        }
        
        // 2. Users & Roles (Cached)
        if (force || !ShotNavigator._cachedUsers) {
            try {
                const uData = await API.users.get();
                ShotNavigator.users = uData.users || [];
                ShotNavigator.roles = uData.roles || [];
                ShotNavigator.activeUser = uData.activeUser || (ShotNavigator.users[0]?.laspUser || 'lasp-mpastorino');
                ShotNavigator._cachedUsers = ShotNavigator.users;
            } catch(e) {
                console.error("[ShotNav] Error loading users:", e);
            }
        } else {
            ShotNavigator.users = ShotNavigator._cachedUsers;
        }

        // 3. Statuses (Cached)
        if (force || !ShotNavigator._cachedStatuses) {
            try {
                const sData = await API.statuses.get();
                ShotNavigator.statuses = sData.statuses || [];
                ShotNavigator._cachedStatuses = ShotNavigator.statuses;
            } catch(e) {
                console.error("[ShotNav] Error loading statuses:", e);
            }
        } else {
            ShotNavigator.statuses = ShotNavigator._cachedStatuses;
        }

        // 4. Extract processes dynamically from the active project's Shot Designer preset (Cached)
        await ShotNavigator.loadShotProcessesFromPreset(force);
        ShotNavigator.rebuildOptionCaches();
    },

    rebuildOptionCaches: () => {
        ShotNavigator._cachedUserOptionsHtml = (ShotNavigator.users || []).map(u => {
            const uid = ShotNavigator.getUserIdentifier(u);
            const dName = ShotNavigator.getUserDisplayName(u);
            return `<option value="${uid}" style="background:#1c222d; color:#fff;">${dName}</option>`;
        }).join('');

        ShotNavigator._cachedStatusOptionsHtml = (ShotNavigator.statuses || []).map(st => `
            <option value="${st.id}" ${st.id === 'assigned' ? 'selected' : ''} style="background:#1c222d; color:${st.color || '#fff'};">${st.icon} ${st.name}</option>
        `).join('');

        ShotNavigator._cachedProcOptionsHtml = (ShotNavigator.availableProcesses || []).map(p => `
            <option value="${p.id}" style="background:#1c222d; color:#fff;">${p.name}</option>
        `).join('');
    },

    invalidatePresetCache: () => {
        ShotNavigator._cachedProcesses = null;
        ShotNavigator.availableProcesses = [];
        ShotNavigator.rebuildOptionCaches();
    },

    loadShotProcessesFromPreset: async (force = false) => {
        if (!force && ShotNavigator._cachedProcesses && ShotNavigator._cachedProcesses.length > 0) {
            ShotNavigator.availableProcesses = ShotNavigator._cachedProcesses;
            return;
        }

        ShotNavigator.availableProcesses = [];
        if (!ShotNavigator.project) return;
        
        const presetId = ShotNavigator.project.defaultShotPresetId || 'pipeline_test';
        try {
            let presetObj = null;
            // 1. Intentar cargar por nombre directo
            try {
                const presetPath = `C:\\TOOLS\\APPS\\Pipeta\\presets\\ShotDesigner\\${presetId}.json`;
                const content = await API.fs.readFile(presetPath);
                if (content) presetObj = JSON.parse(content);
            } catch(e) {}

            // 2. Si no cargó, buscar en la carpeta ShotDesigner
            if (!presetObj) {
                try {
                    const files = await API.fs.fetchDir('C:\\TOOLS\\APPS\\Pipeta\\presets\\ShotDesigner');
                    if (files && files.items) {
                        for (const item of files.items) {
                            if (item.name.endsWith('.json')) {
                                const c = await API.fs.readFile(pathJoin('C:\\TOOLS\\APPS\\Pipeta\\presets\\ShotDesigner', item.name));
                                if (c) {
                                    const parsed = JSON.parse(c);
                                    if (parsed.id === presetId || item.name.replace('.json', '') === presetId) {
                                        presetObj = parsed;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } catch(e) {}
            }

            if (presetObj && presetObj.nodes && Array.isArray(presetObj.nodes)) {
                ShotNavigator.shotPreset = presetObj;
                
                // Encontrar el nodo SHOT en el árbol de TRABAJO (work tree: y < 0 o no media)
                let shotNode = presetObj.nodes.find(n => 
                    (n.isShot || n.variableName === 'SHOT' || n.variableName === 'SHOTNAME') &&
                    (!n.id.toLowerCase().includes('media') && (n.y === undefined || n.y < 0))
                );
                if (!shotNode) {
                    shotNode = presetObj.nodes.find(n => n.isShot || n.variableName === 'SHOT' || n.variableName === 'SHOTNAME');
                }

                if (shotNode) {
                    // Los procesos son ÚNICAMENTE las carpetas marcadas con isProcess: true
                    const hasExplicitProcesses = presetObj.nodes.some(n => n.isProcess === true);
                    const childNodes = presetObj.nodes.filter(n => {
                        if (n.type !== 'folder' || n.isRenderFolder || n.isVariable) return false;
                        if (hasExplicitProcesses) {
                            return n.isProcess === true;
                        }
                        return n.parent === shotNode.id && n.isProcess !== false && !n.isExternalTcl;
                    });

                    const seen = new Set();
                    childNodes.forEach(n => {
                        if (n.name) {
                            const cleanName = n.name.toLowerCase().trim();
                            if (!seen.has(cleanName) && cleanName.length > 1 && !cleanName.includes('.')) {
                                seen.add(cleanName);
                                ShotNavigator.availableProcesses.push({
                                    id: cleanName,
                                    name: n.name.toUpperCase(),
                                    nodeId: n.id
                                });
                            }
                        }
                    });
                }
            }
            ShotNavigator._cachedProcesses = ShotNavigator.availableProcesses;
        } catch(e) {
            console.warn("[ShotNav] Could not load Shot Designer preset processes:", e);
        }

        // Si el preset solo tiene 'compo', availableProcesses tendrá exactamente [{ id: 'compo', name: 'COMPO' }]
        if (ShotNavigator.availableProcesses.length === 0) {
            ShotNavigator.availableProcesses = [
                { id: 'compo', name: 'COMPO' }
            ];
            ShotNavigator._cachedProcesses = ShotNavigator.availableProcesses;
        }
    },

    getProjectWorkflowDir: () => {
        if (!ShotNavigator.project) return 'Z:\\workflow';
        const projectWork = (ShotNavigator.project.roots?.work || 'Z:/[cliente]/[proyecto]').replace(/\//g, '\\');
        return pathJoin(projectWork, 'workflow');
    },

    loadWorkflow: async (force = false) => {
        if (!ShotNavigator.project) return;
        if (!force && ShotNavigator.workflowLoaded && Object.keys(ShotNavigator.trackerData?.shots || {}).length > 0) {
            return;
        }

        const projectWork = (ShotNavigator.project.roots?.work || '').replace(/\//g, '\\');
        const workflowDir = ShotNavigator.getProjectWorkflowDir();
        
        try {
            const res = await API.workflow.loadTracker(projectWork, workflowDir);
            if (res && res.success) {
                ShotNavigator.trackerFilePath = res.trackerFile;
                ShotNavigator.trackerData = res.trackerData || { shots: {} };
                if (!ShotNavigator.trackerData.shots) ShotNavigator.trackerData.shots = {};
            }
        } catch(e) {
            console.error("[ShotNav] Error loading shot tracker:", e);
        }

        // Real-time scan of physical disk folders ONLY on forced refresh or initial empty database
        if (force || Object.keys(ShotNavigator.trackerData.shots || {}).length === 0) {
            await ShotNavigator.discoverShotsFromDisk();
        }

        // Poner estado 'none' a todas las compos que estuvieran en 'in_progress' por defecto
        if (ShotNavigator.trackerData && ShotNavigator.trackerData.shots) {
            let updated = false;
            for (const sh of Object.values(ShotNavigator.trackerData.shots)) {
                if (sh.processes) {
                    for (const [pId, pData] of Object.entries(sh.processes)) {
                        if (pId.toLowerCase() === 'compo' && pData.status === 'in_progress' && (!pData.assignedUsers || pData.assignedUsers.length === 0)) {
                            pData.status = 'none';
                            updated = true;
                        }
                    }
                }
            }
            if (updated) {
                await ShotNavigator.saveTracker();
            }
        }

        ShotNavigator.workflowLoaded = true;
    },

    refreshWorkflow: async () => {
        ShotNavigator.showToast('🔄 Escaneando y actualizando estado...', 'info');
        await ShotNavigator.loadDependencies(true);
        await ShotNavigator.loadWorkflow(true);
        ShotNavigator.render();
        ShotNavigator.showToast('✅ Workflow actualizado con éxito', 'success');
    },

    discoverShotsFromDisk: async () => {
        if (!ShotNavigator.project) return;
        const projectWork = (ShotNavigator.project.roots?.work || '').replace(/\//g, '\\');
        if (!projectWork) return;

        try {
            const scanDir = async (dirPath) => {
                try {
                    return await API.fs.fetchDir(dirPath);
                } catch(e) { return null; }
            };

            let epDir = pathJoin(projectWork, 'episodios');
            let epList = await scanDir(epDir);
            if (!epList || !epList.items) {
                epDir = projectWork;
                epList = await scanDir(epDir);
            }

            if (epList && epList.items) {
                const episodes = epList.items.filter(i => i.isDirectory && !i.name.startsWith('_') && !i.name.startsWith('.'));
                for (const ep of episodes) {
                    const epPath = pathJoin(epDir, ep.name);
                    let seqDir = pathJoin(epPath, 'secuencias');
                    let seqList = await scanDir(seqDir);
                    if (!seqList || !seqList.items) {
                        seqDir = epPath;
                        seqList = await scanDir(seqDir);
                    }

                    if (seqList && seqList.items) {
                        const scenes = seqList.items.filter(i => i.isDirectory && !i.name.startsWith('_') && !i.name.startsWith('.'));
                        for (const sc of scenes) {
                            const scPath = pathJoin(seqDir, sc.name);
                            let shotsDir = pathJoin(scPath, 'shots');
                            let shotsList = await scanDir(shotsDir);
                            if (!shotsList || !shotsList.items) {
                                shotsDir = scPath;
                                shotsList = await scanDir(shotsDir);
                            }

                            if (shotsList && shotsList.items) {
                                const shots = shotsList.items.filter(i => i.isDirectory && !i.name.startsWith('_') && !i.name.startsWith('.'));
                                for (const sh of shots) {
                                    const shotPath = pathJoin(shotsDir, sh.name);
                                    const shotKey = `${ep.name}_${sc.name}_${sh.name}`;
                                    
                                    if (!ShotNavigator.trackerData.shots[shotKey]) {
                                        ShotNavigator.trackerData.shots[shotKey] = {
                                            id: shotKey,
                                            name: sh.name,
                                            episode: ep.name,
                                            scene: sc.name,
                                            path: shotPath,
                                            processes: {},
                                            status: 'none',
                                            notes: '',
                                            updatedAt: new Date().toISOString()
                                        };
                                    }

                                    const sObj = ShotNavigator.trackerData.shots[shotKey];
                                    if (!sObj.processes) sObj.processes = {};

                                    const allowedProcIds = (ShotNavigator.availableProcesses || []).map(p => p.id.toLowerCase());

                                    // 1. Escanear carpetas reales en disco dentro del plano
                                    const diskItems = await scanDir(shotPath);
                                    const existingFolders = (diskItems && diskItems.items) 
                                        ? diskItems.items.filter(i => i.isDirectory).map(i => i.name.toLowerCase().trim())
                                        : [];

                                    // 2. Limpiar y sincronizar procesos del tracker
                                    for (const pId of Object.keys(sObj.processes)) {
                                        const pLower = pId.toLowerCase();
                                        const isAllowed = allowedProcIds.includes(pLower) || 
                                                          (pLower === 'comp' && allowedProcIds.includes('compo')) || 
                                                          (pLower === 'compo' && allowedProcIds.includes('comp'));

                                        const exists = existingFolders.includes(pLower) || 
                                                       (pLower === 'compo' && existingFolders.includes('comp')) ||
                                                       (pLower === 'comp' && existingFolders.includes('compo'));
                                        sObj.processes[pId].folderExists = exists;

                                        // Migración de formato simple a array
                                        if (sObj.processes[pId].assignedUser && !sObj.processes[pId].assignedUsers) {
                                            sObj.processes[pId].assignedUsers = [sObj.processes[pId].assignedUser];
                                            delete sObj.processes[pId].assignedUser;
                                        }
                                        if (!Array.isArray(sObj.processes[pId].assignedUsers)) {
                                            sObj.processes[pId].assignedUsers = [];
                                        }

                                        // Si NO es un proceso definido en el Shot Designer y no tiene usuarios asignados, PURGARLO (ej: '2d', '3d')
                                        if (!isAllowed && sObj.processes[pId].assignedUsers.length === 0) {
                                            delete sObj.processes[pId];
                                        } else if (!exists && sObj.processes[pId].assignedUsers.length === 0 && (sObj.processes[pId].status === 'none' || sObj.processes[pId].status === 'not_started')) {
                                            delete sObj.processes[pId];
                                        }
                                    }

                                    // 3. Si en disco hay carpetas reales que correspondan a procesos válidos, agregarlas con estado 'none'
                                    for (const fName of existingFolders) {
                                        let matchedProcId = null;
                                        if (allowedProcIds.includes(fName)) {
                                            matchedProcId = fName;
                                        } else if (fName === 'comp' && allowedProcIds.includes('compo')) {
                                            matchedProcId = 'compo';
                                        }

                                        if (matchedProcId) {
                                            if (!sObj.processes[matchedProcId]) {
                                                sObj.processes[matchedProcId] = {
                                                    assignedUsers: [],
                                                    status: 'none',
                                                    folderExists: true,
                                                    notes: ''
                                                };
                                            } else {
                                                sObj.processes[matchedProcId].folderExists = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch(e) {
            console.error("[ShotNav] Error during shot discovery:", e);
        }
    },

    saveTracker: async () => {
        if (!ShotNavigator.project) return;
        const workflowDir = ShotNavigator.getProjectWorkflowDir();
        
        try {
            await API.workflow.saveTracker(workflowDir, ShotNavigator.trackerData);
            console.log("[ShotNav] Tracker saved successfully to", workflowDir);
        } catch(e) {
            console.error("[ShotNav] Error saving tracker:", e);
            alert("Error al guardar base de datos de workflow: " + e.message);
        }
    },

    // --- SELECTION LOGIC ---
    toggleSelectShot: (shotKey, e) => {
        if (e) e.stopPropagation();
        if (ShotNavigator.selectedShotKeys.has(shotKey)) {
            ShotNavigator.selectedShotKeys.delete(shotKey);
        } else {
            ShotNavigator.selectedShotKeys.add(shotKey);
        }
        ShotNavigator.updateTableOnly();
        ShotNavigator.updateHeaderSelectionCount();
    },

    toggleSelectAllFiltered: () => {
        const filtered = ShotNavigator.getFilteredShots();
        const allSelected = filtered.length > 0 && filtered.every(s => ShotNavigator.selectedShotKeys.has(s.id));
        
        if (allSelected) {
            filtered.forEach(s => ShotNavigator.selectedShotKeys.delete(s.id));
        } else {
            filtered.forEach(s => ShotNavigator.selectedShotKeys.add(s.id));
        }
        ShotNavigator.updateTableOnly();
        ShotNavigator.updateHeaderSelectionCount();
    },

    // --- EXPANSION & ROOT STATUS MODES ---
    toggleExpandShot: (shotId, e) => {
        if (e) e.stopPropagation();
        if (ShotNavigator.expandedShotKeys.has(shotId)) {
            ShotNavigator.expandedShotKeys.delete(shotId);
        } else {
            ShotNavigator.expandedShotKeys.add(shotId);
        }
        ShotNavigator.updateTableOnly();
    },

    toggleExpandAllFiltered: () => {
        const filtered = ShotNavigator.getFilteredShots();
        const allExpanded = filtered.length > 0 && filtered.every(s => ShotNavigator.expandedShotKeys.has(s.id));
        if (allExpanded) {
            filtered.forEach(s => ShotNavigator.expandedShotKeys.delete(s.id));
        } else {
            filtered.forEach(s => ShotNavigator.expandedShotKeys.add(s.id));
        }
        ShotNavigator.updateTableOnly();
    },

    setRootStatusMode: (mode) => {
        ShotNavigator.rootStatusMode = mode;
        ShotNavigator.updateTableOnly();
    },

    computeShotAutomaticStatus: (sh) => {
        const procs = Object.entries(sh.processes || {}).filter(([pId, pData]) => {
            const isKnown = ShotNavigator.availableProcesses.some(p => p.id.toLowerCase() === pId.toLowerCase());
            const users = pData.assignedUsers || (pData.assignedUser ? [pData.assignedUser] : []);
            return isKnown || users.length > 0 || pData.folderExists || (pData.status && pData.status !== 'none' && pData.status !== 'not_started');
        });

        if (procs.length === 0) {
            return ShotNavigator.statuses.find(s => s.id === 'none') || { id: 'none', name: 'Ninguno', color: '#757575', icon: '⚪' };
        }

        const statuses = procs.map(([_, pData]) => pData.status || 'none');

        // 1. Si todos tienen el mismo estado exacto
        const uniqueStatuses = Array.from(new Set(statuses));
        if (uniqueStatuses.length === 1) {
            const stId = uniqueStatuses[0];
            return ShotNavigator.statuses.find(s => s.id === stId) || { id: stId, name: stId, color: '#757575', icon: '⚪' };
        }

        // 2. Si todos están aprobados
        if (statuses.every(s => s === 'approved')) {
            return ShotNavigator.statuses.find(s => s.id === 'approved') || { id: 'approved', name: 'Aprobado', color: '#4caf50', icon: '🟢' };
        }

        // 3. Si alguno está cancelado
        if (statuses.some(s => s === 'canceled')) {
            return ShotNavigator.statuses.find(s => s.id === 'canceled') || { id: 'canceled', name: 'Cancelado', color: '#f44336', icon: '🔴' };
        }

        // 4. Si alguno está en review
        if (statuses.some(s => s === 'review')) {
            return ShotNavigator.statuses.find(s => s.id === 'review') || { id: 'review', name: 'Review', color: '#9c27b0', icon: '🟣' };
        }

        // 5. Si hay mezcla (algunos aprobados y otros asignados o en proceso) o alguno está en in_progress -> 'in_progress'
        if (statuses.some(s => s === 'in_progress' || s === 'approved')) {
            return ShotNavigator.statuses.find(s => s.id === 'in_progress') || { id: 'in_progress', name: 'En Proceso', color: '#ff9800', icon: '🟠' };
        }

        // 6. Si alguno está en hold
        if (statuses.some(s => s === 'hold')) {
            return ShotNavigator.statuses.find(s => s.id === 'hold') || { id: 'hold', name: 'En Pausa / Hold', color: '#ffc107', icon: '🟡' };
        }

        // 7. Si alguno está asignado
        if (statuses.some(s => s === 'assigned')) {
            return ShotNavigator.statuses.find(s => s.id === 'assigned') || { id: 'assigned', name: 'Asignado', color: '#2196f3', icon: '🔵' };
        }

        return ShotNavigator.statuses.find(s => s.id === 'none') || { id: 'none', name: 'Ninguno', color: '#757575', icon: '⚪' };
    },

    getShotRootStatus: (sh) => {
        const mode = ShotNavigator.rootStatusMode || 'auto';
        if (mode === 'general') {
            return ShotNavigator.statuses.find(s => s.id === sh.status) || { id: sh.status, name: sh.status || 'Ninguno', color: '#757575', icon: '⚪' };
        }
        if (mode === 'auto') {
            return ShotNavigator.computeShotAutomaticStatus(sh);
        }
        // Modo por proceso específico (ej: 'compo')
        const pData = sh.processes ? sh.processes[mode] : null;
        if (!pData) {
            return { id: 'none', name: 'No creado', color: '#555', icon: '—' };
        }
        const stId = pData.status || 'none';
        return ShotNavigator.statuses.find(s => s.id === stId) || { id: stId, name: stId, color: '#757575', icon: '⚪' };
    },

    // --- FILTERS & QUERY ---
    toggleOnlyMyShots: () => {
        ShotNavigator.onlyMyShots = !ShotNavigator.onlyMyShots;
        ShotNavigator.updateTableOnly();
        if (typeof updateHeaderTools === 'function') updateHeaderTools('view-shot-navigator');
    },

    setEpisodeFilter: (ep) => {
        ShotNavigator.selectedEpisode = ep;
        ShotNavigator.selectedScene = 'ALL';
        ShotNavigator.render();
    },

    setSceneFilter: (sc) => {
        ShotNavigator.selectedScene = sc;
        ShotNavigator.render();
    },

    setStatusFilter: (st) => {
        ShotNavigator.selectedStatus = st;
        ShotNavigator.updateTableOnly();
    },

    setProcessFilter: (pr) => {
        ShotNavigator.selectedProcess = pr;
        ShotNavigator.updateTableOnly();
    },

    setSearchQuery: (q) => {
        ShotNavigator.searchQuery = q.toLowerCase().trim();
        ShotNavigator.updateTableOnly();
    },

    getFilteredShots: () => {
        const all = Object.values(ShotNavigator.trackerData.shots || {});
        return all.filter(sh => {
            // Episode filter
            if (ShotNavigator.selectedEpisode !== 'ALL' && sh.episode !== ShotNavigator.selectedEpisode) return false;
            // Scene filter
            if (ShotNavigator.selectedScene !== 'ALL' && sh.scene !== ShotNavigator.selectedScene) return false;
            // Status filter (evaluates against effective root status)
            if (ShotNavigator.selectedStatus !== 'ALL') {
                const effectiveStatus = ShotNavigator.getShotRootStatus(sh);
                if (effectiveStatus.id !== ShotNavigator.selectedStatus && sh.status !== ShotNavigator.selectedStatus) return false;
            }
            // Process filter
            if (ShotNavigator.selectedProcess !== 'ALL') {
                const proc = sh.processes && (sh.processes[ShotNavigator.selectedProcess] || sh.processes[ShotNavigator.selectedProcess.toLowerCase()]);
                if (!proc || (proc.status === 'not_started' && (!proc.assignedUsers || proc.assignedUsers.length === 0) && !proc.folderExists)) return false;
            }
            // "Only My Shots" filter
            if (ShotNavigator.onlyMyShots && ShotNavigator.activeUser) {
                const isAssigned = Object.values(sh.processes || {}).some(p => 
                    (p.assignedUsers && p.assignedUsers.includes(ShotNavigator.activeUser)) || p.assignedUser === ShotNavigator.activeUser
                );
                if (!isAssigned) return false;
            }
            // Search query
            if (ShotNavigator.searchQuery) {
                const matchesName = sh.name.toLowerCase().includes(ShotNavigator.searchQuery);
                const matchesEp = sh.episode.toLowerCase().includes(ShotNavigator.searchQuery);
                const matchesSc = sh.scene.toLowerCase().includes(ShotNavigator.searchQuery);
                const matchesUser = Object.values(sh.processes || {}).some(p => 
                    (p.assignedUsers || []).some(u => u.toLowerCase().includes(ShotNavigator.searchQuery))
                );
                if (!matchesName && !matchesEp && !matchesSc && !matchesUser) return false;
            }
            return true;
        });
    },

    // --- ACTIONS ON SELECTED SHOTS ---
    ensureMissingFoldersForSelected: async () => {
        if (ShotNavigator.selectedShotKeys.size === 0) {
            alert("Selecciona al menos un plano en la lista para crear sus carpetas faltantes.");
            return;
        }

        const foldersToCreate = [];
        ShotNavigator.selectedShotKeys.forEach(sKey => {
            const sh = ShotNavigator.trackerData.shots[sKey];
            if (sh && sh.path) {
                for (const [pId, pData] of Object.entries(sh.processes || {})) {
                    if (!pData.folderExists) {
                        foldersToCreate.push(pathJoin(sh.path, pId));
                    }
                }
            }
        });

        if (foldersToCreate.length === 0) {
            alert("Todas las carpetas de procesos de los planos seleccionados ya existen en disco.");
            return;
        }

        if (!confirm(`¿Deseas crear ${foldersToCreate.length} carpetas físicas de procesos para los ${ShotNavigator.selectedShotKeys.size} planos seleccionados?`)) return;

        try {
            const res = await API.workflow.ensureProcessFolders(foldersToCreate);
            if (res && res.success) {
                await ShotNavigator.refreshWorkflow();
                alert(`✅ Se crearon ${res.createdCount} carpetas con éxito.`);
            }
        } catch(e) {
            alert("Error: " + e.message);
        }
    },

    exportMyTasksFile: async () => {
        if (!ShotNavigator.activeUser) {
            alert("No hay un usuario activo seleccionado.");
            return;
        }

        const workflowDir = ShotNavigator.getProjectWorkflowDir();

        const userTasks = [];
        Object.values(ShotNavigator.trackerData.shots || {}).forEach(sh => {
            const userProcs = [];
            for (const [pId, pData] of Object.entries(sh.processes || {})) {
                const isAssigned = (pData.assignedUsers && pData.assignedUsers.includes(ShotNavigator.activeUser)) || pData.assignedUser === ShotNavigator.activeUser;
                if (isAssigned) {
                    userProcs.push({
                        processId: pId,
                        status: pData.status,
                        folderExists: pData.folderExists,
                        notes: pData.notes
                    });
                }
            }
            if (userProcs.length > 0) {
                userTasks.push({
                    shotId: sh.id,
                    name: sh.name,
                    episode: sh.episode,
                    scene: sh.scene,
                    path: sh.path,
                    assignedProcesses: userProcs
                });
            }
        });

        try {
            const res = await API.workflow.exportUserTasks(workflowDir, ShotNavigator.activeUser, userTasks, {
                projectName: ShotNavigator.project?.name,
                projectId: ShotNavigator.project?.id
            });
            if (res && res.success) {
                alert(`✅ Tareas exportadas con éxito para ${ShotNavigator.activeUser} (${userTasks.length} planos).\nGuardado en: ${res.filePath}`);
            }
        } catch(e) {
            alert("Error al exportar tareas: " + e.message);
        }
    },

    // --- USER & PERMISSIONS HELPERS ---
    getActiveUserObj: () => {
        const act = ShotNavigator.activeUser;
        if (!act) return null;
        return (ShotNavigator.users || []).find(u => 
            u.username === act || 
            u.laspUser === act || 
            u.id === act ||
            (u.laspUser && u.laspUser.replace('lasp-', '') === act.replace('lasp-', '')) ||
            (u.username && u.username.toLowerCase() === act.toLowerCase())
        );
    },

    getActiveUserRole: () => {
        const userObj = ShotNavigator.getActiveUserObj();
        if (userObj) {
            return (ShotNavigator.roles || []).find(r => r.id === userObj.role);
        }
        if (ShotNavigator.activeUser && ShotNavigator.activeUser.toLowerCase() === 'admin') {
            return (ShotNavigator.roles || []).find(r => r.id === 'admin');
        }
        return (ShotNavigator.roles || []).find(r => r.id === 'user');
    },

    canUserAssign: () => {
        const role = ShotNavigator.getActiveUserRole();
        if (!role) return false;
        if (role.id === 'admin') return true;
        return role.permissions?.assignAllShots === true;
    },

    canUserEditStatuses: () => {
        const role = ShotNavigator.getActiveUserRole();
        if (!role) return true;
        if (role.id === 'admin') return true;
        return role.permissions?.workflow_edit_statuses !== false;
    },

    getUserIdentifier: (u) => {
        if (!u) return '';
        return u.laspUser || u.username || u.id;
    },

    getUserDisplayName: (u) => {
        if (!u) return '';
        if (u.firstName && u.lastName) {
            const alias = u.laspUser ? `@${u.laspUser.replace('lasp-', '')}` : u.username;
            return `${u.firstName} ${u.lastName} (${alias})`;
        }
        if (u.username) return u.username;
        if (u.laspUser) return `@${u.laspUser.replace('lasp-', '')}`;
        return u.id;
    },

    getUserBadgeLabel: (identifier) => {
        if (!identifier) return '';
        const found = (ShotNavigator.users || []).find(u => 
            u.laspUser === identifier || u.username === identifier || u.id === identifier
        );
        if (found) {
            if (found.laspUser) return `@${found.laspUser.replace('lasp-', '')}`;
            if (found.username) return found.username;
        }
        return identifier.startsWith('lasp-') ? `@${identifier.replace('lasp-', '')}` : identifier;
    },

    // --- TOAST NOTIFICATIONS (NON-BLOCKING) ---
    showToast: (message, type = 'info') => {
        let toastContainer = document.getElementById('shotnav-toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'shotnav-toast-container';
            toastContainer.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:99999; display:flex; flex-direction:column; gap:8px; pointer-events:none;';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        const bg = type === 'success' ? '#2e7d32' : (type === 'error' ? '#c62828' : '#1565c0');
        toast.style.cssText = `background:${bg}; color:white; padding:10px 16px; border-radius:6px; font-size:0.85rem; font-weight:bold; box-shadow:0 4px 14px rgba(0,0,0,0.5); opacity:0; transform:translateY(10px); transition:all 0.25s ease; pointer-events:auto; display:flex; align-items:center; gap:8px;`;
        toast.innerHTML = message;
        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    },

    // --- TARGETED DOM UPDATES ---
    updateTableOnly: () => {
        const container = document.getElementById('shotNavTableContainer');
        if (container) {
            const filteredShots = ShotNavigator.getFilteredShots();
            const allSelected = filteredShots.length > 0 && filteredShots.every(s => ShotNavigator.selectedShotKeys.has(s.id));
            container.innerHTML = ShotNavigator.renderShotsTable(filteredShots, allSelected);
        }
    },

    updateInspectorOnly: () => {
        const inspector = document.getElementById('shotNavInspector');
        if (inspector) {
            inspector.innerHTML = ShotNavigator.renderInspector();
        }
    },

    updateHeaderSelectionCount: () => {
        const span = document.getElementById('shotnav-selected-count');
        if (span) {
            span.textContent = `${ShotNavigator.selectedShotKeys.size} seleccionados`;
        }
    },

    // --- ASSIGNMENT & PROCESS EDITING ---
    toggleUserOnProcess: async (shotKey, processId, userIdentifier) => {
        if (!ShotNavigator.canUserAssign()) {
            const role = ShotNavigator.getActiveUserRole();
            ShotNavigator.showToast(`⛔ Permiso denegado: Tu rol ("${role?.name || 'Artista'}") no puede asignar usuarios.`, 'error');
            return;
        }

        const shot = ShotNavigator.trackerData.shots[shotKey];
        if (!shot) return;
        if (!shot.processes[processId]) {
            shot.processes[processId] = { assignedUsers: [], status: 'none', folderExists: false };
        }
        if (!Array.isArray(shot.processes[processId].assignedUsers)) {
            shot.processes[processId].assignedUsers = [];
        }

        const list = shot.processes[processId].assignedUsers;
        const idx = list.indexOf(userIdentifier);
        if (idx >= 0) {
            list.splice(idx, 1);
        } else {
            list.push(userIdentifier);
            if (shot.processes[processId].status === 'none' || shot.processes[processId].status === 'not_started') {
                shot.processes[processId].status = 'assigned';
            }
        }

        shot.updatedAt = new Date().toISOString();
        ShotNavigator.saveTracker(); // Background async
        ShotNavigator.updateTableOnly();
        ShotNavigator.updateInspectorOnly();
    },

    setProcessStatus: async (shotKey, processId, statusId) => {
        const shot = ShotNavigator.trackerData.shots[shotKey];
        if (!shot) return;
        if (!shot.processes[processId]) {
            shot.processes[processId] = { assignedUsers: [], status: 'none', folderExists: false };
        }
        shot.processes[processId].status = statusId;
        shot.updatedAt = new Date().toISOString();
        
        const procs = Object.values(shot.processes);
        if (procs.length > 0 && procs.every(p => p.status === 'approved')) {
            shot.status = 'approved';
        } else if (procs.some(p => p.status === 'canceled' || p.status === 'retake')) {
            shot.status = 'canceled';
        } else if (procs.some(p => p.status === 'in_progress')) {
            shot.status = 'in_progress';
        }
        
        ShotNavigator.saveTracker(); // Background async
        ShotNavigator.updateTableOnly();
        ShotNavigator.updateInspectorOnly();
    },

    openAssignProcessModal: (shotId) => {
        if (!ShotNavigator.canUserAssign()) {
            const role = ShotNavigator.getActiveUserRole();
            ShotNavigator.showToast(`⛔ Permiso denegado: Tu rol ("${role?.name || 'Artista'}") no puede asignar procesos.`, 'error');
            return;
        }

        const shot = ShotNavigator.trackerData.shots[shotId];
        if (!shot) return;

        const overlay = document.createElement('div');
        overlay.id = 'pipeta-shotnav-modal-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(5,7,11,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; transform:translateZ(0); will-change:opacity;';

        const procOptions = ShotNavigator._cachedProcOptionsHtml || (ShotNavigator.availableProcesses.map(p => `
            <option value="${p.id}" style="background:#1c222d; color:#fff;">${p.name}</option>
        `).join(''));

        const userOptions = ShotNavigator._cachedUserOptionsHtml || '';
        const statusOptions = ShotNavigator._cachedStatusOptionsHtml || '';

        overlay.innerHTML = `
            <div style="background:#14171e; border:1px solid #28303d; border-radius:8px; width:440px; max-width:92vw; padding:22px; box-shadow:0 10px 30px rgba(0,0,0,0.8); color:#eee; transform:translateZ(0); contain:content;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #28303d; padding-bottom:12px; margin-bottom:16px;">
                    <h3 style="margin:0; font-size:1.05rem; color:var(--accent); display:flex; align-items:center; gap:8px;">
                        <span>🛠️</span>
                        <span>Asignar Proceso a ${shot.name}</span>
                    </h3>
                    <button onclick="ShotNavigator.closeModalOverlay()" style="background:transparent; border:none; color:#888; font-size:1.2rem; cursor:pointer;">&times;</button>
                </div>

                <div style="display:flex; flex-direction:column; gap:14px;">
                    <div>
                        <label style="display:block; font-size:0.8rem; color:#aaa; margin-bottom:6px;">Proceso del Pipeline:</label>
                        <select id="modal-proc-id" style="width:100%; background:#1c222d; color:#fff; border:1px solid #2e3846; border-radius:4px; padding:8px 10px; font-size:0.88rem; color-scheme:dark; cursor:pointer; outline:none;">
                            ${procOptions}
                        </select>
                    </div>

                    <div>
                        <label style="display:block; font-size:0.8rem; color:#aaa; margin-bottom:6px;">Usuario Asignado:</label>
                        <select id="modal-proc-user" style="width:100%; background:#1c222d; color:#fff; border:1px solid #2e3846; border-radius:4px; padding:8px 10px; font-size:0.88rem; color-scheme:dark; cursor:pointer; outline:none;">
                            <option value="" style="background:#1c222d; color:#888;">(Sin asignar)</option>
                            ${userOptions}
                        </select>
                    </div>

                    <div>
                        <label style="display:block; font-size:0.8rem; color:#aaa; margin-bottom:6px;">Estado Inicial:</label>
                        <select id="modal-proc-status" style="width:100%; background:#1c222d; color:#fff; border:1px solid #2e3846; border-radius:4px; padding:8px 10px; font-size:0.88rem; color-scheme:dark; cursor:pointer; outline:none;">
                            ${statusOptions}
                        </select>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid #28303d; padding-top:14px;">
                    <button class="btn" onclick="ShotNavigator.closeModalOverlay()" style="background:#222; color:#ccc; border:1px solid #444; padding:6px 14px; border-radius:4px; cursor:pointer;">Cancelar</button>
                    <button class="btn" onclick="ShotNavigator.saveAssignProcessModal('${shot.id}')" style="background:var(--accent); color:black; font-weight:bold; border:none; padding:6px 18px; border-radius:4px; cursor:pointer;">
                        Asignar Proceso
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    },

    saveAssignProcessModal: async (shotId) => {
        if (!ShotNavigator.canUserAssign()) {
            ShotNavigator.showToast("⛔ Permiso denegado: No tienes permisos para asignar procesos.", 'error');
            return;
        }

        const shot = ShotNavigator.trackerData.shots[shotId];
        if (!shot) return;

        const procId = document.getElementById('modal-proc-id')?.value;
        const user = document.getElementById('modal-proc-user')?.value;
        const status = document.getElementById('modal-proc-status')?.value || 'assigned';

        if (!procId) {
            ShotNavigator.showToast("Selecciona un proceso.", 'error');
            return;
        }

        if (!shot.processes) shot.processes = {};

        const procObj = ShotNavigator.availableProcesses.find(p => p.id === procId);
        const procName = procObj?.name || procId.toUpperCase();
        const alreadyExists = !!shot.processes[procId];

        if (alreadyExists) {
            const current = shot.processes[procId];
            if (!Array.isArray(current.assignedUsers)) current.assignedUsers = [];
            if (user && !current.assignedUsers.includes(user)) {
                current.assignedUsers.push(user);
            }
            current.status = status;
            shot.updatedAt = new Date().toISOString();
            ShotNavigator.saveTracker();
            ShotNavigator.closeModalOverlay();
            ShotNavigator.updateTableOnly();
            ShotNavigator.updateInspectorOnly();
            ShotNavigator.showToast(`ℹ️ Proceso "${procName}" actualizado en ${shot.name}`, 'info');
        } else {
            shot.processes[procId] = {
                assignedUsers: user ? [user] : [],
                status: status,
                folderExists: false,
                notes: ''
            };
            shot.updatedAt = new Date().toISOString();
            ShotNavigator.saveTracker();
            ShotNavigator.closeModalOverlay();
            ShotNavigator.updateTableOnly();
            ShotNavigator.updateInspectorOnly();
            ShotNavigator.showToast(`✅ Proceso "${procName}" asignado a ${shot.name}`, 'success');
        }
    },

    closeModalOverlay: () => {
        const overlay = document.getElementById('pipeta-shotnav-modal-overlay');
        if (overlay) overlay.remove();
    },

    removeProcessFromShot: async (shotKey, processId) => {
        if (!ShotNavigator.canUserAssign()) {
            ShotNavigator.showToast("⛔ Permiso denegado: No tienes permisos para quitar procesos.", 'error');
            return;
        }

        const shot = ShotNavigator.trackerData.shots[shotKey];
        if (!shot || !shot.processes || !shot.processes[processId]) return;
        if (confirm(`¿Quitar el proceso ${processId.toUpperCase()} de este plano?`)) {
            delete shot.processes[processId];
            shot.updatedAt = new Date().toISOString();
            ShotNavigator.saveTracker();
            ShotNavigator.updateTableOnly();
            ShotNavigator.updateInspectorOnly();
            ShotNavigator.showToast(`🗑️ Proceso quitado de ${shot.name}`, 'info');
        }
    },

    // --- RENDERING ---
    render: () => {
        if (!ShotNavigator.container) return;

        const filteredShots = ShotNavigator.getFilteredShots();
        const episodes = Array.from(new Set(Object.values(ShotNavigator.trackerData.shots || {}).map(s => s.episode))).sort();
        const scenes = ShotNavigator.selectedEpisode === 'ALL' 
            ? Array.from(new Set(Object.values(ShotNavigator.trackerData.shots || {}).map(s => s.scene))).sort()
            : Array.from(new Set(Object.values(ShotNavigator.trackerData.shots || {}).filter(s => s.episode === ShotNavigator.selectedEpisode).map(s => s.scene))).sort();

        const allSelected = filteredShots.length > 0 && filteredShots.every(s => ShotNavigator.selectedShotKeys.has(s.id));

        ShotNavigator.container.innerHTML = `
            <!-- PANEL IZQUIERDO: JERARQUÍA DE EPISODIOS & ESCENAS -->
            <div class="shot-nav-sidebar" style="width:250px; min-width:230px; background:#14171d; border-right:1px solid #232a35; display:flex; flex-direction:column; height:100%;">
                <div style="padding:12px 14px; border-bottom:1px solid #232a35; background:#0f1217; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:var(--accent); font-size:0.88rem;">🎬 Jerarquía</span>
                    <button class="icon-btn" onclick="ShotNavigator.refreshWorkflow()" title="Refrescar estado de planos y carpetas en disco" style="background:transparent; border:none; color:#aaa; font-size:0.9rem; cursor:pointer;">
                        🔄
                    </button>
                </div>

                <div style="flex:1; overflow-y:auto; padding:10px;">
                    <div class="shot-nav-tree-item ${ShotNavigator.selectedEpisode === 'ALL' ? 'active' : ''}" 
                         onclick="ShotNavigator.setEpisodeFilter('ALL')"
                         style="padding:8px 10px; border-radius:4px; cursor:pointer; margin-bottom:4px; font-weight:bold; font-size:0.85rem; display:flex; justify-content:space-between; color:${ShotNavigator.selectedEpisode === 'ALL' ? 'var(--accent)' : '#ccc'}; background:${ShotNavigator.selectedEpisode === 'ALL' ? 'rgba(255,152,0,0.12)' : 'transparent'};">
                        <span>🌐 Todos</span>
                        <span style="color:#666; font-size:0.75rem;">(${Object.keys(ShotNavigator.trackerData.shots || {}).length})</span>
                    </div>

                    ${episodes.map(ep => {
                        const epShots = Object.values(ShotNavigator.trackerData.shots || {}).filter(s => s.episode === ep);
                        const approvedCount = epShots.filter(s => s.status === 'approved').length;
                        const pct = epShots.length > 0 ? Math.round((approvedCount / epShots.length) * 100) : 0;
                        const isSelected = ShotNavigator.selectedEpisode === ep;

                        return `
                            <div style="margin-bottom:6px;">
                                <div class="shot-nav-tree-item ${isSelected ? 'active' : ''}"
                                     onclick="ShotNavigator.setEpisodeFilter('${ep}')"
                                     style="padding:8px 10px; border-radius:4px; cursor:pointer; font-size:0.85rem; display:flex; justify-content:space-between; align-items:center; color:${isSelected ? 'white' : '#bbb'}; background:${isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)'}; border-left:${isSelected ? '3px solid var(--accent)' : '3px solid transparent'};">
                                    <span style="font-weight:bold;">📦 ${ep}</span>
                                    <span style="font-size:0.72rem; color:${pct === 100 ? '#4caf50' : '#ff9800'};">${approvedCount}/${epShots.length} (${pct}%)</span>
                                </div>

                                ${isSelected ? `
                                    <div style="padding-left:12px; margin-top:4px; border-left:1px dashed #333; margin-left:8px;">
                                        <div class="shot-nav-tree-subitem ${ShotNavigator.selectedScene === 'ALL' ? 'active' : ''}"
                                             onclick="ShotNavigator.setSceneFilter('ALL')"
                                             style="padding:4px 8px; font-size:0.78rem; cursor:pointer; border-radius:3px; color:${ShotNavigator.selectedScene === 'ALL' ? 'var(--accent)' : '#888'};">
                                            • Todas (${epShots.length})
                                        </div>
                                        ${scenes.map(sc => {
                                            const scShots = epShots.filter(s => s.scene === sc);
                                            const isScSelected = ShotNavigator.selectedScene === sc;
                                            return `
                                                <div class="shot-nav-tree-subitem ${isScSelected ? 'active' : ''}"
                                                     onclick="ShotNavigator.setSceneFilter('${sc}')"
                                                     style="padding:4px 8px; font-size:0.78rem; cursor:pointer; border-radius:3px; display:flex; justify-content:space-between; color:${isScSelected ? 'white' : '#aaa'}; background:${isScSelected ? 'rgba(255,152,0,0.15)' : 'transparent'};">
                                                    <span>🎞️ ${sc}</span>
                                                    <span style="color:#666;">(${scShots.length})</span>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- PANEL CENTRAL: LISTADO DE PLANOS & FILTROS LIMPIOS -->
            <div style="flex:1; display:flex; flex-direction:column; height:100%; overflow:hidden; background:#0b0d11;">
                
                <!-- Barra de Filtros Interna -->
                <div style="padding:10px 16px; background:#12161f; border-bottom:1px solid #232a35; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <!-- Input de Búsqueda -->
                    <div style="position:relative; flex:1; min-width:200px; max-width:280px;">
                        <input type="text" placeholder="🔍 Buscar plano, escena, usuario..." 
                               value="${ShotNavigator.searchQuery}" 
                               oninput="ShotNavigator.setSearchQuery(this.value)"
                               style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; font-size:0.82rem; outline:none;">
                    </div>

                    <!-- Filtro: Modo de Estado Root -->
                    <div style="display:flex; align-items:center; gap:6px; background:#181d26; border:1px solid #28303d; border-radius:4px; padding:2px 8px;">
                        <span style="font-size:0.75rem; color:#888; white-space:nowrap;">Estado Root:</span>
                        <select onchange="ShotNavigator.setRootStatusMode(this.value)" 
                                style="background:transparent; border:none; color:var(--accent); font-weight:bold; font-size:0.8rem; padding:4px 2px; outline:none; cursor:pointer;">
                            <option value="auto" ${ShotNavigator.rootStatusMode === 'auto' ? 'selected' : ''} style="background:#181d26; color:#fff;">🤖 Automático (Resumen)</option>
                            <option value="general" ${ShotNavigator.rootStatusMode === 'general' ? 'selected' : ''} style="background:#181d26; color:#fff;">🎯 General (Manual)</option>
                            ${ShotNavigator.availableProcesses.map(pr => `
                                <option value="${pr.id}" ${ShotNavigator.rootStatusMode === pr.id ? 'selected' : ''} style="background:#181d26; color:#fff;">🛠️ Proceso: ${pr.name}</option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Filtro de Estado -->
                    <select onchange="ShotNavigator.setStatusFilter(this.value)" 
                            style="background:#1c222d; border:1px solid #2e3846; border-radius:4px; color:#ccc; font-size:0.82rem; padding:6px 8px;">
                        <option value="ALL" ${ShotNavigator.selectedStatus === 'ALL' ? 'selected' : ''}>Todos los Estados</option>
                        ${ShotNavigator.statuses.map(st => `
                            <option value="${st.id}" ${ShotNavigator.selectedStatus === st.id ? 'selected' : ''}>${st.icon} ${st.name}</option>
                        `).join('')}
                    </select>

                    <!-- Filtro de Proceso -->
                    <select onchange="ShotNavigator.setProcessFilter(this.value)" 
                            style="background:#1c222d; border:1px solid #2e3846; border-radius:4px; color:#ccc; font-size:0.82rem; padding:6px 8px;">
                        <option value="ALL" ${ShotNavigator.selectedProcess === 'ALL' ? 'selected' : ''}>Todos los Procesos</option>
                        ${ShotNavigator.availableProcesses.map(pr => `
                            <option value="${pr.id}" ${ShotNavigator.selectedProcess === pr.id ? 'selected' : ''}>🛠️ ${pr.name}</option>
                        `).join('')}
                    </select>

                    <!-- Botón Expandir/Colapsar Todo -->
                    <button class="tool-btn" onclick="ShotNavigator.toggleExpandAllFiltered()" title="Expandir o colapsar todos los planos" 
                            style="background:#1c222d; border:1px solid #2e3846; color:#eee; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; gap:4px; white-space:nowrap;">
                        <span>${filteredShots.length > 0 && filteredShots.every(s => ShotNavigator.expandedShotKeys.has(s.id)) ? '⊟ Colapsar Todo' : '⊞ Expandir Todo'}</span>
                    </button>

                    <!-- Botón Refrescar -->
                    <button class="tool-btn" onclick="ShotNavigator.refreshWorkflow()" title="Refrescar estado real de procesos en disco" 
                            style="background:#1c222d; border:1px solid #2e3846; color:#4fc3f7; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; gap:4px;">
                        <span>↻ Refrescar</span>
                    </button>

                    <div style="flex:1;"></div>

                    <span id="shotnav-selected-count" style="font-size:0.78rem; color:#888; font-family:monospace; white-space:nowrap;">
                        ${ShotNavigator.selectedShotKeys.size} seleccionados
                    </span>
                </div>

                <!-- Tabla de Shots con Jerarquía Acordeón y Sub-filas de Procesos -->
                <div id="shotNavTableContainer" style="flex:1; overflow-y:auto; padding:16px;">
                    ${ShotNavigator.renderShotsTable(filteredShots, allSelected)}
                </div>
            </div>

            <!-- PANEL DERECHO: INSPECTOR DE SHOT -->
            <div id="shotNavInspector" style="width:320px; min-width:300px; background:#14171d; border-left:1px solid #232a35; display:flex; flex-direction:column; height:100%;">
                ${ShotNavigator.renderInspector()}
            </div>
        `;
    },

    selectShot: (shotId) => {
        ShotNavigator.selectedShotId = shotId;
        ShotNavigator.updateInspectorOnly();
        
        // Update highlight styling on rows instantly without rebuilding table DOM
        document.querySelectorAll('.shot-table-row').forEach(row => {
            const id = row.getAttribute('data-shot-id');
            const isSel = ShotNavigator.selectedShotKeys.has(id);
            const isFoc = (id === shotId);
            row.style.background = isSel ? 'rgba(255,152,0,0.12)' : (isFoc ? 'rgba(255,255,255,0.06)' : '#0f1217');
        });
    },

    renderShotsTable: (shots, allSelected) => {
        if (!shots || shots.length === 0) {
            return `
                <div style="text-align:center; padding:60px 20px; color:#666;">
                    <div style="font-size:2.5rem; margin-bottom:12px;">🎬</div>
                    <div style="font-size:1.1rem; color:#aaa; font-weight:bold;">No se encontraron planos</div>
                    <p style="font-size:0.85rem; max-width:400px; margin:8px auto;">Ajusta los filtros o crea planos con <i>Shot Creator</i>.</p>
                </div>
            `;
        }

        const canAssign = ShotNavigator.canUserAssign();

        return `
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.82rem;">
                <thead>
                    <tr style="border-bottom:2px solid #232a35; color:#888; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px;">
                        <th style="padding:10px 8px; width:36px; text-align:center;">
                            <input type="checkbox" ${allSelected ? 'checked' : ''} 
                                   onchange="ShotNavigator.toggleSelectAllFiltered()" 
                                   style="cursor:pointer; accent-color:var(--accent);">
                        </th>
                        <th style="padding:10px 12px; min-width:180px;">Plano</th>
                        <th style="padding:10px 12px;">Episodio / Escena</th>
                        <th style="padding:10px 12px;">
                            ${ShotNavigator.rootStatusMode === 'auto' ? 'Estado Root (Auto)' : (ShotNavigator.rootStatusMode === 'general' ? 'Estado General' : `Estado (${ShotNavigator.rootStatusMode.toUpperCase()})`)}
                        </th>
                        <th style="padding:10px 12px;">Procesos</th>
                        <th style="padding:10px 12px;">Usuarios Asignados</th>
                        <th style="padding:10px 8px; text-align:right;">Abrir</th>
                    </tr>
                </thead>
                <tbody>
                    ${shots.map(sh => {
                        const isSelected = ShotNavigator.selectedShotKeys.has(sh.id);
                        const isFocused = ShotNavigator.selectedShotId === sh.id;
                        const isExpanded = ShotNavigator.expandedShotKeys.has(sh.id);
                        const rootStatus = ShotNavigator.getShotRootStatus(sh);
                        
                        // Extract only processes that ACTUALLY exist in this shot and belong to the design
                        const activeProcs = [];
                        for (const [pId, pData] of Object.entries(sh.processes || {})) {
                            const isKnown = ShotNavigator.availableProcesses.some(p => p.id.toLowerCase() === pId.toLowerCase());
                            const users = pData.assignedUsers || (pData.assignedUser ? [pData.assignedUser] : []);
                            if (!isKnown && users.length === 0) continue;
                            const matchedName = (ShotNavigator.availableProcesses.find(p => p.id.toLowerCase() === pId.toLowerCase())?.name || pId).toUpperCase();
                            if (pData.folderExists || users.length > 0 || (pData.status && pData.status !== 'none' && pData.status !== 'not_started')) {
                                activeProcs.push({ id: pId, name: matchedName, ...pData, users });
                            }
                        }

                        // Collect unique assigned users across all processes in the shot
                        const allShotUsers = Array.from(new Set(activeProcs.flatMap(ap => ap.users)));

                        return `
                            <!-- FILA ROOT DEL SHOT -->
                            <tr class="shot-table-row" 
                                onclick="ShotNavigator.selectShot('${sh.id}')"
                                style="border-bottom:1px solid #1a1f29; cursor:pointer; background:${isSelected ? 'rgba(255,152,0,0.12)' : (isFocused ? 'rgba(255,255,255,0.05)' : '#0f1217')}; transition:background 0.15s;">
                                
                                <td style="padding:10px 8px; text-align:center;" onclick="event.stopPropagation();">
                                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                                           onchange="ShotNavigator.toggleSelectShot('${sh.id}', event)" 
                                           style="cursor:pointer; accent-color:var(--accent);">
                                </td>

                                <td style="padding:10px 12px; font-weight:bold; color:#fff;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <button onclick="ShotNavigator.toggleExpandShot('${sh.id}', event)" 
                                                title="${isExpanded ? 'Colapsar procesos' : 'Expandir procesos'}"
                                                style="background:transparent; border:none; color:${isExpanded ? 'var(--accent)' : '#777'}; font-size:0.75rem; cursor:pointer; padding:2px 4px; line-height:1; display:flex; align-items:center;">
                                            <span>${isExpanded ? '▼' : '▶'}</span>
                                        </button>
                                        <span style="font-size:0.9rem;">🎬 ${sh.name}</span>
                                    </div>
                                </td>

                                <td style="padding:10px 12px; color:#aaa; font-family:monospace;">
                                    ${sh.episode} / ${sh.scene}
                                </td>

                                <td style="padding:10px 12px;">
                                    ${ShotNavigator.rootStatusMode === 'general' ? `
                                        <select onchange="event.stopPropagation(); ShotNavigator.setShotGeneralStatus('${sh.id}', this.value)" 
                                                style="background:#1c222d; color:${rootStatus.color}; font-weight:bold; border:1px solid ${rootStatus.color}55; border-radius:4px; font-size:0.75rem; padding:2px 6px; cursor:pointer;">
                                            ${ShotNavigator.statuses.map(st => `
                                                <option value="${st.id}" ${sh.status === st.id ? 'selected' : ''}>${st.icon} ${st.name}</option>
                                            `).join('')}
                                        </select>
                                    ` : `
                                        <span style="display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:10px; font-size:0.72rem; font-weight:bold; background:${rootStatus.color}22; color:${rootStatus.color}; border:1px solid ${rootStatus.color}44;" title="${ShotNavigator.rootStatusMode === 'auto' ? 'Estado automático derivado de los procesos' : ('Estado del proceso ' + ShotNavigator.rootStatusMode.toUpperCase())}">
                                            <span>${rootStatus.icon}</span>
                                            <span>${rootStatus.name}</span>
                                        </span>
                                    `}
                                </td>

                                <!-- Columna: Resumen de Procesos -->
                                <td style="padding:10px 12px;">
                                    <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                                        ${activeProcs.length === 0 ? `<span style="color:#555; font-size:0.75rem;">(Sin procesos)</span>` : 
                                            activeProcs.map(ap => {
                                                const pStatus = ShotNavigator.statuses.find(s => s.id === ap.status) || { color: '#666', icon: '⚪' };
                                                return `
                                                    <span style="padding:2px 6px; border-radius:4px; font-size:0.7rem; background:#1c222d; border:1px solid ${pStatus.color}66; color:#eee; display:inline-flex; align-items:center; gap:4px;" title="${ap.name}: ${pStatus.name}">
                                                        <span style="color:${pStatus.color}; font-size:0.68rem;">${pStatus.icon}</span>
                                                        <span>${ap.name}</span>
                                                        ${!ap.folderExists ? `<span title="Falta carpeta física" style="color:#f44336; font-size:0.65rem;">⚠️</span>` : ''}
                                                    </span>
                                                `;
                                            }).join('')}
                                    </div>
                                </td>

                                <!-- Columna: Usuarios Asignados (Resumen Único) -->
                                <td style="padding:10px 12px;">
                                    ${allShotUsers.length === 0 ? `<span style="color:#555; font-size:0.75rem;">(Sin asignar)</span>` : `
                                        <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                            ${allShotUsers.map(u => `
                                                <span style="background:#161d27; border:1px solid #2e3846; border-radius:3px; padding:1px 5px; color:#4fc3f7; font-family:monospace; font-size:0.72rem;">
                                                    ${ShotNavigator.getUserBadgeLabel(u)}
                                                </span>
                                            `).join('')}
                                        </div>
                                    `}
                                </td>

                                <td style="padding:10px 8px; text-align:right;">
                                    <button class="icon-btn" onclick="event.stopPropagation(); API.fs.open('${sh.path.replace(/\\/g, '\\\\')}')" title="Abrir en Explorer" style="background:transparent; border:none; color:#888; cursor:pointer;">
                                        📂
                                    </button>
                                </td>
                            </tr>

                            <!-- SUB-FILAS DE PROCESOS (ACORDEÓN DESPLEGABLE) -->
                            ${isExpanded ? `
                                ${activeProcs.length === 0 ? `
                                    <tr style="background:rgba(18, 22, 31, 0.45); border-bottom:1px solid #181d26; font-size:0.75rem;">
                                        <td style="padding:6px 8px; text-align:center; color:#555;">
                                            <span style="color:var(--accent); font-family:monospace;">└──</span>
                                        </td>
                                        <td colspan="5" style="padding:6px 12px 6px 28px; color:#777; font-style:italic;">
                                            No hay procesos asignados todavía en este plano.
                                        </td>
                                        <td style="padding:6px 8px; text-align:right;">
                                            ${canAssign ? `<button onclick="event.stopPropagation(); ShotNavigator.openAssignProcessModal('${sh.id}')" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:0.75rem; font-weight:bold;">+ Asignar</button>` : ''}
                                        </td>
                                    </tr>
                                ` : activeProcs.map(ap => {
                                    const pStatus = ShotNavigator.statuses.find(s => s.id === ap.status) || { color: '#666', icon: '⚪', name: ap.status || 'Ninguno' };
                                    return `
                                        <tr class="shot-process-subrow" 
                                            onclick="ShotNavigator.selectShot('${sh.id}')"
                                            style="background:rgba(18, 22, 31, 0.65); border-bottom:1px solid #161a22; font-size:0.78rem;">
                                            
                                            <td style="padding:6px 8px; text-align:center; color:#555;">
                                                <span style="color:var(--accent); font-family:monospace; font-size:0.85rem;">└──</span>
                                            </td>

                                            <td style="padding:6px 12px 6px 28px; font-weight:bold; color:#ddd;">
                                                <div style="display:flex; align-items:center; gap:6px;">
                                                    <span style="color:var(--accent); font-size:0.8rem;">🛠️</span>
                                                    <span style="letter-spacing:0.5px; font-size:0.8rem;">${ap.name}</span>
                                                    ${ap.folderExists ? '<span style="color:#4caf50; font-size:0.7rem;" title="Carpeta física existe en disco">✓</span>' : '<span style="color:#f44336; font-size:0.7rem;" title="Falta crear carpeta física">⚠️</span>'}
                                                </div>
                                            </td>

                                            <td style="padding:6px 12px; color:#666; font-family:monospace; font-size:0.72rem;">
                                                /${ap.id}/
                                            </td>

                                            <td style="padding:6px 12px;">
                                                <select onchange="event.stopPropagation(); ShotNavigator.setProcessStatus('${sh.id}', '${ap.id}', this.value)"
                                                        style="background:#161d27; color:${pStatus.color}; font-weight:bold; border:1px solid ${pStatus.color}55; border-radius:4px; font-size:0.72rem; padding:2px 6px; cursor:pointer;">
                                                    ${ShotNavigator.statuses.map(st => `
                                                        <option value="${st.id}" ${ap.status === st.id ? 'selected' : ''}>${st.icon} ${st.name}</option>
                                                    `).join('')}
                                                </select>
                                            </td>

                                            <td style="padding:6px 12px;" colspan="2">
                                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    ${ap.users.length === 0 ? `<span style="color:#555; font-style:italic; font-size:0.72rem;">(Sin usuarios)</span>` : 
                                                        ap.users.map(u => `
                                                            <span style="background:#121720; border:1px solid #2e3846; border-radius:3px; padding:1px 6px; color:#4fc3f7; font-size:0.72rem; display:inline-flex; align-items:center; gap:4px;">
                                                                <span>${ShotNavigator.getUserBadgeLabel(u)}</span>
                                                                ${canAssign ? `<span onclick="event.stopPropagation(); ShotNavigator.toggleUserOnProcess('${sh.id}', '${ap.id}', '${u}')" style="cursor:pointer; color:#f44336; font-weight:bold; font-size:0.8rem;" title="Desasignar usuario">&times;</span>` : ''}
                                                            </span>
                                                        `).join('')}
                                                    ${canAssign ? `
                                                        <select onchange="if(this.value){ event.stopPropagation(); ShotNavigator.toggleUserOnProcess('${sh.id}', '${ap.id}', this.value); this.value=''; }"
                                                                onclick="event.stopPropagation();"
                                                                style="background:#10141a; color:#aaa; border:1px dashed #2e3846; border-radius:3px; font-size:0.7rem; padding:2px 4px; cursor:pointer;">
                                                            <option value="">+ Asignar...</option>
                                                            ${ShotNavigator.users.filter(u => !ap.users.includes(ShotNavigator.getUserIdentifier(u))).map(u => `
                                                                <option value="${ShotNavigator.getUserIdentifier(u)}">${ShotNavigator.getUserDisplayName(u)}</option>
                                                            `).join('')}
                                                        </select>
                                                    ` : ''}
                                                </div>
                                            </td>

                                            <td style="padding:6px 8px; text-align:right;">
                                                <button class="icon-btn" onclick="event.stopPropagation(); API.fs.open('${pathJoin(sh.path, ap.id).replace(/\\/g, '\\\\')}')" title="Abrir carpeta del proceso ${ap.name}" style="background:transparent; border:none; color:#777; cursor:pointer; font-size:0.78rem;">
                                                    📁
                                                </button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            ` : ''}
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    },

    renderInspector: () => {
        const shot = ShotNavigator.selectedShotId ? ShotNavigator.trackerData.shots[ShotNavigator.selectedShotId] : null;
        if (!shot) {
            return `
                <div style="padding:40px 20px; text-align:center; color:#666;">
                    <div style="font-size:2rem; margin-bottom:10px;">🔍</div>
                    <div style="font-weight:bold; color:#888;">Ningún plano seleccionado</div>
                    <p style="font-size:0.8rem; margin-top:6px;">Selecciona un plano de la tabla para ver sus procesos y detalles.</p>
                </div>
            `;
        }

        const canAssign = ShotNavigator.canUserAssign();
        const statusObj = ShotNavigator.statuses.find(s => s.id === shot.status) || { name: shot.status, color: '#666', icon: '⚪' };
        const shotProcs = Object.keys(shot.processes || {});

        return `
            <div style="padding:12px 14px; border-bottom:1px solid #232a35; background:#0f1217; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:bold; color:#fff; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    🎬 ${shot.name}
                </div>
                <button class="icon-btn" onclick="ShotNavigator.selectShot(null)" style="background:transparent; border:none; color:#888; font-size:1.1rem; cursor:pointer;">&times;</button>
            </div>

            <div style="flex:1; overflow-y:auto; padding:14px;">
                
                <!-- Info Básica -->
                <div style="background:#11151c; padding:10px; border-radius:6px; border:1px solid #232a35; margin-bottom:14px; font-size:0.8rem;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                        <span style="color:#888;">Jerarquía:</span>
                        <span style="color:#eee; font-weight:bold;">${shot.episode} / ${shot.scene}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:#888;">Estado General:</span>
                        <select onchange="ShotNavigator.setShotGeneralStatus('${shot.id}', this.value)" 
                                style="background:#1c222d; color:${statusObj.color}; font-weight:bold; border:1px solid ${statusObj.color}44; border-radius:4px; font-size:0.75rem; padding:2px 6px;">
                            ${ShotNavigator.statuses.map(st => `
                                <option value="${st.id}" ${shot.status === st.id ? 'selected' : ''}>${st.icon} ${st.name}</option>
                            `).join('')}
                        </select>
                    </div>
                </div>

                <!-- Botón Abrir Carpeta -->
                <div style="margin-bottom:16px;">
                    <button class="btn" onclick="API.fs.open('${shot.path.replace(/\\/g, '\\\\')}')" style="width:100%; background:#1c222d; color:#4fc3f7; border:1px solid #4fc3f744; font-size:0.78rem; font-weight:bold; padding:6px; border-radius:4px; cursor:pointer;">
                        📂 Abrir Carpeta del Plano
                    </button>
                </div>

                <!-- Header de Procesos y Botón Asignar Proceso -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:bold; color:var(--accent); font-size:0.85rem;">🛠️ Procesos Asignados</span>
                </div>

                <!-- Botón Modal para Asignar un Nuevo Proceso -->
                ${canAssign ? `
                    <div style="margin-bottom:14px;">
                        <button class="btn" onclick="ShotNavigator.openAssignProcessModal('${shot.id}')" 
                                style="width:100%; background:rgba(255,152,0,0.12); color:var(--accent); border:1px solid var(--accent); font-weight:bold; font-size:0.8rem; padding:8px; border-radius:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:background 0.2s;">
                            <span>➕ Asignar Proceso</span>
                        </button>
                    </div>
                ` : `
                    <div style="margin-bottom:14px; padding:6px 10px; background:rgba(255,255,255,0.02); border:1px dashed #28303d; border-radius:4px; text-align:center; font-size:0.75rem; color:#888;">
                        🔒 Solo Lectura (Sin permisos para asignar)
                    </div>
                `}

                <!-- Lista de Procesos Activos en el Shot -->
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${shotProcs.length === 0 ? `<div style="color:#666; font-size:0.78rem; font-style:italic; padding:10px; text-align:center;">No hay procesos creados ni asignados para este plano.</div>` : 
                        shotProcs.map(pId => {
                            const pData = shot.processes[pId];
                            const pName = (ShotNavigator.availableProcesses.find(p => p.id === pId)?.name || pId).toUpperCase();
                            const assignedUsers = Array.isArray(pData.assignedUsers) ? pData.assignedUsers : (pData.assignedUser ? [pData.assignedUser] : []);
                            const pStatus = ShotNavigator.statuses.find(s => s.id === pData.status) || { color: '#666', icon: '⚪' };

                            return `
                                <div style="background:#11151c; border:1px solid #232a35; border-radius:6px; padding:10px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                        <div style="font-weight:bold; color:#fff; font-size:0.82rem; display:flex; align-items:center; gap:6px;">
                                            <span>${pName}</span>
                                            ${pData.folderExists ? '<span style="color:#4caf50; font-size:0.7rem;" title="Carpeta existe">✓</span>' : '<span style="color:#f44336; font-size:0.7rem;" title="Falta carpeta">⚠️</span>'}
                                        </div>
                                        
                                        <div style="display:flex; align-items:center; gap:6px;">
                                            <select onchange="ShotNavigator.setProcessStatus('${shot.id}', '${pId}', this.value)"
                                                    style="background:#1c222d; color:${pStatus.color}; font-weight:bold; border:1px solid ${pStatus.color}44; border-radius:4px; font-size:0.72rem; padding:2px 6px;">
                                                ${ShotNavigator.statuses.map(st => `
                                                    <option value="${st.id}" ${pData.status === st.id ? 'selected' : ''}>${st.icon} ${st.name}</option>
                                                `).join('')}
                                            </select>
                                            ${canAssign ? `
                                                <button onclick="ShotNavigator.removeProcessFromShot('${shot.id}', '${pId}')" title="Quitar proceso" style="background:transparent; border:none; color:#666; cursor:pointer; font-size:0.8rem;">&times;</button>
                                            ` : ''}
                                        </div>
                                    </div>

                                    <!-- Lista de Usuarios Asignados (Multi-Usuario con Tags) -->
                                    <div style="font-size:0.75rem; margin-top:6px;">
                                        <div style="color:#888; margin-bottom:4px;">Usuarios Asignados:</div>
                                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;">
                                            ${assignedUsers.length === 0 ? `<span style="color:#555; font-style:italic;">(Ninguno)</span>` : 
                                                assignedUsers.map(u => `
                                                    <span style="background:#161d27; border:1px solid #2e3846; border-radius:3px; padding:2px 6px; color:#4fc3f7; display:inline-flex; align-items:center; gap:4px;">
                                                        <span>${ShotNavigator.getUserBadgeLabel(u)}</span>
                                                        ${canAssign ? `<span onclick="ShotNavigator.toggleUserOnProcess('${shot.id}', '${pId}', '${u}')" style="cursor:pointer; color:#f44336; font-weight:bold;">&times;</span>` : ''}
                                                    </span>
                                                `).join('')}
                                        </div>

                                        <!-- Selector para Añadir Usuario -->
                                        ${canAssign ? `
                                            <select onchange="if(this.value) { ShotNavigator.toggleUserOnProcess('${shot.id}', '${pId}', this.value); this.value=''; }"
                                                    style="width:100%; background:#1c222d; color:#eee; border:1px solid #2e3846; border-radius:4px; font-size:0.72rem; padding:4px;">
                                                <option value="">+ Añadir Usuario...</option>
                                                ${ShotNavigator.users.filter(u => !assignedUsers.includes(ShotNavigator.getUserIdentifier(u))).map(u => {
                                                    const uid = ShotNavigator.getUserIdentifier(u);
                                                    const dName = ShotNavigator.getUserDisplayName(u);
                                                    return `<option value="${uid}">${dName}</option>`;
                                                }).join('')}
                                            </select>
                                        ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                </div>
            </div>
        `;
    },

    setShotGeneralStatus: async (shotId, statusId) => {
        const shot = ShotNavigator.trackerData.shots[shotId];
        if (!shot) return;
        shot.status = statusId;
        shot.updatedAt = new Date().toISOString();
        ShotNavigator.saveTracker();
        ShotNavigator.updateTableOnly();
        ShotNavigator.updateInspectorOnly();
    }
};

// Helper utils
function pathJoin(...parts) {
    return parts.join('\\').replace(/[\\\/]+/g, '\\');
}

// Global hook
window.ShotNavigator = ShotNavigator;
