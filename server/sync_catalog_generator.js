const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Carpeta estándar centralizada para los catálogos en local SSD (y fallback Z:\_SYNC_CACHE si está montado)
const LOCAL_CACHE_DIR = path.join(__dirname, '../_SYNC_CACHE');
const UNC_CACHE = '//192.168.206.116/Z/_SYNC_CACHE';
const CACHE_ROOT = fs.existsSync(LOCAL_CACHE_DIR) 
    ? LOCAL_CACHE_DIR 
    : (fs.existsSync('Z:/_SYNC_CACHE') ? 'Z:/_SYNC_CACHE' : LOCAL_CACHE_DIR);

/**
 * Sincroniza los catálogos JSON desde la red/servidor (Z:/_SYNC_CACHE o UNC)
 * al disco local SSD de la máquina (C:/.../_SYNC_CACHE).
 * Esto permite leer instantáneamente desde el SSD local sin sobrecargar la red SMB.
 */
function syncLocalCacheFromNetwork(projectName = null) {
    try {
        fs.ensureDirSync(LOCAL_CACHE_DIR);
        const centralRoots = ['Z:/_SYNC_CACHE', UNC_CACHE, CACHE_ROOT]
            .filter((r, idx, arr) => {
                try {
                    return fs.existsSync(r) && path.resolve(r).toLowerCase() !== path.resolve(LOCAL_CACHE_DIR).toLowerCase() && arr.indexOf(r) === idx;
                } catch (e) { return false; }
            });

        for (const centralRoot of centralRoots) {
            let files = [];
            try {
                files = fs.readdirSync(centralRoot).filter(f => f.endsWith('.json'));
            } catch (e) { continue; }

            for (const f of files) {
                if (projectName && !f.toLowerCase().includes(projectName.toLowerCase()) && f !== 'worker_status.json') {
                    continue;
                }
                const srcPath = path.join(centralRoot, f);
                const dstPath = path.join(LOCAL_CACHE_DIR, f);

                let needsCopy = false;
                if (!fs.existsSync(dstPath)) {
                    needsCopy = true;
                } else {
                    try {
                        const srcStat = fs.statSync(srcPath);
                        const dstStat = fs.statSync(dstPath);
                        if (srcStat.mtimeMs > dstStat.mtimeMs) {
                            needsCopy = true;
                        }
                    } catch (e) {
                        needsCopy = true;
                    }
                }

                if (needsCopy) {
                    try {
                        fs.copySync(srcPath, dstPath, { overwrite: true });
                        console.log(`[LOCAL CACHE] ✓ Sincronizado a disco local SSD: ${f}`);
                    } catch (e) {
                        console.warn(`[LOCAL CACHE] Error copiando ${f} a local:`, e.message);
                    }
                }
            }

            // Sincronizar también la carpeta modular projects/ si existe en la red
            const centralProjects = path.join(centralRoot, 'projects');
            const localProjects = path.join(LOCAL_CACHE_DIR, 'projects');
            if (fs.existsSync(centralProjects)) {
                try {
                    fs.copySync(centralProjects, localProjects, { overwrite: true, errorOnExist: false });
                } catch (e) {}
            }
        }
    } catch (err) {
        console.warn(`[LOCAL CACHE] Advertencia sincronizando caché local:`, err.message);
    }
}
const PRESETS_PROJECTS_DIR = path.join(__dirname, '../presets/Projects');
const RCLONE_EXE = path.join(__dirname, '../tools/rclone/rclone.exe');
const RCLONE_CONF = fs.existsSync('Z:/INTERNO/TOOLS/Instaladores/rclone.conf')
    ? 'Z:/INTERNO/TOOLS/Instaladores/rclone.conf'
    : (fs.existsSync(path.join(__dirname, '../tools/rclone/rclone.conf'))
        ? path.join(__dirname, '../tools/rclone/rclone.conf')
        : null);

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
        const stdout = execSync(cmd, { maxBuffer: 1024 * 1024 * 10, encoding: 'utf-8', timeout: 20000 });
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
    const jsonPath = path.join(PRESETS_PROJECTS_DIR, `${projectName}.json`);
    if (fs.existsSync(jsonPath)) {
        try {
            return fs.readJsonSync(jsonPath);
        } catch (e) {
            console.warn(`[CATALOG] Error leyendo preset ${jsonPath}:`, e.message);
        }
    }

    // Fallback canónico para surf_love si no existiera el preset físico
    if (projectName === 'surf_love') {
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

    const stdout = execSync(cmd, { maxBuffer: 1024 * 1024 * 100, encoding: 'utf-8', timeout: 180000 });
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
        const stdout = execSync(cmd, { maxBuffer: 1024 * 1024 * 20, encoding: 'utf-8', timeout: 30000 });
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

    // Asegurar directorio destino en Z:\_SYNC_CACHE
    await fs.ensureDir(CACHE_ROOT);
    const targetCatalogPath = path.join(CACHE_ROOT, `${projectName}.json`);

    await fs.writeJson(targetCatalogPath, catalogData, { spaces: 2 });
    console.log(`[CATALOG] Catálogo guardado con éxito en: ${targetCatalogPath} (${totalFiles} archivos, ${totalFolders} carpetas, ${(totalBytes / (1024 * 1024)).toFixed(2)} MB)`);

    // Particionar automáticamente en sub-catálogos modulares
    try {
        partitionCatalog(catalogData, 'drive');
    } catch(e) {
        console.warn(`[CATALOG] Advertencia al generar sub-catálogos modulares de drive:`, e.message);
    }

    return {
        success: true,
        catalogPath: targetCatalogPath,
        stats: catalogData.stats,
        project: projectName
    };
}

/**
 * Lee el catálogo de un proyecto desde Z:\_SYNC_CACHE\<projectName>.json
 */
async function loadProjectCatalog(projectName) {
    if (typeof syncLocalCacheFromNetwork === 'function') {
        try { syncLocalCacheFromNetwork(projectName); } catch (e) {}
    }
    const candidates = [
        `Z:/_SYNC_CACHE/${projectName}.json`,
        path.join(LOCAL_CACHE_DIR, `${projectName}.json`),
        path.join(CACHE_ROOT, `${projectName}.json`)
    ].filter(p => fs.existsSync(p));

    if (candidates.length === 0) {
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
 * Lista todos los proyectos que tienen catálogo generado en Z:\_SYNC_CACHE
 */
async function listAvailableCatalogs() {
    if (!fs.existsSync(CACHE_ROOT)) {
        return [];
    }

    const files = await fs.readdir(CACHE_ROOT);
    const catalogs = [];

    for (const file of files) {
        if (file.endsWith('.json') && !file.startsWith('worker_') && !file.startsWith('catalog_refresh_')) {
            const fullPath = path.join(CACHE_ROOT, file);
            try {
                const stat = await fs.stat(fullPath);
                const data = await fs.readJson(fullPath);
                catalogs.push({
                    project: data.project || path.basename(file, '.json'),
                    fileName: file,
                    path: fullPath,
                    generatedAt: data.generatedAt || stat.mtime.toISOString(),
                    stats: data.stats || null,
                    roots: data.roots || null
                });
            } catch (e) {
                console.warn(`[CATALOG] Archivo corrupto en cache: ${file}`);
            }
        }
    }

    return catalogs;
}

// --- MODULAR SUB-CATALOGS SYSTEM ---
const MODULAR_PROJECTS_DIR = path.join(LOCAL_CACHE_DIR, 'projects');
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

    console.log(`[MODULAR CATALOG] Guardado ${projectName} (${type}) con ${subCatalogs.size} sub-catálogos en ${outDir}`);
    return manifestData;
}

function getModularManifest(projectName, type) {
    const candidates = [
        path.join(MODULAR_PROJECTS_DIR, projectName, type, 'manifest.json'),
        path.join('Z:/_SYNC_CACHE/projects', projectName, type, 'manifest.json'),
        path.join(UNC_CACHE, 'projects', projectName, type, 'manifest.json')
    ];

    let manifestPath = null;
    for (const c of candidates) {
        try {
            if (fs.existsSync(c)) {
                manifestPath = c;
                break;
            }
        } catch(e) {}
    }

    if (!manifestPath) {
        const monoCandidates = [
            type === 'server' ? path.join(LOCAL_CACHE_DIR, `server_${projectName}.json`) : path.join(LOCAL_CACHE_DIR, `${projectName}.json`),
            type === 'server' ? path.join('Z:/_SYNC_CACHE', `server_${projectName}.json`) : path.join('Z:/_SYNC_CACHE', `${projectName}.json`),
            type === 'server' ? path.join(UNC_CACHE, `server_${projectName}.json`) : path.join(UNC_CACHE, `${projectName}.json`)
        ];
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
    const norm = normalizeSlash(requestedPath).toLowerCase();
    const projectBases = [
        path.join(CACHE_ROOT, 'projects'),
        MODULAR_PROJECTS_DIR,
        'Z:/_SYNC_CACHE/projects',
        path.join(UNC_CACHE, 'projects')
    ].filter((b, idx, arr) => {
        try { return fs.existsSync(b) && arr.indexOf(b) === idx; } catch(e) { return false; }
    });
    if (projectBases.length === 0) return null;

    const seenProjects = new Set();
    for (const base of projectBases) {
        let projectDirs = [];
        try { projectDirs = fs.readdirSync(base); } catch(e) { continue; }

        for (const p of projectDirs) {
            if (seenProjects.has(p.toLowerCase())) continue;
            seenProjects.add(p.toLowerCase());

            const manifest = getModularManifest(p, type);
            if (!manifest) continue;
            let rootWork = '';
            let rootMedia = '';
            if (type === 'server') {
                rootWork = normalizeSlash(manifest.roots?.work?.server || '').toLowerCase().replace(/^s:/i, 'z:');
                rootMedia = normalizeSlash(manifest.roots?.media?.server || '').toLowerCase().replace(/^s:/i, 'z:');
                if (rootWork && (norm === rootWork || norm.startsWith(rootWork + '/'))) {
                    return { manifest, projectName: p, category: 'work', rootPath: rootWork };
                }
                if (rootMedia && (norm === rootMedia || norm.startsWith(rootMedia + '/'))) {
                    return { manifest, projectName: p, category: 'media', rootPath: rootMedia };
                }
            } else {
                const onlineWork = normalizeSlash(manifest.roots?.work?.online || `G:/Unidades compartidas/${p}`).toLowerCase();
                const onlineMedia = normalizeSlash(manifest.roots?.media?.online || `G:/Unidades compartidas/${p}_media`).toLowerCase();
                const localWork = normalizeSlash(manifest.roots?.work?.local || `Z:/atresmedia/${p}`).toLowerCase();
                const localMedia = normalizeSlash(manifest.roots?.media?.local || `Z:/INTERNO/MEDIA/atresmedia/${p}`).toLowerCase();

                if (onlineWork && (norm === onlineWork || norm.startsWith(onlineWork + '/'))) {
                    return { manifest, projectName: p, category: 'work', rootPath: onlineWork };
                }
                if (onlineMedia && (norm === onlineMedia || norm.startsWith(onlineMedia + '/'))) {
                    return { manifest, projectName: p, category: 'media', rootPath: onlineMedia };
                }
                if (localWork && (norm === localWork || norm.startsWith(localWork + '/'))) {
                    return { manifest, projectName: p, category: 'work', rootPath: localWork };
                }
                if (localMedia && (norm === localMedia || norm.startsWith(localMedia + '/'))) {
                    return { manifest, projectName: p, category: 'media', rootPath: localMedia };
                }
            }
        }
    }
    return null;
}

function buildSubCatalogIndex(subCatalog) {
    const parentMap = new Map();
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
            const entryObj = {
                name: item.name,
                isDirectory: !!item.isDir || !!item.isDirectory,
                path: p,
                size: item.size || 0,
                modTime: item.modTime,
                targetLocalPath: targetLocal,
                fromCatalog: true,
                isServer: subCatalog.type === 'server'
            };
            arr.push(entryObj);

            // Indexar también por la ruta del padre local (targetLocalPath) para consultas directas desde vista LOCAL
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

    for (const [key, list] of parentMap.entries()) {
        list.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
    }

    return parentMap;
}

function listFromModularCatalog(requestedPath, type = 'server') {
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
        if (targetLocal) {
            try { localExists = fs.existsSync(targetLocal); } catch(e) {}
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

    // Raíz de Work o Media -> Devolver hijos directos desde manifest en 0 ms
    if (lowerNorm === rootPath) {
        return category === 'work' ? sanitizeManifestChildren(manifest.rootChildren?.work) : sanitizeManifestChildren(manifest.rootChildren?.media);
    }

    const rel = lowerNorm.substring(rootPath.length).replace(/^\/+/, '');
    const parts = rel.split('/').filter(Boolean);
    if (parts.length === 0) {
        return category === 'work' ? sanitizeManifestChildren(manifest.rootChildren?.work) : sanitizeManifestChildren(manifest.rootChildren?.media);
    }

    let subFile = '';
    if (category === 'work') {
        if (parts[0] === 'assets2d') {
            subFile = 'assets2D.json';
        } else if (parts[0] === 'assets3d') {
            subFile = 'assets3D.json';
        } else if (parts[0] === 'episodios') {
            if (parts.length === 1) {
                return sanitizeManifestChildren(manifest.episodiosChildren);
            }
            subFile = `episodios/${parts[1]}.json`;
        } else {
            subFile = 'misc.json';
        }
    } else {
        subFile = `media/${parts[0]}.json`;
    }

    const subCandidates = [
        path.join(CACHE_ROOT, 'projects', projectName, type, subFile),
        path.join('Z:/_SYNC_CACHE/projects', projectName, type, subFile),
        path.join(UNC_CACHE, 'projects', projectName, type, subFile),
        path.join(MODULAR_PROJECTS_DIR, projectName, type, subFile)
    ].filter((sc, idx, arr) => {
        try { return fs.existsSync(sc) && arr.indexOf(sc) === idx; } catch(e) { return false; }
    });

    let subFilePath = null;
    let bestMtime = 0;
    for (const sc of subCandidates) {
        try {
            const st = fs.statSync(sc);
            if (st.mtimeMs > bestMtime) {
                bestMtime = st.mtimeMs;
                subFilePath = sc;
            }
        } catch(e) {}
    }

    if (!subFilePath) {
        if (subFile.startsWith('episodios/')) {
            const rootSubCandidates = [
                path.join(MODULAR_PROJECTS_DIR, projectName, type, 'episodios/_root.json'),
                path.join('Z:/_SYNC_CACHE/projects', projectName, type, 'episodios/_root.json'),
                path.join(UNC_CACHE, 'projects', projectName, type, 'episodios/_root.json')
            ];
            if (rootSubCandidates.some(p => { try { return fs.existsSync(p); } catch(e) { return false; } })) return [];
        }
        return null;
    }

    let cacheEntry = null;
    try {
        const st = fs.statSync(subFilePath);
        const cached = subCatalogMemoryCache.get(subFilePath);
        if (cached && cached.mtime === st.mtimeMs) {
            cacheEntry = cached;
        } else {
            const data = fs.readJsonSync(subFilePath);
            const parentMap = buildSubCatalogIndex(data);
            cacheEntry = { mtime: st.mtimeMs, parentIndex: parentMap, data };
            subCatalogMemoryCache.set(subFilePath, cacheEntry);
        }
    } catch(e) {
        return null;
    }

    if (!cacheEntry || !cacheEntry.parentIndex) return null;
    const children = cacheEntry.parentIndex.get(lowerNorm) || cacheEntry.parentIndex.get(lowerNorm + '/');
    if (!children) return [];

    return children.map(c => {
        let localExists = false;
        if (c.targetLocalPath) {
            try { localExists = fs.existsSync(c.targetLocalPath); } catch(e) {}
        }
        return {
            ...c,
            localExists
        };
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

    const normTarget = normalizeSlash(targetPath);
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
        if (rel.toLowerCase().startsWith('interno/media/')) {
            isMedia = true;
            rel = rel.substring('interno/media/'.length).replace(/^\/+/, '');
        } else {
            isWork = true;
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

    console.log(`[REFRESH SUB-CATALOG] (${type.toUpperCase()}) Proyecto: ${projectName}, Sub-catálogo: ${subFile}, Rel: ${scanRel}`);

    let scanned = [];
    if (type === 'server') {
        const rootPhysicalBase = isWork
            ? (config.roots?.work ? normalizeSlash(config.roots.work) : 'Z:/' + (config.client || '') + '/' + projectName)
            : (config.roots?.media ? normalizeSlash(config.roots.media) : 'Z:/INTERNO/MEDIA/' + (config.client || '') + '/' + projectName);
        
        const fullPhysical = scanRel ? path.join(rootPhysicalBase, scanRel) : rootPhysicalBase;
        if (fs.existsSync(fullPhysical)) {
            scanned = await scanDirectoryRecursive(fullPhysical);
        }
    } else {
        const onlineRoot = isWork ? config.roots.onlineWork : config.roots.onlineMedia;
        const fullOnlineSub = scanRel ? `${onlineRoot}/${scanRel}` : onlineRoot;
        try {
            scanned = scanWithRclone(fullOnlineSub);
        } catch (e) {
            console.warn(`[REFRESH SUB-CATALOG] Error rclone en ${fullOnlineSub}:`, e.message);
        }
    }

    const newItems = [];
    let byteCount = 0;
    let fileCount = 0;
    let itemId = Date.now();

    const rootLogical = isWork 
        ? (type === 'server' ? manifest.roots?.work?.server : manifest.roots?.work?.online) 
        : (type === 'server' ? manifest.roots?.media?.server : manifest.roots?.media?.online);
    const rootLocal = isWork ? config.roots?.work : config.roots?.media;

    for (const raw of scanned) {
        const itemRel = scanRel ? `${scanRel}/${raw.relPath}` : raw.relPath;
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

        newItems.push(processed);

        if (!raw.isDir) {
            byteCount += size;
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
        stats: { itemCount: newItems.length, fileCount, byteCount },
        flatList: newItems
    }, { spaces: 2 });

    subCatalogMemoryCache.delete(subFilePath);

    if (manifest.subCatalogs && manifest.subCatalogs[subKey]) {
        manifest.subCatalogs[subKey].itemCount = newItems.length;
        manifest.subCatalogs[subKey].fileCount = fileCount;
        manifest.subCatalogs[subKey].byteCount = byteCount;
        manifest.generatedAt = new Date().toISOString();
        const manifestPath = path.join(outDir, 'manifest.json');
        fs.writeJsonSync(manifestPath, manifest, { spaces: 2 });
        manifestMemoryCache.delete(manifestPath);
    }

    // Replicar a red central (Z:/_SYNC_CACHE) si existe
    const centralCacheDirs = ['Z:/_SYNC_CACHE']
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

    return {
        success: true,
        subCatalog: subFile,
        itemsCount: newItems.length,
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
    if (!fs.existsSync(LOCAL_CACHE_DIR) || fs.readdirSync(LOCAL_CACHE_DIR).filter(f => !f.startsWith('server_') && f.endsWith('.json')).length === 0) {
        syncLocalCacheFromNetwork();
    }

    // Si es la raíz de Google Drive ("G:" o "G:/Unidades compartidas")
    if (lowerNorm === 'g:' || lowerNorm === 'g:/unidades compartidas') {
        const activeRoots = [LOCAL_CACHE_DIR, CACHE_ROOT, 'Z:/_SYNC_CACHE'].filter(r => fs.existsSync(r));
        const roots = [];
        const seen = new Set();
        for (const r of activeRoots) {
            try {
                const files = fs.readdirSync(r).filter(f => f.endsWith('.json') && !f.startsWith('server_') && !f.startsWith('worker_'));
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

    await fs.ensureDir(CACHE_ROOT);
    const targetCatalogPath = path.join(CACHE_ROOT, `server_${projectName}.json`);
    await fs.writeJson(targetCatalogPath, catalogData, { spaces: 2 });
    console.log(`[SERVER CATALOG] Catálogo guardado con éxito en: ${targetCatalogPath} (${totalFiles} archivos, ${totalFolders} carpetas)`);

    // Particionar automáticamente en sub-catálogos modulares
    try {
        partitionCatalog(catalogData, 'server');
    } catch(e) {
        console.warn(`[SERVER CATALOG] Advertencia al generar sub-catálogos modulares de server:`, e.message);
    }

    // Asegurar que si existe Z:/_SYNC_CACHE (máquina local), se replique también allí
    if (fs.existsSync('Z:/_SYNC_CACHE') && path.resolve(CACHE_ROOT).toLowerCase() !== path.resolve('Z:/_SYNC_CACHE').toLowerCase()) {
        try {
            await fs.copy(targetCatalogPath, path.join('Z:/_SYNC_CACHE', `server_${projectName}.json`));
            const centralProjDir = path.join('Z:/_SYNC_CACHE/projects', projectName, 'server');
            const localProjDir = path.join(MODULAR_PROJECTS_DIR, projectName, 'server');
            if (fs.existsSync(localProjDir)) {
                fs.copySync(localProjDir, centralProjDir, { overwrite: true });
            }
            console.log(`[SERVER CATALOG] Catálogo replicado a Z:/_SYNC_CACHE/server_${projectName}.json`);
        } catch(e) {}
    }

    return {
        success: true,
        catalogPath: targetCatalogPath,
        stats: catalogData.stats,
        project: projectName
    };
}

async function loadServerCatalog(projectName) {
    if (typeof syncLocalCacheFromNetwork === 'function') {
        try { syncLocalCacheFromNetwork(projectName); } catch (e) {}
    }
    const candidates = [
        `Z:/_SYNC_CACHE/server_${projectName}.json`,
        path.join(LOCAL_CACHE_DIR, `server_${projectName}.json`),
        path.join(CACHE_ROOT, `server_${projectName}.json`)
    ].filter(p => fs.existsSync(p));

    if (candidates.length === 0) return null;

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
 * Incluye ancestros sintéticos desde las raíces S: hasta los directorios de trabajo
 */
function buildCatalogParentIndex(catalog) {
    const parentMap = new Map();

    // 1. Ancestros de las raíces (ej. S: -> atresmedia, INTERNO; S:/atresmedia -> surf_love)
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
    const norm = normalizeSlash(requestedPath);
    if (!norm) return null;

    const lowerNorm = norm.toLowerCase();
    const searchKey = lowerNorm.replace(/\/+$/, '');

    // Sincronizar catálogo a local si aún no existe en el SSD local
    if (!fs.existsSync(LOCAL_CACHE_DIR) || fs.readdirSync(LOCAL_CACHE_DIR).filter(f => f.startsWith('server_') && f.endsWith('.json')).length === 0) {
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
}

module.exports = {
    CACHE_ROOT,
    LOCAL_CACHE_DIR,
    syncLocalCacheFromNetwork,
    generateProjectCatalog,
    loadProjectCatalog,
    generateServerCatalog,
    loadServerCatalog,
    listAvailableCatalogs,
    getProjectConfig,
    listFromCatalog,
    listFromServerCatalog,
    getDirSizeFromCatalog,
    getTeamDrivesMap,
    refreshCatalogSubfolder,
    partitionCatalog,
    listFromModularCatalog,
    refreshSubCatalog,
    recordTransferredItem,
    getModularManifest,
    clearMemoryCaches,
    listWithRclone
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
