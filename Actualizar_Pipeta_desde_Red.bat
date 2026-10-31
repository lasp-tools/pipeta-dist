@echo off
setlocal enabledelayedexpansion
title Sincronizar Pipeta (Local / Remoto)

set "APP_VERSION=v1.1.82"
set "DEST=C:\TOOLS\APPS\Pipeta"

:: Si se pasa --from-temp con un destino especifico
if /i "%~1"=="--from-temp" (
    if not "%~2"=="" set "DEST=%~2"
    goto :STUDIO_UPDATE_EXEC
)

:: Si se pasa --from-temp-remote con un destino especifico
if /i "%~1"=="--from-temp-remote" (
    if not "%~2"=="" set "DEST=%~2"
    goto :REMOTE_UPDATE_EXEC
)

:: Determinar si se ejecuta desde una carpeta de aplicacion instalada
set "CURRENT_DIR=%~dp0"
if "%CURRENT_DIR:~-1%"=="\" set "CURRENT_DIR=%CURRENT_DIR:~0,-1%"
if exist "%CURRENT_DIR%\Launch_Pipeta.bat" (
    set "DEST=%CURRENT_DIR%"
)

:: 1. Deteccion de red del estudio (Z: local / SMB)
set "SRC="
if exist "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta\server\server.js" (
    set "SRC=Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"
) else if exist "\\192.168.206.116\Z\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta\server\server.js" (
    set "SRC=\\192.168.206.116\Z\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"
)

:: Si no se detecto red interna del estudio, pasar al actualizador Remoto (GitHub / Google Drive)
if "%SRC%"=="" (
    goto :REMOTE_UPDATE_PREP
)

:: ============================================================
:: MODO ESTUDIO (MUNRO / RED INTERNA / SMB)
:: ============================================================
:STUDIO_UPDATE_PREP
:: Si se ejecuta desde el destino local, saltar a TEMP para no autobloquear archivos en ejecucion
if /i not "%~1"=="--from-temp" (
    if exist "%SRC%\Actualizar_Pipeta_desde_Red.bat" (
        copy /y "%SRC%\Actualizar_Pipeta_desde_Red.bat" "%TEMP%\Pipeta_Updater_Run.bat" >nul 2>&1
        if exist "%TEMP%\Pipeta_Updater_Run.bat" (
            "%TEMP%\Pipeta_Updater_Run.bat" --from-temp "%DEST%"
            exit /b 0
        )
    )
)

:STUDIO_UPDATE_EXEC
:: Detectar dinamicamente la version en red
if exist "%SRC%\Actualizar_Pipeta_desde_Red.bat" (
    for /f "tokens=2 delims==" %%v in ('findstr /i "APP_VERSION=v" "%SRC%\Actualizar_Pipeta_desde_Red.bat"') do (
        set "NET_VER=%%v"
        set "NET_VER=!NET_VER:"=!"
        if not "!NET_VER!"=="" set "APP_VERSION=!NET_VER!"
    )
)

title Sincronizar Pipeta !APP_VERSION! desde Servidor Maestro
echo ============================================================
echo   ACTUALIZACION DE PIPETA (RED ESTUDIO)
echo   Origen Maestro: %SRC%
echo   Destino Local:  %DEST%
echo   Version en Red: !APP_VERSION!
echo ============================================================
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
    echo [INFO] Descargando y extrayendo dependencias desde el deposito central...
    
    set "DEPOT_ZIP="
    if exist "Z:\INTERNO\TOOLS\_DEPOT\packages\pipeta_dependencies.zip" (
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
        echo [WARN] No se encontro el deposito central de dependencias en red.
    )
)

goto :FINALIZE_UPDATE


:: ============================================================
:: MODO REMOTO (FREELANCE / GITHUB + GOOGLE DRIVE)
:: ============================================================
:REMOTE_UPDATE_PREP
echo [INFO] Servidor local de estudio no detectado.
echo [INFO] Conmutando a modo Remoto (GitHub / Google Drive)...

if /i not "%~1"=="--from-temp-remote" (
    copy /y "%~f0" "%TEMP%\Pipeta_Remote_Updater.bat" >nul 2>&1
    if exist "%TEMP%\Pipeta_Remote_Updater.bat" (
        "%TEMP%\Pipeta_Remote_Updater.bat" --from-temp-remote "%DEST%"
        exit /b 0
    )
)

:REMOTE_UPDATE_EXEC
title Actualizar Pipeta via GitHub y Google Drive
echo.
echo ============================================================
echo   ACTUALIZACION DE PIPETA REMOTA (GITHUB + DRIVE)
echo   Destino: %DEST%
echo ============================================================
echo.

echo [1/3] Cerrando instancias previas de Pipeta en puerto 3002...
powershell -NoProfile -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Pipeta*' } | Stop-Process -Force" 2>nul
ping 127.0.0.1 -n 2 >nul

echo [2/3] Sincronizando ultima version oficial en la nube...
set "GIT_TERMINAL_PROMPT=0"
set "GCM_INTERACTIVE=never"
set "REMOTE_CODE_OK=0"

if exist "%DEST%\presets\users_config.json" (
    copy /y "%DEST%\presets\users_config.json" "%TEMP%\pipeta_users_cfg_bak.json" >nul 2>&1
)

where.exe git >nul 2>&1
if !errorlevel! equ 0 (
    cd /d "%DEST%"
    set "GH_REPO=https://github.com/lasp-tools/pipeta-dist.git"
    if not exist "%DEST%\.git" (
        echo [INFO] Conectando carpeta local con repositorio GitHub...
        git init >nul 2>&1
        git remote add origin !GH_REPO! >nul 2>&1
    ) else (
        git remote set-url origin !GH_REPO! >nul 2>&1
    )
    echo [INFO] Descargando ultimas actualizaciones desde GitHub (main)...
    git -c credential.interactive=never fetch origin main --quiet >nul 2>&1
    if !errorlevel! equ 0 (
        git reset --hard origin/main >nul 2>&1
        set "REMOTE_CODE_OK=1"
        echo [OK] Codigo actualizado con exito desde GitHub.
    ) else (
        echo [WARN] Fallo git fetch. Intentando descarga directa desde GitHub...
    )
)

if "!REMOTE_CODE_OK!"=="0" (
    echo [INFO] Descargando actualizacion directa desde GitHub (ZIP)...
    set "GH_ZIP=%TEMP%\pipeta_gh_main.zip"
    curl.exe -L -s -f "https://github.com/lasp-tools/pipeta-dist/archive/refs/heads/main.zip" -o "!GH_ZIP!"
    if exist "!GH_ZIP!" (
        tar.exe -xf "!GH_ZIP!" --strip-components=1 -C "%DEST%"
        del /f /q "!GH_ZIP!" >nul 2>&1
        set "REMOTE_CODE_OK=1"
        echo [OK] Codigo actualizado con exito desde GitHub (ZIP).
    )
)

if exist "%TEMP%\pipeta_users_cfg_bak.json" (
    powershell -NoProfile -Command "try { $bak = Get-Content '%TEMP%\pipeta_users_cfg_bak.json' -Raw | ConvertFrom-Json; $cur = Get-Content '%DEST%\presets\users_config.json' -Raw | ConvertFrom-Json; $cur.users = $bak.users; $cur.activeUser = $bak.activeUser; $cur | ConvertTo-Json -Depth 10 | Set-Content '%DEST%\presets\users_config.json' -Encoding UTF8 } catch {}" 2>nul
    del /f /q "%TEMP%\pipeta_users_cfg_bak.json" >nul 2>&1
)

echo [3/3] Verificando dependencias y runtimes de Node y Python...
set "NEED_HYDRATION=0"
if not exist "%DEST%\bin\node\node.exe" set "NEED_HYDRATION=1"
if not exist "%DEST%\server\node_modules\express" set "NEED_HYDRATION=1"
if not exist "%DEST%\bin\python\python.exe" set "NEED_HYDRATION=1"
if not exist "%DEST%\bin\python\python310.zip" set "NEED_HYDRATION=1"

if "!NEED_HYDRATION!"=="1" (
    echo [INFO] Dependencias o runtimes faltantes detectados.
    echo [INFO] Descargando pipeta_dependencies.zip desde Google Drive (LaSP_Tools)...
    
    set "RCLONE_EXE=%DEST%\tools\rclone\rclone.exe"
    set "RCLONE_CONF=%DEST%\tools\rclone\rclone.conf"
    
    if exist "!RCLONE_EXE!" (
        "!RCLONE_EXE!" --config "!RCLONE_CONF!" copy "lasp-drive:_DEPOT/packages/pipeta_dependencies.zip" "%DEST%" --drive-team-drive 0AASS9JDeUQn7Uk9PVA --stats-one-line
        if exist "%DEST%\pipeta_dependencies.zip" (
            echo [INFO] Extrayendo dependencias con tar.exe...
            tar.exe -xf "%DEST%\pipeta_dependencies.zip" -C "%DEST%"
            del /f /q "%DEST%\pipeta_dependencies.zip" >nul 2>&1
            echo [OK] Dependencias restauradas con exito desde Google Drive.
        ) else (
            echo [WARN] No se pudo descargar pipeta_dependencies.zip desde Google Drive.
        )
    ) else (
        echo [WARN] No se encontro Rclone para descargar dependencias.
    )
) else (
    echo [OK] Dependencias y runtimes en orden.
)

:FINALIZE_UPDATE
echo.
echo Actualizando acceso directo en Escritorio con icono oficial...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Pipeta.lnk')); $s.TargetPath = '%DEST%\Launch_Pipeta.bat'; $s.WorkingDirectory = '%DEST%'; $ico = '%DEST%\Pipeta.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Description = 'Pipeta - VFX Pipeline Manager'; $s.Save()" 2>nul

echo.
echo ============================================================
echo   OK: Pipeta v1.1.82 sincronizada con exito en %DEST%
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
