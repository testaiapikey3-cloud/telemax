/* ============================================================
 * TeleMAX Web — cloud.js
 * Облачное хранилище: канал clstXXXXX, загрузка/скачивание файлов,
 * размер хранилища.
 * ============================================================ */
window.TM = window.TM || {};

TM.cloud = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  function channelId() {
    const st = S.store();
    return st.cloudChannel || '';
  }

  function ensureChannel() {
    let id = channelId();
    if (id && S.getChat(id)) return id;
    const num = String(Math.floor(1000 + Math.random() * 9000));
    const name = 'Облачное хранилище • clst' + num;
    id = 'g_cl' + num;
    S.s.groups['cl' + num] = { id: 'cl' + num, name: 'clst' + num, type: 'channel', owner: S.s.user, members: [S.s.user], createdAt: Date.now() };
    S.createChat({ id, kind: 'channel', name, owner: S.s.user, members: [S.s.user] });
    S.store().cloudChannel = id;
    S.save();
    ui.toast('Канал clst' + num + ' создан');
    return id;
  }

  function open() {
    ui.pushScreen((node, handle) => {
      node.classList.add('sub-screen');
      node.innerHTML = '<div class="scr-head"><button class="icon-btn" id="c-back">' + ui.icon('back') + '</button><div class="scr-title">Облачное хранилище</div></div>';

      const info = U.el('div', 'cloud-card');
      const files = (S.s.account && S.s.account.cloud) || [];
      const total = files.reduce((n, f) => n + (f.size || 0), 0);
      const cid = channelId();
      info.innerHTML =
        '<div class="cloud-ic">' + ui.icon('cloud') + '</div>' +
        '<div class="cloud-title">Ваше облачное хранилище</div>' +
        '<div class="cloud-sub">' + (cid && S.getChat(cid) ? U.esc(S.getChat(cid).name) : 'Канал не создан') + '</div>' +
        '<div class="cloud-stat">' + files.length + ' файлов • ' + U.bytes(total) + '</div>';
      node.appendChild(info);

      if (cid && S.getChat(cid)) {
        const openCh = U.el('button', 'btn btn-primary btn-big', 'Открыть канал');
        openCh.onclick = () => { handle.close(); TM.chat.open(cid); };
        node.appendChild(openCh);
      } else {
        const create = U.el('button', 'btn btn-primary btn-big', 'Создать канал');
        create.onclick = () => { ensureChannel(); handle.close(); open(); };
        node.appendChild(create);
      }

      const up = U.el('button', 'btn btn-ghost btn-big', '＋  Загрузить файл');
      up.onclick = () => uploadFiles(handle);
      node.appendChild(up);

      node.appendChild(U.el('div', 'scr-sub', 'Файлы'));
      const list = U.el('div', 'cloud-files');
      if (!files.length) list.innerHTML = '<div class="dim pad">Пока пусто. Загрузите первый файл.</div>';
      files.forEach(f => {
        const row = U.el('div', 'cloud-row');
        row.innerHTML = ui.icon('file') +
          '<div class="ct-main"><b>' + U.esc(f.name) + '</b><span>' + U.bytes(f.size) + ' • ' + new Date(f.time).toLocaleDateString('ru-RU') + '</span></div>' +
          '<button class="icon-btn dl" title="Скачать">' + ui.icon('download') + '</button>' +
          '<button class="icon-btn rm" title="Удалить">' + ui.icon('trash') + '</button>';
        row.querySelector('.dl').onclick = () => {
          const a = document.createElement('a');
          a.href = f.url.startsWith('http') ? f.url : TM.net.httpBase() + f.url;
          a.download = f.name; a.target = '_blank'; a.click();
        };
        row.querySelector('.rm').onclick = async () => {
          if (!await ui.confirm('Удалить файл?', f.name)) return;
          if (S.s.account) S.s.account.cloud = files.filter(x => x.url !== f.url);
          S.saveAccount();
          TM.net.send({ type: 'cloud_delete', url: f.url });
          handle.close(); open();
        };
        list.appendChild(row);
      });
      node.appendChild(list);
      node.querySelector('#c-back').onclick = () => handle.close();
    });
  }

  function uploadFiles(handle) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true;
    inp.onchange = async () => {
      const fl = Array.from(inp.files || []);
      if (!fl.length) return;
      if (!TM.net.isOn()) return ui.toast('Загрузка в облако требует подключения к серверу', 'err');
      for (const f of fl) {
        const t = TM.attach.showProgress(f.name);
        try {
          await TM.net.upload(f, S.s.user, p => t.update(p));
          t.close();
        } catch (e) { t.close(); ui.toast('Ошибка загрузки ' + f.name, 'err'); }
      }
      ui.toast('Загрузка завершена');
      if (handle) handle.close();
      open();
    };
    inp.click();
  }

  function bindNet() {
    TM.net.on('account_update', () => { /* список обновится при следующем открытии */ });
  }

  return { open, ensureChannel, bindNet };
})();
