// --- API INTEGRATION ---
async function fetchDir(path) {
    const url = path ? `/api/fs/list?path=${encodeURIComponent(path)}` : '/api/fs/list';
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

        // Legacy/Existing methods
        fetchDir: (path, cb) => fetchDir(path, cb),
        open: async (path) => {
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
        }
    }
};

// Ensure API is available globally on window
window.API = API;
