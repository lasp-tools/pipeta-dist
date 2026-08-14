// ------------------------------------------
// --- TUTORIALS MODULE ---
// ------------------------------------------

const Tutorials = {

    tutorials: [
        {
            id: 'explorer',
            icon: 'icons/view_classic.svg',
            title: 'Explorer',
            subtitle: 'Navegación de archivos',
            color: '#FF9800',
            content: `
                <h2 style="margin-top:0; color:#FF9800;">🗂️ Explorer</h2>
                <p style="color:#ccc; line-height:1.8;">El Explorer es el corazón de Pipeta. Te permite navegar la estructura de carpetas de tu proyecto de forma visual y eficiente.</p>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Vistas Disponibles</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">🌳 Vista Árbol (Split)</h4>
                        <p style="color:#999; font-size:0.9rem;">La vista clásica muestra dos paneles verticales: <b style="color:var(--accent);">Proyecto</b> arriba y <b style="color:#4CAF50;">Media</b> abajo. Ideal para navegar jerárquicamente.</p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">📊 Vista Miller (Pipeta)</h4>
                        <p style="color:#999; font-size:0.9rem;">Columnas dinámicas que se despliegan al navegar. Perfecta para ver la profundidad de la estructura sin perder contexto.</p>
                    </div>
                </div>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Barra de Herramientas</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold; width:140px;">LOCAL / ONLINE</td>
                        <td style="padding:8px; color:#999;">Alterna entre rutas locales (Z:) y rutas online (M: Google Drive).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold;">Mirror</td>
                        <td style="padding:8px; color:#999;">Activa el modo espejo: al seleccionar una carpeta en Proyecto, automáticamente navega a la misma ubicación en Media.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold;">Filtro Miller</td>
                        <td style="padding:8px; color:#999;">En Vista Miller, filtra el contenido por tipos de carpeta. Click Derecho para configurar.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold;">Click Derecho</td>
                        <td style="padding:8px; color:#999;">Sobre cualquier carpeta abre un menú contextual con opciones: Copiar, Pegar, Renombrar, Duplicar, Eliminar, Abrir en Sistema.</td>
                    </tr>
                </table>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Tips</h3>
                <ul style="list-style:none; padding:0;">
                    <li style="padding:6px 0; color:#aaa;">💡 Usa <b style="color:#fff;">Copiar Ruta</b> para obtener la ruta completa de cualquier carpeta.</li>
                    <li style="padding:6px 0; color:#aaa;">💡 <b style="color:#fff;">Abrir en Explorer</b> abre la carpeta directamente en el explorador de Windows.</li>
                    <li style="padding:6px 0; color:#aaa;">💡 El panel de <b style="color:#fff;">Propiedades</b> a la derecha muestra información de la selección actual.</li>
                </ul>
            `
        },
        {
            id: 'asset-designer',
            icon: 'icons/design_shots.svg',
            title: 'Asset Designer',
            subtitle: 'Diseño visual de presets de Assets',
            color: '#E91E63',
            content: `
                <h2 style="margin-top:0; color:#E91E63;">🎨 Asset Designer</h2>
                <p style="color:#ccc; line-height:1.8;">Herramienta visual de tipo nodos para diseñar la estructura de carpetas que tendrán tus assets. Aquí defines "plantillas" (presets) que luego serán usadas por el Asset Creator.</p>

                <h3 style="color:#E91E63; border-bottom:1px solid #333; padding-bottom:5px;">¿Cómo funciona?</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <ol style="padding-left:20px; color:#ccc; line-height:2;">
                        <li>Crea un <b style="color:#fff;">Nuevo Preset</b> desde la barra superior (Botón "New").</li>
                        <li>Agrega nodos usando los botones: <b style="color:#fff;">Unidad</b> (📦), <b style="color:#fff;">Carpeta</b> (📁), <b style="color:#fff;">Archivo</b> (📄).</li>
                        <li>Arrastra los nodos para organizar visualmente.</li>
                        <li>Conecta nodos arrastrando desde los puertos (puntos verdes en los laterales).</li>
                        <li>Configura propiedades desde el panel lateral derecho (sidebar).</li>
                    </ol>
                </div>

                <h3 style="color:#E91E63; border-bottom:1px solid #333; padding-bottom:5px;">Tipos de Nodos</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold; width:120px;">📦 Unidad</td>
                        <td style="padding:8px; color:#999;">Representa un "Disco" o unidad de almacenamiento (ej: "Z:", "M:").</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold;">📁 Carpeta</td>
                        <td style="padding:8px; color:#999;">Carpeta real que se creará en el disco. Puede tener hijos y configuración de naming.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#E91E63; font-weight:bold;">📄 Archivo</td>
                        <td style="padding:8px; color:#999;">Archivo placeholder (versión cero) que se creará dentro de la carpeta padre.</td>
                    </tr>
                </table>

                <h3 style="color:#E91E63; border-bottom:1px solid #333; padding-bottom:5px;">Propiedades del Nodo</h3>
                <ul style="list-style:none; padding:0;">
                    <li style="padding:6px 0; color:#aaa;">⚙️ <b style="color:#fff;">isCategory</b>: Marca un nodo como categoría seleccionable en el Asset Creator.</li>
                    <li style="padding:6px 0; color:#aaa;">⚙️ <b style="color:#fff;">isAssetFocus</b>: Define el nodo raíz del asset (la carpeta que se duplicará por cada nuevo asset).</li>
                    <li style="padding:6px 0; color:#aaa;">⚙️ <b style="color:#fff;">isProcess</b>: Marca un proceso seleccionable (ej: Modeling, Texturing, Rigging).</li>
                    <li style="padding:6px 0; color:#aaa;">⚙️ <b style="color:#fff;">Name Config</b>: Permite definir patrones de nombre con variables como [ASSET], [PROCESO], [version].</li>
                </ul>

                <div style="background:#2a1a1a; padding:12px; border-radius:8px; border-left:4px solid #E91E63; margin-top:15px;">
                    <span style="color:#E91E63; font-weight:bold;">⚠️ Importante:</span>
                    <span style="color:#aaa;"> Recuerda presionar <b style="color:#fff;">Save</b> después de cada cambio. Los presets se guardan como archivos JSON.</span>
                </div>
            `
        },
        {
            id: 'asset-creator',
            icon: 'icons/asset_creator.svg',
            title: 'Asset Creator',
            subtitle: 'Creación de estructuras de Assets',
            color: '#FF9800',
            content: `
                <h2 style="margin-top:0; color:#FF9800;">🏗️ Asset Creator</h2>
                <p style="color:#ccc; line-height:1.8;">Toma un preset diseñado en el Asset Designer y lo materializa: crea todas las carpetas y archivos en disco según la estructura definida.</p>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Modos de Uso</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">✨ Nuevo Asset</h4>
                        <p style="color:#999; font-size:0.9rem;">Crea un asset completamente nuevo. Escribe el nombre del asset y selecciona la categoría destino. El sistema creará toda la estructura de carpetas según el preset.</p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333;">
                        <h4 style="color:#fff; margin-top:0;">💉 Inyectar Procesos</h4>
                        <p style="color:#999; font-size:0.9rem;">Aplica procesos faltantes a assets ya existentes. Útil cuando se añade un nuevo proceso al preset y necesitas actualizar assets antiguos.</p>
                    </div>
                </div>

                <h3 style="color:#FF9800; border-bottom:1px solid #333; padding-bottom:5px;">Parámetros</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold; width:160px;">Preset</td>
                        <td style="padding:8px; color:#999;">El template de estructura a usar (creado en Asset Designer).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold;">Categoría</td>
                        <td style="padding:8px; color:#999;">La subcarpeta de assets/ donde se creará (Characters, Props, etc.).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold;">Procesos</td>
                        <td style="padding:8px; color:#999;">Checkboxes para elegir qué procesos incluir (ej: Modeling, Texturing).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold;">Versión Cero</td>
                        <td style="padding:8px; color:#999;">Si está activo, crea archivos .txt placeholder como versión 0.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#FF9800; font-weight:bold;">Inyectar vfx_control</td>
                        <td style="padding:8px; color:#999;">Crea un archivo vfx_control.json con metadatos en cada carpeta.</td>
                    </tr>
                </table>

                <div style="background:#1a2a1a; padding:12px; border-radius:8px; border-left:4px solid #4CAF50; margin-top:15px;">
                    <span style="color:#4CAF50; font-weight:bold;">💡 Tip:</span>
                    <span style="color:#aaa;"> El contexto se detecta automáticamente desde la carpeta seleccionada en el Explorer. Si estás dentro de un proyecto, el Asset Creator resolverá Cliente/Proyecto automáticamente.</span>
                </div>
            `
        },
        {
            id: 'naming-validator',
            icon: 'icons/validator.svg',
            title: 'Naming Validator',
            subtitle: 'Verificación de convenciones de nombrado',
            color: '#4CAF50',
            content: `
                <h2 style="margin-top:0; color:#4CAF50;">✅ Naming Validator</h2>
                <p style="color:#ccc; line-height:1.8;">Verifica que los nombres de carpetas y archivos cumplan con las convenciones definidas en tu preset. Detecta errores de nomenclatura antes de que se conviertan en problemas.</p>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">¿Cómo acceder?</h3>
                <div style="background:#1a1a1a; padding:15px; border-radius:8px; border:1px solid #333; margin-bottom:20px;">
                    <p style="color:#ccc; margin:0;">Desde la barra de herramientas del Explorer, haz clic en el botón <b style="color:#4CAF50;">Naming Validator</b> (icono de check). Se abrirá una ventana flotante sobre el Explorer.</p>
                </div>

                <h3 style="color:#4CAF50; border-bottom:1px solid #333; padding-bottom:5px;">Funcionalidades</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold; width:180px;">Comparación de Preset</td>
                        <td style="padding:8px; color:#999;">Compara las carpetas existentes contra la estructura esperada del preset seleccionado.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold;">Detección de Errores</td>
                        <td style="padding:8px; color:#999;">Identifica carpetas que no deberían existir o que faltan según la estructura definida.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#4CAF50; font-weight:bold;">Estado Visual</td>
                        <td style="padding:8px; color:#999;">Usa colores para indicar el estado: Verde = correcto, Rojo = error, Amarillo = advertencia.</td>
                    </tr>
                </table>

                <div style="background:#1a2a1a; padding:12px; border-radius:8px; border-left:4px solid #4CAF50; margin-top:15px;">
                    <span style="color:#4CAF50; font-weight:bold;">💡 Tip:</span>
                    <span style="color:#aaa;"> Selecciona primero la carpeta que quieras validar en el Explorer y luego abre el Validator. Se analizará la carpeta seleccionada y sus hijos.</span>
                </div>
            `
        },
        {
            id: 'shot-designer',
            icon: 'icons/video_camera_back.svg',
            title: 'Shot Designer',
            subtitle: 'Diseño de estructuras de Shots',
            color: '#2196F3',
            content: `
                <h2 style="margin-top:0; color:#2196F3;">🎬 Shot Designer</h2>
                <p style="color:#ccc; line-height:1.8;">Similar al Asset Designer, pero diseñado para la estructura de Shots/Secuencias. Aquí defines cómo se organizarán los episodios, escenas y shots de tu proyecto.</p>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Jerarquía Soportada</h3>
                <div style="display:flex; gap:10px; margin-bottom:20px; align-items:center; justify-content:center;">
                    <div style="background:#1a1a1a; padding:10px 18px; border-radius:8px; border:2px solid #2196F3; text-align:center;">
                        <div style="color:#2196F3; font-weight:bold;">Episodio</div>
                        <div style="color:#666; font-size:0.75rem;">isEpisode</div>
                    </div>
                    <div style="color:#555; font-size:1.5rem;">→</div>
                    <div style="background:#1a1a1a; padding:10px 18px; border-radius:8px; border:2px solid #2196F3; text-align:center;">
                        <div style="color:#2196F3; font-weight:bold;">Escena</div>
                        <div style="color:#666; font-size:0.75rem;">isScene</div>
                    </div>
                    <div style="color:#555; font-size:1.5rem;">→</div>
                    <div style="background:#1a1a1a; padding:10px 18px; border-radius:8px; border:2px solid #2196F3; text-align:center;">
                        <div style="color:#2196F3; font-weight:bold;">Shot</div>
                        <div style="color:#666; font-size:0.75rem;">isShot</div>
                    </div>
                </div>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Nodos Especiales</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#2196F3; font-weight:bold; width:150px;">isEpisode</td>
                        <td style="padding:8px; color:#999;">Nivel episodio (ej: CAP01S1). Define la carpeta contenedora de escenas.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#2196F3; font-weight:bold;">isScene</td>
                        <td style="padding:8px; color:#999;">Nivel escena dentro de un episodio.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#2196F3; font-weight:bold;">isShot</td>
                        <td style="padding:8px; color:#999;">El shot individual. Contiene los procesos (3D, Animación, Compo, etc.).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#2196F3; font-weight:bold;">isProcess</td>
                        <td style="padding:8px; color:#999;">Proceso de trabajo dentro del shot (ej: 3D, compo, IA).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#2196F3; font-weight:bold;">Mirror</td>
                        <td style="padding:8px; color:#999;">Conexiones tipo "mirror" definen la estructura paralela de Media/Render.</td>
                    </tr>
                </table>

                <h3 style="color:#2196F3; border-bottom:1px solid #333; padding-bottom:5px;">Variables de Naming</h3>
                <div style="background:#111; padding:12px; border-radius:8px; font-family:monospace; color:#aaa; font-size:0.85rem; line-height:1.8;">
                    <span style="color:#2196F3;">[Shot]</span> → Nombre del shot &nbsp;|&nbsp;
                    <span style="color:#2196F3;">[PROCESO]</span> → Nombre del proceso<br>
                    <span style="color:#2196F3;">[Episodio]</span> → Nombre del episodio &nbsp;|&nbsp;
                    <span style="color:#2196F3;">[Escena]</span> → Nombre de la escena<br>
                    <span style="color:#2196F3;">[version]</span> → Versión (v000) &nbsp;|&nbsp;
                    <span style="color:#2196F3;">[RenderCounter####]</span> → Contador con padding
                </div>
            `
        },
        {
            id: 'shot-creator',
            icon: 'icons/asset_creator.svg',
            title: 'Shot Creator',
            subtitle: 'Creación de estructuras de Shots',
            color: '#9C27B0',
            content: `
                <h2 style="margin-top:0; color:#9C27B0;">🎥 Shot Creator</h2>
                <p style="color:#ccc; line-height:1.8;">Materializa los presets del Shot Designer creando toda la estructura de carpetas para episodios, escenas y shots, incluyendo la estructura paralela de Media.</p>

                <h3 style="color:#9C27B0; border-bottom:1px solid #333; padding-bottom:5px;">Niveles de Creación</h3>
                <div style="display:flex; gap:15px; margin-bottom:20px;">
                    <div style="flex:1; background:#1a1a1a; padding:12px; border-radius:8px; border:1px solid #333; text-align:center;">
                        <div style="font-size:1.5rem; margin-bottom:5px;">📺</div>
                        <div style="color:#fff; font-weight:bold;">Episodio</div>
                        <p style="color:#666; font-size:0.75rem; margin:5px 0 0;">Crea toda la estructura de un episodio desde cero.</p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:12px; border-radius:8px; border:1px solid #333; text-align:center;">
                        <div style="font-size:1.5rem; margin-bottom:5px;">🎞️</div>
                        <div style="color:#fff; font-weight:bold;">Escena</div>
                        <p style="color:#666; font-size:0.75rem; margin:5px 0 0;">Crea una escena dentro de un episodio existente.</p>
                    </div>
                    <div style="flex:1; background:#1a1a1a; padding:12px; border-radius:8px; border:1px solid #333; text-align:center;">
                        <div style="font-size:1.5rem; margin-bottom:5px;">🎬</div>
                        <div style="color:#fff; font-weight:bold;">Shot</div>
                        <p style="color:#666; font-size:0.75rem; margin:5px 0 0;">Crea un shot individual con todos sus procesos.</p>
                    </div>
                </div>

                <h3 style="color:#9C27B0; border-bottom:1px solid #333; padding-bottom:5px;">Opciones</h3>
                <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#9C27B0; font-weight:bold; width:180px;">Estructura Proyecto</td>
                        <td style="padding:8px; color:#999;">Crea la estructura de trabajo (carpetas de procesos, archivos de versión cero).</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#9C27B0; font-weight:bold;">Estructura Media</td>
                        <td style="padding:8px; color:#999;">Crea la estructura de render/output en la ruta mirror definida en Settings.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#9C27B0; font-weight:bold;">Auto-Nombre</td>
                        <td style="padding:8px; color:#999;">Genera automáticamente el nombre del shot siguiendo la convención del preset.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#9C27B0; font-weight:bold;">Inyectar vfx_control</td>
                        <td style="padding:8px; color:#999;">Genera un archivo vfx_control.json con metadatos en cada carpeta creada.</td>
                    </tr>
                    <tr style="border-bottom:1px solid #333;">
                        <td style="padding:8px; color:#9C27B0; font-weight:bold;">+1 / +10</td>
                        <td style="padding:8px; color:#999;">Botones rápidos para crear shots consecutivos incrementando el contador.</td>
                    </tr>
                </table>

                <div style="background:#1a1a2a; padding:12px; border-radius:8px; border-left:4px solid #9C27B0; margin-top:15px;">
                    <span style="color:#9C27B0; font-weight:bold;">💡 Tip:</span>
                    <span style="color:#aaa;"> Selecciona solo los <b style="color:#fff;">procesos</b> y <b style="color:#fff;">carpetas de media</b> que necesites. No es necesario crear todos cada vez. Esto es especialmente útil en producción donde ciertos shots no pasan por todos los procesos.</span>
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
                <img src="${t.icon}" style="width:18px; height:18px; filter:brightness(0.7);">
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
                    <p style="color:#444; margin-top:10px;">Selecciona un tutorial del panel izquierdo</p>
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
        // Toggle
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
                <div style="width:200px; min-width:200px; background:#111; border-right:1px solid #222; padding:15px 10px; display:flex; flex-direction:column;">
                    <div style="color:#666; font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; padding-left:5px;">📖 Tutoriales</div>
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
