// --- TAB SWITCHING ---
const tabs = {
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

    <!-- IA MODE (ADVANCED / SIMPLE) -->
    <div class="toolbar-section-group" title="Modo de Operación IA">
        <span class="toolbar-section-label">IA Mode</span>
        <div class="toolbar-section-content">
            <div style="display:flex; background:#0e141f; border-radius:4px; padding:2px; border:1px solid #1e2c40;">
                <button class="tool-btn ${window.iaWorkMode !== 'simple' ? 'active' : ''}" 
                        style="padding: 0 8px; font-size: 0.72rem; height: 24px; display: inline-flex; align-items: center;"
                        onclick="switchIaWorkMode('advanced')" title="Modo Avanzado (Builder modular, tokens y cola por lotes)">ADVANCED</button>
                <button class="tool-btn ${window.iaWorkMode === 'simple' ? 'active' : ''}" 
                        style="padding: 0 8px; font-size: 0.72rem; height: 24px; display: inline-flex; align-items: center;"
                        onclick="switchIaWorkMode('simple')" title="Modo Simple (Flujo rápido simplificado)">SIMPLE</button>
            </div>
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
    'view-asset-designer': () => `
        <div class="toolbar-section-group" title="Añadir Elementos al Árbol">
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
    'view-browser': () => `
        <!-- Block 1: Filtros del Explorador (Filters) -->
        <div class="toolbar-section-group" title="Filtros del Explorador">
            <span class="toolbar-section-label">Filters</span>
            <div class="toolbar-section-content">
                <!-- 1. My Tasks Filter (Icono Ramon) -->
                <button class="tool-btn ${window.explorerOnlyMyTasks ? 'active' : ''}" 
                        id="btnExplorerMyTasksFilter"
                        onclick="toggleExplorerOnlyMyTasks()" 
                        style="height:32px; min-width:32px; padding:2px 6px; ${window.explorerOnlyMyTasks ? 'background:rgba(0,188,212,0.25); border:1px solid #00bcd4;' : ''}"
                        title="Mis Tareas en Ramón (Filtrar elementos asignados a mi usuario)">
                    <img src="icons/ramon.png" style="width:22px; height:22px; object-fit:contain; vertical-align:middle; ${!window.explorerOnlyMyTasks ? 'opacity:0.4; filter:grayscale(100%);' : ''}">
                </button>

                <!-- 2. Project Filter (Embudo) -->
                <button class="tool-btn ${window.pipetaUseFilter ? 'active' : ''}" 
                        id="btnPipetaFilter"
                        onclick="togglePipetaFilter()" 
                        oncontextmenu="handleFilterContextMenu(event)"
                        style="height:32px; min-width:32px; padding:2px 6px;"
                        title="Project Filter (Mostrar solo carpetas principales del proyecto | Clic: ON/OFF | Clic-Der: Ajustar)">
                    <img src="icons/filter.svg" class="btn-icon-svg" style="width:20px; height:20px; ${!window.pipetaUseFilter ? 'opacity:0.4' : ''}">
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
                           style="background:#0e141f; border:1px solid #1e2c40; color:#eee; font-size:0.80rem; border-radius:4px; padding:2px 22px 2px 8px; width:95px; height:32px; box-sizing:border-box; outline:none; transition: width 0.2s;"
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

        <!-- Block 2: Opciones de Visualización (View Options) -->
        <div class="toolbar-section-group" title="Opciones de Visualización">
            <span class="toolbar-section-label">View Options</span>
            <div class="toolbar-section-content">
                <button class="tool-btn ${typeof isMirrorMode !== 'undefined' && isMirrorMode ? 'active' : ''}" 
                        onclick="toggleMirrorMode()" 
                        style="height:32px; min-width:32px; padding:2px 6px;"
                        title="Mirror View (Vista Espejo: Proyecto | Media)" 
                        id="btnMirrorModeTool">
                    <img src="icons/mirror.svg" class="btn-icon-svg" style="width:20px; height:20px;">
                </button>
                
                <div style="width:2px"></div>
                
                <!-- Location Switcher: LOCAL | DRIVE | SERVER -->
                <div style="display:flex; align-items:center; background:#0e141f; border-radius:4px; padding:2px; border:1px solid #1e2c40; height:32px; box-sizing:border-box;" title="Ubicación de Exploración">
                    <button class="tool-btn ${(!window.viewLocationMode || window.viewLocationMode === 'local') ? 'active' : ''}" 
                            style="padding: 0 8px; font-size: 0.74rem; font-weight: 700; height: 26px; line-height:1;"
                            onclick="switchViewLocation('local')" title="${(typeof isExternalMachine === 'function' && isExternalMachine()) ? 'Disco Z Local' : ((typeof isZRealServer === 'function' && isZRealServer()) ? 'Disco Z (Servidor Central SMB)' : 'Disco Z Local (Copia de Trabajo / vsubst)')}">LOCAL</button>
                    
                    ${(typeof window.checkUserPermission === 'function' ? window.checkUserPermission('explorer_allow_drive') : true) ? `
                    <button class="tool-btn ${window.viewLocationMode === 'drive' ? 'active' : ''}" 
                            style="padding: 0 8px; font-size: 0.74rem; font-weight: 700; height: 26px; line-height:1; ${window.viewLocationMode === 'drive' ? 'background:#5e81ac; color:#fff;' : ''}"
                            onclick="switchViewLocation('drive')" title="Google Drive (Catálogo en la nube)">DRIVE</button>
                    ` : ''}

                    ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                    <button class="tool-btn ${window.viewLocationMode === 'server' ? 'active' : ''}" 
                            style="padding: 0 8px; font-size: 0.74rem; font-weight: 700; height: 26px; line-height:1; ${window.viewLocationMode === 'server' ? 'background:#388e3c; color:#fff;' : ''}"
                            onclick="switchViewLocation('server')" title="Servidor Central del Estudio (Catálogo Central / Worker)">SERVER</button>
                    ` : ''}
                </div>

                <button class="tool-btn" 
                        style="height:32px; min-width:32px; padding:2px 6px;"
                        onclick="refreshCurrentView()" 
                        title="Reload folders">
                    <img src="icons/refresh.svg" class="btn-icon-svg" style="width:20px; height:20px;">
                </button>
            </div>
        </div>

        <div class="tool-space-small"></div>

        <!-- Block 3: Comparación y Auditoría Cloud / Server (Comparar) -->
        ${(!window.viewLocationMode || window.viewLocationMode === 'local') ? `
        <div class="toolbar-section-group" title="Comparar archivos locales contra catálogo Drive o Servidor central">
            <span class="toolbar-section-label">Comparar</span>
            <div class="toolbar-section-content">
                
                ${(typeof window.checkUserPermission === 'function' ? window.checkUserPermission('explorer_allow_drive') : true) ? `
                <button class="tool-btn ${window.syncComparisonMode === 'drive' ? 'active' : ''}" 
                        style="padding: 0 9px; font-size: 0.72rem; height: 32px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; ${window.syncComparisonMode === 'drive' ? 'background:#5e81ac; color:#fff; border: 1px solid #81a1c1;' : ''}"
                        onclick="toggleSyncComparisonMode('drive')" title="Comparar contra Google Drive (Ver qué falta subir o bajar)">
                    <img src="icons/google_drive.svg" style="width:17px; height:17px; margin-right:5px; vertical-align:middle;">
                    <span>DRIVE</span>
                </button>
                ` : ''}

                ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                <button class="tool-btn ${window.syncComparisonMode === 'server' ? 'active' : ''}" 
                        style="padding: 0 9px; font-size: 0.72rem; height: 32px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; margin-left:2px; ${window.syncComparisonMode === 'server' ? 'background:#388e3c; color:#fff; border: 1px solid #4caf50;' : ''}"
                        onclick="toggleSyncComparisonMode('server')" title="Comparar contra Servidor Central (Clic para activar/desactivar)">
                    <span style="margin-right:4px;">🗄️</span><span>SERVER</span>
                </button>
                ` : ''}
                <button class="tool-btn ${window.deepCompareMode ? 'active' : ''}" 
                        id="btn-deep-compare"
                        style="height: 32px; min-width: 32px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; margin-left:2px; ${window.deepCompareMode ? 'background:#d08770; color:#fff; font-weight:bold; border: 1px solid #ebcb8b; box-shadow:0 0 6px rgba(208,135,112,0.4);' : ''}"
                        onclick="toggleDeepCompareMode()" 
                        title="Deep Compare: Compara peso exacto en bytes y fecha además de nombres (Clic: ON/OFF)">
                    <img src="icons/deep_compare.svg" style="width:20px; height:20px; vertical-align:middle;">
                </button>
                ${(window.syncComparisonMode && window.syncComparisonMode !== 'off') ? `
                <button class="tool-btn" 
                        style="height: 32px; min-width: 32px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; margin-left:2px;" 
                        onclick="refreshSyncCatalogManual()" title="Reload cache">
                    <img src="icons/cache_reload.svg" style="width:20px; height:20px; vertical-align:middle;">
                </button>
                ` : ''}
            </div>
        </div>

        <div class="tool-space-small"></div>
        ` : ''}

        <!-- Block 4: Acciones de Archivos y Carpetas (File / Folder) -->
        <div class="toolbar-section-group" title="Acciones de Archivo y Carpeta">
            <span class="toolbar-section-label">File / Folder</span>
            <div class="toolbar-section-content">
                <button id="btn-tb-copy" class="tool-btn" onclick="contextMenu.copyToClipboard(false)" title="Copiar">
                    <img src="icons/copy.svg" class="btn-icon-svg">
                </button>
                <button id="btn-tb-paste" class="tool-btn" onclick="contextMenu.pasteFromClipboard(selectedContextPath)" title="Pegar">
                    <img src="icons/paste.svg" class="btn-icon-svg">
                </button>
                <button id="btn-tb-duplicate" class="tool-btn" onclick="contextMenu.duplicateItems()" title="Duplicar">
                    <img src="icons/duplicate.svg" class="btn-icon-svg">
                </button>
                <button id="btn-tb-rename" class="tool-btn" onclick="contextMenu.renameItem(selectedContextPath)" title="Renombrar">
                    <img src="icons/rename.svg" class="btn-icon-svg">
                </button>
                <button id="btn-tb-newfolder" class="tool-btn" onclick="contextMenu.createFolder(selectedContextPath, window.selectedContextIsDir)" title="Nueva Carpeta">
                    <img src="icons/new_folder.svg" class="btn-icon-svg">
                </button>
                <button id="btn-tb-delete" class="tool-btn danger" onclick="contextMenu.deleteItems()" title="Borrar">
                    <img src="icons/delete.svg" class="btn-icon-svg">
                </button>
                <button id="btn-tb-copypath" class="tool-btn" onclick="contextMenu.copyPath(selectedContextPath)" title="Copiar Ruta">
                    <img src="icons/copy_path.svg" class="btn-icon-svg">
                </button>
                <button id="btn-tb-openexplorer" class="tool-btn" onclick="contextMenu.openInExplorer(selectedContextPath)" title="Abrir en Explorer">
                    <img src="icons/open_explorer.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>

        ${(window.isIaIngestWindowOpen || (typeof DockManager !== 'undefined' && DockManager.isDocked('ia-ingest'))) ? getIaIngestToolbarSuiteHtml() : ''}
    `,    'view-asset-designer': () => `
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

        <div class="tool-space-small"></div>

        <div class="toolbar-section-group" title="Acciones de Archivo y Carpeta">
            <span class="toolbar-section-label">File / Folder</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" onclick="copyCanonicalName()" title="Copiar Nombre Canónico">
                    <img src="icons/copy.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="copyCanonicalPath()" title="Copiar Ruta de Destino">
                    <img src="icons/copy_path.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="openTargetFolder()" title="Abrir Carpeta de Destino en Explorer">
                    <img src="icons/open_explorer.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>
        `;
    },
    'default': () => `<span style="color:#444;">...</span>`
};

// --- APP LIFECYCLE ---

function showOverlay(msg, subMsg) {
    const ov = document.getElementById('app-overlay');
    if (ov) {
        const msgEl = document.getElementById('app-overlay-msg');
        const subEl = document.getElementById('app-overlay-sub');
        const spinner = ov.querySelector('.spinner-large');
        if (msgEl) msgEl.innerText = msg;
        if (subEl) subEl.innerText = subMsg || "";
        if (spinner) {
            spinner.style.borderTopColor = 'var(--accent)';
            spinner.style.animation = 'spin 1s linear infinite';
        }
        ov.style.display = 'flex';
    }
}

function hideOverlay() {
    const ov = document.getElementById('app-overlay');
    if (ov) {
        ov.style.display = 'none';
    }
}

window.showOverlay = showOverlay;
window.hideOverlay = hideOverlay;

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

    if (!viewId) {
        const activeBtn = document.querySelector('.mode-btn.active');
        if (activeBtn) {
            viewId = tabs[activeBtn.getAttribute('title')];
        }
    }

    // Get template generator
    const generator = headerToolsTemplates[viewId] || headerToolsTemplates['default'];

    // Execute if function, else use string (legacy support if needed, but we converted all)
    container.innerHTML = typeof generator === 'function' ? generator() : generator;

    if (typeof updateToolbarFileActionsState === 'function') {
        updateToolbarFileActionsState();
    }
}

function switchView(viewId) {
    // Permission check for views
    const viewPermMap = {
        'view-browser': 'access_explorer',
        'view-shot-navigator': 'access_shot_navigator',
        'view-asset-designer': 'access_asset_designer',
        'view-shot-designer': 'access_shot_designer',
        'view-ia-ingest': 'access_ia_ingest'
    };
    const reqPerm = viewPermMap[viewId];
    if (reqPerm && !window.checkUserPermission(reqPerm)) {
        alert("🔒 Acceso Restringido: Tu rol de usuario no tiene permisos para acceder a esta sección.");
        return;
    }

    // 0. Si las configuraciones están abiertas, cerrarlas para ver el nuevo módulo
    if (typeof settings !== 'undefined' && settings.isVisible) {
        settings.close();
    }
    // Si Sync Queue está abierto (especialmente en modo maximizado canvas), cerrarlo para ver el nuevo módulo
    if (window.syncQueueUI && window.syncQueueUI.isVisible && window.syncQueueUI.isMaximized) {
        window.syncQueueUI.close();
    }
    // Si Sync Analyzer está abierto (especialmente en modo maximizado canvas), cerrarlo para ver el nuevo módulo
    if (window.syncAnalyzer && window.syncAnalyzer.isVisible && window.syncAnalyzer.isMaximized) {
        window.syncAnalyzer.close();
    }
    // Si File Auditor está abierto (especialmente en modo maximizado canvas), cerrarlo para ver el nuevo módulo
    if (window.fileAuditor && window.fileAuditor.isVisible && window.fileAuditor.isMaximized) {
        window.fileAuditor.close();
    }

    // 1. Update Buttons State
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const btnView = tabs[btn.getAttribute('title')];
        if (btnView === viewId) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    document.getElementById('btn-settings-toggle')?.classList.remove('active');

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
        if (viewId === 'view-shot-navigator') {
            if (typeof ShotNavigator !== 'undefined') ShotNavigator.init();
        }
        if (viewId === 'view-asset-designer' && typeof AssetDesigner !== 'undefined') {
            if (!AssetDesigner.initialized) {
                AssetDesigner.init();
                AssetDesigner.initialized = true;
            } else {
                AssetDesigner.renderUI();
                AssetDesigner.renderCanvas();
                AssetDesigner.updateSidebar();
            }
        }
        if (viewId === 'view-shot-designer' && typeof ShotDesigner !== 'undefined') {
            if (!ShotDesigner.initialized) {
                ShotDesigner.init();
                ShotDesigner.initialized = true;
            } else {
                ShotDesigner.renderUI();
                ShotDesigner.renderCanvas();
                ShotDesigner.updateSidebar();
            }
        }
        if (viewId === 'view-ia-ingest') {
            if (typeof initIaIngest === 'function') initIaIngest();
            else if (typeof updateIaResolution === 'function') updateIaResolution();
            if (typeof switchIaWorkMode === 'function') switchIaWorkMode(window.iaWorkMode || 'simple');
        }
    }

    // 4. Update Toolbar
    updateHeaderTools(viewId);
    if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
}

window.toggleCanvasFullscreen = () => {
    document.body.classList.toggle('canvas-fullscreen');
    const isFull = document.body.classList.contains('canvas-fullscreen');
    try {
        localStorage.setItem('pipeta_canvas_fullscreen', isFull ? 'true' : 'false');
    } catch(e){}
};

// Check saved fullscreen preference
if (localStorage.getItem('pipeta_canvas_fullscreen') === 'true') {
    document.body.classList.add('canvas-fullscreen');
}

// Bind Click Events
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.id !== 'sidebarTransferQueueBtn' && window.syncQueueUI && window.syncQueueUI.isVisible && window.syncQueueUI.isMaximized) {
            window.syncQueueUI.close();
        }
        if (btn.getAttribute('title') !== 'Sync Analyzer' && window.syncAnalyzer && window.syncAnalyzer.isVisible && window.syncAnalyzer.isMaximized) {
            window.syncAnalyzer.close();
        }
        if (btn.id !== 'btnFileAuditorTool' && window.fileAuditor && window.fileAuditor.isVisible && window.fileAuditor.isMaximized) {
            window.fileAuditor.close();
        }
        const viewId = tabs[btn.getAttribute('title')];
        if (viewId) switchView(viewId);
    });
});

// --- ROLE PERMISSIONS & ACCESS CONTROL ---
window.checkUserPermission = (permKey) => {
    const uData = window.cachedUsersData || settings?.usersData;
    if (!uData) return true;

    // Resolve active user identity (from Ramon session or config)
    let active = uData.activeUser;
    if (!active && window.Ramon?.session?.user) {
        active = window.Ramon.session.user.login || window.Ramon.session.user.username;
    }
    if (!active) active = 'admin';

    const user = (uData.users || []).find(u => 
        u.username === active || 
        u.laspUser === active || 
        (u.laspUser && u.laspUser.replace('lasp-', '') === active) ||
        u.id === active
    );
    if (!user) return true;
    if (user.role === 'admin' || user.username === 'admin') return true; // Full admin access

    // 1. Explicit user-level override takes highest priority
    if (user.permissionOverrides && typeof user.permissionOverrides[permKey] === 'boolean') {
        return user.permissionOverrides[permKey];
    }

    // 2. Role permissions fallback
    const role = (uData.roles || []).find(r => r.id === user.role);
    if (!role || !role.permissions) return true;
    return role.permissions[permKey] !== false;
};

window.applyRolePermissionsToUI = async () => {
    try {
        const uData = await API.users.get();
        window.cachedUsersData = uData;

        // 1. Sidebar Buttons
        const sidebarMap = {
            'Explorer': 'access_explorer',
            'Shot Navigator': 'access_shot_navigator',
            'Asset Designer': 'access_asset_designer',
            'Shot Designer': 'access_shot_designer',
            'IA Ingest': 'access_ia_ingest',
            'Naming Validator': 'access_tool_naming_validator',
            'Sync Analyzer': 'access_tool_sync_analyze',
            'File Auditor': 'access_tool_file_auditor',
            'Creator': 'access_tool_creator'
        };

        document.querySelectorAll('.mode-sidebar .mode-btn').forEach(btn => {
            const title = btn.getAttribute('title');
            const reqPerm = sidebarMap[title];
            if (reqPerm) {
                let allowed = true;
                if (reqPerm === 'access_tool_creator') {
                    allowed = window.checkUserPermission('access_tool_asset_creator') || window.checkUserPermission('access_tool_shot_creator');
                } else {
                    allowed = window.checkUserPermission(reqPerm);
                }
                if (allowed) {
                    btn.style.opacity = '1';
                    btn.style.filter = 'none';
                    btn.style.pointerEvents = 'auto';
                    btn.removeAttribute('data-disabled-by-role');
                } else {
                    btn.style.opacity = '0.22';
                    btn.style.filter = 'grayscale(1) brightness(0.7)';
                    btn.style.pointerEvents = 'none';
                    btn.setAttribute('data-disabled-by-role', 'true');
                }
            }
        });

        // 2. Header Tools
        document.querySelectorAll('[data-perm-tool]').forEach(el => {
            const pKey = el.getAttribute('data-perm-tool');
            const allowed = window.checkUserPermission(pKey);
            if (allowed) {
                el.style.opacity = '1';
                el.style.filter = 'none';
                el.style.pointerEvents = 'auto';
            } else {
                el.style.opacity = '0.22';
                el.style.filter = 'grayscale(1) brightness(0.7)';
                el.style.pointerEvents = 'none';
            }
        });

        // 3. Drive Explorer Permissions (explorer_allow_drive)
        const canDrive = window.checkUserPermission('explorer_allow_drive');
        if (!canDrive) {
            if (window.viewLocationMode === 'drive' || window.viewLocationMode === 'online') {
                if (typeof switchViewLocation === 'function') switchViewLocation('local');
            }
            if (window.syncComparisonMode === 'drive') {
                if (typeof toggleSyncComparisonMode === 'function') {
                    toggleSyncComparisonMode('server');
                } else {
                    window.syncComparisonMode = 'off';
                }
            }
        }

        // 4. Presets Publish Buttons (presets_allow_publish)
        const canPublishPresets = window.checkUserPermission('presets_allow_publish');
        document.querySelectorAll('button[onclick*="openExportPresetsTab"]').forEach(b => {
            b.style.display = canPublishPresets ? '' : 'none';
        });

        // 5. Higgsfield AI Ingest Restrictions (ia_ingest_allow_higgsfield)
        const canHiggsfield = window.checkUserPermission('ia_ingest_allow_higgsfield');
        const hfBtn = document.getElementById('iaHfItemToggleBtn');
        if (hfBtn) {
            hfBtn.style.display = canHiggsfield ? '' : 'none';
        }
        document.querySelectorAll('button[onclick*="handleForceHiggsfieldOnSelected"]').forEach(b => {
            b.style.display = canHiggsfield ? '' : 'none';
        });
        document.querySelectorAll('select option[value="auto_hf"], select option[value="HFMC"]').forEach(opt => {
            opt.disabled = !canHiggsfield;
            opt.hidden = !canHiggsfield;
        });

    } catch(e) {
        console.warn("Could not apply role permissions:", e);
    }
};

// --- INIT ---
fetch('/api/version').then(r => r.json()).then(d => {
    if (d.version) {
        window.APP_VERSION = d.version;
        const el = document.getElementById('appVersion');
        if (el) el.innerText = d.version;
    }
});

// Initialize Browser Component
async function initApp() {
    // 1. Load Settings (Projects, Configs)
    if (typeof settings !== 'undefined') {
        await settings.init();
    }

    // Init Inspector (Presets)
    if (typeof Inspector !== 'undefined') {
        Inspector.init();
    }

    // 2. Set Default View Mode (from config if available)
    const initialMode = (settings && settings.defaultViewMode)
        ? (settings.defaultViewMode === 'online' ? 'drive' : settings.defaultViewMode)
        : (localStorage.getItem('pipeta_view_location_mode') || 'local');

    // Set global mode (without triggering refresh yet)
    window.viewLocationMode = initialMode;

    // 2b. Set Default Browser Mode (Always Split View)
    window.currentBrowserMode = 'split';
    if (typeof switchBrowserMode === 'function') {
        switchBrowserMode('split');
    }

    // 2c. Set Default Sync Comparison Mode (Drive vs Server)
    const initialCompMode = (settings && settings.defaultSyncComparisonMode)
        ? settings.defaultSyncComparisonMode
        : (localStorage.getItem('pipeta_sync_comparison_mode') || 'drive');
    window.syncComparisonMode = initialCompMode;

    // 3. Init Browser (will use window.viewLocationMode)
    await initBrowser();

    // 4. Set Default View (Fixes overlap issues on load)
    switchView('view-browser');

    // 5. Force UI Update for Toggle Button
    updateHeaderTools('view-browser');

    // 6. Start Disk Monitor
    // Disk monitor disabled


    // 7. Check Rclone Status
    checkRcloneStatus();

    // 8. Init Header User Selector and Permissions
    await updateHeaderUserSelector();
    await applyRolePermissionsToUI();

    // 9. Init Ramon session
    if (typeof Ramon !== 'undefined') Ramon.init();
}

// --- HEADER USER SWITCHER ---
window.handleHeaderUserSwitch = async (userVal) => {
    try {
        if (userVal === '__RAMON_LOGIN__') {
            await updateHeaderUserSelector();
            if (typeof Ramon !== 'undefined' && typeof Ramon.showLoginModal === 'function') {
                Ramon.showLoginModal('ramon');
            }
            return;
        }
        if (userVal === '__LOCAL_LOGIN__') {
            await updateHeaderUserSelector();
            if (typeof Ramon !== 'undefined' && typeof Ramon.showLoginModal === 'function') {
                Ramon.showLoginModal('local');
            }
            return;
        }

        const uData = await API.users.get();
        const targetUser = (uData.users || []).find(u => u.username === userVal || u.laspUser === userVal || u.id === userVal);
        
        // If switching to an admin user, require authentication unless already remembered
        if (targetUser && targetUser.role === 'admin') {
            const isUnlocked = localStorage.getItem('pipeta_admin_unlocked') === 'true';
            if (!isUnlocked) {
                const pass = prompt(`🔒 Ingrese la contraseña de Administrador para cambiar al usuario ${targetUser.username || targetUser.firstName || userVal}:`);
                if (!pass) {
                    updateHeaderUserSelector();
                    return;
                }
                const authRes = await API.users.verifyAdmin(pass);
                if (!authRes || !authRes.authorized) {
                    alert("❌ Contraseña de Administrador incorrecta.");
                    updateHeaderUserSelector();
                    return;
                }
                const remember = confirm("¿Deseas recordar la sesión de Administrador en este equipo?");
                if (remember) {
                    try { localStorage.setItem('pipeta_admin_unlocked', 'true'); } catch(e){}
                }
            }
        }
        
        const activeKey = targetUser ? (targetUser.username || targetUser.laspUser || targetUser.id) : userVal;
        await API.users.setActive(activeKey);
        window.cachedUsersData = null;
        if (typeof ShotNavigator !== 'undefined') {
            ShotNavigator.activeUser = activeKey;
            ShotNavigator.render();
        }
        const isTargetAdmin = targetUser?.username === 'admin' || targetUser?.id === 'u_admin' || (targetUser?.isSystem && targetUser?.role === 'admin');
        const isTargetRamon = !isTargetAdmin && (targetUser?.authSource === 'ramon' || (targetUser?.laspUser && targetUser?.laspUser.startsWith('lasp-')));
        if (typeof Ramon !== 'undefined') {
            if (!isTargetRamon) {
                Ramon.session = {
                    mode: 'local',
                    user: {
                        login: activeKey,
                        username: activeKey,
                        display_name: targetUser?.firstName ? `${targetUser.firstName} ${targetUser.lastName || ''}`.trim() : activeKey,
                        role: targetUser?.role || (isTargetAdmin ? 'admin' : 'user')
                    },
                    timestamp: new Date().toISOString()
                };
                try { localStorage.setItem('pipeta_session', JSON.stringify(Ramon.session)); } catch(e){}
            }
        }
        await updateHeaderUserSelector();
        if (typeof Ramon !== 'undefined' && typeof Ramon.applySessionToHeader === 'function') {
            Ramon.applySessionToHeader();
        }
        await applyRolePermissionsToUI();
        if (typeof updateHeaderTools === 'function') {
            updateHeaderTools();
        }
        if (typeof ShotNavigator !== 'undefined' && ShotNavigator.initialized) {
            await ShotNavigator.loadDependencies(true);
            if (ShotNavigator.isRamonMode()) {
                await ShotNavigator.loadWorkflow(true);
            }
            ShotNavigator.render();
        }
    } catch(e) {
        console.error("Error switching user:", e);
        alert("Error al cambiar usuario: " + e.message);
    }
};

window.updateHeaderUserSelector = async () => {
    try {
        if (typeof Ramon !== 'undefined' && typeof Ramon.applySessionToHeader === 'function') {
            Ramon.applySessionToHeader();
        }
    } catch(e) {}
};

// --- RCLONE STATUS ---
async function checkRcloneStatus() {
    try {
        const res = await fetch('/api/rclone/status');
        const data = await res.json();
        window.rcloneStatus = data; // Store globally for settings UI
    } catch (e) { /* silent */ }
}

// --- DISK USAGE MONITOR ---
function toggleDiskMonitor() {
    const monitor = document.getElementById('disk-monitor');
    const btn = document.getElementById('btnToggleDisks');
    if (!monitor) return;
    const isHidden = monitor.style.display === 'none' || getComputedStyle(monitor).display === 'none';
    if (isHidden) {
        monitor.style.display = 'flex';
        if (btn) btn.classList.add('active');
        if (typeof updateDiskMonitor === 'function') updateDiskMonitor();
    } else {
        monitor.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}
window.toggleDiskMonitor = toggleDiskMonitor;

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

function toggleFileAuditor() {
    if (window.fileAuditor) {
        window.fileAuditor.toggle();
    }
}

function toggleMirrorAuditor() {
    toggleFileAuditor();
}

// Miller View removed - standard Split View is permanent

function closeAllToolbarDropdowns() {
    const menus = document.querySelectorAll('.toolbar-dropdown-menu');
    menus.forEach(m => m.classList.remove('show'));
    const dds = document.querySelectorAll('.toolbar-dropdown');
    dds.forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.toolbar-dropdown') && !e.target.closest('#browserModeDropdownMenu')) {
        closeAllToolbarDropdowns();
    }
});

window.addEventListener('resize', closeAllToolbarDropdowns);
window.addEventListener('scroll', closeAllToolbarDropdowns, true);

window.toggleBrowserModeDropdown = function() {};
window.selectBrowserMode = function() {};
window.closeAllToolbarDropdowns = closeAllToolbarDropdowns;

// Shortcuts
window.addEventListener('keydown', (e) => {
// Alt+P removed (Properties panel retired)
});

// Start
document.addEventListener('DOMContentLoaded', () => initApp());


// Live Reconnect & Auto-Reload on Server Restart / Reinstall
(function setupLiveServerWatcher() {
    let initialBootTime = null;
    let lastKnownConfigSync = null;

    async function pingServer() {
        try {
            const res = await fetch('/api/version', { 
                cache: 'no-store',
                signal: AbortSignal.timeout(5000) 
            });
            if (res.ok) {
                const data = await res.json();
                const currentBoot = data.serverBootTime || data.version;
                if (initialBootTime === null) {
                    initialBootTime = currentBoot;
                    lastKnownConfigSync = data.lastConfigSync || 0;
                } else if (initialBootTime && data.serverBootTime && initialBootTime !== data.serverBootTime) {
                    console.log('[PIPETA] Servidor local reiniciado / actualizado. Recargando pestaña activa...');
                    window.location.reload();
                    return;
                }

                // Detectar actualización de configuraciones en caliente
                if (lastKnownConfigSync !== null && data.lastConfigSync && data.lastConfigSync > lastKnownConfigSync) {
                    lastKnownConfigSync = data.lastConfigSync;
                    console.log('[PIPETA] ⚙️ Configuraciones maestras sincronizadas en caliente.');
                    if (window.PipetaConsole && typeof PipetaConsole.push === 'function') {
                        PipetaConsole.push('info', '⚙️ Configuraciones de proyectos, permisos y usuarios actualizadas desde el servidor central.');
                    }
                    if (typeof applyRolePermissionsToUI === 'function') {
                        applyRolePermissionsToUI();
                    }
                }
            }
        } catch (e) {
            // Server busy - do not trigger page reload
        }
    }

    setInterval(pingServer, 5000);
    setTimeout(pingServer, 1000);
})();
