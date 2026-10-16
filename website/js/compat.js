/* ============================================================
 * TeleMAX Web — compat.js
 * Совместимость со старыми телефонами (Android 5+, старый Chrome):
 * полифиллы + лёгкий режим для слабых устройств.
 * Загружается первым, поэтому написан в ES5-синтаксисе.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- полифиллы ---------- */
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (len, pad) {
      var s = String(this); pad = pad == null ? ' ' : String(pad); len = len >> 0;
      if (s.length >= len || !pad) return s;
      var need = len - s.length, out = '';
      while (out.length < need) out += pad;
      return out.slice(0, need) + s;
    };
  }
  if (!String.prototype.padEnd) {
    String.prototype.padEnd = function (len, pad) {
      var s = String(this); pad = pad == null ? ' ' : String(pad); len = len >> 0;
      if (s.length >= len || !pad) return s;
      var need = len - s.length, out = '';
      while (out.length < need) out += pad;
      return s + out.slice(0, need);
    };
  }
  if (!String.prototype.includes) {
    String.prototype.includes = function (q, p) { return this.indexOf(q, p || 0) !== -1; };
  }
  if (!Array.prototype.includes) {
    Array.prototype.includes = function (q, p) {
      var i = p || 0; if (i < 0) i = Math.max(0, this.length + i);
      for (; i < this.length; i++) { var v = this[i]; if (v === q || (v !== v && q !== q)) return true; }
      return false;
    };
  }
  if (!Array.from) {
    Array.from = function (a, fn) {
      var out = [], n = a && a.length ? a.length : 0;
      for (var i = 0; i < n; i++) out.push(fn ? fn(a[i], i) : a[i]);
      return out;
    };
  }
  if (!Array.prototype.find) {
    Array.prototype.find = function (fn, t) { for (var i = 0; i < this.length; i++) if (fn.call(t, this[i], i, this)) return this[i]; return undefined; };
  }
  if (!Array.prototype.findIndex) {
    Array.prototype.findIndex = function (fn, t) { for (var i = 0; i < this.length; i++) if (fn.call(t, this[i], i, this)) return i; return -1; };
  }
  if (!Array.prototype.flat) {
    Array.prototype.flat = function (d) {
      var depth = d === undefined ? 1 : d >> 0, out = [];
      (function walk(a, dep) {
        for (var i = 0; i < a.length; i++) {
          var v = a[i];
          if (Array.isArray(v) && dep > 0) walk(v, dep - 1); else out.push(v);
        }
      })(this, depth);
      return out;
    };
  }
  if (!Object.assign) {
    Object.assign = function (t) {
      for (var i = 1; i < arguments.length; i++) {
        var s = arguments[i]; if (!s) continue;
        for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k];
      }
      return t;
    };
  }
  if (!Object.entries) {
    Object.entries = function (o) {
      var out = []; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out.push([k, o[k]]);
      return out;
    };
  }
  if (!Object.values) {
    Object.values = function (o) {
      var out = []; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out.push(o[k]);
      return out;
    };
  }
  if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.webkitMatchesSelector || Element.prototype.msMatchesSelector || Element.prototype.mozMatchesSelector;
  }
  if (!Element.prototype.closest) {
    Element.prototype.closest = function (sel) {
      var el = this;
      while (el && el.nodeType === 1) {
        if (el.matches && el.matches(sel)) return el;
        el = el.parentElement;
      }
      return null;
    };
  }
  /* fetch через XMLHttpRequest (Chrome < 42) */
  if (!window.fetch) {
    window.fetch = function (url, opts) {
      opts = opts || {};
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        try { xhr.open(opts.method || 'GET', url, true); } catch (e) { reject(e); return; }
        var h = opts.headers || {};
        for (var k in h) if (Object.prototype.hasOwnProperty.call(h, k)) { try { xhr.setRequestHeader(k, h[k]); } catch (_) {} }
        xhr.onload = function () {
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            text: function () { return Promise.resolve(xhr.responseText); },
            json: function () { return Promise.resolve(JSON.parse(xhr.responseText)); }
          });
        };
        xhr.onerror = function () { reject(new Error('network error')); };
        try { xhr.send(opts.body || null); } catch (e2) { reject(e2); }
      });
    };
  }

  /* ---------- возможности устройства ---------- */
  var html = document.documentElement;
  try {
    /* старый Chrome (49–83) не умеет flex-gap → включаем fallback-отступы */
    var ok = true;
    try {
      var d = document.createElement('div');
      d.style.cssText = 'display:flex;flex-direction:column;gap:1px;position:absolute;visibility:hidden;height:auto';
      var a = document.createElement('div'); a.style.height = '1px';
      var b = document.createElement('div'); b.style.height = '1px';
      d.appendChild(a); d.appendChild(b);
      document.body.appendChild(d);
      ok = d.scrollHeight >= 3;
      document.body.removeChild(d);
    } catch (_) { ok = true; }
    if (!ok) html.className += ' nogap';
  } catch (_) {}
  try {
    /* лёгкий режим для слабых телефонов: меньше эффектов и анимаций */
    var hc = navigator.hardwareConcurrency || 0;
    var dm = navigator.deviceMemory || 0;
    var heap = 0;
    try { var m = performance && performance.memory; heap = (m && m.jsHeapSizeLimit) || 0; } catch (_) {}
    var lite = (hc && hc <= 3) || (dm && dm <= 2) || (heap && heap <= 450 * 1048576) || (!hc && !dm && !heap);
    if (lite) html.className += ' lite';
  } catch (_) {}
})();
