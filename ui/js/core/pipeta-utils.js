// --- PIPETA SHARED UI UTILITIES ---
(function (global) {
    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0) + ' ' + units[i];
    }

    function normalizeSyncPath(p) {
        if (!p || typeof p !== 'string') return '';
        let norm = p.replace(/\\/g, '/').replace(/\/+$/, '');
        if (/^[a-zA-Z]:/.test(norm)) {
            norm = norm[0].toUpperCase() + norm.slice(1);
        }
        return norm;
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    global.PipetaUtils = {
        formatBytes,
        normalizeSyncPath,
        escapeHtml
    };

    if (!global.formatBytes) global.formatBytes = formatBytes;
})(window);
