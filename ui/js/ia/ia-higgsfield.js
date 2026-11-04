// ----------------------------------------------------------
// --- IA INGEST [3/4]: HIGGSFIELD AI SUITE & BROWSER DOWNLOAD WATCHER ---
// ----------------------------------------------------------

window.hfOptions = {
    createLedger: localStorage.getItem('pipeta_hf_create_ledger') !== 'false',
    preserveOriginal: localStorage.getItem('pipeta_hf_preserve_original') !== 'false',
    downloadRefs: localStorage.getItem('pipeta_hf_download_refs') === 'true',
    forceWorker: localStorage.getItem('pipeta_hf_force_worker') === 'true'
};

let hfExecutor = window.hfOptions.forceWorker ? 'worker' : 'local';
const HF_JOB_UUID_REGEX = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
window.hfToolbarOpen = localStorage.getItem('pipeta_hf_toolbar_open_v2') === 'true';

let iaWatcherTimer = null;
window.iaWatcherActive = false;
window.iaWatcherFolder = '';

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

// Global Window Exports (Higgsfield & Watcher)
window.saveHfOption = saveHfOption;
window.toggleHfForceWorker = toggleHfForceWorker;
window.updateHfForceWorkerUI = updateHfForceWorkerUI;
window.toggleHfToolbarSuite = toggleHfToolbarSuite;
window.toggleHiggsfieldOnSelectedItem = toggleHiggsfieldOnSelectedItem;
window.updateIaHfToggleBtnUI = updateIaHfToggleBtnUI;
window.handleHfDirectLoad = handleHfDirectLoad;
window.handleForceHiggsfieldOnSelected = handleForceHiggsfieldOnSelected;
