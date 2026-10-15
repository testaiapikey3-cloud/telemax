/* ============================================================
 * TeleMAX Web — contacts.js
 * Экран «Контакты»: поиск, приглашение, список пользователей,
 * онлайн-статусы, быстрый переход в чат/профиль.
 * ============================================================ */
window.TM = window.TM || {};

TM.contacts = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  let host = null;
  let query = '';

  function render(target) {
    if (target) host = target;
    if (!host) return;
    host.innerHTML = '';

    const head = U.el('div', 'scr-head');
    head.innerHTML = '<div class="scr-title">Контакты</div>';
    host.appendChild(head);

    const search = U.el('div', 'ch-search');
    search.innerHTML = ui.icon('search') + '<input id="ct-q" placeholder="Поиск" value="' + U.esc(query) + '">';
    host.appendChild(search);

    const invite = U.el('div', 'ct-row');
    invite.innerHTML = '<span class="ct-ic invite">' + ui.icon('forward') + '</span><div class="ct-main"><b>Пригласить друзей</b><span>Скопировать ссылку-приглашение</span></div>';
    invite.onclick = () => {
      const link = 'https://telemax.app/invite/' + S.s.user;
      navigator.clipboard && navigator.clipboard.writeText(link);
      ui.modal({ title: 'Приглашение TeleMAX', text: 'Ссылка скопирована:\n' + link, actions: [{ label: 'Понятно', primary: true }] });
    };
    host.appendChild(invite);

    const sync = U.el('div', 'ct-row');
    sync.innerHTML = '<span class="ct-ic sync">' + ui.icon('refresh') + '</span><div class="ct-main"><b>Обновить список</b><span>' + (TM.net.isOn() ? 'Запросить у сервера' : 'Доступно при подключении') + '</span></div>';
    sync.onclick = () => { if (TM.net.isOn()) TM.net.send({ type: 'contacts_get' }); else ui.toast('Нет соединения с сервером', 'warn'); };
    host.appendChild(sync);

    const label = U.el('div', 'scr-sub', 'Мои контакты');
    host.appendChild(label);

    const list = U.el('div', 'ct-list');
    let users = Object.values(S.s.contacts || {});
    users.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    if (query) {
      const q = query.toLowerCase();
      users = users.filter(u => (u.name || '').toLowerCase().includes(q) || (u.user || '').includes(q));
    }
    users = users.filter(u => u.user !== S.s.user);
    if (!users.length) {
      list.innerHTML = '<div class="empty small"><div>' + (TM.net.isOn() ? 'Пользователей пока нет' : 'Офлайн-режим: список пуст') + '</div></div>';
    }
    users.forEach(u => {
      const row = U.el('div', 'ct-user');
      row.innerHTML =
        ui.avatarHTML(u.name || u.user, u.avatar, u.online || S.isOnline(u.user), 'md') +
        '<div class="ct-main"><b>' + U.esc(u.name || ('@' + u.user)) + ui.verifiedBadge(u.user) + '</b><span>@' + U.esc(u.user) + (u.premium ? ' • Premium' : '') + '</span></div>' +
        (u.online || S.isOnline(u.user) ? '<i class="on-label">в сети</i>' : '');
      row.onclick = () => ui.sheet({
        title: u.name || ('@' + u.user),
        items: [
          { icon: 'chats', label: 'Написать сообщение', onClick: () => TM.chats.openPrivate(u.user, u.name) },
          { icon: 'user', label: 'Открыть профиль', onClick: () => TM.profile.open(u.user) },
          { icon: 'calls', label: 'Позвонить', onClick: () => TM.calls.start({ id: S.chatIdForUser(u.user), username: u.user, name: u.name, kind: 'private' }, false) },
          { icon: 'wallet', label: 'Отправить TeleCoin', onClick: () => TM.wallet.sendCoins(u.user) }
        ]
      });
      list.appendChild(row);
    });
    host.appendChild(list);

    search.querySelector('#ct-q').addEventListener('input', U.debounce(e => { query = e.target.value; render(); }, 200));
  }

  function showAllUsers() {
    TM.app.selectTab('contacts');
    query = '';
    render();
  }

  function bindNet() {
    TM.net.on('contacts_snapshot', () => { if (TM.app.tab === 'contacts') render(); });
    TM.net.on('presence', () => { if (TM.app.tab === 'contacts') render(); });
    TM.net.on('contact_update', () => { if (TM.app.tab === 'contacts') render(); });
    TM.net.on('contact_removed', () => { if (TM.app.tab === 'contacts') render(); });
  }

  return { render, bindNet, showAllUsers };
})();
