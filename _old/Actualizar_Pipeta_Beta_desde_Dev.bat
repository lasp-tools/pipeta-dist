@echo off
setlocal enabledelayedexpansion
title Sincronizar Pipeta Beta desde Dev Local (Z:)

echo ============================================================
echo   ACTUALIZADOR DE PIPETA BETA DESDE DEV (Z:)
echo ============================================================
echo.

set "DEST=C:\TOOLS\APPS\Pipeta_Beta"
set "SRC=Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"

if not exist "%SRC%\server\server.js" (
    echo [ERROR] No se pudo acceder al repositorio Dev de Pipeta en %SRC%.
    pause
    exit /b 1
)

echo Origen Dev: %SRC%
echo Destino Beta: %DEST%
echo.

echo [1/3] Cerrando instancias de Pipeta Beta (puerto 3003)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":3003 *LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo [2/3] Sincronizando archivos con Robocopy desde %SRC%...
if not exist "%DEST%" mkdir "%DEST%"

robocopy "%SRC%" "%DEST%" /MIR /R:2 /W:2 /MT:16 /XD .git .gemini logs presets _SYNC_CACHE credentials bin tools node_modules /XF *.zip *.log *.tmp /NFL /NDL /NJH /NJS

if exist "%SRC%\presets" (
    robocopy "%SRC%\presets" "%DEST%\presets" /E /XO /NFL /NDL /NJH /NJS /R:0 /W:0
)

echo [3/3] Creando acceso directo en Escritorio para Pipeta Beta...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Pipeta Beta.lnk')); $s.TargetPath = 'C:\TOOLS\APPS\Pipeta_Beta\Launch_Pipeta_Beta.bat'; $s.WorkingDirectory = 'C:\TOOLS\APPS\Pipeta_Beta'; $ico = 'C:\TOOLS\APPS\Pipeta_Beta\Pipeta.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Description = 'Pipeta Beta - VFX Pipeline Manager'; $s.Save()" 2>nul

echo.
echo ============================================================
echo   OK: Pipeta Beta sincronizada con exito en %DEST%
echo ============================================================
echo.
timeout /t 2 >nul

start "" "%DEST%\Launch_Pipeta_Beta.bat"
exit
