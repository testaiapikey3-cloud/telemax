// TeleMAX v0.4.0 realtime server: global chat + offline queue + presence + gifts + admin restrictions.
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_KEY = process.env.TMX_ADMIN_KEY || 'testtestest654';
const DATA_FILE = path.join(__dirname, 'server-state.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, {recursive:true});

const users = new Map();       // username -> Set<WebSocket>
const pending = new Map();     // username -> messages
const restrictions = new Map();
const verifications = new Map();
const presence = new Map();
const profiles = new Map();

function clean(v) { return String(v || '').replace(/^@/, '').trim().toLowerCase(); }
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); return true; } catch (_) {}
  }
  return false;
}
function broadcastUser(username, obj) {
  const set = users.get(clean(username));
  if (!set) return 0;
  let n = 0;
  for (const ws of [...set]) if (send(ws, obj)) n++;
  return n;
}
function broadcastAll(obj, except) {
  let n = 0;
  for (const set of users.values()) for (const ws of [...set]) {
    if (ws !== except && send(ws, obj)) n++;
  }
  return n;
}
function queueFor(username, obj) {
  const key = clean(username);
  const q = pending.get(key) || [];
  q.push(obj);
  if (q.length > 500) q.splice(0, q.length - 500);
  pending.set(key, q);
}
function restrictionFor(u) { return restrictions.get(clean(u)) || {banned:false,frozen:false}; }
function verificationFor(u) { return verifications.get(clean(u)) || {verified:false,type:'',name:''}; }
function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      restrictions:Object.fromEntries(restrictions),
      verifications:Object.fromEntries(verifications),
      profiles:Object.fromEntries(profiles),
      pending:Object.fromEntries(pending)
    }, null, 2));
  } catch (e) { console.error('persist:', e.message); }
}
try {
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  for (const [k,v] of Object.entries(d.restrictions||{})) restrictions.set(k,v);
  for (const [k,v] of Object.entries(d.verifications||{})) verifications.set(k,v);
  for (const [k,v] of Object.entries(d.profiles||{})) profiles.set(k,v);
  for (const [k,v] of Object.entries(d.pending||{})) pending.set(k,v);
} catch (_) {}

function applyRestriction(target, action) {
  const key = clean(target);
  const r = restrictionFor(key);
  if (action==='ban') r.banned=true;
  if (action==='unban') r.banned=false;
  if (action==='freeze') r.frozen=true;
  if (action==='unfreeze') r.frozen=false;
  restrictions.set(key,r); persist();
  broadcastUser(key,{type:'restriction',target:key,action,banned:r.banned,frozen:r.frozen});
  return r;
}

const httpServer = http.createServer((req,res)=>{
  if (req.url === '/health') {
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({ok:true,service:'telemax-realtime',version:'0.5.1',users:users.size,queued:[...pending.values()].reduce((a,x)=>a+x.length,0)}));
  }
  if (req.method === 'POST' && req.url.startsWith('/upload?')) {
    const u=new URL(req.url,'http://localhost'); const user=clean(u.searchParams.get('user'));
    const raw=String(u.searchParams.get('name')||'file').replace(/[^a-zA-Z0-9._-]/g,'_');
    const name=Date.now()+'_'+Math.random().toString(36).slice(2,10)+'_'+raw.slice(-100);
    const out=fs.createWriteStream(path.join(UPLOAD_DIR,name)); req.pipe(out);
    out.on('finish',()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,url:'/uploads/'+name,name,owner:user}));});
    out.on('error',()=>{res.writeHead(500);res.end('upload error');}); return;
  }
  if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
    const name=path.basename(req.url.split('?')[0]); const file=path.join(UPLOAD_DIR,name);
    if (!fs.existsSync(file)) {res.writeHead(404);return res.end('Not found');}
    res.writeHead(200); return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404); res.end('Not found');
});
const wss = new WebSocket.Server({server:httpServer});
httpServer.listen(PORT,HOST,()=>console.log(`TeleMAX realtime listening on ws://${HOST}:${PORT}`));

wss.on('connection',(ws)=>{
  let user='';
  let registered=false;

  ws.on('message',(raw)=>{
    let m;
    try { m=JSON.parse(raw.toString()); } catch (_) { return send(ws,{type:'error',message:'bad json'}); }
    const type=String(m.type||'');

    if (type==='ping') return send(ws,{type:'pong',time:Date.now()});

    if (type==='register') {
      const next=clean(m.user);
      if (!next) return send(ws,{type:'error',message:'username required'});
      const name=String(m.name||'').trim();
      const identity=String(m.identity||'').trim();
      const known=profiles.get(next);
      if (known && identity && known.identity && known.identity!==identity)
        return send(ws,{type:'error',message:'username already belongs to another account'});
      const knownProfile=profiles.get(next)||{}; profiles.set(next,{name,identity,avatarData:String(m.avatarData||knownProfile.avatarData||''),verified:verificationFor(next).verified,registeredAt:String(m.registeredAt||knownProfile.registeredAt||'')}); persist();

      // A reconnect from the same account is allowed; each device gets its own socket.
      user=next; registered=true;
      if (!users.has(user)) users.set(user,new Set());
      users.get(user).add(ws);
      presence.set(user,{online:true,lastSeen:Date.now()});

      const r=restrictionFor(user);
      send(ws,{type:'registered',user,banned:r.banned,frozen:r.frozen,verified:verificationFor(user),online:true});
      send(ws,{type:'presence_snapshot',items:Object.fromEntries(presence)});
      send(ws,{type:'verified_snapshot',items:Object.fromEntries(verifications)});
      const profileItems={}; for (const [u,p] of profiles.entries()) profileItems[u]=p; send(ws,{type:'profile_snapshot',items:profileItems});

      const q=pending.get(user)||[];
      for (const item of q) send(ws,item);
      if (q.length) { pending.delete(user); persist(); }
      broadcastAll({type:'presence',user,online:true,lastSeen:Date.now()},ws);
      return;
    }

    if (!registered) return send(ws,{type:'error',message:'register first'});


    if (type==='profile_update') {
      const target=clean(m.user); if(!target || target!==user) return send(ws,{type:'error',message:'profile user mismatch'});
      const current=profiles.get(target)||{};
      const next={...current,name:String(m.name||current.name||target),identity:current.identity||'',avatarData:String(m.avatarData||''),verified:!!m.verified,registeredAt:String(m.registeredAt||current.registeredAt||'')};
      profiles.set(target,next); persist();
      return broadcastAll({type:'profile_update',user:target,name:next.name,avatarData:next.avatarData,verified:next.verified,registeredAt:next.registeredAt});
    }

    if (type==='chat_message') {
      const from=clean(user), to=clean(m.to);
      if (!to) return send(ws,{type:'error',message:'recipient required'});
      const rf=restrictionFor(from), rt=restrictionFor(to);
      if (rf.banned || rf.frozen) return send(ws,{type:'error',message:rf.banned?'Аккаунт заблокирован':'Аккаунт заморожен'});
      if (rt.banned) return send(ws,{type:'error',message:'Получатель заблокирован'});

      const out={
        type:'chat_message', from, to,
        clientId:String(m.clientId||''),
        messageType:String(m.messageType||'text'),
        text:String(m.text||''), uri:String(m.uri||''),
        giftKind:String(m.giftKind||''), giftValue:String(m.giftValue||''),
        serverTime:Date.now()
      };
      const delivered=broadcastUser(to,out);
      if (!delivered) { queueFor(to,out); persist(); }
      return send(ws,{type:'message_accepted',clientId:out.clientId,delivered:delivered>0,queued:delivered===0,serverTime:out.serverTime});
    }

    if (type==='admin_action') {
      if (!ADMIN_KEY || ADMIN_KEY==='CHANGE_ME' || String(m.adminKey||'')!==ADMIN_KEY)
        return send(ws,{type:'error',message:'admin authentication failed'});
      const action=String(m.action||''), target=clean(m.target);
      if (!target) return send(ws,{type:'error',message:'target required'});
      if (action==='verify' || action==='unverify') {
        if (action==='verify') {
          const profile=profiles.get(target), exact=String(m.name||'').trim();
          if (!profile || !profile.name || profile.name!==exact)
            return send(ws,{type:'error',message:'verification requires exact name + username match'});
          const item={verified:true,type:String(m.kind||'person'),name:exact};
          verifications.set(target,item); const p=profiles.get(target)||{}; profiles.set(target,{...p,verified:true,name:exact}); persist();
          broadcastAll({type:'verification',target,...item});
          return send(ws,{type:'admin_ok',target,action,...item});
        }
        verifications.delete(target); const p=profiles.get(target)||{}; profiles.set(target,{...p,verified:false}); persist();
        broadcastAll({type:'verification',target,verified:false,type:'person',name:target});
        return send(ws,{type:'admin_ok',target,action,verified:false});
      }
      if (!['ban','unban','freeze','unfreeze'].includes(action))
        return send(ws,{type:'error',message:'unknown admin action'});
      const r=applyRestriction(target,action);
      return send(ws,{type:'admin_ok',target,action,banned:r.banned,frozen:r.frozen});
    }

    // WebRTC signaling
    if (['call','offer','answer','ice','hangup','reject'].includes(type)) {
      const target=clean(m.to);
      if (!target) return send(ws,{type:'error',message:'recipient required'});
      const out={...m,from:user};
      const delivered=broadcastUser(target,out);
      if (!delivered && type!=='hangup') return send(ws,{type:'error',message:'Собеседник отключён'});
    }
  });

  ws.on('close',()=>{
    if (!registered || !user) return;
    const set=users.get(user);
    if (!set) return;
    set.delete(ws);
    if (!set.size) {
      users.delete(user);
      presence.set(user,{online:false,lastSeen:Date.now()});
      broadcastAll({type:'presence',user,online:false,lastSeen:Date.now()});
    }
  });
});
