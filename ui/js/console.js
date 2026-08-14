// ================================================
// PIPETA CONSOLE — Activity Log Panel
// Bottom panel that shows all API operations.
// Persists logs to disk as JSONL daily files.
// ================================================

const PipetaConsole = {
    isVisible: false,
    entries: [],
    maxEntries: 500,
    container: null,
    resizeHandle: null,
    _height: 200,
    _rawWriteFile: null,   // Original writeFile (before intercept) to avoid loop
    _rawMkdir: null,       // Original mkdir
    _logBuffer: [],        // Buffer for batching writes
    _flushTimer: null,
    _logDirCreated: false,

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
                </div>
                <div style="display:flex; gap:4px;">
                    <button class="console-action-btn" onclick="PipetaConsole.clear()" title="Limpiar">🗑</button>
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

        // Log init
        this.log('system', 'Consola inicializada', 'ok');
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

        // Update header button active state
        const btn = document.getElementById('btn-console-toggle');
        if (btn) {
            btn.classList.toggle('active', this.isVisible);
        }
    },

    log(type, message, status) {
        const now = new Date();
        const time = now.toLocaleTimeString('es-AR', { hour12: false });
        const isoTime = now.toISOString();

        const entry = { type, message, status, time, isoTime };
        this.entries.push(entry);

        // Trim if too many
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }

        // Render if visible
        if (this.isVisible) {
            this._appendEntry(entry);
        }

        // Update count badge
        const countEl = document.getElementById('console-count');
        if (countEl) countEl.innerText = `${this.entries.length} eventos`;

        // Persist to disk (buffered)
        this._persistEntry(entry);
    },

    // --- DISK PERSISTENCE ---
    _persistEntry(entry) {
        // Check if logging is enabled
        if (typeof settings !== 'undefined' && !settings.loggingEnabled) return;

        // Buffer the entry
        this._logBuffer.push(entry);

        // Debounce flush (batch writes every 2 seconds)
        if (this._flushTimer) clearTimeout(this._flushTimer);
        this._flushTimer = setTimeout(() => this._flushToDisk(), 2000);
    },

    async _flushToDisk() {
        if (this._logBuffer.length === 0) return;
        if (!this._rawWriteFile) return; // Not ready yet

        const logsPath = (typeof settings !== 'undefined' && settings.logsPath)
            ? settings.logsPath
            : 'C:\\TOOLS\\APPS\\Pipeta\\logs';

        // Ensure log directory exists (once per session)
        if (!this._logDirCreated && this._rawMkdir) {
            try {
                await this._rawMkdir(logsPath);
                this._logDirCreated = true;
            } catch (e) {
                // Directory might already exist, that's fine
                this._logDirCreated = true;
            }
        }

        // Build daily filename
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filePath = logsPath.replace(/\\/g, '/') + `/pipeta_${today}.jsonl`;

        // Build JSONL content from buffer
        const lines = this._logBuffer.map(entry => JSON.stringify({
            time: entry.isoTime,
            type: entry.type,
            status: entry.status,
            message: entry.message
        }));

        // Clear buffer before async write
        const batch = [...this._logBuffer];
        this._logBuffer = [];

        try {
            // Read existing content first (append mode)
            let existing = '';
            try {
                const res = await fetch(`/api/fs/readFile?path=${encodeURIComponent(filePath)}`);
                const data = await res.json();
                if (data && data.content) existing = data.content;
            } catch (e) {
                // File doesn't exist yet, start fresh
            }

            // Append new lines
            const newContent = existing
                ? existing.trimEnd() + '\n' + lines.join('\n') + '\n'
                : lines.join('\n') + '\n';

            await this._rawWriteFile(filePath, newContent);
        } catch (e) {
            console.warn('PipetaConsole: Error writing log to disk:', e);
            // Re-queue failed entries
            this._logBuffer = [...batch, ...this._logBuffer];
        }
    },

    _appendEntry(entry) {
        const body = document.getElementById('console-body');
        if (!body) return;

        const row = document.createElement('div');
        row.className = 'console-entry';

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
            'inspector': '🔍'
        };

        const statusColors = {
            'ok': '#4CAF50',
            'error': '#f44336',
            'warn': '#FF9800',
            'pending': '#4fc3f7',
            'info': '#888'
        };

        const icon = typeIcons[entry.type] || 'ℹ️';
        const color = statusColors[entry.status] || '#888';

        row.innerHTML = `
            <span class="console-time">${entry.time}</span>
            <span class="console-icon">${icon}</span>
            <span class="console-msg" style="color:${color};">${entry.message}</span>
        `;

        body.appendChild(row);

        // Auto-scroll to bottom
        body.scrollTop = body.scrollHeight;
    },

    clear() {
        this.entries = [];
        const body = document.getElementById('console-body');
        if (body) body.innerHTML = '';
        const countEl = document.getElementById('console-count');
        if (countEl) countEl.innerText = '0 eventos';
        this.log('system', 'Consola limpiada', 'info');
    },

    scrollToBottom() {
        const body = document.getElementById('console-body');
        if (body) body.scrollTop = body.scrollHeight;
    },

    // Re-render all entries (used when toggling visibility)
    _renderAll() {
        const body = document.getElementById('console-body');
        if (!body) return;
        body.innerHTML = '';
        this.entries.forEach(e => this._appendEntry(e));
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
                const newH = Math.max(80, Math.min(window.innerHeight - 120, startH + delta));
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

// --- GLOBAL TOGGLE ---
window.PipetaConsole = PipetaConsole;

function toggleConsole() {
    if (!PipetaConsole.container) PipetaConsole.init();

    // Re-render entries if opening and they were added while hidden
    if (!PipetaConsole.isVisible) {
        PipetaConsole.toggle();
        PipetaConsole._renderAll();
    } else {
        PipetaConsole.toggle();
    }
}

// ================================================
// API INTERCEPTOR — Auto-log all API.fs operations
// ================================================
function _wrapAPIforConsole() {
    if (!window.API || !window.API.fs) return;
    const fs = window.API.fs;

    // Save raw references BEFORE wrapping (for log persistence, avoids infinite loop)
    PipetaConsole._rawWriteFile = fs.writeFile.bind(fs);
    PipetaConsole._rawMkdir = fs.mkdir.bind(fs);

    // --- writeFile ---
    const origWrite = fs.writeFile;
    fs.writeFile = async (path, content) => {
        PipetaConsole.log('write', `Escribiendo: ${path}`, 'pending');
        const res = await origWrite(path, content);
        if (res && res.error) {
            PipetaConsole.log('write', `Error escribiendo: ${path} — ${res.error}`, 'error');
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
            PipetaConsole.log('delete', `Error eliminando: ${path}`, 'error');
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
            PipetaConsole.log('mkdir', `Error creando carpeta: ${path} — ${res.error}`, 'error');
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
            PipetaConsole.log('rename', `Error renombrando: ${oldPath} — ${res.error}`, 'error');
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
            PipetaConsole.log('copy', `Error copiando: ${src} — ${res.error}`, 'error');
        } else {
            PipetaConsole.log('copy', `✓ Copiado: ${src} → ${dest}`, 'ok');
        }
        return res;
    };

    // --- delete (folder) ---
    const origDel = fs.delete;
    fs.delete = async (path) => {
        PipetaConsole.log('delete', `Eliminando: ${path}`, 'pending');
        const res = await origDel(path);
        if (res && res.error) {
            PipetaConsole.log('delete', `Error eliminando: ${path} — ${res.error}`, 'error');
        } else {
            PipetaConsole.log('delete', `✓ Eliminado: ${path}`, 'ok');
        }
        return res;
    };

    PipetaConsole.log('system', 'API interceptada — todas las operaciones se registrarán aquí.', 'ok');
}

// Init on load
PipetaConsole.init();
_wrapAPIforConsole();
