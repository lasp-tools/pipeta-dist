@echo off
title Pipeta Server - Control ^& Supervision de Workers (:3005)
setlocal enabledelayedexpansion

echo ======================================================================
echo          PIPETA SERVER - CONTROL ^& SUPERVISION DE WORKERS
echo                    La Sociedad Post (LASP)
echo ======================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "NODE_EXE=%SCRIPT_DIR%bin\node\node.exe"
set "PORT=3005"

if not exist "%NODE_EXE%" (
    if exist "C:\TOOLS\APPS\Pipeta\bin\node\node.exe" (
        set "NODE_EXE=C:\TOOLS\APPS\Pipeta\bin\node\node.exe"
    ) else (
        where node >nul 2>&1
        if !errorlevel! equ 0 (
            set "NODE_EXE=node"
        ) else (
            echo [ERROR] No se encontro ejecutable de Node.js en:
            echo   %NODE_EXE%
            echo   Ni en el PATH del sistema.
            echo.
            pause
            exit /b 1
        )
    )
)

:: Verificar si el servidor ya esta corriendo en el puerto 3005
curl.exe -s -f -m 1 http://localhost:%PORT%/api/server/status >nul 2>&1
if !errorlevel! equ 0 (
    echo [INFO] Pipeta Server ya esta en ejecucion en el puerto %PORT%.
    echo [INFO] Abriendo Dashboard en el navegador...
    start "" "http://localhost:%PORT%"
    ping 127.0.0.1 -n 2 >nul
    exit /b 0
)

echo [INFO] Iniciando Pipeta Server en el puerto %PORT%...
echo [INFO] URL Local: http://localhost:%PORT%
echo.

:: Abrir navegador en segundo plano tras 1 segundo
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%"

:loop
echo [%date% %time%] Levantando Pipeta Server...
"%NODE_EXE%" "%SCRIPT_DIR%server\pipeta_server.js"

echo.
echo [%date% %time%] El servicio se detuvo.
echo Reiniciando en 5 segundos (Presione Ctrl+C para abortar)...
timeout /t 5
goto loop
