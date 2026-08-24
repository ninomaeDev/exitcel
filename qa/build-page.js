/* QAテスト実施記録ページを、実際のテスト結果データから生成する */
const fs = require('fs');
const path = require('path');

const node = require('./results.json');
const ui = require('./ui-results.json');
const defects = require('./defects');
const all = node.concat(ui);

const OUT = process.argv[2] || path.join(__dirname, 'qa-portfolio.html');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pass = all.filter((r) => r.status === 'PASS').length;
const fail = all.length - pass;
const rate = (pass / all.length * 100).toFixed(1);

/* カテゴリ集計 */
const catOrder = [];
const cats = {};
all.forEach((r) => {
  if (!cats[r.cat]) { cats[r.cat] = { p: 0, f: 0, tech: {} }; catOrder.push(r.cat); }
  cats[r.cat][r.status === 'PASS' ? 'p' : 'f']++;
  cats[r.cat].tech[r.tech] = (cats[r.cat].tech[r.tech] || 0) + 1;
});
const catRows = catOrder
  .map((c) => ({ cat: c, ...cats[c], n: cats[c].p + cats[c].f }))
  .sort((a, b) => b.n - a.n);

/* 技法集計 */
const techs = {};
all.forEach((r) => { techs[r.tech] = (techs[r.tech] || 0) + 1; });
const techRows = Object.keys(techs).map((t) => ({ t, n: techs[t] })).sort((a, b) => b.n - a.n);

/* 代表ケース(合格・不合格を混ぜた抜粋) */
const sampleIds = ['TC-A-004', 'TC-B-019', 'TC-B-055', 'TC-C-012', 'TC-D-002', 'TC-E-007', 'TC-F-015', 'TC-G-002', 'TC-U-014', 'TC-U-034', 'TC-B-079', 'TC-U-045'];
const samples = sampleIds.map((id) => all.find((r) => r.id === id)).filter(Boolean);

/* 不合格ケース一覧 */
const failed = all.filter((r) => r.status === 'FAIL');

/* テスト設計の是正 */
const fixes = [
  { id: 'TC-E-009', kind: '期待結果の誤り', before: '「007」と入力したら文字列 007 のまま保持されることを期待', after: 'Excel でも先頭ゼロは失われ数値 7 になる。期待結果を「7」に修正し、文字列書式のセルで保持されることを確認する TC-E-009b を追加' },
  { id: 'TC-H-044', kind: '期待結果の誤り', before: '="10"=10 は TRUE を期待（型を寄せて比較すると想定）', after: 'Excel は文字列と数値を等しいと見なさない。期待結果を FALSE に修正。アプリの実装が正しく、テスト側の誤りだった' },
  { id: 'TC-D-005', kind: 'ケース設計の不備', before: '「A1 を参照する B1」を用意して1行目を削除し #REF! を確認しようとした', after: '検証したいセル自身が削除対象行に含まれていたため確認不能。参照元を B5 に移し、削除後の B4 を確認する手順に変更' },
  { id: 'TC-U-032', kind: '期待結果の書き方の不備', before: '期待結果を「2x2」とだけ記述し、判定が主観的になっていた', after: '「A1=1 B1=2 A2=3 B2=4」とセル単位で明記し、誰が実行しても同じ判定になる書き方へ修正' },
];

/* SVG 横棒グラフ */
function barChart(rows) {
  const top = rows.slice(0, 12);
  const rowH = 30, padTop = 8, labelW = 168, barW = 520;
  const h = padTop + top.length * rowH + 8;
  const max = Math.max(...top.map((r) => r.n));
  let s = `<svg viewBox="0 0 ${labelW + barW + 70} ${h}" role="img" aria-label="カテゴリ別のテスト結果">`;
  top.forEach((r, i) => {
    const y = padTop + i * rowH;
    const w = Math.round(r.n / max * barW);
    const pw = Math.round(r.p / r.n * w);
    s += `<text x="0" y="${y + 15}" class="s">${esc(r.cat)}</text>`;
    s += `<rect x="${labelW}" y="${y + 3}" width="${w}" height="15" rx="3" fill="#d6413a" opacity="0.85"></rect>`;
    s += `<rect x="${labelW}" y="${y + 3}" width="${pw}" height="15" rx="3" fill="#0066cc"></rect>`;
    s += `<text x="${labelW + w + 8}" y="${y + 15}" class="s">${r.p}/${r.n}</text>`;
  });
  s += '</svg>';
  return s;
}

const sevPill = (sev) => sev.indexOf('中') === 0 ? 'pill warn' : 'pill';

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ソフトウェア評価検証(QA)実施記録</title>
<style>
  :root {
    --canvas: #f5f5f7;
    --band: #f5f5f7;
    --card: #ffffff;
    --ink: #1d1d1f;
    --ink-2: #4b4b50;
    --muted: #6e6e73;
    --hairline: #e3e3e8;
    --hairline-soft: #ececf0;
    --accent: #0066cc;
    --accent-soft: #e8f1fb;
    --pill-bg: #ffffff;
    --arrow: #8e8e93;
    --ok: #1a7f37;
    --ng: #c0392b;
    --warn-soft: #fdf1e7;
    --warn-ink: #a2560d;
    --radius: 14px;
  }
  body {
    background: var(--canvas);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic UI", "Segoe UI", Meiryo, sans-serif;
    font-size: 15.5px;
    line-height: 1.8;
    margin: 0;
  }
  .band { padding: 44px 20px; }
  .band.alt { background: var(--band); }
  .inner { max-width: 900px; margin: 0 auto; }
  .inner.wide { max-width: 1060px; }
  .eyebrow {
    font-size: 12px; font-weight: 600; letter-spacing: 0.09em;
    text-transform: uppercase; color: var(--accent); margin: 0 0 12px;
  }
  h1 { font-size: clamp(27px, 5vw, 33px); font-weight: 600; line-height: 1.3; letter-spacing: -0.018em; margin: 0 0 16px; text-wrap: balance; }
  h2 { font-size: 22px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.25; margin: 0 0 10px; text-wrap: balance; }
  h3 { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin: 40px 0 6px; }
  .lead { font-size: 16px; color: var(--muted); margin: 0 0 28px; max-width: 42em; }
  p { margin: 0 0 14px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; background: var(--accent-soft); padding: 1px 6px; border-radius: 5px; }
  ul { margin: 0 0 14px; padding-left: 1.35em; }
  ul li { margin-bottom: 7px; }
  h3 + p, h3 + .tablewrap, h3 + .cards, h3 + .memo { margin-top: 10px; }

  nav.docnav { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 30px; }
  nav.docnav a {
    padding: 6px 14px; border-radius: 999px; border: 1px solid var(--hairline);
    background: var(--card); font-size: 13px; color: var(--ink-2); text-decoration: none;
  }
  nav.docnav a:hover { color: var(--accent); border-color: var(--accent); text-decoration: none; }
  nav.docnav a.current { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 600; }

  .pill {
    display: inline-block; font-size: 12.5px; font-weight: 600; padding: 3px 12px;
    border-radius: 999px; border: 1px solid var(--hairline); background: var(--pill-bg);
    color: var(--ink-2); white-space: nowrap;
  }
  .pill.blue { background: var(--accent); color: #fff; border-color: var(--accent); }
  .pill.soft-blue { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
  .pill.warn { background: var(--warn-soft); color: var(--warn-ink); border-color: transparent; }
  .pill.ok { background: #e7f5ec; color: var(--ok); border-color: transparent; }
  .meta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }

  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-top: 36px; }
  .fact { background: var(--card); border: 1px solid var(--hairline); border-radius: var(--radius); padding: 18px 20px; }
  .fact .k { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
  .fact .v { font-size: 16px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; }
  .fact .v small { display: block; font-weight: 400; color: var(--muted); font-size: 13px; }
  .fact .v em { font-style: normal; font-size: 26px; letter-spacing: -0.02em; }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; margin-top: 20px; }
  .tcard { background: var(--card); border: 1px solid var(--hairline); border-radius: var(--radius); padding: 20px 22px; display: flex; flex-direction: column; gap: 8px; }
  .tcard .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .tcard .name { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
  .tcard .oneword { font-size: 13.5px; color: var(--accent); font-weight: 600; }
  .tcard .desc { font-size: 14px; color: var(--muted); line-height: 1.75; margin: 0; }
  .tcard .desc b { color: var(--ink); font-weight: 600; }

  .flowlist { counter-reset: step; list-style: none; margin: 18px 0 0; padding: 0; }
  .flowlist li { counter-increment: step; position: relative; padding: 0 0 22px 56px; }
  .flowlist li::before {
    content: counter(step); position: absolute; left: 0; top: 0;
    width: 34px; height: 34px; border-radius: 999px; background: var(--accent);
    color: #fff; font-weight: 700; font-size: 15px; display: flex; align-items: center; justify-content: center;
  }
  .flowlist li::after { content: ""; position: absolute; left: 16.5px; top: 40px; bottom: 4px; border-left: 1px solid var(--hairline); }
  .flowlist li:last-child::after { display: none; }
  .flowlist .st { font-weight: 600; }
  .flowlist .sd { font-size: 14px; color: var(--muted); }

  .tablewrap { overflow-x: auto; border: 1px solid var(--hairline); border-radius: var(--radius); background: var(--card); margin-top: 20px; }
  table { border-collapse: collapse; width: 100%; min-width: 640px; font-size: 14.5px; }
  th, td { text-align: left; padding: 13px 18px; border-bottom: 1px solid var(--hairline-soft); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  th { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--hairline); white-space: nowrap; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; white-space: nowrap; }
  td b { font-weight: 600; }
  td small { color: var(--muted); }
  .ok { color: var(--ok); font-weight: 700; }
  .ng { color: var(--ng); font-weight: 700; }

  .chartwrap { border: 1px solid var(--hairline); border-radius: var(--radius); background: var(--card); padding: 18px 20px; margin-top: 20px; overflow-x: auto; }
  .chartwrap svg { display: block; min-width: 700px; width: 100%; height: auto; }
  svg .s { font-size: 12px; fill: var(--ink-2); }
  .legend { display: flex; gap: 22px; flex-wrap: wrap; font-size: 13px; color: var(--muted); margin-top: 12px; }
  .legend span { display: inline-flex; align-items: center; gap: 8px; }
  .legend i { display: inline-block; width: 16px; height: 10px; border-radius: 2px; }

  .bug { background: var(--card); border: 1px solid var(--hairline); border-radius: var(--radius); padding: 22px 24px; margin-top: 16px; }
  .bug .bhead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
  .bug .bid { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: var(--accent); font-weight: 700; }
  .bug .btitle { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
  .bug dl { display: grid; grid-template-columns: 96px 1fr; gap: 6px 16px; margin: 14px 0 0; font-size: 14.5px; }
  .bug dt { font-size: 12px; font-weight: 600; letter-spacing: 0.05em; color: var(--muted); padding-top: 4px; }
  .bug dd { margin: 0; }
  .bug ol { margin: 0; padding-left: 1.25em; }
  .bug .exp { color: var(--ok); font-weight: 600; }
  .bug .act { color: var(--ng); font-weight: 600; }

  .memo { display: grid; gap: 12px; margin-top: 20px; }
  .memo .m { background: var(--card); border: 1px solid var(--hairline); border-radius: var(--radius); padding: 16px 20px; }
  .memo .m .mt { font-weight: 600; margin-bottom: 2px; }
  .memo .m .md { font-size: 14px; color: var(--muted); margin: 0; }

  .dl { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
  .dl a {
    display: inline-flex; align-items: center; gap: 10px; padding: 14px 20px;
    background: var(--card); border: 1px solid var(--hairline); border-radius: var(--radius);
    text-decoration: none; color: var(--ink);
  }
  .dl a:hover { border-color: var(--accent); text-decoration: none; }
  .dl a .t { font-weight: 600; }
  .dl a .d { font-size: 13px; color: var(--muted); display: block; font-weight: 400; }

  footer.pageend { padding: 48px 24px 64px; background: var(--band); border-top: 1px solid var(--hairline); }
  footer.pageend .inner { display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: var(--muted); }
  .linkrow { display: flex; flex-wrap: wrap; gap: 8px 20px; }

  .demo-note { background: var(--accent-soft); border-bottom: 1px solid var(--hairline); padding: 16px 24px; font-size: 14px; line-height: 1.8; }
  .demo-note .inner { max-width: 900px; margin: 0 auto; }
  .demo-note b { color: var(--accent); }

  @media (max-width: 640px) {
    .band { padding: 52px 18px; }
    .bug dl { grid-template-columns: 1fr; gap: 2px 0; }
    .bug dt { padding-top: 10px; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .tcard, .fact { transition: border-color 0.2s ease; }
    .tcard:hover, .fact:hover { border-color: var(--arrow); }
  }
</style>
</head>
<body>

<div class="demo-note">
  <div class="inner">
    ℹ️ このページは<b>ソフトウェアの評価検証(QA)の実施記録</b>です。テスト対象は、私が個人開発したローカル完結型の表計算アプリ「Exitcel」。開発者としてではなく<b>テスト担当者の立場で</b>、テスト計画・テストケース設計・テスト実行・不具合報告までを一通り行いました。掲載している数値・不合格ケース・不具合票は、すべて<b>実際に実行した結果そのもの</b>です。
  </div>
</div>

<header class="band">
  <div class="inner">
    <nav class="docnav" aria-label="関連ドキュメント">
      <a href="/portfolio">← ポートフォリオ一覧</a>
      <a href="/qa-portfolio" class="current" aria-current="page">QAテスト実施記録</a>
      <a href="/tech-portfolio">Webサイト 技術ポートフォリオ</a>
      <a href="/questodo/">QuesToDo 開発ポートフォリオ</a>
    </nav>
    <p class="eyebrow">QA / Software Testing</p>
    <h1>自作アプリを「第三者の目」でテストした記録</h1>
    <p class="lead">Excel 互換をうたう自作の表計算アプリ(約6,000行)に対して、テスト観点の洗い出しから ${all.length} 件のテストケース設計、全件実行、そして ${defects.length} 件の不具合起票までを一通り実施しました。テストケース1件ごとの前提・手順・期待結果・実行結果を残し、不合格になったものは再現手順と原因調査つきの不具合報告票にまとめています。実行は自動化してあり、<b>${all.length} 件を約2.9秒で何度でも回せます</b>。その「自動テストを回す」が具体的に何をすることなのかも、<a href="#automation">専門用語なしで説明しています</a>。</p>
    <div class="meta-row">
      <span class="pill blue">テストケース ${all.length} 件</span>
      <span class="pill">合格率 ${rate}%</span>
      <span class="pill soft-blue">全件の自動実行 約2.9秒</span>
      <span class="pill warn">起票した不具合 ${defects.length} 件</span>
      <span class="pill soft-blue">テスト技法 ${techRows.length} 種を使い分け</span>
      <span class="pill">実施日 2026年8月23日</span>
    </div>
    <div class="facts">
      <div class="fact"><div class="k">テストケース</div><div class="v"><em>${all.length}</em> 件<small>ロジック層 ${node.length} 件 / UI実機 ${ui.length} 件</small></div></div>
      <div class="fact"><div class="k">実行結果</div><div class="v"><em>${pass}</em> 合格 / ${fail} 不合格<small>合格率 ${rate}%（全件実行・未実施 0 件）</small></div></div>
      <div class="fact"><div class="k">起票した不具合</div><div class="v"><em>${defects.length}</em> 件<small>重要度「中」${defects.filter((d) => d.sev.indexOf('中') === 0).length} 件 / 「軽微」${defects.filter((d) => d.sev.indexOf('軽微') === 0).length} 件</small></div></div>
      <div class="fact"><div class="k">テスト対象</div><div class="v">Exitcel v1.0<small>JavaScript 約6,000行 / 内蔵関数 119 / xlsx 入出力を自前実装</small></div></div>
    </div>
  </div>
</header>

<section class="band alt">
  <div class="inner">
    <p class="eyebrow">Scope</p>
    <h2>何をテストしたか</h2>
    <p class="lead">テスト対象は「ブラウザだけで動く Excel ライクな表計算アプリ」です。<b>Excel と同じ操作をしたら Excel と同じ結果になるか</b>を判定基準（期待結果の根拠）に置きました。Excel 互換をうたう以上、利用者は Excel の挙動を前提に使うためです。</p>
    <div class="cards">
      <div class="tcard">
        <div class="head"><span class="name">テスト範囲に含めたもの</span></div>
        <p class="desc">数式エンジン（演算子・型変換・エラー処理）、内蔵関数 119 個のうち主要 60 個、セル参照とシート間参照、行・列の挿入削除にともなう数式の追随、入力解析と表示形式、コピー＆貼り付け、並べ替え・重複削除、<b>xlsx / CSV / JSON の入出力</b>、Undo / Redo、主要なキーボード操作、1万件規模の性能。</p>
      </div>
      <div class="tcard">
        <div class="head"><span class="name">今回は範囲外にしたもの</span></div>
        <p class="desc">画像・図形・グラフの<b>見た目の正確性</b>（canvas 描画のため目視確認が必要）、印刷レイアウト、複数ブラウザでの互換性、長時間稼働時のメモリ挙動。範囲外にした理由と、必要になったときの確認方法をあわせて記録しました。</p>
      </div>
      <div class="tcard">
        <div class="head"><span class="name">判定基準（テストオラクル）</span></div>
        <p class="desc">Microsoft Excel の仕様を正とし、<b>期待結果は「Excel ならこうなる」で記述</b>。仕様書がないアプリなので、期待結果の根拠を明示しないと「不具合か仕様か」の議論ができないためです。実際にこの基準のおかげで、不合格 18 件のうち<b>テスト側の誤りが 3 件</b>あることも切り分けられました。</p>
      </div>
    </div>
  </div>
</section>

<section class="band">
  <div class="inner">
    <p class="eyebrow">Process</p>
    <h2>テストの進め方</h2>
    <p class="lead">思いついた順に触るのではなく、観点を洗い出してからケースに落とし、実行結果を1件ずつ記録する流れで進めました。</p>
    <ol class="flowlist">
      <li><span class="st">テスト対象の理解とリスク分析</span><br><span class="sd">ソースと README から機能を洗い出し、「壊れると影響が大きい順」に優先度を付けた。表計算アプリでは<b>計算結果の誤り</b>と<b>ファイル入出力でのデータ欠落</b>が最上位。逆に見た目の崩れは優先度を下げた。</span></li>
      <li><span class="st">テスト観点の洗い出し</span><br><span class="sd">機能単位ではなく「どう壊れうるか」で分類。例：数式なら「型変換」「優先順位」「エラー伝播」「循環参照」、日付なら「月末」「うるう年」「境界のシリアル値」。</span></li>
      <li><span class="st">テストケース設計</span><br><span class="sd">観点ごとに同値分割・境界値分析・デシジョンテーブル・状態遷移・エラー推測を使い分けて ${all.length} 件を作成。1件につき「前提条件 / 手順 / 期待結果」を、実行者によってブレない粒度で記述した。</span></li>
      <li><span class="st">テスト環境の構築</span><br><span class="sd">ロジック層は Node.js 上でアプリのモジュールを読み込んで自動実行、UI 層はブラウザ実機で本物のキーボード操作・ボタン操作・クリップボード操作を発火させて実行。<b>両方とも再実行できる形</b>にした。準備段階では xlsx 関連の 5 ケースが環境不足で実行できず、<b>「テスト環境の不備」と「アプリの不具合」を混同しないよう</b>先に環境側を整えてから本実行に入った。</span></li>
      <li><span class="st">テスト実行と記録</span><br><span class="sd">${all.length} 件を全件実行し、期待結果と実行結果を1件ずつ突き合わせ。不合格 ${fail} 件はすべて再現手順を確定させてから次に進んだ。</span></li>
      <li><span class="st">不合格ケースの切り分けと起票</span><br><span class="sd">不合格を「アプリの不具合」と「テスト側の誤り」に切り分け、前者は原因箇所の調査と修正方針まで書いて ${defects.length} 件を起票。後者 ${fixes.length} 件はテストケースを是正した。</span></li>
      <li><span class="st">品質評価とリリース判断</span><br><span class="sd">重要度と影響範囲から、リリース可否と修正の優先順位を整理。「エラー表示にならず静かに誤る」種類の不具合を最優先に置いた。</span></li>
    </ol>
  </div>
</section>

<section class="band alt">
  <div class="inner wide">
    <p class="eyebrow">Test Design</p>
    <h2>テスト観点とケース配分</h2>
    <p class="lead">カテゴリごとのケース数と、そこで主に使ったテスト技法です。計算の正しさに関わる領域へ厚く配分しました。</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>カテゴリ</th><th class="num">ケース数</th><th>主なテスト観点・技法</th></tr></thead>
        <tbody>
${catRows.map((r) => `          <tr><td><b>${esc(r.cat)}</b></td><td class="num">${r.n}</td><td><small>${esc(Object.keys(r.tech).sort((a, b) => r.tech[b] - r.tech[a]).slice(0, 4).map((t) => t + '(' + r.tech[t] + ')').join(' / '))}</small></td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>

    <h3>テスト技法の使い分け</h3>
    <div class="tablewrap">
      <table>
        <thead><tr><th>技法</th><th class="num">件数</th><th>使いどころの例</th></tr></thead>
        <tbody>
          <tr><td><b>境界値分析</b></td><td class="num">${techs['境界値'] || 0}</td><td>月末日・うるう年・0除算・空セル・A列/ZZ列・小数桁の境界。<small>「ちょうど」と「その前後」を突く。実際、起票した不具合 ${defects.length} 件のうち 5 件はこの技法で検出。</small></td></tr>
          <tr><td><b>同値分割</b></td><td class="num">${techs['同値分割'] || 0}</td><td>数値 / 数値に見える文字列 / 文字列 / 論理値 / 空 の5クラスで、関数への入力を代表値に絞る。</td></tr>
          <tr><td><b>デシジョンテーブル</b></td><td class="num">${techs['デシジョンテーブル'] || 0}</td><td>IF / IFS / SUMIFS など条件の組み合わせで結果が変わる関数の網羅。</td></tr>
          <tr><td><b>状態遷移</b></td><td class="num">${techs['状態遷移'] || 0}</td><td>入力→確定→Undo→Redo、結合→解除、書式の適用→解除など、操作の前後で状態が戻るかの確認。</td></tr>
          <tr><td><b>エラー推測</b></td><td class="num">${techs['エラー推測'] || 0}</td><td>実装を読んで「ここは手を抜きたくなる」と推測した箇所を狙い撃ち。重複シート名の不具合はこの技法で検出。</td></tr>
          <tr><td><b>異常系・負荷</b></td><td class="num">${(techs['異常系'] || 0) + (techs['負荷'] || 0)}</td><td>壊れたファイル・構文エラーの数式・100段ネスト・1万件再計算・5000行 CSV 出力。落ちないこと／時間内に終わることを確認。</td></tr>
        </tbody>
      </table>
    </div>

    <h3>テストケースの実物（抜粋）</h3>
    <p>実際に作成した ${all.length} 件のうち 12 件です。<b>「誰が実行しても同じ判定になる」</b>ことを重視し、期待結果は表示される値そのもので書いています。</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>ID</th><th>テスト観点</th><th>技法</th><th>前提条件</th><th>手順</th><th>期待結果</th><th>実行結果</th><th>判定</th></tr></thead>
        <tbody>
${samples.map((r) => `          <tr><td class="id">${esc(r.id)}</td><td>${esc(r.view)}</td><td><small>${esc(r.tech)}</small></td><td><small>${esc(r.pre)}</small></td><td><small>${esc(r.step)}</small></td><td><small>${esc(r.exp)}</small></td><td><small>${esc(r.act)}</small></td><td class="${r.status === 'PASS' ? 'ok' : 'ng'}">${r.status}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="band" id="automation">
  <div class="inner wide">
    <p class="eyebrow">Test Automation</p>
    <h2>「自動テストを回す」とは、何をすることか</h2>
    <p class="lead">このページで一番説明が要る部分だと思うので、専門用語を使わずに書きます。<b>自動テスト</b>とは、あらかじめ決めておいた確認手順をプログラムに実行させ、合格・不合格の判定までさせる仕組みのことです。ただし「何を正解とみなすか」は人が事前に決めます。機械が勝手に良し悪しを判断してくれるわけではありません。</p>

    <h3>1. 機械に任せたのは「実行」の部分だけ</h3>
    <p>工場の検品にたとえると分かりやすいと思います。人が製品を1個ずつ手に取って測る代わりに、<b>合格の条件をあらかじめ決めておいた検査装置</b>にラインを通す。自動テストで機械に任せているのも、この「決められた検査を実行する」部分です。</p>
    <p>今回はまず、テストケース（＝どんな操作をしたら、何がどう表示されるべきかを1件ずつ書き出したもの）を ${all.length} 件つくりました。そのうえで「値を入れる → 結果を見る → 期待していた結果と一致するか判定する」という手順を、プログラムが読める手順書の形で書き直しています。手順書さえ用意すれば、あとは実行の指示を1回出すだけで ${all.length} 件が最後まで流れます。</p>
    <p>逆に言えば、次の表の「人」の側は自動化できません。ここが仕事の中身になります。</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>工程</th><th>担当</th><th>補足</th></tr></thead>
        <tbody>
          <tr><td>何をどこまで確かめるか決める</td><td><b>人</b></td><td>壊れると影響が大きい順に優先度を付ける。今回は計算の誤りとファイルの欠落を最上位に置いた。</td></tr>
          <tr><td>正解の物差しを決める</td><td><b>人</b></td><td>今回は「Microsoft Excel と同じ結果になるか」に統一した。</td></tr>
          <tr><td>テストケース ${all.length} 件を設計する</td><td><b>人</b></td><td>1件ごとに前提・手順・期待結果を、誰が実行しても同じ判定になる書き方で用意する。</td></tr>
          <tr><td>値を入れて操作する</td><td>自動</td><td>プログラムが実アプリを動かす。</td></tr>
          <tr><td>期待結果と実際の結果を突き合わせる</td><td>自動</td><td>一致すれば合格、違えば不合格として記録する。</td></tr>
          <tr><td>不合格の原因を仕分ける</td><td><b>人</b></td><td>アプリの不具合か、テスト側の書き間違いかを1件ずつ確かめる。</td></tr>
          <tr><td>不具合を起票する</td><td><b>人</b></td><td>起票＝見つけた不具合を、直す人がそのまま作業に入れる記録の形にして登録すること。</td></tr>
        </tbody>
      </table>
    </div>

    <h3>2. 「計算の中身」と「実際の画面操作」を、別々に確かめた</h3>
    <p>同じアプリでも、確かめたいことによって近づき方を変える必要があります。今回は2つの経路を用意しました。</p>
    <div class="cards">
      <div class="tcard">
        <div class="head"><span class="name">計算の中身を確かめる検査</span><span class="oneword">${node.length} 件</span></div>
        <p class="desc">画面を開かずに、アプリの計算部分だけを取り出して動かす。<b>セルに値を入れる → 計算し直す → 表示される値を取り出す</b>という流れは実アプリとまったく同じ経路を通す。1件が数ミリ秒で終わるので、月末・うるう年・0除算といった<b>際どい値（境界値）を大量に投入できる</b>のが利点。1万件の再計算や5000行の CSV（＝表をカンマ区切りの文字だけで保存する簡易な形式）書き出しにかかる時間の測定もここで行った。</p>
      </div>
      <div class="tcard">
        <div class="head"><span class="name">実際の画面で確かめる検査</span><span class="oneword">${ui.length} 件</span></div>
        <p class="desc">ブラウザで本当にアプリを開き、<b>キーボードを押した・ボタンをクリックした・貼り付けたという操作を、利用者が実際にやったのと同じ扱いで起こす</b>。Ctrl+Z（元に戻す）、Ctrl+B（太字）、Ctrl+↓（データのある範囲の端まで移動）などのショートカット、コピー＆貼り付け、Excel 形式ファイルの書き出し→読み込みの往復まで、利用者と同じ道筋で確認した。</p>
      </div>
      <div class="tcard">
        <div class="head"><span class="name">2つに分けて分かったこと</span><span class="oneword">役割が違う</span></div>
        <p class="desc">計算の中身だけを見ていては「ボタンを押しても表示が変わらない」種類の不具合（BUG-007。番号は起票した不具合の管理番号）は見つからない。逆に画面操作だけでは際どい値を大量に試せない。<b>同じ不具合を両方で再現できたことが、原因が画面側か計算側かの絞り込みにそのまま役立った。</b></p>
      </div>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>確かめる対象</th><th class="num">件数</th><th class="num">自動実行にかかった時間</th><th>数値の性質</th></tr></thead>
        <tbody>
          <tr><td>計算の中身</td><td class="num">${node.length} 件</td><td class="num">約1.9秒</td><td><small>3回計測（1.8 / 1.9 / 1.9秒）</small></td></tr>
          <tr><td>実際の画面操作</td><td class="num">${ui.length} 件</td><td class="num">約1.0秒</td><td><small>977ミリ秒</small></td></tr>
          <tr><td><b>合計</b></td><td class="num"><b>${all.length} 件</b></td><td class="num"><b>約2.9秒</b></td><td><small>いずれも実測値</small></td></tr>
        </tbody>
      </table>
    </div>

    <h3>3. 値打ちは「速さ」より「何度でも同じ手順で繰り返せること」</h3>
    <p>同じ ${all.length} 件を人が手で実行した場合、1件あたり1分と仮定すると ${all.length} 分＝<b>約5時間</b>かかる計算になります。ただし<b>この5時間は仮定に基づく概算</b>で、実測した数字ではありません。実測なのは自動実行側の約2.9秒のほうです。</p>
    <p>ここで大事なのは1回目の速さではありません。ソフトウェアの修正では、<b>直した箇所とは別の場所を壊してしまう事故</b>が起きます。それを防ぐには、修正のたびに全部を確認し直す必要があります（これを回帰テスト＝直した箇所以外を壊していないかの再確認、と呼びます）。手作業なら1回ごとに概算5時間ぶんの人手が要るところが、自動なら約2.9秒。だから「1か所直すたびに ${all.length} 件を全部回す」という運用が現実的になります。</p>
    <p>手順書は2つのファイルに保存してあり（ファイル名は <code>qa/run.js</code> と <code>qa/ui-suite.js</code>）、私以外の人でも同じ手順で再実行できます。実際に保存したファイルから改めて実行し、計算の中身 ${node.length} 件・画面操作 ${ui.length} 件とも<b>同じ結果が再現すること</b>を確認しました。</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>項目</th><th>手作業で実行する場合</th><th>自動で実行する場合</th></tr></thead>
        <tbody>
          <tr><td>${all.length} 件の所要時間</td><td>約5時間<small>（1件1分と仮定した概算）</small></td><td>約2.9秒<small>（実測）</small></td></tr>
          <tr><td>2回目以降に必要なもの</td><td>実施のたびに同じだけの人手</td><td>保存した手順書を実行する指示だけ</td></tr>
          <tr><td>実行者による結果のばらつき</td><td>手順の解釈や見落としで起こりうる</td><td>同じ手順書なら同じ結果になる</td></tr>
          <tr><td>向いていること</td><td>見た目・使い勝手・想定外の操作の発見</td><td>決まった確認の反復と、際どい値の大量投入</td></tr>
        </tbody>
      </table>
    </div>

    <h3>4. 自動テストにできなかったこと（今回、実際に起きたこと）</h3>
    <p>自動化を「万能な仕組み」として書くと実態から離れます。今回の ${all.length} 件でも、次の3つは機械では埋められませんでした。</p>
    <div class="memo">
      <div class="m">
        <div class="mt">① 正解は人が決める。そして人は間違える</div>
        <p class="md">最初の実行で不合格になった 22 件を1件ずつ確かめたところ、<b>4件はアプリではなくテストケース側の誤り</b>でした。たとえば「007」と入力したら「007」という見た目のまま残ると思い込んでいましたが、Excel は数字とみなして 7 に直すのが正しい動きで、思い込んでいた側が誤りでした。機械は「一致しない」としか言わず、物差し自体の誤りには気付けません。ケースを直して実行し直し、最終的な不合格は ${fail} 件になりました。</p>
      </div>
      <div class="m">
        <div class="mt">② 計算が合っていても、画面が正しいとは限らない</div>
        <p class="md">BUG-007「小数点以下の表示桁数を増やすボタンを1回押しても表示が変わらない」は、計算の中身を見る検査では検出できませんでした。<b>ブラウザで実際にボタンを押して初めて分かった不具合</b>です。利用者から見れば「ボタンが壊れている」と映る事象で、こういうものは画面を操作しないと出てきません。</p>
      </div>
      <div class="m">
        <div class="mt">③ テスト環境の不備が、アプリの不具合に見えることがある</div>
        <p class="md">準備段階で、Excel 形式ファイルを扱う5件が実行できませんでした。原因はアプリではなく、<b>テストを動かす側にファイルを組み立てるための道具が足りていなかったこと</b>。ここでそのまま「不具合5件」と報告していれば、開発者の時間を無駄にしていました。先に環境を整えてから本実行に入っています。</p>
      </div>
    </div>

    <h3>5. 確かめていない範囲も、理由ごと残した</h3>
    <p>自動テストは「正解をあらかじめ書ける項目」しか判定できません。次の4つは今回<b>範囲外</b>とし、その理由も記録しています。</p>
    <ul>
      <li><b>グラフや図形の見た目</b> — 絵として描き出す仕組みのため、正しい絵かどうかを機械が値として取り出せない。目で見て判断するしかない領域。</li>
      <li><b>印刷したときのレイアウト</b> — 実際に印刷プレビューを見る必要がある。</li>
      <li><b>ブラウザごとの見え方の違い</b> — 今回は1種類のブラウザでのみ確認した。</li>
      <li><b>長時間使い続けたときの動作</b> — 何時間も開いたままにしたときに動きが重くならないか。今回の短時間の実行では確かめられない。</li>
    </ul>
    <p>つまり「自動テストが全部通った」は「品質が良い」ではなく、<b>「自動で確かめた範囲では問題が出なかった」</b>という意味でしかありません。何を確かめていないかを書き残すところまでがテストの仕事だと考えています。</p>

    <h3>用語ミニ辞典</h3>
    <div class="tablewrap">
      <table>
        <thead><tr><th>用語</th><th>言い換え</th></tr></thead>
        <tbody>
          <tr><td><b>テストケース</b></td><td>「どんな操作をしたら、何がどう表示されるべきか」を1件ずつ書き出したもの。今回は ${all.length} 件を設計した。</td></tr>
          <tr><td><b>自動テスト</b></td><td>その確認手順をプログラムに実行させ、合格・不合格の判定までさせる仕組み。何を正解とするかは人が事前に決める。</td></tr>
          <tr><td><b>テストオラクル（判定基準）</b></td><td>何を正解とみなすかの物差し。今回は「Excel と同じ結果になるか」に統一した。</td></tr>
          <tr><td><b>回帰テスト</b></td><td>どこかを直したあと、直した箇所<em>以外</em>を壊していないかを確認し直す作業。自動化がいちばん効く領域。</td></tr>
          <tr><td><b>境界値</b></td><td>月末・うるう年・0・空欄など、処理の切り替わり目にある際どい値。不具合が集まりやすい。</td></tr>
          <tr><td><b>起票</b></td><td>見つけた不具合を、直す人がそのまま作業に入れる記録の形にして登録すること。今回は ${defects.length} 件。</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="band alt">
  <div class="inner wide">
    <p class="eyebrow">Results</p>
    <h2>テスト結果</h2>
    <p class="lead">${all.length} 件を全件実行。1回目の実行では <b>${pass - fixes.length} 件合格・${fail + fixes.length} 件不合格</b>でした。不合格を1件ずつ切り分けたところ、${fixes.length} 件は<b>テストケース側の誤り</b>だったためケースを是正して再実行し、最終的に ${pass} 件合格・${fail} 件不合格。この ${fail} 件を、重複する事象をまとめて ${defects.length} 件の不具合として起票しています。</p>
    <div class="chartwrap">
      ${barChart(catRows)}
    </div>
    <div class="legend">
      <span><i style="background:#0066cc"></i>合格</span>
      <span><i style="background:#d6413a;opacity:.85"></i>不合格</span>
      <span>件数の多い上位12カテゴリを表示</span>
    </div>

    <h3>最終的に不合格となったケース ${fail} 件（全件）</h3>
    <div class="tablewrap">
      <table>
        <thead><tr><th>ID</th><th>カテゴリ</th><th>テスト観点</th><th>期待結果</th><th>実行結果</th><th>切り分け</th></tr></thead>
        <tbody>
${failed.map((r) => {
  const fx = fixes.find((f) => f.id === r.id);
  const bug = defects.find((d) => d.found.indexOf(r.id) >= 0);
  const tag = fx ? '<span class="pill">テスト側の誤り</span>' : (bug ? `<span class="pill warn">${bug.id}</span>` : '<span class="pill">要確認</span>');
  return `          <tr><td class="id">${esc(r.id)}</td><td><small>${esc(r.cat)}</small></td><td>${esc(r.view)}</td><td><small>${esc(r.exp)}</small></td><td><small class="ng">${esc(r.act)}</small></td><td>${tag}</td></tr>`;
}).join('\n')}
        </tbody>
      </table>
    </div>
    <p style="margin-top:14px"><small>※ 1つの不具合が複数のケースで検出されることがあるため、不合格ケース数（${fail}）と起票した不具合件数（${defects.length}）は一致しません。例えば EDATE の不具合はロジック層 2 件・UI 実機 1 件の計 3 ケースで検出しています。</small></p>
  </div>
</section>

<section class="band">
  <div class="inner wide">
    <p class="eyebrow">Defect Reports</p>
    <h2>起票した不具合 ${defects.length} 件</h2>
    <p class="lead">「再現できること」「期待結果の根拠が書かれていること」「原因の当たりが付いていること」を満たす形で起票しました。開発者が読んですぐ着手できる粒度を目指しています。</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>ID</th><th>概要</th><th>分類</th><th>重要度</th><th>優先度</th><th>検出ケース</th></tr></thead>
        <tbody>
${defects.map((d) => `          <tr><td class="id">${esc(d.id)}</td><td><b>${esc(d.title)}</b></td><td><small>${esc(d.cat)}</small></td><td><span class="${sevPill(d.sev)}">${esc(d.sev)}</span></td><td class="num">${esc(d.pri)}</td><td><small>${esc(d.found)}</small></td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>

    <h3>不具合報告票（全 ${defects.length} 件）</h3>
${defects.map((d) => `    <article class="bug">
      <div class="bhead">
        <span class="bid">${esc(d.id)}</span>
        <span class="btitle">${esc(d.title)}</span>
        <span class="${sevPill(d.sev)}">重要度 ${esc(d.sev)}</span>
        <span class="pill">優先度 ${esc(d.pri)}</span>
        <span class="pill">${esc(d.status)}</span>
      </div>
      <dl>
        <dt>分類</dt><dd>${esc(d.cat)}</dd>
        <dt>再現手順</dt><dd><ol>${d.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></dd>
        <dt>期待結果</dt><dd class="exp">${esc(d.expected)}</dd>
        <dt>実際の結果</dt><dd class="act">${esc(d.actual)}</dd>
        <dt>影響</dt><dd>${esc(d.impact)}</dd>
        <dt>原因調査</dt><dd>${esc(d.cause)}</dd>
        <dt>修正方針</dt><dd>${esc(d.fix)}</dd>
        <dt>検出ケース</dt><dd><small>${esc(d.found)}</small></dd>
        <dt>発生環境</dt><dd><small>Exitcel v1.0 / Windows 11 / Chromium 系ブラウザ・Node.js の双方で再現</small></dd>
      </dl>
    </article>`).join('\n')}
  </div>
</section>

<section class="band alt">
  <div class="inner">
    <p class="eyebrow">Self Review</p>
    <h2>テスト側の誤りも ${fixes.length} 件見つかった</h2>
    <p class="lead">不合格＝アプリの不具合、とは限りません。期待結果の根拠を Excel に置いていたおかげで、<b>テストケース自身の誤り</b>を切り分けられました。そのまま起票していれば、開発者の時間を無駄にしていた分です。</p>
    <div class="memo">
${fixes.map((f) => `      <div class="m">
        <div class="mt">${esc(f.id)} — ${esc(f.kind)}</div>
        <p class="md"><b>修正前:</b> ${esc(f.before)}<br><b>修正後:</b> ${esc(f.after)}</p>
      </div>`).join('\n')}
    </div>
  </div>
</section>

<section class="band">
  <div class="inner">
    <p class="eyebrow">Assessment</p>
    <h2>品質評価とリリース判断</h2>
    <p class="lead">検出した不具合を「利用者が気付けるか」で並べ替えると、優先順位がはっきりします。</p>
    <div class="cards">
      <div class="tcard">
        <div class="head"><span class="name">最優先で直すべきもの</span><span class="oneword">静かに誤る</span></div>
        <p class="desc">BUG-001（月末の日付が 3 日ずれる）、BUG-002（NaN が合計に伝播する）、BUG-003（別シートを参照する）の 3 件。<b>エラー表示にならず、もっともらしい値が出る</b>のが共通点で、利用者が気付けない。表計算アプリでは最も重い種類の欠陥。</p>
      </div>
      <div class="tcard">
        <div class="head"><span class="name">次に直すもの</span><span class="oneword">誤入力を通す</span></div>
        <p class="desc">BUG-004 / BUG-005 / BUG-006。いずれも「利用者の書き間違いをエラーにせず通してしまう」型。単体では小さいが、Excel から移ってきた利用者が最初につまずく箇所でもある。</p>
      </div>
      <div class="tcard">
        <div class="head"><span class="name">リリース判断</span><span class="oneword">条件付き可</span></div>
        <p class="desc">計算・入出力の基幹機能は ${rate}% が合格しており、xlsx / CSV / JSON の往復でもデータ欠落はなし。<b>個人利用の範囲なら公開可</b>。ただし日付計算を業務で使う場合は BUG-001 の修正が前提、CSV を配布する運用なら BUG-008 の対応が前提、という条件付きの結論とした。</p>
      </div>
    </div>

    <h3>この記録で示している経験</h3>
    <div class="tablewrap">
      <table>
        <thead><tr><th>求められる経験</th><th>このページでの該当箇所</th></tr></thead>
        <tbody>
          <tr><td><b>ソフトウェアの評価検証・テスト実務</b></td><td>テスト対象のリスク分析からスコープ定義、判定基準（テストオラクル）の設定まで。範囲外にした項目とその理由も明示。</td></tr>
          <tr><td><b>テストケース作成</b></td><td>${all.length} 件を、同値分割・境界値分析・デシジョンテーブル・状態遷移・エラー推測で設計。全件が「前提条件 / 手順 / 期待結果」の形式で、下の一覧からダウンロードできます。</td></tr>
          <tr><td><b>テスト実行</b></td><td>計算の中身 ${node.length} 件・実際の画面操作 ${ui.length} 件を全件実行し、実行結果を1件ずつ記録（未実施 0 件）。実行手順はファイルに保存してあり、<b>全件を約2.9秒で何度でも再実行できます</b>（→ <a href="#automation">自動テストの説明</a>）。</td></tr>
          <tr><td><b>不具合報告</b></td><td>不合格 ${fail} 件を切り分け、再現手順・期待結果・実際の結果・影響・原因調査・修正方針を揃えた不具合報告票 ${defects.length} 件を起票。テスト側の誤り ${fixes.length} 件は是正して記録。</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="band alt">
  <div class="inner">
    <p class="eyebrow">Deliverables</p>
    <h2>成果物のダウンロード</h2>
    <p class="lead">テストケース一覧（${all.length} 件）と不具合一覧（${defects.length} 件）です。この xlsx は<b>テスト対象である Exitcel 自身のエクスポート機能で書き出したもの</b>で、生成したファイルを読み込み直して内容が保たれることも確認済みです（TC-U-034〜038）。</p>
    <div class="dl">
      <a href="/exitcel-qa-testcases.xlsx" download>
        <span>📊</span>
        <span class="t">テストケース一覧・不具合一覧<span class="d">Excel ブック（3シート / 約34KB）</span></span>
      </a>
      <a href="/exitcel-qa-testcases.csv" download>
        <span>📄</span>
        <span class="t">テストケース一覧<span class="d">CSV（BOM付き / 約20KB）</span></span>
      </a>
    </div>
  </div>
</section>

<footer class="pageend">
  <div class="inner">
    <div class="linkrow">
      <a href="/portfolio">ポートフォリオ一覧</a>
      <a href="/tech-portfolio">Webサイト 技術ポートフォリオ</a>
      <a href="/questodo/">QuesToDo 開発ポートフォリオ</a>
      <a href="/">トップへ</a>
    </div>
    <div>テスト実施日: 2026年8月23日 / テスト対象: Exitcel v1.0 / 記載の数値はすべて実行結果に基づく実測値です。</div>
  </div>
</footer>

</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('生成:', OUT, Math.round(html.length / 1024) + 'KB');
console.log('ケース', all.length, '/ PASS', pass, '/ FAIL', fail, '/ 不具合', defects.length);
