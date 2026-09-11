/* 螺一把 · 数据库构建器
 * ---------------------------------------------------------------
 * 来源: 《二重螺旋》第三方资料库 dna-builder
 *   - 角色主数据: src/data/d/char.data.ts  (id/名称/属性/阵营/势力/生日/版本/精通/标签/基础属性)
 *   - 数据源站点: https://dna-builder.cn/db/char
 *   - 仓库: https://github.com/pa001024/dna-builder (MIT)
 *
 * 输入: tools/_char.data.ts   (由 tools/fetch_char_data.js 下载)
 * 输出: tools/_chars_raw.json     原始抽取结果(便于核对)
 *       characters.details.json   逐角色完整数据(含基础属性)
 *       characters.js             游戏直接加载的数据库(window.LUOYIBA_CHARACTERS)
 *
 * 注意: 本步骤只做「数据库」,不改动 app.js 的判定逻辑;
 *       数据里没有性别/年龄字段(官方档案用 {性别:他|她} 模板),故不虚构这两个属性。
 * 用法: node tools/build_chars_db.js
 */
const fs = require('fs');
const path = require('path');

const TOOLS = __dirname;
// 游戏目录: 默认仓库根,可用环境变量 LUOYIBA_GAME_DIR 覆盖
const ROOT = process.env.LUOYIBA_GAME_DIR || path.join(__dirname, '..');
const SRC = process.argv[2] || path.join(TOOLS, '_char.data.ts');

const text = fs.readFileSync(SRC, 'utf8');

// ---------- 1. 切分顶层角色记录 ----------
const starts = [];
const re = /(^|\n)(\s*)id:\s*(\d+),\s*\r?\n\s*icon:\s*"([^"]*)"/g;
let m;
while ((m = re.exec(text)) !== null) starts.push({ index: m.index, id: Number(m[3]), icon: m[4] });
if (!starts.length) throw new Error('未找到任何角色记录,请检查输入文件: ' + SRC);

// ---------- 2. 字段读取 ----------
function str(block, name) {
  const mm = block.match(new RegExp('\\n\\s*' + name + ':\\s*"([^"]*)"'));
  return mm ? mm[1] : '';
}
function arr(block, name) {
  const mm = block.match(new RegExp('\\n\\s*' + name + ':\\s*\\[([^\\]]*)\\]'));
  if (!mm) return [];
  return mm[1]
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}
function num(block, name) {
  const mm = block.match(new RegExp('\\n\\s*' + name + ':\\s*(-?\\d+(?:\\.\\d+)?)'));
  return mm ? Number(mm[1]) : null;
}

// "04-28" -> "0428" (游戏内生日统一用四位 MMDD 字符串)
function toMMDD(v) {
  if (!v || !/^\d{2}-\d{2}$/.test(v)) return '';
  return v.replace('-', '');
}
// 上游个别字段是占位符,不能当别名用:
//   {nickname}              —— 主角的称号模板
//   UI_CHAR_SUBTITLE_1201   —— 未翻译的 i18n key
function cleanAlias(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\{.*\}$/.test(s)) return '';
  if (/^UI_/i.test(s)) return '';
  return s;
}

const rows = [];
for (let i = 0; i < starts.length; i++) {
  const block = text.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : text.length);
  const name = str(block, '名称');
  if (!name) continue;
  const mastery = arr(block, '精通');
  rows.push({
    id: starts[i].id,
    icon: starts[i].icon,
    nickname: name,
    属性: str(block, '属性'),
    阵营: str(block, '阵营'),
    势力: str(block, '势力'),
    出生地: str(block, '出生地'),
    版本: str(block, '版本'),
    birthday: toMMDD(str(block, '生日')),
    weapon: mastery[0] || '',
    额外精通: arr(block, '额外精通'),
    精通: mastery,
    标签: arr(block, '标签'),
    alias: [cleanAlias(str(block, '别名'))].filter(Boolean).join(' '),
    role: arr(block, '标签')[0] || '',
    crystal: str(block, '属性'),
    age: 0,
    team: str(block, '阵营'),
    gender: '',
    基础攻击: num(block, '基础攻击'),
    基础生命: num(block, '基础生命'),
    基础防御: num(block, '基础防御'),
    基础护盾: num(block, '基础护盾'),
    基础神智: num(block, '基础神智'),
  });
}

// ---------- 3. 输出 ----------
// 图片映射(由 tools/fetch_imgs.js 生成): id -> { avatar, images }
let DB_IMAGES = {};
const imgMapPath = path.join(TOOLS, '_db_images.json');
if (fs.existsSync(imgMapPath)) {
  DB_IMAGES = JSON.parse(fs.readFileSync(imgMapPath, 'utf8'));
  console.log('已读取图片映射: ' + Object.keys(DB_IMAGES).length + ' 条');
} else {
  console.log('提示: 未找到 tools/_db_images.json,avatar/images 将留空(先运行 node tools/fetch_imgs.js)');
}
const img = (r) => DB_IMAGES[r.id] || { avatar: '', images: [] };

// 拼音表(由 tools/gen_pinyin.js 生成): id -> { pinyin, pinyinAbbr }
// 仅用于「候选联想」,不参与提交判定
let DB_PINYIN = {};
const pyMapPath = path.join(TOOLS, '_db_pinyin.json');
if (fs.existsSync(pyMapPath)) {
  DB_PINYIN = JSON.parse(fs.readFileSync(pyMapPath, 'utf8'));
  console.log('已读取拼音表: ' + Object.keys(DB_PINYIN).length + ' 条');
} else {
  console.log('提示: 未找到 tools/_db_pinyin.json,拼音联想将不可用(先运行 node tools/gen_pinyin.js)');
}
const pyOf = (r) => DB_PINYIN[r.id] || { pinyin: '', pinyinAbbr: '' };

// 性别与近战/远程武器精通(由 tools/gen_gender_weapon.js 生成)
//   性别: 上游数据库没有 -> 取自 boarhat.gg;主角为玩家自选(记「无」),莉莉蔻未收录(记「未知」)
//   近战精通/远程精通: 由「精通」按武器类别切分而来
let DB_GW = {};
const gwMapPath = path.join(TOOLS, '_db_gender_weapon.json');
if (fs.existsSync(gwMapPath)) {
  DB_GW = JSON.parse(fs.readFileSync(gwMapPath, 'utf8'));
  console.log('已读取性别/精通表: ' + Object.keys(DB_GW).length + ' 条');
} else {
  console.log('提示: 未找到 tools/_db_gender_weapon.json(先运行 node tools/gen_gender_weapon.js)');
}
const gwOf = (r) => DB_GW[r.id] || { 性别: '', 近战精通: [], 远程精通: [] };

const summary = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
const report = {
  count: rows.length,
  属性: summary('属性'),
  阵营: summary('阵营'),
  势力: summary('势力'),
  版本: summary('版本'),
  精通: [...new Set(rows.flatMap((r) => r.精通))].sort(),
  标签: [...new Set(rows.flatMap((r) => r.标签))].sort(),
};

fs.writeFileSync(path.join(TOOLS, '_chars_raw.json'), JSON.stringify(rows, null, 1), 'utf8');

// 3a. 详细数据(供后续做「判定逻辑/角色详情」时使用)
fs.writeFileSync(
  path.join(ROOT, 'characters.details.json'),
  JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      名称: r.nickname,
      属性: r.属性,
      阵营: r.阵营,
      势力: r.势力,
      出生地: r.出生地,
      版本: r.版本,
      生日: r.birthday,
      精通: r.精通,
      额外精通: r.额外精通,
      标签: r.标签,
      别名: r.alias,
      pinyin: pyOf(r).pinyin,
      pinyinAbbr: pyOf(r).pinyinAbbr,
      性别: gwOf(r).性别,
      近战精通: gwOf(r).近战精通,
      远程精通: gwOf(r).远程精通,
      avatar: img(r).avatar,
      images: img(r).images,
      基础攻击: r.基础攻击,
      基础生命: r.基础生命,
      基础防御: r.基础防御,
      基础护盾: r.基础护盾,
      基础神智: r.基础神智,
    })),
    null,
    1
  ),
  'utf8'
);

// 3b. 游戏数据库
const lines = [];
lines.push('// 螺一把 · 角色数据库(由《二重螺旋》资料库生成,请勿手改,改数据请重新运行 tools/build_chars_db.js)');
lines.push('// 数据来源: dna-builder —— https://dna-builder.cn/db/char (仓库 pa001024/dna-builder, MIT)');
lines.push('//');
lines.push('// 字段说明:');
lines.push('//   nickname 角色名 / 属性 六元素(光|暗|水|火|雷|风) / 阵营 六大阵营 / 势力 细分势力 / 版本 实装版本');
lines.push('//   性别 男/女(3 名主角性别由玩家自选,记为「男/女」)');
lines.push('//   近战精通/远程精通 武器精通按类别分成两行(近战:单手剑 长柄 重剑 双刀 鞭刃 太刀;远程:手枪 双枪 榴炮 霰弹枪 突击枪 弓)');
lines.push('//   精通 原始武器精通数组 / 额外精通 需解锁的武器 / 标签 上游定位标签(仅存档,不上棋盘)');
lines.push('//   alias 搜索别名(称号) / icon 上游资源名');
lines.push('//   可用 true=已加入游戏、可作答案;false=仅存档,不参与对局(莉莉蔻/SP黎瑟)');
lines.push('//   pinyin 全拼(角色名+称号,已去声调) / pinyinAbbr 首字母缩写 —— 仅用于候选联想,不能直接提交');
lines.push('//   avatar 小头像路径 / images 立绘图路径数组(游戏内随机取一张);无图时为空');
lines.push('//   兼容字段(不参与判定): team=阵营, role=标签第一项, crystal=属性, gender=性别, weapon=近战精通, age=0(本作无年龄数据)');
lines.push('//   基础属性(攻击/生命/防御/护盾/神智)见 characters.details.json');
lines.push('');
// 尚未完整加入《二重螺旋》正式游戏的角色:数据保留在库里,但不进入游戏可猜池
//   莉莉蔻(2.0)、SP黎瑟(1.7)
// 依据:这两个角色在上游数据里也缺字段(莉莉蔻无标签/无生日/无势力,SP黎瑟无生日/无势力)
const NOT_IN_GAME = new Set(['莉莉蔻', 'SP黎瑟']);

lines.push('window.LUOYIBA_CHARACTERS = [');
rows.forEach((r, i) => {
  const o = {
    id: r.id,
    nickname: r.nickname,
    // 可用 = 是否已完整加入游戏;false 表示仅存档,不参与对局
    可用: !NOT_IN_GAME.has(r.nickname),
    属性: r.属性,
    阵营: r.阵营,
    势力: r.势力,
    版本: r.版本,
    weapon: r.weapon,
    精通: r.精通,
    额外精通: r.额外精通,
    标签: r.标签,
    birthday: r.birthday,
    alias: r.alias,
    icon: r.icon,
    // 拼音联想:pinyin 全拼(角色名+称号),pinyinAbbr 首字母缩写;仅用于候选联想
    pinyin: pyOf(r).pinyin,
    pinyinAbbr: pyOf(r).pinyinAbbr,
    // 性别 + 武器精通(近战/远程各一行)
    性别: gwOf(r).性别,
    近战精通: gwOf(r).近战精通,
    远程精通: gwOf(r).远程精通,
    // 图片: avatar 用于候选列表/猜测行小图, images 用于结算立绘(开局随机固定一张)
    avatar: img(r).avatar,
    images: img(r).images,
    // 兼容旧字段(无实际判定用途,仅避免旧代码读到 undefined)
    team: r.阵营,
    role: r.标签[0] || '',
    crystal: r.属性,
    gender: gwOf(r).性别,
    weapon: gwOf(r).近战精通.join('/'),
    age: 0, // 本作无年龄数据
  };
  const body = Object.entries(o)
    .map(([k, v]) => '  ' + k + ': ' + JSON.stringify(v))
    .join(',\n');
  lines.push(' {');
  lines.push(body);
  lines.push(' }' + (i === rows.length - 1 ? '' : ','));
});
lines.push('];');
lines.push('');
fs.writeFileSync(path.join(ROOT, 'characters.js'), lines.join('\n'), 'utf8');

console.log('角色数: ' + report.count);
console.log('属性: ' + report.属性.join(' / '));
console.log('阵营: ' + report.阵营.join(' / '));
console.log('势力: ' + report.势力.join(' / '));
console.log('版本: ' + report.版本.join(' / '));
console.log('武器类型: ' + report.精通.join(' / '));
console.log('标签: ' + report.标签.join(' / '));
console.log('已写出: characters.js, characters.details.json, tools/_chars_raw.json');
