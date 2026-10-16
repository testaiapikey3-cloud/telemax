/* Тест авто-объявлений об обновлении: POST /admin/announce → пост в канал
 * «TeleMAX Новости» всем подписчикам (онлайн, офлайн-очередь, Web Push).
 * Сам поднимает сервер на порту 8098 с временным state-файлом.
 * Запуск: node announce-test.js */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8098;
const BASE = 'http://127.0.0.1:' + PORT;
const WSURL = 'ws://127.0.0.1:' + PORT;

const log = (...a) => console.log('  ', ...a);
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; log('✓', name); }
  else { failed++; log('✗ FAIL', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function post(p, body) {
  return fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => ({ status: r.status, json: await r.json().catch(() => ({})) }));
}

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
  const tmpState = path.join(os.tmpdir(), 'telemax-announce-test-' + Date.now() + '.json');
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
  const A = 'an_a_' + ts;

  console.log('\n=== 1. Подготовка ===');
  const a = await client();
  a.send({ type: 'register', user: A, name: 'Аня Тест', pass: 'pass1234', deviceId: 'devA' });
  check('регистрация подписчика', !!(await a.wait('registered').catch(() => null)));
  a.drain('*');

  const tokFile = path.join(__dirname, 'restart.token');
  let TOKEN = '';
  for (let i = 0; i < 20 && !TOKEN; i++) { try { TOKEN = fs.readFileSync(tokFile, 'utf8').trim(); } catch (_) { await sleep(150); } }
  check('SSH-токен перезапуска прочитан', TOKEN.length >= 16);

  console.log('\n=== 2. Допуск ===');
  const bad = await post('/admin/announce', { token: 'wrong', text: 'взлом' });
  check('неверный токен → 403', bad.status === 403 && bad.json.ok === false);

  console.log('\n=== 3. Текстовое объявление ===');
  const t1 = await post('/admin/announce', { token: TOKEN, text: '🚀 Обновление тестовое ' + ts });
  check('объявление принято', t1.status === 200 && t1.json.ok === true);
  check('канал gtelemax', t1.json.channel === 'gtelemax');
  check('есть онлайн-получатели', t1.json.delivered >= 1);
  const m1 = await a.waitFor('chat_message', m => m.to === 'g:gtelemax' && /Обновление тестовое/.test(m.text), 5000).catch(() => null);
  check('подписчик получил пост (WS)', !!m1);
  check('отправитель — владелец канала', !!m1 && m1.from === 'mislit_tech');
  check('имя канала в сообщении', !!m1 && m1.groupName === 'TeleMAX Новости');
  check('id сообщения вернулся', !!m1 && m1.id === t1.json.id);

  console.log('\n=== 4. Опрос ===');
  const t2 = await post('/admin/announce', { token: TOKEN, text: 'Что нового?', messageType: 'poll', poll: { question: 'Как вам 1.2.9?', options: ['Огонь', 'Нормально', 'Нужны правки'] } });
  check('опрос принят', t2.status === 200 && t2.json.ok === true && t2.json.messageType === 'poll');
  const m2 = await a.waitFor('chat_message', m => m.messageType === 'poll' && m.poll && m.poll.question === 'Как вам 1.2.9?', 5000).catch(() => null);
  check('подписчик получил опрос', !!m2);
  check('варианты опроса', !!m2 && m2.poll.options.length === 3 && m2.poll.options[0] === 'Огонь');
  check('голоса пустые', !!m2 && m2.poll.votes && Object.keys(m2.poll.votes).length === 0);

  console.log('\n=== 5. Фото / видео / файл ===');
  const t3 = await post('/admin/announce', { token: TOKEN, text: 'Скриншот', messageType: 'image', uri: '/uploads/ann-' + ts + '.jpg' });
  check('фото принято', t3.status === 200 && t3.json.messageType === 'image');
  const m3 = await a.waitFor('chat_message', m => m.messageType === 'image' && m.uri === '/uploads/ann-' + ts + '.jpg', 5000).catch(() => null);
  check('подписчик получил фото', !!m3 && m3.text === 'Скриншот');

  const t4 = await post('/admin/announce', { token: TOKEN, text: 'Апдейт-ролик', messageType: 'video', uri: '/uploads/ann-' + ts + '.mp4', duration: 42 });
  const m4 = await a.waitFor('chat_message', m => m.messageType === 'video' && m.duration === 42, 5000).catch(() => null);
  check('подписчик получил видео', t4.status === 200 && !!m4);

  const t5 = await post('/admin/announce', { token: TOKEN, text: 'Файл обновления', messageType: 'file', uri: '/uploads/telemax-' + ts + '.zip', fileName: 'telemax.zip', fileSize: 123456 });
  const m5 = await a.waitFor('chat_message', m => m.messageType === 'file' && m.fileName === 'telemax.zip', 5000).catch(() => null);
  check('подписчик получил файл', t5.status === 200 && !!m5 && m5.fileSize === 123456);

  console.log('\n=== 6. Валидация ===');
  const e1 = await post('/admin/announce', { token: TOKEN, text: '' });
  check('пустой текст → 400', e1.status === 400);
  const e2 = await post('/admin/announce', { token: TOKEN, text: 'x', messageType: 'poll', poll: { question: 'Q', options: [] } });
  check('пустой опрос → 400', e2.status === 400);
  const e3 = await post('/admin/announce', { token: TOKEN, text: 'x', channel: 'nope' });
  check('неизвестный канал → 404', e3.status === 404);

  console.log('\n=== 7. ADMIN-KEY тоже допускается ===');
  const k1 = await post('/admin/announce', { adminKey: 'testtestest654', text: 'По ключу ' + ts });
  check('объявление по admin-ключу', k1.status === 200 && k1.json.ok === true);
  a.drain('*');

  console.log('\n=== 8. Офлайн-подписчик: очередь ===');
  a.close();
  await sleep(400);
  const t6 = await post('/admin/announce', { token: TOKEN, text: 'Офлайн-обновление ' + ts });
  check('объявление офлайн-подписчику принято', t6.status === 200);
  const a2 = await client();
  a2.send({ type: 'login', user: A, pass: 'pass1234', deviceId: 'devA2', deviceLabel: 'Тест' });
  check('повторный вход (логин)', !!(await a2.wait('registered').catch(() => null)));
  const q1 = await a2.waitFor('chat_message', m => m.to === 'g:gtelemax' && /Офлайн-обновление/.test(m.text), 6000).catch(() => null);
  check('офлайн-очередь доставила объявление', !!q1);
  a2.close();

  console.log('\n=== 9. Голосование в опросе канала (синхронизация) ===');
  const b2 = await client();
  b2.send({ type: 'register', user: 'an_b_' + ts, name: 'Борис Тест', pass: 'pass1234', deviceId: 'devB' });
  check('второй подписчик зарегистрирован', !!(await b2.wait('registered').catch(() => null)));
  b2.drain('*');
  const pollId = m2 ? m2.id : 'none';
  const a3 = await client();
  a3.send({ type: 'login', user: A, pass: 'pass1234', deviceId: 'devA3', deviceLabel: 'Тест' });
  check('голосующий вошёл', !!(await a3.wait('registered').catch(() => null)));
  a3.drain('*');
  const votes = {}; votes[A] = 0;
  a3.send({ type: 'poll_vote', chatId: 'g_gtelemax', messageId: pollId, option: 0, votes, poll: { question: 'Как вам 1.2.9?', options: ['Огонь', 'Нормально', 'Нужны правки'], votes } });
  const pu = await b2.waitFor('poll_update', m => m.messageId === pollId, 5000).catch(() => null);
  check('подписчик видит голос другого', !!pu);
  check('chatId опроса g_gtelemax', !!pu && pu.chatId === 'g_gtelemax');
  check('голос записан (вариант 0)', !!pu && pu.votes && pu.votes[A] === 0);
  const puSelf = await a3.waitFor('poll_update', m => m.messageId === pollId, 3000).catch(() => null);
  check('свои устройства тоже получают голос', !!puSelf);
  a3.close(); b2.close();

  await sleep(300);
  server.kill();
  try { fs.unlinkSync(tmpState); } catch (_) {}
  console.log('\n' + (failed ? '✗ ' + failed + ' FAIL, ' : '✓ всё ') + passed + ' pass' + (failed ? ' / ' + passed + ' ok' : ''));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
