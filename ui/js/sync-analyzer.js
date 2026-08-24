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
        const savedOmit = localStorage.getItem('pipeta_sync_omit_control');
        this.omitControlFiles = savedOmit !== null ? savedOmit === 'true' : true;
        const savedFoldersOnly = localStorage.getItem('pipeta_sync_only_folders');
        this.onlyFolders = savedFoldersOnly !== null ? savedFoldersOnly === 'true' : false;

        window.syncAnalyzer = this;
        this.renderUI();
    }

    toggleOmitControl(checked) {
        this.omitControlFiles = checked;
        localStorage.setItem('pipeta_sync_omit_control', checked ? 'true' : 'false');
    }

    toggleOnlyFolders(checked) {
        this.onlyFolders = checked;
        localStorage.setItem('pipeta_sync_only_folders', checked ? 'true' : 'false');
        this.renderResults();
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
            <div class="validator-header" id="sync-analyzer-header" onmousedown="window.syncAnalyzer.startDrag(event)">
                <div class="validator-title" style="display:flex; align-items:center; gap:10px;">
                    <span class="validator-icon" style="font-size:1.2rem;">🔄</span>
                    <b style="font-weight:bold;">Sync Analyzer</b>
                    <span id="sync-engine-badge" style="font-size:0.7rem; background:#333; padding:2px 6px; border-radius:4px; margin-left:6px; color:#aaa;" title="Motor de copia activo">${engineIcon} ${engine.toUpperCase()}</span>
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
                        Compara la estructura entre <b style="color:#4fc3f7;">Local (Z:)</b> y <b style="color:#81c784;">Online (G:)</b>
                    </div>
                    <div style="display:flex; gap:5px; margin-bottom:6px;">
                        <button class="action-btn-small" style="flex:1;" onclick="syncAnalyzer.runScan('work')">📁 Proyecto</button>
                        <button class="action-btn-small" style="flex:1;" onclick="syncAnalyzer.runScan('media')">🎬 Media</button>
                        <button class="action-btn-small" style="flex:1;" onclick="syncAnalyzer.runScan('selection')">📂 Selección</button>
                    </div>
                    <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:6px; user-select:none;">
                        <input type="checkbox" id="sync-omit-control" ${this.omitControlFiles ? 'checked' : ''} onchange="syncAnalyzer.toggleOmitControl(this.checked)">
                        <span>Omitir archivos de control (<code>vfx_control.json</code>)</span>
                    </label>
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

                <!-- SELECT ALL HEADER (LEFT ALIGNED ABOVE CHECKBOXES) -->
                <div style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px; flex-shrink:0; border-bottom:1px solid #222; background:#181818;">
                    <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:flex; align-items:center; gap:8px; user-select:none;">
                        <input type="checkbox" id="sync-select-all" onchange="syncAnalyzer.toggleSelectAll(this.checked)">
                        <span style="font-weight:bold;">Seleccionar todo</span>
                    </label>
                    <span id="sync-select-summary" style="font-size:0.7rem; color:#888;"></span>
                </div>

                <!-- RESULTS LIST -->
                <div class="val-results" id="sync-results-list" style="flex:1; overflow-y:auto; background:#111; padding:5px; border:1px solid #333;">
                    <div class="empty-state" style="padding:30px; text-align:center; color:#555;">
                        <div style="font-size:2rem; margin-bottom:10px;">🔄</div>
                        Ejecuta un escaneo para analizar diferencias entre Local y Online.
                    </div>
                </div>

                <!-- STATUS BAR (BELOW RESULTS LIST) -->
                <div style="padding:5px 8px; font-size:0.72rem; color:#888; border-top:1px solid #282828; background:#141414; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
                    <div id="sync-status" style="display:flex; align-items:center; gap:6px;">Listo</div>
                </div>

                <!-- FOOTER -->
                <div style="padding:8px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; border-top:1px solid #333; background:#161616;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:6px; user-select:none;">
                            <input type="checkbox" id="sync-folders-only" ${this.onlyFolders ? 'checked' : ''} onchange="syncAnalyzer.toggleOnlyFolders(this.checked)">
                            <span>📁 <b>Solo carpetas</b> (crear estructura vacía, sin transferir archivos)</span>
                        </label>
                        <div style="color:#888; font-size:0.75rem;" id="sync-count-label">0 diffs</div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button id="sync-btn-push" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="syncAnalyzer.syncSelected('push')">
                            ⬆️ Upload
                        </button>
                        <button id="sync-btn-pull" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="syncAnalyzer.syncSelected('pull')">
                            ⬇️ Download
                        </button>
                    </div>
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
    _getAllRoots() {
        const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
        return {
            localWork: (proj && proj.roots?.work) || (typeof ROOTS !== 'undefined' ? ROOTS.work : ''),
            localMedia: (proj && proj.roots?.media) || (typeof ROOTS !== 'undefined' ? ROOTS.media : ''),
            onlineWork: (proj && proj.roots?.onlineWork) || (proj && proj.roots?.work) || '',
            onlineMedia: (proj && proj.roots?.onlineMedia) || (proj && proj.roots?.media) || ''
        };
    }

    _localToOnline(localPath) {
        const r = this._getAllRoots();
        const normPath = localPath.replace(/\\/g, '/');

        // 1. Comprobar Media primero (para evitar colisión de prefijos)
        const normLocalMedia = (r.localMedia || '').replace(/\\/g, '/').replace(/\/+$/, '') + '/';
        if (normLocalMedia.length > 1 && (normPath + '/').toLowerCase().startsWith(normLocalMedia.toLowerCase())) {
            const rel = normPath.substring(normLocalMedia.length - 1);
            return (r.onlineMedia || '').replace(/\/+$/, '') + (rel.startsWith('/') ? rel : '/' + rel);
        }

        // 2. Comprobar Work / Proyecto
        const normLocalWork = (r.localWork || '').replace(/\\/g, '/').replace(/\/+$/, '') + '/';
        if (normLocalWork.length > 1 && (normPath + '/').toLowerCase().startsWith(normLocalWork.toLowerCase())) {
            const rel = normPath.substring(normLocalWork.length - 1);
            return (r.onlineWork || '').replace(/\/+$/, '') + (rel.startsWith('/') ? rel : '/' + rel);
        }
        return null;
    }

    _onlineToLocal(onlinePath) {
        const r = this._getAllRoots();
        const normPath = onlinePath.replace(/\\/g, '/');

        // 1. Comprobar Online Media primero (¡crucial antes de onlineWork para no confundir surf_love_media con surf_love!)
        const normOnlineMedia = (r.onlineMedia || '').replace(/\\/g, '/').replace(/\/+$/, '') + '/';
        if (normOnlineMedia.length > 1 && (normPath + '/').toLowerCase().startsWith(normOnlineMedia.toLowerCase())) {
            const rel = normPath.substring(normOnlineMedia.length - 1);
            return (r.localMedia || '').replace(/\/+$/, '') + (rel.startsWith('/') ? rel : '/' + rel);
        }

        // 2. Comprobar Online Work / Proyecto
        const normOnlineWork = (r.onlineWork || '').replace(/\\/g, '/').replace(/\/+$/, '') + '/';
        if (normOnlineWork.length > 1 && (normPath + '/').toLowerCase().startsWith(normOnlineWork.toLowerCase())) {
            const rel = normPath.substring(normOnlineWork.length - 1);
            return (r.localWork || '').replace(/\/+$/, '') + (rel.startsWith('/') ? rel : '/' + rel);
        }
        return null;
    }

    // --- SCANNING ---
    async runScan(targetScope = 'selection') {
        if (this.isScanning) return;
        const r = this._getAllRoots();

        let scanPairs = [];

        if (targetScope === 'work') {
            if (!r.localWork || !r.onlineWork) {
                this._setStatus('❌ Raíces de Proyecto no configuradas.', '#f44336');
                return;
            }
            scanPairs.push({ local: r.localWork, online: r.onlineWork, label: 'Proyecto' });
        } else if (targetScope === 'media') {
            if (!r.localMedia || !r.onlineMedia) {
                this._setStatus('❌ Raíces de Media no configuradas.', '#f44336');
                return;
            }
            scanPairs.push({ local: r.localMedia, online: r.onlineMedia, label: 'Media' });
        } else if (targetScope === 'all' || targetScope === true) {
            if (r.localWork && r.onlineWork) scanPairs.push({ local: r.localWork, online: r.onlineWork, label: 'Proyecto' });
            if (r.localMedia && r.onlineMedia) scanPairs.push({ local: r.localMedia, online: r.onlineMedia, label: 'Media' });
        } else {
            // Modo Selección
            if (!selectedContextPath) {
                this._setStatus('⚠️ No hay carpeta seleccionada en el explorador.', '#FF9800');
                return;
            }
            const mappedOnline = this._localToOnline(selectedContextPath);
            const mappedLocal = this._onlineToLocal(selectedContextPath);

            if (mappedOnline) {
                scanPairs.push({ local: selectedContextPath, online: mappedOnline, label: 'Selección Local' });
            } else if (mappedLocal) {
                scanPairs.push({ local: mappedLocal, online: selectedContextPath, label: 'Selección Online' });
            } else {
                this._setStatus('⚠️ La selección no pertenece al proyecto actual.', '#FF9800');
                return;
            }
        }

        if (scanPairs.length === 0) {
            this._setStatus('❌ No se encontraron rutas válidas para escanear.', '#f44336');
            return;
        }

        // Mostrar rutas en UI
        document.getElementById('sync-path-local').innerText = scanPairs.map(p => p.local).join(' | ');
        document.getElementById('sync-path-online').innerText = scanPairs.map(p => p.online).join(' | ');

        this.isScanning = true;
        this.differences = [];
        this._setStatus('🔍 Escaneando...', '#4fc3f7');
        document.getElementById('sync-results-list').innerHTML = '<div style="padding:20px; text-align:center; color:#666;"><div class="spinner-small"></div> Analizando estructuras...</div>';

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `Iniciando escaneo (${targetScope}) en Local [${scanPairs.map(p => p.local).join(' | ')}] vs Online [${scanPairs.map(p => p.online).join(' | ')}]`, 'info');
        }

        try {
            for (const pair of scanPairs) {
                await this._compareDirs(pair.local, pair.online, '');
            }
            this.isScanning = false;
            this._setStatus(`✅ Escaneo completo: ${this.differences.length} diferencias encontradas.`, this.differences.length > 0 ? '#FF9800' : '#4CAF50');
            
            if (typeof PipetaConsole !== 'undefined') {
                const level = this.differences.length > 0 ? 'warn' : 'ok';
                PipetaConsole.log('sync', `Escaneo completado: ${this.differences.length} diferencia(s) encontrada(s) (${this.onlyFolders ? 'Modo solo carpetas' : 'Todos'}).`, level);
            }

            this.renderResults();
        } catch (err) {
            this.isScanning = false;
            console.error('SyncAnalyzer scan error:', err);
            this._setStatus('❌ Error durante el escaneo: ' + err.message, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `Error durante el escaneo: ${err.message}`, 'error');
            }
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

        // Build maps by lowercase name for Windows case-insensitivity
        const localMap = new Map();
        localItems.forEach(item => localMap.set(item.name.toLowerCase(), item));

        const onlineMap = new Map();
        onlineItems.forEach(item => onlineMap.set(item.name.toLowerCase(), item));

        // Collect all unique lowercase names
        const allLowerNames = new Set([...localMap.keys(), ...onlineMap.keys()]);

        for (const lowerName of allLowerNames) {
            // Omit control files if option is active
            if (this.omitControlFiles && (lowerName === 'vfx_control.json' || lowerName.endsWith('_control.json'))) {
                continue;
            }

            const localItem = localMap.get(lowerName);
            const onlineItem = onlineMap.get(lowerName);
            const inLocal = !!localItem;
            const inOnline = !!onlineItem;
            const name = localItem ? localItem.name : onlineItem.name;

            const isDir = (localItem && localItem.isDirectory) || (onlineItem && onlineItem.isDirectory);
            // Si 'Solo carpetas' está activo y es un archivo, no registrar diferencia
            if (this.onlyFolders && !isDir) {
                continue;
            }

            const relPath = relativePath ? `${relativePath}/${name}` : name;

            if (inLocal && !inOnline) {
                this.differences.push({
                    name: name,
                    relativePath: relPath,
                    type: 'local-only',
                    isDirectory: !!(localItem && localItem.isDirectory),
                    localPath: localItem.path,
                    onlinePath: onlinePath.replace(/\/+$/, '') + '/' + name,
                    selected: false
                });
                // Si es un directorio exclusivo de local, escanear todo su contenido para permitir selección granular
                if (localItem && localItem.isDirectory) {
                    await this._scanSingleSide(localItem.path, onlinePath.replace(/\/+$/, '') + '/' + name, relPath, 'local-only');
                }
            } else if (!inLocal && inOnline) {
                this.differences.push({
                    name: name,
                    relativePath: relPath,
                    type: 'online-only',
                    isDirectory: !!(onlineItem && onlineItem.isDirectory),
                    localPath: localPath.replace(/\/+$/, '') + '/' + name,
                    onlinePath: onlineItem.path,
                    selected: false
                });
                // Si es un directorio exclusivo de online, escanear todo su contenido para permitir selección granular
                if (onlineItem && onlineItem.isDirectory) {
                    await this._scanSingleSide(localPath.replace(/\/+$/, '') + '/' + name, onlineItem.path, relPath, 'online-only');
                }
            } else if (inLocal && inOnline) {
                // Both exist — if both are directories, recurse
                if (localItem.isDirectory && onlineItem.isDirectory) {
                    await this._compareDirs(localItem.path, onlineItem.path, relPath);
                }
            }
        }

        // Update status counter live
        this._setStatus(`🔍 Escaneando... ${this.differences.length} diferencias · ${relativePath || '/'}`, '#4fc3f7');
    }

    async _scanSingleSide(localDir, onlineDir, relativePath, type) {
        const scanDir = type === 'local-only' ? localDir : onlineDir;
        const dirData = await fetchDir(scanDir).catch(() => ({ error: true, items: [] }));
        const items = (dirData && dirData.items) ? dirData.items : [];

        for (const item of items) {
            const lowerName = item.name.toLowerCase();
            if (this.omitControlFiles && (lowerName === 'vfx_control.json' || lowerName.endsWith('_control.json'))) {
                continue;
            }
            if (this.onlyFolders && !item.isDirectory) {
                continue;
            }
            const relPath = `${relativePath}/${item.name}`;
            const itemLocalPath = type === 'local-only' ? item.path : localDir.replace(/\/+$/, '') + '/' + item.name;
            const itemOnlinePath = type === 'online-only' ? item.path : onlineDir.replace(/\/+$/, '') + '/' + item.name;

            this.differences.push({
                name: item.name,
                relativePath: relPath,
                type: type,
                isDirectory: !!item.isDirectory,
                localPath: itemLocalPath,
                onlinePath: itemOnlinePath,
                selected: false
            });

            if (item.isDirectory) {
                await this._scanSingleSide(itemLocalPath, itemOnlinePath, relPath, type);
            }
        }
    }

    // --- RENDERING ---
    renderResults() {
        const list = document.getElementById('sync-results-list');
        const effectiveDiffs = this.onlyFolders
            ? this.differences.filter(d => d.isDirectory)
            : this.differences;

        const filtered = this.activeFilter === 'all'
            ? effectiveDiffs
            : effectiveDiffs.filter(d => d.type === this.activeFilter);

        // Update badges
        document.getElementById('sync-count-all').innerText = effectiveDiffs.length;
        document.getElementById('sync-count-local').innerText = effectiveDiffs.filter(d => d.type === 'local-only').length;
        document.getElementById('sync-count-online').innerText = effectiveDiffs.filter(d => d.type === 'online-only').length;
        document.getElementById('sync-count-label').innerText = `${effectiveDiffs.length} diffs`;

        if (filtered.length === 0) {
            list.innerHTML = `<div style="padding:30px; text-align:center; color:#4CAF50;">
                <div style="font-size:2rem; margin-bottom:10px;">✅</div>
                ${effectiveDiffs.length === 0 ? 'Las estructuras están sincronizadas.' : 'No hay resultados para este filtro.'}
            </div>`;
            this._updateButtons();
            return;
        }

        // Identificar carpetas que tienen subelementos hijos
        const folderHasChildren = new Set();
        effectiveDiffs.forEach(d => {
            if (d.isDirectory) {
                const prefix = d.relativePath + '/';
                if (effectiveDiffs.some(other => other.relativePath.startsWith(prefix))) {
                    folderHasChildren.add(d.relativePath);
                }
            }
        });

        let html = '';
        filtered.forEach((diff) => {
            // Comprobar si el elemento está oculto por alguna carpeta padre colapsada
            const isHidden = Array.from(this.collapsedFolders || []).some(collapsed => diff.relativePath.startsWith(collapsed + '/'));
            if (isHidden) return;

            const globalIdx = this.differences.indexOf(diff);
            const depth = (diff.relativePath.match(/\//g) || []).length;
            const indentPx = depth * 16;
            const hasKids = folderHasChildren.has(diff.relativePath);
            const isCollapsed = this.collapsedFolders && this.collapsedFolders.has(diff.relativePath);

            const icon = diff.isDirectory ? (hasKids ? (isCollapsed ? '📁' : '📂') : '📁') : '📄';
            const typeColor = diff.type === 'local-only' ? '#4fc3f7' : '#81c784';
            const typeLabel = diff.type === 'local-only' ? 'Solo Local' : 'Solo Online';
            const typeArrow = diff.type === 'local-only' ? '⬆️' : '⬇️';

            const toggleArrow = hasKids 
                ? `<span style="cursor:pointer; display:inline-block; width:14px; text-align:center; color:#ff9800; font-size:0.7rem; user-select:none; margin-right:4px;" onclick="event.stopPropagation(); syncAnalyzer.toggleCollapse('${escapeHtml(diff.relativePath)}')" title="${isCollapsed ? 'Expandir contenido' : 'Colapsar contenido'}">${isCollapsed ? '▶' : '▼'}</span>`
                : `<span style="display:inline-block; width:14px; margin-right:4px;"></span>`;

            const baseName = diff.name || diff.relativePath.split('/').pop();
            const parentPath = diff.relativePath.includes('/') ? diff.relativePath.substring(0, diff.relativePath.lastIndexOf('/')) : '';

            html += `
                <div class="sync-result-row" style="display:grid; grid-template-columns:26px 1fr auto; align-items:center; padding:4px 6px; padding-left:${indentPx + 6}px; border-bottom:1px solid #1a1a1a; font-size:0.78rem; background:${diff.selected ? 'rgba(79,195,247,0.08)' : 'transparent'};">
                    <input type="checkbox" ${diff.selected ? 'checked' : ''} onchange="syncAnalyzer.toggleItem(${globalIdx}, this.checked)">
                    <div style="overflow:hidden; display:flex; align-items:center;">
                        ${toggleArrow}
                        <span style="margin-right:6px;">${icon}</span>
                        <span style="color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(diff.relativePath)}">
                            ${parentPath ? `<span style="color:#666; font-size:0.72rem;">${escapeHtml(parentPath)}/</span>` : ''}<b style="color:${diff.isDirectory ? '#fff' : '#ccc'};">${escapeHtml(baseName)}</b>
                        </span>
                    </div>
                    <span style="color:${typeColor}; font-size:0.68rem; padding:1px 5px; background:${typeColor}18; border-radius:3px; white-space:nowrap; margin-left:6px;">
                        ${typeArrow} ${typeLabel}
                    </span>
                </div>
            `;
        });

        list.innerHTML = html;
        this._updateButtons();
    }

    toggleCollapse(folderPath) {
        if (!this.collapsedFolders) this.collapsedFolders = new Set();
        if (this.collapsedFolders.has(folderPath)) {
            this.collapsedFolders.delete(folderPath);
        } else {
            this.collapsedFolders.add(folderPath);
        }
        this.renderResults();
    }

    toggleItem(idx, checked) {
        const targetDiff = this.differences[idx];
        if (!targetDiff) return;
        targetDiff.selected = checked;

        // Cascada: si es una carpeta, seleccionar/deseleccionar todos sus hijos
        if (targetDiff.isDirectory) {
            const prefix = targetDiff.relativePath + '/';
            this.differences.forEach(d => {
                if (d.relativePath.startsWith(prefix)) {
                    d.selected = checked;
                }
            });
        }

        this._updateSelectAllCheckbox();
        this._updateButtons();
        this.renderResults();
    }

    toggleSelectAll(checked) {
        const effectiveDiffs = this.onlyFolders
            ? this.differences.filter(d => d.isDirectory)
            : this.differences;

        const filtered = this.activeFilter === 'all'
            ? effectiveDiffs
            : effectiveDiffs.filter(d => d.type === this.activeFilter);

        filtered.forEach(d => d.selected = checked);
        this.renderResults();
    }

    _updateSelectAllCheckbox() {
        const cb = document.getElementById('sync-select-all');
        if (!cb) return;
        const effectiveDiffs = this.onlyFolders
            ? this.differences.filter(d => d.isDirectory)
            : this.differences;

        const filtered = this.activeFilter === 'all'
            ? effectiveDiffs
            : effectiveDiffs.filter(d => d.type === this.activeFilter);

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
        const effectiveDiffs = this.onlyFolders
            ? this.differences.filter(d => d.isDirectory)
            : this.differences;

        const selectedLocal = effectiveDiffs.filter(d => d.selected && d.type === 'local-only');
        const selectedOnline = effectiveDiffs.filter(d => d.selected && d.type === 'online-only');

        const pushBtn = document.getElementById('sync-btn-push');
        const pullBtn = document.getElementById('sync-btn-pull');

        pushBtn.disabled = selectedLocal.length === 0;
        pushBtn.style.background = selectedLocal.length > 0 ? '#4fc3f7' : '#444';
        pushBtn.style.color = selectedLocal.length > 0 ? '#000' : '#888';
        pushBtn.innerText = `⬆️ Upload (${selectedLocal.length})`;

        pullBtn.disabled = selectedOnline.length === 0;
        pullBtn.style.background = selectedOnline.length > 0 ? '#81c784' : '#444';
        pullBtn.style.color = selectedOnline.length > 0 ? '#000' : '#888';
        pullBtn.innerText = `⬇️ Download (${selectedOnline.length})`;
    }

    // --- SYNC ACTIONS ---
    async syncSelected(direction) {
        const effectiveDiffs = this.onlyFolders
            ? this.differences.filter(d => d.isDirectory)
            : this.differences;

        const items = effectiveDiffs.filter(d => d.selected);
        if (items.length === 0) return;

        const dirLabel = direction === 'push' ? 'Online' : 'Local';
        const actionVerb = this.onlyFolders ? 'Crear carpetas vacías en' : 'Transferir a';
        const relevant = direction === 'push'
            ? items.filter(d => d.type === 'local-only')
            : items.filter(d => d.type === 'online-only');

        if (relevant.length === 0) {
            alert(`No hay elementos seleccionados para ${dirLabel}.`);
            return;
        }

        if (!confirm(`¿${actionVerb} ${dirLabel} (${relevant.length} elemento(s))?`)) return;

        this._setStatus(`⏳ Sincronizando ${relevant.length} elemento(s)...`, '#4fc3f7');

        // Separate: empty dirs to create vs files/dirs to copy
        const itemsToCopy = [];

        for (const diff of relevant) {
            const src = direction === 'push' ? diff.localPath : diff.onlinePath;
            const dest = direction === 'push' ? diff.onlinePath : diff.localPath;

            itemsToCopy.push({ 
                src, 
                dest, 
                isDirectory: diff.isDirectory,
                onlyFolders: !!this.onlyFolders
            });
        }

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `[${direction.toUpperCase()}] Sincronizando ${relevant.length} elemento(s) hacia ${dirLabel} [Modo: ${this.onlyFolders ? 'Solo carpetas' : 'Archivos y carpetas'}]...`, 'info', itemsToCopy);
            itemsToCopy.forEach(item => {
                PipetaConsole.log('sync', ` ➔ [${direction.toUpperCase()}] ${item.isDirectory ? '📁' : '📄'} ${item.src}  ➡️  ${item.dest}`, 'info');
            });
        }

        try {
            // Use the batch sync endpoint (rclone or native fallback)
            const enginePref = (settings && settings.copyEngine) ? settings.copyEngine : 'auto';
            const res = await fetch('/api/rclone/syncBatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: itemsToCopy,
                    engine: enginePref,
                    onlyFolders: !!this.onlyFolders
                })
            });
            const data = await res.json();

            const engineLabel = data.engine === 'mkdir_only' 
                ? '📁 Solo Carpetas' 
                : (data.engine === 'rclone' ? '🚀 Rclone' : (data.engine === 'native_fallback' ? '⚡ Rclone (Fallback Nativo)' : '📁 Nativo'));
            const msg = data.failed === 0 
                ? `${engineLabel}: ✅ ${data.succeeded} elemento(s) sincronizados con éxito.`
                : `${engineLabel}: ✅ ${data.succeeded} ok, ❌ ${data.failed} error(es).`;
            this._setStatus(msg, data.failed > 0 ? '#FF9800' : '#4CAF50');
            
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', msg, data.failed > 0 ? 'error' : 'ok', data);
            }

            alert(msg);
        } catch (e) {
            this._setStatus(`❌ Error de conexión: ${e.message}`, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `Error de conexión en sincronización: ${e.message}`, 'error');
            }
            alert(`Error: ${e.message}`);
        }
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
