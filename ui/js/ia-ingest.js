// --- IA INGEST & BATCH NOMENCLATURE LOGIC (v0.9.02 Module) ---
let iaBatchQueue = [];
let iaSelectedIds = new Set();
let iaBaseVersionNum = 1;
let iaCurrentResolvedIaPath = '';

// --- HIGGSFIELD AI INTEGRATION STATE & HELPERS ---
window.hfOptions = {
    createLedger: localStorage.getItem('pipeta_hf_create_ledger') !== 'false',
    preserveOriginal: localStorage.getItem('pipeta_hf_preserve_original') !== 'false',
    downloadRefs: localStorage.getItem('pipeta_hf_download_refs') === 'true',
    forceWorker: localStorage.getItem('pipeta_hf_force_worker') === 'true'
};

let hfExecutor = window.hfOptions.forceWorker ? 'worker' : 'local';
const HF_JOB_UUID_REGEX = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
window.hfToolbarOpen = localStorage.getItem('pipeta_hf_toolbar_open_v2') === 'true';

function toggleHfToolbarSuite() {
    window.hfToolbarOpen = !(window.hfToolbarOpen === true);
    localStorage.setItem('pipeta_hf_toolbar_open_v2', window.hfToolbarOpen);
    const drawer = document.getElementById('hfToolbarDrawer');
    const btn = document.getElementById('hfToolbarToggleBtn');
    const arrow = document.getElementById('hfToolbarArrow');
    const group = document.getElementById('hfToolbarGroup');
    if (drawer) drawer.style.display = window.hfToolbarOpen ? 'flex' : 'none';
    if (btn) {
        if (window.hfToolbarOpen) {
            btn.classList.add('active');
            btn.style.background = 'rgba(198,255,0,0.18)';
            btn.style.borderColor = '#c6ff00';
            btn.style.color = '#c6ff00';
            btn.style.boxShadow = '0 0 10px rgba(198,255,0,0.3)';
        } else {
            btn.classList.remove('active');
            btn.style.background = '#222';
            btn.style.borderColor = '#444';
            btn.style.color = '#aaa';
            btn.style.boxShadow = 'none';
        }
    }
    if (arrow) arrow.innerText = window.hfToolbarOpen ? '◀' : '▶';
    if (group) {
        group.style.borderColor = window.hfToolbarOpen ? '#556b2f' : '#333';
        group.style.background = window.hfToolbarOpen ? 'rgba(20,25,18,0.7)' : 'rgba(20,20,20,0.5)';
    }
}

function updateIaHfToggleBtnUI() {
    const btn = document.getElementById('iaHfItemToggleBtn');
    if (!btn) return;
    if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('ia_ingest_allow_higgsfield')) {
        btn.style.display = 'none';
        return;
    }

    const activeItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id)) || (iaSelectedIds.size === 0 ? iaBatchQueue[0] : null);
    if (!activeItem) {
        btn.style.opacity = '0.5';
        btn.style.background = '#222';
        btn.style.borderColor = '#444';
        btn.style.color = '#888';
        btn.style.boxShadow = 'none';
        btn.title = 'Higgsfield AI: Selecciona un archivo para ver o forzar Higgsfield';
        return;
    }

    btn.style.opacity = '1';
    if (activeItem.isHiggsfield) {
        btn.style.background = 'rgba(198, 255, 0, 0.18)';
        btn.style.borderColor = '#c6ff00';
        btn.style.color = '#c6ff00';
        btn.style.boxShadow = '0 0 10px rgba(198, 255, 0, 0.35)';
        btn.title = `✓ Higgsfield AI DETECTADO/ACTIVO para este archivo (Job: ${activeItem.hfJobId || 'Custom'}). Clic para desactivar o re-vincular.`;
    } else {
        btn.style.background = '#222';
        btn.style.borderColor = '#444';
        btn.style.color = '#888';
        btn.style.boxShadow = 'none';
        btn.title = 'Higgsfield AI: Inactivo para este archivo. Clic para forzar interpretación Higgsfield.';
    }
}

async function toggleHiggsfieldOnSelectedItem() {
    if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('ia_ingest_allow_higgsfield')) {
        showIaAlert("🔒 Función de Higgsfield bloqueada por política de usuario", "#ff9800");
        return;
    }
    const targetItems = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : (iaBatchQueue.length > 0 ? [iaBatchQueue[0]] : []);

    if (targetItems.length === 0) {
        showIaAlert("⚠️ No hay ningún archivo en la cola", "#ff9800");
        return;
    }

    if (iaSelectedIds.size === 0 && targetItems.length > 0) {
        iaSelectedIds.add(targetItems[0].id);
    }

    for (const item of targetItems) {
        if (item.isHiggsfield) {
            item.isHiggsfield = false;
            item.hfJobId = null;
            item.higgsfieldData = null;
            item.motorChoice = 'auto';
            item.resChoice = 'auto';
            showIaAlert(`Modo Higgsfield desactivado para "${item.originalName}"`, "#ff9800");
        } else {
            let jobId = extractHfJobId(item.originalName) || extractHfJobId(item.originalPath) || extractHfJobId(item.sourceUrl);
            const directInputVal = document.getElementById('hfDirectInput')?.value.trim();
            if (!jobId && directInputVal) {
                jobId = extractHfJobId(directInputVal);
                if (jobId && !item.sourceUrl && directInputVal.startsWith('http')) {
                    item.sourceUrl = directInputVal;
                }
            }

            if (!jobId) {
                const entered = prompt(`Ingresa la URL de CloudFront o el Job ID de Higgsfield para:\n"${item.originalName}"`, directInputVal || "");
                if (entered) {
                    jobId = extractHfJobId(entered);
                    if (jobId && entered.startsWith('http')) {
                        item.sourceUrl = entered;
                    }
                }
            }

            item.isHiggsfield = true;
            item.motorChoice = 'auto_hf';
            item.resChoice = 'auto_hf';
            if (jobId) {
                item.hfJobId = jobId;
                showIaAlert(`⏳ Consultando Job ${jobId.substring(0, 8)} en Higgsfield...`, "#2196f3");
                await enrichItemWithHiggsfield(item, jobId);
            } else {
                item.motor = item.motor || 'SD25';
                showIaAlert(`⚡ Higgsfield forzado para "${item.originalName}"`, "#4caf50");
            }
        }
    }

    syncBuilderControlsWithSelection();
    updateIaPreview();
}

function saveHfOption(key, val) {
    if (!window.hfOptions) window.hfOptions = {};
    window.hfOptions[key] = val;
    const storageKey = 'pipeta_hf_' + key.replace(/([A-Z])/g, '_$1').toLowerCase();
    localStorage.setItem(storageKey, val);
    if (key === 'forceWorker') {
        hfExecutor = val ? 'worker' : 'local';
        updateHfForceWorkerUI();
    }
}

function toggleHfForceWorker() {
    const next = !window.hfOptions.forceWorker;
    saveHfOption('forceWorker', next);
    updateHfForceWorkerUI();
}

function updateHfForceWorkerUI() {
    const btn = document.getElementById('hfForceWorkerBtn');
    if (!btn) return;
    const isWorker = !!window.hfOptions.forceWorker;
    btn.innerText = 'Use worker';
    if (isWorker) {
        btn.classList.add('active');
        btn.style.background = '#ff9800';
        btn.style.borderColor = '#ff9800';
        btn.style.color = '#000';
        btn.style.fontWeight = 'bold';
        btn.title = 'Use worker: ACTIVO (Envía las descargas al Worker central de red). Clic para usar Pipeta Local.';
    } else {
        btn.classList.remove('active');
        btn.style.background = '#222';
        btn.style.borderColor = '#444';
        btn.style.color = '#aaa';
        btn.style.fontWeight = 'normal';
        btn.title = 'Use worker: APAGADO (Se procesa localmente en Pipeta). Clic para usar Worker de red.';
    }
}

function extractHfJobId(str) {
    if (!str || typeof str !== 'string') return null;
    const m = str.match(HF_JOB_UUID_REGEX);
    return m ? m[1].toLowerCase() : null;
}

async function fetchHiggsfieldJobMetadata(jobId) {
    const cleanId = extractHfJobId(jobId);
    if (!cleanId) throw new Error("ID de Job inválido");
    const res = await fetch(`/api/higgsfield/job/${cleanId}`);
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
    }
    return await res.json();
}

async function enrichItemWithHiggsfield(item, forceJobId = null) {
    const targetId = forceJobId || extractHfJobId(item.originalName) || extractHfJobId(item.originalPath) || extractHfJobId(item.sourceUrl);
    if (!targetId) return false;

    item.isHiggsfield = true;
    item.hfJobId = targetId;
    item.isFetchingHf = true;
    renderIaBatchTable();

    try {
        const data = await fetchHiggsfieldJobMetadata(targetId);
        item.isFetchingHf = false;
        item.higgsfieldData = data;
        
        // Mapear automáticamente los tokens oficiales
        if (data.motorCanonical) {
            item.motorChoice = 'auto_hf';
            item.motor = data.motorCanonical;
        }
        if (data.resCanonical) {
            item.resChoice = 'auto_hf';
            item.autoResTag = data.resCanonical;
        }
        if (data.framingCanonical) {
            item.framingChoice = data.framingCanonical;
            item.framing = data.framingCanonical;
        } else {
            item.framingChoice = 'FLL';
            item.framing = 'FLL';
        }
        if (data.roleCanonical) {
            item.tagCChoice = data.roleCanonical;
            item.hfRole = data.roleCanonical;
        }
        if (data.prompt) {
            item.hfPrompt = data.prompt;
        }
        if (data.resultUrl) {
            if (!item.file || !item.sourceUrl) {
                item.sourceUrl = data.resultUrl;
            }
        }
        if (data.thumbnailUrl) {
            item.thumbnailUrl = data.thumbnailUrl;
        }

        syncBuilderControlsWithSelection();
        updateIaPreview();
        renderIaBatchTable();
        return true;
    } catch (err) {
        item.isFetchingHf = false;
        console.warn(`[HIGGSFIELD] Error consultando job ${targetId}:`, err.message);
        renderIaBatchTable();
        return false;
    }
}

async function handleHfDirectLoad(inputVal = null) {
    const inputEl = document.getElementById('hfDirectInput');
    const raw = (inputVal || inputEl?.value || '').trim();
    if (!raw) {
        showIaAlert("⚠️ Ingresa una URL de CloudFront o el Job ID de Higgsfield", "#ff9800");
        return;
    }

    const jobId = extractHfJobId(raw);
    if (!jobId) {
        showIaAlert("⚠️ No se detectó un UUID de Job válido en el texto ingresado", "#ff9800");
        return;
    }

    showIaAlert(`⏳ Consultando Job ${jobId.substring(0, 8)} en Higgsfield...`, "#2196f3");
    try {
        const data = await fetchHiggsfieldJobMetadata(jobId);
        let downloadUrl = data.resultUrl;
        if (!downloadUrl && raw.startsWith('http')) {
            downloadUrl = raw;
        }

        let originalName = downloadUrl ? downloadUrl.split('?')[0].split('/').pop() : `hf_${jobId}.mp4`;
        const extIndex = originalName.lastIndexOf('.');
        const ext = extIndex !== -1 ? originalName.substring(extIndex) : '.mp4';

        const newItem = {
            id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            file: null,
            sourceUrl: downloadUrl,
            originalName: originalName,
            originalPath: downloadUrl || `[Higgsfield Job: ${jobId}]`,
            ext: ext,
            subfolder: 'root',
            motorChoice: 'auto_hf',
            motor: data.motorCanonical || 'SD25',
            resChoice: 'auto_hf',
            autoResTag: data.resCanonical || 'FHD',
            hfRole: data.roleCanonical || 'v2v',
            hfPrompt: data.prompt || '',
            thumbnailUrl: data.thumbnailUrl || null,
            isHiggsfield: true,
            hfJobId: jobId,
            higgsfieldData: data,
            canonicalName: '',
            targetFolder: '',
            targetPath: '',
            checked: true,
            status: 'Pendiente'
        };

        iaSelectedIds.clear();
        iaBatchQueue.push(newItem);
        iaSelectedIds.add(newItem.id);

        if (inputEl) inputEl.value = '';
        document.getElementById('iaFileNameDisplay').innerText = `${iaBatchQueue.length} archivo(s) en lista`;
        showIaAlert(`✓ Job ${jobId.substring(0, 8)} cargado (${data.motorCanonical}, ${data.resCanonical}, ${data.roleCanonical})`, "#4caf50");
        renderIaBatchTable();
        syncBuilderControlsWithSelection();
        updateIaPreview();
    } catch (err) {
        showIaAlert(`❌ Error al consultar Higgsfield: ${err.message}`, "#f44336");
    }
}

async function handleForceHiggsfieldOnSelected() {
    if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('ia_ingest_allow_higgsfield')) {
        showIaAlert("🔒 Función de Higgsfield bloqueada por política de usuario", "#ff9800");
        return;
    }
    const selectedItems = iaBatchQueue.filter(i => iaSelectedIds.has(i.id));
    const itemsToProcess = selectedItems.length > 0 ? selectedItems : (iaBatchQueue.length === 1 ? [iaBatchQueue[0]] : []);
    const directInputVal = (document.getElementById('hfDirectInput')?.value || '').trim();

    if (itemsToProcess.length === 0) {
        if (directInputVal) {
            return handleHfDirectLoad(directInputVal);
        }
        showIaAlert("⚠️ Selecciona un archivo en la cola o ingresa la URL en 'Higgsfield media URL'", "#ff9800");
        return;
    }

    for (const item of itemsToProcess) {
        let jobId = extractHfJobId(item.originalName) || extractHfJobId(item.originalPath) || extractHfJobId(item.sourceUrl);

        if (!jobId && directInputVal) {
            jobId = extractHfJobId(directInputVal);
            if (jobId && !item.sourceUrl && directInputVal.startsWith('http')) {
                item.sourceUrl = directInputVal;
            }
        }

        if (!jobId) {
            const entered = prompt(`Ingresa la URL de Higgsfield o el Job ID (UUID) para forzar:\n"${item.originalName}"`, directInputVal || "");
            if (!entered) continue;
            jobId = extractHfJobId(entered);
            if (jobId && entered.startsWith('http')) {
                item.sourceUrl = entered;
            }
            if (!jobId) {
                alert("El texto ingresado no contiene un UUID de Job válido.");
                continue;
            }
        }

        showIaAlert(`⏳ Consultando Job ${jobId.substring(0, 8)} en Higgsfield...`, "#2196f3");
        const success = await enrichItemWithHiggsfield(item, jobId);
        if (success) {
            item.isHiggsfield = true;
            item.motorChoice = 'auto_hf';
            item.resChoice = 'auto_hf';
            syncBuilderControlsWithSelection();
            showIaAlert(`✓ Higgsfield forzado para "${item.originalName}" (${item.motor}, ${item.autoResTag}, ${item.hfRole || 'v2v'})`, "#4caf50");
        } else {
            showIaAlert(`❌ No se pudo vincular Higgsfield a "${item.originalName}"`, "#f44336");
        }
    }
}

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

// --- 1. GESTIÓN DE CONTEXTO DE SHOT (EXPLORADOR GUIADO / MANUAL) ---
let iaContextMode = 'guided'; // 'guided' | 'manual'
let iaOnlyMyTasks = localStorage.getItem('pipeta_ia_only_my_tasks') === 'true';
let iaIsVsubs = false;
let iaForceSmb = localStorage.getItem('pipeta_ia_force_smb') === 'true';
let iaHierarchy = {
    episodes: [],
    scenes: [],
    shots: []
};
let iaSelectedEp = '';
let iaSelectedSeq = '';
let iaSelectedShot = '';

async function checkIaDriveType() {
    try {
        const res = await fetch('/api/ia/drive-info');
        const data = await res.json();
        iaIsVsubs = !!data.isVsubs;
        const btn = document.getElementById('iaForceSmbBtn');
        if (btn) {
            if (iaIsVsubs) {
                btn.style.display = 'inline-flex';
                updateIaForceSmbBtnUI();
            } else {
                btn.style.display = 'none';
                iaForceSmb = false;
            }
        }
    } catch(e) {
        iaIsVsubs = false;
    }
}

function toggleIaForceSmb() {
    iaForceSmb = !iaForceSmb;
    try { localStorage.setItem('pipeta_ia_force_smb', iaForceSmb); } catch(e){}
    updateIaForceSmbBtnUI();
    refreshIaHierarchy();
}

function updateIaForceSmbBtnUI() {
    const btn = document.getElementById('iaForceSmbBtn');
    if (!btn) return;
    if (iaForceSmb && iaIsVsubs) {
        btn.style.background = 'rgba(0, 229, 255, 0.25)';
        btn.style.borderColor = 'var(--accent)';
        btn.style.color = 'var(--accent)';
        btn.style.fontWeight = 'bold';
        btn.title = 'Shots de Red (SMB): ACTIVO (Buscando desde Servidor Central / Catálogo de Red)';
    } else {
        btn.style.background = '#222';
        btn.style.borderColor = '#444';
        btn.style.color = '#aaa';
        btn.style.fontWeight = 'normal';
        btn.title = 'Shots de Red (SMB): INACTIVO (Buscando solo en tu Z: local)';
    }
}

function updateIaMyTasksButtonUI() {
    const btn = document.getElementById('iaMyTasksFilterBtn');
    if (!btn) return;
    const img = btn.querySelector('img');
    if (iaOnlyMyTasks) {
        btn.style.background = 'rgba(0,188,212,0.25)';
        btn.style.borderColor = '#00bcd4';
        btn.title = 'Mis Tareas en Ramón: ACTIVO (Solo muestra tus shots asignados | Clic para ver todos)';
        if (img) {
            img.style.opacity = '1';
            img.style.filter = 'none';
        }
    } else {
        btn.style.background = 'transparent';
        btn.style.borderColor = '#444';
        btn.title = 'Mis Tareas en Ramón: INACTIVO (Clic para filtrar solo tus shots asignados)';
        if (img) {
            img.style.opacity = '0.4';
            img.style.filter = 'grayscale(100%)';
        }
    }
}

function getIaAssignedShots() {
    const tasks = (typeof Ramon !== 'undefined' && Array.isArray(Ramon.tasks)) ? Ramon.tasks : [];
    const assignedShots = [];

    for (const t of tasks) {
        const matchesProject = typeof window.isRamonTaskInCurrentProject === 'function'
            ? window.isRamonTaskInCurrentProject(t)
            : true;

        if (matchesProject) {
            const it = (t.item_type || '').toLowerCase();
            const st = (t.search_type || '').toLowerCase();
            const nm = (t.name || '').trim();
            const cd = (t.code || '').trim();
            const sc = (t.search_code || '').trim();
            if (it.includes('plano') || it.includes('shot') || st.includes('plano') || /_b\d+_/i.test(nm) || /b\d+/i.test(nm) || /_b\d+_/i.test(cd) || /b\d+/i.test(cd)) {
                if (nm) assignedShots.push(nm);
                if (cd) assignedShots.push(cd);
                if (sc) assignedShots.push(sc);
            }
        }
    }

    if (assignedShots.length === 0 && typeof window.getExplorerAssignedTaskNames === 'function') {
        const names = Array.from(window.getExplorerAssignedTaskNames());
        for (const n of names) {
            if (/_b\d+_/i.test(n) || /b\d+/i.test(n) || n.toLowerCase().startsWith('shot') || n.includes('_')) {
                assignedShots.push(n);
            }
        }
    }

    return Array.from(new Set(assignedShots));
}

function iaTaskMatchesEpisode(sh, ep) {
    if (!sh || !ep) return false;
    const s = sh.toLowerCase().trim();
    const e = ep.toLowerCase().trim();
    if (s === e) return true;
    const tokens = s.split(/[^a-z0-9]+/);
    if (tokens.includes(e)) return true;
    const numE = e.replace(/^[a-z]+/i, '');
    if (numE && tokens.includes(numE)) return true;
    if (s.includes('_' + e + '_') || s.startsWith(e + '_') || s.endsWith('_' + e)) return true;
    if (s.includes(e)) return true;
    return false;
}

function iaTaskMatchesSequence(sh, ep, seq) {
    if (!sh || !seq) return false;
    const s = sh.toLowerCase().trim();
    const sq = seq.toLowerCase().trim();
    let matchesSeq = false;
    const tokens = s.split(/[^a-z0-9]+/);
    if (tokens.includes(sq)) matchesSeq = true;
    else if (s.includes('_' + sq + '_') || s.startsWith(sq + '_') || s.endsWith('_' + sq)) matchesSeq = true;
    else if (s.includes(sq)) matchesSeq = true;
    else {
        const numSq = sq.replace(/^[a-z]+/i, '');
        if (numSq && tokens.includes(numSq)) matchesSeq = true;
    }
    if (!matchesSeq) return false;

    if (ep) {
        return iaTaskMatchesEpisode(sh, ep);
    }
    return true;
}

function iaTaskMatchesShot(sh, ep, seq, shotName) {
    if (!sh || !shotName) return false;
    const s = sh.toLowerCase().trim();
    const sn = shotName.toLowerCase().trim();
    if (s === sn) return true;
    if (s.includes(sn) || sn.includes(s)) return true;
    const tokensS = s.split(/[^a-z0-9]+/);
    const tokensSn = sn.split(/[^a-z0-9]+/);
    const lastS = tokensS[tokensS.length - 1];
    const lastSn = tokensSn[tokensSn.length - 1];
    if (lastS && lastSn && lastS === lastSn) {
        if (seq && !iaTaskMatchesSequence(sh, ep, seq)) return false;
        return true;
    }
    return false;
}

function toggleIaOnlyMyTasks() {
    iaOnlyMyTasks = !iaOnlyMyTasks;
    try {
        localStorage.setItem('pipeta_ia_only_my_tasks', iaOnlyMyTasks ? 'true' : 'false');
    } catch(e) {}

    updateIaMyTasksButtonUI();
    refreshIaHierarchy();

    if (iaOnlyMyTasks) {
        const myShots = getIaAssignedShots();
        if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
            if (myShots.length > 0) {
                settings.showToast(`IA Ingest: Filtrando ${myShots.length} shots asignados en Ramón`, 'success', 2);
            } else {
                settings.showToast('IA Ingest: Sin tareas de planos asignadas en este proyecto', 'warning', 3);
            }
        }

        let currentProj = '';
        if (typeof settings !== 'undefined' && settings.currentProject) {
            currentProj = settings.currentProject.code || settings.currentProject.projectCode || settings.currentProject.name || '';
        }
        if (typeof Ramon !== 'undefined' && Ramon.session?.user && typeof Ramon.fetchTasks === 'function') {
            Ramon.fetchTasks(currentProj || null, false).then(() => {
                if (iaOnlyMyTasks) refreshIaHierarchy();
            }).catch(() => {});
        }
    } else {
        if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
            settings.showToast('IA Ingest: Mostrando todos los shots del proyecto', 'info', 1.5);
        }
    }
}

function setIaContextMode(mode) {
    iaContextMode = mode;
    const guidedBox = document.getElementById('iaGuidedContextBox');
    const manualBox = document.getElementById('iaManualContextBox');
    const guidedBtn = document.getElementById('iaModeGuidedBtn');
    const manualBtn = document.getElementById('iaModeManualBtn');

    if (mode === 'guided') {
        if (guidedBox) guidedBox.style.display = 'flex';
        if (manualBox) manualBox.style.display = 'none';
        if (guidedBtn) { guidedBtn.style.background = 'var(--accent)'; guidedBtn.style.color = 'black'; }
        if (manualBtn) { manualBtn.style.background = '#333'; manualBtn.style.color = '#aaa'; }
        if (!iaHierarchy.episodes || iaHierarchy.episodes.length === 0) {
            refreshIaHierarchy();
        } else {
            const shotSelect = document.getElementById('iaShotSelect');
            if (shotSelect && shotSelect.value) {
                handleIaShotChange(shotSelect.value);
            }
        }
    } else {
        if (guidedBox) guidedBox.style.display = 'none';
        if (manualBox) manualBox.style.display = 'block';
        if (guidedBtn) { guidedBtn.style.background = '#333'; guidedBtn.style.color = '#aaa'; }
        if (manualBtn) { manualBtn.style.background = 'var(--accent)'; manualBtn.style.color = 'black'; }
        updateIaResolution();
    }
}

function getIaProjectRoots() {
    let proj = (typeof settings !== 'undefined' && settings.currentProject) ? settings.currentProject : null;
    if (!proj && typeof settings !== 'undefined' && settings.projects && settings.projects.length > 0) {
        const activeId = localStorage.getItem('pipeta_active_project_id');
        proj = settings.projects.find(p => p.id === activeId) || settings.projects[0];
        if (proj && typeof settings !== 'undefined') settings.currentProject = proj;
    }
    const workRoot = proj?.roots?.work ? proj.roots.work.replace(/\\/g, '/') : "Z:/atresmedia/surf_love";
    const mediaRoot = proj?.roots?.media ? proj.roots.media.replace(/\\/g, '/') : "Z:/INTERNO/MEDIA/atresmedia/surf_love";
    return { workRoot, mediaRoot, project: proj };
}

function getEffectiveIaPresets() {
    let proj = (typeof settings !== 'undefined' && settings.currentProject) ? settings.currentProject : null;
    let baseProj = (typeof settings !== 'undefined' && typeof settings.getBaseProject === 'function') 
        ? settings.getBaseProject() 
        : null;

    const canonFallback = {
        defaultImageEngine: "NB2P",
        defaultVideoEngine: "SD2",
        defaultFraming: "FLL",
        defaultTagRoleA: "start1001",
        defaultTagRoleB: "inp",
        defaultTagRoleC: "i2v",
        motorsVideo: ["SD2", "SD25", "VEO3", "VO31", "GOMN", "HFMC"],
        motorsImage: ["NB2P", "NBN2", "NBN21", "MJ", "FLUX", "GPT25S", "GPT25F"],
        framings: ["FLL", "CRP"],
        tagsA: ["start1001", "end1100", "f1001", "ref", "ref1050"],
        tagsB: ["inp", "ups", "mask", "clean", "elem"],
        tagsC: ["i2v", "t2i", "i2i", "t2v", "v2v", "m2v"],
        resolutionTranslations: [
            { detected: "1920x1080", tag: "FHD" },
            { detected: "3840x2160", tag: "UHD" },
            { detected: "1080x1920", tag: "916" },
            { detected: "1080x1080", tag: "SQ1K" },
            { detected: "2560x1080", tag: "UW2K" },
            { detected: "1280x720", tag: "HD" }
        ]
    };

    const baseIa = baseProj?.iaPresets || canonFallback;
    const isBase = proj?.id === 'proj_base' || proj?.isBase;
    const hasOverride = isBase || proj?.overrideBasePresets === true;
    
    if (hasOverride && proj?.iaPresets) {
        return {
            defaultImageEngine: proj.iaPresets.defaultImageEngine || baseIa.defaultImageEngine || "NB2P",
            defaultVideoEngine: proj.iaPresets.defaultVideoEngine || baseIa.defaultVideoEngine || "SD2",
            defaultFraming: proj.iaPresets.defaultFraming || baseIa.defaultFraming || "FLL",
            defaultTagRoleA: typeof proj.iaPresets.defaultTagRoleA !== 'undefined' ? proj.iaPresets.defaultTagRoleA : baseIa.defaultTagRoleA,
            defaultTagRoleB: typeof proj.iaPresets.defaultTagRoleB !== 'undefined' ? proj.iaPresets.defaultTagRoleB : baseIa.defaultTagRoleB,
            defaultTagRoleC: typeof proj.iaPresets.defaultTagRoleC !== 'undefined' ? proj.iaPresets.defaultTagRoleC : baseIa.defaultTagRoleC,
            motorsVideo: Array.isArray(proj.iaPresets.motorsVideo) && proj.iaPresets.motorsVideo.length > 0 ? proj.iaPresets.motorsVideo : (baseIa.motorsVideo || ["SD2", "SD25", "VEO3", "VO31", "GOMN", "HFMC"]),
            motorsImage: Array.isArray(proj.iaPresets.motorsImage) && proj.iaPresets.motorsImage.length > 0 ? proj.iaPresets.motorsImage : (baseIa.motorsImage || ["NB2P", "NBN2", "NBN21", "MJ", "FLUX", "GPT25S", "GPT25F"]),
            framings: Array.isArray(proj.iaPresets.framings) && proj.iaPresets.framings.length > 0 ? proj.iaPresets.framings : baseIa.framings,
            tagsA: Array.isArray(proj.iaPresets.tagsA) && proj.iaPresets.tagsA.length > 0 ? proj.iaPresets.tagsA : baseIa.tagsA,
            tagsB: Array.isArray(proj.iaPresets.tagsB) && proj.iaPresets.tagsB.length > 0 ? proj.iaPresets.tagsB : baseIa.tagsB,
            tagsC: Array.isArray(proj.iaPresets.tagsC) && proj.iaPresets.tagsC.length > 0 ? proj.iaPresets.tagsC : baseIa.tagsC,
            resolutionTranslations: Array.isArray(proj.iaPresets.resolutionTranslations) && proj.iaPresets.resolutionTranslations.length > 0 ? proj.iaPresets.resolutionTranslations : baseIa.resolutionTranslations
        };
    }

    return {
        defaultImageEngine: baseIa.defaultImageEngine || "NB2P",
        defaultVideoEngine: baseIa.defaultVideoEngine || "SD2",
        defaultFraming: baseIa.defaultFraming || "FLL",
        defaultTagRoleA: typeof baseIa.defaultTagRoleA !== 'undefined' ? baseIa.defaultTagRoleA : "start1001",
        defaultTagRoleB: typeof baseIa.defaultTagRoleB !== 'undefined' ? baseIa.defaultTagRoleB : "inp",
        defaultTagRoleC: typeof baseIa.defaultTagRoleC !== 'undefined' ? baseIa.defaultTagRoleC : "i2v",
        motorsVideo: baseIa.motorsVideo || ["SD2", "SD25", "VEO3", "VO31", "GOMN", "HFMC"],
        motorsImage: baseIa.motorsImage || ["NB2P", "NBN2", "NBN21", "MJ", "FLUX", "GPT25S", "GPT25F"],
        framings: baseIa.framings || ["FLL", "CRP"],
        tagsA: baseIa.tagsA || ["start1001", "end1100", "f1001", "ref", "ref1050"],
        tagsB: baseIa.tagsB || ["inp", "ups", "mask", "clean", "elem"],
        tagsC: baseIa.tagsC || ["i2v", "t2i", "i2i", "t2v", "v2v", "m2v"],
        resolutionTranslations: baseIa.resolutionTranslations || canonFallback.resolutionTranslations
    };
}

function populateIaTokenSelectsFromProject(forceDefaults = true) {
    const effective = getEffectiveIaPresets();
    const isSimple = window.iaWorkMode === 'simple';

    // 1. Motor Select (Agrupado en Video e Imagen, sin emojis, nombres canónicos limpios)
    const motorSel = document.getElementById('tokMotorSelect');
    if (motorSel) {
        const curVal = motorSel.value;
        const vList = effective.motorsVideo || [];
        const iList = effective.motorsImage || [];

        let html = '';
        html += `<option value="auto">Auto</option>`;
        const canHf = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('ia_ingest_allow_higgsfield') : true;
        if (canHf) {
            html += `<option value="auto_hf">Higgsfield (metadata)</option>`;
        }
        html += `<option disabled>──────────</option>`;
        if (vList.length > 0) {
            html += `<optgroup label="Motores de Video">` + vList.map(m => `<option value="${m}">${m}</option>`).join('') + `</optgroup>`;
        }
        if (iList.length > 0) {
            html += `<optgroup label="Motores de Imagen">` + iList.map(m => `<option value="${m}">${m}</option>`).join('') + `</optgroup>`;
        }
        if (!isSimple) {
            html += `<option disabled>──────────</option>`;
            html += `<option value="custom">Manual</option>`;
        }
        motorSel.innerHTML = html;

        const allMotors = [...vList, ...iList, 'auto', 'auto_hf'];
        if (!forceDefaults && curVal && (allMotors.includes(curVal) || (!isSimple && curVal === 'custom'))) {
            motorSel.value = curVal;
        } else {
            motorSel.value = 'auto';
        }
    }

    // 1b. Resolución Select (Manual solo en modo Avanzado)
    const resSel = document.getElementById('tokResSelect');
    if (resSel) {
        const curRes = resSel.value;
        const standardResolutions = [
            { val: "FHD", label: "FHD (1920x1080)" },
            { val: "UHD", label: "UHD (3840x2160)" },
            { val: "HD", label: "HD (1280x720)" },
            { val: "SQ1K", label: "SQ1K (1024x1024)" },
            { val: "UW2K", label: "UW2K (2560x1080)" },
            { val: "1344x768", label: "1344x768" },
            { val: "1536x864", label: "1536x864" },
            { val: "2206x946", label: "2206x946" }
        ];
        let rHtml = '<option value="auto">Auto</option><option value="auto_hf">Higgsfield (metadata)</option><option disabled>──────────</option>';
        rHtml += standardResolutions.map(r => `<option value="${r.val}">${r.label}</option>`).join('');
        if (!isSimple) {
            rHtml += '<option disabled>──────────</option><option value="custom">Manual</option>';
        }
        resSel.innerHTML = rHtml;
        const validRes = ['auto', 'auto_hf', ...standardResolutions.map(r => r.val)];
        if (!forceDefaults && curRes && (validRes.includes(curRes) || (!isSimple && curRes === 'custom'))) {
            resSel.value = curRes;
        } else {
            resSel.value = 'auto';
        }
    }

    // 2. Framing Select (Sin emojis, manual solo en modo Avanzado)
    const framingSel = document.getElementById('tokFramingSelect');
    if (framingSel) {
        const curVal = framingSel.value;
        const list = effective.framings || ["FLL", "CRP"];
        let html = list.map(f => `<option value="${f}">${f}</option>`).join('');
        if (!isSimple) {
            html += `<option disabled>──────────</option><option value="custom">Manual</option>`;
        }
        framingSel.innerHTML = html;
        if (!forceDefaults && curVal && (list.includes(curVal) || (!isSimple && curVal === 'custom'))) {
            framingSel.value = curVal;
        } else if (effective.defaultFraming && list.includes(effective.defaultFraming)) {
            framingSel.value = effective.defaultFraming;
        } else if (list.length > 0) {
            framingSel.value = list[0];
        }
    }

    // 3. Tag Level A (Sin emojis, sin opción 'ninguno', manual permitido en Simple y Avanzado)
    const tagASel = document.getElementById('tokTagALevel');
    if (tagASel) {
        const curVal = tagASel.value;
        const list = effective.tagsA || ["ref", "start1001", "end1100", "f1001", "ref1050"];
        tagASel.innerHTML = list.map(t => `<option value="${t}">${t}</option>`).join('') +
            `<option disabled>──────────</option><option value="custom">Manual</option>`;
        
        const targetA = (typeof effective.defaultTagRoleA !== 'undefined') ? effective.defaultTagRoleA : 'ref';
        if (!forceDefaults && curVal !== undefined && (list.includes(curVal) || curVal === 'custom')) {
            tagASel.value = curVal;
        } else if (targetA && list.includes(targetA)) {
            tagASel.value = targetA;
        } else if (list.length > 0) {
            tagASel.value = list[0];
        }
    }

    // 4. Tag Level B (Sin emojis, sin opción 'ninguno', manual solo en modo Avanzado)
    const tagBSel = document.getElementById('tokTagBLevel');
    if (tagBSel) {
        const curVal = tagBSel.value;
        const list = effective.tagsB || ["inp", "ups", "mask", "clean", "elem"];
        let html = list.map(t => `<option value="${t}">${t}</option>`).join('');
        if (!isSimple) {
            html += `<option disabled>──────────</option><option value="custom">Manual</option>`;
        }
        tagBSel.innerHTML = html;
        
        const targetB = (typeof effective.defaultTagRoleB !== 'undefined') ? effective.defaultTagRoleB : 'inp';
        if (!forceDefaults && curVal !== undefined && (list.includes(curVal) || (!isSimple && curVal === 'custom'))) {
            tagBSel.value = curVal;
        } else if (targetB && list.includes(targetB)) {
            tagBSel.value = targetB;
        } else if (list.length > 0) {
            tagBSel.value = list[0];
        }
    }

    // 5. Tag Level C (Sin emojis, sin opción 'ninguno', manual solo en modo Avanzado)
    const tagCSel = document.getElementById('tokTagCLevel');
    if (tagCSel) {
        const curVal = tagCSel.value;
        const list = effective.tagsC || ["i2v", "t2i", "i2i", "t2v", "v2v", "m2v"];
        let html = list.map(t => `<option value="${t}">${t}</option>`).join('');
        if (!isSimple) {
            html += `<option disabled>──────────</option><option value="custom">Manual</option>`;
        }
        tagCSel.innerHTML = html;
        
        const targetC = (typeof effective.defaultTagRoleC !== 'undefined') ? effective.defaultTagRoleC : 'i2v';
        if (!forceDefaults && curVal !== undefined && (list.includes(curVal) || (!isSimple && curVal === 'custom'))) {
            tagCSel.value = curVal;
        } else if (targetC && list.includes(targetC)) {
            tagCSel.value = targetC;
        } else if (list.length > 0) {
            tagCSel.value = list[0];
        }
    }
}

async function refreshIaHierarchy() {
    updateIaMyTasksButtonUI();
    updateIaForceSmbBtnUI();
    populateIaTokenSelectsFromProject();
    const { workRoot, mediaRoot, project } = getIaProjectRoots();
    const epSelect = document.getElementById('iaEpSelect');
    const seqSelect = document.getElementById('iaSeqSelect');
    const shotSelect = document.getElementById('iaShotSelect');

    if (!epSelect) return;

    epSelect.innerHTML = '<option value="">Cargando episodios...</option>';
    if (seqSelect) { seqSelect.innerHTML = '<option value="">-- Escena --</option>'; seqSelect.disabled = true; }
    if (shotSelect) { shotSelect.innerHTML = '<option value="">-- Shot --</option>'; shotSelect.disabled = true; }

    try {
        let rawEpisodes = [];
        if (iaIsVsubs && iaForceSmb) {
            const pName = project?.name || 'surf_love';
            const catRes = await fetch(`/api/ia/catalog-hierarchy?project=${encodeURIComponent(pName)}&type=episodes`);
            const catData = await catRes.json();
            if (catData && catData.items && Array.isArray(catData.items)) {
                rawEpisodes = catData.items;
            }
        }
        if (rawEpisodes.length === 0) {
            let epDir = workRoot + '/episodios';
            let dirData = await API.fetchDir(epDir);
            if (dirData && dirData.items && !dirData.error && dirData.exists !== false) {
                rawEpisodes = dirData.items.filter(i => i.isDirectory && !i.name.startsWith('.') && !i.name.startsWith('_')).map(i => i.name);
            }
        }

        if (iaOnlyMyTasks) {
            const myShots = getIaAssignedShots();
            if (myShots.length === 0) {
                iaHierarchy.episodes = [];
                epSelect.innerHTML = '<option value="">(Sin episodios con tareas asignadas)</option>';
                return;
            }
            iaHierarchy.episodes = rawEpisodes.filter(ep => myShots.some(sh => iaTaskMatchesEpisode(sh, ep)));
        } else {
            iaHierarchy.episodes = rawEpisodes;
        }

        if (iaHierarchy.episodes.length > 0) {
            // Si no hay episodio seleccionado o el previo no existe en la lista filtrada, tomar el primero
            if (!iaSelectedEp || !iaHierarchy.episodes.includes(iaSelectedEp)) {
                iaSelectedEp = iaHierarchy.episodes[0];
            }

            epSelect.innerHTML = '<option value="">-- Seleccionar Episodio --</option>' +
                iaHierarchy.episodes.map(e => `<option value="${e}" ${e === iaSelectedEp ? 'selected' : ''}>${e}</option>`).join('');
            
            if (iaSelectedEp) {
                await handleIaEpChange(iaSelectedEp);
            }
        } else {
            epSelect.innerHTML = iaOnlyMyTasks 
                ? '<option value="">(Sin episodios con tareas asignadas)</option>'
                : '<option value="">(No se encontraron episodios)</option>';
        }
    } catch(e) {
        console.error("Error refreshing IA hierarchy:", e);
        epSelect.innerHTML = '<option value="">(Error al leer episodios)</option>';
    }
}

async function handleIaEpChange(ep) {
    iaSelectedEp = ep;
    const { workRoot, project } = getIaProjectRoots();
    const seqSelect = document.getElementById('iaSeqSelect');
    const shotSelect = document.getElementById('iaShotSelect');

    if (!seqSelect) return;
    seqSelect.innerHTML = '<option value="">Cargando escenas...</option>';
    seqSelect.disabled = true;
    if (shotSelect) { shotSelect.innerHTML = '<option value="">-- Shot --</option>'; shotSelect.disabled = true; }

    if (!ep) {
        seqSelect.innerHTML = '<option value="">-- Escena --</option>';
        return;
    }

    try {
        let rawScenes = [];
        if (iaIsVsubs && iaForceSmb) {
            const pName = project?.name || 'surf_love';
            const catRes = await fetch(`/api/ia/catalog-hierarchy?project=${encodeURIComponent(pName)}&type=scenes&ep=${encodeURIComponent(ep)}`);
            const catData = await catRes.json();
            if (catData && catData.items && Array.isArray(catData.items)) {
                rawScenes = catData.items;
            }
        }
        if (rawScenes.length === 0) {
            let seqDir = `${workRoot}/episodios/${ep}/secuencias`;
            let dirData = await API.fetchDir(seqDir);
            if (dirData && dirData.items && !dirData.error && dirData.exists !== false) {
                rawScenes = dirData.items.filter(i => i.isDirectory && !i.name.startsWith('.') && !i.name.startsWith('_')).map(i => i.name);
            }
        }

        if (iaOnlyMyTasks) {
            const myShots = getIaAssignedShots();
            iaHierarchy.scenes = rawScenes.filter(seq => myShots.some(sh => iaTaskMatchesSequence(sh, ep, seq)));
        } else {
            iaHierarchy.scenes = rawScenes;
        }

        if (iaHierarchy.scenes.length > 0) {
            if (!iaSelectedSeq || !iaHierarchy.scenes.includes(iaSelectedSeq)) {
                iaSelectedSeq = iaHierarchy.scenes[0];
            }

            seqSelect.innerHTML = '<option value="">-- Seleccionar Escena --</option>' +
                iaHierarchy.scenes.map(s => `<option value="${s}" ${s === iaSelectedSeq ? 'selected' : ''}>${s}</option>`).join('');
            seqSelect.disabled = false;

            if (iaSelectedSeq) {
                await handleIaSeqChange(iaSelectedSeq);
            }
        } else {
            seqSelect.innerHTML = iaOnlyMyTasks
                ? '<option value="">(Sin escenas con tareas)</option>'
                : '<option value="">(Sin escenas)</option>';
        }
    } catch(e) {
        console.error("Error loading scenes for IA:", e);
        seqSelect.innerHTML = '<option value="">(Error al leer escenas)</option>';
    }
}

async function handleIaSeqChange(seq) {
    iaSelectedSeq = seq;
    const { workRoot, project } = getIaProjectRoots();
    const shotSelect = document.getElementById('iaShotSelect');

    if (!shotSelect) return;
    shotSelect.innerHTML = '<option value="">Cargando shots...</option>';
    shotSelect.disabled = true;

    if (!seq || !iaSelectedEp) {
        shotSelect.innerHTML = '<option value="">-- Shot --</option>';
        return;
    }

    try {
        let rawShots = [];
        if (iaIsVsubs && iaForceSmb) {
            const pName = project?.name || 'surf_love';
            const catRes = await fetch(`/api/ia/catalog-hierarchy?project=${encodeURIComponent(pName)}&type=shots&ep=${encodeURIComponent(iaSelectedEp)}&seq=${encodeURIComponent(seq)}`);
            const catData = await catRes.json();
            if (catData && catData.items && Array.isArray(catData.items)) {
                rawShots = catData.items;
            }
        }
        if (rawShots.length === 0) {
            let shotDir = `${workRoot}/episodios/${iaSelectedEp}/secuencias/${seq}/shots`;
            let dirData = await API.fetchDir(shotDir);
            if (dirData.error || !dirData.items || dirData.items.length === 0) {
                shotDir = `${workRoot}/episodios/${iaSelectedEp}/secuencias/${seq}`;
                dirData = await API.fetchDir(shotDir);
            }
            if (dirData && dirData.items) {
                rawShots = dirData.items.filter(i => i.isDirectory && !i.name.startsWith('.') && !i.name.startsWith('_')).map(i => i.name);
            }
        }

        if (iaOnlyMyTasks) {
            const myShots = getIaAssignedShots();
            iaHierarchy.shots = rawShots.filter(shName => myShots.some(sh => iaTaskMatchesShot(sh, iaSelectedEp, seq, shName)));
        } else {
            iaHierarchy.shots = rawShots;
        }

        if (iaHierarchy.shots.length > 0) {
            if (!iaSelectedShot || !iaHierarchy.shots.includes(iaSelectedShot)) {
                iaSelectedShot = iaHierarchy.shots[0];
            }

            shotSelect.innerHTML = '<option value="">-- Seleccionar Shot --</option>' +
                iaHierarchy.shots.map(sh => `<option value="${sh}" ${sh === iaSelectedShot ? 'selected' : ''}>${sh}</option>`).join('');
            shotSelect.disabled = false;

            if (iaSelectedShot) {
                handleIaShotChange(iaSelectedShot);
            }
        } else {
            shotSelect.innerHTML = iaOnlyMyTasks
                ? '<option value="">(Sin shots asignados)</option>'
                : '<option value="">(Sin shots)</option>';
        }
    } catch(e) {
        console.error("Error loading shots for IA:", e);
        shotSelect.innerHTML = '<option value="">(Error al leer shots)</option>';
    }
}

function handleIaShotChange(shotName) {
    iaSelectedShot = shotName;
    const shotIdInput = document.getElementById('iaShotIdInput');
    if (shotIdInput && shotName) {
        shotIdInput.value = shotName;
        updateIaResolution();
    }
}

async function handleIaSelectionChange(selectedPath) {
    if (!selectedPath) return;
    const norm = selectedPath.replace(/\\/g, '/');
    const parts = norm.split('/').filter(Boolean);

    const epIdx = parts.findIndex(p => p.toLowerCase() === 'episodios' || p.toLowerCase() === 'episodes');
    if (epIdx !== -1 && parts.length > epIdx + 1) {
        const ep = parts[epIdx + 1];
        iaSelectedEp = ep;

        const seqIdx = parts.findIndex(p => p.toLowerCase() === 'secuencias' || p.toLowerCase() === 'sequences');
        if (seqIdx !== -1 && parts.length > seqIdx + 1) {
            const seq = parts[seqIdx + 1];
            iaSelectedSeq = seq;

            const shotIdx = parts.findIndex(p => p.toLowerCase() === 'shots');
            if (shotIdx !== -1 && parts.length > shotIdx + 1) {
                const shot = parts[shotIdx + 1];
                iaSelectedShot = shot;
            }
        }

        await refreshIaHierarchy();
    }
}

// --- 2. RESOLVER SHOT ID & RUTA DE MEDIA ---
async function updateIaResolution() {
    const shotIdInput = document.getElementById('iaShotIdInput');
    const shotId = (shotIdInput ? shotIdInput.value : '').trim();
    const valEl = document.getElementById('tokShotIdVal');
    if (valEl) valEl.innerText = shotId || 'SHOT_ID';

    if (!shotId) return;

    try {
        const { workRoot, mediaRoot } = getIaProjectRoots();
        const res = await fetch(`/api/ia/resolve-shot?shotId=${encodeURIComponent(shotId)}&mediaRoot=${encodeURIComponent(mediaRoot)}&workRoot=${encodeURIComponent(workRoot)}`);
        const data = await res.json();
        if (data.iaPath) {
            iaCurrentResolvedIaPath = data.iaPath;
            window.iaExistingFiles = data.existingFiles || [];
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
function getIaTokenValues(item = null, versionOverride = null) {
    const shotIdOn = document.getElementById('tokShotIdToggle')?.checked !== false;
    const motorOn = document.getElementById('tokMotorToggle')?.checked !== false;
    const resOn = document.getElementById('tokResToggle')?.checked !== false;
    const framingOn = document.getElementById('tokFramingToggle')?.checked !== false;
    const tagAOn = item && typeof item.tagAOn !== 'undefined' ? item.tagAOn : (document.getElementById('tokTagAToggle')?.checked !== false);
    const tagBOn = item && typeof item.tagBOn !== 'undefined' ? item.tagBOn : (document.getElementById('tokTagBToggle')?.checked === true);
    const tagCOn = item && typeof item.tagCOn !== 'undefined' ? item.tagCOn : (document.getElementById('tokTagCToggle')?.checked === true);
    const verOn = document.getElementById('tokVerToggle')?.checked !== false;

    const shotId = document.getElementById('iaShotIdInput')?.value.trim() || '';

    const effective = getEffectiveIaPresets();
    const defaultVidMotor = effective.defaultVideoEngine || 'SD2';
    const defaultImgMotor = effective.defaultImageEngine || 'NB2P';

    // 1. Motor
    let motor = 'auto';
    if (item) {
        const choice = item.motorChoice || (item.isHiggsfield ? 'auto_hf' : 'auto');
        if (choice === 'auto_hf') {
            motor = item.higgsfieldData?.motorCanonical || item.motor || 'SD25';
        } else if (choice === 'auto') {
            const ext = (item.ext || '').toLowerCase();
            const isImg = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
            motor = isImg ? defaultImgMotor : defaultVidMotor;
        } else if (choice === 'custom') {
            motor = item.customMotor || '';
        } else {
            motor = choice;
        }
    } else {
        const motorSel = document.getElementById('tokMotorSelect');
        const motorCustomEl = document.getElementById('tokMotorCustom');
        const choice = motorSel?.value || 'auto';
        if (choice === 'custom') {
            motor = motorCustomEl?.value.trim() || '';
        } else if (choice === 'auto_hf') {
            motor = 'SD25';
        } else if (choice === 'auto') {
            motor = defaultVidMotor;
        } else {
            motor = choice;
        }
    }

    // 2. Resolución
    let resolution = 'auto';
    if (item) {
        const choice = item.resChoice || (item.isHiggsfield ? 'auto_hf' : 'auto');
        if (choice === 'auto_hf') {
            resolution = item.higgsfieldData?.resCanonical || item.autoResTag || 'FHD';
        } else if (choice === 'auto') {
            resolution = item.autoResTag || 'FHD';
        } else if (choice === 'custom') {
            resolution = item.customRes || '';
        } else {
            resolution = choice;
        }
    } else {
        const resSel = document.getElementById('tokResSelect');
        const resCustomEl = document.getElementById('tokResCustom');
        const choice = resSel?.value || 'auto';
        if (choice === 'custom') {
            resolution = resCustomEl?.value.trim() || '';
        } else if (choice === 'auto_hf') {
            resolution = 'FHD';
        } else if (choice === 'auto') {
            resolution = 'FHD';
        } else {
            resolution = choice;
        }
    }

    // 3. Framing
    let framing = '';
    if (item) {
        const choice = item.framingChoice || item.framing || (document.getElementById('tokFramingSelect')?.value || 'FLL');
        if (choice === 'custom') {
            framing = item.customFraming || '';
        } else {
            framing = choice;
        }
    } else {
        const framingSel = document.getElementById('tokFramingSelect');
        const framingCustomEl = document.getElementById('tokFramingCustom');
        const choice = framingSel?.value || 'CRP';
        framing = choice === 'custom' ? (framingCustomEl?.value.trim() || '') : choice;
    }

    // 4. Tags Niveles A-B-C (Independientes)
    let tagA = '', tagB = '', tagC = '';
    if (item) {
        tagA = item.tagAChoice === 'custom' ? (item.customTagA || '') : (item.tagAChoice || '');
        tagB = item.tagBChoice === 'custom' ? (item.customTagB || '') : (item.tagBChoice || '');
        tagC = item.tagCChoice === 'custom' ? (item.customTagC || '') : (item.tagCChoice || (item.hfRole || ''));
    } else {
        const tagASel = document.getElementById('tokTagALevel');
        const tagACustomEl = document.getElementById('tokTagACustom');
        tagA = tagASel?.value === 'custom' ? (tagACustomEl?.value.trim() || '') : (tagASel?.value || '');

        const tagBSel = document.getElementById('tokTagBLevel');
        const tagBCustomEl = document.getElementById('tokTagBCustom');
        tagB = tagBSel?.value === 'custom' ? (tagBCustomEl?.value.trim() || '') : (tagBSel?.value || '');

        const tagCSel = document.getElementById('tokTagCLevel');
        const tagCCustomEl = document.getElementById('tokTagCCustom');
        tagC = tagCSel?.value === 'custom' ? (tagCCustomEl?.value.trim() || '') : (tagCSel?.value || '');
    }

    const tagParts = [];
    if (tagAOn && tagA) tagParts.push(tagA);
    if (tagBOn && tagB) tagParts.push(tagB);
    if (tagCOn && tagC) tagParts.push(tagC);
    const tagRole = tagParts.join('-');

    // 5. Versión
    const verInputVal = document.getElementById('tokVerInput')?.value.trim() || 'v001';
    let version = versionOverride || (item?.version || verInputVal);

    const prefixTokens = [];
    if (shotIdOn && shotId) prefixTokens.push(shotId);
    if (motorOn && motor) prefixTokens.push(motor);
    if (resOn && resolution) prefixTokens.push(resolution);
    if (framingOn && framing) prefixTokens.push(framing);
    if (tagRole) prefixTokens.push(tagRole);

    const tokens = [...prefixTokens];
    if (verOn && version) tokens.push(version);

    return { 
        tokens, 
        prefixBase: prefixTokens.join('_'),
        canonicalBase: tokens.join('_'), 
        version,
        ext: item?.ext || ''
    };
}

// --- NAME BUILDER TOKEN TOGGLE MODULES (FULL FILL BUTTONS) ---
function toggleIaTokenModule(tokenKey) {
    const keyMap = {
        shotId: { toggle: 'tokShotIdToggle', card: 'tokCard_shotId', btn: 'tokBtn_shotId' },
        motor: { toggle: 'tokMotorToggle', card: 'tokCard_motor', btn: 'tokBtn_motor' },
        res: { toggle: 'tokResToggle', card: 'tokCard_res', btn: 'tokBtn_res' },
        framing: { toggle: 'tokFramingToggle', card: 'tokCard_framing', btn: 'tokBtn_framing' },
        tagA: { toggle: 'tokTagAToggle', card: 'tokCard_tagA', btn: 'tokBtn_tagA' },
        tagB: { toggle: 'tokTagBToggle', card: 'tokCard_tagB', btn: 'tokBtn_tagB' },
        tagC: { toggle: 'tokTagCToggle', card: 'tokCard_tagC', btn: 'tokBtn_tagC' },
        ver: { toggle: 'tokVerToggle', card: 'tokCard_ver', btn: 'tokBtn_ver' }
    };
    const conf = keyMap[tokenKey];
    if (!conf) return;

    const toggle = document.getElementById(conf.toggle);
    if (!toggle) return;

    toggle.checked = !toggle.checked;
    updateIaTokenModuleUI(tokenKey);

    // Propagar a ítems seleccionados si es un switch de Tag
    if (['tagA', 'tagB', 'tagC'].includes(tokenKey)) {
        const propKey = tokenKey + 'On';
        const targets = iaSelectedIds.size > 0 
            ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
            : iaBatchQueue.filter(i => i.checked);
        targets.forEach(item => { item[propKey] = toggle.checked; });
    }

    updateIaPreview();
}

function updateIaTokenModuleUI(tokenKey) {
    const keyMap = {
        shotId: { toggle: 'tokShotIdToggle', card: 'tokCard_shotId', btn: 'tokBtn_shotId' },
        motor: { toggle: 'tokMotorToggle', card: 'tokCard_motor', btn: 'tokBtn_motor' },
        res: { toggle: 'tokResToggle', card: 'tokCard_res', btn: 'tokBtn_res' },
        framing: { toggle: 'tokFramingToggle', card: 'tokCard_framing', btn: 'tokBtn_framing' },
        tagA: { toggle: 'tokTagAToggle', card: 'tokCard_tagA', btn: 'tokBtn_tagA' },
        tagB: { toggle: 'tokTagBToggle', card: 'tokCard_tagB', btn: 'tokBtn_tagB' },
        tagC: { toggle: 'tokTagCToggle', card: 'tokCard_tagC', btn: 'tokBtn_tagC' },
        ver: { toggle: 'tokVerToggle', card: 'tokCard_ver', btn: 'tokBtn_ver' }
    };
    const conf = keyMap[tokenKey];
    if (!conf) return;

    const toggle = document.getElementById(conf.toggle);
    const card = document.getElementById(conf.card);
    const btn = document.getElementById(conf.btn);
    if (!toggle || !card || !btn) return;

    const isOn = toggle.checked;
    if (isOn) {
        card.classList.add('ia-token-card-active');
        card.classList.remove('ia-token-card-inactive');
        btn.classList.add('active');
    } else {
        card.classList.remove('ia-token-card-active');
        card.classList.add('ia-token-card-inactive');
        btn.classList.remove('active');
    }
}

function updateAllIaTokenModulesUI() {
    ['shotId', 'motor', 'res', 'framing', 'tagA', 'tagB', 'tagC', 'ver'].forEach(updateIaTokenModuleUI);
}

// --- 3. ACTUALIZACIÓN DE PREVIEW Y TABLA ---
let iaActiveSubfolders = new Set(['wip']);

function iaToggleSubfolder(key) {
    if (iaActiveSubfolders.has(key)) {
        if (iaActiveSubfolders.size > 1) {
            iaActiveSubfolders.delete(key);
        }
    } else {
        iaActiveSubfolders.add(key);
    }
    updateIaSubfolderButtonsUI();
    updateIaPreview();
}

function updateIaSubfolderButtonsUI() {
    const btnWip = document.getElementById('iaToggleBtnWip');
    const btnRef = document.getElementById('iaToggleBtnRef');
    const btnExport = document.getElementById('iaToggleBtnExport');
    if (btnWip) btnWip.className = 'ia-subfolder-toggle-btn' + (iaActiveSubfolders.has('wip') ? ' active-wip' : '');
    if (btnRef) btnRef.className = 'ia-subfolder-toggle-btn' + (iaActiveSubfolders.has('ref') ? ' active-ref' : '');
    if (btnExport) btnExport.className = 'ia-subfolder-toggle-btn' + (iaActiveSubfolders.has('export') ? ' active-export' : '');
}

function getTargetFolderForItem(subfolderKey) {
    let baseIaPath = iaCurrentResolvedIaPath;
    const pathEl = document.getElementById('iaResolvedPath');
    if (pathEl && pathEl.innerText && !pathEl.innerText.includes('Cargando') && !pathEl.innerText.includes('Error')) {
        baseIaPath = pathEl.innerText.trim();
    }
    if (!baseIaPath) {
        const { mediaRoot } = getIaProjectRoots();
        const shotId = document.getElementById('iaShotIdInput')?.value.trim() || 'SURF_B03_066_1200';
        const parts = shotId.split('_');
        const ep = parts[1] || 'B03';
        const seq = parts[2] || '066';
        baseIaPath = `${mediaRoot}/episodios/${ep}/secuencias/${seq}/shots/${shotId}/IA`;
    }
    let targetFolder = baseIaPath;
    if (subfolderKey === 'ref') targetFolder += '/ref';
    else if (subfolderKey === 'export') targetFolder += '/export';
    else if (subfolderKey === 'enc') targetFolder += '/enc';
    return targetFolder;
}

window.iaExistingFiles = window.iaExistingFiles || [];

function updateIaPreview() {
    let selectedSubfolder = 'root';
    if (iaActiveSubfolders.has('wip')) selectedSubfolder = 'root';
    else if (iaActiveSubfolders.has('ref')) selectedSubfolder = 'ref';
    else if (iaActiveSubfolders.has('export')) selectedSubfolder = 'export';

    const verInputVal = document.getElementById('tokVerInput')?.value.trim() || 'v001';
    const matchVer = verInputVal.match(/v(\d+)/i);
    const startNum = matchVer ? parseInt(matchVer[1], 10) : (iaBaseVersionNum || 1);

    // Conjunto de rutas ya asignadas en esta tanda
    const assignedInBatch = new Set();

    // Helper de colisión contra disco y cola activa
    const checkFileCollision = (targetFolder, subfolderKey, candidateFilename) => {
        const lowerName = candidateFilename.toLowerCase();
        const fullBatchKey = (targetFolder + '/' + lowerName).replace(/\\/g, '/').toLowerCase();
        if (assignedInBatch.has(fullBatchKey)) return true;

        if (window.iaExistingFiles && window.iaExistingFiles.length > 0) {
            const match = window.iaExistingFiles.some(f => {
                if (!f.name || f.name.toLowerCase() !== lowerName) return false;
                if (f.subfolder && f.subfolder.toLowerCase() === subfolderKey.toLowerCase()) return true;
                if (f.fullPath && f.fullPath.toLowerCase() === fullBatchKey) return true;
                const normTarget = targetFolder.replace(/\\/g, '/').toLowerCase();
                if (f.subfolder && f.subfolder !== 'root' && normTarget.endsWith('/' + f.subfolder.toLowerCase())) return true;
                if (!f.subfolder || f.subfolder === 'root') {
                    if (normTarget.endsWith('/ia')) return true;
                }
                return false;
            });
            if (match) return true;
        }
        return false;
    };

    iaBatchQueue.forEach((item) => {
        if (!item.subfolder) item.subfolder = selectedSubfolder;
        item.targetFolder = getTargetFolderForItem(item.subfolder);
        const ext = item.ext || '.mp4';

        // Obtener tokens base sin versión
        const baseRes = getIaTokenValues(item, 'v000');
        const prefixBase = baseRes.prefixBase;

        let finalVerNum;
        let isCollision = false;

        if (item.version) {
            // Override manual de versión fijado en este ítem
            const match = item.version.match(/v?(\d+)/i);
            finalVerNum = match ? parseInt(match[1], 10) : startNum;
            const testName = prefixBase + '_v' + String(finalVerNum).padStart(3, '0') + ext;
            isCollision = checkFileCollision(item.targetFolder, item.subfolder, testName);
        } else {
            // Auto-resolución de versión: detectar si ya existe un archivo idéntico en disco y continuar a partir de ahí
            let candidateNum = startNum;
            let candidateName = prefixBase + '_v' + String(candidateNum).padStart(3, '0') + ext;

            while (checkFileCollision(item.targetFolder, item.subfolder, candidateName)) {
                candidateNum++;
                candidateName = prefixBase + '_v' + String(candidateNum).padStart(3, '0') + ext;
            }

            finalVerNum = candidateNum;
        }

        const itemVerStr = 'v' + String(finalVerNum).padStart(3, '0');
        item.canonicalVer = itemVerStr;
        const tokenRes = getIaTokenValues(item, itemVerStr);
        item.canonicalName = tokenRes.canonicalBase + ext;
        item.targetPath = (item.targetFolder + '/' + item.canonicalName).replace(/\\/g, '/');
        item.hasCollision = isCollision;

        assignedInBatch.add(item.targetPath.toLowerCase());
    });

    renderIaBatchTable();

    // Actualizar Preview Principal (primer item o selección)
    const activeItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id)) || iaBatchQueue[0];
    const canonicalDisplay = document.getElementById('iaCanonicalOutputDisplay');
    const pathDisplay = document.getElementById('iaCanonicalPathDisplay');

    if (activeItem) {
        if (canonicalDisplay) canonicalDisplay.innerText = activeItem.canonicalName;
        if (pathDisplay) pathDisplay.innerText = `Ruta: ${activeItem.targetPath}`;

        // Sincronizar input de versión con el ítem activo si el usuario no lo está editando
        const verInput = document.getElementById('tokVerInput');
        if (verInput && document.activeElement !== verInput && !iaSelectedIds.size) {
            verInput.value = activeItem.canonicalVer || activeItem.version || 'v001';
        }
    } else {
        let singleVerNum = iaBaseVersionNum || 1;
        const testBase = getIaTokenValues(null, 'v000').prefixBase;
        const defaultFolder = getTargetFolderForItem(selectedSubfolder);
        let testName = testBase + '_v' + String(singleVerNum).padStart(3, '0') + '.mp4';
        while (checkFileCollision(defaultFolder, selectedSubfolder, testName)) {
            singleVerNum++;
            testName = testBase + '_v' + String(singleVerNum).padStart(3, '0') + '.mp4';
        }
        const singleVerStr = 'v' + String(singleVerNum).padStart(3, '0');
        const singleTokens = getIaTokenValues(null, singleVerStr);
        const defaultName = singleTokens.canonicalBase + '.mp4';
        if (canonicalDisplay) canonicalDisplay.innerText = defaultName;
        if (pathDisplay) pathDisplay.innerText = `Ruta: ${(defaultFolder + '/' + defaultName).replace(/\\/g, '/')}`;
        const verInput = document.getElementById('tokVerInput');
        if (verInput && document.activeElement !== verInput) {
            verInput.value = singleVerStr;
        }
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

    updateIaHfToggleBtnUI();
}

// --- AUTODETECCIÓN DE METADATA DE RESOLUCIÓN ---
function detectMediaDimensions(item) {
    return new Promise((resolve) => {
        if (!item) return resolve(null);
        let src = '';
        if (item.file && (item.file instanceof Blob || (typeof File !== 'undefined' && item.file instanceof File))) {
            try { src = URL.createObjectURL(item.file); } catch(e) {}
        } else if (item.originalPath && !item.originalPath.startsWith('[')) {
            src = `/api/ia/file-preview?path=${encodeURIComponent(item.originalPath)}`;
        }
        if (!src) return resolve(null);

        const ext = (item.ext || '').toLowerCase();
        const isVideo = ['.mp4', '.mov', '.webm', '.mkv'].includes(ext);
        const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);

        if (isImage) {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = () => resolve(null);
            img.src = src;
        } else if (isVideo) {
            const vid = document.createElement('video');
            vid.onloadedmetadata = () => {
                resolve({ width: vid.videoWidth, height: vid.videoHeight });
            };
            vid.onerror = () => resolve(null);
            vid.src = src;
        } else {
            resolve(null);
        }
    });
}

async function autoDetectResolutionForActiveItem(item, force = false) {
    if (!item) return;
    if (!force && item.resChoice !== 'auto') return;

    if ((item.autoResDetected || item.isDetectingRes) && !force) return;
    item.isDetectingRes = true;

    try {
        const dims = await detectMediaDimensions(item);
        item.isDetectingRes = false;
        if (!dims || !dims.width || !dims.height) return;

        const resSelect = document.getElementById('tokResSelect');
        const resCustomInput = document.getElementById('tokResCustom');

        const w = dims.width;
        const h = dims.height;
        const dimStr = `${w}x${h}`;

        const effective = getEffectiveIaPresets();
        const translationRules = effective.resolutionTranslations || [
            { detected: "1920x1080", tag: "FHD" },
            { detected: "3840x2160", tag: "UHD" },
            { detected: "1080x1920", tag: "916" },
            { detected: "1080x1080", tag: "SQ1K" },
            { detected: "2560x1080", tag: "UW2K" },
            { detected: "1280x720", tag: "HD" }
        ];

        let matchedVal = '';
        const foundRule = translationRules.find(r => r.detected === dimStr || r.detected.toLowerCase() === dimStr.toLowerCase());
        if (foundRule) {
            matchedVal = foundRule.tag;
        } else if (w === 1920 && h === 1080) matchedVal = 'FHD';
        else if (w === 3840 && h === 2160) matchedVal = 'UHD';
        else if (w === 1280 && h === 720) matchedVal = 'HD';
        else if (w === 1024 && h === 1024) matchedVal = 'SQ1K';
        else if (w === 2560 && h === 1080) matchedVal = 'UW2K';
        else if (resSelect) {
            for (let opt of resSelect.options) {
                if (opt.value === dimStr || opt.text.includes(dimStr)) {
                    matchedVal = opt.value;
                    break;
                }
            }
        }

        const finalTag = matchedVal || dimStr;
        item.autoResDetected = dimStr;
        item.autoResTag = finalTag;

        // Mantener la selección visible en 'auto' (o 'auto_hf')
        if (item.resChoice === 'auto') {
            if (resSelect && resSelect.value !== 'auto') resSelect.value = 'auto';
            if (resCustomInput) resCustomInput.style.display = 'none';
        } else if (item.resChoice === 'auto_hf') {
            if (resSelect && resSelect.value !== 'auto_hf') resSelect.value = 'auto_hf';
            if (resCustomInput) resCustomInput.style.display = 'none';
        }

        updateIaPreview();
        showIaAlert(`📐 Metadata de resolución autodetectada: ${dimStr} (${matchedVal || dimStr})`, "#4caf50");
    } catch(e) {
        item.isDetectingRes = false;
        console.error("Auto detect resolution error:", e);
    }
}

function triggerResolutionAutoDetect() {
    const activeItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id)) || iaBatchQueue[0];
    if (activeItem) {
        autoDetectResolutionForActiveItem(activeItem, true);
    }
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
window.openCurrentPreviewExternally = openCurrentPreviewExternally;

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

// --- 4. MANEJO DE SELECCIÓN Y DRAG & DROP MULTI-ARCHIVO ---
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

function syncBuilderControlsWithSelection() {
    const noticeEl = document.getElementById('iaMultiSelectNotice');
    const activeItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id)) || (iaBatchQueue.length > 0 ? iaBatchQueue[0] : null);

    if (activeItem) {
        if (iaSelectedIds.size > 1) {
            if (noticeEl) noticeEl.innerText = `Editando ${iaSelectedIds.size} ítems en lote (activo: ${activeItem.originalName})`;
        } else if (iaSelectedIds.size === 1) {
            if (noticeEl) noticeEl.innerText = `Editando: ${activeItem.originalName}`;
        } else {
            if (noticeEl) noticeEl.innerText = `Mostrando: ${activeItem.originalName}`;
        }

        // Subcarpeta
        const sub = activeItem.subfolder === 'root' ? 'wip' : (activeItem.subfolder || 'wip');
        iaActiveSubfolders = new Set([sub]);
        updateIaSubfolderButtonsUI();

        // Motor
        const motorSel = document.getElementById('tokMotorSelect');
        const motorCustom = document.getElementById('tokMotorCustom');
        const mChoice = activeItem.motorChoice || (activeItem.isHiggsfield ? 'auto_hf' : 'auto');
        if (motorSel) motorSel.value = mChoice;
        if (motorCustom) {
            motorCustom.style.display = mChoice === 'custom' ? 'block' : 'none';
            motorCustom.value = activeItem.customMotor || '';
        }

        // Res
        const resSel = document.getElementById('tokResSelect');
        const resCustom = document.getElementById('tokResCustom');
        const rChoice = activeItem.resChoice || (activeItem.isHiggsfield ? 'auto_hf' : 'auto');
        if (resSel) resSel.value = rChoice;
        if (resCustom) {
            resCustom.style.display = rChoice === 'custom' ? 'block' : 'none';
            resCustom.value = activeItem.customRes || '';
        }

        // Framing
        const framingSel = document.getElementById('tokFramingSelect');
        const framingCustom = document.getElementById('tokFramingCustom');
        const fChoice = activeItem.framingChoice || (activeItem.isHiggsfield ? 'FLL' : (framingSel?.value || 'FLL'));
        if (framingSel) framingSel.value = fChoice;
        if (framingCustom) {
            framingCustom.style.display = fChoice === 'custom' ? 'block' : 'none';
            framingCustom.value = activeItem.customFraming || '';
        }

        // Tags (Switches y Niveles Independientes)
        if (typeof activeItem.tagAOn !== 'undefined') {
            const toggleA = document.getElementById('tokTagAToggle');
            if (toggleA) { toggleA.checked = !!activeItem.tagAOn; updateIaTokenModuleUI('tagA'); }
        }
        if (typeof activeItem.tagBOn !== 'undefined') {
            const toggleB = document.getElementById('tokTagBToggle');
            if (toggleB) { toggleB.checked = !!activeItem.tagBOn; updateIaTokenModuleUI('tagB'); }
        }
        if (typeof activeItem.tagCOn !== 'undefined') {
            const toggleC = document.getElementById('tokTagCToggle');
            if (toggleC) { toggleC.checked = !!activeItem.tagCOn; updateIaTokenModuleUI('tagC'); }
        }

        const tagASel = document.getElementById('tokTagALevel');
        const tagACustom = document.getElementById('tokTagACustom');
        if (tagASel) tagASel.value = activeItem.tagAChoice || '';
        if (tagACustom) {
            tagACustom.style.display = activeItem.tagAChoice === 'custom' ? 'block' : 'none';
            tagACustom.value = activeItem.customTagA || '';
        }

        const tagBSel = document.getElementById('tokTagBLevel');
        const tagBCustom = document.getElementById('tokTagBCustom');
        if (tagBSel) tagBSel.value = activeItem.tagBChoice || '';
        if (tagBCustom) {
            tagBCustom.style.display = activeItem.tagBChoice === 'custom' ? 'block' : 'none';
            tagBCustom.value = activeItem.customTagB || '';
        }

        const tagCSel = document.getElementById('tokTagCLevel');
        const tagCCustom = document.getElementById('tokTagCCustom');
        if (tagCSel) tagCSel.value = activeItem.tagCChoice || (activeItem.hfRole || '');
        if (tagCCustom) {
            tagCCustom.style.display = activeItem.tagCChoice === 'custom' ? 'block' : 'none';
            tagCCustom.value = activeItem.customTagC || '';
        }

        // Versión
        const verInput = document.getElementById('tokVerInput');
        if (verInput && activeItem.version) {
            verInput.value = activeItem.version;
        }
    } else {
        if (noticeEl) noticeEl.innerText = 'Selecciona ítems abajo para editar en lote';
    }

    updateIaHfToggleBtnUI();
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

function handleIaMotorChange(val) {
    const customEl = document.getElementById('tokMotorCustom');
    if (val === 'custom') {
        if (customEl) customEl.style.display = 'block';
    } else {
        if (customEl) customEl.style.display = 'none';
    }
    const chosen = val === 'custom' ? (customEl?.value.trim() || '') : val;
    
    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.motorChoice = val;
        if (val === 'custom') {
            item.customMotor = chosen;
            item.motor = chosen;
        } else if (val === 'auto_hf') {
            item.motor = item.higgsfieldData?.motorCanonical || item.motor || 'SD25';
        } else if (val === 'auto') {
            const ext = (item.ext || '').toLowerCase();
            const isImg = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
            const eff = getEffectiveIaPresets();
            item.motor = isImg ? (eff.defaultImageEngine || 'NB2P') : (eff.defaultVideoEngine || 'SD2');
        } else {
            item.motor = val;
        }
    });

    updateIaPreview();
}

function handleIaMotorCustomChange(val) {
    const chosen = val.trim();
    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.motorChoice = 'custom';
        item.customMotor = chosen;
        item.motor = chosen;
    });

    updateIaPreview();
}

function handleIaResChange(val) {
    const customEl = document.getElementById('tokResCustom');
    if (val === 'custom') {
        if (customEl) customEl.style.display = 'block';
    } else {
        if (customEl) customEl.style.display = 'none';
    }
    const chosen = val === 'custom' ? (customEl?.value.trim() || '') : val;

    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.resChoice = val;
        if (val === 'custom') {
            item.customRes = chosen;
            item.autoResTag = chosen;
        } else if (val === 'auto_hf') {
            item.autoResTag = item.higgsfieldData?.resCanonical || item.autoResTag || 'FHD';
        } else if (val === 'auto') {
            autoDetectResolutionForActiveItem(item);
        } else {
            item.autoResTag = val;
        }
    });

    updateIaPreview();
}

function handleIaResCustomChange(val) {
    const chosen = val.trim();
    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.resChoice = 'custom';
        item.customRes = chosen;
        item.autoResTag = chosen;
    });

    updateIaPreview();
}

function handleIaFramingChange(val) {
    const customEl = document.getElementById('tokFramingCustom');
    if (val === 'custom') {
        if (customEl) customEl.style.display = 'block';
    } else {
        if (customEl) customEl.style.display = 'none';
    }
    const chosen = val === 'custom' ? (customEl?.value.trim() || '') : val;

    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.framingChoice = val;
        if (val === 'custom') item.customFraming = chosen;
    });

    updateIaPreview();
}

function handleIaFramingCustomChange(val) {
    const chosen = val.trim();
    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.framingChoice = 'custom';
        item.customFraming = chosen;
    });

    updateIaPreview();
}

function handleIaTagAChange(val) {
    const customEl = document.getElementById('tokTagACustom');
    if (val === 'custom') {
        if (customEl) customEl.style.display = 'block';
    } else {
        if (customEl) customEl.style.display = 'none';
    }
    const chosen = val === 'custom' ? (customEl?.value.trim() || '') : val;

    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.tagAChoice = val;
        if (val === 'custom') item.customTagA = chosen;
    });

    updateIaPreview();
}

function handleIaTagACustomChange(val) {
    const chosen = val.trim();
    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.tagAChoice = 'custom';
        item.customTagA = chosen;
    });

    updateIaPreview();
}

function handleIaTagBChange(val) {
    const customEl = document.getElementById('tokTagBCustom');
    if (val === 'custom') {
        if (customEl) customEl.style.display = 'block';
    } else {
        if (customEl) customEl.style.display = 'none';
    }
    const chosen = val === 'custom' ? (customEl?.value.trim() || '') : val;

    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.tagBChoice = val;
        if (val === 'custom') item.customTagB = chosen;
    });

    updateIaPreview();
}

function handleIaTagBCustomChange(val) {
    const chosen = val.trim();
    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.tagBChoice = 'custom';
        item.customTagB = chosen;
    });

    updateIaPreview();
}

function handleIaTagCChange(val) {
    const customEl = document.getElementById('tokTagCCustom');
    if (val === 'custom') {
        if (customEl) customEl.style.display = 'block';
    } else {
        if (customEl) customEl.style.display = 'none';
    }
    const chosen = val === 'custom' ? (customEl?.value.trim() || '') : val;

    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.tagCChoice = val;
        if (val === 'custom') item.customTagC = chosen;
    });

    updateIaPreview();
}

function handleIaTagCCustomChange(val) {
    const chosen = val.trim();
    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    targets.forEach(item => {
        item.tagCChoice = 'custom';
        item.customTagC = chosen;
    });

    updateIaPreview();
}

function handleIaVerInput(val) {
    const match = val.match(/v?(\d+)/i);
    if (match) {
        iaBaseVersionNum = Math.max(1, parseInt(match[1], 10));
    }
    const targets = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : [];

    targets.forEach(item => {
        item.version = val.trim();
    });

    if (iaSelectedIds.size === 0) {
        iaBatchQueue.forEach(item => {
            delete item.version;
        });
    }

    updateIaPreview();
}

function handleIaVerInputChange(val) {
    handleIaVerInput(val);
}

function stepIaVersion(delta) {
    const verInput = document.getElementById('tokVerInput');
    const currentVal = verInput ? verInput.value.trim() : 'v001';
    const match = currentVal.match(/v?(\d+)/i);
    let curNum = match ? parseInt(match[1], 10) : (iaBaseVersionNum || 1);
    let newNum = Math.max(1, curNum + delta);
    const newVerStr = 'v' + String(newNum).padStart(3, '0');
    if (verInput) verInput.value = newVerStr;
    iaBaseVersionNum = newNum;

    if (iaSelectedIds.size > 0) {
        iaBatchQueue.filter(i => iaSelectedIds.has(i.id)).forEach(item => {
            item.version = newVerStr;
        });
    } else {
        iaBatchQueue.forEach(item => {
            delete item.version;
        });
    }

    updateIaPreview();
}

window.stepIaVersion = stepIaVersion;
window.handleIaVerInput = handleIaVerInput;
window.handleIaVerInputChange = handleIaVerInputChange;

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
    const saveChecked = localStorage.getItem('pipeta_ia_save_custom_tokens') !== 'false';
    const isDev = typeof settings !== 'undefined' && settings.devMode;
    if (!saveChecked && !isDev) return;

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

        // Si Dev Mode está encendido, incorporar automáticamente al Proyecto Base
        if (isDev) {
            const baseProj = typeof settings.getBaseProject === 'function' ? settings.getBaseProject() : null;
            if (baseProj && baseProj.iaPresets) {
                let modified = false;
                payload.motors.forEach(m => {
                    if (!baseProj.iaPresets.motors.includes(m)) {
                        baseProj.iaPresets.motors.push(m);
                        modified = true;
                    }
                });
                payload.framings.forEach(f => {
                    if (!baseProj.iaPresets.framings.includes(f)) {
                        baseProj.iaPresets.framings.push(f);
                        modified = true;
                    }
                });
                payload.tagsA.forEach(t => {
                    if (!baseProj.iaPresets.tagsA.includes(t)) {
                        baseProj.iaPresets.tagsA.push(t);
                        modified = true;
                    }
                });
                payload.tagsB.forEach(t => {
                    if (!baseProj.iaPresets.tagsB.includes(t)) {
                        baseProj.iaPresets.tagsB.push(t);
                        modified = true;
                    }
                });
                payload.tagsC.forEach(t => {
                    if (!baseProj.iaPresets.tagsC.includes(t)) {
                        baseProj.iaPresets.tagsC.push(t);
                        modified = true;
                    }
                });
                payload.resolutions.forEach(r => {
                    const exists = baseProj.iaPresets.resolutionTranslations?.some(x => x.detected === r || x.tag === r);
                    if (!exists) {
                        if (!Array.isArray(baseProj.iaPresets.resolutionTranslations)) baseProj.iaPresets.resolutionTranslations = [];
                        baseProj.iaPresets.resolutionTranslations.push({ detected: r, tag: r });
                        modified = true;
                    }
                });

                if (modified) {
                    if (window.API && API.fs && API.fs.writeFile) {
                        const filePath = (settings.projectsPath || "C:\\TOOLS\\APPS\\Pipeta\\presets\\Projects") + "\\base.json";
                        await API.fs.writeFile(filePath, JSON.stringify(baseProj, null, 2));
                    }
                    populateIaTokenSelectsFromProject();
                    showIaAlert("🛠️ Dev Mode: Tokens manuales incorporados al Proyecto Base local", "#ff9800");
                }
            }
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

// --- 8.5 WORK MODE SWITCHER (ADVANCED / SIMPLE) ---
window.iaWorkMode = localStorage.getItem('pipeta_ia_work_mode') || 'simple';

function switchIaWorkMode(mode) {
    window.iaWorkMode = mode;
    localStorage.setItem('pipeta_ia_work_mode', mode);
    if (typeof updateHeaderTools === 'function') {
        const isPoppedOrDocked = (window.isIaIngestWindowOpen || (typeof window.DockManager !== 'undefined' && window.DockManager.isDocked('ia-ingest')));
        updateHeaderTools(isPoppedOrDocked ? 'view-browser' : 'view-ia-ingest');
    }
    
    const isSimple = mode === 'simple';
    
    // 1. Target Context: Forzar Explorador y ocultar switcher de manual
    const switcher = document.getElementById('iaTargetModeSwitcher') || document.getElementById('iaModeGuidedBtn')?.parentElement;
    if (switcher) switcher.style.display = isSimple ? 'none' : 'flex';
    if (isSimple) setIaContextMode('guided');

    // 2. Watcher Container: Ocultar en Simple
    const watcherBox = document.getElementById('iaWatcherAutoBox');
    if (watcherBox) watcherBox.style.display = isSimple ? 'none' : 'block';

    // 3. Name Builder Fields en Modo Simple
    const tokShotIdToggle = document.getElementById('tokShotIdToggle');
    if (tokShotIdToggle) {
        if (isSimple) {
            tokShotIdToggle.checked = true;
            tokShotIdToggle.disabled = true;
        } else {
            tokShotIdToggle.disabled = false;
        }
    }

    const tokVerToggle = document.getElementById('tokVerToggle');
    if (tokVerToggle) {
        if (isSimple) {
            tokVerToggle.checked = true;
            tokVerToggle.disabled = true;
        } else {
            tokVerToggle.disabled = false;
        }
    }

    // 4. Resolución Auto: Forzar activa y ocultar check en Simple
    const resAutoLabel = document.getElementById('iaAutoDetectResCheck')?.parentElement;
    if (resAutoLabel) {
        if (isSimple) {
            const check = document.getElementById('iaAutoDetectResCheck');
            if (check) check.checked = true;
            resAutoLabel.style.display = 'none';
        } else {
            resAutoLabel.style.display = 'inline-flex';
        }
    }

    populateIaTokenSelectsFromProject();

    // En Simple mode, ocultar custom inputs excepto Tag A
    const motorCustom = document.getElementById('tokMotorCustom');
    if (motorCustom) motorCustom.style.display = (!isSimple && document.getElementById('tokMotorSelect')?.value === 'custom') ? 'block' : 'none';

    const resCustom = document.getElementById('tokResCustom');
    if (resCustom) resCustom.style.display = (!isSimple && document.getElementById('tokResSelect')?.value === 'custom') ? 'block' : 'none';

    const framingCustom = document.getElementById('tokFramingCustom');
    if (framingCustom) framingCustom.style.display = (!isSimple && document.getElementById('tokFramingSelect')?.value === 'custom') ? 'block' : 'none';

    const tagBCustom = document.getElementById('tokTagBCustom');
    if (tagBCustom) tagBCustom.style.display = (!isSimple && document.getElementById('tokTagBLevel')?.value === 'custom') ? 'block' : 'none';

    const tagCCustom = document.getElementById('tokTagCCustom');
    if (tagCCustom) tagCCustom.style.display = (!isSimple && document.getElementById('tokTagCLevel')?.value === 'custom') ? 'block' : 'none';

    // Tag A permite manual en ambos modos
    const tagACustom = document.getElementById('tokTagACustom');
    if (tagACustom) tagACustom.style.display = (document.getElementById('tokTagALevel')?.value === 'custom') ? 'block' : 'none';

    if (isSimple) {
        // En Modo Simple, asegurar defaults de niveles B y C apagados (unchecked)
        const tagBToggle = document.getElementById('tokTagBToggle');
        if (tagBToggle) { tagBToggle.checked = false; updateIaTokenModuleUI('tagB'); }
        const tagCToggle = document.getElementById('tokTagCToggle');
        if (tagCToggle) { tagCToggle.checked = false; updateIaTokenModuleUI('tagC'); }

        const isRefSubfolder = typeof iaActiveSubfolders !== 'undefined' && iaActiveSubfolders.has('ref');
        const tagA = document.getElementById('tokTagALevel');
        if (tagA && !tagA.value) {
            tagA.value = isRefSubfolder ? 'ref' : 'start1001';
        }

        showIaAlert("⚡ Modo Simple activo (Flujo directo y simplificado)", "#03A9F4");
    } else {
        showIaAlert("🛠️ Modo Avanzado activo (Control total de tokens y lotes)", "#4caf50");
    }

    updateIaPreview();
}

// --- 9. CHROME DOWNLOAD WATCHER CLIENT ---
let iaWatcherTimer = null;
window.iaWatcherActive = false;
window.iaWatcherFolder = '';

window.openIaIngestSettings = async function() {
    if (typeof settings !== 'undefined') {
        await settings.open();
        settings.setCategory('ia_ingest');
    }
};

async function toggleDownloadWatcher(active) {
    const statusEl = document.getElementById('iaWatcherStatus');
    const folderEl = document.getElementById('iaWatcherDetectedFolder');
    const settingsFolderEl = document.getElementById('iaSettingsWatcherDetectedFolder');
    const settingsToggle = document.getElementById('iaSettingsWatcherToggle');

    window.iaWatcherActive = !!active;

    if (active) {
        try {
            const res = await fetch('/api/ia/start-download-watcher');
            const data = await res.json();
            if (data && data.success) {
                window.iaWatcherFolder = data.folder;
                if (folderEl) folderEl.innerHTML = `Ruta autodetectada: <b style="color:var(--accent);">${escapeHtml(data.folder)}</b>`;
                if (settingsFolderEl) settingsFolderEl.innerText = data.folder;
                if (statusEl) statusEl.innerHTML = `<span style="color:#4caf50;">● Monitoreo de descargas ACTIVO</span>`;
                showIaAlert(`Captura automática activa en ${data.folder}`, "#4caf50");
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
let _iaLastDropTime = 0;

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

let _iaDropDepthCounter = 0;

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

window.initIaIngest = initIaIngest;
window.initIaDropZone = initIaDropZone;
window.refreshIaHierarchy = refreshIaHierarchy;
window.checkIaDriveType = checkIaDriveType;
window.toggleIaForceSmb = toggleIaForceSmb;
window.openIaIngestSettings = openIaIngestSettings;
window.enqueuePathsToIaBatch = enqueuePathsToIaBatch;
window.detectIaShotFromPath = detectIaShotFromPath;
window.toggleIaTokenModule = toggleIaTokenModule;
window.updateIaTokenModuleUI = updateIaTokenModuleUI;
window.setIaContextMode = setIaContextMode;
window.handleIaEpChange = handleIaEpChange;
window.handleIaSeqChange = handleIaSeqChange;
window.handleIaShotChange = handleIaShotChange;
window.iaToggleSubfolder = iaToggleSubfolder;
window.switchIaWorkMode = switchIaWorkMode;
window.populateIaTokenSelectsFromProject = populateIaTokenSelectsFromProject;
window.saveHfOption = saveHfOption;
window.toggleHfForceWorker = toggleHfForceWorker;
window.updateHfForceWorkerUI = updateHfForceWorkerUI;
window.toggleHfToolbarSuite = toggleHfToolbarSuite;
window.toggleHiggsfieldOnSelectedItem = toggleHiggsfieldOnSelectedItem;
window.updateIaHfToggleBtnUI = updateIaHfToggleBtnUI;
window.handleHfDirectLoad = handleHfDirectLoad;
window.handleForceHiggsfieldOnSelected = handleForceHiggsfieldOnSelected;
window.handleIaMotorChange = handleIaMotorChange;
window.handleIaMotorCustomChange = handleIaMotorCustomChange;
window.handleIaResChange = handleIaResChange;
window.handleIaResCustomChange = handleIaResCustomChange;
window.handleIaFramingChange = handleIaFramingChange;
window.handleIaFramingCustomChange = handleIaFramingCustomChange;
window.handleIaTagAChange = handleIaTagAChange;
window.handleIaTagACustomChange = handleIaTagACustomChange;
window.handleIaTagBChange = handleIaTagBChange;
window.handleIaTagBCustomChange = handleIaTagBCustomChange;
window.handleIaTagCChange = handleIaTagCChange;
window.handleIaTagCCustomChange = handleIaTagCCustomChange;
window.handleIaVerInputChange = handleIaVerInputChange;

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
