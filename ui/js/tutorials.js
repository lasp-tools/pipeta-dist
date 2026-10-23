// ------------------------------------------------------------
// --- TUTORIALS MODULE (GUIAS Y DOCUMENTACIÓN DE PIPELINE) ---
// ------------------------------------------------------------

const Tutorials = {

    tutorials: [
        {
            id: 'shot-navigator',
            icon: 'icons/video_camera_back.svg',
            title: 'Shot Navigator & Ramón',
            subtitle: 'Tracking de Planos, Procesos y Mis Tareas',
            color: '#2196F3',
            content: `
                <h2 style="margin-top:0; color:#2196F3;">🎬 Shot Navigator & Tracking de Planos</h2>
                <p style="color:#ccc; line-height:1.8;">El módulo <b>Shot Navigator</b> es el centro de control del workflow de planos para producción. Permite supervisar en tiempo real el progreso de cada plano, sus procesos técnicos asociados (composición, 3D, IA, tracking, rotoscopía), la asignación de artistas y la sincronización con la base de datos central de <b>Ramón (TACTIC)</b>.</p>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Jerarquía de Navegación</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <ul style="padding-left:20px; color:#ccc; line-height:2;">
                        <li><b style="color:#fff;">📦 Jerarquía Izquierda:</b> Explora por <b>Episodios</b> y <b>Secuencias</b> con conteo automático de planos aprobados vs totales y porcentaje de avance.</li>
                        <li><b style="color:#fff;">📋 Acordeón Central de Planos:</b> Listado tabular de planos con sub-filas expandibles (⊞ / ⊟) para inspeccionar cada proceso individualmente.</li>
                        <li><b style="color:#fff;">🔍 Inspector Lateral Derecho:</b> Muestra detalles técnicos (código Ramón, frames In/Out, estado general, notas locales del plano y selector de artistas).</li>
                    </ul>
                </div>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Los 10 Estados Canónicos de Producción</h3>
                <p style="color:#aaa; font-size:0.85rem;">En proyectos sincronizados con Ramón, se aplican estrictamente los 10 estados oficiales del estudio:</p>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:8px; margin-bottom:20px;">
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#757575;">⚪</span> <b>PENDIENTE</b></div>
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#2196f3;">🔵</span> <b>ASIGNADO</b></div>
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#ff9800;">🟠</span> <b>PROCESO</b></div>
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#9c27b0;">🟣</span> <b>REVISAR</b></div>
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#8bc34a;">🟢</span> <b>INT APROBADO</b></div>
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#ff5722;">🔴</span> <b>AJUSTAR</b></div>
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#4caf50;">🟢</span> <b>APROBADO</b></div>
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#ffc107;">🟡</span> <b>STAND BY</b></div>
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#f44336;">🔴</span> <b>CANCELADO</b></div>
                    <div style="background:#14171d; border:1px solid #333; padding:8px 10px; border-radius:6px; font-size:0.8rem; color:#eee;"><span style="color:#f44336;">🔴</span> <b>ELIMINADO</b></div>
                </div>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Modos de Estado Root (Fórmula de Resumen)</h3>
                <p style="color:#ccc; font-size:0.9rem;">El selector de <b>Estado Root</b> define cómo se calcula el color general del plano:</p>
                <ul style="list-style:none; padding:0; line-height:2;">
                    <li style="color:#aaa;">🤖 <b style="color:#fff;">Automático (Recomendado):</b> Sintetiza los procesos. Si algún proceso está en <i>Ajustar</i> o <i>Revisar</i>, el plano alerta inmediatamente. Si todos los procesos están aprobados, el plano se marca como <i>Aprobado</i>.</li>
                    <li style="color:#aaa;">🎯 <b style="color:#fff;">General (Manual):</b> Respeta el estado global asignado manualmente en el inspector sin computar procesos.</li>
                    <li style="color:#aaa;">🛠️ <b style="color:#fff;">Por Proceso Específico:</b> Filtra y muestra directamente el estado de un departamento clave (ej. <code>Compo</code> o <code>IA</code>).</li>
                </ul>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Filtro Rápido "Mis Tareas" & Sincronización</h3>
                <div style="background:#1a2a3a; padding:12px; border-radius:8px; border-left:4px solid #2196F3; margin-top:10px;">
                    <span style="color:#64b5f6; font-weight:bold;">⚡ Filtro de Artista:</span>
                    <span style="color:#ccc;"> En la barra superior de herramientas, pulsa el botón con el icono de Ramón para aislar instantáneamente únicamente los planos que tienes asignados. Pulsa <b>↻ Sincronizar Ramón</b> para actualizar al instante las nuevas tareas asignadas por producción.</span>
                </div>
            `
        },
        {
            id: 'ia-ingest',
            icon: 'icons/chip-ai.svg',
            title: 'IA Ingest & Nomenclatura',
            subtitle: 'Canon VFX, Estructura IA y Flujo Nuke',
            color: '#4CAF50',
            content: `
                <h2 style="margin-top:0; color:#4CAF50;">🤖 IA Ingest & Canon de Nomenclatura VFX</h2>
                <p style="color:#ccc; line-height:1.8;">Módulo especializado para la ingesta ordenada y estandarizada de material generado con Inteligencia Artificial (Seedance, Google Veo, Nano Banana, etc.) directamente en la estructura de Media del plano.</p>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">Canon Oficial de Nomenclatura</h3>
                <div style="background:#111; padding:14px; border-radius:8px; font-family:monospace; color:#8f8; font-size:0.95rem; margin-bottom:12px; border:1px solid #333;">
                    [SHOT_ID]_[MOTOR]_[RESOLUCIÓN]_[FRAMING]_[TAG/ROLE]_v[VERSIÓN].[EXT]
                </div>
                <p style="color:#aaa; font-size:0.85rem; margin-bottom:20px;">Ejemplo: <code>SURF_B03_066_1200_SD2_UHD_FLL_start1001-i2v_v001.mp4</code></p>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">Estructura Canónica de la Carpeta <code>IA/</code> en Media</h3>
                <p style="color:#ccc; font-size:0.9rem;">Dentro de la carpeta Media de cada plano (<code>.../shots/[SHOT_ID]/IA/</code>), se organizan 4 subdirectorios estandarizados:</p>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold; width:170px;">📁 IA/ (Root)</td>
                        <td style="padding:8px; color:#999;">Descargas brutas en progreso (WIP) obtenidas de las plataformas web de IA.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold;">📁 IA/export/</td>
                        <td style="padding:8px; color:#999;">Versiones finales aprobadas para composición (video o secuencia consolidada).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold;">📁 IA/ref/</td>
                        <td style="padding:8px; color:#999;">Material de referencia o start/end frames utilizados para alimentar los modelos de IA.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold;">📁 IA/enc/ (Encode)</td>
                        <td style="padding:8px; color:#999;">Secuencias de imágenes PNG a 24 fps convertidas desde los MP4 de IA, organizadas en subcarpetas para lectura limpia en Nuke.</td>
                    </tr>
                </table>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">Flujo de Exportación Nuke hacia IA (<code>exportIA</code>)</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <ol style="padding-left:20px; color:#ccc; line-height:2; font-size:0.88rem;">
                        <li><b style="color:#fff;">Color RAW con OcioDisplay:</b> Exporta la secuencia PNG configurada como <b>RAW</b> en el nodo Write, insertando previamente un nodo <b>OcioDisplay</b> para fijar el espacio de color visual.</li>
                        <li><b style="color:#fff;">Duración Mínima (4s / 96 frames):</b> Para generación de video (ej. Seedance), todo export debe tener un <b>mínimo estricto de 96 frames a 24 fps</b>. Si el plano dura menos, congela (hold) el último fotograma hasta completar los 96 cuadros.</li>
                        <li><b style="color:#fff;">Conversión a MP4:</b> Convierte la secuencia PNG a <code>.mp4</code> (H.265 a 24 fps) y ubícala en la raíz de <code>exportIA/</code> junto a la carpeta de PNGs.</li>
                    </ol>
                </div>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">Captura Automática de Descargas de Chrome</h3>
                <p style="color:#ccc; font-size:0.9rem;">Pipeta incluye un <b>Watcher de Descargas</b>. Al activar <i>"Captura Automática"</i> y configurar Chrome para no preguntar la ruta de guardado, cada archivo descargado de Seedance o Google Veo se detecta al vuelo, se renombra según el canon seleccionado y queda listo para ingesta con un solo clic.</p>
            `
        },
        {
            id: 'ramon-tasks',
            icon: 'icons/ramon.png',
            title: 'Ramón (TACTIC) & Mis Tareas',
            subtitle: 'Doble Login, Tareas de Red y Solo Lectura',
            color: '#00E5FF',
            content: `
                <h2 style="margin-top:0; color:#00E5FF;">👥 Ramón (TACTIC) & Gestión de Tareas</h2>
                <p style="color:#ccc; line-height:1.8;">Pipeta se integra de forma directa con el sistema central de gestión de producción <b>Ramón (TACTIC)</b> del estudio (<code>http://ramon.lasp.co</code>), permitiendo a los artistas consultar sus asignaciones, estados y notas técnicas sin salir de la herramienta.</p>

                <h3 style="color:#00E5FF; border-bottom:1px solid #333; padding-bottom:5px;">Doble Modalidad de Login</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#00E5FF; margin-top:0;">🌐 Sesión Ramón / Dominio (Red)</h4>
                        <p style="color:#999; font-size:0.85rem; line-height:1.7;">
                            Autentica contra el Active Directory del estudio usando tu usuario corporativo (ej: <code>lasp-mpastorino</code>). Permite recibir tareas asignadas en tiempo real, filtrar planos personales en Shot Navigator y visualizar prioridades.
                        </p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">💻 Sesión Local / Administrador</h4>
                        <p style="color:#999; font-size:0.85rem; line-height:1.7;">
                            Modo diseñado para supervisión, máquinas offline o puestos sin credenciales de red. Permite operar de forma autónoma con la base de datos local del proyecto.
                        </p>
                    </div>
                </div>

                <h3 style="color:#00E5FF; border-bottom:1px solid #333; padding-bottom:5px;">Panel "Mis Tareas" en la Barra Lateral</h3>
                <p style="color:#ccc; font-size:0.9rem;">
                    Al hacer clic en el icono de Ramón en la barra lateral izquierda, se abre el panel flotante de tareas. Desde allí puedes:
                </p>
                <ul style="list-style:none; padding:0; line-height:2;">
                    <li style="color:#aaa;">📌 Ver todas las tareas asignadas agrupadas por proyecto y departamento.</li>
                    <li style="color:#aaa;">🎬 Hacer clic en cualquier plano para saltar inmediatamente a su ubicación en <b>Shot Navigator</b> o en el <b>Explorer</b>.</li>
                    <li style="color:#aaa;">🔄 Refrescar la caché de tareas con el botón de actualización.</li>
                </ul>

                <div style="background:#2a1a1a; padding:12px; border-radius:8px; border-left:4px solid #f44336; margin-top:15px;">
                    <span style="color:#ff5252; font-weight:bold;">🔒 Regla de Seguridad Crítica:</span>
                    <span style="color:#ccc;"> Toda interacción de Pipeta con Ramón es <b>estrictamente de solo lectura</b> (consultas vía API). Pipeta nunca modifica, inserta ni borra datos en el servidor de Ramón, garantizando total estabilidad.</span>
                </div>
            `
        },
        {
            id: 'explorer',
            icon: 'icons/view_classic.svg',
            title: 'Explorer & Navegación',
            subtitle: 'Split, Miller, Ubicaciones y Comparación Cloud',
            color: '#FF9800',
            content: `
                <h2 style="margin-top:0; color:#FF9800;">🗂️ Explorer & Integridad de Estructura</h2>
                <p style="color:#ccc; line-height:1.8;">El <b>Explorer</b> es el gestor de archivos especializado para VFX de Pipeta. Permite inspeccionar en profundidad la estructura de carpetas de Proyecto y Media, gestionar secuencias de imágenes y auditar la sincronización entre local, el servidor central y Google Drive.</p>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Vistas de Navegación</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">🌳 Vista Árbol (Split Work / Media)</h4>
                        <p style="color:#999; font-size:0.88rem;">Dos paneles verticales sincronizados: <b style="color:var(--accent);">Proyecto (Work)</b> arriba y <b style="color:#4caf50;">Media</b> abajo. Permite comprobar visualmente que cada plano tenga su carpeta de renders asociada.</p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">📊 Vista Miller (Columnas Pipeta)</h4>
                        <p style="color:#999; font-size:0.88rem;">Despliegue horizontal por columnas infinitas al estilo macOS Finder. Máxima agilidad para navegar jerarquías profundas (Episodio → Secuencia → Shot → Proceso).</p>
                    </div>
                </div>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Selector de Ubicación: LOCAL | DRIVE | SERVER</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold; width:160px;">LOCAL</td>
                        <td style="padding:8px; color:#999;">Explora los archivos físicamente presentes en tu disco de trabajo local (Z: local / vsubst).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold;">DRIVE</td>
                        <td style="padding:8px; color:#999;">Explora el almacenamiento en la nube (Google Drive G: o catálogo indexado en caché), permitiendo trabajar offline sin saturar ancho de banda.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold;">SERVER</td>
                        <td style="padding:8px; color:#999;">Accede al servidor central SMB del estudio para comparar con el máster del proyecto.</td>
                    </tr>
                </table>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Comparación Cloud / Server en Tiempo Real</h3>
                <p style="color:#ccc; font-size:0.9rem;">Usa los botones <b>☁️ DRIVE</b> y <b>🗄️ SERVER</b> en la cabecera del Explorer para activar el resaltado comparativo:</p>
                <ul style="list-style:none; padding:0; line-height:2;">
                    <li style="color:#aaa;">🟢 <b style="color:#fff;">Verde:</b> Archivo idéntico y sincronizado.</li>
                    <li style="color:#aaa;">🟡 <b style="color:#fff;">Amarillo:</b> Archivo modificado o con diferencias de peso/fecha.</li>
                    <li style="color:#aaa;">⚪ <b style="color:#fff;">Gris / Faltante:</b> Archivo que existe en la nube pero aún no ha sido descargado al disco local.</li>
                </ul>
            `
        },
        {
            id: 'sync-queue',
            icon: 'icons/sync-analyzer.svg',
            title: 'Sync Queue & Cloud',
            subtitle: 'Transferencias en Background (Drive / Rclone)',
            color: '#FFB300',
            content: `
                <h2 style="margin-top:0; color:#FFB300;">⚡ Sync Queue & Transferencias Cloud</h2>
                <p style="color:#ccc; line-height:1.8;">El gestor de transferencias <b>Sync Queue</b> administra las descargas y subidas de archivos entre tu equipo y Google Drive en segundo plano, impulsado por el motor <b>Rclone</b>.</p>

                <h3 style="color:#FFB300; border-bottom:1px solid #333; padding-bottom:5px;">Indicador de Estado en la Barra Lateral</h3>
                <p style="color:#ccc; font-size:0.9rem;">El botón de rayo (⚡) en la barra lateral izquierda te informa del estado del motor en todo momento:</p>
                <ul style="list-style:none; padding:0; line-height:2;">
                    <li style="color:#aaa;">🟢 <b style="color:#fff;">Punto Verde:</b> Worker activo y transfiriendo archivos activamente.</li>
                    <li style="color:#aaa;">⚪ <b style="color:#fff;">Punto Gris:</b> Cola en espera (idle) sin tareas pendientes.</li>
                    <li style="color:#aaa;">🟠 <b style="color:#fff;">Badge Numérico:</b> Indica la cantidad de archivos restantes por sincronizar.</li>
                </ul>

                <h3 style="color:#FFB300; border-bottom:1px solid #333; padding-bottom:5px;">Ventana de Cola de Sincronización</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <p style="color:#ccc; font-size:0.88rem; line-height:1.7;">
                        Al pulsar sobre el botón ⚡ se despliega la interfaz completa de Sync Queue, donde puedes:
                    </p>
                    <ol style="padding-left:20px; color:#ccc; line-height:2; font-size:0.85rem;">
                        <li>Revisar el progreso individual de cada archivo (velocidad, porcentaje y tiempo restante).</li>
                        <li>Pausar, reanudar o cancelar transferencias que ya no sean prioritarias.</li>
                        <li>Ver el historial de transferencias completadas con éxito o con advertencias.</li>
                    </ol>
                </div>
            `
        },
        {
            id: 'creator',
            icon: 'icons/asset_creator.svg',
            title: 'Creator (Shots & Assets)',
            subtitle: 'Materialización de Estructuras en Disco',
            color: '#9C27B0',
            content: `
                <h2 style="margin-top:0; color:#9C27B0;">🏗️ Creator: Shots & Assets</h2>
                <p style="color:#ccc; line-height:1.8;">La ventana unificada <b>Creator</b> toma los presets diseñados en Shot Designer y Asset Designer y los materializa físicamente en las unidades de disco de trabajo (Work) y de render (Media).</p>

                <h3 style="color:#9C27B0; border-bottom:1px solid #333; padding-bottom:5px;">1. Creación de Shots (Planos)</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <ol style="padding-left:20px; color:#ccc; line-height:2; font-size:0.88rem;">
                        <li><b style="color:#fff;">Episodio & Secuencia:</b> Selecciona el episodio y secuencia de destino.</li>
                        <li><b style="color:#fff;">Número de Plano:</b> Ingresa el número del shot (ej: <code>1130</code>) o usa los botones rápidos <b style="color:var(--accent);">+1</b> / <b style="color:var(--accent);">+10</b> para correlativos automáticos.</li>
                        <li><b style="color:#fff;">Procesos:</b> Marca qué procesos (compo, 3d, IA, nuke script, etc.) se crearán en disco.</li>
                        <li>Confirma en el modal de verificación para generar la estructura completa de forma instantánea.</li>
                    </ol>
                </div>

                <h3 style="color:#9C27B0; border-bottom:1px solid #333; padding-bottom:5px;">2. Creación de Assets 3D</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <p style="color:#ccc; font-size:0.88rem; line-height:1.7;">
                        Permite crear un nuevo asset (Character, Prop, Set, etc.) o <b>inyectar procesos en lote</b> a assets ya existentes sin sobreescribir ni dañar el trabajo previo.
                    </p>
                </div>
            `
        },
        {
            id: 'designers',
            icon: 'icons/design_shots.svg',
            title: 'Shot & Asset Designers',
            subtitle: 'Diseño Gráfico de Presets y Variables',
            color: '#E91E63',
            content: `
                <h2 style="margin-top:0; color:#E91E63;">🎨 Designers de Pipeline (Shot & Asset)</h2>
                <p style="color:#ccc; line-height:1.8;">Entornos de diseño visual basados en grafos de nodos para crear y ajustar las plantillas de carpetas canónicas de cualquier serie, película o comercial.</p>

                <h3 style="color:#E91E63; border-bottom:1px solid #333; padding-bottom:5px;">Variables del Name Constructor Dinámico</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold; width:170px;">[NICK]</td>
                        <td style="padding:8px; color:#999;">Tag abreviado del proyecto (ej: <code>SURF</code>).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold;">[EP] & [SEQ]</td>
                        <td style="padding:8px; color:#999;">Variables automáticas resueltas desde el episodio (ej: <code>B01</code>) y secuencia (ej: <code>003</code>).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold;">[SHOT] (Input Var)</td>
                        <td style="padding:8px; color:#999;">Número del plano ingresado al crear (ej: <code>0020</code>).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold;">[SHOTNAME] (Output)</td>
                        <td style="padding:8px; color:#999;">Nombre completo consolidado generado por el nodo Shot (ej: <code>SURF_B01_003_0020</code>), listo para alimentar scripts <code>.nk</code> y carpetas hijas.</td>
                    </tr>
                </table>

                <h3 style="color:#E91E63; border-bottom:1px solid #333; padding-bottom:5px;">Conexiones Mirror (Árbol de Media)</h3>
                <p style="color:#ccc; font-size:0.9rem;">
                    Al conectar nodos de trabajo (Work) con nodos de render (Media), Pipeta garantiza que cualquier plano creado genere en paralelo sus carpetas de render correspondientes (FullRes, Prerender, IA).
                </p>
            `
        },
        {
            id: 'naming-validator',
            icon: 'icons/scanning-scan-svgrepo-com.svg',
            title: 'Naming Validator',
            subtitle: 'Auditoría de Nomenclatura y Reglas',
            color: '#8BC34A',
            content: `
                <h2 style="margin-top:0; color:#8BC34A;">🛡️ Naming Validator & Auditoría de Pipeline</h2>
                <p style="color:#ccc; line-height:1.8;">Herramienta de control de calidad encargada de auditar la integridad de las carpetas y archivos en disco antes de la entrega o empaquetado final.</p>

                <h3 style="color:#8BC34A; border-bottom:1px solid #333; padding-bottom:5px;">¿Qué audita el validador?</h3>
                <ul style="list-style:none; padding:0; line-height:2;">
                    <li style="color:#aaa;">🔍 <b style="color:#fff;">Comparación contra Preset:</b> Verifica que la estructura física coincida exactamente con la plantilla canónica del proyecto.</li>
                    <li style="color:#aaa;">⚠️ <b style="color:#fff;">Detección de Carpetas Improvisadas:</b> Identifica carpetas fuera de canon creadas accidentalmente por artistas (ej. <code>render_test</code>, <code>v02_antiguo</code>).</li>
                    <li style="color:#aaa;">📄 <b style="color:#fff;">Archivos Huérfanos:</b> Alerta sobre archivos sueltos en ubicaciones indebidas.</li>
                </ul>
            `
        },
        {
            id: 'file-auditor',
            icon: 'icons/file-auditor.svg',
            title: 'File Auditor & Mirror',
            subtitle: 'Integridad Work ↔ Media y Scripts Nuke',
            color: '#AB47BC',
            content: `
                <h2 style="margin-top:0; color:#AB47BC;">📊 File Auditor (Integridad & Renders)</h2>
                <p style="color:#ccc; line-height:1.8;">Auditor de alta velocidad con motor de escaneo nativo capaz de inspeccionar cientos de planos en disco local o en la nube en menos de 1 segundo.</p>

                <h3 style="color:#AB47BC; border-bottom:1px solid #333; padding-bottom:5px;">Modalidades de Auditoría</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">🪞 Mirror Integrity</h4>
                        <p style="color:#999; font-size:0.88rem;">Compara que cada plano existente en Work tenga su contraparte correspondiente en Media y ofrece un botón para reparar todas las carpetas faltantes en lote con un solo clic.</p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">🎬 Render & Scene Status</h4>
                        <p style="color:#999; font-size:0.88rem;">Audita la versión de los scripts de Nuke (<code>.nk</code>) contra las secuencias renderizadas en Media, alertando sobre renders desactualizados o versiones huérfanas.</p>
                    </div>
                </div>
            `
        },
        {
            id: 'config-project',
            icon: 'icons/settings.svg',
            title: 'Configurar Proyectos & Red',
            subtitle: 'Rutas Locales, Drive, Server y Presets',
            color: '#00BCD4',
            content: `
                <h2 style="margin-top:0; color:#00BCD4;">📁 Configuración de Proyectos & Mapeo de Red</h2>
                <p style="color:#ccc; line-height:1.8;">En Pipeta, cada proyecto define sus rutas locales de trabajo, sus espejos en la nube (Google Drive), el servidor central del estudio y sus <b>presets de diseño por defecto</b>.</p>

                <h3 style="color:#00BCD4; border-bottom:1px solid #333; padding-bottom:5px;">Entorno de Trabajo Local vs Estudio Real</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <ul style="padding-left:20px; color:#ccc; line-height:2; font-size:0.88rem;">
                        <li><b style="color:#fff;">Disco Z: Local (Trabajo / vsubst):</b> Tu espacio de trabajo activo en la estación, sincronizado automáticamente con la nube y el servidor.</li>
                        <li><b style="color:#fff;">Disco G: / Cloud:</b> Unidad compartida de Google Drive mapeada o indexada en caché local.</li>
                        <li><b style="color:#fff;">Servidor Central SMB:</b> Almacenamiento central del estudio donde se consolidan las entregas y másters finales.</li>
                    </ul>
                </div>

                <h3 style="color:#00BCD4; border-bottom:1px solid #333; padding-bottom:5px;">Parámetros Clave del Proyecto</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#00BCD4; font-weight:bold; width:180px;">Rutas Locales (Work/Media)</td>
                        <td style="padding:8px; color:#999;">Rutas físicas raíz para las escenas de trabajo y para los renders/materiales.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#00BCD4; font-weight:bold;">Presets por Defecto</td>
                        <td style="padding:8px; color:#999;">Define qué plantilla de <b>Shot Designer</b> (ej: <code>master_shot</code>) y de <b>Asset Designer</b> utilizarán las herramientas de creación e ingesta.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#00BCD4; font-weight:bold;">Sincronización Rclone</td>
                        <td style="padding:8px; color:#999;">Configura la ruta de control remoto para sincronización continua con Google Drive.</td>
                    </tr>
                </table>
            `
        }
    ],

    selectedId: null,

    renderSidebar: () => {
        return Tutorials.tutorials.map(t => `
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
        if (!Tutorials.selectedId) {
            return `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; opacity:0.6;">
                    <img src="logo.png" style="height:80px; opacity:0.2; margin-bottom:20px;">
                    <h1 style="font-size:2.2rem; margin:0; color:#444; letter-spacing:2px;">PIPETA PIPELINE</h1>
                    <p style="color:#666; margin-top:10px; font-size:0.9rem;">Selecciona una guía o tutorial del panel izquierdo para comenzar</p>
                </div>
            `;
        }
        const tut = Tutorials.tutorials.find(t => t.id === Tutorials.selectedId);
        if (!tut) return '';
        return `
            <div style="animation: fadeIn 0.3s ease; position:relative; max-width:920px;">
                <button onclick="Tutorials.close()" title="Cerrar Guía" 
                    style="position:absolute; top:-10px; right:0; background:transparent; border:none; color:#666; cursor:pointer; font-size:1.4rem; transition:color 0.2s; padding:4px 8px;">
                    &times;
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
                    <div style="color:#7e8b9b; font-size:0.7rem; font-weight:bold; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; padding-left:6px; display:flex; align-items:center; gap:6px;">
                        <span>📖</span> Guías de Pipeline
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
