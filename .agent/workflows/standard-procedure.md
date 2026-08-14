---
description: Procedimiento Estándar de Desarrollo para Pipeta
---

Este workflow debe ser consultado por el agente ANTES de iniciar y DESPUÉS de finalizar cualquier tarea de desarrollo.

## Normas de Versión
1. Por cada ajuste, corrección de bug o mejora menor, se debe incrementar el último dígito, formato SemVer, por ejemplo: v0.1.11 -> v0.1.12 -> v0.1.13.
3. Los cambios de versión mayor (ej: v0.8.12 -> v0.9.01) son decididos exclusivamente por el USUARIO.
4. La versión debe ser consistente en:
   - `ui, app, html, etc` (donde sea visible para el usuario de la app)
   - `server/ consolas` (si existiese)
   - `CHANGELOG.md` (última entrada)
5. **Frecuencia de Actualización**: Se debe incrementar el último dígito (versión menor) en **cada interacción/prompt** que implique cambios en el código, para reflejar el progreso continuo.

## Protocolo de Cierre de Tarea
// turbo
1. **Actualizar CHANGELOG.md**: Registrar bajo la nueva versión los cambios realizados (Added, Fixed, Modified). El CHANGELOG **nunca se trunca ni se limita**; cada versión debe quedar registrada permanentemente como historial acumulativo del proyecto.

2. **Actualizar ROADMAP.md**: Solo si nuestro proyecto tiene uno. Solo si se ha completado una tarea o fase estructural. No es necesario actualizar la fecha de "Última actualización" en cada prompt.
3. **Resumen al Usuario**: Al finalizar, indicar explícitamente qué versión se ha alcanzado.
## Estructura de Rutas
- Priorizar siempre rutas absolutas en `M:/Mi unidad/Z/...` para evitar conflictos con unidades mapeadas dinámicamente como `Z:`.
- Los archivos fuente SIEMPRE se editan en `M:\Mi unidad\Z\INTERNO\TOOLS\AntiGravity\Scripts\Pipeta\`. La carpeta `C:\TOOLS\APPS\Pipeta\` es solo la copia local de ejecución y se sincroniza al relanzar el .bat.