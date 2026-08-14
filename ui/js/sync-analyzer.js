// ================================================
// SYNC ANALYZER — Local (Z:) ↔ Online (M:/Z/)
// Detects structural differences and allows repair.
// ================================================

class SyncAnalyzer {
    constructor() {
        this.isVisible = false;
        this.differences = [];
        this.isScanning = false;
        this.scanPath = null;

        window.syncAnalyzer = this;
        this.renderUI();
    }

    renderUI() {
        if (document.getElementById('sync-analyzer-window')) return;

        this.container = document.createElement('div');
        this.container.id = 'sync-analyzer-window';
        this.container.className = 'validator-window';
        this.container.style.display = 'none';

        // Resizable & Positioned
        this.container.style.width = '700px';
        this.container.style.height = '600px';
        this.container.style.minWidth = '450px';
        this.container.style.minHeight = '350px';
        this.container.style.resize = 'both';
        this.container.style.overflow = 'hidden';
        this.container.style.top = '80px';
        this.container.style.left = '150px';

        const engine = (settings && settings.copyEngine) ? settings.copyEngine : 'auto';
        let engineIcon = '🤖'; // Auto
        if (engine === 'rclone') engineIcon = '🚀';
        if (engine === 'native') engineIcon = '📁';

        this.container.innerHTML = `
            <div class="validator-header" onmousedown="window.syncAnalyzer.startDrag(event)">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:1.2rem;">🔄</span>
                    <span style="font-weight:bold;">Sync Analyzer</span>
                    <span class="engine-badge" title="Motor de Copia: ${engine.toUpperCase()}" 
                          style="font-size:0.75rem; background:#333; padding:2px 6px; border-radius:4px; cursor:help;">
                          ${engineIcon} ${engine.toUpperCase()}
                    </span>
                </div>
                <div class="validator-controls">
                    <button class="icon-btn-mini" onclick="window.syncAnalyzer.minimize(this)">-</button>
                    <button class="icon-btn-mini" style="color:#f44336;" onclick="window.syncAnalyzer.toggle()">✕</button>
                </div>
            </div>
            <div class="validator-body" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                <!-- INFO -->
                <div style="padding:8px; background:#1a1a1a; border-bottom:1px solid #333; flex-shrink:0;">
                    <div style="font-size:0.75rem; color:#888; margin-bottom:6px;">
                        Compara la estructura entre <b style="color:#4fc3f7;">Local (Z:)</b> y <b style="color:#81c784;">Online (M:/Z/)</b>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="action-btn-small" style="flex:1;" onclick="syncAnalyzer.runScan(true)">🌎 Scan Completo</button>
                        <button class="action-btn-small" style="flex:1;" onclick="syncAnalyzer.runScan(false)">📂 Scan Selección</button>
                    </div>
                </div>

                <!-- PATHS DISPLAY -->
                <div id="sync-paths-display" style="padding:6px 8px; font-size:0.7rem; color:#666; border-bottom:1px solid #222; flex-shrink:0; display:flex; gap:10px;">
                    <span>LOCAL: <b id="sync-path-local" style="color:#4fc3f7;">-</b></span>
                    <span>|</span>
                    <span>ONLINE: <b id="sync-path-online" style="color:#81c784;">-</b></span>
                </div>

                <!-- FILTER TABS -->
                <div style="display:flex; border-bottom:1px solid #333; flex-shrink:0;">
                    <button class="sync-filter-tab active" data-filter="all" onclick="syncAnalyzer.setFilter('all', this)">
                        Todos <span id="sync-count-all" class="sync-badge">0</span>
                    </button>
                    <button class="sync-filter-tab" data-filter="local-only" onclick="syncAnalyzer.setFilter('local-only', this)">
                        Solo Local <span id="sync-count-local" class="sync-badge" style="background:#4fc3f7; color:#000;">0</span>
                    </button>
                    <button class="sync-filter-tab" data-filter="online-only" onclick="syncAnalyzer.setFilter('online-only', this)">
                        Solo Online <span id="sync-count-online" class="sync-badge" style="background:#81c784; color:#000;">0</span>
                    </button>
                </div>

                <!-- STATUS + SELECT ALL -->
                <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; flex-shrink:0; border-bottom:1px solid #222;">
                    <div id="sync-status" style="font-size:0.7rem; color:#888;">Listo</div>
                    <label style="font-size:0.7rem; color:#888; cursor:pointer; display:flex; align-items:center; gap:4px;">
                        <input type="checkbox" id="sync-select-all" onchange="syncAnalyzer.toggleSelectAll(this.checked)"> Seleccionar todo
                    </label>
                </div>

                <!-- RESULTS LIST -->
                <div class="val-results" id="sync-results-list" style="flex:1; overflow-y:auto; background:#111; padding:5px; border:1px solid #333;">
                    <div class="empty-state" style="padding:30px; text-align:center; color:#555;">
                        <div style="font-size:2rem; margin-bottom:10px;">🔄</div>
                        Ejecuta un escaneo para analizar diferencias entre Local y Online.
                    </div>
                </div>

                <!-- FOOTER -->
                <div style="padding:8px; display:flex; gap:8px; flex-shrink:0; border-top:1px solid #333;">
                    <button id="sync-btn-push" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="syncAnalyzer.syncSelected('push')">
                        ⬆️ Subir a Online
                    </button>
                    <button id="sync-btn-pull" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="syncAnalyzer.syncSelected('pull')">
                        ⬇️ Bajar a Local
                    </button>
                    <div style="color:#666; font-size:0.7rem; align-self:center; min-width:60px; text-align:right;" id="sync-count-label">0 diffs</div>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);
        this.activeFilter = 'all';
    }

    // --- WINDOW CONTROLS ---

    toggle() {
        this.isVisible = !this.isVisible;
        this.container.style.display = this.isVisible ? 'flex' : 'none';
    }

    minimize(btn) {
        const body = this.container.querySelector('.validator-body');
        const isMin = body.style.display === 'none';
        body.style.display = isMin ? 'flex' : 'none';
        this.container.style.height = isMin ? '600px' : 'auto';
        this.container.style.resize = isMin ? 'both' : 'none';
        btn.innerText = isMin ? '-' : '□';
    }

    // --- DRAG ---
    startDrag(e) {
        if (e.target.tagName === 'BUTTON') return;
        this._dragOff = {
            x: e.clientX - this.container.offsetLeft,
            y: e.clientY - this.container.offsetTop
        };
        const moveH = ev => this.onDragMove(ev);
        const upH = () => { document.removeEventListener('mousemove', moveH); document.removeEventListener('mouseup', upH); };
        document.addEventListener('mousemove', moveH);
        document.addEventListener('mouseup', upH);
    }

    onDragMove(e) {
        this.container.style.left = (e.clientX - this._dragOff.x) + 'px';
        this.container.style.top = (e.clientY - this._dragOff.y) + 'px';
    }

    // --- PATH MAPPING ---
    _getLocalRoot() {
        const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
        if (proj && proj.roots) return proj.roots.work;
        return (typeof ROOTS !== 'undefined') ? ROOTS.work : null;
    }

    _getOnlineRoot() {
        const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
        if (proj && proj.roots) return proj.roots.onlineWork || proj.roots.work;
        return (typeof ROOTS !== 'undefined') ? ROOTS.work : null;
    }

    _localToOnline(localPath) {
        const localRoot = this._getLocalRoot();
        const onlineRoot = this._getOnlineRoot();
        if (!localRoot || !onlineRoot) return null;

        const normLocal = localRoot.replace(/\\/g, '/').replace(/\/+$/, '');
        const normPath = localPath.replace(/\\/g, '/');

        if (normPath.toLowerCase().startsWith(normLocal.toLowerCase())) {
            const relative = normPath.substring(normLocal.length);
            return onlineRoot.replace(/\/+$/, '') + relative;
        }
        return null;
    }

    _onlineToLocal(onlinePath) {
        const localRoot = this._getLocalRoot();
        const onlineRoot = this._getOnlineRoot();
        if (!localRoot || !onlineRoot) return null;

        const normOnline = onlineRoot.replace(/\\/g, '/').replace(/\/+$/, '');
        const normPath = onlinePath.replace(/\\/g, '/');

        if (normPath.toLowerCase().startsWith(normOnline.toLowerCase())) {
            const relative = normPath.substring(normOnline.length);
            return localRoot.replace(/\/+$/, '') + relative;
        }
        return null;
    }

    // --- SCANNING ---
    async runScan(isGlobal) {
        if (this.isScanning) return;

        const localRoot = this._getLocalRoot();
        const onlineRoot = this._getOnlineRoot();

        if (!localRoot || !onlineRoot) {
            this._setStatus('❌ No se pudieron determinar las raíces Local/Online.', '#f44336');
            return;
        }

        let scanLocalPath = localRoot;
        let scanOnlinePath = onlineRoot;

        if (!isGlobal) {
            // Use selected path
            if (!selectedContextPath) {
                this._setStatus('⚠️ No hay carpeta seleccionada. Usa el explorador.', '#FF9800');
                return;
            }

            const normSel = selectedContextPath.replace(/\\/g, '/');
            const normLocalRoot = localRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
            const normOnlineRoot = onlineRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

            if (normSel.toLowerCase().startsWith(normLocalRoot)) {
                scanLocalPath = selectedContextPath;
                scanOnlinePath = this._localToOnline(selectedContextPath);
            } else if (normSel.toLowerCase().startsWith(normOnlineRoot)) {
                scanOnlinePath = selectedContextPath;
                scanLocalPath = this._onlineToLocal(selectedContextPath);
            } else {
                this._setStatus('⚠️ La selección no pertenece al proyecto configurado.', '#FF9800');
                return;
            }
        }

        // Update UI
        document.getElementById('sync-path-local').innerText = scanLocalPath;
        document.getElementById('sync-path-online').innerText = scanOnlinePath;

        this.isScanning = true;
        this.differences = [];
        this._setStatus('🔍 Escaneando...', '#4fc3f7');
        document.getElementById('sync-results-list').innerHTML = '<div style="padding:20px; text-align:center; color:#666;"><div class="spinner-small"></div> Analizando estructuras...</div>';

        try {
            await this._compareDirs(scanLocalPath, scanOnlinePath, '');
            this.isScanning = false;
            this._setStatus(`✅ Escaneo completo: ${this.differences.length} diferencias encontradas.`, this.differences.length > 0 ? '#FF9800' : '#4CAF50');
            this.renderResults();
        } catch (err) {
            this.isScanning = false;
            console.error('SyncAnalyzer scan error:', err);
            this._setStatus('❌ Error durante el escaneo: ' + err.message, '#f44336');
        }
    }

    async _compareDirs(localPath, onlinePath, relativePath) {
        // Fetch both directories in parallel
        const [localData, onlineData] = await Promise.all([
            fetchDir(localPath).catch(() => ({ error: true, items: [] })),
            fetchDir(onlinePath).catch(() => ({ error: true, items: [] }))
        ]);

        const localItems = (localData && localData.items) ? localData.items : [];
        const onlineItems = (onlineData && onlineData.items) ? onlineData.items : [];

        // Build maps by name
        const localMap = new Map();
        localItems.forEach(item => localMap.set(item.name, item));

        const onlineMap = new Map();
        onlineItems.forEach(item => onlineMap.set(item.name, item));

        // Collect all unique names
        const allNames = new Set([...localMap.keys(), ...onlineMap.keys()]);

        for (const name of allNames) {
            const inLocal = localMap.has(name);
            const inOnline = onlineMap.has(name);
            const localItem = localMap.get(name);
            const onlineItem = onlineMap.get(name);

            const relPath = relativePath ? `${relativePath}/${name}` : name;

            if (inLocal && !inOnline) {
                this.differences.push({
                    name: name,
                    relativePath: relPath,
                    type: 'local-only',
                    isDirectory: localItem.isDirectory,
                    localPath: localItem.path,
                    onlinePath: onlinePath.replace(/\/+$/, '') + '/' + name,
                    selected: false
                });
            } else if (!inLocal && inOnline) {
                this.differences.push({
                    name: name,
                    relativePath: relPath,
                    type: 'online-only',
                    isDirectory: onlineItem.isDirectory,
                    localPath: localPath.replace(/\/+$/, '') + '/' + name,
                    onlinePath: onlineItem.path,
                    selected: false
                });
            } else if (inLocal && inOnline) {
                // Both exist — if both are directories, recurse
                if (localItem.isDirectory && onlineItem.isDirectory) {
                    await this._compareDirs(localItem.path, onlineItem.path, relPath);
                }
                // Files that exist in both = OK (no difference to report)
            }
        }

        // Update status counter live
        this._setStatus(`🔍 Escaneando... ${this.differences.length} diferencias · ${relativePath || '/'}`, '#4fc3f7');
    }

    // --- RENDERING ---
    renderResults() {
        const list = document.getElementById('sync-results-list');
        const filtered = this.activeFilter === 'all'
            ? this.differences
            : this.differences.filter(d => d.type === this.activeFilter);

        // Update badges
        document.getElementById('sync-count-all').innerText = this.differences.length;
        document.getElementById('sync-count-local').innerText = this.differences.filter(d => d.type === 'local-only').length;
        document.getElementById('sync-count-online').innerText = this.differences.filter(d => d.type === 'online-only').length;
        document.getElementById('sync-count-label').innerText = `${this.differences.length} diffs`;

        if (filtered.length === 0) {
            list.innerHTML = `<div style="padding:30px; text-align:center; color:#4CAF50;">
                <div style="font-size:2rem; margin-bottom:10px;">✅</div>
                ${this.differences.length === 0 ? 'Las estructuras están sincronizadas.' : 'No hay resultados para este filtro.'}
            </div>`;
            return;
        }

        let html = '';
        filtered.forEach((diff, idx) => {
            const globalIdx = this.differences.indexOf(diff);
            const icon = diff.isDirectory ? '📁' : '📄';
            const typeColor = diff.type === 'local-only' ? '#4fc3f7' : '#81c784';
            const typeLabel = diff.type === 'local-only' ? 'Solo Local' : 'Solo Online';
            const typeArrow = diff.type === 'local-only' ? '⬆️' : '⬇️';

            html += `
                <div class="sync-result-row" style="display:grid; grid-template-columns:30px 1fr auto; align-items:center; padding:6px 5px; border-bottom:1px solid #222; font-size:0.8rem;">
                    <input type="checkbox" ${diff.selected ? 'checked' : ''} onchange="syncAnalyzer.toggleItem(${globalIdx}, this.checked)">
                    <div style="overflow:hidden;">
                        <div style="display:flex; align-items:center; gap:4px;">
                            <span>${icon}</span>
                            <span style="color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${diff.relativePath}</span>
                        </div>
                    </div>
                    <span style="color:${typeColor}; font-size:0.7rem; padding:2px 6px; background:${typeColor}22; border-radius:3px; white-space:nowrap;">
                        ${typeArrow} ${typeLabel}
                    </span>
                </div>
            `;
        });

        list.innerHTML = html;
        this._updateButtons();
    }

    toggleItem(idx, checked) {
        this.differences[idx].selected = checked;
        this._updateSelectAllCheckbox();
        this._updateButtons();
    }

    toggleSelectAll(checked) {
        const filtered = this.activeFilter === 'all'
            ? this.differences
            : this.differences.filter(d => d.type === this.activeFilter);
        filtered.forEach(d => d.selected = checked);
        this.renderResults();
    }

    _updateSelectAllCheckbox() {
        const cb = document.getElementById('sync-select-all');
        if (!cb) return;
        const filtered = this.activeFilter === 'all'
            ? this.differences
            : this.differences.filter(d => d.type === this.activeFilter);
        cb.checked = filtered.length > 0 && filtered.every(d => d.selected);
    }

    setFilter(filter, btn) {
        this.activeFilter = filter;
        // Update tab active state
        this.container.querySelectorAll('.sync-filter-tab').forEach(t => t.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.renderResults();
    }

    _updateButtons() {
        const selectedLocal = this.differences.filter(d => d.selected && d.type === 'local-only');
        const selectedOnline = this.differences.filter(d => d.selected && d.type === 'online-only');

        const pushBtn = document.getElementById('sync-btn-push');
        const pullBtn = document.getElementById('sync-btn-pull');

        pushBtn.disabled = selectedLocal.length === 0;
        pushBtn.style.background = selectedLocal.length > 0 ? '#4fc3f7' : '#444';
        pushBtn.style.color = selectedLocal.length > 0 ? '#000' : '#888';
        pushBtn.innerText = `⬆️ Subir a Online (${selectedLocal.length})`;

        pullBtn.disabled = selectedOnline.length === 0;
        pullBtn.style.background = selectedOnline.length > 0 ? '#81c784' : '#444';
        pullBtn.style.color = selectedOnline.length > 0 ? '#000' : '#888';
        pullBtn.innerText = `⬇️ Bajar a Local (${selectedOnline.length})`;
    }

    // --- SYNC ACTIONS ---
    async syncSelected(direction) {
        const items = this.differences.filter(d => d.selected);
        if (items.length === 0) return;

        const dirLabel = direction === 'push' ? 'Online' : 'Local';
        const relevant = direction === 'push'
            ? items.filter(d => d.type === 'local-only')
            : items.filter(d => d.type === 'online-only');

        if (relevant.length === 0) {
            alert(`No hay elementos seleccionados para ${dirLabel}.`);
            return;
        }

        if (!confirm(`¿Crear ${relevant.length} elemento(s) en ${dirLabel}?`)) return;

        this._setStatus(`⏳ Sincronizando ${relevant.length} elemento(s)...`, '#4fc3f7');

        // Separate: empty dirs to create vs files/dirs to copy
        const dirsToCreate = [];
        const itemsToCopy = [];

        for (const diff of relevant) {
            const src = direction === 'push' ? diff.localPath : diff.onlinePath;
            const dest = direction === 'push' ? diff.onlinePath : diff.localPath;

            if (diff.isDirectory) {
                // Check if it's an empty dir or has content
                itemsToCopy.push({ src, dest, isDirectory: true });
            } else {
                itemsToCopy.push({ src, dest, isDirectory: false });
            }
        }

        try {
            // Use the batch sync endpoint (rclone or native fallback)
            const enginePref = (settings && settings.copyEngine) ? settings.copyEngine : 'auto';
            const res = await fetch('/api/rclone/syncBatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: itemsToCopy,
                    engine: enginePref
                })
            });
            const data = await res.json();

            const engineLabel = data.engine === 'rclone' ? '🚀 Rclone' : '📁 Nativo';
            const msg = `${engineLabel}: ✅ ${data.succeeded} ok` + (data.failed > 0 ? `, ❌ ${data.failed} error(es)` : '');
            this._setStatus(msg, data.failed > 0 ? '#FF9800' : '#4CAF50');
            alert(msg);
        } catch (e) {
            this._setStatus(`❌ Error de conexión: ${e.message}`, '#f44336');
            alert(`Error: ${e.message}`);
        }

        // Re-scan to refresh
        this.runScan(this.scanPath === null);
    }

    // --- HELPERS ---
    _setStatus(text, color) {
        const el = document.getElementById('sync-status');
        if (el) {
            el.innerText = text;
            el.style.color = color || '#888';
        }
    }
}

// --- GLOBAL TOGGLE ---
function toggleSyncAnalyzer() {
    if (!window.syncAnalyzer) {
        new SyncAnalyzer();
    }
    window.syncAnalyzer.toggle();
}

// --- AUTO-INIT ---
if (window.syncAnalyzer && window.syncAnalyzer.container) {
    window.syncAnalyzer.container.remove();
}
new SyncAnalyzer();
