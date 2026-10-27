@echo off
setlocal
title Generador de Catalogo Google Drive - Pipeta Sync

set "PROJ=%~1"
if "%PROJ%"=="" set "PROJ=surf_love"

echo ==========================================================
echo   PIPETA SYNC - GENERADOR DE CATALOGO DRIVE
echo   Proyecto Objetivo: %PROJ%
echo ==========================================================
echo.

set "NODE_EXE=%~dp0bin\node\node.exe"
if not exist "%NODE_EXE%" (
    where node >nul 2>&1
    if %errorlevel% equ 0 (
        set "NODE_EXE=node"
    ) else (
        echo [ERROR] No se encontro ejecutable de Node.js
        pause
        exit /b 1
    )
)

"%NODE_EXE%" "%~dp0server\sync_catalog_generator.js" "%PROJ%" %2 %3

echo.
echo Presione cualquier tecla para salir...
pause >nul
