// ============================================================
// FILE AUDITOR — Unified Mirror Integrity & Render Status Auditor
// ============================================================

class FileAuditor {
    constructor() {
        this.isVisible = false;
        this.activeTab = 'mirror'; // 'mirror' | 'render'

        // Mirror Integrity State
        this.mirrorResults = [];
        this.isMirrorAuditing = false;
        this.activeMirrorFilter = 'all';
        const savedOmit = localStorage.getItem('pipeta_mirror_audit_omit_control');
        this.omitControlFiles = savedOmit !== null ? savedOmit === 'true' : true;
        const savedOmitProj = localStorage.getItem('pipeta_mirror_audit_omit_project_files');
        this.omitProjectFiles = savedOmitProj !== null ? savedOmitProj === 'true' : true;

        // Render Status State
        this.renderAuditMode = 'scenes'; // 'scenes' (1. Archivos de Proceso) | 'renders' (2. Renders vs Procesos)
        this.renderResults = [];
        this.isRenderAuditing = false;
        this.activeRenderFilter = 'all';
        this.renderConfig = {
            process: 'compo',
            onlyFullRes: true,
            includeMov: false,
            latestOnly: true,
            omitV001: false,
            checkTclExt: false
        };

        window.fileAuditor = this;
        window.mirrorAuditor = this; // Compatibility alias
        this.renderUI();
    }

    renderUI() {
        if (document.getElementById('file-auditor-window')) return;

        this.container = document.createElement('div');
        this.container.id = 'file-auditor-window';
        this.container.className = 'validator-window';
        this.container.style.display = 'none';

        // Dimensions
        this.container.style.width = '840px';
        this.container.style.height = '700px';
        this.container.style.minWidth = '540px';
        this.container.style.minHeight = '420px';
        this.container.style.resize = 'both';
        this.container.style.overflow = 'hidden';
        this.container.style.top = '50px';
        this.container.style.left = '140px';

        this.container.innerHTML = `
            <div class="validator-header" id="file-auditor-header" onmousedown="window.fileAuditor.startDrag(event)">
                <div class="validator-title" style="display:flex; align-items:center; gap:10px;">
                    <span class="validator-icon" style="font-size:1.2rem;">📊</span>
                    <b style="font-weight:bold;">File Auditor</b>
                    <span id="file-auditor-badge" style="font-size:0.7rem; background:#333; padding:2px 6px; border-radius:4px; margin-left:6px; color:#aaa;">PROYECTO ↔ MEDIA</span>
                </div>
                <div class="validator-controls">
                    <button class="icon-btn-mini" onclick="window.fileAuditor.minimize(this)">-</button>
                    <button class="icon-btn-mini" style="color:#f44336;" onclick="window.fileAuditor.toggle()">✕</button>
                </div>
            </div>

            <!-- TOP NAV TABS -->
            <div style="display:flex; background:#141414; border-bottom:1px solid #333; flex-shrink:0;">
                <button id="fa-tab-btn-mirror" class="sync-filter-tab active" style="flex:1; padding:8px; font-weight:bold; font-size:0.8rem;" onclick="fileAuditor.switchTab('mirror')">
                    🪞 Mirror Integrity (Carpetas)
                </button>
                <button id="fa-tab-btn-render" class="sync-filter-tab" style="flex:1; padding:8px; font-weight:bold; font-size:0.8rem;" onclick="fileAuditor.switchTab('render')">
                    🎬 Render & Scene Status
                </button>
            </div>

            <div class="validator-body" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                
                <!-- ================= TAB 1: MIRROR INTEGRITY ================= -->
                <div id="fa-panel-mirror" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                    <!-- INFO & CONTROLS -->
                    <div style="padding:8px; background:#1a1a1a; border-bottom:1px solid #333; flex-shrink:0;">
                        <div style="font-size:0.75rem; color:#888; margin-bottom:6px;">
                            Verifica que cada plano/asset en <b style="color:#4fc3f7;">Proyecto</b> tenga su estructura de carpetas en <b style="color:#81c784;">Media</b> (y viceversa).
                        </div>
                        <div style="display:flex; gap:6px; margin-bottom:6px;">
                            <button class="action-btn-small" style="flex:1;" onclick="fileAuditor.runMirrorAudit('all')">🌎 Auditar Proyecto Completo</button>
                            <button class="action-btn-small" style="flex:1;" onclick="fileAuditor.runMirrorAudit('selection')">📂 Auditar Selección</button>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; align-items:center;">
                            <div style="display:flex; gap:12px;">
                                <label style="font-size:0.72rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:4px; user-select:none;">
                                    <input type="checkbox" id="mirror-omit-proj" ${this.omitProjectFiles ? 'checked' : ''} onchange="fileAuditor.toggleOmitProjectFiles(this.checked)">
                                    <span>Omitir archivos de proyecto (.nk, .hip, .txt)</span>
                                </label>
                            </div>
                            <span id="mirror-audit-roots-summary" style="font-size:0.7rem; color:#666;">-</span>
                        </div>
                    </div>

                    <!-- FILTER TABS -->
                    <div style="display:flex; border-bottom:1px solid #333; flex-shrink:0; background:#181818;">
                        <button class="sync-filter-tab active" data-filter="all" onclick="fileAuditor.setMirrorFilter('all', this)">
                            Todos <span id="mirror-count-all" class="sync-badge">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="missing-media" onclick="fileAuditor.setMirrorFilter('missing-media', this)">
                            🔴 Falta en Media <span id="mirror-count-missing-media" class="sync-badge" style="background:#e57373; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="missing-work" onclick="fileAuditor.setMirrorFilter('missing-work', this)">
                            🔵 Falta en Proyecto <span id="mirror-count-missing-work" class="sync-badge" style="background:#64b5f6; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="incomplete" onclick="fileAuditor.setMirrorFilter('incomplete', this)">
                            🟡 Incompletos <span id="mirror-count-incomplete" class="sync-badge" style="background:#ffd54f; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="ok" onclick="fileAuditor.setMirrorFilter('ok', this)">
                            🟢 OK <span id="mirror-count-ok" class="sync-badge" style="background:#81c784; color:#000;">0</span>
                        </button>
                    </div>

                    <!-- STATUS BAR -->
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; flex-shrink:0; border-bottom:1px solid #222; background:#121212;">
                        <div id="mirror-audit-status" style="font-size:0.7rem; color:#888;">Listo para auditar espejo</div>
                        <label style="font-size:0.7rem; color:#888; cursor:pointer; display:flex; align-items:center; gap:4px; user-select:none;">
                            <input type="checkbox" id="mirror-select-all" onchange="fileAuditor.toggleMirrorSelectAll(this.checked)"> Seleccionar todo
                        </label>
                    </div>

                    <!-- RESULTS LIST -->
                    <div class="val-results" id="mirror-results-list" style="flex:1; overflow-y:auto; background:#111; padding:6px; border:1px solid #333;">
                        <div class="empty-state" style="padding:40px; text-align:center; color:#555;">
                            <div style="font-size:2.2rem; margin-bottom:10px;">🪞</div>
                            Haz clic en <b>Auditar Proyecto Completo</b> o <b>Auditar Selección</b> para verificar la integridad del espejo.
                        </div>
                    </div>

                    <!-- FOOTER -->
                    <div style="padding:8px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; border-top:1px solid #333; background:#161616;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span id="mirror-selected-summary" style="font-size:0.75rem; color:#aaa;">0 elementos seleccionados</span>
                            <span id="mirror-total-diffs" style="font-size:0.75rem; color:#888;">0 discrepancias</span>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button id="mirror-btn-fix-media" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="fileAuditor.repairMirrorSelected('media')">
                                🔧 Reparar en Media
                            </button>
                            <button id="mirror-btn-fix-work" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="fileAuditor.repairMirrorSelected('work')">
                                🔧 Reparar en Proyecto
                            </button>
                            <button id="mirror-btn-fix-all" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="fileAuditor.repairMirrorSelected('both')">
                                ⚡ Reparar Todo
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ================= TAB 2: RENDER & SCENE STATUS ================= -->
                <div id="fa-panel-render" style="display:none; flex-direction:column; height:100%; overflow:hidden;">
                    
                    <!-- MODALITY SELECTOR BUTTONS (MUTUALLY EXCLUSIVE) -->
                    <div style="display:flex; background:#111; padding:6px 8px; border-bottom:1px solid #333; gap:8px; flex-shrink:0;">
                        <button id="fa-mode-btn-scenes" style="flex:1; border-radius:4px; padding:8px 12px; font-weight:bold; font-size:0.8rem; text-align:center; cursor:pointer; transition:all 0.2s ease; background:#0288D1; color:#fff; border:1px solid #29B6F6; box-shadow:0 0 10px rgba(41, 182, 246, 0.4);" onclick="fileAuditor.setRenderAuditMode('scenes')">
                            📄 Archivos de Proceso / Escenas
                        </button>
                        <button id="fa-mode-btn-renders" style="flex:1; border-radius:4px; padding:8px 12px; font-weight:bold; font-size:0.8rem; text-align:center; cursor:pointer; transition:all 0.2s ease; background:#222; color:#888; border:1px solid #333;" onclick="fileAuditor.setRenderAuditMode('renders')">
                            🎬 Renders vs Procesos
                        </button>
                    </div>

                    <!-- CONTROLS & OPTIONS -->
                    <div style="padding:8px; background:#181818; border-bottom:1px solid #333; flex-shrink:0;">
                        <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
                            <button class="action-btn-small" style="flex:1.2;" onclick="fileAuditor.runRenderAudit('all')">🌎 Auditar Todo</button>
                            <button class="action-btn-small" style="flex:1.2;" onclick="fileAuditor.runRenderAudit('selection')">📂 Auditar Selección</button>
                            <div style="display:flex; align-items:center; gap:4px; background:#222; padding:3px 6px; border-radius:3px; border:1px solid #444;">
                                <span style="font-size:0.7rem; color:#aaa;">Proceso:</span>
                                <select id="render-audit-process" onchange="fileAuditor.setRenderProcess(this.value)" style="background:#111; color:#4fc3f7; border:1px solid #555; border-radius:3px; font-size:0.75rem; padding:2px 4px;">
                                    <option value="compo" selected>compo</option>
                                    <option value="all">Todos los procesos</option>
                                </select>
                            </div>
                        </div>

                        <!-- OPTIONS FOR SCENES MODE -->
                        <div id="render-options-scenes" style="display:flex; font-size:0.72rem; color:#aaa; background:#141414; padding:5px 8px; border-radius:4px; border:1px solid #282828;">
                            <span>🔍 Revisa archivos editables (.nk, .hip, .blend) para el proceso seleccionado. Omite <code>.txt</code>, <code>.json</code> y temporales.</span>
                        </div>

                        <!-- OPTIONS FOR RENDERS MODE -->
                        <div id="render-options-renders" style="display:none; flex-wrap:wrap; gap:12px; font-size:0.72rem; color:#ccc; background:#141414; padding:6px 8px; border-radius:4px; border:1px solid #282828;">
                            <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                <input type="checkbox" id="render-opt-fullres" checked onchange="fileAuditor.updateRenderConfig('onlyFullRes', this.checked)">
                                <span>🎯 Solo FullRes / Final</span>
                            </label>
                            <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                <input type="checkbox" id="render-opt-mov" onchange="fileAuditor.updateRenderConfig('includeMov', this.checked)">
                                <span>🎬 Incluir Mov / Compresión</span>
                            </label>
                            <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                <input type="checkbox" id="render-opt-latest" checked onchange="fileAuditor.updateRenderConfig('latestOnly', this.checked)">
                                <span>⚡ Solo última versión</span>
                            </label>
                            <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                <input type="checkbox" id="render-opt-omit-v001" onchange="fileAuditor.updateRenderConfig('omitV001', this.checked)">
                                <span>🚫 Omitir v001 y v000</span>
                            </label>
                            <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                <input type="checkbox" id="render-opt-tclextern" onchange="fileAuditor.updateRenderConfig('checkTclExt', this.checked)">
                                <span>⚡ Verificar TCL Ext (existencia)</span>
                            </label>
                        </div>
                    </div>

                    <!-- FILTER TABS FOR SCENES MODE -->
                    <div id="render-tabs-scenes" style="display:flex; border-bottom:1px solid #333; flex-shrink:0; background:#181818;">
                        <button class="sync-filter-tab active" data-filter="all" onclick="fileAuditor.setRenderFilter('all', this)">
                            Todos <span id="scenes-count-all" class="sync-badge">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="has-scene" onclick="fileAuditor.setRenderFilter('has-scene', this)">
                            🟢 Con Escena <span id="scenes-count-has" class="sync-badge" style="background:#81c784; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="bad-naming" onclick="fileAuditor.setRenderFilter('bad-naming', this)">
                            🟠 Nombre Incorrecto <span id="scenes-count-bad" class="sync-badge" style="background:#ff9800; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="no-script" onclick="fileAuditor.setRenderFilter('no-script', this)">
                            🔴 Sin Escena <span id="scenes-count-no" class="sync-badge" style="background:#e57373; color:#000;">0</span>
                        </button>
                    </div>

                    <!-- FILTER TABS FOR RENDERS MODE -->
                    <div id="render-tabs-renders" style="display:none; border-bottom:1px solid #333; flex-shrink:0; background:#181818;">
                        <button class="sync-filter-tab active" data-filter="all" onclick="fileAuditor.setRenderFilter('all', this)">
                            Todos <span id="render-count-all" class="sync-badge">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="up-to-date" onclick="fileAuditor.setRenderFilter('up-to-date', this)">
                            🟢 Al Día <span id="render-count-uptodate" class="sync-badge" style="background:#81c784; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="outdated" onclick="fileAuditor.setRenderFilter('outdated', this)">
                            🟡 Desactualizado <span id="render-count-outdated" class="sync-badge" style="background:#ffd54f; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="bad-naming" onclick="fileAuditor.setRenderFilter('bad-naming', this)">
                            🟠 Nombre Incorrecto <span id="render-count-badnaming" class="sync-badge" style="background:#ff9800; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="missing-render" onclick="fileAuditor.setRenderFilter('missing-render', this)">
                            🔴 Sin Render <span id="render-count-missing" class="sync-badge" style="background:#e57373; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="orphan-render" onclick="fileAuditor.setRenderFilter('orphan-render', this)">
                            🟣 Render Sin Escena <span id="render-count-orphan" class="sync-badge" style="background:#ba68c8; color:#000;">0</span>
                        </button>
                    </div>

                    <!-- STATUS BAR -->
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; flex-shrink:0; border-bottom:1px solid #222; background:#121212;">
                        <div id="render-audit-status" style="font-size:0.7rem; color:#888;">Listo para auditar</div>
                        <span id="render-summary-badge" style="font-size:0.7rem; color:#aaa;">0 planos analizados</span>
                    </div>

                    <!-- RESULTS LIST -->
                    <div class="val-results" id="render-results-list" style="flex:1; overflow-y:auto; background:#111; padding:6px; border:1px solid #333;">
                        <div class="empty-state" style="padding:40px; text-align:center; color:#555;">
                            <div style="font-size:2.2rem; margin-bottom:10px;">🎬</div>
                            Haz clic en <b>Auditar Todo</b> o <b>Auditar Selección</b> para comenzar.
                        </div>
                    </div>

                    <!-- FOOTER -->
                    <div style="padding:6px 8px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; border-top:1px solid #333; background:#161616; font-size:0.72rem; color:#888;">
                        <span id="render-footer-text">Modo 1: Comprueba existencia de escenas (.nk) para cada plano.</span>
                    </div>
                </div>

            </div>
        `;

        document.body.appendChild(this.container);
    }

    // --- TAB SWITCHING ---
    switchTab(tab) {
        this.activeTab = tab;
        const btnMirror = document.getElementById('fa-tab-btn-mirror');
        const btnRender = document.getElementById('fa-tab-btn-render');
        const panMirror = document.getElementById('fa-panel-mirror');
        const panRender = document.getElementById('fa-panel-render');

        if (tab === 'mirror') {
            btnMirror.classList.add('active');
            btnRender.classList.remove('active');
            panMirror.style.display = 'flex';
            panRender.style.display = 'none';
        } else {
            btnRender.classList.add('active');
            btnMirror.classList.remove('active');
            panRender.style.display = 'flex';
            panMirror.style.display = 'none';
            this._populateProcessSelect();
        }
    }

    setRenderAuditMode(mode) {
        this.renderAuditMode = mode; // 'scenes' | 'renders'
        const btnScenes = document.getElementById('fa-mode-btn-scenes');
        const btnRenders = document.getElementById('fa-mode-btn-renders');
        const optScenes = document.getElementById('render-options-scenes');
        const optRenders = document.getElementById('render-options-renders');
        const tabsScenes = document.getElementById('render-tabs-scenes');
        const tabsRenders = document.getElementById('render-tabs-renders');
        const footerText = document.getElementById('render-footer-text');

        if (mode === 'scenes') {
            btnScenes.style.background = '#0288D1';
            btnScenes.style.color = '#fff';
            btnScenes.style.border = '1px solid #29B6F6';
            btnScenes.style.boxShadow = '0 0 10px rgba(41, 182, 246, 0.4)';

            btnRenders.style.background = '#222';
            btnRenders.style.color = '#888';
            btnRenders.style.border = '1px solid #333';
            btnRenders.style.boxShadow = 'none';

            optScenes.style.display = 'flex';
            optRenders.style.display = 'none';
            tabsScenes.style.display = 'flex';
            tabsRenders.style.display = 'none';
            if (footerText) footerText.innerText = 'Comprueba existencia y nomenclatura de escenas (.nk, .hip, .blend) para cada plano.';
        } else {
            btnRenders.style.background = '#0288D1';
            btnRenders.style.color = '#fff';
            btnRenders.style.border = '1px solid #29B6F6';
            btnRenders.style.boxShadow = '0 0 10px rgba(41, 182, 246, 0.4)';

            btnScenes.style.background = '#222';
            btnScenes.style.color = '#888';
            btnScenes.style.border = '1px solid #333';
            btnScenes.style.boxShadow = 'none';

            optScenes.style.display = 'none';
            optRenders.style.display = 'flex';
            tabsScenes.style.display = 'none';
            tabsRenders.style.display = 'flex';
            if (footerText) footerText.innerText = 'Comprueba existencia de renders en Media vs escenas del proyecto y detecta renders huérfanos.';
        }

        this.activeRenderFilter = 'all';
        if (this.renderResults.length > 0) {
            this.renderRenderResults();
        }
    }

    // --- WINDOW CONTROL ---
    toggle() {
        this.isVisible = !this.isVisible;
        this.container.style.display = this.isVisible ? 'flex' : 'none';
        if (this.isVisible) {
            this._updateRootsSummary();
            this._populateProcessSelect();
        }
    }

    minimize(btn) {
        const body = this.container.querySelector('.validator-body');
        const isMin = body.style.display === 'none';
        body.style.display = isMin ? 'flex' : 'none';
        this.container.style.height = isMin ? '700px' : 'auto';
        this.container.style.resize = isMin ? 'both' : 'none';
        btn.innerText = isMin ? '-' : '□';
    }

    startDrag(e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        this._dragOff = {
            x: e.clientX - this.container.offsetLeft,
            y: e.clientY - this.container.offsetTop
        };
        const moveH = ev => {
            this.container.style.left = (ev.clientX - this._dragOff.x) + 'px';
            this.container.style.top = (ev.clientY - this._dragOff.y) + 'px';
        };
        const upH = () => {
            document.removeEventListener('mousemove', moveH);
            document.removeEventListener('mouseup', upH);
        };
        document.addEventListener('mousemove', moveH);
        document.addEventListener('mouseup', upH);
    }

    _getRoots() {
        const isOnline = window.viewLocationMode === 'online';
        const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
        return {
            work: isOnline 
                ? (proj?.roots?.onlineWork || proj?.roots?.work || '') 
                : (proj?.roots?.work || (typeof ROOTS !== 'undefined' ? ROOTS.work : '')),
            media: isOnline 
                ? (proj?.roots?.onlineMedia || proj?.roots?.media || '') 
                : (proj?.roots?.media || (typeof ROOTS !== 'undefined' ? ROOTS.media : ''))
        };
    }

    _updateRootsSummary() {
        const r = this._getRoots();
        const el = document.getElementById('mirror-audit-roots-summary');
        if (el) {
            el.innerText = `PROY: ${r.work || '-'} | MEDIA: ${r.media || '-'}`;
        }
    }

    async _populateProcessSelect() {
        const sel = document.getElementById('render-audit-process');
        if (!sel) return;
        try {
            const presetCfg = await this._loadPresetConfig();
            if (presetCfg && presetCfg.processes && presetCfg.processes.length > 0) {
                const currentVal = sel.value || 'compo';
                let html = '';
                for (const p of presetCfg.processes) {
                    html += `<option value="${p}" ${p === currentVal ? 'selected' : ''}>${p}</option>`;
                }
                html += `<option value="all" ${currentVal === 'all' ? 'selected' : ''}>Todos los procesos</option>`;
                sel.innerHTML = html;
            }
        } catch (e) {}
    }

    async _loadPresetConfig() {
        const defaultMedia = ['IA', 'IA/enc', 'IA/export', 'IA/ref', 'nuke', 'nuke/exportIA', 'nuke/fullres', 'nuke/prerender', 'in'];
        const defaultWork = ['compo'];

        try {
            const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
            const presetId = proj?.defaultShotPresetId || (typeof settings !== 'undefined' ? settings.validationPresetShot : null) || 'master_shot';
            
            let preset = null;
            if (typeof Inspector !== 'undefined' && Inspector.getPreset) {
                preset = await Inspector.getPreset(presetId);
            }

            if (!preset || !preset.nodes) {
                return { 
                    mediaSubfolders: defaultMedia, 
                    workSubfolders: defaultWork, 
                    presetName: 'Canon Default',
                    processes: ['compo'],
                    nodes: [],
                    allowedExtensions: ['.nk', '.hip', '.blend', '.ma', '.mb', '.aep', '.prproj', '.c4d']
                };
            }

            const nodes = preset.nodes;
            const workShotNode = nodes.find(n => n.isShot && n.y < 0) || nodes.find(n => n.name && n.name.toLowerCase().includes('shot') && n.y < 0);
            const mediaShotNode = nodes.find(n => n.isShot && n.y >= 0) || nodes.find(n => n.name && n.name.toLowerCase().includes('shot') && n.y >= 0);

            // Filter ONLY folder nodes for mirror structure integrity
            function getDescendants(parentId, currentPath = '') {
                const results = [];
                const children = nodes.filter(n => n.parent === parentId && n.type === 'folder' && !n.isExternalTcl);
                for (const child of children) {
                    const segName = child.name;
                    const fullSeg = currentPath ? `${currentPath}/${segName}` : segName;
                    results.push(fullSeg);
                    results.push(...getDescendants(child.id, fullSeg));
                }
                return results;
            }

            const workSub = workShotNode ? getDescendants(workShotNode.id) : defaultWork;
            const mediaSub = mediaShotNode ? getDescendants(mediaShotNode.id) : defaultMedia;

            // Extract processes under shot in work
            // Extract allowed scene extensions per process
            const procExtMap = {};
            const extSet = new Set(['.nk', '.hip', '.blend', '.ma', '.mb', '.aep', '.prproj', '.c4d']);
            for (const pn of procNodes) {
                const procChildren = nodes.filter(n => n.parent === pn.id && (n.type === 'file' || n.isScene));
                const pExts = [];
                for (const pc of procChildren) {
                    if (pc.name && pc.name.includes('.')) {
                        const ext = '.' + pc.name.split('.').pop().toLowerCase();
                        if (!['.txt', '.json', '.bak', '.tmp', '.log', '.md'].includes(ext)) {
                            pExts.push(ext);
                            extSet.add(ext);
                        }
                    }
                }
                procExtMap[pn.name] = pExts.length > 0 ? pExts[0] : (pn.name.toLowerCase().includes('nuke') || pn.name.toLowerCase().includes('compo') ? '.nk' : '.nk');
            }

            return {
                mediaSubfolders: mediaSub.length > 0 ? Array.from(new Set(mediaSub)) : defaultMedia,
                workSubfolders: workSub.length > 0 ? Array.from(new Set(workSub)) : defaultWork,
                presetName: preset.name || presetId,
                processes: procNames.length > 0 ? procNames : ['compo'],
                nodes: nodes,
                procExtMap: procExtMap,
                allowedExtensions: Array.from(extSet)
            };
        } catch (e) {
            console.warn("Could not parse preset subfolders, using defaults:", e);
            return { 
                mediaSubfolders: defaultMedia, 
                workSubfolders: defaultWork, 
                presetName: 'Canon Default',
                processes: ['compo'],
                nodes: [],
                procExtMap: { 'compo': '.nk' },
                allowedExtensions: ['.nk', '.hip', '.blend', '.ma', '.mb', '.aep', '.prproj', '.c4d']
            };
        }
    }

    // ============================================================
    // TAB 1: MIRROR INTEGRITY LOGIC
    // ============================================================

    toggleOmitControl(checked) {
        this.omitControlFiles = checked;
        localStorage.setItem('pipeta_mirror_audit_omit_control', checked ? 'true' : 'false');
    }

    toggleOmitProjectFiles(checked) {
        this.omitProjectFiles = checked;
        localStorage.setItem('pipeta_mirror_audit_omit_project_files', checked ? 'true' : 'false');
    }

    _setMirrorStatus(text, color = '#888') {
        const el = document.getElementById('mirror-audit-status');
        if (el) {
            el.innerText = text;
            el.style.color = color;
        }
    }

    async runMirrorAudit(scope = 'all') {
        if (this.isMirrorAuditing) return;
        this.isMirrorAuditing = true;
        this.mirrorResults = [];

        const roots = this._getRoots();
        if (!roots.work || !roots.media) {
            this._setMirrorStatus('❌ Raíces de Proyecto o Media no encontradas.', '#f44336');
            this.isMirrorAuditing = false;
            return;
        }

        const isOnline = window.viewLocationMode === 'online';
        this._setMirrorStatus(`🔍 Escaneando espejo ${isOnline ? 'Online (G:)' : 'Local (Z:)'}...`, '#4fc3f7');
        const listEl = document.getElementById('mirror-results-list');
        listEl.innerHTML = `<div style="padding:25px; text-align:center; color:#888;"><div class="spinner-small"></div> Analizando árbol cruzado Proyecto ↔ Media (${isOnline ? 'ONLINE' : 'LOCAL'})...</div>`;

        try {
            const presetCfg = await this._loadPresetConfig();
            const badgeEl = document.getElementById('file-auditor-badge');
            if (badgeEl) badgeEl.innerText = `PRESET: ${presetCfg.presetName.toUpperCase()}`;

            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] 🪞 Iniciando auditoría Mirror (${scope}) [Preset: ${presetCfg.presetName}] en Proyecto: ${roots.work} ↔ Media: ${roots.media}`, 'info');
            }

            let targetEpisodes = [];

            if (scope === 'selection' && selectedContextPath) {
                const normSel = selectedContextPath.replace(/\\/g, '/');
                const relWork = normSel.toLowerCase().startsWith(roots.work.toLowerCase())
                    ? normSel.substring(roots.work.length).replace(/^\/+/, '')
                    : '';
                const relMedia = normSel.toLowerCase().startsWith(roots.media.toLowerCase())
                    ? normSel.substring(roots.media.length).replace(/^\/+/, '')
                    : '';
                const rel = relWork || relMedia;
                const parts = rel.split('/').filter(Boolean);
                
                let epName = parts.find(p => p.toLowerCase() !== 'episodios' && p.toLowerCase() !== 'secuencias' && p.toLowerCase() !== 'shots');
                if (epName) targetEpisodes.push(epName);
            }

            const res = await fetch('/api/audit/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auditType: 'mirror',
                    roots,
                    scope,
                    targetEpisodes,
                    config: {
                        expectedMedia: presetCfg.mediaSubfolders,
                        expectedWork: presetCfg.workSubfolders,
                        omitProjectFiles: this.omitProjectFiles,
                        omitControl: this.omitControlFiles
                    }
                })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Error al escanear espejo');

            this.mirrorResults = data.results || [];
            this.isMirrorAuditing = false;

            const diffsCount = this.mirrorResults.filter(r => r.status !== 'ok').length;
            this._setMirrorStatus(`✅ Auditoría finalizada: ${this.mirrorResults.length} planos analizados (${diffsCount} discrepancias).`, diffsCount > 0 ? '#FF9800' : '#4CAF50');
            
            if (typeof PipetaConsole !== 'undefined') {
                const level = diffsCount > 0 ? 'warn' : 'ok';
                PipetaConsole.log('audit', `[FILE AUDITOR] 🪞 Auditoría Mirror finalizada: ${this.mirrorResults.length} planos analizados (${diffsCount} discrepancias encontradas).`, level);
            }

            this.renderMirrorResults();

        } catch (err) {
            this.isMirrorAuditing = false;
            console.error("Mirror audit error:", err);
            this._setMirrorStatus('❌ Error durante la auditoría: ' + err.message, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] ❌ Error en auditoría Mirror: ${err.message}`, 'error');
            }
        }
    }

    renderMirrorResults() {
        const listEl = document.getElementById('mirror-results-list');
        const filtered = this.activeMirrorFilter === 'all'
            ? this.mirrorResults
            : this.mirrorResults.filter(r => {
                if (this.activeMirrorFilter === 'incomplete') return r.status === 'incomplete';
                return r.status === this.activeMirrorFilter;
            });

        const countAll = this.mirrorResults.length;
        const countMissingM = this.mirrorResults.filter(r => r.status === 'missing-media').length;
        const countMissingW = this.mirrorResults.filter(r => r.status === 'missing-work').length;
        const countIncomplete = this.mirrorResults.filter(r => r.status === 'incomplete').length;
        const countOk = this.mirrorResults.filter(r => r.status === 'ok').length;

        document.getElementById('mirror-count-all').innerText = countAll;
        document.getElementById('mirror-count-missing-media').innerText = countMissingM;
        document.getElementById('mirror-count-missing-work').innerText = countMissingW;
        document.getElementById('mirror-count-incomplete').innerText = countIncomplete;
        document.getElementById('mirror-count-ok').innerText = countOk;
        document.getElementById('mirror-total-diffs').innerText = `${countMissingM + countMissingW + countIncomplete} discrepancias`;

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="padding:30px; text-align:center; color:#666;">
                    ${this.mirrorResults.length === 0 ? 'No se encontraron planos en las rutas seleccionadas.' : 'No hay planos en este filtro.'}
                </div>
            `;
            this._updateMirrorButtons();
            return;
        }

        listEl.innerHTML = filtered.map(item => {
            let statusBadge = '';
            let statusBorder = '#333';
            let detailText = '';

            if (item.status === 'missing-media') {
                statusBadge = '<span style="background:#e57373; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">FALTA EN MEDIA</span>';
                statusBorder = '#e57373';
                detailText = `<span style="color:#e57373;">❌ No existe carpeta de media en <code>${item.mediaPath}</code></span>`;
            } else if (item.status === 'missing-work') {
                statusBadge = '<span style="background:#64b5f6; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">FALTA EN PROYECTO</span>';
                statusBorder = '#64b5f6';
                detailText = `<span style="color:#64b5f6;">❌ No existe carpeta de trabajo en <code>${item.workPath}</code></span>`;
            } else if (item.status === 'incomplete') {
                statusBadge = '<span style="background:#ffd54f; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">INCOMPLETO</span>';
                statusBorder = '#ffd54f';
                const mMiss = item.missingMediaFolders.length > 0 ? `Media: faltan [${item.missingMediaFolders.join(', ')}]` : '';
                const wMiss = item.missingWorkFolders.length > 0 ? `Proyecto: faltan [${item.missingWorkFolders.join(', ')}]` : '';
                detailText = `<span style="color:#ffd54f;">⚠️ ${[mMiss, wMiss].filter(Boolean).join(' | ')}</span>`;
            } else {
                statusBadge = '<span style="background:#81c784; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">OK</span>';
                statusBorder = '#2e7d32';
                detailText = `<span style="color:#81c784;">✓ Espejo íntegro (Proyecto y Media sincronizados)</span>`;
            }

            return `
                <div style="display:flex; align-items:flex-start; gap:8px; padding:6px 8px; margin-bottom:4px; background:#181818; border-left:3px solid ${statusBorder}; border-radius:3px; font-size:0.75rem;">
                    <input type="checkbox" ${item.selected ? 'checked' : ''} onchange="fileAuditor.toggleMirrorItemSelect('${item.key}', this.checked)" style="margin-top:3px; cursor:pointer;">
                    <div style="flex:1; overflow:hidden;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                            <span style="font-weight:bold; color:#fff; font-family:monospace; font-size:0.85rem;">🎬 ${item.shot}</span>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <span style="color:#888; font-size:0.7rem;">${item.ep} / ${item.seq}</span>
                                ${statusBadge}
                            </div>
                        </div>
                        <div style="font-size:0.7rem; margin-top:2px;">
                            ${detailText}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this._updateMirrorButtons();
    }

    setMirrorFilter(filter, btn) {
        this.activeMirrorFilter = filter;
        this.container.querySelectorAll('#fa-panel-mirror .sync-filter-tab').forEach(t => t.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.renderMirrorResults();
    }

    toggleMirrorItemSelect(key, selected) {
        const item = this.mirrorResults.find(r => r.key === key);
        if (item) item.selected = selected;
        this._updateMirrorButtons();
    }

    toggleMirrorSelectAll(checked) {
        const filtered = this.activeMirrorFilter === 'all'
            ? this.mirrorResults
            : this.mirrorResults.filter(r => r.status === this.activeMirrorFilter);
        filtered.forEach(r => r.selected = checked);
        this.renderMirrorResults();
    }

    _updateMirrorButtons() {
        const selected = this.mirrorResults.filter(r => r.selected);
        const selCount = selected.length;
        document.getElementById('mirror-selected-summary').innerText = `${selCount} elementos seleccionados`;

        const canFixMedia = selected.some(r => r.status === 'missing-media' || r.missingMediaFolders.length > 0);
        const canFixWork = selected.some(r => r.status === 'missing-work' || r.missingWorkFolders.length > 0);
        const canFixAny = selCount > 0;

        const btnMedia = document.getElementById('mirror-btn-fix-media');
        const btnWork = document.getElementById('mirror-btn-fix-work');
        const btnAll = document.getElementById('mirror-btn-fix-all');

        if (btnMedia) {
            btnMedia.disabled = !canFixMedia;
            btnMedia.style.background = canFixMedia ? '#81c784' : '#444';
            btnMedia.style.color = canFixMedia ? '#000' : '#888';
        }
        if (btnWork) {
            btnWork.disabled = !canFixWork;
            btnWork.style.background = canFixWork ? '#4fc3f7' : '#444';
            btnWork.style.color = canFixWork ? '#000' : '#888';
        }
        if (btnAll) {
            btnAll.disabled = !canFixAny;
            btnAll.style.background = canFixAny ? '#ffb74d' : '#444';
            btnAll.style.color = canFixAny ? '#000' : '#888';
        }
    }

    async repairMirrorSelected(mode = 'both') {
        const selected = this.mirrorResults.filter(r => r.selected);
        if (selected.length === 0) return;

        const confirmMsg = `¿Reparar y crear las carpetas de espejo para los ${selected.length} plano(s) seleccionados?`;
        if (!confirm(confirmMsg)) return;

        this._setMirrorStatus(`⏳ Reparando ${selected.length} plano(s)...`, '#4fc3f7');

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('audit', `[FILE AUDITOR] 🛠️ Iniciando reparación Mirror (${mode}) para ${selected.length} plano(s)...`, 'info');
        }

        try {
            const presetCfg = await this._loadPresetConfig();

            const res = await fetch('/api/mirror/repairBatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: selected,
                    mode: mode,
                    mediaSubfolders: presetCfg.mediaSubfolders,
                    workSubfolders: presetCfg.workSubfolders,
                    omitControl: this.omitControlFiles
                })
            });

            const data = await res.json();
            if (data.success) {
                const msg = `✅ Reparación completada: ${data.repairedCount} estructura(s) de espejo creadas con éxito.`;
                this._setMirrorStatus(msg, '#4CAF50');
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('audit', `[FILE AUDITOR] ${msg}`, 'ok', data);
                    selected.forEach(s => {
                        PipetaConsole.log('audit', ` ↳ [REPAIR] 📁 ${s.shotId || s.shotName || s.relativePath || 'Plano'} ➔ Media: ${s.mediaPath || 'Estructura espejo OK'}`, 'ok');
                    });
                }
                alert(msg);
            } else {
                this._setMirrorStatus(`❌ Error al reparar: ${data.error || 'Desconocido'}`, '#f44336');
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('audit', `[FILE AUDITOR] ❌ Error al reparar espejo: ${data.error || 'Desconocido'}`, 'error');
                }
                alert(`❌ Error al reparar: ${data.error || 'Desconocido'}`);
            }
        } catch (e) {
            console.error("Repair error:", e);
            this._setMirrorStatus(`❌ Error: ${e.message}`, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] ❌ Excepción al reparar espejo: ${e.message}`, 'error');
            }
            alert(`Error al reparar: ${e.message}`);
        }
    }

    // ============================================================
    // TAB 2: RENDER & SCENE STATUS AUDITOR LOGIC
    // ============================================================

    setRenderProcess(proc) {
        this.renderConfig.process = proc;
        if (this.renderResults.length > 0) this.runRenderAudit('all');
    }

    updateRenderConfig(prop, value) {
        this.renderConfig[prop] = value;
        if (this.renderResults.length > 0) this.renderRenderResults();
    }

    _setRenderStatus(text, color = '#888') {
        const el = document.getElementById('render-audit-status');
        if (el) {
            el.innerText = text;
            el.style.color = color;
        }
    }

    _extractVersion(str) {
        const match = str.match(/_?v(\d{2,4})/i);
        return match ? { str: 'v' + match[1], num: parseInt(match[1], 10) } : null;
    }

    async runRenderAudit(scope = 'all') {
        if (this.isRenderAuditing) return;
        this.isRenderAuditing = true;
        this.renderResults = [];

        const roots = this._getRoots();
        if (!roots.work || !roots.media) {
            this._setRenderStatus('❌ Raíces de Proyecto o Media no encontradas.', '#f44336');
            this.isRenderAuditing = false;
            return;
        }

        const isOnline = window.viewLocationMode === 'online';
        const modeLabel = this.renderAuditMode === 'scenes' ? 'archivos de proceso' : 'renders vs procesos';
        this._setRenderStatus(`🔍 Auditando ${modeLabel} ${isOnline ? 'Online (G:)' : 'Local (Z:)'}...`, '#4fc3f7');
        const listEl = document.getElementById('render-results-list');
        listEl.innerHTML = `<div style="padding:25px; text-align:center; color:#888;"><div class="spinner-small"></div> Analizando ${modeLabel} (${isOnline ? 'ONLINE' : 'LOCAL'})...</div>`;

        try {
            const presetCfg = await this._loadPresetConfig();

            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] 🎬 Iniciando auditoría de ${modeLabel.toUpperCase()} (${scope}) [Proceso: ${this.renderConfig.process}] en: ${roots.work}`, 'info');
            }

            let targetEpisodes = [];
            if (scope === 'selection' && selectedContextPath) {
                const normSel = selectedContextPath.replace(/\\/g, '/');
                const relWork = normSel.toLowerCase().startsWith(roots.work.toLowerCase())
                    ? normSel.substring(roots.work.length).replace(/^\/+/, '')
                    : '';
                const relMedia = normSel.toLowerCase().startsWith(roots.media.toLowerCase())
                    ? normSel.substring(roots.media.length).replace(/^\/+/, '')
                    : '';
                const rel = relWork || relMedia;
                const parts = rel.split('/').filter(Boolean);
                let epName = parts.find(p => p.toLowerCase() !== 'episodios' && p.toLowerCase() !== 'secuencias' && p.toLowerCase() !== 'shots');
                if (epName) targetEpisodes.push(epName);
            }

            const res = await fetch('/api/audit/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auditType: 'render',
                    roots,
                    scope,
                    targetEpisodes,
                    config: {
                        process: this.renderConfig.process,
                        processes: presetCfg.processes,
                        procExtMap: presetCfg.procExtMap,
                        allowedExtensions: presetCfg.allowedExtensions,
                        onlyFullRes: this.renderConfig.onlyFullRes,
                        includeMov: this.renderConfig.includeMov,
                        latestOnly: this.renderConfig.latestOnly,
                        omitV001: this.renderConfig.omitV001,
                        checkTclExt: this.renderConfig.checkTclExt
                    }
                })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Error al auditar renders');

            this.renderResults = data.results || [];
            this.isRenderAuditing = false;

            this._setRenderStatus(`✅ Auditoría finalizada: ${this.renderResults.length} plano(s) analizados.`, '#4CAF50');
            
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] 🎬 Auditoría de ${modeLabel.toUpperCase()} finalizada: ${this.renderResults.length} plano(s) analizados.`, 'ok');
            }

            this.renderRenderResults();

        } catch (e) {
            this.isRenderAuditing = false;
            console.error("Render status audit error:", e);
            this._setRenderStatus('❌ Error al auditar: ' + e.message, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] ❌ Error en auditoría de renders: ${e.message}`, 'error');
            }
        }
    }

    renderRenderResults() {
        const listEl = document.getElementById('render-results-list');
        const cfg = this.renderConfig;
        const mode = this.renderAuditMode; // 'scenes' | 'renders'

        // Apply filters
        let list = this.renderResults.filter(item => {
            if (mode === 'renders') {
                // In Renders mode, ONLY list shots that have a script OR have a render
                if (item.scriptCount === 0 && item.renders.length === 0) return false;

                // Omit v001 filter in renders mode
                if (cfg.omitV001 && item.latestScriptNum !== null && item.latestScriptNum <= 1) return false;
            }
            return true;
        });

        // Tab filter
        const filtered = this.activeRenderFilter === 'all'
            ? list
            : list.filter(r => {
                const currentStatus = (mode === 'scenes') ? r.sceneStatus : r.renderStatus;
                return currentStatus === this.activeRenderFilter;
            });

        // Update counts depending on mode
        if (mode === 'scenes') {
            const countAll = list.length;
            const countHas = list.filter(r => r.sceneStatus === 'has-scene').length;
            const countBad = list.filter(r => r.sceneStatus === 'bad-naming').length;
            const countNo = list.filter(r => r.sceneStatus === 'no-script').length;

            document.getElementById('scenes-count-all').innerText = countAll;
            document.getElementById('scenes-count-has').innerText = countHas;
            document.getElementById('scenes-count-bad').innerText = countBad;
            document.getElementById('scenes-count-no').innerText = countNo;
            document.getElementById('render-summary-badge').innerText = `${countAll} planos analizados (Modo Escenas)`;
        } else {
            const countAll = list.length;
            const countUptodate = list.filter(r => r.renderStatus === 'up-to-date').length;
            const countOutdated = list.filter(r => r.renderStatus === 'outdated').length;
            const countBadNaming = list.filter(r => r.renderStatus === 'bad-naming').length;
            const countMissing = list.filter(r => r.renderStatus === 'missing-render').length;
            const countOrphan = list.filter(r => r.renderStatus === 'orphan-render').length;

            document.getElementById('render-count-all').innerText = countAll;
            document.getElementById('render-count-uptodate').innerText = countUptodate;
            document.getElementById('render-count-outdated').innerText = countOutdated;
            const elBad = document.getElementById('render-count-badnaming');
            if (elBad) elBad.innerText = countBadNaming;
            document.getElementById('render-count-missing').innerText = countMissing;
            document.getElementById('render-count-orphan').innerText = countOrphan;
            document.getElementById('render-summary-badge').innerText = `${countAll} planos analizados (Modo Renders)`;
        }

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="padding:30px; text-align:center; color:#666;">
                    ${this.renderResults.length === 0 ? 'No se encontraron planos en las rutas seleccionadas.' : 'No hay planos en este filtro.'}
                </div>
            `;
            return;
        }

        listEl.innerHTML = filtered.map(item => {
            let statusBadge = '';
            let statusBorder = '#333';
            let detailText = '';

            if (mode === 'scenes') {
                if (item.sceneStatus === 'has-scene') {
                    statusBadge = '<span style="background:#81c784; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">CON ESCENA</span>';
                    statusBorder = '#81c784';
                    detailText = `<span style="color:#81c784;">✓ Archivo editable presente: <b>${item.latestScriptName}</b> (${item.scriptCount} versión/es).</span>`;
                } else if (item.sceneStatus === 'bad-naming') {
                    statusBadge = '<span style="background:#ff9800; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">NOMBRE INCORRECTO</span>';
                    statusBorder = '#ff9800';
                    const badExample = item.badScriptFiles[0] || 'archivo';
                    detailText = `<span style="color:#ff9800;">⚠️ Archivo presente pero <b>fuera de norma canónica</b> ([SHOT]_[PROCESO]_[VERSION]): <code>${badExample}</code></span>`;
                } else {
                    statusBadge = '<span style="background:#e57373; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">SIN ESCENA</span>';
                    statusBorder = '#e57373';
                    const extLabel = item.expectedExt || '.nk';
                    detailText = `<span style="color:#e57373;">❌ Carpeta <code>${item.process}</code> sin archivos ${extLabel}.</span>`;
                }
            } else {
                // Renders mode
                if (item.renderStatus === 'up-to-date') {
                    statusBadge = '<span style="background:#81c784; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">AL DÍA</span>';
                    statusBorder = '#81c784';
                    detailText = `<span style="color:#81c784;">✓ Script <b>${item.latestScriptVer}</b> coincide con el render en Media (${item.renders[0]?.folderName || 'FullRes'}).</span>`;
                } else if (item.renderStatus === 'outdated') {
                    statusBadge = '<span style="background:#ffd54f; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">DESACTUALIZADO</span>';
                    statusBorder = '#ffd54f';
                    const lastRndVer = item.renders[0]?.versionStr || 'desconocida';
                    detailText = `<span style="color:#ffd54f;">⚠️ Script en <b>${item.latestScriptVer}</b> pero el render más reciente en Media es <b>${lastRndVer}</b>.</span>`;
                } else if (item.renderStatus === 'bad-naming') {
                    statusBadge = '<span style="background:#ff9800; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">NOMBRE INCORRECTO</span>';
                    statusBorder = '#ff9800';
                    const badExample = item.badFiles && item.badFiles.length > 0 ? item.badFiles[0] : 'archivo sin patrón';
                    detailText = `<span style="color:#ff9800;">⚠️ Render presente pero <b>NO respeta el patrón canónico</b> del Shot Designer. Encontrado: <code>${badExample}</code></span>`;
                } else if (item.renderStatus === 'orphan-render') {
                    statusBadge = '<span style="background:#ba68c8; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">RENDER SIN ESCENA</span>';
                    statusBorder = '#ba68c8';
                    const lastRndVer = item.renders[0]?.versionStr || 'v???';
                    const scriptDetail = item.latestScriptVer ? `(el script solo llega a <b>${item.latestScriptVer}</b>)` : `(no existe script ${item.expectedExt || '.nk'})`;
                    detailText = `<span style="color:#ba68c8;">🟣 Existe render en Media (<b>${lastRndVer}</b>) pero falta la escena correspondiente en Proyecto ${scriptDetail}.</span>`;
                } else if (item.renderStatus === 'missing-render') {
                    statusBadge = '<span style="background:#e57373; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">SIN RENDER</span>';
                    statusBorder = '#e57373';
                    detailText = `<span style="color:#e57373;">❌ Existe script <b>${item.latestScriptVer}</b> pero no hay ningún render en Media.</span>`;
                }
            }

            return `
                <div style="display:flex; align-items:flex-start; gap:8px; padding:6px 8px; margin-bottom:4px; background:#181818; border-left:3px solid ${statusBorder}; border-radius:3px; font-size:0.75rem;">
                    <div style="flex:1; overflow:hidden;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                            <span style="font-weight:bold; color:#fff; font-family:monospace; font-size:0.85rem;">🎬 ${item.shot} <span style="font-size:0.7rem; color:#aaa; font-weight:normal;">(${item.process})</span></span>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <span style="color:#888; font-size:0.7rem;">${item.ep} / ${item.seq}</span>
                                ${statusBadge}
                            </div>
                        </div>
                        <div style="font-size:0.7rem; margin-top:2px;">
                            ${detailText}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    setRenderFilter(filter, btn) {
        this.activeRenderFilter = filter;
        const currentTabsId = (this.renderAuditMode === 'scenes') ? '#render-tabs-scenes' : '#render-tabs-renders';
        this.container.querySelectorAll(`${currentTabsId} .sync-filter-tab`).forEach(t => t.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.renderRenderResults();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new FileAuditor();
});
