// --- ASSET DESIGNER MODULE ---

const AssetDesigner = {
    // State
    assets: [],
    currentAsset: null,
    selectedNodeId: null,
    selectedNodeIds: [], // Multi-selection support
    presetsPath: "C:\\TOOLS\\APPS\\Pipeta\\presets\\AssetDesigner",

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
    isConnecting: false,
    connectionStartNode: null,
    connectionCurrentPos: { x: 0, y: 0 },

    // Selection Box State
    isBoxSelecting: false,
    boxStart: { x: 0, y: 0 },
    boxCurrent: { x: 0, y: 0 },

    // Auto Arrange Gaps (px)
    arrangeGapX: 50,
    arrangeGapY: 30,

    // Annotation / Cosmetics State
    selectedAnnotationId: null,
    isDraggingAnnotation: false,
    dragAnnotation: null,
    dragAnnotationLastPos: { x: 0, y: 0 },
    editingAnnotationId: null,
    isResizingAnnotation: false,
    resizeHandleCorner: null,
    resizeAnnotation: null,
    resizeStart: null,
    isDraggingLineHandle: false,
    dragLineHandleType: null, // 'start' | 'end'
    dragLineAnnotation: null,
    _rafPending: false,

    // Minimap State
    isMinimapCollapsed: false,
    isDraggingMinimap: false,
    _mmBounds: null,
    _mmScale: 1,
    _mmOffsetX: 0,
    _mmOffsetY: 0,

    // History (Undo / Redo) State
    history: [],
    historyIndex: -1,
    isApplyingHistory: false,

    initHistory: () => {
        AssetDesigner.history = [];
        AssetDesigner.historyIndex = -1;
        AssetDesigner.pushHistory();
    },

    pushHistory: () => {
        if (AssetDesigner.isApplyingHistory || !AssetDesigner.currentAsset) return;
        const snapshot = JSON.stringify(AssetDesigner.currentAsset);
        if (AssetDesigner.historyIndex >= 0 && AssetDesigner.history[AssetDesigner.historyIndex] === snapshot) {
            return;
        }

        if (AssetDesigner.historyIndex < AssetDesigner.history.length - 1) {
            AssetDesigner.history = AssetDesigner.history.slice(0, AssetDesigner.historyIndex + 1);
        }

        AssetDesigner.history.push(snapshot);
        if (AssetDesigner.history.length > 60) {
            AssetDesigner.history.shift();
        }
        AssetDesigner.historyIndex = AssetDesigner.history.length - 1;
    },

    undo: () => {
        if (!AssetDesigner.currentAsset || AssetDesigner.historyIndex <= 0) {
            console.log("[AssetDesigner] No hay más pasos para deshacer.");
            return;
        }
        AssetDesigner.isApplyingHistory = true;
        AssetDesigner.historyIndex--;
        const restored = JSON.parse(AssetDesigner.history[AssetDesigner.historyIndex]);

        const idx = AssetDesigner.assets.findIndex(a => a.id === restored.id);
        if (idx !== -1) {
            AssetDesigner.assets[idx] = restored;
        }
        AssetDesigner.currentAsset = restored;

        AssetDesigner.selectedNodeIds = [];
        AssetDesigner.selectedNodeId = null;

        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
        AssetDesigner.updatePreview();
        AssetDesigner.saveAsset();
        AssetDesigner.isApplyingHistory = false;
        console.log(`[AssetDesigner] Undo aplicado (${AssetDesigner.historyIndex + 1}/${AssetDesigner.history.length})`);
    },

    redo: () => {
        if (!AssetDesigner.currentAsset || AssetDesigner.historyIndex >= AssetDesigner.history.length - 1) {
            console.log("[AssetDesigner] No hay más pasos para rehacer.");
            return;
        }
        AssetDesigner.isApplyingHistory = true;
        AssetDesigner.historyIndex++;
        const restored = JSON.parse(AssetDesigner.history[AssetDesigner.historyIndex]);

        const idx = AssetDesigner.assets.findIndex(a => a.id === restored.id);
        if (idx !== -1) {
            AssetDesigner.assets[idx] = restored;
        }
        AssetDesigner.currentAsset = restored;

        AssetDesigner.selectedNodeIds = [];
        AssetDesigner.selectedNodeId = null;

        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
        AssetDesigner.updatePreview();
        AssetDesigner.saveAsset();
        AssetDesigner.isApplyingHistory = false;
        console.log(`[AssetDesigner] Redo aplicado (${AssetDesigner.historyIndex + 1}/${AssetDesigner.history.length})`);
    },

    init: async () => {
        console.log("Initializing Asset Designer... Version: 2026-02-08-v2");
        await AssetDesigner.loadPresets();

        // If no assets, create default
        if (AssetDesigner.assets.length === 0) {
            await AssetDesigner.newAsset("Master_Asset");
        } else {
            const master = AssetDesigner.assets.find(a => a.id === 'master_asset' || a.name?.toLowerCase() === 'master_asset');
            AssetDesigner.currentAsset = master || AssetDesigner.assets[0];
        }

        AssetDesigner.initHistory();

        AssetDesigner.renderUI();
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();

        // Canvas Events
        const canvas = document.getElementById('ad-canvas-area');
        if (canvas) {
            canvas.addEventListener('mousedown', AssetDesigner.onCanvasMouseDown);
            canvas.addEventListener('mousemove', AssetDesigner.onCanvasMouseMove);
            canvas.addEventListener('mouseup', AssetDesigner.onCanvasMouseUp);
            canvas.addEventListener('wheel', AssetDesigner.onCanvasWheel);
            canvas.addEventListener('contextmenu', e => e.preventDefault());
        }

        document.addEventListener('keydown', AssetDesigner.onKeyDown);

        window.addEventListener('mouseup', () => {
            if (AssetDesigner.isDraggingMinimap) {
                AssetDesigner.isDraggingMinimap = false;
            }
        });
        window.addEventListener('mousemove', (e) => {
            if (AssetDesigner.isDraggingMinimap) {
                AssetDesigner.onMinimapMouseMove(e);
            }
        });

        // Hook up Header Buttons
        document.getElementById('ad-asset-selector').addEventListener('change', (e) => AssetDesigner.selectAsset(e.target.value));
    },

    startRenaming: (nodeId) => {
        AssetDesigner.isRenaming = true;
        AssetDesigner.renamingNodeId = nodeId;
        AssetDesigner.renderCanvas();
        // Focus the input
        setTimeout(() => {
            const input = document.querySelector('.ad-node-input');
            if (input) {
                input.focus();
                input.select();
            }
        }, 10);
    },

    finishRenaming: (id, newName) => {
        if (!AssetDesigner.isRenaming) return;

        const node = AssetDesigner.currentAsset.nodes.find(n => n.id === id);
        if (node && newName && newName.trim() !== '') {
            node.name = newName.trim();
        }

        AssetDesigner.isRenaming = false;
        AssetDesigner.renamingNodeId = null;
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
        AssetDesigner.updatePreview();
        AssetDesigner.saveAsset();
    },

    cancelRenaming: () => {
        AssetDesigner.isRenaming = false;
        AssetDesigner.renamingNodeId = null;
        AssetDesigner.renderCanvas();
    },

    appendNameTag: (nodeId, tag) => {
        const input = document.getElementById(`nc-pattern-${nodeId}`);
        if (!input) return;

        // Insert at cursor or append
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);

        input.value = before + tag + after;
        input.selectionStart = input.selectionEnd = start + tag.length;
        input.focus();

        // Update Model
        AssetDesigner.updateNodeProp(nodeId, 'nameConfig.versionPadding', AssetDesigner.currentAsset.nodes.find(n => n.id === nodeId).nameConfig?.versionPadding || 3); // Dummy update to trigger? No
        AssetDesigner.updateNodeProp(nodeId, 'nameConfig.pattern', input.value);
    },

    // --- PERSISTENCE ---
    loadPresets: async () => {
        AssetDesigner.assets = [];
        const seenIds = new Set();
        const seenFiles = new Set();
        const searchDirs = [
            AssetDesigner.presetsPath,
            "Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets\\AssetDesigner"
        ];

        for (const dir of searchDirs) {
            try {
                if (window.API && API.fs && API.fs.mkdir) {
                    await API.fs.mkdir(dir);
                }
                const files = await API.fs.getFiles(dir);
                if (files && Array.isArray(files)) {
                    for (const f of files) {
                        if (f.endsWith('.json')) {
                            const fileBase = f.toLowerCase();
                            if (seenFiles.has(fileBase)) continue;
                            const content = await API.fs.readFile(dir + "\\" + f);
                            if (content) {
                                try {
                                    const asset = JSON.parse(content);
                                    if (!asset.id) asset.id = 'asset_' + Math.random().toString(36).substr(2, 9);
                                    if (seenIds.has(asset.id)) continue;
                                    asset._fileName = f;
                                    AssetDesigner.assets.push(asset);
                                    seenIds.add(asset.id);
                                    seenFiles.add(fileBase);
                                } catch (parseErr) {
                                    console.error("Error parsing " + f, parseErr);
                                }
                            }
                        }
                    }
                }
            } catch (dirErr) {
                // Ignore missing dir in network/local
            }
        }

        if (AssetDesigner.assets.length === 0) {
            console.log("No assets found. Using default.");
            await AssetDesigner.newAsset("Master_Asset");
        } else {
            console.log("Loaded", AssetDesigner.assets.length, "assets.");
            // Seleccionar Master_Asset por defecto si existe, o el primero
            const master = AssetDesigner.assets.find(a => a.id === 'master_asset' || a.name?.toLowerCase() === 'master_asset');
            AssetDesigner.currentAsset = master || AssetDesigner.assets[0];
        }
    },

    saveAsset: async () => {
        if (!AssetDesigner.currentAsset) return;
        const fileName = AssetDesigner.currentAsset._fileName || (AssetDesigner.currentAsset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
        AssetDesigner.currentAsset._fileName = fileName;
        const content = JSON.stringify(AssetDesigner.currentAsset, null, 2);

        const targetPaths = [
            AssetDesigner.presetsPath + "\\" + fileName,
            "Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets\\AssetDesigner\\" + fileName
        ];

        for (const filePath of targetPaths) {
            try {
                await API.fs.writeFile(filePath, content);
            } catch (e) {
                // Ignore path failure if offline
            }
        }
    },

    newAsset: async (name) => {
        const assetName = name || "New Asset";
        const newAsset = {
            id: 'asset_' + Date.now(),
            name: assetName,
            _fileName: assetName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json",
            nodes: [
                { id: "root", type: "folder", name: "ROOT", x: 50, y: 50, parent: null }
            ],
            connections: []
        };
        AssetDesigner.assets.push(newAsset);
        AssetDesigner.currentAsset = newAsset;
        AssetDesigner.renderUI();
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
        await AssetDesigner.saveAsset();
    },

    deleteAsset: async () => {
        if (!AssetDesigner.currentAsset) return;
        const assetName = AssetDesigner.currentAsset.name;

        if (!confirm("¿Borrar asset " + assetName + "?")) return;

        const fileName = AssetDesigner.currentAsset._fileName || (assetName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
        const filePath = AssetDesigner.presetsPath + "\\" + fileName;

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
        AssetDesigner.assets = AssetDesigner.assets.filter(a => a.id !== AssetDesigner.currentAsset.id);

        if (AssetDesigner.assets.length > 0) {
            AssetDesigner.currentAsset = AssetDesigner.assets[0];
        } else {
            AssetDesigner.currentAsset = null;
            AssetDesigner.newAsset("Default");
        }

        AssetDesigner.renderUI();
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
    },

    selectAsset: (assetId) => {
        const asset = AssetDesigner.assets.find(a => a.id === assetId);
        if (asset) {
            AssetDesigner.currentAsset = asset;
            AssetDesigner.selectedNodeId = null;
            AssetDesigner.selectedNodeIds = [];
            AssetDesigner.initHistory();
            AssetDesigner.renderCanvas();
            AssetDesigner.renderUI();
            AssetDesigner.updateSidebar();
        }
    },

    renameAsset: async () => {
        if (!AssetDesigner.currentAsset) {
            console.warn("[Rename] No hay asset seleccionado.");
            return;
        }

        const oldName = AssetDesigner.currentAsset.name;
        const oldId = AssetDesigner.currentAsset.id || oldName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const newName = prompt("Nuevo nombre para el Asset:", oldName);

        if (!newName || newName === oldName) return;

        const newId = newName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const oldFileName = AssetDesigner.currentAsset._fileName || (oldName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
        const newFileName = newName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";

        const oldPath = AssetDesigner.presetsPath + "\\" + oldFileName;
        const newPath = AssetDesigner.presetsPath + "\\" + newFileName;

        console.log(`[Rename] ${oldFileName} (${oldId}) -> ${newFileName} (${newId})`);

        try {
            AssetDesigner.currentAsset.name = newName;
            AssetDesigner.currentAsset.id = newId;
            AssetDesigner.currentAsset._fileName = newFileName;

            if (oldPath !== newPath) {
                try { await API.fs.deleteFile(oldPath); } catch (dErr) {}
            }

            await AssetDesigner.saveAsset();

            if (typeof settings !== 'undefined') {
                if (settings.projects && Array.isArray(settings.projects)) {
                    for (const proj of settings.projects) {
                        const oldIdMatch = (proj.defaultAssetPresetId === oldId || 
                                            proj.defaultAssetPresetId === oldName || 
                                            proj.defaultAssetPresetId === oldFileName.replace('.json', ''));
                        if (oldIdMatch) {
                            proj.defaultAssetPresetId = newId;
                            const projFile = (proj.id === 'proj_base' || proj.isBase) ? 'base.json' : `${proj.name || proj.id}.json`;
                            try {
                                await API.fs.writeFile(settings.projectsPath + "\\" + projFile, JSON.stringify(proj, null, 2));
                            } catch (pErr) {
                                console.warn("[Rename] Auto-save project note:", pErr);
                            }
                        }
                    }
                }

                if (settings.validationPresetAsset === oldId || 
                    settings.validationPresetAsset === oldName || 
                    settings.validationPresetAsset === oldFileName.replace('.json', '')) {
                    settings.validationPresetAsset = newId;
                    settings.saveConfig();
                }

                await settings.loadPresets();
                if (settings.isVisible) {
                    settings.render();
                }
            }

            AssetDesigner.renderUI();
            AssetDesigner.renderCanvas();
            AssetDesigner.updateSidebar();
            console.log("[Rename] OK & auto-propagado a proyectos");
        } catch (e) {
            console.error("[Rename] Exception:", e);
            alert("Error: " + e.message);
        }
    },

    duplicateAsset: () => {
        if (!AssetDesigner.currentAsset) return;
        const copy = JSON.parse(JSON.stringify(AssetDesigner.currentAsset));
        copy.id = 'asset_' + Date.now();
        copy.name = copy.name + " (Copy)";
        copy._fileName = copy.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
        AssetDesigner.assets.push(copy);
        AssetDesigner.currentAsset = copy;
        AssetDesigner.renderUI();
        AssetDesigner.renderCanvas();
        AssetDesigner.saveAsset(); // Save immediately?
    },

    // --- RENDERERS ---
    renderUI: () => {
        const select = document.getElementById('ad-asset-selector');
        if (select && AssetDesigner.currentAsset) {
            select.innerHTML = AssetDesigner.assets.map(a =>
                `<option value="${a.id}" ${AssetDesigner.currentAsset.id === a.id ? 'selected' : ''}>${a.name}</option>`
            ).join('');
        }
    },

    scheduleUpdateTransform: () => {
        if (AssetDesigner._rafPending) return;
        AssetDesigner._rafPending = true;
        requestAnimationFrame(() => {
            AssetDesigner._rafPending = false;
            AssetDesigner.updateViewportTransform();
        });
    },

    updateViewportTransform: () => {
        const nodesLayer = document.getElementById('ad-nodes-layer');
        const connectionsLayer = document.getElementById('ad-connections-layer');
        const annLayerBack = document.getElementById('ad-annotations-layer-back');
        const annLayerFront = document.getElementById('ad-annotations-layer-front');
        const canvasArea = document.getElementById('ad-canvas-area');
        if (!nodesLayer || !connectionsLayer) return;
        if (canvasArea && (canvasArea.scrollTop !== 0 || canvasArea.scrollLeft !== 0)) {
            canvasArea.scrollTop = 0;
            canvasArea.scrollLeft = 0;
        }

        const tX = AssetDesigner.panOffset.x;
        const tY = AssetDesigner.panOffset.y;
        const scale = AssetDesigner.zoomLevel;

        const cssTransform = `translate3d(${tX}px, ${tY}px, 0px) scale(${scale})`;
        const svgTransform = `translate(${tX}, ${tY}) scale(${scale})`;

        nodesLayer.style.transform = cssTransform;
        nodesLayer.style.transformOrigin = "0 0";

        if (annLayerBack) {
            annLayerBack.style.transform = cssTransform;
            annLayerBack.style.transformOrigin = "0 0";
        }
        if (annLayerFront) {
            annLayerFront.style.transform = cssTransform;
            annLayerFront.style.transformOrigin = "0 0";
        }

        let svgGroup = connectionsLayer.querySelector('g.viewport');
        if (svgGroup) {
            svgGroup.setAttribute('transform', svgTransform);
        }

        AssetDesigner.updateMinimapViewport();
    },

    renderCanvas: () => {
        const nodesLayer = document.getElementById('ad-nodes-layer');
        const connectionsLayer = document.getElementById('ad-connections-layer');
        if (!nodesLayer || !connectionsLayer) return;

        // Apply Transform
        const tX = AssetDesigner.panOffset.x;
        const tY = AssetDesigner.panOffset.y;
        const scale = AssetDesigner.zoomLevel;

        const cssTransform = `translate3d(${tX}px, ${tY}px, 0px) scale(${scale})`;
        const svgTransform = `translate(${tX}, ${tY}) scale(${scale})`;

        nodesLayer.style.transform = cssTransform;
        nodesLayer.style.transformOrigin = "0 0";

        const annLayerBack = document.getElementById('ad-annotations-layer-back');
        const annLayerFront = document.getElementById('ad-annotations-layer-front');
        if (annLayerBack) {
            annLayerBack.style.transform = cssTransform;
            annLayerBack.style.transformOrigin = "0 0";
        }
        if (annLayerFront) {
            annLayerFront.style.transform = cssTransform;
            annLayerFront.style.transformOrigin = "0 0";
        }

        let svgGroup = connectionsLayer.querySelector('g.viewport');
        if (!svgGroup) {
            connectionsLayer.innerHTML = '<g class="viewport"></g>';
            svgGroup = connectionsLayer.querySelector('g.viewport');
        }
        svgGroup.setAttribute('transform', svgTransform);

        // Clear Content
        nodesLayer.innerHTML = '';
        svgGroup.innerHTML = '';

        // Selection Box (Marquee)
        if (AssetDesigner.isBoxSelecting) {
            const box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const bx = Math.min(AssetDesigner.boxStart.x, AssetDesigner.boxCurrent.x);
            const by = Math.min(AssetDesigner.boxStart.y, AssetDesigner.boxCurrent.y);
            const bw = Math.abs(AssetDesigner.boxStart.x - AssetDesigner.boxCurrent.x);
            const bh = Math.abs(AssetDesigner.boxStart.y - AssetDesigner.boxCurrent.y);
            box.setAttribute("x", bx);
            box.setAttribute("y", by);
            box.setAttribute("width", bw);
            box.setAttribute("height", bh);
            box.setAttribute("fill", "rgba(33, 150, 243, 0.15)");
            box.setAttribute("stroke", "#2196F3");
            box.setAttribute("stroke-dasharray", `${4 / AssetDesigner.zoomLevel},${4 / AssetDesigner.zoomLevel}`);
            box.setAttribute("stroke-width", 1.5 / AssetDesigner.zoomLevel);
            box.setAttribute("style", "pointer-events: none;");
            svgGroup.appendChild(box);
        }

        if (!AssetDesigner.currentAsset) return;

        // Draw Connections First (Background)
        AssetDesigner.currentAsset.nodes.forEach(node => {
            // 1. Draw Local Connection (parent -> node)
            if (node.parent) {
                const parent = AssetDesigner.currentAsset.nodes.find(n => n.id === node.parent);
                if (parent) {
                    AssetDesigner.drawConnection(parent, node, svgGroup, 'local');
                }
            }
            // 2. Draw Online Connection (parentOnline -> node)
            if (node.parentOnline && node.isSyncPoint) {
                const parent = AssetDesigner.currentAsset.nodes.find(n => n.id === node.parentOnline);
                if (parent) {
                    AssetDesigner.drawConnection(parent, node, svgGroup, 'online');
                }
            }
            if (node.isItem && node.itemConfig && node.itemConfig.allowMultiParent && node.itemConfig.additionalParents) {
                node.itemConfig.additionalParents.forEach(pId => {
                    const parent = AssetDesigner.currentAsset.nodes.find(n => n.id === pId);
                    if (parent) {
                        AssetDesigner.drawConnection(parent, node, svgGroup, 'local');
                    }
                });
            }

            // Draw Process Multi-Connections
            if (node.isProcess && node.processConfig && node.processConfig.parentItem && node.processConfig.additionalParents) {
                node.processConfig.additionalParents.forEach(pId => {
                    const parent = AssetDesigner.currentAsset.nodes.find(n => n.id === pId);
                    if (parent) {
                        AssetDesigner.drawConnection(parent, node, svgGroup, 'local');
                    }
                });
            }
        });

        // Draw Draft Connection
        if (AssetDesigner.isConnecting && AssetDesigner.connectionStartNode) {
            AssetDesigner.drawDraftConnection(AssetDesigner.connectionStartNode, AssetDesigner.connectionCurrentPos, svgGroup);
        }

        // Draw Nodes
        AssetDesigner.currentAsset.nodes.forEach(node => {
            const isSelected = (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.includes(node.id)) || AssetDesigner.selectedNodeId === node.id;
            const el = document.createElement('div');
            el.className = `ad-node ${node.type} ${isSelected ? 'selected' : ''}`;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            el.setAttribute('data-id', node.id);
            el.setAttribute('onmousedown', `event.stopPropagation(); AssetDesigner.startDragNode(event, AssetDesigner.currentAsset.nodes.find(n => n.id === '${node.id}'))`);

            // Dots HTML
            let dotsHtml = '';

            // INPUT DOTS
            if (node.isSyncPoint) {
                // Dual Inputs
                dotsHtml += `<div class="ad-dot ad-dot-in ad-dot-in-online" title="Input Online" onmousedown="event.stopPropagation(); AssetDesigner.onDotInDown('${node.id}', event, 'online')"></div>`;
                dotsHtml += `<div class="ad-dot ad-dot-in ad-dot-in-local" title="Input Local" onmousedown="event.stopPropagation(); AssetDesigner.onDotInDown('${node.id}', event, 'local')"></div>`;
            } else {
                // Std Input
                const isItemMulti = node.isItem && node.itemConfig && node.itemConfig.allowMultiParent;
                const isProcessMulti = node.isProcess && node.processConfig && node.processConfig.parentItem;

                let dotClass = 'ad-dot ad-dot-in';
                let title = 'Input (Child)';

                if (isItemMulti) {
                    dotClass = 'ad-dot ad-dot-in multi-parent';
                    title = 'Input (Multi-Parent Item)';
                } else if (isProcessMulti) {
                    dotClass = 'ad-dot ad-dot-in multi-process';
                    title = 'Input (Process Parent Item)';
                }

                dotsHtml += `<div class="${dotClass}" title="${title}" onmousedown="event.stopPropagation(); AssetDesigner.onDotInDown('${node.id}', event, 'local')"></div>`;
            }

            // OUTPUT DOTS
            if (node.type === 'folder' || node.type === 'unit') {
                dotsHtml += `<div class="ad-dot ad-dot-out" title="Output (Parent)" onmousedown="event.stopPropagation(); AssetDesigner.onDotOutDown('${node.id}', event)"></div>`;
            }

            let icon = '';
            if (node.type === 'folder') icon = '📂';
            else if (node.type === 'unit') icon = '💽';
            else if (node.type === 'file') icon = '📄';

            // Badges HTML
            let badgesHtml = '<div class="ad-badges">';
            if (node.isSyncPoint) badgesHtml += `<span class="ad-badge" style="background:#009688">SYNC</span>`;
            if (node.isMainCategory) badgesHtml += `<span class="ad-badge" style="background:#9c27b0">MAIN CAT</span>`;
            if (node.isCategory) badgesHtml += `<span class="ad-badge ad-badge-category">SUB CAT</span>`;
            if (node.isVariable)
                badgesHtml += `<span class="ad-badge ad-badge-variable">${node.variableName || 'VAR'}</span>`;
            else if (node.type !== 'file' && !node.isItem && !node.isProcess && !node.isMainCategory && !node.isCategory)
                badgesHtml += `<span class="ad-badge" style="background:#FBC02D; color:#000;">FIXED</span>`;

            if (node.isItem) badgesHtml += `<span class="ad-badge ad-badge-item">ITEM</span>`;
            if (node.isProcess) badgesHtml += `<span class="ad-badge ad-badge-process">PROC</span>`;
            if (node.isFileContainer) badgesHtml += `<span class="ad-badge" style="background:#555">FC</span>`;

            badgesHtml += '</div>';

            const isRenaming = AssetDesigner.isRenaming && AssetDesigner.renamingNodeId === node.id;
            const contentHtml = isRenaming
                ? `<input class="ad-node-input" value="${node.name}" 
                    onkeydown="if(event.key==='Enter') AssetDesigner.finishRenaming('${node.id}', this.value); if(event.key==='Escape') AssetDesigner.cancelRenaming(); event.stopPropagation();"
                    onblur="AssetDesigner.finishRenaming('${node.id}', this.value)"
                    onclick="event.stopPropagation()">`
                : `<div class="ad-node-content">${node.name}${node.type === 'unit' ? ':' : ''}</div>`;

            el.innerHTML = `
                ${dotsHtml}
                ${badgesHtml}
                <div class="ad-node-header" style="justify-content:flex-start; padding-left:10px;">${icon}</div>
                ${contentHtml}
            `;

            el.onmousedown = (e) => {
                if (e.target.classList.contains('ad-dot')) return;
                e.preventDefault();
                e.stopPropagation();
                const isShift = e.shiftKey || e.ctrlKey;
                AssetDesigner.selectedAnnotationId = null;
                if (isShift) {
                    AssetDesigner.selectNode(node.id, true);
                } else {
                    if (!AssetDesigner.selectedNodeIds || !AssetDesigner.selectedNodeIds.includes(node.id)) {
                        AssetDesigner.selectNode(node.id, false);
                    }
                }
                if (!e.altKey) {
                    AssetDesigner.startDragNode(e, node);
                }
            };

            el.ondblclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                AssetDesigner.startRenaming(node.id);
            };

            nodesLayer.appendChild(el);
        });

        AssetDesigner.renderAnnotations();
        AssetDesigner.renderMinimap();
        AssetDesigner.updatePreview();
        AssetDesigner.updateBackground();
    },

    renderAnnotations: () => {
        const annLayerBack = document.getElementById('ad-annotations-layer-back');
        const annLayerFront = document.getElementById('ad-annotations-layer-front');
        if (annLayerBack) annLayerBack.innerHTML = '';
        if (annLayerFront) annLayerFront.innerHTML = '';
        if (!AssetDesigner.currentAsset || !AssetDesigner.currentAsset.annotations) return;

        const hexToRgba = (hex, op) => {
            let c = (hex || '#ff9800').replace('#', '');
            if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
            const num = parseInt(c, 16);
            return `rgba(${(num>>16)&255}, ${(num>>8)&255}, ${num&255}, ${op !== undefined ? op : 0.2})`;
        };

        const getBorderCss = (strokeWidth, strokeStyle, strokeColor) => {
            if (!strokeWidth || strokeWidth === 0) return 'none';
            let style = strokeStyle || 'solid';
            if (style === 'dashdot') style = 'dashed';
            return `${strokeWidth}px ${style} ${strokeColor || '#ff9800'}`;
        };

        AssetDesigner.currentAsset.annotations.forEach(a => {
            const isSel = AssetDesigner.selectedAnnotationId === a.id;
            const itemEl = document.createElement('div');
            itemEl.className = `canvas-annotation-item ${isSel ? 'selected' : ''}`;
            itemEl.setAttribute('data-id', a.id);

            const isFront = a.layerOrder === 'front';
            const targetContainer = isFront ? (annLayerFront || annLayerBack) : (annLayerBack || annLayerFront);
            if (!targetContainer) return;

            if (a.type === 'text') {
                const w = a.width || 180;
                const h = a.height || 45;
                itemEl.style.left = `${a.x}px`;
                itemEl.style.top = `${a.y}px`;
                itemEl.style.width = `${w}px`;
                itemEl.style.height = `${h}px`;
                itemEl.style.color = a.color || '#ffca28';
                itemEl.style.fontSize = `${a.fontSize || 18}px`;
                itemEl.style.fontFamily = a.fontFamily || 'sans-serif';
                itemEl.style.fontWeight = a.isBold ? 'bold' : 'normal';
                itemEl.style.fontStyle = a.isItalic ? 'italic' : 'normal';
                itemEl.style.textDecoration = a.isUnderline ? 'underline' : 'none';
                itemEl.style.padding = `${a.padding !== undefined ? a.padding : 6}px`;

                const border = (a.mode === 'fill' || !a.strokeWidth || a.strokeWidth === 0) ? 'none' : getBorderCss(a.strokeWidth, a.strokeStyle, a.strokeColor || '#ff9800');
                const bg = (a.mode === 'stroke') ? 'transparent' : (a.fillOpacity > 0 || a.fillColor ? hexToRgba(a.fillColor || '#222222', a.fillOpacity !== undefined ? a.fillOpacity : 0.8) : 'transparent');

                itemEl.style.border = border;
                itemEl.style.backgroundColor = bg;
                itemEl.style.borderRadius = `${a.borderRadius !== undefined ? a.borderRadius : 4}px`;

                if (AssetDesigner.editingAnnotationId === a.id) {
                    itemEl.innerHTML = `<textarea class="canvas-annotation-text-input" 
                        onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); AssetDesigner.finishEditingAnnotation('${a.id}', this.value); } if(event.key==='Escape'){ event.preventDefault(); AssetDesigner.cancelEditingAnnotation(); } event.stopPropagation();"
                        onblur="AssetDesigner.finishEditingAnnotation('${a.id}', this.value);"
                        onclick="event.stopPropagation()">${a.text}</textarea>`;
                    setTimeout(() => {
                        const ta = itemEl.querySelector('textarea');
                        if (ta) { ta.focus(); ta.select(); }
                    }, 10);
                } else {
                    itemEl.innerHTML = `<div class="canvas-annotation-text">${a.text}</div>`;
                    itemEl.ondblclick = (e) => {
                        e.stopPropagation();
                        AssetDesigner.editingAnnotationId = a.id;
                        AssetDesigner.renderCanvas();
                    };
                }

                // Add 4 Resize Handles if Selected
                if (isSel) {
                    ['nw', 'ne', 'se', 'sw'].forEach(corner => {
                        const hEl = document.createElement('div');
                        hEl.className = `annotation-resize-handle handle-${corner}`;
                        hEl.onmousedown = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            AssetDesigner.startResizeAnnotation(e, a, corner);
                        };
                        itemEl.appendChild(hEl);
                    });
                }
            } else if (a.type === 'shape') {
                const w = a.width || 200;
                const h = a.height || 120;
                itemEl.style.left = `${a.x}px`;
                itemEl.style.top = `${a.y}px`;
                itemEl.style.width = `${w}px`;
                itemEl.style.height = `${h}px`;

                const border = (a.mode === 'fill' || a.strokeWidth === 0) ? 'none' : getBorderCss(a.strokeWidth, a.strokeStyle, a.strokeColor || '#ff9800');
                const bg = (a.mode === 'stroke') ? 'transparent' : hexToRgba(a.fillColor || '#ff9800', a.fillOpacity !== undefined ? a.fillOpacity : 0.15);

                itemEl.style.border = border;
                itemEl.style.backgroundColor = bg;
                if (a.shapeType === 'circle' || a.shapeType === 'oval') {
                    itemEl.style.borderRadius = '50%';
                } else {
                    itemEl.style.borderRadius = `${a.borderRadius !== undefined ? a.borderRadius : 6}px`;
                }

                // Add 4 Resize Handles if Selected
                if (isSel) {
                    ['nw', 'ne', 'se', 'sw'].forEach(corner => {
                        const hEl = document.createElement('div');
                        hEl.className = `annotation-resize-handle handle-${corner}`;
                        hEl.onmousedown = (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            AssetDesigner.startResizeAnnotation(e, a, corner);
                        };
                        itemEl.appendChild(hEl);
                    });
                }
            } else if (a.type === 'line') {
                const minX = Math.min(a.x1, a.x2) - 20;
                const minY = Math.min(a.y1, a.y2) - 20;
                const maxX = Math.max(a.x1, a.x2) + 20;
                const maxY = Math.max(a.y1, a.y2) + 20;
                const w = Math.max(40, maxX - minX);
                const h = Math.max(40, maxY - minY);

                itemEl.style.left = `${minX}px`;
                itemEl.style.top = `${minY}px`;
                itemEl.style.width = `${w}px`;
                itemEl.style.height = `${h}px`;

                const lx1 = a.x1 - minX;
                const ly1 = a.y1 - minY;
                const lx2 = a.x2 - minX;
                const ly2 = a.y2 - minY;

                const markerId = `ad_arrow_${a.id}`;
                const circleId = `ad_dot_${a.id}`;
                let dasharray = '';
                if (a.strokeStyle === 'dashed') dasharray = '8,6';
                else if (a.strokeStyle === 'dotted') dasharray = '3,4';
                else if (a.strokeStyle === 'dashdot') dasharray = '10,4,2,4';

                let handlesHtml = '';
                if (isSel) {
                    handlesHtml = `
                        <div class="annotation-line-handle" style="left:${lx1}px; top:${ly1}px;" title="Arrastrar Inicio de Línea" onmousedown="event.stopPropagation(); AssetDesigner.startDragLineHandle(event, AssetDesigner.currentAsset.annotations.find(x => x.id === '${a.id}'), 'start');"></div>
                        <div class="annotation-line-handle" style="left:${lx2}px; top:${ly2}px;" title="Arrastrar Fin de Línea" onmousedown="event.stopPropagation(); AssetDesigner.startDragLineHandle(event, AssetDesigner.currentAsset.annotations.find(x => x.id === '${a.id}'), 'end');"></div>
                    `;
                }

                itemEl.innerHTML = `
                    <svg style="width:100%; height:100%; overflow:visible; pointer-events:none;">
                        <defs>
                            <marker id="${markerId}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                                <path d="M0,0 L0,6 L7,3 z" fill="${a.color || '#4fc3f7'}" />
                            </marker>
                            <marker id="${circleId}" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto" markerUnits="strokeWidth">
                                <circle cx="3" cy="3" r="3" fill="${a.color || '#4fc3f7'}" />
                            </marker>
                        </defs>
                        <line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" 
                              stroke="${a.color || '#4fc3f7'}" 
                              stroke-width="${a.strokeWidth || 3}" 
                              stroke-dasharray="${dasharray}"
                              marker-end="${a.endCap === 'arrow' ? `url(#${markerId})` : (a.endCap === 'circle' ? `url(#${circleId})` : 'none')}"
                              style="pointer-events:stroke; cursor:pointer;" />
                    </svg>
                    ${handlesHtml}
                `;
            }

            itemEl.onmousedown = (e) => {
                e.stopPropagation();
                AssetDesigner.selectAnnotation(a.id);
                if (!e.altKey && !AssetDesigner.isResizingAnnotation && !AssetDesigner.isDraggingLineHandle) {
                    AssetDesigner.isDraggingAnnotation = true;
                    AssetDesigner.dragAnnotation = a;
                    AssetDesigner.dragAnnotationLastPos = { x: e.clientX, y: e.clientY };
                }
            };

            targetContainer.appendChild(itemEl);
        });
    },

    // --- INTERACTIVE ANNOTATION HANDLERS ---
    startResizeAnnotation: (e, ann, corner) => {
        AssetDesigner.isResizingAnnotation = true;
        AssetDesigner.resizeAnnotation = ann;
        AssetDesigner.resizeHandleCorner = corner;
        AssetDesigner.resizeStart = {
            clientX: e.clientX,
            clientY: e.clientY,
            x: ann.x,
            y: ann.y,
            width: ann.width || 180,
            height: ann.height || 45
        };
    },

    startDragLineHandle: (e, ann, handleType) => {
        AssetDesigner.isDraggingLineHandle = true;
        AssetDesigner.dragLineAnnotation = ann;
        AssetDesigner.dragLineHandleType = handleType;
    },

    finishEditingAnnotation: (id, text) => {
        AssetDesigner.editingAnnotationId = null;
        AssetDesigner.updateAnnotationProp(id, 'text', text);
    },

    cancelEditingAnnotation: () => {
        AssetDesigner.editingAnnotationId = null;
        AssetDesigner.renderCanvas();
    },

    // --- MINIMAP LOGIC ---
    toggleMinimap: () => {
        AssetDesigner.isMinimapCollapsed = !AssetDesigner.isMinimapCollapsed;
        const container = document.getElementById('ad-minimap-container');
        const toggleBtn = container ? container.querySelector('.canvas-minimap-toggle') : null;
        if (container) {
            container.classList.toggle('collapsed', AssetDesigner.isMinimapCollapsed);
        }
        if (toggleBtn) {
            toggleBtn.textContent = AssetDesigner.isMinimapCollapsed ? '◻' : '−';
        }
        if (!AssetDesigner.isMinimapCollapsed) {
            AssetDesigner.renderMinimap();
        }
    },

    getCanvasBounds: () => {
        let minX = -200, minY = -200, maxX = 1200, maxY = 800;
        if (AssetDesigner.currentAsset && AssetDesigner.currentAsset.nodes) {
            AssetDesigner.currentAsset.nodes.forEach(n => {
                if (n.x < minX) minX = n.x - 100;
                if (n.y < minY) minY = n.y - 100;
                if (n.x + 200 > maxX) maxX = n.x + 200;
                if (n.y + 100 > maxY) maxY = n.y + 100;
            });
        }
        if (AssetDesigner.currentAsset && AssetDesigner.currentAsset.annotations) {
            AssetDesigner.currentAsset.annotations.forEach(a => {
                const ax = a.x !== undefined ? a.x : (a.x1 || 0);
                const ay = a.y !== undefined ? a.y : (a.y1 || 0);
                const aw = a.width || (Math.abs((a.x2||0) - (a.x1||0)) || 100);
                const ah = a.height || (Math.abs((a.y2||0) - (a.y1||0)) || 50);
                if (ax < minX) minX = ax - 100;
                if (ay < minY) minY = ay - 100;
                if (ax + aw > maxX) maxX = ax + aw + 100;
                if (ay + ah > maxY) maxY = ay + ah + 100;
            });
        }
        return { minX, minY, maxX, maxY, width: Math.max(800, maxX - minX), height: Math.max(600, maxY - minY) };
    },

    renderMinimap: () => {
        const svg = document.getElementById('ad-minimap-svg');
        if (!svg || AssetDesigner.isMinimapCollapsed || !AssetDesigner.currentAsset) return;

        const bounds = AssetDesigner.getCanvasBounds();
        const mmW = 200;
        const mmH = 130;

        const scaleX = mmW / bounds.width;
        const scaleY = mmH / bounds.height;
        const scale = Math.min(scaleX, scaleY);

        AssetDesigner._mmScale = scale;
        AssetDesigner._mmBounds = bounds;
        AssetDesigner._mmOffsetX = (mmW - bounds.width * scale) / 2;
        AssetDesigner._mmOffsetY = (mmH - bounds.height * scale) / 2;

        let content = '';

        // Draw Annotations / Shapes preview
        if (AssetDesigner.currentAsset.annotations) {
            AssetDesigner.currentAsset.annotations.forEach(a => {
                if (a.type === 'shape' || a.type === 'text') {
                    const sx = AssetDesigner._mmOffsetX + (a.x - bounds.minX) * scale;
                    const sy = AssetDesigner._mmOffsetY + (a.y - bounds.minY) * scale;
                    const sw = (a.width || 100) * scale;
                    const sh = (a.height || 40) * scale;
                    content += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="rgba(255,255,255,0.08)" stroke="#555" stroke-width="0.5" rx="${a.type==='shape'&&(a.shapeType==='circle'||a.shapeType==='oval')?sw/2:1}"/>`;
                } else if (a.type === 'line') {
                    const x1 = AssetDesigner._mmOffsetX + (a.x1 - bounds.minX) * scale;
                    const y1 = AssetDesigner._mmOffsetY + (a.y1 - bounds.minY) * scale;
                    const x2 = AssetDesigner._mmOffsetX + (a.x2 - bounds.minX) * scale;
                    const y2 = AssetDesigner._mmOffsetY + (a.y2 - bounds.minY) * scale;
                    content += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${a.color || '#4fc3f7'}" stroke-width="1"/>`;
                }
            });
        }

        // Draw Nodes preview
        AssetDesigner.currentAsset.nodes.forEach(n => {
            const sx = AssetDesigner._mmOffsetX + (n.x - bounds.minX) * scale;
            const sy = AssetDesigner._mmOffsetY + (n.y - bounds.minY) * scale;
            const sw = 150 * scale;
            const sh = 60 * scale;
            let col = '#424242';
            if (n.isProcess) col = '#9c27b0';
            else if (n.isMainCategory) col = '#ff9800';
            else if (n.isCategory) col = '#f57c00';
            else if (n.isItem) col = '#2196f3';
            else if (n.type === 'file') col = '#4caf50';
            content += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="${col}" rx="1"/>`;
        });

        svg.innerHTML = content;
        AssetDesigner.updateMinimapViewport();
    },

    updateMinimapViewport: () => {
        const vp = document.getElementById('ad-minimap-viewport');
        const canvasArea = document.getElementById('ad-canvas-area');
        if (!vp || !canvasArea || !AssetDesigner._mmBounds || !AssetDesigner._mmScale || AssetDesigner.isMinimapCollapsed) return;

        const bounds = AssetDesigner._mmBounds;
        const scale = AssetDesigner._mmScale;
        const offX = AssetDesigner._mmOffsetX || 0;
        const offY = AssetDesigner._mmOffsetY || 0;

        const cW = canvasArea.clientWidth;
        const cH = canvasArea.clientHeight;
        const zoom = AssetDesigner.zoomLevel;
        const panX = AssetDesigner.panOffset.x;
        const panY = AssetDesigner.panOffset.y;

        const worldLeft = -panX / zoom;
        const worldTop = -panY / zoom;
        const worldW = cW / zoom;
        const worldH = cH / zoom;

        const vx = offX + (worldLeft - bounds.minX) * scale;
        const vy = offY + (worldTop - bounds.minY) * scale;
        const vw = worldW * scale;
        const vh = worldH * scale;

        vp.style.left = `${Math.max(0, Math.min(200 - 4, vx))}px`;
        vp.style.top = `${Math.max(0, Math.min(130 - 4, vy))}px`;
        vp.style.width = `${Math.max(6, Math.min(200, vw))}px`;
        vp.style.height = `${Math.max(6, Math.min(130, vh))}px`;
    },

    onMinimapMouseDown: (e) => {
        e.stopPropagation();
        e.preventDefault();
        AssetDesigner.isDraggingMinimap = true;
        AssetDesigner.panToMinimapPos(e);
    },

    onMinimapMouseMove: (e) => {
        if (!AssetDesigner.isDraggingMinimap) return;
        AssetDesigner.panToMinimapPos(e);
    },

    panToMinimapPos: (e) => {
        const bodyEl = document.getElementById('ad-minimap-body');
        const canvasArea = document.getElementById('ad-canvas-area');
        if (!bodyEl || !canvasArea || !AssetDesigner._mmBounds || !AssetDesigner._mmScale) return;

        const rect = bodyEl.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const offX = AssetDesigner._mmOffsetX || 0;
        const offY = AssetDesigner._mmOffsetY || 0;
        const scale = AssetDesigner._mmScale;
        const bounds = AssetDesigner._mmBounds;

        const worldX = bounds.minX + (mx - offX) / scale;
        const worldY = bounds.minY + (my - offY) / scale;

        const cW = canvasArea.clientWidth;
        const cH = canvasArea.clientHeight;
        const zoom = AssetDesigner.zoomLevel;

        AssetDesigner.panOffset.x = cW / 2 - worldX * zoom;
        AssetDesigner.panOffset.y = cH / 2 - worldY * zoom;

        AssetDesigner.updateViewportTransform();
    },

    // --- COSMETIC ANNOTATIONS METHODS ---
    addAnnotation: (type, subType = 'rectangle') => {
        if (!AssetDesigner.currentAsset) return;
        if (!AssetDesigner.currentAsset.annotations) AssetDesigner.currentAsset.annotations = [];

        const canvasArea = document.getElementById('ad-canvas-area');
        const cW = canvasArea ? canvasArea.clientWidth : 800;
        const cH = canvasArea ? canvasArea.clientHeight : 600;
        const zoom = AssetDesigner.zoomLevel || 1;
        const cx = (-AssetDesigner.panOffset.x + cW / 2) / zoom;
        const cy = (-AssetDesigner.panOffset.y + cH / 2) / zoom;

        const newId = 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        let newAnn = null;

        if (type === 'text') {
            newAnn = {
                id: newId,
                type: 'text',
                text: 'Texto o Nota...',
                x: Math.round(cx - 90),
                y: Math.round(cy - 25),
                width: 200,
                height: 60,
                fontSize: 18,
                fontFamily: 'sans-serif',
                color: '#ffca28',
                isBold: true,
                isItalic: false,
                isUnderline: false,
                mode: 'none',
                strokeColor: '#ff9800',
                strokeWidth: 0,
                strokeStyle: 'solid',
                fillColor: '#1e293b',
                fillOpacity: 0.8,
                borderRadius: 4,
                padding: 6,
                layerOrder: 'front'
            };
        } else if (type === 'line') {
            newAnn = {
                id: newId,
                type: 'line',
                x1: Math.round(cx - 100),
                y1: Math.round(cy),
                x2: Math.round(cx + 100),
                y2: Math.round(cy),
                color: '#4fc3f7',
                strokeWidth: 3,
                strokeStyle: 'solid',
                endCap: 'arrow',
                layerOrder: 'front'
            };
        } else if (type === 'shape') {
            newAnn = {
                id: newId,
                type: 'shape',
                shapeType: subType || 'rectangle',
                x: Math.round(cx - 120),
                y: Math.round(cy - 70),
                width: subType === 'square' || subType === 'circle' ? 160 : 240,
                height: subType === 'square' || subType === 'circle' ? 160 : 140,
                mode: 'both',
                strokeColor: '#2196f3',
                strokeWidth: 2,
                strokeStyle: 'solid',
                fillColor: '#2196f3',
                fillOpacity: 0.15,
                borderRadius: 8,
                layerOrder: 'back'
            };
        }

        if (newAnn) {
            AssetDesigner.currentAsset.annotations.push(newAnn);
            AssetDesigner.selectAnnotation(newAnn.id);
            AssetDesigner.renderCanvas();
            AssetDesigner.updateSidebar();
            AssetDesigner.pushHistory();
            AssetDesigner.saveAsset();
        }
    },

    selectAnnotation: (id) => {
        AssetDesigner.selectedAnnotationId = id;
        AssetDesigner.selectedNodeId = null;
        AssetDesigner.selectedNodeIds = [];
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
    },

    updateAnnotationProp: (id, prop, value) => {
        if (!AssetDesigner.currentAsset || !AssetDesigner.currentAsset.annotations) return;
        const ann = AssetDesigner.currentAsset.annotations.find(a => a.id === id);
        if (!ann) return;

        ann[prop] = value;
        AssetDesigner.renderCanvas();
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    deleteAnnotation: (id) => {
        if (!AssetDesigner.currentAsset || !AssetDesigner.currentAsset.annotations) return;
        AssetDesigner.currentAsset.annotations = AssetDesigner.currentAsset.annotations.filter(a => a.id !== id);
        if (AssetDesigner.selectedAnnotationId === id) {
            AssetDesigner.selectedAnnotationId = null;
        }
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    updateBackground: () => {
        const canvas = document.getElementById('ad-canvas-area');
        if (canvas) {
            canvas.style.backgroundPosition = `${AssetDesigner.panOffset.x}px ${AssetDesigner.panOffset.y}px`;
            canvas.style.backgroundSize = `${20 * AssetDesigner.zoomLevel}px ${20 * AssetDesigner.zoomLevel}px`;
        }
    },

    drawConnection: (parent, child, svgGroup, type = 'local') => {
        const pX = parent.x + 150;
        const pY = parent.y + 35;

        // Target Y depends on input type
        // Standard/Local is Center or Bottom-Left (if sync)
        // Online is Top-Left

        let cX = child.x;
        let cY = child.y + 35; // Default center

        if (child.isSyncPoint) {
            // CSS: .ad-dot-in-online { top: 25% }, .ad-dot-in-local { top: 75% }
            const childEl = document.querySelector(`.ad-node[data-id="${child.id}"]`);
            let height = 70; // fallback
            if (childEl) height = childEl.offsetHeight;

            if (type === 'online') cY = child.y + (height * 0.25);
            if (type === 'local') cY = child.y + (height * 0.75);
        }

        const dist = Math.abs(cX - pX) * 0.5;
        const cpDist = Math.max(dist, 50);

        const d = `M ${pX} ${pY} C ${pX + cpDist} ${pY}, ${cX - cpDist} ${cY}, ${cX} ${cY}`;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "connector");

        // Color Logic: Trace ancestry to see if we are in Online or Local branch
        let strokeColor = "#555";

        // If explicitly Online type OR if this connection feeds into an Online Sync Point
        if (type === 'online') {
            strokeColor = "#4CAF50"; // Green
        } else if (AssetDesigner.isFeedingOnline(child.id)) {
            strokeColor = "#4CAF50"; // Propagate Green Backwards
        } else if (type === 'local' && child.isSyncPoint) {
            strokeColor = "#2196F3"; // Direct Blue Input
        } else if (AssetDesigner.isFeedingLocalSync(child.id)) {
            strokeColor = "#2196F3"; // Propagate Blue Backwards
        } else if (type === 'local') {
            strokeColor = "#555"; // Default Grey for non-sync paths
        }

        path.style.stroke = strokeColor;

        // Removed dashed line for Online per user request ("plena y no intermintente")

        path.setAttribute("stroke-width", 2 / AssetDesigner.zoomLevel);
        svgGroup.appendChild(path);
    },

    drawDraftConnection: (parent, endPos, svgGroup) => {
        const pX = parent.x + 150;
        const pY = parent.y + 35;
        const cX = endPos.x;
        const cY = endPos.y;

        const dist = Math.abs(cX - pX) * 0.5;
        const cpDist = Math.max(dist, 50);

        const d = `M ${pX} ${pY} C ${pX + cpDist} ${pY}, ${cX - cpDist} ${cY}, ${cX} ${cY}`;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "connector draft");
        path.setAttribute("stroke-width", 2 / AssetDesigner.zoomLevel);
        svgGroup.appendChild(path);
    },

    // --- INTERACTION ---
    selectNode: (id, isShift = false) => {
        if (!id) {
            AssetDesigner.selectedNodeIds = [];
        } else if (!isShift) {
            AssetDesigner.selectedNodeIds = [id];
        } else {
            const idx = AssetDesigner.selectedNodeIds.indexOf(id);
            if (idx === -1) {
                AssetDesigner.selectedNodeIds.push(id);
            } else {
                AssetDesigner.selectedNodeIds.splice(idx, 1);
            }
        }

        // Single selection compatibility
        AssetDesigner.selectedNodeId = AssetDesigner.selectedNodeIds.length === 1 ? AssetDesigner.selectedNodeIds[0] : null;

        AssetDesigner.renderCanvas(); // Re-render for selection highlight
        AssetDesigner.updateSidebar();
        AssetDesigner.updatePreview();
    },

    startDragNode: (e, node) => {
        AssetDesigner.isDraggingNode = true;
        AssetDesigner.dragNode = node;
        AssetDesigner.dragLastPos = { x: e.clientX, y: e.clientY };
    },

    // Connection Logic
    onDotOutDown: (nodeId, e) => {
        const node = AssetDesigner.currentAsset.nodes.find(n => n.id === nodeId);
        if (!node) return;

        AssetDesigner.isConnecting = true;
        AssetDesigner.connectionStartNode = node;
        // Start pos is mouse pos in canvas space
        const rect = document.getElementById('ad-canvas-area').getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert to canvas coords
        const canvasX = (mouseX - AssetDesigner.panOffset.x) / AssetDesigner.zoomLevel;
        const canvasY = (mouseY - AssetDesigner.panOffset.y) / AssetDesigner.zoomLevel;

        AssetDesigner.connectionCurrentPos = { x: canvasX, y: canvasY };
        document.body.style.cursor = 'crosshair';
    },

    onDotInDown: (nodeId, e, type = 'local') => {
        const node = AssetDesigner.currentAsset.nodes.find(n => n.id === nodeId);
        // Sync points can have parent (local) and parentOnline. Normal nodes just parent.
        // If type is 'online', we check/modify parentOnline.

        let currentParentId = (type === 'online') ? node.parentOnline : node.parent;

        if (!node || !currentParentId) return;

        // Disconnect logic:
        // 1. Remove parent ref immediately
        if (type === 'online') {
            node.parentOnline = null;
        } else {
            node.parent = null;
        }

        // 2. Start dragging "from" the parent (picked up the cable)
        AssetDesigner.isConnecting = true;
        const parent = AssetDesigner.currentAsset.nodes.find(n => n.id === currentParentId);
        AssetDesigner.connectionStartNode = parent;
        AssetDesigner.connectionType = type; // Store which type of connection we are dragging

        // Calc start pos (mouse)
        const rect = document.getElementById('ad-canvas-area').getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const canvasX = (mouseX - AssetDesigner.panOffset.x) / AssetDesigner.zoomLevel;
        const canvasY = (mouseY - AssetDesigner.panOffset.y) / AssetDesigner.zoomLevel;

        AssetDesigner.connectionCurrentPos = { x: canvasX, y: canvasY };

        document.body.style.cursor = 'crosshair';
        AssetDesigner.renderCanvas();
    },

    onCanvasMouseDown: (e) => {
        const isShift = e.shiftKey || e.ctrlKey;
        // ALT + Drag = PAN or Middle Click
        if ((e.altKey && e.button === 0) || e.button === 1) {
            AssetDesigner.isPanning = true;
            AssetDesigner.panStart = { x: e.clientX, y: e.clientY };
            document.body.style.cursor = 'grabbing';
            return;
        }

        // If clicked on dot, node or annotation, let their specific handlers work
        if (e.target.classList.contains('ad-dot') || e.target.closest('.ad-node') || e.target.closest('.canvas-annotation-item')) {
            return;
        }

        // Clicked on empty canvas space -> Clear node and annotation selection
        if (!isShift) {
            AssetDesigner.selectNode(null);
            AssetDesigner.selectedAnnotationId = null;
            AssetDesigner.updateSidebar();
        }

        AssetDesigner.isBoxSelecting = true;
        const rect = document.getElementById('ad-canvas-area').getBoundingClientRect();
        AssetDesigner.boxStart = {
            x: (e.clientX - rect.left - AssetDesigner.panOffset.x) / AssetDesigner.zoomLevel,
            y: (e.clientY - rect.top - AssetDesigner.panOffset.y) / AssetDesigner.zoomLevel
        };
        AssetDesigner.boxCurrent = { ...AssetDesigner.boxStart };
    },

    onCanvasMouseMove: (e) => {
        // PANNING (HIGH PERFORMANCE HARDWARE TRANSFORM)
        if (AssetDesigner.isPanning) {
            const dx = e.clientX - AssetDesigner.panStart.x;
            const dy = e.clientY - AssetDesigner.panStart.y;
            AssetDesigner.panOffset.x += dx;
            AssetDesigner.panOffset.y += dy;
            AssetDesigner.panStart = { x: e.clientX, y: e.clientY };
            AssetDesigner.scheduleUpdateTransform();
            return;
        }
        // RESIZING ANNOTATION
        else if (AssetDesigner.isResizingAnnotation && AssetDesigner.resizeAnnotation && AssetDesigner.resizeStart) {
            const dx = (e.clientX - AssetDesigner.resizeStart.clientX) / AssetDesigner.zoomLevel;
            const dy = (e.clientY - AssetDesigner.resizeStart.clientY) / AssetDesigner.zoomLevel;
            const ann = AssetDesigner.resizeAnnotation;
            const corner = AssetDesigner.resizeHandleCorner;
            const s = AssetDesigner.resizeStart;

            let newW = s.width;
            let newH = s.height;
            let newX = s.x;
            let newY = s.y;

            if (corner === 'se') {
                newW = Math.max(30, s.width + dx);
                newH = Math.max(20, s.height + dy);
            } else if (corner === 'ne') {
                newW = Math.max(30, s.width + dx);
                newH = Math.max(20, s.height - dy);
                newY = s.y + (s.height - newH);
            } else if (corner === 'sw') {
                newW = Math.max(30, s.width - dx);
                newH = Math.max(20, s.height + dy);
                newX = s.x + (s.width - newW);
            } else if (corner === 'nw') {
                newW = Math.max(30, s.width - dx);
                newH = Math.max(20, s.height - dy);
                newX = s.x + (s.width - newW);
                newY = s.y + (s.height - newH);
            }

            ann.width = Math.round(newW);
            ann.height = Math.round(newH);
            ann.x = Math.round(newX);
            ann.y = Math.round(newY);

            AssetDesigner.renderCanvas();
            AssetDesigner.updateSidebar();
        }
        // DRAGGING LINE ENDPOINT HANDLE
        else if (AssetDesigner.isDraggingLineHandle && AssetDesigner.dragLineAnnotation) {
            const rect = document.getElementById('ad-canvas-area').getBoundingClientRect();
            const canvasX = Math.round((e.clientX - rect.left - AssetDesigner.panOffset.x) / AssetDesigner.zoomLevel);
            const canvasY = Math.round((e.clientY - rect.top - AssetDesigner.panOffset.y) / AssetDesigner.zoomLevel);
            const ann = AssetDesigner.dragLineAnnotation;

            if (AssetDesigner.dragLineHandleType === 'start') {
                ann.x1 = canvasX;
                ann.y1 = canvasY;
            } else if (AssetDesigner.dragLineHandleType === 'end') {
                ann.x2 = canvasX;
                ann.y2 = canvasY;
            }

            AssetDesigner.renderCanvas();
            AssetDesigner.updateSidebar();
        }
        // DRAGGING ANNOTATION
        else if (AssetDesigner.isDraggingAnnotation && AssetDesigner.dragAnnotation) {
            const dx = (e.clientX - AssetDesigner.dragAnnotationLastPos.x) / AssetDesigner.zoomLevel;
            const dy = (e.clientY - AssetDesigner.dragAnnotationLastPos.y) / AssetDesigner.zoomLevel;
            const a = AssetDesigner.dragAnnotation;
            if (a.type === 'line') {
                a.x1 += dx;
                a.y1 += dy;
                a.x2 += dx;
                a.y2 += dy;
            } else {
                a.x += dx;
                a.y += dy;
            }
            AssetDesigner.dragAnnotationLastPos = { x: e.clientX, y: e.clientY };
            AssetDesigner.renderCanvas();
        }
        // DRAGGING NODE
        else if (AssetDesigner.isDraggingNode && AssetDesigner.dragNode) {
            const dx = (e.clientX - AssetDesigner.dragLastPos.x) / AssetDesigner.zoomLevel;
            const dy = (e.clientY - AssetDesigner.dragLastPos.y) / AssetDesigner.zoomLevel;
            if (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.length > 0) {
                AssetDesigner.selectedNodeIds.forEach(id => {
                    const n = AssetDesigner.currentAsset.nodes.find(node => node.id === id);
                    if (n) {
                        n.x += dx;
                        n.y += dy;
                    }
                });
            } else {
                AssetDesigner.dragNode.x += dx;
                AssetDesigner.dragNode.y += dy;
            }
            AssetDesigner.dragLastPos = { x: e.clientX, y: e.clientY };
            AssetDesigner.renderCanvas();
        }
        // CONNECTING
        else if (AssetDesigner.isConnecting) {
            const rect = document.getElementById('ad-canvas-area').getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const canvasX = (mouseX - AssetDesigner.panOffset.x) / AssetDesigner.zoomLevel;
            const canvasY = (mouseY - AssetDesigner.panOffset.y) / AssetDesigner.zoomLevel;

            AssetDesigner.connectionCurrentPos = { x: canvasX, y: canvasY };
            AssetDesigner.renderCanvas();

            document.querySelectorAll('.ad-dot-in').forEach(el => el.classList.remove('active'));
            const target = document.elementFromPoint(e.clientX, e.clientY);
            if (target && target.classList.contains('ad-dot-in')) {
                target.classList.add('active');
            }
        }
        // BOX SELECTING (MARQUEE)
        else if (AssetDesigner.isBoxSelecting) {
            const rect = document.getElementById('ad-canvas-area').getBoundingClientRect();
            AssetDesigner.boxCurrent = {
                x: (e.clientX - rect.left - AssetDesigner.panOffset.x) / AssetDesigner.zoomLevel,
                y: (e.clientY - rect.top - AssetDesigner.panOffset.y) / AssetDesigner.zoomLevel
            };
            AssetDesigner.renderCanvas();
        }
    },

    onCanvasMouseUp: (e) => {
        if (AssetDesigner.isBoxSelecting) {
            const isShift = e.shiftKey || e.ctrlKey;
            const minX = Math.min(AssetDesigner.boxStart.x, AssetDesigner.boxCurrent.x);
            const maxX = Math.max(AssetDesigner.boxStart.x, AssetDesigner.boxCurrent.x);
            const minY = Math.min(AssetDesigner.boxStart.y, AssetDesigner.boxCurrent.y);
            const maxY = Math.max(AssetDesigner.boxStart.y, AssetDesigner.boxCurrent.y);

            const isClick = Math.abs(AssetDesigner.boxStart.x - AssetDesigner.boxCurrent.x) < 5 &&
                            Math.abs(AssetDesigner.boxStart.y - AssetDesigner.boxCurrent.y) < 5;

            if (!isClick && AssetDesigner.currentAsset) {
                const nodesInBox = AssetDesigner.currentAsset.nodes.filter(n => {
                    const nodeMinX = n.x;
                    const nodeMaxX = n.x + 150;
                    const nodeMinY = n.y;
                    const nodeMaxY = n.y + 60;
                    return (nodeMinX <= maxX && nodeMaxX >= minX && nodeMinY <= maxY && nodeMaxY >= minY);
                });

                if (!isShift) AssetDesigner.selectedNodeIds = [];
                nodesInBox.forEach(n => {
                    if (!AssetDesigner.selectedNodeIds.includes(n.id)) {
                        AssetDesigner.selectedNodeIds.push(n.id);
                    }
                });

                AssetDesigner.selectedNodeId = AssetDesigner.selectedNodeIds.length === 1 ? AssetDesigner.selectedNodeIds[0] : null;
            }

            AssetDesigner.isBoxSelecting = false;
            AssetDesigner.renderCanvas();
            AssetDesigner.updateSidebar();
            AssetDesigner.updatePreview();
        }

        if (AssetDesigner.isPanning) {
            AssetDesigner.isPanning = false;
            document.body.style.cursor = 'default';
            AssetDesigner.updateBackground();
        }

        if (AssetDesigner.isResizingAnnotation) {
            AssetDesigner.isResizingAnnotation = false;
            AssetDesigner.resizeAnnotation = null;
            AssetDesigner.resizeHandleCorner = null;
            AssetDesigner.resizeStart = null;
            AssetDesigner.pushHistory();
            AssetDesigner.saveAsset();
        }

        if (AssetDesigner.isDraggingLineHandle) {
            AssetDesigner.isDraggingLineHandle = false;
            AssetDesigner.dragLineAnnotation = null;
            AssetDesigner.dragLineHandleType = null;
            AssetDesigner.pushHistory();
            AssetDesigner.saveAsset();
        }

        if (AssetDesigner.isDraggingAnnotation) {
            AssetDesigner.isDraggingAnnotation = false;
            AssetDesigner.dragAnnotation = null;
            AssetDesigner.pushHistory();
            AssetDesigner.saveAsset();
        }

        if (AssetDesigner.isDraggingNode) {
            AssetDesigner.isDraggingNode = false;
            AssetDesigner.dragNode = null;
            AssetDesigner.pushHistory();
            AssetDesigner.saveAsset();
        }

        if (AssetDesigner.isConnecting) {
            const target = document.elementFromPoint(e.clientX, e.clientY);

            if (target && target.classList.contains('ad-dot-in')) {
                const nodeEl = target.closest('.ad-node');
                if (nodeEl) {
                    const targetId = nodeEl.getAttribute('data-id');
                    const connectionType = target.classList.contains('ad-dot-in-online') ? 'online' : 'local';

                    if (targetId !== AssetDesigner.connectionStartNode.id) {
                        AssetDesigner.connectNodes(AssetDesigner.connectionStartNode.id, targetId, connectionType);
                    }
                }
            }

            AssetDesigner.isConnecting = false;
            AssetDesigner.connectionStartNode = null;
            AssetDesigner.connectionType = null;
            document.body.style.cursor = 'default';
            document.querySelectorAll('.ad-dot-in').forEach(el => el.classList.remove('active'));

            AssetDesigner.renderCanvas();
        }
    },

    onCanvasWheel: (e) => {
        e.preventDefault();
        const canvasArea = document.getElementById('ad-canvas-area');
        if (!canvasArea) return;
        const rect = canvasArea.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomSpeed = 0.08;
        const delta = -Math.sign(e.deltaY) * zoomSpeed;
        const oldZoom = AssetDesigner.zoomLevel;
        const newZoom = Math.min(Math.max(0.15, oldZoom * (1 + delta)), 3.5);

        // Zoom toward mouse pointer
        const worldX = (mouseX - AssetDesigner.panOffset.x) / oldZoom;
        const worldY = (mouseY - AssetDesigner.panOffset.y) / oldZoom;

        AssetDesigner.zoomLevel = newZoom;
        AssetDesigner.panOffset.x = mouseX - worldX * newZoom;
        AssetDesigner.panOffset.y = mouseY - worldY * newZoom;

        AssetDesigner.scheduleUpdateTransform();
    },

    onKeyDown: (e) => {
        // Only if Asset Designer is active view
        if (document.getElementById('view-asset-designer').style.display === 'none') return;

        // If typing in input, don't trigger global shortcuts
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (e.shiftKey) {
                    AssetDesigner.redo();
                } else {
                    AssetDesigner.undo();
                }
                return;
            } else if (e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                AssetDesigner.redo();
                return;
            } else if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                if (AssetDesigner.selectedAnnotationId) {
                    const ann = AssetDesigner.currentAsset.annotations.find(a => a.id === AssetDesigner.selectedAnnotationId);
                    if (ann) {
                        const copy = JSON.parse(JSON.stringify(ann));
                        copy.id = 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                        if (copy.type === 'line') {
                            copy.x1 += 30; copy.y1 += 30; copy.x2 += 30; copy.y2 += 30;
                        } else {
                            copy.x += 30; copy.y += 30;
                        }
                        AssetDesigner.currentAsset.annotations.push(copy);
                        AssetDesigner.selectAnnotation(copy.id);
                        AssetDesigner.pushHistory();
                        AssetDesigner.saveAsset();
                    }
                } else {
                    AssetDesigner.duplicateSelected();
                }
                return;
            } else if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                if (e.shiftKey) {
                    AssetDesigner.copyNodeConfig();
                } else {
                    AssetDesigner.copySelected();
                }
                return;
            } else if (e.key === 'v' || e.key === 'V') {
                e.preventDefault();
                if (e.shiftKey) {
                    AssetDesigner.pasteNodeConfig();
                } else {
                    AssetDesigner.pasteSelected();
                }
                return;
            }
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (AssetDesigner.selectedAnnotationId) {
                AssetDesigner.deleteAnnotation(AssetDesigner.selectedAnnotationId);
            } else {
                AssetDesigner.deleteSelected();
            }
        }

        if (e.key === 'Enter') {
            if (AssetDesigner.selectedAnnotationId) {
                const ann = AssetDesigner.currentAsset.annotations.find(a => a.id === AssetDesigner.selectedAnnotationId);
                if (ann && ann.type === 'text') {
                    AssetDesigner.editingAnnotationId = ann.id;
                    AssetDesigner.renderCanvas();
                }
            } else if (AssetDesigner.selectedNodeId) {
                AssetDesigner.startRenaming(AssetDesigner.selectedNodeId);
            }
        }
    },

    // Link Logic
    connectNodes: (parentId, childId, type = 'local') => {
        const child = AssetDesigner.currentAsset.nodes.find(n => n.id === childId);
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

            AssetDesigner.renderCanvas(); // Force redraw
            AssetDesigner.pushHistory();
            AssetDesigner.saveAsset();
        }
    },

    // Recursively check if a node eventually feeds into an Online Sync Point
    isFeedingOnline: (nodeId, visited = new Set()) => {
        if (visited.has(nodeId)) return false; // Cycle prevention
        visited.add(nodeId);

        // Find all nodes that have THIS node as a parent (children)
        // If any child is a Sync Point AND uses this node as `parentOnline`, then YES.
        // If any child is a Normal Node AND usages this node as `parent` AND that child isFeedingOnline, then YES.

        const children = AssetDesigner.currentAsset.nodes.filter(n => n.parent === nodeId || n.parentOnline === nodeId);

        for (const child of children) {
            // Case 1: Child is Sync Point
            if (child.isSyncPoint) {
                if (child.parentOnline === nodeId) return true;
                // Stop propagation if connected via Local
                continue;
            }

            // Case 2: Normal Node - Recurse
            if (child.parent === nodeId) {
                if (AssetDesigner.isFeedingOnline(child.id, visited)) return true;
            }
        }

        return false;
    },

    isFeedingLocalSync: (nodeId, visited = new Set()) => {
        if (visited.has(nodeId)) return false;
        visited.add(nodeId);

        // Only check 'parent' connection (Local)
        const children = AssetDesigner.currentAsset.nodes.filter(n => n.parent === nodeId);

        for (const child of children) {
            // Case 1: Child is Sync Point
            if (child.isSyncPoint) {
                if (child.parent === nodeId) return true;
                continue;
            }

            if (child.parent === nodeId) {
                if (AssetDesigner.isFeedingLocalSync(child.id, visited)) return true;
            }
        }

        return false;
    },

    checkIsAncestor: (potentialAncestorId, nodeId) => {
        // TODO: Update to check both parent and parentOnline
        let curr = AssetDesigner.currentAsset.nodes.find(n => n.id === nodeId);
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
            if (curr.parentOnline && AssetDesigner.checkIsAncestor(potentialAncestorId, curr.parentOnline)) return true; // Recursion for online branch

            curr = AssetDesigner.currentAsset.nodes.find(n => n.id === curr.parent);
        }
        return false;
    },



    // --- SIDEBAR LOGIC ---
    updateSidebar: () => {
        const title = document.getElementById('ad-sidebar-title');
        const content = document.getElementById('ad-sidebar-content');
        if (!title || !content) return;

        if (AssetDesigner.selectedNodeId) {
            const node = AssetDesigner.currentAsset.nodes.find(n => n.id === AssetDesigner.selectedNodeId);
            title.innerText = "Configuración de Nodo";
            content.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:10px;">
                    
                    <!-- NAME -->
                    <div style="display:flex; flex-direction:column;">
                        <label class="prop-label" style="margin-bottom:5px;">Nombre</label>
                        <input class="prop-input" style="width:100%; box-sizing:border-box;" value="${node.name}" onchange="AssetDesigner.updateNodeProp('${node.id}', 'name', this.value)">
                    </div>

                    <!-- EXAMPLE (Always visible but logic applied?) -->
                    <div style="display:flex; flex-direction:column;">
                        <label class="prop-label" style="margin-bottom:5px;">Ejemplo (se habilita con cosas variables, categorias o proceso)</label>
                        <input class="prop-input" style="width:100%; box-sizing:border-box;" 
                               placeholder="Editor de ejemplo" 
                               value="${node.exampleValue || ''}" 
                               ${(node.isVariable || node.isCategory || node.isProcess) ? '' : 'disabled style="opacity:0.5; cursor:not-allowed;"'}
                               onchange="AssetDesigner.updateNodeProp('${node.id}', 'exampleValue', this.value)">
                    </div>

                    <hr style="border: 0; border-top: 1px solid #444; margin: 5px 0; width:100%;">

                    <!-- TYPE | SYNC POINT -->
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <div style="flex:1; margin-right:10px;">
                            <div style="display:flex; align-items:center;">
                                <label class="prop-label" style="min-width:40px;">Tipo</label>
                                <select class="prop-input" style="flex:1;" onchange="AssetDesigner.updateNodeProp('${node.id}', 'type', this.value)">
                                    <option value="folder" ${node.type === 'folder' ? 'selected' : ''}>Carpeta</option>
                                    <option value="unit" ${node.type === 'unit' ? 'selected' : ''}>Unidad</option>
                                    <option value="file" ${node.type === 'file' ? 'selected' : ''}>Archivo</option>
                                </select>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center;">
                            <label class="prop-label" style="margin-right:10px;">Sync point</label>
                            <input type="checkbox" ${node.isSyncPoint ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isSyncPoint', this.checked)">
                        </div>
                    </div>

                    <!-- CLIENT | PROJECT ROLES -->
                    <div style="display:flex; align-items:center; justify-content: space-around; background:#222; padding:5px; border-radius:4px; margin:5px 0;">
                        <div style="display:flex; align-items:center;" title="Define este nodo como el nivel Cliente">
                            <label class="prop-label" style="margin-right:5px; color:#4CAF50;">Es Cliente</label>
                            <input type="checkbox" ${node.isClientNode ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isClientNode', this.checked)">
                        </div>
                        <div style="display:flex; align-items:center;" title="Define este nodo como el nivel Proyecto">
                            <label class="prop-label" style="margin-right:5px; color:#2196F3;">Es Proyecto</label>
                            <input type="checkbox" ${node.isProjectNode ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isProjectNode', this.checked)">
                        </div>
                    </div>

                    <hr style="border: 0; border-top: 1px solid #444; margin: 5px 0; width:100%;">

                    <!-- FIXED | VARIABLE -->
                    <div style="display:flex; align-items:center; justify-content: space-around;">
                        <div style="display:flex; align-items:center;">
                            <label class="prop-label" style="margin-right:10px;">Fijo</label>
                            <input type="checkbox" ${!node.isVariable ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isVariable', !this.checked); AssetDesigner.updateSidebar();">
                        </div>
                        <div style="display:flex; align-items:center;">
                            <label class="prop-label" style="margin-right:10px;">Variable</label>
                            <input type="checkbox" ${node.isVariable ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isVariable', this.checked); AssetDesigner.updateSidebar();">
                        </div>
                    </div>

                    <!-- VARIABLE NAME (Only if Variable) -->
                    ${node.isVariable ? `
                    <div style="display:flex; flex-direction:column; margin-top:5px;">
                        <label class="prop-label" style="margin-bottom:5px;">Nombre Variable</label>
                        <input class="prop-input" style="width:100%; box-sizing:border-box;" placeholder="Editor de nombre de variable" value="${node.variableName || ''}" onchange="AssetDesigner.updateNodeProp('${node.id}', 'variableName', this.value)">
                    </div>
                    ` : ''}

                    <hr style="border: 0; border-top: 1px solid #444; margin: 5px 0; width:100%;">

                    <!-- ROLES: MAIN CAT | SUB CAT | ITEM | PROCESO -->
                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; background:#1e1e1e; padding:6px 8px; border-radius:4px;">
                        <div style="display:flex; align-items:center;" title="Categoría Principal (ej: 2D, 3D)">
                            <label class="prop-label" style="margin-right:4px; color:#ba68c8; font-size:0.75rem;">Main Cat</label>
                            <input type="checkbox" ${node.isMainCategory ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isMainCategory', this.checked); AssetDesigner.updateSidebar();">
                        </div>
                        <div style="display:flex; align-items:center;" title="Sub Categoría (ej: chars, props, env)">
                            <label class="prop-label" style="margin-right:4px; color:#f06292; font-size:0.75rem;">Sub Cat</label>
                            <input type="checkbox" ${node.isCategory ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isCategory', this.checked); AssetDesigner.updateSidebar();">
                        </div>
                        <div style="display:flex; align-items:center;" title="Item / Asset (ej: pepe, auto, arbol)">
                            <label class="prop-label" style="margin-right:4px; color:#64b5f6; font-size:0.75rem;">Item</label>
                            <input type="checkbox" ${node.isItem ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isItem', this.checked); AssetDesigner.updateSidebar();">
                        </div>
                        <div style="display:flex; align-items:center;" title="Proceso de Asset (ej: model, texture, rig, compo)">
                            <label class="prop-label" style="margin-right:4px; color:#81c784; font-size:0.75rem;">Proceso</label>
                            <input type="checkbox" ${node.isProcess ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isProcess', this.checked); AssetDesigner.updateSidebar();">
                        </div>
                    </div>

                    <!-- SPECIFIC CONFIGS -->
                    <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                        
                        <!-- MAIN CATEGORY CONFIG -->
                        ${node.isMainCategory ? `
                        <div class="panel-section" style="border:1px solid #9c27b0; padding:6px; border-radius:4px; background:rgba(156,39,176,0.05);">
                            <label class="prop-label" style="color:#ba68c8; font-weight:bold;">Configuración de Main Category</label>
                            
                            <div style="display:flex; gap:10px; margin:5px 0;">
                                <label><input type="radio" name="mainCatType" ${(!node.mainCategoryConfig || !node.mainCategoryConfig.type || node.mainCategoryConfig.type === 'parent') ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'mainCategoryConfig.type', 'parent')"> Parent</label>
                                <label><input type="radio" name="mainCatType" ${(node.mainCategoryConfig && node.mainCategoryConfig.type === 'custom') ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'mainCategoryConfig.type', 'custom')"> Custom</label>
                            </div>

                            ${(!node.mainCategoryConfig || !node.mainCategoryConfig.type || node.mainCategoryConfig.type === 'parent') ? `
                            <div style="display:flex; flex-direction:column;">
                                <label class="prop-label" style="font-size:0.75em;">Cosmetic Name (Linked)</label>
                                <div style="font-size:0.7em; color:#888; margin-bottom:2px;">Se aplica a hermanos Main Category</div>
                                <input class="prop-input" value="${node.mainCategoryConfig?.cosmeticName || ''}" onchange="AssetDesigner.updateNodeProp('${node.id}', 'mainCategoryConfig.cosmeticName', this.value)">
                            </div>
                            ` : `
                            <div style="display:flex; flex-direction:column;">
                                <label class="prop-label" style="font-size:0.75em;">Custom Name</label>
                                <input class="prop-input" value="${node.mainCategoryConfig?.customName || ''}" onchange="AssetDesigner.updateNodeProp('${node.id}', 'mainCategoryConfig.customName', this.value)">
                            </div>
                            `}
                        </div>
                        ` : ''}

                        <!-- SUB CATEGORY CONFIG -->
                        ${node.isCategory ? `
                        <div class="panel-section" style="border:1px solid #e91e63; padding:6px; border-radius:4px; background:rgba(233,30,99,0.05);">
                            <label class="prop-label" style="color:#f06292; font-weight:bold;">Configuración de Sub Categoría</label>
                            
                            <div style="display:flex; gap:10px; margin:5px 0;">
                                <label><input type="radio" name="catType" ${(!node.categoryConfig || !node.categoryConfig.type || node.categoryConfig.type === 'parent') ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'categoryConfig.type', 'parent')"> Parent</label>
                                <label><input type="radio" name="catType" ${(node.categoryConfig && node.categoryConfig.type === 'custom') ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'categoryConfig.type', 'custom')"> Custom</label>
                            </div>

                            ${(!node.categoryConfig || !node.categoryConfig.type || node.categoryConfig.type === 'parent') ? `
                            <div style="display:flex; flex-direction:column;">
                                <label class="prop-label" style="font-size:0.75em;">Cosmetic Name (Linked)</label>
                                <div style="font-size:0.7em; color:#888; margin-bottom:2px;">Se aplica a todos los hermanos</div>
                                <input class="prop-input" value="${node.categoryConfig?.cosmeticName || ''}" onchange="AssetDesigner.updateNodeProp('${node.id}', 'categoryConfig.cosmeticName', this.value)">
                            </div>
                            ` : `
                            <div style="display:flex; flex-direction:column;">
                                <label class="prop-label" style="font-size:0.75em;">Custom Name</label>
                                <input class="prop-input" value="${node.categoryConfig?.customName || ''}" onchange="AssetDesigner.updateNodeProp('${node.id}', 'categoryConfig.customName', this.value)">
                            </div>
                            `}
                        </div>
                        ` : ''}

                        <!-- ITEM CONFIG -->
                        ${node.isItem ? `
                        <div class="panel-section" style="border:1px solid #2196f3; padding:6px; border-radius:4px; background:rgba(33,150,243,0.05);">
                            <label class="prop-label" style="color:#64b5f6; font-weight:bold;">Configuración de Item</label>
                            
                            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">Focus Asset</label>
                                <input type="checkbox" ${node.isAssetFocus ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isAssetFocus', this.checked)">
                            </div>
                            
                            <!-- COSMETIC NAME (Only if Variable) -->
                            ${node.isVariable ? `
                            <div style="display:flex; flex-direction:column; margin:5px 0;">
                                <label class="prop-label" style="font-size:0.75em;">Cosmetic Name (App Legend)</label>
                                <input class="prop-input" value="${node.itemConfig?.cosmeticName || ''}" placeholder="Nombre de item..." onchange="AssetDesigner.updateNodeProp('${node.id}', 'itemConfig.cosmeticName', this.value)">
                            </div>
                            ` : ''}

                             <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0; opacity:0.5;">
                                <label class="prop-label">Name Rules</label>
                                <input type="checkbox" disabled title="Próximamente">
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">Parent Category</label>
                                <input type="checkbox" ${node.itemConfig?.allowMultiParent ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'itemConfig.allowMultiParent', this.checked)">
                            </div>
                        </div>
                        ` : ''}

                        <!-- PROCESS CONFIG -->
                        ${node.isProcess ? `
                        <div class="panel-section" style="border:1px solid #4caf50; padding:6px; border-radius:4px; background:rgba(76,175,80,0.05);">
                             <label class="prop-label" style="color:#81c784; font-weight:bold;">Configuración de Proceso</label>
                             
                             <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">Default (On by default)</label>
                                <input type="checkbox" ${(node.processConfig?.isDefault !== false) ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'processConfig.isDefault', this.checked)">
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">Parent Item (Multi-Input)</label>
                                <input type="checkbox" ${node.processConfig?.parentItem ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'processConfig.parentItem', this.checked)">
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">File Container</label>
                                <input type="checkbox" ${node.isFileContainer ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isFileContainer', this.checked)">
                            </div>
                        </div>
                        ` : ''}

                         <!-- NAME CONSTRUCTOR -->
                        <div class="panel-section" style="border:1px solid #444; padding:5px; border-radius:4px; margin-top:10px;">
                            <label class="prop-label" style="color:#00E676;">Name Constructor</label>
                            
                            <div style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                                <label class="prop-label">Habilitar</label>
                                <input type="checkbox" ${node.nameConfig?.enabled ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'nameConfig.enabled', this.checked); AssetDesigner.updateSidebar();">
                            </div>

                            ${node.nameConfig?.enabled ? `
                                <div style="display:flex; flex-direction:column; gap:5px; margin-top:5px;">
                                    <label class="prop-label" style="font-size:0.75em;">Pattern (e.g. [ASSET]_[VAR])</label>
                                    <input class="prop-input" id="nc-pattern-${node.id}" value="${node.nameConfig?.pattern || ''}" 
                                        placeholder="[ASSET]_[PROCESO]_[version]"
                                        onchange="AssetDesigner.updateNodeProp('${node.id}', 'nameConfig.pattern', this.value)">
                                    
                                    <div style="display:flex; flex-direction:column; gap:5px; margin-top:5px;">
                                        <label class="prop-label" style="font-size:0.75em;">Tags Disponibles</label>
                                        <div style="display:flex; gap:3px; flex-wrap:wrap;">
                                            <!-- Dynamic and Semantic Tags -->
                                            ${(() => {
                                                const vars = new Set();
                                                const btns = [];

                                                AssetDesigner.currentAsset.nodes.forEach(n => {
                                                    if (n.isVariable || n.isMainCategory || n.isCategory || n.isItem || n.isProjectNode || n.isClientNode) {
                                                        const vName = AssetDesigner.getEffectiveVarName(n);
                                                        if (!vars.has(vName)) {
                                                            vars.add(vName);
                                                            let colorClass = 'var';
                                                            if (n.isMainCategory) colorClass = 'scene';
                                                            else if (n.isCategory) colorClass = 'scene';
                                                            else if (n.isItem) colorClass = 'item';
                                                            else if (n.isProjectNode || n.isClientNode) colorClass = 'sys';
                                                            btns.push(`<button class="nc-tag-btn ${colorClass}" onclick="AssetDesigner.appendNameTag('${node.id}', '[${vName}]')">[${vName}]</button>`);
                                                        }
                                                    }
                                                    if (n.hasNickVar) {
                                                        const nVar = n.nickVarName || 'NICK';
                                                        if (!vars.has(nVar)) {
                                                            vars.add(nVar);
                                                            btns.push(`<button class="nc-tag-btn sys" onclick="AssetDesigner.appendNameTag('${node.id}', '[${nVar}]')">[${nVar}]</button>`);
                                                        }
                                                    }
                                                });
                                                return btns.join('');
                                            })()}

                                            <button class="nc-tag-btn proc" onclick="AssetDesigner.appendNameTag('${node.id}', '[PROCESO]')">[PROC]</button>
                                            <button class="nc-tag-btn sys" onclick="AssetDesigner.appendNameTag('${node.id}', '[version]')">[VER]</button>
                                            <button class="nc-tag-btn sys" onclick="AssetDesigner.appendNameTag('${node.id}', '[ext]')">[ext]</button>
                                        </div>
                                    </div>

                                    <!-- Allowed Extensions -->
                                    <div style="margin-top:5px;">
                                        <label class="prop-label" style="font-size:0.75em;">Allowed Extensions (e.g. blend, fbx)</label>
                                        <input class="prop-input" value="${node.nameConfig?.allowedExtensions || ''}" 
                                            placeholder="blend, fbx, obj"
                                            onchange="AssetDesigner.updateNodeProp('${node.id}', 'nameConfig.allowedExtensions', this.value)">
                                    </div>

                                    <!-- Version Config -->
                                    <div style="margin-top:5px; border-top:1px dashed #555; padding-top:5px;">
                                        <label class="prop-label" style="font-size:0.75em;">Version Config</label>
                                        <div style="display:flex; justify-content:space-between; align-items:center;">
                                            <label class="prop-label" style="font-size:0.7em;">Prefix 'v'</label>
                                            <input type="checkbox" ${node.nameConfig?.versionPrefix !== false ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'nameConfig.versionPrefix', this.checked)">
                                        </div>
                                        <div style="display:flex; justify-content:space-between; align-items:center;">
                                            <label class="prop-label" style="font-size:0.7em;">Padding (e.g. 001)</label>
                                            <input type="number" min="1" max="5" value="${node.nameConfig?.versionPadding || 3}" 
                                                style="width:40px; background:#222; color:#fff; border:1px solid #444;"
                                                onchange="AssetDesigner.updateNodeProp('${node.id}', 'nameConfig.versionPadding', parseInt(this.value))">
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                    </div>

                </div>
            `;
        } else if (AssetDesigner.selectedAnnotationId && AssetDesigner.currentAsset && AssetDesigner.currentAsset.annotations) {
            const ann = AssetDesigner.currentAsset.annotations.find(a => a.id === AssetDesigner.selectedAnnotationId);
            if (ann) {
                title.innerText = `Anotación Cosmética (${ann.type.toUpperCase()})`;
                let fieldsHtml = '';

                if (ann.type === 'text') {
                    fieldsHtml = `
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Contenido de Texto (Doble clic o Enter en canvas para editar)</label>
                                <textarea class="prop-input" style="width:100%; height:75px; resize:vertical; box-sizing:border-box; font-size:0.9rem;" 
                                          oninput="AssetDesigner.updateAnnotationProp('${ann.id}', 'text', this.value)">${ann.text}</textarea>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Color Texto</label>
                                    <input type="color" value="${ann.color || '#ffca28'}" style="width:100%; height:30px; background:#222; border:1px solid #444; border-radius:4px; cursor:pointer;" 
                                           onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'color', this.value)">
                                </div>
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Tamaño Fuente (px)</label>
                                    <input type="number" class="prop-input" value="${ann.fontSize || 18}" min="10" max="96" step="2" style="width:100%; box-sizing:border-box;"
                                           onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'fontSize', parseInt(this.value)||18)">
                                </div>
                            </div>
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Tipografía</label>
                                <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'fontFamily', this.value)">
                                    <option value="sans-serif" ${ann.fontFamily==='sans-serif'?'selected':''}>Sans-Serif (Moderna)</option>
                                    <option value="monospace" ${ann.fontFamily==='monospace'?'selected':''}>Monospace (Código)</option>
                                    <option value="serif" ${ann.fontFamily==='serif'?'selected':''}>Serif (Clásica)</option>
                                    <option value="cursive" ${ann.fontFamily==='cursive'?'selected':''}>Cursive (Manuscrita)</option>
                                </select>
                            </div>
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Estilo de Texto</label>
                                <div style="display:flex; gap:6px;">
                                    <button class="tool-btn ${ann.isBold?'active':''}" style="flex:1; font-weight:bold;" onclick="AssetDesigner.updateAnnotationProp('${ann.id}', 'isBold', !${!!ann.isBold}); AssetDesigner.updateSidebar();">B</button>
                                    <button class="tool-btn ${ann.isItalic?'active':''}" style="flex:1; font-style:italic;" onclick="AssetDesigner.updateAnnotationProp('${ann.id}', 'isItalic', !${!!ann.isItalic}); AssetDesigner.updateSidebar();">I</button>
                                    <button class="tool-btn ${ann.isUnderline?'active':''}" style="flex:1; text-decoration:underline;" onclick="AssetDesigner.updateAnnotationProp('${ann.id}', 'isUnderline', !${!!ann.isUnderline}); AssetDesigner.updateSidebar();">U</button>
                                </div>
                            </div>

                            <div style="border-top:1px dashed #444; padding-top:10px;">
                                <label class="prop-label" style="color:#ff9800; font-weight:bold; margin-bottom:6px; display:block;">Caja / Contenedor de Nota</label>
                                
                                <div style="margin-bottom:8px;">
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Modo Visual</label>
                                    <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'mode', this.value); AssetDesigner.updateSidebar();">
                                        <option value="none" ${ann.mode==='none'?'selected':''}>Solo Texto (Transparente)</option>
                                        <option value="fill" ${ann.mode==='fill'?'selected':''}>Solo Relleno</option>
                                        <option value="stroke" ${ann.mode==='stroke'?'selected':''}>Solo Borde</option>
                                        <option value="both" ${ann.mode==='both'?'selected':''}>Borde y Relleno</option>
                                    </select>
                                </div>

                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:8px;">
                                    <div>
                                        <label class="prop-label" style="margin-bottom:4px; display:block;">Color Borde</label>
                                        <input type="color" value="${ann.strokeColor || '#ff9800'}" style="width:100%; height:30px; background:#222; border:1px solid #444; border-radius:4px; cursor:pointer;" 
                                               onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'strokeColor', this.value)">
                                    </div>
                                    <div>
                                        <label class="prop-label" style="margin-bottom:4px; display:block;">Grosor Borde (px)</label>
                                        <input type="number" class="prop-input" value="${ann.strokeWidth !== undefined ? ann.strokeWidth : (ann.mode==='none'||ann.mode==='fill'?0:2)}" min="0" max="20" step="1" style="width:100%; box-sizing:border-box;"
                                               onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'strokeWidth', parseInt(this.value)||0)">
                                    </div>
                                </div>

                                <div style="margin-bottom:8px;">
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Trama / Estilo de Borde</label>
                                    <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'strokeStyle', this.value)">
                                        <option value="solid" ${(!ann.strokeStyle || ann.strokeStyle==='solid')?'selected':''}>Sólida (Continua)</option>
                                        <option value="dashed" ${ann.strokeStyle==='dashed'?'selected':''}>Discontinua (Dashed)</option>
                                        <option value="dotted" ${ann.strokeStyle==='dotted'?'selected':''}>Punteada (Dotted)</option>
                                        <option value="dashdot" ${ann.strokeStyle==='dashdot'?'selected':''}>Raya y Punto (Dash-Dot)</option>
                                    </select>
                                </div>

                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:8px;">
                                    <div>
                                        <label class="prop-label" style="margin-bottom:4px; display:block;">Color Relleno</label>
                                        <input type="color" value="${ann.fillColor || '#1e293b'}" style="width:100%; height:30px; background:#222; border:1px solid #444; border-radius:4px; cursor:pointer;" 
                                               onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'fillColor', this.value)">
                                    </div>
                                    <div>
                                        <label class="prop-label" style="margin-bottom:4px; display:block;">Opacidad Relleno</label>
                                        <div style="display:flex; align-items:center; gap:6px;">
                                            <input type="range" min="0" max="1" step="0.05" value="${ann.fillOpacity !== undefined ? ann.fillOpacity : (ann.mode==='none'?0:0.8)}" style="flex:1;"
                                                   oninput="this.nextElementSibling.innerText = Math.round(this.value*100)+'%'; AssetDesigner.updateAnnotationProp('${ann.id}', 'fillOpacity', parseFloat(this.value))">
                                            <span style="font-size:0.75rem; color:#aaa; width:36px; text-align:right;">${Math.round((ann.fillOpacity !== undefined ? ann.fillOpacity : (ann.mode==='none'?0:0.8))*100)}%</span>
                                        </div>
                                    </div>
                                </div>

                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:8px;">
                                    <div>
                                        <label class="prop-label" style="margin-bottom:4px; display:block;">Ancho (px)</label>
                                        <input type="number" class="prop-input" value="${ann.width || 200}" min="40" max="3000" step="10" style="width:100%; box-sizing:border-box;"
                                               onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'width', parseInt(this.value)||200)">
                                    </div>
                                    <div>
                                        <label class="prop-label" style="margin-bottom:4px; display:block;">Alto (px)</label>
                                        <input type="number" class="prop-input" value="${ann.height || 60}" min="20" max="3000" step="5" style="width:100%; box-sizing:border-box;"
                                               onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'height', parseInt(this.value)||60)">
                                    </div>
                                </div>

                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Capa / Orden</label>
                                    <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'layerOrder', this.value)">
                                        <option value="front" ${ann.layerOrder!=='back'?'selected':''}>Delante de los nodos (Foreground)</option>
                                        <option value="back" ${ann.layerOrder==='back'?'selected':''}>Detrás de los nodos (Backdrop)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    `;
                } else if (ann.type === 'shape') {
                    fieldsHtml = `
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Tipo de Forma</label>
                                <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'shapeType', this.value)">
                                    <option value="rectangle" ${ann.shapeType==='rectangle'?'selected':''}>Rectángulo</option>
                                    <option value="square" ${ann.shapeType==='square'?'selected':''}>Cuadrado</option>
                                    <option value="circle" ${ann.shapeType==='circle'?'selected':''}>Círculo</option>
                                    <option value="oval" ${ann.shapeType==='oval'?'selected':''}>Óvalo</option>
                                </select>
                            </div>
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Modo Visual</label>
                                <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'mode', this.value)">
                                    <option value="both" ${ann.mode==='both'?'selected':''}>Línea de Borde + Relleno</option>
                                    <option value="stroke" ${ann.mode==='stroke'?'selected':''}>Solo Línea de Borde</option>
                                    <option value="fill" ${ann.mode==='fill'?'selected':''}>Solo Relleno</option>
                                </select>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Color Borde</label>
                                    <input type="color" value="${ann.strokeColor || '#2196f3'}" style="width:100%; height:30px; background:#222; border:1px solid #444; border-radius:4px; cursor:pointer;" 
                                           onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'strokeColor', this.value)">
                                </div>
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Grosor Borde (px)</label>
                                    <input type="number" class="prop-input" value="${ann.strokeWidth !== undefined ? ann.strokeWidth : 2}" min="0" max="20" step="1" style="width:100%; box-sizing:border-box;"
                                           onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'strokeWidth', parseInt(this.value)||0)">
                                </div>
                            </div>
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Trama / Estilo de Borde</label>
                                <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'strokeStyle', this.value)">
                                    <option value="solid" ${(!ann.strokeStyle || ann.strokeStyle==='solid')?'selected':''}>Sólida (Continua)</option>
                                    <option value="dashed" ${ann.strokeStyle==='dashed'?'selected':''}>Discontinua (Dashed)</option>
                                    <option value="dotted" ${ann.strokeStyle==='dotted'?'selected':''}>Punteada (Dotted)</option>
                                    <option value="dashdot" ${ann.strokeStyle==='dashdot'?'selected':''}>Raya y Punto (Dash-Dot)</option>
                                </select>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Color Relleno</label>
                                    <input type="color" value="${ann.fillColor || '#2196f3'}" style="width:100%; height:30px; background:#222; border:1px solid #444; border-radius:4px; cursor:pointer;" 
                                           onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'fillColor', this.value)">
                                </div>
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Opacidad Relleno</label>
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <input type="range" min="0" max="1" step="0.05" value="${ann.fillOpacity !== undefined ? ann.fillOpacity : 0.15}" style="flex:1;"
                                               oninput="this.nextElementSibling.innerText = Math.round(this.value*100)+'%'; AssetDesigner.updateAnnotationProp('${ann.id}', 'fillOpacity', parseFloat(this.value))">
                                        <span style="font-size:0.75rem; color:#aaa; width:36px; text-align:right;">${Math.round((ann.fillOpacity !== undefined ? ann.fillOpacity : 0.15)*100)}%</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Ancho (px)</label>
                                    <input type="number" class="prop-input" value="${ann.width || 200}" min="20" max="3000" step="10" style="width:100%; box-sizing:border-box;"
                                           onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'width', parseInt(this.value)||200)">
                                </div>
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Alto (px)</label>
                                    <input type="number" class="prop-input" value="${ann.height || 120}" min="20" max="3000" step="10" style="width:100%; box-sizing:border-box;"
                                           onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'height', parseInt(this.value)||120)">
                                </div>
                            </div>
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Capa / Orden</label>
                                <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'layerOrder', this.value)">
                                    <option value="back" ${ann.layerOrder!=='front'?'selected':''}>Detrás de los nodos (Backdrop)</option>
                                    <option value="front" ${ann.layerOrder==='front'?'selected':''}>Delante de los nodos (Foreground)</option>
                                </select>
                            </div>
                        </div>
                    `;
                } else if (ann.type === 'line') {
                    fieldsHtml = `
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Color de Línea</label>
                                    <input type="color" value="${ann.color || '#4fc3f7'}" style="width:100%; height:30px; background:#222; border:1px solid #444; border-radius:4px; cursor:pointer;" 
                                           onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'color', this.value)">
                                </div>
                                <div>
                                    <label class="prop-label" style="margin-bottom:4px; display:block;">Grosor (px)</label>
                                    <input type="number" class="prop-input" value="${ann.strokeWidth || 3}" min="1" max="20" step="1" style="width:100%; box-sizing:border-box;"
                                           onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'strokeWidth', parseInt(this.value)||3)">
                                </div>
                            </div>
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Trama / Estilo de Trazo</label>
                                <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'strokeStyle', this.value)">
                                    <option value="solid" ${(!ann.strokeStyle || ann.strokeStyle==='solid')?'selected':''}>Sólida (Continua)</option>
                                    <option value="dashed" ${ann.strokeStyle==='dashed'?'selected':''}>Discontinua (Dashed)</option>
                                    <option value="dotted" ${ann.strokeStyle==='dotted'?'selected':''}>Punteada (Dotted)</option>
                                    <option value="dashdot" ${ann.strokeStyle==='dashdot'?'selected':''}>Raya y Punto (Dash-Dot)</option>
                                </select>
                            </div>
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Terminación (Extremo)</label>
                                <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'endCap', this.value)">
                                    <option value="none" ${ann.endCap==='none'?'selected':''}>Recta (Sin terminación)</option>
                                    <option value="arrow" ${ann.endCap==='arrow'?'selected':''}>Flecha (Direccional)</option>
                                    <option value="circle" ${ann.endCap==='circle'?'selected':''}>Punto / Círculo</option>
                                </select>
                            </div>
                            <div>
                                <label class="prop-label" style="margin-bottom:4px; display:block;">Capa / Orden</label>
                                <select class="prop-input" style="width:100%; box-sizing:border-box;" onchange="AssetDesigner.updateAnnotationProp('${ann.id}', 'layerOrder', this.value)">
                                    <option value="front" ${ann.layerOrder!=='back'?'selected':''}>Delante de los nodos (Foreground)</option>
                                    <option value="back" ${ann.layerOrder==='back'?'selected':''}>Detrás de los nodos (Backdrop)</option>
                                </select>
                            </div>
                        </div>
                    `;
                }

                content.innerHTML = `
                    ${fieldsHtml}
                    <hr style="border:0; border-top:1px solid #333; margin:15px 0;">
                    <button class="tool-btn danger" style="width:100%; padding:8px; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;" onclick="AssetDesigner.deleteAnnotation('${ann.id}')">
                        <img src="icons/delete.svg" class="btn-icon-svg">
                        <span>Eliminar Anotación (Supr)</span>
                    </button>
                `;
                return;
            }
        } else {
            title.innerText = "Configuración Global";
            content.innerHTML = `
                <div style="padding:10px; color:#666; font-size:0.8rem; text-align:center;">
                    Selecciona un nodo o anotación para editar sus propiedades.
                </div>
                <div class="prop-row">
                    <label class="prop-label">Nombre del Asset</label>
                    <input class="prop-input" value="${AssetDesigner.currentAsset ? AssetDesigner.currentAsset.name : ''}">
                </div>
            `;
        }
    },

    getEffectiveVarName: (node) => {
        if (!node) return 'VAR';
        if (node.variableName && node.variableName.trim() !== '' && node.variableName !== 'VAR') {
            return node.variableName.trim();
        }
        if (node.isMainCategory) return 'MAIN_CAT';
        if (node.isCategory) return 'CAT';
        if (node.isItem) return 'ASSET';
        if (node.isProjectNode) return 'PROYECTO';
        if (node.isClientNode) return 'CLIENTE';
        return node.variableName || 'VAR';
    },

    updateNodeProp: (id, prop, value) => {
        const node = AssetDesigner.currentAsset.nodes.find(n => n.id === id);
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
            const isParentType = (nodeObj, cfgKey) => {
                return !nodeObj[cfgKey] || !nodeObj[cfgKey].type || nodeObj[cfgKey].type === 'parent';
            };

            if (prop === 'categoryConfig.cosmeticName' && isParentType(node, 'categoryConfig')) {
                // Find siblings that are also categories and stick to parent type
                const siblings = AssetDesigner.currentAsset.nodes.filter(n => n.parent === node.parent && n.isCategory && n.id !== node.id && isParentType(n, 'categoryConfig'));
                siblings.forEach(sibling => {
                    if (!sibling.categoryConfig) sibling.categoryConfig = {};
                    sibling.categoryConfig.cosmeticName = value;
                    if (!sibling.categoryConfig.type) sibling.categoryConfig.type = 'parent';
                });
            }

            if (prop === 'mainCategoryConfig.cosmeticName' && isParentType(node, 'mainCategoryConfig')) {
                const siblings = AssetDesigner.currentAsset.nodes.filter(n => n.parent === node.parent && n.isMainCategory && n.id !== node.id && isParentType(n, 'mainCategoryConfig'));
                siblings.forEach(sibling => {
                    if (!sibling.mainCategoryConfig) sibling.mainCategoryConfig = {};
                    sibling.mainCategoryConfig.cosmeticName = value;
                    if (!sibling.mainCategoryConfig.type) sibling.mainCategoryConfig.type = 'parent';
                });
            }

        } else {
            node[prop] = value;

            // Auto-fill semantic variable defaults if empty or generic VAR
            if (value === true) {
                if (prop === 'isMainCategory') {
                    node.isVariable = true;
                    if (!node.variableName || node.variableName === 'VAR') node.variableName = 'MAIN_CAT';
                    if (!node.exampleValue) node.exampleValue = '3D';
                } else if (prop === 'isCategory') {
                    node.isVariable = true;
                    if (!node.variableName || node.variableName === 'VAR') node.variableName = 'CAT';
                    if (!node.exampleValue) node.exampleValue = 'chars';
                } else if (prop === 'isItem') {
                    node.isVariable = true;
                    if (!node.variableName || node.variableName === 'VAR') node.variableName = 'ASSET';
                    if (!node.exampleValue) node.exampleValue = 'pepe';
                } else if (prop === 'isProcess') {
                    if (!node.exampleValue) node.exampleValue = node.name;
                } else if (prop === 'isProjectNode') {
                    node.isVariable = true;
                    if (!node.variableName || node.variableName === 'VAR') node.variableName = 'PROYECTO';
                } else if (prop === 'isClientNode') {
                    node.isVariable = true;
                    if (!node.variableName || node.variableName === 'VAR') node.variableName = 'CLIENTE';
                }
            }
        }

        AssetDesigner.renderCanvas(); // Reflect changes
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    // --- HEADER TOOLS ACTIONS ---
    addNode: (type) => {
        if (!AssetDesigner.currentAsset) return;

        // Find parent position (selected or root)
        let parentId = null;
        let startX = 50;
        let startY = 50;

        if (AssetDesigner.selectedNodeId) {
            parentId = AssetDesigner.selectedNodeId;
            const parent = AssetDesigner.currentAsset.nodes.find(n => n.id === parentId);
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

        AssetDesigner.currentAsset.nodes.push(newNode);
        AssetDesigner.selectNode(newNode.id);
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    deleteSelected: () => {
        if (!AssetDesigner.currentAsset) return;
        const targetIds = (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.length > 0)
            ? AssetDesigner.selectedNodeIds
            : (AssetDesigner.selectedNodeId ? [AssetDesigner.selectedNodeId] : []);

        if (targetIds.length === 0) return;

        const idsToDelete = new Set(targetIds);
        AssetDesigner.currentAsset.nodes = AssetDesigner.currentAsset.nodes.filter(n => !idsToDelete.has(n.id));
        AssetDesigner.currentAsset.nodes.forEach(n => {
            if (idsToDelete.has(n.parent)) n.parent = null;
            if (idsToDelete.has(n.parentOnline)) n.parentOnline = null;
            if (n.itemConfig && Array.isArray(n.itemConfig.additionalParents)) {
                n.itemConfig.additionalParents = n.itemConfig.additionalParents.filter(p => !idsToDelete.has(p));
            }
            if (n.processConfig && Array.isArray(n.processConfig.additionalParents)) {
                n.processConfig.additionalParents = n.processConfig.additionalParents.filter(p => !idsToDelete.has(p));
            }
        });
        AssetDesigner.selectNode(null);
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
        AssetDesigner.updatePreview();
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    nodeClipboard: null,

    copySelected: () => {
        if (!AssetDesigner.currentAsset) return;
        const targetIds = (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.length > 0)
            ? AssetDesigner.selectedNodeIds
            : (AssetDesigner.selectedNodeId ? [AssetDesigner.selectedNodeId] : []);
        if (targetIds.length === 0) return;

        const copied = [];
        targetIds.forEach(id => {
            const node = AssetDesigner.currentAsset.nodes.find(n => n.id === id);
            if (node) copied.push(JSON.parse(JSON.stringify(node)));
        });
        AssetDesigner.nodeClipboard = copied;
        console.log(`[AssetDesigner] Copiados ${copied.length} nodos al portapapeles.`);
    },

    pasteSelected: () => {
        if (!AssetDesigner.currentAsset || !AssetDesigner.nodeClipboard || AssetDesigner.nodeClipboard.length === 0) return;

        const newIds = [];
        const idMap = {};

        AssetDesigner.nodeClipboard.forEach(orig => {
            const newNode = JSON.parse(JSON.stringify(orig));
            newNode.id = 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            newNode.x += 30;
            newNode.y += 30;
            idMap[orig.id] = newNode.id;
            AssetDesigner.currentAsset.nodes.push(newNode);
            newIds.push(newNode.id);
        });

        // Remap internal parent connections among pasted nodes
        newIds.forEach(nid => {
            const n = AssetDesigner.currentAsset.nodes.find(node => node.id === nid);
            if (n && n.parent && idMap[n.parent]) {
                n.parent = idMap[n.parent];
            }
            if (n && n.parentOnline && idMap[n.parentOnline]) {
                n.parentOnline = idMap[n.parentOnline];
            }
        });

        AssetDesigner.selectedNodeIds = newIds;
        AssetDesigner.selectedNodeId = newIds.length === 1 ? newIds[0] : null;
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
        AssetDesigner.updatePreview();
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    duplicateSelected: () => {
        if (!AssetDesigner.currentAsset) return;
        const targetIds = (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.length > 0)
            ? AssetDesigner.selectedNodeIds
            : (AssetDesigner.selectedNodeId ? [AssetDesigner.selectedNodeId] : []);

        if (targetIds.length === 0) return;

        const newIds = [];
        const idMap = {};

        targetIds.forEach(id => {
            const original = AssetDesigner.currentAsset.nodes.find(n => n.id === id);
            if (!original) return;
            const newNode = JSON.parse(JSON.stringify(original));
            newNode.id = 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            newNode.x += 25;
            newNode.y += 25;
            idMap[id] = newNode.id;
            AssetDesigner.currentAsset.nodes.push(newNode);
            newIds.push(newNode.id);
        });

        // Remap internal parent connections among duplicated nodes
        newIds.forEach(nid => {
            const n = AssetDesigner.currentAsset.nodes.find(node => node.id === nid);
            if (n && n.parent && idMap[n.parent]) {
                n.parent = idMap[n.parent];
            }
            if (n && n.parentOnline && idMap[n.parentOnline]) {
                n.parentOnline = idMap[n.parentOnline];
            }
        });

        AssetDesigner.selectedNodeIds = newIds;
        AssetDesigner.selectedNodeId = newIds.length === 1 ? newIds[0] : null;
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
        AssetDesigner.updatePreview();
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    copyNodeConfig: () => {
        const targetId = (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.length > 0)
            ? AssetDesigner.selectedNodeIds[0]
            : AssetDesigner.selectedNodeId;
        if (!targetId || !AssetDesigner.currentAsset) return;

        const sourceNode = AssetDesigner.currentAsset.nodes.find(n => n.id === targetId);
        if (!sourceNode) return;

        // Clone node config
        const configClone = JSON.parse(JSON.stringify(sourceNode));
        
        // Remove instance-specific identifiers
        delete configClone.id;
        delete configClone.name;
        delete configClone.exampleValue;
        delete configClone.x;
        delete configClone.y;
        delete configClone.parent;
        delete configClone.parentOnline;

        window.pipetaNodeConfigClipboard = configClone;
        console.log(`[AssetDesigner] Configuración de nodo copiada (${sourceNode.name || 'node'}).`);
    },

    pasteNodeConfig: () => {
        const clipboard = window.pipetaNodeConfigClipboard;
        if (!clipboard || !AssetDesigner.currentAsset) return;

        const targetIds = (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.length > 0)
            ? AssetDesigner.selectedNodeIds
            : (AssetDesigner.selectedNodeId ? [AssetDesigner.selectedNodeId] : []);
        if (targetIds.length === 0) return;

        targetIds.forEach(id => {
            const targetNode = AssetDesigner.currentAsset.nodes.find(n => n.id === id);
            if (!targetNode) return;

            // Preserve target instance values (name, exampleValue, id, position, connections)
            const preservedId = targetNode.id;
            const preservedName = targetNode.name;
            const preservedExample = targetNode.exampleValue;
            const preservedX = targetNode.x;
            const preservedY = targetNode.y;
            const preservedParent = targetNode.parent;
            const preservedParentOnline = targetNode.parentOnline;

            // Clean previous specific configs from target
            delete targetNode.isVariable;
            delete targetNode.variableName;
            delete targetNode.hasNickVar;
            delete targetNode.nickVarName;
            delete targetNode.nickExample;
            delete targetNode.isEpisode;
            delete targetNode.isScene;
            delete targetNode.isShot;
            delete targetNode.isCategory;
            delete targetNode.isMainCategory;
            delete targetNode.isItem;
            delete targetNode.isProcess;
            delete targetNode.isAssetFocus;
            delete targetNode.isFileContainer;
            delete targetNode.isSyncPoint;
            delete targetNode.isProjectNode;
            delete targetNode.isClientNode;
            delete targetNode.nameConfig;
            delete targetNode.categoryConfig;
            delete targetNode.mainCategoryConfig;
            delete targetNode.itemConfig;
            delete targetNode.processConfig;
            delete targetNode.renderConfig;
            delete targetNode.mediaInConfig;
            delete targetNode.exportIaConfig;
            delete targetNode.fullResConfig;
            delete targetNode.rawConfig;

            // Apply all config properties from clipboard
            const copied = JSON.parse(JSON.stringify(clipboard));
            Object.assign(targetNode, copied);

            // Restore preserved properties
            targetNode.id = preservedId;
            targetNode.name = preservedName;
            targetNode.exampleValue = preservedExample;
            targetNode.x = preservedX;
            targetNode.y = preservedY;
            targetNode.parent = preservedParent;
            targetNode.parentOnline = preservedParentOnline;
        });

        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
        AssetDesigner.updatePreview();
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
        console.log(`[AssetDesigner] Configuración pegada en ${targetIds.length} nodo(s).`);
    },

    arrangeHorizontal: () => {
        if (!AssetDesigner.currentAsset || !AssetDesigner.currentAsset.nodes) return;
        const targetIds = (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.length >= 2)
            ? AssetDesigner.selectedNodeIds
            : [];
        if (targetIds.length < 2) return;

        const nodes = AssetDesigner.currentAsset.nodes.filter(n => targetIds.includes(n.id));
        if (nodes.length < 2) return;

        // Sort left-to-right based on current x position
        nodes.sort((a, b) => a.x - b.x);

        const NODE_WIDTH = 150;
        const gapX = (typeof AssetDesigner.arrangeGapX === 'number') ? AssetDesigner.arrangeGapX : 50;

        const minX = Math.min(...nodes.map(n => n.x));
        const anchorY = nodes[0].y; // align on same row

        nodes.forEach((n, idx) => {
            n.x = minX + idx * (NODE_WIDTH + gapX);
            n.y = anchorY;
        });

        AssetDesigner.renderCanvas();
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    arrangeVertical: () => {
        if (!AssetDesigner.currentAsset || !AssetDesigner.currentAsset.nodes) return;
        const targetIds = (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.length >= 2)
            ? AssetDesigner.selectedNodeIds
            : [];
        if (targetIds.length < 2) return;

        const nodes = AssetDesigner.currentAsset.nodes.filter(n => targetIds.includes(n.id));
        if (nodes.length < 2) return;

        // Sort top-to-bottom based on current y position
        nodes.sort((a, b) => a.y - b.y);

        const NODE_HEIGHT = 60;
        const gapY = (typeof AssetDesigner.arrangeGapY === 'number') ? AssetDesigner.arrangeGapY : 30;

        const minY = Math.min(...nodes.map(n => n.y));
        const anchorX = nodes[0].x; // align on same column

        nodes.forEach((n, idx) => {
            n.x = anchorX;
            n.y = minY + idx * (NODE_HEIGHT + gapY);
        });

        AssetDesigner.renderCanvas();
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    arrangeFull: () => {
        if (!AssetDesigner.currentAsset || !AssetDesigner.currentAsset.nodes) return;
        const targetIds = (AssetDesigner.selectedNodeIds && AssetDesigner.selectedNodeIds.length >= 2)
            ? AssetDesigner.selectedNodeIds
            : [];
        if (targetIds.length < 2) return;

        const selectedSet = new Set(targetIds);
        const nodes = AssetDesigner.currentAsset.nodes.filter(n => selectedSet.has(n.id));
        if (nodes.length < 2) return;

        const NODE_WIDTH = 150;
        const NODE_HEIGHT = 60;
        const gapX = (typeof AssetDesigner.arrangeGapX === 'number') ? AssetDesigner.arrangeGapX : 50;
        const gapY = (typeof AssetDesigner.arrangeGapY === 'number') ? AssetDesigner.arrangeGapY : 30;

        const minX = Math.min(...nodes.map(n => n.x));
        const minY = Math.min(...nodes.map(n => n.y));

        // Helper to get all parent IDs for a node
        const getParentIds = (node) => {
            const p = [];
            if (node.parent) p.push(node.parent);
            if (node.parentOnline) p.push(node.parentOnline);
            if (node.itemConfig?.additionalParents) p.push(...node.itemConfig.additionalParents);
            if (node.processConfig?.additionalParents) p.push(...node.processConfig.additionalParents);
            return p;
        };

        // Helper to check if a node has parents inside the selected set
        const hasSelectedParent = (node) => {
            const parents = getParentIds(node);
            return parents.some(pId => selectedSet.has(pId));
        };

        // Find root nodes of the selected set (nodes whose parents are NOT in the selected set)
        let roots = nodes.filter(n => !hasSelectedParent(n));
        if (roots.length === 0) {
            // In case of loops/cycles, take the left-most node
            roots = [nodes.reduce((min, n) => n.x < min.x ? n : min, nodes[0])];
        }

        // Sort roots by visual top-to-bottom position
        roots.sort((a, b) => a.y - b.y);

        const visited = new Set();
        let currentY = minY;

        // Recursive tree layout
        const layoutSubtree = (node, depth) => {
            visited.add(node.id);
            node.x = minX + depth * (NODE_WIDTH + gapX);

            // Find children that are in the selected set and not yet placed in this subtree
            const children = nodes.filter(n => {
                if (visited.has(n.id)) return false;
                const parents = getParentIds(n);
                return parents.includes(node.id);
            });

            // Sort children top-to-bottom based on their current y position
            children.sort((a, b) => a.y - b.y);

            if (children.length === 0) {
                node.y = currentY;
                currentY += NODE_HEIGHT + gapY;
                return { minY: node.y, maxY: node.y };
            }

            let childMinY = Infinity;
            let childMaxY = -Infinity;

            children.forEach(child => {
                const bounds = layoutSubtree(child, depth + 1);
                childMinY = Math.min(childMinY, bounds.minY);
                childMaxY = Math.max(childMaxY, bounds.maxY);
            });

            // Center parent vertically relative to its direct children bounds
            node.y = (childMinY + childMaxY) / 2;
            return { minY: Math.min(node.y, childMinY), maxY: Math.max(node.y, childMaxY) };
        };

        // Layout all trees from roots
        roots.forEach(root => {
            if (!visited.has(root.id)) {
                layoutSubtree(root, 0);
            }
        });

        // If any unlinked selected nodes remain, place them in a neat column at the end
        const unvisited = nodes.filter(n => !visited.has(n.id));
        if (unvisited.length > 0) {
            unvisited.sort((a, b) => a.y - b.y);
            unvisited.forEach(n => {
                n.x = minX;
                n.y = currentY;
                currentY += NODE_HEIGHT + gapY;
            });
        }

        AssetDesigner.renderCanvas();
        AssetDesigner.pushHistory();
        AssetDesigner.saveAsset();
    },

    alignNodesHorizontal: () => {
        AssetDesigner.arrangeHorizontal();
    },

    alignNodesVertical: () => {
        AssetDesigner.arrangeVertical();
    },

    updatePreview: () => {
        const previewEl = document.getElementById('ad-preview-text');
        if (!previewEl) return;

        if (AssetDesigner.selectedNodeId) {
            // Traverse up to find if there is a SyncPoint in logic
            let curr = AssetDesigner.currentAsset.nodes.find(n => n.id === AssetDesigner.selectedNodeId);
            let suffixNodes = [];
            let syncNode = null;
            let safety = 0;

            const resolveName = (n) => {
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
                            // Skip system tags
                            if (['VAR', 'PROC', 'PROCESO', 'VER', 'version', 'ext'].includes(varName)) return;

                            // Find value in ancestor chain
                            let foundValue = null;
                            let tempCurr = n;
                            let safetyCheck = 0;

                            // Check self first, then parents
                            while (tempCurr && safetyCheck < 100) {
                                const effVar = AssetDesigner.getEffectiveVarName(tempCurr);
                                const isMatch = (
                                    (tempCurr.isVariable && effVar.toLowerCase() === varName.toLowerCase()) ||
                                    (tempCurr.isMainCategory && (varName.toLowerCase() === 'main_cat' || varName.toLowerCase() === 'maincat' || varName.toLowerCase() === 'main_category' || varName.toLowerCase() === 'maincategory')) ||
                                    (tempCurr.isCategory && (varName.toLowerCase() === 'cat' || varName.toLowerCase() === 'sub_cat' || varName.toLowerCase() === 'subcat' || varName.toLowerCase() === 'categoria' || varName.toLowerCase() === 'subcategory')) ||
                                    (tempCurr.isItem && (varName.toLowerCase() === 'asset' || varName.toLowerCase() === 'item' || varName.toLowerCase() === 'assetname' || varName.toLowerCase() === 'asset_name')) ||
                                    (tempCurr.isProjectNode && (varName.toLowerCase() === 'proyecto' || varName.toLowerCase() === 'project')) ||
                                    (tempCurr.isClientNode && (varName.toLowerCase() === 'cliente' || varName.toLowerCase() === 'client'))
                                );

                                if (isMatch) {
                                    foundValue = (tempCurr.isVariable ? tempCurr.exampleValue : null) || tempCurr.name;
                                    break;
                                }
                                if (tempCurr.hasNickVar && ((tempCurr.nickVarName || 'NICK').toLowerCase() === varName.toLowerCase())) {
                                    foundValue = tempCurr.nickExample || tempCurr.nickVarName || 'NICK';
                                    break;
                                }
                                // Move up
                                tempCurr = AssetDesigner.currentAsset.nodes.find(node => node.id === tempCurr.parent);
                                safetyCheck++;
                            }

                            // If found, replace
                            if (foundValue) {
                                const paramRegex = new RegExp(`\\[${varName}\\]`, 'gi');
                                finalName = finalName.replace(paramRegex, foundValue);
                            }
                        });
                    }

                    // Fallback: [ASSET] -> Root Name if not resolved by variable
                    const assetName = AssetDesigner.currentAsset ? AssetDesigner.currentAsset.name : 'Asset';
                    finalName = finalName.replace(/\[ASSET\]/gi, assetName);

                    // PROC / PROCESO -> Find Ancestor Process
                    // Similar to variables, we need to find the specific Process node in the chain.
                    if (finalName.match(/\[PROC\]|\[PROCESO\]/i)) {
                        let procName = n.name; // Fallback
                        let pCurr = n;
                        let safety = 0;
                        while (pCurr && safety < 100) {
                            if (pCurr.isProcess) {
                                procName = pCurr.name;
                                break;
                            }
                            pCurr = AssetDesigner.currentAsset.nodes.find(node => node.id === pCurr.parent);
                            safety++;
                        }
                        finalName = finalName.replace(/\[PROC\]/gi, procName);
                        finalName = finalName.replace(/\[PROCESO\]/gi, procName);
                    }

                    // Version
                    if (finalName.match(/\[VER\]|\[version\]/i)) {
                        const padding = n.nameConfig.versionPadding || 3;
                        const prefix = (n.nameConfig.versionPrefix !== false) ? 'v' : '';
                        const vStr = prefix + '1'.padStart(padding, '0');
                        finalName = finalName.replace(/\[VER\]/gi, vStr);
                        finalName = finalName.replace(/\[version\]/gi, vStr);
                    }

                    // Ext
                    if (finalName.match(/\[ext\]/i)) {
                        let ext = '';
                        if (n.nameConfig.allowedExtensions) {
                            // Use first from list
                            const validExts = n.nameConfig.allowedExtensions.split(',').map(e => e.trim()).filter(e => e);
                            if (validExts.length > 0) ext = '.' + validExts[0].replace(/^\./, '');
                        } else {
                            // Fallback to current name extension
                            const parts = n.name.split('.');
                            ext = parts.length > 1 ? '.' + parts.pop() : '';
                        }
                        finalName = finalName.replace(/\[ext\]/gi, ext);
                    }

                    return finalName;
                }

                // Standard Resolution
                if (n.isMainCategory) {
                    if (!n.isVariable) return n.name;
                    const disp = n.mainCategoryConfig?.cosmeticName || n.variableName || n.name;
                    return n.exampleValue || `[${disp}]`;
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
                curr = AssetDesigner.currentAsset.nodes.find(n => n.id === curr.parent);
            }

            const suffixPath = suffixNodes.join('/');

            if (syncNode) {
                // Dual Path Logic
                // Online Prefix (Green)
                let prefixOnline = [];
                let pCurr = AssetDesigner.currentAsset.nodes.find(n => n.id === syncNode.parentOnline);
                safety = 0;
                while (pCurr && safety < 100) {
                    safety++;
                    prefixOnline.unshift(resolveName(pCurr));
                    pCurr = AssetDesigner.currentAsset.nodes.find(n => n.id === pCurr.parent);
                }

                // Local Prefix (Blue)
                let prefixLocal = [];
                let lCurr = AssetDesigner.currentAsset.nodes.find(n => n.id === syncNode.parent);
                safety = 0;
                while (lCurr && safety < 100) {
                    safety++;
                    prefixLocal.unshift(resolveName(lCurr));
                    lCurr = AssetDesigner.currentAsset.nodes.find(n => n.id === lCurr.parent);
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

        } else {
            // Empty State - Force height too
            previewEl.innerHTML = `
                <div style="display:flex; flex-direction:column; justify-content:center; min-height: 2.8em; color:#666; font-family: monospace; font-size: 0.9em; line-height: 1.4;">
                    Seleccione un nodo para ver su ruta...
                </div>
            `;
        }
    }
};
