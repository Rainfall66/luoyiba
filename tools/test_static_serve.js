// 用本地静态服务验证「双击即玩」的静态资源确实都能取到(HTTP 层冒烟)
// 用法: node tools/test_static_serve.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const GAME = process.env.LUOYIBA_GAME_DIR || path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(GAME, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(GAME) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function get(port, url) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: url, timeout: 10000 }, (r) => {
      const c = [];
      r.on('data', (d) => c.push(d));
      r.on('end', () => resolve({ status: r.statusCode, type: r.headers['content-type'], body: Buffer.concat(c) }));
    }).on('error', reject);
  });
}

let fail = 0;
const t = (label, ok, extra = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra ? ' -> ' + extra : ''));
  if (!ok) fail++;
};

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  console.log('临时静态服务: http://127.0.0.1:' + port + '/');

  const targets = [
    ['/', 200, 'text/html', 'index.html'],
    ['/characters.js', 200, 'text/javascript', 'characters.js'],
    ['/app.js', 200, 'text/javascript', 'app.js'],
    ['/style.css', 200, 'text/css', 'style.css'],
    ['/characters.details.json', 200, 'application/json', 'details'],
  ];

  // 从数据库里取一个真实图片路径一起验证
  const sandbox = {};
  new Function('window', fs.readFileSync(path.join(GAME, 'characters.js'), 'utf8'))(sandbox);
  const sample = sandbox.LUOYIBA_CHARACTERS.find((c) => c.images && c.images.length);
  targets.push(['/' + sample.images[0], 200, 'image/webp', sample.nickname + ' 立绘']);

  for (const [url, status, type, label] of targets) {
    try {
      const r = await get(port, url);
      t('GET ' + label, r.status === status && String(r.type).includes(type.split('/')[1]) && r.body.length > 0,
        r.status + ' ' + r.type + ' ' + r.body.length + 'B');
    } catch (e) {
      t('GET ' + label, false, e.message);
    }
  }

  // index.html 里引用的本地资源必须都能取到
  const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:|^#/.test(u));
  for (const ref of refs) {
    try {
      const r = await get(port, '/' + ref.replace(/^\.\//, ''));
      t('index.html 引用可解析: ' + ref, r.status === 200, String(r.status));
    } catch (e) {
      t('index.html 引用可解析: ' + ref, false, e.message);
    }
  }

  server.close();
  console.log('');
  console.log(fail === 0 ? '全部通过 ✔' : fail + ' 项未通过 ✘');
  process.exitCode = fail === 0 ? 0 : 1;
});
