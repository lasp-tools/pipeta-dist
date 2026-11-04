const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { spawn, execSync, execFile } = require('child_process');
const catalogGenerator = require('../sync_catalog_generator');
const {
    VERSION,
    CHANNEL,
    APP_ROOT,
    SERVER_DIR,
    LOCAL_APP_DIR,
    LAUNCHER_BAT,
    RESTART_FLAG_FILE,
    PIPELINE_CONFIG_FILE,
    runtimeState
} = require('../core/app-context');
const { rcloneAvailable, rcloneVersion } = require('../core/rclone');
const { syncConfigsFromMasterNetwork } = require('../core/env-detector');
const { getLocalSyncCacheDir, getReadSyncCacheCandidateDirs } = require('../core/sync-paths');

const router = express.Router();

router.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        channel: CHANNEL,
        version: VERSION,
        uptime: process.uptime()
    });
});

router.post('/api/app/sync-configs', async (req, res) => {
    try {
        const ok = await syncConfigsFromMasterNetwork();
        res.json({ success: ok, lastConfigSync: runtimeState.lastConfigSyncTimestamp });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/version', (req, res) => {
    res.json({
        version: VERSION,
        channel: CHANNEL,
        serverBootTime: runtimeState.SERVER_BOOT_TIME,
        rclone: { available: rcloneAvailable, version: rcloneVersion }
    });
});

router.get('/api/system/info', (req, res) => {
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

router.get('/api/config', (req, res) => {
    try {
        const presetFallback = path.join(APP_ROOT, 'presets/pipeline_config.json');
        const configPath = fs.existsSync(PIPELINE_CONFIG_FILE) ? PIPELINE_CONFIG_FILE : presetFallback;
        if (fs.existsSync(configPath)) {
            res.json(JSON.parse(fs.readFileSync(configPath, 'utf8')));
        } else {
            res.status(404).json({ error: 'Config not found' });
        }
    } catch (err) {
        console.error('Config Error:', err);
        res.status(500).json({ error: 'Config Error' });
    }
});

router.get('/api/system/last-project', (req, res) => {
    try {
        let target = null;
        for (const dir of getReadSyncCacheCandidateDirs()) {
            const f = path.join(dir, 'last_project.json');
            if (fs.existsSync(f)) {
                target = f;
                break;
            }
        }
        if (!target && fs.existsSync('Z:/_SYNC_CACHE/last_project.json')) {
            target = 'Z:/_SYNC_CACHE/last_project.json';
        }
        if (target) {
            const data = fs.readJsonSync(target);
            return res.json({ success: true, lastProject: data.projectName || data.project || null });
        }
        res.json({ success: true, lastProject: null });
    } catch (e) {
        res.json({ success: true, lastProject: null });
    }
});

router.post('/api/system/last-project', (req, res) => {
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
            } catch (e) {}
        }

        setImmediate(() => {
            try {
                if (typeof catalogGenerator.syncLocalCacheFromNetwork === 'function') {
                    catalogGenerator.syncLocalCacheFromNetwork(projectName);
                }
            } catch (e) {}
        });

        res.json({ success: true, projectName });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/api/system/pickFolder', async (req, res) => {
    let initialPath = req.body?.initialPath || path.join(APP_ROOT, 'presets');
    initialPath = initialPath.replace(/\//g, '\\');

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

router.post('/api/system/pickFile', async (req, res) => {
    let initialPath = req.body?.initialPath || 'Z:\\';
    const filter = req.body?.filter || 'Archivos de Template (*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt)|*.nk;*.blend;*.hip;*.psd;*.aep;*.prproj;*.txt|Todos los archivos (*.*)|*.*';
    initialPath = initialPath.replace(/\//g, '\\');

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

router.get('/api/system/diskUsage', async (req, res) => {
    const drives = (req.query.drives || 'C').split(',').map(d => d.trim().toUpperCase().replace(':', ''));
    try {
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

router.post('/api/app/close', (req, res) => {
    console.log('[APP] Closing application via UI request...');
    res.json({ status: 'closing' });
    setTimeout(() => {
        process.exit(0);
    }, 500);
});

router.post('/api/app/restart', (req, res) => {
    console.log('[APP] Restarting application via UI request...');

    try {
        fs.writeFileSync(RESTART_FLAG_FILE, 'true');
    } catch (e) {
        console.error('Failed to write restart flag:', e);
    }

    res.json({ status: 'restarting' });

    setTimeout(() => {
        try {
            if (global.serverInstance && global.serverInstance.close) {
                global.serverInstance.close();
            }
        } catch (e) {}

        if (process.env.PIPETA_SUPERVISED !== '1') {
            try {
                const isLocal = SERVER_DIR.toLowerCase().includes(LOCAL_APP_DIR.toLowerCase());
                const baseDir = isLocal ? LOCAL_APP_DIR : APP_ROOT;
                const candidates = [LAUNCHER_BAT, 'Launch_Pipeta_Beta.bat', 'Launch_Pipeta.bat', 'Iniciar_Pipeta.bat'];
                const batName = candidates.find(b => fs.existsSync(path.join(baseDir, b))) || LAUNCHER_BAT;
                const batPath = path.join(baseDir, batName);
                spawn('cmd.exe', ['/c', 'start', '""', batPath], {
                    detached: true,
                    stdio: 'ignore'
                }).unref();
            } catch (e) {}
        }

        process.exit(42);
    }, 400);
});

module.exports = router;
