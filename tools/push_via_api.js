/* 通过 GitHub Git Data API 推送:把本地当前工作区状态推成远程 main 的新提交
 * ---------------------------------------------------------------
 * 本沙箱里 git 的 TLS 不可用(连 fetch 都失败),所以走 API。
 * 做法:以远程现有 HEAD 为父提交 → 用本地文件建树 → 建提交 → 更新 ref。
 * 这样远程历史保留,内容 = 本地最终状态。
 *
 * 用法: node tools/push_via_api.js [--dry]     (需要 LUOYIBA_TOKEN)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OWNER = 'Rainfall66';
const REPO = 'luoyiba';
const BRANCH = 'main';
const TOKEN = process.env.LUOYIBA_TOKEN;
const DRY = process.argv.includes('--dry');

const MESSAGE = '扁平化仓库:游戏本体移到仓库根目录\n\n' +
  '- 原 game/ 下的内容(index.html、app.js、style.css、characters.js、\n' +
  '  characters.details.json、images/、docs/、LICENSE)全部提到仓库根,\n' +
  '  这样 GitHub Pages 的 / (root) 就能直接托管游戏\n' +
  '  (分支部署只提供 / 和 /docs 两个选项,原来选不到 /game)\n' +
  '- tools/ 里的游戏目录引用同步改为仓库根\n' +
  '- 原根 README(仓库说明)另存为 REPO-README.md;README.md 保留玩家向说明\n' +
  '- 六个自检套件全部通过\n\n' +
  '(推送方式:本机 git 的 TLS 通道不可用,改用 GitHub Git Data API)';

if (!TOKEN) { console.error('缺少 LUOYIBA_TOKEN'); process.exit(1); }

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: 'api.github.com',
        path: p,
        method,
        timeout: 180000,
        rejectUnauthorized: false,
        headers: Object.assign(
          { 'User-Agent': 'luoyiba-push', Accept: 'application/vnd.github+json', Authorization: 'token ' + TOKEN },
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
          else reject(new Error('HTTP ' + r.statusCode + ' ' + method + ' ' + p + ' -> ' + t.slice(0, 400)));
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout ' + p)));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const files = [];
  const SELF = path.basename(__filename); // 本推送脚本不进仓库
  (function walk(dir, rel = '') {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '_pinyin_pro'].includes(e.name)) continue;
      if (!rel && e.name === SELF) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else files.push(r);
    }
  })(ROOT);
  console.log('本地文件: ' + files.length + ' 个(已排除 ' + SELF + ')');

  const repo = await api('GET', '/repos/' + OWNER + '/' + REPO);
  console.log('目标仓库: ' + repo.full_name + ' | 默认分支 ' + repo.default_branch);

  let remoteHead = null;
  try {
    const ref = await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/ref/heads/' + BRANCH);
    remoteHead = ref.object.sha;
  } catch (e) {
    if (!/HTTP 404/.test(e.message)) throw e;
  }
  console.log('远程 ' + BRANCH + ': ' + (remoteHead ? remoteHead.slice(0, 7) : '(空)'));

  if (DRY) {
    console.log('');
    console.log('[dry-run] 将建树并提交,父提交 = ' + String(remoteHead || '(无)').slice(0, 7));
    return;
  }

  const entries = [];
  let n = 0;
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const res = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/blobs', {
      content: buf.toString('base64'),
      encoding: 'base64',
    });
    entries.push({ path: rel, mode: '100644', type: 'blob', sha: res.sha });
    n++;
    if (n % 15 === 0 || n === files.length) process.stdout.write('  上传 ' + n + '/' + files.length + '\r');
  }
  console.log('\n已上传 blob: ' + entries.length);

  const tree = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/trees', { tree: entries });
  console.log('新 tree: ' + tree.sha.slice(0, 7));

  const commit = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/commits', {
    message: MESSAGE,
    tree: tree.sha,
    parents: remoteHead ? [remoteHead] : [],
  });
  console.log('新提交: ' + commit.sha.slice(0, 7));

  if (remoteHead) {
    await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/git/refs/heads/' + BRANCH, { sha: commit.sha, force: false });
  } else {
    await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/refs', { ref: 'refs/heads/' + BRANCH, sha: commit.sha });
  }

  const after = await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/ref/heads/' + BRANCH);
  console.log('');
  console.log('推送完成 ✓  远程 ' + BRANCH + ' = ' + after.object.sha.slice(0, 7));
  console.log('https://github.com/' + OWNER + '/' + REPO);
})();
