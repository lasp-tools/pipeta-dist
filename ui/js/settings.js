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

const settings = {
    isVisible: false,
    currentCategory: 'interfaz',
    projectSubTab: 'id_nombre',
    container: null,
    devMode: false,

    // UI View Preferences
    defaultViewMode: 'local', // 'local' | 'drive' | 'server'
    defaultBrowserMode: 'split', // 'split' (Vista Clásica) | 'pipeta' (Miller View)
    defaultSyncComparisonMode: 'drive', // 'drive' | 'server'
    localAccordionOpen: false,

    // Persistence Logic
    projects: [],
    currentProject: null,
    projectsPath: (typeof window !== 'undefined' && (window.location.port === '3050' || window.location.port === '3005' || window.APP_VERSION?.includes('beta'))) ? "C:\\TOOLS\\APPS\\Pipeta_Beta\\presets\\Projects" : "C:\\TOOLS\\APPS\\Pipeta\\presets\\Projects",
    configPath: (typeof window !== 'undefined' && (window.location.port === '3050' || window.location.port === '3005' || window.APP_VERSION?.includes('beta'))) ? "C:\\TOOLS\\APPS\\Pipeta_Beta\\presets\\config.json" : "C:\\TOOLS\\APPS\\Pipeta\\presets\\config.json",

    // Logging
    loggingEnabled: true,
    logsPath: (typeof window !== 'undefined' && (window.location.port === '3050' || window.location.port === '3005' || window.APP_VERSION?.includes('beta'))) ? "C:\\TOOLS\\APPS\\Pipeta_Beta\\logs" : "C:\\TOOLS\\APPS\\Pipeta\\logs",

    // Copy Engine (auto | native)
    copyEngine: 'auto',
    exportPresetsPath: "Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets",

    // Sync Configuration & State
    syncMode: 'auto',
    isFakeZ: false,
    centralServerPath: '',
    syncEnvData: null,
    syncCatalogsData: [],
    isLoadingSyncEnv: false,

    // --- PRESETS LOADING ---
    presetsList: [],

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

    _presetsLoadedAt: 0,
    _presetsLoadingPromise: null,

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
            const localBasePath = "C:\\TOOLS\\APPS\\Pipeta\\presets";
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

    // --- PERSISTENCE ---
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
            settings.currentProject = proj;
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('system', `Proyecto activo: ${proj.name || proj.id} (Cliente: ${proj.client || '-'})`, 'info');
            }
            settings.render();
            settings.updateHeaderProjectSelector();
        }
    },

    updateHeaderProjectSelector: () => {
        const select = document.getElementById('headerProjectSelect');
        if (!select) return;
        select.innerHTML = '';
        if (!settings.projects || settings.projects.length === 0) {
            select.innerHTML = '<option value="">(Sin proyectos)</option>';
            return;
        }

        // Filtrar Proyecto Base: no debe mostrarse en el selector de la barra superior
        const visibleProjects = settings.projects.filter(p => !settings.isBaseProject(p));

        if (visibleProjects.length === 0) {
            select.innerHTML = '<option value="">(Sin proyectos configurados)</option>';
            return;
        }

        // Determinar qué proyecto debe figurar seleccionado
        const savedId = localStorage.getItem('pipeta_active_project_id');
        let selectedProj = visibleProjects.find(p => p.id === savedId);
        if (!selectedProj) {
            if (settings.currentProject && !settings.isBaseProject(settings.currentProject)) {
                selectedProj = settings.currentProject;
            } else {
                selectedProj = visibleProjects[0];
            }
        }

        // Si currentProject era base o nulo, sincronizar con el seleccionado real
        if (!settings.currentProject || settings.isBaseProject(settings.currentProject)) {
            settings.currentProject = selectedProj;
            if (selectedProj) {
                localStorage.setItem('pipeta_active_project_id', selectedProj.id);
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
                await loadActiveProjectSyncCatalog(true);
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

    testUncConnection: async () => {
        const uncInput = document.getElementById('setting-central-server-unc');
        const userInput = document.getElementById('setting-central-server-user');
        const passInput = document.getElementById('setting-central-server-pass');

        const uncPath = (uncInput?.value || '\\\\192.168.206.116\\Z').trim();
        const user = (userInput?.value || '').trim();
        const pass = passInput?.value || '';

        settings.centralServerUnc = uncPath;
        settings.centralServerUser = user;
        settings.saveConfig();

        if (typeof settings.showToast === 'function') {
            settings.showToast(`Probando conexión con ${uncPath}...`, 'info', 6);
        }

        try {
            const res = await fetch('/api/server/connect-unc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uncPath, user, pass })
            }).then(r => r.json());

            if (res && res.success && res.accessible) {
                if (typeof settings.showToast === 'function') {
                    settings.showToast('✅ Conexión SMB Exitosa', 'success', 5, `Acceso validado a ${res.connectedTo}`);
                } else {
                    alert(`✅ Conexión SMB exitosa a: ${res.connectedTo}`);
                }
            } else if (res && res.success) {
                alert(`⚠️ Sesión establecida con ${res.connectedTo}, pero el recurso no responde lectura inmediata.`);
            } else {
                alert(`❌ Error conectando a ${uncPath}:\n${res?.error || 'No se pudo conectar'}`);
            }
        } catch (e) {
            alert(`❌ Error de red: ${e.message}`);
        }
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
    },

    isMaximized: false,
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

    loadSyncEnvironment: async (force = false) => {
        settings.isLoadingSyncEnv = true;
        try {
            const resEnv = await fetch('/api/sync/detect-env' + (force ? '?force=true' : ''));
            if (resEnv.ok) {
                settings.syncEnvData = await resEnv.json();
                window.pipetaSystemEnv = settings.syncEnvData;
                try { localStorage.setItem('pipeta_system_env', JSON.stringify(settings.syncEnvData)); } catch(e){}
            }
            const resCat = await fetch('/api/sync/catalogs');
            if (resCat.ok) {
                const dataCat = await resCat.json();
                settings.syncCatalogsData = dataCat.catalogs || [];
            }
            const resWorker = await fetch('/api/sync/worker-status');
            if (resWorker.ok) {
                const dataWorker = await resWorker.json();
                settings.syncWorkerStatus = dataWorker.status || null;
            }
        } catch(e) {
            console.error("Error loading sync environment:", e);
        } finally {
            settings.isLoadingSyncEnv = false;
            if (settings.currentCategory === 'sincronizacion') {
                settings.render();
            }
        }
    },

    reDetectSyncEnvironment: async () => {
        settings.isLoadingSyncEnv = true;
        settings.render();
        try {
            await settings.loadSyncEnvironment(true);
            if (typeof settings.showToast === 'function') {
                settings.showToast('Entorno re-detectado correctamente', 'success', 3);
            }
        } catch (e) {
            console.error('Error re-detecting sync environment:', e);
            if (typeof settings.showToast === 'function') {
                settings.showToast('Error re-detectando entorno', 'error', 3);
            }
        } finally {
            settings.isLoadingSyncEnv = false;
            settings.render();
        }
    },

    setLocationMode: async (mode) => {
        settings.isLoadingSyncEnv = true;
        settings.render();
        try {
            const res = await fetch('/api/sync/set-location-mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
            const data = await res.json();
            if (data.success && data.env) {
                settings.syncEnvData = data.env;
                window.pipetaSystemEnv = data.env;
                try { localStorage.setItem('pipeta_location_mode', mode); } catch(e){}
                const label = mode === 'studio' ? '🏢 ESTUDIO / SEDE' : (mode === 'home' ? '🏠 HOME OFFICE' : '🤖 AUTO-DETECTAR');
                if (typeof settings.showToast === 'function') {
                    settings.showToast(`Modo configurado: ${label}`, 'success', 3);
                }
            }
        } catch (e) {
            console.error('Error setting location mode:', e);
            if (typeof settings.showToast === 'function') {
                settings.showToast('Error al cambiar modo de ubicación', 'error', 3);
            }
        } finally {
            settings.isLoadingSyncEnv = false;
            settings.render();
        }
    },


    generateProjectCatalogNow: async (projectName) => {
        if (!projectName) return;
        if (settings.isGeneratingCatalog) {
            settings.showToast(`Ya se está escaneando el catálogo de "${projectName}". Por favor espera...`, 'warning', 4);
            return;
        }
        settings.isGeneratingCatalog = true;
        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `Iniciando escaneo de Google Drive para '${projectName}' (~30s)...`, 'pending');
        }
        settings.showToast(`Escaneando Google Drive para "${projectName}"... Puede tardar unos 25-35s.`, 'info', 45, 'Indexando unidades compartidas');
        settings.render();

        try {
            const res = await fetch('/api/sync/catalog/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: projectName, mode: settings.syncMode || 'auto' })
            });
            const data = await res.json();
            if (data.success) {
                // Invalidar caché del frontend completamente para que se reflejen los cambios al instante
                window.pipetaSyncCatalog = null;
                if (typeof loadActiveProjectSyncCatalog === 'function') {
                    await loadActiveProjectSyncCatalog(true);
                }
                if (typeof refreshCurrentView === 'function') {
                    refreshCurrentView();
                }
                const count = data.stats?.totalFiles || data.summary?.totalFiles || 0;
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `✓ Catálogo de Google Drive para '${projectName}' indexado con éxito (${count} archivos)`, 'ok');
                }
                settings.showToast(`✅ Catálogo para "${projectName}" actualizado con éxito.`, 'success', 6, `${count} archivos indexados`);
                await settings.loadSyncEnvironment();
            } else {
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `❌ Error indexando catálogo de '${projectName}': ${data.error}`, 'error');
                }
                settings.showToast(`❌ Error al indexar catálogo: ${data.error}`, 'error', 6);
            }
        } catch(e) {
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `❌ Fallo de conexión indexando catálogo: ${e.message}`, 'error');
            }
            settings.showToast(`❌ Error de conexión: ${e.message}`, 'error', 6);
        } finally {
            settings.isGeneratingCatalog = false;
            settings.render();
        }
    },

    updateGlobalProp(prop, value) {
        settings[prop] = value;
        settings.render();
    },

    renderCategoryContent() {
        switch (settings.currentCategory) {
            case 'shortcuts':
                return `
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px; display:flex; align-items:center; gap:8px;">
                        <span>⌨️ Asignaciones de Teclas & Atajos (Hotkeys)</span>
                    </h3>
                    <p style="color:#888; margin-bottom:20px; font-size:0.9rem;">
                        Referencia de atajos de teclado y acciones rápidas disponibles en cada módulo de Pipeta.
                    </p>

                    <div style="display:flex; flex-direction:column; gap:20px;">
                        <!-- SHOT & ASSET DESIGNER -->
                        <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:8px; border:1px solid #333;">
                            <div style="font-weight:bold; color:var(--accent); margin-bottom:12px; font-size:0.95rem;">
                                📐 Shot Designer & Asset Designer (Canvas de Nodos)
                            </div>
                            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                                <thead>
                                    <tr style="border-bottom:1px solid #444; color:#aaa; text-align:left;">
                                        <th style="padding:6px 10px; width:230px;">Atajo / Acción</th>
                                        <th style="padding:6px 10px;">Descripción y Comportamiento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#ffca28; font-weight:bold;">Ctrl + Z</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;"><b>Deshacer (Undo):</b> Revierte la última acción (mover, agregar, borrar, modificar)</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#ffca28; font-weight:bold;">Ctrl + Y</kbd> / <kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#ffca28; font-weight:bold;">Ctrl + Shift + Z</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;"><b>Rehacer (Redo):</b> Restaura la última acción deshecha</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#4fc3f7; font-weight:bold;">Ctrl + D</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Duplicar nodo(s) seleccionado(s) manteniendo conexiones relativas</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#4fc3f7; font-weight:bold;">Ctrl + C</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Copiar nodo(s) seleccionado(s) al portapapeles del diseñador</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#4fc3f7; font-weight:bold;">Ctrl + V</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Pegar nodo(s) copiados con desplazamiento automático en el canvas</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#ba68c8; font-weight:bold;">Ctrl + Shift + C</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;"><b>Copiar Configuración:</b> Copia todos los atributos y configuraciones del nodo seleccionado</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#ba68c8; font-weight:bold;">Ctrl + Shift + V</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;"><b>Pegar Configuración:</b> Aplica las configuraciones copiadas manteniendo el nombre y ejemplo del nodo destino</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#81c784; font-weight:bold;">Doble Clic</kbd> o <kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#81c784; font-weight:bold;">Enter</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Renombrar nodo directamente en el canvas (inline, sin ventanas)</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#f06292; font-weight:bold;">Supr</kbd> / <kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#f06292; font-weight:bold;">Backspace</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Borrar nodo(s) seleccionado(s) del preset</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#ffb74d; font-weight:bold;">Shift + Clic</kbd> / <kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#ffb74d; font-weight:bold;">Ctrl + Clic</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Selección múltiple o deselección individual de nodos</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#bbb;">Arrastrar Nodo</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Mueve todos los nodos seleccionados en bloque manteniendo distancias</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#bbb;">Rueda del Ratón</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Zoom In / Zoom Out fluido en el canvas</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#bbb;">Espacio + Arrastrar</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Desplazamiento / Panning por el canvas</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#bbb;">Escape</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Cancelar edición de nombre inline / deseleccionar nodos</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- EXPLORER & GLOBAL -->
                        <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:8px; border:1px solid #333;">
                            <div style="font-weight:bold; color:#4fc3f7; margin-bottom:12px; font-size:0.95rem;">
                                🗂️ Explorer, Navegación & IA Ingest
                            </div>
                            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                                <thead>
                                    <tr style="border-bottom:1px solid #444; color:#aaa; text-align:left;">
                                        <th style="padding:6px 10px; width:230px;">Atajo</th>
                                        <th style="padding:6px 10px;">Módulo / Descripción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#4fc3f7; font-weight:bold;">Ctrl + C</kbd> / <kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#4fc3f7; font-weight:bold;">Ctrl + V</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;"><b>Explorer:</b> Copiar y pegar archivos o carpetas seleccionadas</td>
                                    </tr>
                                    <tr style="border-bottom:1px solid #2a2a2a;">
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#4fc3f7; font-weight:bold;">Ctrl + V</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;"><b>IA Ingest:</b> Pegar imagen capturada desde el portapapeles de Windows</td>
                                    </tr>
                                    <tr>
                                        <td style="padding:8px 10px;"><kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#bbb;">F5</kbd> / <kbd style="background:#222; border:1px solid #555; padding:2px 6px; border-radius:3px; color:#bbb;">Ctrl + R</kbd></td>
                                        <td style="padding:8px 10px; color:#ccc;">Recargar vista y estado de la aplicación</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            case 'sincronizacion':
                const engine = settings.copyEngine || 'auto';
                const syncMode = settings.syncMode || 'auto';
                const isFakeZ = !!settings.isFakeZ;
                const env = settings.syncEnvData;
                const catalogs = settings.syncCatalogsData || [];
                const projects = settings.projects || [];
                const worker = settings.syncWorkerStatus;
                const locMode = env?.locationMode || localStorage.getItem('pipeta_location_mode') || 'auto';

                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
                        <div>
                            <h3 style="margin:0; color:#fff; display:flex; align-items:center; gap:8px;">
                                <span>Sincronización & Entorno de Red</span>
                            </h3>
                            <p style="color:#888; margin:4px 0 0 0; font-size:0.85rem;">
                                Detección inteligente de conectividad, catálogos offline para puestos sin internet y sincronización con almacenamiento central.
                            </p>
                        </div>
                        <button class="btn" onclick="settings.reDetectSyncEnvironment()" style="background:#222; border:1px solid #444; color:#4fc3f7; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.82rem; display:flex; align-items:center; gap:6px;">
                            <span>🔄</span> <span>${settings.isLoadingSyncEnv ? 'Analizando...' : 'Re-detectar Entorno'}</span>
                        </button>
                    </div>

                    <!-- SELECTOR DE PERFIL / MODO DE UBICACIÓN (ESTUDIO vs HOME) -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #384252; border-radius:8px; padding:12px 16px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                        <div>
                            <div style="font-weight:bold; color:#fff; font-size:0.88rem; display:flex; align-items:center; gap:8px;">
                                <span>📍 PERFIL DE UBICACIÓN:</span>
                                <span style="color:${locMode === 'studio' ? '#4caf50' : (locMode === 'home' ? '#ff9800' : 'var(--accent)')}; font-weight:bold;">
                                    ${locMode === 'studio' ? '🏢 Estudio / Sede' : (locMode === 'home' ? '🏠 Home Office' : 'Detección Automática')}
                                </span>
                            </div>
                            <div style="font-size:0.75rem; color:#888; margin-top:3px;">
                                ${locMode === 'studio' 
                                    ? 'Modo Estudio/Sede forzado: transferencias a cargo de la red (no auto-inicia Worker local).' 
                                    : (locMode === 'home' 
                                        ? 'Modo Home Office forzado: auto-inicia el Worker Local para subidas y descargas de Drive.' 
                                        : 'Detección automática por presencia de red local del estudio central.')}
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; background:#111; padding:4px; border-radius:6px; border:1px solid #282828;">
                            <button type="button" class="btn" onclick="settings.setLocationMode('studio')"
                                    style="padding:7px 15px; font-size:0.8rem; font-weight:bold; border-radius:4px; border:1px solid ${locMode === 'studio' ? '#4caf50' : 'transparent'}; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.15s;
                                    background:${locMode === 'studio' ? 'rgba(76,175,80,0.2)' : 'transparent'};
                                    color:${locMode === 'studio' ? '#81c784' : '#888'};">
                                <span>🏢</span> <span>ESTUDIO</span>
                            </button>
                            <button type="button" class="btn" onclick="settings.setLocationMode('home')"
                                    style="padding:7px 15px; font-size:0.8rem; font-weight:bold; border-radius:4px; border:1px solid ${locMode === 'home' ? '#ff9800' : 'transparent'}; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.15s;
                                    background:${locMode === 'home' ? 'rgba(255,152,0,0.2)' : 'transparent'};
                                    color:${locMode === 'home' ? '#ffb74d' : '#888'};">
                                <span>🏠</span> <span>HOME</span>
                            </button>
                            <button type="button" class="btn" onclick="settings.setLocationMode('auto')"
                                    style="padding:7px 12px; font-size:0.8rem; font-weight:bold; border-radius:4px; border:1px solid ${locMode === 'auto' ? '#4fc3f7' : 'transparent'}; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.15s;
                                    background:${locMode === 'auto' ? 'rgba(79,195,247,0.15)' : 'transparent'};
                                    color:${locMode === 'auto' ? '#4fc3f7' : '#888'};">
                                <span>🤖</span> <span>AUTO</span>
                            </button>
                        </div>
                    </div>

                    <!-- 1. DIAGNOSTICO EN TIEMPO REAL -->
                    <div style="background:rgba(255,255,255,0.02); border:1px solid #333; border-radius:8px; padding:15px; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); font-size:0.85rem; margin-bottom:10px; display:flex; justify-content:space-between;">
                            <span>ESTADO DEL ENTORNO LOCAL & CLOUD</span>
                            ${env ? `<span style="color:#888; font-weight:normal; font-size:0.75rem;">Recomendación: <b style="color:#4caf50;">${env.recommendedMode === 'online_gdrive' ? 'Google Drive G:' : (env.recommendedMode === 'online_rclone' ? 'Rclone Cloud' : 'Catálogo Offline')}</b></span>` : ''}
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">🌐 Acceso a Internet</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${env?.hasInternet ? '#4caf50' : (env ? '#f44336' : '#888')};">
                                    ${env?.hasInternet ? '● Online (Conectado)' : (env ? '● Offline (Aislado)' : 'Consultando...')}
                                </div>
                                <div style="font-size:0.7rem; color:#666; margin-top:2px;">
                                    ${env?.hasInternet ? 'Conexión verificada' : 'Guardado en este equipo (sin intentos web)'}
                                </div>
                            </div>
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">☁️ Google Drive Desktop (G:)</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${env?.hasDriveG ? '#4caf50' : '#888'};">
                                    ${env?.hasDriveG ? '● Detectado (G:/)' : '○ No Mapeado'}
                                </div>
                            </div>
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">🤖 Sync Worker Central</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${worker?.isAlive ? '#4caf50' : '#f44336'};">
                                    ${worker?.isAlive ? `● En Línea (${worker.hostname || 'VM 105'})` : '○ Desconectado'}
                                </div>
                                <div style="font-size:0.7rem; color:#666; margin-top:2px;">
                                    ${worker?.isAlive ? `Ping: hace ${worker.diffSeconds}s • ${worker.status}` : 'No detectado'}
                                </div>
                            </div>
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">💾 Disco Z: (Hardware)</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${env?.zInfo?.isRealServer ? '#4caf50' : '#ff9800'};">
                                    ${env?.zInfo?.isRealServer ? `● Servidor Real (${env.zInfo.target})` : (env?.zInfo?.type === 'subst' ? `● Virtual (${env.zInfo.target})` : (env?.zInfo ? `● Local (${env.zInfo.type})` : 'Consultando...'))}
                                </div>
                            </div>
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">📍 Modo Operativo</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${env?.isExternalMachine ? '#ff9800' : '#4caf50'};">
                                    ${env?.isExternalMachine ? '● Home Office (Worker Local)' : '● Estudio / Sede (Red Central)'}
                                </div>
                                <div style="font-size:0.7rem; color:#666; margin-top:2px;">
                                    ${locMode !== 'auto' ? `Forzado manualmente (${locMode.toUpperCase()})` : (env?.isExternalMachine ? 'Detectado: conexión remota' : 'Detectado: red de estudio')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 2. CONEXION DIRECTA SMB / UNC (SIN LETRA DE UNIDAD) -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:8px; padding:15px; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); font-size:0.9rem; margin-bottom:4px;">🌐 Conexión al Servidor Central (SMB / UNC sin letra)</div>
                        <div style="font-size:0.8rem; color:#888; margin-bottom:12px;">Para máquinas donde Z: es un disco virtual local. Permite copiar archivos directamente desde el almacenamiento central sin necesidad de montar unidades adicionales.</div>
                        
                        <div style="display:grid; grid-template-columns: 1fr 180px 180px auto; gap:10px; align-items:flex-end;">
                            <div>
                                <label style="font-size:0.75rem; color:#aaa; display:block; margin-bottom:4px;">Ruta UNC del Servidor:</label>
                                <input type="text" id="setting-central-server-unc" class="input" value="${escapeHtml(settings.centralServerUnc || '\\\\192.168.206.116\\Z')}" 
                                       style="width:100%; background:#111; border:1px solid #333; color:#fff; padding:6px 8px; border-radius:4px; font-family:monospace; font-size:0.82rem;"
                                       onchange="settings.centralServerUnc=this.value.trim(); settings.saveConfig();">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#aaa; display:block; margin-bottom:4px;">Usuario (opcional):</label>
                                <input type="text" id="setting-central-server-user" class="input" value="${escapeHtml(settings.centralServerUser || '')}" placeholder="ej. lasp-artista"
                                       style="width:100%; background:#111; border:1px solid #333; color:#fff; padding:6px 8px; border-radius:4px; font-size:0.82rem;"
                                       onchange="settings.centralServerUser=this.value.trim(); settings.saveConfig();">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#aaa; display:block; margin-bottom:4px;">Contraseña:</label>
                                <input type="password" id="setting-central-server-pass" class="input" placeholder="••••••••"
                                       style="width:100%; background:#111; border:1px solid #333; color:#fff; padding:6px 8px; border-radius:4px; font-size:0.82rem;">
                            </div>
                            <button type="button" class="btn" onclick="settings.testUncConnection()" 
                                    style="background:#222; border:1px solid var(--accent); color:var(--accent); font-weight:bold; padding:6px 14px; border-radius:4px; cursor:pointer; font-size:0.8rem; height:33px; white-space:nowrap;">
                                🔌 Probar Conexión
                            </button>
                        </div>
                    </div>

                    <!-- 3. MOTOR DE TRANSFERENCIA EN BACKGROUND -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:8px; padding:15px; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:10px; font-size:0.9rem;">Motor de Transferencia en Background</div>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <label style="display:flex; gap:12px; cursor:pointer; padding:8px 10px; border-radius:4px; align-items:flex-start;">
                                <input type="radio" name="copyEngine" value="auto" ${engine === 'auto' ? 'checked' : ''} onchange="settings.updateGlobalProp('copyEngine', 'auto')" style="margin-top:3px;">
                                <div>
                                    <div style="font-weight:bold; color:#eee; font-size:0.85rem;">Automático (Recomendado)</div>
                                    <div style="font-size:0.8rem; color:#888; margin-top:2px;">Usa Rclone si está disponible para máxima velocidad; si no, copia nativa de Windows.</div>
                                </div>
                            </label>
                            <label style="display:flex; gap:12px; cursor:pointer; padding:8px 10px; border-radius:4px; align-items:flex-start;">
                                <input type="radio" name="copyEngine" value="rclone" ${engine === 'rclone' ? 'checked' : ''} onchange="settings.updateGlobalProp('copyEngine', 'rclone')" style="margin-top:3px;">
                                <div>
                                    <div style="font-weight:bold; color:#4fc3f7; font-size:0.85rem;">Forzar Rclone</div>
                                    <div style="font-size:0.8rem; color:#888; margin-top:2px;">Intenta usar siempre Rclone.</div>
                                </div>
                            </label>
                            <label style="display:flex; gap:12px; cursor:pointer; padding:8px 10px; border-radius:4px; align-items:flex-start;">
                                <input type="radio" name="copyEngine" value="native" ${engine === 'native' ? 'checked' : ''} onchange="settings.updateGlobalProp('copyEngine', 'native')" style="margin-top:3px;">
                                <div>
                                    <div style="font-weight:bold; color:#ff9800; font-size:0.85rem;">Forzar Copia Nativa (Windows)</div>
                                    <div style="font-size:0.8rem; color:#888; margin-top:2px;">Usa siempre el sistema de archivos de Windows.</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- 4. ENTORNO DE DISCO Z & OVERRIDE DE DESARROLLO (ABAJO DE TODO, SIN ICONOS) -->
                    ${(() => {
                        const currentOverride = window.zEnvOverride || 'auto';
                        const detectedLabel = typeof getZEnvStatusLabel === 'function' ? getZEnvStatusLabel() : 'Detectando...';
                        return `
                        <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:8px; padding:15px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <div>
                                    <div style="font-weight:bold; color:#fff; font-size:0.9rem; display:flex; align-items:center; gap:8px;">
                                        <span>Entorno de Disco Z: (Detección & Override)</span>
                                        <span style="font-size:0.75rem; background:#1c2430; color:#88c0d0; padding:2px 6px; border-radius:4px;">${detectedLabel}</span>
                                    </div>
                                    <div style="font-size:0.8rem; color:#888; margin-top:3px;">
                                        Pipeta detecta automáticamente si tu Z: es el servidor real de red o un disco local/vsubst. Puedes forzar un modo manualmente para desarrollo o pruebas.
                                    </div>
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-top:12px;">
                                <label style="display:flex; gap:10px; cursor:pointer; padding:10px; border-radius:6px; border:1px solid ${currentOverride === 'auto' ? 'var(--accent)' : '#282828'}; background:${currentOverride === 'auto' ? 'rgba(255,255,255,0.05)' : '#111'};">
                                    <input type="radio" name="zEnvOverride" value="auto" ${currentOverride === 'auto' ? 'checked' : ''} 
                                           onchange="window.zEnvOverride='auto'; localStorage.setItem('pipeta_z_env_override', 'auto'); settings.render(); if (typeof updateHeaderTools==='function') updateHeaderTools('view-browser');" style="margin-top:2px;">
                                    <div>
                                        <div style="font-weight:bold; color:#eee; font-size:0.85rem;">Auto-detectar (Recomendado)</div>
                                        <div style="font-size:0.76rem; color:#888; margin-top:2px;">Usa comandos nativos de Windows para identificar red vs vsubst.</div>
                                    </div>
                                </label>
                                <label style="display:flex; gap:10px; cursor:pointer; padding:10px; border-radius:6px; border:1px solid ${currentOverride === 'force_real' ? '#4caf50' : '#282828'}; background:${currentOverride === 'force_real' ? 'rgba(76,175,80,0.1)' : '#111'};">
                                    <input type="radio" name="zEnvOverride" value="force_real" ${currentOverride === 'force_real' ? 'checked' : ''} 
                                           onchange="window.zEnvOverride='force_real'; localStorage.setItem('pipeta_z_env_override', 'force_real'); settings.render(); if (typeof updateHeaderTools==='function') updateHeaderTools('view-browser');" style="margin-top:2px;">
                                    <div>
                                        <div style="font-weight:bold; color:#4caf50; font-size:0.85rem;">Forzar: Z es Servidor Real</div>
                                        <div style="font-size:0.76rem; color:#888; margin-top:2px;">Trata a Z: como almacenamiento central del estudio.</div>
                                    </div>
                                </label>
                                <label style="display:flex; gap:10px; cursor:pointer; padding:10px; border-radius:6px; border:1px solid ${currentOverride === 'force_fake' ? '#ff9800' : '#282828'}; background:${currentOverride === 'force_fake' ? 'rgba(255,152,0,0.1)' : '#111'};">
                                    <input type="radio" name="zEnvOverride" value="force_fake" ${currentOverride === 'force_fake' ? 'checked' : ''} 
                                           onchange="window.zEnvOverride='force_fake'; localStorage.setItem('pipeta_z_env_override', 'force_fake'); settings.render(); if (typeof updateHeaderTools==='function') updateHeaderTools('view-browser');" style="margin-top:2px;">
                                    <div>
                                        <div style="font-weight:bold; color:#ff9800; font-size:0.85rem;">Forzar: Z es Falso / Scratch Local</div>
                                        <div style="font-size:0.76rem; color:#888; margin-top:2px;">Habilita vista SERVER para consultar el catálogo del Servidor Central.</div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        `;
                    })()}
                `;

            case 'proyecto':
                const canEditProjects = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('projects_allow_edit') : true;
                const cp = settings.currentProject;
                const baseProj = settings.getBaseProject();
                const isBase = cp?.id === 'proj_base' || cp?.isBase;

                // Asegurar estructura de presets en Base
                if (isBase && cp) {
                    if (!cp.iaPresets) cp.iaPresets = {};
                    if (!cp.iaPresets.motorsVideo) cp.iaPresets.motorsVideo = CANONICAL_BASE_PRESETS.iaPresets.motorsVideo;
                    if (!cp.iaPresets.motorsImage) cp.iaPresets.motorsImage = CANONICAL_BASE_PRESETS.iaPresets.motorsImage;
                    if (!cp.iaPresets.framings) cp.iaPresets.framings = CANONICAL_BASE_PRESETS.iaPresets.framings;
                    if (!cp.iaPresets.tagsA) cp.iaPresets.tagsA = CANONICAL_BASE_PRESETS.iaPresets.tagsA;
                    if (!cp.iaPresets.tagsB) cp.iaPresets.tagsB = CANONICAL_BASE_PRESETS.iaPresets.tagsB;
                    if (!cp.iaPresets.tagsC) cp.iaPresets.tagsC = CANONICAL_BASE_PRESETS.iaPresets.tagsC;
                    if (!cp.iaPresets.resolutionTranslations) cp.iaPresets.resolutionTranslations = CANONICAL_BASE_PRESETS.iaPresets.resolutionTranslations;
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
                        <h4 style="margin-top:0; color:var(--accent); text-transform:uppercase; font-size:0.9rem; margin-bottom:15px;">
                            ${isBase ? 'Rutas de Ejemplo (Visuales en Base)' : 'Rutas Locales (Z:)'}
                        </h4>
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
                    const motorsVideo = effectiveIaPresets?.motorsVideo || CANONICAL_BASE_PRESETS.iaPresets.motorsVideo;
                    const motorsImage = effectiveIaPresets?.motorsImage || CANONICAL_BASE_PRESETS.iaPresets.motorsImage;
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

                        <!-- Columna 2: Sub-menú de Secciones (Miller View) -->
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
            case 'users':
                const uData = settings.usersData || { users: [], roles: [], activeUser: 'admin' };
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
                        <div>
                            <h3 style="margin:0;">👤 User Settings</h3>
                            <p style="margin:4px 0 0 0; color:#888; font-size:0.85rem;">Gestión de usuarios, credenciales, roles y permisos de acceso al pipeline.</p>
                        </div>
                        <div style="display:flex; gap:10px;">
                            <button class="btn" onclick="settings.openUserModal()" style="background:var(--accent); color:black; font-weight:bold; padding:6px 14px; border:none; border-radius:4px; cursor:pointer;">
                                + Agregar Usuario
                            </button>
                            <button class="btn" onclick="settings.openRoleModal()" style="background:#222; color:#00bcd4; border:1px solid #00bcd466; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.8rem;">
                                + Nuevo Rol
                            </button>
                            <button class="btn" onclick="settings.changeAdminPasswordModal()" style="background:#222; color:#ff9800; border:1px solid #ff980066; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.8rem;">
                                🔑 Cambiar Pass Admin
                            </button>
                        </div>
                    </div>

                    <!-- Usuario Activo Actual -->
                    <div style="background:rgba(255,152,0,0.08); border:1px solid rgba(255,152,0,0.3); border-radius:6px; padding:12px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="color:#aaa; font-size:0.8rem;">Usuario Activo en este Equipo: </span>
                            <b style="color:var(--accent); font-size:0.95rem;">${uData.activeUser || 'admin'}</b>
                        </div>
                        <select onchange="settings.setActiveUser(this.value)" style="background:#1c222d; color:#fff; border:1px solid #444; border-radius:4px; padding:4px 10px; font-size:0.85rem;">
                            ${(uData.users || []).map(u => `
                                <option value="${u.username || u.laspUser || u.id}" ${uData.activeUser === (u.username || u.laspUser || u.id) ? 'selected' : ''}>
                                    ${u.username || u.laspUser} ${u.firstName ? `(${u.firstName} ${u.lastName})` : ''}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Integración & Auto-Registro Ramón (TACTIC) -->
                    <div style="background:rgba(0,188,212,0.04); border:1px solid #00bcd433; border-radius:6px; padding:14px; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:1.1rem;">🌐</span>
                                <b style="color:#00bcd4; font-size:0.9rem;">Integración & Auto-Registro de Ramón (TACTIC)</b>
                            </div>
                            <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:#eee; font-size:0.8rem;">
                                    <input type="checkbox" ${uData.autoRegisterRamonUsers !== false ? 'checked' : ''} 
                                        onchange="settings.updateUsersConfigProp('autoRegisterRamonUsers', this.checked)"
                                        style="accent-color:#00bcd4; width:15px; height:15px;">
                                    <span>Auto-registrar usuarios al iniciar sesión</span>
                                </label>
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="color:#aaa; font-size:0.8rem;">Rol por defecto:</span>
                                    <select onchange="settings.updateUsersConfigProp('defaultRamonRole', this.value)" 
                                            style="background:#14171d; color:var(--accent); border:1px solid #444; border-radius:4px; padding:3px 8px; font-size:0.8rem;">
                                        ${(uData.roles || []).map(r => `
                                            <option value="${r.id}" ${(uData.defaultRamonRole || 'user') === r.id ? 'selected' : ''}>${r.name} (${r.id})</option>
                                        `).join('')}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <p style="color:#888; font-size:0.75rem; margin:0; line-height:1.4;">
                            Los artistas del estudio que inicien sesión con sus credenciales de red en este equipo se vincularán automáticamente con el rol por defecto seleccionado (<b>${(uData.roles || []).find(r => r.id === (uData.defaultRamonRole || 'user'))?.name || 'Artista'}</b>). Luego puedes cambiarles el rol a Cordinadora, Administrador u otro rol personalizado desde la tabla inferior con el botón ✏️.
                        </p>
                    </div>

                    <!-- Tabla de Usuarios -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:15px; margin-bottom:25px;">
                        <h4 style="margin:0 0 12px 0; color:#eee;">Listado de Usuarios (${(uData.users || []).length})</h4>
                        <table style="width:100%; border-collapse:collapse; font-size:0.82rem; text-align:left;">
                            <thead>
                                <tr style="border-bottom:1px solid #444; color:#888; font-size:0.75rem; text-transform:uppercase;">
                                    <th style="padding:8px;">Nombre de Usuario</th>
                                    <th style="padding:8px;">Origen</th>
                                    <th style="padding:8px;">Nombre</th>
                                    <th style="padding:8px;">Apellido</th>
                                    <th style="padding:8px;">Usuario LASP</th>
                                    <th style="padding:8px;">Rol</th>
                                    <th style="padding:8px;">Excepciones</th>
                                    <th style="padding:8px;">Email</th>
                                    <th style="padding:8px;">Notas</th>
                                    <th style="padding:8px; text-align:right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(uData.users || []).map(u => {
                                    const roleObj = (uData.roles || []).find(r => r.id === u.role) || { name: u.role || 'user', color: '#888' };
                                    const uName = u.username || (u.laspUser ? u.laspUser.replace('lasp-', '') : u.id);
                                    const isSystemAdmin = u.username === 'admin' || u.id === 'u_admin' || (u.isSystem && u.role === 'admin');
                                    const isRamon = !isSystemAdmin && (u.authSource === 'ramon' || (u.laspUser && u.laspUser.startsWith('lasp-')));
                                    return `
                                        <tr style="border-bottom:1px solid #222;">
                                            <td style="padding:10px 8px; display:flex; align-items:center; gap:8px;">
                                                <div style="width:10px; height:10px; border-radius:50%; background:${u.avatarColor || '#ff9800'};"></div>
                                                <b style="color:#fff; font-family:monospace;">${uName}</b>
                                                ${u.isSystem ? '<span style="font-size:0.65rem; background:#333; color:#aaa; padding:1px 4px; border-radius:3px;">default</span>' : ''}
                                            </td>
                                            <td style="padding:10px 8px;">
                                                ${isRamon ? `
                                                    <span style="background:rgba(0,188,212,0.15); color:#00bcd4; border:1px solid #00bcd455; padding:2px 7px; border-radius:4px; font-size:0.72rem; font-weight:bold; display:inline-flex; align-items:center; gap:4px;">
                                                        <span>🌐</span> Ramón
                                                    </span>
                                                ` : `
                                                    <span style="background:rgba(255,152,0,0.12); color:#ff9800; border:1px solid #ff980044; padding:2px 7px; border-radius:4px; font-size:0.72rem; font-weight:bold; display:inline-flex; align-items:center; gap:4px;">
                                                        <span>💻</span> Local
                                                    </span>
                                                `}
                                            </td>
                                            <td style="padding:10px 8px; color:#ccc;">${u.firstName || '—'}</td>
                                            <td style="padding:10px 8px; color:#ccc;">${u.lastName || '—'}</td>
                                            <td style="padding:10px 8px; font-family:monospace; color:var(--accent);">${u.laspUser || '—'}</td>
                                            <td style="padding:10px 8px;">
                                                <span style="background:${roleObj.color}22; color:${roleObj.color}; border:1px solid ${roleObj.color}44; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:bold;">
                                                    ${roleObj.name}
                                                </span>
                                            </td>
                                            <td style="padding:10px 8px;">
                                                ${(() => {
                                                    const ov = u.permissionOverrides || {};
                                                    const blk = Object.values(ov).filter(v => v === false).length;
                                                    const alw = Object.values(ov).filter(v => v === true).length;
                                                    if (blk > 0 && alw > 0) return `<span style="background:rgba(255,152,0,0.15); color:#ffb74d; border:1px solid #ff980044; padding:2px 6px; border-radius:4px; font-size:0.72rem; font-weight:bold;">🛡️ ${blk} blq / ${alw} perm</span>`;
                                                    if (blk > 0) return `<span style="background:rgba(244,67,54,0.15); color:#ef5350; border:1px solid #f4433644; padding:2px 6px; border-radius:4px; font-size:0.72rem; font-weight:bold;">🛡️ ${blk} bloqueo(s)</span>`;
                                                    if (alw > 0) return `<span style="background:rgba(76,175,80,0.15); color:#81c784; border:1px solid #4caf5044; padding:2px 6px; border-radius:4px; font-size:0.72rem; font-weight:bold;">✓ ${alw} permiso(s)</span>`;
                                                    return '<span style="color:#666; font-size:0.72rem;">Rol base</span>';
                                                })()}
                                            </td>
                                            <td style="padding:10px 8px; color:#888; font-size:0.78rem;">${u.email || '—'}</td>
                                            <td style="padding:10px 8px; color:#888; font-size:0.78rem;">${u.notes || '—'}</td>
                                            <td style="padding:10px 8px; text-align:right; white-space:nowrap;">
                                                <button onclick="settings.openUserModal('${u.id}')" class="icon-btn" style="background:transparent; border:none; color:#4fc3f7; cursor:pointer; margin-right:6px;" title="Editar Usuario">✏️</button>
                                                ${!u.isSystem ? `
                                                    <button onclick="settings.deleteUser('${u.id}')" class="icon-btn danger" style="background:transparent; border:none; color:#f44336; cursor:pointer;" title="Eliminar Usuario">🗑️</button>
                                                ` : ''}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Roles y Permisos Configurables -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <h4 style="margin:0; color:#eee;">Roles y Permisos Configurados (${(uData.roles || []).length})</h4>
                            <button class="btn" onclick="settings.openRoleModal()" style="background:#1c222d; color:#00bcd4; border:1px solid #00bcd466; padding:4px 10px; border-radius:4px; font-size:0.78rem; cursor:pointer;">
                                + Crear Nuevo Rol
                            </button>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:14px;">
                            ${(uData.roles || []).map(r => {
                                const permCats = [
                                    {
                                        title: '🎬 Módulos Principales (Sidebar)',
                                        color: 'var(--accent)',
                                        items: [
                                            { key: 'access_explorer', label: 'Explorer' },
                                            { key: 'access_shot_navigator', label: 'Shot Navigator' },
                                            { key: 'access_asset_designer', label: 'Asset Designer' },
                                            { key: 'access_shot_designer', label: 'Shot Designer' },
                                            { key: 'access_ia_ingest', label: 'IA Ingest' }
                                        ]
                                    },
                                    {
                                        title: '🛠️ Herramientas (Header Toolbar)',
                                        color: '#4fc3f7',
                                        items: [
                                            { key: 'access_tool_naming_validator', label: 'Naming Validator' },
                                            { key: 'access_tool_sync_analyze', label: 'Sync Analyzer' },
                                            { key: 'access_tool_file_auditor', label: 'File Auditor' },
                                            { key: 'access_tool_asset_creator', label: 'Asset Creator' },
                                            { key: 'access_tool_shot_creator', label: 'Shot Creator' }
                                        ]
                                    },
                                    {
                                        title: '🎯 Workflow & Shot Navigator',
                                        color: '#8bc34a',
                                        items: [
                                            { key: 'assignAllShots', label: 'Asignar a otros artistas' },
                                            { key: 'workflow_edit_statuses', label: 'Cambiar estados de procesos' },
                                            { key: 'workflow_create_folders', label: 'Crear carpetas en disco' },
                                            { key: 'exportPackages', label: 'Exportar paquetes de tareas' }
                                        ]
                                    },
                                    {
                                        title: '📁 Acciones en Explorer',
                                        color: '#ffb74d',
                                        items: [
                                            { key: 'explorer_create_folder', label: 'Crear nuevas carpetas' },
                                            { key: 'explorer_delete_items', label: 'Eliminar archivos/carpetas' },
                                            { key: 'explorer_rename_items', label: 'Renombrar archivos/carpetas' },
                                            { key: 'explorer_open_desktop', label: 'Abrir en Windows Explorer' }
                                        ]
                                    },
                                    {
                                        title: '⚙️ Administración & Sistema',
                                        color: '#e91e63',
                                        items: [
                                            { key: 'manageUsers', label: 'Gestionar Usuarios & Roles' },
                                            { key: 'manageSettings', label: 'Configuración Global' },
                                            { key: 'manageStatuses', label: 'Diseñador de Estados' }
                                        ]
                                    }
                                ];

                                return `
                                    <div style="background:#14171d; border:1px solid #28303d; border-radius:6px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
                                        <div>
                                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom:1px solid #232a35; padding-bottom:8px;">
                                                <div style="display:flex; align-items:center; gap:8px;">
                                                    <div style="width:12px; height:12px; border-radius:3px; background:${r.color};"></div>
                                                    <b style="color:${r.color}; font-size:0.95rem;">${r.name}</b>
                                                    <span style="font-family:monospace; font-size:0.75rem; color:#666;">(${r.id})</span>
                                                </div>
                                                <div style="display:flex; align-items:center; gap:6px;">
                                                    <button onclick="settings.openRoleModal('${r.id}')" class="icon-btn" style="background:transparent; border:none; color:#4fc3f7; cursor:pointer; font-size:0.95rem;" title="Editar Permisos">✏️</button>
                                                    ${!r.isSystem ? `<button onclick="settings.deleteRole('${r.id}')" class="icon-btn" style="background:transparent; border:none; color:#f44336; cursor:pointer; font-size:0.95rem;" title="Eliminar Rol">🗑️</button>` : ''}
                                                </div>
                                            </div>
                                            <p style="font-size:0.78rem; color:#aaa; margin:0 0 12px 0;">${r.description || 'Sin descripción'}</p>
                                            
                                            <div style="display:flex; flex-direction:column; gap:10px; background:#0c0e12; padding:10px; border-radius:6px; border:1px solid #1a202c;">
                                                ${permCats.map(cat => `
                                                    <div>
                                                        <div style="font-size:0.72rem; font-weight:bold; color:${cat.color}; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">
                                                            ${cat.title}
                                                        </div>
                                                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:3px; font-size:0.72rem;">
                                                            ${cat.items.map(it => {
                                                                const isAllowed = r.permissions ? r.permissions[it.key] === true : false;
                                                                return `
                                                                    <div style="display:flex; align-items:center; gap:5px; color:${isAllowed ? '#ddd' : '#666'}; padding:2px 4px; border-radius:3px; background:${isAllowed ? 'rgba(255,255,255,0.02)' : 'transparent'};">
                                                                        <span>${isAllowed ? '✅' : '❌'}</span>
                                                                        <span style="${isAllowed ? '' : 'text-decoration:none; opacity:0.6;'}">${it.label}</span>
                                                                    </div>
                                                                `;
                                                            }).join('')}
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;

            case 'statuses':
            case 'workflow':
                settings.localAccordionOpen = true;
                settings.currentCategory = 'avanzado';
                return settings.renderCategoryContent();

            case 'ia_ingest':
                const isWatcherActive = window.iaWatcherActive || (typeof isDownloadWatcherRunning === 'function' ? isDownloadWatcherRunning() : false);
                const detectedFolder = window.iaWatcherFolder || (document.getElementById('iaWatcherDetectedFolder')?.innerText) || 'C:/Users/.../Downloads';
                return `
                    <h3 style="margin-top:0; margin-bottom:15px; color:#fff; display:flex; align-items:center; gap:8px;">
                        <span>🤖 IA Ingest & Descargas</span>
                    </h3>
                    
                    <!-- CAPTURA AUTOMÁTICA DE DESCARGAS -->
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:6px; border:1px solid #333; margin-bottom:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <div>
                                <h4 style="margin:0; color:var(--accent); font-size:0.95rem;">Captura Automática de Descargas</h4>
                                <div style="font-size:0.82rem; color:#888; margin-top:3px; line-height:1.3;">
                                    Monitorea la carpeta de descargas de tu navegador y envía automáticamente los archivos nuevos a la cola de IA Ingest.
                                </div>
                            </div>
                            <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
                                <input type="checkbox" id="iaSettingsWatcherToggle" ${isWatcherActive ? 'checked' : ''} 
                                       onchange="if (typeof toggleDownloadWatcher === 'function') toggleDownloadWatcher(this.checked); settings.render();"
                                       style="opacity:0; width:0; height:0;">
                                <span style="position:absolute; top:0; left:0; right:0; bottom:0; background:${isWatcherActive ? 'var(--accent)' : '#444'}; border-radius:24px; transition:0.3s;"></span>
                                <span style="position:absolute; content:''; height:18px; width:18px; left:${isWatcherActive ? '22px' : '3px'}; bottom:3px; background:white; border-radius:50%; transition:0.3s;"></span>
                            </label>
                        </div>

                        <div style="margin-top:12px; padding:10px; background:#111; border:1px solid #282828; border-radius:4px;">
                            <div style="font-size:0.75rem; color:#aaa; margin-bottom:4px;">Carpeta de Descargas Monitoreada:</div>
                            <div style="font-size:0.8rem; color:#4caf50; font-family:monospace; word-break:break-all;" id="iaSettingsWatcherDetectedFolder">
                                ${escapeHtml(detectedFolder)}
                            </div>
                        </div>

                        <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
                            <button class="tool-btn" style="width:100%; padding:8px 12px; font-size:0.8rem; background:#222; border:1px solid #555; text-align:center; color:#ffb74d; border-radius:4px; font-weight:bold; cursor:pointer;" 
                                    onclick="if (typeof openChromeSettingsDownloads === 'function') openChromeSettingsDownloads();" 
                                    title="Abre los ajustes de descargas de Chrome y copia la dirección al portapapeles">
                                ⚙️ Abrir Ajustes Descargas Chrome
                            </button>
                            <div style="font-size:0.75rem; color:#888; line-height:1.4;">
                                💡 <i>Recomendación: En la pestaña de Chrome que se abrirá, desactiva <b>"Preguntar dónde se guardará cada archivo"</b> para que las imágenes o videos generados se descarguen directamente sin abrir el diálogo de Windows y entren a la cola de Pipeta al instante.</i>
                            </div>
                        </div>
                    </div>

                    <!-- GUARDADO AUTOMÁTICO DE TOKENS PERSONALIZADOS TRAS INGESTA -->
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:6px; border:1px solid #333; margin-bottom:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <h4 style="margin:0; color:var(--accent); font-size:0.95rem;">Guardar Tokens Personalizados tras Ingesta (Save after queue)</h4>
                                <div style="font-size:0.82rem; color:#888; margin-top:3px; line-height:1.3;">
                                    Guarda de forma permanente cualquier token personalizado manual nuevo (motores, resoluciones, encuadres, tags) en presets/ia_custom_tokens.json al ejecutar la ingesta.
                                </div>
                            </div>
                            <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
                                <input type="checkbox" id="iaSettingsSaveTokensToggle" ${localStorage.getItem('pipeta_ia_save_custom_tokens') !== 'false' ? 'checked' : ''} 
                                       onchange="localStorage.setItem('pipeta_ia_save_custom_tokens', this.checked); settings.render();"
                                       style="opacity:0; width:0; height:0;">
                                <span style="position:absolute; top:0; left:0; right:0; bottom:0; background:${localStorage.getItem('pipeta_ia_save_custom_tokens') !== 'false' ? 'var(--accent)' : '#444'}; border-radius:24px; transition:0.3s;"></span>
                                <span style="position:absolute; content:''; height:18px; width:18px; left:${localStorage.getItem('pipeta_ia_save_custom_tokens') !== 'false' ? '22px' : '3px'}; bottom:3px; background:white; border-radius:50%; transition:0.3s;"></span>
                            </label>
                        </div>
                    </div>
                `;

            case 'interfaz':
                const curViewMode = (settings.defaultViewMode === 'online') ? 'drive' : (settings.defaultViewMode || 'local');
                const curBrowserMode = settings.defaultBrowserMode || (typeof currentBrowserMode !== 'undefined' ? currentBrowserMode : 'split');
                const curCompMode = settings.defaultSyncComparisonMode || (typeof window !== 'undefined' && window.syncComparisonMode ? window.syncComparisonMode : 'drive');

                return `
                    <h3 style="margin-top:0; margin-bottom:15px; color:#fff;">Interfaz de Usuario</h3>
                    
                    <!-- 1. MODO DE EXPLORADOR POR DEFECTO -->
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:6px; border:1px solid #333; margin-bottom:16px;">
                        <h4 style="margin-top:0; margin-bottom:6px; color:#ccc; font-size:0.95rem;">Modo de Explorador por Defecto</h4>
                        <div style="font-size:0.82rem; color:#888; margin-bottom:12px; line-height:1.3;">
                            Define qué ubicación se carga al iniciar la aplicación en el explorador.
                        </div>
                        <div style="display:flex; gap:24px; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultViewMode" value="local" 
                                    ${curViewMode === 'local' ? 'checked' : ''}
                                    onchange="settings.defaultViewMode = 'local'; try { localStorage.setItem('pipeta_view_location_mode', 'local'); } catch(e){}">
                                <span>Local (Z:)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultViewMode" value="drive" 
                                    ${curViewMode === 'drive' ? 'checked' : ''}
                                    onchange="settings.defaultViewMode = 'drive'; try { localStorage.setItem('pipeta_view_location_mode', 'drive'); } catch(e){}">
                                <span>Drive (G:)</span>
                            </label>
                            ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultViewMode" value="server" 
                                    ${curViewMode === 'server' ? 'checked' : ''}
                                    onchange="settings.defaultViewMode = 'server'; try { localStorage.setItem('pipeta_view_location_mode', 'server'); } catch(e){}">
                                <span>Servidor (Catálogo)</span>
                            </label>
                            ` : ''}
                        </div>
                    </div>



                    <!-- 3. COMPARACIÓN POR DEFECTO (EN MODO LOCAL) -->
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:6px; border:1px solid #333; margin-bottom:16px;">
                        <h4 style="margin-top:0; margin-bottom:6px; color:#ccc; font-size:0.95rem;">Comparación por Defecto (en modo Local)</h4>
                        <div style="font-size:0.82rem; color:#888; margin-bottom:12px; line-height:1.3;">
                            Define si se auditan y comparan los archivos locales contra Google Drive o el Servidor Central al abrir el explorador.
                        </div>
                        <div style="display:flex; gap:24px; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultSyncComparisonMode" value="drive" 
                                    ${curCompMode === 'drive' ? 'checked' : ''}
                                    onchange="settings.defaultSyncComparisonMode = 'drive'; try { localStorage.setItem('pipeta_sync_comparison_mode', 'drive'); } catch(e){}">
                                <span>Google Drive (G:)</span>
                            </label>
                            ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultSyncComparisonMode" value="server" 
                                    ${curCompMode === 'server' ? 'checked' : ''}
                                    onchange="settings.defaultSyncComparisonMode = 'server'; try { localStorage.setItem('pipeta_sync_comparison_mode', 'server'); } catch(e){}">
                                <span>Servidor Central</span>
                            </label>
                            ` : ''}
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultSyncComparisonMode" value="off" 
                                    ${curCompMode === 'off' ? 'checked' : ''}
                                    onchange="settings.defaultSyncComparisonMode = 'off'; try { localStorage.setItem('pipeta_sync_comparison_mode', 'off'); } catch(e){}">
                                <span>Desactivada</span>
                            </label>
                        </div>
                    </div>
                `;
            case 'avanzado':
                // Build options for presets
                let assetPresets = settings.presetsList.map(p =>
                    `<option value="${p.id}" ${settings.validationPresetAsset === p.id ? 'selected' : ''}>${p.name}</option>`
                ).join('');

                let shotPresets = settings.presetsList.map(p =>
                    `<option value="${p.id}" ${settings.validationPresetShot === p.id ? 'selected' : ''}>${p.name}</option>`
                ).join('');

                if (settings.presetsList.length === 0) {
                    assetPresets = `<option disabled>No se encontraron presets (.json) en ${settings.projectsPath.replace('Projects', '')}</option>`;
                    shotPresets = `<option disabled>Verificar ruta de instalación</option>`;
                }

                const sData = settings.statusesData || { statuses: [] };
                const curProj = settings.currentProject || settings.getBaseProject();
                const defaultWfDir = (curProj.roots?.work || 'Z:/[cliente]/[proyecto]').replace(/\//g, '\\') + '\\workflow';

                return `
                    <h3 style="margin-top:0; margin-bottom:15px; color:#fff;">Opciones Avanzadas</h3>
                    
                    <!-- DESPLEGABLE: LOCAL (DISEÑADOR DE ESTADOS & WORKFLOW) -->
                    <details ${settings.localAccordionOpen ? 'open' : ''} ontoggle="settings.localAccordionOpen = this.open" style="background:rgba(255,255,255,0.03); border:1px solid #384252; border-radius:8px; margin-bottom:20px; overflow:hidden;">
                        <summary style="padding:14px 18px; cursor:pointer; font-weight:bold; color:var(--accent); font-size:0.95rem; user-select:none; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:space-between;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span>💻</span>
                                <span style="color:#fff;">Local</span>
                                <span style="color:#888; font-weight:normal; font-size:0.8rem;">(Diseñador de Estados, Workflow & Base de Datos)</span>
                            </div>
                            <span style="font-size:0.75rem; color:#888;">▼ Desplegable</span>
                        </summary>
                        <div style="padding:18px; border-top:1px solid #2a3442; display:flex; flex-direction:column; gap:20px;">
                            
                            <!-- BLOQUE 1: DISEÑADOR DE ESTADOS -->
                            <div style="background:#14171d; border:1px solid #2a3342; border-radius:6px; padding:16px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #2a3342; padding-bottom:10px; margin-bottom:14px;">
                                    <div>
                                        <div style="font-weight:bold; color:var(--accent); font-size:0.92rem;">🏷️ Diseñador de Estados (Shots / Assets)</div>
                                        <div style="color:#888; font-size:0.8rem; margin-top:2px;">Define y personaliza los estados de procesos y avance aplicables a shots y assets.</div>
                                    </div>
                                    <button class="btn" onclick="settings.addStatusModal()" style="background:var(--accent); color:black; font-weight:bold; padding:6px 14px; border:none; border-radius:4px; cursor:pointer; font-size:0.82rem;">
                                        + Nuevo Estado
                                    </button>
                                </div>
                                <table style="width:100%; border-collapse:collapse; font-size:0.82rem; text-align:left;">
                                    <thead>
                                        <tr style="border-bottom:1px solid #333; color:#888; font-size:0.72rem; text-transform:uppercase;">
                                            <th style="padding:6px 8px;">Icono & Estado</th>
                                            <th style="padding:6px 8px;">Identificador</th>
                                            <th style="padding:6px 8px;">Ámbito</th>
                                            <th style="padding:6px 8px;">Color</th>
                                            <th style="padding:6px 8px; text-align:right;">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(sData.statuses || []).map(st => `
                                            <tr style="border-bottom:1px solid #222;">
                                                <td style="padding:8px; display:flex; align-items:center; gap:8px;">
                                                    <span style="font-size:1.05rem;">${st.icon || '⚪'}</span>
                                                    <b style="color:${st.color || '#fff'};">${st.name}</b>
                                                    ${st.isDefault ? `<span style="background:#222; color:#aaa; font-size:0.65rem; padding:1px 5px; border-radius:3px;">Por Defecto</span>` : ''}
                                                </td>
                                                <td style="padding:8px; font-family:monospace; color:#888;">${st.id}</td>
                                                <td style="padding:8px; text-transform:capitalize; color:#ccc;">${st.scope === 'both' ? 'Shots & Assets' : st.scope}</td>
                                                <td style="padding:8px;">
                                                    <div style="display:flex; align-items:center; gap:6px;">
                                                        <div style="width:14px; height:14px; border-radius:3px; background:${st.color}; border:1px solid #555;"></div>
                                                        <span style="font-family:monospace; font-size:0.75rem; color:#aaa;">${st.color}</span>
                                                    </div>
                                                </td>
                                                <td style="padding:8px; text-align:right;">
                                                    ${!st.isDefault ? `<button onclick="settings.deleteStatus('${st.id}')" class="icon-btn danger" style="background:transparent; border:none; color:#f44336; cursor:pointer;" title="Eliminar Estado">🗑️</button>` : ''}
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <!-- BLOQUE 2: WORKFLOW & BASE DE DATOS -->
                            <div style="background:#14171d; border:1px solid #2a3342; border-radius:6px; padding:16px;">
                                <div style="font-weight:bold; color:var(--accent); font-size:0.92rem; margin-bottom:4px;">🗂️ Workflow, Asignaciones & Base de Datos</div>
                                <p style="color:#aaa; font-size:0.8rem; line-height:1.5; margin-top:0; margin-bottom:12px;">
                                    Pipeta mantiene la base de datos de planos, estados y asignaciones en <code>shot_tracker.json</code> dentro de la carpeta de workflow del proyecto.
                                </p>
                                <div style="display:flex; gap:8px; margin-bottom:14px;">
                                    <input type="text" readonly value="${defaultWfDir}" style="flex:1; background:#0d1117; border:1px solid #333; border-radius:4px; padding:6px 10px; color:#ccc; font-family:monospace; font-size:0.8rem;">
                                    <button class="btn" onclick="API.fs.open('${defaultWfDir.replace(/\\/g, '\\\\')}')" style="background:#222; color:#fff; border:1px solid #444; border-radius:4px; padding:6px 12px; cursor:pointer; font-size:0.8rem;">📂 Abrir</button>
                                </div>
                                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                                    <button class="btn" onclick="if(typeof ShotNavigator !== 'undefined') { ShotNavigator.loadWorkflow(); alert('✅ Base de datos de workflow recargada con éxito.'); }" style="background:#1c222d; color:#4fc3f7; border:1px solid #4fc3f766; padding:7px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.82rem;">
                                        🔄 Recargar Workflow Local
                                    </button>
                                    <button class="btn" onclick="if(typeof ShotNavigator !== 'undefined') { ShotNavigator.saveTracker(); alert('✅ Base de datos de workflow guardada.'); }" style="background:#1c222d; color:#4caf50; border:1px solid #4caf5066; padding:7px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.82rem;">
                                        💾 Guardar / Publicar Tracker
                                    </button>
                                    <button class="btn" onclick="if(typeof ShotNavigator !== 'undefined') { ShotNavigator.exportMyTasksFile(); }" style="background:#1c222d; color:#ff9800; border:1px solid #ff980066; padding:7px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.82rem;">
                                        👤 Exportar Mis Tareas (.json)
                                    </button>
                                </div>
                            </div>

                        </div>
                    </details>
                    
                    <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid #333; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h4 style="margin-top:0; margin-bottom:10px; color:var(--accent);">Presets Maestros de Validación</h4>
                            <button onclick="settings.loadPresets().then(() => settings.render())" style="background:none; border:none; color:#666; cursor:pointer;" title="Recargar Presets">↻</button>
                        </div>
                        <p style="font-size:0.8rem; color:#888;">Define qué presets se usan para auditar y verificar la estructura de carpetas de Assets y Shots.</p>
                        
                        <div class="config-group" style="margin-top:15px;">
                            <label class="config-label">Maestro para Assets</label>
                            <select class="config-input" onchange="settings.validationPresetAsset = this.value">
                                <option value="">-- Sin asignar --</option>
                                ${assetPresets}
                            </select>
                        </div>

                        <div class="config-group">
                            <label class="config-label">Maestro para Shots</label>
                            <select class="config-input" onchange="settings.validationPresetShot = this.value">
                                <option value="">-- Sin asignar --</option>
                                ${shotPresets}
                            </select>
                        </div>
                    </div>

                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
                            <div>
                                <h4 style="margin:0; color:var(--accent); font-size:0.95rem;">Registro de Actividad & Diagnóstico (Logs)</h4>
                                <p style="font-size:0.8rem; color:#888; margin:4px 0 0 0;">
                                    Pipeta separa automáticamente el <b>registro de operaciones</b> de las funciones habituales del <b>registro exclusivo de errores</b>.
                                </p>
                            </div>
                            <button type="button" class="btn" onclick="settings.generateDiagnosticReport()" 
                                    style="background:var(--accent); color:#000; font-weight:bold; border-radius:4px; padding:8px 16px; font-size:0.82rem; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(255,152,0,0.25);"
                                    title="Genera un reporte consolidado con entorno y errores, abre la carpeta de reportes y copia el texto al portapapeles">
                                <span>📦 Generar Reporte de Error</span>
                            </button>
                        </div>
                        
                        <div class="config-group" style="margin-top:15px;">
                            <label class="config-label">Registro activo en disco</label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" ${settings.loggingEnabled ? 'checked' : ''}
                                    onchange="settings.loggingEnabled = this.checked;">
                                <span style="font-size:0.85rem; color:#ccc;">${settings.loggingEnabled ? 'Activado — se guardan logs de operaciones (pipeta_fecha.log) y errores (pipeta_errors_fecha.log)' : 'Desactivado — no se registra actividad'}</span>
                            </label>
                        </div>

                        <div class="config-group" style="margin-top:12px;">
                            <label class="config-label">Acceso a Registros & Diagnóstico</label>
                            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                                <input class="config-input" type="text" value="${settings.logsPath}"
                                    onchange="settings.logsPath = this.value;" 
                                    style="flex:1; min-width:200px; font-family:monospace; font-size:0.8rem;">
                                
                                <button type="button" class="btn" onclick="settings.openLogsDirectory()" 
                                    style="background:#282828; color:#fff; border:1px solid #444; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir carpeta principal de logs en Explorer">
                                    <span>📂 Carpeta Logs</span>
                                </button>
                                
                                <button type="button" class="btn" onclick="settings.openReportsFolder()" 
                                    style="background:#282828; color:#4fc3f7; border:1px solid #00bcd488; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir carpeta de reportes generados">
                                    <span>📁 Carpeta Reportes</span>
                                </button>

                                <button type="button" class="btn" onclick="settings.openLatestLogFile()" 
                                    style="background:#222; color:var(--accent); border:1px solid #444; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir el log de operaciones de hoy">
                                    <span>📄 Log de Hoy</span>
                                </button>

                                <button type="button" class="btn" onclick="settings.openErrorLogFile()" 
                                    style="background:#222; color:#f44336; border:1px solid #f4433688; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir el archivo exclusivo de errores de hoy">
                                    <span>⚠️ Log de Errores</span>
                                </button>
                            </div>
                            <div style="font-size:0.75rem; color:#777; margin-top:8px;">
                                Al pulsar <b>Generar Reporte de Error</b> se creará un archivo <code>reporte_fecha.txt</code> en <code>logs/reports/</code>, se abrirá la carpeta en Windows y el texto quedará copiado en tu portapapeles listo para enviar por Rock o chat.
                            </div>
                        </div>
                    </div>
                `;
            case 'exportar':
                const canPublishPresets = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('presets_allow_publish') : true;
                const canExportZip = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('export_portable_zip') : true;
                return `
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px;">📦 Update / Export Presets</h3>

                    <!-- SECCIÓN: ACTUALIZADOR DIRECTO & ACCESOS (ARRIBA DE TODO) -->
                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                            <div style="font-weight:bold; color:var(--accent); font-size:0.95rem;">
                                🔄 Actualizador Directo & Accesos
                            </div>
                            <div style="display:flex; gap:10px;">
                                <button id="createShortcutBtn" class="btn" onclick="settings.createDesktopShortcut()" title="Crea un acceso directo en tu Escritorio con el icono de Pipeta"
                                    style="background:#222; color:#00bcd4; border:1px solid #00bcd488; font-weight:bold; padding:9px 16px; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                                    <span>📌 Crear Acceso Directo</span>
                                </button>
                                <button id="updateFromNetBtn" class="btn" onclick="settings.executeUpdateFromServer()" 
                                    style="background:var(--accent); color:black; font-weight:bold; padding:9px 22px; border-radius:4px; border:none; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 2px 10px rgba(255,152,0,0.3);">
                                    <span>🚀 ACTUALIZAR PIPETA DESDE RED</span>
                                </button>
                            </div>
                        </div>
                        <div id="updateStatusMsg" style="font-size:0.85rem; color:#aaa; margin-bottom:12px;"></div>
                        <p style="color:#aaa; font-size:0.82rem; line-height:1.5; margin-top:0; margin-bottom:14px;">
                            Sincroniza en caliente tu instalación local con la versión más reciente del repositorio maestro en red (<code>Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta</code> o <code>\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta</code>) y reinicia el sistema automáticamente.
                        </p>

                        <div style="background:#111; border:1px solid #222; border-radius:6px; padding:12px; font-size:0.8rem;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                <span style="color:#888;">Servidor Maestro (Origen de Red):</span>
                                <span style="color:var(--accent); font-family:monospace; font-weight:bold;">Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:#888;">Instalación Local:</span>
                                <span style="color:#aaa; font-family:monospace;">C:\\TOOLS\\APPS\\Pipeta</span>
                            </div>
                        </div>
                    </div>

                    <p style="color:#aaa; font-size:0.85rem; line-height:1.6; margin-bottom:14px;">
                        Esta herramienta permite respaldar y publicar selectivamente las configuraciones, proyectos y presets de diseño (Shots y Assets) desde tu disco local <code>C:\\</code> hacia la unidad de red <code>Z:\\</code> o cualquier otra carpeta de destino, manteniendo intacto el carpetaje original.
                    </p>

                    <!-- RECUADRO UNIFICADO: ELEMENTOS + DESTINO DE EXPORTACIÓN -->
                    ${canPublishPresets ? `
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:10px; font-size:0.85rem;">Elementos a Exportar</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; font-size:0.78rem;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptShotDesigner" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Presets de Shot Designer</b> <span style="color:#777; font-size:0.72rem;">(presets/ShotDesigner/*.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptAssetDesigner" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Presets de Asset Designer</b> <span style="color:#777; font-size:0.72rem;">(presets/AssetDesigner/*.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptProjects" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Proyectos Configurados</b> <span style="color:#777; font-size:0.72rem;">(presets/Projects/*.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptUsers" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Usuarios y Roles</b> <span style="color:#777; font-size:0.72rem;">(presets/users_config.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptStatuses" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Estados de Procesos y Planos</b> <span style="color:#777; font-size:0.72rem;">(presets/status_config.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptConfig" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Configuración General</b> <span style="color:#777; font-size:0.72rem;">(presets/config.json)</span></span>
                            </label>
                        </div>

                        <div style="border-top:1px solid #282828; margin-top:14px; padding-top:12px;">
                            <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                                <span style="font-weight:bold; color:var(--accent); font-size:0.85rem;">Ruta de Destino de la Exportación:</span>
                                <span style="color:#888; font-size:0.76rem;">Selecciona o examina la carpeta de destino:</span>
                            </div>
                            <div style="display:flex; gap:8px; margin-bottom:14px;">
                                <input type="text" id="expTargetPath" class="config-input" 
                                    value="${settings.exportPresetsPath || 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS\\\\Pipeta\\\\presets'}" 
                                    oninput="settings.exportPresetsPath = this.value"
                                    style="flex:1; font-family:monospace; font-size:0.85rem; padding:8px; color:var(--accent);">
                                <button id="expBrowseBtn" class="btn" onclick="settings.browseExportPath()" 
                                    style="background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:8px 14px; font-size:0.85rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                    <span>📁 Examinar...</span>
                                </button>
                                <button class="btn" onclick="settings.setDefaultExportPath()" title="Restablecer a la ruta de red por defecto en Z:"
                                    style="background:#222; color:#aaa; border:1px solid #444; border-radius:4px; padding:8px 12px; font-size:0.85rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                    <span>↺ Default (Z:)</span>
                                </button>
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px;">
                                <div id="expStatusMsg" style="font-size:0.85rem; color:#aaa;"></div>
                                <button class="btn" onclick="settings.confirmExportPresets()" 
                                    style="background:var(--accent); color:black; font-weight:bold; padding:9px 20px; border-radius:4px; border:none; cursor:pointer; display:flex; align-items:center; gap:8px;">
                                    <span>🚀 EXPORTAR / PUBLICAR PRESETS</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    ` : '<div style="padding:12px 16px; background:rgba(255,255,255,0.02); border:1px solid #282828; border-radius:6px; color:#888; font-size:0.8rem; margin-bottom:18px;">🔒 Publicación de Presets restringida por política de usuario.</div>'}

                    <!-- SECCIÓN: EMPAQUETAR VERSIÓN PORTABLE (.ZIP) -->
                    ${canExportZip ? `
                    <div style="background:rgba(0,188,212,0.04); padding:18px; border-radius:8px; border:1px solid #00bcd444; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div style="font-weight:bold; color:#00bcd4; font-size:0.95rem; display:flex; align-items:center; gap:8px;">
                                <span>📦 Empaquetar Versión Portable (.zip)</span>
                            </div>
                            <span style="font-size:0.75rem; background:#222; padding:2px 8px; border-radius:4px; color:#aaa; font-family:monospace;">
                                Pipeta ${window.APP_VERSION || 'v1.1.67'}
                            </span>
                        </div>
                        <p style="color:#aaa; font-size:0.82rem; line-height:1.5; margin-top:0; margin-bottom:14px;">
                            Genera un archivo comprimido <code>Pipeta_vX.XX.zip</code> (o <code>Pipeta_vX.XX_Ramon.zip</code>) autocontenido con el runtime de Node.js, todas las interfaces, el lanzador y los presets de configuración. Cualquier usuario puede descomprimirlo en cualquier máquina o disco (<code>C:</code>, <code>D:</code>, pendrive) y ejecutarlo de inmediato sin instalaciones previas ni dependencias de red.
                        </p>

                        <div style="margin-bottom:14px;">
                            <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:6px;">Carpeta de Salida para el archivo comprimido:</label>
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="pkgTargetDir" class="config-input" 
                                    value="${settings.pkgTargetDir || 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS'}" 
                                    oninput="settings.pkgTargetDir = this.value"
                                    style="flex:1; font-family:monospace; font-size:0.85rem; padding:8px; color:#00bcd4;">
                                <button id="pkgBrowseBtn" class="btn" onclick="settings.browsePackageDir()" 
                                    style="background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:8px 14px; font-size:0.85rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                    <span>📁 Examinar...</span>
                                </button>
                                <button class="btn" onclick="settings.openPackageTargetDir()" title="Abrir carpeta de salida en el Explorador de Windows"
                                    style="background:#222; color:#00bcd4; border:1px solid #00bcd488; border-radius:4px; padding:8px 12px; font-size:0.85rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                    <span>📂 Abrir Carpeta</span>
                                </button>
                            </div>
                        </div>

                        <!-- CHECKBOX INCLUIR RAMON Y DEPENDENCIAS -->
                        <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:10px 14px; margin-bottom:12px;">
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:0.85rem; color:#eee;">
                                <input type="checkbox" id="pkgIncludeRamon" style="width:16px; height:16px; cursor:pointer;">
                                <span>
                                    <b>Incluir Ramón y dependencias</b> (Python 3.10 portable + TACTIC Client) 
                                    <span style="color:#00bcd4; font-size:0.75rem; margin-left:6px;">➔ Genera <code>Pipeta_${window.APP_VERSION || 'v1.1.67'}_Ramon.zip</code> (~35 MB extra)</span>
                                </span>
                            </label>
                            <div style="font-size:0.75rem; color:#888; margin-left:26px; margin-top:3px;">
                                Ideal para enviar por primera vez a usuarios externos en su casa. Para actualizaciones de código subsiguientes, podés dejarlo destildado para generar una versión más ligera (<code>Pipeta_${window.APP_VERSION || 'v1.1.67'}.zip</code>).
                            </div>
                        </div>

                        <!-- OPCIONES DE CACHÉ LOCAL Y RED (_SYNC_CACHE) -->
                        <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:12px 14px; margin-bottom:14px;">
                            <div style="font-size:0.85rem; font-weight:bold; color:#eee; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                                <span>⚡ Cachés de Catálogos (<code>_SYNC_CACHE</code>)</span>
                            </div>
                            <div style="font-size:0.75rem; color:#888; margin-bottom:10px; line-height:1.4;">
                                Por defecto <b>no se incluyen cachés</b> para que el .ZIP sea ultra-liviano (~40–70 MB). Si se omiten, Pipeta generará los catálogos automáticamente en la máquina donde se ejecute.
                            </div>

                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.8rem; color:#ccc;">
                                    <input type="checkbox" id="pkgIncludeSyncCacheDrive" style="cursor:pointer;">
                                    <span>Incluir caché de Google Drive (<code>_SYNC_CACHE/projects/.../drive</code>)</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.8rem; color:#ccc;">
                                    <input type="checkbox" id="pkgIncludeSyncCacheServer" style="cursor:pointer;">
                                    <span>Incluir caché de Servidor (<code>_SYNC_CACHE/projects/.../server</code>)</span>
                                </label>
                            </div>
                        </div>

                        <!-- BOTÓN ACCIÓN -->
                        <div style="display:flex; justify-content:flex-end;">
                            <button class="action-btn-primary" id="btnRunPackageZip" onclick="settings.runZipPackaging()" style="display:flex; align-items:center; gap:8px; padding:8px 18px;">
                                <span>📦 Empaquetar y Generar .ZIP</span>
                            </button>
                        </div>
                    </div>
                    ` : '<div style="padding:12px 16px; background:rgba(255,255,255,0.02); border:1px solid #282828; border-radius:6px; color:#888; font-size:0.8rem; margin-bottom:18px;">🔒 Empaquetado portable (.zip) restringido por política de usuario.</div>'}
                `;
            case 'version':
                return `                    <div style="height:25px;"></div>

                    <!-- HEADER: VERSION & PATCH NOTES -->
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                        <span>🚀 Versión / Patch Notes</span>
                        <span style="font-size:0.8rem; background:var(--accent); color:black; font-weight:bold; padding:2px 10px; border-radius:4px;">
                            ${window.APP_VERSION || 'v1.1.67'}
                        </span>
                    </h3>

                    <!-- CARD: HISTORIAL DE VERSIONES & PATCH NOTES -->
                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:12px; font-size:0.95rem;">
                            📋 Notas de la Versión (Patch Notes)
                        </div>

                        <div style="max-height:480px; overflow-y:auto; padding-right:8px; font-size:0.8rem; line-height:1.6;">
                            <div style="margin-bottom:15px; border-left:3px solid var(--accent); padding-left:10px;">
                                <div style="font-weight:bold; color:#fff; font-size:0.88rem;">v1.1.67 (Actual)</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Limpieza de Barra Superior:</b> Se removieron de la barra superior derecha los botones de <i>Espacio en discos</i> (desactivando también su sondeo en segundo plano), <i>Maximizar canvas</i> y <i>Recargar sistema</i>, conservando exclusivamente el botón de cierre seguro.</li>
                                    <li><b>Reubicación de Carpeta de Salida:</b> Traslado del módulo de subcarpetas (<code>WIP</code> / <code>Ref</code> / <code>Export</code>) a la parte inferior izquierda del panel principal de Name Builder, permitiendo una grilla superior de 8 tokens balanceada y alineando las carpetas junto a la ruta canónica de salida.</li>
                                    <li><b>IA Ingest Name Builder Refactor:</b> Botones de módulo con fill sólido completo estilo Carpeta de Salida (naranja activo / oscuro inactivo), activables con un clic en cualquier parte del encabezado y sin borde perimetral iluminado.</li>
                                    <li><b>TAG / ROLE Modular Independiente (A, B, C):</b> Separación en 3 módulos independientes para TAG A (Ref), TAG B (Compo, desactivado por default) y TAG C (Proceso, desactivado por default), eliminando la opción 'ninguno'.</li>
                                    <li><b>Limpieza Visual y Separadores en Desplegables:</b> Remoción de emojis en todas las opciones de Motor, Framing y Tags, líneas divisorias claras y nombres limpios (<code>Auto</code>, <code>Higgsfield (metadata)</code>).</li>
                                    <li><b>Modo Simple por Defecto y Tags Manuales:</b> Inicialización predeterminada en Modo Simple y habilitación del campo Manual en los selectores de Tag.</li>
                                    <li><b>Send2 IA Ingest en Menú Contextual:</b> Icono canónico de IA Ingest y corrección definitiva del error de consola en <code>createObjectURL</code>.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#fff; font-size:0.88rem;">v1.1.56</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Cola de Transferencias Concurrentes y Fast-Lane:</b> Procesamiento paralelo de refrescos de carpeta (<code>refresh_folder</code>) sin bloquear subidas/descargas pesadas, y descargas simultáneas configurables por Rol y Override de Usuario desde Pipeta Server.</li>
                                    <li><b>Identificación de Refresco de Carpeta:</b> Visualización dedicada (<code>🔄 REFRESCO DE CARPETA</code>) con ruta inspeccionada en la cola de transferencias.</li>
                                    <li><b>Persistencia de Prioridades en Server:</b> Sincronización inmediata de cambios de prioridad entre VM 121, VM 111, MongoDB y workers activos.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#fff; font-size:0.88rem;">v1.1.53</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Resolución Universal de Rutas a Google Drive:</b> Mapeo automático de rutas locales (<code>Z:/INTERNO/MEDIA/...</code>, <code>S:/...</code>, <code>Z:/...</code>) a sus correspondientes Team Drives en Google Drive (<code>..._media</code> y <code>...</code>) al crear órdenes de subida para archivos nuevos no indexados en el catálogo.</li>
                                    <li><b>Fallback a Disco Físico SMB:</b> Detección y listado inmediato de archivos nuevos en carpetas locales SMB cuando el catálogo modular en RAM aún no ha sincronizado la entrada.</li>
                                    <li><b>Protección y Autocorrección en Worker y Servidor:</b> Autocorrección preventiva de rutas locales a rutas remotas antes de la invocación de Rclone, evitando cancelaciones por Team Drive no resuelto.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#fff; font-size:0.88rem;">v1.1.51</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Telemetría y Registro de Flota Centralizado (Mecanismo A):</b> Latido periódico automático (cada 60 segundos y al iniciar) hacia el Pipeta Server (<code>192.168.206.121:3005</code>), reportando versión instalada, usuario de Ramón activo, usuario del sistema operativo y sede de red (Munro, Nonstop o Remoto), con respaldo offline tolerante a fallos en <code>_SYNC_CACHE/clients/</code>.</li>
                                    <li><b>Huella de Arranque e Instalador (.bat) (Mecanismo B):</b> Registro asíncrono y no bloqueante en <code>Launch_Pipeta.bat</code> y <code>Actualizar_Pipeta_desde_Red.bat</code> para auditar de forma inmediata qué puestos de artistas cuentan con la aplicación instalada.</li>
                                    <li><b>Diagnóstico y Logs en Dos Niveles:</b> Separación persistente de logs generales (<code>pipeta_YYYY-MM-DD.log</code>) y errores críticos (<code>pipeta_errors_YYYY-MM-DD.log</code>), con generador de reportes de diagnóstico y apertura directa en el Explorador de Windows.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.49</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Validador de Nomenclatura: Escaneo Integral Proyecto y Media:</b> Se corrigió la lógica de <code>Scan ALL</code> que utilizaba una ruta estática obsoleta de configuración. Ahora resuelve de forma dinámica y automática tanto el árbol de <b>Proyecto</b> como el de <b>Media</b> del proyecto activo, auditando ambos universos en una sola pasada.</li>
                                    <li><b>Navegación Unificada a Ítems con Error:</b> El botón "Ir" ahora discrimina correctamente si el archivo/carpeta con error pertenece a Proyecto o a Media, enfocándolo y abriéndolo en su respectivo visor.</li>
                                    <li><b>Diseño Visual Limpio:</b> Se removieron los íconos decorativos y badges obsoletos (escudo, mundo, carpeta y "v1.8") del encabezado y de los botones de escaneo para una interfaz más sobria y directa.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.44</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>File Auditor: Filtrado Canónico Estricto de Renders FullRes vs .mov:</b> Corrección en la auditoría de renders donde los archivos de compresión <code>.mov</code> contaminaban el listado de renders en memoria aunque la casilla <code>.mov</code> estuviese desactivada. Ahora el auditor respeta estrictamente los filtros activos, evaluando y mostrando únicamente las secuencias <code>fullres</code> reales.</li>
                                    <li><b>Discriminación de Carpetas Vacías o Sin Frames de Media:</b> Se incorporó un filtro de medios válidos (<code>.exr</code>, <code>.dpx</code>, <code>.png</code>, etc.) que ignora carpetas vacías o abortadas antes de renderizar (como carpetas de versión sin frames), evaluando y reportando con total precisión cuál es la última versión real existente con archivos en Media.</li>
                                    <li><b>Exploración Selectiva en Menú Contextual:</b> Se incorporaron accesos directos independientes para <code>Abrir Render (vXXX) en Explorer</code> (la versión específica con frames) y <code>Abrir Carpeta Media en Explorer</code> (la jerarquía <code>fullres</code> del plano), evitando navegaciones erróneas hacia carpetas de compresión (<code>nuke/mov</code>).</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.43</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>File Auditor: Fix Desacoplado para Archivos Temporales (.tmp):</b> La opción Fix ahora limpia exclusivamente los archivos <code>.tmp</code> residuales de los renders sin exigir ni encolar subidas o descargas hacia Google Drive (Upload/Download pueden permanecer apagados). Se habilita dinámicamente con texto orientativo <code>Fix (Borrar .tmp)</code> y actualiza el estado directamente a AL DÍA sin falsas alertas de error.</li>
                                    <li><b>Control de Caché en UI (Cache-Busting):</b> Se vincularon parámetros de versión en los scripts de la interfaz para forzar la recarga inmediata de los módulos en equipos de artistas conectados por red sin requerir recargas forzadas.</li>
                                    <li><b>Badge Específico de Residuos (.tmp):</b> Detección visual que diferencia carpetas con nombres incorrectos de secuencias válidas afectadas únicamente por archivos residuales <code>.tmp</code> de Nuke/Windows SMB, integrando botón rápido de eliminación y acceso desde el menú contextual.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.42</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>File Auditor: Escaneo Multinivel de Renders y Detección de Ingest:</b> Corrección en el escaneo de renders que solo miraba un nivel de profundidad; ahora inspecciona correctamente jerarquías anidadas canónicas de Nuke (<code>fullres</code>, <code>prerender</code>, <code>mov</code>) y excluye estrictamente carpetas de cámara o ingesta (<code>in/</code>, <code>plates/</code>) de ser catalogadas falsamente como renders.</li>
                                    <li><b>Limpieza Segura de Residuos Temporales (.tmp):</b> Nueva funcionalidad de corrección que detecta archivos residuales <code>.tmp</code> dejados por Nuke/Windows SMB en carpetas de render. Permite borrarlos de forma individual o en lote con la opción Fix, manteniendo las secuencias de frames 100% intactas y actualizando automáticamente el estado a AL DÍA.</li>
                                    <li><b>Shot Designer: Restauración de Conexiones Mirror y Trazados Bézier:</b> Corrección en el dibujado de conexiones púrpuras verticales entre Proyecto y Media, habilitación de arrastre fluido de conexiones desde dots y corrección en la carga de presets locales.</li>
                                    <li><b>Navegación Explorer: Eliminación de Bloqueo en Apertura:</b> Se solventó la condición de carrera en los overlays de carga que dejaba congelada la pantalla en "Actualizando vista..." al abrir la aplicación.</li>
                                </ul>
                            </div>


                            <div style="margin-bottom:15px; border-left:3px solid var(--accent); padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.39</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Navegación Automática contra Catálogo DB en RAM (0 SMB):</b> En puestos del estudio donde Z: es un volumen de red SMB, la exploración del árbol local utiliza de forma directa y prioritaria la DB del servidor central sin consultar la red a cada clic, respondiendo en 0 ms.</li>
                                    <li><b>Detección Inteligente de Tipo de Unidad Z:</b> Distinción transparente entre volúmenes de red SMB y montajes locales virtuales (VSUB). En modo local por VSUB se aprovecha la velocidad física del SSD, mientras que en red SMB se evita el escaneo innecesario de archivos.</li>
                                    <li><b>Actualización Reactiva de Archivos:</b> Refresco selectivo e invalidación inmediata del catálogo ante cualquier acción de Pipeta (creación de assets, planos, copiado, ingest o eliminación).</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.38</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Navegación Instantánea en Red SMB y Catálogos Modulares:</b> Eliminación de bloqueos de Event Loop causados por escaneos síncronos sobre la unidad Z: conectada por red SMB. La indexación de miles de archivos se realiza en memoria en menos de 100 ms.</li>
                                    <li><b>Caché en Memoria Acelerado:</b> Incorporación de lectura instantánea con <code>serverDirCache</code> para navegación a 0 ms.</li>
                                    <li><b>Blindaje del Árbol de Exploración:</b> Manejo robusto de promesas en Split View evitando estados colgados de carga.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.37</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Arquitectura de Catálogos Centralizados por HTTP (0 SMB):</b> Los manifiestos y sub-catálogos de proyectos (tanto de Google Drive como del servidor del estudio Z:) se sirven directamente por HTTP comprimido desde <code>lasp-pipeta-server</code> hacia el SSD local. Se eliminan los bloqueos y latencias de navegación de Windows SMB en puestos nuevos o reinstalados.</li>
                                    <li><b>Puente de Catálogos Continuo:</b> Sincronización continua de la estructura de proyectos y catálogos en el servidor central con <code>rsync</code> incremental.</li>
                                    <li><b>Blindaje de Dependencias y Reinicios:</b> Protección total de <code>node_modules</code> y runtimes locales durante reinicios automáticos de la aplicación.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.36</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Selector de Proyectos Optimizado:</b> Se oculta el proyecto técnico base de la lista de selección en la barra superior (manteniendo su función como base de configuración) y se añade un indicador visual de carga al conmutar de proyecto.</li>
                                    <li><b>Monitor de Almacenamiento Colapsable:</b> Monitor de discos discretamente ubicado a la derecha de la barra superior, apagado por defecto y desplegable con botón dedicado.</li>
                                    <li><b>Estabilidad y Telemetría Central (Pipeta Server):</b> Puente continuo de almacenamiento (<code>pipeta-storage-bridge</code>) y protección anti-clock-skew para el monitoreo ininterrumpido de nodos (<code>lasp-virt-030</code>).</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.35</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Rediseño de Pipeta Server (Panel de Control):</b> Reorganización del dashboard en dos columnas; los Nodos Workers ahora se sitúan en una columna lateral dedicada y la tabla principal se expande bajo el título <code>Transfer Queue</code>.</li>
                                    <li><b>Limpieza Visual de la Interfaz:</b> Remoción del botón obsoleto «Levantar Worker Local (este servidor)», eliminación del icono de escoba en «Limpiar Historial» y del rayo en la cabecera de la cola.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.34</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Blindaje de Cola de Sincronización Local / Red (Cero Congelamiento en Tasa):</b> Se corrigió la condición de carrera en la persistencia de órdenes locales (escritura simultánea asíncrona sobre SMB que corrompía el JSON de la orden). Ahora el estado se persiste de inmediato en el SSD local y se replica de forma segura y secuencial a la red.</li>
                                    <li><b>Telemetría en Tiempo Real desde Memoria RAM (0 ms):</b> La consulta de órdenes inyecta el progreso de las transferencias locales directamente desde el proceso Node en RAM, garantizando velocidad y porcentaje instantáneos sin quedar trabado en «Calculando tasa...».</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.33</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Monitor de Discos Colapsable a la Derecha:</b> Se reubicó el monitor de almacenamiento (Z: / G:) al extremo derecho de la barra superior, junto a los controles de sistema. Por defecto permanece oculto para mantener la barra limpia, y se despliega al tocar el nuevo botón con icono de disco.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.32</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Ocultamiento del Proyecto Base en Selector de Cabecera:</b> El desplegable de proyectos de la barra superior ahora excluye de forma limpia el <i>Proyecto Base</i> (preservándolo intacto como plantilla maestra de configuración en Opciones Avanzadas y en el resto del sistema).</li>
                                    <li><b>Feedback Visual y Pantalla de Carga al Cambiar de Proyecto:</b> Al seleccionar un proyecto nuevo, se despliega de inmediato una pantalla de carga con indicador esmerilado de progreso y spinner en el selector, evitando la sensación de congelamiento mientras se sincronizan catálogos y exploradores.</li>
                                    <li><b>Sincronización Coordinada de Entorno:</b> Actualización instantánea de raíces de trabajo (<code>ROOTS</code>, <code>window.state</code>, <code>ShotNavigator</code>, <code>ShotCreator</code>, <code>AssetCreator</code>) y soporte dinámico para vistas Split y Miller al conmutar de proyecto.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.31</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Eliminación del Bloqueo de Event Loop por Cola de Órdenes SMB:</b> Se optimizó <code>/api/sync/orders</code> y <code>/api/sync/worker-status</code> con caché en memoria para órdenes finalizadas y límite de inspección a las órdenes más recientes, además de depurar órdenes históricas en red. Esto elimina el bloqueo síncrono de 15-20 segundos cada 3 segundos en máquinas conectadas vía UNC (<code>\\\\192.168.206.116\\Z</code>).</li>
                                    <li><b>Hidratación Local Instantánea de Subcatálogos Modulares (0 ms):</b> Las consultas a subcatálogos modulares ahora priorizan e hidratan automáticamente el disco SSD local (<code>C:\\TOOLS\\APPS\\Pipeta\\_SYNC_CACHE</code>) sin realizar barridos repetitivos por red SMB en cada carpeta desplegada.</li>
                                    <li><b>Blindaje de Despliegue de Carpetas en Split-View Explorer:</b> Se incorporó protección contra clics/eventos concurrentes mientras una carpeta está cargando (evitando que se cierre sola) y se corrigió el orden de inserción en el DOM antes de auto-expandir subcarpetas.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.30</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Optimización Drástica de Split-View Explorer:</b> Se implementó caché jerárquico de directorios locales (<code>dirExistsFast</code> / <code>fileExistsFast</code>). Al comparar local contra servidor en carpetas con miles de archivos que aún no existen en el disco del artista, la verificación de existencia se resuelve en &lt; 30 ms en lugar de congelar la aplicación por 45-60 segundos.</li>
                                    <li><b>Eliminación de Consultas SMB Redundantes:</b> Se unificó el estado de existencia local para evitar comprobaciones de disco duplicadas por cada ítem listado.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.29</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Blindaje de Workflow y Base de Datos Local:</b> Se eliminó la escritura automática pasiva de <code>shot_tracker.json</code> en disco al consultar o sincronizar tareas con Ramón. Los proyectos nuevos o vacíos ya no generan de forma espontánea carpetas residuales <code>workflow/</code> en la raíz de trabajo.</li>
                                    <li><b>Protección de Proyectos no Creados en Disco:</b> Los endpoints de guardado de tracker ahora verifican la existencia previa de la carpeta raíz del proyecto antes de generar subdirectorios, previniendo la creación de proyectos fantasma o huérfanos.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.28</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Auto-Guardado Inmediato de Proyectos:</b> La creación de nuevos proyectos persiste de forma inmediata y automática en el disco local (<code>.json</code>) al asignar su nombre, eliminando pérdidas de configuración por omitir el botón manual de guardado.</li>
                                    <li><b>Exportación y Publicación Canónica de Presets:</b> Se actualizó la ruta de exportación de presets por defecto a la ubicación central oficial del repositorio (<code>Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta\presets</code>), asegurando que los presets lleguen directamente a la red y a producción.</li>
                                    <li><b>Incorporación del Proyecto <code>compound_nine</code>:</b> Integración del preset canónico del nuevo proyecto oficial en la suite de proyectos activos del estudio.</li>
                                    <li><b>Auto-Hidratación de Dependencias y Protección de Runtimes:</b> Blindaje en los lanzadores y actualizadores con exclusión estricta de carpetas <code>bin/</code>, <code>tools/</code> y <code>node_modules/</code> ante sincronizaciones con Robocopy, y descompresión automática transparente desde el depósito central (<code>_DEPOT</code>) al detectar runtimes faltantes.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.27</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Transferencia Concurrente Multi-Stream (Secuencias de Frames):</b> Implementación de un worker pool paralelo de hasta 8 streams simultáneos de copia sobre red SMB. Elimina el cuello de botella de latencia por archivo en secuencias de imágenes (PNG/EXR) y sustituye las lecturas remotas repetitivas de red por chequeos de memoria local en RAM, multiplicando radicalmente el ancho de banda transferido.</li>
                                    <li><b>Cancelación Inmediata en Caliente de Descargas Locales:</b> Integración de <code>AbortController</code> en la memoria activa del servidor. Al cancelar una descarga, los streams se destruyen en el acto, liberando los archivos y evitando que el hilo continúe escribiendo o marque la tarea como completada al finalizar.</li>
                                    <li><b>Saneamiento de Órdenes Huérfanas (Zombie Orders):</b> Limpieza automática de tareas que permanecían congeladas en estado <code>processing</code> tras cerrar o reiniciar Pipeta. Al reiniciar el servidor y al consultar la lista de órdenes, las transferencias locales no activas en RAM se marcan como <i>interrumpidas</i> de inmediato.</li>
                                    <li><b>Apertura Instantánea en Windows Explorer:</b> Resolución automática de carpetas desde puestos con unidad virtual <code>subst Z:</code> hacia recursos UNC del Servidor Central con conexión SMB previa verificada. Se elimina el bloqueo y la espera de 20-30 segundos de Windows Explorer.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.26</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Refinamiento de Metadata Dual para Higgsfield AI:</b> Separación estricta y limpia entre el resguardo del ledger original (<code>IA/higgsfield/...meta.json</code>, que conserva el JSON puro entregado por la API de Higgsfield al 100% sin inyección de datos de pipeline) y el sidecar canónico de estudio (<code>[SHOT_ID]_[MOTOR]...meta.json</code>, identificando el archivo con la clave canónica <code>lasp_name</code> y eliminando extensiones redundantes <code>.mp4</code> del nombre de metadata).</li>
                                    <li><b>Reproductor y Previsualización Robusta de Video Web:</b> Simplificación del visor flotante eliminando botones innecesarios; la miniatura/poster persistente se mantiene siempre activa y responsive sin errores que colapsen el reproductor en videos web.</li>
                                    <li><b>Iconografía Compacta y Limpia:</b> Remoción de textos redundantes en los botones de Higgsfield AI de la barra superior y del Name Builder, manteniendo un aspecto visual minimalista con tooltips informativos al pasar el cursor.</li>
                                    <li><b>Corrección de Rutas de Ingesta IA:</b> Eliminada la duplicación de subcarpetas en destino (<code>IA/IA/</code>), garantizando la ubicación canónica directa en <code>IA/</code> y <code>IA/higgsfield/</code>.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.25</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Integración Nativa de Higgsfield AI en IA Ingest:</b> Soporte integral para ingesta directa de planos generados con Higgsfield AI (Dreamina/Jimeng/Seedance), incluyendo extracción automática de UUIDs de Job desde nombres de archivo (<code>hf_AAAAMMDD_..._[UUID]</code>) o URLs de CloudFront.</li>
                                    <li><b>Consulta REST y Extracción de Metadata de Job (0 créditos):</b> Conexión directa a la API de desarrollador de Higgsfield para recuperar automáticamente prompts, seed, resoluciones nativas, motores canónicos (SD2, SD25, SD5P, etc.) y roles/tags (v2v, i2v, t2v, etc.).</li>
                                    <li><b>Suite Higgsfield Plegable en Barra Superior:</b> Cajón desplegable en la barra de herramientas superior contextual activable mediante un botón iluminado con el logo oficial de Higgsfield AI. Incluye campo de URL directa con botón <code>Download</code> alineado verticalmente, conmutador <code>Use worker</code> (para procesar local o delegar al worker central de red) y controles de ingesta: <b>Metadata</b> (generación de <code>.meta.json</code> / ledger), <b>Backup</b> (resguardo del original sin renombrar en <code>IA/higgsfield/</code>) y <b>Copy Refs</b> (descarga de frames y assets de entrada a <code>IA/ref/</code>).</li>
                                    <li><b>Indicador y Forzado de Higgsfield en «3. NAME BUILDER»:</b> Botón conmutador con logo de Higgsfield junto al encabezado del Name Builder que se ilumina con brillo verde neón automáticamente al detectar que el archivo seleccionado es de Higgsfield. Permite forzar o desvincular la interpretación de Higgsfield en cualquier momento con un solo clic.</li>
                                    <li><b>Selectores de Resolución y Motor con Opciones Automáticas Duales:</b> Se reemplaza el checkbox de auto-detección por dos opciones nativas en la lista de Resolución: <code>📐 Auto (Detección General / Píxeles)</code> y <code>⚡ Auto Higgsfield (Metadata Job)</code>. Misma lógica implementada en el selector de Motor, permitiendo alternar entre el preset del proyecto y el motor reportado por Higgsfield AI.</li>
                                    <li><b>Aislamiento Total de Configuraciones en la Cola de Ingesta (Batch Queue):</b> Cada archivo de la cola preserva de manera independiente su propia subcarpeta (WIP, Ref, Export), motor, resolución, encuadre (Framing) y tags de compo/proceso. Seleccionar una fila resalta visiblemente el ítem e ilumina sus parámetros en el Builder sin sobreescribir ni contaminar el resto de los archivos en lista.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.24</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>File Auditor con Filtro de Ramón («Solo mis tareas»):</b> Se añade control de filtrado directo por tareas asignadas en Ramón en ambas pestañas (<i>Mirror Integrity</i> y <i>Render & Scene Status</i>), permitiendo auditar y visualizar al instante únicamente los planos y assets asignados al usuario en el proyecto actual.</li>
                                    <li><b>Deep Compare para Secuencias de Render:</b> Inspección minuciosa de archivos de secuencia en Media para detectar gaps de numeración (frames ausentes dentro del rango) y archivos dañados (frames de 0 bytes). Se incorporan alertas de <code>⚠️ INCOMPLETO</code>, detalle de frames faltantes en el listado y filtro dedicado en la barra de pestañas.</li>
                                    <li><b>Cotejo Cruzado contra Google Drive (☁️ Comparar contra Drive):</b> Opción para verificar la sincronía del proyecto y de los renders locales contra los catálogos modulares de Google Drive en 0 ms. Detecta si Drive posee una versión más nueva de escena o render (<code>☁️ Más nuevo en Drive</code>) o si el usuario cuenta con archivos locales aún no subidos a la nube (<code>⬆️ Falta subir</code>).</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.23</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Modo Deep Compare Inteligente (Fast vs Deep):</b> Conmutador <code>[⚡ FAST]</code> / <code>[🔬 DEEP]</code> en la barra superior («Comparar») y en <i>Sync Analyzer</i>. El modo Fast es instantáneo (0 ms) por nombres y detección de secuencias; el modo Deep Compare evalúa tamaños en bytes y fechas de modificación para detectar archivos corruptos, truncados a 0 bytes o versiones más recientes en Drive/Server.</li>
                                    <li><b>Validación Fidedigna de Secuencias de Imágenes Parciales:</b> Corregido el bug donde secuencias a medio descargar mostraban tilde verde <code>✓</code> por heredar el estado del primer frame. Ahora detecta faltantes con la insignia <code>⬇️* Bajar (N faltantes)</code> y encola quirúrgicamente para descarga exclusiva los frames faltantes.</li>
                                    <li><b>Pestaña «Diferencias» en Sync Analyzer:</b> Detección visual de discrepancias de tamaño o versiones más nuevas en local u online, permitiendo resolver diferencias con subidas o bajadas dirigidas.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.22</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Ventana Flotante y Móvil de Confirmación de Sincronización:</b> Sustituido el diálogo nativo del navegador (<code>confirm</code>) por una interfaz moderna, flotante y arrastrable con la estética de <i>Sync Queue</i>. Permite visualizar claramente el nombre del elemento, tamaño, rutas de origen y destino en cajas seleccionables, método de red utilizado y control por teclado (<code>Enter</code> para confirmar, <code>Esc</code> para cancelar).</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.21</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Actualización Dirigida en Vivo del Explorador (Sin Colapsos ni Recargas):</b> Eliminado por completo el colapso visual y la recarga en cascada del árbol del explorador al finalizar descargas o subidas. Los elementos descargados o subidos actualizan su insignia a <code>✓</code> y retiran su clase fantasma en el DOM de forma inmediata y quirúrgica sin parpadeos.</li>
                                    <li><b>Refresco In-Place de Contenido de Carpetas y Conteo de Pendientes:</b> Las carpetas contenedoras actualizan sus contadores de pendientes (<code>⬇️* (N)</code> / <code>✓</code>) en tiempo real hacia arriba en la jerarquía. Si se transfiere una carpeta completa que se encuentra abierta, solo se actualizan sus elementos hijos directos sin reiniciar el árbol raíz ni descolapsar carpetas hermanas.</li>
                                    <li><b>Eliminación del Flash de Encolado al Subir:</b> Suprimida la recarga prematura que reiniciaba el explorador al solicitar una orden de subida a Drive o Servidor Central.</li>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.20</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Carga de Catálogo Bajo Demanda («Cargar Catálogo de Proyecto»):</b> Al abrir Pipeta por primera vez o seleccionar un proyecto sin caché local, se presenta una tarjeta centrada para inicializar el catálogo modular en ~1 segundo, evitando descargas masivas de proyectos históricos o ajenos.</li>
                                    <li><b>Eliminación Completa de Catálogos Monolíticos (~50 MB):</b> La lectura y sincronización de catálogos opera exclusivamente sobre arquitectura modular (<code>manifest.json</code> y subcatálogos particionados). El worker y el servidor dejaron de generar archivos monolíticos pesados, purificando más de 320 MB de almacenamiento redundante.</li>
                                    <li><b>Persistencia del Último Proyecto Activo:</b> Al iniciar el servidor o la app, Pipeta recuerda automáticamente el último proyecto trabajado y sincroniza únicamente sus datos modulares sin sobrecargar la red ni emitir logs innecesarios.</li>
                                    <li><b>Empaquetador Portable con Selector Granular de Cachés:</b> Subsanada la exclusión de Python al desmarcar Ramón y agregados selectores para incluir u omitir cachés modulares de Drive y Server en el paquete .zip.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.19</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Insignia de Sincronización Pendiente en Carpetas Contenedoras (*):</b> Todas las carpetas que contengan archivos faltantes o desactualizados en niveles inferiores ahora muestran una insignia visual explícita (<code>⬇️* Bajar (N)</code> o <code>⬆️* Subir</code>) con el conteo de archivos pendientes, evitando falsos vistos verdes (✓) antes de desplegar la jerarquía completa.</li>
                                    <li><b>Cálculo Instantáneo de Tamaños de Raíces y Caché en Memoria (0 ms):</b> Se integraron las estadísticas de manifiestos modulares y una memoria caché para consultas de tamaño de directorios (<code>/api/fs/dirSize</code>), eliminando por completo las ejecuciones recursivas y repetitivas de PowerShell que ralentizaban la navegación y el cambio entre vistas LOCAL, DRIVE y SERVER.</li>
                                    <li><b>Propagación Precisa de Estados en Vista LOCAL vs DRIVE:</b> Corregida la sincronización de estados entre el catálogo en caché y el explorador del disco local, permitiendo disparar la descarga de carpetas completas directamente desde cualquier nivel contenedor.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.18</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Optimización Total del Switch de Vistas (LOCAL / DRIVE / SERVER):</b> Eliminada la descarga y parseo de catálogos monolíticos pesados al alternar ubicaciones. Las consultas de carpetas en DRIVE y SERVER se resuelven de forma modular y bajo demanda en milisegundos.</li>
                                    <li><b>Respuesta Visual Inmediata y Tokens de Renderizado Anti-Carrera:</b> La barra de herramientas responde al instante (0 ms) y se implementaron tokens de cancelación de render para evitar parpadeos, pantallas en negro o solapamientos al alternar rápidamente entre modos de exploración.</li>
                                    <li><b>Normalización Universal de Rutas de Proyectos:</b> Se garantiza el formateo canónico de barras (slashes) en raíces locales, de red y de Google Drive para evitar discordancias en árboles de directorios de cualquier proyecto.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.17</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Selector de Perfil de Ubicación (Estudio vs Home Office):</b> Se incorporó en la pestaña Sincronización un selector directo con opciones <code>[ ESTUDIO ]</code>, <code>[ HOME ]</code> y <code>[ AUTO ]</code> para fijar el comportamiento de cada puesto independientemente de la subred o VPN de cada sede.</li>
                                    <li><b>Protección y Auto-Sanitización de Presets de Proyectos:</b> Se corrigió la sincronización de presets entre red y disco local (removiendo exclusiones agresivas en robocopy) e implementando auto-sanitización de rutas para impedir que presets desfasados apunten a carpetas incorrectas.</li>
                                    <li><b>Refresco Reactivo de Diagnósticos de Red:</b> Se eliminaron bloqueos en la interfaz de sincronización asegurando que los estados de conectividad, Z y worker se rendericen inmediatamente al concluir el diagnóstico.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.16</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Auto-Activación y Supervisión Continua del Worker:</b> Al enviar cualquier orden de descarga o subida a Google Drive, si el Worker Central de red no está activo, Pipeta lanza automáticamente el Worker Local en segundo plano sin requerir que el usuario lo abra manualmente. Además, un supervisor periódico levanta el worker local automáticamente si detecta transferencias pendientes.</li>
                                    <li><b>Blindaje Anti-Cierre del Worker Local:</b> Se agregaron controladores de excepciones no capturadas y promesas rechazadas a nivel de proceso en <code>sync_worker.js</code>, impidiendo cierres inesperados durante transferencias complejas o actualizaciones de catálogos.</li>
                                    <li><b>Prioridad de Estado Local en Sync Queue:</b> La interfaz de la cola reporta inmediatamente el estado activo del Worker Local sin enmascararse por estados inactivos remotos.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.15</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Worker Local en Segundo Plano para Equipos Externos:</b> Permite iniciar o detener con un solo clic un Sync Worker local en segundo plano directamente desde la cola de transferencias (Sync Queue ⚡). El worker local se auto-configura con Rclone local sin necesidad de acceder a la red del estudio ni a la VM 105.</li>
                                    <li><b>Cancelación y Eliminación de Tareas en Vivo:</b> Ahora es posible cancelar tareas activas o en cola en cualquier momento mediante el botón <code>✕ Cancelar</code>. El worker interrumpe la transferencia de Rclone de inmediato y libera los recursos.</li>
                                    <li><b>Limpieza de Historial:</b> Se agregó el botón <code>🗑️ Limpiar Historial</code> para purgar fácilmente registros de tareas completadas, fallidas o canceladas.</li>
                                    <li><b>Filtrado Estricto de Tareas por Usuario:</b> Cada usuario visualiza únicamente sus propias descargas y subidas garantizando total privacidad. Los administradores disponen de un selector para alternar entre "Mis Tareas" y la vista global.</li>
                                    <li><b>Eliminación de Timeouts y Bloqueos SMB en Remoto:</b> Se blindó la lectura de catálogos y sub-catálogos de Google Drive para evitar cualquier intento de sondeo a rutas UNC o Z: inexistentes en máquinas externas, logrando una navegación instantánea.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.14</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Aislamiento y Modo Exclusivo para Equipos Externos (Home / WAN):</b> En máquinas remotas o de artistas en casa (detectadas por ausencia de LAN del estudio o inicio de sesión en Ramón WAN), Pipeta oculta y deshabilita automáticamente el modo Servidor Central y sus comparaciones. El equipo trabaja exclusivamente en modo <code>LOCAL</code> y <code>GOOGLE DRIVE</code>, eliminando por completo intentos de lectura o bloqueos por catálogos centrales de red.</li>
                                    <li><b>Compatibilidad Total con Puestos del Estudio:</b> Los puestos locales del estudio y máquinas virtuales de desarrollo (donde Z: es una unidad virtual o subst pero existe conectividad interna LAN) conservan intacta la funcionalidad completa de Servidor Central y catálogos centrales.</li>
                                    <li><b>Detección Instantánea No Bloqueante:</b> La comprobación de entorno de red y Ramón remoto se ejecuta mediante sondeo directo ultra-rápido en backend y se sincroniza en tiempo real al iniciar sesión sin requerir recargar la página.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.13</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Soporte Multi-Servidor WAN/LAN de Ramón (Acceso Remoto sin VPN):</b> Se incorporó soporte nativo para el endpoint seguro remoto <code>https://ramon.lasp.co:8075/</code> utilizado en el pipeline del estudio. Ahora los artistas que trabajen desde sus casas o equipos remotos sin conexión VPN pueden iniciar sesión y consultar tareas en Ramón directamente.</li>
                                    <li><b>Detección Ultra-Rápida de Conexión (Fast Probe):</b> Se implementó sondeo preventivo de sockets con timeout corto (1.5s) y caché persistente de servidor en disco, eliminando los bloqueos por WinError 10060 de Windows y previniendo cierres de proceso por timeout ("código null").</li>
                                    <li><b>Reintentos Autónomos y Tolerancia a Fallos:</b> Si cambia el entorno de red (ej. de casa al estudio), Pipeta invalida la caché automáticamente y descubre el nuevo endpoint disponible de forma transparente.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.12</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Corrección del Filtro de Ramón en el Explorador:</b> Se resolvió la discrepancia entre códigos de proyecto (ej. <code>SURF</code> vs <code>surf_love</code>, <code>PRPR</code> vs <code>pride_and_prejudice</code>), asegurando que el botón de Mis Tareas de la barra superior filtre de manera instantánea y precisa las carpetas del proyecto según los planos y assets asignados al usuario en Ramón.</li>
                                    <li><b>Aislamiento Estricto de Planos Hermanos:</b> Se restringió el matcheo dentro de la carpeta de shots/planos para que únicamente se muestre el plano asignado (ej. <code>SURF_B01_003_0020</code>) descartando planos hermanos que compartan secuencia o prefijo (como <code>0010</code>, <code>0030</code>, <code>0040</code>).</li>
                                    <li><b>Auto-despliegue del Árbol de Tareas:</b> En la vista dividida (Split View), al activar el filtro de Ramón las carpetas intermedias se despliegan automáticamente guiando la vista hasta el plano o asset asignado.</li>
                                    <li><b>Feedback Visual Claro en Vistas:</b> Se añadieron estados informativos cuando no existen tareas asignadas en el proyecto actual tanto en Split View como en Miller Columns, evitando que la vista permanezca sin filtrar.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.11</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Empaquetador con Selector de Dependencias de Ramón:</b> Ahora se puede elegir si el <code>.zip</code> portable incluye o no las dependencias de Ramón (Python 3.10 portable y librería cliente de TACTIC). Si se incluye, genera <code>Pipeta_v1.1.11_Ramon.zip</code> listo para usuarios externos; si no, genera <code>Pipeta_v1.1.11.zip</code> ligero para actualizaciones de rutina.</li>
                                    <li><b>Rclone Autónomo en Versión Portable:</b> Se incluyó la configuración maestra de Google Drive (<code>tools/rclone/rclone.conf</code>) dentro del paquete para permitir transferencias directas de subida y bajada a Drive sin requerir unidad G: montada.</li>
                                    <li><b>Soporte Autónomo de TACTIC Client:</b> Se incorporó <code>tactic_client_lib</code> localmente en Pipeta, permitiendo conexiones directas a <code>ramon.lasp.co</code> sin mapeo de red del estudio.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.10</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Detección Inteligente de Python para Ramón:</b> Pipeta ahora detecta y utiliza de forma transparente el intérprete de Python del estudio (<code>Z:\INTERNO\TOOLS\GITHUB\TOOLS\python\python.exe</code>), instalaciones locales estándar o Python Launcher, eliminando el fallo por alias de Microsoft Store en puestos nuevos. Se integró la librería <code>six.py</code> de forma nativa en el puente de Ramón.</li>
                                    <li><b>Inicio de Sesión de Ramón en Selector de Cabecera:</b> Se incorporó la opción <code>🌐 + Iniciar Sesión con Ramón...</code> directamente en el desplegable de usuarios y se aseguró su visibilidad permanente en el menú de usuario para poder conectar múltiples cuentas de red del estudio con total fluidez.</li>
                                    <li><b>Blindaje de Usuario Admin Local:</b> El administrador del sistema queda protegido de forma estricta como usuario local, previniendo etiquetas o modos erróneos de Ramón.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.09</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Filtro de "Mis Tareas" en IA Ingest:</b> Se incorporó el botón de filtro con el icono oficial de Ramón junto a <code>1. TARGET</code>. Al activarse, los selectores de jerarquía (Episodio, Escena y Shot) se restringen de forma automática e instantánea únicamente a los planos asignados al usuario en Ramón.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.08</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Filtrado Inteligente de Ramas Estructurales:</b> Las carpetas contenedoras raíz (<code>episodios</code>, <code>assets2D</code>, <code>assets3D</code>) ahora solo se muestran si el usuario tiene al menos una tarea asignada en esa categoría en Ramón, evitando carpetas de assets vacías para artistas de planos (y viceversa).</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.07</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Restauración del Icono Oficial de Ramón en Filtro:</b> Reincorporación del logo oficial de Ramón (<code>icons/ramon.png</code>) en el botón de filtro de tareas de la barra del explorador con soporte para estado activo y atenuado.</li>
                                    <li><b>Refresco Instantáneo al Activar Filtro:</b> El filtrado de "Mis Tareas" ahora se aplica de inmediato (0 ms) en pantalla sin requerir pulsar manualmente el botón de refresh, sincronizando tareas en segundo plano sin congelar la interfaz.</li>
                                    <li><b>Corrección de Contexto en Árbol de Carpetas:</b> Se corrigió la identificación del contenedor (<code>tree-work</code> vs <code>tree-media</code>) durante la expansión de carpetas para garantizar el filtrado correcto en todas las subcarpetas del proyecto.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.06</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Sincronización Dinámica de Drive en Vista Local:</b> La comparación entre disco Local y Google Drive ahora consulta en tiempo real los subcatálogos modulares frescos desde la caché central (vía UNC SMB directo), reconociendo de inmediato archivos descargados o preexistentes sin falsos avisos de "Subir a Drive".</li>
                                    <li><b>Mapeo Bidireccional Local-Drive:</b> Los subcatálogos modulares ahora indexan y resuelven peticiones tanto por rutas virtuales de Google Drive como por rutas locales (Z:), logrando coincidencia instantánea (✓ Sincronizado).</li>
                                    <li><b>Refresco Automático de Subcatálogos al Descargar:</b> El Worker y Pipeta actualizan e invalidan quirúrgicamente los subcatálogos afectados tras descargas exitosas desde Google Drive.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.05</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Descarga y Subida Directa UNC (Sin Letra de Unidad):</b> En máquinas virtuales y puestos donde Z: es un disco virtual local, las descargas y subidas desde/hacia el Servidor Central se resuelven directamente vía protocolo SMB / UNC (<code>\\192.168.206.116\Z</code>) sin requerir el mapeo de unidades adicionales.</li>
                                    <li><b>Gestión de Credenciales SMB:</b> Panel de conexión directa al Servidor Central en Configuración con opción de usuario, contraseña y prueba de conectividad en tiempo real.</li>
                                    <li><b>Resolución Automática de Rutas en Copia:</b> El endpoint de copia de archivos detecta automáticamente el contexto del servidor y redirige la lectura física al recurso compartido central.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.04</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Detección Precisa de Entorno SMB:</b> Reconocimiento instantáneo y certero de estaciones de trabajo donde Z: es el servidor real de producción. Se desactiva y oculta limpiamente el modo SERVER en estos puestos.</li>
                                    <li><b>Erradicación Total de Prefijo S:</b> Sanitización completa de rutas y catálogos bajo el canon de estudio Z:. Ni en el Explorer, ni en árboles de carpetas ni en cabeceras se expondrán rutas de desarrollo locales.</li>
                                    <li><b>Sincronización Transparente con Worker Central:</b> En entornos virtuales o de desarrollo, las peticiones de catálogo consultan y delegan directamente al Worker de red, visualizando en tiempo real archivos como ejecutables y assets del servidor central.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.03</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Unificación de Almacenamiento:</b> Eliminación del modo "SERVER" en estaciones estándar para evitar discrepancias, explorando exclusivamente LOCAL (Z:) y DRIVE (G: o Catálogo).</li>
                                    <li><b>Sonda HTTP Real de Internet:</b> Reemplazo de resolución DNS por comprobación HTTP transparente (<code>generate_204</code>).</li>
                                    <li><b>Refresco Directo al Worker:</b> Botón manual de refresco delega directamente al Worker central.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.02</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Sincronización Quirúrgica del Catálogo:</b> Inyección instantánea (&lt;5ms) y refresco específico por Rclone de carpetas subidas a Google Drive.</li>
                                    <li><b>Detección Persistente de Entorno:</b> Detección única de internet y discos guardada por equipo (<code>env_state.json</code>), con bloqueo automático de llamadas web innecesarias en puestos aislados.</li>
                                    <li><b>Corrección de Rutas en Clientes:</b> Detección robusta de subcarpetas en proyectos cuyos nombres o clientes contienen subcadenas reservadas.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.1.0</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Sync Analyzer & Google Drive:</b> Motor de análisis y sincronización contra Google Drive (G:), catálogo offline para comparación ultrarrápida, escaneo filtrado por tareas asignadas ("Solo mis shots") y resolución interactiva de conflictos.</li>
                                    <li><b>Integración Ramón (TACTIC):</b> Autenticación de dominio en caliente, panel de "Mis Tareas" en cabecera y auto-registro transparente de artistas en la base local con asignación de roles.</li>
                                    <li><b>Consola de Diagnóstico & Logs:</b> Visor de eventos en tiempo real con filtrado por niveles (INFO, WARN, ERROR), persistencia diaria en disco (formato JSONL) y descargas para soporte.</li>
                                    <li><b>Rediseño de Configuraciones & Presets:</b> Nueva distribución intuitiva en categorías (Interfaz, Atajos, Proyectos, Usuarios, Avanzado), unificación de configuración local (Estados y Workflow) y panel centralizado de actualización y empaquetado.</li>
                                    <li><b>Arquitectura de Producción Oficial:</b> Consolidación del runtime en el puerto canónico 3002 y unificación definitiva de la rama de desarrollo a producción.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.0.02</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Detección de Instancia en Acceso Directo:</b> Si Pipeta ya está en ejecución, el acceso directo abre directamente el navegador sin provocar bloqueos ni errores de puerto ocupado.</li>
                                    <li><b>Ruta Default de Exportación de Paquetes:</b> Destino predeterminado de compresión y publicación establecido en <code>Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS</code>.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v1.0.01</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Versión Oficial de Estudio:</b> Lanzamiento de Pipeta 1.0 para todo el equipo.</li>
                                    <li><b>Migración & Publicación Automatizada:</b> Ubicación canónica en <code>APPS\\Pipeta</code> y flujo de publicación directo a <code>S:</code> (el <code>Z:</code> real de los artistas).</li>
                                    <li><b>Actualizador Multi-Origen:</b> Detección automática tanto en unidad mapeada como en recurso compartido <code>\\\\LASP-VM\\Pipeta</code>.</li>
                                    <li><b>Plantillas v001 en Shot & Asset Creator:</b> Creación automatizada de archivos v001 con resolución canónica de extensiones y templates configurables por proceso y proyecto.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v0.9.72</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#bbb;">
                                    <li><b>Exportación Completa de Presets & Configs:</b> Se integró el respaldo y publicación de <code>users_config.json</code> (Usuarios & Roles) y <code>status_config.json</code> (Diseñador de Estados) en la herramienta de exportación.</li>
                                    <li><b>Visualización Exhaustiva de Permisos:</b> Las tarjetas de rol en User Settings muestran directamente el desglose completo de las 5 categorías y 21 permisos sin necesidad de abrir el editor.</li>
                                    <li><b>Autocompletado LASP & UI Limpia:</b> Autocompletado dinámico <code>lasp-[inicial][apellido]</code> en tiempo real y placeholders actualizados.</li>
                                    <li><b>Filtrado de Procesos Canónicos en Shot Navigator:</b> Eliminadas carpetas fantasma intermedias (2D, 3D) y alineación estricta con el Work Tree del Shot Designer.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v0.9.71</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>User Settings Completo:</b> Modal interactivo unificado para crear y editar usuarios.</li>
                                    <li><b>Gestión de Roles & Permisos:</b> Control de acceso granular por rol y bloqueo visual en UI.</li>
                                    <li><b>Diseñador de Estados Canónico:</b> Estado por defecto <code>Ninguno</code>.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v0.9.70</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Shot Navigator:</b> Módulo completo con jerarquía visual de episodios, escenas y planos, procesos dinámicos y creación de carpetas por selección.</li>
                                    <li><b>Preset Cleanup:</b> Eliminado preset fantasma y unificación dinámica con las Opciones de Proyecto.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v0.9.64</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Origen UNC Exclusivo:</b> Actualizador configurado estrictamente contra <code>\\\\LASP-VM\\Pipeta</code> sin fallbacks a unidades de red locales potencialmente desactualizadas.</li>
                                    <li><b>Abrir en Explorer:</b> Desacople con spawn detached para cualquier usuario y detección automática de archivo vs carpeta.</li>
                                    <li><b>Barra de Explorer:</b> Botón Borrar reubicado a la derecha de Nueva Carpeta.</li>
                                </ul>
                            </div>

                            <div style="margin-bottom:15px; border-left:3px solid #555; padding-left:10px;">
                                <div style="font-weight:bold; color:#aaa; font-size:0.88rem;">v0.9.61</div>
                                <ul style="margin:4px 0 0 0; padding-left:18px; color:#888;">
                                    <li><b>Icono de Pipeta:</b> Generación de icono multirresolución <code>Pipeta.ico</code> y asignación en accesos directos.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                `;
            default:
                return `<h3>Seleccione una categoría</h3>`;
        }
    },

    createDesktopShortcut: async () => {
        const btn = document.getElementById('createShortcutBtn');
        const statusMsg = document.getElementById('updateStatusMsg');

        if (btn) btn.innerHTML = '<span>⏳ Creando...</span>';

        try {
            const res = await fetch('/api/app/create-desktop-shortcut', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data && data.success) {
                if (statusMsg) statusMsg.innerHTML = '<span style="color:#4caf50; font-weight:bold;">✅ Acceso directo creado en tu Escritorio con el icono de Pipeta.</span>';
                alert("¡Acceso directo creado con éxito en tu Escritorio!");
            } else {
                throw new Error(data ? data.error : 'Error al crear acceso directo');
            }
        } catch(e) {
            console.error("Create shortcut error:", e);
            if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">❌ Error: ${e.message}</span>`;
            alert("Error al crear acceso directo: " + e.message);
        } finally {
            if (btn) btn.innerHTML = '<span>📌 Crear Acceso Directo</span>';
        }
    },

    openPackageTargetDir: async () => {
        const input = document.getElementById('pkgTargetDir');
        const current = (input ? input.value : settings.pkgTargetDir || 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS').trim();
        try {
            await API.fs.openFolder(current.replace(/\\/g, '/'));
        } catch(e) {
            console.error("Open package dir error:", e);
        }
    },

    showPipetaUpdateModal: function() {
        const existing = document.getElementById('pipeta-update-modal');
        if (existing) existing.remove();

        const backdrop = document.createElement('div');
        backdrop.id = 'pipeta-update-modal';
        backdrop.className = 'pipeta-update-modal-backdrop';
        backdrop.innerHTML = `
            <div class="pipeta-update-card">
                <div class="pipeta-update-title">
                    <span style="font-size:1.3rem;">🚀</span> Actualizando Pipeta desde Red
                </div>
                <div class="pipeta-update-desc" id="pipeta-update-subtext">
                    Sincronizando la última versión de producción con tu equipo...
                </div>
                <div class="pipeta-progress-bar-wrap">
                    <div class="pipeta-progress-bar animated-stripes" id="pipeta-update-bar" style="width: 15%;"></div>
                </div>
                <div class="pipeta-update-steps" id="pipeta-update-steps">
                    <div class="pipeta-update-step-item active" id="pstep-1">
                        <span class="pstep-icon">🔍</span>
                        <span>1. Localizando repositorio maestro en red...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="pstep-2">
                        <span class="pstep-icon">📦</span>
                        <span>2. Sincronizando archivos y scripts del sistema...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="pstep-3">
                        <span class="pstep-icon">🛡️</span>
                        <span>3. Preservando configuraciones locales y credenciales...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="pstep-4">
                        <span class="pstep-icon">🔄</span>
                        <span>4. Reiniciando servidor local y recargando aplicación...</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        return {
            setStep(num, percent, subtext) {
                const bar = document.getElementById('pipeta-update-bar');
                if (bar) bar.style.width = `${percent}%`;
                const sub = document.getElementById('pipeta-update-subtext');
                if (sub && subtext) sub.textContent = subtext;
                for (let i = 1; i <= 4; i++) {
                    const el = document.getElementById(`pstep-${i}`);
                    if (!el) continue;
                    const icon = el.querySelector('.pstep-icon');
                    if (i < num) {
                        el.className = 'pipeta-update-step-item done';
                        if (icon) icon.textContent = '✅';
                    } else if (i === num) {
                        el.className = 'pipeta-update-step-item active';
                        if (icon) {
                            if (i === 1) icon.textContent = '🔍';
                            if (i === 2) icon.textContent = '📦';
                            if (i === 3) icon.textContent = '🛡️';
                            if (i === 4) icon.textContent = '🔄';
                        }
                    } else {
                        el.className = 'pipeta-update-step-item';
                        if (icon) icon.textContent = '○';
                    }
                }
            },
            error(err) {
                const bar = document.getElementById('pipeta-update-bar');
                if (bar) {
                    bar.style.background = '#f44336';
                    bar.classList.remove('animated-stripes');
                }
                const sub = document.getElementById('pipeta-update-subtext');
                if (sub) sub.innerHTML = `<span style="color:#f44336; font-weight:bold;">❌ Error: ${err}</span>`;
                const closeBtn = document.createElement('button');
                closeBtn.style.cssText = "margin-top:16px; padding:7px 18px; background:#2c323b; color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold;";
                closeBtn.textContent = "Cerrar";
                closeBtn.onclick = () => backdrop.remove();
                backdrop.querySelector('.pipeta-update-card').appendChild(closeBtn);
            }
        };
    },

    executeUpdateFromServer: async () => {
        const btn = document.getElementById('updateFromNetBtn');
        const statusMsg = document.getElementById('updateStatusMsg');

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>⏳ Actualizando...</span>';
            btn.style.opacity = '0.7';
        }
        if (statusMsg) {
            statusMsg.innerHTML = '<span style="color:var(--accent);">⏳ Buscando repositorio maestro y sincronizando...</span>';
        }

        const modal = settings.showPipetaUpdateModal();
        modal.setStep(1, 20, 'Localizando repositorio maestro de Pipeta...');

        const step2Timer = setTimeout(() => {
            modal.setStep(2, 45, 'Sincronizando archivos del sistema mediante robocopy...');
        }, 900);

        try {
            const res = await fetch('/api/app/update-from-server', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            clearTimeout(step2Timer);
            const data = await res.json();
            if (data && data.success) {
                modal.setStep(3, 80, 'Configuraciones locales y credenciales preservadas.');
                if (statusMsg) {
                    statusMsg.innerHTML = '<span style="color:#4caf50; font-weight:bold;">✅ ¡Actualización completada! Reiniciando Pipeta...</span>';
                }

                setTimeout(() => {
                    modal.setStep(4, 95, 'Reiniciando servidor local de Pipeta... Reconectando en segundos.');
                    let attempts = 0;
                    const checkInterval = setInterval(async () => {
                        attempts++;
                        try {
                            const hRes = await fetch('/api/health');
                            if (hRes.ok) {
                                clearInterval(checkInterval);
                                modal.setStep(4, 100, '¡Servidor activo! Recargando aplicación...');
                                setTimeout(() => window.location.reload(), 600);
                            }
                        } catch(e) {
                            if (attempts > 20) {
                                clearInterval(checkInterval);
                                window.location.reload();
                            }
                        }
                    }, 1000);
                }, 700);
            } else {
                throw new Error(data ? data.error : 'Error desconocido');
            }
        } catch(e) {
            clearTimeout(step2Timer);
            console.error("Auto-update error:", e);
            modal.error(e.message);
            if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">❌ Error al actualizar: ${e.message}</span>`;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>🚀 ACTUALIZAR PIPETA (lasp-munro)</span>';
                btn.style.opacity = '1';
            }
        }
    },

    openErrorLogFile: async () => {
        try {
            await fetch('/api/logs/open-errors-file', { method: 'POST' });
        } catch(e) {
            console.error("Open error log file error:", e);
        }
    },

    openReportsFolder: async () => {
        try {
            await fetch('/api/logs/open-reports-folder', { method: 'POST' });
        } catch(e) {
            console.error("Open reports folder error:", e);
        }
    },

    generateDiagnosticReport: async () => {
        if (typeof PipetaConsole !== 'undefined' && typeof PipetaConsole.generateReport === 'function') {
            await PipetaConsole.generateReport();
        } else {
            const curProj = settings.currentProject ? (settings.currentProject.name || settings.currentProject.id) : 'Desconocido';
            const locMode = settings.syncEnvData?.locationMode || 'auto';
            const zInfo = (typeof getZEnvStatusLabel === 'function') ? getZEnvStatusLabel() : 'Desconocido';
            try {
                const res = await fetch('/api/logs/generate-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: curProj, locationMode: locMode, zInfo: zInfo })
                }).then(r => r.json());
                if (res && res.success) {
                    if (navigator.clipboard && res.content) {
                        await navigator.clipboard.writeText(res.content);
                    }
                    if (typeof settings.showToast === 'function') {
                        settings.showToast('📦 Reporte generado en logs/reports/ y copiado al portapapeles', 'success', 4);
                    } else {
                        alert('✅ Reporte generado con éxito en logs/reports/ y copiado al portapapeles.');
                    }
                }
            } catch(e) {
                alert('Error al generar reporte: ' + e.message);
            }
        }
    },

    openLogsDirectory: async () => {
        const logsDir = settings.logsPath || 'C:/TOOLS/APPS/Pipeta/logs';
        try {
            await fetch('/api/fs/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: logsDir })
            });
        } catch(e) {
            console.error("Open logs dir error:", e);
        }
    },

    openLatestLogFile: async () => {
        const logsDir = (settings.logsPath || 'C:/TOOLS/APPS/Pipeta/logs').replace(/\\/g, '/').replace(/\/+$/, '');
        const today = new Date().toISOString().split('T')[0];
        const logFile = `${logsDir}/pipeta_${today}.jsonl`;
        try {
            await fetch('/api/fs/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: logFile })
            });
        } catch(e) {
            console.error("Open log file error:", e);
        }
    },

    setDefaultExportPath: () => {
        const defaultPath = 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets';
        const input = document.getElementById('expTargetPath');
        if (input) input.value = defaultPath;
        settings.exportPresetsPath = defaultPath;
        const msg = document.getElementById('expStatusMsg');
        if (msg) msg.innerHTML = '<span style="color:#aaa;">Ruta restablecida a la ubicación por defecto de Z:</span>';
    },

    browseExportPath: async () => {
        const input = document.getElementById('expTargetPath');
        const current = (input ? input.value : settings.exportPresetsPath || 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets').trim();
        const btn = document.getElementById('expBrowseBtn');
        if (btn) btn.innerHTML = '<span>⏳ Abriendo...</span>';
        try {
            const res = await fetch('/api/system/pickFolder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initialPath: current })
            });
            const data = await res.json();
            if (data && data.success && data.path) {
                if (input) input.value = data.path;
                settings.exportPresetsPath = data.path;
            }
        } catch(e) {
            console.error("Browse error:", e);
        } finally {
            if (btn) btn.innerHTML = '<span>📁 Examinar...</span>';
        }
    },

    setDefaultPackageDir: () => {
        const defaultPath = 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS';
        const input = document.getElementById('pkgTargetDir');
        if (input) input.value = defaultPath;
        settings.pkgTargetDir = defaultPath;
        const msg = document.getElementById('pkgStatusMsg');
        if (msg) msg.innerHTML = '<span style="color:#aaa;">Ruta de salida restablecida a Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS</span>';
    },

    browsePackageDir: async () => {
        const input = document.getElementById('pkgTargetDir');
        const current = (input ? input.value : settings.pkgTargetDir || 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS').trim();
        const btn = document.getElementById('pkgBrowseBtn');
        if (btn) btn.innerHTML = '<span>⏳ Abriendo...</span>';
        try {
            const res = await fetch('/api/system/pickFolder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initialPath: current })
            });
            const data = await res.json();
            if (data && data.success && data.path) {
                if (input) input.value = data.path;
                settings.pkgTargetDir = data.path;
            }
        } catch(e) {
            console.error("Browse pkg error:", e);
        } finally {
            if (btn) btn.innerHTML = '<span>📁 Examinar...</span>';
        }
    },

    showZipPackagingModal: function(zipName) {
        const existing = document.getElementById('pipeta-zip-modal');
        if (existing) existing.remove();

        const backdrop = document.createElement('div');
        backdrop.id = 'pipeta-zip-modal';
        backdrop.className = 'pipeta-update-modal-backdrop';
        backdrop.innerHTML = `
            <div class="pipeta-update-card" style="width: 520px;">
                <div class="pipeta-update-title">
                    <span style="font-size:1.3rem;">📦</span> Empaquetando Versión Portable (.zip)
                </div>
                <div class="pipeta-update-desc" id="zip-package-subtext">
                    Generando <code>${zipName}</code> autocontenido...
                </div>
                <div class="pipeta-progress-bar-wrap">
                    <div class="pipeta-progress-bar animated-stripes" id="zip-package-bar" style="width: 15%;"></div>
                </div>
                <div class="pipeta-update-steps" id="zip-package-steps">
                    <div class="pipeta-update-step-item active" id="zstep-1">
                        <span class="pstep-icon">📂</span>
                        <span>1. Preparando base de código, runtime y presets locales...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="zstep-2">
                        <span class="pstep-icon">🗜️</span>
                        <span>2. Comprimiendo archivos y dependencias en .ZIP...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="zstep-3">
                        <span class="pstep-icon">📜</span>
                        <span>3. Generando script de instalación automática (.bat)...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="zstep-4">
                        <span class="pstep-icon">🎉</span>
                        <span>4. Finalizando paquete y verificando integridad...</span>
                    </div>
                </div>
                <div id="zip-package-result" style="display:none; margin-top:16px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.08);">
                    <div id="zip-package-summary" style="font-size:0.85rem; color:#a3be8c; margin-bottom:12px; font-weight:bold; line-height:1.4;"></div>
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button id="btnZipOpenFolder" class="btn" style="background:#222; color:#00bcd4; border:1px solid #00bcd488; border-radius:4px; padding:6px 14px; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px;">
                            <span>📂 Abrir Carpeta</span>
                        </button>
                        <button id="btnZipClose" class="btn" style="background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:6px 16px; font-size:0.85rem; cursor:pointer;">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        return {
            setStep(num, percent, subtext) {
                const bar = document.getElementById('zip-package-bar');
                if (bar) bar.style.width = `${percent}%`;
                const sub = document.getElementById('zip-package-subtext');
                if (sub && subtext) sub.innerHTML = subtext;
                for (let i = 1; i <= 4; i++) {
                    const el = document.getElementById(`zstep-${i}`);
                    if (!el) continue;
                    const icon = el.querySelector('.pstep-icon');
                    if (i < num) {
                        el.className = 'pipeta-update-step-item done';
                        if (icon) icon.textContent = '✅';
                    } else if (i === num) {
                        el.className = 'pipeta-update-step-item active';
                        if (icon) {
                            if (i === 1) icon.textContent = '📂';
                            if (i === 2) icon.textContent = '🗜️';
                            if (i === 3) icon.textContent = '📜';
                            if (i === 4) icon.textContent = '🎉';
                        }
                    } else {
                        el.className = 'pipeta-update-step-item';
                        if (icon) icon.textContent = '○';
                    }
                }
            },
            complete(data) {
                const bar = document.getElementById('zip-package-bar');
                if (bar) {
                    bar.style.width = '100%';
                    bar.classList.remove('animated-stripes');
                    bar.style.background = '#a3be8c';
                }
                const sub = document.getElementById('zip-package-subtext');
                if (sub) sub.innerHTML = `<span style="color:#a3be8c; font-weight:bold;">✅ ¡Empaquetado finalizado con éxito!</span>`;
                for (let i = 1; i <= 4; i++) {
                    const el = document.getElementById(`zstep-${i}`);
                    if (el) {
                        el.className = 'pipeta-update-step-item done';
                        const icon = el.querySelector('.pstep-icon');
                        if (icon) icon.textContent = '✅';
                    }
                }
                const resDiv = document.getElementById('zip-package-result');
                const summaryDiv = document.getElementById('zip-package-summary');
                if (resDiv && summaryDiv) {
                    summaryDiv.innerHTML = `
                        Generado: <code>${data.zipName}</code> (${data.sizeFormatted})<br>
                        Lanzador: <code>${data.batName}</code>
                    `;
                    resDiv.style.display = 'block';

                    const openBtn = document.getElementById('btnZipOpenFolder');
                    if (openBtn) {
                        openBtn.onclick = () => {
                            if (window.API?.fs?.openFolder) {
                                window.API.fs.openFolder((data.targetDir || '').replace(/\\/g, '/'));
                            }
                        };
                    }
                    const closeBtn = document.getElementById('btnZipClose');
                    if (closeBtn) {
                        closeBtn.onclick = () => backdrop.remove();
                    }
                }
            },
            error(err) {
                const bar = document.getElementById('zip-package-bar');
                if (bar) {
                    bar.style.background = '#f44336';
                    bar.classList.remove('animated-stripes');
                }
                const sub = document.getElementById('zip-package-subtext');
                if (sub) sub.innerHTML = `<span style="color:#f44336; font-weight:bold;">❌ Error al generar .ZIP: ${err}</span>`;
                const resDiv = document.getElementById('zip-package-result');
                if (resDiv) {
                    resDiv.style.display = 'block';
                    const summaryDiv = document.getElementById('zip-package-summary');
                    if (summaryDiv) summaryDiv.innerHTML = `<span style="color:#ff6b6b;">${err}</span>`;
                    const openBtn = document.getElementById('btnZipOpenFolder');
                    if (openBtn) openBtn.style.display = 'none';
                    const closeBtn = document.getElementById('btnZipClose');
                    if (closeBtn) closeBtn.onclick = () => backdrop.remove();
                }
            }
        };
    },

    runZipPackaging: async function() {
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('export_portable_zip')) {
            alert("🔒 No tienes permisos para generar versiones portables (.zip).");
            return;
        }
        return settings.executePackageZip();
    },

    executePackageZip: async function() {
        const input = document.getElementById('pkgTargetDir');
        const targetDir = (input ? input.value : settings.pkgTargetDir || 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS').trim();
        if (!targetDir) {
            alert("Por favor especifica una carpeta de salida para el archivo .ZIP.");
            return;
        }

        const includeRamon = document.getElementById('pkgIncludeRamon')?.checked || false;
        const includeDriveCache = document.getElementById('pkgIncludeSyncCacheDrive')?.checked || document.getElementById('pkgIncludeDriveCache')?.checked || false;
        const includeServerCache = document.getElementById('pkgIncludeSyncCacheServer')?.checked || document.getElementById('pkgIncludeServerCache')?.checked || false;

        const btn = document.getElementById('btnRunPackageZip') || document.getElementById('pkgGenerateBtn');
        const zipName = includeRamon 
            ? `Pipeta_${window.APP_VERSION || 'v1.1.67'}_Ramon.zip` 
            : `Pipeta_${window.APP_VERSION || 'v1.1.67'}.zip`;

        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.7';
        }

        const modal = settings.showZipPackagingModal(zipName);
        modal.setStep(1, 20, 'Preparando base de código y presets locales...');

        const t1 = setTimeout(() => {
            modal.setStep(2, 50, includeRamon 
                ? 'Comprimiendo Pipeta con entorno de Ramón (esto puede demorar unos segundos)...' 
                : 'Comprimiendo runtime y archivos en .ZIP...');
        }, 1200);

        try {
            const res = await fetch('/api/system/package-dist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    targetDir: targetDir, 
                    includeRamon: includeRamon,
                    includeDriveCache: includeDriveCache,
                    includeServerCache: includeServerCache
                })
            });

            clearTimeout(t1);
            const data = await res.json();
            if (data && data.success) {
                modal.setStep(3, 85, 'Generando script instalador .BAT...');
                setTimeout(() => {
                    modal.setStep(4, 98, 'Verificando archivo .ZIP generado...');
                    setTimeout(() => {
                        modal.complete(data);
                    }, 400);
                }, 400);
            } else {
                throw new Error(data ? data.error : 'Error desconocido del servidor');
            }
        } catch(e) {
            clearTimeout(t1);
            console.error("Package error:", e);
            modal.error(e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }
    },

    confirmExportPresets: () => {
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('presets_allow_publish')) {
            alert("🔒 No tienes permisos para publicar presets.");
            return;
        }
        const targetInput = document.getElementById('expTargetPath');
        let targetRoot = (targetInput ? targetInput.value : '').trim();
        if (!targetRoot) {
            settings.showToast("Por favor especifica una ruta de destino válida.", "warn", 4);
            return;
        }
        targetRoot = targetRoot.replace(/\\/g, '/').replace(/\/+$/, '');

        const doShot = document.getElementById('expOptShotDesigner')?.checked;
        const doAsset = document.getElementById('expOptAssetDesigner')?.checked;
        const doProj = document.getElementById('expOptProjects')?.checked;
        const doUsers = document.getElementById('expOptUsers')?.checked;
        const doStatuses = document.getElementById('expOptStatuses')?.checked;
        const doIa = document.getElementById('expOptIaTokens')?.checked;
        const doConfig = document.getElementById('expOptConfig')?.checked;

        const itemsList = [];
        if (doShot) itemsList.push('🎬 Presets de Shot Designer (ShotDesigner/*.json)');
        if (doAsset) itemsList.push('🎨 Presets de Asset Designer (AssetDesigner/*.json)');
        if (doProj) itemsList.push('📁 Proyectos Configurados (Projects/*.json)');
        if (doUsers) itemsList.push('👥 Usuarios y Roles (users_config.json)');
        if (doStatuses) itemsList.push('🏷️ Estados de Procesos y Planos (status_config.json)');
        if (doIa) itemsList.push('🤖 Tokens IA Personalizados (ia_custom_tokens.json)');
        if (doConfig) itemsList.push('⚙️ Configuración General (config.json, pipeline_config.json)');

        if (itemsList.length === 0) {
            settings.showToast("Por favor selecciona al menos un elemento para exportar.", "warn", 4);
            return;
        }

        const detailsHTML = `
            <div style="color:#aaa; margin-bottom:6px;">Ruta de Destino (Red):</div>
            <div style="color:var(--accent); font-family:monospace; word-break:break-all; font-weight:bold; margin-bottom:10px;">${targetRoot}</div>
            <div style="color:#aaa; margin-bottom:6px;">Elementos seleccionados (${itemsList.length}):</div>
            <ul style="margin:0; padding-left:18px; color:#ddd; display:flex; flex-direction:column; gap:3px;">
                ${itemsList.map(item => `<li>${item}</li>`).join('')}
            </ul>
        `;

        settings.showConfirmModal({
            title: 'Publicar / Exportar Presets',
            icon: '📤',
            message: '¿Confirmas la publicación y exportación de las configuraciones y presets seleccionados hacia la unidad de red compartida para el equipo?',
            details: detailsHTML,
            confirmText: 'CONFIRMAR Y PUBLICAR',
            confirmColor: 'var(--accent)',
            confirmTextColor: '#000',
            onConfirm: async () => {
                await settings.executeExportPresets();
            }
        });
    },

    executeExportPresets: async () => {
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('presets_allow_publish')) {
            alert("🔒 No tienes permisos para publicar presets.");
            return;
        }
        const targetInput = document.getElementById('expTargetPath');
        let targetRoot = (targetInput ? targetInput.value : '').trim();
        if (!targetRoot) {
            settings.showToast("Por favor especifica una ruta de destino válida.", "warn", 4);
            return;
        }
        targetRoot = targetRoot.replace(/\\/g, '/').replace(/\/+$/, '');

        const doShot = document.getElementById('expOptShotDesigner')?.checked;
        const doAsset = document.getElementById('expOptAssetDesigner')?.checked;
        const doProj = document.getElementById('expOptProjects')?.checked;
        const doUsers = document.getElementById('expOptUsers')?.checked;
        const doStatuses = document.getElementById('expOptStatuses')?.checked;
        const doIa = document.getElementById('expOptIaTokens')?.checked;
        const doConfig = document.getElementById('expOptConfig')?.checked;

        const statusMsg = document.getElementById('expStatusMsg');
        if (statusMsg) {
            statusMsg.innerHTML = '<span style="color:var(--accent);">⏳ Exportando presets a ' + targetRoot + '...</span>';
        }

        const localPresetsRoot = "C:/TOOLS/APPS/Pipeta/presets";
        let exportedCount = 0;
        let errors = [];

        async function copyDirectory(subfolder) {
            const srcDir = `${localPresetsRoot}/${subfolder}`;
            const files = await API.fs.getFiles(srcDir);
            for (const f of files) {
                if (f.endsWith('.json')) {
                    const content = await API.fs.readFile(`${srcDir}/${f}`);
                    if (content !== null) {
                        const dstPath = `${targetRoot}/${subfolder}/${f}`;
                        const res = await API.fs.writeFile(dstPath, content);
                        if (res && res.success) {
                            exportedCount++;
                        } else {
                            errors.push(`Error al escribir ${dstPath}: ${res?.error || 'Desconocido'}`);
                        }
                    }
                }
            }
        }

        async function copySingleFile(fileName) {
            const srcPath = `${localPresetsRoot}/${fileName}`;
            const content = await API.fs.readFile(srcPath);
            if (content !== null) {
                const dstPath = `${targetRoot}/${fileName}`;
                const res = await API.fs.writeFile(dstPath, content);
                if (res && res.success) {
                    exportedCount++;
                } else {
                    errors.push(`Error al escribir ${dstPath}: ${res?.error || 'Desconocido'}`);
                }
            }
        }

        try {
            if (doShot) await copyDirectory('ShotDesigner');
            if (doAsset) await copyDirectory('AssetDesigner');
            if (doProj) await copyDirectory('Projects');
            if (doUsers) await copySingleFile('users_config.json');
            if (doStatuses) await copySingleFile('status_config.json');
            if (doIa) await copySingleFile('ia_custom_tokens.json');
            if (doConfig) {
                await copySingleFile('config.json');
                await copySingleFile('pipeline_config.json');
            }

            if (errors.length > 0) {
                if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">⚠️ ${exportedCount} archivos exportados con ${errors.length} errores.</span>`;
                settings.showToast(`Exportación con errores: ${exportedCount} exportados, ${errors.length} fallos.`, 'warn', 6, errors.slice(0, 2).join(' | '));
            } else if (exportedCount === 0) {
                if (statusMsg) statusMsg.innerHTML = `<span style="color:#ffb74d;">ℹ️ No se encontraron archivos para exportar en las opciones seleccionadas.</span>`;
                settings.showToast("No se encontraron archivos para exportar.", "warn", 4);
            } else {
                if (statusMsg) statusMsg.innerHTML = `<span style="color:#4caf50;">✅ ¡${exportedCount} archivos exportados con éxito a ${targetRoot}!</span>`;
                settings.showToast(`¡${exportedCount} archivos y configuraciones exportados correctamente!`, 'success', 5, `Destino: ${targetRoot}`);
            }
        } catch(e) {
            console.error("Export error:", e);
            if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">❌ Error en la exportación: ${e.message}</span>`;
            settings.showToast("Error al exportar: " + e.message, "error", 5);
        }
    },

    // --- USERS & STATUSES ACTIONS ---
    loadUsersConfig: async () => {
        try {
            settings.usersData = await API.users.get();
        } catch(e) {
            console.error("Error loading users config:", e);
        }
    },

    saveUsersConfig: async () => {
        try {
            await API.users.save(settings.usersData);
        } catch(e) {
            console.error("Error saving users config:", e);
        }
    },

    updateUsersConfigProp: async (prop, value) => {
        if (!settings.usersData) settings.usersData = { users: [], roles: [] };
        settings.usersData[prop] = value;
        await settings.saveUsersConfig();
        settings.render();
        settings.showToast("Configuración de usuarios actualizada", "success", 2);
    },

    setActiveUser: async (laspUser) => {
        try {
            await API.users.setActive(laspUser);
            if (settings.usersData) settings.usersData.activeUser = laspUser;
            if (typeof ShotNavigator !== 'undefined') {
                ShotNavigator.activeUser = laspUser;
                ShotNavigator.render();
            }
            settings.render();
        } catch(e) {
            alert("Error al cambiar usuario activo: " + e.message);
        }
    },

    openUserModal: (userId = null) => {
        const uData = settings.usersData || { users: [], roles: [] };
        const user = userId ? (uData.users || []).find(u => u.id === userId) : null;
        const isEditing = !!user;

        const overlay = document.createElement('div');
        overlay.id = 'pipeta-settings-modal-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(5,7,11,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; transform:translateZ(0); will-change:opacity;';

        const rolesOptions = (uData.roles || []).map(r => `
            <option value="${r.id}" ${user?.role === r.id ? 'selected' : ''}>${r.name} (${r.id})</option>
        `).join('');

        overlay.innerHTML = `
            <div style="background:#14171e; border:1px solid #28303d; border-radius:8px; width:540px; max-width:92vw; padding:22px; box-shadow:0 10px 30px rgba(0,0,0,0.7); color:#eee;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #28303d; padding-bottom:12px; margin-bottom:16px;">
                    <b style="font-size:1.05rem; color:var(--accent);">${isEditing ? '✏️ Editar Usuario' : '👤 Nuevo Usuario'}</b>
                    <button class="icon-btn" onclick="settings.closeModalOverlay()" style="background:transparent; border:none; color:#888; font-size:1.2rem; cursor:pointer;">&times;</button>
                </div>

                <div style="display:flex; flex-direction:column; gap:12px; font-size:0.82rem;">
                    <div>
                        <label style="color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">Nombre de Usuario *</label>
                        <input id="modal-u-username" type="text" value="${user?.username || ''}" placeholder="artista compo" 
                               style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; font-family:monospace; outline:none;">
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Nombre</label>
                            <input id="modal-u-firstname" type="text" value="${user?.firstName || ''}" placeholder="" 
                                   oninput="settings.updateLaspFieldFromNames()"
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Apellido</label>
                            <input id="modal-u-lastname" type="text" value="${user?.lastName || ''}" placeholder="" 
                                   oninput="settings.updateLaspFieldFromNames()"
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Usuario LASP</label>
                            <input id="modal-u-lasp" type="text" value="${user?.laspUser || ''}" placeholder="lasp-aroberto" 
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:var(--accent); font-family:monospace; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Rol Asignado *</label>
                            <select id="modal-u-role" style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                                ${rolesOptions}
                            </select>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Email</label>
                            <input id="modal-u-email" type="email" value="${user?.email || ''}" placeholder="" 
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Color Avatar</label>
                            <input id="modal-u-color" type="color" value="${user?.avatarColor || '#ff9800'}" 
                                   style="width:100%; height:32px; background:#1c222d; border:1px solid #2e3846; border-radius:4px; cursor:pointer; padding:2px;">
                        </div>
                    </div>

                    <div>
                        <label style="color:#aaa; display:block; margin-bottom:4px;">Notas</label>
                        <input id="modal-u-notes" type="text" value="${user?.notes || ''}" placeholder="" 
                               style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                    </div>

                    <!-- EXCEPCIONES DE PERMISOS POR USUARIO -->
                    <div style="background:#101319; border:1px solid #232a35; border-radius:6px; padding:10px 12px; margin-top:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-weight:bold; color:var(--accent); font-size:0.78rem; text-transform:uppercase;">
                                🛡️ Excepciones de Permisos por Usuario (Overrides)
                            </span>
                            <span style="color:#777; font-size:0.70rem;">Sobrescribe el Rol</span>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.74rem;">
                            ${(() => {
                                const uOv = user?.permissionOverrides || {};
                                const perms = [
                                    { key: 'explorer_allow_drive', label: '☁️ Drive (Explorar & Comparar)' },
                                    { key: 'settings_allow_advanced', label: '🛠️ Ajustes Avanzados' },
                                    { key: 'export_portable_zip', label: '📦 Exportar ZIP Portable' },
                                    { key: 'presets_allow_publish', label: '🚀 Publicar Presets' },
                                    { key: 'projects_allow_edit', label: '📁 Editar Proyectos' },
                                    { key: 'ia_ingest_allow_higgsfield', label: '⚡ Higgsfield en IA Ingest' }
                                ];
                                return perms.map(p => `
                                    <div style="display:flex; justify-content:space-between; align-items:center; background:#161b22; padding:4px 6px; border-radius:4px; border:1px solid #252d3a;">
                                        <span style="color:#ccc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:4px;">${p.label}</span>
                                        <select data-user-override-key="${p.key}" style="background:#0d1117; color:#eee; border:1px solid #333; border-radius:3px; padding:1px 4px; font-size:0.70rem;">
                                            <option value="" ${uOv[p.key] === undefined ? 'selected' : ''}>Rol Base</option>
                                            <option value="true" ${uOv[p.key] === true ? 'selected' : ''} style="color:#81c784;">✓ Permitir</option>
                                            <option value="false" ${uOv[p.key] === false ? 'selected' : ''} style="color:#ef5350;">✗ Bloquear</option>
                                        </select>
                                    </div>
                                `).join('');
                            })()}
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid #28303d; padding-top:14px;">
                    <button class="btn" onclick="settings.closeModalOverlay()" style="background:#222; color:#ccc; border:1px solid #444; padding:6px 14px; border-radius:4px; cursor:pointer;">Cancelar</button>
                    <button class="btn" onclick="settings.saveUserModal('${userId || ''}')" style="background:var(--accent); color:black; font-weight:bold; border:none; padding:6px 16px; border-radius:4px; cursor:pointer;">
                        ${isEditing ? 'Guardar Cambios' : 'Crear Usuario'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    },

    updateLaspFieldFromNames: () => {
        const fn = document.getElementById('modal-u-firstname')?.value.trim() || '';
        const ln = document.getElementById('modal-u-lastname')?.value.trim() || '';
        const laspInput = document.getElementById('modal-u-lasp');
        if (!laspInput) return;

        if (fn || ln) {
            const cleanFn = fn.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanLn = ln.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
            const initial = cleanFn.length > 0 ? cleanFn[0] : '';
            laspInput.value = `lasp-${initial}${cleanLn}`;
        } else {
            laspInput.value = '';
        }
    },

    saveUserModal: async (existingId) => {
        const username = document.getElementById('modal-u-username')?.value.trim();
        if (!username) {
            alert("El nombre de usuario es obligatorio.");
            return;
        }

        const firstName = document.getElementById('modal-u-firstname')?.value.trim() || '';
        const lastName = document.getElementById('modal-u-lastname')?.value.trim() || '';
        const laspUser = document.getElementById('modal-u-lasp')?.value.trim() || (firstName && lastName ? `lasp-${firstName[0].toLowerCase()}${lastName.toLowerCase().replace(/\s+/g, '')}` : `lasp-${username}`);
        const role = document.getElementById('modal-u-role')?.value || 'user';
        const email = document.getElementById('modal-u-email')?.value.trim() || '';
        const avatarColor = document.getElementById('modal-u-color')?.value || '#ff9800';
        const notes = document.getElementById('modal-u-notes')?.value.trim() || '';

        if (!settings.usersData) settings.usersData = { users: [], roles: [] };
        if (!settings.usersData.users) settings.usersData.users = [];

        const overrides = {};
        document.querySelectorAll('[data-user-override-key]').forEach(sel => {
            const k = sel.getAttribute('data-user-override-key');
            const v = sel.value;
            if (v === 'true') overrides[k] = true;
            else if (v === 'false') overrides[k] = false;
        });

        if (existingId) {
            const u = settings.usersData.users.find(x => x.id === existingId);
            if (u) {
                u.username = username;
                u.firstName = firstName;
                u.lastName = lastName;
                u.laspUser = laspUser;
                u.role = role;
                u.email = email;
                u.avatarColor = avatarColor;
                u.notes = notes;
                if (Object.keys(overrides).length > 0) u.permissionOverrides = overrides;
                else delete u.permissionOverrides;
            }
        } else {
            const newUserObj = {
                id: 'u_' + username.replace(/[^a-zA-Z0-9_]/g, '_') + '_' + Date.now().toString().slice(-4),
                username,
                firstName,
                lastName,
                laspUser,
                role,
                email,
                avatarColor,
                notes,
                isSystem: false
            };
            if (Object.keys(overrides).length > 0) newUserObj.permissionOverrides = overrides;
            settings.usersData.users.push(newUserObj);
        }

        await settings.saveUsersConfig();
        settings.closeModalOverlay();
        settings.render();
        if (typeof updateHeaderUserSelector === 'function') updateHeaderUserSelector();
        if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
    },

    deleteUser: async (userId) => {
        const u = (settings.usersData?.users || []).find(x => x.id === userId || x.laspUser === userId || x.username === userId);
        if (u && (u.isSystem || u.username === 'admin' || u.username === 'user')) {
            settings.showToast(`El usuario "${u.username || u.laspUser}" es un usuario por defecto del sistema y no se puede borrar.`, "warn", 4);
            return;
        }

        settings.showConfirmModal({
            title: 'Eliminar Usuario',
            icon: '👤',
            message: `¿Estás seguro de que deseas eliminar al usuario <b>"${u?.username || userId}"</b>?`,
            confirmText: 'Eliminar Usuario',
            confirmColor: '#f44336',
            confirmTextColor: '#fff',
            onConfirm: async () => {
                if (settings.usersData && settings.usersData.users) {
                    settings.usersData.users = settings.usersData.users.filter(x => x.id !== userId && x.laspUser !== userId && x.username !== userId);
                    await settings.saveUsersConfig();
                    settings.render();
                    if (typeof updateHeaderUserSelector === 'function') updateHeaderUserSelector();
                    if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
                    settings.showToast(`Usuario "${u?.username || userId}" eliminado.`, "success", 3);
                }
            }
        });
    },

    openRoleModal: (roleId = null) => {
        const uData = settings.usersData || { users: [], roles: [] };
        const role = roleId ? (uData.roles || []).find(r => r.id === roleId) : null;
        const isEditing = !!role;
        const perms = role?.permissions || {};

        const overlay = document.createElement('div');
        overlay.id = 'pipeta-settings-modal-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(5,7,11,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; transform:translateZ(0); will-change:opacity;';

        const permCheckbox = (key, label, icon) => `
            <label style="display:flex; align-items:center; gap:8px; background:#181d26; border:1px solid #28303d; border-radius:4px; padding:6px 10px; cursor:pointer; font-size:0.78rem;">
                <input type="checkbox" id="perm_${key}" ${perms[key] !== false && (isEditing ? perms[key] : true) ? 'checked' : ''} style="cursor:pointer; accent-color:var(--accent);">
                <span>${icon} ${label}</span>
            </label>
        `;

        overlay.innerHTML = `
            <div style="background:#14171e; border:1px solid #28303d; border-radius:8px; width:560px; max-width:92vw; padding:22px; box-shadow:0 10px 30px rgba(0,0,0,0.7); color:#eee; max-height:90vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #28303d; padding-bottom:12px; margin-bottom:16px;">
                    <b style="font-size:1.05rem; color:var(--accent);">${isEditing ? `✏️ Editar Rol: ${role.name}` : '🛡️ Nuevo Rol de Usuario'}</b>
                    <button class="icon-btn" onclick="settings.closeModalOverlay()" style="background:transparent; border:none; color:#888; font-size:1.2rem; cursor:pointer;">&times;</button>
                </div>

                <div style="display:flex; flex-direction:column; gap:12px; font-size:0.82rem;">
                    <div style="display:grid; grid-template-columns:1fr 2fr 1fr; gap:10px;">
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">ID del Rol *</label>
                            <input id="modal-r-id" type="text" value="${role?.id || ''}" ${isEditing ? 'disabled' : ''} placeholder="ej: lead" 
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; font-family:monospace; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">Nombre del Rol *</label>
                            <input id="modal-r-name" type="text" value="${role?.name || ''}" placeholder="ej: Lead Supervisor" 
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Color</label>
                            <input id="modal-r-color" type="color" value="${role?.color || '#00bcd4'}" 
                                   style="width:100%; height:32px; background:#1c222d; border:1px solid #2e3846; border-radius:4px; cursor:pointer; padding:2px;">
                        </div>
                    </div>

                    <div>
                        <label style="color:#aaa; display:block; margin-bottom:4px;">Descripción</label>
                        <input id="modal-r-desc" type="text" value="${role?.description || ''}" placeholder="Descripción breve de responsabilidades" 
                               style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                    </div>

                    <!-- Permisos de Módulos & Vistas -->
                    <div style="margin-top:6px;">
                        <b style="color:var(--accent); font-size:0.8rem; display:block; margin-bottom:6px;">Acceso a Módulos Principales (Sidebar):</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('access_explorer', 'Explorer (Árbol y Miller)', '📁')}
                            ${permCheckbox('access_shot_navigator', 'Shot Navigator (Workflow)', '🎬')}
                            ${permCheckbox('access_asset_designer', 'Asset Designer', '📦')}
                            ${permCheckbox('access_shot_designer', 'Shot Designer', '🛠️')}
                            ${permCheckbox('access_ia_ingest', 'IA Ingest', '🤖')}
                        </div>
                    </div>

                    <!-- Permisos de Tools -->
                    <div style="margin-top:6px;">
                        <b style="color:#4fc3f7; font-size:0.8rem; display:block; margin-bottom:6px;">Acceso a Herramientas (Pipeline Tools):</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('access_tool_naming_validator', 'Naming Validator', '🏷️')}
                            ${permCheckbox('access_tool_sync_analyze', 'Sync Analyzer (Local ↔ Online)', '🔄')}
                            ${permCheckbox('access_tool_file_auditor', 'File Auditor', '🔍')}
                            ${permCheckbox('access_tool_asset_creator', 'Asset Creator', '📦➕')}
                            ${permCheckbox('access_tool_shot_creator', 'Shot Creator', '🎬➕')}
                        </div>
                    </div>

                    <!-- Permisos de Workflow & Tracker -->
                    <div style="margin-top:6px;">
                        <b style="color:#8bc34a; font-size:0.8rem; display:block; margin-bottom:6px;">Workflow & Shot Navigator:</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('assignAllShots', 'Asignar a otros artistas', '👥')}
                            ${permCheckbox('workflow_edit_statuses', 'Cambiar estados de procesos', '🏷️')}
                            ${permCheckbox('workflow_create_folders', 'Crear carpetas en disco', '📁➕')}
                            ${permCheckbox('exportPackages', 'Exportar paquetes de tareas', '📦📤')}
                        </div>
                    </div>

                    <!-- Permisos de Explorer -->
                    <div style="margin-top:6px;">
                        <b style="color:#ffb74d; font-size:0.8rem; display:block; margin-bottom:6px;">Acciones en Explorer de Archivos:</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('explorer_create_folder', 'Crear carpetas', '📁')}
                            ${permCheckbox('explorer_delete_items', 'Eliminar archivos/carpetas', '🗑️')}
                            ${permCheckbox('explorer_rename_items', 'Renombrar archivos/carpetas', '✏️')}
                            ${permCheckbox('explorer_open_desktop', 'Abrir en Windows Explorer', '🖥️')}
                        </div>
                    </div>

                    <!-- Permisos de Admin -->
                    <div style="margin-top:6px;">
                        <b style="color:#e91e63; font-size:0.8rem; display:block; margin-bottom:6px;">Privilegios de Administración & Sistema:</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('manageUsers', 'Gestionar Usuarios & Roles', '👥')}
                            ${permCheckbox('manageSettings', 'Configuraciones Globales', '⚙️')}
                            ${permCheckbox('manageStatuses', 'Diseñador de Estados', '🏷️')}
                        </div>
                    </div>

                    <!-- CATEGORÍA 6: SEGURIDAD, PRESETS & RESTRICCIONES -->
                    <div style="margin-bottom:12px; background:#14171d; padding:10px; border-radius:6px; border:1px solid #232a35;">
                        <div style="font-weight:bold; color:#ab47bc; font-size:0.8rem; margin-bottom:8px; text-transform:uppercase;">
                            🔒 Seguridad, Presets & Restricciones
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('explorer_allow_drive', 'Acceso y Comparación con Drive', '☁️')}
                            ${permCheckbox('settings_allow_advanced', 'Configuraciones Avanzadas', '🛠️')}
                            ${permCheckbox('export_portable_zip', 'Empaquetar Versión Portable (.zip)', '📦')}
                            ${permCheckbox('presets_allow_publish', 'Publicar Presets del Estudio', '🚀')}
                            ${permCheckbox('projects_allow_edit', 'Editar / Crear Proyectos', '📁')}
                            ${permCheckbox('ia_ingest_allow_higgsfield', 'Funciones e Integración Higgsfield IA', '⚡')}
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid #28303d; padding-top:14px;">
                    <button class="btn" onclick="settings.closeModalOverlay()" style="background:#222; color:#ccc; border:1px solid #444; padding:6px 14px; border-radius:4px; cursor:pointer;">Cancelar</button>
                    <button class="btn" onclick="settings.saveRoleModal('${roleId || ''}')" style="background:#00bcd4; color:black; font-weight:bold; border:none; padding:6px 16px; border-radius:4px; cursor:pointer;">
                        ${isEditing ? 'Guardar Cambios' : 'Crear Rol'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    },

    saveRoleModal: async (existingId) => {
        const id = (existingId || document.getElementById('modal-r-id')?.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
        const name = document.getElementById('modal-r-name')?.value.trim();
        if (!id || !name) {
            alert("ID y Nombre del rol son obligatorios.");
            return;
        }

        const color = document.getElementById('modal-r-color')?.value || '#00bcd4';
        const description = document.getElementById('modal-r-desc')?.value.trim() || '';

        const permKeys = [
            'access_explorer', 'access_shot_navigator', 'access_asset_designer', 'access_shot_designer', 'access_ia_ingest',
            'access_tool_naming_validator', 'access_tool_sync_analyze', 'access_tool_file_auditor', 'access_tool_asset_creator', 'access_tool_shot_creator',
            'assignAllShots', 'workflow_edit_statuses', 'workflow_create_folders', 'exportPackages',
            'explorer_create_folder', 'explorer_delete_items', 'explorer_rename_items', 'explorer_open_desktop',
            'manageUsers', 'manageSettings', 'manageStatuses',
            'explorer_allow_drive', 'settings_allow_advanced', 'export_portable_zip', 'presets_allow_publish', 'projects_allow_edit', 'ia_ingest_allow_higgsfield'
        ];

        const permissions = {};
        permKeys.forEach(k => {
            const el = document.getElementById(`perm_${k}`);
            permissions[k] = el ? el.checked : true;
        });

        if (!settings.usersData) settings.usersData = { users: [], roles: [] };
        if (!settings.usersData.roles) settings.usersData.roles = [];

        if (existingId) {
            const r = settings.usersData.roles.find(x => x.id === existingId);
            if (r) {
                r.name = name;
                r.color = color;
                r.description = description;
                r.permissions = permissions;
            }
        } else {
            settings.usersData.roles.push({
                id,
                name,
                color,
                description,
                permissions,
                isSystem: false
            });
        }

        await settings.saveUsersConfig();
        settings.closeModalOverlay();
        settings.render();
        if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
    },

    deleteRole: async (roleId) => {
        const r = (settings.usersData?.roles || []).find(x => x.id === roleId);
        if (r && (r.isSystem || roleId === 'admin' || roleId === 'user')) {
            settings.showToast(`El rol "${r.name}" es un rol por defecto del sistema y no se puede borrar.`, "warn", 4);
            return;
        }

        settings.showConfirmModal({
            title: 'Eliminar Rol',
            icon: '🛡️',
            message: `¿Estás seguro de que deseas eliminar el rol <b>"${r?.name || roleId}"</b>?`,
            confirmText: 'Eliminar Rol',
            confirmColor: '#f44336',
            confirmTextColor: '#fff',
            onConfirm: async () => {
                if (settings.usersData && settings.usersData.roles) {
                    settings.usersData.roles = settings.usersData.roles.filter(x => x.id !== roleId);
                    await settings.saveUsersConfig();
                    settings.render();
                    if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
                    settings.showToast(`Rol "${r?.name || roleId}" eliminado.`, "success", 3);
                }
            }
        });
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

    changeAdminPasswordModal: async () => {
        const newPass = prompt("Ingresa la nueva contraseña de Administrador:");
        if (!newPass) return;
        if (newPass.length < 4) {
            settings.showToast("La contraseña debe tener al menos 4 caracteres.", "warn", 4);
            return;
        }

        try {
            await API.users.save({ ...settings.usersData, adminPassword: newPass });
            settings.showToast("Contraseña de Administrador actualizada con éxito.", "success", 4);
        } catch(e) {
            settings.showToast("Error al actualizar contraseña: " + e.message, "error", 5);
        }
    },

    loadStatusesConfig: async () => {
        try {
            settings.statusesData = await API.statuses.get();
        } catch(e) {
            console.error("Error loading statuses config:", e);
        }
    },

    saveStatusesConfig: async () => {
        try {
            await API.statuses.save(settings.statusesData);
        } catch(e) {
            console.error("Error saving statuses config:", e);
        }
    },

    addStatusModal: async () => {
        const name = prompt("Nombre del Estado (ej: En Review, Aprobado Técnico):");
        if (!name) return;

        const id = name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const icon = prompt("Icono o Emoji distintivo (ej: 🟣, 🟢, 🚀, ⏳):", "🟣") || "🟣";
        const color = prompt("Color HEX (ej: #9c27b0, #4caf50):", "#9c27b0") || "#9c27b0";
        const scope = prompt("Ámbito (both, shots, assets):", "both") || "both";

        if (!settings.statusesData) settings.statusesData = { statuses: [] };
        if (!settings.statusesData.statuses) settings.statusesData.statuses = [];

        settings.statusesData.statuses.push({
            id,
            name: name.trim(),
            color: color.trim(),
            icon: icon.trim(),
            scope: scope.trim(),
            isDefault: false
        });

        await settings.saveStatusesConfig();
        settings.render();
        settings.showToast(`Estado "${name}" creado con éxito.`, "success", 3);
    },

    deleteStatus: async (statusId) => {
        settings.showConfirmModal({
            title: 'Eliminar Estado',
            icon: '🏷️',
            message: `¿Estás seguro de que deseas eliminar el estado <b>"${statusId}"</b>?`,
            confirmText: 'Eliminar Estado',
            confirmColor: '#f44336',
            confirmTextColor: '#fff',
            onConfirm: async () => {
                if (settings.statusesData && settings.statusesData.statuses) {
                    settings.statusesData.statuses = settings.statusesData.statuses.filter(s => s.id !== statusId);
                    await settings.saveStatusesConfig();
                    settings.render();
                    settings.showToast(`Estado "${statusId}" eliminado.`, "success", 3);
                }
            }
        });
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
