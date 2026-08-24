/* テスト実行ヘルパ : セル入力 -> 再計算 -> 表示値の取得 まで実アプリと同じ経路を通す */
const { loadApp } = require('./harness');
const S = loadApp();
const { U, F, M, IO } = S;

function show(v) {
  if (v === null || v === undefined) return '';
  if (F.isErr(v)) return v.err;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return U.generalFormat(v);
  return String(v);
}

/* cells: {A1:10, B2:'=SUM(A1:A3)'} 形式。target 省略時は最後に置いた式の値 */
function book(cells, sheetNames) {
  const wb = new M.Workbook();
  (sheetNames || []).forEach((n) => wb.addSheet(n));
  for (const key of Object.keys(cells || {})) {
    let sheetName = null, addr = key;
    if (key.includes('!')) { const p = key.split('!'); sheetName = p[0]; addr = p[1]; }
    const sh = sheetName ? wb.byName(sheetName) : wb.sheets[0];
    const rc = U.parseA1(addr);
    sh.setValue(rc.r, rc.c, cells[key]);
  }
  M.recalc(wb);
  return wb;
}

/* 数式の計算結果を表示値で返す */
function calc(cells, formula, target) {
  const c = Object.assign({}, cells);
  const at = target || 'Z1';
  if (formula !== undefined) c[at] = formula;
  const wb = book(c);
  const rc = U.parseA1(at);
  return show(wb.sheets[0].displayValue(rc.r, rc.c));
}

/* 表示形式を通した文字列を返す(セルに書式を適用した見た目) */
function disp(wb, addr, sheetIdx) {
  const sh = wb.sheets[sheetIdx || 0];
  const rc = U.parseA1(addr);
  const cell = sh.get(rc.r, rc.c);
  const v = sh.displayValue(rc.r, rc.c);
  if (F.isErr(v)) return v.err;
  const nf = (cell && cell.s && cell.s.nf) || 'General';
  return U.formatValue(v, nf);
}

function editText(wb, addr, sheetIdx) {
  const sh = wb.sheets[sheetIdx || 0];
  const rc = U.parseA1(addr);
  return sh.editText(rc.r, rc.c);
}

function raw(wb, addr, sheetIdx) {
  const sh = wb.sheets[sheetIdx || 0];
  const rc = U.parseA1(addr);
  return show(sh.displayValue(rc.r, rc.c));
}

function formulaOf(wb, addr, sheetIdx) {
  const sh = wb.sheets[sheetIdx || 0];
  const rc = U.parseA1(addr);
  const cell = sh.get(rc.r, rc.c);
  return cell && cell.f ? '=' + cell.f : '';
}

module.exports = { S, U, F, M, IO, show, book, calc, disp, editText, raw, formulaOf };
