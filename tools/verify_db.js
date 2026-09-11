// 螺一把 · 数据库与页面一致性自检
// 用法: node tools/verify_db.js
const fs = require('fs');
const path = require('path');

const ROOT = process.env.LUOYIBA_GAME_DIR || path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let fail = 0;
const check = (label, ok, extra = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra ? ' -> ' + extra : ''));
  if (!ok) fail++;
};

// 1) 数据库可加载
const sandbox = {};
new Function('window', read('characters.js'))(sandbox);
const list = sandbox.LUOYIBA_CHARACTERS;
check('characters.js 可加载', Array.isArray(list), 'records=' + (list ? list.length : 0));
check('记录数 >= 30', list.length >= 30, String(list.length));
check(
  '可用字段存在且只排除 2 名(莉莉蔻/SP黎瑟)',
  list.filter((c) => c['可用'] === false).map((c) => c.nickname).sort().join(',') === 'SP黎瑟,莉莉蔻',
  list.filter((c) => c['可用'] === false).map((c) => c.nickname).join(',') || '无'
);
check(
  '可猜池 = 31 名',
  list.filter((c) => c['可用'] !== false).length === 31,
  String(list.filter((c) => c['可用'] !== false).length)
);
check('id 唯一', new Set(list.map((c) => c.id)).size === list.length);
check('角色名唯一', new Set(list.map((c) => c.nickname)).size === list.length);
check(
  '无缺失必填字段(名称/属性/阵营)',
  list.every((c) => c.nickname && c.属性 && c.阵营),
  list.filter((c) => !c.nickname || !c.属性 || !c.阵营).map((c) => c.nickname).join(',') || 'ok'
);

// 2) 六元素与生日格式
const elems = [...new Set(list.map((c) => c.属性))].sort();
check('属性取值合法', elems.every((e) => ['光', '暗', '水', '火', '雷', '风'].includes(e)), elems.join('/'));
const badBday = list.filter((c) => c.birthday && !/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(c.birthday));
check('生日为四位 MMDD 或空', badBday.length === 0, badBday.map((c) => c.nickname + ':' + c.birthday).join(',') || 'ok');

// 3) 判定所需字段必须齐全(否则棋盘会整列 "-")
const need = ['nickname', '属性', '阵营', '势力', '性别', '近战精通', '远程精通', '版本', 'birthday'];
const missing = list.filter((c) => need.some((k) => !(k in c)));
check('判定字段齐全', missing.length === 0, missing.map((c) => c.nickname).join(',') || 'ok');
check(
  '性别取值合法(男/女/男-女自选/未知)',
  list.every((c) => ['男', '女', '男/女', '未知'].includes(c['性别'])),
  [...new Set(list.map((c) => c['性别']))].join('/')
);
check(
  '性别没有「未知」遗留(已全部确认)',
  list.every((c) => c['性别'] !== '未知'),
  list.filter((c) => c['性别'] === '未知').map((c) => c.nickname).join(',') || 'ok'
);
const MELEE = ['单手剑', '长柄', '重剑', '双刀', '鞭刃', '太刀', '全部近战'];
const RANGED = ['手枪', '双枪', '榴炮', '霰弹枪', '突击枪', '弓', '全部远程'];
const badMelee = list.filter((c) => !Array.isArray(c['近战精通']) || !c['近战精通'].length || c['近战精通'].some((w) => !MELEE.includes(w)));
const badRanged = list.filter((c) => !Array.isArray(c['远程精通']) || !c['远程精通'].length || c['远程精通'].some((w) => !RANGED.includes(w)));
check('近战精通非空且取值合法', badMelee.length === 0, badMelee.map((c) => c.nickname + ':' + JSON.stringify(c['近战精通'])).join(',') || 'ok');
check('远程精通非空且取值合法', badRanged.length === 0, badRanged.map((c) => c.nickname + ':' + JSON.stringify(c['远程精通'])).join(',') || 'ok');

// 4) 详细数据库
const details = JSON.parse(read('characters.details.json'));
check('characters.details.json 合法且条数一致', details.length === list.length, String(details.length));
check('详细数据含基础属性', details.every((d) => typeof d.基础攻击 === 'number'));

// 5) 页面引用与品牌
const html = read('index.html');
check('index.html 引用 characters.js', /src="characters\.js"/.test(html));
check('index.html 引用 app.js', /src="app\.js"/.test(html));
check('页面标题为「螺一把」', /<title>螺一把/.test(html));
check('顶栏品牌为「螺一把」', /class="brand">螺一把</.test(html));
check('页面已无「卡一把」字样', !/卡一把/.test(html));
check('页面已无卡拉彼丘专属词', !/卡拉彼丘|超弦体|晶源体/.test(html));

// 6) 列头与数据库字段对应
const ths = [...html.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);
const expected = ['角色名', '属性', '阵营', '势力', '近战精通', '远程精通', '性别', '版本', '生日'];
check('棋盘列头与数据库字段对应', JSON.stringify(ths) === JSON.stringify(expected), ths.join(' '));

// 7) 样式:棋盘列宽必须覆盖 9 列,且桌面端与移动端两组规则各自合计 100%
const css = read('style.css');
const widthRules = [...css.matchAll(/\.board th:nth-child\((\d+)\)[^{]*\{\s*width:\s*([\d.]+)%/g)].map((m) => ({
  col: Number(m[1]),
  pct: Number(m[2]),
}));
const nCols = Math.max(...widthRules.map((r) => r.col));
check('样式覆盖全部 9 列宽度', nCols === 9, '最大 nth-child = ' + nCols);

// 每 9 条为一组(桌面 + 各移动端断点);每组都必须是 1..9 且合计 100%
const groups = [];
for (let i = 0; i + 9 <= widthRules.length; i += 9) groups.push(widthRules.slice(i, i + 9));
check('列宽规则按 9 列成组', groups.length >= 2 && widthRules.length % 9 === 0, widthRules.length + ' 条 / ' + groups.length + ' 组');
groups.forEach((g, i) => {
  const sum = g.reduce((a, r) => a + r.pct, 0);
  const cols = g.map((r) => r.col).join(',');
  check('第 ' + (i + 1) + ' 组列宽合计 = 100%', Math.abs(sum - 100) < 0.6 && cols === '1,2,3,4,5,6,7,8,9', sum.toFixed(1) + '% [' + cols + ']');
});

// 主题:应当使用 abyss 配色,且不残留旧主题色
const THEME = ['#00111d', '#001e29', '#bdff00', '#00bafe', '#ffd6a7'];
check('style.css 使用 abyss 主题色', THEME.every((c) => css.includes(c)), THEME.join(' '));
check(
  'style.css 不残留旧主题色',
  !/#160a13|#281520|#d9ff3f|#a281ff|217, 255, 63/.test(css),
  'ok'
);

console.log('');
console.log(fail === 0 ? '全部通过 ✔' : fail + ' 项未通过 ✘');
process.exitCode = fail === 0 ? 0 : 1;
