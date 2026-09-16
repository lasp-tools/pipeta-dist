// --- COMMON UI STATE & EXPLORER FILTERS ---
window.pipetaUseFilter = false;
window.pipetaFilterList = ['Episodios', 'assets', 'Assets', 'guiones', 'Guiones'];
window.explorerOnlyMyTasks = false;
window.explorerSearchQuery = '';
window.viewLocationMode = 'local'; // 'local', 'drive' or 'server'

// Devuelve un Set con los nombres y códigos de planos/assets asignados al usuario en el proyecto actual
window.getExplorerAssignedTaskNames = function() {
    let currentProj = '';
    if (typeof settings !== 'undefined' && settings.currentProject) {
        currentProj = settings.currentProject.code || settings.currentProject.projectCode || settings.currentProject.name || '';
    }

    const tasks = (typeof Ramon !== 'undefined' && Array.isArray(Ramon.tasks)) ? Ramon.tasks : [];
    const assigned = new Set();

    for (const t of tasks) {
        if (!currentProj || !t.project || t.project.toLowerCase() === currentProj.toLowerCase()) {
            if (t.name) assigned.add(t.name.toLowerCase().trim());
            if (t.code) assigned.add(t.code.toLowerCase().trim());
            if (t.search_code) assigned.add(t.search_code.toLowerCase().trim());
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
        
        if (assignedTasks.length > 0) {
            const taskTokens = new Set();
            for (const t of assignedTasks) {
                const parts = t.toLowerCase().replace(/[^a-z0-9]/g, '_').split('_');
                for (const p of parts) {
                    if (p.length >= 2) taskTokens.add(p);
                }
            }

            const SHOT_CONTAINERS = new Set(['episodios', 'secuencias', 'shots', 'planos']);
            const ASSET_CONTAINERS = new Set(['assets', '3d', '2d', 'props', 'characters', 'char', 'prop', 'env', 'environments']);

            result = result.filter(item => {
                const nameLower = (item.name || '').toLowerCase();
                const pathLower = (item.path || '').replace(/\\/g, '/').toLowerCase();

                // A. Adentro de la carpeta de la tarea asignada: mostrar todo
                for (const t of assignedTasks) {
                    if (pathLower.includes('/' + t + '/') || pathLower.endsWith('/' + t)) {
                        return true;
                    }
                }

                // B. Coincidencia directa o prefijo
                for (const t of assignedTasks) {
                    if (nameLower === t || nameLower.startsWith(t + '_') || nameLower.startsWith(t + '.')) {
                        return true;
                    }
                    if (nameLower.includes(t)) {
                        return true;
                    }
                }

                // C. Carpetas estructurales universales
                if (SHOT_CONTAINERS.has(nameLower)) return true;
                if (ASSET_CONTAINERS.has(nameLower)) return true;

                // D. Tokens de la tarea (ej: 'b01', '003')
                if (taskTokens.has(nameLower)) return true;

                return false;
            });
        }
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

    if (window.explorerOnlyMyTasks) {
        let currentProj = '';
        if (typeof settings !== 'undefined' && settings.currentProject) {
            currentProj = settings.currentProject.code || settings.currentProject.projectCode || settings.currentProject.name || '';
        }

        // Si tenemos sesión de Ramón, refrescar tareas del proyecto activo en vivo
        if (typeof Ramon !== 'undefined' && Ramon.session?.user) {
            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast('Sincronizando tareas con Ramón...', 'info', 1.5);
            }
            if (typeof Ramon.fetchTasks === 'function') {
                await Ramon.fetchTasks(currentProj || null, true);
            }
        }

        const assigned = typeof window.getExplorerAssignedTaskNames === 'function' 
            ? window.getExplorerAssignedTaskNames() 
            : new Set();

        if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
            if (assigned.size > 0) {
                settings.showToast(`Filtro Mis Tareas: ${assigned.size} ítems asignados`, 'success', 2);
            } else {
                settings.showToast('Mis Tareas: sin tareas asignadas para este proyecto', 'warning', 3);
            }
        }
    } else {
        if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
            settings.showToast('Filtro Mis Tareas desactivado', 'info', 1.5);
        }
    }

    if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
    refreshCurrentView();
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

function refreshCurrentView() {
    // Invalida caché en memoria del backend de directorios de red
    fetch('/api/sync/catalog/clear-cache', { method: 'POST' }).catch(() => {});

    // Visual feedback
    const btn = document.querySelector('.tool-btn[title="Refrescar Carpeta"]');
    if (btn) {
        btn.style.transform = "rotate(360deg)";
        btn.style.transition = "transform 0.5s";
        setTimeout(() => btn.style.transform = "none", 500);
    }

    if (currentBrowserMode === 'split') {
        if (typeof initBrowser === 'function') initBrowser();
    } else {
        if (typeof initPipetaView === 'function') initPipetaView();
    }
}

window.viewLocationMode = localStorage.getItem('pipeta_view_location_mode') || 'local';
window.syncComparisonMode = localStorage.getItem('pipeta_sync_comparison_mode') || 'drive'; // 'drive' | 'server' | 'off'
window.pipetaSystemEnv = null;
window.zEnvOverride = localStorage.getItem('pipeta_z_env_override') || 'auto'; // 'auto' | 'force_real' | 'force_fake'

async function detectSystemEnvironment() {
    try {
        const res = await fetch('/api/sync/detect-env').then(r => r.json()).catch(() => null);
        if (res && res.success) {
            window.pipetaSystemEnv = res;
            console.log('[ENV DETECT] Info de Unidades:', res.zInfo, res.sInfo);
            if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
            return res;
        }
    } catch (e) {
        console.warn('[ENV DETECT] Error detectando entorno:', e);
    }
    return null;
}

// Ejecutar detección en segundo plano al cargar
detectSystemEnvironment();

function isZRealServer() {
    const override = window.zEnvOverride || 'auto';
    if (override === 'force_real') return true;
    if (override === 'force_fake') return false;
    return !!(window.pipetaSystemEnv && window.pipetaSystemEnv.zInfo && window.pipetaSystemEnv.zInfo.isRealServer);
}

function getZEnvStatusLabel() {
    const override = window.zEnvOverride || 'auto';
    if (override === 'force_real') return 'Forzado: Z Real (Servidor)';
    if (override === 'force_fake') return 'Forzado: Z Local (Falso)';
    if (!window.pipetaSystemEnv || !window.pipetaSystemEnv.zInfo) return 'Detectando...';
    const z = window.pipetaSystemEnv.zInfo;
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

    if (mode === 'drive' && typeof loadActiveProjectSyncCatalog === 'function') {
        await loadActiveProjectSyncCatalog();
    }

    if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
    refreshCurrentView();
}

async function refreshSyncCatalogManual() {
    if (typeof PipetaConsole !== 'undefined') {
        PipetaConsole.log('sync', 'Solicitado refresco manual de catálogos (Drive & Servidor)...', 'pending');
    }
    if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
        settings.showToast('Actualizando catálogos...', 'info', 3);
    }
    fetch('/api/sync/catalog/clear-cache', { method: 'POST' }).catch(() => {});
    if (typeof loadActiveProjectSyncCatalog === 'function') {
        await loadActiveProjectSyncCatalog(false);
    }
    if (typeof PipetaConsole !== 'undefined') {
        PipetaConsole.log('sync', '✓ Catálogos recargados con éxito.', 'ok');
    }
    if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
        settings.showToast('Catálogos actualizados', 'success', 3);
    }
    refreshCurrentView();
}

async function switchViewLocation(mode) {
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

    // Cargar catálogo si vamos a explorar DRIVE o SERVER y no está en memoria
    if ((mode === 'drive' || mode === 'server') && typeof loadActiveProjectSyncCatalog === 'function') {
        await loadActiveProjectSyncCatalog();
    }

    if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
    refreshCurrentView();
}

function getCurrentRoots() {
    const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
    const mode = window.viewLocationMode || 'local';

    if (proj && proj.roots) {
        if (mode === 'drive' || mode === 'online') {
            return {
                work: proj.roots.onlineWork || `G:/Unidades compartidas/${proj.name || proj.projectCode}`,
                media: proj.roots.onlineMedia || `G:/Unidades compartidas/${proj.name || proj.projectCode}_media`
            };
        }
        if (mode === 'server') {
            const serverPrefix = (typeof settings !== 'undefined' && settings.centralServerPath) 
                ? settings.centralServerPath.replace(/\/+$/, '') 
                : 'S:';
            return {
                work: (proj.roots.work || 'Z:').replace(/^Z:/i, serverPrefix),
                media: (proj.roots.media || 'Z:').replace(/^Z:/i, serverPrefix)
            };
        }
        // mode === 'local'
        return {
            work: proj.roots.work || 'Z:/',
            media: proj.roots.media || 'Z:/'
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
