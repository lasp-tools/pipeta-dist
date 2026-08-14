// ------------------------------------------
// --- SELECTION MANAGER & DRAG LOGIC ---
// ------------------------------------------

window.selectedPaths = new Set();
window.selectedContextPath = null;

const SelectionManager = {
    clear: () => {
        window.selectedPaths.clear();
        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        // Keep selectedContextPath? Maybe clear it if selection is empty?
        // selectedContextPath = null; 
        updateDesignContext();
    },

    add: (path, element) => {
        window.selectedPaths.add(path);
        if (element) {
            element.classList.add('selected');
            // Track isDir
            window.selectedContextIsDir = element.getAttribute('data-isdir') === 'true';
        }
        selectedContextPath = path; // Last added is primary
        updateDesignContext();
    },

    remove: (path, element) => {
        window.selectedPaths.delete(path);
        if (element) element.classList.remove('selected');
        if (selectedContextPath === path) {
            // If primary is removed, set primary to last in set?
            const items = Array.from(window.selectedPaths);
            selectedContextPath = items.length > 0 ? items[items.length - 1] : null;
            updateDesignContext();
        }
    },

    toggle: (path, element) => {
        if (window.selectedPaths.has(path)) {
            SelectionManager.remove(path, element);
        } else {
            SelectionManager.add(path, element);
        }
    },

    // Sync visual state (e.g. after refresh)
    syncVisuals: () => {
        // Iterate all selectable elements and apply .selected if in Set
        document.querySelectorAll('[data-path]').forEach(el => {
            if (window.selectedPaths.has(el.getAttribute('data-path'))) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
    }
};

class SelectionBox {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.isDragging = false;
        this.startPoint = { x: 0, y: 0 };
        this.box = document.createElement('div');
        this.box.className = 'selection-box';
        document.body.appendChild(this.box);

        this.setupEvents();
    }

    setupEvents() {
        this.container.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    onMouseDown(e) {
        // Ignore if clicking on a node directly (that is handled by node click)
        if (e.target.closest('.tree-node') || e.target.closest('.pipeta-block')) return;
        // Ignore right click
        if (e.button !== 0) return;

        this.isDragging = true;
        this.startPoint = { x: e.pageX, y: e.pageY };

        // If Shift not held, clear selection
        if (!e.shiftKey && !e.ctrlKey) {
            SelectionManager.clear();
        }

        this.updateBox(e.pageX, e.pageY);
        this.box.style.display = 'block';
    }

    onMouseMove(e) {
        if (!this.isDragging) return;
        this.updateBox(e.pageX, e.pageY);

        // Real-time selection highlighting?
        // Optimization: Only check intersection on MouseUp or throttle?
        // User requested "estiramos para seleccion multiple", implies visual feedback.
        // Let's implement real-time visual feedback but carefully.
        this.checkIntersection();
    }

    onMouseUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.box.style.display = 'none';
        // Final intersection check done in move, or do final here.
    }

    updateBox(x, y) {
        const left = Math.min(x, this.startPoint.x);
        const top = Math.min(y, this.startPoint.y);
        const width = Math.abs(x - this.startPoint.x);
        const height = Math.abs(y - this.startPoint.y);

        this.box.style.left = `${left}px`;
        this.box.style.top = `${top}px`;
        this.box.style.width = `${width}px`;
        this.box.style.height = `${height}px`;
    }

    checkIntersection() {
        const boxRect = this.box.getBoundingClientRect();

        // Find selectables in current container
        const selectables = this.container.querySelectorAll('.tree-node, .pipeta-block');

        selectables.forEach(el => {
            const elRect = el.getBoundingClientRect();

            // Simple AABB collision
            const intersects = !(
                boxRect.right < elRect.left ||
                boxRect.left > elRect.right ||
                boxRect.bottom < elRect.top ||
                boxRect.top > elRect.bottom
            );

            const path = el.getAttribute('data-path');
            if (intersects) {
                // If intersects, ADD to selection (Shift logic is implied by keeping previous ones? 
                // Wait, if I drag, I expect everything under box to be selected.
                // If I held Shift at start, I keep old ones.
                // Logic: 
                // At drag start, snapshot "Old Selection".
                // During drag: Current Selection = Old Selection + Intersected items.

                // Simplified: Just add. 
                if (!window.selectedPaths.has(path)) {
                    SelectionManager.add(path, el);
                }
            } else {
                // If we are "Live Selecting", should we unselect if it leaves the box?
                // Only if it wasn't selected before dragging?
                // This is getting complex. Let's stick to "Add if touched".
            }
        });
    }
}

// Initialize Selection Boxes for main containers
document.addEventListener('DOMContentLoaded', () => {
    new SelectionBox('browser-mode-split');
    new SelectionBox('pipeta-project-container');
    new SelectionBox('pipeta-media-container');
});
