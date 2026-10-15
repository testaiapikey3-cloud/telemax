/* ============================================================
 * TeleMAX Web — chats.js
 * Экран «Чаты»: большой заголовок, поиск, фильтры, создание чатов,
 * группы и каналы, превью сообщений, счётчики непрочитанных.
 * ============================================================ */
window.TM = window.TM || {};

TM.chats = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  let filter = 'all';      // all | channels | groups | private
  let query = '';
  let host = null;

  /* ---------- превью последнего сообщения ---------- */
  function preview(chat) {
    const m = chat.messages[chat.messages.length - 1];
    if (!m) return 'Новый чат';
    const my = m.mine ? 'Вы: ' : '';
    const t = m.type;
    if (t === 'image') return my + '🖼 Фото';
    if (t === 'video') return my + '🎬 Видео';
    if (t === 'audio') return my + '🎤 Голосовое';
    if (t === 'file') return my + '📄 ' + (m.fileName || 'Файл');
    if (t === 'gift') return my + '🎁 ' + (m.text || 'Подарок');
    if (t === 'poll') return my + '📊 ' + ((m.poll && m.poll.question) || 'Опрос');
    return my + (m.text || '');
  }

  /* ---------- отрисовка ---------- */
  function render(target) {
    if (target) host = target;
    if (!host) return;
    host.innerHTML = '';

    const head = U.el('div', 'chats-head');
    head.innerHTML =
      '<div class="ch-row">' +
        '<div class="ch-title">TeleMAX</div>' +
        '<div class="ch-actions">' +
          '<button class="icon-btn" id="ch-new" title="Новый чат">' + ui.icon('plus') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ch-search">' + ui.icon('search') + '<input id="ch-q" placeholder="Поиск" value="' + U.esc(query) + '"></div>';
    host.appendChild(head);

    const chip = U.el('div', 'ch-chip');
    const acc = S.s.account || {};
    chip.innerHTML = ui.avatarHTML(acc.name || acc.user || '?', acc.avatar, TM.net.isOn(), 'sm') +
      '<span>' + U.esc(acc.name || acc.user || '') + '</span>' +
      (S.myRole() >= 4 ? '<b class="role-mini">' + TM.config.ROLES[S.myRole()] + '</b>' : '');
    chip.onclick = () => TM.profile.openOwn();
    head.appendChild(chip);

    const tabs = U.el('div', 'ch-tabs');
    [['all', 'Все'], ['channels', 'Каналы'], ['groups', 'Группы'], ['private', 'Личные']].forEach(([id, label]) => {
      const t = U.el('button', 'chip' + (filter === id ? ' active' : ''), label);
      t.onclick = () => { filter = id; render(); };
      tabs.appendChild(t);
    });
    host.appendChild(tabs);

    const list = U.el('div', 'ch-list');
    let items = S.allChats();
    if (filter === 'channels') items = items.filter(c => c.kind === 'channel');
    if (filter === 'groups') items = items.filter(c => c.kind === 'group');
    if (filter === 'private') items = items.filter(c => c.kind === 'private');
    if (query) {
      const q = query.toLowerCase();
      items = items.filter(c => (c.name || '').toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q) || (c.text || '').toLowerCase().includes(q));
    }
    if (!items.length) {
      list.innerHTML = '<div class="empty"><div class="empty-ic">' + ui.icon('chats') + '</div><div>Чатов пока нет</div><div class="dim">Нажмите + и найдите пользователя по @username</div></div>';
    }
    items.forEach(c => list.appendChild(chatRow(c)));
    host.appendChild(list);

    head.querySelector('#ch-q').addEventListener('input', U.debounce(e => { query = e.target.value; render(); }, 200));
    head.querySelector('#ch-new').onclick = newChatSheet;
  }

  function chatRow(c) {
    const row = U.el('div', 'chat-row' + (S.s.activeChat === c.id ? ' active' : ''));
    const online = c.kind === 'private' && S.isOnline(c.username);
    const unread = c.unread || 0;
    row.innerHTML =
      ui.avatarHTML(c.name, c.avatar, online, 'md') +
      '<div class="cr-main">' +
        '<div class="cr-top"><span class="cr-name">' + U.esc(c.name || c.username) + '</span>' +
          (c.kind === 'channel' ? '<span class="cr-kind">канал</span>' : c.kind === 'group' ? '<span class="cr-kind">группа</span>' : '') +
          ui.verifiedBadge(c.username) +
          '<span class="cr-time">' + U.timeHM(c.lastTime) + '</span>' +
        '</div>' +
        '<div class="cr-bottom">' +
          '<span class="cr-preview">' + U.esc(preview(c)) + '</span>' +
          (c.muted ? '<span class="cr-muted">' + ui.icon('bell') + '</span>' : '') +
          (unread ? '<span class="badge">' + (unread > 99 ? '99+' : unread) + '</span>' : '') +
        '</div>' +
      '</div>';
    row.onclick = () => TM.chat.open(c.id);
    let pressTimer = null;
    row.addEventListener('pointerdown', () => { pressTimer = setTimeout(() => chatOptions(c), 550); });
    row.addEventListener('pointerup', () => clearTimeout(pressTimer));
    row.addEventListener('pointerleave', () => clearTimeout(pressTimer));
    return row;
  }

  function chatOptions(c) {
    ui.sheet({
      title: c.name,
      items: [
        { icon: 'bell', label: c.muted ? 'Включить уведомления' : 'Отключить уведомления', onClick: () => { c.muted = !c.muted; S.save(); render(); } },
        { icon: 'palette', label: 'Фон чата', onClick: () => TM.chat.chooseWallpaper(c.id) },
        { icon: 'eye', label: unreadText(c), onClick: () => { c.unread = 0; S.save(); render(); } },
        { icon: 'trash', label: 'Очистить историю', onClick: async () => { if (await ui.confirm('Очистить историю?', 'Все сообщения будут удалены на этом устройстве.')) { c.messages = []; S.save(); render(); TM.chat.refreshIfOpen(c.id); } } },
        { icon: 'close', label: 'Удалить чат', danger: true, onClick: async () => { if (await ui.confirm('Удалить чат?', 'Чат исчезнет из списка.')) { S.removeChat(c.id); render(); } } }
      ]
    });
  }
  function unreadText(c) { return c.unread ? 'Отметить прочитанным (' + c.unread + ')' : 'Отметить прочитанным'; }

  /* ---------- новый чат ---------- */
  function newChatSheet() {
    ui.sheet({
      title: 'Новое',
      items: [
        { icon: 'user', label: 'Личный чат', sub: 'по @username', onClick: newPrivateChat },
        { icon: 'contacts', label: 'Создать группу', onClick: () => createGroupFlow('group') },
        { icon: 'chats', label: 'Создать канал', onClick: () => createGroupFlow('channel') },
        { icon: 'cloud', label: 'Облачное хранилище', onClick: () => TM.cloud.open() },
        { icon: 'search', label: 'Найти контакты', sub: 'все пользователи', onClick: () => TM.contacts.showAllUsers() }
      ]
    });
  }

  async function newPrivateChat() {
    const v = await ui.form('Новый чат', [
      { key: 'user', label: '@username', placeholder: 'например: rustam_max' }
    ], 'Открыть');
    if (!v || !v.user) return;
    const user = v.user.trim().replace(/^@/, '').toLowerCase();
    if (!user) return;
    if (user === S.s.user) return ui.toast('Это ваш собственный аккаунт', 'warn');
    if (TM.config.BOT_USERNAMES[user]) return TM.bots.openBot(user);
    openPrivate(user);
  }

  function openPrivate(user, name) {
    const id = S.chatIdForUser(user);
    const known = S.profileOf(user);
    S.createChat({ id, kind: 'private', username: user, name: name || (known && known.name) || ('@' + user), avatar: (known && known.avatar) || '' });
    TM.chat.open(id);
  }

  async function createGroupFlow(kind) {
    const v = await ui.form(kind === 'group' ? 'Новая группа' : 'Новый канал', [
      { key: 'name', label: 'Название', placeholder: kind === 'group' ? 'Моя группа' : 'Мой канал' },
      { key: 'members', label: 'Участники (@username через запятую)', placeholder: 'rustam_max, anna_fed', multiline: true }
    ], 'Создать');
    if (!v || !v.name) return;
    const members = String(v.members || '').split(',').map(x => x.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
    if (TM.net.isOn()) {
      TM.net.send({ type: 'create_group', name: v.name.trim(), kind, members });
    } else {
      // локальная группа
      const gid = 'g' + U.uid().slice(0, 6);
      const g = { id: gid, name: v.name.trim(), type: kind, owner: S.s.user, members: [S.s.user].concat(members), createdAt: Date.now() };
      addGroup(g);
      ui.toast('Группа создана локально (офлайн).');
      TM.chat.open(S.chatIdForGroup(gid));
    }
  }

  function addGroup(g) {
    S.s.groups[g.id] = g;
    const id = S.chatIdForGroup(g.id);
    S.createChat({ id, kind: g.type === 'channel' ? 'channel' : 'group', username: '', name: g.name, members: g.members, owner: g.owner });
    const c = S.getChat(id);
    if (c) { c.members = g.members; c.owner = g.owner; S.save(); }
    render();
  }

  /* ---------- обработчики сервера ---------- */
  function bindNet() {
    TM.net.on('registered', () => { if (S.s.user) render(); });
    TM.net.on('presence', m => { if (S.s.user && TM.app.tab === 'chats') render(); });
    TM.net.on('contact_update', m => { if (S.s.user) render(); });
    TM.net.on('contacts_snapshot', m => {
      if (!S.s.user) return;
      S.s.contacts = m.items || {};
      // обновляем названия/аватары личных чатов
      Object.values(S.store().chats).forEach(c => {
        if (c.kind === 'private' && S.s.contacts[c.username]) {
          const p = S.s.contacts[c.username];
          if (p.name && (c.name === '@' + c.username || !c.name)) c.name = p.name;
          c.avatar = p.avatar || c.avatar;
        }
      });
      S.save();
      render();
    });
    TM.net.on('group_created', m => { addGroup(m.group); });
    TM.net.on('presence_snapshot', m => { S.s.presence = m.items || {}; if (TM.app.tab === 'chats') render(); });
    TM.net.on('group_update', m => {
      S.s.groups[m.group.id] = m.group;
      const c = S.getChat(S.chatIdForGroup(m.group.id));
      if (c) { c.members = m.group.members; S.save(); }
    });
  }

  return { render, preview, bindNet, openPrivate, addGroup };
})();
