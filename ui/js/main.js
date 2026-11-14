// --- TAB SWITCHING ---
const tabs = {
    'Inicio': 'view-home',
    'Explorer': 'view-browser',
    'Shot Navigator': 'view-shot-navigator',
    'Asset Designer': 'view-asset-designer',
    'Shot Designer': 'view-shot-designer',
    'IA Ingest': 'view-ia-ingest'
};
window.tabs = tabs;

// --- APP LIFECYCLE ---

function showOverlay(msg, subMsg) {
    const ov = document.getElementById('app-overlay');
    if (ov) {
        const msgEl = document.getElementById('app-overlay-msg');
        const subEl = document.getElementById('app-overlay-sub');
        const spinner = ov.querySelector('.spinner-large');
        if (msgEl) msgEl.innerText = msg;
        if (subEl) subEl.innerText = subMsg || "";
        if (spinner) {
            spinner.style.borderTopColor = 'var(--accent)';
            spinner.style.animation = 'spin 1s linear infinite';
        }
        ov.style.display = 'flex';
    }
}

function hideOverlay() {
    const ov = document.getElementById('app-overlay');
    if (ov) {
        ov.style.display = 'none';
    }
}

window.showOverlay = showOverlay;
window.hideOverlay = hideOverlay;

window.closeApp = async () => {
    showOverlay("Cerrando Aplicación", "Apagando servidor Pipeta Core...");
    try {
        await fetch('/api/app/close', { method: 'POST' });
    } catch (e) { console.error(e); }

    setTimeout(() => {
        window.close(); // Browser might block this
        document.getElementById('app-overlay-sub').innerText = "Servidor apagado. Puedes cerrar esta pestaña manualmente.";
        document.querySelector('.spinner-large').style.borderTopColor = '#444'; // Grey out spinner
        document.querySelector('.spinner-large').style.animation = 'none';
    }, 1000);
};

window.reloadApp = async () => {
    showOverlay("Recargando Sistema", "Reiniciando servidor y sincronizando...");
    try {
        await fetch('/api/app/restart', { method: 'POST' });
    } catch (e) { console.error(e); }

    // Start polling for server return
    const pollStart = Date.now();
    const poller = setInterval(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const res = await fetch('/api/version', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                clearInterval(poller);
                window.location.reload(true); // Force reload cache
            }
        } catch (e) {
            // Connection refused or timeout = server restarting
            const elapsed = Math.floor((Date.now() - pollStart) / 1000);
            document.getElementById('app-overlay-sub').innerText = `Reiniciando Servidor... (${elapsed}s)`;
        }
    }, 1000);
};

function switchView(viewId) {
    // Permission check for views
    const viewPermMap = {
        'view-browser': 'access_explorer',
        'view-shot-navigator': 'access_shot_navigator',
        'view-asset-designer': 'access_asset_designer',
        'view-shot-designer': 'access_shot_designer',
        'view-ia-ingest': 'access_ia_ingest'
    };
    const reqPerm = viewPermMap[viewId];
    if (reqPerm && !window.checkUserPermission(reqPerm)) {
        alert("🔒 Acceso Restringido: Tu rol de usuario no tiene permisos para acceder a esta sección.");
        return;
    }

    // 0. Si las configuraciones están abiertas, cerrarlas para ver el nuevo módulo
    if (typeof settings !== 'undefined' && settings.isVisible) {
        settings.close();
    }
    // Si Sync Queue está abierto (especialmente en modo maximizado canvas), cerrarlo para ver el nuevo módulo
    if (window.syncQueueUI && window.syncQueueUI.isVisible && window.syncQueueUI.isMaximized) {
        window.syncQueueUI.close();
    }
    // Si Sync Analyzer está abierto (especialmente en modo maximizado canvas), cerrarlo para ver el nuevo módulo
    if (window.syncAnalyzer && window.syncAnalyzer.isVisible && window.syncAnalyzer.isMaximized) {
        window.syncAnalyzer.close();
    }
    // Si File Auditor está abierto (especialmente en modo maximizado canvas), cerrarlo para ver el nuevo módulo
    if (window.fileAuditor && window.fileAuditor.isVisible && window.fileAuditor.isMaximized) {
        window.fileAuditor.close();
    }

    // 1. Update Buttons State
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const btnView = tabs[btn.getAttribute('title')];
        if (btnView === viewId) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    document.getElementById('btn-settings-toggle')?.classList.remove('active');

    // 2. Hide All Views
    document.querySelectorAll('.view-section').forEach(v => {
        v.style.display = 'none';
    });

    // 3. Show Target View
    const el = document.getElementById(viewId);
    if (el) {
        el.style.display = 'flex';

        // Initialize modules lazy-load
        if (viewId === 'view-home' && typeof Tutorials !== 'undefined') {
            Tutorials.init();
        }
        if (viewId === 'view-shot-navigator') {
            if (typeof ShotNavigator !== 'undefined') ShotNavigator.init();
        }
        if (viewId === 'view-asset-designer' && typeof AssetDesigner !== 'undefined') {
            if (!AssetDesigner.initialized) {
                AssetDesigner.init();
                AssetDesigner.initialized = true;
            } else {
                AssetDesigner.renderUI();
                AssetDesigner.renderCanvas();
                AssetDesigner.updateSidebar();
            }
        }
        if (viewId === 'view-shot-designer' && typeof ShotDesigner !== 'undefined') {
            if (!ShotDesigner.initialized) {
                ShotDesigner.init();
                ShotDesigner.initialized = true;
            } else {
                ShotDesigner.renderUI();
                ShotDesigner.renderCanvas();
                ShotDesigner.updateSidebar();
            }
        }
        if (viewId === 'view-ia-ingest') {
            if (typeof initIaIngest === 'function') initIaIngest();
            else if (typeof updateIaResolution === 'function') updateIaResolution();
            if (typeof switchIaWorkMode === 'function') switchIaWorkMode(window.iaWorkMode || 'simple');
        }
    }

    // 4. Update Toolbar
    if (typeof updateHeaderTools === 'function') {
        updateHeaderTools(viewId);
    }
    if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
}
window.switchView = switchView;

window.toggleCanvasFullscreen = () => {
    document.body.classList.toggle('canvas-fullscreen');
    const isFull = document.body.classList.contains('canvas-fullscreen');
    try {
        localStorage.setItem('pipeta_canvas_fullscreen', isFull ? 'true' : 'false');
    } catch (e) {}
};

// Check saved fullscreen preference
if (localStorage.getItem('pipeta_canvas_fullscreen') === 'true') {
    document.body.classList.add('canvas-fullscreen');
}

// Bind Click Events
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.id !== 'sidebarTransferQueueBtn' && window.syncQueueUI && window.syncQueueUI.isVisible && window.syncQueueUI.isMaximized) {
            window.syncQueueUI.close();
        }
        if (btn.getAttribute('title') !== 'Sync Analyzer' && window.syncAnalyzer && window.syncAnalyzer.isVisible && window.syncAnalyzer.isMaximized) {
            window.syncAnalyzer.close();
        }
        if (btn.id !== 'btnFileAuditorTool' && window.fileAuditor && window.fileAuditor.isVisible && window.fileAuditor.isMaximized) {
            window.fileAuditor.close();
        }
        const viewId = tabs[btn.getAttribute('title')];
        if (viewId) switchView(viewId);
    });
});

// --- ROLE PERMISSIONS & ACCESS CONTROL ---
window.checkUserPermission = (permKey) => {
    const uData = window.cachedUsersData || settings?.usersData;
    if (!uData) return true;

    if (permKey === 'access_tool_creator') {
        return window.checkUserPermission('access_tool_asset_creator') || window.checkUserPermission('access_tool_shot_creator');
    }

    // Simulación local de rol no-admin (para probar vista Freelance/Artista desde cuenta Admin)
    let simRoleId = null;
    try {
        simRoleId = localStorage.getItem('pipeta_sim_non_admin_role');
    } catch (e) {}
    const isFreelanceMode = !!(window.pipetaSystemEnv?.freelanceLocked);
    if (isFreelanceMode || simRoleId) {
        const freelanceHiddenPerms = new Set([
            'access_shot_navigator',
            'access_ia_ingest',
            'access_tool_creator',
            'access_tool_asset_creator',
            'access_tool_shot_creator'
        ]);
        if (freelanceHiddenPerms.has(permKey)) return false;
    }
    if (simRoleId) {
        const simRole = (uData.roles || []).find(r => r.id === simRoleId);
        if (simRole && simRole.permissions) {
            return simRole.permissions[permKey] !== false;
        }
    }

    // Resolve active user identity (Prioridad 1: Ramon session activa)
    let active = null;
    if (window.Ramon?.session?.user) {
        active = window.Ramon.session.user.login || window.Ramon.session.user.username;
    }
    if (!active && uData.activeUser) {
        active = uData.activeUser;
    }
    if (!active && typeof window.activeUser === 'string' && window.activeUser) {
        active = window.activeUser;
    }
    if (!active) active = 'admin';

    const activeLower = String(active).toLowerCase().trim();
    const user = (uData.users || []).find(u => {
        const uName = String(u.username || '').toLowerCase().trim();
        const lUser = String(u.laspUser || '').toLowerCase().trim();
        const uId = String(u.id || '').toLowerCase().trim();
        return uName === activeLower || lUser === activeLower || lUser.replace(/^lasp-/i, '') === activeLower || uId === activeLower;
    });
    if (!user) return true;
    if (user.role === 'admin' || user.username === 'admin') {
        // Si el modo Freelance está bloqueado, nunca otorgar privilegios admin en UI
        if (window.pipetaSystemEnv?.freelanceLocked) {
            const fallbackRole = (uData.roles || []).find(r => r.id === 'user');
            if (fallbackRole && fallbackRole.permissions) {
                return fallbackRole.permissions[permKey] !== false;
            }
            return false;
        }
        return true; // Full admin access
    }

    // 1. Explicit user-level override takes highest priority
    if (user.permissionOverrides && typeof user.permissionOverrides[permKey] === 'boolean') {
        return user.permissionOverrides[permKey];
    }

    // 2. Role permissions fallback
    const role = (uData.roles || []).find(r => r.id === user.role);
    if (!role || !role.permissions) return true;
    return role.permissions[permKey] !== false;
};

window.applyRolePermissionsToUI = async () => {
    try {
        if (!window.pipetaSystemEnv) {
            try {
                const envRes = await fetch('/api/system/freelance-lock');
                const envData = await envRes.json();
                if (envData && envData.env) window.pipetaSystemEnv = envData.env;
            } catch (e) {}
        }
        const uData = await API.users.get();
        window.cachedUsersData = uData;

        // 1. Sidebar Buttons
        const sidebarMap = {
            'Explorer': 'access_explorer',
            'Shot Navigator': 'access_shot_navigator',
            'Asset Designer': 'access_asset_designer',
            'Shot Designer': 'access_shot_designer',
            'IA Ingest': 'access_ia_ingest',
            'Naming Validator': 'access_tool_naming_validator',
            'Sync Analyzer': 'access_tool_sync_analyze',
            'File Auditor': 'access_tool_file_auditor',
            'Creator': 'access_tool_creator'
        };

        const hideRestricted = !!(window.pipetaSystemEnv?.freelanceLocked);

        document.querySelectorAll('.mode-sidebar .mode-btn').forEach(btn => {
            const title = btn.getAttribute('title');
            const reqPerm = sidebarMap[title];
            if (reqPerm) {
                let allowed = true;
                if (reqPerm === 'access_tool_creator') {
                    allowed = window.checkUserPermission('access_tool_asset_creator') || window.checkUserPermission('access_tool_shot_creator');
                } else {
                    allowed = window.checkUserPermission(reqPerm);
                }
                if (allowed) {
                    btn.style.display = '';
                    btn.style.opacity = '1';
                    btn.style.filter = 'none';
                    btn.style.pointerEvents = 'auto';
                    btn.removeAttribute('data-disabled-by-role');
                } else if (hideRestricted) {
                    btn.style.display = 'none';
                    btn.setAttribute('data-disabled-by-role', 'true');
                } else {
                    btn.style.display = '';
                    btn.style.opacity = '0.22';
                    btn.style.filter = 'grayscale(1) brightness(0.7)';
                    btn.style.pointerEvents = 'none';
                    btn.setAttribute('data-disabled-by-role', 'true');
                }
            }
        });

        // 2. Header Tools
        document.querySelectorAll('[data-perm-tool]').forEach(el => {
            const pKey = el.getAttribute('data-perm-tool');
            const allowed = window.checkUserPermission(pKey);
            if (allowed) {
                el.style.display = '';
                el.style.opacity = '1';
                el.style.filter = 'none';
                el.style.pointerEvents = 'auto';
            } else if (hideRestricted) {
                el.style.display = 'none';
            } else {
                el.style.display = '';
                el.style.opacity = '0.22';
                el.style.filter = 'grayscale(1) brightness(0.7)';
                el.style.pointerEvents = 'none';
            }
        });

        // 3. Drive Explorer Permissions (explorer_allow_drive)
        const canDrive = window.checkUserPermission('explorer_allow_drive');
        if (!canDrive) {
            if (window.viewLocationMode === 'drive' || window.viewLocationMode === 'online') {
                if (typeof switchViewLocation === 'function') switchViewLocation('local');
            }
            if (window.syncComparisonMode === 'drive') {
                if (typeof toggleSyncComparisonMode === 'function') {
                    toggleSyncComparisonMode('server');
                } else {
                    window.syncComparisonMode = 'off';
                }
            }
        }

        // 4. Presets Publish Buttons (presets_allow_publish)
        const canPublishPresets = window.checkUserPermission('presets_allow_publish');
        document.querySelectorAll('button[onclick*="openExportPresetsTab"]').forEach(b => {
            b.style.display = canPublishPresets ? '' : 'none';
        });

        // 5. Higgsfield AI Ingest Restrictions (ia_ingest_allow_higgsfield)
        const canHiggsfield = window.checkUserPermission('ia_ingest_allow_higgsfield');
        const hfBtn = document.getElementById('iaHfItemToggleBtn');
        if (hfBtn) {
            hfBtn.style.display = canHiggsfield ? '' : 'none';
        }
        document.querySelectorAll('button[onclick*="handleForceHiggsfieldOnSelected"]').forEach(b => {
            b.style.display = canHiggsfield ? '' : 'none';
        });
        document.querySelectorAll('select option[value="auto_hf"], select option[value="HFMC"]').forEach(opt => {
            opt.disabled = !canHiggsfield;
            opt.hidden = !canHiggsfield;
        });

        // 6. Refrescar guías visibles en Inicio según permisos/modo Freelance
        if (typeof Tutorials !== 'undefined' && typeof Tutorials.renderHome === 'function') {
            Tutorials.renderHome();
        }

    } catch (e) {
        console.warn("Could not apply role permissions:", e);
    }
};

// --- INIT ---
fetch('/api/version').then(r => r.json()).then(d => {
    if (d.version) {
        window.APP_VERSION = d.version;
        const el = document.getElementById('appVersion');
        if (el) el.innerText = d.version;
    }
});

// Initialize Browser Component
async function initApp() {
    // 0. Init Ramon session first (purges stale browser cache on clean external installs & shows login immediately)
    if (typeof Ramon !== 'undefined') {
        await Ramon.init();
    }

    // 1. Load Settings (Projects, Configs)
    if (typeof settings !== 'undefined') {
        await settings.init();
    }

    // Init Inspector (Presets)
    if (typeof Inspector !== 'undefined') {
        Inspector.init();
    }

    // 2. Set Default View Mode (from config if available)
    let initialMode = (settings && settings.defaultViewMode)
        ? (settings.defaultViewMode === 'online' ? 'drive' : settings.defaultViewMode)
        : (localStorage.getItem('pipeta_view_location_mode') || 'local');
    if (window.pipetaSystemEnv?.isExternalMachine && initialMode === 'server') {
        initialMode = 'local';
    }

    // Set global mode (without triggering refresh yet)
    window.viewLocationMode = initialMode;

    // 2b. Ensure Split View container is visible
    const splitEl = document.getElementById('browser-mode-split');
    if (splitEl) splitEl.style.display = 'flex';

    // 2c. Set Default Sync Comparison Mode (Drive vs Server)
    const canServer = (typeof canUseServerMode === 'function') ? canUseServerMode() : false;
    const configCompPref = (typeof settings !== 'undefined') ? settings.defaultSyncComparisonMode : null;
    let initialCompMode;
    if (canServer) {
        // En puestos de Munro sin Z SMB real (vsubst / copia local):
        // Por regla canónica de estudio, al abrir, actualizar o dar F5 el default es SIEMPRE Z(SMB server)
        const configCompPref = (typeof settings !== 'undefined') ? settings.defaultSyncComparisonMode : null;
        if (configCompPref === 'off') {
            initialCompMode = 'off';
        } else {
            initialCompMode = 'server';
        }
    } else {
        const savedComp = localStorage.getItem('pipeta_sync_comparison_mode');
        initialCompMode = (savedComp && ['drive', 'server', 'off'].includes(savedComp)) ? savedComp : 'drive';
    }

    if (window.pipetaSystemEnv?.isExternalMachine && initialCompMode === 'server') {
        initialCompMode = 'drive';
    }
    window.syncComparisonMode = initialCompMode;
    try { localStorage.setItem('pipeta_sync_comparison_mode', initialCompMode); } catch(e){}

    // 3. Init Browser (will use window.viewLocationMode)
    if (typeof initBrowser === 'function') {
        await initBrowser();
    }

    // 4. Set Default View (Fixes overlap issues on load)
    switchView('view-browser');

    // 5. Force UI Update for Toggle Button
    if (typeof updateHeaderTools === 'function') {
        updateHeaderTools('view-browser');
    }

    // 7. Check Rclone Status
    checkRcloneStatus();

    // 8. Init Header User Selector and Permissions
    await updateHeaderUserSelector();
    await applyRolePermissionsToUI();
}
window.initApp = initApp;

// --- HEADER USER SWITCHER ---
window.handleHeaderUserSwitch = async (userVal) => {
    try {
        if (userVal === '__RAMON_LOGIN__') {
            await updateHeaderUserSelector();
            if (typeof Ramon !== 'undefined' && typeof Ramon.showLoginModal === 'function') {
                Ramon.showLoginModal('ramon');
            }
            return;
        }
        if (userVal === '__LOCAL_LOGIN__') {
            await updateHeaderUserSelector();
            if (typeof Ramon !== 'undefined' && typeof Ramon.showLoginModal === 'function') {
                Ramon.showLoginModal('local');
            }
            return;
        }

        const uData = await API.users.get();
        const targetUser = (uData.users || []).find(u => u.username === userVal || u.laspUser === userVal || u.id === userVal);

        // If switching to an admin user, require authentication unless already remembered
        if (targetUser && targetUser.role === 'admin') {
            const isUnlocked = localStorage.getItem('pipeta_admin_unlocked') === 'true';
            if (!isUnlocked) {
                const pass = prompt(`🔒 Ingrese la contraseña de Administrador para cambiar al usuario ${targetUser.username || targetUser.firstName || userVal}:`);
                if (!pass) {
                    updateHeaderUserSelector();
                    return;
                }
                const authRes = await API.users.verifyAdmin(pass);
                if (!authRes || !authRes.authorized) {
                    alert("❌ Contraseña de Administrador incorrecta.");
                    updateHeaderUserSelector();
                    return;
                }
                const remember = confirm("¿Deseas recordar la sesión de Administrador en este equipo?");
                if (remember) {
                    try { localStorage.setItem('pipeta_admin_unlocked', 'true'); } catch (e) {}
                }
            }
        }

        const activeKey = targetUser ? (targetUser.username || targetUser.laspUser || targetUser.id) : userVal;
        await API.users.setActive(activeKey);
        window.cachedUsersData = null;
        if (typeof ShotNavigator !== 'undefined') {
            ShotNavigator.activeUser = activeKey;
            ShotNavigator.render();
        }
        const isTargetAdmin = targetUser?.username === 'admin' || targetUser?.id === 'u_admin' || (targetUser?.isSystem && targetUser?.role === 'admin');
        const isTargetRamon = !isTargetAdmin && (targetUser?.authSource === 'ramon' || (targetUser?.laspUser && targetUser?.laspUser.startsWith('lasp-')));
        if (typeof Ramon !== 'undefined') {
            if (!isTargetRamon) {
                Ramon.session = {
                    mode: 'local',
                    user: {
                        login: activeKey,
                        username: activeKey,
                        display_name: targetUser?.firstName ? `${targetUser.firstName} ${targetUser.lastName || ''}`.trim() : activeKey,
                        role: targetUser?.role || (isTargetAdmin ? 'admin' : 'user')
                    },
                    timestamp: new Date().toISOString()
                };
                try { localStorage.setItem('pipeta_session', JSON.stringify(Ramon.session)); } catch (e) {}
            }
        }
        await updateHeaderUserSelector();
        if (typeof Ramon !== 'undefined' && typeof Ramon.applySessionToHeader === 'function') {
            Ramon.applySessionToHeader();
        }
        await applyRolePermissionsToUI();
        if (typeof updateHeaderTools === 'function') {
            updateHeaderTools();
        }
        if (typeof ShotNavigator !== 'undefined' && ShotNavigator.initialized) {
            await ShotNavigator.loadDependencies(true);
            if (ShotNavigator.isRamonMode()) {
                await ShotNavigator.loadWorkflow(true);
            }
            ShotNavigator.render();
        }
    } catch (e) {
        console.error("Error switching user:", e);
        alert("Error al cambiar usuario: " + e.message);
    }
};

window.updateHeaderUserSelector = async () => {
    try {
        if (typeof Ramon !== 'undefined' && typeof Ramon.applySessionToHeader === 'function') {
            Ramon.applySessionToHeader();
        }
    } catch (e) {}
};

// --- RCLONE STATUS ---
async function checkRcloneStatus() {
    try {
        const res = await fetch('/api/rclone/status');
        const data = await res.json();
        window.rcloneStatus = data; // Store globally for settings UI
    } catch (e) { /* silent */ }
}

// --- DISK USAGE MONITOR ---
function toggleDiskMonitor() {
    const monitor = document.getElementById('disk-monitor');
    const btn = document.getElementById('btnToggleDisks');
    if (!monitor) return;
    const isHidden = monitor.style.display === 'none' || getComputedStyle(monitor).display === 'none';
    if (isHidden) {
        monitor.style.display = 'flex';
        if (btn) btn.classList.add('active');
        if (typeof updateDiskMonitor === 'function') updateDiskMonitor();
    } else {
        monitor.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}
window.toggleDiskMonitor = toggleDiskMonitor;

async function updateDiskMonitor() {
    try {
        let onlineDrive = 'G';
        if (typeof settings !== 'undefined' && settings.currentProject) {
            const cp = settings.currentProject;
            const onlinePath = cp.onlineMedia || cp.onlineWork || (cp.roots && (cp.roots.media || cp.roots.online)) || '';
            if (onlinePath && onlinePath.includes(':')) {
                onlineDrive = onlinePath.split(':')[0].toUpperCase();
            }
        }

        // Evitar comparar Z con Z (el disco local es Z, el disco online debe ser G u otra unidad online)
        if (onlineDrive === 'Z') {
            onlineDrive = 'G';
        }

        const res = await fetch(`/api/system/diskUsage?drives=Z,${onlineDrive}`);
        const data = await res.json();

        _updateDiskBar('z', data['Z'], 'Z');
        _updateDiskBar('m', data[onlineDrive], onlineDrive);
    } catch (e) {
        // Silently fail — could be offline
    }
}
window.updateDiskMonitor = updateDiskMonitor;

function _updateDiskBar(id, info, driveLetter) {
    const bar = document.getElementById(`disk-bar-${id}`);
    const textEl = document.getElementById(`disk-pct-${id}`);
    const wrap = bar?.closest('.disk-bar-wrap');
    if (!bar || !textEl || !info) return;

    if (driveLetter) {
        const labelEl = wrap?.querySelector('.disk-label');
        if (labelEl) labelEl.innerText = `${driveLetter}:`;
    }

    const percent = info.percent || 0;
    bar.style.width = percent + '%';

    // Format free space smartly (TB if >= 1024 GB, otherwise GB, 3 significant digits)
    const freeText = _formatDiskSize(info.free);
    textEl.innerText = `${percent}% usado / ${freeText} free`;

    // Color coding
    bar.classList.remove('warn', 'critical');
    if (percent >= 90) bar.classList.add('critical');
    else if (percent >= 70) bar.classList.add('warn');

    // Tooltip con detalles
    const totalText = _formatDiskSize(info.total);
    const usedText = _formatDiskSize(info.used);
    const displayLetter = driveLetter || id.toUpperCase();
    if (wrap) {
        wrap.title = `Disco (${displayLetter}:) — ${usedText} usados de ${totalText} (${freeText} libres)`;
    }
}

function _formatDiskSize(bytes) {
    const gb = bytes / (1024 ** 3);
    if (gb >= 1024) return (gb / 1024).toFixed(2) + ' TB';
    if (gb >= 100) return gb.toFixed(0) + ' GB';
    if (gb >= 10) return gb.toFixed(1) + ' GB';
    return gb.toFixed(2) + ' GB';
}

// --- FOLDER SIZE CALCULATOR ---
async function updateFolderSizes() {
    try {
        const roots = getCurrentRoots();
        // Fetch both sizes in parallel
        const [workRes, mediaRes] = await Promise.all([
            fetch(`/api/fs/dirSize?path=${encodeURIComponent(roots.work)}`).then(r => r.json()).catch(() => null),
            fetch(`/api/fs/dirSize?path=${encodeURIComponent(roots.media)}`).then(r => r.json()).catch(() => null)
        ]);

        const workSizeEl = document.getElementById('project-size-label');
        const mediaSizeEl = document.getElementById('media-size-label');

        if (workSizeEl && workRes && workRes.size !== undefined) {
            workSizeEl.innerText = `(${_formatSize(workRes.size)})`;
        }
        if (mediaSizeEl && mediaRes && mediaRes.size !== undefined) {
            mediaSizeEl.innerText = `(${_formatSize(mediaRes.size)})`;
        }
    } catch (e) { /* silent */ }
}
window.updateFolderSizes = updateFolderSizes;

function _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 ** 3) return (bytes / (1024 ** 2)).toFixed(1) + ' MB';
    const gb = bytes / (1024 ** 3);
    if (gb >= 1024) return (gb / 1024).toFixed(2) + ' TB';
    if (gb >= 100) return gb.toFixed(0) + ' GB';
    if (gb >= 10) return gb.toFixed(1) + ' GB';
    return gb.toFixed(2) + ' GB';
}

function toggleFileAuditor() {
    if (window.fileAuditor) {
        window.fileAuditor.toggle();
    }
}
window.toggleFileAuditor = toggleFileAuditor;

function toggleMirrorAuditor() {
    toggleFileAuditor();
}
window.toggleMirrorAuditor = toggleMirrorAuditor;

// Shortcuts
window.addEventListener('keydown', (e) => {
    // Alt+P removed (Properties panel retired)
});

// Start
document.addEventListener('DOMContentLoaded', () => initApp());

// Live Reconnect & Auto-Reload on Server Restart / Reinstall
(function setupLiveServerWatcher() {
    let initialBootTime = null;
    let lastKnownConfigSync = null;

    async function pingServer() {
        try {
            const res = await fetch('/api/version', {
                cache: 'no-store',
                signal: AbortSignal.timeout(5000)
            });
            if (res.ok) {
                const data = await res.json();
                const currentBoot = data.serverBootTime || data.version;
                if (initialBootTime === null) {
                    initialBootTime = currentBoot;
                    lastKnownConfigSync = data.lastConfigSync || 0;
                } else if (initialBootTime && data.serverBootTime && initialBootTime !== data.serverBootTime) {
                    console.log('[PIPETA] Servidor local reiniciado / actualizado. Recargando pestaña activa...');
                    window.location.reload();
                    return;
                }

                // Detectar actualización de configuraciones en caliente
                if (lastKnownConfigSync !== null && data.lastConfigSync && data.lastConfigSync > lastKnownConfigSync) {
                    lastKnownConfigSync = data.lastConfigSync;
                    console.log('[PIPETA] ⚙️ Configuraciones maestras sincronizadas en caliente.');
                    if (window.PipetaConsole && typeof PipetaConsole.push === 'function') {
                        PipetaConsole.push('info', '⚙️ Configuraciones de proyectos, permisos y usuarios actualizadas desde el servidor central.');
                    }
                    if (typeof applyRolePermissionsToUI === 'function') {
                        applyRolePermissionsToUI();
                    }
                }
            }
        } catch (e) {
            // Server busy - do not trigger page reload
        }
    }

    setInterval(pingServer, 5000);
    setTimeout(pingServer, 1000);
})();
