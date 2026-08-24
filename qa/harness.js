/* Exitcel テスト実行用ハーネス : ブラウザ用IIFEモジュールをNodeへロードする */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const APP = path.resolve(__dirname, '..');   // qa/ の1つ上 = アプリ本体

function loadApp() {
  const sandbox = {
    console,
    setTimeout, clearTimeout,
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} },
    document: {
      createElement: (tag) => {
        if (tag === 'canvas') {
          return { getContext: () => ({ font: '', measureText: (s) => ({ width: String(s).length * 7 }) }) };
        }
        return { style: {}, appendChild() {}, click() {} };
      },
      body: { appendChild() {}, removeChild() {} },
    },
    Uint8Array, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite,
    String, Number, Boolean, Array, Object, RegExp, Error, TextEncoder, TextDecoder,
    ArrayBuffer, DataView, Promise, Blob, Response, CompressionStream, DecompressionStream,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of ['util.js', 'formula.js', 'model.js', 'xlsxio.js', 'objects.js']) {
    const code = fs.readFileSync(path.join(APP, 'js', f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox;
}

module.exports = { loadApp, APP };
