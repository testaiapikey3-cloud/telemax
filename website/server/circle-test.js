/* Тест видеокружков: сервер доставляет circle/duration и текст превью.
   Сам поднимает сервер на порту 8095 с временным state-файлом.
   Запуск: node circle-test.js */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8095;
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
  const tmpState = path.join(os.tmpdir(), 'telemax-circle-test-' + Date.now() + '.json');
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
  const A = 'circ_a_' + ts, B = 'circ_b_' + ts;

  console.log('\n=== 1. Подготовка ===');
  const a = await client();
  a.send({ type: 'register', user: A, name: 'Аня', pass: 'pass1234', deviceId: 'devA' });
  check('регистрация А', !!(await a.wait('registered').catch(() => null)));
  const b = await client();
  b.send({ type: 'register', user: B, name: 'Боря', pass: 'pass1234', deviceId: 'devB' });
  check('регистрация Б', !!(await b.wait('registered').catch(() => null)));
  a.drain('*'); b.drain('*');

  console.log('\n=== 2. Видеокружок доставляется с флагом circle ===');
  a.send({
    type: 'chat_message', clientId: 'cc1', to: B,
    messageType: 'video', circle: true, uri: '/uploads/circle_test.webm',
    fileName: 'circle_test.webm', fileSize: 123456, duration: 12.5, text: ''
  });
  const acc = await a.waitFor('message_accepted', m => m.clientId === 'cc1').catch(() => null);
  check('кружок принят сервером', !!acc);
  const got = await b.waitFor('chat_message', m => m.from === A && m.clientId === 'cc1').catch(() => null);
  check('получатель видит circle = true', !!(got && got.circle === true));
  check('получатель видит uri кружка', !!(got && got.uri === '/uploads/circle_test.webm'));
  check('длительность кружка сохранена (12.5)', !!(got && Number(got.duration) === 12.5));
  check('тип сообщения video', !!(got && got.messageType === 'video'));

  console.log('\n=== 3. Обычное видео не помечается кружком ===');
  b.drain('*');
  b.send({
    type: 'chat_message', clientId: 'cc2', to: A,
    messageType: 'video', circle: false, uri: '/uploads/normal.mp4',
    fileName: 'normal.mp4', fileSize: 999, duration: 0
  });
  const got2 = await a.waitFor('chat_message', m => m.from === B && m.clientId === 'cc2').catch(() => null);
  check('обычное видео: circle = false', !!(got2 && got2.circle === false));

  console.log('\n=== 4. Отдача файлов: Content-Length и Range ===');
  const buf = Buffer.from('0123456789abcdef');
  const upRes = await fetch(BASE + '/upload?user=' + A + '&name=rangetest.bin', { method: 'POST', body: buf });
  const upj = await upRes.json();
  check('загрузка тестового файла', !!(upj && upj.ok));
  const g1 = await fetch(BASE + upj.url);
  check('GET отдаёт Content-Length', g1.headers.get('content-length') === '16');
  check('Accept-Ranges: bytes', g1.headers.get('accept-ranges') === 'bytes');
  const g2 = await fetch(BASE + upj.url, { headers: { Range: 'bytes=0-3' } });
  check('Range → 206 Partial Content', g2.status === 206);
  check('Content-Range верный', g2.headers.get('content-range') === 'bytes 0-3/16');
  check('частичные данные верные', Buffer.from(await g2.arrayBuffer()).toString() === '0123');
  const g3 = await fetch(BASE + upj.url, { headers: { Range: 'bytes=99-' } });
  check('некорректный Range → 416', g3.status === 416);
  const g4 = await fetch(BASE + upj.url, { headers: { Range: 'bytes=8-' } });
  check('Range до конца файла', g4.status === 206 && Buffer.from(await g4.arrayBuffer()).toString() === '89abcdef');

  console.log('\n=== 5. Сервер жив ===');
  const p = await client();
  p.send({ type: 'ping' });
  check('ping/pong', !!(await p.wait('pong').catch(() => null)));

  a.close(); b.close(); p.close();
  server.kill();
  log('');
  log(passed + ' ok, ' + failed + ' fail');
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
