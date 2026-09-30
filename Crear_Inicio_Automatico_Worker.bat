@echo off
title Configurar Inicio Automatico de Pipeta Worker
setlocal enabledelayedexpansion

echo ======================================================================
echo       PIPETA - CONFIGURAR INICIO AUTOMATICO DEL WORKER
echo                    La Sociedad Post (LASP)
echo ======================================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "BAT_PATH=%SCRIPT_DIR%Launch_Pipeta_Worker.bat"

if not exist "%BAT_PATH%" (
    echo [ERROR] No se encontro el archivo:
    echo   %BAT_PATH%
    echo.
    pause
    exit /b 1
)

echo [INFO] Creando Tarea Programada de Windows 'PipetaWorker'...
echo [INFO] Ruta del script: %BAT_PATH%
echo.

:: Crear tarea programada que inicia al iniciar sesión el usuario actual
schtasks /create /tn "PipetaWorker" /tr "\"%BAT_PATH%\"" /sc ONLOGON /rl HIGHEST /f

if %errorlevel% equ 0 (
    echo.
    echo ======================================================================
    echo   [EXITO] La Tarea Programada 'PipetaWorker' fue creada correctamente.
    echo.
    echo   A partir de ahora:
    echo   1. El Worker iniciara automaticamente cada vez que se encienda o
    echo      inicie sesion en este equipo.
    echo   2. Pipeta Server podra encenderlo remotamente por red con 1 clic.
    echo ======================================================================
) else (
    echo.
    echo [ERROR] No se pudo crear la Tarea Programada. 
    echo Intente ejecutar este archivo haciendo clic derecho: "Ejecutar como Administrador".
)

echo.
pause
