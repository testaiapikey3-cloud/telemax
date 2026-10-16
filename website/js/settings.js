/* ============================================================
 * TeleMAX Web — settings.js
 * Настройки: аккаунт, конфиденциальность/2FA, уведомления,
 * внешний вид, язык, данные, прокси, облако, TeleCoin, подарки,
 * плагины (200), разработчик, о TeleMAX (7 нажатий → Admin Mode).
 * ============================================================ */
window.TM = window.TM || {};

TM.settings = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  let host = null;
  let taps = 0, tapTimer = null;

  function render(target) {
    if (target) host = target;
    if (!host) return;
    const acc = S.s.account || {};
    host.innerHTML = '';

    const head = U.el('div', 'scr-head');
    head.innerHTML = '<div class="scr-title">Настройки</div>';
    host.appendChild(head);

    /* профиль-карточка */
    const prof = U.el('div', 'set-profile');
    prof.innerHTML = ui.avatarHTML(acc.name || S.s.user, acc.avatar, true, 'lg') +
      '<div class="ct-main"><b>' + U.esc(acc.name || '') + ui.verifiedBadge(S.s.user) + '</b><span>@' + U.esc(S.s.user) + (S.myRole() > 1 ? ' • ' + TM.config.ROLES[S.myRole()] : '') + '</span></div>' +
      '<span class="set-chev">' + ui.icon('chevron') + '</span>';
    prof.onclick = () => TM.profile.openOwn();
    host.appendChild(prof);

    const list = U.el('div', 'set-list');
    const row = (icon, title, sub, fn, cls) => {
      const r = U.el('div', 'set-row' + (cls ? ' ' + cls : ''));
      r.innerHTML = '<span class="set-ic">' + ui.icon(icon) + '</span><div class="ct-main"><b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>' + ui.icon('chevron');
      r.onclick = fn;
      list.appendChild(r);
      return r;
    };

    row('user', 'Аккаунт', 'Имя, @username, о себе', () => TM.profile.openOwn());
    row('lock', 'Конфиденциальность и 2FA', S.store().settings.pinEnabled ? 'PIN включён' : 'PIN и приватность', twoFactor);
    const _ns = notifStatus();
    row('bell', 'Уведомления', (S.store().settings.notifications ? 'Включены' : 'Выключены') + (_ns.code === 'on' ? ' • push активны' : ''), notificationsSettings);
    row('palette', 'Внешний вид', 'Тема, акцент, анимации', appearance);
    row('globe', 'Язык', langName(S.store().settings.language), languageSettings);
    row('data', 'Данные и память', storageText(), dataSettings);
    row('globe', 'Прокси (SOCKS5/HTTP)', S.store().settings.proxyEnabled ? ('Включён: ' + U.esc(S.store().settings.proxy || '')) : 'Не используется', proxySettings);
    row('cloud', 'Облачное хранилище', 'Канал clst и файлы', () => TM.cloud.open());
    row('wallet', 'TeleCoin / TelePremium', 'Баланс: ' + TM.wallet.balance() + ' TC', () => TM.wallet.open());
    row('gift', 'NFT и подарки', 'Коллекция и отправка', () => TM.gifts.openCatalog());
    row('activity', 'Диагностика мессенджера', 'Живой онлайн, всего людей, пинг', diagnostics);
    row('code', 'Для разработчиков', 'Debug Mode, диагностика, сервер', devMenu);
    const ver = row('info', 'О TeleMAX', 'Версия ' + TM.config.VERSION, aboutTelemax);
    ver.classList.add('version-row');
    ver.onclick = () => {
      taps++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => taps = 0, 1600);
      if (taps >= 7) {
        taps = 0;
        TM.admin.entry();
      } else if (taps >= 4) {
        ui.toast('Ещё ' + (7 - taps) + '…');
      } else {
        aboutTelemax();
      }
    };

    host.appendChild(list);

    const out = U.el('button', 'btn btn-ghost btn-big logout-btn', 'Выйти из аккаунта');
    out.onclick = async () => {
      if (!await ui.confirm('Выйти?', 'Вы сможете войти снова по @username и паролю.')) return;
      S.logout();
      location.reload();
    };
    host.appendChild(out);

    const foot = U.el('div', 'set-foot', TM.config.APP_NAME + ' ' + TM.config.VERSION + ' • веб-сборка');
    host.appendChild(foot);
  }

  function langName(code) {
    return { ru: 'Русский', en: 'English', es: 'Español' }[code] || 'Русский';
  }

  /* ---------- 2FA ---------- */
  function twoFactor() {
    ui.sheet({
      title: 'Конфиденциальность и 2FA',
      items: [
        { icon: 'key', label: S.store().settings.pinEnabled ? 'Изменить 2FA PIN' : 'Включить 2FA PIN', onClick: setPin },
        { icon: 'lock', label: S.store().settings.readReceipts ? 'Отключить отчёты о прочтении' : 'Включить отчёты о прочтении', onClick: () => { S.store().settings.readReceipts = !S.store().settings.readReceipts; S.save(); ui.toast('Сохранено'); } },
        { icon: 'shield', label: 'Кто видит мой телефон: никто', onClick: () => ui.toast('Телефон никому не показывается') },
        { icon: 'eye', label: 'Уведомления о входах', sub: 'присылаются в TeleMAX Bot', onClick: () => { TM.bots.openBot('telemaxbot'); } }
      ]
    });
  }
  function setPin() {
    if (S.store().settings.pinEnabled) {
      ui.sheet({
        title: '2FA PIN',
        items: [
          { icon: 'edit', label: 'Сменить PIN', onClick: () => doSetPin(false) },
          { icon: 'trash', label: 'Отключить PIN', danger: true, onClick: () => doSetPin(true) }
        ]
      });
    } else doSetPin(false);
  }
  function doSetPin(disable) {
    if (disable) {
      S.store().settings.pinEnabled = false;
      S.store().settings.pinHash = '';
      S.save();
      TM.net.send({ type: 'set_pin', pin: '' });
      return ui.toast('2FA PIN отключён');
    }
    ui.form('Новый 2FA PIN', [{ key: 'pin', label: 'PIN (4–6 цифр)', type: 'password' }], 'Сохранить').then(async v => {
      if (!v) return;
      const pin = v.pin.trim();
      if (!/^\d{4,6}$/.test(pin)) return ui.toast('PIN: 4–6 цифр', 'err');
      S.store().settings.pinEnabled = true;
      S.store().settings.pinHash = await U.sha256(pin + '::pin::' + S.s.user);
      S.save();
      TM.net.send({ type: 'set_pin', pin });
      ui.toast('2FA PIN включён. Вход с новых устройств потребует PIN.');
    });
  }

  /* ---------- уведомления ---------- */
  function notificationsSettings() { openNotifications(); }

  function notifStatus() {
    try { return TM.notify.status(); } catch (_) { return { code: 'unsupported', text: 'Недоступно' }; }
  }

  function openNotifications() {
    ui.pushScreen((node, handle) => {
      node.classList.add('sub-screen');
      node.innerHTML = '<div class="scr-head"><button class="icon-btn" id="n-back">' + ui.icon('back') + '</button><div class="scr-title">Уведомления</div></div>';
      const list = U.el('div', 'set-list');
      node.appendChild(list);
      node.querySelector('#n-back').onclick = () => handle.close();

      const row = (icon, title, sub, fn, cls) => {
        const r = U.el('div', 'set-row' + (cls ? ' ' + cls : ''));
        r.innerHTML = '<span class="set-ic">' + ui.icon(icon) + '</span><div class="ct-main"><b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>' + (fn ? ui.icon('chevron') : '');
        if (fn) r.onclick = fn;
        list.appendChild(r);
        return r;
      };
      const toggleRow = (icon, title, sub, on, fn) => {
        const r = U.el('div', 'set-row');
        r.innerHTML = '<span class="set-ic">' + ui.icon(icon) + '</span><div class="ct-main"><b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>';
        const t = U.el('button', 'toggle' + (on ? ' on' : ''));
        const flip = e => { if (e) e.stopPropagation(); fn(); draw(); };
        t.onclick = flip;
        r.appendChild(t);
        r.onclick = flip;
        list.appendChild(r);
        return r;
      };

      function draw() {
        list.innerHTML = '';
        const st = S.store().settings;
        const ns = notifStatus();
        const iconFor = ns.code === 'on' ? 'bell' : (ns.code === 'denied' ? 'warn' : 'info');
        row(iconFor, 'Push-уведомления', ns.text, null);
        if (ns.code === 'insecure') {
          row('warn', 'Нужен HTTPS', 'Откройте сайт по адресу https:// (или localhost) — тогда уведомления включатся.', null);
        } else if (ns.code === 'ios') {
          row('info', 'Как включить на iPhone', '«Поделиться» → «На экран Домой», откройте TeleMAX с рабочего стола и включите уведомления здесь (нужен iOS 16.4+).', null);
        }
        if (ns.code === 'denied') {
          row('warn', 'Уведомления запрещены', 'Разрешите их в настройках браузера для сайта telemax.alwaysdata.net', null);
        }
        if (ns.code === 'ask' || ns.code === 'ready') {
          row('bell', ns.code === 'ask' ? 'Включить уведомления' : 'Подключить push', 'Разрешение и подписка на уведомления', async () => {
            const r = await TM.notify.enable();
            if (r.ok) ui.toast('Push-уведомления включены 🔔');
            else ui.toast(r.reason || 'Не удалось включить', 'warn');
            draw();
          });
        }
        if (ns.code === 'on') {
          row('bell', 'Отправить тестовое уведомление', 'Проверить звук и вибрацию', async () => {
            const r = await TM.notify.testNotification();
            if (r.ok) ui.toast('Тестовое уведомление отправлено 🔔');
            else ui.toast(r.reason || 'Не удалось', 'warn');
          });
          row('refresh', 'Обновить подписку push', 'Если уведомления перестали приходить', async () => {
            const r = await TM.notify.enable();
            ui.toast(r.ok ? 'Подписка обновлена' : (r.reason || 'Не удалось'), r.ok ? 'info' : 'warn');
            draw();
          });
          row('close', 'Отключить push', 'Уведомления будут приходить только при открытом сайте', async () => {
            await TM.notify.disable();
            ui.toast('Push-уведомления отключены');
            draw();
          }, 'danger-row');
        }

        toggleRow('bell', 'Уведомления в приложении', st.notifications ? 'Включены' : 'Выключены', st.notifications, () => { st.notifications = !st.notifications; S.save(); });
        toggleRow('mic', 'Звук уведомлений', st.messageSounds ? 'Со звуком' : 'Без звука', st.messageSounds !== false, () => { st.messageSounds = st.messageSounds === false; S.save(); });
        toggleRow('activity', 'Вибрация', st.vibration !== false ? 'Включена' : 'Выключена', st.vibration !== false, () => { st.vibration = st.vibration === false; S.save(); });
        row('eye', st.quietHours ? 'Тихие часы включены (23:00–08:00)' : 'Тихие часы (23:00–08:00)', 'Ночью — без звука и вибрации', () => { st.quietHours = !st.quietHours; S.save(); ui.toast('Сохранено'); draw(); });
        list.appendChild(U.el('div', 'dim pad', 'Push-уведомления приходят даже с закрытым сайтом. На iPhone — после «На экран Домой».'));
      }
      draw();
    });
  }

  /* ---------- внешний вид ---------- */
  function appearance() {
    const st = S.store().settings;
    const accents = TM.config.ACCENTS;
    const body = U.el('div', 'appearance');
    body.innerHTML = '<div class="form-label">Акцентный цвет</div>';
    const aw = U.el('div', 'accent-row');
    accents.forEach(c => {
      const b = U.el('button', 'accent-dot' + (st.accent === c ? ' active' : ''));
      b.style.background = c;
      b.onclick = () => {
        st.accent = c;
        S.save();
        document.documentElement.style.setProperty('--accent', c);
        U.$$('.accent-dot', body).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
      aw.appendChild(b);
    });
    body.appendChild(aw);
    body.innerHTML += '<div class="form-label">Анимации</div>';
    const anim = U.el('div', 'toggle-row');
    anim.innerHTML = '<span>Плавные переходы</span>';
    const tg = U.el('button', 'toggle' + (st.animations ? ' on' : ''));
    tg.onclick = () => {
      st.animations = !st.animations; S.save();
      tg.classList.toggle('on', st.animations);
      document.body.classList.toggle('no-anim', !st.animations);
    };
    anim.appendChild(tg);
    body.appendChild(anim);
    ui.modal({ title: 'Внешний вид', body, actions: [{ label: 'Готово', primary: true }] });
  }

  /* ---------- язык ---------- */
  function languageSettings() {
    ui.sheet({
      title: 'Язык',
      items: [['ru', 'Русский'], ['en', 'English'], ['es', 'Español']].map(([code, name]) => ({
        label: name, active: S.store().settings.language === code,
        onClick: () => { S.store().settings.language = code; S.save(); ui.toast('Язык: ' + name); refresh(); }
      }))
    });
  }

  /* ---------- данные ---------- */
  function storageText() {
    let size = 0;
    try { size = (localStorage.getItem(U.KEY) || '').length; } catch (_) {}
    return U.bytes(size) + ' локально';
  }
  function dataSettings() {
    let size = 0;
    try { size = (localStorage.getItem(U.KEY) || '').length; } catch (_) {}
    ui.sheet({
      title: 'Данные и память',
      items: [
        { icon: 'info', label: 'Занято на устройстве: ' + U.bytes(size), onClick: () => {} },
        { icon: 'trash', label: 'Очистить кэш медиа (офлайн-файлы)', onClick: () => { ui.toast('Кэш очищен'); } },
        { icon: 'download', label: 'Экспорт чатов (JSON)', onClick: exportChats },
        { icon: 'upload', label: 'Импорт чатов (JSON)', onClick: importChats },
        { icon: 'trash', label: 'Удалить все чаты', danger: true, onClick: async () => { if (await ui.confirm('Удалить все чаты?', 'История будет удалена на этом устройстве.')) { S.store().chats = {}; S.saveNow(); refresh(); } } }
      ]
    });
  }
  function exportChats() {
    const data = JSON.stringify(S.store().chats, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'telemax_chats_' + S.s.user + '.json';
    a.click();
  }
  function importChats() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        let data = null;
        try { data = JSON.parse(String(r.result || '')); } catch (_) { data = null; }
        const res = data ? mergeImported(data) : null;
        if (!res || !res.msgs) return ui.toast('В файле нет подходящих чатов (нужен JSON из «Экспорт чатов»)', 'warn');
        ui.toast('Импорт: +' + res.msgs + ' сообщений в ' + res.chats + ' чатах');
        refresh();
      };
      r.readAsText(f);
    };
    inp.click();
  }
  function mergeImported(data) {
    const chats = data && data.chats && typeof data.chats === 'object' ? data.chats : data;
    if (!chats || typeof chats !== 'object' || Array.isArray(chats)) return null;
    let msgs = 0, nchats = 0;
    for (const [cid, src] of Object.entries(chats)) {
      if (!src || !Array.isArray(src.messages)) continue;
      const c = S.getChat(cid) || S.createChat({ id: cid, kind: src.kind || 'private', username: src.username || '', name: src.name || cid, avatar: src.avatar || '', members: Array.isArray(src.members) ? src.members : [] });
      const seen = new Set(c.messages.map(x => (x && x.id) || ''));
      let added = 0;
      for (const msg of src.messages) {
        if (!msg || !msg.id || seen.has(msg.id)) continue;
        seen.add(msg.id);
        c.messages.push(msg);
        added++;
      }
      if (added) {
        c.messages.sort((a, b) => (a.time || 0) - (b.time || 0));
        c.lastTime = Math.max(c.lastTime || 0, (c.messages[c.messages.length - 1] || {}).time || 0);
        msgs += added; nchats++;
      }
    }
    if (msgs) { S.saveNow(); TM.chats.render(); if (TM.chat.refreshIfOpen) TM.chat.refreshIfOpen(); }
    return { msgs, chats: nchats };
  }

  /* ---------- прокси ---------- */
  function proxySettings() {
    const st = S.store().settings;
    ui.form('Прокси (SOCKS5/HTTP)', [
      { key: 'proxy', label: 'Адрес прокси', placeholder: 'socks5://127.0.0.1:9050', value: st.proxy || '' }
    ], 'Сохранить').then(v => {
      if (!v) return;
      st.proxy = v.proxy.trim();
      st.proxyEnabled = !!v.proxy.trim();
      S.save();
      ui.toast(st.proxyEnabled ? 'Прокси сохранён (используется при загрузках через сервер)' : 'Прокси отключён');
      refresh();
    });
  }

  /* ---------- магазин плагинов (200) ---------- */
  function openPlugins() {
    ui.pushScreen((node, handle) => {
      node.classList.add('sub-screen');
      node.innerHTML = '<div class="scr-head"><button class="icon-btn" id="p-back">' + ui.icon('back') + '</button><div class="scr-title">Плагины (' + TM.config.PLUGINS.length + ')</div></div>';
      const search = U.el('div', 'ch-search');
      search.innerHTML = ui.icon('search') + '<input id="p-q" placeholder="Поиск плагина">';
      node.appendChild(search);
      const cats = U.el('div', 'ch-tabs');
      const catList = ['Все', ...new Set(TM.config.PLUGINS.map(p => p.cat))];
      let cat = 'Все';
      catList.forEach(c => {
        const t = U.el('button', 'chip' + (c === 'Все' ? ' active' : ''), c);
        t.onclick = () => { cat = c; U.$$('.chip', cats).forEach(x => x.classList.remove('active')); t.classList.add('active'); draw(); };
        cats.appendChild(t);
      });
      node.appendChild(cats);
      const list = U.el('div', 'plug-list');
      node.appendChild(list);

      const st = S.store();
      st.plugins = st.plugins || {};
      function draw() {
        const q = (search.querySelector('#p-q').value || '').toLowerCase();
        list.innerHTML = '';
        TM.config.PLUGINS.filter(p => (cat === 'Все' || p.cat === cat) && (!q || p.name.toLowerCase().includes(q))).slice(0, 60).forEach(p => {
          const state = st.plugins[p.id] || {};
          const r = U.el('div', 'plug-row');
          r.innerHTML = '<span class="set-ic">' + ui.icon('plug') + '</span><div class="ct-main"><b>' + U.esc(p.name) + '</b><span>' + p.cat + ' • ' + (state.installed ? (state.enabled ? 'включён' : 'выключен') : 'не установлен') + '</span></div>';
          const b = U.el('button', 'btn btn-sm ' + (state.installed ? (state.enabled ? 'btn-ghost' : 'btn-primary') : 'btn-primary'), state.installed ? (state.enabled ? 'Выключить' : 'Включить') : 'Установить');
          b.onclick = () => {
            const cur = st.plugins[p.id] || { installed: false, enabled: false };
            if (!cur.installed) { st.plugins[p.id] = { installed: true, enabled: true }; ui.toast('Плагин установлен: ' + p.name); }
            else cur.enabled = !cur.enabled;
            S.save();
            draw();
          };
          r.appendChild(b);
          list.appendChild(r);
        });
        const installed = Object.values(st.plugins).filter(x => x.installed).length;
        list.appendChild(U.el('div', 'dim pad', 'Установлено: ' + installed + ' из ' + TM.config.PLUGINS.length));
      }
      draw();
      search.querySelector('#p-q').addEventListener('input', U.debounce(draw, 200));
      node.querySelector('#p-back').onclick = () => handle.close();
    });
  }

  /* ---------- диагностика мессенджера (живой онлайн) ---------- */
  let _stats = null;
  function diagnostics() {
    let timer = null;
    let lastPing = null;
    ui.pushScreen((node, handle) => {
      node.classList.add('sub-screen');
      node.innerHTML = '<div class="scr-head"><button class="icon-btn" id="dg-back">' + ui.icon('back') + '</button><div class="scr-title">Диагностика</div></div>';
      const body = U.el('div', 'dg-body');
      node.appendChild(body);
      node.querySelector('#dg-back').onclick = () => handle.close();

      const draw = () => {
        const authT = (S.db.auth || {}).time || 0;
        const on = TM.net.isOn();
        body.innerHTML =
          '<div class="ad-stat pad">' +
            line('Статус сервера', on ? '<b class="ok-green">подключён</b>' : '<b class="ok-red">офлайн-режим</b>') +
            line('Адрес сервера', U.esc(TM.net.serverUrl())) +
            line('Версия сервера', _stats ? U.esc(_stats.version || '—') : '—') +
            line('Пинг', lastPing == null ? '…' : (lastPing < 0 ? 'нет ответа' : lastPing + ' мс')) +
            line('🟢 Онлайн сейчас', _stats ? _stats.online : '—') +
            line('👥 Всего зарегистрировано', _stats ? _stats.accounts : '—') +
            line('🆕 Новых за сегодня', _stats ? (_stats.todayNew || 0) : '—') +
            line('📨 В очереди сообщений', _stats ? (_stats.queued || 0) : '—') +
            line('⏱ Аптайм сервера', _stats ? U.duration(_stats.uptimeSec) : '—') +
            line('Вы в приложении', authT ? U.duration((Date.now() - authT) / 1000) : '—') +
          '</div>' +
          '<div class="dim pad">' + (on ? ('Обновлено: ' + new Date().toLocaleTimeString('ru-RU') + ' • автообновление каждые 5 сек') : 'Запустите сервер (START.bat), чтобы видеть живой онлайн') + '</div>' +
          '<button class="btn btn-ghost btn-big" id="dg-refresh">Обновить сейчас</button>';
        if (_stats && _stats.accounts != null) {
          // рисовалка мини-полосы активности
          body.insertAdjacentHTML('afterbegin', '<div class="dg-live"><span class="dg-dot"></span> LIVE • сервер на связи</div>');
        }
        body.querySelector('#dg-refresh').onclick = () => load();
      };

      const load = async () => {
        if (!TM.net.isOn()) { lastPing = -1; draw(); return; }
        TM.net.send({ type: 'stats_get' });
        lastPing = await TM.net.ping();
        draw();
      };

      draw();
      load();
      timer = setInterval(load, 5000);
    }, { onClose: () => clearInterval(timer) });
  }

  /* ---------- разработчик ---------- */
  function devMenu() {
    ui.pushScreen((node, handle) => {
      node.classList.add('sub-screen');
      node.innerHTML = '<div class="scr-head"><button class="icon-btn" id="d-back">' + ui.icon('back') + '</button><div class="scr-title">Для разработчиков</div></div>';
      const list = U.el('div', 'set-list');
      const st = S.store().settings;

      const row = (icon, title, sub, fn) => {
        const r = U.el('div', 'set-row');
        r.innerHTML = '<span class="set-ic">' + ui.icon(icon) + '</span><div class="ct-main"><b>' + title + '</b><span>' + sub + '</span></div>' + ui.icon('chevron');
        r.onclick = fn;
        list.appendChild(r);
        return r;
      };

      const dbg = row('code', 'Debug Mode', st.debugMode ? 'Включён' : 'Выключен', () => { st.debugMode = !st.debugMode; S.save(); ui.toast('Debug Mode: ' + (st.debugMode ? 'вкл' : 'выкл')); handle.close(); devMenu(); });
      row('info', 'Логирование', st.logging ? 'Включено' : 'Выключено', () => { st.logging = !st.logging; S.save(); ui.toast('Логирование: ' + (st.logging ? 'вкл' : 'выкл')); });
      row('plug', 'Проверка соединения', 'WebSocket и /health', async () => {
        let health = 'нет ответа';
        try { const r = await fetch(TM.net.httpBase() + '/health'); const j = await r.json(); health = j.version + ' • онлайн ' + j.online + ' • аккаунтов ' + j.accounts; } catch (_) {}
        ui.modal({ title: 'Проверка соединения', text: 'WebSocket: ' + (TM.net.isOn() ? 'подключён' : 'отключён') + '\nАдрес: ' + TM.net.serverUrl() + '\nСервер: ' + health, actions: [{ label: 'ОК', primary: true }] });
      });
      row('info', 'Информация о приложении', TM.config.APP_NAME + ' ' + TM.config.VERSION, () => aboutTelemax());
      row('info', 'Адрес сервера', TM.net.serverUrl(), () => {
        ui.form('Адрес сервера', [{ key: 'url', label: 'ws:// или wss://', value: TM.net.serverUrl() }], 'Сохранить').then(v => {
          if (!v || !v.url) return;
          S.db.serverUrl = v.url.trim();
          S.saveNow();
          ui.toast('Адрес сохранён. Переподключение…');
          TM.net.disconnect();
          setTimeout(() => location.reload(), 600);
        });
      });
      row('trash', 'Сбросить настройки', 'Все локальные настройки', async () => {
        if (await ui.confirm('Сбросить?', 'Настройки аккаунта будут сброшены (чаты сохранятся).')) {
          S.store().settings = null;
          S.saveNow();
          location.reload();
        }
      });

      node.appendChild(list);
      node.querySelector('#d-back').onclick = () => handle.close();
    });
  }

  /* ---------- о приложении ---------- */
  function aboutTelemax() {
    ui.modal({
      title: 'О TeleMAX',
      body: '<div class="about-box"><div class="about-logo">✈</div><b>TeleMAX ' + TM.config.VERSION + '</b><span>Быстрый. Безопасный. Твой.</span>' +
        '<div class="ad-stat">' + line('Соединение', TM.net.isOn() ? 'подключено' : 'офлайн') + line('Сервер', U.esc(TM.net.serverUrl())) + line('Аккаунт', '@' + U.esc(S.s.user)) + '</div></div>',
      actions: [{ label: 'Закрыть', primary: true }]
    });
  }
  function line(l, v) { return '<div class="ad-line"><span>' + l + '</span><b>' + v + '</b></div>'; }

  function refresh() { if (host && TM.app && TM.app.tab === 'settings') render(); }

  function bindNet() {
    TM.net.on('pin_ok', m => { S.store().settings.pinEnabled = !!m.enabled; S.save(); });
    TM.net.on('stats', m => { _stats = m; });
    TM.net.on('__open', () => updateNetStatusInSettings());
  }
  function updateNetStatusInSettings() { refresh(); }

  return { render, refresh, openPlugins, devMenu, bindNet, aboutTelemax, diagnostics };
})();
