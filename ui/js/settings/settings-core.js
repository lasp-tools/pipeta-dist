// --- SETTINGS CORE MODULE (Lifecycle, State, Config & Modals) ---
if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function (str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
}
var escapeHtml = window.escapeHtml;

// ------------------------------------------
// --- SETTINGS MODULE (CONFIGURACIONES) ---
// ------------------------------------------

const CANONICAL_RESOLUTION_RULES = [
    { detected: "1920x1080", tag: "FHD" },
    { detected: "3840x2160", tag: "UHD" },
    { detected: "1080x1920", tag: "916" },
    { detected: "1080x1080", tag: "SQ1K" },
    { detected: "2048x1080", tag: "2K" },
    { detected: "1280x720", tag: "HD" }
];

const CANONICAL_BASE_PRESETS = {
    id: "proj_base",
    name: "Proyecto Base",
    client: "[cliente]",
    projectCode: "[proyecto]",
    isBase: true,
    roots: {
        work: "Z:/[cliente]/[proyecto]",
        media: "Z:/INTERNO/MEDIA/[cliente]/[proyecto]",
        onlineWork: "G:/Unidades compartidas/[proyecto]",
        onlineMedia: "G:/Unidades compartidas/[proyecto]_media"
    },
    defaultShotPresetId: "master_shot",
    defaultAssetPresetId: "master_asset",
    iaPresets: {
        defaultImageEngine: "NB2P",
        defaultVideoEngine: "SD2",
        defaultFraming: "FLL",
        defaultTagRoleA: "start1001",
        defaultTagRoleB: "inp",
        defaultTagRoleC: "i2v",
        motorsVideo: ["SD2", "SD25", "VEO3", "VO31", "GOMN", "HFMC"],
        motorsImage: ["NB2P", "NBN2", "NBN21", "MJ", "FLUX", "GPT25S", "GPT25F"],
        framings: ["FLL", "CRP"],
        tagsA: ["start1001", "end1100", "f1001", "ref", "ref1050"],
        tagsB: ["inp", "ups", "mask", "clean", "elem"],
        tagsC: ["i2v", "t2i", "i2i", "t2v", "v2v", "m2v"],
        resolutionTranslations: [
            { detected: "1920x1080", tag: "FHD" },
            { detected: "3840x2160", tag: "UHD" },
            { detected: "1080x1920", tag: "916" },
            { detected: "1080x1080", tag: "SQ1K" },
            { detected: "2560x1080", tag: "UW2K" },
            { detected: "1280x720", tag: "HD" }
        ]
    },
    templates: {
        referenceShotRoot: "episodios/templates",
        referenceAssetRoot: "assets2D/templates",
        customTemplates: {
            shots: {
                compo: "",
                clean: "",
                ia_prep: "",
                "3d": ""
            },
            assets: {
                model: "",
                texture: "",
                rig: "",
                concepts: ""
            }
        }
    }
};

window.CANONICAL_RESOLUTION_RULES = CANONICAL_RESOLUTION_RULES;
window.CANONICAL_BASE_PRESETS = CANONICAL_BASE_PRESETS;

const _pipetaAppDir = (typeof window !== 'undefined' && window.PIPETA_LOCAL_APP_DIR)
    ? window.PIPETA_LOCAL_APP_DIR
    : ((typeof window !== 'undefined' && window.IS_BETA_CHANNEL) ? "C:\\TOOLS\\APPS\\Pipeta_Beta" : "C:\\TOOLS\\APPS\\Pipeta");

const _pipetaDefaultExportPresetsPath = (typeof window !== 'undefined' && window.IS_BETA_CHANNEL)
    ? "Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta_Beta\\presets"
    : "Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets";

const settings = {
    isVisible: false,
    currentCategory: 'interfaz',
    projectSubTab: 'id_nombre',
    container: null,
    devMode: false,

    // UI Preferences
    defaultViewMode: 'local', // 'local' | 'drive' | 'server'
    defaultBrowserMode: 'split', // Read-only fallback (Split View is permanent)
    defaultSyncComparisonMode: 'drive', // 'drive' | 'server'
    localAccordionOpen: false,

    // Persistence Logic
    projects: [],
    currentProject: null,
    _activeWorkProjectBeforeSettings: null,
    _categoryRenderers: {},
    projectsPath: _pipetaAppDir + "\\presets\\Projects",
    configPath: _pipetaAppDir + "\\presets\\config.json",

    // Logging
    loggingEnabled: true,
    logsPath: _pipetaAppDir + "\\logs",

    // Copy Engine (auto | native)
    copyEngine: 'auto',
    exportPresetsPath: _pipetaDefaultExportPresetsPath,

    // Sync Configuration & State
    syncMode: 'auto',
    isFakeZ: false,
    centralServerPath: '',
    syncEnvData: null,
    syncCatalogsData: [],
    isLoadingSyncEnv: false,

    // --- PRESETS LOADING STATE ---
    presetsList: [],
    _presetsLoadedAt: 0,
    _presetsLoadingPromise: null,
    isMaximized: false,

    updateDevModeBanner: () => {
        const banner = document.getElementById('headerDevModeBanner');
        if (banner) {
            banner.style.display = settings.devMode ? 'flex' : 'none';
        }
    },

    toggleDevMode: (active) => {
        settings.devMode = !!active;
        settings.updateDevModeBanner();
        settings.render();
    },

    openExportPresetsTab: () => {
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('presets_allow_publish')) {
            alert("🔒 No tienes permisos para publicar o exportar presets.");
            return;
        }
        settings.open();
        settings.setCategory('exportar');
    },

    loadConfig: async () => {
        try {
            if (window.API && API.fs && API.fs.readFile) {
                const content = await API.fs.readFile(settings.configPath);
                if (content) {
                    const cfg = JSON.parse(content);
                    if (cfg.defaultViewMode) {
                        settings.defaultViewMode = (cfg.defaultViewMode === 'online') ? 'drive' : cfg.defaultViewMode;
                    }
                    if (cfg.defaultBrowserMode) settings.defaultBrowserMode = cfg.defaultBrowserMode;
                    if (cfg.defaultSyncComparisonMode) settings.defaultSyncComparisonMode = cfg.defaultSyncComparisonMode;

                    // Validation Presets
                    if (cfg.validationPresetAsset) settings.validationPresetAsset = cfg.validationPresetAsset;
                    if (cfg.validationPresetShot) settings.validationPresetShot = cfg.validationPresetShot;

                    // Logging
                    if (typeof cfg.loggingEnabled !== 'undefined') settings.loggingEnabled = cfg.loggingEnabled;
                    if (cfg.logsPath) settings.logsPath = cfg.logsPath;

                    // Sync & Storage Bridge
                    if (cfg.syncMode) settings.syncMode = cfg.syncMode;
                    if (typeof cfg.isFakeZ !== 'undefined') settings.isFakeZ = !!cfg.isFakeZ;
                    if (cfg.centralServerPath) settings.centralServerPath = cfg.centralServerPath;
                    if (cfg.centralServerUnc) settings.centralServerUnc = cfg.centralServerUnc;
                    if (cfg.centralServerUser) settings.centralServerUser = cfg.centralServerUser;
                    if (cfg.copyEngine) settings.copyEngine = cfg.copyEngine;
                }
            }
        } catch (e) {
            console.warn("No config file found or error loading:", e);
        }
    },

    saveConfig: async () => {
        const isBeta = (typeof window !== 'undefined' && (window.location.port === '3050' || window.location.port === '3005' || window.APP_VERSION?.includes('beta')));
        const defaultLogs = isBeta ? 'C:\\TOOLS\\APPS\\Pipeta_Beta\\logs' : 'C:\\TOOLS\\APPS\\Pipeta\\logs';
        const cfg = {
            defaultViewMode: settings.defaultViewMode || 'local',
            defaultBrowserMode: settings.defaultBrowserMode || 'split',
            defaultSyncComparisonMode: settings.defaultSyncComparisonMode || 'drive',
            validationPresetAsset: settings.validationPresetAsset || null,
            validationPresetShot: settings.validationPresetShot || null,
            loggingEnabled: settings.loggingEnabled,
            logsPath: settings.logsPath || defaultLogs,
            syncMode: settings.syncMode || 'auto',
            isFakeZ: !!settings.isFakeZ,
            centralServerPath: settings.centralServerPath || '',
            centralServerUnc: settings.centralServerUnc || '\\\\192.168.206.116\\Z',
            centralServerUser: settings.centralServerUser || '',
            copyEngine: settings.copyEngine || 'auto'
        };
        try {
            if (window.API && API.fs && API.fs.writeFile) {
                await API.fs.writeFile(settings.configPath, JSON.stringify(cfg, null, 2));
            }
            try {
                localStorage.setItem('pipeta_view_location_mode', cfg.defaultViewMode);
                localStorage.setItem('pipeta_browser_mode', cfg.defaultBrowserMode);
                localStorage.setItem('pipeta_sync_comparison_mode', cfg.defaultSyncComparisonMode);
            } catch(e){}
        } catch (e) {
            console.error("Error saving config:", e);
        }
    },

    init: async () => {
        settings.container = document.getElementById('settings-window');
        settings.devMode = false;
        try { localStorage.removeItem('pipeta_dev_mode'); } catch(e){}
        settings.updateDevModeBanner();
        await Promise.all([
            settings.loadProjects(),
            settings.loadConfig()
        ]);
        settings.updateHeaderProjectSelector();
        // Pre-cargar presets en segundo plano sin bloquear la apertura ni el arranque
        settings.loadPresets().catch(() => {});
    },

    triggerGearSpin: () => {
        const btnSettings = document.getElementById('btn-settings-toggle');
        if (!btnSettings) return;
        btnSettings.classList.remove('gear-clicking');
        void btnSettings.offsetWidth;
        btnSettings.classList.add('gear-clicking');
        if (settings._gearSpinTimer) clearTimeout(settings._gearSpinTimer);
        settings._gearSpinTimer = setTimeout(() => {
            btnSettings.classList.remove('gear-clicking');
        }, 450);
    },

    updateSidebarButtonsState: () => {
        const btnSettings = document.getElementById('btn-settings-toggle');
        const topButtons = document.querySelectorAll('.mode-sidebar .mode-btn');

        if (settings.isVisible) {
            if (btnSettings) btnSettings.classList.add('active');
            topButtons.forEach(b => b.classList.remove('active'));
        } else {
            if (btnSettings) btnSettings.classList.remove('active');
            // Restore active class on the current view's mode button
            const currentTabName = (typeof tabs !== 'undefined') ? Object.keys(tabs).find(k => {
                const el = document.getElementById(tabs[k]);
                return el && el.style.display !== 'none';
            }) : null;
            topButtons.forEach(btn => {
                if (currentTabName && btn.getAttribute('title') === currentTabName) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    },

    open: async () => {
        settings.triggerGearSpin();
        if (!settings.container) {
            settings.container = document.getElementById('settings-window');
        }
        // Record active work project BEFORE opening Settings so inspecting Proyecto Base never leaks
        if (settings.currentProject && !settings.isBaseProject(settings.currentProject)) {
            settings._activeWorkProjectBeforeSettings = settings.currentProject;
        }
        // Abrir la ventana de forma instantánea (0ms) en el primer frame
        settings.isVisible = true;
        settings.render();
        if (settings.container) settings.container.style.display = 'flex';
        settings.updateSidebarButtonsState();

        // Refrescar datos en segundo plano sin congelar la apertura de la UI
        if (!settings.projects || settings.projects.length === 0) {
            settings.init().then(() => {
                if (settings.isVisible) settings.render();
            });
        } else {
            settings.loadPresets().then(() => {
                if (settings.isVisible && (settings.currentCategory === 'proyecto' || settings.currentCategory === 'proyectos' || settings.currentCategory === 'avanzado')) {
                    settings.render();
                }
            });
        }
    },

    toggleOpen: async () => {
        settings.triggerGearSpin();
        if (settings.isVisible) {
            settings.close();
        } else {
            await settings.open();
        }
    },

    close() {
        settings.isVisible = false;
        if (settings.container) settings.container.style.display = 'none';
        settings.updateSidebarButtonsState();
        // Si se estaba inspeccionando/editando Proyecto Base en Configuraciones, restaurar el proyecto activo de trabajo
        if (settings.isBaseProject(settings.currentProject)) {
            const savedId = (typeof localStorage !== 'undefined') ? localStorage.getItem('pipeta_active_project_id') : null;
            let realProj = null;
            if (settings._activeWorkProjectBeforeSettings && !settings.isBaseProject(settings._activeWorkProjectBeforeSettings)) {
                realProj = settings.projects.find(p => p.id === settings._activeWorkProjectBeforeSettings.id && !settings.isBaseProject(p))
                    || settings._activeWorkProjectBeforeSettings;
            }
            if (!realProj) {
                realProj = settings.projects.find(p => p.id === savedId && !settings.isBaseProject(p))
                    || settings.projects.find(p => !settings.isBaseProject(p))
                    || null;
            }
            if (realProj) {
                settings.currentProject = realProj;
            }
            if (typeof settings.updateHeaderProjectSelector === 'function') {
                settings.updateHeaderProjectSelector();
            }
        }
    },

    switchCategory(cat) {
        if (cat === 'avanzado' && typeof window.checkUserPermission === 'function' && !window.checkUserPermission('settings_allow_advanced')) {
            cat = 'interfaz';
        }
        settings.currentCategory = cat;
        if (cat === 'proyecto' || cat === 'proyectos' || cat === 'avanzado') {
            settings.loadPresets().then(() => {
                if (settings.currentCategory === cat) settings.render();
            });
        }
        settings.render();
    },

    toggleMaximize() {
        settings.isMaximized = !settings.isMaximized;
        if (settings.container) {
            settings.container.classList.toggle('maximized', settings.isMaximized);
        }
        settings.updateSidebarButtonsState();
        settings.render();
    },

    render() {
        if (!settings.container) return;

        settings.container.innerHTML = `
            <div class="settings-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="icons/settings.svg" style="width:22px; height:22px;">
                    <h2 style="margin:0; font-size:1.2rem;">Configuraciones</h2>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <button class="icon-btn" onclick="settings.toggleMaximize()" title="${settings.isMaximized ? 'Restaurar a Ventana' : 'Maximizar a Canvas Completo'}" style="background:transparent; border:none; color:#aaa; font-size:1rem; cursor:pointer; padding:4px 8px;">
                        ${settings.isMaximized ? '🗗' : '🗖'}
                    </button>
                    <button class="icon-btn" onclick="settings.close()">&times;</button>
                </div>
            </div>
            
            <div class="settings-body">
                <div class="settings-sidebar">
                    ${settings.renderMenu()}
                </div>
                
                <div class="settings-content">
                    ${settings.renderCategoryContent()}
                </div>
            </div>
            
            <div class="settings-footer">
                <button class="btn" style="background:#333; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;" onclick="settings.close()">Cerrar</button>
                <button class="btn btn-primary" style="background:var(--accent); color:black; border:none; padding:8px 15px; border-radius:4px; font-weight:bold; cursor:pointer;" onclick="settings.saveAll()">Guardar Cambios</button>
            </div>
        `;
        settings.updateHeaderProjectSelector();
    },

    renderMenu() {
        const canAdvanced = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('settings_allow_advanced') : true;
        const canPublish = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('presets_allow_publish') : true;
        const canZip = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('export_portable_zip') : true;

        const items = [
            { id: 'interfaz', label: '🎨 Interfaz' },
            { id: 'shortcuts', label: '⌨️ Atajos de Teclado' },
            { id: 'proyecto', label: '📁 Proyectos' },
            { id: 'ia_ingest', label: '🤖 IA Ingest' },
            { id: 'users', label: '👤 User Settings', restricted: true },
            { id: 'sincronizacion', label: '⚡ Sincronización' },
            ...(canAdvanced ? [{ id: 'avanzado', label: '⚙️ Avanzado' }] : []),
            ...((canPublish || canZip) ? [{ id: 'exportar', label: '📦 Update / Export Presets' }] : []),
            { id: 'version', label: '🚀 Versión / Patch Notes' }
        ];

        return items.map(i => `
            <div class="settings-nav-item ${settings.currentCategory === i.id ? 'active' : ''}" 
                 onclick="settings.setCategory('${i.id}')"
                 style="padding:10px; cursor:pointer; margin-bottom:5px; border-radius:4px; display:flex; justify-content:space-between; align-items:center; background:${settings.currentCategory === i.id ? 'rgba(255,255,255,0.1)' : 'transparent'}; color:${settings.currentCategory === i.id ? 'white' : '#888'};">
                <span>${i.label}</span>
                ${i.restricted ? `<span style="font-size:0.75rem; opacity:0.6;" title="Requiere contraseña Admin">🔒</span>` : ''}
            </div>
        `).join('');
    },

    isAdminUnlocked() {
        if (settings.adminUnlocked) return true;
        try {
            if (localStorage.getItem('pipeta_admin_unlocked') === 'true') {
                settings.adminUnlocked = true;
                return true;
            }
        } catch(e){}
        return false;
    },

    promptAdminPassword(targetCat) {
        const pass = prompt("🔒 Ingrese la contraseña de Administrador de Pipeta:");
        if (!pass) return;

        API.users.verifyAdmin(pass).then(res => {
            if (res && res.authorized) {
                settings.adminUnlocked = true;
                const remember = confirm("¿Deseas recordar la sesión de Administrador en este equipo?");
                if (remember) {
                    try { localStorage.setItem('pipeta_admin_unlocked', 'true'); } catch(e){}
                }
                settings.currentCategory = targetCat;
                settings.render();
            } else {
                alert("❌ Contraseña de Administrador incorrecta.");
            }
        }).catch(err => {
            alert("Error al verificar contraseña: " + err.message);
        });
    },

    setCategory(cat) {
        if (cat === 'statuses' || cat === 'workflow') {
            cat = 'avanzado';
            settings.localAccordionOpen = true;
        }

        if (cat === 'avanzado' && typeof window.checkUserPermission === 'function' && !window.checkUserPermission('settings_allow_advanced')) {
            alert("🔒 Configuraciones avanzadas bloqueadas por política de usuario.");
            return;
        }

        if (cat === 'exportar' && typeof window.checkUserPermission === 'function' && !window.checkUserPermission('presets_allow_publish') && !window.checkUserPermission('export_portable_zip')) {
            alert("🔒 Esta sección se encuentra restringida por política de usuario.");
            return;
        }

        const restricted = ['users'];
        if (restricted.includes(cat) && !settings.isAdminUnlocked()) {
            settings.promptAdminPassword(cat);
            return;
        }

        settings.currentCategory = cat;
        if (cat === 'users') {
            settings.loadUsersConfig().then(() => settings.render());
        } else if (cat === 'sincronizacion') {
            settings.loadSyncEnvironment().then(() => settings.render());
        } else if (cat === 'proyecto' || cat === 'proyectos') {
            settings.loadPresets().then(() => {
                if (settings.currentCategory === cat) settings.render();
            });
        } else if (cat === 'avanzado') {
            Promise.all([settings.loadPresets(), settings.loadStatusesConfig()]).then(() => {
                if (settings.currentCategory === cat) settings.render();
            });
        }
        settings.render();
    },

    updateGlobalProp(prop, value) {
        settings[prop] = value;
        settings.render();
    },

    renderCategoryContent() {
        const renderer = settings._categoryRenderers && settings._categoryRenderers[settings.currentCategory];
        if (typeof renderer === 'function') {
            return renderer();
        }
        return `<h3>Seleccione una categoría</h3>`;
    },

    closeModalOverlay: () => {
        const overlay = document.getElementById('pipeta-settings-modal-overlay');
        if (overlay) overlay.remove();
    },

    showConfirmModal: ({ title, icon = '⚠️', message, details = null, confirmText = 'Confirmar', confirmColor = 'var(--accent)', confirmTextColor = '#000', onConfirm }) => {
        settings.closeModalOverlay();

        const overlay = document.createElement('div');
        overlay.id = 'pipeta-settings-modal-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(5,7,11,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; transform:translateZ(0); will-change:opacity;';

        overlay.innerHTML = `
            <div style="background:#14171e; border:1px solid #28303d; border-radius:8px; width:480px; max-width:92vw; padding:22px; box-shadow:0 10px 30px rgba(0,0,0,0.8); color:#eee;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #28303d; padding-bottom:12px; margin-bottom:16px;">
                    <b style="font-size:1.05rem; color:${confirmColor}; display:flex; align-items:center; gap:8px;">
                        <span>${icon}</span>
                        <span>${title}</span>
                    </b>
                    <button class="icon-btn" onclick="settings.closeModalOverlay()" style="background:transparent; border:none; color:#888; font-size:1.2rem; cursor:pointer;">&times;</button>
                </div>

                <div style="font-size:0.85rem; color:#ccc; margin-bottom:${details ? '12px' : '20px'}; line-height:1.5;">
                    ${message}
                </div>

                ${details ? `
                    <div style="background:#1c222d; border:1px solid #2e3846; border-radius:6px; padding:12px; margin-bottom:20px; font-size:0.8rem; color:#bbb;">
                        ${details}
                    </div>
                ` : ''}

                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn" onclick="settings.closeModalOverlay()" style="background:#222; color:#ccc; border:1px solid #444; border-radius:4px; padding:8px 18px; cursor:pointer;">Cancelar</button>
                    <button id="modal-confirm-btn" class="btn" style="background:${confirmColor}; color:${confirmTextColor}; font-weight:bold; border:none; border-radius:4px; padding:8px 22px; cursor:pointer;">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const confirmBtn = document.getElementById('modal-confirm-btn');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                settings.closeModalOverlay();
                if (typeof onConfirm === 'function') await onConfirm();
            };
        }
    },

    showToast: (message, type = 'success', durationSec = 5, subtext = null) => {
        const existing = document.getElementById('settings-save-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'settings-save-toast';
        const isSuccess = type === 'success';
        const isError = type === 'error';
        const isWarn = type === 'warn';

        const bg = isSuccess ? '#1b5e20' : (isError ? '#b71c1c' : (isWarn ? '#e65100' : '#263238'));
        const border = isSuccess ? '#4caf50' : (isError ? '#f44336' : (isWarn ? '#ff9800' : '#90a4ae'));
        const icon = isSuccess ? '✅' : (isError ? '❌' : (isWarn ? '⚠️' : 'ℹ️'));
        const timerColor = isSuccess ? '#a5d6a7' : (isError ? '#ef9a9a' : (isWarn ? '#ffe0b2' : '#cfd8dc'));

        toast.style.cssText = `position:fixed; bottom:65px; right:20px; background:${bg}; border:1px solid ${border}; color:#fff; padding:12px 20px; border-radius:6px; font-size:0.85rem; display:flex; align-items:center; gap:12px; box-shadow:0 6px 24px rgba(0,0,0,0.7); z-index:99999; animation:fadeIn 0.2s ease; max-width:480px;`;

        let secondsLeft = durationSec;
        toast.innerHTML = `
            <span style="font-size:1.3rem;">${icon}</span>
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:0.88rem;">${message}</div>
                ${subtext ? `<div style="font-size:0.75rem; color:#eee; margin-top:2px;">${subtext}</div>` : ''}
                <div id="settings-toast-timer" style="font-size:0.72rem; color:${timerColor}; margin-top:3px;">Este cartel se cerrará en ${secondsLeft}s</div>
            </div>
            <button onclick="document.getElementById('settings-save-toast')?.remove()" 
                    style="background:transparent; border:none; color:#fff; font-size:1.2rem; cursor:pointer; padding:0 4px; line-height:1; margin-left:8px;" 
                    title="Cerrar aviso">&times;</button>
        `;

        document.body.appendChild(toast);

        const timerInterval = setInterval(() => {
            secondsLeft--;
            const timerEl = document.getElementById('settings-toast-timer');
            if (timerEl) {
                timerEl.innerText = `Este cartel se cerrará en ${secondsLeft}s`;
            }
            if (secondsLeft <= 0) {
                clearInterval(timerInterval);
                const t = document.getElementById('settings-save-toast');
                if (t) t.remove();
            }
        }, 1000);
    },

    showSaveToast: () => {
        settings.showToast("Configuraciones guardadas correctamente", "success", 3);
    },

    saveAll: async () => {
        // Save currently active project to disk
        if (settings.currentProject) {
            await settings.saveProject();
        }
        await settings.saveConfig();
        settings.updateHeaderProjectSelector();

        // Mostrar cartel de éxito con 3s de autocierre o cierre manual sin cerrar la ventana
        settings.showSaveToast();
    }
};

window.settings = settings;
