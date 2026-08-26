// --- TAB SWITCHING ---
const tabs = {
    'Inicio': 'view-home',
    'Explorer': 'view-browser',
    'Shot Navigator': 'view-shot-navigator',
    'Asset Designer': 'view-asset-designer',
    'Shot Designer': 'view-shot-designer',
    'IA Ingest': 'view-ia-ingest',
    'Check In/Out': 'view-check'
};

// --- DYNAMIC HEADER TOOLS ---
const headerToolsTemplates = {
    'view-home': () => `<!-- No tools for home -->`,
    'view-shot-navigator': () => `
        <div class="toolbar-section-group" title="Filtros Rápidos">
            <span class="toolbar-section-label">Filtros</span>
            <div class="toolbar-section-content">
                <button class="tool-btn ${typeof ShotNavigator !== 'undefined' && ShotNavigator.onlyMyShots ? 'active' : ''}" onclick="ShotNavigator.toggleOnlyMyShots()" title="Filtrar únicamente mis shots asignados">
                    <span style="font-size:1rem;">👤</span>
                </button>
                <button class="tool-btn" onclick="ShotNavigator.loadWorkflow().then(() => ShotNavigator.render())" title="Recargar Workflow y Planos">
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
    `,
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
        <!-- Block 1: Vistas y Navegación -->
        <div class="toolbar-section-group" title="Opciones de Visualización">
            <span class="toolbar-section-label">View Options</span>
            <div class="toolbar-section-content">
                <button class="tool-btn ${currentBrowserMode === 'split' ? 'active' : ''}" onclick="switchBrowserMode('split')" title="Vista Clásica (Árbol)">
                    <img src="icons/view_classic.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn ${currentBrowserMode === 'pipeta' ? 'active' : ''}" onclick="switchBrowserMode('pipeta')" title="Vista Miller (Columnas)">
                    <img src="icons/view_miller.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn ${window.pipetaUseFilter ? 'active' : ''}" 
                        onclick="togglePipetaFilter()" 
                        oncontextmenu="handleFilterContextMenu(event)"
                        title="Project Filter (Mostrar solo carpetas principales del proyecto | Clic: ON/OFF | Clic-Der: Ajustar)">
                    <img src="icons/filter.svg" class="btn-icon-svg" style="${!window.pipetaUseFilter ? 'opacity:0.4' : ''}">
                </button>
                <button class="tool-btn ${typeof isMirrorMode !== 'undefined' && isMirrorMode ? 'active' : ''}" onclick="toggleMirrorMode()" title="Mirror View (Vista Espejo)" id="btnMirrorModeTool">
                    <img src="icons/mirror.svg" class="btn-icon-svg">
                </button>
                
                <div style="width:3px"></div>
                
                <!-- Local/Online Switcher -->
                <div style="display:flex; background:#0e141f; border-radius:4px; padding:2px; border:1px solid #1e2c40;">
                    <button class="tool-btn ${window.viewLocationMode === 'local' ? 'active' : ''}" 
                            style="padding: 2px 8px; font-size: 0.72rem; height: auto;"
                            onclick="switchViewLocation('local')" title="Rutas Locales (Z:)">LOCAL</button>
                    <button class="tool-btn ${window.viewLocationMode === 'online' ? 'active' : ''}" 
                            style="padding: 2px 8px; font-size: 0.72rem; height: auto;"
                            onclick="switchViewLocation('online')" title="Rutas Online (G:)">ONLINE</button>
                </div>

                <button class="tool-btn" onclick="refreshCurrentView()" title="Refrescar Carpeta">
                    <img src="icons/refresh.svg" class="btn-icon-svg">
                </button>
            </div>
        </div>

        <div class="tool-space-small"></div>

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

        <div class="tool-space-small"></div>

        <!-- Block 3: Custom Tools / Pipeline (Derecha) -->
        <div class="toolbar-section-group" title="Herramientas del Pipeline">
            <span class="toolbar-section-label">Tools</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" data-perm-tool="access_tool_naming_validator" onclick="if(window.checkUserPermission('access_tool_naming_validator')) window.toggleValidator(); else alert('🔒 Acceso restringido: Tu rol no tiene permiso para Naming Validator.');" title="Naming Validator">
                    <img src="icons/scanning-scan-svgrepo-com.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" data-perm-tool="access_tool_sync_analyze" onclick="if(window.checkUserPermission('access_tool_sync_analyze')) toggleSyncAnalyzer(); else alert('🔒 Acceso restringido: Tu rol no tiene permiso para Sync Analyzer.');" title="Sync Analyzer (Local ↔ Online)">
                    <img src="icons/sync-analyzer.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" data-perm-tool="access_tool_file_auditor" onclick="if(window.checkUserPermission('access_tool_file_auditor')) toggleFileAuditor(); else alert('🔒 Acceso restringido: Tu rol no tiene permiso para File Auditor.');" title="File Auditor (Mirror & Render Status)" id="btnFileAuditorTool">
                    <img src="icons/file-auditor.svg" class="btn-icon-svg">
                </button>
                <button class="tool-btn" data-perm-tool="access_tool_asset_creator" onclick="if(window.checkUserPermission('access_tool_asset_creator')) AssetCreator.open(); else alert('🔒 Acceso restringido: Tu rol no tiene permiso para Asset Creator.');" title="Asset Creator">
                    <img src="icons/asset_creator.svg" class="btn-icon-svg btn-icon-orange">
                </button>
                <button class="tool-btn" data-perm-tool="access_tool_shot_creator" onclick="if(window.checkUserPermission('access_tool_shot_creator')) ShotCreator.open(); else alert('🔒 Acceso restringido: Tu rol no tiene permiso para Shot Creator.');" title="Shot Creator">
                    <img src="icons/asset_creator.svg" class="btn-icon-svg">
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
    'view-check': () => `
        <div class="toolbar-section-group" title="Control de Versiones">
            <span class="toolbar-section-label">Version Control</span>
            <div class="toolbar-section-content">
                <button class="tool-btn" title="Sync">🔄 Sync</button>
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
            'IA Ingest': 'access_ia_ingest'
        };

        document.querySelectorAll('.sidebar-top .mode-btn').forEach(btn => {
            const title = btn.getAttribute('title');
            const reqPerm = sidebarMap[title];
            if (reqPerm) {
                const allowed = isAdmin || (role?.permissions ? role.permissions[reqPerm] !== false : true);
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
    const initialMode = settings && settings.config && settings.config.defaultViewMode
        ? settings.config.defaultViewMode
        : 'local';

    // Set global mode (without triggering refesh yet)
    window.viewLocationMode = initialMode;

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
}

// --- HEADER USER SWITCHER ---
window.handleHeaderUserSwitch = async (userVal) => {
    try {
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
        await updateHeaderUserSelector();
        await applyRolePermissionsToUI();
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
        if (avatar) avatar.style.background = activeObj?.avatarColor || '#ff9800';
        
        select.innerHTML = (uData.users || []).map(u => {
            const val = u.username || u.laspUser || u.id;
            const label = u.firstName ? `${u.username || u.laspUser} (${u.firstName} ${u.lastName})` : (u.username || u.laspUser);
            return `<option value="${val}" ${val === active ? 'selected' : ''}>${label}</option>`;
        }).join('');
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

        const monitorEl = document.getElementById('disk-monitor');
        if (monitorEl && data.available) {
            const badge = document.createElement('span');
            badge.className = 'rclone-badge';
            badge.title = `Rclone ${data.version} disponible — Sync acelerado activo`;
            badge.innerText = '⚡';
            // Insert after the bars (flex row handles positioning)
            monitorEl.appendChild(badge);
        }
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

// Start
document.addEventListener('DOMContentLoaded', () => initApp());
