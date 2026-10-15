# Google Sign-In для TeleMAX

Ошибка Google status code 10 (`DEVELOPER_ERROR`) появляется, когда OAuth-конфигурация не совпадает с APK.

1. В Google Cloud Console создай Android OAuth client.
2. Package name: `com.telemax.app`.
3. Добавь SHA-1 debug-сертификата и SHA-1 release-сертификата.
4. Создай Web OAuth client и его client ID помести в `app/src/main/res/values/strings.xml` вместо `REPLACE_WITH_WEB_CLIENT_ID`.
5. Пересобери APK.

Код TeleMAX уже обрабатывает status code 10 отдельным сообщением, чтобы причина была понятна.
