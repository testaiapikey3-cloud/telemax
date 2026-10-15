@echo off
echo ==========================================
echo TeleMAX APK Builder
echo ==========================================
echo.
echo Checking Gradle...
call gradlew.bat --version
echo.
echo Building APK...
call gradlew.bat assembleDebug
echo.
echo ==========================================
echo Build complete!
echo APK location: app\build\outputs\apk\debug\app-debug.apk
echo ==========================================
pause
