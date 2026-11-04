const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const catalogGenerator = require('../sync_catalog_generator');
const { getReadSyncCacheCandidateDirs } = require('../core/sync-paths');

const router = express.Router();

// --- MIRROR REPAIR BATCH ---
router.post('/api/mirror/repairBatch', async (req, res) => {
    const { items, mode = 'both', mediaSubfolders, workSubfolders, checkSubfolders = false } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Missing items array' });

    let repairedCount = 0;
    const targetMediaSubfolders = (Array.isArray(mediaSubfolders) && mediaSubfolders.length > 0)
        ? mediaSubfolders
        : ['IA/enc', 'IA/export', 'IA/ref', 'nuke/exportIA', 'nuke/fullres', 'nuke/prerender', 'in'];

    const targetWorkSubfolders = (Array.isArray(workSubfolders) && workSubfolders.length > 0)
        ? workSubfolders
        : ['compo'];

    try {
        for (const item of items) {
            const shouldFixMedia = (mode === 'media' || mode === 'both') && (item.status === 'missing-media' || (checkSubfolders && item.missingMediaFolders && item.missingMediaFolders.length > 0));
            const shouldFixWork = (mode === 'work' || mode === 'both') && (item.status === 'missing-work' || (checkSubfolders && item.missingWorkFolders && item.missingWorkFolders.length > 0));

            if (shouldFixMedia && item.mediaPath) {
                await fs.ensureDir(item.mediaPath);
                if (checkSubfolders && Array.isArray(targetMediaSubfolders)) {
                    for (const sub of targetMediaSubfolders) {
                        await fs.ensureDir(path.join(item.mediaPath, sub));
                    }
                }
                repairedCount++;
            }

            if (shouldFixWork && item.workPath) {
                await fs.ensureDir(item.workPath);
                if (checkSubfolders && Array.isArray(targetWorkSubfolders)) {
                    for (const sub of targetWorkSubfolders) {
                        await fs.ensureDir(path.join(item.workPath, sub));
                    }
                }
                repairedCount++;
            }
        }

        res.json({ success: true, repairedCount });
    } catch (err) {
        console.error('[MIRROR] Repair error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- FAST FILE AUDIT SCAN (MIRROR & RENDERS) ---
router.post('/api/audit/scan', async (req, res) => {
    const { auditType, roots, targetEpisodes = [], config = {}, projectName: reqProjName } = req.body;
    if (!roots || !roots.work || !roots.media) {
        return res.status(400).json({ error: 'Missing roots configuration' });
    }

    const normWork = roots.work.replace(/\\/g, '/').replace(/\/+$/, '');
    const normMedia = roots.media.replace(/\\/g, '/').replace(/\/+$/, '');
    const workEpRoot = normWork + '/episodios';

    function extractVersion(str) {
        const match = str.match(/_?v(\d{2,4})/i);
        return match ? { str: 'v' + match[1], num: parseInt(match[1], 10) } : null;
    }

    let driveManifest = null;
    const driveEpisodeCache = new Map();

    if (config.compareDrive) {
        try {
            let pName = reqProjName || config.projectName;
            if (!pName && typeof catalogGenerator.findProjectManifestForPath === 'function') {
                const pInfo = catalogGenerator.findProjectManifestForPath(normWork, 'drive');
                if (pInfo) pName = pInfo.projectName;
            }
            if (!pName) {
                const pCandidates = [path.basename(normWork), path.basename(path.dirname(normWork))];
                for (const pc of pCandidates) {
                    if (typeof catalogGenerator.getModularManifest === 'function' && catalogGenerator.getModularManifest(pc, 'drive')) {
                        pName = pc;
                        break;
                    }
                }
            }
            if (pName && typeof catalogGenerator.getModularManifest === 'function') {
                driveManifest = catalogGenerator.getModularManifest(pName, 'drive');
            }
        } catch (e) {
            console.warn('[AUDIT] Error loading Drive manifest:', e.message);
        }
    }

    function getDriveSubCatalog(epName, category) {
        if (!driveManifest) return null;
        const cacheKey = `${epName}_${category}`.toLowerCase();
        if (driveEpisodeCache.has(cacheKey)) return driveEpisodeCache.get(cacheKey);

        const pName = driveManifest.project || reqProjName || config.projectName;
        const subFile = category === 'work' ? `episodios/${epName}.json` : `media/${epName}.json`;
        const candidatePaths = [
            ...getReadSyncCacheCandidateDirs().map(d => path.join(d, 'projects', pName, 'drive', subFile)),
            path.join('Z:/_SYNC_CACHE/projects', pName, 'drive', subFile),
            path.join(process.env.TEMP || 'C:/Temp', '_SYNC_CACHE/projects', pName, 'drive', subFile)
        ];
        let loaded = null;
        for (const cp of candidatePaths) {
            try {
                if (fs.existsSync(cp)) {
                    loaded = fs.readJsonSync(cp);
                    break;
                }
            } catch (e) {}
        }
        driveEpisodeCache.set(cacheKey, loaded);
        return loaded;
    }

    try {
        if (auditType === 'mirror') {
            const expectedMediaFolders = config.expectedMedia || [];
            const expectedWorkFolders = config.expectedWork || [];

            const workShotsMap = new Map();
            if (await fs.pathExists(workEpRoot)) {
                const epItems = await fs.readdir(workEpRoot);
                for (const ep of epItems) {
                    if (targetEpisodes.length > 0 && !targetEpisodes.includes(ep)) continue;
                    const epPath = path.join(workEpRoot, ep);
                    try {
                        if (!(await fs.stat(epPath)).isDirectory()) continue;
                    } catch (e) { continue; }

                    const seqRoot = path.join(epPath, 'secuencias');
                    if (!(await fs.pathExists(seqRoot))) continue;
                    const seqItems = await fs.readdir(seqRoot);

                    for (const seq of seqItems) {
                        const seqPath = path.join(seqRoot, seq);
                        try {
                            if (!(await fs.stat(seqPath)).isDirectory()) continue;
                        } catch (e) { continue; }

                        const shotsRoot = path.join(seqPath, 'shots');
                        if (!(await fs.pathExists(shotsRoot))) continue;
                        const shotItems = await fs.readdir(shotsRoot);

                        for (const shot of shotItems) {
                            const shotPath = path.join(shotsRoot, shot);
                            try {
                                if (!(await fs.stat(shotPath)).isDirectory()) continue;
                            } catch (e) { continue; }

                            const key = `${ep}/${seq}/${shot}`.toLowerCase();
                            workShotsMap.set(key, { ep, seq, shot, path: shotPath.replace(/\\/g, '/') });
                        }
                    }
                }
            }

            const mediaShotsMap = new Map();
            if (await fs.pathExists(normMedia)) {
                const mediaEpItems = await fs.readdir(normMedia);
                for (const ep of mediaEpItems) {
                    if (targetEpisodes.length > 0 && !targetEpisodes.includes(ep)) continue;
                    const epPath = path.join(normMedia, ep);
                    try {
                        if (!(await fs.stat(epPath)).isDirectory()) continue;
                    } catch (e) { continue; }

                    const seqItems = await fs.readdir(epPath);
                    for (const seq of seqItems) {
                        const seqPath = path.join(epPath, seq);
                        try {
                            if (!(await fs.stat(seqPath)).isDirectory()) continue;
                        } catch (e) { continue; }

                        const shotItems = await fs.readdir(seqPath);
                        for (const shot of shotItems) {
                            const shotPath = path.join(seqPath, shot);
                            try {
                                if (!(await fs.stat(shotPath)).isDirectory()) continue;
                            } catch (e) { continue; }

                            const key = `${ep}/${seq}/${shot}`.toLowerCase();
                            mediaShotsMap.set(key, { ep, seq, shot, path: shotPath.replace(/\\/g, '/') });
                        }
                    }
                }
            }

            const allKeys = Array.from(new Set([...workShotsMap.keys(), ...mediaShotsMap.keys()]));
            const results = [];

            for (const key of allKeys) {
                const inWork = workShotsMap.has(key);
                const inMedia = mediaShotsMap.has(key);
                const wData = workShotsMap.get(key);
                const mData = mediaShotsMap.get(key);

                const ep = wData?.ep || mData?.ep;
                const seq = wData?.seq || mData?.seq;
                const shot = wData?.shot || mData?.shot;

                const expectedWorkPath = `${normWork}/episodios/${ep}/secuencias/${seq}/shots/${shot}`;
                const expectedMediaPath = `${normMedia}/${ep}/${seq}/${shot}`;

                const record = {
                    key,
                    ep,
                    seq,
                    shot,
                    workPath: inWork ? wData.path : expectedWorkPath,
                    mediaPath: inMedia ? mData.path : expectedMediaPath,
                    existsInWork: inWork,
                    existsInMedia: inMedia,
                    missingMediaFolders: [],
                    missingWorkFolders: [],
                    status: 'ok',
                    selected: false,
                    driveDiff: null
                };

                if (!inMedia) {
                    record.status = 'missing-media';
                    record.missingMediaFolders = expectedMediaFolders;
                } else if (!inWork) {
                    record.status = 'missing-work';
                    record.missingWorkFolders = expectedWorkFolders;
                } else {
                    const mSubNames = [];
                    const wSubNames = [];
                    try {
                        const mFiles = await fs.readdir(record.mediaPath);
                        for (const f of mFiles) {
                            if ((await fs.stat(path.join(record.mediaPath, f))).isDirectory()) mSubNames.push(f.toLowerCase());
                        }
                    } catch (e) {}
                    try {
                        const wFiles = await fs.readdir(record.workPath);
                        for (const f of wFiles) {
                            if ((await fs.stat(path.join(record.workPath, f))).isDirectory()) wSubNames.push(f.toLowerCase());
                        }
                    } catch (e) {}

                    const missingM = expectedMediaFolders.filter(f => !mSubNames.includes(f.toLowerCase()) && !mSubNames.includes(f.split('/')[0].toLowerCase()));
                    const missingW = expectedWorkFolders.filter(f => !wSubNames.includes(f.toLowerCase()));

                    record.missingMediaFolders = missingM;
                    record.missingWorkFolders = missingW;

                    if (missingM.length > 0 || missingW.length > 0) {
                        record.status = 'incomplete';
                    }
                }

                if (config.compareDrive && driveManifest) {
                    const shotLow = shot.toLowerCase();
                    const workCat = getDriveSubCatalog(ep, 'work');
                    const mediaCat = getDriveSubCatalog(ep, 'media');

                    const driveHasWork = workCat && Array.isArray(workCat.flatList)
                        ? workCat.flatList.some(it => (it.relPath || it.path || '').toLowerCase().includes(`/${shotLow}`))
                        : false;
                    const driveHasMedia = mediaCat && Array.isArray(mediaCat.flatList)
                        ? mediaCat.flatList.some(it => (it.relPath || it.path || '').toLowerCase().includes(`/${shotLow}`))
                        : false;

                    record.driveDiff = {
                        driveHasWork,
                        driveHasMedia,
                        missingOnDriveWork: inWork && !driveHasWork,
                        missingOnDriveMedia: inMedia && !driveHasMedia,
                        newerOnDriveWork: !inWork && driveHasWork,
                        newerOnDriveMedia: !inMedia && driveHasMedia
                    };
                }

                results.push(record);
            }

            results.sort((a, b) => a.key.localeCompare(b.key));
            return res.json({ success: true, results, hasDriveCatalog: !!driveManifest });
        }

        // Render / Scenes Audit
        const targetProc = config.process || 'compo';
        const allowedExts = config.allowedExtensions || ['.nk', '.hip', '.blend', '.ma', '.mb', '.aep', '.prproj', '.c4d'];
        const processes = config.processes || ['compo'];
        const procExtMap = config.procExtMap || { compo: '.nk' };

        const results = [];
        if (await fs.pathExists(workEpRoot)) {
            const epItems = await fs.readdir(workEpRoot);
            for (const ep of epItems) {
                if (targetEpisodes.length > 0 && !targetEpisodes.includes(ep)) continue;
                const epPath = path.join(workEpRoot, ep);
                try {
                    if (!(await fs.stat(epPath)).isDirectory()) continue;
                } catch (e) { continue; }

                const seqRoot = path.join(epPath, 'secuencias');
                if (!(await fs.pathExists(seqRoot))) continue;
                const seqItems = await fs.readdir(seqRoot);

                for (const seq of seqItems) {
                    const seqPath = path.join(seqRoot, seq);
                    try {
                        if (!(await fs.stat(seqPath)).isDirectory()) continue;
                    } catch (e) { continue; }

                    const shotsRoot = path.join(seqPath, 'shots');
                    if (!(await fs.pathExists(shotsRoot))) continue;
                    const shotItems = await fs.readdir(shotsRoot);

                    for (const shot of shotItems) {
                        const shotPath = path.join(shotsRoot, shot);
                        try {
                            if (!(await fs.stat(shotPath)).isDirectory()) continue;
                        } catch (e) { continue; }

                        const shotWorkPath = shotPath.replace(/\\/g, '/');
                        const shotMediaPath = `${normMedia}/${ep}/${seq}/${shot}`;
                        const procList = (targetProc === 'all') ? processes : [targetProc];

                        for (const procName of procList) {
                            const procWorkPath = `${shotWorkPath}/${procName}`;
                            let rawFiles = [];
                            try {
                                if (await fs.pathExists(procWorkPath)) {
                                    rawFiles = await fs.readdir(procWorkPath);
                                }
                            } catch (e) {}

                            const scriptFiles = [];
                            for (const rf of rawFiles) {
                                const rfLower = rf.toLowerCase();
                                if (rfLower.endsWith('.txt') || rfLower.endsWith('.json') || rfLower.endsWith('.bak') || rfLower.endsWith('.tmp') || rfLower.endsWith('.log') || rfLower.endsWith('~')) continue;
                                const ext = '.' + rfLower.split('.').pop();
                                if (allowedExts.includes(ext)) {
                                    scriptFiles.push(rf);
                                }
                            }

                            const scriptVersions = [];
                            const badScriptFiles = [];
                            for (const sf of scriptFiles) {
                                const vInfo = extractVersion(sf);
                                const sfLower = sf.toLowerCase();
                                const hasShot = sfLower.includes(shot.toLowerCase());
                                if (!hasShot || !vInfo) {
                                    badScriptFiles.push(sf);
                                }
                                if (vInfo) {
                                    scriptVersions.push({ name: sf, ...vInfo });
                                }
                            }
                            scriptVersions.sort((a, b) => b.num - a.num);
                            const latestScript = scriptVersions[0] || null;

                            const foundRenders = [];
                            if (await fs.pathExists(shotMediaPath)) {
                                try {
                                    const IGNORE_MEDIA_DIRS = new Set(['in', 'ingest', 'plates', 'plate', 'ref', 'reference', 'audio', 'sound', 'lut', 'luts', 'offline', 'source', 'sources', 'thumb', 'thumbnails', 'cache']);
                                    const candidateRoots = [];
                                    const topEntries = await fs.readdir(shotMediaPath);

                                    for (const entry of topEntries) {
                                        if (entry.startsWith('.')) continue;
                                        const entryLower = entry.toLowerCase();
                                        if (IGNORE_MEDIA_DIRS.has(entryLower)) continue;

                                        const entryPath = path.join(shotMediaPath, entry);
                                        let entryStat;
                                        try {
                                            entryStat = await fs.stat(entryPath);
                                        } catch (e) { continue; }

                                        if (!entryStat.isDirectory()) {
                                            candidateRoots.push({ path: shotMediaPath, subCategory: '', isDirectFile: true, fileName: entry });
                                            continue;
                                        }

                                        let subEntries = [];
                                        try {
                                            subEntries = await fs.readdir(entryPath);
                                        } catch (e) {}

                                        const hasKnownRenderSubs = subEntries.some(s => {
                                            const sl = s.toLowerCase();
                                            return sl.includes('fullres') || sl.includes('prerender') || sl.includes('mov') || sl.includes('compres') || sl.includes('exportia');
                                        });

                                        const isToolOrProc = hasKnownRenderSubs || ['nuke', 'compo', 'comp', 'flame', 'ae', 'maya', 'blender', '3d'].includes(entryLower) || entryLower === procName.toLowerCase();

                                        if (isToolOrProc) {
                                            for (const sub of subEntries) {
                                                if (sub.startsWith('.')) continue;
                                                const subLower = sub.toLowerCase();
                                                if (IGNORE_MEDIA_DIRS.has(subLower)) continue;
                                                const subPath = path.join(entryPath, sub);
                                                try {
                                                    const subStat = await fs.stat(subPath);
                                                    if (subStat.isDirectory()) {
                                                        candidateRoots.push({ path: subPath, subCategory: subLower, tool: entryLower });
                                                    } else {
                                                        candidateRoots.push({ path: entryPath, subCategory: entryLower, isDirectFile: true, fileName: sub });
                                                    }
                                                } catch (e) {}
                                            }
                                        } else {
                                            candidateRoots.push({ path: entryPath, subCategory: entryLower, tool: 'direct' });
                                        }
                                    }

                                    for (const cRoot of candidateRoots) {
                                        if (cRoot.isDirectFile) {
                                            const vFile = extractVersion(cRoot.fileName);
                                            if (vFile) {
                                                const fLower = cRoot.fileName.toLowerCase();
                                                const isMov = fLower.endsWith('.mov') || fLower.endsWith('.mp4');
                                                const isTcl = cRoot.subCategory.includes('prerender') || fLower.includes('prerender');
                                                const badFiles = [];
                                                if (!isTcl) {
                                                    const hasShot = fLower.includes(shot.toLowerCase());
                                                    const hasVer = fLower.includes(vFile.str.toLowerCase());
                                                    if (!hasShot || !hasVer) badFiles.push(cRoot.fileName);
                                                }
                                                foundRenders.push({
                                                    type: isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres'),
                                                    folderName: cRoot.subCategory,
                                                    versionStr: vFile.str,
                                                    versionNum: vFile.num,
                                                    path: path.join(cRoot.path, cRoot.fileName).replace(/\\/g, '/'),
                                                    frameCount: 1,
                                                    hasBadNaming: badFiles.length > 0,
                                                    badFiles,
                                                    sequenceIntegrity: null
                                                });
                                            }
                                            continue;
                                        }

                                        const deepItems = await fs.readdir(cRoot.path);
                                        for (const deepItem of deepItems) {
                                            if (deepItem.startsWith('.')) continue;
                                            const deepPath = path.join(cRoot.path, deepItem);
                                            let deepStat;
                                            try {
                                                deepStat = await fs.stat(deepPath);
                                            } catch (e) { continue; }

                                            const deepLower = deepItem.toLowerCase();
                                            const vFolder = extractVersion(deepItem);

                                            if (deepStat.isDirectory() && vFolder) {
                                                let frameFiles = (await fs.readdir(deepPath)).filter(f => !f.startsWith('.'));
                                                const isMov = cRoot.subCategory.includes('mov') || deepLower.includes('mov') || deepLower.includes('compres') || deepLower.includes('mp4');
                                                const isTcl = cRoot.subCategory.includes('prerender') || deepLower.includes('prerender');
                                                const rType = isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres');

                                                let inspectedPath = deepPath;
                                                const resCandidate = frameFiles.find(f => /^\d{3,5}x\d{3,5}$/i.test(f));
                                                if (resCandidate) {
                                                    try {
                                                        const subResPath = path.join(deepPath, resCandidate);
                                                        const subStat = await fs.stat(subResPath);
                                                        if (subStat.isDirectory()) {
                                                            const subFrames = (await fs.readdir(subResPath)).filter(f => !f.startsWith('.'));
                                                            if (subFrames.length > 0) {
                                                                frameFiles = subFrames;
                                                                inspectedPath = subResPath;
                                                            }
                                                        }
                                                    } catch (e) {}
                                                }

                                                const actualFrames = frameFiles.filter(f => {
                                                    if (/^\d{3,5}x\d{3,5}$/i.test(f)) return false;
                                                    if (f.toLowerCase() === 'thumbs.db' || f.startsWith('.')) return false;
                                                    return true;
                                                });

                                                if (actualFrames.length === 0) continue;

                                                const MEDIA_EXTS = new Set(['.exr', '.dpx', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.mov', '.mp4']);
                                                const hasValidMedia = actualFrames.some(f => MEDIA_EXTS.has(path.extname(f).toLowerCase()));
                                                if (!hasValidMedia) continue;

                                                const badFiles = [];
                                                if (!isTcl && actualFrames.length > 0) {
                                                    for (const ff of actualFrames) {
                                                        if (/^\d{3,5}x\d{3,5}$/i.test(ff)) continue;
                                                        const ffLower = ff.toLowerCase();
                                                        const hasShot = ffLower.includes(shot.toLowerCase());
                                                        const hasVer = ffLower.includes(vFolder.str.toLowerCase());
                                                        if (!hasShot || !hasVer) badFiles.push(ff);
                                                    }
                                                }

                                                let sequenceIntegrity = null;
                                                if (!isMov && actualFrames.length > 0) {
                                                    const frameNumbers = [];
                                                    let zeroByteCount = 0;
                                                    for (const ff of actualFrames) {
                                                        if (config.deepCompare) {
                                                            try {
                                                                const fStat = await fs.stat(path.join(inspectedPath, ff));
                                                                if (fStat.size === 0) zeroByteCount++;
                                                            } catch (e) {}
                                                        }
                                                        const m = ff.match(/[._-](\d{3,8})\./);
                                                        if (m) {
                                                            frameNumbers.push(parseInt(m[1], 10));
                                                        }
                                                    }
                                                    if (frameNumbers.length > 0) {
                                                        frameNumbers.sort((a, b) => a - b);
                                                        const minFrame = frameNumbers[0];
                                                        const maxFrame = frameNumbers[frameNumbers.length - 1];
                                                        const expectedCount = (maxFrame - minFrame + 1);
                                                        const numSet = new Set(frameNumbers);
                                                        const missingFrames = [];
                                                        if (config.deepCompare && frameNumbers.length < expectedCount) {
                                                            for (let f = minFrame; f <= maxFrame; f++) {
                                                                if (!numSet.has(f)) {
                                                                    missingFrames.push(f);
                                                                    if (missingFrames.length >= 50) break;
                                                                }
                                                            }
                                                        }
                                                        const isComplete = (frameNumbers.length === expectedCount) && (zeroByteCount === 0);
                                                        sequenceIntegrity = {
                                                            isComplete,
                                                            minFrame,
                                                            maxFrame,
                                                            expectedCount,
                                                            actualCount: actualFrames.length,
                                                            missingCount: Math.max(0, expectedCount - frameNumbers.length),
                                                            missingFrames,
                                                            zeroByteCount
                                                        };
                                                    }
                                                }

                                                const tmpFiles = actualFrames.filter(f => {
                                                    const fl = f.toLowerCase();
                                                    return fl.endsWith('.tmp') || fl.endsWith('.part') || fl.endsWith('.crdownload');
                                                });
                                                const hasOnlyTmpBadFiles = (badFiles.length > 0 && badFiles.every(f => {
                                                    const fl = f.toLowerCase();
                                                    return fl.endsWith('.tmp') || fl.endsWith('.part') || fl.endsWith('.crdownload');
                                                }));

                                                foundRenders.push({
                                                    type: rType,
                                                    folderName: deepItem,
                                                    versionStr: vFolder.str,
                                                    versionNum: vFolder.num,
                                                    path: inspectedPath.replace(/\\/g, '/'),
                                                    frameCount: actualFrames.length,
                                                    hasBadNaming: badFiles.length > 0,
                                                    badFiles,
                                                    tmpFiles,
                                                    hasTmpFiles: tmpFiles.length > 0,
                                                    hasOnlyTmpBadFiles,
                                                    sequenceIntegrity
                                                });
                                            } else if (!deepStat.isDirectory()) {
                                                const vFile = extractVersion(deepItem);
                                                if (vFile) {
                                                    const isMov = deepLower.endsWith('.mov') || deepLower.endsWith('.mp4');
                                                    const isTcl = cRoot.subCategory.includes('prerender') || deepLower.includes('prerender');
                                                    const badFiles = [];
                                                    if (!isTcl) {
                                                        const hasShot = deepLower.includes(shot.toLowerCase());
                                                        const hasVer = deepLower.includes(vFile.str.toLowerCase());
                                                        if (!hasShot || !hasVer) badFiles.push(deepItem);
                                                    }
                                                    foundRenders.push({
                                                        type: isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres'),
                                                        folderName: cRoot.subCategory,
                                                        versionStr: vFile.str,
                                                        versionNum: vFile.num,
                                                        path: deepPath.replace(/\\/g, '/'),
                                                        frameCount: 1,
                                                        hasBadNaming: badFiles.length > 0,
                                                        badFiles,
                                                        sequenceIntegrity: null
                                                    });
                                                }
                                            }
                                        }
                                    }
                                } catch (e) {}
                            }
                            foundRenders.sort((a, b) => b.versionNum - a.versionNum);

                            let canonicalMediaPath = shotMediaPath;
                            const fullresCandidates = [
                                path.join(shotMediaPath, 'nuke', 'fullres'),
                                path.join(shotMediaPath, procName, 'fullres'),
                                path.join(shotMediaPath, 'nuke'),
                                path.join(shotMediaPath, procName)
                            ];
                            for (const cand of fullresCandidates) {
                                if (await fs.pathExists(cand)) {
                                    canonicalMediaPath = cand;
                                    break;
                                }
                            }

                            const shotRecord = {
                                key: `${ep}/${seq}/${shot}/${procName}`,
                                ep,
                                seq,
                                shot,
                                process: procName,
                                expectedExt: procExtMap[procName] || '.nk',
                                scriptCount: scriptFiles.length,
                                scriptFiles,
                                badScriptFiles,
                                latestScriptVer: latestScript ? latestScript.str : null,
                                latestScriptNum: latestScript ? latestScript.num : null,
                                latestScriptName: latestScript ? latestScript.name : null,
                                scriptPath: procWorkPath,
                                mediaPath: canonicalMediaPath.replace(/\\/g, '/'),
                                renders: [],
                                badFiles: [],
                                sceneStatus: 'no-script',
                                renderStatus: 'no-script',
                                tmpFiles: [],
                                hasTmpFiles: false,
                                hasOnlyTmpBadFiles: false,
                                sequenceIssue: null,
                                driveDiff: null
                            };

                            if (scriptFiles.length === 0) {
                                shotRecord.sceneStatus = 'no-script';
                            } else if (badScriptFiles.length > 0) {
                                shotRecord.sceneStatus = 'bad-naming';
                            } else {
                                shotRecord.sceneStatus = 'has-scene';
                            }

                            const targetRenders = foundRenders.filter(r => {
                                if (r.type === 'fullres') return config.onlyFullRes !== false;
                                if (r.type === 'mov') return !!config.includeMov;
                                if (r.type === 'tcl') return !!config.checkTclExt;
                                return true;
                            });

                            targetRenders.sort((a, b) => {
                                if (b.versionNum !== a.versionNum) return b.versionNum - a.versionNum;
                                const typeOrder = { fullres: 1, mov: 2, tcl: 3 };
                                return (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9);
                            });

                            shotRecord.renders = targetRenders;

                            const matchingRender = targetRenders.find(r => latestScript && r.versionNum === latestScript.num);
                            const highestRender = targetRenders[0] || null;

                            if (matchingRender && matchingRender.sequenceIntegrity && !matchingRender.sequenceIntegrity.isComplete) {
                                shotRecord.sequenceIssue = matchingRender.sequenceIntegrity;
                            } else if (highestRender && highestRender.sequenceIntegrity && !highestRender.sequenceIntegrity.isComplete) {
                                shotRecord.sequenceIssue = highestRender.sequenceIntegrity;
                            }

                            if (!latestScript) {
                                shotRecord.renderStatus = highestRender ? 'orphan-render' : 'empty';
                            } else if (highestRender && highestRender.versionNum > latestScript.num) {
                                shotRecord.renderStatus = 'orphan-render';
                            } else if (matchingRender) {
                                shotRecord.tmpFiles = matchingRender.tmpFiles || [];
                                shotRecord.hasTmpFiles = !!matchingRender.hasTmpFiles;
                                shotRecord.hasOnlyTmpBadFiles = !!matchingRender.hasOnlyTmpBadFiles;
                                if (matchingRender.hasBadNaming) {
                                    shotRecord.renderStatus = 'bad-naming';
                                    shotRecord.badFiles = matchingRender.badFiles;
                                } else {
                                    shotRecord.renderStatus = 'up-to-date';
                                }
                            } else if (highestRender && highestRender.versionNum < latestScript.num) {
                                shotRecord.tmpFiles = highestRender.tmpFiles || [];
                                shotRecord.hasTmpFiles = !!highestRender.hasTmpFiles;
                                shotRecord.hasOnlyTmpBadFiles = !!highestRender.hasOnlyTmpBadFiles;
                                if (highestRender.hasBadNaming) {
                                    shotRecord.renderStatus = 'bad-naming';
                                    shotRecord.badFiles = highestRender.badFiles;
                                } else {
                                    shotRecord.renderStatus = 'outdated';
                                }
                            } else if (config.omitV001 && latestScript.num <= 1) {
                                shotRecord.renderStatus = 'empty';
                            } else {
                                shotRecord.renderStatus = 'missing-render';
                            }

                            if (config.compareDrive && driveManifest) {
                                const shotLow = shot.toLowerCase();
                                const procLow = procName.toLowerCase();

                                const workCat = getDriveSubCatalog(ep, 'work');
                                let driveLatestScriptNum = null;
                                let driveLatestScriptVer = null;
                                let driveLatestScriptName = null;
                                if (workCat && Array.isArray(workCat.flatList)) {
                                    for (const it of workCat.flatList) {
                                        if (it.isDir || it.isDirectory) continue;
                                        const p = (it.relPath || it.path || '').toLowerCase();
                                        if (p.includes(`/${shotLow}/`) && (p.includes(`/${procLow}/`) || p.includes(`/${procLow}`))) {
                                            const ext = '.' + it.name.toLowerCase().split('.').pop();
                                            if (allowedExts.includes(ext)) {
                                                const vInfo = extractVersion(it.name);
                                                if (vInfo && (driveLatestScriptNum === null || vInfo.num > driveLatestScriptNum)) {
                                                    driveLatestScriptNum = vInfo.num;
                                                    driveLatestScriptVer = vInfo.str;
                                                    driveLatestScriptName = it.name;
                                                }
                                            }
                                        }
                                    }
                                }

                                const mediaCat = getDriveSubCatalog(ep, 'media');
                                let driveLatestRenderNum = null;
                                let driveLatestRenderVer = null;
                                let driveLatestRenderName = null;
                                if (mediaCat && Array.isArray(mediaCat.flatList)) {
                                    for (const it of mediaCat.flatList) {
                                        const p = (it.relPath || it.path || '').toLowerCase();
                                        if (p.includes(`/${shotLow}/`)) {
                                            const vInfo = extractVersion(it.name);
                                            if (vInfo && (driveLatestRenderNum === null || vInfo.num > driveLatestRenderNum)) {
                                                driveLatestRenderNum = vInfo.num;
                                                driveLatestRenderVer = vInfo.str;
                                                driveLatestRenderName = it.name;
                                            }
                                        }
                                    }
                                }

                                const localScriptNum = latestScript ? latestScript.num : null;
                                const localRenderNum = highestRender ? highestRender.versionNum : null;

                                shotRecord.driveDiff = {
                                    driveLatestScriptVer,
                                    driveLatestScriptNum,
                                    driveLatestScriptName,
                                    driveLatestRenderVer,
                                    driveLatestRenderNum,
                                    driveLatestRenderName,
                                    driveNewerScene: driveLatestScriptNum !== null && (localScriptNum === null || driveLatestScriptNum > localScriptNum),
                                    driveMissingScene: localScriptNum !== null && (driveLatestScriptNum === null || localScriptNum > driveLatestScriptNum),
                                    driveNewerRender: driveLatestRenderNum !== null && (localRenderNum === null || driveLatestRenderNum > localRenderNum),
                                    driveMissingRender: localRenderNum !== null && (driveLatestRenderNum === null || localRenderNum > driveLatestRenderNum)
                                };
                            }

                            results.push(shotRecord);
                        }
                    }
                }
            }
        }

        results.sort((a, b) => a.key.localeCompare(b.key));
        return res.json({ success: true, results, hasDriveCatalog: !!driveManifest });
    } catch (err) {
        console.error('[AUDIT] Scan error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// --- AUDIT FIX: CLEAN TMP FILES IN RENDERS ---
router.post('/api/audit/clean-tmp', async (req, res) => {
    try {
        const { targets } = req.body || {};
        if (!targets || !Array.isArray(targets)) {
            return res.status(400).json({ error: 'Missing targets array' });
        }

        let deletedCount = 0;
        const deletedFiles = [];
        const errors = [];

        for (const t of targets) {
            const renders = Array.isArray(t.renders) && t.renders.length > 0
                ? t.renders
                : (t.path ? [{ path: t.path, tmpFiles: t.tmpFiles }] : []);

            for (const rnd of renders) {
                const dirPath = rnd.path;
                if (!dirPath || !(await fs.pathExists(dirPath))) continue;

                let filesToDelete = [];
                if (Array.isArray(rnd.tmpFiles) && rnd.tmpFiles.length > 0) {
                    filesToDelete = rnd.tmpFiles;
                } else {
                    const dirEntries = await fs.readdir(dirPath);
                    filesToDelete = dirEntries.filter(f => {
                        const fl = f.toLowerCase();
                        return fl.endsWith('.tmp') || fl.endsWith('.part') || fl.endsWith('.crdownload');
                    });
                }

                for (const tmpFile of filesToDelete) {
                    const fl = tmpFile.toLowerCase();
                    if (!fl.endsWith('.tmp') && !fl.endsWith('.part') && !fl.endsWith('.crdownload')) {
                        console.warn('[AUDIT CLEAN-TMP] Refusing to delete non-tmp file:', tmpFile);
                        continue;
                    }

                    const fullTmpPath = path.join(dirPath, tmpFile);
                    try {
                        if (await fs.pathExists(fullTmpPath)) {
                            await fs.unlink(fullTmpPath);
                            deletedCount++;
                            deletedFiles.push(fullTmpPath.replace(/\\/g, '/'));
                        }
                    } catch (e) {
                        console.error('[AUDIT CLEAN-TMP] Error unlinking:', fullTmpPath, e.message);
                        errors.push({ file: fullTmpPath, error: e.message });
                    }
                }
            }
        }

        res.json({ success: true, deletedCount, deletedFiles, errors });
    } catch (err) {
        console.error('[AUDIT] clean-tmp error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
