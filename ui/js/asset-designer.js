// --- ASSET DESIGNER MODULE ---

const AssetDesigner = {
    // State
    assets: [],
    currentAsset: null,
    selectedNodeId: null,
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

    init: async () => {
        console.log("Initializing Asset Designer... Version: 2026-02-08-v2");
        await AssetDesigner.loadPresets();

        // If no assets, create default
        if (AssetDesigner.assets.length === 0) {
            AssetDesigner.newAsset("Default Asset");
        } else {
            AssetDesigner.currentAsset = AssetDesigner.assets[0];
        }

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
        try {
            // Ensure folder exists
            if (window.API && API.fs && API.fs.mkdir) {
                await API.fs.mkdir(AssetDesigner.presetsPath);
            }

            const files = await API.fs.getFiles(AssetDesigner.presetsPath);
            console.log("Found preset files:", files);

            for (const f of files) {
                if (f.endsWith('.json')) {
                    const content = await API.fs.readFile(AssetDesigner.presetsPath + "\\" + f);
                    if (content) {
                        try {
                            const asset = JSON.parse(content);
                            // IMPORTANTE: Asegurar ID único
                            if (!asset.id) asset.id = 'asset_' + Math.random().toString(36).substr(2, 9);
                            AssetDesigner.assets.push(asset);
                        } catch (parseErr) {
                            console.error("Error parsing " + f, parseErr);
                        }
                    }
                }
            }
        } catch (e) {
            console.error("loadPresets error:", e);
        }

        if (AssetDesigner.assets.length === 0) {
            console.log("No assets found. Using default.");
        } else {
            console.log("Loaded", AssetDesigner.assets.length, "assets.");
            // Seleccionar el primero por defecto
            AssetDesigner.currentAsset = AssetDesigner.assets[0];
        }
    },

    saveAsset: async () => {
        if (!AssetDesigner.currentAsset) return;
        const fileName = AssetDesigner.currentAsset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
        const filePath = AssetDesigner.presetsPath + "\\" + fileName;
        const content = JSON.stringify(AssetDesigner.currentAsset, null, 2);

        try {
            const result = await API.fs.writeFile(filePath, content);
            console.log("Save result:", result);
            if (!result || !result.success) {
                console.error("Error al guardar:", result?.error || "Unknown");
            }
        } catch (e) {
            console.error("Save error:", e);
        }
    },

    newAsset: (name) => {
        const newAsset = {
            id: 'asset_' + Date.now(),
            name: name || "New Asset",
            nodes: [
                { id: "root", type: "folder", name: "ROOT", x: 50, y: 50, parent: null }
            ]
        };
        AssetDesigner.assets.push(newAsset);
        AssetDesigner.currentAsset = newAsset;
        AssetDesigner.renderUI();
        AssetDesigner.renderCanvas();
        AssetDesigner.updateSidebar();
    },

    deleteAsset: async () => {
        if (!AssetDesigner.currentAsset) return;
        const assetName = AssetDesigner.currentAsset.name;

        if (!confirm("¿Borrar asset " + assetName + "?")) return;

        const fileName = assetName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
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
        const newName = prompt("Nuevo nombre para el Asset:", oldName);

        if (!newName || newName === oldName) return;

        const oldFileName = oldName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
        const newFileName = newName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";

        const oldPath = AssetDesigner.presetsPath + "\\" + oldFileName;
        const newPath = AssetDesigner.presetsPath + "\\" + newFileName;

        console.log(`[Rename] ${oldFileName} -> ${newFileName}`);

        try {
            // Direct call to API, trusting it exists globally like in context-menu.js
            const result = await API.fs.rename(oldPath, newPath);

            if (result && result.success) {
                AssetDesigner.currentAsset.name = newName;
                await AssetDesigner.saveAsset();

                AssetDesigner.renderUI();
                AssetDesigner.renderCanvas();
                AssetDesigner.updateSidebar();
                console.log("[Rename] OK");
            } else {
                console.error("[Rename] Failed:", result);
                alert("Error al renombrar: " + (result?.error || "Desconocido"));
            }
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
        AssetDesigner.assets.push(copy);
        AssetDesigner.currentAsset = copy;
        AssetDesigner.renderUI();
        AssetDesigner.renderCanvas();
        AssetDesigner.saveAsset(); // Save immediately?
    },

    selectAsset: (id) => {
        const found = AssetDesigner.assets.find(a => a.id === id);
        if (found) {
            AssetDesigner.currentAsset = found;
            AssetDesigner.renderCanvas();
            AssetDesigner.updateSidebar();
        }
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

    renderCanvas: () => {
        const nodesLayer = document.getElementById('ad-nodes-layer');
        const connectionsLayer = document.getElementById('ad-connections-layer');
        if (!nodesLayer || !connectionsLayer) return;

        // Apply Transform
        // CSS needs 'px' for translate usually, SVG attribute needs UNITLESS
        const tX = AssetDesigner.panOffset.x;
        const tY = AssetDesigner.panOffset.y;
        const scale = AssetDesigner.zoomLevel;

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

        // Clear Content (Optimization can be added later)
        nodesLayer.innerHTML = '';
        svgGroup.innerHTML = '';

        if (!AssetDesigner.currentAsset) return;

        // Draw Connections First (Background)
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
            const el = document.createElement('div');
            el.className = `ad-node ${node.type} ${AssetDesigner.selectedNodeId === node.id ? 'selected' : ''}`;
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
                // Check if Multi-Parent Item OR Process Parent Item
                const isItemMulti = node.isItem && node.itemConfig && node.itemConfig.allowMultiParent;
                const isProcessMulti = node.isProcess && node.processConfig && node.processConfig.parentItem;

                let dotClass = 'ad-dot ad-dot-in';
                let title = 'Input (Child)';

                if (isItemMulti) {
                    dotClass = 'ad-dot ad-dot-in multi-parent'; // Pink
                    title = 'Input (Multi-Parent Item)';
                } else if (isProcessMulti) {
                    dotClass = 'ad-dot ad-dot-in multi-process'; // Chroma Green need CSS
                    title = 'Input (Process Parent Item)';
                }

                dotsHtml += `<div class="${dotClass}" title="${title}" onmousedown="event.stopPropagation(); AssetDesigner.onDotInDown('${node.id}', event, 'local')"></div>`;
            }

            // OUTPUT DOTS
            // Folders and Units can have children
            if (node.type === 'folder' || node.type === 'unit') {
                dotsHtml += `<div class="ad-dot ad-dot-out" title="Output (Parent)" onmousedown="event.stopPropagation(); AssetDesigner.onDotOutDown('${node.id}', event)"></div>`;
            }

            let icon = '';
            if (node.type === 'folder') icon = '📂'; // Fallback to Emoji as requested/safer
            else if (node.type === 'unit') icon = '💽';
            else if (node.type === 'file') icon = '📄';

            // Badges HTML
            let badgesHtml = '<div class="ad-badges">';
            if (node.isSyncPoint) badgesHtml += `<span class="ad-badge" style="background:#009688">SYNC</span>`;
            if (node.isCategory) badgesHtml += `<span class="ad-badge ad-badge-category">CAT</span>`;
            if (node.isVariable)
                badgesHtml += `<span class="ad-badge ad-badge-variable">${node.variableName || 'VAR'}</span>`;
            else if (node.type !== 'file' && !node.isItem && !node.isProcess)
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
                // Node Selection & Drag
                if (e.target.classList.contains('ad-dot')) return; // handled by dot
                e.preventDefault();
                e.stopPropagation();
                AssetDesigner.selectNode(node.id);
                if (!e.altKey) {
                    AssetDesigner.startDragNode(e, node);
                }
            };

            nodesLayer.appendChild(el);
        });

        AssetDesigner.updatePreview();
        AssetDesigner.updateBackground();
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
    selectNode: (id) => {
        AssetDesigner.selectedNodeId = id;
        AssetDesigner.renderCanvas(); // Re-render for selection highlight
        AssetDesigner.updateSidebar();
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
        // ALT + Drag = PAN
        if (e.altKey && e.button === 0) {
            AssetDesigner.isPanning = true;
            AssetDesigner.panStart = { x: e.clientX, y: e.clientY };
            document.body.style.cursor = 'grabbing';
        } else if (!e.target.closest('.ad-node')) {
            // Deselect if clicking empty space
            AssetDesigner.selectNode(null);
        }
    },

    onCanvasMouseMove: (e) => {
        // PANNING
        if (AssetDesigner.isPanning) {
            const dx = e.clientX - AssetDesigner.panStart.x;
            const dy = e.clientY - AssetDesigner.panStart.y;
            AssetDesigner.panOffset.x += dx;
            AssetDesigner.panOffset.y += dy;
            AssetDesigner.panStart = { x: e.clientX, y: e.clientY };
            AssetDesigner.renderCanvas();
        }
        // DRAGGING NODE
        else if (AssetDesigner.isDraggingNode && AssetDesigner.dragNode) {
            const dx = (e.clientX - AssetDesigner.dragLastPos.x) / AssetDesigner.zoomLevel;
            const dy = (e.clientY - AssetDesigner.dragLastPos.y) / AssetDesigner.zoomLevel;
            AssetDesigner.dragNode.x += dx;
            AssetDesigner.dragNode.y += dy;
            AssetDesigner.dragLastPos = { x: e.clientX, y: e.clientY };
            AssetDesigner.renderCanvas();
        }
        // CONNECTING
        else if (AssetDesigner.isConnecting) {
            const rect = document.getElementById('ad-canvas-area').getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Undo Transform to get Canvas Coords for the draft line endpoint
            const canvasX = (mouseX - AssetDesigner.panOffset.x) / AssetDesigner.zoomLevel;
            const canvasY = (mouseY - AssetDesigner.panOffset.y) / AssetDesigner.zoomLevel;

            AssetDesigner.connectionCurrentPos = { x: canvasX, y: canvasY };
            AssetDesigner.renderCanvas(); // Redraw draft line

            // Visual Feedback on Drop Targets
            document.querySelectorAll('.ad-dot-in').forEach(el => el.classList.remove('active'));
            const target = document.elementFromPoint(e.clientX, e.clientY);
            if (target && target.classList.contains('ad-dot-in')) {
                target.classList.add('active');
            }
        }
    },

    onCanvasMouseUp: (e) => {
        if (AssetDesigner.isPanning) {
            AssetDesigner.isPanning = false;
            document.body.style.cursor = 'default';
        }

        if (AssetDesigner.isDraggingNode) {
            AssetDesigner.isDraggingNode = false;
            AssetDesigner.dragNode = null;
        }

        if (AssetDesigner.isConnecting) {
            // Check if we landed on an IN dot
            const target = document.elementFromPoint(e.clientX, e.clientY);

            if (target && target.classList.contains('ad-dot-in')) {
                const nodeEl = target.closest('.ad-node');
                if (nodeEl) {
                    const targetId = nodeEl.getAttribute('data-id');
                    // Check if it's the Online or Local dot
                    const connectionType = target.classList.contains('ad-dot-in-online') ? 'online' : 'local';

                    // Prevent self-connect
                    if (targetId !== AssetDesigner.connectionStartNode.id) {
                        AssetDesigner.connectNodes(AssetDesigner.connectionStartNode.id, targetId, connectionType);
                    }
                }
            }

            AssetDesigner.isConnecting = false;
            AssetDesigner.connectionStartNode = null;
            AssetDesigner.connectionType = null;
            document.body.style.cursor = 'default';
            // Clear styles
            document.querySelectorAll('.ad-dot-in').forEach(el => el.classList.remove('active'));

            AssetDesigner.renderCanvas();
        }
    },

    onCanvasWheel: (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = -Math.sign(e.deltaY) * zoomSpeed;
        const newZoom = Math.min(Math.max(0.2, AssetDesigner.zoomLevel + delta), 3.0);

        // Zoom towards mouse pointer logic (simplified: zoom center of screen for now, or just scale)
        // For proper zoom-to-mouse:
        // 1. Get mouse pos in world space
        // 2. Scale
        // 3. Adjust pan so mouse pos in world space remains under mouse pointer

        // Simple zoom for now (Top-Left origin, shifts view)
        AssetDesigner.zoomLevel = newZoom;
        AssetDesigner.renderCanvas();
    },

    onKeyDown: (e) => {
        // Only if Asset Designer is active view
        if (document.getElementById('view-asset-designer').style.display === 'none') return;

        // If typing in input, don't trigger global shortcuts
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'Delete') {
            AssetDesigner.deleteSelected();
        }

        if (e.key === 'Enter') {
            if (AssetDesigner.selectedNodeId) {
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

                    <!-- CATEGORIA | ITEM | PROCESO -->
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <div style="display:flex; align-items:center;">
                            <label class="prop-label" style="margin-right:5px;">Categoria</label>
                            <input type="checkbox" ${node.isCategory ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isCategory', this.checked); AssetDesigner.updateSidebar();">
                        </div>
                        <div style="display:flex; align-items:center;">
                            <label class="prop-label" style="margin-right:5px;">Item</label>
                            <input type="checkbox" ${node.isItem ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isItem', this.checked); AssetDesigner.updateSidebar();">
                        </div>
                        <div style="display:flex; align-items:center;">
                            <label class="prop-label" style="margin-right:5px;">Proceso</label>
                            <input type="checkbox" ${node.isProcess ? 'checked' : ''} onchange="AssetDesigner.updateNodeProp('${node.id}', 'isProcess', this.checked); AssetDesigner.updateSidebar();">
                        </div>
                    </div>

                    <!-- SPECIFIC CONFIGS -->
                    <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                        
                        <!-- CATEGORY CONFIG -->
                        ${node.isCategory ? `
                        <div class="panel-section" style="border:1px solid #444; padding:5px; border-radius:4px;">
                            <label class="prop-label" style="color:#cf6bee;">Configuración de Categoría</label>
                            
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
                        <div class="panel-section" style="border:1px solid #444; padding:5px; border-radius:4px;">
                            <label class="prop-label" style="color:#cf6bee;">Configuración de Item</label>
                            
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
                        <div class="panel-section" style="border:1px solid #444; padding:5px; border-radius:4px;">
                             <label class="prop-label" style="color:#cf6bee;">Configuración de Proceso</label>
                             
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
                                            <button class="nc-tag-btn item" onclick="AssetDesigner.appendNameTag('${node.id}', '[ASSET]')">[ASSET]</button>
                                            
                                            <!-- Dynamic Variables and Standard Tags -->
                                            ${(() => {
                        const vars = new Set();
                        const btns = [];
                        // Exclude ASSET if already added manually above, but here we keep it separate.
                        // Actually the user said "ASSET" appeared twice. One was hardcoded, one from variable?
                        // If 'ASSET' is a variable in the nodes, it will appear again.
                        // Let's filter out 'ASSET' from dynamic variables if it exists there to avoid dupe with the hardcoded one.

                        AssetDesigner.currentAsset.nodes.forEach(n => {
                            if (n.isVariable) {
                                const vName = n.variableName || 'VAR';
                                if (vName === 'ASSET') return; // Skip if variable is named ASSET to avoid confusion with the root token
                                if (!vars.has(vName)) {
                                    vars.add(vName);
                                    const isItem = n.isItem;
                                    const colorClass = isItem ? 'item' : 'var';
                                    btns.push(`<button class="nc-tag-btn ${colorClass}" onclick="AssetDesigner.appendNameTag('${node.id}', '[${vName}]')">[${vName}]</button>`);
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
        } else {
            title.innerText = "Configuración Global";
            content.innerHTML = `
                <div style="padding:10px; color:#666; font-size:0.8rem; text-align:center;">
                    Selecciona un nodo para editar sus propiedades.
                </div>
                <div class="prop-row">
                    <label class="prop-label">Nombre del Asset</label>
                    <input class="prop-input" value="${AssetDesigner.currentAsset ? AssetDesigner.currentAsset.name : ''}">
                </div>
            `;
        }
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
            const isParentType = (nodeObj) => {
                return !nodeObj.categoryConfig || !nodeObj.categoryConfig.type || nodeObj.categoryConfig.type === 'parent';
            };

            if (prop === 'categoryConfig.cosmeticName' && isParentType(node)) {
                // Find siblings that are also categories and stick to parent type
                const siblings = AssetDesigner.currentAsset.nodes.filter(n => n.parent === node.parent && n.isCategory && n.id !== node.id && isParentType(n));
                siblings.forEach(sibling => {
                    if (!sibling.categoryConfig) sibling.categoryConfig = {};
                    sibling.categoryConfig.cosmeticName = value;
                    // Ensure type is explicit for consistency
                    if (!sibling.categoryConfig.type) sibling.categoryConfig.type = 'parent';
                });
            }

        } else {
            node[prop] = value;

            // SPECIAL LOGIC: Items default to Variable
            if (prop === 'isItem' && value === true) {
                node.isVariable = true;
            }
        }

        AssetDesigner.renderCanvas(); // Reflect changes
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
    },

    deleteSelected: () => {
        if (AssetDesigner.selectedNodeId) {
            // Remove node matches id
            AssetDesigner.currentAsset.nodes = AssetDesigner.currentAsset.nodes.filter(n => n.id !== AssetDesigner.selectedNodeId);
            // Also remove children? Or Orphan them? For now Orphan.
            AssetDesigner.currentAsset.nodes.forEach(n => {
                if (n.parent === AssetDesigner.selectedNodeId) n.parent = null;
            });
            AssetDesigner.selectNode(null);
        }
    },

    duplicateSelected: () => {
        if (!AssetDesigner.selectedNodeId) return;

        const original = AssetDesigner.currentAsset.nodes.find(n => n.id === AssetDesigner.selectedNodeId);
        if (!original) return;

        // Deep Copy
        const newNode = JSON.parse(JSON.stringify(original));

        // Update Unique Props
        newNode.id = 'n_' + Date.now();
        newNode.x += 20;
        newNode.y += 20;

        // Append _copy if desired, or keep same name (user said "incluye todas las configuraciones")
        // Usually duplicate implies exact copy of content, but unique ID.
        // Let's keep name identical as per "todas las configuraciones".
        // newNode.name += '_copy'; 

        AssetDesigner.currentAsset.nodes.push(newNode);
        AssetDesigner.selectNode(newNode.id);
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
                            // Skip system tags (removed ASSET from here)
                            if (['VAR', 'PROC', 'PROCESO', 'VER', 'version', 'ext'].includes(varName)) return;

                            // Find value in ancestor chain
                            let foundValue = null;
                            let tempCurr = n;
                            let safetyCheck = 0;

                            // Check self first, then parents
                            while (tempCurr && safetyCheck < 100) {
                                if (tempCurr.isVariable && (tempCurr.variableName === varName)) {
                                    foundValue = tempCurr.exampleValue || tempCurr.variableName;
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
                if (n.isVariable) return n.exampleValue || `[${n.variableName || 'VAR'}]`;

                if (n.isCategory) {
                    const disp = n.categoryConfig?.cosmeticName || n.name;
                    return n.exampleValue || `[${disp}]`;
                }

                if (n.itemConfig?.cosmeticName && n.isVariable) {
                    return n.exampleValue || `[${n.itemConfig.cosmeticName}]`;
                }

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
