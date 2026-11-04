// ----------------------------------------------------------
// --- DESIGNER CANVAS SHARED ENGINE (AssetDesigner & ShotDesigner) ---
// ----------------------------------------------------------

(function () {
    function getBetaAwareLocalDir() {
        return window.PIPETA_LOCAL_APP_DIR ||
            (window.IS_BETA_CHANNEL ? "C:\\TOOLS\\APPS\\Pipeta_Beta" : "C:\\TOOLS\\APPS\\Pipeta");
    }

    function getBetaAwareRepoDir() {
        return window.IS_BETA_CHANNEL
            ? "Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta_Beta"
            : "Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta";
    }

    window.getDesignerDefaultPresetsPath = function (subdir) {
        return getBetaAwareLocalDir() + "\\presets\\" + subdir;
    };

    window.getDesignerRepoPresetsPath = function (subdir) {
        return getBetaAwareRepoDir() + "\\presets\\" + subdir;
    };

    /**
     * Factory that builds the shared state + canvas/history/minimap/annotation/
     * clipboard/arrangement subsystem for AssetDesigner ('ad') and ShotDesigner ('sd').
     */
    window.createDesignerSharedMixin = function (cfg) {
        const name = cfg.name; // 'AssetDesigner' | 'ShotDesigner'
        const pfx = cfg.domPrefix; // 'ad' | 'sd'
        const viewId = cfg.viewId; // 'view-asset-designer' | 'view-shot-designer'
        const getSelf = cfg.getSelf;
        const hasSupplementalConnections = !!cfg.hasSupplementalConnections;
        const minimapSplitLine = !!cfg.minimapSplitLine;
        const cleanRenderFlags = !!cfg.cleanRenderFlags;
        const alignDelegatesToArrange = !!cfg.alignDelegatesToArrange;
        const getMinimapNodeColor = cfg.getMinimapNodeColor;

        return {
            // --- Shared Core State ---
            assets: [],
            currentAsset: null,
            selectedNodeId: null,
            selectedNodeIds: [],
            presetsPath: window.getDesignerDefaultPresetsPath(cfg.defaultPresetsSubdir),

            // --- Interaction State ---
            isDraggingNode: false,
            dragNode: null,
            dragLastPos: { x: 0, y: 0 },

            isPanning: false,
            panStart: { x: 0, y: 0 },
            panOffset: { x: 0, y: 0 },
            zoomLevel: 1,

            // --- Renaming State ---
            isRenaming: false,
            renamingNodeId: null,

            // --- Connection Cursor State ---
            connectionCurrentPos: { x: 0, y: 0 },

            // --- Selection Box State ---
            isBoxSelecting: false,
            boxStart: { x: 0, y: 0 },
            boxCurrent: { x: 0, y: 0 },

            // --- Auto Arrange Gaps (px) ---
            arrangeGapX: 50,
            arrangeGapY: 30,

            // --- Annotation / Cosmetics State ---
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
            dragLineHandleType: null,
            dragLineAnnotation: null,
            _rafPending: false,

            // --- Minimap State ---
            isMinimapCollapsed: false,
            isDraggingMinimap: false,
            _mmBounds: null,
            _mmScale: 1,
            _mmOffsetX: 0,
            _mmOffsetY: 0,

            // --- History (Undo / Redo) State ---
            history: [],
            historyIndex: -1,
            isApplyingHistory: false,

            // --- Clipboard State ---
            nodeClipboard: null,

            // ==========================================
            // 1. UNDO / REDO HISTORY
            // ==========================================
            initHistory: () => {
                const Self = getSelf();
                Self.history = [];
                Self.historyIndex = -1;
                Self.pushHistory();
            },

            pushHistory: () => {
                const Self = getSelf();
                if (Self.isApplyingHistory || !Self.currentAsset) return;
                const snapshot = JSON.stringify(Self.currentAsset);
                if (Self.historyIndex >= 0 && Self.history[Self.historyIndex] === snapshot) {
                    return;
                }

                if (Self.historyIndex < Self.history.length - 1) {
                    Self.history = Self.history.slice(0, Self.historyIndex + 1);
                }

                Self.history.push(snapshot);
                if (Self.history.length > 60) {
                    Self.history.shift();
                }
                Self.historyIndex = Self.history.length - 1;
            },

            undo: () => {
                const Self = getSelf();
                if (!Self.currentAsset || Self.historyIndex <= 0) {
                    console.log(`[${name}] No hay más pasos para deshacer.`);
                    return;
                }
                Self.isApplyingHistory = true;
                Self.historyIndex--;
                const restored = JSON.parse(Self.history[Self.historyIndex]);

                const idx = Self.assets.findIndex(a => a.id === restored.id);
                if (idx !== -1) {
                    Self.assets[idx] = restored;
                }
                Self.currentAsset = restored;

                Self.selectedNodeIds = [];
                Self.selectedNodeId = null;

                Self.renderCanvas();
                Self.updateSidebar();
                Self.updatePreview();
                Self.saveAsset();
                Self.isApplyingHistory = false;
                console.log(`[${name}] Undo aplicado (${Self.historyIndex + 1}/${Self.history.length})`);
            },

            redo: () => {
                const Self = getSelf();
                if (!Self.currentAsset || Self.historyIndex >= Self.history.length - 1) {
                    console.log(`[${name}] No hay más pasos para rehacer.`);
                    return;
                }
                Self.isApplyingHistory = true;
                Self.historyIndex++;
                const restored = JSON.parse(Self.history[Self.historyIndex]);

                const idx = Self.assets.findIndex(a => a.id === restored.id);
                if (idx !== -1) {
                    Self.assets[idx] = restored;
                }
                Self.currentAsset = restored;

                Self.selectedNodeIds = [];
                Self.selectedNodeId = null;

                Self.renderCanvas();
                Self.updateSidebar();
                Self.updatePreview();
                Self.saveAsset();
                Self.isApplyingHistory = false;
                console.log(`[${name}] Redo aplicado (${Self.historyIndex + 1}/${Self.history.length})`);
            },

            // ==========================================
            // 2. INLINE NODE RENAMING
            // ==========================================
            startRenaming: (nodeId) => {
                const Self = getSelf();
                Self.isRenaming = true;
                Self.renamingNodeId = nodeId;
                Self.renderCanvas();
                setTimeout(() => {
                    const input = document.querySelector(`.${pfx}-node-input`);
                    if (input) {
                        input.focus();
                        input.select();
                    }
                }, 10);
            },

            finishRenaming: (id, newName) => {
                const Self = getSelf();
                if (!Self.isRenaming) return;

                const node = Self.currentAsset.nodes.find(n => n.id === id);
                if (node && newName && newName.trim() !== '') {
                    node.name = newName.trim();
                }

                Self.isRenaming = false;
                Self.renamingNodeId = null;
                Self.renderCanvas();
                Self.updateSidebar();
                Self.updatePreview();
                Self.saveAsset();
            },

            cancelRenaming: () => {
                const Self = getSelf();
                Self.isRenaming = false;
                Self.renamingNodeId = null;
                Self.renderCanvas();
            },

            // ==========================================
            // 3. PRESET SELECTOR & ASSET LIFECYCLE HELPERS
            // ==========================================
            deleteAsset: async () => {
                const Self = getSelf();
                if (!Self.currentAsset) return;
                const assetName = Self.currentAsset.name;

                if (!confirm("¿Borrar asset " + assetName + "?")) return;

                const fileName = Self.currentAsset._fileName || (assetName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json");
                const filePath = Self.presetsPath + "\\" + fileName;

                console.log("[Delete] Deleting:", filePath);

                if (window.API && API.fs && API.fs.deleteFile) {
                    try {
                        const res = await API.fs.deleteFile(filePath);
                        console.log("[Delete] Result:", res);
                    } catch (e) {
                        console.error("[Delete] Error:", e);
                    }
                }

                Self.assets = Self.assets.filter(a => a.id !== Self.currentAsset.id);

                if (Self.assets.length > 0) {
                    Self.currentAsset = Self.assets[0];
                } else {
                    Self.currentAsset = null;
                    Self.newAsset("Default");
                }

                Self.renderUI();
                Self.renderCanvas();
                Self.updateSidebar();
            },

            selectAsset: (assetId) => {
                const Self = getSelf();
                const asset = Self.assets.find(a => a.id === assetId);
                if (asset) {
                    Self.currentAsset = asset;
                    Self.selectedNodeId = null;
                    Self.selectedNodeIds = [];
                    Self.initHistory();
                    Self.renderCanvas();
                    Self.renderUI();
                    Self.updateSidebar();
                }
            },

            duplicateAsset: () => {
                const Self = getSelf();
                if (!Self.currentAsset) return;
                const copy = JSON.parse(JSON.stringify(Self.currentAsset));
                copy.id = 'asset_' + Date.now();
                copy.name = copy.name + " (Copy)";
                copy._fileName = copy.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + ".json";
                Self.assets.push(copy);
                Self.currentAsset = copy;
                Self.renderUI();
                Self.renderCanvas();
                Self.saveAsset();
            },

            renderUI: () => {
                const Self = getSelf();
                const select = document.getElementById(`${pfx}-asset-selector`);
                if (select && Self.currentAsset) {
                    select.innerHTML = Self.assets.map(a =>
                        `<option value="${a.id}" ${Self.currentAsset.id === a.id ? 'selected' : ''}>${a.name}</option>`
                    ).join('');
                }
            },

            // ==========================================
            // 4. VIEWPORT TRANSFORM, BACKGROUND & ZOOM
            // ==========================================
            scheduleUpdateTransform: () => {
                const Self = getSelf();
                if (Self._rafPending) return;
                Self._rafPending = true;
                requestAnimationFrame(() => {
                    Self._rafPending = false;
                    Self.updateViewportTransform();
                });
            },

            updateViewportTransform: () => {
                const Self = getSelf();
                const nodesLayer = document.getElementById(`${pfx}-nodes-layer`);
                const connectionsLayer = document.getElementById(`${pfx}-connections-layer`);
                const annLayerBack = document.getElementById(`${pfx}-annotations-layer-back`);
                const annLayerFront = document.getElementById(`${pfx}-annotations-layer-front`);
                const canvasArea = document.getElementById(`${pfx}-canvas-area`);
                if (!nodesLayer || !connectionsLayer) return;
                if (canvasArea && (canvasArea.scrollTop !== 0 || canvasArea.scrollLeft !== 0)) {
                    canvasArea.scrollTop = 0;
                    canvasArea.scrollLeft = 0;
                }

                const tX = Self.panOffset.x;
                const tY = Self.panOffset.y;
                const scale = Self.zoomLevel;

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

                const svgGroup = connectionsLayer.querySelector('g.viewport');
                if (svgGroup) {
                    svgGroup.setAttribute('transform', svgTransform);
                }

                Self.updateMinimapViewport();
            },

            updateBackground: () => {
                const Self = getSelf();
                const canvas = document.getElementById(`${pfx}-canvas-area`);
                if (canvas) {
                    canvas.style.backgroundPosition = `${Self.panOffset.x}px ${Self.panOffset.y}px`;
                    canvas.style.backgroundSize = `${20 * Self.zoomLevel}px ${20 * Self.zoomLevel}px`;
                }
            },

            onCanvasWheel: (e) => {
                const Self = getSelf();
                e.preventDefault();
                const canvasArea = document.getElementById(`${pfx}-canvas-area`);
                if (!canvasArea) return;
                const rect = canvasArea.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const zoomSpeed = 0.08;
                const delta = -Math.sign(e.deltaY) * zoomSpeed;
                const oldZoom = Self.zoomLevel;
                const newZoom = Math.min(Math.max(0.15, oldZoom * (1 + delta)), 3.5);

                const worldX = (mouseX - Self.panOffset.x) / oldZoom;
                const worldY = (mouseY - Self.panOffset.y) / oldZoom;

                Self.zoomLevel = newZoom;
                Self.panOffset.x = mouseX - worldX * newZoom;
                Self.panOffset.y = mouseY - worldY * newZoom;

                Self.scheduleUpdateTransform();
            },

            // ==========================================
            // 5. COSMETIC ANNOTATIONS (TEXT / SHAPE / LINE)
            // ==========================================
            renderAnnotations: () => {
                const Self = getSelf();
                const annLayerBack = document.getElementById(`${pfx}-annotations-layer-back`);
                const annLayerFront = document.getElementById(`${pfx}-annotations-layer-front`);
                if (annLayerBack) annLayerBack.innerHTML = '';
                if (annLayerFront) annLayerFront.innerHTML = '';
                if (!Self.currentAsset || !Self.currentAsset.annotations) return;

                const hexToRgba = (hex, op) => {
                    let c = (hex || '#ff9800').replace('#', '');
                    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
                    const num = parseInt(c, 16);
                    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${op !== undefined ? op : 0.2})`;
                };

                const getBorderCss = (strokeWidth, strokeStyle, strokeColor) => {
                    if (!strokeWidth || strokeWidth === 0) return 'none';
                    let style = strokeStyle || 'solid';
                    if (style === 'dashdot') style = 'dashed';
                    return `${strokeWidth}px ${style} ${strokeColor || '#ff9800'}`;
                };

                Self.currentAsset.annotations.forEach(a => {
                    const isSel = Self.selectedAnnotationId === a.id;
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

                        if (Self.editingAnnotationId === a.id) {
                            itemEl.innerHTML = `<textarea class="canvas-annotation-text-input" 
                                onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); ${name}.finishEditingAnnotation('${a.id}', this.value); } if(event.key==='Escape'){ event.preventDefault(); ${name}.cancelEditingAnnotation(); } event.stopPropagation();"
                                onblur="${name}.finishEditingAnnotation('${a.id}', this.value);"
                                onclick="event.stopPropagation()">${a.text}</textarea>`;
                            setTimeout(() => {
                                const ta = itemEl.querySelector('textarea');
                                if (ta) { ta.focus(); ta.select(); }
                            }, 10);
                        } else {
                            itemEl.innerHTML = `<div class="canvas-annotation-text">${a.text}</div>`;
                            itemEl.ondblclick = (e) => {
                                e.stopPropagation();
                                Self.editingAnnotationId = a.id;
                                Self.renderCanvas();
                            };
                        }

                        if (isSel) {
                            ['nw', 'ne', 'se', 'sw'].forEach(corner => {
                                const hEl = document.createElement('div');
                                hEl.className = `annotation-resize-handle handle-${corner}`;
                                hEl.onmousedown = (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    Self.startResizeAnnotation(e, a, corner);
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

                        if (isSel) {
                            ['nw', 'ne', 'se', 'sw'].forEach(corner => {
                                const hEl = document.createElement('div');
                                hEl.className = `annotation-resize-handle handle-${corner}`;
                                hEl.onmousedown = (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    Self.startResizeAnnotation(e, a, corner);
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

                        const markerId = `${pfx}_arrow_${a.id}`;
                        const circleId = `${pfx}_dot_${a.id}`;
                        let dasharray = '';
                        if (a.strokeStyle === 'dashed') dasharray = '8,6';
                        else if (a.strokeStyle === 'dotted') dasharray = '3,4';
                        else if (a.strokeStyle === 'dashdot') dasharray = '10,4,2,4';

                        let handlesHtml = '';
                        if (isSel) {
                            handlesHtml = `
                                <div class="annotation-line-handle" style="left:${lx1}px; top:${ly1}px;" title="Arrastrar Inicio de Línea" onmousedown="event.stopPropagation(); ${name}.startDragLineHandle(event, ${name}.currentAsset.annotations.find(x => x.id === '${a.id}'), 'start');"></div>
                                <div class="annotation-line-handle" style="left:${lx2}px; top:${ly2}px;" title="Arrastrar Fin de Línea" onmousedown="event.stopPropagation(); ${name}.startDragLineHandle(event, ${name}.currentAsset.annotations.find(x => x.id === '${a.id}'), 'end');"></div>
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
                        Self.selectAnnotation(a.id);
                        if (!e.altKey && !Self.isResizingAnnotation && !Self.isDraggingLineHandle) {
                            Self.isDraggingAnnotation = true;
                            Self.dragAnnotation = a;
                            Self.dragAnnotationLastPos = { x: e.clientX, y: e.clientY };
                        }
                    };

                    targetContainer.appendChild(itemEl);
                });
            },

            startResizeAnnotation: (e, ann, corner) => {
                const Self = getSelf();
                Self.isResizingAnnotation = true;
                Self.resizeAnnotation = ann;
                Self.resizeHandleCorner = corner;
                Self.resizeStart = {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    x: ann.x,
                    y: ann.y,
                    width: ann.width || 180,
                    height: ann.height || 45
                };
            },

            startDragLineHandle: (e, ann, handleType) => {
                const Self = getSelf();
                Self.isDraggingLineHandle = true;
                Self.dragLineAnnotation = ann;
                Self.dragLineHandleType = handleType;
            },

            finishEditingAnnotation: (id, text) => {
                const Self = getSelf();
                Self.editingAnnotationId = null;
                Self.updateAnnotationProp(id, 'text', text);
            },

            cancelEditingAnnotation: () => {
                const Self = getSelf();
                Self.editingAnnotationId = null;
                Self.renderCanvas();
            },

            addAnnotation: (type, subType = 'rectangle') => {
                const Self = getSelf();
                if (!Self.currentAsset) return;
                if (!Self.currentAsset.annotations) Self.currentAsset.annotations = [];

                const canvasArea = document.getElementById(`${pfx}-canvas-area`);
                const cW = canvasArea ? canvasArea.clientWidth : 800;
                const cH = canvasArea ? canvasArea.clientHeight : 600;
                const zoom = Self.zoomLevel || 1;
                const cx = (-Self.panOffset.x + cW / 2) / zoom;
                const cy = (-Self.panOffset.y + cH / 2) / zoom;

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
                    Self.currentAsset.annotations.push(newAnn);
                    Self.selectAnnotation(newAnn.id);
                    Self.renderCanvas();
                    Self.updateSidebar();
                    Self.pushHistory();
                    Self.saveAsset();
                }
            },

            selectAnnotation: (id) => {
                const Self = getSelf();
                Self.selectedAnnotationId = id;
                Self.selectedNodeId = null;
                Self.selectedNodeIds = [];
                Self.renderCanvas();
                Self.updateSidebar();
            },

            updateAnnotationProp: (id, prop, value) => {
                const Self = getSelf();
                if (!Self.currentAsset || !Self.currentAsset.annotations) return;
                const ann = Self.currentAsset.annotations.find(a => a.id === id);
                if (!ann) return;

                ann[prop] = value;
                Self.renderCanvas();
                Self.pushHistory();
                Self.saveAsset();
            },

            deleteAnnotation: (id) => {
                const Self = getSelf();
                if (!Self.currentAsset || !Self.currentAsset.annotations) return;
                Self.currentAsset.annotations = Self.currentAsset.annotations.filter(a => a.id !== id);
                if (Self.selectedAnnotationId === id) {
                    Self.selectedAnnotationId = null;
                }
                Self.renderCanvas();
                Self.updateSidebar();
                Self.pushHistory();
                Self.saveAsset();
            },

            // ==========================================
            // 6. MINIMAP SUBSYSTEM
            // ==========================================
            toggleMinimap: () => {
                const Self = getSelf();
                Self.isMinimapCollapsed = !Self.isMinimapCollapsed;
                const container = document.getElementById(`${pfx}-minimap-container`);
                const toggleBtn = container ? container.querySelector('.canvas-minimap-toggle') : null;
                if (container) {
                    container.classList.toggle('collapsed', Self.isMinimapCollapsed);
                }
                if (toggleBtn) {
                    toggleBtn.textContent = Self.isMinimapCollapsed ? '◻' : '−';
                }
                if (!Self.isMinimapCollapsed) {
                    Self.renderMinimap();
                }
            },

            getCanvasBounds: () => {
                const Self = getSelf();
                let minX = -200, minY = -200, maxX = 1200, maxY = 800;
                if (Self.currentAsset && Self.currentAsset.nodes) {
                    Self.currentAsset.nodes.forEach(n => {
                        if (n.x < minX) minX = n.x - 100;
                        if (n.y < minY) minY = n.y - 100;
                        if (n.x + 200 > maxX) maxX = n.x + 200;
                        if (n.y + 100 > maxY) maxY = n.y + 100;
                    });
                }
                if (Self.currentAsset && Self.currentAsset.annotations) {
                    Self.currentAsset.annotations.forEach(a => {
                        const ax = a.x !== undefined ? a.x : (a.x1 || 0);
                        const ay = a.y !== undefined ? a.y : (a.y1 || 0);
                        const aw = a.width || (Math.abs((a.x2 || 0) - (a.x1 || 0)) || 100);
                        const ah = a.height || (Math.abs((a.y2 || 0) - (a.y1 || 0)) || 50);
                        if (ax < minX) minX = ax - 100;
                        if (ay < minY) minY = ay - 100;
                        if (ax + aw > maxX) maxX = ax + aw + 100;
                        if (ay + ah > maxY) maxY = ay + ah + 100;
                    });
                }
                return { minX, minY, maxX, maxY, width: Math.max(800, maxX - minX), height: Math.max(600, maxY - minY) };
            },

            renderMinimap: () => {
                const Self = getSelf();
                const svg = document.getElementById(`${pfx}-minimap-svg`);
                if (!svg || Self.isMinimapCollapsed || !Self.currentAsset) return;

                const bounds = Self.getCanvasBounds();
                const mmW = 200;
                const mmH = 130;

                const scaleX = mmW / bounds.width;
                const scaleY = mmH / bounds.height;
                const scale = Math.min(scaleX, scaleY);

                Self._mmScale = scale;
                Self._mmBounds = bounds;
                Self._mmOffsetX = (mmW - bounds.width * scale) / 2;
                Self._mmOffsetY = (mmH - bounds.height * scale) / 2;

                let content = '';

                if (minimapSplitLine && bounds.minY <= 0 && bounds.maxY >= 0) {
                    const splitY = Self._mmOffsetY + (0 - bounds.minY) * scale;
                    content += `<line x1="0" y1="${splitY}" x2="${mmW}" y2="${splitY}" stroke="#555" stroke-dasharray="2,2" stroke-width="0.5"/>`;
                }

                if (Self.currentAsset.annotations) {
                    Self.currentAsset.annotations.forEach(a => {
                        if (a.type === 'shape' || a.type === 'text') {
                            const sx = Self._mmOffsetX + (a.x - bounds.minX) * scale;
                            const sy = Self._mmOffsetY + (a.y - bounds.minY) * scale;
                            const sw = (a.width || 100) * scale;
                            const sh = (a.height || 40) * scale;
                            content += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="rgba(255,255,255,0.08)" stroke="#555" stroke-width="0.5" rx="${a.type === 'shape' && (a.shapeType === 'circle' || a.shapeType === 'oval') ? sw / 2 : 1}"/>`;
                        } else if (a.type === 'line') {
                            const x1 = Self._mmOffsetX + (a.x1 - bounds.minX) * scale;
                            const y1 = Self._mmOffsetY + (a.y1 - bounds.minY) * scale;
                            const x2 = Self._mmOffsetX + (a.x2 - bounds.minX) * scale;
                            const y2 = Self._mmOffsetY + (a.y2 - bounds.minY) * scale;
                            content += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${a.color || '#4fc3f7'}" stroke-width="1"/>`;
                        }
                    });
                }

                Self.currentAsset.nodes.forEach(n => {
                    const sx = Self._mmOffsetX + (n.x - bounds.minX) * scale;
                    const sy = Self._mmOffsetY + (n.y - bounds.minY) * scale;
                    const sw = 150 * scale;
                    const sh = 60 * scale;
                    const col = getMinimapNodeColor ? getMinimapNodeColor(n) : '#424242';
                    content += `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" fill="${col}" rx="1"/>`;
                });

                svg.innerHTML = content;
                Self.updateMinimapViewport();
            },

            updateMinimapViewport: () => {
                const Self = getSelf();
                const vp = document.getElementById(`${pfx}-minimap-viewport`);
                const canvasArea = document.getElementById(`${pfx}-canvas-area`);
                if (!vp || !canvasArea || !Self._mmBounds || !Self._mmScale || Self.isMinimapCollapsed) return;

                const bounds = Self._mmBounds;
                const scale = Self._mmScale;
                const offX = Self._mmOffsetX || 0;
                const offY = Self._mmOffsetY || 0;

                const cW = canvasArea.clientWidth;
                const cH = canvasArea.clientHeight;
                const zoom = Self.zoomLevel;
                const panX = Self.panOffset.x;
                const panY = Self.panOffset.y;

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
                const Self = getSelf();
                e.stopPropagation();
                e.preventDefault();
                Self.isDraggingMinimap = true;
                Self.panToMinimapPos(e);
            },

            onMinimapMouseMove: (e) => {
                const Self = getSelf();
                if (!Self.isDraggingMinimap) return;
                Self.panToMinimapPos(e);
            },

            panToMinimapPos: (e) => {
                const Self = getSelf();
                const bodyEl = document.getElementById(`${pfx}-minimap-body`);
                const canvasArea = document.getElementById(`${pfx}-canvas-area`);
                if (!bodyEl || !canvasArea || !Self._mmBounds || !Self._mmScale) return;

                const rect = bodyEl.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                const offX = Self._mmOffsetX || 0;
                const offY = Self._mmOffsetY || 0;
                const scale = Self._mmScale;
                const bounds = Self._mmBounds;

                const worldX = bounds.minX + (mx - offX) / scale;
                const worldY = bounds.minY + (my - offY) / scale;

                const cW = canvasArea.clientWidth;
                const cH = canvasArea.clientHeight;
                const zoom = Self.zoomLevel;

                Self.panOffset.x = cW / 2 - worldX * zoom;
                Self.panOffset.y = cH / 2 - worldY * zoom;

                Self.updateViewportTransform();
            },

            // ==========================================
            // 7. SELECTION, NODE DRAG & KEYBOARD SHORTCUTS
            // ==========================================
            selectNode: (id, isShift = false) => {
                const Self = getSelf();
                if (!id) {
                    Self.selectedNodeIds = [];
                } else if (!isShift) {
                    Self.selectedNodeIds = [id];
                } else {
                    const idx = Self.selectedNodeIds.indexOf(id);
                    if (idx === -1) {
                        Self.selectedNodeIds.push(id);
                    } else {
                        Self.selectedNodeIds.splice(idx, 1);
                    }
                }

                Self.selectedNodeId = Self.selectedNodeIds.length === 1 ? Self.selectedNodeIds[0] : null;

                Self.renderCanvas();
                Self.updateSidebar();
                Self.updatePreview();
            },

            startDragNode: (e, node) => {
                const Self = getSelf();
                Self.isDraggingNode = true;
                Self.dragNode = node;
                Self.dragLastPos = { x: e.clientX, y: e.clientY };
            },

            onKeyDown: (e) => {
                const Self = getSelf();
                const viewEl = document.getElementById(viewId);
                if (viewEl && viewEl.style.display === 'none') return;

                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'z' || e.key === 'Z') {
                        e.preventDefault();
                        if (e.shiftKey) {
                            Self.redo();
                        } else {
                            Self.undo();
                        }
                        return;
                    } else if (e.key === 'y' || e.key === 'Y') {
                        e.preventDefault();
                        Self.redo();
                        return;
                    } else if (e.key === 'd' || e.key === 'D') {
                        e.preventDefault();
                        if (Self.selectedAnnotationId) {
                            const ann = Self.currentAsset.annotations.find(a => a.id === Self.selectedAnnotationId);
                            if (ann) {
                                const copy = JSON.parse(JSON.stringify(ann));
                                copy.id = 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                                if (copy.type === 'line') {
                                    copy.x1 += 30; copy.y1 += 30; copy.x2 += 30; copy.y2 += 30;
                                } else {
                                    copy.x += 30; copy.y += 30;
                                }
                                Self.currentAsset.annotations.push(copy);
                                Self.selectAnnotation(copy.id);
                                Self.pushHistory();
                                Self.saveAsset();
                            }
                        } else {
                            Self.duplicateSelected();
                        }
                        return;
                    } else if (e.key === 'c' || e.key === 'C') {
                        e.preventDefault();
                        if (e.shiftKey) {
                            Self.copyNodeConfig();
                        } else {
                            Self.copySelected();
                        }
                        return;
                    } else if (e.key === 'v' || e.key === 'V') {
                        e.preventDefault();
                        if (e.shiftKey) {
                            Self.pasteNodeConfig();
                        } else {
                            Self.pasteSelected();
                        }
                        return;
                    }
                    return;
                }

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (Self.selectedAnnotationId) {
                        Self.deleteAnnotation(Self.selectedAnnotationId);
                    } else {
                        Self.deleteSelected();
                    }
                }

                if (e.key === 'Enter') {
                    if (Self.selectedAnnotationId) {
                        const ann = Self.currentAsset.annotations.find(a => a.id === Self.selectedAnnotationId);
                        if (ann && ann.type === 'text') {
                            Self.editingAnnotationId = ann.id;
                            Self.renderCanvas();
                        }
                    } else if (Self.selectedNodeId) {
                        Self.startRenaming(Self.selectedNodeId);
                    }
                }
            },

            // ==========================================
            // 8. GRAPH TRAVERSAL & NODE CREATION/DELETION
            // ==========================================
            connectNodes: (parentId, childId, type = 'local') => {
                const Self = getSelf();
                const child = Self.currentAsset.nodes.find(n => n.id === childId);
                if (child) {
                    if (parentId === child.id) return;

                    if (type === 'online' && !child.isSyncPoint) {
                        console.warn("Cannot connect Online path to non-SyncPoint node.");
                        return;
                    }

                    if (type === 'online') {
                        child.parentOnline = parentId;
                    } else {
                        if (child.isItem && child.itemConfig && child.itemConfig.allowMultiParent) {
                            if (!child.itemConfig.additionalParents) child.itemConfig.additionalParents = [];
                            if (child.parent !== parentId && !child.itemConfig.additionalParents.includes(parentId)) {
                                if (!child.parent) {
                                    child.parent = parentId;
                                } else {
                                    child.itemConfig.additionalParents.push(parentId);
                                }
                            }
                        } else if (child.isProcess && child.processConfig && child.processConfig.parentItem) {
                            if (!child.processConfig.additionalParents) child.processConfig.additionalParents = [];
                            if (child.parent !== parentId && !child.processConfig.additionalParents.includes(parentId)) {
                                if (!child.parent) {
                                    child.parent = parentId;
                                } else {
                                    child.processConfig.additionalParents.push(parentId);
                                }
                            }
                        } else {
                            child.parent = parentId;
                        }
                    }

                    Self.renderCanvas();
                    Self.pushHistory();
                    Self.saveAsset();
                }
            },

            isFeedingOnline: (nodeId, visited = new Set()) => {
                const Self = getSelf();
                if (visited.has(nodeId)) return false;
                visited.add(nodeId);

                const children = Self.currentAsset.nodes.filter(n => n.parent === nodeId || n.parentOnline === nodeId);

                for (const child of children) {
                    if (child.isSyncPoint) {
                        if (child.parentOnline === nodeId) return true;
                        continue;
                    }
                    if (child.parent === nodeId) {
                        if (Self.isFeedingOnline(child.id, visited)) return true;
                    }
                }
                return false;
            },

            isFeedingLocalSync: (nodeId, visited = new Set()) => {
                const Self = getSelf();
                if (visited.has(nodeId)) return false;
                visited.add(nodeId);

                const children = Self.currentAsset.nodes.filter(n => n.parent === nodeId);

                for (const child of children) {
                    if (child.isSyncPoint) {
                        if (child.parent === nodeId) return true;
                        continue;
                    }
                    if (child.parent === nodeId) {
                        if (Self.isFeedingLocalSync(child.id, visited)) return true;
                    }
                }
                return false;
            },

            checkIsAncestor: (potentialAncestorId, nodeId) => {
                const Self = getSelf();
                let curr = Self.currentAsset.nodes.find(n => n.id === nodeId);
                while (curr) {
                    if (curr.id === potentialAncestorId) return true;
                    if (curr.parentOnline && Self.checkIsAncestor(potentialAncestorId, curr.parentOnline)) return true;
                    curr = Self.currentAsset.nodes.find(n => n.id === curr.parent);
                }
                return false;
            },

            addNode: (type) => {
                const Self = getSelf();
                if (!Self.currentAsset) return;

                let parentId = null;
                let startX = 50;
                let startY = 50;

                if (Self.selectedNodeId) {
                    parentId = Self.selectedNodeId;
                    const parent = Self.currentAsset.nodes.find(n => n.id === parentId);
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

                Self.currentAsset.nodes.push(newNode);
                Self.selectNode(newNode.id);
                Self.pushHistory();
                Self.saveAsset();
            },

            deleteSelected: () => {
                const Self = getSelf();
                if (!Self.currentAsset) return;
                const targetIds = (Self.selectedNodeIds && Self.selectedNodeIds.length > 0)
                    ? Self.selectedNodeIds
                    : (Self.selectedNodeId ? [Self.selectedNodeId] : []);

                if (targetIds.length === 0) return;

                const idsToDelete = new Set(targetIds);
                Self.currentAsset.nodes = Self.currentAsset.nodes.filter(n => !idsToDelete.has(n.id));
                Self.currentAsset.nodes.forEach(n => {
                    if (idsToDelete.has(n.parent)) n.parent = null;
                    if (idsToDelete.has(n.parentOnline)) n.parentOnline = null;
                    if (n.itemConfig && Array.isArray(n.itemConfig.additionalParents)) {
                        n.itemConfig.additionalParents = n.itemConfig.additionalParents.filter(p => !idsToDelete.has(p));
                    }
                    if (n.processConfig && Array.isArray(n.processConfig.additionalParents)) {
                        n.processConfig.additionalParents = n.processConfig.additionalParents.filter(p => !idsToDelete.has(p));
                    }
                });

                if (hasSupplementalConnections && Self.currentAsset.connections) {
                    Self.currentAsset.connections = Self.currentAsset.connections.filter(c =>
                        !idsToDelete.has(c.from) && !idsToDelete.has(c.to)
                    );
                }

                Self.selectNode(null);
                Self.renderCanvas();
                Self.updateSidebar();
                Self.updatePreview();
                Self.pushHistory();
                Self.saveAsset();
            },

            // ==========================================
            // 9. CLIPBOARD & NODE CONFIG COPY/PASTE
            // ==========================================
            copySelected: () => {
                const Self = getSelf();
                if (!Self.currentAsset) return;
                const targetIds = (Self.selectedNodeIds && Self.selectedNodeIds.length > 0)
                    ? Self.selectedNodeIds
                    : (Self.selectedNodeId ? [Self.selectedNodeId] : []);
                if (targetIds.length === 0) return;

                const copied = [];
                targetIds.forEach(id => {
                    const node = Self.currentAsset.nodes.find(n => n.id === id);
                    if (node) copied.push(JSON.parse(JSON.stringify(node)));
                });
                Self.nodeClipboard = copied;
                console.log(`[${name}] Copiados ${copied.length} nodos al portapapeles.`);
            },

            pasteSelected: () => {
                const Self = getSelf();
                if (!Self.currentAsset || !Self.nodeClipboard || Self.nodeClipboard.length === 0) return;

                const newIds = [];
                const idMap = {};

                Self.nodeClipboard.forEach(orig => {
                    const newNode = JSON.parse(JSON.stringify(orig));
                    newNode.id = 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                    newNode.x += 30;
                    newNode.y += 30;
                    idMap[orig.id] = newNode.id;
                    Self.currentAsset.nodes.push(newNode);
                    newIds.push(newNode.id);
                });

                newIds.forEach(nid => {
                    const n = Self.currentAsset.nodes.find(node => node.id === nid);
                    if (n && n.parent && idMap[n.parent]) {
                        n.parent = idMap[n.parent];
                    }
                    if (n && n.parentOnline && idMap[n.parentOnline]) {
                        n.parentOnline = idMap[n.parentOnline];
                    }
                    if (hasSupplementalConnections) {
                        if (n && n.processConfig && n.processConfig.parentItem && idMap[n.processConfig.parentItem]) {
                            n.processConfig.parentItem = idMap[n.processConfig.parentItem];
                        }
                        if (n && n.renderConfig && n.renderConfig.sourceScene && idMap[n.renderConfig.sourceScene]) {
                            n.renderConfig.sourceScene = idMap[n.renderConfig.sourceScene];
                        }
                    }
                });

                if (hasSupplementalConnections && Array.isArray(Self.currentAsset.connections)) {
                    const copiedOldIds = new Set(Self.nodeClipboard.map(n => n.id));
                    Self.currentAsset.connections.forEach(conn => {
                        if (copiedOldIds.has(conn.from) && copiedOldIds.has(conn.to)) {
                            Self.currentAsset.connections.push({
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

                Self.selectedNodeIds = newIds;
                Self.selectedNodeId = newIds.length === 1 ? newIds[0] : null;
                Self.renderCanvas();
                Self.updateSidebar();
                Self.updatePreview();
                Self.pushHistory();
                Self.saveAsset();
            },

            duplicateSelected: () => {
                const Self = getSelf();
                if (!Self.currentAsset) return;
                const targetIds = (Self.selectedNodeIds && Self.selectedNodeIds.length > 0)
                    ? Self.selectedNodeIds
                    : (Self.selectedNodeId ? [Self.selectedNodeId] : []);

                if (targetIds.length === 0) return;

                const newIds = [];
                const idMap = {};

                targetIds.forEach(id => {
                    const original = Self.currentAsset.nodes.find(n => n.id === id);
                    if (!original) return;
                    const newNode = JSON.parse(JSON.stringify(original));
                    newNode.id = 'n_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                    newNode.x += 25;
                    newNode.y += 25;
                    idMap[id] = newNode.id;
                    Self.currentAsset.nodes.push(newNode);
                    newIds.push(newNode.id);
                });

                newIds.forEach(nid => {
                    const n = Self.currentAsset.nodes.find(node => node.id === nid);
                    if (n && n.parent && idMap[n.parent]) {
                        n.parent = idMap[n.parent];
                    }
                    if (n && n.parentOnline && idMap[n.parentOnline]) {
                        n.parentOnline = idMap[n.parentOnline];
                    }
                    if (hasSupplementalConnections) {
                        if (n && n.processConfig && n.processConfig.parentItem && idMap[n.processConfig.parentItem]) {
                            n.processConfig.parentItem = idMap[n.processConfig.parentItem];
                        }
                        if (n && n.renderConfig && n.renderConfig.sourceScene && idMap[n.renderConfig.sourceScene]) {
                            n.renderConfig.sourceScene = idMap[n.renderConfig.sourceScene];
                        }
                    }
                });

                if (hasSupplementalConnections && Array.isArray(Self.currentAsset.connections)) {
                    const dupOldIds = new Set(targetIds);
                    Self.currentAsset.connections.forEach(conn => {
                        if (dupOldIds.has(conn.from) && dupOldIds.has(conn.to)) {
                            Self.currentAsset.connections.push({
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

                Self.selectedNodeIds = newIds;
                Self.selectedNodeId = newIds.length === 1 ? newIds[0] : null;
                Self.renderCanvas();
                Self.updateSidebar();
                Self.updatePreview();
                Self.pushHistory();
                Self.saveAsset();
            },

            copyNodeConfig: () => {
                const Self = getSelf();
                const targetId = (Self.selectedNodeIds && Self.selectedNodeIds.length > 0)
                    ? Self.selectedNodeIds[0]
                    : Self.selectedNodeId;
                if (!targetId || !Self.currentAsset) return;

                const sourceNode = Self.currentAsset.nodes.find(n => n.id === targetId);
                if (!sourceNode) return;

                const configClone = JSON.parse(JSON.stringify(sourceNode));

                delete configClone.id;
                delete configClone.name;
                delete configClone.exampleValue;
                delete configClone.x;
                delete configClone.y;
                delete configClone.parent;
                delete configClone.parentOnline;

                window.pipetaNodeConfigClipboard = configClone;
                console.log(`[${name}] Configuración de nodo copiada (${sourceNode.name || 'node'}).`);
            },

            pasteNodeConfig: () => {
                const Self = getSelf();
                const clipboard = window.pipetaNodeConfigClipboard;
                if (!clipboard || !Self.currentAsset) return;

                const targetIds = (Self.selectedNodeIds && Self.selectedNodeIds.length > 0)
                    ? Self.selectedNodeIds
                    : (Self.selectedNodeId ? [Self.selectedNodeId] : []);
                if (targetIds.length === 0) return;

                targetIds.forEach(id => {
                    const targetNode = Self.currentAsset.nodes.find(n => n.id === id);
                    if (!targetNode) return;

                    const preservedId = targetNode.id;
                    const preservedName = targetNode.name;
                    const preservedExample = targetNode.exampleValue;
                    const preservedX = targetNode.x;
                    const preservedY = targetNode.y;
                    const preservedParent = targetNode.parent;
                    const preservedParentOnline = targetNode.parentOnline;

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
                    if (cleanRenderFlags) {
                        delete targetNode.isRenderFile;
                        delete targetNode.isRenderFolder;
                        delete targetNode.isFinalRender;
                        delete targetNode.isCompressionRender;
                        delete targetNode.isExternalTcl;
                    }
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

                    const copied = JSON.parse(JSON.stringify(clipboard));
                    Object.assign(targetNode, copied);

                    targetNode.id = preservedId;
                    targetNode.name = preservedName;
                    targetNode.exampleValue = preservedExample;
                    targetNode.x = preservedX;
                    targetNode.y = preservedY;
                    targetNode.parent = preservedParent;
                    targetNode.parentOnline = preservedParentOnline;
                });

                Self.renderCanvas();
                Self.updateSidebar();
                Self.updatePreview();
                Self.pushHistory();
                Self.saveAsset();
                console.log(`[${name}] Configuración pegada en ${targetIds.length} nodo(s).`);
            },

            // ==========================================
            // 10. AUTO-ARRANGE & NODE ALIGNMENT
            // ==========================================
            arrangeHorizontal: () => {
                const Self = getSelf();
                if (!Self.currentAsset || !Self.currentAsset.nodes) return;
                const targetIds = (Self.selectedNodeIds && Self.selectedNodeIds.length >= 2)
                    ? Self.selectedNodeIds
                    : [];
                if (targetIds.length < 2) return;

                const nodes = Self.currentAsset.nodes.filter(n => targetIds.includes(n.id));
                if (nodes.length < 2) return;

                nodes.sort((a, b) => a.x - b.x);

                const NODE_WIDTH = 150;
                const gapX = (typeof Self.arrangeGapX === 'number') ? Self.arrangeGapX : 50;

                const minX = Math.min(...nodes.map(n => n.x));
                const anchorY = nodes[0].y;

                nodes.forEach((n, idx) => {
                    n.x = minX + idx * (NODE_WIDTH + gapX);
                    n.y = anchorY;
                });

                Self.renderCanvas();
                Self.pushHistory();
                Self.saveAsset();
            },

            arrangeVertical: () => {
                const Self = getSelf();
                if (!Self.currentAsset || !Self.currentAsset.nodes) return;
                const targetIds = (Self.selectedNodeIds && Self.selectedNodeIds.length >= 2)
                    ? Self.selectedNodeIds
                    : [];
                if (targetIds.length < 2) return;

                const nodes = Self.currentAsset.nodes.filter(n => targetIds.includes(n.id));
                if (nodes.length < 2) return;

                nodes.sort((a, b) => a.y - b.y);

                const NODE_HEIGHT = 60;
                const gapY = (typeof Self.arrangeGapY === 'number') ? Self.arrangeGapY : 30;

                const minY = Math.min(...nodes.map(n => n.y));
                const anchorX = nodes[0].x;

                nodes.forEach((n, idx) => {
                    n.x = anchorX;
                    n.y = minY + idx * (NODE_HEIGHT + gapY);
                });

                Self.renderCanvas();
                Self.pushHistory();
                Self.saveAsset();
            },

            arrangeFull: () => {
                const Self = getSelf();
                if (!Self.currentAsset || !Self.currentAsset.nodes) return;
                const targetIds = (Self.selectedNodeIds && Self.selectedNodeIds.length >= 2)
                    ? Self.selectedNodeIds
                    : [];
                if (targetIds.length < 2) return;

                const selectedSet = new Set(targetIds);
                const nodes = Self.currentAsset.nodes.filter(n => selectedSet.has(n.id));
                if (nodes.length < 2) return;

                const NODE_WIDTH = 150;
                const NODE_HEIGHT = 60;
                const gapX = (typeof Self.arrangeGapX === 'number') ? Self.arrangeGapX : 50;
                const gapY = (typeof Self.arrangeGapY === 'number') ? Self.arrangeGapY : 30;

                const minX = Math.min(...nodes.map(n => n.x));
                const minY = Math.min(...nodes.map(n => n.y));

                const getParentIds = (node) => {
                    const p = [];
                    if (node.parent) p.push(node.parent);
                    if (node.parentOnline) p.push(node.parentOnline);
                    if (node.itemConfig?.additionalParents) p.push(...node.itemConfig.additionalParents);
                    if (node.processConfig?.additionalParents) p.push(...node.processConfig.additionalParents);
                    if (hasSupplementalConnections && node.processConfig?.parentItem) p.push(node.processConfig.parentItem);
                    return p;
                };

                const hasSelectedParent = (node) => {
                    const parents = getParentIds(node);
                    return parents.some(pId => selectedSet.has(pId));
                };

                let roots = nodes.filter(n => !hasSelectedParent(n));
                if (roots.length === 0) {
                    roots = [nodes.reduce((min, n) => n.x < min.x ? n : min, nodes[0])];
                }

                roots.sort((a, b) => a.y - b.y);

                const visited = new Set();
                let currentY = minY;

                const layoutSubtree = (node, depth) => {
                    visited.add(node.id);
                    node.x = minX + depth * (NODE_WIDTH + gapX);

                    const children = nodes.filter(n => {
                        if (visited.has(n.id)) return false;
                        const parents = getParentIds(n);
                        return parents.includes(node.id);
                    });

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

                    node.y = (childMinY + childMaxY) / 2;
                    return { minY: Math.min(node.y, childMinY), maxY: Math.max(node.y, childMaxY) };
                };

                roots.forEach(root => {
                    if (!visited.has(root.id)) {
                        layoutSubtree(root, 0);
                    }
                });

                const unvisited = nodes.filter(n => !visited.has(n.id));
                if (unvisited.length > 0) {
                    unvisited.sort((a, b) => a.y - b.y);
                    unvisited.forEach(n => {
                        n.x = minX;
                        n.y = currentY;
                        currentY += NODE_HEIGHT + gapY;
                    });
                }

                Self.renderCanvas();
                Self.pushHistory();
                Self.saveAsset();
            },

            alignNodesHorizontal: () => {
                const Self = getSelf();
                if (alignDelegatesToArrange) {
                    Self.arrangeHorizontal();
                    return;
                }
                if (!Self.currentAsset || Self.selectedNodeIds.length < 2) return;

                const nodes = Self.currentAsset.nodes.filter(n => Self.selectedNodeIds.includes(n.id));
                if (nodes.length < 2) return;

                const targetY = nodes[0].y;
                nodes.forEach(n => { n.y = targetY; });

                Self.renderCanvas();
                Self.pushHistory();
                Self.saveAsset();
            },

            alignNodesVertical: () => {
                const Self = getSelf();
                if (alignDelegatesToArrange) {
                    Self.arrangeVertical();
                    return;
                }
                if (!Self.currentAsset || Self.selectedNodeIds.length < 2) return;

                const nodes = Self.currentAsset.nodes.filter(n => Self.selectedNodeIds.includes(n.id));
                if (nodes.length < 2) return;

                const targetX = nodes[0].x;
                nodes.forEach(n => { n.x = targetX; });

                Self.renderCanvas();
                Self.pushHistory();
                Self.saveAsset();
            }
        };
    };
})();
