/* テストケース : H 関数の深掘り(境界値・異常系) */
const L = require('./lib');
const { U, F, M, IO, calc, book, raw } = L;

module.exports = [
{ id:'TC-H-001', cat:'関数(条件集計)', view:'COUNTIFの条件をセル参照で組み立てる', tech:'組み合わせ', pre:'A1:A4=1,5,10,20 / C1=5', step:'=COUNTIF(A1:A4,">"&C1)', exp:'2', run:()=>calc({A1:1,A2:5,A3:10,A4:20,C1:5}, '=COUNTIF(A1:A4,">"&C1)') },
{ id:'TC-H-002', cat:'関数(条件集計)', view:'COUNTIFの条件が完全一致(文字列)', tech:'同値分割', pre:'A1:A3=x,X,y', step:'=COUNTIF(A1:A3,"x")', exp:'2', run:()=>calc({A1:'x',A2:'X',A3:'y'}, '=COUNTIF(A1:A3,"x")') },
{ id:'TC-H-003', cat:'関数(条件集計)', view:'COUNTIFのワイルドカード(?は1文字)', tech:'境界値', pre:'A1=ab,A2=abc', step:'=COUNTIF(A1:A2,"a?")', exp:'1', run:()=>calc({A1:'ab',A2:'abc'}, '=COUNTIF(A1:A2,"a?")') },
{ id:'TC-H-004', cat:'関数(条件集計)', view:'SUMIFS 条件範囲と合計範囲のサイズ不一致', tech:'異常系', pre:'C1:C2 と A1:A4', step:'=SUMIFS(C1:C2,A1:A4,"x")', exp:'#VALUE!', run:()=>calc({A1:'x',A2:'x',A3:'x',A4:'x',C1:1,C2:1}, '=SUMIFS(C1:C2,A1:A4,"x")') },
{ id:'TC-H-005', cat:'関数(条件集計)', view:'SUMIF 空条件は0件扱い', tech:'境界値', pre:'A1:A2=1,2', step:'=SUMIF(A1:A2,"")', exp:'0', run:()=>calc({A1:1,A2:2}, '=SUMIF(A1:A2,"")') },
{ id:'TC-H-006', cat:'関数(検索)', view:'VLOOKUP 近似一致で検索値が最小値未満', tech:'境界値', pre:'A=10,20 / B=中,高', step:'=VLOOKUP(5,A1:B2,2,TRUE)', exp:'#N/A', run:()=>calc({A1:10,B1:'中',A2:20,B2:'高'}, '=VLOOKUP(5,A1:B2,2,TRUE())') },
{ id:'TC-H-007', cat:'関数(検索)', view:'VLOOKUP 近似一致で検索値が最大値超', tech:'境界値', pre:'A=10,20', step:'=VLOOKUP(99,A1:B2,2,TRUE)', exp:'高', run:()=>calc({A1:10,B1:'中',A2:20,B2:'高'}, '=VLOOKUP(99,A1:B2,2,TRUE())') },
{ id:'TC-H-008', cat:'関数(検索)', view:'VLOOKUP 第4引数省略時は近似一致', tech:'エラー推測', pre:'A=10,20', step:'=VLOOKUP(15,A1:B2,2)', exp:'中', run:()=>calc({A1:10,B1:'中',A2:20,B2:'高'}, '=VLOOKUP(15,A1:B2,2)') },
{ id:'TC-H-009', cat:'関数(検索)', view:'MATCH 一致モード1(以下の最大値)', tech:'境界値', pre:'A1:A3=10,20,30', step:'=MATCH(25,A1:A3,1)', exp:'2', run:()=>calc({A1:10,A2:20,A3:30}, '=MATCH(25,A1:A3,1)') },
{ id:'TC-H-010', cat:'関数(検索)', view:'MATCH 一致モード-1(降順で以上の最小値)', tech:'境界値', pre:'A1:A3=30,20,10', step:'=MATCH(25,A1:A3,-1)', exp:'1', run:()=>calc({A1:30,A2:20,A3:10}, '=MATCH(25,A1:A3,-1)') },
{ id:'TC-H-011', cat:'関数(検索)', view:'MATCH 見つからない場合は#N/A', tech:'異常系', pre:'A1:A3=x,y,z', step:'=MATCH("q",A1:A3,0)', exp:'#N/A', run:()=>calc({A1:'x',A2:'y',A3:'z'}, '=MATCH("q",A1:A3,0)') },
{ id:'TC-H-012', cat:'関数(検索)', view:'INDEX 範囲外指定は#REF!', tech:'異常系', pre:'A1:B2', step:'=INDEX(A1:B2,5,1)', exp:'#REF!', run:()=>calc({A1:1,B1:2,A2:3,B2:4}, '=INDEX(A1:B2,5,1)') },
{ id:'TC-H-013', cat:'関数(検索)', view:'CHOOSE 範囲外の番号は#VALUE!', tech:'異常系', pre:'-', step:'=CHOOSE(5,"a","b")', exp:'#VALUE!', run:()=>calc({}, '=CHOOSE(5,"a","b")') },
{ id:'TC-H-014', cat:'関数(文字列)', view:'LEFT 文字数が負なら#VALUE!', tech:'異常系', pre:'-', step:'=LEFT("abc",-1)', exp:'#VALUE!', run:()=>calc({}, '=LEFT("abc",-1)') },
{ id:'TC-H-015', cat:'関数(文字列)', view:'LEFT 文字数が文字列長超なら全体', tech:'境界値', pre:'-', step:'=LEFT("abc",10)', exp:'abc', run:()=>calc({}, '=LEFT("abc",10)') },
{ id:'TC-H-016', cat:'関数(文字列)', view:'FIND 開始位置つき検索', tech:'境界値', pre:'-', step:'=FIND("a","banana",4)', exp:'4', run:()=>calc({}, '=FIND("a","banana",4)') },
{ id:'TC-H-017', cat:'関数(文字列)', view:'SUBSTITUTE 出現回数指定', tech:'境界値', pre:'-', step:'=SUBSTITUTE("a-a-a","-","+",2)', exp:'a-a+a', run:()=>calc({}, '=SUBSTITUTE("a-a-a","-","+",2)') },
{ id:'TC-H-018', cat:'関数(文字列)', view:'空セルのLENは0', tech:'境界値', pre:'A1は空', step:'=LEN(A1)', exp:'0', run:()=>calc({}, '=LEN(A1)') },
{ id:'TC-H-019', cat:'関数(文字列)', view:'CONCATは範囲を連結できる', tech:'正常系', pre:'A1:A3=a,b,c', step:'=CONCAT(A1:A3)', exp:'abc', run:()=>calc({A1:'a',A2:'b',A3:'c'}, '=CONCAT(A1:A3)') },
{ id:'TC-H-020', cat:'関数(文字列)', view:'CODE/CHAR の往復', tech:'正常系', pre:'-', step:'=CHAR(CODE("A"))', exp:'A', run:()=>calc({}, '=CHAR(CODE("A"))') },
{ id:'TC-H-021', cat:'関数(文字列)', view:'TEXT 和暦風フォーマット(yyyy年m月d日)', tech:'正常系', pre:'-', step:'=TEXT(DATE(2026,8,5),"yyyy年m月d日")', exp:'2026年8月5日', run:()=>calc({}, '=TEXT(DATE(2026,8,5),"yyyy年m月d日")') },
{ id:'TC-H-022', cat:'関数(文字列)', view:'TEXT 時刻フォーマット', tech:'正常系', pre:'-', step:'=TEXT(TIME(9,5,0),"hh:mm")', exp:'09:05', run:()=>calc({}, '=TEXT(TIME(9,5,0),"hh:mm")') },
{ id:'TC-H-023', cat:'関数(数値)', view:'MOD 小数の剰余', tech:'境界値', pre:'-', step:'=ROUND(MOD(5.5,2),2)', exp:'1.5', run:()=>calc({}, '=ROUND(MOD(5.5,2),2)') },
{ id:'TC-H-024', cat:'関数(数値)', view:'POWER 負数の分数乗は#NUM!', tech:'異常系', pre:'-', step:'=POWER(-8,1/3)', exp:'#NUM!', run:()=>calc({}, '=POWER(-8,1/3)') },
{ id:'TC-H-025', cat:'関数(数値)', view:'LOG 底の指定', tech:'正常系', pre:'-', step:'=LOG(8,2)', exp:'3', run:()=>calc({}, '=LOG(8,2)') },
{ id:'TC-H-026', cat:'関数(数値)', view:'SIGN の符号判定', tech:'同値分割', pre:'-', step:'=SIGN(-3)&SIGN(0)&SIGN(3)', exp:'-101', run:()=>calc({}, '=SIGN(-3)&SIGN(0)&SIGN(3)') },
{ id:'TC-H-027', cat:'関数(数値)', view:'RANDBETWEEN が範囲内に収まる', tech:'境界値', pre:'-', step:'=RANDBETWEEN(1,3)を100回', exp:'すべて範囲内', run:()=>{
  for (let i = 0; i < 100; i++) {
    const v = Number(calc({}, '=RANDBETWEEN(1,3)'));
    if (!(v >= 1 && v <= 3 && Number.isInteger(v))) return '範囲外:' + v;
  }
  return 'すべて範囲内'; } },
{ id:'TC-H-028', cat:'関数(数値)', view:'12桁以上の整数はExcel同様に指数表記になる(仮数部の桁数も一致)', tech:'境界値', pre:'-', step:'=999999999999+1', exp:'1E+12', run:()=>calc({}, '=999999999999+1') },
{ id:'TC-H-029', cat:'関数(数値)', view:'小さな小数の合計精度', tech:'境界値', pre:'A1:A3=0.1', step:'=SUM(A1:A3)', exp:'0.3', run:()=>calc({A1:0.1,A2:0.1,A3:0.1}, '=SUM(A1:A3)') },
{ id:'TC-H-030', cat:'関数(日付)', view:'DATEDIF 終了日が開始日より前は#NUM!', tech:'異常系', pre:'-', step:'=DATEDIF(DATE(2026,5,1),DATE(2026,1,1),"D")', exp:'#NUM!', run:()=>calc({}, '=DATEDIF(DATE(2026,5,1),DATE(2026,1,1),"D")') },
{ id:'TC-H-031', cat:'関数(日付)', view:'EOMONTH 過去方向(-1か月)', tech:'境界値', pre:'-', step:'=DAY(EOMONTH(DATE(2026,3,15),-1))', exp:'28', run:()=>calc({}, '=DAY(EOMONTH(DATE(2026,3,15),-1))') },
{ id:'TC-H-032', cat:'関数(日付)', view:'EDATE 過去方向でも月末補正される', tech:'境界値', pre:'-', step:'=DAY(EDATE(DATE(2026,3,31),-1))', exp:'28', run:()=>calc({}, '=DAY(EDATE(DATE(2026,3,31),-1))') },
{ id:'TC-H-033', cat:'関数(日付)', view:'WEEKDAY 種類2(月曜=1)', tech:'境界値', pre:'2026/8/23は日曜', step:'=WEEKDAY(DATE(2026,8,23),2)', exp:'7', run:()=>calc({}, '=WEEKDAY(DATE(2026,8,23),2)') },
{ id:'TC-H-034', cat:'関数(日付)', view:'日付シリアルの起点(1900/1/1=1)', tech:'境界値', pre:'-', step:'=DATE(1900,1,1)', exp:'1', run:()=>calc({}, '=DATE(1900,1,1)') },
{ id:'TC-H-035', cat:'関数(日付)', view:'時刻の境界(23:59:59)', tech:'境界値', pre:'-', step:'=TEXT(TIME(23,59,59),"hh:mm:ss")', exp:'23:59:59', run:()=>calc({}, '=TEXT(TIME(23,59,59),"hh:mm:ss")') },
{ id:'TC-H-036', cat:'関数(日付)', view:'DATE 0日指定は前月末', tech:'境界値', pre:'-', step:'=DAY(DATE(2026,3,0))', exp:'28', run:()=>calc({}, '=DAY(DATE(2026,3,0))') },
{ id:'TC-H-037', cat:'関数(統計)', view:'LARGE の順位が件数超なら#NUM!', tech:'異常系', pre:'A1:A2=1,2', step:'=LARGE(A1:A2,5)', exp:'#NUM!', run:()=>calc({A1:1,A2:2}, '=LARGE(A1:A2,5)') },
{ id:'TC-H-038', cat:'関数(統計)', view:'MEDIAN 奇数個は中央値', tech:'境界値', pre:'A1:A3=1,100,2', step:'=MEDIAN(A1:A3)', exp:'2', run:()=>calc({A1:1,A2:100,A3:2}, '=MEDIAN(A1:A3)') },
{ id:'TC-H-039', cat:'関数(統計)', view:'STDEV 1件のみは#DIV/0!', tech:'異常系', pre:'A1=5', step:'=STDEV(A1:A1)', exp:'#DIV/0!', run:()=>calc({A1:5}, '=STDEV(A1:A1)') },
{ id:'TC-H-040', cat:'関数(統計)', view:'VAR/VARP の関係(VAR>VARP)', tech:'正常系', pre:'A1:A4=2,4,4,6', step:'=IF(VAR(A1:A4)>VARP(A1:A4),"OK","NG")', exp:'OK', run:()=>calc({A1:2,A2:4,A3:4,A4:6}, '=IF(VAR(A1:A4)>VARP(A1:A4),"OK","NG")') },
{ id:'TC-H-041', cat:'関数(情報)', view:'NA()と#N/Aの一致', tech:'正常系', pre:'-', step:'=ISNA(NA())', exp:'TRUE', run:()=>calc({}, '=ISNA(NA())') },
{ id:'TC-H-042', cat:'関数(情報)', view:'ISODD/ISEVEN の負数', tech:'境界値', pre:'-', step:'=ISODD(-3)&"/"&ISEVEN(-2)', exp:'TRUE/TRUE', run:()=>calc({}, '=ISODD(-3)&"/"&ISEVEN(-2)') },
{ id:'TC-H-043', cat:'関数(情報)', view:'ISTEXT は数値でFALSE', tech:'同値分割', pre:'A1=1', step:'=ISTEXT(A1)', exp:'FALSE', run:()=>calc({A1:1}, '=ISTEXT(A1)') },
{ id:'TC-H-044', cat:'数式エンジン', view:'数値と数値文字列は等しくない(Excel仕様)', tech:'エラー推測', pre:'-', step:'=("10"=10)', exp:'FALSE', run:()=>calc({}, '=("10"=10)') },
{ id:'TC-H-045', cat:'数式エンジン', view:'負のパーセント入力', tech:'境界値', pre:'-', step:'=-25%', exp:'-0.25', run:()=>calc({}, '=-25%') },
{ id:'TC-H-046', cat:'表示形式', view:'負の通貨表示', tech:'境界値', pre:'-', step:'-1234 に ¥#,##0 を適用', exp:'-¥1,234', run:()=>U.formatValue(-1234, '¥#,##0') },
{ id:'TC-H-047', cat:'表示形式', view:'小数の丸め表示(四捨五入)', tech:'境界値', pre:'-', step:'2.345 に 0.00 を適用', exp:'2.35', run:()=>U.formatValue(2.345, '0.00') },
{ id:'TC-H-048', cat:'表示形式', view:'極大値のGeneral表示(指数表記の書式)', tech:'境界値', pre:'-', step:'1e21 を General 表示', exp:'1E+21', run:()=>U.generalFormat(1e21) },
{ id:'TC-H-049', cat:'表示形式', view:'エラー値を含むセルのCSV出力', tech:'異常系', pre:'A1==1/0', step:'CSV出力', exp:'#DIV/0!', run:()=>{
  const wb = book({A1:'=1/0'}); return IO.sheetToDelimited(wb.sheets[0], ',').trim(); } },
{ id:'TC-H-050', cat:'表示形式', view:'長い文字列(1万文字)の入力と保持', tech:'負荷', pre:'-', step:'1万文字を入力しLENを確認', exp:'10000', run:()=>{
  const wb = new M.Workbook(); wb.sheets[0].setValue(0, 0, 'あ'.repeat(10000));
  wb.sheets[0].setValue(0, 1, '=LEN(A1)'); M.recalc(wb); return raw(wb,'B1'); } },
];
