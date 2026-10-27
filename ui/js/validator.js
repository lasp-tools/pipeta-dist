class NamingValidator {
    constructor() {
        this.isVisible = false;
        this.issues = [];
        this.currentScanPath = null;
        this.scannedCount = 0;

        // Rules config
        this.config = {
            scopeFiles: true,
            scopeFolders: true,
            spaces: true,
            accents: true,
            enye: true,
            special: true
        };

        window.namingValidator = this;
        this.renderUI();
    }

    renderUI() {
        if (document.getElementById('validator-window')) return;

        this.container = document.createElement('div');
        this.container.id = 'validator-window';
        this.container.className = 'validator-window';
        this.container.style.display = 'none';

        // Resizable & Larger
        this.container.style.width = '600px';
        this.container.style.height = '600px';
        this.container.style.minWidth = '400px';
        this.container.style.minHeight = '300px';
        this.container.style.resize = 'both';
        this.container.style.overflow = 'hidden';

        this.container.innerHTML = `
            <div class="validator-header" onmousedown="namingValidator.startDrag(event)">
                <span style="display:flex; align-items:center; gap:10px;">Validador de Nomenclatura</span>
                <div class="win-controls">
                    <button onclick="namingValidator.minimize(this)">-</button>
                    <button onclick="namingValidator.toggle()">×</button>
                </div>
            </div>
            <div class="validator-body" style="display:flex; flex-direction:column; height:100%; overflow:hidden;">
                <!-- CONTROLS -->
                <div class="val-controls" style="flex-shrink:0;">
                    <div style="display:flex; gap:5px;">
                        <button class="action-btn-small" style="flex:1;" onclick="namingValidator.runScan(true)">Scan ALL</button>
                        <button class="action-btn-small" style="flex:1;" onclick="namingValidator.runScan(false)">Scan Selection</button>
                    </div>
                    
                    <div style="display:flex; gap:15px; padding:10px 0; border-bottom:1px solid #333;">
                        <span style="color:#666; font-size:0.8rem;">Buscar en:</span>
                        <label style="font-size:0.8rem; color:#ccc; cursor:pointer;"><input type="checkbox" id="chk-scopeFiles" onchange="namingValidator.updateConfig('scopeFiles', this.checked)" checked> Archivos</label>
                        <label style="font-size:0.8rem; color:#ccc; cursor:pointer;"><input type="checkbox" id="chk-scopeFolders" onchange="namingValidator.updateConfig('scopeFolders', this.checked)" checked> Carpetas</label>
                    </div>

                    <div class="val-options" style="display:flex; flex-direction:column; gap:5px; padding-top:10px;">
                        <label><input type="checkbox" id="chk-spaces" onchange="namingValidator.updateConfig('spaces', this.checked)" checked> Espacios en blanco</label>
                        <label><input type="checkbox" id="chk-accents" onchange="namingValidator.updateConfig('accents', this.checked)" checked> Acentos (á Á ë Ë)</label>
                        <label><input type="checkbox" id="chk-enye" onchange="namingValidator.updateConfig('enye', this.checked)" checked> Ñ (eñes)</label>
                        <label><input type="checkbox" id="chk-special" onchange="namingValidator.updateConfig('special', this.checked)" checked> Caracteres Especiales ($!/?*#@&)</label>
                    </div>
                </div>

                <!-- RESULTS HEADER -->
                <div class="val-results-header" style="display:grid; grid-template-columns: 30px 1fr 30px 1fr 40px; gap:10px; color:#888; font-size:0.75rem; padding:10px 5px; border-bottom:1px solid #333; align-items:center; margin-top:10px;">
                    <input type="checkbox" id="val-select-all" disabled onchange="namingValidator.toggleSelectAll(this.checked)">
                    <span>ORIGINAL (Errores)</span>
                    <span></span>
                    <span>PREVIEW (Corregido)</span>
                    <span>Ir</span>
                </div>
                
                <!-- STATUS -->
                <div id="val-status" style="font-size:0.7rem; color:#888; padding:5px; flex-shrink:0;">Listo</div>
                
                <!-- LIST -->
                <div class="val-results" id="val-results-list" style="flex:1; overflow-y:auto; background:#111; padding:5px; border:1px solid #333;">
                    <div class="empty-state" style="padding:20px; text-align:center; color:#555;">Selecciona una opción de escaneo.</div>
                </div>

                <!-- FOOTER -->
                <div class="val-footer" style="padding-top:10px; display:flex; gap:10px; flex-shrink:0; padding-bottom:15px;"> 
                    <button id="val-fix-sel" class="action-btn-primary" disabled style="flex:1; background:#444;" onclick="namingValidator.confirmFix(false)">Fix Selection</button>
                    <button id="val-fix-all" class="action-btn-primary" disabled style="flex:1;" onclick="namingValidator.confirmFix(true)">Fix ALL</button>
                    <div style="color:#666; font-size:0.7rem; align-self:center;" id="val-count-label">0 items</div>
                </div>
            </div>
            
        `;
        document.body.appendChild(this.container);
    }

    // --- ACTIONS ---

    toggle() {
        this.isVisible = !this.isVisible;
        this.container.style.display = this.isVisible ? 'flex' : 'none';
        if (this.isVisible) this.container.classList.remove('minimized');
    }

    minimize(btn) {
        this.container.classList.toggle('minimized');
        if (this.container.classList.contains('minimized')) {
            this.container.style.resize = 'none';
        } else {
            this.container.style.resize = 'both';
        }
    }

    updateConfig(key, val) {
        this.config[key] = val;
    }

    toggleSelectAll(checked) {
        const boxes = this.container.querySelectorAll('.issue-chk');
        boxes.forEach(b => b.checked = checked);
        this.updateFixButtons();
    }

    // --- DRAG ---
    startDrag(e) {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.initialLeft = this.container.offsetLeft;
        this.initialTop = this.container.offsetTop;

        this.dragMoveHandler = (ev) => this.onDragMove(ev);
        this.dragUpHandler = () => this.onDragUp();

        document.addEventListener('mousemove', this.dragMoveHandler);
        document.addEventListener('mouseup', this.dragUpHandler);
    }

    onDragMove(e) {
        if (!this.isDragging) return;
        this.container.style.left = `${this.initialLeft + (e.clientX - this.startX)}px`;
        this.container.style.top = `${this.initialTop + (e.clientY - this.startY)}px`;
    }

    onDragUp() {
        this.isDragging = false;
        document.removeEventListener('mousemove', this.dragMoveHandler);
        document.removeEventListener('mouseup', this.dragUpHandler);
    }

    // --- SCAN LOGIC ---

    _getRoots() {
        const isOnline = window.viewLocationMode === 'online' || window.viewLocationMode === 'drive';
        const proj = (typeof settings !== 'undefined') ? settings.currentProject : null;
        if (typeof getCurrentRoots === 'function') {
            return getCurrentRoots();
        }
        return {
            work: isOnline 
                ? (proj?.roots?.onlineWork || proj?.roots?.work || '') 
                : (proj?.roots?.work || (typeof ROOTS !== 'undefined' ? ROOTS.work : '')),
            media: isOnline 
                ? (proj?.roots?.onlineMedia || proj?.roots?.media || '') 
                : (proj?.roots?.media || (typeof ROOTS !== 'undefined' ? ROOTS.media : ''))
        };
    }

    async runScan(isGlobal) {
        this.isLastScanGlobal = !!isGlobal;
        const roots = this._getRoots();

        const targets = [];
        if (isGlobal) {
            if (roots.work) targets.push({ path: roots.work.replace(/\\/g, '/'), label: 'Proyecto' });
            if (roots.media) targets.push({ path: roots.media.replace(/\\/g, '/'), label: 'Media' });

            if (targets.length === 0) {
                alert("⚠️ No se encontraron las rutas de Proyecto ni Media del proyecto activo.");
                return;
            }
            this.currentScanPath = targets.map(t => t.path).join(' ; ');
        } else {
            let startPath = selectedContextPath;
            if (!startPath) {
                alert("⚠️ Selecciona primero una carpeta en el árbol.");
                return;
            }
            this.currentScanPath = startPath;
            targets.push({ path: startPath.replace(/\\/g, '/'), label: 'Selección' });
        }

        const list = document.getElementById('val-results-list');
        list.innerHTML = '';

        const statusEl = document.getElementById('val-status');
        statusEl.innerText = `Iniciando escaneo...`;
        statusEl.style.color = '#ff9800';

        if (typeof PipetaConsole !== 'undefined') {
            const desc = isGlobal 
                ? `Proyecto (${roots.work}) y Media (${roots.media})` 
                : `Selección (${targets[0].path})`;
            PipetaConsole.log('audit', `[NAMING VALIDATOR] Escaneando nomenclatura en: ${desc}`, 'info');
        }

        document.getElementById('val-fix-all').disabled = true;
        document.getElementById('val-fix-sel').disabled = true;

        this.issues = [];
        this.scannedCount = 0;

        await new Promise(r => setTimeout(r, 50));

        try {
            for (const t of targets) {
                if (statusEl) statusEl.innerText = `Escaneando ${t.label}... (${this.scannedCount} items)`;
                await this.scanRecursively(t.path);
            }

            statusEl.innerText = `Completo. ${this.scannedCount} items analizados.`;
            statusEl.style.color = '#4caf50';

            if (typeof PipetaConsole !== 'undefined') {
                const level = this.issues.length > 0 ? 'warn' : 'ok';
                PipetaConsole.log('audit', `[NAMING VALIDATOR] Escaneo finalizado: ${this.scannedCount} elementos analizados, ${this.issues.length} no conformes encontrados.`, level);
            }

            this.renderResults();
        } catch (err) {
            console.error(err);
            statusEl.innerText = `Error: ${err.message}`;
            statusEl.style.color = 'red';
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('audit', `[NAMING VALIDATOR] ❌ Error durante el escaneo: ${err.message}`, 'error');
            }
            alert(`Error: ${err.message}`);
        }
    }

    async scanRecursively(path) {
        if (this.scannedCount % 10 === 0) {
            const statusEl = document.getElementById('val-status');
            if (statusEl) statusEl.innerText = `Escaneando... (${this.scannedCount})`;
        }

        const fetchOpts = this.isLastScanGlobal ? {} : { force: true, localSource: 'z_local' };
        const data = await API.fetchDir(path, fetchOpts);

        if (data.error || !data.items) return;

        for (const item of data.items) {
            this.scannedCount++;

            // Scope Check
            const isDir = item.isDirectory;
            const checkFile = !isDir && this.config.scopeFiles;
            const checkFolder = isDir && this.config.scopeFolders;

            if (checkFile || checkFolder) {
                const fixedName = this.normalizeName(item.name);
                if (fixedName !== item.name) {
                    this.issues.push({
                        original: item,
                        currentBytes: item.name,
                        fixedBytes: fixedName,
                        path: item.path
                    });
                }
            }

            if (isDir) {
                await this.scanRecursively(item.path);
            }
        }
    }

    normalizeName(name) {
        let n = name;

        // 1. Ñ Protection
        if (this.config.enye) {
            n = n.replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
        }

        // 2. Accents
        if (this.config.accents) {
            n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        }

        // 3. Special Characters
        if (this.config.special) {
            // Allow: a-z, A-Z, 0-9, ., _, -
            // AND Allow \s (spaces) to prevent conflict with space rule
            n = n.replace(/[^a-zA-Z0-9._\-\s]/g, '');
        }

        // 4. Spaces
        if (this.config.spaces) {
            n = n.replace(/\s+/g, '');
        }

        return n;
    }

    renderResults() {
        const list = document.getElementById('val-results-list');
        list.innerHTML = '';

        document.getElementById('val-count-label').innerText = `${this.issues.length} errores`;
        const selectAll = document.getElementById('val-select-all');
        selectAll.disabled = this.issues.length === 0;
        selectAll.checked = false;

        if (this.issues.length === 0) {
            list.innerHTML = `<div style="padding:20px; text-align:center; color:#4caf50;">✅ ¡Todo limpio!</div>`;
            return;
        }

        this.issues.forEach((issue, idx) => {
            const row = document.createElement('div');
            row.className = 'issue-item';

            row.style.display = 'grid';
            row.style.gridTemplateColumns = '30px 1fr 30px 1fr 40px';
            row.style.alignItems = 'center';
            row.style.gap = '10px';
            row.style.borderBottom = '1px solid #222';
            row.style.padding = '5px 0';

            row.innerHTML = `
                <div style="text-align:center;"><input type="checkbox" class="issue-chk" data-idx="${idx}" onchange="namingValidator.updateFixButtons()"></div>
                
                <div style="font-family:monospace; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#f44336;" title="${issue.currentBytes}">
                    ${issue.currentBytes}
                </div>
                
                <div style="text-align:center; color:#666;">➜</div>
                
                <div style="font-family:monospace; font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#4caf50; font-weight:bold;" title="${issue.fixedBytes}">
                    ${issue.fixedBytes}
                </div>
                
                <div style="text-align:center;">
                    <button class="icon-btn goto-btn" title="Ir a ubicación" style="color:#2196f3; font-size:1.2rem; cursor:pointer; background:transparent; border:none;" onclick="namingValidator.navigateToItemPath('${issue.path.replace(/\\/g, '\\\\')}')">📍</button>
                </div>
            `;
            list.appendChild(row);
        });

        document.getElementById('val-fix-all').disabled = false;
        this.updateFixButtons();
    }

    updateFixButtons() {
        const checked = this.container.querySelectorAll('.issue-chk:checked').length;
        const btnSel = document.getElementById('val-fix-sel');
        btnSel.disabled = checked === 0;
        btnSel.innerText = `Fix Selection (${checked})`;
    }

    navigateToItemPath(path) {
        const roots = this._getRoots();
        const normPath = (path || '').replace(/\\/g, '/').toLowerCase();
        const normMedia = (roots.media || '').replace(/\\/g, '/').toLowerCase();
        const isMedia = normMedia && normPath.startsWith(normMedia);
        const containerId = isMedia ? 'tree-media' : 'tree-work';

        if (typeof expandedPaths !== 'undefined') {
            const sep = path.includes('/') ? '/' : '\\';
            const segments = path.split(sep);
            let currentBuild = segments[0];
            for (let i = 1; i < segments.length - 1; i++) {
                currentBuild += sep + segments[i];
                expandedPaths.add(currentBuild);
            }
            refreshCurrentView();
            window.selectedPaths.clear();
            window.selectedPaths.add(path);
        }
    }

    // --- POPUP MODAL LOGIC ---

    createModal(id) {
        let modal = document.getElementById(id);
        if (!modal) {
            modal = document.createElement('div');
            modal.id = id;
            // Global fixed centered positioning
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.background = 'rgba(0,0,0,0.7)';
            modal.style.zIndex = '3000'; // Above everything
            modal.style.display = 'none';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.innerHTML = `
                <div id="${id}-content" style="background:#222; border:1px solid #555; padding:20px; border-radius:8px; min-width:300px; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,0.8);">
                </div>
            `;
            document.body.appendChild(modal);
        }
        return modal;
    }

    confirmFix(isAll) {
        const indices = isAll
            ? this.issues.map((_, i) => i)
            : Array.from(this.container.querySelectorAll('.issue-chk:checked')).map(c => parseInt(c.dataset.idx));

        if (indices.length === 0) return;

        this.fixIndices = indices; // Store for execution

        const modal = this.createModal('val-confirm-modal');
        const content = document.getElementById('val-confirm-modal-content');

        content.innerHTML = `
            <div style="font-size:1.2rem; margin-bottom:15px; color:#fff;">¿Confirmar cambios?</div>
            <div style="color:#aaa; margin-bottom:20px;">Se renombrarán <b>${indices.length}</b> elementos.</div>
            <div style="display:flex; gap:10px; justify-content:center;">
                <button class="action-btn-primary" style="background:#4caf50; padding:8px 20px;" onclick="namingValidator.executeFixes()">✅ Confirmar</button>
                <button class="action-btn-primary" style="background:#444; padding:8px 20px;" onclick="document.getElementById('val-confirm-modal').style.display='none'">❌ Cancelar</button>
            </div>
        `;

        modal.style.display = 'flex';
    }

    async executeFixes() {
        const indices = this.fixIndices;
        const content = document.getElementById('val-confirm-modal-content');

        content.innerHTML = `<div style="color:#aaa; padding:20px;">Renombrando... <span class="spinner">⏳</span></div>`;

        const toFix = indices.map(i => this.issues[i]);
        toFix.sort((a, b) => b.path.length - a.path.length);

        let successCount = 0;
        let errors = [];

        for (const issue of toFix) {
            const sep = issue.path.lastIndexOf('\\') > -1 ? '\\' : '/';
            const parent = issue.path.substring(0, issue.path.lastIndexOf(sep));
            const newPath = `${parent}${sep}${issue.fixedBytes}`;

            console.log(`Renaming: "${issue.path}" -> "${newPath}"`);

            const curProj = (typeof settings !== 'undefined' && settings.currentProject) ? (settings.currentProject.name || settings.currentProject.id) : '';
            const res = await API.fs.rename(issue.path, newPath, curProj);
            if (res.error) {
                errors.push(`${issue.currentBytes}: ${res.error}`);
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('rename', `[NAMING FIX] ❌ Error renombrando ${issue.currentBytes}: ${res.error}`, 'error');
                }
            } else {
                successCount++;
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('rename', `[NAMING FIX] ✏️ ${issue.currentBytes}  ➡️  ${issue.fixedBytes}`, 'ok');
                }
            }
        }

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('audit', `[NAMING VALIDATOR] ✅ Corrección finalizada: ${successCount} elemento(s) corregidos con éxito.`, 'ok');
        }

        // Show Success in Modal
        content.innerHTML = `
            <div style="font-size:1.5rem; margin-bottom:10px; color:#4caf50;">✅ ¡Listo!</div>
            <div style="margin-bottom:10px; color:#ddd;">Se arreglaron <b>${successCount}</b> elementos.</div>
            ${errors.length > 0 ? `<div style="color:red; font-size:0.8rem; margin-bottom:10px;">Hubo ${errors.length} errores (mira la consola).</div>` : ''}
            <div style="color:#666; font-size:0.8rem;">Cerrando aviso en 2 seg...</div>
        `;

        // Refresh MAIN Window logic behind modal
        this.runScan(this.isLastScanGlobal);
        refreshCurrentView();

        // Auto Close Modal Only
        setTimeout(() => {
            document.getElementById('val-confirm-modal').style.display = 'none';
            // Main window remains open
        }, 2000);
    }

    async fixSelection() { this.confirmFix(false); }
    async fixAll() { this.confirmFix(true); }
}

window.toggleValidator = () => {
    if (window.namingValidator) window.namingValidator.toggle();
};

if (window.namingValidator && window.namingValidator.container) {
    window.namingValidator.container.remove();
}
// Remove old modal if exists
const oldModal = document.getElementById('val-confirm-modal');
if (oldModal) oldModal.remove();

new NamingValidator();
