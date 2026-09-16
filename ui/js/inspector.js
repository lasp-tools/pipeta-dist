const Inspector = {
    presetBaseDirs: [
        "C:\\TOOLS\\APPS\\Pipeta\\presets\\AssetDesigner",
        "C:\\TOOLS\\APPS\\Pipeta\\presets\\ShotDesigner"
    ],
    presetCache: {},
    presetFileMap: {},

    init: async () => {
        Inspector.presetFileMap = {};
        Inspector.presetCache = {};
        try {
            if (window.API && API.fs && API.fs.getFiles) {
                for (const dir of Inspector.presetBaseDirs) {
                    try {
                        const files = await API.fs.getFiles(dir);
                        for (const f of files) {
                            if (f.endsWith('.json')) {
                                const fullPath = dir + "\\" + f;
                                const content = await API.fs.readFile(fullPath);
                                if (content) {
                                    try {
                                        const p = JSON.parse(content);
                                        if (p.id) {
                                            Inspector.presetFileMap[p.id] = fullPath;
                                            if (settings.validationPresetAsset === p.id || settings.validationPresetShot === p.id) {
                                                Inspector.presetCache[p.id] = p;
                                            }
                                        }
                                    } catch (e) { }
                                }
                            }
                        }
                    } catch (errDir) { }
                }
            }
        } catch (e) { console.error("Inspector Init Error:", e); }
        console.log("Inspector Initialized. Presets:", Object.keys(Inspector.presetFileMap));
    },

    getPreset: async (id) => {
        if (Inspector.presetCache[id]) return Inspector.presetCache[id];
        let fullPath = Inspector.presetFileMap[id];
        if (!fullPath) {
            await Inspector.init();
            fullPath = Inspector.presetFileMap[id];
        }
        if (!fullPath) return null;
        try {
            const content = await API.fs.readFile(fullPath);
            const p = JSON.parse(content);
            Inspector.presetCache[id] = p;
            return p;
        } catch (e) {
            console.error("Error loading preset", fullPath, e);
            return null;
        }
    },

    // ==========================================
    // ANALYZE PRESET: Extract structural info
    // ==========================================
    _analyzePreset: (preset) => {
        if (!preset.nodes || !Array.isArray(preset.nodes)) return null;

        const nodes = preset.nodes;
        const categories = nodes.filter(n => n.isCategory).map(n => n.name);
        const hasCategories = categories.length > 0;

        // Find the "main item" node — the entry point for structural validation
        // Assets: isAssetFocus or isItem
        // Shots: isEpisode (the episode folder is where the structure begins)
        let mainNode = nodes.find(n => n.isAssetFocus);
        if (!mainNode) mainNode = nodes.find(n => n.isItem && !n.isFileContainer);
        if (!mainNode) mainNode = nodes.find(n => n.isEpisode);
        if (!mainNode) mainNode = nodes.find(n => n.isShot);

        // Get direct children folders of the main node (= expected structure)
        const expectedFolders = mainNode
            ? nodes.filter(n => n.parent === mainNode.id && n.type === 'folder').map(n => n.name)
            : [];

        // Determine the "depth offset" caused by categories
        // If preset has categories:  depth 1 = category, depth 2 = item
        // If preset has NO categories: depth 1 = item directly
        const itemDepth = hasCategories ? 2 : 1;

        return {
            categories,
            hasCategories,
            mainNode,
            expectedFolders,
            itemDepth
        };
    },

    // ==========================================
    // MAIN VALIDATION (Context & Node-Aware)
    // ==========================================
    validate: async (folderPath, presetId, meta = null) => {
        if (!presetId) return { level: 'unknown', findings: [{ type: 'error', msg: 'No hay Preset configurado.' }], presetName: '?', missing: [] };

        const preset = await Inspector.getPreset(presetId);
        if (!preset) return { level: 'unknown', findings: [{ type: 'error', msg: `Preset '${presetId}' no encontrado.` }], presetName: '?', missing: [] };

        const result = {
            level: 'unknown',
            findings: [],
            presetName: preset.name,
            missing: [],
            expectedCategories: [],
            expectedProcesses: []
        };

        if (preset.nodes && Array.isArray(preset.nodes)) {
            let matchedNode = null;

            // Strategy A: If meta has node_id, use it directly
            if (meta && meta.node_id) {
                matchedNode = preset.nodes.find(n => n.id === meta.node_id);
            }

            // Strategy B: Match by path structure upwards against the preset tree
            if (!matchedNode) {
                const normPath = folderPath.replace(/\\/g, '/');
                const pathSegments = normPath.split('/').filter(Boolean);
                const folderName = pathSegments[pathSegments.length - 1] || '';
                const parentFolderName = pathSegments[pathSegments.length - 2] || '';

                if (parentFolderName.toLowerCase() === 'episodios' || parentFolderName.toLowerCase() === 'episodes') {
                    matchedNode = preset.nodes.find(n => n.isEpisode);
                } else if (parentFolderName.toLowerCase() === 'secuencias' || parentFolderName.toLowerCase() === 'sequences') {
                    matchedNode = preset.nodes.find(n => n.isScene);
                } else if (parentFolderName.toLowerCase() === 'shots') {
                    matchedNode = preset.nodes.find(n => n.isShot || n.isAssetFocus);
                } else {
                    matchedNode = preset.nodes.find(n => n.name.toLowerCase() === folderName.toLowerCase() || (n.variableName && n.variableName.toLowerCase() === folderName.toLowerCase()));
                    if (!matchedNode) {
                        matchedNode = preset.nodes.find(n => n.isProcess && n.name.toLowerCase() === folderName.toLowerCase());
                    }
                }
            }

            if (matchedNode) {
                result.node = matchedNode;
                result.level = matchedNode.isEpisode ? 'episode' : matchedNode.isScene ? 'scene' : (matchedNode.isShot || matchedNode.isAssetFocus) ? 'shot' : matchedNode.isProcess ? 'process' : matchedNode.isCategory ? 'category' : 'folder';

                // Find expected direct children for THIS matchedNode
                const expectedChildNodes = preset.nodes.filter(n => n.parent === matchedNode.id);
                const expectedFolderNodes = expectedChildNodes.filter(n => n.type === 'folder');
                const expectedFixedFolderNames = expectedFolderNodes.filter(n => !n.isVariable && !n.isEpisode && !n.isScene && !n.isShot && !n.isItem).map(n => n.name);

                result.expectedProcesses = expectedFolderNodes.map(n => n.name);

                // Fetch actual contents of the folder
                const dirData = await API.fetchDir(folderPath);
                if (dirData.error) {
                    result.findings.push({ type: 'error', msg: 'No se puede leer la carpeta en disco.' });
                    return result;
                }

                const existingItems = dirData.items || [];
                const existingNames = new Set(existingItems.map(i => i.name.toLowerCase()));
                const existingDirs = existingItems.filter(i => i.isDirectory);

                // Check required fixed subfolders
                for (const name of expectedFixedFolderNames) {
                    if (!existingNames.has(name.toLowerCase())) {
                        result.missing.push(name);
                    }
                }

                const hasDynamicChild = expectedFolderNodes.some(n => n.isVariable || n.isEpisode || n.isScene || n.isShot || n.isItem);

                if (result.missing.length > 0) {
                    result.findings.push({ type: 'warn', msg: `Faltan carpetas: <b>${result.missing.join(', ')}</b>` });
                } else if (expectedFixedFolderNames.length > 0) {
                    result.findings.push({ type: 'ok', msg: `Estructura de <b>${matchedNode.name || result.level}</b> (${result.presetName}) correcta.` });
                } else if (hasDynamicChild) {
                    result.findings.push({ type: 'ok', msg: `Contenedor <b>${matchedNode.name}</b> (${existingDirs.length} elementos creados).` });
                } else {
                    result.findings.push({ type: 'ok', msg: `Carpeta válida según <b>${result.presetName}</b>.` });
                }

                return result;
            }
        }

        // --- LEGACY STRUCTURE-BASED PRESET ---
        if (preset.structure) {
            result.level = 'item';
            const rootNode = preset.structure;
            if (rootNode && rootNode.children) {
                const dirData = await API.fetchDir(folderPath);
                if (dirData.error) {
                    result.findings.push({ type: 'error', msg: 'No se puede leer carpeta.' });
                    return result;
                }
                const existing = new Set(dirData.items.map(i => i.name.toLowerCase()));
                for (const child of rootNode.children) {
                    if (child.name && !existing.has(child.name.toLowerCase())) {
                        result.missing.push(child.name);
                    }
                }
                if (result.missing.length > 0) {
                    result.findings.push({ type: 'warn', msg: `Faltan carpetas: ${result.missing.join(', ')}` });
                } else {
                    result.findings.push({ type: 'ok', msg: 'Estructura correcta.' });
                }
            }
            return result;
        }

        result.findings.push({ type: 'ok', msg: `Carpeta en contexto (${result.presetName}).` });
        return result;
    },

    // ==========================================
    // HEURISTIC: Guess preset from path
    // ==========================================
    guessPresetId: (path) => {
        const p = path.replace(/\\/g, '/').toLowerCase();
        if (p.includes('/assets/') || p.includes('/characters/') || p.includes('/props/') || p.includes('/vehicles/') || p.includes('/sets/') || p.includes('/buildings/') || p.includes('/personajes/')) {
            return settings.validationPresetAsset;
        }
        if (p.includes('/shots/') || p.includes('/secuencias/') || p.includes('/episodes/') || p.includes('/episodios/')) {
            return settings.validationPresetShot;
        }
        return null;
    },

    // ==========================================
    // AUTO-FIX
    // ==========================================
    fixMissing: async (folderPath, missingFolders) => {
        let created = 0;
        for (const name of missingFolders) {
            const sep = (folderPath.endsWith('\\') || folderPath.endsWith('/')) ? '' : '\\';
            const res = await API.fs.mkdir(folderPath + sep + name);
            if (!res.error) created++;
        }
        return created;
    },

    // ==========================================
    // INJECT METADATA (Deprecated / No-op)
    // ==========================================
    injectMetadata: async () => {}
};

window.Inspector = Inspector;
