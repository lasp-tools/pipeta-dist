// Configuration
window.APP_VERSION = "v1.0.02-beta";

const ROOTS = {
    work: "M:/Mi unidad/Z/mango/ick",
    media: "M:/Mi unidad/Z/INTERNO/MEDIA/mango/ick"
};

// --- GLOBAL STATE ---
let currentBrowserMode = (typeof localStorage !== 'undefined' && localStorage.getItem('pipeta_browser_mode')) || 'split';
let selectedContextPath = "";
let isMirrorMode = false;
let isMirroringInProgress = false; // Prevent infinite loop
