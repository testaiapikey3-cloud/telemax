/* ============================================================
 * TeleMAX Web — ui.js
 * Иконки, тосты, модальные окна, нижние шторки, стек экранов.
 * ============================================================ */
window.TM = window.TM || {};

TM.ui = (function () {
  'use strict';
  const U = TM.util;

  /* ---------- SVG-иконки ---------- */
  const ICONS = {
    chats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L4 21l1.5-4.6A8.5 8.5 0 1 1 21 12z"/></svg>',
    calls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>',
    contacts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M15.5 3.3a4 4 0 0 1 0 7.4"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    attach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3.4 20.4 20.85 12 3.4 3.6l.01 6.53L15 12 3.41 13.87z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.35-4.35a2 2 0 0 0-2.83 0L4 20"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="13" height="12" rx="3"/><path d="m15 10 5.2-2.6a.7.7 0 0 1 1 .6v8a.7.7 0 0 1-1 .6L15 14"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/><path d="M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5zM12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1z"/></svg>',
    verified: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5 14.8 4l3.7-.3 1 3.6 3.2 1.9-1.4 3.4 1.4 3.4-3.2 1.9-1 3.6-3.7-.3L12 22.5 9.2 20l-3.7.3-1-3.6L1.3 14.8 2.7 11.4 1.3 8l3.2-1.9 1-3.6L9.2 2zM10.8 15.6l5.9-5.9-1.4-1.4-4.5 4.5-2-2-1.4 1.4z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4.5"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 .4-9A6.5 6.5 0 0 0 5.3 8.6 4.5 4.5 0 0 0 6 17.5z"/><path d="M12 13v6M9.5 15.5 12 13l2.5 2.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3-3.5 3H16a2 2 0 0 0-2 2c0 .6.2 1 .5 1.5a2.5 2.5 0 0 1-2.5 3.5z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="11.5" r="1"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="15" rx="3"/><path d="M2 10h20"/><circle cx="17" cy="15" r="1.2" fill="currentColor" stroke="none"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.1 9.3a2.9 2.9 0 0 1 5.6.7c0 1.9-2.7 2.2-2.7 3.7"/><path d="M12 16.8h.01"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 4.5v15l13-7.5z"/></svg>',
    smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.2 14.3a4.8 4.8 0 0 0 7.6 0"/><circle cx="9" cy="9.7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.7" r="1" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v12"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    poll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 14-5-5 5-5"/><path d="M20 20v-4a7 7 0 0 0-7-7H4"/></svg>',
    forward: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M4 20v-4a7 7 0 0 1 7-7h9"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 7.7-7.7M14 5.5 18.5 10M18 7l3 3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/></svg>',
    plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 17 5 5M9 4l11 11-5 1-4 4-2-6-5-2 4-4z"/></svg>'
  };
  function icon(name, cls) {
    return '<span class="ic ' + (cls || '') + '">' + (ICONS[name] || ICONS.info) + '</span>';
  }

  /* ---------- toast ---------- */
  function toast(text, kind) {
    let box = U.$('#toasts');
    if (!box) { box = U.el('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = U.el('div', 'toast ' + (kind || ''), U.esc(text));
    box.appendChild(t);
    setTimeout(() => t.classList.add('show'), 15);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  /* ---------- modal ---------- */
  function modal(opts) {
    return new Promise(resolve => {
      const back = U.el('div', 'modal-back');
      const box = U.el('div', 'modal');
      if (opts.title) box.appendChild(U.el('div', 'modal-title', U.esc(opts.title)));
      if (opts.text) box.appendChild(U.el('div', 'modal-text', U.esc(opts.text)));
      if (opts.body) {
        const b = U.el('div', 'modal-body');
        if (typeof opts.body === 'string') b.innerHTML = opts.body;
        else b.appendChild(opts.body);
        box.appendChild(b);
      }
      const actions = U.el('div', 'modal-actions');
      const acts = opts.actions && opts.actions.length ? opts.actions : [{ label: 'OK', primary: true, close: true }];
      acts.forEach(a => {
        const btn = U.el('button', 'btn ' + (a.primary ? 'btn-primary' : 'btn-ghost') + (a.danger ? ' btn-danger' : ''), U.esc(a.label));
        btn.onclick = () => {
          const r = a.onClick ? a.onClick() : undefined;
          if (r === false) return;
          close();
          resolve(r !== undefined ? r : (a.value !== undefined ? a.value : true));
        };
        actions.appendChild(btn);
      });
      box.appendChild(actions);
      back.appendChild(box);
      back.onclick = e => { if (e.target === back && opts.dismissable !== false) { close(); resolve(null); } };
      document.body.appendChild(back);
      requestAnimationFrame(() => back.classList.add('show'));
      function close() {
        back.classList.remove('show');
        setTimeout(() => back.remove(), 220);
      }
      box._close = close;
      if (opts.onRender) opts.onRender(box, close);
    });
  }

  function confirm(title, text, okLabel) {
    return modal({
      title, text,
      actions: [
        { label: okLabel || 'ОК', primary: true, value: true },
        { label: 'Отмена', value: false }
      ]
    }).then(v => v === true);
  }

  /* ---------- форма ---------- */
  function form(title, fields, okLabel) {
    const body = U.el('div', 'form');
    fields.forEach(f => {
      const wrap = U.el('div', 'form-row');
      if (f.label) wrap.appendChild(U.el('label', 'form-label', U.esc(f.label)));
      const input = U.el(f.multiline ? 'textarea' : 'input', 'form-input');
      if (!f.multiline) input.type = f.type || 'text';
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.value != null) input.value = f.value;
      if (f.maxlength) input.maxLength = f.maxlength;
      wrap.appendChild(input);
      if (f.hint) wrap.appendChild(U.el('div', 'form-hint', U.esc(f.hint)));
      body.appendChild(wrap);
      f._input = input;
    });
    return modal({
      title, body,
      actions: [
        {
          label: okLabel || 'Готово', primary: true,
          onClick: () => {
            const out = {};
            for (const f of fields) out[f.key] = f._input.value;
            return out;
          }
        },
        { label: 'Отмена', value: null }
      ]
    }).then(v => (v && typeof v === 'object') ? v : null);
  }

  /* ---------- нижняя шторка ---------- */
  function sheet(opts) {
    const back = U.el('div', 'sheet-back');
    const sh = U.el('div', 'sheet');
    if (opts.title) sh.appendChild(U.el('div', 'sheet-title', U.esc(opts.title)));
    if (typeof opts.top === 'function') { const t = opts.top(close); if (t) sh.appendChild(t); }
    else if (opts.top) sh.appendChild(opts.top);
    (opts.items || []).forEach(it => {
      if (it.header) { sh.appendChild(U.el('div', 'sheet-header', U.esc(it.header))); return; }
      const row = U.el('div', 'sheet-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : ''));
      row.innerHTML = (it.icon ? icon(it.icon) : '') + '<span class="sheet-label">' + U.esc(it.label) + '</span>' + (it.sub ? '<span class="sheet-sub">' + U.esc(it.sub) + '</span>' : '') + (it.active ? icon('check') : '');
      row.onclick = () => { close(); it.onClick && it.onClick(); };
      sh.appendChild(row);
    });
    const cancel = U.el('div', 'sheet-item sheet-cancel', 'Отмена');
    cancel.onclick = close;
    sh.appendChild(cancel);
    back.appendChild(sh);
    back.onclick = e => { if (e.target === back) close(); };
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('show'));
    function close() { back.classList.remove('show'); setTimeout(() => back.remove(), 200); }
  }

  /* ---------- стек экранов ---------- */
  const stack = [];
  function pushScreen(nodeOrFn, opts) {
    opts = opts || {};
    const node = U.el('div', 'screen' + (opts.cls ? ' ' + opts.cls : ''));
    const host = U.$('#stack');
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    const handle = {
      node,
      close() {
        node.classList.remove('show');
        const i = stack.indexOf(handle);
        if (i >= 0) stack.splice(i, 1);
        setTimeout(() => node.remove(), 260);
        if (opts.onClose) opts.onClose();
      }
    };
    stack.push(handle);
    if (typeof nodeOrFn === 'function') nodeOrFn(node, handle); else node.appendChild(nodeOrFn);
    return handle;
  }
  function popScreen() { const h = stack[stack.length - 1]; if (h) { h.close(); return true; } return false; }
  function topScreen() { return stack[stack.length - 1] || null; }

  /* ---------- бейдж сети ---------- */
  function updateNetStatus() {
    const bar = U.$('#netbar');
    if (!bar) return;
    if (TM.state.s.wsOn) bar.classList.remove('show');
    else bar.classList.add('show');
  }

  /* ---------- аватар ---------- */
  function avatarHTML(name, avatarUrl, online, size) {
    const initial = String(name || '?').trim().charAt(0).toUpperCase() || '?';
    const cls = 'avatar' + (size ? ' av-' + size : '');
    if (avatarUrl) {
      return '<span class="' + cls + '" style="background-image:url(' + U.esc(U.safeUrl(avatarUrl)) + ')">' + (online ? '<i class="on-dot"></i>' : '') + '</span>';
    }
    const hue = hashHue(String(name || ''));
    return '<span class="' + cls + '" style="background:linear-gradient(135deg,hsl(' + hue + ',70%,45%),hsl(' + ((hue + 40) % 360) + ',80%,30%))"><b>' + U.esc(initial) + '</b>' + (online ? '<i class="on-dot"></i>' : '') + '</span>';
  }
  function hashHue(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return (h + 30) % 360;
  }
  function verifiedBadge(user, cls) {
    const badge = t => '<span class="vbadge ' + (cls || '') + '" title="' + t + '">' + icon('verified') + '</span>';
    // поддерживаются и объекты чатов (каналы/группы/боты), и просто @username
    if (user && typeof user === 'object') {
      const ch = user;
      if (ch.verified) return badge(ch.kind === 'channel' ? 'Верифицированный канал' : ch.kind === 'group' ? 'Верифицированная группа' : 'Верифицирован');
      if (ch.kind === 'private' && ch.username) return verifiedBadge(ch.username, cls);
      const gid = String(ch.id || '').replace(/^g_/, '');
      const g = TM.state.s.groups && TM.state.s.groups[gid];
      if (g && g.verified) return badge(g.type === 'channel' ? 'Верифицированный канал' : 'Верифицированная группа');
      return '';
    }
    const u = String(user || '').toLowerCase();
    if (!u) return '';
    try {
      const p = TM.state.profileOf(u);
      if (p && p.verified) return badge('Верифицирован');
      const c = TM.state.s.contacts && TM.state.s.contacts[u];
      if (c && c.verified) return badge('Верифицирован');
    } catch (_) {}
    const vb = TM.config && TM.config.VERIFIED_BOTS;
    if (vb && vb[u]) return badge('Официальный бот');
    return '';
  }

  return { icon, ICONS, toast, modal, confirm, form, sheet, pushScreen, popScreen, topScreen, updateNetStatus, avatarHTML, verifiedBadge };
})();
