# Сборка TeleMAX 0.4.0 в APK

1. Распакуй ZIP.
2. Открой корневую папку проекта в Android Studio.
3. Дождись Gradle Sync.
4. Если Android Studio предлагает Gradle 8.4 — оставь его: проект использует Android Gradle Plugin 8.2.2.
5. Выбери **Build → Build APK(s)**.
6. APK появится в `app/build/outputs/apk/debug/app-debug.apk`.

Если собираешь из CMD и Gradle установлен:

```bat
gradle :app:assembleDebug
```

Для интернет-сообщений открой **Настройки → Сервер звонков** и укажи WebSocket-адрес своего `server/index.js`. Для локальной Android-эмуляции `ws://10.0.2.2:8080` подходит, если Node-сервер запущен на ПК.
