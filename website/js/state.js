/* ============================================================
 * TeleMAX Web — state.js
 * Состояние приложения + локальное хранилище (localStorage).
 * Работает и офлайн: все чаты/настройки сохраняются на устройстве.
 * ============================================================ */
window.TM = window.TM || {};

TM.state = (function () {
  'use strict';
  const U = TM.util;

  const db = U.load();                       // глобальное хранилище
  db.store = db.store || {};                 // store[username] = данные аккаунта
  db.deviceId = db.deviceId || U.uid();      // id устройства

  const s = {
    account: null,            // текущий профиль (с сервера или локальный)
    user: '',                 // @username активного аккаунта
    online: navigator.onLine,
    wsOn: false,              // WebSocket подключён
    contacts: {},             // user -> публичный профиль (из снимка сервера)
    presence: {},             // user -> {online, since, lastSeen}
    groups: {},               // gid -> группа
    activeChat: null,         // id открытого чата
    view: 'chats',            // текущий экран
    typing: {},               // user -> timestamp
    broadcast: { text: '', time: 0 },
    serverVersion: '',
    debug: false
  };

  function store() {
    if (!s.user) return {};
    if (!db.store[s.user]) db.store[s.user] = defaultStore();
    return db.store[s.user];
  }
  function defaultStore() {
    return {
      chats: {},            // id -> чат
      settings: {
        notifications: true, quietHours: false, language: 'ru',
        theme: 'dark', accent: '#ffc107', animations: true,
        proxy: '', proxyEnabled: false,
        debugMode: false, logging: false,
        aiEndpoint: '', aiApiKey: '', aiModel: 'gpt-4o-mini',
        pinEnabled: false, pinHash: '', autoLock: false,
        chatSounds: true, messageSounds: true, readReceipts: true
      },
      plugins: {},          // p001 -> {installed, enabled}
      transactions: [],     // история TeleCoin
      calls: [],            // история звонков
      reports: [],          // локальные жалобы (копия)
      account: null,        // локальная копия профиля (офлайн)
      bots: [],             // мои боты [{id,username,name,token}]
      analytics: { logins: 0, messagesSent: 0, mediaSent: 0 }
    };
  }

  function save() { U.saveSoon(db); }
  function saveNow() { U.saveNow(db); }
  function saveAccount() { if (s.user) store().account = s.account; save(); }

  function setUser(user) {
    s.user = user;
    if (user && db.store[user] && db.store[user].account) s.account = db.store[user].account;
    if (user && !db.store[user]) db.store[user] = defaultStore();
  }
  function logout() {
    s.user = '';
    s.account = null;
    s.contacts = {};
    s.presence = {};
    s.groups = {};
    s.activeChat = null;
    db.auth = null;
    saveNow();
  }
  function setAuth(user) { db.auth = { user, time: Date.now() }; saveNow(); }
  function getAuth() { return db.auth || null; }

  /* ---------- чаты ---------- */
  function chatIdForUser(u) { return 'u_' + String(u).toLowerCase(); }
  function chatIdForGroup(gid) { return 'g_' + gid; }
  function getChat(id) { return store().chats[id] || null; }
  function allChats() {
    return Object.values(store().chats).sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
  }
  function createChat(opts) {
    const st = store();
    const id = opts.id;
    if (!st.chats[id]) {
      st.chats[id] = Object.assign({
        id, kind: 'private', username: '', name: '', avatar: '', members: [],
        messages: [], unread: 0, muted: false, wallpaper: 0, accent: '', lastTime: Date.now(), created: Date.now()
      }, opts);
      save();
    }
    return st.chats[id];
  }
  function removeChat(id) { const st = store(); delete st.chats[id]; save(); if (s.activeChat === id) s.activeChat = null; }
  function addMessage(chatId, msg) {
    const c = getChat(chatId) || createChat({ id: chatId });
    c.messages.push(msg);
    c.lastTime = msg.time || Date.now();
    if (c.messages.length > 800) c.messages.splice(0, c.messages.length - 800);
    save();
    return msg;
  }
  function findMessage(chatId, id) {
    const c = getChat(chatId);
    if (!c) return null;
    return c.messages.find(x => x.id === id) || null;
  }
  function removeMessage(chatId, id) {
    const c = getChat(chatId);
    if (!c) return;
    const i = c.messages.findIndex(x => x.id === id);
    if (i >= 0) { c.messages.splice(i, 1); save(); }
  }

  /* ---------- счётчики ---------- */
  function totalUnread() { return allChats().reduce((n, c) => n + (c.muted ? 0 : c.unread || 0), 0); }

  function isOnline(user) {
    const p = s.presence[String(user).toLowerCase()];
    return !!(p && p.online);
  }
  function profileOf(user) {
    const u = String(user).toLowerCase();
    return s.contacts[u] || null;
  }
  function myRole() {
    if (!s.account) return 0;
    const u = String(s.account.user || '').toLowerCase();
    if (TM.config.LEVEL5_USERNAMES.includes(u)) return 5;
    return Math.max(0, Math.min(5, s.account.role == null ? 1 : s.account.role));
  }

  return {
    s, db, store, save, saveNow, saveAccount, setUser, logout, setAuth, getAuth,
    chatIdForUser, chatIdForGroup, getChat, allChats, createChat, removeChat,
    addMessage, findMessage, removeMessage, totalUnread, isOnline, profileOf, myRole
  };
})();
