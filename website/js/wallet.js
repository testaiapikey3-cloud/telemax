/* ============================================================
 * TeleMAX Web — wallet.js
 * TeleCoin: баланс, переводы, пополнение (песочница), история.
 * ============================================================ */
window.TM = window.TM || {};

TM.wallet = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  function balance() { return (S.s.account && S.s.account.coins) || 0; }

  function addTransaction(text) {
    const st = S.store();
    st.transactions.unshift(U.timeHM(Date.now()) + ' • ' + text);
    st.transactions = st.transactions.slice(0, 50);
    S.save();
  }

  function open() {
    ui.pushScreen((node, handle) => {
      node.classList.add('sub-screen');
      node.innerHTML = '<div class="scr-head"><button class="icon-btn" id="w-back">' + ui.icon('back') + '</button><div class="scr-title">TeleCoin</div></div>';
      const card = U.el('div', 'coin-card');
      card.innerHTML = '<div class="coin-label">T Кошелёк</div><div class="coin-value">' + balance() + ' <span>TC</span></div>' +
        (S.s.account && S.s.account.premium ? '<div class="coin-prem">✓ TelePremium активен</div>' : '');
      node.appendChild(card);

      const send = U.el('button', 'btn btn-primary btn-big', '↗  Отправить TeleCoin');
      send.onclick = () => sendCoins();
      node.appendChild(send);

      const top = U.el('button', 'btn btn-ghost btn-big', '＋  Пополнить TeleCoin');
      top.onclick = () => topup();
      node.appendChild(top);

      node.appendChild(U.el('div', 'scr-sub', 'ОПЕРАЦИИ'));
      const hist = U.el('div', 'tx-list');
      const txs = S.store().transactions || [];
      hist.innerHTML = txs.length ? txs.map(t => '<div class="tx-row">' + U.esc(t) + '</div>').join('') : '<div class="dim pad">Пока операций нет.</div>';
      node.appendChild(hist);

      node.querySelector('#w-back').onclick = () => handle.close();
    });
  }

  async function sendCoins(toUser) {
    const v = await ui.form('Отправить TeleCoin', [
      { key: 'to', label: '@username получателя', value: toUser || '', placeholder: 'rustam_max' },
      { key: 'amount', label: 'Сумма', type: 'number', placeholder: '100' }
    ], 'Отправить');
    if (!v) return;
    const to = String(v.to || '').trim().replace(/^@/, '').toLowerCase();
    const n = Math.floor(Number(v.amount || 0));
    if (!to || !S.profileOf(to)) return ui.toast('Пользователь не найден', 'err');
    if (!(n > 0)) return ui.toast('Неверная сумма', 'err');
    if (n > balance()) return ui.toast('Недостаточно TeleCoin', 'err');
    if (!TM.net.isOn()) return ui.toast('Переводы доступны при подключении к серверу', 'err');
    TM.net.send({ type: 'coin_send', to, amount: n });
    addTransaction('−' + n + ' TeleCoin → @' + to);
    if (S.s.account) S.s.account.coins = balance() - n;
    S.saveAccount();
    ui.toast('Перевод выполнен: ' + n + ' TC → @' + to);
  }

  function topup() {
    ui.sheet({
      title: 'Пополнить TeleCoin (песочница)',
      items: [100, 500, 1000, 5000].map(n => ({
        label: '+' + n + ' TC',
        onClick: () => {
          if (!TM.net.isOn()) return ui.toast('Пополнение доступно при подключении к серверу', 'err');
          TM.net.send({ type: 'coin_topup', amount: n });
          if (S.s.account) S.s.account.coins = balance() + n;
          S.saveAccount();
          addTransaction('+' + n + ' TeleCoin • пополнение');
          ui.toast('Баланс пополнен на ' + n + ' TC');
        }
      }))
    });
  }

  function bindNet() {
    TM.net.on('account_update', m => {
      if (!m.account) return;
      S.s.account = Object.assign({}, S.s.account, m.account);
      S.saveAccount();
      if (TM.app.tab === 'settings') TM.settings.refresh();
    });
    TM.net.on('coin_received', m => {
      addTransaction('+' + m.amount + ' TeleCoin ← @' + m.from);
      ui.toast('💰 Получено ' + m.amount + ' TeleCoin от @' + m.from, 'info');
    });
  }

  return { open, sendCoins, topup, addTransaction, balance, bindNet };
})();
