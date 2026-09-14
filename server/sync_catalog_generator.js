const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Carpeta estándar centralizada para los catálogos en Z: (o S: en puesto de desarrollo)
const CACHE_ROOT = fs.existsSync('S:/_SYNC_CACHE') ? 'S:/_SYNC_CACHE' : 'Z:/_SYNC_CACHE';
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
    const catalogPath = path.join(CACHE_ROOT, `${projectName}.json`);
    if (!fs.existsSync(catalogPath)) {
        return null;
    }
    return await fs.readJson(catalogPath);
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

/**
 * Consulta síncrona de elementos virtuales dentro de un catálogo para navegación offline transparente
 */
function listFromCatalog(requestedPath) {
    const norm = normalizeSlash(requestedPath);
    if (!norm) return null;

    const lowerNorm = norm.toLowerCase();

    // Si es la raíz de Google Drive ("G:" o "G:/Unidades compartidas")
    if (lowerNorm === 'g:' || lowerNorm === 'g:/unidades compartidas') {
        if (!fs.existsSync(CACHE_ROOT)) return [];
        const files = fs.readdirSync(CACHE_ROOT).filter(f => f.endsWith('.json'));
        const roots = [];
        for (const f of files) {
            const proj = path.basename(f, '.json');
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
        return roots;
    }

    // Extraer nombre de la unidad compartida del proyecto
    const match = norm.match(/Unidades compartidas\/([^/]+)/i);
    if (!match) return null;

    const folderName = match[1];
    const projName = folderName.replace(/_media$/i, '');

    const catalogPath = path.join(CACHE_ROOT, `${projName}.json`);
    if (!fs.existsSync(catalogPath)) {
        return null;
    }

    let catalog;
    try {
        catalog = fs.readJsonSync(catalogPath);
    } catch(e) {
        return null;
    }

    if (!catalog || !catalog.flatList) return null;

    const targetParentNorm = lowerNorm;
    const directChildren = [];
    const seenNames = new Set();

    for (const item of catalog.flatList) {
        const itemOnlineNorm = normalizeSlash(item.onlinePath).toLowerCase();
        
        // El padre del elemento debe ser exactamente el path solicitado
        const itemParent = itemOnlineNorm.substring(0, itemOnlineNorm.lastIndexOf('/'));
        if (itemParent === targetParentNorm) {
            if (!seenNames.has(item.name.toLowerCase())) {
                seenNames.add(item.name.toLowerCase());
                directChildren.push({
                    name: item.name,
                    isDirectory: !!item.isDir,
                    path: item.onlinePath,
                    size: item.size || 0,
                    modTime: item.modTime,
                    fromCatalog: true
                });
            }
        }
    }

    directChildren.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
    });

    return directChildren;
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

    let cat = 'work';
    let relSubPath = '';
    let onlineRoot = '';

    if (normTarget.startsWith(normMedia)) {
        cat = 'media';
        relSubPath = normTarget.substring(normMedia.length).replace(/^\/+/, '');
        onlineRoot = normalizeSlash(config.roots.onlineMedia || config.roots.online);
    } else if (normTarget.startsWith(normWork)) {
        cat = 'work';
        relSubPath = normTarget.substring(normWork.length).replace(/^\/+/, '');
        onlineRoot = normalizeSlash(config.roots.onlineWork || config.roots.online);
    } else {
        relSubPath = normTarget.replace(/^\/+/, '');
        onlineRoot = normalizeSlash(config.roots.onlineMedia);
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

module.exports = {
    CACHE_ROOT,
    generateProjectCatalog,
    loadProjectCatalog,
    listAvailableCatalogs,
    getProjectConfig,
    listFromCatalog,
    getTeamDrivesMap,
    refreshCatalogSubfolder
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
