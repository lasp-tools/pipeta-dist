class ContextMenu {
    constructor() {
        this.menu = document.createElement('div');
        this.menu.id = 'context-menu';
        this.menu.className = 'context-menu';
        document.body.appendChild(this.menu);
        this.activeTarget = null;

        // Clipboard now supports array
        this.clipboard = null; // { paths: [], isCut: false }

        document.addEventListener('click', () => this.hide());
        document.addEventListener('contextmenu', (e) => this.handleGlobalContextMenu(e));
    }

    handleGlobalContextMenu(e) {
        let target = e.target.closest('.tree-node, .pipeta-block');

        if (target) {
            e.preventDefault();
            this.show(e.clientX, e.clientY, target);
        } else {
            // Background context menu?
            // If dragging selection box, maybe we want context menu too?
            this.hide();
        }
    }

    show(x, y, target) {
        this.activeTarget = target;
        let path = target.getAttribute('data-path');
        let isDir = target.getAttribute('data-isdir') === 'true';
        let name = target.getAttribute('data-name') || (path ? path.split(/[\\/]/).pop() : '') || target.innerText.trim();

        if (!path) return;

        // SELECTION LOGIC ON RIGHT CLICK
        // If target is NOT in selection, select it (exclusive).
        // If target IS in selection, keep selection (to allow batch op).
        if (!window.selectedPaths.has(path)) {
            SelectionManager.clear();
            SelectionManager.add(path, target);
        }

        // Count selection
        const count = window.selectedPaths.size;
        const multi = count > 1;

        this.menu.innerHTML = '';
        const items = this.getMenuItems(path, isDir, name, multi, count);

        items.forEach(item => {
            if (item.separator) {
                const sep = document.createElement('div');
                sep.className = 'cm-separator';
                this.menu.appendChild(sep);
                return;
            }

            const el = document.createElement('div');
            el.className = 'cm-item';
            el.innerHTML = `<span class="cm-icon">${item.icon || ''}</span> ${item.label}`;

            if (item.disabled) {
                el.style.opacity = 0.5;
                el.style.pointerEvents = 'none';
            }

            el.onclick = (ev) => {
                ev.stopPropagation();
                this.hide();
                item.action(path);
            };
            this.menu.appendChild(el);
        });

        this.menu.style.display = 'block';
        let rect = this.menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x -= rect.width;
        if (y + rect.height > window.innerHeight) y -= rect.height;

        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
    }

    hide() {
        this.menu.style.display = 'none';
        this.activeTarget = null;
    }

    isGhostItem(target, path) {
        if (!target && path) {
            try {
                target = document.querySelector(`[data-path="${CSS.escape(path)}"]`);
            } catch(e) {}
        }
        if (!target) return false;
        if (target.classList && target.classList.contains('sync-ghost')) return true;
        if (target.closest && target.closest('.sync-ghost-wrapper, .sync-ghost')) return true;
        const item = target._item || (target.closest && target.closest('.node-wrapper')?._item);
        if (item) {
            if (item.isGhost) return true;
            if (typeof item.syncStatus === 'string' && item.syncStatus.startsWith('ghost')) return true;
        }
        if (target.querySelector && target.querySelector('.sync-badge-download')) return true;
        return false;
    }

    isAnyGhostSelected(target, path) {
        if (this.isGhostItem(target, path)) return true;
        if (window.selectedPaths && window.selectedPaths.size > 0) {
            const selectedEls = document.querySelectorAll('.tree-node.selected, .pipeta-block.selected');
            for (const el of selectedEls) {
                if (this.isGhostItem(el)) return true;
            }
        }
        return false;
    }

    getMenuItems(path, isDir, name, multi, count) {
        const isServerView = (window.viewLocationMode === 'server');
        const isGhost = this.isAnyGhostSelected(this.activeTarget, path);
        const canPaste = !isServerView && !isGhost && !!this.clipboard;
        const labelSuffix = multi ? ` (${count})` : '';

        const compMode = window.syncComparisonMode || 'off';
        const allowDrive = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('explorer_allow_drive') : true;
        const syncItems = [];

        if (compMode === 'drive' && allowDrive) {
            syncItems.push(
                { separator: true },
                { 
                    label: `Upload (Subir a Google Drive)${labelSuffix}`, 
                    icon: '⬆️', 
                    action: (p) => window.SyncConflict?.executeSyncAction({ action: 'upload', targetType: 'drive', path: p, isDir, name }) 
                },
                { 
                    label: `Download (Bajar de Google Drive)${labelSuffix}`, 
                    icon: '⬇️', 
                    action: (p) => window.SyncConflict?.executeSyncAction({ action: 'download', targetType: 'drive', path: p, isDir, name }) 
                }
            );
        } else if (compMode === 'server') {
            syncItems.push(
                { separator: true },
                { 
                    label: `Upload (Subir a Servidor Central)${labelSuffix}`, 
                    icon: '⬆️', 
                    action: (p) => window.SyncConflict?.executeSyncAction({ action: 'upload', targetType: 'server', path: p, isDir, name }) 
                },
                { 
                    label: `Download (Bajar de Servidor Central)${labelSuffix}`, 
                    icon: '⬇️', 
                    action: (p) => window.SyncConflict?.executeSyncAction({ action: 'download', targetType: 'server', path: p, isDir, name }) 
                }
            );
        } else {
            syncItems.push(
                { separator: true },
                { 
                    label: `Subir a Servidor Central${labelSuffix}`, 
                    icon: '🗄️⬆️', 
                    action: (p) => window.SyncConflict?.executeSyncAction({ action: 'upload', targetType: 'server', path: p, isDir, name }) 
                },
                { 
                    label: `Bajar de Servidor Central${labelSuffix}`, 
                    icon: '🗄️⬇️', 
                    action: (p) => window.SyncConflict?.executeSyncAction({ action: 'download', targetType: 'server', path: p, isDir, name }) 
                }
            );
            if (allowDrive) {
                syncItems.push(
                    { 
                        label: `Subir a Google Drive${labelSuffix}`, 
                        icon: '☁️⬆️', 
                        action: (p) => window.SyncConflict?.executeSyncAction({ action: 'upload', targetType: 'drive', path: p, isDir, name }) 
                    },
                    { 
                        label: `Bajar de Google Drive${labelSuffix}`, 
                        icon: '☁️⬇️', 
                        action: (p) => window.SyncConflict?.executeSyncAction({ action: 'download', targetType: 'drive', path: p, isDir, name }) 
                    }
                );
            }
        }

        return [
            { label: 'Abrir en Explorer', icon: '📂', action: (p) => this.openInExplorer(p, multi), disabled: isServerView || isGhost },
            { label: 'Refrescar Carpeta', icon: '🔄', action: (p) => this.refreshFolder(p, isDir) },
            { label: `Send2 IA Ingest${labelSuffix}`, icon: '<img src="icons/chip-ai.svg" style="width:15px; height:15px; object-fit:contain; vertical-align:middle; display:inline-block;">', action: (p) => this.sendToIaIngest(p, isDir, multi), disabled: isServerView || isGhost },
            ...syncItems,
            { separator: true },
            { label: `Copiar${labelSuffix}`, icon: '📄', action: (p) => this.copyToClipboard(false), disabled: isGhost },
            { label: `Cortar${labelSuffix}`, icon: '✂️', action: (p) => this.copyToClipboard(true), disabled: isServerView || isGhost },
            { label: 'Pegar', icon: '📋', action: (p) => this.pasteFromClipboard(p), disabled: !canPaste },
            { separator: true },
            { label: 'Renombrar', icon: '✏️', action: (p) => this.renameItem(p, name), disabled: multi || isServerView || isGhost },
            { label: `Duplicar${labelSuffix}`, icon: '♊', action: (p) => this.duplicateItems(), disabled: isServerView || isGhost },
            { label: `Borrar${labelSuffix}`, icon: '🗑️', action: (p) => this.deleteItems(), disabled: isServerView || isGhost },
            { separator: true },
            { label: 'Copiar Ruta', icon: '🔗', action: (p) => this.copyPath(p) },
            { label: 'Nueva Carpeta', icon: '📁', action: (p) => this.createFolder(p, isDir), disabled: multi || isServerView }
        ];
    }

    // --- ACTIONS ---

    async sendToIaIngest(targetPath, isDir, multi) {
        let paths = [targetPath];
        const isDirMap = { [targetPath]: isDir };

        if (multi && window.selectedPaths && window.selectedPaths.size > 0) {
            paths = Array.from(window.selectedPaths);
            const selectedEls = document.querySelectorAll('.tree-node.selected, .pipeta-block.selected');
            selectedEls.forEach(el => {
                const p = el.getAttribute('data-path') || el._item?.path;
                const d = el._item?.isDirectory || el.classList.contains('folder') || el.classList.contains('is-dir');
                if (p) isDirMap[p] = !!d;
            });
        }

        if (typeof window.enqueuePathsToIaBatch === 'function') {
            await window.enqueuePathsToIaBatch(paths, { isDirMap });
            if (typeof switchView === 'function') {
                switchView('view-ia-ingest');
            }
        }
    }

    async refreshFolder(targetPath, isDir) {
        let folderPath = targetPath;
        if (!isDir && folderPath) {
            const sep = folderPath.lastIndexOf('\\') > -1 ? '\\' : '/';
            folderPath = folderPath.substring(0, folderPath.lastIndexOf(sep));
        }
        if (!folderPath) {
            if (window.selectedPaths && window.selectedPaths.size > 0) {
                folderPath = Array.from(window.selectedPaths)[0];
            }
        }
        if (!folderPath) return;

        const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
        const compMode = window.syncComparisonMode || 'off';
        const projName = (typeof settings !== 'undefined' && settings?.currentProject?.name) ? settings.currentProject.name : 'surf_love';

        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `Refrescando carpeta: '${folderName}' (Modo: ${compMode.toUpperCase()})`, 'pending');
        }

        try {
            const viewMode = window.viewLocationMode || 'local';
            const isServer = (viewMode === 'server') || (compMode === 'server');
            const allowDrive = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('explorer_allow_drive') : true;
            const isDrive = allowDrive && ((viewMode === 'drive') || (compMode === 'drive') || folderPath.toLowerCase().startsWith('g:'));
            const targetType = isServer ? 'server' : (isDrive ? 'drive' : null);
            const targetLabel = targetType === 'server' ? 'Servidor' : 'Drive';

            if (targetType) {
                if (window.CatalogRefreshStepper) {
                    window.CatalogRefreshStepper.show(folderName, targetLabel);
                    window.CatalogRefreshStepper.setStep('scan');
                }

                // Escaneo y actualización scoped ultra-rápida del sub-catálogo en Servidor o Google Drive
                const res = await fetch('/api/sync/catalog/refresh-folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: projName, path: folderPath, type: targetType })
                }).then(r => r.json()).catch(e => ({ success: false, error: e.message }));

                if (res && res.success) {
                    if (window.CatalogRefreshStepper) window.CatalogRefreshStepper.setStep('sync');
                    if (typeof loadActiveProjectSyncCatalog === 'function') {
                        await loadActiveProjectSyncCatalog(true);
                    }
                    if (typeof PipetaConsole !== 'undefined') {
                        PipetaConsole.log('sync', `✓ Carpeta '${folderName}' actualizada (${res.itemsCount || 0} items en ${targetLabel})`, 'ok');
                    }
                    if (window.CatalogRefreshStepper) {
                        window.CatalogRefreshStepper.setStep('refresh');
                    }
                    if (typeof refreshCurrentView === 'function') {
                        await refreshCurrentView();
                    }
                    if (window.CatalogRefreshStepper) {
                        window.CatalogRefreshStepper.finish(`✅ "${folderName}" al día (${res.itemsCount || 0} items en ${targetLabel})`);
                    }
                } else {
                    console.warn(`[REFRESH FOLDER] Fallback ${targetLabel}:`, res?.error);
                    if (window.CatalogRefreshStepper) {
                        window.CatalogRefreshStepper.fail(res?.error || `No se pudo refrescar en ${targetLabel}`);
                    }
                    if (typeof PipetaConsole !== 'undefined') {
                        PipetaConsole.log('sync', `❌ No se pudo refrescar '${folderName}' en ${targetLabel}: ${res?.error || 'Error desconocido'}`, 'error');
                    }
                    if (typeof loadActiveProjectSyncCatalog === 'function') {
                        await loadActiveProjectSyncCatalog(true);
                    }
                    if (typeof refreshCurrentView === 'function') {
                        await refreshCurrentView();
                    }
                }
            } else {
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `✓ Carpeta '${folderName}' refrescada en disco local`, 'ok');
                }
                if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                    settings.showToast(`✅ "${folderName}" refrescada`, 'success', 2);
                }
                if (typeof refreshCurrentView === 'function') {
                    await refreshCurrentView();
                }
            }
        } catch(err) {
            console.error("Error refreshing folder:", err);
            if (window.CatalogRefreshStepper) window.CatalogRefreshStepper.fail(err.message);
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `❌ Error refrescando carpeta '${folderName}': ${err.message}`, 'error');
            }
            if (typeof refreshCurrentView === 'function') {
                refreshCurrentView();
            }
        }
    }

    async openInExplorer(path, multi) {
        if (window.viewLocationMode === 'server') {
            console.warn("[ContextMenu] 'Abrir en Explorer' está deshabilitado en vista Servidor.");
            return;
        }
        if (this.isAnyGhostSelected(this.activeTarget, path)) {
            console.warn("[ContextMenu] 'Abrir en Explorer' no disponible para elementos no descargados.");
            return;
        }
        if (!path && typeof selectedContextPath !== 'undefined' && selectedContextPath) {
            path = selectedContextPath;
        }
        if (!path && window.selectedPaths && window.selectedPaths.size > 0) {
            path = Array.from(window.selectedPaths)[0];
        }
        if (!path) {
            console.warn("[ContextMenu] No hay ninguna ruta seleccionada para abrir en el Explorador.");
            return;
        }
        if (multi && window.selectedPaths && window.selectedPaths.size > 1) {
            const paths = Array.from(window.selectedPaths).slice(0, 5);
            for (const p of paths) {
                await API.fs.open(p);
            }
        } else {
            await API.fs.open(path);
        }
    }

    copyToClipboard(isCut) {
        if (this.isAnyGhostSelected(this.activeTarget)) {
            console.warn("[ContextMenu] No se puede copiar o cortar elementos no descargados.");
            return;
        }
        if (isCut && window.viewLocationMode === 'server') {
            console.warn("[ContextMenu] 'Cortar' está deshabilitado en vista Servidor.");
            return;
        }
        const paths = Array.from(window.selectedPaths);
        this.clipboard = { paths, isCut };
        console.log(`Clipboard: ${isCut ? 'Cut' : 'Copy'} ${paths.length} items`);
    }

    async pasteFromClipboard(targetPath) {
        if (window.viewLocationMode === 'server') {
            console.warn("[ContextMenu] 'Pegar' está deshabilitado en vista Servidor.");
            return;
        }
        if (this.isAnyGhostSelected(this.activeTarget, targetPath)) {
            console.warn("[ContextMenu] 'Pegar' no disponible en destino no descargado.");
            return;
        }
        if (!this.clipboard) return;

        // Determine dest folder
        // If target is file, paste in its parent. (Assuming single target for paste destination? 
        // We usually paste INTO a single folder).
        // If multiple items selected when pasting... usually implies paste INTO them? 
        // No, usually "Paste" is contextual to one location.
        // We use 'targetPath' passed from the right-click.

        let destRoot = targetPath;
        // Check if target is file (heuristic: has extension? or rely on passed isDir if needed. 
        // But getMenuItems doesn't pass isDir to action.
        // Let's assume user clicks on FOLDER to paste.
        // Or if we click on file, we paste to parent.

        // Helper to get parent
        const getParent = (p) => {
            const sep = p.lastIndexOf('\\') > -1 ? '\\' : '/';
            return p.substring(0, p.lastIndexOf(sep));
        };

        // We need robust isDir check. For now, assume if it looks like a file (dotted), it is.
        // Or better: try to paste INTO, if fails, paste into parent? No.
        // Let's simply try to paste into Parent if we clicked a File.
        // But we don't know for sure.
        // RISK: Pasting into a file path might fail.

        // Let's try to infer from DOM if available?
        // We can check if `activeTarget` has `data-isdir="true"`.
        if (this.activeTarget && this.activeTarget.getAttribute('data-isdir') !== 'true') {
            destRoot = getParent(targetPath);
        }

        const promises = this.clipboard.paths.map(async (src) => {
            const filename = src.split(/[\\/]/).pop();
            const dest = `${destRoot}\\${filename}`; // Windows separator assumption

            if (this.clipboard.isCut) {
                await API.fs.rename(src, dest);
            } else {
                await API.fs.copy(src, dest);
            }
        });

        await Promise.all(promises);

        if (this.clipboard.isCut) this.clipboard = null;
        refreshCurrentView();
    }

    copyPath(path) {
        // If multi, copy newlines?
        const text = Array.from(window.selectedPaths).join('\n');
        navigator.clipboard.writeText(text);
    }

    async renameItem(path, oldName) {
        if (window.viewLocationMode === 'server') {
            console.warn("[ContextMenu] 'Renombrar' está deshabilitado en vista Servidor.");
            return;
        }
        if (this.isAnyGhostSelected(this.activeTarget, path)) {
            console.warn("[ContextMenu] 'Renombrar' no disponible para elementos no descargados.");
            return;
        }
        if (!oldName) {
            const sep = path.lastIndexOf('\\') > -1 ? '\\' : '/';
            oldName = path.substring(path.lastIndexOf(sep) + 1);
        }
        const newName = prompt("Nuevo nombre:", oldName);
        if (newName && newName !== oldName) {
            const sep = path.lastIndexOf('\\') > -1 ? '\\' : '/';
            const parentPath = path.substring(0, path.lastIndexOf(sep));
            const newPath = `${parentPath}${sep}${newName}`;

            await API.fs.rename(path, newPath);
            refreshCurrentView();
        }
    }

    async duplicateItems() {
        if (window.viewLocationMode === 'server') {
            console.warn("[ContextMenu] 'Duplicar' está deshabilitado en vista Servidor.");
            return;
        }
        if (this.isAnyGhostSelected(this.activeTarget)) {
            console.warn("[ContextMenu] 'Duplicar' no disponible para elementos no descargados.");
            return;
        }
        const paths = Array.from(window.selectedPaths);
        const promises = paths.map(async (path) => {
            const sep = path.lastIndexOf('\\') > -1 ? '\\' : '/';
            const name = path.split(sep).pop();
            const parent = path.substring(0, path.lastIndexOf(sep));
            const extension = name.includes('.') ? `.${name.split('.').pop()}` : '';
            const base = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name;

            const newName = `${base}_copy${extension}`;
            const newPath = `${parent}${sep}${newName}`;

            await API.fs.copy(path, newPath);
        });

        await Promise.all(promises);
        refreshCurrentView();
    }

    async deleteItems() {
        if (window.viewLocationMode === 'server') {
            console.warn("[ContextMenu] 'Borrar' está deshabilitado en vista Servidor.");
            return;
        }
        if (this.isAnyGhostSelected(this.activeTarget)) {
            console.warn("[ContextMenu] 'Borrar' no disponible para elementos no descargados.");
            return;
        }
        const paths = Array.from(window.selectedPaths);
        const count = paths.length;
        if (confirm(`¿Estás seguro de BORRAR PERMANENTEMENTE ${count} elemento(s)?`)) {
            const promises = paths.map(p => API.fs.delete(p));
            await Promise.all(promises);
            refreshCurrentView();
        }
    }

    async createFolder(path, isDir) {
        if (window.viewLocationMode === 'server') {
            console.warn("[ContextMenu] 'Nueva Carpeta' está deshabilitado en vista Servidor.");
            return;
        }
        let parent = path;
        if (!isDir) {
            const sep = path.lastIndexOf('\\') > -1 ? '\\' : '/';
            parent = path.substring(0, path.lastIndexOf(sep));
        }

        const name = prompt("Nombre de la nueva carpeta:", "Nueva Carpeta");
        if (name) {
            const sep = parent.includes('\\') ? '\\' : '/';
            const newPath = `${parent.replace(/\/?$/, '')}${sep}${name}`;
            await API.fs.mkdir(newPath);
            refreshCurrentView();
        }
    }

    // --- FILTER MENU ---
    showFilterMenu(x, y) {
        this.menu.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'cm-item';
        title.style.fontWeight = 'bold';
        title.style.color = 'var(--accent)';
        title.style.borderBottom = '1px solid #333';
        title.innerText = 'Ajustar Filtros';
        this.menu.appendChild(title);

        // List of common filter options
        const options = ['Episodios', 'Assets', 'Guiones', 'Recursos', 'Entrega', 'Work', 'Temp'];

        options.forEach(opt => {
            const el = document.createElement('div');
            el.className = 'cm-item';
            const isActive = window.pipetaFilterList.some(item => item.toLowerCase() === opt.toLowerCase());

            el.innerHTML = `
                <input type="checkbox" ${isActive ? 'checked' : ''} style="margin-right:8px;">
                ${opt}
            `;

            el.onclick = (ev) => {
                ev.stopPropagation();
                this.toggleFilterItem(opt);
                this.showFilterMenu(x, y); // Refresh menu
            };
            this.menu.appendChild(el);
        });

        this.menu.style.display = 'block';
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
    }

    toggleFilterItem(name) {
        const index = window.pipetaFilterList.findIndex(item => item.toLowerCase() === name.toLowerCase());
        if (index > -1) {
            window.pipetaFilterList.splice(index, 1);
        } else {
            window.pipetaFilterList.push(name);
        }
        // If filter is active, refresh the view
        if (window.pipetaUseFilter) {
            refreshCurrentView();
        }
    }
}

window.contextMenu = new ContextMenu();

function updateToolbarFileActionsState() {
    const isServer = (window.viewLocationMode === 'server');
    const isGhost = (window.contextMenu && typeof window.contextMenu.isAnyGhostSelected === 'function')
        ? window.contextMenu.isAnyGhostSelected(null, window.selectedContextPath)
        : false;

    const setBtnState = (id, disabled) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (disabled) {
            btn.setAttribute('disabled', 'true');
            btn.classList.add('disabled');
            btn.style.opacity = '0.35';
            btn.style.pointerEvents = 'none';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.removeAttribute('disabled');
            btn.classList.remove('disabled');
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.style.cursor = 'pointer';
        }
    };

    const canPaste = !isServer && !isGhost && !!(window.contextMenu && window.contextMenu.clipboard);

    setBtnState('btn-tb-openexplorer', isServer || isGhost);
    setBtnState('btn-tb-copy', isGhost);
    setBtnState('btn-tb-paste', !canPaste || isServer || isGhost);
    setBtnState('btn-tb-duplicate', isServer || isGhost);
    setBtnState('btn-tb-rename', isServer || isGhost);
    setBtnState('btn-tb-newfolder', isServer);
    setBtnState('btn-tb-delete', isServer || isGhost);
}
window.updateToolbarFileActionsState = updateToolbarFileActionsState;
