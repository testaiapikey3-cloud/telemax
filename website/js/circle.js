/* ============================================================
 * TeleMAX Web — circle.js
 * Видеокружки как в Telegram: запись с камеры в круг (до 60 сек),
 * переключение камеры, предпросмотр, пересъёмка и отправка.
 * ============================================================ */
window.TM = window.TM || {};

TM.circle = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;

  const MAX_SEC = 60;
  const RING_R = 47.5;
  const RING_C = 2 * Math.PI * RING_R;

  let ov = null;            // оверлей записи
  let videoEl = null, progEl = null, badgeEl = null, hintEl = null;
  let stream = null, recorder = null, chunks = [], recMime = '';
  let facing = 'user';
  let recStart = 0, raf = 0, mode = 'live';
  let blob = null, blobUrl = '', dur = 0;
  let chatRef = null, keyHandler = null;

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  function pickMime() {
    const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (let i = 0; i < cands.length; i++) { try { if (MediaRecorder.isTypeSupported(cands[i])) return cands[i]; } catch (_) {} }
    return '';
  }

  async function getStream(face) {
    const video = { facingMode: face, width: { ideal: 720 }, height: { ideal: 720 } };
    try { return await navigator.mediaDevices.getUserMedia({ video: video, audio: true }); }
    catch (e) {
      // камера есть, микрофона нет — снимаем без звука
      try { return await navigator.mediaDevices.getUserMedia({ video: video, audio: false }); }
      catch (e2) { return null; }
    }
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function setMode(m) {
    mode = m;
    if (!ov) return;
    ov.classList.toggle('vc-rec-mode', m === 'rec');
    ov.classList.toggle('vc-preview', m === 'preview');
    ov.classList.toggle('vc-live-mode', m === 'live');
  }

  async function record(chat) {
    if (ov) return;
    if (!supported()) return ui.toast('Запись с камеры не поддерживается браузером', 'err');
    chatRef = chat;
    facing = 'user';

    ov = U.el('div', 'vc-overlay vc-live-mode');
    ov.innerHTML =
      '<div class="vc-top">' +
        '<button class="icon-btn" id="vc-close" title="Закрыть">' + ui.icon('close') + '</button>' +
        '<div class="vc-title">Видеокружок</div>' +
        '<button class="icon-btn" id="vc-flip" title="Сменить камеру">' + ui.icon('refresh') + '</button>' +
      '</div>' +
      '<div class="vc-stage">' +
        '<div class="vc-circle">' +
          '<div class="vc-clip"><video id="vc-video" autoplay playsinline muted></video></div>' +
          '<svg class="vc-ring" viewBox="0 0 100 100">' +
            '<circle class="vc-ring-track" cx="50" cy="50" r="47.5"></circle>' +
            '<circle class="vc-ring-prog" id="vc-prog" cx="50" cy="50" r="47.5"></circle>' +
          '</svg>' +
          '<div class="vc-badge" id="vc-badge">0:00</div>' +
        '</div>' +
        '<div class="vc-hint" id="vc-hint">До 60 секунд</div>' +
      '</div>' +
      '<div class="vc-actions">' +
        '<button class="vc-side" id="vc-retake" title="Переснять">' + ui.icon('refresh') + '</button>' +
        '<button class="vc-rec" id="vc-rec" title="Записать"><i></i></button>' +
        '<button class="vc-side vc-send" id="vc-send" title="Отправить">' + ui.icon('send') + '</button>' +
      '</div>';
    document.body.appendChild(ov);

    videoEl = ov.querySelector('#vc-video');
    progEl = ov.querySelector('#vc-prog');
    badgeEl = ov.querySelector('#vc-badge');
    hintEl = ov.querySelector('#vc-hint');
    progEl.style.strokeDasharray = String(RING_C);
    progEl.style.strokeDashoffset = String(RING_C);

    ov.querySelector('#vc-close').onclick = () => close();
    ov.querySelector('#vc-flip').onclick = () => flip();
    ov.querySelector('#vc-rec').onclick = () => { if (mode === 'live') startRec(); else if (mode === 'rec') stopRec(); };
    ov.querySelector('#vc-retake').onclick = () => { if (mode === 'preview') backToLive(); };
    ov.querySelector('#vc-send').onclick = () => send();

    keyHandler = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', keyHandler);

    stream = await getStream(facing);
    if (!stream) { close(); return ui.toast('Нет доступа к камере — разрешите доступ в браузере', 'err'); }
    videoEl.srcObject = stream;
    videoEl.classList.add('mirror');
    videoEl.play().catch(() => {});
  }

  function startRec() {
    if (!stream || recorder) return;
    recMime = pickMime();
    try {
      recorder = new MediaRecorder(stream, recMime ? { mimeType: recMime, videoBitsPerSecond: 2500000, audioBitsPerSecond: 96000 } : undefined);
    } catch (e) { recorder = null; return ui.toast('Не удалось начать запись', 'err'); }
    chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = onStop;
    try { recorder.start(250); } catch (e) { recorder = null; return ui.toast('Не удалось начать запись', 'err'); }
    recStart = Date.now();
    setMode('rec');
    hintEl.textContent = 'Идёт запись — нажмите ■ чтобы остановить';
    tick();
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    const el = (Date.now() - recStart) / 1000;
    if (el >= MAX_SEC) { stopRec(); return; }
    progEl.style.strokeDashoffset = String(RING_C * (1 - el / MAX_SEC));
    badgeEl.textContent = fmt(el);
  }

  function stopRec() {
    if (!recorder) return;
    const rec = recorder; recorder = null;
    cancelAnimationFrame(raf); raf = 0;
    try { rec.stop(); } catch (_) {}
  }

  function onStop() {
    const d = (Date.now() - recStart) / 1000;
    if (!chunks.length) { backToLive(); return; }
    blob = new Blob(chunks, { type: recMime ? recMime.split(';')[0] : 'video/webm' });
    if (d < 1) { blob = null; ui.toast('Слишком коротко'); backToLive(); return; }
    dur = d;
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (_) {} }
    blobUrl = URL.createObjectURL(blob);
    videoEl.srcObject = null;
    videoEl.loop = true;
    videoEl.src = blobUrl;
    videoEl.muted = true;
    videoEl.play().catch(() => {});
    progEl.style.strokeDashoffset = '0';
    badgeEl.textContent = fmt(d);
    hintEl.textContent = 'Предпросмотр';
    setMode('preview');
  }

  function backToLive() {
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (_) {} blobUrl = ''; }
    blob = null; chunks = [];
    videoEl.loop = false;
    videoEl.removeAttribute('src');
    try { videoEl.load(); } catch (_) {}
    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.play().catch(() => {});
    progEl.style.strokeDashoffset = String(RING_C);
    badgeEl.textContent = '0:00';
    hintEl.textContent = 'До 60 секунд';
    setMode('live');
  }

  async function flip() {
    if (mode !== 'live') return;
    facing = facing === 'user' ? 'environment' : 'user';
    const ns = await getStream(facing);
    if (!ns) { ui.toast('Не удалось переключить камеру', 'err'); return; }
    if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch (_) {} }
    stream = ns;
    videoEl.srcObject = stream;
    videoEl.classList.toggle('mirror', facing === 'user');
    videoEl.play().catch(() => {});
  }

  async function send() {
    if (!blob) return;
    const b = blob, d = dur, ch = chatRef;
    close();
    await TM.attach.sendCircleBlob(ch, b, d);
  }

  function close() {
    cancelAnimationFrame(raf); raf = 0;
    if (keyHandler) { try { window.removeEventListener('keydown', keyHandler); } catch (_) {} keyHandler = null; }
    if (recorder) { try { recorder.onstop = null; recorder.stop(); } catch (_) {} recorder = null; }
    if (stream) { try { stream.getTracks().forEach(t => t.stop()); } catch (_) {} stream = null; }
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (_) {} blobUrl = ''; }
    blob = null; chunks = []; dur = 0;
    if (ov) { ov.remove(); ov = null; }
    videoEl = progEl = badgeEl = hintEl = null;
    chatRef = null;
  }

  return { record, supported };
})();
