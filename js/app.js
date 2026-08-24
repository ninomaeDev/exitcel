/* ===== Exitcel : app.js =====
   アプリ全体の制御 : リボン / ダイアログ / ファイル入出力 / シートタブ
*/
var App = (function () {

  var wb = new M.Workbook('新しいブック');
  var hist = new M.History(60);
  var zoomLevel = 1;
  var dirty = false;
  var showFormula = false;
  var painterStyle = null;
  var lastFind = { r: 0, c: 0 };
  var pendingChart = null;
  var autosaveTimer = null;

  var api = {
    wb: wb, zoom: 1, showFormula: false
  };

  function $(id) { return document.getElementById(id); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* =========================================================
     起動
     ========================================================= */
  function init() {
    Grid.init();
    bindRibbon();
    bindFormulaBar();
    bindDialogs();
    bindSheetTabs();
    bindMisc();
    restoreAutosave();
    renderSheetTabs();
    recalcAndRefresh();
    onSelectionChanged();
    Grid.focusGrid();
  }

  /* =========================================================
     基本操作
     ========================================================= */
  function snap() { hist.push(M.snapshot(wb)); markDirty(); }
  function markDirty() {
    dirty = true;
    $('saveState').textContent = '編集中';
    scheduleAutosave();
  }
  function undo() {
    if (!hist.canUndo()) { toast('元に戻す操作はありません'); return; }
    hist.redoStack.push(M.snapshot(wb));
    M.restore(wb, hist.undoStack.pop());
    api.wb = wb;
    Grid.invalidateObjects();
    renderSheetTabs();
    recalcAndRefresh();
    status('元に戻しました');
  }
  function redo() {
    if (!hist.canRedo()) { toast('やり直す操作はありません'); return; }
    hist.undoStack.push(M.snapshot(wb));
    M.restore(wb, hist.redoStack.pop());
    api.wb = wb;
    Grid.invalidateObjects();
    renderSheetTabs();
    recalcAndRefresh();
    status('やり直しました');
  }
  function refresh() { Grid.render(); onSelectionChanged(); markDirty(); }
  function recalcAndRefresh() {
    M.recalc(wb);
    Grid.render();
    onSelectionChanged();
  }

  function status(t) { $('stMode').textContent = t; }
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 2200);
  }

  function setZoom(z) {
    zoomLevel = U.clamp(z, 0.25, 4);
    api.zoom = zoomLevel;
    $('zoomLabel').textContent = Math.round(zoomLevel * 100) + '%';
    $('stZoom').textContent = Math.round(zoomLevel * 100) + '%';
    Grid.render();
  }

  /* =========================================================
     選択が変わったとき
     ========================================================= */
  function onSelectionChanged() {
    var s = wb.sheet(), n = Grid.sel();
    $('nameBox').value = U.rangeA1(n.r1, n.c1, n.r2, n.c2);
    if (!Grid.isEditing()) $('formulaInput').value = s.editText(n.ar, n.ac);

    var st = s.styleOf(n.ar, n.ac) || {};
    tgl('btnBold', !!st.b); tgl('btnItalic', !!st.i);
    tgl('btnUnderline', !!st.u); tgl('btnStrike', !!st.st);
    tgl('btnWrap', !!st.wrap);
    tgl('btnAlignLeft', st.ha === 'left'); tgl('btnAlignCenter', st.ha === 'center');
    tgl('btnAlignRight', st.ha === 'right');
    tgl('btnAlignTop', st.va === 'top'); tgl('btnAlignMiddle', st.va === 'middle');
    tgl('btnAlignBottom', st.va === 'bottom' || !st.va);
    tgl('btnMerge', !!s.mergeAt(n.ar, n.ac));
    $('fontSize').value = String(st.fs || 11);
    $('fontFamily').value = st.ff || 'Yu Gothic UI';
    $('numFmt').value = st.nf || 'General';
    if (st.fc) $('fontColor').value = st.fc;
    if (st.bg) $('fillColor').value = st.bg;

    // 統計
    var cnt = 0, num = 0, sum = 0, mn = Infinity, mx = -Infinity;
    for (var r = n.r1; r <= n.r2; r++) for (var c = n.c1; c <= n.c2; c++) {
      var cell = s.get(r, c);
      if (!cell) continue;
      var v = cell.f ? cell.cv : cell.v;
      if (v === null || v === undefined || v === '') continue;
      cnt++;
      if (typeof v === 'number') { num++; sum += v; mn = Math.min(mn, v); mx = Math.max(mx, v); }
    }
    var txt = '';
    if (cnt > 0) {
      txt = 'データの個数: ' + cnt;
      if (num > 0) {
        var r3 = function (v) { return U.formatValue(Math.round(v * 1000) / 1000, '#,##0.###'); };
        txt += '　平均: ' + r3(sum / num) + '　最小: ' + r3(mn) +
          '　最大: ' + r3(mx) + '　合計: ' + r3(sum);
      }
    }
    $('stStats').textContent = txt;
  }
  function tgl(id, on) { $(id).classList.toggle('on', !!on); }

  function onObjectSelected(o) {
    if (!o) return;
    status(o.type === 'chart' ? 'グラフを選択中 (ダブルクリックで範囲を編集)' :
      o.type === 'image' ? '画像を選択中 (ハンドルでサイズ変更 / Delete で削除)' :
      'オブジェクトを選択中');
  }

  /* =========================================================
     書式の適用
     ========================================================= */
  function eachSelected(fn) {
    var s = wb.sheet(), n = Grid.expandSelByMerge(Grid.sel());
    for (var r = n.r1; r <= n.r2; r++) for (var c = n.c1; c <= n.c2; c++) fn(s.ensure(r, c), r, c, s);
  }
  function applyStyle(patch) {
    snap();
    eachSelected(function (cell) {
      cell.s = cell.s || {};
      for (var k in patch) {
        if (patch[k] === null) delete cell.s[k];
        else cell.s[k] = patch[k];
      }
      if (M.isEmptyStyle(cell.s)) cell.s = null;
    });
    cleanup();
    Grid.render(); onSelectionChanged();
  }
  function cleanup() {
    var s = wb.sheet();
    for (var k in s.cells) {
      var x = s.cells[k];
      if (x.v === null && !x.f && M.isEmptyStyle(x.s)) delete s.cells[k];
    }
  }
  function toggleStyle(key) {
    var s = wb.sheet(), n = Grid.sel();
    var cur = s.styleOf(n.ar, n.ac);
    var on = !(cur && cur[key]);
    var p = {}; p[key] = on ? true : null;
    applyStyle(p);
  }

  /* =========================================================
     リボン
     ========================================================= */
  function bindRibbon() {
    $$('.rtab').forEach(function (b) {
      b.addEventListener('click', function () { openTab(b.dataset.tab); });
    });

    // ファイル
    $('btnNew').addEventListener('click', newBook);
    $('btnOpen').addEventListener('click', openFile);
    $('btnSave').addEventListener('click', saveDefault);
    $('btnExport').addEventListener('click', openExport);
    $('btnPrint').addEventListener('click', function () { window.print(); });
    $('btnAbout').addEventListener('click', function () { openModal('dlgAbout'); });

    // 操作
    $('btnUndo').addEventListener('click', undo);
    $('btnRedo').addEventListener('click', redo);

    // クリップボード
    $('btnCopy').addEventListener('click', function () { document.execCommand('copy'); });
    $('btnCut').addEventListener('click', function () { document.execCommand('cut'); });
    $('btnPaste').addEventListener('click', function () {
      toast('貼り付けは Ctrl+V を使ってください (ブラウザの制限)');
    });
    $('btnFormatPainter').addEventListener('click', function () {
      var s = wb.sheet(), n = Grid.sel();
      if (painterStyle) { painterStyle = null; tgl('btnFormatPainter', false); status('準備完了'); return; }
      painterStyle = M.cloneStyle(s.styleOf(n.ar, n.ac)) || {};
      tgl('btnFormatPainter', true);
      status('書式のコピー: 貼り付け先を選択してください');
    });

    // フォント
    $('fontFamily').addEventListener('change', function () { applyStyle({ ff: this.value }); Grid.focusGrid(); });
    $('fontSize').addEventListener('change', function () { applyStyle({ fs: parseFloat(this.value) }); Grid.focusGrid(); });
    $('btnFontUp').addEventListener('click', function () { stepFont(1); });
    $('btnFontDown').addEventListener('click', function () { stepFont(-1); });
    $('btnBold').addEventListener('click', function () { toggleStyle('b'); });
    $('btnItalic').addEventListener('click', function () { toggleStyle('i'); });
    $('btnUnderline').addEventListener('click', function () { toggleStyle('u'); });
    $('btnStrike').addEventListener('click', function () { toggleStyle('st'); });
    $('fontColor').addEventListener('input', function () { applyStyle({ fc: this.value }); });
    $('fillColor').addEventListener('input', function () { applyStyle({ bg: this.value }); });
    $('btnNoFill').addEventListener('click', function () { applyStyle({ bg: null }); });
    $('btnBorder').addEventListener('click', function () { openModal('dlgBorder'); });

    // 配置
    $('btnAlignLeft').addEventListener('click', function () { applyStyle({ ha: 'left' }); });
    $('btnAlignCenter').addEventListener('click', function () { applyStyle({ ha: 'center' }); });
    $('btnAlignRight').addEventListener('click', function () { applyStyle({ ha: 'right' }); });
    $('btnAlignTop').addEventListener('click', function () { applyStyle({ va: 'top' }); });
    $('btnAlignMiddle').addEventListener('click', function () { applyStyle({ va: 'middle' }); });
    $('btnAlignBottom').addEventListener('click', function () { applyStyle({ va: 'bottom' }); });
    $('btnWrap').addEventListener('click', function () {
      var s = wb.sheet(), n = Grid.sel();
      var cur = s.styleOf(n.ar, n.ac);
      applyStyle({ wrap: (cur && cur.wrap) ? null : true });
    });
    $('btnMerge').addEventListener('click', toggleMerge);

    // 数値
    $('numFmt').addEventListener('change', function () {
      applyStyle({ nf: this.value === 'General' ? null : this.value });
      Grid.focusGrid();
    });
    $('btnComma').addEventListener('click', function () { applyStyle({ nf: '#,##0' }); });
    $('btnPercent').addEventListener('click', function () { applyStyle({ nf: '0%' }); });
    $('btnDecInc').addEventListener('click', function () { stepDecimals(1); });
    $('btnDecDec').addEventListener('click', function () { stepDecimals(-1); });

    // セル
    $('btnInsRow').addEventListener('click', function () { insertRC(true); });
    $('btnInsCol').addEventListener('click', function () { insertRC(false); });
    $('btnDelRow').addEventListener('click', function () { deleteRC(true); });
    $('btnDelCol').addEventListener('click', function () { deleteRC(false); });
    $('btnClearAll').addEventListener('click', function () { snap(); Grid.clearRange(Grid.sel(), 'all'); recalcAndRefresh(); });
    $('btnClearFormat').addEventListener('click', function () { snap(); Grid.clearRange(Grid.sel(), 'formats'); recalcAndRefresh(); });

    // 編集
    $('btnAutoSum').addEventListener('click', autoSum);
    $('btnFind').addEventListener('click', openFind);

    // 挿入
    $('btnInsImage').addEventListener('click', function () { $('imgPicker').click(); });
    $('btnInsTextbox').addEventListener('click', function () {
      Grid.addObject(OBJ.makeTextbox(null, null));
      toast('テキストボックスを挿入しました (クリックで文字を編集)');
    });
    $$('.big.shape').forEach(function (b) {
      b.addEventListener('click', function () {
        Grid.addObject(OBJ.makeShape(b.dataset.shape, null, null));
      });
    });
    $$('.big.chart').forEach(function (b) {
      b.addEventListener('click', function () { openChartDialog(b.dataset.chart); });
    });
    $('btnInsComment').addEventListener('click', function () {
      var n = Grid.sel();
      Grid.addObject(OBJ.makeNote(null, null, U.a1(n.ar, n.ac) + ' のメモ'));
    });

    // 数式
    $('btnFx').addEventListener('click', openFx);
    $('quickFuncs').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) insertFunction(b.dataset.fn);
    });
    $('btnRecalc').addEventListener('click', function () { recalcAndRefresh(); toast('再計算しました'); });
    $('btnShowFormula').addEventListener('click', function () {
      showFormula = !showFormula; api.showFormula = showFormula;
      tgl('btnShowFormula', showFormula);
      Grid.render();
    });

    // データ
    $('btnSortAsc').addEventListener('click', function () { sortSelection(true); });
    $('btnSortDesc').addEventListener('click', function () { sortSelection(false); });
    $('btnDedup').addEventListener('click', dedupSelection);
    $('btnTranspose').addEventListener('click', transposeSelection);
    $('btnImportCsv').addEventListener('click', function () { openFile('.csv,.tsv,.txt'); });

    // 表示
    $('chkGridlines').addEventListener('change', function () { document.body.classList.toggle('no-gridlines', !this.checked); });
    $('chkHeaders').addEventListener('change', function () { document.body.classList.toggle('no-headers', !this.checked); Grid.render(); });
    $('chkFormulaBar').addEventListener('change', function () { $('formulaBar').classList.toggle('hidden', !this.checked); Grid.render(); });
    $('btnFreeze').addEventListener('click', toggleFreeze);
    $('btnZoomIn').addEventListener('click', function () { setZoom(zoomLevel + 0.1); });
    $('btnZoomOut').addEventListener('click', function () { setZoom(zoomLevel - 0.1); });
    $('btnZoomReset').addEventListener('click', function () { setZoom(1); });
  }

  function openTab(name) {
    $$('.rtab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $$('.rpanel').forEach(function (p) { p.classList.toggle('active', p.dataset.tab === name); });
    Grid.render();
  }

  function stepFont(d) {
    var s = wb.sheet(), n = Grid.sel();
    var cur = (s.styleOf(n.ar, n.ac) || {}).fs || 11;
    var sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
    var i = sizes.indexOf(cur);
    if (i < 0) i = sizes.reduce(function (best, v, idx) { return Math.abs(v - cur) < Math.abs(sizes[best] - cur) ? idx : best; }, 0);
    applyStyle({ fs: sizes[U.clamp(i + d, 0, sizes.length - 1)] });
  }
  function stepDecimals(d) {
    var s = wb.sheet(), n = Grid.sel();
    var cur = (s.styleOf(n.ar, n.ac) || {}).nf || '0';
    if (cur === 'General' || cur === '@') cur = '0';
    var m = /^(.*?)(\.(0+))?([%]?)$/.exec(cur);
    var head = m[1] || '0', decs = m[3] ? m[3].length : 0, tail = m[4] || '';
    decs = U.clamp(decs + d, 0, 10);
    applyStyle({ nf: head + (decs ? '.' + '0'.repeat(decs) : '') + tail });
  }

  function toggleMerge() {
    var s = wb.sheet(), n = Grid.sel();
    snap();
    var existing = s.mergeAt(n.ar, n.ac);
    if (existing) {
      s.merges = s.merges.filter(function (m) { return m !== existing; });
      toast('セルの結合を解除しました');
    } else {
      if (n.r1 === n.r2 && n.c1 === n.c2) { toast('2つ以上のセルを選択してください'); return; }
      s.merges = s.merges.filter(function (m) {
        return !(m.r1 <= n.r2 && m.r2 >= n.r1 && m.c1 <= n.c2 && m.c2 >= n.c1);
      });
      s.merges.push({ r1: n.r1, c1: n.c1, r2: n.r2, c2: n.c2 });
      // 左上以外の値をクリア
      for (var r = n.r1; r <= n.r2; r++) for (var c = n.c1; c <= n.c2; c++) {
        if (r === n.r1 && c === n.c1) continue;
        var cell = s.get(r, c);
        if (cell) { cell.v = null; cell.f = null; cell.cv = null; }
      }
      var a = s.ensure(n.r1, n.c1);
      a.s = a.s || {};
      if (!a.s.ha) a.s.ha = 'center';
      if (!a.s.va) a.s.va = 'middle';
    }
    recalcAndRefresh();
  }

  function toggleFreeze() {
    var s = wb.sheet(), n = Grid.sel();
    snap();
    if (s.freeze) { s.freeze = null; tgl('btnFreeze', false); toast('固定を解除しました'); }
    else {
      s.freeze = { r: n.ar, c: n.ac };
      tgl('btnFreeze', true);
      toast(U.a1(n.ar, n.ac) + ' の左上でウィンドウ枠を固定しました (.xlsx にも保存されます)');
    }
    markDirty();
  }

  function insertRC(isRow) {
    var s = wb.sheet(), n = Grid.sel();
    snap();
    if (isRow) M.insertRows(wb, s, n.r1, n.r2 - n.r1 + 1);
    else M.insertCols(wb, s, n.c1, n.c2 - n.c1 + 1);
    recalcAndRefresh();
  }
  function deleteRC(isRow) {
    var s = wb.sheet(), n = Grid.sel();
    snap();
    if (isRow) M.deleteRows(wb, s, n.r1, n.r2 - n.r1 + 1);
    else M.deleteCols(wb, s, n.c1, n.c2 - n.c1 + 1);
    recalcAndRefresh();
  }

  function autoSum() {
    var s = wb.sheet(), n = Grid.sel();
    var r = n.ar, c = n.ac;
    // 上方向に連続する数値を探す
    var r0 = r - 1, cnt = 0;
    while (r0 >= 0) {
      var cell = s.get(r0, c);
      var v = cell ? (cell.f ? cell.cv : cell.v) : null;
      if (typeof v !== 'number') break;
      r0--; cnt++;
    }
    if (cnt > 0) {
      snap();
      s.setValue(r, c, '=SUM(' + U.a1(r0 + 1, c) + ':' + U.a1(r - 1, c) + ')');
      recalcAndRefresh();
      Grid.setSel(r, c, r, c, r, c);
      return;
    }
    // 左方向
    var c0 = c - 1, cnt2 = 0;
    while (c0 >= 0) {
      var cell2 = s.get(r, c0);
      var v2 = cell2 ? (cell2.f ? cell2.cv : cell2.v) : null;
      if (typeof v2 !== 'number') break;
      c0--; cnt2++;
    }
    if (cnt2 > 0) {
      snap();
      s.setValue(r, c, '=SUM(' + U.a1(r, c0 + 1) + ':' + U.a1(r, c - 1) + ')');
      recalcAndRefresh();
      return;
    }
    // 選択範囲の合計を下に
    if (n.r1 !== n.r2 || n.c1 !== n.c2) {
      snap();
      for (var cc = n.c1; cc <= n.c2; cc++) {
        s.setValue(n.r2 + 1, cc, '=SUM(' + U.a1(n.r1, cc) + ':' + U.a1(n.r2, cc) + ')');
      }
      recalcAndRefresh();
      return;
    }
    Grid.startEdit('=SUM(');
  }

  function insertFunction(name) {
    var fn = F.FN[name];
    var s = wb.sheet(), n = Grid.sel();
    var args = '';
    // 上/左に数値が続いていれば既定の範囲を提案
    if (/^(SUM|AVERAGE|COUNT|MAX|MIN|MEDIAN|PRODUCT)$/.test(name)) {
      var r0 = n.ar - 1, cnt = 0;
      while (r0 >= 0) {
        var cell = s.get(r0, n.ac);
        var v = cell ? (cell.f ? cell.cv : cell.v) : null;
        if (typeof v !== 'number') break;
        r0--; cnt++;
      }
      if (cnt > 0) args = U.a1(r0 + 1, n.ac) + ':' + U.a1(n.ar - 1, n.ac);
    }
    Grid.startEdit('=' + name + '(' + args + (args ? ')' : ''));
  }

  /* =========================================================
     並べ替え / データツール
     ========================================================= */
  function sortSelection(asc) {
    var s = wb.sheet(), n = Grid.sel();
    if (n.r1 === n.r2) { toast('2行以上を選択してください'); return; }
    snap();
    var keyCol = n.ac;
    var rows = [];
    for (var r = n.r1; r <= n.r2; r++) {
      var row = [];
      for (var c = n.c1; c <= n.c2; c++) {
        var cell = s.get(r, c);
        row.push(cell ? { v: cell.v, f: cell.f, s: cell.s, cv: cell.cv } : null);
      }
      var kc = s.get(r, keyCol);
      rows.push({ cells: row, key: kc ? (kc.f ? kc.cv : kc.v) : null });
    }
    rows.sort(function (a, b) {
      var ea = a.key === null || a.key === undefined || a.key === '';
      var eb = b.key === null || b.key === undefined || b.key === '';
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      var cmp = F.compare(a.key, b.key);
      return asc ? cmp : -cmp;
    });
    for (var i = 0; i < rows.length; i++) {
      for (var c2 = n.c1; c2 <= n.c2; c2++) {
        var src = rows[i].cells[c2 - n.c1];
        if (!src) { s.remove(n.r1 + i, c2); continue; }
        var dst = s.ensure(n.r1 + i, c2);
        dst.v = src.v; dst.f = src.f; dst.s = src.s; dst.cv = src.cv;
      }
    }
    recalcAndRefresh();
    toast((asc ? '昇順' : '降順') + 'に並べ替えました (' + U.colName(keyCol) + ' 列基準)');
  }

  function dedupSelection() {
    var s = wb.sheet(), n = Grid.sel();
    snap();
    var seen = {}, keep = [];
    for (var r = n.r1; r <= n.r2; r++) {
      var key = [];
      for (var c = n.c1; c <= n.c2; c++) {
        var cell = s.get(r, c);
        key.push(U.formatValue(cell ? (cell.f ? cell.cv : cell.v) : null, null));
      }
      var k = key.join('');
      if (seen[k]) continue;
      seen[k] = 1;
      var row = [];
      for (var c2 = n.c1; c2 <= n.c2; c2++) {
        var cl = s.get(r, c2);
        row.push(cl ? { v: cl.v, f: cl.f, s: cl.s, cv: cl.cv } : null);
      }
      keep.push(row);
    }
    var removed = (n.r2 - n.r1 + 1) - keep.length;
    for (var i = 0; i < (n.r2 - n.r1 + 1); i++) {
      for (var c3 = n.c1; c3 <= n.c2; c3++) {
        if (i < keep.length && keep[i][c3 - n.c1]) {
          var src = keep[i][c3 - n.c1];
          var dst = s.ensure(n.r1 + i, c3);
          dst.v = src.v; dst.f = src.f; dst.s = src.s; dst.cv = src.cv;
        } else s.remove(n.r1 + i, c3);
      }
    }
    recalcAndRefresh();
    toast(removed + ' 件の重複を削除しました');
  }

  function transposeSelection() {
    var s = wb.sheet(), n = Grid.sel();
    snap();
    var grid = [];
    for (var r = n.r1; r <= n.r2; r++) {
      var row = [];
      for (var c = n.c1; c <= n.c2; c++) {
        var cell = s.get(r, c);
        row.push(cell ? { v: cell.v, f: cell.f, s: M.cloneStyle(cell.s), cv: cell.cv } : null);
      }
      grid.push(row);
    }
    for (var r2 = n.r1; r2 <= n.r2; r2++) for (var c2 = n.c1; c2 <= n.c2; c2++) s.remove(r2, c2);
    for (var i = 0; i < grid.length; i++) {
      for (var j = 0; j < grid[i].length; j++) {
        var src = grid[i][j];
        if (!src) continue;
        var dst = s.ensure(n.r1 + j, n.c1 + i);
        dst.v = src.v; dst.f = src.f; dst.s = src.s; dst.cv = src.cv;
      }
    }
    recalcAndRefresh();
    toast('行と列を入れ替えました');
  }

  /* =========================================================
     数式バー
     ========================================================= */
  function bindFormulaBar() {
    var fi = $('formulaInput');
    fi.addEventListener('focus', function () {
      if (!Grid.isEditing()) {
        var n = Grid.sel();
        Grid.startEdit(wb.sheet().editText(n.ar, n.ac));
        fi.focus();
      }
    });
    fi.addEventListener('input', function () { Grid.editorValue(fi.value); });
    fi.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); Grid.editorValue(fi.value); Grid.commitEdit('down'); }
      else if (e.key === 'Escape') { e.preventDefault(); Grid.cancelEdit(); onSelectionChanged(); Grid.focusGrid(); }
      e.stopPropagation();
    });
    $('fxBtn').addEventListener('click', openFx);

    var nb = $('nameBox');
    nb.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') { e.stopPropagation(); return; }
      var rg = U.parseRange(nb.value);
      if (rg) {
        Grid.setSel(rg.r1, rg.c1, rg.r2, rg.c2, rg.r1, rg.c1);
        Grid.focusGrid();
      } else toast('セル参照として認識できません');
    });
  }

  /* =========================================================
     シートタブ
     ========================================================= */
  function bindSheetTabs() {
    $('btnAddSheet').addEventListener('click', function () {
      snap();
      wb.addSheet();
      wb.active = wb.sheets.length - 1;
      renderSheetTabs();
      Grid.invalidateObjects();
      recalcAndRefresh();
    });
    $('sheetTabs').addEventListener('contextmenu', function (e) {
      var t = e.target.closest('.stab');
      if (!t) return;
      e.preventDefault();
      showSheetMenu(e.clientX, e.clientY, +t.dataset.i);
    });
  }
  function renderSheetTabs() {
    var box = $('sheetTabs');
    box.innerHTML = '';
    wb.sheets.forEach(function (s, i) {
      var d = document.createElement('div');
      d.className = 'stab' + (i === wb.active ? ' active' : '');
      d.textContent = s.name;
      d.dataset.i = i;
      d.addEventListener('click', function () {
        if (wb.active === i) return;
        wb.active = i;
        Grid.invalidateObjects();
        renderSheetTabs();
        recalcAndRefresh();
      });
      d.addEventListener('dblclick', function () { renameSheet(i, d); });
      box.appendChild(d);
    });
    $('bookName').value = wb.name;
  }
  function renameSheet(i, el) {
    var input = document.createElement('input');
    input.value = wb.sheets[i].name;
    el.textContent = '';
    el.appendChild(input);
    input.focus(); input.select();
    function done(ok) {
      var v = input.value.trim();
      if (ok && v && v !== wb.sheets[i].name) {
        if (wb.byName(v)) toast('同じ名前のシートがあります');
        else { snap(); wb.sheets[i].name = v; }
      }
      renderSheetTabs();
    }
    input.addEventListener('blur', function () { done(true); });
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
  }

  /* =========================================================
     コンテキストメニュー
     ========================================================= */
  function menu(x, y, items) {
    var m = $('ctxMenu');
    m.innerHTML = '';
    items.forEach(function (it) {
      if (it === '-') { var sp = document.createElement('div'); sp.className = 'msep'; m.appendChild(sp); return; }
      var d = document.createElement('div');
      d.className = 'mi';
      d.innerHTML = '<span>' + it.label + '</span>' + (it.key ? '<span class="k">' + it.key + '</span>' : '');
      d.addEventListener('click', function () { closeCtx(); it.act(); });
      m.appendChild(d);
    });
    m.style.display = 'block';
    var w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(x, window.innerWidth - w - 8) + 'px';
    m.style.top = Math.min(y, window.innerHeight - h - 8) + 'px';
  }
  function closeCtx() { $('ctxMenu').style.display = 'none'; }

  function showCellMenu(x, y) {
    var s = wb.sheet(), n = Grid.sel();
    menu(x, y, [
      { label: '切り取り', key: 'Ctrl+X', act: function () { document.execCommand('cut'); } },
      { label: 'コピー', key: 'Ctrl+C', act: function () { document.execCommand('copy'); } },
      { label: '貼り付け', key: 'Ctrl+V', act: function () { toast('Ctrl+V で貼り付けてください'); } },
      '-',
      { label: '行を挿入', act: function () { insertRC(true); } },
      { label: '列を挿入', act: function () { insertRC(false); } },
      { label: '行を削除', act: function () { deleteRC(true); } },
      { label: '列を削除', act: function () { deleteRC(false); } },
      '-',
      { label: '数式と値をクリア', key: 'Delete', act: function () { snap(); Grid.clearRange(n, 'contents'); recalcAndRefresh(); } },
      { label: '書式をクリア', act: function () { snap(); Grid.clearRange(n, 'formats'); recalcAndRefresh(); } },
      '-',
      { label: s.mergeAt(n.ar, n.ac) ? 'セル結合を解除' : 'セルを結合して中央揃え', act: toggleMerge },
      { label: '罫線…', act: function () { openModal('dlgBorder'); } },
      { label: '列の幅を自動調整', act: function () { snap(); for (var c = n.c1; c <= n.c2; c++) Grid.autoFitCol(c); refresh(); } },
      { label: '行の高さを自動調整', act: function () { snap(); for (var r = n.r1; r <= n.r2; r++) Grid.autoFitRow(r); refresh(); } }
    ]);
  }
  function showObjectMenu(x, y, o) {
    if (!o) return;
    var s = wb.sheet();
    var items = [
      { label: '最前面へ移動', act: function () { snap(); s.objects = s.objects.filter(function (q) { return q !== o; }); s.objects.push(o); refresh(); } },
      { label: '最背面へ移動', act: function () { snap(); s.objects = s.objects.filter(function (q) { return q !== o; }); s.objects.unshift(o); refresh(); } },
      '-'
    ];
    if (o.type === 'chart') {
      items.push({ label: 'グラフの設定…', act: function () { openChartDialog(o.chart, o); } });
    }
    if (o.type === 'shape' || o.type === 'textbox' || o.type === 'note') {
      items.push({
        label: '文字色 / 背景色を変更', act: function () {
          var c = prompt('背景色を #rrggbb 形式で入力 (none で透明)', (o.st && (o.st.bg || o.st.fill)) || '#ffffff');
          if (c === null) return;
          snap();
          o.st = o.st || {};
          if (o.type === 'shape') o.st.fill = c; else o.st.bg = c;
          refresh();
        }
      });
    }
    if (o.type === 'image') {
      items.push({
        label: '元のサイズに戻す', act: function () {
          var img = new Image();
          img.onload = function () { snap(); o.w = img.naturalWidth; o.h = img.naturalHeight; refresh(); };
          img.src = o.src;
        }
      });
    }
    items.push('-', { label: '削除', key: 'Delete', act: function () { Grid.deleteSelectedObject(); } });
    menu(x, y, items);
  }
  function showSheetMenu(x, y, i) {
    menu(x, y, [
      { label: '名前の変更', act: function () { var el = document.querySelector('.stab[data-i="' + i + '"]'); if (el) renameSheet(i, el); } },
      { label: 'シートのコピー', act: function () {
          snap();
          var src = wb.sheets[i];
          var j = M.toJSON(wb).sheets[i];
          var copy = M.fromJSON({ sheets: [j] }).sheets[0];
          copy.name = wb.uniqueName(src.name + ' のコピー');
          wb.sheets.splice(i + 1, 0, copy);
          wb.active = i + 1;
          Grid.invalidateObjects();
          renderSheetTabs(); recalcAndRefresh();
        } },
      { label: '左へ移動', act: function () { if (i === 0) return; snap(); var t = wb.sheets.splice(i, 1)[0]; wb.sheets.splice(i - 1, 0, t); wb.active = i - 1; renderSheetTabs(); Grid.invalidateObjects(); recalcAndRefresh(); } },
      { label: '右へ移動', act: function () { if (i >= wb.sheets.length - 1) return; snap(); var t = wb.sheets.splice(i, 1)[0]; wb.sheets.splice(i + 1, 0, t); wb.active = i + 1; renderSheetTabs(); Grid.invalidateObjects(); recalcAndRefresh(); } },
      '-',
      { label: '削除', act: function () {
          if (wb.sheets.length === 1) { toast('最後のシートは削除できません'); return; }
          if (!confirm('シート「' + wb.sheets[i].name + '」を削除しますか?')) return;
          snap();
          wb.sheets.splice(i, 1);
          wb.active = Math.min(wb.active, wb.sheets.length - 1);
          Grid.invalidateObjects();
          renderSheetTabs(); recalcAndRefresh();
        } }
    ]);
  }

  /* =========================================================
     ダイアログ
     ========================================================= */
  function openModal(id) {
    $('modalBack').classList.add('on');
    $(id).classList.add('on');
    var inp = $(id).querySelector('input[type=text]');
    if (inp) setTimeout(function () { inp.focus(); inp.select(); }, 30);
  }
  function closeModals() {
    $('modalBack').classList.remove('on');
    $$('.modal').forEach(function (m) { m.classList.remove('on'); });
  }
  function bindDialogs() {
    $('modalBack').addEventListener('click', closeModals);
    $$('.modal [data-close]').forEach(function (b) { b.addEventListener('click', closeModals); });
    document.addEventListener('mousedown', function (e) {
      if (!e.target.closest('#ctxMenu')) closeCtx();
    });

    // エクスポート
    $('expFormat').addEventListener('change', updateExpHint);
    $('expGo').addEventListener('click', function () {
      var fmt = $('expFormat').value;
      var name = ($('expName').value || 'book1').replace(/[\\/:*?"<>|]/g, '_');
      closeModals();
      doExport(fmt, name);
    });

    // 罫線
    $$('#dlgBorder .brd-grid button').forEach(function (b) {
      b.addEventListener('click', function () { applyBorder(b.dataset.b); });
    });

    // 検索と置換
    $('findNext').addEventListener('click', function () { findNext(); });
    $('replOne').addEventListener('click', replaceOne);
    $('replAll').addEventListener('click', replaceAll);
    $('findText').addEventListener('keydown', function (e) { if (e.key === 'Enter') findNext(); e.stopPropagation(); });
    $('replText').addEventListener('keydown', function (e) { e.stopPropagation(); });

    // 関数の挿入
    $('fxSearch').addEventListener('input', renderFxList);
    $('fxSearch').addEventListener('keydown', function (e) { e.stopPropagation(); });
    $('fxGo').addEventListener('click', function () {
      var sel = document.querySelector('.fxitem.sel');
      if (!sel) return;
      closeModals();
      insertFunction(sel.dataset.fn);
    });

    // グラフ
    $('chGo').addEventListener('click', function () {
      var kind = pendingChart.kind;
      var opt = {
        title: $('chTitle').value,
        range: $('chRange').value,
        header: $('chHeader').checked,
        firstCol: $('chFirstCol').checked
      };
      closeModals();
      if (pendingChart.obj) {
        snap();
        var o = pendingChart.obj;
        o.title = opt.title; o.range = opt.range;
        o.header = opt.header; o.firstCol = opt.firstCol;
        o.dirty = true;
        refresh();
      } else {
        Grid.addObject(OBJ.makeChart(kind, null, null, opt));
      }
    });
  }

  function updateExpHint() {
    var f = $('expFormat').value;
    var hints = {
      exl: 'Exitcel 独自形式。画像・図形・グラフ・罫線・結合・数式をそのまま保存します。このアプリで開くならこれが最適です。',
      xlsx: 'Excel / LibreOffice / Google スプレッドシートで開けます。図形・グラフ・テキストボックスは画像として埋め込まれます。',
      csv: '現在のシートの値のみをカンマ区切りで書き出します (書式・数式・画像は含まれません)。',
      tsv: '現在のシートの値のみをタブ区切りで書き出します。',
      json: 'ブック全体を JSON 形式で書き出します (プログラムからの利用向け)。',
      html: 'ブラウザで表示できる Web ページとして書き出します。'
    };
    $('expHint').textContent = hints[f] || '';
  }

  function applyBorder(kind) {
    var s = wb.sheet(), n = Grid.expandSelByMerge(Grid.sel());
    var style = $('brdStyle').value, color = $('brdColor').value;
    var d = { s: style, c: color };
    var thick = { s: 'thick', c: color };
    snap();
    for (var r = n.r1; r <= n.r2; r++) {
      for (var c = n.c1; c <= n.c2; c++) {
        var cell = s.ensure(r, c);
        cell.s = cell.s || {};
        var bd = cell.s.bd || {};
        if (kind === 'none') bd = {};
        else if (kind === 'all') { bd.t = d; bd.b = d; bd.l = d; bd.r = d; }
        else if (kind === 'inner') {
          if (r > n.r1) bd.t = d;
          if (r < n.r2) bd.b = d;
          if (c > n.c1) bd.l = d;
          if (c < n.c2) bd.r = d;
        }
        else if (kind === 'outer' || kind === 'thickouter') {
          var dd = kind === 'thickouter' ? thick : d;
          if (r === n.r1) bd.t = dd;
          if (r === n.r2) bd.b = dd;
          if (c === n.c1) bd.l = dd;
          if (c === n.c2) bd.r = dd;
        }
        else if (kind === 'top' && r === n.r1) bd.t = d;
        else if (kind === 'bottom' && r === n.r2) bd.b = d;
        else if (kind === 'left' && c === n.c1) bd.l = d;
        else if (kind === 'right' && c === n.c2) bd.r = d;
        cell.s.bd = Object.keys(bd).length ? bd : null;
        if (!cell.s.bd) delete cell.s.bd;
        if (M.isEmptyStyle(cell.s)) cell.s = null;
      }
    }
    cleanup();
    Grid.render();
  }

  /* ---------- 検索と置換 ---------- */
  function openFind() { openModal('dlgFind'); $('findHint').textContent = ''; }
  function cellText(cell) {
    if (!cell) return '';
    var v = cell.f ? cell.cv : cell.v;
    return U.formatValue(v, cell.s && cell.s.nf);
  }
  function findNext() {
    var q = $('findText').value;
    if (!q) return;
    var cs = $('findCase').checked;
    var s = wb.sheet(), n = Grid.sel();
    var startR = n.ar, startC = n.ac;
    var total = s.rows * s.cols;
    var idx = startR * s.cols + startC;
    for (var i = 1; i <= total; i++) {
      var p = (idx + i) % total;
      var r = Math.floor(p / s.cols), c = p % s.cols;
      var t = cellText(s.get(r, c));
      var hay = cs ? t : t.toLowerCase();
      var nee = cs ? q : q.toLowerCase();
      if (t !== '' && hay.indexOf(nee) >= 0) {
        Grid.setSel(r, c, r, c, r, c);
        $('findHint').textContent = U.a1(r, c) + ' で見つかりました';
        return true;
      }
    }
    $('findHint').textContent = '見つかりませんでした';
    return false;
  }
  function replaceOne() {
    var q = $('findText').value, rep = $('replText').value;
    if (!q) return;
    var s = wb.sheet(), n = Grid.sel();
    var cell = s.get(n.ar, n.ac);
    var t = cellText(cell);
    var cs = $('findCase').checked;
    var hit = cs ? t.indexOf(q) >= 0 : t.toLowerCase().indexOf(q.toLowerCase()) >= 0;
    if (hit) {
      snap();
      var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? '' : 'i');
      s.setValue(n.ar, n.ac, t.replace(re, rep));
      recalcAndRefresh();
    }
    findNext();
  }
  function replaceAll() {
    var q = $('findText').value, rep = $('replText').value;
    if (!q) return;
    var cs = $('findCase').checked;
    var s = wb.sheet(), count = 0;
    snap();
    var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), cs ? 'g' : 'gi');
    for (var k in s.cells) {
      var cell = s.cells[k];
      if (cell.f) continue;
      var t = cellText(cell);
      if (!t) continue;
      if (!(cs ? t.indexOf(q) >= 0 : t.toLowerCase().indexOf(q.toLowerCase()) >= 0)) continue;
      var p = k.split(':');
      s.setValue(+p[0], +p[1], t.replace(re, rep));
      count++;
    }
    recalcAndRefresh();
    $('findHint').textContent = count + ' 件を置換しました';
  }

  /* ---------- 関数の挿入 ---------- */
  function openFx() { $('fxSearch').value = ''; renderFxList(); openModal('dlgFx'); }
  function renderFxList() {
    var q = ($('fxSearch').value || '').toUpperCase();
    var box = $('fxList');
    box.innerHTML = '';
    F.FUNC_LIST.filter(function (n) { return !q || n.indexOf(q) >= 0; }).forEach(function (name, i) {
      var d = document.createElement('div');
      d.className = 'fxitem' + (i === 0 ? ' sel' : '');
      d.textContent = name;
      d.dataset.fn = name;
      d.addEventListener('click', function () {
        $$('.fxitem').forEach(function (x) { x.classList.remove('sel'); });
        d.classList.add('sel');
        $('fxDesc').textContent = (F.FN[name] && F.FN[name].meta) || '';
      });
      d.addEventListener('dblclick', function () { closeModals(); insertFunction(name); });
      box.appendChild(d);
      if (i === 0) $('fxDesc').textContent = (F.FN[name] && F.FN[name].meta) || '';
    });
  }

  /* ---------- グラフ ---------- */
  function openChartDialog(kind, obj) {
    pendingChart = { kind: kind, obj: obj || null };
    var n = Grid.sel();
    if (obj) {
      $('chTitle').value = obj.title || '';
      $('chRange').value = obj.range || '';
      $('chHeader').checked = !!obj.header;
      $('chFirstCol').checked = !!obj.firstCol;
    } else {
      $('chTitle').value = 'グラフ タイトル';
      $('chRange').value = (n.r1 === n.r2 && n.c1 === n.c2)
        ? autoDetectRange() : U.rangeA1(n.r1, n.c1, n.r2, n.c2);
      $('chHeader').checked = true;
      $('chFirstCol').checked = true;
    }
    openModal('dlgChart');
  }
  function autoDetectRange() {
    var s = wb.sheet(), n = Grid.sel();
    var r = n.ar, c = n.ac;
    function filled(rr, cc) {
      var x = s.get(rr, cc);
      if (!x) return false;
      var v = x.f ? x.cv : x.v;
      return v !== null && v !== undefined && v !== '';
    }
    if (!filled(r, c)) { var u = s.usedRange(); return u.empty ? 'A1:B5' : U.rangeA1(u.r1, u.c1, u.r2, u.c2); }
    var r1 = r, c1 = c, r2 = r, c2 = c;
    while (r1 > 0 && filled(r1 - 1, c)) r1--;
    while (c1 > 0 && filled(r, c1 - 1)) c1--;
    while (filled(r2 + 1, c)) r2++;
    while (filled(r, c2 + 1)) c2++;
    // 矩形に広げる
    var grew = true, guard = 0;
    while (grew && guard++ < 50) {
      grew = false;
      var can = true, i;
      for (i = r1; i <= r2; i++) if (!filled(i, c2 + 1)) { can = false; break; }
      if (can) { c2++; grew = true; }
      can = true;
      for (i = c1; i <= c2; i++) if (!filled(r2 + 1, i)) { can = false; break; }
      if (can) { r2++; grew = true; }
    }
    return U.rangeA1(r1, c1, r2, c2);
  }

  /* =========================================================
     ファイル入出力
     ========================================================= */
  function newBook() {
    if (dirty && !confirm('保存していない変更があります。新規作成しますか?')) return;
    wb = new M.Workbook('新しいブック');
    api.wb = wb;
    hist = new M.History(60);
    Grid.invalidateObjects();
    renderSheetTabs();
    recalcAndRefresh();
    dirty = false;
    $('saveState').textContent = '未保存';
    try { localStorage.removeItem('exitcel.autosave'); } catch (e) {}
  }

  function openFile(accept) {
    var picker = $('filePicker');
    picker.accept = accept || '.exl,.xlsx,.xlsm,.csv,.tsv,.txt,.json';
    picker.value = '';
    picker.click();
  }

  function bindMisc() {
    $('filePicker').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) loadFile(f);
    });
    $('imgPicker').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      this.value = '';
      OBJ.loadImageFile(f).then(function (r) {
        Grid.addObject(OBJ.makeImage(r.src, null, null, r.w, r.h));
        toast('画像を挿入しました。ドラッグで移動、四隅でサイズ変更できます');
      });
    });
    $('bookName').addEventListener('change', function () { wb.name = this.value || 'ブック'; markDirty(); });
    $('bookName').addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') this.blur(); });

    // ドラッグ&ドロップ
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      if (/^image\//.test(f.type)) {
        OBJ.loadImageFile(f).then(function (r) {
          Grid.addObject(OBJ.makeImage(r.src, null, null, r.w, r.h));
        });
      } else loadFile(f);
    });

    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    // 書式のコピー貼り付け
    document.getElementById('gridScroll').addEventListener('mouseup', function () {
      if (!painterStyle) return;
      applyStyle(painterStyle);
      painterStyle = null;
      tgl('btnFormatPainter', false);
      status('準備完了');
    });
  }

  function loadFile(file) {
    var name = file.name || '';
    var ext = (name.split('.').pop() || '').toLowerCase();
    var fr = new FileReader();

    if (ext === 'xlsx' || ext === 'xlsm') {
      fr.onload = function () {
        IO.importXlsx(fr.result).then(function (nwb) {
          nwb.name = name.replace(/\.[^.]+$/, '');
          adoptWorkbook(nwb);
          toast('Excel ブックを読み込みました');
        }).catch(function (err) {
          console.error(err);
          alert('xlsx の読み込みに失敗しました:\n' + err.message);
        });
      };
      fr.readAsArrayBuffer(file);
      return;
    }

    fr.onload = function () {
      var text = fr.result;
      try {
        if (ext === 'exl' || ext === 'json') {
          var j = JSON.parse(text);
          var nwb = M.fromJSON(j);
          nwb.name = j.name || name.replace(/\.[^.]+$/, '');
          adoptWorkbook(nwb);
          toast('ブックを読み込みました');
          return;
        }
        // CSV / TSV
        var sep = ext === 'tsv' || text.indexOf('\t') >= 0 ? '\t' : ',';
        var rows = U.parseDelimited(text, sep);
        var nwb2 = new M.Workbook(name.replace(/\.[^.]+$/, ''));
        var sheet = nwb2.sheets[0];
        rows.forEach(function (row, r) {
          row.forEach(function (v, c) { if (v !== '') sheet.setValue(r, c, v); });
        });
        adoptWorkbook(nwb2);
        toast(rows.length + ' 行を読み込みました');
      } catch (err) {
        console.error(err);
        alert('読み込みに失敗しました:\n' + err.message);
      }
    };
    fr.readAsText(file, 'utf-8');
  }

  function adoptWorkbook(nwb) {
    wb = nwb; api.wb = wb;
    hist = new M.History(60);
    Grid.invalidateObjects();
    renderSheetTabs();
    recalcAndRefresh();
    Grid.setSel(0, 0, 0, 0, 0, 0);
    dirty = false;
    $('saveState').textContent = '読み込み済み';
  }

  function openExport() {
    $('expName').value = (wb.name || 'book1').replace(/[\\/:*?"<>|]/g, '_');
    updateExpHint();
    openModal('dlgExport');
  }

  async function saveBlob(blob, filename, ext, desc) {
    if (window.showSaveFilePicker) {
      try {
        var types = {};
        types['.' + ext] = [];
        var handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: desc || (ext.toUpperCase() + ' ファイル'), accept: mimeAccept(ext) }]
        });
        var w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
        // 失敗したら通常のダウンロードにフォールバック
      }
    }
    U.download(blob, filename);
    return true;
  }
  function mimeAccept(ext) {
    var m = {};
    var mime = {
      exl: 'application/json', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', html: 'text/html'
    }[ext] || 'application/octet-stream';
    m[mime] = ['.' + ext];
    return m;
  }

  async function doExport(fmt, base) {
    M.recalc(wb);
    try {
      if (fmt === 'exl' || fmt === 'json') {
        var j = JSON.stringify(M.toJSON(wb), null, fmt === 'json' ? 2 : 0);
        var ok = await saveBlob(new Blob([j], { type: 'application/json' }), base + '.' + fmt, fmt,
          fmt === 'exl' ? 'Exitcel ブック' : 'JSON データ');
        if (ok) afterSave(fmt);
        return;
      }
      if (fmt === 'xlsx') {
        status('xlsx を生成中…');
        var blob = await IO.exportXlsx(wb);
        var ok2 = await saveBlob(blob, base + '.xlsx', 'xlsx', 'Excel ブック');
        status('準備完了');
        if (ok2) afterSave('xlsx');
        return;
      }
      if (fmt === 'csv' || fmt === 'tsv') {
        var sep = fmt === 'csv' ? ',' : '\t';
        var txt = IO.sheetToDelimited(wb.sheet(), sep);
        // Excel で文字化けしないよう BOM を付与
        var blob2 = new Blob(['﻿' + txt], { type: fmt === 'csv' ? 'text/csv' : 'text/tab-separated-values' });
        var ok3 = await saveBlob(blob2, base + '.' + fmt, fmt);
        if (ok3) afterSave(fmt);
        return;
      }
      if (fmt === 'html') {
        var html = IO.sheetToHtml(wb);
        var ok4 = await saveBlob(new Blob([html], { type: 'text/html' }), base + '.html', 'html', 'Web ページ');
        if (ok4) afterSave('html');
        return;
      }
    } catch (e) {
      console.error(e);
      alert('エクスポートに失敗しました:\n' + e.message);
      status('準備完了');
    }
  }
  function afterSave(fmt) {
    dirty = false;
    $('saveState').textContent = '保存済み (' + fmt + ')';
    toast('.' + fmt + ' で書き出しました');
  }

  function saveDefault() {
    doExport('exl', (wb.name || 'book1').replace(/[\\/:*?"<>|]/g, '_'));
  }

  /* =========================================================
     自動保存 (localStorage)
     ========================================================= */
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(function () {
      try {
        var j = JSON.stringify(M.toJSON(wb));
        if (j.length < 4500000) localStorage.setItem('exitcel.autosave', j);
      } catch (e) { /* 容量超過などは無視 */ }
    }, 1200);
  }
  function restoreAutosave() {
    try {
      var j = localStorage.getItem('exitcel.autosave');
      if (!j) return;
      var data = JSON.parse(j);
      var empty = !data.sheets || (data.sheets.length === 1 && Object.keys(data.sheets[0].cells || {}).length === 0
        && !(data.sheets[0].objects || []).length);
      if (empty) return;
      wb = M.fromJSON(data);
      api.wb = wb;
      setTimeout(function () {
        toast('前回の作業内容を復元しました（空のブックにするには ファイル → 新規）');
        $('saveState').textContent = '自動復元';
      }, 400);
    } catch (e) { /* 壊れていたら無視 */ }
  }

  /* =========================================================
     公開
     ========================================================= */
  api.init = init;
  api.snap = snap;
  api.undo = undo;
  api.redo = redo;
  api.refresh = refresh;
  api.recalcAndRefresh = recalcAndRefresh;
  api.markDirty = markDirty;
  api.status = status;
  api.toast = toast;
  api.setZoom = setZoom;
  api.onSelectionChanged = onSelectionChanged;
  api.onObjectSelected = onObjectSelected;
  api.toggleStyle = toggleStyle;
  api.applyStyle = applyStyle;
  api.saveDefault = saveDefault;
  api.openFile = openFile;
  api.openFind = openFind;
  api.openTab = openTab;
  api.closeModals = closeModals;
  api.closeCtx = closeCtx;
  api.showCellMenu = showCellMenu;
  api.showObjectMenu = showObjectMenu;
  Object.defineProperty(api, 'wb', {
    get: function () { return wb; },
    set: function (v) { wb = v; }
  });
  Object.defineProperty(api, 'zoom', { get: function () { return zoomLevel; } });
  Object.defineProperty(api, 'showFormula', {
    get: function () { return showFormula; },
    set: function (v) { showFormula = v; }
  });

  return api;
})();

window.addEventListener('DOMContentLoaded', function () { App.init(); });
