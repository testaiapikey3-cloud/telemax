/**
 * TeleMAX Web v1.0 — realtime server
 * - Раздаёт статику сайта (index.html, css/, js/)
 * - WebSocket: регистрация/вход, чаты 1-на-1, группы/каналы, офлайн-очередь,
 *   presence (онлайн + время сессии), опросы, подарки/NFT/TeleCoin, облако,
 *   жалобы, полный Admin Mode, сигналинг звонков WebRTC.
 * Запуск:  npm install  &&  node index.js   →  http://localhost:8080
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const push = require('./push');
const translate = require('./translate');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || process.env.IP || '0.0.0.0';
const ADMIN_KEY = process.env.TMX_ADMIN_KEY || 'testtestest654';
const LEVEL5 = ['mislit_tech', 'i_11_bot'];
const VERSION = '1.2.6-web';
const STARTED = Date.now();
const PUSH_SUBJECT = process.env.TMX_PUSH_SUBJECT || 'mailto:telemax@alwaysdata.net';

const ROOT = path.join(__dirname, '..');               // корень сайта (статика)
const DATA_FILE = process.env.TMX_STATE || path.join(__dirname, 'telemax-state.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_UPLOAD = 500 * 1024 * 1024;                  // 500 MB
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* автоперевод интерфейса: кэш словарей на диске */
translate.init(path.join(__dirname, 'lang-cache'));
/* токен перезапуска при деплое — читается только по SSH (server/restart.token) */
try { fs.writeFileSync(path.join(__dirname, 'restart.token'), crypto.randomBytes(16).toString('hex'), { mode: 0o600 }); } catch (_) {}
/* файлы сайта, которые нужно перевести при прогреве языка */
function siteFiles() {
  const files = [path.join(ROOT, 'index.html'), path.join(ROOT, 'manifest.json'), path.join(ROOT, 'sw.js')];
  try { for (const f of fs.readdirSync(path.join(ROOT, 'js'))) if (/\.js$/.test(f)) files.push(path.join(ROOT, 'js', f)); } catch (_) {}
  return files;
}
/* системные строки push-уведомлений (тоже переводятся) */
const PUSH_UI = ['Фото', 'Видео', 'Видеосообщение', 'Голосовое сообщение', 'Файл', 'Подарок', 'Опрос', 'Стикер', 'Новое сообщение', 'звонит вам', '📞 Входящий звонок — TeleMAX', '📹 Видеозвонок — TeleMAX', '🆘 Запрос поддержки — TeleMAX'];
/* допустимые реакции (как в MAX) */
const REACTIONS = ['👍', '❤️', '🔥', '😂', '😮', '😢', '🎉', '👎'];

/* ------------------------------ состояние ------------------------------ */
const state = {
  accounts: {},    // user -> account
  presence: {},    // user -> {online, since, lastSeen}
  groups: {},      // gid -> {id,name,type,owner,members,createdAt}
  pending: {},     // user -> [messages]
  history: {},     // user -> [chat_message] последние (подгрузка на другие устройства)
  reports: [],     // жалобы
  broadcast: { text: '', time: 0 },
  supportCodes: {},// code -> {user, exp}
  pushSubs: {},    // user -> [{endpoint, keys:{p256dh,auth}, time, ua}] — Web Push подписки
  pendingCalls: {},// callee -> {from, video, callId, exp} — вызов офлайн-пользователю
  vapid: null      // VAPID-ключи для push (генерируются при первом запуске)
};
try {
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  for (const k of Object.keys(state)) if (d[k] !== undefined) state[k] = d[k];
} catch (_) {}

let dirty = false;
function save() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(state)); dirty = false; } catch (e) { console.error('save:', e.message); } }
setInterval(() => { if (dirty) save(); }, 1500);

/* VAPID-ключи: создаются один раз и сохраняются в state-файле */
if (!state.vapid || !state.vapid.publicKey || !state.vapid.privateKey) {
  state.vapid = push.generateVapidKeys();
  save();
}

/* ---------- официальный канал «TeleMAX Новости» (владелец mislit_tech) ---------- */
const OFFICIAL_CHANNEL_ID = 'gtelemax';
function ensureOfficialChannel() {
  let g = state.groups[OFFICIAL_CHANNEL_ID];
  if (!g) {
    g = { id: OFFICIAL_CHANNEL_ID, name: 'TeleMAX Новости', type: 'channel', owner: 'mislit_tech', admins: [], members: [], verified: true, official: true, createdAt: Date.now() };
    state.groups[OFFICIAL_CHANNEL_ID] = g;
  }
  g.name = g.name || 'TeleMAX Новости';
  g.owner = 'mislit_tech'; g.admins = [];   // публиковать может только владелец
  g.verified = true; g.official = true;     // официальный — галочка всегда
  for (const u of Object.keys(state.accounts)) if (!g.members.includes(u)) g.members.push(u);
  dirty = true; save();
}
ensureOfficialChannel();

/* ------------------------------ утилиты ------------------------------ */
const clean = v => String(v || '').replace(/^@/, '').trim().toLowerCase();
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const uid = n => crypto.randomBytes(n || 8).toString('hex');
const now = () => Date.now();
function send(ws, obj) { if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(obj)); return true; } catch (_) {} } return false; }

const sockets = new Map();     // user -> Set<ws>
function socketsOf(u) { return sockets.get(clean(u)) || new Set(); }
function broadcastUser(u, obj) { let n = 0; for (const ws of [...socketsOf(u)]) if (send(ws, obj)) n++; return n; }
function broadcastAll(obj, except) { let n = 0; for (const set of sockets.values()) for (const ws of [...set]) if (ws !== except && send(ws, obj)) n++; return n; }
function queueFor(u, obj) { const k = clean(u); const q = state.pending[k] || []; q.push(obj); if (q.length > 500) q.splice(0, q.length - 500); state.pending[k] = q; dirty = true; }
function histAdd(u, obj) { const k = clean(u); if (!k) return; const h = state.history[k] || (state.history[k] = []); h.push(obj); if (h.length > 400) h.splice(0, h.length - 400); dirty = true; }
function histDel(users, id) { let n = 0; for (const u of users) { const k = clean(u); const h = k && state.history[k]; if (!h) continue; for (let i = h.length - 1; i >= 0; i--) if (String(h[i].id) === String(id)) { h.splice(i, 1); n++; } } if (n) dirty = true; }

/* ------------------------------ push-уведомления ------------------------------ */
function subsOf(u) { return state.pushSubs[clean(u)] || []; }
function anyVisible(u) { for (const ws of socketsOf(u)) if (!ws._hidden) return true; return false; }
function removeSub(user, endpoint) {
  const k = clean(user);
  const list = state.pushSubs[k];
  if (!list) return;
  const i = list.findIndex(s => s.endpoint === endpoint);
  if (i >= 0) { list.splice(i, 1); if (!list.length) delete state.pushSubs[k]; dirty = true; }
}
function readCookie(req, name) {
  try {
    const m = String(req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  } catch (_) { return ''; }
}
function previewOf(m, T) {
  T = T || (s => s);
  const t = String(m.messageType || m.type || 'text');
  const cap = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const withCap = s => (cap ? s + ' — ' + cap : s);
  if (t === 'image') return withCap('🖼 ' + T('Фото'));
  if (t === 'video') return m.circle ? '🎥 ' + T('Видеосообщение') : withCap('🎬 ' + T('Видео'));
  if (t === 'audio') return '🎤 ' + T('Голосовое сообщение');
  if (t === 'sticker') return '🎨 ' + T('Стикер');
  if (t === 'file') return withCap('📄 ' + (m.fileName || T('Файл')));
  if (t === 'gift') return '🎁 ' + (m.text || T('Подарок'));
  if (t === 'poll') return '📊 ' + T('Опрос') + ': ' + String((m.poll && m.poll.question) || '').slice(0, 100);
  const text = String(m.text || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 140) || T('Новое сообщение');
}
function pushTo(user, payload, opts) {
  const list = subsOf(user);
  if (!list.length || !state.vapid) return 0;
  const options = Object.assign({ subject: PUSH_SUBJECT }, opts || {});
  let n = 0;
  for (const sub of list.slice()) {
    n++;
    let pl = payload;
    /* у каждой подписки свой язык — переводим системные строки уведомления */
    const lang = translate.validLang(sub.lang);
    if (lang && typeof payload._mk === 'function') {
      try { pl = Object.assign({}, payload, payload._mk(s => (translate.cached(lang, s) || s))); } catch (_) { pl = payload; }
    }
    push.sendPush(sub, pl, state.vapid, options)
      .then(r => {
        if (r.gone) removeSub(user, sub.endpoint);
        else if (!r.ok) console.log('push:', user, r.status || '', r.error || '');
      })
      .catch(e => console.log('push:', user, e && e.message));
  }
  return n;
}
function messagePush(fromUser, out, groupName) {
  const fromAcc = state.accounts[fromUser] || {};
  const fromName = fromAcc.name || ('@' + fromUser);
  const isGroup = !!groupName;
  const chatId = isGroup ? ('g_' + String(out.to).slice(2)) : ('u_' + clean(fromUser));
  const mk = T => {
    T = T || (s => s);
    return {
      title: isGroup ? groupName : fromName,
      body: isGroup ? (fromName + ': ' + previewOf(out, T)) : previewOf(out, T)
    };
  };
  const payload = {
    tag: 'msg-' + chatId,
    renotify: true,
    vibrate: [180, 80, 180],
    data: { kind: 'chat', chat: chatId, user: clean(fromUser), title: fromName }
  };
  Object.assign(payload, mk(null));
  payload._mk = mk;
  return payload;
}
function callPush(fromUser, m) {
  const fromAcc = state.accounts[fromUser] || {};
  const mk = T => {
    T = T || (s => s);
    return {
      title: T(m.video ? '📹 Видеозвонок — TeleMAX' : '📞 Входящий звонок — TeleMAX'),
      body: (fromAcc.name || ('@' + fromUser)) + ' ' + T('звонит вам')
    };
  };
  const payload = {
    tag: 'call-' + clean(fromUser),
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 250, 500, 250, 500, 250, 500],
    data: { kind: 'call', user: clean(fromUser), title: fromAcc.name || fromUser }
  };
  Object.assign(payload, mk(null));
  payload._mk = mk;
  return payload;
}
setInterval(() => {   // просроченные входящие вызовы (ушли в офлайн) — чистим
  const t = now();
  let changed = false;
  for (const [u, pc] of Object.entries(state.pendingCalls)) if (!pc || pc.exp < t) { delete state.pendingCalls[u]; changed = true; }
  if (changed) dirty = true;
}, 5000);

function readJsonBody(req, cb) {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 200000) { try { req.destroy(); } catch (_) {} } });
  req.on('end', () => { try { cb(JSON.parse(b || '{}')); } catch (_) { cb(null); } });
}

/* ---------- TeleMAX AI: бесплатный ИИ без ключей и VPN ---------- */
const AI_URL = 'https://text.pollinations.ai/';
const AI_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
async function aiHttp(url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => { try { ac.abort(); } catch (_) {} }, timeoutMs || 45000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': AI_UA }, signal: ac.signal });
    const t = await r.text();
    return { status: r.status, ok: r.ok, text: t };
  } finally { clearTimeout(timer); }
}
async function aiAsk(messages) {
  const sys = ((messages.find(m => m.role === 'system') || {}).content || 'Ты — TeleMAX AI, дружелюбный помощник в мессенджере TeleMAX. Отвечай кратко и по делу простым текстом, без Markdown.').slice(0, 900);
  const hist = messages.filter(m => m.role !== 'system').slice(-8);
  const body = hist.length > 1
    ? 'Ты продолжаешь диалог с пользователем. Выполни его последнюю просьбу или ответь на вопрос по существу, в тему. Пиши только сам ответ, без подписи и без повторного приветствия.\n\n' + hist.map(m => (m.role === 'assistant' ? 'Ассистент' : 'Пользователь') + ': ' + String(m.content).slice(0, 900)).join('\n') + '\nАссистент:'
    : String((hist[0] || {}).content || '').slice(0, 1500);
  const url = AI_URL + encodeURIComponent(body) + '?model=openai&system=' + encodeURIComponent(sys);
  let r = await aiHttp(url, 45000);
  if (!r.ok || /free limit reached|rate limit/i.test(r.text)) {
    const m = r.text.match(/wait\s+(\d+)\s+seconds?/i);
    const waitMs = Math.min(((m ? Number(m[1]) : 30) + 2) * 1000, 36000);
    await new Promise(rs => setTimeout(rs, waitMs));
    r = await aiHttp(url, 45000);
  }
  if (!r.ok) throw new Error('ИИ недоступен (HTTP ' + r.status + '): ' + String(r.text).slice(0, 120));
  if (/free limit reached|rate limit/i.test(r.text)) throw new Error('Лимит бесплатного ИИ, попробуйте через минуту');
  const out = String(r.text).trim().replace(/^(Ассистент|Assistant|AI)\s*:\s*/i, '');
  if (!out) throw new Error('Пустой ответ ИИ');
  return out.slice(0, 4000);
}

function pubAccount(a) {
  if (!a) return null;
  return {
    user: a.user, name: a.name, phone: a.phone || '', about: a.about || '', avatar: a.avatar || '',
    registeredAt: a.registeredAt || 0, role: roleFor(a), verified: (!!a.verified || LEVEL5.includes(a.user)), verifiedType: a.verifiedType || '',
    coins: a.coins || 0, premium: !!a.premium, premiumUntil: a.premiumUntil || 0,
    gifts: a.gifts || [], nft: (a.nft || []).slice(), bots: a.bots || [], cloud: a.cloud || [],
    banned: !!a.banned, frozen: !!a.frozen, muted: !!a.muted,
    online: !!(state.presence[a.user] && state.presence[a.user].online),
    lastSeen: (state.presence[a.user] || {}).lastSeen || a.lastSeen || 0
  };
}
function roleFor(a) { if (!a) return 0; if (LEVEL5.includes(a.user)) return 5; return Math.max(0, Math.min(5, a.role == null ? 1 : a.role)); }
function isAdmin(a) { return roleFor(a) >= 4; }
function accountUpdate(u) { const a = state.accounts[clean(u)]; if (a) broadcastUser(u, { type: 'account_update', account: pubAccount(a) }); }
function contactList() { const out = {}; for (const [u, a] of Object.entries(state.accounts)) out[u] = pubAccount(a); return out; }

/* ------------------------------ HTTP: статика + uploads ------------------------------ */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webm': 'video/webm', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip' };

const httpServer = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, service: 'telemax-web', version: VERSION, online: sockets.size, accounts: Object.keys(state.accounts).length, uptimeSec: Math.floor((now() - STARTED) / 1000), pushSubs: Object.values(state.pushSubs).reduce((s, l) => s + l.length, 0) }));
  }

  /* ---------- Web Push: публичный ключ VAPID ---------- */
  if (req.method === 'GET' && u.pathname === '/push/vapid') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, key: state.vapid.publicKey }));
  }

  /* ---------- Web Push: подписка браузера ---------- */
  if (req.method === 'POST' && u.pathname === '/push/subscribe') {
    readJsonBody(req, body => {
      const sendJson = (code, obj) => { try { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); } catch (_) {} };
      const user = clean(body && body.user);
      const sub = body && body.subscription;
      if (!user || !state.accounts[user]) return sendJson(404, { ok: false, error: 'Пользователь не найден' });
      if (!sub || typeof sub.endpoint !== 'string' || !/^https?:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
        return sendJson(400, { ok: false, error: 'Некорректная подписка' });
      }
      const list = state.pushSubs[user] || (state.pushSubs[user] = []);
      const rec = { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) }, time: now(), ua: String(req.headers['user-agent'] || '').slice(0, 140), lang: translate.validLang(body && body.lang) };
      const existing = list.find(x => x.endpoint === sub.endpoint);
      if (existing) Object.assign(existing, rec);
      else list.unshift(rec);
      if (list.length > 10) list.length = 10;
      dirty = true; save();
      sendJson(200, { ok: true, count: list.length });
    });
    return;
  }

  /* ---------- TeleMAX AI: бесплатный ИИ-чат (без ключей и VPN) ---------- */
  if (req.method === 'POST' && u.pathname === '/ai/chat') {
    readJsonBody(req, async body => {
      const sendJson = (code, obj) => { try { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); } catch (_) {} };
      try {
        const msgs = [];
        if (body && Array.isArray(body.messages)) {
          for (const m of body.messages.slice(-12)) {
            if (!m || typeof m.content !== 'string' || !m.content.trim()) continue;
            msgs.push({ role: m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'system' : 'user'), content: m.content.slice(0, 1200) });
          }
        }
        if (!msgs.length) return sendJson(400, { ok: false, error: 'Пустой запрос' });
        const text = await aiAsk(msgs);
        sendJson(200, { ok: true, text });
      } catch (e) {
        sendJson(502, { ok: false, error: String((e && e.message) || e) });
      }
    });
    return;
  }

  /* ---------- перезапуск сервера для деплоя (одноразовый SSH-токен) ---------- */
  if (req.method === 'POST' && u.pathname === '/admin/restart') {
    readJsonBody(req, body => {
      const tokFile = path.join(__dirname, 'restart.token');
      let tok = '';
      try { tok = fs.readFileSync(tokFile, 'utf8').trim(); } catch (_) {}
      const given = String((body && body.token) || req.headers['x-restart-token'] || '');
      if (!tok || given !== tok) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('forbidden'); }
      try { fs.unlinkSync(tokFile); } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('restarting');
      setTimeout(() => process.exit(0), 400);
    });
    return;
  }

  /* ---------- автоперевод интерфейса: прогрев языка ---------- */
  if (req.method === 'POST' && u.pathname === '/lang/warm') {
    readJsonBody(req, body => {
      const sendJson = (code, obj) => { try { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); } catch (_) {} };
      const lang = translate.validLang(body && body.lang);
      if (!lang) return sendJson(400, { ok: false, error: 'Неподдерживаемый код языка' });
      translate.warmBundle(lang, siteFiles(), PUSH_UI)
        .then(st => sendJson(200, st))
        .catch(e => sendJson(500, { ok: false, error: String((e && e.message) || e) }));
    });
    return;
  }

  /* ---------- Web Push: отписка ---------- */
  if (req.method === 'POST' && u.pathname === '/push/unsubscribe') {
    readJsonBody(req, body => {
      const user = clean(body && body.user);
      const endpoint = String((body && body.endpoint) || '');
      if (user && endpoint) { removeSub(user, endpoint); save(); }
      try { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: true })); } catch (_) {}
    });
    return;
  }

  if (req.method === 'POST' && u.pathname === '/upload') {
    const owner = clean(u.searchParams.get('user'));
    const rawName = String(u.searchParams.get('name') || 'file').replace(/[^a-zA-Z0-9._\-\sа-яА-ЯёЁ]/g, '_').slice(-120) || 'file';
    const stored = now() + '_' + uid(4) + '_' + rawName;
    const file = path.join(UPLOAD_DIR, stored);
    let size = 0;
    const out = fs.createWriteStream(file);
    req.on('data', c => { size += c.length; if (size > MAX_UPLOAD) { req.destroy(); } });
    req.pipe(out);
    out.on('finish', () => {
      const url = '/uploads/' + encodeURIComponent(stored);
      const acc = state.accounts[owner];
      if (acc) { acc.cloud = acc.cloud || []; acc.cloud.unshift({ name: rawName, url, size, time: now() }); acc.cloud = acc.cloud.slice(0, 300); dirty = true; accountUpdate(owner); }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, url, name: rawName, size }));
    });
    out.on('error', () => { res.writeHead(500); res.end('upload error'); });
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && u.pathname.startsWith('/uploads/')) {
    let name;
    try { name = path.basename(decodeURIComponent(u.pathname.split('/').pop())); } catch (_) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bad request');
    }
    let st = null;
    try { st = name ? fs.statSync(path.join(UPLOAD_DIR, name)) : null; } catch (_) {}
    if (!st || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const file = path.join(UPLOAD_DIR, name);
    const ext = path.extname(name).toLowerCase();
    const size = st.size;
    const head = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400'
    };
    /* Range-запросы: без них многие браузеры (особенно мобильные/Safari) не проигрывают видео */
    const rm = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    if (rm && (rm[1] || rm[2]) && size > 0) {
      let start = rm[1] ? parseInt(rm[1], 10) : Math.max(0, size - parseInt(rm[2], 10));
      let end = (rm[1] && rm[2]) ? parseInt(rm[2], 10) : size - 1;
      if (isNaN(start) || isNaN(end) || start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + size });
        return res.end();
      }
      if (end > size - 1) end = size - 1;
      res.writeHead(206, Object.assign({ 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Content-Length': end - start + 1 }, head));
      if (req.method === 'HEAD') return res.end();
      const rs = fs.createReadStream(file, { start, end });
      rs.on('error', () => { try { res.destroy(); } catch (_) {} });
      return rs.pipe(res);
    }
    res.writeHead(200, Object.assign({ 'Content-Length': size }, head));
    if (req.method === 'HEAD') return res.end();
    const rs = fs.createReadStream(file);
    rs.on('error', () => { try { res.destroy(); } catch (_) {} });
    return rs.pipe(res);
  }

  // статика сайта
  let p;
  try { p = decodeURIComponent(u.pathname); } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }
  if (p === '/' || p === '') p = '/index.html';
  /* защита: файлы и данные сервера наружу не отдаём (telemax-state.json, код сервера) */
  if (p === '/server' || p.startsWith('/server/') || p.startsWith('/.')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  const ext = path.extname(file).toLowerCase();
  const noCache = ['.html', '.js', '.css'].includes(ext);

  /* перевод интерфейса: язык из ?lang= (и запоминаем в cookie) или из cookie tmx_lang */
  let lang = translate.validLang(u.searchParams.get('lang'));
  if (!lang && !u.searchParams.has('lang')) lang = translate.validLang(readCookie(req, 'tmx_lang'));
  if (lang && (ext === '.js' || ext === '.html' || ext === '.json')) {
    if (u.searchParams.get('lang')) res.setHeader('Set-Cookie', 'tmx_lang=' + encodeURIComponent(lang) + '; Path=/; Max-Age=31536000; SameSite=Lax');
    const body = translate.transformFile(file, lang, () => translate.warmSoon(lang, siteFiles(), PUSH_UI));
    if (body != null) {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : 'public, max-age=300' });
      return res.end(body);
    }
  }
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-cache' : 'public, max-age=300' });
  const rs = fs.createReadStream(file);
  rs.on('error', () => { try { res.destroy(); } catch (_) {} });
  rs.pipe(res);
});

/* ------------------------------ WebSocket ------------------------------ */
const wss = new WebSocket.Server({ server: httpServer });
httpServer.listen(PORT, HOST, () => console.log(`TeleMAX Web ${VERSION} — http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));

function ipOf(req) { try { return (req.socket.remoteAddress || '').replace('::ffff:', '') || 'local'; } catch (_) { return 'local'; } }

function registerSocket(a, ws, req, newDevice, resumeToken) {
  const u = a.user;
  if (!sockets.has(u)) sockets.set(u, new Set());
  sockets.get(u).add(ws);
  const prev = state.presence[u] || {};
  const first = !prev.online;
  state.presence[u] = { online: true, since: first ? now() : (prev.since || now()), lastSeen: now() };
  a.lastSeen = now();
  dirty = true;

  send(ws, { type: 'registered', user: u, account: pubAccount(a), online: true, resumeToken: resumeToken || '' });
  send(ws, { type: 'presence_snapshot', items: state.presence });
  send(ws, { type: 'contacts_snapshot', items: contactList() });
  const oc = state.groups[OFFICIAL_CHANNEL_ID];
  if (oc && !oc.members.includes(u)) { oc.members.push(u); dirty = true; save(); }
  send(ws, { type: 'groups_snapshot', items: Object.values(state.groups).filter(g => g.members.includes(u) || g.official) });
  send(ws, { type: 'broadcast_state', text: state.broadcast.text, time: state.broadcast.time });

  const q = state.pending[u] || [];
  for (const item of q) send(ws, item);
  if (q.length) { delete state.pending[u]; dirty = true; }

  // звонок, который пытались совершить, пока человек был не в сети (дозвонит при заходе)
  const pc = state.pendingCalls[u];
  if (pc) {
    delete state.pendingCalls[u];
    dirty = true;
    if (pc.exp > now()) send(ws, { type: 'call', from: pc.from, video: pc.video, callId: pc.callId, serverTime: now() });
  }

  const hist = state.history[u] || [];
  if (hist.length) send(ws, { type: 'history_snapshot', items: hist.slice(-400) });

  broadcastAll({ type: 'presence', user: u, online: true, lastSeen: now() }, ws);

  if (newDevice) {
    const dev = String((req && req.headers['user-agent']) || 'Браузер').slice(0, 140);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const text = `🔐 Кто-то вошёл в ваш аккаунт TeleMAX\n\nУстройство: ${dev}\nIP: ${ipOf(req)}\nВремя: ${new Date().toLocaleString('ru-RU')}\nКод: ${code}\n\n⚠️ Никому не сообщайте код. Если это не вы — смените пароль.`;
    const msg = { type: 'chat_message', id: uid(), from: 'telemaxbot', to: u, messageType: 'text', text, serverTime: now() };
    send(ws, msg);
  }
  accountUpdate(u);
}
function dropSocket(ws) {
  for (const [u, set] of sockets.entries()) {
    if (set.has(ws)) {
      set.delete(ws);
      if (!set.size) {
        sockets.delete(u);
        state.presence[u] = { online: false, since: (state.presence[u] || {}).since || 0, lastSeen: now() };
        dirty = true;
        broadcastAll({ type: 'presence', user: u, online: false, lastSeen: now() });
      }
      return;
    }
  }
}

function deliverChat(from, to, m) {
  const fromAcc = state.accounts[from];
  const isGroup = String(to).startsWith('g:');
  const out = {
    type: 'chat_message', id: String(m.id || uid()), from, to,
    clientId: String(m.clientId || ''),
    messageType: String(m.messageType || 'text'),
    text: String(m.text || ''), uri: String(m.uri || ''),
    fileName: String(m.fileName || ''), fileSize: Number(m.fileSize || 0),
    duration: Number(m.duration || 0),
    circle: !!m.circle,
    replyTo: String(m.replyTo || ''),
    poll: m.poll || null,
    giftKind: String(m.giftKind || ''), giftValue: String(m.giftValue || ''),
    serverTime: now()
  };

  if (isGroup) {
    const g = state.groups[to.slice(2)];
    if (!g || !g.members.includes(from)) return { error: 'Группа не найдена' };
    if (g.type === 'channel' && g.owner !== from && !(g.admins || []).includes(from)) return { error: 'В канале может писать только владелец' };
    histAdd(from, { ...out, groupName: g.name });
    let delivered = 0;
    for (const member of g.members) {
      if (member === from) continue;
      const pay = { ...out, groupName: g.name };
      const n = broadcastUser(member, pay);
      histAdd(member, pay);
      if (!n) queueFor(member, pay);
      if (!anyVisible(member)) pushTo(member, messagePush(from, pay, g.name));
      delivered += n;
    }
    return { delivered: delivered > 0, id: out.id };
  }

  const toAcc = state.accounts[to];
  if (!toAcc) return { error: 'Пользователь @' + to + ' не найден' };
  if (toAcc.banned) return { error: 'Получатель заблокирован' };
  histAdd(from, out); histAdd(to, out);
  const n = broadcastUser(to, out);
  if (!n) queueFor(to, out);
  if (!anyVisible(to)) pushTo(to, messagePush(from, out, ''));
  return { delivered: n > 0, id: out.id };
}

function securityCheck(a) {
  if (!a) return 'Аккаунт не найден';
  if (a.banned) return 'Аккаунт заблокирован';
  if (a.frozen) return 'Аккаунт заморожен';
  if (a.muted) return 'Вы в муте — отправка сообщений ограничена';
  return '';
}

function newToken(acc, devId) {
  const token = uid(16);
  acc.tokens = acc.tokens || [];
  acc.tokens.unshift({ token, devId: devId || '', time: now() });
  acc.tokens = acc.tokens.slice(0, 20);
  dirty = true;
  return token;
}

wss.on('connection', (ws, req) => {
  let user = '';
  let authed = false;

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (_) { return send(ws, { type: 'error', message: 'bad json' }); }
    const type = String(m.type || '');
    if (type === 'ping') return send(ws, { type: 'pong', time: now() });

    /* ---------- регистрация / вход ---------- */
    if (type === 'register') {
      const u = clean(m.user);
      if (!/^[a-z0-9_]{3,32}$/.test(u)) return send(ws, { type: 'error', message: 'Username: 3–32 символа, латиница/цифры/подчёркивание' });
      if (state.accounts[u]) return send(ws, { type: 'error', message: 'Этот @username уже занят' });
      const name = String(m.name || '').trim();
      if (name.length < 2) return send(ws, { type: 'error', message: 'Введите имя (мин. 2 символа)' });
      const pass = String(m.pass || '');
      if (pass.length < 4) return send(ws, { type: 'error', message: 'Пароль: мин. 4 символа' });
      const pin = String(m.pin || '').trim();
      if (pin && (!/^\d{4,6}$/.test(pin))) return send(ws, { type: 'error', message: '2FA PIN: 4–6 цифр' });
      const acc = {
        user: u, name, passHash: sha(pass + '::' + u), pinHash: pin ? sha(pin + '::pin::' + u) : '',
        phone: String(m.phone || '').trim(), about: '', avatar: String(m.avatar || ''),
        registeredAt: now(), role: 1, coins: 1250, premium: false, premiumUntil: 0,
        gifts: [], nft: [], bots: [], cloud: [], devices: {}, muted: false, banned: false, frozen: false, verified: false, verifiedType: ''
      };
      const devId = String(m.deviceId || '').slice(0, 64);
      if (devId) acc.devices[devId] = { label: String(m.deviceLabel || 'Устройство').slice(0, 140), lastSeen: now() };
      state.accounts[u] = acc; dirty = true; save();
      user = u; authed = true;
      const token = newToken(acc, devId);
      registerSocket(acc, ws, req, false, token);
      return;
    }

    if (type === 'resume') {
      const u = clean(m.user);
      const acc = state.accounts[u];
      const token = String(m.token || '');
      if (!acc || !token || !(acc.tokens || []).some(t => t.token === token)) return send(ws, { type: 'resume_failed' });
      if (acc.banned) return send(ws, { type: 'error', message: 'Аккаунт заблокирован администрацией.' });
      user = u; authed = true;
      registerSocket(acc, ws, req, false, token);
      return;
    }

    if (type === 'login' || type === 'login_pin') {
      if (type === 'login') {
        const u = clean(m.user);
        const acc = state.accounts[u];
        if (!acc) return send(ws, { type: 'error', message: 'Аккаунт не найден. Зарегистрируйтесь.' });
        if (acc.banned) return send(ws, { type: 'error', message: 'Аккаунт заблокирован администрацией.' });
        if (sha(String(m.pass || '') + '::' + u) !== acc.passHash) return send(ws, { type: 'error', message: 'Неверный пароль' });
        const devId = String(m.deviceId || '').slice(0, 64);
        const known = !!acc.devices[devId];
        if (acc.pinHash && !known) { ws._pendingLogin = { u, devId, m, req }; return send(ws, { type: 'login_challenge', user: u, message: 'Введите 2FA PIN' }); }
        user = u; authed = true;
        if (devId) acc.devices[devId] = { label: String(m.deviceLabel || 'Устройство').slice(0, 140), lastSeen: now() };
        dirty = true;
        return registerSocket(acc, ws, req, !known, newToken(acc, devId));
      }
      // login_pin
      const p = ws._pendingLogin;
      if (!p) return send(ws, { type: 'error', message: 'Сначала вход' });
      const acc = state.accounts[p.u];
      if (sha(String(m.pin || '') + '::pin::' + p.u) !== acc.pinHash) return send(ws, { type: 'error', message: 'Неверный PIN' });
      delete ws._pendingLogin;
      user = p.u; authed = true;
      if (p.devId) acc.devices[p.devId] = { label: String((p.m && p.m.deviceLabel) || 'Устройство').slice(0, 140), lastSeen: now() };
      dirty = true;
      return registerSocket(acc, ws, p.req, true, newToken(acc, p.devId));
    }

    if (type === 'admin_check') {
      if (String(m.adminKey || '') === ADMIN_KEY) return send(ws, { type: 'admin_check_ok', ok: true });
      if (authed && isAdmin(state.accounts[user])) return send(ws, { type: 'admin_check_ok', ok: true, viaRole: true });
      return send(ws, { type: 'admin_check_ok', ok: false });
    }

    /* ---------- живая статистика мессенджера (для диагностики) ---------- */
    if (type === 'stats_get') {
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      return send(ws, {
        type: 'stats',
        online: sockets.size,
        accounts: Object.keys(state.accounts).length,
        todayNew: Object.values(state.accounts).filter(x => (x.registeredAt || 0) >= dayStart.getTime()).length,
        queued: Object.values(state.pending).reduce((s, q) => s + q.length, 0),
        pushSubs: Object.values(state.pushSubs).reduce((s, l) => s + l.length, 0),
        uptimeSec: Math.floor((now() - STARTED) / 1000),
        version: VERSION
      });
    }

    /* ---------- вход через Google / Telegram ---------- */
    if (type === 'oauth') {
      const provider = String(m.provider || '').toLowerCase();
      if (provider !== 'google' && provider !== 'telegram') return send(ws, { type: 'error', message: 'Этот способ входа не поддерживается' });
      const isG = provider === 'google';
      const ident = clean(m.ident);
      if (isG && !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(ident)) return send(ws, { type: 'error', message: 'Введите корректный адрес Google' });
      if (!isG && !/^[a-z0-9_]{3,32}$/.test(ident)) return send(ws, { type: 'error', message: 'Введите корректный Telegram @username' });
      let oaAcc = Object.values(state.accounts).find(a => a.oauth && a.oauth[provider] === ident);
      if (oaAcc) {
        if (oaAcc.banned) return send(ws, { type: 'error', message: 'Аккаунт заблокирован администрацией.' });
      } else {
        let base = (isG ? ident.split('@')[0] : ident).replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 28);
        if (base.length < 3) base = (base + '_' + provider.slice(0, 2)).slice(0, 32);
        let oaUser = base, n = 1;
        while (state.accounts[oaUser]) { n++; oaUser = (base.slice(0, 29) + '_' + n).slice(0, 32); }
        oaAcc = {
          user: oaUser, name: (String(m.name || '').trim() || (isG ? base : ident)).slice(0, 64),
          passHash: sha(uid(16)), pinHash: '', phone: '', about: '', avatar: '',
          registeredAt: now(), role: 1, coins: 1250, premium: false, premiumUntil: 0,
          gifts: [], nft: [], bots: [], cloud: [], devices: {}, muted: false, banned: false, frozen: false,
          verified: false, verifiedType: '', oauth: { [provider]: ident }
        };
        state.accounts[oaUser] = oaAcc; dirty = true; save();
      }
      user = oaAcc.user; authed = true;
      const oaDevId = String(m.deviceId || '').slice(0, 64);
      if (oaDevId) oaAcc.devices[oaDevId] = { label: String(m.deviceLabel || 'Устройство').slice(0, 140), lastSeen: now() };
      dirty = true;
      return registerSocket(oaAcc, ws, req, false, newToken(oaAcc, oaDevId));
    }

    if (!authed) return send(ws, { type: 'error', message: 'Сначала войдите в аккаунт' });

    /* ---------- профиль / контакты ---------- */
    if (type === 'profile_update') {
      const a = state.accounts[user];
      if (String(m.name || '').trim()) a.name = String(m.name).trim().slice(0, 64);
      if (m.about !== undefined) a.about = String(m.about).slice(0, 300);
      if (m.phone !== undefined) a.phone = String(m.phone).slice(0, 32);
      if (m.avatar !== undefined && String(m.avatar).length < 400000) a.avatar = String(m.avatar);
      dirty = true; save();
      broadcastAll({ type: 'contact_update', account: pubAccount(a) });
      accountUpdate(user);
      return send(ws, { type: 'profile_ok' });
    }

    if (type === 'set_pin') {
      const a = state.accounts[user];
      const pin = String(m.pin || '').trim();
      if (pin && !/^\d{4,6}$/.test(pin)) return send(ws, { type: 'error', message: '2FA PIN: 4–6 цифр' });
      a.pinHash = pin ? sha(pin + '::pin::' + user) : '';
      dirty = true; save();
      return send(ws, { type: 'pin_ok', enabled: !!pin });
    }

    if (type === 'contacts_get') return send(ws, { type: 'contacts_snapshot', items: contactList() });

    /* ---------- сообщения ---------- */
    if (type === 'chat_message') {
      const err = securityCheck(state.accounts[user]);
      if (err) return send(ws, { type: 'error', message: err });
      const to = clean(m.to) && !String(m.to).startsWith('g:') ? clean(m.to) : String(m.to);
      const r = deliverChat(user, to, m);
      if (r.error) return send(ws, { type: 'error', message: r.error, clientId: String(m.clientId || '') });
      return send(ws, { type: 'message_accepted', clientId: String(m.clientId || ''), delivered: !!r.delivered, queued: !r.delivered, id: r.id, serverTime: now() });
    }

    if (type === 'read') { const to = clean(m.peer); if (to && state.accounts[to]) broadcastUser(to, { type: 'read', by: user, chatId: String(m.chatId || ''), upTo: String(m.upTo || '') }); return; }
    if (type === 'typing') { const to = clean(m.to); if (to && state.accounts[to]) broadcastUser(to, { type: 'typing', from: user, chatId: String(m.chatId || ''), on: !!m.on }); return; }
    // вкладка скрыта/видна — от этого зависит отправка push
    if (type === 'app_state') { ws._hidden = !!m.hidden; return; }
    if (type === 'delete_message') {
      const to = clean(m.to);
      const delId = String(m.id || '');
      if (to && state.accounts[to]) broadcastUser(to, { type: 'delete_message', by: user, chatId: String(m.chatId || ''), id: delId });
      if (String(m.to || '').startsWith('g:')) {
        const g = state.groups[m.to.slice(2)];
        if (g) {
          for (const mem of g.members) if (mem !== user) broadcastUser(mem, { type: 'delete_message', by: user, chatId: m.to, id: delId });
          histDel(g.members, delId);
        } else histDel([user], delId);
      } else histDel([user, to], delId);
      return;
    }
    if (type === 'reaction') {
      const emoji = String(m.emoji || '').slice(0, 12);
      if (REACTIONS.indexOf(emoji) < 0) return send(ws, { type: 'error', message: 'Недопустимая реакция' });
      const msgId = String(m.msgId || '').slice(0, 80);
      if (!msgId) return;
      const on = !!m.on;
      const rawTo = String(m.to || '');
      const base = { type: 'reaction', from: user, chatId: String(m.chatId || ''), msgId, emoji, on, serverTime: now() };
      if (rawTo.startsWith('g:')) {
        const g = state.groups[rawTo.slice(2)];
        if (!g || !g.members.includes(user)) return send(ws, { type: 'error', message: 'Группа не найдена' });
        for (const mem of g.members) {
          const pay = Object.assign({ to: rawTo }, base);
          if (!broadcastUser(mem, pay)) queueFor(mem, pay);
        }
      } else {
        const to = clean(m.to);
        if (!to || !state.accounts[to]) return;
        const pay = Object.assign({ to }, base);
        if (!broadcastUser(to, pay)) queueFor(to, pay);
        /* свои другие устройства тоже видят реакцию */
        broadcastUser(user, Object.assign({ to }, base));
      }
      return;
    }
    if (type === 'poll_vote') {
      const chatId = String(m.chatId || '');
      const out = { type: 'poll_update', from: user, chatId, messageId: String(m.messageId || ''), option: Number(m.option), votes: m.votes || null, poll: m.poll || null };
      if (chatId.startsWith('g:')) { const g = state.groups[chatId.slice(2)]; if (g) for (const mem of g.members) if (mem !== user) { if (!broadcastUser(mem, out)) queueFor(mem, out); } }
      else { const to = clean(chatId.replace(/^u_/, '')); if (to && state.accounts[to]) { if (!broadcastUser(to, out)) queueFor(to, out); } }
      return;
    }

    /* ---------- группы и каналы ---------- */
    if (type === 'create_group') {
      const name = String(m.name || '').trim().slice(0, 64);
      if (!name) return send(ws, { type: 'error', message: 'Введите название' });
      const kind = m.kind === 'channel' ? 'channel' : 'group';
      const members = Array.from(new Set([user, ...(Array.isArray(m.members) ? m.members.map(clean) : [])])).filter(x => x === user || state.accounts[x]);
      const id = 'g' + uid(6);
      const g = { id, name, type: kind, owner: user, members, admins: [user], createdAt: now() };
      state.groups[id] = g; dirty = true; save();
      send(ws, { type: 'group_created', group: g });
      for (const mem of members) if (mem !== user) { if (!broadcastUser(mem, { type: 'group_created', group: g })) queueFor(mem, { type: 'group_created', group: g }); }
      return;
    }
    if (type === 'group_leave') {
      const g = state.groups[String(m.id || '')];
      if (g && g.official) return send(ws, { type: 'error', message: 'От официального канала нельзя отписаться' });
      if (g && g.members.includes(user)) {
        g.members = g.members.filter(x => x !== user); dirty = true;
        if (!g.members.length && g.owner === user) delete state.groups[g.id];
        broadcastAll({ type: 'group_update', group: g });
        save();
      }
      return;
    }
    if (type === 'group_verify') {
      const g = state.groups[String(m.id || '')];
      if (!g) return send(ws, { type: 'error', message: 'Группа или канал не найдены' });
      if (roleFor(state.accounts[user]) < 4) return send(ws, { type: 'error', message: 'Нужны права администратора (уровень 4+)' });
      if (g.official && !m.verified) return send(ws, { type: 'error', message: 'Официальный канал нельзя лишить галочки' });
      g.verified = !!m.verified; dirty = true; save();
      broadcastAll({ type: 'group_update', group: g });
      return send(ws, { type: 'group_verified', group: g });
    }

    /* ---------- кошелёк / подарки / NFT ---------- */
    if (type === 'coin_send') {
      const to = clean(m.to), a = state.accounts[user], b = state.accounts[to];
      const n = Math.floor(Number(m.amount || 0));
      if (!b) return send(ws, { type: 'error', message: 'Получатель не найден' });
      if (!(n > 0)) return send(ws, { type: 'error', message: 'Неверная сумма' });
      if ((a.coins || 0) < n) return send(ws, { type: 'error', message: 'Недостаточно TeleCoin' });
      a.coins -= n; b.coins = (b.coins || 0) + n; dirty = true; save();
      accountUpdate(user); accountUpdate(to);
      broadcastUser(to, { type: 'coin_received', from: user, amount: n });
      return;
    }
    if (type === 'coin_topup') {
      const a = state.accounts[user]; const n = Math.max(0, Math.min(1000000, Math.floor(Number(m.amount || 0))));
      a.coins = (a.coins || 0) + n; dirty = true; save(); accountUpdate(user);
      return;
    }
    if (type === 'gift_send') {
      const a = state.accounts[user], b = state.accounts[clean(m.to)];
      if (!b) return send(ws, { type: 'error', message: 'Получатель не найден' });
      const gift = m.gift || {};
      const kind = String(gift.kind || 'gift');   // gift | nft | premium
      const price = Math.max(0, Math.floor(Number(gift.price || 0)));
      if (kind === 'gift' && price > 0) {
        if ((a.coins || 0) < price) return send(ws, { type: 'error', message: 'Недостаточно TeleCoin (нужно ' + price + ')' });
        a.coins -= price;
      }
      if (kind === 'nft') {
        const idx = (a.nft || []).findIndex(x => x === gift.id || x.startsWith(String(gift.name) + '|'));
        if (idx < 0) return send(ws, { type: 'error', message: 'Такого NFT нет в инвентаре' });
        a.nft.splice(idx, 1);
      }
      if (kind === 'premium') {
        if ((a.coins || 0) < 499) return send(ws, { type: 'error', message: 'Нужно 499 TeleCoin для подарка Premium' });
        a.coins -= 499;
        b.premium = true; b.premiumUntil = Math.max(b.premiumUntil || 0, now()) + 30 * 24 * 3600 * 1000;
      }
      b.gifts = b.gifts || [];
      b.gifts.unshift({ kind, name: String(gift.name || 'Подарок'), emoji: String(gift.emoji || '🎁'), price, from: user, time: now() });
      if (b.gifts.length > 200) b.gifts.length = 200;
      dirty = true; save();
      const text = kind === 'nft' ? 'NFT: ' + (gift.name || '') : kind === 'premium' ? 'TelePremium — 30 дней' : (gift.emoji || '🎁') + ' ' + (gift.name || 'Подарок');
      const r = deliverChat(user, b.user, { id: uid(), messageType: 'gift', text, giftKind: kind, giftValue: String(gift.name || '') });
      accountUpdate(user); accountUpdate(b.user);
      return send(ws, { type: 'gift_ok', delivered: !!(r && r.delivered) });
    }

    /* ---------- облако ---------- */
    if (type === 'cloud_delete') {
      const a = state.accounts[user]; const url = String(m.url || '');
      a.cloud = (a.cloud || []).filter(f => f.url !== url); dirty = true; save(); accountUpdate(user);
      return;
    }
    if (type === 'cloud_sync') { accountUpdate(user); return; }

    /* ---------- жалобы ---------- */
    if (type === 'report_create') {
      const a = state.accounts[user];
      if (roleFor(a) < 2) return send(ws, { type: 'error', message: 'Жалобы могут создавать модераторы' });
      const target = clean(m.target), reason = String(m.reason || '').trim().slice(0, 300);
      if (!target || !reason) return send(ws, { type: 'error', message: 'Нужны username и причина' });
      const rep = { id: uid(), target, reason, from: user, fromRole: roleFor(a), status: 'new', created: now() };
      state.reports.unshift(rep); state.reports = state.reports.slice(0, 500); dirty = true; save();
      return send(ws, { type: 'report_ok', report: rep });
    }

    /* ---------- поддержка: запрос живого человека (любой пользователь) ---------- */
    if (type === 'support_create') {
      const a = state.accounts[user];
      const text = String(m.text || '').trim().slice(0, 700);
      if (!text) return send(ws, { type: 'error', message: 'Пустой запрос' });
      const rep = { id: uid(), target: 'support', reason: text, from: user, fromRole: roleFor(a), status: 'new', created: now() };
      state.reports.unshift(rep); state.reports = state.reports.slice(0, 500); dirty = true; save();
      const fromName = (a && a.name) || ('@' + user);
      for (const [u2, a2] of Object.entries(state.accounts)) {
        if (u2 === user || roleFor(a2) < 4) continue;
        broadcastUser(u2, { type: 'support_new', from: user, name: fromName, text: text.slice(0, 300), time: now() });
        pushTo(u2, {
          title: '🆘 Запрос поддержки — TeleMAX',
          body: fromName + ': ' + text.replace(/\s+/g, ' ').slice(0, 140),
          tag: 'support-' + user,
          renotify: true,
          vibrate: [300, 120, 300, 120, 300],
          data: { kind: 'chat', chat: 'u_' + user, user: user, title: fromName },
          _mk: T => { T = T || (s => s); return { title: T('🆘 Запрос поддержки — TeleMAX'), body: fromName + ': ' + text.replace(/\s+/g, ' ').slice(0, 140) }; }
        });
      }
      return send(ws, { type: 'support_ok' });
    }

    /* ---------- админ ---------- */
    if (type === 'admin_action') {
      const a = state.accounts[user];
      const keyOk = String(m.adminKey || '') === ADMIN_KEY;
      if (!keyOk && !isAdmin(a)) return send(ws, { type: 'error', message: 'admin authentication failed' });
      const action = String(m.action || '');
      const target = clean(m.target);
      const t = state.accounts[target];

      if (action === 'snapshot') {
        const items = Object.entries(state.accounts).map(([u, acc]) => {
          const p = state.presence[u] || {};
          const devs = Object.values(acc.devices || {});
          return {
            user: u, name: acc.name, phone: acc.phone || '', about: acc.about || '', registeredAt: acc.registeredAt,
            role: roleFor(acc), banned: !!acc.banned, frozen: !!acc.frozen, verified: !!acc.verified, verifiedType: acc.verifiedType || '',
            coins: acc.coins || 0, premium: !!acc.premium, gifts: (acc.gifts || []).length, nft: (acc.nft || []).length,
            online: !!p.online, since: p.online ? p.since || 0 : 0, lastSeen: p.lastSeen || acc.lastSeen || 0,
            device: devs.length ? String(devs[devs.length - 1].label || '') : '',
            devices: devs.length, pin: !!acc.pinHash, muted: !!acc.muted
          };
        });
        const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        return send(ws, {
          type: 'admin_snapshot',
          accounts: items,
          onlineList: items.filter(x => x.online).map(x => ({ user: x.user, name: x.name, since: x.since, seconds: Math.floor((now() - x.since) / 1000) })),
          counts: {
            total: items.length, online: items.filter(x => x.online).length, banned: items.filter(x => x.banned).length,
            frozen: items.filter(x => x.frozen).length, verified: items.filter(x => x.verified).length,
            premium: items.filter(x => x.premium).length, groups: Object.keys(state.groups).length,
            queued: Object.values(state.pending).reduce((s, q) => s + q.length, 0),
            todayNew: items.filter(x => (x.registeredAt || 0) >= dayStart.getTime()).length,
            muted: items.filter(x => x.muted).length, admins: items.filter(x => x.role >= 4).length
          },
          reports: state.reports.slice(0, 100),
          verifiedGroups: Object.values(state.groups).filter(g => g.verified).map(g => ({ id: g.id, name: g.name, type: g.type, owner: g.owner })),
          server: { version: VERSION, uptimeSec: Math.floor((now() - STARTED) / 1000), sockets: sockets.size }
        });
      }

      if (action === 'set_role') {
        if (!t) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        const role = Math.max(0, Math.min(5, Math.floor(Number(m.role || 1))));
        if (LEVEL5.includes(t.user) && role < 5) return send(ws, { type: 'error', message: 'Встроенный уровень 5 нельзя понизить' });
        t.role = role; if (role === 0) { t.banned = false; t.frozen = false; } dirty = true; save();
        accountUpdate(t.user);
        broadcastUser(t.user, { type: 'admin_notice', text: 'Ваша роль изменена: ' + role });
        return send(ws, { type: 'admin_ok', action, target, role });
      }
      if (action === 'ban' || action === 'unban' || action === 'freeze' || action === 'unfreeze') {
        if (!t) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        if (action === 'ban') { t.banned = true; t.frozen = false; t.role = 0; }
        if (action === 'unban') t.banned = false;
        if (action === 'freeze') { t.frozen = true; t.banned = false; t.role = 0; }
        if (action === 'unfreeze') t.frozen = false;
        const wasBanned = t.banned || t.frozen;
        dirty = true; save();
        broadcastUser(t.user, { type: 'restriction', banned: !!t.banned, frozen: !!t.frozen });
        if (action.startsWith('un')) {
          for (const w of [...socketsOf(t.user)]) send(w, { type: 'admin_notice', text: action === 'unban' ? 'Ваш аккаунт разблокирован' : 'Заморозка снята' });
        } else {
          for (const w of [...socketsOf(t.user)]) send(w, { type: 'admin_notice', text: action === 'ban' ? 'Ваш аккаунт заблокирован администрацией' : 'Ваш аккаунт заморожен' });
        }
        accountUpdate(t.user);
        return send(ws, { type: 'admin_ok', action, target, banned: !!t.banned, frozen: !!t.frozen, wasBanned });
      }
      if (action === 'verify' || action === 'unverify') {
        if (!t) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        if (action === 'verify') {
          const exact = String(m.name || '').trim();
          if (t.name !== exact) return send(ws, { type: 'error', message: 'Имя не совпадает: у @' + target + ' имя «' + t.name + '»' });
          t.verified = true; t.verifiedType = String(m.kind || 'person');
        } else { t.verified = false; t.verifiedType = ''; }
        dirty = true; save();
        broadcastAll({ type: 'contact_update', account: pubAccount(t) });
        broadcastUser(t.user, { type: 'admin_notice', text: action === 'verify' ? 'Ваш аккаунт верифицирован ✓' : 'Верификация снята' });
        accountUpdate(t.user);
        return send(ws, { type: 'admin_ok', action, target, verified: !!t.verified });
      }
      if (action === 'grant_coins') {
        const n = Math.floor(Number(m.amount || 0));
        const dst = t || state.accounts[user];
        if (!dst) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        if (!(n > 0)) return send(ws, { type: 'error', message: 'Неверная сумма' });
        dst.coins = (dst.coins || 0) + n; dirty = true; save();
        accountUpdate(dst.user);
        broadcastUser(dst.user, { type: 'admin_notice', text: 'Вам выдано ' + n + ' TeleCoin' });
        return send(ws, { type: 'admin_ok', action, target: dst.user, coins: dst.coins });
      }
      if (action === 'grant_nft') {
        const dst = t || state.accounts[user];
        if (!dst) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        const item = String(m.item || 'Crystal') + '|' + Math.floor(Math.random() * 4);
        dst.nft = dst.nft || []; dst.nft.push(item); dirty = true; save();
        accountUpdate(dst.user);
        broadcastUser(dst.user, { type: 'admin_notice', text: 'Вам выдан NFT: ' + String(m.item || 'Crystal') });
        return send(ws, { type: 'admin_ok', action, target: dst.user, nft: dst.nft });
      }
      if (action === 'gift_blade') {
        const dst = t;
        if (!dst) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        if (m.all) dst.gifts = [];
        else dst.gifts = (dst.gifts || []).filter(g => g.name !== String(m.gift || ''));
        dirty = true; save(); accountUpdate(dst.user);
        return send(ws, { type: 'admin_ok', action, target, gifts: (dst.gifts || []).length });
      }
      if (action === 'broadcast') {
        const text = String(m.text || '').trim().slice(0, 500);
        if (!text) return send(ws, { type: 'error', message: 'Пустой текст' });
        state.broadcast = { text, time: now() }; dirty = true; save();
        broadcastAll({ type: 'broadcast', text, from: user, time: now() });
        // и системным сообщением каждому в чат TeleMAX Bot
        for (const u of Object.keys(state.accounts)) {
          const msg = { type: 'chat_message', id: uid(), from: 'telemaxbot', to: u, messageType: 'text', text: '📢 Рассылка TeleMAX\n\n' + text, serverTime: now() };
          if (!broadcastUser(u, msg)) queueFor(u, msg);
          if (u !== user && !anyVisible(u)) pushTo(u, {
            title: '📢 TeleMAX — рассылка',
            body: text.slice(0, 180),
            tag: 'msg-broadcast',
            renotify: true,
            vibrate: [200, 100, 200],
            data: { kind: 'chat', chat: 'u_telemaxbot', user: 'telemaxbot', title: 'TeleMAX Bot' }
          });
        }
        return send(ws, { type: 'admin_ok', action });
      }
      if (action === 'warn' || action === 'mute' || action === 'unmute' || action === 'kick') {
        if (!t) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        const reason = String(m.reason || '').slice(0, 200);
        if (action === 'mute') { t.muted = true; broadcastUser(t.user, { type: 'admin_notice', text: 'Вам выдан мут. Причина: ' + (reason || '—') }); }
        if (action === 'unmute') { t.muted = false; broadcastUser(t.user, { type: 'admin_notice', text: 'Мут снят' }); }
        if (action === 'warn') broadcastUser(t.user, { type: 'admin_notice', text: '⚠️ Предупреждение от администрации: ' + (reason || '—') });
        if (action === 'kick') { for (const w of [...socketsOf(t.user)]) { send(w, { type: 'admin_notice', text: 'Вы отключены администратором' }); w.close(); } }
        dirty = true; save();
        return send(ws, { type: 'admin_ok', action, target });
      }
      if (action === 'report_approve' || action === 'report_close') {
        const rep = state.reports.find(r => r.id === String(m.id || ''));
        if (!rep) return send(ws, { type: 'error', message: 'Жалоба не найдена' });
        if (action === 'report_approve') { if (roleFor(a) < 3 && !keyOk) return send(ws, { type: 'error', message: 'Согласовать может старший модератор' }); rep.status = 'approved'; rep.senior = user; }
        else rep.status = 'closed';
        dirty = true; save();
        return send(ws, { type: 'admin_ok', action, id: rep.id, report: rep });
      }
      if (action === 'create_account') {
        if (roleFor(a) < 2 && !keyOk) return send(ws, { type: 'error', message: 'Недостаточно прав' });
        const u = clean(m.user);
        if (!/^[a-z0-9_]{3,32}$/.test(u)) return send(ws, { type: 'error', message: 'Username: 3–32 символа (латиница, цифры, _)' });
        if (state.accounts[u]) return send(ws, { type: 'error', message: 'Username занят' });
        const pass = String(m.pass || uid(6));
        const acc = {
          user: u, name: String(m.name || u).trim().slice(0, 64), passHash: sha(pass + '::' + u), pinHash: '',
          phone: String(m.phone || '').trim(), about: '', avatar: '', registeredAt: now(),
          role: Math.max(0, Math.min(3, Math.floor(Number(m.role || 1)))), coins: 1250, premium: false, premiumUntil: 0,
          gifts: [], nft: [], bots: [], cloud: [], devices: {}, muted: false, banned: false, frozen: false, verified: false, verifiedType: '',
          createdBy: user
        };
        state.accounts[u] = acc; dirty = true; save();
        broadcastAll({ type: 'contact_update', account: pubAccount(acc) });
        return send(ws, { type: 'admin_ok', action, target: u, login: { user: u, pass } });
      }
      if (action === 'support_code') {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        state.supportCodes[code] = { user, exp: now() + 10 * 60 * 1000 };   // 10 минут
        dirty = true; save();
        return send(ws, { type: 'admin_ok', action, code });
      }
      if (action === 'support_code_enter') {
        const code = String(m.code || '');
        const rec = state.supportCodes[code];
        if (!rec || rec.exp < now()) return send(ws, { type: 'error', message: 'Код недействителен или истёк' });
        delete state.supportCodes[code]; dirty = true;
        a.role = Math.max(a.role || 1, 4); save();
        accountUpdate(user);
        return send(ws, { type: 'admin_ok', action, role: a.role, owner: rec.user });
      }
      if (action === 'reset_pin') {
        if (!t) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        t.pinHash = ''; dirty = true; save();
        broadcastUser(t.user, { type: 'admin_notice', text: 'Ваш 2FA PIN сброшен администрацией' });
        return send(ws, { type: 'admin_ok', action, target });
      }
      if (action === 'logout_all') {
        if (!t) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        t.tokens = []; dirty = true; save();
        for (const w of [...socketsOf(t.user)]) { send(w, { type: 'admin_notice', text: 'Ваши сессии завершены администрацией' }); w.close(); }
        return send(ws, { type: 'admin_ok', action, target });
      }
      if (action === 'grant_premium') {
        if (!t) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        const on = m.on !== false;
        t.premium = on;
        t.premiumUntil = on ? now() + 30 * 24 * 3600 * 1000 : 0;
        dirty = true; save();
        accountUpdate(t.user);
        broadcastUser(t.user, { type: 'admin_notice', text: on ? '🎁 Вам выдан TelePremium на 30 дней!' : 'TelePremium отключён администрацией' });
        return send(ws, { type: 'admin_ok', action, target, premium: on });
      }
      if (action === 'set_name') {
        if (!t) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        const newName = String(m.name || '').trim().slice(0, 64);
        if (newName.length < 2) return send(ws, { type: 'error', message: 'Имя: минимум 2 символа' });
        t.name = newName; dirty = true; save();
        broadcastAll({ type: 'contact_update', account: pubAccount(t) });
        accountUpdate(t.user);
        return send(ws, { type: 'admin_ok', action, target, name: newName });
      }
      if (action === 'clear_queue') { state.pending = {}; dirty = true; save(); return send(ws, { type: 'admin_ok', action }); }
      if (action === 'delete_account') {
        if (!t) return send(ws, { type: 'error', message: 'Пользователь не найден' });
        if (LEVEL5.includes(t.user)) return send(ws, { type: 'error', message: 'Встроенный аккаунт нельзя удалить' });
        for (const w of [...socketsOf(t.user)]) w.close();
        delete state.accounts[t.user]; delete state.presence[t.user]; delete state.pending[t.user]; delete state.history[t.user];
        delete state.pushSubs[t.user]; delete state.pendingCalls[t.user];
        dirty = true; save();
        broadcastAll({ type: 'contact_removed', user: t.user });
        return send(ws, { type: 'admin_ok', action, target });
      }
      return send(ws, { type: 'error', message: 'Неизвестное админ-действие: ' + action });
    }

    /* ---------- звонки (WebRTC signaling) ---------- */
    if (['call', 'accept', 'offer', 'answer', 'ice', 'hangup', 'reject'].includes(type)) {
      const to = clean(m.to);
      if (!to) return send(ws, { type: 'error', message: 'recipient required' });
      const out = { ...m, from: user };
      const delivered = broadcastUser(to, out);
      if (type === 'call') {
        if (!delivered) {
          // человек не в сети: запомним вызов — если он зайдёт в течение 45 секунд, звонок дозвонит
          state.pendingCalls[to] = { from: user, video: !!m.video, callId: String(m.callId || ''), exp: now() + 45000 };
          dirty = true;
        }
        // скрытая вкладка/офлайн — push со звуком и вибрацией
        if (!anyVisible(to)) pushTo(to, callPush(user, m), { ttl: 60, urgency: 'high' });
        return;
      }
      if (['accept', 'reject', 'hangup'].includes(type)) {
        delete state.pendingCalls[to];
        delete state.pendingCalls[clean(user)];
        dirty = true;
      }
      if (!delivered && type !== 'hangup') return send(ws, { type: 'error', message: 'Собеседник не в сети' });
      return;
    }

    send(ws, { type: 'error', message: 'Неизвестный тип: ' + type });
  });

  ws.on('close', () => { dropSocket(ws); delete ws._pendingLogin; });
});

console.log('TeleMAX Web server: node server/index.js in folder "server". Uploads -> ' + UPLOAD_DIR);
