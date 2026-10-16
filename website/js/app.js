/* ============================================================
 * TeleMAX Web — app.js
 * Оболочка приложения: нижняя навигация (Чаты/Звонки/Контакты/
 * Настройки), переключение вкладок, бейджи, инициализация.
 * ============================================================ */
window.TM = window.TM || {};

TM.app = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  let tab = 'chats';
  let shellBuilt = false;

  const TABS = [
    { id: 'chats', label: 'Чаты', icon: 'chats' },
    { id: 'calls', label: 'Звонки', icon: 'calls' },
    { id: 'contacts', label: 'Контакты', icon: 'contacts' },
    { id: 'settings', label: 'Настройки', icon: 'settings' }
  ];

  function buildShell() {
    const root = U.$('#app');
    root.innerHTML = '';
    root.classList.add('show');
    U.$('#auth').classList.remove('show');

    const shell = U.el('div', 'shell');

    const top = U.el('div', 'netbar');
    top.id = 'netbar';
    top.textContent = 'Офлайн-режим — сообщения сохраняются на устройстве';
    shell.appendChild(top);

    const content = U.el('div', 'tab-content');
    content.id = 'tab-content';
    shell.appendChild(content);

    /* правая область на широких экранах (desktop.css): обои как в MAX web */
    const pane = U.el('div', 'desk-pane');
    pane.id = 'desk-pane';
    pane.innerHTML = '<div class="desk-hint">Выберите чат</div>';
    shell.appendChild(pane);

    const nav = U.el('nav', 'tabbar');
    nav.id = 'tabbar';
    TABS.forEach(t => {
      const b = U.el('button', 'tab' + (tab === t.id ? ' active' : ''));
      b.dataset.tab = t.id;
      b.innerHTML = ui.icon(t.icon) + '<span>' + t.label + '</span>' + (t.id === 'chats' ? '<i class="tab-badge" id="tab-badge"></i>' : '');
      b.onclick = () => selectTab(t.id);
      nav.appendChild(b);
    });
    shell.appendChild(nav);

    root.appendChild(shell);
    shellBuilt = true;
    applyPrefs();
    selectTab(tab);
    ui.updateNetStatus();
    updateTabBadge();
  }

  function applyPrefs() {
    try {
      const st = S.store().settings;
      if (st && st.accent) document.documentElement.style.setProperty('--accent', st.accent);
      if (st && st.animations === false) document.body.classList.add('no-anim');
      else document.body.classList.remove('no-anim');
    } catch (_) {}
  }

  function selectTab(id) {
    tab = id;
    const content = U.$('#tab-content');
    if (!content) return;
    U.$$('.tab', U.$('#tabbar')).forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    content.scrollTop = 0;
    if (id === 'chats') TM.chats.render(content);
    else if (id === 'calls') TM.calls.render(content);
    else if (id === 'contacts') { TM.contacts.render(content); if (TM.net.isOn()) TM.net.send({ type: 'contacts_get' }); }
    else if (id === 'settings') TM.settings.render(content);
    updateTabBadge();
  }

  function updateTabBadge() {
    const b = U.$('#tab-badge');
    if (!b) return;
    const n = S.totalUnread();
    b.textContent = n > 99 ? '99+' : n;
    b.classList.toggle('show', n > 0);
  }

  function refreshTab() { selectTab(tab); }

  /* ---------- инициализация ---------- */
  function init() {
    applyPrefs();
    // регистрируем сетевые обработчики всех модулей
    TM.chats.bindNet();
    TM.chat.bindNet();
    TM.calls.bindNet();
    TM.contacts.bindNet();
    TM.wallet.bindNet();
    TM.gifts.bindNet();
    TM.cloud.bindNet();
    TM.admin.bindNet();
    TM.settings.bindNet();
    TM.notify.bind();

    // глобальные события
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') ui.popScreen();
    });
    window.addEventListener('online', () => { ui.updateNetStatus(); });
    window.addEventListener('offline', () => { ui.updateNetStatus(); });

    // приветственный сплэш и запуск авторизации
    TM.auth.boot();
  }

  return { buildShell, selectTab, updateTabBadge, refreshTab, init, get tab() { return tab; } };
})();

document.addEventListener('DOMContentLoaded', () => {
  TM.app.init();
});
