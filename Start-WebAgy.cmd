@echo off
if not exist "%~dp0.local\bin\ngrok.exe" if not exist "%~dp0.local\bin\cloudflared.exe" (
    powershell.exe -NoProfile -File "%~dp0Install-Tunnel.ps1"
    if errorlevel 1 (
        echo Connection client setup did not finish. See README.md.
        pause
        exit /b 1
    )
)
if exist "%~dp0WebAgy.exe" (
    start "" "%~dp0WebAgy.exe"
    exit /b 0
)
powershell.exe -NoProfile -WindowStyle Hidden -File "%~dp0Launch.ps1"
if errorlevel 1 pause
