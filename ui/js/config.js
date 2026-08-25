// Configuration
window.APP_VERSION = "v0.9.70";

const ROOTS = {
    work: "M:/Mi unidad/Z/mango/ick",
    media: "M:/Mi unidad/Z/INTERNO/MEDIA/mango/ick"
};

// --- GLOBAL STATE ---
let currentBrowserMode = 'split';
let selectedContextPath = "";
let isMirrorMode = false;
let isMirroringInProgress = false; // Prevent infinite loop
