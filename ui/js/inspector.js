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
    // MAIN VALIDATION (Context-Aware)
    // ==========================================
    validate: async (folderPath, presetId) => {
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

        // --- NODE-BASED PRESET ---
        const analysis = Inspector._analyzePreset(preset);
        if (analysis) {
            result.expectedCategories = analysis.categories;
            result.expectedProcesses = analysis.expectedFolders;

            // Determine DEPTH relative to top-level marker
            const normalized = folderPath.replace(/\\/g, '/').toLowerCase();
            const folderName = folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop();

            const topMarkers = ['/assets/', '/shots/', '/secuencias/', '/episodes/', '/episodios/'];
            let afterMarker = '';
            let markerFound = false;

            for (const m of topMarkers) {
                const idx = normalized.indexOf(m);
                if (idx >= 0) {
                    afterMarker = normalized.substring(idx + m.length);
                    markerFound = true;
                    break;
                }
            }

            if (!markerFound) {
                result.findings.push({ type: 'error', msg: 'Ruta fuera de contenedor conocido (assets/shots/episodios).' });
                return result;
            }

            const parts = afterMarker.split('/').filter(Boolean);
            const depth = parts.length;

            // --- DEPTH 0: Container itself ---
            if (depth === 0) {
                result.level = 'container';
                result.findings.push({ type: 'ok', msg: `Contenedor raíz del preset <b>${preset.name}</b>.` });
                return result;
            }

            // ==========================================
            // PRESET WITH CATEGORIES (e.g. Asset preset)
            // depth 1 = category, depth 2 = item, depth 3+ = process
            // ==========================================
            if (analysis.hasCategories) {

                if (depth === 1) {
                    // CATEGORY level
                    result.level = 'category';
                    const isValid = analysis.categories.some(c => c.toLowerCase() === folderName.toLowerCase());
                    if (isValid) {
                        result.findings.push({ type: 'ok', msg: `Categoría válida según <b>${preset.name}</b>.` });
                    } else {
                        result.findings.push({ type: 'error', msg: `"<b>${folderName}</b>" no es una categoría válida.` });
                        result.findings.push({ type: 'info', msg: `Esperadas: ${analysis.categories.join(', ')}` });
                    }
                    return result;
                }

                if (depth === 2) {
                    // ITEM level (e.g. assets/personajes/Bichito)
                    result.level = 'item';
                    return await Inspector._validateItemStructure(folderPath, analysis, result);
                }

                // depth 3+ = PROCESS
                result.level = 'process';
                return Inspector._validateProcessName(folderName, analysis, result, preset);
            }

            // ==========================================
            // PRESET WITHOUT CATEGORIES (e.g. Shot preset)
            // depth 1 = item (episode), depth 2+ = internal structure
            // ==========================================
            if (depth === 1) {
                // ITEM level directly (e.g. episodios/CAP01S1)
                result.level = 'item';
                return await Inspector._validateItemStructure(folderPath, analysis, result);
            }

            // depth 2+ = inside the item (process/subfolders)
            result.level = 'process';
            return Inspector._validateProcessName(folderName, analysis, result, preset);
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

        result.findings.push({ type: 'error', msg: 'Formato de preset desconocido.' });
        return result;
    },

    // Helper: Validate Item internal structure
    _validateItemStructure: async (folderPath, analysis, result) => {
        if (!analysis.mainNode) {
            result.findings.push({ type: 'error', msg: 'No se encontró nodo principal en el preset.' });
            return result;
        }

        const dirData = await API.fetchDir(folderPath);
        if (dirData.error) {
            result.findings.push({ type: 'error', msg: 'No se puede leer la carpeta.' });
            return result;
        }

        const existingNames = new Set(dirData.items.map(i => i.name.toLowerCase()));

        for (const name of analysis.expectedFolders) {
            if (!existingNames.has(name.toLowerCase())) {
                result.missing.push(name);
            }
        }

        if (result.missing.length > 0) {
            result.findings.push({ type: 'warn', msg: `Faltan carpetas: ${result.missing.join(', ')}` });
        } else {
            result.findings.push({ type: 'ok', msg: `Estructura de <b>${result.presetName}</b> correcta.` });
        }

        return result;
    },

    // Helper: Validate Process folder name
    _validateProcessName: (folderName, analysis, result, preset) => {
        const isValid = analysis.expectedFolders.some(p => p.toLowerCase() === folderName.toLowerCase());
        if (isValid) {
            result.findings.push({ type: 'ok', msg: `Carpeta de proceso válida según <b>${preset.name}</b>.` });
        } else {
            result.findings.push({ type: 'warn', msg: `"<b>${folderName}</b>" no coincide con un proceso esperado.` });
            if (analysis.expectedFolders.length > 0) {
                result.findings.push({ type: 'info', msg: `Esperados: ${analysis.expectedFolders.join(', ')}` });
            }
        }
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
    // INJECT METADATA
    // ==========================================
    injectMetadata: async (folderPath, presetId, user) => {
        const preset = await Inspector.getPreset(presetId);
        const meta = {
            preset_id: presetId,
            node_name: preset ? preset.name : "Custom",
            items: [],
            user: user || "Inspector",
            creation_date: new Date().toISOString()
        };
        await API.fs.writeFile(folderPath + "\\vfx_control.json", JSON.stringify(meta, null, 2));
    }
};

window.Inspector = Inspector;
