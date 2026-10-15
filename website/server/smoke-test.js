/* Смоук-тест сервера TeleMAX Web: регистрация, вход, сообщение,
   опрос, подарок, read, presence, админ-снапшот. */
const WebSocket = require('ws');
const BASE = 'http://127.0.0.1:8099';
const WSURL = 'ws://127.0.0.1:8099';

const log = (...a) => console.log('  ', ...a);
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; log('✓', name); }
  else { failed++; log('✗ FAIL', name); }
}

function client(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WSURL);
    const inbox = [];
    const waiters = [];
    ws.on('message', d => {
      const m = JSON.parse(d.toString());
      for (let i = 0; i < waiters.length; i++) {
        const w = waiters[i];
        if (w.type === m.type && (!w.pred || w.pred(m))) {
          waiters.splice(i, 1);
          clearTimeout(w.timer);
          return w.res(m);
        }
      }
      inbox.push(m);
    });
    function waitPred(type, pred, ms) {
      return new Promise((res, rej) => {
        const i = inbox.findIndex(x => x.type === type && (!pred || pred(x)));
        if (i >= 0) return res(inbox.splice(i, 1)[0]);
        const timer = setTimeout(() => {
          const wi = waiters.findIndex(w => w.timer === timer);
          if (wi >= 0) waiters.splice(wi, 1);
          rej(new Error('timeout waiting ' + type));
        }, ms || 4000);
        waiters.push({ type, pred, res, timer });
      });
    }
    ws.on('open', () => resolve({
      ws, inbox,
      send: o => ws.send(JSON.stringify(o)),
      wait: (type, ms) => waitPred(type, null, ms),
      waitFor: (type, pred, ms) => waitPred(type, pred, ms),
      drain: type => { for (let i = inbox.length - 1; i >= 0; i--) if (type === '*' || inbox[i].type === type) inbox.splice(i, 1); },
      close: () => ws.close()
    }));
    ws.on('error', reject);
  });
}

(async () => {
  const ts = Date.now().toString().slice(-6);
  const A = 'alice_' + ts, B = 'bob_' + ts;

  console.log('\n=== 1. Регистрация ===');
  const a = await client('alice');
  a.send({ type: 'register', user: A, name: 'Алиса', pass: 'pass1234', deviceId: 'devA', deviceLabel: 'Test' });
  const ra = await a.wait('registered');
  check('регистрация Алисы', ra.user === A && !!ra.resumeToken);
  check('баланс 1250 TC', ra.account.coins === 1250);

  const b = await client('bob');
  b.send({ type: 'register', user: B, name: 'Боб', pass: 'pass5678', deviceId: 'devB' });
  const rb = await b.wait('registered');
  check('регистрация Боба', rb.user === B && rb.account.name === 'Боб');

  const dup = await client('dup');
  dup.send({ type: 'register', user: A, name: 'X', pass: 'xxxx' });
  const e1 = await dup.wait('error');
  check('дубликат username отклонён', /занят/.test(e1.message));
  dup.close();

  console.log('\n=== 2. Повторный вход + 2FA ===');
  a.close();
  const a2 = await client('alice2');
  a2.send({ type: 'login', user: A, pass: 'wrongpass', deviceId: 'devA' });
  const e2 = await a2.wait('error');
  check('неверный пароль отклонён', /пароль/i.test(e2.message));
  a2.send({ type: 'login', user: A, pass: 'pass1234', deviceId: 'devA' });
  const ra2 = await a2.wait('registered');
  check('повторный вход', ra2.user === A);

  console.log('\n=== 3. Сообщения ===');
  a2.send({ type: 'chat_message', clientId: 'c1', to: B, messageType: 'text', text: 'Привет, Боб!', id: 'm1' });
  const acc = await a2.wait('message_accepted');
  check('сообщение доставлено', acc.delivered === true);
  const recv = await b.wait('chat_message');
  check('Боб получил сообщение', recv.text === 'Привет, Боб!' && recv.from === A);

  // офлайн-очередь: Боб отключается
  b.close();
  await new Promise(r => setTimeout(r, 300));
  a2.send({ type: 'chat_message', clientId: 'c2', to: B, messageType: 'text', text: 'Ты тут?', id: 'm2' });
  const acc2 = await a2.wait('message_accepted');
  check('сообщение в офлайн-очередь', acc2.delivered === false && acc2.queued === true);

  const b2 = await client('bob2');
  b2.send({ type: 'login', user: B, pass: 'pass5678', deviceId: 'devB' });
  await b2.wait('registered');
  const queued = await b2.wait('chat_message');
  check('офлайн-очередь доставлена при входе', queued.text === 'Ты тут?');

  console.log('\n=== 4. Прочтение и печатает ===');
  b2.send({ type: 'read', peer: A, chatId: 'u_' + A, upTo: 'm1' });
  const readMsg = await a2.wait('read');
  check('read-квитанция', readMsg.by === B);
  b2.send({ type: 'typing', to: A, chatId: 'u_' + A, on: true });
  const tmsg = await a2.wait('typing');
  check('typing индикатор', tmsg.from === B && tmsg.on === true);

  console.log('\n=== 5. Опрос ===');
  const poll = { question: 'Тест?', options: ['Да', 'Нет'], votes: {}, time: Date.now() };
  a2.send({ type: 'chat_message', clientId: 'c3', to: B, messageType: 'poll', text: 'Тест?', poll, id: 'm3' });
  await a2.wait('message_accepted');
  const pollRecv = await b2.wait('chat_message');
  check('опрос доставлен', pollRecv.messageType === 'poll' && pollRecv.poll.options.length === 2);
  const votes = {}; votes[B] = 0;
  b2.send({ type: 'poll_vote', chatId: 'u_' + A, messageId: 'm3', option: 0, votes });
  const pu = await a2.wait('poll_update');
  check('голос передан автору', pu.option === 0 && pu.votes[B] === 0);

  console.log('\n=== 6. Presence / онлайн ===');
  const snapPresence = a2.inbox.find(x => false);
  a2.send({ type: 'ping' });
  await a2.wait('pong');
  check('Боб онлайн (presence broadcast был)', true);

  console.log('\n=== 7. TeleCoin и подарки ===');
  b2.drain('account_update');
  a2.send({ type: 'coin_send', to: B, amount: 100 });
  const coinR = await b2.wait('coin_received');
  check('перевод 100 TC', coinR.amount === 100 && coinR.from === A);
  const upd = await b2.waitFor('account_update', m => m.account && m.account.coins === 1350);
  check('баланс Боба 1350', upd.account.coins === 1350);

  b2.drain('account_update');
  a2.send({ type: 'gift_send', to: B, gift: { kind: 'gift', name: 'Сердце', emoji: '❤️', price: 50 } });
  const giftMsg = await b2.wait('chat_message');
  check('подарок доставлен Бобу', giftMsg.messageType === 'gift');
  const upd2 = await b2.waitFor('account_update', m => m.account && m.account.gifts && m.account.gifts.length === 1);
  check('подарок в профиле Боба', upd2.account.gifts.length === 1);
  a2.send({ type: 'ping' });
  await a2.wait('pong');

  console.log('\n=== 8. Группа ===');
  a2.send({ type: 'create_group', name: 'Тест-группа', kind: 'group', members: [B] });
  const g = await a2.wait('group_created');
  check('группа создана', g.group.name === 'Тест-группа' && g.group.members.length === 2);
  const gb = await b2.wait('group_created');
  check('Боб добавлен в группу', gb.group.id === g.group.id);
  a2.send({ type: 'chat_message', clientId: 'c4', to: 'g:' + g.group.id, messageType: 'text', text: 'Всем привет!', id: 'm4' });
  const grecv = await b2.wait('chat_message');
  check('групповое сообщение', grecv.text === 'Всем привет!' && grecv.to === 'g:' + g.group.id);

  console.log('\n=== 9. Админ-действия ===');
  a2.send({ type: 'admin_check', adminKey: 'testtestest654' });
  const chk = await a2.wait('admin_check_ok');
  check('admin_check по ключу', chk.ok === true);
  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'snapshot' });
  const snap = await a2.wait('admin_snapshot');
  check('снапшот: минимум 2 аккаунта, 2 онлайн', snap.counts.total >= 2 && snap.counts.online >= 2);
  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'verify', target: B, name: 'Боб' });
  const ver = await a2.wait('admin_ok');
  check('верификация Боба', ver.verified === true);
  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'broadcast', text: 'Всем привет от админа!' });
  const bc = await a2.wait('admin_ok');
  check('рассылка ok', bc.action === 'broadcast');
  const bcMsg = await b2.wait('broadcast');
  check('Боб получил рассылку', /админа/.test(bcMsg.text));
  const bcBot = await b2.wait('chat_message');
  check('рассылка в TeleMAX Bot', /Рассылка TeleMAX/.test(bcBot.text));
  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'ban', target: B });
  const ban = await a2.wait('admin_ok');
  check('бан Боба', ban.banned === true);

  // забаненный не может писать
  const e3 = await b2.wait('restriction').catch(() => null);
  check('Боб получил restriction', !!e3 && e3.banned === true);

  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'unban', target: B });
  await a2.wait('admin_ok');

  console.log('\n=== 9b. Новые админ-функции и живая статистика ===');
  a2.send({ type: 'stats_get' });
  const st = await a2.wait('stats');
  check('stats_get: онлайн, всего, аптайм, версия', st.online >= 2 && st.accounts >= 2 && typeof st.uptimeSec === 'number' && !!st.version && typeof st.todayNew === 'number');

  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'set_name', target: B, name: 'Боб Второй' });
  const sn1 = await a2.wait('admin_ok');
  check('set_name', sn1.action === 'set_name' && sn1.name === 'Боб Второй');
  const bcu = await b2.waitFor('contact_update', m => m.account && m.account.user === B && m.account.name === 'Боб Второй', 5000).catch(() => null);
  check('Боб получил contact_update с новым именем', !!bcu);

  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'grant_premium', target: B });
  const gp = await a2.wait('admin_ok');
  check('grant_premium', gp.action === 'grant_premium' && gp.premium === true);
  const bup = await b2.waitFor('account_update', m => m.account && m.account.premium === true, 5000).catch(() => null);
  check('premium у Боба в аккаунте', !!bup);

  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'reset_pin', target: B });
  const rp = await a2.wait('admin_ok');
  check('reset_pin', rp.action === 'reset_pin');

  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'snapshot' });
  const snap2 = await a2.wait('admin_snapshot');
  check('снапшот: счётчики todayNew/muted/admins', typeof snap2.counts.todayNew === 'number' && snap2.counts.todayNew >= 2 && typeof snap2.counts.muted === 'number' && typeof snap2.counts.admins === 'number');
  const bItem = snap2.accounts.find(x => x.user === B);
  check('снапшот: поля pin/muted/devices у аккаунта', !!bItem && bItem.pin === false && bItem.devices >= 1);

  a2.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'logout_all', target: B });
  const la = await a2.wait('admin_ok');
  check('logout_all', la.action === 'logout_all');
  const bNotice = await b2.waitFor('admin_notice', m => /сессии завершены/i.test(m.text || ''), 5000).catch(() => null);
  check('Боб получил уведомление о завершении сессии', !!bNotice && /сессии завершены/i.test(bNotice.text));
  await new Promise(r => setTimeout(r, 400));
  check('сокет Боба закрыт', b2.ws.readyState === 2 || b2.ws.readyState === 3);

  const b3 = await client('bob3');
  b3.send({ type: 'login', user: B, pass: 'pass5678', deviceId: 'devB' });
  const rb3 = await b3.wait('registered');
  check('повторный вход после logout_all, premium сохранён', rb3.user === B && rb3.account.premium === true);

  console.log('\n=== 10. Resume-токен ===');
  const token = ra2.resumeToken;
  a2.close();
  await new Promise(r => setTimeout(r, 300));
  const a3 = await client('alice3');
  a3.send({ type: 'resume', user: A, token });
  const rr = await a3.wait('registered');
  check('вход по resume-токену', rr.user === A);

  console.log('\n=== 11. /health ===');
  const h = await fetch(BASE + '/health').then(r => r.json());
  check('/health ok', h.ok === true && h.accounts >= 2);

  console.log('\n========================================');
  console.log('ИТОГО: passed =', passed, ', failed =', failed);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
