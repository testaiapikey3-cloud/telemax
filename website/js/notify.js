/* ============================================================
 * TeleMAX Web — notify.js
 * Уведомления: системные (звук + вибрация), push через сервер
 * (работают, даже когда сайт закрыт), рингтон входящего звонка.
 * ============================================================ */
window.TM = window.TM || {};

TM.notify = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  let swReg = null;            // регистрация service worker
  let pushSub = null;          // активная push-подписка браузера
  let audioCtx = null;         // Web Audio (звуки без файлов)
  let ringTimer = null;        // повтор рингтона
  let callNotifyTimer = null;  // повтор уведомления о звонке
  let callNotifyTag = '';

  /* ---------- поддержка ---------- */
  function swSupported() { return 'serviceWorker' in navigator; }
  function pushSupported() { return swSupported() && 'PushManager' in window && 'Notification' in window; }
  function isSecure() { return !!window.isSecureContext; }
  function permission() {
    try { return ('Notification' in window) ? Notification.permission : 'denied'; }
    catch (_) { return 'denied'; }
  }
  function hasPush() { return !!pushSub; }
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    try {
      return navigator.standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (_) { return false; }
  }
  function isYandex() {
    try { return /YaBrowser/i.test(navigator.userAgent); } catch (_) { return false; }
  }
  /* запрос разрешения: промис + старый колбэк (Яндекс Браузер, Safari) */
  function requestPerm() {
    return new Promise(resolve => {
      if (!('Notification' in window)) return resolve('denied');
      let done = false;
      const finish = p => { if (!done) { done = true; resolve(p || permission()); } };
      try {
        const r = Notification.requestPermission(finish);
        if (r && typeof r.then === 'function') r.then(finish, () => finish(permission()));
      } catch (_) {
        try { Notification.requestPermission().then(finish, () => finish(permission())); }
        catch (__) { finish(permission()); }
      }
      setTimeout(() => finish(permission()), 45000);
    });
  }
  function settings() {
    try { const st = S.store(); return (st && st.settings) || {}; }
    catch (_) { return {}; }
  }
  function enabled() { return settings().notifications !== false; }
  function quietNow() {
    const st = settings();
    if (!st.quietHours) return false;
    const h = new Date().getHours();
    return h >= 23 || h < 8;
  }

  /* ---------- звуки (Web Audio, без внешних файлов) ---------- */
  function ac() {
    if (audioCtx) return audioCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { audioCtx = new AC(); } catch (_) { audioCtx = null; }
    return audioCtx;
  }
  function unlock() {
    const c = ac();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (_) {} }
  }
  function beep(freq, at, dur, vol) {
    const c = ac();
    if (!c) return;
    try {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(at);
      o.stop(at + dur + 0.05);
    } catch (_) {}
  }
  function playMessageSound() {
    if (settings().messageSounds === false || quietNow()) return;
    const c = ac();
    if (!c) return;
    if (c.state === 'suspended') { try { c.resume(); } catch (_) {} }
    const t = c.currentTime + 0.02;
    beep(880, t, 0.18, 0.16);       // «дзынь»
    beep(1318.5, t + 0.12, 0.26, 0.13);
  }
  function vibrate(pattern) {
    if (settings().vibration === false || quietNow()) return;
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (_) {} }
  }

  /* ---------- рингтон звонка ---------- */
  function ringBurst() {
    const c = ac();
    if (c) {
      if (c.state === 'suspended') { try { c.resume(); } catch (_) {} }
      const t = c.currentTime + 0.02;
      [0, 0.18, 0.62, 0.80].forEach((off, i) => beep(i % 2 ? 1046.5 : 784, t + off, 0.15, 0.22));
      beep(659.25, t + 1.0, 0.5, 0.16);
    }
    vibrate([450, 180, 450, 180, 450, 900]);
  }
  function startRing() {
    stopRing();
    if (!enabled()) return;
    ringBurst();
    ringTimer = setInterval(ringBurst, 2600);
  }
  function stopRing() {
    clearInterval(ringTimer); ringTimer = null;
    clearInterval(callNotifyTimer); callNotifyTimer = null;
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (_) {} }
    closeCallNotifications();
  }
  function closeCallNotifications() {
    if (!swReg || !callNotifyTag) return;
    try {
      swReg.getNotifications({ tag: callNotifyTag }).then(list => list.forEach(n => { try { n.close(); } catch (_) {} })).catch(() => {});
    } catch (_) {}
    callNotifyTag = '';
  }

  /* ---------- системное уведомление ---------- */
  async function show(title, opts) {
    if (permission() !== 'granted') return false;
    try {
      if (!swReg) await register();
      if (swReg) { await swReg.showNotification(title, opts); return true; }
      new Notification(title, opts);
      return true;
    } catch (e) {
      try { new Notification(title, opts); return true; } catch (_) { return false; }
    }
  }

  /* ---------- входящее сообщение ---------- */
  function incomingMessage(opts) {
    if (!enabled()) return;
    playMessageSound();
    vibrate([180, 80, 180]);
    if (document.visibilityState === 'visible') return;   // всплывашка на экране уже показана
    if (hasPush()) return;                                // сервер пришлёт push (SW покажет)
    show(opts.title || 'TeleMAX', {
      body: String(opts.body || '').slice(0, 240),
      tag: opts.tag || 'tm-msg',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: quietNow() ? undefined : [180, 80, 180],
      silent: quietNow(),
      data: opts.data || {}
    });
  }

  /* ---------- входящий звонок ---------- */
  function incomingCall(opts) {
    if (!enabled()) return;
    startRing();
    if (document.visibilityState === 'visible') return;   // экран звонка и так виден
    if (hasPush()) return;                                // push от сервера разбудит систему
    callNotifyTag = 'tm-call-' + (opts.user || 'unknown');
    const draw = () => show(opts.title || 'Входящий звонок', {
      body: String(opts.body || '').slice(0, 240),
      tag: callNotifyTag,
      renotify: true,
      requireInteraction: true,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [500, 250, 500, 250, 500],
      data: opts.data || {}
    });
    draw();
    callNotifyTimer = setInterval(draw, 9000);
  }

  /* ---------- service worker + push ---------- */
  function swUrl() {
    // путь к sw.js от корня сайта (scope = корень)
    return 'sw.js';
  }
  async function register() {
    if (!swSupported()) return null;
    if (swReg) return swReg;
    try {
      swReg = await navigator.serviceWorker.register(swUrl());
      return swReg;
    } catch (e) {
      console.warn('service worker:', e && e.message);
      swReg = null;
      return null;
    }
  }
  function fromB64(s) {
    const pad = '='.repeat((4 - s.length % 4) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const u8 = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    return u8;
  }
  async function hasServerVapid() {
    try {
      const r = await fetch(TM.net.httpBase() + '/push/vapid', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.key ? j : null;
    } catch (_) { return null; }
  }
  async function subscribePush() {
    if (!S.s.user) return { ok: false, reason: 'Сначала войдите в аккаунт' };
    if (!isSecure()) return { ok: false, reason: 'Нужен HTTPS-адрес (на сервере сайта)' };
    if (!pushSupported()) {
      return {
        ok: false,
        reason: isIOS()
          ? 'На iPhone: «Поделиться» → «На экран Домой», затем включите уведомления уже из установленного приложения (iOS 16.4+)'
          : 'Этот браузер не поддерживает push-уведомления'
      };
    }
    /* Важно: окно разрешения запрашиваем ДО любых await и сразу из нажатия —
       Яндекс Браузер иначе молча отклоняет запрос */
    let perm = permission();
    if (perm === 'default') perm = await requestPerm();
    if (perm !== 'granted') {
      return {
        ok: false,
        denied: perm === 'denied',
        reason: perm === 'denied'
          ? 'Браузер заблокировал уведомления для сайта'
          : 'Окно разрешения не появилось — попробуйте ещё раз'
      };
    }
    const reg = await register();
    if (!reg) return { ok: false, reason: 'Service worker не зарегистрировался' };
    const meta = await hasServerVapid();
    if (!meta) return { ok: false, reason: 'Сервер не поддерживает push (обновите сервер на хостинге)' };
    try {
      let oldEndpoint = '';
      const old = await reg.pushManager.getSubscription().catch(() => null);
      if (old) { oldEndpoint = old.endpoint; try { await old.unsubscribe(); } catch (_) {} }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64(meta.key) });
      const res = await fetch(TM.net.httpBase() + '/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: S.s.user, subscription: sub.toJSON(), lang: (window.TM && TM.langs ? TM.langs.current() : '') })
      }).then(r => r.json()).catch(() => null);
      if (!res || !res.ok) {
        pushSub = null;
        return { ok: false, reason: (res && res.error) || 'Сервер не принял подписку' };
      }
      if (oldEndpoint && oldEndpoint !== sub.endpoint) {
        fetch(TM.net.httpBase() + '/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: S.s.user, endpoint: oldEndpoint })
        }).catch(() => {});
      }
      pushSub = sub;
      const st = settings();
      if (st) { st.pushEnabled = true; st.pushAsk = 0; S.save(); }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'Подписка не создана: ' + String((e && e.message) || e) };
    }
  }
  async function restorePush() {
    const reg = await register();
    if (!reg || !pushSupported()) return false;
    try {
      const sub = await reg.pushManager.getSubscription();
      if (sub) { pushSub = sub; syncPushLang(sub); return true; }
    } catch (_) {}
    pushSub = null;
    return false;
  }
  /* при каждом входе обновляем язык подписки — push-уведомления придут на нужном языке */
  function syncPushLang(sub) {
    if (!S.s.user || !sub) return;
    try {
      fetch(TM.net.httpBase() + '/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: S.s.user, subscription: sub.toJSON(), lang: (window.TM && TM.langs ? TM.langs.current() : '') })
      }).catch(() => {});
    } catch (_) {}
  }
  async function disablePush() {
    const st = settings();
    if (st) { st.pushEnabled = false; S.save(); }
    try {
      const reg = await register();
      const sub = reg && pushSupported() ? await reg.pushManager.getSubscription().catch(() => null) : null;
      if (sub) {
        const endpoint = sub.endpoint;
        try { await sub.unsubscribe(); } catch (_) {}
        fetch(TM.net.httpBase() + '/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: S.s.user, endpoint })
        }).catch(() => {});
      }
      pushSub = null;
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  }

  /* ---------- статус для настроек ---------- */
  function status() {
    if (!isSecure()) return { code: 'insecure', text: 'Нужен HTTPS-адрес сайта' };
    if (!pushSupported()) return { code: 'unsupported', text: 'Браузер не поддерживает push' };
    if (permission() === 'denied') return { code: 'denied', text: 'Заблокированы в браузере — нажмите, чтобы включить' };
    if (isIOS() && !isStandalone()) return { code: 'ios', text: 'На iPhone откройте через «На экран Домой»' };
    if (permission() === 'default') return { code: 'ask', text: 'Разрешение ещё не выдано' };
    if (hasPush()) return { code: 'on', text: 'Push подключены — придут и с закрытым сайтом' };
    return { code: 'ready', text: 'Разрешение есть, push ещё не подключён' };
  }

  /* ---------- тест ---------- */
  async function testNotification() {
    const r = await subscribePush();
    if (!r.ok) { if (r.denied) unblockHelp(); return r; }
    playMessageSound();
    vibrate([200, 100, 200]);
    await show('TeleMAX — проверка уведомлений', {
      body: 'Работает! Сообщение пришло со звуком и вибрацией 🔔',
      tag: 'tm-test',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [200, 100, 200],
      data: { kind: 'chat' }
    });
    return { ok: true };
  }

  /* ---------- открытие чата из уведомления ---------- */
  function openFromNotification(data) {
    data = data || {};
    const kind = data.kind || 'chat';
    if (kind === 'call') {
      if (TM.calls && TM.calls.isRinging && TM.calls.isRinging()) return;  // уже звонит
      if (data.user) ui.toast('Входящий звонок от @' + data.user + ' завершён', 'warn');
    }
    let chatId = String(data.chat || '');
    if (!chatId && data.user) chatId = S.chatIdForUser(data.user);
    if (!chatId) return;
    let c = S.getChat(chatId);
    if (!c) {
      if (chatId.startsWith('g_')) {
        c = S.createChat({ id: chatId, kind: 'group', name: data.title || 'Группа', members: [] });
      } else {
        const u = String(data.user || chatId.replace(/^u_/, ''));
        c = S.createChat({ id: chatId, kind: 'private', username: u, name: (S.profileOf(u) || {}).name || ('@' + u) });
      }
    }
    if (!c) return;
    if (TM.app && TM.app.selectTab) TM.app.selectTab('chats');
    if (TM.chat && TM.chat.open) TM.chat.open(chatId);
  }

  function pendingUrlData() {
    let q = null;
    try { q = new URLSearchParams(location.search); } catch (_) { return null; }
    const kind = q.get('tm_kind') || '';
    const chat = q.get('tm_chat') || '';
    const user = q.get('tm_user') || '';
    if (!kind && !chat && !user) return null;
    try { history.replaceState(null, '', location.pathname); } catch (_) {}
    return { kind: kind || 'chat', chat, user };
  }
  function flushPendingOpen() {
    if (!S.s.user) return;
    const d = pendingUrlData();
    if (!d) return;
    setTimeout(() => openFromNotification(d), 500);
  }

  /* ---------- видимость вкладки: сервер знает, когда шлать push ---------- */
  function sendState() {
    if (!S.s.user || !TM.net.isOn()) return;
    TM.net.send({ type: 'app_state', hidden: document.visibilityState !== 'visible' });
  }

  /* ---------- после входа ---------- */
  async function afterLogin() {
    if (!S.s.user) return;
    flushPendingOpen();
    if (!TM.net.isOn()) return;
    await restorePush();
    if (permission() === 'granted') {
      if (!pushSub && pushSupported() && isSecure() && settings().pushEnabled !== false) {
        subscribePush();
      }
      return;
    }
    // один раз мягко предложить включить уведомления (не чаще раза в неделю)
    const st = settings();
    const asked = Number(st.pushAsk || 0);
    if (permission() === 'default' && pushSupported() && isSecure() && Date.now() - asked > 7 * 24 * 3600 * 1000) {
      st.pushAsk = Date.now(); S.save();
      if (isIOS() && !isStandalone()) return;   // на iPhone сначала «на экран Домой»
      const ok = await ui.modal({
        title: 'Включить уведомления?',
        text: 'TeleMAX будет присылать уведомления о сообщениях и звонках — со звуком и вибрацией, даже когда сайт закрыт.',
        actions: [
          { label: 'Включить', primary: true, value: true },
          { label: 'Позже', value: false }
        ]
      });
      if (!ok) return;
      const r = await subscribePush();
      if (r.ok) ui.toast('Уведомления включены 🔔');
      else if (r.denied) unblockHelp();
      else ui.toast(r.reason || 'Не получилось включить уведомления', 'warn');
    }
  }

  /* ---------- уведомления заблокированы: как включить ---------- */
  async function unblockHelp() {
    const ya = isYandex();
    let host = 'сайт';
    try { host = location.hostname || host; } catch (_) {}
    const text = ya
      ? 'Яндекс Браузер заблокировал уведомления для этого сайта. Как включить:\n\n1. Нажмите на 🔒 (замок) или щит слева от адреса сайта.\n2. «Настройки сайта» → «Уведомления» → «Разрешить».\n3. Если пункта нет — введите в адресную строку browser://settings/content/notifications, найдите ' + host + ' и поставьте «Разрешить».\n4. Вернитесь сюда и нажмите «Проверить снова».'
      : 'Браузер заблокировал уведомления для этого сайта. Как включить:\n\n1. Нажмите на 🔒 (замок) слева от адреса сайта.\n2. «Настройки сайта» → «Уведомления» → «Разрешить».\n3. Вернитесь сюда и нажмите «Проверить снова».';
    const act = await ui.modal({
      title: 'Как включить уведомления',
      text: text,
      actions: [
        { label: 'Проверить снова', primary: true, value: 'check' },
        { label: 'Закрыть', value: false }
      ]
    });
    if (act !== 'check') return { ok: false, reason: 'denied' };
    if (permission() !== 'granted') {
      const rl = await ui.modal({
        title: 'Пока не разрешено',
        text: 'Если вы уже выбрали «Разрешить» — обновите страницу, и настройка применится. После этого включите уведомления в настройках TeleMAX.',
        actions: [
          { label: 'Обновить страницу', primary: true, value: true },
          { label: 'Позже', value: false }
        ]
      });
      if (rl) { try { location.reload(); } catch (_) {} }
      return { ok: false, reason: 'denied' };
    }
    const r = await subscribePush();
    if (r.ok) ui.toast('Уведомления включены 🔔');
    else if (r.denied) ui.toast('Ещё не разрешено — проверьте настройки браузера', 'warn');
    else ui.toast(r.reason || 'Не получилось включить', 'warn');
    return r;
  }

  /* ---------- запуск ---------- */
  function bind() {
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });

    register().then(reg => {
      if (!reg) return;
      restorePush();
    });
    if (swSupported() && navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener('message', e => {
        const d = e.data || {};
        if (d.type === 'tm_open') openFromNotification(d.data || {});
      });
    }
    document.addEventListener('visibilitychange', sendState);
    TM.net.on('registered', () => {
      sendState();
      setTimeout(() => { afterLogin(); }, 400);
    });
    TM.net.on('__open', () => { setTimeout(sendState, 100); });
    // если пользователь уже вошёл (локальная сессия) — мягкие шаги без сервера
    setTimeout(() => { if (S.s.user) afterLogin(); }, 2000);
    flushPendingOpen();
  }

  return {
    bind, status, enable: subscribePush, disable: disablePush,
    hasPush, supported: pushSupported, isIOS, isStandalone, isSecure, permission,
    incomingMessage, incomingCall, startRing, stopRing,
    sendState, testNotification, openFromNotification, quietNow,
    isYandex, unblockHelp, requestPerm
  };
})();
