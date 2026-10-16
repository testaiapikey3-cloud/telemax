/* ============================================================
 * TeleMAX Web — translate.js
 * Автоматический перевод интерфейса на любой язык мира.
 *
 * Как это работает:
 *   1) находит русские строки в файлах сайта (js/*.js, index.html,
 *      manifest.json, sw.js) и в push-уведомлениях сервера;
 *   2) переводит их через бесплатный переводчик (без ключей и npm);
 *   3) кэширует перевод на диске: server/lang-cache/<язык>.json;
 *   4) при отдаче статики подменяет строки на перевод.
 * Если перевод не удался — строка остаётся на русском (сайт работает).
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const API = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CYR = /[\u0400-\u04FF]/;
const RTL = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv']);
const MAX_URL = 7000;    // максимальная длина URL одного запроса к переводчику
const MAX_BATCH = 35;    // максимум строк за один запрос

let cacheDir = path.join(__dirname, 'lang-cache');
const dicts = new Map();     // lang -> { map: Map(рус -> перевод), dirty }
const warming = new Map();   // lang -> Promise (защита от параллельного прогрева)
const fileCache = new Map(); // ключ (lang|файл|mtime|size) -> переведённый текст

function init(dir) {
  if (dir) cacheDir = dir;
  try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
}
function validLang(lang) {
  const s = String(lang || '').trim();
  return /^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/.test(s) && s !== 'ru' ? s : '';
}
function isRtl(lang) { return RTL.has(String(lang || '').split('-')[0].toLowerCase()); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ------------------------------ словарь ------------------------------ */
function loadDict(lang) {
  let d = dicts.get(lang);
  if (d) return d;
  d = { map: new Map(), dirty: false };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cacheDir, lang + '.json'), 'utf8'));
    for (const k of Object.keys(raw)) d.map.set(k, String(raw[k]));
  } catch (_) {}
  dicts.set(lang, d);
  return d;
}
function saveDict(lang) {
  const d = dicts.get(lang);
  if (!d || !d.dirty) return;
  d.dirty = false;
  try {
    const obj = {};
    for (const [k, v] of d.map) obj[k] = v;
    const tmp = path.join(cacheDir, lang + '.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
    fs.renameSync(tmp, path.join(cacheDir, lang + '.json'));
  } catch (e) { console.log('translate: не удалось сохранить словарь', lang, e && e.message); }
}
/* синхронный поиск перевода (для push-уведомлений) */
function cached(lang, text) {
  lang = validLang(lang);
  if (!lang || !text || !CYR.test(text)) return null;
  return loadDict(lang).map.get(text) || null;
}

/* ------------------------------ переводчик ------------------------------ */
function httpJson(url, ms) {
  return new Promise((resolve, reject) => {
    const ctl = new AbortController();
    const t = setTimeout(() => { try { ctl.abort(); } catch (_) {} }, ms || 20000);
    fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => { clearTimeout(t); resolve(j); })
      .catch(e => { clearTimeout(t); reject(e); });
  });
}
async function apiTranslate(texts, lang) {
  const url = API + '&sl=ru&tl=' + encodeURIComponent(lang) + '&' +
    texts.map(t => 'q=' + encodeURIComponent(t)).join('&');
  const data = await httpJson(url);
  if (!Array.isArray(data)) throw new Error('плохой ответ переводчика');
  const arr = data.map(x => Array.isArray(x) ? String(x[0] || '') : String(x || ''));
  if (arr.length !== texts.length) throw new Error('несовпадение количества: ' + arr.length + '/' + texts.length);
  return arr;
}
function splitBatches(texts) {
  const out = [];
  let cur = [], len = 14;
  for (const t of texts) {
    const add = encodeURIComponent(t).length + 2;
    if (cur.length && (cur.length >= MAX_BATCH || len + add > MAX_URL)) { out.push(cur); cur = []; len = 14; }
    cur.push(t); len += add;
  }
  if (cur.length) out.push(cur);
  return out;
}

/* ------------------------------ разбор JS ------------------------------ */
const REGEX_KEYWORDS = ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else', 'yield', 'await'];
function isRegexStart(code, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(code[j])) j--;
  if (j < 0) return true;
  const c = code[j];
  if ('(,=:[!&|?{};+-*%^~<>'.indexOf(c) >= 0) return true;
  if (/[\w$]/.test(c)) {
    let k = j;
    while (k >= 0 && /[\w$]/.test(code[k])) k--;
    return REGEX_KEYWORDS.indexOf(code.slice(k + 1, j + 1)) >= 0;
  }
  return false;
}
function decodeRaw(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') { out += ch; continue; }
    const e = raw[i + 1];
    if (e === undefined) return null;
    if (e === 'n') { out += '\n'; i++; }
    else if (e === 'r') { out += '\r'; i++; }
    else if (e === 't') { out += '\t'; i++; }
    else if (e === 'b') { out += '\b'; i++; }
    else if (e === 'f') { out += '\f'; i++; }
    else if (e === 'v') { out += '\v'; i++; }
    else if (e === '0' && !/[0-9]/.test(raw[i + 2] || '')) { out += '\0'; i++; }
    else if (e === 'x') {
      const h = raw.substr(i + 2, 2);
      if (!/^[0-9a-fA-F]{2}$/.test(h)) return null;
      out += String.fromCharCode(parseInt(h, 16)); i += 3;
    }
    else if (e === 'u') {
      if (raw[i + 2] === '{') {
        const j = raw.indexOf('}', i + 3);
        if (j < 0) return null;
        const h = raw.slice(i + 3, j);
        if (!/^[0-9a-fA-F]{1,6}$/.test(h)) return null;
        out += String.fromCodePoint(parseInt(h, 16)); i = j;
      } else {
        const h = raw.substr(i + 2, 4);
        if (!/^[0-9a-fA-F]{4}$/.test(h)) return null;
        out += String.fromCharCode(parseInt(h, 16)); i += 5;
      }
    }
    else if (e === '\n') { i++; }
    else if (e === '\r') { i += raw[i + 2] === '\n' ? 2 : 1; }
    else { out += e; i++; }
  }
  return out;
}
function encodeRaw(text, quote) {
  let s = JSON.stringify(String(text)).slice(1, -1);
  if (quote === "'") s = s.replace(/'/g, "\\'");
  if (quote === '`') s = s.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return s;
}
/* все строковые литералы файла (с позициями) */
function extractJsStrings(code) {
  const out = [];
  const n = code.length;
  let i = 0;
  while (i < n) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && code[i + 1] === '*') { i += 2; while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '/' && isRegexStart(code, i)) {
      i++;
      let inClass = false;
      while (i < n) {
        const ch = code[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '\n') break;
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { i++; break; }
        i++;
      }
      while (i < n && /[a-z]/i.test(code[i])) i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c, start = i;
      i++;
      let raw = '', closed = false, interp = false;
      while (i < n) {
        const ch = code[i];
        if (ch === '\\') { raw += ch + (code[i + 1] || ''); i += 2; continue; }
        if (quote === '`' && ch === '$' && code[i + 1] === '{') { interp = true; break; }
        if (ch === quote) { i++; closed = true; break; }
        if (quote !== '`' && ch === '\n') break;
        raw += ch; i++;
      }
      if (closed && !interp) {
        const text = decodeRaw(raw);
        if (text != null) out.push({ start, end: i, quote, text });
      }
      continue;
    }
    i++;
  }
  return out;
}
function transformJs(code, lang) {
  const lits = extractJsStrings(code).filter(l => CYR.test(l.text));
  if (!lits.length) return { code, missing: 0 };
  const d = loadDict(lang);
  let out = '', pos = 0, missing = 0;
  for (const l of lits) {
    out += code.slice(pos, l.start);
    const tr = d.map.get(l.text);
    if (tr == null || tr === '') { missing++; out += code.slice(l.start, l.end); }
    else out += l.quote + encodeRaw(tr, l.quote) + l.quote;
    pos = l.end;
  }
  out += code.slice(pos);
  try { new vm.Script(out, { filename: 'translated.js' }); } catch (_) {
    console.log('translate: файл пропущен (не прошёл проверку синтаксиса)');
    return { code, missing: lits.length };
  }
  return { code: out, missing };
}

/* ------------------------------ разбор HTML / JSON ------------------------------ */
function extractHtmlStrings(html) {
  const out = [];
  let m;
  const t = />([^<>]+)</g;
  while ((m = t.exec(html))) { const s = m[1].trim(); if (s && CYR.test(s)) out.push(s); }
  const a = /(?:placeholder|title|alt|content|aria-label)="([^"]*)"/g;
  while ((m = a.exec(html))) { const s = m[1].trim(); if (s && CYR.test(s)) out.push(s); }
  return out;
}
function transformHtml(code, lang) {
  const d = loadDict(lang);
  let missing = 0;
  const tr = s => { const v = d.map.get(s); if (v == null || v === '') { missing++; return null; } return v; };
  let out = code.replace(/>([^<>]+)</g, (all, inner) => {
    const raw = inner.trim();
    if (!raw || !CYR.test(raw)) return all;
    const v = tr(raw);
    if (v == null) return all;
    return '>' + inner.replace(raw, String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')) + '<';
  });
  out = out.replace(/(placeholder|title|alt|content|aria-label)="([^"]*)"/g, (all, attr, val) => {
    const raw = val.trim();
    if (!raw || !CYR.test(raw)) return all;
    const v = tr(raw);
    if (v == null) return all;
    return attr + '="' + val.replace(raw, String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')) + '"';
  });
  out = out.replace(/<html lang="ru"/, '<html lang="' + lang + '"' + (isRtl(lang) ? ' dir="rtl"' : ''));
  return { code: out, missing };
}
function transformJson(code, lang) {
  let obj;
  try { obj = JSON.parse(code); } catch (_) { return null; }
  const d = loadDict(lang);
  let missing = 0;
  const walk = v => {
    if (typeof v === 'string') {
      if (!CYR.test(v)) return v;
      const tr = d.map.get(v);
      if (tr == null || tr === '') { missing++; return v; }
      return tr;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
    return v;
  };
  return { code: JSON.stringify(walk(obj), null, 2), missing };
}

/* ------------------------------ прогрев ------------------------------ */
function textsOfFile(file) {
  const ext = path.extname(file).toLowerCase();
  let code;
  try { code = fs.readFileSync(file, 'utf8'); } catch (_) { return []; }
  if (ext === '.js') return extractJsStrings(code).map(l => l.text).filter(s => CYR.test(s));
  if (ext === '.html') return extractHtmlStrings(code);
  if (ext === '.json') {
    const t = [];
    try {
      const obj = JSON.parse(code);
      const w = v => {
        if (typeof v === 'string') { if (CYR.test(v)) t.push(v); }
        else if (Array.isArray(v)) v.forEach(w);
        else if (v && typeof v === 'object') Object.values(v).forEach(w);
      };
      w(obj);
    } catch (_) {}
    return t;
  }
  return [];
}
async function warmBundle(lang, files, extra) {
  lang = validLang(lang);
  if (!lang) return { ok: false, error: 'Неподдерживаемый код языка' };
  if (warming.has(lang)) return warming.get(lang);
  const p = (async () => {
    const d = loadDict(lang);
    const set = new Set(extra || []);
    for (const f of files || []) for (const s of textsOfFile(f)) set.add(s);
    const missing = [];
    for (const s of set) if (s && CYR.test(s) && !d.map.has(s)) missing.push(s);
    const batches = splitBatches(missing);
    let failed = 0, idx = 0;
    const worker = async () => {
      while (idx < batches.length) {
        const b = batches[idx++];
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            const out = await apiTranslate(b, lang);
            b.forEach((s, i) => { if (out[i]) d.map.set(s, out[i]); });
            ok = true;
          } catch (e) {
            if (attempt) { failed += b.length; console.log('translate:', lang, e && e.message); }
            else await sleep(700);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, Math.max(1, batches.length)) }, worker));
    d.dirty = true;
    saveDict(lang);
    return { ok: true, lang, total: set.size, translated: missing.length - failed, failed };
  })();
  warming.set(lang, p);
  try { return await p; } finally { warming.delete(lang); }
}

/* фоновый прогрев (когда при отдаче файла чего-то не хватило) */
const soon = new Map();
function warmSoon(lang, files, extra) {
  if (!lang || soon.has(lang)) return;
  soon.set(lang, true);
  setTimeout(() => { warmBundle(lang, files, extra).catch(() => {}); }, 1500);
}

/* переведённый файл для отдачи (с кэшем по mtime) */
function transformFile(file, lang, onMissing) {
  let st;
  try { st = fs.statSync(file); } catch (_) { return null; }
  const key = lang + '|' + file + '|' + st.mtimeMs + '|' + st.size;
  const hit = fileCache.get(key);
  if (hit !== undefined) return hit;
  const ext = path.extname(file).toLowerCase();
  let code;
  try { code = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
  let res = null;
  if (ext === '.js') res = transformJs(code, lang);
  else if (ext === '.html') res = transformHtml(code, lang);
  else if (ext === '.json') res = transformJson(code, lang);
  if (!res || res.code == null) return null;
  if (res.missing > 0 && onMissing) { try { onMissing(); } catch (_) {} }
  if (fileCache.size > 400) fileCache.clear();
  fileCache.set(key, res.code);
  return res.code;
}

module.exports = { init, validLang, isRtl, cached, warmBundle, warmSoon, transformFile, textsOfFile };
