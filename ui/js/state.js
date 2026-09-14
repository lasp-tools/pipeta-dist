// --- COMMON UI STATE ---
window.pipetaUseFilter = false;
window.pipetaFilterList = ['Episodios', 'assets', 'Assets', 'guiones', 'Guiones'];
window.viewLocationMode = 'local'; // 'local' or 'online'

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
window.syncComparisonMode = localStorage.getItem('pipeta_sync_comparison_mode') || 'off'; // 'off' | 'drive' | 'server'
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
        PipetaConsole.log('sync', 'Solicitado refresco manual del catálogo de sincronización...', 'pending');
    }
    if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
        settings.showToast('Actualizando catálogo de sincronización...', 'info', 3);
    }
    if (typeof loadActiveProjectSyncCatalog === 'function') {
        await loadActiveProjectSyncCatalog(true);
    }
    if (typeof PipetaConsole !== 'undefined') {
        PipetaConsole.log('sync', '✓ Catálogo de sincronización recargado con éxito.', 'ok');
    }
    if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
        settings.showToast('Catálogo actualizado', 'success', 3);
    }
    refreshCurrentView();
}

async function switchViewLocation(mode) {
    window.viewLocationMode = mode;
    localStorage.setItem('pipeta_view_location_mode', mode);

    if (typeof PipetaConsole !== 'undefined') {
        PipetaConsole.log('system', `Ubicación de visualización cambiada a: ${mode === 'drive' ? '☁️ GOOGLE DRIVE' : 'DISCO LOCAL'}`, 'info');
    }

    // Solo cargar catálogo si vamos a explorar DRIVE y no está en memoria
    if (mode === 'drive' && typeof loadActiveProjectSyncCatalog === 'function') {
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
