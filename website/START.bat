@echo off
rem ============================================================
rem  TeleMAX Web - launcher (ASCII only: works on any Windows)
rem ============================================================
cd /d "%~dp0"
title TeleMAX Web Server

where node >nul 2>nul
if errorlevel 1 goto NoNode

cd server
if exist node_modules goto RunServer

echo First launch: installing dependencies (needs internet)...
call npm install --no-audit --no-fund
if errorlevel 1 goto NpmFail
echo.

:RunServer
echo ================================================
echo    TeleMAX Web - messenger site
echo.
echo    Site address:  http://localhost:8080
echo    Stop server:   press Ctrl+C
echo ================================================
echo.
start "" http://localhost:8080
node index.js
echo.
echo Server stopped.
pause
exit /b 0

:NoNode
echo.
echo [ERROR] Node.js is not installed!
echo Download it from https://nodejs.org and run this file again.
echo.
pause
exit /b 1

:NpmFail
echo.
echo [ERROR] Could not install dependencies.
echo Check your internet connection and run this file again.
echo.
pause
exit /b 1
