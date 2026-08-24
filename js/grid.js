/* ===== Exitcel : grid.js =====
   グリッドの描画 (仮想スクロール) と マウス/キーボード操作
*/
var Grid = (function () {

  var elScroll, elInner, elCells, elObjs, elColHead, elRowHead, elColIn, elRowIn;
  var elSelRange, elSelActive, elFill, elMarquee, elEditor;
  var colX = [0], rowY = [0];
  var pool = {}, hpoolC = {}, hpoolR = {};
  var objEls = {};
  var editing = false, editR = 0, editC = 0, editOrig = '';
  var drag = null;
  var copySrc = null;      // {r1,c1,r2,c2,cut}
  var selObj = null;       // 選択中のオブジェクト id
  var overflowCache = {};

  function sh() { return App.wb.sheet(); }
  function zoom() { return App.zoom; }
  function cw(c) { return Math.max(0, Math.round(sh().colWidth(c) * zoom())); }
  function rh(r) { return Math.max(0, Math.round(sh().rowHeight(r) * zoom())); }

  var HEAD_W = 46, HEAD_H = 22;

  /* =========================================================
     初期化
     ========================================================= */
  function init() {
    elScroll = document.getElementById('gridScroll');
    elInner = document.getElementById('gridInner');
    elCells = document.getElementById('cellLayer');
    elObjs = document.getElementById('objLayer');
    elColHead = document.getElementById('colHead');
    elRowHead = document.getElementById('rowHead');
    elColIn = document.getElementById('colHeadInner');
    elRowIn = document.getElementById('rowHeadInner');
    elSelRange = document.getElementById('selRange');
    elSelActive = document.getElementById('selActive');
    elFill = document.getElementById('fillHandle');
    elMarquee = document.getElementById('copyMarquee');

    // 数式バー用に複数行対応のエディタへ差し替え
    var old = document.getElementById('cellEditor');
    elEditor = document.createElement('textarea');
    elEditor.id = 'cellEditor';
    elEditor.spellcheck = false;
    elEditor.style.resize = 'none';
    elEditor.style.overflow = 'hidden';
    old.parentNode.replaceChild(elEditor, old);

    elScroll.addEventListener('scroll', onScroll, { passive: true });
    elScroll.addEventListener('mousedown', onGridDown);
    elScroll.addEventListener('dblclick', onDblClick);
    elScroll.addEventListener('contextmenu', onContext);
    elColHead.addEventListener('mousedown', onHeadDown);
    elRowHead.addEventListener('mousedown', onHeadDown);
    elColHead.addEventListener('dblclick', onHeadDbl);
    elRowHead.addEventListener('dblclick', onHeadDbl);
    document.getElementById('cornerBox').addEventListener('mousedown', function () {
      var s = sh();
      setSel(0, 0, s.rows - 1, s.cols - 1, 0, 0);
    });
    elFill.addEventListener('mousedown', onFillDown);

    elEditor.addEventListener('keydown', onEditorKey);
    elEditor.addEventListener('input', function () {
      document.getElementById('formulaInput').value = elEditor.value;
      autoSizeEditor();
    });

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('resize', function () { render(); });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);

    elScroll.addEventListener('wheel', function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        App.setZoom(App.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      }
    }, { passive: false });

    // オブジェクト操作
    elObjs.addEventListener('mousedown', onObjDown);
    elObjs.addEventListener('dblclick', function (e) { e.stopPropagation(); });
    elObjs.addEventListener('input', function (e) {
      var el = e.target.closest('.obj');
      if (!el) return;
      var o = findObj(el.dataset.id);
      if (o) { o.text = e.target.textContent; App.markDirty(); }
    });
  }

  function findObj(id) {
    var list = sh().objects;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* =========================================================
     レイアウト
     ========================================================= */
  function layout() {
    var s = sh();
    colX = new Array(s.cols + 1); colX[0] = 0;
    for (var c = 0; c < s.cols; c++) colX[c + 1] = colX[c] + cw(c);
    rowY = new Array(s.rows + 1); rowY[0] = 0;
    for (var r = 0; r < s.rows; r++) rowY[r + 1] = rowY[r] + rh(r);
    elInner.style.width = colX[s.cols] + 'px';
    elInner.style.height = rowY[s.rows] + 'px';
  }
  function findIndex(arr, v) {
    var lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= v) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function hitCell(px, py) {
    var s = sh();
    var c = U.clamp(findIndex(colX, px), 0, s.cols - 1);
    var r = U.clamp(findIndex(rowY, py), 0, s.rows - 1);
    return { r: r, c: c };
  }
  function pointOf(e) {
    var rect = elScroll.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + elScroll.scrollLeft,
      y: e.clientY - rect.top + elScroll.scrollTop
    };
  }

  /* =========================================================
     描画
     ========================================================= */
  function render() {
    layout();
    renderHeaders();
    renderCells();
    renderObjects();
    updateSelection();
    updateMarquee();
  }

  function visibleRange() {
    var s = sh();
    var x1 = elScroll.scrollLeft, y1 = elScroll.scrollTop;
    var x2 = x1 + elScroll.clientWidth, y2 = y1 + elScroll.clientHeight;
    return {
      c1: U.clamp(findIndex(colX, x1), 0, s.cols - 1),
      c2: U.clamp(findIndex(colX, x2) + 1, 0, s.cols - 1),
      r1: U.clamp(findIndex(rowY, y1), 0, s.rows - 1),
      r2: U.clamp(findIndex(rowY, y2) + 1, 0, s.rows - 1)
    };
  }

  function renderHeaders() {
    var s = sh(), v = visibleRange(), i;
    var sel = s.sel;
    var seen = {};
    // 列
    for (i = v.c1; i <= v.c2; i++) {
      var key = 'c' + i, el = hpoolC[key];
      if (!el) {
        el = document.createElement('div');
        el.className = 'hcell';
        el.dataset.c = i;
        var rz = document.createElement('div');
        rz.className = 'hres col'; rz.dataset.col = i;
        elColIn.appendChild(el); elColIn.appendChild(rz);
        hpoolC[key] = el; hpoolC[key + 'r'] = rz;
      }
      el.style.left = colX[i] + 'px';
      el.style.width = cw(i) + 'px';
      el.style.height = HEAD_H + 'px';
      el.style.top = '0px';
      el.textContent = U.colName(i);
      var selCol = i >= Math.min(sel.c1, sel.c2) && i <= Math.max(sel.c1, sel.c2);
      var fullCol = selCol && Math.min(sel.r1, sel.r2) === 0 && Math.max(sel.r1, sel.r2) >= s.rows - 1;
      el.className = 'hcell' + (fullCol ? ' full' : (selCol ? ' sel' : ''));
      var rz2 = hpoolC[key + 'r'];
      rz2.style.left = (colX[i + 1] - 3) + 'px';
      rz2.style.height = HEAD_H + 'px';
      seen[key] = seen[key + 'r'] = 1;
    }
    for (var k in hpoolC) if (!seen[k]) { hpoolC[k].remove(); delete hpoolC[k]; }

    // 行
    var seen2 = {};
    for (i = v.r1; i <= v.r2; i++) {
      var key2 = 'r' + i, el2 = hpoolR[key2];
      if (!el2) {
        el2 = document.createElement('div');
        el2.className = 'hcell';
        el2.dataset.r = i;
        var rz3 = document.createElement('div');
        rz3.className = 'hres row'; rz3.dataset.row = i;
        elRowIn.appendChild(el2); elRowIn.appendChild(rz3);
        hpoolR[key2] = el2; hpoolR[key2 + 'r'] = rz3;
      }
      el2.style.top = rowY[i] + 'px';
      el2.style.height = rh(i) + 'px';
      el2.style.width = HEAD_W + 'px';
      el2.style.left = '0px';
      el2.textContent = (i + 1);
      var selRow = i >= Math.min(sel.r1, sel.r2) && i <= Math.max(sel.r1, sel.r2);
      var fullRow = selRow && Math.min(sel.c1, sel.c2) === 0 && Math.max(sel.c1, sel.c2) >= s.cols - 1;
      el2.className = 'hcell' + (fullRow ? ' full' : (selRow ? ' sel' : ''));
      var rz4 = hpoolR[key2 + 'r'];
      rz4.style.top = (rowY[i + 1] - 3) + 'px';
      rz4.style.width = HEAD_W + 'px';
      seen2[key2] = seen2[key2 + 'r'] = 1;
    }
    for (var k2 in hpoolR) if (!seen2[k2]) { hpoolR[k2].remove(); delete hpoolR[k2]; }

    elColIn.style.transform = 'translateX(' + (-elScroll.scrollLeft) + 'px)';
    elRowIn.style.transform = 'translateY(' + (-elScroll.scrollTop) + 'px)';
  }

  function renderCells() {
    var s = sh(), v = visibleRange();
    var seen = {};
    var showFormula = App.showFormula;

    // マージのアンカーが画面外でも描く
    var extra = [];
    s.merges.forEach(function (m) {
      if (m.r2 >= v.r1 && m.r1 <= v.r2 && m.c2 >= v.c1 && m.c1 <= v.c2) {
        if (m.r1 < v.r1 || m.c1 < v.c1) extra.push([m.r1, m.c1]);
      }
    });

    function put(r, c) {
      var key = r + ':' + c;
      if (seen[key]) return;
      var m = s.mergeAt(r, c);
      if (m && (m.r1 !== r || m.c1 !== c)) { return; }
      seen[key] = 1;
      var el = pool[key];
      if (!el) {
        el = document.createElement('div');
        el.className = 'cell';
        elCells.appendChild(el);
        pool[key] = el;
      }
      var w = m ? (colX[Math.min(m.c2 + 1, s.cols)] - colX[m.c1]) : cw(c);
      var h = m ? (rowY[Math.min(m.r2 + 1, s.rows)] - rowY[m.r1]) : rh(r);
      var cell = s.get(r, c);
      var st = cell && cell.s ? cell.s : null;
      var raw = cell ? (cell.f ? cell.cv : cell.v) : null;
      var text;
      if (showFormula && cell && cell.f) text = '=' + cell.f;
      else text = U.formatValue(raw, st && st.nf);

      var z = zoom();
      var cls = 'cell';
      if (st && st.wrap) cls += ' wrapped';
      el.className = cls;
      var sty = el.style;
      sty.left = colX[c] + 'px'; sty.top = rowY[r] + 'px';
      sty.height = h + 'px';
      sty.fontWeight = st && st.b ? '700' : '400';
      sty.fontStyle = st && st.i ? 'italic' : 'normal';
      var td = '';
      if (st && st.u) td += 'underline ';
      if (st && st.st) td += 'line-through';
      sty.textDecoration = td || 'none';
      sty.fontSize = Math.max(6, Math.round((st && st.fs ? st.fs : 11) * z)) + 'px';
      sty.fontFamily = st && st.ff ? '"' + st.ff + '"' : '';
      sty.color = st && st.fc ? st.fc : '';
      sty.background = st && st.bg ? st.bg : '';
      var ha = (st && st.ha) || U.defaultAlign(raw);
      sty.justifyContent = ha === 'center' ? 'center' : (ha === 'right' ? 'flex-end' : 'flex-start');
      var va = (st && st.va) || 'bottom';
      sty.alignItems = va === 'top' ? 'flex-start' : (va === 'middle' ? 'center' : 'flex-end');
      sty.textAlign = ha;

      // 罫線
      var bd = st && st.bd;
      sty.borderTop = bd && bd.t ? bdCss(bd.t) : '';
      sty.borderLeft = bd && bd.l ? bdCss(bd.l) : '';
      sty.borderRight = bd && bd.r ? bdCss(bd.r) : '1px solid var(--grid-line)';
      sty.borderBottom = bd && bd.b ? bdCss(bd.b) : '1px solid var(--grid-line)';
      if (bd && bd.r) sty.borderRightWidth = bdW(bd.r);
      if (bd && bd.b) sty.borderBottomWidth = bdW(bd.b);

      // 文字はみ出し (右隣が空なら伸ばす)
      var wOut = w;
      if (!m && text && !(st && st.wrap) && ha !== 'right' && ha !== 'center') {
        var tw = U.measureText(text, sty.fontWeight + ' ' + sty.fontSize + ' ' + (sty.fontFamily || '"Yu Gothic UI"')) + 6;
        if (tw > w) {
          var add = 0, cc = c + 1;
          while (cc < s.cols && add < tw - w && cc - c < 12) {
            var nb = s.get(r, cc);
            var nbv = nb ? (nb.f ? nb.cv : nb.v) : null;
            if (nbv !== null && nbv !== undefined && nbv !== '') break;
            add += cw(cc); cc++;
          }
          wOut = w + add;
        }
      }
      sty.width = wOut + 'px';
      sty.zIndex = wOut > w ? 2 : 1;
      if (el.textContent !== text) el.textContent = text;
      if (F.isErr(raw)) el.style.color = '#c00';
    }

    for (var r = v.r1; r <= v.r2; r++) for (var c = v.c1; c <= v.c2; c++) put(r, c);
    extra.forEach(function (p) { put(p[0], p[1]); });

    for (var k in pool) if (!seen[k]) { pool[k].remove(); delete pool[k]; }
  }

  function bdW(d) {
    return d.s === 'thick' ? '3px' : d.s === 'medium' ? '2px' : d.s === 'double' ? '3px' : '1px';
  }
  function bdCss(d) {
    var style = d.s === 'dashed' ? 'dashed' : d.s === 'dotted' ? 'dotted' : d.s === 'double' ? 'double' : 'solid';
    return bdW(d) + ' ' + style + ' ' + (d.c || '#000000');
  }

  /* ---------- オブジェクト ---------- */
  function renderObjects() {
    var s = sh(), seen = {}, z = zoom();
    s.objects.forEach(function (o, i) {
      seen[o.id] = 1;
      var el = objEls[o.id];
      if (!el) { el = OBJ.createEl(o); elObjs.appendChild(el); objEls[o.id] = el; }
      var view = {};
      for (var k in o) view[k] = o[k];
      view.x = o.x * z; view.y = o.y * z; view.w = o.w * z; view.h = o.h * z; view.z = i;
      OBJ.syncEl(el, view, s);
      o.dirty = false;
      el.classList.toggle('selected', selObj === o.id);
    });
    for (var id in objEls) if (!seen[id]) { objEls[id].remove(); delete objEls[id]; }
  }
  function invalidateObjects() {
    for (var id in objEls) { objEls[id].remove(); }
    objEls = {};
  }

  /* ---------- 選択の表示 ---------- */
  function normSel() {
    var s = sh().sel;
    return {
      r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2),
      c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2),
      ar: s.ar, ac: s.ac
    };
  }
  function expandSelByMerge(n) {
    var s = sh(), changed = true, guard = 0;
    while (changed && guard++ < 8) {
      changed = false;
      s.merges.forEach(function (m) {
        if (m.r1 <= n.r2 && m.r2 >= n.r1 && m.c1 <= n.c2 && m.c2 >= n.c1) {
          if (m.r1 < n.r1) { n.r1 = m.r1; changed = true; }
          if (m.r2 > n.r2) { n.r2 = m.r2; changed = true; }
          if (m.c1 < n.c1) { n.c1 = m.c1; changed = true; }
          if (m.c2 > n.c2) { n.c2 = m.c2; changed = true; }
        }
      });
    }
    return n;
  }

  function updateSelection() {
    var s = sh(), n = expandSelByMerge(normSel());
    var x = colX[n.c1], y = rowY[n.r1];
    var w = colX[Math.min(n.c2 + 1, s.cols)] - x;
    var h = rowY[Math.min(n.r2 + 1, s.rows)] - y;
    elSelRange.style.display = 'block';
    elSelRange.style.left = x + 'px'; elSelRange.style.top = y + 'px';
    elSelRange.style.width = w + 'px'; elSelRange.style.height = h + 'px';

    var m = s.mergeAt(n.ar, n.ac);
    var ar = m ? m.r1 : n.ar, ac = m ? m.c1 : n.ac;
    var ax = colX[ac], ay = rowY[ar];
    var aw = m ? colX[Math.min(m.c2 + 1, s.cols)] - ax : cw(ac);
    var ah = m ? rowY[Math.min(m.r2 + 1, s.rows)] - ay : rh(ar);
    elSelActive.style.display = 'block';
    elSelActive.style.left = (ax - 1) + 'px'; elSelActive.style.top = (ay - 1) + 'px';
    elSelActive.style.width = (aw + 1) + 'px'; elSelActive.style.height = (ah + 1) + 'px';

    elFill.style.display = 'block';
    elFill.style.left = (x + w - 4) + 'px';
    elFill.style.top = (y + h - 4) + 'px';

    renderHeaders();
    App.onSelectionChanged();
  }

  function updateMarquee() {
    if (!copySrc || copySrc.sheet !== sh().name) { elMarquee.style.display = 'none'; return; }
    var s = sh();
    var x = colX[copySrc.c1], y = rowY[copySrc.r1];
    elMarquee.style.display = 'block';
    elMarquee.style.left = (x - 1) + 'px'; elMarquee.style.top = (y - 1) + 'px';
    elMarquee.style.width = (colX[Math.min(copySrc.c2 + 1, s.cols)] - x + 2) + 'px';
    elMarquee.style.height = (rowY[Math.min(copySrc.r2 + 1, s.rows)] - y + 2) + 'px';
  }

  function setSel(r1, c1, r2, c2, ar, ac, noScroll) {
    var s = sh();
    s.sel.r1 = U.clamp(r1, 0, s.rows - 1); s.sel.c1 = U.clamp(c1, 0, s.cols - 1);
    s.sel.r2 = U.clamp(r2, 0, s.rows - 1); s.sel.c2 = U.clamp(c2, 0, s.cols - 1);
    s.sel.ar = U.clamp(ar === undefined ? r1 : ar, 0, s.rows - 1);
    s.sel.ac = U.clamp(ac === undefined ? c1 : ac, 0, s.cols - 1);
    selObj = null;
    updateSelection();
    if (!noScroll) scrollIntoView(s.sel.ar, s.sel.ac);
    renderCells();
    renderObjects();
  }

  function scrollIntoView(r, c) {
    var s = sh();
    var x1 = colX[c], x2 = colX[Math.min(c + 1, s.cols)];
    var y1 = rowY[r], y2 = rowY[Math.min(r + 1, s.rows)];
    var sl = elScroll.scrollLeft, stp = elScroll.scrollTop;
    var vw = elScroll.clientWidth, vh = elScroll.clientHeight;
    if (x1 < sl) elScroll.scrollLeft = x1;
    else if (x2 > sl + vw) elScroll.scrollLeft = x2 - vw;
    if (y1 < stp) elScroll.scrollTop = y1;
    else if (y2 > stp + vh) elScroll.scrollTop = y2 - vh;
  }

  function onScroll() {
    if (editing) positionEditor();
    renderHeaders();
    renderCells();
  }

  /* =========================================================
     マウス操作
     ========================================================= */
  function onGridDown(e) {
    if (e.button === 2) return;
    if (e.target.closest && e.target.closest('.obj')) return;
    if (e.target === elFill) return;
    App.closeCtx();
    var p = pointOf(e);
    var hit = hitCell(p.x, p.y);
    if (editing) commitEdit(null);
    selObj = null;
    var s = sh();
    if (e.shiftKey) {
      setSel(s.sel.ar, s.sel.ac, hit.r, hit.c, s.sel.ar, s.sel.ac, true);
    } else {
      setSel(hit.r, hit.c, hit.r, hit.c, hit.r, hit.c, true);
    }
    drag = { mode: 'sel', ar: s.sel.ar, ac: s.sel.ac };
    elScroll.focus();
    e.preventDefault();
  }

  function onDblClick(e) {
    if (e.target.closest && e.target.closest('.obj')) return;
    var p = pointOf(e);
    var hit = hitCell(p.x, p.y);
    setSel(hit.r, hit.c, hit.r, hit.c, hit.r, hit.c);
    startEdit(null);
  }

  function onFillDown(e) {
    e.preventDefault(); e.stopPropagation();
    var n = expandSelByMerge(normSel());
    drag = { mode: 'fill', base: n, to: { r: n.r2, c: n.c2 } };
  }

  function onHeadDown(e) {
    App.closeCtx();
    var s = sh();
    var t = e.target;
    if (t.classList.contains('hres')) {
      e.preventDefault();
      if (t.classList.contains('col')) {
        var c = +t.dataset.col;
        drag = { mode: 'colres', c: c, startX: e.clientX, startW: s.colWidth(c) };
      } else {
        var r = +t.dataset.row;
        drag = { mode: 'rowres', r: r, startY: e.clientY, startH: s.rowHeight(r) };
      }
      return;
    }
    var hc = t.closest('.hcell');
    if (!hc) return;
    e.preventDefault();
    if (editing) commitEdit(null);
    if (hc.dataset.c !== undefined) {
      var ci = +hc.dataset.c;
      if (e.shiftKey) setSel(0, s.sel.ac, s.rows - 1, ci, 0, s.sel.ac, true);
      else setSel(0, ci, s.rows - 1, ci, 0, ci, true);
      drag = { mode: 'colsel', start: ci };
    } else {
      var ri = +hc.dataset.r;
      if (e.shiftKey) setSel(s.sel.ar, 0, ri, s.cols - 1, s.sel.ar, 0, true);
      else setSel(ri, 0, ri, s.cols - 1, ri, 0, true);
      drag = { mode: 'rowsel', start: ri };
    }
  }

  function onHeadDbl(e) {
    var t = e.target;
    if (!t.classList.contains('hres')) return;
    App.snap();
    var s = sh();
    if (t.classList.contains('col')) autoFitCol(+t.dataset.col);
    else autoFitRow(+t.dataset.row);
    App.refresh();
  }

  function autoFitCol(c) {
    var s = sh(), max = 30;
    for (var r = 0; r < s.rows; r++) {
      var cell = s.get(r, c);
      if (!cell) continue;
      var v = cell.f ? cell.cv : cell.v;
      var txt = U.formatValue(v, cell.s && cell.s.nf);
      if (!txt) continue;
      var st = cell.s || {};
      var f = (st.b ? '700 ' : '') + (st.fs || 11) + 'px "' + (st.ff || 'Yu Gothic UI') + '"';
      max = Math.max(max, U.measureText(txt, f) + 12);
    }
    s.colW[c] = Math.min(500, Math.round(max));
  }
  function autoFitRow(r) {
    var s = sh(), max = M.DEF_ROW_H;
    for (var c = 0; c < s.cols; c++) {
      var cell = s.get(r, c);
      if (!cell || !cell.s) continue;
      if (cell.s.fs) max = Math.max(max, Math.round(cell.s.fs * 1.6));
      if (cell.s.wrap) {
        var v = cell.f ? cell.cv : cell.v;
        var txt = U.formatValue(v, cell.s.nf);
        var w = s.colWidth(c) - 6;
        var tw = U.measureText(txt, (cell.s.fs || 11) + 'px "Yu Gothic UI"');
        var lines = Math.max(1, Math.ceil(tw / Math.max(10, w)));
        max = Math.max(max, lines * Math.round((cell.s.fs || 11) * 1.35) + 6);
      }
    }
    s.rowH[r] = max;
  }

  function onMove(e) {
    if (!drag) return;
    var s = sh();
    if (drag.mode === 'sel') {
      var p = pointOf(e);
      autoScroll(e);
      var hit = hitCell(p.x, p.y);
      setSel(drag.ar, drag.ac, hit.r, hit.c, drag.ar, drag.ac, true);
    } else if (drag.mode === 'colsel') {
      var p2 = pointOf(e);
      var h2 = hitCell(p2.x, 0);
      setSel(0, drag.start, s.rows - 1, h2.c, 0, drag.start, true);
    } else if (drag.mode === 'rowsel') {
      var p3 = pointOf(e);
      var h3 = hitCell(0, p3.y);
      setSel(drag.start, 0, h3.r, s.cols - 1, drag.start, 0, true);
    } else if (drag.mode === 'colres') {
      var w = Math.max(4, drag.startW + (e.clientX - drag.startX) / zoom());
      s.colW[drag.c] = Math.round(w);
      layout(); renderHeaders(); renderCells(); updateSelection();
      App.status('幅: ' + Math.round(w) + ' px');
    } else if (drag.mode === 'rowres') {
      var h = Math.max(4, drag.startH + (e.clientY - drag.startY) / zoom());
      s.rowH[drag.r] = Math.round(h);
      layout(); renderHeaders(); renderCells(); updateSelection();
      App.status('高さ: ' + Math.round(h) + ' px');
    } else if (drag.mode === 'fill') {
      var p4 = pointOf(e);
      var h4 = hitCell(p4.x, p4.y);
      drag.to = { r: h4.r, c: h4.c };
      var b = drag.base;
      var dr = Math.abs(h4.r - b.r2), dc = Math.abs(h4.c - b.c2);
      var n;
      if (dr >= dc) n = { r1: Math.min(b.r1, h4.r), r2: Math.max(b.r2, h4.r), c1: b.c1, c2: b.c2 };
      else n = { r1: b.r1, r2: b.r2, c1: Math.min(b.c1, h4.c), c2: Math.max(b.c2, h4.c) };
      drag.preview = n;
      var x = colX[n.c1], y = rowY[n.r1];
      elSelRange.style.left = x + 'px'; elSelRange.style.top = y + 'px';
      elSelRange.style.width = (colX[Math.min(n.c2 + 1, s.cols)] - x) + 'px';
      elSelRange.style.height = (rowY[Math.min(n.r2 + 1, s.rows)] - y) + 'px';
    } else if (drag.mode === 'objmove') {
      var dx = (e.clientX - drag.sx) / zoom(), dy = (e.clientY - drag.sy) / zoom();
      drag.o.x = Math.max(0, Math.round(drag.ox + dx));
      drag.o.y = Math.max(0, Math.round(drag.oy + dy));
      renderObjects();
    } else if (drag.mode === 'objresize') {
      var dx2 = (e.clientX - drag.sx) / zoom(), dy2 = (e.clientY - drag.sy) / zoom();
      var o = drag.o, d = drag.dir;
      var nx = drag.ox, ny = drag.oy, nw = drag.ow, nh = drag.oh;
      if (d.indexOf('e') >= 0) nw = Math.max(20, drag.ow + dx2);
      if (d.indexOf('s') >= 0) nh = Math.max(20, drag.oh + dy2);
      if (d.indexOf('w') >= 0) { nw = Math.max(20, drag.ow - dx2); nx = drag.ox + (drag.ow - nw); }
      if (d.indexOf('n') >= 0) { nh = Math.max(20, drag.oh - dy2); ny = drag.oy + (drag.oh - nh); }
      o.x = Math.round(nx); o.y = Math.round(ny);
      o.w = Math.round(nw); o.h = Math.round(nh);
      if (o.type === 'chart') o.dirty = true;
      renderObjects();
    }
  }

  function autoScroll(e) {
    var rect = elScroll.getBoundingClientRect();
    var m = 24;
    if (e.clientX > rect.right - m) elScroll.scrollLeft += 24;
    else if (e.clientX < rect.left + m) elScroll.scrollLeft -= 24;
    if (e.clientY > rect.bottom - m) elScroll.scrollTop += 20;
    else if (e.clientY < rect.top + m) elScroll.scrollTop -= 20;
  }

  function onUp() {
    if (!drag) return;
    var d = drag; drag = null;
    if (d.mode === 'fill' && d.preview) {
      App.snap();
      doFill(d.base, d.preview);
      App.refresh();
    } else if (d.mode === 'colres' || d.mode === 'rowres') {
      App.markDirty();
      App.status('準備完了');
    } else if (d.mode === 'objmove' || d.mode === 'objresize') {
      App.markDirty();
    }
    updateSelection();
  }

  /* ---------- オートフィル ---------- */
  function doFill(base, target) {
    var s = sh();
    var bh = base.r2 - base.r1 + 1, bwid = base.c2 - base.c1 + 1;

    function copyCell(sr, sc, dr, dc) {
      if (sr === dr && sc === dc) return;
      var src = s.get(sr, sc);
      if (!src) { s.remove(dr, dc); return; }
      var dst = s.ensure(dr, dc);
      dst.s = M.cloneStyle(src.s);
      if (src.f) { dst.f = F.shiftFormula(src.f, dr - sr, dc - sc); dst.v = null; }
      else { dst.f = null; dst.v = src.v; }
      dst.cv = null;
    }
    /* 連続データ (等差) の判定 */
    function seriesFor(vals) {
      var nums = vals.filter(function (v) { return typeof v === 'number'; });
      if (nums.length !== vals.length || vals.length < 2) return null;
      var d = vals[1] - vals[0];
      for (var i = 2; i < vals.length; i++) if (Math.abs((vals[i] - vals[i - 1]) - d) > 1e-9) return null;
      return d;
    }

    if (target.r2 > base.r2 || target.r1 < base.r1) {
      // 縦方向
      for (var c = base.c1; c <= base.c2; c++) {
        var vals = [];
        for (var r = base.r1; r <= base.r2; r++) {
          var cell = s.get(r, c);
          vals.push(cell && !cell.f ? cell.v : null);
        }
        var step = seriesFor(vals);
        var single = (bh === 1 && typeof vals[0] === 'number');
        for (var rr = target.r1; rr <= target.r2; rr++) {
          if (rr >= base.r1 && rr <= base.r2) continue;
          var off = rr > base.r2 ? (rr - base.r1) : (rr - base.r1);
          var srcR = base.r1 + ((off % bh) + bh) % bh;
          var srcCell = s.get(srcR, c);
          if (step !== null && step !== undefined) {
            var k = rr > base.r2 ? (rr - base.r2) : (rr - base.r1);
            var v0 = rr > base.r2 ? vals[vals.length - 1] : vals[0];
            var dst = s.ensure(rr, c);
            dst.v = v0 + step * k; dst.f = null; dst.cv = null;
            dst.s = M.cloneStyle(srcCell && srcCell.s);
          } else if (single && bh === 1) {
            var k2 = rr - base.r1;
            var dst2 = s.ensure(rr, c);
            dst2.v = vals[0] + k2; dst2.f = null; dst2.cv = null;
            dst2.s = M.cloneStyle(srcCell && srcCell.s);
          } else copyCell(srcR, c, rr, c);
        }
      }
    } else {
      // 横方向
      for (var r2 = base.r1; r2 <= base.r2; r2++) {
        var vals2 = [];
        for (var c2 = base.c1; c2 <= base.c2; c2++) {
          var cl = s.get(r2, c2);
          vals2.push(cl && !cl.f ? cl.v : null);
        }
        var step2 = seriesFor(vals2);
        for (var cc = target.c1; cc <= target.c2; cc++) {
          if (cc >= base.c1 && cc <= base.c2) continue;
          var off2 = cc - base.c1;
          var srcC = base.c1 + ((off2 % bwid) + bwid) % bwid;
          var srcCell2 = s.get(r2, srcC);
          if (step2 !== null && step2 !== undefined) {
            var k3 = cc > base.c2 ? (cc - base.c2) : (cc - base.c1);
            var v02 = cc > base.c2 ? vals2[vals2.length - 1] : vals2[0];
            var d3 = s.ensure(r2, cc);
            d3.v = v02 + step2 * k3; d3.f = null; d3.cv = null;
            d3.s = M.cloneStyle(srcCell2 && srcCell2.s);
          } else if (bwid === 1 && typeof vals2[0] === 'number') {
            var d4 = s.ensure(r2, cc);
            d4.v = vals2[0] + (cc - base.c1); d4.f = null; d4.cv = null;
            d4.s = M.cloneStyle(srcCell2 && srcCell2.s);
          } else copyCell(r2, srcC, r2, cc);
        }
      }
    }
    sh().sel.r1 = target.r1; sh().sel.c1 = target.c1;
    sh().sel.r2 = target.r2; sh().sel.c2 = target.c2;
  }

  /* =========================================================
     オブジェクト操作
     ========================================================= */
  function onObjDown(e) {
    var el = e.target.closest('.obj');
    if (!el) return;
    var o = findObj(el.dataset.id);
    if (!o) return;
    App.closeCtx();
    selObj = o.id;
    renderObjects();
    App.onObjectSelected(o);

    if (e.target.classList.contains('hnd')) {
      e.preventDefault(); e.stopPropagation();
      App.snap();
      drag = { mode: 'objresize', o: o, dir: e.target.dataset.dir, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, ow: o.w, oh: o.h };
      return;
    }
    if (e.target.classList.contains('movebar')) {
      e.preventDefault(); e.stopPropagation();
      App.snap();
      drag = { mode: 'objmove', o: o, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y };
      return;
    }
    e.stopPropagation();
  }

  function deleteSelectedObject() {
    if (!selObj) return false;
    App.snap();
    var s = sh();
    s.objects = s.objects.filter(function (o) { return o.id !== selObj; });
    selObj = null;
    App.refresh();
    return true;
  }

  function addObject(o) {
    App.snap();
    var s = sh();
    // 画面中央付近に配置
    var z = zoom();
    if (o.x === undefined || o.x === null) {
      o.x = Math.round((elScroll.scrollLeft + 60) / z);
      o.y = Math.round((elScroll.scrollTop + 40) / z);
    }
    s.objects.push(o);
    selObj = o.id;
    App.refresh();
    return o;
  }

  /* =========================================================
     セル編集
     ========================================================= */
  function startEdit(initial) {
    var s = sh(), n = normSel();
    var m = s.mergeAt(n.ar, n.ac);
    editR = m ? m.r1 : n.ar; editC = m ? m.c1 : n.ac;
    editing = true;
    editOrig = s.editText(editR, editC);
    elEditor.value = initial !== null && initial !== undefined ? initial : editOrig;
    elEditor.style.display = 'block';
    positionEditor();
    elEditor.focus();
    if (initial === null || initial === undefined) elEditor.setSelectionRange(elEditor.value.length, elEditor.value.length);
    App.status('入力');
    document.getElementById('formulaInput').value = elEditor.value;
  }
  function positionEditor() {
    var s = sh();
    var m = s.mergeAt(editR, editC);
    var x = colX[editC], y = rowY[editR];
    var w = m ? colX[Math.min(m.c2 + 1, s.cols)] - x : cw(editC);
    var h = m ? rowY[Math.min(m.r2 + 1, s.rows)] - y : rh(editR);
    var st = s.styleOf(editR, editC) || {};
    elEditor.style.left = (x - 1) + 'px';
    elEditor.style.top = (y - 1) + 'px';
    elEditor.style.minWidth = (w + 2) + 'px';
    elEditor.style.height = (h + 2) + 'px';
    elEditor.style.fontSize = Math.max(6, Math.round((st.fs || 11) * zoom())) + 'px';
    elEditor.style.fontWeight = st.b ? '700' : '400';
    elEditor.style.fontFamily = st.ff ? '"' + st.ff + '"' : '';
    elEditor.style.textAlign = st.ha || 'left';
    autoSizeEditor();
  }
  function autoSizeEditor() {
    var s = sh();
    var m = s.mergeAt(editR, editC);
    var baseW = m ? colX[Math.min(m.c2 + 1, s.cols)] - colX[editC] : cw(editC);
    var baseH = m ? rowY[Math.min(m.r2 + 1, s.rows)] - rowY[editR] : rh(editR);
    var lines = elEditor.value.split('\n');
    var maxW = 0;
    var font = elEditor.style.fontWeight + ' ' + elEditor.style.fontSize + ' ' + (elEditor.style.fontFamily || '"Yu Gothic UI"');
    lines.forEach(function (l) { maxW = Math.max(maxW, U.measureText(l, font)); });
    elEditor.style.width = Math.max(baseW + 2, Math.min(maxW + 18, 700)) + 'px';
    elEditor.style.height = Math.max(baseH + 2, lines.length * (parseInt(elEditor.style.fontSize, 10) + 4) + 4) + 'px';
  }
  function commitEdit(dir) {
    if (!editing) return;
    var v = elEditor.value;
    editing = false;
    elEditor.style.display = 'none';
    if (v !== editOrig) {
      App.snap();
      var s = sh();
      s.setValue(editR, editC, v);
      App.recalcAndRefresh();
    }
    if (dir === 'down') moveSel(1, 0);
    else if (dir === 'up') moveSel(-1, 0);
    else if (dir === 'right') moveSel(0, 1);
    else if (dir === 'left') moveSel(0, -1);
    App.status('準備完了');
    App.onSelectionChanged();
    elScroll.focus();
  }
  function cancelEdit() {
    if (!editing) return;
    editing = false;
    elEditor.style.display = 'none';
    App.onSelectionChanged();
    App.status('準備完了');
  }
  function onEditorKey(e) {
    if (e.key === 'Enter' && !e.altKey) {
      e.preventDefault(); commitEdit(e.shiftKey ? 'up' : 'down'); return;
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      var st = elEditor.selectionStart, en = elEditor.selectionEnd;
      elEditor.value = elEditor.value.slice(0, st) + '\n' + elEditor.value.slice(en);
      elEditor.selectionStart = elEditor.selectionEnd = st + 1;
      autoSizeEditor();
      return;
    }
    if (e.key === 'Tab') { e.preventDefault(); commitEdit(e.shiftKey ? 'left' : 'right'); return; }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); elScroll.focus(); return; }
    e.stopPropagation();
  }

  function moveSel(dr, dc) {
    var s = sh(), n = normSel();
    var r = n.ar + dr, c = n.ac + dc;
    var m = s.mergeAt(n.ar, n.ac);
    if (m) {
      if (dr > 0) r = m.r2 + 1; else if (dr < 0) r = m.r1 - 1;
      if (dc > 0) c = m.c2 + 1; else if (dc < 0) c = m.c1 - 1;
    }
    r = U.clamp(r, 0, s.rows - 1); c = U.clamp(c, 0, s.cols - 1);
    setSel(r, c, r, c, r, c);
  }

  /* =========================================================
     キーボード
     ========================================================= */
  function isTypingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function onKeyDown(e) {
    if (document.getElementById('modalBack').classList.contains('on')) {
      if (e.key === 'Escape') App.closeModals();
      return;
    }
    if (editing) return;
    if (isTypingTarget(e.target) && e.target !== document.body) return;

    var s = sh(), n = normSel();
    var ctrl = e.ctrlKey || e.metaKey;
    var k = e.key;

    if (ctrl) {
      switch (k.toLowerCase()) {
        case 's': e.preventDefault(); App.saveDefault(); return;
        case 'o': e.preventDefault(); App.openFile(); return;
        case 'z': e.preventDefault(); App.undo(); return;
        case 'y': e.preventDefault(); App.redo(); return;
        case 'b': e.preventDefault(); App.toggleStyle('b'); return;
        case 'i': e.preventDefault(); App.toggleStyle('i'); return;
        case 'u': e.preventDefault(); App.toggleStyle('u'); return;
        case 'f': e.preventDefault(); App.openFind(); return;
        case 'a': e.preventDefault(); setSel(0, 0, s.rows - 1, s.cols - 1, 0, 0); return;
        case 'p': e.preventDefault(); window.print(); return;
        case '1': e.preventDefault(); App.openTab('home'); return;
      }
      if (k === ';') { e.preventDefault(); App.snap(); s.setValue(n.ar, n.ac, String(new Date().getFullYear()) + '/' + (new Date().getMonth() + 1) + '/' + new Date().getDate()); App.recalcAndRefresh(); return; }
      if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        var dir = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[k];
        var t = jump(n.ar, n.ac, dir[0], dir[1]);
        if (e.shiftKey) setSel(n.ar, n.ac, t.r, t.c, n.ar, n.ac);
        else setSel(t.r, t.c, t.r, t.c, t.r, t.c);
        return;
      }
      if (k === 'Home') { e.preventDefault(); setSel(0, 0, 0, 0, 0, 0); return; }
    }

    switch (k) {
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
        e.preventDefault();
        var d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k];
        if (e.shiftKey) setSel(n.ar, n.ac, U.clamp(s.sel.r2 + d[0], 0, s.rows - 1), U.clamp(s.sel.c2 + d[1], 0, s.cols - 1), n.ar, n.ac);
        else moveSel(d[0], d[1]);
        return;
      }
      case 'Tab':
        e.preventDefault();
        moveSel(0, e.shiftKey ? -1 : 1);
        return;
      case 'Enter':
        e.preventDefault();
        if (selObj) { return; }
        moveSel(e.shiftKey ? -1 : 1, 0);
        return;
      case 'F2':
        e.preventDefault(); startEdit(null); return;
      case 'Delete': case 'Backspace':
        e.preventDefault();
        if (deleteSelectedObject()) return;
        App.snap(); clearRange(n, k === 'Delete' ? 'contents' : 'contents'); App.recalcAndRefresh();
        return;
      case 'Escape':
        copySrc = null; updateMarquee(); selObj = null; renderObjects(); return;
      case 'Home':
        e.preventDefault(); setSel(n.ar, 0, n.ar, 0, n.ar, 0); return;
      case 'PageDown': case 'PageUp': {
        e.preventDefault();
        var pageRows = Math.max(1, Math.floor(elScroll.clientHeight / (M.DEF_ROW_H * zoom())) - 1);
        var nr = U.clamp(n.ar + (k === 'PageDown' ? pageRows : -pageRows), 0, s.rows - 1);
        setSel(nr, n.ac, nr, n.ac, nr, n.ac);
        return;
      }
      case 'F4':
        e.preventDefault(); return;
    }

    // 直接入力で編集開始
    if (!ctrl && !e.altKey && k.length === 1) {
      e.preventDefault();
      startEdit(k);
    }
  }

  function jump(r, c, dr, dc) {
    var s = sh();
    function has(rr, cc) {
      var x = s.get(rr, cc);
      if (!x) return false;
      var v = x.f ? x.cv : x.v;
      return v !== null && v !== undefined && v !== '';
    }
    var cr = r, cc2 = c;
    var limitR = s.rows - 1, limitC = s.cols - 1;
    var cur = has(cr, cc2);
    for (var i = 0; i < 10000; i++) {
      var nr = cr + dr, nc = cc2 + dc;
      if (nr < 0 || nc < 0 || nr > limitR || nc > limitC) break;
      var nx = has(nr, nc);
      if (cur && !nx) { break; }
      cr = nr; cc2 = nc;
      if (!cur && nx) break;
    }
    return { r: cr, c: cc2 };
  }

  function clearRange(n, what) {
    var s = sh();
    for (var r = n.r1; r <= n.r2; r++) for (var c = n.c1; c <= n.c2; c++) {
      var cell = s.get(r, c);
      if (!cell) continue;
      if (what === 'all') { s.remove(r, c); continue; }
      if (what === 'formats') { cell.s = null; if (cell.v === null && !cell.f) s.remove(r, c); continue; }
      cell.v = null; cell.f = null; cell.cv = null;
      if (M.isEmptyStyle(cell.s)) s.remove(r, c);
    }
  }

  /* =========================================================
     クリップボード
     ========================================================= */
  function buildClipboard() {
    var s = sh(), n = expandSelByMerge(normSel());
    var tsv = [], html = '<table>';
    var data = { rows: [], r1: n.r1, c1: n.c1 };
    for (var r = n.r1; r <= n.r2; r++) {
      var line = [], row = [];
      html += '<tr>';
      for (var c = n.c1; c <= n.c2; c++) {
        var cell = s.get(r, c);
        var v = cell ? (cell.f ? cell.cv : cell.v) : null;
        var txt = U.formatValue(v, cell && cell.s ? cell.s.nf : null);
        line.push(txt.indexOf('\t') >= 0 || txt.indexOf('\n') >= 0 ? '"' + txt.replace(/"/g, '""') + '"' : txt);
        html += '<td>' + U.esc(txt) + '</td>';
        row.push(cell ? { v: cell.v, f: cell.f, s: M.cloneStyle(cell.s) } : null);
      }
      html += '</tr>';
      tsv.push(line.join('\t'));
      data.rows.push(row);
    }
    html += '</table>';
    return { text: tsv.join('\r\n'), html: html, data: data, range: n };
  }

  var internalClip = null;

  function onCopy(e) {
    if (editing || isTypingTarget(document.activeElement)) return;
    var cb = buildClipboard();
    internalClip = cb;
    copySrc = { r1: cb.range.r1, c1: cb.range.c1, r2: cb.range.r2, c2: cb.range.c2, cut: false, sheet: sh().name };
    updateMarquee();
    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', cb.text);
      e.clipboardData.setData('text/html', cb.html);
      e.preventDefault();
    }
    App.status('コピー: ' + U.rangeA1(cb.range.r1, cb.range.c1, cb.range.r2, cb.range.c2));
  }
  function onCut(e) {
    if (editing || isTypingTarget(document.activeElement)) return;
    onCopy(e);
    if (copySrc) copySrc.cut = true;
    App.status('切り取り');
  }
  function onPaste(e) {
    if (editing || isTypingTarget(document.activeElement)) return;
    e.preventDefault();
    var dt = e.clipboardData;
    if (!dt) return;

    // 画像の貼り付け
    var items = dt.items || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') === 0) {
        var f = items[i].getAsFile();
        if (f) {
          OBJ.loadImageFile(f).then(function (r) {
            var n0 = normSel();
            addObject(OBJ.makeImage(r.src, Math.round(colX[n0.c1] / zoom()) + 8, Math.round(rowY[n0.r1] / zoom()) + 8, r.w, r.h));
            App.toast('画像を貼り付けました');
          });
        }
        return;
      }
    }

    var text = dt.getData('text/plain');
    if (!text) return;
    App.snap();
    var n = normSel();
    var s = sh();

    if (internalClip && internalClip.text === text) {
      // 内部形式 (書式・数式ごと)
      var rows = internalClip.data.rows;
      var sr = internalClip.data.r1, sc = internalClip.data.c1;
      // 選択範囲が広ければ繰り返し貼り付け
      var repR = Math.max(1, Math.floor((n.r2 - n.r1 + 1) / rows.length));
      var repC = Math.max(1, Math.floor((n.c2 - n.c1 + 1) / (rows[0] ? rows[0].length : 1)));
      if ((n.r2 - n.r1 + 1) % rows.length !== 0) repR = 1;
      if (rows[0] && (n.c2 - n.c1 + 1) % rows[0].length !== 0) repC = 1;
      for (var rp = 0; rp < repR; rp++) for (var cp = 0; cp < repC; cp++) {
        for (var r = 0; r < rows.length; r++) {
          for (var c = 0; c < rows[r].length; c++) {
            var dr = n.r1 + rp * rows.length + r, dc = n.c1 + cp * rows[r].length + c;
            var src = rows[r][c];
            if (!src) { s.remove(dr, dc); continue; }
            var dst = s.ensure(dr, dc);
            dst.s = M.cloneStyle(src.s);
            if (src.f) { dst.f = F.shiftFormula(src.f, dr - (sr + r), dc - (sc + c)); dst.v = null; }
            else { dst.f = null; dst.v = src.v; }
            dst.cv = null;
            s.growTo(dr, dc);
          }
        }
      }
      if (copySrc && copySrc.cut && copySrc.sheet === s.name) {
        for (var r2 = copySrc.r1; r2 <= copySrc.r2; r2++)
          for (var c2 = copySrc.c1; c2 <= copySrc.c2; c2++) s.remove(r2, c2);
        copySrc = null;
      }
      var rh2 = rows.length * repR, rw = (rows[0] ? rows[0].length : 1) * repC;
      s.sel.r1 = n.r1; s.sel.c1 = n.c1;
      s.sel.r2 = n.r1 + rh2 - 1; s.sel.c2 = n.c1 + rw - 1;
    } else {
      var sep = text.indexOf('\t') >= 0 ? '\t' : (text.indexOf(',') >= 0 && text.indexOf('\n') >= 0 ? ',' : '\t');
      var grid = U.parseDelimited(text, sep);
      for (var gr = 0; gr < grid.length; gr++) {
        for (var gc = 0; gc < grid[gr].length; gc++) {
          s.setValue(n.r1 + gr, n.c1 + gc, grid[gr][gc]);
        }
      }
      s.sel.r1 = n.r1; s.sel.c1 = n.c1;
      s.sel.r2 = n.r1 + grid.length - 1;
      s.sel.c2 = n.c1 + Math.max.apply(null, grid.map(function (g) { return g.length; })) - 1;
    }
    App.recalcAndRefresh();
    App.status('貼り付け完了');
  }

  function onContext(e) {
    e.preventDefault();
    var objEl = e.target.closest('.obj');
    if (objEl) {
      selObj = objEl.dataset.id;
      renderObjects();
      App.showObjectMenu(e.clientX, e.clientY, findObj(selObj));
      return;
    }
    var p = pointOf(e);
    var hit = hitCell(p.x, p.y);
    var n = normSel();
    if (hit.r < n.r1 || hit.r > n.r2 || hit.c < n.c1 || hit.c > n.c2) {
      setSel(hit.r, hit.c, hit.r, hit.c, hit.r, hit.c, true);
    }
    App.showCellMenu(e.clientX, e.clientY);
  }

  /* =========================================================
     公開 API
     ========================================================= */
  return {
    init: init, render: render, renderCells: renderCells, renderObjects: renderObjects,
    invalidateObjects: invalidateObjects,
    layout: layout, updateSelection: updateSelection, setSel: setSel,
    sel: normSel, expandSelByMerge: expandSelByMerge,
    startEdit: startEdit, commitEdit: commitEdit, cancelEdit: cancelEdit,
    isEditing: function () { return editing; },
    editorValue: function (v) { if (v !== undefined) { elEditor.value = v; autoSizeEditor(); } return elEditor.value; },
    clearRange: clearRange, addObject: addObject, deleteSelectedObject: deleteSelectedObject,
    selectedObject: function () { return selObj ? findObj(selObj) : null; },
    selectObject: function (id) { selObj = id; renderObjects(); },
    autoFitCol: autoFitCol, autoFitRow: autoFitRow,
    scrollIntoView: scrollIntoView,
    clearCopyMark: function () { copySrc = null; updateMarquee(); },
    colXArr: function () { return colX; }, rowYArr: function () { return rowY; },
    focusGrid: function () { elScroll.focus(); }
  };
})();
