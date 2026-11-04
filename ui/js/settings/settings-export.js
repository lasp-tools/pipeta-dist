// --- SETTINGS EXPORT, UPDATES, DIAGNOSTICS & GENERAL TABS MODULE ---
Object.assign(settings, {
    createDesktopShortcut: async () => {
        const btn = document.getElementById('createShortcutBtn');
        const statusMsg = document.getElementById('updateStatusMsg');

        if (btn) btn.innerHTML = '<span>⏳ Creando...</span>';

        try {
            const res = await fetch('/api/app/create-desktop-shortcut', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data && data.success) {
                if (statusMsg) statusMsg.innerHTML = '<span style="color:#4caf50; font-weight:bold;">✅ Acceso directo creado en tu Escritorio con el icono de Pipeta.</span>';
                alert("¡Acceso directo creado con éxito en tu Escritorio!");
            } else {
                throw new Error(data ? data.error : 'Error al crear acceso directo');
            }
        } catch(e) {
            console.error("Create shortcut error:", e);
            if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">❌ Error: ${e.message}</span>`;
            alert("Error al crear acceso directo: " + e.message);
        } finally {
            if (btn) btn.innerHTML = '<span>📌 Crear Acceso Directo</span>';
        }
    },

    openPackageTargetDir: async () => {
        const input = document.getElementById('pkgTargetDir');
        const current = (input ? input.value : settings.pkgTargetDir || 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS').trim();
        try {
            await API.fs.openFolder(current.replace(/\\/g, '/'));
        } catch(e) {
            console.error("Open package dir error:", e);
        }
    },

    showPipetaUpdateModal: function() {
        const existing = document.getElementById('pipeta-update-modal');
        if (existing) existing.remove();

        const backdrop = document.createElement('div');
        backdrop.id = 'pipeta-update-modal';
        backdrop.className = 'pipeta-update-modal-backdrop';
        backdrop.innerHTML = `
            <div class="pipeta-update-card">
                <div class="pipeta-update-title">
                    <span style="font-size:1.3rem;">🚀</span> Actualizando Pipeta
                </div>
                <div class="pipeta-update-desc" id="pipeta-update-subtext">
                    Sincronizando la última versión oficial con tu equipo...
                </div>
                <div class="pipeta-progress-bar-wrap">
                    <div class="pipeta-progress-bar animated-stripes" id="pipeta-update-bar" style="width: 15%;"></div>
                </div>
                <div class="pipeta-update-steps" id="pipeta-update-steps">
                    <div class="pipeta-update-step-item active" id="pstep-1">
                        <span class="pstep-icon">🔍</span>
                        <span>1. Conectando con origen de actualización oficial...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="pstep-2">
                        <span class="pstep-icon">📦</span>
                        <span>2. Sincronizando archivos y scripts del sistema...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="pstep-3">
                        <span class="pstep-icon">🛡️</span>
                        <span>3. Preservando configuraciones locales y credenciales...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="pstep-4">
                        <span class="pstep-icon">🔄</span>
                        <span>4. Reiniciando servidor local y recargando aplicación...</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        return {
            setStep(num, percent, subtext) {
                const bar = document.getElementById('pipeta-update-bar');
                if (bar) bar.style.width = `${percent}%`;
                const sub = document.getElementById('pipeta-update-subtext');
                if (sub && subtext) sub.textContent = subtext;
                for (let i = 1; i <= 4; i++) {
                    const el = document.getElementById(`pstep-${i}`);
                    if (!el) continue;
                    const icon = el.querySelector('.pstep-icon');
                    if (i < num) {
                        el.className = 'pipeta-update-step-item done';
                        if (icon) icon.textContent = '✅';
                    } else if (i === num) {
                        el.className = 'pipeta-update-step-item active';
                        if (icon) {
                            if (i === 1) icon.textContent = '🔍';
                            if (i === 2) icon.textContent = '📦';
                            if (i === 3) icon.textContent = '🛡️';
                            if (i === 4) icon.textContent = '🔄';
                        }
                    } else {
                        el.className = 'pipeta-update-step-item';
                        if (icon) icon.textContent = '○';
                    }
                }
            },
            error(err) {
                const bar = document.getElementById('pipeta-update-bar');
                if (bar) {
                    bar.style.background = '#f44336';
                    bar.classList.remove('animated-stripes');
                }
                const sub = document.getElementById('pipeta-update-subtext');
                if (sub) sub.innerHTML = `<span style="color:#f44336; font-weight:bold;">❌ Error: ${err}</span>`;
                const closeBtn = document.createElement('button');
                closeBtn.style.cssText = "margin-top:16px; padding:7px 18px; background:#2c323b; color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold;";
                closeBtn.textContent = "Cerrar";
                closeBtn.onclick = () => backdrop.remove();
                backdrop.querySelector('.pipeta-update-card').appendChild(closeBtn);
            }
        };
    },

    executeUpdateFromServer: async () => {
        const btn = document.getElementById('updateFromNetBtn');
        const statusMsg = document.getElementById('updateStatusMsg');

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>⏳ Actualizando...</span>';
            btn.style.opacity = '0.7';
        }
        if (statusMsg) {
            statusMsg.innerHTML = '<span style="color:var(--accent);">⏳ Buscando repositorio maestro y sincronizando...</span>';
        }

        const isExternalEnv = (typeof window.isExternalMachine === 'function' && window.isExternalMachine()) ||
                             !!(window.pipetaSystemEnv?.isExternalMachine || settings.envState?.isExternalMachine);
        const modal = settings.showPipetaUpdateModal();
        modal.setStep(1, 20, isExternalEnv ? 'Conectando con servidor de actualizaciones en la nube...' : 'Localizando repositorio maestro del estudio...');

        const step2Timer = setTimeout(() => {
            modal.setStep(2, 45, isExternalEnv ? 'Descargando actualizaciones e hidratando dependencias...' : 'Sincronizando archivos del sistema mediante robocopy...');
        }, 900);

        try {
            const res = await fetch('/api/app/update-from-server', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            clearTimeout(step2Timer);
            const data = await res.json();
            if (data && data.success) {
                modal.setStep(3, 80, 'Configuraciones locales y credenciales preservadas.');
                if (statusMsg) {
                    statusMsg.innerHTML = '<span style="color:#4caf50; font-weight:bold;">✅ ¡Actualización completada! Reiniciando Pipeta...</span>';
                }

                setTimeout(() => {
                    modal.setStep(4, 95, 'Reiniciando servidor local de Pipeta... Reconectando en segundos.');
                    let attempts = 0;
                    const checkInterval = setInterval(async () => {
                        attempts++;
                        try {
                            const hRes = await fetch('/api/health');
                            if (hRes.ok) {
                                clearInterval(checkInterval);
                                modal.setStep(4, 100, '¡Servidor activo! Recargando aplicación...');
                                setTimeout(() => window.location.reload(), 600);
                            }
                        } catch(e) {
                            if (attempts > 20) {
                                clearInterval(checkInterval);
                                window.location.reload();
                            }
                        }
                    }, 1000);
                }, 700);
            } else {
                throw new Error(data ? data.error : 'Error desconocido');
            }
        } catch(e) {
            clearTimeout(step2Timer);
            console.error("Auto-update error:", e);
            modal.error(e.message);
            if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">❌ Error al actualizar: ${e.message}</span>`;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>🚀 ACTUALIZAR PIPETA</span>';
                btn.style.opacity = '1';
            }
        }
    },

    openErrorLogFile: async () => {
        try {
            await fetch('/api/logs/open-errors-file', { method: 'POST' });
        } catch(e) {
            console.error("Open error log file error:", e);
        }
    },

    openReportsFolder: async () => {
        try {
            await fetch('/api/logs/open-reports-folder', { method: 'POST' });
        } catch(e) {
            console.error("Open reports folder error:", e);
        }
    },

    generateDiagnosticReport: async () => {
        if (typeof PipetaConsole !== 'undefined' && typeof PipetaConsole.generateReport === 'function') {
            await PipetaConsole.generateReport();
        } else {
            const curProj = settings.currentProject ? (settings.currentProject.name || settings.currentProject.id) : 'Desconocido';
            const locMode = settings.syncEnvData?.locationMode || 'auto';
            const zInfo = (typeof getZEnvStatusLabel === 'function') ? getZEnvStatusLabel() : 'Desconocido';
            try {
                const res = await fetch('/api/logs/generate-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: curProj, locationMode: locMode, zInfo: zInfo })
                }).then(r => r.json());
                if (res && res.success) {
                    if (navigator.clipboard && res.content) {
                        await navigator.clipboard.writeText(res.content);
                    }
                    if (typeof settings.showToast === 'function') {
                        settings.showToast('📦 Reporte generado en logs/reports/ y copiado al portapapeles', 'success', 4);
                    } else {
                        alert('✅ Reporte generado con éxito en logs/reports/ y copiado al portapapeles.');
                    }
                }
            } catch(e) {
                alert('Error al generar reporte: ' + e.message);
            }
        }
    },

    openLogsDirectory: async () => {
        const logsDir = settings.logsPath || (((typeof window !== 'undefined' && window.PIPETA_LOCAL_APP_DIR) ? window.PIPETA_LOCAL_APP_DIR.replace(/\\/g, '/') : 'C:/TOOLS/APPS/Pipeta') + '/logs');
        try {
            await fetch('/api/fs/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: logsDir })
            });
        } catch(e) {
            console.error("Open logs dir error:", e);
        }
    },

    openLatestLogFile: async () => {
        const logsDir = (settings.logsPath || (((typeof window !== 'undefined' && window.PIPETA_LOCAL_APP_DIR) ? window.PIPETA_LOCAL_APP_DIR : 'C:/TOOLS/APPS/Pipeta') + '/logs')).replace(/\\/g, '/').replace(/\/+$/, '');
        const today = new Date().toISOString().split('T')[0];
        const logFile = `${logsDir}/pipeta_${today}.jsonl`;
        try {
            await fetch('/api/fs/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: logFile })
            });
        } catch(e) {
            console.error("Open log file error:", e);
        }
    },

    setDefaultExportPath: () => {
        const defaultPath = (typeof window !== 'undefined' && window.IS_BETA_CHANNEL) ? 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta_Beta\\presets' : 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets';
        const input = document.getElementById('expTargetPath');
        if (input) input.value = defaultPath;
        settings.exportPresetsPath = defaultPath;
        const msg = document.getElementById('expStatusMsg');
        if (msg) msg.innerHTML = '<span style="color:#aaa;">Ruta restablecida a la ubicación por defecto de Z:</span>';
    },

    browseExportPath: async () => {
        const input = document.getElementById('expTargetPath');
        const fallbackExport = (typeof window !== 'undefined' && window.IS_BETA_CHANNEL) ? 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta_Beta\\presets' : 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets';
        const current = (input ? input.value : settings.exportPresetsPath || fallbackExport).trim();
        const btn = document.getElementById('expBrowseBtn');
        if (btn) btn.innerHTML = '<span>⏳ Abriendo...</span>';
        try {
            const res = await fetch('/api/system/pickFolder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initialPath: current })
            });
            const data = await res.json();
            if (data && data.success && data.path) {
                if (input) input.value = data.path;
                settings.exportPresetsPath = data.path;
            }
        } catch(e) {
            console.error("Browse error:", e);
        } finally {
            if (btn) btn.innerHTML = '<span>📁 Examinar...</span>';
        }
    },

    setDefaultPackageDir: () => {
        const defaultPath = 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS';
        const input = document.getElementById('pkgTargetDir');
        if (input) input.value = defaultPath;
        settings.pkgTargetDir = defaultPath;
        const msg = document.getElementById('pkgStatusMsg');
        if (msg) msg.innerHTML = '<span style="color:#aaa;">Ruta de salida restablecida a Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS</span>';
    },

    browsePackageDir: async () => {
        const input = document.getElementById('pkgTargetDir');
        const current = (input ? input.value : settings.pkgTargetDir || 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS').trim();
        const btn = document.getElementById('pkgBrowseBtn');
        if (btn) btn.innerHTML = '<span>⏳ Abriendo...</span>';
        try {
            const res = await fetch('/api/system/pickFolder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initialPath: current })
            });
            const data = await res.json();
            if (data && data.success && data.path) {
                if (input) input.value = data.path;
                settings.pkgTargetDir = data.path;
            }
        } catch(e) {
            console.error("Browse pkg error:", e);
        } finally {
            if (btn) btn.innerHTML = '<span>📁 Examinar...</span>';
        }
    },

    showZipPackagingModal: function(zipName) {
        const existing = document.getElementById('pipeta-zip-modal');
        if (existing) existing.remove();

        const backdrop = document.createElement('div');
        backdrop.id = 'pipeta-zip-modal';
        backdrop.className = 'pipeta-update-modal-backdrop';
        backdrop.innerHTML = `
            <div class="pipeta-update-card" style="width: 520px;">
                <div class="pipeta-update-title">
                    <span style="font-size:1.3rem;">📦</span> Empaquetando Versión Portable (.zip)
                </div>
                <div class="pipeta-update-desc" id="zip-package-subtext">
                    Generando <code>${zipName}</code> autocontenido...
                </div>
                <div class="pipeta-progress-bar-wrap">
                    <div class="pipeta-progress-bar animated-stripes" id="zip-package-bar" style="width: 15%;"></div>
                </div>
                <div class="pipeta-update-steps" id="zip-package-steps">
                    <div class="pipeta-update-step-item active" id="zstep-1">
                        <span class="pstep-icon">📂</span>
                        <span>1. Preparando base de código, runtime y presets locales...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="zstep-2">
                        <span class="pstep-icon">🗜️</span>
                        <span>2. Comprimiendo archivos y dependencias en .ZIP...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="zstep-3">
                        <span class="pstep-icon">📜</span>
                        <span>3. Generando script de instalación automática (.bat)...</span>
                    </div>
                    <div class="pipeta-update-step-item" id="zstep-4">
                        <span class="pstep-icon">🎉</span>
                        <span>4. Finalizando paquete y verificando integridad...</span>
                    </div>
                </div>
                <div id="zip-package-result" style="display:none; margin-top:16px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.08);">
                    <div id="zip-package-summary" style="font-size:0.85rem; color:#a3be8c; margin-bottom:12px; font-weight:bold; line-height:1.4;"></div>
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button id="btnZipOpenFolder" class="btn" style="background:#222; color:#00bcd4; border:1px solid #00bcd488; border-radius:4px; padding:6px 14px; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; gap:6px;">
                            <span>📂 Abrir Carpeta</span>
                        </button>
                        <button id="btnZipClose" class="btn" style="background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:6px 16px; font-size:0.85rem; cursor:pointer;">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        return {
            setStep(num, percent, subtext) {
                const bar = document.getElementById('zip-package-bar');
                if (bar) bar.style.width = `${percent}%`;
                const sub = document.getElementById('zip-package-subtext');
                if (sub && subtext) sub.innerHTML = subtext;
                for (let i = 1; i <= 4; i++) {
                    const el = document.getElementById(`zstep-${i}`);
                    if (!el) continue;
                    const icon = el.querySelector('.pstep-icon');
                    if (i < num) {
                        el.className = 'pipeta-update-step-item done';
                        if (icon) icon.textContent = '✅';
                    } else if (i === num) {
                        el.className = 'pipeta-update-step-item active';
                        if (icon) {
                            if (i === 1) icon.textContent = '📂';
                            if (i === 2) icon.textContent = '🗜️';
                            if (i === 3) icon.textContent = '📜';
                            if (i === 4) icon.textContent = '🎉';
                        }
                    } else {
                        el.className = 'pipeta-update-step-item';
                        if (icon) icon.textContent = '○';
                    }
                }
            },
            complete(data) {
                const bar = document.getElementById('zip-package-bar');
                if (bar) {
                    bar.style.width = '100%';
                    bar.classList.remove('animated-stripes');
                    bar.style.background = '#a3be8c';
                }
                const sub = document.getElementById('zip-package-subtext');
                if (sub) sub.innerHTML = `<span style="color:#a3be8c; font-weight:bold;">✅ ¡Empaquetado finalizado con éxito!</span>`;
                for (let i = 1; i <= 4; i++) {
                    const el = document.getElementById(`zstep-${i}`);
                    if (el) {
                        el.className = 'pipeta-update-step-item done';
                        const icon = el.querySelector('.pstep-icon');
                        if (icon) icon.textContent = '✅';
                    }
                }
                const resDiv = document.getElementById('zip-package-result');
                const summaryDiv = document.getElementById('zip-package-summary');
                if (resDiv && summaryDiv) {
                    summaryDiv.innerHTML = `
                        Generado: <code>${data.zipName}</code> (${data.sizeFormatted})<br>
                        Lanzador: <code>${data.batName}</code>
                    `;
                    resDiv.style.display = 'block';

                    const openBtn = document.getElementById('btnZipOpenFolder');
                    if (openBtn) {
                        openBtn.onclick = () => {
                            if (window.API?.fs?.openFolder) {
                                window.API.fs.openFolder((data.targetDir || '').replace(/\\/g, '/'));
                            }
                        };
                    }
                    const closeBtn = document.getElementById('btnZipClose');
                    if (closeBtn) {
                        closeBtn.onclick = () => backdrop.remove();
                    }
                }
            },
            error(err) {
                const bar = document.getElementById('zip-package-bar');
                if (bar) {
                    bar.style.background = '#f44336';
                    bar.classList.remove('animated-stripes');
                }
                const sub = document.getElementById('zip-package-subtext');
                if (sub) sub.innerHTML = `<span style="color:#f44336; font-weight:bold;">❌ Error al generar .ZIP: ${err}</span>`;
                const resDiv = document.getElementById('zip-package-result');
                if (resDiv) {
                    resDiv.style.display = 'block';
                    const summaryDiv = document.getElementById('zip-package-summary');
                    if (summaryDiv) summaryDiv.innerHTML = `<span style="color:#ff6b6b;">${err}</span>`;
                    const openBtn = document.getElementById('btnZipOpenFolder');
                    if (openBtn) openBtn.style.display = 'none';
                    const closeBtn = document.getElementById('btnZipClose');
                    if (closeBtn) closeBtn.onclick = () => backdrop.remove();
                }
            }
        };
    },

    runZipPackaging: async function() {
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('export_portable_zip')) {
            alert("🔒 No tienes permisos para generar versiones portables (.zip).");
            return;
        }
        return settings.executePackageZip();
    },

    executePackageZip: async function() {
        const input = document.getElementById('pkgTargetDir');
        const targetDir = (input ? input.value : settings.pkgTargetDir || 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS').trim();
        if (!targetDir) {
            alert("Por favor especifica una carpeta de salida para el archivo .ZIP.");
            return;
        }

        const includeRamon = document.getElementById('pkgIncludeRamon')?.checked || false;
        const includeDriveCache = document.getElementById('pkgIncludeSyncCacheDrive')?.checked || document.getElementById('pkgIncludeDriveCache')?.checked || false;
        const includeServerCache = document.getElementById('pkgIncludeSyncCacheServer')?.checked || document.getElementById('pkgIncludeServerCache')?.checked || false;

        const btn = document.getElementById('btnRunPackageZip') || document.getElementById('pkgGenerateBtn');
        const zipName = includeRamon 
            ? `Pipeta_${window.APP_VERSION || 'v1.1.93'}_Ramon.zip` 
            : `Pipeta_${window.APP_VERSION || 'v1.1.93'}.zip`;

        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.7';
        }

        const modal = settings.showZipPackagingModal(zipName);
        modal.setStep(1, 20, 'Preparando base de código y presets locales...');

        const t1 = setTimeout(() => {
            modal.setStep(2, 50, includeRamon 
                ? 'Comprimiendo Pipeta con entorno de Ramón (esto puede demorar unos segundos)...' 
                : 'Comprimiendo runtime y archivos en .ZIP...');
        }, 1200);

        try {
            const res = await fetch('/api/system/package-dist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    targetDir: targetDir, 
                    includeRamon: includeRamon,
                    includeDriveCache: includeDriveCache,
                    includeServerCache: includeServerCache
                })
            });

            clearTimeout(t1);
            const data = await res.json();
            if (data && data.success) {
                modal.setStep(3, 85, 'Generando script instalador .BAT...');
                setTimeout(() => {
                    modal.setStep(4, 98, 'Verificando archivo .ZIP generado...');
                    setTimeout(() => {
                        modal.complete(data);
                    }, 400);
                }, 400);
            } else {
                throw new Error(data ? data.error : 'Error desconocido del servidor');
            }
        } catch(e) {
            clearTimeout(t1);
            console.error("Package error:", e);
            modal.error(e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        }
    },

    confirmExportPresets: () => {
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('presets_allow_publish')) {
            alert("🔒 No tienes permisos para publicar presets.");
            return;
        }
        const targetInput = document.getElementById('expTargetPath');
        let targetRoot = (targetInput ? targetInput.value : '').trim();
        if (!targetRoot) {
            settings.showToast("Por favor especifica una ruta de destino válida.", "warn", 4);
            return;
        }
        targetRoot = targetRoot.replace(/\\/g, '/').replace(/\/+$/, '');

        const doShot = document.getElementById('expOptShotDesigner')?.checked;
        const doAsset = document.getElementById('expOptAssetDesigner')?.checked;
        const doProj = document.getElementById('expOptProjects')?.checked;
        const doUsers = document.getElementById('expOptUsers')?.checked;
        const doStatuses = document.getElementById('expOptStatuses')?.checked;
        const doIa = document.getElementById('expOptIaTokens')?.checked;
        const doConfig = document.getElementById('expOptConfig')?.checked;

        const itemsList = [];
        if (doShot) itemsList.push('🎬 Presets de Shot Designer (ShotDesigner/*.json)');
        if (doAsset) itemsList.push('🎨 Presets de Asset Designer (AssetDesigner/*.json)');
        if (doProj) itemsList.push('📁 Proyectos Configurados (Projects/*.json)');
        if (doUsers) itemsList.push('👥 Usuarios y Roles (users_config.json)');
        if (doStatuses) itemsList.push('🏷️ Estados de Procesos y Planos (status_config.json)');
        if (doIa) itemsList.push('🤖 Tokens IA Personalizados (ia_custom_tokens.json)');
        if (doConfig) itemsList.push('⚙️ Configuración General (config.json, pipeline_config.json)');

        if (itemsList.length === 0) {
            settings.showToast("Por favor selecciona al menos un elemento para exportar.", "warn", 4);
            return;
        }

        const detailsHTML = `
            <div style="color:#aaa; margin-bottom:6px;">Ruta de Destino (Red):</div>
            <div style="color:var(--accent); font-family:monospace; word-break:break-all; font-weight:bold; margin-bottom:10px;">${targetRoot}</div>
            <div style="color:#aaa; margin-bottom:6px;">Elementos seleccionados (${itemsList.length}):</div>
            <ul style="margin:0; padding-left:18px; color:#ddd; display:flex; flex-direction:column; gap:3px;">
                ${itemsList.map(item => `<li>${item}</li>`).join('')}
            </ul>
        `;

        settings.showConfirmModal({
            title: 'Publicar / Exportar Presets',
            icon: '📤',
            message: '¿Confirmas la publicación y exportación de las configuraciones y presets seleccionados hacia la unidad de red compartida para el equipo?',
            details: detailsHTML,
            confirmText: 'CONFIRMAR Y PUBLICAR',
            confirmColor: 'var(--accent)',
            confirmTextColor: '#000',
            onConfirm: async () => {
                await settings.executeExportPresets();
            }
        });
    },

    executeExportPresets: async () => {
        if (typeof window.checkUserPermission === 'function' && !window.checkUserPermission('presets_allow_publish')) {
            alert("🔒 No tienes permisos para publicar presets.");
            return;
        }
        const targetInput = document.getElementById('expTargetPath');
        let targetRoot = (targetInput ? targetInput.value : '').trim();
        if (!targetRoot) {
            settings.showToast("Por favor especifica una ruta de destino válida.", "warn", 4);
            return;
        }
        targetRoot = targetRoot.replace(/\\/g, '/').replace(/\/+$/, '');

        const doShot = document.getElementById('expOptShotDesigner')?.checked;
        const doAsset = document.getElementById('expOptAssetDesigner')?.checked;
        const doProj = document.getElementById('expOptProjects')?.checked;
        const doUsers = document.getElementById('expOptUsers')?.checked;
        const doStatuses = document.getElementById('expOptStatuses')?.checked;
        const doIa = document.getElementById('expOptIaTokens')?.checked;
        const doConfig = document.getElementById('expOptConfig')?.checked;

        const statusMsg = document.getElementById('expStatusMsg');
        if (statusMsg) {
            statusMsg.innerHTML = '<span style="color:var(--accent);">⏳ Exportando presets a ' + targetRoot + '...</span>';
        }

        const localPresetsRoot = ((typeof window !== "undefined" && window.PIPETA_LOCAL_APP_DIR) ? window.PIPETA_LOCAL_APP_DIR.replace(/\\/g, "/") : "C:/TOOLS/APPS/Pipeta") + "/presets";
        let exportedCount = 0;
        let errors = [];

        async function copyDirectory(subfolder) {
            const srcDir = `${localPresetsRoot}/${subfolder}`;
            const files = await API.fs.getFiles(srcDir);
            for (const f of files) {
                if (f.endsWith('.json')) {
                    const content = await API.fs.readFile(`${srcDir}/${f}`);
                    if (content !== null) {
                        const dstPath = `${targetRoot}/${subfolder}/${f}`;
                        const res = await API.fs.writeFile(dstPath, content);
                        if (res && res.success) {
                            exportedCount++;
                        } else {
                            errors.push(`Error al escribir ${dstPath}: ${res?.error || 'Desconocido'}`);
                        }
                    }
                }
            }
        }

        async function copySingleFile(fileName) {
            const srcPath = `${localPresetsRoot}/${fileName}`;
            const content = await API.fs.readFile(srcPath);
            if (content !== null) {
                const dstPath = `${targetRoot}/${fileName}`;
                const res = await API.fs.writeFile(dstPath, content);
                if (res && res.success) {
                    exportedCount++;
                } else {
                    errors.push(`Error al escribir ${dstPath}: ${res?.error || 'Desconocido'}`);
                }
            }
        }

        try {
            if (doShot) await copyDirectory('ShotDesigner');
            if (doAsset) await copyDirectory('AssetDesigner');
            if (doProj) await copyDirectory('Projects');
            if (doUsers) await copySingleFile('users_config.json');
            if (doStatuses) await copySingleFile('status_config.json');
            if (doIa) await copySingleFile('ia_custom_tokens.json');
            if (doConfig) {
                await copySingleFile('config.json');
                await copySingleFile('pipeline_config.json');
            }

            if (errors.length > 0) {
                if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">⚠️ ${exportedCount} archivos exportados con ${errors.length} errores.</span>`;
                settings.showToast(`Exportación con errores: ${exportedCount} exportados, ${errors.length} fallos.`, 'warn', 6, errors.slice(0, 2).join(' | '));
            } else if (exportedCount === 0) {
                if (statusMsg) statusMsg.innerHTML = `<span style="color:#ffb74d;">ℹ️ No se encontraron archivos para exportar en las opciones seleccionadas.</span>`;
                settings.showToast("No se encontraron archivos para exportar.", "warn", 4);
            } else {
                if (statusMsg) statusMsg.innerHTML = `<span style="color:#4caf50;">✅ ¡${exportedCount} archivos exportados con éxito a ${targetRoot}!</span>`;
                settings.showToast(`¡${exportedCount} archivos y configuraciones exportados correctamente!`, 'success', 5, `Destino: ${targetRoot}`);
            }
        } catch(e) {
            console.error("Export error:", e);
            if (statusMsg) statusMsg.innerHTML = `<span style="color:#f44336;">❌ Error en la exportación: ${e.message}</span>`;
            settings.showToast("Error al exportar: " + e.message, "error", 5);
        }
    }
});

settings._categoryRenderers.ia_ingest = function () {
                const isWatcherActive = window.iaWatcherActive || (typeof isDownloadWatcherRunning === 'function' ? isDownloadWatcherRunning() : false);
                const detectedFolder = window.iaWatcherFolder || (document.getElementById('iaWatcherDetectedFolder')?.innerText) || 'C:/Users/.../Downloads';
                return `
                    <h3 style="margin-top:0; margin-bottom:15px; color:#fff; display:flex; align-items:center; gap:8px;">
                        <span>🤖 IA Ingest & Descargas</span>
                    </h3>
                    
                    <!-- CAPTURA AUTOMÁTICA DE DESCARGAS -->
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:6px; border:1px solid #333; margin-bottom:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <div>
                                <h4 style="margin:0; color:var(--accent); font-size:0.95rem;">Captura Automática de Descargas</h4>
                                <div style="font-size:0.82rem; color:#888; margin-top:3px; line-height:1.3;">
                                    Monitorea la carpeta de descargas de tu navegador y envía automáticamente los archivos nuevos a la cola de IA Ingest.
                                </div>
                            </div>
                            <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
                                <input type="checkbox" id="iaSettingsWatcherToggle" ${isWatcherActive ? 'checked' : ''} 
                                       onchange="if (typeof toggleDownloadWatcher === 'function') toggleDownloadWatcher(this.checked); settings.render();"
                                       style="opacity:0; width:0; height:0;">
                                <span style="position:absolute; top:0; left:0; right:0; bottom:0; background:${isWatcherActive ? 'var(--accent)' : '#444'}; border-radius:24px; transition:0.3s;"></span>
                                <span style="position:absolute; content:''; height:18px; width:18px; left:${isWatcherActive ? '22px' : '3px'}; bottom:3px; background:white; border-radius:50%; transition:0.3s;"></span>
                            </label>
                        </div>

                        <div style="margin-top:12px; padding:10px; background:#111; border:1px solid #282828; border-radius:4px;">
                            <div style="font-size:0.75rem; color:#aaa; margin-bottom:4px;">Carpeta de Descargas Monitoreada:</div>
                            <div style="font-size:0.8rem; color:#4caf50; font-family:monospace; word-break:break-all;" id="iaSettingsWatcherDetectedFolder">
                                ${escapeHtml(detectedFolder)}
                            </div>
                        </div>

                        <div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">
                            <button class="tool-btn" style="width:100%; padding:8px 12px; font-size:0.8rem; background:#222; border:1px solid #555; text-align:center; color:#ffb74d; border-radius:4px; font-weight:bold; cursor:pointer;" 
                                    onclick="if (typeof openChromeSettingsDownloads === 'function') openChromeSettingsDownloads();" 
                                    title="Abre los ajustes de descargas de Chrome y copia la dirección al portapapeles">
                                ⚙️ Abrir Ajustes Descargas Chrome
                            </button>
                            <div style="font-size:0.75rem; color:#888; line-height:1.4;">
                                💡 <i>Recomendación: En la pestaña de Chrome que se abrirá, desactiva <b>"Preguntar dónde se guardará cada archivo"</b> para que las imágenes o videos generados se descarguen directamente sin abrir el diálogo de Windows y entren a la cola de Pipeta al instante.</i>
                            </div>
                        </div>
                    </div>

                    <!-- GUARDADO AUTOMÁTICO DE TOKENS PERSONALIZADOS TRAS INGESTA -->
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:6px; border:1px solid #333; margin-bottom:16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <h4 style="margin:0; color:var(--accent); font-size:0.95rem;">Guardar Tokens Personalizados tras Ingesta (Save after queue)</h4>
                                <div style="font-size:0.82rem; color:#888; margin-top:3px; line-height:1.3;">
                                    Guarda de forma permanente cualquier token personalizado manual nuevo (motores, resoluciones, encuadres, tags) en presets/ia_custom_tokens.json al ejecutar la ingesta.
                                </div>
                            </div>
                            <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
                                <input type="checkbox" id="iaSettingsSaveTokensToggle" ${localStorage.getItem('pipeta_ia_save_custom_tokens') !== 'false' ? 'checked' : ''} 
                                       onchange="localStorage.setItem('pipeta_ia_save_custom_tokens', this.checked); settings.render();"
                                       style="opacity:0; width:0; height:0;">
                                <span style="position:absolute; top:0; left:0; right:0; bottom:0; background:${localStorage.getItem('pipeta_ia_save_custom_tokens') !== 'false' ? 'var(--accent)' : '#444'}; border-radius:24px; transition:0.3s;"></span>
                                <span style="position:absolute; content:''; height:18px; width:18px; left:${localStorage.getItem('pipeta_ia_save_custom_tokens') !== 'false' ? '22px' : '3px'}; bottom:3px; background:white; border-radius:50%; transition:0.3s;"></span>
                            </label>
                        </div>
                    </div>
                `;
};

settings._categoryRenderers.interfaz = function () {
                const curViewMode = (settings.defaultViewMode === 'online') ? 'drive' : (settings.defaultViewMode || 'local');

                const curCompMode = settings.defaultSyncComparisonMode || (typeof window !== 'undefined' && window.syncComparisonMode ? window.syncComparisonMode : 'drive');

                return `
                    <h3 style="margin-top:0; margin-bottom:15px; color:#fff;">Interfaz de Usuario</h3>
                    
                    <!-- 1. MODO DE EXPLORADOR POR DEFECTO -->
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:6px; border:1px solid #333; margin-bottom:16px;">
                        <h4 style="margin-top:0; margin-bottom:6px; color:#ccc; font-size:0.95rem;">Modo de Explorador por Defecto</h4>
                        <div style="font-size:0.82rem; color:#888; margin-bottom:12px; line-height:1.3;">
                            Define qué ubicación se carga al iniciar la aplicación en el explorador.
                        </div>
                        <div style="display:flex; gap:24px; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultViewMode" value="local" 
                                    ${curViewMode === 'local' ? 'checked' : ''}
                                    onchange="settings.defaultViewMode = 'local'; try { localStorage.setItem('pipeta_view_location_mode', 'local'); } catch(e){}">
                                <span>Local (Z:)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultViewMode" value="drive" 
                                    ${curViewMode === 'drive' ? 'checked' : ''}
                                    onchange="settings.defaultViewMode = 'drive'; try { localStorage.setItem('pipeta_view_location_mode', 'drive'); } catch(e){}">
                                <span>Drive (G:)</span>
                            </label>
                            ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultViewMode" value="server" 
                                    ${curViewMode === 'server' ? 'checked' : ''}
                                    onchange="settings.defaultViewMode = 'server'; try { localStorage.setItem('pipeta_view_location_mode', 'server'); } catch(e){}">
                                <span>Servidor (Catálogo)</span>
                            </label>
                            ` : ''}
                        </div>
                    </div>



                    <!-- 3. COMPARACIÓN POR DEFECTO (EN MODO LOCAL) -->
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:6px; border:1px solid #333; margin-bottom:16px;">
                        <h4 style="margin-top:0; margin-bottom:6px; color:#ccc; font-size:0.95rem;">Comparación por Defecto (en modo Local)</h4>
                        <div style="font-size:0.82rem; color:#888; margin-bottom:12px; line-height:1.3;">
                            Define si se auditan y comparan los archivos locales contra Google Drive o el Servidor Central al abrir el explorador.
                        </div>
                        <div style="display:flex; gap:24px; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultSyncComparisonMode" value="drive" 
                                    ${curCompMode === 'drive' ? 'checked' : ''}
                                    onchange="settings.defaultSyncComparisonMode = 'drive'; try { localStorage.setItem('pipeta_sync_comparison_mode', 'drive'); } catch(e){}">
                                <span>Google Drive (G:)</span>
                            </label>
                            ${(typeof canUseServerMode === 'function' ? canUseServerMode() : (typeof isZRealServer === 'function' && !isZRealServer())) ? `
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultSyncComparisonMode" value="server" 
                                    ${curCompMode === 'server' ? 'checked' : ''}
                                    onchange="settings.defaultSyncComparisonMode = 'server'; try { localStorage.setItem('pipeta_sync_comparison_mode', 'server'); } catch(e){}">
                                <span>Servidor Central</span>
                            </label>
                            ` : ''}
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.88rem; color:#eee;">
                                <input type="radio" name="defaultSyncComparisonMode" value="off" 
                                    ${curCompMode === 'off' ? 'checked' : ''}
                                    onchange="settings.defaultSyncComparisonMode = 'off'; try { localStorage.setItem('pipeta_sync_comparison_mode', 'off'); } catch(e){}">
                                <span>Desactivada</span>
                            </label>
                        </div>
                    </div>
                `;
};

settings._categoryRenderers.avanzado = function () {
                // Build options for presets
                let assetPresets = settings.presetsList.map(p =>
                    `<option value="${p.id}" ${settings.validationPresetAsset === p.id ? 'selected' : ''}>${p.name}</option>`
                ).join('');

                let shotPresets = settings.presetsList.map(p =>
                    `<option value="${p.id}" ${settings.validationPresetShot === p.id ? 'selected' : ''}>${p.name}</option>`
                ).join('');

                if (settings.presetsList.length === 0) {
                    assetPresets = `<option disabled>No se encontraron presets (.json) en ${settings.projectsPath.replace('Projects', '')}</option>`;
                    shotPresets = `<option disabled>Verificar ruta de instalación</option>`;
                }

                const sData = settings.statusesData || { statuses: [] };
                const curProj = settings.currentProject || settings.getBaseProject();
                const defaultWfDir = (curProj.roots?.work || 'Z:/[cliente]/[proyecto]').replace(/\//g, '\\') + '\\workflow';

                return `
                    <h3 style="margin-top:0; margin-bottom:15px; color:#fff;">Opciones Avanzadas</h3>
                    
                    <!-- DESPLEGABLE: LOCAL (DISEÑADOR DE ESTADOS & WORKFLOW) -->
                    <details ${settings.localAccordionOpen ? 'open' : ''} ontoggle="settings.localAccordionOpen = this.open" style="background:rgba(255,255,255,0.03); border:1px solid #384252; border-radius:8px; margin-bottom:20px; overflow:hidden;">
                        <summary style="padding:14px 18px; cursor:pointer; font-weight:bold; color:var(--accent); font-size:0.95rem; user-select:none; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:space-between;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span>💻</span>
                                <span style="color:#fff;">Local</span>
                                <span style="color:#888; font-weight:normal; font-size:0.8rem;">(Diseñador de Estados, Workflow & Base de Datos)</span>
                            </div>
                            <span style="font-size:0.75rem; color:#888;">▼ Desplegable</span>
                        </summary>
                        <div style="padding:18px; border-top:1px solid #2a3442; display:flex; flex-direction:column; gap:20px;">
                            
                            <!-- BLOQUE 1: DISEÑADOR DE ESTADOS -->
                            <div style="background:#14171d; border:1px solid #2a3342; border-radius:6px; padding:16px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #2a3342; padding-bottom:10px; margin-bottom:14px;">
                                    <div>
                                        <div style="font-weight:bold; color:var(--accent); font-size:0.92rem;">🏷️ Diseñador de Estados (Shots / Assets)</div>
                                        <div style="color:#888; font-size:0.8rem; margin-top:2px;">Define y personaliza los estados de procesos y avance aplicables a shots y assets.</div>
                                    </div>
                                    <button class="btn" onclick="settings.addStatusModal()" style="background:var(--accent); color:black; font-weight:bold; padding:6px 14px; border:none; border-radius:4px; cursor:pointer; font-size:0.82rem;">
                                        + Nuevo Estado
                                    </button>
                                </div>
                                <table style="width:100%; border-collapse:collapse; font-size:0.82rem; text-align:left;">
                                    <thead>
                                        <tr style="border-bottom:1px solid #333; color:#888; font-size:0.72rem; text-transform:uppercase;">
                                            <th style="padding:6px 8px;">Icono & Estado</th>
                                            <th style="padding:6px 8px;">Identificador</th>
                                            <th style="padding:6px 8px;">Ámbito</th>
                                            <th style="padding:6px 8px;">Color</th>
                                            <th style="padding:6px 8px; text-align:right;">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(sData.statuses || []).map(st => `
                                            <tr style="border-bottom:1px solid #222;">
                                                <td style="padding:8px; display:flex; align-items:center; gap:8px;">
                                                    <span style="font-size:1.05rem;">${st.icon || '⚪'}</span>
                                                    <b style="color:${st.color || '#fff'};">${st.name}</b>
                                                    ${st.isDefault ? `<span style="background:#222; color:#aaa; font-size:0.65rem; padding:1px 5px; border-radius:3px;">Por Defecto</span>` : ''}
                                                </td>
                                                <td style="padding:8px; font-family:monospace; color:#888;">${st.id}</td>
                                                <td style="padding:8px; text-transform:capitalize; color:#ccc;">${st.scope === 'both' ? 'Shots & Assets' : st.scope}</td>
                                                <td style="padding:8px;">
                                                    <div style="display:flex; align-items:center; gap:6px;">
                                                        <div style="width:14px; height:14px; border-radius:3px; background:${st.color}; border:1px solid #555;"></div>
                                                        <span style="font-family:monospace; font-size:0.75rem; color:#aaa;">${st.color}</span>
                                                    </div>
                                                </td>
                                                <td style="padding:8px; text-align:right;">
                                                    ${!st.isDefault ? `<button onclick="settings.deleteStatus('${st.id}')" class="icon-btn danger" style="background:transparent; border:none; color:#f44336; cursor:pointer;" title="Eliminar Estado">🗑️</button>` : ''}
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>

                            <!-- BLOQUE 2: WORKFLOW & BASE DE DATOS -->
                            <div style="background:#14171d; border:1px solid #2a3342; border-radius:6px; padding:16px;">
                                <div style="font-weight:bold; color:var(--accent); font-size:0.92rem; margin-bottom:4px;">🗂️ Workflow, Asignaciones & Base de Datos</div>
                                <p style="color:#aaa; font-size:0.8rem; line-height:1.5; margin-top:0; margin-bottom:12px;">
                                    Pipeta mantiene la base de datos de planos, estados y asignaciones en <code>shot_tracker.json</code> dentro de la carpeta de workflow del proyecto.
                                </p>
                                <div style="display:flex; gap:8px; margin-bottom:14px;">
                                    <input type="text" readonly value="${defaultWfDir}" style="flex:1; background:#0d1117; border:1px solid #333; border-radius:4px; padding:6px 10px; color:#ccc; font-family:monospace; font-size:0.8rem;">
                                    <button class="btn" onclick="API.fs.open('${defaultWfDir.replace(/\\/g, '\\\\')}')" style="background:#222; color:#fff; border:1px solid #444; border-radius:4px; padding:6px 12px; cursor:pointer; font-size:0.8rem;">📂 Abrir</button>
                                </div>
                                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                                    <button class="btn" onclick="if(typeof ShotNavigator !== 'undefined') { ShotNavigator.loadWorkflow(); alert('✅ Base de datos de workflow recargada con éxito.'); }" style="background:#1c222d; color:#4fc3f7; border:1px solid #4fc3f766; padding:7px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.82rem;">
                                        🔄 Recargar Workflow Local
                                    </button>
                                    <button class="btn" onclick="if(typeof ShotNavigator !== 'undefined') { ShotNavigator.saveTracker(); alert('✅ Base de datos de workflow guardada.'); }" style="background:#1c222d; color:#4caf50; border:1px solid #4caf5066; padding:7px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.82rem;">
                                        💾 Guardar / Publicar Tracker
                                    </button>
                                    <button class="btn" onclick="if(typeof ShotNavigator !== 'undefined') { ShotNavigator.exportMyTasksFile(); }" style="background:#1c222d; color:#ff9800; border:1px solid #ff980066; padding:7px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.82rem;">
                                        👤 Exportar Mis Tareas (.json)
                                    </button>
                                </div>
                            </div>

                        </div>
                    </details>
                    
                    <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:6px; border:1px solid #333; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h4 style="margin-top:0; margin-bottom:10px; color:var(--accent);">Presets Maestros de Validación</h4>
                            <button onclick="settings.loadPresets().then(() => settings.render())" style="background:none; border:none; color:#666; cursor:pointer;" title="Recargar Presets">↻</button>
                        </div>
                        <p style="font-size:0.8rem; color:#888;">Define qué presets se usan para auditar y verificar la estructura de carpetas de Assets y Shots.</p>
                        
                        <div class="config-group" style="margin-top:15px;">
                            <label class="config-label">Maestro para Assets</label>
                            <select class="config-input" onchange="settings.validationPresetAsset = this.value">
                                <option value="">-- Sin asignar --</option>
                                ${assetPresets}
                            </select>
                        </div>

                        <div class="config-group">
                            <label class="config-label">Maestro para Shots</label>
                            <select class="config-input" onchange="settings.validationPresetShot = this.value">
                                <option value="">-- Sin asignar --</option>
                                ${shotPresets}
                            </select>
                        </div>
                    </div>

                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
                            <div>
                                <h4 style="margin:0; color:var(--accent); font-size:0.95rem;">Registro de Actividad & Diagnóstico (Logs)</h4>
                                <p style="font-size:0.8rem; color:#888; margin:4px 0 0 0;">
                                    Pipeta separa automáticamente el <b>registro de operaciones</b> de las funciones habituales del <b>registro exclusivo de errores</b>.
                                </p>
                            </div>
                            <button type="button" class="btn" onclick="settings.generateDiagnosticReport()" 
                                    style="background:var(--accent); color:#000; font-weight:bold; border-radius:4px; padding:8px 16px; font-size:0.82rem; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(255,152,0,0.25);"
                                    title="Genera un reporte consolidado con entorno y errores, abre la carpeta de reportes y copia el texto al portapapeles">
                                <span>📦 Generar Reporte de Error</span>
                            </button>
                        </div>
                        
                        <div class="config-group" style="margin-top:15px;">
                            <label class="config-label">Registro activo en disco</label>
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" ${settings.loggingEnabled ? 'checked' : ''}
                                    onchange="settings.loggingEnabled = this.checked;">
                                <span style="font-size:0.85rem; color:#ccc;">${settings.loggingEnabled ? 'Activado — se guardan logs de operaciones (pipeta_fecha.log) y errores (pipeta_errors_fecha.log)' : 'Desactivado — no se registra actividad'}</span>
                            </label>
                        </div>

                        <div class="config-group" style="margin-top:12px;">
                            <label class="config-label">Acceso a Registros & Diagnóstico</label>
                            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                                <input class="config-input" type="text" value="${settings.logsPath}"
                                    onchange="settings.logsPath = this.value;" 
                                    style="flex:1; min-width:200px; font-family:monospace; font-size:0.8rem;">
                                
                                <button type="button" class="btn" onclick="settings.openLogsDirectory()" 
                                    style="background:#282828; color:#fff; border:1px solid #444; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir carpeta principal de logs en Explorer">
                                    <span>📂 Carpeta Logs</span>
                                </button>
                                
                                <button type="button" class="btn" onclick="settings.openReportsFolder()" 
                                    style="background:#282828; color:#4fc3f7; border:1px solid #00bcd488; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir carpeta de reportes generados">
                                    <span>📁 Carpeta Reportes</span>
                                </button>

                                <button type="button" class="btn" onclick="settings.openLatestLogFile()" 
                                    style="background:#222; color:var(--accent); border:1px solid #444; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir el log de operaciones de hoy">
                                    <span>📄 Log de Hoy</span>
                                </button>

                                <button type="button" class="btn" onclick="settings.openErrorLogFile()" 
                                    style="background:#222; color:#f44336; border:1px solid #f4433688; border-radius:4px; padding:6px 12px; font-size:0.8rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;" 
                                    title="Abrir el archivo exclusivo de errores de hoy">
                                    <span>⚠️ Log de Errores</span>
                                </button>
                            </div>
                            <div style="font-size:0.75rem; color:#777; margin-top:8px;">
                                Al pulsar <b>Generar Reporte de Error</b> se creará un archivo <code>reporte_fecha.txt</code> en <code>logs/reports/</code>, se abrirá la carpeta en Windows y el texto quedará copiado en tu portapapeles listo para enviar por Rock o chat.
                            </div>
                        </div>
                    </div>
                `;
};

settings._categoryRenderers.exportar = function () {
                const canPublishPresets = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('presets_allow_publish') : true;
                const canExportZip = (typeof window.checkUserPermission === 'function') ? window.checkUserPermission('export_portable_zip') : true;
                return `
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px;">📦 Update / Export Presets</h3>

                    <!-- SECCIÓN: ACTUALIZADOR DIRECTO & ACCESOS (ARRIBA DE TODO) -->
                    ${(() => {
                        const isExt = (typeof window.isExternalMachine === 'function' && window.isExternalMachine()) ||
                                      !!(window.pipetaSystemEnv?.isExternalMachine || settings.envState?.isExternalMachine);
                        return `
                        <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="font-weight:bold; color:var(--accent); font-size:0.95rem;">
                                        🔄 Actualizador del Sistema
                                    </span>
                                    <span style="font-size:0.75rem; background:${isExt ? '#ff9800' : '#4caf50'}; color:#000; font-weight:bold; padding:2px 8px; border-radius:3px;">
                                        ${isExt ? 'Modo Remoto (GitHub / Drive)' : 'Red Estudio'}
                                    </span>
                                </div>
                                <div style="display:flex; gap:10px;">
                                    <button id="createShortcutBtn" class="btn" onclick="settings.createDesktopShortcut()" title="Crea un acceso directo en tu Escritorio con el icono de Pipeta"
                                        style="background:#222; color:#00bcd4; border:1px solid #00bcd488; font-weight:bold; padding:9px 16px; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                                        <span>📌 Crear Acceso Directo</span>
                                    </button>
                                    <button id="updateFromNetBtn" class="btn" onclick="settings.executeUpdateFromServer()"
                                        style="background:var(--accent); color:black; font-weight:bold; padding:9px 22px; border-radius:4px; border:none; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 2px 10px rgba(255,152,0,0.3);">
                                        <span>🚀 ACTUALIZAR PIPETA</span>
                                    </button>
                                </div>
                            </div>
                            <div id="updateStatusMsg" style="font-size:0.85rem; color:#aaa; margin-bottom:12px;"></div>
                            <p style="color:#aaa; font-size:0.82rem; line-height:1.5; margin-top:0; margin-bottom:14px;">
                                ${isExt
                                    ? 'Sincroniza en caliente tu instalación con la última versión oficial desde GitHub y Google Drive, y reinicia la aplicación automáticamente.'
                                    : 'Sincroniza en caliente tu instalación con la última versión oficial del estudio y reinicia la aplicación automáticamente.'}
                            </p>

                            <div style="background:#111; border:1px solid #222; border-radius:6px; padding:12px; font-size:0.8rem;">
                                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                                    <span style="color:#888;">Origen de Actualización:</span>
                                    <span style="color:var(--accent); font-family:monospace; font-weight:bold;">${isExt ? 'Repositorio Oficial (Cloud)' : 'Servidor Maestro (Estudio)'}</span>
                                </div>
                                <div style="display:flex; justify-content:space-between;">
                                    <span style="color:#888;">Instalación Local:</span>
                                    <span style="color:#aaa; font-family:monospace;">${(typeof window !== "undefined" && window.PIPETA_LOCAL_APP_DIR) ? window.PIPETA_LOCAL_APP_DIR : "C:\\TOOLS\\APPS\\Pipeta"}</span>
                                </div>
                            </div>
                        </div>
                        `;
                    })()}

                    <p style="color:#aaa; font-size:0.85rem; line-height:1.6; margin-bottom:14px;">
                        Esta herramienta permite respaldar y publicar selectivamente las configuraciones, proyectos y presets de diseño (Shots y Assets) desde tu disco local <code>C:\\</code> hacia la unidad de red <code>Z:\\</code> o cualquier otra carpeta de destino, manteniendo intacto el carpetaje original.
                    </p>

                    <!-- RECUADRO UNIFICADO: ELEMENTOS + DESTINO DE EXPORTACIÓN -->
                    ${canPublishPresets ? `
                    <div style="background:rgba(255,255,255,0.03); padding:16px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:10px; font-size:0.85rem;">Elementos a Exportar</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; font-size:0.78rem;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptShotDesigner" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Presets de Shot Designer</b> <span style="color:#777; font-size:0.72rem;">(presets/ShotDesigner/*.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptAssetDesigner" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Presets de Asset Designer</b> <span style="color:#777; font-size:0.72rem;">(presets/AssetDesigner/*.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptProjects" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Proyectos Configurados</b> <span style="color:#777; font-size:0.72rem;">(presets/Projects/*.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptUsers" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Usuarios y Roles</b> <span style="color:#777; font-size:0.72rem;">(presets/users_config.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptStatuses" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Estados de Procesos y Planos</b> <span style="color:#777; font-size:0.72rem;">(presets/status_config.json)</span></span>
                            </label>
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; color:#ddd;">
                                <input type="checkbox" id="expOptConfig" checked style="accent-color:var(--accent); width:14px; height:14px;">
                                <span><b>Configuración General</b> <span style="color:#777; font-size:0.72rem;">(presets/config.json)</span></span>
                            </label>
                        </div>

                        <div style="border-top:1px solid #282828; margin-top:14px; padding-top:12px;">
                            <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                                <span style="font-weight:bold; color:var(--accent); font-size:0.85rem;">Ruta de Destino de la Exportación:</span>
                                <span style="color:#888; font-size:0.76rem;">Selecciona o examina la carpeta de destino:</span>
                            </div>
                            <div style="display:flex; gap:8px; margin-bottom:14px;">
                                <input type="text" id="expTargetPath" class="config-input" 
                                    value="${settings.exportPresetsPath || ((typeof window !== 'undefined' && window.IS_BETA_CHANNEL) ? 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS\\\\Pipeta_Beta\\\\presets' : 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS\\\\Pipeta\\\\presets')}" 
                                    oninput="settings.exportPresetsPath = this.value"
                                    style="flex:1; font-family:monospace; font-size:0.85rem; padding:8px; color:var(--accent);">
                                <button id="expBrowseBtn" class="btn" onclick="settings.browseExportPath()" 
                                    style="background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:8px 14px; font-size:0.85rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                    <span>📁 Examinar...</span>
                                </button>
                                <button class="btn" onclick="settings.setDefaultExportPath()" title="Restablecer a la ruta de red por defecto en Z:"
                                    style="background:#222; color:#aaa; border:1px solid #444; border-radius:4px; padding:8px 12px; font-size:0.85rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                    <span>↺ Default (Z:)</span>
                                </button>
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px;">
                                <div id="expStatusMsg" style="font-size:0.85rem; color:#aaa;"></div>
                                <button class="btn" onclick="settings.confirmExportPresets()" 
                                    style="background:var(--accent); color:black; font-weight:bold; padding:9px 20px; border-radius:4px; border:none; cursor:pointer; display:flex; align-items:center; gap:8px;">
                                    <span>🚀 EXPORTAR / PUBLICAR PRESETS</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    ` : '<div style="padding:12px 16px; background:rgba(255,255,255,0.02); border:1px solid #282828; border-radius:6px; color:#888; font-size:0.8rem; margin-bottom:18px;">🔒 Publicación de Presets restringida por política de usuario.</div>'}

                    <!-- SECCIÓN: EMPAQUETAR VERSIÓN PORTABLE (.ZIP) -->
                    ${canExportZip ? `
                    <div style="background:rgba(0,188,212,0.04); padding:18px; border-radius:8px; border:1px solid #00bcd444; margin-bottom:20px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div style="font-weight:bold; color:#00bcd4; font-size:0.95rem; display:flex; align-items:center; gap:8px;">
                                <span>📦 Empaquetar Versión Portable (.zip)</span>
                            </div>
                            <span style="font-size:0.75rem; background:#222; padding:2px 8px; border-radius:4px; color:#aaa; font-family:monospace;">
                                Pipeta ${window.APP_VERSION || 'v1.1.93'}
                            </span>
                        </div>
                        <p style="color:#aaa; font-size:0.82rem; line-height:1.5; margin-top:0; margin-bottom:14px;">
                            Genera un archivo comprimido <code>Pipeta_vX.XX.zip</code> (o <code>Pipeta_vX.XX_Ramon.zip</code>) autocontenido con el runtime de Node.js, todas las interfaces, el lanzador y los presets de configuración. Cualquier usuario puede descomprimirlo en cualquier máquina o disco (<code>C:</code>, <code>D:</code>, pendrive) y ejecutarlo de inmediato sin instalaciones previas ni dependencias de red.
                        </p>

                        <div style="margin-bottom:14px;">
                            <label style="font-size:0.8rem; color:#888; display:block; margin-bottom:6px;">Carpeta de Salida para el archivo comprimido:</label>
                            <div style="display:flex; gap:8px;">
                                <input type="text" id="pkgTargetDir" class="config-input" 
                                    value="${settings.pkgTargetDir || 'Z:\\\\INTERNO\\\\TOOLS\\\\GITHUB\\\\TOOLS\\\\APPS'}" 
                                    oninput="settings.pkgTargetDir = this.value"
                                    style="flex:1; font-family:monospace; font-size:0.85rem; padding:8px; color:#00bcd4;">
                                <button id="pkgBrowseBtn" class="btn" onclick="settings.browsePackageDir()" 
                                    style="background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:8px 14px; font-size:0.85rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                    <span>📁 Examinar...</span>
                                </button>
                                <button class="btn" onclick="settings.openPackageTargetDir()" title="Abrir carpeta de salida en el Explorador de Windows"
                                    style="background:#222; color:#00bcd4; border:1px solid #00bcd488; border-radius:4px; padding:8px 12px; font-size:0.85rem; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px;">
                                    <span>📂 Abrir Carpeta</span>
                                </button>
                            </div>
                        </div>

                        <!-- CHECKBOX INCLUIR RAMON Y DEPENDENCIAS -->
                        <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:10px 14px; margin-bottom:12px;">
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:0.85rem; color:#eee;">
                                <input type="checkbox" id="pkgIncludeRamon" style="width:16px; height:16px; cursor:pointer;">
                                <span>
                                    <b>Incluir Ramón y dependencias</b> (Python 3.10 portable + TACTIC Client) 
                                    <span style="color:#00bcd4; font-size:0.75rem; margin-left:6px;">➔ Genera <code>Pipeta_${window.APP_VERSION || 'v1.1.93'}_Ramon.zip</code> (~35 MB extra)</span>
                                </span>
                            </label>
                            <div style="font-size:0.75rem; color:#888; margin-left:26px; margin-top:3px;">
                                Ideal para enviar por primera vez a usuarios externos en su casa. Para actualizaciones de código subsiguientes, podés dejarlo destildado para generar una versión más ligera (<code>Pipeta_${window.APP_VERSION || 'v1.1.93'}.zip</code>).
                            </div>
                        </div>

                        <!-- OPCIONES DE CACHÉ LOCAL Y RED (_SYNC_CACHE) -->
                        <div style="background:rgba(255,255,255,0.03); border:1px solid #333; border-radius:6px; padding:12px 14px; margin-bottom:14px;">
                            <div style="font-size:0.85rem; font-weight:bold; color:#eee; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                                <span>⚡ Cachés de Catálogos (<code>_SYNC_CACHE</code>)</span>
                            </div>
                            <div style="font-size:0.75rem; color:#888; margin-bottom:10px; line-height:1.4;">
                                Por defecto <b>no se incluyen cachés</b> para que el .ZIP sea ultra-liviano (~40–70 MB). Si se omiten, Pipeta generará los catálogos automáticamente en la máquina donde se ejecute.
                            </div>

                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.8rem; color:#ccc;">
                                    <input type="checkbox" id="pkgIncludeSyncCacheDrive" style="cursor:pointer;">
                                    <span>Incluir caché de Google Drive (<code>_SYNC_CACHE/projects/.../drive</code>)</span>
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.8rem; color:#ccc;">
                                    <input type="checkbox" id="pkgIncludeSyncCacheServer" style="cursor:pointer;">
                                    <span>Incluir caché de Servidor (<code>_SYNC_CACHE/projects/.../server</code>)</span>
                                </label>
                            </div>
                        </div>

                        <!-- BOTÓN ACCIÓN -->
                        <div style="display:flex; justify-content:flex-end;">
                            <button class="action-btn-primary" id="btnRunPackageZip" onclick="settings.runZipPackaging()" style="display:flex; align-items:center; gap:8px; padding:8px 18px;">
                                <span>📦 Empaquetar y Generar .ZIP</span>
                            </button>
                        </div>
                    </div>
                    ` : '<div style="padding:12px 16px; background:rgba(255,255,255,0.02); border:1px solid #282828; border-radius:6px; color:#888; font-size:0.8rem; margin-bottom:18px;">🔒 Empaquetado portable (.zip) restringido por política de usuario.</div>'}
                `;
};

settings._categoryRenderers.shortcuts = function () {
    return typeof window.renderPipetaShortcutsHtml === 'function'
        ? window.renderPipetaShortcutsHtml()
        : '';
};

settings._categoryRenderers.version = function () {
    return typeof window.renderPipetaPatchNotesHtml === 'function'
        ? window.renderPipetaPatchNotesHtml()
        : '';
};
