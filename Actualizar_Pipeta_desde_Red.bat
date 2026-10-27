@echo off
setlocal enabledelayedexpansion
title Sincronizar Pipeta desde Servidor Maestro (Robocopy)

set "APP_VERSION=v1.1.66"
set "DEST=C:\TOOLS\APPS\Pipeta"

set "SRC="
if exist "S:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta\server\server.js" (
    set "SRC=S:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"
) else if exist "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta\server\server.js" (
    set "SRC=Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"
) else if exist "\\192.168.206.116\Z\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta\server\server.js" (
    set "SRC=\\192.168.206.116\Z\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"
)

if "%SRC%"=="" (
    echo [ERROR] No se pudo acceder al servidor maestro de Pipeta.
    echo Se verificaron las siguientes rutas:
    echo   - S:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta
    echo   - Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta
    echo   - \\192.168.206.116\Z\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta
    echo Verifica que la red este activa o que la unidad Z: este conectada.
    ping 127.0.0.1 -n 5 >nul
    exit /b 1
)

REM --- Si se ejecuta desde C:\ (copia local vieja), saltar automaticamente a la ultima version del script en Red via TEMP ---
if /i not "%~1"=="--from-temp" (
    if exist "%SRC%\Actualizar_Pipeta_desde_Red.bat" (
        copy /y "%SRC%\Actualizar_Pipeta_desde_Red.bat" "%TEMP%\Pipeta_Updater_Run.bat" >nul 2>&1
        if exist "%TEMP%\Pipeta_Updater_Run.bat" (
            "%TEMP%\Pipeta_Updater_Run.bat" --from-temp
            exit /b 0
        )
    )
)

REM --- Detectar dinamicamente la version actual publicada en el servidor maestro (%SRC%) ---
if exist "%SRC%\Actualizar_Pipeta_desde_Red.bat" (
    for /f "tokens=2 delims==" %%v in ('findstr /i "APP_VERSION=v" "%SRC%\Actualizar_Pipeta_desde_Red.bat"') do (
        set "NET_VER=%%v"
        set "NET_VER=!NET_VER:"=!"
        if not "!NET_VER!"=="" set "APP_VERSION=!NET_VER!"
    )
)

title Sincronizar Pipeta !APP_VERSION! desde Servidor Maestro
echo Origen Maestro: %SRC%
echo Destino Local:  %DEST%
echo Version en Red: !APP_VERSION!
echo.

echo [1/3] Cerrando instancias previas de Pipeta en puerto 3002...
powershell -NoProfile -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Pipeta*' } | Stop-Process -Force" 2>nul
ping 127.0.0.1 -n 2 >nul

echo [2/3] Sincronizando y reinstalando archivos limpios con Robocopy desde %SRC%...
if not exist "%DEST%" mkdir "%DEST%"

robocopy "%SRC%" "%DEST%" /MIR /R:1 /W:1 /MT:16 /XD .git .gemini logs presets _SYNC_CACHE credentials bin tools node_modules _old /XF *.zip *.log *.tmp /NFL /NDL /NJH /NJS

if exist "%SRC%\presets" (
    robocopy "%SRC%\presets" "%DEST%\presets" /E /XO /NFL /NDL /NJH /NJS /R:0 /W:0
)

REM --- Verificar e hidratar Node.js y dependencias si faltan ---
set "NEED_HYDRATION=0"
if not exist "%DEST%\bin\node\node.exe" set "NEED_HYDRATION=1"
if not exist "%DEST%\server\node_modules\express" set "NEED_HYDRATION=1"

if "!NEED_HYDRATION!"=="1" (
    echo.
    echo [INFO] Runtimes o librerias de Node.js faltantes en el equipo local.
    echo [INFO] Descargando y extrayendo dependencias y runtimes desde el deposito central...
    
    set "DEPOT_ZIP="
    if exist "S:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip" (
        set "DEPOT_ZIP=S:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip"
    ) else if exist "Z:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip" (
        set "DEPOT_ZIP=Z:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip"
    ) else if exist "\\192.168.206.116\Z\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip" (
        set "DEPOT_ZIP=\\192.168.206.116\Z\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip"
    )
    
    if not "!DEPOT_ZIP!"=="" (
        copy /y "!DEPOT_ZIP!" "%DEST%\pipeta_dependencies.zip" >nul
        if !errorlevel! equ 0 (
            tar.exe -xf "%DEST%\pipeta_dependencies.zip" -C "%DEST%"
            del /f /q "%DEST%\pipeta_dependencies.zip" >nul 2>&1
            echo [OK] Runtimes portables instalados con exito.
        ) else (
            echo [WARN] Fallo la copia local. Intentando extraer directo desde red...
            tar.exe -xf "!DEPOT_ZIP!" -C "%DEST%"
        )
    ) else (
        echo [WARN] No se encontro el deposito central de dependencias.
    )
)

echo [3/3] Actualizando acceso directo en Escritorio con icono oficial...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Pipeta.lnk')); $s.TargetPath = 'C:\TOOLS\APPS\Pipeta\Launch_Pipeta.bat'; $s.WorkingDirectory = 'C:\TOOLS\APPS\Pipeta'; $ico = 'C:\TOOLS\APPS\Pipeta\Pipeta.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Description = 'Pipeta - VFX Pipeline Manager'; $s.Save()" 2>nul

echo.
echo ============================================================
echo   OK: Pipeta !APP_VERSION! reinstalada con exito en %DEST%
echo ============================================================
echo.
ping 127.0.0.1 -n 2 >nul

cd /d "%DEST%"
if exist "%DEST%\Launch_Pipeta.bat" (
    start "" "%DEST%\Launch_Pipeta.bat"
) else (
    echo [ERROR] No se encontro Launch_Pipeta.bat en %DEST%
    pause
)
exit
