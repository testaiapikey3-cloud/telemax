/* ============================================================
 * TeleMAX Web — push.js
 * Отправка Web Push-уведомлений (RFC 8291, RFC 8188 aes128gcm)
 * с подписью VAPID (RFC 8292) — на встроенном crypto, без npm-модулей.
 * ============================================================ */
'use strict';
const crypto = require('crypto');
const https = require('https');
const http = require('http');

/* ---------- base64url ---------- */
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const fromB64 = s => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// SPKI-заголовок для несжатой точки P-256 (0x04 || X || Y)
const SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');

/* ---------- VAPID ключи ---------- */
function generateVapidKeys() {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = pair.publicKey.export({ type: 'spki', format: 'der' }).slice(-65);
  const priv = pair.privateKey.export({ type: 'pkcs8', format: 'der' });
  return { publicKey: b64url(pub), privateKey: b64url(priv) };
}
function privateKeyObj(privB64) {
  return crypto.createPrivateKey({ key: fromB64(privB64), format: 'der', type: 'pkcs8' });
}
function publicKeyObj(point65) {
  return crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, point65]), format: 'der', type: 'spki' });
}

/* ---------- VAPID JWT (ES256) ---------- */
function vapidJwt(vapid, audience, subject) {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject
  }));
  const data = header + '.' + payload;
  const sig = crypto.sign('sha256', Buffer.from(data, 'ascii'), { key: privateKeyObj(vapid.privateKey), dsaEncoding: 'ieee-p1363' });
  return data + '.' + b64url(sig);
}

/* ---------- HKDF (RFC 5869) ---------- */
function hkdfExtract(salt, ikm) {
  return crypto.createHmac('sha256', salt).update(ikm).digest();
}
function hkdfExpand(prk, info, len) {
  let out = Buffer.alloc(0);
  let t = Buffer.alloc(0);
  for (let i = 1; out.length < len; i++) {
    t = crypto.createHmac('sha256', prk).update(Buffer.concat([t, info, Buffer.from([i])])).digest();
    out = Buffer.concat([out, t]);
  }
  return out.slice(0, len);
}

/* ---------- шифрование полезной нагрузки (aes128gcm) ---------- */
function encryptPayload(plaintext, p256dhB64, authB64) {
  const uaPublic = fromB64(p256dhB64);
  if (uaPublic.length !== 65) throw new Error('bad p256dh key');
  const authSecret = fromB64(authB64);
  if (!authSecret.length) throw new Error('bad auth secret');

  const as = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const asPublic = as.publicKey.export({ type: 'spki', format: 'der' }).slice(-65);
  const secret = crypto.diffieHellman({ privateKey: as.privateKey, publicKey: publicKeyObj(uaPublic) });

  // RFC 8291: ikm = HKDF-Expand(HKDF-Extract(auth_secret, ecdh_secret), "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'ascii'), uaPublic, asPublic]);
  const ikm = hkdfExpand(hkdfExtract(authSecret, secret), keyInfo, 32);

  // RFC 8188: prk = HKDF-Extract(salt, ikm)
  const salt = crypto.randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'ascii'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'ascii'), 12);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // последняя (единственная) запись заканчивается разделителем 0x02
  const data = Buffer.concat([Buffer.from(plaintext, 'utf8'), Buffer.from([2])]);
  const body = Buffer.concat([
    salt,
    rs,
    Buffer.from([asPublic.length]),
    asPublic,
    cipher.update(data),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  return body;
}

/* ---------- отправка одного push ---------- */
function sendPush(sub, payload, vapid, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    let endpoint;
    try { endpoint = new URL(sub.endpoint); } catch (_) { return resolve({ ok: false, gone: true, status: 0 }); }
    if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') return resolve({ ok: false, gone: true, status: 0 });

    let body;
    try {
      body = encryptPayload(JSON.stringify(payload), sub.keys && sub.keys.p256dh, sub.keys && sub.keys.auth);
    } catch (e) {
      return resolve({ ok: false, error: e.message, gone: true, status: 0 });
    }

    const jwt = vapidJwt(vapid, endpoint.origin, opts.subject || 'mailto:admin@telemax-web.local');
    const headers = {
      'TTL': String(opts.ttl || 3600),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': body.length,
      'Authorization': 'vapid t=' + jwt + ', k=' + vapid.publicKey,
      'Urgency': opts.urgency || 'high'
    };
    const lib = endpoint.protocol === 'https:' ? https : http;
    const req = lib.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
      path: endpoint.pathname + endpoint.search,
      method: 'POST',
      headers,
      timeout: 15000
    }, res => {
      const status = res.statusCode || 0;
      res.resume();
      const gone = status === 404 || status === 410;
      resolve({ ok: status >= 200 && status < 300, status, gone });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', e => resolve({ ok: false, error: e.message, status: 0, gone: false }));
    req.end(body);
  });
}

module.exports = { generateVapidKeys, sendPush, encryptPayload, vapidJwt, _internal: { b64url, fromB64, hkdfExtract, hkdfExpand } };
