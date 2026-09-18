// --- API INTEGRATION ---
async function fetchDir(path, options = {}) {
    let url = path ? `/api/fs/list?path=${encodeURIComponent(path)}` : '/api/fs/list';
    if (options && typeof options === 'object') {
        if (options.onlineEngine) url += `&online_engine=${encodeURIComponent(options.onlineEngine)}`;
        if (options.localSource) url += `&local_source=${encodeURIComponent(options.localSource)}`;
        if (options.force) url += `&force=true`;
    }
    if ((!options || !options.localSource) && window.viewLocationMode === 'server') {
        url += `&local_source=server_catalog`;
    }
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        console.error("Network Error", e);
        return { error: "Network Error" };
    }
}

// Global API Object for I/O
const API = {
    fetchDir: fetchDir, // Alias
    fs: {
        // FS Helpers for Asset Designer (Node Backend)
        getFiles: async (dirPath) => {
            const data = await fetchDir(dirPath);
            // Server returns { path: ..., items: [...] }
            if (data && data.items && Array.isArray(data.items)) {
                return data.items.map(f => f.name);
            }
            return [];
        },

        readFile: async (path) => {
            try {
                const res = await fetch(`/api/fs/readFile?path=${encodeURIComponent(path)}`);
                const data = await res.json();
                return data.content;
            } catch (e) { console.error(e); return null; }
        },

        writeFile: async (path, content) => {
            try {
                const res = await fetch('/api/fs/writeFile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path, content })
                });
                return await res.json();
            } catch (e) { console.error(e); return false; }
        },

        deleteFile: async (path) => {
            console.log("[API] deleteFile called with:", path);
            try {
                const res = await fetch('/api/fs/deleteFile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path })
                });
                console.log("[API] deleteFile fetch response status:", res.status);
                const data = await res.json();
                console.log("[API] deleteFile result:", data);
                return data;
            } catch (e) {
                console.error("[API] deleteFile error:", e);
                return { success: false, error: e.message };
            }
        },

        fetchDir: (path, cb) => fetchDir(path, cb),
        open: async (path) => {
            return await fetch('/api/fs/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            }).then(r => r.json());
        },
        openFolder: async (path) => {
            return await fetch('/api/fs/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            }).then(r => r.json());
        },
        mkdir: async (path) => {
            return await fetch('/api/fs/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            }).then(r => r.json());
        },
        rename: async (oldPath, newPath) => {
            return await fetch('/api/fs/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath, newPath })
            }).then(r => r.json());
        },
        copy: async (src, dest) => {
            return await fetch('/api/fs/copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ src, dest })
            }).then(r => r.json());
        },
        stat: async (path) => {
            try {
                const res = await fetch('/api/fs/stat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path })
                });
                return await res.json();
            } catch (e) {
                return { exists: false, error: e.message };
            }
        },
        delete: async (path) => {
            return await fetch('/api/fs/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            }).then(r => r.json());
        }
    },
    system: {
        getInfo: async () => {
            try {
                const res = await fetch('/api/system/info');
                return await res.json();
            } catch (e) {
                console.error("API Error: getInfo", e);
                return { username: 'unknown' };
            }
        },
        pickFolder: async (initialPath) => fetch('/api/system/pickFolder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initialPath })
        }).then(r => r.json()),
        pickFile: async (initialPath, filter) => fetch('/api/system/pickFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initialPath, filter })
        }).then(r => r.json())
    },
    templates: {
        upload: async ({ type, processName, filename, fileData }) => fetch('/api/templates/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, processName, filename, fileData })
        }).then(r => r.json()),
        findReference: async (refRoot, processName) => fetch('/api/templates/findReference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refRoot, processName })
        }).then(r => r.json())
    },
    users: {
        get: async () => fetch('/api/users').then(r => r.json()),
        save: async (data) => fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(r => r.json()),
        verifyAdmin: async (password) => fetch('/api/users/verify-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        }).then(r => r.json()),
        setActive: async (laspUser) => fetch('/api/users/set-active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ laspUser })
        }).then(r => r.json())
    },
    ramon: {
        status: async () => fetch('/api/ramon/status').then(r => r.json()),
        login: async (username, password) => fetch('/api/ramon/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        }).then(r => r.json()),
        getTasks: async (user, project, force = false) => {
            let url = `/api/ramon/tasks?user=${encodeURIComponent(user)}`;
            if (project) url += `&project=${encodeURIComponent(project)}`;
            if (force) url += `&force=true`;
            return fetch(url).then(r => r.json());
        },
        invalidateTasksCache: async (user) => fetch('/api/ramon/tasks/invalidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: user || '' })
        }).then(r => r.json()),
        getProjects: async (force = false) => {
            let url = `/api/ramon/projects`;
            if (force) url += `?force=true`;
            return fetch(url).then(r => r.json());
        }
    },
    statuses: {
        get: async () => fetch('/api/statuses').then(r => r.json()),
        save: async (data) => fetch('/api/statuses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(r => r.json())
    },
    workflow: {
        loadTracker: async (projectPath, workflowDir) => fetch('/api/workflow/shot-tracker/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath, workflowDir })
        }).then(r => r.json()),
        saveTracker: async (workflowDir, trackerData) => fetch('/api/workflow/shot-tracker/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowDir, trackerData })
        }).then(r => r.json()),
        exportUserTasks: async (workflowDir, laspUser, userTasks, projectInfo) => fetch('/api/workflow/user-tasks/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowDir, laspUser, userTasks, projectInfo })
        }).then(r => r.json()),
        loadUserTasks: async (workflowDir, laspUser) => fetch('/api/workflow/user-tasks/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowDir, laspUser })
        }).then(r => r.json()),
        ensureProcessFolders: async (folderPaths) => fetch('/api/workflow/ensure-process-folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPaths })
        }).then(r => r.json())
    }
};

// Ensure API is available globally on window
window.API = API;
