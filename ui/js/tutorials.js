// ------------------------------------------------------------
// --- TUTORIALS MODULE (GUÍAS DE USO DE PIPETA PIPELINE) ---
// ------------------------------------------------------------

const Tutorials = {

    tutorials: [
        {
            id: 'explorer',
            icon: 'icons/view_classic.svg',
            title: 'Explorer & Navegación',
            subtitle: 'Árbol Work/Media, ubicaciones y sincronización',
            color: '#FF9800',
            requiredPerm: 'access_explorer',
            content: `
                <h2 style="margin-top:0; color:#FF9800;">Explorer & Navegación</h2>
                <p style="color:#cbd5e1; line-height:1.7;">El <b>Explorer</b> es la vista principal para recorrer proyectos, revisar qué archivos tenés en tu disco local frente a Google Drive o el servidor del estudio, y descargar o subir material sin salir de la estructura oficial.</p>

                <h3 style="color:#FF9800; border-bottom:1px solid #262f3f; padding-bottom:6px;">1. Estructura de la Pantalla (Split Work / Media)</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <ul style="padding-left:18px; color:#cbd5e1; line-height:1.85; margin:0; font-size:0.88rem;">
                        <li><b style="color:#fff;">Panel Superior — Proyecto (Work):</b> Muestra las carpetas de trabajo donde se guardan escenas y scripts (<code>.nk</code>, <code>.ma</code>, <code>.hip</code>, <code>.blend</code>).</li>
                        <li><b style="color:#fff;">Panel Inferior — Media:</b> Muestra plates, renders (<code>FullRes</code>, <code>Prerender</code>), material de <code>IA/</code> y salidas consolidadas.</li>
                        <li><b style="color:#fff;">Selección en paralelo:</b> Al navegar un episodio, secuencia o shot en un panel, podés ver rápidamente su contraparte en el otro para verificar que no falten carpetas ni renders.</li>
                    </ul>
                </div>

                <h3 style="color:#FF9800; border-bottom:1px solid #262f3f; padding-bottom:6px;">2. Selector de Ubicación (Local / Drive / Server)</h3>
                <p style="color:#94a3b8; font-size:0.86rem; margin-top:0;">En la barra superior elegís desde dónde querés ver el árbol de carpetas:</p>
                <table style="width:100%; border-collapse:collapse; margin-bottom:18px; font-size:0.87rem;">
                    <tr style="border-bottom:1px solid #262f3f;">
                        <td style="padding:9px 8px; color:#FF9800; font-weight:bold; width:110px;">Local</td>
                        <td style="padding:9px 8px; color:#cbd5e1;">Muestra únicamente lo que ya existe físicamente en tu disco local (<code>Z:</code>). Es lo que ven tus programas (Nuke, Maya, Houdini, Blender).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #262f3f;">
                        <td style="padding:9px 8px; color:#38bdf8; font-weight:bold;">Drive</td>
                        <td style="padding:9px 8px; color:#cbd5e1;">Muestra el catálogo completo del proyecto en Google Drive, aunque todavía no lo hayas bajado a tu disco. Sirve para buscar plates o escenas remotas y descargarlas.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #262f3f;">
                        <td style="padding:9px 8px; color:#c084fc; font-weight:bold;">Server</td>
                        <td style="padding:9px 8px; color:#cbd5e1;">Explora directamente el almacenamiento central del estudio por red local (no disponible en puestos externos o modo Freelance).</td>
                    </tr>
                </table>

                <h3 style="color:#FF9800; border-bottom:1px solid #262f3f; padding-bottom:6px;">3. Comparación y Descarga / Subida Paso a Paso</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <ol style="padding-left:18px; color:#cbd5e1; line-height:1.9; margin:0; font-size:0.88rem;">
                        <li>Seleccioná el proyecto en el selector superior.</li>
                        <li>Activá la comparación contra <b>Drive</b> (o <b>Server</b> si estás en el estudio) para ver qué archivos faltan o cambiaron.</li>
                        <li>Interpretá los colores de estado:
                            <ul style="list-style:none; padding-left:12px; margin:6px 0; line-height:1.8; font-size:0.85rem; color:#94a3b8;">
                                <li><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e; margin-right:8px;"></span><b style="color:#e2e8f0;">Verde:</b> El archivo/carpeta coincide entre tu disco local y el remoto.</li>
                                <li><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#eab308; margin-right:8px;"></span><b style="color:#e2e8f0;">Amarillo:</b> Hay diferencias de peso o fecha (una de las dos copias es más nueva o distinta).</li>
                                <li><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#64748b; margin-right:8px;"></span><b style="color:#e2e8f0;">Gris / Fantasma:</b> Existe en Drive/Server pero todavía no lo descargaste a tu PC.</li>
                            </ul>
                        </li>
                        <li>Hacé <b>clic derecho</b> sobre la carpeta o archivo que necesitás y elegí <b>Bajar de Google Drive</b> (o <b>Subir a Google Drive</b> si estás entregando avances).</li>
                        <li>Revisá las rutas completas en el modal de confirmación y aceptá para enviarlo a la cola de <b>Sync Queue</b>.</li>
                    </ol>
                </div>

                <div style="background:#1c1917; padding:12px 14px; border-radius:8px; border-left:4px solid #FF9800; font-size:0.85rem; color:#e7e5e4;">
                    <b>Buenas prácticas:</b> Antes de empezar a trabajar un plano, compará contra Drive para asegurarte de no estar trabajando sobre un plate o script viejo. Evitá crear carpetas con nombres improvisados fuera de la estructura del shot.
                </div>
            `
        },
        {
            id: 'sync-queue',
            icon: 'icons/sync-analyzer.svg',
            title: 'Sync Queue & Transferencias',
            subtitle: 'Cola de descargas, subidas y Worker',
            color: '#FFB300',
            requiredPerm: 'access_explorer',
            content: `
                <h2 style="margin-top:0; color:#FFB300;">Sync Queue & Transferencias</h2>
                <p style="color:#cbd5e1; line-height:1.7;"><b>Sync Queue</b> gestiona en segundo plano todas las órdenes de descarga y subida que enviás desde el Explorer o desde File Auditor. Podés seguir usando Pipeta o tus programas mientras transfiere.</p>

                <h3 style="color:#FFB300; border-bottom:1px solid #262f3f; padding-bottom:6px;">1. Qué significa el encabezado (Worker Local vs Central)</h3>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px; margin-bottom:18px;">
                    <div style="background:#141821; padding:14px; border-radius:8px; border:1px solid #262f3f;">
                        <h4 style="color:#4ade80; margin:0 0 6px 0; font-size:0.9rem;">Worker Local (Externos / Freelance)</h4>
                        <p style="color:#94a3b8; font-size:0.84rem; line-height:1.6; margin:0;">Tu propia PC ejecuta las transferencias directo contra <b>Google Drive</b> mediante Rclone. No intenta conectarse a servidores internos.</p>
                    </div>
                    <div style="background:#141821; padding:14px; border-radius:8px; border:1px solid #262f3f;">
                        <h4 style="color:#38bdf8; margin:0 0 6px 0; font-size:0.9rem;">Worker Central (Dentro del Estudio)</h4>
                        <p style="color:#94a3b8; font-size:0.84rem; line-height:1.6; margin:0;">Coordina descargas/subidas con el servidor central del estudio aprovechando copias rápidas por red local (LAN) cuando el material ya está cacheado en el servidor.</p>
                    </div>
                </div>

                <h3 style="color:#FFB300; border-bottom:1px solid #262f3f; padding-bottom:6px;">2. Cómo operar la ventana de Sync Queue</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <ol style="padding-left:18px; color:#cbd5e1; line-height:1.9; margin:0; font-size:0.88rem;">
                        <li><b>Abrí la ventana</b> haciendo clic en el botón de Sync Queue en la barra lateral izquierda (se puede acoplar al costado o dejar flotante).</li>
                        <li>En la pestaña <b>En Curso & Pendientes</b> ves cada orden con su origen, destino, velocidad (<code>MB/s</code>), porcentaje, archivo actual y tiempo estimado restante.</li>
                        <li>Si enviaste una carpeta equivocada, tocá <b>Cancelar</b> en esa tarjeta puntual o <b>Cancelar Todo</b> arriba a la derecha.</li>
                        <li>En la pestaña <b>Historial Reciente</b> podés comprobar qué descargas/subidas terminaron bien o ver el motivo si alguna dio error.</li>
                    </ol>
                </div>

                <div style="background:#172030; padding:12px 14px; border-radius:8px; border-left:4px solid #FFB300; font-size:0.85rem; color:#cbd5e1;">
                    <b>Nota sobre el indicador de la barra:</b> El punto verde indica que hay una transferencia activa en curso; el punto gris indica que la cola está libre; el número naranja muestra cuántas órdenes quedan pendientes.
                </div>
            `
        },
        {
            id: 'file-auditor',
            icon: 'icons/file-auditor.svg',
            title: 'File Auditor & Mirror',
            subtitle: 'Auditoría de carpetas, escenas y renders',
            color: '#AB47BC',
            requiredPerm: 'access_tool_file_auditor',
            content: `
                <h2 style="margin-top:0; color:#AB47BC;">File Auditor & Mirror</h2>
                <p style="color:#cbd5e1; line-height:1.7;">El <b>File Auditor</b> revisa en segundos la salud completa de un proyecto o de una selección de planos: si coinciden las carpetas entre Proyecto y Media, si existen escenas editables bien nombradas y si los renders están al día respecto a la última versión del script.</p>

                <h3 style="color:#AB47BC; border-bottom:1px solid #262f3f; padding-bottom:6px;">Controles comunes en las 3 pestañas</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <ul style="padding-left:18px; color:#cbd5e1; line-height:1.85; margin:0; font-size:0.87rem;">
                        <li><b>Scan All:</b> Escanea todo el proyecto activo.</li>
                        <li><b>Scan Selection:</b> Escanea únicamente lo que tenés seleccionado o abierto actualmente en el Explorer (mucho más rápido para revisar un shot puntual).</li>
                        <li><b>Botón Ramón:</b> Filtra los resultados para mostrar solo tus tareas/planos asignados en Ramón.</li>
                        <li><b>Botón Drive:</b> Incluye comparación contra el catálogo de Google Drive (útil para detectar escenas o renders que están en la nube pero no en tu disco).</li>
                        <li><b>Maximizar (doble clic en la barra superior):</b> Expande el auditor a pantalla completa para trabajar cómodo con tablas grandes.</li>
                    </ul>
                </div>

                <h3 style="color:#AB47BC; border-bottom:1px solid #262f3f; padding-bottom:6px;">Pestaña 1: Folder Status (Carpetas Work ↔ Media)</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <p style="color:#cbd5e1; font-size:0.87rem; margin-top:0;">Verifica que cada plano o asset existente en <b>Proyecto (Work)</b> tenga su carpeta espejo completa en <b>Media</b> y viceversa.</p>
                    <ol style="padding-left:18px; color:#cbd5e1; line-height:1.85; font-size:0.86rem; margin-bottom:10px;">
                        <li>Ejecutá <b>Scan All</b> o <b>Scan Selection</b>.</li>
                        <li>Usá los filtros superiores para aislar problemas: <b>Falta en Media</b> (rojo), <b>Falta en Proyecto</b> (azul), <b>Incompletos</b> (amarillo) u <b>OK</b> (verde).</li>
                        <li>Marcá los elementos que quieras corregir (o usá <b>Seleccionar todo</b>), elegí abajo si querés reparar carpetas en <b>Proyecto</b>, <b>Media</b> o ambos, y tocá <b>Fix</b>. Esto crea las carpetas faltantes sin borrar ni pisar archivos existentes.</li>
                    </ol>
                </div>

                <h3 style="color:#AB47BC; border-bottom:1px solid #262f3f; padding-bottom:6px;">Pestaña 2: Scene Status (Escenas Editables)</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <p style="color:#cbd5e1; font-size:0.87rem; margin-top:0;">Inspecciona los archivos editables (<code>.nk</code>, <code>.hip</code>, <code>.blend</code>, etc.) por departamento (por defecto <b>compo</b>, o podés cambiarlo a <b>Todos los procesos</b>).</p>
                    <ul style="padding-left:18px; color:#cbd5e1; line-height:1.85; font-size:0.86rem; margin-bottom:10px;">
                        <li><b>Filtros:</b> <i>Con Escena</i> (verde), <i>Nombre Incorrecto</i> (naranja: el archivo no respeta la nomenclatura del shot) y <i>Sin Escena Local</i> (rojo).</li>
                        <li><b>Sincronización directa con Drive:</b> Si activaste el botón <b>Drive</b> y hay escenas que existen en la nube (o escenas locales nuevas para subir), marcá los ítems, tildá abajo <b>Download scenes</b> o <b>Upload scenes</b> y tocá <b>Fix</b> para encolarlas directo en Sync Queue.</li>
                    </ul>
                </div>

                <h3 style="color:#AB47BC; border-bottom:1px solid #262f3f; padding-bottom:6px;">Pestaña 3: Render Status (Renders vs Scripts)</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <p style="color:#cbd5e1; font-size:0.87rem; margin-top:0;">Cruza la versión más reciente de cada escena en Work contra las secuencias y videos renderizados en Media.</p>
                    <ul style="padding-left:18px; color:#cbd5e1; line-height:1.85; font-size:0.86rem; margin-bottom:10px;">
                        <li><b>Opciones de alcance:</b> Podés elegir qué revisar con los casilleros <b>FullRes</b>, <b>.mov (compresion)</b>, <b>Solo última versión</b>, <b>Omitir v001 y v000</b> y <b>Prerender</b>.</li>
                        <li><b>Deep Compare:</b> Activalo cuando necesites una inspección profunda frame por frame para detectar huecos en secuencias de imágenes.</li>
                        <li><b>Filtros de diagnóstico:</b>
                            <ul style="padding-left:16px; margin-top:4px; line-height:1.75; color:#94a3b8;">
                                <li><b>Al Día:</b> La última escena tiene su render completo correspondiente.</li>
                                <li><b>Gaps / Incompleto:</b> Faltan frames intermedios o la secuencia está cortada.</li>
                                <li><b>Desactualizado:</b> La escena tiene una versión más nueva que el último render en Media (hay que re-renderizar).</li>
                                <li><b>Nombre Incorrecto:</b> La carpeta o archivo de render no coincide con el canon del plano.</li>
                                <li><b>Sin Render:</b> Existe escena pero no hay salida renderizada.</li>
                                <li><b>Render Sin Escena:</b> Hay un render en Media pero no se encontró el archivo editable origen.</li>
                                <li><b>Drive Diff:</b> El estado local difiere de lo que está subido en Google Drive.</li>
                            </ul>
                        </li>
                    </ul>
                </div>
            `
        },
        {
            id: 'naming-validator',
            icon: 'icons/scanning-scan-svgrepo-com.svg',
            title: 'Naming Validator',
            subtitle: 'Detección y limpieza de caracteres inválidos',
            color: '#8BC34A',
            requiredPerm: 'access_tool_naming_validator',
            content: `
                <h2 style="margin-top:0; color:#8BC34A;">Naming Validator (Limpieza de Nombres)</h2>
                <p style="color:#cbd5e1; line-height:1.7;">El <b>Naming Validator</b> busca archivos y carpetas en disco que tengan caracteres problemáticos (espacios, acentos, eñes o símbolos especiales) que suelen romper renders en granja, scripts de Nuke o sincronizaciones en la nube, y te permite renombrarlos en lote con vista previa segura.</p>

                <h3 style="color:#8BC34A; border-bottom:1px solid #262f3f; padding-bottom:6px;">Cómo usarlo paso a paso</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <ol style="padding-left:18px; color:#cbd5e1; line-height:1.9; margin:0; font-size:0.88rem;">
                        <li><b style="color:#fff;">Definí qué buscar:</b> Marcá si querés revisar <b>Archivos</b>, <b>Carpetas</b> o ambos, y qué reglas aplicar: <i>Espacios en blanco</i>, <i>Acentos (á Á ë Ë)</i>, <i>Ñ (eñes)</i> y <i>Caracteres Especiales ($!/?*#@&)</i>.</li>
                        <li><b style="color:#fff;">Ejecutá el escaneo:</b> Tocá <b>Scan ALL</b> para revisar todo el proyecto o <b>Scan Selection</b> para revisar únicamente la carpeta seleccionada en el Explorer.</li>
                        <li><b style="color:#fff;">Revisá la tabla ORIGINAL → PREVIEW:</b> A la izquierda ves el nombre actual con error y a la derecha cómo quedaría corregido automáticamente. Con el botón <b>Ir</b> podés saltar a la carpeta en el Explorer antes de tocar nada.</li>
                        <li><b style="color:#fff;">Aplicá la corrección:</b> Marcá las filas que quieras corregir y tocá <b>Fix Selection</b>, o usá <b>Fix ALL</b> para renombrar todo el listado de una vez (previa confirmación).</li>
                    </ol>
                </div>

                <div style="background:#142117; padding:12px 14px; border-radius:8px; border-left:4px solid #8BC34A; font-size:0.85rem; color:#d9f99d;">
                    <b>Cuándo pasarlo:</b> Siempre que recibas material externo de un cliente o antes de subir una carpeta nueva a Google Drive, para evitar errores de rutas con espacios o tildes.
                </div>
            `
        },
        {
            id: 'ramon-tasks',
            icon: 'icons/ramon.png',
            title: 'Ramón (TACTIC) & Mis Tareas',
            subtitle: 'Login, panel de tareas y salto directo al plano',
            color: '#00E5FF',
            content: `
                <h2 style="margin-top:0; color:#00E5FF;">Ramón (TACTIC) & Mis Tareas</h2>
                <p style="color:#cbd5e1; line-height:1.7;">Pipeta se conecta en modo <b>solo lectura</b> con el sistema central de producción <b>Ramón</b> para mostrarte exactamente qué planos tenés asignados, en qué estado están y qué notas dejó supervisión.</p>

                <h3 style="color:#00E5FF; border-bottom:1px solid #262f3f; padding-bottom:6px;">Cómo trabajar con Mis Tareas</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <ol style="padding-left:18px; color:#cbd5e1; line-height:1.9; margin:0; font-size:0.88rem;">
                        <li><b style="color:#fff;">Iniciá sesión:</b> En el selector de usuario arriba a la derecha elegí tu usuario de dominio/Ramón (ej. <code>lasp-...</code>).</li>
                        <li><b style="color:#fff;">Abrí el panel de Ramón:</b> Hacé clic en el ícono de Ramón en la barra lateral izquierda para desplegar la ventana flotante con tus asignaciones agrupadas por proyecto y proceso.</li>
                        <li><b style="color:#fff;">Saltá al plano:</b> Hacé clic sobre cualquier tarea para ubicar y abrir automáticamente ese shot en el <b>Explorer</b> (o en <b>Shot Navigator</b> si lo tenés habilitado).</li>
                        <li><b style="color:#fff;">Refrescá cuando haga falta:</b> Usá el botón de actualizar dentro del panel cuando producción te avise que cargó tareas nuevas.</li>
                    </ol>
                </div>

                <div style="background:#261618; padding:12px 14px; border-radius:8px; border-left:4px solid #f44336; font-size:0.85rem; color:#fecaca;">
                    <b>Regla de solo lectura:</b> Pipeta nunca modifica, inserta ni borra datos en Ramón. Los cambios de estado oficiales siguen cargándose en Ramón web.
                </div>
            `
        },
        {
            id: 'shot-navigator',
            icon: 'icons/video_camera_back.svg',
            title: 'Shot Navigator & Ramón',
            subtitle: 'Seguimiento de planos, procesos y estados',
            color: '#2196F3',
            requiredPerm: 'access_shot_navigator',
            content: `
                <h2 style="margin-top:0; color:#2196F3;">Shot Navigator & Tracking de Planos</h2>
                <p style="color:#cbd5e1; line-height:1.7;">El <b>Shot Navigator</b> reúne en una sola vista todos los episodios, secuencias y planos del proyecto junto con sus procesos (Compo, 3D, IA, Tracking, Roto) y su estado sincronizado desde <b>Ramón</b>.</p>

                <h3 style="color:#2196F3; border-bottom:1px solid #262f3f; padding-bottom:6px;">Cómo navegar y filtrar</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <ol style="padding-left:18px; color:#cbd5e1; line-height:1.9; margin:0; font-size:0.88rem;">
                        <li><b style="color:#fff;">Panel izquierdo (Episodios y Secuencias):</b> Elegí un episodio o secuencia para ver el porcentaje de planos aprobados vs totales.</li>
                        <li><b style="color:#fff;">Tabla central (Planos y Procesos):</b> Hacé clic en el botón expandir (<code>+</code>) de un plano para desplegar sus sub-filas por departamento y ver quién tiene asignada cada etapa.</li>
                        <li><b style="color:#fff;">Inspector derecho:</b> Muestra el código de Ramón, rango de frames In/Out, notas técnicas y artistas asignados.</li>
                        <li><b style="color:#fff;">Filtro Mis Tareas & Sincronizar:</b> En la barra superior, activá el filtro de usuario de Ramón para dejar únicamente tus planos, o tocá <b>Sincronizar Ramón</b> para traer los últimos cambios de producción.</li>
                    </ol>
                </div>

                <h3 style="color:#2196F3; border-bottom:1px solid #262f3f; padding-bottom:6px;">Modos de Estado Root (Cálculo de Color del Shot)</h3>
                <ul style="padding-left:18px; line-height:1.9; color:#cbd5e1; font-size:0.88rem;">
                    <li><b style="color:#fff;">Automático (Recomendado):</b> Calcula el estado general según los procesos hijos (si un proceso está en <i>Ajustar</i> o <i>Revisar</i>, el plano lo refleja inmediatamente).</li>
                    <li><b style="color:#fff;">General (Manual):</b> Toma el estado global asignado al shot sin promediar procesos.</li>
                    <li><b style="color:#fff;">Por Proceso:</b> Muestra el estado de un departamento específico (ej. solo <code>Compo</code> o solo <code>IA</code>).</li>
                </ul>
            `
        },
        {
            id: 'ia-ingest',
            icon: 'icons/chip-ai.svg',
            title: 'IA Ingest & Nomenclatura',
            subtitle: 'Renombrado canónico, carpeta IA/ y Nuke',
            color: '#4CAF50',
            requiredPerm: 'access_ia_ingest',
            content: `
                <h2 style="margin-top:0; color:#4CAF50;">IA Ingest & Canon de Nomenclatura VFX</h2>
                <p style="color:#cbd5e1; line-height:1.7;"><b>IA Ingest</b> toma los videos o imágenes descargados de plataformas de IA (Seedance, Google Veo, Nano Banana, Higgsfield), les arma automáticamente el nombre oficial del estudio y los deposita en la subcarpeta correcta dentro de <code>Media/.../IA/</code>.</p>

                <h3 style="color:#4CAF50; border-bottom:1px solid #262f3f; padding-bottom:6px;">1. Cómo ingestar material paso a paso</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f; margin-bottom:18px;">
                    <ol style="padding-left:18px; color:#cbd5e1; line-height:1.9; margin:0; font-size:0.88rem;">
                        <li><b style="color:#fff;">Elegí el Target (1. TARGET):</b> Seleccioná Proyecto, Episodio, Secuencia y Shot (podés usar el filtro de Ramón para ver solo tus planos, o hacer clic derecho en el Explorer → <b>Send2 IA Ingest</b> para precargar el plano directo).</li>
                        <li><b style="color:#fff;">Configurá el Name Builder:</b> Seleccioná Motor (<code>SD2</code>, <code>VEO</code>, etc.), Resolución, Framing y Tag/Role. El módulo calcula automáticamente la siguiente versión (<code>v001</code>, <code>v002</code>...) leyendo lo que ya existe en el plano.</li>
                        <li><b style="color:#fff;">Cargá los archivos:</b> Arrastrá los archivos a la Dropzone, pegá desde el portapapeles o activá el <b>Watcher de Descargas</b> para capturar automáticamente lo que bajás desde Chrome.</li>
                        <li><b style="color:#fff;">Ejecutá la ingesta:</b> Verificá la vista previa del nombre final en la cola y confirmá para copiar/renombrar en disco (y opcionalmente convertir a secuencia PNG en <code>IA/enc/</code>).</li>
                    </ol>
                </div>

                <h3 style="color:#4CAF50; border-bottom:1px solid #262f3f; padding-bottom:6px;">2. Canon Oficial y Estructura de <code>IA/</code></h3>
                <div style="background:#0f1419; padding:11px 14px; border-radius:8px; font-family:monospace; color:#86efac; font-size:0.88rem; margin-bottom:10px; border:1px solid #262f3f;">
                    [SHOT_ID]_[MOTOR]_[RESOLUCIÓN]_[FRAMING]_[TAG/ROLE]_v[VERSIÓN].[EXT]
                </div>
                <table style="width:100%; border-collapse:collapse; margin-bottom:18px; font-size:0.86rem;">
                    <tr style="border-bottom:1px solid #262f3f;"><td style="padding:8px; color:#4CAF50; font-weight:bold; width:140px;">IA/ (Root)</td><td style="padding:8px; color:#cbd5e1;">Descargas brutas en progreso (WIP).</td></tr>
                    <tr style="border-bottom:1px solid #262f3f;"><td style="padding:8px; color:#4CAF50; font-weight:bold;">IA/export/</td><td style="padding:8px; color:#cbd5e1;">Versiones consolidadas listas para Compo.</td></tr>
                    <tr style="border-bottom:1px solid #262f3f;"><td style="padding:8px; color:#4CAF50; font-weight:bold;">IA/ref/</td><td style="padding:8px; color:#cbd5e1;">Referencias y start/end frames.</td></tr>
                    <tr style="border-bottom:1px solid #262f3f;"><td style="padding:8px; color:#4CAF50; font-weight:bold;">IA/enc/</td><td style="padding:8px; color:#cbd5e1;">Secuencias PNG a 24 fps listas para leer en Nuke.</td></tr>
                </table>

                <h3 style="color:#4CAF50; border-bottom:1px solid #262f3f; padding-bottom:6px;">3. Regla de Exportación desde Nuke (<code>exportIA</code>)</h3>
                <ul style="padding-left:18px; color:#cbd5e1; line-height:1.85; font-size:0.86rem;">
                    <li><b style="color:#fff;">Color:</b> Exportar secuencia PNG en <b>RAW</b> con un nodo previo <b>OcioDisplay</b> para hornear la vista correcta.</li>
                    <li><b style="color:#fff;">Duración mínima:</b> Para generación de video (ej. Seedance), exportar mínimo <b>96 frames (4s a 24 fps)</b> haciendo hold del último frame si el shot dura menos.</li>
                </ul>
            `
        },
        {
            id: 'creator',
            icon: 'icons/asset_creator.svg',
            title: 'Creator (Shots & Assets)',
            subtitle: 'Creación guiada de carpetas en disco',
            color: '#9C27B0',
            requiredPerms: ['access_tool_asset_creator', 'access_tool_shot_creator'],
            content: `
                <h2 style="margin-top:0; color:#9C27B0;">Creator: Shots & Assets</h2>
                <p style="color:#cbd5e1; line-height:1.7;">El <b>Creator</b> genera físicamente en <b>Work</b> y <b>Media</b> las carpetas oficiales de nuevos planos o assets usando las plantillas configuradas en el proyecto, evitando errores manuales de escritura.</p>

                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:12px; margin-top:14px;">
                    <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f;">
                        <h4 style="color:#e9d5ff; margin:0 0 8px 0;">Cómo crear un Shot nuevo</h4>
                        <ol style="padding-left:18px; color:#cbd5e1; line-height:1.85; font-size:0.85rem; margin:0;">
                            <li>Elegí Episodio y Secuencia en los selectores superiores.</li>
                            <li>Escribí el número de plano (ej. <code>1130</code>) o usá <b>+1 / +10</b> para numerar correlativos en serie.</li>
                            <li>Marcá los procesos que necesita el shot (Compo, 3D, IA, etc.).</li>
                            <li>Revisá el resumen en el modal de confirmación y ejecutá la creación en lote.</li>
                        </ol>
                    </div>
                    <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f;">
                        <h4 style="color:#e9d5ff; margin:0 0 8px 0;">Cómo crear o ampliar un Asset</h4>
                        <ol style="padding-left:18px; color:#cbd5e1; line-height:1.85; font-size:0.85rem; margin:0;">
                            <li>Elegí categoría (Character, Prop, Set, etc.) y nombre del asset.</li>
                            <li>Para un asset nuevo, seleccioná sus procesos iniciales y crealo.</li>
                            <li>Para agregar un proceso a assets que ya existen, usá el modo de inyección en lote: agrega solo las carpetas nuevas sin borrar ni pisar archivos previos.</li>
                        </ol>
                    </div>
                </div>
            `
        },
        {
            id: 'designers',
            icon: 'icons/design_shots.svg',
            title: 'Shot & Asset Designers',
            subtitle: 'Plantillas nodales y variables de carpetas',
            color: '#E91E63',
            requiredPerms: ['access_asset_designer', 'access_shot_designer'],
            content: `
                <h2 style="margin-top:0; color:#E91E63;">Shot & Asset Designers</h2>
                <p style="color:#cbd5e1; line-height:1.7;">Los <b>Designers</b> son editores nodales reservados para supervisión/pipeline. Definen qué estructura de carpetas y subcarpetas va a generar automáticamente el <b>Creator</b> y qué va a auditar el <b>File Auditor</b>.</p>

                <h3 style="color:#E91E63; border-bottom:1px solid #262f3f; padding-bottom:6px;">Variables Dinámicas del Constructor</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:16px; font-size:0.86rem;">
                    <tr style="border-bottom:1px solid #262f3f;"><td style="padding:8px; color:#E91E63; font-weight:bold; width:150px;">[NICK]</td><td style="padding:8px; color:#cbd5e1;">Tag corto del proyecto (ej. <code>SURF</code>).</td></tr>
                    <tr style="border-bottom:1px solid #262f3f;"><td style="padding:8px; color:#E91E63; font-weight:bold;">[EP] / [SEQ]</td><td style="padding:8px; color:#cbd5e1;">Episodio y secuencia seleccionados al crear el plano.</td></tr>
                    <tr style="border-bottom:1px solid #262f3f;"><td style="padding:8px; color:#E91E63; font-weight:bold;">[SHOT]</td><td style="padding:8px; color:#cbd5e1;">Número ingresado por el operador (ej. <code>0020</code>).</td></tr>
                    <tr style="border-bottom:1px solid #262f3f;"><td style="padding:8px; color:#E91E63; font-weight:bold;">[SHOTNAME]</td><td style="padding:8px; color:#cbd5e1;">Nombre completo ensamblado (ej. <code>SURF_B01_003_0020</code>).</td></tr>
                </table>

                <div style="background:#141821; padding:12px 14px; border-radius:8px; border:1px solid #262f3f; font-size:0.85rem; color:#cbd5e1;">
                    <b>Conexiones Mirror (Work ↔ Media):</b> Cada nodo de trabajo puede vincularse a su rama espejo de Media para garantizar que al crear un shot se generen en paralelo sus carpetas de renders (<code>FullRes</code>, <code>Prerender</code>, <code>IA</code>).
                </div>
            `
        },
        {
            id: 'config-project',
            icon: 'icons/settings.svg',
            title: 'Configurar Proyectos & Export',
            subtitle: 'Rutas, presets y empaquetado Freelance',
            color: '#00BCD4',
            requiredPerm: 'projects_allow_edit',
            hideInFreelance: true,
            content: `
                <h2 style="margin-top:0; color:#00BCD4;">Configuración de Proyectos & Exportación</h2>
                <p style="color:#cbd5e1; line-height:1.7;">Desde el botón de engranaje (<b>Configuraciones</b>) administrás las rutas de los proyectos, los usuarios/permisos y la exportación de paquetes portables para externos.</p>

                <h3 style="color:#00BCD4; border-bottom:1px solid #262f3f; padding-bottom:6px;">1. Configuración de Proyectos</h3>
                <ul style="padding-left:18px; color:#cbd5e1; line-height:1.9; font-size:0.87rem; margin-bottom:18px;">
                    <li><b style="color:#fff;">Rutas Work / Media:</b> Definí la raíz local (<code>Z:</code>), la ruta remota de Google Drive (Rclone / <code>G:</code>) y la ruta SMB del servidor del estudio.</li>
                    <li><b style="color:#fff;">Presets por Defecto:</b> Asigná qué plantilla de Shot Designer y Asset Designer usa el proyecto.</li>
                    <li><b style="color:#fff;">Publicar Presets:</b> Desde <i>Update / Export Presets</i> podés publicar cambios de configuración al servidor para que el resto del estudio los reciba al actualizar.</li>
                </ul>

                <h3 style="color:#00BCD4; border-bottom:1px solid #262f3f; padding-bottom:6px;">2. Empaquetar Versión Portable (.zip) y Modo Freelance</h3>
                <div style="background:#141821; padding:14px 16px; border-radius:8px; border:1px solid #262f3f;">
                    <ol style="padding-left:18px; color:#cbd5e1; line-height:1.85; font-size:0.86rem; margin:0;">
                        <li>Entrá a <b>Configuraciones → Update / Export Presets</b>.</li>
                        <li>Elegí la carpeta de salida y si necesitás incluir <b>Ramón y dependencias</b> o cachés de catálogos.</li>
                        <li>Tildá <b>Forzar Modo Freelance (bloqueado para externos)</b> para generar el <code>.zip</code> con <code>presets/freelance_lock.json</code> incluido: esa instalación queda bloqueada en modo Local + Drive, persiste aunque actualice por GitHub y solo un Admin puede desbloquearla.</li>
                    </ol>
                </div>
            `
        }
    ],

    selectedId: null,

    getVisibleTutorials: () => {
        const isFreelance = !!(window.pipetaSystemEnv?.freelanceLocked);
        return Tutorials.tutorials.filter(t => {
            if (isFreelance && t.hideInFreelance) return false;
            if (typeof window.checkUserPermission === 'function') {
                if (t.requiredPerm && !window.checkUserPermission(t.requiredPerm)) return false;
                if (Array.isArray(t.requiredPerms) && !t.requiredPerms.some(p => window.checkUserPermission(p))) return false;
            }
            return true;
        });
    },

    renderSidebar: () => {
        const visible = Tutorials.getVisibleTutorials();
        return visible.map(t => `
            <div class="tut-sidebar-item ${Tutorials.selectedId === t.id ? 'active' : ''}"
                 onclick="Tutorials.select('${t.id}')"
                 style="display:flex; align-items:center; gap:10px; padding:9px 12px; cursor:pointer; border-radius:6px; margin-bottom:3px; transition:all 0.2s;
                        background:${Tutorials.selectedId === t.id ? '#1e2430' : 'transparent'};
                        border-left:3px solid ${Tutorials.selectedId === t.id ? t.color : 'transparent'};">
                <img src="${t.icon}" style="width:18px; height:18px; object-fit:contain; flex-shrink:0;">
                <div style="overflow:hidden;">
                    <div style="color:${Tutorials.selectedId === t.id ? '#fff' : '#ccc'}; font-size:0.82rem; font-weight:${Tutorials.selectedId === t.id ? 'bold' : 'normal'}; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${t.title}</div>
                    <div style="color:#666; font-size:0.65rem; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${t.subtitle}</div>
                </div>
            </div>
        `).join('');
    },

    renderContent: () => {
        const visible = Tutorials.getVisibleTutorials();
        if (!Tutorials.selectedId || !visible.some(t => t.id === Tutorials.selectedId)) {
            const isFreelance = !!(window.pipetaSystemEnv?.freelanceLocked);
            return `
                <div style="max-width:960px; margin:0 auto;">
                    <div style="display:flex; align-items:center; gap:14px; margin-bottom:22px; padding-bottom:16px; border-bottom:1px solid #1f2532;">
                        <img src="logo.png" style="height:44px; opacity:0.85;">
                        <div>
                            <h1 style="font-size:1.45rem; margin:0; color:#f1f5f9; letter-spacing:0.5px;">Guías de Uso — Pipeta Pipeline</h1>
                            <p style="color:#94a3b8; margin:4px 0 0 0; font-size:0.86rem;">
                                ${isFreelance ? 'Mostrando únicamente las guías de los módulos habilitados en Modo Freelance.' : 'Seleccioná un módulo para ver su flujo de trabajo paso a paso y buenas prácticas.'}
                            </p>
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:12px;">
                        ${visible.map(t => `
                            <div onclick="Tutorials.select('${t.id}')"
                                 style="background:#131720; border:1px solid #222b3a; border-top:3px solid ${t.color}; border-radius:8px; padding:14px 16px; cursor:pointer; transition:transform 0.15s, border-color 0.15s;"
                                 onmouseover="this.style.borderColor='${t.color}'; this.style.transform='translateY(-2px)'"
                                 onmouseout="this.style.borderColor='#222b3a'; this.style.transform='none'">
                                <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                                    <img src="${t.icon}" style="width:20px; height:20px; object-fit:contain;">
                                    <div style="color:#f8fafc; font-weight:700; font-size:0.9rem;">${t.title}</div>
                                </div>
                                <div style="color:#94a3b8; font-size:0.78rem; line-height:1.45;">${t.subtitle}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        const tut = visible.find(t => t.id === Tutorials.selectedId);
        if (!tut) return '';
        return `
            <div style="animation: fadeIn 0.25s ease; position:relative; max-width:920px;">
                <button onclick="Tutorials.close()" title="Volver al índice de guías"
                    style="position:absolute; top:-6px; right:0; background:#181e29; border:1px solid #2b3547; border-radius:6px; color:#94a3b8; cursor:pointer; font-size:0.8rem; padding:4px 10px;">
                    Índice
                </button>
                ${tut.content}
            </div>
        `;
    },

    select: (id) => {
        if (Tutorials.selectedId === id) {
            Tutorials.selectedId = null;
        } else {
            Tutorials.selectedId = id;
        }
        Tutorials.renderHome();
    },

    close: () => {
        Tutorials.selectedId = null;
        Tutorials.renderHome();
    },

    renderHome: () => {
        const homeEl = document.getElementById('view-home');
        if (!homeEl) return;

        const visible = Tutorials.getVisibleTutorials();
        if (Tutorials.selectedId && !visible.some(t => t.id === Tutorials.selectedId)) {
            Tutorials.selectedId = null;
        }

        homeEl.style.padding = '0';
        homeEl.style.textAlign = 'left';
        homeEl.innerHTML = `
            <style>
                @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
                .tut-sidebar-item:hover { background: #181d26 !important; }
            </style>
            <div style="display:flex; height:100%; width:100%;">
                <!-- Sidebar -->
                <div style="width:250px; min-width:250px; background:#101318; border-right:1px solid #1f2532; padding:15px 10px; display:flex; flex-direction:column;">
                    <div style="color:#7e8b9b; font-size:0.7rem; font-weight:bold; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; padding-left:6px;">
                        Guías de Pipeline
                    </div>
                    <div style="flex:1; overflow-y:auto; padding-right:2px;">
                        ${Tutorials.renderSidebar()}
                    </div>
                    <div style="color:#4a5568; font-size:0.65rem; text-align:center; padding-top:10px; border-top:1px solid #19202c;">
                        Pipeta VFX Pipeline • La Sociedad Post
                    </div>
                </div>
                <!-- Content -->
                <div style="flex:1; padding:30px 40px; overflow-y:auto; background:#0b0d11;">
                    ${Tutorials.renderContent()}
                </div>
            </div>
        `;
    },

    init: () => {
        Tutorials.renderHome();
    }
};

window.Tutorials = Tutorials;
