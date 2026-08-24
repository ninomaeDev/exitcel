/* テスト実行 : 全ケースを流して結果JSONとコンソールサマリを出す */
const fs = require('fs');
const cases = [].concat(require('./cases-a'), require('./cases-b'), require('./cases-c'));

function norm(s) { return String(s).replace(/\r/g, '').trim(); }

(async () => {
  const results = [];
  for (const c of cases) {
    let actual = '', status = 'PASS', note = '';
    try {
      actual = await c.run();
      actual = actual === undefined || actual === null ? '' : String(actual);
    } catch (e) {
      actual = '例外: ' + (e && e.message ? e.message : String(e));
      status = 'FAIL';
      note = 'スローされた例外';
    }
    if (status !== 'FAIL') {
      const a = norm(actual), e = norm(c.exp);
      status = a === e || a.startsWith(e) ? 'PASS' : 'FAIL';
    }
    results.push({ id: c.id, cat: c.cat, view: c.view, tech: c.tech, pre: c.pre, step: c.step, exp: c.exp, act: actual, status, note });
  }

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL');
  console.log('総ケース数: ' + results.length + ' / PASS: ' + pass + ' / FAIL: ' + fail.length);
  console.log('---- FAIL 一覧 ----');
  for (const r of fail) {
    console.log([r.id, r.cat, r.view].join(' | '));
    console.log('   手順: ' + r.step);
    console.log('   期待: ' + r.exp + '   実際: ' + r.act);
  }

  /* CI 判定 : 既知の失敗(known-failures.json)はビルドを落とさない。
     未知の失敗が出たとき = 回帰したときだけ落とす。
     あわせて、既知として登録したまま直っているケースも落とす
     (ベースラインが実態より甘いまま放置されるのを防ぐため)。 */
  const known = require('./known-failures.json');
  const knownIds = known.map((k) => k.id);
  const regressions = fail.filter((r) => !knownIds.includes(r.id));
  const stale = known.filter((k) => {
    const r = results.find((x) => x.id === k.id);
    return r && r.status === 'PASS';
  });

  console.log('---- CI 判定 ----');
  console.log('既知の失敗として許容: ' + knownIds.length + ' 件 (' + (knownIds.join(', ') || 'なし') + ')');
  if (regressions.length) {
    console.log('回帰を検出: ' + regressions.map((r) => r.id).join(', '));
  }
  if (stale.length) {
    console.log('ベースラインが古い(直っているのに登録されたまま): ' + stale.map((k) => k.id).join(', '));
  }
  if (!regressions.length && !stale.length) console.log('回帰なし');
  process.exitCode = regressions.length || stale.length ? 1 : 0;
  fs.writeFileSync(__dirname + '/results.json', JSON.stringify(results, null, 2), 'utf8');
})();
