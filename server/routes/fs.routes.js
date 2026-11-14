const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { spawn, exec, execSync } = require('child_process');
const catalogGenerator = require('../sync_catalog_generator');
const {
    APP_ROOT,
    NETWORK_APP_DIR,
    PIPELINE_CONFIG_FILE
} = require('../core/app-context');
const {
    getCachedEnvState,
    checkInternetQuickly
} = require('../core/env-detector');
const {
    getServerUncRoot,
    ensureServerUncAccess,
    serverDirCache,
    rcloneDirCache,
    SERVER_CACHE_TTL,
    RCLONE_CACHE_TTL,
    dirSizeMemoryCache
} = require('../core/sync-paths');

const router = express.Router();

router.get('/api/fs/list', (req, res) => {
    const t0 = Date.now();
    const requestedPath = req.query.path;
    const forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';
    let onlineEngine = req.query.online_engine; // 'rclone' | 'gdrive' | 'catalog'
    const localSource = req.query.local_source; // 'z_local' | 'server_catalog'
    const source = req.query.source;
    const cachedEnvState = getCachedEnvState();

    try {
        let targetPath = null;
        let lowerSafeP;

        if (requestedPath) {
            const safeP = decodeURIComponent(requestedPath).replace(/\\/g, '/');
            lowerSafeP = safeP.toLowerCase();
            const cacheModeKey = `${localSource || source || onlineEngine || 'local'}:${lowerSafeP}`;

            if (!forceRefresh && !localSource && !source && serverDirCache.has(cacheModeKey)) {
                const cached = serverDirCache.get(cacheModeKey);
                if (Date.now() - cached.time < SERVER_CACHE_TTL) {
                    return res.json({ path: safeP, items: cached.items, exists: true, fromCache: true });
                }
            }

            const isNetworkZ = (typeof catalogGenerator.isZDriveNetwork === 'function')
                ? catalogGenerator.isZDriveNetwork()
                : true;

            const isZPath = lowerSafeP.startsWith('z:/') || lowerSafeP.startsWith('s:/');

            const isNotRealServer = !cachedEnvState?.zInfo?.isRealServer || (typeof isZRealServer === 'function' && !isZRealServer());

            if ((isNetworkZ || isZPath) && !lowerSafeP.startsWith('g:/') && localSource !== 'drive_catalog' && source !== 'drive' && localSource !== 'server_catalog' && source !== 'server') {
                if (isNotRealServer) {
                    // En puestos con Z virtual (vsubs), LOCAL solo debe reflejar el disco físico local real
                    if (fs.existsSync(safeP)) {
                        try {
                            const diskEntries = fs.readdirSync(safeP, { withFileTypes: true });
                            const localItems = diskEntries.map(entry => {
                                const isDir = entry.isDirectory();
                                const fullItemPath = path.join(safeP, entry.name).replace(/\\/g, '/');
                                let size = 0;
                                let mtime = null;
                                try {
                                    const st = fs.statSync(fullItemPath);
                                    size = st.size || 0;
                                    mtime = st.mtime ? st.mtime.toISOString() : null;
                                } catch (e) {}
                                return {
                                    name: entry.name,
                                    isDirectory: isDir,
                                    path: fullItemPath,
                                    size,
                                    mtime,
                                    modTime: mtime
                                };
                            });
                            localItems.sort((a, b) => {
                                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                                return a.isDirectory ? -1 : 1;
                            });
                            return res.json({ path: safeP, items: localItems, exists: true, fromCatalog: false, isServer: false });
                        } catch (e) {}
                    }
                    return res.json({ path: safeP, items: [], exists: false, isServer: false });
                }

                const serverItems = (typeof catalogGenerator.listFromModularCatalog === 'function')
                    ? catalogGenerator.listFromModularCatalog(safeP, 'server')
                    : null;

                if (fs.existsSync(safeP)) {
                    try {
                        const diskEntries = fs.readdirSync(safeP, { withFileTypes: true });
                        const srvMap = new Map();
                        if (Array.isArray(serverItems)) {
                            for (const si of serverItems) {
                                if (si && si.name) srvMap.set(si.name.toLowerCase(), si);
                            }
                        }
                        const mergedItems = diskEntries.map(entry => {
                            const isDir = entry.isDirectory();
                            const fullItemPath = path.join(safeP, entry.name).replace(/\\/g, '/');
                            const catMatch = srvMap.get(entry.name.toLowerCase());
                            return {
                                name: entry.name,
                                isDirectory: isDir,
                                path: fullItemPath,
                                size: catMatch ? (catMatch.size || 0) : 0,
                                mtime: catMatch ? (catMatch.mtime || catMatch.modTime || null) : null,
                                modTime: catMatch ? (catMatch.modTime || catMatch.mtime || null) : null
                            };
                        });
                        mergedItems.sort((a, b) => {
                            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                            return a.isDirectory ? -1 : 1;
                        });
                        serverDirCache.set(cacheModeKey, { time: Date.now(), items: mergedItems });
                        return res.json({ path: safeP, items: mergedItems, exists: true, fromCatalog: false, isServer: true });
                    } catch (e) {}
                } else if (!forceRefresh && serverItems !== null && serverItems.length > 0) {
                    serverDirCache.set(cacheModeKey, { time: Date.now(), items: serverItems });
                    return res.json({ path: safeP, items: serverItems, exists: true, fromCatalog: true, isServer: true });
                }
            }

            if ((localSource === 'server_catalog' || source === 'server') && !lowerSafeP.startsWith('g:/')) {
                if (cachedEnvState && cachedEnvState.isExternalMachine) {
                    return res.json({ path: safeP, items: [], exists: false, isServer: false, isExternal: true });
                }
                let serverItems = (typeof catalogGenerator.listFromModularCatalog === 'function')
                    ? catalogGenerator.listFromModularCatalog(safeP, 'server')
                    : null;

                if (serverItems === null && typeof catalogGenerator.listFromServerCatalog === 'function') {
                    serverItems = catalogGenerator.listFromServerCatalog(safeP);
                }

                if (serverItems !== null) {
                    // LIVE RECONCILIATION FOR VSUBS / LAN WORKSTATIONS:
                    // Si el puesto tiene conectividad con StorNext (S: o UNC //192.168.206.116/Z o Z: red),
                    // comprobar en ~5ms si hay archivos recién renderizados en esta carpeta física del servidor
                    // para que aparezcan de inmediato sin esperar 1h ni depender de escaneos manuales.
                    if (!cachedEnvState?.isExternalMachine) {
                        try {
                            let srvPhysicalDir = null;
                            if (fs.existsSync('S:/INTERNO')) {
                                const candidate = safeP.replace(/^[a-zA-Z]:/i, 'S:');
                                if (fs.existsSync(candidate)) srvPhysicalDir = candidate;
                            } else if (fs.existsSync('//192.168.206.116/Z/INTERNO')) {
                                const candidate = safeP.replace(/^[a-zA-Z]:/i, '//192.168.206.116/Z');
                                if (fs.existsSync(candidate)) srvPhysicalDir = candidate;
                            } else if (fs.existsSync(safeP)) {
                                const isNet = (typeof catalogGenerator.isZDriveNetwork === 'function') ? catalogGenerator.isZDriveNetwork() : false;
                                if (isNet) srvPhysicalDir = safeP;
                            }

                            if (srvPhysicalDir) {
                                const diskEntries = fs.readdirSync(srvPhysicalDir, { withFileTypes: true });
                                const catNames = new Set(serverItems.map(si => (si.name || '').toLowerCase()));
                                let hasNewItems = false;

                                for (const de of diskEntries) {
                                    if (de.name.toLowerCase() === '_gsdata_') continue;
                                    if (!catNames.has(de.name.toLowerCase())) {
                                        hasNewItems = true;
                                        const fullPhys = path.join(srvPhysicalDir, de.name);
                                        let sz = 0;
                                        let mt = null;
                                        try {
                                            const st = fs.statSync(fullPhys);
                                            sz = st.size;
                                            mt = st.mtime ? st.mtime.toISOString() : null;
                                        } catch (e) {}

                                        const normLogical = `${safeP.replace(/\/+$/, '')}/${de.name}`;
                                        serverItems.push({
                                            name: de.name,
                                            isDirectory: de.isDirectory(),
                                            path: normLogical,
                                            serverPath: normLogical,
                                            targetLocalPath: normLogical,
                                            size: sz,
                                            modTime: mt,
                                            mtime: mt,
                                            fromCatalog: false,
                                            isServer: true
                                        });
                                        catNames.add(de.name.toLowerCase());
                                    }
                                }

                                if (hasNewItems) {
                                    setImmediate(() => {
                                        try {
                                            const projInfo = catalogGenerator.findProjectManifestForPath ? catalogGenerator.findProjectManifestForPath(safeP, 'server') : null;
                                            const proj = projInfo?.projectName || 'surf_love';
                                            if (typeof catalogGenerator.refreshSubCatalog === 'function') {
                                                catalogGenerator.refreshSubCatalog(proj, safeP, 'server').catch(() => {});
                                            }
                                        } catch (e) {}
                                    });
                                }
                            }
                        } catch (liveErr) {
                            console.warn('[FS LIST] Error en chequeo live de server_catalog:', liveErr.message);
                        }
                    }

                    const cleanItems = serverItems.map(item => ({
                        ...item,
                        path: (item.path || '').replace(/^S:/i, 'Z:'),
                        serverPath: (item.serverPath || item.path || '').replace(/^S:/i, 'Z:'),
                        targetLocalPath: (item.targetLocalPath || item.path || '').replace(/^S:/i, 'Z:')
                    }));
                    console.log(`[API /api/fs/list server_catalog] ${safeP} -> ${cleanItems.length} items (${Date.now() - t0}ms)`);
                    try {
                        const syncRoutes = require('./sync.routes');
                        if (req.query.project && typeof syncRoutes.warmDriveSetForPath === 'function') {
                            syncRoutes.warmDriveSetForPath(req.query.project, safeP);
                        }
                    } catch (e) {}
                    return res.json({ path: safeP, items: cleanItems, exists: true, fromCatalog: true, isServer: true });
                }
                console.log(`[API /api/fs/list server_catalog NULL] ${safeP} (${Date.now() - t0}ms)`);
                return res.json({ path: safeP, items: [], exists: false, isServer: true });
            }

            if ((localSource === 'drive_catalog' || source === 'drive') && !lowerSafeP.startsWith('g:/')) {
                let driveItems = (typeof catalogGenerator.listFromModularCatalog === 'function')
                    ? catalogGenerator.listFromModularCatalog(safeP, 'drive')
                    : null;

                if (driveItems === null && typeof catalogGenerator.listFromCatalog === 'function') {
                    driveItems = catalogGenerator.listFromCatalog(safeP);
                }

                if (driveItems !== null) {
                    const cleanDriveItems = driveItems.map(item => ({
                        ...item,
                        path: item.path || item.onlinePath,
                        onlinePath: item.onlinePath || item.path,
                        targetLocalPath: (item.targetLocalPath || item.path || '').replace(/^S:/i, 'Z:')
                    }));
                    return res.json({ path: safeP, items: cleanDriveItems, exists: true, fromCatalog: true, isDrive: true });
                }
                return res.json({ path: safeP, items: [], exists: false, isDrive: true });
            }

            if (lowerSafeP.startsWith('g:/') || lowerSafeP === 'g:') {
                if (!checkInternetQuickly()) {
                    onlineEngine = 'catalog';
                }

                if (onlineEngine === 'rclone') {
                    if (!forceRefresh && rcloneDirCache.has(lowerSafeP)) {
                        const cached = rcloneDirCache.get(lowerSafeP);
                        if (Date.now() - cached.time < RCLONE_CACHE_TTL) {
                            return res.json({ path: safeP, items: cached.items, exists: true, fromCache: true, fromRclone: true });
                        }
                    }

                    if (typeof catalogGenerator.listWithRclone === 'function') {
                        const rcloneItems = catalogGenerator.listWithRclone(safeP);
                        if (rcloneItems !== null) {
                            rcloneDirCache.set(lowerSafeP, { time: Date.now(), items: rcloneItems });
                            return res.json({ path: safeP, items: rcloneItems, exists: true, fromRclone: true });
                        }
                    }
                }

                if (onlineEngine === 'catalog' || (!fs.existsSync(safeP) && onlineEngine !== 'gdrive')) {
                    let catalogItems = (typeof catalogGenerator.listFromModularCatalog === 'function')
                        ? catalogGenerator.listFromModularCatalog(safeP, 'drive')
                        : null;

                    if (catalogItems === null && typeof catalogGenerator.listFromCatalog === 'function') {
                        catalogItems = catalogGenerator.listFromCatalog(safeP);
                    }

                    if (catalogItems !== null) {
                        for (const it of catalogItems) {
                            if (it.localExists === undefined && it.targetLocalPath) {
                                try {
                                    it.localExists = (typeof catalogGenerator.fileExistsFast === 'function')
                                        ? catalogGenerator.fileExistsFast(it.targetLocalPath)
                                        : fs.existsSync(it.targetLocalPath);
                                } catch (e) {
                                    it.localExists = false;
                                }
                            }
                        }
                        return res.json({ path: safeP, items: catalogItems, exists: true, fromCatalog: true });
                    }
                    return res.json({ path: safeP, items: [], exists: false });
                }

                if (fs.existsSync(safeP)) {
                    targetPath = safeP;
                } else {
                    return res.json({ path: safeP, items: [], exists: false });
                }
            } else if (fs.existsSync(safeP)) {
                targetPath = safeP;
            } else {
                return res.json({ path: safeP, items: [], exists: false });
            }
        }

        if (!targetPath) {
            const presetFallback = path.join(APP_ROOT, 'presets/pipeline_config.json');
            const configPath = fs.existsSync(PIPELINE_CONFIG_FILE) ? PIPELINE_CONFIG_FILE : presetFallback;
            let config = null;
            if (fs.existsSync(configPath)) {
                try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
            }

            const candidates = [];
            if (config?.paths?.root_work) candidates.push(config.paths.root_work);
            candidates.push('Z:/');

            for (const p of candidates) {
                if (!p) continue;
                const safeP = decodeURIComponent(p);
                if (fs.existsSync(safeP)) {
                    targetPath = safeP;
                    break;
                }
            }
        }

        if (!targetPath) {
            return res.json({ path: requestedPath || 'Z:/', items: [] });
        }

        const isNetworkPath = targetPath.startsWith('//') || targetPath.startsWith('\\\\') || /^[d-z]:/i.test(targetPath);
        let items = [];
        try {
            items = fs.readdirSync(targetPath, { withFileTypes: true });
        } catch (e) {
            return res.json({ path: targetPath, items: [], exists: false, error: e.message });
        }
        const result = items.map(item => {
            const isDir = item.isDirectory();
            const fullItemPath = path.join(targetPath, item.name).replace(/\\/g, '/');
            let size = 0;
            let mtime = null;
            if (!isDir && !isNetworkPath) {
                try {
                    const st = fs.statSync(fullItemPath);
                    size = st.size;
                    mtime = st.mtime ? st.mtime.toISOString() : null;
                } catch (e) {}
            }
            return {
                name: item.name,
                isDirectory: isDir,
                path: fullItemPath,
                size,
                mtime,
                modTime: mtime
            };
        });

        result.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        serverDirCache.set(`local:${targetPath.toLowerCase()}`, { time: Date.now(), items: result });
        if (typeof lowerSafeP !== 'undefined') {
            serverDirCache.set(`local:${lowerSafeP}`, { time: Date.now(), items: result });
        }

        res.json({
            path: targetPath,
            items: result
        });
    } catch (error) {
        console.error('FS List Error:', error);
        res.status(500).json({ error: 'Unable to read directory', details: error.message });
    }
});

router.post('/api/fs/open', async (req, res) => {
    let p = req.body?.path;
    if (!p) return res.status(400).json({ error: 'No se especificó ninguna ruta para abrir' });
    p = p.replace(/\//g, '\\');

    let targetPath = p;
    let isFile = false;

    try {
        if (fs.existsSync(targetPath)) {
            const stat = fs.statSync(targetPath);
            isFile = stat.isFile();
        } else {
            let current = path.dirname(targetPath);
            while (current && current.length > 3 && !fs.existsSync(current)) {
                current = path.dirname(current);
            }
            if (fs.existsSync(current)) {
                targetPath = current;
                isFile = false;
            } else {
                return res.status(404).json({ error: 'La ruta no existe localmente en este equipo.' });
            }
        }
    } catch (e) {
        console.warn('[FS_OPEN] Stat warning:', e.message);
        return res.status(500).json({ error: e.message });
    }

    try {
        if (isFile && !fs.existsSync(targetPath)) {
            isFile = false;
            targetPath = path.dirname(targetPath);
        }

        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: 'La ruta no existe localmente en este equipo.' });
        }

        const args = isFile ? [`/select,${targetPath}`] : [targetPath];
        const child = spawn('explorer.exe', args, {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        console.log(`[FS_OPEN] Explorador de Windows lanzado en: ${targetPath} (isFile: ${isFile})`);
        res.json({ success: true, opened: targetPath, isFile });
    } catch (err) {
        console.error('[FS_OPEN] Error al abrir en Explorador:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/fs/mkdir', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: 'No path provided' });
    try {
        await fs.ensureDir(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/fs/rename', async (req, res) => {
    let { oldPath, newPath, project } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'Missing paths' });

    oldPath = oldPath.replace(/\\/g, '/');
    newPath = newPath.replace(/\\/g, '/');

    const invalidateRenameCaches = () => {
        const parentOld = path.dirname(oldPath).replace(/\\/g, '/').toLowerCase();
        const parentNew = path.dirname(newPath).replace(/\\/g, '/').toLowerCase();
        serverDirCache.delete(parentOld);
        serverDirCache.delete(parentNew);
        serverDirCache.delete(`local:${parentOld}`);
        serverDirCache.delete(`local:${parentNew}`);
        serverDirCache.delete(oldPath.toLowerCase());
        serverDirCache.delete(newPath.toLowerCase());

        if (typeof catalogGenerator.recordRenamedItem === 'function') {
            try { catalogGenerator.recordRenamedItem(project, oldPath, newPath); } catch (e) {}
        }
        if (typeof catalogGenerator.clearMemoryCaches === 'function') {
            catalogGenerator.clearMemoryCaches();
        }
    };

    try {
        if (!fs.existsSync(oldPath)) {
            if (fs.existsSync(newPath)) {
                invalidateRenameCaches();
                return res.json({ success: true, alreadyRenamed: true });
            }
            return res.status(404).json({ error: `El archivo origen no existe: ${oldPath}` });
        }

        await fs.rename(oldPath, newPath);
        invalidateRenameCaches();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/server/connect-unc', async (req, res) => {
    try {
        const { uncPath, user, pass } = req.body;
        const targetUnc = (uncPath || getServerUncRoot()).replace(/\//g, '\\');
        let cmd = `net use "${targetUnc}"`;
        if (pass && user) {
            cmd += ` "${pass}" /user:"${user}" /persistent:no`;
        } else if (user) {
            cmd += ` /user:"${user}" /persistent:no`;
        } else {
            cmd += ` /persistent:no`;
        }
        execSync(cmd, { encoding: 'utf8', timeout: 5000 });
        const accessible = fs.existsSync(targetUnc);
        res.json({ success: true, connectedTo: targetUnc, accessible });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/api/fs/copy', async (req, res) => {
    const { src, dest, action } = req.body;
    if (!src || !dest) return res.status(400).json({ error: 'Missing paths' });
    try {
        let actualSrc = src.replace(/\\/g, '/');
        let actualDest = dest.replace(/\\/g, '/');

        const env = getCachedEnvState() || {};
        const isNotRealServer = !env?.zInfo?.isRealServer;

        if (isNotRealServer) {
            const uncRoot = getServerUncRoot();
            ensureServerUncAccess(uncRoot);

            if (action === 'download_server' || (!fs.existsSync(actualSrc) && actualSrc.toLowerCase().startsWith('z:/'))) {
                actualSrc = actualSrc.replace(/^z:/i, uncRoot);
                console.log(`[FS COPY] Descargando desde Servidor Central UNC: ${actualSrc} -> ${actualDest}`);
            } else if (action === 'upload_server') {
                actualDest = actualDest.replace(/^z:/i, uncRoot);
                console.log(`[FS COPY] Subiendo a Servidor Central UNC: ${actualSrc} -> ${actualDest}`);
            }
        }

        await fs.ensureDir(path.dirname(actualDest));
        await fs.copy(actualSrc, actualDest);
        res.json({ success: true });
    } catch (err) {
        console.error(`[FS COPY ERROR] Error copiando ${src} -> ${dest}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/fs/stat', async (req, res) => {
    let { path: p } = req.body;
    if (!p) return res.status(400).json({ error: 'No path provided' });
    try {
        p = p.replace(/\\/g, '/');
        if (!(await fs.pathExists(p))) {
            return res.json({ exists: false });
        }
        const st = await fs.stat(p);
        const isDirectory = st.isDirectory();
        let itemCount = null;
        if (isDirectory) {
            try {
                const entries = await fs.readdir(p);
                itemCount = entries.length;
            } catch (e) {}
        }
        res.json({
            exists: true,
            isDirectory,
            size: st.size,
            mtime: st.mtime ? st.mtime.toISOString() : null,
            birthtime: st.birthtime ? st.birthtime.toISOString() : null,
            itemCount
        });
    } catch (err) {
        res.json({ exists: false, error: err.message });
    }
});

router.post('/api/fs/delete', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: 'No path provided' });
    try {
        await fs.remove(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/fs/deleteFile', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: 'No path provided' });
    try {
        await fs.remove(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/api/fs/readFile', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Missing path' });
    const norm = filePath.replace(/\\/g, '/').toLowerCase();
    if (norm.startsWith('g:/') || norm.startsWith('g:')) {
        return res.json({ content: null });
    }
    try {
        if (!fs.existsSync(filePath)) {
            return res.json({ content: null });
        }
        const content = await fs.readFile(filePath, 'utf-8');
        res.json({ content });
    } catch (err) {
        res.json({ content: null, error: err.message });
    }
});

router.post('/api/fs/writeFile', async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Missing path' });
    try {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, content || '', 'utf-8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/api/fs/dirSize', (req, res) => {
    const dirPath = req.query.path;
    if (!dirPath) return res.status(400).json({ error: 'Missing path' });

    const norm = (dirPath || '').replace(/\\/g, '/').toLowerCase();

    const cachedSize = dirSizeMemoryCache.get(norm);
    if (cachedSize && (Date.now() - cachedSize.time < 300000)) {
        return res.json({ path: dirPath, size: cachedSize.size, fromCache: true });
    }

    try {
        if (typeof catalogGenerator.getDirSizeFromCatalog === 'function') {
            const catSize = catalogGenerator.getDirSizeFromCatalog(dirPath);
            if (catSize !== null) {
                dirSizeMemoryCache.set(norm, { size: catSize, time: Date.now() });
                return res.json({ path: dirPath, size: catSize, fromCatalog: true });
            }
        }
    } catch (e) {}

    if (norm.startsWith('//') || norm.startsWith('\\\\')) {
        return res.json({ path: dirPath, size: 0, fromCatalog: false });
    }

    const cmd = `powershell -NoProfile -Command "(Get-ChildItem -Path '${dirPath.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
        if (err) {
            return res.json({ path: dirPath, size: 0, error: err.message });
        }
        const size = parseInt((stdout || '').trim(), 10) || 0;
        dirSizeMemoryCache.set(norm, { size, time: Date.now() });
        res.json({ path: dirPath, size });
    });
});

// --- TEMPLATES SYSTEM ENDPOINTS ---
router.post('/api/templates/upload', async (req, res) => {
    try {
        const { type = 'shot', filename, fileData } = req.body;
        if (!filename || !fileData) {
            return res.status(400).json({ error: 'Missing filename or fileData' });
        }

        const subDir = type === 'asset' ? 'AssetDesigner' : 'ShotDesigner';
        const localTemplatesDir = path.join(APP_ROOT, 'presets/templates', subDir);
        await fs.ensureDir(localTemplatesDir);

        const safeFilename = path.basename(filename);
        const localDestPath = path.join(localTemplatesDir, safeFilename);

        const buffer = Buffer.from(fileData, 'base64');
        await fs.writeFile(localDestPath, buffer);

        // Also mirror to channel's network presets if running from local copy
        const zTemplatesDir = path.join(NETWORK_APP_DIR, 'presets/templates', subDir);
        if (path.resolve(zTemplatesDir).toLowerCase() !== path.resolve(localTemplatesDir).toLowerCase()) {
            try {
                await fs.ensureDir(zTemplatesDir);
                await fs.writeFile(path.join(zTemplatesDir, safeFilename), buffer);
            } catch (e) {}
        }

        res.json({
            success: true,
            path: localDestPath.replace(/\\/g, '/'),
            filename: safeFilename
        });
    } catch (err) {
        console.error('Template upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/templates/findReference', async (req, res) => {
    try {
        const { refRoot, processName } = req.body;
        if (!refRoot || !fs.existsSync(refRoot)) {
            return res.json({ found: false, error: 'Reference root does not exist' });
        }

        const cleanProcess = (processName || '').toLowerCase().trim();

        async function getFilesRec(dir, depth = 0) {
            if (depth > 4) return [];
            let results = [];
            try {
                const list = await fs.readdir(dir, { withFileTypes: true });
                for (const item of list) {
                    const full = path.join(dir, item.name);
                    if (item.isDirectory()) {
                        if (!item.name.startsWith('.') && !item.name.startsWith('_')) {
                            const sub = await getFilesRec(full, depth + 1);
                            results = results.concat(sub);
                        }
                    } else if (item.isFile()) {
                        if (!item.name.startsWith('.') && !item.name.startsWith('~')) {
                            results.push({ name: item.name, fullPath: full.replace(/\\/g, '/') });
                        }
                    }
                }
            } catch (e) {}
            return results;
        }

        const allFiles = await getFilesRec(refRoot);

        let candidates = allFiles.filter(f => {
            const nameLower = f.name.toLowerCase();
            const pathLower = f.fullPath.toLowerCase();
            return nameLower.includes(cleanProcess) || pathLower.includes('/' + cleanProcess + '/');
        });

        if (candidates.length === 0) {
            candidates = allFiles.filter(f => !f.name.endsWith('.txt') && !f.name.endsWith('.json') && !f.name.endsWith('.ini'));
        }

        if (candidates.length === 0) {
            return res.json({ found: false });
        }

        candidates.sort((a, b) => {
            const vA = (a.name.match(/_v(\d+)/i) || [])[1] || '0';
            const vB = (b.name.match(/_v(\d+)/i) || [])[1] || '0';
            return parseInt(vB, 10) - parseInt(vA, 10);
        });

        const best = candidates[0];
        const ext = path.extname(best.name);

        res.json({
            found: true,
            filePath: best.fullPath,
            fileName: best.name,
            ext
        });
    } catch (err) {
        console.error('Error finding reference template:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
