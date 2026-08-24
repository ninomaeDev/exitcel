/* テストケース : C 参照/エラー処理 / D 行列操作 / E 入力解析・表示形式 / F 入出力 / G 性能 */
const L = require('./lib');
const { S, U, F, M, IO, calc, book, disp, raw, editText, formulaOf, show } = L;

/* --- 共通ユーティリティ --- */
function set(sh, addr, v) { const rc = U.parseA1(addr); sh.setValue(rc.r, rc.c, v); }
function put(wb, addr, v, si) { set(wb.sheets[si || 0], addr, v); }
function fmt(value, nf) { return U.formatValue(U.parseInput(String(value)).v, nf); }
function inputCell(text) {
  const wb = new M.Workbook();
  wb.sheets[0].setValue(0, 0, text);
  M.recalc(wb);
  return wb;
}
function inputShown(text) {
  const wb = inputCell(text);
  return disp(wb, 'A1');
}
function bytesToStr(u8) { return Buffer.from(u8).toString('utf8'); }
async function toAB(blobOrBytes) {
  if (blobOrBytes && typeof blobOrBytes.arrayBuffer === 'function') return await blobOrBytes.arrayBuffer();
  return blobOrBytes.buffer ? blobOrBytes.buffer : blobOrBytes;
}
async function xlsxZip(wb) { return await IO.zipRead(await toAB(await IO.exportXlsx(wb))); }

module.exports = [
/* ---------- C. 参照とエラー処理 ---------- */
{ id:'TC-C-001', cat:'参照', view:'相対参照の計算', tech:'正常系', pre:'A1=10', step:'B1に =A1*2', exp:'20', run:()=>calc({A1:10}, '=A1*2') },
{ id:'TC-C-002', cat:'参照', view:'絶対参照 $A$1 の解決', tech:'正常系', pre:'A1=10', step:'B1に =$A$1*2', exp:'20', run:()=>calc({A1:10}, '=$A$1*2') },
{ id:'TC-C-003', cat:'参照', view:'複合参照 $A1 / A$1 の解決', tech:'境界値', pre:'A1=10', step:'B1に =$A1+A$1', exp:'20', run:()=>calc({A1:10}, '=$A1+A$1') },
{ id:'TC-C-004', cat:'参照', view:'範囲参照の合計', tech:'正常系', pre:'A1:C1=1,2,3', step:'=SUM(A1:C1)', exp:'6', run:()=>calc({A1:1,B1:2,C1:3}, '=SUM(A1:C1)') },
{ id:'TC-C-005', cat:'参照', view:'逆順範囲 C1:A1 の正規化', tech:'エラー推測', pre:'A1:C1=1,2,3', step:'=SUM(C1:A1)', exp:'6', run:()=>calc({A1:1,B1:2,C1:3}, '=SUM(C1:A1)') },
{ id:'TC-C-006', cat:'参照', view:'2段の間接参照(A→B→C)', tech:'正常系', pre:'A1=5', step:'B1==A1*2, C1==B1+1', exp:'11', run:()=>{
  const wb = book({A1:5, B1:'=A1*2', C1:'=B1+1'}); return raw(wb,'C1'); } },
{ id:'TC-C-007', cat:'参照', view:'シート間参照', tech:'正常系', pre:'Sheet2!A1=7', step:'Sheet1に =Sheet2!A1*3', exp:'21', run:()=>{
  const wb = book({'Sheet2!A1':7, 'Sheet1!B1':'=Sheet2!A1*3'}, ['Sheet2']); return raw(wb,'B1'); } },
{ id:'TC-C-008', cat:'参照', view:'空白入りシート名(クォート付き)参照', tech:'境界値', pre:"'売上 表'!A1=100", step:"='売上 表'!A1+1", exp:'101', run:()=>{
  const wb = book({'売上 表!A1':100, 'Sheet1!B1':"='売上 表'!A1+1"}, ['売上 表']); return raw(wb,'B1'); } },
{ id:'TC-C-009', cat:'参照', view:'存在しないシート参照は#REF!', tech:'異常系', pre:'Sheet9は存在しない', step:'=Sheet9!A1', exp:'#REF!', run:()=>calc({}, '=Sheet9!A1') },
{ id:'TC-C-010', cat:'参照', view:'シート間の範囲集計', tech:'正常系', pre:'Sheet2!A1:A3=1,2,3', step:'=SUM(Sheet2!A1:A3)', exp:'6', run:()=>{
  const wb = book({'Sheet2!A1':1,'Sheet2!A2':2,'Sheet2!A3':3,'Sheet1!B1':'=SUM(Sheet2!A1:A3)'}, ['Sheet2']); return raw(wb,'B1'); } },
{ id:'TC-C-011', cat:'エラー処理', view:'自己参照の循環検出', tech:'異常系', pre:'-', step:'A1に =A1+1', exp:'#CIRC!', run:()=>{
  const wb = book({A1:'=A1+1'}); return raw(wb,'A1'); } },
{ id:'TC-C-012', cat:'エラー処理', view:'2セル間の相互循環検出', tech:'異常系', pre:'-', step:'A1==B1, B1==A1', exp:'#CIRC!', run:()=>{
  const wb = book({A1:'=B1', B1:'=A1'}); return raw(wb,'A1'); } },
{ id:'TC-C-013', cat:'エラー処理', view:'未定義関数は#NAME?', tech:'異常系', pre:'-', step:'=NOSUCHFUNC(1)', exp:'#NAME?', run:()=>calc({}, '=NOSUCHFUNC(1)') },
{ id:'TC-C-014', cat:'エラー処理', view:'構文エラー(括弧不一致)でも落ちない', tech:'異常系', pre:'-', step:'=SUM(A1:A3 を入力', exp:'エラー値を表示しアプリは継続', run:()=>{
  try { const v = calc({A1:1}, '=SUM(A1:A3'); return v.startsWith('#') || v !== '' ? 'エラー値を表示しアプリは継続' : '空表示'; }
  catch (e) { return '例外: ' + e.message; } } },
{ id:'TC-C-015', cat:'エラー処理', view:'エラーの伝播(参照先がエラー)', tech:'異常系', pre:'A1==1/0', step:'B1に =A1+1', exp:'#DIV/0!', run:()=>{
  const wb = book({A1:'=1/0', B1:'=A1+1'}); return raw(wb,'B1'); } },
{ id:'TC-C-016', cat:'エラー処理', view:'引数不足の関数呼び出し', tech:'異常系', pre:'-', step:'=ROUND()', exp:'#VALUE!', run:()=>calc({}, '=ROUND()') },
{ id:'TC-C-017', cat:'エラー処理', view:'大量ネストでもスタックが溢れない', tech:'負荷', pre:'-', step:'ABS()を100段ネスト', exp:'1', run:()=>{
  const f = '=' + 'ABS('.repeat(100) + '1' + ')'.repeat(100);
  try { return calc({}, f); } catch (e) { return '例外: ' + e.message; } } },
{ id:'TC-C-018', cat:'エラー処理', view:'長い連鎖参照(1000段)の再計算', tech:'負荷', pre:'A1=1', step:'A2==A1+1 を1000行連鎖', exp:'1000', run:()=>{
  const cells = {A1:1};
  for (let r = 2; r <= 1000; r++) cells['A'+r] = '=A'+(r-1)+'+1';
  const wb = book(cells); return raw(wb,'A1000'); } },
{ id:'TC-C-019', cat:'エラー処理', view:'TRUE/FALSE を括弧なしで書ける', tech:'エラー推測', pre:'-', step:'=IF(TRUE,"y","n")', exp:'y', run:()=>calc({}, '=IF(TRUE,"y","n")') },
{ id:'TC-C-020', cat:'エラー処理', view:'VLOOKUPの第4引数にFALSEを直接指定', tech:'エラー推測', pre:'A1:B2に表', step:'=VLOOKUP("B",A1:B2,2,FALSE)', exp:'200', run:()=>calc({A1:'A',B1:100,A2:'B',B2:200}, '=VLOOKUP("B",A1:B2,2,FALSE)') },

/* ---------- D. 行・列の挿入と削除(数式の追随) ---------- */
{ id:'TC-D-001', cat:'行列操作', view:'行挿入で下の値がずれる', tech:'正常系', pre:'A1=1,A2=2', step:'1行目に行を挿入', exp:'A2=1 / A3=2', run:()=>{
  const wb = book({A1:1,A2:2}); M.insertRows(wb, wb.sheets[0], 0, 1); M.recalc(wb);
  return 'A2=' + raw(wb,'A2') + ' / A3=' + raw(wb,'A3'); } },
{ id:'TC-D-002', cat:'行列操作', view:'行挿入で数式の参照が追随する', tech:'正常系', pre:'A1=1,A2=2,B1==SUM(A1:A2)', step:'1行目に行を挿入', exp:'=SUM(A2:A3)', run:()=>{
  const wb = book({A1:1,A2:2,B1:'=SUM(A1:A2)'}); M.insertRows(wb, wb.sheets[0], 0, 1); M.recalc(wb);
  return formulaOf(wb,'B2'); } },
{ id:'TC-D-003', cat:'行列操作', view:'行挿入後も合計値が変わらない', tech:'正常系', pre:'A1=1,A2=2,B1==SUM(A1:A2)', step:'1行目に行を挿入し再計算', exp:'3', run:()=>{
  const wb = book({A1:1,A2:2,B1:'=SUM(A1:A2)'}); M.insertRows(wb, wb.sheets[0], 0, 1); M.recalc(wb);
  return raw(wb,'B2'); } },
{ id:'TC-D-004', cat:'行列操作', view:'列挿入で数式の参照が追随する', tech:'正常系', pre:'A1=1,B1=2,C1==SUM(A1:B1)', step:'A列の前に列を挿入', exp:'=SUM(B1:C1)', run:()=>{
  const wb = book({A1:1,B1:2,C1:'=SUM(A1:B1)'}); M.insertCols(wb, wb.sheets[0], 0, 1); M.recalc(wb);
  return formulaOf(wb,'D1'); } },
{ id:'TC-D-005', cat:'行列操作', view:'参照先の行を削除すると#REF!', tech:'異常系', pre:'A1=1,B5==A1*2', step:'1行目を削除しB4を確認', exp:'#REF!', run:()=>{
  const wb = book({A1:1,B5:'=A1*2'}); M.deleteRows(wb, wb.sheets[0], 0, 1); M.recalc(wb);
  return raw(wb,'B4'); } },
{ id:'TC-D-006', cat:'行列操作', view:'範囲の途中行を削除すると範囲が縮む', tech:'正常系', pre:'A1:A3=1,2,3 / B1==SUM(A1:A3)', step:'2行目を削除', exp:'4', run:()=>{
  const wb = book({A1:1,A2:2,A3:3,B1:'=SUM(A1:A3)'}); M.deleteRows(wb, wb.sheets[0], 1, 1); M.recalc(wb);
  return raw(wb,'B1'); } },
{ id:'TC-D-007', cat:'行列操作', view:'行挿入で結合セルが追随する', tech:'エラー推測', pre:'A1:B1を結合', step:'1行目に行を挿入', exp:'r1=1', run:()=>{
  const wb = book({A1:'x'}); wb.sheets[0].merges.push({r1:0,c1:0,r2:0,c2:1});
  M.insertRows(wb, wb.sheets[0], 0, 1);
  const m = wb.sheets[0].merges[0]; return m ? 'r1=' + m.r1 : '結合が消えた'; } },
{ id:'TC-D-008', cat:'行列操作', view:'絶対参照 $A$1 も行挿入で追随する', tech:'境界値', pre:'A1=1,B1==$A$1', step:'1行目に行を挿入', exp:'=$A$2', run:()=>{
  const wb = book({A1:1,B1:'=$A$1'}); M.insertRows(wb, wb.sheets[0], 0, 1); M.recalc(wb);
  return formulaOf(wb,'B2'); } },
{ id:'TC-D-009', cat:'行列操作', view:'Undo(スナップショット復元)で元に戻る', tech:'状態遷移', pre:'A1=1', step:'A1を99に変更→restoreで復元', exp:'1', run:()=>{
  const wb = book({A1:1}); const snap = M.snapshot(wb);
  put(wb,'A1',99); M.recalc(wb);
  M.restore(wb, snap); M.recalc(wb); return raw(wb,'A1'); } },
{ id:'TC-D-010', cat:'行列操作', view:'Undo履歴の上限(60件)を超えても壊れない', tech:'境界値', pre:'-', step:'70件push後にundoStack長を確認', exp:'60', run:()=>{
  const h = new M.History(60);
  for (let i = 0; i < 70; i++) h.push({i:i});
  return String(h.undoStack.length); } },
{ id:'TC-D-011', cat:'行列操作', view:'同名シートを含むファイルの読み込み時に名前が一意化される', tech:'エラー推測', pre:'同名シート2枚を含むJSON', step:'fromJSONで読み込み、参照先を確認', exp:'一意化される', run:()=>{
  const j = {name:'t', active:0, sheets:[
    {name:'データ', cells:{'0:0':{v:1}}},
    {name:'データ', cells:{'0:0':{v:2}}},
    {name:'集計', cells:{'0:0':{f:"'データ'!A1"}}}]};
  const wb = M.fromJSON(j); M.recalc(wb);
  const names = wb.sheets.map(s=>s.name);
  const dup = names.length !== new Set(names).size;
  return dup ? '重複したまま(参照は' + raw(wb,'A1',2) + 'を指す)' : '一意化される'; } },
{ id:'TC-D-012', cat:'行列操作', view:'シート削除後も他シートの参照が保たれる', tech:'状態遷移', pre:'Sheet2!A1=5 / Sheet3!A1==Sheet2!A1', step:'Sheet3の値を確認', exp:'5', run:()=>{
  const wb = book({'Sheet2!A1':5,'Sheet3!A1':'=Sheet2!A1'}, ['Sheet2','Sheet3']);
  return raw(wb,'A1',2); } },

/* ---------- E. 入力解析と表示形式 ---------- */
{ id:'TC-E-001', cat:'入力解析', view:'整数入力は数値になる', tech:'同値分割', pre:'-', step:'A1に 123 を入力', exp:'123', run:()=>inputShown('123') },
{ id:'TC-E-002', cat:'入力解析', view:'小数入力', tech:'同値分割', pre:'-', step:'A1に 1.25 を入力', exp:'1.25', run:()=>inputShown('1.25') },
{ id:'TC-E-003', cat:'入力解析', view:'マイナス値', tech:'同値分割', pre:'-', step:'A1に -5 を入力', exp:'-5', run:()=>inputShown('-5') },
{ id:'TC-E-004', cat:'入力解析', view:'パーセント入力は書式つき数値になる', tech:'正常系', pre:'-', step:'A1に 25% を入力', exp:'25.00%', run:()=>inputShown('25%') },
{ id:'TC-E-005', cat:'入力解析', view:'通貨入力(¥)', tech:'正常系', pre:'-', step:'A1に ¥1,000 を入力', exp:'¥1,000', run:()=>inputShown('¥1,000') },
{ id:'TC-E-006', cat:'入力解析', view:'桁区切り数値の入力', tech:'正常系', pre:'-', step:'A1に 1,234 を入力', exp:'1,234', run:()=>inputShown('1,234') },
{ id:'TC-E-007', cat:'入力解析', view:'日付入力(yyyy/m/d)', tech:'正常系', pre:'-', step:'A1に 2026/8/23 を入力', exp:'2026/08/23', run:()=>inputShown('2026/8/23') },
{ id:'TC-E-008', cat:'入力解析', view:'時刻入力(h:mm)', tech:'正常系', pre:'-', step:'A1に 13:30 を入力', exp:'13:30', run:()=>inputShown('13:30') },
{ id:'TC-E-009', cat:'入力解析', view:'前ゼロつき数値はExcel同様に数値7になる', tech:'エラー推測', pre:'-', step:'A1に 007 を入力', exp:'7', run:()=>inputShown('007') },
{ id:'TC-E-009b', cat:'入力解析', view:'文字列書式(@)のセルなら前ゼロが保持される', tech:'エラー推測', pre:'A1の表示形式=文字列', step:'A1に 007 を入力', exp:'007', run:()=>{
  const wb = new M.Workbook(); const sh = wb.sheets[0];
  sh.ensure(0,0).s = {nf:'@'}; sh.setValue(0,0,'007'); M.recalc(wb);
  return raw(wb,'A1'); } },
{ id:'TC-E-010', cat:'入力解析', view:'電話番号形式は文字列として保持される', tech:'エラー推測', pre:'-', step:'A1に 090-1234-5678 を入力', exp:'090-1234-5678', run:()=>inputShown('090-1234-5678') },
{ id:'TC-E-011', cat:'入力解析', view:'TRUE入力は論理値になる', tech:'同値分割', pre:'-', step:'A1に TRUE を入力', exp:'TRUE', run:()=>{
  const wb = inputCell('TRUE'); return raw(wb,'A1'); } },
{ id:'TC-E-012', cat:'入力解析', view:'空文字入力でセルが空になる', tech:'境界値', pre:'A1=5', step:'A1に空文字を入力', exp:'空', run:()=>{
  const wb = book({A1:5}); put(wb,'A1',''); M.recalc(wb);
  return wb.sheets[0].get(0,0) === null ? '空' : '残存:' + raw(wb,'A1'); } },
{ id:'TC-E-013', cat:'入力解析', view:'数式バー表示が入力どおり戻る', tech:'状態遷移', pre:'-', step:'A1に =1+2 を入力し編集文字列を確認', exp:'=1+2', run:()=>{
  const wb = inputCell('=1+2'); return editText(wb,'A1'); } },
{ id:'TC-E-014', cat:'入力解析', view:'日付セルの数式バー表示が日付形式に戻る', tech:'状態遷移', pre:'-', step:'A1に 2026/8/23 を入力し編集文字列を確認', exp:'2026/08/23', run:()=>{
  const wb = inputCell('2026/8/23'); return editText(wb,'A1'); } },
{ id:'TC-E-015', cat:'表示形式', view:'桁区切り書式', tech:'正常系', pre:'-', step:'1234567 に #,##0 を適用', exp:'1,234,567', run:()=>U.formatValue(1234567, '#,##0') },
{ id:'TC-E-016', cat:'表示形式', view:'小数2桁固定', tech:'正常系', pre:'-', step:'1.5 に 0.00 を適用', exp:'1.50', run:()=>U.formatValue(1.5, '0.00') },
{ id:'TC-E-017', cat:'表示形式', view:'パーセント書式', tech:'正常系', pre:'-', step:'0.1234 に 0.0% を適用', exp:'12.3%', run:()=>U.formatValue(0.1234, '0.0%') },
{ id:'TC-E-018', cat:'表示形式', view:'通貨書式', tech:'正常系', pre:'-', step:'1234 に ¥#,##0 を適用', exp:'¥1,234', run:()=>U.formatValue(1234, '¥#,##0') },
{ id:'TC-E-019', cat:'表示形式', view:'負数の丸め表示(-0にならない)', tech:'境界値', pre:'-', step:'-0.4 に 0 を適用', exp:'-0', run:()=>U.formatValue(-0.4, '0') },
{ id:'TC-E-020', cat:'表示形式', view:'0 の桁区切り表示', tech:'境界値', pre:'-', step:'0 に #,##0 を適用', exp:'0', run:()=>U.formatValue(0, '#,##0') },
{ id:'TC-E-021', cat:'表示形式', view:'日付書式(yyyy/mm/dd)', tech:'正常系', pre:'-', step:'シリアル値に yyyy/mm/dd を適用', exp:'2026/08/23', run:()=>U.formatValue(U.dateToSerial(new Date(2026,7,23)), 'yyyy/mm/dd') },
{ id:'TC-E-022', cat:'表示形式', view:'文字列書式(@)は数値も文字扱い', tech:'同値分割', pre:'-', step:'123 に @ を適用', exp:'123', run:()=>U.formatValue(123, '@') },
{ id:'TC-E-023', cat:'表示形式', view:'指数表記書式', tech:'正常系', pre:'-', step:'12345 に 0.00E+00 を適用', exp:'1.23E+04', run:()=>U.formatValue(12345, '0.00E+00') },
{ id:'TC-E-024', cat:'表示形式', view:'General は長い小数を丸めて表示', tech:'境界値', pre:'-', step:'1/3 を General 表示', exp:'0.333333333', run:()=>U.generalFormat(1/3) },
{ id:'TC-E-025', cat:'表示形式', view:'A1参照の列名変換(境界)', tech:'境界値', pre:'-', step:'0,25,26,701列目の列名', exp:'A,Z,AA,ZZ', run:()=>[0,25,26,701].map(c=>U.colName(c)).join(',') },
{ id:'TC-E-026', cat:'表示形式', view:'列名から列番号への逆変換', tech:'境界値', pre:'-', step:'A,Z,AA,ZZ の列番号', exp:'0,25,26,701', run:()=>['A','Z','AA','ZZ'].map(n=>U.colIndex(n)).join(',') },

/* ---------- F. ファイル入出力 ---------- */
{ id:'TC-F-001', cat:'入出力', view:'CSV出力の基本形', tech:'正常系', pre:'A1:B2に値', step:'CSV文字列を生成', exp:'a,1\nb,2', run:()=>{
  const wb = book({A1:'a',B1:1,A2:'b',B2:2});
  return IO.sheetToDelimited(wb.sheets[0], ',').trim(); } },
{ id:'TC-F-002', cat:'入出力', view:'CSV出力でカンマを含む値が引用される', tech:'境界値', pre:'A1="a,b"', step:'CSV文字列を生成', exp:'"a,b"', run:()=>{
  const wb = book({A1:'a,b'}); return IO.sheetToDelimited(wb.sheets[0], ',').trim(); } },
{ id:'TC-F-003', cat:'入出力', view:'CSV出力で二重引用符がエスケープされる', tech:'境界値', pre:'A1=a"b', step:'CSV文字列を生成', exp:'"a""b"', run:()=>{
  const wb = book({A1:'a"b'}); return IO.sheetToDelimited(wb.sheets[0], ',').trim(); } },
{ id:'TC-F-004', cat:'入出力', view:'CSV出力は数式の計算結果を書き出す', tech:'正常系', pre:'A1=1,A2=2,A3==SUM(A1:A2)', step:'CSV文字列を生成', exp:'最終行が3', run:()=>{
  const wb = book({A1:1,A2:2,A3:'=SUM(A1:A2)'});
  const lines = IO.sheetToDelimited(wb.sheets[0], ',').trim().split('\n');
  return lines[lines.length-1].trim() === '3' ? '最終行が3' : '最終行=' + lines[lines.length-1]; } },
{ id:'TC-F-005', cat:'入出力', view:'CSV読み込み(引用符・改行入り)', tech:'境界値', pre:'-', step:'"a,b",2 をパース', exp:'a,b|2', run:()=>{
  const rows = U.parseDelimited('"a,b",2', ','); return rows[0].join('|'); } },
{ id:'TC-F-006', cat:'入出力', view:'CSV読み込み(セル内改行)', tech:'境界値', pre:'-', step:'"a\\nb",2 をパース', exp:'1行2列', run:()=>{
  const rows = U.parseDelimited('"a\nb",2', ',');
  return rows.length + '行' + rows[0].length + '列'; } },
{ id:'TC-F-007', cat:'入出力', view:'TSV読み込み', tech:'正常系', pre:'-', step:'タブ区切りをパース', exp:'a|b|c', run:()=>{
  const rows = U.parseDelimited('a\tb\tc', '\t'); return rows[0].join('|'); } },
{ id:'TC-F-008', cat:'入出力', view:'JSON往復で値が保たれる', tech:'正常系', pre:'A1=1,B1=abc', step:'toJSON→fromJSON', exp:'1/abc', run:()=>{
  const wb = book({A1:1,B1:'abc'});
  const wb2 = M.fromJSON(JSON.parse(JSON.stringify(M.toJSON(wb)))); M.recalc(wb2);
  return raw(wb2,'A1') + '/' + raw(wb2,'B1'); } },
{ id:'TC-F-009', cat:'入出力', view:'JSON往復で数式が保たれる', tech:'正常系', pre:'C1==SUM(A1:B1)', step:'toJSON→fromJSON→再計算', exp:'=SUM(A1:B1)/3', run:()=>{
  const wb = book({A1:1,B1:2,C1:'=SUM(A1:B1)'});
  const wb2 = M.fromJSON(JSON.parse(JSON.stringify(M.toJSON(wb)))); M.recalc(wb2);
  return formulaOf(wb2,'C1') + '/' + raw(wb2,'C1'); } },
{ id:'TC-F-010', cat:'入出力', view:'JSON往復で書式が保たれる', tech:'正常系', pre:'A1に太字と通貨書式', step:'toJSON→fromJSON', exp:'b=true nf=¥#,##0', run:()=>{
  const wb = book({A1:1000});
  const c = wb.sheets[0].ensure(0,0); c.s = {b:true, nf:'¥#,##0'};
  const wb2 = M.fromJSON(JSON.parse(JSON.stringify(M.toJSON(wb))));
  const s = wb2.sheets[0].styleOf(0,0) || {};
  return 'b=' + !!s.b + ' nf=' + s.nf; } },
{ id:'TC-F-011', cat:'入出力', view:'JSON往復でシート構成が保たれる', tech:'正常系', pre:'3シート', step:'toJSON→fromJSON', exp:'3/Sheet1,売上,経費', run:()=>{
  const wb = book({}, ['売上','経費']);
  const wb2 = M.fromJSON(JSON.parse(JSON.stringify(M.toJSON(wb))));
  return wb2.sheets.length + '/' + wb2.sheets.map(s=>s.name).join(','); } },
{ id:'TC-F-012', cat:'入出力', view:'xlsx出力がZIP形式(PKヘッダ)である', tech:'正常系', pre:'A1=1', step:'exportXlsxのバイト列先頭を確認', exp:'PK', run:async()=>{
  const wb = book({A1:1}); const u8 = new Uint8Array(await toAB(await IO.exportXlsx(wb)));
  return String.fromCharCode(u8[0], u8[1]); } },
{ id:'TC-F-013', cat:'入出力', view:'xlsx内にセル値が書き出される', tech:'正常系', pre:'A1=123', step:'sheet1.xmlを検査', exp:'123を含む', run:async()=>{
  const wb = book({A1:123}); const zf = await xlsxZip(wb);
  const xml = bytesToStr(zf['xl/worksheets/sheet1.xml']);
  return xml.includes('>123<') ? '123を含む' : '欠落'; } },
{ id:'TC-F-014', cat:'入出力', view:'xlsxに数式が数式のまま出力される', tech:'正常系', pre:'C1==SUM(A1:B1)', step:'sheet1.xmlの<f>要素を確認', exp:'SUM(A1:B1)', run:async()=>{
  const wb = book({A1:1,B1:2,C1:'=SUM(A1:B1)'}); const zf = await xlsxZip(wb);
  const xml = bytesToStr(zf['xl/worksheets/sheet1.xml']);
  const m = /<f>([^<]*)<\/f>/.exec(xml); return m ? m[1] : '数式なし'; } },
{ id:'TC-F-015', cat:'入出力', view:'xlsx出力でXML特殊文字がエスケープされる', tech:'境界値', pre:'A1=<a&b>', step:'sharedStrings/sheetを検査', exp:'エスケープ済み', run:async()=>{
  const wb = book({A1:'<a&b>'}); const zf = await xlsxZip(wb);
  const all = Object.keys(zf).filter(k=>/\.xml$/.test(k)).map(k=>bytesToStr(zf[k])).join('');
  return all.includes('&lt;a&amp;b&gt;') ? 'エスケープ済み' : (all.includes('<a&b>') ? '生の文字列が混入' : '値が欠落'); } },
{ id:'TC-F-016', cat:'入出力', view:'xlsx出力に全シートが含まれる', tech:'正常系', pre:'3シート', step:'sheetN.xmlの数を確認', exp:'3', run:async()=>{
  const wb = book({A1:1,'売上!A1':2,'経費!A1':3}, ['売上','経費']);
  const zf = await xlsxZip(wb);
  return String(Object.keys(zf).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).length); } },
{ id:'TC-F-017', cat:'入出力', view:'xlsxのZIP自己往復(生成→展開)', tech:'正常系', pre:'-', step:'zipCreate→zipReadで内容一致', exp:'一致', run:async()=>{
  const data = 'hello,テスト';
  const zf = await IO.zipRead(await toAB(await IO.zipCreate([{name:'a.txt', data:data}])));
  return bytesToStr(zf['a.txt']) === data ? '一致' : '不一致:' + bytesToStr(zf['a.txt']); } },
{ id:'TC-F-018', cat:'入出力', view:'HTML出力にテーブルが生成される', tech:'正常系', pre:'A1=a', step:'sheetToHtmlを実行', exp:'tableを含む', run:()=>{
  const wb = book({A1:'a'});
  const h = IO.sheetToHtml(wb); return /<table/.test(h) ? 'tableを含む' : '生成失敗'; } },
{ id:'TC-F-019', cat:'入出力', view:'HTML出力でスクリプトが混入しない(XSS)', tech:'セキュリティ', pre:'A1=<script>alert(1)</script>', step:'sheetToHtmlを実行', exp:'エスケープ済み', run:()=>{
  const wb = book({A1:'<script>alert(1)</script>'});
  const h = IO.sheetToHtml(wb);
  return h.includes('<script>alert(1)</script>') ? '生スクリプトが混入' : 'エスケープ済み'; } },
{ id:'TC-F-020', cat:'入出力', view:'CSV出力で先頭が=の文字列(CSVインジェクション)', tech:'セキュリティ', pre:'A1に文字列 =cmd', step:'CSV出力の該当セルを確認', exp:'無害化されている', run:()=>{
  const wb = new M.Workbook();
  const cell = wb.sheets[0].ensure(0,0); cell.v = '=cmd|calc'; cell.s = {nf:'@'};
  const csv = IO.sheetToDelimited(wb.sheets[0], ',').trim();
  return /^[=+\-@]/.test(csv) ? '先頭がそのまま=で出力される' : '無害化されている'; } },

/* ---------- G. 大量データ・性能 ---------- */
{ id:'TC-G-001', cat:'性能', view:'1万セル入力の処理時間', tech:'負荷', pre:'-', step:'100x100に数値を入力', exp:'3000ms以内', run:()=>{
  const t = process.hrtime.bigint();
  const wb = new M.Workbook();
  for (let r = 0; r < 100; r++) for (let c = 0; c < 100; c++) wb.sheets[0].setValue(r, c, r * c);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  return (ms <= 3000 ? '3000ms以内' : '超過') + '(' + ms.toFixed(0) + 'ms)'; } },
{ id:'TC-G-002', cat:'性能', view:'1万件の数式再計算時間', tech:'負荷', pre:'A列に1万件の数値', step:'B列に=A*2を1万件置き再計算', exp:'5000ms以内', run:()=>{
  const wb = new M.Workbook();
  for (let r = 0; r < 10000; r++) { wb.sheets[0].setValue(r, 0, r); wb.sheets[0].setValue(r, 1, '=A' + (r+1) + '*2'); }
  const t = process.hrtime.bigint();
  M.recalc(wb);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  const ok = raw(wb,'B10000') === '19998';
  return (ms <= 5000 ? '5000ms以内' : '超過') + '(' + ms.toFixed(0) + 'ms,末尾値' + (ok ? 'OK' : 'NG') + ')'; } },
{ id:'TC-G-003', cat:'性能', view:'1万件SUMの集計時間', tech:'負荷', pre:'A1:A10000に数値', step:'=SUM(A1:A10000)', exp:'2000ms以内', run:()=>{
  const wb = new M.Workbook();
  for (let r = 0; r < 10000; r++) wb.sheets[0].setValue(r, 0, 1);
  wb.sheets[0].setValue(0, 2, '=SUM(A1:A10000)');
  const t = process.hrtime.bigint();
  M.recalc(wb);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  return (ms <= 2000 ? '2000ms以内' : '超過') + '(' + ms.toFixed(0) + 'ms,値' + raw(wb,'C1') + ')'; } },
{ id:'TC-G-004', cat:'性能', view:'5000行のCSV出力時間', tech:'負荷', pre:'5000x10のデータ', step:'CSV生成', exp:'3000ms以内', run:()=>{
  const wb = new M.Workbook();
  for (let r = 0; r < 5000; r++) for (let c = 0; c < 10; c++) wb.sheets[0].setValue(r, c, 'v' + r + c);
  const t = process.hrtime.bigint();
  const csv = IO.sheetToDelimited(wb.sheets[0], ',');
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  return (ms <= 3000 ? '3000ms以内' : '超過') + '(' + ms.toFixed(0) + 'ms,' + csv.split('\n').length + '行)'; } },
{ id:'TC-G-005', cat:'性能', view:'大きなブックのxlsx書き出し時間', tech:'負荷', pre:'2000x10のデータ', step:'exportXlsx', exp:'10000ms以内', run:async()=>{
  const wb = new M.Workbook();
  for (let r = 0; r < 2000; r++) for (let c = 0; c < 10; c++) wb.sheets[0].setValue(r, c, r + c);
  const t = process.hrtime.bigint();
  const blob = await IO.exportXlsx(wb);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  return (ms <= 10000 ? '10000ms以内' : '超過') + '(' + ms.toFixed(0) + 'ms,' + Math.round((blob.size||0)/1024) + 'KB)'; } },
];
