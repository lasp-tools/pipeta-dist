// ----------------------------------------------------------
// --- IA INGEST [4/4]: DROPZONE, SEND2 QUEUE, MEDIA PREVIEW & BATCH EXECUTION ---
// ----------------------------------------------------------

let _iaLastDropTime = 0;
let _iaDropDepthCounter = 0;

function initIaResizer() {
    if (window._iaResizerInitialized) return;
    window._iaResizerInitialized = true;
    const splitter = document.getElementById('iaVerticalSplitter');
    const previewBox = document.getElementById('iaMediaPreviewBox');
    if (!splitter || !previewBox) return;

    const savedHeight = localStorage.getItem('iaPreviewBoxHeight');
    if (savedHeight) {
        previewBox.style.height = savedHeight + 'px';
    } else {
        previewBox.style.height = '490px';
    }

    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    splitter.addEventListener('mousedown', (e) => {
        isDragging = true;
        startY = e.clientY;
        startHeight = previewBox.offsetHeight;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        splitter.style.background = 'var(--accent)';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(220, Math.min(850, startHeight + deltaY));
        previewBox.style.height = newHeight + 'px';
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            splitter.style.background = '#1e1e1e';
            localStorage.setItem('iaPreviewBoxHeight', previewBox.offsetHeight);
        }
    });
}

async function openCurrentPreviewExternally() {
    const activeItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id)) || (iaBatchQueue.length > 0 ? iaBatchQueue[0] : null);
    if (!activeItem) return;
    const localPath = activeItem.destination || activeItem.targetPath || activeItem.originalPath;

    // Si tenemos activeItem.file en memoria y la ruta no es absoluta en disco
    const isAbsolute = localPath && (localPath.includes(':') || localPath.startsWith('\\\\')) && !localPath.startsWith('http');
    let fileDataBase64 = null;
    if (!isAbsolute && activeItem.file && (activeItem.file instanceof Blob || (typeof File !== 'undefined' && activeItem.file instanceof File))) {
        showIaAlert("⏳ Preparando video para abrir en Windows...", "#2196f3");
        fileDataBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                const res = reader.result;
                const commaIdx = typeof res === 'string' ? res.indexOf(',') : -1;
                resolve(commaIdx !== -1 ? res.substring(commaIdx + 1) : res);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(activeItem.file);
        });
    }

    try {
        const payload = {
            filePath: isAbsolute ? localPath : '',
            fileData: fileDataBase64,
            filename: activeItem.canonicalName || activeItem.originalName || 'preview.mp4'
        };

        const res = await fetch('/api/ia/open-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
            showIaAlert(`▶ Abriendo video en Windows: ${data.opened}`, "#4caf50");
        } else {
            showIaAlert(`❌ No se pudo abrir: ${data.error || 'Error al lanzar reproductor'}`, "#f44336");
        }
    } catch(e) {
        console.error("Error al abrir archivo externamente:", e);
        showIaAlert(`❌ Error al conectar con Pipeta: ${e.message}`, "#f44336");
    }
}

function updateIaMediaPreview(activeItem) {
    const placeholder = document.getElementById('iaMediaPlaceholder');
    const imgEl = document.getElementById('iaImagePreview');
    const videoEl = document.getElementById('iaVideoPreview');
    const controlsBar = document.getElementById('iaMediaControlsBar');
    const btnThumb = document.getElementById('iaPreviewModeThumbBtn');
    const btnVideo = document.getElementById('iaPreviewModeVideoBtn');
    const openExtBtn = document.getElementById('iaOpenExternalVideoBtn');

    if (!activeItem) {
        if (placeholder) {
            placeholder.style.display = 'block';
            placeholder.innerText = '📷 Selecciona o arrastra un archivo en la lista para ver su vista previa (Imagen / Video MP4)';
        }
        if (imgEl) imgEl.style.display = 'none';
        if (videoEl) {
            videoEl.style.display = 'none';
            if (typeof videoEl.pause === 'function') videoEl.pause();
        }
        if (controlsBar) controlsBar.style.display = 'none';
        return;
    }

    let previewUrl = '';
    if (activeItem.file && (activeItem.file instanceof Blob || (typeof File !== 'undefined' && activeItem.file instanceof File))) {
        try {
            previewUrl = URL.createObjectURL(activeItem.file);
        } catch(e) {
            console.error("Object URL error", e);
        }
    } else if (activeItem.originalPath && (activeItem.originalPath.includes(':') || activeItem.originalPath.startsWith('/') || activeItem.originalPath.startsWith('\\\\')) && !activeItem.originalPath.startsWith('[')) {
        previewUrl = `/api/ia/file-preview?path=${encodeURIComponent(activeItem.originalPath)}`;
    } else if (activeItem.destination) {
        previewUrl = `/api/ia/file-preview?path=${encodeURIComponent(activeItem.destination)}`;
    } else if (activeItem.sourceUrl) {
        previewUrl = activeItem.sourceUrl;
    } else if (activeItem.targetPath && !activeItem.targetPath.startsWith('[')) {
        previewUrl = `/api/ia/file-preview?path=${encodeURIComponent(activeItem.targetPath)}`;
    }

    const ext = (activeItem.ext || '').toLowerCase();
    const isVideo = ['.mp4', '.mov', '.webm', '.mkv'].includes(ext);
    const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
    const thumbUrl = activeItem.thumbnailUrl || activeItem.higgsfieldData?.thumbnailUrl || '';

    if (isVideo && (previewUrl || thumbUrl)) {
        placeholder.style.display = 'none';
        imgEl.style.display = 'none';
        videoEl.style.display = 'block';

        if (thumbUrl) {
            videoEl.poster = thumbUrl;
        }

        const targetVideoSrc = previewUrl || activeItem.sourceUrl || '';
        if (targetVideoSrc && videoEl.src !== targetVideoSrc) {
            videoEl.src = targetVideoSrc;
        }

        videoEl.onerror = () => {
            // El reproductor permanece en pantalla con su poster sin saltos ni desaparición
            if (activeItem.sourceUrl && videoEl.src !== activeItem.sourceUrl) {
                videoEl.src = activeItem.sourceUrl;
            }
        };
    } else if (isImage && (previewUrl || thumbUrl)) {
        placeholder.style.display = 'none';
        videoEl.style.display = 'none';
        if (typeof videoEl.pause === 'function') videoEl.pause();
        imgEl.style.display = 'block';
        imgEl.src = previewUrl || thumbUrl;
    } else {
        if (controlsBar) controlsBar.style.display = 'none';
        placeholder.style.display = 'block';
        placeholder.innerText = `📄 ${activeItem.originalName} (${ext.toUpperCase() || 'Archivo'})`;
        imgEl.style.display = 'none';
        videoEl.style.display = 'none';
        if (typeof videoEl.pause === 'function') videoEl.pause();
    }
}

function handleIaFileSelect(input) {
    if (input.files && input.files.length > 0) {
        iaSelectedIds.clear();

        const effective = getEffectiveIaPresets();
        const defaultImgMotor = effective.defaultImageEngine || 'MJ';
        const defaultVidMotor = effective.defaultVideoEngine || 'SD2';

        let initialSubfolder = 'root';
        if (iaActiveSubfolders.has('wip')) initialSubfolder = 'root';
        else if (iaActiveSubfolders.has('ref')) initialSubfolder = 'ref';
        else if (iaActiveSubfolders.has('export')) initialSubfolder = 'export';

        const fileArray = Array.from(input.files);
        fileArray.forEach((file) => {
            const extIndex = file.name.lastIndexOf('.');
            const ext = extIndex !== -1 ? file.name.substring(extIndex) : '.mp4';
            const originalPath = file.path || file.webkitRelativePath || file.name;

            // Evitar duplicar archivos identicos si ya estan en la cola
            const isAlreadyInQueue = iaBatchQueue.some(it => {
                if (it.file && file) {
                    return it.file.name === file.name && it.file.size === file.size && it.file.lastModified === file.lastModified;
                }
                return false;
            });
            if (isAlreadyInQueue) return;
            const isImg = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext.toLowerCase());
            const itemMotor = isImg ? defaultImgMotor : defaultVidMotor;

            const detectedHfId = extractHfJobId(file.name) || extractHfJobId(originalPath);
            const newItem = {
                id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                file: file,
                originalName: file.name,
                originalPath: originalPath,
                ext: ext,
                subfolder: initialSubfolder,
                motorChoice: 'auto',
                customMotor: '',
                motor: itemMotor,
                resChoice: 'auto',
                customRes: '',
                autoResTag: 'FHD',
                framingChoice: (document.getElementById('tokFramingSelect')?.value || 'FLL'),
                customFraming: '',
                tagAChoice: '',
                customTagA: '',
                tagBChoice: '',
                customTagB: '',
                tagCChoice: '',
                customTagC: '',
                version: '',
                isHiggsfield: false,
                hfJobId: detectedHfId || null,
                higgsfieldData: null,
                canonicalName: '',
                targetFolder: '',
                targetPath: '',
                checked: true,
                status: 'Pendiente'
            };
            iaBatchQueue.push(newItem);
            iaSelectedIds.add(newItem.id);

            // Autodetectar dimensiones para cada archivo en segundo plano
            autoDetectResolutionForActiveItem(newItem);
        });

        document.getElementById('iaFileNameDisplay').innerText = `${iaBatchQueue.length} archivo(s) en lista`;
        document.getElementById('iaFileMetaDisplay').innerText = `Haz clic en una fila abajo para ajustarla individualmente`;
        syncBuilderControlsWithSelection();
        updateIaPreview();
    }
}

function detectIaShotFromPath(p) {
    if (!p) return null;
    const cleanP = p.replace(/\\/g, '/');

    // 1. Si la ruta contiene /shots/[SHOT_ID]
    const shotsMatch = cleanP.match(/\/shots\/([^\/]+)/i);
    if (shotsMatch && shotsMatch[1] && !shotsMatch[1].startsWith('.')) {
        return shotsMatch[1];
    }

    // 2. Si alguna carpeta intermedia es un Shot ID (e.g. SURF_B03_044_0950)
    const segments = cleanP.split('/');
    for (const seg of segments) {
        if (/^[a-z0-9]+_[a-z0-9]+_[a-z0-9]+_\d{3,4}$/i.test(seg)) {
            return seg;
        }
    }

    // 3. Si el nombre del archivo contiene un Shot ID al inicio
    const fileName = segments[segments.length - 1] || '';
    const fileMatch = fileName.match(/^([a-z0-9]+_[a-z0-9]+_[a-z0-9]+_\d{3,4})/i);
    if (fileMatch && fileMatch[1]) {
        return fileMatch[1];
    }

    return null;
}

async function enqueuePathsToIaBatch(paths = [], options = {}) {
    if (!Array.isArray(paths) || paths.length === 0) return;

    // 1. Detectar si alguna ruta pertenece a un shot de VFX
    let detectedShotId = null;
    for (const p of paths) {
        const shot = detectIaShotFromPath(p);
        if (shot) {
            detectedShotId = shot;
            break;
        }
    }

    if (detectedShotId) {
        const parts = detectedShotId.split('_');
        if (parts.length >= 4) {
            const ep = parts[1];
            const seq = parts[2];
            iaSelectedEp = ep;
            iaSelectedSeq = seq;
            iaSelectedShot = detectedShotId;

            const epSel = document.getElementById('iaEpSelect');
            if (epSel) {
                if (!Array.from(epSel.options).some(o => o.value === ep)) {
                    if (typeof refreshIaHierarchy === 'function') {
                        await refreshIaHierarchy();
                    }
                }
                if (Array.from(epSel.options).some(o => o.value === ep)) {
                    epSel.value = ep;
                } else {
                    const opt = document.createElement('option');
                    opt.value = ep;
                    opt.textContent = ep;
                    opt.selected = true;
                    epSel.appendChild(opt);
                }
            }

            // Cargar escenas del episodio
            if (typeof handleIaEpChange === 'function') {
                await handleIaEpChange(ep);
            }

            const seqSel = document.getElementById('iaSeqSelect');
            if (seqSel) {
                if (Array.from(seqSel.options).some(o => o.value === seq)) {
                    seqSel.value = seq;
                } else {
                    const opt = document.createElement('option');
                    opt.value = seq;
                    opt.textContent = seq;
                    opt.selected = true;
                    seqSel.appendChild(opt);
                }
                seqSel.disabled = false;
            }

            // Cargar shots de la secuencia
            if (typeof handleIaSeqChange === 'function') {
                await handleIaSeqChange(seq);
            }

            const shotSel = document.getElementById('iaShotSelect');
            if (shotSel) {
                if (Array.from(shotSel.options).some(o => o.value === detectedShotId)) {
                    shotSel.value = detectedShotId;
                } else {
                    const opt = document.createElement('option');
                    opt.value = detectedShotId;
                    opt.textContent = detectedShotId;
                    opt.selected = true;
                    shotSel.appendChild(opt);
                }
                shotSel.disabled = false;
            }

            if (typeof handleIaShotChange === 'function') {
                handleIaShotChange(detectedShotId);
            }
        } else {
            if (typeof handleIaShotChange === 'function') {
                handleIaShotChange(detectedShotId);
            }
        }
    }

    const MEDIA_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'exr', 'tiff', 'tif', 'bmp']);

    async function collectFiles(itemPath, isDirectory) {
        if (!isDirectory) {
            const ext = (itemPath.split('.').pop() || '').toLowerCase();
            if (MEDIA_EXTS.has(ext)) {
                return [itemPath];
            }
            return [];
        }
        try {
            const res = await API.fetchDir(itemPath);
            let files = [];
            if (res && res.items && Array.isArray(res.items)) {
                for (const child of res.items) {
                    if (child.name.startsWith('.') || child.name.startsWith('_')) continue;
                    const childFiles = await collectFiles(child.path, child.isDirectory);
                    files = files.concat(childFiles);
                }
            }
            return files;
        } catch(e) {
            return [];
        }
    }

    let allMediaPaths = [];
    for (const p of paths) {
        const isDir = options.isDirMap ? !!options.isDirMap[p] : false;
        const collected = await collectFiles(p, isDir);
        allMediaPaths = allMediaPaths.concat(collected);
    }

    if (allMediaPaths.length === 0) {
        showIaAlert("⚠️ No se encontraron archivos de imagen o video válidos en la selección", "#ff9800");
        return;
    }

    const initialSubfolder = iaActiveSubfolders.has('wip') ? 'root'
        : (iaActiveSubfolders.has('ref') ? 'ref'
        : (iaActiveSubfolders.has('export') ? 'export' : 'root'));

    for (const p of allMediaPaths) {
        const normP = p.replace(/\\/g, '/');
        if (iaBatchQueue.some(it => it.originalPath === normP)) continue;
        const fileName = normP.split('/').pop();
        const ext = '.' + (fileName.split('.').pop() || '').toLowerCase();
        const isVideo = ['.mp4', '.mov'].includes(ext);
        const effective = getEffectiveIaPresets();
        const itemMotor = isVideo
            ? (effective.defaultVideoEngine || 'SD2')
            : (effective.defaultImageEngine || 'NB2P');
        const detectedHfId = extractHfJobId(fileName);

        const newItem = {
            id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            file: null,
            originalName: fileName,
            originalPath: normP,
            ext: ext,
            subfolder: initialSubfolder,
            motorChoice: 'auto',
            customMotor: '',
            motor: itemMotor,
            resChoice: 'auto',
            customRes: '',
            autoResTag: 'FHD',
            framingChoice: (document.getElementById('tokFramingSelect')?.value || 'FLL'),
            customFraming: '',
            tagAOn: true,
            tagAChoice: '',
            customTagA: '',
            tagBOn: false,
            tagBChoice: '',
            customTagB: '',
            tagCOn: false,
            tagCChoice: '',
            customTagC: '',
            version: '',
            isHiggsfield: false,
            hfJobId: detectedHfId || null,
            higgsfieldData: null,
            canonicalName: '',
            targetFolder: '',
            targetPath: '',
            checked: true,
            status: 'Pendiente'
        };
        iaBatchQueue.push(newItem);
        iaSelectedIds.add(newItem.id);
        autoDetectResolutionForActiveItem(newItem);
    }

    const nameDisp = document.getElementById('iaFileNameDisplay');
    const metaDisp = document.getElementById('iaFileMetaDisplay');
    if (nameDisp) nameDisp.innerText = `${iaBatchQueue.length} archivo(s) en lista`;
    if (metaDisp) metaDisp.innerText = `Haz clic en una fila abajo para ajustarla individualmente`;

    renderIaBatchTable();
    syncBuilderControlsWithSelection();
    updateIaPreview();
    showIaAlert(`✓ ${allMediaPaths.length} archivo(s) enviados a IA Ingest`, "#4caf50");
}

function getOriginFolderOnly(item) {
    if (!item || !item.originalPath) return '-';
    let full = item.originalPath.replace(/\\/g, '/');
    if (full.startsWith('[') || !full.includes('/')) {
        return '[Carpeta Local]';
    }
    const lastSlash = full.lastIndexOf('/');
    if (lastSlash !== -1) {
        return full.substring(0, lastSlash);
    }
    return full;
}

function renderIaBatchTable() {
    const tbody = document.getElementById('iaBatchTableBody');
    const infoEl = document.getElementById('iaQueueTotalInfo');
    if (!tbody) return;

    if (infoEl) infoEl.innerText = `(${iaBatchQueue.length} archivos en lista)`;

    if (iaBatchQueue.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding:20px; text-align:center; color:#666;">
                    No hay archivos en la cola. Arrastra archivos arriba para comenzar.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = iaBatchQueue.map((item, idx) => {
        const isSelected = iaSelectedIds.has(item.id);
        let statusBadge = '<span style="color:#ff9800;">⏳ Pendiente</span>';
        if (item.status === 'Ingestando...') statusBadge = '<span style="color:#2196f3; font-weight:bold;">⏳ Ingestando...</span>';
        else if (item.status === '✓ Ingestado') statusBadge = '<span style="color:#4caf50; font-weight:bold;">✓ Ingestado</span>';
        else if (item.status === '⚡ Encolado en Worker') statusBadge = '<span style="color:#ffb74d; font-weight:bold;">⚡ Encolado Worker</span>';
        else if (item.status.startsWith('❌')) statusBadge = `<span style="color:#f44336;" title="${item.status}">${item.status}</span>`;

        let newNameColHtml = '';
        if (item.isFetchingHf) {
            statusBadge = '<span style="color:#ff9800; font-size:0.75rem; font-weight:bold; display:inline-flex; align-items:center;"><span style="display:inline-block; width:8px; height:8px; border:2px solid #ff9800; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite; margin-right:4px;"></span>Obteniendo metadata...</span>';
            newNameColHtml = `
                <div style="display:inline-flex; align-items:center; gap:8px; color:#ff9800; font-size:0.78rem;">
                    <span style="display:inline-block; width:12px; height:12px; border:2px solid #ff9800; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span>
                    <span>⏳ Consultando Higgsfield (Job: ${escapeHtml((item.hfJobId || '').substring(0, 8))}...)...</span>
                </div>
            `;
        } else {
            newNameColHtml = `<span style="font-family:monospace; color:var(--accent); font-weight:bold;">${escapeHtml(item.canonicalName || '-')}</span>`;
            if (item.hasCollision) {
                newNameColHtml += ` <span style="background:rgba(244,67,54,0.2); color:#f44336; border:1px solid #f44336; border-radius:3px; padding:1px 4px; font-size:0.68rem; margin-left:4px;" title="Atención: Ya existe un archivo idéntico en disco. Se sobrescribirá al ingestar.">⚠️ Sobrescribe</span>`;
            }
        }

        const originFolder = getOriginFolderOnly(item);
        const hfBadge = item.isHiggsfield 
            ? `<span style="background:rgba(255,183,77,0.2); color:#ffb74d; border:1px solid #ffb74d; border-radius:3px; padding:1px 4px; font-size:0.68rem; margin-right:4px;" title="Higgsfield AI Job: ${item.hfJobId || ''}">⚡ HF</span>`
            : '';

        return `
            <tr style="border-bottom:1px solid #222; background:${isSelected ? 'rgba(76,175,80,0.22)' : 'transparent'}; border-left:${isSelected ? '4px solid #4caf50' : '4px solid transparent'}; cursor:pointer; user-select:none;" onclick="iaSelectRowItem('${item.id}', ${idx}, event)">
                <td style="padding:8px; text-align:center;" onclick="event.stopPropagation();">
                    <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="iaToggleBatchItemCheck('${item.id}', this.checked)">
                </td>
                <td style="padding:8px; color:#888;">${idx + 1}</td>
                <td style="padding:8px; font-weight:bold; color:#eee;">${hfBadge}${escapeHtml(item.originalName)}</td>
                <td style="padding:8px; font-family:monospace; color:#aaa;" title="${escapeHtml(originFolder)}">${escapeHtml(truncatePath(originFolder, 30))}</td>
                <td style="padding:8px; font-family:monospace;">${newNameColHtml}</td>
                <td style="padding:8px; font-family:monospace; color:#4caf50;" title="${escapeHtml(item.targetFolder)}">${truncatePath(item.targetFolder, 35)}</td>
                <td style="padding:8px;">${statusBadge}</td>
                <td style="padding:8px; text-align:center;" onclick="event.stopPropagation();">
                    <button class="tool-btn danger" style="padding:2px 6px; font-size:0.7rem;" onclick="iaRemoveBatchItem('${item.id}')">✕</button>
                </td>
            </tr>
        `;
    }).join('');
}

function iaSelectRowItem(id, idx, e) {
    if (e && e.shiftKey && iaLastSelectedIdx !== -1) {
        const start = Math.min(iaLastSelectedIdx, idx);
        const end = Math.max(iaLastSelectedIdx, idx);
        if (!e.ctrlKey && !e.metaKey) {
            iaSelectedIds.clear();
        }
        for (let i = start; i <= end; i++) {
            if (iaBatchQueue[i]) {
                iaSelectedIds.add(iaBatchQueue[i].id);
            }
        }
    } else if (e && (e.ctrlKey || e.metaKey)) {
        if (iaSelectedIds.has(id)) iaSelectedIds.delete(id);
        else iaSelectedIds.add(id);
        iaLastSelectedIdx = idx;
    } else {
        iaSelectedIds.clear();
        iaSelectedIds.add(id);
        iaLastSelectedIdx = idx;
    }

    syncBuilderControlsWithSelection();
    updateIaPreview();
}

function iaToggleBatchItemCheck(id, checked) {
    const item = iaBatchQueue.find(i => i.id === id);
    if (item) {
        item.checked = checked;
        updateIaPreview();
    }
}

function iaToggleSelectAllBatch(checked) {
    iaBatchQueue.forEach(i => i.checked = checked);
    updateIaPreview();
}

function iaSetAllBatchCheck(state) {
    const selectAllCheck = document.getElementById('iaBatchSelectAll');
    if (selectAllCheck) selectAllCheck.checked = state;
    iaToggleSelectAllBatch(state);
}

function iaClearCompletedBatch() {
    iaBatchQueue = iaBatchQueue.filter(i => i.status !== '✓ Ingestado');
    iaSelectedIds.clear();
    updateIaPreview();
}

function iaRemoveBatchItem(id) {
    iaBatchQueue = iaBatchQueue.filter(i => i.id !== id);
    iaSelectedIds.delete(id);
    updateIaPreview();
}

async function executeIaIngestBatch() {
    const checkedItems = iaBatchQueue.filter(i => i.checked);
    if (checkedItems.length === 0) {
        showIaAlert("⚠️ No hay archivos marcados en la tabla para ingestar.", "#ff9800");
        return;
    }

    const copyRootChecked = document.getElementById('iaCopyRootCheck')?.checked;
    const baseIaPath = document.getElementById('iaResolvedPath')?.innerText || iaCurrentResolvedIaPath;

    showIaAlert(`⏳ Ingestando ${checkedItems.length} archivo(s)...`, "#ff9800");

    // Recolectar todas las carpetas de destino activas
    const activeTargets = [];
    if (iaActiveSubfolders.has('wip') || iaActiveSubfolders.size === 0) activeTargets.push(baseIaPath);
    if (iaActiveSubfolders.has('ref')) activeTargets.push(baseIaPath + '/ref');
    if (iaActiveSubfolders.has('export')) activeTargets.push(baseIaPath + '/export');

    if (typeof PipetaConsole !== 'undefined') {
        PipetaConsole.log('ingest', `[IA INGEST] 🚀 Iniciando ingesta por lote de ${checkedItems.length} archivo(s) hacia [${activeTargets.map(t => t.split('/').slice(-2).join('/')).join(', ')}]`, 'info');
    }

    for (let i = 0; i < checkedItems.length; i++) {
        const item = checkedItems[i];
        item.status = 'Ingestando...';
        renderIaBatchTable();

        try {
            let fileDataBase64 = null;
            let sourceFilePath = null;

            const isAbsolutePath = item.originalPath && 
                (item.originalPath.includes(':') || item.originalPath.startsWith('/') || item.originalPath.startsWith('\\\\')) &&
                !item.originalPath.startsWith('[') && !item.originalPath.startsWith('http');

            if (isAbsolutePath) {
                sourceFilePath = item.originalPath;
            } 
            
            if (item.file && (item.file instanceof Blob || (typeof File !== 'undefined' && item.file instanceof File))) {
                fileDataBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const res = reader.result;
                        if (typeof res === 'string') {
                            const commaIdx = res.indexOf(',');
                            resolve(commaIdx !== -1 ? res.substring(commaIdx + 1) : res);
                        } else {
                            resolve(null);
                        }
                    };
                    reader.onerror = (err) => reject(err);
                    reader.readAsDataURL(item.file);
                });
            }

            // Ingestar a cada una de las carpetas de destino seleccionadas
            // Solo usar pipeline de Higgsfield si está explícitamente activado en el ítem (botón HF)
            const isHf = !!item.isHiggsfield;

            if (isHf) {
                // Solo enviar al worker si proviene de una URL remota. Archivos locales se procesan siempre localmente.
                const isWorker = !!(item.sourceUrl && ((window.hfOptions && window.hfOptions.forceWorker) || hfExecutor === 'worker'));
                const createLedgerVal = (window.hfOptions && typeof window.hfOptions.createLedger !== 'undefined') 
                    ? window.hfOptions.createLedger 
                    : (document.getElementById('hfCreateLedgerCheck')?.checked !== false);
                const downloadRefsVal = (window.hfOptions && typeof window.hfOptions.downloadRefs !== 'undefined')
                    ? window.hfOptions.downloadRefs
                    : (document.getElementById('hfDownloadRefsCheck')?.checked === true);
                const preserveOriginalVal = (window.hfOptions && typeof window.hfOptions.preserveOriginal !== 'undefined')
                    ? window.hfOptions.preserveOriginal
                    : (document.getElementById('hfPreserveOriginalCheck')?.checked !== false);

                const hfPayload = {
                    executor: isWorker ? 'worker' : 'local',
                    jobId: item.hfJobId,
                    sourceUrl: item.sourceUrl || null,
                    sourcePath: sourceFilePath,
                    fileData: fileDataBase64,
                    targetShotFolder: baseIaPath,
                    canonicalName: item.canonicalName,
                    createLedger: createLedgerVal,
                    downloadRefs: downloadRefsVal,
                    preserveOriginal: preserveOriginalVal,
                    targetSubfolders: Array.from(iaActiveSubfolders),
                    framing: item.framingChoice || item.framing || 'FLL',
                    role: item.tagCChoice || item.hfRole || 'v2v',
                    jobDetails: item.higgsfieldData || null,
                    project: (typeof currentProject !== 'undefined' && currentProject) ? currentProject.name : 'STUDIO',
                    user: (typeof settings !== 'undefined' && settings.user) ? settings.user : 'Pipeta'
                };

                const res = await fetch('/api/higgsfield/ingest', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(hfPayload)
                });

                const data = await res.json();
                if (data && data.success) {
                    item.status = isWorker ? '⚡ Encolado en Worker' : '✓ Ingestado';
                    if (data.targetFile) {
                        item.destination = data.targetFile;
                        item.targetPath = data.targetFile.replace(/\\/g, '/');
                    }
                    if (typeof PipetaConsole !== 'undefined') {
                        PipetaConsole.log('ingest', ` ↳ [HIGGSFIELD INGEST] ⚡ ${item.originalName} ➡️ ${item.canonicalName} (${isWorker ? 'WORKER' : 'LOCAL'})`, 'ok');
                    }
                } else {
                    item.status = `❌ ${data?.error || 'Error en ingesta Higgsfield'}`;
                    if (typeof PipetaConsole !== 'undefined') {
                        PipetaConsole.log('ingest', ` ↳ [HIGGSFIELD ERROR] ❌ ${item.originalName}: ${data?.error || 'Error'}`, 'error');
                    }
                }
            } else {
                let allSuccess = true;
                let lastErr = '';

                for (const targetDir of activeTargets) {
                    const res = await fetch('/api/ia/ingest', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            targetFolder: targetDir,
                            filename: item.canonicalName,
                            sourcePath: sourceFilePath,
                            fileData: fileDataBase64
                        })
                    });

                    const contentType = res.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        const data = await res.json();
                        if (!data || !data.success) {
                            allSuccess = false;
                            lastErr = data ? data.error : 'Error desconocido';
                        }
                    } else {
                        allSuccess = false;
                        lastErr = `Error HTTP ${res.status}`;
                    }
                }

                if (allSuccess) {
                    item.status = '✓ Ingestado';
                    item.destination = (activeTargets[0] + '/' + item.canonicalName).replace(/\\/g, '/');
                    item.targetPath = item.destination;
                    if (typeof PipetaConsole !== 'undefined') {
                        PipetaConsole.log('ingest', ` ↳ [IA CANONICAL] 📄 ${item.name || item.originalName}  ➡️  ${item.canonicalName} (${item.motor || 'MOTOR'}, ${item.res || 'RES'}, ${item.framing || 'FRAMING'})`, 'ok');
                    }
                } else {
                    item.status = `❌ ${lastErr || 'Error'}`;
                    if (typeof PipetaConsole !== 'undefined') {
                        PipetaConsole.log('ingest', ` ↳ [IA ERROR] ❌ ${item.name || item.originalName}: ${lastErr || 'Error'}`, 'error');
                    }
                }
            }

        } catch (e) {
            item.status = `❌ ${e.message}`;
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('ingest', ` ↳ [IA EXCEPTION] ❌ ${item.name || item.originalName}: ${e.message}`, 'error');
            }
        }
        renderIaBatchTable();
    }

    // Persistir tokens personalizados si la casilla 'Save after queue' está marcada
    await saveCustomTokensIfRequested();

    const okCount = checkedItems.filter(i => i.status === '✓ Ingestado').length;
    if (typeof PipetaConsole !== 'undefined') {
        PipetaConsole.log('ingest', `[IA INGEST] ✅ Procesamiento por lote finalizado: ${okCount} de ${checkedItems.length} archivos guardados con éxito.`, okCount === checkedItems.length ? 'ok' : 'warn');
    }

    const workerCount = checkedItems.filter(i => i.status && i.status.includes('Worker')).length;
    if (workerCount > 0 && window.syncQueueUI) {
        window.syncQueueUI.fetchStatus();
        window.syncQueueUI.open();
    }

    showIaAlert(workerCount > 0 ? `⚡ ${workerCount} orden(es) enviadas al Sync Worker.` : `✓ Procesamiento por lote completado.`, "#4caf50");
    updateIaResolution(); // Recalcular siguiente versión base
}

async function fetchWebOrDataUrlImage(url) {
    try {
        showIaAlert("⏳ Descargando imagen desde URL web...", "#2196f3");
        const res = await fetch(url);
        const blob = await res.blob();
        if (blob) {
            const ext = blob.type.includes('png') ? '.png' : (blob.type.includes('jpeg') || blob.type.includes('jpg') ? '.jpg' : '.png');
            const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14);
            const file = new File([blob], `web_download_${timestamp}${ext}`, { type: blob.type });
            file.path = url; // Guardar URL original como referencia de origen
            handleIaFileSelect({ files: [file] });
            showIaAlert("✓ Imagen web capturada y agregada a la cola", "#4caf50");
        }
    } catch(e) {
        showIaAlert("❌ No se pudo descargar la imagen de la web: " + e.message, "#f44336");
    }
}

async function handleIaDropEvent(e) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
    }

    // Debounce de seguridad (evita dobles procesamientos en ráfagas < 350ms)
    const now = Date.now();
    if (now - _iaLastDropTime < 350) return;
    _iaLastDropTime = now;

    const dropZone = document.getElementById('iaDropZone');
    if (dropZone) {
        dropZone.style.borderColor = '#444';
        dropZone.style.background = '#111';
    }

    // 1. Detectar arrastre interno desde Pipeta Explorer (árbol de archivos / mirror)
    let internalData = window._pipetaDragData;
    if (!internalData && e.dataTransfer) {
        try {
            const raw = e.dataTransfer.getData('application/json');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.type === 'pipeta-files') {
                    internalData = parsed;
                }
            }
        } catch(err) {}
    }

    if (internalData && Array.isArray(internalData.paths) && internalData.paths.length > 0) {
        if (typeof enqueuePathsToIaBatch === 'function') {
            await enqueuePathsToIaBatch(internalData.paths, { isDirMap: internalData.isDirMap });
            showIaAlert(`✓ ${internalData.paths.length} elemento(s) incorporados desde Explorer`, '#4caf50');
        }
        window._pipetaDragData = null;
        return;
    }

    // 2. Detectar arrastre externo de archivos desde Windows Explorer
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
        handleIaFileSelect({ files: dt.files });
        return;
    }

    // 3. Detectar arrastre de URLs web (Higgsfield, web images)
    if (dt) {
        const url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').trim();
        if (url) {
            if (extractHfJobId(url)) {
                handleHfDirectLoad(url);
            } else if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/')) {
                fetchWebOrDataUrlImage(url);
            }
        }
    }
}

function initIaDropZone() {
    const dropZone = document.getElementById('iaDropZone');
    const iaView = document.getElementById('view-ia-ingest');
    const iaWin = document.getElementById('ia-ingest-window');
    if (!dropZone) return;

    if (dropZone._iaDropListenersAttached) return;
    dropZone._iaDropListenersAttached = true;

    // 1. Configurar listeners específicos sobre el recuadro "2. CARGAR ARCHIVOS"
    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _iaDropDepthCounter++;
        dropZone.style.borderColor = 'var(--accent)';
        dropZone.style.background = '#252525';
    }, false);

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        dropZone.style.borderColor = 'var(--accent)';
        dropZone.style.background = '#252525';
    }, false);

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _iaDropDepthCounter--;
        if (_iaDropDepthCounter <= 0) {
            _iaDropDepthCounter = 0;
            dropZone.style.borderColor = '#444';
            dropZone.style.background = '#111';
        }
    }, false);

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
            e.stopImmediatePropagation();
        }
        _iaDropDepthCounter = 0;
        dropZone.style.borderColor = '#444';
        dropZone.style.background = '#111';
        handleIaDropEvent(e);
    }, false);

    // 2. Configurar contenedores de respaldo (vista completa y ventana flotante)
    const backupContainers = [iaView, iaWin].filter(Boolean);
    backupContainers.forEach(container => {
        if (container._iaBackupDropAttached) return;
        container._iaBackupDropAttached = true;

        container.addEventListener('dragover', (e) => {
            // Permitir arrastrar sobre cualquier parte de la vista
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        }, false);

        container.addEventListener('drop', (e) => {
            // Si el drop ya ocurrió dentro de dropZone, stopPropagation lo detuvo
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            }
            _iaDropDepthCounter = 0;
            dropZone.style.borderColor = '#444';
            dropZone.style.background = '#111';
            handleIaDropEvent(e);
        }, false);
    });
}

async function initIaIngest() {
    initIaResizer();
    initIaDropZone();
    loadCustomTokens();
    updateHfForceWorkerUI();
    updateAllIaTokenModulesUI();
    switchIaWorkMode(window.iaWorkMode || 'simple');
    await checkIaDriveType();
    refreshIaHierarchy();
    updateIaResolution();
}

// Global Window Exports (Queue, DropZone, Preview & Init)
window.openCurrentPreviewExternally = openCurrentPreviewExternally;
window.initIaIngest = initIaIngest;
window.initIaDropZone = initIaDropZone;
window.enqueuePathsToIaBatch = enqueuePathsToIaBatch;
window.detectIaShotFromPath = detectIaShotFromPath;

document.addEventListener('DOMContentLoaded', () => {
    initIaResizer();
    initIaDropZone();
    loadCustomTokens();
    updateHfForceWorkerUI();
    updateAllIaTokenModulesUI();
    switchIaWorkMode(window.iaWorkMode || 'simple');
    setTimeout(async () => {
        await checkIaDriveType();
        refreshIaHierarchy();
    }, 200);
});

// Listener global para pegar imágenes directamente del portapapeles (Ctrl + V)
window.addEventListener('paste', (e) => {
    const iaView = document.getElementById('view-ia-ingest');
    if (!iaView || iaView.style.display === 'none') return;

    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            if (blob) {
                const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14);
                const file = new File([blob], `clipboard_image_${timestamp}.png`, { type: blob.type || 'image/png' });
                file.path = '[Portapapeles / Ctrl+V]';
                handleIaFileSelect({ files: [file] });
                showIaAlert("📋 Imagen pegada directamente desde el portapapeles", "#4caf50");
            }
        }
    }
});
