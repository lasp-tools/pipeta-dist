// --- IA INGEST & BATCH NOMENCLATURE LOGIC (v0.9.02 Module) ---
let iaBatchQueue = [];
let iaSelectedIds = new Set();
let iaBaseVersionNum = 1;
let iaCurrentResolvedIaPath = '';

// --- 1. RESOLVER SHOT ID & RUTA DE MEDIA ---
async function updateIaResolution() {
    const shotIdInput = document.getElementById('iaShotIdInput');
    const shotId = (shotIdInput ? shotIdInput.value : '').trim();
    const valEl = document.getElementById('tokShotIdVal');
    if (valEl) valEl.innerText = shotId || 'SHOT_ID';

    if (!shotId) return;

    try {
        let mediaRoot = '';
        if (typeof settings !== 'undefined' && settings.currentProject && settings.currentProject.roots) {
            mediaRoot = settings.currentProject.roots.media || settings.currentProject.roots.work;
        }
        const res = await fetch(`/api/ia/resolve-shot?shotId=${encodeURIComponent(shotId)}&mediaRoot=${encodeURIComponent(mediaRoot)}`);
        const data = await res.json();
        if (data.iaPath) {
            iaCurrentResolvedIaPath = data.iaPath;
            const pathEl = document.getElementById('iaResolvedPath');
            if (pathEl) pathEl.innerText = data.iaPath;
            if (data.suggestedVersion) {
                const match = data.suggestedVersion.match(/v(\d+)/i);
                if (match) iaBaseVersionNum = parseInt(match[1], 10);
                const verEl = document.getElementById('tokVerInput');
                if (verEl && !iaSelectedIds.size) {
                    verEl.value = 'v' + String(iaBaseVersionNum).padStart(3, '0');
                }
            }
        }
    } catch(e) {
        console.error("Resolution error", e);
    }
    updateIaPreview();
}

// --- 2. GESTIÓN DE CUSTOM INPUTS Y CONSTRUCCIÓN DE TOKENS ---
function getIaTokenValues(itemIndexOffset = 0) {
    const shotIdOn = document.getElementById('tokShotIdToggle')?.checked;
    const motorOn = document.getElementById('tokMotorToggle')?.checked;
    const resOn = document.getElementById('tokResToggle')?.checked;
    const framingOn = document.getElementById('tokFramingToggle')?.checked;
    const tagOn = document.getElementById('tokTagToggle')?.checked;
    const verOn = document.getElementById('tokVerToggle')?.checked;

    const shotId = document.getElementById('iaShotIdInput')?.value.trim() || '';

    // Motor (Dropdown + Custom)
    const motorSel = document.getElementById('tokMotorSelect');
    const motorCustomEl = document.getElementById('tokMotorCustom');
    let motor = motorSel?.value || '';
    if (motor === 'custom') {
        if (motorCustomEl) motorCustomEl.style.display = 'block';
        motor = motorCustomEl?.value.trim() || '';
    } else {
        if (motorCustomEl) motorCustomEl.style.display = 'none';
    }

    // Res (Dropdown + Custom)
    const resSel = document.getElementById('tokResSelect');
    const resCustomEl = document.getElementById('tokResCustom');
    let resolution = resSel?.value || '';
    if (resolution === 'custom') {
        if (resCustomEl) resCustomEl.style.display = 'block';
        resolution = resCustomEl?.value.trim() || '';
    } else {
        if (resCustomEl) resCustomEl.style.display = 'none';
    }

    // Framing (Dropdown + Custom)
    const framingSel = document.getElementById('tokFramingSelect');
    const framingCustomEl = document.getElementById('tokFramingCustom');
    let framing = framingSel?.value || '';
    if (framing === 'custom') {
        if (framingCustomEl) framingCustomEl.style.display = 'block';
        framing = framingCustomEl?.value.trim() || '';
    } else {
        if (framingCustomEl) framingCustomEl.style.display = 'none';
    }

    // Tags Niveles A-B-C (Dropdown + Custom)
    const tagASel = document.getElementById('tokTagALevel');
    const tagACustomEl = document.getElementById('tokTagACustom');
    let tagA = tagASel?.value || '';
    if (tagA === 'custom') {
        if (tagACustomEl) tagACustomEl.style.display = 'block';
        tagA = tagACustomEl?.value.trim() || '';
    } else {
        if (tagACustomEl) tagACustomEl.style.display = 'none';
    }

    const tagBSel = document.getElementById('tokTagBLevel');
    const tagBCustomEl = document.getElementById('tokTagBCustom');
    let tagB = tagBSel?.value || '';
    if (tagB === 'custom') {
        if (tagBCustomEl) tagBCustomEl.style.display = 'block';
        tagB = tagBCustomEl?.value.trim() || '';
    } else {
        if (tagBCustomEl) tagBCustomEl.style.display = 'none';
    }

    const tagCSel = document.getElementById('tokTagCLevel');
    const tagCCustomEl = document.getElementById('tokTagCCustom');
    let tagC = tagCSel?.value || '';
    if (tagC === 'custom') {
        if (tagCCustomEl) tagCCustomEl.style.display = 'block';
        tagC = tagCCustomEl?.value.trim() || '';
    } else {
        if (tagCCustomEl) tagCCustomEl.style.display = 'none';
    }

    const tagRole = [tagA, tagB, tagC].filter(Boolean).join('-');

    // Version con incremento secuencial para items múltiples
    const verInputVal = document.getElementById('tokVerInput')?.value.trim() || 'v001';
    let version = verInputVal;
    if (itemIndexOffset > 0) {
        const matchVer = verInputVal.match(/v(\d+)/i);
        const startNum = matchVer ? parseInt(matchVer[1], 10) : iaBaseVersionNum;
        const seqNum = startNum + itemIndexOffset;
        version = 'v' + String(seqNum).padStart(3, '0');
    }

    const tokens = [];
    if (shotIdOn && shotId) tokens.push(shotId);
    if (motorOn && motor) tokens.push(motor);
    if (resOn && resolution) tokens.push(resolution);
    if (framingOn && framing) tokens.push(framing);
    if (tagOn && tagRole) tokens.push(tagRole);
    if (verOn && version) tokens.push(version);

    return { tokens, canonicalBase: tokens.join('_'), version };
}

// --- 3. ACTUALIZACIÓN DE PREVIEW Y TABLA ---
function getTargetFolderForItem(subfolderKey) {
    const baseIaPath = document.getElementById('iaResolvedPath')?.innerText || iaCurrentResolvedIaPath;
    let targetFolder = baseIaPath;
    if (subfolderKey === 'ref') targetFolder += '/ref';
    else if (subfolderKey === 'export') targetFolder += '/export';
    return targetFolder;
}

function updateIaPreview() {
    const selectedSubfolder = document.getElementById('iaSubfolderSelect')?.value || 'root';

    // Determinar qué ítems se deben modificar con el builder de tokens actual:
    // Si el usuario tiene filas seleccionadas explícitamente (iaSelectedIds), modifica ÚNICAMENTE esas filas.
    // De lo contrario, modifica los elementos marcados (checked) en la lista.
    const targetItems = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    let activeSeqIndex = 0;
    targetItems.forEach((item) => {
        item.subfolder = selectedSubfolder;
        const tokenRes = getIaTokenValues(activeSeqIndex);
        item.canonicalName = tokenRes.canonicalBase + (item.ext || '.mp4');
        item.targetFolder = getTargetFolderForItem(item.subfolder);
        item.targetPath = (item.targetFolder + '/' + item.canonicalName).replace(/\\/g, '/');
        activeSeqIndex++;
    });

    // Asegurar que la carpeta de destino esté actualizada en todos los ítems según su subcarpeta propia
    iaBatchQueue.forEach((item) => {
        if (!item.subfolder) item.subfolder = 'root';
        item.targetFolder = getTargetFolderForItem(item.subfolder);
        if (item.canonicalName) {
            item.targetPath = (item.targetFolder + '/' + item.canonicalName).replace(/\\/g, '/');
        }
    });

    renderIaBatchTable();

    // Actualizar Preview Principal (primer item o selección)
    const activeItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id)) || iaBatchQueue[0];
    const canonicalDisplay = document.getElementById('iaCanonicalOutputDisplay');
    const pathDisplay = document.getElementById('iaCanonicalPathDisplay');

    if (activeItem) {
        if (canonicalDisplay) canonicalDisplay.innerText = activeItem.canonicalName;
        if (pathDisplay) pathDisplay.innerText = `Ruta: ${activeItem.targetPath}`;
    } else {
        const singleTokens = getIaTokenValues(0);
        const defaultFolder = getTargetFolderForItem(selectedSubfolder);
        const defaultName = singleTokens.canonicalBase + '.mp4';
        if (canonicalDisplay) canonicalDisplay.innerText = defaultName;
        if (pathDisplay) pathDisplay.innerText = `Ruta: ${(defaultFolder + '/' + defaultName).replace(/\\/g, '/')}`;
    }

    // Actualizar el visualizador multimedia (Imagen / Video MP4)
    updateIaMediaPreview(activeItem);

    const countDisplay = document.getElementById('iaSelectedCountDisplay');
    if (countDisplay) {
        if (iaSelectedIds.size > 0) {
            countDisplay.innerText = `${iaSelectedIds.size} ítem(s) seleccionado(s) — Editando en lote`;
        } else {
            const checkedCount = iaBatchQueue.filter(i => i.checked).length;
            countDisplay.innerText = `${checkedCount} de ${iaBatchQueue.length} listados para ingestar`;
        }
    }
}

function updateIaMediaPreview(activeItem) {
    const placeholder = document.getElementById('iaMediaPlaceholder');
    const imgEl = document.getElementById('iaImagePreview');
    const videoEl = document.getElementById('iaVideoPreview');

    if (!placeholder || !imgEl || !videoEl) return;

    if (!activeItem) {
        placeholder.style.display = 'block';
        placeholder.innerText = '📷 Selecciona o arrastra un archivo en la lista para ver su vista previa (Imagen / Video MP4)';
        imgEl.style.display = 'none';
        videoEl.style.display = 'none';
        videoEl.pause();
        return;
    }

    let previewUrl = '';
    if (activeItem.file) {
        previewUrl = URL.createObjectURL(activeItem.file);
    } else if (activeItem.originalPath && !activeItem.originalPath.startsWith('[')) {
        previewUrl = `/api/ia/file-preview?path=${encodeURIComponent(activeItem.originalPath)}`;
    }

    const ext = (activeItem.ext || '').toLowerCase();
    const isVideo = ['.mp4', '.mov', '.webm', '.mkv'].includes(ext);
    const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);

    if (previewUrl && isVideo) {
        placeholder.style.display = 'none';
        imgEl.style.display = 'none';
        videoEl.style.display = 'block';
        videoEl.src = previewUrl;
        videoEl.play().catch(e => {});
    } else if (previewUrl && isImage) {
        placeholder.style.display = 'none';
        videoEl.style.display = 'none';
        videoEl.pause();
        imgEl.style.display = 'block';
        imgEl.src = previewUrl;
    } else {
        placeholder.style.display = 'block';
        placeholder.innerText = `📄 ${activeItem.originalName} (${ext.toUpperCase() || 'Archivo'})`;
        imgEl.style.display = 'none';
        videoEl.style.display = 'none';
        videoEl.pause();
    }
}

// --- 4. MANEJO DE SELECCIÓN Y DRAG & DROP MULTI-ARCHIVO ---
function handleIaFileSelect(input) {
    if (input.files && input.files.length > 0) {
        iaSelectedIds.clear(); // Limpiar selección previa para enfocar los nuevos archivos
        const initialSubfolder = document.getElementById('iaSubfolderSelect')?.value || 'root';
        Array.from(input.files).forEach(file => {
            const extIndex = file.name.lastIndexOf('.');
            const ext = extIndex !== -1 ? file.name.substring(extIndex) : '.mp4';
            const originalPath = file.path || file.webkitRelativePath || file.name;
            const newItem = {
                id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                file: file,
                originalName: file.name,
                originalPath: originalPath,
                ext: ext,
                subfolder: initialSubfolder,
                canonicalName: '',
                targetFolder: '',
                targetPath: '',
                checked: true,
                status: 'Pendiente'
            };
            iaBatchQueue.push(newItem);
            iaSelectedIds.add(newItem.id);
        });

        document.getElementById('iaFileNameDisplay').innerText = `${iaBatchQueue.length} archivo(s) en lista`;
        document.getElementById('iaFileMetaDisplay').innerText = `Haz clic en una fila abajo para ajustarla individualmente`;
        updateIaPreview();
    }
}

let iaLastSelectedIdx = -1;

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

// --- 5. RENDERIZADO DE TABLA BATCH ---
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
        else if (item.status.startsWith('❌')) statusBadge = `<span style="color:#f44336;" title="${item.status}">${item.status}</span>`;

        const originFolder = getOriginFolderOnly(item);

        return `
            <tr style="border-bottom:1px solid #222; background:${isSelected ? 'rgba(76,175,80,0.15)' : 'transparent'}; cursor:pointer; user-select:none;" onclick="iaSelectRowItem('${item.id}', ${idx}, event)">
                <td style="padding:8px; text-align:center;" onclick="event.stopPropagation();">
                    <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="iaToggleBatchItemCheck('${item.id}', this.checked)">
                </td>
                <td style="padding:8px; color:#888;">${idx + 1}</td>
                <td style="padding:8px; font-weight:bold; color:#eee;">${escapeHtml(item.originalName)}</td>
                <td style="padding:8px; font-family:monospace; color:#aaa;" title="${escapeHtml(originFolder)}">${escapeHtml(truncatePath(originFolder, 30))}</td>
                <td style="padding:8px; font-family:monospace; color:var(--accent); font-weight:bold;">${escapeHtml(item.canonicalName)}</td>
                <td style="padding:8px; font-family:monospace; color:#4caf50;" title="${escapeHtml(item.targetFolder)}">${truncatePath(item.targetFolder, 35)}</td>
                <td style="padding:8px;">${statusBadge}</td>
                <td style="padding:8px; text-align:center;" onclick="event.stopPropagation();">
                    <button class="tool-btn danger" style="padding:2px 6px; font-size:0.7rem;" onclick="iaRemoveBatchItem('${item.id}')">✕</button>
                </td>
            </tr>
        `;
    }).join('');
}

function truncatePath(fullPath, maxLen = 30) {
    if (!fullPath) return '-';
    if (!fullPath.includes('/') && !fullPath.includes('\\')) {
        return `[Carpeta Local] ${fullPath}`;
    }
    if (fullPath.length <= maxLen) return fullPath;
    return '...' + fullPath.substring(fullPath.length - maxLen);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

    // Sincronizar el selector de subcarpeta del builder con el elemento seleccionado
    if (iaSelectedIds.size === 1) {
        const singleItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id));
        const subSelect = document.getElementById('iaSubfolderSelect');
        if (singleItem && subSelect && singleItem.subfolder) {
            subSelect.value = singleItem.subfolder;
        }
    }

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

// --- 6. ACCIONES DE COPIAR Y ABRIR CARPETA ---
function copyCanonicalName() {
    const text = document.getElementById('iaCanonicalOutputDisplay')?.innerText;
    if (text) {
        navigator.clipboard.writeText(text);
        showIaAlert("✓ Nombre copiado al portapapeles", "#4caf50");
    }
}

function copyCanonicalPath() {
    const activeItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id)) || iaBatchQueue[0];
    let pathText = activeItem ? activeItem.targetPath : document.getElementById('iaCanonicalPathDisplay')?.innerText.replace('Ruta: ', '');
    if (pathText) {
        navigator.clipboard.writeText(pathText);
        showIaAlert("✓ Ruta completa copiada al portapapeles", "#4caf50");
    }
}

async function openTargetFolder() {
    const activeItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id)) || iaBatchQueue[0];
    let folder = activeItem ? activeItem.targetFolder : document.getElementById('iaResolvedPath')?.innerText;
    if (!folder) return;

    try {
        const res = await fetch(`/api/ia/open-folder?folderPath=${encodeURIComponent(folder)}`);
        const data = await res.json();
        if (data.success) {
            showIaAlert(`📂 Carpeta abierta en Explorer: ${data.opened}`, "#4caf50");
        } else {
            showIaAlert(`❌ Error al abrir carpeta: ${data.error}`, "#f44336");
        }
    } catch(e) {
        showIaAlert(`❌ Error de conexión: ${e.message}`, "#f44336");
    }
}

// --- 7. PERSISTENCIA DE TOKENS PERSONALIZADOS (ia_custom_tokens.json) ---
async function loadCustomTokens() {
    try {
        const res = await fetch('/api/ia/custom-tokens');
        const data = await res.json();
        if (data) {
            populateCustomOptions('tokMotorSelect', data.motors);
            populateCustomOptions('tokResSelect', data.resolutions);
            populateCustomOptions('tokFramingSelect', data.framings);
            populateCustomOptions('tokTagALevel', data.tagsA);
            populateCustomOptions('tokTagBLevel', data.tagsB);
            populateCustomOptions('tokTagCLevel', data.tagsC);
        }
    } catch(e) {
        console.error("Error al cargar tokens personalizados", e);
    }
}

function populateCustomOptions(selectId, customArray = []) {
    const selectEl = document.getElementById(selectId);
    if (!selectEl || !customArray || customArray.length === 0) return;

    const customOpt = selectEl.querySelector('option[value="custom"]');
    customArray.forEach(val => {
        if (!selectEl.querySelector(`option[value="${val}"]`)) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.innerText = val;
            if (customOpt) {
                selectEl.insertBefore(opt, customOpt);
            } else {
                selectEl.appendChild(opt);
            }
        }
    });
}

async function saveCustomTokensIfRequested() {
    const saveChecked = document.getElementById('iaSaveCustomCheck')?.checked;
    if (!saveChecked) return;

    const getValIfCustom = (selectId, customInputId) => {
        const sel = document.getElementById(selectId)?.value;
        const cust = document.getElementById(customInputId)?.value.trim();
        return (sel === 'custom' && cust) ? [cust] : [];
    };

    const payload = {
        motors: getValIfCustom('tokMotorSelect', 'tokMotorCustom'),
        resolutions: getValIfCustom('tokResSelect', 'tokResCustom'),
        framings: getValIfCustom('tokFramingSelect', 'tokFramingCustom'),
        tagsA: getValIfCustom('tokTagALevel', 'tokTagACustom'),
        tagsB: getValIfCustom('tokTagBLevel', 'tokTagBCustom'),
        tagsC: getValIfCustom('tokTagCLevel', 'tokTagCCustom')
    };

    const hasAny = Object.values(payload).some(arr => arr.length > 0);
    if (hasAny) {
        try {
            await fetch('/api/ia/save-custom-tokens', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            await loadCustomTokens();
        } catch(e) {
            console.error("Error al guardar tokens personalizados", e);
        }
    }
}

// --- 8. EJECUCIÓN DE INGESTA POR LOTE (BATCH INGEST) ---
async function executeIaIngestBatch() {
    const checkedItems = iaBatchQueue.filter(i => i.checked);
    if (checkedItems.length === 0) {
        showIaAlert("⚠️ No hay archivos marcados en la tabla para ingestar.", "#ff9800");
        return;
    }

    const copyRootChecked = document.getElementById('iaCopyRootCheck')?.checked;
    const baseIaPath = document.getElementById('iaResolvedPath')?.innerText || iaCurrentResolvedIaPath;

    showIaAlert(`⏳ Ingestando ${checkedItems.length} archivo(s)...`, "#ff9800");

    for (let i = 0; i < checkedItems.length; i++) {
        const item = checkedItems[i];
        item.status = 'Ingestando...';
        renderIaBatchTable();

        try {
            let fileDataBase64 = null;
            let sourceFilePath = null;

            if (item.originalPath && !item.originalPath.startsWith('[') && !item.originalPath.startsWith('http')) {
                sourceFilePath = item.originalPath;
            } else if (item.file) {
                fileDataBase64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(item.file);
                });
            }

            // Ingestar a destino principal (ej: /IA/ref/ o /IA/export/ o /IA/)
            const res = await fetch('/api/ia/ingest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetFolder: item.targetFolder,
                    filename: item.canonicalName,
                    sourcePath: sourceFilePath,
                    fileData: fileDataBase64
                })
            });

            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await res.json();
                if (data && data.success) {
                    item.status = '✓ Ingestado';

                    // Si copyRootChecked está encendido y la subcarpeta no es raíz, copiar también en la raíz /IA/
                    if (copyRootChecked && item.subfolder !== 'root' && baseIaPath) {
                        try {
                            await fetch('/api/ia/ingest', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    targetFolder: baseIaPath,
                                    filename: item.canonicalName,
                                    sourcePath: sourceFilePath,
                                    fileData: fileDataBase64
                                })
                            });
                        } catch(eRoot) {
                            console.error("Error al duplicar en raíz /IA/", eRoot);
                        }
                    }

                } else {
                    item.status = `❌ ${data ? data.error : 'Error'}`;
                }
            } else {
                const textErr = await res.text();
                item.status = `❌ Error ${res.status}`;
            }
        } catch (e) {
            item.status = `❌ ${e.message}`;
        }
        renderIaBatchTable();
    }

    // Persistir tokens personalizados si la casilla 'Save after queue' está marcada
    await saveCustomTokensIfRequested();

    showIaAlert(`✓ Procesamiento por lote completado.`, "#4caf50");
    updateIaResolution(); // Recalcular siguiente versión base
}

// --- 9. CHROME DOWNLOAD WATCHER CLIENT ---
let iaWatcherTimer = null;

async function toggleDownloadWatcher(active) {
    const statusEl = document.getElementById('iaWatcherStatus');
    const folderEl = document.getElementById('iaWatcherDetectedFolder');

    if (active) {
        try {
            const res = await fetch('/api/ia/start-download-watcher');
            const data = await res.json();
            if (data && data.success) {
                if (folderEl) folderEl.innerHTML = `📁 Ruta autodetectada: <b style="color:var(--accent);">${escapeHtml(data.folder)}</b>`;
                if (statusEl) statusEl.innerHTML = `<span style="color:#4caf50;">● Monitoreo de descargas ACTIVO</span>`;
                showIaAlert(`👁️ Captura automática activa en ${data.folder}`, "#4caf50");
                if (!iaWatcherTimer) {
                    iaWatcherTimer = setInterval(pollDownloadWatcher, 1500);
                }
            }
        } catch(e) {
            showIaAlert("❌ Error al activar monitoreo de descargas: " + e.message, "#f44336");
        }
    } else {
        try {
            await fetch('/api/ia/stop-download-watcher');
            if (statusEl) statusEl.innerHTML = `<span style="color:#888;">Monitoreo inactivo — Las descargas se listan en la cola</span>`;
            if (iaWatcherTimer) {
                clearInterval(iaWatcherTimer);
                iaWatcherTimer = null;
            }
            showIaAlert("Monitoreo de descargas inactivo", "#ff9800");
        } catch(e){}
    }
}

async function openChromeSettingsDownloads() {
    try {
        navigator.clipboard.writeText("chrome://settings/downloads");
        await fetch('/api/ia/open-chrome-settings');
        showIaAlert("⚙️ Dirección 'chrome://settings/downloads' copiada al portapapeles y lanzada en Chrome", "#4caf50");
    } catch(e) {
        showIaAlert("⚙️ Copiado 'chrome://settings/downloads' al portapapeles. Pégalo en tu navegador.", "#ffb74d");
    }
}

async function pollDownloadWatcher() {
    try {
        const res = await fetch('/api/ia/watcher-poll');
        const data = await res.json();
        if (data && data.files && data.files.length > 0) {
            data.files.forEach(f => {
                const initialSubfolder = document.getElementById('iaSubfolderSelect')?.value || 'root';
                const newItem = {
                    id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    file: null,
                    originalName: f.name,
                    originalPath: f.path,
                    ext: f.ext,
                    subfolder: initialSubfolder,
                    canonicalName: '',
                    targetFolder: '',
                    targetPath: '',
                    checked: true,
                    status: 'Pendiente'
                };
                iaBatchQueue.push(newItem);
                iaSelectedIds.clear();
                iaSelectedIds.add(newItem.id);
            });

            showIaAlert(`👁️ Capturada(s) ${data.files.length} nueva(s) descarga(s) en la cola`, "#4caf50");
            updateIaPreview();
        }
    } catch(e){}
}

function showIaAlert(msg, color) {
    const el = document.getElementById('iaStatusAlert');
    if (!el) return;
    el.innerText = msg;
    el.style.background = color + '22';
    el.style.color = color;
    el.style.border = `1px solid ${color}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 6000);
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

// --- 9. EVENT LISTENERS DE DRAG & DROP MULTI-ARCHIVO Y PEGAR (CTRL+V) ---
document.addEventListener('DOMContentLoaded', () => {
    loadCustomTokens();

    const dropZone = document.getElementById('iaDropZone');
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.style.borderColor = 'var(--accent)';
                dropZone.style.background = '#252525';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.style.borderColor = '#444';
                dropZone.style.background = '#111';
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                handleIaFileSelect({ files: files });
            } else {
                const url = dt.getData('text/uri-list') || dt.getData('text/plain');
                if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/'))) {
                    fetchWebOrDataUrlImage(url);
                }
            }
        }, false);
    }

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
});
