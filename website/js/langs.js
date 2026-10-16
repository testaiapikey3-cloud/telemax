/* ============================================================
 * TeleMAX Web — langs.js
 * Список языков мира для переключения интерфейса.
 * Перевод делает сервер (server/translate.js), клиент только
 * сохраняет выбор в cookie tmx_lang и перезагружает страницу.
 * ============================================================ */
window.TM = window.TM || {};

TM.langs = (function () {
  'use strict';

  var RTL = { ar: 1, he: 1, fa: 1, ur: 1, ps: 1, sd: 1, ug: 1, yi: 1, dv: 1 };

  /* [код, родное название] */
  var RAW = [
    ['ru', 'Русский'], ['en', 'English'], ['es', 'Español'], ['de', 'Deutsch'],
    ['fr', 'Français'], ['it', 'Italiano'], ['pt', 'Português'], ['tr', 'Türkçe'],
    ['uk', 'Українська'], ['kk', 'Қазақша'], ['uz', 'Oʻzbekcha'], ['ky', 'Кыргызча'],
    ['tg', 'Тоҷикӣ'], ['tk', 'Türkmençe'], ['az', 'Azərbaycan'], ['hy', 'Հայերեն'],
    ['ka', 'ქართული'], ['be', 'Беларуская'], ['ro', 'Română'], ['bg', 'Български'],
    ['sr', 'Српски'], ['hr', 'Hrvatski'], ['bs', 'Bosanski'], ['sl', 'Slovenščina'],
    ['mk', 'Македонски'], ['sq', 'Shqip'], ['el', 'Ελληνικά'], ['hu', 'Magyar'],
    ['cs', 'Čeština'], ['sk', 'Slovenčina'], ['pl', 'Polski'], ['lt', 'Lietuvių'],
    ['lv', 'Latviešu'], ['et', 'Eesti'], ['fi', 'Suomi'], ['sv', 'Svenska'],
    ['no', 'Norsk'], ['da', 'Dansk'], ['is', 'Íslenska'], ['nl', 'Nederlands'],
    ['fy', 'Frysk'], ['lb', 'Lëtzebuergesch'], ['ga', 'Gaeilge'], ['gd', 'Gàidhlig'],
    ['cy', 'Cymraeg'], ['mt', 'Malti'], ['ca', 'Català'], ['eu', 'Euskara'],
    ['gl', 'Galego'], ['eo', 'Esperanto'], ['la', 'Latina'], ['af', 'Afrikaans'],
    ['sw', 'Kiswahili'], ['am', 'አማርኛ'], ['ha', 'Hausa'], ['yo', 'Yorùbá'],
    ['ig', 'Igbo'], ['zu', 'isiZulu'], ['xh', 'isiXhosa'], ['st', 'Sesotho'],
    ['sn', 'chiShona'], ['ny', 'Chichewa'], ['rw', 'Kinyarwanda'], ['so', 'Soomaali'],
    ['mg', 'Malagasy'], ['ar', 'العربية'], ['he', 'עברית'], ['fa', 'فارسی'],
    ['ur', 'اردو'], ['ps', 'پښتو'], ['sd', 'سنڌي'], ['ug', 'ئۇيغۇرچە'],
    ['yi', 'ייִדיש'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['pa', 'ਪੰਜਾਬੀ'],
    ['gu', 'ગુજરાતી'], ['mr', 'मराठी'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'],
    ['kn', 'ಕನ್ನಡ'], ['ml', 'മലയാളം'], ['si', 'සිංහල'], ['ne', 'नेपाली'],
    ['or', 'ଓଡ଼ିଆ'], ['zh-CN', '中文 (简体)'], ['zh-TW', '中文 (繁體)'], ['ja', '日本語'],
    ['ko', '한국어'], ['mn', 'Монгол'], ['th', 'ไทย'], ['lo', 'ລາວ'],
    ['km', 'ខ្មែរ'], ['my', 'မြန်မာ'], ['vi', 'Tiếng Việt'], ['id', 'Bahasa Indonesia'],
    ['ms', 'Bahasa Melayu'], ['jw', 'Basa Jawa'], ['su', 'Basa Sunda'], ['tl', 'Filipino'],
    ['ceb', 'Cebuano'], ['haw', 'ʻŌlelo Hawaiʻi'], ['mi', 'Māori'], ['sm', 'Gagana Samoa'],
    ['ht', 'Kreyòl ayisyen'], ['hmn', 'Hmoob'], ['co', 'Corsu'], ['tt', 'Татарча']
  ];

  var LIST = RAW.map(function (p) {
    return { code: p[0], name: p[1], rtl: !!RTL[p[0].split('-')[0]] };
  });

  function byCode(code) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].code === code) return LIST[i];
    return null;
  }
  function name(code) { var l = byCode(code); return l ? l.name : (code || 'Русский'); }
  function isRtl(code) { var l = byCode(code); return !!(l && l.rtl); }
  function cookieLang() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)tmx_lang=([^;]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (_) {}
    return '';
  }
  /* текущий язык: cookie → настройки → язык браузера */
  function current() {
    var c = cookieLang();
    if (c && byCode(c)) return c;
    try {
      var st = TM.state && TM.state.store && TM.state.store();
      var saved = st && st.settings && st.settings.language;
      if (saved && byCode(saved)) return saved;
    } catch (_) {}
    try {
      var nav = String((navigator.languages && navigator.languages[0]) || navigator.language || 'ru');
      if (byCode(nav)) return nav;
      var short = nav.slice(0, 2).toLowerCase();
      if (byCode(short)) return short;
    } catch (_) {}
    return 'ru';
  }

  return { list: LIST, name: name, isRtl: isRtl, current: current, byCode: byCode };
})();
