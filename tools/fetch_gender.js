/* 螺一把 · 从 boarhat.gg 抓取角色档案(性别 / 生日 / 身高 / 武器精通)
 * ---------------------------------------------------------------
 * 上游 dna-builder 没有性别字段,这里用 boarhat.gg 的角色页补:
 *   https://boarhat.gg/games/duet-night-abyss/character/<slug>/
 * 页面上是一张两列表格: <td>字段</td><td>值</td>
 *
 * 输出: tools/_boarhat_chars.json
 * 用法: node tools/fetch_boarhat_chars.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOOLS = __dirname;
const GAME = process.env.LUOYIBA_GAME_DIR || path.join(TOOLS, '..', 'game');

// 角色名(中文) -> boarhat slug。依据 boarhat 角色列表页的链接。
const SLUGS = {
  贝蕾妮卡: 'berenica',
  芙罗拉: 'flora',
  幻景: 'phantasio',
  '主角-暗': 'protagonist-umbro',
  '主角-光': 'protagonist',
  '主角-水': 'protagonist-hydro',
  莉兹贝尔: 'lisbell',
  妮弗尔夫人: 'lady-nifle',
  刻舟: 'kezhou',
  苏乙: 'suyi',
  菲娜: 'fina',
  丽蓓卡: 'rebecca',
  伊薇: 'eve',
  塔比瑟: 'tabethe',
  扶疏: 'fushu',
  琳恩: 'lynn',
  希尔妲: 'hilda',
  '耶尔与奥利弗': 'yale-oliver',
  法露茜: 'falsi',
  海尔法: 'hellfire',
  卡米拉: 'camilla',
  玛尔洁: 'margie',
  黎瑟: 'rhythm',
  止流: 'zhiliu',
  SP黎瑟: 'rhythm',
  煜明: 'yuming',
  兰迪: 'randy',
  西比尔: 'sibylle',
  松露与榛子: 'truffle-filbert',
  奥特赛德: 'outsider',
  赛琪: 'psyche',
  达芙涅: 'daphne',
  莉莉蔻: 'lilikou',
};

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('redirects'));
    const req = https.get(url, { timeout: 45000, rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return get(new URL(r.headers.location, url).href, redirects + 1).then(resolve, reject);
      }
      const c = [];
      r.on('data', (d) => c.push(d));
      r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(c) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** 从 HTML 两列表格里抽取 字段 -> 值
 *  boarhat 用 Astro 渲染,td 之间夹着换行与 data-astro-cid-* 属性,必须容忍空白与任意属性 */
function parsePairs(html) {
  const out = {};
  const re = /<td\b[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = stripTags(m[1]).trim();
    const val = stripTags(m[2]).trim();
    if (key && !(key in out)) out[key] = val;
  }
  return out;
}

function stripTags(s) {
  return String(s)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
}

(async () => {
  const sandbox = {};
  new Function('window', fs.readFileSync(path.join(GAME, 'characters.js'), 'utf8'))(sandbox);
  const list = sandbox.LUOYIBA_CHARACTERS;

  const result = {};
  const cache = {};
  for (const c of list) {
    const slug = SLUGS[c.nickname];
    if (!slug) {
      console.log('!! 没有 slug: ' + c.nickname);
      continue;
    }
    try {
      if (!cache[slug]) {
        const r = await get('https://boarhat.gg/games/duet-night-abyss/character/' + slug + '/');
        if (r.status !== 200) throw new Error('HTTP ' + r.status);
        cache[slug] = parsePairs(r.body.toString('utf8'));
      }
      const p = cache[slug];
      result[c.nickname] = {
        slug,
        gender: p['Gender'] || '',
        birthday: p['Birthday'] || '',
        height: p['Height'] || '',
        proficiency: p['Weapon Proficiency'] || p['Proficiency'] || '',
        element: p['Element'] || '',
        release: p['Release'] || '',
      };
    } catch (e) {
      result[c.nickname] = { slug, error: e.message };
      console.log('!! ' + c.nickname + '(' + slug + ') 失败: ' + e.message);
    }
  }

  fs.writeFileSync(path.join(TOOLS, '_boarhat_chars.json'), JSON.stringify(result, null, 1), 'utf8');
  console.log('');
  console.log('角色名'.padEnd(12) + '性别'.padEnd(6) + '生日'.padEnd(14) + '身高'.padEnd(10) + '精通');
  for (const [name, v] of Object.entries(result)) {
    console.log(
      name.padEnd(12) + String(v.gender || '-').padEnd(6) + String(v.birthday || '-').padEnd(14) +
      String(v.height || '-').padEnd(10) + String(v.proficiency || v.error || '-')
    );
  }
  const noGender = Object.entries(result).filter(([, v]) => !v.gender).map(([n]) => n);
  console.log('');
  console.log('缺性别: ' + (noGender.length ? noGender.join(', ') : '无'));
  console.log('已写出: tools/_boarhat_chars.json');
})();
