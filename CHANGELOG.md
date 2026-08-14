# Changelog - Pipeta
## [v0.9.02] - 2026-04-03
### Changed
- **Migración de Infraestructura (Local-First):**
    - Actualizadas las rutas de persistencia de `M:\` a `R:\` en el servidor central.
    - El buecle de reinicio ahora apunta al nuevo repositorio local en `R:\Z`.
    - Sincronización de versión unificada en todos los componentes.

## [v0.9.01] - 2026-02-14
### Modified
- **Estructura UI**: Los botones de Configuración y Consola se han movido a la parte inferior de la barra lateral izquierda para un diseño más limpio.
- **Badge Rclone**: El rayo indicador (`⚡`) se ha movido al lado de las barras de espacio en disco en el header.
- **Layout**: Reorganización del header para priorizar información de almacenamiento y herramientas contextuales.

## [v0.8.10] - 2026-02-14
### Added
- **Rclone Integration (Fase 4.3)**: Rclone v1.73.0 portable incluido en `tools/rclone/`. Detección automática al iniciar servidor.
- **API `/api/rclone/status`**: Endpoint para verificar disponibilidad de Rclone.
- **API `/api/rclone/syncBatch`**: Endpoint de sincronización batch que usa Rclone para copias (con fallback automático a copia nativa si Rclone no está presente).
- **Sync Analyzer con Rclone**: El Sync Analyzer ahora usa Rclone para copias si está disponible. Muestra qué motor se usó (🚀 Rclone / 📁 Nativo) en el resultado.
- **Badge ⚡ Rclone**: Indicador visual junto a la versión en el header cuando Rclone está activo.
- **API Version mejorada**: `/api/version` ahora informa el estado de Rclone.

## [v0.8.07] - 2026-02-14
### Modified
- **Monitor de Disco**: Color verde oscurecido para mejorar la legibilidad del texto blanco sobre las barras.

## [v0.8.06] - 2026-02-14
### Modified
- **Monitor de Disco**: Barras más altas (14px) con texto dentro: `14% usado / 1.59 TB free`. Formateo inteligente TB/GB.
- **Explorer Headers**: Eliminado "(Árbol)" de PROYECTO y MEDIA. Ahora muestran el tamaño entre paréntesis: `PROYECTO (12.45 GB)`. Tipografía más clara y grande.

## [v0.8.05] - 2026-02-14
### Added
- **Tamaño de Carpeta**: Los headers de PROYECTO y MEDIA en el Explorer ahora muestran el peso total de cada carpeta raíz (ej: `12.45 GB`).
### Modified
- **Monitor de Disco**: Barras agrandadas (70px × 8px), ahora muestran GB libres junto al porcentaje (ej: `65% 120G`).

## [v0.8.04] - 2026-02-14
### Added
- **Monitor de Almacenamiento (Fase 5.3)**: Barras de uso de disco en el header para Z: (Local) y M: (Online). Se actualizan cada 30 segundos con código de color (verde <70%, naranja 70-90%, rojo >90%). Tooltip con detalles en GB.

## [v0.8.03] - 2026-02-14
### Modified
- **UI**: Los botones de Consola y Sync Analyzer ahora tienen iconos blancos para mejor visibilidad.

## [v0.8.02] - 2026-02-14
### Changed
- **Workflow**: El Roadmap ya no se actualiza en cada prompt, solo al completar hitos o tareas estructurales.
- **Roadmap**: Eliminado el punto 5.5 (Pintado de Integridad) a petición del usuario.

## [v0.8.01] - 2026-02-14
### Added
- **Sync Analyzer (Fase 4.1 & 4.2)**: Nueva herramienta para comparar estructuras entre Local (Z:) y Online (M:/Z/) con capacidad de reparación bidireccional.
- **Consola de Actividad (Fase 4.4)**: Panel inferior dinámico que registra todas las operaciones de archivos (copia, renombre, borrado, etc.) en tiempo real.
- **Persistencia de Logs**: Los eventos de la consola se guardan automáticamente en archivos `.jsonl` diarios en disco local.
- **Split View Resizable**: Ahora la vista de Proyecto y Media en el Explorer tiene scroll independiente y un divisor arrastrable para ajustar el espacio.
- **Salto Jerárquico (Fase 3.2)**: Breadcrumbs interactivos en la vista Pipeta (Miller) para navegar niveles superiores instantáneamente.

## [v0.7.82] - 2026-02-14
### Added
- **Inspector (Fase 3.2)**: Nuevo sistema de auditoría estructural integrado en el panel de propiedades.
- **Auditoría Automática**: Si una carpeta tiene `vfx_control.json`, verifica que existan todas las carpetas obligatorias del preset. Muestra alerta y botón de reparación si falta algo.
- **Detección de Estructura**: Si una carpeta NO tiene metadatos pero parece un Asset o Shot (según ubicación), sugiere oficializarla creando automáticamente el JSON y reparando la estructura faltante.
- **Configuración Avanzada**: Nueva sección en Settings para definir los "Presets Maestros" de validación.

## [v0.7.81] - 2026-02-13
### Fixed
- **Tutoriales**: Se agregó un botón de cierre (X) en las guías y se corrigió la definición del nodo "Unidad" en Asset Designer (ahora se define como Disco/Punto de Montaje).

## [v0.7.80] - 2026-02-13
### Added
- **Explorer (Metadatos)**: Ahora el panel de propiedades muestra información detallada (Usuario, Preset, Fecha) extraída del archivo `vfx_control.json` si existe en la carpeta seleccionada.

## [v0.7.79] - 2026-02-13
### Added
- **Pantalla de Inicio (Tutoriales)**: Nueva pantalla Home con sidebar de mini tutoriales. Incluye guías para: Explorer, Asset Designer, Asset Creator, Naming Validator, Shot Designer y Shot Creator. Cada tutorial se abre en el panel central con contenido visual, tablas y tips.

## [v0.7.78] - 2026-02-13
### Added
- **Asset Creator + vfx_control.json**: Portada toda la lógica de inyección de metadatos al Asset Creator. Ahora también incluye el checkbox "Inyectar vfx_control" y genera archivos `vfx_control.json` tanto en la raíz del asset como en todas sus subcarpetas.

## [v0.7.77] - 2026-02-13
### Added
- **vfx_control.json (Jerarquía Completa)**: Ahora el archivo de metadatos se inyecta también en las carpetas raíz (Episodio, Escena o Shot), no solo en las subcarpetas de procesos. Esto permite una trazabilidad total desde el nivel más alto de la estructura creada.

## [v0.7.76] - 2026-02-13
### Changed
- **vfx_control.json**: Renombrado el archivo de metadatos de `.vfx_control.json` a `vfx_control.json` para evitar el punto inicial (archivo culto) y simplificar su acceso.

## [v0.7.75] - 2026-02-13
### Fixed
- **Shot Creator (Bucle de Creación)**: Corregido un error crítico donde el proceso de creación se detenía tras la primera carpeta debido a una variable no definida en el contexto recursivo.
- **Sistema de Inyección**: Activada la inyección de `vfx_control.json` que estaba fallando por un error de firma de función.

## [v0.7.74] - 2026-02-13
### Added
- **Sistema de Inyección (v0.1)**: Implementado el punto 2.3 del Roadmap. Añadido un checkbox en el Shot Creator para inyectar un archivo `vfx_control.json` en cada carpeta creada. Este archivo contiene metadatos como el ID del preset, la configuración del nodo, fecha de creación y usuario (auto-detectado del sistema).
- **API de Sistema**: Nuevo endpoint `/api/system/info` para recuperar datos del host (usuario, hostname).

## [v0.7.73] - 2026-02-13
### Fixed
- **Shot Creator ([PROCESO] en Media)**: Corregida la resolución de `[PROCESO]` dentro de variables conectadas. Ahora, cuando un nodo de render en media está conectado a un archivo de proyecto (ej: "Archivos" dentro del proceso "3D"), el sistema sube la jerarquía del nodo fuente para encontrar su proceso padre real, resolviendo el patrón `[Shot]_[PROCESO]_[version]` correctamente como `ICK_CAP01S1_E01_010_3D_v000` en vez de `..._PROCESO_v000`.
- **Shot Creator (RenderCounter)**: Corregido el padding del contador de render. `[RenderCounter####]` ahora genera `0001` (4 dígitos) en vez de `00001` (5 dígitos).

## [v0.7.72] - 2026-02-13
### Fixed
- **Shot Creator ([PROCESO])**: Corregida la inicialización del contexto `[PROCESO]` en la recursión de carpetas. Ahora, si una carpeta hereda la variable `PROCESO` de una conexión padre (ej. conexión entre un nodo Nuke y una carpeta Render), esta variable se utiliza correctamente en lugar de volver al valor por defecto "PROCESO". Esto soluciona que las rutas de salida se nombraran literalmente como `..._PROCESO_v00`.
