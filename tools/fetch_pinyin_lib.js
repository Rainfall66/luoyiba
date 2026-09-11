// 从 npm 下载 pinyin-pro 并解压到 tools/_pinyin_pro(仅本地生成拼音用,不进入游戏交付)
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '_pinyin_pro');
const TMP = path.join(__dirname, '_pinyin_pro.tgz');

function get(u, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const req = https.get(u, { timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return get(new URL(r.headers.location, u).href, redirects + 1).then(resolve, reject);
      }
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** 极简 tar 解包:只处理普通文件与目录 */
function untar(buf, dest) {
  let off = 0;
  const files = [];
  while (off + 512 <= buf.length) {
    const header = buf.slice(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.slice(0, 100).toString('utf8').replace(/\0.*$/, '');
    const size = parseInt(header.slice(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0;
    const type = header.slice(156, 157).toString('utf8');
    const body = buf.slice(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (!name || type === '5') continue;
    const target = path.join(dest, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    files.push(name);
  }
  return files;
}

(async () => {
  const meta = await get('https://registry.npmjs.org/pinyin-pro/latest');
  const info = JSON.parse(meta.body.toString('utf8'));
  console.log('pinyin-pro 最新版本: ' + info.version);
  const tgz = await get(info.dist.tarball);
  console.log('下载完成: ' + (tgz.body.length / 1024).toFixed(0) + ' KB');
  let raw = tgz.body;
  // npm tarball 是 gzip 压缩的 tar
  if (raw[0] === 0x1f && raw[1] === 0x8b) {
    raw = zlib.gunzipSync(raw);
    console.log('gunzip 后: ' + (raw.length / 1024).toFixed(0) + ' KB');
  }
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = untar(raw, OUT_DIR);
  console.log('解压文件数: ' + files.length);
  console.log(files.filter((f) => /\.(js|cjs|mjs|json)$/.test(f)).slice(0, 12).join('\n'));
  fs.rmSync(TMP, { force: true });
})();
