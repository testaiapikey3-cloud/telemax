@echo off
rem ============================================================
rem  TeleMAX Web - public tunnel launcher (ssh + localhost.run)
rem  ASCII only: works on any Windows 10/11
rem ============================================================
cd /d "%~dp0"
title TeleMAX Web - Public Tunnel

where ssh >nul 2>nul
if errorlevel 1 goto NoSsh

set SERVERUP=
for /f "tokens=*" %%a in ('netstat -an ^| findstr /c:":8080" ^| findstr /c:"LISTENING"') do set SERVERUP=1
if not defined SERVERUP goto NoServer

if not exist "tools" mkdir "tools"
del /q "tools\tunnel-out.txt" >nul 2>nul

echo ================================================
echo   TeleMAX Web - public tunnel
echo   Local site:  http://localhost:8080
echo ================================================
echo.
echo Opening the tunnel window (it must stay open)...
start "TeleMAX Tunnel - KEEP OPEN" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\tunnel.ps1"

echo Waiting for the public link...
set PUBLICURL=
for /l %%i in (1,1,45) do call :PollOnce
if defined PUBLICURL goto ShowLink
goto NoLink

:PollOnce
if defined PUBLICURL exit /b 0
for /f "delims=" %%u in ('powershell -NoProfile -Command "$f='%~dp0tools\tunnel-out.txt'; if (Test-Path $f) { $t=Get-Content $f -Raw; $m=[regex]::Match($t, 'tunneled with tls termination, (https://[a-z0-9.-]+)'); if (-not $m.Success) { $m=[regex]::Match($t, '(https://[a-z0-9-]+\.lhr\.life)') }; if ($m.Success) { $m.Groups[1].Value } }"') do set PUBLICURL=%%u
if not defined PUBLICURL ping -n 2 127.0.0.1 >nul
exit /b 0

:ShowLink
echo.
echo ================================================
echo   YOUR PUBLIC LINK - send it to anyone:
echo.
echo   %PUBLICURL%
echo.
echo   The link was copied to the clipboard
echo   (paste it with Ctrl+V).
echo ================================================
echo %PUBLICURL%| clip
start "" "%PUBLICURL%"
echo.
echo Keep the "TeleMAX Tunnel" window open (you may minimize it).
echo Closing THAT window switches the public link off.
echo.
echo This window can be closed now - the link stays active.
echo.
pause
exit /b 0

:NoLink
echo.
echo Could not read the public link automatically.
echo Please look at the "TeleMAX Tunnel" window - the link is shown there,
echo like:  https://something.lhr.life
echo.
pause
exit /b 0

:NoSsh
echo.
echo [ERROR] ssh.exe was not found.
echo Enable it: Settings - Apps - Optional features - OpenSSH Client.
echo Then run this file again.
echo.
pause
exit /b 1

:NoServer
echo.
echo [ERROR] The TeleMAX server is NOT running on port 8080.
echo.
echo Start START.bat first (the local site), then run this file again.
echo.
pause
exit /b 1
