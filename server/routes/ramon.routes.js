const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { spawn, execSync } = require('child_process');
const {
    APP_ROOT,
    SERVER_DIR,
    LOCAL_APP_DIR,
    USERS_CONFIG_FILE,
    runtimeState
} = require('../core/app-context');
const {
    PIPETA_SERVER_TOKEN,
    getPipetaServerCandidateUrls,
    getCachedEnvState,
    sendClientTelemetryPing
} = require('../core/env-detector');
const { getLocalSyncCacheDir } = require('../core/sync-paths');
const { sanitizeUsersConfig } = require('./users-workflow.routes');

const router = express.Router();

// ==========================================
// --- RAMON (TACTIC) INTEGRATION API ---
// Strictly Read-Only (ping / login / tasks / project_tasks / projects)
// ==========================================
const RAMON_CLIENT_SCRIPT = path.join(SERVER_DIR, 'helpers/ramon_client.py');

let detectedPythonBin = null;

function getPythonExecutable() {
    if (detectedPythonBin && (detectedPythonBin === 'python' || fs.existsSync(detectedPythonBin))) {
        return detectedPythonBin;
    }

    const candidates = [
        path.join(APP_ROOT, 'bin/python/python.exe'),
        path.join(LOCAL_APP_DIR, 'bin/python/python.exe'),
        'C:\\TOOLS\\APPS\\Pipeta\\bin\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\_DEPOT\\runtimes\\python\\python.exe',
        '\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\_DEPOT\\runtimes\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\bin\\python\\python.exe',
        '\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\Pipeta\\bin\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\GITHUB\\dependencias\\python\\python.exe',
        'Z:\\INTERNO\\TOOLS\\Sammie-lasp\\python\\python.exe',
        'C:\\TOOLS\\Sammie-lasp\\python\\python.exe',
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
            const out = execSync(`"${cand}" -c "import sys; print(sys.version_info[0])"`, {
                timeout: 5000,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            }).toString().trim();
            if (out === '3' || out === '2') {
                console.log(`[RAMON] Intérprete Python verificado con éxito: ${cand}`);
                detectedPythonBin = cand;
                return detectedPythonBin;
            }
        } catch (e) {}
    }

    detectedPythonBin = 'python';
    return detectedPythonBin;
}

const ALLOWED_READONLY_RAMON_COMMANDS = new Set(['ping', 'login', 'tasks', 'project_tasks', 'projects']);

async function executeRamonViaCentralServer(args, timeoutMs = 25000) {
    const urls = getPipetaServerCandidateUrls();
    const perUrlTimeout = Math.min(timeoutMs, 8000);
    for (const baseUrl of urls) {
        try {
            const url = `${baseUrl.replace(/\/+$/, '')}/api/server/ramon/bridge`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-pipeta-token': PIPETA_SERVER_TOKEN
                },
                body: JSON.stringify({ args }),
                signal: AbortSignal.timeout(perUrlTimeout)
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data && typeof data === 'object') return data;
            }
        } catch (e) {}
    }
    return null;
}

async function runRamonBridge(args, timeoutMs = 30000) {
    const cmdName = Array.isArray(args) ? String(args[0] || '') : '';
    if (!ALLOWED_READONLY_RAMON_COMMANDS.has(cmdName)) {
        return { success: false, error: `Operación Ramón bloqueada por política de solo lectura: ${cmdName}` };
    }

    if (global.isExternalMachine) {
        try {
            const remoteResult = await executeRamonViaCentralServer(args, timeoutMs);
            if (remoteResult) {
                return remoteResult;
            }
        } catch (e) {}
        return {
            success: false,
            error: 'No se pudo comunicar con el servidor central de Pipeta / Ramon a traves del tunel seguro de LASP. Verifica tu conexion a internet o el estado del servidor.'
        };
    }

    const localResult = await new Promise((resolve) => {
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
                    errMsg = 'No se encontró un intérprete de Python en el equipo ni en la red (Z:). Asegúrate de tener acceso a Z:\\INTERNO\\TOOLS\\... o sincronizar Pipeta desde la red.';
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

    if (!localResult.success && (!localResult.error || localResult.error.includes('Tiempo de espera') || localResult.error.includes('No se encontró'))) {
        try {
            const remoteFallback = await executeRamonViaCentralServer(args, Math.min(timeoutMs, 15000));
            if (remoteFallback) return remoteFallback;
        } catch (e) {}
    }

    return localResult;
}

router.get('/api/ramon/status', async (req, res) => {
    try {
        const result = await runRamonBridge(['ping'], 12000);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/ramon/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
        }

        const authResult = await runRamonBridge(['login', username, password], 25000);
        if (!authResult.success) {
            return res.status(401).json(authResult);
        }

        try {
            if (fs.existsSync(USERS_CONFIG_FILE)) {
                const uData = await fs.readJson(USERS_CONFIG_FILE);
                const shouldAutoRegister = typeof uData.autoRegisterRamonUsers !== 'undefined' ? !!uData.autoRegisterRamonUsers : true;
                const defaultRole = uData.defaultRamonRole || 'user';
                uData.users = uData.users || [];
                let existing = uData.users.find(u => u.laspUser === username || u.username === username);
                const isLocalSystemUser = username === 'admin' || (existing && (existing.id === 'u_admin' || existing.username === 'admin' || existing.isSystem));
                if (!existing && shouldAutoRegister) {
                    if (!isLocalSystemUser) {
                        existing = {
                            id: `u_ramon_${username}`,
                            username,
                            firstName: authResult.user.first_name || '',
                            lastName: authResult.user.last_name || '',
                            laspUser: username,
                            role: defaultRole,
                            email: authResult.user.email || '',
                            notes: 'Sincronizado desde Ramon',
                            avatarColor: '#00bcd4',
                            isSystem: false,
                            authSource: 'ramon'
                        };
                        uData.users.push(existing);
                    }
                } else if (existing && !isLocalSystemUser) {
                    existing.authSource = 'ramon';
                    if (authResult.user.first_name) existing.firstName = authResult.user.first_name;
                    if (authResult.user.last_name) existing.lastName = authResult.user.last_name;
                    if (authResult.user.email && !existing.email) existing.email = authResult.user.email;
                }
                sanitizeUsersConfig(uData);
                uData.activeUser = username;
                await fs.writeJson(USERS_CONFIG_FILE, uData, { spaces: 2 });
            }
        } catch (syncErr) {
            console.warn('[RAMON] Error asociando usuario local:', syncErr);
        }

        const cachedEnvState = getCachedEnvState();
        if (authResult.server && cachedEnvState) {
            cachedEnvState.ramonHost = authResult.server;
            if (!global.isExternalMachine) {
                const isRemoteRamon = authResult.server.includes('8075') || authResult.server.includes('https://');
                cachedEnvState.isExternalMachine = isRemoteRamon;
                cachedEnvState.isStudioNetwork = !isRemoteRamon;
                global.isExternalMachine = isRemoteRamon;
                global.isStudioNetworkDetected = !isRemoteRamon;
            }
        }

        runtimeState.activeRamonUser = username;
        try {
            const lastUserFile = path.join(getLocalSyncCacheDir(), 'last_ramon_user.json');
            fs.writeJsonSync(lastUserFile, { user: runtimeState.activeRamonUser, updatedAt: new Date().toISOString() });
        } catch (e) {}
        sendClientTelemetryPing().catch(() => {});

        res.json(authResult);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const ramonTasksCache = new Map();
const ramonProjectTasksCache = new Map();
let ramonProjectsCache = null;

router.get('/api/ramon/tasks', async (req, res) => {
    try {
        const targetUser = (req.query.user || '').trim();
        const project = (req.query.project || '').trim();
        const force = req.query.force === 'true' || req.query.refresh === 'true';

        if (!targetUser) {
            return res.status(400).json({ success: false, error: "Parametro 'user' requerido" });
        }

        const cacheKey = `${targetUser.toLowerCase()}::${project.toLowerCase() || 'all'}`;

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

router.get('/api/ramon/project-tasks', async (req, res) => {
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

router.post('/api/ramon/tasks/invalidate', (req, res) => {
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
        res.json({ success: true, message: 'Cache de Ramon invalidado' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/ramon/projects', async (req, res) => {
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

module.exports = router;
