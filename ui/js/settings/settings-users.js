// --- SETTINGS USERS, ROLES & STATUSES MODULE ---
Object.assign(settings, {
    loadUsersConfig: async () => {
        try {
            settings.usersData = await API.users.get();
        } catch(e) {
            console.error("Error loading users config:", e);
        }
    },

    saveUsersConfig: async () => {
        try {
            await API.users.save(settings.usersData);
        } catch(e) {
            console.error("Error saving users config:", e);
        }
    },

    updateUsersConfigProp: async (prop, value) => {
        if (!settings.usersData) settings.usersData = { users: [], roles: [] };
        settings.usersData[prop] = value;
        await settings.saveUsersConfig();
        settings.render();
        settings.showToast("Configuración de usuarios actualizada", "success", 2);
    },

    setActiveUser: async (laspUser) => {
        try {
            await API.users.setActive(laspUser);
            if (settings.usersData) settings.usersData.activeUser = laspUser;
            if (typeof ShotNavigator !== 'undefined') {
                ShotNavigator.activeUser = laspUser;
                ShotNavigator.render();
            }
            settings.render();
        } catch(e) {
            alert("Error al cambiar usuario activo: " + e.message);
        }
    },

    openUserModal: (userId = null) => {
        const uData = settings.usersData || { users: [], roles: [] };
        const user = userId ? (uData.users || []).find(u => u.id === userId) : null;
        const isEditing = !!user;

        const overlay = document.createElement('div');
        overlay.id = 'pipeta-settings-modal-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(5,7,11,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; transform:translateZ(0); will-change:opacity;';

        const rolesOptions = (uData.roles || []).map(r => `
            <option value="${r.id}" ${user?.role === r.id ? 'selected' : ''}>${r.name} (${r.id})</option>
        `).join('');

        overlay.innerHTML = `
            <div style="background:#14171e; border:1px solid #28303d; border-radius:8px; width:540px; max-width:92vw; padding:22px; box-shadow:0 10px 30px rgba(0,0,0,0.7); color:#eee;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #28303d; padding-bottom:12px; margin-bottom:16px;">
                    <b style="font-size:1.05rem; color:var(--accent);">${isEditing ? '✏️ Editar Usuario' : '👤 Nuevo Usuario'}</b>
                    <button class="icon-btn" onclick="settings.closeModalOverlay()" style="background:transparent; border:none; color:#888; font-size:1.2rem; cursor:pointer;">&times;</button>
                </div>

                <div style="display:flex; flex-direction:column; gap:12px; font-size:0.82rem;">
                    <div>
                        <label style="color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">Nombre de Usuario *</label>
                        <input id="modal-u-username" type="text" value="${user?.username || ''}" placeholder="artista compo" 
                               style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; font-family:monospace; outline:none;">
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Nombre</label>
                            <input id="modal-u-firstname" type="text" value="${user?.firstName || ''}" placeholder="" 
                                   oninput="settings.updateLaspFieldFromNames()"
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Apellido</label>
                            <input id="modal-u-lastname" type="text" value="${user?.lastName || ''}" placeholder="" 
                                   oninput="settings.updateLaspFieldFromNames()"
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Usuario LASP</label>
                            <input id="modal-u-lasp" type="text" value="${user?.laspUser || ''}" placeholder="lasp-aroberto" 
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:var(--accent); font-family:monospace; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Rol Asignado *</label>
                            <select id="modal-u-role" style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                                ${rolesOptions}
                            </select>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Email</label>
                            <input id="modal-u-email" type="email" value="${user?.email || ''}" placeholder="" 
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Color Avatar</label>
                            <input id="modal-u-color" type="color" value="${user?.avatarColor || '#ff9800'}" 
                                   style="width:100%; height:32px; background:#1c222d; border:1px solid #2e3846; border-radius:4px; cursor:pointer; padding:2px;">
                        </div>
                    </div>

                    <div>
                        <label style="color:#aaa; display:block; margin-bottom:4px;">Notas</label>
                        <input id="modal-u-notes" type="text" value="${user?.notes || ''}" placeholder="" 
                               style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                    </div>

                    <!-- PROYECTOS ASIGNADOS MANUALMENTE -->
                    <div style="background:#101319; border:1px solid #232a35; border-radius:6px; padding:10px 12px; margin-top:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-weight:bold; color:var(--accent); font-size:0.78rem; text-transform:uppercase;">
                                📁 Proyectos Asignados Manualmente (Override)
                            </span>
                            <span style="color:#777; font-size:0.70rem;">Acceso independiente de Ramón</span>
                        </div>
                        <div id="modal-assigned-projects-notice" style="display:${user?.role === 'admin' ? 'block' : 'none'}; color:#ebcb8b; font-size:0.74rem; margin-bottom:6px; font-style:italic;">
                            ℹ️ El rol Administrador tiene acceso total a todos los proyectos del estudio siempre.
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.74rem; max-height:120px; overflow-y:auto; padding-right:4px;">
                            ${(() => {
                                const uAssigned = Array.isArray(user?.assignedProjects) ? user.assignedProjects.map(x => String(x).toLowerCase().replace(/^proj_/i, '')) : [];
                                const available = (settings.projects || []).filter(p => !settings.isBaseProject(p));
                                if (available.length === 0) return '<div style="color:#666; font-style:italic; grid-column:1/-1;">No hay proyectos disponibles</div>';
                                return available.map(p => {
                                    const pClean = String(p.name || p.id).toLowerCase().replace(/^proj_/i, '');
                                    const isChecked = uAssigned.includes(pClean) || uAssigned.includes(String(p.id).toLowerCase());
                                    return `
                                        <label style="display:flex; align-items:center; gap:6px; background:#161b22; padding:4px 6px; border-radius:4px; border:1px solid #252d3a; cursor:pointer;">
                                            <input type="checkbox" data-user-project-id="${p.name || p.id}" ${isChecked ? 'checked' : ''} style="accent-color:var(--accent); cursor:pointer;">
                                            <span style="color:#ddd; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><b>${p.name}</b> <span style="color:#777; font-size:0.68rem;">(${p.client || 'LASP'})</span></span>
                                        </label>
                                    `;
                                }).join('');
                            })()}
                        </div>
                    </div>

                    <!-- EXCEPCIONES DE PERMISOS POR USUARIO -->
                    <div style="background:#101319; border:1px solid #232a35; border-radius:6px; padding:10px 12px; margin-top:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-weight:bold; color:var(--accent); font-size:0.78rem; text-transform:uppercase;">
                                🛡️ Excepciones de Permisos por Usuario (Overrides)
                            </span>
                            <span style="color:#777; font-size:0.70rem;">Sobrescribe el Rol</span>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.74rem;">
                            ${(() => {
                                const uOv = user?.permissionOverrides || {};
                                const perms = [
                                    { key: 'explorer_allow_drive', label: '☁️ Drive (Explorar & Comparar)' },
                                    { key: 'settings_allow_advanced', label: '🛠️ Ajustes Avanzados' },
                                    { key: 'export_portable_zip', label: '📦 Exportar ZIP Portable' },
                                    { key: 'presets_allow_publish', label: '🚀 Publicar Presets' },
                                    { key: 'projects_allow_edit', label: '📁 Editar Proyectos' },
                                    { key: 'ia_ingest_allow_higgsfield', label: '⚡ Higgsfield en IA Ingest' }
                                ];
                                return perms.map(p => `
                                    <div style="display:flex; justify-content:space-between; align-items:center; background:#161b22; padding:4px 6px; border-radius:4px; border:1px solid #252d3a;">
                                        <span style="color:#ccc; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:4px;">${p.label}</span>
                                        <select data-user-override-key="${p.key}" style="background:#0d1117; color:#eee; border:1px solid #333; border-radius:3px; padding:1px 4px; font-size:0.70rem;">
                                            <option value="" ${uOv[p.key] === undefined ? 'selected' : ''}>Rol Base</option>
                                            <option value="true" ${uOv[p.key] === true ? 'selected' : ''} style="color:#81c784;">✓ Permitir</option>
                                            <option value="false" ${uOv[p.key] === false ? 'selected' : ''} style="color:#ef5350;">✗ Bloquear</option>
                                        </select>
                                    </div>
                                `).join('');
                            })()}
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid #28303d; padding-top:14px;">
                    <button class="btn" onclick="settings.closeModalOverlay()" style="background:#222; color:#ccc; border:1px solid #444; padding:6px 14px; border-radius:4px; cursor:pointer;">Cancelar</button>
                    <button class="btn" onclick="settings.saveUserModal('${userId || ''}')" style="background:var(--accent); color:black; font-weight:bold; border:none; padding:6px 16px; border-radius:4px; cursor:pointer;">
                        ${isEditing ? 'Guardar Cambios' : 'Crear Usuario'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    },

    updateLaspFieldFromNames: () => {
        const fn = document.getElementById('modal-u-firstname')?.value.trim() || '';
        const ln = document.getElementById('modal-u-lastname')?.value.trim() || '';
        const laspInput = document.getElementById('modal-u-lasp');
        if (!laspInput) return;

        if (fn || ln) {
            const cleanFn = fn.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanLn = ln.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
            const initial = cleanFn.length > 0 ? cleanFn[0] : '';
            laspInput.value = `lasp-${initial}${cleanLn}`;
        } else {
            laspInput.value = '';
        }
    },

    saveUserModal: async (existingId) => {
        const username = document.getElementById('modal-u-username')?.value.trim();
        if (!username) {
            alert("El nombre de usuario es obligatorio.");
            return;
        }

        const firstName = document.getElementById('modal-u-firstname')?.value.trim() || '';
        const lastName = document.getElementById('modal-u-lastname')?.value.trim() || '';
        const laspUser = document.getElementById('modal-u-lasp')?.value.trim() || (firstName && lastName ? `lasp-${firstName[0].toLowerCase()}${lastName.toLowerCase().replace(/\s+/g, '')}` : `lasp-${username}`);
        const role = document.getElementById('modal-u-role')?.value || 'user';
        const email = document.getElementById('modal-u-email')?.value.trim() || '';
        const avatarColor = document.getElementById('modal-u-color')?.value || '#ff9800';
        const notes = document.getElementById('modal-u-notes')?.value.trim() || '';

        if (!settings.usersData) settings.usersData = { users: [], roles: [] };
        if (!settings.usersData.users) settings.usersData.users = [];

        const overrides = {};
        document.querySelectorAll('[data-user-override-key]').forEach(sel => {
            const k = sel.getAttribute('data-user-override-key');
            const v = sel.value;
            if (v === 'true') overrides[k] = true;
            else if (v === 'false') overrides[k] = false;
        });

        const assignedProjects = [];
        document.querySelectorAll('[data-user-project-id]:checked').forEach(cb => {
            const pid = cb.getAttribute('data-user-project-id');
            if (pid) assignedProjects.push(pid);
        });

        if (existingId) {
            const u = settings.usersData.users.find(x => x.id === existingId);
            if (u) {
                u.username = username;
                u.firstName = firstName;
                u.lastName = lastName;
                u.laspUser = laspUser;
                u.role = role;
                u.email = email;
                u.avatarColor = avatarColor;
                u.notes = notes;
                u.assignedProjects = assignedProjects;
                if (Object.keys(overrides).length > 0) u.permissionOverrides = overrides;
                else delete u.permissionOverrides;
            }
        } else {
            const newUserObj = {
                id: 'u_' + username.replace(/[^a-zA-Z0-9_]/g, '_') + '_' + Date.now().toString().slice(-4),
                username,
                firstName,
                lastName,
                laspUser,
                role,
                email,
                avatarColor,
                notes,
                isSystem: false
            };
            newUserObj.assignedProjects = assignedProjects;
            if (Object.keys(overrides).length > 0) newUserObj.permissionOverrides = overrides;
            settings.usersData.users.push(newUserObj);
        }

        await settings.saveUsersConfig();
        settings.updateHeaderProjectSelector();
        settings.closeModalOverlay();
        settings.render();
        if (typeof updateHeaderUserSelector === 'function') updateHeaderUserSelector();
        if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
    },

    deleteUser: async (userId) => {
        const u = (settings.usersData?.users || []).find(x => x.id === userId || x.laspUser === userId || x.username === userId);
        if (u && (u.isSystem || u.username === 'admin' || u.username === 'user')) {
            settings.showToast(`El usuario "${u.username || u.laspUser}" es un usuario por defecto del sistema y no se puede borrar.`, "warn", 4);
            return;
        }

        settings.showConfirmModal({
            title: 'Eliminar Usuario',
            icon: '👤',
            message: `¿Estás seguro de que deseas eliminar al usuario <b>"${u?.username || userId}"</b>?`,
            confirmText: 'Eliminar Usuario',
            confirmColor: '#f44336',
            confirmTextColor: '#fff',
            onConfirm: async () => {
                if (settings.usersData && settings.usersData.users) {
                    settings.usersData.users = settings.usersData.users.filter(x => x.id !== userId && x.laspUser !== userId && x.username !== userId);
                    await settings.saveUsersConfig();
                    settings.render();
                    if (typeof updateHeaderUserSelector === 'function') updateHeaderUserSelector();
                    if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
                    settings.showToast(`Usuario "${u?.username || userId}" eliminado.`, "success", 3);
                }
            }
        });
    },

    openRoleModal: (roleId = null) => {
        const uData = settings.usersData || { users: [], roles: [] };
        const role = roleId ? (uData.roles || []).find(r => r.id === roleId) : null;
        const isEditing = !!role;
        const perms = role?.permissions || {};

        const overlay = document.createElement('div');
        overlay.id = 'pipeta-settings-modal-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(5,7,11,0.85); z-index:10000; display:flex; align-items:center; justify-content:center; transform:translateZ(0); will-change:opacity;';

        const permCheckbox = (key, label, icon) => `
            <label style="display:flex; align-items:center; gap:8px; background:#181d26; border:1px solid #28303d; border-radius:4px; padding:6px 10px; cursor:pointer; font-size:0.78rem;">
                <input type="checkbox" id="perm_${key}" ${perms[key] !== false && (isEditing ? perms[key] : true) ? 'checked' : ''} style="cursor:pointer; accent-color:var(--accent);">
                <span>${icon} ${label}</span>
            </label>
        `;

        overlay.innerHTML = `
            <div style="background:#14171e; border:1px solid #28303d; border-radius:8px; width:560px; max-width:92vw; padding:22px; box-shadow:0 10px 30px rgba(0,0,0,0.7); color:#eee; max-height:90vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #28303d; padding-bottom:12px; margin-bottom:16px;">
                    <b style="font-size:1.05rem; color:var(--accent);">${isEditing ? `✏️ Editar Rol: ${role.name}` : '🛡️ Nuevo Rol de Usuario'}</b>
                    <button class="icon-btn" onclick="settings.closeModalOverlay()" style="background:transparent; border:none; color:#888; font-size:1.2rem; cursor:pointer;">&times;</button>
                </div>

                <div style="display:flex; flex-direction:column; gap:12px; font-size:0.82rem;">
                    <div style="display:grid; grid-template-columns:1fr 2fr 1fr; gap:10px;">
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">ID del Rol *</label>
                            <input id="modal-r-id" type="text" value="${role?.id || ''}" ${isEditing ? 'disabled' : ''} placeholder="ej: lead" 
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; font-family:monospace; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px; font-weight:bold;">Nombre del Rol *</label>
                            <input id="modal-r-name" type="text" value="${role?.name || ''}" placeholder="ej: Lead Supervisor" 
                                   style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                        </div>
                        <div>
                            <label style="color:#aaa; display:block; margin-bottom:4px;">Color</label>
                            <input id="modal-r-color" type="color" value="${role?.color || '#00bcd4'}" 
                                   style="width:100%; height:32px; background:#1c222d; border:1px solid #2e3846; border-radius:4px; cursor:pointer; padding:2px;">
                        </div>
                    </div>

                    <div>
                        <label style="color:#aaa; display:block; margin-bottom:4px;">Descripción</label>
                        <input id="modal-r-desc" type="text" value="${role?.description || ''}" placeholder="Descripción breve de responsabilidades" 
                               style="width:100%; background:#1c222d; border:1px solid #2e3846; border-radius:4px; padding:6px 10px; color:#fff; outline:none;">
                    </div>

                    <!-- Permisos de Módulos & Vistas -->
                    <div style="margin-top:6px;">
                        <b style="color:var(--accent); font-size:0.8rem; display:block; margin-bottom:6px;">Acceso a Módulos Principales (Sidebar):</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('access_explorer', 'Explorer (Árbol de Proyecto y Media)', '📁')}
                            ${permCheckbox('access_shot_navigator', 'Shot Navigator (Workflow)', '🎬')}
                            ${permCheckbox('access_asset_designer', 'Asset Designer', '📦')}
                            ${permCheckbox('access_shot_designer', 'Shot Designer', '🛠️')}
                            ${permCheckbox('access_ia_ingest', 'IA Ingest', '🤖')}
                        </div>
                    </div>

                    <!-- Permisos de Tools -->
                    <div style="margin-top:6px;">
                        <b style="color:#4fc3f7; font-size:0.8rem; display:block; margin-bottom:6px;">Acceso a Herramientas (Pipeline Tools):</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('access_tool_naming_validator', 'Naming Validator', '🏷️')}
                            ${permCheckbox('access_tool_sync_analyze', 'Sync Analyzer (Local ↔ Online)', '🔄')}
                            ${permCheckbox('access_tool_file_auditor', 'File Auditor', '🔍')}
                            ${permCheckbox('access_tool_asset_creator', 'Asset Creator', '📦➕')}
                            ${permCheckbox('access_tool_shot_creator', 'Shot Creator', '🎬➕')}
                        </div>
                    </div>

                    <!-- Permisos de Workflow & Tracker -->
                    <div style="margin-top:6px;">
                        <b style="color:#8bc34a; font-size:0.8rem; display:block; margin-bottom:6px;">Workflow & Shot Navigator:</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('assignAllShots', 'Asignar a otros artistas', '👥')}
                            ${permCheckbox('workflow_edit_statuses', 'Cambiar estados de procesos', '🏷️')}
                            ${permCheckbox('workflow_create_folders', 'Crear carpetas en disco', '📁➕')}
                            ${permCheckbox('exportPackages', 'Exportar paquetes de tareas', '📦📤')}
                        </div>
                    </div>

                    <!-- Permisos de Explorer -->
                    <div style="margin-top:6px;">
                        <b style="color:#ffb74d; font-size:0.8rem; display:block; margin-bottom:6px;">Acciones en Explorer de Archivos:</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('explorer_create_folder', 'Crear carpetas', '📁')}
                            ${permCheckbox('explorer_delete_items', 'Eliminar archivos/carpetas', '🗑️')}
                            ${permCheckbox('explorer_rename_items', 'Renombrar archivos/carpetas', '✏️')}
                            ${permCheckbox('explorer_open_desktop', 'Abrir en Windows Explorer', '🖥️')}
                        </div>
                    </div>

                    <!-- Permisos de Admin -->
                    <div style="margin-top:6px;">
                        <b style="color:#e91e63; font-size:0.8rem; display:block; margin-bottom:6px;">Privilegios de Administración & Sistema:</b>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('manageUsers', 'Gestionar Usuarios & Roles', '👥')}
                            ${permCheckbox('manageSettings', 'Configuraciones Globales', '⚙️')}
                            ${permCheckbox('manageStatuses', 'Diseñador de Estados', '🏷️')}
                        </div>
                    </div>

                    <!-- CATEGORÍA 6: SEGURIDAD, PRESETS & RESTRICCIONES -->
                    <div style="margin-bottom:12px; background:#14171d; padding:10px; border-radius:6px; border:1px solid #232a35;">
                        <div style="font-weight:bold; color:#ab47bc; font-size:0.8rem; margin-bottom:8px; text-transform:uppercase;">
                            🔒 Seguridad, Presets & Restricciones
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                            ${permCheckbox('explorer_allow_drive', 'Acceso y Comparación con Drive', '☁️')}
                            ${permCheckbox('settings_allow_advanced', 'Configuraciones Avanzadas', '🛠️')}
                            ${permCheckbox('export_portable_zip', 'Empaquetar Versión Portable (.zip)', '📦')}
                            ${permCheckbox('presets_allow_publish', 'Publicar Presets del Estudio', '🚀')}
                            ${permCheckbox('projects_allow_edit', 'Editar / Crear Proyectos', '📁')}
                            ${permCheckbox('ia_ingest_allow_higgsfield', 'Funciones e Integración Higgsfield IA', '⚡')}
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid #28303d; padding-top:14px;">
                    <button class="btn" onclick="settings.closeModalOverlay()" style="background:#222; color:#ccc; border:1px solid #444; padding:6px 14px; border-radius:4px; cursor:pointer;">Cancelar</button>
                    <button class="btn" onclick="settings.saveRoleModal('${roleId || ''}')" style="background:#00bcd4; color:black; font-weight:bold; border:none; padding:6px 16px; border-radius:4px; cursor:pointer;">
                        ${isEditing ? 'Guardar Cambios' : 'Crear Rol'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    },

    saveRoleModal: async (existingId) => {
        const id = (existingId || document.getElementById('modal-r-id')?.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
        const name = document.getElementById('modal-r-name')?.value.trim();
        if (!id || !name) {
            alert("ID y Nombre del rol son obligatorios.");
            return;
        }

        const color = document.getElementById('modal-r-color')?.value || '#00bcd4';
        const description = document.getElementById('modal-r-desc')?.value.trim() || '';

        const permKeys = [
            'access_explorer', 'access_shot_navigator', 'access_asset_designer', 'access_shot_designer', 'access_ia_ingest',
            'access_tool_naming_validator', 'access_tool_sync_analyze', 'access_tool_file_auditor', 'access_tool_asset_creator', 'access_tool_shot_creator',
            'assignAllShots', 'workflow_edit_statuses', 'workflow_create_folders', 'exportPackages',
            'explorer_create_folder', 'explorer_delete_items', 'explorer_rename_items', 'explorer_open_desktop',
            'manageUsers', 'manageSettings', 'manageStatuses',
            'explorer_allow_drive', 'settings_allow_advanced', 'export_portable_zip', 'presets_allow_publish', 'projects_allow_edit', 'ia_ingest_allow_higgsfield'
        ];

        const permissions = {};
        permKeys.forEach(k => {
            const el = document.getElementById(`perm_${k}`);
            permissions[k] = el ? el.checked : true;
        });

        if (!settings.usersData) settings.usersData = { users: [], roles: [] };
        if (!settings.usersData.roles) settings.usersData.roles = [];

        if (existingId) {
            const r = settings.usersData.roles.find(x => x.id === existingId);
            if (r) {
                r.name = name;
                r.color = color;
                r.description = description;
                r.permissions = permissions;
            }
        } else {
            settings.usersData.roles.push({
                id,
                name,
                color,
                description,
                permissions,
                isSystem: false
            });
        }

        await settings.saveUsersConfig();
        settings.closeModalOverlay();
        settings.render();
        if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
    },

    deleteRole: async (roleId) => {
        const r = (settings.usersData?.roles || []).find(x => x.id === roleId);
        if (r && (r.isSystem || roleId === 'admin' || roleId === 'user')) {
            settings.showToast(`El rol "${r.name}" es un rol por defecto del sistema y no se puede borrar.`, "warn", 4);
            return;
        }

        settings.showConfirmModal({
            title: 'Eliminar Rol',
            icon: '🛡️',
            message: `¿Estás seguro de que deseas eliminar el rol <b>"${r?.name || roleId}"</b>?`,
            confirmText: 'Eliminar Rol',
            confirmColor: '#f44336',
            confirmTextColor: '#fff',
            onConfirm: async () => {
                if (settings.usersData && settings.usersData.roles) {
                    settings.usersData.roles = settings.usersData.roles.filter(x => x.id !== roleId);
                    await settings.saveUsersConfig();
                    settings.render();
                    if (typeof applyRolePermissionsToUI === 'function') applyRolePermissionsToUI();
                    settings.showToast(`Rol "${r?.name || roleId}" eliminado.`, "success", 3);
                }
            }
        });
    },

    changeAdminPasswordModal: async () => {
        const newPass = prompt("Ingresa la nueva contraseña de Administrador:");
        if (!newPass) return;
        if (newPass.length < 4) {
            settings.showToast("La contraseña debe tener al menos 4 caracteres.", "warn", 4);
            return;
        }

        try {
            await API.users.save({ ...settings.usersData, adminPassword: newPass });
            settings.showToast("Contraseña de Administrador actualizada con éxito.", "success", 4);
        } catch(e) {
            settings.showToast("Error al actualizar contraseña: " + e.message, "error", 5);
        }
    },

    loadStatusesConfig: async () => {
        try {
            settings.statusesData = await API.statuses.get();
        } catch(e) {
            console.error("Error loading statuses config:", e);
        }
    },

    saveStatusesConfig: async () => {
        try {
            await API.statuses.save(settings.statusesData);
        } catch(e) {
            console.error("Error saving statuses config:", e);
        }
    },

    addStatusModal: async () => {
        const name = prompt("Nombre del Estado (ej: En Review, Aprobado Técnico):");
        if (!name) return;

        const id = name.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const icon = prompt("Icono o Emoji distintivo (ej: 🟣, 🟢, 🚀, ⏳):", "🟣") || "🟣";
        const color = prompt("Color HEX (ej: #9c27b0, #4caf50):", "#9c27b0") || "#9c27b0";
        const scope = prompt("Ámbito (both, shots, assets):", "both") || "both";

        if (!settings.statusesData) settings.statusesData = { statuses: [] };
        if (!settings.statusesData.statuses) settings.statusesData.statuses = [];

        settings.statusesData.statuses.push({
            id,
            name: name.trim(),
            color: color.trim(),
            icon: icon.trim(),
            scope: scope.trim(),
            isDefault: false
        });

        await settings.saveStatusesConfig();
        settings.render();
        settings.showToast(`Estado "${name}" creado con éxito.`, "success", 3);
    },

    deleteStatus: async (statusId) => {
        settings.showConfirmModal({
            title: 'Eliminar Estado',
            icon: '🏷️',
            message: `¿Estás seguro de que deseas eliminar el estado <b>"${statusId}"</b>?`,
            confirmText: 'Eliminar Estado',
            confirmColor: '#f44336',
            confirmTextColor: '#fff',
            onConfirm: async () => {
                if (settings.statusesData && settings.statusesData.statuses) {
                    settings.statusesData.statuses = settings.statusesData.statuses.filter(s => s.id !== statusId);
                    await settings.saveStatusesConfig();
                    settings.render();
                    settings.showToast(`Estado "${statusId}" eliminado.`, "success", 3);
                }
            }
        });
    }
});

settings._categoryRenderers.users = function () {
                const uData = settings.usersData || { users: [], roles: [], activeUser: 'admin' };
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
                        <div>
                            <h3 style="margin:0;">👤 User Settings</h3>
                            <p style="margin:4px 0 0 0; color:#888; font-size:0.85rem;">Gestión de usuarios, credenciales, roles y permisos de acceso al pipeline.</p>
                        </div>
                        <div style="display:flex; gap:10px;">
                            <button class="btn" onclick="settings.openUserModal()" style="background:var(--accent); color:black; font-weight:bold; padding:6px 14px; border:none; border-radius:4px; cursor:pointer;">
                                + Agregar Usuario
                            </button>
                            <button class="btn" onclick="settings.openRoleModal()" style="background:#222; color:#00bcd4; border:1px solid #00bcd466; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.8rem;">
                                + Nuevo Rol
                            </button>
                            <button class="btn" onclick="settings.changeAdminPasswordModal()" style="background:#222; color:#ff9800; border:1px solid #ff980066; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.8rem;">
                                🔑 Cambiar Pass Admin
                            </button>
                        </div>
                    </div>

                    <!-- Usuario Activo Actual -->
                    <div style="background:rgba(255,152,0,0.08); border:1px solid rgba(255,152,0,0.3); border-radius:6px; padding:12px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="color:#aaa; font-size:0.8rem;">Usuario Activo en este Equipo: </span>
                            <b style="color:var(--accent); font-size:0.95rem;">${uData.activeUser || 'admin'}</b>
                        </div>
                        <select onchange="settings.setActiveUser(this.value)" style="background:#1c222d; color:#fff; border:1px solid #444; border-radius:4px; padding:4px 10px; font-size:0.85rem;">
                            ${(uData.users || []).map(u => `
                                <option value="${u.username || u.laspUser || u.id}" ${uData.activeUser === (u.username || u.laspUser || u.id) ? 'selected' : ''}>
                                    ${u.username || u.laspUser} ${u.firstName ? `(${u.firstName} ${u.lastName})` : ''}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Integración & Auto-Registro Ramón (TACTIC) -->
                    <div style="background:rgba(0,188,212,0.04); border:1px solid #00bcd433; border-radius:6px; padding:14px; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-size:1.1rem;">🌐</span>
                                <b style="color:#00bcd4; font-size:0.9rem;">Integración & Auto-Registro de Ramón (TACTIC)</b>
                            </div>
                            <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; color:#eee; font-size:0.8rem;">
                                    <input type="checkbox" ${uData.autoRegisterRamonUsers !== false ? 'checked' : ''} 
                                        onchange="settings.updateUsersConfigProp('autoRegisterRamonUsers', this.checked)"
                                        style="accent-color:#00bcd4; width:15px; height:15px;">
                                    <span>Auto-registrar usuarios al iniciar sesión</span>
                                </label>
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span style="color:#aaa; font-size:0.8rem;">Rol por defecto:</span>
                                    <select onchange="settings.updateUsersConfigProp('defaultRamonRole', this.value)" 
                                            style="background:#14171d; color:var(--accent); border:1px solid #444; border-radius:4px; padding:3px 8px; font-size:0.8rem;">
                                        ${(uData.roles || []).map(r => `
                                            <option value="${r.id}" ${(uData.defaultRamonRole || 'user') === r.id ? 'selected' : ''}>${r.name} (${r.id})</option>
                                        `).join('')}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <p style="color:#888; font-size:0.75rem; margin:0; line-height:1.4;">
                            Los artistas del estudio que inicien sesión con sus credenciales de red en este equipo se vincularán automáticamente con el rol por defecto seleccionado (<b>${(uData.roles || []).find(r => r.id === (uData.defaultRamonRole || 'user'))?.name || 'Artista'}</b>). Luego puedes cambiarles el rol a Cordinadora, Administrador u otro rol personalizado desde la tabla inferior con el botón ✏️.
                        </p>
                    </div>

                    <!-- Tabla de Usuarios -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:15px; margin-bottom:25px;">
                        <h4 style="margin:0 0 12px 0; color:#eee;">Listado de Usuarios (${(uData.users || []).length})</h4>
                        <table style="width:100%; border-collapse:collapse; font-size:0.82rem; text-align:left;">
                            <thead>
                                <tr style="border-bottom:1px solid #444; color:#888; font-size:0.75rem; text-transform:uppercase;">
                                    <th style="padding:8px;">Nombre de Usuario</th>
                                    <th style="padding:8px;">Origen</th>
                                    <th style="padding:8px;">Nombre</th>
                                    <th style="padding:8px;">Apellido</th>
                                    <th style="padding:8px;">Usuario LASP</th>
                                    <th style="padding:8px;">Rol</th>
                                    <th style="padding:8px;">Excepciones</th>
                                    <th style="padding:8px;">Email</th>
                                    <th style="padding:8px;">Notas</th>
                                    <th style="padding:8px; text-align:right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(uData.users || []).map(u => {
                                    const roleObj = (uData.roles || []).find(r => r.id === u.role) || { name: u.role || 'user', color: '#888' };
                                    const uName = u.username || (u.laspUser ? u.laspUser.replace('lasp-', '') : u.id);
                                    const isSystemAdmin = u.username === 'admin' || u.id === 'u_admin' || (u.isSystem && u.role === 'admin');
                                    const isRamon = !isSystemAdmin && (u.authSource === 'ramon' || (u.laspUser && u.laspUser.startsWith('lasp-')));
                                    return `
                                        <tr style="border-bottom:1px solid #222;">
                                            <td style="padding:10px 8px; display:flex; align-items:center; gap:8px;">
                                                <div style="width:10px; height:10px; border-radius:50%; background:${u.avatarColor || '#ff9800'};"></div>
                                                <b style="color:#fff; font-family:monospace;">${uName}</b>
                                                ${u.isSystem ? '<span style="font-size:0.65rem; background:#333; color:#aaa; padding:1px 4px; border-radius:3px;">default</span>' : ''}
                                            </td>
                                            <td style="padding:10px 8px;">
                                                ${isRamon ? `
                                                    <span style="background:rgba(0,188,212,0.15); color:#00bcd4; border:1px solid #00bcd455; padding:2px 7px; border-radius:4px; font-size:0.72rem; font-weight:bold; display:inline-flex; align-items:center; gap:4px;">
                                                        <span>🌐</span> Ramón
                                                    </span>
                                                ` : `
                                                    <span style="background:rgba(255,152,0,0.12); color:#ff9800; border:1px solid #ff980044; padding:2px 7px; border-radius:4px; font-size:0.72rem; font-weight:bold; display:inline-flex; align-items:center; gap:4px;">
                                                        <span>💻</span> Local
                                                    </span>
                                                `}
                                            </td>
                                            <td style="padding:10px 8px; color:#ccc;">${u.firstName || '—'}</td>
                                            <td style="padding:10px 8px; color:#ccc;">${u.lastName || '—'}</td>
                                            <td style="padding:10px 8px; font-family:monospace; color:var(--accent);">${u.laspUser || '—'}</td>
                                            <td style="padding:10px 8px;">
                                                <span style="background:${roleObj.color}22; color:${roleObj.color}; border:1px solid ${roleObj.color}44; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:bold;">
                                                    ${roleObj.name}
                                                </span>
                                            </td>
                                            <td style="padding:10px 8px;">
                                                ${(() => {
                                                    const ov = u.permissionOverrides || {};
                                                    const blk = Object.values(ov).filter(v => v === false).length;
                                                    const alw = Object.values(ov).filter(v => v === true).length;
                                                    if (blk > 0 && alw > 0) return `<span style="background:rgba(255,152,0,0.15); color:#ffb74d; border:1px solid #ff980044; padding:2px 6px; border-radius:4px; font-size:0.72rem; font-weight:bold;">🛡️ ${blk} blq / ${alw} perm</span>`;
                                                    if (blk > 0) return `<span style="background:rgba(244,67,54,0.15); color:#ef5350; border:1px solid #f4433644; padding:2px 6px; border-radius:4px; font-size:0.72rem; font-weight:bold;">🛡️ ${blk} bloqueo(s)</span>`;
                                                    if (alw > 0) return `<span style="background:rgba(76,175,80,0.15); color:#81c784; border:1px solid #4caf5044; padding:2px 6px; border-radius:4px; font-size:0.72rem; font-weight:bold;">✓ ${alw} permiso(s)</span>`;
                                                    return '<span style="color:#666; font-size:0.72rem;">Rol base</span>';
                                                })()}
                                            </td>
                                            <td style="padding:10px 8px; color:#888; font-size:0.78rem;">${u.email || '—'}</td>
                                            <td style="padding:10px 8px; color:#888; font-size:0.78rem;">${u.notes || '—'}</td>
                                            <td style="padding:10px 8px; text-align:right; white-space:nowrap;">
                                                <button onclick="settings.openUserModal('${u.id}')" class="icon-btn" style="background:transparent; border:none; color:#4fc3f7; cursor:pointer; margin-right:6px;" title="Editar Usuario">✏️</button>
                                                ${!u.isSystem ? `
                                                    <button onclick="settings.deleteUser('${u.id}')" class="icon-btn danger" style="background:transparent; border:none; color:#f44336; cursor:pointer;" title="Eliminar Usuario">🗑️</button>
                                                ` : ''}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Roles y Permisos Configurables -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <h4 style="margin:0; color:#eee;">Roles y Permisos Configurados (${(uData.roles || []).length})</h4>
                            <button class="btn" onclick="settings.openRoleModal()" style="background:#1c222d; color:#00bcd4; border:1px solid #00bcd466; padding:4px 10px; border-radius:4px; font-size:0.78rem; cursor:pointer;">
                                + Crear Nuevo Rol
                            </button>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:14px;">
                            ${(uData.roles || []).map(r => {
                                const permCats = [
                                    {
                                        title: '🎬 Módulos Principales (Sidebar)',
                                        color: 'var(--accent)',
                                        items: [
                                            { key: 'access_explorer', label: 'Explorer' },
                                            { key: 'access_shot_navigator', label: 'Shot Navigator' },
                                            { key: 'access_asset_designer', label: 'Asset Designer' },
                                            { key: 'access_shot_designer', label: 'Shot Designer' },
                                            { key: 'access_ia_ingest', label: 'IA Ingest' }
                                        ]
                                    },
                                    {
                                        title: '🛠️ Herramientas (Header Toolbar)',
                                        color: '#4fc3f7',
                                        items: [
                                            { key: 'access_tool_naming_validator', label: 'Naming Validator' },
                                            { key: 'access_tool_sync_analyze', label: 'Sync Analyzer' },
                                            { key: 'access_tool_file_auditor', label: 'File Auditor' },
                                            { key: 'access_tool_asset_creator', label: 'Asset Creator' },
                                            { key: 'access_tool_shot_creator', label: 'Shot Creator' }
                                        ]
                                    },
                                    {
                                        title: '🎯 Workflow & Shot Navigator',
                                        color: '#8bc34a',
                                        items: [
                                            { key: 'assignAllShots', label: 'Asignar a otros artistas' },
                                            { key: 'workflow_edit_statuses', label: 'Cambiar estados de procesos' },
                                            { key: 'workflow_create_folders', label: 'Crear carpetas en disco' },
                                            { key: 'exportPackages', label: 'Exportar paquetes de tareas' }
                                        ]
                                    },
                                    {
                                        title: '📁 Acciones en Explorer',
                                        color: '#ffb74d',
                                        items: [
                                            { key: 'explorer_create_folder', label: 'Crear nuevas carpetas' },
                                            { key: 'explorer_delete_items', label: 'Eliminar archivos/carpetas' },
                                            { key: 'explorer_rename_items', label: 'Renombrar archivos/carpetas' },
                                            { key: 'explorer_open_desktop', label: 'Abrir en Windows Explorer' }
                                        ]
                                    },
                                    {
                                        title: '⚙️ Administración & Sistema',
                                        color: '#e91e63',
                                        items: [
                                            { key: 'manageUsers', label: 'Gestionar Usuarios & Roles' },
                                            { key: 'manageSettings', label: 'Configuración Global' },
                                            { key: 'manageStatuses', label: 'Diseñador de Estados' }
                                        ]
                                    }
                                ];

                                return `
                                    <div style="background:#14171d; border:1px solid #28303d; border-radius:6px; padding:14px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 4px 12px rgba(0,0,0,0.2);">
                                        <div>
                                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom:1px solid #232a35; padding-bottom:8px;">
                                                <div style="display:flex; align-items:center; gap:8px;">
                                                    <div style="width:12px; height:12px; border-radius:3px; background:${r.color};"></div>
                                                    <b style="color:${r.color}; font-size:0.95rem;">${r.name}</b>
                                                    <span style="font-family:monospace; font-size:0.75rem; color:#666;">(${r.id})</span>
                                                </div>
                                                <div style="display:flex; align-items:center; gap:6px;">
                                                    <button onclick="settings.openRoleModal('${r.id}')" class="icon-btn" style="background:transparent; border:none; color:#4fc3f7; cursor:pointer; font-size:0.95rem;" title="Editar Permisos">✏️</button>
                                                    ${!r.isSystem ? `<button onclick="settings.deleteRole('${r.id}')" class="icon-btn" style="background:transparent; border:none; color:#f44336; cursor:pointer; font-size:0.95rem;" title="Eliminar Rol">🗑️</button>` : ''}
                                                </div>
                                            </div>
                                            <p style="font-size:0.78rem; color:#aaa; margin:0 0 12px 0;">${r.description || 'Sin descripción'}</p>
                                            
                                            <div style="display:flex; flex-direction:column; gap:10px; background:#0c0e12; padding:10px; border-radius:6px; border:1px solid #1a202c;">
                                                ${permCats.map(cat => `
                                                    <div>
                                                        <div style="font-size:0.72rem; font-weight:bold; color:${cat.color}; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">
                                                            ${cat.title}
                                                        </div>
                                                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:3px; font-size:0.72rem;">
                                                            ${cat.items.map(it => {
                                                                const isAllowed = r.permissions ? r.permissions[it.key] === true : false;
                                                                return `
                                                                    <div style="display:flex; align-items:center; gap:5px; color:${isAllowed ? '#ddd' : '#666'}; padding:2px 4px; border-radius:3px; background:${isAllowed ? 'rgba(255,255,255,0.02)' : 'transparent'};">
                                                                        <span>${isAllowed ? '✅' : '❌'}</span>
                                                                        <span style="${isAllowed ? '' : 'text-decoration:none; opacity:0.6;'}">${it.label}</span>
                                                                    </div>
                                                                `;
                                                            }).join('')}
                                                        </div>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
};

settings._categoryRenderers.statuses = function () {
    settings.localAccordionOpen = true;
    settings.currentCategory = 'avanzado';
    return settings._categoryRenderers.avanzado ? settings._categoryRenderers.avanzado() : '';
};

settings._categoryRenderers.workflow = settings._categoryRenderers.statuses;
