// TeleMAX realtime server v0.3.0
// One WebSocket endpoint handles chat delivery, gifts, admin restrictions and WebRTC signaling.
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8080);
const ADMIN_KEY = process.env.TMX_ADMIN_KEY || 'TMX-ADMIN-2026';
const DATA_FILE = path.join(__dirname, 'server-state.json');

const users = new Map(); // username -> Set<WebSocket>
const pending = new Map(); // username -> queued chat messages while offline
const restrictions = new Map(); // username -> {banned,frozen}

try {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  for (const [u, v] of Object.entries(saved.restrictions || {})) restrictions.set(u, v);
} catch (_) {}

function clean(s) { return String(s || '').replace(/^@/, '').trim().toLowerCase(); }
function send(ws, obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function broadcastUser(username, obj, except) {
  const set = users.get(clean(username));
  if (!set) return 0;
  let count = 0;
  for (const ws of set) if (ws !== except && ws.readyState === WebSocket.OPEN) { send(ws, obj); count++; }
  return count;
}
function queueFor(username, obj) {
  const key = clean(username);
  const list = pending.get(key) || [];
  list.push(obj);
  if (list.length > 200) list.splice(0, list.length - 200);
  pending.set(key, list);
}
function persist() {
  const out = { restrictions: Object.fromEntries(restrictions.entries()) };
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(out, null, 2)); } catch (_) {}
}
function restrictionFor(username) { return restrictions.get(clean(username)) || {banned:false, frozen:false}; }
function applyRestriction(target, action) {
  const key = clean(target);
  const r = restrictionFor(key);
  if (action === 'ban') r.banned = true;
  if (action === 'unban') r.banned = false;
  if (action === 'freeze') r.frozen = true;
  if (action === 'unfreeze') r.frozen = false;
  restrictions.set(key, r); persist();
  broadcastUser(key, {type:'restriction', target:key, action, banned:r.banned, frozen:r.frozen});
  return r;
}

const wss = new WebSocket.Server({ port: PORT });
wss.on('connection', ws => {
  let user = '';
  ws.on('message', raw => {
    try {
      const m = JSON.parse(raw.toString());
      const type = m.type;

      if (type === 'register') {
        user = clean(m.user);
        if (!user) return send(ws, {type:'error', message:'username required'});
        if (!users.has(user)) users.set(user, new Set());
        users.get(user).add(ws);
        send(ws, {type:'registered', user, banned:restrictionFor(user).banned, frozen:restrictionFor(user).frozen});
        const q = pending.get(user) || [];
        for (const item of q) send(ws, item);
        pending.delete(user);
        return;
      }

      if (type === 'admin_action') {
        if (String(m.adminKey || '') !== ADMIN_KEY) return send(ws, {type:'error', message:'admin authentication failed'});
        const action = String(m.action || '');
        if (!['ban','unban','freeze','unfreeze'].includes(action)) return send(ws, {type:'error', message:'unknown admin action'});
        const target = clean(m.target);
        if (!target) return send(ws, {type:'error', message:'target required'});
        const r = applyRestriction(target, action);
        return send(ws, {type:'admin_ok', target, action, banned:r.banned, frozen:r.frozen});
      }

      if (type === 'chat_message') {
        const from = clean(user || m.from);
        const to = clean(m.to);
        if (!from || !to) return send(ws, {type:'error', message:'sender and recipient required'});
        const rFrom = restrictionFor(from);
        const rTo = restrictionFor(to);
        if (rFrom.banned || rFrom.frozen) return send(ws, {type:'error', message:rFrom.banned ? 'Аккаунт заблокирован' : 'Аккаунт заморожен'});
        if (rTo.banned) return send(ws, {type:'error', message:'Получатель заблокирован'});
        if (rTo.frozen) return send(ws, {type:'error', message:'Получатель заморожен'});
        const out = {
          type:'chat_message', from, to,
          clientId:String(m.clientId || ''),
          messageType:String(m.messageType || 'text'),
          text:String(m.text || ''), uri:String(m.uri || '')
        };
        if (m.giftKind) out.giftKind = String(m.giftKind);
        if (m.giftValue) out.giftValue = String(m.giftValue);
        const delivered = broadcastUser(to, out, null);
        if (!delivered) queueFor(to, out);
        return send(ws, {type:'message_accepted', clientId:out.clientId, delivered:!!delivered});
      }

      // WebRTC signaling.
      if (type === 'call') {
        const target = clean(m.to);
        const delivered = broadcastUser(target, {type:'incoming', from:user, video:!!m.video}, null);
        if (!delivered) return send(ws, {type:'error', message:'Пользователь сейчас не подключён к серверу звонков'});
        return;
      }
      if (['offer','answer','ice','hangup','reject'].includes(type)) {
        const target = clean(m.to);
        const out = {...m, from:user};
        const delivered = broadcastUser(target, out, ws);
        if (!delivered) return send(ws, {type:'error', message:'Собеседник отключён'});
        return;
      }
    } catch(e) { send(ws, {type:'error', message:'bad message'}); }
  });

  ws.on('close', () => {
    if (!user) return;
    const set = users.get(user);
    if (!set) return;
    set.delete(ws);
    if (!set.size) users.delete(user);
  });
});

console.log('TeleMAX realtime server listening on ws://0.0.0.0:' + PORT);
console.log('Chat + gifts + admin restrictions + WebRTC signaling enabled');
