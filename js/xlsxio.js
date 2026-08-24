/* ===== Exitcel : xlsxio.js =====
   ZIP の読み書き (ブラウザ標準 CompressionStream のみ使用) と
   .xlsx / .csv / .tsv / .html / .exl の入出力
*/
var IO = (function () {

  /* =========================================================
     CRC32
     ========================================================= */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var enc = new TextEncoder();
  var dec = new TextDecoder('utf-8');
  function str2u8(s) { return enc.encode(s); }
  function u82str(u) { return dec.decode(u); }

  async function deflateRaw(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      var cs = new CompressionStream('deflate-raw');
      var w = cs.writable.getWriter();
      w.write(u8); w.close();
      var ab = await new Response(cs.readable).arrayBuffer();
      return new Uint8Array(ab);
    } catch (e) { return null; }
  }
  async function inflateRaw(u8) {
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(u8); w.close();
    var ab = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(ab);
  }

  /* =========================================================
     ZIP 書き出し
     files: [{name, data(Uint8Array|string)}]
     ========================================================= */
  async function zipCreate(files) {
    var parts = [], central = [], offset = 0;

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var raw = (typeof f.data === 'string') ? str2u8(f.data) : f.data;
      var nameU8 = str2u8(f.name);
      var comp = f.store ? null : await deflateRaw(raw);
      var method = 0, body = raw;
      if (comp && comp.length < raw.length) { method = 8; body = comp; }
      var crc = crc32(raw);

      var lh = new Uint8Array(30 + nameU8.length);
      var dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);          // version needed
      dv.setUint16(6, 0x0800, true);      // UTF-8 flag
      dv.setUint16(8, method, true);
      dv.setUint16(10, 0, true);          // time
      dv.setUint16(12, 0x2821, true);     // date (2000-01-01)
      dv.setUint32(14, crc, true);
      dv.setUint32(18, body.length, true);
      dv.setUint32(22, raw.length, true);
      dv.setUint16(26, nameU8.length, true);
      dv.setUint16(28, 0, true);
      lh.set(nameU8, 30);

      parts.push(lh, body);

      var ch = new Uint8Array(46 + nameU8.length);
      var cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, method, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x2821, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, body.length, true);
      cv.setUint32(24, raw.length, true);
      cv.setUint16(28, nameU8.length, true);
      cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(nameU8, 46);
      central.push(ch);

      offset += lh.length + body.length;
    }

    var cdSize = 0;
    central.forEach(function (c) { cdSize += c.length; });
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, central.length, true);
    ev.setUint16(10, central.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(parts.concat(central, [eocd]), { type: 'application/zip' });
  }

  /* =========================================================
     ZIP 読み込み -> { name: Uint8Array }
     ========================================================= */
  async function zipRead(arrayBuffer) {
    var u8 = new Uint8Array(arrayBuffer);
    var dv = new DataView(arrayBuffer);
    // EOCD 探索
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP ファイルとして読み取れません');
    var count = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);

    var out = {}, p = cdOff;
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var cmtLen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = u82str(u8.subarray(p + 46, p + 46 + nameLen));
      // ローカルヘッダ
      var lnLen = dv.getUint16(lho + 26, true);
      var leLen = dv.getUint16(lho + 28, true);
      var dataStart = lho + 30 + lnLen + leLen;
      var body = u8.subarray(dataStart, dataStart + compSize);
      out[name] = { method: method, body: body };
      p += 46 + nameLen + extraLen + cmtLen;
    }
    var res = {};
    for (var k in out) {
      var e = out[k];
      res[k] = e.method === 8 ? await inflateRaw(e.body) : e.body.slice();
    }
    return res;
  }

  /* =========================================================
     XLSX 書き出し
     ========================================================= */
  var EMU = 9525;
  function xe(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // 制御文字を除去 (XML 不正文字)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }
  function colWidthChars(px) { return Math.round(((px - 5) / 7) * 100) / 100; }
  function chars2px(w) { return Math.round(w * 7 + 5); }

  var BORDER_STYLE_MAP = {
    thin: 'thin', medium: 'medium', thick: 'thick',
    dashed: 'dashed', dotted: 'dotted', double: 'double'
  };

  function buildStyles(wb) {
    var numFmts = [], numFmtMap = {}, nextFmtId = 164;
    var fonts = [], fontMap = {};
    var fills = [], fillMap = {};
    var borders = [], borderMap = {};
    var xfs = [], xfMap = {};

    function idxOf(list, map, key, make) {
      if (map.hasOwnProperty(key)) return map[key];
      var i = list.length; list.push(make()); map[key] = i; return i;
    }

    // 既定
    fonts.push('<font><sz val="11"/><color theme="1"/><name val="Yu Gothic UI"/><family val="2"/></font>');
    fontMap['default'] = 0;
    fills.push('<fill><patternFill patternType="none"/></fill>');
    fills.push('<fill><patternFill patternType="gray125"/></fill>');
    fillMap['none'] = 0;
    borders.push('<border><left/><right/><top/><bottom/><diagonal/></border>');
    borderMap['none'] = 0;

    function fontIdx(s) {
      var key = [s.b ? 1 : 0, s.i ? 1 : 0, s.u ? 1 : 0, s.st ? 1 : 0, s.fs || 11, s.ff || 'Yu Gothic UI', s.fc || ''].join('|');
      return idxOf(fonts, fontMap, key, function () {
        var x = '<font>';
        if (s.b) x += '<b/>';
        if (s.i) x += '<i/>';
        if (s.st) x += '<strike/>';
        if (s.u) x += '<u/>';
        x += '<sz val="' + (s.fs || 11) + '"/>';
        x += s.fc ? '<color rgb="' + U.hexToARGB(s.fc) + '"/>' : '<color theme="1"/>';
        x += '<name val="' + xe(s.ff || 'Yu Gothic UI') + '"/><family val="2"/></font>';
        return x;
      });
    }
    function fillIdx(s) {
      if (!s.bg) return 0;
      return idxOf(fills, fillMap, s.bg, function () {
        return '<fill><patternFill patternType="solid"><fgColor rgb="' + U.hexToARGB(s.bg) +
          '"/><bgColor indexed="64"/></patternFill></fill>';
      });
    }
    function borderIdx(s) {
      if (!s.bd) return 0;
      var b = s.bd;
      var key = ['l', 'r', 't', 'b'].map(function (k) {
        return b[k] ? (b[k].s || 'thin') + ':' + (b[k].c || '#000000') : '-';
      }).join('|');
      if (key === '-|-|-|-') return 0;
      return idxOf(borders, borderMap, key, function () {
        function side(tag, d) {
          if (!d) return '<' + tag + '/>';
          var st = BORDER_STYLE_MAP[d.s] || 'thin';
          return '<' + tag + ' style="' + st + '"><color rgb="' + U.hexToARGB(d.c || '#000000') + '"/></' + tag + '>';
        }
        return '<border>' + side('left', b.l) + side('right', b.r) +
          side('top', b.t) + side('bottom', b.b) + '<diagonal/></border>';
      });
    }
    function numFmtIdx(s) {
      var f = s.nf;
      if (!f || f === 'General') return 0;
      var BUILTIN = { '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '0.00E+00': 11, '@': 49 };
      if (BUILTIN[f] !== undefined) return BUILTIN[f];
      if (numFmtMap.hasOwnProperty(f)) return numFmtMap[f];
      var id = nextFmtId++;
      numFmtMap[f] = id;
      numFmts.push('<numFmt numFmtId="' + id + '" formatCode="' + xe(f) + '"/>');
      return id;
    }

    xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
    xfMap['{}'] = 0;

    function styleIndex(s) {
      if (!s || M.isEmptyStyle(s)) return 0;
      var key = JSON.stringify([s.b, s.i, s.u, s.st, s.fs, s.ff, s.fc, s.bg, s.ha, s.va, s.wrap, s.nf, s.bd]);
      if (xfMap.hasOwnProperty(key)) return xfMap[key];
      var fi = fontIdx(s), li = fillIdx(s), bi = borderIdx(s), ni = numFmtIdx(s);
      var al = '';
      if (s.ha || s.va || s.wrap) {
        al = '<alignment' +
          (s.ha ? ' horizontal="' + s.ha + '"' : '') +
          (s.va ? ' vertical="' + (s.va === 'middle' ? 'center' : s.va) + '"' : '') +
          (s.wrap ? ' wrapText="1"' : '') + '/>';
      }
      var xf = '<xf numFmtId="' + ni + '" fontId="' + fi + '" fillId="' + li + '" borderId="' + bi + '" xfId="0"' +
        (ni ? ' applyNumberFormat="1"' : '') + (fi ? ' applyFont="1"' : '') +
        (li ? ' applyFill="1"' : '') + (bi ? ' applyBorder="1"' : '') +
        (al ? ' applyAlignment="1"' : '') + (al ? '>' + al + '</xf>' : '/>');
      var idx = xfs.length; xfs.push(xf); xfMap[key] = idx;
      return idx;
    }

    return {
      styleIndex: styleIndex,
      xml: function () {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts>' : '') +
          '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
          '<fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
          '<borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
          '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
          '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
          '</styleSheet>';
      }
    };
  }

  function dataURLtoU8(dataURL) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataURL);
    if (!m) return { mime: 'image/png', data: new Uint8Array(0) };
    var mime = m[1] || 'image/png';
    if (m[2]) {
      var bin = atob(m[3]);
      var u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return { mime: mime, data: u };
    }
    return { mime: mime, data: str2u8(decodeURIComponent(m[3])) };
  }
  function extOfMime(m) {
    if (/jpe?g/.test(m)) return 'jpeg';
    if (/gif/.test(m)) return 'gif';
    if (/bmp/.test(m)) return 'bmp';
    if (/svg/.test(m)) return 'svg';
    return 'png';
  }

  async function exportXlsx(wb) {
    var st = buildStyles(wb);
    var files = [];
    var media = [];          // {name, mime, data}
    var mediaSeen = {};
    var sheetDrawings = [];  // シート index -> drawing xml or null

    /* --- 各シート --- */
    var sheetXmls = [];
    for (var si = 0; si < wb.sheets.length; si++) {
      var sh = wb.sheets[si];
      var used = sh.usedRange();
      var maxR = used.empty ? 0 : used.r2, maxC = used.empty ? 0 : used.c2;

      var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      x += '<dimension ref="A1:' + U.a1(maxR, maxC) + '"/>';
      var paneXml = '';
      if (sh.freeze && (sh.freeze.r || sh.freeze.c)) {
        var top = U.a1(sh.freeze.r, sh.freeze.c);
        paneXml = '<pane xSplit="' + sh.freeze.c + '" ySplit="' + sh.freeze.r + '" topLeftCell="' + top +
          '" activePane="bottomRight" state="frozen"/>';
      }
      x += '<sheetViews><sheetView' + (si === wb.active ? ' tabSelected="1"' : '') +
        ' workbookViewId="0">' + paneXml + '</sheetView></sheetViews>';
      x += '<sheetFormatPr defaultRowHeight="16.5"/>';

      var colKeys = Object.keys(sh.colW);
      if (colKeys.length) {
        colKeys.sort(function (a, b) { return a - b; });
        x += '<cols>';
        colKeys.forEach(function (ck) {
          var c = +ck + 1;
          x += '<col min="' + c + '" max="' + c + '" width="' + colWidthChars(sh.colW[ck]) + '" customWidth="1"/>';
        });
        x += '</cols>';
      }

      x += '<sheetData>';
      // 行ごとにまとめる
      var byRow = {};
      for (var k in sh.cells) {
        var pp = k.split(':'), rr = +pp[0], cc = +pp[1];
        (byRow[rr] = byRow[rr] || []).push(cc);
      }
      var rowKeys = Object.keys(byRow).map(Number);
      Object.keys(sh.rowH).forEach(function (rk) { if (rowKeys.indexOf(+rk) < 0) rowKeys.push(+rk); });
      rowKeys.sort(function (a, b) { return a - b; });

      for (var ri = 0; ri < rowKeys.length; ri++) {
        var r = rowKeys[ri];
        var cols = (byRow[r] || []).sort(function (a, b) { return a - b; });
        var ht = sh.rowH[r];
        x += '<row r="' + (r + 1) + '"' + (ht ? ' ht="' + (Math.round(ht * 0.75 * 100) / 100) + '" customHeight="1"' : '') + '>';
        for (var ci = 0; ci < cols.length; ci++) {
          var c = cols[ci];
          var cell = sh.cells[r + ':' + c];
          if (!cell) continue;
          var sIdx = st.styleIndex(cell.s);
          var val = cell.f ? cell.cv : cell.v;
          var ref = U.a1(r, c);
          if (val === null && !cell.f && !sIdx) continue;
          var attrs = ' r="' + ref + '"' + (sIdx ? ' s="' + sIdx + '"' : '');
          var inner = '', t = '';
          if (cell.f) inner += '<f>' + xe(cell.f) + '</f>';
          if (val === null || val === undefined || val === '') {
            // 値なし
          } else if (F.isErr(val)) {
            t = ' t="e"'; inner += '<v>' + xe(val.err) + '</v>';
          } else if (typeof val === 'number') {
            inner += '<v>' + (isFinite(val) ? val : 0) + '</v>';
          } else if (typeof val === 'boolean') {
            t = ' t="b"'; inner += '<v>' + (val ? 1 : 0) + '</v>';
          } else {
            if (cell.f) { t = ' t="str"'; inner += '<v>' + xe(val) + '</v>'; }
            else { t = ' t="inlineStr"'; inner += '<is><t xml:space="preserve">' + xe(val) + '</t></is>'; }
          }
          x += '<c' + attrs + t + '>' + inner + '</c>';
        }
        x += '</row>';
      }
      x += '</sheetData>';

      if (sh.merges.length) {
        x += '<mergeCells count="' + sh.merges.length + '">';
        sh.merges.forEach(function (m) {
          x += '<mergeCell ref="' + U.a1(m.r1, m.c1) + ':' + U.a1(m.r2, m.c2) + '"/>';
        });
        x += '</mergeCells>';
      }
      x += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';

      /* --- 図形/画像 --- */
      var drawObjs = [];
      for (var oi = 0; oi < sh.objects.length; oi++) {
        var o = sh.objects[oi];
        var dataURL = await OBJ.rasterize(o, sh);
        if (!dataURL) continue;
        drawObjs.push({ o: o, dataURL: dataURL });
      }
      if (drawObjs.length) {
        x += '<drawing r:id="rId1"/>';
        var dxml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
          ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
          ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
        var drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        for (var di = 0; di < drawObjs.length; di++) {
          var d = drawObjs[di];
          var conv = dataURLtoU8(d.dataURL);
          var mkey = d.dataURL;
          var mname;
          if (mediaSeen[mkey]) mname = mediaSeen[mkey];
          else {
            mname = 'image' + (media.length + 1) + '.' + extOfMime(conv.mime);
            media.push({ name: mname, mime: conv.mime, data: conv.data });
            mediaSeen[mkey] = mname;
          }
          var rid = 'rId' + (di + 1);
          drels += '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + mname + '"/>';
          var px = Math.round(d.o.x * EMU), py = Math.round(d.o.y * EMU);
          var pw = Math.round(d.o.w * EMU), ph = Math.round(d.o.h * EMU);
          dxml += '<xdr:absoluteAnchor><xdr:pos x="' + px + '" y="' + py + '"/><xdr:ext cx="' + pw + '" cy="' + ph + '"/>' +
            '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + (di + 2) + '" name="' + xe(d.o.name || ('図 ' + (di + 1))) + '"/>' +
            '<xdr:cNvPicPr><a:picLocks noChangeAspect="0"/></xdr:cNvPicPr></xdr:nvPicPr>' +
            '<xdr:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
            '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + pw + '" cy="' + ph + '"/></a:xfrm>' +
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>' +
            '<xdr:clientData/></xdr:absoluteAnchor>';
        }
        dxml += '</xdr:wsDr>';
        drels += '</Relationships>';
        sheetDrawings[si] = { xml: dxml, rels: drels };
      } else sheetDrawings[si] = null;

      x += '</worksheet>';
      sheetXmls.push(x);
    }

    /* --- workbook.xml --- */
    var wbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    wb.sheets.forEach(function (s, i) {
      wbXml += '<sheet name="' + xe(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    });
    wbXml += '</sheets></workbook>';

    var wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    wb.sheets.forEach(function (s, i) {
      wbRels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    });
    wbRels += '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    wbRels += '</Relationships>';

    /* --- [Content_Types].xml --- */
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="gif" ContentType="image/gif"/>' +
      '<Default Extension="bmp" ContentType="image/bmp"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
    wb.sheets.forEach(function (s, i) {
      ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      if (sheetDrawings[i]) {
        ct += '<Override PartName="/xl/drawings/drawing' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
      }
    });
    ct += '</Types>';

    var rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';

    var iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + xe(wb.name) + '</dc:title><dc:creator>Exitcel</dc:creator>' +
      '<cp:lastModifiedBy>Exitcel</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified>' +
      '</cp:coreProperties>';
    var app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"' +
      ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Application>Exitcel</Application></Properties>';

    files.push({ name: '[Content_Types].xml', data: ct });
    files.push({ name: '_rels/.rels', data: rootRels });
    files.push({ name: 'docProps/core.xml', data: core });
    files.push({ name: 'docProps/app.xml', data: app });
    files.push({ name: 'xl/workbook.xml', data: wbXml });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: wbRels });
    files.push({ name: 'xl/styles.xml', data: st.xml() });
    sheetXmls.forEach(function (sx, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sx });
      if (sheetDrawings[i]) {
        files.push({
          name: 'xl/worksheets/_rels/sheet' + (i + 1) + '.xml.rels',
          data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' + (i + 1) + '.xml"/>' +
            '</Relationships>'
        });
        files.push({ name: 'xl/drawings/drawing' + (i + 1) + '.xml', data: sheetDrawings[i].xml });
        files.push({ name: 'xl/drawings/_rels/drawing' + (i + 1) + '.xml.rels', data: sheetDrawings[i].rels });
      }
    });
    media.forEach(function (m) {
      files.push({ name: 'xl/media/' + m.name, data: m.data, store: true });
    });

    return await zipCreate(files);
  }

  /* =========================================================
     XLSX 読み込み
     ========================================================= */
  function parseXml(u8) {
    return new DOMParser().parseFromString(u82str(u8), 'application/xml');
  }
  function attr(el, n) { return el && el.getAttribute ? el.getAttribute(n) : null; }

  async function importXlsx(arrayBuffer) {
    var zf = await zipRead(arrayBuffer);

    /* 共有文字列 */
    var sst = [];
    if (zf['xl/sharedStrings.xml']) {
      var sdoc = parseXml(zf['xl/sharedStrings.xml']);
      var sis = sdoc.getElementsByTagName('si');
      for (var i = 0; i < sis.length; i++) {
        var ts = sis[i].getElementsByTagName('t'), s = '';
        for (var j = 0; j < ts.length; j++) {
          if (ts[j].parentNode && ts[j].parentNode.nodeName === 'rPh') continue;
          s += ts[j].textContent;
        }
        sst.push(s);
      }
    }

    /* スタイル */
    var styles = parseStyles(zf['xl/styles.xml'] ? parseXml(zf['xl/styles.xml']) : null);

    /* workbook + rels */
    var wdoc = parseXml(zf['xl/workbook.xml']);
    var relMap = {};
    if (zf['xl/_rels/workbook.xml.rels']) {
      var rdoc = parseXml(zf['xl/_rels/workbook.xml.rels']);
      var rs = rdoc.getElementsByTagName('Relationship');
      for (var q = 0; q < rs.length; q++) relMap[attr(rs[q], 'Id')] = attr(rs[q], 'Target');
    }

    var wb = new M.Workbook('ブック');
    wb.sheets = [];
    var sheetEls = wdoc.getElementsByTagName('sheet');
    for (var si = 0; si < sheetEls.length; si++) {
      var name = attr(sheetEls[si], 'name') || ('Sheet' + (si + 1));
      var rid = attr(sheetEls[si], 'r:id') || attr(sheetEls[si], 'id');
      var target = relMap[rid] || ('worksheets/sheet' + (si + 1) + '.xml');
      target = String(target).replace(/^\//, '').replace(/^xl\//, '');
      var path = 'xl/' + target;
      if (!zf[path]) path = 'xl/worksheets/sheet' + (si + 1) + '.xml';
      if (!zf[path]) continue;
      var sh = new M.Sheet(name);
      parseSheet(zf, path, sh, sst, styles);
      await parseDrawings(zf, path, sh);
      wb.sheets.push(sh);
    }
    if (!wb.sheets.length) wb.sheets.push(new M.Sheet('Sheet1'));
    wb.active = 0;
    return wb;
  }

  function parseStyles(doc) {
    var res = { xfs: [] };
    if (!doc) return res;
    var numFmts = {};
    var nfEls = doc.getElementsByTagName('numFmt');
    for (var i = 0; i < nfEls.length; i++) numFmts[attr(nfEls[i], 'numFmtId')] = attr(nfEls[i], 'formatCode');
    var BUILTIN = {
      '0': 'General', '1': '0', '2': '0.00', '3': '#,##0', '4': '#,##0.00',
      '9': '0%', '10': '0.00%', '11': '0.00E+00', '14': 'yyyy/mm/dd', '15': 'd-mmm-yy',
      '16': 'd-mmm', '17': 'mmm-yy', '18': 'h:mm AM/PM', '19': 'h:mm:ss AM/PM',
      '20': 'hh:mm', '21': 'hh:mm:ss', '22': 'yyyy/mm/dd hh:mm', '37': '#,##0;-#,##0',
      '38': '#,##0;[Red]-#,##0', '39': '#,##0.00;-#,##0.00', '40': '#,##0.00;[Red]-#,##0.00',
      '45': 'mm:ss', '46': '[h]:mm:ss', '47': 'mm:ss.0', '48': '##0.0E+0', '49': '@'
    };

    function colorOf(el) {
      if (!el) return null;
      var c = el.getElementsByTagName('color')[0];
      if (!c) return null;
      var rgb = attr(c, 'rgb');
      if (rgb) return U.argbToHex(rgb);
      var idx = attr(c, 'indexed');
      if (idx === '64' || idx === '65') return null;
      return null;
    }

    var fonts = [], fEls = (doc.getElementsByTagName('fonts')[0] || { children: [] });
    var fList = fEls.getElementsByTagName ? fEls.getElementsByTagName('font') : [];
    for (i = 0; i < fList.length; i++) {
      var f = fList[i];
      fonts.push({
        b: !!f.getElementsByTagName('b').length,
        i: !!f.getElementsByTagName('i').length,
        u: !!f.getElementsByTagName('u').length,
        st: !!f.getElementsByTagName('strike').length,
        fs: parseFloat(attr(f.getElementsByTagName('sz')[0], 'val') || 11),
        ff: attr(f.getElementsByTagName('name')[0], 'val') || null,
        fc: colorOf(f)
      });
    }
    var fills = [], flEl = doc.getElementsByTagName('fills')[0];
    var flList = flEl ? flEl.getElementsByTagName('fill') : [];
    for (i = 0; i < flList.length; i++) {
      var pf = flList[i].getElementsByTagName('patternFill')[0];
      var bg = null;
      if (pf && attr(pf, 'patternType') === 'solid') {
        var fg = pf.getElementsByTagName('fgColor')[0];
        if (fg) {
          var rgb2 = attr(fg, 'rgb');
          if (rgb2) bg = U.argbToHex(rgb2);
        }
      }
      fills.push(bg);
    }
    var borders = [], bEl = doc.getElementsByTagName('borders')[0];
    var bList = bEl ? bEl.getElementsByTagName('border') : [];
    for (i = 0; i < bList.length; i++) {
      var bd = {}, any = false;
      ['left', 'right', 'top', 'bottom'].forEach(function (side) {
        var e = bList[i].getElementsByTagName(side)[0];
        var stv = e ? attr(e, 'style') : null;
        if (stv) {
          any = true;
          var key = side === 'left' ? 'l' : side === 'right' ? 'r' : side === 'top' ? 't' : 'b';
          var cc = e.getElementsByTagName('color')[0];
          bd[key] = { s: /double/.test(stv) ? 'double' : /dash/.test(stv) ? 'dashed' : /dot|hair/.test(stv) ? 'dotted' : /thick/.test(stv) ? 'thick' : /medium/.test(stv) ? 'medium' : 'thin',
                      c: (cc && attr(cc, 'rgb')) ? U.argbToHex(attr(cc, 'rgb')) : '#000000' };
        }
      });
      borders.push(any ? bd : null);
    }

    var cxEl = doc.getElementsByTagName('cellXfs')[0];
    var xfList = cxEl ? cxEl.getElementsByTagName('xf') : [];
    for (i = 0; i < xfList.length; i++) {
      var xf = xfList[i];
      var s = {};
      var fid = parseInt(attr(xf, 'fontId') || 0, 10);
      var lid = parseInt(attr(xf, 'fillId') || 0, 10);
      var bid = parseInt(attr(xf, 'borderId') || 0, 10);
      var nid = attr(xf, 'numFmtId') || '0';
      var fo = fonts[fid];
      if (fo) {
        if (fo.b) s.b = true; if (fo.i) s.i = true; if (fo.u) s.u = true; if (fo.st) s.st = true;
        if (fo.fs && fo.fs !== 11) s.fs = fo.fs;
        if (fo.ff) s.ff = fo.ff;
        if (fo.fc && fo.fc !== '#000000') s.fc = fo.fc;
      }
      if (fills[lid]) s.bg = fills[lid];
      if (borders[bid]) s.bd = borders[bid];
      var code = numFmts[nid] || BUILTIN[nid];
      if (code && code !== 'General') s.nf = code;
      var al = xf.getElementsByTagName('alignment')[0];
      if (al) {
        var h = attr(al, 'horizontal'), v = attr(al, 'vertical');
        if (h && /left|center|right/.test(h)) s.ha = h;
        if (v) s.va = (v === 'center' ? 'middle' : (v === 'top' ? 'top' : 'bottom'));
        if (attr(al, 'wrapText') === '1') s.wrap = true;
      }
      res.xfs.push(M.isEmptyStyle(s) ? null : s);
    }
    return res;
  }

  function parseSheet(zf, path, sh, sst, styles) {
    var doc = parseXml(zf[path]);

    var colEls = doc.getElementsByTagName('col');
    for (var i = 0; i < colEls.length; i++) {
      var mn = parseInt(attr(colEls[i], 'min'), 10), mx = parseInt(attr(colEls[i], 'max'), 10);
      var w = parseFloat(attr(colEls[i], 'width'));
      if (!isFinite(w)) continue;
      mx = Math.min(mx, mn + 200);
      for (var c = mn; c <= mx; c++) sh.colW[c - 1] = chars2px(w);
    }

    var pane = doc.getElementsByTagName('pane')[0];
    if (pane && attr(pane, 'state') === 'frozen') {
      sh.freeze = { r: parseInt(attr(pane, 'ySplit') || 0, 10), c: parseInt(attr(pane, 'xSplit') || 0, 10) };
    }

    var rows = doc.getElementsByTagName('row');
    var maxR = 0, maxC = 0;
    for (var ri = 0; ri < rows.length; ri++) {
      var rowEl = rows[ri];
      var r = parseInt(attr(rowEl, 'r'), 10) - 1;
      if (!(r >= 0)) continue;
      var ht = attr(rowEl, 'ht');
      if (ht && attr(rowEl, 'customHeight') === '1') sh.rowH[r] = Math.round(parseFloat(ht) / 0.75);
      if (r > maxR) maxR = r;
      var cs = rowEl.getElementsByTagName('c');
      for (var ci = 0; ci < cs.length; ci++) {
        var cEl = cs[ci];
        var ref = attr(cEl, 'r');
        var pos = ref ? U.parseA1(ref) : { r: r, c: ci };
        if (!pos) continue;
        if (pos.c > maxC) maxC = pos.c;
        var t = attr(cEl, 't') || 'n';
        var sIdx = parseInt(attr(cEl, 's') || 0, 10);
        var fEl = cEl.getElementsByTagName('f')[0];
        var vEl = cEl.getElementsByTagName('v')[0];
        var val = null;

        if (t === 'inlineStr') {
          var isEl = cEl.getElementsByTagName('is')[0];
          val = isEl ? isEl.textContent : '';
        } else if (t === 's') {
          val = sst[parseInt(vEl ? vEl.textContent : '0', 10)] || '';
        } else if (t === 'b') {
          val = (vEl ? vEl.textContent : '0') === '1';
        } else if (t === 'e') {
          val = F.err(vEl ? vEl.textContent : '#VALUE!');
        } else if (t === 'str') {
          val = vEl ? vEl.textContent : '';
        } else {
          val = vEl ? parseFloat(vEl.textContent) : null;
          if (val !== null && isNaN(val)) val = null;
        }

        var style = styles.xfs[sIdx] ? M.cloneStyle(styles.xfs[sIdx]) : null;
        var formula = null;
        if (fEl && !attr(fEl, 't')) formula = fEl.textContent;
        else if (fEl && attr(fEl, 't') === 'shared' && fEl.textContent) formula = fEl.textContent;

        if (val === null && !formula && !style) continue;
        sh.cells[pos.r + ':' + pos.c] = {
          v: formula ? null : val, f: formula, s: style, cv: formula ? val : null
        };
      }
    }
    sh.rows = Math.max(300, maxR + 40);
    sh.cols = Math.max(40, maxC + 8);

    var mcs = doc.getElementsByTagName('mergeCell');
    for (var mi = 0; mi < mcs.length; mi++) {
      var rg = U.parseRange(attr(mcs[mi], 'ref') || '');
      if (rg) sh.merges.push(rg);
    }
  }

  async function parseDrawings(zf, sheetPath, sh) {
    var relPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
    if (!zf[relPath]) return;
    var rdoc = parseXml(zf[relPath]);
    var rs = rdoc.getElementsByTagName('Relationship');
    var drawTarget = null;
    for (var i = 0; i < rs.length; i++) {
      if (/drawing$/.test(attr(rs[i], 'Type') || '')) drawTarget = attr(rs[i], 'Target');
    }
    if (!drawTarget) return;
    var dpath = normalizePath('xl/worksheets/', drawTarget);
    if (!zf[dpath]) return;
    var ddoc = parseXml(zf[dpath]);

    // drawing の rels
    var dRelPath = dpath.replace(/([^/]+)$/, '_rels/$1.rels');
    var imgMap = {};
    if (zf[dRelPath]) {
      var drd = parseXml(zf[dRelPath]);
      var drs = drd.getElementsByTagName('Relationship');
      for (var j = 0; j < drs.length; j++) {
        imgMap[attr(drs[j], 'Id')] = normalizePath('xl/drawings/', attr(drs[j], 'Target'));
      }
    }

    var anchors = [];
    ['absoluteAnchor', 'oneCellAnchor', 'twoCellAnchor'].forEach(function (kind) {
      var els = ddoc.getElementsByTagName('xdr:' + kind);
      if (!els.length) els = ddoc.getElementsByTagName(kind);
      for (var k = 0; k < els.length; k++) anchors.push({ kind: kind, el: els[k] });
    });

    for (var a = 0; a < anchors.length; a++) {
      var an = anchors[a], el = an.el;
      var blip = el.getElementsByTagName('a:blip')[0] || el.getElementsByTagName('blip')[0];
      if (!blip) continue;
      var embed = blip.getAttribute('r:embed') || blip.getAttribute('embed');
      var mediaPath = imgMap[embed];
      if (!mediaPath || !zf[mediaPath]) continue;

      var pos = anchorPos(el, an.kind, sh);
      var mime = mimeOfPath(mediaPath);
      var dataURL = 'data:' + mime + ';base64,' + base64(zf[mediaPath]);
      sh.objects.push({
        id: U.uid(), type: 'image', src: dataURL,
        x: pos.x, y: pos.y, w: pos.w, h: pos.h, name: '図'
      });
    }
  }
  function tagVal(parent, names) {
    for (var i = 0; i < names.length; i++) {
      var e = parent.getElementsByTagName(names[i])[0];
      if (e) return e;
    }
    return null;
  }
  function anchorPos(el, kind, sh) {
    function colX(c, off) {
      var x = 0;
      for (var i = 0; i < c; i++) x += sh.colWidth(i);
      return x + (off || 0) / EMU;
    }
    function rowY(r, off) {
      var y = 0;
      for (var i = 0; i < r; i++) y += sh.rowHeight(i);
      return y + (off || 0) / EMU;
    }
    if (kind === 'absoluteAnchor') {
      var p = tagVal(el, ['xdr:pos', 'pos']);
      var e = tagVal(el, ['xdr:ext', 'ext']);
      return {
        x: p ? +p.getAttribute('x') / EMU : 20, y: p ? +p.getAttribute('y') / EMU : 20,
        w: e ? +e.getAttribute('cx') / EMU : 200, h: e ? +e.getAttribute('cy') / EMU : 150
      };
    }
    var from = tagVal(el, ['xdr:from', 'from']);
    var fx = 0, fy = 0;
    if (from) {
      var col = tagVal(from, ['xdr:col', 'col']), colOff = tagVal(from, ['xdr:colOff', 'colOff']);
      var row = tagVal(from, ['xdr:row', 'row']), rowOff = tagVal(from, ['xdr:rowOff', 'rowOff']);
      fx = colX(col ? +col.textContent : 0, colOff ? +colOff.textContent : 0);
      fy = rowY(row ? +row.textContent : 0, rowOff ? +rowOff.textContent : 0);
    }
    if (kind === 'oneCellAnchor') {
      var e2 = tagVal(el, ['xdr:ext', 'ext']);
      return { x: fx, y: fy, w: e2 ? +e2.getAttribute('cx') / EMU : 200, h: e2 ? +e2.getAttribute('cy') / EMU : 150 };
    }
    var to = tagVal(el, ['xdr:to', 'to']);
    var tx = fx + 200, ty = fy + 150;
    if (to) {
      var col2 = tagVal(to, ['xdr:col', 'col']), colOff2 = tagVal(to, ['xdr:colOff', 'colOff']);
      var row2 = tagVal(to, ['xdr:row', 'row']), rowOff2 = tagVal(to, ['xdr:rowOff', 'rowOff']);
      tx = colX(col2 ? +col2.textContent : 0, colOff2 ? +colOff2.textContent : 0);
      ty = rowY(row2 ? +row2.textContent : 0, rowOff2 ? +rowOff2.textContent : 0);
    }
    return { x: fx, y: fy, w: Math.max(20, tx - fx), h: Math.max(20, ty - fy) };
  }
  function normalizePath(base, target) {
    if (!target) return '';
    if (target.charAt(0) === '/') return target.slice(1);
    var parts = (base + target).split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '.' || parts[i] === '') { if (i === parts.length - 1) out.push(parts[i]); continue; }
      if (parts[i] === '..') { out.pop(); continue; }
      out.push(parts[i]);
    }
    return out.join('/');
  }
  function mimeOfPath(p) {
    if (/\.jpe?g$/i.test(p)) return 'image/jpeg';
    if (/\.gif$/i.test(p)) return 'image/gif';
    if (/\.bmp$/i.test(p)) return 'image/bmp';
    if (/\.svg$/i.test(p)) return 'image/svg+xml';
    return 'image/png';
  }
  function base64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return btoa(s);
  }

  /* =========================================================
     CSV / TSV / HTML
     ========================================================= */
  function sheetToDelimited(sh, sep) {
    var used = sh.usedRange();
    if (used.empty) return '';
    var lines = [];
    for (var r = 0; r <= used.r2; r++) {
      var row = [];
      for (var c = 0; c <= used.c2; c++) {
        var cell = sh.get(r, c);
        var v = cell ? (cell.f ? cell.cv : cell.v) : null;
        var txt = U.formatValue(v, cell && cell.s ? cell.s.nf : null);
        row.push(U.csvEscape(txt, sep));
      }
      lines.push(row.join(sep));
    }
    return lines.join('\r\n');
  }

  function sheetToHtml(wb) {
    var h = '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>' + U.esc(wb.name) + '</title>' +
      '<style>body{font:13px "Yu Gothic UI",Meiryo,sans-serif;padding:20px}' +
      'h2{font-size:15px;color:#217346;border-bottom:2px solid #217346;padding-bottom:4px}' +
      'table{border-collapse:collapse;margin-bottom:28px}' +
      'td{border:1px solid #d0d7de;padding:3px 6px;white-space:pre;vertical-align:bottom}' +
      'img{max-width:100%}</style></head><body>';
    h += '<h1 style="font-size:18px">' + U.esc(wb.name) + '</h1>';
    wb.sheets.forEach(function (sh) {
      var used = sh.usedRange();
      h += '<h2>' + U.esc(sh.name) + '</h2><table>';
      if (!used.empty) {
        for (var r = 0; r <= used.r2; r++) {
          h += '<tr>';
          for (var c = 0; c <= used.c2; c++) {
            var m = sh.mergeAt(r, c);
            if (m && (m.r1 !== r || m.c1 !== c)) continue;
            var cell = sh.get(r, c);
            var v = cell ? (cell.f ? cell.cv : cell.v) : null;
            var s = cell && cell.s ? cell.s : {};
            var css = [];
            if (s.b) css.push('font-weight:700');
            if (s.i) css.push('font-style:italic');
            if (s.u || s.st) css.push('text-decoration:' + (s.u ? 'underline ' : '') + (s.st ? 'line-through' : ''));
            if (s.fs) css.push('font-size:' + s.fs + 'px');
            if (s.ff) css.push('font-family:"' + s.ff + '"');
            if (s.fc) css.push('color:' + s.fc);
            if (s.bg) css.push('background:' + s.bg);
            css.push('text-align:' + (s.ha || U.defaultAlign(v)));
            if (s.wrap) css.push('white-space:pre-wrap');
            var span = '';
            if (m) span = ' colspan="' + (m.c2 - m.c1 + 1) + '" rowspan="' + (m.r2 - m.r1 + 1) + '"';
            h += '<td' + span + ' style="' + css.join(';') + '">' +
              U.esc(U.formatValue(v, s.nf)) + '</td>';
          }
          h += '</tr>';
        }
      }
      h += '</table>';
      sh.objects.forEach(function (o) {
        if (o.type === 'image') h += '<img src="' + o.src + '" style="width:' + o.w + 'px">';
        else if (o.type === 'textbox' || o.type === 'note') h += '<div style="border:1px solid #999;padding:6px;margin:6px 0;white-space:pre-wrap;width:' + o.w + 'px">' + U.esc(o.text || '') + '</div>';
      });
    });
    h += '</body></html>';
    return h;
  }

  return {
    zipCreate: zipCreate, zipRead: zipRead,
    exportXlsx: exportXlsx, importXlsx: importXlsx,
    sheetToDelimited: sheetToDelimited, sheetToHtml: sheetToHtml,
    base64: base64
  };
})();
