const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Carpeta estándar centralizada para los catálogos en local SSD (y fallback Z:\_SYNC_CACHE si está montado)
const LOCAL_CACHE_DIR = path.join(__dirname, '../_SYNC_CACHE');
const MODULAR_PROJECTS_DIR = path.join(LOCAL_CACHE_DIR, 'projects');
const UNC_CACHE = '//192.168.206.116/Z/_SYNC_CACHE';
const CENTRAL_SERVER_URL = process.env.PIPETA_SERVER_API || 'http://192.168.206.121:3005';
const PIPETA_SERVER_TOKEN = 'lasp-pipeta-sec-token-2026';

function getCentralServerUrls() {
    const urls = [];
    if (!global.isExternalMachine) {
        urls.push(CENTRAL_SERVER_URL.replace(/\/+$/, ''));
        if (process.env.PIPETA_SERVER_URL) {
            urls.push(process.env.PIPETA_SERVER_URL.replace(/\/+$/, ''));
        }
        return [...new Set(urls)];
    }
    if (process.env.PIPETA_SERVER_URL) {
        urls.push(process.env.PIPETA_SERVER_URL.replace(/\/+$/, ''));
    }
    urls.push('https://pipeta.lasp.co');
    return [...new Set(urls)];
}

const missingSubCatalogCache = new Map();
const manifestFreshnessCache = new Map();
const MISSING_SUBCATALOG_TTL = 60000;

function resolveCanonicalProjectName(projectName) {
    if (!projectName) return '';
    const stripped = String(projectName).replace(/^proj_/i, '').trim();
    try {
        if (typeof getProjectConfig === 'function') {
            const cfg = getProjectConfig(projectName) || getProjectConfig(stripped);
            if (cfg && cfg.name) return cfg.name;
        }
    } catch (e) {}
    return stripped || String(projectName).trim();
}

/**
 * Descarga y extrae el paquete modular completo (.tar.gz) de un proyecto desde Pipeta Server (0 SMB)
 */
function fetchProjectBundleFromCentralServer(projectName) {
    if (!projectName) return false;
    const stripped = String(projectName).replace(/^proj_/i, '').trim();
    const namesToTry = [];
    try {
        if (typeof getProjectConfig === 'function') {
            const cfg = getProjectConfig(projectName) || getProjectConfig(stripped);
            if (cfg) {
                if (cfg.name && !namesToTry.includes(cfg.name)) namesToTry.push(cfg.name);
                if (cfg.projectCode && !namesToTry.includes(cfg.projectCode)) namesToTry.push(cfg.projectCode);
            }
        }
    } catch(e) {}
    if (stripped && !namesToTry.includes(stripped)) namesToTry.push(stripped);
    if (!namesToTry.includes(projectName)) namesToTry.push(projectName);

    const serverUrls = getCentralServerUrls();
    for (const name of namesToTry) {
        if (/^\d+$/.test(name)) continue;
        const destDir = path.join(MODULAR_PROJECTS_DIR, name);
        for (const baseUrl of serverUrls) {
            try {
                fs.ensureDirSync(destDir);
                const tmpTar = path.join(os.tmpdir(), `pipeta_cat_${name}_${Date.now()}.tar.gz`);
                const url = `${baseUrl}/api/sync/catalog/${encodeURIComponent(name)}/bundle`;
                const curlCmd = `curl.exe -s -f -m 8 -H "x-pipeta-token: ${PIPETA_SERVER_TOKEN}" -o "${tmpTar}" "${url}"`;
                execSync(curlCmd, { stdio: 'ignore', timeout: 9000, windowsHide: true });
                if (fs.existsSync(tmpTar) && fs.statSync(tmpTar).size > 40) {
                    execSync(`tar.exe -xzf "${tmpTar}" -C "${destDir}"`, { stdio: 'ignore', timeout: 9000, windowsHide: true });
                    try { fs.removeSync(tmpTar); } catch(e) {}
                    if (global.isExternalMachine) {
                        try { fs.removeSync(path.join(destDir, 'server')); } catch(e) {}
                    }
                    const serverManifest = path.join(destDir, 'server', 'manifest.json');
                    const driveManifest = path.join(destDir, 'drive', 'manifest.json');
                    if (fs.existsSync(driveManifest) || (!global.isExternalMachine && fs.existsSync(serverManifest))) {
                        console.log(`[CENTRAL SERVER HTTP] Catálogo de ${name} hidratado por HTTP desde ${baseUrl} en ${destDir}`);
                        return true;
                    }
                } else {
                    try { fs.removeSync(tmpTar); } catch(e) {}
                }
            } catch (e) {}
        }
    }
    return false;
}

/**
 * Descarga un archivo específico (manifest.json o sub-catálogo) directamente por HTTP (0 SMB)
 */
function fetchSubCatalogFromCentralServer(projectName, type, subFile) {
    if (!projectName) return null;
    if (type === 'server' && global.isExternalMachine) return null;
    const canonProj = resolveCanonicalProjectName(projectName);
    if (!canonProj || /^\d+$/.test(canonProj)) return null;

    const missKey = `${canonProj}::${type}::${subFile.replace(/\\/g, '/')}`.toLowerCase();
    const lastMiss = missingSubCatalogCache.get(missKey) || 0;
    if (Date.now() - lastMiss < MISSING_SUBCATALOG_TTL) {
        return null;
    }

    const stripped = String(projectName).replace(/^proj_/i, '').trim();
    const namesToTry = [canonProj];
    try {
        if (typeof getProjectConfig === 'function') {
            const cfg = getProjectConfig(projectName) || getProjectConfig(stripped);
            if (cfg && cfg.projectCode && !namesToTry.includes(cfg.projectCode)) {
                namesToTry.push(cfg.projectCode);
            }
        }
    } catch(e) {}

    const subKey = subFile.replace(/\\/g, '/').replace(/\.json$/i, '');
    const serverUrls = getCentralServerUrls();
    const curlMaxSec = global.isExternalMachine ? 8 : 3;
    let gotDefinitive404OnCanonical = false;

    for (const name of namesToTry) {
        if (/^\d+$/.test(name)) continue;
        if (gotDefinitive404OnCanonical && name !== canonProj) break;
        const localPrimary = path.join(MODULAR_PROJECTS_DIR, canonProj, type, subFile);
        const tmpOut = `${localPrimary}.tmp_${process.pid}`;
        for (const baseUrl of serverUrls) {
            try {
                fs.ensureDirSync(path.dirname(localPrimary));
                const url = `${baseUrl}/api/sync/catalog/${encodeURIComponent(name)}/modular?type=${type}&sub=${encodeURIComponent(subKey)}`;
                const cmd = `curl.exe -s -m ${curlMaxSec} -w "%{http_code}" -H "x-pipeta-token: ${PIPETA_SERVER_TOKEN}" -o "${tmpOut}" "${url}"`;
                const httpCode = String(execSync(cmd, { encoding: 'utf8', timeout: (curlMaxSec + 1) * 1000, windowsHide: true }) || '').trim();
                if (httpCode === '200' && fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 10) {
                    const headBuf = Buffer.alloc(16);
                    const fd = fs.openSync(tmpOut, 'r');
                    try { fs.readSync(fd, headBuf, 0, 16, 0); } finally { fs.closeSync(fd); }
                    const firstChar = headBuf.toString('utf8').trim()[0];
                    if (firstChar === '{') {
                        fs.moveSync(tmpOut, localPrimary, { overwrite: true });
                        missingSubCatalogCache.delete(missKey);
                        return localPrimary;
                    }
                }
                try { if (fs.existsSync(tmpOut)) fs.removeSync(tmpOut); } catch (e) {}
                if (httpCode === '404') {
                    if (name === canonProj) gotDefinitive404OnCanonical = true;
                    break;
                }
            } catch (e) {
                try { if (fs.existsSync(tmpOut)) fs.removeSync(tmpOut); } catch (rmErr) {}
            }
        }
    }

    missingSubCatalogCache.set(missKey, Date.now());
    return null;
}
let _isZDriveNetworkCache = null;
function isZDriveNetwork() {
    if (_isZDriveNetworkCache !== null) return _isZDriveNetworkCache;
    if (global.isExternalMachine || !fs.existsSync('Z:\\')) {
        _isZDriveNetworkCache = false;
        return false;
    }
    try {
        const substOut = execSync('subst', { encoding: 'utf8', timeout: 800, windowsHide: true });
        if (/Z:\: =>/i.test(substOut)) {
            _isZDriveNetworkCache = false;
            return false;
        }
    } catch(e) {}
    try {
        const netUse = execSync('net use Z:', { encoding: 'utf8', timeout: 800, windowsHide: true });
        if (netUse && !/no se encuentra|error/i.test(netUse)) {
            _isZDriveNetworkCache = true;
            return true;
        }
    } catch(e) {}
    _isZDriveNetworkCache = false;
    return false;
}

const CACHE_ROOT = fs.existsSync(LOCAL_CACHE_DIR) 
    ? LOCAL_CACHE_DIR 
    : (fs.existsSync('Z:/_SYNC_CACHE') ? 'Z:/_SYNC_CACHE' : LOCAL_CACHE_DIR);

/**
 * Sincroniza los catálogos JSON desde la red/servidor (Z:/_SYNC_CACHE o UNC)
 * al disco local SSD de la máquina (C:/.../_SYNC_CACHE).
 * Esto permite leer instantáneamente desde el SSD local sin sobrecargar la red SMB.
 */
function syncLocalCacheFromNetwork(projectName = null) {
    if (global.isExternalMachine) {
        if (projectName) {
            try {
                fs.ensureDirSync(LOCAL_CACHE_DIR);
                const cfg = typeof getProjectConfig === 'function' ? getProjectConfig(projectName) : null;
                const cleanP = (cfg && cfg.name) ? cfg.name : String(projectName).replace(/^proj_/i, '').trim();
                if (cleanP && !/^\d+$/.test(cleanP)) {
                    const localProjDir = path.join(MODULAR_PROJECTS_DIR, cleanP);
                    if (!fs.existsSync(path.join(localProjDir, 'drive', 'manifest.json'))) {
                        fetchProjectBundleFromCentralServer(cleanP);
                    }
                }
            } catch(e) {}
        }
        return;
    }
    try {
        fs.ensureDirSync(LOCAL_CACHE_DIR);

        // 0. Si se solicita un proyecto y aún no existe localmente, hidratar el paquete inicial por HTTP desde Pipeta Server
        if (projectName) {
            const cleanP = String(projectName).replace(/^proj_/i, '').trim();
            const localProjDir = path.join(MODULAR_PROJECTS_DIR, cleanP);
            if (!fs.existsSync(path.join(localProjDir, 'drive', 'manifest.json'))) {
                fetchProjectBundleFromCentralServer(projectName);
            }
        }

        

function isZDriveLocalSubst() {
            try {
                const substOut = execSync('subst', { encoding: 'utf8', timeout: 500, windowsHide: true });
                return /Z:\\: =>/i.test(substOut);
            } catch (e) { return false; }
        }

        const isSubst = isZDriveLocalSubst();
        const candidateRoots = [];
        if (!isSubst && fs.existsSync('Z:/_SYNC_CACHE')) {
            candidateRoots.push('Z:/_SYNC_CACHE');
        } else {
            if (isSubst && fs.existsSync('Z:/_SYNC_CACHE')) {
                try {
                    const zSt = path.join('Z:/_SYNC_CACHE', 'worker_status.json');
                    if (fs.existsSync(zSt)) {
                        const stData = fs.readJsonSync(zSt);
                        const diff = (Date.now() - new Date(stData.lastPing).getTime()) / 1000;
                        if (diff < 45) candidateRoots.push('Z:/_SYNC_CACHE');
                    }
                } catch(e) {}
            }
            candidateRoots.push(UNC_CACHE);
        }

        const centralRoots = candidateRoots.filter((r, idx, arr) => {
            try {
                return fs.existsSync(r) && path.resolve(r).toLowerCase() !== path.resolve(LOCAL_CACHE_DIR).toLowerCase() && arr.indexOf(r) === idx;
            } catch (e) { return false; }
        });

        function copyNewerOnly(src, dst) {
            if (!fs.existsSync(src)) return;
            const srcStat = fs.statSync(src);
            if (srcStat.isDirectory()) {
                fs.ensureDirSync(dst);
                const items = fs.readdirSync(src);
                for (const it of items) {
                    copyNewerOnly(path.join(src, it), path.join(dst, it));
                }
            } else {
                let needsCopy = true;
                if (fs.existsSync(dst)) {
                    try {
                        const dstStat = fs.statSync(dst);
                        needsCopy = srcStat.mtimeMs > dstStat.mtimeMs + 500;
                    } catch (e) { needsCopy = true; }
                }
                if (needsCopy) {
                    try {
                        fs.copySync(src, dst, { overwrite: true });
                    } catch (e) {}
                }
            }
        }

        const centralRoot = centralRoots[0];
        if (centralRoot) {
            const controlFiles = ['worker_status.json', 'last_project.json'];
            for (const f of controlFiles) {
                copyNewerOnly(path.join(centralRoot, f), path.join(LOCAL_CACHE_DIR, f));
            }

            const centralProjects = path.join(centralRoot, 'projects');
            const localProjects = path.join(LOCAL_CACHE_DIR, 'projects');
            if (projectName && fs.existsSync(centralProjects)) {
                fs.ensureDirSync(localProjects);
                const canonName = resolveCanonicalProjectName(projectName);
                const cfg = typeof getProjectConfig === 'function' ? getProjectConfig(canonName) : null;
                const candidates = [canonName];
                if (cfg && cfg.projectCode && !candidates.includes(cfg.projectCode)) {
                    candidates.push(cfg.projectCode);
                }
                for (const srcName of candidates) {
                    const srcProjDir = path.join(centralProjects, srcName);
                    if (fs.existsSync(srcProjDir)) {
                        copyNewerOnly(srcProjDir, path.join(localProjects, canonName));
                        break;
                    }
                }
            }
        }
    } catch (err) {
        console.warn(`[LOCAL CACHE] Advertencia sincronizando caché local:`, err.message);
    }
}

let _asyncCacheSyncInFlight = null;
async function syncLocalCacheFromNetworkAsync(projectName = null) {
    if (_asyncCacheSyncInFlight) return _asyncCacheSyncInFlight;
    _asyncCacheSyncInFlight = (async () => {
        try {
            await fs.ensureDir(LOCAL_CACHE_DIR);
            if (global.isExternalMachine) {
                if (projectName) {
                    const canon = resolveCanonicalProjectName(projectName);
                    if (canon && !/^\d+$/.test(canon)) {
                        const manFile = path.join(MODULAR_PROJECTS_DIR, canon, 'drive', 'manifest.json');
                        if (!(await fs.pathExists(manFile))) {
                            fetchProjectBundleFromCentralServer(canon);
                        }
                    }
                }
                return;
            }

            const isSubst = !_isZDriveNetworkCache && !isZDriveNetwork();
            let centralRoot = null;
            if (!isSubst && await fs.pathExists('Z:/_SYNC_CACHE')) {
                centralRoot = 'Z:/_SYNC_CACHE';
            } else if (await fs.pathExists(UNC_CACHE)) {
                centralRoot = UNC_CACHE;
            }
            if (!centralRoot || path.resolve(centralRoot).toLowerCase() === path.resolve(LOCAL_CACHE_DIR).toLowerCase()) {
                return;
            }

            async function copyNewerAsync(src, dst) {
                if (!(await fs.pathExists(src))) return;
                const srcStat = await fs.stat(src);
                if (srcStat.isDirectory()) {
                    await fs.ensureDir(dst);
                    const items = await fs.readdir(src);
                    for (const it of items) {
                        await new Promise(r => setImmediate(r));
                        await copyNewerAsync(path.join(src, it), path.join(dst, it));
                    }
                } else {
                    let needsCopy = true;
                    if (await fs.pathExists(dst)) {
                        try {
                            const dstStat = await fs.stat(dst);
                            needsCopy = srcStat.mtimeMs > dstStat.mtimeMs + 500;
                        } catch (e) { needsCopy = true; }
                    }
                    if (needsCopy) {
                        try { await fs.copy(src, dst, { overwrite: true }); } catch (e) {}
                    }
                }
            }

            for (const f of ['worker_status.json', 'last_project.json']) {
                await copyNewerAsync(path.join(centralRoot, f), path.join(LOCAL_CACHE_DIR, f));
            }

            if (projectName) {
                const canonName = resolveCanonicalProjectName(projectName);
                const centralProjects = path.join(centralRoot, 'projects');
                if (canonName && await fs.pathExists(centralProjects)) {
                    const srcProjDir = path.join(centralProjects, canonName);
                    if (await fs.pathExists(srcProjDir)) {
                        await copyNewerAsync(srcProjDir, path.join(MODULAR_PROJECTS_DIR, canonName));
                    }
                }
            }
        } catch (err) {
            console.warn('[LOCAL CACHE ASYNC] Advertencia:', err.message);
        } finally {
            _asyncCacheSyncInFlight = null;
        }
    })();
    return _asyncCacheSyncInFlight;
}
const PRESETS_PROJECTS_DIR = path.join(__dirname, '../presets/Projects');
function getRcloneExe() {
    const candidates = [
        path.join(__dirname, '../tools/rclone/rclone.exe'),
        'C:/TOOLS/APPS/Pipeta/tools/rclone/rclone.exe',
        'Z:/INTERNO/TOOLS/Instaladores/rclone/rclone.exe',
        'C:/Program Files/rclone/rclone.exe'
    ];
    for (const c of candidates) {
        if (c && fs.existsSync(c)) return c.replace(/\\/g, '/');
    }
    return 'rclone';
}

function getRcloneConf() {
    const candidates = [
        path.join(__dirname, '../tools/rclone/rclone.conf'),
        'C:/TOOLS/APPS/Pipeta/tools/rclone/rclone.conf',
        'Z:/INTERNO/TOOLS/Instaladores/rclone.conf',
        '//192.168.206.116/Z/INTERNO/TOOLS/Instaladores/rclone.conf',
        path.join(process.env.APPDATA || '', 'rclone/rclone.conf'),
        path.join(os.homedir(), '.config/rclone/rclone.conf'),
        path.join(os.homedir(), 'rclone.conf')
    ];
    for (const c of candidates) {
        if (c && fs.existsSync(c)) return c.replace(/\\/g, '/');
    }
    return null;
}

const RCLONE_EXE = getRcloneExe();
const RCLONE_CONF = getRcloneConf();

let teamDrivesCache = null;

/**
 * Obtiene el mapa de Unidades Compartidas de Google Drive { nombre: id }
 */
function getTeamDrivesMap() {
    if (teamDrivesCache) return teamDrivesCache;
    if (!fs.existsSync(RCLONE_EXE) || !RCLONE_CONF) return {};

    try {
        console.log(`[CATALOG] Consultando lista de Team Drives en Google Drive...`);
        const cmd = `"${RCLONE_EXE}" --config "${RCLONE_CONF}" backend drives "lasp-drive:"`;
        const stdout = execSync(cmd, { maxBuffer: 1024 * 1024 * 10, encoding: 'utf-8', timeout: 20000, windowsHide: true });
        const list = JSON.parse(stdout);
        teamDrivesCache = {};
        for (const drive of list) {
            teamDrivesCache[drive.name.toLowerCase()] = drive.id;
        }
        return teamDrivesCache;
    } catch (e) {
        console.warn(`[CATALOG] Advertencia al listar Team Drives de rclone:`, e.message);
        return {};
    }
}

/**
 * Normaliza rutas a barras normales (slash '/')
 */
function normalizeSlash(p) {
    if (!p) return '';
    return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Carga la configuración del proyecto desde presets/Projects/<projectName>.json
 */
function getProjectConfig(projectName) {
    if (!projectName) return null;
    const cleanName = String(projectName).trim();
    const jsonPath = path.join(PRESETS_PROJECTS_DIR, `${cleanName}.json`);
    if (fs.existsSync(jsonPath)) {
        try {
            return fs.readJsonSync(jsonPath);
        } catch (e) {
            console.warn(`[CATALOG] Error leyendo preset ${jsonPath}:`, e.message);
        }
    }

    // Búsqueda inteligente por name, projectCode o id si el nombre difiere del archivo
    try {
        if (fs.existsSync(PRESETS_PROJECTS_DIR)) {
            const files = fs.readdirSync(PRESETS_PROJECTS_DIR).filter(f => f.endsWith('.json') && f !== 'base.json');
            for (const file of files) {
                try {
                    const p = path.join(PRESETS_PROJECTS_DIR, file);
                    const data = fs.readJsonSync(p);
                    if (
                        (data.name && data.name.toLowerCase() === cleanName.toLowerCase()) ||
                        (data.projectCode && data.projectCode.toLowerCase() === cleanName.toLowerCase()) ||
                        (data.id && data.id.toLowerCase() === cleanName.toLowerCase()) ||
                        path.basename(file, '.json').toLowerCase() === cleanName.toLowerCase()
                    ) {
                        return data;
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}

    // Fallback canónico para surf_love si no existiera el preset físico
    if (cleanName.toLowerCase() === 'surf_love') {
        return {
            id: 'proj_surf_love',
            name: 'surf_love',
            client: 'atresmedia',
            projectCode: 'surf_love',
            roots: {
                work: 'Z:/atresmedia/surf_love',
                media: 'Z:/INTERNO/MEDIA/atresmedia/surf_love',
                onlineWork: 'G:/Unidades compartidas/surf_love',
                onlineMedia: 'G:/Unidades compartidas/surf_love_media'
            }
        };
    }

    return null;
}

/**
 * Retorna todos los nombres de proyectos activos configurados
 */
function getAllProjectNames() {
    const names = new Set();
    try {
        if (fs.existsSync(PRESETS_PROJECTS_DIR)) {
            const files = fs.readdirSync(PRESETS_PROJECTS_DIR).filter(f => f.endsWith('.json') && f !== 'base.json');
            for (const file of files) {
                try {
                    const data = fs.readJsonSync(path.join(PRESETS_PROJECTS_DIR, file));
                    if (!data.isBase) {
                        const name = data.name || path.basename(file, '.json');
                        names.add(name);
                    }
                } catch (e) {}
            }
        }
    } catch (e) {}
    if (names.size === 0) names.add('surf_love');
    return Array.from(names);
}

/**
 * Retorna todas las configuraciones de proyectos activos
 */
function getAllProjectConfigs() {
    const configs = [];
    const names = getAllProjectNames();
    for (const name of names) {
        const conf = getProjectConfig(name);
        if (conf) configs.push(conf);
    }
    return configs;
}

/**
 * Convierte cualquier ruta local (Z:, S:, C:, etc.) a su ruta equivalente canónica en Google Drive
 */
function resolveLocalToOnlinePath(localPath, projectName = null) {
    if (!localPath || typeof localPath !== 'string') return '';
    let norm = normalizeSlash(localPath).replace(/\/+$/, '');
    
    // Si ya es una ruta remota / Google Drive
    if (norm.match(/^(?:G:\/|lasp-drive:|Unidades compartidas\/)/i)) {
        return norm;
    }

    let cfg = projectName ? getProjectConfig(projectName) : null;
    let allConfigs = [];
    if (cfg) {
        allConfigs = [cfg];
    } else {
        allConfigs = getAllProjectConfigs();
    }

    const stripDrive = (p) => (p || '').replace(/^[a-zA-Z]:/i, '').replace(/\/+$/, '').toLowerCase();
    const normStripped = stripDrive(norm);

    for (const c of allConfigs) {
        if (!c || !c.roots) continue;
        const mediaRoot = (c.roots.media || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const workRoot = (c.roots.work || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const onlineMedia = (c.roots.onlineMedia || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const onlineWork = (c.roots.onlineWork || '').replace(/\\/g, '/').replace(/\/+$/, '');

        if (mediaRoot && onlineMedia) {
            const mediaStripped = stripDrive(mediaRoot);
            if (normStripped === mediaStripped) {
                return onlineMedia;
            }
            if (normStripped.startsWith(mediaStripped + '/')) {
                const sub = norm.substring(norm.length - (normStripped.length - mediaStripped.length));
                return `${onlineMedia}${sub}`;
            }
        }

        if (workRoot && onlineWork) {
            const workStripped = stripDrive(workRoot);
            if (normStripped === workStripped) {
                return onlineWork;
            }
            if (normStripped.startsWith(workStripped + '/')) {
                const sub = norm.substring(norm.length - (normStripped.length - workStripped.length));
                return `${onlineWork}${sub}`;
            }
        }
    }

    // Heurística universal de respaldo:
    // Si contiene /INTERNO/MEDIA/<cliente>/<proyecto>/...
    const mediaRegex = /(?:^|\/|[a-zA-Z]:\/)INTERNO\/MEDIA\/([^\/]+)\/([^\/]+)(?:\/(.*))?$/i;
    const mediaMatch = norm.match(mediaRegex);
    if (mediaMatch) {
        const pName = mediaMatch[2];
        const rel = mediaMatch[3] ? `/${mediaMatch[3]}` : '';
        return `G:/Unidades compartidas/${pName}_media${rel}`;
    }

    // Si contiene /<cliente>/<proyecto>/... (pero no INTERNO)
    const workRegex = /(?:^|\/|[a-zA-Z]:\/)(?!INTERNO\/)([^\/]+)\/([^\/]+)(?:\/(.*))?$/i;
    const workMatch = norm.match(workRegex);
    if (workMatch) {
        const pName = workMatch[2];
        const rel = workMatch[3] ? `/${workMatch[3]}` : '';
        return `G:/Unidades compartidas/${pName}${rel}`;
    }

    const fallbackProj = cfg?.name || projectName || 'surf_love';
    return `G:/Unidades compartidas/${fallbackProj}/${norm.split('/').pop()}`;
}

/**
 * Escanea recursivamente un directorio local o montado en disco (ej. G:\...)
 */
async function scanDirectoryRecursive(baseDir, currentRel = '') {
    const fullCurrent = currentRel ? path.join(baseDir, currentRel) : baseDir;
    if (!fs.existsSync(fullCurrent)) return [];

    let items = [];
    const entries = await fs.readdir(fullCurrent, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('_SYNC_CACHE') || entry.name.startsWith('$') || entry.name === 'node_modules' || entry.name === 'Thumbs.db') {
            continue;
        }
        const itemRel = currentRel ? path.join(currentRel, entry.name).replace(/\\/g, '/') : entry.name;
        const itemFull = path.join(baseDir, itemRel).replace(/\\/g, '/');

        if (entry.isDirectory()) {
            items.push({
                name: entry.name,
                relPath: itemRel,
                isDir: true,
                size: 0,
                modTime: (await fs.stat(itemFull)).mtime.toISOString()
            });
            const subItems = await scanDirectoryRecursive(baseDir, itemRel);
            items = items.concat(subItems);
        } else {
            const stat = await fs.stat(itemFull);
            items.push({
                name: entry.name,
                relPath: itemRel,
                isDir: false,
                size: stat.size,
                modTime: stat.mtime.toISOString()
            });
        }
    }

    return items;
}

/**
 * Escanea vía rclone lsjson (soporta Unidades Compartidas vía Team Drive ID y remotes estándar)
 */
function scanWithRclone(remotePath) {
    if (!fs.existsSync(RCLONE_EXE)) {
        throw new Error(`rclone.exe no encontrado en ${RCLONE_EXE}`);
    }

    const norm = normalizeSlash(remotePath);
    let driveName = '';
    let relSubPath = '';
    const match = norm.match(/(?:Unidades compartidas\/|lasp-drive:)([^/]+)(?:\/(.*))?$/i);
    if (match) {
        driveName = match[1].toLowerCase();
        relSubPath = match[2] || '';
    } else {
        const parts = norm.split('/');
        driveName = parts[0].toLowerCase();
        relSubPath = parts.slice(1).join('/');
    }

    const drivesMap = getTeamDrivesMap();
    const teamDriveId = drivesMap[driveName];

    let cmd = '';
    if (teamDriveId && RCLONE_CONF) {
        console.log(`[CATALOG] Escaneando Google Shared Drive '${driveName}' (ID: ${teamDriveId}) vía Rclone...`);
        const rcloneTarget = relSubPath ? `lasp-drive:${relSubPath}` : `lasp-drive:`;
        cmd = `"${RCLONE_EXE}" --config "${RCLONE_CONF}" lsjson "${rcloneTarget}" --drive-team-drive "${teamDriveId}" --recursive --fast-list`;
    } else {
        console.log(`[CATALOG] Ejecutando rclone lsjson estándar en: ${remotePath}`);
        const confArg = RCLONE_CONF ? `--config "${RCLONE_CONF}" ` : '';
        cmd = `"${RCLONE_EXE}" ${confArg}lsjson "${remotePath}" --recursive --fast-list`;
    }

    const stdout = execSync(cmd, { maxBuffer: 1024 * 1024 * 100, encoding: 'utf-8', timeout: 180000, windowsHide: true });
    const rawItems = JSON.parse(stdout);

    return rawItems.map(item => ({
        name: item.Name,
        relPath: item.Path.replace(/\\/g, '/'),
        isDir: item.IsDir,
        size: item.Size || 0,
        modTime: item.ModTime || new Date().toISOString()
    }));
}

/**
 * Lista los hijos directos de un directorio remoto vía rclone (no recursivo, rápido)
 */
function listWithRclone(remotePath) {
    if (!fs.existsSync(RCLONE_EXE)) return null;

    const norm = normalizeSlash(remotePath);
    let driveName = '';
    let relSubPath = '';

    const match = norm.match(/(?:Unidades compartidas\/|lasp-drive:)([^/]+)(?:\/(.*))?$/i);
    if (match) {
        driveName = match[1];
        relSubPath = match[2] || '';
    } else {
        const matchG = norm.match(/^G:\/([^/]+)(?:\/(.*))?$/i);
        if (matchG) {
            driveName = matchG[1];
            relSubPath = matchG[2] || '';
        }
    }

    if (!driveName) return null;

    const teamDrives = getTeamDrivesMap();
    const teamDriveId = teamDrives[driveName.toLowerCase()];
    if (!teamDriveId) return null;

    const rcloneTarget = relSubPath ? `lasp-drive:${relSubPath}` : `lasp-drive:`;
    const confArg = RCLONE_CONF ? `--config "${RCLONE_CONF}" ` : '';
    const cmd = `"${RCLONE_EXE}" ${confArg}lsjson "${rcloneTarget}" --drive-team-drive "${teamDriveId}"`;

    try {
        const stdout = execSync(cmd, { maxBuffer: 1024 * 1024 * 20, encoding: 'utf-8', timeout: 30000, windowsHide: true });
        const rawItems = JSON.parse(stdout);
        const baseNorm = norm.replace(/\/+$/, '');

        return rawItems.map(item => ({
            name: item.Name,
            isDirectory: !!item.IsDir,
            path: `${baseNorm}/${item.Name}`,
            size: item.Size || 0,
            modTime: item.ModTime || null,
            fromRclone: true
        })).sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
    } catch (e) {
        console.warn(`[RCLONE LIST] Error listando ${remotePath}:`, e.message);
        return null;
    }
}

/**
 * Genera datos mock canónicos para desarrollo cuando no hay conexión física a G:
 */
function generateMockItems(category, projectCode) {
    const now = new Date().toISOString();

    if (category === 'work') {
        return [
            { name: 'episodios', relPath: 'episodios', isDir: true, size: 0, modTime: now },
            { name: 'ep01', relPath: 'episodios/ep01', isDir: true, size: 0, modTime: now },
            { name: 'sc01', relPath: 'episodios/ep01/sc01', isDir: true, size: 0, modTime: now },
            { name: 'sh010', relPath: 'episodios/ep01/sc01/sh010', isDir: true, size: 0, modTime: now },
            { name: 'nuke', relPath: 'episodios/ep01/sc01/sh010/nuke', isDir: true, size: 0, modTime: now },
            { name: 'sh010_comp_v001.nk', relPath: 'episodios/ep01/sc01/sh010/nuke/sh010_comp_v001.nk', isDir: false, size: 84210, modTime: now },
            { name: 'sh010_comp_v002.nk', relPath: 'episodios/ep01/sc01/sh010/nuke/sh010_comp_v002.nk', isDir: false, size: 91400, modTime: now },
            { name: 'sh020', relPath: 'episodios/ep01/sc01/sh020', isDir: true, size: 0, modTime: now },
            { name: 'blender', relPath: 'episodios/ep01/sc01/sh020/blender', isDir: true, size: 0, modTime: now },
            { name: 'sh020_anim_v001.blend', relPath: 'episodios/ep01/sc01/sh020/blender/sh020_anim_v001.blend', isDir: false, size: 14250000, modTime: now },
            { name: 'assets', relPath: 'assets', isDir: true, size: 0, modTime: now },
            { name: 'characters', relPath: 'assets/characters', isDir: true, size: 0, modTime: now },
            { name: 'surfer_main', relPath: 'assets/characters/surfer_main', isDir: true, size: 0, modTime: now },
            { name: 'model', relPath: 'assets/characters/surfer_main/model', isDir: true, size: 0, modTime: now },
            { name: 'surfer_main_v001.obj', relPath: 'assets/characters/surfer_main/model/surfer_main_v001.obj', isDir: false, size: 8520000, modTime: now },
            { name: 'textures', relPath: 'assets/characters/surfer_main/textures', isDir: true, size: 0, modTime: now },
            { name: 'surfer_diffuse_4k.png', relPath: 'assets/characters/surfer_main/textures/surfer_diffuse_4k.png', isDir: false, size: 24500000, modTime: now }
        ];
    } else {
        // media
        return [
            { name: 'episodios', relPath: 'episodios', isDir: true, size: 0, modTime: now },
            { name: 'ep01', relPath: 'episodios/ep01', isDir: true, size: 0, modTime: now },
            { name: 'sc01', relPath: 'episodios/ep01/sc01', isDir: true, size: 0, modTime: now },
            { name: 'sh010', relPath: 'episodios/ep01/sc01/sh010', isDir: true, size: 0, modTime: now },
            { name: 'plates', relPath: 'episodios/ep01/sc01/sh010/plates', isDir: true, size: 0, modTime: now },
            { name: 'sh010_plate_RAW_v001.mov', relPath: 'episodios/ep01/sc01/sh010/plates/sh010_plate_RAW_v001.mov', isDir: false, size: 524288000, modTime: now },
            { name: 'exportIA', relPath: 'episodios/ep01/sc01/sh010/exportIA', isDir: true, size: 0, modTime: now },
            { name: 'sh010_seedance_1080p_wide_bg_v001.mp4', relPath: 'episodios/ep01/sc01/sh010/exportIA/sh010_seedance_1080p_wide_bg_v001.mp4', isDir: false, size: 78500000, modTime: now },
            { name: 'renders', relPath: 'episodios/ep01/sc01/sh010/renders', isDir: true, size: 0, modTime: now },
            { name: 'fullres', relPath: 'episodios/ep01/sc01/sh010/renders/fullres', isDir: true, size: 0, modTime: now },
            { name: 'sh010_comp_v001.0001.exr', relPath: 'episodios/ep01/sc01/sh010/renders/fullres/sh010_comp_v001.0001.exr', isDir: false, size: 45000000, modTime: now },
            { name: 'sh010_comp_v001.0002.exr', relPath: 'episodios/ep01/sc01/sh010/renders/fullres/sh010_comp_v001.0002.exr', isDir: false, size: 45000000, modTime: now },
            { name: 'sh020', relPath: 'episodios/ep01/sc01/sh020', isDir: true, size: 0, modTime: now },
            { name: 'plates', relPath: 'episodios/ep01/sc01/sh020/plates', isDir: true, size: 0, modTime: now },
            { name: 'sh020_plate_RAW_v001.mov', relPath: 'episodios/ep01/sc01/sh020/plates/sh020_plate_RAW_v001.mov', isDir: false, size: 345000000, modTime: now },
            { name: 'exportIA', relPath: 'episodios/ep01/sc01/sh020/exportIA', isDir: true, size: 0, modTime: now },
            { name: 'sh020_higgsfield_4k_cu_char_v001.mp4', relPath: 'episodios/ep01/sc01/sh020/exportIA/sh020_higgsfield_4k_cu_char_v001.mp4', isDir: false, size: 125000000, modTime: now }
        ];
    }
}

/**
 * Convierte una lista plana de archivos en un árbol jerárquico anidado
 */
function buildTreeFromFlatList(items, categoryRoot) {
    const root = {
        name: path.basename(categoryRoot),
        path: categoryRoot,
        isDir: true,
        children: {}
    };

    for (const item of items) {
        const parts = item.relPath.split('/');
        let current = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;

            if (!current.children[part]) {
                current.children[part] = {
                    name: part,
                    relPath: parts.slice(0, i + 1).join('/'),
                    isDir: !isLast || item.isDir,
                    size: isLast ? item.size : 0,
                    modTime: isLast ? item.modTime : null,
                    targetLocalPath: isLast ? item.targetLocalPath : null,
                    onlinePath: isLast ? item.onlinePath : null,
                    category: item.category,
                    children: (!isLast || item.isDir) ? {} : undefined
                };
            }
            current = current.children[part];
        }
    }

    return root;
}

/**
 * Función principal: Genera el catálogo indexado para un proyecto
 * @param {string} projectName Nombre del proyecto (ej: 'surf_love')
 * @param {object} options Opciones (mode: 'auto'|'fs'|'rclone'|'mock')
 */
async function generateProjectCatalog(projectName, options = {}) {
    const mode = options.mode || 'auto';
    const config = options.projectConfig || getProjectConfig(projectName);

    if (!config) {
        throw new Error(`No se encontró configuración para el proyecto: ${projectName}`);
    }

    console.log(`[CATALOG] Iniciando generación de catálogo para: ${projectName} (Modo: ${mode})`);

    const roots = {
        work: {
            local: normalizeSlash(config.roots?.work || `Z:/${config.client || 'client'}/${projectName}`),
            online: normalizeSlash(config.roots?.onlineWork || `G:/Unidades compartidas/${projectName}`)
        },
        media: {
            local: normalizeSlash(config.roots?.media || `Z:/INTERNO/MEDIA/${config.client || 'client'}/${projectName}`),
            online: normalizeSlash(config.roots?.onlineMedia || `G:/Unidades compartidas/${projectName}_media`)
        }
    };

    const categories = ['work', 'media'];
    const flatList = [];
    let itemId = 1;
    let totalBytes = 0;
    let workFiles = 0;
    let workBytes = 0;
    let mediaFiles = 0;
    let mediaBytes = 0;

    for (const cat of categories) {
        const rootInfo = roots[cat];
        let scanned = [];

        // 1. Detección automática del método de escaneo:
        // Prioridad 1: Rclone con Team Drives si rclone está disponible
        if (mode === 'rclone' || (mode === 'auto' && (RCLONE_CONF || rootInfo.online.startsWith('gdrive:')))) {
            try {
                scanned = scanWithRclone(rootInfo.online);
            } catch (e) {
                console.warn(`[CATALOG] rclone falló para ${cat}:`, e.message);
                if (mode === 'rclone') scanned = [];
            }
        }

        // Prioridad 2: Filesystem local (ej. G:\ montado físicamente) si Rclone no devolvió nada
        if (scanned.length === 0 && (mode === 'fs' || mode === 'auto')) {
            if (fs.existsSync(rootInfo.online)) {
                console.log(`[CATALOG] Escaneando filesystem local para ${cat}: ${rootInfo.online}`);
                scanned = await scanDirectoryRecursive(rootInfo.online);
            }
        }

        // Si no se encontraron archivos reales y se pidió explícitamente modo mock
        if (scanned.length === 0 && mode === 'mock') {
            console.log(`[CATALOG] Modo mock solicitado para ${cat}...`);
            scanned = generateMockItems(cat, config.projectCode || projectName);
        }

        // Procesar y enriquecer cada item con las rutas relativas y absolutas
        for (const raw of scanned) {
            const ext = raw.isDir ? '' : path.extname(raw.name).toLowerCase();
            const targetLocalPath = `${rootInfo.local}/${raw.relPath}`;
            const onlinePath = `${rootInfo.online}/${raw.relPath}`;

            const processedItem = {
                id: `sync_${cat}_${itemId++}`,
                category: cat, // 'work' o 'media'
                name: raw.name,
                relPath: raw.relPath,
                ext: ext,
                isDir: raw.isDir,
                size: raw.size,
                modTime: raw.modTime,
                onlinePath: onlinePath,
                targetLocalPath: targetLocalPath
            };

            flatList.push(processedItem);

            if (!raw.isDir) {
                totalBytes += raw.size;
                if (cat === 'work') {
                    workFiles++;
                    workBytes += raw.size;
                } else {
                    mediaFiles++;
                    mediaBytes += raw.size;
                }
            }
        }
    }

    const totalFiles = workFiles + mediaFiles;
    const totalFolders = flatList.filter(i => i.isDir).length;

    // Construir árboles visuales independientes para Work y Media
    const workItems = flatList.filter(i => i.category === 'work');
    const mediaItems = flatList.filter(i => i.category === 'media');

    const tree = {
        work: buildTreeFromFlatList(workItems, roots.work.online),
        media: buildTreeFromFlatList(mediaItems, roots.media.online)
    };

    const catalogData = {
        project: projectName,
        projectCode: config.projectCode || projectName,
        client: config.client || '',
        version: '1.0',
        generatedAt: new Date().toISOString(),
        generatedBy: 'Pipeta Sync Catalog Generator',
        roots: roots,
        stats: {
            totalFiles,
            totalFolders,
            totalBytes,
            workFiles,
            workBytes,
            mediaFiles,
            mediaBytes
        },
        categories: {
            work: {
                onlineRoot: roots.work.online,
                localTarget: roots.work.local,
                fileCount: workFiles,
                byteCount: workBytes
            },
            media: {
                onlineRoot: roots.media.online,
                localTarget: roots.media.local,
                fileCount: mediaFiles,
                byteCount: mediaBytes
            }
        },
        flatList: flatList,
        tree: tree
    };

    // Guardar exclusivamente en arquitectura modular y generar manifest.json
    let manifestData = null;
    try {
        manifestData = partitionCatalog(catalogData, 'drive');
        console.log(`[CATALOG] Catálogo modular de Drive generado con éxito para: ${projectName} (${totalFiles} archivos, ${totalFolders} carpetas, ${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`);
    } catch(e) {
        console.warn(`[CATALOG] Error al generar sub-catálogos modulares de drive:`, e.message);
    }

    return {
        success: true,
        catalogPath: path.join(MODULAR_PROJECTS_DIR, projectName, 'drive', 'manifest.json'),
        stats: catalogData.stats,
        project: projectName,
        manifest: manifestData
    };
}

/**
 * Lee el catálogo de un proyecto desde Z:\_SYNC_CACHE\<projectName>.json
 */
async function loadProjectCatalog(projectName) {
    if (typeof syncLocalCacheFromNetwork === 'function') {
        try { syncLocalCacheFromNetwork(projectName); } catch (e) {}
    }

    const namesToTry = [projectName];
    const config = getProjectConfig(projectName);
    if (config) {
        if (config.name && !namesToTry.includes(config.name)) namesToTry.push(config.name);
        if (config.projectCode && !namesToTry.includes(config.projectCode)) namesToTry.push(config.projectCode);
    }

    const candidateRoots = [LOCAL_CACHE_DIR, CACHE_ROOT, 'Z:/_SYNC_CACHE'];
    const candidates = [];
    for (const name of namesToTry) {
        for (const r of candidateRoots) {
            const p = path.join(r, `${name}.json`);
            if (fs.existsSync(p) && !candidates.includes(p)) candidates.push(p);
        }
    }

    if (candidates.length === 0) {
        // Fallback a manifiesto modular de Drive
        if (typeof getModularManifest === 'function') {
            const modManifest = getModularManifest(projectName, 'drive');
            if (modManifest) return modManifest;
        }
        return null;
    }

    let bestPath = candidates[0];
    let bestMtime = 0;
    for (const p of candidates) {
        try {
            const st = fs.statSync(p);
            if (st.mtimeMs > bestMtime) {
                bestMtime = st.mtimeMs;
                bestPath = p;
            }
        } catch (e) {}
    }

    try {
        return await fs.readJson(bestPath);
    } catch (e) {
        return null;
    }
}

/**
 * Lista todos los proyectos que tienen catálogo generado (modular o residual)
 */
async function listAvailableCatalogs() {
    const catalogs = [];
    const seen = new Set();

    const candidateBases = [
        path.join(CACHE_ROOT, 'projects'),
        path.join(LOCAL_CACHE_DIR, 'projects'),
        'Z:/_SYNC_CACHE/projects'
    ];

    for (const base of candidateBases) {
        if (!fs.existsSync(base)) continue;
        try {
            const dirs = await fs.readdir(base);
            for (const d of dirs) {
                const low = d.toLowerCase();
                if (seen.has(low)) continue;
                const dManifest = path.join(base, d, 'drive', 'manifest.json');
                const sManifest = path.join(base, d, 'server', 'manifest.json');
                let targetM = fs.existsSync(dManifest) ? dManifest : (fs.existsSync(sManifest) ? sManifest : null);
                if (targetM) {
                    try {
                        const mData = await fs.readJson(targetM);
                        const stat = await fs.stat(targetM);
                        catalogs.push({
                            project: mData.project || d,
                            fileName: `projects/${d}`,
                            path: targetM,
                            generatedAt: mData.generatedAt || stat.mtime.toISOString(),
                            stats: mData.stats || null,
                            roots: mData.roots || null,
                            isModular: true
                        });
                        seen.add(low);
                    } catch(e) {}
                }
            }
        } catch(e) {}
    }

    // Compatibilidad retroactiva con cualquier archivo monolítico residual
    if (fs.existsSync(CACHE_ROOT)) {
        try {
            const files = await fs.readdir(CACHE_ROOT);
            for (const file of files) {
                if (file.endsWith('.json') && !file.startsWith('worker_') && !file.startsWith('last_') && !file.startsWith('catalog_refresh_')) {
                    const projName = path.basename(file, '.json').replace(/^server_/i, '');
                    if (!seen.has(projName.toLowerCase())) {
                        const fullPath = path.join(CACHE_ROOT, file);
                        try {
                            const stat = await fs.stat(fullPath);
                            const data = await fs.readJson(fullPath);
                            catalogs.push({
                                project: data.project || projName,
                                fileName: file,
                                path: fullPath,
                                generatedAt: data.generatedAt || stat.mtime.toISOString(),
                                stats: data.stats || null,
                                roots: data.roots || null
                            });
                            seen.add(projName.toLowerCase());
                        } catch (e) {}
                    }
                }
            }
        } catch(e) {}
    }

    return catalogs;
}

// --- MODULAR SUB-CATALOGS SYSTEM ---
// MODULAR_PROJECTS_DIR hoisted at top
const manifestMemoryCache = new Map();
const subCatalogMemoryCache = new Map();

function getSubCatalogKey(item) {
    const rel = (item.relPath || '').replace(/\\/g, '/');
    const parts = rel.split('/').filter(Boolean);
    if (item.category === 'work') {
        if (parts[0]?.toLowerCase() === 'assets2d') return { key: 'assets2D', file: 'assets2D.json', category: 'work', prefix: 'assets2D' };
        if (parts[0]?.toLowerCase() === 'assets3d') return { key: 'assets3D', file: 'assets3D.json', category: 'work', prefix: 'assets3D' };
        if (parts[0]?.toLowerCase() === 'episodios') {
            if (parts.length > 1) {
                return { key: 'episodios/' + parts[1], file: 'episodios/' + parts[1] + '.json', category: 'work', prefix: 'episodios/' + parts[1] };
            }
            return { key: 'episodios/_root', file: 'episodios/_root.json', category: 'work', prefix: 'episodios' };
        }
        return { key: 'misc', file: 'misc.json', category: 'work', prefix: parts[0] || '' };
    } else {
        if (parts.length > 0) {
            return { key: 'media/' + parts[0], file: 'media/' + parts[0] + '.json', category: 'media', prefix: parts[0] };
        }
        return { key: 'media/_root', file: 'media/_root.json', category: 'media', prefix: '' };
    }
}

/**
 * Particiona un catálogo monolítico en sub-catálogos modulares y genera el manifest.json
 */
function partitionCatalog(monolithicData, type) {
    const projectName = monolithicData.project || 'surf_love';
    const outDir = path.join(MODULAR_PROJECTS_DIR, projectName, type);
    fs.ensureDirSync(outDir);

    const roots = monolithicData.roots || {};
    const flatList = monolithicData.flatList || [];

    const subCatalogs = new Map();
    const workRootChildren = new Map();
    const mediaRootChildren = new Map();
    const episodiosChildren = new Map();

    let totalBytes = 0;
    let workFiles = 0;
    let workBytes = 0;
    let mediaFiles = 0;
    let mediaBytes = 0;

    for (const item of flatList) {
        const meta = getSubCatalogKey(item);
        if (!subCatalogs.has(meta.key)) {
            subCatalogs.set(meta.key, {
                id: meta.key,
                file: meta.file,
                category: meta.category,
                prefix: meta.prefix,
                itemCount: 0,
                fileCount: 0,
                byteCount: 0,
                items: []
            });
        }
        const bucket = subCatalogs.get(meta.key);
        bucket.items.push(item);
        bucket.itemCount++;

        const size = item.size || 0;
        if (!item.isDir && !item.isDirectory) {
            totalBytes += size;
            bucket.fileCount++;
            bucket.byteCount += size;
            if (item.category === 'work') {
                workFiles++;
                workBytes += size;
            } else {
                mediaFiles++;
                mediaBytes += size;
            }
        }

        const rel = (item.relPath || '').replace(/\\/g, '/');
        const parts = rel.split('/').filter(Boolean);
        const itemPath = item.serverPath || item.onlinePath || item.path || '';

        if (item.category === 'work') {
            if (parts.length === 1) {
                workRootChildren.set(parts[0].toLowerCase(), {
                    name: parts[0],
                    isDirectory: !!item.isDir || !!item.isDirectory,
                    path: itemPath,
                    size: item.size || 0,
                    fromCatalog: true,
                    isServer: type === 'server'
                });
            }
            if (parts.length === 2 && parts[0].toLowerCase() === 'episodios') {
                episodiosChildren.set(parts[1].toLowerCase(), {
                    name: parts[1],
                    isDirectory: !!item.isDir || !!item.isDirectory,
                    path: itemPath,
                    size: item.size || 0,
                    fromCatalog: true,
                    isServer: type === 'server'
                });
            }
        } else if (item.category === 'media') {
            if (parts.length === 1) {
                mediaRootChildren.set(parts[0].toLowerCase(), {
                    name: parts[0],
                    isDirectory: !!item.isDir || !!item.isDirectory,
                    path: itemPath,
                    size: item.size || 0,
                    fromCatalog: true,
                    isServer: type === 'server'
                });
            }
        }
    }

    const subCatalogMetaMap = {};
    for (const [key, bucket] of subCatalogs.entries()) {
        const filePath = path.join(outDir, bucket.file);
        fs.ensureDirSync(path.dirname(filePath));
        fs.writeJsonSync(filePath, {
            id: bucket.id,
            project: projectName,
            type: type,
            category: bucket.category,
            prefix: bucket.prefix,
            file: bucket.file,
            stats: {
                itemCount: bucket.itemCount,
                fileCount: bucket.fileCount,
                byteCount: bucket.byteCount
            },
            flatList: bucket.items
        }, { spaces: 2 });

        subCatalogMetaMap[key] = {
            id: bucket.id,
            file: bucket.file,
            category: bucket.category,
            prefix: bucket.prefix,
            itemCount: bucket.itemCount,
            fileCount: bucket.fileCount,
            byteCount: bucket.byteCount
        };
    }

    const manifestData = {
        project: projectName,
        projectCode: monolithicData.projectCode || projectName,
        client: monolithicData.client || '',
        type: type,
        version: '2.0-modular',
        generatedAt: new Date().toISOString(),
        roots: roots,
        stats: {
            totalFiles: workFiles + mediaFiles,
            totalFolders: flatList.filter(i => i.isDir || i.isDirectory).length,
            totalBytes,
            workFiles,
            workBytes,
            mediaFiles,
            mediaBytes
        },
        subCatalogs: subCatalogMetaMap,
        rootChildren: {
            work: Array.from(workRootChildren.values()),
            media: Array.from(mediaRootChildren.values())
        },
        episodiosChildren: Array.from(episodiosChildren.values())
    };

    const manifestPath = path.join(outDir, 'manifest.json');
    fs.writeJsonSync(manifestPath, manifestData, { spaces: 2 });
    manifestMemoryCache.set(manifestPath, { mtime: Date.now(), data: manifestData });

    // Replicar también a la red central Z:/_SYNC_CACHE/projects si corresponde
    try {
        if (fs.existsSync('Z:/_SYNC_CACHE') && path.resolve(LOCAL_CACHE_DIR).toLowerCase() !== path.resolve('Z:/_SYNC_CACHE').toLowerCase()) {
            const centralOutDir = path.join('Z:/_SYNC_CACHE/projects', projectName, type);
            fs.copySync(outDir, centralOutDir, { overwrite: true });
        }
    } catch(e) {}

    // Si tiene un alias de código de proyecto distinto (ej. PRPR vs pride_and_prejudice), replicar modularmente
    const alias = monolithicData.projectCode;
    if (alias && alias.toLowerCase() !== projectName.toLowerCase()) {
        try {
            const aliasOutDir = path.join(MODULAR_PROJECTS_DIR, alias, type);
            fs.copySync(outDir, aliasOutDir, { overwrite: true });
            if (fs.existsSync('Z:/_SYNC_CACHE') && path.resolve(LOCAL_CACHE_DIR).toLowerCase() !== path.resolve('Z:/_SYNC_CACHE').toLowerCase()) {
                const centralAliasDir = path.join('Z:/_SYNC_CACHE/projects', alias, type);
                fs.copySync(outDir, centralAliasDir, { overwrite: true });
            }
        } catch(e) {}
    }

    try {
        refreshDriveManifestPendingSummary(projectName, null, true);
    } catch (e) {}

    console.log(`[MODULAR CATALOG] Guardado ${projectName} (${type}) con ${subCatalogs.size} sub-catálogos en ${outDir}`);
    return manifestData;
}

const projectPathLookupCache = new Map();
const autoHydratedProjects = new Set();

function getModularManifest(projectName, type) {
    if (type === 'server' && global.isExternalMachine) return null;
    projectName = resolveCanonicalProjectName(projectName);
    if (!projectName || /^\d+$/.test(projectName)) return null;

    const localManifest = path.join(MODULAR_PROJECTS_DIR, projectName, type, 'manifest.json');
    let manifestPath = null;

    try {
        if (fs.existsSync(localManifest)) {
            if (!global.isExternalMachine) {
                const now = Date.now();
                const lastCheck = manifestFreshnessCache.get(localManifest) || 0;
                if (now - lastCheck > 30000) {
                    manifestFreshnessCache.set(localManifest, now);
                    const netManCandidates = [
                        path.join('S:/_SYNC_CACHE/projects', projectName, type, 'manifest.json'),
                        path.join('Z:/_SYNC_CACHE/projects', projectName, type, 'manifest.json'),
                        path.join(UNC_CACHE, 'projects', projectName, type, 'manifest.json')
                    ];
                    try {
                        const localSt = fs.statSync(localManifest);
                        for (const nm of netManCandidates) {
                            if (path.resolve(nm).toLowerCase() === path.resolve(localManifest).toLowerCase()) continue;
                            if (fs.existsSync(nm)) {
                                const netSt = fs.statSync(nm);
                                if (netSt.mtimeMs > localSt.mtimeMs + 500) {
                                    const netJson = fs.readJsonSync(nm);
                                    // Preservar pendingSummary cacheado localmente si el manifest de red aún no lo trae
                                    if (!netJson.pendingSummary) {
                                        try {
                                            const prevLocal = fs.readJsonSync(localManifest);
                                            if (prevLocal && prevLocal.pendingSummary) {
                                                netJson.pendingSummary = prevLocal.pendingSummary;
                                            }
                                        } catch (e) {}
                                    }
                                    fs.writeJsonSync(localManifest, netJson, { spaces: 2 });
                                    manifestMemoryCache.delete(localManifest);
                                }
                                break;
                            }
                        }
                    } catch (e) {}
                }
            }
            manifestPath = localManifest;
        }
    } catch(e) {}

    // Hidratación por HTTP (0 SMB): válida tanto en Estudio como en equipos Remotos (solo Drive en remotos)
    if (!manifestPath) {
        const hydKey = `${projectName}_${type}`.toLowerCase();
        if (!autoHydratedProjects.has(hydKey)) {
            autoHydratedProjects.add(hydKey);
            try { fetchProjectBundleFromCentralServer(projectName); } catch(e) {}
            try {
                if (fs.existsSync(localManifest)) {
                    manifestPath = localManifest;
                }
            } catch(e) {}
        }
        if (!manifestPath) {
            const httpManifest = fetchSubCatalogFromCentralServer(projectName, type, 'manifest.json');
            if (httpManifest) {
                manifestPath = httpManifest;
            }
        }
    }

    if (!manifestPath && !global.isExternalMachine) {
        try { syncLocalCacheFromNetwork(projectName); } catch(e) {}
        try {
            if (fs.existsSync(localManifest)) {
                manifestPath = localManifest;
            }
        } catch(e) {}

        if (!manifestPath) {
            const netCandidates = [
                path.join('Z:/_SYNC_CACHE/projects', projectName, type, 'manifest.json'),
                path.join(UNC_CACHE, 'projects', projectName, type, 'manifest.json')
            ];
            for (const c of netCandidates) {
                try {
                    if (fs.existsSync(c)) {
                        manifestPath = c;
                        // Hidratar en segundo plano o directo al SSD local para siguientes lecturas
                        try {
                            fs.ensureDirSync(path.dirname(localManifest));
                            fs.copySync(path.dirname(c), path.dirname(localManifest), { overwrite: true });
                            manifestPath = localManifest;
                        } catch(copyErr) {}
                        break;
                    }
                } catch(e) {}
            }
        }
    }

    if (!manifestPath) {
        const monoCandidates = [
            type === 'server' ? path.join(LOCAL_CACHE_DIR, `server_${projectName}.json`) : path.join(LOCAL_CACHE_DIR, `${projectName}.json`)
        ];
        if (!global.isExternalMachine) {

            monoCandidates.push(
                type === 'server' ? path.join('Z:/_SYNC_CACHE', `server_${projectName}.json`) : path.join('Z:/_SYNC_CACHE', `${projectName}.json`),
                type === 'server' ? path.join(UNC_CACHE, `server_${projectName}.json`) : path.join(UNC_CACHE, `${projectName}.json`)
            );
        }
        for (const mc of monoCandidates) {
            try {
                if (fs.existsSync(mc)) {
                    const monoData = fs.readJsonSync(mc);
                    return partitionCatalog(monoData, type);
                }
            } catch(e) {}
        }
        return null;
    }

    try {
        const st = fs.statSync(manifestPath);
        const cached = manifestMemoryCache.get(manifestPath);
        if (cached && cached.mtime === st.mtimeMs) {
            return cached.data;
        }
        const data = fs.readJsonSync(manifestPath);
        manifestMemoryCache.set(manifestPath, { mtime: st.mtimeMs, data });
        return data;
    } catch(e) {
        return null;
    }
}

function findProjectManifestForPath(requestedPath, type) {
    if (type === 'server' && global.isExternalMachine) return null;
    const norm = normalizeSlash(requestedPath).toLowerCase();
    const stripDrive = s => (s || '').replace(/^[a-zA-Z]:/, '');
    const normNoDrive = stripDrive(norm);

    const cacheKey = `${type}::${norm}`;
    const cachedMatch = projectPathLookupCache.get(cacheKey);
    if (cachedMatch && (Date.now() - cachedMatch.time < 60000)) {
        const freshManifest = getModularManifest(cachedMatch.data.projectName, type) || cachedMatch.data.manifest;
        return { ...cachedMatch.data, manifest: freshManifest };
    }

    const rememberMatch = (resObj) => {
        projectPathLookupCache.set(cacheKey, { time: Date.now(), data: resObj });
        return resObj;
    };

    // 0. Fast-path: Resolver primero usando presets locales en disco C: (0 ms, sin escaneo de red SMB)
    try {
        if (fs.existsSync(PRESETS_PROJECTS_DIR)) {
            const presetFiles = fs.readdirSync(PRESETS_PROJECTS_DIR).filter(f => f.endsWith('.json') && f !== 'base.json');
            for (const pf of presetFiles) {
                try {
                    const pCfg = fs.readJsonSync(path.join(PRESETS_PROJECTS_DIR, pf));
                    const pName = pCfg.name || path.basename(pf, '.json');
                    const wRoot = normalizeSlash(pCfg.roots?.work || '').toLowerCase().replace(/^s:/i, 'z:');
                    const mRoot = normalizeSlash(pCfg.roots?.media || '').toLowerCase().replace(/^s:/i, 'z:');
                    const owRoot = normalizeSlash(pCfg.roots?.onlineWork || '').toLowerCase();
                    const omRoot = normalizeSlash(pCfg.roots?.onlineMedia || '').toLowerCase();

                    const wNoDrive = stripDrive(wRoot);
                    const mNoDrive = stripDrive(mRoot);

                    let matchedCat = null;
                    let matchedRoot = null;
                    if (wRoot && (norm === wRoot || norm.startsWith(wRoot + '/'))) {
                        matchedCat = 'work'; matchedRoot = wRoot;
                    } else if (mRoot && (norm === mRoot || norm.startsWith(mRoot + '/'))) {
                        matchedCat = 'media'; matchedRoot = mRoot;
                    } else if (type !== 'server' && owRoot && (norm === owRoot || norm.startsWith(owRoot + '/'))) {
                        matchedCat = 'work'; matchedRoot = owRoot;
                    } else if (type !== 'server' && omRoot && (norm === omRoot || norm.startsWith(omRoot + '/'))) {
                        matchedCat = 'media'; matchedRoot = omRoot;
                    } else if (wNoDrive && (normNoDrive === wNoDrive || normNoDrive.startsWith(wNoDrive + '/'))) {
                        matchedCat = 'work'; matchedRoot = norm.substring(0, norm.length - (normNoDrive.length - wNoDrive.length));
                    } else if (mNoDrive && (normNoDrive === mNoDrive || normNoDrive.startsWith(mNoDrive + '/'))) {
                        matchedCat = 'media'; matchedRoot = norm.substring(0, norm.length - (normNoDrive.length - mNoDrive.length));
                    }

                    if (matchedCat && matchedRoot) {
                        const manifest = getModularManifest(pName, type);
                        if (manifest) {
                            return rememberMatch({ manifest, projectName: manifest.project || pName, category: matchedCat, rootPath: matchedRoot });
                        }
                    }
                } catch(e) {}
            }
        }
    } catch(e) {}

    const localBases = [
        path.join(CACHE_ROOT, 'projects'),
        MODULAR_PROJECTS_DIR
    ].filter((b, idx, arr) => {
        try { return fs.existsSync(b) && arr.indexOf(b) === idx; } catch(e) { return false; }
    });

    const netBases = [];
    if (!global.isExternalMachine) {

        for (const nb of ['Z:/_SYNC_CACHE/projects', path.join(UNC_CACHE, 'projects')]) {
            if (!localBases.includes(nb)) {
                try { if (fs.existsSync(nb)) netBases.push(nb); } catch(e) {}
            }
        }
    }

    const projectBases = [...localBases, ...netBases];
    if (projectBases.length === 0) return null;

    const seenProjects = new Set();
    for (const base of projectBases) {
        let projectDirs = [];
        try { projectDirs = fs.readdirSync(base); } catch(e) { continue; }

        // Priorizar nombres canónicos largos (ej. surf_love) sobre códigos de proyecto cortos (ej. SURF)
        projectDirs.sort((a, b) => b.length - a.length);

        for (const p of projectDirs) {
            if (seenProjects.has(p.toLowerCase())) continue;
            seenProjects.add(p.toLowerCase());

            const manifest = getModularManifest(p, type);
            if (!manifest) continue;
            const pName = manifest.project || p;

            let rootWork = '';
            let rootMedia = '';
            if (type === 'server') {
                rootWork = normalizeSlash(manifest.roots?.work?.server || '').toLowerCase().replace(/^s:/i, 'z:');
                rootMedia = normalizeSlash(manifest.roots?.media?.server || '').toLowerCase().replace(/^s:/i, 'z:');
                
                if (rootWork && (norm === rootWork || norm.startsWith(rootWork + '/'))) {
                    return rememberMatch({ manifest, projectName: pName, category: 'work', rootPath: rootWork });
                }
                if (rootMedia && (norm === rootMedia || norm.startsWith(rootMedia + '/'))) {
                    return rememberMatch({ manifest, projectName: pName, category: 'media', rootPath: rootMedia });
                }
                const rootWorkNoDrive = stripDrive(rootWork);
                if (rootWorkNoDrive && (normNoDrive === rootWorkNoDrive || normNoDrive.startsWith(rootWorkNoDrive + '/'))) {
                    const rootPath = norm.substring(0, norm.length - (normNoDrive.length - rootWorkNoDrive.length));
                    return rememberMatch({ manifest, projectName: pName, category: 'work', rootPath });
                }
                const rootMediaNoDrive = stripDrive(rootMedia);
                if (rootMediaNoDrive && (normNoDrive === rootMediaNoDrive || normNoDrive.startsWith(rootMediaNoDrive + '/'))) {
                    const rootPath = norm.substring(0, norm.length - (normNoDrive.length - rootMediaNoDrive.length));
                    return rememberMatch({ manifest, projectName: pName, category: 'media', rootPath });
                }
            } else {
                const onlineWork = normalizeSlash(manifest.roots?.work?.online || `G:/Unidades compartidas/${p}`).toLowerCase();
                const onlineMedia = normalizeSlash(manifest.roots?.media?.online || `G:/Unidades compartidas/${p}_media`).toLowerCase();
                const localWork = normalizeSlash(manifest.roots?.work?.local || `Z:/atresmedia/${p}`).toLowerCase();
                const localMedia = normalizeSlash(manifest.roots?.media?.local || `Z:/INTERNO/MEDIA/atresmedia/${p}`).toLowerCase();

                if (onlineWork && (norm === onlineWork || norm.startsWith(onlineWork + '/'))) {
                    return rememberMatch({ manifest, projectName: pName, category: 'work', rootPath: onlineWork });
                }
                if (onlineMedia && (norm === onlineMedia || norm.startsWith(onlineMedia + '/'))) {
                    return rememberMatch({ manifest, projectName: pName, category: 'media', rootPath: onlineMedia });
                }
                if (localWork && (norm === localWork || norm.startsWith(localWork + '/'))) {
                    return rememberMatch({ manifest, projectName: pName, category: 'work', rootPath: localWork });
                }
                if (localMedia && (norm === localMedia || norm.startsWith(localMedia + '/'))) {
                    return rememberMatch({ manifest, projectName: pName, category: 'media', rootPath: localMedia });
                }

                // Comparación independiente de la letra de unidad (C:, Z:, S:, etc.)
                const localWorkNoDrive = stripDrive(localWork);
                if (localWorkNoDrive && (normNoDrive === localWorkNoDrive || normNoDrive.startsWith(localWorkNoDrive + '/'))) {
                    const rootPath = norm.substring(0, norm.length - (normNoDrive.length - localWorkNoDrive.length));
                    return rememberMatch({ manifest, projectName: pName, category: 'work', rootPath });
                }
                const localMediaNoDrive = stripDrive(localMedia);
                if (localMediaNoDrive && (normNoDrive === localMediaNoDrive || normNoDrive.startsWith(localMediaNoDrive + '/'))) {
                    const rootPath = norm.substring(0, norm.length - (normNoDrive.length - localMediaNoDrive.length));
                    return rememberMatch({ manifest, projectName: pName, category: 'media', rootPath });
                }
            }
        }
    }
    return null;
}

const dirExistsCache = new Map();
const DIR_CACHE_TTL = 5000;

function dirExistsFast(dirPath) {
    if (!dirPath) return false;
    const norm = path.normalize(dirPath).toLowerCase();
    if (norm.startsWith('z:') && (global.isExternalMachine || !fs.existsSync('Z:\\'))) {
        return false;
    }
    const now = Date.now();
    const cached = dirExistsCache.get(norm);
    if (cached && (now - cached.time < DIR_CACHE_TTL)) {
        return cached.exists;
    }

    const parent = path.dirname(norm);
    if (parent && parent !== norm && parent !== path.parse(norm).root.toLowerCase()) {
        if (!dirExistsFast(parent)) {
            dirExistsCache.set(norm, { time: now, exists: false });
            return false;
        }
    }

    let exists = false;
    try {
        exists = fs.existsSync(norm);
    } catch(e) {
        exists = false;
    }
    dirExistsCache.set(norm, { time: now, exists });
    return exists;
}

function fileExistsFast(filePath) {
    if (!filePath) return false;
    const lower = filePath.toLowerCase();
    if (lower.startsWith('z:') && (global.isExternalMachine || !fs.existsSync('Z:\\'))) {
        return false;
    }
    const parent = path.dirname(filePath);
    if (!dirExistsFast(parent)) return false;
    try {
        return fs.existsSync(filePath);
    } catch(e) {
        return false;
    }
}

const subCatalogFreshnessCache = new Map();
function findManifestSubMeta(manifest, subKey) {
    if (!manifest || !manifest.subCatalogs || !subKey) return null;
    if (manifest.subCatalogs[subKey]) return manifest.subCatalogs[subKey];
    const lower = subKey.toLowerCase();
    for (const [k, v] of Object.entries(manifest.subCatalogs)) {
        if (k.toLowerCase() === lower) return v;
    }
    return null;
}

function buildSubPendingSignature(dMeta, sMeta) {
    const dPart = dMeta ? `${dMeta.itemCount || 0}_${dMeta.fileCount || 0}_${dMeta.byteCount || 0}` : 'none';
    const sPart = sMeta ? `${sMeta.itemCount || 0}_${sMeta.fileCount || 0}_${sMeta.byteCount || 0}` : 'none';
    return `${dPart}|${sPart}`;
}

function resolveModularSubCatalogFile(projectName, type, subFile) {
    if (type === 'server' && global.isExternalMachine) return null;
    projectName = resolveCanonicalProjectName(projectName);
    if (!projectName) return null;

    const normSub = subFile.replace(/\\/g, '/');
    const localPrimary = path.join(MODULAR_PROJECTS_DIR, projectName, type, subFile);
    try {
        if (fs.existsSync(localPrimary)) {
            if (!global.isExternalMachine) {
                const now = Date.now();
                const lastCheck = subCatalogFreshnessCache.get(localPrimary) || 0;
                if (now - lastCheck > 30000) {
                    subCatalogFreshnessCache.set(localPrimary, now);
                    const netChecks = [
                        path.join('S:/_SYNC_CACHE/projects', projectName, type, subFile),
                        path.join('Z:/_SYNC_CACHE/projects', projectName, type, subFile),
                        path.join(UNC_CACHE, 'projects', projectName, type, subFile)
                    ];
                    try {
                        const localSt = fs.statSync(localPrimary);
                        for (const nc of netChecks) {
                            if (path.resolve(nc).toLowerCase() === path.resolve(localPrimary).toLowerCase()) continue;
                            if (fs.existsSync(nc)) {
                                const netSt = fs.statSync(nc);
                                if (netSt.mtimeMs > localSt.mtimeMs + 500) {
                                    fs.copySync(nc, localPrimary, { overwrite: true });
                                    subCatalogMemoryCache.delete(localPrimary);
                                }
                                break;
                            }
                        }
                    } catch (e) {}
                }
            }
            return localPrimary;
        }
    } catch(e) {}

    const missKey = `${projectName}::${type}::${normSub}`.toLowerCase();
    const lastMiss = missingSubCatalogCache.get(missKey) || 0;
    if (Date.now() - lastMiss < MISSING_SUBCATALOG_TTL) {
        return null;
    }

    // Si ya tenemos el manifest cargado en memoria y confirma que este sub-catálogo no existe, evitar red/HTTP
    if (normSub.toLowerCase() !== 'manifest.json') {
        const localManPath = path.join(MODULAR_PROJECTS_DIR, projectName, type, 'manifest.json');
        const memMan = manifestMemoryCache.get(localManPath)?.data;
        if (memMan && memMan.subCatalogs) {
            const subKey = normSub.replace(/\.json$/i, '');
            if (!findManifestSubMeta(memMan, subKey)) {
                missingSubCatalogCache.set(missKey, Date.now());
                return null;
            }
        }
    }

    const localAlt = path.join(CACHE_ROOT, 'projects', projectName, type, subFile);
    if (localAlt !== localPrimary) {
        try {
            if (fs.existsSync(localAlt)) return localAlt;
        } catch(e) {}
    }

    // En LAN (Munro): verificar primero recurso local/montado Z:/_SYNC_CACHE antes de abrir procesos curl
    if (!global.isExternalMachine) {
        const netCandidates = [
            path.join('S:/_SYNC_CACHE/projects', projectName, type, subFile),
            path.join('Z:/_SYNC_CACHE/projects', projectName, type, subFile),
            path.join(UNC_CACHE, 'projects', projectName, type, subFile)
        ];
        for (const nc of netCandidates) {
            try {
                if (fs.existsSync(nc)) {
                    try {
                        fs.ensureDirSync(path.dirname(localPrimary));
                        fs.copySync(nc, localPrimary, { overwrite: true });
                        return localPrimary;
                    } catch(copyErr) {
                        return nc;
                    }
                }
            } catch(e) {}
        }
    }

    if (type !== 'server' || !global.isExternalMachine) {
        const httpSub = fetchSubCatalogFromCentralServer(projectName, type, subFile);
        if (httpSub) return httpSub;
    }

    missingSubCatalogCache.set(missKey, Date.now());
    return null;
}

const pendingSyncCache = new Map();
const SEQ_IMG_REGEX = /^(.*?[._\-]|\D+)(\d+)(\.(?:exr|dpx|png|jpg|jpeg|tiff|tif|tga|cin|ari))$/i;
const JUNK_FILE_REGEX = /(?:\.tmp|\.bak|\.autosave|thumbs\.db|\.ds_store)$/i;

function extractLogicalFilesMap(flatList) {
    const map = new Map();
    if (!Array.isArray(flatList)) return map;
    for (const item of flatList) {
        if (item.isDir || item.isDirectory) continue;
        const rel = (item.relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
        if (!rel || rel.toLowerCase().includes('_gsdata_')) continue;
        const lastSlash = rel.lastIndexOf('/');
        const parentRel = lastSlash === -1 ? '' : rel.substring(0, lastSlash);
        const name = lastSlash === -1 ? rel : rel.substring(lastSlash + 1);
        if (JUNK_FILE_REGEX.test(name)) continue;

        const m = name.match(SEQ_IMG_REGEX);
        const logicalKey = m
            ? (parentRel + '/' + m[1] + '###' + m[3]).toLowerCase()
            : rel.toLowerCase();

        const existing = map.get(logicalKey);
        if (existing) {
            existing.count++;
        } else {
            map.set(logicalKey, { parentRel: parentRel.toLowerCase(), count: 1 });
        }
    }
    return map;
}

function isZLocalOrSubst() {
    return !!(global.isExternalMachine || global.isZRealServer === false);
}

function computeSubCatalogFolderDiff(projectName, subFile, driveData) {
    const folderStats = new Map();
    if (isZLocalOrSubst() || !driveData) return folderStats;

    const srvSubPath = resolveModularSubCatalogFile(projectName, 'server', subFile);
    if (!srvSubPath) return folderStats;

    let serverData = null;
    try {
        serverData = fs.readJsonSync(srvSubPath);
    } catch (e) {
        return folderStats;
    }
    if (!serverData || !Array.isArray(serverData.flatList)) return folderStats;

    const driveLogical = extractLogicalFilesMap(driveData.flatList);
    const serverLogical = extractLogicalFilesMap(serverData.flatList);

    const addAncestors = (parentRelLower, field) => {
        let rootSt = folderStats.get('__root__');
        if (!rootSt) {
            rootSt = { upload: 0, download: 0 };
            folderStats.set('__root__', rootSt);
        }
        rootSt[field]++;

        let cur = parentRelLower;
        while (cur) {
            let st = folderStats.get(cur);
            if (!st) {
                st = { upload: 0, download: 0 };
                folderStats.set(cur, st);
            }
            st[field]++;
            const idx = cur.lastIndexOf('/');
            cur = idx === -1 ? '' : cur.substring(0, idx);
        }
    };

    for (const [k, sEntry] of serverLogical.entries()) {
        const dEntry = driveLogical.get(k);
        if (!dEntry || sEntry.count > dEntry.count) {
            addAncestors(sEntry.parentRel, 'upload');
        }
    }

    for (const [k, dEntry] of driveLogical.entries()) {
        const sEntry = serverLogical.get(k);
        if (!sEntry || dEntry.count > sEntry.count) {
            addAncestors(dEntry.parentRel, 'download');
        }
    }

    return folderStats;
}

function getOrBuildSubCatalogCacheEntry(projectName, type, subFile) {
    const subFilePath = resolveModularSubCatalogFile(projectName, type, subFile);
    if (!subFilePath) return null;

    let srvMtime = 0;
    if (type === 'drive' && !isZLocalOrSubst()) {
        const srvPath = resolveModularSubCatalogFile(projectName, 'server', subFile);
        if (srvPath) {
            try { srvMtime = fs.statSync(srvPath).mtimeMs; } catch (e) {}
        }
    }

    try {
        const st = fs.statSync(subFilePath);
        const compositeMtime = `${st.mtimeMs}_${srvMtime}`;
        const cached = subCatalogMemoryCache.get(subFilePath);
        if (cached && cached.mtime === compositeMtime) {
            return cached;
        }
        const data = fs.readJsonSync(subFilePath);
        const indexRes = buildSubCatalogIndex(data);
        const folderStats = (type === 'drive' && !isZLocalOrSubst())
            ? computeSubCatalogFolderDiff(projectName, subFile, data)
            : new Map();
        const cacheEntry = {
            mtime: compositeMtime,
            parentIndex: indexRes.parentMap,
            pendingFolders: indexRes.pendingDownloadFolders,
            pendingCountMap: indexRes.pendingCountMap,
            folderStats,
            data
        };
        subCatalogMemoryCache.set(subFilePath, cacheEntry);
        return cacheEntry;
    } catch (e) {
        return null;
    }
}

const _pendingManifestSaveTimers = new Map();
function scheduleSaveLocalDriveManifestSummary(canonProj, driveMan) {
    if (!canonProj || !driveMan) return;
    if (_pendingManifestSaveTimers.has(canonProj)) return;
    const t = setTimeout(() => {
        _pendingManifestSaveTimers.delete(canonProj);
        try {
            const localManPath = path.join(MODULAR_PROJECTS_DIR, canonProj, 'drive', 'manifest.json');
            if (fs.existsSync(path.dirname(localManPath))) {
                fs.writeJson(localManPath, driveMan, { spaces: 2 }).then(() => {
                    try {
                        const st = fs.statSync(localManPath);
                        manifestMemoryCache.set(localManPath, { mtime: st.mtimeMs, data: driveMan });
                    } catch (e) {}
                }).catch(() => {});
            }
        } catch (e) {}
    }, 800);
    _pendingManifestSaveTimers.set(canonProj, t);
}

function refreshDriveManifestPendingSummary(projectName, targetSubKey = null, replicateToNetwork = false) {
    const canonProj = resolveCanonicalProjectName(projectName);
    if (!canonProj) return null;
    const driveDir = path.join(MODULAR_PROJECTS_DIR, canonProj, 'drive');
    const srvDir = path.join(MODULAR_PROJECTS_DIR, canonProj, 'server');
    const driveManPath = path.join(driveDir, 'manifest.json');
    const srvManPath = path.join(srvDir, 'manifest.json');
    if (!fs.existsSync(driveManPath) || !fs.existsSync(srvManPath)) return null;

    let driveMan, srvMan;
    try {
        driveMan = fs.readJsonSync(driveManPath);
        srvMan = fs.readJsonSync(srvManPath);
    } catch (e) {
        return null;
    }
    if (!driveMan || !driveMan.subCatalogs) return null;

    driveMan.pendingSummary = driveMan.pendingSummary || {};
    const keys = targetSubKey
        ? Object.keys(driveMan.subCatalogs).filter(k => k.toLowerCase() === targetSubKey.toLowerCase())
        : Object.keys(driveMan.subCatalogs);

    let changed = false;
    for (const subKey of keys) {
        const dMeta = driveMan.subCatalogs[subKey];
        const sMeta = findManifestSubMeta(srvMan, subKey);
        const sig = buildSubPendingSignature(dMeta, sMeta);
        if (!targetSubKey && driveMan.pendingSummary[subKey] && driveMan.pendingSummary[subKey].sig === sig) {
            continue;
        }
        let upload = 0;
        let download = 0;
        if (dMeta && sMeta && ((dMeta.fileCount || 0) > 0 || (sMeta.fileCount || 0) > 0)) {
            const dFile = path.join(driveDir, dMeta.file || `${subKey}.json`);
            const sFile = path.join(srvDir, sMeta.file || `${subKey}.json`);
            if (fs.existsSync(dFile) && fs.existsSync(sFile)) {
                try {
                    const dData = fs.readJsonSync(dFile);
                    const sData = fs.readJsonSync(sFile);
                    const dLog = extractLogicalFilesMap(dData?.flatList || []);
                    const sLog = extractLogicalFilesMap(sData?.flatList || []);
                    for (const [k, sE] of sLog.entries()) {
                        const dE = dLog.get(k);
                        if (!dE || sE.count > dE.count) upload++;
                    }
                    for (const [k, dE] of dLog.entries()) {
                        const sE = sLog.get(k);
                        if (!sE || dE.count > sE.count) download++;
                    }
                } catch (e) {}
            }
        }
        driveMan.pendingSummary[subKey] = { sig, upload, download };
        changed = true;
    }

    if (changed) {
        try {
            fs.writeJsonSync(driveManPath, driveMan, { spaces: 2 });
            const st = fs.statSync(driveManPath);
            manifestMemoryCache.set(driveManPath, { mtime: st.mtimeMs, data: driveMan });
        } catch (e) {}

        if (replicateToNetwork) {
            const alias = driveMan.projectCode;
            const centralCacheDirs = ['S:/_SYNC_CACHE', 'Z:/_SYNC_CACHE']
                .filter(r => fs.existsSync(r) && path.resolve(LOCAL_CACHE_DIR).toLowerCase() !== path.resolve(r).toLowerCase());
            for (const cDir of centralCacheDirs) {
                try {
                    const netMan = path.join(cDir, 'projects', canonProj, 'drive', 'manifest.json');
                    if (fs.existsSync(path.dirname(netMan))) {
                        fs.copySync(driveManPath, netMan, { overwrite: true });
                    }
                    if (alias && alias.toLowerCase() !== canonProj.toLowerCase()) {
                        const netAliasMan = path.join(cDir, 'projects', alias, 'drive', 'manifest.json');
                        if (fs.existsSync(path.dirname(netAliasMan))) {
                            fs.copySync(driveManPath, netAliasMan, { overwrite: true });
                        }
                    }
                } catch (e) {}
            }
        }
    }
    return driveMan.pendingSummary;
}

function checkSubCatalogPendingSync(projectName, type, subFile) {
    if (!isZLocalOrSubst() && type === 'server') {
        return { hasPending: false, count: 0, uploadCount: 0, downloadCount: 0 };
    }
    const canonProj = resolveCanonicalProjectName(projectName);
    const cacheKey = `${canonProj}_${type}_${subFile}`.toLowerCase();
    const now = Date.now();
    if (pendingSyncCache.has(cacheKey)) {
        const cached = pendingSyncCache.get(cacheKey);
        if (now - cached.time < 60000) return cached.data;
    }

    if (type === 'drive' && !isZLocalOrSubst()) {
        const subKey = subFile.replace(/\\/g, '/').replace(/\.json$/i, '');
        const driveMan = getModularManifest(canonProj, 'drive');
        const srvMan = getModularManifest(canonProj, 'server');
        let dMeta = null;
        let sMeta = null;
        let sig = null;
        let sumKey = subKey;

        if (driveMan && driveMan.subCatalogs) {
            dMeta = findManifestSubMeta(driveMan, subKey);
            sMeta = srvMan ? findManifestSubMeta(srvMan, subKey) : null;
            if (dMeta && dMeta.id) sumKey = dMeta.id;

            // Fast-path A: sub-catálogo sin archivos o inexistente en server -> 0ms (sin leer JSON ni tocar red)
            if (!dMeta || !sMeta || ((dMeta.fileCount || 0) === 0 && (sMeta.fileCount || 0) === 0)) {
                const zeroRes = { hasPending: false, count: 0, uploadCount: 0, downloadCount: 0 };
                pendingSyncCache.set(cacheKey, { time: now, data: zeroRes });
                return zeroRes;
            }

            // Fast-path B: leer resumen pre-calculado en manifest.json (13 KB) si la firma coincide -> 0ms
            sig = buildSubPendingSignature(dMeta, sMeta);
            const sumEntry = driveMan.pendingSummary && (driveMan.pendingSummary[sumKey] || driveMan.pendingSummary[subKey]);
            if (sumEntry && sumEntry.sig === sig) {
                const up = sumEntry.upload || 0;
                const down = sumEntry.download || 0;
                const res = {
                    hasPending: (up > 0 || down > 0),
                    count: up > 0 ? up : down,
                    uploadCount: up,
                    downloadCount: down,
                    pendingType: (up > 0 && down > 0) ? 'both' : (up > 0 ? 'upload' : 'download')
                };
                pendingSyncCache.set(cacheKey, { time: now, data: res });
                return res;
            }
        }

        const entry = getOrBuildSubCatalogCacheEntry(canonProj, 'drive', subFile);
        if (entry && entry.folderStats) {
            const rootSt = entry.folderStats.get('__root__') || { upload: 0, download: 0 };
            const up = rootSt.upload || 0;
            const down = rootSt.download || 0;
            const res = {
                hasPending: (up > 0 || down > 0),
                count: up > 0 ? up : down,
                uploadCount: up,
                downloadCount: down,
                pendingType: (up > 0 && down > 0) ? 'both' : (up > 0 ? 'upload' : 'download')
            };
            if (driveMan && sig) {
                driveMan.pendingSummary = driveMan.pendingSummary || {};
                driveMan.pendingSummary[sumKey] = { sig, upload: up, download: down };
                scheduleSaveLocalDriveManifestSummary(canonProj, driveMan);
            }
            pendingSyncCache.set(cacheKey, { time: now, data: res });
            return res;
        }
    }

    const subFilePath = resolveModularSubCatalogFile(projectName, type, subFile);
    if (!subFilePath) {
        const res = { hasPending: false, count: 0, uploadCount: 0, downloadCount: 0 };
        pendingSyncCache.set(cacheKey, { time: now, data: res });
        return res;
    }
    try {
        const data = fs.readJsonSync(subFilePath);
        let missing = 0;
        if (data && Array.isArray(data.flatList) && data.flatList.length > 0) {
            for (const it of data.flatList) {
                if (it.isDir || it.isDirectory) continue;
                const targetLocal = (it.targetLocalPath || it.path || '').replace(/^S:/i, 'Z:');
                if (targetLocal && !fileExistsFast(targetLocal)) {
                    missing++;
                }
            }
        }
        const res = { hasPending: missing > 0, count: missing, uploadCount: 0, downloadCount: missing, pendingType: 'download' };
        pendingSyncCache.set(cacheKey, { time: now, data: res });
        return res;
    } catch(e) {
        return { hasPending: false, count: 0, uploadCount: 0, downloadCount: 0 };
    }
}

function buildSubCatalogIndex(subCatalog) {
    const parentMap = new Map();
    const pendingDownloadFolders = new Set();
    const pendingCountMap = new Map();

    if (subCatalog.flatList && Array.isArray(subCatalog.flatList)) {
        for (const item of subCatalog.flatList) {
            let p = normalizeSlash(item.serverPath || item.onlinePath || item.path);
            if (!p) continue;
            if (subCatalog.type === 'server') {
                p = p.replace(/^S:/i, 'Z:');
            }
            const lastSlash = p.lastIndexOf('/');
            const parentKey = lastSlash === -1 ? '' : p.substring(0, lastSlash).toLowerCase();

            let arr = parentMap.get(parentKey);
            if (!arr) {
                arr = [];
                parentMap.set(parentKey, arr);
            }

            const targetLocal = (item.targetLocalPath || p).replace(/^S:/i, 'Z:');
            const isDirectory = !!item.isDir || !!item.isDirectory;

            const entryObj = {
                name: item.name,
                isDirectory,
                path: p,
                size: item.size || 0,
                modTime: item.modTime,
                targetLocalPath: targetLocal,
                fromCatalog: true,
                isServer: subCatalog.type === 'server',
                localExists: true
            };
            arr.push(entryObj);

            if (targetLocal) {
                const normLocal = normalizeSlash(targetLocal);
                const localLastSlash = normLocal.lastIndexOf('/');
                const localParentKey = localLastSlash === -1 ? '' : normLocal.substring(0, localLastSlash).toLowerCase();
                if (localParentKey && localParentKey !== parentKey) {
                    let localArr = parentMap.get(localParentKey);
                    if (!localArr) {
                        localArr = [];
                        parentMap.set(localParentKey, localArr);
                    }
                    localArr.push(entryObj);
                }
            }
        }
    }

    return { parentMap, pendingDownloadFolders, pendingCountMap };
}

function applyPendingStatusToFolderItem(targetItem, upCount, downCount) {
    if (upCount > 0 || downCount > 0) {
        targetItem.hasPendingSync = true;
        targetItem.pendingUploadCount = upCount;
        targetItem.pendingDownloadCount = downCount;
        targetItem.pendingType = (upCount > 0 && downCount > 0) ? 'both' : (upCount > 0 ? 'upload' : 'download');
        targetItem.pendingCount = upCount > 0 ? upCount : downCount;
    }
    return targetItem;
}

function listFromModularCatalog(requestedPath, type = 'server') {
    if (type === 'server' && global.isExternalMachine) return null;
    const norm = normalizeSlash(requestedPath);
    if (!norm) return null;
    const lowerNorm = norm.toLowerCase().replace(/^s:/i, 'z:');

    const projInfo = findProjectManifestForPath(lowerNorm, type);
    if (!projInfo) return null;

    const { manifest, projectName, category, rootPath } = projInfo;

    const sanitizeManifestChildren = (list) => (list || []).map(c => {
        let childPath = (c.path || '').replace(/^S:/i, 'Z:');
        let targetLocal = (c.targetLocalPath || '').replace(/^S:/i, 'Z:');
        if (!targetLocal && lowerNorm.startsWith('z:/')) {
            targetLocal = norm.replace(/\/+$/, '') + '/' + c.name;
        }
        let localExists = false;
        if (c.localExists !== undefined) {
            localExists = c.localExists;
        } else if (targetLocal) {
            try { localExists = fileExistsFast(targetLocal); } catch(e) {}
        }
        return {
            ...c,
            path: childPath,
            serverPath: (c.serverPath || c.path || '').replace(/^S:/i, 'Z:'),
            targetLocalPath: targetLocal || childPath,
            onlinePath: c.onlinePath || (type === 'drive' ? c.path : undefined),
            localExists
        };
    });

    const decorateRootChildrenWithPending = (sanitizedList) => {
        if (category === 'work') {
            for (const rChild of sanitizedList) {
                const nameLower = rChild.name.toLowerCase();
                if (nameLower === 'episodios') {
                    const eps = manifest.episodiosChildren || [];
                    let totalUp = 0;
                    let totalDown = 0;
                    for (const ep of eps) {
                        const epStatus = checkSubCatalogPendingSync(projectName, type, `episodios/${ep.name}.json`);
                        if (epStatus.hasPending) {
                            totalUp += (epStatus.uploadCount || 0);
                            totalDown += (epStatus.downloadCount || 0);
                        }
                    }
                    applyPendingStatusToFolderItem(rChild, totalUp, totalDown);
                } else if (nameLower === 'assets2d') {
                    const a2Status = checkSubCatalogPendingSync(projectName, type, 'assets2D.json');
                    if (a2Status.hasPending) {
                        applyPendingStatusToFolderItem(rChild, a2Status.uploadCount || 0, a2Status.downloadCount || 0);
                    }
                } else if (nameLower === 'assets3d') {
                    const a3Status = checkSubCatalogPendingSync(projectName, type, 'assets3D.json');
                    if (a3Status.hasPending) {
                        applyPendingStatusToFolderItem(rChild, a3Status.uploadCount || 0, a3Status.downloadCount || 0);
                    }
                }
            }
        } else if (category === 'media') {
            for (const rChild of sanitizedList) {
                if (rChild.name.toLowerCase() === '_gsdata_') continue;
                const mStatus = checkSubCatalogPendingSync(projectName, type, `media/${rChild.name}.json`);
                if (mStatus.hasPending) {
                    applyPendingStatusToFolderItem(rChild, mStatus.uploadCount || 0, mStatus.downloadCount || 0);
                }
            }
        }
        return sanitizedList;
    };

    // Raíz de Work o Media -> Devolver hijos directos desde manifest
    if (lowerNorm === rootPath) {
        const rawChildren = category === 'work' ? manifest.rootChildren?.work : manifest.rootChildren?.media;
        return decorateRootChildrenWithPending(sanitizeManifestChildren(rawChildren));
    }

    const rel = lowerNorm.substring(rootPath.length).replace(/^\/+/, '');
    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) {
        const rawChildren = category === 'work' ? manifest.rootChildren?.work : manifest.rootChildren?.media;
        return decorateRootChildrenWithPending(sanitizeManifestChildren(rawChildren));
    }

    let subFile = '';
    if (category === 'work') {
        if (parts[0] === 'assets2d') {
            subFile = 'assets2D.json';
        } else if (parts[0] === 'assets3d') {
            subFile = 'assets3D.json';
        } else if (parts[0] === 'episodios') {
            if (parts.length === 1) {
                const epsList = sanitizeManifestChildren(manifest.episodiosChildren);
                for (const ep of epsList) {
                    const epStatus = checkSubCatalogPendingSync(projectName, type, `episodios/${ep.name}.json`);
                    if (epStatus.hasPending) {
                        applyPendingStatusToFolderItem(ep, epStatus.uploadCount || 0, epStatus.downloadCount || 0);
                    }
                }
                return epsList;
            }
            subFile = `episodios/${parts[1]}.json`;
        } else {
            subFile = 'misc.json';
        }
    } else {
        subFile = `media/${parts[0]}.json`;
    }

    const cacheEntry = getOrBuildSubCatalogCacheEntry(projectName, type, subFile);
    if (!cacheEntry) {
        if (subFile.startsWith('episodios/')) {
            const rootSubFile = resolveModularSubCatalogFile(projectName, type, 'episodios/_root.json');
            if (rootSubFile) return [];
        }
        return null;
    }

    if (!cacheEntry.parentIndex) return null;
    const lowerNormStripped = lowerNorm.replace(/^[a-zA-Z]:/, '');
    const zVariant = lowerNorm.replace(/^[a-zA-Z]:/, 'z:');
    const cVariant = lowerNorm.replace(/^[a-zA-Z]:/, 'c:');

    const children = cacheEntry.parentIndex.get(lowerNorm)
        || cacheEntry.parentIndex.get(lowerNorm + '/')
        || cacheEntry.parentIndex.get(lowerNormStripped)
        || cacheEntry.parentIndex.get(lowerNormStripped + '/')
        || cacheEntry.parentIndex.get(zVariant)
        || cacheEntry.parentIndex.get(zVariant + '/')
        || cacheEntry.parentIndex.get(cVariant)
        || cacheEntry.parentIndex.get(cVariant + '/');

    if (!children) return [];

    let existingNamesSet = null;
    if (children.length > 0 && children[0].targetLocalPath) {
        const parentDir = path.dirname(children[0].targetLocalPath);
        if (parentDir) {
            try {
                if (fs.existsSync(parentDir)) {
                    existingNamesSet = new Set(fs.readdirSync(parentDir).map(n => n.toLowerCase()));
                } else {
                    existingNamesSet = new Set();
                }
            } catch(e) {
                existingNamesSet = null;
            }
        }
    }

    const canDoLiveShotLookahead = (type === 'drive' && !global.isExternalMachine && parts.length >= 2 && children.length <= 20);

    return children.map(c => {
        let localExists = false;
        if (c.localExists !== undefined && existingNamesSet === null) {
            localExists = c.localExists;
        } else if (existingNamesSet) {
            localExists = existingNamesSet.has((c.name || '').toLowerCase());
        }

        const copyItem = {
            ...c,
            localExists
        };

        if (copyItem.isDirectory && cacheEntry.folderStats) {
            const childRel = (rel ? `${rel}/${c.name}` : c.name).toLowerCase();
            const fSt = cacheEntry.folderStats.get(childRel);
            let upC = fSt ? (fSt.upload || 0) : 0;
            let downC = fSt ? (fSt.download || 0) : 0;

            // Live 1-level lookahead en carpetas de plano/asset para detectar archivos recién creados en Z: aún no escaneados por el Worker
            if (canDoLiveShotLookahead && copyItem.targetLocalPath) {
                try {
                    let physPath = copyItem.targetLocalPath;
                    // Solo chequear S: como fallback si esta máquina tiene Z: real en SMB, NUNCA en máquinas con subst local Z:
                    if (!isZLocalOrSubst()) {
                        const sAlt = physPath.replace(/^Z:/i, 'S:');
                        if (!fs.existsSync(physPath) && fs.existsSync(sAlt)) physPath = sAlt;
                    }
                    if (fs.existsSync(physPath)) {
                        const diskEntries = fs.readdirSync(physPath, { withFileTypes: true });
                        const childDriveKey = copyItem.targetLocalPath.toLowerCase();
                        const driveChildItems = cacheEntry.parentIndex.get(childDriveKey) || [];
                        const driveChildNames = new Set(driveChildItems.map(di => (di.name || '').toLowerCase()));

                        const uncatalogedSeqs = new Set();
                        let directMissingInDrive = 0;
                        for (const de of diskEntries) {
                            if (de.name.toLowerCase() === '_gsdata_' || JUNK_FILE_REGEX.test(de.name)) continue;
                            if (!driveChildNames.has(de.name.toLowerCase())) {
                                const m = !de.isDirectory() ? de.name.match(SEQ_IMG_REGEX) : null;
                                if (m) {
                                    const seqK = (m[1] + '###' + m[3]).toLowerCase();
                                    if (!uncatalogedSeqs.has(seqK)) {
                                        uncatalogedSeqs.add(seqK);
                                        directMissingInDrive++;
                                    }
                                } else {
                                    directMissingInDrive++;
                                }
                            }
                        }
                        if (directMissingInDrive > upC) {
                            upC = directMissingInDrive;
                        }
                    }
                } catch (e) {}
            }

            applyPendingStatusToFolderItem(copyItem, upC, downC);
        }

        return copyItem;
    });
}

/**
 * Refresca exclusivamente el sub-catálogo correspondiente a una ruta objetivo (ej. sólo B01)
 */
async function refreshSubCatalog(projectName, targetPath, type = 'server') {
    const config = getProjectConfig(projectName);
    if (!config) throw new Error(`Proyecto ${projectName} no configurado`);

    const manifest = getModularManifest(projectName, type);
    if (!manifest) {
        if (type === 'server') {
            await generateServerCatalog(projectName, { mode: 'auto' });
        } else {
            await refreshCatalogSubfolder(projectName, targetPath);
        }
        return { success: true, fallback: true };
    }

    const normTarget = normalizeSlash(targetPath).replace(/^S:/i, 'Z:');
    const lowerNorm = normTarget.toLowerCase();

    let isWork = false;
    let isMedia = false;
    let rel = '';

    const candidateMediaRoots = [
        manifest.roots?.media?.server,
        manifest.roots?.media?.local,
        manifest.roots?.media?.online,
        config.roots?.media,
        config.roots?.onlineMedia,
        `Z:/INTERNO/MEDIA/${config.client || ''}/${projectName}`,
        `G:/Unidades compartidas/${projectName}_media`
    ].filter(Boolean).map(p => normalizeSlash(p).toLowerCase());

    const candidateWorkRoots = [
        manifest.roots?.work?.server,
        manifest.roots?.work?.local,
        manifest.roots?.work?.online,
        config.roots?.work,
        config.roots?.onlineWork,
        `Z:/${config.client || ''}/${projectName}`,
        `G:/Unidades compartidas/${projectName}`
    ].filter(Boolean).map(p => normalizeSlash(p).toLowerCase());

    for (const mr of candidateMediaRoots) {
        if (lowerNorm.startsWith(mr + '/') || lowerNorm === mr) {
            isMedia = true;
            rel = normTarget.substring(mr.length).replace(/^\/+/, '');
            break;
        }
    }

    if (!isMedia) {
        for (const wr of candidateWorkRoots) {
            if (lowerNorm.startsWith(wr + '/') || lowerNorm === wr) {
                isWork = true;
                rel = normTarget.substring(wr.length).replace(/^\/+/, '');
                break;
            }
        }
    }

    if (!isWork && !isMedia) {
        rel = normTarget.replace(/^[A-Za-z]:\//, '').replace(/^\/+/, '');
        const mediaPrefixRegex = new RegExp('^interno/media/(?:[^/]+/' + projectName + '|[^/]+)/?', 'i');
        const workPrefixRegex = new RegExp('^(?:interno/)?(?:[^/]+/' + projectName + '|' + projectName + ')/?', 'i');
        if (rel.toLowerCase().startsWith('interno/media/')) {
            isMedia = true;
            rel = rel.replace(mediaPrefixRegex, '').replace(/^\/+/, '');
        } else {
            isWork = true;
            rel = rel.replace(workPrefixRegex, '').replace(/^\/+/, '');
        }
    }

    const parts = rel.split('/').filter(Boolean);
    let subKey = '';
    let subFile = '';
    let scanRel = '';
    let category = isWork ? 'work' : 'media';

    if (isWork) {
        if (parts[0]?.toLowerCase() === 'assets2d') {
            subKey = 'assets2D';
            subFile = 'assets2D.json';
            scanRel = 'assets2D';
        } else if (parts[0]?.toLowerCase() === 'assets3d') {
            subKey = 'assets3D';
            subFile = 'assets3D.json';
            scanRel = 'assets3D';
        } else if (parts[0]?.toLowerCase() === 'episodios') {
            if (parts.length > 1) {
                subKey = `episodios/${parts[1]}`;
                subFile = `episodios/${parts[1]}.json`;
                scanRel = `episodios/${parts[1]}`;
            } else {
                subKey = 'episodios/_root';
                subFile = 'episodios/_root.json';
                scanRel = 'episodios';
            }
        } else {
            subKey = 'misc';
            subFile = 'misc.json';
            scanRel = parts[0] || '';
        }
    } else {
        const topFolder = parts[0] || 'misc';
        subKey = `media/${topFolder}`;
        subFile = `media/${topFolder}.json`;
        scanRel = topFolder;
    }

    const outDir = path.join(MODULAR_PROJECTS_DIR, projectName, type);
    const subFilePath = path.join(outDir, subFile);
    const existingSubPath = resolveModularSubCatalogFile(projectName, type, subFile);
    const isPartialSubfolder = rel && scanRel && rel.toLowerCase() !== scanRel.toLowerCase() && rel.toLowerCase().startsWith(scanRel.toLowerCase() + '/') && existingSubPath && fs.existsSync(existingSubPath);
    const effectiveScanRel = isPartialSubfolder ? rel : scanRel;

    console.log(`[REFRESH SUB-CATALOG] (${type.toUpperCase()}) Proyecto: ${projectName}, Sub-catálogo: ${subFile}, Rel: ${effectiveScanRel} (Parcial: ${!!isPartialSubfolder})`);

    let scanned = [];
    let targetFolderExists = false;
    if (type === 'server') {
        let rootPhysicalBase = isWork
            ? (config.roots?.work ? normalizeSlash(config.roots.work) : 'Z:/' + (config.client || '') + '/' + projectName)
            : (config.roots?.media ? normalizeSlash(config.roots.media) : 'Z:/INTERNO/MEDIA/' + (config.client || '') + '/' + projectName);
        const sCandidate = rootPhysicalBase.replace(/^Z:/i, 'S:');
        if (fs.existsSync(sCandidate)) {
            rootPhysicalBase = sCandidate;
        }
        const fullPhysical = effectiveScanRel ? path.join(rootPhysicalBase, effectiveScanRel) : rootPhysicalBase;
        if (fs.existsSync(fullPhysical)) {
            targetFolderExists = true;
            scanned = await scanDirectoryRecursive(fullPhysical);
        }
    } else {
        const onlineRoot = isWork ? config.roots.onlineWork : config.roots.onlineMedia;
        const fullOnlineSub = effectiveScanRel ? `${onlineRoot}/${effectiveScanRel}` : onlineRoot;
        try {
            scanned = scanWithRclone(fullOnlineSub);
            if (Array.isArray(scanned) && scanned.length > 0) targetFolderExists = true;
        } catch (e) {
            console.warn(`[REFRESH SUB-CATALOG] Error rclone en ${fullOnlineSub}:`, e.message);
        }
    }

    const scannedItems = [];
    let itemId = Date.now();

    const rootLogical = isWork 
        ? (type === 'server' ? manifest.roots?.work?.server : manifest.roots?.work?.online) 
        : (type === 'server' ? manifest.roots?.media?.server : manifest.roots?.media?.online);
    const rootLocal = isWork ? config.roots?.work : config.roots?.media;

    for (const raw of scanned) {
        const itemRel = effectiveScanRel ? `${effectiveScanRel}/${raw.relPath}` : raw.relPath;
        const ext = raw.isDir ? '' : path.extname(raw.name).toLowerCase();
        const size = raw.size || 0;

        const processed = {
            id: `${type}_${category}_${itemId++}`,
            category: category,
            name: raw.name,
            relPath: itemRel,
            ext: ext,
            isDir: raw.isDir,
            size: size,
            modTime: raw.modTime
        };

        if (type === 'server') {
            processed.serverPath = `${rootLogical}/${itemRel}`;
            processed.targetLocalPath = `${rootLocal}/${itemRel}`;
        } else {
            processed.onlinePath = `${rootLogical}/${itemRel}`;
            processed.targetLocalPath = `${rootLocal}/${itemRel}`;
        }

        scannedItems.push(processed);
    }

    let finalItems = scannedItems;
    if (isPartialSubfolder) {
        try {
            const existingData = fs.readJsonSync(existingSubPath);
            const prefixLower = effectiveScanRel.toLowerCase();
            const kept = (existingData.flatList || []).filter(item => {
                const r = (item.relPath || '').replace(/\\/g, '/').toLowerCase();
                if (targetFolderExists) {
                    return !r.startsWith(prefixLower + '/');
                }
                return r !== prefixLower && !r.startsWith(prefixLower + '/');
            });

            if (targetFolderExists) {
                const existingRels = new Set(kept.map(i => (i.relPath || '').replace(/\\/g, '/').toLowerCase()));
                const relSegs = effectiveScanRel.split('/').filter(Boolean);
                let accum = '';
                for (let i = 0; i < relSegs.length; i++) {
                    accum = accum ? `${accum}/${relSegs[i]}` : relSegs[i];
                    if (accum.toLowerCase() === scanRel.toLowerCase()) continue;
                    if (!existingRels.has(accum.toLowerCase())) {
                        const dirObj = {
                            id: `${type}_${category}_${itemId++}`,
                            category,
                            name: relSegs[i],
                            relPath: accum,
                            ext: '',
                            isDir: true,
                            size: 0,
                            modTime: new Date().toISOString()
                        };
                        if (type === 'server') {
                            dirObj.serverPath = `${rootLogical}/${accum}`;
                            dirObj.targetLocalPath = `${rootLocal}/${accum}`;
                        } else {
                            dirObj.onlinePath = `${rootLogical}/${accum}`;
                            dirObj.targetLocalPath = `${rootLocal}/${accum}`;
                        }
                        kept.push(dirObj);
                        existingRels.add(accum.toLowerCase());
                    }
                }
            }

            finalItems = kept.concat(scannedItems);
        } catch (e) {
            finalItems = scannedItems;
        }
    }

    let byteCount = 0;
    let fileCount = 0;
    for (const it of finalItems) {
        if (!it.isDir && !it.isDirectory) {
            byteCount += (it.size || 0);
            fileCount++;
        }
    }

    fs.ensureDirSync(path.dirname(subFilePath));
    fs.writeJsonSync(subFilePath, {
        id: subKey,
        project: projectName,
        type: type,
        category: category,
        prefix: scanRel,
        file: subFile,
        stats: { itemCount: finalItems.length, fileCount, byteCount },
        flatList: finalItems
    }, { spaces: 2 });

    subCatalogMemoryCache.delete(subFilePath);
    pendingSyncCache.clear();

    if (manifest.subCatalogs && manifest.subCatalogs[subKey]) {
        manifest.subCatalogs[subKey].itemCount = finalItems.length;
        manifest.subCatalogs[subKey].fileCount = fileCount;
        manifest.subCatalogs[subKey].byteCount = byteCount;
        manifest.generatedAt = new Date().toISOString();
        const manifestPath = path.join(outDir, 'manifest.json');
        fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
        manifestMemoryCache.delete(manifestPath);
    }

    // Replicar a red central (S:/_SYNC_CACHE y Z:/_SYNC_CACHE) si existe
    const centralCacheDirs = ['S:/_SYNC_CACHE', 'Z:/_SYNC_CACHE']
        .filter(r => fs.existsSync(r) && path.resolve(LOCAL_CACHE_DIR).toLowerCase() !== path.resolve(r).toLowerCase());
    for (const cDir of centralCacheDirs) {
        try {
            const netSubPath = path.join(cDir, 'projects', projectName, type, subFile);
            const netManPath = path.join(cDir, 'projects', projectName, type, 'manifest.json');
            fs.ensureDirSync(path.dirname(netSubPath));
            fs.copySync(subFilePath, netSubPath, { overwrite: true });
            if (fs.existsSync(path.join(outDir, 'manifest.json'))) {
                fs.copySync(path.join(outDir, 'manifest.json'), netManPath, { overwrite: true });
            }
        } catch(e) {}
    }

    try {
        refreshDriveManifestPendingSummary(projectName, subKey, true);
    } catch (e) {}

    return {
        success: true,
        subCatalog: subFile,
        itemsCount: finalItems.length,
        fileCount,
        byteCount
    };
}

/**
 * Registra o actualiza quirúrgicamente un item transferido (subido o descargado)
 * directamente en los sub-catálogos modulares y catálogos monolíticos en disco y memoria.
 * Toma < 5 ms.
 */
function recordTransferredItem(projectName, item, type = 'drive') {
    if (!projectName || !item) return false;
    const config = getProjectConfig(projectName);
    if (!config) return false;

    const normLocal = normalizeSlash(item.localPath || item.path || '');
    const normWork = normalizeSlash(config.roots?.work || '');
    const normMedia = normalizeSlash(config.roots?.media || '');

    let category = 'work';
    let relPath = '';

    if (normWork && (normLocal.toLowerCase().startsWith(normWork.toLowerCase() + '/') || normLocal.toLowerCase() === normWork.toLowerCase())) {
        category = 'work';
        relPath = normLocal.substring(normWork.length).replace(/^\/+/, '');
    } else if (normMedia && (normLocal.toLowerCase().startsWith(normMedia.toLowerCase() + '/') || normLocal.toLowerCase() === normMedia.toLowerCase())) {
        category = 'media';
        relPath = normLocal.substring(normMedia.length).replace(/^\/+/, '');
    } else {
        if (normLocal.toLowerCase().includes('media')) {
            category = 'media';
            const mIdx = normLocal.toLowerCase().indexOf('media');
            relPath = normLocal.substring(mIdx + 5).replace(/^\/+/, '');
        } else {
            category = 'work';
            relPath = item.relPath || item.name || '';
        }
    }

    const subMeta = getSubCatalogKey({ relPath, category });
    const ext = item.isDir ? '' : path.extname(item.name || relPath).toLowerCase();
    const onlineRoot = category === 'work' ? config.roots?.onlineWork : config.roots?.onlineMedia;
    const serverRoot = category === 'work' 
        ? (config.roots?.serverWork || `Z:/atresmedia/${projectName}`) 
        : (config.roots?.serverMedia || `Z:/INTERNO/MEDIA/atresmedia/${projectName}`);
    const targetLocalRoot = category === 'work' ? config.roots?.work : config.roots?.media;

    const processedItem = {
        id: `${type}_${category}_${Date.now()}`,
        category: category,
        name: item.name || path.basename(relPath),
        relPath: relPath,
        ext: ext,
        isDir: !!item.isDir,
        size: item.size || 0,
        modTime: item.modTime || new Date().toISOString()
    };

    if (type === 'server') {
        processedItem.serverPath = `${serverRoot}/${relPath}`;
        processedItem.targetLocalPath = `${targetLocalRoot}/${relPath}`;
    } else {
        processedItem.onlinePath = `${onlineRoot || `G:/Unidades compartidas/${projectName}`}/${relPath}`;
        processedItem.targetLocalPath = `${targetLocalRoot}/${relPath}`;
    }

    const targetRoots = [
        path.join(LOCAL_CACHE_DIR, 'projects'),
        'Z:/_SYNC_CACHE/projects'
    ].filter(d => fs.existsSync(d));

    const uniqueBases = [...new Set(targetRoots.map(d => path.resolve(d)))];

    for (const baseDir of uniqueBases) {
        const subFilePath = path.join(baseDir, projectName, type, subMeta.file);
        if (fs.existsSync(subFilePath)) {
            try {
                const subData = fs.readJsonSync(subFilePath);
                if (subData && Array.isArray(subData.flatList)) {
                    const normRel = relPath.toLowerCase();
                    const existingIdx = subData.flatList.findIndex(i => (i.relPath || '').toLowerCase() === normRel);
                    if (existingIdx >= 0) {
                        const oldSize = subData.flatList[existingIdx].size || 0;
                        subData.flatList[existingIdx] = { ...subData.flatList[existingIdx], ...processedItem };
                        if (!processedItem.isDir) {
                            subData.stats = subData.stats || {};
                            subData.stats.byteCount = (subData.stats.byteCount || 0) - oldSize + (processedItem.size || 0);
                        }
                    } else {
                        subData.flatList.push(processedItem);
                        subData.stats = subData.stats || {};
                        subData.stats.itemCount = (subData.stats.itemCount || 0) + 1;
                        if (!processedItem.isDir) {
                            subData.stats.fileCount = (subData.stats.fileCount || 0) + 1;
                            subData.stats.byteCount = (subData.stats.byteCount || 0) + (processedItem.size || 0);
                        }
                    }
                    fs.writeJsonSync(subFilePath, subData, { spaces: 2 });
                    subCatalogMemoryCache.delete(subFilePath);
                }
            } catch (e) {
                console.warn(`[RECORD TRANSFERRED] Error actualizando ${subFilePath}:`, e.message);
            }
        }

        // Actualizar manifest.json si existe
        const manPath = path.join(baseDir, projectName, type, 'manifest.json');
        if (fs.existsSync(manPath)) {
            try {
                const man = fs.readJsonSync(manPath);
                if (man.subCatalogs && man.subCatalogs[subMeta.key]) {
                    man.subCatalogs[subMeta.key].itemCount = (man.subCatalogs[subMeta.key].itemCount || 0) + 1;
                    if (!processedItem.isDir) {
                        man.subCatalogs[subMeta.key].fileCount = (man.subCatalogs[subMeta.key].fileCount || 0) + 1;
                        man.subCatalogs[subMeta.key].byteCount = (man.subCatalogs[subMeta.key].byteCount || 0) + (processedItem.size || 0);
                        if (man.stats) {
                            man.stats.totalFiles = (man.stats.totalFiles || 0) + 1;
                            man.stats.totalBytes = (man.stats.totalBytes || 0) + (processedItem.size || 0);
                        }
                    }
                    if (man.pendingSummary && man.pendingSummary[subMeta.key]) {
                        delete man.pendingSummary[subMeta.key];
                    }
                    man.generatedAt = new Date().toISOString();
                    fs.writeJsonSync(manPath, man, { spaces: 2 });
                    manifestMemoryCache.delete(manPath);
                }
            } catch (e) {}
        }
    }

    // Actualizar también catálogos monolíticos si existen (surf_love.json / server_surf_love.json)
    const monoRoots = [LOCAL_CACHE_DIR, 'Z:/_SYNC_CACHE'].filter(d => fs.existsSync(d));
    const monoFile = type === 'server' ? `server_${projectName}.json` : `${projectName}.json`;
    for (const mr of monoRoots) {
        const p = path.join(mr, monoFile);
        if (fs.existsSync(p)) {
            try {
                const cat = fs.readJsonSync(p);
                if (cat && Array.isArray(cat.flatList)) {
                    const normRel = relPath.toLowerCase();
                    const existingIdx = cat.flatList.findIndex(i => (i.relPath || '').toLowerCase() === normRel);
                    if (existingIdx >= 0) {
                        cat.flatList[existingIdx] = { ...cat.flatList[existingIdx], ...processedItem };
                    } else {
                        cat.flatList.push(processedItem);
                        if (cat.stats) {
                            cat.stats.totalFiles = (cat.stats.totalFiles || 0) + 1;
                            cat.stats.totalBytes = (cat.stats.totalBytes || 0) + (processedItem.size || 0);
                        }
                    }
                    fs.writeJsonSync(p, cat, { spaces: 2 });
                }
            } catch (e) {}
        }
    }

    clearMemoryCaches();
    return true;
}

/**
 * Actualiza en caliente los catálogos modulares y monolíticos cuando un archivo o carpeta es renombrado.
 */
function recordRenamedItem(projectName, oldPath, newPath) {
    if (!oldPath || !newPath) return false;

    const normOld = normalizeSlash(oldPath);
    const normNew = normalizeSlash(newPath);
    const oldName = path.basename(normOld);
    const newName = path.basename(normNew);
    const lowerOld = normOld.toLowerCase();

    function replacePrefix(str, oPref, nPref) {
        if (!str) return str;
        const sNorm = normalizeSlash(str);
        if (sNorm.toLowerCase() === oPref.toLowerCase()) {
            return nPref;
        }
        if (sNorm.toLowerCase().startsWith(oPref.toLowerCase() + '/')) {
            return nPref + sNorm.substring(oPref.length);
        }
        return str;
    }

    if (!projectName && typeof findProjectManifestForPath === 'function') {
        const pInfo = findProjectManifestForPath(normOld, 'server') || findProjectManifestForPath(normOld, 'drive');
        if (pInfo && pInfo.project) projectName = pInfo.project;
    }
    if (!projectName) {
        const m = normOld.match(/[\\/]([a-zA-Z0-9_\-]+)[\\/](?:workflow|episodios|assets2D|assets3D|_Out|_ET_InPost)/i);
        if (m) projectName = m[1];
    }
    if (!projectName) return false;

    const targetRoots = [
        path.join(LOCAL_CACHE_DIR, 'projects'),
        'Z:/_SYNC_CACHE/projects'
    ].filter(d => fs.existsSync(d));

    const uniqueBases = [...new Set(targetRoots.map(d => path.resolve(d)))];
    const types = ['server', 'drive'];

    for (const baseDir of uniqueBases) {
        for (const type of types) {
            const typeDir = path.join(baseDir, projectName, type);
            if (!fs.existsSync(typeDir)) continue;

            try {
                const subFiles = fs.readdirSync(typeDir).filter(f => f.endsWith('.json') && f !== 'manifest.json');
                for (const sf of subFiles) {
                    const subFilePath = path.join(typeDir, sf);
                    try {
                        let subData = subCatalogMemoryCache.get(subFilePath);
                        if (!subData) {
                            subData = fs.readJsonSync(subFilePath);
                        }
                        if (subData && Array.isArray(subData.flatList)) {
                            let modified = false;
                            for (const item of subData.flatList) {
                                const itemPath = normalizeSlash(item.path || item.serverPath || item.targetLocalPath || item.onlinePath || '');
                                const itemLower = itemPath.toLowerCase();

                                if (itemLower === lowerOld) {
                                    item.name = newName;
                                    if (item.ext !== undefined && !item.isDir) {
                                        item.ext = path.extname(newName).toLowerCase();
                                    }
                                    if (item.path) item.path = replacePrefix(item.path, normOld, normNew);
                                    if (item.serverPath) item.serverPath = replacePrefix(item.serverPath, normOld, normNew);
                                    if (item.targetLocalPath) item.targetLocalPath = replacePrefix(item.targetLocalPath, normOld, normNew);
                                    if (item.onlinePath) item.onlinePath = replacePrefix(item.onlinePath, normOld, normNew);
                                    if (item.relPath) {
                                        const pRel = path.dirname(item.relPath).replace(/\\/g, '/');
                                        item.relPath = pRel === '.' ? newName : (pRel + '/' + newName);
                                    }
                                    modified = true;
                                } else if (itemLower.startsWith(lowerOld + '/')) {
                                    if (item.path) item.path = replacePrefix(item.path, normOld, normNew);
                                    if (item.serverPath) item.serverPath = replacePrefix(item.serverPath, normOld, normNew);
                                    if (item.targetLocalPath) item.targetLocalPath = replacePrefix(item.targetLocalPath, normOld, normNew);
                                    if (item.onlinePath) item.onlinePath = replacePrefix(item.onlinePath, normOld, normNew);
                                    if (item.relPath) {
                                        item.relPath = replacePrefix(item.relPath, path.basename(normOld), newName);
                                    }
                                    modified = true;
                                }
                            }

                            if (modified) {
                                fs.writeJsonSync(subFilePath, subData, { spaces: 2 });
                                subCatalogMemoryCache.delete(subFilePath);
                            }
                        }
                    } catch (e) {
                        console.warn(`[RECORD RENAMED] Error actualizando ${subFilePath}:`, e.message);
                    }
                }
            } catch (e) {}

            // Actualizar manifest.json si existe
            const manPath = path.join(typeDir, 'manifest.json');
            if (fs.existsSync(manPath)) {
                try {
                    let man = fs.readJsonSync(manPath);
                    let manModified = false;
                    if (man && man.topFolders) {
                        for (const cat of ['work', 'media']) {
                            if (Array.isArray(man.topFolders[cat])) {
                                for (const item of man.topFolders[cat]) {
                                    const itemPath = normalizeSlash(item.path || '');
                                    if (itemPath.toLowerCase() === lowerOld) {
                                        item.name = newName;
                                        item.path = replacePrefix(item.path, normOld, normNew);
                                        manModified = true;
                                    } else if (itemPath.toLowerCase().startsWith(lowerOld + '/')) {
                                        item.path = replacePrefix(item.path, normOld, normNew);
                                        manModified = true;
                                    }
                                }
                            }
                        }
                    }
                    if (man && Array.isArray(man.flatList)) {
                        for (const item of man.flatList) {
                            const itemPath = normalizeSlash(item.path || item.serverPath || item.targetLocalPath || '');
                            if (itemPath.toLowerCase() === lowerOld) {
                                item.name = newName;
                                if (item.path) item.path = replacePrefix(item.path, normOld, normNew);
                                if (item.serverPath) item.serverPath = replacePrefix(item.serverPath, normOld, normNew);
                                if (item.targetLocalPath) item.targetLocalPath = replacePrefix(item.targetLocalPath, normOld, normNew);
                                manModified = true;
                            } else if (itemPath.toLowerCase().startsWith(lowerOld + '/')) {
                                if (item.path) item.path = replacePrefix(item.path, normOld, normNew);
                                if (item.serverPath) item.serverPath = replacePrefix(item.serverPath, normOld, normNew);
                                if (item.targetLocalPath) item.targetLocalPath = replacePrefix(item.targetLocalPath, normOld, normNew);
                                manModified = true;
                            }
                        }
                    }
                    if (manModified) {
                        fs.writeJsonSync(manPath, man, { spaces: 2 });
                        manifestMemoryCache.delete(manPath);
                    }
                } catch (e) {}
            }
        }
    }

    // Actualizar catálogos monolíticos si existen
    const monoRoots = [LOCAL_CACHE_DIR, 'Z:/_SYNC_CACHE'].filter(d => fs.existsSync(d));
    for (const mr of monoRoots) {
        for (const type of types) {
            const monoFile = type === 'server' ? `server_${projectName}.json` : `${projectName}.json`;
            const p = path.join(mr, monoFile);
            if (fs.existsSync(p)) {
                try {
                    const cat = fs.readJsonSync(p);
                    if (cat && Array.isArray(cat.flatList)) {
                        let modified = false;
                        for (const item of cat.flatList) {
                            const itemPath = normalizeSlash(item.path || item.serverPath || item.targetLocalPath || item.onlinePath || '');
                            if (itemPath.toLowerCase() === lowerOld) {
                                item.name = newName;
                                if (item.path) item.path = replacePrefix(item.path, normOld, normNew);
                                if (item.serverPath) item.serverPath = replacePrefix(item.serverPath, normOld, normNew);
                                if (item.targetLocalPath) item.targetLocalPath = replacePrefix(item.targetLocalPath, normOld, normNew);
                                if (item.onlinePath) item.onlinePath = replacePrefix(item.onlinePath, normOld, normNew);
                                modified = true;
                            } else if (itemPath.toLowerCase().startsWith(lowerOld + '/')) {
                                if (item.path) item.path = replacePrefix(item.path, normOld, normNew);
                                if (item.serverPath) item.serverPath = replacePrefix(item.serverPath, normOld, normNew);
                                if (item.targetLocalPath) item.targetLocalPath = replacePrefix(item.targetLocalPath, normOld, normNew);
                                if (item.onlinePath) item.onlinePath = replacePrefix(item.onlinePath, normOld, normNew);
                                modified = true;
                            }
                        }
                        if (modified) {
                            fs.writeJsonSync(p, cat, { spaces: 2 });
                        }
                    }
                } catch (e) {}
            }
        }
    }

    clearMemoryCaches();
    return true;
}

const driveCatalogMemoryCache = new Map();

function buildDriveCatalogParentIndex(catalog) {
    const parentMap = new Map();

    if (catalog.flatList && Array.isArray(catalog.flatList)) {
        for (const item of catalog.flatList) {
            const p = normalizeSlash(item.onlinePath);
            if (!p) continue;
            const lastSlash = p.lastIndexOf('/');
            const parentKey = lastSlash === -1 ? '' : p.substring(0, lastSlash).toLowerCase();

            let arr = parentMap.get(parentKey);
            if (!arr) {
                arr = [];
                parentMap.set(parentKey, arr);
            }

            arr.push({
                name: item.name,
                isDirectory: !!item.isDir,
                path: p,
                size: item.size || 0,
                modTime: item.modTime,
                targetLocalPath: item.targetLocalPath || null,
                fromCatalog: true
            });
        }
    }

    for (const [key, list] of parentMap.entries()) {
        list.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
    }

    return parentMap;
}

/**
 * Consulta síncrona de elementos virtuales dentro de un catálogo para navegación offline transparente (Google Drive)
 */
function listFromCatalog(requestedPath) {
    const norm = normalizeSlash(requestedPath);
    if (!norm) return null;

    const lowerNorm = norm.toLowerCase();

    // Sincronizar catálogo a local si aún no existe en el SSD local
    if (!fs.existsSync(path.join(LOCAL_CACHE_DIR, 'projects'))) {
        syncLocalCacheFromNetwork();
    }

    // Si es la raíz de Google Drive ("G:" o "G:/Unidades compartidas")
    if (lowerNorm === 'g:' || lowerNorm === 'g:/unidades compartidas') {
        const activeRoots = [LOCAL_CACHE_DIR, CACHE_ROOT, 'Z:/_SYNC_CACHE'].filter(r => fs.existsSync(r));
        const roots = [];
        const seen = new Set();
        for (const r of activeRoots) {
            try {
                const pDir = path.join(r, 'projects');
                if (fs.existsSync(pDir)) {
                    for (const proj of fs.readdirSync(pDir)) {
                        if (!seen.has(proj.toLowerCase())) {
                            seen.add(proj.toLowerCase());
                            roots.push({
                                name: proj,
                                isDirectory: true,
                                path: `G:/Unidades compartidas/${proj}`,
                                size: 0,
                                fromCatalog: true
                            });
                            roots.push({
                                name: `${proj}_media`,
                                isDirectory: true,
                                path: `G:/Unidades compartidas/${proj}_media`,
                                size: 0,
                                fromCatalog: true
                            });
                        }
                    }
                }
                const files = fs.readdirSync(r).filter(f => f.endsWith('.json') && !f.startsWith('server_') && !f.startsWith('worker_') && !f.startsWith('last_'));
                for (const f of files) {
                    const proj = path.basename(f, '.json');
                    if (!seen.has(proj.toLowerCase())) {
                        seen.add(proj.toLowerCase());
                        roots.push({
                            name: proj,
                            isDirectory: true,
                            path: `G:/Unidades compartidas/${proj}`,
                            size: 0,
                            fromCatalog: true
                        });
                        roots.push({
                            name: `${proj}_media`,
                            isDirectory: true,
                            path: `G:/Unidades compartidas/${proj}_media`,
                            size: 0,
                            fromCatalog: true
                        });
                    }
                }
            } catch(e) {}
        }
        return roots;
    }

    // Extraer nombre de la unidad compartida del proyecto
    const match = norm.match(/Unidades compartidas\/([^/]+)/i);
    if (!match) return null;

    const folderName = match[1];
    const projName = folderName.replace(/_media$/i, '');

    const candidates = [
        path.join('Z:/_SYNC_CACHE', `${projName}.json`),
        path.join(LOCAL_CACHE_DIR, `${projName}.json`),
        path.join(CACHE_ROOT, `${projName}.json`)
    ].filter(c => fs.existsSync(c));

    if (candidates.length === 0) return null;

    let catalogPath = candidates[0];
    let bestMtime = 0;
    for (const c of candidates) {
        try {
            const st = fs.statSync(c);
            if (st.mtimeMs > bestMtime) {
                bestMtime = st.mtimeMs;
                catalogPath = c;
            }
        } catch(e) {}
    }

    let cacheEntry = null;
    try {
        const st = fs.statSync(catalogPath);
        const cached = driveCatalogMemoryCache.get(catalogPath);
        if (cached && cached.mtime === st.mtimeMs) {
            cacheEntry = cached;
        } else {
            const catalog = fs.readJsonSync(catalogPath);
            const parentMap = buildDriveCatalogParentIndex(catalog);
            cacheEntry = { mtime: st.mtimeMs, parentIndex: parentMap, catalog };
            driveCatalogMemoryCache.set(catalogPath, cacheEntry);
        }
    } catch(e) {
        return null;
    }

    if (!cacheEntry || !cacheEntry.parentIndex) return null;

    const children = cacheEntry.parentIndex.get(lowerNorm) || cacheEntry.parentIndex.get(lowerNorm + '/');
    return children ? [...children] : [];
}

/**
 * Refresca una subcarpeta específica dentro de un catálogo existente (ej. sólo B01 o un plano)
 * Toma ~1-2 segundos en vez de escanear todo el proyecto.
 */
async function refreshCatalogSubfolder(projectName, targetPath) {
    const config = getProjectConfig(projectName);
    if (!config) throw new Error(`Proyecto ${projectName} no configurado`);

    const catalogFile = path.join(CACHE_ROOT, `${projectName}.json`);
    let catalog = fs.existsSync(catalogFile) ? await fs.readJson(catalogFile) : null;
    if (!catalog) {
        return await generateProjectCatalog(projectName, { mode: 'auto' });
    }

    const normTarget = normalizeSlash(targetPath);
    const normWork = normalizeSlash(config.roots.work);
    const normMedia = normalizeSlash(config.roots.media);
    const normOnlineWork = normalizeSlash(config.roots.onlineWork || `G:/Unidades compartidas/${projectName}`);
    const normOnlineMedia = normalizeSlash(config.roots.onlineMedia || `G:/Unidades compartidas/${projectName}_media`);

    let cat = 'work';
    let relSubPath = '';
    let onlineRoot = '';

    if (normOnlineMedia && (normTarget.toLowerCase().startsWith(normOnlineMedia.toLowerCase() + '/') || normTarget.toLowerCase() === normOnlineMedia.toLowerCase())) {
        cat = 'media';
        relSubPath = normTarget.substring(normOnlineMedia.length).replace(/^\/+/, '');
        onlineRoot = normOnlineMedia;
    } else if (normOnlineWork && (normTarget.toLowerCase().startsWith(normOnlineWork.toLowerCase() + '/') || normTarget.toLowerCase() === normOnlineWork.toLowerCase())) {
        cat = 'work';
        relSubPath = normTarget.substring(normOnlineWork.length).replace(/^\/+/, '');
        onlineRoot = normOnlineWork;
    } else if (normMedia && (normTarget.toLowerCase().startsWith(normMedia.toLowerCase() + '/') || normTarget.toLowerCase() === normMedia.toLowerCase())) {
        cat = 'media';
        relSubPath = normTarget.substring(normMedia.length).replace(/^\/+/, '');
        onlineRoot = normOnlineMedia;
    } else if (normWork && (normTarget.toLowerCase().startsWith(normWork.toLowerCase() + '/') || normTarget.toLowerCase() === normWork.toLowerCase())) {
        cat = 'work';
        relSubPath = normTarget.substring(normWork.length).replace(/^\/+/, '');
        onlineRoot = normOnlineWork;
    } else {
        if (normTarget.toLowerCase().includes('media')) {
            cat = 'media';
            onlineRoot = normOnlineMedia;
        } else {
            cat = 'work';
            onlineRoot = normOnlineWork;
        }
        relSubPath = normTarget.replace(/^[A-Za-z]:\//, '').replace(/^\/+/, '');
    }

    const fullOnlineSub = relSubPath ? `${onlineRoot}/${relSubPath}` : onlineRoot;
    console.log(`[CATALOG SCOPED] Refrescando solo: ${cat} -> '${relSubPath}' (${fullOnlineSub})`);

    let scanned = [];
    try {
        scanned = scanWithRclone(fullOnlineSub);
    } catch (e) {
        console.warn(`[CATALOG SCOPED] Error rclone en ${fullOnlineSub}:`, e.message);
        throw e;
    }

    // Filtrar de catalog.flatList los items que pertenecían a este subdirectorio
    const prefix = relSubPath ? `${relSubPath}/` : '';
    catalog.flatList = catalog.flatList.filter(item => {
        if (item.category !== cat) return true;
        if (relSubPath && item.relPath === relSubPath) return false;
        if (prefix && item.relPath.startsWith(prefix)) return false;
        return true;
    });

    // Agregar los nuevos items escaneados
    const rootInfo = cat === 'work' ? config.roots.work : config.roots.media;
    let itemId = Date.now();
    for (const raw of scanned) {
        const itemRel = relSubPath ? `${relSubPath}/${raw.relPath}` : raw.relPath;
        const ext = raw.isDir ? '' : path.extname(raw.name).toLowerCase();
        catalog.flatList.push({
            id: `sync_${cat}_${itemId++}`,
            category: cat,
            name: raw.name,
            relPath: itemRel,
            ext: ext,
            isDir: raw.isDir,
            size: raw.size,
            modTime: raw.modTime,
            onlinePath: `${onlineRoot}/${itemRel}`,
            targetLocalPath: `${rootInfo}/${itemRel}`
        });
    }

    catalog.generatedAt = new Date().toISOString();
    await fs.writeJson(catalogFile, catalog, { spaces: 2 });
    console.log(`[CATALOG SCOPED] Subcarpeta '${relSubPath}' actualizada en catálogo: ${scanned.length} items.`);

    return {
        success: true,
        refreshedPath: relSubPath,
        category: cat,
        itemsCount: scanned.length,
        catalog
    };
}

/**
 * Genera el catálogo indexado del Servidor Central para un proyecto
 * Archivo resultante: Z:\_SYNC_CACHE\server_<projectName>.json
 */
async function generateServerCatalog(projectName, options = {}) {
    const config = options.projectConfig || getProjectConfig(projectName);
    if (!config) {
        throw new Error(`No se encontró configuración para el proyecto: ${projectName}`);
    }

    console.log(`[SERVER CATALOG] Generando catálogo de Servidor para: ${projectName}`);

    const rawWork = config.roots?.work || `Z:/${config.client || 'client'}/${projectName}`;
    const rawMedia = config.roots?.media || `Z:/INTERNO/MEDIA/${config.client || 'client'}/${projectName}`;

    const serverWorkLogical = normalizeSlash(rawWork);
    const serverMediaLogical = normalizeSlash(rawMedia);

    function resolvePhysical(p) {
        if (!p) return p;
        if (fs.existsSync(p)) return p;
        if (p.toUpperCase().startsWith('Z:/')) {
            const sPath = 'S:' + p.substring(2);
            if (fs.existsSync(sPath)) return sPath;
        }
        return p;
    }

    const categories = [
        { cat: 'work', logical: serverWorkLogical, physical: resolvePhysical(serverWorkLogical), targetLocal: normalizeSlash(rawWork) },
        { cat: 'media', logical: serverMediaLogical, physical: resolvePhysical(serverMediaLogical), targetLocal: normalizeSlash(rawMedia) }
    ];

    const flatList = [];
    let itemId = 1;
    let totalBytes = 0;
    let workFiles = 0;
    let workBytes = 0;
    let mediaFiles = 0;
    let mediaBytes = 0;

    for (const item of categories) {
        if (!fs.existsSync(item.physical)) {
            console.warn(`[SERVER CATALOG] Ruta física no encontrada para ${item.cat}: ${item.physical}`);
            continue;
        }

        console.log(`[SERVER CATALOG] Escaneando almacenamiento para ${item.cat}: ${item.physical}`);
        const scanned = await scanDirectoryRecursive(item.physical);

        for (const raw of scanned) {
            const ext = raw.isDir ? '' : path.extname(raw.name).toLowerCase();
            const relClean = raw.relPath.replace(/\\/g, '/');
            const targetLocalPath = `${item.targetLocal}/${relClean}`;
            const serverPath = `${item.logical}/${relClean}`;

            const processedItem = {
                id: `server_${item.cat}_${itemId++}`,
                category: item.cat,
                name: raw.name,
                relPath: relClean,
                ext: ext,
                isDir: raw.isDir,
                size: raw.size,
                modTime: raw.modTime,
                serverPath: serverPath,
                targetLocalPath: targetLocalPath
            };

            flatList.push(processedItem);

            if (!raw.isDir) {
                totalBytes += raw.size;
                if (item.cat === 'work') {
                    workFiles++;
                    workBytes += raw.size;
                } else {
                    mediaFiles++;
                    mediaBytes += raw.size;
                }
            }
        }
    }

    const totalFiles = workFiles + mediaFiles;
    const totalFolders = flatList.filter(i => i.isDir).length;

    const catalogData = {
        project: projectName,
        projectCode: config.projectCode || projectName,
        client: config.client || '',
        version: '1.0',
        type: 'server_catalog',
        generatedAt: new Date().toISOString(),
        generatedBy: 'Pipeta Server Catalog Generator',
        roots: {
            work: {
                server: serverWorkLogical,
                local: normalizeSlash(rawWork)
            },
            media: {
                server: serverMediaLogical,
                local: normalizeSlash(rawMedia)
            }
        },
        stats: {
            totalFiles,
            totalFolders,
            totalBytes,
            workFiles,
            workBytes,
            mediaFiles,
            mediaBytes
        },
        flatList: flatList
    };

    // Guardar exclusivamente en arquitectura modular y generar manifest.json
    let manifestData = null;
    try {
        manifestData = partitionCatalog(catalogData, 'server');
        console.log(`[SERVER CATALOG] Catálogo modular de Servidor generado con éxito para: ${projectName} (${totalFiles} archivos, ${totalFolders} carpetas)`);
    } catch(e) {
        console.warn(`[SERVER CATALOG] Error al generar sub-catálogos modulares de server:`, e.message);
    }

    return {
        success: true,
        catalogPath: path.join(MODULAR_PROJECTS_DIR, projectName, 'server', 'manifest.json'),
        stats: catalogData.stats,
        project: projectName,
        manifest: manifestData
    };
}

async function loadServerCatalog(projectName) {
    if (global.isExternalMachine) return null;
    if (typeof syncLocalCacheFromNetwork === 'function') {
        try { syncLocalCacheFromNetwork(projectName); } catch (e) {}
    }

    const namesToTry = [projectName];
    const config = getProjectConfig(projectName);
    if (config) {
        if (config.name && !namesToTry.includes(config.name)) namesToTry.push(config.name);
        if (config.projectCode && !namesToTry.includes(config.projectCode)) namesToTry.push(config.projectCode);
    }

    const candidateRoots = [LOCAL_CACHE_DIR, CACHE_ROOT, 'Z:/_SYNC_CACHE'];
    const candidates = [];
    for (const name of namesToTry) {
        for (const r of candidateRoots) {
            const p = path.join(r, `server_${name}.json`);
            if (fs.existsSync(p) && !candidates.includes(p)) candidates.push(p);
        }
    }

    if (candidates.length === 0) {
        if (typeof getModularManifest === 'function') {
            const modManifest = getModularManifest(projectName, 'server');
            if (modManifest) return modManifest;
        }
        return null;
    }

    let bestPath = candidates[0];
    let bestMtime = 0;
    for (const p of candidates) {
        try {
            const st = fs.statSync(p);
            if (st.mtimeMs > bestMtime) {
                bestMtime = st.mtimeMs;
                bestPath = p;
            }
        } catch (e) {}
    }

    try {
        return await fs.readJson(bestPath);
    } catch (e) {}
    return null;
}

const serverCatalogMemoryCache = new Map();

/**
 * Construye un mapa hash indexado O(1) de carpeta_padre -> items_hijos directos
 * Incluye ancestros sintéticos desde las raíces Z: hasta los directorios de trabajo
 */
function buildCatalogParentIndex(catalog) {
    const parentMap = new Map();

    // 1. Ancestros de las raíces (ej. Z: -> atresmedia, INTERNO; Z:/atresmedia -> surf_love)
    if (catalog.roots) {
        for (const type of ['work', 'media']) {
            const rootPath = normalizeSlash(catalog.roots[type]?.server);
            if (!rootPath) continue;
            const parts = rootPath.split('/');
            let current = parts[0]; // ej. "Z:"
            for (let i = 1; i < parts.length; i++) {
                const seg = parts[i];
                const pKey = current.toLowerCase();
                let arr = parentMap.get(pKey);
                if (!arr) { arr = []; parentMap.set(pKey, arr); }
                const childPath = `${current}/${seg}`;
                if (!arr.some(x => x.name.toLowerCase() === seg.toLowerCase())) {
                    arr.push({
                        name: seg,
                        isDirectory: true,
                        path: childPath,
                        size: 0,
                        fromCatalog: true,
                        isServer: true
                    });
                }
                current = childPath;
            }
        }
    }

    // 2. Todos los elementos en flatList
    if (catalog.flatList && Array.isArray(catalog.flatList)) {
        for (const item of catalog.flatList) {
            const p = normalizeSlash(item.serverPath);
            const lastSlash = p.lastIndexOf('/');
            const parent = lastSlash >= 0 ? p.substring(0, lastSlash).toLowerCase() : '';
            let arr = parentMap.get(parent);
            if (!arr) { arr = []; parentMap.set(parent, arr); }
            arr.push({
                name: item.name,
                isDirectory: !!item.isDir,
                path: p,
                size: item.size || 0,
                modTime: item.modTime,
                fromCatalog: true,
                isServer: true
            });
        }
    }

    // 3. Ordenar alfabéticamente una sola vez (carpetas primero, luego archivos)
    for (const [key, list] of parentMap.entries()) {
        list.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
    }

    return parentMap;
}

function listFromServerCatalog(requestedPath) {
    if (global.isExternalMachine) return null;
    const norm = normalizeSlash(requestedPath);
    if (!norm) return null;

    const lowerNorm = norm.toLowerCase();
    const searchKey = lowerNorm.replace(/\/+$/, '');

    // Sincronizar catálogo a local si aún no existe en el SSD local
    if (!fs.existsSync(path.join(LOCAL_CACHE_DIR, 'projects'))) {
        syncLocalCacheFromNetwork();
    }

    // Priorizar el directorio local SSD C:, con fallback a Z:\_SYNC_CACHE si está montado
    const activeCacheRoots = [LOCAL_CACHE_DIR, CACHE_ROOT, 'Z:/_SYNC_CACHE']
        .filter(r => fs.existsSync(r));
    const uniqueRoots = [...new Set(activeCacheRoots.map(r => path.resolve(r)))];
    if (uniqueRoots.length === 0) return null;

    const mergedChildren = [];
    const seenNames = new Set();
    let foundAny = false;

    for (const rootDir of uniqueRoots) {
        let files = [];
        try {
            files = fs.readdirSync(rootDir).filter(f => f.startsWith('server_') && f.endsWith('.json'));
        } catch (e) {
            continue;
        }

        for (const f of files) {
            const fullPath = path.join(rootDir, f).replace(/\\/g, '/');
            let cacheEntry = null;
            try {
                const st = fs.statSync(fullPath);
                const cached = serverCatalogMemoryCache.get(fullPath);
                if (cached && cached.mtime === st.mtimeMs) {
                    cacheEntry = cached;
                } else {
                    const catalog = fs.readJsonSync(fullPath);
                    const parentMap = buildCatalogParentIndex(catalog);
                    cacheEntry = { mtime: st.mtimeMs, parentIndex: parentMap, catalog };
                    serverCatalogMemoryCache.set(fullPath, cacheEntry);
                }
            } catch (e) {
                continue;
            }

            if (cacheEntry && cacheEntry.parentIndex) {
                const children = cacheEntry.parentIndex.get(searchKey) || cacheEntry.parentIndex.get(searchKey + '/');
                if (children && children.length > 0) {
                    foundAny = true;
                    for (const c of children) {
                        const lName = c.name.toLowerCase();
                        if (!seenNames.has(lName)) {
                            seenNames.add(lName);
                            mergedChildren.push(c);
                        }
                    }
                }
            }
        }

        if (foundAny) break;
    }

    if (foundAny || mergedChildren.length > 0) {
        mergedChildren.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
        return mergedChildren;
    }

    return null;
}

/**
 * Obtiene el tamaño en bytes de un directorio consultando los catálogos en memoria o en caché local SSD
 * Retorna null si no se encuentra en el catálogo
 */
function getDirSizeFromCatalog(dirPath) {
    if (!dirPath) return null;
    const norm = normalizeSlash(dirPath).toLowerCase();

    // 0. Buscar en manifiestos modulares (Drive y Server) en 0 ms
    for (const type of ['drive', 'server']) {
        try {
            const projInfo = findProjectManifestForPath(norm, type);
            if (projInfo && projInfo.manifest && projInfo.manifest.stats) {
                const stats = projInfo.manifest.stats;
                if (norm === projInfo.rootPath) {
                    if (projInfo.category === 'work' && stats.workBytes !== undefined) {
                        return stats.workBytes;
                    }
                    if (projInfo.category === 'media' && stats.mediaBytes !== undefined) {
                        return stats.mediaBytes;
                    }
                }
            }
        } catch(e) {}
    }

    // 1. Buscar en los catálogos en memoria
    for (const [fullPath, entry] of serverCatalogMemoryCache.entries()) {
        const cat = entry?.catalog;
        if (!cat) continue;
        const roots = cat.roots;
        const stats = cat.stats;
        if (roots && stats) {
            const workServer = normalizeSlash(roots.work?.server).toLowerCase();
            const mediaServer = normalizeSlash(roots.media?.server).toLowerCase();
            const workLocal = normalizeSlash(roots.work?.local).toLowerCase();
            const mediaLocal = normalizeSlash(roots.media?.local).toLowerCase();

            if ((norm === workServer || norm === workLocal) && stats.workBytes !== undefined) {
                return stats.workBytes;
            }
            if ((norm === mediaServer || norm === mediaLocal) && stats.mediaBytes !== undefined) {
                return stats.mediaBytes;
            }
        }
    }

    // 2. Buscar en los archivos JSON de LOCAL_CACHE_DIR
    try {
        if (fs.existsSync(LOCAL_CACHE_DIR)) {
            const files = fs.readdirSync(LOCAL_CACHE_DIR).filter(f => f.startsWith('server_') && f.endsWith('.json'));
            for (const f of files) {
                const fullPath = path.join(LOCAL_CACHE_DIR, f);
                let cat = null;
                const cached = serverCatalogMemoryCache.get(fullPath);
                if (cached?.catalog) {
                    cat = cached.catalog;
                } else {
                    cat = fs.readJsonSync(fullPath);
                }
                const roots = cat?.roots;
                const stats = cat?.stats;
                if (roots && stats) {
                    const workServer = normalizeSlash(roots.work?.server).toLowerCase();
                    const mediaServer = normalizeSlash(roots.media?.server).toLowerCase();
                    const workLocal = normalizeSlash(roots.work?.local).toLowerCase();
                    const mediaLocal = normalizeSlash(roots.media?.local).toLowerCase();

                    if ((norm === workServer || norm === workLocal) && stats.workBytes !== undefined) {
                        return stats.workBytes;
                    }
                    if ((norm === mediaServer || norm === mediaLocal) && stats.mediaBytes !== undefined) {
                        return stats.mediaBytes;
                    }
                }
            }
        }
    } catch (e) {}

    return null;
}

function clearMemoryCaches() {
    manifestMemoryCache.clear();
    subCatalogMemoryCache.clear();
    driveCatalogMemoryCache.clear();
    serverCatalogMemoryCache.clear();
    dirExistsCache.clear();
    pendingSyncCache.clear();
    projectPathLookupCache.clear();
    autoHydratedProjects.clear();
    if (typeof subCatalogFreshnessCache !== 'undefined') subCatalogFreshnessCache.clear();
    if (typeof missingSubCatalogCache !== 'undefined') missingSubCatalogCache.clear();
    if (typeof manifestFreshnessCache !== 'undefined') manifestFreshnessCache.clear();
}

module.exports = {
    CACHE_ROOT,
    LOCAL_CACHE_DIR,
    syncLocalCacheFromNetwork,
    syncLocalCacheFromNetworkAsync,
    refreshDriveManifestPendingSummary,
    generateProjectCatalog,
    loadProjectCatalog,
    generateServerCatalog,
    loadServerCatalog,
    listAvailableCatalogs,
    getProjectConfig,
    getAllProjectNames,
    getAllProjectConfigs,
    listFromCatalog,
    listFromServerCatalog,
    getDirSizeFromCatalog,
    getTeamDrivesMap,
    refreshCatalogSubfolder,
    partitionCatalog,
    listFromModularCatalog,
    refreshSubCatalog,
    recordTransferredItem,
    recordRenamedItem,
    getModularManifest,
    clearMemoryCaches,
    listWithRclone,
    dirExistsFast,
    fileExistsFast,
    isZDriveNetwork,
    resolveLocalToOnlinePath
};

// --- CLI RUNNER ---
// Permite ejecutar directo: node sync_catalog_generator.js [projectName] [--mode=auto|mock|fs|rclone]
if (require.main === module) {
    const args = process.argv.slice(2);
    const proj = args[0] || 'surf_love';
    let mode = 'auto';

    for (const arg of args) {
        if (arg.startsWith('--mode=')) {
            mode = arg.split('=')[1];
        }
    }

    generateProjectCatalog(proj, { mode })
        .then(res => {
            console.log('\n========================================');
            console.log('   CATALOGO GENERADO CON EXITO');
            console.log('========================================');
            console.log(`Proyecto:     ${res.project}`);
            console.log(`Ruta Catálogo: ${res.catalogPath}`);
            console.log(`Archivos:     ${res.stats.totalFiles} (${(res.stats.totalBytes / (1024 * 1024)).toFixed(2)} MB)`);
            console.log(`  - Work:     ${res.stats.workFiles} archivos (${(res.stats.workBytes / (1024 * 1024)).toFixed(2)} MB)`);
            console.log(`  - Media:    ${res.stats.mediaFiles} archivos (${(res.stats.mediaBytes / (1024 * 1024)).toFixed(2)} MB)`);
            console.log('========================================\n');
        })
        .catch(err => {
            console.error('[ERROR]', err.message);
            process.exit(1);
        });
}
