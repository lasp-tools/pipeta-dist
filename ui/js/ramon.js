// ==========================================================================
// PIPETA - RAMON (TACTIC) CLIENT & AUTHENTICATION CONTROLLER
// Manejo de Doble Login (Dominio/Ramon vs Local) y Panel "Mis Tareas"
// ==========================================================================

const Ramon = {
    session: null,
    tasks: [],
    projects: [],
    lastFetchedAt: null,
    isFetchingTasks: false,
    currentProjectFilter: 'ALL',
    currentProcessFilter: 'ALL',
    currentStatusFilter: 'ALL',

    // --- TELEMETRIA DE USUARIO ACTIVO ---
    notifyTelemetryActiveUser: () => {
        try {
            const u = Ramon.session?.user;
            const mode = Ramon.session?.mode || 'local';
            const userLogin = mode === 'ramon' ? (u?.login || u?.username || '') : (u?.username || u?.laspUser || u?.login || '');
            fetch('/api/telemetry/active-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: userLogin })
            }).catch(() => {});
        } catch (e) {}
    },

    // --- INICIALIZACION ---
    init: async () => {
        console.log("[RAMON] Inicializando controlador de autenticación...");
        Ramon.createModalsInDOM();

        // 1. Verificar si existe sesión recordada
        let savedSession = null;
        try {
            const raw = localStorage.getItem('pipeta_session');
            if (raw) savedSession = JSON.parse(raw);
        } catch (e) {
            console.warn("[RAMON] Error leyendo sesión guardada:", e);
        }

        if (savedSession && savedSession.user) {
            console.log(`[RAMON] Sesión recordada encontrada (${savedSession.mode}):`, savedSession.user.login || savedSession.user.username);
            Ramon.session = savedSession;
            Ramon.applySessionToHeader();
            Ramon.notifyTelemetryActiveUser();

            // Restaurar tareas cacheadas desde sessionStorage si existen
            try {
                const uLogin = savedSession.user.login || savedSession.user.username;
                if (uLogin) {
                    const cacheRaw = sessionStorage.getItem(`pipeta_ramon_tasks_${uLogin.toLowerCase()}`);
                    if (cacheRaw) {
                        const parsed = JSON.parse(cacheRaw);
                        if (Array.isArray(parsed.tasks)) {
                            Ramon.tasks = parsed.tasks;
                            Ramon.lastFetchedAt = parsed.timestamp ? new Date(parsed.timestamp) : null;
                            console.log(`[RAMON] ${Ramon.tasks.length} tareas restauradas desde caché local.`);
                        }
                    }
                }
            } catch (ce) {
                console.warn("[RAMON] Error leyendo tareas de caché local:", ce);
            }
            
            // Si es sesión de Ramón, verificar estado y precargar tareas en segundo plano
            if (savedSession.mode === 'ramon') {
                API.ramon.status().then(st => {
                    const badge = document.getElementById('ramonStatusDot');
                    if (badge) {
                        badge.style.background = st.success ? '#4caf50' : '#f44336';
                        badge.title = st.success ? `Conectado a Ramón (${st.host})` : `Sin conexión con Ramón: ${st.error}`;
                    }
                }).catch(() => {});

                // Precargar tareas asignadas de Ramón en segundo plano al iniciar Pipeta
                setTimeout(() => {
                    if (typeof Ramon.fetchTasks === 'function') {
                        Ramon.fetchTasks(null, false).catch(() => {});
                    }
                }, 300);
            }
        } else {
            console.log("[RAMON] No hay sesión activa. Mostrando pantalla de Login.");
            Ramon.showLoginModal();
        }
    },

    // --- APLICAR SESION A LA CABECERA ---
    applySessionToHeader: () => {
        const u = Ramon.session?.user;
        let mode = Ramon.session?.mode || 'local';
        const activeLogin = u?.login || u?.laspUser || u?.username || 'admin';
        const isSystemAdmin = activeLogin === 'admin' || u?.id === 'u_admin' || u?.isSystem;
        if (isSystemAdmin) {
            mode = 'local';
        }
        const fullName = !isSystemAdmin ? (u?.display_name || (u?.firstName ? `${u.firstName} ${u.lastName}`.trim() : '')) : '';

        // Formato claro: nombre de usuario de red / local + aclaración del sistema
        const sessionLabel = mode === 'ramon'
            ? `${activeLogin} [Ramón]`
            : `${activeLogin} [Local]`;

        // 1. Avatar: indicador circular limpio (sin texto RM adentro)
        const avatar = document.getElementById('headerUserAvatar');
        if (avatar) {
            avatar.innerHTML = '';
            avatar.style.width = '8px';
            avatar.style.height = '8px';
            avatar.style.borderRadius = '50%';
            avatar.style.background = mode === 'ramon' ? '#00bcd4' : '#ff9800';
            avatar.style.boxShadow = mode === 'ramon' ? '0 0 6px rgba(0, 188, 212, 0.7)' : 'none';
            avatar.title = `Sesión activa: ${activeLogin}${fullName ? ` (${fullName})` : ''} - Modo ${mode === 'ramon' ? 'Ramón (Dominio)' : 'Local'}\nClick para cambiar de usuario o cerrar sesión`;
            avatar.style.cursor = 'pointer';
            avatar.onclick = Ramon.toggleUserMenu;
        }

        // 2. Selector nativo: asegurar que la opción activa muestre el usuario y [Ramón]
        const select = document.getElementById('headerUserSelect');
        if (select) {
            let opt = Array.from(select.options).find(o => 
                o.value === activeLogin || 
                o.value === u?.username || 
                o.value === u?.laspUser
            );
            if (!opt) {
                const newOpt = document.createElement('option');
                newOpt.value = activeLogin;
                newOpt.textContent = sessionLabel;
                select.appendChild(newOpt);
                select.value = activeLogin;
            } else {
                opt.value = activeLogin;
                opt.textContent = sessionLabel;
                select.value = activeLogin;
            }
        }

        // Refrescar permisos globales
        if (typeof applyRolePermissionsToUI === 'function') {
            applyRolePermissionsToUI();
        }
        if (typeof updateHeaderTools === 'function') {
            updateHeaderTools();
        }
        if (typeof ShotNavigator !== 'undefined') {
            ShotNavigator.activeUser = activeLogin;
            if (typeof ShotNavigator.loadDependencies === 'function') {
                ShotNavigator.loadDependencies(true).then(() => {
                    if (ShotNavigator.isRamonMode() && typeof ShotNavigator.loadWorkflow === 'function') {
                        ShotNavigator.loadWorkflow(true).then(() => ShotNavigator.render());
                    } else if (typeof ShotNavigator.render === 'function') {
                        ShotNavigator.render();
                    }
                });
            } else if (typeof ShotNavigator.render === 'function') {
                ShotNavigator.render();
            }
        }
    },

    // --- MENÚ DESPLEGABLE DE USUARIO (Cabecera) ---
    toggleUserMenu: (e) => {
        if (e) e.stopPropagation();
        let menu = document.getElementById('ramonUserDropdownMenu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'ramonUserDropdownMenu';
            menu.className = 'ramon-user-dropdown';
            document.body.appendChild(menu);

            // Cerrar al hacer clic fuera
            document.addEventListener('click', (ev) => {
                if (!menu.contains(ev.target)) menu.style.display = 'none';
            });
        }

        if (menu.style.display === 'block') {
            menu.style.display = 'none';
            return;
        }

        const u = Ramon.session?.user;
        let mode = Ramon.session?.mode || 'local';
        const activeLogin = u?.login || u?.username || 'admin';
        const isSystemAdmin = activeLogin === 'admin' || u?.id === 'u_admin' || u?.isSystem;
        if (isSystemAdmin) {
            mode = 'local';
        }
        const displayName = isSystemAdmin ? 'admin' : (u?.display_name || activeLogin);

        const rect = document.getElementById('headerUserAvatar').getBoundingClientRect();
        menu.style.top = `${rect.bottom + 8}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;

        menu.innerHTML = `
            <div class="ramon-user-menu-header">
                <div style="font-weight:bold; color:#fff; font-size:0.9rem;">${displayName}</div>
                <div style="font-size:0.75rem; color:#888; display:flex; align-items:center; gap:6px; margin-top:3px;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${mode === 'ramon' ? '#00bcd4' : '#ff9800'};"></span>
                    <span>Modo: <b>${mode === 'ramon' ? 'Ramón (Dominio)' : 'Local'}</b></span>
                </div>
            </div>
            <div class="ramon-user-menu-body">
                <button class="ramon-menu-item" onclick="Ramon.showLoginModal('ramon'); document.getElementById('ramonUserDropdownMenu').style.display='none';">
                    <span>🌐</span> Iniciar Sesión con Ramón
                </button>
                ${mode === 'ramon' ? `
                    <button class="ramon-menu-item" onclick="Ramon.openMyTasksModal(); document.getElementById('ramonUserDropdownMenu').style.display='none';">
                        <span><img src="icons/ramon.png" style="width:16px; height:16px; object-fit:contain; vertical-align:middle; margin-right:6px;"></span> Mis Tareas en Ramón
                    </button>
                ` : ''}
                <button class="ramon-menu-item" onclick="Ramon.showLoginModal('local'); document.getElementById('ramonUserDropdownMenu').style.display='none';">
                    <span>💻</span> Conectar Usuario Local
                </button>
                <button class="ramon-menu-item danger" onclick="Ramon.logout(); document.getElementById('ramonUserDropdownMenu').style.display='none';">
                    <span>🚪</span> Cerrar Sesión
                </button>
            </div>
        `;
        menu.style.display = 'block';
    },

    // --- MODAL DE LOGIN (UI) ---
    showLoginModal: async (defaultTab = 'ramon') => {
        const modal = document.getElementById('ramonLoginModal');
        if (!modal) return;

        // Cargar usuarios locales en el selector secundario
        const localSelect = document.getElementById('ramonLocalUserSelect');
        if (localSelect) {
            try {
                const uData = await API.users.get();
                localSelect.innerHTML = (uData.users || []).map(u => {
                    const val = u.username || u.laspUser || u.id;
                    const label = u.firstName ? `${val} (${u.firstName} ${u.lastName})` : val;
                    return `<option value="${val}">${label}</option>`;
                }).join('');
            } catch (e) {
                console.warn("Error cargando usuarios locales:", e);
            }
        }

        // Limpiar inputs
        const userInp = document.getElementById('ramonUsernameInput');
        const passInp = document.getElementById('ramonPasswordInput');
        const errDiv = document.getElementById('ramonLoginError');
        if (userInp) {
            if (defaultTab === 'ramon' && (!userInp.value || userInp.value === 'admin')) {
                userInp.value = (Ramon.session?.user?.login && Ramon.session.user.login !== 'admin') ? Ramon.session.user.login : '';
            }
        }
        if (passInp) passInp.value = '';
        if (errDiv) errDiv.style.display = 'none';

        Ramon.switchLoginTab(defaultTab);
        modal.style.display = 'flex';
        setTimeout(() => {
            if (defaultTab === 'ramon' && userInp) userInp.focus();
        }, 100);
    },

    hideLoginModal: () => {
        const modal = document.getElementById('ramonLoginModal');
        if (modal) modal.style.display = 'none';
    },

    switchLoginTab: (tabName) => {
        const tabRamon = document.getElementById('loginTabRamon');
        const tabLocal = document.getElementById('loginTabLocal');
        const formRamon = document.getElementById('loginFormRamon');
        const formLocal = document.getElementById('loginFormLocal');

        if (tabName === 'ramon') {
            tabRamon.classList.add('active');
            tabLocal.classList.remove('active');
            formRamon.style.display = 'block';
            formLocal.style.display = 'none';
        } else {
            tabLocal.classList.add('active');
            tabRamon.classList.remove('active');
            formLocal.style.display = 'block';
            formRamon.style.display = 'none';
        }
    },

    // --- ACCIÓN: LOGIN RAMON ---
    submitRamonLogin: async () => {
        const userInp = document.getElementById('ramonUsernameInput');
        const passInp = document.getElementById('ramonPasswordInput');
        const remChk = document.getElementById('ramonRememberCheck');
        const btn = document.getElementById('ramonSubmitBtn');
        const errDiv = document.getElementById('ramonLoginError');

        const username = userInp?.value?.trim();
        const password = passInp?.value;

        if (!username || !password) {
            errDiv.textContent = "Por favor, ingresa tu usuario y contraseña de red.";
            errDiv.style.display = 'block';
            return;
        }

        errDiv.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = `<span>⏳ Verificando con Ramón...</span>`;

        try {
            const res = await API.ramon.login(username, password);
            if (res.success && res.user) {
                Ramon.session = {
                    mode: 'ramon',
                    user: res.user,
                    server: res.server || null,
                    timestamp: new Date().toISOString()
                };

                if (remChk && remChk.checked) {
                    localStorage.setItem('pipeta_session', JSON.stringify(Ramon.session));
                } else {
                    localStorage.removeItem('pipeta_session');
                }

                Ramon.hideLoginModal();
                Ramon.applySessionToHeader();
                Ramon.notifyTelemetryActiveUser();

                // Si el login fue contra Ramón remoto (WAN / puerto 8075), re-detectar entorno para ajustar UI de inmediato
                if (res.server && (res.server.includes('8075') || res.server.includes('https://') || res.server.includes('ramon.lasp.co'))) {
                    if (typeof detectSystemEnvironment === 'function') {
                        detectSystemEnvironment(true);
                    }
                    // Comprobar si el worker local está activo; si no, sugerir encenderlo con un toast informativo
                    fetch('/api/sync/worker/local-status').then(r => r.json()).then(ws => {
                        if (ws && ws.success && !ws.isRunning) {
                            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                                settings.showToast(
                                    '🌐 Equipo Remoto: Puedes iniciar el Worker Local desde la cola de transferencias (⚡) para procesar subidas y descargas con Rclone en segundo plano.',
                                    'info',
                                    8
                                );
                            }
                        }
                    }).catch(() => {});
                }

                // Notificar en consola y UI
                console.log(`[RAMON] Bienvenido, ${res.user.display_name} (Servidor: ${res.server || 'default'})`);
            } else {
                errDiv.textContent = res.error || "No se pudo autenticar contra Ramón.";
                errDiv.style.display = 'block';
            }
        } catch (err) {
            errDiv.textContent = "Error de conexión: " + err.message;
            errDiv.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<span>🚀 Iniciar Sesión con Ramón</span>`;
        }
    },

    // --- ACCIÓN: LOGIN LOCAL ---
    submitLocalLogin: async () => {
        const select = document.getElementById('ramonLocalUserSelect');
        const remChk = document.getElementById('ramonLocalRememberCheck');
        const selectedVal = select?.value || 'user';

        try {
            await API.users.setActive(selectedVal);
            const uData = await API.users.get();
            const uObj = (uData.users || []).find(u => (u.username || u.laspUser || u.id) === selectedVal);

            Ramon.session = {
                mode: 'local',
                user: {
                    login: selectedVal,
                    username: selectedVal,
                    display_name: uObj?.firstName ? `${uObj.firstName} ${uObj.lastName}` : selectedVal,
                    role: uObj?.role || 'user'
                },
                timestamp: new Date().toISOString()
            };

            if (remChk && remChk.checked) {
                localStorage.setItem('pipeta_session', JSON.stringify(Ramon.session));
            } else {
                localStorage.removeItem('pipeta_session');
            }

            Ramon.hideLoginModal();
            Ramon.applySessionToHeader();
            Ramon.notifyTelemetryActiveUser();
        } catch (e) {
            alert("Error al activar usuario local: " + e.message);
        }
    },

    // --- LOGOUT ---
    logout: () => {
        try { localStorage.removeItem('pipeta_session'); } catch(e){}
        Ramon.session = null;
        Ramon.notifyTelemetryActiveUser();
        Ramon.showLoginModal();
    },

    // --- PANEL "MIS TAREAS" (RAMON) ---
    openMyTasksModal: async () => {
        const modal = document.getElementById('ramonTasksModal');
        if (!modal) return;
        modal.style.display = 'flex';

        const userLogin = Ramon.session?.user?.login;
        if (!userLogin) {
            document.getElementById('ramonTasksListContainer').innerHTML = `
                <div style="text-align:center; padding:30px; color:#888;">
                    Debes estar logueado con tu cuenta de Ramón para ver tus tareas asignadas.
                </div>
            `;
            return;
        }

        // Si no tenemos tareas en memoria, intentar leer de sessionStorage
        if (!Ramon.tasks || Ramon.tasks.length === 0) {
            try {
                const cacheRaw = sessionStorage.getItem(`pipeta_ramon_tasks_${userLogin.toLowerCase()}`);
                if (cacheRaw) {
                    const parsed = JSON.parse(cacheRaw);
                    if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
                        Ramon.tasks = parsed.tasks;
                        Ramon.lastFetchedAt = parsed.timestamp ? new Date(parsed.timestamp) : null;
                    }
                }
            } catch(e) {}
        }

        // Si YA tenemos tareas cacheadas, renderizar de inmediato (0 ms de espera)
        if (Ramon.tasks && Ramon.tasks.length > 0) {
            Ramon.updateProjectSelectOptions();
            Ramon.renderTasksList();
            Ramon.updateCacheInfoLabel();
            return;
        }

        // Si no hay ninguna tarea en caché, realizar la primera consulta (no forzada)
        await Ramon.refreshMyTasks(false);
    },

    hideMyTasksModal: () => {
        const modal = document.getElementById('ramonTasksModal');
        if (modal) modal.style.display = 'none';
    },

    updateCacheInfoLabel: () => {
        const info = document.getElementById('ramonCacheInfo');
        if (!info) return;
        if (Ramon.lastFetchedAt) {
            const timeStr = Ramon.lastFetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            info.textContent = `Caché: ${timeStr}`;
            info.title = `Última sincronización con Ramón: ${Ramon.lastFetchedAt.toLocaleString()}`;
        } else {
            info.textContent = `Caché activo`;
        }
    },

    updateProjectSelectOptions: () => {
        const projSelect = document.getElementById('ramonTaskProjectFilter');
        if (!projSelect) return;
        const currentVal = projSelect.value;
        const distinctProjects = Array.from(new Set(Ramon.tasks.map(t => t.project))).filter(Boolean);
        projSelect.innerHTML = `<option value="ALL">Todos los Proyectos (${distinctProjects.length})</option>` +
            distinctProjects.map(p => `<option value="${p}" ${p === currentVal ? 'selected' : ''}>${p}</option>`).join('');
    },

    fetchTasks: async (projectFilter = null, force = false) => {
        const userLogin = Ramon.session?.user?.login;
        if (!userLogin) return Ramon.tasks || [];
        if (Ramon.isFetchingTasks) return Ramon.tasks || [];

        Ramon.isFetchingTasks = true;
        const container = document.getElementById('ramonTasksListContainer');
        const refreshBtn = document.getElementById('ramonRefreshBtn') || document.querySelector('.ramon-refresh-btn');
        const cacheInfo = document.getElementById('ramonCacheInfo');

        // Feedback visual si existe el botón de refresh en pantalla
        if (refreshBtn) {
            refreshBtn.style.transition = 'transform 0.8s linear';
            refreshBtn.style.transform = 'rotate(360deg)';
            refreshBtn.disabled = true;
        }

        const hasExisting = Ramon.tasks && Ramon.tasks.length > 0;
        if (container) {
            if (hasExisting) {
                if (cacheInfo) cacheInfo.textContent = `🔄 Consultando Ramón...`;
            } else {
                container.innerHTML = `
                    <div style="text-align:center; padding:40px; color:#aaa;">
                        <div style="font-size:1.8rem; margin-bottom:10px;">⏳</div>
                        <div>Consultando tareas en vivo desde Ramón...</div>
                    </div>
                `;
            }
        }

        try {
            console.log(`[RAMON] Consultando tareas para '${userLogin}' (proyecto: ${projectFilter || 'TODOS'}, force: ${force})...`);
            const targetProj = (projectFilter && projectFilter !== 'ALL') ? projectFilter : null;
            const res = await API.ramon.getTasks(userLogin, targetProj, force);
            
            if (!res.success) {
                console.warn("[RAMON] Error obteniendo tareas:", res.error);
                if (container) {
                    if (!hasExisting) {
                        container.innerHTML = `
                            <div style="padding:20px; color:#ff5252; background:rgba(255,82,82,0.1); border-radius:6px;">
                                ❌ Error al obtener tareas: ${res.error}
                            </div>
                        `;
                    } else if (cacheInfo) {
                        cacheInfo.textContent = `⚠️ Error al actualizar`;
                    }
                }
                return Ramon.tasks || [];
            }

            // Si consultamos un proyecto específico, actualizamos/combinamos con los otros proyectos
            if (targetProj) {
                const otherTasks = (Ramon.tasks || []).filter(t => (t.project || '').toLowerCase() !== targetProj.toLowerCase());
                Ramon.tasks = [...otherTasks, ...(res.tasks || [])];
            } else {
                Ramon.tasks = res.tasks || [];
            }

            Ramon.lastFetchedAt = new Date();

            // Guardar en sessionStorage para persistencia instantánea
            try {
                sessionStorage.setItem(`pipeta_ramon_tasks_${userLogin.toLowerCase()}`, JSON.stringify({
                    timestamp: Ramon.lastFetchedAt.toISOString(),
                    tasks: Ramon.tasks
                }));
            } catch(se){}

            // Si el modal está visible en pantalla, actualizarlo
            if (container) {
                Ramon.updateProjectSelectOptions();
                Ramon.renderTasksList();
                Ramon.updateCacheInfoLabel();
            }

            console.log(`[RAMON] Tareas obtenidas con éxito: ${Ramon.tasks.length} tareas totales en memoria.`);
            return Ramon.tasks;

        } catch (e) {
            console.error("[RAMON] Error consultando tareas:", e);
            if (container && !hasExisting) {
                container.innerHTML = `
                    <div style="padding:20px; color:#ff5252; background:rgba(255,82,82,0.1); border-radius:6px;">
                        ❌ Error de conexión: ${e.message}
                    </div>
                `;
            } else if (cacheInfo) {
                cacheInfo.textContent = `⚠️ Error de red`;
            }
            return Ramon.tasks || [];
        } finally {
            Ramon.isFetchingTasks = false;
            if (refreshBtn) {
                setTimeout(() => {
                    refreshBtn.style.transition = 'none';
                    refreshBtn.style.transform = 'rotate(0deg)';
                    refreshBtn.disabled = false;
                }, 600);
            }
        }
    },

    refreshMyTasks: async (force = false) => {
        const projectFilter = document.getElementById('ramonTaskProjectFilter')?.value || 'ALL';
        return await Ramon.fetchTasks(projectFilter, force);
    },

    // Invalida el caché en UI y Backend (para que otras tools o acciones puedan forzar actualización)
    invalidateTasksCache: async () => {
        const userLogin = Ramon.session?.user?.login;
        if (userLogin) {
            try { sessionStorage.removeItem(`pipeta_ramon_tasks_${userLogin.toLowerCase()}`); } catch(e){}
            try { await API.ramon.invalidateTasksCache(userLogin); } catch(e){}
        }
        Ramon.tasks = [];
        Ramon.lastFetchedAt = null;
        console.log("[RAMON] Caché de tareas invalidado.");
    },

    renderTasksList: () => {
        const container = document.getElementById('ramonTasksListContainer');
        if (!container) return;

        const projFilter = document.getElementById('ramonTaskProjectFilter')?.value || 'ALL';
        const procFilter = document.getElementById('ramonTaskProcessFilter')?.value || 'ALL';
        const statFilter = document.getElementById('ramonTaskStatusFilter')?.value || 'ALL';

        let filtered = Ramon.tasks;
        if (projFilter !== 'ALL') filtered = filtered.filter(t => t.project === projFilter);
        if (procFilter !== 'ALL') filtered = filtered.filter(t => (t.process || '').toLowerCase() === procFilter.toLowerCase());
        if (statFilter !== 'ALL') filtered = filtered.filter(t => (t.status || '').toLowerCase() === statFilter.toLowerCase());

        document.getElementById('ramonTasksCountBadge').textContent = `${filtered.length} tarea${filtered.length === 1 ? '' : 's'}`;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px; color:#888;">
                    <div style="font-size:2rem; margin-bottom:8px;">🎉</div>
                    <div style="font-size:1rem; font-weight:bold; color:#bbb;">No hay tareas pendientes</div>
                    <div style="font-size:0.85rem; margin-top:4px;">No tienes tareas asignadas con los filtros seleccionados.</div>
                </div>
            `;
            return;
        }

        // Colores para estados
        const getStatusColor = (st) => {
            const s = (st || '').toUpperCase();
            if (s.includes('APROBADO') || s.includes('COMPLETE')) return '#4caf50';
            if (s.includes('PROCESO') || s.includes('IN PROGRESS')) return '#ff9800';
            if (s.includes('CHECK') || s.includes('REVIEW')) return '#2196f3';
            if (s.includes('REVISAR') || s.includes('AJUSTAR')) return '#e91e63';
            if (s.includes('ASIGNADO') || s.includes('ASIGNAR')) return '#9c27b0';
            return '#777';
        };

        container.innerHTML = filtered.map(t => {
            const stColor = getStatusColor(t.status);
            const isShot = t.item_type === 'Plano';
            const icon = isShot ? '🎬' : (t.item_type === 'Asset' ? '📦' : '📌');

            return `
                <div class="ramon-task-card" onclick="Ramon.jumpToTaskInPipeta('${t.project}', '${t.name || t.search_code}')">
                    <div class="ramon-task-card-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:1.1rem;">${icon}</span>
                            <div>
                                <span class="ramon-task-shot-name">${t.name || t.search_code}</span>
                                ${t.name && t.name !== t.search_code ? `<span class="ramon-task-shot-code">(${t.search_code})</span>` : ''}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="ramon-task-proj-badge">${t.project}</span>
                            <span class="ramon-task-status-badge" style="background:${stColor}22; color:${stColor}; border:1px solid ${stColor}88;">
                                ${t.status || 'PENDIENTE'}
                            </span>
                        </div>
                    </div>

                    <div class="ramon-task-card-body">
                        <div class="ramon-task-meta-grid">
                            <div><span style="color:#777;">Proceso:</span> <b>${t.process || 'N/A'}</b></div>
                            ${(t.frame_in !== null && t.frame_out !== null && (Number(t.frame_in) > 0 || Number(t.frame_out) > 0)) ? `<div><span style="color:#777;">Frames:</span> ${t.frame_in} - ${t.frame_out}</div>` : ''}
                            ${t.bid_duration ? `<div><span style="color:#777;">Duración:</span> ${t.bid_duration}h</div>` : ''}
                            ${t.supervisor ? `<div><span style="color:#777;">Supervisor:</span> ${t.supervisor}</div>` : ''}
                        </div>
                        ${t.description ? `<div class="ramon-task-desc">${t.description}</div>` : ''}
                    </div>

                    <div class="ramon-task-card-footer">
                        <span style="color:#888; font-size:0.75rem;">Asignado a: <b>${t.assigned || Ramon.session?.user?.login}</b></span>
                        <button class="ramon-jump-btn" title="Navegar a este plano en Pipeta">
                            <span>🔍 Abrir en Pipeta</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },

    // --- ACCIÓN: SALTAR DIRECTAMENTE AL PLANO EN PIPETA ---
    jumpToTaskInPipeta: async (projectCode, shotName) => {
        console.log(`[RAMON] Saltando al plano ${shotName} del proyecto ${projectCode}...`);
        Ramon.hideMyTasksModal();

        // 1. Intentar seleccionar el proyecto en el selector global si coincide
        let projectChanged = false;
        const projSelect = document.getElementById('headerProjectSelect');
        if (projSelect && projectCode) {
            const pCodeLower = projectCode.toLowerCase();
            let matchingOption = Array.from(projSelect.options).find(o => {
                const optVal = (o.value || '').toLowerCase();
                const optText = (o.text || '').toLowerCase();
                return optVal === pCodeLower || optText === pCodeLower || 
                       optVal.includes(pCodeLower) || optText.includes(pCodeLower);
            });

            if (matchingOption) {
                if (projSelect.value !== matchingOption.value) {
                    projSelect.value = matchingOption.value;
                    if (typeof settings !== 'undefined' && settings.selectHeaderProject) {
                        await settings.selectHeaderProject(matchingOption.value);
                        projectChanged = true;
                    }
                }
            } else {
                console.warn(`[RAMON] El proyecto '${projectCode}' no coincide directamente con los proyectos configurados en Pipeta.`);
            }
        }

        // 2. Cambiar a la vista correcta de Shot Navigator ('view-shot-navigator')
        if (typeof switchView === 'function') {
            switchView('view-shot-navigator');
        }

        // 3. Filtrar y enfocar en ShotNavigator
        setTimeout(async () => {
            if (typeof ShotNavigator !== 'undefined') {
                if (!ShotNavigator.initialized) {
                    await ShotNavigator.init();
                }

                // Restablecer filtros restrictivos para asegurar visibilidad del plano
                ShotNavigator.selectedEpisode = 'ALL';
                ShotNavigator.selectedScene = 'ALL';
                ShotNavigator.selectedStatus = 'ALL';
                ShotNavigator.selectedProcess = 'ALL';
                ShotNavigator.onlyMyShots = false;

                // Aplicar término de búsqueda
                const searchTarget = shotName || '';
                ShotNavigator.searchQuery = searchTarget.toLowerCase().trim();

                // Actualizar input de búsqueda en el DOM
                const searchInputs = document.querySelectorAll('input[placeholder*="Buscar plano"]');
                searchInputs.forEach(inp => { inp.value = searchTarget; });

                // Buscar el plano en el trackerData para seleccionarlo y expandirlo
                const allShots = Object.values(ShotNavigator.trackerData?.shots || {});
                const foundShot = allShots.find(s => 
                    (s.name && s.name.toLowerCase() === searchTarget.toLowerCase()) ||
                    (s.id && s.id.toLowerCase() === searchTarget.toLowerCase())
                );

                if (foundShot) {
                    ShotNavigator.expandedShotKeys.add(foundShot.id);
                    ShotNavigator.selectedShotKeys.clear();
                    ShotNavigator.selectedShotKeys.add(foundShot.id);
                }

                ShotNavigator.render();

                // Hacer scroll suave hacia el plano en la tabla
                if (foundShot) {
                    setTimeout(() => {
                        const row = document.querySelector(`[data-shot-key="${foundShot.id}"]`) || 
                                    document.querySelector(`[data-shot-id="${foundShot.id}"]`) ||
                                    document.getElementById(`shot-row-${foundShot.id}`);
                        if (row) {
                            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            row.style.boxShadow = '0 0 12px #00bcd4';
                            setTimeout(() => { row.style.boxShadow = 'none'; }, 2500);
                        }
                    }, 250);
                }
            }
        }, projectChanged ? 500 : 200);
    },

    // --- CREACIÓN DE MODALES EN EL DOM (Si no existen) ---
    createModalsInDOM: () => {
        if (document.getElementById('ramonLoginModal')) return;

        const container = document.createElement('div');
        container.innerHTML = `
            <!-- MODAL DE LOGIN (RAMON VS LOCAL) -->
            <div id="ramonLoginModal" class="ramon-modal-overlay">
                <div class="ramon-modal-dialog">
                    <div class="ramon-modal-header">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="logo.png" alt="Pipeta" style="width:28px; height:28px;">
                            <span style="font-weight:bold; font-size:1.1rem; color:#fff;">Iniciar Sesión en Pipeta</span>
                        </div>
                    </div>

                    <!-- TABS DE SELECCION -->
                    <div class="ramon-login-tabs">
                        <button id="loginTabRamon" class="ramon-tab-btn active" onclick="Ramon.switchLoginTab('ramon')">
                            <span>🌐 Ramón (Dominio LASP)</span>
                        </button>
                        <button id="loginTabLocal" class="ramon-tab-btn" onclick="Ramon.switchLoginTab('local')">
                            <span>💻 Modo Local (Offline)</span>
                        </button>
                    </div>

                    <div class="ramon-modal-body">
                        <!-- FORMULARIO RAMON -->
                        <div id="loginFormRamon">
                            <div style="color:#aaa; font-size:0.85rem; margin-bottom:15px; line-height:1.4;">
                                Ingresa con tu usuario y contraseña de red del estudio para sincronizar tus proyectos y tareas asignadas.
                            </div>

                            <div class="ramon-field-group">
                                <label>Usuario de Dominio:</label>
                                <input type="text" id="ramonUsernameInput" placeholder="ej. lasp-mpastorino" autocomplete="username"
                                    onkeydown="if(event.key==='Enter') document.getElementById('ramonPasswordInput').focus();">
                            </div>

                            <div class="ramon-field-group">
                                <label>Contraseña:</label>
                                <input type="password" id="ramonPasswordInput" placeholder="••••••••" autocomplete="current-password"
                                    onkeydown="if(event.key==='Enter') Ramon.submitRamonLogin();">
                            </div>

                            <div style="margin:12px 0; display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="ramonRememberCheck" checked style="cursor:pointer;">
                                <label for="ramonRememberCheck" style="color:#ccc; font-size:0.85rem; cursor:pointer;">
                                    Recordar sesión en este puesto de trabajo
                                </label>
                            </div>

                            <div id="ramonLoginError" class="ramon-login-error" style="display:none;"></div>

                            <button id="ramonSubmitBtn" class="ramon-btn-primary" onclick="Ramon.submitRamonLogin()">
                                <span>🚀 Iniciar Sesión con Ramón</span>
                            </button>
                        </div>

                        <!-- FORMULARIO LOCAL -->
                        <div id="loginFormLocal" style="display:none;">
                            <div style="color:#aaa; font-size:0.85rem; margin-bottom:15px; line-height:1.4;">
                                Modo para estaciones aisladas sin acceso a Ramón o tareas locales independientes.
                            </div>

                            <div class="ramon-field-group">
                                <label>Seleccionar Usuario Local:</label>
                                <select id="ramonLocalUserSelect"></select>
                            </div>

                            <div style="margin:12px 0; display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="ramonLocalRememberCheck" checked style="cursor:pointer;">
                                <label for="ramonLocalRememberCheck" style="color:#ccc; font-size:0.85rem; cursor:pointer;">
                                    Recordar usuario local
                                </label>
                            </div>

                            <button class="ramon-btn-secondary" onclick="Ramon.submitLocalLogin()">
                                <span>Entrar en Modo Local</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODAL "MIS TAREAS" (RAMON) -->
            <div id="ramonTasksModal" class="ramon-modal-overlay">
                <div class="ramon-modal-dialog" style="width:780px; max-width:96vw; height:85vh; display:flex; flex-direction:column;">
                    <div class="ramon-modal-header">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="icons/ramon.png" style="width:24px; height:24px; object-fit:contain;">
                            <div>
                                <span style="font-weight:bold; font-size:1.05rem; color:#fff;">Mis Tareas en Ramón</span>
                                <span id="ramonTasksCountBadge" style="margin-left:8px; font-size:0.75rem; background:var(--accent); color:#000; font-weight:bold; padding:2px 8px; border-radius:12px;">0 tareas</span>
                            </div>
                        </div>
                        <button class="ramon-modal-close" onclick="Ramon.hideMyTasksModal()">✕</button>
                    </div>

                    <!-- BARRA DE FILTROS -->
                    <div class="ramon-tasks-filters-bar">
                        <div style="display:flex; align-items:center; gap:8px; flex:1;">
                            <select id="ramonTaskProjectFilter" onchange="Ramon.renderTasksList()" style="flex:1;">
                                <option value="ALL">Todos los Proyectos</option>
                            </select>
                            <select id="ramonTaskProcessFilter" onchange="Ramon.renderTasksList()">
                                <option value="ALL">Todos los Procesos</option>
                                <option value="Chroma">Chroma</option>
                                <option value="Compo">Compo</option>
                                <option value="MoGra">MoGra</option>
                                <option value="Matte">Matte</option>
                                <option value="Clean">Clean</option>
                                <option value="Tracking">Tracking</option>
                                <option value="Roto">Roto</option>
                                <option value="3D">3D</option>
                                <option value="assets">Assets</option>
                            </select>
                            <select id="ramonTaskStatusFilter" onchange="Ramon.renderTasksList()">
                                <option value="ALL">Todos los Estados</option>
                                <option value="PENDIENTE">PENDIENTE</option>
                                <option value="PROCESO">PROCESO</option>
                                <option value="ASIGNADO">ASIGNADO</option>
                                <option value="TECH CHECK">TECH CHECK</option>
                                <option value="INT APROBADO">INT APROBADO</option>
                                <option value="SUPERVISAR">SUPERVISAR</option>
                            </select>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span id="ramonCacheInfo" style="font-size:0.75rem; color:#888; white-space:nowrap;" title="Hora de la última consulta con Ramón"></span>
                            <button id="ramonRefreshBtn" class="ramon-refresh-btn" onclick="Ramon.refreshMyTasks(true)" title="Forzar actualización desde Ramón (en vivo)">
                                🔄
                            </button>
                        </div>
                    </div>

                    <!-- LISTA DE TAREAS -->
                    <div id="ramonTasksListContainer" class="ramon-tasks-list-scroll"></div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
    }
};

// Listeners para que otras herramientas de Pipeta puedan pedir refresco de tareas o invalidar caché
window.addEventListener('pipeta:ramon:refresh', () => {
    if (typeof Ramon !== 'undefined' && Ramon.refreshMyTasks) {
        Ramon.refreshMyTasks(true);
    }
});
window.addEventListener('pipeta:ramon:invalidate', () => {
    if (typeof Ramon !== 'undefined' && Ramon.invalidateTasksCache) {
        Ramon.invalidateTasksCache();
    }
});

window.Ramon = Ramon;
