// 螺一把 · 集成自检(不需要浏览器)
// 覆盖「数据库 ↔ app.js ↔ index.html ↔ images」之间最容易脱节的地方:
//   1. app.js 读取的全局变量名必须与 characters.js 暴露的变量名一致
//   2. 棋盘列数(HTML <th>) 必须与 app.js 的 COLUMN_ORDER 一致,且单元格数一致
//   3. 每个角色的 avatar / images 路径必须真实存在
//   4. localStorage 键必须与「卡一把」隔离
// 用法: node tools/test_integration.js
const fs = require('fs');
const path = require('path');

const GAME = process.env.LUOYIBA_GAME_DIR || path.join(__dirname, '..', 'game');
const read = (p) => fs.readFileSync(path.join(GAME, p), 'utf8');

let fail = 0;
function t(label, ok, extra = '') {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra ? ' -> ' + extra : ''));
  if (!ok) fail++;
}

const html = read('index.html');
const app = read('app.js');
const dbCode = read('characters.js');

// ---- 1. 全局变量名一致 ----
const exposed = (dbCode.match(/window\.([A-Z_]+)\s*=/) || [])[1];
const consumed = (app.match(/window\.([A-Z_]+)\s*\|\|/) || [])[1];
t('characters.js 暴露的全局变量与 app.js 读取的一致', exposed && exposed === consumed, exposed + ' vs ' + consumed);

// ---- 2. 列数一致 ----
// 棋盘 = 「角色名」列 + COLUMN_ORDER 的 8 列,渲染时 row.cells 也正好是这 8 列
const ths = [...html.matchAll(/<th>([^<]*)<\/th>/g)].map((m) => m[1]);
const orderRaw = (app.match(/var COLUMN_ORDER\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
const order = orderRaw.split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
t('HTML 列头数量 = 1(角色名) + COLUMN_ORDER 数量', ths.length === order.length + 1, ths.length + ' vs 1+' + order.length);
const LABELS = { 属性: '属性', 阵营: '阵营', 势力: '势力', 近战精通: '近战精通', 远程精通: '远程精通', 性别: '性别', 版本: '版本', birthday: '生日' };
t(
  '列头文字与 COLUMN_ORDER 一一对应',
  JSON.stringify(ths) === JSON.stringify(['角色名', ...order.map((k) => LABELS[k] || k)]),
  ths.join(' | ')
);
t('定位标签已从棋盘移除', !ths.includes('定位标签') && !order.includes('标签'));
t('武器类型已替换为近战/远程精通两列', ths.includes('近战精通') && ths.includes('远程精通') && !ths.includes('武器类型'));
// renderBoard 里 row.cells.map(...) 消费的列数必须与上面一致
t('渲染单元格数 = COLUMN_ORDER 数量', /row\.cells\.map\(cellHtml\)/.test(app), 'row.cells.map(cellHtml)');

// ---- 3. 数据库 + 图片 ----
const sandbox = {};
new Function('window', dbCode)(sandbox);
const list = sandbox.LUOYIBA_CHARACTERS;
t('数据库可加载', Array.isArray(list) && list.length > 0, 'records=' + list.length);

const brokenRefs = [];
for (const c of list) {
  for (const p of [c.avatar].concat(c.images || [])) {
    if (!p) continue;
    if (!fs.existsSync(path.join(GAME, p))) brokenRefs.push(c.nickname + ':' + p);
  }
}
t('所有 avatar/images 文件都存在', brokenRefs.length === 0, brokenRefs.slice(0, 5).join(', ') || 'ok');

const noImg = list.filter((c) => !c.avatar || !(c.images || []).length);
t('每个角色至少有一张图', noImg.length === 0, noImg.map((c) => c.nickname).join(', ') || 'ok');

// 判定逻辑所需的属性字段必须齐全
const need = ['属性', '阵营', '势力', '性别', '近战精通', '远程精通', '版本', 'birthday'];
const missing = list.filter((c) => need.some((k) => !(k in c)));
t('判定字段齐全(' + need.join('/') + ')', missing.length === 0, missing.map((c) => c.nickname).join(', ') || 'ok');
t('数据库仍保留上游「标签」字段(仅不上棋盘)', list.every((c) => Array.isArray(c['标签'])));

// 别名不能是上游占位符(否则会变成垃圾联想词)
const junkAlias = list.filter((c) => /^\{.*\}$/.test((c.alias || '').trim()) || /^UI_/i.test((c.alias || '').trim()));
t('没有占位符别名({nickname} / UI_*)', junkAlias.length === 0, junkAlias.map((c) => c.nickname + ':' + c.alias).join(', ') || 'ok');

// 版本必须是可比较的数值段格式(比较时按数值拆段)
const badVer = list.filter((c) => c['版本'] && !/^\d+(\.\d+)*$/.test(c['版本']));
t('版本格式合法', badVer.length === 0, badVer.map((c) => c.nickname + ':' + c['版本']).join(', ') || 'ok');

// 可猜角色的版本区间(README 里写的是 1.0~1.6)
const playable = list.filter((c) => c['可用'] !== false);
const maxPlayable = [...new Set(playable.map((c) => c['版本']))].sort((a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  return (pa[0] - pb[0]) || ((pa[1] || 0) - (pb[1] || 0));
}).pop();
t('可猜角色最高版本为 1.6(与 README 一致)', maxPlayable === '1.6', maxPlayable);

// ---- 4. localStorage 键隔离 ----
t('localStorage 键已改为 luoyiba 命名空间', /'luoyiba:recent'/.test(app) && /'luoyiba:stats'/.test(app));
t('app.js 中不再残留 kayi-ba 键', !/kayi-ba:/.test(app));

// ---- 5. 图片格式与页面兼容 ----
const imgFiles = fs.readdirSync(path.join(GAME, 'images'));
const badExt = imgFiles.filter((f) => !/\.(webp|png|jpg|jpeg|gif)$/i.test(f));
t('images/ 下无非法扩展名文件', badExt.length === 0, badExt.join(', ') || 'ok');
t('images/ 中没有遗留的旧项目图片', !imgFiles.some((f) => /^aika|^baimo|^ming-/.test(f)), imgFiles.slice(0, 3).join(', '));
// 头像资源应为游戏内小头像 T_Head(落盘名 head-<slug>.webp)
const avatarRefs = [...new Set(list.map((c) => c.avatar).filter(Boolean))];
t('头像全部指向游戏内小头像 head-*.webp', avatarRefs.length > 0 && avatarRefs.every((p) => /\/head-[a-z0-9-]+\.webp$/.test(p)), avatarRefs.slice(0, 2).join(', '));
t('images/ 下以 head- 为主', imgFiles.filter((f) => /^head-/.test(f)).length >= list.length, imgFiles.filter((f) => /^head-/.test(f)).length + ' 张');
const orphan = imgFiles.filter((f) => !avatarRefs.some((p) => p.endsWith('/' + f)));
t('images/ 中没有未被引用的孤立文件', orphan.length === 0, orphan.slice(0, 5).join(', ') || 'ok');

// ---- 6. 规则弹窗不再描述旧游戏 ----
t('规则弹窗已更新为二重螺旋属性', /属性<\/b>:光 \/ 暗/.test(html) && !/超弦体/.test(html));
t('规则弹窗不再提「定位标签」', !/定位标签/.test(html));
t('规则弹窗说明了近战/远程精通与性别', /近战精通/.test(html) && /远程精通/.test(html) && /性别/.test(html));

console.log('');
console.log(fail === 0 ? '全部通过 ✔' : fail + ' 项未通过 ✘');
process.exitCode = fail === 0 ? 0 : 1;
