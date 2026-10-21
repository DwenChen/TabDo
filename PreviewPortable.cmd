@echo off
setlocal DisableDelayedExpansion
rem Resolve the launcher before a called script changes the working directory.
set "TABDO_PREVIEW_LAUNCHER=%~dp0.local\portable-preview\Start-Preview.cmd"
if not exist "%TABDO_PREVIEW_LAUNCHER%" (
  echo Portable preview is missing. See docs\maintenance.md.
  pause
  exit /b 1
)
call "%TABDO_PREVIEW_LAUNCHER%"
