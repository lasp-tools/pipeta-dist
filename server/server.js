const express = require('express');
const cors = require('cors');
const path = require('path');
const open = require('open');
const fs = require('fs-extra'); // Replaces 'fs' with 'fs-extra'

const app = express();
const PORT = 3002;
const VERSION = "v0.9.75";
const os = require('os'); // Added os module

// Restart Flag Check (Prevents duplicate tabs on reload)
// We use OS Temp dir because local files might be wiped by Robocopy /MIR from M: source
const RESTART_FLAG_FILE = path.join(os.tmpdir(), 'pipeta_restarting.flag');
let shouldOpenBrowser = true;

if (fs.existsSync(RESTART_FLAG_FILE)) {
    console.log("[INIT] Recovering from System Restart. Browser auto-open suppressed.");
    shouldOpenBrowser = false;
    try { fs.removeSync(RESTART_FLAG_FILE); } catch (e) { }
}

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

// --- API ENDPOINTS ---

app.get('/api/version', (req, res) => {
    res.json({
        version: VERSION,
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

app.get('/api/fs/list', (req, res) => {
    let requestedPath = req.query.path;

    try {
        let targetPath = null;

        if (requestedPath) {
            let safeP = decodeURIComponent(requestedPath);
            if (fs.existsSync(safeP)) {
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

        const items = fs.readdirSync(targetPath, { withFileTypes: true });
        const result = items.map(item => {
            const isDir = item.isDirectory();
            const fullItemPath = path.join(targetPath, item.name).replace(/\\/g, '/');
            let size = 0;
            if (!isDir) {
                try {
                    const st = fs.statSync(fullItemPath);
                    size = st.size;
                } catch(e) {}
            }
            return {
                name: item.name,
                isDirectory: isDir,
                path: fullItemPath,
                size: size
            };
        });

        result.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

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
    p = path.resolve(p.replace(/\//g, '\\'));

    let targetPath = p;
    let isFile = false;

    try {
        if (fs.existsSync(p)) {
            const stat = fs.statSync(p);
            isFile = stat.isFile();
        } else {
            // Si la ruta específica no existe aún, buscar la carpeta padre más cercana
            let current = path.dirname(p);
            while (current && current.length > 3 && !fs.existsSync(current)) {
                current = path.dirname(current);
            }
            if (fs.existsSync(current)) {
                targetPath = current;
                isFile = false;
            }
        }
    } catch (e) {
        console.warn("[FS_OPEN] Stat warning:", e.message);
    }

    try {
        const { spawn } = require('child_process');
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
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: "Missing paths" });
    try {
        await fs.rename(oldPath, newPath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/copy', async (req, res) => {
    const { src, dest } = req.body;
    if (!src || !dest) return res.status(400).json({ error: "Missing paths" });
    try {
        await fs.copy(src, dest);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
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

// --- PORTABLE PACKAGE EXPORTER (.ZIP + .BAT EXTRACTOR) ---
app.post('/api/system/package-dist', async (req, res) => {
    let targetDir = req.body?.targetDir || 'Z:\\INTERNO\\TOOLS\\Mati\\Propios\\Scripts';
    targetDir = targetDir.replace(/\//g, '\\');

    const pipetaRoot = path.resolve(__dirname, '..');
    const zipName = `Pipeta_${VERSION}.zip`;
    const destZip = path.join(targetDir, zipName);
    const destBat = path.join(targetDir, 'Instalar_o_Actualizar_Pipeta_Local.bat');

    const { exec } = require('child_process');

    const psScript = `
$source = "${pipetaRoot.replace(/\\/g, '\\\\')}"
$destDir = "${targetDir.replace(/\\/g, '\\\\')}"
$destZip = "${destZip.replace(/\\/g, '\\\\')}"
$destBat = "${destBat.replace(/\\/g, '\\\\')}"
$tempDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "Pipeta_Pkg_" + [System.Guid]::NewGuid().ToString())
$pkgRoot = [System.IO.Path]::Combine($tempDir, "Pipeta")

try {
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    New-Item -ItemType Directory -Path $pkgRoot -Force | Out-Null
    
    # 1. Copiar base completa de Pipeta hacia la subcarpeta 'Pipeta'
    robocopy "$source" "$pkgRoot" /MIR /XD .git .gemini logs node_modules\\.cache /XF *.zip *.log /NFL /NDL /NJH /NJS /R:0 /W:0
    
    # 2. Asegurar que los presets locales más recientes se incluyan en Pipeta\presets
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
set "ZIP_FILE=%~dp0Pipeta_${VERSION}.zip"

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
    const netSource = '\\\\LASP-VM\\Pipeta';
    const localDest = 'C:\\TOOLS\\APPS\\Pipeta';

    const psScript = `
$foundSource = '\\\\LASP-VM\\Pipeta'

if (-not (Test-Path "$foundSource\\server\\server.js")) {
    Write-Error "No se pudo acceder al servidor maestro en \\\\LASP-VM\\Pipeta. Verifica la conexion de red con \\\\LASP-VM."
    exit 1
}

$dest = 'C:\\TOOLS\\APPS\\Pipeta'
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }

# 1. Sincronizar archivos principales directamente y UNICAMENTE desde \\LASP-VM\Pipeta
# Excluimos 'bin' para no intentar sobreescribir node.exe en ejecucion
& robocopy $foundSource $dest /MIR /R:2 /W:2 /MT:16 /XD .git .gemini logs presets bin node_modules\\.cache /XF *.zip *.log *.tmp /NFL /NDL /NJH /NJS
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

            res.json({ success: true, updatedFrom: netSource, localDest: localDest });

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
    const batPath = path.join(localDir, 'Launch_Pipeta.bat');
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
    const netSource = '\\\\LASP-VM\\Pipeta';
    let serverOnline = false;
    let serverVersion = null;

    try {
        if (fs.existsSync(netSource)) {
            serverOnline = true;
            const netServerJs = path.join(netSource, 'server', 'server.js');
            if (fs.existsSync(netServerJs)) {
                const content = fs.readFileSync(netServerJs, 'utf8');
                const m = content.match(/const VERSION = ["']([^"']+)["']/);
                if (m) serverVersion = m[1];
            }
        }
    } catch(e) {
        serverOnline = false;
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

app.get('/api/users', async (req, res) => {
    try {
        if (!fs.existsSync(USERS_CONFIG_FILE)) {
            return res.json({ adminPassword: "Pipetadmin.321", roles: [], users: [], activeUser: "lasp-mpastorino" });
        }
        const data = await fs.readJson(USERS_CONFIG_FILE);
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
        if (fs.existsSync(trackerFile)) {
            try {
                trackerData = await fs.readJson(trackerFile);
            } catch (e) {
                console.warn("[WORKFLOW] Error reading trackerFile:", e);
            }
        }

        res.json({ success: true, trackerFile, trackerData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/workflow/shot-tracker/save', async (req, res) => {
    try {
        const { workflowDir, trackerData } = req.body;
        if (!workflowDir || !trackerData) return res.status(400).json({ error: "Missing workflowDir or trackerData" });

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
app.get('/api/fs/dirSize', async (req, res) => {
    const dirPath = req.query.path;
    if (!dirPath) return res.status(400).json({ error: 'Missing path' });

    try {
        const { execSync } = require('child_process');
        const cmd = `powershell -NoProfile -Command "(Get-ChildItem -Path '${dirPath.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`;
        const raw = execSync(cmd, { timeout: 30000 }).toString().trim();
        const size = parseInt(raw) || 0;
        res.json({ path: dirPath, size });
    } catch (err) {
        res.json({ path: dirPath, size: 0, error: err.message });
    }
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
    const { items, mode = 'both', mediaSubfolders, workSubfolders, omitControl = true } = req.body;
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
            const shouldFixMedia = (mode === 'media' || mode === 'both') && (item.status === 'missing-media' || (item.missingMediaFolders && item.missingMediaFolders.length > 0));
            const shouldFixWork = (mode === 'work' || mode === 'both') && (item.status === 'missing-work' || (item.missingWorkFolders && item.missingWorkFolders.length > 0));

            if (shouldFixMedia && item.mediaPath) {
                // Ensure media shot base dir
                await fs.ensureDir(item.mediaPath);
                // Create missing standard subfolders
                for (const sub of targetMediaSubfolders) {
                    await fs.ensureDir(path.join(item.mediaPath, sub));
                }
                if (!omitControl) {
                    const ctrlFile = path.join(item.mediaPath, 'vfx_control.json');
                    if (!await fs.pathExists(ctrlFile)) {
                        await fs.writeJson(ctrlFile, {
                            node_id: item.shot,
                            type: 'shot',
                            preset_id: 'master_shot',
                            created_by: 'MirrorAuditor',
                            created_at: new Date().toISOString()
                        }, { spaces: 2 });
                    }
                }
                repairedCount++;
            }

            if (shouldFixWork && item.workPath) {
                // Ensure work shot base dir
                await fs.ensureDir(item.workPath);
                // Create missing standard subfolders
                for (const sub of targetWorkSubfolders) {
                    await fs.ensureDir(path.join(item.workPath, sub));
                }
                if (!omitControl) {
                    const ctrlFile = path.join(item.workPath, 'vfx_control.json');
                    if (!await fs.pathExists(ctrlFile)) {
                        await fs.writeJson(ctrlFile, {
                            node_id: item.shot,
                            type: 'shot',
                            preset_id: 'master_shot',
                            created_by: 'MirrorAuditor',
                            created_at: new Date().toISOString()
                        }, { spaces: 2 });
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
    const { auditType, roots, scope = 'all', targetEpisodes = [], config = {} } = req.body;
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
                    selected: false
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
                results.push(record);
            }

            results.sort((a, b) => a.key.localeCompare(b.key));
            return res.json({ success: true, results });

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
                                        const mediaSubs = await fs.readdir(shotMediaPath);
                                        for (const mSub of mediaSubs) {
                                            const mSubPath = path.join(shotMediaPath, mSub);
                                            try {
                                                if (!(await fs.stat(mSubPath)).isDirectory()) continue;
                                            } catch(e) { continue; }
                                            const subNameLower = mSub.toLowerCase();

                                            const deepItems = await fs.readdir(mSubPath);
                                            for (const deepItem of deepItems) {
                                                const deepPath = path.join(mSubPath, deepItem);
                                                let deepStat;
                                                try {
                                                    deepStat = await fs.stat(deepPath);
                                                } catch(e) { continue; }
                                                const deepLower = deepItem.toLowerCase();
                                                const vFolder = extractVersion(deepItem);

                                                if (deepStat.isDirectory() && vFolder) {
                                                    const frameFiles = (await fs.readdir(deepPath)).filter(f => !f.startsWith('.'));
                                                    const isMov = subNameLower.includes('mov') || deepLower.includes('mov') || deepLower.includes('compres') || deepLower.includes('mp4');
                                                    const isTcl = subNameLower.includes('prerender') || deepLower.includes('prerender');
                                                    const rType = isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres');

                                                    const badFiles = [];
                                                    if (!isTcl && frameFiles.length > 0) {
                                                        for (const ff of frameFiles) {
                                                            const ffLower = ff.toLowerCase();
                                                            const hasShot = ffLower.includes(shot.toLowerCase());
                                                            const hasVer = ffLower.includes(vFolder.str.toLowerCase());
                                                            if (!hasShot || !hasVer) badFiles.push(ff);
                                                        }
                                                    }

                                                    foundRenders.push({
                                                        type: rType,
                                                        folderName: deepItem,
                                                        versionStr: vFolder.str,
                                                        versionNum: vFolder.num,
                                                        path: deepPath.replace(/\\/g, '/'),
                                                        frameCount: frameFiles.length,
                                                        hasBadNaming: badFiles.length > 0,
                                                        badFiles
                                                    });
                                                } else if (!deepStat.isDirectory()) {
                                                    const vFile = extractVersion(deepItem);
                                                    if (vFile) {
                                                        const isMov = deepLower.endsWith('.mov') || deepLower.endsWith('.mp4');
                                                        const isTcl = subNameLower.includes('prerender') || deepLower.includes('prerender');
                                                        const badFiles = [];
                                                        if (!isTcl) {
                                                            const hasShot = deepLower.includes(shot.toLowerCase());
                                                            const hasVer = deepLower.includes(vFile.str.toLowerCase());
                                                            if (!hasShot || !hasVer) badFiles.push(deepItem);
                                                        }
                                                        foundRenders.push({
                                                            type: isMov ? 'mov' : (isTcl ? 'tcl' : 'fullres'),
                                                            folderName: mSub,
                                                            versionStr: vFile.str,
                                                            versionNum: vFile.num,
                                                            path: deepPath.replace(/\\/g, '/'),
                                                            frameCount: 1,
                                                            hasBadNaming: badFiles.length > 0,
                                                            badFiles
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) { }
                                }

                                foundRenders.sort((a, b) => b.versionNum - a.versionNum);

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
                                    renders: foundRenders,
                                    badFiles: [],
                                    sceneStatus: 'no-script',
                                    renderStatus: 'no-script'
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
                                    if (config.onlyFullRes && r.type !== 'fullres') return false;
                                    return true;
                                });

                                const matchingRender = targetRenders.find(r => latestScript && r.versionNum === latestScript.num);
                                const highestRender = targetRenders[0] || null;

                                if (!latestScript) {
                                    if (highestRender) {
                                        shotRecord.renderStatus = 'orphan-render';
                                    } else {
                                        shotRecord.renderStatus = 'no-script';
                                    }
                                } else {
                                    if (highestRender && highestRender.versionNum > latestScript.num) {
                                        shotRecord.renderStatus = 'orphan-render';
                                    } else if (matchingRender) {
                                        if (matchingRender.hasBadNaming) {
                                            shotRecord.renderStatus = 'bad-naming';
                                            shotRecord.badFiles = matchingRender.badFiles;
                                        } else {
                                            shotRecord.renderStatus = 'up-to-date';
                                        }
                                    } else if (highestRender && highestRender.versionNum < latestScript.num) {
                                        if (highestRender.hasBadNaming) {
                                            shotRecord.renderStatus = 'bad-naming';
                                            shotRecord.badFiles = highestRender.badFiles;
                                        } else {
                                            shotRecord.renderStatus = 'outdated';
                                        }
                                    } else {
                                        shotRecord.renderStatus = 'missing-render';
                                    }
                                }

                                results.push(shotRecord);
                            }
                        }
                    }
                }
            }

            results.sort((a, b) => a.key.localeCompare(b.key));
            return res.json({ success: true, results });
        }
    } catch (err) {
        console.error("[AUDIT] Scan error:", err);
        return res.status(500).json({ success: false, error: err.message });
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
                const batPath = isLocal ? 'C:\\TOOLS\\APPS\\Pipeta\\Launch_Pipeta.bat' : path.join(__dirname, '../Launch_Pipeta.bat');
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

        const zPresetsDir = 'Z:/INTERNO/TOOLS/Mati/Propios/Scripts/Pipeta/presets';
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

// Fallback logic
app.get('*', (req, res) => {
    res.sendFile(path.join(uiPath, 'index.html'));
});

// Start Server with EADDRINUSE retry resilience
function startListening(retries = 10) {
    const server = app.listen(PORT, async () => {
        console.log(`Pipeta Core running at http://localhost:${PORT}`);
        console.log(`Version: ${VERSION}`);

        const noBrowser = process.argv.includes('--no-browser');
        if (shouldOpenBrowser && !noBrowser) {
            try {
                await open(`http://localhost:${PORT}`);
            } catch (e) {
                console.log("Failed to auto-open browser:", e);
            }
        } else {
            console.log("[INFO] Browser launch skipped (Restart Recovery or --no-browser active).");
        }
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
