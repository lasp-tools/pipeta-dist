// ------------------------------------------
// --- PIPETA (MILLER COLUMNS) LOGIC ---
// ------------------------------------------

// State: Store the active path chain for each container
window.pipetaState = {
    'pipeta-project-container': [],
    'pipeta-media-container': []
};

async function initPipetaView() {
    const roots = getCurrentRoots();
    // Set Header Labels
    const workLabel = document.getElementById('label-work-path-pipeta');
    const mediaLabel = document.getElementById('label-media-path-pipeta');
    if (workLabel) workLabel.innerText = roots.work;
    if (mediaLabel) mediaLabel.innerText = roots.media;

    // Filter Logic
    const filter = window.pipetaUseFilter ? window.pipetaFilterList : null;

    await initPipetaPane(roots.work, 'pipeta-project-container', filter);
    await initPipetaPane(roots.media, 'pipeta-media-container', null);
}

function togglePipetaFilter() {
    window.pipetaUseFilter = !window.pipetaUseFilter;
    updateHeaderTools('view-browser'); // Refresh toolbar buttons
    refreshCurrentView(); // Re-render whatever view is active
}

async function initPipetaPane(rootPath, containerId, filterList) {
    const container = document.getElementById(containerId);

    // Save current state BEFORE clearing
    const savedChain = window.pipetaState[containerId] || [];

    container.innerHTML = '<div style="color:#666; padding:20px;">Cargando...</div>';

    const data = await fetchDir(rootPath);
    container.innerHTML = "";

    if (!data.error && data.items) {
        let itemsToRender = data.items;
        // Apply filter if active and it's the project tree
        if (window.pipetaUseFilter && containerId === 'tree-work') {
            const filterList = window.pipetaFilterList;
            itemsToRender = data.items.filter(i => {
                return filterList.some(w => i.name.toLowerCase() === w.toLowerCase());
            });
        }
        if (filterList) {
            itemsToRender = data.items.filter(i => {
                return filterList.some(w => i.name.toLowerCase() === w.toLowerCase());
            });
        }
        renderPipetaColumn(container, itemsToRender, 0, containerId);

        // Restore from saved chain
        if (savedChain.length > 0) {
            await restorePipetaFromChain(container, savedChain, containerId);
        }
    } else {
        container.innerHTML = `<div style="color:red; padding:20px;">Error: ${data.error}</div>`;
    }
}

// Simple restoration: iterate through saved path chain and click each
async function restorePipetaFromChain(container, chain, containerId) {
    const clean = (p) => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();

    for (let depth = 0; depth < chain.length; depth++) {
        const col = container.children[depth];
        if (!col) break;

        const targetPath = chain[depth];
        const normTarget = clean(targetPath);
        const blocks = Array.from(col.children);

        let foundBlock = null;
        for (const block of blocks) {
            const itemPath = block.getAttribute('data-path');
            const normItem = clean(itemPath);

            if (normItem === normTarget) {
                foundBlock = block;
                break;
            }
        }

        if (foundBlock) {
            foundBlock.classList.add('active');

            // If this is a directory and not the last item, load next column
            if (foundBlock.getAttribute('data-isdir') === 'true') {
                await loadNextPipetaColumn(container, chain[depth], depth + 1, containerId);
            }

            // Restore selection visual for final item
            if (depth === chain.length - 1 && window.selectedPaths.has(chain[depth])) {
                foundBlock.classList.add('selected');
            }
        } else {
            // Path no longer exists, stop restoration
            break;
        }
    }
    updatePipetaBreadcrumbs(containerId);
}


function renderPipetaColumn(container, items, colIndex, containerId) {
    while (container.children.length > colIndex) {
        container.removeChild(container.lastChild);
    }

    const colDiv = document.createElement('div');
    colDiv.className = 'miller-column';

    items.forEach(item => {
        const block = document.createElement('div');
        block.className = 'pipeta-block';
        block.innerText = item.name;

        if (!item.isDirectory) {
            block.style.borderColor = '#333';
            block.style.color = '#777';
        }

        block._itemData = item;
        block.setAttribute('data-path', item.path);
        block.setAttribute('data-isdir', item.isDirectory);

        // Sync Initial State
        if (window.selectedPaths.has(item.path)) {
            block.classList.add('selected');
        }

        block.onclick = (e) => {
            e.stopPropagation();

            // Interaction Logic
            if (e.shiftKey || e.ctrlKey) {
                SelectionManager.toggle(item.path, block);
            } else {
                // Determine if we should clear siblings in THIS column or global?
                // Miller columns: usually clicking an item selects it AND potentially opens it.
                // If I click another item in same column, deselect previous.
                // Single Select Logic:
                SelectionManager.clear();
                SelectionManager.add(item.path, block);
            }

            // Pipeta Specific: Column Navigation
            // If we Click, we want to expand IF it's a directory.
            // But we also want to mark it as the "Active Parent" for the next column.

            // Clear 'active' from siblings (visual expansion indicator)
            Array.from(colDiv.children).forEach(c => c.classList.remove('active'));
            block.classList.add('active');

            // UPDATE STATE: Store the path chain up to this point
            const chain = [];
            for (let i = 0; i <= colIndex; i++) {
                const col = container.children[i];
                if (col) {
                    const activeBlock = col.querySelector('.pipeta-block.active');
                    if (activeBlock) {
                        chain.push(activeBlock.getAttribute('data-path'));
                    }
                }
            }
            // Add current item path (it's now active)
            if (chain.length === colIndex) {
                chain.push(item.path);
            } else {
                chain[colIndex] = item.path;
            }
            window.pipetaState[containerId] = chain;

            if (item.isDirectory) {
                loadNextPipetaColumn(container, item.path, colIndex + 1, containerId);
            } else {
                // Trim chain and columns for files
                window.pipetaState[containerId] = chain.slice(0, colIndex + 1);
                while (container.children.length > colIndex + 1) {
                    container.removeChild(container.lastChild);
                }
            }

            updateDesignContext();
            updatePipetaBreadcrumbs(containerId);

            if (isMirrorMode && !isMirroringInProgress) {
                triggerMirrorSelection(containerId);
            }
        };

        colDiv.appendChild(block);
    });

    container.appendChild(colDiv);
    container.scrollLeft = container.scrollWidth;
}

async function loadNextPipetaColumn(container, path, colIndex, containerId) {
    const data = await fetchDir(path);
    if (!data.error && data.items) {
        renderPipetaColumn(container, data.items, colIndex, containerId);
    }
}

async function jumpToPipetaDepth(containerId, depth) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Get the path at the target depth from our state
    const chain = window.pipetaState[containerId] || [];
    if (depth >= chain.length) return;

    const targetPath = chain[depth];

    // Trim state and columns
    window.pipetaState[containerId] = chain.slice(0, depth + 1);

    // Refresh the pane partially? Actually, Miller columns logic is additive.
    // We just need to "re-click" or re-load the columns from that depth.
    // Easiest is to reload the whole pane from state.

    const roots = getCurrentRoots();
    const rootPath = containerId === 'pipeta-project-container' ? roots.work : roots.media;

    // We clear the container and let initPipetaPane handle restoration from the now-trimmed chain
    await initPipetaPane(rootPath, containerId, (containerId === 'pipeta-project-container' && window.pipetaUseFilter) ? window.pipetaFilterList : null);

    // Update global selection
    SelectionManager.clear();
    const lastPath = window.pipetaState[containerId][window.pipetaState[containerId].length - 1];
    SelectionManager.add(lastPath, null); // Dummy element handled by selection sync

    updateDesignContext();
}

function updatePipetaBreadcrumbs(containerId) {
    const container = document.getElementById(containerId);
    const bcId = containerId === 'pipeta-project-container' ? 'pipeta-project-breadcrumbs' : 'pipeta-media-breadcrumbs';
    const bcEl = document.getElementById(bcId);
    if (!bcEl) return;

    const chain = window.pipetaState[containerId] || [];
    const steps = [];

    // Miller Columns names are retrieved from the blocks themselves
    Array.from(container.children).forEach((col, idx) => {
        const active = col.querySelector('.pipeta-block.active');
        if (active) {
            steps.push({
                name: active.innerText,
                depth: idx
            });
        }
    });

    if (steps.length === 0) {
        bcEl.innerHTML = '<span style="color:#444;">...</span>';
    } else {
        bcEl.innerHTML = steps.map(s =>
            `<span class="breadcrumb-item" onclick="jumpToPipetaDepth('${containerId}', ${s.depth})">${s.name}</span>`
        ).join('<span class="crumb-sep"> / </span>');
    }
}

