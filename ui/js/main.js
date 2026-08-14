// --- TAB SWITCHING ---
const tabs = {
    'Inicio': 'view-home',
    'Explorer': 'view-browser',
    'Asset Designer': 'view-asset-designer',
    'Shot Designer': 'view-shot-designer',
    'IA Ingest': 'view-ia-ingest',
    'Check In/Out': 'view-check'
};

// --- DYNAMIC HEADER TOOLS ---
const headerToolsTemplates = {
    'view-home': () => `<!-- No tools for home -->`,
    'view-asset-designer': () => `
        <button class="tool-btn" onclick="AssetDesigner.addNode('unit')" title="Añadir Unidad">
            <img src="icons/hdd.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="AssetDesigner.addNode('folder')" title="Añadir Carpeta">
            <img src="icons/new_folder.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="AssetDesigner.addNode('file')" title="Añadir Archivo">
            <img src="icons/file.svg" class="btn-icon-svg">
        </button>
        <div style="width:10px"></div>
        <button class="tool-btn" onclick="AssetDesigner.duplicateSelected()" title="Duplicar Selección">
            <img src="icons/duplicate.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn danger" onclick="AssetDesigner.deleteSelected()" title="Borrar Selección">
            <img src="icons/delete.svg" class="btn-icon-svg">
        </button>
    `,
    'view-browser': () => `
        <!-- Group 1: Views -->
        <button class="tool-btn tool-ref-icon" title="Reference Eye">
             <img src="icons/eye.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn ${currentBrowserMode === 'split' ? 'active' : ''}" onclick="switchBrowserMode('split')" title="Vista Clásica (Árbol)">
            <img src="icons/view_classic.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn ${currentBrowserMode === 'pipeta' ? 'active' : ''}" onclick="switchBrowserMode('pipeta')" title="Vista Miller (Colummnas)">
            <img src="icons/view_miller.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn ${window.pipetaUseFilter ? 'active' : ''}" 
                onclick="togglePipetaFilter()" 
                oncontextmenu="handleFilterContextMenu(event)"
                title="Miller: Filtrado (CLIC: ON/OFF | R-CLIC: Ajustar)">
            <img src="icons/filter.svg" class="btn-icon-svg" style="${!window.pipetaUseFilter ? 'opacity:0.4' : ''}">
        </button>
        
        <div style="width:5px"></div>
        
        <!-- Local/Online Switcher -->
        <div style="display:flex; background:#222; border-radius:4px; padding:2px; margin-right:5px; border:1px solid #444;">
            <button class="tool-btn ${window.viewLocationMode === 'local' ? 'active' : ''}" 
                    style="padding: 2px 8px; font-size: 0.75rem; height: auto;"
                    onclick="switchViewLocation('local')" title="Rutas Locales (Z:)">LOCAL</button>
            <button class="tool-btn ${window.viewLocationMode === 'online' ? 'active' : ''}" 
                    style="padding: 2px 8px; font-size: 0.75rem; height: auto;"
                    onclick="switchViewLocation('online')" title="Rutas Online (M:)">ONLINE</button>
        </div>

        <button class="tool-btn" onclick="refreshCurrentView()" title="Refrescar Carpeta">
            <img src="icons/refresh.svg" class="btn-icon-svg">
        </button>
        
        <div class="tool-space-small"></div>
        <div class="tool-separator"></div>
        
        <!-- Group 2: Global Tools -->
        <button class="tool-btn ${typeof isMirrorMode !== 'undefined' && isMirrorMode ? 'active' : ''}" onclick="toggleMirrorMode()" title="Mirror View" id="btnMirrorModeTool">
            <img src="icons/mirror.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="window.toggleValidator()" title="Naming Validator">
            <img src="icons/validator.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="toggleSyncAnalyzer()" title="Sync Analyzer (Local ↔ Online)">
            <img src="icons/sync_analyzer.svg" class="btn-icon-svg btn-icon-white">
        </button>
        <button class="tool-btn" onclick="AssetCreator.open()" title="Asset Creator">
            <img src="icons/asset_creator.svg" class="btn-icon-svg btn-icon-orange">
        </button>
        <button class="tool-btn" onclick="ShotCreator.open()" title="Shot Creator">
            <img src="icons/asset_creator.svg" class="btn-icon-svg">
        </button>
        
        <div class="tool-space-large"></div>
        <div class="tool-separator"></div>
        
        <!-- Group 3: Context Actions -->
        <button class="tool-btn" onclick="contextMenu.copyToClipboard(false)" title="Copiar">
            <img src="icons/copy.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="contextMenu.copyToClipboard(true)" title="Cortar">
            <img src="icons/cut.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="contextMenu.pasteFromClipboard(selectedContextPath)" title="Pegar">
            <img src="icons/paste.svg" class="btn-icon-svg">
        </button>
        
        <div style="width:5px"></div>
        
        <button class="tool-btn" onclick="contextMenu.renameItem(selectedContextPath)" title="Renombrar">
            <img src="icons/rename.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="contextMenu.duplicateItems()" title="Duplicar">
            <img src="icons/duplicate.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn danger" onclick="contextMenu.deleteItems()" title="Borrar">
            <img src="icons/delete.svg" class="btn-icon-svg">
        </button>
        
        <div style="width:5px"></div>

        <button class="tool-btn" onclick="contextMenu.createFolder(selectedContextPath, window.selectedContextIsDir)" title="Nueva Carpeta">
            <img src="icons/new_folder.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="contextMenu.copyPath(selectedContextPath)" title="Copiar Ruta">
            <img src="icons/copy_path.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="API.fs.open(selectedContextPath)" title="Abrir en Explorer">
            <img src="icons/open_explorer.svg" class="btn-icon-svg">
        </button>
    `,
    'view-shot-designer': () => `
        <button class="tool-btn" onclick="ShotDesigner.addNode('unit')" title="Añadir Unit">
            <img src="icons/hdd.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="ShotDesigner.addNode('folder')" title="Añadir Carpeta">
            <img src="icons/new_folder.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn" onclick="ShotDesigner.addNode('file')" title="Añadir Archivo">
            <img src="icons/file.svg" class="btn-icon-svg">
        </button>
        
        <div class="tool-separator"></div>
        
        <button class="tool-btn" onclick="ShotDesigner.alignNodesVertical()" title="Center Line">
             <span style="font-size:1.1rem; filter: grayscale(100%);">↔️</span>
        </button>
        <button class="tool-btn" onclick="ShotDesigner.alignNodesHorizontal()" title="Center Column">
             <span style="font-size:1.1rem; filter: grayscale(100%);">↕️</span>
        </button>
        
        <div class="tool-separator"></div>
        
        <button class="tool-btn" onclick="ShotDesigner.duplicateSelected()" title="Duplicar Selección">
            <img src="icons/duplicate.svg" class="btn-icon-svg">
        </button>
        <button class="tool-btn danger" onclick="ShotDesigner.deleteSelected()" title="Borrar Selección">
            <img src="icons/delete.svg" class="btn-icon-svg">
        </button>
    `,
    'view-check': () => `
        <button class="tool-btn" title="Sync">🔄 Sync</button>
    `,
    'view-ia-ingest': () => `
        <div style="display:flex; align-items:center; gap:8px;">
            <button class="tool-btn" onclick="copyCanonicalName()" title="Copiar Nombre de archivo canónico">
                📋 Copiar Nombre
            </button>
            <button class="tool-btn" onclick="copyCanonicalPath()" title="Copiar Ruta de destino Z:\">
                📁 Copiar Ruta
            </button>
            <button class="tool-btn" onclick="openTargetFolder()" title="Abrir carpeta de destino en Windows Explorer">
                📂 Abrir Carpeta
            </button>
        </div>
    `,
    'default': () => `<span style="color:#444;">...</span>`
};

// --- APP LIFECYCLE ---

function showOverlay(msg, subMsg) {
    const ov = document.getElementById('app-overlay');
    if (ov) {
        document.getElementById('app-overlay-msg').innerText = msg;
        document.getElementById('app-overlay-sub').innerText = subMsg || "";
        ov.style.display = 'flex';
    }
}

window.closeApp = async () => {
    showOverlay("Cerrando Aplicación", "Apagando servidor Pipeta Core...");
    try {
        await fetch('/api/app/close', { method: 'POST' });
    } catch (e) { console.error(e); }

    setTimeout(() => {
        window.close(); // Browser might block this
        document.getElementById('app-overlay-sub').innerText = "Servidor apagado. Puedes cerrar esta pestaña manualmente.";
        document.querySelector('.spinner-large').style.borderTopColor = '#444'; // Grey out spinner
        document.querySelector('.spinner-large').style.animation = 'none';
    }, 1000);
};

window.reloadApp = async () => {
    showOverlay("Recargando Sistema", "Reiniciando servidor y sincronizando...");
    try {
        await fetch('/api/app/restart', { method: 'POST' });
    } catch (e) { console.error(e); }

    // Start polling for server return
    const pollStart = Date.now();
    const poller = setInterval(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const res = await fetch('/api/version', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                clearInterval(poller);
                window.location.reload(true); // Force reload cache
            }
        } catch (e) {
            // Connection refused or timeout = server restarting
            const elapsed = Math.floor((Date.now() - pollStart) / 1000);
            document.getElementById('app-overlay-sub').innerText = `Reiniciando Servidor... (${elapsed}s)`;
        }
    }, 1000);
};

function handleFilterContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    if (window.contextMenu) {
        window.contextMenu.showFilterMenu(e.clientX, e.clientY);
    }
}

function updateHeaderTools(viewId) {
    const container = document.getElementById('headerContextTools');
    if (!container) return;

    // Get template generator
    const generator = headerToolsTemplates[viewId] || headerToolsTemplates['default'];

    // Execute if function, else use string (legacy support if needed, but we converted all)
    container.innerHTML = typeof generator === 'function' ? generator() : generator;
}

function switchView(viewId) {
    // 1. Update Buttons State
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const btnView = tabs[btn.getAttribute('title')];
        if (btnView === viewId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // 2. Hide All Views
    document.querySelectorAll('.view-section').forEach(v => {
        v.style.display = 'none';
    });

    // 3. Show Target View
    const el = document.getElementById(viewId);
    if (el) {
        el.style.display = 'flex'; // Restore flex checking layout.css/inline styles

        // Initialize modules lazy-load
        if (viewId === 'view-home' && typeof Tutorials !== 'undefined') {
            Tutorials.init();
        }
        if (viewId === 'view-asset-designer' && typeof AssetDesigner !== 'undefined' && !AssetDesigner.initialized) {
            AssetDesigner.init();
            AssetDesigner.initialized = true;
        }
        if (viewId === 'view-shot-designer' && typeof ShotDesigner !== 'undefined' && !ShotDesigner.initialized) {
            ShotDesigner.init();
            ShotDesigner.initialized = true;
        }
        if (viewId === 'view-ia-ingest' && typeof updateIaResolution === 'function') {
            updateIaResolution();
        }
    }

    // 4. Update Toolbar
    updateHeaderTools(viewId);
}

// Bind Click Events
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const viewId = tabs[btn.getAttribute('title')];
        if (viewId) switchView(viewId);
    });
});

// --- INIT ---
fetch('/api/version').then(r => r.json()).then(d => {
    if (d.version) document.getElementById('appVersion').innerText = d.version;
});

// Initialize Browser Component
// We need to wait for settings to load to know the default view mode
// settings is loaded via script tag, but we need to ensure it's ready or load it manually if needed.
// 'settings' object is global.

async function initApp() {
    // 1. Load Settings (Projects, Configs)
    if (typeof settings !== 'undefined') {
        await settings.init();
    }

    // Init Inspector (Presets)
    if (typeof Inspector !== 'undefined') {
        await Inspector.init();
    }

    // 2. Determine View Mode
    let initialMode = 'local'; // Default
    if (typeof settings !== 'undefined' && settings.defaultViewMode) {
        initialMode = settings.defaultViewMode;
    }

    // Set global mode (without triggering refesh yet)
    window.viewLocationMode = initialMode;

    // 3. Init Browser (will use window.viewLocationMode)
    await initBrowser();

    // 4. Set Default View (Fixes overlap issues on load)
    switchView('view-browser');

    // 5. Force UI Update for Toggle Button
    updateHeaderTools('view-browser');

    // 6. Start Disk Monitor
    updateDiskMonitor();
    setInterval(updateDiskMonitor, 30000); // Every 30s

    // 7. Check Rclone Status
    checkRcloneStatus();
}

// --- RCLONE STATUS ---
async function checkRcloneStatus() {
    try {
        const res = await fetch('/api/rclone/status');
        const data = await res.json();
        window.rcloneStatus = data; // Store globally for settings UI

        const monitorEl = document.getElementById('disk-monitor');
        if (monitorEl && data.available) {
            const badge = document.createElement('span');
            badge.className = 'rclone-badge';
            badge.title = `Rclone ${data.version} disponible — Sync acelerado activo`;
            badge.innerText = '⚡';
            // Insert after the bars (flex row handles positioning)
            monitorEl.appendChild(badge);
        }
    } catch (e) { /* silent */ }
}

// --- DISK USAGE MONITOR ---
async function updateDiskMonitor() {
    try {
        let onlineDrive = 'G';
        if (typeof settings !== 'undefined' && settings.currentProject) {
            const cp = settings.currentProject;
            const onlinePath = cp.onlineMedia || cp.onlineWork || (cp.roots && (cp.roots.media || cp.roots.online)) || '';
            if (onlinePath && onlinePath.includes(':')) {
                onlineDrive = onlinePath.split(':')[0].toUpperCase();
            }
        }
        
        // Evitar comparar Z con Z (el disco local es Z, el disco online debe ser G u otra unidad online)
        if (onlineDrive === 'Z') {
            onlineDrive = 'G';
        }
        
        const res = await fetch(`/api/system/diskUsage?drives=Z,${onlineDrive}`);
        const data = await res.json();

        _updateDiskBar('z', data['Z'], 'Z');
        _updateDiskBar('m', data[onlineDrive], onlineDrive);
    } catch (e) {
        // Silently fail — could be offline
    }
}

function _updateDiskBar(id, info, driveLetter) {
    const bar = document.getElementById(`disk-bar-${id}`);
    const textEl = document.getElementById(`disk-pct-${id}`);
    const wrap = bar?.closest('.disk-bar-wrap');
    if (!bar || !textEl || !info) return;

    if (driveLetter) {
        const labelEl = wrap?.querySelector('.disk-label');
        if (labelEl) labelEl.innerText = `${driveLetter}:`;
    }

    const percent = info.percent || 0;
    bar.style.width = percent + '%';

    // Format free space smartly (TB if >= 1024 GB, otherwise GB, 3 significant digits)
    const freeText = _formatDiskSize(info.free);
    textEl.innerText = `${percent}% usado / ${freeText} free`;

    // Color coding
    bar.classList.remove('warn', 'critical');
    if (percent >= 90) bar.classList.add('critical');
    else if (percent >= 70) bar.classList.add('warn');

    // Tooltip con detalles
    const totalText = _formatDiskSize(info.total);
    const usedText = _formatDiskSize(info.used);
    const displayLetter = driveLetter || id.toUpperCase();
    if (wrap) {
        wrap.title = `Disco (${displayLetter}:) — ${usedText} usados de ${totalText} (${freeText} libres)`;
    }
}

function _formatDiskSize(bytes) {
    const gb = bytes / (1024 ** 3);
    if (gb >= 1024) return (gb / 1024).toFixed(2) + ' TB';
    if (gb >= 100) return gb.toFixed(0) + ' GB';
    if (gb >= 10) return gb.toFixed(1) + ' GB';
    return gb.toFixed(2) + ' GB';
}

// --- FOLDER SIZE CALCULATOR ---
async function updateFolderSizes() {
    try {
        const roots = getCurrentRoots();
        // Fetch both sizes in parallel
        const [workRes, mediaRes] = await Promise.all([
            fetch(`/api/fs/dirSize?path=${encodeURIComponent(roots.work)}`).then(r => r.json()).catch(() => null),
            fetch(`/api/fs/dirSize?path=${encodeURIComponent(roots.media)}`).then(r => r.json()).catch(() => null)
        ]);

        const workSizeEl = document.getElementById('project-size-label');
        const mediaSizeEl = document.getElementById('media-size-label');

        if (workSizeEl && workRes && workRes.size !== undefined) {
            workSizeEl.innerText = `(${_formatSize(workRes.size)})`;
        }
        if (mediaSizeEl && mediaRes && mediaRes.size !== undefined) {
            mediaSizeEl.innerText = `(${_formatSize(mediaRes.size)})`;
        }
    } catch (e) { /* silent */ }
}

function _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 ** 3) return (bytes / (1024 ** 2)).toFixed(1) + ' MB';
    const gb = bytes / (1024 ** 3);
    if (gb >= 1024) return (gb / 1024).toFixed(2) + ' TB';
    if (gb >= 100) return gb.toFixed(0) + ' GB';
    if (gb >= 10) return gb.toFixed(1) + ' GB';
    return gb.toFixed(2) + ' GB';
}

// Start
document.addEventListener('DOMContentLoaded', () => initApp());
