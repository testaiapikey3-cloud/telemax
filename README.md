# TeleMAX 0.4.0 — complete update

- Android Java APK project.
- TeleMAX icon + main messenger header.
- 10 chat wallpapers in code.
- Empty chat list for new accounts; BotRast and TeleMany are available in Settings → Bots.
- Exact verification: the blue check appears only when BOTH exact display name and exact username match the verified account. Duplicate usernames are blocked on registration and edits.
- Roles: 0 blocked, 1 user, 2 junior moderator, 3 senior moderator, 4 administrator, 5 verification specialist.
- Junior/senior moderators cannot directly ban. They create/review reports; administrator can ban/freeze only an approved report. Ban/freeze resets target role to 0.
- Gift blade: level 4 can remove selected or all gifts.
- Gifts are visible in profiles.
- Only TeleCoin is used for currency issuance/transfers; legacy TCoin keys are cleared on currency operations.
- Plugin store: exactly 200 plugins with search, categories, install/disable and per-plugin settings.
- Internet realtime chat through the existing WebSocket server.
- Bluetooth Classic chat for paired devices.
- Support session uses a one-time owner code; it does not bypass account authentication.
- Gradle 8.9 + Android Gradle Plugin 8.7.3.

## Build
Open the project in Android Studio and use **Build → Build APK(s)**.


## v0.4.0 — два независимых режима связи

### NET / интернет
Кнопка **NET** отправляет сообщения через TeleMAX WebSocket-сервер. Если сервер размещён на публичном VPS/домене, пользователи из разных стран и сетей могут общаться через интернет. Для продакшена используй `wss://` через reverse proxy/TLS.

Адрес задаётся в `gradle.properties`:
`telemaxServerUrl=wss://ВАШ-ДОМЕН:443`

После изменения адреса пересобери APK. Сервер находится в `server/`. Порт по умолчанию — 8080; доступен `/health`.

### BT / Bluetooth
Кнопка **BT** — отдельный офлайн-канал. Он работает между сопряжёнными Android-устройствами через Bluetooth Classic и **не требует интернета, Wi-Fi или мобильных данных**. Для работы нужно включить Bluetooth и выбрать сопряжённое устройство.

### Секретный Admin Mode
Пункт **Admin Mode полностью убран из Настроек**. Открыть служебную панель можно только через скрытый вход: 7 нажатий по версии приложения → секретный код.

Не публикуй секретный код в APK/репозитории для реального сервера: для продакшена вынеси административную аутентификацию на сервер.


## BUILD FIX
Исправлена ошибка `cannot find symbol: method addTransaction(String)` — добавлен локальный журнал транзакций с лимитом 200 записей.


## Built-in level 5
`@mislit_tech` and `@I_11_bot` are recognized as level 5 in this test build.


## WORLD CHAT: доставка сообщений

Для общения между разными телефонами сервер `server/index.js` должен быть запущен на публичном VPS. В `gradle.properties` укажите `telemaxServerUrl=ws://PUBLIC_IP:8080` или, для HTTPS/TLS, `wss://chat.example.com`. Нельзя использовать `localhost` или `10.0.2.2` для разных устройств.

Сервер теперь: хранит офлайн-сообщения (до 500 на пользователя), доставляет их после повторного входа, поддерживает несколько устройств одного username, отправляет подтверждение `message_accepted` и presence.


## Локальный realtime-адрес

В этой сборке Android-клиент настроен на `ws://127.0.0.1:8080`, а секретный ключ админ-доступа — `testtestest654`. Сервер слушает `0.0.0.0:8080`.

Запуск сервера из папки `server`: `npm install` затем `node index.js`.

Важно: `127.0.0.1` означает **само устройство**, на котором работает клиент. Поэтому на физическом телефоне адрес `127.0.0.1:8080` будет работать только если WebSocket-сервер действительно запущен на этом же телефоне. Для Android-эмулятора и сервера на ПК обычно нужен адрес хоста эмулятора (например, `10.0.2.2:8080`). Для общения между разными телефонами нужен публичный адрес/VPS.

## BotRast / TeleMany update
- BotRast and TeleMany no longer inject an automatic greeting when a bot is created.
- `/start` is the entry point and shows Russian / English / Spanish language buttons.
- BotRast implements `/newbot`, `/mybots`, `/token`, `/revoke`, `/deletebot`, `/setname`, `/setdescription`, `/setabouttext`, `/setcommands` and a help menu.
- TeleMany implements `/addbot`, token validation, `/skip`, `/commands`, Create command, Config main menu, Save, `/botlang`, `/newpost`, `/schedule`, `/subscribers` and `/admins` menu entries.
- Custom text/media replies can be collected while creating a command and saved to the selected bot.
- Tokens are generated locally for TeleMAX. They are not real Telegram-issued Bot API tokens.
