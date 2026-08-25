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
    
    // Multi-Selection State
    selectedShotKeys: new Set(),
    
    init: async () => {
        ShotNavigator.container = document.getElementById('view-shot-navigator');
        if (!ShotNavigator.container) return;
        
        await ShotNavigator.loadDependencies();
        await ShotNavigator.loadWorkflow();
        ShotNavigator.initialized = true;
        ShotNavigator.render();
    },

    loadDependencies: async () => {
        // 1. Current Project
        if (typeof settings !== 'undefined') {
            ShotNavigator.project = settings.currentProject || settings.getBaseProject();
        }
        
        // 2. Users & Roles
        try {
            const uData = await API.users.get();
            ShotNavigator.users = uData.users || [];
            ShotNavigator.roles = uData.roles || [];
            ShotNavigator.activeUser = uData.activeUser || (ShotNavigator.users[0]?.laspUser || 'lasp-mpastorino');
        } catch(e) {
            console.error("[ShotNav] Error loading users:", e);
        }

        // 3. Statuses
        try {
            const sData = await API.statuses.get();
            ShotNavigator.statuses = sData.statuses || [];
        } catch(e) {
            console.error("[ShotNav] Error loading statuses:", e);
        }

        // 4. Extract processes dynamically from the active project's Shot Designer preset
        await ShotNavigator.loadShotProcessesFromPreset();
    },

    loadShotProcessesFromPreset: async () => {
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

            if (presetObj) {
                ShotNavigator.shotPreset = presetObj;
                
                // Encontrar el nodo SHOT en el grafo
                if (presetObj.nodes && Array.isArray(presetObj.nodes)) {
                    const shotNode = presetObj.nodes.find(n => n.isShot || n.variableName === 'SHOT' || n.variableName === 'SHOTNAME');
                    if (shotNode) {
                        // Encontrar todos los descendientes bajo el nodo shot que sean carpetas de proceso
                        const childNodes = presetObj.nodes.filter(n => 
                            n.parent === shotNode.id || 
                            presetObj.nodes.some(p => p.parent === shotNode.id && n.parent === p.id)
                        );

                        const seen = new Set();
                        childNodes.forEach(n => {
                            if (n.name && !n.isVariable && n.type === 'folder') {
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
            }
        } catch(e) {
            console.warn("[ShotNav] Could not load Shot Designer preset processes:", e);
        }

        // Si el preset solo tiene 'compo', availableProcesses tendrá exactamente [{ id: 'compo', name: 'COMPO' }]
        if (ShotNavigator.availableProcesses.length === 0) {
            ShotNavigator.availableProcesses = [
                { id: 'compo', name: 'COMPO' }
            ];
        }
    },

    getProjectWorkflowDir: () => {
        if (!ShotNavigator.project) return 'Z:\\workflow';
        const projectWork = (ShotNavigator.project.roots?.work || 'Z:/[cliente]/[proyecto]').replace(/\//g, '\\');
        return pathJoin(projectWork, 'workflow');
    },

    loadWorkflow: async () => {
        if (!ShotNavigator.project) return;
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

        // Real-time scan of physical disk folders (strictly non-destructive)
        await ShotNavigator.discoverShotsFromDisk();
    },

    refreshWorkflow: async () => {
        await ShotNavigator.loadDependencies();
        await ShotNavigator.loadWorkflow();
        ShotNavigator.render();
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
                                            status: 'not_started',
                                            notes: '',
                                            updatedAt: new Date().toISOString()
                                        };
                                    }

                                    const sObj = ShotNavigator.trackerData.shots[shotKey];
                                    sObj.path = shotPath;
                                    if (!sObj.processes) sObj.processes = {};

                                    // 1. Escanear carpetas reales en disco dentro del plano
                                    const diskItems = await scanDir(shotPath);
                                    const existingFolders = (diskItems && diskItems.items) 
                                        ? diskItems.items.filter(i => i.isDirectory).map(i => i.name.toLowerCase().trim())
                                        : [];

                                    const sub2d = await scanDir(pathJoin(shotPath, '2d'));
                                    if (sub2d && sub2d.items) {
                                        sub2d.items.filter(i => i.isDirectory).forEach(i => existingFolders.push(i.name.toLowerCase().trim()));
                                    }
                                    const sub3d = await scanDir(pathJoin(shotPath, '3d'));
                                    if (sub3d && sub3d.items) {
                                        sub3d.items.filter(i => i.isDirectory).forEach(i => existingFolders.push(i.name.toLowerCase().trim()));
                                    }

                                    // 2. Actualizar estado de las carpetas que ya existían en el tracker
                                    for (const pId of Object.keys(sObj.processes)) {
                                        const pLower = pId.toLowerCase();
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

                                        // Si NO existe en disco, NO tiene usuarios y está 'not_started', purgar del shot
                                        if (!exists && sObj.processes[pId].assignedUsers.length === 0 && sObj.processes[pId].status === 'not_started') {
                                            delete sObj.processes[pId];
                                        }
                                    }

                                    // 3. Si en disco hay carpetas reales, agregarlas al shot como procesos activos
                                    for (const fName of existingFolders) {
                                        const normName = (fName === 'comp') ? 'compo' : fName;
                                        if (!sObj.processes[normName]) {
                                            sObj.processes[normName] = {
                                                assignedUsers: [],
                                                status: 'in_progress',
                                                folderExists: true,
                                                notes: ''
                                            };
                                        } else {
                                            sObj.processes[normName].folderExists = true;
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
        ShotNavigator.render();
    },

    toggleSelectAllFiltered: () => {
        const filtered = ShotNavigator.getFilteredShots();
        const allSelected = filtered.length > 0 && filtered.every(s => ShotNavigator.selectedShotKeys.has(s.id));
        
        if (allSelected) {
            filtered.forEach(s => ShotNavigator.selectedShotKeys.delete(s.id));
        } else {
            filtered.forEach(s => ShotNavigator.selectedShotKeys.add(s.id));
        }
        ShotNavigator.render();
    },

    // --- FILTERS & QUERY ---
    toggleOnlyMyShots: () => {
        ShotNavigator.onlyMyShots = !ShotNavigator.onlyMyShots;
        ShotNavigator.render();
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
        ShotNavigator.render();
    },

    setProcessFilter: (pr) => {
        ShotNavigator.selectedProcess = pr;
        ShotNavigator.render();
    },

    setSearchQuery: (q) => {
        ShotNavigator.searchQuery = q.toLowerCase().trim();
        ShotNavigator.render();
    },

    getFilteredShots: () => {
        const all = Object.values(ShotNavigator.trackerData.shots || {});
        return all.filter(sh => {
            // Episode filter
            if (ShotNavigator.selectedEpisode !== 'ALL' && sh.episode !== ShotNavigator.selectedEpisode) return false;
            // Scene filter
            if (ShotNavigator.selectedScene !== 'ALL' && sh.scene !== ShotNavigator.selectedScene) return false;
            // Status filter
            if (ShotNavigator.selectedStatus !== 'ALL' && sh.status !== ShotNavigator.selectedStatus) return false;
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

    // --- ASSIGNMENT & PROCESS EDITING ---
    toggleUserOnProcess: async (shotKey, processId, laspUser) => {
        const shot = ShotNavigator.trackerData.shots[shotKey];
        if (!shot) return;
        if (!shot.processes[processId]) {
            shot.processes[processId] = { assignedUsers: [], status: 'not_started', folderExists: false };
        }
        if (!Array.isArray(shot.processes[processId].assignedUsers)) {
            shot.processes[processId].assignedUsers = [];
        }

        const list = shot.processes[processId].assignedUsers;
        const idx = list.indexOf(laspUser);
        if (idx >= 0) {
            list.splice(idx, 1);
        } else {
            list.push(laspUser);
            if (shot.processes[processId].status === 'not_started') {
                shot.processes[processId].status = 'assigned';
            }
        }

        shot.updatedAt = new Date().toISOString();
        await ShotNavigator.saveTracker();
        ShotNavigator.render();
    },

    setProcessStatus: async (shotKey, processId, statusId) => {
        const shot = ShotNavigator.trackerData.shots[shotKey];
        if (!shot) return;
        if (!shot.processes[processId]) {
            shot.processes[processId] = { assignedUsers: [], status: 'not_started', folderExists: false };
        }
        shot.processes[processId].status = statusId;
        shot.updatedAt = new Date().toISOString();
        
        const procs = Object.values(shot.processes);
        if (procs.length > 0 && procs.every(p => p.status === 'approved')) {
            shot.status = 'approved';
        } else if (procs.some(p => p.status === 'retake')) {
            shot.status = 'retake';
        } else if (procs.some(p => p.status === 'in_progress')) {
            shot.status = 'in_progress';
        }
        
        await ShotNavigator.saveTracker();
        ShotNavigator.render();
    },

    addProcessToShot: async (shotKey, processId) => {
        const shot = ShotNavigator.trackerData.shots[shotKey];
        if (!shot || !processId) return;
        if (!shot.processes) shot.processes = {};
        if (!shot.processes[processId]) {
            shot.processes[processId] = {
                assignedUsers: [],
                status: 'not_started',
                folderExists: false,
                notes: ''
            };
            shot.updatedAt = new Date().toISOString();
            await ShotNavigator.saveTracker();
            ShotNavigator.render();
        }
    },

    removeProcessFromShot: async (shotKey, processId) => {
        const shot = ShotNavigator.trackerData.shots[shotKey];
        if (!shot || !shot.processes || !shot.processes[processId]) return;
        if (confirm(`¿Quitar el proceso ${processId.toUpperCase()} de este plano?`)) {
            delete shot.processes[processId];
            shot.updatedAt = new Date().toISOString();
            await ShotNavigator.saveTracker();
            ShotNavigator.render();
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
                
                <!-- Barra de Filtros Interna (Limpia con Botón Refrescar) -->
                <div style="padding:10px 16px; background:#12161f; border-bottom:1px solid #232a35; display:flex; align-items:center; gap:12px;">
                    <!-- Input de Búsqueda -->
                    <div style="position:relative; flex:1; max-width:340px;">
                        <input type="text" placeholder="🔍 Buscar por plano, episodio o usuario..." 
                               value="${ShotNavigator.searchQuery}" 
                               oninput="ShotNavigator.setSearchQuery(this.value)"
                               style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; font-size:0.82rem; outline:none;">
                    </div>

                    <!-- Filtro de Estado -->
                    <select onchange="ShotNavigator.setStatusFilter(this.value)" 
                            style="background:#1c222d; border:1px solid #2e3846; border-radius:4px; color:#ccc; font-size:0.82rem; padding:6px 10px;">
                        <option value="ALL" ${ShotNavigator.selectedStatus === 'ALL' ? 'selected' : ''}>Todos los Estados</option>
                        ${ShotNavigator.statuses.map(st => `
                            <option value="${st.id}" ${ShotNavigator.selectedStatus === st.id ? 'selected' : ''}>${st.icon} ${st.name}</option>
                        `).join('')}
                    </select>

                    <!-- Filtro de Proceso -->
                    <select onchange="ShotNavigator.setProcessFilter(this.value)" 
                            style="background:#1c222d; border:1px solid #2e3846; border-radius:4px; color:#ccc; font-size:0.82rem; padding:6px 10px;">
                        <option value="ALL" ${ShotNavigator.selectedProcess === 'ALL' ? 'selected' : ''}>Todos los Procesos</option>
                        ${ShotNavigator.availableProcesses.map(pr => `
                            <option value="${pr.id}" ${ShotNavigator.selectedProcess === pr.id ? 'selected' : ''}>🛠️ ${pr.name}</option>
                        `).join('')}
                    </select>

                    <button class="tool-btn" onclick="ShotNavigator.refreshWorkflow()" title="Refrescar estado real de procesos en disco" style="background:#1c222d; border:1px solid #2e3846; color:#4fc3f7; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; gap:4px;">
                        <span>↻ Refrescar</span>
                    </button>

                    <div style="flex:1;"></div>

                    <span style="font-size:0.78rem; color:#888; font-family:monospace;">
                        ${ShotNavigator.selectedShotKeys.size} seleccionados
                    </span>
                </div>

                <!-- Tabla de Shots con Checkboxes y Columnas Separadas -->
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

        return `
            <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.82rem;">
                <thead>
                    <tr style="border-bottom:2px solid #232a35; color:#888; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px;">
                        <th style="padding:10px 8px; width:36px; text-align:center;">
                            <input type="checkbox" ${allSelected ? 'checked' : ''} 
                                   onchange="ShotNavigator.toggleSelectAllFiltered()" 
                                   style="cursor:pointer; accent-color:var(--accent);">
                        </th>
                        <th style="padding:10px 12px;">Plano</th>
                        <th style="padding:10px 12px;">Episodio / Escena</th>
                        <th style="padding:10px 12px;">Estado</th>
                        <th style="padding:10px 12px;">Procesos</th>
                        <th style="padding:10px 12px;">Asignados</th>
                        <th style="padding:10px 8px; text-align:right;">Abrir</th>
                    </tr>
                </thead>
                <tbody>
                    ${shots.map(sh => {
                        const isSelected = ShotNavigator.selectedShotKeys.has(sh.id);
                        const isFocused = ShotNavigator.selectedShotId === sh.id;
                        const statusObj = ShotNavigator.statuses.find(s => s.id === sh.status) || { name: sh.status, color: '#666', icon: '⚪' };
                        
                        // Extract only processes that ACTUALLY exist in this shot
                        const activeProcs = [];
                        for (const [pId, pData] of Object.entries(sh.processes || {})) {
                            const matchedName = (ShotNavigator.availableProcesses.find(p => p.id === pId)?.name || pId).toUpperCase();
                            const users = pData.assignedUsers || (pData.assignedUser ? [pData.assignedUser] : []);
                            if (pData.folderExists || users.length > 0 || pData.status !== 'not_started') {
                                activeProcs.push({ id: pId, name: matchedName, ...pData, users });
                            }
                        }

                        return `
                            <tr class="shot-table-row" 
                                onclick="ShotNavigator.selectShot('${sh.id}')"
                                style="border-bottom:1px solid #1a1f29; cursor:pointer; background:${isSelected ? 'rgba(255,152,0,0.12)' : (isFocused ? 'rgba(255,255,255,0.04)' : 'transparent')}; transition:background 0.15s;">
                                
                                <td style="padding:10px 8px; text-align:center;" onclick="event.stopPropagation();">
                                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                                           onchange="ShotNavigator.toggleSelectShot('${sh.id}', event)" 
                                           style="cursor:pointer; accent-color:var(--accent);">
                                </td>

                                <td style="padding:10px 12px; font-weight:bold; color:#fff;">
                                    <span>${sh.name}</span>
                                </td>

                                <td style="padding:10px 12px; color:#aaa; font-family:monospace;">
                                    ${sh.episode} / ${sh.scene}
                                </td>

                                <td style="padding:10px 12px;">
                                    <span style="display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:bold; background:${statusObj.color}22; color:${statusObj.color}; border:1px solid ${statusObj.color}44;">
                                        <span>${statusObj.icon}</span>
                                        <span>${statusObj.name}</span>
                                    </span>
                                </td>

                                <!-- Columna: Procesos (Solo los reales/existentes) -->
                                <td style="padding:10px 12px;">
                                    <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                        ${activeProcs.length === 0 ? `<span style="color:#555; font-size:0.75rem;">(Sin procesos creados)</span>` : 
                                            activeProcs.map(ap => {
                                                const pStatus = ShotNavigator.statuses.find(s => s.id === ap.status) || { color: '#666', icon: '⚪' };
                                                return `
                                                    <span style="padding:2px 6px; border-radius:4px; font-size:0.7rem; background:#1c222d; border:1px solid ${pStatus.color}66; color:#eee; display:inline-flex; align-items:center; gap:4px;" title="${ap.name} - ${pStatus.name}">
                                                        <span style="color:${pStatus.color};">${pStatus.icon}</span>
                                                        <span>${ap.name}</span>
                                                        ${!ap.folderExists ? `<span title="Falta crear carpeta física" style="color:#f44336;">⚠️</span>` : ''}
                                                    </span>
                                                `;
                                            }).join('')}
                                    </div>
                                </td>

                                <!-- Columna: Asignados -->
                                <td style="padding:10px 12px;">
                                    ${activeProcs.filter(ap => ap.users.length > 0).length === 0 ? `<span style="color:#555; font-size:0.75rem;">(Sin asignar)</span>` : `
                                        <div style="display:flex; flex-direction:column; gap:3px;">
                                            ${activeProcs.map(ap => {
                                                if (ap.users.length === 0) return '';
                                                return `
                                                    <div style="font-size:0.72rem; display:flex; align-items:center; gap:6px; color:#bbb;">
                                                        <b style="color:var(--accent); font-size:0.68rem; width:55px; text-transform:uppercase;">${ap.name}:</b>
                                                        <div style="display:flex; flex-wrap:wrap; gap:4px;">
                                                            ${ap.users.map(u => `
                                                                <span style="background:#161d27; border:1px solid #2e3846; border-radius:3px; padding:1px 5px; color:#4fc3f7; font-family:monospace;">
                                                                    @${u.replace('lasp-', '')}
                                                                </span>
                                                            `).join('')}
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>
                                    `}
                                </td>

                                <td style="padding:10px 8px; text-align:right;">
                                    <button class="icon-btn" onclick="event.stopPropagation(); API.fs.open('${sh.path.replace(/\\/g, '\\\\')}')" title="Abrir en Explorer" style="background:transparent; border:none; color:#888; cursor:pointer;">
                                        📂
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    },

    selectShot: (shotId) => {
        ShotNavigator.selectedShotId = shotId;
        ShotNavigator.render();
    },

    renderInspector: () => {
        const shot = ShotNavigator.selectedShotId ? ShotNavigator.trackerData.shots[ShotNavigator.selectedShotId] : null;
        if (!shot) {
            return `
                <div style="padding:40px 20px; text-align:center; color:#666;">
                    <div style="font-size:2rem; margin-bottom:10px;">🔍</div>
                    <div style="font-weight:bold; color:#888;">Ningún plano seleccionado</div>
                    <p style="font-size:0.8rem; margin-top:6px;">Selecciona un plano de la tabla para ver sus procesos y asignar operadores.</p>
                </div>
            `;
        }

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

                <!-- Header de Procesos con Selector para Añadir Proceso -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-weight:bold; color:var(--accent); font-size:0.85rem;">🛠️ Procesos Asignados</span>
                </div>

                <!-- Selector para Agregar un Nuevo Proceso al Shot -->
                <div style="margin-bottom:12px;">
                    <select onchange="if(this.value) { ShotNavigator.addProcessToShot('${shot.id}', this.value); this.value=''; }"
                            style="width:100%; background:#161d27; color:#4fc3f7; border:1px dashed #4fc3f788; border-radius:4px; font-size:0.75rem; font-weight:bold; padding:6px; cursor:pointer;">
                        <option value="">+ Asignar Nuevo Proceso del Pipeline...</option>
                        ${ShotNavigator.availableProcesses.filter(p => !shotProcs.includes(p.id)).map(p => `
                            <option value="${p.id}">+ ${p.name}</option>
                        `).join('')}
                    </select>
                </div>

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
                                            <button onclick="ShotNavigator.removeProcessFromShot('${shot.id}', '${pId}')" title="Quitar proceso" style="background:transparent; border:none; color:#666; cursor:pointer; font-size:0.8rem;">&times;</button>
                                        </div>
                                    </div>

                                    <!-- Lista de Usuarios Asignados (Multi-Usuario con Tags) -->
                                    <div style="font-size:0.75rem; margin-top:6px;">
                                        <div style="color:#888; margin-bottom:4px;">Operadores Asignados:</div>
                                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;">
                                            ${assignedUsers.length === 0 ? `<span style="color:#555; font-style:italic;">(Ninguno)</span>` : 
                                                assignedUsers.map(u => `
                                                    <span style="background:#161d27; border:1px solid #2e3846; border-radius:3px; padding:2px 6px; color:#4fc3f7; display:inline-flex; align-items:center; gap:4px;">
                                                        <span>@${u.replace('lasp-', '')}</span>
                                                        <span onclick="ShotNavigator.toggleUserOnProcess('${shot.id}', '${pId}', '${u}')" style="cursor:pointer; color:#f44336; font-weight:bold;">&times;</span>
                                                    </span>
                                                `).join('')}
                                        </div>

                                        <!-- Selector para Añadir Usuario -->
                                        <select onchange="if(this.value) { ShotNavigator.toggleUserOnProcess('${shot.id}', '${pId}', this.value); this.value=''; }"
                                                style="width:100%; background:#1c222d; color:#eee; border:1px solid #2e3846; border-radius:4px; font-size:0.72rem; padding:4px;">
                                            <option value="">+ Añadir Operador...</option>
                                            ${ShotNavigator.users.filter(u => !assignedUsers.includes(u.laspUser)).map(u => `
                                                <option value="${u.laspUser}">${u.firstName} ${u.lastName} (@${u.laspUser.replace('lasp-', '')})</option>
                                            `).join('')}
                                        </select>
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
        await ShotNavigator.saveTracker();
        ShotNavigator.render();
    }
};

// Helper utils
function pathJoin(...parts) {
    return parts.join('\\').replace(/[\\\/]+/g, '\\');
}

// Global hook
window.ShotNavigator = ShotNavigator;
