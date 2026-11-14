// --- DYNAMIC HEADER TOOLBAR & CONTEXTUAL TEMPLATES ---

const HEADER_VIEW_TABS = {
    'Inicio': 'view-home',
    'Explorer': 'view-browser',
    'Shot Navigator': 'view-shot-navigator',
    'Asset Designer': 'view-asset-designer',
    'Shot Designer': 'view-shot-designer',
    'IA Ingest': 'view-ia-ingest'
};

// --- HELPER TOOLBAR IA INGEST (Higgsfield Suite & IA Mode) ---
function getIaIngestToolbarSuiteHtml() {
    const hfOptions = (typeof window.hfOptions !== 'undefined') ? window.hfOptions : {
        createLedger: localStorage.getItem('pipeta_hf_create_ledger') !== 'false',
        preserveOriginal: localStorage.getItem('pipeta_hf_preserve_original') !== 'false',
        downloadRefs: localStorage.getItem('pipeta_hf_download_refs') === 'true',
        forceWorker: localStorage.getItem('pipeta_hf_force_worker') === 'true'
    };
    const isWorkerActive = !!hfOptions.forceWorker;
    const isSuiteOpen = window.hfToolbarOpen === true || (window.hfToolbarOpen === undefined && localStorage.getItem('pipeta_hf_toolbar_open_v2') === 'true');

    return `
    <div class="tool-space-small"></div>
    <!-- HIGGSFIELD AI TOOLBAR SUITE (Collapsible / Expandable) -->
    <div class="toolbar-section-group" id="hfToolbarGroup" title="Higgsfield AI Suite" style="border-color:${isSuiteOpen ? '#556b2f' : '#333'}; background:${isSuiteOpen ? 'rgba(20,25,18,0.7)' : 'rgba(20,20,20,0.5)'}; transition:all 0.2s;">
        <div style="display:flex; align-items:center; gap:6px;">
            <!-- Botón Toggle Principal de la Suite -->
            <button type="button" id="hfToolbarToggleBtn" class="tool-btn ${isSuiteOpen ? 'active' : ''}" 
                    style="width:34px; height:34px; padding:0; border-radius:4px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; ${isSuiteOpen ? 'background:rgba(198,255,0,0.18); border:1px solid #c6ff00; color:#c6ff00; box-shadow:0 0 10px rgba(198,255,0,0.3);' : 'background:#222; border:1px solid #444; color:#aaa;'}"
                    onclick="toggleHfToolbarSuite()" 
                    title="Higgsfield AI Suite">
                <img src="icons/higgsfield.png" style="width:18px; height:18px; border-radius:2px; pointer-events:none;">
            </button>

            <!-- Subpanel Desplegable (visible solo si está abierto) -->
            <div id="hfToolbarDrawer" style="display:${isSuiteOpen ? 'flex' : 'none'}; align-items:center; gap:8px; border-left:1px solid #333; padding-left:8px;">
                <div style="display:flex; flex-direction:column; gap:2px; width:220px;">
                    <input id="hfDirectInput" class="prop-input" placeholder="Higgsfield media URL" 
                           style="width:100%; height:20px; box-sizing:border-box; padding:2px 6px; font-size:0.75rem; font-family:monospace; background:#0d0d0d; border:1px solid #444; border-radius:3px; color:#ffb74d;" 
                           onkeydown="if(event.key==='Enter') handleHfDirectLoad()">
                    
                    <button type="button" id="hfDownloadBtn" class="tool-btn" 
                            style="width:100%; height:20px; box-sizing:border-box; padding:0 6px; font-size:0.72rem; background:#222; border:1px solid #555; color:#ffb74d; font-weight:bold; border-radius:3px; line-height:1; display:flex; align-items:center; justify-content:center;" 
                            onclick="handleHfDirectLoad()" title="Consultar metadata en Higgsfield y añadir a la cola de ingesta de planos">
                        + Cargar a Cola
                    </button>
                </div>

                <button type="button" class="tool-btn" 
                        style="height:42px; padding:0 8px; font-size:0.75rem; border-radius:4px; color:#ffb74d; border-color:#555; background:#222; white-space:nowrap;" 
                        onclick="handleForceHiggsfieldOnSelected()" 
                        title="Forzar consulta de metadata de Higgsfield para los elementos seleccionados en la cola">
                    ⚡ Forzar Higgsfield
                </button>

                <button type="button" id="hfForceWorkerBtn" class="tool-btn ${isWorkerActive ? 'active' : ''}" 
                        style="height:42px; padding:0 10px; font-size:0.75rem; border-radius:4px; ${isWorkerActive ? 'background:#ff9800; color:#000; font-weight:bold; border-color:#ff9800;' : 'background:#222; color:#aaa; border-color:#444;'}" 
                        onclick="toggleHfForceWorker()" 
                        title="${isWorkerActive ? 'Use worker: ACTIVO (Envía las descargas al Worker central de red). Clic para usar Pipeta Local.' : 'Use worker: APAGADO (Se procesa localmente en Pipeta). Clic para usar Worker de red.'}">
                    Use worker
                </button>

                <div style="display:flex; align-items:center; gap:8px; height:42px; margin-left:4px; font-size:0.72rem; color:#bbb; border-left:1px solid #333; padding-left:8px;">
                    <label style="display:flex; align-items:center; gap:4px; cursor:pointer;" title="Genera el archivo .meta.json con prompt, seed, engine y parámetros del job">
                        <input type="checkbox" id="hfCreateLedgerCheck" ${hfOptions.createLedger ? 'checked' : ''} onchange="saveHfOption('createLedger', this.checked)"> Metadata
                    </label>
                    <label style="display:flex; align-items:center; gap:4px; cursor:pointer;" title="Guarda el archivo original sin renombrar dentro de IA/higgsfield/[nombre_original]/">
                        <input type="checkbox" id="hfPreserveOriginalCheck" ${hfOptions.preserveOriginal ? 'checked' : ''} onchange="saveHfOption('preserveOriginal', this.checked)"> Backup
                    </label>
                    <label style="display:flex; align-items:center; gap:4px; cursor:pointer;" title="Descarga las imágenes/videos de entrada usados en el job a IA/higgsfield/.../ref/ y IA/ref/">
                        <input type="checkbox" id="hfDownloadRefsCheck" ${hfOptions.downloadRefs ? 'checked' : ''} onchange="saveHfOption('downloadRefs', this.checked)"> Copy Refs
                    </label>
                </div>
            </div>
        </div>
    </div>

    <div class="tool-space-small"></div>

    <!-- IA MODE (SINGLE TOGGLE SIMPLE <-> ADVANCED) -->
    <div class="toolbar-section-group" title="Modo de Operación IA (Clic para alternar entre Simple y Advanced)">
        <span class="toolbar-section-label">IA Mode</span>
        <div class="toolbar-section-content">
            <button type="button" id="iaWorkModeToggleBtn" class="tool-btn ${window.iaWorkMode !== 'simple' ? 'active' : ''}" 
                    style="height: 24px; min-width: 86px; padding: 0 10px; font-size: 0.72rem; font-weight: bold; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer; ${window.iaWorkMode === 'simple' ? 'background:#1a2332; border:1px solid #2b3a4f; color:#80cbc4;' : 'background:rgba(0,188,212,0.22); border:1px solid #00bcd4; color:#00e5ff; box-shadow:0 0 8px rgba(0,188,212,0.3);'}"
                    onclick="toggleIaWorkMode()" 
                    title="Modo actual: ${window.iaWorkMode === 'simple' ? 'SIMPLE (Flujo rápido simplificado). Clic para pasar a Advanced.' : 'ADVANCED (Control total y tokens avanzados). Clic para volver a Simple.'}">
                ${window.iaWorkMode === 'simple' ? '⚡ Simple' : '🛠️ Advanced'}
            </button>
        </div>
    </div>
    `;
}

// --- DYNAMIC HEADER TOOLS ---
const headerToolsTemplates = {
    'view-home': () => `<!-- No tools for home -->`,
    'view-shot-navigator': () => {
        const isRamon = typeof ShotNavigator !== 'undefined' && typeof ShotNavigator.isRamonMode === 'function' && ShotNavigator.isRamonMode();
        const onlyMine = typeof ShotNavigator !== 'undefined' && ShotNavigator.onlyMyShots;

        if (isRamon) {
            return `
                <div class="toolbar-section-group" title="Filtros Ramón">
                    <span class="toolbar-section-label">Filtros</span>
                    <div class="toolbar-section-content">
                        <button class="tool-btn ${onlyMine ? 'active' : ''}" onclick="ShotNavigator.toggleOnlyMyShots()" title="Filtrar únicamente mis tareas asignadas (Ramón)">
                            <img src="icons/ramon.png" style="width:16px; height:16px; object-fit:contain; filter: ${onlyMine ? 'drop-shadow(0 0 3px #00e5ff)' : 'none'}; vertical-align:middle;">
                        </button>
                        <button class="tool-btn" onclick="ShotNavigator.refreshWorkflow(true)" title="Sincronizar y recargar tareas de Ramón">
                            <img src="icons/refresh.svg" class="btn-icon-svg">
                        </button>
                    </div>
                </div>

                <div class="tool-space-small"></div>

                <div class="toolbar-section-group" title="Acciones de Planos Seleccionados">
                    <span class="toolbar-section-label">Workflow</span>
                    <div class="toolbar-section-content">
                        <button class="tool-btn" onclick="ShotNavigator.ensureMissingFoldersForSelected()" title="Crear carpetas faltantes en disco para los shots seleccionados">
                            <span style="font-size:0.95rem;">📁➕</span>
                        </button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="toolbar-section-group" title="Filtros Rápidos">
                <span class="toolbar-section-label">Filtros</span>
                <div class="toolbar-section-content">
                    <button class="tool-btn ${onlyMine ? 'active' : ''}" onclick="ShotNavigator.toggleOnlyMyShots()" title="Filtrar únicamente mis shots asignados">
                        <span style="font-size:1rem;">👤</span>
                    </button>
                    <button class="tool-btn" onclick="ShotNavigator.refreshWorkflow(true)" title="Recargar Workflow y Planos">
                        <img src="icons/refresh.svg" class="btn-icon-svg">
                    </button>
                </div>
            </div>

            <div class="tool-space-small"></div>

            <div class="toolbar-section-group" title="Acciones de Planos Seleccionados">
                <span class="toolbar-section-label">Workflow</span>
                <div class="toolbar-section-content">
                    <button class="tool-btn" onclick="ShotNavigator.ensureMissingFoldersForSelected()" title="Crear carpetas faltantes para los shots seleccionados">
                        <span style="font-size:0.95rem;">📁➕</span>
                    </button>
                </div>
            </div>

            <div class="tool-space-small"></div>

            <div class="toolbar-section-group" title="Herramientas de Administración">
                <span class="toolbar-section-label">Admin Tools</span>
                <div class="toolbar-section-content">
                    <button class="tool-btn" onclick="ShotNavigator.exportMyTasksFile()" title="Exportar Archivo de Tareas Asignadas (.json)">
                        <img src="icons/copy.svg" class="btn-icon-svg">
                        <span style="font-size:0.75rem; font-weight:bold; margin-left:4px;">Exportar Tareas</span>
                    </button>
                </div>
            </div>
        `;
    },
    'view-browser': () => `
        <!-- Block 1: Filtros del Explorador (Filters) -->
        <div class="toolbar-section-group" title="Filtros del Explorador">
            <span class="toolbar-section-label">Filters</span>
            <div class="toolbar-section-content">
                <!-- 1. My Tasks Filter (Icono Ramon) -->
                <button class="tool-btn ${window.explorerOnlyMyTasks ? 'active' : ''}" 
                        id="btnExplorerMyTasksFilter"
                        onclick="toggleExplorerOnlyMyTasks()" 
                        style="height:30px; min-width:30px; padding:2px 6px; ${window.explorerOnlyMyTasks ? 'background:rgba(0,188,212,0.25); border:1px solid #00bcd4;' : ''}"
                        title="Mis Tareas en Ramón (Filtrar elementos asignados a mi usuario)">
                    <img src="icons/ramon.png" style="width:20px; height:20px; object-fit:contain; vertical-align:middle; ${!window.explorerOnlyMyTasks ? 'opacity:0.4; filter:grayscale(100%);' : ''}">
                </button>

                <!-- 2. Project Filter (Embudo) -->
                <button class="tool-btn ${window.pipetaUseFilter ? 'active' : ''}" 
                        id="btnPipetaFilter"
                        onclick="togglePipetaFilter()" 
                        oncontextmenu="handleFilterContextMenu(event)"
                        style="height:30px; min-width:30px; padding:2px 6px;"
                        title="Project Filter (Mostrar solo carpetas principales del proyecto | Clic: ON/OFF | Clic-Der: Ajustar)">
                    <img src="icons/filter.svg" class="btn-icon-svg" style="width:18px; height:18px; ${!window.pipetaUseFilter ? 'opacity:0.4' : ''}">
                </button>

                <div class="tool-space-small"></div>

                <!-- 3. Search Filter (Lupa) -->
                <div style="position:relative; display:flex; align-items:center;">
                    <input type="text" 
                           id="filter-search-input" 
                           placeholder="Filtrar..." 
                           value="${window.pipetaSearchFilter || ''}"
                           oninput="handleSearchFilterInput(this.value)"
                           title="Búsqueda rápida de carpetas y archivos en la vista actual"
                           style="background:#0e141f; border:1px solid #1e2c40; color:#eee; font-size:0.80rem; border-radius:4px; padding:2px 22px 2px 8px; width:95px; height:30px; box-sizing:border-box; outline:none; transition: width 0.2s;"
                           onfocus="this.style.width='130px'; this.style.borderColor='var(--accent)';"
                           onblur="if(!this.value) { this.style.width='95px'; this.style.borderColor='#1e2c40'; }">
                    ${window.pipetaSearchFilter ? `
                        <span onclick="clearSearchFilter()" 
                              style="position:absolute; right:7px; color:#888; cursor:pointer; font-size:12px; font-weight:bold; line-height:1;" 
                              title="Limpiar filtro">✕</span>
                    ` : ''}
                </div>
            </div>
        </div>

        <div class="tool-space-small"></div>

        <!-- Block 2: View Options Unificado (Mirror + Ubicación + VS + Reload + Deep) -->
        <div class="toolbar-section-group" title="Opciones de Visualización y Comparación">
            <span class="toolbar-section-label">View Options</span>
            <div class="toolbar-section-content">
                <button class="tool-btn toolbar-mirror-btn ${typeof isMirrorMode !== 'undefined' && isMirrorMode ? 'active' : ''}" 
                        onclick="toggleMirrorMode()" 
                        title="Mirror View (Vista Espejo: Proyecto | Media)" 
                        id="btnMirrorModeTool">
                    <img src="icons/mirror.svg" class="btn-icon-svg" style="width:17px; height:17px;">
                    <span>Mirror</span>
                </button>
                
                <!-- Location Switcher: LOCAL | DRIVE | SERVER -->
                <div style="display:flex; align-items:center; background:#0e141f; border-radius:4px; padding:2px; border:1px solid #1e2c40; height:30px; box-sizing:border-box;" title="Ubicación de Exploración">
                    <button class="tool-btn ${(!window.viewLocationMode || window.viewLocationMode === 'local') ? 'active' : ''}" 
                            style="padding: 0 8px; font-size: 0.72rem; font-weight: 700; height: 24px; line-height:1;"
                            onclick="switchViewLocation('local')" title="${(typeof isExternalMachine === 'function' && isExternalMachine()) ? 'Disco Z Local' : ((typeof isZRealServer === 'function' && isZRealServer()) ? 'Disco Z (Servidor Central SMB)' : 'Disco Z Local (Copia de Trabajo / vsubst)')}">LOCAL</button>
                    
                    ${(typeof window.checkUserPermission === 'function' ? window.checkUserPermission('explorer_allow_drive') : true) ? `
                    <button class="tool-btn ${window.viewLocationMode === 'drive' ? 'active' : ''}" 
                            style="padding: 0 8px; font-size: 0.72rem; font-weight: 700; height: 24px; line-height:1; ${window.viewLocationMode === 'drive' ? 'background:#5e81ac; color:#fff;' : ''}"
                            onclick="switchViewLocation('drive')" title="Google Drive (Catálogo en la nube)">DRIVE</button>
                    ` : ''}

                    ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                    <button class="tool-btn ${window.viewLocationMode === 'server' ? 'active' : ''}" 
                            style="padding: 0 8px; font-size: 0.72rem; font-weight: 700; height: 24px; line-height:1; ${window.viewLocationMode === 'server' ? 'background:#388e3c; color:#fff;' : ''}"
                            onclick="switchViewLocation('server')" title="Servidor Central del Estudio (Catálogo Central / Worker)">SERVER</button>
                    ` : ''}
                </div>

                ${(!window.viewLocationMode || window.viewLocationMode === 'local') ? `
                <span class="toolbar-vs-pill" title="Comparar vista local contra...">vs</span>

                <div style="display:flex; align-items:center; background:#0e141f; border-radius:4px; padding:2px; border:1px solid #1e2c40; height:30px; box-sizing:border-box; gap:2px;" title="Destino de comparación">
                    ${(typeof window.checkUserPermission === 'function' ? window.checkUserPermission('explorer_allow_drive') : true) ? `
                    <button class="tool-btn ${window.syncComparisonMode === 'drive' ? 'active' : ''}" 
                            style="padding: 0 8px; font-size: 0.71rem; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; ${window.syncComparisonMode === 'drive' ? 'background:#5e81ac; color:#fff; border: 1px solid #81a1c1;' : ''}"
                            onclick="toggleSyncComparisonMode('drive')" title="Comparar contra Google Drive (Ver qué falta subir o bajar)">
                        <img src="icons/google_drive.svg" style="width:15px; height:15px; margin-right:4px; vertical-align:middle;">
                        <span>Drive</span>
                    </button>
                    ` : ''}

                    ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                    <button class="tool-btn ${window.syncComparisonMode === 'server' ? 'active' : ''}" 
                            style="padding: 0 8px; font-size: 0.71rem; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; ${window.syncComparisonMode === 'server' ? 'background:#388e3c; color:#fff; border: 1px solid #4caf50;' : ''}"
                            onclick="toggleSyncComparisonMode('server')" title="Comparar contra Servidor Central Z: (SMB StorNext) (Clic para activar/desactivar)">
                        <span style="margin-right:4px;">🗄️</span><span>Z: Server</span>
                    </button>
                    ` : ''}
                </div>
                ` : ''}

                <div class="toolbar-subsep"></div>

                <button class="tool-btn" 
                        id="btnRefreshView"
                        style="height:30px; min-width:30px; padding:2px 6px;"
                        onclick="triggerSmartViewRefresh()" 
                        title="Refrescar carpetas locales (0ms) y sincronización de catálogo">
                    <img src="icons/refresh.svg" class="btn-icon-svg" style="width:18px; height:18px;">
                </button>

                ${(!window.viewLocationMode || window.viewLocationMode === 'local') ? `
                <button class="tool-btn ${window.deepCompareMode ? 'active' : ''}" 
                        id="btn-deep-compare"
                        style="height: 30px; padding: 0 7px; gap: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.71rem; font-weight: 700; ${window.deepCompareMode ? 'background:#d08770; color:#fff; border: 1px solid #ebcb8b; box-shadow:0 0 6px rgba(208,135,112,0.4);' : ''}"
                        onclick="toggleDeepCompareMode()" 
                        title="Deep Compare: Compara peso exacto en bytes y fecha además de nombres (Clic: ON/OFF)">
                    <img src="icons/deep_compare.svg" style="width:17px; height:17px; vertical-align:middle;">
                    <span>Deep</span>
                </button>
                ` : ''}
            </div>
        </div>

        <div class="tool-space-small"></div>

        <!-- Block 3: Acciones de Archivos y Carpetas (sin título, íconos unificados) -->
        <div class="toolbar-files-strip" title="Acciones de Archivo y Carpeta">
            <button id="btn-tb-copy" class="tool-btn" onclick="contextMenu.copyToClipboard(false)" title="Copiar">
                <svg class="ico-toolbar" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button id="btn-tb-paste" class="tool-btn" onclick="contextMenu.pasteFromClipboard(selectedContextPath)" title="Pegar">
                <svg class="ico-toolbar" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
            </button>
            <button id="btn-tb-duplicate" class="tool-btn" onclick="contextMenu.duplicateItems()" title="Duplicar">
                <svg class="ico-toolbar" viewBox="0 0 24 24"><rect x="7" y="7" width="12" height="12" rx="2"/><path d="M3 13V5a2 2 0 0 1 2-2h8"/></svg>
            </button>
            <button id="btn-tb-rename" class="tool-btn" onclick="contextMenu.renameItem(selectedContextPath)" title="Renombrar">
                <svg class="ico-toolbar" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <div class="toolbar-subsep"></div>
            <button id="btn-tb-newfolder" class="tool-btn folder-accent" onclick="contextMenu.createFolder(selectedContextPath, window.selectedContextIsDir)" title="Nueva Carpeta">
                <svg class="ico-toolbar" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            </button>
            <button id="btn-tb-copypath" class="tool-btn" onclick="contextMenu.copyPath(selectedContextPath)" title="Copiar Ruta">
                <svg class="ico-toolbar" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
            <button id="btn-tb-openexplorer" class="tool-btn" onclick="contextMenu.openInExplorer(selectedContextPath)" title="Abrir en Explorer">
                <svg class="ico-toolbar" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </button>
            <div class="toolbar-subsep"></div>
            <button id="btn-tb-delete" class="tool-btn danger" onclick="contextMenu.deleteItems()" title="Borrar">
                <svg class="ico-toolbar" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>
        </div>

        ${(window.isIaIngestWindowOpen || (typeof DockManager !== 'undefined' && DockManager.isDocked('ia-ingest'))) ? getIaIngestToolbarSuiteHtml() : ''}
    `,
    'view-asset-designer': () => `
        <div class="toolbar-section-group" title="Añadir Elementos al Grafo">
            <span class="toolbar-section-label">Add Nodes</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" onclick="AssetDesigner.addNode('unit')" title="Añadir Unidad de Disco">
                    <img src="icons/hdd.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="AssetDesigner.addNode('folder')" title="Añadir Carpeta">
                    <img src="icons/new_folder.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="AssetDesigner.addNode('file')" title="Añadir Archivo">
                    <img src="icons/file.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>
        
        <div class="tool-space-small"></div>
        
        <div class="toolbar-section-group" title="Alineación en Canvas">
            <span class="toolbar-section-label">Alignment</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" onclick="AssetDesigner.alignNodesVertical()" title="Alinear en Línea Horizontal (Center Line)">
                     <img src="icons/align_horizontal.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="AssetDesigner.alignNodesHorizontal()" title="Alinear en Columna Vertical (Center Column)">
                     <img src="icons/align_vertical.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>

        <div class="tool-space-small"></div>

        <div class="toolbar-section-group" title="Auto Arrange de Nodos Seleccionados">
            <span class="toolbar-section-label">Auto Arrange</span>
            <div class="toolbar-section-content" style="display:flex; align-items:center; gap:4px;">
                <button class="tool-btn" onclick="AssetDesigner.arrangeHorizontal()" title="Alinear y espaciar horizontalmente los nodos seleccionados">
                    <span style="font-size:0.75rem; font-weight:bold;">↔ Horiz</span>
                </button>
                <input type="number" id="header-ad-gap-x" value="${(typeof AssetDesigner !== 'undefined' && AssetDesigner.arrangeGapX) ? AssetDesigner.arrangeGapX : 50}" min="0" max="500" step="5" title="Separación horizontal en px (borde exterior)" style="width:38px; background:#111; color:#fff; border:1px solid #444; border-radius:3px; padding:1px 2px; font-size:0.7rem; text-align:center; height:20px;" onchange="if(typeof AssetDesigner!=='undefined') AssetDesigner.arrangeGapX = parseInt(this.value) || 50">
                <span style="font-size:0.65rem; color:#666;">px</span>

                <button class="tool-btn" onclick="AssetDesigner.arrangeVertical()" title="Alinear y espaciar verticalmente los nodos seleccionados" style="margin-left:2px;">
                    <span style="font-size:0.75rem; font-weight:bold;">↕ Vert</span>
                </button>
                <input type="number" id="header-ad-gap-y" value="${(typeof AssetDesigner !== 'undefined' && AssetDesigner.arrangeGapY) ? AssetDesigner.arrangeGapY : 30}" min="0" max="500" step="5" title="Separación vertical en px (borde exterior)" style="width:38px; background:#111; color:#fff; border:1px solid #444; border-radius:3px; padding:1px 2px; font-size:0.7rem; text-align:center; height:20px;" onchange="if(typeof AssetDesigner!=='undefined') AssetDesigner.arrangeGapY = parseInt(this.value) || 30">
                <span style="font-size:0.65rem; color:#666;">px</span>

                <button class="tool-btn" onclick="AssetDesigner.arrangeFull()" title="Auto arrange jerárquico completo (Izquierda a Derecha / Arriba a Abajo)" style="margin-left:2px; background:rgba(33, 150, 243, 0.15); color:#64b5f6; font-weight:bold; font-size:0.75rem; padding:2px 6px;">
                    📐 Full
                </button>
            </div>
        </div>
        
        <div class="tool-space-small"></div>

        <div class="toolbar-section-group" title="Anotaciones y Elementos Cosméticos">
            <span class="toolbar-section-label">Cosmetics</span>
            <div class="toolbar-section-content" style="display:flex; align-items:center; gap:4px;">
                <button class="tool-btn" onclick="AssetDesigner.addAnnotation('text')" title="Añadir Nota / Texto Cosmético">
                    <span style="font-size:0.75rem; font-weight:bold;">🔤 Texto</span>
                </button>
                <button class="tool-btn" onclick="AssetDesigner.addAnnotation('line')" title="Añadir Línea / Flecha">
                    <span style="font-size:0.75rem; font-weight:bold;">↗️ Línea</span>
                </button>
                <button class="tool-btn" onclick="AssetDesigner.addAnnotation('shape', 'rectangle')" title="Añadir Rectángulo / Cuadro (◻)" style="min-width:28px; padding:2px 6px;">
                    <span style="font-size:0.95rem; font-weight:bold; line-height:1;">◻</span>
                </button>
                <button class="tool-btn" onclick="AssetDesigner.addAnnotation('shape', 'circle')" title="Añadir Círculo / Óvalo (◯)" style="min-width:28px; padding:2px 6px;">
                    <span style="font-size:0.95rem; font-weight:bold; line-height:1;">◯</span>
                </button>
            </div>
        </div>
        
        <div class="tool-space-small"></div>
        
        <div class="toolbar-section-group" title="Acciones de Selección">
            <span class="toolbar-section-label">Actions</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" onclick="AssetDesigner.duplicateSelected()" title="Duplicar Selección">
                    <img src="icons/duplicate.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn danger" onclick="AssetDesigner.deleteSelected()" title="Borrar Selección">
                    <img src="icons/delete.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>
    `,
    'view-shot-designer': () => `
        <div class="toolbar-section-group" title="Añadir Elementos al Grafo">
            <span class="toolbar-section-label">Add Nodes</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" onclick="ShotDesigner.addNode('unit')" title="Añadir Unidad de Disco">
                    <img src="icons/hdd.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="ShotDesigner.addNode('folder')" title="Añadir Carpeta">
                    <img src="icons/new_folder.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="ShotDesigner.addNode('file')" title="Añadir Archivo">
                    <img src="icons/file.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>
        
        <div class="tool-space-small"></div>
        
        <div class="toolbar-section-group" title="Alineación en Canvas">
            <span class="toolbar-section-label">Alignment</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" onclick="ShotDesigner.alignNodesVertical()" title="Alinear en Línea Horizontal (Center Line)">
                     <img src="icons/align_horizontal.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="ShotDesigner.alignNodesHorizontal()" title="Alinear en Columna Vertical (Center Column)">
                     <img src="icons/align_vertical.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>

        <div class="tool-space-small"></div>

        <div class="toolbar-section-group" title="Auto Arrange de Nodos Seleccionados">
            <span class="toolbar-section-label">Auto Arrange</span>
            <div class="toolbar-section-content" style="display:flex; align-items:center; gap:4px;">
                <button class="tool-btn" onclick="ShotDesigner.arrangeHorizontal()" title="Alinear y espaciar horizontalmente los nodos seleccionados">
                    <span style="font-size:0.75rem; font-weight:bold;">↔ Horiz</span>
                </button>
                <input type="number" id="header-sd-gap-x" value="${(typeof ShotDesigner !== 'undefined' && ShotDesigner.arrangeGapX) ? ShotDesigner.arrangeGapX : 50}" min="0" max="500" step="5" title="Separación horizontal en px (borde exterior)" style="width:38px; background:#111; color:#fff; border:1px solid #444; border-radius:3px; padding:1px 2px; font-size:0.7rem; text-align:center; height:20px;" onchange="if(typeof ShotDesigner!=='undefined') ShotDesigner.arrangeGapX = parseInt(this.value) || 50">
                <span style="font-size:0.65rem; color:#666;">px</span>

                <button class="tool-btn" onclick="ShotDesigner.arrangeVertical()" title="Alinear y espaciar verticalmente los nodos seleccionados" style="margin-left:2px;">
                    <span style="font-size:0.75rem; font-weight:bold;">↕ Vert</span>
                </button>
                <input type="number" id="header-sd-gap-y" value="${(typeof ShotDesigner !== 'undefined' && ShotDesigner.arrangeGapY) ? ShotDesigner.arrangeGapY : 30}" min="0" max="500" step="5" title="Separación vertical en px (borde exterior)" style="width:38px; background:#111; color:#fff; border:1px solid #444; border-radius:3px; padding:1px 2px; font-size:0.7rem; text-align:center; height:20px;" onchange="if(typeof ShotDesigner!=='undefined') ShotDesigner.arrangeGapY = parseInt(this.value) || 30">
                <span style="font-size:0.65rem; color:#666;">px</span>

                <button class="tool-btn" onclick="ShotDesigner.arrangeFull()" title="Auto arrange jerárquico completo (Izquierda a Derecha / Arriba a Abajo)" style="margin-left:2px; background:rgba(33, 150, 243, 0.15); color:#64b5f6; font-weight:bold; font-size:0.75rem; padding:2px 6px;">
                    📐 Full
                </button>
            </div>
        </div>
        
        <div class="tool-space-small"></div>

        <div class="toolbar-section-group" title="Anotaciones y Elementos Cosméticos">
            <span class="toolbar-section-label">Cosmetics</span>
            <div class="toolbar-section-content" style="display:flex; align-items:center; gap:4px;">
                <button class="tool-btn" onclick="ShotDesigner.addAnnotation('text')" title="Añadir Nota / Texto Cosmético">
                    <span style="font-size:0.75rem; font-weight:bold;">🔤 Texto</span>
                </button>
                <button class="tool-btn" onclick="ShotDesigner.addAnnotation('line')" title="Añadir Línea / Flecha">
                    <span style="font-size:0.75rem; font-weight:bold;">↗️ Línea</span>
                </button>
                <button class="tool-btn" onclick="ShotDesigner.addAnnotation('shape', 'rectangle')" title="Añadir Rectángulo / Cuadro (◻)" style="min-width:28px; padding:2px 6px;">
                    <span style="font-size:0.95rem; font-weight:bold; line-height:1;">◻</span>
                </button>
                <button class="tool-btn" onclick="ShotDesigner.addAnnotation('shape', 'circle')" title="Añadir Círculo / Óvalo (◯)" style="min-width:28px; padding:2px 6px;">
                    <span style="font-size:0.95rem; font-weight:bold; line-height:1;">◯</span>
                </button>
            </div>
        </div>
        
        <div class="tool-space-small"></div>
        
        <div class="toolbar-section-group" title="Acciones de Selección">
            <span class="toolbar-section-label">Actions</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" onclick="ShotDesigner.duplicateSelected()" title="Duplicar Selección">
                    <img src="icons/duplicate.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn danger" onclick="ShotDesigner.deleteSelected()" title="Borrar Selección">
                    <img src="icons/delete.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>
    `,
    'view-ia-ingest': () => {
        return `
        ${getIaIngestToolbarSuiteHtml()}

        <button type="button" class="tool-btn" onclick="DockManager.popoutIaIngest()" 
                style="margin-left:auto; height:30px; padding:0 12px; font-size:0.74rem; font-weight:700; background:#142233; border:1px solid rgba(0,188,212,0.55); color:#4dd0e1; border-radius:5px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; white-space:nowrap;" 
                title="Abrir IA Ingest como ventana flotante y trabajar en paralelo con el Explorer">
            <span>⧉</span><span>Abrir como Ventana</span>
        </button>
        `;
    },
    'default': () => `<span style="color:#444;">...</span>`
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

    const tabsMap = window.tabs || HEADER_VIEW_TABS;
    if (!viewId) {
        const activeBtn = document.querySelector('.mode-btn.active');
        if (activeBtn) {
            viewId = tabsMap[activeBtn.getAttribute('title')];
        }
    }

    const generator = headerToolsTemplates[viewId] || headerToolsTemplates['default'];
    container.innerHTML = typeof generator === 'function' ? generator() : generator;

    if (typeof updateToolbarFileActionsState === 'function') {
        updateToolbarFileActionsState();
    }
}

function closeAllToolbarDropdowns() {
    const menus = document.querySelectorAll('.toolbar-dropdown-menu');
    menus.forEach(m => m.classList.remove('show'));
    const dds = document.querySelectorAll('.toolbar-dropdown');
    dds.forEach(d => d.classList.remove('open'));
}

if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.toolbar-dropdown')) {
            closeAllToolbarDropdowns();
        }
    });
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', closeAllToolbarDropdowns);
    window.addEventListener('scroll', closeAllToolbarDropdowns, true);
}

window.getIaIngestToolbarSuiteHtml = getIaIngestToolbarSuiteHtml;
window.headerToolsTemplates = headerToolsTemplates;
window.handleFilterContextMenu = handleFilterContextMenu;
window.updateHeaderTools = updateHeaderTools;
window.closeAllToolbarDropdowns = closeAllToolbarDropdowns;
