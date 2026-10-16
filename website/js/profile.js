/* ============================================================
 * TeleMAX Web — profile.js
 * Профиль пользователя: аватар, статус, действия (звонок, подарок,
 * NFT), статистика (медиа/файлы/голосовые/группы), инфо.
 * ============================================================ */
window.TM = window.TM || {};

TM.profile = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  function open(user) {
    const p = S.profileOf(user) || { user, name: '@' + user };
    const isMe = user === S.s.user;
    if (isMe) return openOwn();

    ui.pushScreen((node, handle) => {
      node.classList.add('profile-screen');
      const online = S.isOnline(user);
      const chat = S.getChat(S.chatIdForUser(user));
      const stats = computeStats(chat, user);
      const head = U.el('div', 'pf-head');
      head.innerHTML =
        '<div class="pf-topbar"><button class="icon-btn" id="pf-back">' + ui.icon('back') + '</button></div>' +
        '<div class="pf-avatar">' + ui.avatarHTML(p.name || user, p.avatar, online, 'xl') + '</div>' +
        '<div class="pf-name">' + U.esc(p.name || ('@' + user)) + ui.verifiedBadge(user) + '</div>' +
        '<div class="pf-user">@' + U.esc(user) + ' • ' + (online ? 'в сети' : U.lastSeenText((S.s.presence[user] || {}).lastSeen)) + '</div>' +
        '<div class="pf-actions">' +
          '<button class="pf-act" id="pa-call">' + ui.icon('calls') + '<span>Звонок</span></button>' +
          '<button class="pf-act" id="pa-video">' + ui.icon('video') + '<span>Видео</span></button>' +
          '<button class="pf-act" id="pa-gift">' + ui.icon('gift') + '<span>Подарок</span></button>' +
          '<button class="pf-act" id="pa-nft">' + ui.icon('star') + '<span>NFT</span></button>' +
        '</div>';
      node.appendChild(head);

      const info = U.el('div', 'pf-card');
      const reg = p.registeredAt ? new Date(p.registeredAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана';
      info.innerHTML =
        row('Дата регистрации', reg) +
        row('ID', 'u_' + Math.abs(hash(user)).toString().slice(0, 9)) +
        row('О себе', p.about || 'Не указано') +
        row('Телефон', p.phone || 'Скрыт') +
        row('TeleCoin', (p.coins || 0) + ' TC') +
        (p.premium ? row('Подписка', '✓ TelePremium активен') : '');
      node.appendChild(info);

      const st = U.el('div', 'pf-card pf-stats');
      st.innerHTML =
        '<div class="pfs"><b>' + stats.media + '</b><span>Медиа</span></div>' +
        '<div class="pfs"><b>' + stats.files + '</b><span>Файлы</span></div>' +
        '<div class="pfs"><b>' + stats.voice + '</b><span>Голосовые</span></div>' +
        '<div class="pfs"><b>' + stats.groups + '</b><span>Группы</span></div>';
      node.appendChild(st);

      if ((p.gifts || []).length) {
        const gf = U.el('div', 'pf-card');
        gf.innerHTML = '<div class="pf-card-title">Подарки • ' + p.gifts.length + '</div>' +
          '<div class="pf-gifts">' + p.gifts.slice(0, 8).map(g => '<span class="pf-gift" title="' + U.esc(g.name || '') + '">' + U.esc(g.emoji || '🎁') + '</span>').join('') + '</div>';
        node.appendChild(gf);
      }

      const msgBtn = U.el('button', 'btn btn-primary btn-big', 'Написать сообщение');
      msgBtn.onclick = () => { handle.close(); TM.chats.openPrivate(user, p.name); };
      node.appendChild(msgBtn);

      const coinBtn = U.el('button', 'btn btn-ghost btn-big', 'Отправить TeleCoin');
      coinBtn.onclick = () => TM.wallet.sendCoins(user);
      node.appendChild(coinBtn);

      head.querySelector('#pf-back').onclick = () => handle.close();
      head.querySelector('#pa-call').onclick = () => TM.calls.start({ id: S.chatIdForUser(user), username: user, name: p.name, kind: 'private' }, false);
      head.querySelector('#pa-video').onclick = () => TM.calls.start({ id: S.chatIdForUser(user), username: user, name: p.name, kind: 'private' }, true);
      head.querySelector('#pa-gift').onclick = () => TM.gifts.openCatalog({ id: S.chatIdForUser(user), username: user, name: p.name, kind: 'private' });
      head.querySelector('#pa-nft').onclick = () => TM.gifts.sendNftFlow({ id: S.chatIdForUser(user), username: user, name: p.name, kind: 'private' });
    });
  }

  function row(label, value) {
    return '<div class="pf-row"><span class="pf-label">' + U.esc(label) + '</span><span class="pf-value">' + U.esc(value) + '</span></div>';
  }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  function computeStats(chat, user) {
    let media = 0, files = 0, voice = 0;
    if (chat) chat.messages.forEach(m => {
      if (m.type === 'image' || m.type === 'video') media++;
      else if (m.type === 'file') files++;
      else if (m.type === 'audio') voice++;
    });
    const groups = Object.values(S.s.groups).filter(g => g.members && g.members.includes(user)).length;
    return { media, files, voice, groups };
  }

  /* ---------- группа ---------- */
  function openGroup(chat) {
    ui.pushScreen((node, handle) => {
      node.classList.add('profile-screen');
      const members = chat.members || [];
      const head = U.el('div', 'pf-head');
      head.innerHTML =
        '<div class="pf-topbar"><button class="icon-btn" id="pg-back">' + ui.icon('back') + '</button></div>' +
        '<div class="pf-avatar">' + ui.avatarHTML(chat.name, '', false, 'xl') + '</div>' +
        '<div class="pf-name">' + U.esc(chat.name) + ui.verifiedBadge(chat) + '</div>' +
        '<div class="pf-user">' + (chat.kind === 'channel' ? 'Канал' : 'Группа') + ' • ' + members.length + ' участников</div>';
      node.appendChild(head);
      const list = U.el('div', 'pf-card');
      list.innerHTML = '<div class="pf-card-title">Участники</div>' + members.map(m => {
        const p = S.profileOf(m);
        return '<div class="pf-member" data-u="' + U.esc(m) + '">' + ui.avatarHTML((p && p.name) || m, (p && p.avatar) || '', S.isOnline(m), 'sm') +
          '<span>' + U.esc((p && p.name) || ('@' + m)) + '</span>' + (m === chat.owner ? '<b class="role-mini">владелец</b>' : '') + '</div>';
      }).join('');
      node.appendChild(list);
      U.$$('.pf-member', list).forEach(r => r.onclick = () => open(r.dataset.u));

      // админ может выдавать/снимать галочку каналам и группам
      if (S.myRole() >= 4) {
        const vbtn = U.el('button', 'btn btn-ghost btn-big', chat.verified ? '✓ Снять галочку верификации' : '✓ Верифицировать' + (chat.kind === 'channel' ? ' канал' : ' группу'));
        vbtn.style.marginTop = '12px';
        vbtn.onclick = () => {
          if (chat.official && chat.verified) { ui.toast('Официальную галочку снять нельзя'); return; }
          TM.net.send({ type: 'group_verify', id: String(chat.id || '').replace(/^g_/, ''), verified: !chat.verified });
          ui.toast(chat.verified ? 'Галочка снята' : 'Галочка выдана ✓');
          handle.close();
        };
        node.appendChild(vbtn);
      }
      head.querySelector('#pg-back').onclick = () => handle.close();
    });
  }

  /* ---------- свой профиль ---------- */
  function openOwn() {
    const acc = S.s.account || { user: S.s.user, name: S.s.user };
    ui.pushScreen((node, handle) => {
      node.classList.add('profile-screen');
      const head = U.el('div', 'pf-head');
      const reg = acc.registeredAt ? new Date(acc.registeredAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана';
      head.innerHTML =
        '<div class="pf-topbar"><button class="icon-btn" id="po-back">' + ui.icon('back') + '</button></div>' +
        '<div class="pf-avatar" id="po-avatar">' + ui.avatarHTML(acc.name, acc.avatar, true, 'xl') + '</div>' +
        '<div class="pf-name">' + U.esc(acc.name || '') + ui.verifiedBadge(S.s.user) + '</div>' +
        '<div class="pf-user">@' + U.esc(S.s.user) + '</div>' +
        '<div class="pf-system">' + (S.myRole() > 1 ? 'Роль: ' + TM.config.ROLES[S.myRole()] : '') + (acc.premium ? ' • ✓ TelePremium' : '') + '</div>' +
        '<div class="pf-actions">' +
          '<button class="pf-act" id="po-ava-btn">' + ui.icon('camera') + '<span>Аватар</span></button>' +
          '<button class="pf-act" id="po-edit">' + ui.icon('edit') + '<span>Изменить</span></button>' +
          '<button class="pf-act" id="po-invite">' + ui.icon('forward') + '<span>Ссылка</span></button>' +
          '<button class="pf-act" id="po-coins">' + ui.icon('wallet') + '<span>' + (acc.coins || 0) + ' TC</span></button>' +
        '</div>';
      node.appendChild(head);

      const info = U.el('div', 'pf-card');
      info.innerHTML =
        row('Дата регистрации', reg) + row('О себе', acc.about || 'Не указано') + row('Телефон', acc.phone || 'Не указан');
      node.appendChild(info);

      const st = U.el('div', 'pf-card pf-stats');
      const totalMedia = S.allChats().reduce((n, c) => n + c.messages.filter(m => m.type === 'image' || m.type === 'video').length, 0);
      const totalFiles = S.allChats().reduce((n, c) => n + c.messages.filter(m => m.type === 'file').length, 0);
      const totalVoice = S.allChats().reduce((n, c) => n + c.messages.filter(m => m.type === 'audio').length, 0);
      st.innerHTML =
        '<div class="pfs"><b>' + totalMedia + '</b><span>Медиа</span></div>' +
        '<div class="pfs"><b>' + totalFiles + '</b><span>Файлы</span></div>' +
        '<div class="pfs"><b>' + totalVoice + '</b><span>Голосовые</span></div>' +
        '<div class="pfs"><b>' + Object.keys(S.s.groups).length + '</b><span>Группы</span></div>';
      node.appendChild(st);

      const gifts = (acc.gifts || []);
      if (gifts.length) {
        const gf = U.el('div', 'pf-card');
        gf.innerHTML = '<div class="pf-card-title">Подарки • ' + gifts.length + '</div>' +
          '<div class="pf-gifts">' + gifts.slice(0, 10).map(g => '<span class="pf-gift" title="' + U.esc(g.name || '') + '">' + U.esc(g.emoji || '🎁') + '</span>').join('') + '</div>';
        node.appendChild(gf);
      }

      const out = U.el('button', 'btn btn-ghost btn-big', 'Выйти из аккаунта');
      out.onclick = async () => {
        if (!await ui.confirm('Выйти?', 'Вы сможете войти снова по @username и паролю.')) return;
        TM.net.send({ type: 'logout' });
        S.logout();
        location.reload();
      };
      node.appendChild(out);

      const hh = handle;
      head.querySelector('#po-back').onclick = () => hh.close();
      head.querySelector('#po-ava-btn').onclick = () => pickAvatar();
      head.querySelector('#po-edit').onclick = editOwn;
      head.querySelector('#po-invite').onclick = () => {
        const link = 'https://telemax.app/invite/' + S.s.user;
        navigator.clipboard && navigator.clipboard.writeText(link);
        ui.modal({ title: 'Моя ссылка-приглашение', text: link, actions: [{ label: 'Скопировано', primary: true }] });
      };
      head.querySelector('#po-coins').onclick = () => TM.wallet.open();
    });
  }

  function pickAvatar() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      if (f.size > TM.config.LIMITS.AVATAR_MAX) return ui.toast('Аватар: до 2 МБ', 'err');
      const dataUrl = await U.readFile(f);
      if (S.s.account) S.s.account.avatar = dataUrl;
      S.saveAccount();
      TM.net.send({ type: 'profile_update', avatar: dataUrl });
      ui.toast('Аватар обновлён ✓');
      /* обновляем аватар прямо на экране профиля, не закрывая его */
      const av = document.querySelector('#po-avatar');
      if (av && S.s.account) av.innerHTML = ui.avatarHTML(S.s.account.name || S.s.user, dataUrl, true, 'xl');
      TM.settings.refresh && TM.settings.refresh();
      TM.chats.render();
    };
    inp.click();
  }

  async function editOwn() {
    const acc = S.s.account || {};
    const v = await ui.form('Изменить профиль', [
      { key: 'name', label: 'Имя', value: acc.name || '', maxlength: 64 },
      { key: 'about', label: 'О себе', value: acc.about || '', maxlength: 300, multiline: true },
      { key: 'phone', label: 'Телефон', value: acc.phone || '', maxlength: 32 }
    ], 'Сохранить');
    if (!v) return;
    if (S.s.account) {
      S.s.account.name = v.name.trim() || acc.name;
      S.s.account.about = v.about.trim();
      S.s.account.phone = v.phone.trim();
    }
    S.saveAccount();
    TM.net.send({ type: 'profile_update', name: v.name.trim(), about: v.about.trim(), phone: v.phone.trim() });
    ui.toast('Профиль сохранён');
    TM.settings.refresh && TM.settings.refresh();
  }

  return { open, openGroup, openOwn, editOwn, pickAvatar };
})();
