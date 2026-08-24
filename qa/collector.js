/* ブラウザ実機テストの結果を受け取って保存する収集用サーバー */
const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      fs.writeFileSync(path.join(__dirname, 'ui-results.json'), body, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('saved ' + body.length);
      console.log('saved bytes:', body.length);
    });
    return;
  }
  res.writeHead(200); res.end('collector');
}).listen(8778, '127.0.0.1', () => console.log('collector on 8778'));
