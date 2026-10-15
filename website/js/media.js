/* ============================================================
 * TeleMAX Web — media.js
 * Полноэкранный просмотр фото: счётчик «N из M», эскизы, скачивание.
 * ============================================================ */
window.TM = window.TM || {};

TM.media = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;

  function openViewer(chat, msg) {
    const pics = chat.messages.filter(m => m.type === 'image');
    let idx = pics.findIndex(x => x.id === msg.id);
    if (idx < 0) idx = 0;

    const back = U.el('div', 'viewer-back');
    const head = U.el('div', 'viewer-head');
    const img = U.el('img', 'viewer-img');
    const thumbs = U.el('div', 'viewer-thumbs');

    function draw() {
      const m = pics[idx];
      img.src = U.safeUrl(m.uri);
      head.innerHTML = '<span>' + (idx + 1) + ' из ' + pics.length + '</span>' +
        '<div class="vh-actions">' +
          '<button class="icon-btn" id="v-dl">' + ui.icon('download') + '</button>' +
          '<button class="icon-btn" id="v-x">' + ui.icon('close') + '</button>' +
        '</div>';
      head.querySelector('#v-x').onclick = close;
      head.querySelector('#v-dl').onclick = () => { const a = document.createElement('a'); a.href = U.safeUrl(m.uri); a.download = 'photo.jpg'; a.target = '_blank'; a.click(); };
      thumbs.innerHTML = '';
      pics.forEach((p, i) => {
        const t = U.el('div', 'vt' + (i === idx ? ' active' : ''));
        t.style.backgroundImage = 'url(' + U.safeUrl(p.uri) + ')';
        t.onclick = () => { idx = i; draw(); };
        thumbs.appendChild(t);
      });
    }

    back.appendChild(head);
    back.appendChild(img);
    back.appendChild(thumbs);
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('show'));
    draw();

    img.onclick = e => { e.stopPropagation(); };
    back.onclick = e => { if (e.target === back) close(); };
    back.addEventListener('pointerdown', e => { back._x = e.clientX; });
    back.addEventListener('pointerup', e => {
      if (back._x == null) return;
      const dx = e.clientX - back._x;
      back._x = null;
      if (Math.abs(dx) < 40) return;
      idx = dx < 0 ? Math.min(pics.length - 1, idx + 1) : Math.max(0, idx - 1);
      draw();
    });
    function close() { back.classList.remove('show'); setTimeout(() => back.remove(), 220); }
  }

  return { openViewer };
})();
