// ============================================================
// MIRROR INTEGRITY AUDITOR — Cross-Check (Proyecto ↔ Media)
// Detects missing mirror counterparts and repairs structures.
// ============================================================

class MirrorAuditor {
    constructor() {
        this.isVisible = false;
        this.auditResults = [];
        this.isAuditing = false;
        this.activeFilter = 'all';

        const savedOmit = localStorage.getItem('pipeta_mirror_audit_omit_control');
        this.omitControlFiles = savedOmit !== null ? savedOmit === 'true' : true;

        window.mirrorAuditor = this;
        this.renderUI();
    }

    renderUI() {
        if (document.getElementById('mirror-auditor-window')) return;

        this.container = document.createElement('div');
        this.container.id = 'mirror-auditor-window';
        this.container.className = 'validator-window';
        this.container.style.display = 'none';

        // Styling and dimensions
        this.container.style.width = '750px';
        this.container.style.height = '620px';
        this.container.style.minWidth = '500px';
        this.container.style.minHeight = '380px';
        this.container.style.resize = 'both';
        this.container.style.overflow = 'hidden';
        this.container.style.top = '70px';
        this.container.style.left = '180px';

        this.container.innerHTML = `
            <div class="validator-header" id="mirror-auditor-header" onmousedown="window.mirrorAuditor.startDrag(event)">
                <div class="validator-title" style="display:flex; align-items:center; gap:10px;">
                    <span class="validator-icon" style="font-size:1.2rem;">🪞</span>
                    <b style="font-weight:bold;">Mirror Integrity Auditor</b>
                    <span id="mirror-audit-badge" style="font-size:0.7rem; background:#333; padding:2px 6px; border-radius:4px; margin-left:6px; color:#aaa;">PROYECTO ↔ MEDIA</span>
                </div>
                <div class="validator-controls">
                    <button class="icon-btn-mini" onclick="window.mirrorAuditor.minimize(this)">-</button>
                    <button class="icon-btn-mini" style="color:#f44336;" onclick="window.mirrorAuditor.toggle()">✕</button>
                </div>
            </div>
            <div class="validator-body" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                <!-- INFO & CONTROLS -->
                <div style="padding:8px; background:#1a1a1a; border-bottom:1px solid #333; flex-shrink:0;">
                    <div style="font-size:0.75rem; color:#888; margin-bottom:6px;">
                        Verifica que cada plano/asset en <b style="color:#4fc3f7;">Proyecto</b> tenga su contraparte y carpetas en <b style="color:#81c784;">Media</b> (y viceversa).
                    </div>
                    <div style="display:flex; gap:6px; margin-bottom:6px;">
                        <button class="action-btn-small" style="flex:1;" onclick="mirrorAuditor.runAudit('all')">🌎 Auditar Proyecto Completo</button>
                        <button class="action-btn-small" style="flex:1;" onclick="mirrorAuditor.runAudit('selection')">📂 Auditar Selección</button>
                    </div>
                    <div style="display:flex; justify-content:flex-end; align-items:center;">
                        <span id="mirror-audit-roots-summary" style="font-size:0.7rem; color:#666;">-</span>
                    </div>
                </div>

                <!-- FILTER TABS -->
                <div style="display:flex; border-bottom:1px solid #333; flex-shrink:0; background:#181818;">
                    <button class="sync-filter-tab active" data-filter="all" onclick="mirrorAuditor.setFilter('all', this)">
                        Todos <span id="mirror-count-all" class="sync-badge">0</span>
                    </button>
                    <button class="sync-filter-tab" data-filter="missing-media" onclick="mirrorAuditor.setFilter('missing-media', this)">
                        🔴 Falta en Media <span id="mirror-count-missing-media" class="sync-badge" style="background:#e57373; color:#000;">0</span>
                    </button>
                    <button class="sync-filter-tab" data-filter="missing-work" onclick="mirrorAuditor.setFilter('missing-work', this)">
                        🔵 Falta en Proyecto <span id="mirror-count-missing-work" class="sync-badge" style="background:#64b5f6; color:#000;">0</span>
                    </button>
                    <button class="sync-filter-tab" data-filter="incomplete" onclick="mirrorAuditor.setFilter('incomplete', this)">
                        🟡 Incompletos <span id="mirror-count-incomplete" class="sync-badge" style="background:#ffd54f; color:#000;">0</span>
                    </button>
                    <button class="sync-filter-tab" data-filter="ok" onclick="mirrorAuditor.setFilter('ok', this)">
                        🟢 OK <span id="mirror-count-ok" class="sync-badge" style="background:#81c784; color:#000;">0</span>
                    </button>
                </div>

                <!-- STATUS & SELECT ALL BAR -->
                <div style="display:flex; align-items:center; justify-content:space-between; padding:4px 8px; flex-shrink:0; border-bottom:1px solid #222; background:#121212;">
                    <div id="mirror-audit-status" style="font-size:0.7rem; color:#888;">Listo para auditar</div>
                    <label style="font-size:0.7rem; color:#888; cursor:pointer; display:flex; align-items:center; gap:4px; user-select:none;">
                        <input type="checkbox" id="mirror-select-all" onchange="mirrorAuditor.toggleSelectAll(this.checked)"> Seleccionar todo
                    </label>
                </div>

                <!-- RESULTS LIST -->
                <div class="val-results" id="mirror-results-list" style="flex:1; overflow-y:auto; background:#111; padding:6px; border:1px solid #333;">
                    <div class="empty-state" style="padding:40px; text-align:center; color:#555;">
                        <div style="font-size:2.2rem; margin-bottom:10px;">🪞</div>
                        Haz clic en <b>Auditar Proyecto Completo</b> o <b>Auditar Selección</b> para verificar la integridad del espejo.
                    </div>
                </div>

                <!-- FOOTER -->
                <div style="padding:8px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; border-top:1px solid #333; background:#161616;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span id="mirror-selected-summary" style="font-size:0.75rem; color:#aaa;">0 elementos seleccionados</span>
                        <span id="mirror-total-diffs" style="font-size:0.75rem; color:#888;">0 discrepancias</span>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button id="mirror-btn-fix-media" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="mirrorAuditor.repairSelected('media')">
                            🔧 Reparar en Media
                        </button>
                        <button id="mirror-btn-fix-work" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="mirrorAuditor.repairSelected('work')">
                            🔧 Reparar en Proyecto
                        </button>
                        <button id="mirror-btn-fix-all" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="mirrorAuditor.repairSelected('both')">
                            ⚡ Reparar Todo
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);
    }

    // --- WINDOW CONTROL ---
    toggle() {
        this.isVisible = !this.isVisible;
        this.container.style.display = this.isVisible ? 'flex' : 'none';
        if (this.isVisible) {
            this._updateRootsSummary();
        }
    }

    minimize(btn) {
        const body = this.container.querySelector('.validator-body');
        const isMin = body.style.display === 'none';
        body.style.display = isMin ? 'flex' : 'none';
        this.container.style.height = isMin ? '620px' : 'auto';
        this.container.style.resize = isMin ? 'both' : 'none';
        btn.innerText = isMin ? '-' : '□';
    }

    startDrag(e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        this._dragOff = {
            x: e.clientX - this.container.offsetLeft,
            y: e.clientY - this.container.offsetTop
        };
        const moveH = ev => {
            this.container.style.left = (ev.clientX - this._dragOff.x) + 'px';
            this.container.style.top = (ev.clientY - this._dragOff.y) + 'px';
        };
        const upH = () => {
            document.removeEventListener('mousemove', moveH);
            document.removeEventListener('mouseup', upH);
        };
        document.addEventListener('mousemove', moveH);
        document.addEventListener('mouseup', upH);
    }

    toggleOmitControl(checked) {
        this.omitControlFiles = checked;
        localStorage.setItem('pipeta_mirror_audit_omit_control', checked ? 'true' : 'false');
    }

    _getRoots() {
        const isOnline = window.viewLocationMode === 'online';
        const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
        return {
            work: isOnline 
                ? (proj?.roots?.onlineWork || proj?.roots?.work || '') 
                : (proj?.roots?.work || (typeof ROOTS !== 'undefined' ? ROOTS.work : '')),
            media: isOnline 
                ? (proj?.roots?.onlineMedia || proj?.roots?.media || '') 
                : (proj?.roots?.media || (typeof ROOTS !== 'undefined' ? ROOTS.media : ''))
        };
    }

    _updateRootsSummary() {
        const r = this._getRoots();
        const el = document.getElementById('mirror-audit-roots-summary');
        if (el) {
            el.innerText = `PROY: ${r.work || '-'} | MEDIA: ${r.media || '-'}`;
        }
    }

    _setStatus(text, color = '#888') {
        const el = document.getElementById('mirror-audit-status');
        if (el) {
            el.innerText = text;
            el.style.color = color;
        }
    }

    async _loadPresetSubfolders() {
        const defaultMedia = ['IA', 'IA/enc', 'IA/export', 'IA/ref', 'nuke', 'nuke/exportIA', 'nuke/fullres', 'nuke/prerender', 'in'];
        const defaultWork = ['compo'];

        try {
            const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
            const presetId = proj?.defaultShotPresetId || (typeof settings !== 'undefined' ? settings.validationPresetShot : null) || 'master_shot';
            
            let preset = null;
            if (typeof Inspector !== 'undefined' && Inspector.getPreset) {
                preset = await Inspector.getPreset(presetId);
            }

            if (!preset || !preset.nodes) {
                return { mediaSubfolders: defaultMedia, workSubfolders: defaultWork, presetName: 'Canon Default' };
            }

            const nodes = preset.nodes;
            const workShotNode = nodes.find(n => n.isShot && n.y < 0) || nodes.find(n => n.name && n.name.toLowerCase().includes('shot') && n.y < 0);
            const mediaShotNode = nodes.find(n => n.isShot && n.y >= 0) || nodes.find(n => n.name && n.name.toLowerCase().includes('shot') && n.y >= 0);

            function getDescendants(parentId, currentPath = '') {
                const results = [];
                const children = nodes.filter(n => n.parent === parentId && !n.isExternalTcl);
                for (const child of children) {
                    const segName = child.name;
                    const fullSeg = currentPath ? `${currentPath}/${segName}` : segName;
                    results.push(fullSeg);
                    results.push(...getDescendants(child.id, fullSeg));
                }
                return results;
            }

            const workSub = workShotNode ? getDescendants(workShotNode.id) : defaultWork;
            const mediaSub = mediaShotNode ? getDescendants(mediaShotNode.id) : defaultMedia;

            return {
                mediaSubfolders: mediaSub.length > 0 ? Array.from(new Set(mediaSub)) : defaultMedia,
                workSubfolders: workSub.length > 0 ? Array.from(new Set(workSub)) : defaultWork,
                presetName: preset.name || presetId
            };
        } catch (e) {
            console.warn("Could not parse preset subfolders, using canon defaults:", e);
            return { mediaSubfolders: defaultMedia, workSubfolders: defaultWork, presetName: 'Canon Default' };
        }
    }

    // --- AUDIT SCAN ENGINE ---
    async runAudit(scope = 'all') {
        if (this.isAuditing) return;
        this.isAuditing = true;
        this.auditResults = [];

        const roots = this._getRoots();
        if (!roots.work || !roots.media) {
            this._setStatus('❌ Raíces de Proyecto o Media no encontradas.', '#f44336');
            this.isAuditing = false;
            return;
        }

        this._setStatus('🔍 Escaneando planos y configuración de preset...', '#4fc3f7');
        const listEl = document.getElementById('mirror-results-list');
        listEl.innerHTML = '<div style="padding:25px; text-align:center; color:#888;"><div class="spinner-small"></div> Analizando árbol cruzado Proyecto ↔ Media...</div>';

        try {
            // Cargar subcarpetas canónicas dinámicamente desde el preset del proyecto
            const presetCfg = await this._loadPresetSubfolders();
            const expectedMediaFolders = presetCfg.mediaSubfolders;
            const expectedWorkFolders = presetCfg.workSubfolders;

            const badgeEl = document.getElementById('mirror-audit-badge');
            if (badgeEl) badgeEl.innerText = `PRESET: ${presetCfg.presetName.toUpperCase()}`;

            let targetEpisodes = [];

            if (scope === 'selection' && selectedContextPath) {
                const normSel = selectedContextPath.replace(/\\/g, '/');
                const relWork = normSel.toLowerCase().startsWith(roots.work.toLowerCase())
                    ? normSel.substring(roots.work.length).replace(/^\/+/, '')
                    : '';
                const relMedia = normSel.toLowerCase().startsWith(roots.media.toLowerCase())
                    ? normSel.substring(roots.media.length).replace(/^\/+/, '')
                    : '';
                const rel = relWork || relMedia;
                const parts = rel.split('/').filter(Boolean);
                
                let epName = parts.find(p => p.toLowerCase() !== 'episodios' && p.toLowerCase() !== 'secuencias' && p.toLowerCase() !== 'shots');
                if (epName) targetEpisodes.push(epName);
            }

            // 1. Scan Work Directory
            const workShotsMap = new Map();
            const workEpRoot = roots.work.replace(/\/+$/, '') + '/episodios';
            const epData = await fetchDir(workEpRoot).catch(() => ({ error: true, items: [] }));
            
            const epItems = (epData && epData.items) ? epData.items.filter(i => i.isDirectory) : [];
            for (const epItem of epItems) {
                if (targetEpisodes.length > 0 && !targetEpisodes.includes(epItem.name)) continue;

                const seqRoot = epItem.path.replace(/\/+$/, '') + '/secuencias';
                const seqData = await fetchDir(seqRoot).catch(() => ({ error: true, items: [] }));
                const seqItems = (seqData && seqData.items) ? seqData.items.filter(i => i.isDirectory) : [];

                for (const seqItem of seqItems) {
                    const shotsRoot = seqItem.path.replace(/\/+$/, '') + '/shots';
                    const shotData = await fetchDir(shotsRoot).catch(() => ({ error: true, items: [] }));
                    const shotItems = (shotData && shotData.items) ? shotData.items.filter(i => i.isDirectory) : [];

                    for (const shotItem of shotItems) {
                        const key = `${epItem.name}/${seqItem.name}/${shotItem.name}`.toLowerCase();
                        workShotsMap.set(key, {
                            ep: epItem.name,
                            seq: seqItem.name,
                            shot: shotItem.name,
                            path: shotItem.path
                        });
                    }
                }
            }

            // 2. Scan Media Directory
            const mediaShotsMap = new Map();
            const mediaEpData = await fetchDir(roots.media).catch(() => ({ error: true, items: [] }));
            const mediaEpItems = (mediaEpData && mediaEpData.items) ? mediaEpData.items.filter(i => i.isDirectory) : [];

            for (const epItem of mediaEpItems) {
                if (targetEpisodes.length > 0 && !targetEpisodes.includes(epItem.name)) continue;

                const seqData = await fetchDir(epItem.path).catch(() => ({ error: true, items: [] }));
                const seqItems = (seqData && seqData.items) ? seqData.items.filter(i => i.isDirectory) : [];

                for (const seqItem of seqItems) {
                    const shotData = await fetchDir(seqItem.path).catch(() => ({ error: true, items: [] }));
                    const shotItems = (shotData && shotData.items) ? shotData.items.filter(i => i.isDirectory) : [];

                    for (const shotItem of shotItems) {
                        const key = `${epItem.name}/${seqItem.name}/${shotItem.name}`.toLowerCase();
                        mediaShotsMap.set(key, {
                            ep: epItem.name,
                            seq: seqItem.name,
                            shot: shotItem.name,
                            path: shotItem.path
                        });
                    }
                }
            }

            // 3. Cross Compare
            const allKeys = new Set([...workShotsMap.keys(), ...mediaShotsMap.keys()]);

            for (const key of allKeys) {
                const inWork = workShotsMap.has(key);
                const inMedia = mediaShotsMap.has(key);
                const wData = workShotsMap.get(key);
                const mData = mediaShotsMap.get(key);

                const ep = wData?.ep || mData?.ep;
                const seq = wData?.seq || mData?.seq;
                const shot = wData?.shot || mData?.shot;

                const expectedWorkPath = roots.work.replace(/\/+$/, '') + `/episodios/${ep}/secuencias/${seq}/shots/${shot}`;
                const expectedMediaPath = roots.media.replace(/\/+$/, '') + `/${ep}/${seq}/${shot}`;

                const record = {
                    key,
                    ep,
                    seq,
                    shot,
                    workPath: inWork ? wData.path : expectedWorkPath,
                    mediaPath: inMedia ? mData.path : expectedMediaPath,
                    existsInWork: inWork,
                    existsInMedia: inMedia,
                    missingMediaFolders: [],
                    missingWorkFolders: [],
                    status: 'ok',
                    selected: false
                };

                if (!inMedia) {
                    record.status = 'missing-media';
                    record.missingMediaFolders = expectedMediaFolders;
                } else if (!inWork) {
                    record.status = 'missing-work';
                    record.missingWorkFolders = expectedWorkFolders;
                } else {
                    const [mediaSub, workSub] = await Promise.all([
                        fetchDir(record.mediaPath).catch(() => ({ items: [] })),
                        fetchDir(record.workPath).catch(() => ({ items: [] }))
                    ]);

                    const mSubNames = (mediaSub?.items || []).map(i => i.name.toLowerCase());
                    const wSubNames = (workSub?.items || []).map(i => i.name.toLowerCase());

                    const missingM = [];
                    if (!mSubNames.includes('ia')) missingM.push('IA');
                    if (!mSubNames.includes('nuke')) missingM.push('nuke');
                    if (!mSubNames.includes('in')) missingM.push('in');

                    const missingW = [];
                    if (!wSubNames.includes('compo')) missingW.push('compo');

                    record.missingMediaFolders = missingM;
                    record.missingWorkFolders = missingW;

                    if (missingM.length > 0 || missingW.length > 0) {
                        record.status = 'incomplete';
                    }
                }

                this.auditResults.push(record);
            }

            this.auditResults.sort((a, b) => a.key.localeCompare(b.key));

            this.isAuditing = false;
            const diffsCount = this.auditResults.filter(r => r.status !== 'ok').length;
            this._setStatus(`✅ Auditoría finalizada: ${this.auditResults.length} planos analizados (${diffsCount} discrepancias).`, diffsCount > 0 ? '#FF9800' : '#4CAF50');
            this.renderResults();

        } catch (err) {
            this.isAuditing = false;
            console.error("Mirror audit error:", err);
            this._setStatus('❌ Error durante la auditoría: ' + err.message, '#f44336');
        }
    }

    // --- RENDERING RESULTS ---
    renderResults() {
        const listEl = document.getElementById('mirror-results-list');
        const filtered = this.activeFilter === 'all'
            ? this.auditResults
            : this.auditResults.filter(r => {
                if (this.activeFilter === 'incomplete') return r.status === 'incomplete';
                return r.status === this.activeFilter;
            });

        const countAll = this.auditResults.length;
        const countMissingM = this.auditResults.filter(r => r.status === 'missing-media').length;
        const countMissingW = this.auditResults.filter(r => r.status === 'missing-work').length;
        const countIncomplete = this.auditResults.filter(r => r.status === 'incomplete').length;
        const countOk = this.auditResults.filter(r => r.status === 'ok').length;

        document.getElementById('mirror-count-all').innerText = countAll;
        document.getElementById('mirror-count-missing-media').innerText = countMissingM;
        document.getElementById('mirror-count-missing-work').innerText = countMissingW;
        document.getElementById('mirror-count-incomplete').innerText = countIncomplete;
        document.getElementById('mirror-count-ok').innerText = countOk;
        document.getElementById('mirror-total-diffs').innerText = `${countMissingM + countMissingW + countIncomplete} discrepancias`;

        if (filtered.length === 0) {
            listEl.innerHTML = `
                <div style="padding:30px; text-align:center; color:#666;">
                    ${this.auditResults.length === 0 ? 'No se encontraron planos en las rutas seleccionadas.' : 'No hay planos en este filtro.'}
                </div>
            `;
            this._updateButtons();
            return;
        }

        listEl.innerHTML = filtered.map(item => {
            let statusBadge = '';
            let statusBorder = '#333';
            let detailText = '';

            if (item.status === 'missing-media') {
                statusBadge = '<span style="background:#e57373; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">FALTA EN MEDIA</span>';
                statusBorder = '#e57373';
                detailText = `<span style="color:#e57373;">❌ No existe carpeta de media en <code>${item.mediaPath}</code></span>`;
            } else if (item.status === 'missing-work') {
                statusBadge = '<span style="background:#64b5f6; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">FALTA EN PROYECTO</span>';
                statusBorder = '#64b5f6';
                detailText = `<span style="color:#64b5f6;">❌ No existe carpeta de trabajo en <code>${item.workPath}</code></span>`;
            } else if (item.status === 'incomplete') {
                statusBadge = '<span style="background:#ffd54f; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">INCOMPLETO</span>';
                statusBorder = '#ffd54f';
                const mMiss = item.missingMediaFolders.length > 0 ? `Media: faltan [${item.missingMediaFolders.join(', ')}]` : '';
                const wMiss = item.missingWorkFolders.length > 0 ? `Proyecto: faltan [${item.missingWorkFolders.join(', ')}]` : '';
                detailText = `<span style="color:#ffd54f;">⚠️ ${[mMiss, wMiss].filter(Boolean).join(' | ')}</span>`;
            } else {
                statusBadge = '<span style="background:#81c784; color:#000; font-size:0.65rem; font-weight:bold; padding:2px 6px; border-radius:3px;">OK</span>';
                statusBorder = '#2e7d32';
                detailText = `<span style="color:#81c784;">✓ Espejo íntegro (Proyecto y Media sincronizados)</span>`;
            }

            return `
                <div style="display:flex; align-items:flex-start; gap:8px; padding:6px 8px; margin-bottom:4px; background:#181818; border-left:3px solid ${statusBorder}; border-radius:3px; font-size:0.75rem;">
                    <input type="checkbox" ${item.selected ? 'checked' : ''} onchange="mirrorAuditor.toggleItemSelect('${item.key}', this.checked)" style="margin-top:3px; cursor:pointer;">
                    <div style="flex:1; overflow:hidden;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                            <span style="font-weight:bold; color:#fff; font-family:monospace; font-size:0.85rem;">🎬 ${item.shot}</span>
                            <div style="display:flex; gap:6px; align-items:center;">
                                <span style="color:#888; font-size:0.7rem;">${item.ep} / ${item.seq}</span>
                                ${statusBadge}
                            </div>
                        </div>
                        <div style="font-size:0.7rem; margin-top:2px;">
                            ${detailText}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this._updateButtons();
    }

    setFilter(filter, btn) {
        this.activeFilter = filter;
        this.container.querySelectorAll('.sync-filter-tab').forEach(t => t.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.renderResults();
    }

    toggleItemSelect(key, selected) {
        const item = this.auditResults.find(r => r.key === key);
        if (item) item.selected = selected;
        this._updateButtons();
    }

    toggleSelectAll(checked) {
        const filtered = this.activeFilter === 'all'
            ? this.auditResults
            : this.auditResults.filter(r => r.status === this.activeFilter);
        filtered.forEach(r => r.selected = checked);
        this.renderResults();
    }

    _updateButtons() {
        const selected = this.auditResults.filter(r => r.selected);
        const selCount = selected.length;
        document.getElementById('mirror-selected-summary').innerText = `${selCount} elementos seleccionados`;

        const canFixMedia = selected.some(r => r.status === 'missing-media' || r.missingMediaFolders.length > 0);
        const canFixWork = selected.some(r => r.status === 'missing-work' || r.missingWorkFolders.length > 0);
        const canFixAny = selCount > 0;

        const btnMedia = document.getElementById('mirror-btn-fix-media');
        const btnWork = document.getElementById('mirror-btn-fix-work');
        const btnAll = document.getElementById('mirror-btn-fix-all');

        if (btnMedia) {
            btnMedia.disabled = !canFixMedia;
            btnMedia.style.background = canFixMedia ? '#81c784' : '#444';
            btnMedia.style.color = canFixMedia ? '#000' : '#888';
        }
        if (btnWork) {
            btnWork.disabled = !canFixWork;
            btnWork.style.background = canFixWork ? '#4fc3f7' : '#444';
            btnWork.style.color = canFixWork ? '#000' : '#888';
        }
        if (btnAll) {
            btnAll.disabled = !canFixAny;
            btnAll.style.background = canFixAny ? '#ffb74d' : '#444';
            btnAll.style.color = canFixAny ? '#000' : '#888';
        }
    }

    // --- REPAIR ACTIONS ---
    async repairSelected(mode = 'both') {
        const selected = this.auditResults.filter(r => r.selected);
        if (selected.length === 0) return;

        const confirmMsg = `¿Reparar y crear las carpetas de espejo para los ${selected.length} plano(s) seleccionados?`;
        if (!confirm(confirmMsg)) return;

        this._setStatus(`⏳ Reparando ${selected.length} plano(s)...`, '#4fc3f7');

        try {
            const presetCfg = await this._loadPresetSubfolders();

            const res = await fetch('/api/mirror/repairBatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: selected,
                    mode: mode,
                    mediaSubfolders: presetCfg.mediaSubfolders,
                    workSubfolders: presetCfg.workSubfolders,
                    omitControl: this.omitControlFiles
                })
            });

            const data = await res.json();
            if (data.success) {
                const msg = `✅ Reparación completada: ${data.repairedCount} estructura(s) de espejo creadas con éxito.`;
                this._setStatus(msg, '#4CAF50');
                alert(msg);
            } else {
                this._setStatus(`❌ Error al reparar: ${data.error || 'Desconocido'}`, '#f44336');
                alert(`❌ Error al reparar: ${data.error || 'Desconocido'}`);
            }
        } catch (e) {
            console.error("Repair error:", e);
            this._setStatus(`❌ Error: ${e.message}`, '#f44336');
            alert(`Error al reparar: ${e.message}`);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new MirrorAuditor();
});
