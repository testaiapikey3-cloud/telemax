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

  function botChat(user, name) {
    const id = S.chatIdForUser(user);
    return S.getChat(id) || S.createChat({ id, kind: 'private', username: user, name: name || TM.config.BOT_USERNAMES[user] || user, wallpaper: 0 });
  }

  /* бот сразу появляется на главном экране (в списке чатов) */
  function welcomeBot(user, name) {
    const c = botChat(user, name);
    if (!c.messages.length) {
      S.addMessage(c.id, sysMsg('Привет! Я бот «' + (name || user) + '» 🤖\n\nНапишите /start, чтобы начать, или /help — список команд.', user));
    }
    if (TM.chats && TM.chats.render) TM.chats.render();
    return c;
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
    const ai = botChat('telemaxai');
    if (!ai.messages.length) {
      S.addMessage(ai.id, sysMsg('Привет! Я TeleMAX AI — умный помощник мессенджера 🤖💛\n\nМогу подсказать:\n• как создать группу или канал\n• что делать, если не работают звонки\n• как включить уведомления\n• как сменить язык (120+ языков мира)\n• подарки, TeleCoin, TelePremium, боты\n\nПросто напишите вопрос своими словами — отвечу мгновенно и на выбранном языке. Команда /help — все темы.', 'telemaxai'));
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
    if (user === 'telemaxai') { aiHandle(chat, low, text); return; }
    setTimeout(() => reply(chat, botReply(user, low, text)), 500);
  }

  function reply(chat, text) {
    if (!text) return;
    S.addMessage(chat.id, sysMsg(text, chat.username));
    if (S.s.activeChat === chat.id) TM.chat.refreshIfOpen(chat.id);
    TM.chats.render();
  }

  /* ---------- TeleMAX AI: встроенный помощник ----------
   * Сначала отвечает сам (база знаний о TeleMAX), а на незнакомые
   * вопросы — через внешний AI-сервис, если есть интернет. */
  function aiReply(low, text) {
    const has = function () { for (let i = 0; i < arguments.length; i++) if (low.indexOf(arguments[i]) >= 0) return true; return false; };
    const isBot = /(^|[^а-яёa-z])бот/.test(low);

    if (low === '/start' || low === '/help' || has('что умеешь', 'что ты умеешь', 'твои возможности', 'список команд'))
      return 'Привет! Я TeleMAX AI — помощник внутри мессенджера 💛\n\nОтвечаю на вопросы о TeleMAX:\n• как создать группу или канал\n• что делать, если не работают звонки\n• как включить уведомления\n• как сменить язык (120+ языков)\n• подарки, TeleCoin, TelePremium, боты\n• безопасность и приватность\n\nПросто напишите вопрос своими словами — отвечу сразу.';

    if (has('кто ты', 'ты кто', 'что ты такое', 'ты человек', 'ты робот', 'who are you'))
      return 'Я TeleMAX AI — цифровой помощник мессенджера TeleMAX 🤖\n\nОтвечаю мгновенно, круглосуточно и на том языке, который выбран в настройках. Задавайте любой вопрос о TeleMAX.';

    if (has('спасибо', 'благодар', 'круто', 'супер', 'отлично') && !has('не работа'))
      return 'Всегда рад помочь! 💛 Если появятся ещё вопросы о TeleMAX — пишите, я на связи.';

    // отправка вложений
    if (has('отправ', 'прикреп', 'скинуть', 'послать', 'загруз') && has('фото', 'видео', 'файл', 'картинк', 'документ', 'аудио', 'музык'))
      return 'Как отправить вложение:\n\n1. Откройте чат.\n2. Нажмите 📎 (скрепка) слева от поля ввода.\n3. Выберите: фото, видео, файл, опрос или подарок.\n\nГолосовое сообщение — кнопка 🎤 на месте скрепки.';

    // звонки
    if (has('звон', 'позвон', 'звонить', 'набрать', 'call', 'видео'))
      return 'Звонки в TeleMAX:\n\n📞 Позвонить: откройте личный чат → кнопка трубки в шапке.\n📹 Видео: там же кнопка камеры.\n\nЕсли звонок не соединяется:\n• проверьте интернет у вас и у собеседника,\n• разрешите микрофон и камеру в браузере (замочек 🔒 в адресной строке),\n• подождите 5–10 секунд — сервис сам подбирает маршрут между городами.\n\nМы недавно улучшили звонки (поддержка TURN) — попробуйте ещё раз, должно работать.';

    // группы
    if (has('групп'))
      return 'Как создать группу:\n\n1. На главном экране нажмите ✏️ (карандаш вверху).\n2. Выберите «Создать группу».\n3. Введите название.\n4. Нажмите на друзей из списка — они сразу станут участниками (не нужно вводить @username).\n5. Нажмите «Создать группу».\n\nДобавлять участников можно и позже — в профиле группы.';

    // каналы
    if (has('канал'))
      return 'Как создать канал:\n\n1. На главном экране нажмите ✏️.\n2. Выберите «Создать канал».\n3. Введите название и отметьте подписчиков нажатием на друзей.\n4. Нажмите «Создать канал».\n\nПубликации в канале видят все подписчики, писать может только владелец.';

    // язык интерфейса
    if (has('язык', 'перевод', 'language', 'английск', 'translate', 'язык интерфейс'))
      return 'Смена языка:\n\n1. Настройки → Язык (иконка глобуса 🌐).\n2. Найдите язык поиском — доступно более 120 языков мира.\n3. Нажмите на язык — интерфейс переведётся за 5–20 секунд.\n\nПеревод делается один раз, дальше всё мгновенно. Уведомления тоже приходят на выбранном языке.';

    // уведомления
    if (has('уведомл', 'пуш', 'push', 'не приход', 'нет звук', 'вибрац'))
      return 'Чтобы уведомления приходили:\n\n1. Разрешите уведомления в браузере: замочек 🔒 в адресной строке → Уведомления → Разрешить.\n2. Настройки → Уведомления → включите переключатель.\n3. Добавьте TeleMAX на главный экран: меню ⋮ → «Установить приложение».\n\nТогда уведомления со звуком и вибрацией придут, даже когда вкладка закрыта.';

    // пароль
    if (has('пароль', 'восстанов', 'забыл', 'сброс', 'взлом'))
      return 'Пароль и безопасность:\n\n• Забыли пароль — на экране входа нажмите «Забыли пароль?».\n• Сменить пароль — Настройки → Аккаунт и безопасность.\n• О входах с новых устройств сообщает @TeleMAX Bot.\n\nЕсли заподозрили взлом — сразу смените пароль и проверьте активные устройства в настройках.';

    // вход и регистрация
    if (has('регистрац', 'создать аккаунт', 'войти', 'вход', 'логин', 'аккаунт'))
      return 'Вход и регистрация:\n\n• Новый пользователь: «Создать аккаунт» — имя, @username и пароль (от 6 символов).\n• Вход: @username + пароль.\n\nСовет: используйте запоминающийся @username, чтобы друзья легко вас находили.';

    // друзья
    if (has('друг', 'контакт', 'добавить человек', 'найти человек', 'позвать'))
      return 'Как добавить человека:\n\n1. Вкладка «Контакты».\n2. Нажмите иконку поиска 🔍.\n3. Введите @username.\n4. Откройте профиль → «Написать».\n\nВ группы и каналы друзей можно добавлять простым нажатием — без ввода юзернеймов.';

    // подарки
    if (has('подарок', 'подарк', 'gift'))
      return 'Подарки:\n\n1. Откройте чат → 📎 → «Подарок».\n2. Выберите подарок из каталога (от 50 TeleCoin).\n3. Отправьте — он появится в чате и в профиле друга.\n\nОсобые подарки отмечены как NFT и остаются в профиле навсегда.';

    // кошелёк
    if (has('coin', 'кошел', 'монет', 'баланс', 'перевести'))
      return 'TeleCoin (TC) — внутренняя валюта TeleMAX:\n\n• Баланс — в вашем профиле.\n• Перевод другу — откройте профиль → «Перевести».\n• Монеты нужны для подарков и TelePremium.\n\nНовым пользователям начисляется приветственный баланс.';

    // premium
    if (has('premium', 'премиум'))
      return 'TelePremium — расширенные возможности:\n\n• особые темы и значки профиля\n• приоритетная поддержка\n• повышенные лимиты\n\nПодключение — в профиле. Стоимость 499 TeleCoin.';

    // боты
    if (isBot)
      return 'Боты в TeleMAX:\n\n• @BotRast — создание своих ботов: /newbot.\n• @TeleMany — добавление и публикации: /addbot.\n• @TeleMAX Bot — уведомления безопасности.\n• @telemaxai — я, помощник по вопросам.\n\nСозданный бот сразу появляется в списке чатов.';

    // безопасность
    if (has('безопасн', 'шифров', 'приватн', 'секрет', 'защит'))
      return 'Безопасность TeleMAX:\n\n• Пароли хранятся в виде хешей.\n• Входы с новых устройств отслеживаются — придёт уведомление от @TeleMAX Bot.\n• Данные передаются по защищённому соединению.\n\nДля приватности настройте скрытие статуса «в сети» в настройках конфиденциальности.';

    // офлайн
    if (has('офлайн', 'оффлайн', 'интернет', 'связь', 'сети нет', 'не подключ'))
      return 'Если пропал интернет:\n\n• TeleMAX продолжит работать — сообщения сохранятся и отправятся сами, когда связь вернётся.\n• Сверху появится жёлтая полоска — это нормально.\n• Если полоска не исчезает — проверьте Wi-Fi или мобильные данные.';

    // установка приложения
    if (has('скачать', 'установи', 'приложени', 'pwa', 'экран домой', 'на рабочий стол'))
      return 'TeleMAX не нужно скачивать из магазина:\n\n1. Откройте сайт в Chrome.\n2. Меню ⋮ → «Установить приложение» (или «Добавить на главный экран»).\n\nПриложение запустится с иконки, как обычное, и сможет присылать уведомления. Работает даже на старых телефонах.';

    // прокрутка
    if (has('прокрутк', 'скролл', 'scroll', 'вниз не'))
      return 'Проблема с прокруткой?\n\nМы недавно это улучшили — обновите приложение:\n1. Потяните страницу вниз для обновления или закройте и откройте приложение.\n2. Если не помогло — очистите кэш браузера.\n\nВ чате прокрутка сама держится внизу у новых сообщений.';

    // общие проблемы
    if (has('не работа', 'баг', 'ошибк', 'глюк', 'лагает', 'тормозит', 'вылетает'))
      return 'Спасибо, что сообщили! 💛\n\nЧто можно попробовать:\n1. Обновить приложение (потяните вниз или закройте и откройте).\n2. Проверить интернет.\n3. Переустановить на главный экран.\n\nОпишите подробнее, что именно не работает — постараюсь помочь, а сложные случаи передам администрации.';

    // поддержка
    if (has('поддержк', 'support', 'оператор', 'админ', 'живой человек'))
      return 'Поддержка TeleMAX:\n\n• Я отвечаю на частые вопросы круглосуточно и мгновенно.\n• По вопросам аккаунта (блокировка, восстановление) напишите здесь подробно — сообщение увидят администраторы.\n• @TeleMAX Bot присылает уведомления безопасности.\n\nОпишите ваш вопрос — помогу или передам дальше.';

    // приветствие
    if (/^(привет|здравств|хай|добрый|доброе|hi|hello|hey|ку)(\s|$|[!,?.])/.test(low))
      return 'Привет! 👋 Я TeleMAX AI — помощник мессенджера.\n\nСпросите о чём угодно: группы, каналы, звонки, уведомления, язык, подарки, боты. Или отправьте /help — покажу все темы.';

    return ''; // незнакомый вопрос → отвечает внешний AI (если есть интернет)
  }

  async function aiHandle(chat, low, text) {
    const quick = aiReply(low, text);
    if (quick) { setTimeout(() => reply(chat, quick), 450); return; }
    S.s.typing[chat.username] = Date.now();
    if (S.s.activeChat === chat.id) TM.chat.refreshIfOpen(chat.id);
    let ans = '';
    try {
      if (navigator.onLine !== false) {
        const langNow = (window.TM && TM.langs && TM.langs.current()) || 'ru';
        const prompt = langNow === 'ru'
          ? 'Ты — TeleMAX AI, дружелюбный помощник мессенджера TeleMAX. Ответь кратко (до 4 предложений) и по делу. Вопрос: '
          : 'You are TeleMAX AI, a friendly assistant of the TeleMAX messenger. Answer briefly (max 4 sentences) and to the point, in the language of the question or English. Question: ';
        const url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt + String(text).slice(0, 500)) + '?model=openai';
        const res = await Promise.race([
          fetch(url),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))
        ]);
        if (res && res.ok) ans = String(await res.text()).trim().slice(0, 900);
      }
    } catch (_) {}
    delete S.s.typing[chat.username];
    if (!ans || ans.length < 2) {
      ans = 'Я TeleMAX AI. Не уверен, что понял вопрос — попробуйте переформулировать.\n\nЧастые темы: группы и каналы, звонки, уведомления, язык интерфейса, подарки и TeleCoin, боты.\n\nКоманда /help — все возможности.';
    }
    reply(chat, ans);
  }

  function botReply(user, low, text) {
    text = String(text || '').trim();
    const st = S.store();
    st.botState = st.botState || {};

    if (user === 'telemaxai') { const q = aiReply(low, text); return q || 'Секунду… я подумаю над ответом 🤔'; }

    /* мои собственные боты (созданные через BotRast / добавленные в TeleMany) */
    const mb = (S.store().bots || []).find(b => b.username === user);
    if (mb) {
      if (low === '/start') return 'Привет! Я бот «' + (mb.name || user) + '» 🤖\n\nРаботаю от имени @' + S.s.user + '.';
      if (low === '/help') return 'Команды бота @' + user + ':\n/start — начать\n/help — помощь\n\nВладелец: @' + S.s.user;
      return 'Принято ✅ Я бот @' + user + '. Напишите /help, чтобы увидеть команды.';
    }

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
        welcomeBot(un, b.name);
        return 'Готово! Бот создан ✅\n\n@' + un + '\nИмя: ' + b.name + '\nТокен: ' + b.token + '\n\nБот появился в списке чатов 💛\nСовет: скопируйте токен и добавьте бота в TeleMany через /addbot.';
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
        if (found) {
          st.many = { bot: found, step: 'desc' }; S.save();
          welcomeBot(found.username, found.name);
          return 'Токен @' + found.username + ' принят ✅\n\nБот появился в списке чатов 💛\n\nНапишите описание бота (для карточки) или отправьте /skip.';
        }
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
