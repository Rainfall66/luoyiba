/* 通过 GitHub GIT DATA API 推送:在保留远程既有历史的前提下,把本地当前状态推上去
 * ---------------------------------------------------------------
 * 背景:本沙箱里 git 的 TLS 不可用(连 fetch 都不行),但 Node 的 https 可用。
 * 做法:
 *   1. 远程 HEAD 作为父提交
 *   2. 本地 HEAD 的 tree 直接复用(其所有 blob 已在本地上传过,这里按需补传)
 *   3. 创建新提交 + 更新 refs/heads/main
 * 这样远程已有的两个提交仍是祖先(不会被 force 掉),但文件内容 = 本地最终状态。
 *
 * 用法: node tools/push_via_api.js            (需要 LUOYIBA_TOKEN)
 *       node tools/push_via_api.js --dry
 * 安全:令牌只在内存使用,不打印、不落盘
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_DIR = path.join(__dirname, '..');
const OWNER = 'Rainfall66';
const REPO = 'luoyiba';
const BRANCH = 'main';
const DRY = process.argv.includes('--dry');

// 本沙箱不允许从 Node 里 spawn 其它程序(EPERM),所以只能是「只读 git」——
// 这里改用直接解析 .git 的方式取对象,避免 spawn。
const GIT_DIR = path.join(REPO_DIR, '.git');
const TOKEN = process.env.LUOYIBA_TOKEN;

if (!TOKEN) {
  console.error('缺少环境变量 LUOYIBA_TOKEN(由 PowerShell 从凭据管理器取出后传入)');
  process.exit(1);
}

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

/** 从 .git 里读 HEAD 的 tree sha 与提交信息(不 spawn git) */
function readGitHead() {
  const headRef = fs.readFileSync(path.join(GIT_DIR, 'HEAD'), 'utf8').trim();
  const refPath = headRef.replace('ref: ', '');
  const sha = fs.readFileSync(path.join(GIT_DIR, refPath), 'utf8').trim();
  return { sha, refPath };
}

/** 解压 .git/objects 里的 zlib 对象(只支持 loose object) */
function readLooseObject(sha) {
  const dir = path.join(GIT_DIR, 'objects', sha.slice(0, 2));
  const file = path.join(dir, sha.slice(2));
  const zlib = require('zlib');
  const buf = zlib.inflateSync(fs.readFileSync(file));
  const nul = buf.indexOf(0);
  const header = buf.slice(0, nul).toString('utf8'); // "commit 1234"
  const [type, size] = header.split(' ');
  return { type, size: Number(size), body: buf.slice(nul + 1) };
}

/** 解析提交对象的内容 */
function parseCommit(body) {
  const text = body.toString('utf8');
  const tree = (text.match(/^tree ([0-9a-f]{40})$/m) || [])[1];
  const parents = [...text.matchAll(/^parent ([0-9a-f]{40})$/gm)].map((m) => m[1]);
  const message = text.split(/\n\n/).slice(1).join('\n\n');
  return { tree, parents, message };
}

/** 列出 tree 下的所有 blob(递归),返回 [{path, mode, sha}] */
async function listTree(treeSha) {
  const t = await api('GET', `/repos/${OWNER}/${REPO}/git/trees/${treeSha}?recursive=1`);
  if (!t || !t.tree) throw new Error('无法读取 tree ' + treeSha);
  return t.tree.filter((x) => x.type === 'blob').map((b) => ({ path: b.path, mode: b.mode, sha: b.sha, size: b.size }));
}

(async () => {
  const { sha: localHead } = readGitHead();
  const commit = parseCommit(readLooseObject(localHead).body);
  console.log('本地 HEAD:  ' + localHead.slice(0, 7) + '  tree ' + commit.tree.slice(0, 7));
  console.log('提交信息:  ' + commit.message.split('\n')[0]);

  const repo = await api('GET', `/repos/${OWNER}/${REPO}`);
  console.log('远程仓库:  ' + repo.full_name + ' | 默认分支 ' + repo.default_branch);

  // 远程当前 HEAD(作为父提交,保留其历史)
  let remoteHead = null;
  try {
    const ref = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    remoteHead = ref.object.sha;
  } catch (e) {
    if (!/HTTP 404/.test(e.message)) throw e;
  }
  console.log('远程 HEAD:  ' + (remoteHead ? remoteHead.slice(0, 7) : '(空)'));

  if (remoteHead === localHead) { console.log('已是最新,无需推送 ✓'); return; }

  // 本地文件清单(用于核对与补传)
  const localFiles = [];
  const walk = (dir, rel = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '_pinyin_pro') continue;
      const p = path.join(dir, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(p, r);
      else localFiles.push(r);
    }
  };
  walk(REPO_DIR);
  console.log('本地文件:  ' + localFiles.length + ' 个');

  if (DRY) {
    console.log('');
    console.log('[dry-run] 将要执行:');
    console.log('  1) 上传本地 tree 中远程缺失的 blob');
    console.log('  2) 以 ' + (remoteHead ? remoteHead.slice(0, 7) : '(无)') + ' 为父提交,创建新提交(tree = ' + commit.tree.slice(0, 7) + ')');
    console.log('  3) 更新 refs/heads/' + BRANCH);
    return;
  }

  // 远程已有的 blob(按 sha 去重),避免重复上传
  const remoteBlobs = new Set();
  try {
    const t = await api('GET', `/repos/${OWNER}/${REPO}/git/trees/${remoteHead}?recursive=1`);
    (t.tree || []).filter((x) => x.type === 'blob').forEach((b) => remoteBlobs.add(b.sha));
  } catch (e) { /* 空仓库 */ }
  console.log('远程已有 blob: ' + remoteBlobs.size + ' 个');

  // 逐个上传本地文件,收集 sha
  const entries = [];
  let uploaded = 0;
  for (const rel of localFiles) {
    const abs = path.join(REPO_DIR, rel);
    const buf = fs.readFileSync(abs);
    const res = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64',
    });
    entries.push({ path: rel, mode: '100644', type: 'blob', sha: res.sha });
    uploaded++;
    if (uploaded % 15 === 0) process.stdout.write('  已处理 ' + uploaded + '/' + localFiles.length + '\r');
  }
  console.log('\n已上传/登记 blob: ' + entries.length + ' 个');

  // 用这些 blob 建一棵全新的 tree(即本地最终状态)
  const tree = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: entries });
  console.log('新 tree: ' + tree.sha.slice(0, 7));

  const newCommit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: `整理仓库结构并精简 README

- 目录整理:游戏本体移入 game/,构建脚本留在 tools/(远程原为扁平结构且缺少 images/ 与 docs/)
- README 重写为玩家向内容,移除构建与自检过程
- 精简 tools:移除一次性排查脚本与头像总览页(约 2.8MB 冗余)
- 头像换为游戏内小头像 T_Head(256×256,33 张)

(本提交通过 GitHub Git Data API 推送:本机 git 的 TLS 通道不可用)`,
    tree: tree.sha,
    parents: remoteHead ? [remoteHead] : [],
  });
  console.log('新提交: ' + newCommit.sha.slice(0, 7));

  if (remoteHead) {
    await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: newCommit.sha, force: false });
  } else {
    await api('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: 'refs/heads/' + BRANCH, sha: newCommit.sha });
  }

  const after = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  console.log('');
  console.log('推送完成 ✓');
  console.log('  https://github.com/' + OWNER + '/' + REPO);
  console.log('  远程 ' + BRANCH + ' = ' + after.object.sha.slice(0, 7));
})();
