/* ===== Exitcel QA : UI実機テストスイート（ブラウザで実行） =====
   使い方:
     1) qa/README.md の手順で http://localhost:8777/ を開く
     2) ブラウザの開発者ツール(F12) → コンソール に本ファイルの内容を貼り付ける
     3) await runUiSuite()            … 実行して結果を配列で返す
        await runUiSuite({post:true}) … collector.js(8778)へ結果をPOSTして保存

   本物のキーボードイベント・リボンのボタン・クリップボードイベントを発火させ、
   利用者と同じ操作経路でアプリを動かして判定する。
*/
window.runUiSuite = async function (opts) {
  opts = opts || {};
  const R = [];
  const t0 = performance.now();

  function rec(id, cat, view, tech, pre, step, exp, fn) {
    return Promise.resolve().then(async () => {
      let act;
      try { act = String(await fn()); } catch (e) { act = '例外: ' + e.message; }
      R.push({ id, cat, view, tech, pre, step, exp, act, status: (act.indexOf(exp) === 0 ? 'PASS' : 'FAIL') });
    });
  }

  /* --- 操作ヘルパ（すべて実アプリのAPI/DOMを経由する） --- */
  function reset() {
    const wb = App.wb; wb.sheets.length = 1;
    const s = wb.sheets[0];
    s.cells = {}; s.merges = []; s.objects = []; s.freeze = null; s.colW = {}; s.rowH = {};
    wb.active = 0; App.recalcAndRefresh();
  }
  function sel(a1) { const rc = U.parseA1(a1); Grid.setSel(rc.r, rc.c, rc.r, rc.c, rc.r, rc.c, true); }
  function selR(a1) { const r = U.parseRange(a1); Grid.setSel(r.r1, r.c1, r.r2, r.c2, r.r1, r.c1, true); }
  function input(a1, t, dir) { sel(a1); Grid.startEdit(''); Grid.editorValue(t); Grid.commitEdit(dir || 'down'); }
  function shown(a1, wbx) {
    const wb = wbx || App.wb, s = wb.sheets[wb.active || 0], rc = U.parseA1(a1);
    const c = s.get(rc.r, rc.c), v = s.displayValue(rc.r, rc.c);
    if (v && v.err) return v.err;
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    const nf = (c && c.s && c.s.nf) || 'General';
    return U.formatValue(v, nf);
  }
  function fx(a1, wbx) { const wb = wbx || App.wb, s = wb.sheets[wb.active || 0], rc = U.parseA1(a1), c = s.get(rc.r, rc.c); return c && c.f ? '=' + c.f : ''; }
  function key(k, o) { document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {}))); }
  function click(id) { document.getElementById(id).click(); }
  function cur() { const n = Grid.sel(); return U.a1(n.ar, n.ac); }
  function clip(type, dt) { document.dispatchEvent(new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true })); }

  reset();
  await rec('TC-U-001', 'UI操作', 'セル入力後Enterで1つ下のセルへ移動する', '状態遷移', 'A1を選択', 'A1に100を入力しEnter', 'A2', () => { input('A1', '100'); return cur(); });
  await rec('TC-U-002', 'UI操作', '入力した値がセルに表示される', '正常系', 'TC-U-001の続き', 'A1の表示を確認', '100', () => shown('A1'));
  await rec('TC-U-003', 'UI操作', '数式バーに選択セルの内容が表示される', '状態遷移', 'A1=100', 'A1を選択し数式バーを確認', '100', () => { sel('A1'); App.onSelectionChanged(); return document.getElementById('formulaInput').value; });
  await rec('TC-U-004', 'UI操作', '数式セルは計算結果を表示し数式バーには数式が出る', '状態遷移', 'A1=100', 'A2に=A1*2を入力しA2を選択', '200|=A1*2', () => { input('A2', '=A1*2'); sel('A2'); App.onSelectionChanged(); return shown('A2') + '|' + document.getElementById('formulaInput').value; });
  await rec('TC-U-005', 'UI操作', 'Ctrl+Zで直前の入力が取り消される', '状態遷移', 'A2==A1*2', 'Ctrl+Zを押す', '', () => { key('z', { ctrlKey: true }); return shown('A2'); });
  await rec('TC-U-006', 'UI操作', 'Ctrl+Yでやり直しできる', '状態遷移', 'TC-U-005の直後', 'Ctrl+Yを押す', '200', () => { key('y', { ctrlKey: true }); return shown('A2'); });
  await rec('TC-U-007', 'UI操作', 'Ctrl+Bで太字が適用される', '状態遷移', 'A1を選択', 'Ctrl+Bを押す', 'true', () => { sel('A1'); key('b', { ctrlKey: true }); const st = App.wb.sheets[0].styleOf(0, 0) || {}; return String(!!st.b); });
  await rec('TC-U-008', 'UI操作', 'Ctrl+Bをもう一度押すと太字が解除される', '状態遷移', 'A1が太字', 'Ctrl+Bを押す', 'false', () => { sel('A1'); key('b', { ctrlKey: true }); const st = App.wb.sheets[0].styleOf(0, 0) || {}; return String(!!st.b); });
  await rec('TC-U-009', 'UI操作', 'Deleteキーで選択範囲の内容が消える', '正常系', 'A1=100', 'A1でDeleteを押す', '', () => { sel('A1'); key('Delete'); return shown('A1'); });
  await rec('TC-U-010', 'UI操作', 'Ctrl+↓でデータの終端へ移動する', '状態遷移', 'A1:A5に値', 'A1でCtrl+↓', 'A5', () => { reset(); ['1', '2', '3', '4', '5'].forEach((v, i) => input('A' + (i + 1), v)); sel('A1'); key('ArrowDown', { ctrlKey: true }); return cur(); });
  await rec('TC-U-011', 'UI操作', 'セルの結合ができる', '正常系', 'A1:B1を選択', '結合ボタンを押す', '1件(0,0)-(0,1)', () => { reset(); input('A1', 'x'); selR('A1:B1'); click('btnMerge'); const m = App.wb.sheets[0].merges; return m.length + '件(' + m[0].r1 + ',' + m[0].c1 + ')-(' + m[0].r2 + ',' + m[0].c2 + ')'; });
  await rec('TC-U-012', 'UI操作', '結合を解除できる', '状態遷移', 'A1:B1が結合', 'もう一度結合ボタンを押す', '0件', () => { selR('A1:B1'); click('btnMerge'); return App.wb.sheets[0].merges.length + '件'; });
  await rec('TC-U-013', 'UI操作', 'すべて置換が実行できる', '正常系', 'A1:A3=りんご/みかん/りんご', '「りんご」を「ぶどう」に全置換', 'ぶどう/みかん/ぶどう', () => {
    reset(); input('A1', 'りんご'); input('A2', 'みかん'); input('A3', 'りんご'); selR('A1:A3');
    click('btnFind'); document.getElementById('findText').value = 'りんご'; document.getElementById('replText').value = 'ぶどう'; click('replAll'); App.closeModals();
    return [shown('A1'), shown('A2'), shown('A3')].join('/');
  });
  await rec('TC-U-014', 'UI操作', '昇順の並べ替えで行のまとまりが保たれる', '正常系', 'A列=3,1,2 / B列=c,a,b', 'A1:B3を選択し昇順ボタン', '1a/2b/3c', () => {
    reset(); input('A1', '3'); input('A2', '1'); input('A3', '2'); input('B1', 'c'); input('B2', 'a'); input('B3', 'b');
    selR('A1:B3'); click('btnSortAsc');
    return [shown('A1') + shown('B1'), shown('A2') + shown('B2'), shown('A3') + shown('B3')].join('/');
  });
  await rec('TC-U-015', 'データツール', '重複の削除で異なる行が誤って消えないこと', '境界値', 'A1="ab",B1="c" / A2="a",B2="bc"', 'A1:B2を選択し重複の削除', '2行とも残る', () => {
    reset(); input('A1', 'ab'); input('B1', 'c'); input('A2', 'a'); input('B2', 'bc'); selR('A1:B2'); click('btnDedup');
    const r1 = shown('A1') + '|' + shown('B1'), r2 = shown('A2') + '|' + shown('B2');
    return (r1 === 'ab|c' && r2 === 'a|bc') ? '2行とも残る' : '1行が消えた(' + r1 + ' / ' + r2 + ')';
  });
  await rec('TC-U-016', 'データツール', '重複の削除で完全一致行が削除される', '正常系', 'A1:B3に同一行を含む', 'A1:B3を選択し重複の削除', '残2行', () => {
    reset(); input('A1', 'x'); input('B1', '1'); input('A2', 'x'); input('B2', '1'); input('A3', 'y'); input('B3', '2'); selR('A1:B3'); click('btnDedup');
    return '残' + [1, 2, 3].filter((r) => shown('A' + r) !== '').length + '行';
  });
  await rec('TC-U-017', 'データツール', '行列の入れ替え', '正常系', 'A1:B2に2x2', 'A1:B2を選択し行列入れ替え', '1,3/2,4', () => {
    reset(); input('A1', '1'); input('B1', '2'); input('A2', '3'); input('B2', '4'); selR('A1:B2'); click('btnTranspose');
    return shown('A1') + ',' + shown('B1') + '/' + shown('A2') + ',' + shown('B2');
  });
  await rec('TC-U-018', 'クリップボード', 'コピー&貼り付けで数式の参照が相対的にずれる', '正常系', 'A1=1,A2=2,B1==A1*10', 'B1をコピーしB2へ貼り付け', '=A2*10|20', () => {
    reset(); input('A1', '1'); input('A2', '2'); input('B1', '=A1*10');
    const dt = new DataTransfer(); sel('B1'); clip('copy', dt); sel('B2'); clip('paste', dt);
    return fx('B2') + '|' + shown('B2');
  });
  await rec('TC-U-019', 'UI操作', 'オートSUMが直上の数値範囲を合計する', '正常系', 'A1:A3=1,2,3', 'A4でオートSUM', '=SUM(A1:A3)|6', () => {
    reset(); input('A1', '1'); input('A2', '2'); input('A3', '3'); sel('A4'); click('btnAutoSum');
    if (Grid.isEditing()) Grid.commitEdit('down');
    return fx('A4') + '|' + shown('A4');
  });
  await rec('TC-U-020', 'UI操作', 'パーセントスタイルボタンで表示形式が変わる', '正常系', 'A1=0.25', 'A1でパーセントボタン', '25%', () => { reset(); input('A1', '0.25'); sel('A1'); click('btnPercent'); return shown('A1'); });
  await rec('TC-U-021', 'UI操作', '桁区切りスタイルボタン', '正常系', 'A1=1234567', 'A1で桁区切りボタン', '1,234,567', () => { reset(); input('A1', '1234567'); sel('A1'); click('btnComma'); return shown('A1').replace(/\.00$/, ''); });
  await rec('TC-U-022', 'UI操作', '小数桁を増やすボタンで桁数が増える', '正常系', 'A1=1.5', '「.0→.00」を2回押す', '1.50', () => { reset(); input('A1', '1.5'); sel('A1'); click('btnDecInc'); click('btnDecInc'); return shown('A1'); });
  await rec('TC-U-023', 'UI操作', 'Alt+Enterでセル内改行が入る', '境界値', 'A1を編集中', '編集中にAlt+Enter', '2行', () => {
    reset(); sel('A1'); Grid.startEdit(''); Grid.editorValue('あ');
    const ed = document.querySelector('#cellEditor') || document.querySelector('textarea');
    if (ed) { ed.selectionStart = ed.selectionEnd = 1; ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true, cancelable: true })); }
    Grid.editorValue(Grid.editorValue() + 'い'); Grid.commitEdit('down');
    const v = App.wb.sheets[0].get(0, 0);
    return (v && String(v.v).indexOf('\n') >= 0) ? '2行' : '1行';
  });
  await rec('TC-U-024', 'UI操作', 'ズーム変更で表示倍率が変わる', '正常系', '既定100%', 'ズームを150%に変更', '150%', () => { App.setZoom(1.5); const z = document.getElementById('zoomLabel').textContent; App.setZoom(1); return z; });
  await rec('TC-U-025', 'UI操作', '数式の表示トグルが機能する', '状態遷移', 'A1==1+1', '数式の表示ボタン', 'true', () => { reset(); input('A1', '=1+1'); click('btnShowFormula'); const on = App.showFormula; click('btnShowFormula'); return String(!!on); });
  await rec('TC-U-026', 'UI操作', '行の挿入ボタンで行が増える', '正常系', 'A1=1,A2=2', 'A2で行を挿入', 'A3=2', () => { reset(); input('A1', '1'); input('A2', '2'); sel('A2'); click('btnInsRow'); return 'A3=' + shown('A3'); });
  await rec('TC-U-027', 'UI操作', '列の削除ボタンで列が消える', '正常系', 'A1=1,B1=2', 'A列を選択し列を削除', 'B1が1に繰り上がる', () => { reset(); input('A1', '1'); input('B1', '2'); sel('A1'); click('btnDelCol'); return shown('A1') === '2' ? 'B1が1に繰り上がる' : 'A1=' + shown('A1'); });
  await rec('TC-U-028', 'UI操作', '名前ボックスで指定セルへジャンプする', '正常系', '-', '名前ボックスにC5と入力しEnter', 'C5', () => {
    const nb = document.getElementById('nameBox'); nb.value = 'C5';
    nb.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const n = Grid.sel(); return U.a1(n.ar, n.ac);
  });
  await rec('TC-U-029', 'UI操作', '1万セル入力後の再描画が2秒以内', '負荷', '-', '100x100に値を入れて再描画', '2000ms以内', () => {
    reset(); const s = App.wb.sheets[0];
    for (let r = 0; r < 100; r++) for (let c = 0; c < 100; c++) s.setValue(r, c, r * c);
    const t = performance.now(); App.recalcAndRefresh(); const ms = performance.now() - t;
    return (ms <= 2000 ? '2000ms以内' : '超過') + '(' + ms.toFixed(0) + 'ms)';
  });
  await rec('TC-U-030', 'UI操作', 'グラフを挿入しても描画例外が出ない', '正常系', 'A1:A3にデータ', 'グラフを挿入して再描画', '例外なし', () => {
    reset(); input('A1', '1'); input('A2', '2'); input('A3', '3'); selR('A1:A3');
    const b = document.getElementById('btnChartCol') || document.getElementById('btnInsChart');
    if (b) { b.click(); } else { Grid.addObject({ type: 'chart', ct: 'col', x: 10, y: 10, w: 300, h: 200, ref: 'A1:A3' }); }
    App.refresh(); return '例外なし';
  });
  await rec('TC-U-031', 'クリップボード', '切り取り&貼り付けで元セルが空になる', '状態遷移', 'A1=abc', 'A1を切り取りC1へ貼り付け', 'C1=abc / A1=空', () => {
    reset(); input('A1', 'abc'); const dt = new DataTransfer(); sel('A1'); clip('cut', dt); sel('C1'); clip('paste', dt);
    return 'C1=' + (shown('C1') || '空') + ' / A1=' + (shown('A1') || '空');
  });
  await rec('TC-U-032', 'クリップボード', '外部からのTSV貼り付けが表として展開される', '正常系', '-', 'Excel形式のTSVテキストを貼り付け', 'A1=1 B1=2 A2=3 B2=4', () => {
    reset(); const dt = new DataTransfer(); dt.setData('text/plain', '1\t2\n3\t4'); sel('A1'); clip('paste', dt);
    return 'A1=' + shown('A1') + ' B1=' + shown('B1') + ' A2=' + shown('A2') + ' B2=' + shown('B2');
  });
  await rec('TC-U-033', 'クリップボード', '貼り付けで書式もコピーされる', '正常系', 'A1が太字', 'A1をコピーしB1へ貼り付け', 'true', () => {
    reset(); input('A1', 'x'); sel('A1'); click('btnBold');
    const dt = new DataTransfer(); sel('A1'); clip('copy', dt); sel('B1'); clip('paste', dt);
    const st = App.wb.sheets[0].styleOf(0, 1) || {}; return String(!!st.b);
  });
  await rec('TC-U-034', 'ファイル入出力', 'xlsx書き出し→読み込みで値と数式が保たれる', '正常系', 'A1=1,A2=2,A3==SUM(A1:A2),B1=文字列', 'exportXlsx→importXlsx', '1|2|=SUM(A1:A2)|3|テスト', async () => {
    reset(); input('A1', '1'); input('A2', '2'); input('A3', '=SUM(A1:A2)'); input('B1', 'テスト');
    const wb2 = await IO.importXlsx(await (await IO.exportXlsx(App.wb)).arrayBuffer()); M.recalc(wb2);
    return [shown('A1', wb2), shown('A2', wb2), fx('A3', wb2), shown('A3', wb2), shown('B1', wb2)].join('|');
  });
  await rec('TC-U-035', 'ファイル入出力', 'xlsx往復で書式(太字・桁区切り)が保たれる', '正常系', 'A1=1000に太字と桁区切り', 'exportXlsx→importXlsx', '太字=true 書式あり', async () => {
    reset(); input('A1', '1000'); sel('A1'); click('btnBold'); click('btnComma');
    const wb2 = await IO.importXlsx(await (await IO.exportXlsx(App.wb)).arrayBuffer());
    const st = wb2.sheets[0].styleOf(0, 0) || {}; return '太字=' + String(!!st.b) + ' ' + (st.nf ? '書式あり' : '書式なし');
  });
  await rec('TC-U-036', 'ファイル入出力', 'xlsx往復で複数シートとシート名が保たれる', '正常系', 'シート3枚', 'exportXlsx→importXlsx', '3枚', async () => {
    reset(); App.wb.addSheet(); App.wb.addSheet();
    const wb2 = await IO.importXlsx(await (await IO.exportXlsx(App.wb)).arrayBuffer());
    return wb2.sheets.length + '枚(' + wb2.sheets.map((s) => s.name).join(',') + ')';
  });
  await rec('TC-U-037', 'ファイル入出力', 'xlsx往復で結合セルが保たれる', '正常系', 'A1:B1を結合', 'exportXlsx→importXlsx', '1件', async () => {
    reset(); input('A1', 'x'); selR('A1:B1'); click('btnMerge');
    const wb2 = await IO.importXlsx(await (await IO.exportXlsx(App.wb)).arrayBuffer());
    return wb2.sheets[0].merges.length + '件';
  });
  await rec('TC-U-038', 'ファイル入出力', 'xlsx往復で日付が日付のまま保たれる', '境界値', 'A1=2026/8/23', 'exportXlsx→importXlsx', '2026/08/23', async () => {
    reset(); input('A1', '2026/8/23');
    const wb2 = await IO.importXlsx(await (await IO.exportXlsx(App.wb)).arrayBuffer()); M.recalc(wb2);
    return shown('A1', wb2);
  });
  await rec('TC-U-039', 'ファイル入出力', '壊れたファイルを読み込んでもアプリが落ちない', '異常系', 'xlsxでないバイト列', 'importXlsxに不正データ', 'エラーで復帰', async () => {
    try { await IO.importXlsx(new Uint8Array([1, 2, 3, 4, 5]).buffer); return 'エラーにならず通過'; } catch (e) { return 'エラーで復帰'; }
  });
  await rec('TC-U-040', '関数(日付)', '月末日にEDATEを使うと翌月末になる', '境界値', 'A1=2026/1/31', 'B1に =EDATE(A1,1)', '2026/02/28', () => {
    reset(); input('A1', '2026/1/31'); input('B1', '=EDATE(A1,1)');
    const c = App.wb.sheets[0].get(0, 1); if (c) { c.s = c.s || {}; if (!c.s.nf) c.s.nf = 'yyyy/mm/dd'; }
    return shown('B1');
  });
  await rec('TC-U-041', '関数(数値)', '計算不能な結果はエラー値になる', '異常系', '-', 'A1に =POWER(-8,1/3)', '#NUM!', () => { reset(); input('A1', '=POWER(-8,1/3)'); return shown('A1'); });
  await rec('TC-U-042', '関数(数値)', '計算不能な結果が後続の集計を汚染しない', '異常系', 'A1==POWER(-8,1/3), A2=10', 'A3に =SUM(A1:A2)', '10', () => { input('A2', '10'); input('A3', '=SUM(A1:A2)'); return shown('A3'); });
  await rec('TC-U-043', '関数(日付)', 'DATEDIFで開始日>終了日はエラーになる', '異常系', '-', '=DATEDIF(2026/5/1,2026/1/1,"D")', '#NUM!', () => { reset(); input('A1', '=DATEDIF(DATE(2026,5,1),DATE(2026,1,1),"D")'); return shown('A1'); });
  await rec('TC-U-044', '関数(条件集計)', 'SUMIFSで範囲サイズが違う場合はエラーになる', '異常系', 'A1:A4に条件, C1:C2に合計範囲', '=SUMIFS(C1:C2,A1:A4,"x")', '#VALUE!', () => {
    reset(); input('A1', 'x'); input('A2', 'x'); input('A3', 'x'); input('A4', 'x'); input('C1', '1'); input('C2', '1');
    input('E1', '=SUMIFS(C1:C2,A1:A4,"x")'); return shown('E1');
  });
  await rec('TC-U-045', 'UI操作', '小数桁を増やすボタンを1回押すと表示が変わる', '境界値', 'A1=1.5(標準書式)', '「.0→.00」を1回押す', '1.50', () => { reset(); input('A1', '1.5'); sel('A1'); click('btnDecInc'); return shown('A1'); });
  await rec('TC-U-046', 'UI操作', '小数桁を減らすボタンで桁数が減る', '正常系', 'A1=1.50(0.00書式)', '「.00→.0」を押す', '1.5', () => { sel('A1'); click('btnDecInc'); click('btnDecDec'); return shown('A1'); });
  await rec('TC-U-047', 'ファイル入出力', '編集内容が自動保存領域に退避される', '状態遷移', 'A1に値を入力', 'localStorageの自動保存を確認', '保存あり', () => { reset(); input('A1', '復元テスト'); return localStorage.getItem('exitcel.autosave') ? '保存あり' : '保存なし'; });
  await rec('TC-U-048', 'UI操作', '行削除をUndoすると値と数式が戻る', '状態遷移', 'A1=1,A2=2,B1==SUM(A1:A2)', '2行目を削除しCtrl+Z', '3', () => {
    reset(); input('A1', '1'); input('A2', '2'); input('B1', '=SUM(A1:A2)'); sel('A2'); click('btnDelRow'); key('z', { ctrlKey: true }); return shown('B1');
  });
  await rec('TC-U-049', 'UI操作', 'ウィンドウ枠の固定が設定できる', '正常系', 'B2を選択', 'ウィンドウ枠の固定を実行', 'r1c1', () => {
    reset(); sel('B2'); const b = document.getElementById('btnFreeze'); if (b) b.click();
    const f = App.wb.sheets[0].freeze; return f ? ('r' + f.r + 'c' + f.c) : '未設定';
  });
  await rec('TC-U-050', 'ファイル入出力', 'HTML出力に計算結果が含まれる', '正常系', 'A1=1,A2=2,A3==SUM(A1:A2)', 'HTML出力を生成', '3を含む', () => {
    reset(); input('A1', '1'); input('A2', '2'); input('A3', '=SUM(A1:A2)');
    return IO.sheetToHtml(App.wb).indexOf('>3<') >= 0 ? '3を含む' : '欠落';
  });

  const ms = performance.now() - t0;
  const pass = R.filter((r) => r.status === 'PASS').length;
  console.log('UI実機テスト: ' + R.length + '件 / PASS ' + pass + ' / FAIL ' + (R.length - pass) + ' / ' + ms.toFixed(0) + 'ms');
  R.filter((r) => r.status === 'FAIL').forEach((r) => console.log('  FAIL ' + r.id + ' ' + r.view + ' … 期待:' + r.exp + ' 実際:' + r.act));
  if (opts.post) {
    try { await fetch('http://localhost:8778/save', { method: 'POST', body: JSON.stringify(R) }); console.log('結果を qa/ui-results.json に保存しました'); }
    catch (e) { console.log('保存に失敗（collector.js が起動していない可能性）: ' + e.message); }
  }
  window.__uiResults = R;
  window.__uiElapsedMs = ms;
  return R;
};
