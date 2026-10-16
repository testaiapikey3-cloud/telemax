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
  let openNextOwn = false; // открыть чат сразу после создания своей группы

  /* ---------- превью последнего сообщения ---------- */
  function preview(chat) {
    const m = chat.messages[chat.messages.length - 1];
    if (!m) return 'Новый чат';
    const my = m.mine ? 'Вы: ' : '';
    const t = m.type;
    if (t === 'image') return my + '🖼 Фото';
    if (t === 'video') return my + (m.circle ? '🎥 Кружок' : '🎬 Видео');
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

  function isBotChat(c) {
    if (!c || c.kind !== 'private' || !c.username) return false;
    if (TM.config.BOT_USERNAMES[c.username]) return true;
    return (S.store().bots || []).some(b => b.username === c.username);
  }

  function chatRow(c) {
    const row = U.el('div', 'chat-row' + (S.s.activeChat === c.id ? ' active' : ''));
    const online = c.kind === 'private' && S.isOnline(c.username);
    const unread = c.unread || 0;
    row.innerHTML =
      ui.avatarHTML(c.name, c.avatar, online, 'md') +
      '<div class="cr-main">' +
        '<div class="cr-top"><span class="cr-name">' + U.esc(c.name || c.username) + '</span>' +
          (c.kind === 'channel' ? '<span class="cr-kind">канал</span>' : c.kind === 'group' ? '<span class="cr-kind">группа</span>' : isBotChat(c) ? '<span class="cr-kind">бот</span>' : '') +
          ui.verifiedBadge(c) +
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
      { key: 'name', label: 'Название', placeholder: kind === 'group' ? 'Моя группа' : 'Мой канал', maxlength: 64 }
    ], 'Далее');
    if (!v || !v.name || !String(v.name).trim()) return;
    membersPicker(kind, String(v.name).trim());
  }

  /* ---------- выбор участников: нажимаем на друзей, не печатаем @username ---------- */
  function friendsForPicker() {
    const map = Object.create(null);
    Object.values(S.s.contacts || {}).forEach(u => {
      if (!u || !u.user || u.user === S.s.user) return;
      if (TM.config.BOT_USERNAMES[u.user]) return;
      map[u.user] = { user: u.user, name: u.name || ('@' + u.user), avatar: u.avatar || '' };
    });
    Object.values(S.store().chats || {}).forEach(c => {
      if (!c || c.kind !== 'private' || !c.username || c.username === S.s.user) return;
      if (TM.config.BOT_USERNAMES[c.username]) return;
      const cur = map[c.username] || {};
      map[c.username] = {
        user: c.username,
        name: (c.name && c.name !== '@' + c.username ? c.name : (cur.name || c.name || ('@' + c.username))),
        avatar: c.avatar || cur.avatar || ''
      };
    });
    const list = Object.values(map);
    list.sort((a, b) => String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase()));
    return list;
  }

  function membersPicker(kind, name) {
    const checked = Object.create(null);
    const extra = [];
    let query = '';
    ui.pushScreen((node, handle) => {
      node.classList.add('pick-screen');
      node.innerHTML =
        '<div class="scr-head"><button class="icon-btn" id="pk-back">' + ui.icon('back') + '</button>' +
        '<div class="scr-title">' + (kind === 'group' ? 'Кто войдёт в группу?' : 'Кто подпишется на канал?') + '</div></div>' +
        '<div class="pick-sub">«' + U.esc(name) + '»</div>' +
        '<div class="ch-search">' + ui.icon('search') + '<input id="pk-q" placeholder="Поиск друга по имени или @username"></div>' +
        '<div class="pick-list" id="pk-list"></div>' +
        '<div class="pick-foot"><button class="btn btn-primary btn-big" id="pk-go">Создать</button></div>';
      const list = node.querySelector('#pk-list');
      const btn = node.querySelector('#pk-go');
      const updateBtn = () => {
        const n = Object.keys(checked).filter(k => checked[k]).length;
        btn.textContent = (kind === 'group' ? 'Создать группу' : 'Создать канал') + (n ? ' (' + n + ')' : '');
      };
      const draw = () => {
        list.innerHTML = '';
        const manual = U.el('div', 'pick-item pick-manual');
        manual.innerHTML = '<span class="pick-ic">' + ui.icon('user') + '</span><div class="ct-main"><b>Добавить по @username</b><span>если человека нет в списке</span></div>';
        manual.onclick = async () => {
          const v = await ui.form('Добавить по @username', [{ key: 'u', label: '@username', placeholder: 'например: rustam_max' }], 'Добавить');
          if (!v || !v.u) return;
          const un = String(v.u).trim().replace(/^@/, '').toLowerCase();
          if (!un || un === S.s.user) return;
          checked[un] = true;
          if (!extra.some(x => x.user === un)) extra.push({ user: un, name: '@' + un, avatar: '' });
          draw();
        };
        list.appendChild(manual);
        const base = friendsForPicker();
        const all = base.concat(extra.filter(x => !base.some(f => f.user === x.user)));
        const q = query.trim().toLowerCase();
        const shown = all.filter(u => !q || (u.name || '').toLowerCase().indexOf(q) >= 0 || u.user.indexOf(q) >= 0);
        if (!shown.length) {
          const e = U.el('div', 'empty small');
          e.innerHTML = '<div>Друзья не найдены</div><div class="dim">Список друзей загружается, когда есть связь с сервером</div>';
          list.appendChild(e);
        }
        shown.forEach(u => {
          const on = !!checked[u.user];
          const row = U.el('div', 'pick-item' + (on ? ' on' : ''));
          row.innerHTML =
            ui.avatarHTML(u.name, u.avatar, S.isOnline(u.user), 'md') +
            '<div class="ct-main"><b>' + U.esc(u.name) + ui.verifiedBadge(u.user) + '</b><span>@' + U.esc(u.user) + '</span></div>' +
            '<span class="pick-check">' + (on ? '✓' : '') + '</span>';
          row.onclick = () => {
            checked[u.user] = !checked[u.user];
            row.classList.toggle('on');
            row.querySelector('.pick-check').textContent = checked[u.user] ? '✓' : '';
            updateBtn();
          };
          list.appendChild(row);
        });
        updateBtn();
      };
      node.querySelector('#pk-back').onclick = () => handle.close();
      node.querySelector('#pk-q').addEventListener('input', U.debounce(() => { query = node.querySelector('#pk-q').value; draw(); }, 150));
      btn.onclick = () => {
        const members = Object.keys(checked).filter(k => checked[k] && k !== S.s.user);
        handle.close();
        finishGroup(kind, name, members);
      };
      draw();
    });
  }

  function finishGroup(kind, name, members) {
    if (TM.net.isOn()) {
      openNextOwn = true;
      TM.net.send({ type: 'create_group', name: name, kind: kind, members: members });
      ui.toast(kind === 'group' ? 'Создаём группу…' : 'Создаём канал…');
    } else {
      // локальная группа
      const gid = 'g' + U.uid().slice(0, 6);
      const g = { id: gid, name: name, type: kind, owner: S.s.user, members: [S.s.user].concat(members), createdAt: Date.now() };
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
    if (c) {
      c.members = g.members; c.owner = g.owner;
      c.verified = !!g.verified; c.official = !!g.official;
      // приветствие официального канала — один раз на устройство
      if (g.official && !c.messages.length) S.addMessage(id, {
        id: U.uid(), type: 'text', mine: false, from: 'mislit_tech', time: Date.now(), status: 'read',
        text: 'Добро пожаловать в официальный канал TeleMAX Новости 💛\n\nЗдесь выходят новости и обновления мессенджера. Канал ведёт @mislit_tech — подписка у всех пользователей включается автоматически.'
      });
      S.save();
    }
    render();
    if (openNextOwn && g.owner === S.s.user) {
      openNextOwn = false;
      TM.chat.open(id);
    }
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
    TM.net.on('groups_snapshot', m => {
      if (!S.s.user) return;
      (m.items || []).forEach(g => { try { addGroup(g); } catch (_) {} });
    });
    TM.net.on('presence_snapshot', m => { S.s.presence = m.items || {}; if (TM.app.tab === 'chats') render(); });
    TM.net.on('group_update', m => {
      S.s.groups[m.group.id] = m.group;
      const c = S.getChat(S.chatIdForGroup(m.group.id));
      if (c) {
        c.members = m.group.members; c.owner = m.group.owner;
        if (m.group.name) c.name = m.group.name;
        c.verified = !!m.group.verified; c.official = !!m.group.official;
        S.save();
      }
      render();
    });
  }

  return { render, preview, bindNet, openPrivate, addGroup };
})();
