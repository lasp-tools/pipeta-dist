// --- ASSET DESIGNER MODULE ---

const ShotDesigner = {
    // State
    assets: [],
    currentAsset: null,
    selectedNodeId: null,
    selectedNodeIds: [], // Multi-selection support
    presetsPath: "C:\\TOOLS\\APPS\\Pipeta\\presets\\ShotDesigner",

    // Interaction State
    isDraggingNode: false,
    dragNode: null,
    dragLastPos: { x: 0, y: 0 },

    isPanning: false,
    panStart: { x: 0, y: 0 },
    panOffset: { x: 0, y: 0 },
    zoomLevel: 1,

    // Renaming State
    isRenaming: false,
    renamingNodeId: null,

    // Connection State
    connectionCurrentPos: { x: 0, y: 0 },

    // Selection Box State
    isBoxSelecting: false,
    boxStart: { x: 0, y: 0 },
    boxCurrent: { x: 0, y: 0 },

    // History (Undo / Redo) State
    history: [],
    historyIndex: -1,
    isApplyingHistory: false,

    initHistory: () => {
        ShotDesigner.history = [];
        ShotDesigner.historyIndex = -1;
        ShotDesigner.pushHistory();
    },

    pushHistory: () => {
        if (ShotDesigner.isApplyingHistory || !ShotDesigner.currentAsset) return;
        const snapshot = JSON.stringify(ShotDesigner.currentAsset);
        if (ShotDesigner.historyIndex >= 0 && ShotDesigner.history[ShotDesigner.historyIndex] === snapshot) {
            return;
        }

        if (ShotDesigner.historyIndex < ShotDesigner.history.length - 1) {
            ShotDesigner.history = ShotDesigner.history.slice(0, ShotDesigner.historyIndex + 1);
        }

        ShotDesigner.history.push(snapshot);
        if (ShotDesigner.history.length > 60) {
            ShotDesigner.history.shift();
        }
        ShotDesigner.historyIndex = ShotDesigner.history.length - 1;
    },

    undo: () => {
        if (!ShotDesigner.currentAsset || ShotDesigner.historyIndex <= 0) {
            console.log("[ShotDesigner] No hay más pasos para deshacer.");
            return;
        }
        ShotDesigner.isApplyingHistory = true;
        ShotDesigner.historyIndex--;
        const restored = JSON.parse(ShotDesigner.history[ShotDesigner.historyIndex]);

        const idx = ShotDesigner.assets.findIndex(a => a.id === restored.id);
        if (idx !== -1) {
            ShotDesigner.assets[idx] = restored;
        }
        ShotDesigner.currentAsset = restored;

        ShotDesigner.selectedNodeIds = [];
        ShotDesigner.selectedNodeId = null;

        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
        ShotDesigner.updatePreview();
        ShotDesigner.saveAsset();
        ShotDesigner.isApplyingHistory = false;
        console.log(`[ShotDesigner] Undo aplicado (${ShotDesigner.historyIndex + 1}/${ShotDesigner.history.length})`);
    },

    redo: () => {
        if (!ShotDesigner.currentAsset || ShotDesigner.historyIndex >= ShotDesigner.history.length - 1) {
            console.log("[ShotDesigner] No hay más pasos para rehacer.");
            return;
        }
        ShotDesigner.isApplyingHistory = true;
        ShotDesigner.historyIndex++;
        const restored = JSON.parse(ShotDesigner.history[ShotDesigner.historyIndex]);

        const idx = ShotDesigner.assets.findIndex(a => a.id === restored.id);
        if (idx !== -1) {
            ShotDesigner.assets[idx] = restored;
        }
        ShotDesigner.currentAsset = restored;

        ShotDesigner.selectedNodeIds = [];
        ShotDesigner.selectedNodeId = null;

        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
        ShotDesigner.updatePreview();
        ShotDesigner.saveAsset();
        ShotDesigner.isApplyingHistory = false;
        console.log(`[ShotDesigner] Redo aplicado (${ShotDesigner.historyIndex + 1}/${ShotDesigner.history.length})`);
    },

    init: async () => {
        console.log("Initializing Shot Designer... Version: 2026-02-08-v2");
        await ShotDesigner.loadPresets();

        // If no assets, create default
        if (ShotDesigner.assets.length === 0) {
            await ShotDesigner.newAsset("Master_Shot");
        } else {
            const master = ShotDesigner.assets.find(a => a.id === 'master_shot' || a.name?.toLowerCase() === 'master_shot');
            ShotDesigner.currentAsset = master || ShotDesigner.assets[0];
        }
        // Ensure connections array exists for the current asset
        if (ShotDesigner.currentAsset && !ShotDesigner.currentAsset.connections) ShotDesigner.currentAsset.connections = [];

        ShotDesigner.initHistory();

        ShotDesigner.renderUI();
        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();

        // Canvas Events
        const canvas = document.getElementById('sd-canvas-area');
        if (canvas) {
            canvas.addEventListener('mousedown', ShotDesigner.onCanvasMouseDown);
            canvas.addEventListener('mousemove', ShotDesigner.onCanvasMouseMove);
            canvas.addEventListener('mouseup', ShotDesigner.onCanvasMouseUp);
            canvas.addEventListener('wheel', ShotDesigner.onCanvasWheel);
            canvas.addEventListener('contextmenu', e => e.preventDefault());
        }

        document.addEventListener('keydown', ShotDesigner.onKeyDown);

        // Hook up Header Buttons
        document.getElementById('sd-asset-selector').addEventListener('change', (e) => ShotDesigner.selectAsset(e.target.value));
    },

    startRenaming: (nodeId) => {
        ShotDesigner.isRenaming = true;
        ShotDesigner.renamingNodeId = nodeId;
        ShotDesigner.renderCanvas();
        // Focus the input
        setTimeout(() => {
            const input = document.querySelector('.sd-node-input');
            if (input) {
                input.focus();
                input.select();
            }
        }, 10);
    },

    finishRenaming: (id, newName) => {
        if (!ShotDesigner.isRenaming) return;

        const node = ShotDesigner.currentAsset.nodes.find(n => n.id === id);
        if (node && newName && newName.trim() !== '') {
            node.name = newName.trim();
        }

        ShotDesigner.isRenaming = false;
        ShotDesigner.renamingNodeId = null;
        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
        ShotDesigner.updatePreview();
        ShotDesigner.saveAsset();
    },

    cancelRenaming: () => {
        ShotDesigner.isRenaming = false;
        ShotDesigner.renamingNodeId = null;
        ShotDesigner.renderCanvas();
    },

    appendNameTag: (nodeId, tag) => {
        const input = document.getElementById(`nc-pattern-${nodeId}`);
        if (input) {
            // Insert at cursor or append
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;
            const before = text.substring(0, start);
            const after = text.substring(end, text.length);

            input.value = before + tag + after;
            input.dispatchEvent(new Event('change')); // Trigger change event for reactivity
            input.focus();
            input.setSelectionRange(start + tag.length, start + tag.length);
        }

        // Update Model (This part was originally outside the if(input) block and seems to be intended to update the model)
        // Assuming updateNodeProp should be called regardless if input exists, but with the new value.
        // If the input doesn't exist, the pattern won't be updated from the UI, so this might be fine.
        // The original code had this block after input.focus(), so keeping it here.
        ShotDesigner.updateNodeProp(nodeId, 'nameConfig.versionPadding', ShotDesigner.currentAsset.nodes.find(n => n.id === nodeId).nameConfig?.versionPadding || 3); // Dummy update to trigger? No
        ShotDesigner.updateNodeProp(nodeId, 'nameConfig.pattern', input ? input.value : ''); // Use input.value if input exists, else empty string
    },

    addCounterTag: (nodeId) => {
        const id = prompt("ID del Counter (ej: 1):", "1");
        if (!id) return;
        const paddingStr = prompt("Cantidad de dígitos (ej: 3 para 001):", "2");
        if (!paddingStr) return;
        const padding = parseInt(paddingStr) || 1;
        const hashtags = "#".repeat(padding);
        ShotDesigner.appendNameTag(nodeId, `[counter(${id})${hashtags}]`);
    },

    // --- PERSISTENCE ---
    loadPresets: async () => {
        ShotDesigner.assets = [];
        try {
            // Ensure folder exists
            if (window.API && API.fs && API.fs.mkdir) {
                await API.fs.mkdir(ShotDesigner.presetsPath);
            }

            const files = await API.fs.getFiles(ShotDesigner.presetsPath);
            console.log("Found preset files:", files);

            for (const f of files) {
                if (f.endsWith('.json')) {
                    const content = await API.fs.readFile(ShotDesigner.presetsPath + "\\" + f);
                    if (content) {
                        try {
                            const asset = JSON.parse(content);
                            // IMPORTANTE: Asegurar ID único
                            if (!asset.id) asset.id = 'asset_' + Math.random().toString(36).substr(2, 9);
                            // Ensure connections array exists
                            if (!asset.connections) asset.connections = [];
                            asset._fileName = f;
                            ShotDesigner.assets.push(asset);
                        } catch (parseErr) {
                            console.error("Error parsing " + f, parseErr);
                        }
                    }
                }
            }
        } catch (e) {
            console.error("loadPresets error:", e);
        }

        if (ShotDesigner.assets.length === 0) {
            console.log("No assets found. Using default.");
        } else {
            console.log("Loaded", ShotDesigner.assets.length, "assets.");
            // Seleccionar el primero por defecto
            ShotDesigner.currentAsset = ShotDesigner.assets[0];
        }
    },

    saveAsset: async () => {
        if (!ShotDesigner.currentAsset) return;
        const fileName = ShotDesigner.currentAsset._fileName || (ShotDesigner.currentAsset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
        ShotDesigner.currentAsset._fileName = fileName;
        const filePath = ShotDesigner.presetsPath + "\\" + fileName;
        const content = JSON.stringify(ShotDesigner.currentAsset, null, 2);

        try {
            const result = await API.fs.writeFile(filePath, content);
            console.log("Save result:", result);
            if (!result || !result.success) {
                console.error("Error al guardar:", result?.error || "Unknown");
            } else {
                if (typeof ShotNavigator !== 'undefined' && ShotNavigator.invalidatePresetCache) {
                    ShotNavigator.invalidatePresetCache();
                }
            }
        } catch (e) {
            console.error("Save error:", e);
        }
    },

    newAsset: (name) => {
        const assetName = name || "New Asset";
        const newAsset = {
            id: 'asset_' + Date.now(),
            name: assetName,
            _fileName: assetName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json",
            nodes: [
                { id: "root", type: "folder", name: "ROOT", x: 50, y: 50, parent: null }
            ],
            connections: [] // Initialize connections here
        };
        ShotDesigner.assets.push(newAsset);
        ShotDesigner.currentAsset = newAsset;
        ShotDesigner.renderUI();
        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
    },

    deleteAsset: async () => {
        if (!ShotDesigner.currentAsset) return;
        const assetName = ShotDesigner.currentAsset.name;

        if (!confirm("¿Borrar asset " + assetName + "?")) return;

        const fileName = ShotDesigner.currentAsset._fileName || (assetName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
        const filePath = ShotDesigner.presetsPath + "\\" + fileName;

        console.log("[Delete] Deleting:", filePath);

        // Use deleteFile which works
        if (window.API && API.fs && API.fs.deleteFile) {
            try {
                const res = await API.fs.deleteFile(filePath);
                console.log("[Delete] Result:", res);
            } catch (e) {
                console.error("[Delete] Error:", e);
            }
        }

        // Update UI State
        ShotDesigner.assets = ShotDesigner.assets.filter(a => a.id !== ShotDesigner.currentAsset.id);

        if (ShotDesigner.assets.length > 0) {
            ShotDesigner.currentAsset = ShotDesigner.assets[0];
        } else {
            ShotDesigner.currentAsset = null;
            ShotDesigner.newAsset("Default");
        }

        ShotDesigner.renderUI();
        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
    },

    selectAsset: (assetId) => {
        const asset = ShotDesigner.assets.find(a => a.id === assetId);
        if (asset) {
            ShotDesigner.currentAsset = asset;
            ShotDesigner.selectedNodeId = null;
            ShotDesigner.selectedNodeIds = [];
            ShotDesigner.initHistory();
            ShotDesigner.renderCanvas();
            ShotDesigner.renderUI();
            ShotDesigner.updateSidebar();
        }
    },

    renameAsset: async () => {
        if (!ShotDesigner.currentAsset) {
            console.warn("[Rename] No hay asset seleccionado.");
            return;
        }

        const oldName = ShotDesigner.currentAsset.name;
        const oldId = ShotDesigner.currentAsset.id || oldName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const newName = prompt("Nuevo nombre para el Asset:", oldName);

        if (!newName || newName === oldName) return;

        const newId = newName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const oldFileName = ShotDesigner.currentAsset._fileName || (oldName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
        const newFileName = newName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";

        const oldPath = ShotDesigner.presetsPath + "\\" + oldFileName;
        const newPath = ShotDesigner.presetsPath + "\\" + newFileName;

        console.log(`[Rename] ${oldFileName} (${oldId}) -> ${newFileName} (${newId})`);

        try {
            // Actualizar objeto en memoria
            ShotDesigner.currentAsset.name = newName;
            ShotDesigner.currentAsset.id = newId;
            ShotDesigner.currentAsset._fileName = newFileName;

            // Eliminar archivo viejo si cambió de nombre
            if (oldPath !== newPath) {
                try { await API.fs.deleteFile(oldPath); } catch (dErr) {}
            }

            // Guardar con el nuevo nombre y nuevo ID
            await ShotDesigner.saveAsset();

            // Auto-configurar proyectos y configuraciones que apuntaban al nombre/id viejo
            if (typeof settings !== 'undefined') {
                if (settings.projects && Array.isArray(settings.projects)) {
                    for (const proj of settings.projects) {
                        const oldIdMatch = (proj.defaultShotPresetId === oldId || 
                                            proj.defaultShotPresetId === oldName || 
                                            proj.defaultShotPresetId === oldFileName.replace('.json', ''));
                        if (oldIdMatch) {
                            proj.defaultShotPresetId = newId;
                            const projFile = (proj.id === 'proj_base' || proj.isBase) ? 'base.json' : `${proj.name || proj.id}.json`;
                            try {
                                await API.fs.writeFile(settings.projectsPath + "\\" + projFile, JSON.stringify(proj, null, 2));
                            } catch (pErr) {
                                console.warn("[Rename] Auto-save project note:", pErr);
                            }
                        }
                    }
                }

                if (settings.validationPresetShot === oldId || 
                    settings.validationPresetShot === oldName || 
                    settings.validationPresetShot === oldFileName.replace('.json', '')) {
                    settings.validationPresetShot = newId;
                    settings.saveConfig();
                }

                await settings.loadPresets();
                if (settings.isVisible) {
                    settings.render();
                }
            }

            // Invalidar caché en Shot Navigator
            if (typeof ShotNavigator !== 'undefined' && ShotNavigator.invalidatePresetCache) {
                ShotNavigator.invalidatePresetCache();
            }

            ShotDesigner.renderUI();
            ShotDesigner.renderCanvas();
            ShotDesigner.updateSidebar();
            console.log("[Rename] OK & auto-propagado a proyectos");
        } catch (e) {
            console.error("[Rename] Exception:", e);
            alert("Error: " + e.message);
        }
    },

    duplicateAsset: () => {
        if (!ShotDesigner.currentAsset) return;
        const copy = JSON.parse(JSON.stringify(ShotDesigner.currentAsset));
        copy.id = 'asset_' + Date.now();
        copy.name = copy.name + " (Copy)";
        copy._fileName = copy.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
        ShotDesigner.assets.push(copy);
        ShotDesigner.currentAsset = copy;
        ShotDesigner.renderUI();
        ShotDesigner.renderCanvas();
        ShotDesigner.saveAsset(); // Save immediately?
    },

    selectAsset: (id) => {
        const found = ShotDesigner.assets.find(a => a.id === id);
        if (found) {
            ShotDesigner.currentAsset = found;
            ShotDesigner.renderCanvas();
            ShotDesigner.updateSidebar();
        }
    },

    // --- RENDERERS ---
    renderUI: () => {
        const select = document.getElementById('sd-asset-selector');
        if (select && ShotDesigner.currentAsset) {
            select.innerHTML = ShotDesigner.assets.map(a =>
                `<option value="${a.id}" ${ShotDesigner.currentAsset.id === a.id ? 'selected' : ''}>${a.name}</option>`
            ).join('');
        }
    },

    renderCanvas: () => {
        const nodesLayer = document.getElementById('sd-nodes-layer');
        const connectionsLayer = document.getElementById('sd-connections-layer');
        if (!nodesLayer || !connectionsLayer) return;

        // Apply Transform
        // CSS needs 'px' for translate usually, SVG attribute needs UNITLESS
        const tX = ShotDesigner.panOffset.x;
        const tY = ShotDesigner.panOffset.y;
        const scale = ShotDesigner.zoomLevel;

        const cssTransform = `translate(${tX}px, ${tY}px) scale(${scale})`;
        const svgTransform = `translate(${tX}, ${tY}) scale(${scale})`;

        nodesLayer.style.transform = cssTransform;
        nodesLayer.style.transformOrigin = "0 0";

        let svgGroup = connectionsLayer.querySelector('g.viewport');
        if (!svgGroup) {
            connectionsLayer.innerHTML = '<g class="viewport"></g>';
            svgGroup = connectionsLayer.querySelector('g.viewport');
        }
        svgGroup.setAttribute('transform', svgTransform);

        nodesLayer.innerHTML = '';
        svgGroup.innerHTML = '';

        // Draw Split Line (Y=0)
        const splitLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        splitLine.setAttribute("x1", -10000);
        splitLine.setAttribute("y1", 0);
        splitLine.setAttribute("x2", 10000);
        splitLine.setAttribute("y2", 0);
        splitLine.setAttribute("stroke", "#444");
        splitLine.setAttribute("stroke-width", 2 / ShotDesigner.zoomLevel);
        splitLine.setAttribute("stroke-dasharray", 10 / ShotDesigner.zoomLevel);
        svgGroup.appendChild(splitLine);

        // Zone Labels
        const createLabel = (text, y, color) => {
            const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
            txt.setAttribute("x", 20);
            txt.setAttribute("y", y);
            txt.setAttribute("fill", color);
            txt.setAttribute("style", "font-family: Arial; font-weight: bold; font-size: 14px; opacity: 0.5; pointer-events: none; text-transform: uppercase;");
            txt.textContent = text;
            return txt;
        };
        svgGroup.appendChild(createLabel("Proyecto", -10, "#2196F3"));
        svgGroup.appendChild(createLabel("Media", 20, "#4CAF50"));

        // Selection Box
        if (ShotDesigner.isBoxSelecting) {
            const box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const x = Math.min(ShotDesigner.boxStart.x, ShotDesigner.boxCurrent.x);
            const y = Math.min(ShotDesigner.boxStart.y, ShotDesigner.boxCurrent.y);
            const w = Math.abs(ShotDesigner.boxStart.x - ShotDesigner.boxCurrent.x);
            const h = Math.abs(ShotDesigner.boxStart.y - ShotDesigner.boxCurrent.y);
            box.setAttribute("x", x);
            box.setAttribute("y", y);
            box.setAttribute("width", w);
            box.setAttribute("height", h);
            box.setAttribute("fill", "rgba(33, 150, 243, 0.1)");
            box.setAttribute("stroke", "#2196F3");
            box.setAttribute("stroke-width", 1 / ShotDesigner.zoomLevel);
            svgGroup.appendChild(box);
        }

        if (!ShotDesigner.currentAsset) return;

        // Draw Connections First (Background)
        // 1. Draw Hierarchical Connections (Classic)
        ShotDesigner.currentAsset.nodes.forEach(node => {
            if (node.parent) {
                const parent = ShotDesigner.currentAsset.nodes.find(n => n.id === node.parent);
                if (parent) ShotDesigner.drawConnection(parent, node, svgGroup, 'out', 'in');
            }
            if (node.parentOnline && node.isSyncPoint) {
                const parent = ShotDesigner.currentAsset.nodes.find(n => n.id === node.parentOnline);
                if (parent) ShotDesigner.drawConnection(parent, node, svgGroup, 'out', 'in-online');
            }
            // Multi-parent items
            if (node.isItem && node.itemConfig?.additionalParents) {
                node.itemConfig.additionalParents.forEach(pId => {
                    const parent = ShotDesigner.currentAsset.nodes.find(n => n.id === pId);
                    if (parent) ShotDesigner.drawConnection(parent, node, svgGroup, 'out', 'in-multi-item');
                });
            }
            // Multi-parent processes
            if (node.isProcess && node.processConfig?.additionalParents) {
                node.processConfig.additionalParents.forEach(pId => {
                    const parent = ShotDesigner.currentAsset.nodes.find(n => n.id === pId);
                    if (parent) ShotDesigner.drawConnection(parent, node, svgGroup, 'out', 'in-multi-process');
                });
            }
        });

        // 2. Draw Supplemental Connections (Mirror, etc.)
        if (ShotDesigner.currentAsset.connections) {
            ShotDesigner.currentAsset.connections.forEach(conn => {
                const fromNode = ShotDesigner.currentAsset.nodes.find(n => n.id === conn.from);
                const toNode = ShotDesigner.currentAsset.nodes.find(n => n.id === conn.to);
                if (fromNode && toNode) {
                    const isMirror = conn.fromPort === 'mirror' || conn.toPort === 'mirror';
                    ShotDesigner.drawConnection(fromNode, toNode, svgGroup, conn.fromPort, conn.toPort, isMirror);
                }
            });
        }

        // Draw Draft Connection
        if (ShotDesigner.isConnecting && ShotDesigner.connectionStartNode) {
            ShotDesigner.drawDraftConnection(ShotDesigner.connectionStartNode, ShotDesigner.connectionCurrentPos, svgGroup, ShotDesigner.connectionStartPoint);
        }

        ShotDesigner.currentAsset.nodes.forEach(node => {
            const el = document.createElement('div');
            const isSelected = ShotDesigner.selectedNodeIds.includes(node.id);
            const zoneClass = node.y >= 0 ? 'zone-media' : 'zone-proyecto';
            el.className = `sd-node ${node.type} ${isSelected ? 'selected' : ''} ${zoneClass}`;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            el.setAttribute('data-id', node.id);
            // Removed inline onmousedown to rely on centralized onCanvasMouseDown handler

            // Dots HTML
            let dotsHtml = '';

            // INPUT DOTS
            if (node.isSyncPoint) {
                // Dual Inputs
                dotsHtml += `<div class="sd-dot sd-dot-in sd-dot-in-online" title="Input Online" data-node-id="${node.id}" data-type="in-online"></div>`;
                dotsHtml += `<div class="sd-dot sd-dot-in sd-dot-in-local" title="Input Local" data-node-id="${node.id}" data-type="in-local"></div>`;
            } else {
                // Std Input
                // Check if Multi-Parent Item OR Process Parent Item
                const isItemMulti = node.isItem && node.itemConfig && node.itemConfig.allowMultiParent;
                const isProcessMulti = node.isProcess && node.processConfig && node.processConfig.parentItem;

                let dotClass = 'sd-dot sd-dot-in';
                let title = 'Input (Child)';
                let dataType = 'in';

                if (isItemMulti) {
                    dotClass = 'sd-dot sd-dot-in multi-parent'; // Pink
                    title = 'Input (Multi-Parent Item)';
                    dataType = 'in-multi-item';
                } else if (isProcessMulti) {
                    dotClass = 'sd-dot sd-dot-in multi-process'; // Chroma Green need CSS
                    title = 'Input (Process Parent Item)';
                    dataType = 'in-multi-process';
                }

                dotsHtml += `<div class="${dotClass}" title="${title}" data-node-id="${node.id}" data-type="${dataType}"></div>`;
            }

            // OUTPUT DOTS
            // Folders and Units can have children
            if (node.type === 'folder' || node.type === 'unit') {
                dotsHtml += `<div class="sd-dot sd-dot-out" title="Output (Parent)" data-node-id="${node.id}" data-type="out"></div>`;
            }

            // Scene output (for renders)
            if (node.type === 'file' && node.isScene) {
                dotsHtml += `<div class="sd-dot sd-dot-out-render" title="Render Output (to RenderFolder)" data-node-id="${node.id}" data-type="out-render"></div>`;
            }

            let icon = '';
            if (node.type === 'folder') {
                icon = '📂';
                if (node.isRenderFolder) icon = '📥';
            }
            else if (node.type === 'unit') icon = '💽';
            else if (node.type === 'file') {
                icon = '📄';
                if (node.isRenderFile) icon = '🎞️';
            }

            // Badges HTML
            let badgesHtml = '<div class="sd-badges">';
            if (node.isSyncPoint) badgesHtml += `<span class="sd-badge" style="background:#009688">SYNC</span>`;
            if (node.isEpisode) badgesHtml += `<span class="sd-badge" style="background:#E91E63">EPI</span>`;
            if (node.isScene) badgesHtml += `<span class="sd-badge" style="background:#FF9800">SCE</span>`;
            if (node.isShot) badgesHtml += `<span class="sd-badge sd-badge-item">SHOT</span>`;
            if (node.isRenderFile) badgesHtml += `<span class="sd-badge out-render-badge">RND</span>`;
            if (node.isRenderFolder) badgesHtml += `<span class="sd-badge out-render-badge">R-FOL</span>`;
            if (node.isFinalRender) badgesHtml += `<span class="sd-badge" style="background:#FFCA28; color:#000;">FULLRES</span>`;
            if (node.isCompressionRender) badgesHtml += `<span class="sd-badge" style="background:#42A5F5; color:#000;">MOV</span>`;
            if (node.isExternalTcl) badgesHtml += `<span class="sd-badge" style="background:#00BCD4; color:#000;">TCL</span>`;

            if (node.isVariable)
                badgesHtml += `<span class="sd-badge sd-badge-variable">${node.variableName || 'VAR'}</span>`;
            else if (node.type !== 'file' && !node.isShot && !node.isProcess)
                badgesHtml += `<span class="sd-badge" style="background:#FBC02D; color:#000;">FIXED</span>`;

            if (node.isProcess) badgesHtml += `<span class="sd-badge sd-badge-process">PROC</span>`;
            if (node.isFileContainer) badgesHtml += `<span class="sd-badge" style="background:#555">FC</span>`;

            badgesHtml += '</div>';

            const isRenaming = ShotDesigner.isRenaming && ShotDesigner.renamingNodeId === node.id;
            const contentHtml = isRenaming
                ? `<input class="sd-node-input" value="${node.name}" 
                    onkeydown="if(event.key==='Enter') ShotDesigner.finishRenaming('${node.id}', this.value); if(event.key==='Escape') ShotDesigner.cancelRenaming(); event.stopPropagation();"
                    onblur="ShotDesigner.finishRenaming('${node.id}', this.value)"
                    onclick="event.stopPropagation()">`
                : `<div class="sd-node-content">${node.name}${node.type === 'unit' ? ':' : ''}</div>`;

            el.innerHTML = `
                ${dotsHtml}
                ${badgesHtml}
                <div class="sd-node-header" style="justify-content:flex-start; padding-left:10px;">${icon}</div>
                ${contentHtml}
            `;


            // Mirror Dot (Vertical)
            if (node.isMirrorOn) {
                const mirrorDot = document.createElement('div');
                const isMedia = node.y >= 0;
                mirrorDot.className = `sd-dot sd-dot-mirror ${isMedia ? 'top' : 'bottom'}`;
                mirrorDot.setAttribute('data-node-id', node.id);
                mirrorDot.setAttribute('data-type', 'mirror');
                el.appendChild(mirrorDot);
            }

            // Render Input Dot (Top/Bottom)
            if ((node.type === 'folder' && node.isRenderFolder) || (node.type === 'file' && node.isRenderFile)) {
                const renderDot = document.createElement('div');
                const isMedia = node.y >= 0;
                renderDot.className = `sd-dot sd-dot-in-render ${isMedia ? 'top' : 'bottom'}`;
                renderDot.setAttribute('data-node-id', node.id);
                renderDot.setAttribute('data-type', 'in-render');
                el.appendChild(renderDot);
            }

            el.ondblclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                ShotDesigner.startRenaming(node.id);
            };

            nodesLayer.appendChild(el);
        });

        ShotDesigner.updatePreview();
        ShotDesigner.updateBackground();
    },

    updateBackground: () => {
        const canvas = document.getElementById('sd-canvas-area');
        if (canvas) {
            canvas.style.backgroundPosition = `${ShotDesigner.panOffset.x}px ${ShotDesigner.panOffset.y}px`;
            canvas.style.backgroundSize = `${20 * ShotDesigner.zoomLevel}px ${20 * ShotDesigner.zoomLevel}px`;
        }
    },

    drawConnection: (from, to, svgGroup, fromPort = 'out', toPort = 'in', isMirror = false) => {
        const fromPoint = ShotDesigner.getDotPosition(from, fromPort);
        const toPoint = ShotDesigner.getDotPosition(to, toPort);

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", isMirror ? "connector mirror" : "connector"); // 'mirror' uses dasharray in CSS

        // Curved path
        const cp1x = fromPoint.x + (toPoint.x - fromPoint.x) / 2;
        const cp2x = fromPoint.x + (toPoint.x - fromPoint.x) / 2;
        const d = `M ${fromPoint.x} ${fromPoint.y} C ${cp1x} ${fromPoint.y} ${cp2x} ${toPoint.y} ${toPoint.x} ${toPoint.y}`;
        path.setAttribute("d", d);

        if (isMirror) {
            path.setAttribute("stroke", "#E040FB");
            path.setAttribute("stroke-dasharray", "5,5");
        } else if (fromPort === 'out-render' || toPort === 'in-render') {
            path.setAttribute("stroke", "#FFD600");
            path.setAttribute("stroke-dasharray", "3,3");
        } else {
            // Color Logic: Trace ancestry to see if we are in Online or Local branch
            let strokeColor = "#555";

            // If explicitly Online type OR if this connection feeds into an Online Sync Point
            if (fromPort === 'out-online' || toPort === 'in-online') { // Assuming 'out-online' for parentOnline output
                strokeColor = "#4CAF50"; // Green
            } else if (ShotDesigner.isFeedingOnline(to.id)) { // Check if target node feeds online
                strokeColor = "#4CAF50"; // Propagate Green Backwards
            } else if (fromPort === 'out-local' || toPort === 'in-local') { // Assuming 'out-local' for parent output
                strokeColor = "#2196F3"; // Direct Blue Input
            } else if (ShotDesigner.isFeedingLocalSync(to.id)) { // Check if target node feeds local sync
                strokeColor = "#2196F3"; // Propagate Blue Backwards
            } else {
                strokeColor = "#555"; // Default Grey for non-sync paths
            }
            path.style.stroke = strokeColor;
        }

        path.setAttribute("stroke-width", 2.5 / ShotDesigner.zoomLevel);
        path.style.cursor = 'pointer';
        path.setAttribute("title", "Clic derecho o doble clic en el cable para desconectar");

        path.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            ShotDesigner.removeSpecificConnection(from.id, to.id, fromPort, toPort);
        });
        path.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            ShotDesigner.removeSpecificConnection(from.id, to.id, fromPort, toPort);
        });

        svgGroup.appendChild(path);
    },

    disconnectPort: (nodeId, portType) => {
        const node = ShotDesigner.currentAsset.nodes.find(n => n.id === nodeId);
        if (!node) return;

        if (portType === 'in' || portType === 'in-local') {
            node.parent = null;
        } else if (portType === 'in-online') {
            node.parentOnline = null;
        } else if (portType === 'in-multi-item') {
            if (node.itemConfig) node.itemConfig.additionalParents = [];
            node.parent = null;
        } else if (portType === 'in-multi-process') {
            if (node.processConfig) node.processConfig.additionalParents = [];
            node.parent = null;
        } else if (portType === 'out') {
            ShotDesigner.currentAsset.nodes.forEach(child => {
                if (child.parent === nodeId) child.parent = null;
                if (child.parentOnline === nodeId) child.parentOnline = null;
                if (child.itemConfig?.additionalParents) {
                    child.itemConfig.additionalParents = child.itemConfig.additionalParents.filter(p => p !== nodeId);
                }
                if (child.processConfig?.additionalParents) {
                    child.processConfig.additionalParents = child.processConfig.additionalParents.filter(p => p !== nodeId);
                }
            });
        } else if (portType === 'mirror' || portType === 'in-render' || portType === 'out-render') {
            if (ShotDesigner.currentAsset.connections) {
                ShotDesigner.currentAsset.connections = ShotDesigner.currentAsset.connections.filter(c =>
                    !(c.from === nodeId || c.to === nodeId)
                );
            }
        }

        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
        ShotDesigner.updatePreview();
    },

    removeSpecificConnection: (fromId, toId, fromPort, toPort) => {
        const toNode = ShotDesigner.currentAsset.nodes.find(n => n.id === toId);
        if (toNode) {
            if (toNode.parent === fromId) toNode.parent = null;
            if (toNode.parentOnline === fromId) toNode.parentOnline = null;
            if (toNode.itemConfig?.additionalParents) {
                toNode.itemConfig.additionalParents = toNode.itemConfig.additionalParents.filter(id => id !== fromId);
            }
            if (toNode.processConfig?.additionalParents) {
                toNode.processConfig.additionalParents = toNode.processConfig.additionalParents.filter(id => id !== fromId);
            }
        }
        if (ShotDesigner.currentAsset.connections) {
            ShotDesigner.currentAsset.connections = ShotDesigner.currentAsset.connections.filter(c =>
                !(c.from === fromId && c.to === toId)
            );
        }
        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
        ShotDesigner.updatePreview();
    },

    drawDraftConnection: (parent, endPos, svgGroup, fromPort) => {
        const fromPoint = ShotDesigner.getDotPosition(parent, fromPort);
        const cX = endPos.x;
        const cY = endPos.y;

        const d = `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x + 50} ${fromPoint.y}, ${cX - 50} ${cY}, ${cX} ${cY}`;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "connector draft");
        path.setAttribute("stroke-width", 2 / ShotDesigner.zoomLevel);
        svgGroup.appendChild(path);
    },

    getDotPosition: (node, type) => {
        const x = node.x;
        const y = node.y;
        const width = 150; // Default node width
        const height = 70; // Default node height (approx)

        // These values should ideally be dynamic based on actual node element size
        // For now, use fixed offsets relative to node's top-left (x,y)
        if (type === 'out') return { x: x + width, y: y + height / 2 };
        if (type === 'in' || type === 'in-multi-item' || type === 'in-multi-process') return { x: x, y: y + height / 2 };
        if (type === 'in-online') return { x: x, y: y + height * 0.25 };
        if (type === 'in-local') return { x: x, y: y + height * 0.75 };
        if (type === 'mirror') {
            const isMedia = node.y >= 0;
            // Mirror dot is at the top or bottom center of the node
            return { x: x + width / 2, y: isMedia ? y : y + height };
        }
        if (type === 'in-render') {
            const isMedia = node.y >= 0;
            // Same as mirror but maybe reuse? No, let's keep separate.
            // Move it slightly to the left relative to center if mirror is also present?
            // Let's just put it at 33% width if both could exist.
            const offset = (node.isMirrorOn) ? (width * 0.33) : (width / 2);
            return { x: x + offset, y: isMedia ? y : y + height };
        }
        if (type === 'out-render') {
            return { x: x + width, y: y + height * 0.25 };
        }
        return { x: x, y: y }; // Fallback
    },

    // --- INTERACTION ---
    selectNode: (id, isShift = false) => {
        if (!id) {
            ShotDesigner.selectedNodeIds = [];
        } else if (!isShift) {
            ShotDesigner.selectedNodeIds = [id];
        } else {
            const idx = ShotDesigner.selectedNodeIds.indexOf(id);
            if (idx === -1) {
                ShotDesigner.selectedNodeIds.push(id);
            } else {
                ShotDesigner.selectedNodeIds.splice(idx, 1);
            }
        }

        // Single selection compatibility
        ShotDesigner.selectedNodeId = ShotDesigner.selectedNodeIds.length === 1 ? ShotDesigner.selectedNodeIds[0] : null;

        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
        ShotDesigner.updatePreview();
    },

    startDragNode: (e, node) => {
        ShotDesigner.isDraggingNode = true;
        ShotDesigner.dragNode = node;
        ShotDesigner.dragLastPos = { x: e.clientX, y: e.clientY };
    },

    // Connection Logic
    // onDotOutDown and onDotInDown are replaced by a more generic onCanvasMouseDown/Up for dots
    // The logic for starting a connection is now handled by onCanvasMouseDown if it hits a dot.

    onCanvasMouseDown: (e) => {
        const isShift = e.shiftKey;

        // ALT + Drag = PAN
        if (e.altKey || e.button === 1) {
            ShotDesigner.isPanning = true;
            ShotDesigner.panStart = { x: e.clientX, y: e.clientY };
            document.body.style.cursor = 'grabbing';
        } else if (e.target.classList.contains('sd-dot')) {
            const dot = e.target;
            const nodeId = dot.getAttribute('data-node-id');
            const dotType = dot.getAttribute('data-type');
            const node = ShotDesigner.currentAsset.nodes.find(n => n.id === nodeId);
            if (!node) return;

            // Clic derecho sobre el dot = Desconectar
            if (e.button === 2) {
                ShotDesigner.disconnectPort(nodeId, dotType);
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            ShotDesigner.isConnecting = true;
            ShotDesigner.connectionStartNode = node;
            ShotDesigner.connectionStartPoint = dotType;
            const rect = document.getElementById('sd-canvas-area').getBoundingClientRect();
            ShotDesigner.connectionCurrentPos = {
                x: (e.clientX - rect.left - ShotDesigner.panOffset.x) / ShotDesigner.zoomLevel,
                y: (e.clientY - rect.top - ShotDesigner.panOffset.y) / ShotDesigner.zoomLevel
            };
            document.body.style.cursor = 'crosshair';
            e.stopPropagation();
        } else if (e.target.closest('.sd-node')) {
            const nodeEl = e.target.closest('.sd-node');
            const nodeId = nodeEl.getAttribute('data-id');
            const node = ShotDesigner.currentAsset.nodes.find(n => n.id === nodeId);

            if (isShift) {
                ShotDesigner.selectNode(nodeId, true);
                ShotDesigner.isDraggingNode = true;
                ShotDesigner.dragNode = node;
                ShotDesigner.dragLastPos = { x: e.clientX, y: e.clientY };
                e.stopPropagation();
                return;
            } else {
                if (!ShotDesigner.selectedNodeIds.includes(nodeId)) {
                    ShotDesigner.selectNode(nodeId, false);
                }
            }

            ShotDesigner.isDraggingNode = true;
            ShotDesigner.dragNode = node;
            ShotDesigner.dragLastPos = { x: e.clientX, y: e.clientY };
            e.stopPropagation();
        } else {
            // Clicked on empty space
            if (!isShift) ShotDesigner.selectNode(null);

            // Start Box Selection
            ShotDesigner.isBoxSelecting = true;
            const rect = document.getElementById('sd-canvas-area').getBoundingClientRect();
            ShotDesigner.boxStart = {
                x: (e.clientX - rect.left - ShotDesigner.panOffset.x) / ShotDesigner.zoomLevel,
                y: (e.clientY - rect.top - ShotDesigner.panOffset.y) / ShotDesigner.zoomLevel
            };
            ShotDesigner.boxCurrent = { ...ShotDesigner.boxStart };
        }
    },

    onCanvasMouseMove: (e) => {
        const rect = document.getElementById('sd-canvas-area').getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (ShotDesigner.isPanning) {
            ShotDesigner.panOffset.x += (e.clientX - ShotDesigner.panStart.x);
            ShotDesigner.panOffset.y += (e.clientY - ShotDesigner.panStart.y);
            ShotDesigner.panStart = { x: e.clientX, y: e.clientY };
            ShotDesigner.renderCanvas();
        } else if (ShotDesigner.isDraggingNode) {
            const dx = (e.clientX - ShotDesigner.dragLastPos.x) / ShotDesigner.zoomLevel;
            const dy = (e.clientY - ShotDesigner.dragLastPos.y) / ShotDesigner.zoomLevel;

            // Move all selected nodes
            ShotDesigner.selectedNodeIds.forEach(id => {
                const n = ShotDesigner.currentAsset.nodes.find(node => node.id === id);
                if (n) {
                    n.x += dx;
                    n.y += dy;
                }
            });

            ShotDesigner.dragLastPos = { x: e.clientX, y: e.clientY };
            ShotDesigner.renderCanvas();
        } else if (ShotDesigner.isConnecting) {
            const canvasX = (mouseX - ShotDesigner.panOffset.x) / ShotDesigner.zoomLevel;
            const canvasY = (mouseY - ShotDesigner.panOffset.y) / ShotDesigner.zoomLevel;
            ShotDesigner.connectionCurrentPos = { x: canvasX, y: canvasY };

            // Proximity Highlight
            document.querySelectorAll('.sd-dot').forEach(d => d.classList.remove('active'));
            const rect = document.getElementById('sd-canvas-area').getBoundingClientRect();
            const nearest = ShotDesigner.findNearestDot(e.clientX, e.clientY, 40);
            if (nearest) {
                nearest.classList.add('active');
            }

            ShotDesigner.renderCanvas(); // Redraw draft line
        } else if (ShotDesigner.isBoxSelecting) {
            ShotDesigner.boxCurrent = {
                x: (e.clientX - rect.left - ShotDesigner.panOffset.x) / ShotDesigner.zoomLevel,
                y: (e.clientY - rect.top - ShotDesigner.panOffset.y) / ShotDesigner.zoomLevel
            };
            ShotDesigner.renderCanvas();
        }
    },

    onCanvasMouseUp: (e) => {
        if (ShotDesigner.isBoxSelecting) {
            const isShift = e.shiftKey;
            const minX = Math.min(ShotDesigner.boxStart.x, ShotDesigner.boxCurrent.x);
            const maxX = Math.max(ShotDesigner.boxStart.x, ShotDesigner.boxCurrent.x);
            const minY = Math.min(ShotDesigner.boxStart.y, ShotDesigner.boxCurrent.y);
            const maxY = Math.max(ShotDesigner.boxStart.y, ShotDesigner.boxCurrent.y);

            const nodesInBox = ShotDesigner.currentAsset.nodes.filter(n => {
                return n.x >= minX - 150 && n.x <= maxX && n.y >= minY - 70 && n.y <= maxY;
            });

            if (!isShift) ShotDesigner.selectedNodeIds = [];
            nodesInBox.forEach(n => {
                if (!ShotDesigner.selectedNodeIds.includes(n.id)) {
                    ShotDesigner.selectedNodeIds.push(n.id);
                }
            });

            // Compatibility
            ShotDesigner.selectedNodeId = ShotDesigner.selectedNodeIds.length === 1 ? ShotDesigner.selectedNodeIds[0] : null;
            ShotDesigner.isBoxSelecting = false;
            ShotDesigner.renderCanvas();
            ShotDesigner.updateSidebar();
            ShotDesigner.updatePreview();
        }

        if (ShotDesigner.isPanning) {
            ShotDesigner.isPanning = false;
            document.body.style.cursor = 'default';
        }

        if (ShotDesigner.isDraggingNode) {
            ShotDesigner.isDraggingNode = false;
            ShotDesigner.dragNode = null;
            ShotDesigner.pushHistory();
            ShotDesigner.saveAsset();
        }

        if (ShotDesigner.isConnecting) {
            // Check for nearest dot (magnetic snap)
            const dot = ShotDesigner.findNearestDot(e.clientX, e.clientY, 40);
            document.querySelectorAll('.sd-dot').forEach(d => d.classList.remove('active'));

            if (dot) {
                const nodeId = dot.getAttribute('data-node-id');
                const dotType = dot.getAttribute('data-type');
                const node = ShotDesigner.currentAsset.nodes.find(n => n.id === nodeId);

                if (ShotDesigner.connectionStartNode) {
                    const startType = ShotDesigner.connectionStartPoint;
                    const startNode = ShotDesigner.connectionStartNode;

                    if ((startType === 'mirror' && dotType !== 'mirror') || (startType !== 'mirror' && dotType === 'mirror')) {
                        console.warn("Mirror dots can only connect to other Mirror dots.");
                    } else if (startNode.id === nodeId) {
                        console.warn("Cannot connect a node to itself.");
                    } else {
                        let fromId, toId, fPort, tPort;
                        if (startType.includes('out') || startType === 'mirror') {
                            fromId = startNode.id; toId = nodeId; fPort = startType; tPort = dotType;
                        } else {
                            fromId = nodeId; toId = startNode.id; fPort = dotType; tPort = startType;
                        }
                        ShotDesigner.addConnection(fromId, toId, fPort, tPort);
                    }
                }
            }

            ShotDesigner.isConnecting = false;
            ShotDesigner.connectionStartNode = null;
            ShotDesigner.connectionStartPoint = null;
            document.body.style.cursor = 'default';
            document.querySelectorAll('.sd-dot').forEach(el => el.classList.remove('active'));
            ShotDesigner.renderCanvas();
        }
    },

    onCanvasWheel: (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = -Math.sign(e.deltaY) * zoomSpeed;
        const newZoom = Math.min(Math.max(0.2, ShotDesigner.zoomLevel + delta), 3.0);

        // Simple zoom for now (Top-Left origin, shifts view)
        ShotDesigner.zoomLevel = newZoom;
        ShotDesigner.renderCanvas();
    },

    onKeyDown: (e) => {
        // Only if Shot Designer is active view
        if (document.getElementById('view-shot-designer').style.display === 'none') return;

        // If typing in input, don't trigger global shortcuts
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) {
                    ShotDesigner.redo();
                } else {
                    ShotDesigner.undo();
                }
                return;
            } else if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                ShotDesigner.redo();
                return;
            } else if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                ShotDesigner.duplicateSelected();
                return;
            } else if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                ShotDesigner.copySelected();
                return;
            } else if (e.key === 'v' || e.key === 'V') {
                e.preventDefault();
                ShotDesigner.pasteSelected();
                return;
            }
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            ShotDesigner.deleteSelected();
        }

        if (e.key === 'Enter') {
            if (ShotDesigner.selectedNodeId) {
                ShotDesigner.startRenaming(ShotDesigner.selectedNodeId);
            }
        }
    },

    // Link Logic
    connectNodes: (parentId, childId, type = 'local') => {
        const child = ShotDesigner.currentAsset.nodes.find(n => n.id === childId);
        if (child) {
            // Check loop loops? (Simple parent check)
            if (parentId === child.id) return;

            // Allow Online connection only if Node is Sync Point
            if (type === 'online' && !child.isSyncPoint) {
                console.warn("Cannot connect Online path to non-SyncPoint node.");
                return;
            }

            // Assign to correct parent prop
            if (type === 'online') {
                child.parentOnline = parentId;
            } else {
                // Check if Multi-Parent allowed (Item)
                if (child.isItem && child.itemConfig && child.itemConfig.allowMultiParent) {
                    if (!child.itemConfig.additionalParents) child.itemConfig.additionalParents = [];
                    // Check duplicate
                    if (child.parent !== parentId && !child.itemConfig.additionalParents.includes(parentId)) {
                        if (!child.parent) {
                            child.parent = parentId;
                        } else {
                            child.itemConfig.additionalParents.push(parentId);
                        }
                    }
                }
                // Check if Multi-Parent allowed (Process)
                else if (child.isProcess && child.processConfig && child.processConfig.parentItem) {
                    if (!child.processConfig.additionalParents) child.processConfig.additionalParents = [];
                    // For Process Parent Item, we expect inputs to be ITEMS.
                    if (child.parent !== parentId && !child.processConfig.additionalParents.includes(parentId)) {
                        if (!child.parent) {
                            child.parent = parentId;
                        } else {
                            child.processConfig.additionalParents.push(parentId);
                        }
                    }
                }
                else {
                    child.parent = parentId;
                }
            }

            ShotDesigner.renderCanvas(); // Force redraw
            ShotDesigner.pushHistory();
            ShotDesigner.saveAsset();
        }
    },

    addConnection: (fromId, toId, fromPort, toPort) => {
        if (!ShotDesigner.currentAsset.connections) ShotDesigner.currentAsset.connections = [];

        // Rules
        if (fromPort === 'mirror' && toPort === 'mirror') {
            // Mirror logic: 1 to 1 link
            // Remove existing mirror links for both nodes
            ShotDesigner.currentAsset.connections = ShotDesigner.currentAsset.connections.filter(c =>
                !((c.from === fromId || c.to === fromId || c.from === toId || c.to === toId) && (c.fromPort === 'mirror' || c.toPort === 'mirror'))
            );

            ShotDesigner.currentAsset.connections.push({ from: fromId, to: toId, fromPort: fromPort, toPort: toPort });

            // Initial sync: from -> to
            ShotDesigner.mirrorSync(fromId, toId);
        } else {
            // Standard Connection Logic (Mapping to existing parent/parentOnline props for compatibility)
            const source = ShotDesigner.currentAsset.nodes.find(n => n.id === fromId);
            const target = ShotDesigner.currentAsset.nodes.find(n => n.id === toId);

            if (target && source) {
                // Prevent loops
                if (fromId === toId) return;

                if (toPort === 'in-online') {
                    target.parentOnline = fromId;
                } else if (toPort === 'in-multi-item') {
                    if (!target.itemConfig) target.itemConfig = {};
                    if (!target.itemConfig.additionalParents) target.itemConfig.additionalParents = [];
                    if (!target.itemConfig.additionalParents.includes(fromId)) target.itemConfig.additionalParents.push(fromId);
                } else if (toPort === 'in-multi-process') {
                    if (!target.processConfig) target.processConfig = {};
                    if (!target.processConfig.additionalParents) target.processConfig.additionalParents = [];
                    if (!target.processConfig.additionalParents.includes(fromId)) target.processConfig.additionalParents.push(fromId);
                } else if (fromPort === 'out-render' && toPort === 'in-render') {
                    if (!ShotDesigner.currentAsset.connections) ShotDesigner.currentAsset.connections = [];
                    // Check duplicate
                    const exists = ShotDesigner.currentAsset.connections.some(c => c.from === fromId && c.to === toId && c.fromPort === fromPort);
                    if (!exists) {
                        ShotDesigner.currentAsset.connections.push({ from: fromId, to: toId, fromPort: fromPort, toPort: toPort });
                    }
                } else {
                    target.parent = fromId;
                }
            }
        }
        ShotDesigner.renderCanvas();
        ShotDesigner.pushHistory();
        ShotDesigner.saveAsset();
    },

    mirrorSync: (sourceId, targetId) => {
        const source = ShotDesigner.currentAsset.nodes.find(n => n.id === sourceId);
        const target = ShotDesigner.currentAsset.nodes.find(n => n.id === targetId);
        if (!source || !target) return;

        // Sync properties
        target.name = source.name;
        target.isVariable = source.isVariable;
        target.variableName = source.variableName;
        target.exampleValue = source.exampleValue;
        target.isEpisode = source.isEpisode;
        target.isScene = source.isScene;
        target.isShot = source.isShot;
        target.isProcess = source.isProcess;

        // Sync Name Config
        if (source.nameConfig) {
            target.nameConfig = JSON.parse(JSON.stringify(source.nameConfig));
        }

        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
    },

    // Recursively check if a node eventually feeds into an Online Sync Point
    isFeedingOnline: (nodeId, visited = new Set()) => {
        if (visited.has(nodeId)) return false; // Cycle prevention
        visited.add(nodeId);

        // Find all nodes that have THIS node as a parent (children)
        // If any child is a Sync Point AND uses this node as `parentOnline`, then YES.
        // If any child is a Normal Node AND usages this node as `parent` AND that child isFeedingOnline, then YES.

        const children = ShotDesigner.currentAsset.nodes.filter(n => n.parent === nodeId || n.parentOnline === nodeId);

        for (const child of children) {
            // Case 1: Child is Sync Point
            if (child.isSyncPoint) {
                if (child.parentOnline === nodeId) return true;
                // Stop propagation if connected via Local
                continue;
            }

            // Case 2: Normal Node - Recurse
            if (child.parent === nodeId) {
                if (ShotDesigner.isFeedingOnline(child.id, visited)) return true;
            }
        }

        return false;
    },

    isFeedingLocalSync: (nodeId, visited = new Set()) => {
        if (visited.has(nodeId)) return false;
        visited.add(nodeId);

        // Only check 'parent' connection (Local)
        const children = ShotDesigner.currentAsset.nodes.filter(n => n.parent === nodeId);

        for (const child of children) {
            // Case 1: Child is Sync Point
            if (child.isSyncPoint) {
                if (child.parent === nodeId) return true;
                continue;
            }

            if (child.parent === nodeId) {
                if (ShotDesigner.isFeedingLocalSync(child.id, visited)) return true;
            }
        }

        return false;
    },

    checkIsAncestor: (potentialAncestorId, nodeId) => {
        // TODO: Update to check both parent and parentOnline
        let curr = ShotDesigner.currentAsset.nodes.find(n => n.id === nodeId);
        while (curr) {
            if (curr.id === potentialAncestorId) return true;
            // Check both parents?
            // If checking ancestry, we usually check Primary parent.
            // But Sync Point has two parents.
            // If we are checking for Cycles, we must check BOTH.

            // This simple while loop only checks 'parent'.
            // Needs BFS/DFS to check cycle properly with dual parents.
            // For now, let's just leave logic as is for cycle check or update briefly if critical.
            // Simple update:
            if (curr.parentOnline && ShotDesigner.checkIsAncestor(potentialAncestorId, curr.parentOnline)) return true; // Recursion for online branch

            curr = ShotDesigner.currentAsset.nodes.find(n => n.id === curr.parent);
        }
        return false;
    },



    // --- SIDEBAR LOGIC ---
    updateSidebar: () => {
        const title = document.getElementById('sd-sidebar-title');
        const content = document.getElementById('sd-sidebar-content');
        if (!title || !content) return;

        if (ShotDesigner.selectedNodeIds.length > 1) {
            title.innerText = "Configuración Múltiple";
            content.innerHTML = `
                <div style="padding:10px; color:#666; font-size:0.8rem; text-align:center;">
                    ${ShotDesigner.selectedNodeIds.length} nodos seleccionados. Las ediciones masivas no están disponibles actualmente.
                </div>
            `;
            return;
        }

        if (ShotDesigner.selectedNodeId) {
            const node = ShotDesigner.currentAsset.nodes.find(n => n.id === ShotDesigner.selectedNodeId);
            title.innerText = "Configuración de Nodo";
            content.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <!-- HEADER: NAME & TYPE -->
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="flex:1;">
                            <label class="prop-label" style="display:block; font-size:0.65em; font-weight:bold; color:#aaa; text-transform:uppercase; margin-bottom:2px;">Nombre</label>
                            <input class="prop-input" style="width:100%; box-sizing:border-box; font-weight:bold; font-size:0.9em;" 
                                   value="${node.name}" onchange="ShotDesigner.updateNodeProp('${node.id}', 'name', this.value)">
                        </div>
                        <div style="width:100px;">
                            <label class="prop-label" style="display:block; font-size:0.65em; font-weight:bold; color:#aaa; text-transform:uppercase; margin-bottom:2px;">Tipo</label>
                            <select class="prop-input" style="width:100%; border-color:#555;" onchange="ShotDesigner.updateNodeProp('${node.id}', 'type', this.value)">
                                <option value="folder" ${node.type === 'folder' ? 'selected' : ''}>Carpeta</option>
                                <option value="unit" ${node.type === 'unit' ? 'selected' : ''}>Unidad</option>
                                <option value="file" ${node.type === 'file' ? 'selected' : ''}>Archivo</option>
                            </select>
                        </div>
                    </div>



                    <hr style="border: 0; border-top: 2px solid #333; margin: 2px 0; width:100%;">

                    <!-- SPECIAL OPTIONS -->
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label class="prop-label" style="font-size:0.65em; color:#4FC3F7; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">Special Options</label>
                        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:nowrap; gap:10px;">
                            <div style="display:flex; align-items:center;">
                                <label class="prop-label" style="margin-right:4px; color:#E040FB; font-weight:bold; font-size:0.85em;">Mirror</label>
                                <input type="checkbox" ${node.isMirrorOn ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isMirrorOn', this.checked); ShotDesigner.updateSidebar();">
                            </div>
                            <div style="display:flex; align-items:center;">
                                <label class="prop-label" style="margin-right:4px; font-size:0.85em; opacity:0.8;">Sync</label>
                                <input type="checkbox" ${node.isSyncPoint ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isSyncPoint', this.checked)">
                            </div>
                            <div style="display:flex; align-items:center;">
                                <label class="prop-label" style="margin-right:4px; font-size:0.85em; opacity:0.8; color:#2196F3;">Fijo</label>
                                <input type="checkbox" ${!node.isVariable ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isVariable', !this.checked); ShotDesigner.updateSidebar();">
                            </div>
                            <div style="display:flex; align-items:center;">
                                <label class="prop-label" style="margin-right:4px; font-size:0.85em; opacity:0.8;">Vari</label>
                                <input type="checkbox" ${node.isVariable ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isVariable', this.checked); ShotDesigner.updateSidebar();">
                            </div>
                        </div>

                        ${node.isVariable ? `
                        <div style="display:flex; align-items:center; gap:10px; margin-top:5px;">
                            <label class="prop-label" style="font-size:0.65em; font-weight:bold; color:#aaa; min-width:65px; text-transform:uppercase;">VAR NAME</label>
                            <input class="prop-input" style="flex:1; font-size:0.85em; background:#1a1a1a; border-color:#444; color:white;" 
                                   value="${node.variableName || ''}" 
                                   onchange="ShotDesigner.updateNodeProp('${node.id}', 'variableName', this.value)">
                        </div>
                        ` : ''}

                        ${(node.isVariable || node.isCategory || node.isProcess) ? `
                        <div style="display:flex; align-items:center; gap:10px; margin-top:2px;">
                            <label class="prop-label" style="font-size:0.65em; font-weight:bold; color:#aaa; min-width:65px; text-transform:uppercase;">EXAMPLE</label>
                            <input class="prop-input" style="flex:1; font-size:0.85em; background:#1a1a1a; border-color:#444; color:white;" 
                                   placeholder="..." 
                                   value="${node.exampleValue || ''}" 
                                   onchange="ShotDesigner.updateNodeProp('${node.id}', 'exampleValue', this.value)">
                        </div>
                        ` : ''}
                    </div>

                    <hr style="border: 0; border-top: 2px solid #333; margin: 5px 0; width:100%;">

                    <!-- PIPE OPTIONS -->
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label class="prop-label" style="font-size:0.65em; color:#4FC3F7; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">Pipe Options</label>
                        
                        <!-- CLIENT / PROJECT ROLES -->
                        <div style="display:flex; align-items:center; justify-content: space-around; background:#222; padding:5px; border-radius:4px;">
                            <div style="display:flex; align-items:center;" title="Define este nodo como el nivel Cliente">
                                <label class="prop-label" style="margin-right:5px; color:#4CAF50; font-size:0.85em;">Es Cliente</label>
                                <input type="checkbox" ${node.isClientNode ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isClientNode', this.checked)">
                            </div>
                            <div style="display:flex; align-items:center;" title="Define este nodo como el nivel Proyecto">
                                <label class="prop-label" style="margin-right:5px; color:#2196F3; font-size:0.85em;">Es Proyecto</label>
                                <input type="checkbox" ${node.isProjectNode ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isProjectNode', this.checked); ShotDesigner.updateSidebar();">
                            </div>
                        </div>

                        ${node.isProjectNode ? `
                        <div style="margin-top:4px; background:#241d08; border:1px solid #ff9800; padding:6px; border-radius:4px; display:flex; flex-direction:column; gap:4px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <label class="prop-label" style="font-size:0.65em; font-weight:bold; color:#FFB74D; text-transform:uppercase; margin-bottom:0;">NICK VAR (Código Corto Proyecto)</label>
                                <div style="display:flex; align-items:center; gap:4px;">
                                    <label class="prop-label" style="font-size:0.7em; color:#bbb; margin-bottom:0;">Activar</label>
                                    <input type="checkbox" ${node.hasNickVar ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'hasNickVar', this.checked); ShotDesigner.updateSidebar();">
                                </div>
                            </div>
                            ${node.hasNickVar ? `
                            <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                                <div style="flex:1;">
                                    <label class="prop-label" style="font-size:0.6em; color:#aaa;">VAR NAME</label>
                                    <input class="prop-input" style="width:100%; font-size:0.8em; background:#111; color:#FFD54F;" 
                                           placeholder="NICK" value="${node.nickVarName || 'NICK'}" 
                                           onchange="ShotDesigner.updateNodeProp('${node.id}', 'nickVarName', this.value); ShotDesigner.updateSidebar();">
                                </div>
                                <div style="flex:1;">
                                    <label class="prop-label" style="font-size:0.6em; color:#aaa;">EXAMPLE</label>
                                    <input class="prop-input" style="width:100%; font-size:0.8em; background:#111; color:#fff;" 
                                           placeholder="SURF" value="${node.nickExample || ''}" 
                                           onchange="ShotDesigner.updateNodeProp('${node.id}', 'nickExample', this.value); ShotDesigner.updateSidebar();">
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        ` : ''}

                        <!-- SEMANTIC ROLES -->
                        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:nowrap; gap:5px; margin-top:2px;">
                            <div style="display:flex; align-items:center;">
                                <label class="prop-label" style="margin-right:4px; font-size:0.65em; font-weight:bold; color:#aaa; text-transform:uppercase;">Episodio</label>
                                <input type="checkbox" ${node.isEpisode ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isEpisode', this.checked); ShotDesigner.updateSidebar();">
                            </div>
                            <div style="display:flex; align-items:center;">
                                <label class="prop-label" style="margin-right:4px; font-size:0.65em; font-weight:bold; color:#aaa; text-transform:uppercase;">Escena</label>
                                <input type="checkbox" ${node.isScene ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isScene', this.checked); ShotDesigner.updateSidebar();">
                            </div>
                            <div style="display:flex; align-items:center;">
                                <label class="prop-label" style="margin-right:4px; font-size:0.65em; font-weight:bold; color:#aaa; text-transform:uppercase;">Shot</label>
                                <input type="checkbox" ${node.isShot ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isShot', this.checked); ShotDesigner.updateSidebar();">
                            </div>
                            <div style="display:flex; align-items:center;">
                                <label class="prop-label" style="margin-right:4px; font-size:0.65em; font-weight:bold; color:#aaa; text-transform:uppercase;">Proceso</label>
                                <input type="checkbox" ${node.isProcess ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isProcess', this.checked); ShotDesigner.updateSidebar();">
                            </div>
                        </div>

                        ${node.isShot ? `
                        <div style="margin-top:4px; background:#0a2233; border:1px solid #00b0ff; padding:6px; border-radius:4px; display:flex; flex-direction:column; gap:4px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <label class="prop-label" style="font-size:0.65em; font-weight:bold; color:#40C4FF; text-transform:uppercase; margin-bottom:0;">SHOT INPUT VAR (Variable del Número)</label>
                            </div>
                            <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                                <div style="flex:1;">
                                    <label class="prop-label" style="font-size:0.6em; color:#aaa;">VAR ENTRADA</label>
                                    <input class="prop-input" style="width:100%; font-size:0.8em; background:#111; color:#40C4FF;" 
                                           placeholder="SHOT" value="${node.shotInputVar || 'SHOT'}" 
                                           onchange="ShotDesigner.updateNodeProp('${node.id}', 'shotInputVar', this.value); ShotDesigner.updateSidebar();">
                                </div>
                                <div style="flex:1;">
                                    <label class="prop-label" style="font-size:0.6em; color:#aaa;">EXAMPLE NUM</label>
                                    <input class="prop-input" style="width:100%; font-size:0.8em; background:#111; color:#fff;" 
                                           placeholder="1130" value="${node.exampleValue || '1130'}" 
                                           onchange="ShotDesigner.updateNodeProp('${node.id}', 'exampleValue', this.value); ShotDesigner.updateSidebar();">
                                </div>
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <hr style="border: 0; border-top: 2px solid #333; margin: 5px 0; width:100%;">

                    <!-- PRODUCTION FILES OPTION -->
                    ${(node.type === 'file' || node.type === 'folder') ? `
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <label class="prop-label" style="font-size:0.65em; color:#4FC3F7; font-weight:bold; text-transform:uppercase; letter-spacing:1px;">Production Files Option</label>
                        <div style="display:flex; align-items:center; justify-content: space-around; background:#332; padding:5px; border-radius:4px; border:1px solid #440;">
                            ${node.type === 'file' ? `
                                <div style="display:flex; align-items:center;" title="Indica que este archivo es un render de software">
                                    <label class="prop-label" style="margin-right:5px; color:#FFD600; font-size:0.85em;">RenderFile</label>
                                    <input type="checkbox" ${node.isRenderFile ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isRenderFile', this.checked); ShotDesigner.renderCanvas();">
                                </div>
                                <div style="display:flex; align-items:center;" title="Habilita una salida de render para conectar a una RenderFolder">
                                    <label class="prop-label" style="margin-right:5px; color:#FF9800; font-size:0.85em;">Scene</label>
                                    <input type="checkbox" ${node.isScene ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isScene', this.checked); ShotDesigner.renderCanvas();">
                                </div>
                            ` : ''}
                            ${node.type === 'folder' ? `
                                <div style="display:flex; align-items:center;" title="Contenedor de renders con entrada dedicada">
                                    <label class="prop-label" style="margin-right:5px; color:#FFD600; font-size:0.85em;">RenderFolder</label>
                                    <input type="checkbox" ${node.isRenderFolder ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isRenderFolder', this.checked); ShotDesigner.renderCanvas();">
                                </div>
                            ` : ''}
                            <div style="display:flex; align-items:center;" title="Marca este nodo como FullRes / Entrega Final">
                                <label class="prop-label" style="margin-right:5px; color:#FFCA28; font-size:0.85em;">FullRes</label>
                                <input type="checkbox" ${node.isFinalRender ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isFinalRender', this.checked); ShotDesigner.renderCanvas();">
                            </div>
                            <div style="display:flex; align-items:center;" title="Marca este nodo como Mov / Video de compresión">
                                <label class="prop-label" style="margin-right:5px; color:#42A5F5; font-size:0.85em;">Mov</label>
                                <input type="checkbox" ${node.isCompressionRender ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isCompressionRender', this.checked); ShotDesigner.renderCanvas();">
                            </div>
                            <div style="display:flex; align-items:center;" title="Generación externa por TCL/Nuke. Pipeta documenta su ubicación pero NO crea carpetas vacías en disco.">
                                <label class="prop-label" style="margin-right:5px; color:#00BCD4; font-size:0.85em;">TCL Ext</label>
                                <input type="checkbox" ${node.isExternalTcl ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isExternalTcl', this.checked); ShotDesigner.renderCanvas();">
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- SPECIFIC CONFIGS -->
                    <div style="margin-top:5px; display:flex; flex-direction:column; gap:8px;">
                        
                        <!-- SHOT CONFIG (Legacy Item) -->
                        ${node.isShot ? `
                        <div class="panel-section" style="border:1px solid #444; padding:5px; border-radius:4px;">
                            <label class="prop-label" style="color:#cf6bee; font-weight:bold;">Configuración de Shot</label>
                            
                            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">Focus Asset</label>
                                <input type="checkbox" ${node.isAssetFocus ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isAssetFocus', this.checked)">
                            </div>
                            
                            <!-- COSMETIC NAME (Only if Variable) -->
                            ${node.isVariable ? `
                            <div style="display:flex; flex-direction:column; margin:5px 0;">
                                <label class="prop-label" style="font-size:0.75em;">Cosmetic Name (App Legend)</label>
                                <input class="prop-input" style="color:white;" value="${node.itemConfig?.cosmeticName || ''}" placeholder="Nombre de item..." onchange="ShotDesigner.updateNodeProp('${node.id}', 'itemConfig.cosmeticName', this.value)">
                            </div>
                            ` : ''}

                            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">Parent Category</label>
                                <input type="checkbox" ${node.itemConfig?.allowMultiParent ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'itemConfig.allowMultiParent', this.checked)">
                            </div>
                        </div>
                        ` : ''}

                        <!-- PROCESS CONFIG -->
                        ${node.isProcess ? `
                        <div class="panel-section" style="border:1px solid #444; padding:5px; border-radius:4px;">
                             <label class="prop-label" style="color:#cf6bee; font-weight:bold;">Configuración de Proceso</label>
                             
                             <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">Default (On by default)</label>
                                <input type="checkbox" ${(node.processConfig?.isDefault !== false) ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'processConfig.isDefault', this.checked)">
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">Parent Item (Multi-Input)</label>
                                <input type="checkbox" ${node.processConfig?.parentItem ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'processConfig.parentItem', this.checked)">
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">File Container</label>
                                <input type="checkbox" ${node.isFileContainer ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'isFileContainer', this.checked)">
                            </div>
                        </div>
                        ` : ''}

                         <!-- NAME CONSTRUCTOR + FORCE UPPER -->
                        <div class="panel-section" style="border:1px solid #444; padding:5px; border-radius:4px; margin-top:5px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <input type="checkbox" ${node.nameConfig?.enabled ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'nameConfig.enabled', this.checked); ShotDesigner.updateSidebar();">
                                    <label class="prop-label" style="color:#00E676; font-weight:bold; letter-spacing:0.5px; margin-bottom:0;">NAME CONSTRUCTOR</label>
                                </div>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <label class="prop-label" style="font-size:0.7em; margin-bottom:0; color:#aaa; text-transform:uppercase;">Mayúsculas</label>
                                    <input type="checkbox" ${node.nameConfig?.forceUpper ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'nameConfig.forceUpper', this.checked); ShotDesigner.updateSidebar();">
                                </div>
                            </div>

                            ${node.nameConfig?.enabled ? `
                                <div style="display:flex; flex-direction:column; gap:5px; margin-top:5px;">
                                    <input class="prop-input" style="color:white; background:#111; border-color:#333;" id="nc-pattern-${node.id}" value="${node.nameConfig?.pattern || ''}" 
                                        placeholder="[ASSET]_[PROCESO]_[version]"
                                        onchange="ShotDesigner.updateNodeProp('${node.id}', 'nameConfig.pattern', this.value)">
                                    
                                    <div style="display:flex; flex-direction:column; gap:5px; margin-top:5px;">
                                        <label class="prop-label" style="font-size:0.65em; font-weight:bold; color:#aaa; text-transform:uppercase;">Tags Disponibles</label>
                                        <div style="display:flex; gap:3px; flex-wrap:wrap;">
                                            <!-- Dynamic Variables and Standard Tags -->
                                            ${(() => {
                        const vars = new Set();
                        const btns = [];
                        ShotDesigner.currentAsset.nodes.forEach(n => {
                            if (n.isVariable || n.isEpisode || n.isScene || n.isShot || n.isProjectNode || n.isClientNode) {
                                const vName = ShotDesigner.getEffectiveVarName(n);
                                if (vName === 'ASSET') return;
                                if (!vars.has(vName)) {
                                    vars.add(vName);
                                    const isItem = n.isItem;
                                    const colorClass = isItem ? 'item' : 'var';
                                    btns.push(`<button class="nc-tag-btn ${colorClass}" onclick="ShotDesigner.appendNameTag('${node.id}', '[${vName}]')">[${vName}]</button>`);
                                }
                            }
                            if (n.isShot) {
                                const inVar = n.shotInputVar || 'SHOT';
                                if (!vars.has(inVar)) {
                                    vars.add(inVar);
                                    btns.push(`<button class="nc-tag-btn" style="background:#0288D1; color:white;" onclick="ShotDesigner.appendNameTag('${node.id}', '[${inVar}]')">[${inVar}]</button>`);
                                }
                            }
                            if (n.hasNickVar) {
                                const nickName = n.nickVarName || 'NICK';
                                if (!vars.has(nickName)) {
                                    vars.add(nickName);
                                    btns.push(`<button class="nc-tag-btn" style="background:#FF6D00; color:white;" onclick="ShotDesigner.appendNameTag('${node.id}', '[${nickName}]')">[${nickName}]</button>`);
                                }
                            }
                        });
                        return btns.join('');
                    })()}

                                            <button class="nc-tag-btn proc" onclick="ShotDesigner.appendNameTag('${node.id}', '[PROCESO]')">[PROC]</button>
                                            <button class="nc-tag-btn sys" onclick="ShotDesigner.appendNameTag('${node.id}', '[version]')">[VER]</button>
                                            <button class="nc-tag-btn sys" onclick="ShotDesigner.appendNameTag('${node.id}', '[SceneVersion]')">[SCE-VER]</button>
                                            <button class="nc-tag-btn sys" onclick="ShotDesigner.appendNameTag('${node.id}', '[SceneName]')">[SCE-NAM]</button>
                                            <button class="nc-tag-btn sys" onclick="ShotDesigner.appendNameTag('${node.id}', '[ext]')">[ext]</button>
                                            <button class="nc-tag-btn var" style="background:#E91E63; color:white;" onclick="ShotDesigner.addCounterTag('${node.id}')">+ Counter</button>
                                            <button class="nc-tag-btn var" style="background:#E91E63; color:white;" onclick="ShotDesigner.appendNameTag('${node.id}', '[RenderCounter###]')">+ R-Count</button>
                                        </div>
                                    </div>

                                    <!-- Allowed Extensions -->
                                    <div style="margin-top:5px; display:flex; align-items:center; gap:10px; background:#111; padding:5px; border-radius:3px; border:1px solid #222;">
                                        <label class="prop-label" style="font-size:0.65em; font-weight:bold; color:#aaa; text-transform:uppercase; margin-bottom:0; min-width:105px;">Ext. Permitidas</label>
                                        <input class="prop-input" style="flex:1; color:white; background:#222; border-color:#444; font-size:0.85em;" 
                                            value="${node.nameConfig?.allowedExtensions || ''}" 
                                            placeholder="blend, fbx, obj"
                                            onchange="ShotDesigner.updateNodeProp('${node.id}', 'nameConfig.allowedExtensions', this.value)">
                                    </div>

                                    <!-- Version Config -->
                                    <div style="margin-top:8px; border-top:1px dashed #444; padding-top:8px;">
                                        <label class="prop-label" style="font-size:0.65em; color:#4FC3F7; font-weight:bold; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:5px;">Version Config</label>
                                        <div style="display:flex; align-items:center; gap:15px; background:#111; padding:5px; border-radius:3px; border:1px solid #222;">
                                            <div style="display:flex; align-items:center; gap:5px;">
                                                <label class="prop-label" style="font-size:0.75em;">Prefix 'v'</label>
                                                <input type="checkbox" ${node.nameConfig?.versionPrefix !== false ? 'checked' : ''} onchange="ShotDesigner.updateNodeProp('${node.id}', 'nameConfig.versionPrefix', this.checked)">
                                            </div>
                                            <div style="display:flex; align-items:center; gap:8px; flex:1; justify-content:flex-end;">
                                                <label class="prop-label" style="font-size:0.75em;">Padding</label>
                                                <input type="number" min="1" max="5" value="${node.nameConfig?.versionPadding || 3}" 
                                                    style="width:45px; background:#222; color:#fff; border:1px solid #444; border-radius:3px; padding:2px 4px; font-size:0.85em;"
                                                    onchange="ShotDesigner.updateNodeProp('${node.id}', 'nameConfig.versionPadding', parseInt(this.value))">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                    </div>

                </div>
            `;
        } else {
            title.innerText = "Configuración Global";
            content.innerHTML = `
                <div style="padding:10px; color:#666; font-size:0.8rem; text-align:center;">
                    Selecciona un nodo para editar sus propiedades.
                </div>
                <div class="prop-row">
                    <label class="prop-label">Nombre del Asset</label>
                    <input class="prop-input" value="${ShotDesigner.currentAsset ? ShotDesigner.currentAsset.name : ''}">
                </div>
            `;
        }
    },

    getEffectiveVarName: (node) => {
        if (!node) return 'VAR';
        if (node.variableName && node.variableName.trim() !== '' && node.variableName !== 'VAR') {
            return node.variableName.trim();
        }
        if (node.isEpisode) return 'EP';
        if (node.isScene) return 'ESC';
        if (node.isShot) return 'SHOTNAME';
        if (node.isProjectNode) return 'PROYECTO';
        if (node.isClientNode) return 'CLIENTE';
        return node.variableName || 'VAR';
    },

    updateNodeProp: (id, prop, value) => {
        const node = ShotDesigner.currentAsset.nodes.find(n => n.id === id);
        if (!node) return;

        // Handle Nested Properties (e.g. 'categoryConfig.cosmeticName')
        if (prop.includes('.')) {
            const parts = prop.split('.');
            let obj = node;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!obj[parts[i]]) obj[parts[i]] = {}; // Init if missing
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = value;

            // SPECIAL LOGIC: Linked Category Cosmetic Name
            const isParentType = (nodeObj) => {
                return !nodeObj.categoryConfig || !nodeObj.categoryConfig.type || nodeObj.categoryConfig.type === 'parent';
            };

            if (prop === 'categoryConfig.cosmeticName' && isParentType(node)) {
                // Find siblings that are also categories and stick to parent type
                const siblings = ShotDesigner.currentAsset.nodes.filter(n => n.parent === node.parent && n.isCategory && n.id !== node.id && isParentType(n));
                siblings.forEach(sibling => {
                    if (!sibling.categoryConfig) sibling.categoryConfig = {};
                    sibling.categoryConfig.cosmeticName = value;
                    // Ensure type is explicit for consistency
                    if (!sibling.categoryConfig.type) sibling.categoryConfig.type = 'parent';
                });
            }

        } else {
            node[prop] = value;

            // Auto-fill semantic variable defaults if empty or generic VAR
            if (value === true) {
                if (prop === 'isEpisode') {
                    node.isVariable = true;
                    if (!node.variableName || node.variableName === 'VAR') node.variableName = 'EP';
                } else if (prop === 'isScene') {
                    node.isVariable = true;
                    if (!node.variableName || node.variableName === 'VAR') node.variableName = 'ESC';
                } else if (prop === 'isShot') {
                    node.isVariable = true;
                    if (!node.variableName || node.variableName === 'VAR' || node.variableName === 'SHOT') node.variableName = 'SHOTNAME';
                    if (!node.shotInputVar) node.shotInputVar = 'SHOT';
                    if (!node.exampleValue) node.exampleValue = '1130';
                } else if (prop === 'isProjectNode') {
                    if (!node.variableName || node.variableName === 'VAR') node.variableName = 'PROYECTO';
                } else if (prop === 'isClientNode') {
                    if (!node.variableName || node.variableName === 'VAR') node.variableName = 'CLIENTE';
                } else if (prop === 'isVariable') {
                    if (!node.variableName || node.variableName === 'VAR') {
                        if (node.isEpisode) node.variableName = 'EP';
                        else if (node.isScene) node.variableName = 'ESC';
                        else if (node.isShot) node.variableName = 'SHOTNAME';
                        else if (node.isProjectNode) node.variableName = 'PROYECTO';
                        else if (node.isClientNode) node.variableName = 'CLIENTE';
                    }
                }
            }

            // SPECIAL LOGIC: Items default to Variable
            if (prop === 'isItem' && value === true) {
                node.isVariable = true;
            }
        }

        ShotDesigner.renderCanvas(); // Reflect changes
        ShotDesigner.pushHistory();
        ShotDesigner.saveAsset();

        // Mirror Propagation
        if (ShotDesigner.currentAsset.connections) {
            const mirrorConn = ShotDesigner.currentAsset.connections.find(c =>
                (c.from === id || c.to === id) && (c.fromPort === 'mirror' || c.toPort === 'mirror')
            );
            if (mirrorConn) {
                const otherId = mirrorConn.from === id ? mirrorConn.to : mirrorConn.from;
                ShotDesigner.mirrorSync(id, otherId);
            }
        }
    },

    // --- HEADER TOOLS ACTIONS ---
    addNode: (type) => {
        if (!ShotDesigner.currentAsset) return;

        // Find parent position (selected or root)
        let parentId = null;
        let startX = 50;
        let startY = 50;

        if (ShotDesigner.selectedNodeId) {
            parentId = ShotDesigner.selectedNodeId;
            const parent = ShotDesigner.currentAsset.nodes.find(n => n.id === parentId);
            if (parent) {
                startX = parent.x + 200;
                startY = parent.y;
            }
        }

        let initialName = 'new_file.ext';
        if (type === 'folder') initialName = 'New_Folder';
        if (type === 'unit') initialName = 'Z';

        const newNode = {
            id: 'n_' + Date.now(),
            type: type,
            name: initialName,
            x: startX,
            y: startY,
            parent: parentId
        };

        ShotDesigner.currentAsset.nodes.push(newNode);
        ShotDesigner.selectNode(newNode.id);
        ShotDesigner.pushHistory();
        ShotDesigner.saveAsset();
    },

    deleteSelected: () => {
        if (!ShotDesigner.currentAsset) return;
        const targetIds = (ShotDesigner.selectedNodeIds && ShotDesigner.selectedNodeIds.length > 0)
            ? ShotDesigner.selectedNodeIds
            : (ShotDesigner.selectedNodeId ? [ShotDesigner.selectedNodeId] : []);

        if (targetIds.length === 0) return;

        const idsToDelete = new Set(targetIds);
        ShotDesigner.currentAsset.nodes = ShotDesigner.currentAsset.nodes.filter(n => !idsToDelete.has(n.id));
        ShotDesigner.currentAsset.nodes.forEach(n => {
            if (idsToDelete.has(n.parent)) n.parent = null;
            if (idsToDelete.has(n.parentOnline)) n.parentOnline = null;
            if (n.itemConfig && Array.isArray(n.itemConfig.additionalParents)) {
                n.itemConfig.additionalParents = n.itemConfig.additionalParents.filter(p => !idsToDelete.has(p));
            }
            if (n.processConfig && Array.isArray(n.processConfig.additionalParents)) {
                n.processConfig.additionalParents = n.processConfig.additionalParents.filter(p => !idsToDelete.has(p));
            }
        });

        // Remove supplemental connections (Mirror, Render)
        if (ShotDesigner.currentAsset.connections) {
            ShotDesigner.currentAsset.connections = ShotDesigner.currentAsset.connections.filter(c =>
                !idsToDelete.has(c.from) && !idsToDelete.has(c.to)
            );
        }

        ShotDesigner.selectNode(null);
        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
        ShotDesigner.updatePreview();
        ShotDesigner.pushHistory();
        ShotDesigner.saveAsset();
    },

    nodeClipboard: null,

    copySelected: () => {
        if (!ShotDesigner.currentAsset) return;
        const targetIds = (ShotDesigner.selectedNodeIds && ShotDesigner.selectedNodeIds.length > 0)
            ? ShotDesigner.selectedNodeIds
            : (ShotDesigner.selectedNodeId ? [ShotDesigner.selectedNodeId] : []);
        if (targetIds.length === 0) return;

        const copied = [];
        targetIds.forEach(id => {
            const node = ShotDesigner.currentAsset.nodes.find(n => n.id === id);
            if (node) copied.push(JSON.parse(JSON.stringify(node)));
        });
        ShotDesigner.nodeClipboard = copied;
        console.log(`[ShotDesigner] Copiados ${copied.length} nodos al portapapeles.`);
    },

    pasteSelected: () => {
        if (!ShotDesigner.currentAsset || !ShotDesigner.nodeClipboard || ShotDesigner.nodeClipboard.length === 0) return;

        const newIds = [];
        const idMap = {};

        ShotDesigner.nodeClipboard.forEach(orig => {
            const newNode = JSON.parse(JSON.stringify(orig));
            newNode.id = 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            newNode.x += 30;
            newNode.y += 30;
            idMap[orig.id] = newNode.id;
            ShotDesigner.currentAsset.nodes.push(newNode);
            newIds.push(newNode.id);
        });

        // Remap internal parent connections among pasted nodes
        newIds.forEach(nid => {
            const n = ShotDesigner.currentAsset.nodes.find(node => node.id === nid);
            if (n && n.parent && idMap[n.parent]) {
                n.parent = idMap[n.parent];
            }
            if (n && n.parentOnline && idMap[n.parentOnline]) {
                n.parentOnline = idMap[n.parentOnline];
            }
            if (n && n.processConfig && n.processConfig.parentItem && idMap[n.processConfig.parentItem]) {
                n.processConfig.parentItem = idMap[n.processConfig.parentItem];
            }
            if (n && n.renderConfig && n.renderConfig.sourceScene && idMap[n.renderConfig.sourceScene]) {
                n.renderConfig.sourceScene = idMap[n.renderConfig.sourceScene];
            }
        });

        // Duplicate supplemental connections among copied nodes
        if (Array.isArray(ShotDesigner.currentAsset.connections)) {
            const copiedOldIds = new Set(ShotDesigner.nodeClipboard.map(n => n.id));
            ShotDesigner.currentAsset.connections.forEach(conn => {
                if (copiedOldIds.has(conn.from) && copiedOldIds.has(conn.to)) {
                    ShotDesigner.currentAsset.connections.push({
                        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                        from: idMap[conn.from],
                        to: idMap[conn.to],
                        fromPort: conn.fromPort,
                        toPort: conn.toPort,
                        isMirror: conn.isMirror
                    });
                }
            });
        }

        ShotDesigner.selectedNodeIds = newIds;
        ShotDesigner.selectedNodeId = newIds.length === 1 ? newIds[0] : null;
        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
        ShotDesigner.updatePreview();
        ShotDesigner.pushHistory();
        ShotDesigner.saveAsset();
    },

    duplicateSelected: () => {
        if (!ShotDesigner.currentAsset) return;
        const targetIds = (ShotDesigner.selectedNodeIds && ShotDesigner.selectedNodeIds.length > 0)
            ? ShotDesigner.selectedNodeIds
            : (ShotDesigner.selectedNodeId ? [ShotDesigner.selectedNodeId] : []);

        if (targetIds.length === 0) return;

        const newIds = [];
        const idMap = {};

        targetIds.forEach(id => {
            const original = ShotDesigner.currentAsset.nodes.find(n => n.id === id);
            if (!original) return;
            const newNode = JSON.parse(JSON.stringify(original));
            newNode.id = 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            newNode.x += 25;
            newNode.y += 25;
            idMap[id] = newNode.id;
            ShotDesigner.currentAsset.nodes.push(newNode);
            newIds.push(newNode.id);
        });

        // Remap internal parent connections among duplicated nodes
        newIds.forEach(nid => {
            const n = ShotDesigner.currentAsset.nodes.find(node => node.id === nid);
            if (n && n.parent && idMap[n.parent]) {
                n.parent = idMap[n.parent];
            }
            if (n && n.parentOnline && idMap[n.parentOnline]) {
                n.parentOnline = idMap[n.parentOnline];
            }
            if (n && n.processConfig && n.processConfig.parentItem && idMap[n.processConfig.parentItem]) {
                n.processConfig.parentItem = idMap[n.processConfig.parentItem];
            }
            if (n && n.renderConfig && n.renderConfig.sourceScene && idMap[n.renderConfig.sourceScene]) {
                n.renderConfig.sourceScene = idMap[n.renderConfig.sourceScene];
            }
        });

        // Duplicate supplemental connections
        if (Array.isArray(ShotDesigner.currentAsset.connections)) {
            const dupOldIds = new Set(targetIds);
            ShotDesigner.currentAsset.connections.forEach(conn => {
                if (dupOldIds.has(conn.from) && dupOldIds.has(conn.to)) {
                    ShotDesigner.currentAsset.connections.push({
                        id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                        from: idMap[conn.from],
                        to: idMap[conn.to],
                        fromPort: conn.fromPort,
                        toPort: conn.toPort,
                        isMirror: conn.isMirror
                    });
                }
            });
        }

        ShotDesigner.selectedNodeIds = newIds;
        ShotDesigner.selectedNodeId = newIds.length === 1 ? newIds[0] : null;
        ShotDesigner.renderCanvas();
        ShotDesigner.updateSidebar();
        ShotDesigner.updatePreview();
        ShotDesigner.pushHistory();
        ShotDesigner.saveAsset();
    },

    updatePreview: () => {
        const previewEl = document.getElementById('sd-preview-text');
        if (!previewEl) return;

        if (ShotDesigner.selectedNodeIds.length > 1) {
            previewEl.innerText = "Múltiples nodos seleccionados. Preview deshabilitada.";
            return;
        }

        if (ShotDesigner.selectedNodeId) {
            // ... existing preview logic ...
            let curr = ShotDesigner.currentAsset.nodes.find(n => n.id === ShotDesigner.selectedNodeId);
            let suffixNodes = [];
            let syncNode = null;
            let safety = 0;

            const resolveName = (n, visited = new Set(), options = {}) => {
                if (visited.has(n.id)) return "[RECURSIÓN]";
                const nextVisited = new Set(visited);
                nextVisited.add(n.id);
                // Name Constructor
                if (n.nameConfig && n.nameConfig.enabled && n.nameConfig.pattern) {
                    let finalName = n.nameConfig.pattern;
                    // REMOVED early [ASSET] replacement to allow variable override

                    // VAR substitution (Generic)
                    if (n.isVariable) {
                        const val = n.exampleValue || n.variableName || 'VAR';
                        finalName = finalName.replace(/\[VAR\]/gi, val);
                    } else {
                        finalName = finalName.replace(/\[VAR\]/gi, n.name);
                    }

                    // Dynamic Variables Resolution
                    // We need to replace any [VarName] with its correct value from the ANCESTOR chain.
                    // 1. Identify all [Variables] in the pattern
                    const varMatches = finalName.match(/\[(.*?)\]/g);
                    if (varMatches) {
                        varMatches.forEach(tag => {
                            const varName = tag.replace('[', '').replace(']', '');
                            // Skip system tags (removed ASSET from here)
                            if (['VAR', 'PROC', 'PROCESO', 'VER', 'version', 'SceneVersion', 'SceneName', 'ext'].includes(varName)) return;

                            // Find value in ancestor chain
                            let foundValue = null;
                            let tempCurr = n;
                            let safetyCheck = 0;

                            // Check for input variable of a shot node (e.g. [SHOT] or custom shotInputVar)
                            const shotNode = ShotDesigner.currentAsset.nodes.find(sn => sn.isShot);
                            const isShotInput = shotNode && ((shotNode.shotInputVar || 'SHOT').toLowerCase() === varName.toLowerCase());

                            if (isShotInput) {
                                foundValue = shotNode.exampleValue || '1130';
                            } else {
                                // Check self first, then parents
                                while (tempCurr && safetyCheck < 100) {
                                    const effVar = ShotDesigner.getEffectiveVarName(tempCurr);
                                    const isMatch = (tempCurr.isVariable && (
                                        effVar.toLowerCase() === varName.toLowerCase() ||
                                        (tempCurr.isScene && (varName.toLowerCase() === 'esc' || varName.toLowerCase() === 'seq' || varName.toLowerCase() === 'escena' || varName.toLowerCase() === 'secuencia')) ||
                                        (tempCurr.isEpisode && (varName.toLowerCase() === 'ep' || varName.toLowerCase() === 'episodio')) ||
                                        (tempCurr.isShot && (varName.toLowerCase() === 'shotname' || varName.toLowerCase() === 'shot_name' || varName.toLowerCase() === effVar.toLowerCase())) ||
                                        (tempCurr.isProjectNode && (varName.toLowerCase() === 'proyecto' || varName.toLowerCase() === 'project')) ||
                                        (tempCurr.isClientNode && (varName.toLowerCase() === 'cliente' || varName.toLowerCase() === 'client'))
                                    ));

                                    if (isMatch) {
                                        if (tempCurr.id === n.id) {
                                            foundValue = tempCurr.exampleValue || '1130';
                                        } else {
                                            foundValue = resolveName(tempCurr, nextVisited, options);
                                        }
                                        break;
                                    }
                                    if (tempCurr.hasNickVar && ((tempCurr.nickVarName || 'NICK').toLowerCase() === varName.toLowerCase())) {
                                        foundValue = tempCurr.nickExample || tempCurr.nickVarName || 'NICK';
                                        break;
                                    }
                                    // Move up
                                    tempCurr = ShotDesigner.currentAsset.nodes.find(node => node.id === tempCurr.parent);
                                    safetyCheck++;
                                }
                            }

                            // If not found in ancestors, check connected Scene node via in-render connection
                            if (foundValue === null && ShotDesigner.currentAsset && ShotDesigner.currentAsset.connections) {
                                let checkRenderNode = n;
                                let rCheck = 0;
                                while (checkRenderNode && rCheck < 10) {
                                    const rConn = ShotDesigner.currentAsset.connections.find(c => c.to === checkRenderNode.id && c.toPort === 'in-render');
                                    if (rConn) {
                                        const srcNode = ShotDesigner.currentAsset.nodes.find(sn => sn.id === rConn.from);
                                        if (srcNode) {
                                            const srcEffVar = ShotDesigner.getEffectiveVarName(srcNode);
                                            if (srcNode.isVariable && (srcEffVar.toLowerCase() === varName.toLowerCase() || (srcNode.variableName && srcNode.variableName.toLowerCase() === varName.toLowerCase()))) {
                                                foundValue = resolveName(srcNode, nextVisited, options);
                                                break;
                                            }
                                        }
                                    }
                                    checkRenderNode = ShotDesigner.currentAsset.nodes.find(node => node.id === checkRenderNode.parent);
                                    rCheck++;
                                }
                            }

                            // If still not found, search globally across all nodes in the preset for a matching variable (cross-branch / sibling variables)
                            if (foundValue === null && ShotDesigner.currentAsset && ShotDesigner.currentAsset.nodes) {
                                const targetNode = ShotDesigner.currentAsset.nodes.find(sn => {
                                    if (!sn || sn.id === n.id) return false;
                                    const snEff = ShotDesigner.getEffectiveVarName(sn);
                                    return sn.isVariable && (
                                        (sn.variableName && sn.variableName.toLowerCase() === varName.toLowerCase()) ||
                                        (snEff && snEff.toLowerCase() === varName.toLowerCase())
                                    );
                                });
                                if (targetNode) {
                                    if (!visited.has(targetNode.id)) {
                                        foundValue = resolveName(targetNode, nextVisited, options);
                                    } else {
                                        foundValue = targetNode.exampleValue || targetNode.name;
                                    }
                                }
                            }

                            // If found, replace
                            if (foundValue !== null) {
                                const paramRegex = new RegExp(`\\[${varName}\\]`, 'gi');
                                finalName = finalName.replace(paramRegex, foundValue);
                            }
                        });
                    }

                    // Fallback: [ASSET] -> Root Name if not resolved by variable
                    const assetName = ShotDesigner.currentAsset ? ShotDesigner.currentAsset.name : 'Asset';
                    finalName = finalName.replace(/\[ASSET\]/gi, assetName);

                    // PROC / PROCESO -> Find Ancestor Process
                    if (finalName.match(/\[PROC\]|\[PROCESO\]/i)) {
                        let procName = n.name;
                        let pCurr = n;
                        let sCheck = 0;
                        while (pCurr && sCheck < 100) {
                            if (pCurr.isProcess) {
                                procName = pCurr.name;
                                break;
                            }
                            pCurr = ShotDesigner.currentAsset.nodes.find(node => node.id === pCurr.parent);
                            sCheck++;
                        }
                        finalName = finalName.replace(/\[PROC\]/gi, procName);
                        finalName = finalName.replace(/\[PROCESO\]/gi, procName);
                    }

                    // Version [VER]
                    if (finalName.match(/\[VER\]|\[version\]/i)) {
                        if (options.skipVersion) {
                            finalName = finalName.replace(/\[VER\]/gi, '');
                            finalName = finalName.replace(/\[version\]/gi, '');
                        } else {
                            const padding = n.nameConfig.versionPadding || 3;
                            const prefix = (n.nameConfig.versionPrefix !== false) ? 'v' : '';
                            const vStr = prefix + '1'.padStart(padding, '0');
                            finalName = finalName.replace(/\[VER\]/gi, vStr);
                            finalName = finalName.replace(/\[version\]/gi, vStr);
                        }
                    }

                    // Helper to find connected scene node (either directly or via parent/ancestor)
                    const findConnectedSceneNode = (node) => {
                        if (!ShotDesigner.currentAsset || !ShotDesigner.currentAsset.connections) return null;
                        let curr = node;
                        let sCheck = 0;
                        while (curr && sCheck < 10) {
                            const conn = ShotDesigner.currentAsset.connections.find(c => c.to === curr.id && c.toPort === 'in-render');
                            if (conn) {
                                const sceneNode = ShotDesigner.currentAsset.nodes.find(sn => sn.id === conn.from);
                                if (sceneNode) return sceneNode;
                            }
                            curr = ShotDesigner.currentAsset.nodes.find(sn => sn.id === curr.parent);
                            sCheck++;
                        }
                        return null;
                    };

                    // SceneVersion [SceneVersion] / [SCE-VER]
                    if (finalName.match(/\[SceneVersion\]|\[SCE-VER\]/i)) {
                        let sceVer = "v001"; // Fallback
                        const sceneNode = findConnectedSceneNode(n);
                        if (sceneNode) {
                            const padding = sceneNode.nameConfig?.versionPadding || 3;
                            const prefix = (sceneNode.nameConfig?.versionPrefix !== false) ? 'v' : '';
                            sceVer = prefix + '1'.padStart(padding, '0');
                        }
                        finalName = finalName.replace(/\[SceneVersion\]|\[SCE-VER\]/gi, sceVer);
                    }

                    // SceneName [SceneName] / [SCE-NAM]
                    if (finalName.match(/\[SceneName\]|\[SCE-NAM\]/i)) {
                        let sceNam = "Scene"; // Fallback
                        const sceneNode = findConnectedSceneNode(n);
                        if (sceneNode) {
                            // Use resolved name but skip version and extension for SCE-NAM
                            sceNam = resolveName(sceneNode, nextVisited, { skipVersion: true, skipExt: true });
                        }
                        finalName = finalName.replace(/\[SceneName\]|\[SCE-NAM\]/gi, sceNam);
                    }

                    // Ext [ext]
                    if (finalName.match(/\[ext\]/i)) {
                        if (options.skipExt) {
                            finalName = finalName.replace(/\[ext\]/gi, '');
                        } else {
                            let ext = '';
                            if (n.nameConfig.allowedExtensions) {
                                const validExts = n.nameConfig.allowedExtensions.split(',').map(e => e.trim()).filter(e => e);
                                if (validExts.length > 0) ext = '.' + validExts[0].replace(/^\./, '');
                            } else {
                                const parts = n.name.split('.');
                                ext = parts.length > 1 ? '.' + parts.pop() : '';
                            }
                            finalName = finalName.replace(/\[ext\]/gi, ext);
                        }
                    }

                    // Special counters: [counter(ID)###]
                    const counterRegex = /\[counter\((\d+)\)(#+)\]/gi;
                    finalName = finalName.replace(counterRegex, (match, id, hashtags) => {
                        const padding = hashtags.length;
                        return "0".repeat(padding);
                    });

                    // Render Counter: [RenderCounter###]
                    const renderCounterRegex = /\[RenderCounter(#+)\]/gi;
                    finalName = finalName.replace(renderCounterRegex, (match, hashtags) => {
                        const padding = hashtags.length;
                        return "0".repeat(padding); // Just placeholders as requested
                    });

                    if (n.nameConfig.forceUpper) {
                        finalName = finalName.toUpperCase();
                    }

                    return finalName;
                }

                // Standard Resolution (No Name Constructor)
                if (n.isEpisode) {
                    if (!n.isVariable) return n.name;
                    return n.exampleValue || `[${n.variableName || 'Episodio'}]`;
                }
                if (n.isScene) {
                    if (!n.isVariable) return n.name;
                    return n.exampleValue || `[${n.variableName || 'Escena'}]`;
                }
                if (n.isShot) {
                    if (!n.isVariable) return n.name;
                    return n.exampleValue || `[${n.variableName || 'Shot'}]`;
                }

                if (n.isCategory) {
                    if (!n.isVariable) return n.name;
                    const disp = n.categoryConfig?.cosmeticName || n.variableName || n.name;
                    return n.exampleValue || `[${disp}]`;
                }

                if (n.isItem) {
                    if (!n.isVariable) return n.name;
                    const disp = n.itemConfig?.cosmeticName || n.variableName || n.name;
                    return n.exampleValue || `[${disp}]`;
                }

                if (n.isVariable) return n.exampleValue || `[${n.variableName || 'VAR'}]`;

                if (n.type === 'unit') return n.name + ':';
                return n.name;
            };

            // Build Suffix (Up to Sync Point or Root)
            while (curr && safety < 100) {
                safety++;
                suffixNodes.unshift(resolveName(curr));

                if (curr.isSyncPoint) {
                    syncNode = curr;
                    break; // Stop at Sync Point
                }
                curr = ShotDesigner.currentAsset.nodes.find(n => n.id === curr.parent);
            }

            const suffixPath = suffixNodes.join('/');

            if (syncNode) {
                // Dual Path Logic
                // Online Prefix (Green)
                let prefixOnline = [];
                let pCurr = ShotDesigner.currentAsset.nodes.find(n => n.id === syncNode.parentOnline);
                safety = 0;
                while (pCurr && safety < 100) {
                    safety++;
                    prefixOnline.unshift(resolveName(pCurr));
                    pCurr = ShotDesigner.currentAsset.nodes.find(n => n.id === pCurr.parent);
                }

                // Local Prefix (Blue)
                let prefixLocal = [];
                let lCurr = ShotDesigner.currentAsset.nodes.find(n => n.id === syncNode.parent);
                safety = 0;
                while (lCurr && safety < 100) {
                    safety++;
                    prefixLocal.unshift(resolveName(lCurr));
                    lCurr = ShotDesigner.currentAsset.nodes.find(n => n.id === lCurr.parent);
                }

                const pOnlineStr = prefixOnline.join('/');
                const pLocalStr = prefixLocal.join('/');

                // HTML Grid Layout for Perfect Alignment
                // Removing inline style here, better use class? Or just fixed inline.
                // Height should be forced. 2 lines ~ 2.8em.
                previewEl.innerHTML = `
                    <div style="display:grid; grid-template-columns: auto 1fr; gap: 0 1px; justify-content: start; align-items: center; font-family: monospace; font-size: 0.9em; line-height: 1.4; min-height: 2.8em;">
                        <div style="text-align:right; color:#4CAF50; white-space:nowrap;">${pOnlineStr}</div>
                        <div style="text-align:left; color:#ccc; white-space:nowrap;">/${suffixPath}</div>
                        
                        <div style="text-align:right; color:#2196F3; white-space:nowrap;">${pLocalStr}</div>
                        <div style="text-align:left; color:#ccc; white-space:nowrap;">/${suffixPath}</div>
                    </div>
                `;
            } else {
                // Regular Path (No Sync Point involved)
                // Force 2 lines height by adding empty second line or min-height.
                // We want it to occupy same space.
                previewEl.innerHTML = `
                    <div style="display:flex; flex-direction:column; justify-content:center; min-height: 2.8em; font-family: monospace; font-size: 0.9em; line-height: 1.4;">
                        <div>PATH: <strong style="color:#fff">${suffixPath}</strong></div>
                        <!-- Spacer to match dual line height visually if single line -->
                    </div>
                `;
            }

        }
    },

    alignNodesHorizontal: () => {
        if (!ShotDesigner.currentAsset || ShotDesigner.selectedNodeIds.length < 2) return;

        const nodes = ShotDesigner.currentAsset.nodes.filter(n => ShotDesigner.selectedNodeIds.includes(n.id));
        if (nodes.length < 2) return;

        // Use the Y of the first selected node (reference)
        const targetY = nodes[0].y;

        nodes.forEach(n => {
            n.y = targetY;
        });

        ShotDesigner.renderCanvas();
        ShotDesigner.pushHistory();
        ShotDesigner.saveAsset();
    },

    alignNodesVertical: () => {
        if (!ShotDesigner.currentAsset || ShotDesigner.selectedNodeIds.length < 2) return;

        const nodes = ShotDesigner.currentAsset.nodes.filter(n => ShotDesigner.selectedNodeIds.includes(n.id));
        if (nodes.length < 2) return;

        // Use the X of the first selected node (reference)
        const targetX = nodes[0].x;

        nodes.forEach(n => {
            n.x = targetX;
        });

        ShotDesigner.renderCanvas();
        ShotDesigner.pushHistory();
        ShotDesigner.saveAsset();
    },

    findNearestDot: (clientX, clientY, maxDist = 30) => {
        const dots = document.querySelectorAll('.sd-dot');
        let nearest = null;
        let minDist = maxDist;

        dots.forEach(dot => {
            const rect = dot.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dist = Math.sqrt(Math.pow(clientX - centerX, 2) + Math.pow(clientY - centerY, 2));

            if (dist < minDist) {
                minDist = dist;
                nearest = dot;
            }
        });
        return nearest;
    }
};
