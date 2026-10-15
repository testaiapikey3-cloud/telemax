#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "[ОШИБКА] Node.js не установлен. Скачайте: https://nodejs.org"
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Установка зависимостей (первый запуск)..."
  npm install
fi
echo "Сервер: http://localhost:8080"
node index.js
