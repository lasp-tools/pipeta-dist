// ================================================================
// PIPETA SYNC QUEUE UI — Monitor de Transferencias en Vivo
// Muestra el estado del Worker de la VM 105 y las órdenes activas.
// ================================================================

function formatQueueBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0) + ' ' + units[i];
}

function formatQueueEta(seconds) {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return `${seconds}s restantes`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s restantes`;
}

class SyncQueueUI {
    constructor() {
        this.isVisible = false;
        this.activeTab = 'active'; // 'active' | 'history'
        this.orders = [];
        this.workerStatus = null;
        this.pollingInterval = null;
        this.prevOrderStates = new Map();
        this.prevWorkerAlive = null;
        this.processedCompletedOrderIds = new Set();
        this.isInitialFetchDone = false;
        this.isMaximized = false; // Por defecto siempre ventana flotante al abrir Pipeta
        this.prevBounds = null;
        this.onlyMyTasks = true;

        window.syncQueueUI = this;
        this.init();
    }

    getCurrentUser() {
        const username = (typeof getPipetaCurrentUser === 'function') ? getPipetaCurrentUser() : 'user';
        let role = 'user';
        let isAdmin = false;
        if (typeof Ramon !== 'undefined' && Ramon.session?.user) {
            const u = Ramon.session.user;
            role = u.role || (u.is_admin ? 'admin' : 'user');
            isAdmin = !!(u.is_admin || role === 'admin' || role === 'administrator' || username === 'admin');
        } else if (username === 'admin') {
            role = 'admin';
            isAdmin = true;
        }
        return { username, role, isAdmin };
    }

    toggleAdminFilter() {
        this.onlyMyTasks = !this.onlyMyTasks;
        this.fetchStatus();
    }

    init() {
        this.renderWindow();
        this.startPolling();
    }

    startPolling(customInterval = 3000) {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        this.currentIntervalMs = customInterval;
        this.pollingInterval = setInterval(() => this.fetchStatus(), customInterval);
    }

    async fetchStatus() {
        try {
            // 1. Worker status
            const resWorker = await fetch('/api/sync/worker-status').then(r => r.json()).catch(() => null);
            if (resWorker && resWorker.success) {
                this.workerStatus = resWorker.status;
            }

            // 2. Orders list (filtradas con privacidad por usuario)
            const userInfo = this.getCurrentUser();
            const query = new URLSearchParams();
            if (userInfo.username) query.set('user', userInfo.username);
            if (userInfo.role) query.set('role', userInfo.role);
            if (userInfo.isAdmin) query.set('onlyMyTasks', this.onlyMyTasks ? 'true' : 'false');

            const resOrders = await fetch(`/api/sync/orders?${query.toString()}`).then(r => r.json()).catch(() => null);
            if (resOrders && resOrders.success) {
                this.orders = resOrders.orders || [];
            }

            // Polling adaptativo: 1.2s durante transferencias activas, 3s en reposo
            const hasProcessing = this.orders.some(o => o.status === 'processing');
            const desiredInterval = hasProcessing ? 1200 : 3000;
            if (this.currentIntervalMs !== desiredInterval) {
                this.startPolling(desiredInterval);
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

            // Si es el primer ciclo de fetch, inicializar órdenes ya terminadas para no disparar refrescos masivos del pasado
            if (!this.isInitialFetchDone) {
                for (const o of this.orders) {
                    if (o.status === 'completed' || o.status === 'completed_with_errors' || o.status === 'failed') {
                        this.processedCompletedOrderIds.add(o.id);
                    }
                    this.prevOrderStates.set(o.id, o.status);
                }
                this.isInitialFetchDone = true;
            }

            // Detect & log order transitions and trigger automatic folder refresh
            for (const order of this.orders) {
                const prev = this.prevOrderStates.get(order.id);
                const isFinished = order.status === 'completed' || order.status === 'completed_with_errors';

                if (isFinished && !this.processedCompletedOrderIds.has(order.id)) {
                    this.processedCompletedOrderIds.add(order.id);
                    this.triggerOrderCompletionRefresh(order);
                }

                if (prev && prev !== order.status) {
                    const shortId = order.id.slice(-6);
                    const itemsCount = Array.isArray(order.items) ? order.items.length : 1;
                    if (order.status === 'processing') {
                        if (typeof PipetaConsole !== 'undefined') {
                            PipetaConsole.log('sync', `Inició transferencia #${shortId} [${(order.type || '').toUpperCase()}] (${itemsCount} items)`, 'pending');
                        }
                    } else if (order.status === 'failed') {
                        if (typeof PipetaConsole !== 'undefined') {
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

    async triggerOrderCompletionRefresh(order) {
        try {
            const shortId = order.id.slice(-6);
            const itemsCount = Array.isArray(order.items) ? order.items.length : 1;
            const isDownload = order.type === 'download' || order.type === 'server_download';
            const typeLabel = isDownload ? 'Descarga' : 'Subida';
            const proj = order.project || ((typeof settings !== 'undefined' && settings?.currentProject?.name) ? settings.currentProject.name : 'surf_love');

            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `✓ ${typeLabel} #${shortId} completada (${itemsCount} items en ${order.durationSeconds || 0}s). Actualizando vista de carpeta local...`, 'ok');
            }

            // 1. Identificar carpetas locales y remotas afectadas
            const parentFolders = new Set();
            for (const it of (order.items || [])) {
                const p = it.targetLocalPath || it.localPath || it.serverPath || it.path;
                if (p) {
                    const norm = p.replace(/\\/g, '/');
                    const folder = norm.substring(0, norm.lastIndexOf('/'));
                    if (folder) parentFolders.add(folder);
                }
            }

            // 2. Si fue subida, solicitar al backend actualización del sub-catálogo correspondiente
            if (order.type === 'upload' || order.type === 'server_upload') {
                const targetType = order.type === 'server_upload' ? 'server' : 'drive';
                for (const folder of parentFolders) {
                    try {
                        await fetch('/api/sync/catalog/refresh-folder', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ project: proj, path: folder, type: targetType })
                        });
                    } catch (e) {}
                }
            }

            // 3. Limpiar cachés de memoria del backend
            try {
                await fetch('/api/sync/catalog/clear-cache', { method: 'POST' });
            } catch (e) {}

            // 4. Recargar catálogos en frontend (force = true)
            if (typeof loadActiveProjectSyncCatalog === 'function') {
                try {
                    await loadActiveProjectSyncCatalog(true);
                } catch(e) {}
            }

            // 5. Refrescar la vista actual de carpetas locales
            if (typeof refreshCurrentView === 'function') {
                await refreshCurrentView(true);
            }

            // 6. Si Sync Analyzer está abierto, refrescar también su escaneo si aplica
            if (window.syncAnalyzer && window.syncAnalyzer.isVisible && typeof window.syncAnalyzer.runScan === 'function') {
                try {
                    window.syncAnalyzer.runScan(window.syncAnalyzer.scanScope || 'selection');
                } catch (e) {}
            }

            // 7. Notificación toast sutil
            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                const firstItemName = order.items?.[0]?.name || 'elemento';
                const more = (order.items?.length || 1) - 1;
                const nameStr = more > 0 ? `${firstItemName} (+${more})` : firstItemName;
                settings.showToast(`✅ ${typeLabel} completada: ${nameStr}`, 'success', 3, 'Carpeta local y estado actualizados');
            }
        } catch (err) {
            console.error('[SYNC QUEUE] Error al actualizar estado post-transferencia:', err);
            if (typeof refreshCurrentView === 'function') refreshCurrentView(true);
        }
    }

    async cancelOrder(orderId) {
        if (!confirm(`¿Deseas cancelar la orden #${orderId.slice(-6)}?`)) return;
        const userInfo = this.getCurrentUser();
        try {
            const res = await fetch('/api/sync/orders/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, user: userInfo.username, role: userInfo.role })
            }).then(r => r.json());
            if (res.success) {
                if (typeof settings !== 'undefined' && settings.showToast) {
                    settings.showToast('🛑 Cancelación solicitada', 'warn', 2);
                }
                this.fetchStatus();
            } else {
                alert(res.error || 'No se pudo cancelar la orden');
            }
        } catch (e) {
            alert('Error al cancelar: ' + e.message);
        }
    }

    async clearHistory() {
        if (!confirm('¿Deseas limpiar el historial de transferencias finalizadas?')) return;
        const userInfo = this.getCurrentUser();
        try {
            const res = await fetch('/api/sync/orders/clear-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: userInfo.username, role: userInfo.role })
            }).then(r => r.json());
            if (res.success) {
                if (typeof settings !== 'undefined' && settings.showToast) {
                    settings.showToast(`🗑️ Historial limpio (${res.clearedCount} eliminadas)`, 'info', 2);
                }
                this.fetchStatus();
            }
        } catch (e) {
            alert('Error al limpiar historial: ' + e.message);
        }
    }

    async startLocalWorker() {
        try {
            const btn = document.getElementById('btnStartLocalWorker');
            if (btn) btn.innerHTML = '⏳ Iniciando...';
            const res = await fetch('/api/sync/worker/start-local', { method: 'POST' }).then(r => r.json());
            if (res.success) {
                if (typeof settings !== 'undefined' && settings.showToast) {
                    settings.showToast('🚀 Worker Local iniciado en segundo plano', 'success', 3);
                }
                setTimeout(() => this.fetchStatus(), 800);
            } else {
                alert(res.error || 'No se pudo iniciar el worker local');
                if (btn) btn.innerHTML = '🟢 Iniciar Worker Local';
            }
        } catch (e) {
            alert('Error al iniciar worker local: ' + e.message);
        }
    }

    async stopLocalWorker() {
        if (!confirm('¿Deseas detener el Worker Local en segundo plano?')) return;
        try {
            const res = await fetch('/api/sync/worker/stop-local', { method: 'POST' }).then(r => r.json());
            if (res.success) {
                if (typeof settings !== 'undefined' && settings.showToast) {
                    settings.showToast('⏹ Worker Local detenido', 'info', 2);
                }
                setTimeout(() => this.fetchStatus(), 500);
            }
        } catch (e) {
            alert('Error al detener worker local: ' + e.message);
        }
    }

    updateHeaderBadge() {
        const dot = document.getElementById('headerSyncWorkerDot');
        const badge = document.getElementById('headerTransferCountBadge');
        const btn = document.getElementById('sidebarTransferQueueBtn') || document.getElementById('headerTransferQueueBtn');

        const isAlive = this.workerStatus && this.workerStatus.isAlive;
        const isLocal = this.workerStatus && this.workerStatus.isLocal;
        if (dot) {
            dot.style.background = isAlive ? (isLocal ? '#00e5ff' : '#4caf50') : '#f44336';
            dot.title = isAlive 
                ? `${isLocal ? 'Worker Local' : 'Worker Central VM 105'} (${this.workerStatus.hostname || 'OK'})`
                : 'Worker Desconectado';
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
        const isLocal = !!(this.workerStatus && this.workerStatus.isLocal);

        if (workerInfo) {
            if (isAlive) {
                const isBusy = this.workerStatus.status === 'processing';
                const dotColor = isLocal ? '#00e5ff' : '#4caf50';
                workerInfo.innerHTML = `
                    <span style="width:8px; height:8px; border-radius:50%; background:${dotColor}; display:inline-block;"></span>
                    <span style="color:${dotColor}; font-weight:bold;">${isLocal ? 'Worker Local' : 'Worker Central'}:</span>
                    <span style="color:#fff; font-family:monospace;">${this.workerStatus.hostname || 'OK'}</span>
                    <span style="color:#888; font-size:0.72rem;">(${isBusy ? '⚡ Procesando' : '💤 En espera'} • ping hace ${this.workerStatus.diffSeconds || 0}s)</span>
                    ${isLocal ? `<button onclick="window.syncQueueUI.stopLocalWorker()" title="Detener Worker Local" style="background:rgba(244,67,54,0.15); border:1px solid #f44336; color:#ff8a80; border-radius:3px; padding:1px 6px; font-size:0.7rem; cursor:pointer; margin-left:6px;">⏹ Detener</button>` : ''}
                `;
            } else {
                workerInfo.innerHTML = `
                    <span style="width:8px; height:8px; border-radius:50%; background:#f44336; display:inline-block;"></span>
                    <span style="color:#f44336; font-weight:bold;">Worker Inactivo</span>
                    <button id="btnStartLocalWorker" onclick="window.syncQueueUI.startLocalWorker()" title="Iniciar un worker en segundo plano en esta máquina para procesar transferencias con Rclone" style="background:#2e7d32; border:1px solid #4caf50; color:#fff; border-radius:3px; padding:2px 8px; font-size:0.72rem; cursor:pointer; font-weight:bold; margin-left:6px; display:inline-flex; align-items:center; gap:4px;">
                        🟢 Iniciar Worker Local
                    </button>
                `;
            }
        }

        const activeOrders = this.orders.filter(o => o.status === 'processing' || o.status === 'pending');
        const historyOrders = this.orders.filter(o => o.status !== 'processing' && o.status !== 'pending');

        const userInfo = this.getCurrentUser();
        if (summary) {
            summary.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    ${userInfo.isAdmin ? `
                        <button onclick="window.syncQueueUI.toggleAdminFilter()" title="Alternar entre ver solo tus tareas o las de todos" style="background:#1a222d; border:1px solid #324156; color:#4fc3f7; border-radius:3px; padding:2px 6px; font-size:0.7rem; cursor:pointer;">
                            ${this.onlyMyTasks ? '👤 Mis Tareas' : '👥 Todas las Tareas'}
                        </button>
                    ` : `
                        <span style="color:#81d4fa; font-size:0.72rem; background:rgba(0,229,255,0.08); padding:2px 6px; border-radius:3px; border:1px solid rgba(0,229,255,0.2);">👤 <b>${userInfo.username}</b></span>
                    `}
                    <span style="color:#888; font-size:0.75rem;"><b>${activeOrders.length}</b> activas • <b>${historyOrders.length}</b> en historial</span>
                </div>
            `;
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
            let typeColor = '#00bcd4';
            let typeIcon = '📥';
            let typeLabel = 'DESCARGA DE DRIVE';
            let isServerTransfer = false;

            if (order.type === 'download') {
                typeLabel = 'DESCARGA DE DRIVE';
                typeIcon = '📥';
                typeColor = '#00bcd4';
            } else if (order.type === 'upload') {
                typeLabel = 'SUBIDA A DRIVE';
                typeIcon = '📤';
                typeColor = '#4caf50';
            } else if (order.type === 'server_download') {
                typeLabel = 'DESCARGA DE SERVER';
                typeIcon = '📥';
                typeColor = '#ab47bc';
                isServerTransfer = true;
            } else if (order.type === 'server_upload') {
                typeLabel = 'SUBIDA A SERVER';
                typeIcon = '📤';
                typeColor = '#ff9800';
                isServerTransfer = true;
            }

            const progress = order.progress;
            const pct = (progress && typeof progress.percentage === 'number') 
                ? Math.min(100, Math.max(0, Math.round(progress.percentage * 10) / 10)) 
                : 0;
            const speedText = (progress && progress.speedFormatted) ? progress.speedFormatted : (isProcessing ? 'Calculando tasa...' : '');
            const transferredStr = (progress && progress.transferredBytes) ? formatQueueBytes(progress.transferredBytes) : null;
            const totalStr = (progress && progress.totalBytes) ? formatQueueBytes(progress.totalBytes) : null;
            const bytesRatio = (transferredStr && totalStr) ? `${transferredStr} / ${totalStr}` : (transferredStr || '');
            const etaStr = (progress && progress.etaSeconds > 0) ? formatQueueEta(progress.etaSeconds) : '';
            const currentFile = (progress && progress.currentFile) ? progress.currentFile : '';

            const isLocalExecution = order.worker && order.worker.includes('local_');
            const engineBadge = isProcessing
                ? (isServerTransfer
                    ? `<div style="display:flex; align-items:center; gap:6px; background:rgba(171,71,188,0.15); border:1px solid #ab47bc; padding:2px 8px; border-radius:4px; font-size:0.72rem; color:#ce93d8; font-weight:bold;">
                        <span class="spinner-mini" style="width:8px; height:8px;"></span>
                        <span>Copia en red LAN...</span>
                       </div>`
                    : (isLocalExecution
                        ? `<div style="display:flex; align-items:center; gap:6px; background:rgba(0,229,255,0.15); border:1px solid #00e5ff; padding:2px 8px; border-radius:4px; font-size:0.72rem; color:#00e5ff; font-weight:bold;">
                            <span class="spinner-mini" style="width:8px; height:8px;"></span>
                            <span>Worker Local (Rclone)...</span>
                           </div>`
                        : `<div style="display:flex; align-items:center; gap:6px; background:rgba(255,152,0,0.15); border:1px solid #ff9800; padding:2px 8px; border-radius:4px; font-size:0.72rem; color:#ff9800; font-weight:bold;">
                            <span class="spinner-mini" style="width:8px; height:8px;"></span>
                            <span>Transfiriendo en VM 105...</span>
                           </div>`))
                : `<span style="background:#222; color:#aaa; font-size:0.72rem; padding:2px 8px; border-radius:4px;">🕒 En espera...</span>`;

            return `
                <div style="background:#14171d; border:1px solid ${isProcessing ? typeColor : '#28303d'}; border-radius:6px; padding:12px; box-shadow:0 3px 10px rgba(0,0,0,0.3);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background:${typeColor}22; color:${typeColor}; border:1px solid ${typeColor}44; font-size:0.72rem; font-weight:bold; padding:2px 8px; border-radius:4px;">
                                ${typeIcon} ${typeLabel}
                            </span>
                            <span style="color:#aaa; font-size:0.75rem; font-family:monospace;">${order.id}</span>
                            <span style="color:#666; font-size:0.75rem;">• ${order.project || ''}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            ${engineBadge}
                            <button onclick="window.syncQueueUI.cancelOrder('${order.id}')" title="Cancelar esta tarea" style="background:rgba(244,67,54,0.15); border:1px solid rgba(244,67,54,0.4); color:#ff8a80; border-radius:4px; padding:2px 8px; font-size:0.72rem; cursor:pointer; font-weight:bold; transition:all 0.2s;" onmouseover="this.style.background='#f44336'; this.style.color='#fff';" onmouseout="this.style.background='rgba(244,67,54,0.15)'; this.style.color='#ff8a80';">
                                ✕ Cancelar
                            </button>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${(order.items || []).map(it => {
                            const sizeStr = it.size ? ` (${formatQueueBytes(it.size)})` : '';
                            let pathInfoHtml = '';
                            if (order.type === 'download') {
                                pathInfoHtml = `<span style="color:#00bcd4;">☁️ Origen (Drive):</span> ${it.onlinePath || 'Auto-Drive'}<br><span style="color:#4caf50;">💾 Destino (Local):</span> ${it.targetLocalPath || it.path}`;
                            } else if (order.type === 'upload') {
                                pathInfoHtml = `<span style="color:#4caf50;">💾 Origen (Local):</span> ${it.localPath || it.targetLocalPath || it.path}<br><span style="color:#00bcd4;">☁️ Destino (Drive):</span> ${it.onlinePath || 'Auto-Drive'}`;
                            } else if (order.type === 'server_download') {
                                pathInfoHtml = `<span style="color:#ab47bc;">🏢 Origen (Server):</span> ${it.serverPath || it.path}<br><span style="color:#4caf50;">💾 Destino (Local):</span> ${it.targetLocalPath || it.path}`;
                            } else if (order.type === 'server_upload') {
                                pathInfoHtml = `<span style="color:#4caf50;">💾 Origen (Local):</span> ${it.localPath || it.path}<br><span style="color:#ab47bc;">🏢 Destino (Server):</span> ${it.targetServerPath || it.serverPath || it.path}`;
                            }

                            return `
                                <div style="background:#0c0e12; border:1px solid #1a202c; border-radius:4px; padding:8px 10px; font-size:0.78rem;">
                                    <div style="font-weight:bold; color:#fff; display:flex; justify-content:space-between;">
                                        <span>${it.isDir ? '📁' : '📄'} ${it.name || it.relativePath || it.path}</span>
                                        <span style="color:#888;">${sizeStr}</span>
                                    </div>
                                    <div style="font-size:0.7rem; color:#888; margin-top:4px; word-break:break-all; line-height:1.4;">
                                        ${pathInfoHtml}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>

                    ${isProcessing ? `
                        <div style="margin-top:10px; background:#0a0c10; border:1px solid #1f2735; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:6px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="background:rgba(0,229,255,0.12); color:#00e5ff; border:1px solid rgba(0,229,255,0.25); font-size:0.75rem; font-weight:bold; padding:2px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;">
                                        ⚡ ${speedText}
                                    </span>
                                    <span style="font-size:0.85rem; font-weight:bold; color:#fff;">
                                        ${pct}%
                                    </span>
                                    ${bytesRatio ? `<span style="font-size:0.72rem; color:#888;">(${bytesRatio})</span>` : ''}
                                </div>
                                ${etaStr ? `
                                    <span style="font-size:0.72rem; color:#aaa; background:#14171d; border:1px solid #28303d; padding:2px 6px; border-radius:4px;">
                                        ⏱️ ${etaStr}
                                    </span>
                                ` : ''}
                            </div>

                            <div style="width:100%; height:7px; background:#1a202c; border-radius:4px; overflow:hidden; position:relative;">
                                <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, ${typeColor}, #00e5ff); border-radius:4px; transition:width 0.3s ease;"></div>
                            </div>

                            ${currentFile ? `
                                <div style="font-size:0.7rem; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${currentFile}">
                                    📄 Archivo actual: <span style="color:#ccc;">${currentFile}</span>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:0.72rem; color:#666;">
                        <span>Solicitado por: <b>${order.user || 'artista'}</b></span>
                        <span>Creado: ${new Date(order.createdAt).toLocaleTimeString()}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderHistoryTab(container, historyOrders) {
        const topBarHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding:0 2px;">
                <span style="font-size:0.75rem; color:#888;">Historial de transferencias finalizadas</span>
                ${historyOrders.length > 0 ? `
                    <button onclick="window.syncQueueUI.clearHistory()" style="background:#1a202c; border:1px solid #2d3748; color:#aaa; border-radius:4px; padding:3px 8px; font-size:0.72rem; cursor:pointer; display:inline-flex; align-items:center; gap:4px;" onmouseover="this.style.color='#fff'; this.style.borderColor='#4fc3f7';" onmouseout="this.style.color='#aaa'; this.style.borderColor='#2d3748';">
                        🗑️ Limpiar Historial
                    </button>
                ` : ''}
            </div>
        `;

        if (historyOrders.length === 0) {
            container.innerHTML = `
                ${topBarHtml}
                <div style="color:#666; text-align:center; padding:40px; font-size:0.85rem;">
                    No hay transferencias finalizadas aún en el historial.
                </div>
            `;
            return;
        }

        const itemsHtml = historyOrders.map(order => {
            const isCancelled = order.status === 'cancelled';
            const isOk = order.status === 'completed';
            const isPartial = order.status === 'completed_with_errors';
            
            let typeLabel = 'Descarga';
            if (order.type === 'download') typeLabel = '📥 Descarga Drive';
            else if (order.type === 'upload') typeLabel = '📤 Subida Drive';
            else if (order.type === 'server_download') typeLabel = '📥 Descarga Server';
            else if (order.type === 'server_upload') typeLabel = '📤 Subida Server';

            const statusColor = isOk ? '#4caf50' : (isCancelled ? '#9e9e9e' : (isPartial ? '#ff9800' : '#f44336'));
            const statusLabel = isOk ? `✅ Completada (${order.durationSeconds || 0}s)` : (isCancelled ? `🛑 Cancelada (${order.cancelledBy || 'usuario'})` : (isPartial ? '⚠️ Parcial con errores' : '❌ Falló'));

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
                            ${order.errors.map(e => `<div>${e.item || e.file ? `<b>${e.item || e.file}:</b> ` : ''}${e.error}</div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        container.innerHTML = topBarHtml + itemsHtml;
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
