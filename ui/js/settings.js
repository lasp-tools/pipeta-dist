// ------------------------------------------
// --- SETTINGS MODULE (CONFIGURACIONES) ---
// ------------------------------------------

const settings = {
    isVisible: false,
    currentCategory: 'proyecto',
    container: null,

    // Persistence Logic
    projects: [],
    currentProject: null,
    projectsPath: "C:\\TOOLS\\APPS\\Pipeta\\presets\\Projects",
    configPath: "C:\\TOOLS\\APPS\\Pipeta\\presets\\config.json",

    // Logging
    // Logging
    loggingEnabled: true,
    logsPath: "C:\\TOOLS\\APPS\\Pipeta\\logs",

    // Copy Engine (auto | native)
    copyEngine: 'auto',
    exportPresetsPath: "Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets",

    // --- PRESETS LOADING ---
    presetsList: [],

    loadPresets: async () => {
        settings.presetsList = [];
        // Updated Paths based on user feedback
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
        // Auto-load presets only once when switching to advanced tab if empty
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
                            if (!proj.id) proj.id = 'proj_' + Math.random().toString(36).substr(2, 9);
                            settings.projects.push(proj);
                        } catch (e) { console.error("Error parsing proj", f, e); }
                    }
                }
            }
        } catch (e) {
            console.error("loadProjects error:", e);
        }

        if (settings.projects.length === 0) {
            // Default project if none found
            settings.projects.push({
                id: 'mango_ick',
                name: "Mango (ick)",
                client: "mango",
                projectCode: "ick",
                roots: {
                    work: "Z:/mango/ick",
                    media: "Z:/INTERNO/MEDIA/mango/ick",
                    onlineWork: "M:/Mi unidad/Z/mango/ick",
                    onlineMedia: "M:/Mi unidad/Z/INTERNO/MEDIA/mango/ick"
                }
            });
            settings.currentProject = settings.projects[0];
        } else {
            const savedActiveId = localStorage.getItem('pipeta_active_project_id');
            const found = settings.projects.find(p => p.id === savedActiveId);
            settings.currentProject = found || settings.projects[0];
        }
        settings.updateHeaderProjectSelector();
    },

    saveProject: async () => {
        if (!settings.currentProject) return;
        const fileName = settings.currentProject.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
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

    newProject: () => {
        const name = prompt("Nombre del nuevo proyecto:", "Nuevo Proyecto");
        if (!name) return;

        const newProj = {
            id: 'proj_' + Date.now(),
            name: name,
            client: "cliente",
            projectCode: "proy",
            roots: {
                work: "Z:/",
                media: "Z:/",
                onlineWork: "M:/",
                onlineMedia: "M:/"
            }
        };
        settings.projects.push(newProj);
        settings.currentProject = newProj;
        settings.render();
    },

    deleteProject: async () => {
        if (!settings.currentProject) return;
        if (!confirm(`¿Borrar proyecto "${settings.currentProject.name}"?`)) return;

        const fileName = settings.currentProject.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
        const filePath = settings.projectsPath + "\\" + fileName;

        try {
            await API.fs.deleteFile(filePath);
            settings.projects = settings.projects.filter(p => p.id !== settings.currentProject.id);
            settings.currentProject = settings.projects.length > 0 ? settings.projects[0] : null;
            settings.render();
        } catch (e) { console.error(e); }
    },

    duplicateProject: () => {
        if (!settings.currentProject) return;
        const copy = JSON.parse(JSON.stringify(settings.currentProject));
        copy.id = 'proj_' + Date.now();
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

    updateProjectProp: (path, value) => {
        if (!settings.currentProject) return;
        const parts = path.split('.');
        let obj = settings.currentProject;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {}; // Ensure object exists
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
        // Auto-load presets only once when switching to advanced tab if empty
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
                        Configura cómo Pipeta gestiona las copias de archivos entre Local (Z:) y Online (M:).
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
                const projectOptions = settings.projects.map(p => `
                    <div class="settings-nav-item ${settings.currentProject?.id === p.id ? 'active' : ''}" 
                         style="padding:8px 12px; margin-bottom:5px; border-radius:4px; display:flex; justify-content:space-between;"
                         onclick="settings.selectProject('${p.id}')">
                        <span>${p.name}</span>
                    </div>
                `).join('');

                const cp = settings.currentProject;

                return `
                    <div style="display:grid; grid-template-columns: 200px 1fr; gap:20px; height:100%;">
                        <!-- Left: List -->
                        <div style="border-right: 1px solid #333; padding-right:15px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <h4 style="margin:0;">Listado</h4>
                                <button class="btn" onclick="settings.newProject()" style="padding:2px 8px; font-size:0.8rem;">+</button>
                            </div>
                            <div style="max-height: 480px; overflow-y:auto;">
                                ${projectOptions}
                            </div>
                        </div>
                        
                        <!-- Right: Details -->
                        <div style="max-height: 480px; overflow-y:auto; padding-right:10px;">
                            ${cp ? `
                                <h3 style="margin-top:0;">Propiedades: ${cp.name}</h3>
                                
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                    <div class="config-group">
                                        <label class="config-label">Nombre del Proyecto</label>
                                        <input type="text" class="config-input" value="${cp.name}" 
                                               onchange="settings.updateProjectProp('name', this.value)">
                                    </div>
                                    <div class="config-group">
                                        <label class="config-label">ID / Código</label>
                                        <input type="text" class="config-input" value="${cp.id}" readonly style="opacity:0.5; cursor:not-allowed;">
                                    </div>
                                </div>

                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom:20px; background: rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid #333;">
                                    <div class="config-group" style="margin-bottom:0;">
                                        <label class="config-label">Cliente</label>
                                        <input type="text" class="config-input" value="${cp.client || ''}" 
                                               placeholder="mango"
                                               onchange="settings.updateProjectProp('client', this.value)">
                                    </div>
                                    <div class="config-group" style="margin-bottom:0;">
                                        <label class="config-label">Proyecto (Tag)</label>
                                        <input type="text" class="config-input" value="${cp.projectCode || ''}" 
                                               placeholder="ick"
                                               onchange="settings.updateProjectProp('projectCode', this.value)">
                                    </div>
                                </div>

                                <div style="margin-bottom:15px;">
                                    <h4 style="margin: 10px 0; color:var(--accent); font-size:0.9rem; text-transform:uppercase;">Rutas Locales (Z:)</h4>
                                    <div class="config-group">
                                        <label class="config-label">Proyecto Local (Work)</label>
                                        <input type="text" class="config-input" value="${cp.roots.work || ''}" 
                                               onchange="settings.updateProjectProp('roots.work', this.value)">
                                    </div>
                                    <div class="config-group">
                                        <label class="config-label">Media Local (Material)</label>
                                        <input type="text" class="config-input" value="${cp.roots.media || ''}" 
                                               onchange="settings.updateProjectProp('roots.media', this.value)">
                                    </div>
                                </div>

                                <div style="margin-bottom:15px; border-top: 1px dashed #444; pt:15px;">
                                    <h4 style="margin: 15px 0 10px 0; color:#4CAF50; font-size:0.9rem; text-transform:uppercase;">Rutas Online (M: / Cloud)</h4>
                                    <div class="config-group">
                                        <label class="config-label">Proyecto Online (Work)</label>
                                        <input type="text" class="config-input" value="${cp.roots.onlineWork || ''}" 
                                               onchange="settings.updateProjectProp('roots.onlineWork', this.value)">
                                    </div>
                                    <div class="config-group">
                                        <label class="config-label">Media Online (Material)</label>
                                        <input type="text" class="config-input" value="${cp.roots.onlineMedia || ''}" 
                                               onchange="settings.updateProjectProp('roots.onlineMedia', this.value)">
                                    </div>
                                </div>

                                <div style="margin-bottom:15px; border-top: 1px dashed #444; padding-top:15px;">
                                    <h4 style="margin: 0 0 10px 0; color:#ff9800; font-size:0.9rem; text-transform:uppercase;">Presets por Defecto del Proyecto</h4>
                                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                        <div class="config-group">
                                            <label class="config-label">Preset Shot por Defecto</label>
                                            <select class="config-input" onchange="settings.updateProjectProp('defaultShotPresetId', this.value)">
                                                <option value="">-- Ninguno (Manual) --</option>
                                                ${settings.presetsList.filter(p => p.type === 'shot').map(p => `
                                                    <option value="${p.id}" ${cp.defaultShotPresetId === p.id ? 'selected' : ''}>${p.name}</option>
                                                `).join('')}
                                            </select>
                                        </div>
                                        <div class="config-group">
                                            <label class="config-label">Preset Asset por Defecto</label>
                                            <select class="config-input" onchange="settings.updateProjectProp('defaultAssetPresetId', this.value)">
                                                <option value="">-- Ninguno (Manual) --</option>
                                                ${settings.presetsList.filter(p => p.type === 'asset').map(p => `
                                                    <option value="${p.id}" ${cp.defaultAssetPresetId === p.id ? 'selected' : ''}>${p.name}</option>
                                                `).join('')}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div style="display:flex; gap:10px; margin-top:30px; padding-bottom:20px;">
                                    <button class="btn" onclick="settings.duplicateProject()" style="flex:1;">Duplicar</button>
                                    <button class="btn" style="flex:1; border-color: #f44336; color:#f44336;" onclick="settings.deleteProject()">Eliminar</button>
                                </div>
                            ` : `<div style="color:#666; padding:20px; text-align:center;">Seleccione un proyecto para editar</div>`}
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
                                <span style="margin-left:8px;">Online (M:)</span>
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
                            <input class="config-input" type="text" value="${settings.logsPath}"
                                onchange="settings.logsPath = this.value;" 
                                style="font-family:monospace; font-size:0.8rem;">
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
