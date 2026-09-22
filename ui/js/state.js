// --- COMMON UI STATE & EXPLORER FILTERS ---
window.pipetaUseFilter = false;
window.pipetaFilterList = ['Episodios', 'assets', 'Assets', 'guiones', 'Guiones'];
window.explorerOnlyMyTasks = false;
window.explorerSearchQuery = '';
window.viewLocationMode = 'local'; // 'local', 'drive' or 'server'

// Helper universal para determinar si una tarea de Ramón corresponde al proyecto activo de Pipeta
window.isRamonTaskInCurrentProject = function(task, specificProj = null) {
    if (!task) return false;
    const tProj = (task.project || '').toLowerCase().trim();
    if (!tProj) return true; // Si la tarea no tiene proyecto especificado, permitirla

    const candidates = [];
    if (specificProj) {
        if (typeof specificProj === 'string') {
            candidates.push(specificProj);
        } else if (typeof specificProj === 'object') {
            candidates.push(specificProj.name, specificProj.projectCode, specificProj.code, specificProj.id);
        }
    } else if (typeof settings !== 'undefined' && settings.currentProject) {
        const p = settings.currentProject;
        candidates.push(p.name, p.projectCode, p.code, p.id);
        if (p.roots?.work) {
            const lastPart = p.roots.work.replace(/\\/g, '/').split('/').filter(Boolean).pop();
            if (lastPart) candidates.push(lastPart);
        }
        if (p.roots?.media) {
            const lastPart = p.roots.media.replace(/\\/g, '/').split('/').filter(Boolean).pop();
            if (lastPart) candidates.push(lastPart);
        }
    } else {
        return true;
    }

    const tProjNorm = tProj.replace(/[^a-z0-9]/g, '');

    for (const rawCandidate of candidates) {
        if (!rawCandidate) continue;
        const c = String(rawCandidate).toLowerCase().trim();
        const cNorm = c.replace(/[^a-z0-9]/g, '');
        if (!cNorm) continue;

        // Coincidencia exacta directa o normalizada
        if (tProj === c || tProjNorm === cNorm) return true;

        // Si empieza con prefijo 'proj_', comparar sin prefijo
        const cClean = cNorm.replace(/^proj/, '');
        if (cClean && (tProjNorm === cClean || tProj === cClean)) return true;

        // Contención o prefijos si tienen suficiente longitud (ej: 'surf' y 'surf_love', 'prpr' y 'pride_and_prejudice')
        if (cClean.length >= 3 && tProjNorm.length >= 3) {
            if (tProjNorm.startsWith(cClean) || cClean.startsWith(tProjNorm)) return true;
            if (tProjNorm.includes(cClean) || cClean.includes(tProjNorm)) return true;
        }
    }

    return false;
};

// Devuelve un Set con los nombres y códigos de planos/assets asignados al usuario en el proyecto actual
window.getExplorerAssignedTaskNames = function() {
    let tasks = (typeof Ramon !== 'undefined' && Array.isArray(Ramon.tasks)) ? Ramon.tasks : [];

    // Si aún no se han cargado en Ramon.tasks en memoria pero hay sesión activa, leer de sessionStorage
    if (tasks.length === 0 && typeof Ramon !== 'undefined' && Ramon.session?.user) {
        const uLogin = Ramon.session.user.login || Ramon.session.user.username;
        if (uLogin) {
            try {
                const cacheRaw = sessionStorage.getItem(`pipeta_ramon_tasks_${uLogin.toLowerCase()}`);
                if (cacheRaw) {
                    const parsed = JSON.parse(cacheRaw);
                    if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
                        Ramon.tasks = parsed.tasks;
                        tasks = Ramon.tasks;
                    }
                }
            } catch(e) {}
        }
    }

    const assigned = new Set();

    for (const t of tasks) {
        const matchesProject = typeof window.isRamonTaskInCurrentProject === 'function'
            ? window.isRamonTaskInCurrentProject(t)
            : true;

        if (matchesProject) {
            if (t.name) assigned.add(t.name.toLowerCase().trim());
            if (t.code) assigned.add(t.code.toLowerCase().trim());
            if (t.search_code) assigned.add(t.search_code.toLowerCase().trim());
            if (t.item_code) assigned.add(t.item_code.toLowerCase().trim());
            if (t.shot_code) assigned.add(t.shot_code.toLowerCase().trim());
            if (t.asset_code) assigned.add(t.asset_code.toLowerCase().trim());
        }
    }
    return assigned;
};

// Filtro unificado para Split View y Miller Columns
window.filterExplorerItems = function(items, containerId, dirPath, allDiskItems) {
    if (!Array.isArray(items)) return [];
    let result = items;

    // 1. Project Filter (window.pipetaUseFilter)
    if (window.pipetaUseFilter && (containerId === 'tree-work' || containerId === 'pipeta-project-container')) {
        const roots = (typeof getCurrentRoots === 'function') ? getCurrentRoots() : null;
        const normDir = (dirPath || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        const normWorkRoot = (roots?.work || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

        const isRoot = !normDir || normDir === normWorkRoot || normDir === '' || normDir.endsWith('/work');
        if (isRoot) {
            const filterList = window.pipetaFilterList || ['Episodios', 'assets', 'Assets', 'guiones', 'Guiones'];
            result = result.filter(i => {
                return filterList.some(w => i.name.toLowerCase() === w.toLowerCase());
            });
        }
    }

    // 2. My Tasks Filter (window.explorerOnlyMyTasks)
    if (window.explorerOnlyMyTasks) {
        const assignedTasks = typeof window.getExplorerAssignedTaskNames === 'function' 
            ? Array.from(window.getExplorerAssignedTaskNames()) 
            : [];
        
        // Si el filtro está activo pero el usuario NO tiene tareas asignadas en este proyecto,
        // no mostrar nada (evita la falla de mostrar todo el proyecto sin filtrar)
        if (assignedTasks.length === 0) {
            return [];
        }

        const normDirPath = (dirPath || '').replace(/\\/g, '/').toLowerCase();

        // Si ya estamos adentro de la carpeta de una tarea asignada, permitir todo su contenido (renders, scripts, compo, etc.)
        const isInsideAssignedFolder = assignedTasks.some(t => normDirPath.includes('/' + t + '/') || normDirPath.endsWith('/' + t));
        if (isInsideAssignedFolder) {
            return result;
        }

        const isShotsDir = normDirPath.endsWith('/shots') || normDirPath.endsWith('/planos');

        // Extraer tokens que identifican exclusivamente las carpetas intermedias (episodios, secuencias, categorías)
        // Ignoramos el identificador del proyecto y el número final del shot
        const projectCandidates = (typeof settings !== 'undefined' && settings.currentProject)
            ? [settings.currentProject.name, settings.currentProject.projectCode, settings.currentProject.code].filter(Boolean).map(s => s.toLowerCase().trim())
            : [];

        const ancestorTokens = new Set();
        for (const t of assignedTasks) {
            const parts = t.toLowerCase().replace(/[^a-z0-9]/g, '_').split('_').filter(Boolean);
            for (let idx = 0; idx < parts.length; idx++) {
                const p = parts[idx];
                if (p.length < 2) continue;
                // Excluir código del proyecto para evitar matchear carpetas o archivos que solo compartan el prefijo del proyecto
                if (projectCandidates.some(c => c === p || (c.length >= 3 && (p.startsWith(c) || c.startsWith(p))))) {
                    continue;
                }
                // Excluir el número final del plano (ej: '0020', '010') para no matchear carpetas de otros planos
                if (idx === parts.length - 1 && /^\d+$/.test(p)) {
                    continue;
                }
                ancestorTokens.add(p);
            }
        }

        const userTasks = (typeof Ramon !== 'undefined' && Array.isArray(Ramon.tasks))
            ? Ramon.tasks.filter(t => typeof window.isRamonTaskInCurrentProject === 'function' ? window.isRamonTaskInCurrentProject(t) : true)
            : [];

        // Determinar dinámicamente si el usuario tiene planos o assets asignados
        let hasShotTasks = false;
        let hasAssetTasks = false;

        if (userTasks.length > 0) {
            for (const t of userTasks) {
                const it = (t.item_type || '').toLowerCase();
                const st = (t.search_type || '').toLowerCase();
                const nm = (t.name || '').toLowerCase();
                if (it.includes('plano') || it.includes('shot') || st.includes('plano') || /_b\d+_/i.test(nm)) {
                    hasShotTasks = true;
                } else if (it.includes('asset') || st.includes('asset')) {
                    hasAssetTasks = true;
                } else {
                    if (/_b\d+_/i.test(nm) || /b\d+/i.test(nm)) {
                        hasShotTasks = true;
                    } else {
                        hasAssetTasks = true;
                    }
                }
            }
        } else {
            hasShotTasks = assignedTasks.some(t => /_b\d+_/i.test(t) || /b\d+/i.test(t));
            hasAssetTasks = assignedTasks.some(t => !/_b\d+_/i.test(t) && !/b\d+/i.test(t));
        }

        const SHOT_CONTAINERS = new Set(['episodios', 'secuencias', 'shots', 'planos']);
        const ASSET_CONTAINERS = new Set(['assets', '3d', '2d', 'props', 'characters', 'char', 'prop', 'env', 'environments', 'assets2d', 'assets3d']);

        result = result.filter(item => {
            const nameLower = (item.name || '').toLowerCase();
            const pathLower = (item.path || '').replace(/\\/g, '/').toLowerCase();

            // A. Adentro de la carpeta de la tarea asignada: mostrar todo
            for (const t of assignedTasks) {
                if (pathLower.includes('/' + t + '/') || pathLower.endsWith('/' + t)) {
                    return true;
                }
            }

            // B. Coincidencia directa o prefijo del ítem asignado (el plano o asset mismo)
            for (const t of assignedTasks) {
                if (nameLower === t || nameLower.startsWith(t + '_') || nameLower.startsWith(t + '.')) {
                    return true;
                }
                if (nameLower.includes(t)) {
                    return true;
                }
            }

            // Si estamos dentro de la carpeta 'shots' o 'planos', los hijos son planos individuales.
            // Si no coincidió directamente con assignedTasks en la regla B, NO debe mostrarse (evita planos hermanos no asignados)
            if (isShotsDir) {
                return false;
            }

            // Si el ítem tiene formato de plano completo (ej: SURF_B01_003_0010), tampoco debe matchear por tokens de ancestro
            const parts = nameLower.split('_').filter(Boolean);
            const isFullShotFormat = parts.length >= 3 && /^\d{3,5}$/.test(parts[parts.length - 1]);
            if (isFullShotFormat) {
                return false;
            }

            // C. Carpetas estructurales universales (solo si el usuario tiene tareas asignadas en esa rama)
            if (hasShotTasks && SHOT_CONTAINERS.has(nameLower)) return true;
            if (hasAssetTasks && ASSET_CONTAINERS.has(nameLower)) return true;

            // D. Tokens de carpetas intermedias (ej: carpeta 'b01', carpeta '003', o 'ep_b01', 'seq_003')
            if (ancestorTokens.has(nameLower)) return true;
            for (const tok of ancestorTokens) {
                if (nameLower === `ep_${tok}` || nameLower === `seq_${tok}` || nameLower === `sq_${tok}` || nameLower === `secuencia_${tok}` || nameLower === `episodio_${tok}`) {
                    return true;
                }
            }

            return false;
        });
    }

    // 3. Search Query Filter (window.explorerSearchQuery)
    if (window.explorerSearchQuery && window.explorerSearchQuery.trim() !== '') {
        const q = window.explorerSearchQuery.trim().toLowerCase();
        result = result.filter(item => {
            const nameLower = (item.name || '').toLowerCase();
            const pathLower = (item.path || '').replace(/\\/g, '/').toLowerCase();
            return nameLower.includes(q) || pathLower.includes('/' + q + '/') || pathLower.includes('/' + q);
        });
    }

    return result;
};

window.togglePipetaFilter = function() {
    window.pipetaUseFilter = !window.pipetaUseFilter;
    if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
    refreshCurrentView();
};

window.toggleExplorerOnlyMyTasks = async function() {
    window.explorerOnlyMyTasks = !window.explorerOnlyMyTasks;
    if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');

    // Si tenemos sesión de Ramón y no hay tareas en memoria, intentar cargar desde caché antes de refrescar
    if (window.explorerOnlyMyTasks && typeof Ramon !== 'undefined') {
        if ((!Ramon.tasks || Ramon.tasks.length === 0) && Ramon.session?.user) {
            const uLogin = Ramon.session.user.login || Ramon.session.user.username;
            if (uLogin) {
                try {
                    const cacheRaw = sessionStorage.getItem(`pipeta_ramon_tasks_${uLogin.toLowerCase()}`);
                    if (cacheRaw) {
                        const parsed = JSON.parse(cacheRaw);
                        if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
                            Ramon.tasks = parsed.tasks;
                        }
                    }
                } catch(e) {}
            }
        }
    }

    // Refresco INSTANTÁNEO de la vista
    refreshCurrentView();

    if (window.explorerOnlyMyTasks) {
        const assigned = typeof window.getExplorerAssignedTaskNames === 'function' 
            ? window.getExplorerAssignedTaskNames() 
            : new Set();

        const projName = settings?.currentProject?.name || 'este proyecto';

        if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
            if (assigned.size > 0) {
                settings.showToast(`Filtro Ramón: ${assigned.size} ítem${assigned.size === 1 ? '' : 's'} asignado${assigned.size === 1 ? '' : 's'} en ${projName}`, 'success', 2.5);
            } else {
                settings.showToast(`Filtro Ramón activo: No hay tareas asignadas en ${projName}`, 'warning', 2.5);
            }
        }

        // Si tenemos sesión de Ramón, sincronizar en background sin congelar la interfaz (usando 'ALL' para no truncar la consulta con un projectCode incompatible)
        if (typeof Ramon !== 'undefined' && Ramon.session?.user && typeof Ramon.fetchTasks === 'function') {
            Ramon.fetchTasks('ALL', false).then((updatedTasks) => {
                if (window.explorerOnlyMyTasks) {
                    const newAssigned = typeof window.getExplorerAssignedTaskNames === 'function'
                        ? window.getExplorerAssignedTaskNames()
                        : new Set();
                    if (newAssigned.size !== assigned.size) {
                        if (newAssigned.size > 0 && typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                            settings.showToast(`Filtro Ramón: ${newAssigned.size} ítem${newAssigned.size === 1 ? '' : 's'} asignado${newAssigned.size === 1 ? '' : 's'} en ${projName}`, 'success', 2.5);
                        }
                        refreshCurrentView();
                    }
                }
            }).catch(() => {});
        }
    } else {
        if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
            settings.showToast('Filtro Ramón desactivado (mostrando todo)', 'info', 1.5);
        }
    }
};

window.setExplorerSearchQuery = function(q) {
    window.explorerSearchQuery = (q || '').trim();
    refreshCurrentView();
};

window.clearExplorerSearchQuery = function() {
    window.explorerSearchQuery = '';
    const inp = document.getElementById('explorerSearchInput');
    if (inp) inp.value = '';
    if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
    refreshCurrentView();
};

function updateDesignContext() {
    const contextDisplay = document.getElementById('designContextPath');
    if (contextDisplay) {
        contextDisplay.innerText = selectedContextPath || "Ninguna carpeta seleccionada";
    }

    // Notify Asset Creator if it's open
    if (typeof AssetCreator !== 'undefined' && AssetCreator.isVisible && typeof AssetCreator.handleSelectionChange === 'function') {
        AssetCreator.handleSelectionChange(selectedContextPath);
    }

    // Notify Shot Creator if it's open
    if (typeof ShotCreator !== 'undefined' && ShotCreator.isVisible && typeof ShotCreator.handleSelectionChange === 'function') {
        ShotCreator.handleSelectionChange(selectedContextPath);
    }

    // Notify IA Ingest
    if (typeof handleIaSelectionChange === 'function') {
        handleIaSelectionChange(selectedContextPath);
    }
}

function selectBlock(el, name) {
    document.querySelectorAll('.design-block').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('settingName').value = name;
}

// --- VIEW SWITCHING ---
// --- VIEW SWITCHING ---
function switchBrowserMode(mode) {
    currentBrowserMode = mode;
    try {
        localStorage.setItem('pipeta_browser_mode', mode);
    } catch(e){}

    // Update Toolbars to reflect active state
    updateHeaderTools('view-browser');

    // Toggle Containers
    const splitEl = document.getElementById('browser-mode-split');
    const pipetaEl = document.getElementById('browser-mode-pipeta');

    if (splitEl) splitEl.style.display = mode === 'split' ? 'flex' : 'none';
    if (pipetaEl) pipetaEl.style.display = mode === 'pipeta' ? 'flex' : 'none';

    if (mode === 'pipeta') {
        const projCont = document.getElementById('pipeta-project-container');
        if (projCont && projCont.children.length === 0) initPipetaView();
    }
}

async function refreshCurrentView(forceCatalog = false) {
    window.activeBrowserRenderToken = (window.activeBrowserRenderToken || 0) + 1;

    // Invalida caché en memoria del backend de directorios de red SOLO si se fuerza explícitamente
    if (forceCatalog) {
        try {
            await fetch('/api/sync/catalog/clear-cache', { method: 'POST' });
        } catch(e) {}
    }

    // Visual feedback
    const btn = document.querySelector('.tool-btn[title*="Refrescar"]') || document.querySelector('.tool-btn[title="Refrescar Carpeta"]');
    if (btn) {
        btn.style.transform = "rotate(360deg)";
        btn.style.transition = "transform 0.5s";
        setTimeout(() => btn.style.transform = "none", 500);
    }

    const compMode = window.syncComparisonMode || 'off';
    if (forceCatalog && typeof loadActiveProjectSyncCatalog === 'function') {
        try {
            await loadActiveProjectSyncCatalog(true);
        } catch(e) {}
    }

    if (currentBrowserMode === 'split') {
        if (typeof initBrowser === 'function') await initBrowser();
    } else {
        if (typeof initPipetaView === 'function') await initPipetaView();
    }
}

window.zEnvOverride = localStorage.getItem('pipeta_z_env_override') || 'auto'; // 'auto' | 'force_real' | 'force_fake'

// Cargar entorno previamente guardado de forma instantánea
try {
    const savedEnv = localStorage.getItem('pipeta_system_env');
    window.pipetaSystemEnv = savedEnv ? JSON.parse(savedEnv) : null;
} catch (e) {
    window.pipetaSystemEnv = null;
}

function isZRealServer() {
    const override = window.zEnvOverride || 'auto';
    if (override === 'force_real') return true;
    if (override === 'force_fake') return false;
    // Si aún no se completó la detección, en el estudio por defecto Z: es el Servidor Real
    if (!window.pipetaSystemEnv || !window.pipetaSystemEnv.zInfo) return true;
    return !!window.pipetaSystemEnv.zInfo.isRealServer;
}

function isExternalMachine() {
    if (window.pipetaSystemEnv && typeof window.pipetaSystemEnv.isExternalMachine === 'boolean') {
        return window.pipetaSystemEnv.isExternalMachine;
    }
    if (typeof Ramon !== 'undefined' && Ramon.session?.server) {
        const s = Ramon.session.server;
        if (s.includes('8075') || s.includes('https://') || s.includes('ramon.lasp.co')) {
            return true;
        }
    }
    return false;
}

function canUseServerMode() {
    // En máquinas externas (casa de artistas sin VPN / WAN), el Servidor Central SMB y catálogos de red NO existen
    if (isExternalMachine()) return false;
    // En el estudio: solo se muestra el botón SERVER si Z: NO es el servidor real (ej: puesto Dev VM con S: o catálogos)
    return (typeof isZRealServer === 'function' && !isZRealServer());
}

window.isZRealServer = isZRealServer;
window.isExternalMachine = isExternalMachine;
window.canUseServerMode = canUseServerMode;

window.viewLocationMode = localStorage.getItem('pipeta_view_location_mode') || 'local';
if (!canUseServerMode() && window.viewLocationMode === 'server') {
    window.viewLocationMode = 'local';
}
window.syncComparisonMode = localStorage.getItem('pipeta_sync_comparison_mode') || 'drive';
if (!canUseServerMode() && window.syncComparisonMode === 'server') {
    window.syncComparisonMode = 'drive';
}

async function detectSystemEnvironment(force = false) {
    try {
        const url = '/api/sync/detect-env' + (force ? '?force=true' : '');
        const res = await fetch(url).then(r => r.json()).catch(() => null);
        if (res && res.success) {
            window.pipetaSystemEnv = res;
            try { localStorage.setItem('pipeta_system_env', JSON.stringify(res)); } catch(e){}
            console.log('[ENV DETECT] Estado:', res.hasInternet ? 'Online' : 'Offline', 'Externa:', res.isExternalMachine, 'Unidades:', res.zInfo, res.sInfo);
            
            // Si la máquina es externa o Z es servidor real, apagar modos de servidor
            if (!canUseServerMode()) {
                if (window.viewLocationMode === 'server') {
                    window.viewLocationMode = 'local';
                    try { localStorage.setItem('pipeta_view_location_mode', 'local'); } catch(e){}
                }
                if (window.syncComparisonMode === 'server') {
                    window.syncComparisonMode = 'drive';
                    try { localStorage.setItem('pipeta_sync_comparison_mode', 'drive'); } catch(e){}
                }
            }

            if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
            return res;
        }
    } catch (e) {
        console.warn('[ENV DETECT] Error detectando entorno:', e);
    }
    return null;
}

// Ejecutar detección en segundo plano (usará caché del equipo si ya se detectó)
detectSystemEnvironment();

function getZEnvStatusLabel() {
    const override = window.zEnvOverride || 'auto';
    if (override === 'force_real') return 'Forzado: Z Real (Servidor)';
    if (override === 'force_fake') return 'Forzado: Z Local (Falso)';
    if (!window.pipetaSystemEnv || !window.pipetaSystemEnv.zInfo) return 'Detectando...';
    const z = window.pipetaSystemEnv.zInfo;
    if (isExternalMachine()) return `Z: Disco Local (${z.type || 'Externo'})`;
    if (z.isRealServer) return `Z: Servidor de Red (${z.target || 'LAN'})`;
    if (z.type === 'subst') return `Z: Local Virtual (${z.target || 'vsubst'})`;
    return `Z: Disco Local (${z.type})`;
}

function toggleSyncComparisonMode(targetMode) {
    const nextMode = (window.syncComparisonMode === targetMode) ? 'off' : targetMode;
    setSyncComparisonMode(nextMode);
}
window.toggleSyncComparisonMode = toggleSyncComparisonMode;

async function setSyncComparisonMode(mode) {
    if (mode === 'server' && (typeof canUseServerMode === 'function' && !canUseServerMode())) {
        mode = 'drive';
    }
    window.syncComparisonMode = mode;
    localStorage.setItem('pipeta_sync_comparison_mode', mode);

    const modeLabels = {
        'drive': '☁️ GOOGLE DRIVE (Ver qué falta subir o bajar)',
        'server': '🗄️ SERVIDOR CENTRAL (S:)',
        'off': 'APAGADO'
    };

    if (typeof PipetaConsole !== 'undefined') {
        PipetaConsole.log('sync', `Modo de comparación: ${modeLabels[mode] || mode.toUpperCase()}`, 'info');
    }

    if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
    refreshCurrentView();
}

async function refreshSyncCatalogManual() {
    const projName = (typeof settings !== 'undefined' && settings.currentProject && settings.currentProject.name) 
        ? settings.currentProject.name 
        : 'surf_love';

    const viewMode = window.viewLocationMode || 'local';
    const compMode = window.syncComparisonMode || 'drive';
    const canServer = (typeof canUseServerMode === 'function') ? canUseServerMode() : false;
    const isServerTarget = canServer && ((viewMode === 'server') || (compMode === 'server'));
    const targetType = isServerTarget ? 'server' : 'drive';

    if (typeof PipetaConsole !== 'undefined') {
        PipetaConsole.log('sync', `Solicitando refresco de catálogo (${targetType.toUpperCase()}) para '${projName}' al Worker...`, 'pending');
    }
    if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
        settings.showToast(`Actualizando catálogo de ${targetType === 'server' ? 'Servidor' : 'Drive'}...`, 'info', 10);
    }

    // Identificar carpeta seleccionada o raíz activa
    let currentFolder = '';
    const selectedEl = document.querySelector('.tree-node.selected, .tree-node.active');
    if (selectedEl && selectedEl.getAttribute('data-path')) {
        currentFolder = selectedEl.getAttribute('data-path');
    } else if (typeof activePath !== 'undefined' && activePath) {
        currentFolder = activePath;
    } else {
        const roots = getCurrentRoots();
        currentFolder = roots.work || `Z:/atresmedia/${projName}`;
    }

    try {
        const res = await fetch('/api/sync/catalog/refresh-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: projName,
                path: currentFolder,
                type: targetType
            })
        }).then(r => r.json()).catch(e => ({ success: false, error: e.message }));

        if (res && res.success) {
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `✓ Catálogo (${targetType.toUpperCase()}) actualizado (${res.itemsCount || 0} items)`, 'ok');
            }
            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast('Catálogo actualizado', 'success', 3);
            }
        }
    } catch (e) {
        console.warn('[REFRESH CATALOG] Error:', e);
    }

    // Invalida caché y fuerza recarga
    fetch('/api/sync/catalog/clear-cache', { method: 'POST' }).catch(() => {});
    if (typeof loadActiveProjectSyncCatalog === 'function') {
        await loadActiveProjectSyncCatalog(true);
    }
    refreshCurrentView(true);
}

async function switchViewLocation(mode) {
    if (mode === 'server' && (typeof canUseServerMode === 'function' && !canUseServerMode())) {
        mode = 'local';
    }
    window.viewLocationMode = mode;
    localStorage.setItem('pipeta_view_location_mode', mode);

    const modeLabels = {
        local: 'DISCO LOCAL (Z:)',
        drive: '☁️ GOOGLE DRIVE (G:)',
        server: '🗄️ SERVIDOR CENTRAL (S:)'
    };

    if (typeof PipetaConsole !== 'undefined') {
        PipetaConsole.log('system', `Ubicación de visualización cambiada a: ${modeLabels[mode] || mode}`, 'info');
    }

    // Actualización inmediata de toolbar con 0 ms de latencia
    if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
    refreshCurrentView();
}

function getCurrentRoots() {
    const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
    const mode = window.viewLocationMode || 'local';

    if (proj && proj.roots) {
        if (mode === 'drive' || mode === 'online') {
            const rawWork = proj.roots.onlineWork || `G:/Unidades compartidas/${proj.name || proj.projectCode}`;
            const rawMedia = proj.roots.onlineMedia || `G:/Unidades compartidas/${proj.name || proj.projectCode}_media`;
            return {
                work: rawWork.replace(/\\/g, '/'),
                media: rawMedia.replace(/\\/g, '/')
            };
        }
        // En modos 'local' y 'server', las rutas conceptuales del proyecto son siempre Z:/
        const rawWork = proj.roots.work || 'Z:/';
        const rawMedia = proj.roots.media || 'Z:/';
        return {
            work: rawWork.replace(/\\/g, '/'),
            media: rawMedia.replace(/\\/g, '/')
        };
    }
    // Fallback if settings not loaded yet
    return (typeof ROOTS !== 'undefined') ? ROOTS : { work: 'Z:/', media: 'Z:/' };
}

// --- SPLIT DIVIDER DRAG ---
function initSplitDivider() {
    const divider = document.getElementById('split-divider');
    const paneProject = document.getElementById('split-pane-project');
    const paneMedia = document.getElementById('split-pane-media');
    if (!divider || !paneProject || !paneMedia) return;

    divider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const column = paneProject.parentElement;
        const columnRect = column.getBoundingClientRect();
        const dividerH = divider.offsetHeight;

        divider.classList.add('dragging');

        const onMove = (ev) => {
            const y = ev.clientY - columnRect.top;
            const totalH = columnRect.height - dividerH;
            const topH = Math.max(60, Math.min(totalH - 60, y));
            const bottomH = totalH - topH;

            paneProject.style.flex = 'none';
            paneProject.style.height = topH + 'px';
            paneMedia.style.flex = 'none';
            paneMedia.style.height = bottomH + 'px';
        };

        const onUp = () => {
            divider.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// Init when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initSplitDivider();
});

// --- IMAGE SEQUENCE COLLAPSING (VFX PIPELINE) ---
window.IMAGE_SEQUENCE_EXTENSIONS = new Set([
    '.exr', '.dpx', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.tga', '.cin', '.ari'
]);

window.collapseImageSequences = function(items) {
    if (!Array.isArray(items) || items.length === 0) return [];

    const seqRegex = /^(.*?[._\-]|\D+)(\d+)(\.[a-zA-Z0-9]+)$/;
    const nonSequences = [];
    const seqMap = new Map();

    for (const item of items) {
        if (item.isDirectory || item.isDir) {
            nonSequences.push(item);
            continue;
        }

        const name = item.name || '';
        const m = name.match(seqRegex);
        if (m) {
            const ext = m[3].toLowerCase();
            if (window.IMAGE_SEQUENCE_EXTENSIONS.has(ext)) {
                const prefix = m[1];
                const frameStr = m[2];
                const key = (prefix + ext).toLowerCase();

                if (!seqMap.has(key)) {
                    seqMap.set(key, { prefix, ext, frames: [] });
                }
                seqMap.get(key).frames.push({
                    frameNum: parseInt(frameStr, 10),
                    padLength: frameStr.length,
                    item: item
                });
                continue;
            }
        }
        nonSequences.push(item);
    }

    const result = [...nonSequences];

    for (const [key, seqData] of seqMap.entries()) {
        const frames = seqData.frames;
        if (frames.length < 3) {
            for (const f of frames) {
                result.push(f.item);
            }
            continue;
        }

        frames.sort((a, b) => a.frameNum - b.frameNum);
        const first = frames[0];
        const last = frames[frames.length - 1];
        const totalSize = frames.reduce((acc, f) => acc + (f.item.size || 0), 0);
        const pad = Math.max(first.padLength, 4);

        const startStr = String(first.frameNum).padStart(pad, '0');
        const endStr = String(last.frameNum).padStart(pad, '0');
        const seqDisplayName = `${seqData.prefix}[${startStr}-${endStr}]${seqData.ext} (${frames.length} frames)`;

        const sample = first.item;
        result.push({
            ...sample,
            name: seqDisplayName,
            isDirectory: false,
            isDir: false,
            isSequence: true,
            frameCount: frames.length,
            startFrame: first.frameNum,
            endFrame: last.frameNum,
            size: totalSize,
            path: sample.path,
            serverPath: sample.serverPath,
            onlinePath: sample.onlinePath,
            targetLocalPath: sample.targetLocalPath,
            syncStatus: sample.syncStatus,
            items: frames.map(f => f.item)
        });
    }

    result.sort((a, b) => {
        const aIsDir = a.isDirectory || a.isDir;
        const bIsDir = b.isDirectory || b.isDir;
        if (aIsDir === bIsDir) return a.name.localeCompare(b.name);
        return aIsDir ? -1 : 1;
    });

    return result;
};
