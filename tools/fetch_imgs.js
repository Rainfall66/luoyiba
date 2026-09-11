/* 螺一把 · 角色图片抓取器
 * ---------------------------------------------------------------
 * 来源: dna-builder 仓库(站点 https://dna-builder.cn/db/char ,仓库 pa001024/dna-builder,MIT)
 *
 * 抓取优先级(逐级回退):
 *   1. public/imgs/webp/T_Head_<icon>.webp   游戏内角色小头像 256×256  ← 首选
 *   2. public/imgs/bust/T_Bust_<icon>.webp   半身立绘 128×128          ← 回退(个别角色没有 T_Head)
 *
 * 做法:
 *   1. 读 characters.js 里每个角色的 icon(以及修正映射 FIX)
 *   2. 只取「主图」,不取 01/02 变体(变体是不同时装/表情,见 tools/头像替换-待审阅.md 的说明)
 *   3. 用魔数校验真的是一张图片(jsDelivr 对缺文件会回 HTML,必须挡掉)
 *   4. 按真实格式落盘到 images/head-<slug>.<ext>
 *   5. 把 avatar / images 字段写回 tools/_db_images.json,由 build_chars_db.js 合并进 characters.js
 *
 * 用法: node tools/fetch_imgs.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOOLS = __dirname;
const GAME = process.env.LUOYIBA_GAME_DIR || path.join(TOOLS, '..', 'game');
const IMG_DIR = path.join(GAME, 'images');
const BASE = 'https://cdn.jsdelivr.net/gh/pa001024/dna-builder@master/public/imgs/';

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    // rejectUnauthorized:false —— 本机环境对 CDN 的证书链校验不稳定,关掉以免误判为失败
    const req = https.get(url, { timeout: 60000, rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return get(new URL(r.headers.location, url).href, redirects + 1).then(resolve, reject);
      }
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** 用魔数判断图片格式;不是图片返回 null(jsDelivr 404 会返回 HTML 错误页) */
function imageFormat(buf) {
  if (!buf || buf.length < 16) return null;
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  return null;
}

/** 角色名 -> 英文/拼音 slug(用于文件名,避免中文文件名) */
function slugOf(character) {
  const map = {
    贝蕾妮卡: 'heitao',
    芙罗拉: 'fuluo',
    幻景: 'huanying',
    '主角-暗': 'zhujue-dark',
    '主角-光': 'zhujue-light',
    '主角-水': 'zhujue-water',
    莉兹贝尔: 'baonu',
    妮弗尔夫人: 'nifu',
    刻舟: 'kezhou',
    苏乙: 'suyi',
    菲娜: 'feina',
    丽蓓卡: 'shuimu',
    伊薇: 'eve',
    塔比瑟: 'zhangyu',
    扶疏: 'baiheng',
    琳恩: 'linen',
    希尔妲: 'xier',
    耶尔与奥利弗: 'yeer',
    法露茜: 'falu',
    海尔法: 'haier',
    卡米拉: 'kami',
    玛尔洁: 'maer',
    黎瑟: 'lise',
    止流: 'zhiliu',
    SP黎瑟: 'sp-lise',
    煜明: 'yuming',
    兰迪: 'landi',
    西比尔: 'xibi',
    松露与榛子: 'songlu',
    奥特赛德: 'aote',
    赛琪: 'saiqi',
    达芙涅: 'dafu',
    莉莉蔻: 'lilikou',
  };
  if (map[character.nickname]) return map[character.nickname];
  return String(character.icon || character.nickname)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'char' + character.id;
}

/** icon 名称修正:数据库里的 icon 与实际资源名不一致时在此映射 */
const FIX = {
  // 主角-水 的 icon 是 WeitaF,而 T_Head 侧资源名为 WeitaF;bust 侧没有,故回退到主角-光
  WeitaF: 'WeitaF',
};

/** 逐级回退链:<子目录>/<前缀><icon>.webp,前面的取不到才试后面的 */
const SOURCES = [
  { dir: 'webp/', prefix: 'T_Head_', kind: 'head' },
  { dir: 'res/', prefix: 'T_Head_', kind: 'head' },
  { dir: 'bust/', prefix: 'T_Bust_', kind: 'bust' },
];

/** 某些角色上游完全没有同名资源,用同模型角色的图兜底 */
const FALLBACK_ICON = {
  // SP黎瑟(1.7)没有独立 T_Head,复用黎瑟
  SpLise: 'Lise',
  // 莉莉蔻(2.0)没有独立图,复用同资源名的达芙涅
  Dafu: 'Dafu',
};

/** 产出该角色要尝试的 <kind>/<icon> 组合,按优先级排列 */
function candidates(icon) {
  const icons = [FIX[icon] || icon];
  if (FALLBACK_ICON[icon]) icons.push(FALLBACK_ICON[icon]);
  const out = [];
  for (const ic of icons) {
    for (const s of SOURCES) out.push({ icon: ic, ...s });
  }
  return out;
}

(async () => {
  const sandbox = {};
  new Function('window', fs.readFileSync(path.join(GAME, 'characters.js'), 'utf8'))(sandbox);
  const list = sandbox.LUOYIBA_CHARACTERS;

  fs.mkdirSync(IMG_DIR, { recursive: true });

  const report = { ok: [], missing: [], fallback: [], details: [] };
  const dbImages = {};

  for (const c of list) {
    const slug = slugOf(c);
    let picked = null;

    for (const cand of candidates(c.icon)) {
      const url = BASE + cand.dir + cand.prefix + cand.icon + '.webp';
      let res;
      try {
        res = await get(url);
      } catch (e) {
        continue;
      }
      const fmt = imageFormat(res.body);
      if (res.status !== 200 || !fmt) continue;
      const file = 'head-' + slug + '.' + fmt;
      fs.writeFileSync(path.join(IMG_DIR, file), res.body);
      picked = {
        file: 'images/' + file,
        kind: cand.kind,
        from: cand.icon,
        bytes: res.body.length,
      };
      break; // 只取一张主图,不取变体
    }

    if (picked) {
      report.ok.push(c.nickname);
      // avatar 给小尺寸圆形/圆角方形用;images 给结算大图用 —— 同一张 256px 即可
      dbImages[c.id] = { avatar: picked.file, images: [picked.file] };
      if (picked.kind !== 'head') report.fallback.push(c.nickname + '(' + picked.from + ')');
    } else {
      report.missing.push(c.nickname + '(' + c.icon + ')');
      dbImages[c.id] = { avatar: '', images: [] };
    }
    report.details.push({ id: c.id, 名称: c.nickname, slug, icon: c.icon, files: picked ? [picked.file] : [], kind: picked ? picked.kind : null });
  }

  fs.writeFileSync(path.join(TOOLS, '_db_images.json'), JSON.stringify(dbImages, null, 1), 'utf8');
  fs.writeFileSync(path.join(TOOLS, '_img_report.json'), JSON.stringify(report, null, 1), 'utf8');

  console.log('成功 ' + report.ok.length + ' / ' + list.length + ' 名角色');
  if (report.fallback.length) console.log('用了回退图(非 T_Head): ' + report.fallback.join(', '));
  if (report.missing.length) console.log('缺图: ' + report.missing.join(', '));
  const headCount = report.details.filter((d) => d.kind === 'head').length;
  console.log('其中游戏内小头像 T_Head: ' + headCount + ' 名');
  for (const d of report.details) {
    console.log('  ' + d.名称.padEnd(12) + ' ' + d.icon.padEnd(10) + ' -> ' + (d.files.join(', ') || '（无）') + (d.kind === 'head' ? '' : '  [回退]'));
  }
  const bytes = fs
    .readdirSync(IMG_DIR)
    .filter((f) => /\.(webp|png|jpg)$/i.test(f))
    .reduce((n, f) => n + fs.statSync(path.join(IMG_DIR, f)).size, 0);
  console.log('images/ 体积: ' + (bytes / 1024 / 1024).toFixed(2) + ' MB');
  console.log('已写出: tools/_db_images.json');
})();
