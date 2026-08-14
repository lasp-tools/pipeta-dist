# 🗺️ Hoja de Ruta (Roadmap): Pipeta (Pipeline Manager)

## Fase 1 [ ] El Núcleo de Hierro (Lógica Central)
Enfocada en establecer la comunicación entre unidades y el explorador visual base.

- 1.1 [x] Configuración Maestra: Implementación de pipeline_config.json para mapear las raíces de trabajo (Z:) y media (M:).
- 1.2 [x] Explorador de Columnas: Sistema de navegación Miller Columns para una exploración jerárquica fluida.
- 1.3 [x] Identidad & Modularidad: Diseño de interfaz premium oscura y división del código en módulos JS/CSS.
- 1.4 [x] Motor de I/O Avanzado: Integración de funciones para creación y gestión física de carpetas en disco.
    - 1.4.1 [x] Menú Contextual: Clic derecho unificado en Pipeta View y Árbol Clásico.
    - 1.4.2 [x] Abrir en Explorer: Revelar ubicación física en Windows.
    - 1.4.3 [x] Copy Path: Copiar ruta absoluta al portapapeles.
    - 1.4.4 [x] Portapapeles: Funciones de Copiar y Pegar archivos/carpetas físicas.
    - 1.4.5 [x] Renombrar: Edición de nombre con validación de nomenclatura automática.
    - 1.4.6 [x] Nueva Carpeta: Creación instantánea de directorios. [Antigravity sugerencia]
    - 1.4.7 [x] Duplicar: Clonado rápido de estructuras o archivos. [Antigravity sugerencia]
    - 1.4.8 [x] Borrado Seguro: Eliminar con ventana de confirmación visual. [Antigravity sugerencia]
- 1.5 [x] Validador de Nomenclatura: Herramienta flotante para santinizar nombres.
    - 1.5.1 [x] UI Flotante: Ventana redimensionable.
    - 1.5.2 [x] Motor de Reglas: Espacios, Acentos, Ñ, Caracteres.
    - 1.5.3 [x] Escaneo Recursivo: Filtros por Archivo/Carpeta.
    - 1.5.4 [x] Auto-Fix: Confirmación visual y corrección por lotes.
- 1.6 [x] Refinado de Interfaz (Polish): Ajustes visuales finales, animaciones y limpieza de estados JS.

---

## Fase 2 [ ] Sistema de Presets & Blueprints (Estructura Inteligente)
El objetivo es que Pipeta sepa qué carpetas debe crear según el tipo de contenido.

- 2.1 Designers de Estructura: Motores para definir plantillas inteligentes.
    - 2.1.1 [x] Asset Designer: Definición visual de nodos para tipos de assets.
    - 2.1.2 [x] Shot Designer: Definición de estructuras para secuencias y shots.
- 2.2 Creators (Instanciación): Mini-herramientas para ejecutar la creación real en disco.
    - 2.2.1 [x] Asset Creator: Interfaz para desplegar estructuras (Core funcional).
        - 2.2.1.1 [x] Integración: Archivos Versión Cero (Placeholders .txt) y Name Constructor.
    - 2.2.2 [x] Shot Creator: Despliegue masivo o individual de shots basado en plantillas.
        - 2.2.2.1 [x] Jerarquía de Producción: Creación de Episodios -> Escenas -> Shots.
        - 2.2.2.2 [x] Multi-Destino: Opciones de creación selectiva en "Proyecto", "Media" o "Ambos".
        - 2.2.2.3 [x] Lógica de Espejos: Botón para espejar estructuras existentes entre Work (Z:) y Media (M:).
        - 2.2.2.4 [x] Configuración de Episodio: Checkbox para creación selectiva de carpetas raíz (Editing, Sound, etc.).
        - 2.2.2.5 [x] Configuración del Shot (Work): Selector de procesos y opciones de archivos .txt (v0).
        - 2.2.2.6 [x] Estructura de Render (Media): Plantillas por software (Blender, Nuke, etc.) para carpetas de salida.
- 2.3 [x] Sistema de Inyección: Creación automática de archivos `vfx_control.json` para almacenar metadatos en cada entidad.

---

## Fase 3 [x] Interfaz de Usuario Premium & Contextual
Hacer que la UI no solo sea bonita, sino que entienda dónde está parado el usuario.

- 3.1 [x] Inspector de Estructura: Ver en tiempo real si la carpeta seleccionada cumple con su Preset (basado en el Designer).
- 3.2 [x] Salto Jerárquico: Navegación superior (breadcrumbs) interactiva para subir de nivel rápidamente.

---

## Fase 4 [ ] Motor de Sincronización (Local ↔ Online)
Sincronización inteligente entre la unidad física Local (Z:) y la nube de Google Drive (Unidad M: / Carpeta Z).

- 4.1 [x] Analizador de Diferencias: Comparación en tiempo real entre las estructuras Local (Z:) y Online (M:/Z/) para detectar archivos o carpetas faltantes.
- 4.2 [x] Sincronización Bidireccional: Herramienta para "Reparar" diferencias, permitiendo subir contenido a la nube o descargarlo al disco local según el análisis.
- 4.3 [x] Integración Rclone: Puentes de comando para usar Rclone en transferencias masivas a alta velocidad.
- 4.4 [x] Historial de Sincronización: Log visual para que el usuario sepa qué archivos se movieron y detectar fallos de transferencia.

---

## Fase 5 [ ] Calidad de Vida (Workflow Integrado)
Automatismos que ahorran clics diarios al equipo de artistas y coordinadores.

- 5.1 [ ] Lanzadores Contextuales: Botones de Abrir en Blender, Abrir en Explorer, Abrir en DaVinci según la ruta.
- 5.3 [x] Monitor de Almacenamiento: Barra visual que indica el espacio disponible en las unidades del oleoducto.
- 5.4 [ ] Ingesta Inteligente: Drag & Drop de archivos que clasifica automáticamente el contenido en la carpeta adecuada.
- 5.6 [ ] Pipeline Explorer 2.0: Iconografía avanzada que indique estados (Local, Publicado, Error, Desincronizado).


---
> **Última actualización:** 14/02/2026
> **Versión Actual:** v0.9.01
