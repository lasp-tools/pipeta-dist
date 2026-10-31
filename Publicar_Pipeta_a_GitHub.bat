@echo off
setlocal enabledelayedexpansion
title Publicar Pipeta a GitHub (Remotos / Freelance)

echo ============================================================
echo   PUBLICADOR DE PIPETA A GITHUB (lasp-tools/pipeta-dist)
echo ============================================================
echo.

set "REPO=%~dp0"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"

if not exist "%REPO%\.git" (
    if exist "Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta\.git" (
        set "REPO=Z:\INTERNO\TOOLS\GITHUB\TOOLS\APPS\Pipeta"
    ) else (
        echo [ERROR] No se encontro el repositorio .git en:
        echo         %REPO%
        echo Asegurate de ejecutar este script desde el entorno Dev ^(Z:^).
        echo.
        pause
        exit /b 1
    )
)

where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git no esta instalado o no figura en el PATH de Windows.
    echo.
    pause
    exit /b 1
)

pushd "%REPO%"

set "VER=actualizacion"
if exist "Launch_Pipeta.bat" (
    for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$m = Select-String -Path 'Launch_Pipeta.bat' -Pattern 'APP_VERSION=(v[0-9\.]+)'; if ($m) { $m.Matches.Groups[1].Value }"`) do (
        if not "%%V"=="" set "VER=%%V"
    )
)

echo [1/4] Repositorio : %REPO%
echo       Version     : %VER%
echo.

echo [2/4] Preparando archivos modificados (git add -A)...
git status -s
git add -A
if errorlevel 1 (
    echo [ERROR] Fallo al ejecutar git add.
    popd
    pause
    exit /b 1
)

echo.
echo [3/4] Generando commit...
git diff --cached --quiet
if errorlevel 1 (
    set "MSG=Release %VER%"
    if not "%~1"=="" set "MSG=%*"
    git commit -m "!MSG!"
    if errorlevel 1 (
        echo [ERROR] Fallo al crear el commit en Git.
        popd
        pause
        exit /b 1
    )
) else (
    echo   - Sin cambios nuevos para commitear ^(verificando push pendiente...^).
)

echo.
echo [4/4] Subiendo cambios a GitHub (origin main)...
git push origin main
if errorlevel 1 (
    echo.
    echo [ERROR] No se pudo subir a GitHub. Verifica conexion o credenciales de Git.
    popd
    pause
    exit /b 1
)

popd
echo.
echo ============================================================
echo   OK: Pipeta %VER% publicada con exito en GitHub (main)
echo   Los equipos remotos / freelance ya pueden actualizar.
echo ============================================================
echo.
pause
