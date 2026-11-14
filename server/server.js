const VERSION = "v1.2.22";

const express = require('express');
const cors = require('cors');
const path = require('path');
const open = require('open');
const fs = require('fs-extra');

const {
    PORT,
    UI_PATH,
    RESTART_FLAG_FILE,
    APP_NAME,
    IS_BETA,
    runtimeState
} = require('./core/app-context');

const { initLogger } = require('./core/logger');
initLogger();

const {
    detectStudioNetworkSync,
    runEnvironmentDetection,
    syncConfigsFromMasterNetwork,
    sendClientTelemetryPing
} = require('./core/env-detector');

// Limpiar flag de reinicio
try {
    if (fs.existsSync(RESTART_FLAG_FILE)) {
        fs.removeSync(RESTART_FLAG_FILE);
    }
} catch (e) {}

// Deteccion rapida inicial de red
detectStudioNetworkSync();

const app = express();

// Middleware para detectar navegadores activos
app.use((req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('Mozilla') || ua.includes('Chrome') || ua.includes('Safari') || ua.includes('Edg')) {
        runtimeState.hasActiveBrowserClient = true;
    }
    next();
});

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Servir archivos estaticos de UI
app.use(express.static(UI_PATH));

// Montar Routers Modulares
app.use(require('./routes/logs.routes'));
app.use(require('./routes/system.routes'));
app.use(require('./routes/updater.routes'));
app.use(require('./routes/fs.routes'));
app.use(require('./routes/sync.routes'));
app.use(require('./routes/audit.routes'));
app.use(require('./routes/users-workflow.routes'));
app.use(require('./routes/ia.routes'));
app.use(require('./routes/ramon.routes'));

// SPA Fallback
app.get('*', (req, res) => {
    const indexPath = path.join(UI_PATH, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Pipeta UI not found');
    }
});

let serverInstance = null;

function startListening(retries = 10, currentPort = PORT) {
    return new Promise((resolve, reject) => {
        const srv = app.listen(currentPort, () => {
            serverInstance = srv;
            console.log(`====================================================`);
            console.log(`  ${APP_NAME} (${VERSION}) Servidor Iniciado`);
            console.log(`  Puerto: http://localhost:${currentPort}`);
            console.log(`  Canal:  ${IS_BETA ? 'BETA (Modular)' : 'STABLE'}`);
            console.log(`====================================================`);

            // Abrir navegador si no se pasa --no-browser
            const noBrowser = process.argv.includes('--no-browser') || process.env.PIPETA_NO_BROWSER === '1';
            if (!noBrowser && !process.argv.includes('--restart')) {
                setTimeout(async () => {
                    if (!runtimeState.hasActiveBrowserClient) {
                        try {
                            await open(`http://localhost:${currentPort}`);
                        } catch (err) {
                            console.log('[BROWSER] No se pudo abrir automaticamente:', err.message);
                        }
                    }
                }, 1000);
            }

            // Tareas en background
            setTimeout(() => {
                runEnvironmentDetection().catch(() => {});
                syncConfigsFromMasterNetwork({ silent: true }).catch(() => {});
                sendClientTelemetryPing().catch(() => {});
            }, 800);

            // Telemetria periodica cada 60s
            setInterval(() => {
                sendClientTelemetryPing().catch(() => {});
            }, 60000);

            resolve(srv);
        });

        srv.on('error', (err) => {
            if (err.code === 'EADDRINUSE' && retries > 0) {
                console.warn(`[SERVER] Puerto ${currentPort} en uso. Reintentando en 1s (${retries} restantes)...`);
                setTimeout(() => {
                    startListening(retries - 1, currentPort).then(resolve).catch(reject);
                }, 1000);
            } else {
                console.error('[SERVER ERROR]', err);
                reject(err);
            }
        });
    });
}

if (require.main === module) {
    startListening().catch(err => {
        console.error('[FATAL SERVER START ERROR]', err);
        process.exit(1);
    });
}

module.exports = {
    app,
    startListening,
    VERSION,
    PORT,
    getServerInstance: () => serverInstance
};
