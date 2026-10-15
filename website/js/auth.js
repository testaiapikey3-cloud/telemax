/* ============================================================
 * TeleMAX Web — auth.js
 * Экран приветствия, регистрация, вход, 2FA PIN, возобновление сессии.
 * ============================================================ */
window.TM = window.TM || {};

TM.auth = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  /* ---------- оригинальные иконки входа ---------- */
  const ICON_GOOGLE = '<svg class="oauth-svg" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>';
  const ICON_TELEGRAM = '<svg class="oauth-svg" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="#29A9EB" d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0z"/>' +
    '<path fill="#fff" d="M16.906 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>' +
    '</svg>';

  let resumeToken = '';   // токен текущей сессии (в памяти)
  let pendingLogin = null; // {user} при 2FA
  let screenHost = null;
  let _wStats = null;      // последняя живая статистика сервера (для экрана входа)

  function setResumeToken(t) { resumeToken = t; if (t && S.s.user) { S.db.resumeTokens = S.db.resumeTokens || {}; S.db.resumeTokens[S.s.user] = t; S.saveNow(); } }
  function storedToken() { return (S.db.resumeTokens || {})[S.s.user] || ''; }

  /* ---------- резюме сессии после реконнекта ---------- */
  function resumeSession() {
    if (!S.s.user) return;
    const token = resumeToken || storedToken();
    if (token) TM.net.send({ type: 'resume', user: S.s.user, token });
    else if (S.getAuth() && !S.s.wsOn) { /* офлайн — просто ждём */ }
  }

  /* ---------- вход в приложение ---------- */
  function enterApp(account) {
    S.s.account = account;
    S.saveAccount();
    ui.updateNetStatus();
    TM.app.buildShell();
    TM.chats.render();
    /* Приветствие для бота, если чата ещё нет */
    TM.bots.ensureBotChats && TM.bots.ensureBotChats();
  }

  function afterRegistered(m) {
    /* ВАЖНО: сначала активируем пользователя, иначе store() пуст и всё падает */
    S.setUser(m.user);
    S.s.account = m.account;
    S.saveAccount();
    S.setAuth(m.user);
    if (m.resumeToken) setResumeToken(m.resumeToken);
    pendingLogin = null;
    const st = S.store();
    st.analytics = st.analytics || { logins: 0, messagesSent: 0, mediaSent: 0 };
    st.analytics.logins = (st.analytics.logins || 0) + 1;
    S.save();
    enterApp(m.account);
    ui.toast('Добро пожаловать в TeleMAX, ' + (m.account.name || m.user) + '!');
  }

  /* ---------- экран: Добро пожаловать ---------- */
  function showWelcome() {
    const host = U.$('#auth');
    host.innerHTML = '';
    host.classList.add('show');

    const wrap = U.el('div', 'welcome');
    wrap.innerHTML =
      '<div class="w-glow"></div>' +
      '<div class="w-logo">' +
        '<div class="w-plane"></div>' +
      '</div>';
    // логотип-самолётик как на макете
    wrap.querySelector('.w-plane').innerHTML =
      '<svg viewBox="0 0 120 120" fill="none">' +
      '<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe082"/><stop offset=".5" stop-color="#ffc107"/><stop offset="1" stop-color="#ff8f00"/></linearGradient></defs>' +
      '<circle cx="60" cy="60" r="52" fill="#111114" stroke="url(#lg)" stroke-width="2" opacity=".9"/>' +
      '<path d="M30 62 88 34 66 86 56 68z" fill="url(#lg)"/>' +
      '<path d="M88 34 56 68l-2 16 8-14z" fill="#ffffff" opacity=".55"/>' +
      '</svg>';

    wrap.innerHTML +=
      '<div class="w-title">TeleMAX</div>' +
      '<div class="w-tag">Быстрый. Безопасный. Твой.</div>' +
      '<div class="w-status" id="w-status"></div>';

    const start = U.el('button', 'btn btn-primary btn-big', 'Начать');
    const login = U.el('button', 'btn btn-ghost btn-big', 'Вход');
    const none = U.el('div', 'w-none', 'У меня нет аккаунта');
    start.onclick = () => showRegister();
    login.onclick = () => showLogin();
    none.onclick = () => showRegister();

    const orBox = U.el('div', 'w-or', 'или войдите через');
    const oauthBox = U.el('div', 'w-oauth');
    const gBtn = U.el('button', 'oauth-btn');
    gBtn.innerHTML = ICON_GOOGLE + '<span>Google</span>';
    gBtn.title = 'Войти через Google';
    const tBtn = U.el('button', 'oauth-btn');
    tBtn.innerHTML = ICON_TELEGRAM + '<span>Telegram</span>';
    tBtn.title = 'Войти через Telegram';
    gBtn.onclick = () => oauthFlow('google');
    tBtn.onclick = () => oauthFlow('telegram');
    oauthBox.appendChild(gBtn); oauthBox.appendChild(tBtn);

    wrap.appendChild(start); wrap.appendChild(login); wrap.appendChild(none);
    wrap.appendChild(orBox); wrap.appendChild(oauthBox);
    host.appendChild(wrap);
    updateServerStatus();
    refreshWelcomeStats();
  }

  function updateServerStatus() {
    const el = U.$('#w-status');
    if (!el) return;
    if (TM.net.isOn()) {
      el.innerHTML = '<i class="dot ok"></i> Сервер подключён' + (_wStats ? ' • <b>' + _wStats.online + '</b> онлайн • всего <b>' + _wStats.accounts + '</b>' : '');
      if (!_wStats) TM.net.send({ type: 'stats_get' });
    } else {
      el.innerHTML = '<i class="dot off"></i> Сервер недоступен — офлайн-режим';
    }
  }
  function welcomeStatsHTML(m) {
    return '<i class="dot ok"></i> Сервер подключён • <b>' + m.online + '</b> онлайн • всего <b>' + m.accounts + '</b>';
  }
  function refreshWelcomeStats() {
    if (!U.$('#w-status')) return;
    if (TM.net.isOn()) TM.net.send({ type: 'stats_get' });
    setTimeout(refreshWelcomeStats, 7000);
  }

  /* ---------- экран: Вход ---------- */
  function showLogin() {
    const host = U.$('#auth');
    host.innerHTML = '';
    const box = U.el('div', 'authpane');
    box.innerHTML =
      '<div class="ap-back">' + ui.icon('back') + '</div>' +
      '<div class="ap-title">Добро пожаловать</div>' +
      '<div class="ap-sub">Войдите в свой аккаунт TeleMAX</div>' +
      '<label class="ap-label">@username</label>' +
      '<input class="ap-input" id="li-user" placeholder="@username" autocomplete="username">' +
      '<label class="ap-label">Пароль</label>' +
      '<div class="ap-pass"><input class="ap-input" id="li-pass" type="password" placeholder="Введите пароль" autocomplete="current-password"><span class="ap-eye" data-for="li-pass">' + ui.icon('eye') + '</span></div>' +
      '<div class="ap-links"><span id="li-forgot" class="link">Забыли пароль?</span></div>' +
      '<button class="btn btn-primary btn-big" id="li-go">Войти</button>' +
      '<div class="ap-or">или</div>' +
      '<button class="btn btn-dark btn-big" id="li-google">' + ICON_GOOGLE + ' Войти через Google</button>' +
      '<button class="btn btn-dark btn-big" id="li-tg">' + ICON_TELEGRAM + ' Войти через Telegram</button>' +
      '<div class="ap-foot">Нет аккаунта? <span class="link" id="li-reg">Создать аккаунт</span></div>';
    host.appendChild(box);
    box.querySelector('.ap-back').onclick = showWelcome;
    box.querySelector('#li-reg').onclick = showRegister;
    box.querySelector('#li-forgot').onclick = () => ui.modal({ title: 'Восстановление пароля', text: 'На сервере из этой сборки восстановление недоступно. Обратитесь к администратору или создайте новый аккаунт.', actions: [{ label: 'Понятно', primary: true }] });
    box.querySelector('#li-google').onclick = () => oauthFlow('google');
    box.querySelector('#li-tg').onclick = () => oauthFlow('telegram');
    eyeToggle(box);
    const go = () => doLogin(box.querySelector('#li-user').value.trim(), box.querySelector('#li-pass').value);
    box.querySelector('#li-go').onclick = go;
    box.querySelector('#li-pass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    host.classList.add('show');
  }

  /* ---------- экран: Регистрация ---------- */
  function showRegister() {
    const host = U.$('#auth');
    host.innerHTML = '';
    const box = U.el('div', 'authpane');
    box.innerHTML =
      '<div class="ap-back">' + ui.icon('back') + '</div>' +
      '<div class="ap-title">Создать аккаунт</div>' +
      '<div class="ap-sub">Регистрация в TeleMAX</div>' +
      '<label class="ap-label">Имя</label>' +
      '<input class="ap-input" id="rg-name" placeholder="Ваше имя" maxlength="64">' +
      '<label class="ap-label">@username</label>' +
      '<input class="ap-input" id="rg-user" placeholder="латиница, цифры, _" maxlength="32">' +
      '<label class="ap-label">Телефон (необязательно)</label>' +
      '<input class="ap-input" id="rg-phone" placeholder="+7 900 000-00-00" maxlength="32">' +
      '<label class="ap-label">Пароль</label>' +
      '<div class="ap-pass"><input class="ap-input" id="rg-pass" type="password" placeholder="Минимум 4 символа"><span class="ap-eye" data-for="rg-pass">' + ui.icon('eye') + '</span></div>' +
      '<label class="ap-label">2FA PIN (необязательно, 4–6 цифр)</label>' +
      '<input class="ap-input" id="rg-pin" type="password" inputmode="numeric" placeholder="PIN для входа с новых устройств" maxlength="6">' +
      '<button class="btn btn-primary btn-big" id="rg-go">Создать аккаунт</button>' +
      '<div class="ap-foot">Уже есть аккаунт? <span class="link" id="rg-login">Войти</span></div>';
    host.appendChild(box);
    box.querySelector('.ap-back').onclick = showWelcome;
    box.querySelector('#rg-login').onclick = showLogin;
    eyeToggle(box);
    box.querySelector('#rg-go').onclick = () => doRegister(box);
    host.classList.add('show');
  }

  function eyeToggle(box) {
    U.$$('.ap-eye', box).forEach(eye => {
      eye.onclick = () => {
        const inp = U.$('#' + eye.dataset.for, box);
        inp.type = inp.type === 'password' ? 'text' : 'password';
        eye.classList.toggle('on');
      };
    });
  }

  /* ---------- действия ---------- */
  function doRegister(box) {
    const user = box.querySelector('#rg-user').value.trim().replace(/^@/, '').toLowerCase();
    const name = box.querySelector('#rg-name').value.trim();
    const phone = box.querySelector('#rg-phone').value.trim();
    const pass = box.querySelector('#rg-pass').value;
    const pin = box.querySelector('#rg-pin').value.trim();

    if (!/^[a-z0-9_]{3,32}$/.test(user)) return ui.toast('Username: 3–32 символа (латиница, цифры, _)', 'err');
    if (name.length < 2) return ui.toast('Введите имя', 'err');
    if (pass.length < 4) return ui.toast('Пароль: минимум 4 символа', 'err');
    if (pin && !/^\d{4,6}$/.test(pin)) return ui.toast('2FA PIN: 4–6 цифр', 'err');

    if (!TM.net.isOn()) return offlineRegister(user, name, phone, pass, pin);

    TM.net.send({
      type: 'register', user, name, phone, pass, pin,
      deviceId: U.deviceId(), deviceLabel: U.deviceLabel()
    });
    ui.toast('Создаём аккаунт…');
  }

  function doLogin(user, pass) {
    user = String(user || '').replace(/^@/, '').toLowerCase();
    if (!user || !pass) return ui.toast('Введите @username и пароль', 'err');

    if (!TM.net.isOn()) return offlineLogin(user, pass);

    pendingLogin = { user };
    TM.net.send({ type: 'login', user, pass, deviceId: U.deviceId(), deviceLabel: U.deviceLabel() });
    ui.toast('Выполняется вход…');
  }

  function showPinScreen(user) {
    const host = U.$('#auth');
    host.innerHTML = '';
    const box = U.el('div', 'authpane');
    box.innerHTML =
      '<div class="ap-title center">TeleMAX</div>' +
      '<div class="ap-sub center">Код подтверждения</div>' +
      '<div class="ap-sub center dim">Вход с нового устройства. Введите 2FA PIN.</div>' +
      '<input class="ap-input pin" id="pin-in" type="password" inputmode="numeric" maxlength="6" placeholder="••••">' +
      '<button class="btn btn-primary btn-big" id="pin-go">Подтвердить</button>' +
      '<div class="ap-foot center"><span class="link" id="pin-back">Назад</span></div>';
    host.appendChild(box);
    box.querySelector('#pin-back').onclick = showWelcome;
    const go = () => {
      const pin = box.querySelector('#pin-in').value.trim();
      if (!pin) return;
      TM.net.send({ type: 'login_pin', pin });
      ui.toast('Проверяем PIN…');
    };
    box.querySelector('#pin-go').onclick = go;
    box.querySelector('#pin-in').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    host.classList.add('show');
    setTimeout(() => box.querySelector('#pin-in').focus(), 120);
  }

  /* ---------- вход через Google / Telegram ---------- */
  function prettyName(ident) {
    const local = String(ident).split('@')[0].replace(/[._\-]+/g, ' ').trim();
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : String(ident);
  }

  function oauthFlow(provider) {
    const isG = provider === 'google';
    const icon = isG ? ICON_GOOGLE : ICON_TELEGRAM;
    const ov = U.el('div', 'oauth-overlay');
    const card = U.el('div', 'oauth-card ' + (isG ? 'google' : 'telegram'));
    card.innerHTML =
      '<div class="oauth-head">' + icon +
        '<div class="oauth-t1">' + (isG ? 'Вход через Google' : 'Вход через Telegram') + '</div>' +
        '<div class="oauth-t2">' + (isG
          ? 'Выберите аккаунт Google, чтобы продолжить в TeleMAX'
          : 'Подтвердите вход в TeleMAX через Telegram') + '</div>' +
      '</div>' +
      '<label class="oauth-label">' + (isG ? 'Аккаунт Google (почта)' : 'Ваш @username в Telegram') + '</label>' +
      '<input class="oauth-input" id="oa-in" placeholder="' + (isG ? 'ivan@gmail.com' : '@username') + '" maxlength="48" autocomplete="off">' +
      '<div class="oauth-err" id="oa-err"></div>' +
      '<button class="oauth-go" id="oa-go">' + (isG ? 'Продолжить' : 'Подтвердить вход') + '</button>' +
      '<div class="oauth-cancel" id="oa-cancel">Отмена</div>' +
      '<div class="oauth-note">' + (isG
        ? 'Аккаунт TeleMAX привязывается к вашему Google — следующий вход в один клик.'
        : 'Аккаунт TeleMAX привязывается к вашему Telegram — следующий вход в один клик.') + '</div>';
    ov.appendChild(card);
    document.body.appendChild(ov);

    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    card.querySelector('#oa-cancel').onclick = close;

    const input = card.querySelector('#oa-in');
    setTimeout(() => input.focus(), 80);

    const submit = () => {
      const ident = input.value.trim().replace(/^@/, '').toLowerCase();
      const err = card.querySelector('#oa-err');
      err.textContent = '';
      if (isG && !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(ident)) { err.textContent = 'Введите корректную почту Google, например ivan@gmail.com'; return; }
      if (!isG && !/^[a-z0-9_]{3,32}$/.test(ident)) { err.textContent = 'Введите ваш @username в Telegram (3–32 символа)'; return; }

      if (TM.net.isOn()) {
        TM.net.send({
          type: 'oauth', provider, ident,
          name: isG ? prettyName(ident) : ident,
          deviceId: U.deviceId(), deviceLabel: U.deviceLabel()
        });
        ui.toast('Выполняется вход через ' + (isG ? 'Google' : 'Telegram') + '…');
        close();
      } else {
        offlineOAuth(provider, ident).then(ok => { if (ok) close(); });
      }
    };
    card.querySelector('#oa-go').onclick = submit;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  async function offlineOAuth(provider, ident) {
    const isG = provider === 'google';
    const db = S.db;
    db.store = db.store || {};
    let user = '';
    for (const [u, st] of Object.entries(db.store)) {
      if (st && st.account && st.account.oauth && st.account.oauth[provider] === ident) { user = u; break; }
    }
    if (!user) {
      let base = String(ident).split('@')[0].replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 28);
      if (base.length < 3) base = (base + '_' + provider.slice(0, 2)).slice(0, 32);
      user = base;
      let n = 1;
      while (db.store[user] && db.store[user].account) { n++; user = (base.slice(0, 29) + '_' + n).slice(0, 32); }
    }
    S.setUser(user);
    const st = S.store();
    if (!st.account) {
      st.account = {
        user, name: isG ? prettyName(ident) : ident, phone: '', about: '', avatar: '',
        registeredAt: Date.now(), role: 1, verified: false, coins: 1250, premium: false,
        gifts: [], nft: [], bots: [], cloud: [],
        banned: false, frozen: false, muted: false, online: true, offlineLocal: true,
        oauth: { [provider]: ident }
      };
      st.settings.pinEnabled = false;
      S.saveNow();
    }
    S.s.account = st.account;
    S.setAuth(user);
    enterApp(st.account);
    ui.toast('Вход через ' + (isG ? 'Google' : 'Telegram') + ' выполнен (офлайн-режим)');
    return true;
  }

  /* ---------- офлайн-режим ---------- */
  async function offlineRegister(user, name, phone, pass, pin) {
    const db = S.db;
    db.store[user] = db.store[user] || null;
    if (db.store[user] && db.store[user].account) return ui.toast('Этот @username уже занят на устройстве', 'err');
    S.setUser(user);
    const acc = {
      user, name, phone, about: '', avatar: '', registeredAt: Date.now(), role: 1, verified: false,
      coins: 1250, premium: false, gifts: [], nft: [], bots: [], cloud: [], banned: false, frozen: false, muted: false,
      online: true, offlineLocal: true
    };
    const st = S.store();
    st.account = acc;
    st.settings.pinEnabled = !!pin;
    if (pin) st.settings.pinHash = await U.sha256(pin + '::pin::' + user);
    S.saveNow();
    S.s.account = acc;
    S.setAuth(user);
    enterApp(acc);
    ui.toast('Офлайн-аккаунт создан. Подключитесь к серверу для общения.', 'warn');
  }

  async function offlineLogin(user, pass) {
    const db = S.db;
    const st = db.store[user];
    if (!st || !st.account) return ui.toast('Аккаунт не найден. Зарегистрируйтесь.', 'err');
    const key = 'offlinePass_' + user;
    const saved = (S.db.offlinePass || {})[user];
    if (!saved) {
      // первый вход офлайн: сохраняем пароль, чтобы дальше проверять
      S.db.offlinePass = S.db.offlinePass || {};
      S.db.offlinePass[user] = await U.sha256(pass + '::off::' + user);
    } else if (await U.sha256(pass + '::off::' + user) !== saved) {
      return ui.toast('Неверный пароль', 'err');
    }
    if (st.settings.pinEnabled) {
      const v = await ui.form('2FA PIN', [{ key: 'pin', label: 'Введите PIN', type: 'password', inputmode: 'numeric' }], 'Войти');
      if (!v) return;
      if (await U.sha256(v.pin + '::pin::' + user) !== st.settings.pinHash) return ui.toast('Неверный PIN', 'err');
    }
    S.setUser(user);
    S.s.account = st.account;
    S.setAuth(user);
    enterApp(st.account);
    ui.toast('Вход выполнен (офлайн-режим)');
  }

  /* ---------- обработчики сервера ---------- */
  function bindNet() {
    TM.net.on('registered', m => { afterRegistered(m); });
    TM.net.on('login_challenge', m => { showPinScreen(m.user); });
    TM.net.on('resume_failed', () => { U.$('#auth').classList.add('show'); showWelcome(); });
    TM.net.on('error', m => {
      ui.toast(m.message || 'Ошибка', 'err');
      if (/аккаунт не найден|неверный пароль/i.test(m.message || '')) { /* остаёмся на экране входа */ }
    });
    TM.net.on('stats', m => {
      _wStats = m;
      const el = U.$('#w-status');
      if (el && TM.net.isOn()) el.innerHTML = welcomeStatsHTML(m);
    });
    TM.net.on('__open', () => {
      if (S.s.user) resumeSession();
      updateServerStatus();
    });
  }

  /* ---------- загрузка ---------- */
  function boot() {
    bindNet();
    TM.net.connect();
    const auth = S.getAuth();
    if (auth && auth.user && S.db.store[auth.user] && S.db.store[auth.user].account) {
      // мгновенный вход локально; при подключении — резюме токена на сервере
      S.setUser(auth.user);
      S.s.account = S.db.store[auth.user].account;
      enterApp(S.s.account);
    } else {
      showWelcome();
    }
  }

  return { boot, showWelcome, enterApp, resumeSession, oauthFlow };
})();
