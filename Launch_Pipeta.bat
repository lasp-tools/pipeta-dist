@echo off
set "APP_NAME=PIPETA"
set "APP_VERSION=v0.9.02"
set "LOCAL_DIR=C:\TOOLS\APPS\Pipeta"
set "SERVER_DIR=%LOCAL_DIR%\server"

title %APP_NAME% %APP_VERSION% Manager

:: 1. Detectar si estamos ejecutando desde el disco local C:
if /i "%~dp0"=="%LOCAL_DIR%\" goto :RUN_LOCAL

:: 2. Si no estamos en C:, somos el sincronizador (estamos en M: o similar)
echo ====================================================
echo   %APP_NAME% - %APP_VERSION% (Sync Mode)
echo ====================================================
echo [INFO] Sincronizando archivos a disco local...

:: Creamos el directorio si no existe
if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"

:: Copiamos todo EXCEPTO repositorios temporales .git/.gemini y presets
:: Usamos robocopy para ser eficientes
robocopy "%~dp0." "%LOCAL_DIR%" /MIR /XD .git .gemini presets /NFL /NDL /NJH /NJS /R:0 /W:0

echo [INFO] Sincronizacion completada.
echo [INFO] Lanzando instancia local segura...
ping 127.0.0.1 -n 2 >nul

:: Lanzamos el mismo archivo pero en su ubicación local
start "" "%LOCAL_DIR%\Launch_Pipeta.bat"
exit

:RUN_LOCAL
:: 3. Logica de ejecucion real (Solo ocurre en C:)
title %APP_NAME% %APP_VERSION% (LOCAL RUNTIME)
echo ====================================================
echo   %APP_NAME% - %APP_VERSION% (Disco Local)
echo ====================================================
echo.

echo [INFO] Cerrando instancias previas de Pipeta (Puerto 3002)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":3002 *LISTENING"') do taskkill /F /PID %%a >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo.

cd /d "%SERVER_DIR%"

:: Verificar si node esta en PATH, o usar el binario portable
set "NODE_BIN=node"
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%LOCAL_DIR%\bin\node\node.exe" (
        set "NODE_BIN=%LOCAL_DIR%\bin\node\node.exe"
        echo [INFO] Usando Node.js Portable desde bin\node\node.exe
    ) else (
        echo [ERROR] No se encontro Node.js en el sistema ni en bin\node\node.exe
        pause
        exit /b 1
    )
)

echo [INFO] Iniciando Servidor en Puerto 3002...
"%NODE_BIN%" server.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] El servidor se cerro inesperadamente.
    pause
)

:: Force Window Close on clean exit
exit
