// ----------------------------------------------------------
// --- CREATOR SHARED UTILITIES & UNIFIED WINDOW CONTROLLER ---
// ----------------------------------------------------------

window.CreatorWindow = {
    activeTab: localStorage.getItem('pipeta_creator_active_tab') || 'asset',

    toggle: async (tab) => {
        if ((typeof AssetCreator !== 'undefined' && AssetCreator.isVisible) ||
            (typeof ShotCreator !== 'undefined' && ShotCreator.isVisible)) {
            CreatorWindow.close();
        } else {
            await CreatorWindow.open(tab || CreatorWindow.activeTab);
        }
    },

    open: async (tab) => {
        if (tab) CreatorWindow.activeTab = tab;
        localStorage.setItem('pipeta_creator_active_tab', CreatorWindow.activeTab);

        const btn = document.getElementById('sidebarCreatorBtn');
        if (btn) btn.classList.add('active');

        if (CreatorWindow.activeTab === 'shot') {
            if (typeof AssetCreator !== 'undefined') AssetCreator.close();
            if (typeof ShotCreator !== 'undefined') await ShotCreator.open();
        } else {
            if (typeof ShotCreator !== 'undefined') ShotCreator.close();
            if (typeof AssetCreator !== 'undefined') await AssetCreator.open();
        }
    },

    close: () => {
        if (typeof AssetCreator !== 'undefined') AssetCreator.close();
        if (typeof ShotCreator !== 'undefined') ShotCreator.close();
        const btn = document.getElementById('sidebarCreatorBtn');
        if (btn) btn.classList.remove('active');
    },

    switchTo: async (tab) => {
        if (tab === CreatorWindow.activeTab) return;
        CreatorWindow.activeTab = tab;
        localStorage.setItem('pipeta_creator_active_tab', tab);

        const fromWin = tab === 'shot' ? AssetCreator?.container : ShotCreator?.container;
        const toWin = tab === 'shot' ? ShotCreator?.container : AssetCreator?.container;

        if (fromWin && toWin) {
            if (fromWin.style.top) toWin.style.top = fromWin.style.top;
            if (fromWin.style.left) toWin.style.left = fromWin.style.left;
            toWin.style.transform = fromWin.style.transform || "none";
        }

        if (tab === 'shot') {
            if (typeof AssetCreator !== 'undefined') AssetCreator.close();
            if (typeof ShotCreator !== 'undefined') await ShotCreator.open();
        } else {
            if (typeof ShotCreator !== 'undefined') ShotCreator.close();
            if (typeof AssetCreator !== 'undefined') await AssetCreator.open();
        }

        const btn = document.getElementById('sidebarCreatorBtn');
        if (btn) btn.classList.add('active');
    }
};

window.CreatorShared = {
    TEMPLATE_FILE_FILTER: 'Archivos de Template (*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt)|*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt|Todos los archivos (*.*)|*.*',

    getDefaultPresetsPath: (subdir) => {
        const baseDir = window.PIPETA_LOCAL_APP_DIR ||
            (window.IS_BETA_CHANNEL ? "C:\\TOOLS\\APPS\\Pipeta_Beta" : "C:\\TOOLS\\APPS\\Pipeta");
        return baseDir + "\\presets\\" + subdir;
    },

    getRepoPresetsPath: (subdir) => {
        const repoDir = window.IS_BETA_CHANNEL
            ? "Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta_Beta"
            : "Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta";
        return repoDir + "\\presets\\" + subdir;
    },

    escapeHtml: (str) => {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    },

    makeDraggable: (container, dragHandleId) => {
        const header = document.getElementById(dragHandleId);
        if (!header || !container) return;

        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        header.onmousedown = (e) => {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = () => {
                document.onmouseup = null;
                document.onmousemove = null;
            };
            document.onmousemove = (ev) => {
                ev = ev || window.event;
                ev.preventDefault();
                pos1 = pos3 - ev.clientX;
                pos2 = pos4 - ev.clientY;
                pos3 = ev.clientX;
                pos4 = ev.clientY;
                container.style.top = (container.offsetTop - pos2) + "px";
                container.style.left = (container.offsetLeft - pos1) + "px";
                container.style.transform = "none";
            };
        };
    },

    showOverlay: (domPrefix, html) => {
        const ov = document.getElementById(`${domPrefix}-overlay`);
        const cont = document.getElementById(`${domPrefix}-overlay-content`);
        if (ov && cont) {
            cont.innerHTML = html;
            ov.style.display = 'flex';
        }
    },

    hideOverlay: (domPrefix) => {
        const ov = document.getElementById(`${domPrefix}-overlay`);
        if (ov) ov.style.display = 'none';
    },

    loadPresetsFromDirs: async (searchDirs, opts = {}) => {
        const stopOnFirstNonEmptyDir = !!opts.stopOnFirstNonEmptyDir;
        const loaded = [];
        const seenIds = new Set();
        const seenFiles = new Set();
        let activeDir = null;

        if (!(window.API && API.fs && API.fs.getFiles)) {
            return { presets: loaded, activeDir };
        }

        for (const dir of searchDirs) {
            if (!dir) continue;
            try {
                const files = await API.fs.getFiles(dir);
                if (files && Array.isArray(files) && files.length > 0) {
                    const beforeCount = loaded.length;
                    for (const f of files) {
                        if (!f.endsWith('.json')) continue;
                        const fileBase = f.toLowerCase();
                        if (!stopOnFirstNonEmptyDir && seenFiles.has(fileBase)) continue;
                        const content = await API.fs.readFile(dir + "\\" + f);
                        if (content) {
                            try {
                                const preset = JSON.parse(content);
                                const pId = preset.id || f.replace('.json', '');
                                if (seenIds.has(pId)) continue;
                                preset.id = pId;
                                loaded.push(preset);
                                seenIds.add(pId);
                                seenFiles.add(fileBase);
                            } catch (e) {
                                console.error("Error parsing preset:", f, e);
                            }
                        }
                    }
                    if (stopOnFirstNonEmptyDir && loaded.length > beforeCount) {
                        activeDir = dir;
                        break;
                    }
                }
            } catch (dirErr) {
                // Ignore missing directory
            }
        }
        return { presets: loaded, activeDir };
    },

    renderWindowHeaderHTML: (activeTab, dragHandleId, iconSrc) => {
        const isAsset = activeTab === 'asset';
        const activeStyle = 'background:#2b3a4a; color:#fff; font-weight:bold; border:none; border-radius:3px; padding:3px 12px; font-size:0.78rem; cursor:pointer;';
        const inactiveStyle = 'background:transparent; color:#888; border:none; border-radius:3px; padding:3px 12px; font-size:0.78rem; cursor:pointer;';
        return `
            <div class="validator-header" style="display:flex; align-items:center; justify-content:space-between; height:46px; padding:0 15px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <img src="${iconSrc}" style="width:18px;">
                    <span style="font-size:0.95rem; font-weight:bold; color:#fff; margin-right:4px;">Creator</span>
                    <div style="display:flex; background:#181818; border-radius:4px; padding:2px; border:1px solid #333; gap:2px;">
                        <button type="button" class="creator-tab-btn ${isAsset ? 'active' : ''}" onclick="CreatorWindow.switchTo('asset')" style="${isAsset ? activeStyle : inactiveStyle}">
                            📦 Asset Creator
                        </button>
                        <button type="button" class="creator-tab-btn ${!isAsset ? 'active' : ''}" onclick="CreatorWindow.switchTo('shot')" style="${!isAsset ? activeStyle : inactiveStyle}">
                            🎬 Shot Creator
                        </button>
                    </div>
                </div>
                <div style="flex:1; cursor:grab; height:100%;" id="${dragHandleId}"></div>
                <div class="win-controls">
                    <button onclick="CreatorWindow.close()">×</button>
                </div>
            </div>
        `;
    },

    renderFileOptionsHTML: (selfName, self, opts) => {
        const { chkTemplateId, lsManualKey, refPathDisplay, refOptionLabel, manualPlaceholder } = opts;
        const escapedManual = CreatorShared.escapeHtml(self.manualTemplatePath || '');
        return `
            <div style="flex:0 0 auto; background:#181818; padding:10px; border-radius:4px; border:1px solid #333;">
                <label style="display:block; margin-bottom:8px; color:#aaa; font-weight:bold; font-size:0.85rem; border-bottom:1px solid #333; padding-bottom:4px;">Opciones de Archivo</label>
                
                <div style="display:flex; align-items:center; margin-bottom:6px;">
                    <input type="checkbox" id="chk-v0-files" onchange="${selfName}.createVersionZero = this.checked" ${self.createVersionZero ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;">
                    <label for="chk-v0-files" style="margin-left:8px; font-size:0.85rem; cursor:pointer; color:#ccc;">Crear Archivos Versión Cero (.txt)</label>
                </div>

                <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
                    <div style="display:flex; align-items:center;">
                        <input type="checkbox" id="${chkTemplateId}" onchange="${selfName}.toggleTemplateV001(this.checked)" ${self.createTemplateV001 ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;">
                        <label for="${chkTemplateId}" style="margin-left:8px; font-size:0.85rem; color:#fff; font-weight:bold; cursor:pointer;">📄 Crear v001 con Template</label>
                    </div>

                    ${self.createTemplateV001 ? `
                        <div style="display:flex; flex-direction:column; gap:8px; padding:10px; background:#12151c; border:1px solid #28303d; border-radius:4px; margin-left:22px; font-size:0.8rem;">
                            <div>
                                <label style="color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">Origen del Template:</label>
                                <select onchange="${selfName}.setTemplateSource(this.value)" style="width:100%; background:#1c222d; border:1px solid #3a4556; color:#fff; padding:4px 8px; border-radius:3px; font-size:0.8rem;">
                                    <option value="reference" ${self.templateSource === 'reference' ? 'selected' : ''}>${refOptionLabel}</option>
                                    <option value="custom" ${self.templateSource === 'custom' ? 'selected' : ''}>🛠️ Custom Template (Configurado por Proceso)</option>
                                    <option value="manual" ${self.templateSource === 'manual' ? 'selected' : ''}>📁 Create From... (Elegir archivo a mano)</option>
                                </select>
                            </div>

                            ${self.templateSource === 'reference' ? `
                                <div style="color:#888; font-size:0.75rem; background:#181d26; padding:6px 8px; border-radius:3px; border:1px solid #28303d;">
                                    Ruta: <b style="color:var(--accent); font-family:monospace;">${refPathDisplay}</b>
                                    <div style="color:#666; margin-top:2px;">Clona la última versión encontrada en esa carpeta.</div>
                                </div>
                            ` : ''}

                            ${self.templateSource === 'custom' ? `
                                <div style="color:#888; font-size:0.75rem; background:#181d26; padding:6px 8px; border-radius:3px; border:1px solid #28303d;">
                                    <span>Usa los templates específicos configurados por proceso en <b>Configuración > Proyectos > Templates</b>.</span>
                                </div>
                            ` : ''}

                            ${self.templateSource === 'manual' ? `
                                <div style="display:flex; flex-direction:column; gap:4px;">
                                    <label style="color:#aaa; font-size:0.75rem;">Archivo Base a Clonar:</label>
                                    <div style="display:flex; gap:6px;">
                                        <input type="text" value="${escapedManual}" 
                                               placeholder="${manualPlaceholder}" 
                                               onchange="${selfName}.manualTemplatePath = this.value; localStorage.setItem('${lsManualKey}', this.value);"
                                               style="flex:1; background:#1c222d; border:1px solid #3a4556; color:#fff; padding:4px 6px; font-size:0.75rem; border-radius:3px; font-family:monospace;">
                                        <button class="btn" onclick="${selfName}.browseManualTemplate()" style="background:#263238; border:1px solid #37474f; color:#fff; padding:4px 8px; font-size:0.75rem; cursor:pointer;">📁</button>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    createCommonMixin: (cfg) => {
        const getSelf = cfg.getSelf;
        const getOther = cfg.getOther;
        const lsPrefix = cfg.lsPrefix; // 'pipeta_ac' | 'pipeta_sc'
        const domPrefix = cfg.domPrefix; // 'ac' | 'sc'

        return {
            isVisible: false,
            container: null,
            presets: [],
            selectedPreset: null,
            presetsPath: CreatorShared.getDefaultPresetsPath(cfg.presetsSubdir),
            systemInfo: { username: "unknown" },
            createVersionZero: false,
            createTemplateV001: localStorage.getItem(`${lsPrefix}_create_template_v001`) === 'true',
            templateSource: localStorage.getItem(`${lsPrefix}_template_source`) || 'reference',
            manualTemplatePath: localStorage.getItem(`${lsPrefix}_manual_template_path`) || '',

            toggleTemplateV001: (checked) => {
                const Self = getSelf();
                Self.createTemplateV001 = checked;
                localStorage.setItem(`${lsPrefix}_create_template_v001`, checked ? 'true' : 'false');
                Self.render();
            },

            setTemplateSource: (source) => {
                const Self = getSelf();
                Self.templateSource = source;
                localStorage.setItem(`${lsPrefix}_template_source`, source);
                Self.render();
            },

            browseManualTemplate: async () => {
                const Self = getSelf();
                const res = await API.system.pickFile('Z:\\', CreatorShared.TEMPLATE_FILE_FILTER);
                if (res && res.success && res.path) {
                    Self.manualTemplatePath = res.path;
                    localStorage.setItem(`${lsPrefix}_manual_template_path`, res.path);
                    Self.render();
                }
            },

            getTemplateFileForProcess: async (processName, childNode) => {
                const Self = getSelf();
                const cleanProc = (processName || '').toLowerCase().trim();
                const activeProjId = localStorage.getItem('pipeta_active_project_id');
                const currentProj = (typeof settings !== 'undefined' ? (settings?.projects || []).find(p => p.id === activeProjId) || settings?.currentProject : null);

                if (Self.templateSource === 'manual') {
                    if (Self.manualTemplatePath) {
                        const ext = '.' + Self.manualTemplatePath.split('.').pop();
                        return { sourcePath: Self.manualTemplatePath, ext: ext };
                    }
                    return null;
                }

                if (Self.templateSource === 'custom') {
                    const customMap = currentProj?.templates?.customTemplates?.[cfg.customTemplatesKey] || {};
                    const customPath = customMap[cleanProc] || customMap[processName];
                    if (customPath) {
                        const ext = '.' + customPath.split('.').pop();
                        return { sourcePath: customPath, ext: ext };
                    }
                    return null;
                }

                const fallbackRoot = cfg.getFallbackWorkRoot ? cfg.getFallbackWorkRoot() : null;
                const workRoot = currentProj?.roots?.work || fallbackRoot || 'Z:/';
                const refSub = currentProj?.templates?.[cfg.referenceRootKey] || cfg.defaultReferenceSub;
                const fullRefRoot = refSub.startsWith('Z:') || refSub.startsWith('C:') || refSub.startsWith('/')
                    ? refSub
                    : `${workRoot}/${refSub}`.replace(/\\/g, '/');

                try {
                    const res = await API.templates.findReference(fullRefRoot, cleanProc);
                    if (res && res.found && res.filePath) {
                        return { sourcePath: res.filePath, ext: res.ext || ('.' + res.fileName.split('.').pop()) };
                    }
                } catch (e) {
                    console.error(`Error looking up reference template in ${cfg.name}:`, e);
                }
                return null;
            },

            close: () => {
                const Self = getSelf();
                Self.isVisible = false;
                if (Self.container) {
                    Self.container.style.display = 'none';
                }
                const other = getOther ? getOther() : null;
                if (!other || !other.isVisible) {
                    document.getElementById('sidebarCreatorBtn')?.classList.remove('active');
                }
            },

            selectPreset: (index) => {
                const Self = getSelf();
                if (index === "" || index === null || index === undefined) {
                    Self.selectedPreset = null;
                } else {
                    Self.selectedPreset = Self.presets[index];
                    Self.analyzePreset(Self.selectedPreset);
                    if (Self.selectedPreset) {
                        localStorage.setItem(`${lsPrefix}_last_preset`, Self.selectedPreset.id);
                    }
                }
                Self.render();
            },

            toggleAllProcesses: (checked) => {
                const Self = getSelf();
                const checkboxes = document.querySelectorAll(`.${domPrefix}-proc-chk`);
                checkboxes.forEach(cb => { cb.checked = checked; });
                Self.saveSelectedProcesses();
            },

            handleProcessCheckChange: () => {
                const Self = getSelf();
                const checkboxes = Array.from(document.querySelectorAll(`.${domPrefix}-proc-chk`));
                const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
                const masterCb = document.getElementById(cfg.allProcChkId);
                if (masterCb) masterCb.checked = allChecked;
                Self.saveSelectedProcesses();
            },

            showOverlay: (html) => CreatorShared.showOverlay(domPrefix, html),
            hideOverlay: () => CreatorShared.hideOverlay(domPrefix),
            writeMetadataFile: async () => {},
            makeDraggable: () => CreatorShared.makeDraggable(getSelf().container, cfg.dragHandleId)
        };
    }
};
