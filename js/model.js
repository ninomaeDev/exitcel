/* ===== Exitcel : model.js =====
   ブック / シート / セル のデータモデル、再計算エンジン、Undo スタック
*/
var M = (function () {

  var DEFAULT_ROWS = 300, DEFAULT_COLS = 40;
  var DEF_ROW_H = 22, DEF_COL_W = 88;

  /* ---------- Style ---------- */
  /* style = {b,i,u,st, fs, ff, fc, bg, ha, va, wrap, nf, bd:{t,b,l,r}} */
  function styleKey(s) { return JSON.stringify(s || {}); }
  function cloneStyle(s) {
    if (!s) return null;
    var o = {};
    for (var k in s) if (s.hasOwnProperty(k)) {
      o[k] = (k === 'bd' && s[k]) ? JSON.parse(JSON.stringify(s[k])) : s[k];
    }
    return o;
  }
  function isEmptyStyle(s) {
    if (!s) return true;
    for (var k in s) if (s.hasOwnProperty(k) && s[k] !== null && s[k] !== undefined && s[k] !== false && s[k] !== '') {
      if (k === 'bd') { for (var q in s.bd) if (s.bd[q]) return false; continue; }
      return false;
    }
    return true;
  }

  /* ---------- Sheet ---------- */
  function Sheet(name) {
    this.name = name;
    this.cells = {};          // "r:c" -> {v,f,s,cv}
    this.colW = {};           // c -> px
    this.rowH = {};           // r -> px
    this.merges = [];         // {r1,c1,r2,c2}
    this.objects = [];        // 画像/図形/グラフ/テキストボックス
    this.freeze = null;       // {r,c}
    this.rows = DEFAULT_ROWS;
    this.cols = DEFAULT_COLS;
    this.scroll = { x: 0, y: 0 };
    this.sel = { r1: 0, c1: 0, r2: 0, c2: 0, ar: 0, ac: 0 };
  }
  Sheet.prototype.key = function (r, c) { return r + ':' + c; };
  Sheet.prototype.get = function (r, c) { return this.cells[r + ':' + c] || null; };
  Sheet.prototype.ensure = function (r, c) {
    var k = r + ':' + c, x = this.cells[k];
    if (!x) { x = { v: null, f: null, s: null, cv: null }; this.cells[k] = x; }
    return x;
  };
  Sheet.prototype.remove = function (r, c) { delete this.cells[r + ':' + c]; };
  Sheet.prototype.colWidth = function (c) { return this.colW[c] || DEF_COL_W; };
  Sheet.prototype.rowHeight = function (r) { return this.rowH[r] || DEF_ROW_H; };
  Sheet.prototype.setValue = function (r, c, raw, keepStyleFmt) {
    var p = U.parseInput(raw, this.isTextFmt(r, c));
    var cell = this.ensure(r, c);
    cell.f = p.f || null;
    cell.v = p.f ? null : p.v;
    cell.cv = null;
    if (p.numFmt && !keepStyleFmt) {
      cell.s = cell.s || {};
      if (!cell.s.nf || cell.s.nf === 'General') cell.s.nf = p.numFmt;
    }
    if (cell.v === null && !cell.f && isEmptyStyle(cell.s)) this.remove(r, c);
    this.growTo(r, c);
  };
  Sheet.prototype.isTextFmt = function (r, c) {
    var x = this.get(r, c);
    return !!(x && x.s && x.s.nf === '@');
  };
  Sheet.prototype.growTo = function (r, c) {
    if (r + 5 >= this.rows) this.rows = r + 60;
    if (c + 3 >= this.cols) this.cols = c + 12;
  };
  /* 表示用の値 (数式なら計算結果) */
  Sheet.prototype.displayValue = function (r, c) {
    var x = this.get(r, c);
    if (!x) return null;
    if (x.f) return x.cv;
    return x.v;
  };
  Sheet.prototype.styleOf = function (r, c) {
    var x = this.get(r, c);
    return x && x.s ? x.s : null;
  };
  /* 入力バー用文字列 */
  Sheet.prototype.editText = function (r, c) {
    var x = this.get(r, c);
    if (!x) return '';
    if (x.f) return '=' + x.f;
    if (x.v === null || x.v === undefined) return '';
    if (typeof x.v === 'boolean') return x.v ? 'TRUE' : 'FALSE';
    if (typeof x.v === 'number') {
      var nf = x.s && x.s.nf;
      if (nf && U.isDateFmt(nf)) return U.formatValue(x.v, nf);
      return U.generalFormat(x.v);
    }
    return String(x.v);
  };
  Sheet.prototype.mergeAt = function (r, c) {
    for (var i = 0; i < this.merges.length; i++) {
      var m = this.merges[i];
      if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m;
    }
    return null;
  };
  Sheet.prototype.usedRange = function () {
    var r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    for (var k in this.cells) {
      var p = k.split(':'), r = +p[0], c = +p[1];
      var x = this.cells[k];
      if (x.v === null && !x.f && isEmptyStyle(x.s)) continue;
      if (r < r1) r1 = r; if (r > r2) r2 = r;
      if (c < c1) c1 = c; if (c > c2) c2 = c;
    }
    for (var i = 0; i < this.objects.length; i++) {
      var o = this.objects[i];
      // オブジェクトは行列に影響しないが最低限の範囲は確保
    }
    if (r2 < 0) return { r1: 0, c1: 0, r2: 0, c2: 0, empty: true };
    return { r1: r1, c1: c1, r2: r2, c2: c2, empty: false };
  };

  /* ---------- Workbook ---------- */
  function Workbook(name) {
    this.name = name || '新しいブック';
    this.sheets = [new Sheet('Sheet1')];
    this.active = 0;
    this.nextSheetNo = 2;
  }
  Workbook.prototype.sheet = function () { return this.sheets[this.active]; };
  Workbook.prototype.byName = function (n) {
    if (!n) return null;
    var lower = String(n).toLowerCase();
    for (var i = 0; i < this.sheets.length; i++) if (this.sheets[i].name.toLowerCase() === lower) return this.sheets[i];
    return null;
  };
  Workbook.prototype.addSheet = function (name) {
    if (!name) { do { name = 'Sheet' + (this.nextSheetNo++); } while (this.byName(name)); }
    var s = new Sheet(name);
    this.sheets.push(s);
    return s;
  };
  Workbook.prototype.uniqueName = function (base) {
    var n = base, i = 2;
    while (this.byName(n)) n = base + '(' + (i++) + ')';
    return n;
  };

  /* =========================================================
     再計算
     ========================================================= */
  var astCache = {};
  function getAst(src) {
    if (astCache.hasOwnProperty(src)) return astCache[src];
    var a;
    try { a = F.parse(src); } catch (e) { a = null; }
    if (Object.keys(astCache).length > 4000) astCache = {};
    astCache[src] = a;
    return a;
  }

  function recalc(wb) {
    var visiting = {};
    var done = {};

    function valueOf(sheet, r, c) {
      var cell = sheet.get(r, c);
      if (!cell) return null;
      if (!cell.f) return cell.v;
      var id = sheet.name + '!' + r + ':' + c;
      if (done[id]) return cell.cv;
      if (visiting[id]) { cell.cv = F.err(F.ERR.CIRC); return cell.cv; }
      visiting[id] = true;
      var ast = getAst(cell.f);
      if (!ast) { cell.cv = F.err(F.ERR.NAME); }
      else {
        var ctx = {
          getValue: function (sheetName, rr, cc) {
            var sh = sheetName ? wb.byName(sheetName) : sheet;
            if (!sh) return F.err(F.ERR.REF);
            if (rr < 0 || cc < 0) return F.err(F.ERR.REF);
            return valueOf(sh, rr, cc);
          }
        };
        var v;
        try { v = F.evaluate(ast, ctx); } catch (e) { v = F.err(F.ERR.VALUE); }
        if (Array.isArray(v)) v = Array.isArray(v[0]) ? v[0][0] : v[0];
        if (v === undefined) v = null;
        cell.cv = v;
      }
      delete visiting[id];
      done[id] = true;
      return cell.cv;
    }

    for (var si = 0; si < wb.sheets.length; si++) {
      var sh = wb.sheets[si];
      for (var k in sh.cells) {
        var cell = sh.cells[k];
        if (!cell.f) continue;
        var p = k.split(':');
        valueOf(sh, +p[0], +p[1]);
      }
    }
    // グラフの再描画要求
    for (si = 0; si < wb.sheets.length; si++) {
      var s2 = wb.sheets[si];
      for (var oi = 0; oi < s2.objects.length; oi++) if (s2.objects[oi].type === 'chart') s2.objects[oi].dirty = true;
    }
  }

  /* =========================================================
     行 / 列 の挿入・削除
     ========================================================= */
  function shiftRefsForInsert(wb, sheetName, isRow, at, count) {
    for (var si = 0; si < wb.sheets.length; si++) {
      var sh = wb.sheets[si];
      for (var k in sh.cells) {
        var cell = sh.cells[k];
        if (!cell.f) continue;
        cell.f = adjustFormula(cell.f, sheetName, sh.name, isRow, at, count);
      }
    }
  }
  function adjustFormula(src, targetSheet, ownSheet, isRow, at, count) {
    var out = '', i = 0;
    while (i < src.length) {
      var ch = src.charAt(i);
      if (ch === '"') {
        var j = i + 1;
        while (j < src.length) { if (src.charAt(j) === '"') { if (src.charAt(j + 1) === '"') { j += 2; continue; } break; } j++; }
        out += src.slice(i, j + 1); i = j + 1; continue;
      }
      var rest = src.slice(i);
      var fm = /^[A-Za-z_][A-Za-z0-9_.]*\s*\(/.exec(rest);
      if (fm) { out += fm[0]; i += fm[0].length; continue; }
      var sm = /^(?:'([^']+)'|([A-Za-z_぀-ヿ一-龯][A-Za-z0-9_.぀-ヿ一-龯]*))!/.exec(rest);
      var pre = '', refSheet = ownSheet;
      if (sm) { pre = sm[0]; refSheet = sm[1] || sm[2]; rest = rest.slice(sm[0].length); }
      var rm = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]{1,7})/.exec(rest);
      if (rm) {
        var c = U.colIndex(rm[2]), r = parseInt(rm[4], 10) - 1;
        if (refSheet.toLowerCase() === targetSheet.toLowerCase()) {
          if (isRow) { if (r >= at) r += count; }
          else { if (c >= at) c += count; }
        }
        if (r < 0 || c < 0) out += pre + '#REF!';
        else out += pre + rm[1] + U.colName(c) + rm[3] + (r + 1);
        i += pre.length + rm[0].length; continue;
      }
      if (pre) { out += pre; i += pre.length; continue; }
      out += ch; i++;
    }
    return out;
  }

  function insertRows(wb, sh, at, count) {
    var nc = {};
    for (var k in sh.cells) {
      var p = k.split(':'), r = +p[0], c = +p[1];
      nc[((r >= at ? r + count : r)) + ':' + c] = sh.cells[k];
    }
    sh.cells = nc;
    var nh = {};
    for (var rk in sh.rowH) { var rr = +rk; nh[rr >= at ? rr + count : rr] = sh.rowH[rk]; }
    sh.rowH = nh;
    sh.merges.forEach(function (m) {
      if (m.r1 >= at) { m.r1 += count; m.r2 += count; }
      else if (m.r2 >= at) m.r2 += count;
    });
    sh.rows += count;
    shiftRefsForInsert(wb, sh.name, true, at, count);
  }
  function insertCols(wb, sh, at, count) {
    var nc = {};
    for (var k in sh.cells) {
      var p = k.split(':'), r = +p[0], c = +p[1];
      nc[r + ':' + (c >= at ? c + count : c)] = sh.cells[k];
    }
    sh.cells = nc;
    var nw = {};
    for (var ck in sh.colW) { var cc = +ck; nw[cc >= at ? cc + count : cc] = sh.colW[ck]; }
    sh.colW = nw;
    sh.merges.forEach(function (m) {
      if (m.c1 >= at) { m.c1 += count; m.c2 += count; }
      else if (m.c2 >= at) m.c2 += count;
    });
    sh.cols += count;
    shiftRefsForInsert(wb, sh.name, false, at, count);
  }
  function deleteRows(wb, sh, at, count) {
    var nc = {};
    for (var k in sh.cells) {
      var p = k.split(':'), r = +p[0], c = +p[1];
      if (r >= at && r < at + count) continue;
      nc[(r >= at + count ? r - count : r) + ':' + c] = sh.cells[k];
    }
    sh.cells = nc;
    var nh = {};
    for (var rk in sh.rowH) {
      var rr = +rk;
      if (rr >= at && rr < at + count) continue;
      nh[rr >= at + count ? rr - count : rr] = sh.rowH[rk];
    }
    sh.rowH = nh;
    sh.merges = sh.merges.filter(function (m) { return !(m.r1 >= at && m.r2 < at + count); });
    sh.merges.forEach(function (m) {
      if (m.r1 >= at + count) { m.r1 -= count; m.r2 -= count; }
      else if (m.r2 >= at) m.r2 = Math.max(m.r1, m.r2 - count);
    });
    shiftRefsForInsert(wb, sh.name, true, at, -count);
  }
  function deleteCols(wb, sh, at, count) {
    var nc = {};
    for (var k in sh.cells) {
      var p = k.split(':'), r = +p[0], c = +p[1];
      if (c >= at && c < at + count) continue;
      nc[r + ':' + (c >= at + count ? c - count : c)] = sh.cells[k];
    }
    sh.cells = nc;
    var nw = {};
    for (var ck in sh.colW) {
      var cc = +ck;
      if (cc >= at && cc < at + count) continue;
      nw[cc >= at + count ? cc - count : cc] = sh.colW[ck];
    }
    sh.colW = nw;
    sh.merges = sh.merges.filter(function (m) { return !(m.c1 >= at && m.c2 < at + count); });
    sh.merges.forEach(function (m) {
      if (m.c1 >= at + count) { m.c1 -= count; m.c2 -= count; }
      else if (m.c2 >= at) m.c2 = Math.max(m.c1, m.c2 - count);
    });
    shiftRefsForInsert(wb, sh.name, false, at, -count);
  }

  /* =========================================================
     シリアライズ (.exl / JSON)
     ========================================================= */
  function toJSON(wb) {
    return {
      app: 'Exitcel', version: 1, name: wb.name, active: wb.active,
      sheets: wb.sheets.map(function (s) {
        var cells = {};
        for (var k in s.cells) {
          var x = s.cells[k];
          if (x.v === null && !x.f && isEmptyStyle(x.s)) continue;
          var o = {};
          if (x.v !== null && x.v !== undefined) o.v = x.v;
          if (x.f) o.f = x.f;
          if (!isEmptyStyle(x.s)) o.s = x.s;
          cells[k] = o;
        }
        return {
          name: s.name, cells: cells, colW: s.colW, rowH: s.rowH,
          merges: s.merges, objects: s.objects, freeze: s.freeze,
          rows: s.rows, cols: s.cols
        };
      })
    };
  }
  function fromJSON(j) {
    var wb = new Workbook(j.name || 'ブック');
    wb.sheets = [];
    (j.sheets || []).forEach(function (sj) {
      // BUG-003: 同名シートを含むファイルをそのまま読み込むと、シート間参照が
      // 意図しないシートを指す。UI からの名前変更やシートのコピーは uniqueName() を
      // 通しているので、読み込み経路でも同じ保証を掛ける
      var s = new Sheet(wb.uniqueName(sj.name || 'Sheet'));
      for (var k in (sj.cells || {})) {
        var o = sj.cells[k];
        s.cells[k] = { v: o.v === undefined ? null : o.v, f: o.f || null, s: o.s || null, cv: null };
      }
      s.colW = sj.colW || {}; s.rowH = sj.rowH || {};
      s.merges = sj.merges || []; s.objects = sj.objects || [];
      s.freeze = sj.freeze || null;
      s.rows = Math.max(sj.rows || DEFAULT_ROWS, DEFAULT_ROWS);
      s.cols = Math.max(sj.cols || DEFAULT_COLS, DEFAULT_COLS);
      s.objects.forEach(function (o) { if (o.type === 'chart') o.dirty = true; });
      wb.sheets.push(s);
    });
    if (!wb.sheets.length) wb.sheets.push(new Sheet('Sheet1'));
    wb.active = Math.min(j.active || 0, wb.sheets.length - 1);
    return wb;
  }

  /* =========================================================
     Undo / Redo (スナップショット方式)
     ========================================================= */
  function snapshot(wb) {
    return {
      name: wb.name, active: wb.active, nextSheetNo: wb.nextSheetNo,
      sheets: wb.sheets.map(function (s) {
        var cells = {};
        for (var k in s.cells) {
          var x = s.cells[k];
          cells[k] = { v: x.v, f: x.f, s: cloneStyle(x.s), cv: x.cv };
        }
        var colW = {}, rowH = {}, kk;
        for (kk in s.colW) colW[kk] = s.colW[kk];
        for (kk in s.rowH) rowH[kk] = s.rowH[kk];
        return {
          name: s.name, cells: cells, colW: colW, rowH: rowH,
          merges: s.merges.map(function (m) { return { r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 }; }),
          // オブジェクトは src(dataURL) を参照共有したまま浅くコピー
          objects: s.objects.map(function (o) { var n = {}; for (var q in o) n[q] = o[q]; return n; }),
          freeze: s.freeze ? { r: s.freeze.r, c: s.freeze.c } : null,
          rows: s.rows, cols: s.cols,
          sel: { r1: s.sel.r1, c1: s.sel.c1, r2: s.sel.r2, c2: s.sel.c2, ar: s.sel.ar, ac: s.sel.ac }
        };
      })
    };
  }
  function restore(wb, snap) {
    wb.name = snap.name; wb.nextSheetNo = snap.nextSheetNo;
    wb.sheets = snap.sheets.map(function (ss) {
      var s = new Sheet(ss.name);
      for (var k in ss.cells) {
        var x = ss.cells[k];
        s.cells[k] = { v: x.v, f: x.f, s: cloneStyle(x.s), cv: x.cv };
      }
      var kk;
      for (kk in ss.colW) s.colW[kk] = ss.colW[kk];
      for (kk in ss.rowH) s.rowH[kk] = ss.rowH[kk];
      s.merges = ss.merges.map(function (m) { return { r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 }; });
      s.objects = ss.objects.map(function (o) { var n = {}; for (var q in o) n[q] = o[q]; if (n.type === 'chart') n.dirty = true; return n; });
      s.freeze = ss.freeze ? { r: ss.freeze.r, c: ss.freeze.c } : null;
      s.rows = ss.rows; s.cols = ss.cols;
      s.sel = { r1: ss.sel.r1, c1: ss.sel.c1, r2: ss.sel.r2, c2: ss.sel.c2, ar: ss.sel.ar, ac: ss.sel.ac };
      return s;
    });
    wb.active = Math.min(snap.active, wb.sheets.length - 1);
  }

  function History(limit) {
    this.undoStack = []; this.redoStack = []; this.limit = limit || 60;
  }
  History.prototype.push = function (snap) {
    this.undoStack.push(snap);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  };
  History.prototype.canUndo = function () { return this.undoStack.length > 0; };
  History.prototype.canRedo = function () { return this.redoStack.length > 0; };

  return {
    Sheet: Sheet, Workbook: Workbook, History: History,
    DEF_ROW_H: DEF_ROW_H, DEF_COL_W: DEF_COL_W,
    recalc: recalc, cloneStyle: cloneStyle, isEmptyStyle: isEmptyStyle,
    insertRows: insertRows, insertCols: insertCols,
    deleteRows: deleteRows, deleteCols: deleteCols,
    toJSON: toJSON, fromJSON: fromJSON,
    snapshot: snapshot, restore: restore
  };
})();
