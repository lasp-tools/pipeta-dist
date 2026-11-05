// --- PIPETA PATCH NOTES DATA & RENDERER ---
window.PIPETA_PATCH_NOTES = [
    {
        "version": "v1.2.2",
        "badge": "Versión Actual",
        "accentColor": "#00e5ff",
        "items": [
            "<b>Refresco Híbrido Instantáneo (&lt; 500 ms):</b> Clic derecho y refresco de carpeta resuelto en tiempo real directamente por Pipeta Server vía StorNext SMB sin demoras ni colas lentas.",
            "<b>Catálogos de Servidor en Puestos con Z Virtual (vsub):</b> Los puestos con Z virtualizado o carpetas locales aún no creadas consultan y visualizan de inmediato el catálogo del servidor central.",
            "<b>Desacople Total de Servidor Auxiliar (VM 111):</b> Eliminada toda dependencia y bloqueos de red hacia la VM 111, unificando la administración en Pipeta Server y StorNext (116).",
            "<b>Auto-Actualizador Nativo de Flota:</b> Migración de llamadas de sincronización a fetch HTTP nativo con handoff desacoplado sin bloqueos de proceso."
        ]
    },
    {
        "version": "v1.2.1",
        "badge": "",
        "accentColor": "#666",
        "items": [
            "<b>Filtrado Estricto de Proyectos por Usuario:</b> Los artistas y usuarios estándar solo ven los proyectos que tienen asignados manualmente desde Pipeta Server (<code>assignedProjects</code>) o que tienen tareas activas en Ramón (TACTIC).",
            "<b>Prioridad de Sesión Ramón en Tiempo Real:</b> La resolución de permisos y proyectos ahora prioriza de forma absoluta la cuenta conectada en Ramón, evitando asignaciones erróneas de roles heredados.",
            "<b>Manejo Automático de Proyectos no Asignados:</b> Si un usuario no tiene proyectos permitidos, el sistema muestra el estado bloqueado informativo <code>🔒 Sin proyectos asignados</code> sin exponer datos ajenos.",
            "<b>Sincronización de Permisos Multi-Puesto:</b> Las excepciones y listas de proyectos asignados en Pipeta Server se propagan automáticamente a puestos locales y remotos."
        ]
    },
    {
        "version": "v1.2.0",
        "badge": "",
        "accentColor": "#666",
        "items": [
            "<b>Arquitectura Modular Integral (Backend y Frontend):</b> Servidor Express desacoplado en 10 routers especializados (<code>fs</code>, <code>sync</code>, <code>system</code>, <code>updater</code>, <code>ia</code>, <code>ramon</code>, etc.) y frontend modularizado con gestión reactiva mediante <code>PipetaStore</code>.",
            "<b>Detección Multi-Entorno Robusta:</b> Detección automática y transparente de los 5 entornos operativos: red de estudio con SMB, puestos locales con <code>Z:</code> virtualizado (vsubs), operación 100% offline sin internet, y puestos freelance remotos.",
            "<b>Refresco Autónomo de Servidor sin SMB (0 SMB):</b> En equipos con Z local o sin acceso físico a StorNext, el refresco de catálogos delega de forma asíncrona a Pipeta Server y descarga los subcatálogos actualizados por HTTP.",
            "<b>Eliminación Definitiva de Miller View:</b> Transición completa hacia Split-View y Sync Overlay unificado, reduciendo miles de líneas de código redundante.",
            "<b>Auto-hidratación de Presets de Proyectos:</b> Garantía de inicialización inmediata de todos los proyectos de estudio en cualquier instalación nueva o puesto cliente.",
            "<b>Gestión de Roles y Permisos de Ramón:</b> Acceso irrestricto y automático para perfiles administradores a todos los proyectos activos."
        ]
    },
    {
        "version": "v1.1.93",
        "badge": "",
        "accentColor": "#666",
        "items": [
            "<b>Detección y Propagación Bidireccional de Pendientes de Subida:</b> Las carpetas locales con elementos nuevos para subir a Servidor o Drive ahora reflejan inmediatamente el estado de subida (⬆️* Subir) tanto cerradas como abiertas, propagándose automáticamente por toda la jerarquía de directorios.",
            "<b>Eliminación de Tildes Falsos (✓):</b> Ninguna carpeta con archivos o secuencias pendientes de subir o descargar volverá a mostrar un tilde verde erróneo.",
            "<b>Actualización Dinámica de Insignias en Árbol:</b> La apertura y navegación por carpetas recalculan en vivo los contadores de subida y bajada de sus ancestros en el DOM."
        ]
    },
    {
        "version": "v1.1.92",
        "badge": "",
        "accentColor": "#666",
        "items": [
            "<b>Purga Automática de Órdenes de Inspección (rf_):</b> Se eliminó la acumulación de archivos de inspección de catálogo huérfanos que saturaban la cola de sincronización.",
            "<b>Cola de Sincronización Exclusiva para Archivos:</b> Las inspecciones y refrescos rápidos de carpetas ya no se encolan como si fueran transferencias pesadas (0% fijo), manteniendo la cola limpia únicamente para subidas y bajadas reales.",
            "<b>Refresco Directo LAN sin Tickets:</b> <code>Refrescar Carpeta</code> en red de estudio se procesa de forma síncrona en 2 segundos, actualizando la vista inmediatamente sin colgar workers."
        ]
    },
    {
        "version": "v1.1.91",
        "badge": "",
        "accentColor": "#666",
        "items": [
            "<b>Refresco Directo de Servidor en LAN (0 Bloqueos):</b> <code>Refrescar Carpeta</code> en modo Servidor ahora resuelve StorNext directamente en milisegundos mediante SMB / UNC (<code>\\192.168.206.116Z</code> o <code>S:</code>) sin depender de colas ni generar timeouts de worker.",
            "<b>Cálculo Universal de Diferencias de Carpetas:</b> Se eliminaron las restricciones que impedían calcular diffs de subcatálogos en puestos con unidades virtuales locales, garantizando que ninguna carpeta con elementos faltantes muestre erróneamente un tilde de OK.",
            "<b>Carril Rápido LAN para Descargas:</b> Si un archivo solicitado de Drive ya reside físicamente en el Servidor Central (StorNext), se copia instantáneamente por red LAN al disco local Z: sin pasar por la cola de Google Drive.",
            "<b>Monitoreo Dinámico de Workers:</b> La cola de sincronización ahora muestra dinámicamente el host real que ejecuta la tarea en lugar de un cartel fijo."
        ]
    },
    {
        "version": "v1.1.90",
        "badge": "",
        "accentColor": "#666",
        "items": [
            "<b>Actualizador Universal a Prueba de Fallos:</b> Rediseño integral de la actualización desde la interfaz. Implementa arquitectura de relevo desacoplada (Handoff Runner externo) que libera todos los locks de archivos en Windows antes de sincronizar, eliminando cualquier riesgo de archivos bloqueados o carpetas corruptas.",
            "<b>Detección y Autenticación Automática en Munro:</b> El sistema detecta y autentica automáticamente el almacenamiento de red del estudio (<code>\\\\192.168.206.116\\Z</code> / <code>S:</code>) en puestos con o sin letra Z asignada (SMB o vsubs), actualizando por red LAN sin consumir internet.",
            "<b>Modo Freelance Seguro con Staging Atómico:</b> En actualizaciones remotas vía GitHub ZIP, los archivos se descomprimen y verifican en un área temporal aislada antes de aplicarse a destino, garantizando integridad absoluta del sistema."
        ]
    },
    {
        "version": "v1.1.89",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Modo Pipeta Server para puestos sin Z SMB:</b> Los equipos dentro del estudio que no tengan el volumen SMB Z: montado o utilicen unidades virtuales/locales ahora sincronizan automáticamente los catálogos modulares y manifiestos vía HTTP directo con Pipeta Server en &lt; 200ms.",
            "<b>Refresco de Carpetas en Servidor Central:</b> La acción de refrescar carpetas en modo Servidor se delega transparentemente a Pipeta Server cuando no hay acceso SMB local directo, eliminando el error de tiempo de espera del Worker y actualizando la vista inmediatamente con los nuevos archivos de red.",
            "<b>Autenticación Automática de Dominio para Copias UNC:</b> En descargas y copias de archivos desde el servidor a disco local, Pipeta autentica automáticamente contra el recurso de red StorNext de forma transparente."
        ]
    },
    {
        "version": "v1.1.88",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Login Remoto WAN con Ramón Instantáneo:</b> Restaurado el puente seguro vía Cloudflare tunnel hacia el Pipeta Server central, permitiendo login en Ramón y consultas en &lt; 1 segundo desde puestos externos fuera del estudio.",
            "<b>Fail-Fast en Puestos Externos:</b> Si el servidor central no responde desde una máquina externa, se reporta el error de conectividad de forma inmediata sin demorar 25 segundos intentando alcanzar IPs privadas del estudio.",
            "<b>Sync Queue Visual Clean:</b> Eliminados los emojis secundarios redundantes en la cola de sincronización para una interfaz más sobria y profesional."
        ]
    },
    {
        "version": "v1.1.87",
        "badge": "",
        "accentColor": "var(--accent)",
        "items": [
            "<b>Modelo Híbrido de Asignación de Proyectos:</b> El rol Administrador mantiene acceso global a todos los proyectos siempre. Los roles Lead y Artista solo tienen acceso a los proyectos donde tengan tareas activas en Ramón más aquellos habilitados manualmente por un Administrador en User Settings.",
            "<b>Aislamiento Total de Cachés y Red:</b> Si un proyecto no está asignado al usuario, no aparece en la interfaz y Pipeta no descarga ni carga en memoria sus catálogos, anulando el consumo innecesario de disco y red."
        ]
    },
    {
        "version": "v1.1.86",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Reparación de Acceso Directo, Ícono y Desbloqueo Local:</b> El acceso directo del Escritorio ahora apunta siempre a la instalación local <code>C:TOOLSAPPSPipeta</code> (evitando el cartel de seguridad de red de Windows al abrir desde <code>Z:</code>), corrige la ruta del ícono oficial <code>Pipeta.ico</code> y refresca automáticamente la caché de íconos de Windows Explorer."
        ]
    },
    {
        "version": "v1.1.85",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Carga Instantánea del Explorer (Munro &amp; Remoto):</b> El árbol local de Proyecto y Media ahora se pinta de inmediato (&lt; 0.3s) y decora los badges de comparación contra Drive/Server de forma asíncrona en segundo plano sin trabar la vista.",
            "<b>Aislamiento Estricto LAN vs WAN y Corte en 404:</b> Las estaciones dentro del estudio consultan exclusivamente al servidor LAN sin caer en URLs externas/túneles, cacheando sub-catálogos inexistentes.",
            "<b>Resumen Pre-calculado en Manifest (13 KB vs 140 MB) y Arranque No-Bloqueante:</b> Los contadores de sincronización raíz se guardan firmados en <code>manifest.json</code> evitando parsear sub-catálogos pesados al abrir, y la hidratación inicial de caché corre en segundo plano sin bloquear el arranque."
        ]
    },
    {
        "version": "v1.1.84",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Sync Queue - Botón Cancelar Todo y Limpieza Bidireccional:</b> Se agregó el botón <code>🛑 Cancelar Todo</code> en la pestaña activa para abortar y vaciar todas las tareas en cola en un solo paso. Toda cancelación propaga la señal vía HTTP al Servidor Central y limpia de inmediato los archivos residuales locales (evitando colas huérfanas en puestos remotos o redes sin SMB como Nonstop).",
            "<b>Sanitización Automática de Órdenes Zombi:</b> Al iniciar la aplicación y al sincronizar con el Servidor Central, las órdenes pendientes expiradas de sesiones previas se depuran automáticamente para que nunca más queden trabadas en espera."
        ]
    },
    {
        "version": "v1.1.83",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "IA Ingest: Detección de colisiones acotada estrictamente a la subcarpeta de destino seleccionada (export, ref, wip).",
            "Botones rápidos de paso de versión (+ / -) táctiles en el Name Builder."
        ]
    },
    {
        "version": "v1.1.82",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "Autenticación Remota de Ramón vía Túnel Central para puestos externos y freelance.",
            "Puente Híbrido WAN/LAN y timestamps de hora en consola."
        ]
    },
    {
        "version": "v1.1.79",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "Autenticación Ramón sin precarga en login.",
            "Runtime Python 3.10 estándar completo (python310.zip).",
            "Actualizaciones por GitHub público."
        ]
    },
    {
        "version": "v1.1.78",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "Actualizador inteligente unificado en Update / Export Presets."
        ]
    },
    {
        "version": "v1.1.77",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Fijación de Navegación en Proyecto Base:</b> Se neutralizó la sobrescritura silenciosa del selector del header para mantener seleccionada la plantilla maestra <i>★ Proyecto Base</i> al alternar entre cualquiera de sus secciones (ID / Nombre, Rutas, Presets Proyecto, Presets IA, Templates).",
            "<b>Acceso Universal a Dev Mode:</b> Incorporación del interruptor de <code>🛠️ Dev Mode</code> en la pestaña Rutas y soporte consistente a través de todas las secciones para habilitar de inmediato la edición de tokens y presets maestros.",
            "<b>Restauración Segura al Cerrar:</b> Al cerrar la ventana de configuraciones, el proyecto activo de trabajo del canvas se reasigna limpiamente en segundo plano."
        ]
    },
    {
        "version": "v1.1.76",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Respeto Estricto del Switch Higgsfield en IA Ingest:</b> Se corrigió la condición de ingesta para que los archivos (videos MP4 o imágenes) que contengan prefijos o UUIDs tipo Higgsfield solo se procesen por el pipeline de Higgsfield si el botón HF está explícitamente activado.",
            "<b>Aislamiento de Archivos Locales vs Worker:</b> Los archivos locales arrastrados desde disco siempre se procesan de forma local sin derivarse al worker remoto, reservando el worker únicamente para descargas remotas de CloudFront."
        ]
    },
    {
        "version": "v1.1.75",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Zona de Carga Estable y Fluida en IA Ingest:</b> Se neutralizó el parpadeo visual al arrastrar archivos (aislando elementos hijos con <code>pointer-events: none</code> y contador de profundidad de arrastre <code>_iaDropDepthCounter</code>).",
            "<b>Captura y Procesamiento Inmediato al Soltar:</b> Corrección en el handler de drop para ejecutar instantáneamente la ingesta de archivos sin abortos por colisión de banderas ni duplicación de ítems."
        ]
    },
    {
        "version": "v1.1.74",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Deduplicación Estricta de Drag & Drop en IA Ingest:</b> Corrección del doble disparo de eventos al arrastrar archivos desde Windows Explorer sobre la zona de carga (\"2. CARGAR ARCHIVOS\"). Se implementó protección con <code>stopImmediatePropagation</code>, banderas de evento único e inspección preventiva en cola para evitar ítems duplicados y saltos erróneos de versión.",
            "<b>Blindaje de Listeners Idempotentes:</b> Prevención de registros duplicados en inicializaciones concurrentes de DropZone y Resizer."
        ]
    },
    {
        "version": "v1.1.73",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Sincronización Automática Local en Máquinas con Subst (Z:):</b> Al completar una orden de descarga de Google Drive procesada por el Worker Central en el almacenamiento StorNext (S:), el servidor local detecta y replica automáticamente los archivos hacia la unidad local Z:, asegurando disponibilidad local inmediata.",
            "<b>Creación Recursiva Garantizada de Carpetas:</b> Blindaje en la creación recursiva de toda la estructura de directorios padre antes de escribir o streamear archivos de medios.",
            "<b>Docking Lateral con Pestañas y Drag & Drop en IA Ingest:</b> Soporte para acoplar módulos a la derecha del canvas (Sync Queue, Ramón, IA Ingest, etc.), arrastrar archivos directamente al dock lateral configurando automáticamente plano y secuencia, y optimización de escala para visualizar la cola de ingesta."
        ]
    },
    {
        "version": "v1.1.72",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Reorganización de Barra Superior:</b> Ubicación de FILTERS en primer término a la izquierda (con Ramón prioritario) seguido de VIEW OPTIONS, COMPARAR y FILE / FOLDER.",
            "<b>Botones e Iconos Mejor Proporcionados:</b> Escalado de botones a 32px y de iconos a 20-22px para rellenar de manera armoniosa el contenedor de 57px sin áreas vacías.",
            "<b>Estandarización de Etiquetas:</b> Títulos homogéneos en mayúsculas (FILTERS, VIEW OPTIONS, COMPARAR, FILE / FOLDER).",
            "<b>Nuevos Iconos Canónicos:</b> Reemplazo del botón comparar DRIVE con SVG oficial de Google Drive, nuevo icono SVG para Deep Compare (con texto en tooltip) y nuevo icono SVG para Reload Cache."
        ]
    },
    {
        "version": "v1.1.69",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Limpieza de Barra Superior:</b> Se removieron de la barra superior derecha los botones de <i>Espacio en discos</i> (desactivando también su sondeo en segundo plano), <i>Maximizar canvas</i> y <i>Recargar sistema</i>, conservando exclusivamente el botón de cierre seguro.",
            "<b>Reubicación de Carpeta de Salida:</b> Traslado del módulo de subcarpetas (<code>WIP</code> / <code>Ref</code> / <code>Export</code>) a la parte inferior izquierda del panel principal de Name Builder, permitiendo una grilla superior de 8 tokens balanceada y alineando las carpetas junto a la ruta canónica de salida.",
            "<b>IA Ingest Name Builder Refactor:</b> Botones de módulo con fill sólido completo estilo Carpeta de Salida (naranja activo / oscuro inactivo), activables con un clic en cualquier parte del encabezado y sin borde perimetral iluminado.",
            "<b>TAG / ROLE Modular Independiente (A, B, C):</b> Separación en 3 módulos independientes para TAG A (Ref), TAG B (Compo, desactivado por default) y TAG C (Proceso, desactivado por default), eliminando la opción 'ninguno'.",
            "<b>Limpieza Visual y Separadores en Desplegables:</b> Remoción de emojis en todas las opciones de Motor, Framing y Tags, líneas divisorias claras y nombres limpios (<code>Auto</code>, <code>Higgsfield (metadata)</code>).",
            "<b>Modo Simple por Defecto y Tags Manuales:</b> Inicialización predeterminada en Modo Simple y habilitación del campo Manual en los selectores de Tag.",
            "<b>Send2 IA Ingest en Menú Contextual:</b> Icono canónico de IA Ingest y corrección definitiva del error de consola en <code>createObjectURL</code>."
        ]
    },
    {
        "version": "v1.1.56",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Cola de Transferencias Concurrentes y Fast-Lane:</b> Procesamiento paralelo de refrescos de carpeta (<code>refresh_folder</code>) sin bloquear subidas/descargas pesadas, y descargas simultáneas configurables por Rol y Override de Usuario desde Pipeta Server.",
            "<b>Identificación de Refresco de Carpeta:</b> Visualización dedicada (<code>🔄 REFRESCO DE CARPETA</code>) con ruta inspeccionada en la cola de transferencias.",
            "<b>Persistencia de Prioridades en Server:</b> Sincronización inmediata de cambios de prioridad entre VM 121, VM 111, MongoDB y workers activos."
        ]
    },
    {
        "version": "v1.1.53",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Resolución Universal de Rutas a Google Drive:</b> Mapeo automático de rutas locales (<code>Z:/INTERNO/MEDIA/...</code>, <code>S:/...</code>, <code>Z:/...</code>) a sus correspondientes Team Drives en Google Drive (<code>..._media</code> y <code>...</code>) al crear órdenes de subida para archivos nuevos no indexados en el catálogo.",
            "<b>Fallback a Disco Físico SMB:</b> Detección y listado inmediato de archivos nuevos en carpetas locales SMB cuando el catálogo modular en RAM aún no ha sincronizado la entrada.",
            "<b>Protección y Autocorrección en Worker y Servidor:</b> Autocorrección preventiva de rutas locales a rutas remotas antes de la invocación de Rclone, evitando cancelaciones por Team Drive no resuelto."
        ]
    },
    {
        "version": "v1.1.51",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Telemetría y Registro de Flota Centralizado (Mecanismo A):</b> Latido periódico automático (cada 60 segundos y al iniciar) hacia el Pipeta Server (<code>192.168.206.121:3005</code>), reportando versión instalada, usuario de Ramón activo, usuario del sistema operativo y sede de red (Munro, Nonstop o Remoto), con respaldo offline tolerante a fallos en <code>_SYNC_CACHE/clients/</code>.",
            "<b>Huella de Arranque e Instalador (.bat) (Mecanismo B):</b> Registro asíncrono y no bloqueante en <code>Launch_Pipeta.bat</code> y <code>Actualizar_Pipeta_desde_Red.bat</code> para auditar de forma inmediata qué puestos de artistas cuentan con la aplicación instalada.",
            "<b>Diagnóstico y Logs en Dos Niveles:</b> Separación persistente de logs generales (<code>pipeta_YYYY-MM-DD.log</code>) y errores críticos (<code>pipeta_errors_YYYY-MM-DD.log</code>), con generador de reportes de diagnóstico y apertura directa en el Explorador de Windows."
        ]
    },
    {
        "version": "v1.1.49",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Validador de Nomenclatura: Escaneo Integral Proyecto y Media:</b> Se corrigió la lógica de <code>Scan ALL</code> que utilizaba una ruta estática obsoleta de configuración. Ahora resuelve de forma dinámica y automática tanto el árbol de <b>Proyecto</b> como el de <b>Media</b> del proyecto activo, auditando ambos universos en una sola pasada.",
            "<b>Navegación Unificada a Ítems con Error:</b> El botón \"Ir\" ahora discrimina correctamente si el archivo/carpeta con error pertenece a Proyecto o a Media, enfocándolo y abriéndolo en su respectivo visor.",
            "<b>Diseño Visual Limpio:</b> Se removieron los íconos decorativos y badges obsoletos (escudo, mundo, carpeta y \"v1.8\") del encabezado y de los botones de escaneo para una interfaz más sobria y directa."
        ]
    },
    {
        "version": "v1.1.44",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>File Auditor: Filtrado Canónico Estricto de Renders FullRes vs .mov:</b> Corrección en la auditoría de renders donde los archivos de compresión <code>.mov</code> contaminaban el listado de renders en memoria aunque la casilla <code>.mov</code> estuviese desactivada. Ahora el auditor respeta estrictamente los filtros activos, evaluando y mostrando únicamente las secuencias <code>fullres</code> reales.",
            "<b>Discriminación de Carpetas Vacías o Sin Frames de Media:</b> Se incorporó un filtro de medios válidos (<code>.exr</code>, <code>.dpx</code>, <code>.png</code>, etc.) que ignora carpetas vacías o abortadas antes de renderizar (como carpetas de versión sin frames), evaluando y reportando con total precisión cuál es la última versión real existente con archivos en Media.",
            "<b>Exploración Selectiva en Menú Contextual:</b> Se incorporaron accesos directos independientes para <code>Abrir Render (vXXX) en Explorer</code> (la versión específica con frames) y <code>Abrir Carpeta Media en Explorer</code> (la jerarquía <code>fullres</code> del plano), evitando navegaciones erróneas hacia carpetas de compresión (<code>nuke/mov</code>)."
        ]
    },
    {
        "version": "v1.1.43",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>File Auditor: Fix Desacoplado para Archivos Temporales (.tmp):</b> La opción Fix ahora limpia exclusivamente los archivos <code>.tmp</code> residuales de los renders sin exigir ni encolar subidas o descargas hacia Google Drive (Upload/Download pueden permanecer apagados). Se habilita dinámicamente con texto orientativo <code>Fix (Borrar .tmp)</code> y actualiza el estado directamente a AL DÍA sin falsas alertas de error.",
            "<b>Control de Caché en UI (Cache-Busting):</b> Se vincularon parámetros de versión en los scripts de la interfaz para forzar la recarga inmediata de los módulos en equipos de artistas conectados por red sin requerir recargas forzadas.",
            "<b>Badge Específico de Residuos (.tmp):</b> Detección visual que diferencia carpetas con nombres incorrectos de secuencias válidas afectadas únicamente por archivos residuales <code>.tmp</code> de Nuke/Windows SMB, integrando botón rápido de eliminación y acceso desde el menú contextual."
        ]
    },
    {
        "version": "v1.1.42",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>File Auditor: Escaneo Multinivel de Renders y Detección de Ingest:</b> Corrección en el escaneo de renders que solo miraba un nivel de profundidad; ahora inspecciona correctamente jerarquías anidadas canónicas de Nuke (<code>fullres</code>, <code>prerender</code>, <code>mov</code>) y excluye estrictamente carpetas de cámara o ingesta (<code>in/</code>, <code>plates/</code>) de ser catalogadas falsamente como renders.",
            "<b>Limpieza Segura de Residuos Temporales (.tmp):</b> Nueva funcionalidad de corrección que detecta archivos residuales <code>.tmp</code> dejados por Nuke/Windows SMB en carpetas de render. Permite borrarlos de forma individual o en lote con la opción Fix, manteniendo las secuencias de frames 100% intactas y actualizando automáticamente el estado a AL DÍA.",
            "<b>Shot Designer: Restauración de Conexiones Mirror y Trazados Bézier:</b> Corrección en el dibujado de conexiones púrpuras verticales entre Proyecto y Media, habilitación de arrastre fluido de conexiones desde dots y corrección en la carga de presets locales.",
            "<b>Navegación Explorer: Eliminación de Bloqueo en Apertura:</b> Se solventó la condición de carrera en los overlays de carga que dejaba congelada la pantalla en \"Actualizando vista...\" al abrir la aplicación."
        ]
    },
    {
        "version": "v1.1.39",
        "badge": "",
        "accentColor": "var(--accent)",
        "items": [
            "<b>Navegación Automática contra Catálogo DB en RAM (0 SMB):</b> En puestos del estudio donde Z: es un volumen de red SMB, la exploración del árbol local utiliza de forma directa y prioritaria la DB del servidor central sin consultar la red a cada clic, respondiendo en 0 ms.",
            "<b>Detección Inteligente de Tipo de Unidad Z:</b> Distinción transparente entre volúmenes de red SMB y montajes locales virtuales (VSUB). En modo local por VSUB se aprovecha la velocidad física del SSD, mientras que en red SMB se evita el escaneo innecesario de archivos.",
            "<b>Actualización Reactiva de Archivos:</b> Refresco selectivo e invalidación inmediata del catálogo ante cualquier acción de Pipeta (creación de assets, planos, copiado, ingest o eliminación)."
        ]
    },
    {
        "version": "v1.1.38",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Navegación Instantánea en Red SMB y Catálogos Modulares:</b> Eliminación de bloqueos de Event Loop causados por escaneos síncronos sobre la unidad Z: conectada por red SMB. La indexación de miles de archivos se realiza en memoria en menos de 100 ms.",
            "<b>Caché en Memoria Acelerado:</b> Incorporación de lectura instantánea con <code>serverDirCache</code> para navegación a 0 ms.",
            "<b>Blindaje del Árbol de Exploración:</b> Manejo robusto de promesas en Split View evitando estados colgados de carga."
        ]
    },
    {
        "version": "v1.1.37",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Arquitectura de Catálogos Centralizados por HTTP (0 SMB):</b> Los manifiestos y sub-catálogos de proyectos (tanto de Google Drive como del servidor del estudio Z:) se sirven directamente por HTTP comprimido desde <code>lasp-pipeta-server</code> hacia el SSD local. Se eliminan los bloqueos y latencias de navegación de Windows SMB en puestos nuevos o reinstalados.",
            "<b>Puente de Catálogos Continuo:</b> Sincronización continua de la estructura de proyectos y catálogos en el servidor central con <code>rsync</code> incremental.",
            "<b>Blindaje de Dependencias y Reinicios:</b> Protección total de <code>node_modules</code> y runtimes locales durante reinicios automáticos de la aplicación."
        ]
    },
    {
        "version": "v1.1.36",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Selector de Proyectos Optimizado:</b> Se oculta el proyecto técnico base de la lista de selección en la barra superior (manteniendo su función como base de configuración) y se añade un indicador visual de carga al conmutar de proyecto.",
            "<b>Monitor de Almacenamiento Colapsable:</b> Monitor de discos discretamente ubicado a la derecha de la barra superior, apagado por defecto y desplegable con botón dedicado.",
            "<b>Estabilidad y Telemetría Central (Pipeta Server):</b> Puente continuo de almacenamiento (<code>pipeta-storage-bridge</code>) y protección anti-clock-skew para el monitoreo ininterrumpido de nodos (<code>lasp-virt-030</code>)."
        ]
    },
    {
        "version": "v1.1.35",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Rediseño de Pipeta Server (Panel de Control):</b> Reorganización del dashboard en dos columnas; los Nodos Workers ahora se sitúan en una columna lateral dedicada y la tabla principal se expande bajo el título <code>Transfer Queue</code>.",
            "<b>Limpieza Visual de la Interfaz:</b> Remoción del botón obsoleto «Levantar Worker Local (este servidor)», eliminación del icono de escoba en «Limpiar Historial» y del rayo en la cabecera de la cola."
        ]
    },
    {
        "version": "v1.1.34",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Blindaje de Cola de Sincronización Local / Red (Cero Congelamiento en Tasa):</b> Se corrigió la condición de carrera en la persistencia de órdenes locales (escritura simultánea asíncrona sobre SMB que corrompía el JSON de la orden). Ahora el estado se persiste de inmediato en el SSD local y se replica de forma segura y secuencial a la red.",
            "<b>Telemetría en Tiempo Real desde Memoria RAM (0 ms):</b> La consulta de órdenes inyecta el progreso de las transferencias locales directamente desde el proceso Node en RAM, garantizando velocidad y porcentaje instantáneos sin quedar trabado en «Calculando tasa...»."
        ]
    },
    {
        "version": "v1.1.33",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Monitor de Discos Colapsable a la Derecha:</b> Se reubicó el monitor de almacenamiento (Z: / G:) al extremo derecho de la barra superior, junto a los controles de sistema. Por defecto permanece oculto para mantener la barra limpia, y se despliega al tocar el nuevo botón con icono de disco."
        ]
    },
    {
        "version": "v1.1.32",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Ocultamiento del Proyecto Base en Selector de Cabecera:</b> El desplegable de proyectos de la barra superior ahora excluye de forma limpia el <i>Proyecto Base</i> (preservándolo intacto como plantilla maestra de configuración en Opciones Avanzadas y en el resto del sistema).",
            "<b>Feedback Visual y Pantalla de Carga al Cambiar de Proyecto:</b> Al seleccionar un proyecto nuevo, se despliega de inmediato una pantalla de carga con indicador esmerilado de progreso y spinner en el selector, evitando la sensación de congelamiento mientras se sincronizan catálogos y exploradores.",
            "<b>Sincronización Coordinada de Entorno:</b> Actualización instantánea de raíces de trabajo (<code>ROOTS</code>, <code>window.state</code>, <code>ShotNavigator</code>, <code>ShotCreator</code>, <code>AssetCreator</code>) y soporte dinámico para vistas Split y Miller al conmutar de proyecto."
        ]
    },
    {
        "version": "v1.1.31",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Eliminación del Bloqueo de Event Loop por Cola de Órdenes SMB:</b> Se optimizó <code>/api/sync/orders</code> y <code>/api/sync/worker-status</code> con caché en memoria para órdenes finalizadas y límite de inspección a las órdenes más recientes, además de depurar órdenes históricas en red. Esto elimina el bloqueo síncrono de 15-20 segundos cada 3 segundos en máquinas conectadas vía UNC (<code>\\\\192.168.206.116\\Z</code>).",
            "<b>Hidratación Local Instantánea de Subcatálogos Modulares (0 ms):</b> Las consultas a subcatálogos modulares ahora priorizan e hidratan automáticamente el disco SSD local (<code>C:\\TOOLS\\APPS\\Pipeta\\_SYNC_CACHE</code>) sin realizar barridos repetitivos por red SMB en cada carpeta desplegada.",
            "<b>Blindaje de Despliegue de Carpetas en Split-View Explorer:</b> Se incorporó protección contra clics/eventos concurrentes mientras una carpeta está cargando (evitando que se cierre sola) y se corrigió el orden de inserción en el DOM antes de auto-expandir subcarpetas."
        ]
    },
    {
        "version": "v1.1.30",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Optimización Drástica de Split-View Explorer:</b> Se implementó caché jerárquico de directorios locales (<code>dirExistsFast</code> / <code>fileExistsFast</code>). Al comparar local contra servidor en carpetas con miles de archivos que aún no existen en el disco del artista, la verificación de existencia se resuelve en &lt; 30 ms en lugar de congelar la aplicación por 45-60 segundos.",
            "<b>Eliminación de Consultas SMB Redundantes:</b> Se unificó el estado de existencia local para evitar comprobaciones de disco duplicadas por cada ítem listado."
        ]
    },
    {
        "version": "v1.1.29",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Blindaje de Workflow y Base de Datos Local:</b> Se eliminó la escritura automática pasiva de <code>shot_tracker.json</code> en disco al consultar o sincronizar tareas con Ramón. Los proyectos nuevos o vacíos ya no generan de forma espontánea carpetas residuales <code>workflow/</code> en la raíz de trabajo.",
            "<b>Protección de Proyectos no Creados en Disco:</b> Los endpoints de guardado de tracker ahora verifican la existencia previa de la carpeta raíz del proyecto antes de generar subdirectorios, previniendo la creación de proyectos fantasma o huérfanos."
        ]
    },
    {
        "version": "v1.1.28",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Auto-Guardado Inmediato de Proyectos:</b> La creación de nuevos proyectos persiste de forma inmediata y automática en el disco local (<code>.json</code>) al asignar su nombre, eliminando pérdidas de configuración por omitir el botón manual de guardado.",
            "<b>Exportación y Publicación Canónica de Presets:</b> Se actualizó la ruta de exportación de presets por defecto a la ubicación central oficial del repositorio (<code>Z:INTERNOTOOLSGITHUBTOOLSAPPSPipetapresets</code>), asegurando que los presets lleguen directamente a la red y a producción.",
            "<b>Incorporación del Proyecto <code>compound_nine</code>:</b> Integración del preset canónico del nuevo proyecto oficial en la suite de proyectos activos del estudio.",
            "<b>Auto-Hidratación de Dependencias y Protección de Runtimes:</b> Blindaje en los lanzadores y actualizadores con exclusión estricta de carpetas <code>bin/</code>, <code>tools/</code> y <code>node_modules/</code> ante sincronizaciones con Robocopy, y descompresión automática transparente desde el depósito central (<code>_DEPOT</code>) al detectar runtimes faltantes."
        ]
    },
    {
        "version": "v1.1.27",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Transferencia Concurrente Multi-Stream (Secuencias de Frames):</b> Implementación de un worker pool paralelo de hasta 8 streams simultáneos de copia sobre red SMB. Elimina el cuello de botella de latencia por archivo en secuencias de imágenes (PNG/EXR) y sustituye las lecturas remotas repetitivas de red por chequeos de memoria local en RAM, multiplicando radicalmente el ancho de banda transferido.",
            "<b>Cancelación Inmediata en Caliente de Descargas Locales:</b> Integración de <code>AbortController</code> en la memoria activa del servidor. Al cancelar una descarga, los streams se destruyen en el acto, liberando los archivos y evitando que el hilo continúe escribiendo o marque la tarea como completada al finalizar.",
            "<b>Saneamiento de Órdenes Huérfanas (Zombie Orders):</b> Limpieza automática de tareas que permanecían congeladas en estado <code>processing</code> tras cerrar o reiniciar Pipeta. Al reiniciar el servidor y al consultar la lista de órdenes, las transferencias locales no activas en RAM se marcan como <i>interrumpidas</i> de inmediato.",
            "<b>Apertura Instantánea en Windows Explorer:</b> Resolución automática de carpetas desde puestos con unidad virtual <code>subst Z:</code> hacia recursos UNC del Servidor Central con conexión SMB previa verificada. Se elimina el bloqueo y la espera de 20-30 segundos de Windows Explorer."
        ]
    },
    {
        "version": "v1.1.26",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Refinamiento de Metadata Dual para Higgsfield AI:</b> Separación estricta y limpia entre el resguardo del ledger original (<code>IA/higgsfield/...meta.json</code>, que conserva el JSON puro entregado por la API de Higgsfield al 100% sin inyección de datos de pipeline) y el sidecar canónico de estudio (<code>[SHOT_ID]_[MOTOR]...meta.json</code>, identificando el archivo con la clave canónica <code>lasp_name</code> y eliminando extensiones redundantes <code>.mp4</code> del nombre de metadata).",
            "<b>Reproductor y Previsualización Robusta de Video Web:</b> Simplificación del visor flotante eliminando botones innecesarios; la miniatura/poster persistente se mantiene siempre activa y responsive sin errores que colapsen el reproductor en videos web.",
            "<b>Iconografía Compacta y Limpia:</b> Remoción de textos redundantes en los botones de Higgsfield AI de la barra superior y del Name Builder, manteniendo un aspecto visual minimalista con tooltips informativos al pasar el cursor.",
            "<b>Corrección de Rutas de Ingesta IA:</b> Eliminada la duplicación de subcarpetas en destino (<code>IA/IA/</code>), garantizando la ubicación canónica directa en <code>IA/</code> y <code>IA/higgsfield/</code>."
        ]
    },
    {
        "version": "v1.1.25",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Integración Nativa de Higgsfield AI en IA Ingest:</b> Soporte integral para ingesta directa de planos generados con Higgsfield AI (Dreamina/Jimeng/Seedance), incluyendo extracción automática de UUIDs de Job desde nombres de archivo (<code>hf_AAAAMMDD_..._[UUID]</code>) o URLs de CloudFront.",
            "<b>Consulta REST y Extracción de Metadata de Job (0 créditos):</b> Conexión directa a la API de desarrollador de Higgsfield para recuperar automáticamente prompts, seed, resoluciones nativas, motores canónicos (SD2, SD25, SD5P, etc.) y roles/tags (v2v, i2v, t2v, etc.).",
            "<b>Suite Higgsfield Plegable en Barra Superior:</b> Cajón desplegable en la barra de herramientas superior contextual activable mediante un botón iluminado con el logo oficial de Higgsfield AI. Incluye campo de URL directa con botón <code>Download</code> alineado verticalmente, conmutador <code>Use worker</code> (para procesar local o delegar al worker central de red) y controles de ingesta: <b>Metadata</b> (generación de <code>.meta.json</code> / ledger), <b>Backup</b> (resguardo del original sin renombrar en <code>IA/higgsfield/</code>) y <b>Copy Refs</b> (descarga de frames y assets de entrada a <code>IA/ref/</code>).",
            "<b>Indicador y Forzado de Higgsfield en «3. NAME BUILDER»:</b> Botón conmutador con logo de Higgsfield junto al encabezado del Name Builder que se ilumina con brillo verde neón automáticamente al detectar que el archivo seleccionado es de Higgsfield. Permite forzar o desvincular la interpretación de Higgsfield en cualquier momento con un solo clic.",
            "<b>Selectores de Resolución y Motor con Opciones Automáticas Duales:</b> Se reemplaza el checkbox de auto-detección por dos opciones nativas en la lista de Resolución: <code>📐 Auto (Detección General / Píxeles)</code> y <code>⚡ Auto Higgsfield (Metadata Job)</code>. Misma lógica implementada en el selector de Motor, permitiendo alternar entre el preset del proyecto y el motor reportado por Higgsfield AI.",
            "<b>Aislamiento Total de Configuraciones en la Cola de Ingesta (Batch Queue):</b> Cada archivo de la cola preserva de manera independiente su propia subcarpeta (WIP, Ref, Export), motor, resolución, encuadre (Framing) y tags de compo/proceso. Seleccionar una fila resalta visiblemente el ítem e ilumina sus parámetros en el Builder sin sobreescribir ni contaminar el resto de los archivos en lista."
        ]
    },
    {
        "version": "v1.1.24",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>File Auditor con Filtro de Ramón («Solo mis tareas»):</b> Se añade control de filtrado directo por tareas asignadas en Ramón en ambas pestañas (<i>Mirror Integrity</i> y <i>Render & Scene Status</i>), permitiendo auditar y visualizar al instante únicamente los planos y assets asignados al usuario en el proyecto actual.",
            "<b>Deep Compare para Secuencias de Render:</b> Inspección minuciosa de archivos de secuencia en Media para detectar gaps de numeración (frames ausentes dentro del rango) y archivos dañados (frames de 0 bytes). Se incorporan alertas de <code>⚠️ INCOMPLETO</code>, detalle de frames faltantes en el listado y filtro dedicado en la barra de pestañas.",
            "<b>Cotejo Cruzado contra Google Drive (☁️ Comparar contra Drive):</b> Opción para verificar la sincronía del proyecto y de los renders locales contra los catálogos modulares de Google Drive en 0 ms. Detecta si Drive posee una versión más nueva de escena o render (<code>☁️ Más nuevo en Drive</code>) o si el usuario cuenta con archivos locales aún no subidos a la nube (<code>⬆️ Falta subir</code>)."
        ]
    },
    {
        "version": "v1.1.23",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Modo Deep Compare Inteligente (Fast vs Deep):</b> Conmutador <code>[⚡ FAST]</code> / <code>[🔬 DEEP]</code> en la barra superior («Comparar») y en <i>Sync Analyzer</i>. El modo Fast es instantáneo (0 ms) por nombres y detección de secuencias; el modo Deep Compare evalúa tamaños en bytes y fechas de modificación para detectar archivos corruptos, truncados a 0 bytes o versiones más recientes en Drive/Server.",
            "<b>Validación Fidedigna de Secuencias de Imágenes Parciales:</b> Corregido el bug donde secuencias a medio descargar mostraban tilde verde <code>✓</code> por heredar el estado del primer frame. Ahora detecta faltantes con la insignia <code>⬇️* Bajar (N faltantes)</code> y encola quirúrgicamente para descarga exclusiva los frames faltantes.",
            "<b>Pestaña «Diferencias» en Sync Analyzer:</b> Detección visual de discrepancias de tamaño o versiones más nuevas en local u online, permitiendo resolver diferencias con subidas o bajadas dirigidas."
        ]
    },
    {
        "version": "v1.1.22",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Ventana Flotante y Móvil de Confirmación de Sincronización:</b> Sustituido el diálogo nativo del navegador (<code>confirm</code>) por una interfaz moderna, flotante y arrastrable con la estética de <i>Sync Queue</i>. Permite visualizar claramente el nombre del elemento, tamaño, rutas de origen y destino en cajas seleccionables, método de red utilizado y control por teclado (<code>Enter</code> para confirmar, <code>Esc</code> para cancelar)."
        ]
    },
    {
        "version": "v1.1.21",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Actualización Dirigida en Vivo del Explorador (Sin Colapsos ni Recargas):</b> Eliminado por completo el colapso visual y la recarga en cascada del árbol del explorador al finalizar descargas o subidas. Los elementos descargados o subidos actualizan su insignia a <code>✓</code> y retiran su clase fantasma en el DOM de forma inmediata y quirúrgica sin parpadeos.",
            "<b>Refresco In-Place de Contenido de Carpetas y Conteo de Pendientes:</b> Las carpetas contenedoras actualizan sus contadores de pendientes (<code>⬇️* (N)</code> / <code>✓</code>) en tiempo real hacia arriba en la jerarquía. Si se transfiere una carpeta completa que se encuentra abierta, solo se actualizan sus elementos hijos directos sin reiniciar el árbol raíz ni descolapsar carpetas hermanas.",
            "<b>Eliminación del Flash de Encolado al Subir:</b> Suprimida la recarga prematura que reiniciaba el explorador al solicitar una orden de subida a Drive o Servidor Central."
        ]
    },
    {
        "version": "v1.1.20",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Carga de Catálogo Bajo Demanda («Cargar Catálogo de Proyecto»):</b> Al abrir Pipeta por primera vez o seleccionar un proyecto sin caché local, se presenta una tarjeta centrada para inicializar el catálogo modular en ~1 segundo, evitando descargas masivas de proyectos históricos o ajenos.",
            "<b>Eliminación Completa de Catálogos Monolíticos (~50 MB):</b> La lectura y sincronización de catálogos opera exclusivamente sobre arquitectura modular (<code>manifest.json</code> y subcatálogos particionados). El worker y el servidor dejaron de generar archivos monolíticos pesados, purificando más de 320 MB de almacenamiento redundante.",
            "<b>Persistencia del Último Proyecto Activo:</b> Al iniciar el servidor o la app, Pipeta recuerda automáticamente el último proyecto trabajado y sincroniza únicamente sus datos modulares sin sobrecargar la red ni emitir logs innecesarios.",
            "<b>Empaquetador Portable con Selector Granular de Cachés:</b> Subsanada la exclusión de Python al desmarcar Ramón y agregados selectores para incluir u omitir cachés modulares de Drive y Server en el paquete .zip."
        ]
    },
    {
        "version": "v1.1.19",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Insignia de Sincronización Pendiente en Carpetas Contenedoras (*):</b> Todas las carpetas que contengan archivos faltantes o desactualizados en niveles inferiores ahora muestran una insignia visual explícita (<code>⬇️* Bajar (N)</code> o <code>⬆️* Subir</code>) con el conteo de archivos pendientes, evitando falsos vistos verdes (✓) antes de desplegar la jerarquía completa.",
            "<b>Cálculo Instantáneo de Tamaños de Raíces y Caché en Memoria (0 ms):</b> Se integraron las estadísticas de manifiestos modulares y una memoria caché para consultas de tamaño de directorios (<code>/api/fs/dirSize</code>), eliminando por completo las ejecuciones recursivas y repetitivas de PowerShell que ralentizaban la navegación y el cambio entre vistas LOCAL, DRIVE y SERVER.",
            "<b>Propagación Precisa de Estados en Vista LOCAL vs DRIVE:</b> Corregida la sincronización de estados entre el catálogo en caché y el explorador del disco local, permitiendo disparar la descarga de carpetas completas directamente desde cualquier nivel contenedor."
        ]
    },
    {
        "version": "v1.1.18",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Optimización Total del Switch de Vistas (LOCAL / DRIVE / SERVER):</b> Eliminada la descarga y parseo de catálogos monolíticos pesados al alternar ubicaciones. Las consultas de carpetas en DRIVE y SERVER se resuelven de forma modular y bajo demanda en milisegundos.",
            "<b>Respuesta Visual Inmediata y Tokens de Renderizado Anti-Carrera:</b> La barra de herramientas responde al instante (0 ms) y se implementaron tokens de cancelación de render para evitar parpadeos, pantallas en negro o solapamientos al alternar rápidamente entre modos de exploración.",
            "<b>Normalización Universal de Rutas de Proyectos:</b> Se garantiza el formateo canónico de barras (slashes) en raíces locales, de red y de Google Drive para evitar discordancias en árboles de directorios de cualquier proyecto."
        ]
    },
    {
        "version": "v1.1.17",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Selector de Perfil de Ubicación (Estudio vs Home Office):</b> Se incorporó en la pestaña Sincronización un selector directo con opciones <code>[ ESTUDIO ]</code>, <code>[ HOME ]</code> y <code>[ AUTO ]</code> para fijar el comportamiento de cada puesto independientemente de la subred o VPN de cada sede.",
            "<b>Protección y Auto-Sanitización de Presets de Proyectos:</b> Se corrigió la sincronización de presets entre red y disco local (removiendo exclusiones agresivas en robocopy) e implementando auto-sanitización de rutas para impedir que presets desfasados apunten a carpetas incorrectas.",
            "<b>Refresco Reactivo de Diagnósticos de Red:</b> Se eliminaron bloqueos en la interfaz de sincronización asegurando que los estados de conectividad, Z y worker se rendericen inmediatamente al concluir el diagnóstico."
        ]
    },
    {
        "version": "v1.1.16",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Auto-Activación y Supervisión Continua del Worker:</b> Al enviar cualquier orden de descarga o subida a Google Drive, si el Worker Central de red no está activo, Pipeta lanza automáticamente el Worker Local en segundo plano sin requerir que el usuario lo abra manualmente. Además, un supervisor periódico levanta el worker local automáticamente si detecta transferencias pendientes.",
            "<b>Blindaje Anti-Cierre del Worker Local:</b> Se agregaron controladores de excepciones no capturadas y promesas rechazadas a nivel de proceso en <code>sync_worker.js</code>, impidiendo cierres inesperados durante transferencias complejas o actualizaciones de catálogos.",
            "<b>Prioridad de Estado Local en Sync Queue:</b> La interfaz de la cola reporta inmediatamente el estado activo del Worker Local sin enmascararse por estados inactivos remotos."
        ]
    },
    {
        "version": "v1.1.15",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Worker Local en Segundo Plano para Equipos Externos:</b> Permite iniciar o detener con un solo clic un Sync Worker local en segundo plano directamente desde la cola de transferencias (Sync Queue ⚡). El worker local se auto-configura con Rclone local sin necesidad de acceder a la red del estudio ni a la VM 105.",
            "<b>Cancelación y Eliminación de Tareas en Vivo:</b> Ahora es posible cancelar tareas activas o en cola en cualquier momento mediante el botón <code>✕ Cancelar</code>. El worker interrumpe la transferencia de Rclone de inmediato y libera los recursos.",
            "<b>Limpieza de Historial:</b> Se agregó el botón <code>🗑️ Limpiar Historial</code> para purgar fácilmente registros de tareas completadas, fallidas o canceladas.",
            "<b>Filtrado Estricto de Tareas por Usuario:</b> Cada usuario visualiza únicamente sus propias descargas y subidas garantizando total privacidad. Los administradores disponen de un selector para alternar entre \"Mis Tareas\" y la vista global.",
            "<b>Eliminación de Timeouts y Bloqueos SMB en Remoto:</b> Se blindó la lectura de catálogos y sub-catálogos de Google Drive para evitar cualquier intento de sondeo a rutas UNC o Z: inexistentes en máquinas externas, logrando una navegación instantánea."
        ]
    },
    {
        "version": "v1.1.14",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Aislamiento y Modo Exclusivo para Equipos Externos (Home / WAN):</b> En máquinas remotas o de artistas en casa (detectadas por ausencia de LAN del estudio o inicio de sesión en Ramón WAN), Pipeta oculta y deshabilita automáticamente el modo Servidor Central y sus comparaciones. El equipo trabaja exclusivamente en modo <code>LOCAL</code> y <code>GOOGLE DRIVE</code>, eliminando por completo intentos de lectura o bloqueos por catálogos centrales de red.",
            "<b>Compatibilidad Total con Puestos del Estudio:</b> Los puestos locales del estudio y máquinas virtuales de desarrollo (donde Z: es una unidad virtual o subst pero existe conectividad interna LAN) conservan intacta la funcionalidad completa de Servidor Central y catálogos centrales.",
            "<b>Detección Instantánea No Bloqueante:</b> La comprobación de entorno de red y Ramón remoto se ejecuta mediante sondeo directo ultra-rápido en backend y se sincroniza en tiempo real al iniciar sesión sin requerir recargar la página."
        ]
    },
    {
        "version": "v1.1.13",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Soporte Multi-Servidor WAN/LAN de Ramón (Acceso Remoto sin VPN):</b> Se incorporó soporte nativo para el endpoint seguro remoto <code>https://ramon.lasp.co:8075/</code> utilizado en el pipeline del estudio. Ahora los artistas que trabajen desde sus casas o equipos remotos sin conexión VPN pueden iniciar sesión y consultar tareas en Ramón directamente.",
            "<b>Detección Ultra-Rápida de Conexión (Fast Probe):</b> Se implementó sondeo preventivo de sockets con timeout corto (1.5s) y caché persistente de servidor en disco, eliminando los bloqueos por WinError 10060 de Windows y previniendo cierres de proceso por timeout (\"código null\").",
            "<b>Reintentos Autónomos y Tolerancia a Fallos:</b> Si cambia el entorno de red (ej. de casa al estudio), Pipeta invalida la caché automáticamente y descubre el nuevo endpoint disponible de forma transparente."
        ]
    },
    {
        "version": "v1.1.12",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Corrección del Filtro de Ramón en el Explorador:</b> Se resolvió la discrepancia entre códigos de proyecto (ej. <code>SURF</code> vs <code>surf_love</code>, <code>PRPR</code> vs <code>pride_and_prejudice</code>), asegurando que el botón de Mis Tareas de la barra superior filtre de manera instantánea y precisa las carpetas del proyecto según los planos y assets asignados al usuario en Ramón.",
            "<b>Aislamiento Estricto de Planos Hermanos:</b> Se restringió el matcheo dentro de la carpeta de shots/planos para que únicamente se muestre el plano asignado (ej. <code>SURF_B01_003_0020</code>) descartando planos hermanos que compartan secuencia o prefijo (como <code>0010</code>, <code>0030</code>, <code>0040</code>).",
            "<b>Auto-despliegue del Árbol de Tareas:</b> En la vista dividida (Split View), al activar el filtro de Ramón las carpetas intermedias se despliegan automáticamente guiando la vista hasta el plano o asset asignado.",
            "<b>Feedback Visual Claro en Vistas:</b> Se añadieron estados informativos cuando no existen tareas asignadas en el proyecto actual tanto en Split View como en Miller Columns, evitando que la vista permanezca sin filtrar."
        ]
    },
    {
        "version": "v1.1.11",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Empaquetador con Selector de Dependencias de Ramón:</b> Ahora se puede elegir si el <code>.zip</code> portable incluye o no las dependencias de Ramón (Python 3.10 portable y librería cliente de TACTIC). Si se incluye, genera <code>Pipeta_v1.1.11_Ramon.zip</code> listo para usuarios externos; si no, genera <code>Pipeta_v1.1.11.zip</code> ligero para actualizaciones de rutina.",
            "<b>Rclone Autónomo en Versión Portable:</b> Se incluyó la configuración maestra de Google Drive (<code>tools/rclone/rclone.conf</code>) dentro del paquete para permitir transferencias directas de subida y bajada a Drive sin requerir unidad G: montada.",
            "<b>Soporte Autónomo de TACTIC Client:</b> Se incorporó <code>tactic_client_lib</code> localmente en Pipeta, permitiendo conexiones directas a <code>ramon.lasp.co</code> sin mapeo de red del estudio."
        ]
    },
    {
        "version": "v1.1.10",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Detección Inteligente de Python para Ramón:</b> Pipeta ahora detecta y utiliza de forma transparente el intérprete de Python del estudio (<code>Z:INTERNOTOOLSGITHUBTOOLSpythonpython.exe</code>), instalaciones locales estándar o Python Launcher, eliminando el fallo por alias de Microsoft Store en puestos nuevos. Se integró la librería <code>six.py</code> de forma nativa en el puente de Ramón.",
            "<b>Inicio de Sesión de Ramón en Selector de Cabecera:</b> Se incorporó la opción <code>🌐 + Iniciar Sesión con Ramón...</code> directamente en el desplegable de usuarios y se aseguró su visibilidad permanente en el menú de usuario para poder conectar múltiples cuentas de red del estudio con total fluidez.",
            "<b>Blindaje de Usuario Admin Local:</b> El administrador del sistema queda protegido de forma estricta como usuario local, previniendo etiquetas o modos erróneos de Ramón."
        ]
    },
    {
        "version": "v1.1.09",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Filtro de \"Mis Tareas\" en IA Ingest:</b> Se incorporó el botón de filtro con el icono oficial de Ramón junto a <code>1. TARGET</code>. Al activarse, los selectores de jerarquía (Episodio, Escena y Shot) se restringen de forma automática e instantánea únicamente a los planos asignados al usuario en Ramón."
        ]
    },
    {
        "version": "v1.1.08",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Filtrado Inteligente de Ramas Estructurales:</b> Las carpetas contenedoras raíz (<code>episodios</code>, <code>assets2D</code>, <code>assets3D</code>) ahora solo se muestran si el usuario tiene al menos una tarea asignada en esa categoría en Ramón, evitando carpetas de assets vacías para artistas de planos (y viceversa)."
        ]
    },
    {
        "version": "v1.1.07",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Restauración del Icono Oficial de Ramón en Filtro:</b> Reincorporación del logo oficial de Ramón (<code>icons/ramon.png</code>) en el botón de filtro de tareas de la barra del explorador con soporte para estado activo y atenuado.",
            "<b>Refresco Instantáneo al Activar Filtro:</b> El filtrado de \"Mis Tareas\" ahora se aplica de inmediato (0 ms) en pantalla sin requerir pulsar manualmente el botón de refresh, sincronizando tareas en segundo plano sin congelar la interfaz.",
            "<b>Corrección de Contexto en Árbol de Carpetas:</b> Se corrigió la identificación del contenedor (<code>tree-work</code> vs <code>tree-media</code>) durante la expansión de carpetas para garantizar el filtrado correcto en todas las subcarpetas del proyecto."
        ]
    },
    {
        "version": "v1.1.06",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Sincronización Dinámica de Drive en Vista Local:</b> La comparación entre disco Local y Google Drive ahora consulta en tiempo real los subcatálogos modulares frescos desde la caché central (vía UNC SMB directo), reconociendo de inmediato archivos descargados o preexistentes sin falsos avisos de \"Subir a Drive\".",
            "<b>Mapeo Bidireccional Local-Drive:</b> Los subcatálogos modulares ahora indexan y resuelven peticiones tanto por rutas virtuales de Google Drive como por rutas locales (Z:), logrando coincidencia instantánea (✓ Sincronizado).",
            "<b>Refresco Automático de Subcatálogos al Descargar:</b> El Worker y Pipeta actualizan e invalidan quirúrgicamente los subcatálogos afectados tras descargas exitosas desde Google Drive."
        ]
    },
    {
        "version": "v1.1.05",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Descarga y Subida Directa UNC (Sin Letra de Unidad):</b> En máquinas virtuales y puestos donde Z: es un disco virtual local, las descargas y subidas desde/hacia el Servidor Central se resuelven directamente vía protocolo SMB / UNC (<code>\\192.168.206.116Z</code>) sin requerir el mapeo de unidades adicionales.",
            "<b>Gestión de Credenciales SMB:</b> Panel de conexión directa al Servidor Central en Configuración con opción de usuario, contraseña y prueba de conectividad en tiempo real.",
            "<b>Resolución Automática de Rutas en Copia:</b> El endpoint de copia de archivos detecta automáticamente el contexto del servidor y redirige la lectura física al recurso compartido central."
        ]
    },
    {
        "version": "v1.1.04",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Detección Precisa de Entorno SMB:</b> Reconocimiento instantáneo y certero de estaciones de trabajo donde Z: es el servidor real de producción. Se desactiva y oculta limpiamente el modo SERVER en estos puestos.",
            "<b>Erradicación Total de Prefijo S:</b> Sanitización completa de rutas y catálogos bajo el canon de estudio Z:. Ni en el Explorer, ni en árboles de carpetas ni en cabeceras se expondrán rutas de desarrollo locales.",
            "<b>Sincronización Transparente con Worker Central:</b> En entornos virtuales o de desarrollo, las peticiones de catálogo consultan y delegan directamente al Worker de red, visualizando en tiempo real archivos como ejecutables y assets del servidor central."
        ]
    },
    {
        "version": "v1.1.03",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Unificación de Almacenamiento:</b> Eliminación del modo \"SERVER\" en estaciones estándar para evitar discrepancias, explorando exclusivamente LOCAL (Z:) y DRIVE (G: o Catálogo).",
            "<b>Sonda HTTP Real de Internet:</b> Reemplazo de resolución DNS por comprobación HTTP transparente (<code>generate_204</code>).",
            "<b>Refresco Directo al Worker:</b> Botón manual de refresco delega directamente al Worker central."
        ]
    },
    {
        "version": "v1.1.02",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Sincronización Quirúrgica del Catálogo:</b> Inyección instantánea (&lt;5ms) y refresco específico por Rclone de carpetas subidas a Google Drive.",
            "<b>Detección Persistente de Entorno:</b> Detección única de internet y discos guardada por equipo (<code>env_state.json</code>), con bloqueo automático de llamadas web innecesarias en puestos aislados.",
            "<b>Corrección de Rutas en Clientes:</b> Detección robusta de subcarpetas en proyectos cuyos nombres o clientes contienen subcadenas reservadas."
        ]
    },
    {
        "version": "v1.1.0",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Sync Analyzer & Google Drive:</b> Motor de análisis y sincronización contra Google Drive (G:), catálogo offline para comparación ultrarrápida, escaneo filtrado por tareas asignadas (\"Solo mis shots\") y resolución interactiva de conflictos.",
            "<b>Integración Ramón (TACTIC):</b> Autenticación de dominio en caliente, panel de \"Mis Tareas\" en cabecera y auto-registro transparente de artistas en la base local con asignación de roles.",
            "<b>Consola de Diagnóstico & Logs:</b> Visor de eventos en tiempo real con filtrado por niveles (INFO, WARN, ERROR), persistencia diaria en disco (formato JSONL) y descargas para soporte.",
            "<b>Rediseño de Configuraciones & Presets:</b> Nueva distribución intuitiva en categorías (Interfaz, Atajos, Proyectos, Usuarios, Avanzado), unificación de configuración local (Estados y Workflow) y panel centralizado de actualización y empaquetado.",
            "<b>Arquitectura de Producción Oficial:</b> Consolidación del runtime en el puerto canónico 3002 y unificación definitiva de la rama de desarrollo a producción."
        ]
    },
    {
        "version": "v1.0.02",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Detección de Instancia en Acceso Directo:</b> Si Pipeta ya está en ejecución, el acceso directo abre directamente el navegador sin provocar bloqueos ni errores de puerto ocupado.",
            "<b>Ruta Default de Exportación de Paquetes:</b> Destino predeterminado de compresión y publicación establecido en <code>Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS</code>."
        ]
    },
    {
        "version": "v1.0.01",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Versión Oficial de Estudio:</b> Lanzamiento de Pipeta 1.0 para todo el equipo.",
            "<b>Migración & Publicación Automatizada:</b> Ubicación canónica en <code>APPS\\Pipeta</code> y flujo de publicación directo a <code>S:</code> (el <code>Z:</code> real de los artistas).",
            "<b>Actualizador Multi-Origen:</b> Detección automática tanto en unidad mapeada como en recurso compartido <code>\\\\LASP-VM\\Pipeta</code>.",
            "<b>Plantillas v001 en Shot & Asset Creator:</b> Creación automatizada de archivos v001 con resolución canónica de extensiones y templates configurables por proceso y proyecto."
        ]
    },
    {
        "version": "v0.9.72",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Exportación Completa de Presets & Configs:</b> Se integró el respaldo y publicación de <code>users_config.json</code> (Usuarios & Roles) y <code>status_config.json</code> (Diseñador de Estados) en la herramienta de exportación.",
            "<b>Visualización Exhaustiva de Permisos:</b> Las tarjetas de rol en User Settings muestran directamente el desglose completo de las 5 categorías y 21 permisos sin necesidad de abrir el editor.",
            "<b>Autocompletado LASP & UI Limpia:</b> Autocompletado dinámico <code>lasp-[inicial][apellido]</code> en tiempo real y placeholders actualizados.",
            "<b>Filtrado de Procesos Canónicos en Shot Navigator:</b> Eliminadas carpetas fantasma intermedias (2D, 3D) y alineación estricta con el Work Tree del Shot Designer."
        ]
    },
    {
        "version": "v0.9.71",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>User Settings Completo:</b> Modal interactivo unificado para crear y editar usuarios.",
            "<b>Gestión de Roles & Permisos:</b> Control de acceso granular por rol y bloqueo visual en UI.",
            "<b>Diseñador de Estados Canónico:</b> Estado por defecto <code>Ninguno</code>."
        ]
    },
    {
        "version": "v0.9.70",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Shot Navigator:</b> Módulo completo con jerarquía visual de episodios, escenas y planos, procesos dinámicos y creación de carpetas por selección.",
            "<b>Preset Cleanup:</b> Eliminado preset fantasma y unificación dinámica con las Opciones de Proyecto."
        ]
    },
    {
        "version": "v0.9.64",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Origen UNC Exclusivo:</b> Actualizador configurado estrictamente contra <code>\\\\LASP-VM\\Pipeta</code> sin fallbacks a unidades de red locales potencialmente desactualizadas.",
            "<b>Abrir en Explorer:</b> Desacople con spawn detached para cualquier usuario y detección automática de archivo vs carpeta.",
            "<b>Barra de Explorer:</b> Botón Borrar reubicado a la derecha de Nueva Carpeta."
        ]
    },
    {
        "version": "v0.9.61",
        "badge": "",
        "accentColor": "#555",
        "items": [
            "<b>Icono de Pipeta:</b> Generación de icono multirresolución <code>Pipeta.ico</code> y asignación en accesos directos."
        ]
    }
];

window.renderPipetaPatchNotesHtml = function () {
    const notes = Array.isArray(window.PIPETA_PATCH_NOTES) ? window.PIPETA_PATCH_NOTES : [];
    const currentVersion = (typeof window !== 'undefined' && window.APP_VERSION) ? window.APP_VERSION : 'v2.0.0-beta.1';

    const blocksHtml = notes.map((entry, idx) => {
        const isCurrent = idx === 0 || !!entry.badge;
        const borderColor = entry.accentColor || (isCurrent ? '#00e5ff' : '#555');
        const titleColor = isCurrent ? '#00e5ff' : (borderColor === 'var(--accent)' ? '#fff' : '#aaa');
        const badgeText = entry.badge ? ` (${entry.badge})` : '';
        const itemsHtml = (entry.items || []).map(item => `<li>${item}</li>`).join('\n                                    ');

        return `
                            <div style="margin-bottom:16px; border-left:3px solid ${borderColor}; padding-left:12px;">
                                <div style="font-weight:bold; color:${titleColor}; font-size:0.88rem;">${entry.version}${badgeText}</div>
                                <ul style="margin:4px 0 0 16px; padding:0; font-size:0.8rem; color:#ccc; line-height:1.45;">
                                    ${itemsHtml}
                                </ul>
                            </div>`;
    }).join('\n');

    return `
                    <div style="height:25px;"></div>

                    <!-- HEADER: VERSION & PATCH NOTES -->
                    <h3 style="margin-top:0; border-bottom:1px solid #333; padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                        <span>🚀 Versión / Patch Notes</span>
                        <span style="font-size:0.8rem; background:var(--accent); color:black; font-weight:bold; padding:2px 10px; border-radius:4px;">
                            ${currentVersion}
                        </span>
                    </h3>

                    <!-- CARD: HISTORIAL DE VERSIONES & PATCH NOTES -->
                    <div style="background:rgba(255,255,255,0.03); padding:18px; border-radius:8px; border:1px solid #333;">
                        <div style="font-weight:bold; color:var(--accent); margin-bottom:12px; font-size:0.95rem;">
                            📋 Notas de la Versión (Patch Notes)
                        </div>

                        <div style="max-height:480px; overflow-y:auto; padding-right:8px; font-size:0.8rem; line-height:1.6;">
${blocksHtml}
                        </div>
                    </div>
    `;
};
