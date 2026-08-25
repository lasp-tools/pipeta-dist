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
        let name = target.innerText.trim();

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

    getMenuItems(path, isDir, name, multi, count) {
        const canPaste = !!this.clipboard;
        const labelSuffix = multi ? ` (${count})` : '';

        // If multi, disable single-item actions like Rename, Open in Explorer?
        // Open in Explorer could open multiple windows, maybe limit it?

        return [
            { label: 'Abrir en Explorer', icon: '📂', action: (p) => this.openInExplorer(p, multi) },
            { separator: true },
            { label: `Copiar${labelSuffix}`, icon: '📄', action: (p) => this.copyToClipboard(false) },
            { label: `Cortar${labelSuffix}`, icon: '✂️', action: (p) => this.copyToClipboard(true) },
            { label: 'Pegar', icon: '📋', action: (p) => this.pasteFromClipboard(p), disabled: !canPaste },
            { separator: true },
            { label: 'Renombrar', icon: '✏️', action: (p) => this.renameItem(p, name), disabled: multi },
            { label: `Duplicar${labelSuffix}`, icon: '♊', action: (p) => this.duplicateItems() },
            { label: `Borrar${labelSuffix}`, icon: '🗑️', action: (p) => this.deleteItems() },
            { separator: true },
            { label: 'Copiar Ruta', icon: '🔗', action: (p) => this.copyPath(p) },
            { label: 'Nueva Carpeta', icon: '📁', action: (p) => this.createFolder(p, isDir), disabled: multi }
        ];
    }

    // --- ACTIONS ---

    async openInExplorer(path, multi) {
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
        const paths = Array.from(window.selectedPaths);
        this.clipboard = { paths, isCut };
        console.log(`Clipboard: ${isCut ? 'Cut' : 'Copy'} ${paths.length} items`);
    }

    async pasteFromClipboard(targetPath) {
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
        const paths = Array.from(window.selectedPaths);
        const count = paths.length;
        if (confirm(`¿Estás seguro de BORRAR PERMANENTEMENTE ${count} elemento(s)?`)) {
            const promises = paths.map(p => API.fs.delete(p));
            await Promise.all(promises);
            refreshCurrentView();
        }
    }

    async createFolder(path, isDir) {
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
