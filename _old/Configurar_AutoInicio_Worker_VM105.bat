@echo off
title Configurar Auto-Inicio de Worker Pipeta (VM 105)
echo ======================================================================
echo    CONFIGURAR AUTO-INICIO DEL WORKER EN ESTA MAQUINA (VM 105)
echo ======================================================================
echo.

set "TARGET_BAT=%~dp0Launch_Pipeta_Worker.bat"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $startup = [Environment]::GetFolderPath('Startup'); $lnkPath = Join-Path $startup 'Pipeta_Worker.lnk'; Get-ChildItem $startup -Filter '*Worker*.lnk' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; $s = $ws.CreateShortcut($lnkPath); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Pipeta Sync Worker Daemon'; $s.Save(); Write-Host '[OK] Acceso directo registrado en Inicio de Windows:' $lnkPath"

echo.
echo ======================================================================
echo   EXITO: El Worker arrancara automaticamente con la version oficial!
echo   Ruta: %TARGET_BAT%
echo ======================================================================
echo.
pause
