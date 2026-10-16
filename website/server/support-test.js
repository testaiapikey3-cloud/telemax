/* Тест ИИ-поддержки TeleMAX: любой пользователь может позвать человека —
   запрос сохраняется у администраторов, онлайн-админы получают support_new. */
const WebSocket = require('ws');
const WSURL = 'ws://127.0.0.1:8099';

const log = (...a) => console.log('  ', ...a);
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; log('✓', name); }
  else { failed++; log('✗ FAIL', name); }
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
  const ts = Date.now().toString().slice(-6);
  const ADMIN = 'boss_' + ts, U1 = 'sup_' + ts;

  /* 1. админ: регистрация + роль 5 */
  const boss = await client();
  boss.send({ type: 'register', user: ADMIN, name: 'Boss', pass: 'pass1234', deviceId: 'devBoss', deviceLabel: 'Test' });
  check('регистрация администратора', !!(await boss.wait('registered').catch(() => null)));
  boss.drain('*');
  boss.send({ type: 'admin_action', adminKey: 'testtestest654', action: 'set_role', target: ADMIN, role: 5 });
  const rl = await boss.wait('admin_ok').catch(() => null);
  check('роль 5 выдана', !!(rl && rl.action === 'set_role'));
  boss.drain('*');

  /* 2. пользователь: запрос живого человека */
  const u = await client();
  u.send({ type: 'register', user: U1, name: 'Тестера', pass: 'pass1234', deviceId: 'devU', deviceLabel: 'Test' });
  check('регистрация пользователя', !!(await u.wait('registered').catch(() => null)));
  u.drain('*'); boss.drain('*');

  u.send({ type: 'support_create', text: 'Здравствуйте, помогите: не приходят уведомления в Яндекс Браузере' });
  const ok = await u.wait('support_ok').catch(() => null);
  check('support_create → support_ok', !!ok);

  const sn = await boss.wait('support_new', 6000).catch(() => null);
  check('онлайн-админ получил support_new', !!(sn && sn.from === U1));

  /* 3. ошибки */
  u.drain('*');
  u.send({ type: 'support_create', text: '   ' });
  const e1 = await u.wait('error').catch(() => null);
  check('пустой запрос → ошибка', !!(e1 && /пуст/i.test(e1.message || '')));

  const a2 = await client();
  a2.send({ type: 'support_create', text: 'без входа' });
  const e2 = await a2.wait('error').catch(() => null);
  check('без входа → отказ', !!(e2 && /войд/i.test(e2.message || '')));

  /* 4. сервер жив */
  const p = await client();
  p.send({ type: 'ping' });
  check('сервер жив (ping/pong)', !!(await p.wait('pong').catch(() => null)));

  boss.close(); u.close(); a2.close(); p.close();
  log('');
  log(passed + ' ok, ' + failed + ' fail');
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
