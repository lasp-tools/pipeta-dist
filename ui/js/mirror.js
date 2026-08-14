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
        const startPath = isProjectSource ? ROOTS.media : ROOTS.work;
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
