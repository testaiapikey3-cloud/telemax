#!/usr/bin/env node
/* ============================================================
 * TeleMAX Web - командный запуск (CLI)
 * Команды:
 *   telemax start    - запустить сервер (http://localhost:8080)
 *   telemax tunnel   - публичная ссылка (SSH-туннель, сервер уже запущен)
 *   telemax open     - открыть сайт в браузере
 *   telemax help     - справка
 * Установка команды (один раз, в папке website):  npm link
 * ============================================================ */
'use strict';
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const SERVER_DIR = path.join(ROOT, 'server');
const cmd = String(process.argv[2] || 'start').toLowerCase();

function ensureDeps() {
  if (fs.existsSync(path.join(SERVER_DIR, 'node_modules', 'ws', 'package.json'))) return true;
  console.log('Первый запуск: устанавливаю зависимости (npm install)...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: SERVER_DIR, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status === 0;
}

function startServer() {
  if (!ensureDeps()) {
    console.log('Не удалось установить зависимости. Проверьте интернет и запустите снова.');
    process.exit(1);
  }
  console.log('');
  console.log('TeleMAX Web - сервер запущен:  http://localhost:8080');
  console.log('Остановить: Ctrl+C');
  console.log('');
  const child = spawn(process.execPath, [path.join(SERVER_DIR, 'index.js')], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code || 0));
}

function startTunnel() {
  const ps1 = path.join(ROOT, 'tools', 'tunnel.ps1');
  if (!fs.existsSync(ps1)) { console.log('Не найден tools/tunnel.ps1'); process.exit(1); }
  console.log('Публичный туннель: ссылка появится ниже. Не закрывайте окно, Ctrl+C - стоп.');
  const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code || 0));
}

function openSite() {
  const url = 'http://localhost:8080';
  const p = process.platform === 'win32'
    ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
    : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  p.unref();
  console.log('Открываю ' + url);
}

function help() {
  console.log('TeleMAX Web - команды:');
  console.log('  telemax start    запустить сервер (http://localhost:8080)');
  console.log('  telemax tunnel   публичная ссылка (сервер уже должен работать)');
  console.log('  telemax open     открыть сайт в браузере');
  console.log('  telemax help     эта справка');
}

if (cmd === 'start' || cmd === 'server' || cmd === 'run') startServer();
else if (cmd === 'tunnel' || cmd === 'public') startTunnel();
else if (cmd === 'open') openSite();
else if (cmd === 'help' || cmd === '--help' || cmd === '-h') help();
else { console.log('Неизвестная команда: ' + cmd); help(); process.exit(1); }
