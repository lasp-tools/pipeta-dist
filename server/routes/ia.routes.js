const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { exec } = require('child_process');
const catalogGenerator = require('../sync_catalog_generator');
const higgsfieldApi = require('../higgsfield_api');
const {
    APP_ROOT,
    NETWORK_APP_DIR,
    CUSTOM_TOKENS_FILE,
    PIPELINE_CONFIG_FILE
} = require('../core/app-context');
const {
    getReadSyncCacheCandidateDirs,
    saveOrderInCandidateDirs
} = require('../core/sync-paths');
const { ensureSyncWorkerRunning } = require('./sync.routes');

const router = express.Router();

// --- IA PIPELINE ENDPOINTS ---
router.get('/api/ia/drive-info', (req, res) => {
    try {
        const isNet = (typeof catalogGenerator.isZDriveNetwork === 'function')
            ? catalogGenerator.isZDriveNetwork()
            : true;
        const isVsubs = (process.platform === 'win32' && !isNet);
        const hasSmb = fs.existsSync('S:/') || fs.existsSync('//192.168.206.116/Z');
        res.json({
            isVsubs,
            isNetworkZ: isNet,
            hasSmbStorage: hasSmb
        });
    } catch (e) {
        res.json({ isVsubs: false, isNetworkZ: true, hasSmbStorage: false });
    }
});

router.get('/api/ia/catalog-hierarchy', (req, res) => {
    try {
        const projName = String(req.query.project || 'surf_love').replace(/^proj_/i, '').trim();
        const type = (req.query.type || 'episodes').trim(); // 'episodes' | 'scenes' | 'shots'
        const ep = (req.query.ep || '').trim();
        const seq = (req.query.seq || '').trim();

        function findServerCacheDir(pName) {
            const candidates = [
                ...getReadSyncCacheCandidateDirs().map(d => path.join(d, 'projects', pName, 'server')),
                path.join('Z:/_SYNC_CACHE/projects', pName, 'server'),
                path.join('S:/_SYNC_CACHE/projects', pName, 'server'),
                path.join('//192.168.206.116/Z/_SYNC_CACHE/projects', pName, 'server')
            ];
            for (const c of candidates) {
                if (fs.existsSync(c)) return c;
            }
            return null;
        }

        const cacheDir = findServerCacheDir(projName);

        if (type === 'episodes') {
            let episodes = [];
            if (cacheDir) {
                const manifestPath = path.join(cacheDir, 'manifest.json');
                if (fs.existsSync(manifestPath)) {
                    try {
                        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                        episodes = Object.keys(manifest.subCatalogs || {})
                            .filter(k => k.startsWith('episodios/') && !k.includes('_root'))
                            .map(k => k.replace('episodios/', ''))
                            .filter(e => !['templates', 'VFX-Edits', 'XXX', 'Old'].includes(e));
                    } catch (e) {}
                }
            }
            if (episodes.length === 0) {
                const rootsToTry = ['S:/', '//192.168.206.116/Z/'];
                for (const r of rootsToTry) {
                    const epDir = path.join(r, projName, 'episodios');
                    if (fs.existsSync(epDir)) {
                        episodes = fs.readdirSync(epDir, { withFileTypes: true })
                            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
                            .map(d => d.name);
                        break;
                    }
                }
            }
            episodes.sort();
            return res.json({ project: projName, type, items: episodes });
        }

        if (type === 'scenes') {
            if (!ep) return res.status(400).json({ error: 'ep parameter required' });
            const scenes = new Set();
            if (cacheDir) {
                const epFile = path.join(cacheDir, 'episodios', `${ep}.json`);
                if (fs.existsSync(epFile)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(epFile, 'utf8'));
                        for (const it of (data.flatList || [])) {
                            const rel = (it.relPath || '').replace(/\\/g, '/');
                            const mSeq = rel.match(new RegExp(`^episodios/${ep}/secuencias/([^/]+)`, 'i'));
                            if (mSeq) scenes.add(mSeq[1]);
                        }
                    } catch (e) {}
                }
            }
            if (scenes.size === 0) {
                const rootsToTry = ['S:/', '//192.168.206.116/Z/'];
                for (const r of rootsToTry) {
                    const seqDir = path.join(r, projName, 'episodios', ep, 'secuencias');
                    if (fs.existsSync(seqDir)) {
                        fs.readdirSync(seqDir, { withFileTypes: true })
                            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
                            .forEach(d => scenes.add(d.name));
                        break;
                    }
                }
            }
            return res.json({ project: projName, ep, type, items: Array.from(scenes).sort() });
        }

        if (type === 'shots') {
            if (!ep || !seq) return res.status(400).json({ error: 'ep and seq parameters required' });
            const shots = new Set();
            if (cacheDir) {
                const epFile = path.join(cacheDir, 'episodios', `${ep}.json`);
                if (fs.existsSync(epFile)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(epFile, 'utf8'));
                        const prefix = `episodios/${ep}/secuencias/${seq}/`;
                        for (const it of (data.flatList || [])) {
                            const rel = (it.relPath || '').replace(/\\/g, '/');
                            if (rel.startsWith(prefix)) {
                                const sub = rel.substring(prefix.length);
                                const parts = sub.split('/');
                                let shotName = parts[0];
                                if (shotName.toLowerCase() === 'shots' && parts.length > 1) shotName = parts[1];
                                if (shotName && shotName.toLowerCase() !== 'shots' && !shotName.startsWith('.') && !shotName.startsWith('_')) {
                                    shots.add(shotName);
                                }
                            }
                        }
                    } catch (e) {}
                }
            }
            if (shots.size === 0) {
                const rootsToTry = ['S:/', '//192.168.206.116/Z/'];
                for (const r of rootsToTry) {
                    let shotDir = path.join(r, projName, 'episodios', ep, 'secuencias', seq, 'shots');
                    if (!fs.existsSync(shotDir)) {
                        shotDir = path.join(r, projName, 'episodios', ep, 'secuencias', seq);
                    }
                    if (fs.existsSync(shotDir)) {
                        fs.readdirSync(shotDir, { withFileTypes: true })
                            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_') && d.name.toLowerCase() !== 'shots')
                            .forEach(d => shots.add(d.name));
                        break;
                    }
                }
            }
            return res.json({ project: projName, ep, seq, type, items: Array.from(shots).sort() });
        }

        return res.status(400).json({ error: 'Invalid type. Must be episodes, scenes, or shots' });
    } catch (err) {
        console.error('Catalog hierarchy error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/api/ia/config', (req, res) => {
    res.json({
        motors: [
            { id: 'SD2', label: 'Seedance v2.0' },
            { id: 'SD25', label: 'Seedance v2.5' },
            { id: 'VEO3', label: 'Google Veo v3.0' },
            { id: 'VO31', label: 'Google Veo v3.1' },
            { id: 'GOMN', label: 'Gemini / Veo Omni Flash' },
            { id: 'NBN2', label: 'Nano Banana 2' },
            { id: 'NB2P', label: 'Nano Banana 2 Pro' }
        ],
        resolutions: ['FHD', 'UHD', 'HD', 'SQ1K', 'UW2K', '1080p16', '4k169', '1344x768', '1536x864', '2206x946'],
        framings: ['FLL', 'CRP'],
        tags: {
            levelA: ['', 'ref', 'ref1050', 'f1001', 'start1001', 'end1100'],
            levelB: ['', 'inp', 'ups', 'mask', 'clean', 'elem'],
            levelC: ['', 't2i', 'i2i', 't2v', 'i2v', 'v2v', 'm2v']
        }
    });
});

router.get('/api/ia/resolve-shot', (req, res) => {
    const shotId = (req.query.shotId || '').trim();
    const mediaRootParam = (req.query.mediaRoot || req.query.workRoot || '').trim();
    if (!shotId) return res.status(400).json({ error: 'shotId parameter required' });

    const parts = shotId.split('_');
    const projCode = parts[0] || 'PROJ';
    const ep = parts[1] || 'B01';
    const seq = parts[2] || '001';
    const shotNum = parts[3] || '0100';

    let rootPath = mediaRootParam || 'Z:/INTERNO/MEDIA/';
    if (!mediaRootParam) {
        try {
            const presetFallback = path.join(APP_ROOT, 'presets/pipeline_config.json');
            const configPath = fs.existsSync(PIPELINE_CONFIG_FILE) ? PIPELINE_CONFIG_FILE : presetFallback;
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.paths && config.paths.root_media) {
                    rootPath = config.paths.root_media;
                } else if (config.paths && config.paths.root_work) {
                    rootPath = config.paths.root_work;
                }
            }
        } catch (e) {}
    }

    const candidate1 = path.normalize(path.join(rootPath, 'episodios', ep, 'secuencias', seq, 'shots', shotId, 'IA')).replace(/\\/g, '/');
    const candidate2 = path.normalize(path.join(rootPath, ep, seq, shotId, 'IA')).replace(/\\/g, '/');
    const candidate3 = path.normalize(path.join(rootPath, 'episodios', ep, 'secuencias', seq, 'shots', shotId)).replace(/\\/g, '/');
    const candidate4 = path.normalize(path.join(rootPath, ep, seq, shotId)).replace(/\\/g, '/');

    function getCandidatePhysicalPaths(p) {
        if (!p || typeof p !== 'string') return [];
        const norm = p.replace(/\\/g, '/');
        const list = [norm];
        if (/^[a-zA-Z]:\//i.test(norm)) {
            const afterDrive = norm.substring(3);
            list.push(`D:/Z/${afterDrive}`);
            list.push(`C:/STORAGE/Z/${afterDrive}`);
            list.push(`S:/${afterDrive}`);
            list.push(`\\\\192.168.206.116\\Z\\${afterDrive}`);
        }
        return [...new Set(list)];
    }

    function resolvePhysicalLocalPath(p, forWrite = false) {
        if (!p || typeof p !== 'string') return p;
        const norm = p.replace(/\\/g, '/');
        if (fs.existsSync(norm)) return norm;
        if (/^[a-zA-Z]:\//i.test(norm)) {
            const afterDrive = norm.substring(3);
            const candidates = [
                `D:/Z/${afterDrive}`,
                `C:/STORAGE/Z/${afterDrive}`,
                `S:/${afterDrive}`
            ];
            for (const cand of candidates) {
                if (fs.existsSync(cand)) return cand;
            }
            if (forWrite && /^z:/i.test(norm)) {
                if (fs.existsSync('D:/Z')) return `D:/Z/${afterDrive}`;
                if (fs.existsSync('C:/STORAGE/Z')) return `C:/STORAGE/Z/${afterDrive}`;
            }
        }
        return norm;
    }

    function testPathExistsAnywhere(p) {
        if (!p) return false;
        const norm = p.replace(/\\/g, '/');
        const physList = getCandidatePhysicalPaths(norm);
        for (const cand of physList) {
            if (fs.existsSync(cand)) return true;
        }
        // Solo consultar los catálogos locales ya en memoria/disco (probando tanto IA como ia)
        if (typeof catalogGenerator.listFromModularCatalog === 'function') {
            const queries = [norm, norm.replace(/\/ia(\/|$)/i, '/ia$1'), norm.replace(/\/ia(\/|$)/i, '/IA$1')];
            for (const q of queries) {
                const srvItems = catalogGenerator.listFromModularCatalog(q, 'server');
                if (srvItems !== null && srvItems.length > 0) return true;
                const drvItems = catalogGenerator.listFromModularCatalog(q, 'drive');
                if (drvItems !== null && drvItems.length > 0) return true;
            }
        }
        return false;
    }

    let resolvedIaPath = candidate2;
    if (testPathExistsAnywhere(candidate2)) resolvedIaPath = candidate2;
    else if (testPathExistsAnywhere(candidate1)) resolvedIaPath = candidate1;
    else if (testPathExistsAnywhere(candidate4)) resolvedIaPath = candidate2;
    else if (testPathExistsAnywhere(candidate3)) resolvedIaPath = candidate1;
    else if (testPathExistsAnywhere(path.join(rootPath, ep))) resolvedIaPath = candidate2;
    else resolvedIaPath = candidate2;

    const subfoldersParam = (req.query.subfolders || req.query.subfolder || '').trim();
    let requestedSubs = subfoldersParam ? subfoldersParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : ['wip'];
    if (requestedSubs.length === 0) requestedSubs = ['wip'];

    let nextVersion = 'v001';
    let maxVer = 0;
    const existingFiles = [];
    const seenFiles = new Set();

    // Siempre escanear todas las subcarpetas del pipeline de IA para no perder versiones si están en export/ref/enc/root
    const subsToScan = Array.from(new Set([...requestedSubs, 'wip', 'root', 'export', 'ref', 'enc']));

    try {
        subsToScan.forEach(sub => {
            let targetLogicalDir = resolvedIaPath;
            if (sub === 'export') targetLogicalDir = path.join(resolvedIaPath, 'export').replace(/\\/g, '/');
            else if (sub === 'ref') targetLogicalDir = path.join(resolvedIaPath, 'ref').replace(/\\/g, '/');
            else if (sub === 'enc') targetLogicalDir = path.join(resolvedIaPath, 'enc').replace(/\\/g, '/');
            else if (sub === 'wip' || sub === 'root') targetLogicalDir = resolvedIaPath;
            else targetLogicalDir = path.join(resolvedIaPath, sub).replace(/\\/g, '/');

            const addFileEntry = (filename, sourceOrigin) => {
                if (!filename || filename.startsWith('.')) return;
                const lower = filename.toLowerCase();
                const key = `${sub}:${lower}`;
                if (seenFiles.has(key)) return;
                seenFiles.add(key);

                const match = filename.match(/(?:_|^)v(\d{2,4})(?:[_\.]|$)/i);
                let verNum = 0;
                if (match) {
                    verNum = parseInt(match[1], 10);
                    if (verNum > maxVer) maxVer = verNum;
                }
                existingFiles.push({
                    name: filename,
                    subfolder: sub,
                    fullPath: path.join(targetLogicalDir, filename).replace(/\\/g, '/'),
                    version: verNum,
                    source: sourceOrigin
                });
            };

            // 1. Escaneo en disco físico local y red (revisando Z:, D:/Z, C:/STORAGE/Z, S:)
            const candidatePaths = getCandidatePhysicalPaths(targetLogicalDir);
            for (const cPath of candidatePaths) {
                if (fs.existsSync(cPath)) {
                    try {
                        const entries = fs.readdirSync(cPath, { withFileTypes: true });
                        for (const entry of entries) {
                            if (entry.isFile()) addFileEntry(entry.name, cPath.startsWith('S:') || cPath.startsWith('\\\\') ? 'server_smb' : 'local');
                        }
                    } catch (e) {}
                }
            }

            // 2. Escaneo en Catálogo Modular de Servidor (probando targetLogicalDir con IA e ia)
            if (typeof catalogGenerator.listFromModularCatalog === 'function') {
                try {
                    const catQueries = [
                        targetLogicalDir,
                        targetLogicalDir.replace(/\/ia(\/|$)/i, '/ia$1'),
                        targetLogicalDir.replace(/\/ia(\/|$)/i, '/IA$1')
                    ];
                    for (const q of catQueries) {
                        const srvItems = catalogGenerator.listFromModularCatalog(q, 'server') || [];
                        for (const it of srvItems) {
                            if (!it.isDirectory) addFileEntry(it.name, 'server_catalog');
                        }
                    }
                } catch (e) {}
            }

            // 3. Fallback Catálogo plano de Servidor
            if (typeof catalogGenerator.listFromServerCatalog === 'function') {
                try {
                    const srvFlat = catalogGenerator.listFromServerCatalog(targetLogicalDir) || [];
                    for (const it of srvFlat) {
                        if (!it.isDirectory) addFileEntry(it.name, 'server_catalog_flat');
                    }
                } catch (e) {}
            }

            // 4. Escaneo en Catálogo de Google Drive (en caché local)
            if (typeof catalogGenerator.listFromModularCatalog === 'function') {
                try {
                    const drvItems = catalogGenerator.listFromModularCatalog(targetLogicalDir, 'drive') || [];
                    for (const it of drvItems) {
                        if (!it.isDirectory) addFileEntry(it.name, 'drive_catalog');
                    }
                } catch (e) {}
            }
        });

        nextVersion = 'v' + String(maxVer + 1).padStart(3, '0');
    } catch (e) {
        console.error('[IA RESOLVE-SHOT] Error scanning IA folders and catalogs:', e);
    }

    res.json({
        shotId,
        projCode,
        ep,
        seq,
        shotNum,
        iaPath: resolvedIaPath,
        exists: testPathExistsAnywhere(resolvedIaPath),
        selectedSubfolders: requestedSubs,
        maxVersion: maxVer,
        suggestedVersion: nextVersion,
        existingFiles
    });
});

router.post('/api/ia/check-collision', (req, res) => {
    try {
        const { targets } = req.body;
        if (!Array.isArray(targets)) {
            return res.status(400).json({ error: 'targets array required' });
        }
        const results = targets.map(t => {
            const logicalFull = path.join(t.targetFolder || '', t.filename || '').replace(/\\/g, '/');
            const physFolder = resolvePhysicalLocalPath(t.targetFolder || '');
            const physFull = path.join(physFolder, t.filename || '').replace(/\\/g, '/');
            const exists = fs.existsSync(logicalFull) || fs.existsSync(physFull);
            return {
                id: t.id,
                filename: t.filename,
                targetFolder: t.targetFolder,
                fullPath: logicalFull,
                exists
            };
        });
        res.json({ results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/ia/ingest', (req, res) => {
    try {
        const { targetFolder, filename, sourcePath, fileData } = req.body;
        if (!targetFolder || !filename) {
            return res.status(400).json({ error: 'targetFolder and filename are required' });
        }

        const effectiveTarget = resolvePhysicalLocalPath(targetFolder, true);
        if (!fs.existsSync(effectiveTarget)) {
            fs.mkdirSync(effectiveTarget, { recursive: true });
        }

        const destFilePath = path.join(effectiveTarget, filename);

        if (sourcePath && fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destFilePath);
        } else if (fileData) {
            const buffer = Buffer.from(fileData, 'base64');
            if (buffer.length === 0) {
                return res.status(400).json({ error: 'El archivo recibido está vacío (0 bytes).' });
            }
            fs.writeFileSync(destFilePath, buffer);
        } else {
            return res.status(400).json({ error: 'No se encontró la ruta en disco ni se recibieron datos del archivo.' });
        }

        const stats = fs.statSync(destFilePath);
        console.log(`[IA INGEST] Saved: ${destFilePath} (${stats.size} bytes)`);
        res.json({
            success: true,
            destination: destFilePath,
            filename,
            size: stats.size
        });
    } catch (err) {
        console.error('Ingest Error:', err);
        res.status(500).json({ error: 'Failed to ingest file', details: err.message });
    }
});

router.get('/api/ia/open-folder', (req, res) => {
    const folderPath = (req.query.folderPath || '').trim();
    if (!folderPath) return res.status(400).json({ error: 'folderPath required' });

    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        const normPath = path.normalize(folderPath);
        exec(`explorer "${normPath}"`);
        res.json({ success: true, opened: normPath });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.all('/api/ia/open-file', (req, res) => {
    let filePath = (req.query.filePath || req.body?.filePath || '').trim();
    const fileData = req.body?.fileData;
    const filename = req.body?.filename || path.basename(filePath) || 'preview.mp4';

    try {
        if ((!filePath || !fs.existsSync(filePath)) && fileData) {
            const tempDir = path.join(os.tmpdir(), 'pipeta_previews');
            fs.ensureDirSync(tempDir);
            filePath = path.join(tempDir, filename);
            const buffer = Buffer.from(fileData, 'base64');
            fs.writeFileSync(filePath, buffer);
        }

        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Archivo no encontrado en disco ni datos recibidos.' });
        }

        const normPath = path.normalize(filePath);
        const psCmd = `powershell.exe -NoProfile -Command "Start-Process -FilePath '${normPath.replace(/'/g, "''")}'"`;
        exec(psCmd, (err) => {
            if (err) {
                exec(`cmd /c start "" "${normPath}"`);
            }
        });

        res.json({ success: true, opened: normPath });
    } catch (e) {
        console.error('open-file error:', e);
        res.status(500).json({ error: e.message });
    }
});

// --- HIGGSFIELD AI INTEGRATION ENDPOINTS ---
router.get('/api/higgsfield/status', (req, res) => {
    try {
        const creds = higgsfieldApi.getCredentials();
        res.json({
            success: true,
            hasCredentials: !!creds,
            workspaceId: creds ? creds.workspaceId : null,
            source: creds ? creds.source : null
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/api/higgsfield/job/:jobId', async (req, res) => {
    const jobId = req.params.jobId;

    try {
        const details = await higgsfieldApi.fetchJobDetails(jobId);
        if (details && details.success) {
            return res.json(details);
        }
    } catch (localErr) {
        console.warn(`[HIGGSFIELD API] Consulta local falló (${localErr.message}). Delegando consulta al Worker central...`);
    }

    try {
        const reqId = `hf_query_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const orderData = {
            id: reqId,
            type: 'query_higgsfield_job',
            jobId,
            status: 'pending',
            user: (os.userInfo ? os.userInfo().username : 'unknown'),
            createdAt: new Date().toISOString()
        };

        const reqFile = saveOrderInCandidateDirs(reqId, orderData);
        ensureSyncWorkerRunning();

        const waitStart = Date.now();
        while (Date.now() - waitStart < 20000) {
            await new Promise(r => setTimeout(r, 400));
            if (fs.existsSync(reqFile)) {
                try {
                    const data = fs.readJsonSync(reqFile);
                    if (data.status === 'completed' && data.result) {
                        try { fs.removeSync(reqFile); } catch (e) {}
                        return res.json(data.result);
                    }
                    if (data.status === 'failed') {
                        try { fs.removeSync(reqFile); } catch (e) {}
                        return res.status(500).json({ success: false, error: data.error || 'Fallo en Worker' });
                    }
                } catch (e) {}
            }
        }

        try { fs.removeSync(reqFile); } catch (e) {}
        return res.status(504).json({ success: false, error: 'Tiempo de espera agotado al consultar Worker para Higgsfield' });
    } catch (err) {
        console.error('[HIGGSFIELD API] Error delegando consulta al Worker:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/higgsfield/ingest', async (req, res) => {
    try {
        const {
            executor = 'local',
            items,
            project,
            user,
            ...singleItem
        } = req.body;

        const itemList = Array.isArray(items) && items.length > 0 ? items : [singleItem];

        if (executor === 'worker') {
            const orderId = `hf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const priority = Math.min(100, Math.max(1, Number(req.body.priority) || 80));
            const orderData = {
                id: orderId,
                type: 'higgsfield_ingest',
                project: project || 'STUDIO',
                user: user || (os.userInfo ? os.userInfo().username : 'unknown'),
                createdAt: new Date().toISOString(),
                status: 'pending',
                priority,
                items: itemList
            };

            saveOrderInCandidateDirs(orderId, orderData);
            console.log(`[HIGGSFIELD WORKER] Orden de ingesta encolada para Worker: ${orderId} (${itemList.length} items) [Prioridad: ${priority}]`);
            ensureSyncWorkerRunning();
            return res.json({ success: true, executor: 'worker', orderId, count: itemList.length, status: 'pending', priority });
        }

        console.log(`[HIGGSFIELD LOCAL] Procesando ingesta local de ${itemList.length} items...`);
        const results = [];
        for (const item of itemList) {
            const resIngest = await higgsfieldApi.processHiggsfieldIngest({
                ...item,
                userName: user || (os.userInfo ? os.userInfo().username : 'Pipeta')
            });
            results.push(resIngest);
        }
        const firstTarget = (results.length > 0 && results[0].targetFile) ? results[0].targetFile : null;
        return res.json({
            success: true,
            executor: 'local',
            results,
            targetFile: firstTarget,
            count: results.length
        });
    } catch (err) {
        console.error('[HIGGSFIELD INGEST] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- CUSTOM IA TOKENS ---
router.get('/api/ia/custom-tokens', (req, res) => {
    try {
        if (fs.existsSync(CUSTOM_TOKENS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CUSTOM_TOKENS_FILE, 'utf8'));
            return res.json(data);
        }
        res.json({ motors: [], resolutions: [], framings: [], tagsA: [], tagsB: [], tagsC: [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/ia/save-custom-tokens', (req, res) => {
    try {
        const { motors, resolutions, framings, tagsA, tagsB, tagsC } = req.body;
        let existing = { motors: [], resolutions: [], framings: [], tagsA: [], tagsB: [], tagsC: [] };
        if (fs.existsSync(CUSTOM_TOKENS_FILE)) {
            try { existing = JSON.parse(fs.readFileSync(CUSTOM_TOKENS_FILE, 'utf8')); } catch (err) {}
        }

        const mergeArrays = (arr1 = [], arr2 = []) => Array.from(new Set([...arr1, ...arr2])).filter(Boolean);

        const updated = {
            motors: mergeArrays(existing.motors, motors),
            resolutions: mergeArrays(existing.resolutions, resolutions),
            framings: mergeArrays(existing.framings, framings),
            tagsA: mergeArrays(existing.tagsA, tagsA),
            tagsB: mergeArrays(existing.tagsB, tagsB),
            tagsC: mergeArrays(existing.tagsC, tagsC)
        };

        const presetsDir = path.join(APP_ROOT, 'presets');
        if (!fs.existsSync(presetsDir)) fs.mkdirSync(presetsDir, { recursive: true });

        fs.writeFileSync(CUSTOM_TOKENS_FILE, JSON.stringify(updated, null, 2), 'utf8');

        // Mirror only to channel's own network presets (never Main Pipeta when running Beta!)
        const zPresetsDir = path.join(NETWORK_APP_DIR, 'presets');
        if (fs.existsSync(zPresetsDir) && path.resolve(zPresetsDir).toLowerCase() !== path.resolve(presetsDir).toLowerCase()) {
            try { fs.writeFileSync(path.join(zPresetsDir, 'ia_custom_tokens.json'), JSON.stringify(updated, null, 2), 'utf8'); } catch (e) {}
        }

        res.json({ success: true, tokens: updated });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- CHROME & EDGE DOWNLOAD WATCHER ---
let downloadWatcherActive = false;
let watchedDownloads = [];
const lastKnownFiles = new Set();
let activeWatchFolder = '';
let watcherInterval = null;

const userHome = process.env.USERPROFILE || 'C:\\Users\\' + (process.env.USERNAME || 'Default');
const defaultIaDownloadsFolder = path.join(userHome, 'Downloads', 'IA');
const fallbackChromeDownloadsFolder = path.join(userHome, 'Downloads');

function getBrowserPreferenceFiles() {
    const localAppData = process.env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local');
    const prefFiles = [];
    ['Google/Chrome/User Data', 'Microsoft/Edge/User Data'].forEach(bRel => {
        const bDir = path.join(localAppData, bRel);
        if (fs.existsSync(bDir)) {
            try {
                fs.readdirSync(bDir).forEach(d => {
                    const pFile = path.join(bDir, d, 'Preferences');
                    if (fs.existsSync(pFile)) prefFiles.push(pFile);
                });
            } catch (e) {}
        }
    });
    return prefFiles;
}

function autoDetectChromeDownloadFolder() {
    const prefFiles = getBrowserPreferenceFiles();
    for (const pFile of prefFiles) {
        try {
            const content = JSON.parse(fs.readFileSync(pFile, 'utf8'));
            if (content.download && content.download.default_directory) {
                const dir = content.download.default_directory;
                if (fs.existsSync(dir)) return dir;
            }
        } catch (e) {}
    }

    if (!fs.existsSync(defaultIaDownloadsFolder)) {
        try { fs.mkdirSync(defaultIaDownloadsFolder, { recursive: true }); } catch (e) {}
    }
    return fs.existsSync(defaultIaDownloadsFolder) ? defaultIaDownloadsFolder : fallbackChromeDownloadsFolder;
}

function scanChromeDownloadsFolder() {
    const targetFolders = [defaultIaDownloadsFolder, fallbackChromeDownloadsFolder];
    if (activeWatchFolder && !targetFolders.includes(activeWatchFolder)) {
        targetFolders.push(activeWatchFolder);
    }

    targetFolders.forEach(folder => {
        if (!fs.existsSync(folder)) return;
        try {
            const files = fs.readdirSync(folder);
            files.forEach(fileName => {
                if (fileName.endsWith('.crdownload') || fileName.endsWith('.tmp')) return;
                const ext = path.extname(fileName).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.mp4', '.webp', '.mov'].includes(ext)) {
                    const fullPath = path.join(folder, fileName);
                    if (!lastKnownFiles.has(fullPath)) {
                        lastKnownFiles.add(fullPath);
                        const stats = fs.statSync(fullPath);
                        watchedDownloads.push({
                            name: fileName,
                            path: fullPath,
                            ext,
                            mtime: stats.mtimeMs
                        });
                        console.log(`[DOWNLOAD WATCHER] New download captured from ${folder}: ${fullPath}`);
                    }
                }
            });
        } catch (e) {
            console.error('Download watcher scan error:', e);
        }
    });
}

router.get('/api/ia/start-download-watcher', (req, res) => {
    activeWatchFolder = autoDetectChromeDownloadFolder();

    lastKnownFiles.clear();
    [defaultIaDownloadsFolder, fallbackChromeDownloadsFolder, activeWatchFolder].forEach(folder => {
        if (folder && fs.existsSync(folder)) {
            try {
                fs.readdirSync(folder).forEach(f => {
                    lastKnownFiles.add(path.join(folder, f));
                });
            } catch (e) {}
        }
    });

    downloadWatcherActive = true;
    if (!watcherInterval) {
        watcherInterval = setInterval(scanChromeDownloadsFolder, 1500);
    }
    res.json({ success: true, active: true, folder: activeWatchFolder });
});

router.get('/api/ia/stop-download-watcher', (req, res) => {
    downloadWatcherActive = false;
    if (watcherInterval) {
        clearInterval(watcherInterval);
        watcherInterval = null;
    }
    res.json({ success: true, active: false });
});

router.get('/api/ia/watcher-poll', (req, res) => {
    const pending = [...watchedDownloads];
    watchedDownloads = [];
    res.json({ active: downloadWatcherActive, files: pending, folder: activeWatchFolder });
});

router.get('/api/ia/open-chrome-settings', (req, res) => {
    try {
        exec(`powershell -Command "Start-Process 'chrome.exe' 'chrome://settings/downloads'"`);
        res.json({ success: true, opened: 'chrome://settings/downloads' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/ia/file-preview', (req, res) => {
    const filePath = (req.query.path || '').trim();
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    res.sendFile(path.resolve(filePath));
});

module.exports = router;
