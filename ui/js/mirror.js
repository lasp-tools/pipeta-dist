// --- MIRROR LOGIC ---
function toggleMirrorMode() {
    isMirrorMode = !isMirrorMode;
    // Update Dynamic Toolbar
    if (typeof updateHeaderTools === 'function') updateHeaderTools('view-browser');
}

async function triggerMirrorSelection(sourceContainerId) {
    isMirroringInProgress = true;
    try {
        const isProjectSource = sourceContainerId === 'pipeta-project-container';
        const targetContainerId = isProjectSource ? 'pipeta-media-container' : 'pipeta-project-container';
        const targetContainer = document.getElementById(targetContainerId);
        const sourceContainer = document.getElementById(sourceContainerId);

        // Get current path list from source breadcrumbs (logic instead of DOM for safety)
        const sourceSteps = [];
        Array.from(sourceContainer.children).forEach(col => {
            const active = col.querySelector('.pipeta-block.active');
            if (active) sourceSteps.push(active.innerText);
        });

        if (sourceSteps.length === 0) return;

        let targetSteps = [...sourceSteps];

        // Logic to map between hierarchies
        if (isProjectSource) {
            // PROY -> MEDIA
            // Structure: episodios / CAPxx / secuencias / Exx / shots / ShotName
            // Target: CAPxx / Exx / ShotName

            targetSteps = sourceSteps.filter(step => {
                const s = step.toLowerCase();
                return s !== 'episodios' && s !== 'assets' && s !== 'guiones' && s !== 'secuencias' && s !== 'shots';
            });

        } else {
            // MEDIA -> PROY
            // Structure: CAPxx / Exx / ShotName
            // Target: episodios / CAPxx / secuencias / Exx / shots / ShotName

            targetSteps = ['episodios']; // Always start with context

            // 1. CAPITULO
            if (sourceSteps.length >= 1) {
                targetSteps.push(sourceSteps[0]);
            }

            // 2. SECUENCIAS / EPISODIO
            if (sourceSteps.length >= 2) {
                targetSteps.push('secuencias');
                targetSteps.push(sourceSteps[1]);
            }

            // 3. SHOTS / SHOT
            if (sourceSteps.length >= 3) {
                targetSteps.push('shots');
                targetSteps.push(sourceSteps[2]);
            }
        }

        // Start navigation with Root Path
        const roots = (typeof getCurrentRoots === 'function') ? getCurrentRoots() : { work: ROOTS.work, media: ROOTS.media };
        const startPath = isProjectSource ? roots.media : roots.work;
        await navigateToPathPipeta(targetContainer, targetSteps, 0, startPath);

    } catch (err) {
        console.error("Mirror failed", err);
    } finally {
        isMirroringInProgress = false;
    }
}

async function navigateToPathPipeta(container, pathArray, colIndex, currentBasePath) {
    if (colIndex >= pathArray.length) return;

    const targetName = pathArray[colIndex].toLowerCase();
    const columns = container.children;

    if (!columns[colIndex]) return;

    const colDiv = columns[colIndex];
    const blocks = Array.from(colDiv.querySelectorAll('.pipeta-block'));

    // Find insensitive match
    const targetBlock = blocks.find(b => b.innerText.toLowerCase() === targetName);

    if (targetBlock) {
        // Visual Select
        blocks.forEach(b => b.classList.remove('active'));
        targetBlock.classList.add('active');

        // Use REAL path from data if available, otherwise construct (fallback)
        let nextPath;
        if (targetBlock._itemData && targetBlock._itemData.path) {
            nextPath = targetBlock._itemData.path;
        } else {
            nextPath = currentBasePath + "/" + targetBlock.innerText;
        }

        // Load next column if needed
        if (colIndex < pathArray.length - 1) {
            await loadNextPipetaColumn(container, nextPath, colIndex + 1);
            // Recurse
            await navigateToPathPipeta(container, pathArray, colIndex + 1, nextPath);
        } else {
            // Last step -> update content and breadcrumbs
            await loadNextPipetaColumn(container, nextPath, colIndex + 1);
            updatePipetaBreadcrumbs(container.id);
        }
    } else {
        console.warn("Mirror: Could not find path segment:", targetName);
    }
}

// --- TREE (SPLIT VIEW) MIRROR LOGIC ---
async function triggerTreeMirror(clickedPath) {
    if (!isMirrorMode || isMirroringInProgress || !clickedPath) return;
    isMirroringInProgress = true;
    try {
        const roots = (typeof getCurrentRoots === 'function') ? getCurrentRoots() : { work: ROOTS.work, media: ROOTS.media };
        const normClicked = clickedPath.replace(/\\/g, '/');
        const normWork = (roots.work || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const normMedia = (roots.media || '').replace(/\\/g, '/').replace(/\/+$/, '');

        let isWorkSource = false;
        let relPath = '';

        if (normWork && normClicked.toLowerCase().startsWith(normWork.toLowerCase())) {
            isWorkSource = true;
            relPath = normClicked.substring(normWork.length).replace(/^\/+/, '');
        } else if (normMedia && normClicked.toLowerCase().startsWith(normMedia.toLowerCase())) {
            isWorkSource = false;
            relPath = normClicked.substring(normMedia.length).replace(/^\/+/, '');
        } else {
            return;
        }

        const sourceSteps = relPath.split('/').filter(Boolean);
        if (sourceSteps.length === 0) return;

        let targetSteps = [];
        let targetContainerId = isWorkSource ? 'tree-media' : 'tree-work';
        let targetRoot = isWorkSource ? roots.media : roots.work;

        if (isWorkSource) {
            // PROY -> MEDIA
            targetSteps = sourceSteps.filter(step => {
                const s = step.toLowerCase();
                return s !== 'episodios' && s !== 'assets' && s !== 'guiones' && s !== 'secuencias' && s !== 'shots';
            });
        } else {
            // MEDIA -> PROY
            targetSteps = ['episodios'];
            if (sourceSteps.length >= 1) targetSteps.push(sourceSteps[0]);
            if (sourceSteps.length >= 2) {
                targetSteps.push('secuencias');
                targetSteps.push(sourceSteps[1]);
            }
            if (sourceSteps.length >= 3) {
                targetSteps.push('shots');
                targetSteps.push(sourceSteps[2]);
            }
            if (sourceSteps.length >= 4) {
                for (let k = 3; k < sourceSteps.length; k++) {
                    targetSteps.push(sourceSteps[k]);
                }
            }
        }

        await navigateTreeMirror(targetContainerId, targetSteps, targetRoot);
    } catch (err) {
        console.error("Tree mirror failed", err);
    } finally {
        isMirroringInProgress = false;
    }
}

async function navigateTreeMirror(containerId, targetSteps, targetRoot) {
    const container = document.getElementById(containerId);
    if (!container || !targetSteps || targetSteps.length === 0) return;

    let currentParentEl = container;
    let currentAccPath = targetRoot.replace(/\\/g, '/').replace(/\/+$/, '');

    for (let i = 0; i < targetSteps.length; i++) {
        const stepName = targetSteps[i].toLowerCase();

        let wrappers = Array.from(currentParentEl.children).filter(c => c._item || c.classList.contains('node-wrapper'));
        let matchWrapper = wrappers.find(w => {
            if (w._item && w._item.name && w._item.name.toLowerCase() === stepName) return true;
            const p = w._row?.getAttribute('data-path') || w.querySelector('.tree-node')?.getAttribute('data-path') || '';
            const leafName = p.split(/[\/\\]/).pop();
            return leafName && leafName.toLowerCase() === stepName;
        });

        if (!matchWrapper) {
            break;
        }

        const row = matchWrapper._row || matchWrapper.querySelector('.tree-node');
        const item = matchWrapper._item || {
            name: targetSteps[i],
            path: row.getAttribute('data-path'),
            isDirectory: row.getAttribute('data-isdir') === 'true'
        };

        if (i < targetSteps.length - 1) {
            if (matchWrapper._childrenContainer && (matchWrapper._childrenContainer.style.display === 'none' || !matchWrapper._loaded)) {
                if (typeof toggleNode === 'function') {
                    await toggleNode(matchWrapper, item, i, row);
                }
            }
            currentParentEl = matchWrapper._childrenContainer || matchWrapper;
        } else {
            if (item.isDirectory && matchWrapper._childrenContainer && (matchWrapper._childrenContainer.style.display === 'none' || !matchWrapper._loaded)) {
                if (typeof toggleNode === 'function') {
                    await toggleNode(matchWrapper, item, i, row);
                }
            }

            const targetContainer = document.getElementById(containerId);
            targetContainer.querySelectorAll('.tree-node.selected').forEach(n => n.classList.remove('selected'));
            if (row) {
                row.classList.add('selected');
                row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }
}
