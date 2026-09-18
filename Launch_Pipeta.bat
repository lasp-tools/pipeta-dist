@echo off
setlocal enabledelayedexpansion
set "APP_NAME=PIPETA"
set "APP_VERSION=v1.1.10"
set "APP_PORT=3002"
set "LOCAL_DIR=C:\TOOLS\APPS\Pipeta"
set "SERVER_DIR=%LOCAL_DIR%\server"
set "NETWORK_DIR=Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"
if not exist "%NETWORK_DIR%\server\server.js" (
    if exist "\\LASP-VM\Pipeta\server\server.js" (
        set "NETWORK_DIR=\\LASP-VM\Pipeta"
    )
)
set "RESTART_FLAG=%TEMP%\pipeta_restarting.flag"
set "PIPETA_SUPERVISED=1"

title %APP_NAME% %APP_VERSION% Manager

:: Si Pipeta ya esta corriendo en segundo plano, abrir directamente el navegador y salir
if not exist "%RESTART_FLAG%" (
    curl.exe -s -f -m 1 http://localhost:%APP_PORT%/api/version >nul 2>&1
    if !errorlevel! equ 0 (
        echo ====================================================
        echo   %APP_NAME% - %APP_VERSION%
        echo ====================================================
        echo [INFO] Pipeta ya se encuentra en ejecucion en segundo plano.
        echo [INFO] Abriendo aplicacion en el navegador...
        start "" "http://localhost:%APP_PORT%"
        ping 127.0.0.1 -n 2 >nul
        exit
    )
)

:: 1. Detectar si estamos ejecutando desde el disco local C:
if /i "%~dp0"=="%LOCAL_DIR%\" goto :RUN_LOCAL

:: 2. Si no estamos en C:, somos el lanzador desde Red (Z:) -> Sincronizar y transferir ejecucion a C:
echo ====================================================
echo   %APP_NAME% - %APP_VERSION% (Sincronizador)
echo ====================================================
echo [INFO] Sincronizando archivos a disco local en %LOCAL_DIR%...

if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"

robocopy "%~dp0." "%LOCAL_DIR%" /MIR /XD .git .gemini presets logs _SYNC_CACHE /XF *.log *.tmp /NFL /NDL /NJH /NJS /R:0 /W:0

if exist "%~dp0presets" (
    if not exist "%LOCAL_DIR%\presets" mkdir "%LOCAL_DIR%\presets"
    robocopy "%~dp0presets" "%LOCAL_DIR%\presets" /E /XO /XN /XC /NFL /NDL /NJH /NJS /R:0 /W:0
)

echo [INFO] Sincronizacion completada.
echo [INFO] Lanzando instancia local segura de Pipeta...
timeout /t 1 >nul

start "" "%LOCAL_DIR%\Launch_Pipeta.bat"
exit

:RUN_LOCAL
title %APP_NAME% %APP_VERSION% (LOCAL RUNTIME - Port %APP_PORT%)
echo ====================================================
echo   %APP_NAME% - %APP_VERSION% (Disco Local)
echo   Puerto: %APP_PORT%
echo ====================================================
echo.

:START_SERVER
echo [INFO] Verificando puerto %APP_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":%APP_PORT% *LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

cd /d "%SERVER_DIR%"

set "NODE_BIN=node"
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%LOCAL_DIR%\bin\node\node.exe" (
        set "NODE_BIN=%LOCAL_DIR%\bin\node\node.exe"
    ) else (
        echo [ERROR] No se encontro Node.js en el sistema ni en bin\node\node.exe
        pause
        exit /b 1
    )
)

echo [INFO] Iniciando Servidor en Puerto %APP_PORT%...
set "PORT=%APP_PORT%"
"%NODE_BIN%" server.js
set "EXIT_CODE=%errorlevel%"

:: Si hay flag de reinicio o codigo 42, reiniciamos limpiamente sin colgar
if exist "%RESTART_FLAG%" (
    echo.
    echo [INFO] Reinicio solicitado por la aplicacion. Sincronizando y relanzando...
    if exist "%NETWORK_DIR%" (
        robocopy "%NETWORK_DIR%" "%LOCAL_DIR%" /MIR /XD .git .gemini presets logs _SYNC_CACHE /XF *.log *.tmp /NFL /NDL /NJH /NJS /R:0 /W:0
    )
    timeout /t 1 >nul
    goto :START_SERVER
)

if %EXIT_CODE% equ 42 (
    echo.
    echo [INFO] Reinicio solicitado (codigo 42). Relanzando servidor...
    if exist "%NETWORK_DIR%" (
        robocopy "%NETWORK_DIR%" "%LOCAL_DIR%" /MIR /XD .git .gemini presets logs _SYNC_CACHE /XF *.log *.tmp /NFL /NDL /NJH /NJS /R:0 /W:0
    )
    timeout /t 1 >nul
    goto :START_SERVER
)

:: Salida limpia (cierre de aplicacion)
if %EXIT_CODE% equ 0 (
    echo [INFO] Servidor cerrado correctamente.
    exit
)

:: En caso de terminacion forzosa o error no intencional, permitir relanzar presionando una tecla
echo.
echo [ERROR] El servidor se cerro (codigo %EXIT_CODE%).
echo Presione una tecla para reintentar el inicio...
pause >nul
goto :START_SERVER
