// Configuration
window.APP_VERSION = "v1.1.26";

const ROOTS = {
    work: "M:/Mi unidad/Z/mango/ick",
    media: "M:/Mi unidad/Z/INTERNO/MEDIA/mango/ick"
};

// --- GLOBAL STATE ---
let currentBrowserMode = (typeof localStorage !== 'undefined' && localStorage.getItem('pipeta_browser_mode')) || 'split';
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
