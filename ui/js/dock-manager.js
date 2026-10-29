/**
 * Pipeta DockManager
 * Permite acoplar y desacoplar ventanas y herramientas (Sync Queue, Ramón, Naming Validator,
 * Sync Analyzer, File Auditor, Creator e IA Ingest) al lateral derecho del Explorer canvas
 * con soporte para pestañas múltiples, redimensionamiento interactivo y detección magnética (Snap).
 */

class DockManagerClass {
    constructor() {
        this.dockedList = []; // Lista de IDs de módulos acoplados
        this.activeId = null;  // ID del módulo activo en la pestaña visible
        this.originalStyles = new Map();
        this.originalParents = new Map();
        this.isGhostActive = false;
        this.draggedModuleId = null;
        this.defaultWidth = 460;
        this.minWidth = 320;
        this.maxWidth = 1800;
        this.isResizing = false;

        this.modules = {
            'sync-queue': {
                id: 'sync-queue',
                title: 'Sync Queue',
                icon: '⚡',
                isEmoji: true,
                getEl: () => document.getElementById('sync-queue-window'),
                ensureOpen: () => {
                    if (window.syncQueueUI) {
                        if (!window.syncQueueUI.isVisible) window.syncQueueUI.show();
                    }
                },
                close: () => {
                    if (window.syncQueueUI) window.syncQueueUI.close();
                }
            },
            'validator': {
                id: 'validator',
                title: 'Naming Validator',
                icon: 'icons/scanning-scan-svgrepo-com.svg',
                isEmoji: false,
                getEl: () => document.getElementById('validator-window'),
                ensureOpen: () => {
                    if (typeof window.toggleValidator === 'function') {
                        const el = document.getElementById('validator-window');
                        if (!el || el.style.display === 'none') window.toggleValidator();
                    }
                },
                close: () => {
                    const el = document.getElementById('validator-window');
                    if (el) el.style.display = 'none';
                    if (window.namingValidator) window.namingValidator.isVisible = false;
                }
            },
            'file-auditor': {
                id: 'file-auditor',
                title: 'File Auditor',
                icon: 'icons/file-auditor.svg',
                isEmoji: false,
                getEl: () => document.getElementById('file-auditor-window'),
                ensureOpen: () => {
                    if (window.fileAuditor) {
                        if (!window.fileAuditor.isVisible) window.fileAuditor.show();
                    } else if (typeof toggleFileAuditor === 'function') {
                        toggleFileAuditor();
                    }
                },
                close: () => {
                    if (window.fileAuditor) window.fileAuditor.close();
                }
            },
            'sync-analyzer': {
                id: 'sync-analyzer',
                title: 'Sync Analyzer',
                icon: 'icons/sync-analyzer.svg',
                isEmoji: false,
                getEl: () => document.getElementById('sync-analyzer-window'),
                ensureOpen: () => {
                    if (typeof toggleSyncAnalyzer === 'function') {
                        const el = document.getElementById('sync-analyzer-window');
                        if (!el || el.style.display === 'none') toggleSyncAnalyzer();
                    }
                },
                close: () => {
                    if (window.syncAnalyzer) window.syncAnalyzer.close();
                }
            },
            'ramon-tasks': {
                id: 'ramon-tasks',
                title: 'Mis Tareas (Ramón)',
                icon: 'icons/ramon.png',
                isEmoji: false,
                getEl: () => document.getElementById('ramonTasksModal'),
                ensureOpen: () => {
                    if (typeof Ramon !== 'undefined' && Ramon.openMyTasksModal) {
                        Ramon.openMyTasksModal();
                    }
                },
                close: () => {
                    if (typeof Ramon !== 'undefined' && Ramon.hideMyTasksModal) {
                        Ramon.hideMyTasksModal();
                    } else {
                        const el = document.getElementById('ramonTasksModal');
                        if (el) el.style.display = 'none';
                    }
                }
            },
            'asset-creator': {
                id: 'asset-creator',
                title: 'Asset Creator',
                icon: 'icons/asset_creator.svg',
                isEmoji: false,
                getEl: () => document.getElementById('asset-creator-window'),
                ensureOpen: () => {
                    if (window.CreatorWindow) window.CreatorWindow.open('asset');
                },
                close: () => {
                    const el = document.getElementById('asset-creator-window');
                    if (el) el.style.display = 'none';
                }
            },
            'shot-creator': {
                id: 'shot-creator',
                title: 'Shot Creator',
                icon: 'icons/asset_creator.svg',
                isEmoji: false,
                getEl: () => document.getElementById('shot-creator-window'),
                ensureOpen: () => {
                    if (window.CreatorWindow) window.CreatorWindow.open('shot');
                },
                close: () => {
                    const el = document.getElementById('shot-creator-window');
                    if (el) el.style.display = 'none';
                }
            },
            'ia-ingest': {
                id: 'ia-ingest',
                title: 'IA Ingest',
                icon: 'icons/chip-ai.svg',
                isEmoji: false,
                getEl: () => document.getElementById('ia-ingest-window'),
                ensureOpen: () => {
                    if (!window.isIaIngestWindowOpen) {
                        this.popoutIaIngest();
                    }
                },
                close: () => {
                    this.closeIaIngestWindow();
                }
            }
        };

        this.init();
    }

    init() {
        // Inicializar listeners del resizer y snap ghost
        this.setupResizer();
        this.setupSnapGhost();

        // Escanear periódicamente encabezados de ventanas para inyectar botón de Dock rápido
        this.setupHeaderDragTracking();
        setInterval(() => this.setupHeaderDragTracking(), 1200);
    }

    setupResizer() {
        const resizer = document.getElementById('app-dock-resizer');
        const panel = document.getElementById('app-dock-panel');
        if (!resizer || !panel) return;

        let startX = 0;
        let startWidth = 0;

        const onMouseMove = (e) => {
            if (!this.isResizing) return;
            const deltaX = startX - e.clientX;
            let newWidth = startWidth + deltaX;
            const currentMax = Math.max(900, window.innerWidth - 260);
            if (newWidth < this.minWidth) newWidth = this.minWidth;
            if (newWidth > currentMax) newWidth = currentMax;
            panel.style.width = newWidth + 'px';
        };

        const onMouseUp = () => {
            if (this.isResizing) {
                this.isResizing = false;
                resizer.classList.remove('is-resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                try {
                    localStorage.setItem('pipeta_dock_width', panel.offsetWidth);
                } catch (e) {}
            }
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        resizer.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            resizer.classList.add('is-resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        resizer.addEventListener('dblclick', () => {
            panel.style.width = this.defaultWidth + 'px';
            try {
                localStorage.setItem('pipeta_dock_width', this.defaultWidth);
            } catch (e) {}
        });
    }

    setupSnapGhost() {
        // Setup listener global para drag de modales
        window.addEventListener('mousemove', (e) => {
            if (!this.draggedModuleId) return;

            // Si está a menos de 100px del borde derecho
            const threshold = window.innerWidth - 100;
            if (e.clientX >= threshold) {
                this.showSnapGhost(true);
            } else {
                this.showSnapGhost(false);
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.draggedModuleId) {
                if (this.isGhostActive) {
                    const modId = this.draggedModuleId;
                    this.showSnapGhost(false);
                    this.draggedModuleId = null;
                    this.dock(modId);
                } else {
                    this.showSnapGhost(false);
                    this.draggedModuleId = null;
                }
            }
        });
    }

    showSnapGhost(show) {
        const ghost = document.getElementById('app-dock-ghost');
        if (!ghost) return;
        this.isGhostActive = show;
        ghost.style.display = show ? 'block' : 'none';
    }

    startDragTracking(moduleId) {
        this.draggedModuleId = moduleId;
    }

    setupHeaderDragTracking() {
        for (const [modId, mod] of Object.entries(this.modules)) {
            const el = mod.getEl();
            if (!el) continue;

            // Hookear mousedown en el header para detectar Snap si se arrastra hacia el borde derecho
            const header = el.querySelector('.validator-header') || el.querySelector('.ramon-modal-header');
            if (header && !header.dataset.dockHooked) {
                header.dataset.dockHooked = 'true';
                header.addEventListener('mousedown', (e) => {
                    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
                    if (!this.isDocked(modId)) {
                        this.startDragTracking(modId);
                    }
                });
            }
        }
    }

    isDocked(moduleId) {
        return this.dockedList.includes(moduleId);
    }

    toggleDock(moduleId) {
        if (this.isDocked(moduleId)) {
            this.undock(moduleId);
        } else {
            this.dock(moduleId);
        }
    }

    dock(moduleId) {
        const mod = this.modules[moduleId];
        if (!mod) return;

        mod.ensureOpen();
        const el = mod.getEl();
        if (!el) {
            setTimeout(() => this.dock(moduleId), 100);
            return;
        }

        // Si ya está acoplado, simplemente enfocar su pestaña
        if (this.isDocked(moduleId)) {
            this.setActiveTab(moduleId);
            return;
        }

        // 1. Guardar estilos y contenedor original
        if (!this.originalStyles.has(moduleId)) {
            this.originalStyles.set(moduleId, {
                position: el.style.position || '',
                top: el.style.top || '',
                left: el.style.left || '',
                right: el.style.right || '',
                bottom: el.style.bottom || '',
                width: el.style.width || '',
                height: el.style.height || '',
                maxWidth: el.style.maxWidth || '',
                maxHeight: el.style.maxHeight || '',
                zIndex: el.style.zIndex || '',
                boxShadow: el.style.boxShadow || '',
                border: el.style.border || '',
                borderRadius: el.style.borderRadius || '',
                resize: el.style.resize || ''
            });
            this.originalParents.set(moduleId, el.parentNode);
        }

        // 2. Mover elemento al dock content area
        const dockArea = document.getElementById('dock-content-area');
        const dockPanel = document.getElementById('app-dock-panel');
        const dockResizer = document.getElementById('app-dock-resizer');
        if (!dockArea || !dockPanel || !dockResizer) return;

        dockArea.appendChild(el);
        el.classList.add('is-docked');
        el.style.display = 'flex';

        // 3. Registrar en lista de acoplados y fijar como activo
        this.dockedList.push(moduleId);
        this.activeId = moduleId;

        // 4. Mostrar panel y divisor
        dockPanel.style.display = 'flex';
        dockResizer.style.display = 'block';

        // Restaurar ancho guardado si existe
        const savedW = localStorage.getItem('pipeta_dock_width');
        if (savedW) dockPanel.style.width = savedW + 'px';

        // 5. Renderizar pestañas
        this.renderTabs();
        this.updateActiveContent();
        if (moduleId === 'ia-ingest' && typeof updateHeaderTools === 'function') {
            updateHeaderTools('view-browser');
        }

        // 6. Mensaje en consola si existe
        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('system', `⇲ Módulo '${mod.title}' acoplado al panel lateral derecho.`, 'info');
        }
    }

    undock(moduleId) {
        const mod = this.modules[moduleId];
        if (!mod || !this.isDocked(moduleId)) return;

        const el = mod.getEl();
        if (el) {
            el.classList.remove('is-docked');
            el.classList.remove('active-dock-content');

            // Restaurar contenedor original
            const origParent = this.originalParents.get(moduleId) || document.body;
            origParent.appendChild(el);

            // Restaurar estilos guardados
            const st = this.originalStyles.get(moduleId);
            if (st) {
                el.style.position = st.position;
                el.style.top = st.top;
                el.style.left = st.left;
                el.style.right = st.right;
                el.style.bottom = st.bottom;
                el.style.width = st.width;
                el.style.height = st.height;
                el.style.maxWidth = st.maxWidth;
                el.style.maxHeight = st.maxHeight;
                el.style.zIndex = st.zIndex;
                el.style.boxShadow = st.boxShadow;
                el.style.border = st.border;
                el.style.borderRadius = st.borderRadius;
                el.style.resize = st.resize;
            }
        }

        // Remover de la lista
        this.dockedList = this.dockedList.filter(id => id !== moduleId);

        // Si era el activo, cambiar al último disponible
        if (this.activeId === moduleId) {
            this.activeId = this.dockedList.length > 0 ? this.dockedList[this.dockedList.length - 1] : null;
        }

        const dockPanel = document.getElementById('app-dock-panel');
        const dockResizer = document.getElementById('app-dock-resizer');

        // Si no quedan módulos acoplados, ocultar panel y divisor
        if (this.dockedList.length === 0) {
            if (dockPanel) dockPanel.style.display = 'none';
            if (dockResizer) dockResizer.style.display = 'none';
        } else {
            this.renderTabs();
            this.updateActiveContent();
        }

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('system', `⧉ Módulo '${mod.title}' desacoplado a ventana flotante.`, 'info');
        }
    }

    undockActive() {
        if (this.activeId) {
            this.undock(this.activeId);
        }
    }

    closeActive() {
        if (this.activeId) {
            const modId = this.activeId;
            const mod = this.modules[modId];
            this.undock(modId);
            if (mod && mod.close) mod.close();
        }
    }

    setActiveTab(moduleId) {
        if (!this.isDocked(moduleId)) return;
        this.activeId = moduleId;
        this.renderTabs();
        this.updateActiveContent();
    }

    updateActiveContent() {
        for (const modId of this.dockedList) {
            const mod = this.modules[modId];
            if (!mod) continue;
            const el = mod.getEl();
            if (el) {
                if (modId === this.activeId) {
                    el.classList.add('active-dock-content');
                    el.style.display = 'flex';
                } else {
                    el.classList.remove('active-dock-content');
                    el.style.display = 'none';
                }
            }
        }
    }

    renderTabs() {
        const tabsContainer = document.getElementById('dock-tabs-list');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = '';

        for (const modId of this.dockedList) {
            const mod = this.modules[modId];
            if (!mod) continue;

            const isActive = modId === this.activeId;
            const tab = document.createElement('div');
            tab.className = `dock-tab ${isActive ? 'active' : ''}`;
            tab.title = `${mod.title} (Clic: seleccionar | Doble clic: desacoplar)`;

            // Icono
            let iconHtml = '';
            if (mod.isEmoji) {
                iconHtml = `<span class="dock-tab-icon">${mod.icon}</span>`;
            } else {
                iconHtml = `<span class="dock-tab-icon"><img src="${mod.icon}"></span>`;
            }

            tab.innerHTML = `
                ${iconHtml}
                <span>${mod.title}</span>
                <button class="dock-tab-btn-mini" title="Desacoplar a ventana flotante" onclick="event.stopPropagation(); window.DockManager.undock('${modId}')">⧉</button>
                <button class="dock-tab-btn-mini danger" title="Cerrar módulo" onclick="event.stopPropagation(); window.DockManager.closeModule('${modId}')">✕</button>
            `;

            tab.onclick = () => this.setActiveTab(modId);
            tab.ondblclick = () => this.undock(modId);

            tabsContainer.appendChild(tab);
        }
    }

    closeModule(moduleId) {
        const mod = this.modules[moduleId];
        this.undock(moduleId);
        if (mod && mod.close) mod.close();
    }

    // --- IA INGEST WINDOW & DOCK SYSTEM ---

    popoutIaIngest() {
        const view = document.getElementById('view-ia-ingest');
        const win = document.getElementById('ia-ingest-window');
        const body = document.getElementById('ia-ingest-window-body');
        const topBar = document.getElementById('ia-view-top-bar');
        if (!view || !win || !body) return;

        if (topBar) topBar.style.display = 'none';
        view.classList.remove('view-section');
        body.appendChild(view);
        view.style.display = 'flex';
        win.style.display = 'flex';
        win.style.zIndex = '2100';
        window.isIaIngestWindowOpen = true;

        // Switchear de fondo al módulo Explorer automáticamente
        if (typeof switchView === 'function') {
            switchView('view-browser');
        }
        const explorerBtn = document.querySelector('.mode-btn[title="Explorer"]');
        if (explorerBtn) {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            explorerBtn.classList.add('active');
        }

        // Forzar actualización de la barra de herramientas del Explorer para incluir IA
        if (typeof updateHeaderTools === 'function') {
            updateHeaderTools('view-browser');
        }

        if (typeof updateIaResolution === 'function') {
            updateIaResolution();
        }
    }

    restoreIaIngestToView() {
        if (this.isDocked('ia-ingest')) {
            this.undock('ia-ingest');
        }
        const view = document.getElementById('view-ia-ingest');
        const win = document.getElementById('ia-ingest-window');
        const topBar = document.getElementById('ia-view-top-bar');
        const contentArea = document.querySelector('.content-area');
        if (!view || !contentArea) return;

        if (topBar) topBar.style.display = 'flex';
        view.classList.add('view-section');
        contentArea.appendChild(view);
        if (win) win.style.display = 'none';
        window.isIaIngestWindowOpen = false;

        const iaBtn = document.querySelector('.mode-btn[title="IA Ingest"]');
        if (iaBtn) {
            iaBtn.click();
        } else if (typeof switchView === 'function') {
            switchView('view-ia-ingest');
        }

        if (typeof updateHeaderTools === 'function') {
            updateHeaderTools('view-ia-ingest');
        }
    }

    closeIaIngestWindow() {
        if (this.isDocked('ia-ingest')) {
            this.undock('ia-ingest');
        }
        const view = document.getElementById('view-ia-ingest');
        const win = document.getElementById('ia-ingest-window');
        const topBar = document.getElementById('ia-view-top-bar');
        const contentArea = document.querySelector('.content-area');
        if (view && contentArea) {
            if (topBar) topBar.style.display = 'flex';
            view.classList.add('view-section');
            contentArea.appendChild(view);
            view.style.display = 'none';
        }
        if (win) win.style.display = 'none';
        window.isIaIngestWindowOpen = false;

        if (typeof updateHeaderTools === 'function') {
            updateHeaderTools('view-browser');
        }
    }

    startIaIngestDrag(e) {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
        const win = document.getElementById('ia-ingest-window');
        if (!win || this.isDocked('ia-ingest')) return;

        win.style.zIndex = '2100';
        const startX = e.clientX;
        const startY = e.clientY;
        const initialLeft = win.offsetLeft;
        const initialTop = win.offsetTop;

        const onMouseMove = (ev) => {
            win.style.left = (initialLeft + (ev.clientX - startX)) + 'px';
            win.style.top = (initialTop + (ev.clientY - startY)) + 'px';
            win.style.right = 'auto';
            if (!this.isDocked('ia-ingest')) {
                if (ev.clientX >= window.innerWidth - 100) {
                    this.showSnapGhost(true);
                } else {
                    this.showSnapGhost(false);
                }
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (this.isGhostActive) {
                this.showSnapGhost(false);
                this.dock('ia-ingest');
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}

// Instancia global
window.DockManager = new DockManagerClass();
