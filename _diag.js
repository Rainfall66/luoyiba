// 逐个上传,定位哪个文件触发 HTTP 400
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OWNER = 'Rainfall66';
const REPO = 'luoyiba';
const TOKEN = process.env.LUOYIBA_TOKEN;
const SELF = path.basename(__filename);
if (!TOKEN) { console.error('缺少 LUOYIBA_TOKEN'); process.exit(1); }

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: 'api.github.com', path: p, method, timeout: 120000, rejectUnauthorized: false,
        headers: Object.assign(
          { 'User-Agent': 'luoyiba', Accept: 'application/vnd.github+json', Authorization: 'token ' + TOKEN },
          data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
        ),
      },
      (r) => {
        const c = [];
        r.on('data', (d) => c.push(d));
        r.on('end', () => {
          const t = Buffer.concat(c).toString('utf8');
          let j = null; try { j = JSON.parse(t); } catch (e) {}
          resolve({ s: r.statusCode, j, t });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ s: 0, t: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const files = [];
  (function walk(dir, rel = '') {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '_pinyin_pro'].includes(e.name)) continue;
      if (!rel && e.name === SELF) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else files.push(r);
    }
  })(ROOT);
  files.sort();

  let ok = 0;
  const failures = [];
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const b64 = buf.toString('base64');
    const res = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/blobs', { content: b64, encoding: 'base64' });
    if (res.s === 201) {
      ok++;
    } else {
      failures.push({ rel, size: buf.length, status: res.s, msg: String(res.t).slice(0, 160) });
      console.log('  FAIL ' + rel + ' (' + buf.length + 'B) HTTP ' + res.s);
      console.log('       ' + String(res.t).slice(0, 200));
    }
  }
  console.log('');
  console.log('成功 ' + ok + ' / ' + files.length + ', 失败 ' + failures.length);
  if (failures.length) {
    console.log('失败文件:');
    failures.forEach((f) => console.log('  ' + f.rel + '  ' + f.size + 'B'));
  }
})();
