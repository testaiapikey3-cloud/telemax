/* ============================================================
 * TeleMAX Web — gifts.js
 * Подарки и NFT: каталог (цены как на макете), отправка в чат,
 * NFT-инвентарь, TelePremium-подарок (499 TC).
 * ============================================================ */
window.TM = window.TM || {};

TM.gifts = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  let tab = 'gifts';

  function openCatalog(chat) {
    ui.pushScreen((node, handle) => {
      node.classList.add('sub-screen');
      node.innerHTML = '<div class="scr-head"><button class="icon-btn" id="g-back">' + ui.icon('back') + '</button><div class="scr-title">' + (chat ? 'Подарить: ' + U.esc(chat.name || chat.username) : 'Подарки и NFT') + '</div></div>';
      const tabs = U.el('div', 'ch-tabs');
      [['gifts', 'Подарки'], ['nft', 'NFT'], ['collections', 'Коллекции']].forEach(([id, label]) => {
        const t = U.el('button', 'chip' + (tab === id ? ' active' : ''), label);
        t.onclick = () => { tab = id; handle.close(); openCatalog(chat); };
        tabs.appendChild(t);
      });
      node.appendChild(tabs);

      const grid = U.el('div', 'gift-grid');
      if (tab === 'gifts') {
        TM.config.GIFTS.filter(g => !g.nft).forEach(g => grid.appendChild(giftCard(g, chat)));
        const prem = U.el('div', 'gift-card prem');
        prem.innerHTML = '<div class="g-emoji">⭐</div><div class="g-name">TelePremium</div><div class="g-price">' + TM.config.PREMIUM_PRICE + ' TC • 30 дней</div>';
        prem.onclick = () => chat ? sendPremiumFlow(chat) : ui.toast('Откройте каталог из чата, чтобы отправить');
        grid.appendChild(prem);
      } else if (tab === 'nft') {
        const my = (S.s.account && S.s.account.nft) || [];
        if (my.length) {
          node.appendChild(U.el('div', 'scr-sub', 'Мои NFT (' + my.length + ')'));
          const mg = U.el('div', 'gift-grid');
          my.forEach(item => {
            const parts = String(item).split('|');
            const card = U.el('div', 'gift-card nft');
            card.innerHTML = '<div class="g-emoji">' + nftEmoji(parts[0]) + '</div><div class="g-name">' + U.esc(parts[0]) + '</div><div class="g-price">NFT • в инвентаре</div>';
            card.onclick = () => chat ? sendNftItem(chat, item) : ui.toast('Откройте каталог из чата, чтобы подарить');
            mg.appendChild(card);
          });
          node.appendChild(mg);
        }
        node.appendChild(U.el('div', 'scr-sub', 'Каталог NFT'));
        const cg = U.el('div', 'gift-grid');
        TM.config.GIFTS.filter(g => g.nft).forEach(g => {
          const card = giftCard(g, chat, true);
          cg.appendChild(card);
        });
        node.appendChild(cg);
        if (!my.length) node.appendChild(U.el('div', 'dim pad', 'NFT выдаются администратором в Admin Mode.'));
      } else {
        const coll = U.el('div', 'coll-list');
        coll.innerHTML =
          '<div class="coll-card"><b>Классика</b><span>❤️ 👑 💎 🧸 🌹 💠</span></div>' +
          '<div class="coll-card"><b>Животные</b><span>🦄 🐱 🐼 🐸</span></div>' +
          '<div class="coll-card prem"><b>TeleMAX Premium</b><span>Эксклюзивная коллекция для Premium-подписчиков</span></div>';
        node.appendChild(coll);
      }
      node.appendChild(grid);

      if (chat) {
        const hint = U.el('div', 'dim pad', 'Нажмите на подарок — он мгновенно отправится в чат «' + U.esc(chat.name || chat.username) + '».');
        node.appendChild(hint);
      }

      node.querySelector('#g-back').onclick = () => handle.close();
    });
  }

  function nftEmoji(name) {
    const map = { Crystal: '💎', Moon: '🌙', Star: '⭐', Butterfly: '🦋', Crown: '👑', Rocket: '🚀' };
    return map[name] || '✦';
  }

  function giftCard(g, chat, nftOnly) {
    const card = U.el('div', 'gift-card' + (g.nft ? ' nft' : ''));
    card.innerHTML = '<div class="g-emoji">' + g.emoji + '</div><div class="g-name">' + U.esc(g.name) + '</div><div class="g-price">' +
      (g.nft ? 'NFT • ' + g.price + ' TC' : g.price + ' TC') + '</div>';
    card.onclick = () => {
      if (!chat) return ui.toast('Откройте каталог из чата или профиля');
      sendGift(chat, g);
    };
    return card;
  }

  /* ---------- отправка ---------- */
  function sendGift(chat, g) {
    const bal = TM.wallet.balance();
    if (bal < g.price) return ui.toast('Недостаточно TeleCoin: нужно ' + g.price + ' TC', 'err');
    ui.confirm('Подарить «' + g.name + '»?', 'Будет списано ' + g.price + ' TC. Получатель: ' + (chat.name || chat.username), 'Подарить').then(ok => {
      if (!ok) return;
      if (TM.net.isOn()) {
        TM.net.send({ type: 'gift_send', to: chat.username, gift: { kind: 'gift', name: g.name, emoji: g.emoji, price: g.price } });
      } else {
        // офлайн: локально
        if (S.s.account) S.s.account.coins = bal - g.price;
        S.saveAccount();
        TM.chat.sendMessage(S.getChat(chat.id) || S.createChat({ id: chat.id, kind: 'private', username: chat.username, name: chat.name || chat.username }), { type: 'gift', text: g.emoji + ' ' + g.name, giftKind: 'gift', giftValue: g.name });
        ui.toast('Подарок отправлен (офлайн)', 'warn');
      }
      TM.wallet.addTransaction('−' + g.price + ' TeleCoin • подарок «' + g.name + '» → @' + chat.username);
    });
  }

  function sendNftFlow(chat) {
    if (!chat || chat.kind !== 'private') return;
    const my = (S.s.account && S.s.account.nft) || [];
    if (!my.length) return ui.modal({ title: 'NFT', text: 'У вас нет NFT-подарков. Администратор может выдать их в Admin Mode.', actions: [{ label: 'Понятно', primary: true }] });
    ui.sheet({
      title: 'Какой NFT подарить?',
      items: my.map(item => {
        const parts = String(item).split('|');
        return { label: nftEmoji(parts[0]) + ' ' + parts[0], onClick: () => sendNftItem(chat, item) };
      })
    });
  }

  function sendNftItem(chat, item) {
    const name = String(item).split('|')[0];
    if (TM.net.isOn()) {
      TM.net.send({ type: 'gift_send', to: chat.username, gift: { kind: 'nft', name, id: item, emoji: nftEmoji(name) } });
    } else {
      ui.toast('Отправка NFT доступна при подключении к серверу', 'err');
    }
  }

  function sendPremiumFlow(chat) {
    if (!chat || chat.kind !== 'private') return;
    if (TM.wallet.balance() < TM.config.PREMIUM_PRICE) return ui.toast('Нужно ' + TM.config.PREMIUM_PRICE + ' TeleCoin', 'err');
    ui.confirm('Подарить TelePremium?', 'Подарок на 30 дней. С вашего баланса списывается ' + TM.config.PREMIUM_PRICE + ' TC.', 'Подарить').then(ok => {
      if (!ok) return;
      if (TM.net.isOn()) {
        TM.net.send({ type: 'gift_send', to: chat.username, gift: { kind: 'premium', name: 'TelePremium', emoji: '⭐', id: 'premium' } });
      } else {
        ui.toast('Требуется подключение к серверу', 'err');
        return;
      }
      TM.wallet.addTransaction('−' + TM.config.PREMIUM_PRICE + ' TeleCoin • TelePremium → @' + chat.username);
    });
  }

  function bindNet() {
    TM.net.on('gift_ok', () => {
      ui.toast('🎁 Подарок доставлен!');
      if (S.s.account) S.s.account = Object.assign({}, S.s.account);
    });
  }

  return { openCatalog, sendGift, sendNftFlow, sendNftItem, sendPremiumFlow, bindNet };
})();
