@echo off
setlocal enabledelayedexpansion
title Pipeta - Instalador de Dependencias y Runtimes

echo ============================================================
echo   PIPETA - CONFIGURACION DE DEPENDENCIAS Y RUNTIMES
echo ============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "BIN_DIR=%SCRIPT_DIR%bin"
set "TOOLS_DIR=%SCRIPT_DIR%tools"
set "SERVER_DIR=%SCRIPT_DIR%server"
set "DEPOT_ZIP=Z:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip"

:: 1. Verificar si las dependencias ya estan presentes
if exist "%BIN_DIR%\node\node.exe" (
    if exist "%BIN_DIR%\python\python.exe" (
        if exist "%TOOLS_DIR%\rclone\rclone.exe" (
            echo [OK] Todas las dependencias principales ya estan instaladas.
            goto :CHECK_NPM
        )
    )
)

echo [INFO] Faltan dependencias o runtimes pesados en esta copia.
echo [INFO] Buscando paquete maestro en el deposito central...
echo.

:: 2. Intentar hidratar desde el Deposito central (_DEPOT)
if exist "%DEPOT_ZIP%" (
    echo [INFO] Deposito detectado: %DEPOT_ZIP%
    echo [INFO] Copiando paquete comprimido a disco local (alta velocidad)...
    copy /Y "%DEPOT_ZIP%" "%SCRIPT_DIR%pipeta_dependencies.zip" >nul
    if !errorlevel! equ 0 (
        echo [INFO] Descomprimiendo dependencias con tar nativo...
        tar.exe -xf "%SCRIPT_DIR%pipeta_dependencies.zip" -C "%SCRIPT_DIR%"
        del /f /q "%SCRIPT_DIR%pipeta_dependencies.zip" >nul 2>&1
        echo [OK] Dependencias extraidas correctamente.
    ) else (
        echo [WARN] Fallo la copia del paquete zip desde la red.
    )
) else if exist "%SCRIPT_DIR%pipeta_dependencies.zip" (
    echo [INFO] Paquete local pipeta_dependencies.zip detectado.
    echo [INFO] Descomprimiendo dependencias...
    tar.exe -xf "%SCRIPT_DIR%pipeta_dependencies.zip" -C "%SCRIPT_DIR%"
    echo [OK] Dependencias extraidas correctamente.
) else (
    echo [ERROR] No se encontro Z:\INTERNO\TOOLS\_DEPOT ni pipeta_dependencies.zip local.
    echo Si estas en una sede remota (Espana) o sin conexion al servidor central,
    echo solicita o descarga el archivo pipeta_dependencies.zip y colocalo en:
    echo   %SCRIPT_DIR%
    echo.
    pause
    exit /b 1
)

:CHECK_NPM
:: 3. Verificar modulos de Node (server/node_modules)
echo.
echo [INFO] Verificando librerias de Node.js en server/node_modules...
if not exist "%SERVER_DIR%\node_modules" (
    echo [INFO] Instalando librerias de Node requeridas...
    cd /d "%SERVER_DIR%"
    if exist "%BIN_DIR%\node\npm.cmd" (
        call "%BIN_DIR%\node\npm.cmd" install --no-audit --no-fund
    ) else (
        call npm install --no-audit --no-fund
    )
    cd /d "%SCRIPT_DIR%"
) else (
    echo [OK] Librerias de Node.js listas.
)

echo.
echo ============================================================
echo   OK: Pipeta esta 100%% configurada y lista para ejecutar.
echo ============================================================
echo.
pause
exit /b 0
