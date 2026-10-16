/* Тест глобального поиска (люди, каналы, боты; группы — нет) и кнопки «Вступить» в канал.
   Сам поднимает сервер на порту 8093 с временным state-файлом.
   Запуск: node global-test.js */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8093;
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
  const tmpState = path.join(os.tmpdir(), 'telemax-global-test-' + Date.now() + '.json');
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
  const QC = 'qcanal' + ts;        // уникальный фрагмент имени канала
  const QG = 'qgroup' + ts;        // уникальный фрагмент имени группы
  const A = 'gl_a_' + ts, B = 'gl_b_' + ts, OWNER = 'mislit_tech', BOT = 'telemaxbot';

  console.log('\n=== 1. Подготовка ===');
  const a = await client();
  a.send({ type: 'register', user: A, name: 'Аня ' + QC, pass: 'pass1234', deviceId: 'devA' });
  check('регистрация А', !!(await a.wait('registered').catch(() => null)));
  const b = await client();
  b.send({ type: 'register', user: B, name: 'Боря ' + QG, pass: 'pass1234', deviceId: 'devB' });
  check('регистрация Б', !!(await b.wait('registered').catch(() => null)));
  const own = await client();
  own.send({ type: 'register', user: OWNER, name: 'Mislit Tech', pass: 'pass1234', deviceId: 'devO' });
  check('регистрация владельца (уровень 5)', !!(await own.wait('registered').catch(() => null)));
  const bot = await client();
  bot.send({ type: 'register', user: BOT, name: 'TeleMAX Bot', pass: 'pass1234', deviceId: 'devBot' });
  check('регистрация бота', !!(await bot.wait('registered').catch(() => null)));
  a.drain('*'); b.drain('*'); own.drain('*'); bot.drain('*');

  console.log('\n=== 2. Канал и группа с похожими именами ===');
  a.send({ type: 'create_group', name: 'Канал ' + QC, kind: 'channel', members: [] });
  const gc = await a.wait('group_created').catch(() => null);
  check('канал создан', !!(gc && gc.group && gc.group.type === 'channel'));
  a.send({ type: 'create_group', name: 'Группа ' + QG, kind: 'group', members: [] });
  const gg = await a.wait('group_created').catch(() => null);
  check('группа создана', !!(gg && gg.group && gg.group.type === 'group'));
  const cid = gc.group.id, gid = gg.group.id;
  a.drain('*');

  console.log('\n=== 3. Поиск по людям ===');
  b.send({ type: 'search_global', q: ts });
  const r1 = await b.wait('search_global_result').catch(() => null);
  check('люди: Аня найдена по имени', !!(r1 && r1.users.some(u => u.user === A)));
  a.send({ type: 'search_global', q: ts });
  const r2 = await a.wait('search_global_result').catch(() => null);
  check('себя в результатах не показываем', !!(r2 && !r2.users.some(u => u.user === A)));
  check('люди: Боря виден Ане', !!(r2 && r2.users.some(u => u.user === B)));

  console.log('\n=== 4. Поиск по каналам и группам ===');
  b.send({ type: 'search_global', q: QC });
  const r3 = await b.wait('search_global_result').catch(() => null);
  const ch3 = r3 && r3.channels.find(c => c.id === cid);
  check('канал найден по имени', !!ch3);
  check('канал: joined=false (не подписан)', !!(ch3 && ch3.joined === false));
  check('канал: счётчик подписчиков = 1', !!(ch3 && ch3.members === 1));
  b.send({ type: 'search_global', q: QG });
  const r4 = await b.wait('search_global_result').catch(() => null);
  check('ГРУППА в глобальный поиск НЕ попадает', !!(r4 && !r4.channels.some(c => c.id === gid) && !r4.users.some(u => u.name && u.name.includes(QG + '_group'))));
  b.send({ type: 'search_global', q: gid });
  const r5 = await b.wait('search_global_result').catch(() => null);
  check('поиск по id группы тоже не даёт каналов', !!(r5 && !r5.channels.some(c => c.id === gid)));

  console.log('\n=== 5. Вступление в канал (кнопка «Вступить») ===');
  b.send({ type: 'group_join', id: gid });
  const jErr = await b.waitFor('error', m => /только в канал/i.test(m.message || '')).catch(() => null);
  check('в группу вступить из поиска нельзя', !!jErr);
  b.send({ type: 'group_join', id: cid });
  const joi = await b.waitFor('group_joined', m => m.group && m.group.id === cid).catch(() => null);
  check('вступление в канал: group_joined', !!(joi && joi.already === false));
  check('канал: подписчиков стало 2', !!(joi && joi.group.members.length === 2));
  check('канал: Б теперь в members', !!(joi && joi.group.members.includes(B)));
  const upd = await a.waitFor('group_update', m => m.group && m.group.id === cid && (m.group.members || []).includes(B)).catch(() => null);
  check('владелец получил group_update с новым счётчиком', !!upd);
  b.send({ type: 'group_join', id: cid });
  const joi2 = await b.waitFor('group_joined', m => m.group && m.group.id === cid).catch(() => null);
  check('повторное вступление: already=true', !!(joi2 && joi2.already === true));
  b.send({ type: 'search_global', q: QC });
  const r6 = await b.waitFor('search_global_result', m => (m.channels || []).some(c => c.id === cid)).catch(() => null);
  const ch6 = r6 && r6.channels.find(c => c.id === cid);
  check('после вступления канал: joined=true', !!(ch6 && ch6.joined === true));

  console.log('\n=== 6. После подписки приходят посты канала ===');
  a.drain('*'); b.drain('*');
  a.send({ type: 'chat_message', clientId: 'gp1', to: 'g:' + cid, messageType: 'text', text: 'пост для подписчиков' });
  const post = await b.waitFor('chat_message', m => m.clientId === 'gp1').catch(() => null);
  check('подписчик получил пост канала', !!(post && post.to === 'g:' + cid));

  console.log('\n=== 7. Боты в поиске ===');
  a.send({ type: 'search_global', q: 'telemax' });
  const r7 = await a.wait('search_global_result').catch(() => null);
  check('бот telemaxbot найден в разделе «Боты»', !!(r7 && r7.bots.some(x => x.user === BOT)));
  check('бот не продублирован в «Люди»', !!(r7 && !r7.users.some(x => x.user === BOT)));

  console.log('\n=== 8. Забаненные не находятся ===');
  own.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'ban', target: B });
  check('Бан Б', !!(await own.wait('admin_ok').catch(() => null)));
  a.send({ type: 'search_global', q: B });
  const r8 = await a.wait('search_global_result').catch(() => null);
  check('забаненный отсутствует в поиске', !!(r8 && !r8.users.some(x => x.user === B)));
  own.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'unban', target: B });
  await own.wait('admin_ok').catch(() => null);

  console.log('\n=== 9. Служебное ===');
  a.send({ type: 'search_global', q: '' });
  const r9 = await a.wait('search_global_result').catch(() => null);
  check('пустой запрос → пустые списки', !!(r9 && !r9.users.length && !r9.channels.length && !r9.bots.length));
  const p = await client();
  p.send({ type: 'ping' });
  check('сервер жив (ping/pong)', !!(await p.wait('pong').catch(() => null)));

  a.close(); b.close(); own.close(); bot.close(); p.close();
  server.kill();
  log('');
  log(passed + ' ok, ' + failed + ' fail');
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
