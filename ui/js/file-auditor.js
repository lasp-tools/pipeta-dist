// ============================================================
// FILE AUDITOR — Unified Folder Status & Render/Scene Auditor
// ============================================================

class FileAuditor {
    constructor() {
        this.isVisible = false;
        this.isMaximized = false;
        this.prevBounds = null;
        this.activeTab = 'mirror'; // 'mirror' (Folder Status) | 'scenes' | 'renders'

        // Common Filters & Features
        const savedMyTasks = localStorage.getItem('pipeta_fa_only_my_tasks');
        this.onlyMyTasks = savedMyTasks !== null ? savedMyTasks === 'true' : false;
        const savedDeep = localStorage.getItem('pipeta_fa_deep_compare');
        this.deepCompare = savedDeep !== null ? savedDeep === 'true' : false;
        const savedDrive = localStorage.getItem('pipeta_fa_compare_drive');
        this.compareDrive = savedDrive !== null ? savedDrive === 'true' : false;

        // Folder Status State (formerly Mirror Integrity)
        this.mirrorResults = [];
        this.isMirrorAuditing = false;
        this.activeMirrorFilter = 'all';
        const savedOmit = localStorage.getItem('pipeta_mirror_audit_omit_control');
        this.omitControlFiles = savedOmit !== null ? savedOmit === 'true' : true;

        // Scene Status State
        this.sceneResults = [];
        this.isSceneAuditing = false;
        this.activeSceneFilter = 'all';

        // Render Status State
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

    _renderCommonFilterButtons(idPrefix = '') {
        const ramonActive = this.onlyMyTasks;
        const driveActive = this.compareDrive;
        return `
            <button class="fa-icon-toggle fa-ramon-toggle ${ramonActive ? 'active' : ''}" 
                    id="${idPrefix}fa-btn-ramon" 
                    onclick="fileAuditor.toggleOnlyMyTasks()" 
                    title="Solo mis tareas (Ramón)" 
                    style="width:26px; height:24px; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:3px; cursor:pointer; background:${ramonActive ? 'rgba(255, 183, 77, 0.2)' : '#222'}; border:1px solid ${ramonActive ? '#ffb74d' : '#444'};">
                <img src="icons/ramon.png" style="width:14px; height:14px; object-fit:contain; opacity:${ramonActive ? '1' : '0.45'}; filter:${ramonActive ? 'none' : 'grayscale(100%)'};">
            </button>
            <button class="fa-icon-toggle fa-drive-toggle ${driveActive ? 'active' : ''}" 
                    id="${idPrefix}fa-btn-drive" 
                    onclick="fileAuditor.toggleCompareDrive()" 
                    title="Comparar contra Google Drive" 
                    style="width:26px; height:24px; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:3px; cursor:pointer; background:${driveActive ? 'rgba(66, 133, 244, 0.2)' : '#222'}; border:1px solid ${driveActive ? '#4285F4' : '#444'};">
                <img src="icons/google_drive.svg" style="width:14px; height:14px; object-fit:contain; opacity:${driveActive ? '1' : '0.45'}; filter:${driveActive ? 'none' : 'grayscale(100%)'};">
            </button>
        `;
    }

    _renderDeepCompareButton(idPrefix = '') {
        const deepActive = this.deepCompare;
        return `
            <button class="fa-icon-toggle fa-deep-toggle ${deepActive ? 'active' : ''}" 
                    id="${idPrefix}fa-btn-deep" 
                    onclick="fileAuditor.toggleDeepCompare()" 
                    title="Deep Compare (inspeccionar gaps y frames de 0 bytes)" 
                    style="height:24px; padding:0 6px; display:inline-flex; align-items:center; gap:3px; border-radius:3px; cursor:pointer; font-size:0.7rem; font-weight:bold; background:${deepActive ? 'rgba(179, 157, 219, 0.25)' : '#222'}; border:1px solid ${deepActive ? '#b39ddb' : '#444'}; color:${deepActive ? '#d1c4e9' : '#888'};">
                <span>🔬 Deep</span>
            </button>
        `;
    }

    renderUI() {
        if (document.getElementById('file-auditor-window')) return;

        this.container = document.createElement('div');
        this.container.id = 'file-auditor-window';
        this.container.className = 'validator-window';
        this.container.style.display = 'none';

        // Initial Dimensions
        this.container.style.width = '840px';
        this.container.style.height = '700px';
        this.container.style.minWidth = '540px';
        this.container.style.minHeight = '420px';
        this.container.style.resize = 'both';
        this.container.style.overflow = 'hidden';
        this.container.style.top = '50px';
        this.container.style.left = '140px';

        this.container.innerHTML = `
            <div class="validator-header" id="file-auditor-header" onmousedown="window.fileAuditor.startDrag(event)" ondblclick="window.fileAuditor.toggleMaximize()">
                <div class="validator-title" style="display:flex; align-items:center; gap:10px;">
                    <span class="validator-icon" style="font-size:1.2rem;">📊</span>
                    <b style="font-weight:bold;">File Auditor</b>
                </div>
                <div class="validator-controls">
                    <button class="icon-btn-mini" onclick="window.fileAuditor.minimize(this)" title="Minimizar">-</button>
                    <button id="file-auditor-max-btn" onclick="window.fileAuditor.toggleMaximize()" title="Maximizar a Canvas Completo" style="background:transparent; border:none; color:#aaa; cursor:pointer; font-size:1.05rem; width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; padding:0; border-radius:4px; line-height:1;" onmouseover="this.style.color='#fff'; this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='#aaa'; this.style.background='transparent'">🗖</button>
                    <button class="icon-btn-mini" style="color:#f44336;" onclick="window.fileAuditor.close()" title="Cerrar">✕</button>
                </div>
            </div>

            <!-- TOP NAV TABS (3 MAIN TABS) -->
            <div style="display:flex; background:#141414; border-bottom:1px solid #333; flex-shrink:0;">
                <button id="fa-tab-btn-mirror" class="sync-filter-tab active" style="flex:1; padding:8px; font-weight:bold; font-size:0.8rem;" onclick="fileAuditor.switchTab('mirror')">
                    📁 Folder Status
                </button>
                <button id="fa-tab-btn-scenes" class="sync-filter-tab" style="flex:1; padding:8px; font-weight:bold; font-size:0.8rem;" onclick="fileAuditor.switchTab('scenes')">
                    📄 Scene Status
                </button>
                <button id="fa-tab-btn-renders" class="sync-filter-tab" style="flex:1; padding:8px; font-weight:bold; font-size:0.8rem;" onclick="fileAuditor.switchTab('renders')">
                    🎬 Render Status
                </button>
            </div>

            <div class="validator-body" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                
                <!-- ================= TAB 1: FOLDER STATUS ================= -->
                <div id="fa-panel-mirror" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                    <!-- INFO & CONTROLS -->
                    <div style="padding:8px; background:#1a1a1a; border-bottom:1px solid #333; flex-shrink:0;">
                        <div style="font-size:0.75rem; color:#888; margin-bottom:6px;">
                            Verifica que cada plano/asset en <b style="color:#4fc3f7;">Proyecto</b> tenga su estructura de carpetas en <b style="color:#81c784;">Media</b> (y viceversa).
                        </div>
                        <div style="display:flex; gap:6px; margin-bottom:6px;">
                            <button class="action-btn-small" style="flex:1;" onclick="fileAuditor.runMirrorAudit('all')">Scan All</button>
                            <button class="action-btn-small" style="flex:1;" onclick="fileAuditor.runMirrorAudit('selection')">Scan Selection</button>
                        </div>
                        <div style="display:flex; gap:6px; align-items:center;">
                            ${this._renderCommonFilterButtons('mirror-')}
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
                        <div id="mirror-audit-status" style="font-size:0.7rem; color:#888;">Listo para auditar carpetas</div>
                        <label style="font-size:0.7rem; color:#888; cursor:pointer; display:flex; align-items:center; gap:4px; user-select:none;">
                            <input type="checkbox" id="mirror-select-all" onchange="fileAuditor.toggleMirrorSelectAll(this.checked)"> Seleccionar todo
                        </label>
                    </div>

                    <!-- RESULTS LIST -->
                    <div class="val-results" id="mirror-results-list" style="flex:1; overflow-y:auto; background:#111; padding:6px; border:1px solid #333;">
                        <div class="empty-state" style="padding:40px; text-align:center; color:#555;">
                            <div style="font-size:2.2rem; margin-bottom:10px;">📁</div>
                            Haz clic en <b>Scan All</b> o <b>Scan Selection</b> para verificar las carpetas.
                        </div>
                    </div>

                    <!-- FOOTER (SINGLE FIX BUTTON WITH PROJECT & MEDIA CHECKBOXES) -->
                    <div style="padding:8px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; border-top:1px solid #333; background:#161616;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span id="mirror-selected-summary" style="font-size:0.75rem; color:#aaa;">0 elementos seleccionados</span>
                            <span id="mirror-total-diffs" style="font-size:0.75rem; color:#888;">0 discrepancias</span>
                        </div>
                        <div style="display:flex; gap:12px; align-items:center;">
                            <div style="display:flex; gap:12px; align-items:center; background:#1e1e1e; padding:4px 10px; border-radius:4px; border:1px solid #333;">
                                <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:5px; user-select:none;">
                                    <input type="checkbox" id="mirror-fix-opt-proj" checked onchange="fileAuditor._updateMirrorButtons()">
                                    <span>Proyecto</span>
                                </label>
                                <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:5px; user-select:none;">
                                    <input type="checkbox" id="mirror-fix-opt-media" checked onchange="fileAuditor._updateMirrorButtons()">
                                    <span>Media</span>
                                </label>
                            </div>
                            <button id="mirror-btn-fix" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="fileAuditor.repairMirrorFix()">
                                Fix
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ================= TAB 2: SCENE STATUS ================= -->
                <div id="fa-panel-scenes" style="display:none; flex-direction:column; height:100%; overflow:hidden;">
                    <!-- CONTROLS & OPTIONS -->
                    <div style="padding:8px; background:#181818; border-bottom:1px solid #333; flex-shrink:0;">
                        <div style="display:flex; gap:6px; margin-bottom:6px;">
                            <button class="action-btn-small" style="flex:1;" onclick="fileAuditor.runSceneAudit('all')">Scan All</button>
                            <button class="action-btn-small" style="flex:1;" onclick="fileAuditor.runSceneAudit('selection')">Scan Selection</button>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
                            <div style="display:flex; gap:6px; align-items:center;">
                                ${this._renderCommonFilterButtons('scenes-')}
                            </div>
                            <div style="display:flex; align-items:center; gap:4px; background:#222; padding:3px 6px; border-radius:3px; border:1px solid #444;">
                                <span style="font-size:0.7rem; color:#aaa;">Proceso:</span>
                                <select id="scenes-audit-process" onchange="fileAuditor.setRenderProcess(this.value)" style="background:#111; color:#4fc3f7; border:1px solid #555; border-radius:3px; font-size:0.75rem; padding:2px 4px;">
                                    <option value="compo" selected>compo</option>
                                    <option value="all">Todos los procesos</option>
                                </select>
                            </div>
                            <span style="font-size:0.72rem; color:#888;">🔍 Revisa archivos editables (.nk, .hip, .blend)</span>
                        </div>
                    </div>

                    <!-- FILTER TABS -->
                    <div id="scenes-tabs" style="display:flex; border-bottom:1px solid #333; flex-shrink:0; background:#181818;">
                        <button class="sync-filter-tab active" data-filter="all" onclick="fileAuditor.setSceneFilter('all', this)">
                            Todos <span id="scenes-count-all" class="sync-badge">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="has-scene" onclick="fileAuditor.setSceneFilter('has-scene', this)">
                            🟢 Con Escena <span id="scenes-count-has" class="sync-badge" style="background:#81c784; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="bad-naming" onclick="fileAuditor.setSceneFilter('bad-naming', this)">
                            🟠 Nombre Incorrecto <span id="scenes-count-bad" class="sync-badge" style="background:#ff9800; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="no-script" onclick="fileAuditor.setSceneFilter('no-script', this)">
                            🔴 Sin Escena Local <span id="scenes-count-no" class="sync-badge" style="background:#e57373; color:#000;">0</span>
                        </button>
                    </div>

                    <!-- STATUS BAR -->
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; flex-shrink:0; border-bottom:1px solid #222; background:#121212;">
                        <div id="scenes-audit-status" style="font-size:0.7rem; color:#888;">Listo para auditar escenas</div>
                        <label style="font-size:0.7rem; color:#888; cursor:pointer; display:flex; align-items:center; gap:4px; user-select:none;">
                            <input type="checkbox" id="scenes-select-all" onchange="fileAuditor.toggleSceneSelectAll(this.checked)"> Seleccionar todo
                        </label>
                    </div>

                    <!-- RESULTS LIST -->
                    <div class="val-results" id="scenes-results-list" style="flex:1; overflow-y:auto; background:#111; padding:6px; border:1px solid #333;">
                        <div class="empty-state" style="padding:40px; text-align:center; color:#555;">
                            <div style="font-size:2.2rem; margin-bottom:10px;">📄</div>
                            Haz clic en <b>Scan All</b> o <b>Scan Selection</b> para verificar escenas (.nk, .hip, .blend).
                        </div>
                    </div>

                    <!-- FOOTER (FIX BUTTON FOR DOWNLOAD/UPLOAD SCENES) -->
                    <div style="padding:8px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; border-top:1px solid #333; background:#161616;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span id="scenes-selected-summary" style="font-size:0.75rem; color:#aaa;">0 elementos seleccionados</span>
                            <span style="font-size:0.72rem; color:#888;">Sincronización directa de escenas con Google Drive</span>
                        </div>
                        <div style="display:flex; gap:12px; align-items:center;">
                            <div style="display:flex; gap:12px; align-items:center; background:#1e1e1e; padding:4px 10px; border-radius:4px; border:1px solid #333;">
                                <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:5px; user-select:none;">
                                    <input type="checkbox" id="scenes-fix-opt-download" checked onchange="fileAuditor._updateSceneButtons()">
                                    <span>Download scenes</span>
                                </label>
                                <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:5px; user-select:none;">
                                    <input type="checkbox" id="scenes-fix-opt-upload" onchange="fileAuditor._updateSceneButtons()">
                                    <span>Upload scenes</span>
                                </label>
                            </div>
                            <button id="scenes-btn-fix" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="fileAuditor.repairScenesFix()">
                                Fix
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ================= TAB 3: RENDER STATUS ================= -->
                <div id="fa-panel-renders" style="display:none; flex-direction:column; height:100%; overflow:hidden;">
                    <!-- CONTROLS & OPTIONS -->
                    <div style="padding:8px; background:#181818; border-bottom:1px solid #333; flex-shrink:0;">
                        <div style="display:flex; gap:6px; margin-bottom:6px;">
                            <button class="action-btn-small" style="flex:1;" onclick="fileAuditor.runRenderAudit('all')">Scan All</button>
                            <button class="action-btn-small" style="flex:1;" onclick="fileAuditor.runRenderAudit('selection')">Scan Selection</button>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
                                <div style="display:flex; gap:6px; align-items:center;">
                                    ${this._renderCommonFilterButtons('render-')}
                                    ${this._renderDeepCompareButton('render-')}
                                </div>
                                <div style="display:flex; align-items:center; gap:4px; background:#222; padding:3px 6px; border-radius:3px; border:1px solid #444;">
                                    <span style="font-size:0.7rem; color:#aaa;">Proceso:</span>
                                    <select id="render-audit-process" onchange="fileAuditor.setRenderProcess(this.value)" style="background:#111; color:#4fc3f7; border:1px solid #555; border-radius:3px; font-size:0.75rem; padding:2px 4px;">
                                        <option value="compo" selected>compo</option>
                                        <option value="all">Todos los procesos</option>
                                    </select>
                                </div>
                            </div>
                            <div style="display:flex; flex-wrap:wrap; gap:12px; font-size:0.72rem; color:#ccc; background:#141414; padding:6px 8px; border-radius:4px; border:1px solid #282828;">
                                <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                    <input type="checkbox" id="render-opt-fullres" checked onchange="fileAuditor.updateRenderConfig('onlyFullRes', this.checked)">
                                    <span>FullRes</span>
                                </label>
                                <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                    <input type="checkbox" id="render-opt-mov" onchange="fileAuditor.updateRenderConfig('includeMov', this.checked)">
                                    <span>.mov (compresion)</span>
                                </label>
                                <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                    <input type="checkbox" id="render-opt-latest" checked onchange="fileAuditor.updateRenderConfig('latestOnly', this.checked)">
                                    <span>Solo última versión</span>
                                </label>
                                <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                    <input type="checkbox" id="render-opt-omit-v001" onchange="fileAuditor.updateRenderConfig('omitV001', this.checked)">
                                    <span>Omitir v001 y v000</span>
                                </label>
                                <label style="cursor:pointer; display:flex; align-items:center; gap:4px;">
                                    <input type="checkbox" id="render-opt-tclextern" onchange="fileAuditor.updateRenderConfig('checkTclExt', this.checked)">
                                    <span>Prerender</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- FILTER TABS -->
                    <div id="render-tabs" style="display:flex; border-bottom:1px solid #333; flex-shrink:0; background:#181818; overflow-x:auto;">
                        <button class="sync-filter-tab active" data-filter="all" onclick="fileAuditor.setRenderFilter('all', this)">
                            Todos <span id="render-count-all" class="sync-badge">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="up-to-date" onclick="fileAuditor.setRenderFilter('up-to-date', this)">
                            🟢 Al Día <span id="render-count-uptodate" class="sync-badge" style="background:#81c784; color:#000;">0</span>
                        </button>
                        <button class="sync-filter-tab" data-filter="sequence-issue" onclick="fileAuditor.setRenderFilter('sequence-issue', this)">
                            ⚠️ Gaps / Incompleto <span id="render-count-seqissue" class="sync-badge" style="background:#e57373; color:#000;">0</span>
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
                        <button class="sync-filter-tab" data-filter="drive-diff" onclick="fileAuditor.setRenderFilter('drive-diff', this)">
                            ☁️ Drive Diff <span id="render-count-drivediff" class="sync-badge" style="background:#0288D1; color:#fff;">0</span>
                        </button>
                    </div>

                    <!-- STATUS BAR -->
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; flex-shrink:0; border-bottom:1px solid #222; background:#121212;">
                        <div id="render-audit-status" style="font-size:0.7rem; color:#888;">Listo para auditar renders</div>
                        <div style="display:flex; gap:12px; align-items:center;">
                            <label style="font-size:0.7rem; color:#888; cursor:pointer; display:flex; align-items:center; gap:4px; user-select:none;">
                                <input type="checkbox" id="render-select-all" onchange="fileAuditor.toggleRenderSelectAll(this.checked)"> Seleccionar todo
                            </label>
                            <span id="render-summary-badge" style="font-size:0.7rem; color:#aaa;">0 planos analizados</span>
                        </div>
                    </div>

                    <!-- RESULTS LIST -->
                    <div class="val-results" id="render-results-list" style="flex:1; overflow-y:auto; background:#111; padding:6px; border:1px solid #333;">
                        <div class="empty-state" style="padding:40px; text-align:center; color:#555;">
                            <div style="font-size:2.2rem; margin-bottom:10px;">🎬</div>
                            Haz clic en <b>Scan All</b> o <b>Scan Selection</b> para comenzar.
                        </div>
                    </div>

                    <!-- FOOTER (FIX TOOLBAR WITH DOWNLOAD, UPLOAD, FIX GAP & FULL SYNC) -->
                    <div style="padding:8px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; border-top:1px solid #333; background:#161616;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span id="render-selected-summary" style="font-size:0.75rem; color:#aaa;">0 elementos seleccionados</span>
                            <span style="font-size:0.72rem; color:#888;">Sincronización inteligente de renders (Google Drive / Server)</span>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                            <div style="display:flex; gap:10px; align-items:center; background:#1e1e1e; padding:4px 10px; border-radius:4px; border:1px solid #333;">
                                <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:5px; user-select:none;">
                                    <input type="checkbox" id="render-fix-opt-download" checked onchange="fileAuditor._updateRenderButtons()">
                                    <span>Download</span>
                                </label>
                                <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:5px; user-select:none;">
                                    <input type="checkbox" id="render-fix-opt-upload" onchange="fileAuditor._updateRenderButtons()">
                                    <span>Upload</span>
                                </label>
                            </div>

                            <div style="display:flex; gap:10px; align-items:center; background:#1e1e1e; padding:4px 10px; border-radius:4px; border:1px solid #333;">
                                <label style="font-size:0.75rem; color:#ffd54f; cursor:pointer; display:inline-flex; align-items:center; gap:5px; user-select:none;" title="Solo transfiere frames faltantes o dañados (0KB)">
                                    <input type="radio" name="render-fix-mode" id="render-fix-mode-gap" value="gap" checked onchange="fileAuditor._updateRenderButtons()">
                                    <span>Fix GAP</span>
                                </label>
                                <label style="font-size:0.75rem; color:#81c784; cursor:pointer; display:inline-flex; align-items:center; gap:5px; user-select:none;" title="Sincroniza la secuencia completa pisando la versión en destino">
                                    <input type="radio" name="render-fix-mode" id="render-fix-mode-full" value="full" onchange="fileAuditor._updateRenderButtons()">
                                    <span>Full Sync</span>
                                </label>
                            </div>

                            <button id="render-btn-fix" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="fileAuditor.repairRendersFix()">
                                Fix
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        `;

        document.body.appendChild(this.container);
        this._populateProcessSelect();
    }

    // --- TAB SWITCHING (3 TABS) ---
    switchTab(tab) {
        this.activeTab = tab; // 'mirror' | 'scenes' | 'renders'
        const btnMirror = document.getElementById('fa-tab-btn-mirror');
        const btnScenes = document.getElementById('fa-tab-btn-scenes');
        const btnRenders = document.getElementById('fa-tab-btn-renders');
        const panMirror = document.getElementById('fa-panel-mirror');
        const panScenes = document.getElementById('fa-panel-scenes');
        const panRenders = document.getElementById('fa-panel-renders');

        if (btnMirror) btnMirror.classList.toggle('active', tab === 'mirror');
        if (btnScenes) btnScenes.classList.toggle('active', tab === 'scenes');
        if (btnRenders) btnRenders.classList.toggle('active', tab === 'renders');

        if (panMirror) panMirror.style.display = tab === 'mirror' ? 'flex' : 'none';
        if (panScenes) panScenes.style.display = tab === 'scenes' ? 'flex' : 'none';
        if (panRenders) panRenders.style.display = tab === 'renders' ? 'flex' : 'none';

        if (tab === 'scenes' || tab === 'renders') {
            this._populateProcessSelect();
        }
    }

    // --- WINDOW & MAXIMIZE CONTROL ---
    toggleMaximize() {
        this.isMaximized = !this.isMaximized;
        this.applyMaximizedState();
    }

    applyMaximizedState() {
        if (!this.container) return;
        const maxBtn = document.getElementById('file-auditor-max-btn');
        if (this.isMaximized) {
            if (!this.container.classList.contains('maximized')) {
                this.prevBounds = {
                    width: this.container.style.width || '840px',
                    height: this.container.style.height || '700px',
                    top: this.container.style.top || '50px',
                    left: this.container.style.left || '140px'
                };
            }
            this.container.classList.add('maximized');
            if (maxBtn) {
                maxBtn.innerHTML = '🗗';
                maxBtn.title = 'Restaurar a Ventana Flotante';
            }
        } else {
            this.container.classList.remove('maximized');
            if (this.prevBounds) {
                this.container.style.width = this.prevBounds.width;
                this.container.style.height = this.prevBounds.height;
                this.container.style.top = this.prevBounds.top;
                this.container.style.left = this.prevBounds.left;
            }
            if (maxBtn) {
                maxBtn.innerHTML = '🗖';
                maxBtn.title = 'Maximizar a Canvas Completo';
            }
        }
        this.updateSidebarButtonsState();
    }

    updateSidebarButtonsState() {
        const btnAuditor = document.getElementById('btnFileAuditorTool');
        const modeButtons = document.querySelectorAll('.mode-sidebar .mode-btn');

        if (this.isVisible && this.isMaximized) {
            if (btnAuditor) btnAuditor.classList.add('active');
            modeButtons.forEach(b => {
                if (b !== btnAuditor && b.id !== 'btn-settings-toggle' && b.id !== 'btn-console-toggle') {
                    b.classList.remove('active');
                }
            });
        } else if (this.isVisible) {
            if (btnAuditor) btnAuditor.classList.add('active');
        } else {
            if (btnAuditor) btnAuditor.classList.remove('active');
            if (typeof tabs !== 'undefined') {
                const currentTabName = Object.keys(tabs).find(k => {
                    const el = document.getElementById(tabs[k]);
                    return el && el.style.display !== 'none';
                });
                if (currentTabName) {
                    const activeBtn = document.querySelector(`.mode-sidebar .mode-btn[title="${currentTabName}"]`);
                    if (activeBtn) activeBtn.classList.add('active');
                }
            }
        }
    }

    close() {
        this.isVisible = false;
        this.container.style.display = 'none';
        this.updateSidebarButtonsState();
    }

    toggle() {
        this.isVisible = !this.isVisible;
        this.container.style.display = this.isVisible ? 'flex' : 'none';
        if (this.isVisible) {
            if (this.isMaximized) {
                this.applyMaximizedState();
            }
            this._populateProcessSelect();
            this._updateCommonFilterButtons();
        }
        this.updateSidebarButtonsState();
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
        if (this.isMaximized || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
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

    async _populateProcessSelect() {
        const scenesAndRenderSelects = [
            document.getElementById('scenes-audit-process'),
            document.getElementById('render-audit-process')
        ].filter(Boolean);

        try {
            const presetCfg = await this._loadPresetConfig();
            if (presetCfg && presetCfg.processes && presetCfg.processes.length > 0) {
                for (const sel of scenesAndRenderSelects) {
                    const currentVal = sel.value || this.renderConfig.process || 'compo';
                    let html = '';
                    for (const p of presetCfg.processes) {
                        html += `<option value="${p}" ${p === currentVal ? 'selected' : ''}>${p}</option>`;
                    }
                    html += `<option value="all" ${currentVal === 'all' ? 'selected' : ''}>Todos los procesos</option>`;
                    sel.innerHTML = html;
                }
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
                    procExtMap: { 'compo': '.nk' },
                    allowedExtensions: ['.nk', '.hip', '.blend', '.ma', '.mb', '.aep', '.prproj', '.c4d']
                };
            }

            const nodes = preset.nodes;
            const processNodes = nodes.filter(n => n.isProcess);
            const procNames = processNodes.map(n => n.name).filter(Boolean);
            const procExtMap = {};
            const extSet = new Set(['.nk', '.hip', '.blend', '.ma', '.mb', '.aep', '.prproj', '.c4d']);

            for (const pn of processNodes) {
                const pExts = [];
                if (pn.filePatterns && Array.isArray(pn.filePatterns)) {
                    for (const fp of pn.filePatterns) {
                        const m = fp.match(/\.[a-zA-Z0-9]+$/);
                        if (m) {
                            const ext = m[0].toLowerCase();
                            pExts.push(ext);
                            extSet.add(ext);
                        }
                    }
                }
                procExtMap[pn.name] = pExts.length > 0 ? pExts[0] : (pn.name.toLowerCase().includes('nuke') || pn.name.toLowerCase().includes('compo') ? '.nk' : '.nk');
            }

            // Sane filter: do NOT treat files, sample render placeholders, or arbitrary depth as required shot folders
            function isValidFolder(name) {
                if (!name || typeof name !== 'string') return false;
                const n = name.trim();
                if (n.includes('.') || n.includes(' ') || n.includes('(')) return false;
                const lower = n.toLowerCase();
                if (lower.includes('render') || lower.includes('prerender') || lower.includes('ress') || lower.includes('export') || lower.includes('mov') || lower.includes('version')) return false;
                return /^[a-zA-Z0-9_\-]+$/.test(n);
            }

            const workShotNode = nodes.find(n => n.isShot && n.y < 0) || nodes.find(n => n.name && n.name.toLowerCase().includes('shot') && n.y < 0);
            const mediaShotNode = nodes.find(n => n.isShot && n.y >= 0) || nodes.find(n => n.name && n.name.toLowerCase().includes('shot') && n.y >= 0);

            function getDescendants(parentId, currentPath = '', depth = 0) {
                if (depth > 2) return [];
                let paths = [];
                const children = nodes.filter(n => n.parent === parentId);
                for (const ch of children) {
                    if (ch.isFile || ch.isPattern || !isValidFolder(ch.name)) continue;
                    const subPath = currentPath ? `${currentPath}/${ch.name}` : ch.name;
                    paths.push(subPath);
                    paths = paths.concat(getDescendants(ch.id, subPath, depth + 1));
                }
                return paths;
            }

            let workSub = workShotNode ? getDescendants(workShotNode.id) : defaultWork;
            let mediaSub = mediaShotNode ? getDescendants(mediaShotNode.id) : defaultMedia;

            mediaSub = Array.from(new Set([...defaultMedia, ...mediaSub]));
            workSub = Array.from(new Set([...defaultWork, ...workSub]));

            return {
                mediaSubfolders: mediaSub,
                workSubfolders: workSub,
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
    // COMMON FILTER TOGGLES & HELPERS
    // ============================================================

    toggleOnlyMyTasks(checked) {
        this.onlyMyTasks = typeof checked === 'boolean' ? checked : !this.onlyMyTasks;
        localStorage.setItem('pipeta_fa_only_my_tasks', this.onlyMyTasks ? 'true' : 'false');
        this._updateCommonFilterButtons();

        if (this.mirrorResults.length > 0) this.renderMirrorResults();
        if (this.sceneResults.length > 0) this.renderSceneResults();
        if (this.renderResults.length > 0) this.renderRenderResults();
    }

    toggleDeepCompare(checked) {
        this.deepCompare = typeof checked === 'boolean' ? checked : !this.deepCompare;
        localStorage.setItem('pipeta_fa_deep_compare', this.deepCompare ? 'true' : 'false');
        this._updateCommonFilterButtons();
        if (this.renderResults.length > 0) this.renderRenderResults();
    }

    toggleCompareDrive(checked) {
        this.compareDrive = typeof checked === 'boolean' ? checked : !this.compareDrive;
        localStorage.setItem('pipeta_fa_compare_drive', this.compareDrive ? 'true' : 'false');
        this._updateCommonFilterButtons();
        if (this.mirrorResults.length > 0) this.renderMirrorResults();
        if (this.sceneResults.length > 0) this.renderSceneResults();
        if (this.renderResults.length > 0) this.renderRenderResults();
    }

    _updateCommonFilterButtons() {
        document.querySelectorAll('.fa-ramon-toggle').forEach(btn => {
            btn.classList.toggle('active', this.onlyMyTasks);
            btn.style.background = this.onlyMyTasks ? 'rgba(255, 183, 77, 0.2)' : '#222';
            btn.style.borderColor = this.onlyMyTasks ? '#ffb74d' : '#444';
            const img = btn.querySelector('img');
            if (img) {
                img.style.opacity = this.onlyMyTasks ? '1' : '0.45';
                img.style.filter = this.onlyMyTasks ? 'none' : 'grayscale(100%)';
            }
        });

        document.querySelectorAll('.fa-drive-toggle').forEach(btn => {
            btn.classList.toggle('active', this.compareDrive);
            btn.style.background = this.compareDrive ? 'rgba(66, 133, 244, 0.2)' : '#222';
            btn.style.borderColor = this.compareDrive ? '#4285F4' : '#444';
            const img = btn.querySelector('img');
            if (img) {
                img.style.opacity = this.compareDrive ? '1' : '0.45';
                img.style.filter = this.compareDrive ? 'none' : 'grayscale(100%)';
            }
        });

        document.querySelectorAll('.fa-deep-toggle').forEach(btn => {
            btn.classList.toggle('active', this.deepCompare);
            btn.style.background = this.deepCompare ? 'rgba(179, 157, 219, 0.25)' : '#222';
            btn.style.borderColor = this.deepCompare ? '#b39ddb' : '#444';
            btn.style.color = this.deepCompare ? '#d1c4e9' : '#888';
        });
    }

    _isItemAssigned(item, assignedSet) {
        if (!assignedSet || assignedSet.size === 0) return true;
        const shot = (item.shot || item.shotName || item.shotId || '').toLowerCase().trim();
        if (assignedSet.has(shot)) return true;
        for (const code of assignedSet) {
            if (code && (shot.includes(code) || code.includes(shot))) return true;
        }
        return false;
    }

    toggleOmitControl(checked) {
        this.omitControlFiles = checked;
        localStorage.setItem('pipeta_mirror_audit_omit_control', checked ? 'true' : 'false');
    }

    // ============================================================
    // TAB 1: FOLDER STATUS LOGIC
    // ============================================================

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
        const currentProj = (typeof settings !== 'undefined' && settings.currentProject) ? settings.currentProject.name : null;
        this._setMirrorStatus(`🔍 Escaneando carpetas ${isOnline ? 'Online (G:)' : 'Local (Z:)'}...`, '#4fc3f7');
        const listEl = document.getElementById('mirror-results-list');
        if (listEl) {
            listEl.innerHTML = `<div style="padding:25px; text-align:center; color:#888;"><div class="spinner-small"></div> Analizando árbol cruzado Proyecto ↔ Media (${isOnline ? 'ONLINE' : 'LOCAL'})...</div>`;
        }

        try {
            const presetCfg = await this._loadPresetConfig();

            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] 📁 Iniciando auditoría de Carpetas (${scope}) en Proyecto: ${roots.work} ↔ Media: ${roots.media}`, 'info');
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
                    projectName: currentProj,
                    config: {
                        expectedMedia: presetCfg.mediaSubfolders,
                        expectedWork: presetCfg.workSubfolders,
                        omitControl: this.omitControlFiles,
                        deepCompare: this.deepCompare,
                        compareDrive: this.compareDrive
                    }
                })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Error al escanear carpetas');

            this.mirrorResults = data.results || [];
            this.isMirrorAuditing = false;

            const diffsCount = this.mirrorResults.filter(r => r.status !== 'ok').length;
            this._setMirrorStatus(`✅ Auditoría finalizada: ${this.mirrorResults.length} planos analizados (${diffsCount} discrepancias).`, diffsCount > 0 ? '#FF9800' : '#4CAF50');
            
            if (typeof PipetaConsole !== 'undefined') {
                const level = diffsCount > 0 ? 'warn' : 'ok';
                PipetaConsole.log('audit', `[FILE AUDITOR] 📁 Auditoría de Carpetas finalizada: ${this.mirrorResults.length} planos analizados (${diffsCount} discrepancias encontradas).`, level);
            }

            this.renderMirrorResults();

        } catch (err) {
            this.isMirrorAuditing = false;
            console.error("Mirror audit error:", err);
            this._setMirrorStatus('❌ Error durante la auditoría: ' + err.message, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] ❌ Error en auditoría de carpetas: ${err.message}`, 'error');
            }
        }
    }

    renderMirrorResults() {
        const listEl = document.getElementById('mirror-results-list');
        if (!listEl) return;
        
        // Filter by Ramon My Tasks if enabled
        const assignedSet = (this.onlyMyTasks && typeof window.getExplorerAssignedTaskNames === 'function')
            ? window.getExplorerAssignedTaskNames()
            : null;

        let list = this.mirrorResults;
        if (assignedSet && assignedSet.size > 0) {
            list = list.filter(item => this._isItemAssigned(item, assignedSet));
        }

        const filtered = this.activeMirrorFilter === 'all'
            ? list
            : list.filter(r => {
                if (this.activeMirrorFilter === 'incomplete') return r.status === 'incomplete';
                return r.status === this.activeMirrorFilter;
            });

        const countAll = list.length;
        const countMissingM = list.filter(r => r.status === 'missing-media').length;
        const countMissingW = list.filter(r => r.status === 'missing-work').length;
        const countIncomplete = list.filter(r => r.status === 'incomplete').length;
        const countOk = list.filter(r => r.status === 'ok').length;

        const elAll = document.getElementById('mirror-count-all');
        if (elAll) elAll.innerText = countAll;
        const elMissingM = document.getElementById('mirror-count-missing-media');
        if (elMissingM) elMissingM.innerText = countMissingM;
        const elMissingW = document.getElementById('mirror-count-missing-work');
        if (elMissingW) elMissingW.innerText = countMissingW;
        const elInc = document.getElementById('mirror-count-incomplete');
        if (elInc) elInc.innerText = countIncomplete;
        const elOk = document.getElementById('mirror-count-ok');
        if (elOk) elOk.innerText = countOk;

        const totalDiffs = countMissingM + countMissingW + countIncomplete;
        const diffsEl = document.getElementById('mirror-total-diffs');
        if (diffsEl) diffsEl.innerText = `${totalDiffs} discrepancias`;

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="padding:30px; text-align:center; color:#666;">
                    ${this.mirrorResults.length === 0 ? 'No se encontraron planos en las rutas seleccionadas.' : (this.onlyMyTasks ? 'No hay planos en este filtro para tus tareas asignadas.' : 'No hay planos en este filtro.')}
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
                detailText = '<span style="color:#e57373;">❌ Estructura de carpetas inexistente en Media.</span>';
            } else if (item.status === 'missing-work') {
                statusBadge = '<span style="background:#64b5f6; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">FALTA EN PROYECTO</span>';
                statusBorder = '#64b5f6';
                detailText = '<span style="color:#64b5f6;">❌ Estructura de carpetas inexistente en Proyecto.</span>';
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

            let driveBadges = '';
            if (item.driveDiff) {
                if (item.driveDiff.missingOnDriveWork || item.driveDiff.missingOnDriveMedia) {
                    driveBadges += '<span style="background:#ff9800; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 5px; border-radius:3px; margin-left:4px;" title="No encontrado en el catálogo de Google Drive">⬆️ Falta subir a Drive</span>';
                }
                if (item.driveDiff.newerOnDriveWork || item.driveDiff.newerOnDriveMedia) {
                    driveBadges += '<span style="background:#0288D1; color:#fff; font-size:0.65rem; font-weight:bold; padding:2px 5px; border-radius:3px; margin-left:4px;" title="Existe en Drive pero no está en local">☁️ En Drive (no local)</span>';
                }
            }

            return `
                <div style="display:flex; align-items:flex-start; gap:8px; padding:6px 8px; margin-bottom:4px; background:#181818; border-left:3px solid ${statusBorder}; border-radius:3px; font-size:0.75rem; cursor:context-menu;"
                     oncontextmenu="fileAuditor.handleRowContextMenu(event, '${item.key}', 'mirror')"
                     title="Clic derecho para Abrir en Explorer o Navegar en Pipeta (Go To)">
                    <input type="checkbox" ${item.selected ? 'checked' : ''} onchange="fileAuditor.toggleMirrorItemSelect('${item.key}', this.checked)" style="margin-top:3px; cursor:pointer;">
                    <div style="flex:1; overflow:hidden;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                            <span style="font-weight:bold; color:#fff; font-family:monospace; font-size:0.85rem;">🎬 ${item.shot}</span>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <span style="color:#888; font-size:0.7rem;">${item.ep} / ${item.seq}</span>
                                ${statusBadge}
                                ${driveBadges}
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
        const summaryEl = document.getElementById('mirror-selected-summary');
        if (summaryEl) summaryEl.innerText = `${selCount} elementos seleccionados`;

        const fixProj = document.getElementById('mirror-fix-opt-proj')?.checked;
        const fixMedia = document.getElementById('mirror-fix-opt-media')?.checked;
        const hasTarget = fixProj || fixMedia;
        const canFix = selCount > 0 && hasTarget;

        const btnFix = document.getElementById('mirror-btn-fix');
        if (btnFix) {
            btnFix.disabled = !canFix;
            btnFix.style.background = canFix ? '#ffb74d' : '#444';
            btnFix.style.color = canFix ? '#000' : '#888';
            btnFix.style.fontWeight = 'bold';
        }
    }

    repairMirrorFix() {
        const fixProj = document.getElementById('mirror-fix-opt-proj')?.checked;
        const fixMedia = document.getElementById('mirror-fix-opt-media')?.checked;

        if (!fixProj && !fixMedia) {
            if (typeof settings !== 'undefined' && settings.showToast) {
                settings.showToast('Selecciona al menos Proyecto o Media para reparar', 'warn', 3);
            } else {
                alert('Selecciona al menos Proyecto o Media para reparar');
            }
            return;
        }

        let mode = 'both';
        if (fixProj && !fixMedia) mode = 'work';
        if (!fixProj && fixMedia) mode = 'media';

        this.repairMirrorSelected(mode);
    }

    async repairMirrorSelected(mode = 'both') {
        const selected = this.mirrorResults.filter(r => r.selected);
        if (selected.length === 0) return;

        const confirmMsg = `¿Reparar y crear las carpetas para los ${selected.length} plano(s) seleccionados?`;
        if (!confirm(confirmMsg)) return;

        this._setMirrorStatus(`⏳ Reparando ${selected.length} plano(s)...`, '#4fc3f7');

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('audit', `[FILE AUDITOR] 🛠️ Iniciando reparación de carpetas (${mode}) para ${selected.length} plano(s)...`, 'info');
        }

        try {
            const presetCfg = await this._loadPresetConfig();

            let targetMediaSubs = presetCfg.mediaSubfolders;
            let targetWorkSubs = presetCfg.workSubfolders;
            if (this.mirrorProcess && this.mirrorProcess !== 'all') {
                const pLow = this.mirrorProcess.toLowerCase();
                targetMediaSubs = targetMediaSubs.filter(f => f.toLowerCase().includes(pLow) || (pLow === 'compo' && f.toLowerCase().includes('nuke')));
                targetWorkSubs = targetWorkSubs.filter(f => f.toLowerCase().includes(pLow) || f.toLowerCase() === pLow);
            }

            const res = await fetch('/api/mirror/repairBatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: selected,
                    mode: mode,
                    checkSubfolders: this.checkSubfolders,
                    mediaSubfolders: targetMediaSubs,
                    workSubfolders: targetWorkSubs,
                    omitControl: this.omitControlFiles
                })
            });

            const data = await res.json();
            if (data.success) {
                const msg = `✅ Reparación completada: ${data.repairedCount} estructura(s) creadas con éxito.`;
                this._setMirrorStatus(msg, '#4CAF50');
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('audit', `[FILE AUDITOR] ${msg}`, 'ok', data);
                    selected.forEach(s => {
                        PipetaConsole.log('audit', ` ↳ [REPAIR] 📁 ${s.shotId || s.shotName || s.relativePath || 'Plano'} ➔ Media: ${s.mediaPath || 'Estructura OK'}`, 'ok');
                    });
                }
                alert(msg);
                this.runMirrorAudit('all');
            } else {
                throw new Error(data.error || 'Error al reparar');
            }
        } catch (err) {
            console.error("Repair error:", err);
            this._setMirrorStatus('❌ Error al reparar: ' + err.message, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] ❌ Error en reparación: ${err.message}`, 'error');
            }
        }
    }

    // ============================================================
    // TAB 2: SCENE STATUS LOGIC
    // ============================================================

    _setSceneStatus(text, color = '#888') {
        const el = document.getElementById('scenes-audit-status');
        if (el) {
            el.innerText = text;
            el.style.color = color;
        }
    }

    async runSceneAudit(scope = 'all') {
        if (this.isSceneAuditing) return;
        this.isSceneAuditing = true;
        this.sceneResults = [];

        const roots = this._getRoots();
        if (!roots.work || !roots.media) {
            this._setSceneStatus('❌ Raíces de Proyecto o Media no encontradas.', '#f44336');
            this.isSceneAuditing = false;
            return;
        }

        const isOnline = window.viewLocationMode === 'online';
        const currentProj = (typeof settings !== 'undefined' && settings.currentProject) ? settings.currentProject.name : null;
        this._setSceneStatus(`🔍 Auditando escenas ${isOnline ? 'Online (G:)' : 'Local (Z:)'}...`, '#4fc3f7');
        const listEl = document.getElementById('scenes-results-list');
        if (listEl) {
            listEl.innerHTML = `<div style="padding:25px; text-align:center; color:#888;"><div class="spinner-small"></div> Analizando archivos de proceso (${isOnline ? 'ONLINE' : 'LOCAL'})...</div>`;
        }

        try {
            const presetCfg = await this._loadPresetConfig();

            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] 📄 Iniciando auditoría de ESCENAS (${scope}) [Proceso: ${this.renderConfig.process}] en: ${roots.work}`, 'info');
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
                    projectName: currentProj,
                    config: {
                        process: this.renderConfig.process,
                        processes: presetCfg.processes,
                        procExtMap: presetCfg.procExtMap,
                        allowedExtensions: presetCfg.allowedExtensions,
                        onlyFullRes: this.renderConfig.onlyFullRes,
                        includeMov: this.renderConfig.includeMov,
                        latestOnly: this.renderConfig.latestOnly,
                        omitV001: this.renderConfig.omitV001,
                        checkTclExt: this.renderConfig.checkTclExt,
                        deepCompare: false,
                        compareDrive: this.compareDrive
                    }
                })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Error al auditar escenas');

            this.sceneResults = data.results || [];
            this.isSceneAuditing = false;

            this._setSceneStatus(`✅ Auditoría finalizada: ${this.sceneResults.length} plano(s) analizados.`, '#4CAF50');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] 📄 Auditoría de ESCENAS finalizada: ${this.sceneResults.length} plano(s) analizados.`, 'ok');
            }

            this.renderSceneResults();
        } catch (e) {
            this.isSceneAuditing = false;
            console.error("Scene status audit error:", e);
            this._setSceneStatus('❌ Error al auditar: ' + e.message, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] ❌ Error en auditoría de escenas: ${e.message}`, 'error');
            }
        }
    }

    renderSceneResults() {
        const listEl = document.getElementById('scenes-results-list');
        if (!listEl) return;

        // Filter by Ramon My Tasks if enabled
        const assignedSet = (this.onlyMyTasks && typeof window.getExplorerAssignedTaskNames === 'function')
            ? window.getExplorerAssignedTaskNames()
            : null;

        let list = this.sceneResults;
        if (assignedSet && assignedSet.size > 0) {
            list = list.filter(item => this._isItemAssigned(item, assignedSet));
        }

        const filtered = this.activeSceneFilter === 'all'
            ? list
            : list.filter(r => r.sceneStatus === this.activeSceneFilter);

        const countAll = list.length;
        const countHas = list.filter(r => r.sceneStatus === 'has-scene').length;
        const countBad = list.filter(r => r.sceneStatus === 'bad-naming').length;
        const countNo = list.filter(r => r.sceneStatus === 'no-script').length;

        const elAll = document.getElementById('scenes-count-all');
        if (elAll) elAll.innerText = countAll;
        const elHas = document.getElementById('scenes-count-has');
        if (elHas) elHas.innerText = countHas;
        const elBad = document.getElementById('scenes-count-bad');
        if (elBad) elBad.innerText = countBad;
        const elNo = document.getElementById('scenes-count-no');
        if (elNo) elNo.innerText = countNo;

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="padding:30px; text-align:center; color:#666;">
                    ${this.sceneResults.length === 0 ? 'No se encontraron escenas en las rutas seleccionadas.' : (this.onlyMyTasks ? 'No hay escenas en este filtro para tus tareas asignadas.' : 'No hay escenas en este filtro.')}
                </div>
            `;
            this._updateSceneButtons();
            return;
        }

        listEl.innerHTML = filtered.map(item => this._buildAuditRowHTML(item, 'scenes')).join('');
        this._updateSceneButtons();
    }

    setSceneFilter(filter, btn) {
        this.activeSceneFilter = filter;
        this.container.querySelectorAll('#scenes-tabs .sync-filter-tab').forEach(t => t.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.renderSceneResults();
    }

    toggleSceneItemSelect(key, selected) {
        const item = this.sceneResults.find(r => r.key === key);
        if (item) item.selected = selected;
        this._updateSceneButtons();
    }

    toggleSceneSelectAll(checked) {
        const filtered = this.activeSceneFilter === 'all'
            ? this.sceneResults
            : this.sceneResults.filter(r => r.sceneStatus === this.activeSceneFilter);
        filtered.forEach(r => r.selected = checked);
        this.renderSceneResults();
    }

    _updateSceneButtons() {
        const selected = this.sceneResults.filter(r => r.selected);
        const selCount = selected.length;
        const summaryEl = document.getElementById('scenes-selected-summary');
        if (summaryEl) summaryEl.innerText = `${selCount} elementos seleccionados`;

        const optDown = document.getElementById('scenes-fix-opt-download')?.checked;
        const optUp = document.getElementById('scenes-fix-opt-upload')?.checked;
        const hasOpt = optDown || optUp;
        const canFix = selCount > 0 && hasOpt;

        const btnFix = document.getElementById('scenes-btn-fix');
        if (btnFix) {
            btnFix.disabled = !canFix;
            btnFix.style.background = canFix ? '#ffb74d' : '#444';
            btnFix.style.color = canFix ? '#000' : '#888';
            btnFix.style.fontWeight = 'bold';
        }
    }

    async repairScenesFix() {
        const selected = this.sceneResults.filter(r => r.selected);
        if (selected.length === 0) return;

        const optDown = document.getElementById('scenes-fix-opt-download')?.checked;
        const optUp = document.getElementById('scenes-fix-opt-upload')?.checked;

        if (!optDown && !optUp) {
            alert('Selecciona al menos Download scenes o Upload scenes.');
            return;
        }

        const proj = (typeof settings !== 'undefined' && settings.currentProject) ? settings.currentProject.name : 'surf_love';
        const user = (typeof getPipetaCurrentUser === 'function') ? getPipetaCurrentUser() : 'user';

        let queuedDownloads = 0;
        let queuedUploads = 0;

        try {
            // 1. Process Downloads (Drive -> Local)
            if (optDown) {
                const downloadItems = [];
                for (const r of selected) {
                    if (r.driveDiff && (r.driveDiff.driveNewerScene || (r.sceneStatus === 'no-script' && r.driveDiff.driveLatestScriptName))) {
                        const fileName = r.driveDiff.driveLatestScriptName;
                        const localTargetPath = `${r.scriptPath}/${fileName}`;
                        downloadItems.push({
                            name: fileName,
                            isDir: false,
                            targetLocalPath: localTargetPath,
                            localPath: localTargetPath,
                            path: localTargetPath
                        });
                    }
                }

                if (downloadItems.length > 0) {
                    const res = await fetch('/api/sync/request-download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project: proj, items: downloadItems, user, transferType: 'drive' })
                    }).then(r => r.json());

                    if (res.success) {
                        queuedDownloads = downloadItems.length;
                    }
                }
            }

            // 2. Process Uploads (Local -> Drive)
            if (optUp) {
                const uploadItems = [];
                for (const r of selected) {
                    if (r.latestScriptName && (r.driveDiff?.driveMissingScene || (r.driveDiff && r.latestScriptNum > (r.driveDiff.driveLatestScriptNum || 0)))) {
                        const fileName = r.latestScriptName;
                        const localSourcePath = `${r.scriptPath}/${fileName}`;
                        uploadItems.push({
                            name: fileName,
                            isDir: false,
                            localPath: localSourcePath,
                            path: localSourcePath
                        });
                    }
                }

                if (uploadItems.length > 0) {
                    const res = await fetch('/api/sync/request-upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project: proj, items: uploadItems, user, transferType: 'drive' })
                    }).then(r => r.json());

                    if (res.success) {
                        queuedUploads = uploadItems.length;
                    }
                }
            }

            const total = queuedDownloads + queuedUploads;
            if (total > 0) {
                const parts = [];
                if (queuedDownloads > 0) parts.push(`${queuedDownloads} descarga(s)`);
                if (queuedUploads > 0) parts.push(`${queuedUploads} subida(s)`);
                const msg = `⚡ Encoladas para sync: ${parts.join(' y ')} de escenas.`;
                if (typeof settings !== 'undefined' && settings.showToast) {
                    settings.showToast(msg, 'success', 4, 'Órdenes enviadas a la cola de transferencias');
                } else {
                    alert(msg);
                }
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `[SCENE FIX] ${msg}`, 'ok');
                }
            } else {
                alert('No se encontraron escenas pendientes de descarga o subida en los planos seleccionados.');
            }
        } catch (e) {
            console.error("Error in repairScenesFix:", e);
            alert('Error al encolar sincronización: ' + e.message);
        }
    }

    // ============================================================
    // TAB 3: RENDER STATUS LOGIC
    // ============================================================

    setRenderProcess(proc) {
        this.renderConfig.process = proc;
        const s1 = document.getElementById('scenes-audit-process');
        const s2 = document.getElementById('render-audit-process');
        if (s1 && s1.value !== proc) s1.value = proc;
        if (s2 && s2.value !== proc) s2.value = proc;
        if (this.activeTab === 'scenes' && this.sceneResults.length > 0) this.runSceneAudit('all');
        if (this.activeTab === 'renders' && this.renderResults.length > 0) this.runRenderAudit('all');
    }

    updateRenderConfig(key, val) {
        this.renderConfig[key] = val;
        if (this.renderResults.length > 0) {
            this.renderRenderResults();
        }
    }

    _setRenderStatus(text, color = '#888') {
        const el = document.getElementById('render-audit-status');
        if (el) {
            el.innerText = text;
            el.style.color = color;
        }
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
        const currentProj = (typeof settings !== 'undefined' && settings.currentProject) ? settings.currentProject.name : null;
        this._setRenderStatus(`🔍 Auditando renders vs procesos ${isOnline ? 'Online (G:)' : 'Local (Z:)'}...`, '#4fc3f7');
        const listEl = document.getElementById('render-results-list');
        if (listEl) {
            listEl.innerHTML = `<div style="padding:25px; text-align:center; color:#888;"><div class="spinner-small"></div> Analizando renders (${isOnline ? 'ONLINE' : 'LOCAL'})...</div>`;
        }

        try {
            const presetCfg = await this._loadPresetConfig();

            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] 🎬 Iniciando auditoría de RENDERS (${scope}) [Proceso: ${this.renderConfig.process}] en: ${roots.work}`, 'info');
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
                    projectName: currentProj,
                    config: {
                        process: this.renderConfig.process,
                        processes: presetCfg.processes,
                        procExtMap: presetCfg.procExtMap,
                        allowedExtensions: presetCfg.allowedExtensions,
                        onlyFullRes: this.renderConfig.onlyFullRes,
                        includeMov: this.renderConfig.includeMov,
                        latestOnly: this.renderConfig.latestOnly,
                        omitV001: this.renderConfig.omitV001,
                        checkTclExt: this.renderConfig.checkTclExt,
                        deepCompare: this.deepCompare,
                        compareDrive: this.compareDrive
                    }
                })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Error al auditar renders');

            this.renderResults = data.results || [];
            this.isRenderAuditing = false;

            this._setRenderStatus(`✅ Auditoría finalizada: ${this.renderResults.length} plano(s) analizados.`, '#4CAF50');
            
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[FILE AUDITOR] 🎬 Auditoría de RENDERS finalizada: ${this.renderResults.length} plano(s) analizados.`, 'ok');
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
        if (!listEl) return;
        const cfg = this.renderConfig;

        // Filter by Ramon My Tasks if enabled
        const assignedSet = (this.onlyMyTasks && typeof window.getExplorerAssignedTaskNames === 'function')
            ? window.getExplorerAssignedTaskNames()
            : null;

        // Apply mode-level filters (only list shots that have a script OR have a render)
        let list = this.renderResults.filter(item => {
            if (item.scriptCount === 0 && item.renders.length === 0) return false;
            if (cfg.omitV001 && item.latestScriptNum !== null && item.latestScriptNum <= 1) return false;
            return true;
        });

        if (assignedSet && assignedSet.size > 0) {
            list = list.filter(item => this._isItemAssigned(item, assignedSet));
        }

        // Tab filter
        const filtered = this.activeRenderFilter === 'all'
            ? list
            : list.filter(r => {
                if (this.activeRenderFilter === 'sequence-issue') return !!r.sequenceIssue;
                if (this.activeRenderFilter === 'drive-diff') {
                    return r.driveDiff && (r.driveDiff.driveNewerRender || r.driveDiff.driveMissingRender);
                }
                return r.renderStatus === this.activeRenderFilter;
            });

        const countAll = list.length;
        const countUptodate = list.filter(r => r.renderStatus === 'up-to-date').length;
        const countSeqIssue = list.filter(r => !!r.sequenceIssue).length;
        const countOutdated = list.filter(r => r.renderStatus === 'outdated').length;
        const countBadNaming = list.filter(r => r.renderStatus === 'bad-naming').length;
        const countMissing = list.filter(r => r.renderStatus === 'missing-render').length;
        const countOrphan = list.filter(r => r.renderStatus === 'orphan-render').length;
        const countDriveDiff = list.filter(r => r.driveDiff && (r.driveDiff.driveNewerRender || r.driveDiff.driveMissingRender)).length;

        const elAll = document.getElementById('render-count-all');
        if (elAll) elAll.innerText = countAll;
        const elUp = document.getElementById('render-count-uptodate');
        if (elUp) elUp.innerText = countUptodate;
        const elSeq = document.getElementById('render-count-seqissue');
        if (elSeq) elSeq.innerText = countSeqIssue;
        const elOut = document.getElementById('render-count-outdated');
        if (elOut) elOut.innerText = countOutdated;
        const elBad = document.getElementById('render-count-badnaming');
        if (elBad) elBad.innerText = countBadNaming;
        const elMiss = document.getElementById('render-count-missing');
        if (elMiss) elMiss.innerText = countMissing;
        const elOrph = document.getElementById('render-count-orphan');
        if (elOrph) elOrph.innerText = countOrphan;
        const elDrive = document.getElementById('render-count-drivediff');
        if (elDrive) elDrive.innerText = countDriveDiff;

        const badge = document.getElementById('render-summary-badge');
        if (badge) badge.innerText = `${countAll} planos analizados`;

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="padding:30px; text-align:center; color:#666;">
                    ${this.renderResults.length === 0 ? 'No se encontraron planos en las rutas seleccionadas.' : (this.onlyMyTasks ? 'No hay planos en este filtro para tus tareas asignadas.' : 'No hay planos en este filtro.')}
                </div>
            `;
            return;
        }

        listEl.innerHTML = filtered.map(item => this._buildAuditRowHTML(item, 'renders')).join('');
        this._updateRenderButtons();
    }

    setRenderFilter(filter, btn) {
        this.activeRenderFilter = filter;
        this.container.querySelectorAll('#render-tabs .sync-filter-tab').forEach(t => t.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.renderRenderResults();
    }

    toggleRenderItemSelect(key, selected) {
        const item = this.renderResults.find(r => r.key === key);
        if (item) item.selected = selected;
        this._updateRenderButtons();
    }

    toggleRenderSelectAll(checked) {
        const cfg = this.renderConfig;
        const assignedSet = (this.onlyMyTasks && typeof window.getExplorerAssignedTaskNames === 'function')
            ? window.getExplorerAssignedTaskNames()
            : null;

        let list = this.renderResults.filter(item => {
            const hasDriveMedia = this.compareDrive && item.driveDiff && (item.driveDiff.driveNewerRender || item.driveDiff.driveLatestRenderNum !== null);
            if (item.scriptCount === 0 && item.renders.length === 0 && !hasDriveMedia) return false;
            if (cfg.omitV001 && item.latestScriptNum !== null && item.latestScriptNum <= 1 && item.renders.length === 0) return false;
            return true;
        });

        if (assignedSet && assignedSet.size > 0) {
            list = list.filter(item => this._isItemAssigned(item, assignedSet));
        }

        const filtered = this.activeRenderFilter === 'all'
            ? list
            : list.filter(r => {
                if (this.activeRenderFilter === 'sequence-issue') return !!r.sequenceIssue;
                if (this.activeRenderFilter === 'drive-diff') return r.driveDiff && (r.driveDiff.driveNewerRender || r.driveDiff.driveMissingRender);
                return r.renderStatus === this.activeRenderFilter;
            });

        filtered.forEach(r => r.selected = checked);
        this.renderRenderResults();
    }

    _updateRenderButtons() {
        const selected = this.renderResults.filter(r => r.selected);
        const selCount = selected.length;
        const summaryEl = document.getElementById('render-selected-summary');
        if (summaryEl) summaryEl.innerText = `${selCount} elementos seleccionados`;

        const optDown = document.getElementById('render-fix-opt-download')?.checked;
        const optUp = document.getElementById('render-fix-opt-upload')?.checked;
        const hasOpt = optDown || optUp;

        // Check if any selected item has .tmp files to clean
        const hasTmp = selected.some(r => r.hasTmpFiles || (r.badFiles && r.badFiles.some(f => f.toLowerCase().endsWith('.tmp'))) || (r.tmpFiles && r.tmpFiles.length > 0));

        const canFix = selCount > 0 && (hasOpt || hasTmp);

        const btnFix = document.getElementById('render-btn-fix');
        if (btnFix) {
            btnFix.disabled = !canFix;
            btnFix.style.background = canFix ? '#ffb74d' : '#444';
            btnFix.style.color = canFix ? '#000' : '#888';
            btnFix.style.fontWeight = 'bold';
            if (hasTmp && !hasOpt) {
                btnFix.innerText = 'Fix (Borrar .tmp)';
            } else {
                btnFix.innerText = 'Fix';
            }
        }
    }

    async repairRendersFix() {
        const selected = this.renderResults.filter(r => r.selected);
        if (selected.length === 0) return;

        const optDown = document.getElementById('render-fix-opt-download')?.checked;
        const optUp = document.getElementById('render-fix-opt-upload')?.checked;
        const modeGap = document.getElementById('render-fix-mode-gap')?.checked;
        const modeFull = document.getElementById('render-fix-mode-full')?.checked;

        // 0. Clean .tmp files first if any selected items have them (Strictly local, no cloud transfer)
        const selectedWithTmp = selected.filter(r => r.hasTmpFiles || (r.badFiles && r.badFiles.some(f => f.toLowerCase().endsWith('.tmp'))) || (r.tmpFiles && r.tmpFiles.length > 0));
        let cleanedTmpCount = 0;
        if (selectedWithTmp.length > 0) {
            const cleanRes = await this.cleanTmpFilesForShots(selectedWithTmp);
            if (cleanRes && cleanRes.success) {
                cleanedTmpCount = cleanRes.deletedCount || selectedWithTmp.length;
            }
        }

        // If no cloud transfer options are checked, we are done!
        if (!optDown && !optUp) {
            if (cleanedTmpCount > 0) {
                const msg = `🧹 Fix completado: Se eliminaron ${cleanedTmpCount} archivo(s) .tmp residuales en ${selectedWithTmp.length} plano(s).\nLos frames de render quedaron intactos y el estado se actualizó a AL DÍA.`;
                if (typeof settings !== 'undefined' && settings.showToast) {
                    settings.showToast(msg, 'success', 5, 'Limpieza de temporales');
                } else {
                    alert(msg);
                }
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('audit', `[FILE AUDITOR] ${msg}`, 'ok');
                }
                return;
            }
            alert('Selecciona al menos Download o Upload (o selecciona planos con residuos .tmp para limpiar).');
            return;
        }

        const proj = (typeof settings !== 'undefined' && settings.currentProject) ? settings.currentProject.name : 'surf_love';
        const user = (typeof getPipetaCurrentUser === 'function') ? getPipetaCurrentUser() : 'user';

        let queuedDownloads = 0;
        let queuedUploads = 0;

        try {
            // 1. Process Downloads (Drive/Server -> Local)
            if (optDown) {
                const downloadItems = [];
                for (const r of selected) {
                    const targetRender = (this.renderConfig.latestOnly && r.renders && r.renders.length > 0)
                        ? r.renders[0]
                        : (r.renders && r.renders[0]);

                    if (modeGap && r.sequenceIssue && r.sequenceIssue.missingFrames && r.sequenceIssue.missingFrames.length > 0) {
                        // Fix GAP: download only missing or damaged frames
                        for (const fNum of r.sequenceIssue.missingFrames) {
                            const padNum = String(fNum).padStart(4, '0');
                            const vStr = targetRender ? targetRender.versionStr : (r.driveDiff?.driveLatestRenderVer || 'v001');
                            const frameName = `${r.shot}_${r.process}_${vStr}.${padNum}.exr`;
                            downloadItems.push({
                                name: frameName,
                                isDir: false,
                                targetLocalPath: targetRender ? `${targetRender.path}/${frameName}` : null,
                                path: targetRender ? `${targetRender.path}/${frameName}` : null,
                                repairGaps: true
                            });
                        }
                    } else if (r.driveDiff && (r.driveDiff.driveNewerRender || r.renderStatus === 'orphan-render' || r.renderStatus === 'missing-render' || modeFull)) {
                        // Full Sync: download whole sequence folder
                        const renderFolder = targetRender ? targetRender.folderName : (r.driveDiff.driveLatestRenderVer || 'v001');
                        const targetPath = targetRender ? targetRender.path : `${r.mediaPath}/${r.process}/${renderFolder}`;
                        downloadItems.push({
                            name: renderFolder,
                            isDir: true,
                            isSequence: true,
                            targetLocalPath: targetPath,
                            path: targetPath,
                            overwrite: true
                        });
                    }
                }

                if (downloadItems.length > 0) {
                    const res = await fetch('/api/sync/request-download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project: proj, items: downloadItems, user, transferType: 'drive' })
                    }).then(r => r.json());

                    if (res.success) queuedDownloads = downloadItems.length;
                }
            }

            // 2. Process Uploads (Local -> Drive)
            if (optUp) {
                const uploadItems = [];
                for (const r of selected) {
                    const targetRender = (this.renderConfig.latestOnly && r.renders && r.renders.length > 0)
                        ? r.renders[0]
                        : (r.renders && r.renders[0]);

                    if (targetRender && (r.driveDiff?.driveMissingRender || modeFull)) {
                        uploadItems.push({
                            name: targetRender.folderName,
                            isDir: true,
                            isSequence: true,
                            localPath: targetRender.path,
                            path: targetRender.path,
                            overwrite: true
                        });
                    }
                }

                if (uploadItems.length > 0) {
                    const res = await fetch('/api/sync/request-upload', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project: proj, items: uploadItems, user, transferType: 'drive' })
                    }).then(r => r.json());

                    if (res.success) queuedUploads = uploadItems.length;
                }
            }

            const total = queuedDownloads + queuedUploads;
            if (total > 0) {
                const parts = [];
                if (queuedDownloads > 0) parts.push(`${queuedDownloads} descarga(s)`);
                if (queuedUploads > 0) parts.push(`${queuedUploads} subida(s)`);
                const modeLabel = modeGap ? 'Fix GAP' : 'Full Sync';
                let msg = `⚡ [${modeLabel}] Encoladas para sync: ${parts.join(' y ')} de renders.`;
                if (cleanedTmpCount > 0) {
                    msg = `🧹 Se eliminaron ${cleanedTmpCount} archivo(s) .tmp residuales.\n` + msg;
                }
                if (typeof settings !== 'undefined' && settings.showToast) {
                    settings.showToast(msg, 'success', 4, 'Órdenes enviadas a la cola de transferencias');
                } else {
                    alert(msg);
                }
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('audit', `[FILE AUDITOR] ${msg}`, 'ok');
                }
            } else if (cleanedTmpCount > 0) {
                const msg = `🧹 Fix completado: Se eliminaron ${cleanedTmpCount} archivo(s) .tmp residuales en ${selectedWithTmp.length} plano(s).\nNo había transferencias adicionales de Drive requeridas.`;
                if (typeof settings !== 'undefined' && settings.showToast) {
                    settings.showToast(msg, 'success', 4);
                } else {
                    alert(msg);
                }
            } else {
                alert('No se encontraron renders pendientes de transferir con los filtros y opciones seleccionadas.');
            }

        } catch (err) {
            console.error("Render fix error:", err);
            alert('Error al encolar transferencias: ' + err.message);
        }
    }

    handleRowContextMenu(event, key, mode) {
        event.preventDefault();
        event.stopPropagation();

        let item = null;
        if (mode === 'mirror') item = this.mirrorResults.find(r => r.key === key);
        else if (mode === 'scenes') item = this.sceneResults.find(r => r.key === key);
        else if (mode === 'renders') item = this.renderResults.find(r => r.key === key);

        if (!item) return;

        let cm = document.getElementById('fa-context-menu');
        if (!cm) {
            cm = document.createElement('div');
            cm.id = 'fa-context-menu';
            cm.style.cssText = `
                position: fixed;
                z-index: 10600;
                background: #1e1e1e;
                border: 1px solid #444;
                border-radius: 4px;
                padding: 4px 0;
                box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                font-size: 0.75rem;
                color: #eee;
                min-width: 190px;
                display: none;
            `;
            document.body.appendChild(cm);
            document.addEventListener('click', () => { if (cm) cm.style.display = 'none'; });
        }

        const workPath = item.workPath || item.scriptPath || '';
        const mediaPath = item.mediaPath || (item.renders && item.renders[0]?.path) || '';
        const primaryPath = workPath || mediaPath;
        const hasTmp = item.hasTmpFiles || item.hasOnlyTmpBadFiles || (item.badFiles && item.badFiles.some(f => f.toLowerCase().endsWith('.tmp'))) || (item.tmpFiles && item.tmpFiles.length > 0);

        cm.innerHTML = `
            ${hasTmp ? `
                <div onclick="fileAuditor.cleanTmpFiles('${item.key}')" style="padding:6px 12px; cursor:pointer; display:flex; align-items:center; gap:8px; color:#ffb74d;" onmouseenter="this.style.background='#2e2e2e'" onmouseleave="this.style.background='transparent'">
                    <span>🧹</span> <span>Borrar archivos .tmp residuales</span>
                </div>
                <div style="height:1px; background:#333; margin:4px 0;"></div>
            ` : ''}
            ${workPath ? `
                <div onclick="fileAuditor.openInExplorer('${workPath.replace(/\\/g, '\\\\')}')" style="padding:6px 12px; cursor:pointer; display:flex; align-items:center; gap:8px;" onmouseenter="this.style.background='#2e2e2e'" onmouseleave="this.style.background='transparent'">
                    <span>📂</span> <span>Abrir Proyecto en Explorer</span>
                </div>
            ` : ''}
            ${mediaPath ? `
                <div onclick="fileAuditor.openInExplorer('${mediaPath.replace(/\\/g, '\\\\')}')" style="padding:6px 12px; cursor:pointer; display:flex; align-items:center; gap:8px;" onmouseenter="this.style.background='#2e2e2e'" onmouseleave="this.style.background='transparent'">
                    <span>🎬</span> <span>Abrir Media en Explorer</span>
                </div>
            ` : ''}
            <div style="height:1px; background:#333; margin:4px 0;"></div>
            ${primaryPath ? `
                <div onclick="fileAuditor.goToPath('${primaryPath.replace(/\\/g, '\\\\')}')" style="padding:6px 12px; cursor:pointer; display:flex; align-items:center; gap:8px; color:#4fc3f7;" onmouseenter="this.style.background='#2e2e2e'" onmouseleave="this.style.background='transparent'">
                    <span>🎯</span> <span>Go To (Navegar en Pipeta)</span>
                </div>
            ` : ''}
        `;

        cm.style.display = 'block';
        cm.style.left = Math.min(event.clientX, window.innerWidth - 210) + 'px';
        cm.style.top = Math.min(event.clientY, window.innerHeight - 150) + 'px';
    }

    async cleanTmpFiles(shotKey) {
        const item = (this.renderResults || []).find(r => r.key === shotKey) || (this.auditResults || []).find(r => r.key === shotKey);
        if (!item) return;

        const rendersToClean = (item.renders || []).filter(r => r.tmpFiles && r.tmpFiles.length > 0);
        if (rendersToClean.length === 0 && item.renders && item.renders[0]) {
            rendersToClean.push(item.renders[0]);
        }

        const count = item.tmpFiles?.length || item.badFiles?.length || 1;
        const confirmed = confirm(`¿Deseas eliminar permanentemente los ${count} archivo(s) .tmp residuales de este render?\n\nLos frames .exr y el resto de la secuencia se mantendrán 100% intactos.`);
        if (!confirmed) return;

        try {
            const res = await fetch('/api/audit/clean-tmp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targets: [{
                        key: item.key,
                        renders: rendersToClean.map(r => ({ path: r.path, tmpFiles: r.tmpFiles || item.badFiles }))
                    }]
                })
            }).then(r => r.json());

            if (res.success) {
                item.badFiles = [];
                item.tmpFiles = [];
                item.hasTmpFiles = false;
                item.hasOnlyTmpBadFiles = false;

                const highestRender = item.renders ? item.renders[0] : null;
                if (highestRender && item.latestScriptNum) {
                    if (highestRender.versionNum === item.latestScriptNum) {
                        item.renderStatus = 'up-to-date';
                    } else if (highestRender.versionNum < item.latestScriptNum) {
                        item.renderStatus = 'outdated';
                    }
                }

                this.renderRenderResults();
                const cleanMsg = `🧹 Se eliminaron ${res.deletedCount} archivo(s) .tmp residuales.\nEl plano quedó actualizado a: ${item.renderStatus === 'up-to-date' ? 'AL DÍA' : 'DESACTUALIZADO'}.`;
                if (typeof settings !== 'undefined' && settings.showToast) {
                    settings.showToast(cleanMsg, 'success', 4);
                } else {
                    alert(cleanMsg);
                }
            } else {
                alert(`Error al limpiar archivos .tmp: ${res.error || 'Error desconocido'}`);
            }
        } catch (err) {
            console.error("Error cleaning tmp files:", err);
            alert(`Error al intentar limpiar .tmp: ${err.message}`);
        }
    }

    async cleanTmpFilesForShots(shotList) {
        const targets = shotList.map(item => {
            const rendersToClean = (item.renders || []).filter(r => r.tmpFiles && r.tmpFiles.length > 0);
            if (rendersToClean.length === 0 && item.renders && item.renders[0]) {
                rendersToClean.push(item.renders[0]);
            }
            return {
                key: item.key,
                renders: rendersToClean.map(r => ({ path: r.path, tmpFiles: r.tmpFiles || item.badFiles }))
            };
        });

        try {
            const res = await fetch('/api/audit/clean-tmp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targets })
            }).then(r => r.json());

            if (res.success) {
                shotList.forEach(item => {
                    item.badFiles = [];
                    item.tmpFiles = [];
                    item.hasTmpFiles = false;
                    item.hasOnlyTmpBadFiles = false;
                    const highestRender = item.renders ? item.renders[0] : null;
                    if (highestRender && item.latestScriptNum) {
                        if (highestRender.versionNum === item.latestScriptNum) {
                            item.renderStatus = 'up-to-date';
                        } else if (highestRender.versionNum < item.latestScriptNum) {
                            item.renderStatus = 'outdated';
                        }
                    }
                });
                this.renderRenderResults();
            }
            return res;
        } catch (err) {
            console.error("Error in cleanTmpFilesForShots:", err);
            return { success: false, error: err.message, deletedCount: 0 };
        }
    }

    async openInExplorer(p) {
        if (!p) return;
        try {
            if (typeof API !== 'undefined' && API.fs && API.fs.open) {
                await API.fs.open(p);
            } else {
                await fetch('/api/fs/open', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: p })
                });
            }
        } catch(e) {
            console.error("[FILE AUDITOR] Error opening in explorer:", e);
        }
    }

    goToPath(p) {
        if (!p) return;
        if (this.isMaximized) {
            this.toggleMaximize();
        }
        if (typeof switchView === 'function') {
            switchView('view-browser');
        }
        if (typeof window.selectedContextPath !== 'undefined') {
            window.selectedContextPath = p;
        }
        if (typeof SelectionManager !== 'undefined') {
            SelectionManager.clear();
            SelectionManager.add(p);
        }
        if (typeof triggerTreeMirror === 'function') {
            triggerTreeMirror(p);
        }
        if (typeof settings !== 'undefined' && settings.showToast) {
            settings.showToast(`Navegando a: ${p.split(/[\\/]/).pop()}`, 'info', 2);
        }
    }

    // ============================================================
    // ROW BUILDER (SCENES & RENDERS)
    // ============================================================

    _buildAuditRowHTML(item, mode) {
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
                const badExample = item.badScriptFiles && item.badScriptFiles[0] ? item.badScriptFiles[0] : 'archivo';
                detailText = `<span style="color:#ff9800;">⚠️ Archivo presente pero <b>fuera de norma canónica</b> ([SHOT]_[PROCESO]_[VERSION]): <code>${badExample}</code></span>`;
            } else {
                statusBadge = '<span style="background:#e57373; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">SIN ESCENA LOCAL</span>';
                statusBorder = '#e57373';
                const extLabel = item.expectedExt || '.nk';
                detailText = `<span style="color:#e57373;">❌ Carpeta <code>${item.process}</code> sin archivos ${extLabel} en local.</span>`;
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
                const isTmpOnly = item.hasOnlyTmpBadFiles || (item.badFiles && item.badFiles.length > 0 && item.badFiles.every(f => f.toLowerCase().endsWith('.tmp')));
                if (isTmpOnly) {
                    statusBadge = '<span style="background:#ffb74d; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">RESIDUOS .TMP</span>';
                    statusBorder = '#ffb74d';
                    const tmpCount = item.tmpFiles?.length || item.badFiles?.length || 1;
                    detailText = `<span style="color:#ffb74d;">🧹 Se detectaron <b>${tmpCount} archivo(s) .tmp</b> residuales dentro de la carpeta de render.</span>
                    <button onclick="fileAuditor.cleanTmpFiles('${item.key}')" style="margin-left:8px; padding:2px 8px; font-size:0.7rem; background:#ff9800; color:#000; border:none; border-radius:3px; cursor:pointer; font-weight:bold;">🗑️ Borrar .tmp</button>`;
                } else {
                    statusBadge = '<span style="background:#ff9800; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">NOMBRE INCORRECTO</span>';
                    statusBorder = '#ff9800';
                    const badExample = item.badFiles && item.badFiles.length > 0 ? item.badFiles[0] : 'archivo sin patrón';
                    const expectedPattern = `${item.shot}_${item.process}_${item.latestScriptVer || 'v001'}.####.exr`;
                    detailText = `<span style="color:#ff9800;">Nombre actual: <code>${badExample}</code> ➔ <b>Formato esperado:</b> <code>${expectedPattern}</code></span>`;
                }
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
            } else if (item.renderStatus === 'empty') {
                statusBadge = '<span style="background:#333; color:#888; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">SIN INICIAR</span>';
                statusBorder = '#333';
                detailText = `<span style="color:#777;">⚪ Sin escena ni render local (Plano sin iniciar).</span>`;
            }
        }

        // Sequence Integrity Badge (Deep Compare) — ONLY in Renders Mode
        let seqBadge = '';
        if (mode === 'renders' && item.sequenceIssue) {
            const missTxt = item.sequenceIssue.missingCount ? `${item.sequenceIssue.missingCount} faltantes` : '';
            const zeroTxt = item.sequenceIssue.zeroByteCount ? `${item.sequenceIssue.zeroByteCount} dañados (0B)` : '';
            const issueTxt = [missTxt, zeroTxt].filter(Boolean).join(', ');
            seqBadge = `<span style="background:#d32f2f; color:#fff; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;" title="Rango: ${item.sequenceIssue.minFrame}..${item.sequenceIssue.maxFrame}">⚠️ INCOMPLETO (${issueTxt})</span>`;
            if (item.sequenceIssue.missingFrames && item.sequenceIssue.missingFrames.length > 0) {
                detailText += ` <span style="color:#ef5350;">(Gaps: [${item.sequenceIssue.missingFrames.join(', ')}${item.sequenceIssue.missingCount > item.sequenceIssue.missingFrames.length ? '...' : ''}])</span>`;
            }
        }

        // Google Drive Cross-reference Badges
        let driveBadges = '';
        if (item.driveDiff) {
            if (mode === 'scenes') {
                // Scene Status: ONLY show scene-related Drive comparisons
                if (item.driveDiff.driveNewerScene) {
                    driveBadges += `<span style="background:#f57f17; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;" title="En Drive: ${item.driveDiff.driveLatestScriptName || item.driveDiff.driveLatestScriptVer}">⚠️ Newest on Drive (${item.driveDiff.driveLatestScriptVer})</span>`;
                } else if (item.latestScriptNum !== null && item.driveDiff.driveLatestScriptNum !== null && item.latestScriptNum > item.driveDiff.driveLatestScriptNum) {
                    driveBadges += `<span style="background:#2e7d32; color:#fff; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;" title="Tu escena local es más reciente que la de Drive">🟢 Newest on Local (${item.latestScriptVer})</span>`;
                } else if (item.driveDiff.driveMissingScene) {
                    driveBadges += `<span style="background:#e65100; color:#fff; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;" title="Tu escena local aún no fue subida a Google Drive">⬆️ Falta subir escena</span>`;
                }
            } else {
                // Render Status: ONLY show render-related Drive comparisons
                if (item.driveDiff.driveNewerRender) {
                    driveBadges += `<span style="background:#00897b; color:#fff; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;" title="En Drive: ${item.driveDiff.driveLatestRenderName || item.driveDiff.driveLatestRenderVer}">☁️ Render en Drive (${item.driveDiff.driveLatestRenderVer})</span>`;
                }
                if (item.driveDiff.driveMissingRender) {
                    driveBadges += `<span style="background:#fb8c00; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;" title="Tu render local aún no fue subido a Google Drive">⬆️ Falta subir render</span>`;
                }
            }
        }

        const checkboxHTML = mode === 'scenes'
            ? `<input type="checkbox" ${item.selected ? 'checked' : ''} onchange="fileAuditor.toggleSceneItemSelect('${item.key}', this.checked)" style="margin-top:3px; cursor:pointer;">`
            : (mode === 'renders'
                ? `<input type="checkbox" ${item.selected ? 'checked' : ''} onchange="fileAuditor.toggleRenderItemSelect('${item.key}', this.checked)" style="margin-top:3px; cursor:pointer;">`
                : '');

        return `
            <div style="display:flex; align-items:flex-start; gap:8px; padding:6px 8px; margin-bottom:4px; background:#181818; border-left:3px solid ${statusBorder}; border-radius:3px; font-size:0.75rem; cursor:context-menu;"
                 oncontextmenu="fileAuditor.handleRowContextMenu(event, '${item.key}', '${mode}')"
                 title="Clic derecho para Abrir en Explorer o Navegar en Pipeta (Go To)">
                ${checkboxHTML}
                <div style="flex:1; overflow:hidden;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; flex-wrap:wrap; gap:4px;">
                        <span style="font-weight:bold; color:#fff; font-family:monospace; font-size:0.85rem;">🎬 ${item.shot} <span style="font-size:0.7rem; color:#aaa; font-weight:normal;">(${item.process})</span></span>
                        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <span style="color:#888; font-size:0.7rem;">${item.ep} / ${item.seq}</span>
                            ${statusBadge}
                            ${seqBadge}
                            ${driveBadges}
                        </div>
                    </div>
                    <div style="font-size:0.7rem; margin-top:2px;">
                        ${detailText}
                    </div>
                </div>
            </div>
        `;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new FileAuditor();
});
