@echo off
setlocal enabledelayedexpansion
title Publicar Pipeta a Produccion del Estudio (Z: -> S:)

echo ============================================================
echo   PUBLICADOR DE PIPETA: LIVE DEV (Z:) -^> PRODUCCION ESTUDIO (S:)
echo ============================================================
echo.

set "SRC=Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"
set "DEST=S:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"

if not exist "%SRC%\server\server.js" (
    echo [ERROR] No se encontro el origen de desarrollo en %SRC%.
    pause
    exit /b 1
)

if not exist "S:\INTERNO\TOOLS" (
    echo [ERROR] No se tiene acceso a la unidad S:\INTERNO\TOOLS.
    echo Verifica que la unidad de red S: este conectada en este equipo.
    echo.
    pause
    exit /b 1
)

echo [1/3] Verificando rutas...
echo   - Origen Dev (Local):        %SRC%
echo   - Destino Produccion (Red):  %DEST%
echo.

if not exist "%DEST%" mkdir "%DEST%"

echo [2/3] Sincronizando archivos principales con Robocopy...
robocopy "%SRC%" "%DEST%" /MIR /R:2 /W:2 /MT:16 /XD .git .gemini logs node_modules\.cache /XF *.zip *.log *.tmp /NFL /NDL /NJH /NJS

echo [3/3] Sincronizando presets sin sobreescribir configs del estudio...
if exist "%SRC%\presets" (
    robocopy "%SRC%\presets" "%DEST%\presets" /E /XO /XN /XC /NFL /NDL /NJH /NJS /R:0 /W:0
)

if exist "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Instalar_o_Actualizar_Pipeta_Local.bat" (
    copy /Y "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Instalar_o_Actualizar_Pipeta_Local.bat" "S:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Instalar_o_Actualizar_Pipeta_Local.bat" >nul 2>&1
)

if exist "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta_*.zip" (
    copy /Y "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta_*.zip" "S:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\" >nul 2>&1
)

echo.
echo ============================================================
echo   OK: Pipeta ha sido publicada con exito en S: (Z: del estudio)
echo   Los artistas ya tienen disponible la version actualizada.
echo ============================================================
echo.
pause
