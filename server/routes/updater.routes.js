const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { spawn, execSync, execFile } = require('child_process');
const {
    VERSION,
    CHANNEL,
    IS_BETA,
    PORT,
    APP_ROOT,
    LOCAL_APP_DIR,
    NETWORK_APP_DIR,
    PROD_STUDIO_DIR,
    SHORTCUT_NAME,
    LAUNCHER_BAT,
    UPDATER_BAT,
    UPDATING_FLAG_FILE
} = require('../core/app-context');

const router = express.Router();

// --- PORTABLE PACKAGE EXPORTER (.ZIP + .BAT EXTRACTOR) ---
router.post('/api/system/package-dist', async (req, res) => {
    let targetDir = req.body?.targetDir || 'Z:\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS';
    targetDir = targetDir.replace(/\//g, '\\');
    const includeRamon = req.body?.includeRamon === true || req.body?.includeRamon === 'true';
    const includeDriveCache = req.body?.includeDriveCache === true || req.body?.includeDriveCache === 'true';
    const includeServerCache = req.body?.includeServerCache === true || req.body?.includeServerCache === 'true';

    const pipetaRoot = APP_ROOT;
    const appFolderName = path.basename(LOCAL_APP_DIR); // 'Pipeta_Beta' or 'Pipeta'
    const zipPrefix = IS_BETA ? 'Pipeta_Beta' : 'Pipeta';
    const zipName = includeRamon ? `${zipPrefix}_${VERSION}_Ramon.zip` : `${zipPrefix}_${VERSION}.zip`;
    const batFileName = IS_BETA
        ? 'Instalar_o_Actualizar_Pipeta_Beta_Local.bat'
        : 'Instalar_o_Actualizar_Pipeta_Local.bat';
    const destZip = path.join(targetDir, zipName);
    const destBat = path.join(targetDir, batFileName);
    const localParentDir = path.dirname(LOCAL_APP_DIR); // 'C:\\TOOLS\\APPS'

    const psScript = `
$source = "${pipetaRoot.replace(/\\/g, '\\\\')}"
$destDir = "${targetDir.replace(/\\/g, '\\\\')}"
$destZip = "${destZip.replace(/\\/g, '\\\\')}"
$destBat = "${destBat.replace(/\\/g, '\\\\')}"
$includeRamon = ${includeRamon ? '$true' : '$false'}
$includeDriveCache = ${includeDriveCache ? '$true' : '$false'}
$includeServerCache = ${includeServerCache ? '$true' : '$false'}
$tempDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "Pipeta_Pkg_" + [System.Guid]::NewGuid().ToString())
$pkgRoot = [System.IO.Path]::Combine($tempDir, "${appFolderName}")

try {
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    New-Item -ItemType Directory -Path $pkgRoot -Force | Out-Null

    $pythonDir = Join-Path $source "bin\\python"
    $excludeFiles = @("Pipeta_*.zip", "pipeta_*.zip", "*.log", "Publicar_Pipeta_a_Produccion_Estudio.bat", "Publicar_Pipeta_Beta_a_Produccion_Estudio.bat")
    if ($includeRamon) {
        robocopy "$source" "$pkgRoot" /MIR /XD .git .gemini logs node_modules\\.cache _SYNC_CACHE credentials /XF $excludeFiles /NFL /NDL /NJH /NJS /R:0 /W:0
        $srcPyZip = Join-Path $pythonDir "python310.zip"
        $destPyDir = Join-Path $pkgRoot "bin\\python"
        $destPyZip = Join-Path $destPyDir "python310.zip"
        if ((Test-Path $srcPyZip) -and (-not (Test-Path $destPyZip))) {
            Copy-Item -Path $srcPyZip -Destination $destPyZip -Force
        }
    } else {
        robocopy "$source" "$pkgRoot" /MIR /XD .git .gemini logs node_modules\\.cache _SYNC_CACHE credentials "$pythonDir" python /XF $excludeFiles /NFL /NDL /NJH /NJS /R:0 /W:0
        $pkgPython = Join-Path $pkgRoot "bin\\python"
        if (Test-Path $pkgPython) { Remove-Item -Recurse -Force $pkgPython }
    }

    $destCache = Join-Path $pkgRoot "_SYNC_CACHE"
    $srcCache = Join-Path $source "_SYNC_CACHE"
    if (-not (Test-Path $srcCache)) { $srcCache = "${LOCAL_APP_DIR.replace(/\\/g, '\\\\')}\\_SYNC_CACHE" }
    if (-not (Test-Path $srcCache)) { $srcCache = "C:\\TOOLS\\APPS\\Pipeta\\_SYNC_CACHE" }
    if (-not (Test-Path $srcCache)) { $srcCache = "Z:\\_SYNC_CACHE" }

    if (($includeDriveCache -or $includeServerCache) -and (Test-Path $srcCache)) {
        New-Item -ItemType Directory -Path $destCache -Force | Out-Null
        if ($includeDriveCache) {
            Get-ChildItem -Path $srcCache -Filter "*.json" -File -ErrorAction SilentlyContinue | Where-Object {
                $_.Name -notlike "server_*" -and $_.Name -ne "worker_status.json"
            } | ForEach-Object {
                Copy-Item -Path $_.FullName -Destination (Join-Path $destCache $_.Name) -Force
            }
            $srcProjects = Join-Path $srcCache "projects"
            if (Test-Path $srcProjects) {
                Get-ChildItem -Path $srcProjects -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                    $projDriveSrc = Join-Path $_.FullName "drive"
                    if (Test-Path $projDriveSrc) {
                        $projDriveDest = Join-Path $destCache "projects\\$($_.Name)\\drive"
                        New-Item -ItemType Directory -Path $projDriveDest -Force | Out-Null
                        robocopy "$projDriveSrc" "$projDriveDest" /E /NFL /NDL /NJH /NJS /R:0 /W:0 | Out-Null
                    }
                }
            }
        }

        if ($includeServerCache) {
            Get-ChildItem -Path $srcCache -Filter "server_*.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
                Copy-Item -Path $_.FullName -Destination (Join-Path $destCache $_.Name) -Force
            }
            $srcProjects = Join-Path $srcCache "projects"
            if (Test-Path $srcProjects) {
                Get-ChildItem -Path $srcProjects -Directory -ErrorAction SilentlyContinue | ForEach-Object {
                    $projServerSrc = Join-Path $_.FullName "server"
                    if (Test-Path $projServerSrc) {
                        $projServerDest = Join-Path $destCache "projects\\$($_.Name)\\server"
                        New-Item -ItemType Directory -Path $projServerDest -Force | Out-Null
                        robocopy "$projServerSrc" "$projServerDest" /E /NFL /NDL /NJH /NJS /R:0 /W:0 | Out-Null
                    }
                }
            }
        }
    }

    $distUsersCfg = Join-Path $pkgRoot "presets\\users_config.json"
    if (Test-Path $distUsersCfg) {
        try {
            $cfg = Get-Content $distUsersCfg -Raw | ConvertFrom-Json
            $cfg.users = @()
            $cfg.activeUser = ""
            $cfg.adminPassword = "LASP.Pipeta#2026.Admin!"
            $cfg | ConvertTo-Json -Depth 10 | Set-Content $distUsersCfg -Encoding UTF8
        } catch {}
    }

    $tempZip = Join-Path $tempDir "package.zip"
    if (Test-Path $destZip) { Remove-Item $destZip -Force }

    where.exe tar >$null 2>&1
    if ($LASTEXITCODE -eq 0) {
        tar.exe -caf "$tempZip" -C "$tempDir" "${appFolderName}"
    } else {
        Compress-Archive -Path "$pkgRoot" -DestinationPath "$tempZip" -Force
    }

    Move-Item -Path "$tempZip" -Destination "$destZip" -Force

    $batScript = @'
@echo off
setlocal enabledelayedexpansion
title Instalador / Actualizador de ${appFolderName} Local

echo ============================================================
echo   INSTALADOR / ACTUALIZADOR DE ${appFolderName.toUpperCase()} LOCAL
echo ============================================================
echo.

set "TARGET_DIR=${localParentDir}"
set "PIPETA_DIR=${LOCAL_APP_DIR}"
set "ZIP_FILE=%~dp0${zipName}"

if not exist "%ZIP_FILE%" set "ZIP_FILE=%~dp0${zipPrefix}_${VERSION}_Ramon.zip"
if not exist "%ZIP_FILE%" set "ZIP_FILE=%~dp0${zipPrefix}_${VERSION}.zip"
if not exist "%ZIP_FILE%" (
    for %%f in ("%~dp0${zipPrefix}_*.zip") do set "ZIP_FILE=%%f"
)

if not exist "%ZIP_FILE%" (
    echo [ERROR] No se encontro el archivo ${zipPrefix}_*.zip en esta carpeta.
    echo.
    pause
    exit /b 1
)

echo [INFO] Archivo detectado: %ZIP_FILE%
echo [INFO] Destino: %PIPETA_DIR%
echo.

echo [1/3] Cerrando instancias previas en puerto ${PORT}...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":${PORT} *LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo [2/3] Descomprimiendo ${appFolderName} limpia en %TARGET_DIR%...
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
if exist "%PIPETA_DIR%\\_SYNC_CACHE\\last_ramon_user.json" del /f /q "%PIPETA_DIR%\\_SYNC_CACHE\\last_ramon_user.json" >nul 2>&1
if exist "%PIPETA_DIR%\\_SYNC_CACHE\\last_project.json" del /f /q "%PIPETA_DIR%\\_SYNC_CACHE\\last_project.json" >nul 2>&1

where tar >nul 2>&1
if %errorlevel% equ 0 (
    tar -xf "%ZIP_FILE%" -C "%TARGET_DIR%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP_FILE%' -DestinationPath '%TARGET_DIR%' -Force"
)

if not exist "%PIPETA_DIR%\\${LAUNCHER_BAT}" (
    echo [ERROR] No se encontro ${LAUNCHER_BAT} en %PIPETA_DIR%.
    pause
    exit /b 1
)

echo [3/3] Creando acceso directo en Escritorio (${SHORTCUT_NAME})...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), '${SHORTCUT_NAME}')); $s.TargetPath = '${LOCAL_APP_DIR}\\${LAUNCHER_BAT}'; $s.WorkingDirectory = '${LOCAL_APP_DIR}'; $ico = '${LOCAL_APP_DIR}\\Pipeta.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Description = '${appFolderName} - VFX Pipeline Manager'; $s.Save()" 2>nul

echo.
echo ============================================================
echo   OK: ${appFolderName} instalada con exito en ${LOCAL_APP_DIR}
echo ============================================================
echo.
timeout /t 2 >nul

start "" "${LOCAL_APP_DIR}\\${LAUNCHER_BAT}"
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
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPsFile], { timeout: 300000 }, async (err, stdout, stderr) => {
            try { await fs.remove(tmpPsFile); } catch (e) {}

            if (err) {
                console.error('[PACKAGE DIST] Error:', err, stderr);
                return res.status(500).json({ error: err.message || stderr });
            }

            const outStr = (stdout || '').trim();
            let bytes = 0;
            if (outStr.includes('SUCCESS:')) {
                bytes = parseInt(outStr.split('SUCCESS:')[1].trim(), 10) || 0;
            }

            const sizeFormatted = (!bytes || bytes <= 0) ? '0 MB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB';

            res.json({
                success: true,
                zipPath: destZip,
                zipName,
                batPath: destBat,
                batName: batFileName,
                targetDir,
                version: VERSION,
                sizeBytes: bytes,
                sizeFormatted
            });
        });
    } catch (err) {
        try { await fs.remove(tmpPsFile); } catch (e) {}
        res.status(500).json({ error: err.message });
    }
});

// --- SACRED AUTO-UPDATER ARCHITECTURE (HANDOFF RUNNER IN %TEMP%) ---
// Never overwrites files while Node is alive. Responds HTTP 200 immediately,
// writes UPDATING_FLAG_FILE, spawns detached %TEMP%\pipeta_beta_handoff_updater.bat,
// and exits Node (process.exit(0)) so all Windows kernel locks are released before Robocopy runs.
router.post('/api/app/update-from-server', async (req, res) => {
    try {
        const customSource = (req.body?.sourcePath || '').trim();
        const appFolderName = IS_BETA ? 'Pipeta_Beta' : 'Pipeta';
        const uncAppDir = `\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\${appFolderName}`;

        const candidateUpdaterBats = [];
        if (customSource) {
            candidateUpdaterBats.push(path.join(customSource.replace(/\//g, '\\'), UPDATER_BAT));
        }
        if (!global.isExternalMachine) {
            candidateUpdaterBats.push(path.join(NETWORK_APP_DIR, UPDATER_BAT));
            candidateUpdaterBats.push(path.join(PROD_STUDIO_DIR, UPDATER_BAT));
            candidateUpdaterBats.push(path.join(uncAppDir, UPDATER_BAT));
        }
        candidateUpdaterBats.push(path.join(LOCAL_APP_DIR, UPDATER_BAT));
        candidateUpdaterBats.push(path.join(APP_ROOT, UPDATER_BAT));

        const uniqueUpdaterBats = [...new Set(candidateUpdaterBats)];
        const handoffBatPath = path.join(
            os.tmpdir(),
            IS_BETA ? 'pipeta_beta_handoff_updater.bat' : 'pipeta_handoff_updater.bat'
        );
        const stagedUpdaterPath = path.join(
            os.tmpdir(),
            IS_BETA ? 'pipeta_beta_staged_updater.bat' : 'pipeta_staged_updater.bat'
        );

        // 1. Create updating flag so Launch_Pipeta_Beta.bat stays immune while Robocopy/Git runs
        try {
            fs.writeFileSync(UPDATING_FLAG_FILE, new Date().toISOString(), 'utf8');
        } catch (e) {}

        // 2. Build detached Handoff Runner in %TEMP%
        const checkLines = uniqueUpdaterBats.map(cand => {
            const srcDir = path.dirname(cand);
            return `if not defined FOUND_UPDATER if exist "${cand}" ( set "FOUND_UPDATER=${cand}" & set "FOUND_SRC=${srcDir}" )`;
        }).join('\r\n');

        const isStudioLan = !global.isExternalMachine;
        const lanAuthBlock = isStudioLan ? [
            `if not exist "${uncAppDir}\\server\\server.js" (`,
            `    net use \\\\192.168.206.116\\Z "Laspadmin.321" /user:"nonstop.tv\\lasp-mpastorino" /persistent:no >nul 2>&1`,
            `)`
        ].join('\r\n') : 'rem External/remote mode';

        const handoffContent = [
            '@echo off',
            'setlocal enabledelayedexpansion',
            `title Actualizando ${appFolderName}...`,
            'rem Wait for Node process.exit(0) to release all Windows kernel file locks',
            'timeout /t 2 /nobreak >nul',
            `for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":${PORT} *LISTENING"') do taskkill /F /PID %%a >nul 2>&1`,
            lanAuthBlock,
            'set "FOUND_UPDATER="',
            'set "FOUND_SRC="',
            checkLines,
            'if defined FOUND_UPDATER (',
            `    copy /y "!FOUND_UPDATER!" "${stagedUpdaterPath}" >nul 2>&1`,
            `    if exist "${stagedUpdaterPath}" (`,
            `        call "${stagedUpdaterPath}" --unattended "${LOCAL_APP_DIR}" "!FOUND_SRC!"`,
            '    ) else (',
            `        call "!FOUND_UPDATER!" --unattended "${LOCAL_APP_DIR}" "!FOUND_SRC!"`,
            '    )',
            ')',
            `if exist "${UPDATING_FLAG_FILE}" del /f /q "${UPDATING_FLAG_FILE}" >nul 2>&1`,
            'timeout /t 1 /nobreak >nul',
            'set "PORT_ACTIVE="',
            `for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":${PORT} *LISTENING"') do set "PORT_ACTIVE=1"`,
            'if not defined PORT_ACTIVE (',
            `    if exist "${LOCAL_APP_DIR}\\${LAUNCHER_BAT}" (`,
            `        start "" "${LOCAL_APP_DIR}\\${LAUNCHER_BAT}"`,
            `    ) else if exist "${APP_ROOT}\\${LAUNCHER_BAT}" (`,
            `        start "" "${APP_ROOT}\\${LAUNCHER_BAT}"`,
            '    )',
            ')',
            'exit /b 0'
        ].join('\r\n');

        await fs.writeFile(handoffBatPath, handoffContent, 'ascii');

        // 3. Respond HTTP 200 immediately to UI
        res.json({
            success: true,
            handoff: true,
            channel: CHANNEL,
            localDest: LOCAL_APP_DIR,
            updaterBat: UPDATER_BAT
        });

        // 4. Spawn detached Handoff Runner and terminate Node immediately
        setTimeout(() => {
            try {
                if (global.serverInstance && global.serverInstance.close) {
                    global.serverInstance.close();
                }
            } catch (e) {}

            try {
                const child = spawn('cmd.exe', ['/c', 'start', '""', '/min', handoffBatPath], {
                    detached: true,
                    stdio: 'ignore',
                    windowsHide: true
                });
                child.unref();
            } catch (spawnErr) {
                console.error('[AUTO-UPDATE] Failed to spawn handoff runner:', spawnErr);
            }

            setTimeout(() => {
                process.exit(0);
            }, 300);
        }, 150);
    } catch (err) {
        try { await fs.remove(UPDATING_FLAG_FILE); } catch (e) {}
        console.error('[AUTO-UPDATE] Error preparing handoff updater:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- CREATE DESKTOP SHORTCUT ---
router.post('/api/app/create-desktop-shortcut', async (req, res) => {
    const canonClientDir = LOCAL_APP_DIR;
    const currentRootDir = APP_ROOT;
    const isDevVm = (os.hostname() || '').toUpperCase() === 'LASP-VM';

    let localDir = canonClientDir;
    if (!fs.existsSync(path.join(canonClientDir, LAUNCHER_BAT))) {
        if (!isDevVm && fs.existsSync(path.join(currentRootDir, LAUNCHER_BAT))) {
            try {
                fs.ensureDirSync(canonClientDir);
                execSync(`robocopy "${currentRootDir}" "${canonClientDir}" /MIR /R:1 /W:1 /MT:16 /XD .git .gemini logs presets _SYNC_CACHE credentials bin tools node_modules _old /XF *.zip *.log *.tmp /NFL /NDL /NJH /NJS`, { stdio: 'ignore', timeout: 30000 });
                if (fs.existsSync(path.join(currentRootDir, 'presets'))) {
                    execSync(`robocopy "${path.join(currentRootDir, 'presets')}" "${path.join(canonClientDir, 'presets')}" /E /XO /XN /XC /NFL /NDL /NJH /NJS /R:0 /W:0`, { stdio: 'ignore', timeout: 15000 });
                }
            } catch (e) {}
        }
        if (!fs.existsSync(path.join(canonClientDir, LAUNCHER_BAT))) {
            localDir = currentRootDir;
        }
    }

    const batCandidates = [LAUNCHER_BAT, 'Launch_Pipeta_Beta.bat', 'Launch_Pipeta.bat', 'Iniciar_Pipeta.bat'];
    const batName = batCandidates.find(b => fs.existsSync(path.join(localDir, b))) || LAUNCHER_BAT;
    const batPath = path.join(localDir, batName);
    const icoFileName = IS_BETA && fs.existsSync(path.join(localDir, 'Pipeta_Beta.ico')) ? 'Pipeta_Beta.ico' : 'Pipeta.ico';
    const icoPath = path.join(localDir, icoFileName);

    if (!fs.existsSync(icoPath)) {
        const fallbackIco = [
            path.join(currentRootDir, 'Pipeta_Beta.ico'),
            path.join(currentRootDir, 'Pipeta.ico'),
            path.join(localDir, 'ui', 'favicon.ico'),
            path.join(currentRootDir, 'ui', 'favicon.ico')
        ].find(p => fs.existsSync(p));
        if (fallbackIco) {
            try { fs.copySync(fallbackIco, icoPath, { overwrite: true }); } catch (e) {}
        }
    }

    const psBat = batPath.replace(/'/g, "''");
    const psDir = localDir.replace(/'/g, "''");
    const psIco = icoPath.replace(/'/g, "''");
    const psShortcutName = SHORTCUT_NAME.replace(/'/g, "''");
    const psDesc = IS_BETA
        ? 'Pipeta Beta - VFX Pipeline & IA Ingest Manager'
        : 'Pipeta - VFX Pipeline & IA Ingest Manager';

    const psScript = `
$bat = '${psBat}'
$dir = '${psDir}'
$ico = '${psIco}'
try { Unblock-File -LiteralPath $bat -ErrorAction SilentlyContinue } catch {}
if (Test-Path -LiteralPath $ico) {
    try { Unblock-File -LiteralPath $ico -ErrorAction SilentlyContinue } catch {}
}
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = [System.IO.Path]::Combine($desktop, '${psShortcutName}')
if (Test-Path -LiteralPath $lnkPath) {
    Remove-Item -LiteralPath $lnkPath -Force -ErrorAction SilentlyContinue
}
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnkPath)
$s.TargetPath = $bat
$s.WorkingDirectory = $dir
if (Test-Path -LiteralPath $ico) {
    $s.IconLocation = "$ico,0"
}
$s.Description = '${psDesc}'
$s.Save()
Start-Process -FilePath 'ie4uinit.exe' -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue
Write-Output "SHORTCUT_CREATED"
`;

    const tmpPsFile = path.join(os.tmpdir(), `pipeta_shortcut_${Date.now()}.ps1`);
    try {
        await fs.writeFile(tmpPsFile, psScript, 'utf8');
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPsFile], { timeout: 15000 }, async (err, stdout, stderr) => {
            try { await fs.remove(tmpPsFile); } catch (e) {}
            if (err) {
                console.error('[SHORTCUT] Error:', err, stderr);
                return res.status(500).json({ error: err.message || stderr });
            }
            res.json({
                success: true,
                shortcutName: SHORTCUT_NAME,
                shortcutPath: path.join(process.env.USERPROFILE || '', 'Desktop', SHORTCUT_NAME)
            });
        });
    } catch (err) {
        try { await fs.remove(tmpPsFile); } catch (e) {}
        res.status(500).json({ error: err.message });
    }
});

// --- VERSION INFO ---
router.get('/api/app/version-info', async (req, res) => {
    const appFolderName = IS_BETA ? 'Pipeta_Beta' : 'Pipeta';
    const candidateSources = [
        NETWORK_APP_DIR,
        PROD_STUDIO_DIR,
        `\\\\192.168.206.116\\Z\\INTERNO\\TOOLS\\GITHUB\\TOOLS\\APPS\\${appFolderName}`,
        `\\\\LASP-VM\\${appFolderName}`
    ].filter(Boolean);

    let netSource = candidateSources[0];
    let serverOnline = false;
    let serverVersion = null;

    for (const src of candidateSources) {
        try {
            const netVersionJson = path.join(src, 'version.json');
            const netServerJs = path.join(src, 'server', 'server.js');
            if (fs.existsSync(netVersionJson)) {
                netSource = src;
                serverOnline = true;
                try {
                    const vMeta = fs.readJsonSync(netVersionJson);
                    if (vMeta && vMeta.version) serverVersion = vMeta.version;
                } catch (e) {}
                if (serverVersion) break;
            }
            if (fs.existsSync(netServerJs)) {
                netSource = src;
                serverOnline = true;
                const content = fs.readFileSync(netServerJs, 'utf8');
                const m = content.match(/const VERSION = ["']([^"']+)["']/);
                if (m) serverVersion = m[1];
                break;
            }
        } catch (e) {}
    }

    res.json({
        currentVersion: VERSION,
        channel: CHANNEL,
        serverPath: netSource,
        serverOnline,
        serverVersion: serverVersion || VERSION,
        runtimePath: APP_ROOT
    });
});

module.exports = router;
