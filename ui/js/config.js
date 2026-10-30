// Configuration
window.APP_VERSION = "v1.1.80";
if (typeof document !== 'undefined') {
    const isBetaChannel = (window.APP_VERSION && window.APP_VERSION.includes('beta')) || (typeof window !== 'undefined' && window.location && (window.location.port === '3003' || window.location.port === '3050'));
    document.title = isBetaChannel ? "Pipeta Beta - Pipeline Manager" : "Pipeta - Pipeline Manager";
}

const ROOTS = {
    work: "M:/Mi unidad/Z/mango/ick",
    media: "M:/Mi unidad/Z/INTERNO/MEDIA/mango/ick"
};

// --- GLOBAL STATE ---
let currentBrowserMode = 'split';
let selectedContextPath = "";
let isMirrorMode = false;
let isMirroringInProgress = false; // Prevent infinite loop

// Resuelve de manera unificada el usuario actual (Ramon, Pipeta User o Fallback)
window.getPipetaCurrentUser = function() {
    if (typeof Ramon !== 'undefined' && Ramon.session?.user) {
        const u = Ramon.session.user;
        const name = u.login || u.username;
        if (name) return name;
    }
    if (typeof settings !== 'undefined' && settings?.usersData?.activeUser) {
        return settings.usersData.activeUser;
    }
    if (typeof window.activeUser === 'string' && window.activeUser) {
        return window.activeUser;
    }
    return 'artista';
};
