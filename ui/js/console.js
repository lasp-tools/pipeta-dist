// ================================================================
// PIPETA CONSOLE — Activity Log & Diagnostics Panel
// Persists logs to disk via Server API (/api/logs/append).
// Automatically captures file operations, sync events, and errors.
// ================================================================

const PipetaConsole = {
    isVisible: false,
    entries: [],
    maxEntries: 1000,
    currentFilter: 'all', // 'all' | 'error' | 'sync' | 'fs' | 'system'
    errorCount: 0,
    container: null,
    resizeHandle: null,
    _height: 220,
    _logBuffer: [],
    _flushTimer: null,

    init() {
        if (document.getElementById('pipeta-console')) return;

        // Create the console panel
        const panel = document.createElement('div');
        panel.id = 'pipeta-console';
        panel.className = 'pipeta-console';
        panel.style.display = 'none';
        panel.style.height = this._height + 'px';

        panel.innerHTML = `
            <div class="console-resize-handle" id="console-resize-handle"></div>
            <div class="console-header">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="color:var(--accent); font-weight:bold; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px;">⌨ Consola</span>
                    <span class="console-count" id="console-count">0 eventos</span>
                    
                    <!-- CATEGORY FILTERS -->
                    <div class="console-filters">
                        <button class="console-filter-btn active" data-filter="all" onclick="PipetaConsole.setFilter('all')">Todos</button>
                        <button class="console-filter-btn" data-filter="error" onclick="PipetaConsole.setFilter('error')">❌ Errores</button>
                        <button class="console-filter-btn" data-filter="sync" onclick="PipetaConsole.setFilter('sync')">🔄 Sync</button>
                        <button class="console-filter-btn" data-filter="fs" onclick="PipetaConsole.setFilter('fs')">📁 Archivos</button>
                        <button class="console-filter-btn" data-filter="system" onclick="PipetaConsole.setFilter('system')">⚙️ Sistema</button>
                    </div>
                </div>

                <div style="display:flex; align-items:center; gap:4px;">
                    <button class="console-action-btn" onclick="PipetaConsole.openLogsFolder()" title="Abrir carpeta de logs en Windows Explorer">📁 Logs</button>
                    <button class="console-action-btn" onclick="PipetaConsole.copyLogs()" title="Copiar registro al portapapeles">📋 Copiar</button>
                    <button class="console-action-btn" onclick="PipetaConsole.clear()" title="Limpiar consola">🗑</button>
                    <button class="console-action-btn" onclick="PipetaConsole.scrollToBottom()" title="Ir al final">⬇</button>
                    <button class="console-action-btn" onclick="PipetaConsole.toggle()" title="Cerrar">✕</button>
                </div>
            </div>
            <div class="console-body" id="console-body"></div>
        `;

        document.body.appendChild(panel);
        this.container = panel;

        // Setup resize drag
        this._setupResize();

        // Initial system event
        this.log('system', 'Consola de diagnóstico inicializada y vinculada a disco.', 'ok');
    },

    toggle() {
        this.isVisible = !this.isVisible;
        if (!this.container) this.init();
        this.container.style.display = this.isVisible ? 'flex' : 'none';

        // Adjust main container height
        const main = document.querySelector('.main-container');
        if (main) {
            main.style.height = this.isVisible
                ? `calc(100vh - 60px - ${this._height}px)`
                : 'calc(100vh - 60px)';
        }

        // Update header button active state & clear error pulse when opened
        const btn = document.getElementById('btn-console-toggle');
        if (btn) {
            btn.classList.toggle('active', this.isVisible);
            if (this.isVisible) {
                btn.classList.remove('has-new-errors');
                this.updateErrorBadge(true); // reset badge counter on open
            }
        }

        if (this.isVisible) {
            this._renderFiltered();
            this.scrollToBottom();
        }
    },

    setFilter(filter) {
        this.currentFilter = filter;
        document.querySelectorAll('.console-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
        });
        this._renderFiltered();
        this.scrollToBottom();
    },

    _entryMatchesFilter(entry) {
        if (this.currentFilter === 'all') return true;
        if (this.currentFilter === 'error') {
            return entry.status === 'error' || entry.type === 'error';
        }
        if (this.currentFilter === 'sync') {
            return entry.type === 'sync';
        }
        if (this.currentFilter === 'fs') {
            return ['copy', 'rename', 'delete', 'mkdir', 'write', 'read'].includes(entry.type);
        }
        if (this.currentFilter === 'system') {
            return ['system', 'info', 'audit'].includes(entry.type);
        }
        return true;
    },

    log(type, message, status = 'info') {
        const now = new Date();
        const time = now.toLocaleTimeString('es-AR', { hour12: false });
        const isoTime = now.toISOString();

        const entry = { type, message, status, time, isoTime, source: 'ui' };
        this.entries.push(entry);

        // Trim if exceeds max entries
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }

        // Track error counts & alert on header button
        if (status === 'error' || type === 'error') {
            this.errorCount++;
            this.updateErrorBadge(false);
        }

        // Render if visible and matches current filter
        if (this.isVisible && this._entryMatchesFilter(entry)) {
            this._appendEntry(entry);
        }

        // Update count badge
        const countEl = document.getElementById('console-count');
        if (countEl) {
            countEl.innerText = `${this.entries.length} eventos`;
        }

        // Buffer for server disk persistence
        this._persistEntry(entry);
    },

    updateErrorBadge(reset = false) {
        if (reset) {
            this.errorCount = 0;
        }
        const btn = document.getElementById('btn-console-toggle');
        if (!btn) return;

        let badge = btn.querySelector('.console-error-pill');
        if (this.errorCount > 0 && !this.isVisible) {
            btn.classList.add('has-new-errors');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'console-error-pill';
                btn.appendChild(badge);
            }
            badge.innerText = this.errorCount > 99 ? '99+' : this.errorCount;
            badge.style.display = 'inline-block';
        } else {
            btn.classList.remove('has-new-errors');
            if (badge) badge.style.display = 'none';
        }
    },

    // --- DISK PERSISTENCE VIA SERVER API ---
    _persistEntry(entry) {
        this._logBuffer.push(entry);

        // Flush in batches every 1.5 seconds
        if (this._flushTimer) clearTimeout(this._flushTimer);
        this._flushTimer = setTimeout(() => this._flushToDisk(), 1500);
    },

    async _flushToDisk() {
        if (this._logBuffer.length === 0) return;
        const batch = [...this._logBuffer];
        this._logBuffer = [];

        try {
            await fetch('/api/logs/append', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries: batch })
            });
        } catch (e) {
            // Re-queue on network error
            this._logBuffer = [...batch, ...this._logBuffer];
        }
    },

    async openLogsFolder() {
        try {
            const res = await fetch('/api/logs/open-folder', { method: 'POST' }).then(r => r.json());
            if (res && res.success) {
                if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                    settings.showToast('📁 Carpeta de logs abierta en Windows Explorer', 'success', 3);
                }
            } else {
                alert('No se pudo abrir la carpeta de logs: ' + (res?.error || 'Error desconocido'));
            }
        } catch (e) {
            alert('Error al abrir logs: ' + e.message);
        }
    },

    async generateReport(userNote = '') {
        const curProj = (typeof settings !== 'undefined' && settings.currentProject) 
            ? (settings.currentProject.name || settings.currentProject.id) : 'Desconocido';
        const locMode = (typeof settings !== 'undefined' && settings.syncEnvData) 
            ? (settings.syncEnvData.locationMode || 'auto') : 'auto';
        const zInfo = (typeof getZEnvStatusLabel === 'function') 
            ? getZEnvStatusLabel() : 'Desconocido';

        const lastError = this.entries.filter(e => e.status === 'error' || e.type === 'error').pop()?.message || '';

        try {
            const res = await fetch('/api/logs/generate-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: curProj,
                    locationMode: locMode,
                    zInfo: zInfo,
                    lastError: lastError,
                    userNote: userNote
                })
            }).then(r => r.json());

            if (res && res.success) {
                if (navigator.clipboard && res.content) {
                    await navigator.clipboard.writeText(res.content);
                }

                if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                    settings.showToast('📦 Reporte generado en logs/reports/ y copiado al portapapeles', 'success', 4);
                } else {
                    alert('✅ Reporte generado con éxito en logs/reports/ y copiado al portapapeles.');
                }
                return res;
            } else {
                alert('No se pudo generar el reporte: ' + (res?.error || 'Error desconocido'));
            }
        } catch (e) {
            alert('Error al generar reporte: ' + e.message);
        }
    },

    async copyLogs() {
        if (this.entries.length === 0) {
            alert('La consola está vacía.');
            return;
        }

        const lines = this.entries.map(e => `[${e.time}] [${e.type.toUpperCase()}/${e.status.toUpperCase()}] ${e.message}`);
        const fullText = lines.join('\n');

        try {
            await navigator.clipboard.writeText(fullText);
            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast(`📋 ${this.entries.length} registros copiados al portapapeles`, 'success', 3);
            } else {
                alert(`✅ ${this.entries.length} registros copiados al portapapeles.`);
            }
        } catch (e) {
            alert('Error al copiar al portapapeles: ' + e.message);
        }
    },

    _appendEntry(entry) {
        const body = document.getElementById('console-body');
        if (!body) return;

        const row = document.createElement('div');
        row.className = `console-entry ${entry.status === 'error' ? 'is-error' : ''}`;

        const typeIcons = {
            'system': '⚙️',
            'copy': '📋',
            'rename': '✏️',
            'delete': '🗑️',
            'mkdir': '📁',
            'write': '💾',
            'read': '📖',
            'sync': '🔄',
            'error': '❌',
            'info': 'ℹ️',
            'audit': '🪞'
        };

        const statusColors = {
            'ok': '#4CAF50',
            'error': '#ff5252',
            'warn': '#FF9800',
            'pending': '#4fc3f7',
            'info': '#a0a0a0'
        };

        const icon = typeIcons[entry.type] || 'ℹ️';
        const color = statusColors[entry.status] || '#a0a0a0';

        row.innerHTML = `
            <span class="console-time">${entry.time}</span>
            <span class="console-icon">${icon}</span>
            <span class="console-msg" style="color:${color};">${entry.message}</span>
        `;

        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
    },

    clear() {
        this.entries = [];
        this.errorCount = 0;
        this.updateErrorBadge(true);
        const body = document.getElementById('console-body');
        if (body) body.innerHTML = '';
        const countEl = document.getElementById('console-count');
        if (countEl) countEl.innerText = '0 eventos';
        this.log('system', 'Consola limpiada.', 'info');
    },

    scrollToBottom() {
        const body = document.getElementById('console-body');
        if (body) body.scrollTop = body.scrollHeight;
    },

    _renderFiltered() {
        const body = document.getElementById('console-body');
        if (!body) return;
        body.innerHTML = '';
        const matching = this.entries.filter(e => this._entryMatchesFilter(e));
        matching.forEach(e => this._appendEntry(e));
    },

    _setupResize() {
        const handle = document.getElementById('console-resize-handle');
        if (!handle) return;

        let startY, startH;

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY = e.clientY;
            startH = this._height;

            const onMove = (ev) => {
                const delta = startY - ev.clientY;
                const newH = Math.max(90, Math.min(window.innerHeight - 120, startH + delta));
                this._height = newH;
                this.container.style.height = newH + 'px';

                const main = document.querySelector('.main-container');
                if (main) {
                    main.style.height = `calc(100vh - 60px - ${newH}px)`;
                }
            };

            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }
};

// --- GLOBAL EXPORTS & HELPERS ---
window.PipetaConsole = PipetaConsole;

// Alias canónico para cualquier llamada en el código
window.logConsole = function(msg, status = 'info', type = 'sync') {
    PipetaConsole.log(type, msg, status);
};

function toggleConsole() {
    if (!PipetaConsole.container) PipetaConsole.init();
    PipetaConsole.toggle();
}
window.toggleConsole = toggleConsole;

// ================================================================
// AUTOMATIC GLOBAL ERROR & WARNING CAPTURE
// ================================================================
window.addEventListener('error', (event) => {
    const msg = event.message || 'Error no controlado';
    const loc = event.filename ? ` (${event.filename.split(/[\\/]/).pop()}:${event.lineno})` : '';
    PipetaConsole.log('error', `[JS ERROR] ${msg}${loc}`, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason ? (event.reason.message || event.reason) : 'Promesa no manejada';
    PipetaConsole.log('error', `[PROMISE ERROR] ${reason}`, 'error');
});

// Mirror console.error to PipetaConsole
const _nativeConsoleWarn = window.console.warn;
window.console.warn = function(...args) {
    _nativeConsoleWarn.apply(console, args);
    const msg = args.map(a => (a && a.message) ? a.message : (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    PipetaConsole.log('warn', msg, 'warn');
};

const _nativeConsoleError = window.console.error;
window.console.error = function(...args) {
    _nativeConsoleError.apply(window.console, args);
    try {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        PipetaConsole.log('error', msg, 'error');
    } catch(e) {}
};

// ================================================================
// API INTERCEPTOR — Auto-log all API.fs file operations
// ================================================================
function _wrapAPIforConsole() {
    if (!window.API || !window.API.fs) return;
    const fs = window.API.fs;

    // --- writeFile ---
    const origWrite = fs.writeFile;
    fs.writeFile = async (path, content) => {
        PipetaConsole.log('write', `Escribiendo: ${path}`, 'pending');
        const res = await origWrite(path, content);
        if (res && res.error) {
            PipetaConsole.log('write', `❌ Error escribiendo: ${path} — ${res.error}`, 'error');
        } else {
            PipetaConsole.log('write', `✓ Escrito: ${path}`, 'ok');
        }
        return res;
    };

    // --- deleteFile ---
    const origDelete = fs.deleteFile;
    fs.deleteFile = async (path) => {
        PipetaConsole.log('delete', `Eliminando archivo: ${path}`, 'pending');
        const res = await origDelete(path);
        if (res && !res.success) {
            PipetaConsole.log('delete', `❌ Error eliminando: ${path}`, 'error');
        } else {
            PipetaConsole.log('delete', `✓ Eliminado: ${path}`, 'ok');
        }
        return res;
    };

    // --- mkdir ---
    const origMkdir = fs.mkdir;
    fs.mkdir = async (path) => {
        PipetaConsole.log('mkdir', `Creando carpeta: ${path}`, 'pending');
        const res = await origMkdir(path);
        if (res && res.error) {
            PipetaConsole.log('mkdir', `❌ Error creando carpeta: ${path} — ${res.error}`, 'error');
        } else {
            PipetaConsole.log('mkdir', `✓ Carpeta creada: ${path}`, 'ok');
        }
        return res;
    };

    // --- rename ---
    const origRename = fs.rename;
    fs.rename = async (oldPath, newPath) => {
        PipetaConsole.log('rename', `Renombrando: ${oldPath} → ${newPath}`, 'pending');
        const res = await origRename(oldPath, newPath);
        if (res && res.error) {
            PipetaConsole.log('rename', `❌ Error renombrando: ${oldPath} — ${res.error}`, 'error');
        } else {
            PipetaConsole.log('rename', `✓ Renombrado: ${oldPath} → ${newPath}`, 'ok');
        }
        return res;
    };

    // --- copy ---
    const origCopy = fs.copy;
    fs.copy = async (src, dest) => {
        PipetaConsole.log('copy', `Copiando: ${src} → ${dest}`, 'pending');
        const res = await origCopy(src, dest);
        if (res && res.error) {
            PipetaConsole.log('copy', `❌ Error copiando: ${src} — ${res.error}`, 'error');
        } else {
            PipetaConsole.log('copy', `✓ Copiado: ${src} → ${dest}`, 'ok');
        }
        return res;
    };

    // --- delete (folder) ---
    const origDel = fs.delete;
    fs.delete = async (path) => {
        PipetaConsole.log('delete', `Eliminando carpeta: ${path}`, 'pending');
        const res = await origDel(path);
        if (res && res.error) {
            PipetaConsole.log('delete', `❌ Error eliminando: ${path} — ${res.error}`, 'error');
        } else {
            PipetaConsole.log('delete', `✓ Eliminado: ${path}`, 'ok');
        }
        return res;
    };

    // --- open in explorer ---
    const origOpen = fs.open;
    if (origOpen) {
        fs.open = async (path) => {
            PipetaConsole.log('system', `📂 Abriendo en Explorador: ${path}`, 'info');
            return origOpen(path);
        };
    }
}

// Init on load
PipetaConsole.init();
_wrapAPIforConsole();

