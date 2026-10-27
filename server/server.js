const express = require('express');
const cors = require('cors');
const path = require('path');
const open = require('open');
const fs = require('fs-extra'); // Replaces 'fs' with 'fs-extra'

const app = express();
const SERVER_BOOT_TIME = Date.now();
let hasActiveBrowserClient = false;

// Middleware para detectar pestañas activas del navegador
app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('Mozilla') || ua.includes('Chrome') || ua.includes('Safari') || ua.includes('Edg')) {
        hasActiveBrowserClient = true;
    }
    next();
});
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;
const VERSION = "v1.1.66";
const os = require('os'); // Added os module

// Restart Flag Check (Prevents duplicate tabs on reload)
// We use OS Temp dir because local files might be wiped by Robocopy /MIR from M: source
const RESTART_FLAG_FILE = path.join(os.tmpdir(), 'pipeta_restarting.flag');
try { if (fs.existsSync(RESTART_FLAG_FILE)) fs.removeSync(RESTART_FLAG_FILE); } catch (e) { }

const { spawn, execSync } = require('child_process');

// --- RCLONE DETECTION ---
const RCLONE_PATH = path.join(__dirname, '../tools/rclone/rclone.exe');
let rcloneAvailable = false;
let rcloneVersion = null;

try {
    if (fs.existsSync(RCLONE_PATH)) {
        const ver = execSync(`"${RCLONE_PATH}" version`, { timeout: 5000 }).toString();
        const match = ver.match(/rclone (v[\d.]+)/);
        rcloneVersion = match ? match[1] : 'unknown';
        rcloneAvailable = true;
        console.log(`[RCLONE] Detected: ${rcloneVersion} at ${RCLONE_PATH}`);
    } else {
        console.log('[RCLONE] Not found. Native copy will be used.');
    }
} catch (e) {
    console.log('[RCLONE] Check error:', e.message);
}

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Serve Static UI Files
const uiPath = path.join(__dirname, '../ui');
app.use(express.static(uiPath));

// ================================================================
// PIPETA CACHE & STORAGE RESOLVER
// ================================================================
function getLocalSyncCacheDir() {
    const appDir = path.resolve(__dirname, '..');
    const isGitRepo = fs.existsSync(path.join(appDir, '.git')) || __dirname.toLowerCase().includes('github');
    if (isGitRepo) {
        const localDevCache = path.resolve('C:/TOOLS/APPS/Pipeta/_SYNC_CACHE');
        try { fs.ensureDirSync(localDevCache); } catch(e) {}
        return localDevCache;
    }
    const localAppCache = path.join(appDir, '_SYNC_CACHE');
    try { fs.ensureDirSync(localAppCache); } catch(e) {}
    return localAppCache;
}

// ================================================================
// PIPETA SYSTEM LOGGER (Backend & Disk Persistence - Dual Mode)
const LOGS_DIR = path.join(__dirname, '../logs');
const REPORTS_DIR = path.join(LOGS_DIR, 'reports');
fs.ensureDirSync(LOGS_DIR);
fs.ensureDirSync(REPORTS_DIR);

function getTodayLogPath() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(LOGS_DIR, `pipeta_${today}.log`);
}

function getTodayErrorLogPath() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(LOGS_DIR, `pipeta_errors_${today}.log`);
}

function writeServerLog(source, type, message, status = 'info') {
    try {
        const now = new Date();
        const timeStr = now.toISOString().replace('T', ' ').substring(0, 23);
        const logLine = `[${timeStr}] [${source.toUpperCase()}] [${type.toUpperCase()}/${status.toUpperCase()}] ${message}\n`;
        fs.appendFileSync(getTodayLogPath(), logLine, 'utf8');

        // Si es error o advertencia crítica, escribir al archivo exclusivo de errores
        const isErr = status === 'error' || type === 'error' || status === 'critical' || status === 'CRITICAL' || status === 'ERROR';
        if (isErr) {
            fs.appendFileSync(getTodayErrorLogPath(), logLine, 'utf8');
        }
    } catch (e) {}
}

// Hook Node console.log / console.error / console.warn to disk log
const origConsoleLog = console.log;
const origConsoleError = console.error;
const origConsoleWarn = console.warn;

console.log = function(...args) {
    origConsoleLog.apply(console, args);
    try {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        writeServerLog('server', 'info', msg, 'info');
    } catch(e) {}
};

console.error = function(...args) {
    origConsoleError.apply(console, args);
    try {
        const msg = args.map(a => typeof a === 'object' ? (a.stack || JSON.stringify(a)) : String(a)).join(' ');
        writeServerLog('server', 'error', msg, 'error');
    } catch(e) {}
};

console.warn = function(...args) {
    origConsoleWarn.apply(console, args);
    try {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        writeServerLog('server', 'warn', msg, 'warn');
    } catch(e) {}
};

// Global Node Process Protection
process.on('uncaughtException', (err) => {
    origConsoleError("[CRITICAL UNCAUGHT EXCEPTION]", err);
    try {
        writeServerLog('server', 'error', `[UNCAUGHT EXCEPTION] ${err.stack || err.message}`, 'critical');
    } catch(e) {}
});

process.on('unhandledRejection', (reason) => {
    origConsoleError("[UNHANDLED PROMISE REJECTION]", reason);
    try {
        const rStr = (reason && reason.stack) ? reason.stack : String(reason);
        writeServerLog('server', 'error', `[UNHANDLED REJECTION] ${rStr}`, 'error');
    } catch(e) {}
});

// --- LOGS API ---
app.post('/api/logs/append', (req, res) => {
    try {
        const { entries } = req.body;
        if (Array.isArray(entries) && entries.length > 0) {
            const todayLog = getTodayLogPath();
            const todayErrorLog = getTodayErrorLogPath();
            let chunkAll = '';
            let chunkErrors = '';

            for (const entry of entries) {
                const timeStr = entry.isoTime ? entry.isoTime.replace('T', ' ').substring(0, 23) : new Date().toISOString().replace('T', ' ').substring(0, 23);
                const source = (entry.source || 'ui').toUpperCase();
                const type = (entry.type || 'log').toUpperCase();
                const status = (entry.status || 'info').toUpperCase();
                const line = `[${timeStr}] [${source}] [${type}/${status}] ${entry.message}\n`;
                chunkAll += line;

                if (status === 'ERROR' || type === 'ERROR' || status === 'CRITICAL') {
                    chunkErrors += line;
                }
            }

            fs.appendFileSync(todayLog, chunkAll, 'utf8');
            if (chunkErrors.length > 0) {
                fs.appendFileSync(todayErrorLog, chunkErrors, 'utf8');
            }
        }
        res.json({ success: true });
    } catch (err) {
        origConsoleError("[LOGS] Error appending logs:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/logs/open-folder', (req, res) => {
    try {
        fs.ensureDirSync(LOGS_DIR);
        const { exec } = require('child_process');
        exec(`explorer.exe "${LOGS_DIR.replace(/\//g, '\\\\')}"`);
        res.json({ success: true, path: LOGS_DIR });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/logs/open-reports-folder', (req, res) => {
    try {
        fs.ensureDirSync(REPORTS_DIR);
        const { exec } = require('child_process');
        exec(`explorer.exe "${REPORTS_DIR.replace(/\//g, '\\\\')}"`);
        res.json({ success: true, path: REPORTS_DIR });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/logs/open-errors-file', (req, res) => {
    try {
        const errorFile = getTodayErrorLogPath();
        if (!fs.existsSync(errorFile)) {
            fs.writeFileSync(errorFile, `[${new Date().toISOString()}] [SYSTEM/OK] No se registraron errores hoy.\n`, 'utf8');
        }
        const { exec } = require('child_process');
        exec(`notepad.exe "${errorFile.replace(/\//g, '\\\\')}"`);
        res.json({ success: true, path: errorFile });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/logs/generate-report', (req, res) => {
    try {
        const body = req.body || {};
        fs.ensureDirSync(REPORTS_DIR);

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const reportFileName = `reporte_${stamp}.txt`;
        const reportFilePath = path.join(REPORTS_DIR, reportFileName);

        const os = require('os');
        const hostname = os.hostname();
        const user = process.env.USERNAME || process.env.USER || 'desconocido';

        // Leer errores recientes de hoy
        const errorLogPath = getTodayErrorLogPath();
        let errorLines = [];
        if (fs.existsSync(errorLogPath)) {
            errorLines = fs.readFileSync(errorLogPath, 'utf8').split('\n').filter(Boolean);
        }

        // Leer últimas 40 operaciones de hoy
        const mainLogPath = getTodayLogPath();
        let recentActions = [];
        if (fs.existsSync(mainLogPath)) {
            const all = fs.readFileSync(mainLogPath, 'utf8').split('\n').filter(Boolean);
            recentActions = all.slice(-40);
        }

        let reportText = `======================================================================\n`;
        reportText += `   REPORTE DE DIAGNÓSTICO & ERRORES - PIPETA ${VERSION}\n`;
        reportText += `======================================================================\n`;
        reportText += `Fecha / Hora:     ${now.toLocaleString('es-AR')}\n`;
        reportText += `Equipo:           ${hostname}\n`;
        reportText += `Usuario Windows:  ${user}\n`;
        reportText += `Versión Pipeta:   ${VERSION}\n`;
        reportText += `Proyecto Activo:  ${body.project || 'No definido'}\n`;
        reportText += `Modo de Red:      ${body.locationMode || 'auto'}\n`;
        reportText += `Disco Z Estado:   ${body.zInfo || 'Auto-detect'}\n`;
        reportText += `Plataforma:       ${os.platform()} ${os.release()} (${os.arch()})\n`;
        reportText += `----------------------------------------------------------------------\n\n`;

        if (body.lastError) {
            reportText += `[ÚLTIMO ERROR REGISTRADO EN UI]:\n`;
            reportText += `${body.lastError}\n\n`;
        }

        reportText += `[ERRORES REGISTRADOS HOY (${errorLines.length})]:\n`;
        if (errorLines.length === 0) {
            reportText += `  (No se encontraron errores registrados en el log de hoy)\n\n`;
        } else {
            reportText += errorLines.slice(-30).map(l => `  ${l}`).join('\n') + `\n\n`;
        }

        reportText += `[BREADCRUMBS: ÚLTIMAS ${recentActions.length} ACCIONES PREVIAS]:\n`;
        if (recentActions.length === 0) {
            reportText += `  (Sin actividad registrada)\n\n`;
        } else {
            reportText += recentActions.map(l => `  ${l}`).join('\n') + `\n\n`;
        }

        reportText += `======================================================================\n`;
        reportText += `FIN DEL REPORTE - Archivo: ${reportFilePath}\n`;
        reportText += `======================================================================\n`;

        fs.writeFileSync(reportFilePath, reportText, 'utf8');

        // Abrir la carpeta en explorer seleccionando el archivo
        try {
            const { exec } = require('child_process');
            exec(`explorer.exe /select,"${reportFilePath.replace(/\//g, '\\\\')}"`);
        } catch(e) {}

        res.json({
            success: true,
            filePath: reportFilePath,
            filename: reportFileName,
            content: reportText
        });
    } catch (err) {
        origConsoleError("[LOGS] Error generating report:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/logs/export', (req, res) => {
    try {
        const todayLog = getTodayLogPath();
        if (fs.existsSync(todayLog)) {
            const content = fs.readFileSync(todayLog, 'utf8');
            res.json({ success: true, content, filename: path.basename(todayLog) });
        } else {
            res.json({ success: true, content: '', filename: path.basename(todayLog) });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/logs/recent', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const todayLog = getTodayLogPath();
        if (!fs.existsSync(todayLog)) {
            return res.json({ success: true, entries: [] });
        }
        const lines = fs.readFileSync(todayLog, 'utf8').split('\n').filter(l => l.trim().length > 0);
        const tail = lines.slice(-limit);
        res.json({ success: true, entries: tail });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ================================================================
// PIPETA CLIENT TELEMETRY & FLEET REGISTRATION (Mecanismo A)
// ================================================================
let activeRamonUser = '';
try {
    const lastUserFile = path.join(getLocalSyncCacheDir(), 'last_ramon_user.json');
    if (fs.existsSync(lastUserFile)) {
        const uData = fs.readJsonSync(lastUserFile);
        if (uData && uData.user) {
            activeRamonUser = String(uData.user).trim();
        }
    }
} catch (e) {}

function getAllLocalIps() {
    const out = [];
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
            }
        }
    } catch (e) {}
    return out;
}

function getPrimaryLocalIp() {
    // Prioridad: placa principal del estudio (206) > Nonstop (106) > cualquier 192.168.* (ej. 200) > otra
    const ips = getAllLocalIps();
    const pick = ips.find(a => a.startsWith('192.168.206.'))
        || ips.find(a => a.startsWith('192.168.106.'))
        || ips.find(a => a.startsWith('192.168.'))
        || ips[0];
    if (pick) return pick;
    return getPrimaryLocalIpLegacy();
}

function getPrimaryLocalIpLegacy() {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    if (iface.address.startsWith('192.168.')) {
                        return iface.address;
                    }
                }
            }
        }
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
    } catch (e) {}
    return '127.0.0.1';
}

function getSedeFromIp(ip) {
    if (!ip) return 'Remoto';
    if (ip.startsWith('192.168.206.') || ip.startsWith('192.168.200.')) return 'Munro';
    if (ip.startsWith('192.168.106.')) return 'Nonstop';
    return 'Remoto';
}

let isRemoteUpdating = false;
function executeRemoteUpdate() {
    if (isRemoteUpdating) return;
    isRemoteUpdating = true;
    console.log('[PIPETA REMOTE UPDATE] 🚨 Solicitud de actualización remota recibida desde Pipeta Server. Ejecutando actualizador...');
    try {
        const updaterBat = path.join(__dirname, '..', 'Actualizar_Pipeta_desde_Red.bat');
        const fallbackBat = 'C:\\TOOLS\\APPS\\Pipeta\\Actualizar_Pipeta_desde_Red.bat';
        const targetBat = fs.existsSync(updaterBat) ? updaterBat : (fs.existsSync(fallbackBat) ? fallbackBat : null);
        if (targetBat) {
            const { spawn } = require('child_process');
            const child = spawn('cmd.exe', ['/c', 'start', '""', targetBat], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            setTimeout(() => {
                process.exit(0);
            }, 1500);
        } else {
            console.error('[PIPETA REMOTE UPDATE ERROR] No se encontró Actualizar_Pipeta_desde_Red.bat');
        }
    } catch(err) {
        console.error('[PIPETA REMOTE UPDATE ERROR]', err);
    }
}


let lastConfigSyncTimestamp = 0;

async function syncConfigsFromMasterNetwork() {
    console.log('[CONFIG SYNC] ⚙️ Sincronizando presets, proyectos y permisos desde el servidor maestro...');
    const localPresets = path.join(__dirname, '../presets');
    const zPresets = 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets';
    const sPresets = 'S:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets';
    fs.ensureDirSync(localPresets);

    let bundleDownloaded = false;
    // 1. Intentar descargar el bundle maestro por HTTP desde Pipeta Server (0 SMB)
    try {
        const resp = await fetch('http://192.168.206.121:3005/api/server/presets/bundle', {
            signal: AbortSignal.timeout(4000)
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.success && data.bundle) {
                const b = data.bundle;
                const targetDirs = [localPresets];
                if (fs.existsSync('Z:\\INTERNO\\TOOLS')) targetDirs.push(zPresets);
                if (fs.existsSync('S:\\INTERNO\\TOOLS')) targetDirs.push(sPresets);

                for (const td of targetDirs) {
                    try {
                        fs.ensureDirSync(td);
                        if (b['users_config.json']) fs.writeJsonSync(path.join(td, 'users_config.json'), b['users_config.json'], { spaces: 2 });
                        if (b['pipeline_config.json']) fs.writeJsonSync(path.join(td, 'pipeline_config.json'), b['pipeline_config.json'], { spaces: 2 });
                        if (b['status_config.json']) fs.writeJsonSync(path.join(td, 'status_config.json'), b['status_config.json'], { spaces: 2 });
                        if (b['Projects']) {
                            const ptd = path.join(td, 'Projects');
                            fs.ensureDirSync(ptd);
                            for (const [pfn, pcontent] of Object.entries(b['Projects'])) {
                                fs.writeJsonSync(path.join(ptd, pfn), pcontent, { spaces: 2 });
                            }
                        }
                    } catch(dErr) {}
                }
                bundleDownloaded = true;
                console.log('[CONFIG SYNC] ✅ Configuraciones maestras hidratadas por HTTP desde Pipeta Server en local y Z/S.');
            }
        }
    } catch(httpErr) {}

    // 2. Si no se pudo por HTTP, usar fallback mediante Robocopy desde S:/Z:
    if (!bundleDownloaded) {
        const candidateMasterDirs = [
            'S:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets',
            'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets',
            '\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\presets'
        ];

        let foundMaster = null;
        for (const d of candidateMasterDirs) {
            if (fs.existsSync(path.join(d, 'users_config.json'))) {
                foundMaster = d;
                break;
            }
        }

        if (foundMaster && foundMaster.toLowerCase() !== localPresets.toLowerCase()) {
            try {
                const { execSync } = require('child_process');
                execSync(`robocopy "${foundMaster}" "${localPresets}" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS`, { timeout: 15000 });
                console.log(`[CONFIG SYNC] ✅ Presets y configuraciones actualizados desde ${foundMaster}`);
            } catch(e) {}
        }
    }

    // 3. Sincronizar catálogo modular de proyectos si el módulo está disponible
    try {
        if (catalogGenerator && typeof catalogGenerator.syncLocalCacheFromNetwork === 'function') {
            catalogGenerator.syncLocalCacheFromNetwork(null);
            console.log('[CONFIG SYNC] ✅ Catálogos de proyectos sincronizados.');
        }
    } catch(e) {}

    lastConfigSyncTimestamp = Date.now();
    return true;
}

async function sendClientTelemetryPing() {
    try {
        const hostname = os.hostname() || process.env.COMPUTERNAME || 'unknown';
        const ip = getPrimaryLocalIp();
        const windowsUser = process.env.USERNAME || (os.userInfo && os.userInfo().username) || '';
        const sede = getSedeFromIp(ip);

        const payload = {
            hostname: hostname,
            ip: ip,
            version: VERSION,
            user: activeRamonUser || '',
            ramonUser: activeRamonUser || '',
            windowsUser: windowsUser,
            osUser: windowsUser,
            sede: sede,
            uptime: Math.round(process.uptime()),
            lastConfigSync: lastConfigSyncTimestamp,
            ips: getAllLocalIps(),
            pid: process.pid,
            source: 'client_ping'
        };

        let httpSuccess = false;
        try {
            const resp = await fetch('http://192.168.206.121:3005/api/server/telemetry/client-ping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(2500)
            });
            if (resp.ok) {
                httpSuccess = true;
                try {
                    const data = await resp.json();
                    if (data && (data.command === 'update' || data.command === 'reinstall')) {
                        executeRemoteUpdate();
                    } else if (data && data.command === 'sync_config') {
                        syncConfigsFromMasterNetwork().then(() => {
                            setTimeout(() => {
                                sendClientTelemetryPing().catch(() => {});
                            }, 800);
                        });
                    }
                } catch(e) {}
            }
        } catch (httpErr) {
            // Error de conexión o timeout con Pipeta Server (192.168.206.121:3005)
        }

        // Comprobar si hay bandera de actualización en red
        try {
            const flagDirs = ['Z:/_SYNC_CACHE/flags', '//192.168.206.116/Z/_SYNC_CACHE/flags'];
            for (const fd of flagDirs) {
                const fPath = path.join(fd, `update_${hostname.toLowerCase()}.flag`);
                if (fs.existsSync(fPath)) {
                    try { fs.removeSync(fPath); } catch(e) {}
                    executeRemoteUpdate();
                    break;
                }
            }
        } catch(e) {}

        // Fallback resiliente a carpeta compartida de red si HTTP falla
        if (!httpSuccess) {
            try {
                const fileName = `client_${hostname}.json`;
                const netDirs = [
                    'Z:/_SYNC_CACHE/clients',
                    '//192.168.206.116/Z/_SYNC_CACHE/clients'
                ];
                for (const dir of netDirs) {
                    try {
                        fs.ensureDirSync(dir);
                        fs.writeJsonSync(path.join(dir, fileName), payload, { spaces: 2 });
                        break;
                    } catch (dErr) {}
                }
            } catch (diskErr) {}
        }
    } catch (err) {}
}

app.post('/api/telemetry/active-user', (req, res) => {
    try {
        const user = (req.body && req.body.user) ? String(req.body.user).trim() : '';
        activeRamonUser = user;
        try {
            const lastUserFile = path.join(getLocalSyncCacheDir(), 'last_ramon_user.json');
            fs.writeJsonSync(lastUserFile, { user: activeRamonUser, updatedAt: new Date().toISOString() });
        } catch (e) {}
        sendClientTelemetryPing().catch(() => {});
        res.json({ success: true, activeRamonUser });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- API ENDPOINTS ---

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: VERSION, uptime: process.uptime() });
});


app.post('/api/app/sync-configs', async (req, res) => {
    try {
        const ok = await syncConfigsFromMasterNetwork();
        res.json({ success: ok, lastConfigSync: lastConfigSyncTimestamp });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/version', (req, res) => {
    res.json({
        version: VERSION,
        serverBootTime: SERVER_BOOT_TIME,
        rclone: { available: rcloneAvailable, version: rcloneVersion }
    });
});

app.get('/api/system/info', (req, res) => {
    try {
        res.json({
            username: os.userInfo().username,
            hostname: os.hostname(),
            platform: os.platform()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/config', (req, res) => {
    try {
        const configPath = path.join(__dirname, '../pipeline_config.json');
        if (fs.existsSync(configPath)) {
            res.json(JSON.parse(fs.readFileSync(configPath, 'utf8')));
        } else {
            res.status(404).json({ error: "Config not found" });
        }
    } catch (err) {
        console.error("Config Error:", err);
        res.status(500).json({ error: "Config Error" });
    }
});

// --- SYNC CATALOG API ---
const catalogGenerator = require('./sync_catalog_generator');
const higgsfieldApi = require('./higgsfield_api');

// --- CACHED ENVIRONMENT & PERSISTENT INTERNET DETECTION ---
const ENV_STATE_FILE = path.join(process.env.LOCALAPPDATA || process.env.TEMP || __dirname, 'Pipeta_env_state.json');
let cachedEnvState = null;
let locationMode = 'auto'; // 'auto' | 'studio' | 'home'

try {
    if (fs.existsSync(ENV_STATE_FILE)) {
        cachedEnvState = fs.readJsonSync(ENV_STATE_FILE);
        if (cachedEnvState && cachedEnvState.locationMode) {
            locationMode = cachedEnvState.locationMode;
        }
        if (locationMode === 'studio') {
            global.isExternalMachine = false;
            global.isStudioNetworkDetected = true;
        } else if (locationMode === 'home') {
            global.isExternalMachine = true;
            global.isStudioNetworkDetected = false;
        } else if (cachedEnvState && typeof cachedEnvState.isExternalMachine === 'boolean') {
            global.isExternalMachine = cachedEnvState.isExternalMachine;
        }
        console.log(`[ENV CACHE] Estado cargado de disco: Internet = ${cachedEnvState?.hasInternet ? 'ONLINE' : 'OFFLINE'} | Perfil = ${locationMode} | Externo = ${global.isExternalMachine ? 'SI' : 'NO'}`);
    }
} catch (e) {}
global.locationMode = locationMode;


async function runEnvironmentDetection() {
    const http = require('http');
    let hasInternet = false;
    try {
        hasInternet = await new Promise((resolve) => {
            const req = http.get('http://clients3.google.com/generate_204', { timeout: 1800 }, (res) => {
                res.resume();
                resolve(res.statusCode >= 200 && res.statusCode < 400);
            });
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.on('error', () => { resolve(false); });
        });
    } catch (e) {
        hasInternet = false;
    }

    const hasDriveG = fs.existsSync('G:/Unidades compartidas') || fs.existsSync('G:/');
    const hasSyncCache = fs.existsSync('Z:/_SYNC_CACHE') || fs.existsSync(getLocalSyncCacheDir());

    // Detección precisa de Z: (Real vs Falso / Subst)
    let zInfo = { isRealServer: true, type: 'network', target: 'Servidor Central SMB' };

    // 1. Comprobar si Z: es un virtual subst local (típico de VM de desarrollo)
    try {
        const substOut = execSync('subst', { encoding: 'utf8', timeout: 1500 });
        const match = substOut.match(/Z:\\: => ([^\r\n]+)/i);
        if (match) {
            zInfo = { isRealServer: false, type: 'subst', target: match[1].trim() };
        }
    } catch (e) {}

    // 2. Si no fue subst, verificar recurso de red con comando net use dirigido específicamente a Z:
    if (zInfo.isRealServer) {
        try {
            const netOut = execSync('cmd.exe /c "net use z:"', { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] });
            const m = netOut.match(/(?:Nombre remoto|Remote name)\s+([^\r\n]+)/i);
            if (m) {
                zInfo = { isRealServer: true, type: 'network', target: m[1].trim() };
            }
        } catch (e) {
            // En caso de que falle net use pero Z: exista físicamente y no sea subst:
            if (fs.existsSync('Z:/')) {
                zInfo = { isRealServer: true, type: 'network', target: 'Servidor Central' };
            }
        }
    }

    // Detección de red de estudio vs equipo externo
    let isStudioNetwork = false;
    let ramonHost = null;
    try {
        const ramonCacheFile = path.join(os.tmpdir ? os.tmpdir() : (process.env.TEMP || 'C:\\Windows\\Temp'), 'pipeta_ramon_host.txt');
        if (fs.existsSync(ramonCacheFile)) {
            ramonHost = fs.readFileSync(ramonCacheFile, 'utf8').trim();
        }
    } catch (e) {}

    const net = require('net');
    try {
        isStudioNetwork = await new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(400);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });
            socket.connect(80, '192.168.206.140');
        });
    } catch (e) {
        isStudioNetwork = false;
    }

    const isRemoteRamon = !!(ramonHost && (ramonHost.includes('8075') || ramonHost.includes('https://')));
    
    // Aplicar perfil de ubicación (Auto vs Forzar Estudio vs Forzar Home)
    const activeLocationMode = global.locationMode || 'auto';
    let isExternalMachine = !isStudioNetwork || isRemoteRamon;
    if (activeLocationMode === 'studio') {
        isExternalMachine = false;
        isStudioNetwork = true;
    } else if (activeLocationMode === 'home') {
        isExternalMachine = true;
        isStudioNetwork = false;
    }

    // Actualizar variables globales para el generador de catálogos y colas de transferencia
    global.isExternalMachine = isExternalMachine;
    global.isStudioNetworkDetected = isStudioNetwork;

    let recommendedMode = 'offline_catalog';
    if (hasInternet) {
        recommendedMode = hasDriveG ? 'online_gdrive' : 'online_rclone';
    }

    cachedEnvState = {
        success: true,
        hasInternet,
        hasDriveG,
        hasSyncCache,
        isStudioNetwork,
        isExternalMachine,
        locationMode: activeLocationMode,
        ramonHost,
        recommendedMode,
        zInfo,
        rcloneAvailable,
        rcloneVersion,
        detectedAt: new Date().toISOString()
    };

    try {
        fs.ensureDirSync(path.dirname(ENV_STATE_FILE));
        fs.writeJsonSync(ENV_STATE_FILE, cachedEnvState, { spaces: 2 });
        console.log(`[ENV DETECT] Estado persistido en ${ENV_STATE_FILE}: Internet = ${hasInternet ? 'ONLINE' : 'OFFLINE'}, Red Estudio = ${isStudioNetwork ? 'SÍ' : 'NO (Remoto/Externo)'}, Perfil = ${activeLocationMode.toUpperCase()}, Z = ${zInfo.isRealServer ? 'Servidor Real' : 'Local/Subst'}`);
    } catch (e) {}

    return cachedEnvState;
}

function checkInternetQuickly() {
    if (cachedEnvState && typeof cachedEnvState.hasInternet === 'boolean') {
        return cachedEnvState.hasInternet;
    }
    return false;
}

// Ejecutar detección inicial en background para refrescar estado en cada inicio
runEnvironmentDetection().catch(() => {});


app.get('/api/sync/detect-env', async (req, res) => {
    try {
        const force = req.query.force === 'true';
        if (!force && cachedEnvState) {
            return res.json({ ...cachedEnvState, cached: true });
        }
        const state = await runEnvironmentDetection();
        res.json(state);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/sync/set-location-mode', async (req, res) => {
    try {
        const { mode } = req.body;
        if (!['auto', 'studio', 'home'].includes(mode)) {
            return res.status(400).json({ success: false, error: 'Modo inválido. Valores permitidos: auto, studio, home' });
        }
        global.locationMode = mode;
        if (mode === 'studio') {
            stopLocalWorker();
        }
        const state = await runEnvironmentDetection();
        console.log(`[ENV PERFIL] Perfil de ubicación cambiado manualmente a: ${mode.toUpperCase()} (isExternalMachine=${state.isExternalMachine})`);
        res.json({ success: true, locationMode: mode, env: state });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


app.get('/api/sync/catalogs', async (req, res) => {
    try {
        const list = await catalogGenerator.listAvailableCatalogs();
        res.json({ success: true, catalogs: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/sync/catalog/:project', async (req, res) => {
    try {
        const projectName = req.params.project;
        const catalog = await catalogGenerator.loadProjectCatalog(projectName);
        if (!catalog) {
            return res.status(404).json({ success: false, error: `Catálogo no encontrado para el proyecto ${projectName}` });
        }
        res.json({ success: true, catalog });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/sync/server-catalog/:project', async (req, res) => {
    try {
        if (cachedEnvState && cachedEnvState.isExternalMachine) {
            return res.status(404).json({ success: false, isExternal: true, error: "Catálogo de servidor deshabilitado en equipos externos" });
        }
        const projectName = req.params.project;
        if (typeof catalogGenerator.loadServerCatalog === 'function') {
            const catalog = await catalogGenerator.loadServerCatalog(projectName);
            if (catalog) {
                return res.json({ success: true, catalog });
            }
        }
        res.status(404).json({ success: false, error: `Catálogo de servidor no encontrado para ${projectName}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/system/last-project', (req, res) => {
    try {
        const localFile = path.join(getLocalSyncCacheDir(), 'last_project.json');
        const netFile = 'Z:/_SYNC_CACHE/last_project.json';
        let target = fs.existsSync(localFile) ? localFile : (fs.existsSync(netFile) ? netFile : null);
        if (target) {
            const data = fs.readJsonSync(target);
            return res.json({ success: true, lastProject: data.projectName || data.project || null });
        }
        res.json({ success: true, lastProject: null });
    } catch(e) {
        res.json({ success: true, lastProject: null });
    }
});

app.post('/api/system/last-project', (req, res) => {
    try {
        const { projectName } = req.body || {};
        if (!projectName) return res.status(400).json({ success: false, error: 'projectName requerido' });
        const payload = { projectName, updatedAt: new Date().toISOString() };
        const localDir = getLocalSyncCacheDir();
        fs.ensureDirSync(localDir);
        fs.writeJsonSync(path.join(localDir, 'last_project.json'), payload, { spaces: 2 });

        if (fs.existsSync('Z:/_SYNC_CACHE') && path.resolve(localDir).toLowerCase() !== path.resolve('Z:/_SYNC_CACHE').toLowerCase()) {
            try {
                fs.writeJsonSync('Z:/_SYNC_CACHE/last_project.json', payload, { spaces: 2 });
            } catch(e) {}
        }

        // Hidratar en segundo plano el catálogo modular del proyecto seleccionado hacia el SSD local C:
        setImmediate(() => {
            try {
                if (typeof catalogGenerator.syncLocalCacheFromNetwork === 'function') {
                    catalogGenerator.syncLocalCacheFromNetwork(projectName);
                }
            } catch(e) {}
        });

        res.json({ success: true, projectName });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/sync/catalog/status/:project', (req, res) => {
    try {
        const projectName = req.params.project;
        const localManifest = path.join(getLocalSyncCacheDir(), 'projects', projectName, 'drive', 'manifest.json');
        const netManifest = path.join('Z:/_SYNC_CACHE/projects', projectName, 'drive', 'manifest.json');
        const hasLocal = fs.existsSync(localManifest);
        const hasNetwork = fs.existsSync(netManifest);
        res.json({ success: true, project: projectName, hasLocalManifest: hasLocal, hasNetworkManifest: hasNetwork });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/sync/catalog/init-project', async (req, res) => {
    try {
        const { projectName } = req.body || {};
        if (!projectName) return res.status(400).json({ success: false, error: 'projectName requerido' });

        console.log(`[CATALOG INIT] Inicializando catálogo modular para proyecto: ${projectName}`);
        if (typeof catalogGenerator.syncLocalCacheFromNetwork === 'function') {
            catalogGenerator.syncLocalCacheFromNetwork(projectName);
        }

        let driveManifest = typeof catalogGenerator.getModularManifest === 'function'
            ? catalogGenerator.getModularManifest(projectName, 'drive')
            : null;

        // Si aún no existe ni en red ni en local, generarlo
        if (!driveManifest && typeof catalogGenerator.generateProjectCatalog === 'function') {
            try {
                console.log(`[CATALOG INIT] Generando catálogo modular inicial para ${projectName}...`);
                await catalogGenerator.generateProjectCatalog(projectName, { mode: 'auto' });
                driveManifest = catalogGenerator.getModularManifest(projectName, 'drive');
            } catch(e) {
                console.warn(`[CATALOG INIT] No se pudo generar catálogo inicial de Drive: ${e.message}`);
            }
        }

        // También sincronizar/asegurar manifest de servidor si está disponible
        let serverManifest = typeof catalogGenerator.getModularManifest === 'function'
            ? catalogGenerator.getModularManifest(projectName, 'server')
            : null;

        res.json({
            success: true,
            project: projectName,
            hasDriveManifest: !!driveManifest,
            hasServerManifest: !!serverManifest,
            manifest: driveManifest || serverManifest
        });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});


app.post('/api/sync/catalog/clear-cache', (req, res) => {
    try {
        if (typeof serverDirCache !== 'undefined') {
            serverDirCache.clear();
        }
        if (typeof catalogGenerator.clearMemoryCaches === 'function') {
            catalogGenerator.clearMemoryCaches();
        }
        res.json({ success: true, message: 'Caché de servidor y catálogos en memoria limpiada' });
    } catch (e) {
        res.json({ success: true });
    }
});

app.post('/api/sync/catalog/generate', async (req, res) => {
    try {
        const { project, mode, type } = req.body;
        if (!project) {
            return res.status(400).json({ success: false, error: 'Parámetro project requerido' });
        }
        if (typeof serverDirCache !== 'undefined') {
            serverDirCache.clear();
        }

        const hasInternet = checkInternetQuickly();
        if (!hasInternet && (type === 'drive' || !type)) {
            const triggerFile = path.join(ORDERS_DIR, '..', 'catalog_refresh_trigger.json');
            fs.writeJsonSync(triggerFile, {
                project,
                mode: mode || 'auto',
                type: type || 'drive',
                requestedAt: new Date().toISOString()
            }, { spaces: 2 });
            return res.json({ success: true, delegated: true, message: `Petición enviada al Worker central para escanear ${project}` });
        }

        let result = {};
        if (type === 'server') {
            result = await catalogGenerator.generateServerCatalog(project, { mode: mode || 'auto' });
        } else if (type === 'drive') {
            result = await catalogGenerator.generateProjectCatalog(project, { mode: mode || 'auto' });
        } else {
            const driveRes = await catalogGenerator.generateProjectCatalog(project, { mode: mode || 'auto' }).catch(e => ({ error: e.message }));
            let serverRes = null;
            if (typeof catalogGenerator.generateServerCatalog === 'function') {
                serverRes = await catalogGenerator.generateServerCatalog(project, { mode: mode || 'auto' }).catch(e => ({ error: e.message }));
            }
            result = { success: true, drive: driveRes, server: serverRes };
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const UNC_CACHE = '//192.168.206.116/Z/_SYNC_CACHE';

let cachedCentralCacheDir = { time: 0, dir: null };

function getCentralCacheDir() {
    // 0. Si hay un Local Worker activo o corriendo en esta máquina, SIEMPRE usar la carpeta local de Pipeta
    if (checkLocalWorkerRunning() || localWorkerPid) {
        return getLocalSyncCacheDir();
    }

    const now = Date.now();
    if (cachedCentralCacheDir.dir && (now - cachedCentralCacheDir.time < 15000)) {
        return cachedCentralCacheDir.dir;
    }

    const setAndReturn = (d) => {
        cachedCentralCacheDir = { time: now, dir: d };
        return d;
    };

    // 0.1 Si worker_status.json en la caché local tiene un heartbeat reciente (< 45s) de un local_worker
    try {
        const localStatus = path.join(getLocalSyncCacheDir(), 'worker_status.json');
        if (fs.existsSync(localStatus)) {
            const data = fs.readJsonSync(localStatus);
            const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
            if (diff < 45 && data.workerId && data.workerId.includes('local_worker')) {
                return setAndReturn(getLocalSyncCacheDir());
            }
        }
    } catch(e) {}

    // 0.2 Si estamos en un equipo externo / remoto, usar inmediatamente el cache local de Pipeta
    if (global.isExternalMachine || cachedEnvState?.isExternalMachine) {
        return setAndReturn(getLocalSyncCacheDir());
    }

    // 1. Si Z:/_SYNC_CACHE tiene un heartbeat activo o reciente (< 45s) de un Worker central, usar Z:/
    try {
        const zStatus = path.join('Z:/_SYNC_CACHE', 'worker_status.json');
        if (fs.existsSync(zStatus)) {
            const data = fs.readJsonSync(zStatus);
            const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
            if (diff < 45 && !data.workerId?.includes('local_worker')) return setAndReturn('Z:/_SYNC_CACHE');
        }
    } catch (e) {}

    // 2. Si UNC_CACHE tiene un heartbeat activo o reciente (< 45s), usar UNC_CACHE
    try {
        const uncStatus = path.join(UNC_CACHE, 'worker_status.json');
        if (fs.existsSync(uncStatus)) {
            const data = fs.readJsonSync(uncStatus);
            const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
            if (diff < 45) return setAndReturn(UNC_CACHE);
        }
    } catch (e) {}

    // 3. Si Z: es un subst local (típico de VM de desarrollo) y existe UNC_CACHE, preferir UNC_CACHE
    try {
        if (fs.existsSync(UNC_CACHE)) {
            const substOut = execSync('subst', { encoding: 'utf8', timeout: 500 });
            if (/Z:\\: =>/i.test(substOut)) {
                return setAndReturn(UNC_CACHE);
            }
        }
    } catch (e) {}

    // 4. Si Z:/_SYNC_CACHE existe (ruta estándar en puestos de trabajo con Z: mapeado)
    if (fs.existsSync('Z:/_SYNC_CACHE')) {
        return setAndReturn('Z:/_SYNC_CACHE');
    }

    // 5. Si UNC_CACHE existe
    if (fs.existsSync(UNC_CACHE)) {
        return setAndReturn(UNC_CACHE);
    }

    // 6. Fallback a carpeta local en la aplicación
    return setAndReturn(getLocalSyncCacheDir());
}

function getOrdersDir() {
    return path.join(getCentralCacheDir(), 'requests');
}

function getAllOrdersCandidateDirs() {
    const primaryDir = getOrdersDir();
    const dirs = [primaryDir];
    const localDir = path.join(getLocalSyncCacheDir(), 'requests');
    if (path.resolve(primaryDir).toLowerCase() !== path.resolve(localDir).toLowerCase()) {
        dirs.push(localDir);
    }
    const zDir = 'Z:/_SYNC_CACHE/requests';
    if (fs.existsSync(zDir) && !dirs.some(d => path.resolve(d).toLowerCase() === path.resolve(zDir).toLowerCase())) {
        dirs.push(zDir);
    }
    return dirs;
}

function saveOrderInCandidateDirs(orderId, orderData) {
    const candidateDirs = getAllOrdersCandidateDirs();
    let primaryFile = null;
    for (const dir of candidateDirs) {
        try {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const p = path.join(dir, `${orderId}.json`);
            fs.writeFileSync(p, JSON.stringify(orderData, null, 2), 'utf8');
            if (typeof ordersFileMemoryCache !== 'undefined') ordersFileMemoryCache.delete(p);
            if (!primaryFile) primaryFile = p;
        } catch (e) {}
    }
    if (typeof ordersResponseCache !== 'undefined') ordersResponseCache.time = 0;
    return primaryFile || path.join(getOrdersDir(), `${orderId}.json`);
}

app.post('/api/sync/catalog/refresh-folder', async (req, res) => {
    try {
        const { project, path: folderPath, type: reqType } = req.body;
        if (!project || !folderPath) {
            return res.status(400).json({ success: false, error: 'Parámetros project y path requeridos' });
        }

        const safeP = folderPath.replace(/\\/g, '/');
        const isServer = reqType === 'server';
        const catType = isServer ? 'server' : 'drive';
        const isExternal = !!(global.isExternalMachine || cachedEnvState?.isExternalMachine);

        // Invalidar caché en memoria del servidor
        if (typeof serverDirCache !== 'undefined') {
            serverDirCache.clear();
        }
        if (typeof catalogGenerator.clearMemoryCaches === 'function') {
            catalogGenerator.clearMemoryCaches();
        }

        // Si Z: es el servidor de red real y la carpeta existe físicamente, actualizar también el sub-catálogo de servidor
        if (!isExternal && cachedEnvState?.zInfo?.isRealServer && typeof catalogGenerator.refreshSubCatalog === 'function' && fs.existsSync(safeP)) {
            try {
                const srvModularRes = await catalogGenerator.refreshSubCatalog(project, safeP, 'server');
                if (catType === 'server' && srvModularRes && srvModularRes.success) {
                    return res.json(srvModularRes);
                }
            } catch (localModularErr) {
                console.warn(`[CATALOG REFRESH FOLDER] Falló refreshSubCatalog (server):`, localModularErr.message);
            }
        }

        // 1. Si es Server:
        if (catType === 'server') {
            if (isExternal) {
                return res.status(404).json({ success: false, isExternal: true, error: 'Catálogo de servidor no disponible en modo remoto' });
            }
        }

        // 2. Si es Drive y tiene internet, ejecutar de inmediato vía rclone
        if (catType === 'drive') {
            const hasInternet = await checkInternetQuickly();
            if (hasInternet) {
                if (typeof catalogGenerator.refreshSubCatalog === 'function') {
                    try {
                        const modularRes = await catalogGenerator.refreshSubCatalog(project, safeP, 'drive');
                        if (modularRes && modularRes.success) {
                            return res.json(modularRes);
                        }
                    } catch (localModularErr) {
                        console.warn(`[CATALOG REFRESH FOLDER] Falló refreshSubCatalog (drive):`, localModularErr.message);
                    }
                }
                try {
                    const result = await catalogGenerator.refreshCatalogSubfolder(project, folderPath);
                    if (result && result.success) {
                        return res.json(result);
                    }
                } catch (localErr) {
                    console.warn("[CATALOG REFRESH FOLDER] Falló ejecución local rclone:", localErr.message);
                }
            }
        }

        // 3. Si es máquina externa y falló lo anterior, responder de inmediato sin esperar al worker central
        if (isExternal) {
            return res.status(500).json({ success: false, error: 'No se pudo refrescar la carpeta en modo remoto (verifique conexión o ejecute worker local)' });
        }

        // 4. En red de estudio, delegar al Worker central en servidor
        console.log(`[CATALOG REFRESH FOLDER] Delegando consulta de '${folderPath}' (${catType}) al Worker central en servidor...`);
        const ordersDir = getOrdersDir();
        if (!fs.existsSync(ordersDir)) {
            fs.mkdirSync(ordersDir, { recursive: true });
        }

        const reqId = `rf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const reqFile = path.join(ordersDir, `${reqId}.json`);

        fs.writeJsonSync(reqFile, {
            id: reqId,
            type: 'refresh_folder',
            project,
            path: folderPath,
            targetType: catType,
            status: 'pending',
            priority: 90,
            user: os.userInfo ? os.userInfo().username : 'unknown',
            createdAt: new Date().toISOString()
        }, { spaces: 2 });

        // Esperar respuesta del Worker (polling hasta 15 segundos)
        const waitStart = Date.now();
        while (Date.now() - waitStart < 15000) {
            await new Promise(r => setTimeout(r, 400));
            if (fs.existsSync(reqFile)) {
                try {
                    const data = fs.readJsonSync(reqFile);
                    if (data.status === 'completed') {
                        try { fs.removeSync(reqFile); } catch(e){}
                        if (typeof serverDirCache !== 'undefined') serverDirCache.clear();
                        if (typeof rcloneDirCache !== 'undefined') rcloneDirCache.clear();
                        if (typeof catalogGenerator.clearMemoryCaches === 'function') {
                            catalogGenerator.clearMemoryCaches();
                        }
                        if (typeof catalogGenerator.syncLocalCacheFromNetwork === 'function') {
                            try { catalogGenerator.syncLocalCacheFromNetwork(project); } catch(e){}
                        }
                        return res.json(data.result || { success: true, delegated: true });
                    } else if (data.status === 'failed') {
                        try { fs.removeSync(reqFile); } catch(e){}
                        return res.status(500).json({ success: false, error: data.error || 'Worker no pudo refrescar la carpeta' });
                    }
                } catch(readErr) {}
            }
        }

        return res.status(504).json({ success: false, error: 'Tiempo de espera agotado esperando al Worker de sincronización' });

    } catch (err) {
        console.error("[CATALOG REFRESH FOLDER] Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0) + ' ' + units[i];
}

function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024));
    return (bytesPerSec / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function getDirectoryFilesAndSize(dirPath) {
    const files = [];
    let totalBytes = 0;
    function walk(currentDir, relPrefix = '') {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullEntryPath = path.join(currentDir, entry.name).replace(/\\/g, '/');
                const relEntryPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    walk(fullEntryPath, relEntryPath);
                } else if (entry.isFile()) {
                    try {
                        const st = fs.statSync(fullEntryPath);
                        files.push({ fullPath: fullEntryPath, relPath: relEntryPath, size: st.size });
                        totalBytes += st.size;
                    } catch (e) {
                        files.push({ fullPath: fullEntryPath, relPath: relEntryPath, size: 0 });
                    }
                }
            }
        } catch (e) {}
    }
    walk(dirPath);
    return { files, totalBytes };
}

const activeLocalTransfers = new Map();
const ensuredDirsCache = new Set();

function ensureDirCached(dir) {
    if (!dir || ensuredDirsCache.has(dir)) return;
    try {
        fs.ensureDirSync(dir);
        ensuredDirsCache.add(dir);
    } catch (e) {}
}

function streamCopyFile(srcFile, destFile, onChunk, abortSignal = null) {
    return new Promise((resolve, reject) => {
        if (abortSignal && abortSignal.aborted) {
            return reject(new Error('TRANSF_ABORTED'));
        }
        try {
            ensureDirCached(path.dirname(destFile));
            // Buffer de 2MB por stream (ideal para concurrencia multi-hilo en SMB sin saturar memoria)
            const readStream = fs.createReadStream(srcFile, { highWaterMark: 1024 * 1024 * 2 });
            const writeStream = fs.createWriteStream(destFile, { highWaterMark: 1024 * 1024 * 2 });

            const onAbort = () => {
                try { readStream.destroy(); } catch(e){}
                try { writeStream.destroy(); } catch(e){}
                try { if (fs.existsSync(destFile)) fs.removeSync(destFile); } catch(e){}
                reject(new Error('TRANSF_ABORTED'));
            };

            if (abortSignal) {
                abortSignal.addEventListener('abort', onAbort, { once: true });
            }

            readStream.on('data', (chunk) => {
                if (onChunk) onChunk(chunk.length);
            });

            readStream.on('error', (err) => {
                if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
                try { writeStream.destroy(); } catch(e){}
                reject(err);
            });

            writeStream.on('error', (err) => {
                if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
                try { readStream.destroy(); } catch(e){}
                reject(err);
            });

            writeStream.on('finish', () => {
                if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
                resolve();
            });

            readStream.pipe(writeStream);
        } catch (err) {
            reject(err);
        }
    });
}

async function runLocalTransferOrder(orderId, orderData, filePath) {
    const startTime = Date.now();
    const abortController = new AbortController();
    const candidateDirs = getAllOrdersCandidateDirs();
    const activeTransfer = {
        abortController,
        isCancelled: false,
        currentDestFile: null,
        orderData,
        filePath,
        candidateDirs
    };
    activeLocalTransfers.set(orderId, activeTransfer);

    orderData.status = 'processing';
    orderData.startedAt = new Date().toISOString();
    orderData.worker = `local_${os.hostname()}`;

    let isWritingProgress = false;
    const persistOrder = (isTerminal = false) => {
        const jsonStr = JSON.stringify(orderData, null, 2);
        for (const dir of candidateDirs) {
            const p = path.join(dir, `${orderId}.json`);
            if (typeof ordersFileMemoryCache !== 'undefined') {
                ordersFileMemoryCache.set(p, {
                    mtimeMs: Date.now(),
                    checkedAt: Date.now(),
                    isTerminal,
                    data: JSON.parse(jsonStr)
                });
            }
        }
        if (typeof ordersResponseCache !== 'undefined') ordersResponseCache.time = 0;

        // Escribir de forma inmediata y sincrónica en el SSD local para que las lecturas locales nunca fallen
        try {
            const localReqDir = path.join(getLocalSyncCacheDir(), 'requests');
            fs.ensureDirSync(localReqDir);
            fs.writeFileSync(path.join(localReqDir, `${orderId}.json`), jsonStr, 'utf8');
        } catch(e) {}

        // En red central (SMB), escribir sin solapamiento
        for (const dir of candidateDirs) {
            const localReqDir = path.join(getLocalSyncCacheDir(), 'requests');
            if (path.resolve(dir).toLowerCase() === path.resolve(localReqDir).toLowerCase()) continue;
            try {
                if (isTerminal) {
                    fs.writeFileSync(path.join(dir, `${orderId}.json`), jsonStr, 'utf8');
                } else if (!isWritingProgress) {
                    isWritingProgress = true;
                    fs.writeFile(path.join(dir, `${orderId}.json`), jsonStr, 'utf8')
                        .catch(() => {})
                        .finally(() => { isWritingProgress = false; });
                }
            } catch(e) {}
        }
    };

    persistOrder(false);

    const env = cachedEnvState || {};
    const isNotRealServer = !env?.zInfo?.isRealServer;
    const uncRoot = isNotRealServer ? getServerUncRoot() : null;
    if (isNotRealServer && uncRoot) {
        ensureServerUncAccess(uncRoot);
    }

    const isDownload = orderData.type === 'server_download';
    const itemsPlan = [];
    let grandTotalBytes = 0;

    for (const it of orderData.items) {
        let src = isDownload
            ? (it.serverPath || it.onlinePath || it.path)
            : (it.localPath || it.path);
        let dest = isDownload
            ? (it.targetLocalPath || it.path)
            : (it.targetServerPath || it.serverPath || it.path);

        if (!src || !dest) continue;
        src = src.replace(/\\/g, '/');
        dest = dest.replace(/\\/g, '/');

        if (isNotRealServer && uncRoot) {
            if (isDownload) {
                if (src.toLowerCase().startsWith('z:/') || !fs.existsSync(src)) {
                    src = src.replace(/^z:/i, uncRoot);
                }
            } else {
                if (dest.toLowerCase().startsWith('z:/')) {
                    dest = dest.replace(/^z:/i, uncRoot);
                }
            }
        }

        let isDir = !!it.isDir || !!it.isDirectory;
        let filesList = [];
        let itemBytes = 0;

        try {
            if (fs.existsSync(src)) {
                const st = fs.statSync(src);
                isDir = st.isDirectory();
                if (isDir) {
                    const dirData = getDirectoryFilesAndSize(src);
                    filesList = dirData.files;
                    itemBytes = dirData.totalBytes;
                } else {
                    itemBytes = st.size;
                    filesList = [{ fullPath: src, relPath: path.basename(src), size: itemBytes }];
                }
            }
        } catch (e) {
            console.warn(`[LOCAL TRANSFER] Error al analizar ${src}:`, e.message);
        }

        grandTotalBytes += itemBytes;
        itemsPlan.push({ src, dest, isDir, filesList, itemBytes, it });
    }

    let overallTransferredBytes = 0;
    let lastProgressWrite = 0;
    let windowStartTime = Date.now();
    let windowBytesTransferred = 0;
    let lastSpeed = 0;

    const updateProgress = (force = false, currentFileName = '', itemIndex = 1) => {
        if (activeTransfer.isCancelled || abortController.signal.aborted) return;
        const now = Date.now();
        if (!force && (now - lastProgressWrite < 800)) return;

        const timeDiffSec = (now - windowStartTime) / 1000;
        if (timeDiffSec >= 0.8) {
            lastSpeed = Math.round(windowBytesTransferred / timeDiffSec);
            windowBytesTransferred = 0;
            windowStartTime = now;
        }

        const avgSpeed = (now - startTime > 200) ? Math.round(overallTransferredBytes / Math.max(0.2, (now - startTime) / 1000)) : lastSpeed;
        const currentSpeed = lastSpeed > 0 ? lastSpeed : avgSpeed;

        const remainingBytes = Math.max(0, grandTotalBytes - overallTransferredBytes);
        const etaSeconds = (currentSpeed > 0 && remainingBytes > 0) ? Math.round(remainingBytes / currentSpeed) : 0;
        const pct = grandTotalBytes > 0 
            ? Math.min(100, Math.round((overallTransferredBytes / grandTotalBytes) * 1000) / 10) 
            : 0;

        orderData.progress = {
            percentage: pct,
            transferredBytes: overallTransferredBytes,
            totalBytes: grandTotalBytes,
            speedBytesPerSec: currentSpeed,
            speedFormatted: formatSpeed(currentSpeed),
            etaSeconds,
            currentFile: currentFileName,
            itemIndex,
            itemsTotal: itemsPlan.length
        };

        lastProgressWrite = now;
        persistOrder(false);
    };

    const errors = [];
    try {
        for (let i = 0; i < itemsPlan.length; i++) {
            if (activeTransfer.isCancelled || abortController.signal.aborted) {
                throw new Error('TRANSF_ABORTED');
            }

            const plan = itemsPlan[i];
            const normSrc = path.resolve(plan.src.replace(/\//g, '\\')).toLowerCase();
            const normDest = path.resolve(plan.dest.replace(/\//g, '\\')).toLowerCase();

            if (normSrc === normDest) {
                console.log(`[LOCAL TRANSFER] Origen y destino idénticos, omitiendo copia física: ${plan.src}`);
                overallTransferredBytes += plan.itemBytes;
                updateProgress(true, path.basename(plan.src), i + 1);
                continue;
            }

            if (plan.isDir) {
                ensureDirCached(plan.dest);
            }

            let lastRemoteCancelCheck = 0;
            const checkRemoteCancel = async () => {
                if (activeTransfer.isCancelled || abortController.signal.aborted) {
                    throw new Error('TRANSF_ABORTED');
                }
                const now = Date.now();
                if (now - lastRemoteCancelCheck > 2500) {
                    lastRemoteCancelCheck = now;
                    try {
                        for (const dir of candidateDirs) {
                            const p = path.join(dir, `${orderId}.json`);
                            if (fs.existsSync(p)) {
                                const fresh = fs.readJsonSync(p);
                                if (fresh && fresh.status === 'cancelled') {
                                    activeTransfer.isCancelled = true;
                                    abortController.abort();
                                    throw new Error('TRANSF_ABORTED');
                                }
                            }
                        }
                    } catch (chkErr) {
                        if (chkErr.message === 'TRANSF_ABORTED') throw chkErr;
                    }
                }
            };

            // Concurrencia paralela optimizada para secuencias de frames (hasta 8 streams concurrentes)
            const CONCURRENCY = Math.min(8, Math.max(1, plan.filesList.length));
            let fileIndex = 0;

            const runWorker = async () => {
                while (fileIndex < plan.filesList.length) {
                    if (activeTransfer.isCancelled || abortController.signal.aborted) {
                        throw new Error('TRANSF_ABORTED');
                    }

                    await checkRemoteCancel();

                    const currentIndex = fileIndex++;
                    if (currentIndex >= plan.filesList.length) break;
                    const file = plan.filesList[currentIndex];
                    if (!file) break;

                    const targetFilePath = plan.isDir 
                        ? path.join(plan.dest, file.relPath).replace(/\\/g, '/')
                        : plan.dest;

                    activeTransfer.currentDestFile = targetFilePath;

                    try {
                        await streamCopyFile(file.fullPath, targetFilePath, (chunkBytes) => {
                            overallTransferredBytes += chunkBytes;
                            windowBytesTransferred += chunkBytes;
                            updateProgress(false, path.basename(file.relPath), i + 1);
                        }, abortController.signal);
                    } catch (copyErr) {
                        if (copyErr.message === 'TRANSF_ABORTED' || activeTransfer.isCancelled) {
                            throw copyErr;
                        }
                        errors.push({ file: file.relPath, error: copyErr.message });
                        console.error(`[LOCAL TRANSFER] Error copiando ${file.fullPath}:`, copyErr.message);
                    } finally {
                        activeTransfer.currentDestFile = null;
                    }
                }
            };

            const workers = [];
            for (let w = 0; w < CONCURRENCY; w++) {
                workers.push(runWorker());
            }

            await Promise.all(workers);
        }

        if (activeTransfer.isCancelled || abortController.signal.aborted) {
            throw new Error('TRANSF_ABORTED');
        }

        orderData.status = errors.length === 0 ? 'completed' : (errors.length < itemsPlan.length ? 'completed_with_errors' : 'failed');
        orderData.completedAt = new Date().toISOString();
        orderData.durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        if (orderData.progress) {
            orderData.progress.percentage = 100;
            orderData.progress.transferredBytes = grandTotalBytes;
            orderData.progress.speedFormatted = 'Completado';
            orderData.progress.etaSeconds = 0;
        }
        if (errors.length > 0) orderData.errors = errors;

        persistOrder(true);

        if (typeof serverDirCache !== 'undefined') serverDirCache.clear();
        if (typeof rcloneDirCache !== 'undefined') rcloneDirCache.clear();
        if (typeof catalogGenerator !== 'undefined' && typeof catalogGenerator.clearMemoryCaches === 'function') {
            catalogGenerator.clearMemoryCaches();
        }

        // Si fue subida al Servidor Central, refrescar el sub-catálogo del servidor para las carpetas afectadas
        if (orderData.type === 'server_upload' && typeof catalogGenerator !== 'undefined' && typeof catalogGenerator.refreshSubCatalog === 'function') {
            for (const plan of itemsPlan) {
                try {
                    const folder = path.dirname(plan.dest).replace(/\\/g, '/');
                    catalogGenerator.refreshSubCatalog(orderData.project, folder, 'server').catch(() => {});
                } catch(e) {}
            }
        }
    } catch (err) {
        if (err.message === 'TRANSF_ABORTED' || activeTransfer.isCancelled) {
            console.log(`[LOCAL TRANSFER] Orden ${orderId} CANCELADA con éxito. Deteniendo streams y limpiando.`);
            orderData.status = 'cancelled';
            orderData.cancelledAt = new Date().toISOString();
            if (orderData.progress) {
                orderData.progress.speedFormatted = 'Cancelado';
                orderData.progress.etaSeconds = 0;
            }
            if (activeTransfer.currentDestFile) {
                try { if (fs.existsSync(activeTransfer.currentDestFile)) fs.removeSync(activeTransfer.currentDestFile); } catch(e){}
            }
            persistOrder(true);
            return;
        }

        console.error(`[LOCAL TRANSFER ORDER] Error en ${orderId}:`, err);
        orderData.status = 'failed';
        orderData.error = err.message;
        orderData.completedAt = new Date().toISOString();
        orderData.durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));
        persistOrder(true);
    } finally {
        activeLocalTransfers.delete(orderId);
    }
}

app.post('/api/sync/request-download', async (req, res) => {
    try {
        const { project, items, user, transferType, type } = req.body;
        if (!project || !items || !items.length) {
            return res.status(400).json({ success: false, error: 'Parámetros project e items son requeridos' });
        }

        const ordersDir = getOrdersDir();
        if (!fs.existsSync(ordersDir)) {
            fs.mkdirSync(ordersDir, { recursive: true });
        }

        const isServer = transferType === 'server' || type === 'server_download';
        const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const priority = Math.min(100, Math.max(1, Number(req.body.priority) || 50));
        const orderData = {
            id: orderId,
            type: isServer ? 'server_download' : 'download',
            project,
            user: user || (os.userInfo ? os.userInfo().username : 'unknown'),
            createdAt: new Date().toISOString(),
            status: isServer ? 'processing' : 'pending',
            priority,
            items
        };

        const filePath = saveOrderInCandidateDirs(orderId, orderData);

        if (isServer) {
            console.log(`[SYNC ORDER] Orden de descarga de SERVIDOR iniciada localmente: ${orderId} (${items.length} items) [Prioridad: ${priority}]`);
            runLocalTransferOrder(orderId, orderData, filePath).catch(err => {
                console.error(`[LOCAL DOWNLOAD] Error en orden ${orderId}:`, err);
            });
            res.json({ success: true, orderId, count: items.length, status: 'processing', priority });
        } else {
            console.log(`[SYNC ORDER] Orden de descarga de DRIVE creada para Worker: ${orderId} (${items.length} items) para ${project} [Prioridad: ${priority}]`);
            ensureSyncWorkerRunning();
            res.json({ success: true, orderId, count: items.length, status: 'pending', priority });
        }
    } catch (err) {
        console.error("Sync request-download error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/sync/request-upload', async (req, res) => {
    try {
        const { project, items, user, transferType, type } = req.body;
        if (!project || !items || !items.length) {
            return res.status(400).json({ success: false, error: 'Parámetros project e items son requeridos' });
        }

        const ordersDir = getOrdersDir();
        if (!fs.existsSync(ordersDir)) {
            fs.mkdirSync(ordersDir, { recursive: true });
        }

        const isServer = transferType === 'server' || type === 'server_upload';

        // Sanitizar onlinePath para órdenes de subida a Drive si faltan o si se enviaron rutas locales
        const sanitizedItems = items.map(it => {
            const itemCopy = { ...it };
            if (!isServer) {
                const currentOnline = itemCopy.onlinePath || itemCopy.targetOnlinePath;
                const isAlreadyDrive = currentOnline && (
                    currentOnline.toLowerCase().startsWith('g:/') ||
                    currentOnline.toLowerCase().includes('unidades compartidas') ||
                    currentOnline.toLowerCase().startsWith('lasp-drive:')
                );
                if (!isAlreadyDrive) {
                    const localP = itemCopy.localPath || itemCopy.path || itemCopy.targetLocalPath;
                    const resolvedOnline = (typeof catalogGenerator.resolveLocalToOnlinePath === 'function')
                        ? catalogGenerator.resolveLocalToOnlinePath(localP, project)
                        : null;
                    if (resolvedOnline) {
                        itemCopy.onlinePath = resolvedOnline;
                    }
                }
            }
            return itemCopy;
        });

        const orderId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const priority = Math.min(100, Math.max(1, Number(req.body.priority) || 50));
        const orderData = {
            id: orderId,
            type: isServer ? 'server_upload' : 'upload',
            project,
            user: user || (os.userInfo ? os.userInfo().username : 'unknown'),
            createdAt: new Date().toISOString(),
            status: isServer ? 'processing' : 'pending',
            priority,
            items: sanitizedItems
        };

        const filePath = saveOrderInCandidateDirs(orderId, orderData);

        if (isServer) {
            console.log(`[SYNC ORDER] Orden de subida a SERVIDOR iniciada localmente: ${orderId} (${items.length} items) [Prioridad: ${priority}]`);
            runLocalTransferOrder(orderId, orderData, filePath).catch(err => {
                console.error(`[LOCAL UPLOAD] Error en orden ${orderId}:`, err);
            });
            res.json({ success: true, orderId, count: items.length, status: 'processing', priority });
        } else {
            console.log(`[SYNC ORDER] Orden de subida a DRIVE creada para Worker: ${orderId} (${items.length} items) para ${project} [Prioridad: ${priority}]`);
            ensureSyncWorkerRunning();
            res.json({ success: true, orderId, count: items.length, status: 'pending', priority });
        }
    } catch (err) {
        console.error("Sync request-upload error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

let localWorkerProcess = null;
let localWorkerPid = null;

function checkLocalWorkerRunning() {
    if (localWorkerPid) {
        try {
            process.kill(localWorkerPid, 0);
            return true;
        } catch (e) {
            localWorkerProcess = null;
            localWorkerPid = null;
        }
    }
    // Fallback: verificar si existe un worker_status.json reciente de local_worker
    try {
        const localStatus = path.join(getLocalSyncCacheDir(), 'worker_status.json');
        if (fs.existsSync(localStatus)) {
            const data = fs.readJsonSync(localStatus);
            const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
            if (diff < 20 && data.workerId && data.workerId.includes('local_worker')) {
                return true;
            }
        }
    } catch(e) {}
    return false;
}

function isCentralWorkerAlive() {
    try {
        const candidates = ['Z:/_SYNC_CACHE/worker_status.json', path.join(UNC_CACHE, 'worker_status.json')];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                const data = fs.readJsonSync(p);
                const diff = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
                if (diff < 45 && !data.workerId?.includes('local_worker')) {
                    return true;
                }
            }
        }
    } catch(e) {}
    return false;
}

function startLocalWorkerBackground() {
    if (checkLocalWorkerRunning()) {
        return { success: true, pid: localWorkerPid, message: 'Worker local ya está en ejecución' };
    }

    const nodeExe = process.execPath;
    const workerScript = path.join(__dirname, 'sync_worker.js');

    const logDir = getLocalSyncCacheDir();
    try { fs.ensureDirSync(logDir); } catch(e){}
    const logFile = path.join(logDir, 'local_worker.log');
    let outStream = 'ignore';
    try {
        const outFd = fs.openSync(logFile, 'a');
        outStream = outFd;
    } catch (e) {}

    const child = spawn(nodeExe, [workerScript, '--local'], {
        detached: true,
        stdio: ['ignore', outStream, outStream],
        windowsHide: true,
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            PIPETA_LOCAL_WORKER: '1'
        }
    });

    child.on('exit', (code, signal) => {
        console.log(`[SYNC WORKER] Local Worker finalizó (código: ${code}, señal: ${signal})`);
        localWorkerProcess = null;
        localWorkerPid = null;
    });

    child.unref();
    localWorkerProcess = child;
    localWorkerPid = child.pid;

    console.log(`[SYNC WORKER] Local Worker iniciado en segundo plano (PID: ${localWorkerPid})`);
    return { success: true, pid: localWorkerPid, message: 'Worker local iniciado con éxito en segundo plano' };
}

function stopLocalWorker() {
    if (localWorkerPid) {
        try {
            process.kill(localWorkerPid);
            console.log(`[SYNC WORKER] Local Worker detenido por cambio de modo (PID: ${localWorkerPid})`);
        } catch (e) {}
        localWorkerProcess = null;
        localWorkerPid = null;
    }
}


function ensureSyncWorkerRunning() {
    // REGLA ESTRICTA: Solo para equipos externos (Home Office / Remoto).
    // En las oficinas del estudio o sedes conectadas a la red interna,
    // NUNCA debe auto-iniciarse un worker local; las transferencias las atiende el Worker Central (VM 105).
    const isExternal = !!(global.isExternalMachine || cachedEnvState?.isExternalMachine);
    if (!isExternal) {
        return; // Nunca auto-iniciar en puestos de oficina / sedes
    }

    if (isCentralWorkerAlive()) return;
    if (checkLocalWorkerRunning()) return;
    console.log('[SYNC WORKER] Equipo externo (Home Office) detectado sin worker central. Iniciando Worker Local automáticamente...');
    startLocalWorkerBackground();
}

let zombieCleanupDoneOnBoot = false;
const ordersFileMemoryCache = new Map();

function sanitizeZombieOrders(force = false) {
    if (!force && zombieCleanupDoneOnBoot && activeLocalTransfers.size === 0) return;
    zombieCleanupDoneOnBoot = true;
    try {
        // Solo sanear órdenes en la carpeta local de requests para no escanear toda la red SMB en cada ciclo
        const localReqDir = path.join(getLocalSyncCacheDir(), 'requests');
        const candidateDirs = [localReqDir];
        const myLocalWorkerId = 'local_' + os.hostname();

        for (const dir of candidateDirs) {
            if (!fs.existsSync(dir)) continue;
            let files = [];
            try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch(e){ continue; }
            for (const f of files) {
                const filePath = path.join(dir, f);
                try {
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (!content || !content.id) continue;

                    // Si figura como processing pero pertenece a este puesto y no está corriendo en memoria
                    if (content.status === 'processing') {
                        const isLocalMachine = content.processedBy === myLocalWorkerId || content.workerId === myLocalWorkerId || !content.processedBy;
                        const isRunningInMemory = activeLocalTransfers.has(content.id);

                        if (isLocalMachine && !isRunningInMemory) {
                            content.status = 'interrupted';
                            content.error = 'Transferencia interrumpida al cerrar o reiniciar Pipeta';
                            content.currentSpeed = 'Interrumpido';
                            content.updatedAt = new Date().toISOString();
                            try {
                                fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
                                console.log(`[ZOMBIE CLEANUP] Orden huérfana local ${content.id} saneada -> 'interrupted'`);
                            } catch(writeErr) {
                                console.warn(`[ZOMBIE CLEANUP] No se pudo actualizar orden ${content.id}:`, writeErr.message);
                            }
                        }
                    }
                } catch(e){}
            }
        }
    } catch(err) {
        console.warn('[ZOMBIE CLEANUP] Error en sanitizeZombieOrders:', err.message);
    }
}

function readOrderJsonCached(filePath) {
    try {
        const cached = ordersFileMemoryCache.get(filePath);
        if (cached && cached.isTerminal && (Date.now() - cached.checkedAt < 60000)) {
            return cached.data;
        }
        if (!fs.existsSync(filePath)) return null;
        const st = fs.statSync(filePath);
        if (cached && cached.mtimeMs === st.mtimeMs) {
            cached.checkedAt = Date.now();
            return cached.data;
        }
        let raw = fs.readFileSync(filePath, 'utf8');
        // Auto-sanitizar posible corrupción de llaves } }, por ráfagas concurrentes en red
        if (raw.includes('} },')) {
            raw = raw.replace('} },', '},');
        }
        const content = JSON.parse(raw);
        const isTerminal = ['completed', 'completed_with_errors', 'failed', 'cancelled', 'interrupted'].includes(content?.status);
        ordersFileMemoryCache.set(filePath, {
            mtimeMs: st.mtimeMs,
            checkedAt: Date.now(),
            isTerminal,
            data: content
        });
        return content;
    } catch (e) {
        return null;
    }
}

let ordersResponseCache = { time: 0, rawOrders: [] };

app.get('/api/sync/orders', (req, res) => {
    try {
        // Sanear órdenes huérfanas locales solo si corresponde
        sanitizeZombieOrders(false);

        const { user, role, onlyMyTasks } = req.query;
        const now = Date.now();
        let orders = [];

        // Si no hay transferencias locales activas, reutilizar listado durante 1.5s para evitar ráfagas SMB
        if (activeLocalTransfers.size === 0 && (now - ordersResponseCache.time < 1500)) {
            orders = ordersResponseCache.rawOrders.map(o => ({ ...o }));
        } else {
            const candidateDirs = getAllOrdersCandidateDirs();
            const seenOrders = new Set();

            for (const dir of candidateDirs) {
                if (!fs.existsSync(dir)) continue;
                let files = [];
                try {
                    files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
                    // Ordenar por timestamp embebido en el nombre (ej. order_179244... o upload_179244...) descendente y tomar los 35 más recientes
                    files.sort((a, b) => {
                        const ta = parseInt((a.match(/_(\d{10,15})_/) || [])[1] || '0', 10);
                        const tb = parseInt((b.match(/_(\d{10,15})_/) || [])[1] || '0', 10);
                        return tb - ta;
                    });
                    files = files.slice(0, 35);
                } catch(e){ continue; }

                for (const f of files) {
                    const fullP = path.join(dir, f);
                    const content = readOrderJsonCached(fullP);
                    if (content && content.id && !seenOrders.has(content.id)) {
                        seenOrders.add(content.id);
                        if (activeLocalTransfers.has(content.id)) {
                            const act = activeLocalTransfers.get(content.id);
                            if (act && act.orderData) {
                                Object.assign(content, JSON.parse(JSON.stringify(act.orderData)));
                            }
                        }
                        content.priority = Number.isFinite(content.priority) 
                            ? content.priority 
                            : (content.type === 'higgsfield_ingest' || content.type === 'refresh_folder' ? 80 : 50);
                        orders.push(content);
                    }
                }
            }

            // Inyectar transferencias locales vivas en memoria que aún no figuren en disco
            for (const [activeId, active] of activeLocalTransfers.entries()) {
                if (!seenOrders.has(activeId) && active && active.orderData) {
                    seenOrders.add(activeId);
                    orders.unshift(JSON.parse(JSON.stringify(active.orderData)));
                }
            }

            orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            ordersResponseCache = { time: now, rawOrders: orders };
        }

        const isAdmin = role === 'admin' || role === 'administrator' || role === 'superuser' || role === 'lead';
        if (user && !isAdmin && onlyMyTasks !== 'false') {
            const reqUser = user.toLowerCase();
            orders = orders.filter(o => {
                const oUser = (o.user || '').toLowerCase();
                return oUser === reqUser || oUser === 'artista' || oUser === 'user' || oUser === 'unknown' || !oUser;
            });
        } else if (user && isAdmin && onlyMyTasks === 'true') {
            const reqUser = user.toLowerCase();
            orders = orders.filter(o => {
                const oUser = (o.user || '').toLowerCase();
                return oUser === reqUser || oUser === 'artista' || oUser === 'user' || oUser === 'unknown' || !oUser;
            });
        }

        res.json({ success: true, orders: orders.slice(0, 50) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/sync/orders/priority', (req, res) => {
    try {
        const { orderId, priority } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, error: 'orderId es requerido' });
        }
        const prioNum = Math.min(100, Math.max(1, parseInt(priority, 10) || 50));
        const candidateDirs = getAllOrdersCandidateDirs();
        let found = false;
        for (const dir of candidateDirs) {
            const filePath = path.join(dir, `${orderId}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const orderData = fs.readJsonSync(filePath);
                    orderData.priority = prioNum;
                    orderData.priorityUpdatedAt = new Date().toISOString();
                    fs.writeJsonSync(filePath, orderData, { spaces: 2 });
                    ordersFileMemoryCache.delete(filePath);
                    ordersResponseCache.time = 0;
                    found = true;
                } catch(e){}
            }
        }
        if (!found) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }
        console.log(`[SYNC ORDER] Prioridad de orden ${orderId} cambiada a ${prioNum}`);
        res.json({ success: true, orderId, priority: prioNum });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/sync/orders/cancel', (req, res) => {
    try {
        const { orderId, user, role } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, error: 'orderId es requerido' });
        }

        // 1. Si la orden está corriendo activamente en memoria local, abortar sus streams de inmediato
        if (activeLocalTransfers.has(orderId)) {
            const activeTransfer = activeLocalTransfers.get(orderId);
            activeTransfer.isCancelled = true;
            try { activeTransfer.abortController.abort(); } catch(e){}
            console.log(`[LOCAL TRANSFER] Señal de aborto enviada a transferencia local activa: ${orderId}`);
        }

        const candidateDirs = getAllOrdersCandidateDirs();
        let found = false;
        for (const dir of candidateDirs) {
            const filePath = path.join(dir, `${orderId}.json`);
            if (fs.existsSync(filePath)) {
                try {
                    const orderData = fs.readJsonSync(filePath);
                    const isAdmin = role === 'admin' || role === 'administrator' || role === 'superuser' || role === 'lead';
                    if (user && !isAdmin && orderData.user && orderData.user.toLowerCase() !== user.toLowerCase() && orderData.user !== 'artista') {
                        return res.status(403).json({ success: false, error: 'No tienes permisos para cancelar esta tarea' });
                    }
                    orderData.status = 'cancelled';
                    orderData.cancelledAt = new Date().toISOString();
                    orderData.cancelledBy = user || 'user';
                    if (orderData.progress) {
                        orderData.progress.speedFormatted = 'Cancelado';
                        orderData.progress.etaSeconds = 0;
                    }
                    fs.writeJsonSync(filePath, orderData, { spaces: 2 });
                    ordersFileMemoryCache.delete(filePath);
                    ordersResponseCache.time = 0;
                    found = true;
                } catch(e){}
            }
        }
        if (!found) {
            return res.status(404).json({ success: false, error: 'Orden no encontrada' });
        }

        console.log(`[SYNC ORDER] Orden ${orderId} marcada como CANCELADA por '${user || 'user'}'`);
        res.json({ success: true, message: 'Orden cancelada exitosamente', status: 'cancelled' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/sync/orders/clear-history', (req, res) => {
    try {
        const { user, role } = req.body;
        const candidateDirs = getAllOrdersCandidateDirs();
        const isAdmin = role === 'admin' || role === 'administrator' || role === 'superuser' || role === 'lead';
        const finishedStatuses = ['completed', 'completed_with_errors', 'failed', 'cancelled'];
        let clearedCount = 0;

        for (const dir of candidateDirs) {
            if (!fs.existsSync(dir)) continue;
            let files = [];
            try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch(e){ continue; }
            for (const f of files) {
                const filePath = path.join(dir, f);
                try {
                    const data = readOrderJsonCached(filePath) || fs.readJsonSync(filePath);
                    if (finishedStatuses.includes(data.status)) {
                        if (!user || isAdmin || (data.user && (data.user.toLowerCase() === user.toLowerCase() || data.user === 'artista'))) {
                            fs.removeSync(filePath);
                            ordersFileMemoryCache.delete(filePath);
                            clearedCount++;
                        }
                    }
                } catch(e){}
            }
        }
        ordersResponseCache.time = 0;
        console.log(`[SYNC ORDER] Historial limpiado: ${clearedCount} órdenes eliminadas por '${user || 'user'}'`);
        res.json({ success: true, clearedCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/sync/worker/local-status', (req, res) => {
    try {
        const isRunning = checkLocalWorkerRunning();
        let heartbeatAlive = false;
        let diffSeconds = 999;
        let workerHostname = null;

        try {
            const statusFile = path.join(getCentralCacheDir(), 'worker_status.json');
            if (fs.existsSync(statusFile)) {
                const data = fs.readJsonSync(statusFile);
                diffSeconds = (Date.now() - new Date(data.lastPing).getTime()) / 1000;
                heartbeatAlive = diffSeconds < 25 && (data.workerId?.includes('local_worker') || data.hostname === os.hostname());
                workerHostname = data.hostname;
            }
        } catch(e){}

        const active = isRunning || heartbeatAlive;
        res.json({
            success: true,
            isRunning: active,
            pid: localWorkerPid || null,
            hostname: workerHostname || os.hostname(),
            diffSeconds: Math.round(diffSeconds)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/sync/worker/start-local', (req, res) => {
    try {
        const result = startLocalWorkerBackground();
        res.json(result);
    } catch (err) {
        console.error('[SYNC WORKER] Error iniciando worker local:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/sync/worker/stop-local', (req, res) => {
    try {
        let killed = false;
        if (localWorkerPid) {
            try {
                execSync(`taskkill /PID ${localWorkerPid} /T /F`, { stdio: 'ignore' });
                killed = true;
            } catch (e) {
                try { process.kill(localWorkerPid, 'SIGKILL'); killed = true; } catch (err) {}
            }
            localWorkerProcess = null;
            localWorkerPid = null;
        }

        // Limpiar worker_status.json si era local
        try {
            const statusFile = path.join(getCentralCacheDir(), 'worker_status.json');
            if (fs.existsSync(statusFile)) {
                const data = fs.readJsonSync(statusFile);
                if (data.workerId && data.workerId.includes('local_worker')) {
                    fs.removeSync(statusFile);
                }
            }
            const localStatusFile = path.join(getLocalSyncCacheDir(), 'worker_status.json');
            if (fs.existsSync(localStatusFile)) {
                fs.removeSync(localStatusFile);
            }
        } catch(e){}

        console.log(`[SYNC WORKER] Local Worker detenido`);
        res.json({ success: true, message: killed ? 'Worker local detenido exitosamente' : 'No había worker activo' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/sync/worker/logs', (req, res) => {
    try {
        const logFile = path.join(getCentralCacheDir(), 'local_worker.log');
        const fallbackLog = path.join(getLocalSyncCacheDir(), 'local_worker.log');
        const target = fs.existsSync(logFile) ? logFile : (fs.existsSync(fallbackLog) ? fallbackLog : null);
        if (!target) {
            return res.json({ success: true, logs: 'No hay registros del worker aún.' });
        }
        const content = fs.readFileSync(target, 'utf8');
        const lines = content.split('\n');
        const lastLines = lines.slice(-80).join('\n');
        res.json({ success: true, logs: lastLines });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


let cachedWorkerStatusResp = { time: 0, payload: null };

app.get('/api/sync/worker-status', (req, res) => {
    try {
        const now = Date.now();
        if (cachedWorkerStatusResp.payload && (now - cachedWorkerStatusResp.time < 2500)) {
            return res.json(cachedWorkerStatusResp.payload);
        }

        const isLocalRunning = checkLocalWorkerRunning();

        // 1. Primero chequear si hay un Worker Local activo o con latido reciente (< 25s)
        try {
            const localStatusFile = path.join(getLocalSyncCacheDir(), 'worker_status.json');
            if (fs.existsSync(localStatusFile)) {
                const localData = fs.readJsonSync(localStatusFile);
                const diffSeconds = (Date.now() - new Date(localData.lastPing).getTime()) / 1000;
                if (diffSeconds < 25 && (localData.workerId?.includes('local_worker') || isLocalRunning)) {
                    localData.isAlive = true;
                    localData.diffSeconds = Math.round(diffSeconds);
                    localData.isLocal = true;
                    const payload = { success: true, status: localData, isLocalWorkerRunning: true };
                    cachedWorkerStatusResp = { time: now, payload };
                    return res.json(payload);
                }
            }
        } catch(e) {}

        // 2. Si no hay worker local, chequear el worker central en la red
        const centralCache = getCentralCacheDir();
        const statusFile = path.join(centralCache, 'worker_status.json');
        if (fs.existsSync(statusFile)) {
            const status = fs.readJsonSync(statusFile);
            const diffSeconds = (Date.now() - new Date(status.lastPing).getTime()) / 1000;
            status.isAlive = diffSeconds < 45;
            status.diffSeconds = Math.round(diffSeconds);
            const isLocal = isLocalRunning || (status.workerId && status.workerId.includes('local_worker')) || status.hostname === os.hostname();
            status.isLocal = isLocal;
            const payload = { success: true, status, isLocalWorkerRunning: isLocalRunning || (isLocal && status.isAlive) };
            cachedWorkerStatusResp = { time: now, payload };
            return res.json(payload);
        }

        const payload = { 
            success: true, 
            status: { isAlive: false, message: 'Worker no detectado' },
            isLocalWorkerRunning: isLocalRunning
        };
        cachedWorkerStatusResp = { time: now, payload };
        res.json(payload);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Supervisor de órdenes pendientes: SOLO para equipos externos (Home Office)
setInterval(() => {
    try {
        const isExternal = !!(global.isExternalMachine || cachedEnvState?.isExternalMachine);
        if (!isExternal) return; // NUNCA supervisar ni auto-iniciar en oficinas del estudio / sedes

        const localReqDir = path.join(getLocalSyncCacheDir(), 'requests');
        if (!fs.existsSync(localReqDir)) return;
        let files = [];
        try { files = fs.readdirSync(localReqDir).filter(f => f.endsWith('.json')); } catch(e){ return; }
        let hasPending = false;
        for (const f of files) {
            const data = readOrderJsonCached(path.join(localReqDir, f));
            if (data && data.status === 'pending' && data.type !== 'server_download' && data.type !== 'server_upload') {
                hasPending = true;
                break;
            }
        }
        if (hasPending) {
            ensureSyncWorkerRunning();
        }
    } catch(e) {}
}, 5000);

// Caché en memoria para listados de directorios en red (SMB) y Rclone
const serverDirCache = new Map();
const rcloneDirCache = new Map();
const SERVER_CACHE_TTL = 3 * 60 * 1000; // 3 minutos
const RCLONE_CACHE_TTL = 60 * 1000; // 1 minuto

app.get('/api/fs/list', (req, res) => {
    const t0 = Date.now();
    let requestedPath = req.query.path;
    let forceRefresh = req.query.force === 'true' || req.query.refresh === 'true';
    let onlineEngine = req.query.online_engine; // 'rclone' | 'gdrive' | 'catalog'
    let localSource = req.query.local_source;   // 'z_local' | 'server_catalog'
    let source = req.query.source;

    try {
        let targetPath = null;

        if (requestedPath) {
            let safeP = decodeURIComponent(requestedPath).replace(/\\/g, '/');
            const lowerSafeP = safeP.toLowerCase();
            const cacheModeKey = `${localSource || source || onlineEngine || 'local'}:${lowerSafeP}`;

            // 1. Mem cache fast-path para listados de red o locales (0 ms SMB), separado por origen (local vs drive_catalog vs server_catalog)
            if (!forceRefresh && !localSource && !source && serverDirCache.has(cacheModeKey)) {
                const cached = serverDirCache.get(cacheModeKey);
                if (Date.now() - cached.time < SERVER_CACHE_TTL) {
                    return res.json({ path: safeP, items: cached.items, exists: true, fromCache: true });
                }
            }

            // 2. LISTADO HÍBRIDO SMB + CATÁLOGO SERVER (DB EN RAM):
            // Si el equipo tiene Z: mapeado por red SMB, combinamos la lectura rápida de nombres del directorio físico (readdirSync sin statSync)
            // con los metadatos precalculados (size, mtime) del catálogo en memoria para garantizar visibilidad en tiempo real de carpetas nuevas (0 ms statSync).
            const isNetworkZ = (typeof catalogGenerator.isZDriveNetwork === 'function')
                ? catalogGenerator.isZDriveNetwork()
                : true;

            if (isNetworkZ && !lowerSafeP.startsWith('g:/') && localSource !== 'drive_catalog' && source !== 'drive' && localSource !== 'server_catalog' && source !== 'server') {
                const serverItems = (typeof catalogGenerator.listFromModularCatalog === 'function')
                    ? catalogGenerator.listFromModularCatalog(safeP, 'server')
                    : null;

                if (fs.existsSync(safeP)) {
                    try {
                        const diskEntries = fs.readdirSync(safeP, { withFileTypes: true });
                        const srvMap = new Map();
                        if (Array.isArray(serverItems)) {
                            for (const si of serverItems) {
                                if (si && si.name) srvMap.set(si.name.toLowerCase(), si);
                            }
                        }
                        const mergedItems = diskEntries.map(entry => {
                            const isDir = entry.isDirectory();
                            const fullItemPath = path.join(safeP, entry.name).replace(/\\/g, '/');
                            const catMatch = srvMap.get(entry.name.toLowerCase());
                            return {
                                name: entry.name,
                                isDirectory: isDir,
                                path: fullItemPath,
                                size: catMatch ? (catMatch.size || 0) : 0,
                                mtime: catMatch ? (catMatch.mtime || catMatch.modTime || null) : null,
                                modTime: catMatch ? (catMatch.modTime || catMatch.mtime || null) : null
                            };
                        });
                        mergedItems.sort((a, b) => {
                            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                            return a.isDirectory ? -1 : 1;
                        });
                        serverDirCache.set(cacheModeKey, { time: Date.now(), items: mergedItems });
                        return res.json({ path: safeP, items: mergedItems, exists: true, fromCatalog: false, isServer: true });
                    } catch (e) {}
                } else if (!forceRefresh && serverItems !== null && serverItems.length > 0) {
                    serverDirCache.set(cacheModeKey, { time: Date.now(), items: serverItems });
                    return res.json({ path: safeP, items: serverItems, exists: true, fromCatalog: true, isServer: true });
                }
            }

            // 0. Si se solicita expresamente origen del Servidor Central para una ruta local (Z:, C:, etc.):
            if ((localSource === 'server_catalog' || source === 'server') && !lowerSafeP.startsWith('g:/')) {
                if (cachedEnvState && cachedEnvState.isExternalMachine) {
                    return res.json({ path: safeP, items: [], exists: false, isServer: false, isExternal: true });
                }
                let serverItems = (typeof catalogGenerator.listFromModularCatalog === 'function')
                    ? catalogGenerator.listFromModularCatalog(safeP, 'server')
                    : null;

                if (serverItems === null && typeof catalogGenerator.listFromServerCatalog === 'function') {
                    serverItems = catalogGenerator.listFromServerCatalog(safeP);
                }

                if (serverItems !== null) {
                    const cleanItems = serverItems.map(item => ({
                        ...item,
                        path: (item.path || '').replace(/^S:/i, 'Z:'),
                        serverPath: (item.serverPath || item.path || '').replace(/^S:/i, 'Z:'),
                        targetLocalPath: (item.targetLocalPath || item.path || '').replace(/^S:/i, 'Z:')
                    }));
                    console.log(`[API /api/fs/list server_catalog] ${safeP} -> ${cleanItems.length} items (${Date.now() - t0}ms)`);
                    return res.json({ path: safeP, items: cleanItems, exists: true, fromCatalog: true, isServer: true });
                }
                console.log(`[API /api/fs/list server_catalog NULL] ${safeP} (${Date.now() - t0}ms)`);
                return res.json({ path: safeP, items: [], exists: false, isServer: true });
            }

            // 0.1 Si se solicita expresamente origen del Catálogo de Drive para una ruta local (Z:, C:, S:, etc.):
            if ((localSource === 'drive_catalog' || source === 'drive') && !lowerSafeP.startsWith('g:/')) {
                let driveItems = (typeof catalogGenerator.listFromModularCatalog === 'function')
                    ? catalogGenerator.listFromModularCatalog(safeP, 'drive')
                    : null;

                if (driveItems === null && typeof catalogGenerator.listFromCatalog === 'function') {
                    driveItems = catalogGenerator.listFromCatalog(safeP);
                }

                if (driveItems !== null) {
                    const cleanDriveItems = driveItems.map(item => ({
                        ...item,
                        path: item.path || item.onlinePath,
                        onlinePath: item.onlinePath || item.path,
                        targetLocalPath: (item.targetLocalPath || item.path || '').replace(/^S:/i, 'Z:')
                    }));
                    return res.json({ path: safeP, items: cleanDriveItems, exists: true, fromCatalog: true, isDrive: true });
                }
                return res.json({ path: safeP, items: [], exists: false, isDrive: true });
            }
            // 2. MODO GOOGLE DRIVE
            if (lowerSafeP.startsWith('g:/') || lowerSafeP === 'g:') {
                // Si la máquina no tiene internet, forzar motor de catálogo (cero tráfico a internet, rclone o G:)
                if (!checkInternetQuickly()) {
                    onlineEngine = 'catalog';
                }

                // A. Motor Rclone (solo si se selecciona explícitamente y hay internet)
                if (onlineEngine === 'rclone') {
                    if (!forceRefresh && rcloneDirCache.has(lowerSafeP)) {
                        const cached = rcloneDirCache.get(lowerSafeP);
                        if (Date.now() - cached.time < RCLONE_CACHE_TTL) {
                            return res.json({ path: safeP, items: cached.items, exists: true, fromCache: true, fromRclone: true });
                        }
                    }

                    if (typeof catalogGenerator.listWithRclone === 'function') {
                        const rcloneItems = catalogGenerator.listWithRclone(safeP);
                        if (rcloneItems !== null) {
                            rcloneDirCache.set(lowerSafeP, { time: Date.now(), items: rcloneItems });
                            return res.json({ path: safeP, items: rcloneItems, exists: true, fromRclone: true });
                        }
                    }
                }

                // B. Motor Catálogo Caché (o fallback si rclone o G: fallan)
                if (onlineEngine === 'catalog' || (!fs.existsSync(safeP) && onlineEngine !== 'gdrive')) {
                    let catalogItems = (typeof catalogGenerator.listFromModularCatalog === 'function')
                        ? catalogGenerator.listFromModularCatalog(safeP, 'drive')
                        : null;

                    if (catalogItems === null && typeof catalogGenerator.listFromCatalog === 'function') {
                        catalogItems = catalogGenerator.listFromCatalog(safeP);
                    }

                    if (catalogItems !== null) {
                        for (const it of catalogItems) {
                            if (it.localExists === undefined && it.targetLocalPath) {
                                try {
                                    it.localExists = (typeof catalogGenerator.fileExistsFast === 'function')
                                        ? catalogGenerator.fileExistsFast(it.targetLocalPath)
                                        : fs.existsSync(it.targetLocalPath);
                                } catch (e) {
                                    it.localExists = false;
                                }
                            }
                        }
                        return res.json({ path: safeP, items: catalogItems, exists: true, fromCatalog: true });
                    }
                    return res.json({ path: safeP, items: [], exists: false });
                }

                // C. Motor Unidad G: (Google Drive físico montado en Windows)
                if (fs.existsSync(safeP)) {
                    targetPath = safeP;
                } else {
                    return res.json({ path: safeP, items: [], exists: false });
                }
            } 
            // 3. RUTAS LOCALES (Z:, C:, etc.)
            else if (fs.existsSync(safeP)) {
                targetPath = safeP;
            } else {
                return res.json({ path: safeP, items: [], exists: false });
            }
        }

        if (!targetPath) {
            let configPath = path.join(__dirname, '../pipeline_config.json');
            let config = null;
            if (fs.existsSync(configPath)) {
                try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e){}
            }

            const candidates = [];
            if (config?.paths?.root_work) candidates.push(config.paths.root_work);
            candidates.push("Z:/");

            for (let p of candidates) {
                if (!p) continue;
                let safeP = decodeURIComponent(p);
                if (fs.existsSync(safeP)) {
                    targetPath = safeP;
                    break;
                }
            }
        }

        if (!targetPath) {
            return res.json({ path: requestedPath || 'Z:/', items: [] });
        }

                const isNetworkPath = targetPath.startsWith('//') || targetPath.startsWith('\\\\') || /^[d-z]:/i.test(targetPath);
        let items = [];
        try {
            items = fs.readdirSync(targetPath, { withFileTypes: true });
        } catch (e) {
            return res.json({ path: targetPath, items: [], exists: false, error: e.message });
        }
        const result = items.map(item => {
            const isDir = item.isDirectory();
            const fullItemPath = path.join(targetPath, item.name).replace(/\\/g, '/');
            let size = 0;
            let mtime = null;
            // Solo calcular tamaño y mtime síncrono si es disco local C:. En red SMB (Z:, UNC, etc.), se omite para evitar freeze de Node.
            if (!isDir && !isNetworkPath) {
                try {
                    const st = fs.statSync(fullItemPath);
                    size = st.size;
                    mtime = st.mtime ? st.mtime.toISOString() : null;
                } catch(e) {}
            }
            return {
                name: item.name,
                isDirectory: isDir,
                path: fullItemPath,
                size: size,
                mtime: mtime,
                modTime: mtime
            };
        });

        result.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        serverDirCache.set(`local:${targetPath.toLowerCase()}`, { time: Date.now(), items: result });
        if (typeof lowerSafeP !== 'undefined') {
            serverDirCache.set(`local:${lowerSafeP}`, { time: Date.now(), items: result });
        }

        res.json({
            path: targetPath,
            items: result
        });

    } catch (error) {
        console.error("FS List Error:", error);
        res.status(500).json({ error: "Unable to read directory", details: error.message });
    }
});

// --- I/O OPERATIONS ---

app.post('/api/fs/open', async (req, res) => {
    let p = req.body?.path;
    if (!p) return res.status(400).json({ error: "No se especificó ninguna ruta para abrir" });
    p = p.replace(/\//g, '\\');

    let targetPath = p;
    let isFile = false;

    try {
        // 1. Probar ruta tal como viene si existe en el sistema de archivos local actual
        if (fs.existsSync(targetPath)) {
            const stat = fs.statSync(targetPath);
            isFile = stat.isFile();
        }
        // 2. Si no existe exactamente, buscar la carpeta padre local más cercana
        else {
            let current = path.dirname(targetPath);
            while (current && current.length > 3 && !fs.existsSync(current)) {
                current = path.dirname(current);
            }
            if (fs.existsSync(current)) {
                targetPath = current;
                isFile = false;
            } else {
                return res.status(404).json({ error: "La ruta no existe localmente en este equipo." });
            }
        }
    } catch (e) {
        console.warn("[FS_OPEN] Stat warning:", e.message);
        return res.status(500).json({ error: e.message });
    }

    try {
        const { spawn } = require('child_process');
        // Si isFile es true pero no existe, abrir la carpeta padre para no trabar explorer.exe
        if (isFile && !fs.existsSync(targetPath)) {
            isFile = false;
            targetPath = path.dirname(targetPath);
        }

        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: "La ruta no existe localmente en este equipo." });
        }

        const args = isFile ? [`/select,${targetPath}`] : [targetPath];
        const child = spawn('explorer.exe', args, {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        console.log(`[FS_OPEN] Explorador de Windows lanzado en: ${targetPath} (isFile: ${isFile})`);
        res.json({ success: true, opened: targetPath, isFile });
    } catch (err) {
        console.error(`[FS_OPEN] Error al abrir en Explorador:`, err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/mkdir', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: "No path provided" });
    try {
        await fs.ensureDir(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/rename', async (req, res) => {
    let { oldPath, newPath, project } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: "Missing paths" });

    oldPath = oldPath.replace(/\\/g, '/');
    newPath = newPath.replace(/\\/g, '/');

    try {
        // Idempotencia: Si oldPath ya no existe pero newPath sí existe, ya fue renombrado con éxito
        if (!fs.existsSync(oldPath)) {
            if (fs.existsSync(newPath)) {
                if (typeof serverDirCache !== 'undefined') {
                    const parentOld = path.dirname(oldPath).replace(/\\/g, '/').toLowerCase();
                    const parentNew = path.dirname(newPath).replace(/\\/g, '/').toLowerCase();
                    serverDirCache.delete(parentOld);
                    serverDirCache.delete(parentNew);
                    serverDirCache.delete(oldPath.toLowerCase());
                    serverDirCache.delete(newPath.toLowerCase());
                }
                if (typeof catalogGenerator !== 'undefined') {
                    if (typeof catalogGenerator.recordRenamedItem === 'function') {
                        try { catalogGenerator.recordRenamedItem(project, oldPath, newPath); } catch (e) {}
                    }
                    if (typeof catalogGenerator.clearMemoryCaches === 'function') {
                        catalogGenerator.clearMemoryCaches();
                    }
                }
                return res.json({ success: true, alreadyRenamed: true });
            }
            return res.status(404).json({ error: `El archivo origen no existe: ${oldPath}` });
        }

        await fs.rename(oldPath, newPath);

        // Invalidar cachés en memoria
        if (typeof serverDirCache !== 'undefined') {
            const parentOld = path.dirname(oldPath).replace(/\\/g, '/').toLowerCase();
            const parentNew = path.dirname(newPath).replace(/\\/g, '/').toLowerCase();
            serverDirCache.delete(parentOld);
            serverDirCache.delete(parentNew);
            serverDirCache.delete(oldPath.toLowerCase());
            serverDirCache.delete(newPath.toLowerCase());
        }

        if (typeof catalogGenerator !== 'undefined') {
            if (typeof catalogGenerator.recordRenamedItem === 'function') {
                try { catalogGenerator.recordRenamedItem(project, oldPath, newPath); } catch (e) {}
            }
            if (typeof catalogGenerator.clearMemoryCaches === 'function') {
                catalogGenerator.clearMemoryCaches();
            }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function getServerUncRoot() {
    try {
        const cfgFile = path.join(__dirname, '../config/settings.json');
        if (fs.existsSync(cfgFile)) {
            const cfg = fs.readJsonSync(cfgFile);
            if (cfg.centralServerUnc) return cfg.centralServerUnc.replace(/\\/g, '/').replace(/\/+$/, '');
        }
    } catch (e) {}

    if (process.env.PIPETA_SERVER_UNC) {
        return process.env.PIPETA_SERVER_UNC.replace(/\\/g, '/').replace(/\/+$/, '');
    }

    return '//192.168.206.116/Z';
}

function ensureServerUncAccess(uncPath = null) {
    const root = (uncPath || getServerUncRoot()).replace(/\//g, '\\');
    try {
        if (fs.existsSync(root)) return true;
    } catch (e) {}
    try {
        execSync(`net use "${root}" /persistent:no`, { encoding: 'utf8', timeout: 3000 });
        return true;
    } catch (e) {
        return false;
    }
}

app.post('/api/server/connect-unc', async (req, res) => {
    try {
        const { uncPath, user, pass } = req.body;
        const targetUnc = (uncPath || getServerUncRoot()).replace(/\//g, '\\');
        let cmd = `net use "${targetUnc}"`;
        if (pass && user) {
            cmd += ` "${pass}" /user:"${user}" /persistent:no`;
        } else if (user) {
            cmd += ` /user:"${user}" /persistent:no`;
        } else {
            cmd += ` /persistent:no`;
        }
        execSync(cmd, { encoding: 'utf8', timeout: 5000 });
        const accessible = fs.existsSync(targetUnc);
        res.json({ success: true, connectedTo: targetUnc, accessible });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/fs/copy', async (req, res) => {
    let { src, dest, action } = req.body;
    if (!src || !dest) return res.status(400).json({ error: "Missing paths" });
    try {
        let actualSrc = src.replace(/\\/g, '/');
        let actualDest = dest.replace(/\\/g, '/');

        // Si se copia desde o hacia el Servidor Central y esta máquina no es el servidor real (Z: local / subst):
        const env = cachedEnvState || {};
        const isNotRealServer = !env?.zInfo?.isRealServer;

        if (isNotRealServer) {
            const uncRoot = getServerUncRoot();
            ensureServerUncAccess(uncRoot);

            // Si es descarga desde server o si el origen empieza con Z: pero no existe en el disco local:
            if (action === 'download_server' || (!fs.existsSync(actualSrc) && actualSrc.toLowerCase().startsWith('z:/'))) {
                actualSrc = actualSrc.replace(/^z:/i, uncRoot);
                console.log(`[FS COPY] Descargando desde Servidor Central UNC: ${actualSrc} -> ${actualDest}`);
            } else if (action === 'upload_server') {
                actualDest = actualDest.replace(/^z:/i, uncRoot);
                console.log(`[FS COPY] Subiendo a Servidor Central UNC: ${actualSrc} -> ${actualDest}`);
            }
        }

        await fs.ensureDir(path.dirname(actualDest));
        await fs.copy(actualSrc, actualDest);
        res.json({ success: true });
    } catch (err) {
        console.error(`[FS COPY ERROR] Error copiando ${src} -> ${dest}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/stat', async (req, res) => {
    let { path: p } = req.body;
    if (!p) return res.status(400).json({ error: "No path provided" });
    try {
        p = p.replace(/\\/g, '/');
        if (!await fs.pathExists(p)) {
            return res.json({ exists: false });
        }
        const st = await fs.stat(p);
        const isDirectory = st.isDirectory();
        let itemCount = null;
        if (isDirectory) {
            try {
                const entries = await fs.readdir(p);
                itemCount = entries.length;
            } catch (e) {}
        }
        res.json({
            exists: true,
            isDirectory,
            size: st.size,
            mtime: st.mtime ? st.mtime.toISOString() : null,
            birthtime: st.birthtime ? st.birthtime.toISOString() : null,
            itemCount
        });
    } catch (err) {
        res.json({ exists: false, error: err.message });
    }
});

app.post('/api/fs/delete', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: "No path provided" });
    try {
        await fs.remove(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/deleteFile', async (req, res) => {
    const { path: p } = req.body;
    if (!p) return res.status(400).json({ error: "No path provided" });
    try {
        await fs.remove(p);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/fs/readFile', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Missing path' });
    const norm = filePath.replace(/\\/g, '/').toLowerCase();
    if (norm.startsWith('g:/') || norm.startsWith('g:')) {
        return res.json({ content: null });
    }
    try {
        if (!fs.existsSync(filePath)) {
            return res.json({ content: null });
        }
        const content = await fs.readFile(filePath, 'utf-8');
        res.json({ content });
    } catch (err) {
        res.json({ content: null, error: err.message });
    }
});

app.post('/api/fs/writeFile', async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Missing path' });
    try {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, content || '', 'utf-8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- FOLDER BROWSER DIALOG ---
app.post('/api/system/pickFolder', async (req, res) => {
    let initialPath = req.body?.initialPath || 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts\\Pipeta\\presets';
    initialPath = initialPath.replace(/\//g, '\\');
    const { execFile } = require('child_process');
    
    const psScript = 'Add-Type -AssemblyName System.Windows.Forms\n' +
        '$f = New-Object System.Windows.Forms.FolderBrowserDialog\n' +
        '$f.Description = "Seleccionar carpeta de exportacion de Presets"\n' +
        'if (Test-Path "' + initialPath.replace(/"/g, '`"') + '") {\n' +
        '    $f.SelectedPath = "' + initialPath.replace(/"/g, '`"') + '"\n' +
        '}\n' +
        '$f.ShowNewFolderButton = $true\n' +
        '$form = New-Object System.Windows.Forms.Form\n' +
        '$form.TopMost = $true\n' +
        '$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen\n' +
        '$form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized\n' +
        '$form.Show()\n' +
        '$form.BringToFront()\n' +
        '$res = $f.ShowDialog($form)\n' +
        '$form.Dispose()\n' +
        'if ($res -eq [System.Windows.Forms.DialogResult]::OK) {\n' +
        '    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n' +
        '    Write-Output $f.SelectedPath\n' +
        '}\n';

    const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', b64], { timeout: 60000 }, (err, stdout) => {
        if (err && err.killed) {
            return res.json({ canceled: true });
        }
        const selected = stdout ? stdout.trim() : '';
        if (selected) {
            return res.json({ success: true, path: selected });
        }
        res.json({ canceled: true });
    });
});

// --- FILE BROWSER DIALOG ---
app.post('/api/system/pickFile', async (req, res) => {
    let initialPath = req.body?.initialPath || 'Z:\\';
    let filter = req.body?.filter || 'Archivos de Template (*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt)|*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt|Todos los archivos (*.*)|*.*';
    initialPath = initialPath.replace(/\//g, '\\');
    const { execFile } = require('child_process');
    
    const psScript = 'Add-Type -AssemblyName System.Windows.Forms\n' +
        '$f = New-Object System.Windows.Forms.OpenFileDialog\n' +
        '$f.Title = "Seleccionar Archivo Template"\n' +
        '$f.Filter = "' + filter.replace(/"/g, '`"') + '"\n' +
        'if (Test-Path "' + initialPath.replace(/"/g, '`"') + '") {\n' +
        '    $f.InitialDirectory = "' + initialPath.replace(/"/g, '`"') + '"\n' +
        '}\n' +
        '$form = New-Object System.Windows.Forms.Form\n' +
        '$form.TopMost = $true\n' +
        '$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen\n' +
        '$form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized\n' +
        '$form.Show()\n' +
        '$form.BringToFront()\n' +
        '$res = $f.ShowDialog($form)\n' +
        '$form.Dispose()\n' +
        'if ($res -eq [System.Windows.Forms.DialogResult]::OK) {\n' +
        '    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n' +
        '    Write-Output $f.FileName\n' +
        '}\n';

    const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', b64], { timeout: 60000 }, (err, stdout) => {
        if (err && err.killed) {
            return res.json({ canceled: true });
        }
        const selected = stdout ? stdout.trim() : '';
        if (selected) {
            return res.json({ success: true, path: selected.replace(/\\/g, '/') });
        }
        res.json({ canceled: true });
    });
});

// --- TEMPLATES SYSTEM ENDPOINTS ---
app.post('/api/templates/upload', async (req, res) => {
    try {
        const { type = 'shot', processName, filename, fileData } = req.body;
        if (!filename || !fileData) {
            return res.status(400).json({ error: 'Missing filename or fileData' });
        }

        const subDir = type === 'asset' ? 'AssetDesigner' : 'ShotDesigner';
        const localTemplatesDir = path.join(__dirname, '../presets/templates', subDir);
        await fs.ensureDir(localTemplatesDir);

        const safeFilename = path.basename(filename);
        const localDestPath = path.join(localTemplatesDir, safeFilename);

        const buffer = Buffer.from(fileData, 'base64');
        await fs.writeFile(localDestPath, buffer);

        // Also copy to network presets if available
        const zTemplatesDir = path.join('Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/presets/templates', subDir);
        try {
            await fs.ensureDir(zTemplatesDir);
            await fs.writeFile(path.join(zTemplatesDir, safeFilename), buffer);
        } catch(e){}

        res.json({
            success: true,
            path: localDestPath.replace(/\\/g, '/'),
            filename: safeFilename
        });
    } catch(err) {
        console.error("Template upload error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/templates/findReference', async (req, res) => {
    try {
        const { refRoot, processName } = req.body;
        if (!refRoot || !fs.existsSync(refRoot)) {
            return res.json({ found: false, error: 'Reference root does not exist' });
        }

        const cleanProcess = (processName || '').toLowerCase().trim();

        // Recursively scan up to 4 levels
        async function getFilesRec(dir, depth = 0) {
            if (depth > 4) return [];
            let results = [];
            try {
                const list = await fs.readdir(dir, { withFileTypes: true });
                for (const item of list) {
                    const full = path.join(dir, item.name);
                    if (item.isDirectory()) {
                        if (!item.name.startsWith('.') && !item.name.startsWith('_')) {
                            const sub = await getFilesRec(full, depth + 1);
                            results = results.concat(sub);
                        }
                    } else if (item.isFile()) {
                        if (!item.name.startsWith('.') && !item.name.startsWith('~')) {
                            results.push({ name: item.name, fullPath: full.replace(/\\/g, '/') });
                        }
                    }
                }
            } catch(e){}
            return results;
        }

        const allFiles = await getFilesRec(refRoot);

        // Filter files matching process name or process folder
        let candidates = allFiles.filter(f => {
            const nameLower = f.name.toLowerCase();
            const pathLower = f.fullPath.toLowerCase();
            return nameLower.includes(cleanProcess) || pathLower.includes('/' + cleanProcess + '/');
        });

        // If no candidate by process name, take non-txt/non-json files from reference folder
        if (candidates.length === 0) {
            candidates = allFiles.filter(f => !f.name.endsWith('.txt') && !f.name.endsWith('.json') && !f.name.endsWith('.ini'));
        }

        if (candidates.length === 0) {
            return res.json({ found: false });
        }

        // Sort to pick the highest version (e.g. v002 > v001)
        candidates.sort((a, b) => {
            const vA = (a.name.match(/_v(\d+)/i) || [])[1] || '0';
            const vB = (b.name.match(/_v(\d+)/i) || [])[1] || '0';
            return parseInt(vB, 10) - parseInt(vA, 10);
        });

        const best = candidates[0];
        const ext = path.extname(best.name);

        res.json({
            found: true,
            filePath: best.fullPath,
            fileName: best.name,
            ext: ext
        });
    } catch(err) {
        console.error("Error finding reference template:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- PORTABLE PACKAGE EXPORTER (.ZIP + .BAT EXTRACTOR) ---
app.post('/api/system/package-dist', async (req, res) => {
    let targetDir = req.body?.targetDir || 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS';
    targetDir = targetDir.replace(/\//g, '\\');
    const includeRamon = req.body?.includeRamon === true || req.body?.includeRamon === 'true';
    const includeDriveCache = req.body?.includeDriveCache === true || req.body?.includeDriveCache === 'true';
    const includeServerCache = req.body?.includeServerCache === true || req.body?.includeServerCache === 'true';

    const pipetaRoot = path.resolve(__dirname, '..');
    const zipName = includeRamon ? `Pipeta_${VERSION}_Ramon.zip` : `Pipeta_${VERSION}.zip`;
    const destZip = path.join(targetDir, zipName);
    const destBat = path.join(targetDir, 'Instalar_o_Actualizar_Pipeta_Local.bat');

    const { exec } = require('child_process');

    const psScript = `
$source = "${pipetaRoot.replace(/\\/g, '\\\\')}"
$destDir = "${targetDir.replace(/\\/g, '\\\\')}"
$destZip = "${destZip.replace(/\\/g, '\\\\')}"
$destBat = "${destBat.replace(/\\/g, '\\\\')}"
$includeRamon = ${includeRamon ? '$true' : '$false'}
$includeDriveCache = ${includeDriveCache ? '$true' : '$false'}
$includeServerCache = ${includeServerCache ? '$true' : '$false'}
$tempDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "Pipeta_Pkg_" + [System.Guid]::NewGuid().ToString())
$pkgRoot = [System.IO.Path]::Combine($tempDir, "Pipeta")

try {
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    New-Item -ItemType Directory -Path $pkgRoot -Force | Out-Null
    
    # 1. Copiar base completa de Pipeta hacia la subcarpeta 'Pipeta'
    # Excluir siempre .git, .gemini, logs, node_modules\\.cache, _SYNC_CACHE y credentials
    # Excluir scripts exclusivos del estudio central (Actualizar y Publicar)
    $pythonDir = Join-Path $source "bin\python"
    $excludeFiles = @("*.zip", "*.log", "Actualizar_Pipeta_desde_Red.bat", "Publicar_Pipeta_a_Produccion_Estudio.bat")
    if ($includeRamon) {
        robocopy "$source" "$pkgRoot" /MIR /XD .git .gemini logs node_modules\\.cache _SYNC_CACHE credentials /XF $excludeFiles /NFL /NDL /NJH /NJS /R:0 /W:0
    } else {
        robocopy "$source" "$pkgRoot" /MIR /XD .git .gemini logs node_modules\\.cache _SYNC_CACHE credentials "$pythonDir" python /XF $excludeFiles /NFL /NDL /NJH /NJS /R:0 /W:0
        $pkgPython = Join-Path $pkgRoot "bin\python"
        if (Test-Path $pkgPython) { Remove-Item -Recurse -Force $pkgPython }
    }

    # 1.1 Inclusión selectiva de cachés de sincronización (desde cache local o Z:)
    $destCache = Join-Path $pkgRoot "_SYNC_CACHE"
    $srcCache = "C:\TOOLS\APPS\Pipeta\_SYNC_CACHE"
    if (-not (Test-Path $srcCache)) { $srcCache = "Z:\_SYNC_CACHE" }
    New-Item -ItemType Directory -Path $destCache -Force | Out-Null

    if (($includeDriveCache -or $includeServerCache) -and (Test-Path $srcCache)) {
        if ($includeDriveCache) {
            # Catálogos monolíticos de Drive
            Get-ChildItem -Path $srcCache -Filter "*.json" -File -ErrorAction SilentlyContinue | Where-Object { 
                $_.Name -notlike "server_*" -and $_.Name -ne "worker_status.json" 
            } | ForEach-Object {
                Copy-Item -Path $_.FullName -Destination (Join-Path $destCache $_.Name) -Force
            }
            # Catálogos modulares de Drive (projects/*/drive)
            $srcProjects = Join-Path $srcCache "projects"
            if (Test-Path $srcProjects) {
                Get-ChildItem -Path $srcProjects -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                    $projDriveSrc = Join-Path $_.FullName "drive"
                    if (Test-Path $projDriveSrc) {
                        $projDriveDest = Join-Path $destCache "projects\$($_.Name)\drive"
                        New-Item -ItemType Directory -Path $projDriveDest -Force | Out-Null
                        robocopy "$projDriveSrc" "$projDriveDest" /E /NFL /NDL /NJH /NJS /R:0 /W:0 | Out-Null
                    }
                }
            }
        }

        if ($includeServerCache) {
            # Catálogos monolíticos de Server (server_*.json)
            Get-ChildItem -Path $srcCache -Filter "server_*.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
                Copy-Item -Path $_.FullName -Destination (Join-Path $destCache $_.Name) -Force
            }
            # Catálogos modulares de Server (projects/*/server)
            $srcProjects = Join-Path $srcCache "projects"
            if (Test-Path $srcProjects) {
                Get-ChildItem -Path $srcProjects -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                    $projServerSrc = Join-Path $_.FullName "server"
                    if (Test-Path $projServerSrc) {
                        $projServerDest = Join-Path $destCache "projects\$($_.Name)\server"
                        New-Item -ItemType Directory -Path $projServerDest -Force | Out-Null
                        robocopy "$projServerSrc" "$projServerDest" /E /NFL /NDL /NJH /NJS /R:0 /W:0 | Out-Null
                    }
                }
            }
        }
    }
    
    # 2. Asegurar que los presets locales más recientes se incluyan en Pipeta\\presets
    $localPresets = "C:\\TOOLS\\APPS\\Pipeta\\presets"
    if (Test-Path $localPresets) {
        robocopy "$localPresets" "$pkgRoot\\presets" /E /NFL /NDL /NJH /NJS /R:0 /W:0
    }

    # 3. Comprimir localmente en $tempDir para máxima velocidad y mover a destino
    $tempZip = Join-Path $tempDir "package.zip"
    if (Test-Path $destZip) { Remove-Item $destZip -Force }
    
    where.exe tar >$null 2>&1
    if ($LASTEXITCODE -eq 0) {
        tar.exe -caf "$tempZip" -C "$tempDir" "Pipeta"
    } else {
        Compress-Archive -Path "$pkgRoot" -DestinationPath "$tempZip" -Force
    }

    Move-Item -Path "$tempZip" -Destination "$destZip" -Force

    # 4. Generar el script .BAT instalador/descompresor en la misma carpeta
    $batScript = @'
@echo off
setlocal enabledelayedexpansion
title Instalador / Actualizador de Pipeta Local

echo ============================================================
echo   INSTALADOR / ACTUALIZADOR DE PIPETA LOCAL
echo ============================================================
echo.

set "TARGET_DIR=C:\\TOOLS\\APPS"
set "PIPETA_DIR=C:\\TOOLS\\APPS\\Pipeta"
set "ZIP_FILE=%~dp0${zipName}"

if not exist "%ZIP_FILE%" set "ZIP_FILE=%~dp0Pipeta_${VERSION}_Ramon.zip"
if not exist "%ZIP_FILE%" set "ZIP_FILE=%~dp0Pipeta_${VERSION}.zip"
if not exist "%ZIP_FILE%" (
    for %%f in ("%~dp0Pipeta_*.zip") do set "ZIP_FILE=%%f"
)

if not exist "%ZIP_FILE%" (
    echo [ERROR] No se encontro el archivo Pipeta_*.zip en esta carpeta.
    echo Asegurate de que el archivo .zip este en el mismo directorio.
    echo.
    pause
    exit /b 1
)

echo [INFO] Archivo detectado: %ZIP_FILE%
echo [INFO] Destino: %TARGET_DIR%\\Pipeta
echo.

echo [1/3] Cerrando instancias previas de Pipeta...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":3002 *LISTENING"') do taskkill /F /PID %%a >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

echo [2/3] Descomprimiendo Pipeta en %TARGET_DIR%...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"

where tar >nul 2>&1
if %errorlevel% equ 0 (
    tar -xf "%ZIP_FILE%" -C "%TARGET_DIR%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP_FILE%' -DestinationPath '%TARGET_DIR%' -Force"
)

if not exist "%PIPETA_DIR%\\Launch_Pipeta.bat" (
    echo [ERROR] No se encontro Launch_Pipeta.bat en %PIPETA_DIR%.
    pause
    exit /b 1
)

echo [3/3] Creando acceso directo en Escritorio con icono...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Pipeta.lnk')); $s.TargetPath = 'C:\\TOOLS\\APPS\\Pipeta\\Launch_Pipeta.bat'; $s.WorkingDirectory = 'C:\\TOOLS\\APPS\\Pipeta'; $ico = 'C:\\TOOLS\\APPS\\Pipeta\\Pipeta.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Description = 'Pipeta - VFX Pipeline Manager'; $s.Save()" 2>nul

echo.
echo ============================================================
echo   OK: Pipeta instalada con exito en C:\\TOOLS\\APPS\\Pipeta
echo ============================================================
echo.
timeout /t 2 >nul

start "" "C:\\TOOLS\\APPS\\Pipeta\\Launch_Pipeta.bat"
exit
'@

    [System.IO.File]::WriteAllText($destBat, $batScript, [System.Text.Encoding]::ASCII)

    $bytes = (Get-Item $destZip).Length
    Write-Output "SUCCESS:$bytes"
} catch {
    Write-Error $_.Exception.Message
    exit 1
} finally {
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
`;

    const tmpPsFile = path.join(os.tmpdir(), `pipeta_pkg_${Date.now()}.ps1`);
    try {
        await fs.writeFile(tmpPsFile, psScript, 'utf8');
        const { execFile } = require('child_process');
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPsFile], { timeout: 300000 }, async (err, stdout, stderr) => {
            try { await fs.remove(tmpPsFile); } catch(e) {}

            if (err) {
                console.error("[PACKAGE DIST] Error:", err, stderr);
                return res.status(500).json({ error: err.message || stderr });
            }

            const outStr = (stdout || '').trim();
            let bytes = 0;
            if (outStr.includes('SUCCESS:')) {
                bytes = parseInt(outStr.split('SUCCESS:')[1].trim(), 10) || 0;
            }

            function formatBytes(b) {
                if (!b || b <= 0) return '0 MB';
                return (b / (1024 * 1024)).toFixed(1) + ' MB';
            }

            res.json({
                success: true,
                zipPath: destZip,
                zipName: zipName,
                batPath: destBat,
                batName: 'Instalar_o_Actualizar_Pipeta_Local.bat',
                targetDir: targetDir,
                version: VERSION,
                sizeBytes: bytes,
                sizeFormatted: formatBytes(bytes)
            });
        });
    } catch(err) {
        try { await fs.remove(tmpPsFile); } catch(e) {}
        res.status(500).json({ error: err.message });
    }
});

// --- AUTO-UPDATE FROM NETWORK SOURCE ---
app.post('/api/app/update-from-server', async (req, res) => {
    const customSource = req.body?.sourcePath || '';
    const localDest = 'C:\\TOOLS\\APPS\\Pipeta';

    const candidateSources = [
        customSource,
        'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta',
        '\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta'
    ].filter(s => s && s.trim().length > 0);

    const psScript = `
$candidateSources = @(
    ${candidateSources.map(s => `"${s.replace(/\\/g, '\\\\')}"`).join(',\n    ')}
)
$foundSource = $null
foreach ($src in $candidateSources) {
    if (Test-Path "$src\\server\\server.js") {
        $foundSource = $src
        break
    }
}

if (-not $foundSource) {
    Write-Error "No se pudo acceder al servidor maestro de Pipeta. Se verificaron: Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta y \\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta. Verifica la conexion de red o que la unidad Z: este conectada."
    exit 1
}

$dest = 'C:\\TOOLS\\APPS\\Pipeta'
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }

# 1. Sincronizar archivos principales directamente desde el origen detectado
& robocopy $foundSource $dest /MIR /R:2 /W:2 /MT:16 /XD .git .gemini logs presets _SYNC_CACHE credentials bin tools node_modules _old /XF *.zip *.log *.tmp /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -le 7) { $global:LASTEXITCODE = 0 }

# 2. Sincronizar presets base sin sobreescribir configuraciones locales
if (Test-Path "$foundSource\\presets") {
    & robocopy "$foundSource\\presets" "$dest\\presets" /E /XO /XN /XC /NFL /NDL /NJH /NJS /R:0 /W:0
    if ($LASTEXITCODE -le 7) { $global:LASTEXITCODE = 0 }
}

Write-Output "UPDATE_SUCCESS:$foundSource"
`;

    const tmpPsFile = path.join(os.tmpdir(), `pipeta_update_${Date.now()}.ps1`);
    try {
        await fs.writeFile(tmpPsFile, psScript, 'utf8');
        const { execFile } = require('child_process');
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPsFile], { timeout: 120000 }, async (err, stdout, stderr) => {
            try { await fs.remove(tmpPsFile); } catch(e) {}

            if (err) {
                console.error("[AUTO-UPDATE] Error:", err, stderr);
                return res.status(500).json({ error: err.message || stderr });
            }

            console.log("[AUTO-UPDATE] Synchronized successfully. Scheduling restart...");
            
            try { fs.writeFileSync(RESTART_FLAG_FILE, 'restart'); } catch (e) { }

            res.json({ success: true, updatedFrom: stdout.trim(), localDest: localDest });

            setTimeout(() => {
                process.exit(42);
            }, 500);
        });
    } catch(err) {
        try { await fs.remove(tmpPsFile); } catch(e) {}
        res.status(500).json({ error: err.message });
    }
});

// --- CREATE DESKTOP SHORTCUT ---
app.post('/api/app/create-desktop-shortcut', async (req, res) => {
    const isLocal = __dirname.toLowerCase().includes('c:\\tools\\apps\\pipeta');
    const localDir = isLocal ? 'C:\\TOOLS\\APPS\\Pipeta' : path.resolve(__dirname, '..');
    const batName = fs.existsSync(path.join(localDir, 'Launch_Pipeta.bat')) ? 'Launch_Pipeta.bat' : 'Iniciar_Pipeta.bat';
    const batPath = path.join(localDir, batName);
    const icoPath = path.join(localDir, 'Pipeta.ico');

    const psScript = `
$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = [System.IO.Path]::Combine($desktop, 'Pipeta.lnk')
$s = $ws.CreateShortcut($lnkPath)
$s.TargetPath = '${batPath.replace(/\\/g, '\\\\')}'
$s.WorkingDirectory = '${localDir.replace(/\\/g, '\\\\')}'
$ico = '${icoPath.replace(/\\/g, '\\\\')}'
if (Test-Path $ico) {
    $s.IconLocation = $ico
}
$s.Description = 'Pipeta - VFX Pipeline & IA Ingest Manager'
$s.Save()
Write-Output "SHORTCUT_CREATED"
`;

    const tmpPsFile = path.join(os.tmpdir(), `pipeta_shortcut_${Date.now()}.ps1`);
    try {
        await fs.writeFile(tmpPsFile, psScript, 'utf8');
        const { execFile } = require('child_process');
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPsFile], { timeout: 15000 }, async (err, stdout, stderr) => {
            try { await fs.remove(tmpPsFile); } catch(e) {}
            if (err) {
                console.error("[SHORTCUT] Error:", err, stderr);
                return res.status(500).json({ error: err.message || stderr });
            }
            res.json({ success: true, shortcutPath: path.join(process.env.USERPROFILE || '', 'Desktop', 'Pipeta.lnk') });
        });
    } catch(err) {
        try { await fs.remove(tmpPsFile); } catch(e) {}
        res.status(500).json({ error: err.message });
    }
});

// --- VERSION INFO ---
app.get('/api/app/version-info', async (req, res) => {
    const candidateSources = [
        'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta',
        '\\\\LASP-VM\\Pipeta'
    ];
    let netSource = candidateSources[0];
    let serverOnline = false;
    let serverVersion = null;

    for (const src of candidateSources) {
        try {
            const netServerJs = path.join(src, 'server', 'server.js');
            if (fs.existsSync(netServerJs)) {
                netSource = src;
                serverOnline = true;
                const content = fs.readFileSync(netServerJs, 'utf8');
                const m = content.match(/const VERSION = ["']([^"']+)["']/);
                if (m) serverVersion = m[1];
                break;
            }
        } catch(e) {}
    }

    res.json({
        currentVersion: VERSION,
        serverPath: netSource,
        serverOnline: serverOnline,
        serverVersion: serverVersion || VERSION,
        runtimePath: path.resolve(__dirname, '..')
    });
});

// ==========================================
// --- USERS & ROLES CONFIGURATION ---
// ==========================================

const USERS_CONFIG_FILE = path.join(__dirname, '../presets/users_config.json');
const STATUS_CONFIG_FILE = path.join(__dirname, '../presets/status_config.json');

function sanitizeUsersConfig(data) {
    if (!data || !Array.isArray(data.users)) return false;
    let modified = false;
    data.users.forEach(u => {
        if (u.id === 'u_admin' || u.username === 'admin' || (u.isSystem && u.role === 'admin')) {
            if (u.authSource) {
                delete u.authSource;
                modified = true;
            }
            if (u.laspUser === 'lasp-admin') {
                u.laspUser = '';
                modified = true;
            }
            if (u.firstName === 'Admin') {
                u.firstName = '';
                modified = true;
            }
            if (u.isSystem !== true) {
                u.isSystem = true;
                modified = true;
            }
            if (u.avatarColor !== '#ff9800') {
                u.avatarColor = '#ff9800';
                modified = true;
            }
        }
    });
    return modified;
}

app.get('/api/users', async (req, res) => {
    try {
        if (!fs.existsSync(USERS_CONFIG_FILE)) {
            return res.json({ adminPassword: "Pipetadmin.321", roles: [], users: [], activeUser: "lasp-mpastorino" });
        }
        const data = await fs.readJson(USERS_CONFIG_FILE);
        const wasSanitized = sanitizeUsersConfig(data);
        if (wasSanitized) {
            fs.writeJson(USERS_CONFIG_FILE, data, { spaces: 2 }).catch(e => console.warn("[USERS] Error auto-healing config:", e));
        }
        const safeData = { ...data, hasAdminPassword: !!data.adminPassword };
        delete safeData.adminPassword;
        res.json(safeData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const current = fs.existsSync(USERS_CONFIG_FILE) ? await fs.readJson(USERS_CONFIG_FILE) : {};
        const incoming = req.body || {};
        sanitizeUsersConfig(incoming);
        
        if (!incoming.adminPassword && current.adminPassword) {
            incoming.adminPassword = current.adminPassword;
        }

        await fs.writeJson(USERS_CONFIG_FILE, incoming, { spaces: 2 });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/verify-admin', async (req, res) => {
    try {
        const { password } = req.body;
        let adminPass = "Pipetadmin.321";
        if (fs.existsSync(USERS_CONFIG_FILE)) {
            const data = await fs.readJson(USERS_CONFIG_FILE);
            if (data.adminPassword) adminPass = data.adminPassword;
        }
        if (password === adminPass) {
            res.json({ success: true, authorized: true });
        } else {
            res.status(401).json({ success: false, authorized: false, error: "Contraseña de administrador incorrecta" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/set-active', async (req, res) => {
    try {
        const { laspUser } = req.body;
        if (!laspUser) return res.status(400).json({ error: "No user specified" });
        if (fs.existsSync(USERS_CONFIG_FILE)) {
            const data = await fs.readJson(USERS_CONFIG_FILE);
            data.activeUser = laspUser;
            await fs.writeJson(USERS_CONFIG_FILE, data, { spaces: 2 });
        }
        res.json({ success: true, activeUser: laspUser });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// --- STATUS CONFIGURATION ---
// ==========================================

app.get('/api/statuses', async (req, res) => {
    try {
        if (!fs.existsSync(STATUS_CONFIG_FILE)) {
            return res.json({ statuses: [] });
        }
        const data = await fs.readJson(STATUS_CONFIG_FILE);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/statuses', async (req, res) => {
    try {
        await fs.writeJson(STATUS_CONFIG_FILE, req.body, { spaces: 2 });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// --- WORKFLOW & SHOT TRACKER API ---
// ==========================================

app.post('/api/workflow/shot-tracker/load', async (req, res) => {
    try {
        const { projectPath, workflowDir } = req.body;
        if (!projectPath) return res.status(400).json({ error: "No projectPath specified" });

        const effectiveWorkflowDir = workflowDir || path.join(projectPath, 'workflow');
        const trackerFile = path.join(effectiveWorkflowDir, 'shot_tracker.json');

        let trackerData = { projectPath, shots: {}, updatedAt: new Date().toISOString() };
        let exists = false;
        if (fs.existsSync(trackerFile)) {
            exists = true;
            try {
                trackerData = await fs.readJson(trackerFile);
            } catch (e) {
                console.warn("[WORKFLOW] Error reading trackerFile:", e);
            }
        }

        res.json({ success: true, trackerFile: exists ? trackerFile : null, exists, trackerData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/workflow/shot-tracker/save', async (req, res) => {
    try {
        const { workflowDir, trackerData } = req.body;
        if (!workflowDir || !trackerData) return res.status(400).json({ error: "Missing workflowDir or trackerData" });

        // Blindar: No crear carpetas fantasma si el proyecto no existe físicamente en disco
        const projectRoot = path.dirname(workflowDir);
        if (!fs.existsSync(projectRoot)) {
            return res.json({ success: false, skipped: true, reason: "Project root does not exist on disk" });
        }

        await fs.ensureDir(workflowDir);
        const trackerFile = path.join(workflowDir, 'shot_tracker.json');
        trackerData.updatedAt = new Date().toISOString();
        await fs.writeJson(trackerFile, trackerData, { spaces: 2 });

        res.json({ success: true, trackerFile });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Per-User Task Export & Import
app.post('/api/workflow/user-tasks/export', async (req, res) => {
    try {
        const { workflowDir, laspUser, userTasks, projectInfo } = req.body;
        if (!workflowDir || !laspUser) return res.status(400).json({ error: "Missing parameters" });

        const assignmentsDir = path.join(workflowDir, 'assignments');
        await fs.ensureDir(assignmentsDir);
        const userFile = path.join(assignmentsDir, `tasks_${laspUser}.json`);

        const payload = {
            laspUser,
            exportedAt: new Date().toISOString(),
            project: projectInfo || {},
            tasksCount: (userTasks || []).length,
            tasks: userTasks || []
        };

        await fs.writeJson(userFile, payload, { spaces: 2 });
        res.json({ success: true, filePath: userFile, payload });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/workflow/user-tasks/load', async (req, res) => {
    try {
        const { workflowDir, laspUser } = req.body;
        if (!workflowDir || !laspUser) return res.status(400).json({ error: "Missing parameters" });

        const userFile = path.join(workflowDir, 'assignments', `tasks_${laspUser}.json`);
        if (!fs.existsSync(userFile)) {
            return res.status(404).json({ error: `No se encontraron tareas asignadas para el usuario ${laspUser}` });
        }

        const data = await fs.readJson(userFile);
        res.json({ success: true, userTasks: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/workflow/ensure-process-folders', async (req, res) => {
    try {
        const { folderPaths } = req.body;
        if (!Array.isArray(folderPaths) || folderPaths.length === 0) {
            return res.status(400).json({ error: "No folder paths provided" });
        }

        const created = [];
        for (const f of folderPaths) {
            const clean = path.resolve(f.replace(/\//g, '\\'));
            if (!fs.existsSync(clean)) {
                await fs.ensureDir(clean);
                created.push(clean);
            }
        }

        res.json({ success: true, createdCount: created.length, createdFolders: created });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DISK USAGE ---
app.get('/api/system/diskUsage', async (req, res) => {
    const drives = (req.query.drives || 'C').split(',').map(d => d.trim().toUpperCase().replace(':', ''));
    try {
        const { execSync } = require('child_process');
        const results = {};
        for (const letter of drives) {
            try {
                const cmd = `powershell -NoProfile -Command "(Get-PSDrive -Name '${letter}' -PSProvider FileSystem | Select-Object Used,Free | ConvertTo-Json)"`;
                const raw = execSync(cmd, { timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
                const info = JSON.parse(raw);
                const used = info.Used || 0;
                const free = info.Free || 0;
                const total = used + free;
                results[letter] = {
                    total,
                    used,
                    free,
                    percent: total > 0 ? Math.round((used / total) * 100) : 0
                };
            } catch (e) {
                results[letter] = { total: 0, used: 0, free: 0, percent: 0, error: 'Drive not found' };
            }
        }
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DIRECTORY SIZE ---
const dirSizeMemoryCache = new Map();
app.get('/api/fs/dirSize', (req, res) => {
    const dirPath = req.query.path;
    if (!dirPath) return res.status(400).json({ error: 'Missing path' });

    const norm = (dirPath || '').replace(/\\/g, '/').toLowerCase();

    // 0. Cache en memoria (5 minutos de TTL) para evitar llamadas repetidas a PowerShell
    const cachedSize = dirSizeMemoryCache.get(norm);
    if (cachedSize && (Date.now() - cachedSize.time < 300000)) {
        return res.json({ path: dirPath, size: cachedSize.size, fromCache: true });
    }

    // 1. Intentar resolver el tamaño instantáneamente desde el catálogo (0 ms)
    try {
        if (typeof catalogGenerator.getDirSizeFromCatalog === 'function') {
            const catSize = catalogGenerator.getDirSizeFromCatalog(dirPath);
            if (catSize !== null) {
                dirSizeMemoryCache.set(norm, { size: catSize, time: Date.now() });
                return res.json({ path: dirPath, size: catSize, fromCatalog: true });
            }
        }
    } catch (e) {}

    // 2. Si es una ruta de red/servidor (UNC, etc.) y no está en el catálogo, retornar 0 sin bloquear
    if (norm.startsWith('//') || norm.startsWith('\\\\')) {
        return res.json({ path: dirPath, size: 0, fromCatalog: false });
    }

    // 3. Para carpetas locales, usar ejecución asíncrona NO BLOQUEANTE (nunca execSync)
    const { exec } = require('child_process');
    const cmd = `powershell -NoProfile -Command "(Get-ChildItem -Path '${dirPath.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
        if (err) {
            return res.json({ path: dirPath, size: 0, error: err.message });
        }
        const size = parseInt((stdout || '').trim()) || 0;
        dirSizeMemoryCache.set(norm, { size, time: Date.now() });
        res.json({ path: dirPath, size });
    });
});

// --- RCLONE INTEGRATION ---

// Status check
app.get('/api/rclone/status', (req, res) => {
    res.json({
        available: rcloneAvailable,
        version: rcloneVersion,
        path: RCLONE_PATH
    });
});

async function replicateEmptyDirectories(srcDir, destDir) {
    await fs.ensureDir(destDir);
    try {
        const entries = await fs.readdir(srcDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const srcSub = path.join(srcDir, entry.name);
                const destSub = path.join(destDir, entry.name);
                await replicateEmptyDirectories(srcSub, destSub);
            }
        }
    } catch (e) {
        console.warn(`[MKDIR_ONLY] Error en ${srcDir}:`, e.message);
    }
}

// Streaming sync with real-time percentage, file progress, speed and ETA
app.post('/api/rclone/syncStream', async (req, res) => {
    const { items, engine = 'auto', onlyFolders = false, direction = 'push' } = req.body;
    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Missing items array' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    function formatSpeed(bytesPerSec) {
        if (bytesPerSec >= 1024 * 1024 * 1024) return (bytesPerSec / (1024 * 1024 * 1024)).toFixed(1) + ' GB/s';
        if (bytesPerSec >= 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
        if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
        return bytesPerSec.toFixed(0) + ' B/s';
    }

    function formatEta(seconds) {
        if (!seconds || seconds <= 0 || !isFinite(seconds)) return '0s';
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins < 60) return `${mins}m ${secs}s`;
        const hours = Math.floor(mins / 60);
        const remMins = mins % 60;
        return `${hours}h ${remMins}m`;
    }

    let totalBytesAll = 0;
    const fileStatsList = [];
    for (const item of items) {
        let size = 0;
        if (!onlyFolders && !item.onlyFolders && !item.isDirectory) {
            try {
                if (fs.existsSync(item.src)) {
                    const st = fs.statSync(item.src);
                    size = st.size;
                }
            } catch(e) { size = 0; }
        }
        fileStatsList.push({ ...item, size });
        totalBytesAll += size;
    }

    let totalTransferredBytes = 0;
    const startTime = Date.now();
    const results = [];
    const dirLabel = direction === 'push' ? 'Subida (Upload)' : 'Descarga (Download)';

    for (let i = 0; i < fileStatsList.length; i++) {
        const item = fileStatsList[i];
        const baseName = path.basename(item.src) || (item.isDirectory ? 'Carpeta' : 'Archivo');

        try {
            if (onlyFolders || item.onlyFolders) {
                if (item.isDirectory) {
                    await replicateEmptyDirectories(item.src, item.dest);
                } else {
                    await fs.ensureDir(path.dirname(item.dest));
                }
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'mkdir_only' });

                const totalPct = Math.round(((i + 1) / fileStatsList.length) * 100);
                res.write(JSON.stringify({
                    type: 'progress',
                    direction: dirLabel,
                    itemIndex: i + 1,
                    totalItems: fileStatsList.length,
                    filename: baseName,
                    filePercent: 100,
                    totalPercent: totalPct,
                    speedText: 'Estructura',
                    etaText: '--'
                }) + '\n');
                continue;
            }

            if (item.isDirectory) {
                await fs.ensureDir(item.dest);
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'mkdir' });
                const totalPct = totalBytesAll > 0 
                    ? Math.round((totalTransferredBytes / totalBytesAll) * 100)
                    : Math.round(((i + 1) / fileStatsList.length) * 100);
                res.write(JSON.stringify({
                    type: 'progress',
                    direction: dirLabel,
                    itemIndex: i + 1,
                    totalItems: fileStatsList.length,
                    filename: `📁 ${baseName}`,
                    filePercent: 100,
                    totalPercent: totalPct,
                    speedText: 'Carpeta',
                    etaText: '--'
                }) + '\n');
                continue;
            }

            // Single File Copy with Real-time Chunked Stream Progress
            await fs.ensureDir(path.dirname(item.dest));

            if (!item.size || item.size === 0) {
                await fs.copyFile(item.src, item.dest);
                totalTransferredBytes += (item.size || 0);
            } else {
                await new Promise((resolve, reject) => {
                    let isResolved = false;
                    const safeResolve = () => {
                        if (!isResolved) {
                            isResolved = true;
                            resolve();
                        }
                    };
                    const safeReject = (err) => {
                        if (!isResolved) {
                            isResolved = true;
                            reject(err);
                        }
                    };

                    const readStream = fs.createReadStream(item.src);
                    const writeStream = fs.createWriteStream(item.dest);
                    let fileTransferred = 0;
                    let lastProgressEmit = Date.now();

                    readStream.on('data', (chunk) => {
                        fileTransferred += chunk.length;
                        totalTransferredBytes += chunk.length;

                        const now = Date.now();
                        if (now - lastProgressEmit > 100 || fileTransferred >= item.size) {
                            lastProgressEmit = now;
                            const elapsedSec = Math.max(0.1, (now - startTime) / 1000);
                            const speedBytesPerSec = totalTransferredBytes / elapsedSec;
                            const remainingBytes = Math.max(0, totalBytesAll - totalTransferredBytes);
                            const etaSec = speedBytesPerSec > 0 ? Math.round(remainingBytes / speedBytesPerSec) : 0;

                            const filePct = item.size > 0 ? Math.min(100, Math.round((fileTransferred / item.size) * 100)) : 100;
                            const totalPct = totalBytesAll > 0 ? Math.min(100, Math.round((totalTransferredBytes / totalBytesAll) * 100)) : Math.round(((i + 1) / fileStatsList.length) * 100);

                            res.write(JSON.stringify({
                                type: 'progress',
                                direction: dirLabel,
                                itemIndex: i + 1,
                                totalItems: fileStatsList.length,
                                filename: baseName,
                                filePercent: filePct,
                                totalPercent: totalPct,
                                speedText: formatSpeed(speedBytesPerSec),
                                etaText: formatEta(etaSec)
                            }) + '\n');
                        }
                    });

                    readStream.on('error', safeReject);
                    writeStream.on('error', safeReject);
                    writeStream.on('finish', safeResolve);
                    writeStream.on('close', safeResolve);

                    readStream.pipe(writeStream);
                });
            }

            // Emitir evento de 100% completado para este archivo
            const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
            const speedBytesPerSec = totalTransferredBytes / elapsedSec;
            const remainingBytes = Math.max(0, totalBytesAll - totalTransferredBytes);
            const etaSec = speedBytesPerSec > 0 ? Math.round(remainingBytes / speedBytesPerSec) : 0;
            const totalPct = totalBytesAll > 0 ? Math.min(100, Math.round((totalTransferredBytes / totalBytesAll) * 100)) : Math.round(((i + 1) / fileStatsList.length) * 100);

            res.write(JSON.stringify({
                type: 'progress',
                direction: dirLabel,
                itemIndex: i + 1,
                totalItems: fileStatsList.length,
                filename: baseName,
                filePercent: 100,
                totalPercent: totalPct,
                speedText: formatSpeed(speedBytesPerSec),
                etaText: formatEta(etaSec)
            }) + '\n');

            results.push({ src: item.src, dest: item.dest, success: true, engine: 'stream' });

        } catch(err) {
            console.error(`[SYNC STREAM] Error on ${item.src}:`, err);
            results.push({ src: item.src, dest: item.dest, success: false, error: err.message });
        }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.write(JSON.stringify({
        type: 'complete',
        direction: dirLabel,
        total: fileStatsList.length,
        succeeded,
        failed,
        results
    }) + '\n');
    res.end();
});

// Batch sync via rclone (or fallback to native)
app.post('/api/rclone/syncBatch', async (req, res) => {
    const { items, engine = 'auto', onlyFolders = false } = req.body; // [{src, dest, isDirectory, onlyFolders}], engine: 'auto' | 'native' | 'rclone'
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Missing items array' });

    const results = [];
    // Determine which engine to use based on settings and availability
    const useRclone = (engine === 'rclone' && rcloneAvailable) || (engine === 'auto' && rcloneAvailable);
    const usedEngine = onlyFolders ? 'mkdir_only' : (useRclone ? 'rclone' : 'native');

    // If forced rclone but not available
    if (!onlyFolders && engine === 'rclone' && !rcloneAvailable) {
        return res.status(503).json({ error: 'Rclone forced but not available', engine: 'none' });
    }

    for (const item of items) {
        try {
            if (onlyFolders || item.onlyFolders) {
                // Replicar la estructura de carpetas completa sin copiar archivos
                if (item.isDirectory) {
                    await replicateEmptyDirectories(item.src, item.dest);
                } else {
                    await fs.ensureDir(path.dirname(item.dest));
                }
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'mkdir_only' });
                continue;
            }

            if (useRclone) {
                // Use rclone with cloud virtual drive compatibility flags
                try {
                    await new Promise((resolve, reject) => {
                        let args;
                        if (item.isDirectory) {
                            // rclone copy src/ dest/ for directories
                            args = ['copy', item.src, item.dest, '--create-empty-src-dirs', '--ignore-size', '--inplace', '--no-check-dest'];
                        } else {
                            // For single files: rclone copyto src dest
                            args = ['copyto', item.src, item.dest, '--ignore-size', '--inplace', '--no-check-dest'];
                        }

                        console.log(`[RCLONE] ${args.join(' ')}`);
                        const proc = spawn(RCLONE_PATH, args, { windowsHide: true });

                        let stderr = '';
                        proc.stderr.on('data', d => stderr += d.toString());
                        proc.on('close', code => {
                            if (code === 0) resolve();
                            else reject(new Error(`rclone exit ${code}: ${stderr}`));
                        });
                        proc.on('error', reject);
                    });
                    results.push({ src: item.src, dest: item.dest, success: true, engine: 'rclone' });
                } catch (rErr) {
                    console.warn(`[RCLONE] Fallback nativo activado tras aviso: ${rErr.message}`);
                    if (item.isDirectory) {
                        await fs.ensureDir(item.dest);
                        await fs.copy(item.src, item.dest, { overwrite: true });
                    } else {
                        await fs.ensureDir(path.dirname(item.dest));
                        await fs.copy(item.src, item.dest, { overwrite: true });
                    }
                    results.push({ src: item.src, dest: item.dest, success: true, engine: 'native_fallback' });
                }
            } else {
                // Use native fs.copy
                if (item.isDirectory) {
                    await fs.ensureDir(item.dest);
                    await fs.copy(item.src, item.dest, { overwrite: true });
                } else {
                    await fs.ensureDir(path.dirname(item.dest));
                    await fs.copy(item.src, item.dest, { overwrite: true });
                }
                results.push({ src: item.src, dest: item.dest, success: true, engine: 'native' });
            }
        } catch (err) {
            console.error(`[SYNC] Error: ${err.message}`);
            results.push({ src: item.src, dest: item.dest, success: false, error: err.message, engine: usedEngine });
        }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    res.json({
        total: items.length,
        succeeded,
        failed,
        engine: usedEngine,
        results
    });
});

// --- MIRROR REPAIR BATCH ---
app.post('/api/mirror/repairBatch', async (req, res) => {
    const { items, mode = 'both', mediaSubfolders, workSubfolders, checkSubfolders = false, omitControl = true } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Missing items array' });

    let repairedCount = 0;
    const targetMediaSubfolders = (Array.isArray(mediaSubfolders) && mediaSubfolders.length > 0)
        ? mediaSubfolders
        : ['IA/enc', 'IA/export', 'IA/ref', 'nuke/exportIA', 'nuke/fullres', 'nuke/prerender', 'in'];

    const targetWorkSubfolders = (Array.isArray(workSubfolders) && workSubfolders.length > 0)
        ? workSubfolders
        : ['compo'];

    try {
        for (const item of items) {
            const shouldFixMedia = (mode === 'media' || mode === 'both') && (item.status === 'missing-media' || (checkSubfolders && item.missingMediaFolders && item.missingMediaFolders.length > 0));
            const shouldFixWork = (mode === 'work' || mode === 'both') && (item.status === 'missing-work' || (checkSubfolders && item.missingWorkFolders && item.missingWorkFolders.length > 0));

            if (shouldFixMedia && item.mediaPath) {
                // Ensure media shot base dir
                await fs.ensureDir(item.mediaPath);
                // Create subfolders only if checkSubfolders was explicitly enabled
                if (checkSubfolders && Array.isArray(targetMediaSubfolders)) {
                    for (const sub of targetMediaSubfolders) {
                        await fs.ensureDir(path.join(item.mediaPath, sub));
                    }
                }
                repairedCount++;
            }

            if (shouldFixWork && item.workPath) {
                // Ensure work shot base dir
                await fs.ensureDir(item.workPath);
                // Create subfolders only if checkSubfolders was explicitly enabled
                if (checkSubfolders && Array.isArray(targetWorkSubfolders)) {
                    for (const sub of targetWorkSubfolders) {
                        await fs.ensureDir(path.join(item.workPath, sub));
                    }
                }
                repairedCount++;
            }
        }

        res.json({ success: true, repairedCount });
    } catch (err) {
        console.error("[MIRROR] Repair error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- FAST FILE AUDIT SCAN (MIRROR & RENDERS) ---
app.post('/api/audit/scan', async (req, res) => {
    const { auditType, roots, scope = 'all', targetEpisodes = [], config = {}, projectName: reqProjName } = req.body;
    if (!roots || !roots.work || !roots.media) {
        return res.status(400).json({ error: 'Missing roots configuration' });
    }

    const normWork = roots.work.replace(/\\/g, '/').replace(/\/+$/, '');
    const normMedia = roots.media.replace(/\\/g, '/').replace(/\/+$/, '');
    const workEpRoot = normWork + '/episodios';

    function extractVersion(str) {
        const match = str.match(/_?v(\d{2,4})/i);
        return match ? { str: 'v' + match[1], num: parseInt(match[1], 10) } : null;
    }

    // Google Drive Cross-reference catalog loader
    let driveManifest = null;
    const driveEpisodeCache = new Map();

    if (config.compareDrive) {
        try {
            let pName = reqProjName || config.projectName;
            if (!pName && typeof catalogGenerator.findProjectManifestForPath === 'function') {
                const pInfo = catalogGenerator.findProjectManifestForPath(normWork, 'drive');
                if (pInfo) pName = pInfo.projectName;
            }
            if (!pName) {
                const pCandidates = [path.basename(normWork), path.basename(path.dirname(normWork))];
                for (const pc of pCandidates) {
                    if (typeof catalogGenerator.getModularManifest === 'function' && catalogGenerator.getModularManifest(pc, 'drive')) {
                        pName = pc;
                        break;
                    }
                }
            }
            if (pName && typeof catalogGenerator.getModularManifest === 'function') {
                driveManifest = catalogGenerator.getModularManifest(pName, 'drive');
            }
        } catch(e) {
            console.warn("[AUDIT] Error loading Drive manifest:", e.message);
        }
    }

    function getDriveSubCatalog(epName, category) {
        if (!driveManifest) return null;
        const cacheKey = `${epName}_${category}`.toLowerCase();
        if (driveEpisodeCache.has(cacheKey)) return driveEpisodeCache.get(cacheKey);

        const pName = driveManifest.project || reqProjName || config.projectName;
        const subFile = category === 'work' ? `episodios/${epName}.json` : `media/${epName}.json`;
        const candidatePaths = [
            path.join(getLocalSyncCacheDir(), 'projects', pName, 'drive', subFile),
            path.join('Z:/_SYNC_CACHE/projects', pName, 'drive', subFile),
            path.join(process.env.TEMP || 'C:/Temp', '_SYNC_CACHE/projects', pName, 'drive', subFile)
        ];
        let loaded = null;
        for (const cp of candidatePaths) {
            try {
                if (fs.existsSync(cp)) {
                    loaded = fs.readJsonSync(cp);
                    break;
                }
            } catch(e) {}
        }
        driveEpisodeCache.set(cacheKey, loaded);
        return loaded;
    }

    try {
        if (auditType === 'mirror') {
            const expectedMediaFolders = config.expectedMedia || [];
            const expectedWorkFolders = config.expectedWork || [];

            // 1. Scan Work
            const workShotsMap = new Map();
            if (await fs.pathExists(workEpRoot)) {
                const epItems = await fs.readdir(workEpRoot);
                for (const ep of epItems) {
                    if (targetEpisodes.length > 0 && !targetEpisodes.includes(ep)) continue;
                    const epPath = path.join(workEpRoot, ep);
                    try {
                        if (!(await fs.stat(epPath)).isDirectory()) continue;
                    } catch(e) { continue; }

                    const seqRoot = path.join(epPath, 'secuencias');
                    if (!await fs.pathExists(seqRoot)) continue;
                    const seqItems = await fs.readdir(seqRoot);

                    for (const seq of seqItems) {
                        const seqPath = path.join(seqRoot, seq);
                        try {
                            if (!(await fs.stat(seqPath)).isDirectory()) continue;
                        } catch(e) { continue; }

                        const shotsRoot = path.join(seqPath, 'shots');
                        if (!await fs.pathExists(shotsRoot)) continue;
                        const shotItems = await fs.readdir(shotsRoot);

                        for (const shot of shotItems) {
                            const shotPath = path.join(shotsRoot, shot);
                            try {
                                if (!(await fs.stat(shotPath)).isDirectory()) continue;
                            } catch(e) { continue; }

                            const key = `${ep}/${seq}/${shot}`.toLowerCase();
                            workShotsMap.set(key, { ep, seq, shot, path: shotPath.replace(/\\/g, '/') });
                        }
                    }
                }
            }

            // 2. Scan Media
            const mediaShotsMap = new Map();
            if (await fs.pathExists(normMedia)) {
                const mediaEpItems = await fs.readdir(normMedia);
                for (const ep of mediaEpItems) {
                    if (targetEpisodes.length > 0 && !targetEpisodes.includes(ep)) continue;
                    const epPath = path.join(normMedia, ep);
                    try {
                        if (!(await fs.stat(epPath)).isDirectory()) continue;
                    } catch(e) { continue; }

                    const seqItems = await fs.readdir(epPath);
                    for (const seq of seqItems) {
                        const seqPath = path.join(epPath, seq);
                        try {
                            if (!(await fs.stat(seqPath)).isDirectory()) continue;
                        } catch(e) { continue; }

                        const shotItems = await fs.readdir(seqPath);
                        for (const shot of shotItems) {
                            const shotPath = path.join(seqPath, shot);
                            try {
                                if (!(await fs.stat(shotPath)).isDirectory()) continue;
                            } catch(e) { continue; }

                            const key = `${ep}/${seq}/${shot}`.toLowerCase();
                            mediaShotsMap.set(key, { ep, seq, shot, path: shotPath.replace(/\\/g, '/') });
                        }
                    }
                }
            }

            // 3. Cross Compare
            const allKeys = Array.from(new Set([...workShotsMap.keys(), ...mediaShotsMap.keys()]));
            const results = [];

            for (const key of allKeys) {
                const inWork = workShotsMap.has(key);
                const inMedia = mediaShotsMap.has(key);
                const wData = workShotsMap.get(key);
                const mData = mediaShotsMap.get(key);

                const ep = wData?.ep || mData?.ep;
                const seq = wData?.seq || mData?.seq;
                const shot = wData?.shot || mData?.shot;

                const expectedWorkPath = `${normWork}/episodios/${ep}/secuencias/${seq}/shots/${shot}`;
                const expectedMediaPath = `${normMedia}/${ep}/${seq}/${shot}`;

                const record = {
                    key,
                    ep,
                    seq,
                    shot,
                    workPath: inWork ? wData.path : expectedWorkPath,
                    mediaPath: inMedia ? mData.path : expectedMediaPath,
                    existsInWork: inWork,
                    existsInMedia: inMedia,
                    missingMediaFolders: [],
                    missingWorkFolders: [],
                    status: 'ok',
                    selected: false,
                    driveDiff: null
                };

                if (!inMedia) {
                    record.status = 'missing-media';
                    record.missingMediaFolders = expectedMediaFolders;
                } else if (!inWork) {
                    record.status = 'missing-work';
                    record.missingWorkFolders = expectedWorkFolders;
                } else {
                    let mSubNames = [];
                    let wSubNames = [];
                    try {
                        const mFiles = await fs.readdir(record.mediaPath);
                        for (const f of mFiles) {
                            if ((await fs.stat(path.join(record.mediaPath, f))).isDirectory()) mSubNames.push(f.toLowerCase());
                        }
                    } catch (e) { }
                    try {
                        const wFiles = await fs.readdir(record.workPath);
                        for (const f of wFiles) {
                            if ((await fs.stat(path.join(record.workPath, f))).isDirectory()) wSubNames.push(f.toLowerCase());
                        }
                    } catch (e) { }

                    const missingM = expectedMediaFolders.filter(f => !mSubNames.includes(f.toLowerCase()) && !mSubNames.includes(f.split('/')[0].toLowerCase()));
                    const missingW = expectedWorkFolders.filter(f => !wSubNames.includes(f.toLowerCase()));

                    record.missingMediaFolders = missingM;
                    record.missingWorkFolders = missingW;

                    if (missingM.length > 0 || missingW.length > 0) {
                        record.status = 'incomplete';
                    }
                }

                // Google Drive Cross-reference in Mirror scan
                if (config.compareDrive && driveManifest) {
                    const shotLow = shot.toLowerCase();
                    const workCat = getDriveSubCatalog(ep, 'work');
                    const mediaCat = getDriveSubCatalog(ep, 'media');

                    const driveHasWork = workCat && Array.isArray(workCat.flatList)
                        ? workCat.flatList.some(it => (it.relPath || it.path || '').toLowerCase().includes(`/${shotLow}`))
                        : false;
                    const driveHasMedia = mediaCat && Array.isArray(mediaCat.flatList)
                        ? mediaCat.flatList.some(it => (it.relPath || it.path || '').toLowerCase().includes(`/${shotLow}`))
                        : false;

                    record.driveDiff = {
                        driveHasWork,
                        driveHasMedia,
                        missingOnDriveWork: inWork && !driveHasWork,
                        missingOnDriveMedia: inMedia && !driveHasMedia,
                        newerOnDriveWork: !inWork && driveHasWork,
                        newerOnDriveMedia: !inMedia && driveHasMedia
                    };
                }

                results.push(record);
            }

            results.sort((a, b) => a.key.localeCompare(b.key));
            return res.json({ success: true, results, hasDriveCatalog: !!driveManifest });

        } else {
            // Render / Scenes Audit
            const targetProc = config.process || 'compo';
            const allowedExts = config.allowedExtensions || ['.nk', '.hip', '.blend', '.ma', '.mb', '.aep', '.prproj', '.c4d'];
            const processes = config.processes || ['compo'];
            const procExtMap = config.procExtMap || { 'compo': '.nk' };

            const results = [];
            if (await fs.pathExists(workEpRoot)) {
                const epItems = await fs.readdir(workEpRoot);
                for (const ep of epItems) {
                    if (targetEpisodes.length > 0 && !targetEpisodes.includes(ep)) continue;
                    const epPath = path.join(workEpRoot, ep);
                    try {
                        if (!(await fs.stat(epPath)).isDirectory()) continue;
                    } catch(e) { continue; }

                    const seqRoot = path.join(epPath, 'secuencias');
                    if (!await fs.pathExists(seqRoot)) continue;
                    const seqItems = await fs.readdir(seqRoot);

                    for (const seq of seqItems) {
                        const seqPath = path.join(seqRoot, seq);
                        try {
                            if (!(await fs.stat(seqPath)).isDirectory()) continue;
                        } catch(e) { continue; }

                        const shotsRoot = path.join(seqPath, 'shots');
                        if (!await fs.pathExists(shotsRoot)) continue;
                        const shotItems = await fs.readdir(shotsRoot);

                        for (const shot of shotItems) {
                            const shotPath = path.join(shotsRoot, shot);
                            try {
                                if (!(await fs.stat(shotPath)).isDirectory()) continue;
                            } catch(e) { continue; }

                            const shotWorkPath = shotPath.replace(/\\/g, '/');
                            const shotMediaPath = `${normMedia}/${ep}/${seq}/${shot}`;
                            const procList = (targetProc === 'all') ? processes : [targetProc];

                            for (const procName of procList) {
                                const procWorkPath = `${shotWorkPath}/${procName}`;
                                let rawFiles = [];
                                try {
                                    if (await fs.pathExists(procWorkPath)) {
                                        rawFiles = await fs.readdir(procWorkPath);
                                    }
                                } catch (e) { }

                                // Filter script scene files
                                const scriptFiles = [];
                                for (const rf of rawFiles) {
                                    const rfLower = rf.toLowerCase();
                                    if (rfLower.endsWith('.txt') || rfLower.endsWith('.json') || rfLower.endsWith('.bak') || rfLower.endsWith('.tmp') || rfLower.endsWith('.log') || rfLower.endsWith('~')) continue;
                                    const ext = '.' + rfLower.split('.').pop();
                                    if (allowedExts.includes(ext)) {
                                        scriptFiles.push(rf);
                                    }
                                }

                                const scriptVersions = [];
                                const badScriptFiles = [];
                                for (const sf of scriptFiles) {
                                    const vInfo = extractVersion(sf);
                                    const sfLower = sf.toLowerCase();
                                    const hasShot = sfLower.includes(shot.toLowerCase());
                                    if (!hasShot || !vInfo) {
                                        badScriptFiles.push(sf);
                                    }
                                    if (vInfo) {
                                        scriptVersions.push({ name: sf, ...vInfo });
                                    }
                                }
                                scriptVersions.sort((a, b) => b.num - a.num);
                                const latestScript = scriptVersions[0] || null;

                                // Check renders in Media
                                const foundRenders = [];
                                if (await fs.pathExists(shotMediaPath)) {
                                    try {
                                        const IGNORE_MEDIA_DIRS = new Set(['in', 'ingest', 'plates', 'plate', 'ref', 'reference', 'audio', 'sound', 'lut', 'luts', 'offline', 'source', 'sources', 'thumb', 'thumbnails', 'cache']);
                                        const candidateRoots = [];
                                        const topEntries = await fs.readdir(shotMediaPath);

                                        for (const entry of topEntries) {
                                            if (entry.startsWith('.')) continue;
                                            const entryLower = entry.toLowerCase();
                                            if (IGNORE_MEDIA_DIRS.has(entryLower)) continue;

                                            const entryPath = path.join(shotMediaPath, entry);
                                            let entryStat;
                                            try {
                                                entryStat = await fs.stat(entryPath);
                                            } catch(e) { continue; }

                                            if (!entryStat.isDirectory()) {
                                                candidateRoots.push({ path: shotMediaPath, subCategory: '', isDirectFile: true, fileName: entry });
                                                continue;
                                            }

                                            let subEntries = [];
                                            try {
                                                subEntries = await fs.readdir(entryPath);
                                            } catch(e) {}

                                            const hasKnownRenderSubs = subEntries.some(s => {
                                                const sl = s.toLowerCase();
                                                return sl.includes('fullres') || sl.includes('prerender') || sl.includes('mov') || sl.includes('compres') || sl.includes('exportia');
                                            });

                                            const isToolOrProc = hasKnownRenderSubs || ['nuke', 'compo', 'comp', 'flame', 'ae', 'maya', 'blender', '3d'].includes(entryLower) || entryLower === procName.toLowerCase();

                                            if (isToolOrProc) {
                                                for (const sub of subEntries) {
                                                    if (sub.startsWith('.')) continue;
                                                    const subLower = sub.toLowerCase();
                                                    if (IGNORE_MEDIA_DIRS.has(subLower)) continue;
                                                    const subPath = path.join(entryPath, sub);
                                                    try {
                                                        const subStat = await fs.stat(subPath);
                                                        if (subStat.isDirectory()) {
                                                            candidateRoots.push({ path: subPath, subCategory: subLower, tool: entryLower });
                                                        } else {
                                                            candidateRoots.push({ path: entryPath, subCategory: entryLower, isDirectFile: true, fileName: sub });
                                                        }
                                                    } catch(e) {}
                                                }
                                            } else {
                                                candidateRoots.push({ path: entryPath, subCategory: entryLower, tool: 'direct' });
                                            }
                                        }

                                        for (const cRoot of candidateRoots) {
                                            if (cRoot.isDirectFile) {
                                                const vFile = extractVersion(cRoot.fileName);
                                                if (vFile) {
                                                    const fLower = cRoot.fileName.toLowerCase();
                                                    const isMov = fLower.endsWith('.mov') || fLower.endsWith('.mp4');
                                                    const isTcl = cRoot.subCategory.includes('prerender') || fLower.includes('prerender');
                                                    const badFiles = [];
                                                    if (!isTcl) {
                                                        const hasShot = fLower.includes(shot.toLowerCase());
                                                        const hasVer = fLower.includes(vFile.str.toLowerCase());
                                                        if (!hasShot || !hasVer) badFiles.push(cRoot.fileName);
                                                    }
                                                    foundRenders.push({
                                                        type: isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres'),
                                                        folderName: cRoot.subCategory,
                                                        versionStr: vFile.str,
                                                        versionNum: vFile.num,
                                                        path: path.join(cRoot.path, cRoot.fileName).replace(/\\/g, '/'),
                                                        frameCount: 1,
                                                        hasBadNaming: badFiles.length > 0,
                                                        badFiles,
                                                        sequenceIntegrity: null
                                                    });
                                                }
                                                continue;
                                            }

                                            const deepItems = await fs.readdir(cRoot.path);
                                            for (const deepItem of deepItems) {
                                                if (deepItem.startsWith('.')) continue;
                                                const deepPath = path.join(cRoot.path, deepItem);
                                                let deepStat;
                                                try {
                                                    deepStat = await fs.stat(deepPath);
                                                } catch(e) { continue; }

                                                const deepLower = deepItem.toLowerCase();
                                                const vFolder = extractVersion(deepItem);

                                                if (deepStat.isDirectory() && vFolder) {
                                                    let frameFiles = (await fs.readdir(deepPath)).filter(f => !f.startsWith('.'));
                                                    const isMov = cRoot.subCategory.includes('mov') || deepLower.includes('mov') || deepLower.includes('compres') || deepLower.includes('mp4');
                                                    const isTcl = cRoot.subCategory.includes('prerender') || deepLower.includes('prerender');
                                                    const rType = isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres');

                                                    // Inspect if there is a resolution subfolder (e.g. 4608x3164, 3840x2160, 1920x1080)
                                                    let inspectedPath = deepPath;
                                                    const resCandidate = frameFiles.find(f => /^\d{3,5}x\d{3,5}$/i.test(f));
                                                    if (resCandidate) {
                                                        try {
                                                            const subResPath = path.join(deepPath, resCandidate);
                                                            const subStat = await fs.stat(subResPath);
                                                            if (subStat.isDirectory()) {
                                                                const subFrames = (await fs.readdir(subResPath)).filter(f => !f.startsWith('.'));
                                                                if (subFrames.length > 0) {
                                                                    frameFiles = subFrames;
                                                                    inspectedPath = subResPath;
                                                                }
                                                            }
                                                        } catch(e) {}
                                                    }

                                                    // Exclude resolution directory names and system files from frame analysis
                                                    const actualFrames = frameFiles.filter(f => {
                                                        if (/^\d{3,5}x\d{3,5}$/i.test(f)) return false;
                                                        if (f.toLowerCase() === 'thumbs.db' || f.startsWith('.')) return false;
                                                        return true;
                                                    });

                                                    // If an empty directory has NO media frames, it is NOT an existing render!
                                                    if (actualFrames.length === 0) continue;

                                                    const MEDIA_EXTS = new Set(['.exr', '.dpx', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.mov', '.mp4']);
                                                    const hasValidMedia = actualFrames.some(f => MEDIA_EXTS.has(path.extname(f).toLowerCase()));
                                                    if (!hasValidMedia) continue;

                                                    const badFiles = [];
                                                    if (!isTcl && actualFrames.length > 0) {
                                                        for (const ff of actualFrames) {
                                                            if (/^\d{3,5}x\d{3,5}$/i.test(ff)) continue;
                                                            const ffLower = ff.toLowerCase();
                                                            const hasShot = ffLower.includes(shot.toLowerCase());
                                                            const hasVer = ffLower.includes(vFolder.str.toLowerCase());
                                                            if (!hasShot || !hasVer) badFiles.push(ff);
                                                        }
                                                    }

                                                    // Deep Compare sequence integrity check (detect missing frame gaps and 0-byte frames)
                                                    let sequenceIntegrity = null;
                                                    if (!isMov && actualFrames.length > 0) {
                                                        const frameNumbers = [];
                                                        let zeroByteCount = 0;
                                                        for (const ff of actualFrames) {
                                                            if (config.deepCompare) {
                                                                try {
                                                                    const fStat = await fs.stat(path.join(inspectedPath, ff));
                                                                    if (fStat.size === 0) zeroByteCount++;
                                                                } catch(e) {}
                                                            }
                                                            const m = ff.match(/[._-](\d{3,8})\./);
                                                            if (m) {
                                                                frameNumbers.push(parseInt(m[1], 10));
                                                            }
                                                        }
                                                        if (frameNumbers.length > 0) {
                                                            frameNumbers.sort((a, b) => a - b);
                                                            const minFrame = frameNumbers[0];
                                                            const maxFrame = frameNumbers[frameNumbers.length - 1];
                                                            const expectedCount = (maxFrame - minFrame + 1);
                                                            const numSet = new Set(frameNumbers);
                                                            const missingFrames = [];
                                                            if (config.deepCompare && frameNumbers.length < expectedCount) {
                                                                for (let f = minFrame; f <= maxFrame; f++) {
                                                                    if (!numSet.has(f)) {
                                                                        missingFrames.push(f);
                                                                        if (missingFrames.length >= 50) break;
                                                                    }
                                                                }
                                                            }
                                                            const isComplete = (frameNumbers.length === expectedCount) && (zeroByteCount === 0);
                                                            sequenceIntegrity = {
                                                                isComplete,
                                                                minFrame,
                                                                maxFrame,
                                                                expectedCount,
                                                                actualCount: actualFrames.length,
                                                                missingCount: Math.max(0, expectedCount - frameNumbers.length),
                                                                missingFrames,
                                                                zeroByteCount
                                                            };
                                                        }
                                                    }

                                                    const tmpFiles = actualFrames.filter(f => {
                                                        const fl = f.toLowerCase();
                                                        return fl.endsWith('.tmp') || fl.endsWith('.part') || fl.endsWith('.crdownload');
                                                    });
                                                    const hasOnlyTmpBadFiles = (badFiles.length > 0 && badFiles.every(f => {
                                                        const fl = f.toLowerCase();
                                                        return fl.endsWith('.tmp') || fl.endsWith('.part') || fl.endsWith('.crdownload');
                                                    }));

                                                    foundRenders.push({
                                                        type: rType,
                                                        folderName: deepItem,
                                                        versionStr: vFolder.str,
                                                        versionNum: vFolder.num,
                                                        path: inspectedPath.replace(/\\/g, '/'),
                                                        frameCount: actualFrames.length,
                                                        hasBadNaming: badFiles.length > 0,
                                                        badFiles,
                                                        tmpFiles,
                                                        hasTmpFiles: tmpFiles.length > 0,
                                                        hasOnlyTmpBadFiles,
                                                        sequenceIntegrity
                                                    });
                                                } else if (!deepStat.isDirectory()) {
                                                    const vFile = extractVersion(deepItem);
                                                    if (vFile) {
                                                        const isMov = deepLower.endsWith('.mov') || deepLower.endsWith('.mp4');
                                                        const isTcl = cRoot.subCategory.includes('prerender') || deepLower.includes('prerender');
                                                        const badFiles = [];
                                                        if (!isTcl) {
                                                            const hasShot = deepLower.includes(shot.toLowerCase());
                                                            const hasVer = deepLower.includes(vFile.str.toLowerCase());
                                                            if (!hasShot || !hasVer) badFiles.push(deepItem);
                                                        }
                                                        foundRenders.push({
                                                           type: isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres'),
                                                           folderName: cRoot.subCategory,
                                                           versionStr: vFile.str,
                                                           versionNum: vFile.num,
                                                           path: deepPath.replace(/\\/g, '/'),
                                                           frameCount: 1,
                                                           hasBadNaming: badFiles.length > 0,
                                                           badFiles,
                                                           sequenceIntegrity: null
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) { }
                                }
                                foundRenders.sort((a, b) => b.versionNum - a.versionNum);

                                let canonicalMediaPath = shotMediaPath;
                                const fullresCandidates = [
                                    path.join(shotMediaPath, 'nuke', 'fullres'),
                                    path.join(shotMediaPath, procName, 'fullres'),
                                    path.join(shotMediaPath, 'nuke'),
                                    path.join(shotMediaPath, procName)
                                ];
                                for (const cand of fullresCandidates) {
                                    if (await fs.pathExists(cand)) {
                                        canonicalMediaPath = cand;
                                        break;
                                    }
                                }

                                const shotRecord = {
                                    key: `${ep}/${seq}/${shot}/${procName}`,
                                    ep,
                                    seq,
                                    shot,
                                    process: procName,
                                    expectedExt: procExtMap[procName] || '.nk',
                                    scriptCount: scriptFiles.length,
                                    scriptFiles: scriptFiles,
                                    badScriptFiles: badScriptFiles,
                                    latestScriptVer: latestScript ? latestScript.str : null,
                                    latestScriptNum: latestScript ? latestScript.num : null,
                                    latestScriptName: latestScript ? latestScript.name : null,
                                    scriptPath: procWorkPath,
                                    mediaPath: canonicalMediaPath.replace(/\\/g, '/'),
                                    renders: [],
                                    badFiles: [],
                                    sceneStatus: 'no-script',
                                    renderStatus: 'no-script',
                                    tmpFiles: [],
                                    hasTmpFiles: false,
                                    hasOnlyTmpBadFiles: false,
                                    sequenceIssue: null,
                                    driveDiff: null
                                };

                                // 1. Scene Status
                                if (scriptFiles.length === 0) {
                                    shotRecord.sceneStatus = 'no-script';
                                } else if (badScriptFiles.length > 0) {
                                    shotRecord.sceneStatus = 'bad-naming';
                                } else {
                                    shotRecord.sceneStatus = 'has-scene';
                                }

                                // 2. Render Status
                                const targetRenders = foundRenders.filter(r => {
                                    if (r.type === 'fullres') return config.onlyFullRes !== false;
                                    if (r.type === 'mov') return !!config.includeMov;
                                    if (r.type === 'tcl') return !!config.checkTclExt;
                                    return true;
                                });

                                targetRenders.sort((a, b) => {
                                    if (b.versionNum !== a.versionNum) return b.versionNum - a.versionNum;
                                    const typeOrder = { fullres: 1, mov: 2, tcl: 3 };
                                    return (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9);
                                });

                                shotRecord.renders = targetRenders;

                                const matchingRender = targetRenders.find(r => latestScript && r.versionNum === latestScript.num);
                                const highestRender = targetRenders[0] || null;

                                if (matchingRender && matchingRender.sequenceIntegrity && !matchingRender.sequenceIntegrity.isComplete) {
                                    shotRecord.sequenceIssue = matchingRender.sequenceIntegrity;
                                } else if (highestRender && highestRender.sequenceIntegrity && !highestRender.sequenceIntegrity.isComplete) {
                                    shotRecord.sequenceIssue = highestRender.sequenceIntegrity;
                                }

                                if (!latestScript) {
                                    if (highestRender) {
                                        shotRecord.renderStatus = 'orphan-render';
                                    } else {
                                        shotRecord.renderStatus = 'empty';
                                    }
                                } else {
                                    if (highestRender && highestRender.versionNum > latestScript.num) {
                                        shotRecord.renderStatus = 'orphan-render';
                                    } else if (matchingRender) {
                                        shotRecord.tmpFiles = matchingRender.tmpFiles || [];
                                        shotRecord.hasTmpFiles = !!(matchingRender.hasTmpFiles);
                                        shotRecord.hasOnlyTmpBadFiles = !!(matchingRender.hasOnlyTmpBadFiles);
                                        if (matchingRender.hasBadNaming) {
                                            shotRecord.renderStatus = 'bad-naming';
                                            shotRecord.badFiles = matchingRender.badFiles;
                                        } else {
                                            shotRecord.renderStatus = 'up-to-date';
                                        }
                                    } else if (highestRender && highestRender.versionNum < latestScript.num) {
                                        shotRecord.tmpFiles = highestRender.tmpFiles || [];
                                        shotRecord.hasTmpFiles = !!(highestRender.hasTmpFiles);
                                        shotRecord.hasOnlyTmpBadFiles = !!(highestRender.hasOnlyTmpBadFiles);
                                        if (highestRender.hasBadNaming) {
                                            shotRecord.renderStatus = 'bad-naming';
                                            shotRecord.badFiles = highestRender.badFiles;
                                        } else {
                                            shotRecord.renderStatus = 'outdated';
                                        }
                                    } else {
                                        if (config.omitV001 && latestScript.num <= 1) {
                                            shotRecord.renderStatus = 'empty';
                                        } else {
                                            shotRecord.renderStatus = 'missing-render';
                                        }
                                    }
                                }

                                // 3. Google Drive Cross-reference in Render scan
                                if (config.compareDrive && driveManifest) {
                                    const shotLow = shot.toLowerCase();
                                    const procLow = procName.toLowerCase();

                                    // Check scene versions in Drive Work
                                    const workCat = getDriveSubCatalog(ep, 'work');
                                    let driveLatestScriptNum = null;
                                    let driveLatestScriptVer = null;
                                    let driveLatestScriptName = null;
                                    if (workCat && Array.isArray(workCat.flatList)) {
                                        for (const it of workCat.flatList) {
                                            if (it.isDir || it.isDirectory) continue;
                                            const p = (it.relPath || it.path || '').toLowerCase();
                                            if (p.includes(`/${shotLow}/`) && (p.includes(`/${procLow}/`) || p.includes(`/${procLow}`))) {
                                                const ext = '.' + it.name.toLowerCase().split('.').pop();
                                                if (allowedExts.includes(ext)) {
                                                    const vInfo = extractVersion(it.name);
                                                    if (vInfo && (driveLatestScriptNum === null || vInfo.num > driveLatestScriptNum)) {
                                                        driveLatestScriptNum = vInfo.num;
                                                        driveLatestScriptVer = vInfo.str;
                                                        driveLatestScriptName = it.name;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Check render versions in Drive Media
                                    const mediaCat = getDriveSubCatalog(ep, 'media');
                                    let driveLatestRenderNum = null;
                                    let driveLatestRenderVer = null;
                                    let driveLatestRenderName = null;
                                    if (mediaCat && Array.isArray(mediaCat.flatList)) {
                                        for (const it of mediaCat.flatList) {
                                            const p = (it.relPath || it.path || '').toLowerCase();
                                            if (p.includes(`/${shotLow}/`)) {
                                                const vInfo = extractVersion(it.name);
                                                if (vInfo && (driveLatestRenderNum === null || vInfo.num > driveLatestRenderNum)) {
                                                    driveLatestRenderNum = vInfo.num;
                                                    driveLatestRenderVer = vInfo.str;
                                                    driveLatestRenderName = it.name;
                                                }
                                            }
                                        }
                                    }

                                    const localScriptNum = latestScript ? latestScript.num : null;
                                    const localRenderNum = highestRender ? highestRender.versionNum : null;

                                    shotRecord.driveDiff = {
                                        driveLatestScriptVer,
                                        driveLatestScriptNum,
                                        driveLatestScriptName,
                                        driveLatestRenderVer,
                                        driveLatestRenderNum,
                                        driveLatestRenderName,
                                        // Script comparison
                                        driveNewerScene: driveLatestScriptNum !== null && (localScriptNum === null || driveLatestScriptNum > localScriptNum),
                                        driveMissingScene: localScriptNum !== null && (driveLatestScriptNum === null || localScriptNum > driveLatestScriptNum),
                                        // Render comparison
                                        driveNewerRender: driveLatestRenderNum !== null && (localRenderNum === null || driveLatestRenderNum > localRenderNum),
                                        driveMissingRender: localRenderNum !== null && (driveLatestRenderNum === null || localRenderNum > driveLatestRenderNum)
                                    };
                                }

                                results.push(shotRecord);
                            }
                        }
                    }
                }
            }

            results.sort((a, b) => a.key.localeCompare(b.key));
            return res.json({ success: true, results, hasDriveCatalog: !!driveManifest });
        }
    } catch (err) {
        console.error("[AUDIT] Scan error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// --- AUDIT FIX: CLEAN TMP FILES IN RENDERS ---
app.post('/api/audit/clean-tmp', async (req, res) => {
    try {
        const { targets } = req.body || {};
        if (!targets || !Array.isArray(targets)) {
            return res.status(400).json({ error: 'Missing targets array' });
        }

        let deletedCount = 0;
        const deletedFiles = [];
        const errors = [];

        for (const t of targets) {
            const renders = Array.isArray(t.renders) && t.renders.length > 0 
                ? t.renders 
                : (t.path ? [{ path: t.path, tmpFiles: t.tmpFiles }] : []);

            for (const rnd of renders) {
                const dirPath = rnd.path;
                if (!dirPath || !(await fs.pathExists(dirPath))) continue;

                let filesToDelete = [];
                if (Array.isArray(rnd.tmpFiles) && rnd.tmpFiles.length > 0) {
                    filesToDelete = rnd.tmpFiles;
                } else {
                    const dirEntries = await fs.readdir(dirPath);
                    filesToDelete = dirEntries.filter(f => {
                        const fl = f.toLowerCase();
                        return fl.endsWith('.tmp') || fl.endsWith('.part') || fl.endsWith('.crdownload');
                    });
                }

                for (const tmpFile of filesToDelete) {
                    const fl = tmpFile.toLowerCase();
                    // STRICT SAFETY: NEVER delete frames (.exr, .dpx, .png, .jpg, .mov, etc.)
                    if (!fl.endsWith('.tmp') && !fl.endsWith('.part') && !fl.endsWith('.crdownload')) {
                        console.warn("[AUDIT CLEAN-TMP] Refusing to delete non-tmp file:", tmpFile);
                        continue;
                    }

                    const fullTmpPath = path.join(dirPath, tmpFile);
                    try {
                        if (await fs.pathExists(fullTmpPath)) {
                            await fs.unlink(fullTmpPath);
                            deletedCount++;
                            deletedFiles.push(fullTmpPath.replace(/\\/g, '/'));
                        }
                    } catch (e) {
                        console.error("[AUDIT CLEAN-TMP] Error unlinking:", fullTmpPath, e.message);
                        errors.push({ file: fullTmpPath, error: e.message });
                    }
                }
            }
        }

        res.json({ success: true, deletedCount, deletedFiles, errors });
    } catch (err) {
        console.error("[AUDIT] clean-tmp error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- APP CONTROL ---

app.post('/api/app/close', (req, res) => {
    console.log("[APP] Closing application via UI request...");
    res.json({ status: 'closing' });
    setTimeout(() => {
        process.exit(0);
    }, 500);
});

app.post('/api/app/restart', (req, res) => {
    console.log("[APP] Restarting application via UI request...");

    // Set Flag in TEMP directory (surviving Robocopy)
    try {
        const flagPath = path.join(os.tmpdir(), 'pipeta_restarting.flag');
        fs.writeFileSync(flagPath, 'true');
    } catch (e) { console.error("Failed to write restart flag:", e); }

    res.json({ status: 'restarting' });

    setTimeout(() => {
        try {
            if (global.serverInstance && global.serverInstance.close) {
                global.serverInstance.close();
            }
        } catch (e) { }

        if (process.env.PIPETA_SUPERVISED !== '1') {
            try {
                const isLocal = __dirname.toLowerCase().includes('c:\\tools\\apps\\pipeta');
                const baseDir = isLocal ? 'C:\\TOOLS\\APPS\\Pipeta' : path.join(__dirname, '..');
                const batName = fs.existsSync(path.join(baseDir, 'Launch_Pipeta.bat')) ? 'Launch_Pipeta.bat' : 'Iniciar_Pipeta.bat';
                const batPath = path.join(baseDir, batName);
                const { spawn } = require('child_process');
                spawn('cmd.exe', ['/c', 'start', '""', batPath], {
                    detached: true,
                    stdio: 'ignore'
                }).unref();
            } catch (e) { }
        }

        process.exit(42);
    }, 400);
});

// --- IA PIPELINE ENDPOINTS ---

app.get('/api/ia/drive-info', (req, res) => {
    try {
        const isNet = (typeof catalogGenerator.isZDriveNetwork === 'function')
            ? catalogGenerator.isZDriveNetwork()
            : true;
        const isVsubs = (process.platform === 'win32' && !isNet);
        const hasSmb = fs.existsSync('S:/') || fs.existsSync('//192.168.206.116/Z');
        res.json({
            isVsubs,
            isNetworkZ: isNet,
            hasSmbStorage: hasSmb
        });
    } catch (e) {
        res.json({ isVsubs: false, isNetworkZ: true, hasSmbStorage: false });
    }
});

app.get('/api/ia/catalog-hierarchy', (req, res) => {
    try {
        const projName = String(req.query.project || 'surf_love').replace(/^proj_/i, '').trim();
        const type = (req.query.type || 'episodes').trim(); // 'episodes' | 'scenes' | 'shots'
        const ep = (req.query.ep || '').trim();
        const seq = (req.query.seq || '').trim();

        function findServerCacheDir(pName) {
            const candidates = [
                path.join('C:/TOOLS/APPS/Pipeta/_SYNC_CACHE/projects', pName, 'server'),
                path.join('Z:/_SYNC_CACHE/projects', pName, 'server'),
                path.join('S:/_SYNC_CACHE/projects', pName, 'server'),
                path.join('//192.168.206.116/Z/_SYNC_CACHE/projects', pName, 'server')
            ];
            for (const c of candidates) {
                if (fs.existsSync(c)) return c;
            }
            return null;
        }

        const cacheDir = findServerCacheDir(projName);

        if (type === 'episodes') {
            let episodes = [];
            if (cacheDir) {
                const manifestPath = path.join(cacheDir, 'manifest.json');
                if (fs.existsSync(manifestPath)) {
                    try {
                        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                        episodes = Object.keys(manifest.subCatalogs || {})
                            .filter(k => k.startsWith('episodios/') && !k.includes('_root'))
                            .map(k => k.replace('episodios/', ''))
                            .filter(e => !['templates', 'VFX-Edits', 'XXX', 'Old'].includes(e));
                    } catch(e) {}
                }
            }
            if (episodes.length === 0) {
                const rootsToTry = ['S:/', '//192.168.206.116/Z/'];
                for (const r of rootsToTry) {
                    const epDir = path.join(r, projName, 'episodios');
                    if (fs.existsSync(epDir)) {
                        episodes = fs.readdirSync(epDir, { withFileTypes: true })
                            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
                            .map(d => d.name);
                        break;
                    }
                }
            }
            episodes.sort();
            return res.json({ project: projName, type, items: episodes });
        }

        if (type === 'scenes') {
            if (!ep) return res.status(400).json({ error: "ep parameter required" });
            let scenes = new Set();
            if (cacheDir) {
                const epFile = path.join(cacheDir, 'episodios', `${ep}.json`);
                if (fs.existsSync(epFile)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(epFile, 'utf8'));
                        for (const it of (data.flatList || [])) {
                            const rel = (it.relPath || '').replace(/\\/g, '/');
                            const mSeq = rel.match(new RegExp(`^episodios/${ep}/secuencias/([^/]+)`, 'i'));
                            if (mSeq) scenes.add(mSeq[1]);
                        }
                    } catch(e) {}
                }
            }
            if (scenes.size === 0) {
                const rootsToTry = ['S:/', '//192.168.206.116/Z/'];
                for (const r of rootsToTry) {
                    const seqDir = path.join(r, projName, 'episodios', ep, 'secuencias');
                    if (fs.existsSync(seqDir)) {
                        fs.readdirSync(seqDir, { withFileTypes: true })
                            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
                            .forEach(d => scenes.add(d.name));
                        break;
                    }
                }
            }
            return res.json({ project: projName, ep, type, items: Array.from(scenes).sort() });
        }

        if (type === 'shots') {
            if (!ep || !seq) return res.status(400).json({ error: "ep and seq parameters required" });
            let shots = new Set();
            if (cacheDir) {
                const epFile = path.join(cacheDir, 'episodios', `${ep}.json`);
                if (fs.existsSync(epFile)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(epFile, 'utf8'));
                        const prefix = `episodios/${ep}/secuencias/${seq}/`;
                        for (const it of (data.flatList || [])) {
                            const rel = (it.relPath || '').replace(/\\/g, '/');
                            if (rel.startsWith(prefix)) {
                                const sub = rel.substring(prefix.length);
                                const parts = sub.split('/');
                                let shotName = parts[0];
                                if (shotName.toLowerCase() === 'shots' && parts.length > 1) shotName = parts[1];
                                if (shotName && shotName.toLowerCase() !== 'shots' && !shotName.startsWith('.') && !shotName.startsWith('_')) {
                                    shots.add(shotName);
                                }
                            }
                        }
                    } catch(e) {}
                }
            }
            if (shots.size === 0) {
                const rootsToTry = ['S:/', '//192.168.206.116/Z/'];
                for (const r of rootsToTry) {
                    let shotDir = path.join(r, projName, 'episodios', ep, 'secuencias', seq, 'shots');
                    if (!fs.existsSync(shotDir)) {
                        shotDir = path.join(r, projName, 'episodios', ep, 'secuencias', seq);
                    }
                    if (fs.existsSync(shotDir)) {
                        fs.readdirSync(shotDir, { withFileTypes: true })
                            .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_') && d.name.toLowerCase() !== 'shots')
                            .forEach(d => shots.add(d.name));
                        break;
                    }
                }
            }
            return res.json({ project: projName, ep, seq, type, items: Array.from(shots).sort() });
        }

        return res.status(400).json({ error: "Invalid type. Must be episodes, scenes, or shots" });
    } catch(err) {
        console.error("Catalog hierarchy error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/ia/config', (req, res) => {
    res.json({
        motors: [
            { id: "SD2", label: "Seedance v2.0" },
            { id: "SD25", label: "Seedance v2.5" },
            { id: "VEO3", label: "Google Veo v3.0" },
            { id: "VO31", label: "Google Veo v3.1" },
            { id: "GOMN", label: "Gemini / Veo Omni Flash" },
            { id: "NBN2", label: "Nano Banana 2" },
            { id: "NB2P", label: "Nano Banana 2 Pro" }
        ],
        resolutions: ["FHD", "UHD", "HD", "SQ1K", "UW2K", "1080p16", "4k169", "1344x768", "1536x864", "2206x946"],
        framings: ["FLL", "CRP"],
        tags: {
            levelA: ["", "ref", "ref1050", "f1001", "start1001", "end1100"],
            levelB: ["", "inp", "ups", "mask", "clean", "elem"],
            levelC: ["", "t2i", "i2i", "t2v", "i2v", "v2v", "m2v"]
        }
    });
});

app.get('/api/ia/resolve-shot', (req, res) => {
    const shotId = (req.query.shotId || '').trim();
    const mediaRootParam = (req.query.mediaRoot || req.query.workRoot || '').trim();
    if (!shotId) return res.status(400).json({ error: "shotId parameter required" });

    const parts = shotId.split('_');
    let projCode = parts[0] || 'PROJ';
    let ep = parts[1] || 'B01';
    let seq = parts[2] || '001';
    let shotNum = parts[3] || '0100';

    let rootPath = mediaRootParam || "Z:/INTERNO/MEDIA/";
    if (!mediaRootParam) {
        try {
            const configPath = path.join(__dirname, '../pipeline_config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.paths && config.paths.root_media) {
                    rootPath = config.paths.root_media;
                } else if (config.paths && config.paths.root_work) {
                    rootPath = config.paths.root_work;
                }
            }
        } catch(e) {}
    }

    let candidate1 = path.normalize(path.join(rootPath, 'episodios', ep, 'secuencias', seq, 'shots', shotId, 'IA')).replace(/\\/g, '/');
    let candidate2 = path.normalize(path.join(rootPath, ep, seq, shotId, 'IA')).replace(/\\/g, '/');
    let candidate3 = path.normalize(path.join(rootPath, 'episodios', ep, 'secuencias', seq, 'shots', shotId)).replace(/\\/g, '/');
    let candidate4 = path.normalize(path.join(rootPath, ep, seq, shotId)).replace(/\\/g, '/');

    let resolvedIaPath = candidate1;
    if (fs.existsSync(candidate1)) resolvedIaPath = candidate1;
    else if (fs.existsSync(candidate2)) resolvedIaPath = candidate2;
    else if (fs.existsSync(candidate3)) resolvedIaPath = candidate1;
    else if (fs.existsSync(candidate4)) resolvedIaPath = candidate2;
    else if (fs.existsSync(path.join(rootPath, ep))) resolvedIaPath = candidate2;
    else resolvedIaPath = candidate1;

    let nextVersion = 'v001';
    let maxVer = 0;
    if (fs.existsSync(resolvedIaPath)) {
        try {
            const files = fs.readdirSync(resolvedIaPath);
            files.forEach(f => {
                const match = f.match(/_v(\d{3,4})\./i);
                if (match) {
                    const verNum = parseInt(match[1], 10);
                    if (verNum > maxVer) maxVer = verNum;
                }
            });
            nextVersion = 'v' + String(maxVer + 1).padStart(3, '0');
        } catch(e){}
    }

    res.json({
        shotId,
        projCode,
        ep,
        seq,
        shotNum,
        iaPath: resolvedIaPath,
        exists: fs.existsSync(resolvedIaPath),
        suggestedVersion: nextVersion
    });
});

app.post('/api/ia/ingest', (req, res) => {
    try {
        const { targetFolder, filename, sourcePath, fileData } = req.body;
        if (!targetFolder || !filename) {
            return res.status(400).json({ error: "targetFolder and filename are required" });
        }

        if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
        }

        const destFilePath = path.join(targetFolder, filename);

        if (sourcePath && fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destFilePath);
        } else if (fileData) {
            const buffer = Buffer.from(fileData, 'base64');
            if (buffer.length === 0) {
                return res.status(400).json({ error: "El archivo recibido está vacío (0 bytes)." });
            }
            fs.writeFileSync(destFilePath, buffer);
        } else {
            return res.status(400).json({ error: "No se encontró la ruta en disco ni se recibieron datos del archivo." });
        }

        const stats = fs.statSync(destFilePath);
        console.log(`[IA INGEST] Saved: ${destFilePath} (${stats.size} bytes)`);
        res.json({
            success: true,
            destination: destFilePath,
            filename: filename,
            size: stats.size
        });
    } catch (err) {
        console.error("Ingest Error:", err);
        res.status(500).json({ error: "Failed to ingest file", details: err.message });
    }
});

app.get('/api/ia/open-folder', (req, res) => {
    const folderPath = (req.query.folderPath || '').trim();
    if (!folderPath) return res.status(400).json({ error: "folderPath required" });

    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        const { exec } = require('child_process');
        const normPath = path.normalize(folderPath);
        exec(`explorer "${normPath}"`);
        res.json({ success: true, opened: normPath });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.all('/api/ia/open-file', (req, res) => {
    let filePath = (req.query.filePath || req.body?.filePath || '').trim();
    const fileData = req.body?.fileData;
    const filename = req.body?.filename || path.basename(filePath) || 'preview.mp4';

    try {
        if ((!filePath || !fs.existsSync(filePath)) && fileData) {
            const tempDir = path.join(os.tmpdir(), 'pipeta_previews');
            fs.ensureDirSync(tempDir);
            filePath = path.join(tempDir, filename);
            const buffer = Buffer.from(fileData, 'base64');
            fs.writeFileSync(filePath, buffer);
        }

        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: "Archivo no encontrado en disco ni datos recibidos." });
        }

        const { exec } = require('child_process');
        const normPath = path.normalize(filePath);
        const psCmd = `powershell.exe -NoProfile -Command "Start-Process -FilePath '${normPath.replace(/'/g, "''")}'"`;
        exec(psCmd, (err) => {
            if (err) {
                exec(`cmd /c start "" "${normPath}"`);
            }
        });

        res.json({ success: true, opened: normPath });
    } catch(e) {
        console.error("open-file error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- HIGGSFIELD AI INTEGRATION ENDPOINTS ---
app.get('/api/higgsfield/status', (req, res) => {
    try {
        const creds = higgsfieldApi.getCredentials();
        res.json({
            success: true,
            hasCredentials: !!creds,
            workspaceId: creds ? creds.workspaceId : null,
            source: creds ? creds.source : null
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/higgsfield/job/:jobId', async (req, res) => {
    const jobId = req.params.jobId;

    // 1. Intentar resolver localmente (si tiene conexión a internet y credenciales locales)
    try {
        const details = await higgsfieldApi.fetchJobDetails(jobId);
        if (details && details.success) {
            return res.json(details);
        }
    } catch (localErr) {
        console.warn(`[HIGGSFIELD API] Consulta local falló (${localErr.message}). Delegando consulta al Worker central...`);
    }

    // 2. Fallback de red: delegar consulta al Worker central (para PCs de artistas sin salida a internet)
    try {
        const reqId = `hf_query_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const orderData = {
            id: reqId,
            type: 'query_higgsfield_job',
            jobId,
            status: 'pending',
            user: (os.userInfo ? os.userInfo().username : 'unknown'),
            createdAt: new Date().toISOString()
        };

        const reqFile = saveOrderInCandidateDirs(reqId, orderData);
        ensureSyncWorkerRunning();

        // Esperar respuesta del Worker (polling hasta 20 segundos)
        const waitStart = Date.now();
        while (Date.now() - waitStart < 20000) {
            await new Promise(r => setTimeout(r, 400));
            if (fs.existsSync(reqFile)) {
                try {
                    const data = fs.readJsonSync(reqFile);
                    if (data.status === 'completed' && data.result) {
                        try { fs.removeSync(reqFile); } catch(e){}
                        return res.json(data.result);
                    }
                    if (data.status === 'failed') {
                        try { fs.removeSync(reqFile); } catch(e){}
                        return res.status(500).json({ success: false, error: data.error || 'Fallo en Worker' });
                    }
                } catch(e){}
            }
        }

        try { fs.removeSync(reqFile); } catch(e){}
        return res.status(504).json({ success: false, error: 'Tiempo de espera agotado al consultar Worker para Higgsfield' });
    } catch (err) {
        console.error("[HIGGSFIELD API] Error delegando consulta al Worker:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/higgsfield/ingest', async (req, res) => {
    try {
        const {
            executor = 'local',
            items,
            project,
            user,
            ...singleItem
        } = req.body;

        const itemList = Array.isArray(items) && items.length > 0 ? items : [singleItem];

        if (executor === 'worker') {
            const orderId = `hf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const priority = Math.min(100, Math.max(1, Number(req.body.priority) || 80));
            const orderData = {
                id: orderId,
                type: 'higgsfield_ingest',
                project: project || 'STUDIO',
                user: user || (os.userInfo ? os.userInfo().username : 'unknown'),
                createdAt: new Date().toISOString(),
                status: 'pending',
                priority,
                items: itemList
            };

            const savedPath = saveOrderInCandidateDirs(orderId, orderData);
            console.log(`[HIGGSFIELD WORKER] Orden de ingesta encolada para Worker: ${orderId} (${itemList.length} items) [Prioridad: ${priority}]`);
            ensureSyncWorkerRunning();
            return res.json({ success: true, executor: 'worker', orderId, count: itemList.length, status: 'pending', priority });
        } else {
            console.log(`[HIGGSFIELD LOCAL] Procesando ingesta local de ${itemList.length} items...`);
            const results = [];
            for (const item of itemList) {
                const resIngest = await higgsfieldApi.processHiggsfieldIngest({
                    ...item,
                    userName: user || (os.userInfo ? os.userInfo().username : 'Pipeta')
                });
                results.push(resIngest);
            }
            const firstTarget = (results.length > 0 && results[0].targetFile) ? results[0].targetFile : null;
            return res.json({ 
                success: true, 
                executor: 'local', 
                results, 
                targetFile: firstTarget,
                count: results.length 
            });
        }
    } catch (err) {
        console.error("[HIGGSFIELD INGEST] Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const CUSTOM_TOKENS_FILE = path.join(__dirname, '../presets/ia_custom_tokens.json');

app.get('/api/ia/custom-tokens', (req, res) => {
    try {
        if (fs.existsSync(CUSTOM_TOKENS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CUSTOM_TOKENS_FILE, 'utf8'));
            return res.json(data);
        }
        res.json({ motors: [], resolutions: [], framings: [], tagsA: [], tagsB: [], tagsC: [] });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ia/save-custom-tokens', (req, res) => {
    try {
        const { motors, resolutions, framings, tagsA, tagsB, tagsC } = req.body;
        let existing = { motors: [], resolutions: [], framings: [], tagsA: [], tagsB: [], tagsC: [] };
        if (fs.existsSync(CUSTOM_TOKENS_FILE)) {
            try { existing = JSON.parse(fs.readFileSync(CUSTOM_TOKENS_FILE, 'utf8')); } catch(err){}
        }

        const mergeArrays = (arr1 = [], arr2 = []) => Array.from(new Set([...arr1, ...arr2])).filter(Boolean);

        const updated = {
            motors: mergeArrays(existing.motors, motors),
            resolutions: mergeArrays(existing.resolutions, resolutions),
            framings: mergeArrays(existing.framings, framings),
            tagsA: mergeArrays(existing.tagsA, tagsA),
            tagsB: mergeArrays(existing.tagsB, tagsB),
            tagsC: mergeArrays(existing.tagsC, tagsC)
        };

        const presetsDir = path.join(__dirname, '../presets');
        if (!fs.existsSync(presetsDir)) fs.mkdirSync(presetsDir, { recursive: true });

        fs.writeFileSync(CUSTOM_TOKENS_FILE, JSON.stringify(updated, null, 2), 'utf8');

        const zPresetsDir = 'Z:/INTERNO/TOOLS/GITHUB/TOOLS/APPS/Pipeta/presets';
        if (fs.existsSync(zPresetsDir)) {
            try { fs.writeFileSync(path.join(zPresetsDir, 'ia_custom_tokens.json'), JSON.stringify(updated, null, 2), 'utf8'); } catch(e){}
        }

        res.json({ success: true, tokens: updated });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// --- CHROME & EDGE DOWNLOAD WATCHER (Autodetección + Redirección a Downloads/IA) ---
let downloadWatcherActive = false;
let watchedDownloads = [];
let lastKnownFiles = new Set();
let activeWatchFolder = '';

const userHome = process.env.USERPROFILE || 'C:\\Users\\' + (process.env.USERNAME || 'Default');
const defaultIaDownloadsFolder = path.join(userHome, 'Downloads', 'IA');
const fallbackChromeDownloadsFolder = path.join(userHome, 'Downloads');

function getBrowserPreferenceFiles() {
    const localAppData = process.env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local');
    const prefFiles = [];
    ['Google/Chrome/User Data', 'Microsoft/Edge/User Data'].forEach(bRel => {
        const bDir = path.join(localAppData, bRel);
        if (fs.existsSync(bDir)) {
            try {
                fs.readdirSync(bDir).forEach(d => {
                    const pFile = path.join(bDir, d, 'Preferences');
                    if (fs.existsSync(pFile)) prefFiles.push(pFile);
                });
            } catch(e){}
        }
    });
    return prefFiles;
}

function autoDetectChromeDownloadFolder() {
    const prefFiles = getBrowserPreferenceFiles();
    for (const pFile of prefFiles) {
        try {
            const content = JSON.parse(fs.readFileSync(pFile, 'utf8'));
            if (content.download && content.download.default_directory) {
                const dir = content.download.default_directory;
                if (fs.existsSync(dir)) return dir;
            }
        } catch(e){}
    }

    if (!fs.existsSync(defaultIaDownloadsFolder)) {
        try { fs.mkdirSync(defaultIaDownloadsFolder, { recursive: true }); } catch(e){}
    }
    return fs.existsSync(defaultIaDownloadsFolder) ? defaultIaDownloadsFolder : fallbackChromeDownloadsFolder;
}

function scanChromeDownloadsFolder() {
    const targetFolders = [defaultIaDownloadsFolder, fallbackChromeDownloadsFolder];
    if (activeWatchFolder && !targetFolders.includes(activeWatchFolder)) {
        targetFolders.push(activeWatchFolder);
    }

    targetFolders.forEach(folder => {
        if (!fs.existsSync(folder)) return;
        try {
            const files = fs.readdirSync(folder);
            files.forEach(fileName => {
                if (fileName.endsWith('.crdownload') || fileName.endsWith('.tmp')) return;
                const ext = path.extname(fileName).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.mp4', '.webp', '.mov'].includes(ext)) {
                    const fullPath = path.join(folder, fileName);
                    if (!lastKnownFiles.has(fullPath)) {
                        lastKnownFiles.add(fullPath);
                        const stats = fs.statSync(fullPath);
                        const fileObj = {
                            name: fileName,
                            path: fullPath,
                            ext: ext,
                            mtime: stats.mtimeMs
                        };
                        watchedDownloads.push(fileObj);
                        console.log(`[DOWNLOAD WATCHER] New download captured from ${folder}: ${fullPath}`);
                    }
                }
            });
        } catch(e) {
            console.error("Download watcher scan error:", e);
        }
    });
}

let watcherInterval = null;

app.get('/api/ia/start-download-watcher', (req, res) => {
    activeWatchFolder = autoDetectChromeDownloadFolder();

    lastKnownFiles.clear();
    [defaultIaDownloadsFolder, fallbackChromeDownloadsFolder, activeWatchFolder].forEach(folder => {
        if (folder && fs.existsSync(folder)) {
            try {
                fs.readdirSync(folder).forEach(f => {
                    lastKnownFiles.add(path.join(folder, f));
                });
            } catch(e){}
        }
    });

    downloadWatcherActive = true;
    if (!watcherInterval) {
        watcherInterval = setInterval(scanChromeDownloadsFolder, 1500);
    }
    res.json({ success: true, active: true, folder: activeWatchFolder });
});

app.get('/api/ia/stop-download-watcher', (req, res) => {
    downloadWatcherActive = false;
    if (watcherInterval) {
        clearInterval(watcherInterval);
        watcherInterval = null;
    }
    res.json({ success: true, active: false });
});

app.get('/api/ia/watcher-poll', (req, res) => {
    const pending = [...watchedDownloads];
    watchedDownloads = [];
    res.json({ active: downloadWatcherActive, files: pending, folder: activeWatchFolder });
});

app.get('/api/ia/open-chrome-settings', (req, res) => {
    try {
        const { exec } = require('child_process');
        exec(`powershell -Command "Start-Process 'chrome.exe' 'chrome://settings/downloads'"`);
        res.json({ success: true, opened: 'chrome://settings/downloads' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/ia/file-preview', (req, res) => {
    const filePath = (req.query.path || '').trim();
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    res.sendFile(path.resolve(filePath));
});

// ==========================================
// --- RAMON (TACTIC) INTEGRATION API ---
// ==========================================
const RAMON_CLIENT_SCRIPT = path.join(__dirname, 'helpers/ramon_client.py');

let detectedPythonBin = null;

function getPythonExecutable() {
    if (detectedPythonBin && (detectedPythonBin === 'python' || fs.existsSync(detectedPythonBin))) {
        return detectedPythonBin;
    }

    const candidates = [
        path.join(__dirname, '../bin/python/python.exe'),
        'C:\\TOOLS\\APPS\\Pipeta\\bin\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\_DEPOT\\runtimes\\python\\python.exe',
        '\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\_DEPOT\\runtimes\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\bin\\python\\python.exe',
        '\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\bin\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\GITHUB\\dependencias\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\Sammie-lasp\\python\\python.exe',
        'C:\\TOOLS\\Sammie-lasp\\python\\python.exe',
        // Fallback solo para entorno de desarrollo LASP-VM si existe S:
        'C:\\Python39\\python.exe',
        'C:\\Python310\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python38\\python.exe',
        'C:\\Program Files\\Python39\\python.exe',
        'C:\\Program Files\\Python310\\python.exe',
        'C:\\Program Files\\Python311\\python.exe',
        'C:\\Program Files\\Python312\\python.exe',
        ...(process.env.LOCALAPPDATA ? [
            path.join(process.env.LOCALAPPDATA, 'Programs\\Python\\Python39\\python.exe'),
            path.join(process.env.LOCALAPPDATA, 'Programs\\Python\\Python310\\python.exe'),
            path.join(process.env.LOCALAPPDATA, 'Programs\\Python\\Python311\\python.exe'),
            path.join(process.env.LOCALAPPDATA, 'Programs\\Python\\Python312\\python.exe')
        ] : []),
        'py.exe'
    ];

    for (const cand of candidates) {
        if (cand.includes('\\') && !fs.existsSync(cand)) continue;
        try {
            const out = require('child_process').execSync(`"${cand}" -c "import sys; print(sys.version_info[0])"`, {
                timeout: 5000,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            }).toString().trim();
            if (out === '3' || out === '2') {
                console.log(`[RAMON] Intérprete Python verificado con éxito: ${cand}`);
                detectedPythonBin = cand;
                return detectedPythonBin;
            }
        } catch(e) {}
    }

    detectedPythonBin = 'python';
    return detectedPythonBin;
}

function runRamonBridge(args, timeoutMs = 30000) {
    return new Promise((resolve) => {
        const pyBin = getPythonExecutable();
        const pyProc = spawn(pyBin, [RAMON_CLIENT_SCRIPT, ...args], {
            windowsHide: true,
            timeout: timeoutMs
        });

        let stdout = '';
        let stderr = '';

        pyProc.stdout.on('data', (data) => {
            stdout += data.toString('utf8');
        });

        pyProc.stderr.on('data', (data) => {
            stderr += data.toString('utf8');
        });

        pyProc.on('close', (code) => {
            if (code !== 0 && !stdout.trim()) {
                let errMsg = stderr.trim();
                if (!errMsg) {
                    if (code === null) {
                        errMsg = `Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s) al comunicar con el servidor de Ramón. Verifica la conexión a la red o internet.`;
                    } else {
                        errMsg = `Proceso Ramón salió con código ${code}`;
                    }
                }
                if (errMsg.includes('Microsoft Store') || errMsg.includes('No se encontró Python') || errMsg.includes('No se encontr')) {
                    detectedPythonBin = null;
                    errMsg = "No se encontró un intérprete de Python en el equipo ni en la red (Z:). Asegúrate de tener acceso a Z:\\INTERNO\\TOOLS\\... o sincronizar Pipeta desde la red.";
                }
                return resolve({ success: false, error: errMsg });
            }
            try {
                const parsed = JSON.parse(stdout.trim());
                resolve(parsed);
            } catch (e) {
                resolve({ success: false, error: `Respuesta inválida de Ramón: ${stdout || stderr}` });
            }
        });

        pyProc.on('error', (err) => {
            detectedPythonBin = null;
            resolve({ success: false, error: `Error ejecutando Python para Ramón (${pyBin}): ${err.message}` });
        });
    });
}

app.get('/api/ramon/status', async (req, res) => {
    try {
        const result = await runRamonBridge(['ping'], 12000);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/ramon/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: "Usuario y contraseña requeridos" });
        }

        const authResult = await runRamonBridge(['login', username, password], 25000);
        if (!authResult.success) {
            return res.status(401).json(authResult);
        }

        // Si autentico con exito en Ramon, asegurar/vincular el usuario en users_config.json
        try {
            if (fs.existsSync(USERS_CONFIG_FILE)) {
                const uData = await fs.readJson(USERS_CONFIG_FILE);
                const shouldAutoRegister = typeof uData.autoRegisterRamonUsers !== 'undefined' ? !!uData.autoRegisterRamonUsers : true;
                const defaultRole = uData.defaultRamonRole || "user";
                uData.users = uData.users || [];
                let existing = uData.users.find(u => u.laspUser === username || u.username === username);
                const isLocalSystemUser = username === 'admin' || (existing && (existing.id === 'u_admin' || existing.username === 'admin' || existing.isSystem));
                if (!existing && shouldAutoRegister) {
                    if (!isLocalSystemUser) {
                        existing = {
                            id: `u_ramon_${username}`,
                            username: username,
                            firstName: authResult.user.first_name || "",
                            lastName: authResult.user.last_name || "",
                            laspUser: username,
                            role: defaultRole,
                            email: authResult.user.email || "",
                            notes: "Sincronizado desde Ramon",
                            avatarColor: "#00bcd4",
                            isSystem: false,
                            authSource: "ramon"
                        };
                        uData.users.push(existing);
                    }
                } else if (existing && !isLocalSystemUser) {
                    existing.authSource = "ramon";
                    if (authResult.user.first_name) existing.firstName = authResult.user.first_name;
                    if (authResult.user.last_name) existing.lastName = authResult.user.last_name;
                    if (authResult.user.email && !existing.email) existing.email = authResult.user.email;
                }
                sanitizeUsersConfig(uData);
                uData.activeUser = username;
                await fs.writeJson(USERS_CONFIG_FILE, uData, { spaces: 2 });
            }
        } catch(syncErr) {
            console.warn("[RAMON] Error asociando usuario local:", syncErr);
        }

        if (authResult.server) {
            const isRemoteRamon = authResult.server.includes('8075') || authResult.server.includes('https://');
            if (cachedEnvState) {
                cachedEnvState.ramonHost = authResult.server;
                cachedEnvState.isExternalMachine = isRemoteRamon;
                cachedEnvState.isStudioNetwork = !isRemoteRamon;
            }
            global.isExternalMachine = isRemoteRamon;
            global.isStudioNetworkDetected = !isRemoteRamon;
        }

        res.json(authResult);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Cache en memoria para Ramón (persiste entre llamadas sin re-ejecutar Python innecesariamente)
const ramonTasksCache = new Map();
let ramonProjectsCache = null;

app.get('/api/ramon/tasks', async (req, res) => {
    try {
        const targetUser = (req.query.user || '').trim();
        const project = (req.query.project || '').trim();
        const force = req.query.force === 'true' || req.query.refresh === 'true';

        if (!targetUser) {
            return res.status(400).json({ success: false, error: "Parametro 'user' requerido" });
        }

        const cacheKey = `${targetUser.toLowerCase()}::${project.toLowerCase() || 'all'}`;

        // Si no se fuerza refresh y existe en cache, responder de inmediato
        if (!force && ramonTasksCache.has(cacheKey)) {
            const cached = ramonTasksCache.get(cacheKey);
            return res.json({ ...cached.data, cached: true, cachedAt: cached.cachedAt });
        }

        const args = ['tasks', targetUser];
        if (project) args.push(project);

        const result = await runRamonBridge(args, 35000);
        if (result && result.success) {
            ramonTasksCache.set(cacheKey, {
                cachedAt: new Date().toISOString(),
                data: result
            });
        }
        res.json({ ...result, cached: false });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Cache en memoria para tareas completas de proyectos en Ramón
const ramonProjectTasksCache = new Map();

app.get('/api/ramon/project-tasks', async (req, res) => {
    try {
        const project = (req.query.project || '').trim();
        const force = req.query.force === 'true' || req.query.refresh === 'true';

        if (!project) {
            return res.status(400).json({ success: false, error: "Parametro 'project' requerido" });
        }

        const cacheKey = project.toLowerCase();
        if (!force && ramonProjectTasksCache.has(cacheKey)) {
            const cached = ramonProjectTasksCache.get(cacheKey);
            return res.json({ ...cached.data, cached: true, cachedAt: cached.cachedAt });
        }

        const args = ['project_tasks', project];
        const result = await runRamonBridge(args, 45000);
        if (result && result.success) {
            ramonProjectTasksCache.set(cacheKey, {
                cachedAt: new Date().toISOString(),
                data: result
            });
        }
        res.json({ ...result, cached: false });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Invalida el caché de tareas (para forzar refresh cuando una tool lo requiera)
app.post('/api/ramon/tasks/invalidate', (req, res) => {
    try {
        const user = (req.body?.user || '').trim().toLowerCase();
        if (user) {
            for (const key of ramonTasksCache.keys()) {
                if (key.startsWith(`${user}::`)) {
                    ramonTasksCache.delete(key);
                }
            }
        } else {
            ramonTasksCache.clear();
        }
        ramonProjectTasksCache.clear();
        res.json({ success: true, message: "Cache de Ramon invalidado" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/ramon/projects', async (req, res) => {
    try {
        const force = req.query.force === 'true' || req.query.refresh === 'true';
        if (!force && ramonProjectsCache) {
            return res.json({ ...ramonProjectsCache.data, cached: true, cachedAt: ramonProjectsCache.cachedAt });
        }

        const result = await runRamonBridge(['projects'], 15000);
        if (result && result.success) {
            ramonProjectsCache = {
                cachedAt: new Date().toISOString(),
                data: result
            };
        }
        res.json({ ...result, cached: false });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fallback logic
app.get('*', (req, res) => {
    res.sendFile(path.join(uiPath, 'index.html'));
});

// Start Server with EADDRINUSE retry resilience
function startListening(retries = 10) {
    const server = app.listen(PORT, async () => {
        console.log(`Pipeta Core running at http://localhost:${PORT}`);
        console.log(`Version: ${VERSION}`);

        // Limpiar órdenes huérfanas locales dejadas en 'processing' por reinicio o cierre abrupto
        sanitizeZombieOrders();



        // Sincronizar configuraciones maestras y permisos de usuarios desde Pipeta Server al arrancar

        syncConfigsFromMasterNetwork().catch(() => {});

        // Sincronizar catálogo desde la red al disco local SSD al iniciar (solo del último proyecto activo)
        if (typeof catalogGenerator.syncLocalCacheFromNetwork === 'function') {
            try {
                let lastProj = null;
                const localFile = path.join(getLocalSyncCacheDir(), 'last_project.json');
                const netFile = 'Z:/_SYNC_CACHE/last_project.json';
                const target = fs.existsSync(localFile) ? localFile : (fs.existsSync(netFile) ? netFile : null);
                if (target) {
                    try {
                        const lpData = fs.readJsonSync(target);
                        lastProj = lpData.projectName || lpData.project || null;
                    } catch(e) {}
                }

                if (lastProj) {
                    console.log(`[BOOT] Sincronizando catálogo modular del último proyecto activo: ${lastProj}`);
                    catalogGenerator.syncLocalCacheFromNetwork(lastProj);
                } else {
                    console.log(`[BOOT] No hay último proyecto guardado. Esperando selección en UI para sincronizar.`);
                    catalogGenerator.syncLocalCacheFromNetwork(null);
                }
            } catch(e) {}
        }

        // Deteccion inteligente: esperar 2.2s para verificar si ya existe una pestaña viva de Pipeta
        setTimeout(async () => {
            const noBrowser = process.argv.includes('--no-browser') || process.argv.includes('--restart') || process.env.PIPETA_NO_BROWSER === '1';
            if (!noBrowser && !hasActiveBrowserClient) {
                console.log(`[BOOT] No se detectó pestaña de navegador previa activa. Abriendo http://localhost:${PORT}...`);
                try {
                    await open(`http://localhost:${PORT}`);
                } catch (e) {
                    try {
                        require('child_process').exec(`start "" "http://localhost:${PORT}"`);
                    } catch(err) {}
                }
            } else if (hasActiveBrowserClient) {
                console.log(`[BOOT] Pestaña de navegador existente detectada y reconectada. Omitiendo apertura de pestaña duplicada.`);
            }
        }, 2200);

        // Telemetria periodica hacia Pipeta Server (Mecanismo A)
        setTimeout(() => {
            sendClientTelemetryPing().catch(() => {});
        }, 1500);
        setInterval(() => {
            sendClientTelemetryPing().catch(() => {});
        }, 10000);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && retries > 0) {
            console.warn(`[SERVER] Puerto ${PORT} ocupado temporalmente. Reintentando en 400ms... (${retries} intentos restantes)`);
            setTimeout(() => {
                startListening(retries - 1);
            }, 400);
        } else {
            console.error("[SERVER] Error fatal al iniciar servidor:", err);
            process.exit(1);
        }
    });

    global.serverInstance = server;
    return server;
}

startListening();
