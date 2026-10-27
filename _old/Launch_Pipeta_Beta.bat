@echo off
setlocal enabledelayedexpansion
set "APP_NAME=PIPETA BETA"
set "APP_VERSION=v1.1.37-beta"
set "APP_PORT=3003"
set "LOCAL_DIR=C:\TOOLS\APPS\Pipeta_Beta"
set "SERVER_DIR=%LOCAL_DIR%\server"
set "NETWORK_DIR=Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"

set "PIPETA_SERVER_API=http://192.168.206.121:3005"
set "RESTART_FLAG=%TEMP%\pipeta_beta_restarting.flag"
set "PIPETA_SUPERVISED=1"

title %APP_NAME% %APP_VERSION% Manager

:: 1. Si Pipeta Beta ya esta corriendo en segundo plano, abrir navegador
if not exist "%RESTART_FLAG%" (
    curl.exe -s -f -m 1 http://localhost:%APP_PORT%/api/version >nul 2>&1
    if !errorlevel! equ 0 (
        echo ====================================================
        echo   %APP_NAME% - %APP_VERSION%
        echo ====================================================
        echo [INFO] Pipeta Beta ya se encuentra en ejecucion en el puerto %APP_PORT%.
        echo [INFO] Abriendo aplicacion en el navegador...
        start "" "http://localhost:%APP_PORT%"
        ping 127.0.0.1 -n 2 >nul
        exit /b 0
    )
)

:: 2. Detectar si estamos ejecutando desde el disco local C:\TOOLS\APPS\Pipeta_Beta
if /i "%~dp0"=="%LOCAL_DIR%\" goto :RUN_LOCAL

:: 3. Si no estamos en C:, sincronizar y transferir ejecucion a C:
echo ====================================================
echo   %APP_NAME% - %APP_VERSION% (Sincronizador Dev -^> Local)
echo ====================================================
echo [INFO] Sincronizando archivos a disco local en %LOCAL_DIR%...

if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"

:: Copiar dependencias base si no existen en Pipeta_Beta
if not exist "%LOCAL_DIR%\bin" (
    if exist "C:\TOOLS\APPS\Pipeta\bin" (
        robocopy "C:\TOOLS\APPS\Pipeta\bin" "%LOCAL_DIR%\bin" /E /NFL /NDL /NJH /NJS >nul
    )
)
if not exist "%LOCAL_DIR%\tools" (
    if exist "C:\TOOLS\APPS\Pipeta\tools" (
        robocopy "C:\TOOLS\APPS\Pipeta\tools" "%LOCAL_DIR%\tools" /E /NFL /NDL /NJH /NJS >nul
    )
)
if not exist "%LOCAL_DIR%\server\node_modules" (
    if exist "C:\TOOLS\APPS\Pipeta\server\node_modules" (
        mkdir "%LOCAL_DIR%\server" 2>nul
        robocopy "C:\TOOLS\APPS\Pipeta\server\node_modules" "%LOCAL_DIR%\server\node_modules" /E /NFL /NDL /NJH /NJS >nul
    )
)

:: Sincronizar codigo fuente Beta excluyendo carpetas pesadas
robocopy "%NETWORK_DIR%" "%LOCAL_DIR%" /MIR /XD .git .gemini presets logs _SYNC_CACHE credentials bin tools node_modules /XF *.log *.tmp /NFL /NDL /NJH /NJS /R:0 /W:0

if exist "%NETWORK_DIR%\presets" (
    if not exist "%LOCAL_DIR%\presets" mkdir "%LOCAL_DIR%\presets"
    robocopy "%NETWORK_DIR%\presets" "%LOCAL_DIR%\presets" /E /XO /NFL /NDL /NJH /NJS /R:0 /W:0
)

:: Crear acceso directo en Escritorio para Pipeta Beta
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Pipeta Beta.lnk')); $s.TargetPath = 'C:\TOOLS\APPS\Pipeta_Beta\Launch_Pipeta_Beta.bat'; $s.WorkingDirectory = 'C:\TOOLS\APPS\Pipeta_Beta'; $ico = 'C:\TOOLS\APPS\Pipeta_Beta\Pipeta.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Description = 'Pipeta Beta - VFX Pipeline Manager'; $s.Save()" 2>nul

echo [INFO] Sincronizacion completada.
echo [INFO] Lanzando instancia local de Pipeta Beta...
timeout /t 1 >nul
start "" "%LOCAL_DIR%\Launch_Pipeta_Beta.bat"
exit /b 0

:RUN_LOCAL
title %APP_NAME% %APP_VERSION% (LOCAL RUNTIME - Port %APP_PORT%)
echo ====================================================
echo   %APP_NAME% - %APP_VERSION% (Disco Local)
echo   Puerto Local: %APP_PORT%
echo ====================================================
echo.

:START_SERVER
echo [INFO] Verificando puerto %APP_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":%APP_PORT% *LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "%SERVER_DIR%"

set "NODE_BIN=node"
if exist "%LOCAL_DIR%\bin\node\node.exe" (
    set "NODE_BIN=%LOCAL_DIR%\bin\node\node.exe"
) else if exist "C:\TOOLS\APPS\Pipeta\bin\node\node.exe" (
    set "NODE_BIN=C:\TOOLS\APPS\Pipeta\bin\node\node.exe"
)

echo [INFO] Iniciando Servidor Beta en Puerto %APP_PORT%...
set "PORT=%APP_PORT%"
set "NODE_PATH=%LOCAL_DIR%\node_modules;%LOCAL_DIR%\server\node_modules;C:\TOOLS\APPS\Pipeta\server\node_modules"

"%NODE_BIN%" server.js
set "EXIT_CODE=%errorlevel%"

:: Si hay flag de reinicio o codigo 42, reiniciamos limpiamente sin colgar
if exist "%RESTART_FLAG%" (
    echo.
    echo [INFO] Reinicio solicitado por Pipeta Beta. Sincronizando y relanzando...
    if exist "%NETWORK_DIR%" (
        robocopy "%NETWORK_DIR%" "%LOCAL_DIR%" /MIR /XD .git .gemini presets logs _SYNC_CACHE credentials bin tools node_modules /XF *.log *.tmp /NFL /NDL /NJH /NJS /R:0 /W:0
    )
    timeout /t 1 >nul
    goto :START_SERVER
)

if %EXIT_CODE% equ 42 (
    echo.
    echo [INFO] Reinicio solicitado (codigo 42). Relanzando servidor Beta...
    if exist "%NETWORK_DIR%" (
        robocopy "%NETWORK_DIR%" "%LOCAL_DIR%" /MIR /XD .git .gemini presets logs _SYNC_CACHE credentials bin tools node_modules /XF *.log *.tmp /NFL /NDL /NJH /NJS /R:0 /W:0
    )
    timeout /t 1 >nul
    goto :START_SERVER
)

if %EXIT_CODE% equ 0 (
    echo [INFO] Servidor Beta cerrado correctamente.
    exit /b 0
)

echo.
echo [ERROR] El servidor Beta se cerro (codigo %EXIT_CODE%).
echo Presione una tecla para reintentar el inicio...
pause >nul
goto :START_SERVER
