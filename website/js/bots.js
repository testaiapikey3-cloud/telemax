/* ============================================================
 * TeleMAX Web — bots.js
 * Сервисные боты: TeleMAX Bot (уведомления безопасности),
 * BotRast (/newbot, /mybots, /token) и TeleMany (/addbot...).
 * ============================================================ */
window.TM = window.TM || {};

TM.bots = (function () {
  'use strict';
  const U = TM.util;
  const ui = TM.ui;
  const S = TM.state;

  function botChat(user) {
    const id = S.chatIdForUser(user);
    return S.getChat(id) || S.createChat({ id, kind: 'private', username: user, name: TM.config.BOT_USERNAMES[user] || user, wallpaper: 0 });
  }

  function ensureBotChats() {
    const t = botChat('telemaxbot');
    if (!t.messages.length) {
      S.addMessage(t.id, sysMsg('Добро пожаловать в TeleMAX!\n\nЯ буду присылать сюда уведомления безопасности: входы с новых устройств, коды подтверждения и рассылки администрации.\n\nКоманды: /start, /help'));
    }
    const b = botChat('botrast');
    if (!b.messages.length) {
      S.addMessage(b.id, sysMsg('BotRast — создание ботов TeleMAX.\n\nВыберите язык: RU / EN / ES\n\nМеню:\n/newbot — создать бота\n/mybots — мои боты\n/token — токен бота\n/help — помощь'));
    }
    const m = botChat('telemany');
    if (!m.messages.length) {
      S.addMessage(m.id, sysMsg('TeleMany — управление ботами и публикации.\n\nИспользуйте /addbot, чтобы добавить первого бота.\n\nМеню:\n/addbot — добавить бота\n/commands — команды\n/newpost — публикация\n/subscribers — подписчики\n/help — помощь'));
    }
    TM.chats.render();
  }

  function sysMsg(text, from) {
    return { id: U.uid(), type: 'text', text, mine: false, from: from || 'telemaxbot', time: Date.now(), status: 'read' };
  }

  function openBot(user) {
    botChat(user);
    TM.chat.open(S.chatIdForUser(user));
  }

  /* ---------- авто-ответы ---------- */
  function handle(user, chat, text) {
    const low = String(text || '').trim().toLowerCase();
    setTimeout(() => reply(chat, botReply(user, low, text)), 500);
  }

  function reply(chat, text) {
    if (!text) return;
    S.addMessage(chat.id, sysMsg(text, chat.username));
    if (S.s.activeChat === chat.id) TM.chat.refreshIfOpen(chat.id);
    TM.chats.render();
  }

  function botReply(user, low, text) {
    text = String(text || '').trim();
    const st = S.store();
    st.botState = st.botState || {};

    if (user === 'telemaxbot') {
      if (low === '/start' || low === '/help') return 'TeleMAX Bot на связи 💛\n\nЧто умею:\n• уведомления о входах с новых устройств\n• коды подтверждения\n• системные рассылки\n\nКоманды: /id — ваш профиль, /help — помощь.';
      if (low === '/id') {
        const a = S.s.account || {};
        return '🆔 Ваш профиль\n\n@' + S.s.user + '\nИмя: ' + (a.name || '—') + '\nРоль: ' + TM.config.ROLES[S.myRole()] + (a.verified ? '\nВерификация: ✓' : '') + '\nTeleCoin: ' + (a.coins || 0) + ' TC' + (a.premium ? '\nTelePremium: ✓ активен' : '');
      }
      return 'Команды: /start, /help, /id';
    }

    if (user === 'botrast') {
      if (low === 'ru' || low === 'en' || low === 'es') { st.botState.lang = low; S.save(); return low === 'ru' ? 'Язык: русский ✓\n\nМеню:\n/newbot — создать бота\n/mybots — мои боты\n/token — токен\n/help — помощь' : 'Language set: ' + low.toUpperCase() + '\n\nMenu:\n/newbot\n/mybots\n/token\n/help'; }
      if (low === '/start') return 'BotRast — создание ботов TeleMAX.\n\nВыберите язык: RU / EN / ES\n\n/newbot — создать бота\n/mybots — мои боты\n/token — токен бота';
      if (low === '/newbot') { st.botState.step = 'name'; S.save(); return 'Как назвать бота? Отправьте имя одним сообщением.'; }
      if (st.botState.step === 'name' && low.startsWith('/')) { st.botState.step = ''; S.save(); }
      if (st.botState.step === 'name') {
        st.botState.step = ''; S.save();
        const bots = S.store().bots = S.store().bots || [];
        const base = (text.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'my');
        let un = base + '_bot', n = 1;
        while (bots.some(x => x.username === un)) { n++; un = base.slice(0, 20) + '_' + n + '_bot'; }
        const b = { id: U.uid(), username: un, name: text.slice(0, 64) || un, token: 'TMX:' + U.uid().slice(0, 10) + ':' + U.uid().slice(0, 16) };
        bots.push(b);
        if (S.s.account) S.s.account.bots = bots;
        S.saveAccount(); S.save();
        return 'Готово! Бот создан ✅\n\n@' + un + '\nИмя: ' + b.name + '\nТокен: ' + b.token + '\n\nСовет: скопируйте токен и добавьте бота в TeleMany через /addbot.';
      }
      if (low === '/mybots') {
        const bots = S.store().bots = S.store().bots || [];
        if (!bots.length) return 'У вас пока нет ботов. Создайте первого: /newbot';
        return 'Мои боты (' + bots.length + '):\n' + bots.map((b, i) => (i + 1) + '. @' + b.username + ' — ' + b.name).join('\n') + '\n\n/token — показать токен';
      }
      if (low === '/token') {
        const bots = S.store().bots = S.store().bots || [];
        if (!bots.length) return 'Сначала создайте бота: /newbot';
        return 'Ваши боты (' + bots.length + '):\n\n' + bots.map(b => '@' + b.username + '\n' + b.token).join('\n\n') + '\n\nНикому не передавайте токены.';
      }
      if (low === '/help') return '/newbot — создать бота\n/mybots — мои боты\n/token — токен\nЯзык: RU / EN / ES';
      return 'Команды: /newbot, /mybots, /token, /help';
    }

    if (user === 'telemany') {
      if (low === '/start') return 'Привет, @' + S.s.user + '!\n\nTeleMany поможет управлять ботами, отправлять публикации и создавать команды.\n\nДобавьте бота: /addbot';
      if (low.startsWith('/addbot')) {
        const token = (text.split(/\s+/)[1] || '').trim();
        const bots = S.store().bots = S.store().bots || [];
        const found = token && bots.find(b => b.token === token);
        if (found) { st.many = { bot: found, step: 'desc' }; S.save(); return 'Токен @' + found.username + ' принят ✅\n\nНапишите описание бота (для карточки) или отправьте /skip.'; }
        return 'Пришлите токен так: /addbot ВАШ_ТОКЕН\n\nТокен создаётся в @BotRast командой /newbot.';
      }
      if (st.many && st.many.step === 'desc' && !low.startsWith('/')) {
        st.many.bot.desc = text; st.many.step = ''; S.save();
        return 'Магазин бота настроен ✅\n\n/subscribers — подписчики\n/newpost — публикация\n/commands — команды';
      }
      if (st.many && st.many.step === 'post' && !low.startsWith('/')) {
        st.many.lastPost = text; st.many.step = ''; S.save();
        return '📢 Публикация создана ✅\n\n«' + text.slice(0, 140) + '»\n\nОтправлено подписчикам вашего бота. Посмотреть: /lastpost';
      }
      if (low === '/skip') { if (st.many) st.many.step = ''; S.save(); return 'Хорошо, настройку можно добавить позже.\n\n/subscribers — подписчики\n/newpost — публикация'; }
      if (low === '/subscribers') return '📊 Подписчиков: 0\n\nПригласите пользователей, отправив им ссылку на вашего бота.';
      if (low === '/newpost') {
        if (!st.many || !st.many.bot) return 'Сначала добавьте бота: /addbot ВАШ_ТОКЕН';
        st.many.step = 'post'; S.save();
        return '✍️ Отправьте текст публикации следующим сообщением.';
      }
      if (low === '/lastpost') return (st.many && st.many.lastPost) ? '📢 Последняя публикация:\n\n«' + st.many.lastPost.slice(0, 200) + '»' : 'Публикаций пока нет. Создайте: /newpost';
      if (low === '/commands') return 'Команды бота:\n/help — помощь\n/settings — настройки\n/lastpost — последняя публикация';
      if (low === '/help') return 'Меню TeleMany:\n/addbot — добавить бота\n/newpost — публикация\n/subscribers — подписчики\n/lastpost — последняя публикация\n/commands — команды';
      return 'Меню TeleMany:\n/addbot — добавить бота\n/commands\n/newpost\n/subscribers\n/help';
    }
    return 'Бот недоступен.';
  }

  return { ensureBotChats, openBot, handle, botChat };
})();
