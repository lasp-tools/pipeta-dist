# CODEMAP: PIPETA MODULAR ARCHITECTURE (AGENT QUICK-START)

> **PROPÓSITO:** Esta guía permite a cualquier agente o desarrollador ubicar y modificar cualquier funcionalidad de Pipeta en **menos de 2 minutos**, sin leer miles de líneas de código irrelevante y con garantía de **cero regresiones**.

---

## ⚡ REGLA DE ORO DE 2 MINUTOS (FAST-CHECK)
Antes de dar por terminado cualquier cambio en Pipeta Beta, ejecuta siempre:
```powershell
& "C:\TOOLS\APPS\Pipeta\bin\node\node.exe" "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta_Beta\tools\verify_pipeta_fast.js"
```
*Tarda menos de **800ms** y verifica sintaxis JS, JSONs válidos, 102 rutas Express y contratos de eventos del DOM.*

---

## 🗺️ MAPA DE DOMINIOS: "¿DÓNDE ESTÁ LO QUE TENGO QUE TOCAR?"

### 1. BACKEND & SERVICIOS (Express / Node.js)
El backend está dividido en 9 routers especializados en `server/routes/` y un núcleo de servicios en `server/core/`:

| Dominio / Funcionalidad | Módulo Backend | Archivo |
|---|---|---|
| **Orquestador Principal** | Arranque, middlewares, CORS, montaje de rutas | [`server/server.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/server.js) |
| **Contexto Global / Config** | Paths de Pipeta, puertos, cache de config | [`server/core/app-context.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/core/app-context.js) |
| **Detección de Red & Entorno** | Detección LAN Munro, VPN, Disco Z, perfil | [`server/core/env-detector.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/core/env-detector.js) |
| **Rclone Wrapper** | Binario, flags, sync, copy, bisync | [`server/core/rclone.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/core/rclone.js) |
| **Logger Central** | Logs con rotación y buffering a disco | [`server/core/logger.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/core/logger.js) |
| **Sistema & Versión** | `/api/version`, `/api/health`, hardware, reboot | [`server/routes/system.routes.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/routes/system.routes.js) |
| **Sincronización (Rclone/Worker)**| Catálogos, órdenes, sync trigger, worker status | [`server/routes/sync.routes.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/routes/sync.routes.js) |
| **Explorador & Archivos (FS)** | `/api/fs/list`, read, write, copy, thumbnails | [`server/routes/fs.routes.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/routes/fs.routes.js) |
| **IA & Higgsfield** | `/api/ia/*`, `/api/higgsfield/*`, tokens, cola IA | [`server/routes/ia.routes.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/routes/ia.routes.js) |
| **Ramón / TACTIC (Solo Lectura)**| Tickets, notas de versión, query, eval | [`server/routes/ramon.routes.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/routes/ramon.routes.js) |
| **Usuarios, Roles & Estados** | RBAC, `/api/users`, `/api/statuses`, pipeline | [`server/routes/users-workflow.routes.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/routes/users-workflow.routes.js) |
| **Actualizador (Auto-Updater)** | Chequeo de versión en red, `/api/updater/*` | [`server/routes/updater.routes.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/routes/updater.routes.js) |
| **Auditoría de Archivos** | `/api/audit/*`, verificación de integridad | [`server/routes/audit.routes.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/routes/audit.routes.js) |
| **Logs del Servidor** | `/api/logs/recent`, stream de eventos | [`server/routes/logs.routes.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/server/routes/logs.routes.js) |

---

### 2. FRONTEND & UI (Modular)
La interfaz se encuentra en `ui/` y está dividida por módulos desacoplados:

#### A. Estado & Core
- **`PipetaStore` / `PipetaEvents`:** [`ui/js/core/pipeta-store.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/core/pipeta-store.js)
  *Estado centralizado reactivo. Puedes leer/escribir con `window.PipetaStore.set('key', val)` o directamente sobre los proxies globales `window.key = val`. Escucha cambios con `window.PipetaEvents.on('state:key', (newVal) => {})`.*
- **Header & Toolbar Superior:** [`ui/js/header-toolbar.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/header-toolbar.js)
  *Controles superiores de proyecto, red, botones de sincronización rápida y accesos.*

#### B. Panel de Configuración (`Settings`)
El antiguo monolito de 4,000 líneas fue dividido en 5 sub-módulos limpios:
- **Núcleo y Apertura del Modal:** [`ui/js/settings/settings-core.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/settings/settings-core.js)
- **Gestión de Proyectos, Rutas y Presets:** [`ui/js/settings/settings-projects.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/settings/settings-projects.js)
- **Configuración de Sincronización:** [`ui/js/settings/settings-sync.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/settings/settings-sync.js)
- **Usuarios, Roles y Permisos (RBAC):** [`ui/js/settings/settings-users.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/settings/settings-users.js)
- **Exportación / Importación y Backup:** [`ui/js/settings/settings-export.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/settings/settings-export.js)

#### C. Módulo de IA Ingest
Subdividido en 4 áreas funcionales en `ui/js/ia/`:
- **Nomenclatura y Tokens de IA:** [`ui/js/ia/ia-tokens.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/ia/ia-tokens.js)
- **Contexto de Shot / Asset y Resoluciones:** [`ui/js/ia/ia-context.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/ia/ia-context.js)
- **Integración Higgsfield / Run:** [`ui/js/ia/ia-higgsfield.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/ia/ia-higgsfield.js)
- **Cola y Ejecución de Ingesta:** [`ui/js/ia/ia-ingest-queue.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/ia/ia-ingest-queue.js)

#### D. Designers & Creators (Reducción de Redundancias)
- **Motor de Canvas y Zoom Compartido:** [`ui/js/designers/designer-canvas-shared.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/designers/designer-canvas-shared.js)
  *Compartido entre Asset Designer (`asset-designer.js`) y Shot Designer (`shot-designer.js`).*
- **Motor de Creación y Validación Compartido:** [`ui/js/creators/creator-shared.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/creators/creator-shared.js)
  *Compartido entre Asset Creator (`asset-creator.js`) y Shot Creator (`shot-creator.js`).*

#### E. Datos Estáticos Desacoplados
- **Patch Notes (Novedades de Versión):** [`ui/js/data/patch-notes-data.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/data/patch-notes-data.js)
- **Shortcuts / Atajos de Teclado:** [`ui/js/data/shortcuts-data.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/data/shortcuts-data.js)

#### F. Sincronización UI (Sustituto de Miller View)
- **Sync Overlay:** [`ui/js/sync-overlay.js`](file:///Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta_Beta/ui/js/sync-overlay.js)
  *Maneja la superposición de sincronización, descarga de catálogos y ghost items en el Explorer. El viejo Miller View fue completamente eliminado.*

---

## 🛠️ HERRAMIENTAS Y SCRIPTS DE DESARROLLO

1. **Subir de Versión Atómicamente:**
   ```powershell
   & "C:\TOOLS\APPS\Pipeta\bin\node\node.exe" "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta_Beta\tools\bump_version.js" [major|minor|patch|version_string]
   ```
   *Sincroniza `version.json`, `server.js`, `config.js`, `.bat` e inyecta cache-busters `?v=...` en `index.html`.*

2. **Verificación Estática y Sintáctica Rápida:**
   ```powershell
   & "C:\TOOLS\APPS\Pipeta\bin\node\node.exe" "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta_Beta\tools\verify_pipeta_fast.js"
   ```

3. **Prueba End-to-End Headless (Playwright + HTTP):**
   ```powershell
   & "C:\TOOLS\APPS\Pipeta\bin\node\node.exe" "C:\Users\lasp-mpastorino\.gemini\antigravity\brain\6c48d7d5-b226-4c08-9a31-66fb7f966a67\scratch\e2e_test_pipeta_beta.js"
   ```

---

## 🔒 PAUTAS DE SEGURIDAD PARA AGENTES
- **Pipeta Main (Producción en puerto 3002):** NUNCA debe ser detenida, modificada ni reiniciada durante pruebas de Beta.
- **TACTIC / Ramón:** Todas las interacciones deben ser estrictamente de solo lectura (`query` / `eval` / `get_ticket`).
- **Compatibilidad con Node portable:** No utilizar dependencias ESM nativas o bundlers externos (Vite/Webpack). Mantener la compatibilidad con Node 18/20 CommonJS y el orden de carga en `index.html`.
