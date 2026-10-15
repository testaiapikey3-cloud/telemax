/* ============================================================
 * TeleMAX Web — polls.js
 * Опросы: создание, голосование, живые результаты (в чатах 1-на-1
 * и группах). Голоса синхронизируются через сервер (poll_vote).
 * ============================================================ */
window.TM = window.TM || {};

TM.polls = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  /* ---------- создание ---------- */
  function composer(chat, sendFn) {
    const body = U.el('div', 'poll-form');
    body.innerHTML =
      '<label class="form-label">Вопрос</label>' +
      '<input class="form-input" id="pf-q" placeholder="О чём спросить?" maxlength="200">' +
      '<label class="form-label">Варианты (минимум 2)</label>' +
      '<div id="pf-opts"></div>' +
      '<button class="btn btn-ghost btn-sm" id="pf-add">+ Добавить вариант</button>';
    const opts = body.querySelector('#pf-opts');
    function addOption(v) {
      if (opts.children.length >= 10) return ui.toast('Максимум 10 вариантов', 'warn');
      const row = U.el('div', 'pf-row');
      row.innerHTML = '<input class="form-input pf-opt" placeholder="Вариант ' + (opts.children.length + 1) + '" value="' + U.esc(v || '') + '" maxlength="100">';
      if (opts.children.length >= 2) {
        const x = U.el('button', 'icon-btn', ui.icon('close'));
        x.onclick = () => row.remove();
        row.appendChild(x);
      }
      opts.appendChild(row);
    }
    addOption(); addOption();
    body.querySelector('#pf-add').onclick = () => addOption();

    ui.modal({
      title: '📊 Новый опрос',
      body,
      actions: [
        {
          label: 'Создать', primary: true,
          onClick: () => {
            const q = body.querySelector('#pf-q').value.trim();
            const list = U.$$('.pf-opt', body).map(i => i.value.trim()).filter(Boolean);
            if (!q) { ui.toast('Введите вопрос', 'err'); return false; }
            if (list.length < 2) { ui.toast('Нужно минимум 2 варианта', 'err'); return false; }
            const poll = { question: q, options: list, votes: {}, time: Date.now() };
            sendFn(chat, { type: 'poll', poll, text: q });
          }
        },
        { label: 'Отмена' }
      ]
    });
  }

  /* ---------- отрисовка ---------- */
  function render(m, chat, onSave) {
    const box = U.el('div', 'poll-box');
    const poll = m.poll;
    const myVote = poll.votes ? poll.votes[S.s.user] : undefined;
    const counts = poll.options.map((_, i) => Object.values(poll.votes || {}).filter(v => v === i).length);
    const total = counts.reduce((a, b) => a + b, 0);
    const voted = myVote !== undefined;

    box.innerHTML = '<div class="poll-q">📊 ' + U.esc(poll.question) + '</div><div class="poll-opts"></div>' +
      '<div class="poll-total">' + (total ? total + ' ' + plural(total, 'голос', 'голоса', 'голосов') : 'Пока нет голосов') + '</div>';

    const optsBox = box.querySelector('.poll-opts');
    poll.options.forEach((opt, i) => {
      const pct = total ? Math.round(counts[i] / total * 100) : 0;
      const row = U.el('div', 'poll-opt' + (voted ? ' voted' : '') + (myVote === i ? ' mine' : ''));
      row.innerHTML =
        (voted ? '<div class="po-bar" style="width:' + pct + '%"></div>' : '') +
        '<span class="po-mark">' + (myVote === i ? '●' : '○') + '</span>' +
        '<span class="po-label">' + U.esc(opt) + '</span>' +
        (voted ? '<span class="po-pct">' + pct + '%</span>' : '');
      row.onclick = () => {
        poll.votes = poll.votes || {};
        poll.votes[S.s.user] = i;
        onSave && onSave();
        reRender(box, m, chat, onSave);
        if (chat.kind === 'private' && TM.config.BOT_USERNAMES[chat.username]) return;
        if (TM.net.isOn()) {
          TM.net.send({
            type: 'poll_vote', chatId: chat.kind === 'private' ? S.chatIdForUser(chat.username) : 'g_' + chat.id.slice(2),
            messageId: m.id, option: i, votes: poll.votes, poll
          });
        }
      };
      optsBox.appendChild(row);
    });
    return box;
  }

  function reRender(box, m, chat, onSave) {
    const fresh = render(m, chat, onSave);
    box.replaceWith(fresh);
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  return { composer, render, plural };
})();
