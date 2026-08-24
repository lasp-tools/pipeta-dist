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
    defaultShotPresetId: "asset_surf_love_canon_v1",
    defaultAssetPresetId: "",
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
        const presetDirs = [
            "C:\\TOOLS\\APPS\\Pipeta\\presets\\AssetDesigner",
            "C:\\TOOLS\\APPS\\Pipeta\\presets\\ShotDesigner"
        ];

        try {
            if (window.API && API.fs && API.fs.getFiles) {
                for (const dir of presetDirs) {
                    try {
                        const files = await API.fs.getFiles(dir);
                        for (const f of files) {
                            if (f.endsWith('.json')) {
                                const content = await API.fs.readFile(dir + "\\" + f);
                                if (content) {
                                    try {
                                        const p = JSON.parse(content);
                                        if (p.id && p.name) {
                                            settings.presetsList.push({
                                                id: p.id,
                                                name: p.name,
                                                type: dir.includes('Asset') ? 'asset' : 'shot',
                                                fullPath: dir + "\\" + f
                                            });
                                        }
                                    } catch (e) { }
                                }
                            }
                        }
                    } catch (errDir) {
                        console.warn("Could not load presets from " + dir, errDir);
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

    open: async () => {
        if (!settings.container) await settings.init();
        settings.isVisible = true;
        settings.render();
        settings.container.style.display = 'flex';
    },

    close() {
        settings.isVisible = false;
        if (settings.container) settings.container.style.display = 'none';
    },

    switchCategory(cat) {
        settings.currentCategory = cat;
        if (cat === 'avanzado' && settings.presetsList.length === 0) {
            settings.loadPresets().then(() => {
                if (settings.currentCategory === 'avanzado') settings.render();
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
        if (!confirm("¿Restaurar el Proyecto Base a todos los valores canónicos oficiales de pipeline?")) return;
        const baseProj = settings.projects.find(p => p.id === 'proj_base' || p.isBase);
        if (baseProj) {
            const restored = JSON.parse(JSON.stringify(CANONICAL_BASE_PRESETS));
            Object.assign(baseProj, restored);
            settings.currentProject = baseProj;
            await settings.saveProject();
            settings.render();
            alert("✓ Proyecto Base restaurado a los valores canónicos del pipeline.");
        }
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
            alert("⚠️ El Proyecto Base es la plantilla canónica maestra del sistema y no se puede eliminar.");
            return;
        }
        if (!confirm(`¿Borrar proyecto "${settings.currentProject.name}"?`)) return;

        const fileName = settings.currentProject.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
        const filePath = settings.projectsPath + "\\" + fileName;

        try {
            await API.fs.deleteFile(filePath);
            settings.projects = settings.projects.filter(p => p.id !== settings.currentProject.id);
            settings.currentProject = settings.projects.find(p => !p.isBase) || settings.projects[0];
            settings.render();
        } catch (e) { console.error(e); }
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

    render() {
        if (!settings.container) return;

        settings.container.innerHTML = `
            <div class="settings-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="icons/settings.svg" style="width:20px; filter:invert(1);">
                    <h2 style="margin:0; font-size:1.2rem;">Configuraciones</h2>
                </div>
                <button class="icon-btn" onclick="settings.close()">&times;</button>
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
            { id: 'interfaz', label: '🎨 Interfaz' },
            { id: 'sincronizacion', label: '⚡ Sincronización' },
            { id: 'avanzado', label: '⚙️ Avanzado' },
            { id: 'exportar', label: '📦 Exportar Presets' }
        ];

        return items.map(i => `
            <div class="settings-nav-item ${settings.currentCategory === i.id ? 'active' : ''}" 
                 onclick="settings.setCategory('${i.id}')"
                 style="padding:10px; cursor:pointer; margin-bottom:5px; border-radius:4px; background:${settings.currentCategory === i.id ? 'rgba(255,255,255,0.1)' : 'transparent'}; color:${settings.currentCategory === i.id ? 'white' : '#888'};">
                ${i.label}
            </div>
        `).join('');
    },

    setCategory(cat) {
        settings.currentCategory = cat;
        if (cat === 'avanzado' && settings.presetsList.length === 0) {
            settings.loadPresets().then(() => {
                if (settings.currentCategory === 'avanzado') settings.render();
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
            case 'interfaz':
                return `
                    <h3>Interfaz de Usuario</h3>
                    
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
                    
                    <p style="color:#666; font-style:italic;">Más opciones de visualización próximamente.</p>
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
                                <input type="checkbox" id="expOptIaTokens" checked style="accent-color:var(--accent); width:16px; height:16px;">
                                <span>🤖 <b>Tokens Personalizados de IA</b> (<code>presets/ia_custom_tokens.json</code>)</span>
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

                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div id="expStatusMsg" style="font-size:0.85rem; color:#aaa;"></div>
                        <button class="btn" onclick="settings.executeExportPresets()" 
                            style="background:var(--accent); color:black; font-weight:bold; padding:10px 20px; border-radius:4px; border:none; cursor:pointer; display:flex; align-items:center; gap:8px;">
                            <span>🚀 EXPORTAR / PUBLICAR PRESETS</span>
                        </button>
                    </div>
                `;
            default:
                return `<h3>Seleccione una categoría</h3>`;
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

    executeExportPresets: async () => {
        const targetInput = document.getElementById('expTargetPath');
        let targetRoot = (targetInput ? targetInput.value : '').trim();
        if (!targetRoot) {
            alert("Por favor especifica una ruta de destino válida.");
            return;
        }
        targetRoot = targetRoot.replace(/\\/g, '/').replace(/\/+$/, '');

        const doShot = document.getElementById('expOptShotDesigner')?.checked;
        const doAsset = document.getElementById('expOptAssetDesigner')?.checked;
        const doProj = document.getElementById('expOptProjects')?.checked;
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
            if (doIa) await copySingleFile('ia_custom_tokens.json');
            if (doConfig) await copySingleFile('config.json');

            if (errors.length > 0) {
                if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">⚠️ ${exportedCount} archivos exportados con ${errors.length} errores.</span>`;
                alert(`Exportación parcial:\n${exportedCount} archivos exportados.\nErrores:\n${errors.join('\n')}`);
            } else if (exportedCount === 0) {
                if (statusMsg) statusMsg.innerHTML = `<span style="color:#ffb74d;">ℹ️ No se encontraron archivos para exportar en las opciones seleccionadas.</span>`;
            } else {
                if (statusMsg) statusMsg.innerHTML = `<span style="color:#4caf50;">✅ ¡${exportedCount} archivos exportados con éxito a ${targetRoot}!</span>`;
                alert(`¡Exportación Exitosa!\nSe copiaron ${exportedCount} archivos y configuraciones a:\n${targetRoot}`);
            }
        } catch(e) {
            console.error("Export error:", e);
            if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">❌ Error en la exportación: ${e.message}</span>`;
            alert("Error al exportar: " + e.message);
        }
    },

    saveAll: async () => {
        // Save currently active project to disk
        if (settings.currentProject) {
            await settings.saveProject();
        }
        await settings.saveConfig();
        settings.updateHeaderProjectSelector();

        alert("Configuraciones guardadas localmente.");
        settings.close();
    }
};
