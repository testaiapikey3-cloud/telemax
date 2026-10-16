/* TeleMAX — стикеры: статические и анимированные (GIF/WebP), свои паки: создать / импорт / экспорт */
'use strict';
TM.stickers = (function () {
  const U = TM.util, ui = TM.ui, S = TM.state;
  const svg = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

  /* встроенный пак TeleMAX (рисуем сами, ничего не грузим) */
  const BUILTIN = [
    svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 87C21 67 9 50 9 34 9 21 19 11 31 11c8 0 15 4 19 11 4-7 11-11 19-11 12 0 22 10 22 23 0 16-12 33-41 53z" fill="#ff4757"/><path d="M30 22c-6 1-11 6-11 12" stroke="#ff8a94" stroke-width="5" fill="none" stroke-linecap="round"/></svg>'),
    svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#ffd93b"/><circle cx="36" cy="42" r="5.5" fill="#4a3418"/><circle cx="64" cy="42" r="5.5" fill="#4a3418"/><path d="M31 59a22 22 0 0 0 38 0" stroke="#4a3418" stroke-width="6" fill="none" stroke-linecap="round"/></svg>'),
    svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 6l12.6 25.6 28.4 3.9L70 56.4 75.2 85 50 71.4 24.8 85 30 56.4 9 35.5l28.4-3.9z" fill="#ffc107" stroke="#f0a30a" stroke-width="3" stroke-linejoin="round"/></svg>'),
    svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 5c5 20 26 25 26 47a26 26 0 0 1-52 0C24 31 43 27 50 5z" fill="#ff7043"/><path d="M50 38c2.5 10 13 14 13 26a13 13 0 0 1-26 0c0-11 8-16 13-26z" fill="#ffd54f"/></svg>'),
    svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 8C32 8 19 21 19 40v46l11-9 10 9 10-9 10 9 11-9 10 9V40C81 21 68 8 50 8z" fill="#eef0fa"/><circle cx="39" cy="40" r="5.5" fill="#3949ab"/><circle cx="61" cy="40" r="5.5" fill="#3949ab"/></svg>'),
    svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M58 4 18 58h23l-7 38 44-58H55z" fill="#40c4ff" stroke="#0288d1" stroke-width="3" stroke-linejoin="round"/></svg>'),
    svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 10a40 40 0 1 0 0 80 32 32 0 1 1 0-80z" fill="#ffca28"/><circle cx="63" cy="36" r="3.5" fill="#f9a825"/><circle cx="70" cy="54" r="2.5" fill="#f9a825"/></svg>'),
    svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#26de81"/><path d="M32 51l13 13 24-27" stroke="#ffffff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>')
  ];

  function packs() {
    const st = S.store();
    if (!st.stickerPacks || !st.stickerPacks.length) {
      st.stickerPacks = [{ id: 'telemax', name: 'TeleMAX', builtin: true, stickers: BUILTIN.map(uri => ({ uri })) }];
      st.stickerActive = 'telemax';
    }
    return st.stickerPacks;
  }

  function activePack() {
    const st = S.store(), ps = packs();
    return ps.find(p => p.id === st.stickerActive) || ps[0];
  }

  function pToast(text) {
    const t = U.el('div', 'stk-progress', U.esc(text));
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    return {
      set: s => { t.textContent = s; },
      close: () => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }
    };
  }

  let back = null, curChat = null;

  function close() {
    if (!back) return;
    const b = back; back = null; curChat = null;
    b.classList.remove('show');
    setTimeout(() => { if (b.parentNode) b.remove(); }, 220);
  }

  function open(chat) {
    if (back && curChat === chat) { close(); return; }
    if (back) close();
    curChat = chat;
    back = U.el('div', 'stk-back');
    back.appendChild(U.el('div', 'stk-panel'));
    back.onclick = e => { if (e.target === back) close(); };
    document.body.appendChild(back);
    draw();
    requestAnimationFrame(() => back && back.classList.add('show'));
  }

  function draw() {
    if (!back) return;
    const p = back.querySelector('.stk-panel');
    if (!p) return;
    p.innerHTML = '';
    const ps = packs();
    const ap = activePack();

    const head = U.el('div', 'stk-head');
    head.appendChild(U.el('div', 'stk-title', U.esc(ap.name)));
    const acts = U.el('div', 'stk-acts');
    const bMore = U.el('button', 'stk-icon', '⋯');
    bMore.title = 'Действия с паком';
    bMore.onclick = () => packMenu(ap);
    const bClose = U.el('button', 'stk-icon', '✕');
    bClose.title = 'Закрыть';
    bClose.onclick = close;
    acts.appendChild(bMore);
    acts.appendChild(bClose);
    head.appendChild(acts);
    p.appendChild(head);

    const grid = U.el('div', 'stk-grid');
    if (!ap.stickers.length) {
      grid.appendChild(U.el('div', 'stk-empty', 'Пак пуст — нажмите «+» внизу, чтобы добавить стикеры'));
    }
    ap.stickers.forEach((st, i) => {
      const it = U.el('div', 'stk-item');
      const img = U.el('img', 'stk-img');
      img.src = U.safeUrl(st.uri);
      img.alt = 'стикер';
      img.loading = 'lazy';
      it.appendChild(img);
      it.onclick = () => send(curChat, st);
      let holdT = null;
      it.addEventListener('pointerdown', () => {
        holdT = setTimeout(() => { holdT = null; stickerMenu(ap, i); }, 550);
      });
      const cancel = () => { if (holdT) { clearTimeout(holdT); holdT = null; } };
      it.addEventListener('pointerup', cancel);
      it.addEventListener('pointerleave', cancel);
      it.addEventListener('contextmenu', e => { e.preventDefault(); stickerMenu(ap, i); });
      grid.appendChild(it);
    });
    p.appendChild(grid);

    const tabs = U.el('div', 'stk-tabs');
    ps.forEach(pk => {
      const tb = U.el('button', 'stk-tab' + (pk.id === ap.id ? ' active' : ''), U.esc(pk.name));
      tb.onclick = () => { S.store().stickerActive = pk.id; S.save(); draw(); };
      tabs.appendChild(tb);
    });
    const add = U.el('button', 'stk-tab stk-add', '+');
    add.title = 'Новый пак';
    add.onclick = createPack;
    tabs.appendChild(add);
    p.appendChild(tabs);
  }

  function send(chat, st) {
    if (!chat || !st || !st.uri) return;
    TM.chat.sendMessage(chat, { type: 'sticker', uri: st.uri });
  }

  function packMenu(ap) {
    const items = [
      { icon: 'plus', label: 'Добавить стикеры', sub: 'Картинки, GIF или анимированные WebP', onClick: () => addStickers(ap) },
      { icon: 'download', label: 'Поделиться паком', sub: 'Сохранить файл .json', onClick: () => exportPack(ap) },
      { icon: 'upload', label: 'Импорт пака', sub: 'Загрузить файл .json', onClick: importPack }
    ];
    if (!ap.builtin) {
      items.push({
        icon: 'trash', label: 'Удалить пак', danger: true, onClick: () => {
          ui.confirm('Удалить пак?', '«' + ap.name + '» будет удалён с этого устройства', 'Удалить').then(ok => {
            if (!ok) return;
            const st = S.store();
            st.stickerPacks = packs().filter(x => x.id !== ap.id);
            if (!st.stickerPacks.length) delete st.stickerPacks;
            st.stickerActive = (packs()[0] || {}).id || '';
            S.save();
            draw();
          });
        }
      });
    }
    ui.sheet({ title: ap.name, items });
  }

  function stickerMenu(ap, i) {
    const st = ap.stickers[i];
    if (!st) return;
    const items = [{ icon: 'forward', label: 'Отправить', onClick: () => send(curChat, st) }];
    if (!ap.builtin) {
      items.push({
        icon: 'trash', label: 'Удалить стикер', danger: true, onClick: () => {
          ap.stickers.splice(i, 1);
          S.save();
          draw();
        }
      });
    }
    ui.sheet({ title: 'Стикер', items });
  }

  function createPack() {
    ui.form('Новый стикер-пак', [{ key: 'name', label: 'Название', placeholder: 'Например: Мои коты', maxlength: 30 }], 'Далее').then(v => {
      const name = String((v && v.name) || '').trim();
      if (!name) return;
      const pack = { id: 'p' + Date.now().toString(36), name: name.slice(0, 30), stickers: [] };
      packs().push(pack);
      S.store().stickerActive = pack.id;
      S.save();
      draw();
      addStickers(pack);
    });
  }

  function addStickers(pack) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*,.gif,.webp,.png,.jpg,.jpeg';
    inp.multiple = true;
    inp.onchange = async () => {
      const files = Array.from(inp.files || []).slice(0, 30);
      if (!files.length) return;
      const t = pToast('Стикеры: загрузка 0/' + files.length);
      let ok = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          let uri = '';
          if (TM.net.isOn()) {
            const r = await TM.net.upload(f, S.s.user, pct => t.set('Стикеры ' + (i + 1) + '/' + files.length + ' — ' + pct + '%'));
            uri = r.localUrl || r.url;
          } else if (f.size <= 512 * 1024) {
            uri = await U.readFile(f);
          } else {
            ui.toast('Офлайн: «' + f.name + '» больше 512 КБ — пропущен', 'warn');
            continue;
          }
          if (!uri) continue;
          pack.stickers.push({ uri });
          ok++;
        } catch (e) { /* сбойный файл пропускаем */ }
      }
      t.close();
      S.save();
      ui.toast(ok ? ('Добавлено стикеров: ' + ok) : 'Не удалось добавить стикеры', ok ? '' : 'err');
      draw();
    };
    inp.click();
  }

  function exportPack(pack) {
    const data = JSON.stringify({ telemax: 'stickers', v: 1, name: pack.name, stickers: pack.stickers.map(s => s.uri) });
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
    a.download = 'stickers_' + (pack.name.replace(/[^\wа-яё\-]+/gi, '_') || 'pack').slice(0, 30) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    ui.toast('Файл пака сохранён — можно отправить другу');
  }

  function importPack() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = (inp.files || [])[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        let j = null;
        try { j = JSON.parse(String(fr.result)); } catch (e) { j = null; }
        const list = j && Array.isArray(j.stickers) ? j.stickers : null;
        if (!list || !list.length) { ui.toast('Это не файл стикер-пака', 'err'); return; }
        const stickers = list.slice(0, 200)
          .map(s => ({ uri: String(typeof s === 'string' ? s : (s && s.uri) || '') }))
          .filter(s => /^(https?:|data:image\/|\/uploads\/)/i.test(s.uri));
        if (!stickers.length) { ui.toast('В паке нет подходящих стикеров', 'err'); return; }
        const pack = { id: 'p' + Date.now().toString(36), name: String(j.name || 'Импорт').slice(0, 30), stickers };
        packs().push(pack);
        S.store().stickerActive = pack.id;
        S.save();
        ui.toast('Пак «' + pack.name + '» добавлен');
        draw();
      };
      fr.readAsText(f);
    };
    inp.click();
  }

  return { open: open, close: close };
})();
