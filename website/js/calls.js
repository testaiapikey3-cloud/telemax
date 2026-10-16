/* ============================================================
 * TeleMAX Web — calls.js
 * Звонки WebRTC (аудио/видео) через WebSocket-сигналинг.
 * Протокол: call → accept → offer → answer → ice → hangup.
 * Экран «Звонки»: фильтры Все / Пропущенные / Входящие / Исходящие.
 * ============================================================ */
window.TM = window.TM || {};

TM.calls = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
  const RING_TIMEOUT = 45000;

  let host = null;
  let filter = 'all';
  let pc = null, localStream = null;
  let active = null;         // {peer, name, video, callId, started, direction}
  let callUI = null;
  let callTimer = null;
  let ringTimer = null;
  let pendingIncoming = null; // {from, close} — входящий вызов, ждёт ответа

  /* ---------- история ---------- */
  function addHistory(peer, name, dir, kind, missed) {
    const st = S.store();
    st.calls.unshift({ user: peer, name: name || peer, dir, kind, missed: !!missed, time: Date.now(), duration: 0 });
    st.calls = st.calls.slice(0, 200);
    S.save();
    if (TM.app.tab === 'calls') render();
  }

  /* ---------- экран истории ---------- */
  function render(target) {
    if (target) host = target;
    if (!host) return;
    host.innerHTML = '';
    const head = U.el('div', 'scr-head');
    head.innerHTML = '<div class="scr-title">Звонки</div><button class="icon-btn" id="cl-new">' + ui.icon('plus') + '</button>';
    host.appendChild(head);

    const tabs = U.el('div', 'ch-tabs');
    [['all', 'Все'], ['missed', 'Пропущенные'], ['in', 'Входящие'], ['out', 'Исходящие']].forEach(([id, label]) => {
      const t = U.el('button', 'chip' + (filter === id ? ' active' : ''), label);
      t.onclick = () => { filter = id; render(); };
      tabs.appendChild(t);
    });
    host.appendChild(tabs);

    const list = U.el('div', 'cl-list');
    let items = S.store().calls || [];
    if (filter === 'missed') items = items.filter(c => c.missed);
    if (filter === 'in') items = items.filter(c => c.dir === 'in');
    if (filter === 'out') items = items.filter(c => c.dir === 'out');
    if (!items.length) {
      list.innerHTML = '<div class="empty"><div class="empty-ic">' + ui.icon('calls') + '</div><div>История пуста</div><div class="dim">Позвоните из чата или профиля</div></div>';
    }
    items.forEach(c => {
      const row = U.el('div', 'cl-row');
      row.innerHTML =
        ui.avatarHTML(c.name, '', S.isOnline(c.user), 'md') +
        '<div class="ct-main"><b>' + U.esc(c.name) + '</b><span class="' + (c.missed ? 'missed' : '') + '">' +
          (c.dir === 'in' ? 'Входящий' : 'Исходящий') + (c.missed ? ' • пропущен' : '') + ' • ' + U.timeHM(c.time) + ' • ' + (c.kind === 'video' ? 'видео' : 'аудио') +
        '</span></div>' +
        '<button class="icon-btn call-a" title="Аудиозвонок">' + ui.icon('calls') + '</button>' +
        '<button class="icon-btn call-v" title="Видеозвонок">' + ui.icon('video') + '</button>';
      row.querySelector('.call-a').onclick = e => { e.stopPropagation(); start({ username: c.user, name: c.name, kind: 'private' }, false); };
      row.querySelector('.call-v').onclick = e => { e.stopPropagation(); start({ username: c.user, name: c.name, kind: 'private' }, true); };
      row.onclick = () => TM.profile.open(c.user);
      list.appendChild(row);
    });
    host.appendChild(list);
    head.querySelector('#cl-new').onclick = () => { ui.toast('Выберите контакт для звонка'); TM.app.selectTab('contacts'); };
  }

  /* ---------- исходящий звонок ---------- */
  function start(chat, video) {
    if (!TM.net.isOn()) { ui.toast('Звонки работают при подключении к серверу', 'err'); return; }
    const peer = chat.username;
    if (!peer) return;
    if (active) return ui.toast('Уже есть активный звонок', 'warn');
    // Если собеседник не в сети — сервер отправит ему push-уведомление о звонке,
    // а вызов дозвонит, как только он откроет TeleMAX (в течение 45 секунд).
    if (!S.isOnline(peer)) ui.toast('Собеседник не в сети — отправили уведомление о звонке', 'info');

    active = { peer, name: chat.name || peer, video, callId: U.uid(), started: 0, direction: 'out' };
    openCallUI();
    addHistory(peer, chat.name, 'out', video ? 'video' : 'audio', false);
    TM.net.send({ type: 'call', to: peer, video, callId: active.callId });
    ringTimer = setTimeout(() => {
      if (active && !active.started) {
        ui.toast('Нет ответа');
        const st = S.store();
        if (st.calls[0]) st.calls[0].missed = true;
        S.save();
        hangup(true);
      }
    }, RING_TIMEOUT);
  }

  /* ---------- входящий ---------- */
  async function incoming(m) {
    if (active) { TM.net.send({ type: 'reject', to: m.from }); return; }
    const chat = S.getChat(S.chatIdForUser(m.from));
    const name = (chat && chat.name) || (S.profileOf(m.from) || {}).name || ('@' + m.from);
    // Рингтон + вибрация + системное уведомление (если вкладка скрыта и push недоступен)
    TM.notify.incomingCall({
      user: m.from,
      title: m.video ? '📹 Видеозвонок TeleMAX' : '📞 Входящий звонок TeleMAX',
      body: name + ' звонит вам',
      data: { kind: 'call', user: m.from }
    });
    const ok = await ui.modal({
      title: m.video ? 'Видеозвонок' : 'Входящий звонок',
      text: 'Вам звонит ' + name,
      dismissable: false,
      onRender: (box, close) => { pendingIncoming = { from: m.from, close }; },
      actions: [
        { label: 'Принять', primary: true, value: true },
        { label: 'Отклонить', danger: true, value: false }
      ]
    });
    pendingIncoming = null;
    TM.notify.stopRing();
    if (!ok || active) { TM.net.send({ type: 'reject', to: m.from }); addHistory(m.from, name, 'in', m.video ? 'video' : 'audio', true); return; }
    active = { peer: m.from, name, video: !!m.video, callId: m.callId || U.uid(), started: 0, direction: 'in' };
    openCallUI();
    addHistory(m.from, name, 'in', m.video ? 'video' : 'audio', false);
    TM.net.send({ type: 'accept', to: m.from, callId: active.callId });
    await beginCallee();
  }

  /* ---------- UI звонка ---------- */
  function openCallUI() {
    callUI = ui.pushScreen((node, handle) => {
      node.classList.add('call-screen');
      node.innerHTML =
        '<video id="call-remote" autoplay playsinline></video>' +
        '<video id="call-local" autoplay playsinline muted></video>' +
        '<div class="call-info">' +
          ui.avatarHTML(active.name, (S.profileOf(active.peer) || {}).avatar, false, 'xl') +
          '<div class="call-name">' + U.esc(active.name) + '</div>' +
          '<div class="call-status" id="call-status">' + (active.direction === 'out' ? 'Вызов…' : 'Соединение…') + '</div>' +
        '</div>' +
        '<div class="call-controls">' +
          '<button class="cc-btn" id="cc-mute" title="Микрофон">' + ui.icon('mic') + '</button>' +
          (active.video ? '<button class="cc-btn" id="cc-cam" title="Камера">' + ui.icon('video') + '</button>' : '') +
          '<button class="cc-btn end" id="cc-end" title="Завершить">' + ui.icon('calls') + '</button>' +
        '</div>';
      node.querySelector('#cc-end').onclick = () => hangup(false);
      node.querySelector('#cc-mute').onclick = (ev => {
        const track = localStream && localStream.getAudioTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        ev.currentTarget.classList.toggle('off', !track.enabled);
      });
      const cam = node.querySelector('#cc-cam');
      if (cam) cam.onclick = (ev => {
        const track = localStream && localStream.getVideoTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        ev.currentTarget.classList.toggle('off', !track.enabled);
      });
    }, { onClose: () => { callUI = null; } });
  }

  function setStatus(text) {
    const el = U.$('#call-status');
    if (el) el.textContent = text;
    if (text === 'Соединено') { const info = U.$('.call-info'); if (info) info.classList.add('connected'); }
  }
  function startTimer() {
    if (!active) return;
    active.started = Date.now();
    clearInterval(callTimer);
    callTimer = setInterval(() => {
      const s = Math.floor((Date.now() - active.started) / 1000);
      setStatus(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
    }, 1000);
  }

  /* ---------- WebRTC ---------- */
  async function ensureMedia(video) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video });
    const lv = U.$('#call-local');
    if (lv) lv.srcObject = localStream;
    return localStream;
  }
  async function createPeer() {
    pc = new RTCPeerConnection(ICE);
    const rv = U.$('#call-remote');
    if (rv) { const ms = new MediaStream(); rv.srcObject = ms; pc._remote = ms; }
    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = e => { if (e.candidate && active) TM.net.send({ type: 'ice', to: active.peer, candidate: e.candidate }); };
    pc.ontrack = e => { if (pc._remote) pc._remote.addTrack(e.track); };
    pc.onconnectionstatechange = () => { if (pc && ['failed', 'disconnected'].includes(pc.connectionState) && active) hangup(true); };
    return pc;
  }
  async function beginCaller() {
    try {
      await ensureMedia(active && active.video);
      await createPeer();
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: !!(active && active.video) });
      await pc.setLocalDescription(offer);
      TM.net.send({ type: 'offer', to: active.peer, sdp: offer });
      setStatus('Ожидание ответа…');
    } catch (e) {
      ui.toast('Нет доступа к камере/микрофону', 'err');
      hangup(true);
    }
  }
  async function beginCallee() {
    try {
      await ensureMedia(active && active.video);
      await createPeer();
      setStatus('Соединение…');
    } catch (e) {
      ui.toast('Нет доступа к камере/микрофону', 'err');
      TM.net.send({ type: 'reject', to: active.peer });
      cleanup();
      if (callUI) { callUI.close(); callUI = null; }
    }
  }
  async function onOffer(m) {
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(m.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      TM.net.send({ type: 'answer', to: m.from, sdp: answer });
      setStatus('Соединение…');
    } catch (e) { console.warn(e); }
  }
  async function onAnswer(m) {
    if (!pc) return;
    try { await pc.setRemoteDescription(new RTCSessionDescription(m.sdp)); setStatus('Соединено'); startTimer(); } catch (e) { console.warn(e); }
  }
  async function onIce(m) { if (pc) { try { await pc.addIceCandidate(new RTCIceCandidate(m.candidate)); } catch (_) {} } }

  /* ---------- завершение ---------- */
  function hangup(silent) {
    if (active) TM.net.send({ type: 'hangup', to: active.peer, callId: active.callId });
    cleanup();
    if (callUI) { callUI.close(); callUI = null; }
    if (!silent) ui.toast('Звонок завершён');
  }
  function cleanup() {
    clearInterval(callTimer); callTimer = null;
    clearTimeout(ringTimer); ringTimer = null;
    TM.notify.stopRing();
    if (pc) { try { pc.close(); } catch (_) {} pc = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (active && active.started) {
      const st = S.store();
      if (st.calls[0] && st.calls[0].user === active.peer) st.calls[0].duration = Math.floor((Date.now() - active.started) / 1000);
      S.save();
    }
    active = null;
  }

  /* ---------- сеть ---------- */
  function bindNet() {
    TM.net.on('call', m => { incoming(m); });
    TM.net.on('accept', m => { if (active && m.from === active.peer && active.direction === 'out') beginCaller(); });
    TM.net.on('offer', m => { if (active && m.from === active.peer) onOffer(m); });
    TM.net.on('answer', m => { if (active && m.from === active.peer) onAnswer(m); });
    TM.net.on('ice', m => { if (active && m.from === active.peer) onIce(m); });
    TM.net.on('hangup', m => {
      if (active && m.from === active.peer) {
        ui.toast('Собеседник завершил звонок');
        cleanup();
        if (callUI) { callUI.close(); callUI = null; }
        return;
      }
      // отменили вызов до ответа — закрываем экран входящего
      if (pendingIncoming && pendingIncoming.from === m.from) {
        const pi = pendingIncoming;
        pendingIncoming = null;
        TM.notify.stopRing();
        try { pi.close(); } catch (_) {}
        ui.toast('Звонок отменён');
      }
    });
    TM.net.on('reject', m => {
      if (active && m.from === active.peer) {
        ui.toast('Звонок отклонён');
        cleanup();
        if (callUI) { callUI.close(); callUI = null; }
        return;
      }
      if (pendingIncoming && pendingIncoming.from === m.from) {
        const pi = pendingIncoming;
        pendingIncoming = null;
        TM.notify.stopRing();
        try { pi.close(); } catch (_) {}
      }
    });
  }

  function isRinging() { return !!pendingIncoming || !!(active && active.direction === 'in' && !active.started); }

  return { render, bindNet, start, isRinging };
})();
