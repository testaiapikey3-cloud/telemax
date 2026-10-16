/* ============================================================
 * TeleMAX Web — config.js
 * Константы: роли, подарки, магазин плагинов (200), лимиты.
 * ============================================================ */
window.TM = window.TM || {};

TM.config = (function () {
  'use strict';

  const VERSION = '1.2.3';
  const APP_NAME = 'TeleMAX';

  // Роли 0–5 (как в Android-версии)
  const ROLES = [
    'Заблокирован',
    'Пользователь',
    'Младший модератор',
    'Старший модератор',
    'Администратор',
    'Спецверификатор'
  ];
  const LEVEL5_USERNAMES = ['mislit_tech', 'i_11_bot'];

  // Каталог подарков (цены как на дизайн-макете)
  const GIFTS = [
    { id: 'heart',   name: 'Сердце',        emoji: '❤️', price: 50 },
    { id: 'crown',   name: 'Корона',        emoji: '👑', price: 100 },
    { id: 'diamond', name: 'Кристалл',      emoji: '💎', price: 200 },
    { id: 'bear',    name: 'Мишка',         emoji: '🧸', price: 75 },
    { id: 'rose',    name: 'Роза',          emoji: '🌹', price: 120 },
    { id: 'gem',     name: 'Алмаз',         emoji: '💠', price: 150 },
    { id: 'note',    name: 'Нота',          emoji: '🎵', price: 90 },
    { id: 'car',     name: 'Машина',        emoji: '🚙', price: 300 },
    { id: 'unicorn', name: 'Единорог',      emoji: '🦄', price: 250 },
    { id: 'cat',     name: 'Кот NFT',       emoji: '🐱', price: 500, nft: true },
    { id: 'girl',    name: 'Аниме NFT',     emoji: '🧝‍♀️', price: 750, nft: true },
    { id: 'robot',   name: 'Робот NFT',     emoji: '🤖', price: 1000, nft: true }
  ];
  const NFT_CATALOG = ['Crystal', 'Moon', 'Star', 'Butterfly', 'Crown', 'Rocket'];
  const PREMIUM_PRICE = 499;

  // 10 обоев чата (градиенты, как в Android-версии)
  const WALLPAPERS = [
    { id: 0, name: 'Без обоев',     css: '#0a0a0c' },
    { id: 1, name: 'Ночной город',  css: 'linear-gradient(160deg,#0a0a0c 0%,#141420 45%,#1c1c2e 100%)' },
    { id: 2, name: 'Закат',         css: 'linear-gradient(160deg,#1a0f0a 0%,#2a1510 50%,#0a0a0c 100%)' },
    { id: 3, name: 'Изумруд',       css: 'linear-gradient(160deg,#06170f 0%,#0e2a1c 55%,#0a0a0c 100%)' },
    { id: 4, name: 'Сапфир',        css: 'linear-gradient(160deg,#050f1e 0%,#0d2138 55%,#0a0a0c 100%)' },
    { id: 5, name: 'Аметист',       css: 'linear-gradient(160deg,#150a20 0%,#26143a 55%,#0a0a0c 100%)' },
    { id: 6, name: 'Золото',        css: 'linear-gradient(160deg,#1a1406 0%,#2c220a 55%,#0a0a0c 100%)' },
    { id: 7, name: 'Точки',         css: 'radial-gradient(rgba(255,193,7,.10) 1px,transparent 1px) 0 0/22px 22px,#0a0a0c' },
    { id: 8, name: 'Сетка',         css: 'linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/26px 26px,linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/26px 26px,#0c0c10' },
    { id: 9, name: 'Океан',         css: 'linear-gradient(180deg,#02121c 0%,#06304a 70%,#041a2a 100%)' }
  ];

  // Акценты (цвет чата)
  const ACCENTS = ['#ffc107', '#ffb300', '#4fc3f7', '#81c784', '#ba68c8', '#ff8a65', '#f06292'];

  // Магазин плагинов: 200 штук (имена как в Android + генерация)
  const PLUGIN_BASE = [
    ['Voice Changer', 'Звонки'], ['Translator', 'AI'], ['Auto Reply', 'Мессенджер'], ['Chat Cleaner', 'Мессенджер'],
    ['Smart Search', 'Мессенджер'], ['Message Scheduler', 'Мессенджер'], ['Quick Reply', 'Мессенджер'], ['Polls Pro', 'Мессенджер'],
    ['Reactions Plus', 'Мессенджер'], ['Read Later', 'Мессенджер'], ['Spam Guard', 'Безопасность'], ['Privacy Shield', 'Безопасность'],
    ['Theme Studio', 'Темы'], ['Neon UI', 'Темы'], ['Glass UI', 'Темы'], ['Wallpaper Pack', 'Темы'],
    ['Emoji Lab', 'Медиа'], ['Sticker Tools', 'Медиа'], ['GIF Maker', 'Медиа'], ['Video Trim', 'Медиа'],
    ['Audio Boost', 'Медиа'], ['Noise Cancel', 'Звонки'], ['Call Recorder', 'Звонки'], ['Call Timer', 'Звонки'],
    ['Group Tools', 'Группы'], ['Channel Tools', 'Группы'], ['Pinned Plus', 'Мессенджер'], ['Folders Plus', 'Мессенджер'],
    ['Archive Pro', 'Мессенджер'], ['Unread Counter', 'Мессенджер'], ['Typing Status', 'Мессенджер'], ['Online Tracker', 'Мессенджер'],
    ['Disappearing Messages', 'Приватность'], ['Secret Notes', 'Приватность'], ['QR Share', 'Мессенджер'], ['Contact Backup', 'Данные'],
    ['Cloud Export', 'Данные'], ['Local Backup', 'Данные'], ['Media Saver', 'Медиа'], ['File Manager', 'Файлы'],
    ['Document Preview', 'Файлы'], ['PDF Tools', 'Файлы'], ['Image Compress', 'Медиа'], ['Image Crop', 'Медиа'],
    ['Video Compress', 'Медиа'], ['Video Preview', 'Медиа'], ['Music Player', 'Медиа'], ['Voice Notes', 'Медиа'],
    ['Podcast Mode', 'Медиа'], ['Live Captions', 'AI'], ['Auto Translate', 'AI'], ['AI Summary', 'AI'],
    ['AI Rewrite', 'AI'], ['AI Assistant', 'AI'], ['AI Chat', 'AI'], ['AI Moderation', 'AI'],
    ['AI Search', 'AI'], ['AI Tags', 'AI'], ['AI Ideas', 'AI'], ['Smart Contacts', 'Контакты'],
    ['Friend Finder', 'Контакты'], ['Nearby Share', 'Контакты'], ['Invite Manager', 'Контакты'], ['Profile Frames', 'Профиль'],
    ['Profile Badges', 'Профиль'], ['Username Guard', 'Профиль'], ['Verified Profile', 'Профиль'], ['Gift Manager', 'Подарки'],
    ['NFT Gallery', 'Подарки'], ['Gift History', 'Подарки'], ['Gift Analytics', 'Подарки'], ['Coin Wallet', 'Кошелёк'],
    ['Coin History', 'Кошелёк'], ['Coin Transfer', 'Кошелёк'], ['Premium Timer', 'Premium'], ['Premium Themes', 'Premium'],
    ['Premium Icons', 'Premium'], ['Dark Mode Pro', 'Темы'], ['Light Mode Pro', 'Темы'], ['OLED Black', 'Темы'],
    ['Yellow Accent', 'Темы'], ['Blue Accent', 'Темы'], ['Purple Accent', 'Темы'], ['Green Accent', 'Темы'],
    ['Red Accent', 'Темы'], ['Custom Fonts', 'Темы'], ['Font Size', 'Темы'], ['Chat Bubbles', 'Темы'],
    ['Bubble Shapes', 'Темы'], ['Bubble Shadows', 'Темы'], ['Message Sounds', 'Уведомления'], ['Notification Sounds', 'Уведомления'],
    ['Quiet Hours', 'Уведомления'], ['Mention Alerts', 'Уведомления'], ['Call Alerts', 'Уведомления'], ['Security Log', 'Безопасность'],
    ['Session Manager', 'Безопасность'], ['Device List', 'Безопасность'], ['2FA Helper', 'Безопасность'], ['Login Alerts', 'Безопасность'],
    ['PIN Lock', 'Приватность'], ['App Lock', 'Приватность'], ['Screenshot Guard', 'Приватность'], ['Clipboard Guard', 'Приватность'],
    ['Link Guard', 'Безопасность'], ['Anti Phishing', 'Безопасность'], ['Proxy Manager', 'Сеть'], ['Connection Tester', 'Сеть'],
    ['Internet Mode', 'Сеть'], ['Offline Queue', 'Сеть'], ['Realtime Monitor', 'Сеть'], ['WebSocket Tools', 'Разработка'],
    ['Server Ping', 'Сеть'], ['Server Status', 'Сеть'], ['API Tester', 'Разработка'], ['JSON Viewer', 'Разработка'],
    ['Log Viewer', 'Разработка'], ['Export Logs', 'Разработка'], ['Diagnostics', 'Разработка'], ['Crash Reporter', 'Разработка'],
    ['Performance Monitor', 'Разработка'], ['Storage Cleaner', 'Данные'], ['Cache Cleaner', 'Данные'], ['Download Manager', 'Файлы']
  ];
  const PLUGIN_EXTRA = ['Turbo', 'Lite', 'Pro Max', 'Plus', 'Ultra', 'Smart', 'Auto', 'Deep', 'Quick', 'Neo'];
  const PLUGIN_CATS = ['Мессенджер', 'Медиа', 'Безопасность', 'Темы', 'AI', 'Звонки', 'Файлы', 'Данные', 'Кошелёк', 'Разное'];
  function buildPlugins() {
    const list = [];
    const seen = new Set();
    PLUGIN_BASE.forEach(([name, cat]) => { if (!seen.has(name)) { seen.add(name); list.push({ name, cat }); } });
    let i = 0;
    while (list.length < 200) {
      const base = PLUGIN_BASE[i % PLUGIN_BASE.length][0];
      const extra = PLUGIN_EXTRA[Math.floor(i / PLUGIN_BASE.length) % PLUGIN_EXTRA.length];
      const cat = PLUGIN_CATS[i % PLUGIN_CATS.length];
      const name = base + ' ' + extra + (Math.floor(i / (PLUGIN_BASE.length * PLUGIN_EXTRA.length)) ? ' ' + (1 + Math.floor(i / (PLUGIN_BASE.length * PLUGIN_EXTRA.length))) : '');
      if (!seen.has(name)) { seen.add(name); list.push({ name, cat }); }
      i++;
    }
    return list.map((p, idx) => ({
      id: 'p' + String(idx + 1).padStart(3, '0'),
      name: p.name,
      cat: p.cat,
      desc: p.name + ' — расширение TeleMAX. Установите и включите, чтобы активировать.'
    }));
  }
  const PLUGINS = buildPlugins();

  // Ограничения
  const LIMITS = {
    TEXT_MAX: 4000,
    LOCAL_MEDIA_MAX: 3 * 1024 * 1024,   // до 3 МБ хранится локально как dataURL (офлайн-режим)
    AVATAR_MAX: 2 * 1024 * 1024,
    NAME_MAX: 64,
    ABOUT_MAX: 300
  };

  const BOT_USERNAMES = { telemaxbot: 'TeleMAX Bot', botrast: 'BotRast', telemany: 'TeleMany', telemaxai: 'TeleMAX AI' };

  // Официальные боты — с галочкой верификации
  const VERIFIED_BOTS = { telemaxbot: 1, botrast: 1, telemany: 1, telemaxai: 1 };

  return { VERSION, APP_NAME, ROLES, LEVEL5_USERNAMES, GIFTS, NFT_CATALOG, PREMIUM_PRICE, WALLPAPERS, ACCENTS, PLUGINS, LIMITS, BOT_USERNAMES, VERIFIED_BOTS };
})();
