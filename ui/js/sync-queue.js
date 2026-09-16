// ================================================================
// PIPETA SYNC QUEUE UI — Monitor de Transferencias en Vivo
// Muestra el estado del Worker de la VM 105 y las órdenes activas.
// ================================================================

class SyncQueueUI {
    constructor() {
        this.isVisible = false;
        this.activeTab = 'active'; // 'active' | 'history'
        this.orders = [];
        this.workerStatus = null;
        this.pollingInterval = null;
        this.prevOrderStates = new Map();
        this.prevWorkerAlive = null;
        this.isMaximized = false; // Por defecto siempre ventana flotante al abrir Pipeta
        this.prevBounds = null;

        window.syncQueueUI = this;
        this.init();
    }

    init() {
        this.renderWindow();
        this.startPolling();
    }

    startPolling() {
        this.fetchStatus();
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        // Polling cada 3 segundos
        this.pollingInterval = setInterval(() => this.fetchStatus(), 3000);
    }

    async fetchStatus() {
        try {
            // 1. Worker status
            const resWorker = await fetch('/api/sync/worker-status').then(r => r.json()).catch(() => null);
            if (resWorker && resWorker.success) {
                this.workerStatus = resWorker.status;
            }

            // 2. Orders list
            const resOrders = await fetch('/api/sync/orders').then(r => r.json()).catch(() => null);
            if (resOrders && resOrders.success) {
                this.orders = resOrders.orders || [];
            }

            // Detect & log worker state transitions
            const isAlive = !!(this.workerStatus && this.workerStatus.isAlive);
            if (this.prevWorkerAlive !== null && this.prevWorkerAlive !== isAlive) {
                if (typeof PipetaConsole !== 'undefined') {
                    if (isAlive) {
                        PipetaConsole.log('system', `✓ Sync Worker en línea (${this.workerStatus?.hostname || 'OK'})`, 'ok');
                    } else {
                        PipetaConsole.log('system', '⚠️ Sync Worker (VM 105) no responde o desconectado', 'warn');
                    }
                }
            }
            this.prevWorkerAlive = isAlive;

            // Detect & log order transitions
            for (const order of this.orders) {
                const prev = this.prevOrderStates.get(order.id);
                if (prev && prev !== order.status) {
                    if (typeof PipetaConsole !== 'undefined') {
                        const shortId = order.id.slice(-6);
                        const itemsCount = Array.isArray(order.items) ? order.items.length : 1;
                        if (order.status === 'processing') {
                            PipetaConsole.log('sync', `Worker inició transferencia #${shortId} [${(order.type || '').toUpperCase()}] (${itemsCount} items)`, 'pending');
                        } else if (order.status === 'completed') {
                            PipetaConsole.log('sync', `✓ Orden #${shortId} completada exitosamente (${itemsCount} items en ${order.durationSeconds || 0}s)`, 'ok');
                        } else if (order.status === 'failed') {
                            PipetaConsole.log('sync', `❌ Orden #${shortId} falló: ${order.error || 'Error en transferencia'}`, 'error');
                        }
                    }
                }
                this.prevOrderStates.set(order.id, order.status);
            }

            this.updateHeaderBadge();
            if (this.isVisible) {
                this.renderContent();
            }
        } catch (e) {
            console.error("Error polling sync queue:", e);
        }
    }

    updateHeaderBadge() {
        const dot = document.getElementById('headerSyncWorkerDot');
        const badge = document.getElementById('headerTransferCountBadge');
        const btn = document.getElementById('sidebarTransferQueueBtn') || document.getElementById('headerTransferQueueBtn');

        const isAlive = this.workerStatus && this.workerStatus.isAlive;
        if (dot) {
            dot.style.background = isAlive ? '#4caf50' : '#f44336';
            dot.title = isAlive 
                ? `Worker VM 105 En Línea (${this.workerStatus.hostname || 'OK'})`
                : 'Worker VM 105 Desconectado';
        }

        const activeCount = this.orders.filter(o => o.status === 'processing' || o.status === 'pending').length;
        if (badge) {
            if (activeCount > 0) {
                badge.textContent = activeCount;
                badge.style.display = 'inline-block';
                if (btn) btn.classList.add('pulse-sync');
            } else {
                badge.style.display = 'none';
                if (btn) btn.classList.remove('pulse-sync');
            }
        }
    }

    renderWindow() {
        if (document.getElementById('sync-queue-window')) return;

        this.container = document.createElement('div');
        this.container.id = 'sync-queue-window';
        this.container.className = 'validator-window';
        this.container.style.display = 'none';
        this.container.style.width = '680px';
        this.container.style.height = '560px';
        this.container.style.minWidth = '460px';
        this.container.style.minHeight = '340px';
        this.container.style.top = '65px';
        this.container.style.right = '20px';
        this.container.style.left = 'auto';
        this.container.style.resize = 'both';
        this.container.style.overflow = 'hidden';
        this.container.style.zIndex = '9999';

        this.container.innerHTML = `
            <div class="validator-header" id="sync-queue-header" onmousedown="window.syncQueueUI.startDrag(event)" ondblclick="window.syncQueueUI.toggleMaximize()" style="display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.1rem; color:#ff9800;">⚡</span>
                    <b style="font-weight:bold; font-size:0.92rem; color:#fff;">Sync Queue</b>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <button class="icon-btn-mini" onclick="window.syncQueueUI.fetchStatus()" title="Refrescar ahora" style="background:transparent; border:none; color:#4fc3f7; cursor:pointer; font-size:1rem; padding:2px 6px;">🔄</button>
                    <button id="sync-queue-max-btn" class="icon-btn-mini" onclick="window.syncQueueUI.toggleMaximize()" title="${this.isMaximized ? 'Restaurar a Ventana Flotante' : 'Maximizar a Canvas Completo'}" style="background:transparent; border:none; color:#aaa; cursor:pointer; font-size:1.05rem; padding:2px 6px; line-height:1; display:flex; align-items:center;">
                        ${this.isMaximized ? '🗗' : '🗖'}
                    </button>
                    <button class="icon-btn-mini" style="color:#f44336; background:transparent; border:none; cursor:pointer; font-size:1.1rem; padding:2px 6px; line-height:1;" onclick="window.syncQueueUI.close()">✕</button>
                </div>
            </div>

            <!-- WORKER STATUS BAR -->
            <div id="sync-queue-worker-bar" style="background:#11151c; border-bottom:1px solid #232b38; padding:8px 14px; display:flex; justify-content:space-between; align-items:center; font-size:0.8rem;">
                <div id="sync-queue-worker-info" style="display:flex; align-items:center; gap:8px;">
                    <div class="spinner-mini" style="width:10px; height:10px;"></div>
                    <span>Consultando worker...</span>
                </div>
                <div style="display:flex; gap:10px;">
                    <span id="sync-queue-summary" style="color:#888; font-size:0.75rem;"></span>
                </div>
            </div>

            <!-- SUBNAV TABS -->
            <div style="display:flex; background:#161c24; border-bottom:1px solid #232b38; padding:0 10px;">
                <div id="tab-btn-active" class="settings-subnav-item active" onclick="window.syncQueueUI.selectTab('active')" style="padding:8px 14px; cursor:pointer; font-size:0.82rem; font-weight:bold; border-bottom:2px solid var(--accent); color:#fff;">
                    🚀 En Curso & Pendientes
                </div>
                <div id="tab-btn-history" class="settings-subnav-item" onclick="window.syncQueueUI.selectTab('history')" style="padding:8px 14px; cursor:pointer; font-size:0.82rem; color:#888; border-bottom:2px solid transparent;">
                    📋 Historial Reciente
                </div>
            </div>

            <!-- BODY LIST -->
            <div id="sync-queue-body" class="validator-body" style="padding:14px; overflow-y:auto; height:calc(100% - 120px); background:#0f1217; display:flex; flex-direction:column; gap:10px;">
                <div style="color:#666; text-align:center; padding:40px;">Cargando transferencias...</div>
            </div>
        `;

        document.body.appendChild(this.container);
        if (this.isMaximized) {
            this.applyMaximizedState();
        }
    }

    toggleMaximize() {
        this.isMaximized = !this.isMaximized;
        this.applyMaximizedState();
    }

    applyMaximizedState() {
        if (!this.container) return;
        const maxBtn = document.getElementById('sync-queue-max-btn');
        if (this.isMaximized) {
            if (!this.container.classList.contains('maximized')) {
                this.prevBounds = {
                    width: this.container.style.width || '680px',
                    height: this.container.style.height || '560px',
                    top: this.container.style.top || '65px',
                    left: this.container.style.left || 'auto',
                    right: this.container.style.right || '20px'
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
                this.container.style.right = this.prevBounds.right;
            }
            if (maxBtn) {
                maxBtn.innerHTML = '🗖';
                maxBtn.title = 'Maximizar a Canvas Completo';
            }
        }
        this.updateSidebarButtonsState();
    }

    updateSidebarButtonsState() {
        const btnQueue = document.getElementById('sidebarTransferQueueBtn') || document.getElementById('headerTransferQueueBtn');
        const modeButtons = document.querySelectorAll('.mode-sidebar .mode-btn');

        if (this.isVisible && this.isMaximized) {
            if (btnQueue) btnQueue.classList.add('active');
            modeButtons.forEach(b => {
                if (b !== btnQueue && b.id !== 'btn-settings-toggle' && b.id !== 'btn-console-toggle') {
                    b.classList.remove('active');
                }
            });
        } else if (this.isVisible) {
            if (btnQueue) btnQueue.classList.add('active');
        } else {
            if (btnQueue) btnQueue.classList.remove('active');
            // Restaurar clase active en el botón del módulo actualmente visible
            if (typeof tabs !== 'undefined') {
                const currentTabName = Object.keys(tabs).find(k => {
                    const el = document.getElementById(tabs[k]);
                    return el && el.style.display !== 'none';
                });
                if (currentTabName) {
                    modeButtons.forEach(btn => {
                        if (btn.getAttribute('title') === currentTabName) {
                            btn.classList.add('active');
                        }
                    });
                }
            }
        }
    }

    toggle() {
        if (this.isVisible) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.renderWindow();
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.applyMaximizedState();
        this.isVisible = true;
        this.updateSidebarButtonsState();
        this.fetchStatus();
    }

    close() {
        if (this.container) {
            this.container.style.display = 'none';
        }
        this.isVisible = false;
        this.updateSidebarButtonsState();
    }

    selectTab(tab) {
        this.activeTab = tab;
        const btnActive = document.getElementById('tab-btn-active');
        const btnHistory = document.getElementById('tab-btn-history');

        if (btnActive && btnHistory) {
            if (tab === 'active') {
                btnActive.style.color = '#fff';
                btnActive.style.borderBottom = '2px solid var(--accent)';
                btnHistory.style.color = '#888';
                btnHistory.style.borderBottom = '2px solid transparent';
            } else {
                btnHistory.style.color = '#fff';
                btnHistory.style.borderBottom = '2px solid var(--accent)';
                btnActive.style.color = '#888';
                btnActive.style.borderBottom = '2px solid transparent';
            }
        }

        this.renderContent();
    }

    renderContent() {
        // Actualizar barra de worker
        const workerInfo = document.getElementById('sync-queue-worker-info');
        const summary = document.getElementById('sync-queue-summary');
        const isAlive = this.workerStatus && this.workerStatus.isAlive;

        if (workerInfo) {
            if (isAlive) {
                const isBusy = this.workerStatus.status === 'processing';
                workerInfo.innerHTML = `
                    <span style="width:8px; height:8px; border-radius:50%; background:#4caf50; display:inline-block;"></span>
                    <span style="color:#4caf50; font-weight:bold;">Worker en Línea:</span>
                    <span style="color:#fff; font-family:monospace;">${this.workerStatus.hostname || 'VM 105'}</span>
                    <span style="color:#888; font-size:0.72rem;">(${isBusy ? '⚡ Procesando tarea' : '💤 En espera'} • ping hace ${this.workerStatus.diffSeconds || 0}s)</span>
                `;
            } else {
                workerInfo.innerHTML = `
                    <span style="width:8px; height:8px; border-radius:50%; background:#f44336; display:inline-block;"></span>
                    <span style="color:#f44336; font-weight:bold;">Worker Desconectado</span>
                    <span style="color:#888; font-size:0.72rem;">(Ejecute Launch_Pipeta_Worker.bat en VM 105)</span>
                `;
            }
        }

        const activeOrders = this.orders.filter(o => o.status === 'processing' || o.status === 'pending');
        const historyOrders = this.orders.filter(o => o.status !== 'processing' && o.status !== 'pending');

        if (summary) {
            summary.innerHTML = `<b>${activeOrders.length}</b> activas • <b>${historyOrders.length}</b> en historial`;
        }

        const body = document.getElementById('sync-queue-body');
        if (!body) return;

        if (this.activeTab === 'active') {
            this.renderActiveTab(body, activeOrders);
        } else {
            this.renderHistoryTab(body, historyOrders);
        }
    }

    renderActiveTab(container, activeOrders) {
        if (activeOrders.length === 0) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; text-align:center;">
                    <div style="font-size:2.5rem; margin-bottom:12px;">✨</div>
                    <div style="font-weight:bold; color:#eee; font-size:0.95rem; margin-bottom:6px;">No hay transferencias activas</div>
                    <div style="color:#888; font-size:0.8rem; max-width:340px; line-height:1.4;">
                        Las descargas y subidas que inicies desde el explorador o el Sync Analyzer aparecerán aquí en tiempo real.
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = activeOrders.map(order => {
            const isProcessing = order.status === 'processing';
            const isDownload = order.type === 'download';
            const typeColor = isDownload ? '#00bcd4' : '#4caf50';
            const typeIcon = isDownload ? '📥' : '📤';
            const typeLabel = isDownload ? 'DESCARGA DE DRIVE' : 'SUBIDA A DRIVE';

            return `
                <div style="background:#14171d; border:1px solid ${isProcessing ? 'var(--accent)' : '#28303d'}; border-radius:6px; padding:12px; box-shadow:0 3px 10px rgba(0,0,0,0.3);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background:${typeColor}22; color:${typeColor}; border:1px solid ${typeColor}44; font-size:0.72rem; font-weight:bold; padding:2px 8px; border-radius:4px;">
                                ${typeIcon} ${typeLabel}
                            </span>
                            <span style="color:#aaa; font-size:0.75rem; font-family:monospace;">${order.id}</span>
                            <span style="color:#666; font-size:0.75rem;">• ${order.project || ''}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            ${isProcessing ? `
                                <div style="display:flex; align-items:center; gap:6px; background:rgba(255,152,0,0.15); border:1px solid #ff9800; padding:2px 8px; border-radius:4px; font-size:0.72rem; color:#ff9800; font-weight:bold;">
                                    <span class="spinner-mini" style="width:8px; height:8px;"></span>
                                    <span>Transfiriendo en VM 105...</span>
                                </div>
                            ` : `
                                <span style="background:#222; color:#aaa; font-size:0.72rem; padding:2px 8px; border-radius:4px;">🕒 En espera...</span>
                            `}
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${(order.items || []).map(it => {
                            const sizeStr = it.size ? ` (${(it.size / (1024 * 1024)).toFixed(2)} MB)` : '';
                            return `
                                <div style="background:#0c0e12; border:1px solid #1a202c; border-radius:4px; padding:8px 10px; font-size:0.78rem;">
                                    <div style="font-weight:bold; color:#fff; display:flex; justify-content:space-between;">
                                        <span>${it.isDir ? '📁' : '📄'} ${it.name || it.relativePath}</span>
                                        <span style="color:#888;">${sizeStr}</span>
                                    </div>
                                    <div style="font-size:0.7rem; color:#888; margin-top:4px; word-break:break-all;">
                                        ${isDownload 
                                            ? `<span style="color:#00bcd4;">☁️ Origen:</span> ${it.onlinePath}<br><span style="color:#4caf50;">💾 Destino:</span> ${it.targetLocalPath}`
                                            : `<span style="color:#4caf50;">💾 Origen:</span> ${it.localPath || it.targetLocalPath}<br><span style="color:#00bcd4;">☁️ Destino:</span> ${it.onlinePath || 'Auto-Drive'}`
                                        }
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:0.72rem; color:#666;">
                        <span>Solicitado por: <b>${order.user || 'artista'}</b></span>
                        <span>Creado: ${new Date(order.createdAt).toLocaleTimeString()}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderHistoryTab(container, historyOrders) {
        if (historyOrders.length === 0) {
            container.innerHTML = `
                <div style="color:#666; text-align:center; padding:40px; font-size:0.85rem;">
                    No hay transferencias finalizadas aún en el historial.
                </div>
            `;
            return;
        }

        container.innerHTML = historyOrders.map(order => {
            const isOk = order.status === 'completed';
            const isPartial = order.status === 'completed_with_errors';
            const isDownload = order.type === 'download';
            const typeLabel = isDownload ? 'Descarga' : 'Subida';

            const statusColor = isOk ? '#4caf50' : (isPartial ? '#ff9800' : '#f44336');
            const statusLabel = isOk ? `✅ Completada (${order.durationSeconds || 0}s)` : (isPartial ? '⚠️ Parcial con errores' : '❌ Falló');

            return `
                <div style="background:#12151b; border:1px solid #202732; border-radius:6px; padding:10px; font-size:0.8rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <b style="color:#fff;">${typeLabel}:</b>
                            <span style="color:#aaa;">${(order.items || []).map(i => i.name).join(', ') || order.id}</span>
                        </div>
                        <span style="font-size:0.75rem; font-weight:bold; color:${statusColor};">${statusLabel}</span>
                    </div>

                    <div style="display:flex; justify-content:space-between; color:#666; font-size:0.72rem;">
                        <span>Proyecto: <b>${order.project || '—'}</b> | Usuario: <b>${order.user || '—'}</b></span>
                        <span>${new Date(order.createdAt).toLocaleString()}</span>
                    </div>

                    ${order.errors && order.errors.length ? `
                        <div style="margin-top:6px; background:rgba(244,67,54,0.1); border-left:2px solid #f44336; padding:4px 8px; font-size:0.72rem; color:#ff8a80;">
                            ${order.errors.map(e => `<div>${e.item ? `<b>${e.item}:</b> ` : ''}${e.error}</div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    startDrag(e) {
        if (this.isMaximized) return;
        if (e.target.closest('button')) return;
        const win = this.container;
        let shiftX = e.clientX - win.getBoundingClientRect().left;
        let shiftY = e.clientY - win.getBoundingClientRect().top;

        function moveAt(pageX, pageY) {
            win.style.left = (pageX - shiftX) + 'px';
            win.style.top = (pageY - shiftY) + 'px';
            win.style.right = 'auto';
        }

        function onMouseMove(e) {
            moveAt(e.pageX, e.pageY);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.onmouseup = function () {
            document.removeEventListener('mousemove', onMouseMove);
            document.onmouseup = null;
        };
    }
}

// Inicializar cuando cargue el DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new SyncQueueUI());
} else {
    new SyncQueueUI();
}
