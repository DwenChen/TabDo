@echo off
setlocal
cd /d "%~dp0"
if not exist ".local\portable-preview\Start-Preview.cmd" (
  echo Portable preview is missing. See docs\maintenance.md.
  pause
  exit /b 1
)
call ".local\portable-preview\Start-Preview.cmd"
