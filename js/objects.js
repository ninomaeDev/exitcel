/* ===== Exitcel : objects.js =====
   シート上に浮かぶオブジェクト (画像 / 図形 / テキストボックス / メモ / グラフ)
*/
var OBJ = (function () {

  var PALETTE = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47',
                 '#264478', '#9e480e', '#636363', '#997300', '#255e91', '#43682b'];

  /* ---------- 生成 ---------- */
  function makeImage(src, x, y, w, h) {
    return { id: U.uid(), type: 'image', src: src, x: x, y: y, w: w, h: h, name: '図' };
  }
  function makeTextbox(x, y) {
    return {
      id: U.uid(), type: 'textbox', x: x, y: y, w: 200, h: 80,
      text: 'テキストを入力', name: 'テキスト ボックス',
      st: { fs: 12, fc: '#000000', bg: '#ffffff', bd: '#8c96a0', ha: 'left', b: false, i: false }
    };
  }
  function makeNote(x, y, text) {
    return {
      id: U.uid(), type: 'note', x: x, y: y, w: 180, h: 90,
      text: text || 'メモ', name: 'メモ',
      st: { fs: 12, fc: '#3b3200', bg: '#fffbcc', bd: '#d8c96a', ha: 'left' }
    };
  }
  function makeShape(kind, x, y) {
    var w = kind === 'line' || kind === 'arrow' ? 180 : 160;
    var h = kind === 'line' || kind === 'arrow' ? 80 : 100;
    return {
      id: U.uid(), type: 'shape', shape: kind, x: x, y: y, w: w, h: h,
      text: '', name: '図形',
      st: { fill: (kind === 'line' || kind === 'arrow') ? 'none' : '#dbe5f1', stroke: '#2f5597', sw: 2, fc: '#1b1f23', fs: 12 }
    };
  }
  function makeChart(kind, x, y, opt) {
    return {
      id: U.uid(), type: 'chart', chart: kind, x: x, y: y, w: 460, h: 300,
      title: (opt && opt.title) || 'グラフ タイトル',
      range: (opt && opt.range) || 'A1:B5',
      header: opt ? !!opt.header : true,
      firstCol: opt ? !!opt.firstCol : true,
      name: 'グラフ', dirty: true
    };
  }

  /* ---------- DOM 生成 ---------- */
  function createEl(o) {
    var el = document.createElement('div');
    el.className = 'obj ' + o.type;
    el.dataset.id = o.id;

    var body = document.createElement('div');
    body.className = 'obj-body';
    el.appendChild(body);

    var mb = document.createElement('div');
    mb.className = 'movebar';
    el.appendChild(mb);

    ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].forEach(function (d) {
      var h = document.createElement('div');
      h.className = 'hnd ' + d;
      h.dataset.dir = d;
      el.appendChild(h);
    });
    return el;
  }

  /* ---------- DOM 反映 ---------- */
  function syncEl(el, o, sheet) {
    el.style.left = o.x + 'px';
    el.style.top = o.y + 'px';
    el.style.width = o.w + 'px';
    el.style.height = o.h + 'px';
    el.style.zIndex = 3 + (o.z || 0);
    var body = el.querySelector('.obj-body');

    if (o.type === 'image') {
      var img = body.querySelector('img');
      if (!img) { body.innerHTML = ''; img = document.createElement('img'); body.appendChild(img); }
      if (img.getAttribute('src') !== o.src) img.src = o.src;

    } else if (o.type === 'textbox' || o.type === 'note') {
      if (!body.isContentEditable) {
        body.contentEditable = 'true';
        body.spellcheck = false;
      }
      if (body.textContent !== o.text && document.activeElement !== body) body.textContent = o.text || '';
      var s = o.st || {};
      body.style.fontSize = (s.fs || 12) + 'px';
      body.style.color = s.fc || '#000';
      body.style.background = s.bg || '#fff';
      body.style.borderColor = s.bd || '#8c96a0';
      body.style.textAlign = s.ha || 'left';
      body.style.fontWeight = s.b ? '700' : '400';
      body.style.fontStyle = s.i ? 'italic' : 'normal';

    } else if (o.type === 'shape') {
      body.innerHTML = shapeSVG(o);

    } else if (o.type === 'chart') {
      var cv = body.querySelector('canvas');
      if (!cv) { body.innerHTML = ''; cv = document.createElement('canvas'); body.appendChild(cv); }
      var dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(o.w * dpr) || cv.height !== Math.round(o.h * dpr) || o.dirty) {
        cv.width = Math.round(o.w * dpr);
        cv.height = Math.round(o.h * dpr);
        drawChart(cv, o, sheet, dpr);
        o.dirty = false;
      }
    }
  }

  function shapeSVG(o) {
    var s = o.st || {};
    var w = o.w, h = o.h, sw = s.sw || 2;
    var fill = s.fill && s.fill !== 'none' ? s.fill : 'none';
    var stroke = s.stroke || '#2f5597';
    var inner = '';
    var p = sw / 2 + 1;
    if (o.shape === 'rect') {
      inner = '<rect x="' + p + '" y="' + p + '" width="' + Math.max(1, w - p * 2) + '" height="' + Math.max(1, h - p * 2) +
        '" rx="3" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    } else if (o.shape === 'ellipse') {
      inner = '<ellipse cx="' + w / 2 + '" cy="' + h / 2 + '" rx="' + Math.max(1, w / 2 - p) + '" ry="' + Math.max(1, h / 2 - p) +
        '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    } else if (o.shape === 'line') {
      inner = '<line x1="' + p + '" y1="' + (h - p) + '" x2="' + (w - p) + '" y2="' + p + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
    } else if (o.shape === 'arrow') {
      var id = 'ah' + o.id;
      inner = '<defs><marker id="' + id + '" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">' +
        '<path d="M0,0 L7,3 L0,6 z" fill="' + stroke + '"/></marker></defs>' +
        '<line x1="' + p + '" y1="' + (h - p) + '" x2="' + (w - p * 3) + '" y2="' + p + '" stroke="' + stroke +
        '" stroke-width="' + sw + '" marker-end="url(#' + id + ')" stroke-linecap="round"/>';
    }
    var txt = '';
    if (o.text) {
      txt = '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;' +
        'width:100%;height:100%;font:' + (s.fs || 12) + 'px \'Yu Gothic UI\',Meiryo,sans-serif;color:' + (s.fc || '#000') +
        ';text-align:center;padding:6px;box-sizing:border-box;white-space:pre-wrap">' + U.esc(o.text) + '</div></foreignObject>';
    }
    return '<svg width="100%" height="100%" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' + inner + txt + '</svg>';
  }

  /* =========================================================
     グラフ
     ========================================================= */
  function chartData(o, sheet) {
    var rg = U.parseRange(o.range || '');
    if (!rg || !sheet) return null;
    var rows = [];
    for (var r = rg.r1; r <= rg.r2; r++) {
      var row = [];
      for (var c = rg.c1; c <= rg.c2; c++) {
        var cell = sheet.get(r, c);
        var v = cell ? (cell.f ? cell.cv : cell.v) : null;
        row.push(v);
      }
      rows.push(row);
    }
    if (!rows.length) return null;

    var hasHeader = o.header && rows.length > 1;
    var hasCat = o.firstCol && rows[0].length > 1;

    var headerRow = hasHeader ? rows[0] : null;
    var dataRows = hasHeader ? rows.slice(1) : rows;

    var cats = dataRows.map(function (row, i) {
      if (!hasCat) return String(i + 1);
      var v = row[0];
      var cell = null;
      return v === null || v === undefined ? String(i + 1) : U.formatValue(v, null);
    });

    var startCol = hasCat ? 1 : 0;
    var seriesCount = Math.max(0, (dataRows[0] ? dataRows[0].length : 0) - startCol);
    var series = [];
    for (var s = 0; s < seriesCount; s++) {
      var name = headerRow && headerRow[startCol + s] !== null && headerRow[startCol + s] !== undefined
        ? U.formatValue(headerRow[startCol + s], null) : ('系列' + (s + 1));
      var vals = dataRows.map(function (row) {
        var v = row[startCol + s];
        return typeof v === 'number' ? v : (v === null || v === undefined || v === '' ? null : (parseFloat(v) || 0));
      });
      series.push({ name: name, values: vals, color: PALETTE[s % PALETTE.length] });
    }
    return { cats: cats, series: series };
  }

  function drawChart(canvas, o, sheet, dpr) {
    var ctx = canvas.getContext('2d');
    dpr = dpr || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    var W = o.w, H = o.h;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d0d7de'; ctx.lineWidth = 1;
    ctx.strokeRect(.5, .5, W - 1, H - 1);

    var data = chartData(o, sheet);
    ctx.font = '13px "Yu Gothic UI",Meiryo,sans-serif';
    ctx.fillStyle = '#1b1f23';
    if (!data || !data.series.length) {
      ctx.textAlign = 'center';
      ctx.fillText('データ範囲を設定してください', W / 2, H / 2);
      ctx.restore(); return;
    }

    // タイトル
    var top = 10;
    if (o.title) {
      ctx.font = 'bold 14px "Yu Gothic UI",Meiryo,sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#404040';
      ctx.fillText(o.title, W / 2, 22);
      top = 34;
    }
    // 凡例
    var legendH = 0;
    if (data.series.length >= 1) {
      legendH = 20;
      ctx.font = '11px "Yu Gothic UI",Meiryo,sans-serif';
      var totalW = 0, i;
      for (i = 0; i < data.series.length; i++) totalW += 14 + ctx.measureText(data.series[i].name).width + 14;
      var lx = Math.max(6, (W - totalW) / 2), ly = H - 8;
      ctx.textAlign = 'left';
      for (i = 0; i < data.series.length; i++) {
        ctx.fillStyle = data.series[i].color;
        ctx.fillRect(lx, ly - 9, 10, 10);
        ctx.fillStyle = '#404040';
        ctx.fillText(data.series[i].name, lx + 14, ly);
        lx += 14 + ctx.measureText(data.series[i].name).width + 14;
      }
    }

    if (o.chart === 'pie') { drawPie(ctx, data, W, H, top, legendH); ctx.restore(); return; }

    /* --- 軸のある系統 --- */
    var all = [];
    data.series.forEach(function (s) { s.values.forEach(function (v) { if (typeof v === 'number') all.push(v); }); });
    if (!all.length) all = [0, 1];
    var max = Math.max.apply(null, all), min = Math.min.apply(null, all);
    if (min > 0) min = 0;
    if (max < 0) max = 0;
    if (max === min) max = min + 1;
    var ticks = niceTicks(min, max, 5);
    min = ticks[0]; max = ticks[ticks.length - 1];

    ctx.font = '11px "Yu Gothic UI",Meiryo,sans-serif';
    var labelW = 0;
    ticks.forEach(function (t) { labelW = Math.max(labelW, ctx.measureText(fmtTick(t)).width); });
    var padL = labelW + 14, padR = 14, padB = 30 + legendH, padT = top + 6;
    var plotW = Math.max(20, W - padL - padR), plotH = Math.max(20, H - padT - padB);
    var x0 = padL, y0 = padT + plotH;

    function yOf(v) { return y0 - (v - min) / (max - min) * plotH; }

    // 目盛り線
    ctx.strokeStyle = '#e6e9ec'; ctx.fillStyle = '#7a848d'; ctx.textAlign = 'right';
    ticks.forEach(function (t) {
      var y = yOf(t);
      ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + .5); ctx.lineTo(x0 + plotW, Math.round(y) + .5); ctx.stroke();
      ctx.fillText(fmtTick(t), x0 - 6, y + 4);
    });
    // 軸
    ctx.strokeStyle = '#b3bcc4';
    ctx.beginPath(); ctx.moveTo(x0 + .5, padT); ctx.lineTo(x0 + .5, y0 + .5); ctx.lineTo(x0 + plotW, y0 + .5); ctx.stroke();

    var n = data.cats.length;
    var slot = plotW / Math.max(1, n);

    // 項目ラベル
    ctx.fillStyle = '#7a848d'; ctx.textAlign = 'center';
    var step = Math.ceil(n / Math.max(1, Math.floor(plotW / 46)));
    for (var ci = 0; ci < n; ci++) {
      if (ci % step) continue;
      var lbl = String(data.cats[ci]);
      if (ctx.measureText(lbl).width > slot * step - 4) {
        while (lbl.length > 1 && ctx.measureText(lbl + '…').width > slot * step - 4) lbl = lbl.slice(0, -1);
        lbl += '…';
      }
      ctx.fillText(lbl, x0 + slot * (ci + .5), y0 + 15);
    }

    if (o.chart === 'bar') {
      var sn = data.series.length;
      var groupW = slot * 0.72, barW = groupW / sn;
      for (var s2 = 0; s2 < sn; s2++) {
        ctx.fillStyle = data.series[s2].color;
        for (var i2 = 0; i2 < n; i2++) {
          var v = data.series[s2].values[i2];
          if (typeof v !== 'number') continue;
          var bx = x0 + slot * i2 + (slot - groupW) / 2 + barW * s2;
          var by = yOf(Math.max(v, 0)), bh = Math.abs(yOf(v) - yOf(0));
          ctx.fillRect(bx, by, Math.max(1, barW - 1), Math.max(1, bh));
        }
      }
    } else {
      for (var s3 = 0; s3 < data.series.length; s3++) {
        var ser = data.series[s3];
        var pts = [];
        for (var i3 = 0; i3 < n; i3++) {
          var vv = ser.values[i3];
          if (typeof vv !== 'number') continue;
          pts.push([x0 + slot * (i3 + .5), yOf(vv)]);
        }
        if (!pts.length) continue;
        if (o.chart === 'area') {
          ctx.beginPath();
          ctx.moveTo(pts[0][0], yOf(Math.max(min, 0)));
          pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
          ctx.lineTo(pts[pts.length - 1][0], yOf(Math.max(min, 0)));
          ctx.closePath();
          ctx.globalAlpha = .35; ctx.fillStyle = ser.color; ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        pts.forEach(function (p, idx) { idx ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
        ctx.strokeStyle = ser.color; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = ser.color;
        pts.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, Math.PI * 2); ctx.fill(); });
      }
    }
    ctx.restore();
  }

  function drawPie(ctx, data, W, H, top, legendH) {
    var ser = data.series[0];
    var vals = ser.values.map(function (v) { return typeof v === 'number' && v > 0 ? v : 0; });
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    if (!total) { ctx.textAlign = 'center'; ctx.fillStyle = '#7a848d'; ctx.fillText('正の数値がありません', W / 2, H / 2); return; }
    var cx = W / 2, cy = top + (H - top - legendH) / 2;
    var R = Math.max(20, Math.min(W, H - top - legendH) / 2 - 24);
    var ang = -Math.PI / 2;
    ctx.font = '11px "Yu Gothic UI",Meiryo,sans-serif';
    for (var i = 0; i < vals.length; i++) {
      if (!vals[i]) continue;
      var a2 = ang + vals[i] / total * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, ang, a2); ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length]; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      var mid = (ang + a2) / 2;
      var pct = vals[i] / total;
      if (pct > 0.045) {
        var lx = cx + Math.cos(mid) * R * 0.68, ly = cy + Math.sin(mid) * R * 0.68;
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.fillText(Math.round(pct * 100) + '%', lx, ly + 4);
      }
      ang = a2;
    }
    // 項目名の凡例 (円グラフは項目ごと)
    ctx.textAlign = 'left';
    var ly2 = H - 8, lx2 = 8, cw = 0;
    ctx.save();
    ctx.font = '10px "Yu Gothic UI",Meiryo,sans-serif';
    for (var j = 0; j < data.cats.length && j < 12; j++) {
      var t = String(data.cats[j]);
      var tw = 12 + ctx.measureText(t).width + 10;
      if (lx2 + tw > W - 6) break;
      ctx.fillStyle = PALETTE[j % PALETTE.length];
      ctx.fillRect(lx2, ly2 - 8, 8, 8);
      ctx.fillStyle = '#404040';
      ctx.fillText(t, lx2 + 12, ly2);
      lx2 += tw;
    }
    ctx.restore();
  }

  function niceTicks(min, max, count) {
    var span = max - min;
    if (span <= 0) span = 1;
    var raw = span / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var stepN = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    var step = stepN * mag;
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var out = [];
    for (var v = lo; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1e10) / 1e10);
    return out;
  }
  function fmtTick(v) {
    if (Math.abs(v) >= 1e7) return (v / 1e6) + 'M';
    return U.generalFormat(Math.round(v * 1e6) / 1e6).replace(/\B(?=(\d{3})+(?!\d))/g, function (m, o2, s) { return ','; });
  }

  /* =========================================================
     ラスタライズ (xlsx 出力用に PNG dataURL 化)
     ========================================================= */
  function rasterize(o, sheet) {
    if (o.type === 'image') return Promise.resolve(o.src);
    var dpr = 2;
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(o.w * dpr));
    cv.height = Math.max(1, Math.round(o.h * dpr));

    if (o.type === 'chart') {
      drawChart(cv, o, sheet || (window.App && App.wb ? App.wb.sheet() : null), dpr);
      return Promise.resolve(cv.toDataURL('image/png'));
    }
    if (o.type === 'textbox' || o.type === 'note') {
      var ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      var s = o.st || {};
      ctx.fillStyle = s.bg || '#ffffff';
      ctx.fillRect(0, 0, o.w, o.h);
      ctx.strokeStyle = s.bd || '#8c96a0'; ctx.lineWidth = 1;
      ctx.strokeRect(.5, .5, o.w - 1, o.h - 1);
      ctx.fillStyle = s.fc || '#000';
      var fs = s.fs || 12;
      ctx.font = (s.b ? 'bold ' : '') + (s.i ? 'italic ' : '') + fs + 'px "Yu Gothic UI",Meiryo,sans-serif';
      ctx.textBaseline = 'top';
      wrapText(ctx, o.text || '', 6, 5, o.w - 12, fs * 1.35, s.ha || 'left', o.w - 12);
      return Promise.resolve(cv.toDataURL('image/png'));
    }
    if (o.type === 'shape') {
      var c3 = cv.getContext('2d');
      c3.scale(dpr, dpr);
      drawShapeCanvas(c3, o);
      return Promise.resolve(cv.toDataURL('image/png'));
    }
    return Promise.resolve(null);
  }

  /* 図形を Canvas に直接描画 (xlsx 出力用) */
  function drawShapeCanvas(ctx, o) {
    var s = o.st || {}, w = o.w, h = o.h, sw = s.sw || 2, p = sw / 2 + 1;
    var fill = s.fill && s.fill !== 'none' ? s.fill : null;
    var stroke = s.stroke || '#2f5597';
    ctx.lineWidth = sw;
    ctx.strokeStyle = stroke;
    ctx.lineCap = 'round';
    if (o.shape === 'rect') {
      var r = 3, x = p, y = p, ww = Math.max(1, w - p * 2), hh = Math.max(1, h - p * 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + ww - r, y); ctx.quadraticCurveTo(x + ww, y, x + ww, y + r);
      ctx.lineTo(x + ww, y + hh - r); ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
      ctx.lineTo(x + r, y + hh); ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.stroke();
    } else if (o.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, Math.max(1, w / 2 - p), Math.max(1, h / 2 - p), 0, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.stroke();
    } else if (o.shape === 'line' || o.shape === 'arrow') {
      var x1 = p, y1 = h - p, x2 = w - p, y2 = p;
      if (o.shape === 'arrow') { x2 = w - p * 3; }
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (o.shape === 'arrow') {
        var ang = Math.atan2(y2 - y1, x2 - x1), hl = 6 + sw * 2;
        ctx.beginPath();
        ctx.moveTo(x2 + Math.cos(ang) * hl, y2 + Math.sin(ang) * hl);
        ctx.lineTo(x2 + Math.cos(ang + 2.5) * hl, y2 + Math.sin(ang + 2.5) * hl);
        ctx.lineTo(x2 + Math.cos(ang - 2.5) * hl, y2 + Math.sin(ang - 2.5) * hl);
        ctx.closePath();
        ctx.fillStyle = stroke; ctx.fill();
      }
    }
    if (o.text) {
      ctx.fillStyle = s.fc || '#1b1f23';
      var fs = s.fs || 12;
      ctx.font = fs + 'px "Yu Gothic UI",Meiryo,sans-serif';
      ctx.textBaseline = 'top';
      var lines = String(o.text).split('\n');
      var y0 = (h - lines.length * fs * 1.35) / 2;
      lines.forEach(function (ln, i) {
        ctx.fillText(ln, (w - ctx.measureText(ln).width) / 2, y0 + i * fs * 1.35);
      });
    }
  }

  function wrapText(ctx, text, x, y, maxW, lineH, align, boxW) {
    var paras = String(text).split('\n');
    for (var p = 0; p < paras.length; p++) {
      var line = '';
      var chars = paras[p].split('');
      var lines = [];
      for (var i = 0; i < chars.length; i++) {
        var test = line + chars[i];
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = chars[i]; }
        else line = test;
      }
      lines.push(line);
      for (var l = 0; l < lines.length; l++) {
        var lx = x;
        if (align === 'center') lx = x + (boxW - ctx.measureText(lines[l]).width) / 2;
        else if (align === 'right') lx = x + boxW - ctx.measureText(lines[l]).width;
        ctx.fillText(lines[l], lx, y);
        y += lineH;
      }
    }
  }

  /* 画像ファイル -> dataURL + 自然サイズ */
  function loadImageFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var maxW = 520, maxH = 400;
          var sc = Math.min(1, maxW / w, maxH / h);
          resolve({ src: fr.result, w: Math.round(w * sc), h: Math.round(h * sc) });
        };
        img.onerror = function () { resolve({ src: fr.result, w: 240, h: 180 }); };
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  return {
    PALETTE: PALETTE,
    makeImage: makeImage, makeTextbox: makeTextbox, makeNote: makeNote,
    makeShape: makeShape, makeChart: makeChart,
    createEl: createEl, syncEl: syncEl,
    chartData: chartData, drawChart: drawChart,
    rasterize: rasterize, loadImageFile: loadImageFile
  };
})();
