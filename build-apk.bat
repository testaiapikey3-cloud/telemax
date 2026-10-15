@echo off
setlocal
where gradle >nul 2>nul
if errorlevel 1 (
  echo Gradle not found. Open the project in Android Studio and use Build ^> Build APK(s).
  pause
  exit /b 1
)
gradle :app:assembleDebug
if errorlevel 1 (
  echo BUILD FAILED
  pause
  exit /b 1
)
echo.
echo APK: app\build\outputs\apk\debug\app-debug.apk
pause
