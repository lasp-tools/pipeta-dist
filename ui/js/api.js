// --- API INTEGRATION ---
async function fetchDir(path, options = {}) {
    let url = path ? `/api/fs/list?path=${encodeURIComponent(path)}` : '/api/fs/list';
    if (options && typeof options === 'object') {
        if (options.onlineEngine) url += `&online_engine=${encodeURIComponent(options.onlineEngine)}`;
        if (options.localSource) url += `&local_source=${encodeURIComponent(options.localSource)}`;
        if (options.force) url += `&force=true`;
    }
    const isAppLocal = path && (path.includes('presets') || /^[a-z]:[/\\]tools[/\\]apps/i.test(path) || /^[a-z]:[/\\]interno[/\\]tools[/\\]github/i.test(path));
    if (!isAppLocal && (!options || !options.localSource) && window.viewLocationMode === 'server') {
        url += `&local_source=server_catalog`;
    }
    if (!isAppLocal && (!options || !options.onlineEngine) && (window.viewLocationMode === 'drive' || window.viewLocationMode === 'online')) {
        url += `&online_engine=catalog`;
    }
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        console.error("Network Error", e);
        return { error: "Network Error" };
    }
}

async function getJson(url) {
    const res = await fetch(url);
    return await res.json();
}

async function postJson(url, body = {}) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return await res.json();
}

// Global API Object for I/O
const API = {
    fetchDir: fetchDir, // Alias
    getJson: getJson,
    postJson: postJson,

    fs: {
        // FS Helpers for Asset Designer (Node Backend)
        getFiles: async (dirPath, options = {}) => {
            const opts = Object.assign({ localSource: 'z_local' }, options);
            const data = await fetchDir(dirPath, opts);
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
                return await postJson('/api/fs/writeFile', { path, content });
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
        open: async (path) => postJson('/api/fs/open', { path }),
        openFolder: async (path) => postJson('/api/fs/open', { path }),
        mkdir: async (path) => postJson('/api/fs/mkdir', { path }),
        rename: async (oldPath, newPath, project) => postJson('/api/fs/rename', { oldPath, newPath, project }),
        copy: async (src, dest) => postJson('/api/fs/copy', { src, dest }),
        stat: async (path) => {
            try {
                return await postJson('/api/fs/stat', { path });
            } catch (e) {
                return { exists: false, error: e.message };
            }
        },
        delete: async (path) => postJson('/api/fs/delete', { path })
    },

    system: {
        getInfo: async () => {
            try {
                return await getJson('/api/system/info');
            } catch (e) {
                console.error("API Error: getInfo", e);
                return { username: 'unknown' };
            }
        },
        pickFolder: async (initialPath) => postJson('/api/system/pickFolder', { initialPath }),
        pickFile: async (initialPath, filter) => postJson('/api/system/pickFile', { initialPath, filter }),
        version: async () => getJson('/api/system/version'),
        health: async () => getJson('/api/health'),
        diskUsage: async (paths = []) => postJson('/api/system/disk-usage', { paths }),
        getLastProject: async () => getJson('/api/system/last-project'),
        saveLastProject: async (projectId, projectName) => postJson('/api/system/last-project', { projectId, projectName }),
        createShortcut: async () => postJson('/api/system/create-shortcut', {}),
        openErrorLog: async () => postJson('/api/system/open-error-log', {}),
        openReportsFolder: async () => postJson('/api/system/open-reports-folder', {}),
        diagnosticReport: async (payload = {}) => postJson('/api/system/diagnostic-report', payload),
        packageDist: async (payload = {}) => postJson('/api/system/package-dist', payload),
        checkUpdate: async () => getJson('/api/system/check-update'),
        updateFromServer: async () => postJson('/api/system/update-from-server', {})
    },

    sync: {
        detectEnv: async (force = false) => getJson('/api/sync/detect-env' + (force ? '?force=true' : '')),
        getCatalogs: async () => getJson('/api/sync/catalogs'),
        getWorkerStatus: async () => getJson('/api/sync/worker-status'),
        getCatalog: async (project, force = false) => getJson(`/api/sync/catalog?project=${encodeURIComponent(project)}${force ? '&force=true' : ''}`),
        getServerCatalog: async (project, force = false) => getJson(`/api/sync/server-catalog?project=${encodeURIComponent(project)}${force ? '&force=true' : ''}`),
        initProjectCatalog: async (project, client) => postJson('/api/sync/catalog/init-project', { project, client }),
        clearCatalogCache: async () => postJson('/api/sync/catalog/clear-cache', {}),
        refreshFolder: async (project, path, type = 'drive') => postJson('/api/sync/catalog/refresh-folder', { project, path, type }),
        generateCatalog: async (project, roots = {}) => postJson('/api/sync/generate-catalog', { project, roots }),
        setLocationMode: async (mode) => postJson('/api/sync/location-mode', { mode }),
        testConnection: async (uncPath) => postJson('/api/sync/test-connection', { uncPath }),
        requestDownload: async (payload) => postJson('/api/sync/request-download', payload),
        requestUpload: async (payload) => postJson('/api/sync/request-upload', payload),
        getQueue: async (user) => getJson('/api/sync/queue' + (user ? `?user=${encodeURIComponent(user)}` : ''))
    },

    ia: {
        getCustomTokens: async (project) => getJson(`/api/ia/custom-tokens?project=${encodeURIComponent(project || '')}`),
        saveCustomTokens: async (project, tokens) => postJson('/api/ia/custom-tokens', { project, tokens }),
        watcherStatus: async () => getJson('/api/ia/watcher/status'),
        toggleWatcher: async (enabled, watchDir) => postJson('/api/ia/watcher/toggle', { enabled, watchDir }),
        ingest: async (payload) => postJson('/api/ia/ingest', payload)
    },

    templates: {
        upload: async ({ type, processName, filename, fileData }) => postJson('/api/templates/upload', { type, processName, filename, fileData }),
        findReference: async (refRoot, processName) => postJson('/api/templates/findReference', { refRoot, processName })
    },

    users: {
        get: async () => getJson('/api/users'),
        save: async (data) => postJson('/api/users', data),
        verifyAdmin: async (password) => postJson('/api/users/verify-admin', { password }),
        setActive: async (laspUser) => postJson('/api/users/set-active', { laspUser })
    },

    ramon: {
        status: async () => getJson('/api/ramon/status'),
        login: async (username, password) => postJson('/api/ramon/login', { username, password }),
        logout: async () => postJson('/api/ramon/logout', {}),
        getTasks: async (user, project, force = false) => {
            let url = `/api/ramon/tasks?user=${encodeURIComponent(user)}`;
            if (project) url += `&project=${encodeURIComponent(project)}`;
            if (force) url += `&force=true`;
            return getJson(url);
        },
        invalidateTasksCache: async (user) => postJson('/api/ramon/tasks/invalidate', { user: user || '' }),
        getProjects: async (force = false) => {
            let url = `/api/ramon/projects`;
            if (force) url += `?force=true`;
            return getJson(url);
        },
        getProjectTasks: async (project, force = false) => {
            let url = `/api/ramon/project-tasks?project=${encodeURIComponent(project)}`;
            if (force) url += `&force=true`;
            return getJson(url);
        }
    },

    statuses: {
        get: async () => getJson('/api/statuses'),
        save: async (data) => postJson('/api/statuses', data)
    },

    workflow: {
        loadTracker: async (projectPath, workflowDir) => postJson('/api/workflow/shot-tracker/load', { projectPath, workflowDir }),
        saveTracker: async (workflowDir, trackerData) => postJson('/api/workflow/shot-tracker/save', { workflowDir, trackerData }),
        exportUserTasks: async (workflowDir, laspUser, userTasks, projectInfo) => postJson('/api/workflow/user-tasks/export', { workflowDir, laspUser, userTasks, projectInfo }),
        loadUserTasks: async (workflowDir, laspUser) => postJson('/api/workflow/user-tasks/load', { workflowDir, laspUser }),
        ensureProcessFolders: async (folderPaths) => postJson('/api/workflow/ensure-process-folders', { folderPaths })
    }
};

// Ensure API and fetchDir are available globally on window
window.fetchDir = fetchDir;
window.API = API;
