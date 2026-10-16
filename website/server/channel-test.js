/* Тест официального канала «TeleMAX Новости» (владелец mislit_tech) и верификации
   каналов/групп. Сам поднимает сервер на порту 8096 с временным state-файлом.
   Запуск: node channel-test.js */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8096;
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
  const tmpState = path.join(os.tmpdir(), 'telemax-channel-test-' + Date.now() + '.json');
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
  const U1 = 'tester_' + ts, U2 = 'newbie_' + ts;

  /* 1. обычный пользователь: канал приходит сразу после входа */
  console.log('\n=== 1. Официальный канал у пользователя ===');
  const u = await client();
  u.send({ type: 'register', user: U1, name: 'Тестер', pass: 'pass1234', deviceId: 'devU1', deviceLabel: 'Test' });
  check('регистрация пользователя', !!(await u.wait('registered').catch(() => null)));
  const snap = await u.wait('groups_snapshot').catch(() => null);
  const ch = snap && (snap.items || []).find(g => g.id === 'gtelemax');
  check('после входа приходит официальный канал', !!ch);
  check('это канал «TeleMAX Новости»', !!(ch && ch.name === 'TeleMAX Новости' && ch.type === 'channel'));
  check('канал верифицирован (галочка)', !!(ch && ch.verified === true && ch.official === true));
  check('владелец — только mislit_tech', !!(ch && ch.owner === 'mislit_tech' && (ch.admins || []).length === 0));
  check('пользователь подписан автоматически', !!(ch && ch.members.includes(U1)));

  /* 2. регистрация владельца и нового пользователя */
  console.log('\n=== 2. Владелец и новые регистрации ===');
  const owner = await client();
  owner.send({ type: 'register', user: 'mislit_tech', name: 'Mislit Tech', pass: 'pass1234', deviceId: 'devO' });
  check('регистрация @mislit_tech (встроенный уровень 5)', !!(await owner.wait('registered').catch(() => null)));

  const u2 = await client();
  u2.send({ type: 'register', user: U2, name: 'Новичок', pass: 'pass1234', deviceId: 'devU2' });
  await u2.wait('registered').catch(() => null);
  const snap2 = await u2.wait('groups_snapshot').catch(() => null);
  const ch2 = snap2 && (snap2.items || []).find(g => g.id === 'gtelemax');
  check('новый пользователь тоже видит канал', !!(ch2 && ch2.members.includes(U2)));

  /* 3. публикация: только владелец */
  console.log('\n=== 3. Публикация в канале ===');
  owner.drain('*'); u.drain('*');
  owner.send({ type: 'chat_message', to: 'g:gtelemax', text: 'Первый пост от владельца', clientId: 'c1', messageType: 'text' });
  const acc1 = await owner.waitFor('message_accepted', m => m.clientId === 'c1').catch(() => null);
  check('владелец публикует без ошибок', !!acc1);
  const got = await u.waitFor('chat_message', m => m.to === 'g:gtelemax' && m.from === 'mislit_tech').catch(() => null);
  check('подписчик получил пост владельца', !!(got && /Первый пост/.test(got.text)));

  u.send({ type: 'chat_message', to: 'g:gtelemax', text: 'а я не владелец', clientId: 'c2' });
  const err1 = await u.wait('error').catch(() => null);
  check('обычный пользователь писать не может', !!(err1 && /владелец/i.test(err1.message || '')));

  /* 4. верификация: права и защита официальной галочки */
  console.log('\n=== 4. Верификация каналов и групп ===');
  u.drain('*');
  u.send({ type: 'group_verify', id: 'gtelemax', verified: true });
  const err2 = await u.wait('error').catch(() => null);
  check('верификацию меняет только админ (4+)', !!(err2 && /права/i.test(err2.message || '')));

  owner.drain('*');
  owner.send({ type: 'group_verify', id: 'gtelemax', verified: false });
  const err3 = await owner.wait('error').catch(() => null);
  check('официальную галочку снять нельзя', !!(err3 && /нельзя/i.test(err3.message || '')));

  u.send({ type: 'group_leave', id: 'gtelemax' });
  const err4 = await u.wait('error').catch(() => null);
  check('от официального канала нельзя отписаться', !!(err4 && /отписаться/i.test(err4.message || '')));

  /* 5. обычная группа: админ выдаёт галочку */
  u.drain('*'); owner.drain('*');
  u.send({ type: 'create_group', name: 'Тестовая группа', kind: 'group', members: ['mislit_tech'] });
  const gc = await u.wait('group_created').catch(() => null);
  check('обычная группа создана (без галочки)', !!(gc && gc.group && !gc.group.verified));

  owner.send({ type: 'group_verify', id: gc.group.id, verified: true });
  const gv = await owner.wait('group_verified').catch(() => null);
  check('админ верифицировал группу', !!(gv && gv.group.verified === true));
  const gu = await u.waitFor('group_update', m => m.group.id === gc.group.id && m.group.verified === true).catch(() => null);
  check('участники получили group_update с галочкой', !!gu);

  u.send({ type: 'chat_message', to: 'g:' + gc.group.id, text: 'привет, группа', clientId: 'g1' });
  const ga = await u.waitFor('message_accepted', m => m.clientId === 'g1').catch(() => null);
  check('в обычной группе писать может любой участник', !!ga);

  /* 6. админ-снимок содержит верифицированные каналы */
  console.log('\n=== 6. Админ-панель ===');
  owner.send({ type: 'admin_action', action: 'snapshot' });
  const asn = await owner.wait('admin_snapshot').catch(() => null);
  check('админ-снимок содержит verifiedGroups', !!(asn && (asn.verifiedGroups || []).some(g => g.id === 'gtelemax')));

  /* 7. сервер жив */
  const p = await client();
  p.send({ type: 'ping' });
  check('сервер жив (ping/pong)', !!(await p.wait('pong').catch(() => null)));

  u.close(); u2.close(); owner.close(); p.close();
  server.kill();
  log('');
  log(passed + ' ok, ' + failed + ' fail');
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
