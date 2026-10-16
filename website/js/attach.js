/* ============================================================
 * TeleMAX Web — attach.js
 * Выбор и отправка фото/видео/файлов, загрузка на сервер,
 * офлайн-fallback (хранение на устройстве), прогресс.
 * ============================================================ */
window.TM = window.TM || {};

TM.attach = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  function pick(chat, kind) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : '*/*';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      await uploadAndSend(chat, f, kind);
    };
    inp.click();
  }

  async function uploadAndSend(chat, file, kind, duration) {
    const type = kind === 'image' || kind === 'video' || kind === 'file' ? kind : 'file';
    if (TM.net.isOn()) {
      const t = showProgress(file.name);
      try {
        const r = await TM.net.upload(file, S.s.user, p => t.update(p));
        t.close();
        TM.chat.sendMessage(chat, { type, uri: r.url, fileName: r.name, fileSize: r.size, duration });
        S.store().analytics.mediaSent = (S.store().analytics.mediaSent || 0) + 1;
        S.save();
      } catch (e) {
        t.close();
        ui.toast('Ошибка загрузки: ' + (e.message || 'сеть'), 'err');
      }
      return;
    }
    // офлайн
    if (file.size <= TM.config.LIMITS.LOCAL_MEDIA_MAX) {
      const dataUrl = await U.readFile(file);
      TM.chat.sendMessage(chat, { type, uri: dataUrl, fileName: file.name, fileSize: file.size, duration });
      ui.toast('Офлайн: файл сохранён на устройстве', 'warn');
    } else {
      ui.modal({
        title: 'Офлайн-режим',
        text: 'Файл больше ' + U.bytes(TM.config.LIMITS.LOCAL_MEDIA_MAX) + '. Подключитесь к серверу, чтобы отправить его.',
        actions: [{ label: 'Понятно', primary: true }]
      });
    }
  }

  async function sendBlob(chat, blob, type, name, duration) {
    if (type === 'audio') return sendAudioBlob(chat, blob, duration);
    const file = new File([blob], (name || 'file') + '_' + Date.now() + '.bin', { type: blob.type || 'application/octet-stream' });
    return uploadAndSend(chat, file, type, duration);
  }

  async function sendAudioBlob(chat, blob, duration) {
    const file = new File([blob], 'voice_' + Date.now() + '.webm', { type: blob.type || 'audio/webm' });
    if (TM.net.isOn()) {
      const t = showProgress('Голосовое сообщение');
      try {
        const r = await TM.net.upload(file, S.s.user, p => t.update(p));
        t.close();
        TM.chat.sendMessage(chat, { type: 'audio', uri: r.url, fileName: r.name, fileSize: r.size, duration });
      } catch (e) { t.close(); ui.toast('Ошибка отправки голосового', 'err'); }
      return;
    }
    if (file.size <= TM.config.LIMITS.LOCAL_MEDIA_MAX) {
      const dataUrl = await U.readFile(file);
      TM.chat.sendMessage(chat, { type: 'audio', uri: dataUrl, fileName: file.name, fileSize: file.size, duration });
      ui.toast('Офлайн: голосовое сохранено', 'warn');
    } else {
      ui.toast('Голосовое слишком большое для офлайна', 'err');
    }
  }

  async function sendCircleBlob(chat, blob, duration) {
    const ext = /mp4/.test(blob.type || '') ? '.mp4' : '.webm';
    const file = new File([blob], 'circle_' + Date.now() + ext, { type: blob.type || 'video/webm' });
    if (TM.net.isOn()) {
      const t = showProgress('Видеокружок');
      try {
        const r = await TM.net.upload(file, S.s.user, p => t.update(p));
        t.close();
        TM.chat.sendMessage(chat, { type: 'video', circle: true, uri: r.url, fileName: r.name, fileSize: r.size, duration });
        S.store().analytics.mediaSent = (S.store().analytics.mediaSent || 0) + 1;
        S.save();
      } catch (e) { t.close(); ui.toast('Ошибка отправки кружка', 'err'); }
      return;
    }
    if (file.size <= TM.config.LIMITS.LOCAL_MEDIA_MAX) {
      const dataUrl = await U.readFile(file);
      TM.chat.sendMessage(chat, { type: 'video', circle: true, uri: dataUrl, fileName: file.name, fileSize: file.size, duration });
      ui.toast('Офлайн: кружок сохранён на устройстве', 'warn');
    } else {
      ui.toast('Кружок слишком большой для офлайна', 'err');
    }
  }

  /* мини-индикатор прогресса */
  function showProgress(name) {
    const box = U.el('div', 'upload-toast');
    box.innerHTML = '<div class="ut-name">' + U.esc(name || 'Файл') + '</div><div class="ut-bar"><i></i></div><div class="ut-pct">0%</div>';
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('show'));
    const bar = box.querySelector('.ut-bar i');
    const pct = box.querySelector('.ut-pct');
    return {
      update(p) { bar.style.width = p + '%'; pct.textContent = p + '%'; },
      close() { box.classList.remove('show'); setTimeout(() => box.remove(), 250); }
    };
  }

  return { pick, uploadAndSend, sendBlob, sendAudioBlob, sendCircleBlob, showProgress };
})();
