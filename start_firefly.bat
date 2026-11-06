@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Firefly has not been installed yet. Run install.ps1 first.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" run_firefly.py
