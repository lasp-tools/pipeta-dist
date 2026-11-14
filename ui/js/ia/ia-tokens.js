// ----------------------------------------------------------
// --- IA INGEST [1/4]: SHARED STATE, CANONICAL TOKENS & NAME BUILDER ---
// ----------------------------------------------------------

let iaBatchQueue = [];
let iaSelectedIds = new Set();
let iaBaseVersionNum = 1;
let iaCurrentResolvedIaPath = '';

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
let iaActiveSubfolders = new Set(['wip']);
let iaLastSelectedIdx = -1;

window.iaExistingFiles = window.iaExistingFiles || [];
window.iaWorkMode = localStorage.getItem('pipeta_ia_work_mode') || 'simple';

const IA_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.exr', '.tif', '.tiff', '.tga', '.bmp', '.dpx']);
const IA_VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.wmv']);

function getIaMediaType(ext) {
    const clean = (ext || '').toLowerCase();
    if (IA_IMAGE_EXTS.has(clean)) return 'image';
    if (IA_VIDEO_EXTS.has(clean)) return 'video';
    return 'other';
}

function getIaVersionOptions() {
    const isSimple = (window.iaWorkMode === 'simple');
    if (isSimple) {
        return { split: true, skipFormat: true };
    }
    const splitEl = document.getElementById('iaVerSplitCheck');
    const skipEl = document.getElementById('iaVerSkipFormatCheck');
    const split = splitEl ? splitEl.checked : (localStorage.getItem('pipeta_ia_ver_split') !== 'false');
    const skipFormat = skipEl ? skipEl.checked : (localStorage.getItem('pipeta_ia_ver_skip_format') !== 'false');
    return { split, skipFormat };
}

function handleIaVerOptionChange(key, checked) {
    localStorage.setItem('pipeta_ia_ver_' + key, checked ? 'true' : 'false');
    updateIaPreview();
}

function initIaVersionOptionsUI() {
    const splitEl = document.getElementById('iaVerSplitCheck');
    const skipEl = document.getElementById('iaVerSkipFormatCheck');
    if (splitEl) splitEl.checked = (localStorage.getItem('pipeta_ia_ver_split') !== 'false');
    if (skipEl) skipEl.checked = (localStorage.getItem('pipeta_ia_ver_skip_format') !== 'false');
    const optsEl = document.getElementById('iaVerAdvancedOptions');
    if (optsEl) {
        optsEl.style.display = (window.iaWorkMode === 'simple') ? 'none' : 'flex';
    }
}

function toggleIaWorkMode() {
    const nextMode = (window.iaWorkMode === 'simple') ? 'advanced' : 'simple';
    if (typeof switchIaWorkMode === 'function') {
        switchIaWorkMode(nextMode);
    } else {
        window.iaWorkMode = nextMode;
        localStorage.setItem('pipeta_ia_work_mode', nextMode);
        if (typeof updateHeaderTools === 'function') updateHeaderTools('view-ia-ingest');
        initIaVersionOptionsUI();
        updateIaPreview();
    }
}

window.IaIngest = window.IaIngest || {
    get batchQueue() { return iaBatchQueue; },
    set batchQueue(v) { iaBatchQueue = v; },
    get selectedIds() { return iaSelectedIds; },
    get baseVersionNum() { return iaBaseVersionNum; },
    set baseVersionNum(v) { iaBaseVersionNum = v; },
    get currentResolvedIaPath() { return iaCurrentResolvedIaPath; },
    set currentResolvedIaPath(v) { iaCurrentResolvedIaPath = v; },
    get activeSubfolders() { return iaActiveSubfolders; }
};

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
        motorsVideo: ["SD2", "SD25", "VEO3", "VO31", "GOMN", "HFMC", "RUBY", "GEN45", "GEN4", "ALPH2", "TPZ"],
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
        ],
        modelKeywords: [
            { keyword: "GPT Image 2_5 Sunburst", model: "GPT25S" },
            { keyword: "Sunburst", model: "GPT25S" },
            { keyword: "GPT 2.5 Flare", model: "GPT25F" },
            { keyword: "Flare", model: "GPT25F" },
            { keyword: "Seedance 2_5", model: "SD25" },
            { keyword: "Seedance 2.5", model: "SD25" },
            { keyword: "Seedance 2_0", model: "SD2" },
            { keyword: "Seedance 2.0", model: "SD2" },
            { keyword: "Seedance Pro", model: "SD2" },
            { keyword: "Gen 4.5", model: "GEN45" },
            { keyword: "Gen 4_5", model: "GEN45" },
            { keyword: "Gen 4", model: "GEN4" },
            { keyword: "Ruby", model: "RUBY" },
            { keyword: "Aleph 2", model: "ALPH2" },
            { keyword: "Nano Banana 2.1", model: "NBN21" },
            { keyword: "Nano Banana 2", model: "NBN2" },
            { keyword: "Topaz", model: "TPZ" },
            { keyword: "Veo 3.1", model: "VO31" },
            { keyword: "Veo 3", model: "VEO3" },
            { keyword: "Flux", model: "FLUX" },
            { keyword: "Midjourney", model: "MJ" }
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
            motorsVideo: Array.isArray(proj.iaPresets.motorsVideo) ? proj.iaPresets.motorsVideo : (Array.isArray(baseIa.motorsVideo) ? baseIa.motorsVideo : canonFallback.motorsVideo),
            motorsImage: Array.isArray(proj.iaPresets.motorsImage) ? proj.iaPresets.motorsImage : (Array.isArray(baseIa.motorsImage) ? baseIa.motorsImage : canonFallback.motorsImage),
            framings: Array.isArray(proj.iaPresets.framings) && proj.iaPresets.framings.length > 0 ? proj.iaPresets.framings : baseIa.framings,
            tagsA: Array.isArray(proj.iaPresets.tagsA) && proj.iaPresets.tagsA.length > 0 ? proj.iaPresets.tagsA : baseIa.tagsA,
            tagsB: Array.isArray(proj.iaPresets.tagsB) && proj.iaPresets.tagsB.length > 0 ? proj.iaPresets.tagsB : baseIa.tagsB,
            tagsC: Array.isArray(proj.iaPresets.tagsC) && proj.iaPresets.tagsC.length > 0 ? proj.iaPresets.tagsC : baseIa.tagsC,
            resolutionTranslations: Array.isArray(proj.iaPresets.resolutionTranslations) && proj.iaPresets.resolutionTranslations.length > 0 ? proj.iaPresets.resolutionTranslations : (baseIa.resolutionTranslations || canonFallback.resolutionTranslations),
            modelKeywords: Array.isArray(proj.iaPresets.modelKeywords) && proj.iaPresets.modelKeywords.length > 0 ? proj.iaPresets.modelKeywords : (Array.isArray(baseIa.modelKeywords) && baseIa.modelKeywords.length > 0 ? baseIa.modelKeywords : canonFallback.modelKeywords)
        };
    }

    return {
        defaultImageEngine: baseIa.defaultImageEngine || "NB2P",
        defaultVideoEngine: baseIa.defaultVideoEngine || "SD2",
        defaultFraming: baseIa.defaultFraming || "FLL",
        defaultTagRoleA: typeof baseIa.defaultTagRoleA !== 'undefined' ? baseIa.defaultTagRoleA : "start1001",
        defaultTagRoleB: typeof baseIa.defaultTagRoleB !== 'undefined' ? baseIa.defaultTagRoleB : "inp",
        defaultTagRoleC: typeof baseIa.defaultTagRoleC !== 'undefined' ? baseIa.defaultTagRoleC : "i2v",
        motorsVideo: Array.isArray(baseIa.motorsVideo) ? baseIa.motorsVideo : canonFallback.motorsVideo,
        motorsImage: Array.isArray(baseIa.motorsImage) ? baseIa.motorsImage : canonFallback.motorsImage,
        framings: baseIa.framings || ["FLL", "CRP"],
        tagsA: baseIa.tagsA || ["start1001", "end1100", "f1001", "ref", "ref1050"],
        tagsB: baseIa.tagsB || ["inp", "ups", "mask", "clean", "elem"],
        tagsC: baseIa.tagsC || ["i2v", "t2i", "i2i", "t2v", "v2v", "m2v"],
        resolutionTranslations: baseIa.resolutionTranslations || canonFallback.resolutionTranslations,
        modelKeywords: Array.isArray(baseIa.modelKeywords) && baseIa.modelKeywords.length > 0 ? baseIa.modelKeywords : canonFallback.modelKeywords
    };
}

function detectIaModelFromFilename(filename, originalPath = '') {
    const effective = getEffectiveIaPresets();
    const rules = effective.modelKeywords || [];
    const targetText = ((filename || '') + ' ' + (originalPath || '')).toLowerCase();
    const normalizedText = targetText.replace(/[-_.]/g, ' ');
    const strippedText = normalizedText.replace(/\s+/g, '');

    for (const rule of rules) {
        if (!rule.keyword || !rule.model) continue;
        const kw = rule.keyword.trim().toLowerCase();
        if (!kw) continue;
        const normKw = kw.replace(/[-_.]/g, ' ');
        if (targetText.includes(kw) || normalizedText.includes(normKw)) {
            return rule.model.trim();
        }
        const strippedKw = normKw.replace(/\s+/g, '');
        if (strippedKw.length >= 3 && strippedText.includes(strippedKw)) {
            return rule.model.trim();
        }
    }
    return null;
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
            html += `<optgroup label="Modelos de Video">` + vList.map(m => `<option value="${m}">${m}</option>`).join('') + `</optgroup>`;
        }
        if (iList.length > 0) {
            html += `<optgroup label="Modelos de Imagen">` + iList.map(m => `<option value="${m}">${m}</option>`).join('') + `</optgroup>`;
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
            if (item.detectedModel) {
                motor = item.detectedModel;
            } else {
                const ext = (item.ext || '').toLowerCase();
                const isImg = getIaMediaType(ext) === 'image';
                motor = isImg ? defaultImgMotor : defaultVidMotor;
            }
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

function updateIaPreview() {
    let selectedSubfolder = 'root';
    if (iaActiveSubfolders.has('wip')) selectedSubfolder = 'root';
    else if (iaActiveSubfolders.has('ref')) selectedSubfolder = 'ref';
    else if (iaActiveSubfolders.has('export')) selectedSubfolder = 'export';

    const verInputVal = document.getElementById('tokVerInput')?.value.trim() || 'v001';
    const matchVer = verInputVal.match(/v(\d+)/i);
    const startNum = matchVer ? parseInt(matchVer[1], 10) : (iaBaseVersionNum || 1);

    const { split: optSplit, skipFormat: optSkipFormat } = getIaVersionOptions();

    // Conjuntos de tracking para la tanda actual:
    // 1. assignedExactPaths: rutas completas exactas (con extensión)
    // 2. assignedGroupKeys: asignaciones lógicas para evitar colisiones entre formatos o agrupar por tipo
    const assignedExactPaths = new Set();
    const assignedGroupKeys = new Set();

    // Helper de colisión contra disco y cola activa
    const checkFileCollision = (targetFolder, subfolderKey, prefixBase, candidateVerNum, ext, mediaType) => {
        const verStr = '_v' + String(candidateVerNum).padStart(3, '0');
        const candidateFilename = prefixBase + verStr + ext;
        const lowerName = candidateFilename.toLowerCase();
        const fullBatchKey = (targetFolder + '/' + lowerName).replace(/\\/g, '/').toLowerCase();

        // 1. Colisión exacta contra la tanda
        if (assignedExactPaths.has(fullBatchKey)) return true;

        // 2. Colisión agrupada en la tanda (Skip Format y/o Split)
        if (optSkipFormat) {
            const groupTag = optSplit ? mediaType : 'any';
            const groupKey = (targetFolder + '/' + prefixBase.toLowerCase() + verStr.toLowerCase() + '::' + groupTag).replace(/\\/g, '/');
            if (assignedGroupKeys.has(groupKey)) return true;
        }

        // 3. Colisión contra archivos existentes en disco
        if (window.iaExistingFiles && window.iaExistingFiles.length > 0) {
            const candBaseWithVer = (prefixBase + verStr).toLowerCase();
            const candExt = ext.toLowerCase();

            const match = window.iaExistingFiles.some(f => {
                if (!f.name) return false;
                const fSub = (f.subfolder || 'root').toLowerCase();
                const itemSub = (subfolderKey || 'root').toLowerCase();
                const normFSub = (fSub === 'wip' || fSub === 'root') ? 'root' : fSub;
                const normItemSub = (itemSub === 'wip' || itemSub === 'root') ? 'root' : itemSub;
                if (normFSub !== normItemSub) return false;

                const lastDot = f.name.lastIndexOf('.');
                const fExt = (lastDot !== -1 ? f.name.substring(lastDot) : '').toLowerCase();
                const fBase = (lastDot !== -1 ? f.name.substring(0, lastDot) : f.name).toLowerCase();

                if (fBase !== candBaseWithVer) return false;

                // fBase coincide con prefixBase + _vXXX
                const fMediaType = getIaMediaType(fExt);

                if (optSplit) {
                    // Si Split está encendido, solo colisiona si es del mismo grupo (imagen con imagen, video con video)
                    if (fMediaType !== mediaType) return false;
                }

                if (optSkipFormat) {
                    // Si Skip Format está encendido, colisiona sin importar la extensión
                    return true;
                } else {
                    // Si Skip Format está apagado, solo colisiona si la extensión exacta coincide
                    return fExt === candExt;
                }
            });
            if (match) return true;
        }
        return false;
    };

    iaBatchQueue.forEach((item) => {
        item.subfolder = selectedSubfolder;
        item.targetFolder = getTargetFolderForItem(item.subfolder);
        const ext = item.ext || '.mp4';
        const itemMediaType = getIaMediaType(ext);

        // Obtener tokens base sin versión
        const baseRes = getIaTokenValues(item, 'v000');
        const prefixBase = baseRes.prefixBase;

        let finalVerNum;
        let isCollision = false;

        if (item.version) {
            // Override manual de versión fijado en este ítem
            const match = item.version.match(/v?(\d+)/i);
            finalVerNum = match ? parseInt(match[1], 10) : startNum;
            isCollision = checkFileCollision(item.targetFolder, item.subfolder, prefixBase, finalVerNum, ext, itemMediaType);
        } else {
            // Auto-resolución de versión: detectar si ya existe un archivo idéntico en disco y continuar a partir de ahí
            let candidateNum = startNum;

            while (checkFileCollision(item.targetFolder, item.subfolder, prefixBase, candidateNum, ext, itemMediaType)) {
                candidateNum++;
            }

            finalVerNum = candidateNum;
        }

        const itemVerStr = 'v' + String(finalVerNum).padStart(3, '0');
        item.canonicalVer = itemVerStr;
        const tokenRes = getIaTokenValues(item, itemVerStr);
        item.canonicalName = tokenRes.canonicalBase + ext;
        item.targetPath = (item.targetFolder + '/' + item.canonicalName).replace(/\\/g, '/');
        item.hasCollision = isCollision;

        // Registrar en los sets de la tanda
        assignedExactPaths.add(item.targetPath.toLowerCase());
        const groupTag = optSplit ? itemMediaType : 'any';
        const verStr = '_v' + String(finalVerNum).padStart(3, '0');
        const groupKey = (item.targetFolder + '/' + prefixBase.toLowerCase() + verStr.toLowerCase() + '::' + groupTag).replace(/\\/g, '/');
        assignedGroupKeys.add(groupKey);
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
        while (checkFileCollision(defaultFolder, selectedSubfolder, testBase, singleVerNum, '.mp4', 'video')) {
            singleVerNum++;
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

function syncBuilderControlsWithSelection() {
    const noticeEl = document.getElementById('iaMultiSelectNotice');
    const activeItem = iaBatchQueue.find(i => iaSelectedIds.has(i.id)) || (iaBatchQueue.length > 0 ? iaBatchQueue[0] : null);

    if (activeItem) {
        if (iaSelectedIds.size > 1) {
            if (noticeEl) noticeEl.innerText = `(${iaSelectedIds.size} ítems · ${activeItem.originalName})`;
        } else {
            if (noticeEl) noticeEl.innerText = `(${activeItem.originalName})`;
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
                        const localBaseDir = window.PIPETA_LOCAL_APP_DIR || (window.IS_BETA_CHANNEL ? "C:\\TOOLS\\APPS\\Pipeta_Beta" : "C:\\TOOLS\\APPS\\Pipeta");
                        const filePath = (settings.projectsPath || (localBaseDir + "\\presets\\Projects")) + "\\base.json";
                        await API.fs.writeFile(filePath, JSON.stringify(baseProj, null, 2));
                    }
                    populateIaTokenSelectsFromProject();
                    showIaAlert("🛠️ Dev Mode: Tokens manuales incorporados al Proyecto Base local", "#ff9800");
                }
            }
        }
    }
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

// Global Window Exports (Tokens & Name Builder)
window.populateIaTokenSelectsFromProject = populateIaTokenSelectsFromProject;
window.toggleIaTokenModule = toggleIaTokenModule;
window.updateIaTokenModuleUI = updateIaTokenModuleUI;
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
window.stepIaVersion = stepIaVersion;
window.handleIaVerInput = handleIaVerInput;
window.handleIaVerInputChange = handleIaVerInputChange;
window.handleIaVerOptionChange = handleIaVerOptionChange;
window.getIaVersionOptions = getIaVersionOptions;
window.getIaMediaType = getIaMediaType;
window.initIaVersionOptionsUI = initIaVersionOptionsUI;
window.toggleIaWorkMode = toggleIaWorkMode;
window.detectIaModelFromFilename = detectIaModelFromFilename;
