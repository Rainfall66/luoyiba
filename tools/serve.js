/* 起一个本地静态服务,用来预览游戏(等价于 python3 -m http.server,但零依赖)
 * 用法: node tools/serve.js [端口]     默认 8080
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(GAME, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(GAME)) { res.writeHead(403); res.end('forbidden'); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('404 not found: ' + rel); return; }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log('螺一把 · 本地预览已启动');
  console.log('  http://localhost:' + PORT + '/');
  console.log('  (Ctrl+C 停止)');
});
