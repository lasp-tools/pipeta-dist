// ------------------------------------------
// --- TUTORIALS MODULE (GUIAS Y DOCUMENTACIÓN) ---
// ------------------------------------------

const Tutorials = {

    tutorials: [
        {
            id: 'config-project',
            icon: 'icons/settings.svg',
            title: 'Configurar Proyecto',
            subtitle: 'Rutas Locales, Cloud y Presets por Defecto',
            color: '#00BCD4',
            content: `
                <h2 style="margin-top:0; color:#00BCD4;">📁 Configuración de Proyectos</h2>
                <p style="color:#ccc; line-height:1.8;">En Pipeta, cada proyecto define su cliente, su código de proyecto, sus rutas de almacenamiento local (disco de trabajo / servidor), sus rutas en la nube (Google Drive / Cloud) y sus <b>presets de diseño por defecto</b>.</p>

                <h3 style="color:#00BCD4; border-bottom:1px solid #333; padding-bottom:5px;">¿Cómo crear o editar un proyecto?</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <ol style="padding-left:20px; color:#ccc; line-height:2;">
                        <li>Haz clic en el icono de <b style="color:#fff;">Configuraciones</b> (⚙️) en la esquina superior derecha.</li>
                        <li>En la pestaña <b style="color:#fff;">📁 Proyectos</b>, verás el listado de proyectos configurados a la izquierda.</li>
                        <li>Para crear uno nuevo, pulsa el botón <b style="color:var(--accent);">+</b>. Para editar, selecciona el proyecto deseado en la lista.</li>
                    </ol>
                </div>

                <h3 style="color:#00BCD4; border-bottom:1px solid #333; padding-bottom:5px;">Parámetros del Proyecto</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#00BCD4; font-weight:bold; width:190px;">Nombre del Proyecto</td>
                        <td style="padding:8px; color:#999;">El nombre descriptivo que se mostrará en los desplegables de Pipeta (ej: <code>surf_love</code>).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#00BCD4; font-weight:bold;">Cliente & Tag</td>
                        <td style="padding:8px; color:#999;">Identificadores de cliente (ej: <code>atresmedia</code>) y código de proyecto (ej: <code>surf_love</code>) que alimentan la resolución automática de rutas en los creadores.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#00BCD4; font-weight:bold;">Rutas Locales</td>
                        <td style="padding:8px; color:#999;">
                            <b>Work (Proyecto):</b> Carpeta raíz de proyectos y escenas de trabajo.<br>
                            <b>Media:</b> Carpeta raíz paralela de renders, ingesta de IA y materiales.
                        </td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#00BCD4; font-weight:bold;">Rutas Online / Cloud</td>
                        <td style="padding:8px; color:#999;">Rutas espejo en unidades compartidas en la nube (Google Drive / Cloud Storage) para sincronización con <b>Rclone</b>.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#00BCD4; font-weight:bold;">🎯 Preset Shot por Defecto</td>
                        <td style="padding:8px; color:#999;">Define la plantilla de <b>Shot Designer</b> que usará este proyecto (ej: <code>master_shot</code>). Los módulos de Shot Creator e IA Ingest reconocerán la estructura automáticamente.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#00BCD4; font-weight:bold;">🎨 Preset Asset por Defecto</td>
                        <td style="padding:8px; color:#999;">Define la plantilla de <b>Asset Designer</b> que usará este proyecto (ej: <code>vfx_asset_standard</code>).</td>
                    </tr>
                </table>

                <div style="background:#1a2a2a; padding:12px; border-radius:8px; border-left:4px solid #00BCD4; margin-top:15px;">
                    <span style="color:#00BCD4; font-weight:bold;">💡 Proyecto Activo:</span>
                    <span style="color:#aaa;"> El proyecto seleccionado en el menú superior de la barra de Pipeta determina qué rutas se exploran y qué contexto se envía a Shot Creator, Asset Creator e IA Ingest.</span>
                </div>
            `
        },
        {
            id: 'explorer',
            icon: 'icons/view_classic.svg',
            title: 'Explorer & Integridad',
            subtitle: 'Navegación, Metadata y Reparación',
            color: '#FF9800',
            content: `
                <h2 style="margin-top:0; color:#FF9800;">🗂️ Explorer & Integridad de Estructura</h2>
                <p style="color:#ccc; line-height:1.8;">El Explorer te permite navegar la estructura de carpetas de tu proyecto de forma visual, verificar metadatos de control y auditar la integridad de cada plano o asset.</p>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Vistas de Navegación</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">🌳 Vista Árbol (Split Work / Media)</h4>
                        <p style="color:#999; font-size:0.9rem;">Muestra dos paneles verticales sincronizados: <b style="color:var(--accent);">Proyecto (Work)</b> arriba y <b style="color:#ff9800;">Media</b> abajo. Permite verificar de un vistazo qué carpetas existen en cada lado.</p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">📊 Vista Miller (Pipeta)</h4>
                        <p style="color:#999; font-size:0.9rem;">Columnas dinámicas estilo macOS Finder que se despliegan de izquierda a derecha. Ideal para navegar en profundidad (Episodio → Secuencia → Shot → Proceso).</p>
                    </div>
                </div>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Panel Lateral de Propiedades</h3>
                <p style="color:#ccc; font-size:0.9rem;">Al seleccionar cualquier carpeta o archivo, el panel lateral derecho muestra sus propiedades:</p>
                <ul style="list-style:none; padding:0; line-height:2;">
                    <li style="color:#aaa;">📄 <b style="color:#fff;">Ruta y Selección:</b> Nombre, ruta completa y formato de archivo o carpeta.</li>
                    <li style="color:#aaa;">🎞️ <b style="color:#fff;">Secuencias de Imágenes:</b> Frames, rango (inicio/fin) y peso consolidado.</li>
                    <li style="color:#aaa;">☁️ <b style="color:#fff;">Ubicación:</b> Estado de sincronización entre Local, Google Drive y Servidor Central.</li>
                </ul>

                <div style="background:#1a2a1a; padding:12px; border-radius:8px; border-left:4px solid #4CAF50; margin-top:15px;">
                    <span style="color:#4CAF50; font-weight:bold;">💡 Tip:</span>
                    <span style="color:#aaa;"> Haz clic derecho sobre cualquier carpeta para abrir el menú contextual con accesos rápidos: Copiar Ruta, Abrir en Windows Explorer, Renombrar o Eliminar.</span>
                </div>
            `
        },
        {
            id: 'shot-designer',
            icon: 'icons/video_camera_back.svg',
            title: 'Shot Designer',
            subtitle: 'Diseño visual de presets y Name Constructor',
            color: '#2196F3',
            content: `
                <h2 style="margin-top:0; color:#2196F3;">🎬 Shot Designer</h2>
                <p style="color:#ccc; line-height:1.8;">Herramienta gráfica basada en nodos para diseñar la estructura canónica de carpetas y archivos de planos (Shots). Aquí defines plantillas jerárquicas reutilizables que luego usará el Shot Creator.</p>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Jerarquía de Nodos</h3>
                <div style="display:flex; gap:10px; margin-bottom:20px; align-items:center; justify-content:center;">
                    <div style="background:#1a1a1a; padding:10px 14px; border-radius:8px; border:2px solid #2196F3; text-align:center;">
                        <div style="color:#2196F3; font-weight:bold;">Episodio</div>
                        <div style="color:#666; font-size:0.75rem;">isEpisode</div>
                    </div>
                    <div style="color:#555; font-size:1.2rem;">→</div>
                    <div style="background:#1a1a1a; padding:10px 14px; border-radius:8px; border:2px solid #2196F3; text-align:center;">
                        <div style="color:#2196F3; font-weight:bold;">Secuencia</div>
                        <div style="color:#666; font-size:0.75rem;">isScene</div>
                    </div>
                    <div style="color:#555; font-size:1.2rem;">→</div>
                    <div style="background:#1a1a1a; padding:10px 14px; border-radius:8px; border:2px solid #2196F3; text-align:center;">
                        <div style="color:#2196F3; font-weight:bold;">Shot</div>
                        <div style="color:#666; font-size:0.75rem;">isShot</div>
                    </div>
                    <div style="color:#555; font-size:1.2rem;">→</div>
                    <div style="background:#1a1a1a; padding:10px 14px; border-radius:8px; border:2px solid #2196F3; text-align:center;">
                        <div style="color:#2196F3; font-weight:bold;">Procesos & Files</div>
                        <div style="color:#666; font-size:0.75rem;">2d, 3d, IA, .nk</div>
                    </div>
                </div>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Name Constructor Dinámico & Variables</h3>
                <p style="color:#ccc; font-size:0.9rem;">El constructor de nombres permite componer nombres de carpetas y archivos con variables automáticas:</p>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#2196F3; font-weight:bold; width:160px;">[NICK]</td>
                        <td style="padding:8px; color:#999;">Tag abreviado del proyecto (ej: <code>SURF</code> en lugar de <code>surf_love</code>). Se define en el nodo Proyecto.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#2196F3; font-weight:bold;">[EP] & [SEQ]</td>
                        <td style="padding:8px; color:#999;">Variables automáticas que toman el nombre del episodio padre (ej: <code>B03</code>) y de la secuencia (ej: <code>066</code>).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#2196F3; font-weight:bold;">[SHOT] (Input Var)</td>
                        <td style="padding:8px; color:#999;">Variable de entrada que recibe el <b>número de plano</b> ingresado en Shot Creator (ej: <code>1130</code>).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#2196F3; font-weight:bold;">[SHOTNAME] (Output Var)</td>
                        <td style="padding:8px; color:#999;">Variable de salida que almacena el <b>nombre completo generado</b> por el nodo Shot (ej: <code>SURF_B03_066_1130</code>). Se utiliza en los archivos hijos (.nk, .txt) para no tener que reconstruir la fórmula.</td>
                    </tr>
                </table>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Conexiones y Mirror (Estructura de Media)</h3>
                <ul style="list-style:none; padding:0; line-height:2;">
                    <li style="color:#aaa;">🔗 <b style="color:#fff;">Conexión Estándar:</b> Vincula padres e hijos en el árbol de trabajo (Work).</li>
                    <li style="color:#aaa;">🪞 <b style="color:#ff9800;">Conexión Mirror:</b> Conecta un nodo de Work con un nodo de Media, permitiendo que Shot Creator cree paralelamente las carpetas de render en la ruta de Media correspondiente.</li>
                    <li style="color:#aaa;">✂️ <b style="color:#f44336;">Romper Conexiones:</b> Haz clic derecho sobre la línea que une dos nodos (o arrastra el cable fuera del nodo) para eliminar el enlace.</li>
                </ul>
            `
        },
        {
            id: 'shot-creator',
            icon: 'icons/asset_creator.svg',
            title: 'Shot Creator',
            subtitle: 'Materialización y creación de planos en disco',
            color: '#9C27B0',
            content: `
                <h2 style="margin-top:0; color:#9C27B0;">🎥 Shot Creator</h2>
                <p style="color:#ccc; line-height:1.8;">Materializa en el disco duro las estructuras diseñadas en el Shot Designer. Crea carpetas de episodios, secuencias y shots tanto en la ruta de Proyecto (Work) como en Media (Render).</p>

                <h3 style="color:#9C27B0; border-bottom:1px solid #333; padding-bottom:5px;">Flujo de Creación</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <ol style="padding-left:20px; color:#ccc; line-height:2;">
                        <li><b style="color:#fff;">Proyecto:</b> Selecciona el proyecto activo en el desplegable superior (toma por defecto el de la barra de Pipeta).</li>
                        <li><b style="color:#fff;">Preset:</b> Selecciona la plantilla deseada (ej: <code>master_shot</code>).</li>
                        <li><b style="color:#fff;">Nivel de Creación:</b>
                            <ul style="margin:5px 0;">
                                <li><b>Episodio:</b> Crea la carpeta de episodio y sus subcarpetas base.</li>
                                <li><b>Escena:</b> Selecciona el episodio padre y crea la escena/secuencia.</li>
                                <li><b>Shot:</b> Selecciona episodio y escena padre, ingresa el número de shot (ej: <code>1130</code>) y el sistema generará el nombre canónico (ej: <code>SURF_B03_066_1130</code>).</li>
                            </ul>
                        </li>
                        <li><b style="color:#fff;">Selección de Procesos:</b> Marca únicamente los procesos (2d, 3d, IA, etc.) y carpetas de Media que apliquen a ese plano.</li>
                        <li>Pulsa <b style="color:var(--accent);">CREAR ESTRUCTURA</b>, revisa el modal de confirmación con las rutas reales y confirma.</li>
                    </ol>
                </div>

                <div style="background:#1a1a2a; padding:12px; border-radius:8px; border-left:4px solid #9C27B0; margin-top:15px;">
                    <span style="color:#9C27B0; font-weight:bold;">⚡ Botones Rápidos +1 / +10:</span>
                    <span style="color:#aaa;"> Al crear shots consecutivos, utiliza los botones de incremento para avanzar la numeración automáticamente sin tener que tipear.</span>
                </div>
            `
        },
        {
            id: 'ia-ingest',
            icon: 'icons/chip-ai.svg',
            title: 'IA Ingest & Nomenclatura',
            subtitle: 'Pipeline canónico de ingesta de IA para VFX',
            color: '#4CAF50',
            content: `
                <h2 style="margin-top:0; color:#4CAF50;">🤖 IA Ingest & Nomenclatura Canónica</h2>
                <p style="color:#ccc; line-height:1.8;">Herramienta especializada para la ingesta ordenada de material generado por Inteligencia Artificial (Seedance, Google Veo, Nano Banana, etc.) directamente en la estructura de Media del plano.</p>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">Canon de Nomenclatura</h3>
                <div style="background:#111; padding:12px; border-radius:8px; font-family:monospace; color:#8f8; font-size:0.9rem; margin-bottom:15px; border:1px solid #333;">
                    [SHOT_ID]_[MOTOR]_[RESOLUCIÓN]_[FRAMING]_[TAG/ROLE]_v[VERSIÓN].[EXT]
                </div>
                <p style="color:#aaa; font-size:0.85rem;">Ejemplo: <code>SURF_B03_066_1130_SD2_FHD_FLL_i2v_v001.mp4</code></p>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">1. Selector de Contexto de Shot</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:12px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#4CAF50; margin-top:0;">🔘 Modo Explorador (Recomendado)</h4>
                        <p style="color:#999; font-size:0.85rem;">
                            <b>Fila 1:</b> Desplegables de <b>Episodio</b> (con botón 🔄) y <b>Escena / Sec</b>.<br>
                            <b>Fila 2:</b> Desplegable de <b>Shot</b> a todo lo ancho para ver nombres completos. Ubica automáticamente la carpeta <code>IA/</code> en Media y calcula la versión siguiente disponible (v001, v002...).
                        </p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:12px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#aaa; margin-top:0;">🔘 Modo Manual</h4>
                        <p style="color:#999; font-size:0.85rem;">Permite ingresar o pegar libremente cualquier Shot ID arbitrario para casos excepcionales.</p>
                    </div>
                </div>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">2. Builder Modular de Tokens</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold; width:160px;">MOTOR</td>
                        <td style="padding:8px; color:#999;">Motor generativo: <code>SD2</code> (Seedance v2), <code>SD25</code>, <code>VEO3</code> (Google Veo), <code>VO31</code>, <code>GOMN</code>, <code>NBN2</code>, <code>NB2P</code> o manual.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold;">RESOLUCIÓN</td>
                        <td style="padding:8px; color:#999;"><code>FHD</code> (1080p), <code>UHD</code> (4K), <code>SQ1K</code> (1024x1024), <code>UW2K</code>, etc. Incluye checkbox <b>📐 Auto</b> para detectar el tamaño real del video/imagen automáticamente.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold;">FRAMING</td>
                        <td style="padding:8px; color:#999;">Encuadre: <code>FLL</code> (Full / Canvas completo) o <code>CRP</code> (Crop / Parche localizado).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold;">TAG / ROL (A-B-C)</td>
                        <td style="padding:8px; color:#999;">
                            <b>Nivel A (Ref):</b> <code>start1001</code>, <code>end1100</code>, <code>f1001</code>, <code>ref</code>.<br>
                            <b>Nivel B (Compo):</b> <code>inp</code> (Inpaint), <code>ups</code> (Upscale), <code>mask</code>, <code>clean</code>, <code>elem</code>.<br>
                            <b>Nivel C (Proceso):</b> <code>i2v</code>, <code>t2i</code>, <code>i2i</code>, <code>t2v</code>, <code>v2v</code>, <code>m2v</code>.
                        </td>
                    </tr>
                </table>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">3. Captura Automática de Descargas de Chrome</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <h4 style="color:#4CAF50; margin-top:0;">⚡ ¿Cómo funciona el Watcher de Chrome?</h4>
                    <p style="color:#ccc; font-size:0.85rem; line-height:1.7;">
                        El watcher monitorea tu carpeta de descargas del navegador. Para una experiencia 100% fluida sin ventanas emergentes:
                    </p>
                    <ol style="padding-left:20px; color:#ccc; line-height:2; font-size:0.85rem;">
                        <li>Haz clic en el botón <b style="color:#ffb74d;">⚙️ Abrir Ajustes Descargas Chrome</b> en Pipeta.</li>
                        <li>En la pestaña de Chrome que se abre (<code>chrome://settings/downloads</code>), <b>desmarca</b> la casilla que dice: <br>
                            👉 <i style="color:#fff;">"Preguntar dónde se guardará cada archivo antes de descargarlo"</i>.
                        </li>
                        <li>Activa el interruptor <b style="color:var(--accent);">👁️ CAPTURA AUTOMÁTICA</b> en Pipeta.</li>
                    </ol>
                    <p style="color:#aaa; font-size:0.85rem; margin-bottom:0;">
                        ¡Listo! Cada vez que descargues un video o imagen generada desde Seedance o Google Veo, el archivo entrará automáticamente a la cola de Pipeta con su nombre canónico generado, listo para previsualizar e ingestar.
                    </p>
                </div>
            `
        },
        {
            id: 'asset-designer',
            icon: 'icons/design_shots.svg',
            title: 'Asset Designer',
            subtitle: 'Diseño visual de presets de Assets 3D',
            color: '#E91E63',
            content: `
                <h2 style="margin-top:0; color:#E91E63;">🎨 Asset Designer</h2>
                <p style="color:#ccc; line-height:1.8;">Herramienta visual de nodos para diseñar las plantillas de carpetas que utilizarán los modelos 3D, personajes, props y entornos de tus proyectos.</p>

                <h3 style="color:#E91E63; border-bottom:1px solid #333; padding-bottom:5px;">Estructura de Nodos</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold; width:150px;">isCategory</td>
                        <td style="padding:8px; color:#999;">Define las categorías del proyecto (Characters, Props, Sets, Vehicles, etc.).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold;">isAssetFocus</td>
                        <td style="padding:8px; color:#999;">Nodo central que representa la carpeta del asset individual que se creará.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold;">isProcess</td>
                        <td style="padding:8px; color:#999;">Procesos técnicos del asset (Model, Texture, Rig, Lookdev, etc.).</td>
                    </tr>
                </table>
            `
        },
        {
            id: 'asset-creator',
            icon: 'icons/asset_creator.svg',
            title: 'Asset Creator',
            subtitle: 'Creación de assets y procesos en lote',
            color: '#FF5722',
            content: `
                <h2 style="margin-top:0; color:#FF5722;">🏗️ Asset Creator</h2>
                <p style="color:#ccc; line-height:1.8;">Toma un preset de Asset Designer y materializa la estructura en el disco duro, ya sea para un nuevo asset o para inyectar procesos en lote.</p>

                <h3 style="color:#FF5722; border-bottom:1px solid #333; padding-bottom:5px;">Modos Disponibles</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">✨ Nuevo Asset</h4>
                        <p style="color:#999; font-size:0.9rem;">Escribe el nombre del asset, selecciona su categoría y qué procesos incluir.</p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">💉 Inyectar Procesos</h4>
                        <p style="color:#999; font-size:0.9rem;">Añade nuevos procesos a assets ya existentes sin sobreescribir los datos previos.</p>
                    </div>
                </div>
            `
        },
        {
            id: 'naming-validator',
            icon: 'icons/scanning-scan-svgrepo-com.svg',
            title: 'Naming Validator',
            subtitle: 'Auditoría y chequeo de reglas de pipeline',
            color: '#8BC34A',
            content: `
                <h2 style="margin-top:0; color:#8BC34A;">🛡️ Naming Validator & Auditoría</h2>
                <p style="color:#ccc; line-height:1.8;">Verifica que las carpetas y archivos en disco cumplan estrictamente con las convenciones definidas en tu pipeline antes del empaquetado o render final.</p>

                <h3 style="color:#8BC34A; border-bottom:1px solid #333; padding-bottom:5px;">Funcionalidades</h3>
                <ul style="list-style:none; padding:0; line-height:2;">
                    <li style="color:#aaa;">🔍 <b style="color:#fff;">Comparación de Preset:</b> Compara la estructura real en disco contra la estructura teórica del preset.</li>
                    <li style="color:#aaa;">⚠️ <b style="color:#fff;">Detección de Archivos Huérfanos:</b> Identifica archivos o carpetas fuera de canon.</li>
                    <li style="color:#aaa;">🟢 <b style="color:#fff;">Diagnóstico Visual:</b> Resumen en colores (Verde = correcto, Amarillo = advertencia, Rojo = error).</li>
                </ul>
            `
        },
        {
            id: 'sync-analyzer',
            icon: 'icons/sync-analyzer.svg',
            title: 'Sync Analyzer',
            subtitle: 'Sincronización Local ↔ Online (Rclone)',
            color: '#03A9F4',
            content: `
                <h2 style="margin-top:0; color:#03A9F4;">☁️ Sync Analyzer (Local ↔ Online)</h2>
                <p style="color:#ccc; line-height:1.8;">Permite comparar y sincronizar en segundo plano la estructura y archivos entre tu almacenamiento local (Z:) y las unidades en la nube (Google Drive / Cloud G:) mediante el motor <b>Rclone</b> integrado.</p>

                <h3 style="color:#03A9F4; border-bottom:1px solid #333; padding-bottom:5px;">Funciones Principales</h3>
                <ul style="list-style:none; padding:0; line-height:2;">
                    <li style="color:#aaa;">🔄 <b style="color:#fff;">Análisis Bidireccional:</b> Detecta archivos nuevos, modificados o faltantes entre local y la nube.</li>
                    <li style="color:#aaa;">🚀 <b style="color:#fff;">Sincronización en Lote:</b> Ejecuta tareas de subida o bajada controladas sin saturar la red.</li>
                </ul>
            `
        },
        {
            id: 'file-auditor',
            icon: 'icons/file-auditor.svg',
            title: 'File Auditor',
            subtitle: 'Integridad de Espejos y Render Status',
            color: '#AB47BC',
            content: `
                <h2 style="margin-top:0; color:#AB47BC;">📊 File Auditor (Integridad & Renders)</h2>
                <p style="color:#ccc; line-height:1.8;">Auditor integral de alta velocidad con motor de escaneo nativo capaz de inspeccionar cientos de planos en local o en la nube en menos de 1 segundo.</p>

                <h3 style="color:#AB47BC; border-bottom:1px solid #333; padding-bottom:5px;">Modalidades</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">🪞 Mirror Integrity</h4>
                        <p style="color:#999; font-size:0.9rem;">Compara que cada plano existente en Proyecto (Work) tenga su contraparte correspondiente en Media y repara carpetas faltantes en lote.</p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">🎬 Render & Scene Status</h4>
                        <p style="color:#999; font-size:0.9rem;">Audita versiones de scripts (.nk) contra renders en Media, detecta desfases de versión y localiza renders huérfanos.</p>
                    </div>
                </div>
            `
        }
    ],

    selectedId: null,

    renderSidebar: () => {
        return Tutorials.tutorials.map(t => `
            <div class="tut-sidebar-item ${Tutorials.selectedId === t.id ? 'active' : ''}"
                 onclick="Tutorials.select('${t.id}')"
                 style="display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; border-radius:6px; margin-bottom:4px; transition:all 0.2s;
                        background:${Tutorials.selectedId === t.id ? '#222' : 'transparent'};
                        border-left:3px solid ${Tutorials.selectedId === t.id ? t.color : 'transparent'};">
                <img src="${t.icon}" style="width:18px; height:18px; object-fit:contain;">
                <div>
                    <div style="color:${Tutorials.selectedId === t.id ? '#fff' : '#aaa'}; font-size:0.85rem; font-weight:${Tutorials.selectedId === t.id ? 'bold' : 'normal'};">${t.title}</div>
                    <div style="color:#555; font-size:0.65rem;">${t.subtitle}</div>
                </div>
            </div>
        `).join('');
    },

    renderContent: () => {
        if (!Tutorials.selectedId) {
            return `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; opacity:0.5;">
                    <img src="logo.png" style="height:80px; opacity:0.15; margin-bottom:20px;">
                    <h1 style="font-size:2.5rem; margin:0; color:#333;">PIPETA</h1>
                    <p style="color:#444; margin-top:10px;">Selecciona una guía o tutorial del panel izquierdo</p>
                </div>
            `;
        }
        const tut = Tutorials.tutorials.find(t => t.id === Tutorials.selectedId);
        if (!tut) return '';
        return `
            <div style="animation: fadeIn 0.3s ease; position:relative;">
                <button onclick="Tutorials.close()" title="Cerrar Tutorial" 
                    style="position:absolute; top:-20px; right:0; background:transparent; border:none; color:#555; cursor:pointer; font-size:1.5rem; transition:color 0.2s; padding:5px;">
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
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                .tut-sidebar-item:hover { background: #1a1a1a !important; }
            </style>
            <div style="display:flex; height:100%; width:100%;">
                <!-- Sidebar -->
                <div style="width:230px; min-width:230px; background:#111; border-right:1px solid #222; padding:15px 10px; display:flex; flex-direction:column;">
                    <div style="color:#666; font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; padding-left:5px;">📖 Guías de Pipeline</div>
                    ${Tutorials.renderSidebar()}
                    <div style="flex:1;"></div>
                    <div style="color:#333; font-size:0.65rem; text-align:center; padding-top:10px; border-top:1px solid #1a1a1a;">Pipeta Pipeline Manager</div>
                </div>
                <!-- Content -->
                <div style="flex:1; padding:30px 40px; overflow-y:auto; background:#0d0d0d;">
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
