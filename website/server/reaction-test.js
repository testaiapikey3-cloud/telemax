/* Тест реакций (как в MAX) и стикеров: доставка, эхо, группа, очередь офлайн, валидация.
   Сам поднимает сервер на порту 8094 с временным state-файлом.
   Запуск: node reaction-test.js */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8094;
const BASE = 'http://127.0.0.1:' + PORT;
const WSURL = 'ws://127.0.0.1:' + PORT;

const log = (...a) => console.log('  ', ...a);
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; log('✓', name); }
  else { failed++; log('✗ FAIL', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client() {
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
  const tmpState = path.join(os.tmpdir(), 'telemax-reaction-test-' + Date.now() + '.json');
  const server = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), TMX_STATE: tmpState }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', d => console.error('[server]', d.toString().trim()));
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(250);
    try { const r = await fetch(BASE + '/health'); ready = (await r.json()).ok === true; } catch (_) {}
  }
  if (!ready) { console.error('Сервер не поднялся'); process.exit(2); }

  const ts = Date.now().toString().slice(-6);
  const A = 'rea_a_' + ts, B = 'rea_b_' + ts, C = 'rea_c_' + ts;

  console.log('\n=== 1. Подготовка ===');
  const a = await client();
  a.send({ type: 'register', user: A, name: 'Аня', pass: 'pass1234', deviceId: 'devA' });
  check('регистрация А', !!(await a.wait('registered').catch(() => null)));
  const b = await client();
  b.send({ type: 'register', user: B, name: 'Боря', pass: 'pass1234', deviceId: 'devB' });
  check('регистрация Б', !!(await b.wait('registered').catch(() => null)));
  const c = await client();
  c.send({ type: 'register', user: C, name: 'Вася', pass: 'pass1234', deviceId: 'devC' });
  check('регистрация В', !!(await c.wait('registered').catch(() => null)));
  a.drain('*'); b.drain('*'); c.drain('*');

  console.log('\n=== 2. Сообщение, затем реакция в личке ===');
  a.send({ type: 'chat_message', clientId: 'r1', to: B, messageType: 'text', text: 'привет' });
  const got = await b.waitFor('chat_message', m => m.from === A && m.clientId === 'r1').catch(() => null);
  check('Б получил сообщение', !!got);
  b.send({ type: 'reaction', to: A, chatId: 'u_' + A, msgId: 'r1', emoji: '❤️', on: true });
  const toA = await a.waitFor('reaction', m => m.from === B && m.msgId === 'r1').catch(() => null);
  check('А получил реакцию ❤️', !!(toA && toA.emoji === '❤️' && toA.on === true));
  check('реакция с правильным to/chatId', !!(toA && toA.to === A));
  const echo = await b.waitFor('reaction', m => m.from === B && m.msgId === 'r1').catch(() => null);
  check('эхо реакции на своё устройство', !!(echo && echo.on === true));

  console.log('\n=== 3. Снятие реакции ===');
  b.send({ type: 'reaction', to: A, chatId: 'u_' + A, msgId: 'r1', emoji: '❤️', on: false });
  const off = await a.waitFor('reaction', m => m.from === B && m.msgId === 'r1' && m.on === false).catch(() => null);
  check('А видит снятие реакции (on=false)', !!off);

  console.log('\n=== 4. Валидация реакций ===');
  b.send({ type: 'reaction', to: A, chatId: 'u_' + A, msgId: 'r1', emoji: '💣', on: true });
  const err = await b.waitFor('error', m => /реакц/i.test(m.message || '')).catch(() => null);
  check('недопустимая реакция отклонена', !!err);
  b.send({ type: 'reaction', to: A, chatId: 'u_' + A, msgId: '', emoji: '👍', on: true });
  b.send({ type: 'reaction', to: 'no_such_user_zzz', chatId: 'x', msgId: 'r1', emoji: '👍', on: true });
  const coin = await b.waitFor('reaction', m => m.emoji === '👍' && m.msgId === 'r1', 600).catch(() => null);
  check('без msgId / несуществующий адресат — тихо игнорируется', !coin);

  console.log('\n=== 5. Реакции в группе ===');
  a.send({ type: 'create_group', name: 'Реакции-тест', kind: 'group', members: [B] });
  const gc = await a.wait('group_created').catch(() => null);
  check('группа создана', !!(gc && gc.group && gc.group.id));
  const gid = gc.group.id;
  const gSnapB = await b.waitFor('group_created', m => m.group && m.group.id === gid).catch(() => null);
  check('Б получил group_created', !!gSnapB);
  a.drain('*'); b.drain('*'); c.drain('*');
  a.send({ type: 'chat_message', to: 'g:' + gid, clientId: 'gr1', messageType: 'text', text: 'всем привет' });
  const gmsg = await b.waitFor('chat_message', m => m.clientId === 'gr1' && m.to === 'g:' + gid).catch(() => null);
  check('Б получил сообщение группы', !!gmsg);
  c.send({ type: 'reaction', to: 'g:' + gid, chatId: 'g:' + gid, msgId: 'gr1', emoji: '🔥', on: true });
  const cErr = await c.waitFor('error', m => /группа/i.test(m.message || '')).catch(() => null);
  check('не участник группы не может реагировать', !!cErr);
  b.send({ type: 'reaction', to: 'g:' + gid, chatId: 'g:' + gid, msgId: 'gr1', emoji: '🔥', on: true });
  const gRea = await a.waitFor('reaction', m => m.from === B && m.emoji === '🔥' && m.msgId === 'gr1').catch(() => null);
  check('А получил реакцию 🔥 в группе', !!(gRea && gRea.on === true));
  check('реакция группы адресована g:' + gid, !!(gRea && gRea.to === 'g:' + gid));

  console.log('\n=== 6. Офлайн-очередь реакций ===');
  a.close();
  await sleep(300);
  b.send({ type: 'reaction', to: A, chatId: 'u_' + A, msgId: 'r1', emoji: '😂', on: true });
  await sleep(300);
  const a2 = await client();
  a2.send({ type: 'login', user: A, pass: 'pass1234', deviceId: 'devA2' });
  check('повторный вход А', !!(await a2.wait('registered').catch(() => null)));
  const queued = await a2.waitFor('reaction', m => m.msgId === 'r1' && m.emoji === '😂').catch(() => null);
  check('реакция доставлена из очереди после входа', !!(queued && queued.on === true));

  console.log('\n=== 7. Стикер как сообщение ===');
  const svgUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#ffd93b"/></svg>');
  a2.send({ type: 'chat_message', clientId: 'stk1', to: B, messageType: 'sticker', uri: svgUri, text: '' });
  const accStk = await a2.waitFor('message_accepted', m => m.clientId === 'stk1').catch(() => null);
  check('стикер принят сервером', !!accStk);
  const gotStk = await b.waitFor('chat_message', m => m.clientId === 'stk1' && m.from === A).catch(() => null);
  check('Б получил стикер (messageType=sticker)', !!(gotStk && gotStk.messageType === 'sticker'));
  check('uri стикера доставлен целиком', !!(gotStk && String(gotStk.uri) === svgUri));

  console.log('\n=== 7b. Видео с подписью (одним сообщением) ===');
  a2.send({ type: 'chat_message', clientId: 'vid1', to: B, messageType: 'video', uri: '/uploads/v1.mp4', fileName: 'v1.mp4', fileSize: 12345, text: 'Смотри какое видео!' });
  const gotVid = await b.waitFor('chat_message', m => m.clientId === 'vid1' && m.from === A).catch(() => null);
  check('видео и подпись — одно сообщение', !!(gotVid && gotVid.messageType === 'video' && gotVid.text === 'Смотри какое видео!'));
  check('подпись не потерялась при кружке-флаге false', !!(gotVid && gotVid.circle !== true));

  console.log('\n=== 8. Сервер жив ===');
  const p = await client();
  p.send({ type: 'ping' });
  check('ping/pong', !!(await p.wait('pong').catch(() => null)));

  b.close(); c.close(); a2.close(); p.close();
  server.kill();
  log('');
  log(passed + ' ok, ' + failed + ' fail');
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
