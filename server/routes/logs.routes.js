const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { exec } = require('child_process');
const {
    VERSION,
    LOGS_DIR,
    REPORTS_DIR,
    runtimeState
} = require('../core/app-context');
const {
    getTodayLogPath,
    getTodayErrorLogPath,
    origConsoleError
} = require('../core/logger');
const { getLocalSyncCacheDir } = require('../core/sync-paths');
const { sendClientTelemetryPing } = require('../core/env-detector');

const router = express.Router();

router.post('/api/logs/append', (req, res) => {
    try {
        const { entries } = req.body;
        if (Array.isArray(entries) && entries.length > 0) {
            const todayLog = getTodayLogPath();
            const todayErrorLog = getTodayErrorLogPath();
            let chunkAll = '';
            let chunkErrors = '';

            for (const entry of entries) {
                const timeStr = entry.isoTime
                    ? entry.isoTime.replace('T', ' ').substring(0, 23)
                    : new Date().toISOString().replace('T', ' ').substring(0, 23);
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
        origConsoleError('[LOGS] Error appending logs:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/logs/open-folder', (req, res) => {
    try {
        fs.ensureDirSync(LOGS_DIR);
        exec(`explorer.exe "${LOGS_DIR.replace(/\//g, '\\\\')}"`);
        res.json({ success: true, path: LOGS_DIR });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/logs/open-reports-folder', (req, res) => {
    try {
        fs.ensureDirSync(REPORTS_DIR);
        exec(`explorer.exe "${REPORTS_DIR.replace(/\//g, '\\\\')}"`);
        res.json({ success: true, path: REPORTS_DIR });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/logs/open-errors-file', (req, res) => {
    try {
        const errorFile = getTodayErrorLogPath();
        if (!fs.existsSync(errorFile)) {
            fs.writeFileSync(errorFile, `[${new Date().toISOString()}] [SYSTEM/OK] No se registraron errores hoy.\n`, 'utf8');
        }
        exec(`notepad.exe "${errorFile.replace(/\//g, '\\\\')}"`);
        res.json({ success: true, path: errorFile });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/logs/generate-report', (req, res) => {
    try {
        const body = req.body || {};
        fs.ensureDirSync(REPORTS_DIR);

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const reportFileName = `reporte_${stamp}.txt`;
        const reportFilePath = path.join(REPORTS_DIR, reportFileName);

        const hostname = os.hostname();
        const user = process.env.USERNAME || process.env.USER || 'desconocido';

        const errorLogPath = getTodayErrorLogPath();
        let errorLines = [];
        if (fs.existsSync(errorLogPath)) {
            errorLines = fs.readFileSync(errorLogPath, 'utf8').split('\n').filter(Boolean);
        }

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

        try {
            exec(`explorer.exe /select,"${reportFilePath.replace(/\//g, '\\\\')}"`);
        } catch (e) {}

        res.json({
            success: true,
            filePath: reportFilePath,
            filename: reportFileName,
            content: reportText
        });
    } catch (err) {
        origConsoleError('[LOGS] Error generating report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/logs/export', (req, res) => {
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

router.get('/api/logs/recent', (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 100;
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

router.post('/api/telemetry/active-user', (req, res) => {
    try {
        const user = (req.body && req.body.user) ? String(req.body.user).trim() : '';
        runtimeState.activeRamonUser = user;
        try {
            const lastUserFile = path.join(getLocalSyncCacheDir(), 'last_ramon_user.json');
            fs.writeJsonSync(lastUserFile, { user: runtimeState.activeRamonUser, updatedAt: new Date().toISOString() });
        } catch (e) {}
        sendClientTelemetryPing().catch(() => {});
        res.json({ success: true, activeRamonUser: runtimeState.activeRamonUser });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
