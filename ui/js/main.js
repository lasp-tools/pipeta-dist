// --- TAB SWITCHING ---
const tabs = {
    'Inicio': 'view-home',
    'Explorer': 'view-browser',
    'Shot Navigator': 'view-shot-navigator',
    'Asset Designer': 'view-asset-designer',
    'Shot Designer': 'view-shot-designer',
    'IA Ingest': 'view-ia-ingest'
};

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
        <!-- Block 1: Opciones de Vista y Filtros en 2 niveles (Superior e Inferior) -->
        <div class="toolbar-stacked-container">
            <!-- Fila Superior: View Options (sin el project filter) -->
            <div class="toolbar-section-compact" title="Opciones de Visualización">
                <span class="toolbar-section-label">View Options</span>
                <div class="toolbar-section-content">
                    <div class="toolbar-dropdown" id="browserModeDropdown">
                        <button type="button" class="tool-btn" id="browserModeBtn" onclick="toggleBrowserModeDropdown(event)" title="${currentBrowserMode === 'pipeta' ? 'Vista Miller (Columnas)' : 'Vista Clásica (Split View)'}" style="display:inline-flex; align-items:center; gap:2px; padding:2px 4px; cursor:pointer;">
                            <img src="icons/${currentBrowserMode === 'pipeta' ? 'view_miller.svg' : 'view_classic.svg'}" class="btn-icon-svg" style="width:14px; height:14px; pointer-events:none;">
                            <span style="font-size:0.50rem; color:#888; margin-left:1px; line-height:1; pointer-events:none;">▾</span>
                        </button>
                        <div class="toolbar-dropdown-menu" id="browserModeDropdownMenu">
                            <button type="button" class="toolbar-dropdown-item ${(!currentBrowserMode || currentBrowserMode === 'split') ? 'active' : ''}" onclick="selectBrowserMode('split', event)" title="Vista Clásica (Split View)">
                                <img src="icons/view_classic.svg" class="btn-icon-svg" style="width:16px; height:16px; pointer-events:none;">
                            </button>
                            <button type="button" class="toolbar-dropdown-item ${currentBrowserMode === 'pipeta' ? 'active' : ''}" onclick="selectBrowserMode('pipeta', event)" title="Vista Miller (Columnas)">
                                <img src="icons/view_miller.svg" class="btn-icon-svg" style="width:16px; height:16px; pointer-events:none;">
                            </button>
                        </div>
                    </div>
                    <button class="tool-btn ${typeof isMirrorMode !== 'undefined' && isMirrorMode ? 'active' : ''}" onclick="toggleMirrorMode()" title="Mirror View (Vista Espejo)" id="btnMirrorModeTool">
                        <img src="icons/mirror.svg" class="btn-icon-svg" style="width:14px; height:14px;">
                    </button>
                    <button class="tool-btn ${window.isPropertiesPanelVisible === true ? 'active' : ''}" 
                            id="btnTogglePropertiesToolbar" 
                            onclick="togglePropertiesPanel()" 
                            title="Panel de Propiedades (Alt+P | Clic para Mostrar/Ocultar)">
                        <img src="icons/panel_properties.svg" class="btn-icon-svg" style="width:14px; height:14px; ${window.isPropertiesPanelVisible === true ? '' : 'opacity:0.4'}">
                    </button>
                    
                    <div style="width:2px"></div>
                    
                    <!-- Location Switcher: LOCAL | DRIVE | SERVER (solo habilitado si la máquina tiene acceso a red interna de estudio) -->
                    <div style="display:flex; background:#0e141f; border-radius:3px; padding:1px; border:1px solid #1e2c40;" title="Ubicación de Exploración">
                        <button class="tool-btn ${(!window.viewLocationMode || window.viewLocationMode === 'local') ? 'active' : ''}" 
                                style="padding: 1px 5px; font-size: 0.65rem; height: 16px; line-height:1;"
                                onclick="switchViewLocation('local')" title="${(typeof isExternalMachine === 'function' && isExternalMachine()) ? 'Disco Z Local' : ((typeof isZRealServer === 'function' && isZRealServer()) ? 'Disco Z (Servidor Central SMB)' : 'Disco Z Local (Copia de Trabajo / vsubst)')}">LOCAL</button>
                        <button class="tool-btn ${(window.viewLocationMode === 'drive' || window.viewLocationMode === 'online') ? 'active' : ''}" 
                                style="padding: 1px 5px; font-size: 0.65rem; height: 16px; line-height:1; ${(window.viewLocationMode === 'drive' || window.viewLocationMode === 'online') ? 'background:#5e81ac; color:#fff;' : ''}"
                                onclick="switchViewLocation('drive')" title="Google Drive (G: o Catálogo Offline en Z:\\_SYNC_CACHE)">DRIVE</button>
                        ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                        <button class="tool-btn ${window.viewLocationMode === 'server' ? 'active' : ''}" 
                                style="padding: 1px 5px; font-size: 0.65rem; height: 16px; line-height:1; ${window.viewLocationMode === 'server' ? 'background:#388e3c; color:#fff;' : ''}"
                                onclick="switchViewLocation('server')" title="Servidor Central del Estudio (Catálogo Central / Worker)">SERVER</button>
                        ` : ''}
                    </div>

                    <button class="tool-btn" onclick="refreshCurrentView()" title="Refrescar Carpetas Locales (Instantáneo - Relee disco)">
                        <img src="icons/refresh.svg" class="btn-icon-svg" style="width:14px; height:14px;">
                    </button>
                </div>
            </div>

            <!-- Fila Inferior: Filters (Project Filter + My Tasks + Search) -->
            <div class="toolbar-section-compact" title="Filtros del Explorador">
                <span class="toolbar-section-label">Filters</span>
                <div class="toolbar-section-content">
                    <!-- Project Filter (Embudo) -->
                    <button class="tool-btn ${window.pipetaUseFilter ? 'active' : ''}" 
                            onclick="togglePipetaFilter()" 
                            oncontextmenu="handleFilterContextMenu(event)"
                            title="Project Filter (Mostrar solo carpetas principales del proyecto | Clic: ON/OFF | Clic-Der: Ajustar)">
                        <img src="icons/filter.svg" class="btn-icon-svg" style="width:13px; height:13px; ${!window.pipetaUseFilter ? 'opacity:0.4' : ''}">
                    </button>

                    <!-- My Tasks Filter (Icono Ramon + Tooltip) -->
                    <button class="tool-btn ${window.explorerOnlyMyTasks ? 'active' : ''}" 
                            id="btnExplorerMyTasksFilter"
                            onclick="toggleExplorerOnlyMyTasks()" 
                            style="${window.explorerOnlyMyTasks ? 'background:rgba(0,188,212,0.25); border:1px solid #00bcd4;' : ''}"
                            title="Mis Tareas en Ramón (Filtrar elementos asignados a mi usuario)">
                        <img src="icons/ramon.png" style="width:14px; height:14px; object-fit:contain; vertical-align:middle; ${!window.explorerOnlyMyTasks ? 'opacity:0.4; filter:grayscale(100%);' : ''}">
                    </button>

                    <div class="tool-space-small"></div>

                    <!-- Search Filter (Lupa) -->
                    <div style="position:relative; display:flex; align-items:center;">
                        <input type="text" 
                               id="filter-search-input" 
                               placeholder="Filtrar..." 
                               value="${window.pipetaSearchFilter || ''}"
                               oninput="handleSearchFilterInput(this.value)"
                               title="Búsqueda rápida de carpetas y archivos en la vista actual"
                               style="background:#0e141f; border:1px solid #1e2c40; color:#eee; font-size:0.75rem; border-radius:3px; padding:1px 18px 1px 5px; width:90px; height:16px; outline:none; transition: width 0.2s;"
                               onfocus="this.style.width='130px'; this.style.borderColor='var(--accent)';"
                               onblur="if(!this.value) { this.style.width='90px'; this.style.borderColor='#1e2c40'; }">
                        ${window.pipetaSearchFilter ? `
                            <span onclick="clearSearchFilter()" 
                                  style="position:absolute; right:4px; color:#888; cursor:pointer; font-size:10px; font-weight:bold; line-height:1;" 
                                  title="Limpiar filtro">✕</span>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>

        <div class="tool-space-small"></div>

        <!-- Block 1.5: Comparación y Auditoría Cloud / Server -->
        ${(!window.viewLocationMode || window.viewLocationMode === 'local') ? `
        <div class="toolbar-section-group" title="Comparar archivos locales contra catálogo Drive o Servidor central">
            <span class="toolbar-section-label">Comparar</span>
            <div class="toolbar-section-content">
                <button class="tool-btn ${window.syncComparisonMode === 'drive' ? 'active' : ''}" 
                        style="padding: 2px 8px; font-size: 0.70rem; height: auto; ${window.syncComparisonMode === 'drive' ? 'background:#5e81ac; color:#fff; border: 1px solid #81a1c1;' : ''}"
                        onclick="toggleSyncComparisonMode('drive')" title="Comparar contra Google Drive (Clic para activar/desactivar)">☁️ DRIVE</button>
                ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                <button class="tool-btn ${window.syncComparisonMode === 'server' ? 'active' : ''}" 
                        style="padding: 2px 8px; font-size: 0.70rem; height: auto; ${window.syncComparisonMode === 'server' ? 'background:#388e3c; color:#fff; border: 1px solid #4caf50;' : ''}"
                        onclick="toggleSyncComparisonMode('server')" title="Comparar contra Servidor Central (Clic para activar/desactivar)">🗄️ SERVER</button>
                ` : ''}
                ${(window.syncComparisonMode && window.syncComparisonMode !== 'off') ? `
                <button class="tool-btn" 
                        style="padding: 2px 6px; font-size: 0.70rem; height: auto; margin-left:2px; background:#223042;" 
                        onclick="refreshSyncCatalogManual()" title="Refrescar catálogo en caché (${window.syncComparisonMode === 'server' ? 'Servidor' : 'Google Drive'})">🔄</button>
                ` : ''}
            </div>
        </div>

        <div class="tool-space-small"></div>
        ` : ''}

        <!-- Block 2: Acciones de Archivos y Carpetas (Centro) -->
        <div class="toolbar-section-group" title="Acciones de Archivo y Carpeta">
            <span class="toolbar-section-label">File / Folder Functions</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" onclick="contextMenu.copyToClipboard(false)" title="Copiar">
                    <img src="icons/copy.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="contextMenu.pasteFromClipboard(selectedContextPath)" title="Pegar">
                    <img src="icons/paste.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="contextMenu.duplicateItems()" title="Duplicar">
                    <img src="icons/duplicate.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="contextMenu.renameItem(selectedContextPath)" title="Renombrar">
                    <img src="icons/rename.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="contextMenu.createFolder(selectedContextPath, window.selectedContextIsDir)" title="Nueva Carpeta">
                    <img src="icons/new_folder.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn danger" onclick="contextMenu.deleteItems()" title="Borrar">
                    <img src="icons/delete.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="contextMenu.copyPath(selectedContextPath)" title="Copiar Ruta">
                    <img src="icons/copy_path.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" onclick="contextMenu.openInExplorer(selectedContextPath)" title="Abrir en Explorer">
                    <img src="icons/open_explorer.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>
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
    'view-ia-ingest': () => `
        <div class="toolbar-section-group" title="Modo de Operación IA">
            <span class="toolbar-section-label">IA Mode</span>
            <div class="toolbar-section-content">
                <div style="display:flex; background:#0e141f; border-radius:4px; padding:2px; border:1px solid #1e2c40;">
                    <button class="tool-btn ${window.iaWorkMode !== 'simple' ? 'active' : ''}" 
                            style="padding: 2px 8px; font-size: 0.72rem; height: auto;"
                            onclick="switchIaWorkMode('advanced')" title="Modo Avanzado (Builder modular, tokens y cola por lotes)">ADVANCED</button>
                    <button class="tool-btn ${window.iaWorkMode === 'simple' ? 'active' : ''}" 
                            style="padding: 2px 8px; font-size: 0.72rem; height: auto;"
                            onclick="switchIaWorkMode('simple')" title="Modo Simple (Flujo rápido simplificado)">SIMPLE</button>
                </div>
            </div>
        </div>

        <div class="tool-space-small"></div>

        <div class="toolbar-section-group" title="Acciones de Archivo y Carpeta">
            <span class="toolbar-section-label">File / Folder Functions</span>
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
    `,
    'default': () => `<span style="color:#444;">...</span>`
};

// --- APP LIFECYCLE ---

function showOverlay(msg, subMsg) {
    const ov = document.getElementById('app-overlay');
    if (ov) {
        document.getElementById('app-overlay-msg').innerText = msg;
        document.getElementById('app-overlay-sub').innerText = subMsg || "";
        ov.style.display = 'flex';
    }
}

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
        const viewId = tabs[btn.getAttribute('title')];
        if (viewId) switchView(viewId);
    });
});

// --- ROLE PERMISSIONS & ACCESS CONTROL ---
window.checkUserPermission = (permKey) => {
    const uData = window.cachedUsersData || settings?.usersData;
    if (!uData) return true;
    const active = uData.activeUser || 'admin';
    const user = (uData.users || []).find(u => u.username === active || u.laspUser === active || u.id === active);
    if (!user) return true;
    if (user.role === 'admin' || user.username === 'admin') return true; // Full admin access
    const role = (uData.roles || []).find(r => r.id === user.role);
    if (!role || !role.permissions) return true;
    return role.permissions[permKey] !== false;
};

window.applyRolePermissionsToUI = async () => {
    try {
        const uData = await API.users.get();
        window.cachedUsersData = uData;
        const active = uData.activeUser || 'admin';
        const user = (uData.users || []).find(u => u.username === active || u.laspUser === active || u.id === active);
        const isAdmin = user?.role === 'admin' || user?.username === 'admin';
        const role = (uData.roles || []).find(r => r.id === (user?.role || 'user'));

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
                let allowed = isAdmin;
                if (!allowed && role?.permissions) {
                    if (reqPerm === 'access_tool_creator') {
                        allowed = (role.permissions.access_tool_asset_creator !== false || role.permissions.access_tool_shot_creator !== false);
                    } else {
                        allowed = role.permissions[reqPerm] !== false;
                    }
                } else if (!allowed) {
                    allowed = true;
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
            const allowed = isAdmin || (role?.permissions ? role.permissions[pKey] !== false : true);
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

    // 2b. Set Default Browser Mode (Classic Split vs Miller)
    const initialBrowserMode = (settings && settings.defaultBrowserMode)
        ? settings.defaultBrowserMode
        : (localStorage.getItem('pipeta_browser_mode') || 'split');
    if (typeof switchBrowserMode === 'function') {
        switchBrowserMode(initialBrowserMode);
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
    updateDiskMonitor();
    setInterval(updateDiskMonitor, 30000); // Every 30s

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
        const uData = await API.users.get();
        window.cachedUsersData = uData;
        const select = document.getElementById('headerUserSelect');
        const avatar = document.getElementById('headerUserAvatar');
        if (!select || !uData) return;
        
        const active = uData.activeUser || 'admin';
        const activeObj = (uData.users || []).find(u => u.username === active || u.laspUser === active || u.id === active);
        const isActiveAdmin = activeObj?.username === 'admin' || activeObj?.id === 'u_admin' || (activeObj?.isSystem && activeObj?.role === 'admin');
        const isActiveRamon = !isActiveAdmin && (activeObj?.authSource === 'ramon' || (activeObj?.laspUser && activeObj?.laspUser.startsWith('lasp-')));
        if (avatar) {
            avatar.innerHTML = '';
            avatar.style.background = activeObj?.avatarColor || (isActiveRamon ? '#00bcd4' : '#ff9800');
        }
        
        const usersHtml = (uData.users || []).map(u => {
            const isSystemAdmin = u.username === 'admin' || u.id === 'u_admin' || (u.isSystem && u.role === 'admin');
            const isRamon = !isSystemAdmin && (u.authSource === 'ramon' || (u.laspUser && u.laspUser.startsWith('lasp-')));
            const val = (isRamon && u.laspUser) ? u.laspUser : (u.username || u.laspUser || u.id);
            const userTag = isRamon ? ' [Ramón]' : (isSystemAdmin ? ' [Local]' : '');
            const cleanLast = (u.lastName || '').replace(/_+$/, '').trim();
            const fullName = (!isSystemAdmin && u.firstName) ? ` (${u.firstName}${cleanLast ? ' ' + cleanLast : ''})` : '';
            const label = `${val}${fullName}${userTag}`;
            const isSelected = (val === active || u.username === active || u.laspUser === active);
            return `<option value="${val}" ${isSelected ? 'selected' : ''}>${label}</option>`;
        }).join('');

        const actionsHtml = `
            <option disabled value="">───────────────</option>
            <option value="__RAMON_LOGIN__">🌐 + Iniciar Sesión con Ramón...</option>
        `;

        select.innerHTML = usersHtml + actionsHtml;
    } catch(e) {
        console.warn("Could not load users for header selector:", e);
    }
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

function toggleBrowserModeDropdown(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    const menu = document.getElementById('browserModeDropdownMenu');
    const btn = document.getElementById('browserModeBtn') || (e && e.currentTarget);
    if (!menu || !btn) return;

    const isOpen = menu.classList.contains('show');
    closeAllToolbarDropdowns();

    if (!isOpen) {
        const rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = rect.left + 'px';
        menu.style.zIndex = '999999';
        menu.classList.add('show');
    }
}

function selectBrowserMode(mode, e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    closeAllToolbarDropdowns();
    if (typeof switchBrowserMode === 'function') {
        switchBrowserMode(mode);
    }
}

function closeAllToolbarDropdowns() {
    const menus = document.querySelectorAll('.toolbar-dropdown-menu');
    menus.forEach(m => m.classList.remove('show'));
    const dds = document.querySelectorAll('.toolbar-dropdown');
    dds.forEach(d => d.classList.remove('open'));
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#browserModeDropdown') && !e.target.closest('#browserModeDropdownMenu')) {
        closeAllToolbarDropdowns();
    }
});

window.addEventListener('resize', closeAllToolbarDropdowns);
window.addEventListener('scroll', closeAllToolbarDropdowns, true);

window.toggleBrowserModeDropdown = toggleBrowserModeDropdown;
window.selectBrowserMode = selectBrowserMode;
window.closeAllToolbarDropdowns = closeAllToolbarDropdowns;

// Shortcuts
window.addEventListener('keydown', (e) => {
    // Alt+P: Alternar Panel de Propiedades
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (typeof togglePropertiesPanel === 'function') {
            togglePropertiesPanel();
        }
    }
});

// Start
document.addEventListener('DOMContentLoaded', () => initApp());
