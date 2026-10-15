/* ============================================================
 * TeleMAX Web — admin.js
 * Admin Mode: секретный вход по коду, панель по ролям 0–5.
 * Уровень 4+: аналитика онлайна, аккаунты, роли, верификация,
 * Ban/Freeze, жалобы, TeleCoin, NFT, клинок подарков, рассылка,
 * модерация, сессии, безопасность, плагины, сервис, служебный вход.
 * Уровень 3: жалобы, статистика, онлайн, уведомления, компенсации…
 * Уровень 2: создать жалобу, создать аккаунт.
 * ============================================================ */
window.TM = window.TM || {};

TM.admin = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  let _snap = null;
  let _snapWaiters = [];

  /* ---------- ключ доступа ---------- */
  function storedKey() { return (S.db.adminKey || '').trim(); }
  function setKey(k) { S.db.adminKey = k; S.saveNow(); }
  function sendAdmin(action, extra) {
    const msg = Object.assign({ type: 'admin_action', action }, extra || {});
    const k = storedKey();
    if (k) msg.adminKey = k;
    TM.net.send(msg);
  }

  /* ---------- вход ---------- */
  function entry() {
    if (S.myRole() >= 4 || storedKey()) return openPanel();
    ui.form('Секретный доступ', [
      { key: 'code', label: 'Код разработчика', type: 'password', placeholder: 'Введите код' }
    ], 'Войти').then(v => {
      if (!v || !v.code) return;
      if (!TM.net.isOn()) {
        // офлайн: сравним локально с сохранённым кодом (если был) — иначе отказ
        return ui.toast('Admin Mode на сервере недоступен. Подключитесь к серверу.', 'err');
      }
      S.db._pendingAdminCode = v.code;
      TM.net.send({ type: 'admin_check', adminKey: v.code });
    });
  }

  function onCheck(m) {
    const code = S.db._pendingAdminCode || '';
    delete S.db._pendingAdminCode;
    if (m.ok) {
      if (!m.viaRole && code) setKey(code);
      ui.toast('Admin Mode открыт ✓');
      openPanel();
    } else {
      ui.toast('Неверный код доступа', 'err');
    }
  }

  /* ---------- панель ---------- */
  function openPanel() {
    const level = S.myRole() >= 4 ? S.myRole() : (storedKey() ? 4 : 0);
    ui.pushScreen((node, handle) => {
      node.classList.add('sub-screen');
      node.innerHTML =
        '<div class="scr-head"><button class="icon-btn" id="ad-back">' + ui.icon('back') + '</button><div class="scr-title">Admin Mode • ' + TM.config.ROLES[level] + '</div></div>' +
        '<div class="scr-sub">Уровень доступа: ' + level + ' / 5</div>';
      const list = U.el('div', 'set-list');

      const row = (icon, title, sub, fn) => {
        const r = U.el('div', 'set-row');
        r.innerHTML = '<span class="set-ic">' + ui.icon(icon) + '</span><div class="ct-main"><b>' + title + '</b><span>' + sub + '</span></div>' + ui.icon('chevron');
        r.onclick = fn;
        list.appendChild(r);
      };

      if (level >= 4) {
        row('data', 'Аналитика онлайна', 'Кто сейчас сидит, сколько времени, счётчики', analytics);
        row('contacts', 'Аккаунты', 'Полное управление аккаунтами', accountsScreen);
        row('search', 'Поиск пользователя', 'Найти по имени или @username', lookup);
        row('star', 'Роли доступа', 'Назначить уровни 0–5', rolesFlow);
        row('verified', 'Верификация', 'Точное совпадение имени + username', verifyFlow);
        row('eye', 'Проверка верификаций', 'Список выданных галочек', verifyList);
        row('lock', 'Ban / Freeze', 'Забанить, разбанить, заморозить', moderationFlow);
        row('warn', 'Жалобы', 'Проверка и обработка жалоб', reportsScreen);
        row('wallet', 'TeleCoin', 'Выдать TeleCoin пользователю', grantCoins);
        row('gift', 'NFT / Подарки', 'Выдача подарков и NFT', grantNft);
        row('trash', 'Клинок подарков', 'Удалить все или выбранные подарки', giftBlade);
        row('bell', 'Рассылка', 'Системное сообщение всем пользователям', broadcast);
        row('shield', 'Модерация', 'Предупреждение / мут / кик', modTools);
        row('key', 'Сессии', 'Служебные коды и очистка', sessions);
        row('info', 'Безопасность', 'Проверка банов, ролей и защиты', securityCheck);
        row('plug', 'Плагины', 'Магазин и настройка 200 плагинов', () => { handle.close(); TM.settings.openPlugins(); });
        row('settings', 'Сервис', 'Диагностика, очередь, обслуживание', maintenance);
        row('user', 'Служебный вход', 'Одноразовый код владельца', supportFlow);
      } else if (level === 3) {
        row('warn', 'Создать жалобу', 'Передать случай старшему модератору', createReport);
        row('info', 'Проверить жалобы', 'Согласовать для администратора', reportsScreen);
        row('data', 'Статистика чатов', 'Активность пользователей', chatStats);
        row('search', 'Поиск сообщений', 'Поиск по содержимому чатов', searchMessages);
        row('eye', 'Просмотр онлайн', 'Кто сейчас в сети', onlineList);
        row('info', 'История действий', 'Логи модерации', actionHistory);
        row('notifications', 'Уведомление пользователей', 'Отправить предупреждение', notifyUser);
        row('lock', 'Временный бан', 'Блокировка на N дней', tempBan);
        row('data', 'Экспорт отчёта', 'Отчёт о модерации (JSON)', exportReport);
        row('search', 'Целевая проверка', 'Детальная проверка пользователя', targetedCheck);
        row('user', 'Создать аккаунт', 'Ограниченное создание', createAccount);
        row('wallet', 'Компенсации', 'Выдача TeleCoin за ошибки', grantCoins);
        row('contacts', 'Контроль устройств', 'Просмотр активных сессий', deviceControl);
        row('settings', 'Автомодерация', 'Автоправила (локально)', autoModeration);
        row('trash', 'Архив удалённого', 'Удалённые сообщения (локально)', deletedArchive);
        row('shield', 'Проверка безопасности', 'Подозрительная активность', securityCheck);
      } else if (level === 2) {
        row('warn', 'Создать жалобу', 'Передать случай старшему модератору', createReport);
        row('user', 'Создать аккаунт', 'Ограниченное создание', createAccount);
      } else {
        row('key', 'Введите код', 'Секретный доступ закрыт', entry);
      }

      node.appendChild(list);
      node.querySelector('#ad-back').onclick = () => handle.close();
    });
  }

  /* ---------- снимок сервера ---------- */
  function snapshot(cb) {
    if (!TM.net.isOn()) { ui.toast('Нужно подключение к серверу', 'err'); return; }
    if (_snap && Date.now() - _snap._t < 3000) return cb(_snap);
    _snapWaiters.push(cb);
    sendAdmin('snapshot');
  }
  function onSnapshot(m) {
    _snap = m; _snap._t = Date.now();
    // локальные жалобы тоже обновим
    const st = S.store();
    st.serverReports = m.reports || [];
    S.save();
    _snapWaiters.forEach(cb => { try { cb(_snap); } catch (e) { console.error(e); } });
    _snapWaiters = [];
  }

  /* ---------- 4+: аналитика ---------- */
  function analytics() {
    snapshot(sn => {
      const c = sn.counts;
      const online = sn.onlineList.map(o => '• ' + o.name + ' @' + o.user + ' — ' + U.duration(o.seconds)).join('\n') || 'Никого нет в сети';
      ui.modal({
        title: 'Аналитика онлайна',
        body: '<div class="ad-stat">' +
          line('Всего аккаунтов', c.total) + line('🟢 Онлайн сейчас', c.online) + line('🆕 Новых за сегодня', c.todayNew || 0) +
          line('Заблокировано', c.banned) +
          line('Заморожено', c.frozen) + line('В муте', c.muted || 0) + line('Верифицировано', c.verified) + line('Premium', c.premium) +
          line('Админов (4+)', c.admins || 0) + line('Групп и каналов', c.groups) + line('В очереди сообщений', c.queued) +
          line('Сокетов на сервере', sn.server.sockets) + line('Аптайм', U.duration(sn.server.uptimeSec)) +
          '</div><div class="scr-sub">Кто сейчас в сети (живой онлайн)</div><div class="ad-online">' + U.esc(online).replace(/\n/g, '<br>') + '</div>',
        actions: [{ label: 'Обновить', onClick: () => { _snap = null; analytics(); return false; } }, { label: 'Закрыть', primary: true }]
      });
    });
  }
  function line(label, value) {
    return '<div class="ad-line"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  function accountsScreen() {
    snapshot(sn => {
      ui.pushScreen((node, handle) => {
        node.classList.add('sub-screen');
        node.innerHTML = '<div class="scr-head"><button class="icon-btn" id="a-back">' + ui.icon('back') + '</button><div class="scr-title">Аккаунты (' + sn.accounts.length + ')</div></div>';
        const search = U.el('div', 'ch-search');
        search.innerHTML = ui.icon('search') + '<input id="a-q" placeholder="Поиск">';
        node.appendChild(search);
        const list = U.el('div', 'ct-list');
        const draw = q => {
          list.innerHTML = '';
          sn.accounts.filter(a => !q || a.user.includes(q) || (a.name || '').toLowerCase().includes(q)).forEach(a => {
            const r = U.el('div', 'ct-user');
            r.innerHTML = ui.avatarHTML(a.name || a.user, '', a.online, 'md') +
              '<div class="ct-main"><b>' + U.esc(a.name) + ' <span class="dim">@' + a.user + '</span></b><span>' + TM.config.ROLES[a.role] +
              ' • ' + (a.online ? 'в сети ' + U.duration((Date.now() - a.since) / 1000) : 'офлайн') + '</span></div>' +
              (a.banned ? '<b class="tag red">бан</b>' : a.frozen ? '<b class="tag red">фрозен</b>' : '') +
              (a.verified ? '<b class="tag blue">✓</b>' : '');
            r.onclick = () => accountActions(a, sn, () => { handle.close(); accountsScreen(); });
            list.appendChild(r);
          });
        };
        draw('');
        node.appendChild(list);
        search.querySelector('#a-q').addEventListener('input', U.debounce(e => draw(e.target.value.toLowerCase()), 200));
        node.querySelector('#a-back').onclick = () => handle.close();
      });
    });
  }

  function accountActions(a, sn, refresh) {
    ui.sheet({
      title: a.name + ' @' + a.user,
      items: [
        { header: TM.config.ROLES[a.role] + (a.banned ? ' • BAN' : a.frozen ? ' • FROZEN' : '') + (a.verified ? ' • ✓' : '') },
        { icon: 'lock', label: a.banned ? 'Разбанить' : 'Забанить', danger: !a.banned, onClick: () => sendAdmin(a.banned ? 'unban' : 'ban', { target: a.user }) },
        { icon: 'shield', label: a.frozen ? 'Разморозить' : 'Заморозить', onClick: () => sendAdmin(a.frozen ? 'unfreeze' : 'freeze', { target: a.user }) },
        { icon: 'verified', label: a.verified ? 'Снять верификацию' : 'Выдать верификацию', onClick: () => verifyFlow(a) },
        { icon: 'star', label: 'Роль: ' + TM.config.ROLES[a.role], onClick: () => rolePicker(a) },
        { icon: 'wallet', label: 'Выдать TeleCoin', onClick: () => grantCoins(a.user) },
        { icon: 'gift', label: 'Выдать NFT', onClick: () => grantNft(a.user) },
        { icon: 'trash', label: 'Клинок подарков', danger: true, onClick: () => giftBlade(a.user) },
        { icon: 'wallet', label: a.premium ? 'Отключить TelePremium' : 'Выдать TelePremium (30 дней)', onClick: () => sendAdmin('grant_premium', { target: a.user, on: !a.premium }) },
        { icon: 'key', label: 'Сбросить 2FA PIN', onClick: async () => { if (await ui.confirm('Сбросить 2FA PIN у @' + a.user + '?', 'При следующем входе пользователь задаст новый PIN.')) sendAdmin('reset_pin', { target: a.user }); } },
        { icon: 'edit', label: 'Сменить имя (@' + a.user + ')', onClick: () => ui.form('Сменить имя @' + a.user, [{ key: 'name', label: 'Новое имя', value: a.name }], 'Сохранить').then(v => { if (!v) return; if (v.name && v.name.trim().length >= 2) sendAdmin('set_name', { target: a.user, name: v.name.trim() }); else ui.toast('Имя: минимум 2 символа', 'err'); }) },
        { icon: 'logout', label: 'Завершить все сессии', danger: true, onClick: async () => { if (await ui.confirm('Завершить сессии @' + a.user + '?', 'Пользователь будет отключён от мессенджера на всех устройствах.')) sendAdmin('logout_all', { target: a.user }); } },
        { icon: 'info', label: 'Детали', onClick: () => ui.modal({ title: '@' + a.user, body: '<div class="ad-stat">' + line('Имя', U.esc(a.name)) + line('Роль', TM.config.ROLES[a.role]) + line('TeleCoin', a.coins) + line('TelePremium', a.premium ? '✓ активен' : 'нет') + line('Подарков', a.gifts) + line('NFT', a.nft) + line('2FA PIN', a.pin ? 'включён' : 'нет') + line('Мут', a.muted ? 'да' : 'нет') + line('Устройств', a.devices || 0) + line('Регистрация', a.registeredAt ? new Date(a.registeredAt).toLocaleString('ru-RU') : '—') + line('Устройство', U.esc(a.device || '—')) + line('О себе', U.esc(a.about || '—')) + '</div>', actions: [{ label: 'Закрыть', primary: true }] }) },
        { icon: 'trash', label: 'Удалить аккаунт', danger: true, onClick: async () => { if (await ui.confirm('Удалить @' + a.user + '?', 'Действие необратимо.')) { sendAdmin('delete_account', { target: a.user }); refresh && refresh(); } } }
      ]
    });
  }

  /* ---------- поиск/роли/верификация ---------- */
  function lookup() {
    snapshot(sn => {
      ui.form('Поиск пользователя', [{ key: 'q', label: 'Имя или @username' }], 'Найти').then(v => {
        if (!v || !v.q) return;
        const q = v.q.trim().toLowerCase().replace(/^@/, '');
        const found = sn.accounts.filter(a => a.user.includes(q) || (a.name || '').toLowerCase().includes(q));
        ui.modal({
          title: 'Результат',
          body: found.length ? found.map(a => '<div class="ad-line"><span>' + U.esc(a.name) + ' @' + a.user + '</span><b>' + TM.config.ROLES[a.role] + (a.online ? ' • в сети' : '') + '</b></div>').join('') : '<div class="dim">Пользователь не найден.</div>',
          actions: [{ label: 'Закрыть', primary: true }]
        });
      });
    });
  }

  function rolesFlow() {
    snapshot(sn => {
      ui.sheet({
        title: 'Выберите аккаунт',
        items: sn.accounts.map(a => ({
          label: a.name + '  @' + a.user + ' — ' + TM.config.ROLES[a.role],
          onClick: () => rolePicker(a)
        }))
      });
    });
  }
  function rolePicker(a) {
    ui.sheet({
      title: 'Роль: ' + a.name,
      items: TM.config.ROLES.map((r, i) => ({
        label: i + ' — ' + r, active: a.role === i,
        onClick: () => { sendAdmin('set_role', { target: a.user, role: i }); ui.toast('Роль обновлена: ' + r); }
      }))
    });
  }

  function verifyFlow(preset) {
    const fields = [
      { key: 'name', label: 'Точное имя (как в профиле)', value: preset ? preset.name : '' },
      { key: 'user', label: 'Точный @username', value: preset ? preset.user : '' }
    ];
    ui.modal({ title: '✓ Верификация по совпадению', text: 'Галочка появится только если имя и username точно совпадают с аккаунтом.', body: buildFormHTML(fields), actions: [
      { label: 'Выдать', primary: true, onClick: () => {
        const b = U.$('#ad-vf');
        const name = b.querySelector('[data-k=name]').value.trim();
        const user = b.querySelector('[data-k=user]').value.trim().replace(/^@/, '');
        if (!name || !user) { ui.toast('Нужны имя и username', 'err'); return false; }
        sendAdmin('verify', { target: user, name, kind: 'person' });
      } },
      { label: 'Отмена' }
    ], onRender: (box) => { box.querySelector('.modal-body').id = 'ad-vf'; } });
  }
  function buildFormHTML(fields) {
    return fields.map(f => '<label class="form-label">' + U.esc(f.label) + '</label><input class="form-input" data-k="' + f.key + '" value="' + U.esc(f.value || '') + '">').join('');
  }

  function verifyList() {
    snapshot(sn => {
      const v = sn.accounts.filter(a => a.verified);
      ui.modal({
        title: 'Верифицированные (' + v.length + ')',
        body: v.length ? v.map(a => '<div class="ad-line"><span>' + U.esc(a.name) + ' @' + a.user + '</span><b>' + ui.icon('verified') + '</b></div>').join('') : '<div class="dim">Галочек пока нет.</div>',
        actions: [{ label: 'Закрыть', primary: true }]
      });
    });
  }

  /* ---------- бан/модерация ---------- */
  function moderationFlow() {
    ui.form('Управление доступом', [{ key: 'user', label: '@username' }], 'Далее').then(v => {
      if (!v || !v.user) return;
      const u = v.user.trim().replace(/^@/, '').toLowerCase();
      ui.sheet({
        title: '@' + u,
        items: [
          { label: 'Ban (блокировка)', danger: true, onClick: () => sendAdmin('ban', { target: u }) },
          { label: 'Unban (разблокировать)', onClick: () => sendAdmin('unban', { target: u }) },
          { label: 'Freeze (заморозка)', danger: true, onClick: () => sendAdmin('freeze', { target: u }) },
          { label: 'Unfreeze (разморозить)', onClick: () => sendAdmin('unfreeze', { target: u }) },
          { label: 'Сбросить роль → 0', onClick: () => sendAdmin('set_role', { target: u, role: 0 }) }
        ]
      });
    });
  }

  function modTools() {
    ui.form('Инструменты модерации', [
      { key: 'user', label: '@username' },
      { key: 'reason', label: 'Причина' }
    ], 'Далее').then(v => {
      if (!v || !v.user) return;
      const u = v.user.trim().replace(/^@/, '').toLowerCase();
      ui.sheet({
        title: '@' + u,
        items: [
          { icon: 'warn', label: 'Предупредить', onClick: () => sendAdmin('warn', { target: u, reason: v.reason }) },
          { icon: 'lock', label: 'Мут', onClick: () => sendAdmin('mute', { target: u, reason: v.reason }) },
          { icon: 'check', label: 'Снять мут', onClick: () => sendAdmin('unmute', { target: u }) },
          { icon: 'logout', label: 'Кик (отключить)', danger: true, onClick: () => sendAdmin('kick', { target: u }) }
        ]
      });
    });
  }

  /* ---------- жалобы ---------- */
  function createReport() {
    if (S.myRole() < 2) return ui.toast('Недостаточно прав', 'err');
    ui.form('Новая жалоба', [
      { key: 'user', label: '@username нарушителя' },
      { key: 'reason', label: 'Причина', multiline: true }
    ], 'Отправить').then(v => {
      if (!v || !v.user || !v.reason) return;
      if (TM.net.isOn()) TM.net.send({ type: 'report_create', target: v.user.trim().replace(/^@/, '').toLowerCase(), reason: v.reason.trim() });
      else ui.toast('Жалобы отправляются через сервер', 'err');
      log('Жалоба на @' + v.user.trim());
    });
  }

  function reportsScreen() {
    snapshot(sn => {
      const reps = sn.reports || [];
      const open = reps.filter(r => r.status !== 'closed');
      if (!open.length) return ui.modal({ title: 'Жалобы', text: 'Новых жалоб нет.', actions: [{ label: 'ОК', primary: true }] });
      ui.sheet({
        title: 'Проверка жалоб (' + open.length + ')',
        items: open.map(r => ({
          label: '@' + r.target + ' • ' + r.reason.slice(0, 40),
          sub: r.status === 'approved' ? 'согласовано' : 'новая',
          onClick: () => {
            const lvl = S.myRole();
            if (lvl === 3) { sendAdmin('report_approve', { id: r.id }); ui.toast('Согласовано для администратора'); }
            else if (lvl >= 4) {
              ui.sheet({
                title: 'Жалоба на @' + r.target,
                items: [
                  { label: 'Ban по жалобе', danger: true, onClick: () => { sendAdmin('ban', { target: r.target }); sendAdmin('report_close', { id: r.id }); } },
                  { label: 'Freeze по жалобе', danger: true, onClick: () => { sendAdmin('freeze', { target: r.target }); sendAdmin('report_close', { id: r.id }); } },
                  { label: 'Закрыть без действий', onClick: () => sendAdmin('report_close', { id: r.id }) }
                ]
              });
            } else ui.toast('Согласовать может уровень 3+, применить — 4+', 'warn');
          }
        }))
      });
    });
  }

  /* ---------- TeleCoin / NFT / подарки ---------- */
  function grantCoins(preset) {
    ui.form('Выдать TeleCoin', [
      { key: 'user', label: '@username (пусто = себе)', value: preset || '' },
      { key: 'amount', label: 'Сколько выдать', type: 'number', value: '1000' }
    ], 'Выдать').then(v => {
      if (!v || !v.amount) return;
      const n = Math.floor(Number(v.amount));
      if (!(n > 0)) return ui.toast('Неверная сумма', 'err');
      sendAdmin('grant_coins', { target: (v.user || '').trim().replace(/^@/, '').toLowerCase(), amount: n });
      log('Выдано ' + n + ' TC → @' + (v.user || 'себе'));
    });
  }

  function grantNft(preset) {
    ui.form('Выдать NFT', [
      { key: 'user', label: '@username (пусто = себе)', value: preset || '' }
    ], 'Далее').then(v => {
      if (!v) return;
      const user = (v.user || '').trim().replace(/^@/, '').toLowerCase();
      ui.sheet({
        title: 'Выберите NFT',
        items: TM.config.NFT_CATALOG.map(name => ({
          label: nftEmoji(name) + ' ' + name,
          onClick: () => { sendAdmin('grant_nft', { target: user, item: name }); log('NFT ' + name + ' → @' + (user || 'себе')); }
        }))
      });
    });
  }
  function nftEmoji(name) {
    const map = { Crystal: '💎', Moon: '🌙', Star: '⭐', Butterfly: '🦋', Crown: '👑', Rocket: '🚀' };
    return map[name] || '✦';
  }

  function giftBlade(preset) {
    ui.form('Клинок подарков', [
      { key: 'user', label: '@username', value: preset || '' }
    ], 'Далее').then(v => {
      if (!v || !v.user) return;
      const u = v.user.trim().replace(/^@/, '').toLowerCase();
      ui.sheet({
        title: 'Удалить подарки @' + u,
        items: [
          { label: 'Удалить ВСЕ подарки', danger: true, onClick: () => sendAdmin('gift_blade', { target: u, all: true }) },
          ...TM.config.GIFTS.map(g => ({ label: 'Удалить «' + g.name + '»', onClick: () => sendAdmin('gift_blade', { target: u, gift: g.name }) }))
        ]
      });
    });
  }

  /* ---------- рассылка / сервис ---------- */
  function broadcast() {
    ui.form('Системная рассылка', [{ key: 'text', label: 'Текст сообщения', multiline: true }], 'Отправить').then(v => {
      if (!v || !v.text.trim()) return;
      sendAdmin('broadcast', { text: v.text.trim() });
      log('Рассылка: ' + v.text.trim().slice(0, 40));
    });
  }

  function sessions() {
    ui.sheet({
      title: 'Служебные сессии',
      items: [
        { icon: 'key', label: 'Создать служебный код доступа', sub: 'для входа по коду владельца', onClick: supportGenerate },
        { icon: 'refresh', label: 'Ввести служебный код', onClick: supportEnter },
        { icon: 'trash', label: 'Очистить сохранённый admin-ключ на устройстве', danger: true, onClick: () => { delete S.db.adminKey; S.saveNow(); ui.toast('Ключ удалён'); } }
      ]
    });
  }
  function supportFlow() { sessions(); }
  function supportGenerate() {
    if (!TM.net.isOn()) return ui.toast('Нужно подключение к серверу', 'err');
    sendAdmin('support_code');
    TM.net.on('admin_ok', function once(m) {
      if (m.action === 'support_code') {
        ui.modal({ title: 'Служебный код', text: 'Одноразовый код (10 минут): ' + m.code + '\n\nВведите его в разделе «Служебный вход» на другом аккаунте — он получит уровень 4.', actions: [{ label: 'Понятно', primary: true }] });
      }
    });
  }
  function supportEnter() {
    ui.form('Служебный вход', [{ key: 'code', label: 'Одноразовый код владельца' }], 'Войти').then(v => {
      if (!v || !v.code) return;
      sendAdmin('support_code_enter', { code: v.code.trim() });
      TM.net.on('admin_ok', function once(m) {
        if (m.action === 'support_code_enter') { S.s.account.role = Math.max(S.s.account.role || 1, 4); S.saveAccount(); ui.toast('Служебный доступ открыт (уровень 4)'); openPanel(); }
      });
    });
  }

  function securityCheck() {
    snapshot(sn => {
      const susp = sn.accounts.filter(a => a.banned && a.role > 0);
      const muted = sn.accounts.filter(a => a.muted).length;
      ui.modal({
        title: 'Безопасность',
        body: '<div class="ad-stat">' + line('Подозрительных ролей после бана', susp.length) + line('В муте', muted) + line('Жалоб в очереди', (sn.reports || []).filter(r => r.status !== 'closed').length) + line('Очередь сообщений', sn.counts.queued) + '</div><div class="dim">Уникальность username контролируется сервером. TeleCoin — единая валюта.</div>',
        actions: [{ label: 'Закрыть', primary: true }]
      });
    });
  }

  function maintenance() {
    ui.sheet({
      title: '⚙ Сервис',
      items: [
        { label: 'Обновить экран', onClick: () => { _snap = null; ui.toast('Экран обновлён'); TM.chats.render(); } },
        { label: 'Очистить очередь сообщений', onClick: () => sendAdmin('clear_queue') },
        { label: 'Проверить WebSocket', onClick: () => ui.modal({ title: 'WebSocket', text: TM.net.isOn() ? 'Соединение активно: ' + TM.net.serverUrl() : 'Соединение отсутствует. Проверьте сервер.', actions: [{ label: 'ОК', primary: true }] }) },
        { label: 'Проверить сервер (/health)', onClick: checkHealth },
        { label: 'Сбросить локальные счётчики', onClick: () => { S.store().analytics = { logins: 0, messagesSent: 0, mediaSent: 0 }; S.save(); ui.toast('Счётчики сброшены'); } }
      ]
    });
  }
  async function checkHealth() {
    try {
      const r = await fetch(TM.net.httpBase() + '/health');
      const j = await r.json();
      ui.modal({ title: '/health', text: 'Версия: ' + j.version + '\nОнлайн: ' + j.online + '\nАккаунтов: ' + j.accounts + '\nАптайм: ' + U.duration(j.uptimeSec), actions: [{ label: 'ОК', primary: true }] });
    } catch (e) { ui.toast('Сервер не ответил', 'err'); }
  }

  /* ---------- уровень 3 ---------- */
  function chatStats() {
    const chats = S.allChats();
    const msg = chats.length ? chats.map(c => '• ' + c.name + ': ' + c.messages.length + ' сообщ.').join('\n') : 'Чатов нет.';
    ui.modal({ title: 'Статистика чатов', text: msg + '\n\nОтправлено вами: ' + (S.store().analytics.messagesSent || 0) + ' • медиа: ' + (S.store().analytics.mediaSent || 0), actions: [{ label: 'ОК', primary: true }] });
  }
  function searchMessages() {
    ui.form('Поиск сообщений', [{ key: 'q', label: 'Текст для поиска' }], 'Найти').then(v => {
      if (!v || !v.q) return;
      const q = v.q.toLowerCase();
      const found = [];
      S.allChats().forEach(c => c.messages.forEach(m => {
        if (m.text && m.text.toLowerCase().includes(q)) found.push(c.name + ': ' + m.text.slice(0, 60));
      }));
      ui.modal({ title: 'Результаты (' + found.length + ')', text: found.slice(0, 30).join('\n') || 'Ничего не найдено.', actions: [{ label: 'ОК', primary: true }] });
    });
  }
  function onlineList() {
    snapshot(sn => {
      const on = sn.onlineList;
      ui.modal({
        title: 'Сейчас в сети: ' + sn.counts.online,
        body: on.length ? on.map(o => '<div class="ad-line"><span>' + U.esc(o.name) + ' @' + o.user + '</span><b>' + U.duration(o.seconds) + '</b></div>').join('') : '<div class="dim">Никого нет в сети.</div>',
        actions: [{ label: 'Закрыть', primary: true }]
      });
    });
  }
  function actionHistory() {
    const logEntries = S.store().adminLog || [];
    ui.modal({ title: 'История действий', text: logEntries.length ? logEntries.slice(0, 40).join('\n') : 'Записей нет.', actions: [{ label: 'ОК', primary: true }] });
  }
  function log(text) {
    const st = S.store();
    st.adminLog = st.adminLog || [];
    st.adminLog.unshift(U.timeHM(Date.now()) + ' • ' + text);
    st.adminLog = st.adminLog.slice(0, 100);
    S.save();
  }
  function notifyUser() {
    ui.form('Уведомление пользователей', [
      { key: 'user', label: '@username' },
      { key: 'text', label: 'Текст уведомления', multiline: true }
    ], 'Отправить').then(v => {
      if (!v || !v.user) return;
      sendAdmin('warn', { target: v.user.trim().replace(/^@/, '').toLowerCase(), reason: v.text });
      log('Уведомление @' + v.user.trim());
    });
  }
  function tempBan() {
    ui.form('Временный бан', [
      { key: 'user', label: '@username' },
      { key: 'days', label: 'На сколько дней', type: 'number', value: '3' }
    ], 'Забанить').then(v => {
      if (!v || !v.user) return;
      sendAdmin('ban', { target: v.user.trim().replace(/^@/, '').toLowerCase() });
      log('Временный бан @' + v.user.trim() + ' на ' + (v.days || '?') + ' дн. (снять вручную)');
      ui.toast('Пользователь заблокирован. Не забудьте снять бан по истечении срока.', 'warn');
    });
  }
  function exportReport() {
    snapshot(sn => {
      const data = { exported: new Date().toISOString(), counts: sn.counts, reports: sn.reports, null: undefined };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'telemax_report.json';
      a.click();
      log('Экспорт отчёта');
    });
  }
  function targetedCheck() {
    snapshot(sn => {
      ui.form('Целевая проверка', [{ key: 'user', label: '@username' }], 'Проверить').then(v => {
        if (!v || !v.user) return;
        const a = sn.accounts.find(x => x.user === v.user.trim().replace(/^@/, '').toLowerCase());
        if (!a) return ui.toast('Пользователь не найден', 'err');
        ui.modal({
          title: 'Проверка @' + a.user,
          body: '<div class="ad-stat">' + line('Роль', TM.config.ROLES[a.role]) + line('Бан', a.banned ? 'да' : 'нет') + line('Заморозка', a.frozen ? 'да' : 'нет') + line('Верификация', a.verified ? 'да' : 'нет') + line('TeleCoin', a.coins) + line('Подарков', a.gifts) + line('NFT', a.nft) + line('Онлайн', a.online ? 'да (' + U.duration((Date.now() - a.since) / 1000) + ')' : 'нет') + '</div>',
          actions: [{ label: 'ОК', primary: true }]
        });
      });
    });
  }
  function createAccount() {
    ui.form('Создать аккаунт • Moderator', [
      { key: 'name', label: 'Имя' },
      { key: 'user', label: '@username (необязательно)' },
      { key: 'phone', label: 'Телефон (необязательно)' },
      { key: 'pass', label: 'Пароль (пусто = автоматически)' }
    ], 'Создать').then(v => {
      if (!v || !v.name) return ui.toast('Имя обязательно', 'err');
      sendAdmin('create_account', { user: (v.user || '').trim().replace(/^@/, '').toLowerCase() || ('user_' + U.uid().slice(0, 8)), name: v.name, phone: v.phone, pass: v.pass || undefined });
      log('Создан аккаунт ' + (v.user || ''));
      TM.net.on('admin_ok', function once(m) {
        if (m.action === 'create_account' && m.login) {
          ui.modal({ title: 'Аккаунт создан', text: 'Логин: @' + m.login.user + '\nПароль: ' + m.login.pass + '\n\nПередайте данные пользователю.', actions: [{ label: 'ОК', primary: true }] });
        }
      });
    });
  }
  function deviceControl() {
    snapshot(sn => {
      ui.modal({
        title: 'Контроль устройств',
        body: '<div class="dim">Устройства видны в деталях аккаунта. Сейчас в сети: ' + sn.counts.online + '</div>' +
          sn.onlineList.map(o => '<div class="ad-line"><span>@' + o.user + '</span><b>' + U.esc((sn.accounts.find(x => x.user === o.user) || {}).device || '—') + '</b></div>').join(''),
        actions: [{ label: 'Закрыть', primary: true }]
      });
    });
  }
  function autoModeration() {
    const st = S.store();
    st.settings.autoMod = !st.settings.autoMod;
    S.save();
    ui.toast('Автомодерация: ' + (st.settings.autoMod ? 'включена' : 'выключена'));
  }
  function deletedArchive() {
    const st = S.store();
    const archive = st.deletedArchive || [];
    ui.modal({ title: 'Архив удалённого', text: archive.length ? archive.slice(0, 30).join('\n') : 'Пусто. Удалённые вами сообщения сохраняются здесь.', actions: [{ label: 'ОК', primary: true }] });
  }

  /* ---------- сеть ---------- */
  function bindNet() {
    TM.net.on('admin_check_ok', onCheck);
    TM.net.on('admin_snapshot', onSnapshot);
    TM.net.on('admin_ok', m => {
      if (m.action === 'set_role') ui.toast('Роль: ' + TM.config.ROLES[m.role]);
      else if (['ban', 'unban', 'freeze', 'unfreeze'].includes(m.action)) ui.toast('Готово: ' + m.action + ' @' + m.target);
      else if (m.action === 'verify') ui.toast('Верификация выдана ✓');
      else if (m.action === 'broadcast') ui.toast('Рассылка отправлена');
      else if (m.action === 'grant_coins') ui.toast('TeleCoin выданы');
      else if (m.action === 'gift_blade') ui.toast('Подарки удалены');
      else if (m.action === 'reset_pin') ui.toast('2FA PIN сброшен ✓');
      else if (m.action === 'logout_all') ui.toast('Сессии @' + m.target + ' завершены');
      else if (m.action === 'grant_premium') ui.toast(m.premium ? 'TelePremium выдан 🎁' : 'TelePremium отключён');
      else if (m.action === 'set_name') ui.toast('Имя изменено: ' + m.name);
      else if (['warn', 'mute', 'unmute', 'kick'].includes(m.action)) ui.toast('Мера применена: ' + m.action);
      _snap = null; // данные изменены — обновим при следующем открытии
    });
  }

  return { entry, bindNet, log };
})();
