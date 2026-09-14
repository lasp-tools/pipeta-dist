// ================================================
// SYNC ANALYZER — Local (Z:) ↔ Online (M:/Z/)
// Detects structural differences and allows repair.
// ================================================

class SyncAnalyzer {
    constructor() {
        this.isVisible = false;
        this.differences = [];
        this.isScanning = false;
        this.abortScan = false;
        this.abortSync = false;
        this.syncReader = null;
        this.scanPath = null;
        this.collapsedFolders = new Set();

        const savedOnlyShotsAssets = localStorage.getItem('pipeta_sync_only_shots_assets');
        this.onlyShotsAssets = savedOnlyShotsAssets !== null ? savedOnlyShotsAssets === 'true' : true; // Default ON

        const savedOmit = localStorage.getItem('pipeta_sync_omit_control');
        this.omitControlFiles = savedOmit !== null ? savedOmit === 'true' : true;

        const savedFoldersOnly = localStorage.getItem('pipeta_sync_only_folders');
        this.onlyFolders = savedFoldersOnly !== null ? savedFoldersOnly === 'true' : false;

        window.syncAnalyzer = this;
        this.renderUI();
    }

    toggleOnlyShotsAssets(checked) {
        this.onlyShotsAssets = checked;
        localStorage.setItem('pipeta_sync_only_shots_assets', checked ? 'true' : 'false');
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

    stopScan() {
        if (this.isScanning) {
            this.abortScan = true;
            this._setStatus('⏹️ Deteniendo escaneo...', '#ff9800');
            const stopBtn = document.getElementById('sync-stop-scan-btn');
            if (stopBtn) stopBtn.style.display = 'none';
        }
    }

    stopSync() {
        this.abortSync = true;
        if (this.syncReader) {
            try { this.syncReader.cancel(); } catch(e){}
        }
        this._setStatus('⏹️ Transferencia cancelada por el usuario.', '#ff9800');
        this._hideProgressBar();
    }

    renderUI() {
        if (document.getElementById('sync-analyzer-window')) return;

        this.container = document.createElement('div');
        this.container.id = 'sync-analyzer-window';
        this.container.className = 'validator-window';
        this.container.style.display = 'none';

        // Resizable & Positioned
        this.container.style.width = '750px';
        this.container.style.height = '620px';
        this.container.style.minWidth = '500px';
        this.container.style.minHeight = '380px';
        this.container.style.resize = 'both';
        this.container.style.overflow = 'hidden';
        this.container.style.top = '70px';
        this.container.style.left = '120px';

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
            <div class="validator-body" style="display:flex; flex-direction:column; height:100%; overflow:hidden; position:relative;">
                <!-- FLOATING OVERLAY MODAL -->
                <div id="sync-overlay" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:100; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:20px; box-sizing:border-box;">
                    <div id="sync-overlay-content" style="max-width:90%; width:440px; background:#181818; border:1px solid #333; border-radius:8px; padding:20px; box-shadow:0 8px 32px rgba(0,0,0,0.8); text-align:center;"></div>
                </div>

                <!-- INFO & SCOPES -->
                <div style="padding:8px; background:#1a1a1a; border-bottom:1px solid #333; flex-shrink:0;">
                    <div style="font-size:0.75rem; color:#888; margin-bottom:6px;">
                        Compara la estructura entre <b style="color:#4fc3f7;">Local (Z:)</b> y <b style="color:#81c784;">Online (G:)</b>
                    </div>
                    <div style="display:flex; gap:5px; margin-bottom:6px;">
                        <button class="action-btn-small" style="flex:1;" onclick="syncAnalyzer.runScan('work')">📁 Proyecto</button>
                        <button class="action-btn-small" style="flex:1;" onclick="syncAnalyzer.runScan('media')">🎬 Media</button>
                        <button class="action-btn-small" style="flex:1;" onclick="syncAnalyzer.runScan('selection')">📂 Selección</button>
                        <button id="sync-stop-scan-btn" class="tool-btn danger" style="display:none; width:auto; padding:2px 10px; font-size:0.75rem;" onclick="syncAnalyzer.stopScan()">⏹️ Detener</button>
                    </div>
                    <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                        <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:6px; user-select:none;" title="Limita el análisis a carpetas canónicas de episodios, secuencias, shots y assets">
                            <input type="checkbox" id="sync-shots-assets-only" ${this.onlyShotsAssets ? 'checked' : ''} onchange="syncAnalyzer.toggleOnlyShotsAssets(this.checked)">
                            <span>🎯 <b>Solo Shots y Assets</b> (estructura de proyecto)</span>
                        </label>
                        <label style="font-size:0.75rem; color:#ccc; cursor:pointer; display:inline-flex; align-items:center; gap:6px; user-select:none;">
                            <input type="checkbox" id="sync-omit-control" ${this.omitControlFiles ? 'checked' : ''} onchange="syncAnalyzer.toggleOmitControl(this.checked)">
                            <span>Omitir control (<code>vfx_control.json</code>)</span>
                        </label>
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

                <!-- SELECT ALL & COLUMNS HEADER -->
                <div style="display:grid; grid-template-columns:26px 1fr 75px 85px; align-items:center; padding:5px 8px; flex-shrink:0; border-bottom:1px solid #222; background:#181818; font-size:0.72rem; color:#888;">
                    <input type="checkbox" id="sync-select-all" onchange="syncAnalyzer.toggleSelectAll(this.checked)" title="Seleccionar todo">
                    <span style="font-weight:bold; color:#ccc;">Elemento / Ruta</span>
                    <span style="text-align:right; padding-right:6px;">Tamaño</span>
                    <span style="text-align:right;">Estado</span>
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

                    <!-- PROGRESS BAR CONTAINER (UNDERNEATH UPLOAD & DOWNLOAD BUTTONS) -->
                    <div id="sync-progress-container" style="display:none; background:#111; border:1px solid #333; border-radius:6px; padding:8px; margin-top:2px;">
                        <!-- TOP: Direction, counts, speed, eta, stop button -->
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; margin-bottom:5px;">
                            <span id="sync-prog-direction" style="font-weight:bold; color:var(--accent);">⬆️ Transfiriendo...</span>
                            <div style="display:flex; align-items:center; gap:10px; font-family:monospace; font-size:0.72rem; color:#aaa;">
                                <span id="sync-prog-speed" style="color:#4caf50; font-weight:bold;">⚡ 0.0 MB/s</span>
                                <span id="sync-prog-eta" style="color:#ffb74d;">⏱️ ETA: --</span>
                                <button class="tool-btn danger" style="padding:2px 8px; font-size:0.7rem; margin-left:6px;" onclick="syncAnalyzer.stopSync()">⏹️ Detener</button>
                            </div>
                        </div>

                        <!-- TOTAL PROGRESS BAR -->
                        <div style="margin-bottom:6px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:#888; margin-bottom:2px;">
                                <span>Progreso Total (<span id="sync-prog-total-items">0/0</span>)</span>
                                <b id="sync-prog-total-pct" style="color:#eee;">0%</b>
                            </div>
                            <div style="width:100%; height:6px; background:#222; border-radius:3px; overflow:hidden;">
                                <div id="sync-prog-total-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #2196f3, #4caf50); transition:width 0.15s ease;"></div>
                            </div>
                        </div>

                        <!-- CURRENT FILE PROGRESS BAR -->
                        <div>
                            <div style="display:flex; justify-content:space-between; font-size:0.68rem; color:#aaa; margin-bottom:2px;">
                                <span id="sync-prog-file-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%; font-family:monospace;">Archivo actual</span>
                                <b id="sync-prog-file-pct" style="color:#4fc3f7;">0%</b>
                            </div>
                            <div style="width:100%; height:4px; background:#222; border-radius:2px; overflow:hidden;">
                                <div id="sync-prog-file-bar" style="width:0%; height:100%; background:#4fc3f7; transition:width 0.1s ease;"></div>
                            </div>
                        </div>
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

    showOverlay(content) {
        const ov = document.getElementById('sync-overlay');
        const cont = document.getElementById('sync-overlay-content');
        if (ov && cont) {
            if (this._overlayInterval) clearInterval(this._overlayInterval);
            if (this._overlayTimeout) clearTimeout(this._overlayTimeout);
            cont.innerHTML = content;
            ov.style.display = 'flex';
        }
    }

    hideOverlay() {
        if (this._overlayInterval) clearInterval(this._overlayInterval);
        if (this._overlayTimeout) clearTimeout(this._overlayTimeout);
        const ov = document.getElementById('sync-overlay');
        if (ov) ov.style.display = 'none';
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

    async _getKnownProjectShotsAndAssets() {
        const r = this._getAllRoots();
        const workRoot = r.localWork || '';
        const known = {
            knownEpisodes: new Set(),
            knownSequences: new Set(),
            knownShots: new Set(),
            knownAssetCategories: new Set(),
            knownAssets: new Set(),
            knownRootFolders: new Set(['episodios', 'assets', 'media', 'shots', 'secuencias'])
        };

        if (!workRoot) return known;

        try {
            const rootData = await fetchDir(workRoot).catch(() => ({ items: [] }));
            const rootItems = (rootData && rootData.items) ? rootData.items : [];
            
            for (const item of rootItems) {
                if (!item.isDirectory) continue;
                const lower = item.name.toLowerCase();

                if (lower === 'episodios') {
                    const epData = await fetchDir(item.path).catch(() => ({ items: [] }));
                    for (const ep of (epData.items || [])) {
                        if (!ep.isDirectory) continue;
                        const epLower = ep.name.toLowerCase();
                        known.knownEpisodes.add(epLower);
                        known.knownRootFolders.add(epLower);

                        const seqRoot = ep.path + '/secuencias';
                        const seqData = await fetchDir(seqRoot).catch(() => ({ items: [] }));
                        for (const seq of (seqData.items || [])) {
                            if (!seq.isDirectory) continue;
                            const seqLower = seq.name.toLowerCase();
                            known.knownSequences.add(seqLower);

                            const shotsRoot = seq.path + '/shots';
                            const shotsData = await fetchDir(shotsRoot).catch(() => ({ items: [] }));
                            for (const shot of (shotsData.items || [])) {
                                if (shot.isDirectory) {
                                    known.knownShots.add(shot.name.toLowerCase());
                                }
                            }
                        }
                    }
                } else if (/^b\d+|^ep?\d+/i.test(lower)) {
                    known.knownEpisodes.add(lower);
                    known.knownRootFolders.add(lower);
                } else if (lower === 'assets') {
                    known.knownRootFolders.add('assets');
                    const catData = await fetchDir(item.path).catch(() => ({ items: [] }));
                    for (const cat of (catData.items || [])) {
                        if (!cat.isDirectory) continue;
                        const catLower = cat.name.toLowerCase();
                        known.knownAssetCategories.add(catLower);
                        known.knownRootFolders.add(catLower);

                        const astData = await fetchDir(cat.path).catch(() => ({ items: [] }));
                        for (const ast of (astData.items || [])) {
                            if (ast.isDirectory) {
                                known.knownAssets.add(ast.name.toLowerCase());
                            }
                        }
                    }
                }
            }
        } catch(e) {
            console.warn("SyncAnalyzer pre-scan work error:", e);
        }

        return known;
    }

    _isAllowedStructurePath(name, relativePath, depth) {
        if (!this.onlyShotsAssets) return true;
        const lowerName = (name || '').toLowerCase();
        
        // Excluir siempre carpetas fuera de Shots / Assets si está en modo filtro (incluyendo _auxiliar, _temp, etc.)
        if (lowerName.startsWith('_')) return false;

        const ignoredFolders = [
            'admin', 'administracion', 'documentacion', 'docs', 'tools', 'software', 
            'scripts', 'config', 'presets', 'cache', 'temp', 'tmp', '.git', '.gemini', 
            'logs', 'backup', 'backups', 'trash', 'papelera', 'edit', 'offline', 'guiones',
            'offline_edit', 'sound', 'musica', 'audio', 'locucion', 'deliveries', 'exports_general',
            'auxiliar', 'plates_raw', 'footage_raw'
        ];
        if (ignoredFolders.includes(lowerName)) return false;

        if (this.knownProject) {
            // Nivel Raíz (ej. Media / Proyecto)
            if (depth === 0) {
                const isKnownRoot = this.knownProject.knownRootFolders.has(lowerName) 
                    || this.knownProject.knownEpisodes.has(lowerName)
                    || /^b\d+|^ep?\d+/i.test(lowerName)
                    || lowerName === 'episodios' || lowerName === 'assets';
                if (!isKnownRoot) return false;
            }
        }

        return true;
    }

    _calculateCumulativeSizes() {
        this.differences.forEach(diff => {
            if (diff.isDirectory) {
                const prefix = diff.relativePath + '/';
                let totalFolderBytes = 0;
                this.differences.forEach(child => {
                    if (!child.isDirectory && child.relativePath.startsWith(prefix)) {
                        totalFolderBytes += (child.size || 0);
                    }
                });
                diff.size = totalFolderBytes;
            }
        });
    }

    _formatSize(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return bytes + ' B';
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
        this.abortScan = false;
        this.differences = [];
        this.scanScope = targetScope;
        this._setStatus('🔍 Escaneando...', '#4fc3f7');

        const stopBtn = document.getElementById('sync-stop-scan-btn');
        if (stopBtn) stopBtn.style.display = 'inline-block';

        // OVERLAY PROMINENTE DE DETENER ESCANEO EN LA VENTANA CENTRAL
        const resultsEl = document.getElementById('sync-results-list');
        if (resultsEl) {
            resultsEl.innerHTML = `
                <div style="padding:45px 20px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px;">
                    <div class="spinner-small" style="width:36px; height:36px;"></div>
                    <div style="font-size:1.05rem; color:#fff; font-weight:bold;">Analizando estructuras y diferencias...</div>
                    <div id="sync-scan-live-path" style="font-size:0.75rem; color:#aaa; font-family:monospace; max-width:90%; overflow:hidden; text-overflow:ellipsis;">
                        Obteniendo estructura canónica del proyecto...
                    </div>
                    <button class="tool-btn danger" style="padding:8px 28px; font-size:0.9rem; font-weight:bold; width:auto; border-radius:6px; cursor:pointer; box-shadow:0 3px 12px rgba(244,67,54,0.4);" onclick="syncAnalyzer.stopScan()">
                        ⏹️ Detener Escaneo
                    </button>
                </div>
            `;
        }

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `Iniciando escaneo (${targetScope}) en Local [${scanPairs.map(p => p.local).join(' | ')}] vs Online [${scanPairs.map(p => p.online).join(' | ')}] [Filtro Shots/Assets: ${this.onlyShotsAssets ? 'ON' : 'OFF'}]`, 'info');
        }

        try {
            // 1. Obtener estructura conocida de shots/assets del proyecto si el filtro está activo
            if (this.onlyShotsAssets) {
                this.knownProject = await this._getKnownProjectShotsAndAssets();
            } else {
                this.knownProject = null;
            }

            for (const pair of scanPairs) {
                if (this.abortScan) break;
                await this._compareDirs(pair.local, pair.online, '', 0);
            }

            this.isScanning = false;
            if (stopBtn) stopBtn.style.display = 'none';

            // 2. Síntesis de carpetas padre para crear un árbol jerárquico perfecto
            const existingPaths = new Set(this.differences.map(d => d.relativePath));
            const syntheticFolders = [];

            this.differences.forEach(diff => {
                const parts = diff.relativePath.split('/');
                for (let i = 1; i < parts.length; i++) {
                    const parentRel = parts.slice(0, i).join('/');
                    if (!existingPaths.has(parentRel)) {
                        existingPaths.add(parentRel);
                        syntheticFolders.push({
                            name: parts[i - 1],
                            relativePath: parentRel,
                            isDirectory: true,
                            type: diff.type,
                            size: 0,
                            localPath: diff.localPath ? diff.localPath.split('/').slice(0, -(parts.length - i)).join('/') : '',
                            onlinePath: diff.onlinePath ? diff.onlinePath.split('/').slice(0, -(parts.length - i)).join('/') : '',
                            selected: false,
                            isSynthetic: true
                        });
                    }
                }
            });

            this.differences = [...syntheticFolders, ...this.differences];
            this.differences.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

            // 3. Calcular pesos acumulados por carpeta
            this._calculateCumulativeSizes();

            // 4. Colapsar TODAS las carpetas por defecto
            this.collapsedFolders = new Set();
            this.differences.forEach(d => {
                if (d.isDirectory) {
                    this.collapsedFolders.add(d.relativePath);
                }
            });

            if (this.abortScan) {
                this._setStatus(`⏹️ Escaneo detenido: ${this.differences.length} diferencias parciales.`, '#ff9800');
            } else {
                this._setStatus(`✅ Escaneo completo: ${this.differences.length} diferencias encontradas.`, this.differences.length > 0 ? '#FF9800' : '#4CAF50');
            }
            
            if (typeof PipetaConsole !== 'undefined') {
                const level = this.differences.length > 0 ? 'warn' : 'ok';
                PipetaConsole.log('sync', `Escaneo finalizado: ${this.differences.length} diferencia(s) encontrada(s) (${this.onlyFolders ? 'Modo solo carpetas' : 'Todos'}).`, level);
            }

            this.renderResults();
        } catch (err) {
            this.isScanning = false;
            if (stopBtn) stopBtn.style.display = 'none';
            console.error('SyncAnalyzer scan error:', err);
            this._setStatus('❌ Error durante el escaneo: ' + err.message, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `Error durante el escaneo: ${err.message}`, 'error');
            }
        }
    }

    async _compareDirs(localPath, onlinePath, relativePath, depth = 0) {
        if (this.abortScan) return;

        const liveEl = document.getElementById('sync-scan-live-path');
        if (liveEl) liveEl.innerText = `Analizando: ${relativePath || 'Raíz'} (${this.differences.length} diffs)...`;

        // Fetch both directories in parallel
        const [localData, onlineData] = await Promise.all([
            fetchDir(localPath).catch(() => ({ error: true, items: [] })),
            fetchDir(onlinePath).catch(() => ({ error: true, items: [] }))
        ]);

        if (this.abortScan) return;

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
            if (this.abortScan) return;

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

            // Filtrar carpetas fuera de Shots / Assets si la opción está activa
            if (!this._isAllowedStructurePath(name, relativePath, depth)) {
                continue;
            }

            // Si 'Solo carpetas' está activo y es un archivo, no registrar diferencia
            if (this.onlyFolders && !isDir) {
                continue;
            }

            const relPath = relativePath ? `${relativePath}/${name}` : name;
            const itemSize = (localItem ? localItem.size : (onlineItem ? onlineItem.size : 0)) || 0;

            if (inLocal && !inOnline) {
                this.differences.push({
                    name: name,
                    relativePath: relPath,
                    type: 'local-only',
                    isDirectory: !!(localItem && localItem.isDirectory),
                    size: itemSize,
                    localPath: localItem.path,
                    onlinePath: onlinePath.replace(/\/+$/, '') + '/' + name,
                    selected: false
                });
                // Si es un directorio exclusivo de local, escanear todo su contenido para permitir selección granular
                if (localItem && localItem.isDirectory) {
                    await this._scanSingleSide(localItem.path, onlinePath.replace(/\/+$/, '') + '/' + name, relPath, 'local-only', depth + 1);
                }
            } else if (!inLocal && inOnline) {
                this.differences.push({
                    name: name,
                    relativePath: relPath,
                    type: 'online-only',
                    isDirectory: !!(onlineItem && onlineItem.isDirectory),
                    size: itemSize,
                    localPath: localPath.replace(/\/+$/, '') + '/' + name,
                    onlinePath: onlineItem.path,
                    selected: false
                });
                // Si es un directorio exclusivo de online, escanear todo su contenido para permitir selección granular
                if (onlineItem && onlineItem.isDirectory) {
                    await this._scanSingleSide(localPath.replace(/\/+$/, '') + '/' + name, onlineItem.path, relPath, 'online-only', depth + 1);
                }
            } else if (inLocal && inOnline) {
                // Both exist — if both are directories, recurse
                if (localItem.isDirectory && onlineItem.isDirectory) {
                    await this._compareDirs(localItem.path, onlineItem.path, relPath, depth + 1);
                }
            }
        }

        // Update status counter live
        this._setStatus(`🔍 Escaneando... ${this.differences.length} diferencias · ${relativePath || '/'}`, '#4fc3f7');
    }

    async _scanSingleSide(localDir, onlineDir, relativePath, type, depth = 1) {
        if (this.abortScan) return;

        const scanDir = type === 'local-only' ? localDir : onlineDir;
        const dirData = await fetchDir(scanDir).catch(() => ({ error: true, items: [] }));
        const items = (dirData && dirData.items) ? dirData.items : [];

        for (const item of items) {
            if (this.abortScan) return;

            const lowerName = item.name.toLowerCase();
            if (this.omitControlFiles && (lowerName === 'vfx_control.json' || lowerName.endsWith('_control.json'))) {
                continue;
            }
            if (!this._isAllowedStructurePath(item.name, relativePath, depth)) {
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
                size: item.size || 0,
                localPath: itemLocalPath,
                onlinePath: itemOnlinePath,
                selected: false
            });

            if (item.isDirectory) {
                await this._scanSingleSide(itemLocalPath, itemOnlinePath, relPath, type, depth + 1);
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
            const sizeStr = this._formatSize(diff.size);

            html += `
                <div class="sync-result-row" style="display:grid; grid-template-columns:26px 1fr 75px 85px; align-items:center; padding:4px 6px; padding-left:${indentPx + 6}px; border-bottom:1px solid #1a1a1a; font-size:0.78rem; background:${diff.selected ? 'rgba(79,195,247,0.08)' : 'transparent'};">
                    <input type="checkbox" ${diff.selected ? 'checked' : ''} onchange="syncAnalyzer.toggleItem(${globalIdx}, this.checked)">
                    <div style="overflow:hidden; display:flex; align-items:center;">
                        ${toggleArrow}
                        <span style="margin-right:6px;">${icon}</span>
                        <span style="color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(diff.relativePath)}">
                            ${parentPath ? `<span style="color:#666; font-size:0.72rem;">${escapeHtml(parentPath)}/</span>` : ''}<b style="color:${diff.isDirectory ? '#fff' : '#ccc'};">${escapeHtml(baseName)}</b>
                        </span>
                    </div>
                    <span style="font-family:monospace; font-size:0.72rem; color:${diff.isDirectory ? '#bbb' : '#888'}; text-align:right; padding-right:6px; white-space:nowrap;" title="${diff.isDirectory ? 'Peso acumulado de la carpeta' : 'Peso del archivo'}">
                        ${sizeStr}
                    </span>
                    <span style="color:${typeColor}; font-size:0.68rem; padding:1px 5px; background:${typeColor}18; border-radius:3px; white-space:nowrap; text-align:right;">
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
    syncSelected(direction) {
        const effectiveDiffs = this.onlyFolders
            ? this.differences.filter(d => d.isDirectory)
            : this.differences;

        const items = effectiveDiffs.filter(d => d.selected);
        const dirLabel = direction === 'push' ? 'Online (G:)' : 'Local (Z:)';
        const relevant = direction === 'push'
            ? items.filter(d => d.type === 'local-only')
            : items.filter(d => d.type === 'online-only');

        if (relevant.length === 0) {
            this.showOverlay(`
                <div style="font-size:2.4rem; margin-bottom:10px;">⚠️</div>
                <div style="font-size:1.1rem; color:#fff; font-weight:bold; margin-bottom:10px;">Sin Elementos Seleccionados</div>
                <div style="color:#aaa; font-size:0.85rem; margin-bottom:20px; line-height:1.4;">
                    No hay elementos marcados para transferir hacia <b style="color:#fff;">${dirLabel}</b>.
                </div>
                <button onclick="syncAnalyzer.hideOverlay()" style="padding:8px 24px; background:#333; color:white; border:1px solid #444; border-radius:4px; font-weight:bold; cursor:pointer; font-size:0.85rem;">Entendido</button>
            `);
            return;
        }

        const isPush = direction === 'push';
        const accentColor = isPush ? '#4fc3f7' : '#81c784';
        const icon = isPush ? '⬆️' : '⬇️';
        const actionTitle = isPush ? 'Confirmar Subida (Upload)' : 'Confirmar Descarga (Download)';
        const modeText = this.onlyFolders ? '📁 Solo carpetas vacías' : '📦 Archivos y carpetas';

        const previewItems = relevant.slice(0, 6);
        const remainingCount = relevant.length - previewItems.length;
        const previewListHTML = previewItems.map(d => `
            <div style="display:flex; align-items:center; gap:8px; font-size:0.78rem; color:#ccc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:3px 0; border-bottom:1px solid #1e1e1e;">
                <span>${d.isDirectory ? '📁' : '📄'}</span>
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#ddd;">${escapeHtml(d.relativePath)}</span>
            </div>
        `).join('');

        this.showOverlay(`
            <div style="text-align:left;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px; border-bottom:1px solid #333; padding-bottom:10px;">
                    <span style="font-size:1.6rem;">${icon}</span>
                    <div>
                        <div style="font-size:1.15rem; color:#fff; font-weight:bold;">${actionTitle}</div>
                        <div style="font-size:0.75rem; color:#888;">Destino: <b style="color:${accentColor};">${dirLabel}</b></div>
                    </div>
                </div>

                <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px; margin-bottom:14px;">
                    <div style="font-size:0.75rem; color:#888; margin-bottom:8px; display:flex; justify-content:space-between;">
                        <span>Elementos a transferir: <b style="color:#fff;">${relevant.length}</b></span>
                        <span style="color:#aaa;">${modeText}</span>
                    </div>
                    <div style="max-height:130px; overflow-y:auto; padding-right:4px;">
                        ${previewListHTML}
                        ${remainingCount > 0 ? `<div style="font-size:0.72rem; color:#888; margin-top:6px; font-style:italic;">... y ${remainingCount} elemento(s) más.</div>` : ''}
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
                    <button onclick="syncAnalyzer.hideOverlay()" style="padding:8px 18px; background:#2a2a2a; color:#ccc; border:1px solid #444; border-radius:4px; font-weight:bold; font-size:0.85rem; cursor:pointer;">Cancelar</button>
                    <button onclick="syncAnalyzer.enqueueWorkerSync('${direction}')" style="padding:8px 16px; background:#ff9800; color:#000; border:none; border-radius:4px; font-weight:bold; font-size:0.85rem; cursor:pointer;" title="Enviar lote al Worker de la VM 105 para procesar en segundo plano">⚡ Encolar en Worker</button>
                    <button onclick="syncAnalyzer.proceedSync('${direction}')" style="padding:8px 24px; background:${accentColor}; color:#000; border:none; border-radius:4px; font-weight:bold; font-size:0.85rem; cursor:pointer;">CONFIRMAR DIRECTO</button>
                </div>
            </div>
        `);
    }

    async enqueueWorkerSync(direction) {
        this.hideOverlay();
        const effectiveDiffs = this.onlyFolders
            ? this.differences.filter(d => d.isDirectory)
            : this.differences;

        const items = effectiveDiffs.filter(d => d.selected);
        const relevant = direction === 'push'
            ? items.filter(d => d.type === 'local-only')
            : items.filter(d => d.type === 'online-only');

        if (relevant.length === 0) return;

        const proj = (typeof settings !== 'undefined' && settings?.currentProject?.name) ? settings.currentProject.name : 'proyecto';
        const user = (typeof settings !== 'undefined' && settings?.usersData?.activeUser) ? settings.usersData.activeUser : 'artista';

        const orderItems = relevant.map(d => {
            const fileName = d.name || d.relativePath.split('/').pop();
            if (direction === 'push') {
                return {
                    name: fileName,
                    isDir: !!d.isDirectory,
                    localPath: d.localPath,
                    onlinePath: d.onlinePath,
                    relativePath: d.relativePath,
                    size: d.size || 0
                };
            } else {
                return {
                    name: fileName,
                    isDir: !!d.isDirectory,
                    onlinePath: d.onlinePath,
                    targetLocalPath: d.localPath,
                    relativePath: d.relativePath,
                    size: d.size || 0
                };
            }
        });

        const endpoint = direction === 'push' ? '/api/sync/request-upload' : '/api/sync/request-download';
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project: proj,
                    user: user,
                    items: orderItems
                })
            });
            const data = await res.json();
            if (data.success) {
                const label = direction === 'push' ? 'subida' : 'descarga';
                const toastMsg = `Orden de ${label} #${data.orderId.slice(-6)} encolada en Worker (${orderItems.length} items)`;
                if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                    settings.showToast(toastMsg, 'success', 5);
                } else {
                    alert(`✅ ${toastMsg}`);
                }
                if (window.syncQueueUI) {
                    window.syncQueueUI.fetchStatus();
                    window.syncQueueUI.open();
                }
            } else {
                alert(`❌ Error al encolar en Worker: ${data.error}`);
            }
        } catch(err) {
            alert(`❌ Error de conexión: ${err.message}`);
        }
    }

    async proceedSync(direction) {
        this.hideOverlay();

        const effectiveDiffs = this.onlyFolders
            ? this.differences.filter(d => d.isDirectory)
            : this.differences;

        const items = effectiveDiffs.filter(d => d.selected);
        const dirLabel = direction === 'push' ? 'Online' : 'Local';
        const relevant = direction === 'push'
            ? items.filter(d => d.type === 'local-only')
            : items.filter(d => d.type === 'online-only');

        if (relevant.length === 0) return;

        this._setStatus(`⏳ Sincronizando ${relevant.length} elemento(s)...`, '#4fc3f7');

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

        this.abortSync = false;
        this._showProgressBar(direction, relevant.length);

        try {
            const enginePref = (settings && settings.copyEngine) ? settings.copyEngine : 'auto';
            const response = await fetch('/api/rclone/syncStream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: itemsToCopy,
                    engine: enginePref,
                    onlyFolders: !!this.onlyFolders,
                    direction
                })
            });

            if (!response.body) {
                throw new Error("No se pudo inicializar el stream de transferencia.");
            }

            this.syncReader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';
            let completeData = null;

            // Variables para refresco dinámico y throttled del Explorer durante descargas
            let lastRefreshTime = 0;
            let refreshPendingTimeout = null;
            let lastRefreshedItemIndex = 0;

            const triggerExplorerRefresh = () => {
                if (typeof refreshCurrentView === 'function') {
                    refreshCurrentView();
                }
                lastRefreshTime = Date.now();
                if (refreshPendingTimeout) {
                    clearTimeout(refreshPendingTimeout);
                    refreshPendingTimeout = null;
                }
            };

            const scheduleThrottledExplorerRefresh = () => {
                const now = Date.now();
                const timeSinceLast = now - lastRefreshTime;
                if (timeSinceLast >= 3000) {
                    triggerExplorerRefresh();
                } else if (!refreshPendingTimeout) {
                    const delay = 3000 - timeSinceLast;
                    refreshPendingTimeout = setTimeout(() => {
                        triggerExplorerRefresh();
                    }, delay);
                }
            };

            while (true) {
                if (this.abortSync) {
                    try { await this.syncReader.cancel(); } catch(e){}
                    break;
                }

                const { value, done } = await this.syncReader.read();
                if (done || this.abortSync) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const msg = JSON.parse(line);
                        if (msg.type === 'progress') {
                            this._updateProgressBar(msg);

                            // Refresco dinámico durante descarga: si un archivo terminó, refrescar con throttle de 3s
                            if (direction === 'pull') {
                                const currentItem = msg.itemIndex || 0;
                                if (currentItem > lastRefreshedItemIndex && (msg.filePercent === 100 || !msg.filePercent)) {
                                    lastRefreshedItemIndex = currentItem;
                                    scheduleThrottledExplorerRefresh();
                                }
                            }
                        } else if (msg.type === 'complete') {
                            completeData = msg;
                        }
                    } catch (err) {
                        console.warn("Stream parse error:", err, line);
                    }
                }
            }

            this.syncReader = null;

            // Cancelar timeout pendiente y forzar refresco final inmediato del Explorer
            if (refreshPendingTimeout) {
                clearTimeout(refreshPendingTimeout);
                refreshPendingTimeout = null;
            }
            if (typeof refreshCurrentView === 'function') {
                refreshCurrentView();
            }

            if (this.abortSync) {
                this._setStatus('⏹️ Transferencia detenida por el usuario.', '#ff9800');
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', 'Transferencia cancelada por el usuario.', 'warn');
                }
                this._hideProgressBar();
                return;
            }

            const data = completeData || { succeeded: relevant.length, failed: 0 };
            const msg = data.failed === 0 
                ? `✅ ${data.succeeded} elemento(s) sincronizados con éxito.`
                : `⚠️ ${data.succeeded} ok, ❌ ${data.failed} error(es).`;
            this._setStatus(msg, data.failed > 0 ? '#FF9800' : '#4CAF50');
            
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', msg, data.failed > 0 ? 'error' : 'ok', data);
            }

            this._hideProgressBar();
            this.showCompletionModal(data, relevant.length);
        } catch (e) {
            this.syncReader = null;
            this._hideProgressBar();
            if (typeof refreshCurrentView === 'function') {
                refreshCurrentView();
            }
            this._setStatus(`❌ Error de conexión: ${e.message}`, '#f44336');
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `Error en streaming de sincronización: ${e.message}`, 'error');
            }
            this.showOverlay(`
                <div style="padding:10px 5px;">
                    <div style="font-size:2.5rem; margin-bottom:10px;">❌</div>
                    <div style="font-size:1.15rem; color:#f44336; font-weight:bold; margin-bottom:8px;">Error de Conexión</div>
                    <div style="font-size:0.85rem; color:#aaa; margin-bottom:18px;">${e.message}</div>
                    <button onclick="syncAnalyzer.hideOverlay()" style="padding:8px 24px; background:#333; color:#fff; border:1px solid #444; border-radius:4px; font-weight:bold; cursor:pointer;">Cerrar</button>
                </div>
            `);
        }
    }

    showCompletionModal(data, totalCount) {
        const isSuccess = !data.failed || data.failed === 0;
        const icon = isSuccess ? '✅' : '⚠️';
        const title = isSuccess ? 'Sincronización Completada' : 'Sincronización con Advertencias';
        const countSuccess = data.succeeded !== undefined ? data.succeeded : totalCount;
        const msg = isSuccess 
            ? `${countSuccess} elemento(s) transferidos con éxito.`
            : `${countSuccess} ok, ${data.failed} con error.`;

        let secondsLeft = 5;
        this.showOverlay(`
            <div style="padding:10px 5px;">
                <div style="font-size:2.8rem; margin-bottom:10px;">${icon}</div>
                <div style="font-size:1.2rem; color:#fff; font-weight:bold; margin-bottom:8px;">${title}</div>
                <div style="font-size:0.9rem; color:#ddd; margin-bottom:18px;">${msg}</div>
                <div style="display:flex; justify-content:center; gap:10px;">
                    <button onclick="syncAnalyzer.hideOverlay(); if (typeof refreshCurrentView === 'function') refreshCurrentView(); syncAnalyzer.runScan(syncAnalyzer.scanScope || 'selection');" style="padding:8px 28px; background:var(--accent); color:#000; border:none; border-radius:4px; font-weight:bold; font-size:0.85rem; cursor:pointer;">Cerrar</button>
                </div>
                <div id="sync-auto-close-label" style="font-size:0.74rem; color:#777; margin-top:14px;">
                    Cerrando automáticamente en <b id="sync-countdown" style="color:#aaa;">${secondsLeft}s</b>...
                </div>
            </div>
        `);

        this._overlayInterval = setInterval(() => {
            secondsLeft--;
            const countEl = document.getElementById('sync-countdown');
            if (countEl) countEl.innerText = `${secondsLeft}s`;
            if (secondsLeft <= 0) {
                clearInterval(this._overlayInterval);
                this.hideOverlay();
                if (typeof refreshCurrentView === 'function') refreshCurrentView();
                this.runScan(this.scanScope || 'selection');
            }
        }, 1000);
    }

    // --- PROGRESS BAR CONTROLS ---
    _showProgressBar(direction, totalCount) {
        const container = document.getElementById('sync-progress-container');
        if (!container) return;
        container.style.display = 'block';

        const dirEl = document.getElementById('sync-prog-direction');
        const speedEl = document.getElementById('sync-prog-speed');
        const etaEl = document.getElementById('sync-prog-eta');
        const itemsEl = document.getElementById('sync-prog-total-items');
        const totalPctEl = document.getElementById('sync-prog-total-pct');
        const totalBar = document.getElementById('sync-prog-total-bar');
        const filePctEl = document.getElementById('sync-prog-file-pct');
        const fileBar = document.getElementById('sync-prog-file-bar');
        const fileNameEl = document.getElementById('sync-prog-file-name');

        if (dirEl) dirEl.innerHTML = direction === 'push' ? '⬆️ <b>Subiendo (Upload)...</b>' : '⬇️ <b>Descargando (Download)...</b>';
        if (speedEl) speedEl.innerText = '⚡ 0.0 MB/s';
        if (etaEl) etaEl.innerText = '⏱️ ETA: calculando...';
        if (itemsEl) itemsEl.innerText = `0/${totalCount}`;
        if (totalPctEl) totalPctEl.innerText = '0%';
        if (totalBar) totalBar.style.width = '0%';
        if (filePctEl) filePctEl.innerText = '0%';
        if (fileBar) fileBar.style.width = '0%';
        if (fileNameEl) fileNameEl.innerText = 'Iniciando transferencia...';
    }

    _updateProgressBar(data) {
        const speedEl = document.getElementById('sync-prog-speed');
        const etaEl = document.getElementById('sync-prog-eta');
        const itemsEl = document.getElementById('sync-prog-total-items');
        const totalPctEl = document.getElementById('sync-prog-total-pct');
        const totalBar = document.getElementById('sync-prog-total-bar');
        const filePctEl = document.getElementById('sync-prog-file-pct');
        const fileBar = document.getElementById('sync-prog-file-bar');
        const fileNameEl = document.getElementById('sync-prog-file-name');

        if (speedEl && data.speedText) speedEl.innerText = `⚡ ${data.speedText}`;
        if (etaEl && data.etaText) etaEl.innerText = `⏱️ ETA: ${data.etaText}`;
        if (itemsEl && data.itemIndex && data.totalItems) itemsEl.innerText = `${data.itemIndex}/${data.totalItems}`;
        if (totalPctEl) totalPctEl.innerText = `${data.totalPercent || 0}%`;
        if (totalBar) totalBar.style.width = `${data.totalPercent || 0}%`;
        if (filePctEl) filePctEl.innerText = `${data.filePercent || 0}%`;
        if (fileBar) fileBar.style.width = `${data.filePercent || 0}%`;
        if (fileNameEl && data.filename) fileNameEl.innerText = data.filename;
    }

    _hideProgressBar() {
        const container = document.getElementById('sync-progress-container');
        if (container) {
            setTimeout(() => {
                container.style.display = 'none';
            }, 3000);
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
