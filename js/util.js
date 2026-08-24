/* ===== Exitcel : util.js =====
   共通ユーティリティ / A1 参照変換 / 表示形式(数値書式)エンジン
*/
var U = (function () {

  /* ---------- 列名 <-> 列番号 ---------- */
  function colName(c) {
    var s = '';
    c = c | 0;
    do { s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26) - 1; } while (c >= 0);
    return s;
  }
  function colIndex(name) {
    var n = 0;
    name = String(name).toUpperCase();
    for (var i = 0; i < name.length; i++) n = n * 26 + (name.charCodeAt(i) - 64);
    return n - 1;
  }
  function a1(r, c) { return colName(c) + (r + 1); }
  function rangeA1(r1, c1, r2, c2) {
    return (r1 === r2 && c1 === c2) ? a1(r1, c1) : a1(r1, c1) + ':' + a1(r2, c2);
  }
  /* "B3" -> {r,c} / null */
  function parseA1(s) {
    var m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(String(s).trim());
    if (!m) return null;
    return { r: parseInt(m[2], 10) - 1, c: colIndex(m[1]) };
  }
  /* "A1:C5" / "A1" -> {r1,c1,r2,c2} / null */
  function parseRange(s) {
    s = String(s).trim();
    var p = s.split(':');
    var a = parseA1(p[0]); if (!a) return null;
    if (p.length === 1) return { r1: a.r, c1: a.c, r2: a.r, c2: a.c };
    var b = parseA1(p[1]); if (!b) return null;
    return {
      r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c),
      r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c)
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  /* ---------- 日付シリアル値 (Excel互換: 1899-12-30 起点) ---------- */
  var EPOCH = Date.UTC(1899, 11, 30);
  function dateToSerial(d) { return (d.getTime() - d.getTimezoneOffset() * 60000 - EPOCH) / 86400000; }
  function serialToDate(n) {
    var ms = EPOCH + Math.round(n * 86400000);
    var d = new Date(ms);
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  }
  function todaySerial() { var d = new Date(); d.setHours(0, 0, 0, 0); return Math.floor(dateToSerial(d)); }
  function nowSerial() { return dateToSerial(new Date()); }

  /* ---------- 入力文字列の解釈 ---------- */
  var RE_NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  var RE_DATE1 = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/;
  var RE_DATE2 = /^(\d{1,2})[\/\-](\d{1,2})$/;
  var RE_TIME = /^(\d{1,2}):(\d{1,2})(:(\d{1,2}))?$/;
  var RE_DT = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})[ T](\d{1,2}):(\d{1,2})(:(\d{1,2}))?$/;

  /* 生入力 -> {v, f, numFmt} : f があれば数式 */
  function parseInput(text, forceText) {
    var t = String(text);
    if (t === '') return { v: null };
    if (t.charAt(0) === '=' && t.length > 1) return { v: null, f: t.slice(1) };
    if (forceText) return { v: t };
    var s = t.trim();
    if (s === '') return { v: t };
    if (/^(TRUE|FALSE)$/i.test(s)) return { v: /^t/i.test(s) };
    // パーセント
    if (/^[+-]?[\d,]*\.?\d+%$/.test(s)) {
      var pv = parseFloat(s.replace(/[,%]/g, ''));
      if (!isNaN(pv)) return { v: pv / 100, numFmt: '0.00%' };
    }
    // 通貨
    var cm = /^([¥$€£])\s*([+-]?[\d,]*\.?\d+)$/.exec(s);
    if (cm) {
      var cv = parseFloat(cm[2].replace(/,/g, ''));
      if (!isNaN(cv)) return { v: cv, numFmt: cm[1] + '#,##0' + (cm[2].indexOf('.') >= 0 ? '.00' : '') };
    }
    // 桁区切り数値
    if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
      return { v: parseFloat(s.replace(/,/g, '')), numFmt: '#,##0' + (s.indexOf('.') >= 0 ? '.00' : '') };
    }
    if (RE_NUM.test(s)) return { v: parseFloat(s) };
    var m;
    if ((m = RE_DT.exec(s))) {
      return {
        v: dateToSerial(new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[7] || 0))),
        numFmt: 'yyyy/mm/dd hh:mm'
      };
    }
    if ((m = RE_DATE1.exec(s))) {
      return { v: dateToSerial(new Date(+m[1], m[2] - 1, +m[3])), numFmt: 'yyyy/mm/dd' };
    }
    if ((m = RE_DATE2.exec(s))) {
      var y = new Date().getFullYear();
      return { v: dateToSerial(new Date(y, m[1] - 1, +m[2])), numFmt: 'mm/dd' };
    }
    if ((m = RE_TIME.exec(s))) {
      var sec = (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[4] || 0));
      return { v: sec / 86400, numFmt: m[4] ? 'hh:mm:ss' : 'hh:mm' };
    }
    return { v: t };
  }

  /* ---------- 表示形式エンジン ---------- */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

  function pad(n, w) { n = String(Math.abs(n)); while (n.length < w) n = '0' + n; return n; }

  function isDateFmt(fmt) {
    if (!fmt || fmt === 'General' || fmt === '@') return false;
    return /(yy|mm?m|dd?|hh?|ss?|aaa)/i.test(fmt.replace(/"[^"]*"/g, '')) &&
           /[ymdhsa]/i.test(fmt.replace(/"[^"]*"/g, ''));
  }

  /* 数値部の書式適用 ("#,##0.00" など) */
  function applyNumericPattern(num, pat) {
    var pct = 0, i;
    var body = pat.replace(/%/g, function () { pct++; return '%'; });
    for (i = 0; i < pct; i++) num *= 100;

    // 指数
    var em = /^(.*?)[Ee]([+-]?)(0+)$/.exec(body);
    if (em) {
      var mant = em[1], expDigits = em[3].length;
      var decs = (mant.split('.')[1] || '').replace(/[^0#]/g, '').length;
      var s = num.toExponential(decs);
      var parts = s.split('e');
      var ex = parseInt(parts[1], 10);
      var sign = ex < 0 ? '-' : (em[2] === '+' ? '+' : '');
      return parts[0] + 'E' + sign + pad(Math.abs(ex), expDigits);
    }

    var neg = num < 0;
    var a = Math.abs(num);
    var dotAt = body.indexOf('.');
    var intPat = dotAt < 0 ? body : body.slice(0, dotAt);
    var decPat = dotAt < 0 ? '' : body.slice(dotAt + 1);
    var decCount = (decPat.match(/[0#?]/g) || []).length;
    var useComma = /[#0],[#0]/.test(intPat) || /,[#0]{3}/.test(intPat) || intPat.indexOf(',') >= 0;

    var fixed = a.toFixed(Math.min(decCount, 20));
    var fp = fixed.split('.');
    var ip = fp[0], dp = fp[1] || '';

    var minInt = (intPat.replace(/,/g, '').match(/0/g) || []).length;
    while (ip.length < minInt) ip = '0' + ip;
    if (minInt === 0 && ip === '0' && !/0/.test(intPat)) ip = '';
    if (useComma) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // 末尾の # に対応する 0 を削る
    if (dp) {
      var dArr = decPat.replace(/[^0#?]/g, '').split('');
      var keep = dp.length;
      for (var k = dArr.length - 1; k >= 0; k--) {
        if (dArr[k] === '0') break;
        if (dp.charAt(k) === '0') keep = k; else break;
      }
      dp = dp.slice(0, keep);
    }

    var out = ip + (dp ? '.' + dp : '');
    // リテラル(前後の記号)を戻す
    var prefix = '', suffix = '';
    var pm = /^([^#0.,]*)/.exec(intPat); if (pm) prefix = pm[1];
    var sm = /([^#0.,]*)$/.exec(decPat || intPat); if (sm) suffix = sm[1];
    prefix = prefix.replace(/"/g, '').replace(/\\/g, '');
    suffix = suffix.replace(/"/g, '').replace(/\\/g, '');
    return (neg ? '-' : '') + prefix + out + suffix;
  }

  function formatDate(serial, fmt) {
    var d = serialToDate(serial);
    var out = '', i = 0;
    var h12 = /am\/pm|a\/p/i.test(fmt);
    while (i < fmt.length) {
      var ch = fmt.charAt(i);
      if (ch === '"') { var j = fmt.indexOf('"', i + 1); out += fmt.slice(i + 1, j < 0 ? fmt.length : j); i = (j < 0 ? fmt.length : j + 1); continue; }
      if (ch === '\\') { out += fmt.charAt(i + 1) || ''; i += 2; continue; }
      var rest = fmt.slice(i);
      var m;
      if ((m = /^(am\/pm|a\/p)/i.exec(rest))) { out += (d.getHours() < 12 ? 'AM' : 'PM'); i += m[0].length; continue; }
      if ((m = /^aaaa/i.exec(rest))) { out += DAYS_JA[d.getDay()] + '曜日'; i += 4; continue; }
      if ((m = /^aaa/i.exec(rest))) { out += DAYS_JA[d.getDay()]; i += 3; continue; }
      if ((m = /^dddd/i.exec(rest))) { out += DAYS[d.getDay()]; i += 4; continue; }
      if ((m = /^ddd/i.exec(rest))) { out += DAYS[d.getDay()]; i += 3; continue; }
      if ((m = /^yyyy/i.exec(rest))) { out += d.getFullYear(); i += 4; continue; }
      if ((m = /^yy/i.exec(rest))) { out += pad(d.getFullYear() % 100, 2); i += 2; continue; }
      if ((m = /^mmmm/i.exec(rest))) { out += MONTHS[d.getMonth()]; i += 4; continue; }
      if ((m = /^mmm/i.exec(rest))) { out += MONTHS[d.getMonth()]; i += 3; continue; }
      if ((m = /^hh/i.exec(rest))) { var hh = d.getHours(); if (h12) hh = hh % 12 || 12; out += pad(hh, 2); i += 2; continue; }
      if ((m = /^h/i.exec(rest))) { var h1 = d.getHours(); if (h12) h1 = h1 % 12 || 12; out += h1; i += 1; continue; }
      if ((m = /^ss/i.exec(rest))) { out += pad(d.getSeconds(), 2); i += 2; continue; }
      if ((m = /^s/i.exec(rest))) { out += d.getSeconds(); i += 1; continue; }
      if ((m = /^mm/i.exec(rest))) {
        // 直前が h なら「分」
        var before = fmt.slice(0, i).replace(/"[^"]*"/g, '');
        out += /[hH][hH]?[^a-zA-Z]*$/.test(before) ? pad(d.getMinutes(), 2) : pad(d.getMonth() + 1, 2);
        i += 2; continue;
      }
      if ((m = /^m/i.exec(rest))) {
        var b2 = fmt.slice(0, i).replace(/"[^"]*"/g, '');
        out += /[hH][hH]?[^a-zA-Z]*$/.test(b2) ? d.getMinutes() : (d.getMonth() + 1);
        i += 1; continue;
      }
      if ((m = /^dd/i.exec(rest))) { out += pad(d.getDate(), 2); i += 2; continue; }
      if ((m = /^d/i.exec(rest))) { out += d.getDate(); i += 1; continue; }
      out += ch; i++;
    }
    return out;
  }

  /* 標準書式 */
  function generalFormat(n) {
    if (!isFinite(n)) return String(n);
    if (n === 0) return '0';
    var a = Math.abs(n);
    if (a >= 1e11 || (a < 1e-9 && a > 0)) {
      return n.toExponential(5).replace(/e([+-])(\d)$/, 'E$10$2').replace('e', 'E');
    }
    var s = String(Math.round(n * 1e10) / 1e10);
    if (s.length > 15) s = String(parseFloat(n.toPrecision(11)));
    return s;
  }

  /* 値 + 書式 -> 表示文字列 */
  function formatValue(v, fmt) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'object' && v.err) return v.err;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (!fmt) fmt = 'General';
    if (fmt === '@') return String(v);
    if (typeof v !== 'number') {
      var secs = fmt.split(';');
      if (secs.length >= 4) {
        var tf = secs[3].replace(/"/g, '');
        if (tf.indexOf('@') >= 0) return tf.replace('@', String(v));
      }
      return String(v);
    }
    if (fmt === 'General') return generalFormat(v);
    if (isDateFmt(fmt)) return formatDate(v, fmt);

    var sections = splitSections(fmt);
    var pat;
    if (v > 0) pat = sections[0];
    else if (v < 0) pat = sections.length > 1 ? sections[1] : sections[0];
    else pat = sections.length > 2 ? sections[2] : sections[0];
    var forceAbs = (v < 0 && sections.length > 1);
    try {
      var r = applyNumericPattern(forceAbs ? Math.abs(v) : v, pat);
      if (forceAbs && pat.indexOf('-') < 0 && pat.indexOf('(') < 0) r = '-' + r;
      return r;
    } catch (e) { return generalFormat(v); }
  }

  function splitSections(fmt) {
    var out = [], cur = '', inQ = false;
    for (var i = 0; i < fmt.length; i++) {
      var ch = fmt.charAt(i);
      if (ch === '"') { inQ = !inQ; cur += ch; continue; }
      if (ch === ';' && !inQ) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  /* 表示形式が数値系なら右寄せ */
  function defaultAlign(v) {
    if (v === null || v === undefined || v === '') return 'left';
    if (typeof v === 'object' && v.err) return 'center';
    if (typeof v === 'boolean') return 'center';
    if (typeof v === 'number') return 'right';
    return 'left';
  }

  /* ---------- 文字幅測定 ---------- */
  var _mc = null;
  function measureText(text, font) {
    if (!_mc) { var c = document.createElement('canvas'); _mc = c.getContext('2d'); }
    _mc.font = font || '11px "Yu Gothic UI",Meiryo,sans-serif';
    return _mc.measureText(text).width;
  }

  /* ---------- CSV ---------- */
  function csvEscape(s, sep) {
    s = (s === null || s === undefined) ? '' : String(s);
    if (s.indexOf(sep) >= 0 || s.indexOf('"') >= 0 || /[\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  function parseDelimited(text, sep) {
    var rows = [], row = [], cur = '', inQ = false, i = 0;
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    while (i < text.length) {
      var ch = text.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cur += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cur += ch; i++; continue;
      }
      if (ch === '"' && cur === '') { inQ = true; i++; continue; }
      if (ch === sep) { row.push(cur); cur = ''; i++; continue; }
      if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
      cur += ch; i++;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* ---------- 色 ---------- */
  function hexToARGB(hex) {
    if (!hex) return null;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    return 'FF' + hex.toUpperCase();
  }
  function argbToHex(argb) {
    if (!argb) return null;
    argb = String(argb).replace('#', '');
    if (argb.length === 8) argb = argb.slice(2);
    if (argb.length !== 6) return null;
    return '#' + argb.toLowerCase();
  }

  function download(blob, filename) {
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  }

  function uid() {
    return 'o' + Math.floor(Math.random() * 1e9).toString(36) + (uid._n = (uid._n || 0) + 1).toString(36);
  }

  return {
    colName: colName, colIndex: colIndex, a1: a1, rangeA1: rangeA1,
    parseA1: parseA1, parseRange: parseRange,
    clamp: clamp, esc: esc,
    dateToSerial: dateToSerial, serialToDate: serialToDate,
    todaySerial: todaySerial, nowSerial: nowSerial,
    parseInput: parseInput, formatValue: formatValue, generalFormat: generalFormat,
    isDateFmt: isDateFmt, defaultAlign: defaultAlign, measureText: measureText,
    csvEscape: csvEscape, parseDelimited: parseDelimited,
    hexToARGB: hexToARGB, argbToHex: argbToHex,
    download: download, uid: uid
  };
})();
