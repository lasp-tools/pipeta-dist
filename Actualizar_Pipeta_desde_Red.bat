@echo off
setlocal enabledelayedexpansion
title Sincronizar Pipeta desde Servidor Maestro (Robocopy)

echo ============================================================
echo   ACTUALIZADOR DE PIPETA DESDE RED (ROBOCOPY)
echo ============================================================
echo.

set "DEST=C:\TOOLS\APPS\Pipeta"
set "SRC=\\LASP-VM\Pipeta"

if not exist "%SRC%\server\server.js" (
    echo [ERROR] No se pudo acceder al servidor maestro en \\LASP-VM\Pipeta.
    echo Verifica que la red este activa y tengas conexion con \\LASP-VM.
    echo.
    pause
    exit /b 1
)

echo Origen Maestro: %SRC%
echo Destino Local:  %DEST%
echo.

echo [1/3] Cerrando instancias previas de Pipeta...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":3002 *LISTENING"') do taskkill /F /PID %%a >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1

echo [2/3] Sincronizando archivos con Robocopy desde \\LASP-VM\Pipeta...
if not exist "%DEST%" mkdir "%DEST%"

robocopy "%SRC%" "%DEST%" /MIR /R:2 /W:2 /MT:16 /XD .git .gemini logs presets bin /XF *.zip *.log *.tmp /NFL /NDL /NJH /NJS

if exist "%SRC%\presets" (
    robocopy "%SRC%\presets" "%DEST%\presets" /E /XO /XN /XC /NFL /NDL /NJH /NJS /R:0 /W:0
)

echo [3/3] Creando acceso directo en Escritorio con icono oficial...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Pipeta.lnk')); $s.TargetPath = 'C:\TOOLS\APPS\Pipeta\Launch_Pipeta.bat'; $s.WorkingDirectory = 'C:\TOOLS\APPS\Pipeta'; $ico = 'C:\TOOLS\APPS\Pipeta\Pipeta.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Description = 'Pipeta - VFX Pipeline Manager'; $s.Save()" 2>nul

echo.
echo ============================================================
echo   OK: Pipeta v0.9.64 sincronizada con exito en %DEST%
echo ============================================================
echo.
timeout /t 2 >nul

start "" "%DEST%\Launch_Pipeta.bat"
exit
