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
  fs.writeFileSync(__dirname + '/results.json', JSON.stringify(results, null, 2), 'utf8');
})();
