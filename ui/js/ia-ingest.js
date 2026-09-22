// --- IA INGEST & BATCH NOMENCLATURE LOGIC (v0.9.02 Module) ---
let iaBatchQueue = [];
let iaSelectedIds = new Set();
let iaBaseVersionNum = 1;
let iaCurrentResolvedIaPath = '';

function initIaResizer() {
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
    setTimeout(() => {
        refreshIaHierarchy();
    }, 200);
});

// --- 1. GESTIÓN DE CONTEXTO DE SHOT (EXPLORADOR GUIADO / MANUAL) ---
let iaContextMode = 'guided'; // 'guided' | 'manual'
let iaOnlyMyTasks = localStorage.getItem('pipeta_ia_only_my_tasks') === 'true';
let iaHierarchy = {
    episodes: [],
    scenes: [],
    shots: []
};
let iaSelectedEp = '';
let iaSelectedSeq = '';
let iaSelectedShot = '';

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

window.initIaIngest = function() {
    updateIaMyTasksButtonUI();
    refreshIaHierarchy();
};

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
        motorsVideo: ["SD2", "SD25", "VEO3", "VO31", "GOMN", "NBN2", "NB2P"],
        motorsImage: ["NB2P", "MJ", "FLUX", "SD2", "SD25", "GOMN"],
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
            motorsVideo: Array.isArray(proj.iaPresets.motorsVideo) && proj.iaPresets.motorsVideo.length > 0 ? proj.iaPresets.motorsVideo : (baseIa.motorsVideo || ["SD2", "SD25", "VEO3", "VO31", "GOMN", "NBN2", "NB2P"]),
            motorsImage: Array.isArray(proj.iaPresets.motorsImage) && proj.iaPresets.motorsImage.length > 0 ? proj.iaPresets.motorsImage : (baseIa.motorsImage || ["NB2P", "MJ", "FLUX", "SD2", "SD25", "GOMN"]),
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
        motorsVideo: baseIa.motorsVideo || ["SD2", "SD25", "VEO3", "VO31", "GOMN", "NBN2", "NB2P"],
        motorsImage: baseIa.motorsImage || ["NB2P", "MJ", "FLUX", "SD2", "SD25", "GOMN"],
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

    // 1. Motor Select (Agrupado en Video e Imagen)
    const motorSel = document.getElementById('tokMotorSelect');
    if (motorSel) {
        const curVal = motorSel.value;
        const vList = effective.motorsVideo || [];
        const iList = effective.motorsImage || [];

        let html = '';
        if (vList.length > 0) {
            html += `<optgroup label="🎬 Motores de Video">` + vList.map(m => `<option value="${m}">${m}</option>`).join('') + `</optgroup>`;
        }
        if (iList.length > 0) {
            html += `<optgroup label="🖼️ Motores de Imagen">` + iList.map(m => `<option value="${m}">${m}</option>`).join('') + `</optgroup>`;
        }
        if (!isSimple) {
            html += `<option value="custom">✍️ Manual / Otro...</option>`;
        }
        motorSel.innerHTML = html;

        const allMotors = [...vList, ...iList];
        if (!forceDefaults && curVal && (allMotors.includes(curVal) || curVal === 'custom')) {
            motorSel.value = curVal;
        } else if (vList.includes(effective.defaultVideoEngine)) {
            motorSel.value = effective.defaultVideoEngine;
        } else if (allMotors.length > 0) {
            motorSel.value = allMotors[0];
        }
    }

    // 2. Framing Select
    const framingSel = document.getElementById('tokFramingSelect');
    if (framingSel) {
        const curVal = framingSel.value;
        const list = effective.framings || ["FLL", "CRP"];
        framingSel.innerHTML = list.map(f => `<option value="${f}">${f}</option>`).join('') +
            (!isSimple ? `<option value="custom">✍️ Manual / Otro...</option>` : '');
        if (!forceDefaults && curVal && (list.includes(curVal) || curVal === 'custom')) {
            framingSel.value = curVal;
        } else if (effective.defaultFraming && list.includes(effective.defaultFraming)) {
            framingSel.value = effective.defaultFraming;
        } else if (list.length > 0) {
            framingSel.value = list[0];
        }
    }

    // 3. Tag Level A
    const tagASel = document.getElementById('tokTagALevel');
    if (tagASel) {
        const curVal = tagASel.value;
        const list = effective.tagsA || ["start1001", "end1100", "f1001", "ref", "ref1050"];
        tagASel.innerHTML = `<option value="">- Nivel A (Ninguno) -</option>` +
            list.map(t => `<option value="${t}">${t}</option>`).join('') +
            (!isSimple ? `<option value="custom">✍️ Manual</option>` : '');
        
        const targetA = (typeof effective.defaultTagRoleA !== 'undefined') ? effective.defaultTagRoleA : 'start1001';
        if (!forceDefaults && curVal !== undefined && (list.includes(curVal) || curVal === 'custom')) {
            tagASel.value = curVal;
        } else if (targetA && list.includes(targetA)) {
            tagASel.value = targetA;
        } else {
            tagASel.value = '';
        }
    }

    // 4. Tag Level B
    const tagBSel = document.getElementById('tokTagBLevel');
    if (tagBSel) {
        const curVal = tagBSel.value;
        const list = effective.tagsB || ["inp", "ups", "mask", "clean", "elem"];
        tagBSel.innerHTML = `<option value="">- Nivel B (Ninguno) -</option>` +
            list.map(t => `<option value="${t}">${t}</option>`).join('') +
            (!isSimple ? `<option value="custom">✍️ Manual</option>` : '');
        
        const targetB = (typeof effective.defaultTagRoleB !== 'undefined') ? effective.defaultTagRoleB : 'inp';
        if (!forceDefaults && curVal !== undefined && (list.includes(curVal) || curVal === 'custom')) {
            tagBSel.value = curVal;
        } else if (targetB && list.includes(targetB)) {
            tagBSel.value = targetB;
        } else {
            tagBSel.value = '';
        }
    }

    // 5. Tag Level C
    const tagCSel = document.getElementById('tokTagCLevel');
    if (tagCSel) {
        const curVal = tagCSel.value;
        const list = effective.tagsC || ["i2v", "t2i", "i2i", "t2v", "v2v", "m2v"];
        tagCSel.innerHTML = `<option value="">- Nivel C (Ninguno) -</option>` +
            list.map(t => `<option value="${t}">${t}</option>`).join('') +
            (!isSimple ? `<option value="custom">✍️ Manual</option>` : '');
        
        const targetC = (typeof effective.defaultTagRoleC !== 'undefined') ? effective.defaultTagRoleC : 'i2v';
        if (!forceDefaults && curVal !== undefined && (list.includes(curVal) || curVal === 'custom')) {
            tagCSel.value = curVal;
        } else if (targetC && list.includes(targetC)) {
            tagCSel.value = targetC;
        } else {
            tagCSel.value = '';
        }
    }
}

async function refreshIaHierarchy() {
    updateIaMyTasksButtonUI();
    populateIaTokenSelectsFromProject();
    const { workRoot, mediaRoot } = getIaProjectRoots();
    const epSelect = document.getElementById('iaEpSelect');
    const seqSelect = document.getElementById('iaSeqSelect');
    const shotSelect = document.getElementById('iaShotSelect');

    if (!epSelect) return;

    epSelect.innerHTML = '<option value="">Cargando episodios...</option>';
    if (seqSelect) { seqSelect.innerHTML = '<option value="">-- Escena --</option>'; seqSelect.disabled = true; }
    if (shotSelect) { shotSelect.innerHTML = '<option value="">-- Shot --</option>'; shotSelect.disabled = true; }

    try {
        let epDir = workRoot + '/episodios';
        let dirData = await API.fetchDir(epDir);
        let rawEpisodes = [];
        if (dirData && dirData.items && !dirData.error && dirData.exists !== false) {
            rawEpisodes = dirData.items.filter(i => i.isDirectory && !i.name.startsWith('.') && !i.name.startsWith('_')).map(i => i.name);
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
    const { workRoot } = getIaProjectRoots();
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
        let seqDir = `${workRoot}/episodios/${ep}/secuencias`;
        let dirData = await API.fetchDir(seqDir);
        let rawScenes = [];
        if (dirData && dirData.items && !dirData.error && dirData.exists !== false) {
            rawScenes = dirData.items.filter(i => i.isDirectory && !i.name.startsWith('.') && !i.name.startsWith('_')).map(i => i.name);
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
    const { workRoot } = getIaProjectRoots();
    const shotSelect = document.getElementById('iaShotSelect');

    if (!shotSelect) return;
    shotSelect.innerHTML = '<option value="">Cargando shots...</option>';
    shotSelect.disabled = true;

    if (!seq || !iaSelectedEp) {
        shotSelect.innerHTML = '<option value="">-- Shot --</option>';
        return;
    }

    try {
        let shotDir = `${workRoot}/episodios/${iaSelectedEp}/secuencias/${seq}/shots`;
        let dirData = await API.fetchDir(shotDir);
        if (dirData.error || !dirData.items || dirData.items.length === 0) {
            shotDir = `${workRoot}/episodios/${iaSelectedEp}/secuencias/${seq}`;
            dirData = await API.fetchDir(shotDir);
        }

        let rawShots = [];
        if (dirData && dirData.items) {
            rawShots = dirData.items.filter(i => i.isDirectory && !i.name.startsWith('.') && !i.name.startsWith('_')).map(i => i.name);
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
    const shotIdOn = document.getElementById('tokShotIdToggle')?.checked;
    const motorOn = document.getElementById('tokMotorToggle')?.checked;
    const resOn = document.getElementById('tokResToggle')?.checked;
    const framingOn = document.getElementById('tokFramingToggle')?.checked;
    const tagOn = document.getElementById('tokTagToggle')?.checked;
    const verOn = document.getElementById('tokVerToggle')?.checked;

    const shotId = document.getElementById('iaShotIdInput')?.value.trim() || '';

    const effective = getEffectiveIaPresets();
    const defaultVidMotor = effective.defaultVideoEngine || 'SD2';
    const defaultImgMotor = effective.defaultImageEngine || 'NB2P';

    // Motor (Dropdown + Custom + Detección inteligente por tipo de archivo)
    const motorSel = document.getElementById('tokMotorSelect');
    const motorCustomEl = document.getElementById('tokMotorCustom');
    let motor = motorSel?.value || '';
    if (motor === 'custom') {
        if (motorCustomEl) motorCustomEl.style.display = 'block';
        motor = motorCustomEl?.value.trim() || '';
    } else {
        if (motorCustomEl) motorCustomEl.style.display = 'none';
        if (item) {
            if (item.customMotor) {
                motor = item.customMotor;
            } else if (item.motor) {
                motor = item.motor;
            } else {
                const ext = (item.ext || '').toLowerCase();
                const isImg = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
                motor = isImg ? defaultImgMotor : defaultVidMotor;
            }
        }
    }

    // Res (Dropdown + Custom + Autodetección individual por ítem)
    const resSel = document.getElementById('tokResSelect');
    const resCustomEl = document.getElementById('tokResCustom');
    let resolution = resSel?.value || '';
    if (resolution === 'custom') {
        if (resCustomEl) resCustomEl.style.display = 'block';
        resolution = resCustomEl?.value.trim() || '';
    } else {
        if (resCustomEl) resCustomEl.style.display = 'none';
        if (item && item.autoResTag) {
            resolution = item.autoResTag;
        }
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

    // Version base sin sufijo o forzada externamente
    const verInputVal = document.getElementById('tokVerInput')?.value.trim() || 'v001';
    let version = versionOverride || verInputVal;

    const prefixTokens = [];
    if (shotIdOn && shotId) prefixTokens.push(shotId);
    if (motorOn && motor) prefixTokens.push(motor);
    if (resOn && resolution) prefixTokens.push(resolution);
    if (framingOn && framing) prefixTokens.push(framing);
    if (tagOn && tagRole) prefixTokens.push(tagRole);

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

function updateIaPreview() {
    // Determinar la subcarpeta primaria basada en los botones toggle activos
    let selectedSubfolder = 'root';
    if (iaActiveSubfolders.has('wip')) selectedSubfolder = 'root';
    else if (iaActiveSubfolders.has('ref')) selectedSubfolder = 'ref';
    else if (iaActiveSubfolders.has('export')) selectedSubfolder = 'export';

    // Determinar qué ítems se deben modificar con el builder de tokens actual:
    const targetItems = iaSelectedIds.size > 0 
        ? iaBatchQueue.filter(i => iaSelectedIds.has(i.id))
        : iaBatchQueue.filter(i => i.checked);

    const verInputVal = document.getElementById('tokVerInput')?.value.trim() || 'v001';
    const matchVer = verInputVal.match(/v(\d+)/i);
    const startNum = matchVer ? parseInt(matchVer[1], 10) : iaBaseVersionNum;

    // Agrupador de firmas canónicas: solo incrementa versión si el nombre base + extensión darían un duplicado exacto
    const signatureCounts = new Map();

    targetItems.forEach((item) => {
        item.subfolder = selectedSubfolder;
        
        // Obtener tokens base sin versión
        const baseRes = getIaTokenValues(item, 'v000');
        const ext = (item.ext || '').toLowerCase();
        const signature = `${baseRes.prefixBase}__${ext}`;

        const count = signatureCounts.get(signature) || 0;
        signatureCounts.set(signature, count + 1);

        const itemVerNum = startNum + count;
        const itemVerStr = 'v' + String(itemVerNum).padStart(3, '0');

        const tokenRes = getIaTokenValues(item, itemVerStr);
        item.canonicalName = tokenRes.canonicalBase + (item.ext || '.mp4');
        item.targetFolder = getTargetFolderForItem(item.subfolder);
        item.targetPath = (item.targetFolder + '/' + item.canonicalName).replace(/\\/g, '/');
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
        const singleTokens = getIaTokenValues(null, 'v001');
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

// --- AUTODETECCIÓN DE METADATA DE RESOLUCIÓN ---
function detectMediaDimensions(item) {
    return new Promise((resolve) => {
        if (!item) return resolve(null);
        let src = '';
        if (item.file) {
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
    const autoCheck = document.getElementById('iaAutoDetectResCheck');
    if (!autoCheck || !autoCheck.checked) return;

    if ((item.autoResDetected || item.isDetectingRes) && !force) return;
    item.isDetectingRes = true;

    try {
        const dims = await detectMediaDimensions(item);
        item.isDetectingRes = false;
        if (!dims || !dims.width || !dims.height) return;

        const resSelect = document.getElementById('tokResSelect');
        const resCustomInput = document.getElementById('tokResCustom');
        if (!resSelect) return;

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
        else {
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

        if (matchedVal) {
            let optExists = Array.from(resSelect.options).some(o => o.value === matchedVal);
            if (!optExists) {
                const newOpt = document.createElement('option');
                newOpt.value = matchedVal;
                newOpt.innerText = `${matchedVal} (${dimStr})`;
                resSelect.appendChild(newOpt);
            }
            resSelect.value = matchedVal;
            if (resCustomInput) resCustomInput.style.display = 'none';
        } else {
            const isSimple = window.iaWorkMode === 'simple';
            if (isSimple) {
                let optExists = Array.from(resSelect.options).some(o => o.value === dimStr);
                if (!optExists) {
                    const newOpt = document.createElement('option');
                    newOpt.value = dimStr;
                    newOpt.innerText = dimStr;
                    resSelect.appendChild(newOpt);
                }
                resSelect.value = dimStr;
                if (resCustomInput) resCustomInput.style.display = 'none';
            } else {
                resSelect.value = 'custom';
                if (resCustomInput) {
                    resCustomInput.style.display = 'block';
                    resCustomInput.value = dimStr;
                }
            }
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

function updateIaMediaPreview(activeItem) {
    const placeholder = document.getElementById('iaMediaPlaceholder');
    const imgEl = document.getElementById('iaImagePreview');
    const videoEl = document.getElementById('iaVideoPreview');

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
        return;
    }

    let previewUrl = '';
    if (activeItem.file) {
        try {
            previewUrl = URL.createObjectURL(activeItem.file);
        } catch(e) {
            console.error("Object URL error", e);
        }
    } else if (activeItem.destination) {
        previewUrl = `/api/ia/file-preview?path=${encodeURIComponent(activeItem.destination)}`;
    } else if (activeItem.targetPath) {
        previewUrl = `/api/ia/file-preview?path=${encodeURIComponent(activeItem.targetPath)}`;
    } else if (activeItem.originalPath && (activeItem.originalPath.includes(':') || activeItem.originalPath.startsWith('/') || activeItem.originalPath.startsWith('\\\\'))) {
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
        if (typeof videoEl.pause === 'function') videoEl.pause();
        imgEl.style.display = 'block';
        imgEl.src = previewUrl;
    } else {
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
            const isImg = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext.toLowerCase());
            const itemMotor = isImg ? defaultImgMotor : defaultVidMotor;

            const newItem = {
                id: 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                file: file,
                originalName: file.name,
                originalPath: originalPath,
                ext: ext,
                subfolder: initialSubfolder,
                motor: itemMotor,
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

    // Sincronizar selectores del builder con el elemento seleccionado
    if (iaSelectedIds.size === 1) {
        const singleItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id));
        if (singleItem) {
            const subSelect = document.getElementById('iaSubfolderSelect');
            if (subSelect && singleItem.subfolder) singleItem.subfolder = singleItem.subfolder;

            const motorSel = document.getElementById('tokMotorSelect');
            if (motorSel && singleItem.motor && singleItem.motor !== 'custom') {
                motorSel.value = singleItem.motor;
            }
            const resSel = document.getElementById('tokResSelect');
            if (resSel && singleItem.autoResTag && singleItem.autoResTag !== 'custom') {
                resSel.value = singleItem.autoResTag;
            }
        }
    }

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
    
    if (iaSelectedIds.size > 0) {
        iaBatchQueue.forEach(item => {
            if (iaSelectedIds.has(item.id)) {
                item.customMotor = chosen;
                item.motor = chosen;
            }
        });
    }
    updateIaPreview();
}

function handleIaMotorCustomChange(val) {
    const chosen = val.trim();
    if (iaSelectedIds.size > 0) {
        iaBatchQueue.forEach(item => {
            if (iaSelectedIds.has(item.id)) {
                item.customMotor = chosen;
                item.motor = chosen;
            }
        });
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
            
            if (item.file) {
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
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('ingest', ` ↳ [IA CANONICAL] 📄 ${item.name || item.originalName}  ➡️  ${item.canonicalName} (${item.motor || 'MOTOR'}, ${item.res || 'RES'}, ${item.framing || 'FRAMING'})`, 'ok');
                }
            } else {
                item.status = `❌ ${lastErr || 'Error'}`;
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('ingest', ` ↳ [IA ERROR] ❌ ${item.name || item.originalName}: ${lastErr || 'Error'}`, 'error');
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

    showIaAlert(`✓ Procesamiento por lote completado.`, "#4caf50");
    updateIaResolution(); // Recalcular siguiente versión base
}

// --- 8.5 WORK MODE SWITCHER (ADVANCED / SIMPLE) ---
window.iaWorkMode = 'advanced';

function switchIaWorkMode(mode) {
    window.iaWorkMode = mode;
    if (typeof updateHeaderTools === 'function') {
        updateHeaderTools('view-ia-ingest');
    }
    
    const isSimple = mode === 'simple';
    
    // 1. Target Context: Forzar Explorador y ocultar switcher de manual
    const modeBtnContainer = document.getElementById('iaModeGuidedBtn')?.parentElement;
    if (modeBtnContainer) modeBtnContainer.style.display = isSimple ? 'none' : 'flex';
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

    const motorCustom = document.getElementById('tokMotorCustom');
    if (motorCustom && isSimple) motorCustom.style.display = 'none';

    const resCustom = document.getElementById('tokResCustom');
    if (resCustom && isSimple) resCustom.style.display = 'none';

    const framingCustom = document.getElementById('tokFramingCustom');
    if (framingCustom && isSimple) framingCustom.style.display = 'none';

    ['tokTagACustom', 'tokTagBCustom', 'tokTagCCustom'].forEach(id => {
        const el = document.getElementById(id);
        if (el && isSimple) el.style.display = 'none';
    });

    const saveCustomContainer = document.getElementById('iaSaveCustomCheck')?.parentElement;
    if (saveCustomContainer) saveCustomContainer.style.display = isSimple ? 'none' : 'flex';

    populateIaTokenSelectsFromProject();

    if (isSimple) {
        // En Modo Simple, asegurar defaults de niveles B y C en vacío (Ninguno) y A según subcarpeta
        const tagB = document.getElementById('tokTagBLevel');
        if (tagB) tagB.value = '';
        const tagC = document.getElementById('tokTagCLevel');
        if (tagC) tagC.value = '';

        const isRefSubfolder = typeof iaActiveSubfolders !== 'undefined' && iaActiveSubfolders.has('ref');
        const tagA = document.getElementById('tokTagALevel');
        if (tagA) {
            tagA.value = isRefSubfolder ? 'ref' : '';
        }

        showIaAlert("⚡ Modo Simple activo (Flujo directo y simplificado)", "#03A9F4");
    } else {
        showIaAlert("🛠️ Modo Avanzado activo (Control total de tokens y lotes)", "#4caf50");
    }

    updateIaPreview();
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
                if (folderEl) folderEl.innerHTML = `Ruta autodetectada: <b style="color:var(--accent);">${escapeHtml(data.folder)}</b>`;
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
function initIaDropZone() {
    const dropZone = document.getElementById('iaDropZone');
    const iaView = document.getElementById('view-ia-ingest');
    if (!dropZone) return;

    // Prevenir comportamiento por defecto de arrastrar en la vista
    [dropZone, iaView].forEach(el => {
        if (!el) return;
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            el.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });
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

    dropZone.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#444';
        dropZone.style.background = '#111';
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
            handleIaFileSelect({ files: dt.files });
        } else if (dt) {
            const url = dt.getData('text/uri-list') || dt.getData('text/plain');
            if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/'))) {
                fetchWebOrDataUrlImage(url);
            }
        }
    };
}

function initIaIngest() {
    initIaResizer();
    initIaDropZone();
    loadCustomTokens();
    refreshIaHierarchy();
    updateIaResolution();
}

window.initIaIngest = initIaIngest;
window.initIaDropZone = initIaDropZone;
window.refreshIaHierarchy = refreshIaHierarchy;
window.setIaContextMode = setIaContextMode;
window.handleIaEpChange = handleIaEpChange;
window.handleIaSeqChange = handleIaSeqChange;
window.handleIaShotChange = handleIaShotChange;
window.iaToggleSubfolder = iaToggleSubfolder;
window.switchIaWorkMode = switchIaWorkMode;
window.populateIaTokenSelectsFromProject = populateIaTokenSelectsFromProject;

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
