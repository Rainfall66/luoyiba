// 用 Node 直连下载 dna-builder 的角色数据源码到本地。
// 优先 GitHub Contents API（返回 base64，可拿到完整文件），失败则回退 jsDelivr。
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '_char.data.ts');
// 相对仓库路径，可用第 3 个参数覆盖（默认角色主数据）
const REPO_PATH = process.argv[3] || 'src/data/d/char.data.ts';

function get(u, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        timeout: 120000,
        headers: Object.assign(
          { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: '*/*' },
          opts.headers || {}
        ),
      },
      (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          r.resume();
          return get(r.headers.location, opts).then(resolve, reject);
        }
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks), headers: r.headers }));
      }
    );
    req.on('timeout', () => { req.destroy(new Error('timeout ' + u)); });
    req.on('error', reject);
  });
}

(async () => {
  // 1) GitHub Contents API
  try {
    const api =
      'https://api.github.com/repos/pa001024/dna-builder/contents/' + REPO_PATH + '?ref=master';
    const r = await get(api, { headers: { Accept: 'application/vnd.github.v3+json' } });
    if (r.status === 200) {
      const j = JSON.parse(r.body.toString('utf8'));
      if (j.content && j.encoding === 'base64') {
        const buf = Buffer.from(j.content.replace(/\n/g, ''), 'base64');
        fs.writeFileSync(OUT, buf);
        console.log('OK github-api bytes=' + buf.length + ' -> ' + OUT);
        return;
      }
      console.log('WARN github-api unexpected shape: size=' + j.size + ' encoding=' + j.encoding);
    } else {
      console.log('WARN github-api status=' + r.status);
    }
  } catch (e) {
    console.log('WARN github-api failed: ' + e.message);
  }

  // 2) jsDelivr CDN
  try {
    const url = 'https://cdn.jsdelivr.net/gh/pa001024/dna-builder@master/' + REPO_PATH;
    const r = await get(url);
    if (r.status === 200 && r.body.length > 10000) {
      fs.writeFileSync(OUT, r.body);
      console.log('OK jsdelivr bytes=' + r.body.length + ' -> ' + OUT);
      return;
    }
    console.log('WARN jsdelivr status=' + r.status + ' bytes=' + r.body.length);
  } catch (e) {
    console.log('WARN jsdelivr failed: ' + e.message);
  }

  process.exitCode = 1;
})();
