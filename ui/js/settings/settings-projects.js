// --- SETTINGS PROJECTS MODULE (Projects CRUD, Presets, IA Tokens & Templates) ---
Object.assign(settings, {
    getBaseProject: () => {
        return settings.projects.find(p => p.id === 'proj_base' || p.isBase) || CANONICAL_BASE_PRESETS;
    },

    isBaseProject: (p) => {
        if (!p) return false;
        if (p.id === 'proj_base' || p.isBase === true) return true;
        if (p._sourceFile === 'base.json') return true;
        const nameClean = (p.name || '').trim().toLowerCase();
        if (nameClean === 'proyecto base' || nameClean === 'base') return true;
        return false;
    },

    loadPresets: async (force = false) => {
        if (!force && settings.presetsList && settings.presetsList.length > 0 && (Date.now() - settings._presetsLoadedAt < 60000)) {
            return settings.presetsList;
        }
        if (!force && settings._presetsLoadingPromise) {
            return settings._presetsLoadingPromise;
        }

        settings._presetsLoadingPromise = (async () => {
            const newPresets = [];
            const seenKeys = new Set();
            const localBasePath = ((typeof window !== "undefined" && window.PIPETA_LOCAL_APP_DIR) ? window.PIPETA_LOCAL_APP_DIR : "C:\\TOOLS\\APPS\\Pipeta") + "\\presets";
            const subDirs = ['AssetDesigner', 'ShotDesigner'];

            const scanBasePath = async (basePath) => {
                if (!basePath || !window.API || !API.fs || !API.fs.getFiles) return;
                await Promise.all(subDirs.map(async (sub) => {
                    const dir = basePath + "\\" + sub;
                    try {
                        const files = await API.fs.getFiles(dir);
                        const jsonFiles = (files || []).filter(f => f.endsWith('.json'));
                        await Promise.all(jsonFiles.map(async (f) => {
                            try {
                                const content = await API.fs.readFile(dir + "\\" + f);
                                if (content) {
                                    const p = JSON.parse(content);
                                    const pId = p.id || f.replace('.json', '');
                                    const pName = p.name || pId;
                                    const type = sub.includes('Asset') ? 'asset' : 'shot';
                                    const key = `${type}_${pId.toLowerCase()}`;
                                    if (!seenKeys.has(key)) {
                                        seenKeys.add(key);
                                        newPresets.push({
                                            id: pId,
                                            name: pName,
                                            type: type,
                                            fullPath: dir + "\\" + f
                                        });
                                    }
                                }
                            } catch (e) { }
                        }));
                    } catch (errDir) { }
                }));
            };

            try {
                await scanBasePath(localBasePath);
                // Solo consultar la red (Z:) si el directorio local está vacío o se pidió forzado explícito
                if ((newPresets.length === 0 || force) && settings.exportPresetsPath && settings.exportPresetsPath !== localBasePath) {
                    await scanBasePath(settings.exportPresetsPath);
                }
                if (newPresets.length > 0 || settings.presetsList.length === 0) {
                    settings.presetsList = newPresets;
                }
                settings._presetsLoadedAt = Date.now();
            } catch (e) {
                console.error("Error loading presets for settings", e);
            } finally {
                settings._presetsLoadingPromise = null;
            }
            return settings.presetsList;
        })();

        return settings._presetsLoadingPromise;
    },

    loadProjects: async () => {
        settings.projects = [];
        const loadedProjects = [];
        const filesToDelete = [];

        try {
            if (window.API && API.fs && API.fs.mkdir) {
                await API.fs.mkdir(settings.projectsPath);
            }

            const files = await API.fs.getFiles(settings.projectsPath);
            const jsonFiles = (files || []).filter(f => f.endsWith('.json'));
            await Promise.all(jsonFiles.map(async (f) => {
                const content = await API.fs.readFile(settings.projectsPath + "\\" + f);
                if (content) {
                    try {
                        const proj = JSON.parse(content);
                        if (f === 'base.json' || proj.id === 'proj_base' || proj.isBase) {
                            proj.isBase = true;
                            proj.id = 'proj_base';
                            proj.name = 'Proyecto Base';
                        }
                        proj._sourceFile = f;

                        // Auto-sanitización de rutas corruptas (ej: si estupidamente_tuyo tiene roots.work apuntando a surf_love)
                        const pNameClean = (proj.name || '').toLowerCase().trim();
                        if (proj.roots && proj.roots.work && !proj.isBase && proj.id !== 'proj_base') {
                            const normW = proj.roots.work.replace(/\\/g, '/').toLowerCase();
                            if (pNameClean && pNameClean !== 'surf_love' && normW.includes('surf_love')) {
                                console.warn(`[PROJECT SANITIZE] Corrigiendo ruta desfasada en ${proj.name}: ${proj.roots.work}`);
                                const client = proj.client || 'cliente';
                                proj.roots.work = `Z:/${client}/${proj.name}`;
                                proj.roots.media = `Z:/INTERNO/MEDIA/${client}/${proj.name}`;
                                if (proj.roots.onlineWork) proj.roots.onlineWork = `G:/Unidades compartidas/${proj.name}`;
                                if (proj.roots.onlineMedia) proj.roots.onlineMedia = `G:/Unidades compartidas/${proj.name}_media`;
                                if (window.API && API.fs && API.fs.writeFile) {
                                    API.fs.writeFile(settings.projectsPath + "\\" + f, JSON.stringify(proj, null, 2)).catch(() => {});
                                }
                            }
                        }

                        loadedProjects.push(proj);
                    } catch (e) { console.error("Error parsing proj", f, e); }
                }
            }));

            // Deduplicación inteligente:
            // "aquee" manda sobre "aqee" (typo)
            // "pride_and_prejudice" manda sobre "prpr" (nick)
            const dedupMap = new Map();

            for (const proj of loadedProjects) {
                if (proj.isBase || proj.id === 'proj_base') {
                    dedupMap.set('proj_base', proj);
                    continue;
                }

                const rawName = (proj.name || '').toLowerCase().trim();
                let matchKey = null;

                for (const [key, existing] of dedupMap.entries()) {
                    if (key === 'proj_base') continue;
                    const exName = (existing.name || '').toLowerCase().trim();

                    if (existing.id === proj.id) {
                        matchKey = key;
                        break;
                    }
                    if ((rawName === 'aqee' || rawName === 'aquee') && (exName === 'aqee' || exName === 'aquee')) {
                        matchKey = key;
                        break;
                    }
                    if ((rawName === 'prpr' || rawName === 'pride_and_prejudice') && (exName === 'prpr' || exName === 'pride_and_prejudice')) {
                        matchKey = key;
                        break;
                    }
                }

                if (!matchKey) {
                    dedupMap.set(proj.id, proj);
                } else {
                    const existing = dedupMap.get(matchKey);
                    console.warn(`[PROJECTS] Duplicado detectado entre '${existing.name}' (${existing._sourceFile}) y '${proj.name}' (${proj._sourceFile})`);

                    let winner = existing;
                    let loser = proj;

                    const exName = (existing.name || '').toLowerCase();
                    const pName = (proj.name || '').toLowerCase();

                    if (exName === 'aquee' && pName === 'aqee') {
                        winner = proj;
                        loser = existing;
                    } else if (exName === 'aqee' && pName === 'aquee') {
                        winner = existing;
                        loser = proj;
                    } else if (exName === 'prpr' && pName === 'pride_and_prejudice') {
                        winner = proj;
                        loser = existing;
                    } else if (pName === 'aqee' && exName !== 'aqee') {
                        winner = proj;
                        loser = existing;
                    } else if (pName === 'pride_and_prejudice' && exName !== 'pride_and_prejudice') {
                        winner = proj;
                        loser = existing;
                    }

                    dedupMap.set(matchKey, winner);
                    if (loser._sourceFile && loser._sourceFile !== winner._sourceFile) {
                        filesToDelete.push(loser._sourceFile);
                    }
                }
            }

            settings.projects = Array.from(dedupMap.values());

            // Eliminar archivos obsoletos/duplicados en segundo plano
            for (const staleFile of filesToDelete) {
                try {
                    console.log(`[PROJECTS] Limpiando archivo duplicado en disco: ${staleFile}`);
                    await API.fs.deleteFile(settings.projectsPath + "\\" + staleFile);
                } catch (err) {
                    console.warn(`[PROJECTS] No se pudo borrar ${staleFile}:`, err);
                }
            }

        } catch (e) {
            console.error("loadProjects error:", e);
        }

        // Asegurar que el Proyecto Base siempre exista y esté primero
        let baseProj = settings.projects.find(p => p.id === 'proj_base' || p.isBase);
        if (!baseProj) {
            baseProj = JSON.parse(JSON.stringify(CANONICAL_BASE_PRESETS));
            settings.projects.unshift(baseProj);
        } else {
            settings.projects = settings.projects.filter(p => p.id !== 'proj_base' && !p.isBase);
            settings.projects.unshift(baseProj);
        }

        if (settings.projects.length === 1) {
            // Crear surf_love como proyecto por defecto si sólo estaba Base
            const surfLove = {
                id: 'proj_surf_love',
                name: "surf_love",
                client: "atresmedia",
                projectCode: "surf_love",
                _sourceFile: "surf_love.json",
                roots: {
                    work: "Z:/atresmedia/surf_love",
                    media: "Z:/INTERNO/MEDIA/atresmedia/surf_love",
                    onlineWork: "G:/Unidades compartidas/surf_love",
                    onlineMedia: "G:/Unidades compartidas/surf_love_media"
                }
            };
            settings.projects.push(surfLove);
        }

        const savedActiveId = localStorage.getItem('pipeta_active_project_id');
        const found = settings.projects.find(p => p.id === savedActiveId && !settings.isBaseProject(p));
        settings.currentProject = found || settings.projects.find(p => !settings.isBaseProject(p)) || settings.projects[0];
        if (settings.currentProject && !settings.isBaseProject(settings.currentProject)) {
            localStorage.setItem('pipeta_active_project_id', settings.currentProject.id);
        }
        
        settings.updateHeaderProjectSelector();
    },

    saveProject: async () => {
        if (!settings.currentProject) return;
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('projects_allow_edit')) {
            console.warn("[SETTINGS] Guardado de proyectos bloqueado para este usuario.");
            return;
        }
        const isBase = settings.currentProject.id === 'proj_base' || settings.currentProject.isBase;
        const fileName = isBase ? "base.json" : (settings.currentProject.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
        const filePath = settings.projectsPath + "\\" + fileName;
        const content = JSON.stringify(settings.currentProject, null, 2);

        try {
            const result = await API.fs.writeFile(filePath, content);
            if (result && result.success) {
                console.log("Proyecto guardado:", fileName);
                // Si el nombre cambió y existía un archivo previo, borrar el viejo
                if (settings.currentProject._sourceFile && settings.currentProject._sourceFile !== fileName) {
                    try {
                        await API.fs.deleteFile(settings.projectsPath + "\\" + settings.currentProject._sourceFile);
                        console.log("Archivo previo eliminado tras renombrar:", settings.currentProject._sourceFile);
                    } catch (e) {}
                }
                settings.currentProject._sourceFile = fileName;
            } else {
                alert("Error al guardar proyecto: " + (result?.error || "Unknown"));
            }
        } catch (e) { console.error(e); }
        settings.render();
    },

    restoreBaseProjectCanon: async () => {
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('projects_allow_edit')) {
            alert("🔒 No tienes permisos para modificar el Proyecto Base.");
            return;
        }
        settings.showConfirmModal({
            title: 'Restaurar Proyecto Base',
            icon: '↺',
            message: '¿Estás seguro de que deseas restaurar el <b>Proyecto Base</b> a todos los valores canónicos oficiales de pipeline?',
            confirmText: 'Restaurar Valores',
            confirmColor: '#ff9800',
            confirmTextColor: '#000',
            onConfirm: async () => {
                const baseProj = settings.projects.find(p => p.id === 'proj_base' || p.isBase);
                if (baseProj) {
                    const restored = JSON.parse(JSON.stringify(CANONICAL_BASE_PRESETS));
                    Object.assign(baseProj, restored);
                    settings.currentProject = baseProj;
                    await settings.saveProject();
                    settings.render();
                    settings.showToast("Proyecto Base restaurado a los valores canónicos del pipeline.", "success", 4);
                }
            }
        });
    },

    newProject: async () => {
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('projects_allow_edit')) {
            alert("🔒 No tienes permisos para crear nuevos proyectos.");
            return;
        }
        const name = prompt("Nombre del nuevo proyecto:", "Nuevo Proyecto");
        if (!name) return;

        const newProj = {
            id: 'proj_' + Date.now(),
            name: name,
            client: "cliente",
            projectCode: name.substring(0, 4).toUpperCase(),
            overrideBasePresets: false,
            roots: {
                work: `Z:/cliente/${name}`,
                media: `Z:/INTERNO/MEDIA/cliente/${name}`,
                onlineWork: `G:/Unidades compartidas/${name}`,
                onlineMedia: `G:/Unidades compartidas/${name}_media`
            }
        };
        settings.projects.push(newProj);
        settings.currentProject = newProj;
        await settings.saveProject();
        settings.render();
        settings.updateHeaderProjectSelector();
    },

    deleteProject: async () => {
        if (!settings.currentProject) return;
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('projects_allow_edit')) {
            alert("🔒 No tienes permisos para eliminar proyectos.");
            return;
        }
        if (settings.currentProject.id === 'proj_base' || settings.currentProject.isBase) {
            settings.showToast("El Proyecto Base es la plantilla canónica maestra del sistema y no se puede eliminar.", "warn", 4);
            return;
        }

        settings.showConfirmModal({
            title: 'Eliminar Proyecto',
            icon: '🗑️',
            message: `¿Estás seguro de que deseas eliminar el proyecto <b>"${settings.currentProject.name}"</b>? Esta acción no se puede deshacer.`,
            confirmText: 'Eliminar Proyecto',
            confirmColor: '#f44336',
            confirmTextColor: '#fff',
            onConfirm: async () => {
                const fileName = settings.currentProject._sourceFile || (settings.currentProject.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
                const filePath = settings.projectsPath + "\\" + fileName;

                try {
                    await API.fs.deleteFile(filePath);
                    settings.projects = settings.projects.filter(p => p.id !== settings.currentProject.id);
                    settings.currentProject = settings.projects[0] || null;
                    localStorage.setItem('pipeta_active_project_id', settings.currentProject?.id || '');
                    settings.render();
                    settings.updateHeaderProjectSelector();
                    settings.showToast("Proyecto eliminado con éxito.", "success", 3);
                } catch (e) {
                    settings.showToast("Error al eliminar proyecto: " + e.message, "error", 5);
                }
            }
        });
    },

    duplicateProject: () => {
        if (!settings.currentProject) return;
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('projects_allow_edit')) {
            alert("🔒 No tienes permisos para duplicar proyectos.");
            return;
        }
        const copy = JSON.parse(JSON.stringify(settings.currentProject));
        copy.id = 'proj_' + Date.now();
        copy.isBase = false;
        copy.name += " (Copia)";
        delete copy._sourceFile;
        settings.projects.push(copy);
        settings.currentProject = copy;
        settings.render();
    },

    selectProject: (id) => {
        const proj = settings.projects.find(p => p.id === id);
        if (proj) {
            if (settings.isBaseProject(proj)) {
                if (settings.currentProject && !settings.isBaseProject(settings.currentProject)) {
                    settings._activeWorkProjectBeforeSettings = settings.currentProject;
                }
            } else {
                settings._activeWorkProjectBeforeSettings = proj;
            }
            settings.currentProject = proj;
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('system', `Proyecto activo: ${proj.name || proj.id} (Cliente: ${proj.client || '-'})`, 'info');
            }
            settings.render();
            if (!settings.isBaseProject(proj)) {
                settings.updateHeaderProjectSelector();
            }
        }
    },

    getUserAllowedProjects: (userObj = null) => {
        const user = userObj || (typeof window.getPipetaActiveUserObj === 'function' ? window.getPipetaActiveUserObj() : null);
        const allProjects = (settings.projects || []).filter(p => !settings.isBaseProject(p));
        if (!user) {
            return [];
        }
        if (user.role === 'admin' || user.username === 'admin' || user.isSystem) {
            return allProjects;
        }
        return allProjects.filter(p => typeof window.isProjectAllowedForUser === 'function' ? window.isProjectAllowedForUser(p, user) : false);
    },

    updateHeaderProjectSelector: () => {
        const select = document.getElementById('headerProjectSelect');
        if (!select) return;
        select.innerHTML = '';
        if (!settings.projects || settings.projects.length === 0) {
            select.innerHTML = '<option value="">(Sin proyectos)</option>';
            return;
        }

        // Filtrar Proyectos permitidos (Modelo Híbrido: Admin=Todo, Lead/User=Ramón + Configurados)
        const visibleProjects = settings.getUserAllowedProjects();

        if (visibleProjects.length === 0) {
            select.innerHTML = '<option value="">(Sin proyectos asignados)</option>';
            settings.currentProject = null;
            localStorage.removeItem('pipeta_active_project_id');

            const workLabel = document.getElementById('label-work-path');
            const mediaLabel = document.getElementById('label-media-path');
            if (workLabel) workLabel.innerHTML = '<span style="color:#ff6b6b; font-size:0.75rem; font-weight:bold;">🔒 Sin proyectos asignados</span>';
            if (mediaLabel) mediaLabel.innerHTML = '<span style="color:#ff6b6b; font-size:0.75rem; font-weight:bold;">🔒 Sin proyectos asignados</span>';

            const treeWork = document.getElementById('tree-work');
            const treeMedia = document.getElementById('tree-media');
            const emptyMsg = `
                <div class="empty-catalog-card" style="margin: 35px 15px; padding: 22px; background: rgba(28, 36, 48, 0.7); border: 1px dashed rgba(255, 107, 107, 0.4); border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.8rem; margin-bottom: 6px;">🔒</div>
                    <div style="font-weight: 600; color: #eceff4; font-size: 0.95rem; margin-bottom: 6px;">Sin proyectos asignados</div>
                    <div style="font-size: 0.78rem; color: #8892b0; line-height: 1.4;">
                        No tienes tareas asignadas en Ramón ni proyectos habilitados por el administrador.<br>Solicita acceso o revisa tus asignaciones en Ramón.
                    </div>
                </div>`;
            if (treeWork) treeWork.innerHTML = emptyMsg;
            if (treeMedia) treeMedia.innerHTML = emptyMsg;
            return;
        }

        // Determinar qué proyecto real de trabajo debe figurar en el selector de cabecera
        const isEditingBaseInSettings = settings.isVisible && settings.isBaseProject(settings.currentProject);
        const savedId = (typeof localStorage !== 'undefined') ? localStorage.getItem('pipeta_active_project_id') : null;
        let selectedProj = null;
        if (isEditingBaseInSettings && settings._activeWorkProjectBeforeSettings) {
            selectedProj = visibleProjects.find(p => p.id === settings._activeWorkProjectBeforeSettings.id);
        }
        if (!selectedProj && savedId) {
            selectedProj = visibleProjects.find(p => p.id === savedId || p.name === savedId);
        }
        if (!selectedProj) {
            if (settings.currentProject && visibleProjects.some(p => p.id === settings.currentProject.id)) {
                selectedProj = settings.currentProject;
            } else {
                selectedProj = visibleProjects[0];
            }
        }

        // Si NO estamos editando Proyecto Base con Settings abierto y currentProject es nulo o no permitido, posicionar en selectedProj
        if (!isEditingBaseInSettings && (!settings.currentProject || !visibleProjects.some(p => p.id === settings.currentProject.id))) {
            if (selectedProj) {
                settings.selectHeaderProject(selectedProj.id);
                return;
            }
        }

        visibleProjects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = p.name;
            if (selectedProj && selectedProj.id === p.id) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    },

    selectHeaderProject: async (id) => {
        const select = document.getElementById('headerProjectSelect');
        const spinner = document.getElementById('projectSelectSpinner');
        const proj = settings.projects.find(p => p.id === id);
        if (!proj) return;
        if (!settings.isBaseProject(proj)) settings._activeWorkProjectBeforeSettings = proj;

        // Feedback visual inmediato en cabecera y pantalla
        if (select) {
            select.disabled = true;
            select.style.opacity = '0.6';
        }
        if (spinner) spinner.style.display = 'inline-block';

        if (typeof showOverlay === 'function') {
            showOverlay(`Cargando Proyecto: ${proj.name || id}`, 'Sincronizando catálogo, explorador y dependencias...');
        } else if (typeof settings.showToast === 'function') {
            settings.showToast(`Cargando proyecto ${proj.name}...`, 'info', 3);
        }

        // Permitir repaint en el navegador para que el loading sea visible al instante
        await new Promise(r => setTimeout(r, 60));

        try {
            settings.currentProject = proj;
            localStorage.setItem('pipeta_active_project_id', id);

            // Notificar al backend del proyecto activo para hidratación SSD
            fetch('/api/system/last-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName: proj.id || proj.name || id })
            }).catch(() => {});

            if (proj.roots) {
                if (window.state) {
                    if (proj.roots.work) window.state.workPath = proj.roots.work;
                    if (proj.roots.media) window.state.mediaPath = proj.roots.media;
                }
                if (typeof ROOTS !== 'undefined') {
                    if (proj.roots.work) ROOTS.work = proj.roots.work;
                    if (proj.roots.media) ROOTS.media = proj.roots.media;
                }
            }
            settings.updateHeaderProjectSelector();

            // Limpieza exhaustiva de cachés de catálogo y árbol para cambio limpio de proyecto
            if (typeof expandedPaths !== 'undefined' && expandedPaths.clear) expandedPaths.clear();
            window.pipetaSyncCatalog = null;
            window.pipetaServerCatalog = null;
            window.pipetaSyncCatalogLookup = null;
            window.pipetaServerCatalogLookup = null;
            fetch('/api/sync/catalog/clear-cache', { method: 'POST' }).catch(() => {});

            if (typeof loadActiveProjectSyncCatalog === 'function') {
                if (window.isPipetaMode) {
                    await loadActiveProjectSyncCatalog(true);
                } else {
                    loadActiveProjectSyncCatalog(true).catch(() => {});
                }
            }

            if (typeof refreshCurrentView === 'function') {
                await refreshCurrentView(false);
            } else if (typeof initBrowser !== 'undefined') {
                await initBrowser();
            }

            if (typeof refreshIaHierarchy === 'function') refreshIaHierarchy();
            if (typeof updateIaResolution === 'function') updateIaResolution();

            if (window.ShotCreator && ShotCreator.isVisible) {
                ShotCreator.resolveContext(proj.roots?.work || "");
                if (typeof ShotCreator.autoDetectHierarchyFromContext === 'function') {
                    ShotCreator.autoDetectHierarchyFromContext().then(() => ShotCreator.render());
                } else {
                    ShotCreator.render();
                }
            }
            if (window.AssetCreator && AssetCreator.isVisible) {
                AssetCreator.resolveContext(proj.roots?.work || "");
                AssetCreator.render();
            }
            if (window.ShotNavigator) {
                ShotNavigator.project = proj;
                ShotNavigator.workflowLoaded = false;
                if (ShotNavigator.isVisible && typeof ShotNavigator.init === 'function') {
                    ShotNavigator.init(true);
                }
            }

            if (typeof settings.showToast === 'function') {
                settings.showToast(`Proyecto activo: ${proj.name}`, 'success', 2.5);
            }
        } catch (err) {
            console.error("Error al cambiar proyecto:", err);
            if (typeof settings.showToast === 'function') {
                settings.showToast(`Error al cambiar de proyecto: ${err.message}`, 'error', 4);
            }
        } finally {
            if (spinner) spinner.style.display = 'none';
            if (select) {
                select.disabled = false;
                select.style.opacity = '1';
            }
            if (typeof hideOverlay === 'function') {
                hideOverlay();
            }
        }
    },

    selectProjectSubTab: (tabId) => {
        settings.projectSubTab = tabId;
        settings.render();
    },

    addIaTokenChip: (listKey) => {
        if (!settings.currentProject) return;
        const labelMap = {
            motorsVideo: 'Motor de Video (ej: SD2, VEO3, LUMA)',
            motorsImage: 'Motor de Imagen (ej: NB2P, MJ, FLUX)',
            framings: 'Framing (ej: FLL, CRP, POV)',
            tagsA: 'Tag Nivel A (ej: start1001, end1100, ref1050)',
            tagsB: 'Tag Nivel B (ej: inp, ups, mask, clean, elem)',
            tagsC: 'Tag Nivel C (ej: i2v, t2i, i2i, t2v, v2v, m2v)'
        };
        const val = prompt(`Nuevo token para ${labelMap[listKey] || listKey}:`);
        if (!val || !val.trim()) return;
        const cleanVal = val.trim().replace(/\s+/g, '_');
        
        if (!settings.currentProject.iaPresets) settings.currentProject.iaPresets = {};
        if (!Array.isArray(settings.currentProject.iaPresets[listKey])) {
            const baseObj = settings.getBaseProject();
            settings.currentProject.iaPresets[listKey] = JSON.parse(JSON.stringify(baseObj.iaPresets?.[listKey] || []));
        }
        if (!settings.currentProject.iaPresets[listKey].includes(cleanVal)) {
            settings.currentProject.iaPresets[listKey].push(cleanVal);
            settings.render();
        }
    },

    removeIaTokenChip: (listKey, tokenVal) => {
        if (!settings.currentProject) return;
        if (!settings.currentProject.iaPresets) settings.currentProject.iaPresets = {};
        if (!Array.isArray(settings.currentProject.iaPresets[listKey])) {
            const baseObj = settings.getBaseProject();
            settings.currentProject.iaPresets[listKey] = JSON.parse(JSON.stringify(baseObj.iaPresets?.[listKey] || []));
        }
        settings.currentProject.iaPresets[listKey] = settings.currentProject.iaPresets[listKey].filter(t => t !== tokenVal);
        settings.render();
    },

    setDefaultIaToken: (defaultPropKey, tokenVal) => {
        if (!settings.currentProject) return;
        const isBase = settings.currentProject.id === 'proj_base' || settings.currentProject.isBase;
        if (isBase && !settings.devMode) return;
        if (!isBase && !settings.currentProject.overrideBasePresets) return;

        if (!settings.currentProject.iaPresets) settings.currentProject.iaPresets = {};
        settings.currentProject.iaPresets[defaultPropKey] = tokenVal;
        settings.render();
    },

    renderTokenChipList: (title, listKey, tokens, defaultPropKey, currentDefaultVal, isReadOnly = false, allowNone = false) => {
        const list = Array.isArray(tokens) ? tokens : [];
        const isNoneDefault = !currentDefaultVal || currentDefaultVal === '' || currentDefaultVal === 'none';

        return `
            <div class="config-group" style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <label class="config-label" style="margin-bottom:0; font-weight:bold; color:#ccc;">
                        ${title} (${list.length})
                        ${!isNoneDefault ? `<span style="font-size:0.75rem; color:#ff9800; font-weight:normal; margin-left:6px;">Default: <b>${escapeHtml(currentDefaultVal)}</b></span>` : (allowNone ? `<span style="font-size:0.75rem; color:#888; font-weight:normal; margin-left:6px;">Default: <i>(Ninguno)</i></span>` : '')}
                    </label>
                    ${!isReadOnly ? `<button type="button" class="ia-token-chip-add-btn" onclick="settings.addIaTokenChip('${listKey}')">+ Agregar</button>` : ''}
                </div>
                <div class="ia-token-chip-container" style="${isReadOnly ? 'opacity:0.8; background:#0d0d0d;' : ''}">
                    ${allowNone ? `
                        <span class="ia-token-chip ia-token-chip-none ${isNoneDefault ? 'is-default' : ''} ${!isReadOnly ? 'can-select-default' : ''}"
                              ${!isReadOnly ? `onclick="settings.setDefaultIaToken('${defaultPropKey}', '')" title="Clic para establecer (Ninguno) por defecto"` : ''}>
                            <span>🚫 (Ninguno)</span>
                            ${isNoneDefault ? `<span style="font-size:0.7rem; margin-left:2px; font-weight:bold;">★</span>` : ''}
                        </span>
                    ` : ''}
                    ${list.length === 0 && !allowNone ? `<span style="color:#666; font-size:0.75rem; font-style:italic;">(Lista vacía)</span>` : ''}
                    ${list.map(t => {
                        const isDef = currentDefaultVal === t;
                        return `
                            <span class="ia-token-chip ${isDef ? 'is-default' : ''} ${!isReadOnly ? 'can-select-default' : ''}"
                                  ${!isReadOnly ? `onclick="settings.setDefaultIaToken('${defaultPropKey}', '${escapeHtml(t)}')" title="Clic para establecer '${escapeHtml(t)}' como default"` : ''}>
                                <span>${escapeHtml(t)}</span>
                                ${isDef ? `<span style="font-size:0.7rem; margin-left:2px; font-weight:bold;">★</span>` : ''}
                                ${!isReadOnly ? `<span class="ia-chip-del" onclick="event.stopPropagation(); settings.removeIaTokenChip('${listKey}', '${escapeHtml(t)}')" title="Eliminar token">&times;</span>` : ''}
                            </span>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    addIaResolutionRule: () => {
        if (!settings.currentProject) return;
        if (!settings.currentProject.iaPresets) settings.currentProject.iaPresets = {};
        if (!Array.isArray(settings.currentProject.iaPresets.resolutionTranslations)) {
            const baseObj = settings.getBaseProject();
            settings.currentProject.iaPresets.resolutionTranslations = JSON.parse(JSON.stringify(baseObj.iaPresets?.resolutionTranslations || CANONICAL_RESOLUTION_RULES));
        }
        settings.currentProject.iaPresets.resolutionTranslations.push({ detected: "1920x1080", tag: "FHD" });
        settings.render();
    },

    removeIaResolutionRule: (idx) => {
        if (!settings.currentProject || !settings.currentProject.iaPresets?.resolutionTranslations) return;
        settings.currentProject.iaPresets.resolutionTranslations.splice(idx, 1);
        settings.render();
    },

    resetIaResolutionRules: () => {
        if (!settings.currentProject) return;
        if (!settings.currentProject.iaPresets) settings.currentProject.iaPresets = {};
        settings.currentProject.iaPresets.resolutionTranslations = JSON.parse(JSON.stringify(CANONICAL_RESOLUTION_RULES));
        settings.render();
    },

    updateIaResolutionRule: (idx, field, value) => {
        if (!settings.currentProject || !settings.currentProject.iaPresets?.resolutionTranslations) return;
        const rule = settings.currentProject.iaPresets.resolutionTranslations[idx];
        if (rule) {
            rule[field] = value.trim();
        }
    },

    updateProjectProp: (path, value) => {
        if (!settings.currentProject) return;
        const parts = path.split('.');
        let obj = settings.currentProject;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = value;
    },

    updateCustomTemplate: (type, processName, pathValue) => {
        if (!settings.currentProject) return;
        if (!settings.currentProject.templates) {
            settings.currentProject.templates = JSON.parse(JSON.stringify(CANONICAL_BASE_PRESETS.templates));
        }
        if (!settings.currentProject.templates.customTemplates) {
            settings.currentProject.templates.customTemplates = { shots: {}, assets: {} };
        }
        const key = type === 'asset' ? 'assets' : 'shots';
        if (!settings.currentProject.templates.customTemplates[key]) {
            settings.currentProject.templates.customTemplates[key] = {};
        }
        settings.currentProject.templates.customTemplates[key][processName] = (pathValue || '').trim();
    },

    browseReferencePath: async (type) => {
        const cp = settings.currentProject;
        const workRoot = cp?.roots?.work || 'Z:/';
        const defaultSub = type === 'asset' ? 'assets2D/templates' : 'episodios/templates';
        const initial = `${workRoot}/${defaultSub}`.replace(/\//g, '\\');

        const res = await API.system.pickFolder(initial);
        if (res && res.success && res.path) {
            let rel = res.path.replace(/\\/g, '/');
            // Try to make it relative to workRoot if inside project
            const normWork = (workRoot || '').replace(/\\/g, '/').replace(/\/+$/, '');
            if (normWork && rel.toLowerCase().startsWith(normWork.toLowerCase() + '/')) {
                rel = rel.substring(normWork.length + 1);
            }
            if (type === 'asset') {
                settings.updateProjectProp('templates.referenceAssetRoot', rel);
            } else {
                settings.updateProjectProp('templates.referenceShotRoot', rel);
            }
            settings.render();
            settings.showToast(`Ruta de referencia actualizada: ${rel}`, 'success', 3);
        }
    },

    browseTemplateFile: async (type, proc) => {
        const res = await API.system.pickFile('Z:\\', 'Archivos de Template (*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt)|*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt|Todos los archivos (*.*)|*.*');
        if (res && res.success && res.path) {
            settings.updateCustomTemplate(type, proc, res.path);
            settings.render();
            settings.showToast(`Template asignado para ${proc}: ${res.path.split('/').pop()}`, 'success', 3);
        }
    },

    uploadTemplateFile: (type, proc) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.nk,.blend,.hip,.psd,.aep,.prproj,.txt,.c4d,.mb,.ma';
        fileInput.style.display = 'none';

        fileInput.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async () => {
                const base64Data = reader.result.split(',')[1];
                settings.showToast(`Subiendo ${file.name}...`, 'warn', 2);
                try {
                    const res = await API.templates.upload({
                        type: type,
                        processName: proc,
                        filename: file.name,
                        fileData: base64Data
                    });
                    if (res && res.success) {
                        settings.updateCustomTemplate(type, proc, res.path);
                        settings.render();
                        settings.showToast(`✅ Template ${file.name} subido y guardado en Pipeta.`, 'success', 4);
                    } else {
                        settings.showToast(`Error al subir: ${res?.error || 'Desconocido'}`, 'error', 4);
                    }
                } catch(err) {
                    settings.showToast(`Error al subir template: ${err.message}`, 'error', 4);
                }
            };
            reader.readAsDataURL(file);
        };

        document.body.appendChild(fileInput);
        fileInput.click();
        setTimeout(() => fileInput.remove(), 60000);
    }
});

settings._categoryRenderers.proyecto = function () {
                const canEditProjects = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('projects_allow_edit') : true;
                const cp = settings.currentProject;
                const baseProj = settings.getBaseProject();
                const isBase = cp?.id === 'proj_base' || cp?.isBase;

                // Asegurar estructura de presets en Base
                if (isBase && cp) {
                    if (!cp.iaPresets) cp.iaPresets = {};
                    if (!Array.isArray(cp.iaPresets.motorsVideo)) cp.iaPresets.motorsVideo = CANONICAL_BASE_PRESETS.iaPresets.motorsVideo;
                    if (!Array.isArray(cp.iaPresets.motorsImage)) cp.iaPresets.motorsImage = CANONICAL_BASE_PRESETS.iaPresets.motorsImage;
                    if (!Array.isArray(cp.iaPresets.framings)) cp.iaPresets.framings = CANONICAL_BASE_PRESETS.iaPresets.framings;
                    if (!Array.isArray(cp.iaPresets.tagsA)) cp.iaPresets.tagsA = CANONICAL_BASE_PRESETS.iaPresets.tagsA;
                    if (!Array.isArray(cp.iaPresets.tagsB)) cp.iaPresets.tagsB = CANONICAL_BASE_PRESETS.iaPresets.tagsB;
                    if (!Array.isArray(cp.iaPresets.tagsC)) cp.iaPresets.tagsC = CANONICAL_BASE_PRESETS.iaPresets.tagsC;
                    if (!Array.isArray(cp.iaPresets.resolutionTranslations)) cp.iaPresets.resolutionTranslations = CANONICAL_BASE_PRESETS.iaPresets.resolutionTranslations;
                }

                // Determinar si el proyecto actual sobrescribe o hereda
                const hasOverride = isBase || cp?.overrideBasePresets === true;
                const effectiveIaPresets = hasOverride ? (cp?.iaPresets || baseProj.iaPresets) : baseProj.iaPresets;
                const effectiveShotPreset = hasOverride ? cp?.defaultShotPresetId : baseProj.defaultShotPresetId;
                const effectiveAssetPreset = hasOverride ? cp?.defaultAssetPresetId : baseProj.defaultAssetPresetId;

                const projectOptions = settings.projects.map(p => {
                    const pIsBase = p.id === 'proj_base' || p.isBase;
                    return `
                        <div class="settings-subnav-item ${settings.currentProject?.id === p.id ? 'active' : ''}" 
                             onclick="settings.selectProject('${p.id}')" style="${pIsBase ? 'border-left: 3px solid var(--accent);' : ''}">
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                ${pIsBase ? '⭐ <b>Proyecto Base</b>' : `📁 ${escapeHtml(p.name)}`}
                            </span>
                        </div>
                    `;
                }).join('');

                const activeSubTab = settings.projectSubTab || 'id_nombre';
                const subTabs = [
                    { id: 'id_nombre', label: '🏷️ ID / Nombre' },
                    { id: 'rutas', label: '🗺️ Rutas' },
                    { id: 'presets_proyecto', label: '🎬 Presets Proyecto' },
                    { id: 'presets_ia', label: '🤖 Presets IA' },
                    { id: 'templates', label: '📄 Templates (v001)' }
                ];

                const subTabsHtml = subTabs.map(t => `
                    <div class="settings-subnav-item ${activeSubTab === t.id ? 'active' : ''}"
                         onclick="settings.selectProjectSubTab('${t.id}')">
                        <span>${t.label}</span>
                    </div>
                `).join('');

                let detailContentHtml = '';
                if (!cp) {
                    detailContentHtml = `<div style="color:#666; padding:40px 20px; text-align:center;">Seleccione un proyecto para ver sus configuraciones</div>`;
                } else if (activeSubTab === 'id_nombre') {
                    detailContentHtml = `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <h4 style="margin:0; color:var(--accent); text-transform:uppercase; font-size:0.9rem;">
                                ${isBase ? 'Plantilla Base del Sistema' : 'Identificación del Proyecto'}
                            </h4>
                            ${isBase ? `
                                <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; font-weight:bold; color:${settings.devMode ? '#ff9800' : '#aaa'}; cursor:pointer; background:#1e1e1e; padding:4px 10px; border-radius:4px; border:1px solid ${settings.devMode ? '#ff9800' : '#444'};">
                                    <input type="checkbox" ${settings.devMode ? 'checked' : ''} onchange="settings.toggleDevMode(this.checked)">
                                    <span>🛠️ Dev Mode</span>
                                </label>
                            ` : ''}
                        </div>

                        ${isBase ? (
                            settings.devMode ? `
                                <div class="settings-inheritance-banner" style="border-color:#ff9800; background:rgba(255,152,0,0.1); color:#ffb74d;">
                                    <div>🛠️ <b>Dev Mode ACTIVO:</b> Puedes modificar la definición de la plantilla maestra. Se guardará localmente en C: y podrás publicarlo a red con el botón superior 'Publicar 📦'.</div>
                                </div>
                            ` : `
                                <div class="settings-inheritance-banner">
                                    <div>🛡️ <b>Plantilla Maestra Protegida:</b> Activa la casilla 'Dev Mode' arriba si deseas modificar los tokens y defaults canónicos del estudio.</div>
                                </div>
                            `
                        ) : ''}

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom:15px;">
                            <div class="config-group">
                                <label class="config-label">Nombre del Proyecto</label>
                                <input type="text" class="config-input" value="${escapeHtml(cp.name)}" 
                                       ${isBase ? 'readonly style="opacity:0.8;"' : 'onchange="settings.updateProjectProp(\'name\', this.value)"'}>
                            </div>
                            <div class="config-group">
                                <label class="config-label">ID / Código de Sistema</label>
                                <input type="text" class="config-input" value="${escapeHtml(cp.id)}" readonly style="opacity:0.5; cursor:not-allowed;">
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; background: rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid #333;">
                            <div class="config-group" style="margin-bottom:0;">
                                <label class="config-label">Cliente</label>
                                <input type="text" class="config-input" value="${escapeHtml(cp.client || '')}" 
                                       placeholder="${isBase ? '[cliente]' : 'atresmedia'}"
                                       onchange="settings.updateProjectProp('client', this.value)">
                            </div>
                            <div class="config-group" style="margin-bottom:0;">
                                <label class="config-label">Proyecto (NICK / Tag)</label>
                                <input type="text" class="config-input" value="${escapeHtml(cp.projectCode || '')}" 
                                       placeholder="${isBase ? '[NICK]' : 'surf_love'}"
                                       onchange="settings.updateProjectProp('projectCode', this.value)">
                            </div>
                        </div>
                    `;
                } else if (activeSubTab === 'rutas') {
                    detailContentHtml = `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <h4 style="margin:0; color:var(--accent); text-transform:uppercase; font-size:0.9rem;">
                                ${isBase ? 'Rutas de Ejemplo (Visuales en Base)' : 'Rutas Locales (Z:)'}
                            </h4>
                            ${isBase ? `
                                <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; font-weight:bold; color:${settings.devMode ? '#ff9800' : '#aaa'}; cursor:pointer; background:#1e1e1e; padding:4px 10px; border-radius:4px; border:1px solid ${settings.devMode ? '#ff9800' : '#444'};">
                                    <input type="checkbox" ${settings.devMode ? 'checked' : ''} onchange="settings.toggleDevMode(this.checked)">
                                    <span>🛠️ Dev Mode</span>
                                </label>
                            ` : ''}
                        </div>
                        ${isBase ? `
                            <div class="settings-inheritance-banner">
                                <div>ℹ️ Las rutas del Proyecto Base son meramente ilustrativas y sirven de referencia de estructura.</div>
                            </div>
                        ` : ''}
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom:20px;">
                            <div class="config-group" style="margin-bottom:0;">
                                <label class="config-label">Work Local (Escenas y Procesos)</label>
                                <input type="text" class="config-input" value="${escapeHtml(cp.roots?.work || '')}" 
                                       onchange="settings.updateProjectProp('roots.work', this.value)">
                            </div>
                            <div class="config-group" style="margin-bottom:0;">
                                <label class="config-label">Media Local (Renders y Material)</label>
                                <input type="text" class="config-input" value="${escapeHtml(cp.roots?.media || '')}" 
                                       onchange="settings.updateProjectProp('roots.media', this.value)">
                            </div>
                        </div>

                        <h4 style="color:#4CAF50; text-transform:uppercase; font-size:0.9rem; margin-bottom:15px; margin-top:25px; border-top:1px dashed #333; padding-top:15px;">Rutas Online (G: / Cloud)</h4>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="config-group" style="margin-bottom:0;">
                                <label class="config-label">Work Online (Cloud Work)</label>
                                <input type="text" class="config-input" value="${escapeHtml(cp.roots?.onlineWork || '')}" 
                                       onchange="settings.updateProjectProp('roots.onlineWork', this.value)">
                            </div>
                            <div class="config-group" style="margin-bottom:0;">
                                <label class="config-label">Media Online (Cloud Media)</label>
                                <input type="text" class="config-input" value="${escapeHtml(cp.roots?.onlineMedia || '')}" 
                                       onchange="settings.updateProjectProp('roots.onlineMedia', this.value)">
                            </div>
                        </div>

                        ${!isBase ? `
                            <div style="margin-top:20px; background:#12161f; border:1px solid #28303d; border-radius:6px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <div style="font-weight:bold; color:#fff; font-size:0.85rem; display:flex; align-items:center; gap:6px;">
                                        <span>⚡ Catálogo de Google Drive (Rclone)</span>
                                    </div>
                                    <div style="color:#888; font-size:0.75rem; margin-top:3px;">
                                        Escanea en vivo las unidades compartidas de Google Drive asociadas a este proyecto y guarda el índice centralizado en el servidor.
                                    </div>
                                </div>
                                <button type="button" class="btn" ${settings.isGeneratingCatalog ? 'disabled' : ''} onclick="settings.generateProjectCatalogNow('${escapeHtml(cp.name)}')" style="background:${settings.isGeneratingCatalog ? '#333' : 'var(--accent)'}; color:${settings.isGeneratingCatalog ? '#aaa' : '#000'}; font-weight:bold; font-size:0.8rem; padding:7px 16px; border:none; border-radius:4px; cursor:${settings.isGeneratingCatalog ? 'wait' : 'pointer'}; display:flex; align-items:center; gap:6px; white-space:nowrap;">
                                    ${settings.isGeneratingCatalog ? '<span class="spinner-mini" style="width:10px; height:10px;"></span> <span>Escaneando Drive (~30s)...</span>' : '<span>🔄 Actualizar Catálogo</span>'}
                                </button>
                            </div>
                        ` : ''}
                    `;
                } else if (activeSubTab === 'presets_proyecto') {
                    const isReadOnly = isBase ? !settings.devMode : !cp.overrideBasePresets;

                    detailContentHtml = `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <h4 style="margin:0; color:#ff9800; text-transform:uppercase; font-size:0.9rem;">Presets Naming & Pipeline</h4>
                            ${isBase ? `
                                <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; font-weight:bold; color:${settings.devMode ? '#ff9800' : '#aaa'}; cursor:pointer; background:#1e1e1e; padding:4px 10px; border-radius:4px; border:1px solid ${settings.devMode ? '#ff9800' : '#444'};">
                                    <input type="checkbox" ${settings.devMode ? 'checked' : ''} onchange="settings.toggleDevMode(this.checked)">
                                    <span>🛠️ Dev Mode</span>
                                </label>
                            ` : `
                                <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; color:#eee; cursor:pointer;">
                                    <input type="checkbox" ${cp.overrideBasePresets ? 'checked' : ''} 
                                           onchange="settings.updateProjectProp('overrideBasePresets', this.checked); settings.render();">
                                    <span>Sobrescribir presets (Override Base)</span>
                                </label>
                            `}
                        </div>

                        ${isBase ? (
                            settings.devMode ? `
                                <div class="settings-inheritance-banner" style="border-color:#ff9800; background:rgba(255,152,0,0.1); color:#ffb74d;">
                                    <div>🛠️ <b>Dev Mode ACTIVO:</b> Editando presets Shot y Asset canónicos de la plantilla maestra.</div>
                                </div>
                            ` : `
                                <div class="settings-inheritance-banner">
                                    <div>🛡️ <b>Plantilla Maestra Protegida:</b> Presets por defecto para nuevos proyectos. Activa 'Dev Mode' para modificarlos.</div>
                                </div>
                            `
                        ) : (!cp.overrideBasePresets ? `
                            <div class="settings-inheritance-banner">
                                <div>🔗 <b>Heredando del Proyecto Base:</b> Los presets Shot y Asset se toman automáticamente de la plantilla maestra. Marca la casilla de arriba si deseas personalizar este proyecto.</div>
                            </div>
                        ` : '')}

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; ${isReadOnly ? 'opacity:0.6; pointer-events:none;' : ''}">
                            <div class="config-group">
                                <label class="config-label">Preset Shot por Defecto</label>
                                <select class="config-input" onchange="settings.updateProjectProp('defaultShotPresetId', this.value)">
                                    <option value="">-- Ninguno (Manual) --</option>
                                    ${settings.presetsList.filter(p => p.type === 'shot').map(p => `
                                        <option value="${p.id}" ${effectiveShotPreset === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="config-group">
                                <label class="config-label">Preset Asset por Defecto</label>
                                <select class="config-input" onchange="settings.updateProjectProp('defaultAssetPresetId', this.value)">
                                    <option value="">-- Ninguno (Manual) --</option>
                                    ${settings.presetsList.filter(p => p.type === 'asset').map(p => `
                                        <option value="${p.id}" ${effectiveAssetPreset === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                    `;
                } else if (activeSubTab === 'presets_ia') {
                    const isReadOnly = isBase ? !settings.devMode : !cp.overrideBasePresets;
                    const motorsVideo = Array.isArray(effectiveIaPresets?.motorsVideo) ? effectiveIaPresets.motorsVideo : CANONICAL_BASE_PRESETS.iaPresets.motorsVideo;
                    const motorsImage = Array.isArray(effectiveIaPresets?.motorsImage) ? effectiveIaPresets.motorsImage : CANONICAL_BASE_PRESETS.iaPresets.motorsImage;
                    const framings = effectiveIaPresets?.framings || CANONICAL_BASE_PRESETS.iaPresets.framings;
                    const tagsA = effectiveIaPresets?.tagsA || CANONICAL_BASE_PRESETS.iaPresets.tagsA;
                    const tagsB = effectiveIaPresets?.tagsB || CANONICAL_BASE_PRESETS.iaPresets.tagsB;
                    const tagsC = effectiveIaPresets?.tagsC || CANONICAL_BASE_PRESETS.iaPresets.tagsC;
                    const rules = effectiveIaPresets?.resolutionTranslations || CANONICAL_BASE_PRESETS.iaPresets.resolutionTranslations;

                    const defVideoMotor = effectiveIaPresets?.defaultVideoEngine || 'SD2';
                    const defImageMotor = effectiveIaPresets?.defaultImageEngine || 'NB2P';
                    const defFraming = effectiveIaPresets?.defaultFraming || 'FLL';
                    const defTagA = (typeof effectiveIaPresets?.defaultTagRoleA !== 'undefined') ? effectiveIaPresets.defaultTagRoleA : 'start1001';
                    const defTagB = (typeof effectiveIaPresets?.defaultTagRoleB !== 'undefined') ? effectiveIaPresets.defaultTagRoleB : 'inp';
                    const defTagC = (typeof effectiveIaPresets?.defaultTagRoleC !== 'undefined') ? effectiveIaPresets.defaultTagRoleC : 'i2v';

                    detailContentHtml = `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <div>
                                <h4 style="margin:0; color:var(--accent); text-transform:uppercase; font-size:0.9rem;">
                                    ${isBase ? 'Contenedor y Editor Maestro de Presets IA' : 'Presets de IA del Proyecto'}
                                </h4>
                                <span style="font-size:0.75rem; color:#888;">Listas de tokens, motores permitidos y reglas de traducción de resoluciones</span>
                            </div>
                            ${isBase ? `
                                <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; font-weight:bold; color:${settings.devMode ? '#ff9800' : '#aaa'}; cursor:pointer; background:#1e1e1e; padding:4px 10px; border-radius:4px; border:1px solid ${settings.devMode ? '#ff9800' : '#444'};">
                                    <input type="checkbox" ${settings.devMode ? 'checked' : ''} onchange="settings.toggleDevMode(this.checked)">
                                    <span>🛠️ Dev Mode</span>
                                </label>
                            ` : `
                                <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; color:#eee; cursor:pointer;">
                                    <input type="checkbox" ${cp.overrideBasePresets ? 'checked' : ''} 
                                           onchange="settings.updateProjectProp('overrideBasePresets', this.checked); settings.render();">
                                    <span>Sobrescribir presets (Override Base)</span>
                                </label>
                            `}
                        </div>

                        ${isBase ? (
                            settings.devMode ? `
                                <div class="settings-inheritance-banner" style="border-color:#ff9800; background:rgba(255,152,0,0.1); color:#ffb74d;">
                                    <div>🛠️ <b>Dev Mode ACTIVO:</b> Puedes agregar, modificar y eliminar tokens de la plantilla maestra. Se guardarán en C: y podrás exportarlos a red mediante el botón superior 'Publicar 📦'.</div>
                                </div>
                            ` : `
                                <div class="settings-inheritance-banner">
                                    <div>🛡️ <b>Plantilla Maestra Protegida:</b> Los tokens y reglas canónicas están en modo inspección. Activa 'Dev Mode' arriba para modificarlos.</div>
                                </div>
                            `
                        ) : (isReadOnly ? `
                            <div class="settings-inheritance-banner">
                                <div>🔗 <b>Heredando del Proyecto Base:</b> Todos los motores, tags y reglas de resolución provienen de la plantilla maestra. Marca la casilla de arriba si deseas personalizar este proyecto.</div>
                            </div>
                        ` : '')}

                        <!-- TIP INTERACTIVO DE SELECCIÓN -->
                        <div style="font-size:0.75rem; color:#ffa726; background:rgba(255,152,0,0.1); border-left:3px solid #ff9800; padding:8px 12px; border-radius:4px; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
                            <span style="font-size:1rem;">💡</span>
                            <div><b>Tip:</b> Haz clic sobre cualquier token para establecerlo como valor por defecto (se destacará en naranja). En Tags puedes elegir <i>🚫 (Ninguno)</i> para omitir ese nivel al ingestar.</div>
                        </div>

                        <!-- EDITORES DE CHIPS DE TOKENS CON SELECCIÓN DE DEFAULT -->
                        <div class="${isReadOnly ? 'settings-locked-panel' : ''}" style="background:rgba(255,255,255,0.02); border:1px solid #333; border-radius:6px; padding:12px; margin-bottom:15px;">
                            <div style="font-weight:bold; font-size:0.82rem; color:var(--accent); margin-bottom:10px; text-transform:uppercase;">
                                📦 Listas de Tokens y Valores Predeterminados
                            </div>
                            
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom:6px;">
                                ${settings.renderTokenChipList('🎬 Motores de Video', 'motorsVideo', motorsVideo, 'defaultVideoEngine', defVideoMotor, isReadOnly, false)}
                                ${settings.renderTokenChipList('🖼️ Motores de Imagen', 'motorsImage', motorsImage, 'defaultImageEngine', defImageMotor, isReadOnly, false)}
                            </div>

                            ${settings.renderTokenChipList('📐 Framings Disponibles', 'framings', framings, 'defaultFraming', defFraming, isReadOnly, false)}
                            
                            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top:5px;">
                                ${settings.renderTokenChipList('Tags Nivel A (Refs)', 'tagsA', tagsA, 'defaultTagRoleA', defTagA, isReadOnly, true)}
                                ${settings.renderTokenChipList('Tags Nivel B (Compo)', 'tagsB', tagsB, 'defaultTagRoleB', defTagB, isReadOnly, true)}
                                ${settings.renderTokenChipList('Tags Nivel C (Proceso)', 'tagsC', tagsC, 'defaultTagRoleC', defTagC, isReadOnly, true)}
                            </div>
                        </div>

                        <!-- TABLA DE TRADUCCIÓN DE RESOLUCIONES -->
                        <div class="${isReadOnly ? 'settings-locked-panel' : ''}" style="margin-top:15px; border-top:1px dashed #333; padding-top:12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <div>
                                    <h4 style="margin:0; color:#4fc3f7; font-size:0.85rem; text-transform:uppercase;">Tabla de Traducción de Resoluciones</h4>
                                    <span style="font-size:0.75rem; color:#888;">Asigna el token canónico según las dimensiones detectadas en los archivos</span>
                                </div>
                                ${!isReadOnly ? `
                                    <div style="display:flex; gap:6px;">
                                        <button class="btn" onclick="settings.addIaResolutionRule()" style="font-size:0.75rem; padding:4px 10px; background:var(--accent); color:black; font-weight:bold;">+ Agregar</button>
                                        <button class="btn" onclick="settings.resetIaResolutionRules()" style="font-size:0.75rem; padding:4px 8px; background:#333; color:#ccc;">↺ Reset Canon</button>
                                    </div>
                                ` : ''}
                            </div>

                            <div style="max-height:180px; overflow-y:auto; border:1px solid #333; border-radius:6px; background:#141414;">
                                <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:left;">
                                    <thead>
                                        <tr style="background:#1e1e1e; border-bottom:1px solid #333; color:#aaa;">
                                            <th style="padding:6px 10px;">Resolución Detectada</th>
                                            <th style="padding:6px 10px;">Tag Canónico / Traducción</th>
                                            ${!isReadOnly ? `<th style="padding:6px 10px; width:40px; text-align:center;">Acción</th>` : ''}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${rules.map((rule, idx) => `
                                            <tr style="border-bottom:1px solid #222;">
                                                <td style="padding:4px 10px;">
                                                    <input type="text" class="config-input" style="padding:4px 8px; font-size:0.8rem; font-family:monospace;" 
                                                           value="${escapeHtml(rule.detected)}" 
                                                           ${isReadOnly ? 'readonly' : `onchange="settings.updateIaResolutionRule(${idx}, 'detected', this.value)"`}>
                                                </td>
                                                <td style="padding:4px 10px;">
                                                    <input type="text" class="config-input" style="padding:4px 8px; font-size:0.8rem; font-weight:bold; color:var(--accent);" 
                                                           value="${escapeHtml(rule.tag)}" 
                                                           ${isReadOnly ? 'readonly' : `onchange="settings.updateIaResolutionRule(${idx}, 'tag', this.value)"`}>
                                                </td>
                                                ${!isReadOnly ? `
                                                    <td style="padding:4px 10px; text-align:center;">
                                                        <button onclick="settings.removeIaResolutionRule(${idx})" style="background:transparent; border:none; color:#f44336; cursor:pointer; font-size:0.9rem;" title="Eliminar regla">&times;</button>
                                                    </td>
                                                ` : ''}
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                } else if (activeSubTab === 'templates') {
                    const isReadOnly = isBase ? !settings.devMode : !cp.overrideBasePresets;
                    if (!cp.templates) {
                        cp.templates = JSON.parse(JSON.stringify(CANONICAL_BASE_PRESETS.templates));
                    }
                    if (!cp.templates.customTemplates) cp.templates.customTemplates = { shots: {}, assets: {} };
                    if (!cp.templates.customTemplates.shots) cp.templates.customTemplates.shots = {};
                    if (!cp.templates.customTemplates.assets) cp.templates.customTemplates.assets = {};

                    const refShotRoot = cp.templates.referenceShotRoot || 'episodios/templates';
                    const refAssetRoot = cp.templates.referenceAssetRoot || 'assets2D/templates';

                    const defaultShotProcesses = ['compo', 'clean', 'ia_prep', '3d', 'matchmove', 'roto', 'grade'];
                    const defaultAssetProcesses = ['model', 'texture', 'rig', 'lookdev', 'concepts', 'export'];

                    detailContentHtml = `
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <div>
                                <h4 style="margin:0; color:var(--accent); text-transform:uppercase; font-size:0.9rem;">
                                    ${isBase ? 'Configuración Maestra de Templates (v001)' : 'Templates y Referencias (v001) del Proyecto'}
                                </h4>
                                <span style="font-size:0.75rem; color:#888;">Define las fuentes de clonación para crear archivos de trabajo iniciales (v001) en Shot y Asset Creator</span>
                            </div>
                            ${isBase ? `
                                <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; font-weight:bold; color:${settings.devMode ? '#ff9800' : '#aaa'}; cursor:pointer; background:#1e1e1e; padding:4px 10px; border-radius:4px; border:1px solid ${settings.devMode ? '#ff9800' : '#444'};">
                                    <input type="checkbox" ${settings.devMode ? 'checked' : ''} onchange="settings.toggleDevMode(this.checked)">
                                    <span>🛠️ Dev Mode</span>
                                </label>
                            ` : `
                                <label style="display:flex; align-items:center; gap:8px; font-size:0.82rem; color:#eee; cursor:pointer;">
                                    <input type="checkbox" ${cp.overrideBasePresets ? 'checked' : ''} 
                                           onchange="settings.updateProjectProp('overrideBasePresets', this.checked); settings.render();">
                                    <span>Sobrescribir templates (Override Base)</span>
                                </label>
                            `}
                        </div>

                        ${isBase ? (
                            settings.devMode ? `
                                <div class="settings-inheritance-banner" style="border-color:#ff9800; background:rgba(255,152,0,0.1); color:#ffb74d;">
                                    <div>🛠️ <b>Dev Mode ACTIVO:</b> Editando rutas y templates por defecto de la plantilla maestra.</div>
                                </div>
                            ` : `
                                <div class="settings-inheritance-banner">
                                    <div>🛡️ <b>Plantilla Maestra Protegida:</b> Valores por defecto para nuevos proyectos. Activa 'Dev Mode' para modificarlos.</div>
                                </div>
                            `
                        ) : (!cp.overrideBasePresets ? `
                            <div class="settings-inheritance-banner">
                                <div>🔗 <b>Heredando del Proyecto Base:</b> Las rutas de templates de referencia y personalizados se toman de la plantilla maestra. Marca 'Sobrescribir' para personalizar este proyecto.</div>
                            </div>
                        ` : '')}

                        <div style="${isReadOnly ? 'opacity:0.6; pointer-events:none;' : ''}">
                            <!-- SECCIÓN 1: REFERENCE ROOTS -->
                            <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                                <div style="font-weight:bold; color:var(--accent); font-size:0.92rem; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                                    <span>⭐ Rutas de Referencia ("Reference Roots")</span>
                                </div>
                                <p style="color:#aaa; font-size:0.8rem; margin-top:0; margin-bottom:14px; line-height:1.4;">
                                    Pipeta inspeccionará estas ubicaciones dentro del proyecto y utilizará el archivo guardado con la <b>última versión</b> (o v001) para clonarlo automáticamente con la nomenclatura del nuevo plano o asset.
                                </p>

                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                                    <div class="config-group" style="margin-bottom:0;">
                                        <label class="config-label">🎬 Shot Reference Episode / Root</label>
                                        <div style="display:flex; gap:6px;">
                                            <input type="text" class="config-input" value="${escapeHtml(refShotRoot)}" 
                                                   placeholder="episodios/templates"
                                                   onchange="settings.updateProjectProp('templates.referenceShotRoot', this.value)" style="flex:1; font-family:monospace; font-size:0.82rem;">
                                            <button class="btn" onclick="settings.browseReferencePath('shot')" title="Examinar carpeta" style="background:#282828; border:1px solid #444; color:#fff; padding:4px 10px; cursor:pointer;">📁</button>
                                        </div>
                                        <span style="font-size:0.72rem; color:#777; margin-top:4px; display:block;">Ej: <code>episodios/templates</code></span>
                                    </div>

                                    <div class="config-group" style="margin-bottom:0;">
                                        <label class="config-label">🎨 Asset Reference Root</label>
                                        <div style="display:flex; gap:6px;">
                                            <input type="text" class="config-input" value="${escapeHtml(refAssetRoot)}" 
                                                   placeholder="assets2D/templates"
                                                   onchange="settings.updateProjectProp('templates.referenceAssetRoot', this.value)" style="flex:1; font-family:monospace; font-size:0.82rem;">
                                            <button class="btn" onclick="settings.browseReferencePath('asset')" title="Examinar carpeta" style="background:#282828; border:1px solid #444; color:#fff; padding:4px 10px; cursor:pointer;">📁</button>
                                        </div>
                                        <span style="font-size:0.72rem; color:#777; margin-top:4px; display:block;">Ej: <code>assets2D/templates</code> o <code>assets3D/templates</code></span>
                                    </div>
                                </div>
                            </div>

                            <!-- SECCIÓN 2: CUSTOM TEMPLATES POR PROCESO (SHOTS) -->
                            <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                                <div style="font-weight:bold; color:#4fc3f7; font-size:0.92rem; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                                    <span>🛠️ Custom Templates para Shots (por Proceso)</span>
                                </div>
                                <p style="color:#aaa; font-size:0.8rem; margin-top:0; margin-bottom:12px;">
                                    Asigna un archivo template específico (<code>.nk</code>, <code>.blend</code>, <code>.hip</code>, <code>.psd</code>, etc.) a cada proceso de Shot:
                                </p>

                                <div style="display:flex; flex-direction:column; gap:8px;">
                                    ${defaultShotProcesses.map(proc => {
                                        const val = cp.templates?.customTemplates?.shots?.[proc] || '';
                                        return `
                                            <div style="display:flex; align-items:center; gap:10px; background:#181c24; border:1px solid #28303d; border-radius:6px; padding:6px 10px;">
                                                <span style="font-weight:bold; color:var(--accent); width:100px; text-transform:uppercase; font-size:0.78rem; font-family:monospace;">${proc}</span>
                                                <input type="text" class="config-input" value="${escapeHtml(val)}" 
                                                       placeholder="Sin template asignado (vacío)"
                                                       onchange="settings.updateCustomTemplate('shot', '${proc}', this.value)" 
                                                       style="flex:1; font-family:monospace; font-size:0.8rem; padding:4px 8px; background:#12151c;">
                                                <button class="btn" onclick="settings.browseTemplateFile('shot', '${proc}')" title="Examinar archivo en disco..." 
                                                        style="background:#263238; border:1px solid #37474f; color:#fff; padding:4px 10px; font-size:0.78rem; cursor:pointer; display:flex; align-items:center; gap:4px;">
                                                    <span>📁 Examinar</span>
                                                </button>
                                                <button class="btn" onclick="settings.uploadTemplateFile('shot', '${proc}')" title="Subir archivo a presets de Pipeta..." 
                                                        style="background:#1b5e20; border:1px solid #2e7d32; color:#fff; padding:4px 10px; font-size:0.78rem; cursor:pointer; display:flex; align-items:center; gap:4px;">
                                                    <span>⬆️ Subir</span>
                                                </button>
                                                ${val ? `
                                                    <button class="btn" onclick="settings.updateCustomTemplate('shot', '${proc}', ''); settings.render();" title="Limpiar template" 
                                                            style="background:#b71c1c; border:none; color:#fff; padding:4px 8px; font-size:0.78rem; cursor:pointer;">✕</button>
                                                ` : ''}
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>

                            <!-- SECCIÓN 3: CUSTOM TEMPLATES POR PROCESO (ASSETS) -->
                            <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:8px; border:1px solid #333;">
                                <div style="font-weight:bold; color:#ffb74d; font-size:0.92rem; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                                    <span>🛠️ Custom Templates para Assets (por Proceso)</span>
                                </div>
                                <p style="color:#aaa; font-size:0.8rem; margin-top:0; margin-bottom:12px;">
                                    Asigna un archivo template específico para cada proceso de Asset:
                                </p>

                                <div style="display:flex; flex-direction:column; gap:8px;">
                                    ${defaultAssetProcesses.map(proc => {
                                        const val = cp.templates?.customTemplates?.assets?.[proc] || '';
                                        return `
                                            <div style="display:flex; align-items:center; gap:10px; background:#181c24; border:1px solid #28303d; border-radius:6px; padding:6px 10px;">
                                                <span style="font-weight:bold; color:#ff9800; width:100px; text-transform:uppercase; font-size:0.78rem; font-family:monospace;">${proc}</span>
                                                <input type="text" class="config-input" value="${escapeHtml(val)}" 
                                                       placeholder="Sin template asignado (vacío)"
                                                       onchange="settings.updateCustomTemplate('asset', '${proc}', this.value)" 
                                                       style="flex:1; font-family:monospace; font-size:0.8rem; padding:4px 8px; background:#12151c;">
                                                <button class="btn" onclick="settings.browseTemplateFile('asset', '${proc}')" title="Examinar archivo en disco..." 
                                                        style="background:#263238; border:1px solid #37474f; color:#fff; padding:4px 10px; font-size:0.78rem; cursor:pointer; display:flex; align-items:center; gap:4px;">
                                                    <span>📁 Examinar</span>
                                                </button>
                                                <button class="btn" onclick="settings.uploadTemplateFile('asset', '${proc}')" title="Subir archivo a presets de Pipeta..." 
                                                        style="background:#1b5e20; border:1px solid #2e7d32; color:#fff; padding:4px 10px; font-size:0.78rem; cursor:pointer; display:flex; align-items:center; gap:4px;">
                                                    <span>⬆️ Subir</span>
                                                </button>
                                                ${val ? `
                                                    <button class="btn" onclick="settings.updateCustomTemplate('asset', '${proc}', ''); settings.render();" title="Limpiar template" 
                                                            style="background:#b71c1c; border:none; color:#fff; padding:4px 8px; font-size:0.78rem; cursor:pointer;">✕</button>
                                                ` : ''}
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    `;
                }

                if (!canEditProjects && cp) {
                    detailContentHtml = `
                        <div style="background:rgba(255,152,0,0.08); border:1px solid rgba(255,152,0,0.3); border-radius:6px; padding:10px 14px; margin-bottom:12px; color:#ffb74d; font-size:0.8rem; display:flex; align-items:center; gap:8px;">
                            <span>🔒</span>
                            <span><b>Modo Solo Lectura:</b> La modificación de proyectos está bloqueada para tu usuario.</span>
                        </div>
                        <div style="pointer-events:none; opacity:0.75; user-select:none;">
                            ${detailContentHtml}
                        </div>
                    `;
                }

                return `
                    <div style="display:grid; grid-template-columns: 210px 170px 1fr; gap:15px; height:100%; min-height:480px;">
                        <!-- Columna 1: Listado de Proyectos -->
                        <div style="border-right: 1px solid #333; padding-right:12px; display:flex; flex-direction:column;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <h4 style="margin:0; font-size:0.85rem; color:#aaa; text-transform:uppercase;">Proyectos (${settings.projects.length})</h4>
                                ${canEditProjects ? '<button class="btn" onclick="settings.newProject()" title="Nuevo Proyecto" style="padding:2px 8px; font-size:0.8rem; background:var(--accent); color:black; font-weight:bold;">+</button>' : ''}
                            </div>
                            <div style="flex:1; overflow-y:auto; padding-right:4px;">
                                ${projectOptions}
                            </div>
                        </div>

                        <!-- Columna 2: Sub-menú de Secciones -->
                        <div style="border-right: 1px solid #333; padding-right:12px; display:flex; flex-direction:column;">
                            <h4 style="margin:0 0 10px 0; font-size:0.85rem; color:#aaa; text-transform:uppercase;">Sección</h4>
                            <div style="flex:1; overflow-y:auto;">
                                ${subTabsHtml}
                            </div>
                        </div>
                        
                        <!-- Columna 3: Panel de Detalle y Acciones -->
                        <div style="display:flex; flex-direction:column; overflow-y:auto; padding-right:5px;">
                            <div style="flex:1; overflow-y:auto;">
                                ${detailContentHtml}
                            </div>

                            ${cp ? `
                                <div style="display:flex; gap:10px; margin-top:20px; border-top:1px solid #333; padding-top:15px;">
                                    ${!canEditProjects ? `
                                        <div style="flex:1; padding:8px 12px; background:rgba(255,152,0,0.06); border:1px solid rgba(255,152,0,0.25); border-radius:4px; color:#ffb74d; font-size:0.8rem; text-align:center;">
                                            🔒 Edición y gestión de proyectos bloqueada por permisos de tu usuario.
                                        </div>
                                    ` : (isBase ? `
                                        <button class="btn" onclick="settings.restoreBaseProjectCanon()" style="flex:1; background:#2a2a2a; border:1px solid var(--accent); color:var(--accent); font-weight:bold; padding:8px; border-radius:4px; cursor:pointer;">↺ Restaurar Proyecto Base a Canon Oficial</button>
                                    ` : `
                                        <button class="btn" onclick="settings.duplicateProject()" style="flex:1; background:#2a2a2a; color:#eee; border:1px solid #444; padding:8px; border-radius:4px; cursor:pointer;">Duplicar Proyecto</button>
                                        <button class="btn" style="flex:1; background:rgba(244,67,54,0.1); border:1px solid #f44336; color:#f44336; padding:8px; border-radius:4px; cursor:pointer;" onclick="settings.deleteProject()">Eliminar Proyecto</button>
                                    `)}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
};
