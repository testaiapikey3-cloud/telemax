/* ============================================================
 * TeleMAX Web — chat.js
 * Окно чата: пузыри, медиа, голосовые, файлы, подарки, опросы,
 * ответы, удаление, статусы ✓/✓✓, «печатает…», онлайн в шапке.
 * ============================================================ */
window.TM = window.TM || {};

TM.chat = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  let h = null;             // handle экрана
  let cur = null;           // chatId
  let replyTo = null;       // сообщение для ответа
  let msgsEl = null;
  let stick = true;        // держимся у нижнего края (как в мессенджерах)
  let forceBottom = false; // принудительный скролл (открытие чата, своё сообщение)
  let scrollTimers = [];
  let inputEl = null;
  let typingSentAt = 0;
  let recorder = null, recChunks = [], recStart = 0, recTimer = null;

  /* ---------- открыть чат ---------- */
  function open(chatId) {
    const c = S.getChat(chatId);
    if (!c) return;
    closeCurrent();
    cur = chatId;
    S.s.activeChat = chatId;
    c.unread = 0;
    S.save();

    if (h) h.close();
    h = ui.pushScreen(node => {
      node.classList.add('chat-screen');
      buildHeader(node, c);
      const body = U.el('div', 'chat-body');
      const wp = TM.config.WALLPAPERS[c.wallpaper || 0];
      body.style.background = wp ? wp.css : '';
      msgsEl = U.el('div', 'msgs');
      body.appendChild(msgsEl);
      node.appendChild(body);
      buildComposer(node, c);
      stick = true;
      forceBottom = true;
      body.addEventListener('scroll', () => {
        const dist = body.scrollHeight - body.scrollTop - body.clientHeight;
        stick = dist < 140;
      }, { passive: true });
      renderMessages();
      markPeerRead();
      if (TM.app.tab === 'chats') TM.chats.render();
    }, { onClose: () => { S.s.activeChat = null; cur = null; } });
  }

  function closeCurrent() { if (h) { h.close(); h = null; } }

  function refreshIfOpen(chatId) { if (cur === chatId && msgsEl) renderMessages(); }

  /* ---------- шапка ---------- */
  function buildHeader(node, c) {
    const head = U.el('div', 'chat-head');
    const status = statusText(c);
    const showCall = c.kind === 'private' && !TM.config.BOT_USERNAMES[c.username];
    head.innerHTML =
      '<button class="icon-btn" id="cc-back">' + ui.icon('back') + '</button>' +
      ui.avatarHTML(c.name, c.avatar || avatarOf(c), c.kind === 'private' && S.isOnline(c.username), 'sm') +
      '<div class="cc-main" id="cc-open-profile">' +
        '<div class="cc-name">' + U.esc(c.name || c.username) + ui.verifiedBadge(c.username) + '</div>' +
        '<div class="cc-status" id="cc-status">' + U.esc(status) + '</div>' +
      '</div>' +
      (showCall ? '<button class="icon-btn" id="cc-call-a" title="Аудиозвонок">' + ui.icon('calls') + '</button>' +
                  '<button class="icon-btn" id="cc-call-v" title="Видеозвонок">' + ui.icon('video') + '</button>' : '') +
      '<button class="icon-btn" id="cc-menu">' + ui.icon('dots') + '</button>';
    node.appendChild(head);

    head.querySelector('#cc-back').onclick = () => h.close();
    head.querySelector('#cc-open-profile').onclick = () => openPeerProfile(c);
    head.querySelector('#cc-menu').onclick = () => chatMenu(c);
    const ca = head.querySelector('#cc-call-a'); if (ca) ca.onclick = () => TM.calls.start(c, false);
    const cv = head.querySelector('#cc-call-v'); if (cv) cv.onclick = () => TM.calls.start(c, true);
  }

  function avatarOf(c) {
    if (c.kind !== 'private') return '';
    const p = S.profileOf(c.username);
    return p ? p.avatar : '';
  }

  function statusText(c) {
    if (c.kind === 'group') return (c.members ? c.members.length : 0) + ' участников';
    if (c.kind === 'channel') return (c.members ? c.members.length : 0) + ' подписчиков';
    if (TM.config.BOT_USERNAMES[c.username]) return 'бот';
    if (S.isOnline(c.username)) return 'в сети';
    const p = S.s.presence[c.username] || {};
    return U.lastSeenText(p.lastSeen);
  }

  function refreshHeaderStatus() {
    const st = U.$('#cc-status');
    if (st && cur) { const c = S.getChat(cur); if (c) st.textContent = statusText(c); }
  }

  function chatMenu(c) {
    const items = [
      { icon: 'palette', label: 'Фон чата', onClick: () => chooseWallpaper(c.id) },
      { icon: 'bell', label: c.muted ? 'Включить уведомления' : 'Отключить уведомления', onClick: () => { c.muted = !c.muted; S.save(); } }
    ];
    if (c.kind === 'private' && !TM.config.BOT_USERNAMES[c.username]) {
      items.push({ icon: 'gift', label: 'Подарить NFT', onClick: () => TM.gifts.sendNftFlow(c) });
      items.push({ icon: 'star', label: 'Подарить TelePremium (499 TC)', onClick: () => TM.gifts.sendPremiumFlow(c) });
    }
    items.push({ icon: 'user', label: 'Профиль', onClick: () => openPeerProfile(c) });
    items.push({ icon: 'trash', label: 'Очистить историю', onClick: async () => { if (await ui.confirm('Очистить историю?', 'Сообщения будут удалены.')) { c.messages = []; S.save(); renderMessages(); } } });
    if (c.kind !== 'private') items.push({ icon: 'logout', label: c.kind === 'channel' ? 'Покинуть канал' : 'Покинуть группу', danger: true, onClick: async () => { if (await ui.confirm('Выйти?', 'Вы покинете «' + c.name + '»')) { TM.net.send({ type: 'group_leave', id: c.id.slice(2) }); S.removeChat(c.id); h.close(); TM.chats.render(); } } });
    ui.sheet({ title: c.name, items });
  }

  function chooseWallpaper(chatId) {
    const c = S.getChat(chatId);
    ui.sheet({
      title: 'Фон чата',
      items: TM.config.WALLPAPERS.map(w => ({
        label: w.name, active: (c.wallpaper || 0) === w.id,
        onClick: () => { c.wallpaper = w.id; S.save(); if (cur === chatId && msgsEl) msgsEl.parentElement.style.background = w.css; }
      }))
    });
  }

  function openPeerProfile(c) {
    if (c.kind === 'private') TM.profile.open(c.username);
    else TM.profile.openGroup(c);
  }

  /* ---------- рендер сообщений ---------- */
  function scrollBottomSoon(body) {
    const el = body || (msgsEl && msgsEl.parentElement);
    if (!el) return;
    const go = () => { if (msgsEl && el === msgsEl.parentElement) el.scrollTop = el.scrollHeight; };
    go();
    scrollTimers.forEach(t => clearTimeout(t));
    scrollTimers = [setTimeout(go, 80), setTimeout(go, 250), setTimeout(go, 700)];
  }

  function renderMessages() {
    if (!msgsEl || !cur) return;
    const c = S.getChat(cur);
    if (!c) return;
    const nearBottom = msgsEl.parentElement.scrollHeight - msgsEl.parentElement.scrollTop - msgsEl.parentElement.clientHeight < 140;
    msgsEl.innerHTML = '';
    if (!c.messages.length) {
      msgsEl.innerHTML = '<div class="chat-empty">' + ui.icon('chats') + '<div>Начните переписку</div></div>';
    }
    let lastDate = '';
    c.messages.forEach(m => {
      const label = U.dateLabel(m.time);
      if (label !== lastDate) {
        lastDate = label;
        msgsEl.appendChild(U.el('div', 'date-divider', U.esc(label)));
      }
      msgsEl.appendChild(renderMessage(m, c));
    });
    // индикатор «печатает…»
    const typingAt = S.s.typing[c.username];
    if (c.kind === 'private' && typingAt && Date.now() - typingAt < 4000) {
      msgsEl.appendChild(U.el('div', 'typing-pill', U.esc(c.name) + ' печатает…'));
    }
    const body = msgsEl.parentElement;
    const force = forceBottom;
    forceBottom = false;
    if (force || nearBottom || stick) scrollBottomSoon(body);
    // картинки догружаются позже — если мы у низа, доводим прокрутку
    msgsEl.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', () => { if (stick) scrollBottomSoon(); }, { once: true });
    });
  }

  function renderMessage(m, c) {
    if (m.type === 'system') {
      const sys = U.el('div', 'msg-system', U.esc(m.text));
      return sys;
    }
    const mine = m.mine;
    const wrap = U.el('div', 'msg ' + (mine ? 'mine' : 'theirs'));
    wrap.dataset.id = m.id;
    const bubble = U.el('div', 'bubble bubble-' + m.type);

    // ответ
    if (m.replyTo) {
      const orig = c.messages.find(x => x.id === m.replyTo);
      if (orig) {
        const q = U.el('div', 'quote');
        q.innerHTML = '<b>' + U.esc(orig.mine ? 'Вы' : (c.kind === 'private' ? c.name : (orig.from || c.name))) + '</b><span>' + U.esc(quoteText(orig)) + '</span>';
        bubble.appendChild(q);
      }
    }

    if (m.type === 'image') {
      const img = U.el('img', 'msg-img');
      img.src = U.safeUrl(m.uri);
      img.loading = 'lazy';
      img.onclick = () => TM.media.openViewer(c, m);
      bubble.appendChild(img);
      if (m.text) bubble.appendChild(U.el('div', 'msg-caption', U.esc(m.text)));
    } else if (m.type === 'video') {
      const v = U.el('video', 'msg-video');
      v.src = U.safeUrl(m.uri);
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      bubble.appendChild(v);
      if (m.text) bubble.appendChild(U.el('div', 'msg-caption', U.esc(m.text)));
    } else if (m.type === 'audio') {
      bubble.appendChild(buildAudioPlayer(m));
    } else if (m.type === 'file') {
      const f = U.el('div', 'msg-file');
      f.innerHTML = ui.icon('file') + '<div class="mf-main"><div class="mf-name">' + U.esc(m.fileName || 'Файл') + '</div><div class="mf-size">' + U.bytes(m.fileSize) + '</div></div>' + ui.icon('download');
      f.onclick = () => { const a = document.createElement('a'); a.href = U.safeUrl(m.uri); a.download = m.fileName || 'file'; a.target = '_blank'; a.click(); };
      bubble.appendChild(f);
    } else if (m.type === 'gift') {
      const g = U.el('div', 'msg-gift');
      g.innerHTML = '<div class="mg-emoji">🎁</div><div class="mg-text">' + U.esc(m.text || 'Подарок') + '</div>';
      bubble.appendChild(g);
    } else if (m.type === 'poll' && m.poll) {
      bubble.appendChild(TM.polls.render(m, c, () => S.save()));
    } else {
      bubble.appendChild(U.el('div', 'msg-text', linkify(U.esc(m.text || ''))));
    }

    const foot = U.el('div', 'msg-foot');
    foot.innerHTML = '<span>' + U.timeHM(m.time) + '</span>' + (mine ? statusTicks(m) : '');
    bubble.appendChild(foot);

    wrap.appendChild(bubble);
    attachMsgMenu(wrap, m, c);
    return wrap;
  }

  function quoteText(m) {
    if (m.type === 'image') return '🖼 Фото';
    if (m.type === 'video') return '🎬 Видео';
    if (m.type === 'audio') return '🎤 Голосовое';
    if (m.type === 'file') return '📄 ' + (m.fileName || 'Файл');
    if (m.type === 'poll') return '📊 Опрос';
    if (m.type === 'gift') return '🎁 ' + (m.text || 'Подарок');
    return m.text || '';
  }
  function linkify(s) {
    return s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
  function statusTicks(m) {
    if (m.status === 'read') return '<span class="ticks read">✓✓</span>';
    if (m.status === 'delivered') return '<span class="ticks">✓✓</span>';
    if (m.status === 'queued') return '<span class="ticks">✓</span>';
    return '<span class="ticks">✓</span>';
  }

  function attachMsgMenu(wrap, m, c) {
    let timer = null, moved = false;
    wrap.addEventListener('pointerdown', () => { moved = false; timer = setTimeout(() => msgMenu(m, c), 500); });
    wrap.addEventListener('pointermove', () => { moved = true; clearTimeout(timer); });
    wrap.addEventListener('pointerup', () => clearTimeout(timer));
    wrap.addEventListener('pointerleave', () => clearTimeout(timer));
    wrap.addEventListener('dblclick', () => setReply(m));
  }

  function msgMenu(m, c) {
    if (m.type === 'system') return;
    const items = [];
    items.push({ icon: 'reply', label: 'Ответить', onClick: () => setReply(m) });
    if (m.type === 'text') items.push({ icon: 'edit', label: 'Копировать', onClick: () => { navigator.clipboard && navigator.clipboard.writeText(m.text || ''); ui.toast('Скопировано'); } });
    if (m.mine) items.push({ icon: 'trash', label: 'Удалить', danger: true, onClick: () => {
      S.removeMessage(c.id, m.id);
      TM.net.send({ type: 'delete_message', id: m.id, chatId: c.id, to: c.kind === 'private' ? c.username : 'g:' + c.id.slice(2) });
      renderMessages(); TM.chats.render();
    } });
    ui.sheet({ items });
  }

  function setReply(m) {
    replyTo = m;
    const bar = U.$('#reply-bar');
    if (bar) {
      bar.classList.add('show');
      bar.innerHTML = '<div class="rb-main"><b>Ответ ' + U.esc(m.mine ? 'себе' : '') + '</b><span>' + U.esc(quoteText(m).slice(0, 90)) + '</span></div><button class="icon-btn" id="rb-x">' + ui.icon('close') + '</button>';
      bar.querySelector('#rb-x').onclick = () => { replyTo = null; bar.classList.remove('show'); };
    }
  }

  /* ---------- аудио-плеер ---------- */
  function buildAudioPlayer(m) {
    const box = U.el('div', 'msg-audio');
    const audio = new Audio(U.safeUrl(m.uri));
    box.innerHTML = '<button class="audio-btn">' + ui.icon('play') + '</button>' +
      '<div class="audio-bars">' + Array.from({ length: 18 }, (_, i) => '<i style="height:' + (30 + Math.abs(Math.sin(i * 1.7)) * 60) + '%"></i>').join('') + '</div>' +
      '<span class="audio-time">' + (m.duration ? Math.round(m.duration) + '″' : '') + '</span>';
    const btn = box.querySelector('.audio-btn');
    let playing = false;
    btn.onclick = () => {
      if (playing) { audio.pause(); } else { audio.play(); }
    };
    audio.onplay = () => { playing = true; btn.innerHTML = ui.icon('pause'); };
    audio.onpause = () => { playing = false; btn.innerHTML = ui.icon('play'); };
    audio.onended = () => { playing = false; btn.innerHTML = ui.icon('play'); };
    return box;
  }

  /* ---------- composer ---------- */
  function buildComposer(node, c) {
    const box = U.el('div', 'composer-wrap');
    box.innerHTML =
      '<div class="reply-bar" id="reply-bar"></div>' +
      '<div class="rec-bar" id="rec-bar" style="display:none"><span class="rec-dot"></span><span id="rec-time">0:00</span><span class="rec-hint">идёт запись…</span><button class="btn btn-primary btn-sm" id="rec-send">Отправить</button><button class="btn btn-ghost btn-sm" id="rec-cancel">Отмена</button></div>' +
      '<div class="composer">' +
        '<button class="icon-btn" id="cp-attach">' + ui.icon('attach') + '</button>' +
        '<textarea id="cp-input" rows="1" placeholder="Сообщение..."></textarea>' +
        '<button class="icon-btn" id="cp-mic">' + ui.icon('mic') + '</button>' +
        '<button class="send-btn" id="cp-send" style="display:none">' + ui.icon('send') + '</button>' +
      '</div>';
    node.appendChild(box);

    inputEl = box.querySelector('#cp-input');
    const sendBtn = box.querySelector('#cp-send');
    const micBtn = box.querySelector('#cp-mic');

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(110, inputEl.scrollHeight) + 'px';
      const has = inputEl.value.trim().length > 0;
      sendBtn.style.display = has ? 'grid' : 'none';
      micBtn.style.display = has ? 'none' : 'grid';
      if (has) sendTyping();
    });
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(c); }
    });
    sendBtn.onclick = () => sendText(c);
    micBtn.onclick = () => toggleRecord(c);
    box.querySelector('#cp-attach').onclick = () => attachSheet(c);
    box.querySelector('#rec-send').onclick = () => stopRecord(c, false);
    box.querySelector('#rec-cancel').onclick = () => stopRecord(c, true);
  }

  function setInput(text) { if (inputEl) { inputEl.value = text; inputEl.dispatchEvent(new Event('input')); inputEl.focus(); } }

  /* ---------- отправка ---------- */
  function sendText(c) {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    inputEl.dispatchEvent(new Event('input'));
    sendMessage(c, { type: 'text', text });
  }

  function sendMessage(c, data) {
    const m = {
      id: U.uid(), type: data.type || 'text', text: data.text || '', uri: data.uri || '',
      fileName: data.fileName || '', fileSize: data.fileSize || 0, duration: data.duration || 0,
      replyTo: replyTo ? replyTo.id : '', poll: data.poll || null, giftKind: data.giftKind || '', giftValue: data.giftValue || '',
      mine: true, from: S.s.user, time: Date.now(), status: 'sent'
    };
    replyTo = null;
    const rb = U.$('#reply-bar'); if (rb) rb.classList.remove('show');
    S.addMessage(c.id, m);
    if (cur === c.id) { stick = true; renderMessages(); }
    TM.app && TM.app.updateTabBadge();
    TM.chats.render();
    S.store().analytics.messagesSent = (S.store().analytics.messagesSent || 0) + 1;
    S.save();

    // боты отвечают локально (только на текстовые команды)
    if (c.kind === 'private' && TM.config.BOT_USERNAMES[c.username]) {
      setTimeout(() => m.status = 'delivered', 400);
      if (m.type === 'text') TM.bots.handle(c.username, c, m.text);
      if (cur === c.id) renderMessages();
      return;
    }

    if (TM.net.isOn()) {
      TM.net.send({
        type: 'chat_message', clientId: m.id, to: c.kind === 'private' ? c.username : 'g:' + c.id.slice(2),
        messageType: m.type, text: m.text, uri: m.uri, fileName: m.fileName, fileSize: m.fileSize,
        replyTo: m.replyTo, poll: m.poll, giftKind: m.giftKind, giftValue: m.giftValue, id: m.id
      });
    } else {
      m.status = 'queued';
      ui.toast('Офлайн: сообщение сохранено на устройстве', 'warn');
    }
  }

  function sendTyping() {
    const c = S.getChat(cur);
    if (!c || c.kind !== 'private') return;
    const t = Date.now();
    if (t - typingSentAt < 1800) return;
    typingSentAt = t;
    TM.net.send({ type: 'typing', to: c.username, chatId: c.id, on: true });
  }

  function markPeerRead() {
    const c = S.getChat(cur);
    if (!c || c.kind !== 'private') return;
    let changed = false;
    c.messages.forEach(m => { if (!m.mine && m.status !== 'read') { m.status = 'read'; changed = true; } });
    if (changed) S.save();
    if (TM.net.isOn() && c.username) TM.net.send({ type: 'read', peer: c.username, chatId: c.id, upTo: (c.messages[c.messages.length - 1] || {}).id || '' });
  }

  /* ---------- вложения ---------- */
  function attachSheet(c) {
    ui.sheet({
      items: [
        { icon: 'image', label: 'Фото', onClick: () => TM.attach.pick(c, 'image') },
        { icon: 'video', label: 'Видео', onClick: () => TM.attach.pick(c, 'video') },
        { icon: 'file', label: 'Файл', onClick: () => TM.attach.pick(c, 'file') },
        { icon: 'poll', label: 'Опрос', onClick: () => TM.polls.composer(c, sendMessage) },
        { icon: 'gift', label: 'Подарок', onClick: () => TM.gifts.openCatalog(c) },
        { icon: 'camera', label: 'Аватар: см. профиль', onClick: () => ui.toast('Аватар меняется в профиле') }
      ]
    });
  }

  /* ---------- голосовые ---------- */
  async function toggleRecord(c) {
    if (recorder) return stopRecord(c, false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recChunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => { if (e.data.size) recChunks.push(e.data); };
      recorder.start();
      recStart = Date.now();
      const bar = U.$('#rec-bar'), cmp = U.$('.composer');
      if (bar) bar.style.display = 'flex';
      if (cmp) cmp.style.display = 'none';
      recTimer = setInterval(() => {
        const t = U.$('#rec-time');
        if (t) { const s = Math.floor((Date.now() - recStart) / 1000); t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
      }, 500);
    } catch (e) {
      ui.toast('Нет доступа к микрофону — разрешите доступ в браузере', 'err');
      recorder = null;
    }
  }

  function stopRecord(c, cancel) {
    if (!recorder) return;
    const rec = recorder;
    recorder = null;
    clearInterval(recTimer);
    const bar = U.$('#rec-bar'), cmp = U.$('.composer');
    if (bar) bar.style.display = 'none';
    if (cmp) cmp.style.display = 'flex';
    rec.onstop = async () => {
      rec.stream.getTracks().forEach(t => t.stop());
      if (cancel || !recChunks.length) return;
      const blob = new Blob(recChunks, { type: rec.mimeType || 'audio/webm' });
      const dur = (Date.now() - recStart) / 1000;
      if (dur < 0.7) return ui.toast('Слишком коротко');
      await TM.attach.sendAudioBlob(c, blob, dur);
    };
    try { rec.stop(); } catch (_) {}
  }

  /* ---------- обработчики сети ---------- */
  function bindNet() {
    TM.net.on('chat_message', m => {
      if (!S.s.user) return;
      if (m.from === 'telemaxbot' && m.to === S.s.user && m.text && m.text.includes('Кто-то вошёл в ваш аккаунт')) {
        const st = S.store();
        st.analytics = st.analytics || { logins: 0, messagesSent: 0, mediaSent: 0 };
        st.analytics.logins = (st.analytics.logins || 0) + 1;
        S.save();
      }
      receiveMessage(m);
    });
    TM.net.on('history_snapshot', m => {
      if (!S.s.user || !m || !Array.isArray(m.items) || !m.items.length) return;
      let added = 0;
      for (const item of m.items) { try { if (receiveMessage(item, true)) added++; } catch (_) {} }
      if (!added) return;
      S.saveNow();
      TM.chats.render();
      TM.app.updateTabBadge();
      if (cur) renderMessages();
      ui.toast('☁️ Синхронизация: подгружено с сервера ' + added + ' сообщ.', 'info');
    });
    TM.net.on('message_accepted', m => {
      if (!m.clientId) return;
      for (const c of S.allChats()) {
        const msg = c.messages.find(x => x.id === m.clientId);
        if (msg) {
          msg.status = m.delivered ? 'delivered' : 'queued';
          S.save();
          if (cur === c.id) renderMessages();
          break;
        }
      }
    });
    TM.net.on('read', m => {
      const c = S.getChat(S.chatIdForUser(m.by));
      if (!c) return;
      let changed = false;
      c.messages.forEach(x => { if (x.mine && x.status !== 'read') { x.status = 'read'; changed = true; } });
      if (changed) S.save();
      if (cur === c.id) renderMessages();
    });
    TM.net.on('typing', m => {
      S.s.typing[m.from] = Date.now();
      if (cur && cur === S.chatIdForUser(m.from)) renderMessages();
      refreshHeaderStatus();
      setTimeout(() => { if (cur === S.chatIdForUser(m.from)) renderMessages(); }, 4200);
    });
    TM.net.on('delete_message', m => {
      const chatId = m.chatId.startsWith('g_') ? m.chatId : S.chatIdForUser(m.by);
      S.removeMessage(chatId, m.id);
      if (cur === chatId) renderMessages();
    });
    TM.net.on('poll_update', m => {
      const chatId = m.chatId.startsWith('g_') ? m.chatId : S.chatIdForUser(m.from);
      const c = S.getChat(chatId);
      if (!c) return;
      const msg = c.messages.find(x => x.id === m.messageId);
      if (!msg || !msg.poll) return;
      if (m.votes) msg.poll.votes = m.votes;
      S.save();
      if (cur === chatId) renderMessages();
    });
    TM.net.on('presence', m => {
      refreshHeaderStatus();
    });
    TM.net.on('admin_notice', m => {
      ui.toast(m.text || 'Уведомление администрации', 'warn');
      const c = S.getChat(S.chatIdForUser('telemaxbot'));
      if (c) {
        S.addMessage(c.id, { id: U.uid(), type: 'system', text: m.text || '', mine: false, from: 'telemaxbot', time: Date.now() });
      }
    });
    TM.net.on('broadcast', m => {
      const text = m.text || '';
      notifyIncoming('📢 TeleMAX', text, { kind: 'chat', chat: S.chatIdForUser('telemaxbot'), toast: '📢 ' + text });
      const c = S.getChat(S.chatIdForUser('telemaxbot')) || S.createChat({ id: S.chatIdForUser('telemaxbot'), kind: 'private', username: 'telemaxbot', name: 'TeleMAX Bot' });
      S.addMessage(c.id, { id: U.uid(), type: 'text', text: '📢 Рассылка TeleMAX\n\n' + (m.text || ''), mine: false, from: 'telemaxbot', time: Date.now() });
      TM.chats.render();
    });
    TM.net.on('restriction', m => {
      if (m.banned) ui.modal({ title: 'Аккаунт заблокирован', text: 'Ваш аккаунт заблокирован администрацией.', dismissable: false, actions: [{ label: 'Понятно' }] });
      if (m.frozen) ui.modal({ title: 'Аккаунт заморожен', text: 'Отправка сообщений ограничена.', dismissable: false, actions: [{ label: 'Понятно' }] });
    });
  }

  /* ---------- входящее сообщение ---------- */
  function notifyIncoming(title, body, data) {
    if (data && data.toast && document.visibilityState === 'visible') { ui.toast(data.toast, 'info'); return; }
    if (document.visibilityState === 'visible') { ui.toast((title || '') + ': ' + (body || ''), 'info'); return; }
    TM.notify.incomingMessage({
      title: title || 'TeleMAX',
      body: body || '',
      tag: 'tm-' + ((data && data.chat) || 'msg'),
      data: data ? { kind: data.kind || 'chat', chat: data.chat || '', user: data.user || '' } : {}
    });
  }

  function receiveMessage(m, silent) {
    if (!S.s.user) return false;
    if (String(m.to || '').startsWith('g:')) {
      const gid = m.to.slice(2);
      const chatId = S.chatIdForGroup(gid);
      const g = S.s.groups[gid];
      const c = S.getChat(chatId) || S.createChat({ id: chatId, kind: g && g.type === 'channel' ? 'channel' : 'group', name: (g && g.name) || m.groupName || 'Группа', members: g ? g.members : [] });
      if (m.id && c.messages.some(x => x.id === m.id || (m.clientId && x.id === m.clientId))) return false;
      const msg = toLocal(m, m.from === S.s.user);
      S.addMessage(c.id, msg);
      if (!silent) {
        if (!msg.mine && cur !== c.id) {
          c.unread = (c.unread || 0) + 1;
          if (S.store().settings.notifications && !c.muted) notifyIncoming(c.name, TM.chats.preview(c), { kind: 'chat', chat: c.id, user: m.from });
        }
        S.save();
        if (cur === c.id) renderMessages();
        TM.chats.render();
        TM.app.updateTabBadge();
      }
      return true;
    }
    const peer = m.from === S.s.user ? m.to : m.from;
    if (!peer) return false;
    const chatId = S.chatIdForUser(peer);
    const c = S.getChat(chatId) || S.createChat({ id: chatId, kind: 'private', username: peer, name: (S.profileOf(peer) || {}).name || (TM.config.BOT_USERNAMES[peer]) || ('@' + peer) });
    // дубликаты отсекаем по id сервера и по clientId своих сообщений
    if (c.messages.some(x => x.id === m.id || (m.clientId && x.id === m.clientId))) return false;
    const msg = toLocal(m, m.from === S.s.user);
    S.addMessage(c.id, msg);
    if (msg.mine) msg.status = 'delivered';
    else if (!silent && cur !== c.id) {
      c.unread = (c.unread || 0) + 1;
      if (S.store().settings.notifications && !c.muted) notifyIncoming(c.name || peer, TM.chats.preview(c), { kind: 'chat', chat: c.id, user: peer });
    }
    if (!silent) {
      S.save();
      if (cur === c.id) { renderMessages(); markPeerRead(); }
      TM.chats.render();
      TM.app.updateTabBadge();
    }
    return true;
  }

  function toLocal(m, mine) {
    return {
      id: m.id || U.uid(), type: m.messageType || m.type || 'text',
      text: m.text || '', uri: m.uri || '', fileName: m.fileName || '', fileSize: m.fileSize || 0,
      replyTo: m.replyTo || '', poll: m.poll || null, giftKind: m.giftKind || '', giftValue: m.giftValue || '',
      mine: !!mine, from: m.from, time: m.serverTime || Date.now(), status: 'read'
    };
  }

  /* клавиатура/поворот экрана: если мы у низа — остаёмся у низа */
  function onViewportChange() { if (stick && msgsEl) setTimeout(() => scrollBottomSoon(), 60); }
  try {
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewportChange);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
  } catch (_) {}

  return { open, refreshIfOpen, renderMessages, sendMessage, chooseWallpaper, bindNet, setInput, receiveMessage };
})();
