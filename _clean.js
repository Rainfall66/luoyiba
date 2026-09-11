// 临时脚本(不进仓库):移除误提交的临时文件
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OWNER = 'Rainfall66';
const REPO = 'luoyiba';
const BRANCH = 'main';
const TOKEN = process.env.LUOYIBA_TOKEN;
if (!TOKEN) { console.error('缺少 LUOYIBA_TOKEN'); process.exit(1); }

// 临时脚本永不进仓库
const EXCLUDE = new Set(['_push.js', '_push2.js', '_diag.js', '_verify.js', '_fetch.js']);

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
          if (r.statusCode >= 200 && r.statusCode < 300) resolve(j);
          else reject(new Error('HTTP ' + r.statusCode + ' ' + method + ' ' + p + ' -> ' + t.slice(0, 250)));
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const files = [];
  (function walk(dir, rel = '') {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '_pinyin_pro'].includes(e.name)) continue;
      if (!rel && EXCLUDE.has(e.name)) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else files.push(r);
    }
  })(ROOT);
  files.sort();
  console.log('待推送文件: ' + files.length);
  files.forEach((f) => console.log('  ' + f));

  const remoteHead = (await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/ref/heads/' + BRANCH)).object.sha;
  const entries = [];
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const res = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/blobs', {
      content: buf.toString('base64'), encoding: 'base64',
    });
    entries.push({ path: rel, mode: '100644', type: 'blob', sha: res.sha });
  }
  const tree = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/trees', { tree: entries });
  const commit = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/commits', {
    message: '移除误提交的临时脚本 _diag.js\n\n仓库只保留游戏本体所需的文件。',
    tree: tree.sha,
    parents: [remoteHead],
  });
  await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/git/refs/heads/' + BRANCH, { sha: commit.sha, force: false });
  console.log('');
  console.log('完成 ✓ 新提交 ' + commit.sha.slice(0, 7));
})();
