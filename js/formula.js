/* ===== Exitcel : formula.js =====
   数式のトークナイズ / 構文解析 / 評価 と 関数ライブラリ
*/
var F = (function () {

  function err(code) { return { err: code }; }
  function isErr(v) { return v && typeof v === 'object' && v.err; }
  var ERR = {
    DIV0: '#DIV/0!', NAME: '#NAME?', VALUE: '#VALUE!', REF: '#REF!',
    NUM: '#NUM!', NA: '#N/A', CIRC: '#CIRC!', NULL: '#NULL!'
  };

  /* =========================================================
     トークナイザ
     ========================================================= */
  var RE_REF = /^(?:('([^']+)'|[A-Za-z_぀-ヿ一-龯][A-Za-z0-9_.぀-ヿ一-龯]*)!)?(\$?[A-Za-z]{1,3}\$?[0-9]{1,7})(?::(\$?[A-Za-z]{1,3}\$?[0-9]{1,7}))?/;

  function tokenize(src) {
    var t = [], i = 0, n = src.length;
    while (i < n) {
      var ch = src.charAt(i);
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
      // 文字列
      if (ch === '"') {
        var s = '', j = i + 1;
        while (j < n) {
          if (src.charAt(j) === '"') {
            if (src.charAt(j + 1) === '"') { s += '"'; j += 2; continue; }
            break;
          }
          s += src.charAt(j); j++;
        }
        t.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      // 数値
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src.charAt(i + 1)))) {
        var m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(src.slice(i));
        t.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      // エラーリテラル
      if (ch === '#') {
        var em = /^#(DIV\/0!|NAME\?|VALUE!|REF!|NUM!|N\/A|NULL!|CIRC!)/i.exec(src.slice(i));
        if (em) { t.push({ t: 'err', v: '#' + em[1].toUpperCase() }); i += em[0].length; continue; }
      }
      // 参照 / 関数名 / 真偽値
      if (/[A-Za-z_$'぀-ヿ一-龯]/.test(ch)) {
        var rm = RE_REF.exec(src.slice(i));
        // 関数呼び出しか判定 : 識別子の直後が '(' なら関数
        var im = /^[A-Za-z_.぀-ヿ一-龯][A-Za-z0-9_.぀-ヿ一-龯]*/.exec(src.slice(i));
        if (im && /^\s*\(/.test(src.slice(i + im[0].length))) {
          t.push({ t: 'func', v: im[0].toUpperCase() }); i += im[0].length; continue;
        }
        if (rm && rm[3]) {
          t.push({
            t: rm[4] ? 'range' : 'ref',
            sheet: rm[2] || (rm[1] && rm[1].charAt(0) !== "'" ? rm[1] : null),
            a: rm[3], b: rm[4] || null
          });
          i += rm[0].length; continue;
        }
        if (im) {
          var up = im[0].toUpperCase();
          if (up === 'TRUE') { t.push({ t: 'bool', v: true }); i += im[0].length; continue; }
          if (up === 'FALSE') { t.push({ t: 'bool', v: false }); i += im[0].length; continue; }
          t.push({ t: 'name', v: im[0] }); i += im[0].length; continue;
        }
      }
      // 演算子
      var two = src.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '<>') { t.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/^&=<>%'.indexOf(ch) >= 0) { t.push({ t: 'op', v: ch }); i++; continue; }
      if (ch === '(') { t.push({ t: '(' }); i++; continue; }
      if (ch === ')') { t.push({ t: ')' }); i++; continue; }
      if (ch === ',' || ch === ';') { t.push({ t: ',' }); i++; continue; }
      if (ch === '{' || ch === '}') { t.push({ t: ch }); i++; continue; }
      if (ch === ':') { t.push({ t: 'op', v: ':' }); i++; continue; }
      throw new Error('bad char ' + ch);
    }
    return t;
  }

  /* =========================================================
     パーサ (再帰下降)
     ========================================================= */
  function parse(src) {
    var toks = tokenize(src), p = 0;
    function peek() { return toks[p]; }
    function next() { return toks[p++]; }
    function expect(tt) { var t = next(); if (!t || t.t !== tt) throw new Error('expected ' + tt); return t; }

    function parseExpr() { return parseCompare(); }

    function parseCompare() {
      var left = parseConcat();
      while (peek() && peek().t === 'op' && /^(=|<>|<|>|<=|>=)$/.test(peek().v)) {
        var op = next().v;
        left = { k: 'bin', op: op, l: left, r: parseConcat() };
      }
      return left;
    }
    function parseConcat() {
      var left = parseAdd();
      while (peek() && peek().t === 'op' && peek().v === '&') {
        next(); left = { k: 'bin', op: '&', l: left, r: parseAdd() };
      }
      return left;
    }
    function parseAdd() {
      var left = parseMul();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        var op = next().v; left = { k: 'bin', op: op, l: left, r: parseMul() };
      }
      return left;
    }
    function parseMul() {
      var left = parsePow();
      while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
        var op = next().v; left = { k: 'bin', op: op, l: left, r: parsePow() };
      }
      return left;
    }
    function parsePow() {
      var left = parseUnary();
      while (peek() && peek().t === 'op' && peek().v === '^') {
        next(); left = { k: 'bin', op: '^', l: left, r: parseUnary() };
      }
      return left;
    }
    function parseUnary() {
      if (peek() && peek().t === 'op' && (peek().v === '-' || peek().v === '+')) {
        var op = next().v;
        return { k: 'un', op: op, e: parseUnary() };
      }
      return parsePostfix();
    }
    function parsePostfix() {
      var e = parsePrimary();
      while (peek() && peek().t === 'op' && peek().v === '%') { next(); e = { k: 'pct', e: e }; }
      return e;
    }
    function parsePrimary() {
      var t = next();
      if (!t) throw new Error('unexpected end');
      switch (t.t) {
        case 'num': return { k: 'lit', v: t.v };
        case 'str': return { k: 'lit', v: t.v };
        case 'bool': return { k: 'lit', v: t.v };
        case 'err': return { k: 'lit', v: err(t.v) };
        case 'ref': return { k: 'ref', sheet: t.sheet, a: t.a };
        case 'range': return { k: 'range', sheet: t.sheet, a: t.a, b: t.b };
        case 'name': return { k: 'name', v: t.v };
        case '(': {
          var e = parseExpr(); expect(')'); return e;
        }
        case '{': { // 配列定数 {1,2;3,4}
          var rows = [[]];
          while (peek() && peek().t !== '}') {
            if (peek().t === ',') { next(); continue; }
            if (peek().t === 'op' && peek().v === ';') { next(); rows.push([]); continue; }
            rows[rows.length - 1].push(parseExpr());
          }
          expect('}');
          return { k: 'arr', rows: rows };
        }
        case 'func': {
          expect('(');
          var args = [];
          if (peek() && peek().t !== ')') {
            for (;;) {
              if (peek() && peek().t === ',') { args.push(null); next(); continue; }
              args.push(parseExpr());
              if (peek() && peek().t === ',') { next(); continue; }
              break;
            }
          }
          expect(')');
          return { k: 'call', name: t.v, args: args };
        }
      }
      throw new Error('unexpected token');
    }

    var ast = parseExpr();
    if (p < toks.length) throw new Error('trailing tokens');
    return ast;
  }

  /* =========================================================
     値ヘルパ
     ========================================================= */
  function toNum(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    var s = String(v).trim().replace(/,/g, '');
    if (s === '') return 0;
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return parseFloat(s);
    var pi = U.parseInput(s);
    if (typeof pi.v === 'number') return pi.v;
    return err(ERR.VALUE);
  }
  function toStr(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return U.generalFormat(v);
    return String(v);
  }
  function toBool(v) {
    if (isErr(v)) return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v === null || v === undefined || v === '') return false;
    var s = String(v).toUpperCase();
    if (s === 'TRUE') return true;
    if (s === 'FALSE') return false;
    var n = toNum(v);
    if (isErr(n)) return err(ERR.VALUE);
    return n !== 0;
  }
  function flatten(args) {
    var out = [];
    (function walk(a) {
      for (var i = 0; i < a.length; i++) {
        var v = a[i];
        if (Array.isArray(v)) walk(v);
        else out.push(v);
      }
    })(args);
    return out;
  }
  /* 数値だけ抜き出し(文字列は無視 = Excel の SUM 相当) */
  function numsOf(args) {
    var f = flatten(args), out = [];
    for (var i = 0; i < f.length; i++) {
      var v = f[i];
      if (isErr(v)) return v;
      if (typeof v === 'number') out.push(v);
      else if (typeof v === 'boolean') { /* 範囲内の論理値は無視 */ }
      else if (typeof v === 'string' && v !== '') {
        var n = parseFloat(v.replace(/,/g, ''));
        if (!isNaN(n) && /^[+-]?[\d,]*\.?\d+([eE][+-]?\d+)?$/.test(v.trim())) out.push(n);
      }
    }
    return out;
  }

  function compare(a, b) {
    if (a === null || a === undefined) a = (typeof b === 'number') ? 0 : '';
    if (b === null || b === undefined) b = (typeof a === 'number') ? 0 : '';
    if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : (a > b ? 1 : 0);
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      var an = typeof a === 'boolean' ? (a ? 1 : 0) : -1;
      var bn = typeof b === 'boolean' ? (b ? 1 : 0) : -1;
      if (typeof a !== 'boolean' || typeof b !== 'boolean') { /* 論理値は常に大きい */ }
      return an < bn ? -1 : (an > bn ? 1 : 0);
    }
    if (typeof a === 'number') return -1;
    if (typeof b === 'number') return 1;
    var as = String(a).toUpperCase(), bs = String(b).toUpperCase();
    return as < bs ? -1 : (as > bs ? 1 : 0);
  }

  /* 条件式 (">10" "りんご" "<>0") のマッチ判定 */
  function makeMatcher(cond) {
    if (isErr(cond)) return function () { return false; };
    if (typeof cond === 'number' || typeof cond === 'boolean') {
      return function (v) { return compare(v, cond) === 0; };
    }
    var s = String(cond);
    var m = /^(<=|>=|<>|=|<|>)(.*)$/.exec(s);
    var op = '=', operand = s;
    if (m) { op = m[1]; operand = m[2]; }
    var on = (operand !== '' && !isNaN(parseFloat(operand)) && /^[+-]?[\d.]+([eE][+-]?\d+)?$/.test(operand.trim()))
      ? parseFloat(operand) : operand;
    if (op === '=' || op === '<>') {
      var isWild = typeof on === 'string' && /[*?]/.test(on);
      var re = null;
      if (isWild) {
        re = new RegExp('^' + on.replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '[\\s\\S]*').replace(/\?/g, '[\\s\\S]') + '$', 'i');
      }
      return function (v) {
        var eq;
        if (re) eq = re.test(toStr(v));
        else if (typeof on === 'string' && typeof v === 'string') eq = v.toUpperCase() === on.toUpperCase();
        else eq = compare(v, on) === 0;
        return op === '=' ? eq : !eq;
      };
    }
    return function (v) {
      var c = compare(v, on);
      switch (op) {
        case '>': return c > 0; case '<': return c < 0;
        case '>=': return c >= 0; case '<=': return c <= 0;
      }
      return false;
    };
  }

  /* =========================================================
     関数ライブラリ
     ========================================================= */
  var FN = {};
  function def(name, minArgs, fn, meta) { FN[name] = fn; fn.min = minArgs; fn.meta = meta || ''; }

  /* --- 数学 --- */
  def('SUM', 1, function (a) { var n = numsOf(a); if (isErr(n)) return n; var s = 0; for (var i = 0; i < n.length; i++) s += n[i]; return s; }, 'SUM(数値1, ...) 合計');
  def('PRODUCT', 1, function (a) { var n = numsOf(a); if (isErr(n)) return n; if (!n.length) return 0; var s = 1; for (var i = 0; i < n.length; i++) s *= n[i]; return s; }, 'PRODUCT(数値1, ...) 積');
  def('AVERAGE', 1, function (a) { var n = numsOf(a); if (isErr(n)) return n; if (!n.length) return err(ERR.DIV0); var s = 0; for (var i = 0; i < n.length; i++) s += n[i]; return s / n.length; }, 'AVERAGE(数値1, ...) 平均');
  def('MAX', 1, function (a) { var n = numsOf(a); if (isErr(n)) return n; return n.length ? Math.max.apply(null, n) : 0; }, 'MAX(数値1, ...) 最大値');
  def('MIN', 1, function (a) { var n = numsOf(a); if (isErr(n)) return n; return n.length ? Math.min.apply(null, n) : 0; }, 'MIN(数値1, ...) 最小値');
  def('COUNT', 1, function (a) { var n = numsOf(a); if (isErr(n)) return n; return n.length; }, 'COUNT(値1, ...) 数値の個数');
  def('COUNTA', 1, function (a) { var f = flatten(a), c = 0; for (var i = 0; i < f.length; i++) if (f[i] !== null && f[i] !== undefined && f[i] !== '') c++; return c; }, 'COUNTA(値1, ...) 空白でないセルの個数');
  def('COUNTBLANK', 1, function (a) { var f = flatten(a), c = 0; for (var i = 0; i < f.length; i++) if (f[i] === null || f[i] === undefined || f[i] === '') c++; return c; }, 'COUNTBLANK(範囲) 空白セルの個数');
  def('ABS', 1, function (a) { var n = toNum(a[0]); return isErr(n) ? n : Math.abs(n); }, 'ABS(数値) 絶対値');
  def('SQRT', 1, function (a) { var n = toNum(a[0]); if (isErr(n)) return n; return n < 0 ? err(ERR.NUM) : Math.sqrt(n); }, 'SQRT(数値) 平方根');
  // BUG-002: 負数の分数乗などで Math.pow は NaN を返す。SQRT が #NUM! を返すのに
  // POWER だけ NaN を素通ししていたため、表示にも集計にも NaN が伝播していた
  def('POWER', 2, function (a) { var x = toNum(a[0]), y = toNum(a[1]); if (isErr(x)) return x; if (isErr(y)) return y; var r = Math.pow(x, y); return isFinite(r) ? r : err(ERR.NUM); }, 'POWER(数値, 指数) べき乗');
  def('MOD', 2, function (a) { var x = toNum(a[0]), y = toNum(a[1]); if (isErr(x)) return x; if (isErr(y)) return y; if (y === 0) return err(ERR.DIV0); return x - y * Math.floor(x / y); }, 'MOD(数値, 除数) 剰余');
  def('QUOTIENT', 2, function (a) { var x = toNum(a[0]), y = toNum(a[1]); if (y === 0) return err(ERR.DIV0); return Math.trunc(x / y); }, 'QUOTIENT(分子, 分母) 商の整数部');
  def('INT', 1, function (a) { var n = toNum(a[0]); return isErr(n) ? n : Math.floor(n); }, 'INT(数値) 切り捨て整数');
  def('TRUNC', 1, function (a) { var n = toNum(a[0]), d = a.length > 1 ? toNum(a[1]) : 0; var p = Math.pow(10, d); return Math.trunc(n * p) / p; }, 'TRUNC(数値, 桁数) 切り捨て');
  def('ROUND', 1, function (a) {
    var n = toNum(a[0]); if (isErr(n)) return n;
    var d = a.length > 1 ? toNum(a[1]) : 0; if (isErr(d)) return d;
    var p = Math.pow(10, d);
    return (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * p + 1e-9) / p;
  }, 'ROUND(数値, 桁数) 四捨五入');
  def('ROUNDUP', 1, function (a) { var n = toNum(a[0]), d = a.length > 1 ? toNum(a[1]) : 0, p = Math.pow(10, d); return (n < 0 ? -1 : 1) * Math.ceil(Math.abs(n) * p - 1e-9) / p; }, 'ROUNDUP(数値, 桁数) 切り上げ');
  def('ROUNDDOWN', 1, function (a) { var n = toNum(a[0]), d = a.length > 1 ? toNum(a[1]) : 0, p = Math.pow(10, d); return (n < 0 ? -1 : 1) * Math.floor(Math.abs(n) * p + 1e-9) / p; }, 'ROUNDDOWN(数値, 桁数) 切り捨て');
  def('CEILING', 1, function (a) { var n = toNum(a[0]), s = a.length > 1 ? toNum(a[1]) : 1; if (s === 0) return 0; return Math.ceil(n / s) * s; }, 'CEILING(数値, 基準値) 切り上げ');
  def('FLOOR', 1, function (a) { var n = toNum(a[0]), s = a.length > 1 ? toNum(a[1]) : 1; if (s === 0) return err(ERR.DIV0); return Math.floor(n / s) * s; }, 'FLOOR(数値, 基準値) 切り捨て');
  def('SIGN', 1, function (a) { var n = toNum(a[0]); return isErr(n) ? n : Math.sign(n); }, 'SIGN(数値) 符号');
  def('PI', 0, function () { return Math.PI; }, 'PI() 円周率');
  def('EXP', 1, function (a) { return Math.exp(toNum(a[0])); }, 'EXP(数値) e のべき乗');
  def('LN', 1, function (a) { var n = toNum(a[0]); return n <= 0 ? err(ERR.NUM) : Math.log(n); }, 'LN(数値) 自然対数');
  def('LOG10', 1, function (a) { var n = toNum(a[0]); return n <= 0 ? err(ERR.NUM) : Math.log10(n); }, 'LOG10(数値) 常用対数');
  def('LOG', 1, function (a) { var n = toNum(a[0]), b = a.length > 1 ? toNum(a[1]) : 10; return n <= 0 ? err(ERR.NUM) : Math.log(n) / Math.log(b); }, 'LOG(数値, 底) 対数');
  ['SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'SINH', 'COSH', 'TANH'].forEach(function (k) {
    def(k, 1, function (a) { var n = toNum(a[0]); if (isErr(n)) return n; var r = Math[k.toLowerCase()](n); return isNaN(r) ? err(ERR.NUM) : r; }, k + '(数値)');
  });
  def('ATAN2', 2, function (a) { return Math.atan2(toNum(a[1]), toNum(a[0])); }, 'ATAN2(x, y)');
  def('RADIANS', 1, function (a) { return toNum(a[0]) * Math.PI / 180; }, 'RADIANS(度) ラジアンに変換');
  def('DEGREES', 1, function (a) { return toNum(a[0]) * 180 / Math.PI; }, 'DEGREES(ラジアン) 度に変換');
  def('RAND', 0, function () { return Math.random(); }, 'RAND() 0以上1未満の乱数');
  def('RANDBETWEEN', 2, function (a) { var lo = toNum(a[0]), hi = toNum(a[1]); return Math.floor(Math.random() * (hi - lo + 1)) + lo; }, 'RANDBETWEEN(最小, 最大) 整数乱数');
  def('SUMPRODUCT', 1, function (a) {
    var arrs = a.map(function (x) { return flatten([x]); });
    var len = arrs[0].length, s = 0;
    for (var i = 0; i < len; i++) {
      var p = 1;
      for (var j = 0; j < arrs.length; j++) { var n = toNum(arrs[j][i]); if (isErr(n)) return n; p *= n; }
      s += p;
    }
    return s;
  }, 'SUMPRODUCT(配列1, ...) 積の合計');
  def('SUMSQ', 1, function (a) { var n = numsOf(a), s = 0; for (var i = 0; i < n.length; i++) s += n[i] * n[i]; return s; }, 'SUMSQ(数値1, ...) 平方和');

  /* --- 統計 --- */
  def('MEDIAN', 1, function (a) {
    var n = numsOf(a); if (isErr(n)) return n; if (!n.length) return err(ERR.NUM);
    n = n.slice().sort(function (x, y) { return x - y; });
    var m = n.length >> 1;
    return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
  }, 'MEDIAN(数値1, ...) 中央値');
  function variance(n, sample) {
    if (n.length < (sample ? 2 : 1)) return err(ERR.DIV0);
    var mean = 0, i; for (i = 0; i < n.length; i++) mean += n[i]; mean /= n.length;
    var s = 0; for (i = 0; i < n.length; i++) s += (n[i] - mean) * (n[i] - mean);
    return s / (n.length - (sample ? 1 : 0));
  }
  def('VAR', 1, function (a) { var n = numsOf(a); return isErr(n) ? n : variance(n, true); }, 'VAR(数値1, ...) 不偏分散');
  def('VARP', 1, function (a) { var n = numsOf(a); return isErr(n) ? n : variance(n, false); }, 'VARP(数値1, ...) 母分散');
  def('STDEV', 1, function (a) { var n = numsOf(a); if (isErr(n)) return n; var v = variance(n, true); return isErr(v) ? v : Math.sqrt(v); }, 'STDEV(数値1, ...) 標準偏差');
  def('STDEVP', 1, function (a) { var n = numsOf(a); if (isErr(n)) return n; var v = variance(n, false); return isErr(v) ? v : Math.sqrt(v); }, 'STDEVP(数値1, ...) 母標準偏差');
  def('LARGE', 2, function (a) { var n = numsOf([a[0]]); var k = toNum(a[1]); n.sort(function (x, y) { return y - x; }); return (k < 1 || k > n.length) ? err(ERR.NUM) : n[k - 1]; }, 'LARGE(範囲, k) k番目に大きい値');
  def('SMALL', 2, function (a) { var n = numsOf([a[0]]); var k = toNum(a[1]); n.sort(function (x, y) { return x - y; }); return (k < 1 || k > n.length) ? err(ERR.NUM) : n[k - 1]; }, 'SMALL(範囲, k) k番目に小さい値');
  def('RANK', 2, function (a) {
    var v = toNum(a[0]), n = numsOf([a[1]]), asc = a.length > 2 ? toBool(a[2]) : false;
    n.sort(function (x, y) { return asc ? x - y : y - x; });
    var idx = n.indexOf(v);
    return idx < 0 ? err(ERR.NA) : idx + 1;
  }, 'RANK(数値, 範囲, 順序) 順位');
  def('SUMIF', 2, function (a, raw) {
    var rng = flatten([a[0]]), match = makeMatcher(a[1]);
    var sumRng = a.length > 2 ? flatten([a[2]]) : rng, s = 0;
    for (var i = 0; i < rng.length; i++) if (match(rng[i])) { var n = toNum(sumRng[i]); if (typeof n === 'number') s += n; }
    return s;
  }, 'SUMIF(範囲, 条件, 合計範囲) 条件付き合計');
  def('COUNTIF', 2, function (a) {
    var rng = flatten([a[0]]), match = makeMatcher(a[1]), c = 0;
    for (var i = 0; i < rng.length; i++) if (match(rng[i])) c++;
    return c;
  }, 'COUNTIF(範囲, 条件) 条件付き個数');
  def('AVERAGEIF', 2, function (a) {
    var rng = flatten([a[0]]), match = makeMatcher(a[1]);
    var avgRng = a.length > 2 ? flatten([a[2]]) : rng, s = 0, c = 0;
    for (var i = 0; i < rng.length; i++) if (match(rng[i])) { var n = toNum(avgRng[i]); if (typeof n === 'number') { s += n; c++; } }
    return c ? s / c : err(ERR.DIV0);
  }, 'AVERAGEIF(範囲, 条件, 平均範囲) 条件付き平均');
  def('SUMIFS', 3, function (a) {
    var sumRng = flatten([a[0]]), s = 0;
    var pairs = [];
    for (var i = 1; i + 1 < a.length + 1 && i + 1 <= a.length; i += 2) pairs.push([flatten([a[i]]), makeMatcher(a[i + 1])]);
    // BUG-005: 条件範囲と合計範囲のサイズが違う場合、Excel は #VALUE! を返す。
    // 以前は短いほうに合わせて黙って集計しており、誤った合計に気づけなかった
    for (var q = 0; q < pairs.length; q++) if (pairs[q][0].length !== sumRng.length) return err(ERR.VALUE);
    for (var r = 0; r < sumRng.length; r++) {
      var ok = true;
      for (var p = 0; p < pairs.length; p++) if (!pairs[p][1](pairs[p][0][r])) { ok = false; break; }
      if (ok) { var n = toNum(sumRng[r]); if (typeof n === 'number') s += n; }
    }
    return s;
  }, 'SUMIFS(合計範囲, 範囲1, 条件1, ...) 複数条件の合計');
  def('COUNTIFS', 2, function (a) {
    var pairs = [];
    for (var i = 0; i + 1 < a.length; i += 2) pairs.push([flatten([a[i]]), makeMatcher(a[i + 1])]);
    var len = pairs[0][0].length, c = 0;
    for (var r = 0; r < len; r++) {
      var ok = true;
      for (var p = 0; p < pairs.length; p++) if (!pairs[p][1](pairs[p][0][r])) { ok = false; break; }
      if (ok) c++;
    }
    return c;
  }, 'COUNTIFS(範囲1, 条件1, ...) 複数条件の個数');

  /* --- 論理 --- */
  def('IF', 2, function (a) {
    var c = toBool(a[0]); if (isErr(c)) return c;
    if (c) return a.length > 1 ? val1(a[1]) : true;
    return a.length > 2 ? val1(a[2]) : false;
  }, 'IF(論理式, 真の場合, 偽の場合) 条件分岐');
  def('IFERROR', 2, function (a) { return isErr(a[0]) ? val1(a[1]) : val1(a[0]); }, 'IFERROR(値, エラーの場合の値)');
  def('IFNA', 2, function (a) { return (isErr(a[0]) && a[0].err === ERR.NA) ? val1(a[1]) : val1(a[0]); }, 'IFNA(値, N/Aの場合の値)');
  def('IFS', 2, function (a) {
    for (var i = 0; i + 1 < a.length; i += 2) { var c = toBool(a[i]); if (isErr(c)) return c; if (c) return val1(a[i + 1]); }
    return err(ERR.NA);
  }, 'IFS(条件1, 値1, ...) 複数条件分岐');
  def('AND', 1, function (a) {
    var f = flatten(a);
    for (var i = 0; i < f.length; i++) { if (f[i] === null || f[i] === '') continue; var b = toBool(f[i]); if (isErr(b)) return b; if (!b) return false; }
    return true;
  }, 'AND(論理式1, ...) すべて真なら TRUE');
  def('OR', 1, function (a) {
    var f = flatten(a);
    for (var i = 0; i < f.length; i++) { if (f[i] === null || f[i] === '') continue; var b = toBool(f[i]); if (isErr(b)) return b; if (b) return true; }
    return false;
  }, 'OR(論理式1, ...) いずれかが真なら TRUE');
  def('XOR', 1, function (a) { var f = flatten(a), c = 0; for (var i = 0; i < f.length; i++) if (toBool(f[i]) === true) c++; return c % 2 === 1; }, 'XOR(論理式1, ...)');
  def('NOT', 1, function (a) { var b = toBool(a[0]); return isErr(b) ? b : !b; }, 'NOT(論理式) 論理否定');
  def('TRUE', 0, function () { return true; }, 'TRUE()');
  def('FALSE', 0, function () { return false; }, 'FALSE()');
  def('ISBLANK', 1, function (a) { return a[0] === null || a[0] === undefined || a[0] === ''; }, 'ISBLANK(値) 空白か');
  def('ISNUMBER', 1, function (a) { return typeof a[0] === 'number'; }, 'ISNUMBER(値) 数値か');
  def('ISTEXT', 1, function (a) { return typeof a[0] === 'string' && a[0] !== ''; }, 'ISTEXT(値) 文字列か');
  def('ISERROR', 1, function (a) { return !!isErr(a[0]); }, 'ISERROR(値) エラーか');
  def('ISNA', 1, function (a) { return !!(isErr(a[0]) && a[0].err === ERR.NA); }, 'ISNA(値) #N/A か');
  def('ISEVEN', 1, function (a) { return Math.floor(toNum(a[0])) % 2 === 0; }, 'ISEVEN(数値)');
  def('ISODD', 1, function (a) { return Math.abs(Math.floor(toNum(a[0])) % 2) === 1; }, 'ISODD(数値)');
  def('NA', 0, function () { return err(ERR.NA); }, 'NA() #N/A を返す');

  /* --- 文字列 --- */
  function s1(v) { var s = toStr(v); return s; }
  def('CONCAT', 1, function (a) { var f = flatten(a), s = ''; for (var i = 0; i < f.length; i++) { var t = toStr(f[i]); if (isErr(t)) return t; s += t; } return s; }, 'CONCAT(文字列1, ...) 連結');
  FN.CONCATENATE = FN.CONCAT;
  def('TEXTJOIN', 3, function (a) {
    var sep = toStr(a[0]), skip = toBool(a[1]), f = flatten(a.slice(2)), out = [];
    for (var i = 0; i < f.length; i++) { if (skip && (f[i] === null || f[i] === '')) continue; out.push(toStr(f[i])); }
    return out.join(sep);
  }, 'TEXTJOIN(区切り, 空を無視, 文字列1, ...)');
  def('LEN', 1, function (a) { return s1(a[0]).length; }, 'LEN(文字列) 文字数');
  // BUG-006: 負の文字数・0以下の開始位置は Excel では #VALUE!。
  // 以前は Math.max(0, n) で丸めており、誤りが黙って空文字になっていた
  def('LEFT', 1, function (a) { var n = a.length > 1 ? toNum(a[1]) : 1; if (n < 0) return err(ERR.VALUE); return s1(a[0]).slice(0, n); }, 'LEFT(文字列, 文字数) 左から取得');
  def('RIGHT', 1, function (a) { var n = a.length > 1 ? toNum(a[1]) : 1; if (n < 0) return err(ERR.VALUE); return n === 0 ? '' : s1(a[0]).slice(-n); }, 'RIGHT(文字列, 文字数) 右から取得');
  def('MID', 3, function (a) { var st = toNum(a[1]), n = toNum(a[2]); if (st < 1 || n < 0) return err(ERR.VALUE); return s1(a[0]).substr(st - 1, n); }, 'MID(文字列, 開始位置, 文字数)');
  def('UPPER', 1, function (a) { return s1(a[0]).toUpperCase(); }, 'UPPER(文字列) 大文字に');
  def('LOWER', 1, function (a) { return s1(a[0]).toLowerCase(); }, 'LOWER(文字列) 小文字に');
  def('PROPER', 1, function (a) { return s1(a[0]).replace(/\w\S*/g, function (t) { return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); }); }, 'PROPER(文字列) 先頭を大文字に');
  def('TRIM', 1, function (a) { return s1(a[0]).replace(/\s+/g, ' ').trim(); }, 'TRIM(文字列) 余分な空白を削除');
  def('REPLACE', 4, function (a) { var s = s1(a[0]), st = toNum(a[1]) - 1, n = toNum(a[2]), t = s1(a[3]); return s.slice(0, st) + t + s.slice(st + n); }, 'REPLACE(文字列, 開始, 文字数, 置換文字列)');
  def('SUBSTITUTE', 3, function (a) {
    var s = s1(a[0]), o = s1(a[1]), nw = s1(a[2]);
    if (o === '') return s;
    if (a.length > 3) {
      var idx = toNum(a[3]), c = 0, p = -1;
      while ((p = s.indexOf(o, p + 1)) >= 0) { c++; if (c === idx) return s.slice(0, p) + nw + s.slice(p + o.length); }
      return s;
    }
    return s.split(o).join(nw);
  }, 'SUBSTITUTE(文字列, 検索文字列, 置換文字列, 出現回数)');
  def('FIND', 2, function (a) { var p = s1(a[1]).indexOf(s1(a[0]), (a.length > 2 ? toNum(a[2]) : 1) - 1); return p < 0 ? err(ERR.VALUE) : p + 1; }, 'FIND(検索文字列, 対象, 開始位置) 大小区別あり');
  def('SEARCH', 2, function (a) { var p = s1(a[1]).toUpperCase().indexOf(s1(a[0]).toUpperCase(), (a.length > 2 ? toNum(a[2]) : 1) - 1); return p < 0 ? err(ERR.VALUE) : p + 1; }, 'SEARCH(検索文字列, 対象, 開始位置) 大小区別なし');
  def('REPT', 2, function (a) { var n = toNum(a[1]); return n <= 0 ? '' : s1(a[0]).repeat(Math.min(n, 10000)); }, 'REPT(文字列, 回数) 繰り返し');
  def('TEXT', 2, function (a) { var v = a[0]; var f = s1(a[1]); return U.formatValue(typeof v === 'number' ? v : toNum(v), f); }, 'TEXT(値, 表示形式) 書式付き文字列に');
  def('VALUE', 1, function (a) { return toNum(a[0]); }, 'VALUE(文字列) 数値に変換');
  def('CHAR', 1, function (a) { return String.fromCharCode(toNum(a[0])); }, 'CHAR(数値) 文字コードから文字');
  def('CODE', 1, function (a) { var s = s1(a[0]); return s ? s.charCodeAt(0) : err(ERR.VALUE); }, 'CODE(文字列) 先頭文字のコード');
  def('EXACT', 2, function (a) { return s1(a[0]) === s1(a[1]); }, 'EXACT(文字列1, 文字列2) 完全一致か');

  /* --- 日付 --- */
  def('TODAY', 0, function () { return U.todaySerial(); }, 'TODAY() 今日の日付');
  def('NOW', 0, function () { return U.nowSerial(); }, 'NOW() 現在の日時');
  def('DATE', 3, function (a) { return U.dateToSerial(new Date(toNum(a[0]), toNum(a[1]) - 1, toNum(a[2]))); }, 'DATE(年, 月, 日)');
  def('TIME', 3, function (a) { return (toNum(a[0]) * 3600 + toNum(a[1]) * 60 + toNum(a[2])) / 86400; }, 'TIME(時, 分, 秒)');
  def('YEAR', 1, function (a) { return U.serialToDate(toNum(a[0])).getFullYear(); }, 'YEAR(シリアル値) 年');
  def('MONTH', 1, function (a) { return U.serialToDate(toNum(a[0])).getMonth() + 1; }, 'MONTH(シリアル値) 月');
  def('DAY', 1, function (a) { return U.serialToDate(toNum(a[0])).getDate(); }, 'DAY(シリアル値) 日');
  def('HOUR', 1, function (a) { return U.serialToDate(toNum(a[0])).getHours(); }, 'HOUR(シリアル値) 時');
  def('MINUTE', 1, function (a) { return U.serialToDate(toNum(a[0])).getMinutes(); }, 'MINUTE(シリアル値) 分');
  def('SECOND', 1, function (a) { return U.serialToDate(toNum(a[0])).getSeconds(); }, 'SECOND(シリアル値) 秒');
  def('WEEKDAY', 1, function (a) { var d = U.serialToDate(toNum(a[0])).getDay(); var t = a.length > 1 ? toNum(a[1]) : 1; return t === 2 ? (d === 0 ? 7 : d) : (t === 3 ? (d === 0 ? 6 : d - 1) : d + 1); }, 'WEEKDAY(シリアル値, 種類) 曜日番号');
  def('DAYS', 2, function (a) { return Math.round(toNum(a[0]) - toNum(a[1])); }, 'DAYS(終了日, 開始日) 日数差');
  // BUG-001: setMonth は存在しない日を翌月へ繰り上げてしまう(1/31 の1か月後が 3/3 になる)。
  // Excel は対象月の末日に丸めるので、日を1に落としてから月を動かし、最後に日を戻す
  def('EDATE', 2, function (a) {
    var d = U.serialToDate(toNum(a[0])), day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + toNum(a[1]));
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return Math.floor(U.dateToSerial(d));
  }, 'EDATE(開始日, 月数) 数か月後の日付');
  def('EOMONTH', 2, function (a) { var d = U.serialToDate(toNum(a[0])); d.setMonth(d.getMonth() + toNum(a[1]) + 1, 0); return Math.floor(U.dateToSerial(d)); }, 'EOMONTH(開始日, 月数) 月末日');
  def('DATEDIF', 3, function (a) {
    var d1 = U.serialToDate(toNum(a[0])), d2 = U.serialToDate(toNum(a[1])), u = s1(a[2]).toUpperCase();
    // BUG-004: 終了日が開始日より前なら Excel は #NUM!。
    // 以前は負の日数をそのまま返しており、引数の取り違えに気づけなかった
    if (toNum(a[1]) < toNum(a[0])) return err(ERR.NUM);
    if (u === 'D') return Math.round(toNum(a[1]) - toNum(a[0]));
    if (u === 'M') { var m = (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth(); if (d2.getDate() < d1.getDate()) m--; return m; }
    if (u === 'Y') { var y = d2.getFullYear() - d1.getFullYear(); var md = (d2.getMonth() - d1.getMonth()) || (d2.getDate() - d1.getDate()); if (md < 0) y--; return y; }
    return err(ERR.NUM);
  }, 'DATEDIF(開始日, 終了日, 単位) 期間');

  /* --- 検索 / 参照 --- */
  def('VLOOKUP', 3, function (a) {
    var key = val1(a[0]), tbl = a[1], colIdx = toNum(a[2]);
    var approx = a.length > 3 ? toBool(a[3]) : true;
    if (!Array.isArray(tbl)) return err(ERR.VALUE);
    var best = null;
    for (var i = 0; i < tbl.length; i++) {
      var row = tbl[i]; if (!Array.isArray(row)) continue;
      if (colIdx < 1 || colIdx > row.length) return err(ERR.REF);
      var c = compare(row[0], key);
      if (c === 0) return row[colIdx - 1];
      if (approx && c < 0) best = row[colIdx - 1];
    }
    return best === null ? err(ERR.NA) : best;
  }, 'VLOOKUP(検索値, 範囲, 列番号, 検索方法) 縦方向に検索');
  def('HLOOKUP', 3, function (a) {
    var key = val1(a[0]), tbl = a[1], rowIdx = toNum(a[2]);
    var approx = a.length > 3 ? toBool(a[3]) : true;
    if (!Array.isArray(tbl) || !Array.isArray(tbl[0])) return err(ERR.VALUE);
    var best = null;
    for (var j = 0; j < tbl[0].length; j++) {
      var c = compare(tbl[0][j], key);
      if (rowIdx < 1 || rowIdx > tbl.length) return err(ERR.REF);
      if (c === 0) return tbl[rowIdx - 1][j];
      if (approx && c < 0) best = tbl[rowIdx - 1][j];
    }
    return best === null ? err(ERR.NA) : best;
  }, 'HLOOKUP(検索値, 範囲, 行番号, 検索方法) 横方向に検索');
  def('MATCH', 2, function (a) {
    var key = val1(a[0]), rng = flatten([a[1]]);
    var type = a.length > 2 ? toNum(a[2]) : 1;
    if (type === 0) {
      var m = makeMatcher(typeof key === 'string' ? key : key);
      for (var i = 0; i < rng.length; i++) if (compare(rng[i], key) === 0 || (typeof key === 'string' && m(rng[i]))) return i + 1;
      return err(ERR.NA);
    }
    var best = -1;
    for (var j = 0; j < rng.length; j++) {
      var c = compare(rng[j], key);
      if (type === 1 && c <= 0) best = j;
      if (type === -1 && c >= 0) best = j;
    }
    return best < 0 ? err(ERR.NA) : best + 1;
  }, 'MATCH(検索値, 範囲, 照合の種類) 位置を返す');
  def('INDEX', 2, function (a) {
    var arr = a[0], r = toNum(a[1]), c = a.length > 2 ? toNum(a[2]) : 0;
    if (!Array.isArray(arr)) return (r === 1 || r === 0) ? arr : err(ERR.REF);
    if (arr.length && !Array.isArray(arr[0])) arr = [arr];
    if (arr.length === 1 && c === 0) { c = r; r = 1; }
    if (r < 1 || r > arr.length) return err(ERR.REF);
    var row = arr[r - 1];
    if (c === 0) return row.length === 1 ? row[0] : row;
    if (c < 1 || c > row.length) return err(ERR.REF);
    return row[c - 1];
  }, 'INDEX(範囲, 行番号, 列番号) 位置の値を返す');
  def('ROWS', 1, function (a) { var x = a[0]; return Array.isArray(x) ? (Array.isArray(x[0]) ? x.length : x.length) : 1; }, 'ROWS(範囲) 行数');
  def('COLUMNS', 1, function (a) { var x = a[0]; return Array.isArray(x) && Array.isArray(x[0]) ? x[0].length : 1; }, 'COLUMNS(範囲) 列数');
  def('CHOOSE', 2, function (a) { var i = toNum(a[0]); return (i < 1 || i >= a.length) ? err(ERR.VALUE) : val1(a[i]); }, 'CHOOSE(番号, 値1, ...) 番号で選択');

  /* --- 財務 --- */
  def('PMT', 3, function (a) {
    var r = toNum(a[0]), n = toNum(a[1]), pv = toNum(a[2]), fv = a.length > 3 ? toNum(a[3]) : 0;
    if (r === 0) return -(pv + fv) / n;
    return -(pv * Math.pow(1 + r, n) + fv) * r / (Math.pow(1 + r, n) - 1);
  }, 'PMT(利率, 期間, 現在価値, 将来価値) 定期支払額');
  def('FV', 3, function (a) {
    var r = toNum(a[0]), n = toNum(a[1]), pmt = toNum(a[2]), pv = a.length > 3 ? toNum(a[3]) : 0;
    if (r === 0) return -(pv + pmt * n);
    return -(pv * Math.pow(1 + r, n) + pmt * (Math.pow(1 + r, n) - 1) / r);
  }, 'FV(利率, 期間, 定期支払額, 現在価値) 将来価値');
  def('PV', 3, function (a) {
    var r = toNum(a[0]), n = toNum(a[1]), pmt = toNum(a[2]), fv = a.length > 3 ? toNum(a[3]) : 0;
    if (r === 0) return -(fv + pmt * n);
    return -(fv + pmt * (Math.pow(1 + r, n) - 1) / r) / Math.pow(1 + r, n);
  }, 'PV(利率, 期間, 定期支払額, 将来価値) 現在価値');

  function val1(v) { return Array.isArray(v) ? (Array.isArray(v[0]) ? v[0][0] : v[0]) : v; }

  var FUNC_LIST = Object.keys(FN).sort();

  /* =========================================================
     評価器
     ctx = {
       getValue(sheetName|null, r, c) -> 値,
       sheetName : 現在のシート名
     }
     ========================================================= */
  function evaluate(ast, ctx) {
    return ev(ast, ctx);
  }

  function ev(node, ctx) {
    switch (node.k) {
      case 'lit': return node.v;
      case 'name': {
        var up = node.v.toUpperCase();
        if (up === 'TRUE') return true;
        if (up === 'FALSE') return false;
        return err(ERR.NAME);
      }
      case 'ref': {
        var a = U.parseA1(node.a);
        if (!a) return err(ERR.REF);
        return ctx.getValue(node.sheet, a.r, a.c);
      }
      case 'range': {
        var p1 = U.parseA1(node.a), p2 = U.parseA1(node.b);
        if (!p1 || !p2) return err(ERR.REF);
        var r1 = Math.min(p1.r, p2.r), r2 = Math.max(p1.r, p2.r);
        var c1 = Math.min(p1.c, p2.c), c2 = Math.max(p1.c, p2.c);
        var out = [];
        for (var r = r1; r <= r2; r++) {
          var row = [];
          for (var c = c1; c <= c2; c++) row.push(ctx.getValue(node.sheet, r, c));
          out.push(row);
        }
        return out;
      }
      case 'arr': {
        return node.rows.map(function (row) { return row.map(function (e) { return ev(e, ctx); }); });
      }
      case 'un': {
        var v = ev(node.e, ctx);
        var n = toNum(val1(v));
        if (isErr(n)) return n;
        return node.op === '-' ? -n : n;
      }
      case 'pct': {
        var pv = toNum(val1(ev(node.e, ctx)));
        return isErr(pv) ? pv : pv / 100;
      }
      case 'bin': {
        var l = ev(node.l, ctx), r2v = ev(node.r, ctx);
        return binop(node.op, l, r2v);
      }
      case 'call': {
        var fn = FN[node.name];
        if (!fn) return err(ERR.NAME);
        var args = [];
        for (var i = 0; i < node.args.length; i++) {
          args.push(node.args[i] === null ? null : ev(node.args[i], ctx));
        }
        // 引数中のエラーを伝播 (IFERROR / ISERROR 系は除く)
        if (!/^(IFERROR|IFNA|ISERROR|ISNA|ISBLANK|ISNUMBER|ISTEXT|NA)$/.test(node.name)) {
          for (var j = 0; j < args.length; j++) if (isErr(args[j])) return args[j];
        }
        if (args.length < (fn.min || 0)) return err(ERR.VALUE);
        try {
          var res = fn(args);
          return res === undefined ? err(ERR.VALUE) : res;
        } catch (e) { return err(ERR.VALUE); }
      }
    }
    return err(ERR.VALUE);
  }

  function binop(op, l, r) {
    l = val1(l); r = val1(r);
    if (isErr(l)) return l;
    if (isErr(r)) return r;
    if (op === '&') {
      var ls = toStr(l), rs = toStr(r);
      if (isErr(ls)) return ls; if (isErr(rs)) return rs;
      return ls + rs;
    }
    if (/^(=|<>|<|>|<=|>=)$/.test(op)) {
      var c = compare(l, r);
      switch (op) {
        case '=': return c === 0; case '<>': return c !== 0;
        case '<': return c < 0; case '>': return c > 0;
        case '<=': return c <= 0; case '>=': return c >= 0;
      }
    }
    var a = toNum(l), b = toNum(r);
    if (isErr(a)) return a; if (isErr(b)) return b;
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? err(ERR.DIV0) : a / b;
      case '^': { var v = Math.pow(a, b); return isNaN(v) ? err(ERR.NUM) : v; }
    }
    return err(ERR.VALUE);
  }

  /* 数式内の参照を行列オフセットでずらす (オートフィル / コピー貼り付け用) */
  function shiftFormula(src, dr, dc) {
    if (dr === 0 && dc === 0) return src;
    var out = '', i = 0;
    while (i < src.length) {
      var ch = src.charAt(i);
      if (ch === '"') {
        var j = i + 1;
        while (j < src.length) { if (src.charAt(j) === '"') { if (src.charAt(j + 1) === '"') { j += 2; continue; } break; } j++; }
        out += src.slice(i, j + 1); i = j + 1; continue;
      }
      var rest = src.slice(i);
      // 関数名は飛ばす
      var fm = /^[A-Za-z_][A-Za-z0-9_.]*\s*\(/.exec(rest);
      if (fm) { out += fm[0]; i += fm[0].length; continue; }
      var sm = /^(?:'([^']+)'|([A-Za-z_぀-ヿ一-龯][A-Za-z0-9_.぀-ヿ一-龯]*))!/.exec(rest);
      var pre = '';
      if (sm) { pre = sm[0]; rest = rest.slice(sm[0].length); }
      var rm = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})/.exec(rest);
      if (rm && !/[A-Za-z0-9_.]/.test(src.charAt(i - 1) || '')) {
        var colAbs = rm[1] === '$', rowAbs = rm[3] === '$';
        var c = U.colIndex(rm[2]) + (colAbs ? 0 : dc);
        var r = parseInt(rm[4], 10) - 1 + (rowAbs ? 0 : dr);
        if (c < 0 || r < 0) { out += pre + '#REF!'; }
        else out += pre + (colAbs ? '$' : '') + U.colName(c) + (rowAbs ? '$' : '') + (r + 1);
        i += pre.length + rm[0].length;
        continue;
      }
      if (pre) { out += pre; i += pre.length; continue; }
      out += ch; i++;
    }
    return out;
  }

  return {
    parse: parse, evaluate: evaluate, err: err, isErr: isErr, ERR: ERR,
    toNum: toNum, toStr: toStr, toBool: toBool, compare: compare,
    FN: FN, FUNC_LIST: FUNC_LIST, shiftFormula: shiftFormula, flatten: flatten
  };
})();
