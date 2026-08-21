// --- COMMON UI STATE ---
window.pipetaUseFilter = true;
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

function switchViewLocation(mode) {
    window.viewLocationMode = mode;
    updateHeaderTools('view-browser');
    refreshCurrentView();
}

function getCurrentRoots() {
    // Priority: Settings project -> Fallback to ROOTS global
    const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
    if (proj && proj.roots) {
        if (window.viewLocationMode === 'online') {
            return {
                work: proj.roots.onlineWork || proj.roots.work,
                media: proj.roots.onlineMedia || proj.roots.media
            };
        }
        return {
            work: proj.roots.work,
            media: proj.roots.media
        };
    }
    // Fallback if settings not loaded yet
    return (typeof ROOTS !== 'undefined') ? ROOTS : { work: 'C:/', media: 'C:/' };
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
