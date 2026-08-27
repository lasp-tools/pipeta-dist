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
        motorsVideo: ["SD2", "SD25", "VEO3", "VO31", "GOMN", "NBN2", "NB2P"],
        motorsImage: ["NB2P", "MJ", "FLUX", "SD2", "SD25", "GOMN"],
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
    }
};

const settings = {
    isVisible: false,
    currentCategory: 'proyecto',
    projectSubTab: 'id_nombre',
    container: null,
    devMode: false,

    // Persistence Logic
    projects: [],
    currentProject: null,
    projectsPath: "C:\\TOOLS\\APPS\\Pipeta\\presets\\Projects",
    configPath: "C:\\TOOLS\\APPS\\Pipeta\\presets\\config.json",

    // Logging
    loggingEnabled: true,
    logsPath: "C:\\TOOLS\\APPS\\Pipeta\\logs",

    // Copy Engine (auto | native)
    copyEngine: 'auto',
    exportPresetsPath: "Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets",

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
        settings.open();
        settings.setCategory('exportar');
    },

    getBaseProject: () => {
        return settings.projects.find(p => p.id === 'proj_base' || p.isBase) || CANONICAL_BASE_PRESETS;
    },

    loadPresets: async () => {
        settings.presetsList = [];
        const seenKeys = new Set();
        const basePaths = [
            "C:\\TOOLS\\APPS\\Pipeta\\presets",
            settings.exportPresetsPath
        ].filter(Boolean);

        const subDirs = ['AssetDesigner', 'ShotDesigner'];

        try {
            if (window.API && API.fs && API.fs.getFiles) {
                for (const basePath of basePaths) {
                    for (const sub of subDirs) {
                        const dir = basePath + "\\" + sub;
                        try {
                            const files = await API.fs.getFiles(dir);
                            for (const f of files) {
                                if (f.endsWith('.json')) {
                                    const content = await API.fs.readFile(dir + "\\" + f);
                                    if (content) {
                                        try {
                                            const p = JSON.parse(content);
                                            const pId = p.id || f.replace('.json', '');
                                            const pName = p.name || pId;
                                            const type = sub.includes('Asset') ? 'asset' : 'shot';
                                            const key = `${type}_${pId.toLowerCase()}`;
                                            if (!seenKeys.has(key)) {
                                                seenKeys.add(key);
                                                settings.presetsList.push({
                                                    id: pId,
                                                    name: pName,
                                                    type: type,
                                                    fullPath: dir + "\\" + f
                                                });
                                            }
                                        } catch (e) { }
                                    }
                                }
                            }
                        } catch (errDir) {
                            // Directory might not exist on network/local, ignore
                        }
                    }
                }
            }
        } catch (e) { console.error("Error loading presets for settings", e); }
    },

    loadConfig: async () => {
        try {
            if (window.API && API.fs && API.fs.readFile) {
                const content = await API.fs.readFile(settings.configPath);
                if (content) {
                    const cfg = JSON.parse(content);
                    if (cfg.defaultViewMode) settings.defaultViewMode = cfg.defaultViewMode;

                    // Validation Presets
                    if (cfg.validationPresetAsset) settings.validationPresetAsset = cfg.validationPresetAsset;
                    if (cfg.validationPresetShot) settings.validationPresetShot = cfg.validationPresetShot;

                    // Logging
                    if (typeof cfg.loggingEnabled !== 'undefined') settings.loggingEnabled = cfg.loggingEnabled;
                    if (cfg.logsPath) settings.logsPath = cfg.logsPath;
                }
            }
        } catch (e) {
            console.warn("No config file found or error loading:", e);
        }
    },

    saveConfig: async () => {
        const cfg = {
            defaultViewMode: settings.defaultViewMode || 'local',
            validationPresetAsset: settings.validationPresetAsset || null,
            validationPresetShot: settings.validationPresetShot || null,
            loggingEnabled: settings.loggingEnabled,
            logsPath: settings.logsPath || 'C:\\TOOLS\\APPS\\Pipeta\\logs'
        };
        try {
            if (window.API && API.fs && API.fs.writeFile) {
                await API.fs.writeFile(settings.configPath, JSON.stringify(cfg, null, 2));
            }
        } catch (e) {
            console.error("Error saving config:", e);
        }
    },

    init: async () => {
        settings.container = document.getElementById('settings-window');
        settings.devMode = false;
        try { localStorage.removeItem('pipeta_dev_mode'); } catch(e){}
        settings.updateDevModeBanner();
        await settings.loadProjects();
        await settings.loadConfig();
        await settings.loadPresets(); // Pre-load presets for UI
        settings.updateHeaderProjectSelector();
    },

    updateSidebarButtonsState: () => {
        const btnSettings = document.getElementById('btn-settings-toggle');
        const topButtons = document.querySelectorAll('.sidebar-top .mode-btn');

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
        if (!settings.container) await settings.init();
        await settings.loadPresets();
        settings.isVisible = true;
        settings.render();
        settings.container.style.display = 'flex';
        settings.updateSidebarButtonsState();
    },

    toggleOpen: async () => {
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
        try {
            if (window.API && API.fs && API.fs.mkdir) {
                await API.fs.mkdir(settings.projectsPath);
            }

            const files = await API.fs.getFiles(settings.projectsPath);
            for (const f of files) {
                if (f.endsWith('.json')) {
                    const content = await API.fs.readFile(settings.projectsPath + "\\" + f);
                    if (content) {
                        try {
                            const proj = JSON.parse(content);
                            if (f === 'base.json' || proj.id === 'proj_base' || proj.isBase) {
                                proj.isBase = true;
                                proj.id = 'proj_base';
                                proj.name = 'Proyecto Base';
                            }
                            if (!proj.id) proj.id = 'proj_' + Math.random().toString(36).substr(2, 9);
                            settings.projects.push(proj);
                        } catch (e) { console.error("Error parsing proj", f, e); }
                    }
                }
            }
        } catch (e) {
            console.error("loadProjects error:", e);
        }

        // Asegurar que el Proyecto Base siempre exista
        let baseProj = settings.projects.find(p => p.id === 'proj_base' || p.isBase);
        if (!baseProj) {
            baseProj = JSON.parse(JSON.stringify(CANONICAL_BASE_PRESETS));
            settings.projects.unshift(baseProj);
        } else {
            // Reubicar al inicio
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
        const found = settings.projects.find(p => p.id === savedActiveId && p.id !== 'proj_base');
        settings.currentProject = found || settings.projects.find(p => !p.isBase) || settings.projects[0];
        
        settings.updateHeaderProjectSelector();
    },

    saveProject: async () => {
        if (!settings.currentProject) return;
        const isBase = settings.currentProject.id === 'proj_base' || settings.currentProject.isBase;
        const fileName = isBase ? "base.json" : (settings.currentProject.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
        const filePath = settings.projectsPath + "\\" + fileName;
        const content = JSON.stringify(settings.currentProject, null, 2);

        try {
            const result = await API.fs.writeFile(filePath, content);
            if (result && result.success) {
                console.log("Proyecto guardado:", fileName);
            } else {
                alert("Error al guardar proyecto: " + (result?.error || "Unknown"));
            }
        } catch (e) { console.error(e); }
        settings.render();
    },

    restoreBaseProjectCanon: async () => {
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

    newProject: () => {
        const name = prompt("Nombre del nuevo proyecto:", "Nuevo Proyecto");
        if (!name) return;

        const newProj = {
            id: 'proj_' + Date.now(),
            name: name,
            client: "cliente",
            projectCode: "proy",
            overrideBasePresets: false,
            roots: {
                work: "Z:/",
                media: "Z:/",
                onlineWork: "G:/Unidades compartidas/",
                onlineMedia: "G:/Unidades compartidas/"
            }
        };
        settings.projects.push(newProj);
        settings.currentProject = newProj;
        settings.render();
    },

    deleteProject: async () => {
        if (!settings.currentProject) return;
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
                const fileName = settings.currentProject.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
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
        const copy = JSON.parse(JSON.stringify(settings.currentProject));
        copy.id = 'proj_' + Date.now();
        copy.isBase = false;
        copy.name += " (Copia)";
        settings.projects.push(copy);
        settings.currentProject = copy;
        settings.render();
    },

    selectProject: (id) => {
        const proj = settings.projects.find(p => p.id === id);
        if (proj) {
            settings.currentProject = proj;
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
        settings.projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = p.name;
            if (settings.currentProject && settings.currentProject.id === p.id) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    },

    selectHeaderProject: (id) => {
        const proj = settings.projects.find(p => p.id === id);
        if (proj) {
            settings.currentProject = proj;
            localStorage.setItem('pipeta_active_project_id', id);
            if (proj.roots) {
                if (window.state) {
                    if (proj.roots.work) window.state.workPath = proj.roots.work;
                    if (proj.roots.media) window.state.mediaPath = proj.roots.media;
                }
            }
            settings.updateHeaderProjectSelector();
            if (typeof initBrowser !== 'undefined') initBrowser();
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
                    <img src="icons/settings.svg" style="width:20px; filter:invert(1);">
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
        const items = [
            { id: 'proyecto', label: '📁 Proyectos' },
            { id: 'users', label: '👤 User Settings', restricted: true },
            { id: 'statuses', label: '🏷️ Diseñador Estados', restricted: true },
            { id: 'workflow', label: '🗂️ Workflow & Sync DB', restricted: true },
            { id: 'interfaz', label: '🎨 Interfaz & Canvas' },
            { id: 'shortcuts', label: '⌨️ Atajos de Teclado' },
            { id: 'sincronizacion', label: '⚡ Sincronización' },
            { id: 'avanzado', label: '⚙️ Avanzado' },
            { id: 'exportar', label: '📦 Exportar Presets' },
            { id: 'version', label: '🚀 Versión & Updates' }
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
        const restricted = ['users', 'statuses', 'workflow'];
        if (restricted.includes(cat) && !settings.isAdminUnlocked()) {
            settings.promptAdminPassword(cat);
            return;
        }

        settings.currentCategory = cat;
        if (cat === 'users') {
            settings.loadUsersConfig().then(() => settings.render());
        } else if (cat === 'statuses') {
            settings.loadStatusesConfig().then(() => settings.render());
        } else if (cat === 'proyecto' || cat === 'proyectos' || cat === 'avanzado') {
            settings.loadPresets().then(() => {
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
                return `
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px;">Motor de Sincronización</h3>
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px; font-size:0.85rem;">
                        <span style="color:#888;">Estado:</span>
                        <span style="color:${window.rcloneStatus?.available ? '#4CAF50' : '#f44336'}; font-weight:bold;">
                            ${window.rcloneStatus?.available ? 'Conectado ⚡' : 'No Detectado ❌'}
                        </span>
                        ${window.rcloneStatus?.available ? `<span style="background:#333; padding:2px 6px; border-radius:4px; color:#4fc3f7;">v${window.rcloneStatus.version}</span>` : ''}
                    </div>
                    <p style="color:#888; margin-bottom:20px; font-size:0.9rem;">
                        Configura cómo Pipeta gestiona las copias de archivos entre Local (Z:) y Online (G:).
                    </p>

                    <div style="display:flex; flex-direction:column; gap:15px; background:rgba(255,255,255,0.03); padding:20px; border-radius:8px; border:1px solid #333;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:10px;">Motor de Copia Preferido</div>
                        
                        <label style="display:flex; gap:15px; cursor:pointer; padding:10px; border-radius:4px; transition:background 0.2s; align-items:flex-start;">
                            <input type="radio" name="copyEngine" value="auto" ${engine === 'auto' ? 'checked' : ''} onchange="settings.updateGlobalProp('copyEngine', 'auto')" style="margin-top:4px;">
                            <div>
                                <div style="font-weight:bold; color:#eee;">🤖 Automático (Recomendado)</div>
                                <div style="font-size:0.85rem; color:#888; margin-top:4px;">
                                    Usa <b>Rclone</b> si está disponible para máxima velocidad y confiabilidad.<br>
                                    Si no se detecta, usa automáticamente la copia nativa de Windows.
                                </div>
                            </div>
                        </label>

                        <div style="height:1px; background:#333; margin:5px 0;"></div>

                        <label style="display:flex; gap:15px; cursor:pointer; padding:10px; border-radius:4px; transition:background 0.2s; align-items:flex-start;">
                            <input type="radio" name="copyEngine" value="rclone" ${engine === 'rclone' ? 'checked' : ''} onchange="settings.updateGlobalProp('copyEngine', 'rclone')" style="margin-top:4px;">
                            <div>
                                <div style="font-weight:bold; color:#4fc3f7;">🚀 Forzar Rclone</div>
                                <div style="font-size:0.85rem; color:#888; margin-top:4px;">
                                    Intenta usar siempre Rclone. <span style="color:#f44336;">Fallará</span> si Rclone no está instalado o configurado correctamente.
                                </div>
                            </div>
                        </label>

                        <div style="height:1px; background:#333; margin:5px 0;"></div>

                        <label style="display:flex; gap:15px; cursor:pointer; padding:10px; border-radius:4px; transition:background 0.2s; align-items:flex-start;">
                            <input type="radio" name="copyEngine" value="native" ${engine === 'native' ? 'checked' : ''} onchange="settings.updateGlobalProp('copyEngine', 'native')" style="margin-top:4px;">
                            <div>
                                <div style="font-weight:bold; color:#ff9800;">📁 Forzar Copia Nativa (Windows)</div>
                                <div style="font-size:0.85rem; color:#888; margin-top:4px;">
                                    Usa siempre el sistema de archivos de Windows. Más lento pero 100% compatible sin dependencias externas. Útil si Rclone da problemas.
                                </div>
                            </div>
                        </label>
                    </div>

                    <div style="margin-top:20px; padding:15px; background:rgba(33,150,243,0.1); border-left:4px solid #2196F3; border-radius:4px;">
                        <div style="font-weight:bold; color:#2196F3; margin-bottom:5px;">ℹ️ Nota</div>
                        <div style="font-size:0.85rem; color:#ccc;">
                            Esta configuración afecta tanto al Explorador de Archivos como al Sync Analyzer. Los cambios se aplican inmediatamente al guardar.
                        </div>
                    </div>
                `;

            case 'proyecto':
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
                    { id: 'presets_ia', label: '🤖 Presets IA' }
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
                                <label class="config-label">Proyecto (Tag / Code)</label>
                                <input type="text" class="config-input" value="${escapeHtml(cp.projectCode || '')}" 
                                       placeholder="${isBase ? '[proyecto]' : 'surf_love'}"
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
                }

                return `
                    <div style="display:grid; grid-template-columns: 210px 170px 1fr; gap:15px; height:100%; min-height:480px;">
                        <!-- Columna 1: Listado de Proyectos -->
                        <div style="border-right: 1px solid #333; padding-right:12px; display:flex; flex-direction:column;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <h4 style="margin:0; font-size:0.85rem; color:#aaa; text-transform:uppercase;">Proyectos (${settings.projects.length})</h4>
                                <button class="btn" onclick="settings.newProject()" title="Nuevo Proyecto" style="padding:2px 8px; font-size:0.8rem; background:var(--accent); color:black; font-weight:bold;">+</button>
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
                                    ${isBase ? `
                                        <button class="btn" onclick="settings.restoreBaseProjectCanon()" style="flex:1; background:#2a2a2a; border:1px solid var(--accent); color:var(--accent); font-weight:bold; padding:8px; border-radius:4px; cursor:pointer;">↺ Restaurar Proyecto Base a Canon Oficial</button>
                                    ` : `
                                        <button class="btn" onclick="settings.duplicateProject()" style="flex:1; background:#2a2a2a; color:#eee; border:1px solid #444; padding:8px; border-radius:4px; cursor:pointer;">Duplicar Proyecto</button>
                                        <button class="btn" style="flex:1; background:rgba(244,67,54,0.1); border:1px solid #f44336; color:#f44336; padding:8px; border-radius:4px; cursor:pointer;" onclick="settings.deleteProject()">Eliminar Proyecto</button>
                                    `}
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

                    <!-- Tabla de Usuarios -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:15px; margin-bottom:25px;">
                        <h4 style="margin:0 0 12px 0; color:#eee;">Listado de Usuarios (${(uData.users || []).length})</h4>
                        <table style="width:100%; border-collapse:collapse; font-size:0.82rem; text-align:left;">
                            <thead>
                                <tr style="border-bottom:1px solid #444; color:#888; font-size:0.75rem; text-transform:uppercase;">
                                    <th style="padding:8px;">Nombre de Usuario</th>
                                    <th style="padding:8px;">Nombre</th>
                                    <th style="padding:8px;">Apellido</th>
                                    <th style="padding:8px;">Usuario LASP</th>
                                    <th style="padding:8px;">Rol</th>
                                    <th style="padding:8px;">Email</th>
                                    <th style="padding:8px;">Notas</th>
                                    <th style="padding:8px; text-align:right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(uData.users || []).map(u => {
                                    const roleObj = (uData.roles || []).find(r => r.id === u.role) || { name: u.role || 'user', color: '#888' };
                                    const uName = u.username || (u.laspUser ? u.laspUser.replace('lasp-', '') : u.id);
                                    return `
                                        <tr style="border-bottom:1px solid #222;">
                                            <td style="padding:10px 8px; display:flex; align-items:center; gap:8px;">
                                                <div style="width:10px; height:10px; border-radius:50%; background:${u.avatarColor || '#ff9800'};"></div>
                                                <b style="color:#fff; font-family:monospace;">${uName}</b>
                                                ${u.isSystem ? '<span style="font-size:0.65rem; background:#333; color:#aaa; padding:1px 4px; border-radius:3px;">default</span>' : ''}
                                            </td>
                                            <td style="padding:10px 8px; color:#ccc;">${u.firstName || '—'}</td>
                                            <td style="padding:10px 8px; color:#ccc;">${u.lastName || '—'}</td>
                                            <td style="padding:10px 8px; font-family:monospace; color:var(--accent);">${u.laspUser || '—'}</td>
                                            <td style="padding:10px 8px;">
                                                <span style="background:${roleObj.color}22; color:${roleObj.color}; border:1px solid ${roleObj.color}44; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:bold;">
                                                    ${roleObj.name}
                                                </span>
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
                const sData = settings.statusesData || { statuses: [] };
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
                        <div>
                            <h3 style="margin:0;">🏷️ Diseñador de Estados (Shots / Assets)</h3>
                            <p style="margin:4px 0 0 0; color:#888; font-size:0.85rem;">Define y personaliza los estados de procesos y avance aplicables a shots y assets.</p>
                        </div>
                        <button class="btn" onclick="settings.addStatusModal()" style="background:var(--accent); color:black; font-weight:bold; padding:6px 14px; border:none; border-radius:4px; cursor:pointer;">
                            + Nuevo Estado
                        </button>
                    </div>

                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:15px;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
                            <thead>
                                <tr style="border-bottom:1px solid #444; color:#888; font-size:0.75rem; text-transform:uppercase;">
                                    <th style="padding:8px;">Icono & Estado</th>
                                    <th style="padding:8px;">Identificador</th>
                                    <th style="padding:8px;">Ámbito</th>
                                    <th style="padding:8px;">Color</th>
                                    <th style="padding:8px; text-align:right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(sData.statuses || []).map(st => `
                                    <tr style="border-bottom:1px solid #222;">
                                        <td style="padding:10px 8px; display:flex; align-items:center; gap:8px;">
                                            <span style="font-size:1.1rem;">${st.icon || '⚪'}</span>
                                            <b style="color:${st.color || '#fff'};">${st.name}</b>
                                            ${st.isDefault ? `<span style="background:#333; color:#aaa; font-size:0.7rem; padding:1px 6px; border-radius:3px;">Por Defecto</span>` : ''}
                                        </td>
                                        <td style="padding:10px 8px; font-family:monospace; color:#888;">${st.id}</td>
                                        <td style="padding:10px 8px; text-transform:capitalize; color:#ccc;">${st.scope === 'both' ? 'Shots & Assets' : st.scope}</td>
                                        <td style="padding:10px 8px;">
                                            <div style="display:flex; align-items:center; gap:6px;">
                                                <div style="width:16px; height:16px; border-radius:3px; background:${st.color}; border:1px solid #555;"></div>
                                                <span style="font-family:monospace; font-size:0.75rem; color:#aaa;">${st.color}</span>
                                            </div>
                                        </td>
                                        <td style="padding:10px 8px; text-align:right;">
                                            ${!st.isDefault ? `<button onclick="settings.deleteStatus('${st.id}')" class="icon-btn danger" style="background:transparent; border:none; color:#f44336; cursor:pointer;" title="Eliminar Estado">🗑️</button>` : ''}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;

            case 'workflow':
                const curProj = settings.currentProject || settings.getBaseProject();
                const defaultWfDir = (curProj.roots?.work || 'Z:/[cliente]/[proyecto]').replace(/\//g, '\\') + '\\workflow';

                return `
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px;">🗂️ Workflow, Asignaciones & Base de Datos</h3>
                    <p style="color:#aaa; font-size:0.85rem; line-height:1.6;">
                        Pipeta mantiene la base de datos de planos, estados y asignaciones en un archivo estructurado <code>shot_tracker.json</code> dentro de la carpeta de workflow del proyecto.
                    </p>

                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:8px;">Carpeta de Workflow del Proyecto</div>
                        <div style="display:flex; gap:10px; margin-bottom:15px;">
                            <input type="text" readonly value="${defaultWfDir}" style="flex:1; background:#111; border:1px solid #444; border-radius:4px; padding:8px 12px; color:#ccc; font-family:monospace; font-size:0.82rem;">
                            <button class="btn" onclick="API.fs.open('${defaultWfDir.replace(/\\/g, '\\\\')}')" style="background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:6px 14px; cursor:pointer; font-size:0.82rem;">📂 Abrir</button>
                        </div>

                        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:20px;">
                            <button class="btn" onclick="if(typeof ShotNavigator !== 'undefined') { ShotNavigator.loadWorkflow(); alert('✅ Base de datos de workflow recargada con éxito.'); }" style="background:#1c222d; color:#4fc3f7; border:1px solid #4fc3f766; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.85rem;">
                                🔄 Recargar Workflow Local
                            </button>
                            <button class="btn" onclick="if(typeof ShotNavigator !== 'undefined') { ShotNavigator.saveTracker(); alert('✅ Base de datos de workflow guardada.'); }" style="background:#1c222d; color:#4caf50; border:1px solid #4caf5066; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.85rem;">
                                💾 Guardar / Publicar Tracker
                            </button>
                            <button class="btn" onclick="if(typeof ShotNavigator !== 'undefined') { ShotNavigator.exportMyTasksFile(); }" style="background:#1c222d; color:#ff9800; border:1px solid #ff980066; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.85rem;">
                                👤 Exportar Mis Tareas (.json)
                            </button>
                        </div>
                    </div>
                `;

            case 'interfaz':
                return `
                    <h3>Interfaz de Usuario & Canvas</h3>
                    
                    <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid #333; margin-bottom:20px;">
                        <h4 style="margin-top:0; margin-bottom:10px; color:#ccc;">Modo de Explorador por Defecto</h4>
                        <div style="font-size:0.85rem; color:#888; margin-bottom:10px;">
                            Define qué vista se carga al iniciar la aplicación.
                        </div>
                        <div style="display:flex; gap:20px;">
                            <label style="display:flex; align-items:center; cursor:pointer;">
                                <input type="radio" name="defaultViewMode" value="local" 
                                    ${(!settings.defaultViewMode || settings.defaultViewMode === 'local') ? 'checked' : ''}
                                    onchange="settings.defaultViewMode = 'local';">
                                <span style="margin-left:8px;">Local (Z:)</span>
                            </label>
                            <label style="display:flex; align-items:center; cursor:pointer;">
                                <input type="radio" name="defaultViewMode" value="online" 
                                    ${(settings.defaultViewMode === 'online') ? 'checked' : ''}
                                    onchange="settings.defaultViewMode = 'online';">
                                <span style="margin-left:8px;">Online (G:)</span>
                            </label>
                        </div>
                    </div>

                    <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid #333; margin-bottom:20px;">
                        <h4 style="margin-top:0; margin-bottom:10px; color:var(--accent);">🖥️ Modo Pantalla Completa & Maximizar Canvas</h4>
                        <div style="font-size:0.85rem; color:#888; margin-bottom:12px;">
                            Permite ocultar la barra lateral y cabeceras para aprovechar el 100% de la pantalla en los módulos <b>Shot Navigator</b>, <b>Asset Designer</b> y <b>Explorer</b>.
                        </div>
                        <button class="btn" onclick="window.toggleCanvasFullscreen()" style="background:#1c222d; color:#fff; border:1px solid #555; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold;">
                            🔲 Alternar Modo Canvas Completo
                        </button>
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

                return `
                    <h3>Opciones Avanzadas</h3>
                    
                    <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid #333; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h4 style="margin-top:0; margin-bottom:10px; color:var(--accent);">Presets Maestros de Validación</h4>
                            <button onclick="settings.loadPresets().then(() => settings.render())" style="background:none; border:none; color:#666; cursor:pointer;" title="Recargar Presets">↻</button>
                        </div>
                        <p style="font-size:0.8rem; color:#888;">Define qué presets se usan para auditar y reparar carpetas que no tienen metadatos (vfx_control.json).</p>
                        
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

                    <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid #333; margin-bottom:20px;">
                        <h4 style="margin-top:0; margin-bottom:10px; color:var(--accent);">📋 Registro de Actividad (Logs)</h4>
                        <p style="font-size:0.8rem; color:#888;">Los logs registran todas las operaciones de archivos (copia, renombrado, borrado, etc.) en archivos JSONL diarios.</p>
                        
                        <div class="config-group" style="margin-top:15px;">
                            <label class="config-label">Registro activo</label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" ${settings.loggingEnabled ? 'checked' : ''}
                                    onchange="settings.loggingEnabled = this.checked;">
                                <span style="font-size:0.85rem; color:#ccc;">${settings.loggingEnabled ? 'Activado — se guardan logs de todas las operaciones' : 'Desactivado — no se registra actividad'}</span>
                            </label>
                        </div>

                        <div class="config-group">
                            <label class="config-label">Ruta de logs</label>
                            <div style="display:flex; gap:8px;">
                                <input class="config-input" type="text" value="${settings.logsPath}"
                                    onchange="settings.logsPath = this.value;" 
                                    style="flex:1; font-family:monospace; font-size:0.8rem;">
                                <button type="button" class="btn" onclick="settings.openLogsDirectory()" 
                                    style="background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir carpeta de logs en el explorador de Windows">
                                    <span>📂 Abrir Carpeta</span>
                                </button>
                                <button type="button" class="btn" onclick="settings.openLatestLogFile()" 
                                    style="background:#222; color:var(--accent); border:1px solid #444; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir directamente el archivo de log activo de hoy">
                                    <span>📄 Abrir Log de Hoy</span>
                                </button>
                            </div>
                            <div style="font-size:0.7rem; color:#555; margin-top:4px;">Formato: JSONL (un JSON por línea). Archivo diario: pipeta_YYYY-MM-DD.jsonl</div>
                        </div>
                    </div>
                `;
            case 'exportar':
                return `
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px;">📦 Exportar & Publicar Presets (Dev)</h3>
                    <p style="color:#aaa; font-size:0.85rem; line-height:1.6;">
                        Esta herramienta permite respaldar y publicar selectivamente las configuraciones, proyectos y presets de diseño (Shots y Assets) desde tu disco local <code>C:\\</code> hacia la unidad de red <code>Z:\\</code> o cualquier otra carpeta de destino, manteniendo intacto el carpetaje original.
                    </p>

                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:12px; font-size:0.9rem;">1. Elementos a Exportar</div>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:#eee; font-size:0.85rem;">
                                <input type="checkbox" id="expOptShotDesigner" checked style="accent-color:var(--accent); width:16px; height:16px;">
                                <span>🎬 <b>Presets de Shot Designer</b> (<code>presets/ShotDesigner/*.json</code>)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:#eee; font-size:0.85rem;">
                                <input type="checkbox" id="expOptAssetDesigner" checked style="accent-color:var(--accent); width:16px; height:16px;">
                                <span>🎨 <b>Presets de Asset Designer</b> (<code>presets/AssetDesigner/*.json</code>)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:#eee; font-size:0.85rem;">
                                <input type="checkbox" id="expOptProjects" checked style="accent-color:var(--accent); width:16px; height:16px;">
                                <span>📁 <b>Proyectos Configurados</b> (<code>presets/Projects/*.json</code>)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:#eee; font-size:0.85rem;">
                                <input type="checkbox" id="expOptUsers" checked style="accent-color:var(--accent); width:16px; height:16px;">
                                <span>👥 <b>Usuarios y Roles</b> (<code>presets/users_config.json</code>)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:#eee; font-size:0.85rem;">
                                <input type="checkbox" id="expOptStatuses" checked style="accent-color:var(--accent); width:16px; height:16px;">
                                <span>🏷️ <b>Estados de Procesos y Planos</b> (<code>presets/status_config.json</code>)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; color:#eee; font-size:0.85rem;">
                                <input type="checkbox" id="expOptConfig" checked style="accent-color:var(--accent); width:16px; height:16px;">
                                <span>⚙️ <b>Configuración General</b> (<code>presets/config.json</code>)</span>
                            </label>
                        </div>
                    </div>

                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:8px; font-size:0.9rem;">2. Ruta de Destino de la Exportación</div>
                        <p style="color:#888; font-size:0.8rem; margin-top:0; margin-bottom:8px;">
                            Selecciona o examina la carpeta de destino (por defecto en la unidad de red <code>Z:</code> para publicar rápidamente):
                        </p>
                        <div style="display:flex; gap:8px;">
                            <input type="text" id="expTargetPath" class="config-input" 
                                value="${settings.exportPresetsPath || 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets'}" 
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
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:25px; padding-bottom:15px; border-bottom:1px solid #333;">
                        <div id="expStatusMsg" style="font-size:0.85rem; color:#aaa;"></div>
                        <button class="btn" onclick="settings.confirmExportPresets()" 
                            style="background:var(--accent); color:black; font-weight:bold; padding:10px 20px; border-radius:4px; border:none; cursor:pointer; display:flex; align-items:center; gap:8px;">
                            <span>🚀 EXPORTAR / PUBLICAR PRESETS</span>
                        </button>
                    </div>

                    <!-- SECCIÓN: EMPAQUETAR VERSIÓN PORTABLE (.ZIP) -->
                    <div style="background:rgba(0,188,212,0.04); padding:18px; border-radius:8px; border:1px solid #00bcd444; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div style="font-weight:bold; color:#00bcd4; font-size:0.95rem; display:flex; align-items:center; gap:8px;">
                                <span>📦 Empaquetar Versión Portable Completa (.zip)</span>
                            </div>
                            <span style="font-size:0.75rem; background:#222; padding:2px 8px; border-radius:4px; color:#aaa; font-family:monospace;">
                                Pipeta ${window.APP_VERSION || 'v0.9.72'}
                            </span>
                        </div>
                        <p style="color:#aaa; font-size:0.82rem; line-height:1.5; margin-top:0; margin-bottom:14px;">
                            Genera un archivo comprimido <code>Pipeta_vX.XX.zip</code> autocontenido con el runtime de Node.js, todas las interfaces, el lanzador y los presets de configuración. Cualquier usuario puede descomprimirlo en cualquier máquina o disco (<code>C:</code>, <code>D:</code>, pendrive) y ejecutarlo de inmediato sin instalaciones previas ni dependencias de red.
                        </p>

                        <div style="margin-bottom:14px;">
                            <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:6px;">Carpeta de Salida para el archivo comprimido:</label>
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="pkgTargetDir" class="config-input" 
                                    value="${settings.pkgTargetDir || 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts'}" 
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

                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div id="pkgStatusMsg" style="font-size:0.85rem; color:#aaa;"></div>
                            <button id="pkgGenerateBtn" class="btn" onclick="settings.executePackageZip()" 
                                style="background:#00bcd4; color:black; font-weight:bold; padding:10px 22px; border-radius:4px; border:none; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 2px 10px rgba(0,188,212,0.3);">
                                <span>📦 COMPRIMIR & GENERAR PIPETA .ZIP</span>
                            </button>
                        </div>
                    </div>
                `;
            case 'version':
                return `
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                        <span>🚀 Versión & Actualizaciones</span>
                        <span style="font-size:0.8rem; background:var(--accent); color:black; font-weight:bold; padding:2px 10px; border-radius:4px;">
                            ${window.APP_VERSION || 'v0.9.72'}
                        </span>
                    </h3>

                    <!-- CARD 1: ESTADO Y ACCIONES -->
                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:8px; font-size:0.95rem;">
                            🔄 Actualizador Directo & Accesos
                        </div>
                        <p style="color:#aaa; font-size:0.82rem; line-height:1.5; margin-top:0; margin-bottom:14px;">
                            Sincroniza en caliente tu instalación local con la versión más reciente del servidor maestro en el recurso compartido exclusivo <code>\\\\LASP-VM\\Pipeta</code> y reinicia el sistema automáticamente.
                        </p>

                        <div style="background:#111; border:1px solid #222; border-radius:6px; padding:12px; margin-bottom:15px; font-size:0.8rem;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                <span style="color:#888;">Servidor Maestro (Origen de Red):</span>
                                <span style="color:var(--accent); font-family:monospace; font-weight:bold;">\\\\LASP-VM\\Pipeta</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                <span style="color:#888;">Instalación Local:</span>
                                <span style="color:#aaa; font-family:monospace;">C:\\TOOLS\\APPS\\Pipeta</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:#888;">Versión Instalada:</span>
                                <span style="color:var(--accent); font-weight:bold;">${window.APP_VERSION || 'v0.9.72'}</span>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                            <div id="updateStatusMsg" style="font-size:0.85rem; color:#aaa; flex:1; min-width:200px;"></div>
                            <div style="display:flex; gap:10px;">
                                <button id="createShortcutBtn" class="btn" onclick="settings.createDesktopShortcut()" title="Crea un acceso directo en tu Escritorio con el icono de Pipeta"
                                    style="background:#222; color:#00bcd4; border:1px solid #00bcd488; font-weight:bold; padding:10px 16px; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                                    <span>📌 Crear Acceso Directo</span>
                                </button>
                                <button id="updateFromNetBtn" class="btn" onclick="settings.executeUpdateFromServer()" 
                                    style="background:var(--accent); color:black; font-weight:bold; padding:10px 22px; border-radius:4px; border:none; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 2px 10px rgba(255,152,0,0.3);">
                                    <span>🚀 ACTUALIZAR PIPETA (\\\\LASP-VM\\Pipeta)</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- CARD 2: HISTORIAL DE VERSIONES & PATCH NOTES -->
                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:12px; font-size:0.95rem;">
                            📋 Notas de la Versión (Patch Notes)
                        </div>

                        <div style="max-height:260px; overflow-y:auto; padding-right:8px; font-size:0.8rem; line-height:1.6;">
                            <div style="margin-bottom:15px; border-left:3px solid var(--accent); padding-left:10px;">
                                <div style="font-weight:bold; color:#fff; font-size:0.88rem;">v0.9.72 (Actual)</div>
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
        const current = (input ? input.value : settings.pkgTargetDir || 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts').trim();
        try {
            await API.fs.openFolder(current.replace(/\\/g, '/'));
        } catch(e) {
            console.error("Open package dir error:", e);
        }
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
            statusMsg.innerHTML = '<span style="color:var(--accent);">⏳ Sincronizando con \\\\LASP-VM\\Pipeta y reiniciando sistema...</span>';
        }

        try {
            const res = await fetch('/api/app/update-from-server', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcePath: '\\\\LASP-VM\\Pipeta' })
            });
            const data = await res.json();
            if (data && data.success) {
                if (statusMsg) {
                    statusMsg.innerHTML = '<span style="color:#4caf50; font-weight:bold;">✅ ¡Actualización completada! Reiniciando Pipeta...</span>';
                }
                
                // Polling de health y recarga automática
                let attempts = 0;
                const checkInterval = setInterval(async () => {
                    attempts++;
                    try {
                        const hRes = await fetch('/api/health');
                        if (hRes.ok) {
                            clearInterval(checkInterval);
                            window.location.reload();
                        }
                    } catch(e) {
                        if (attempts > 20) {
                            clearInterval(checkInterval);
                            window.location.reload();
                        }
                    }
                }, 1000);
            } else {
                throw new Error(data ? data.error : 'Error desconocido');
            }
        } catch(e) {
            console.error("Auto-update error:", e);
            if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">❌ Error al actualizar: ${e.message}</span>`;
            alert("Error durante la actualización: " + e.message);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>🚀 ACTUALIZAR PIPETA (lasp-munro)</span>';
                btn.style.opacity = '1';
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
        const defaultPath = 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets';
        const input = document.getElementById('expTargetPath');
        if (input) input.value = defaultPath;
        settings.exportPresetsPath = defaultPath;
        const msg = document.getElementById('expStatusMsg');
        if (msg) msg.innerHTML = '<span style="color:#aaa;">Ruta restablecida a la ubicación por defecto de Z:</span>';
    },

    browseExportPath: async () => {
        const input = document.getElementById('expTargetPath');
        const current = (input ? input.value : settings.exportPresetsPath || 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets').trim();
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
        const defaultPath = 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts';
        const input = document.getElementById('pkgTargetDir');
        if (input) input.value = defaultPath;
        settings.pkgTargetDir = defaultPath;
        const msg = document.getElementById('pkgStatusMsg');
        if (msg) msg.innerHTML = '<span style="color:#aaa;">Ruta de salida restablecida a la carpeta Scripts de Z:</span>';
    },

    browsePackageDir: async () => {
        const input = document.getElementById('pkgTargetDir');
        const current = (input ? input.value : settings.pkgTargetDir || 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts').trim();
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

    executePackageZip: async () => {
        const input = document.getElementById('pkgTargetDir');
        const targetDir = (input ? input.value : settings.pkgTargetDir || 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts').trim();
        if (!targetDir) {
            alert("Por favor especifica una carpeta de salida para el archivo .ZIP.");
            return;
        }

        const btn = document.getElementById('pkgGenerateBtn');
        const statusMsg = document.getElementById('pkgStatusMsg');

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>⏳ Comprimiendo Pipeta...</span>';
            btn.style.opacity = '0.7';
        }
        if (statusMsg) {
            statusMsg.innerHTML = '<span style="color:#00bcd4;">⏳ Empaquetando Pipeta completa con todos los presets y runtime (esto puede tomar 15-30 segundos)...</span>';
        }

        try {
            const res = await fetch('/api/system/package-dist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetDir: targetDir })
            });

            const data = await res.json();
            if (data && data.success) {
                if (statusMsg) {
                    statusMsg.innerHTML = `
                        <span style="color:#4caf50; font-weight:bold;">
                            ✅ ¡Paquete creado!: <code>${data.zipName}</code> (${data.sizeFormatted}) + <code>${data.batName}</code>
                        </span>
                        <button class="btn" onclick="API.fs.openFolder('${escapeHtml((data.targetDir || '').replace(/\\/g, '/'))}')" style="margin-left:8px; padding:3px 8px; font-size:0.75rem; background:#333; color:#eee;">
                            📂 Abrir Carpeta
                        </button>
                    `;
                }
                alert(`¡Pipeta Comprimida con Éxito!\n\nSe generaron en la carpeta de destino:\n1. ${data.zipPath} (${data.sizeFormatted})\n2. ${data.batPath}\n\nLos usuarios solo deben ejecutar 'Instalar_o_Actualizar_Pipeta_Local.bat' para descomprimir automáticamente en C:\\TOOLS\\APPS\\Pipeta.`);
            } else {
                throw new Error(data ? data.error : 'Error desconocido del servidor');
            }
        } catch(e) {
            console.error("Package error:", e);
            if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">❌ Error al generar .ZIP: ${e.message}</span>`;
            alert("Error al comprimir Pipeta: " + e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>📦 COMPRIMIR & GENERAR PIPETA .ZIP</span>';
                btn.style.opacity = '1';
            }
        }
    },

    confirmExportPresets: () => {
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
            <div style="background:#14171e; border:1px solid #28303d; border-radius:8px; width:480px; max-width:92vw; padding:22px; box-shadow:0 10px 30px rgba(0,0,0,0.7); color:#eee;">
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
            }
        } else {
            settings.usersData.users.push({
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
            });
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
            'manageUsers', 'manageSettings', 'manageStatuses'
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
