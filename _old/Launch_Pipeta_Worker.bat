@echo off
title Pipeta Sync Worker - Motor de Transferencias (VM 105)
setlocal enabledelayedexpansion

echo ======================================================================
echo          PIPETA SYNC WORKER ^& DAEMON DE COLA (STUDIO DAEMON)
echo ======================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "NODE_EXE=%SCRIPT_DIR%bin\node\node.exe"

if not exist "%NODE_EXE%" (
    where node >nul 2>&1
    if %errorlevel% equ 0 (
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

:loop
echo [%date% %time%] Iniciando Pipeta Sync Worker...
"%NODE_EXE%" "%SCRIPT_DIR%server\sync_worker.js"

echo.
echo [%date% %time%] El proceso finalizo o se detuvo.
echo Reiniciando en 10 segundos (Presione Ctrl+C para abortar)...
timeout /t 10
goto loop
