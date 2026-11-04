// --- SETTINGS SYNC MODULE (Environment Detection, UNC & Project Catalogs) ---
Object.assign(settings, {
    testUncConnection: async () => {
        const uncInput = document.getElementById('setting-central-server-unc');
        const userInput = document.getElementById('setting-central-server-user');
        const passInput = document.getElementById('setting-central-server-pass');

        const uncPath = (uncInput?.value || '\\\\192.168.206.116\\Z').trim();
        const user = (userInput?.value || '').trim();
        const pass = passInput?.value || '';

        settings.centralServerUnc = uncPath;
        settings.centralServerUser = user;
        settings.saveConfig();

        if (typeof settings.showToast === 'function') {
            settings.showToast(`Probando conexión con ${uncPath}...`, 'info', 6);
        }

        try {
            const res = await fetch('/api/server/connect-unc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uncPath, user, pass })
            }).then(r => r.json());

            if (res && res.success && res.accessible) {
                if (typeof settings.showToast === 'function') {
                    settings.showToast('✅ Conexión SMB Exitosa', 'success', 5, `Acceso validado a ${res.connectedTo}`);
                } else {
                    alert(`✅ Conexión SMB exitosa a: ${res.connectedTo}`);
                }
            } else if (res && res.success) {
                alert(`⚠️ Sesión establecida con ${res.connectedTo}, pero el recurso no responde lectura inmediata.`);
            } else {
                alert(`❌ Error conectando a ${uncPath}:\n${res?.error || 'No se pudo conectar'}`);
            }
        } catch (e) {
            alert(`❌ Error de red: ${e.message}`);
        }
    },

    loadSyncEnvironment: async (force = false) => {
        settings.isLoadingSyncEnv = true;
        try {
            const resEnv = await fetch('/api/sync/detect-env' + (force ? '?force=true' : ''));
            if (resEnv.ok) {
                settings.syncEnvData = await resEnv.json();
                window.pipetaSystemEnv = settings.syncEnvData;
                try { localStorage.setItem('pipeta_system_env', JSON.stringify(settings.syncEnvData)); } catch(e){}
            }
            const resCat = await fetch('/api/sync/catalogs');
            if (resCat.ok) {
                const dataCat = await resCat.json();
                settings.syncCatalogsData = dataCat.catalogs || [];
            }
            const resWorker = await fetch('/api/sync/worker-status');
            if (resWorker.ok) {
                const dataWorker = await resWorker.json();
                settings.syncWorkerStatus = dataWorker.status || null;
            }
        } catch(e) {
            console.error("Error loading sync environment:", e);
        } finally {
            settings.isLoadingSyncEnv = false;
            if (settings.currentCategory === 'sincronizacion') {
                settings.render();
            }
        }
    },

    reDetectSyncEnvironment: async () => {
        settings.isLoadingSyncEnv = true;
        settings.render();
        try {
            await settings.loadSyncEnvironment(true);
            if (typeof settings.showToast === 'function') {
                settings.showToast('Entorno re-detectado correctamente', 'success', 3);
            }
        } catch (e) {
            console.error('Error re-detecting sync environment:', e);
            if (typeof settings.showToast === 'function') {
                settings.showToast('Error re-detectando entorno', 'error', 3);
            }
        } finally {
            settings.isLoadingSyncEnv = false;
            settings.render();
        }
    },

    setLocationMode: async (mode) => {
        settings.isLoadingSyncEnv = true;
        settings.render();
        try {
            const res = await fetch('/api/sync/set-location-mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
            const data = await res.json();
            if (data.success && data.env) {
                settings.syncEnvData = data.env;
                window.pipetaSystemEnv = data.env;
                try { localStorage.setItem('pipeta_location_mode', mode); } catch(e){}
                const label = mode === 'studio' ? '🏢 ESTUDIO / SEDE' : (mode === 'home' ? '🏠 HOME OFFICE' : '🤖 AUTO-DETECTAR');
                if (typeof settings.showToast === 'function') {
                    settings.showToast(`Modo configurado: ${label}`, 'success', 3);
                }
            }
        } catch (e) {
            console.error('Error setting location mode:', e);
            if (typeof settings.showToast === 'function') {
                settings.showToast('Error al cambiar modo de ubicación', 'error', 3);
            }
        } finally {
            settings.isLoadingSyncEnv = false;
            settings.render();
        }
    },


    generateProjectCatalogNow: async (projectName) => {
        if (!projectName) return;
        if (settings.isGeneratingCatalog) {
            settings.showToast(`Ya se está escaneando el catálogo de "${projectName}". Por favor espera...`, 'warning', 4);
            return;
        }
        settings.isGeneratingCatalog = true;
        if (typeof PipetaConsole !== 'undefined') {
            PipetaConsole.log('sync', `Iniciando escaneo de Google Drive para '${projectName}' (~30s)...`, 'pending');
        }
        settings.showToast(`Escaneando Google Drive para "${projectName}"... Puede tardar unos 25-35s.`, 'info', 45, 'Indexando unidades compartidas');
        settings.render();

        try {
            const res = await fetch('/api/sync/catalog/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: projectName, mode: settings.syncMode || 'auto' })
            });
            const data = await res.json();
            if (data.success) {
                // Invalidar caché del frontend completamente para que se reflejen los cambios al instante
                window.pipetaSyncCatalog = null;
                if (typeof loadActiveProjectSyncCatalog === 'function') {
                    await loadActiveProjectSyncCatalog(true);
                }
                if (typeof refreshCurrentView === 'function') {
                    refreshCurrentView();
                }
                const count = data.stats?.totalFiles || data.summary?.totalFiles || 0;
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `✓ Catálogo de Google Drive para '${projectName}' indexado con éxito (${count} archivos)`, 'ok');
                }
                settings.showToast(`✅ Catálogo para "${projectName}" actualizado con éxito.`, 'success', 6, `${count} archivos indexados`);
                await settings.loadSyncEnvironment();
            } else {
                if (typeof PipetaConsole !== 'undefined') {
                    PipetaConsole.log('sync', `❌ Error indexando catálogo de '${projectName}': ${data.error}`, 'error');
                }
                settings.showToast(`❌ Error al indexar catálogo: ${data.error}`, 'error', 6);
            }
        } catch(e) {
            if (typeof PipetaConsole !== 'undefined') {
                PipetaConsole.log('sync', `❌ Fallo de conexión indexando catálogo: ${e.message}`, 'error');
            }
            settings.showToast(`❌ Error de conexión: ${e.message}`, 'error', 6);
        } finally {
            settings.isGeneratingCatalog = false;
            settings.render();
        }
    }
});

settings._categoryRenderers.sincronizacion = function () {
                const engine = settings.copyEngine || 'auto';
                const syncMode = settings.syncMode || 'auto';
                const isFakeZ = !!settings.isFakeZ;
                const env = settings.syncEnvData;
                const catalogs = settings.syncCatalogsData || [];
                const projects = settings.projects || [];
                const worker = settings.syncWorkerStatus;
                const locMode = env?.locationMode || localStorage.getItem('pipeta_location_mode') || 'auto';

                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:15px;">
                        <div>
                            <h3 style="margin:0; color:#fff; display:flex; align-items:center; gap:8px;">
                                <span>Sincronización & Entorno de Red</span>
                            </h3>
                            <p style="color:#888; margin:4px 0 0 0; font-size:0.85rem;">
                                Detección inteligente de conectividad, catálogos offline para puestos sin internet y sincronización con almacenamiento central.
                            </p>
                        </div>
                        <button class="btn" onclick="settings.reDetectSyncEnvironment()" style="background:#222; border:1px solid #444; color:#4fc3f7; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.82rem; display:flex; align-items:center; gap:6px;">
                            <span>🔄</span> <span>${settings.isLoadingSyncEnv ? 'Analizando...' : 'Re-detectar Entorno'}</span>
                        </button>
                    </div>

                    <!-- SELECTOR DE PERFIL / MODO DE UBICACIÓN (ESTUDIO vs HOME) -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #384252; border-radius:8px; padding:12px 16px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                        <div>
                            <div style="font-weight:bold; color:#fff; font-size:0.88rem; display:flex; align-items:center; gap:8px;">
                                <span>📍 PERFIL DE UBICACIÓN:</span>
                                <span style="color:${locMode === 'studio' ? '#4caf50' : (locMode === 'home' ? '#ff9800' : 'var(--accent)')}; font-weight:bold;">
                                    ${locMode === 'studio' ? '🏢 Estudio / Sede' : (locMode === 'home' ? '🏠 Home Office' : 'Detección Automática')}
                                </span>
                            </div>
                            <div style="font-size:0.75rem; color:#888; margin-top:3px;">
                                ${locMode === 'studio' 
                                    ? 'Modo Estudio/Sede forzado: transferencias a cargo de la red (no auto-inicia Worker local).' 
                                    : (locMode === 'home' 
                                        ? 'Modo Home Office forzado: auto-inicia el Worker Local para subidas y descargas de Drive.' 
                                        : 'Detección automática por presencia de red local del estudio central.')}
                            </div>
                        </div>
                        <div style="display:flex; gap:6px; background:#111; padding:4px; border-radius:6px; border:1px solid #282828;">
                            <button type="button" class="btn" onclick="settings.setLocationMode('studio')"
                                    style="padding:7px 15px; font-size:0.8rem; font-weight:bold; border-radius:4px; border:1px solid ${locMode === 'studio' ? '#4caf50' : 'transparent'}; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.15s;
                                    background:${locMode === 'studio' ? 'rgba(76,175,80,0.2)' : 'transparent'};
                                    color:${locMode === 'studio' ? '#81c784' : '#888'};">
                                <span>🏢</span> <span>ESTUDIO</span>
                            </button>
                            <button type="button" class="btn" onclick="settings.setLocationMode('home')"
                                    style="padding:7px 15px; font-size:0.8rem; font-weight:bold; border-radius:4px; border:1px solid ${locMode === 'home' ? '#ff9800' : 'transparent'}; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.15s;
                                    background:${locMode === 'home' ? 'rgba(255,152,0,0.2)' : 'transparent'};
                                    color:${locMode === 'home' ? '#ffb74d' : '#888'};">
                                <span>🏠</span> <span>HOME</span>
                            </button>
                            <button type="button" class="btn" onclick="settings.setLocationMode('auto')"
                                    style="padding:7px 12px; font-size:0.8rem; font-weight:bold; border-radius:4px; border:1px solid ${locMode === 'auto' ? '#4fc3f7' : 'transparent'}; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.15s;
                                    background:${locMode === 'auto' ? 'rgba(79,195,247,0.15)' : 'transparent'};
                                    color:${locMode === 'auto' ? '#4fc3f7' : '#888'};">
                                <span>🤖</span> <span>AUTO</span>
                            </button>
                        </div>
                    </div>

                    <!-- 1. DIAGNOSTICO EN TIEMPO REAL -->
                    <div style="background:rgba(255,255,255,0.02); border:1px solid #333; border-radius:8px; padding:15px; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); font-size:0.85rem; margin-bottom:10px; display:flex; justify-content:space-between;">
                            <span>ESTADO DEL ENTORNO LOCAL & CLOUD</span>
                            ${env ? `<span style="color:#888; font-weight:normal; font-size:0.75rem;">Recomendación: <b style="color:#4caf50;">${env.recommendedMode === 'online_gdrive' ? 'Google Drive G:' : (env.recommendedMode === 'online_rclone' ? 'Rclone Cloud' : 'Catálogo Offline')}</b></span>` : ''}
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">🌐 Acceso a Internet</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${env?.hasInternet ? '#4caf50' : (env ? '#f44336' : '#888')};">
                                    ${env?.hasInternet ? '● Online (Conectado)' : (env ? '● Offline (Aislado)' : 'Consultando...')}
                                </div>
                                <div style="font-size:0.7rem; color:#666; margin-top:2px;">
                                    ${env?.hasInternet ? 'Conexión verificada' : 'Guardado en este equipo (sin intentos web)'}
                                </div>
                            </div>
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">☁️ Google Drive Desktop (G:)</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${env?.hasDriveG ? '#4caf50' : '#888'};">
                                    ${env?.hasDriveG ? '● Detectado (G:/)' : '○ No Mapeado'}
                                </div>
                            </div>
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">🤖 Sync Worker Central</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${worker?.isAlive ? '#4caf50' : '#f44336'};">
                                    ${worker?.isAlive ? `● En Línea (${worker.hostname || 'VM 105'})` : '○ Desconectado'}
                                </div>
                                <div style="font-size:0.7rem; color:#666; margin-top:2px;">
                                    ${worker?.isAlive ? `Ping: hace ${worker.diffSeconds}s • ${worker.status}` : 'No detectado'}
                                </div>
                            </div>
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">💾 Disco Z: (Hardware)</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${env?.zInfo?.isRealServer ? '#4caf50' : '#ff9800'};">
                                    ${env?.zInfo?.isRealServer ? `● Servidor Real (${env.zInfo.target})` : (env?.zInfo?.type === 'subst' ? `● Virtual (${env.zInfo.target})` : (env?.zInfo ? `● Local (${env.zInfo.type})` : 'Consultando...'))}
                                </div>
                            </div>
                            <div style="background:#111; border:1px solid #282828; border-radius:6px; padding:10px;">
                                <div style="font-size:0.75rem; color:#888; margin-bottom:3px;">📍 Modo Operativo</div>
                                <div style="font-size:0.88rem; font-weight:bold; color:${env?.isExternalMachine ? '#ff9800' : '#4caf50'};">
                                    ${env?.isExternalMachine ? '● Home Office (Worker Local)' : '● Estudio / Sede (Red Central)'}
                                </div>
                                <div style="font-size:0.7rem; color:#666; margin-top:2px;">
                                    ${locMode !== 'auto' ? `Forzado manualmente (${locMode.toUpperCase()})` : (env?.isExternalMachine ? 'Detectado: conexión remota' : 'Detectado: red de estudio')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 2. CONEXION DIRECTA SMB / UNC (SIN LETRA DE UNIDAD) -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:8px; padding:15px; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); font-size:0.9rem; margin-bottom:4px;">🌐 Conexión al Servidor Central (SMB / UNC sin letra)</div>
                        <div style="font-size:0.8rem; color:#888; margin-bottom:12px;">Para máquinas donde Z: es un disco virtual local. Permite copiar archivos directamente desde el almacenamiento central sin necesidad de montar unidades adicionales.</div>
                        
                        <div style="display:grid; grid-template-columns: 1fr 180px 180px auto; gap:10px; align-items:flex-end;">
                            <div>
                                <label style="font-size:0.75rem; color:#aaa; display:block; margin-bottom:4px;">Ruta UNC del Servidor:</label>
                                <input type="text" id="setting-central-server-unc" class="input" value="${escapeHtml(settings.centralServerUnc || '\\\\192.168.206.116\\Z')}" 
                                       style="width:100%; background:#111; border:1px solid #333; color:#fff; padding:6px 8px; border-radius:4px; font-family:monospace; font-size:0.82rem;"
                                       onchange="settings.centralServerUnc=this.value.trim(); settings.saveConfig();">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#aaa; display:block; margin-bottom:4px;">Usuario (opcional):</label>
                                <input type="text" id="setting-central-server-user" class="input" value="${escapeHtml(settings.centralServerUser || '')}" placeholder="ej. lasp-artista"
                                       style="width:100%; background:#111; border:1px solid #333; color:#fff; padding:6px 8px; border-radius:4px; font-size:0.82rem;"
                                       onchange="settings.centralServerUser=this.value.trim(); settings.saveConfig();">
                            </div>
                            <div>
                                <label style="font-size:0.75rem; color:#aaa; display:block; margin-bottom:4px;">Contraseña:</label>
                                <input type="password" id="setting-central-server-pass" class="input" placeholder="••••••••"
                                       style="width:100%; background:#111; border:1px solid #333; color:#fff; padding:6px 8px; border-radius:4px; font-size:0.82rem;">
                            </div>
                            <button type="button" class="btn" onclick="settings.testUncConnection()" 
                                    style="background:#222; border:1px solid var(--accent); color:var(--accent); font-weight:bold; padding:6px 14px; border-radius:4px; cursor:pointer; font-size:0.8rem; height:33px; white-space:nowrap;">
                                🔌 Probar Conexión
                            </button>
                        </div>
                    </div>

                    <!-- 3. MOTOR DE TRANSFERENCIA EN BACKGROUND -->
                    <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:8px; padding:15px; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:10px; font-size:0.9rem;">Motor de Transferencia en Background</div>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            <label style="display:flex; gap:12px; cursor:pointer; padding:8px 10px; border-radius:4px; align-items:flex-start;">
                                <input type="radio" name="copyEngine" value="auto" ${engine === 'auto' ? 'checked' : ''} onchange="settings.updateGlobalProp('copyEngine', 'auto')" style="margin-top:3px;">
                                <div>
                                    <div style="font-weight:bold; color:#eee; font-size:0.85rem;">Automático (Recomendado)</div>
                                    <div style="font-size:0.8rem; color:#888; margin-top:2px;">Usa Rclone si está disponible para máxima velocidad; si no, copia nativa de Windows.</div>
                                </div>
                            </label>
                            <label style="display:flex; gap:12px; cursor:pointer; padding:8px 10px; border-radius:4px; align-items:flex-start;">
                                <input type="radio" name="copyEngine" value="rclone" ${engine === 'rclone' ? 'checked' : ''} onchange="settings.updateGlobalProp('copyEngine', 'rclone')" style="margin-top:3px;">
                                <div>
                                    <div style="font-weight:bold; color:#4fc3f7; font-size:0.85rem;">Forzar Rclone</div>
                                    <div style="font-size:0.8rem; color:#888; margin-top:2px;">Intenta usar siempre Rclone.</div>
                                </div>
                            </label>
                            <label style="display:flex; gap:12px; cursor:pointer; padding:8px 10px; border-radius:4px; align-items:flex-start;">
                                <input type="radio" name="copyEngine" value="native" ${engine === 'native' ? 'checked' : ''} onchange="settings.updateGlobalProp('copyEngine', 'native')" style="margin-top:3px;">
                                <div>
                                    <div style="font-weight:bold; color:#ff9800; font-size:0.85rem;">Forzar Copia Nativa (Windows)</div>
                                    <div style="font-size:0.8rem; color:#888; margin-top:2px;">Usa siempre el sistema de archivos de Windows.</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- 4. ENTORNO DE DISCO Z & OVERRIDE DE DESARROLLO (ABAJO DE TODO, SIN ICONOS) -->
                    ${(() => {
                        const currentOverride = window.zEnvOverride || 'auto';
                        const detectedLabel = typeof getZEnvStatusLabel === 'function' ? getZEnvStatusLabel() : 'Detectando...';
                        return `
                        <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:8px; padding:15px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <div>
                                    <div style="font-weight:bold; color:#fff; font-size:0.9rem; display:flex; align-items:center; gap:8px;">
                                        <span>Entorno de Disco Z: (Detección & Override)</span>
                                        <span style="font-size:0.75rem; background:#1c2430; color:#88c0d0; padding:2px 6px; border-radius:4px;">${detectedLabel}</span>
                                    </div>
                                    <div style="font-size:0.8rem; color:#888; margin-top:3px;">
                                        Pipeta detecta automáticamente si tu Z: es el servidor real de red o un disco local/vsubst. Puedes forzar un modo manualmente para desarrollo o pruebas.
                                    </div>
                                </div>
                            </div>

                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-top:12px;">
                                <label style="display:flex; gap:10px; cursor:pointer; padding:10px; border-radius:6px; border:1px solid ${currentOverride === 'auto' ? 'var(--accent)' : '#282828'}; background:${currentOverride === 'auto' ? 'rgba(255,255,255,0.05)' : '#111'};">
                                    <input type="radio" name="zEnvOverride" value="auto" ${currentOverride === 'auto' ? 'checked' : ''} 
                                           onchange="window.zEnvOverride='auto'; localStorage.setItem('pipeta_z_env_override', 'auto'); settings.render(); if (typeof updateHeaderTools==='function') updateHeaderTools('view-browser');" style="margin-top:2px;">
                                    <div>
                                        <div style="font-weight:bold; color:#eee; font-size:0.85rem;">Auto-detectar (Recomendado)</div>
                                        <div style="font-size:0.76rem; color:#888; margin-top:2px;">Usa comandos nativos de Windows para identificar red vs vsubst.</div>
                                    </div>
                                </label>
                                <label style="display:flex; gap:10px; cursor:pointer; padding:10px; border-radius:6px; border:1px solid ${currentOverride === 'force_real' ? '#4caf50' : '#282828'}; background:${currentOverride === 'force_real' ? 'rgba(76,175,80,0.1)' : '#111'};">
                                    <input type="radio" name="zEnvOverride" value="force_real" ${currentOverride === 'force_real' ? 'checked' : ''} 
                                           onchange="window.zEnvOverride='force_real'; localStorage.setItem('pipeta_z_env_override', 'force_real'); settings.render(); if (typeof updateHeaderTools==='function') updateHeaderTools('view-browser');" style="margin-top:2px;">
                                    <div>
                                        <div style="font-weight:bold; color:#4caf50; font-size:0.85rem;">Forzar: Z es Servidor Real</div>
                                        <div style="font-size:0.76rem; color:#888; margin-top:2px;">Trata a Z: como almacenamiento central del estudio.</div>
                                    </div>
                                </label>
                                <label style="display:flex; gap:10px; cursor:pointer; padding:10px; border-radius:6px; border:1px solid ${currentOverride === 'force_fake' ? '#ff9800' : '#282828'}; background:${currentOverride === 'force_fake' ? 'rgba(255,152,0,0.1)' : '#111'};">
                                    <input type="radio" name="zEnvOverride" value="force_fake" ${currentOverride === 'force_fake' ? 'checked' : ''} 
                                           onchange="window.zEnvOverride='force_fake'; localStorage.setItem('pipeta_z_env_override', 'force_fake'); settings.render(); if (typeof updateHeaderTools==='function') updateHeaderTools('view-browser');" style="margin-top:2px;">
                                    <div>
                                        <div style="font-weight:bold; color:#ff9800; font-size:0.85rem;">Forzar: Z es Falso / Scratch Local</div>
                                        <div style="font-size:0.76rem; color:#888; margin-top:2px;">Habilita vista SERVER para consultar el catálogo del Servidor Central.</div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        `;
                    })()}
                `;
};
