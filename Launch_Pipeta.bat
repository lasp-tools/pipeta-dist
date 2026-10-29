@echo off
setlocal enabledelayedexpansion
set "APP_NAME=PIPETA"
set "APP_VERSION=v1.1.77"
set "APP_PORT=3002"
set "PIPETA_SUPERVISED=1"

title %APP_NAME% %APP_VERSION% - Puerto %APP_PORT%

echo ====================================================
echo   %APP_NAME% - %APP_VERSION% (Disco Local)
echo   Puerto: %APP_PORT%
echo ====================================================
echo.

:: 1. Procesar argumentos de inicio
for %%a in (%*) do (
    if /i "%%a"=="--no-browser" set "PIPETA_NO_BROWSER=1"
    if /i "%%a"=="--restart" set "PIPETA_NO_BROWSER=1"
)

set "SCRIPT_DIR=%~dp0"
set "LOCAL_DIR=C:\TOOLS\APPS\Pipeta"

set "SERVER_DIR=%SCRIPT_DIR%server"
if not exist "%SERVER_DIR%\server.js" (
    if exist "%LOCAL_DIR%\server\server.js" (
        set "SERVER_DIR=%LOCAL_DIR%\server"
    )
)

:: 2. Detectar binario de Node.js (preferir local portable)
set "NODE_BIN="
if exist "%LOCAL_DIR%\bin\node\node.exe" (
    set "NODE_BIN=%LOCAL_DIR%\bin\node\node.exe"
) else if exist "%SCRIPT_DIR%bin\node\node.exe" (
    set "NODE_BIN=%SCRIPT_DIR%bin\node\node.exe"
) else (
    where node.exe >nul 2>&1
    if !errorlevel! equ 0 (
        set "NODE_BIN=node.exe"
    )
)

:: Auto-hidratar dependencias y runtimes si falta Node.js en equipo nuevo
if "%NODE_BIN%"=="" (
    echo [INFO] Node.js no detectado en este puesto.
    echo [INFO] Buscando paquete portable en deposito central...
    
    set "DEPOT_ZIP="
    if exist "S:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip" (
        set "DEPOT_ZIP=S:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip"
    ) else if exist "Z:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip" (
        set "DEPOT_ZIP=Z:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip"
    ) else if exist "\\192.168.206.116\Z\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip" (
        set "DEPOT_ZIP=\\192.168.206.116\Z\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip"
    )
    
    if not "!DEPOT_ZIP!"=="" (
        echo [INFO] Descargando runtimes portables...
        if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"
        copy /y "!DEPOT_ZIP!" "%LOCAL_DIR%\pipeta_dependencies.zip" >nul
        if !errorlevel! equ 0 (
            tar.exe -xf "%LOCAL_DIR%\pipeta_dependencies.zip" -C "%LOCAL_DIR%"
            del /f /q "%LOCAL_DIR%\pipeta_dependencies.zip" >nul 2>&1
        ) else (
            tar.exe -xf "!DEPOT_ZIP!" -C "%LOCAL_DIR%"
        )
        if exist "%LOCAL_DIR%\bin\node\node.exe" (
            set "NODE_BIN=%LOCAL_DIR%\bin\node\node.exe"
            echo [OK] Runtimes portables instalados exitosamente.
        )
    )
)

if "%NODE_BIN%"=="" (
    echo [ERROR] No se encontro Node.js en bin\node\node.exe ni en el sistema.
    pause
    exit /b 1
)

:: 3. Iniciar servidor
cd /d "%SERVER_DIR%"
set "PORT=%APP_PORT%"

:: Limpiar procesos previos de Pipeta en ejecucion
powershell -NoProfile -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Pipeta*' } | Stop-Process -Force" 2>nul

:START_SERVER
echo [INFO] Iniciando %APP_NAME% %APP_VERSION% en puerto %APP_PORT%...

if "%PIPETA_NO_BROWSER%"=="1" (
    "%NODE_BIN%" server.js --no-browser
) else (
    "%NODE_BIN%" server.js %*
)
set "EXIT_CODE=%errorlevel%"

set "RESTART_FLAG=%TEMP%\pipeta_restarting.flag"
if exist "%RESTART_FLAG%" (
    del /f /q "%RESTART_FLAG%" >nul 2>&1
    set "PIPETA_NO_BROWSER=1"
    ping 127.0.0.1 -n 3 >nul
    goto :START_SERVER
)

if %EXIT_CODE% equ 42 (
    echo [INFO] Reinicio solicitado con codigo 42. Relanzando servidor...
    set "PIPETA_NO_BROWSER=1"
    ping 127.0.0.1 -n 3 >nul
    goto :START_SERVER
)

if %EXIT_CODE% equ 0 (
    echo [INFO] Servidor cerrado correctamente.
    exit /b 0
)

echo.
echo [WARN] El servidor finalizo con codigo %EXIT_CODE%.
echo [INFO] Reintentando en 3 segundos... Presione Ctrl+C para detener.
ping 127.0.0.1 -n 4 >nul
goto :START_SERVER
