/* Тест push-инфраструктуры TeleMAX Web:
   1) шифрование aes128gcm (расшифровываем как браузер),
   2) подпись VAPID JWT,
   3) полный цикл через сервер: подписка → сообщение скрытому/офлайн-пользователю → push,
      видимому — без push, вызов офлайн-пользователю → push + дозвон при заходе.
   Запуск:  node push-test.js   (сервер поднимается сам на порту 8097) */
'use strict';
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const BASE = 'http://127.0.0.1:8097';
const WSURL = 'ws://127.0.0.1:8097';
const push = require('./push');

let passed = 0, failed = 0;
const log = (...a) => console.log('  ', ...a);
function check(name, cond) {
  if (cond) { passed++; log('✓', name); }
  else { failed++; log('✗ FAIL', name); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- браузерные ключи подписки ---------- */
function makeUaKeys() {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = pair.publicKey.export({ type: 'spki', format: 'der' }).slice(-65);
  return { priv: pair.privateKey, pub, auth: crypto.randomBytes(16) };
}
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const SPKI = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
const pubFromPoint = p => crypto.createPublicKey({ key: Buffer.concat([SPKI, p]), format: 'der', type: 'spki' });

function hkdfExtract(salt, ikm) { return crypto.createHmac('sha256', salt).update(ikm).digest(); }
function hkdfExpand(prk, info, len) {
  let out = Buffer.alloc(0), t = Buffer.alloc(0);
  for (let i = 1; out.length < len; i++) {
    t = crypto.createHmac('sha256', prk).update(Buffer.concat([t, info, Buffer.from([i])])).digest();
    out = Buffer.concat([out, t]);
  }
  return out.slice(0, len);
}

/* ---------- расшифровка как это делает браузер (RFC 8291/8188) ---------- */
function decrypt(body, ua) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const data = body.slice(21 + idlen);
  const secret = crypto.diffieHellman({ privateKey: ua.priv, publicKey: pubFromPoint(asPublic) });
  const ikm = hkdfExpand(
    hkdfExtract(ua.auth, secret),
    Buffer.concat([Buffer.from('WebPush: info\0'), ua.pub, asPublic]),
    32
  );
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.slice(data.length - 16));
  let plain = Buffer.concat([d.update(data.slice(0, data.length - 16)), d.final()]);
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end--;
  if (end > 0 && plain[end - 1] === 2) end--;
  const text = plain.slice(0, end).toString('utf8');
  try { return JSON.parse(text); } catch (_) { return text; }
}

function verifyVapid(headers, expectedOrigin) {
  const auth = String(headers['authorization'] || '');
  const m = auth.match(/^vapid t=([^,]+),\s*k=(.+)$/);
  if (!m) return { ok: false, why: 'bad authorization header' };
  const jwt = m[1];
  const parts = jwt.split('.');
  if (parts.length !== 3) return { ok: false, why: 'bad jwt' };
  const sig = unb64u(parts[2]);
  const key = pubFromPoint(unb64u(m[2]));
  const ok = crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1], 'ascii'), { key, dsaEncoding: 'ieee-p1363' }, sig);
  if (!ok) return { ok: false, why: 'signature' };
  const payload = JSON.parse(unb64u(parts[1]).toString('utf8'));
  if (payload.aud !== expectedOrigin) return { ok: false, why: 'aud ' + payload.aud };
  if (!(payload.exp > Date.now() / 1000)) return { ok: false, why: 'exp' };
  return { ok: true, k: m[2] };
}

/* ---------- WS-клиент (как в smoke-test) ---------- */
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
      has: type => inbox.some(x => x.type === type),
      close: () => ws.close()
    }));
    ws.on('error', reject);
  });
}

(async () => {
  console.log('\n=== 0. Юнит: шифрование aes128gcm ===');
  const uaUnit = makeUaKeys();
  const roundtrip = 'Привет! 🎉 Тест "кавычек" и <тегов> — 1234567890';
  const enc = push.encryptPayload(roundtrip, b64u(uaUnit.pub), b64u(uaUnit.auth));
  const dec = decrypt(enc, uaUnit);
  check('шифрование/расшифровка payload', dec === roundtrip);

  const vapidKeys = push.generateVapidKeys();
  check('VAPID-ключи сгенерированы', !!vapidKeys.publicKey && !!vapidKeys.privateKey);

  /* ---------- старт сервера ---------- */
  const tmpState = path.join(os.tmpdir(), 'telemax-push-test-' + Date.now() + '.json');
  const server = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: Object.assign({}, process.env, { PORT: '8097', TMX_STATE: tmpState }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stderr.on('data', d => console.error('[server]', d.toString().trim()));
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(250);
    try { const r = await fetch(BASE + '/health'); ready = (await r.json()).ok === true; } catch (_) {}
  }
  if (!ready) { console.error('Сервер не поднялся'); process.exit(2); }

  /* ---------- мок push-сервиса ---------- */
  const received = [];
  const mock = http.createServer((req, res) => {
    const buf = [];
    req.on('data', c => buf.push(c));
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(buf) });
      res.writeHead(201); res.end();
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const mockPort = mock.address().port;
  const mockOrigin = 'http://127.0.0.1:' + mockPort;

  const ts = Date.now().toString().slice(-6);
  const A = 'alice_' + ts, B = 'bob_' + ts;

  console.log('\n=== 1. Подготовка: аккаунты и подписка ===');
  const ua = makeUaKeys();
  const a = await client();
  a.send({ type: 'register', user: A, name: 'Алиса', pass: 'pass1234', deviceId: 'devA' });
  await a.wait('registered');
  const b = await client();
  b.send({ type: 'register', user: B, name: 'Боб', pass: 'pass5678', deviceId: 'devB' });
  await b.wait('registered');

  const metaRes = await fetch(BASE + '/push/vapid').then(r => r.json());
  check('/push/vapid отдаёт ключ', metaRes.ok === true && typeof metaRes.key === 'string' && metaRes.key.length > 80);

  const subRes = await fetch(BASE + '/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: B,
      subscription: { endpoint: mockOrigin + '/push/sub', keys: { p256dh: b64u(ua.pub), auth: b64u(ua.auth) } }
    })
  }).then(r => r.json());
  check('подписка Боба сохранена', subRes.ok === true && subRes.count === 1);
  const h = await fetch(BASE + '/health').then(r => r.json());
  check('/health считает push-подписки', h.pushSubs === 1);

  const badSub = await fetch(BASE + '/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: 'nobody_' + ts, subscription: { endpoint: 'https://x/y', keys: { p256dh: 'a', auth: 'b' } } })
  }).then(r => r.json());
  check('подписка несуществующего отклонена', badSub.ok === false);

  console.log('\n=== 2. Сообщение скрытому пользователю → push ===');
  a.send({ type: 'app_state', hidden: false });
  b.send({ type: 'app_state', hidden: true });
  await sleep(250);
  a.send({ type: 'chat_message', clientId: 'p1', to: B, messageType: 'text', text: 'Ты тут, Боб?', id: 'pm1' });
  await a.wait('message_accepted');
  for (let i = 0; i < 20 && received.length < 1; i++) await sleep(150);
  check('push отправлен скрытому пользователю', received.length === 1);
  if (received.length) {
    const r = received[0];
    check('Content-Encoding: aes128gcm', r.headers['content-encoding'] === 'aes128gcm');
    const v = verifyVapid(r.headers, mockOrigin);
    check('VAPID JWT подписан корректно (aud/exp/ES256)', v.ok === true);
    check('k= совпадает с ключом сервера', v.k === metaRes.key);
    let payload = null;
    try { payload = decrypt(r.body, ua); } catch (e) { payload = { error: e.message }; }
    check('payload расшифрован', !!payload && !payload.error);
    if (payload && !payload.error) {
      check('заголовок = имя отправителя', payload.title === 'Алиса');
      check('текст сообщения', /Ты тут, Боб\?/.test(payload.body));
      check('data.chat = u_отправитель', payload.data && payload.data.chat === 'u_' + A);
      check('data.user = отправитель', payload.data && payload.data.user === A);
    }
    const recv = await b.waitFor('chat_message', m => m.id === 'pm1');
    check('WS-сообщение тоже доставлено скрытому', recv.text === 'Ты тут, Боб?');
  }

  console.log('\n=== 3. Видимому пользователю push не шлём ===');
  const before = received.length;
  b.send({ type: 'app_state', hidden: false });
  await sleep(250);
  a.send({ type: 'chat_message', clientId: 'p2', to: B, messageType: 'text', text: 'Видное сообщение', id: 'pm2' });
  await a.wait('message_accepted');
  await sleep(900);
  check('push не отправлен, пока вкладка видна', received.length === before);
  await b.waitFor('chat_message', m => m.id === 'pm2');

  console.log('\n=== 4. Офлайн-пользователь → push + очередь ===');
  const before2 = received.length;
  b.close();
  await sleep(400);
  a.send({ type: 'chat_message', clientId: 'p3', to: B, messageType: 'text', text: 'Я ушёл, но сообщение ждёт', id: 'pm3' });
  const acc = await a.wait('message_accepted');
  check('сообщение ушло в очередь', acc.delivered === false && acc.queued === true);
  for (let i = 0; i < 20 && received.length < before2 + 1; i++) await sleep(150);
  check('push отправлен офлайн-пользователю', received.length === before2 + 1);
  if (received.length > before2) {
    let payload = null;
    try { payload = decrypt(received[before2].body, ua); } catch (e) { payload = { error: e.message }; }
    check('payload офлайн-сообщения по-русски цел', payload && /сообщение ждёт/.test(payload.body || ''));
  }

  console.log('\n=== 5. Вызов офлайн-пользователю: push + дозвон при заходе ===');
  const before3 = received.length;
  a.send({ type: 'call', to: B, video: false, callId: 'call-1' });
  await sleep(400);
  check('звонок офлайн не даёт ошибку звонящему', !a.has('error'));
  for (let i = 0; i < 20 && received.length < before3 + 1; i++) await sleep(150);
  check('push о звонке отправлен', received.length === before3 + 1);
  if (received.length > before3) {
    let payload = null;
    try { payload = decrypt(received[before3].body, ua); } catch (e) { payload = { error: e.message }; }
    check('push про звонок: kind=call', payload && payload.data && payload.data.kind === 'call');
    check('push про звонок: содержит "звонит"', /звонит/.test(payload.body || ''));
  }
  const b2 = await client();
  b2.send({ type: 'login', user: B, pass: 'pass5678', deviceId: 'devB' });
  await b2.wait('registered');
  const queued1 = await b2.waitFor('chat_message', m => m.id === 'pm3');
  check('офлайн-очередь доставлена после входа', /сообщение ждёт/.test(queued1.text));
  const ring = await b2.waitFor('call', m => m.from === A, 5000).catch(() => null);
  check('вызов дозвонен после захода в сеть', !!ring && ring.callId === 'call-1');

  console.log('\n=== 6. Отписка === ');
  const un = await fetch(BASE + '/push/unsubscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: B, endpoint: mockOrigin + '/push/sub' })
  }).then(r => r.json());
  check('отписка ok', un.ok === true);
  const h2 = await fetch(BASE + '/health').then(r => r.json());
  check('/health: подписок 0', h2.pushSubs === 0);

  console.log('\n========================================');
  console.log('ИТОГО: passed =', passed, ', failed =', failed);
  server.kill();
  mock.close();
  try { fs.unlinkSync(tmpState); } catch (_) {}
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
