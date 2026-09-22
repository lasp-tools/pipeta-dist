// -----------------------------------------------------------------------------
// sync-conflict.js: Upload/Download Conflict Resolution & Sync Actions
// -----------------------------------------------------------------------------

(function(window) {
    'use strict';

    function formatBytes(bytes) {
        if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatDate(dateVal) {
        if (!dateVal) return '-';
        try {
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return String(dateVal);
            return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (e) {
            return String(dateVal);
        }
    }

    function computeCopyName(originalName, isDir) {
        if (!originalName) return 'copy';
        if (isDir) {
            return `${originalName}_copy`;
        }
        const lastDot = originalName.lastIndexOf('.');
        if (lastDot > 0) {
            const base = originalName.substring(0, lastDot);
            const ext = originalName.substring(lastDot);
            return `${base}_copy${ext}`;
        }
        return `${originalName}_copy`;
    }

    function computeCopyPath(originalPath, isDir) {
        if (!originalPath) return '';
        const norm = originalPath.replace(/\\/g, '/');
        const lastSlash = norm.lastIndexOf('/');
        if (lastSlash === -1) {
            return computeCopyName(norm, isDir);
        }
        const parent = norm.substring(0, lastSlash);
        const name = norm.substring(lastSlash + 1);
        const copyName = computeCopyName(name, isDir);
        return `${parent}/${copyName}`;
    }

    /**
     * Muestra el modal de resolución de conflicto con las dos tarjetas comparativas y 3 botones.
     * Retorna una Promise que resuelve a: 'overwrite' | 'copy' | null
     */
    function showConflictModal({ action, targetType, isDir, name, copyName, source, target }) {
        return new Promise((resolve) => {
            let modal = document.getElementById('sync-conflict-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'sync-conflict-modal';
                modal.className = 'sync-conflict-modal-overlay';
                document.body.appendChild(modal);
            }

            const actionLabel = action === 'upload' ? 'Subir' : 'Descargar';
            const targetLabel = targetType === 'server' ? 'Servidor Central (S:)' : 'Google Drive';
            const typeLabel = isDir ? 'Carpeta' : 'Archivo';

            // Comparativas de fecha y peso
            let timeBadgeSource = '';
            let timeBadgeTarget = '';
            if (source.mtime && target.mtime) {
                const srcTime = new Date(source.mtime).getTime();
                const trgTime = new Date(target.mtime).getTime();
                if (srcTime > trgTime + 1000) {
                    timeBadgeSource = '<span class="conflict-badge badge-newer">Más reciente</span>';
                    timeBadgeTarget = '<span class="conflict-badge badge-older">Más antiguo</span>';
                } else if (trgTime > srcTime + 1000) {
                    timeBadgeTarget = '<span class="conflict-badge badge-newer">Más reciente</span>';
                    timeBadgeSource = '<span class="conflict-badge badge-older">Más antiguo</span>';
                }
            }

            let sizeBadgeSource = '';
            let sizeBadgeTarget = '';
            if (!isDir && source.size !== undefined && target.size !== undefined) {
                if (source.size > target.size) {
                    sizeBadgeSource = '<span class="conflict-badge badge-diff">Mayor tamaño</span>';
                } else if (target.size > source.size) {
                    sizeBadgeTarget = '<span class="conflict-badge badge-diff">Mayor tamaño</span>';
                }
            }

            const sourceSizeStr = isDir 
                ? (source.itemCount !== null && source.itemCount !== undefined ? `${source.itemCount} elementos` : 'Carpeta') 
                : `${formatBytes(source.size)} <span style="font-size:0.75rem; color:#666;">(${source.size.toLocaleString()} B)</span>`;

            const targetSizeStr = isDir 
                ? (target.itemCount !== null && target.itemCount !== undefined ? `${target.itemCount} elementos` : 'Carpeta') 
                : `${formatBytes(target.size)} <span style="font-size:0.75rem; color:#666;">(${target.size.toLocaleString()} B)</span>`;

            modal.innerHTML = `
                <div class="sync-conflict-dialog">
                    <div class="sync-conflict-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:1.3rem;">⚠️</span>
                            <div>
                                <h3 style="margin:0; font-size:1.05rem; color:#fff;">Confirmar Sobrescritura: ${actionLabel} a ${targetLabel}</h3>
                                <div style="font-size:0.75rem; color:#aaa; margin-top:2px;">
                                    El ${typeLabel.toLowerCase()} ya existe en el destino. Al continuar, la versión remota será reemplazada.
                                </div>
                            </div>
                        </div>
                        <button class="conflict-close-btn" id="conflictBtnClose">✕</button>
                    </div>

                    <div class="sync-conflict-body">
                        <div class="sync-conflict-cards">
                            <!-- Card 1: Origen -->
                            <div class="conflict-card card-source">
                                <div class="conflict-card-header">
                                    <span class="card-role-label">ORIGEN (${source.label})</span>
                                    ${timeBadgeSource}
                                </div>
                                <div class="conflict-card-name" title="${source.name}">${isDir ? '📁' : '📄'} ${source.name}</div>
                                <div class="conflict-prop-row">
                                    <span class="conflict-prop-k">Peso / Tamaño:</span>
                                    <span class="conflict-prop-v">${sourceSizeStr} ${sizeBadgeSource}</span>
                                </div>
                                <div class="conflict-prop-row">
                                    <span class="conflict-prop-k">Modificado:</span>
                                    <span class="conflict-prop-v">${formatDate(source.mtime)}</span>
                                </div>
                                <div class="conflict-prop-row">
                                    <span class="conflict-prop-k">Ruta:</span>
                                    <span class="conflict-prop-v conflict-path-mono" title="${source.path}">${source.path}</span>
                                </div>
                            </div>

                            <div class="conflict-vs-divider">
                                <span>➔</span>
                            </div>

                            <!-- Card 2: Destino (Se pisará) -->
                            <div class="conflict-card card-target">
                                <div class="conflict-card-header">
                                    <span class="card-role-label target-alert-label">DESTINO EXISTENTE (${target.label})</span>
                                    ${timeBadgeTarget}
                                </div>
                                <div class="conflict-card-name" title="${target.name}">${isDir ? '📁' : '📄'} ${target.name}</div>
                                <div class="conflict-prop-row">
                                    <span class="conflict-prop-k">Peso / Tamaño:</span>
                                    <span class="conflict-prop-v">${targetSizeStr} ${sizeBadgeTarget}</span>
                                </div>
                                <div class="conflict-prop-row">
                                    <span class="conflict-prop-k">Modificado:</span>
                                    <span class="conflict-prop-v">${formatDate(target.mtime)}</span>
                                </div>
                                <div class="conflict-prop-row">
                                    <span class="conflict-prop-k">Ruta:</span>
                                    <span class="conflict-prop-v conflict-path-mono" title="${target.path}">${target.path}</span>
                                </div>
                            </div>
                        </div>

                        <div class="conflict-warning-box">
                            <span>⚠️ <b>Atención:</b> Si eliges <b>Sobrescribir</b>, el contenido en el destino se pisará con la versión de origen. Para conservarlo, usa <b>Guardar como copia</b>.</span>
                        </div>
                    </div>

                    <div class="sync-conflict-footer">
                        <button class="conflict-btn btn-cancel" id="conflictBtnCancel">Cancelar</button>
                        <div style="display:flex; gap:8px;">
                            <button class="conflict-btn btn-copy" id="conflictBtnCopy" title="Guarda en destino con el sufijo '_copy'">
                                📋 Guardar como copia (<span style="font-family:monospace; font-weight:bold;">${copyName}</span>)
                            </button>
                            <button class="conflict-btn btn-overwrite" id="conflictBtnOverwrite" title="Pisar el archivo o carpeta existente">
                                ⚠️ Sobrescribir
                            </button>
                        </div>
                    </div>
                </div>
            `;

            modal.style.display = 'flex';

            const cleanup = (choice) => {
                modal.style.display = 'none';
                modal.innerHTML = '';
                resolve(choice);
            };

            document.getElementById('conflictBtnClose')?.addEventListener('click', () => cleanup(null));
            document.getElementById('conflictBtnCancel')?.addEventListener('click', () => cleanup(null));
            document.getElementById('conflictBtnOverwrite')?.addEventListener('click', () => cleanup('overwrite'));
            document.getElementById('conflictBtnCopy')?.addEventListener('click', () => cleanup('copy'));
        });
    }

    /**
     * Resuelve los datos de un elemento en el catálogo de Google Drive
     */
    function findDriveCatalogItem(localPath) {
        if (!localPath) return null;
        const norm = localPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        
        if (window.pipetaSyncCatalogLookup) {
            // 1. Buscar coincidencia exacta de archivo en índice
            const byLocal = window.pipetaSyncCatalogLookup.byLocalPath?.get(norm);
            if (byLocal) return byLocal;

            // 2. Si es una carpeta, comprobar si contiene hijos en el catálogo
            const children = window.pipetaSyncCatalogLookup.byParentLocalPath?.get(norm);
            if (children && children.length > 0) {
                const totalSize = children.reduce((acc, c) => acc + (c.size || 0), 0);
                const firstOnline = children[0].onlinePath || '';
                const lastSlash = firstOnline.lastIndexOf('/');
                const onlineFolder = lastSlash !== -1 ? firstOnline.substring(0, lastSlash) : null;
                return {
                    name: norm.split('/').pop(),
                    isDir: true,
                    isDirectory: true,
                    size: totalSize,
                    itemCount: children.length,
                    modTime: null,
                    onlinePath: onlineFolder,
                    targetLocalPath: localPath
                };
            }
            
            // 3. Búsqueda en lista plana como fallback
            if (window.pipetaSyncCatalog && Array.isArray(window.pipetaSyncCatalog.items)) {
                const found = window.pipetaSyncCatalog.items.find(i => {
                    const iLocal = (i.targetLocalPath || i.localPath || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
                    return iLocal === norm;
                });
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Ejecuta la acción de Subida o Bajada con verificación de colisiones y soporte de _copy
     */
    async function executeSyncAction({ action, targetType, path: itemPath, isDir, name }) {
        if (!itemPath) return;

        const proj = (typeof settings !== 'undefined' && settings?.currentProject?.name) ? settings.currentProject.name : 'surf_love';
        const typeLabel = isDir ? 'Carpeta' : 'Archivo';
        const normPath = itemPath.replace(/\\/g, '/');
        const itemName = name || normPath.split('/').pop();
        const copyName = computeCopyName(itemName, isDir);

        // Determinar rutas canónicas local (Z:) y server (Z:)
        let localPath = normPath;
        let serverPath = normPath;

        if (!normPath.toLowerCase().startsWith('z:')) {
            localPath = `Z:/${normPath.replace(/^\/+/, '')}`;
            serverPath = localPath;
        }

        // -------------------------------------------------------------
        // 1. RESOLVER ESTADÍSTICAS DE ORIGEN Y DESTINO
        // -------------------------------------------------------------
        let sourceInfo = null;
        let targetInfo = null;

        if (action === 'upload') {
            // ORIGEN = LOCAL (Z:)
            const localStat = await API.fs.stat(localPath);
            sourceInfo = {
                label: 'Tu PC Local (Z:)',
                name: itemName,
                path: localPath,
                size: localStat.size || 0,
                mtime: localStat.mtime || null,
                itemCount: localStat.itemCount,
                exists: localStat.exists
            };

            // DESTINO = SERVER O DRIVE
            if (targetType === 'server') {
                const serverStat = await API.fs.stat(serverPath);
                targetInfo = {
                    label: 'Servidor Central (S:)',
                    name: itemName,
                    path: serverPath,
                    size: serverStat.size || 0,
                    mtime: serverStat.mtime || null,
                    itemCount: serverStat.itemCount,
                    exists: serverStat.exists
                };
            } else if (targetType === 'drive') {
                const catItem = findDriveCatalogItem(localPath);
                const destOnlinePath = catItem?.onlinePath || `Google Drive (${proj})/${itemName}`;

                targetInfo = {
                    label: 'Google Drive (Nube)',
                    name: itemName,
                    path: destOnlinePath,
                    size: catItem ? (catItem.size || 0) : 0,
                    mtime: catItem ? (catItem.modTime || null) : null,
                    itemCount: catItem ? catItem.itemCount : null,
                    exists: !!catItem
                };
            }
        } else if (action === 'download') {
            // DESTINO = LOCAL (Z:)
            const localStat = await API.fs.stat(localPath);
            targetInfo = {
                label: 'Tu PC Local (Z:)',
                name: itemName,
                path: localPath,
                size: localStat.size || 0,
                mtime: localStat.mtime || null,
                itemCount: localStat.itemCount,
                exists: localStat.exists
            };

            // ORIGEN = SERVER O DRIVE
            if (targetType === 'server') {
                const serverStat = await API.fs.stat(serverPath);
                sourceInfo = {
                    label: 'Servidor Central (S:)',
                    name: itemName,
                    path: serverPath,
                    size: serverStat.size || 0,
                    mtime: serverStat.mtime || null,
                    itemCount: serverStat.itemCount,
                    exists: serverStat.exists
                };
            } else if (targetType === 'drive') {
                const catItem = findDriveCatalogItem(localPath);
                const srcOnlinePath = catItem?.onlinePath || `Google Drive (${proj})/${itemName}`;

                sourceInfo = {
                    label: 'Google Drive (Nube)',
                    name: itemName,
                    path: srcOnlinePath,
                    size: catItem ? (catItem.size || 0) : 0,
                    mtime: catItem ? (catItem.modTime || null) : null,
                    itemCount: catItem ? catItem.itemCount : null,
                    exists: !!catItem
                };
            }
        }

        // Validación de existencia del elemento de origen
        if (!sourceInfo || !sourceInfo.exists) {
            const err = `No se puede ${action === 'upload' ? 'subir' : 'descargar'} '${itemName}': el origen (${sourceInfo?.label || 'desconocido'}) no existe físicamente.`;
            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast(err, 'error', 5);
            } else {
                alert(`❌ ${err}`);
            }
            return;
        }

        // -------------------------------------------------------------
        // 2. VERIFICACIÓN DE CONFLICTO
        // -------------------------------------------------------------
        let chosenMode = 'overwrite'; // Por defecto si no existe en destino

        if (targetInfo && targetInfo.exists) {
            // El destino YA EXISTE: Abrir Modal de Resolución de Conflicto
            const decision = await showConflictModal({
                action,
                targetType,
                isDir,
                name: itemName,
                copyName,
                source: sourceInfo,
                target: targetInfo
            });

            if (!decision) {
                // El usuario canceló la operación
                return;
            }
            chosenMode = decision; // 'overwrite' o 'copy'
        }

        // -------------------------------------------------------------
        // 3. EJECUCIÓN DE LA TRANSFERENCIA
        // -------------------------------------------------------------
        const isCopy = (chosenMode === 'copy');

        if (targetType === 'server') {
            // ==================== OPERACIÓN SERVER (LAN COPY) ====================
            let src = action === 'upload' ? localPath : serverPath;
            let dest = action === 'upload' ? serverPath : localPath;

            if (isCopy) {
                dest = computeCopyPath(dest, isDir);
            }

            const actionTitle = action === 'upload' 
                ? `Subiendo a Server Central${isCopy ? ' (como copia)' : ''}...` 
                : `Descargando desde Server Central${isCopy ? ' (como copia)' : ''}...`;

            if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                settings.showToast(actionTitle, 'info', 10);
            }

            try {
                const res = await fetch('/api/fs/copy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ src, dest, action: action === 'upload' ? 'upload_server' : 'download_server' })
                }).then(r => r.json());

                if (res && res.success) {
                    const finalMsg = action === 'upload' 
                        ? `✅ Subido a Servidor: ${isCopy ? copyName : itemName}` 
                        : `✅ Descargado de Servidor: ${isCopy ? copyName : itemName}`;
                    if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                        settings.showToast(finalMsg, 'success', 4, `Guardado en: ${dest}`);
                    }
                    if (typeof PipetaConsole !== 'undefined') {
                        PipetaConsole.log('sync', `✓ Copia Server LAN (${action.toUpperCase()}${isCopy ? ' COPY' : ''}): ${src} ➔ ${dest}`, 'ok');
                    }
                    if (typeof refreshCurrentView === 'function') refreshCurrentView();
                } else {
                    alert(`❌ Error en copia de Server: ${res.error || 'Error desconocido'}`);
                }
            } catch (err) {
                alert(`❌ Error de conexión al Servidor LAN: ${err.message}`);
            }

        } else if (targetType === 'drive') {
            // ==================== OPERACIÓN GOOGLE DRIVE (WORKER) ====================
            const endpoint = action === 'upload' ? '/api/sync/request-upload' : '/api/sync/request-download';
            const catItem = findDriveCatalogItem(localPath);

            let payloadItem = {};
            if (action === 'upload') {
                let onlineTarget = catItem?.onlinePath || null;
                if (isCopy && onlineTarget) {
                    onlineTarget = computeCopyPath(onlineTarget, isDir);
                }
                payloadItem = {
                    name: isCopy ? copyName : itemName,
                    isDir: isDir,
                    localPath: localPath,
                    onlinePath: onlineTarget,
                    size: sourceInfo?.size || 0
                };
            } else {
                // Download
                let destLocal = localPath;
                if (isCopy) {
                    destLocal = computeCopyPath(destLocal, isDir);
                }
                payloadItem = {
                    name: isCopy ? copyName : itemName,
                    isDir: isDir,
                    relativePath: catItem?.relativePath || itemName,
                    onlinePath: catItem?.onlinePath || null,
                    targetLocalPath: destLocal,
                    size: sourceInfo?.size || 0
                };
            }

            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        project: proj,
                        user: (typeof getPipetaCurrentUser === 'function') ? getPipetaCurrentUser() : 'artista',
                        items: [payloadItem]
                    })
                }).then(r => r.json());

                if (res && res.success) {
                    const toastMsg = `Orden de ${action === 'upload' ? 'subida' : 'descarga'} #${res.orderId.slice(-6)} encolada para: ${isCopy ? copyName : itemName}`;
                    if (typeof settings !== 'undefined' && typeof settings.showToast === 'function') {
                        settings.showToast(toastMsg, 'success', 4, isCopy ? `Guardando como copia '${copyName}'` : 'Sobrescribiendo');
                    } else {
                        alert(`✅ ${toastMsg}`);
                    }
                    if (window.syncQueueUI) {
                        window.syncQueueUI.fetchStatus();
                        window.syncQueueUI.open();
                    }
                    if (typeof PipetaConsole !== 'undefined') {
                        PipetaConsole.log('sync', `[${action.toUpperCase()} DRIVE${isCopy ? ' COPY' : ''}] Orden #${res.orderId.slice(-6)}: ${isCopy ? copyName : itemName}`, 'pending');
                    }
                } else {
                    alert(`❌ Error al encolar orden: ${res.error}`);
                }
            } catch (err) {
                alert(`❌ Error de conexión al encolar orden: ${err.message}`);
            }
        }
    }

    // Exponer al scope global de Pipeta
    window.SyncConflict = {
        showConflictModal,
        computeCopyName,
        computeCopyPath,
        executeSyncAction
    };

})(window);
