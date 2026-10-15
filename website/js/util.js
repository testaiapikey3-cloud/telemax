/* ============================================================
 * TeleMAX Web — util.js
 * Помощники: DOM, время, размеры, storage, toast-совместимость.
 * ============================================================ */
window.TM = window.TM || {};

TM.util = (function () {
  'use strict';

  /* ---------- DOM ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeUrl(u) {
    const s = String(u || '');
    if (/^(https?:|data:(image|video|audio)\/|blob:|\/uploads\/)/i.test(s)) return s;
    return '';
  }

  /* ---------- время ---------- */
  function timeHM(ts) {
    const d = new Date(ts || Date.now());
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function dateLabel(ts) {
    const d = new Date(ts), n = new Date();
    const sameDay = d.toDateString() === n.toDateString();
    const y = new Date(n.getTime() - 86400000);
    if (sameDay) return 'Сегодня';
    if (d.toDateString() === y.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }
  function lastSeenText(ts) {
    if (!ts) return 'не в сети';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'был(а) только что';
    if (diff < 3600000) return 'был(а) ' + Math.floor(diff / 60000) + ' мин назад';
    if (diff < 86400000) return 'был(а) в ' + timeHM(ts);
    return 'был(а) ' + dateLabel(ts).toLowerCase() + ' в ' + timeHM(ts);
  }
  function duration(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return h + ' ч ' + m + ' мин';
    if (m) return m + ' мин ' + s + ' с';
    return s + ' с';
  }
  function bytes(n) {
    n = Number(n || 0);
    if (n < 1024) return n + ' Б';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' КБ';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' МБ';
    return (n / 1073741824).toFixed(2) + ' ГБ';
  }

  /* ---------- id / хеш ---------- */
  function uid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    return 'x' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  }
  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- storage ---------- */
  const KEY = 'telemax_web_v1';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; }
  }
  let saveTimer = null;
  function saveSoon(data) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(data)); }
      catch (e) { console.warn('storage full', e); }
    }, 250);
  }
  function saveNow(data) {
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn('storage full', e); }
  }

  /* ---------- device ---------- */
  function deviceId() {
    const d = load();
    if (!d.deviceId) {
      d.deviceId = uid();
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) {}
    }
    return d.deviceId;
  }
  function deviceLabel() {
    const ua = navigator.userAgent;
    let os = 'Устройство';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Mac/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';
    let br = 'браузер';
    if (/YaBrowser/i.test(ua)) br = 'Yandex Browser';
    else if (/Edg\//i.test(ua)) br = 'Edge';
    else if (/Chrome\//i.test(ua)) br = 'Chrome';
    else if (/Firefox\//i.test(ua)) br = 'Firefox';
    else if (/Safari\//i.test(ua)) br = 'Safari';
    return os + ' • ' + br;
  }

  /* ---------- misc ---------- */
  function debounce(fn, ms) {
    let t = null;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms || 250); };
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function readFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  return { $, $$, el, esc, safeUrl, timeHM, dateLabel, lastSeenText, duration, bytes, uid, sha256, load, saveSoon, saveNow, deviceId, deviceLabel, debounce, clamp, readFile, KEY };
})();
