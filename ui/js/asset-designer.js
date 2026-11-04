// --- ASSET DESIGNER MODULE ---
// Shared canvas, history, minimap, annotation, clipboard & layout engine: ui/js/designers/designer-canvas-shared.js

const AssetDesigner = {
    ...window.createDesignerSharedMixin({
        name: 'AssetDesigner',
        domPrefix: 'ad',
        viewId: 'view-asset-designer',
        defaultPresetsSubdir: 'AssetDesigner',
        getSelf: () => AssetDesigner,
        hasSupplementalConnections: false,
        minimapSplitLine: false,
        cleanRenderFlags: false,
        alignDelegatesToArrange: true,
        getMinimapNodeColor: (n) => {
            if (n.isProcess) return '#9c27b0';
            if (n.isMainCategory) return '#ff9800';
            if (n.isCategory) return '#f57c00';
            if (n.isItem) return '#2196f3';
            if (n.type === 'file') return '#4caf50';
            return '#424242';
        }
    }),

    isConnecting: false,

    connectionStartNode: null,

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

    loadPresets: async () => {
        AssetDesigner.assets = [];
        const seenIds = new Set();
        const seenFiles = new Set();
        const searchDirs = [
            AssetDesigner.presetsPath,
            window.getDesignerRepoPresetsPath("AssetDesigner"),
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

        const targetPaths = window.IS_BETA_CHANNEL ? [
            AssetDesigner.presetsPath + "\\" + fileName,
            window.getDesignerRepoPresetsPath("AssetDesigner") + "\\" + fileName
        ] : [
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

window.AssetDesigner = AssetDesigner;
