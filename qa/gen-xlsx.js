/* テストケース一覧 / 不具合一覧 を xlsx として書き出す
   ※ 書き出しには被テストアプリ Exitcel 自身の xlsx エクスポータを使用（ドッグフーディング） */
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./harness');
const S = loadApp();
const { U, M, IO } = S;

const node = require('./results.json');
const ui = require('./ui-results.json');
const defects = require('./defects');
const all = node.concat(ui);

const HEAD = { b: true, bg: '#e8f1fb', bd: { t: 1, b: 1, l: 1, r: 1 } };

function sheetFromRows(sh, rows, widths) {
  rows.forEach((row, r) => {
    row.forEach((v, c) => {
      sh.setValue(r, c, v === null || v === undefined ? '' : String(v));
      if (r === 0) { const cell = sh.ensure(r, c); cell.s = Object.assign({}, HEAD); }
    });
  });
  widths.forEach((w, c) => { sh.colW[c] = w; });
  sh.freeze = { r: 1, c: 0 };
}

(async () => {
  const wb = new M.Workbook();

  /* --- サマリ --- */
  const s0 = wb.sheets[0];
  s0.name = 'サマリ';
  const pass = all.filter(r => r.status === 'PASS').length;
  const cats = {};
  all.forEach(r => { cats[r.cat] = cats[r.cat] || { p: 0, f: 0 }; cats[r.cat][r.status === 'PASS' ? 'p' : 'f']++; });
  const sumRows = [
    ['項目', '内容'],
    ['テスト対象', 'Exitcel v1.0（ローカル完結型 Web 表計算アプリ / 約6,000行・JavaScript）'],
    ['テスト種別', '機能テスト・境界値テスト・異常系テスト・性能テスト・回帰テスト'],
    ['テストケース数', all.length],
    ['実行数', all.length],
    ['合格', pass],
    ['不合格', all.length - pass],
    ['合格率', Math.round(pass / all.length * 1000) / 10 + '%'],
    ['起票した不具合', defects.length],
    ['実行環境', 'Windows 11 / Node.js（ロジック層）/ Chromium ブラウザ実機（UI層）'],
    ['', ''],
    ['カテゴリ', '合格 / 実行'],
  ];
  Object.keys(cats).sort().forEach(k => sumRows.push([k, cats[k].p + ' / ' + (cats[k].p + cats[k].f)]));
  sheetFromRows(s0, sumRows, [260, 620]);

  /* --- テストケース一覧 --- */
  const s1 = wb.addSheet('テストケース一覧');
  const tcRows = [['ケースID', '大分類', 'テスト観点', 'テスト技法', '前提条件', 'テスト手順', '期待結果', '実行結果', '判定']];
  all.forEach(r => tcRows.push([r.id, r.cat, r.view, r.tech, r.pre, r.step, r.exp, r.act, r.status]));
  sheetFromRows(s1, tcRows, [96, 132, 330, 110, 210, 300, 220, 220, 66]);
  // 判定列の色分け
  for (let r = 1; r < tcRows.length; r++) {
    const cell = s1.ensure(r, 8);
    cell.s = { b: true, fc: tcRows[r][8] === 'PASS' ? '#1a7f37' : '#c0392b' };
  }

  /* --- 不具合一覧 --- */
  const s2 = wb.addSheet('不具合一覧');
  const bugRows = [['不具合ID', '概要', '分類', '重要度', '優先度', '状態', '再現手順', '期待結果', '実際の結果', '影響', '原因調査', '修正方針', '検出ケース']];
  defects.forEach(d => bugRows.push([d.id, d.title, d.cat, d.sev, d.pri, d.status, d.steps.map((s, i) => (i + 1) + '. ' + s).join(' / '), d.expected, d.actual, d.impact, d.cause, d.fix, d.found]));
  sheetFromRows(s2, bugRows, [96, 380, 190, 80, 70, 120, 420, 260, 240, 420, 460, 380, 190]);

  M.recalc(wb);

  const blob = await IO.exportXlsx(wb);
  const buf = Buffer.from(await blob.arrayBuffer());
  const outDir = process.argv[2] || __dirname;
  fs.writeFileSync(path.join(outDir, 'exitcel-qa-testcases.xlsx'), buf);

  // CSV（テストケース一覧のみ）
  const csv = '﻿' + IO.sheetToDelimited(s1, ',');
  fs.writeFileSync(path.join(outDir, 'exitcel-qa-testcases.csv'), csv, 'utf8');

  console.log('xlsx:', Math.round(buf.length / 1024) + 'KB', '/ csv:', Math.round(csv.length / 1024) + 'KB');
  console.log('ケース', all.length, 'PASS', pass, 'FAIL', all.length - pass, '不具合', defects.length);
})();
