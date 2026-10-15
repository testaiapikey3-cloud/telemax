/* ============================================================
 * TeleMAX Web — net.js
 * WebSocket-клиент с автопереподключением + HTTP-загрузка файлов.
 * Если сервер недоступен — приложение работает офлайн (локально).
 * ============================================================ */
window.TM = window.TM || {};

TM.net = (function () {
  'use strict';
  const U = TM.util;

  const handlers = {};       // type -> [fn]
  let ws = null;
  let url = '';
  let attempts = 0;
  let connected = false;
  let manuallyClosed = false;
  let pingTimer = null;

  function serverUrl() {
    const saved = (TM.state.db.serverUrl || '').trim();
    if (saved) return saved;
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    }
    return 'ws://localhost:8080';   // файл открыт напрямую
  }
  function httpBase() {
    const u = serverUrl();
    return u.replace(/^ws/, 'http').replace(/\/+$/, '');
  }

  function on(type, fn) {
    (handlers[type] = handlers[type] || []).push(fn);
  }
  function emit(type, msg) {
    (handlers[type] || []).forEach(fn => { try { fn(msg); } catch (e) { console.error('handler', type, e); } });
    (handlers['*'] || []).forEach(fn => { try { fn(msg); } catch (e) {} });
  }

  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    manuallyClosed = false;
    url = serverUrl();
    try { ws = new WebSocket(url); } catch (e) { scheduleReconnect(); return; }

    ws.onopen = () => {
      connected = true;
      attempts = 0;
      TM.state.s.wsOn = true;
      emit('__open', {});
      clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ type: 'ping' }), 25000);
      TM.ui && TM.ui.updateNetStatus && TM.ui.updateNetStatus();
      if (TM.auth && TM.auth.resumeSession) TM.auth.resumeSession();
    };
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.type === 'pong' && pongSubs.length) pongSubs.splice(0).forEach(f => { try { f(); } catch (_) {} });
      emit(m.type, m);
      emit('*', m);
    };
    ws.onclose = () => {
      connected = false;
      TM.state.s.wsOn = false;
      clearInterval(pingTimer);
      TM.ui && TM.ui.updateNetStatus && TM.ui.updateNetStatus();
      if (!manuallyClosed) scheduleReconnect();
    };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
  }
  function scheduleReconnect() {
    attempts++;
    const delay = Math.min(15000, 800 * Math.pow(1.6, Math.min(attempts, 8)));
    setTimeout(() => { if (!connected) connect(); }, delay);
  }
  function disconnect() { manuallyClosed = true; clearInterval(pingTimer); try { ws && ws.close(); } catch (_) {} }

  function send(obj) {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); return true; } catch (_) { return false; }
    }
    return false;
  }
  function isOn() { return connected; }

  /* ---------- измерение пинга (мс) ---------- */
  const pongSubs = [];
  function ping() {
    return new Promise(resolve => {
      const t0 = Date.now();
      let done = false;
      const fn = () => { if (done) return; done = true; resolve(Date.now() - t0); };
      pongSubs.push(fn);
      const cleanup = () => { const i = pongSubs.indexOf(fn); if (i >= 0) pongSubs.splice(i, 1); };
      if (!send({ type: 'ping' })) { cleanup(); done = true; return resolve(-1); }
      setTimeout(() => { if (done) return; cleanup(); done = true; resolve(-1); }, 4000);
    });
  }

  /* ---------- HTTP загрузка файлов ---------- */
  async function upload(file, user, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const name = file.name || ('file_' + Date.now());
      const u = httpBase() + '/upload?user=' + encodeURIComponent(user || '') + '&name=' + encodeURIComponent(name);
      xhr.open('POST', u, true);
      xhr.upload.onprogress = e => { if (onProgress && e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => {
        try {
          const r = JSON.parse(xhr.responseText);
          if (r.ok) resolve({ url: httpBase() + r.url, localUrl: r.url, name: r.name || name, size: r.size || file.size });
          else reject(new Error('upload failed'));
        } catch (e) { reject(e); }
      };
      xhr.onerror = () => reject(new Error('network'));
      xhr.ontimeout = () => reject(new Error('timeout'));
      xhr.send(file);
    });
  }

  return { on, emit, connect, disconnect, send, isOn, upload, serverUrl, httpBase, ping };
})();
