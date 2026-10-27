@echo off
setlocal enabledelayedexpansion
title Pipeta Sync Worker - [%COMPUTERNAME%]

echo ====================================================
echo   PIPETA - SYNC WORKER DAEMON
echo   Host: %COMPUTERNAME%
echo ====================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: 1. Detectar binario de Node.js
set "NODE_BIN="
if exist "%SCRIPT_DIR%bin\node\node.exe" (
    set "NODE_BIN=%SCRIPT_DIR%bin\node\node.exe"
) else if exist "C:\TOOLS\APPS\Pipeta\bin\node\node.exe" (
    set "NODE_BIN=C:\TOOLS\APPS\Pipeta\bin\node\node.exe"
) else (
    where node.exe >nul 2>&1
    if !errorlevel! equ 0 (
        set "NODE_BIN=node.exe"
    )
)

:: Auto-hidratar dependencias y runtimes si falta Node.js en equipo nuevo
if "%NODE_BIN%"=="" (
    echo [INFO] Node.js no detectado en este worker.
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
        copy /y "!DEPOT_ZIP!" "%SCRIPT_DIR%pipeta_dependencies.zip" >nul
        if !errorlevel! equ 0 (
            tar.exe -xf "%SCRIPT_DIR%pipeta_dependencies.zip" -C "%SCRIPT_DIR%"
            del /f /q "%SCRIPT_DIR%pipeta_dependencies.zip" >nul 2>&1
        ) else (
            tar.exe -xf "!DEPOT_ZIP!" -C "%SCRIPT_DIR%"
        )
        if exist "%SCRIPT_DIR%bin\node\node.exe" (
            set "NODE_BIN=%SCRIPT_DIR%bin\node\node.exe"
            echo [OK] Runtimes portables instalados exitosamente.
        )
    )
)

if "%NODE_BIN%"=="" (
    echo [ERROR] No se encontro Node.js en bin\node\node.exe ni en el PATH del sistema.
    pause
    exit /b 1
)

:: 2. Bucle de ejecución resiliente
:RUN_WORKER
echo [INFO] Iniciando Sync Worker con: %NODE_BIN%
"%NODE_BIN%" server\sync_worker.js %*
set "EXIT_CODE=%errorlevel%"

echo.
echo [WARN] El worker finalizo con codigo %EXIT_CODE%.
echo [INFO] Reiniciando en 3 segundos... (Presiona Ctrl+C para detener)
timeout /t 3 >nul
goto :RUN_WORKER
