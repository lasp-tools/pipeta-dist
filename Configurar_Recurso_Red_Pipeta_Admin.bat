@echo off
title Configurar Recurso Compartido de Red (Pipeta)

:: Verificar si somos Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Solicitando permisos de Administrador...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"C:\STORAGE\Z\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta\Configurar_Recurso_Red_Pipeta_Admin.bat\"\"' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   CONFIGURACION DEL RECURSO COMPARTIDO DE RED: \\LASP-VM\Pipeta
echo ============================================================
echo.

set "SHARE_NAME=Pipeta"
set "SHARE_PATH=C:\STORAGE\Z\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"

if not exist "%SHARE_PATH%" (
    echo [ERROR] No existe la ruta fisica: %SHARE_PATH%
    pause
    exit /b 1
)

echo [1/2] Eliminando recurso compartido anterior...
net share %SHARE_NAME% /DELETE

echo.
echo [2/2] Creando nuevo recurso compartido para %SHARE_PATH%...
net share %SHARE_NAME%="%SHARE_PATH%" /GRANT:Todos,FULL
if %errorlevel% neq 0 (
    net share %SHARE_NAME%="%SHARE_PATH%" /GRANT:Everyone,FULL
)

echo.
echo ============================================================
echo   VERIFICACION:
echo ============================================================
net share %SHARE_NAME%
echo.
echo ============================================================
echo   OK: Recurso configurado con exito.
echo ============================================================
echo.
pause
