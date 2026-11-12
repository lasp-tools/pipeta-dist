// Configuration
window.APP_VERSION = "v1.2.15";
window.IS_BETA_CHANNEL = (window.APP_VERSION && window.APP_VERSION.includes('beta')) || (typeof window !== 'undefined' && window.location && (window.location.port === '3003' || window.location.port === '3050'));
window.PIPETA_LOCAL_APP_DIR = window.IS_BETA_CHANNEL ? "C:\\TOOLS\\APPS\\Pipeta_Beta" : "C:\\TOOLS\\APPS\\Pipeta";

if (typeof document !== 'undefined') {
    document.title = window.IS_BETA_CHANNEL ? "Pipeta Beta - Pipeline Manager" : "Pipeta - Pipeline Manager";
}

const ROOTS = {
    work: "M:/Mi unidad/Z/mango/ick",
    media: "M:/Mi unidad/Z/INTERNO/MEDIA/mango/ick"
};
window.ROOTS = ROOTS;

// --- GLOBAL STATE ---
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

window.getPipetaActiveUserObj = function() {
    const uData = window.cachedUsersData || (typeof settings !== 'undefined' ? settings.usersData : null);
    let active = null;
    
    // 1. Prioridad Absoluta: Sesión activa de Ramón (TACTIC) o sesión local explícita
    if (typeof Ramon !== 'undefined' && Ramon.session?.user) {
        active = Ramon.session.user.login || Ramon.session.user.username;
    }
    // 2. Si no hay sesión de Ramón pero hay usuario activo en settings/uData
    if (!active && uData?.activeUser) {
        active = uData.activeUser;
    }
    // 3. Fallback a window.activeUser si existe
    if (!active && typeof window.activeUser === 'string' && window.activeUser) {
        active = window.activeUser;
    }

    if (!active) {
        return null;
    }

    if (uData && Array.isArray(uData.users)) {
        const activeLower = String(active).toLowerCase().trim();
        const found = uData.users.find(u => {
            const uName = String(u.username || '').toLowerCase().trim();
            const lUser = String(u.laspUser || '').toLowerCase().trim();
            const uId = String(u.id || '').toLowerCase().trim();
            return uName === activeLower || lUser === activeLower || lUser.replace(/^lasp-/i, '') === activeLower || uId === activeLower;
        });
        if (found) return found;
    }

    if (active === 'admin' || (typeof Ramon !== 'undefined' && Ramon.session?.user?.is_admin)) {
        return { username: active, role: 'admin', isSystem: true };
    }
    return { username: active, role: 'user', isSystem: false };
};

window.isProjectAllowedForUser = function(project, userObj = null) {
    if (!project) return false;
    const user = userObj || (typeof window.getPipetaActiveUserObj === 'function' ? window.getPipetaActiveUserObj() : null);
    if (!user) return false;

    // Regla de Estudio: El rol Admin tiene acceso irrestricto a todos los proyectos siempre
    if (user.role === 'admin' || user.username === 'admin' || user.isSystem) {
        return true;
    }

    // Identificadores y tokens del proyecto a cotejar
    const pTokens = [];
    if (typeof project === 'string') {
        const s = project.toLowerCase().trim();
        pTokens.push(s);
        pTokens.push(s.replace(/^proj_/i, ''));
    } else {
        if (project.id) {
            const id = String(project.id).toLowerCase().trim();
            pTokens.push(id);
            pTokens.push(id.replace(/^proj_/i, ''));
        }
        if (project.name) {
            const nm = String(project.name).toLowerCase().trim();
            pTokens.push(nm);
            pTokens.push(nm.replace(/^proj_/i, ''));
        }
        if (project.code) pTokens.push(String(project.code).toLowerCase().trim());
        if (project.projectCode) pTokens.push(String(project.projectCode).toLowerCase().trim());
    }

    // 1. Proyectos asignados manualmente en Pipeta Server (assignedProjects)
    const assigned = Array.isArray(user.assignedProjects) ? user.assignedProjects : [];
    if (assigned.includes('*')) return true;
    const assignedMatch = assigned.some(a => {
        const cleanA = String(a).toLowerCase().trim().replace(/^proj_/i, '');
        return pTokens.includes(cleanA);
    });
    if (assignedMatch) return true;

    // 2. Proyectos donde el usuario tiene tareas activas en Ramón (TACTIC)
    if (typeof Ramon !== 'undefined' && Array.isArray(Ramon.tasks)) {
        const ramonProjects = Ramon.tasks.map(t => String(t.project || '').toLowerCase().trim()).filter(Boolean);
        const ramonMatch = ramonProjects.some(rp => {
            const cleanRp = rp.replace(/^proj_/i, '');
            return pTokens.includes(rp) || pTokens.includes(cleanRp);
        });
        if (ramonMatch) return true;
    }

    return false;
};
