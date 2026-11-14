// ----------------------------------------------------------
// --- IA INGEST [2/4]: TARGET CONTEXT, RAMÓN FILTER, SMB & WORK MODE ---
// ----------------------------------------------------------

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

async function updateIaResolution() {
    const shotIdInput = document.getElementById('iaShotIdInput');
    const shotId = (shotIdInput ? shotIdInput.value : '').trim();
    const valEl = document.getElementById('tokShotIdVal');
    if (valEl) valEl.innerText = shotId || 'SHOT_ID';

    if (!shotId) return;

    try {
        const { workRoot, mediaRoot } = getIaProjectRoots();
        const selectedSubs = Array.from(iaActiveSubfolders).join(',');
        const res = await fetch(`/api/ia/resolve-shot?shotId=${encodeURIComponent(shotId)}&mediaRoot=${encodeURIComponent(mediaRoot)}&workRoot=${encodeURIComponent(workRoot)}&subfolders=${encodeURIComponent(selectedSubs)}`);
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

function iaToggleSubfolder(key) {
    iaActiveSubfolders = new Set([key]);
    updateIaSubfolderButtonsUI();

    // Sincronizar destino de todos los ítems de la cola a la subcarpeta seleccionada
    const targetSub = (key === 'wip' ? 'root' : key);
    if (Array.isArray(window.iaBatchQueue)) {
        window.iaBatchQueue.forEach(item => {
            item.subfolder = targetSub;
            item.targetFolder = getTargetFolderForItem(targetSub);
        });
    }

    // Re-escanear para actualizar versiones y archivos existentes
    updateIaResolution();
    if (typeof updateIaPreview === 'function') {
        updateIaPreview();
    }
    if (typeof renderIaBatchTable === 'function') {
        renderIaBatchTable();
    }
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

    // 5. Opciones avanzadas de Versionado (Split & Skip Format)
    const verOpts = document.getElementById('iaVerAdvancedOptions');
    if (verOpts) {
        verOpts.style.display = isSimple ? 'none' : 'flex';
    }

    if (isSimple) {
        // En Modo Simple, asegurar defaults de niveles B y C apagados y ocultos
        const tagBToggle = document.getElementById('tokTagBToggle');
        if (tagBToggle) { tagBToggle.checked = false; updateIaTokenModuleUI('tagB'); }
        const tagCToggle = document.getElementById('tokTagCToggle');
        if (tagCToggle) { tagCToggle.checked = false; updateIaTokenModuleUI('tagC'); }
        const cardB = document.getElementById('tokCard_tagB');
        if (cardB) cardB.style.display = 'none';
        const cardC = document.getElementById('tokCard_tagC');
        if (cardC) cardC.style.display = 'none';

        const isRefSubfolder = typeof iaActiveSubfolders !== 'undefined' && iaActiveSubfolders.has('ref');
        const tagA = document.getElementById('tokTagALevel');
        if (tagA && !tagA.value) {
            tagA.value = isRefSubfolder ? 'ref' : 'start1001';
        }

        showIaAlert("⚡ Modo Simple activo (Flujo directo y simplificado)", "#03A9F4");
    } else {
        const cardB = document.getElementById('tokCard_tagB');
        if (cardB) cardB.style.display = 'flex';
        const cardC = document.getElementById('tokCard_tagC');
        if (cardC) cardC.style.display = 'flex';
        showIaAlert("🛠️ Modo Avanzado activo (Control total de tokens y lotes)", "#4caf50");
    }

    updateIaPreview();
}

function toggleIaWorkMode() {
    const nextMode = (window.iaWorkMode === 'simple') ? 'advanced' : 'simple';
    switchIaWorkMode(nextMode);
}

window.openIaIngestSettings = async function () {
    if (typeof settings !== 'undefined') {
        await settings.open();
        settings.setCategory('ia_ingest');
    }
};

// Global Window Exports (Context, Hierarchy & Mode)
window.refreshIaHierarchy = refreshIaHierarchy;
window.checkIaDriveType = checkIaDriveType;
window.toggleIaForceSmb = toggleIaForceSmb;
window.setIaContextMode = setIaContextMode;
window.handleIaEpChange = handleIaEpChange;
window.handleIaSeqChange = handleIaSeqChange;
window.handleIaShotChange = handleIaShotChange;
window.iaToggleSubfolder = iaToggleSubfolder;
window.switchIaWorkMode = switchIaWorkMode;
window.toggleIaWorkMode = toggleIaWorkMode;
