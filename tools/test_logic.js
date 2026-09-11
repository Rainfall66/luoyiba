// 螺一把 · 判定逻辑测试(node 直接跑,不需要浏览器)
// 用法: node tools/test_logic.js
const fs = require('fs');
const path = require('path');

const GAME = process.env.LUOYIBA_GAME_DIR || path.join(__dirname, '..', 'game');

// 1) 载入数据库 -> window
const win = {};
new Function('window', fs.readFileSync(path.join(GAME, 'characters.js'), 'utf8'))(win);

// 2) 载入 app.js(无 document,只会导出纯逻辑)
global.window = win;
const mod = { exports: {} };
new Function('module', 'window', 'document', fs.readFileSync(path.join(GAME, 'app.js'), 'utf8'))(
  mod,
  win,
  undefined
);
const api = mod.exports;

let fail = 0;
function t(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok ? '' : ` -> got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`));
  if (!ok) fail++;
}

console.log('=== 版本号比较(数值段,非字典序)===');
t('compareVersion 1.10 vs 1.9', api.compareVersion('1.10', '1.9'), 1);
t('compareVersion 1.9 vs 1.10', api.compareVersion('1.9', '1.10'), -1);
t('compareVersion 2.0 vs 1.9', api.compareVersion('2.0', '1.9'), 1);
t('compareVersion 1.1 vs 1.1', api.compareVersion('1.1', '1.1'), 0);
t('compareVersion 空值', api.compareVersion('', '1.0'), null);

console.log('');
console.log('=== 生日环形 ±15 天 ===');
const C = (g, tar) => api.compare({ nickname: 'g', birthday: g }, { nickname: 't', birthday: tar }).attrs.birthday;
t('完全相同 = correct', C('0101', '0101').level, 'correct');
t('相差 10 天 = close', C('0101', '0111').level, 'close');
t('相差 15 天 = close(边界)', C('0101', '0116').level, 'close');
t('相差 16 天 = wrong(边界外)', C('0101', '0117').level, 'wrong');
t('相差 20 天 = wrong', C('0101', '0121').level, 'wrong');
t('跨年环形: 1231 vs 0114 (15天) = close', C('1231', '0114').level, 'close');
t('跨年环形: 1231 vs 0115 (16天) = wrong', C('1231', '0115').level, 'wrong');
t('跨年环形: 0101 vs 1215 (16天) = wrong', C('0101', '1215').level, 'wrong');
t('箭头: 目标更晚 = higher', C('0101', '0601').hint, 'higher');
t('箭头: 目标更早 = lower', C('0601', '0101').hint, 'lower');
t('空生日 = wrong 且无箭头', [C('', '0601').level, C('', '0601').hint], ['wrong', undefined]);
t('闰日 02-29 合法且标签可读', [C('0229', '0229').level, api.birthdayLabel('0229')], ['correct', '2月29日']);
t('非法日期 02-30 = 未知(灰)', C('0230', '0601').level, 'wrong');

console.log('');
console.log('=== 势力 / 近战精通 / 远程精通:完全相同绿、有交集黄、无交集灰 ===');
const cmp = (g, tar) => api.compare(g, tar).attrs;
t('势力完全相同 = correct', cmp({ nickname: 'g', 势力: '第十三军团' }, { nickname: 't', 势力: '第十三军团' }).势力.level, 'correct');
t('势力不同 = wrong', cmp({ nickname: 'g', 势力: '第十三军团' }, { nickname: 't', 势力: '枯荣阁' }).势力.level, 'wrong');
t('势力一方为空 = wrong', cmp({ nickname: 'g', 势力: '' }, { nickname: 't', 势力: '枯荣阁' }).势力.level, 'wrong');
t('近战精通完全相同 = correct', cmp({ nickname: 'g', 近战精通: ['单手剑', '双刀'] }, { nickname: 't', 近战精通: ['单手剑', '双刀'] }).近战精通.level, 'correct');
t('近战精通有交集 = close', cmp({ nickname: 'g', 近战精通: ['单手剑'] }, { nickname: 't', 近战精通: ['单手剑', '双刀'] }).近战精通.level, 'close');
t('近战精通无交集 = wrong', cmp({ nickname: 'g', 近战精通: ['鞭刃'] }, { nickname: 't', 近战精通: ['单手剑', '双刀'] }).近战精通.level, 'wrong');
t('远程精通完全相同 = correct', cmp({ nickname: 'g', 远程精通: ['双枪'] }, { nickname: 't', 远程精通: ['双枪'] }).远程精通.level, 'correct');
t('远程精通有交集 = close', cmp({ nickname: 'g', 远程精通: ['双枪', '弓'] }, { nickname: 't', 远程精通: ['双枪'] }).远程精通.level, 'close');
t('远程精通无交集 = wrong', cmp({ nickname: 'g', 远程精通: ['手枪'] }, { nickname: 't', 远程精通: ['双枪'] }).远程精通.level, 'wrong');
// 「全部近战」是一个单独的取值:对同样写「全部近战」的答案是绿,对具体武器(长柄)只是黄(有交集但不等)
t('「全部近战」vs「全部近战」= correct',
  cmp({ nickname: 'g', 近战精通: ['全部近战'] }, { nickname: 't', 近战精通: ['全部近战'] }).近战精通.level, 'correct');
t('「全部近战」vs「长柄」= close(不是完全相同)',
  cmp({ nickname: 'g', 近战精通: ['全部近战'] }, { nickname: 't', 近战精通: ['长柄'] }).近战精通.level, 'close');
t('近战与远程互不影响', [
  cmp({ nickname: 'g', 近战精通: ['长柄'], 远程精通: ['突击枪'] }, { nickname: 't', 近战精通: ['长柄'], 远程精通: ['弓'] }).近战精通.level,
  cmp({ nickname: 'g', 近战精通: ['长柄'], 远程精通: ['突击枪'] }, { nickname: 't', 近战精通: ['长柄'], 远程精通: ['弓'] }).远程精通.level,
], ['correct', 'wrong']);

console.log('');
console.log('=== 属性 / 阵营 / 性别:精确绿 ===');
const cmp2 = (g, tar) => api.compare(g, tar).attrs;
t('属性相同 = correct', cmp2({ nickname: 'g', 属性: '光' }, { nickname: 't', 属性: '光' }).属性.level, 'correct');
t('属性不同 = wrong', cmp2({ nickname: 'g', 属性: '光' }, { nickname: 't', 属性: '暗' }).属性.level, 'wrong');
t('阵营空值 = wrong', cmp2({ nickname: 'g', 阵营: '' }, { nickname: 't', 阵营: '华胥' }).阵营.level, 'wrong');
t('性别相同 = correct', cmp2({ nickname: 'g', 性别: '女' }, { nickname: 't', 性别: '女' }).性别.level, 'correct');
t('性别不同 = wrong', cmp2({ nickname: 'g', 性别: '男' }, { nickname: 't', 性别: '女' }).性别.level, 'wrong');
// 主角记为「男/女」:同一个值互猜为绿,与确定性别互猜为灰
t('「男/女」vs「男/女」= correct', cmp2({ nickname: 'g', 性别: '男/女' }, { nickname: 't', 性别: '男/女' }).性别.level, 'correct');
t('「男/女」vs「男」= wrong', cmp2({ nickname: 'g', 性别: '男/女' }, { nickname: 't', 性别: '男' }).性别.level, 'wrong');
t('「男/女」vs「女」= wrong', cmp2({ nickname: 'g', 性别: '男/女' }, { nickname: 't', 性别: '女' }).性别.level, 'wrong');

console.log('');
console.log('=== 版本列:相同绿、不同黄+箭头 ===');
t('版本相同 = correct', cmp2({ nickname: 'g', 版本: '1.1' }, { nickname: 't', 版本: '1.1' }).版本.level, 'correct');
t('版本更低 = close/▲', [cmp2({ nickname: 'g', 版本: '1.0' }, { nickname: 't', 版本: '1.4' }).版本.level, cmp2({ nickname: 'g', 版本: '1.0' }, { nickname: 't', 版本: '1.4' }).版本.hint], ['close', 'higher']);
t('版本更高 = close/▼', [cmp2({ nickname: 'g', 版本: '1.4' }, { nickname: 't', 版本: '1.0' }).版本.level, cmp2({ nickname: 'g', 版本: '1.4' }, { nickname: 't', 版本: '1.0' }).版本.hint], ['close', 'lower']);

console.log('');
console.log('=== 整局链路:用真实数据库比对 ===');
const list = win.LUOYIBA_CHARACTERS;
const guess = list.find((c) => c.nickname === '刻舟');
const target = list.find((c) => c.nickname === '苏乙');
const row = api.compare(guess, target);
t('非同名时 correct=false', row.correct, false);
t('格数与列数一致', row.cells.length, 8);
t('自己猜自己 = correct', api.compare(guess, guess).correct, true);
console.log('刻舟 vs 苏乙 -> 属性:', row.attrs.属性.level, '| 阵营:', row.attrs.阵营.level, '| 势力:', row.attrs.势力.level,
  '| 近战:', row.attrs.近战精通.level, '| 远程:', row.attrs.远程精通.level,
  '| 性别:', row.attrs.性别.level, '| 版本:', row.attrs.版本.level, row.attrs.版本.hint || '', '| 生日:', row.attrs.birthday.level);

// 全库自检:任意两两比对不得抛错,且自己比自己必须全绿/满分
console.log('');
let err = null;
for (const a of list) {
  for (const b of list) {
    try {
      const r = api.compare(a, b);
      if (r.cells.length !== 8) throw new Error('列数错误:' + r.cells.length);
    } catch (e) { err = a.nickname + ' vs ' + b.nickname + ': ' + e.message; break; }
  }
  if (err) break;
}
t('全库两两比对无异常(' + list.length + '^2 次)', err, null);

const selfBad = list.filter((c) => {
  const r = api.compare(c, c);
  if (!r.correct) return true;
  // 已知数据(非空)的列必须全绿;空值列(如主角无生日/势力)保持灰是预期行为
  const empty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'string' && !v.trim());
  return r.cells.some((cell, i) => {
    const key = ['属性', '阵营', '势力', '近战精通', '远程精通', '性别', '版本', 'birthday'][i];
    if (empty(c[key])) return false;
    return cell.level === 'wrong';
  });
});
t('已知属性列:自己比自己必须绿(空值列除外)', selfBad.map((c) => c.nickname), []);

// 反向性质:两人同名属性值相同 -> 该列必为 correct
const propBad = [];
for (const a of list) {
  for (const b of list) {
    const r = api.compare(a, b);
    if (a['属性'] === b['属性'] && r.attrs['属性'].level !== 'correct') propBad.push(a.nickname + ' 属性');
    if (a['阵营'] === b['阵营'] && a['阵营'] && r.attrs['阵营'].level !== 'correct') propBad.push(a.nickname + ' 阵营');
    if (a['性别'] === b['性别'] && a['性别'] && r.attrs['性别'].level !== 'correct') propBad.push(a.nickname + ' 性别');
    if (a['版本'] === b['版本'] && a['版本'] && r.attrs['版本'].level !== 'correct') propBad.push(a.nickname + ' 版本');
    if (a['势力'] === b['势力'] && a['势力'] && r.attrs['势力'].level !== 'correct') propBad.push(a.nickname + ' 势力');
    // 精通是数组:完全相同的数组必判 correct
    const sameList = (x, y) => Array.isArray(x) && Array.isArray(y) && JSON.stringify(x) === JSON.stringify(y);
    if (sameList(a['近战精通'], b['近战精通']) && r.attrs['近战精通'].level !== 'correct') propBad.push(a.nickname + ' 近战精通');
    if (sameList(a['远程精通'], b['远程精通']) && r.attrs['远程精通'].level !== 'correct') propBad.push(a.nickname + ' 远程精通');
  }
}
t('性质检验:相同非空取值必判 correct', propBad.slice(0, 5), []);

console.log('');
console.log('=== 可猜池:未完整加入游戏的角色不进对局 ===');
const all = api.characters;
const pool = api.playable;
t('完整数据库仍是 33 条', all.length, 33);
t('可猜池排除 2 名', pool.length, 31);
t('被排除的正是 莉莉蔻 / SP黎瑟',
  all.filter((c) => c['可用'] === false).map((c) => c.nickname).sort().join(','), 'SP黎瑟,莉莉蔻');
t('可猜池里没有「可用=false」的角色', pool.filter((c) => c['可用'] === false).length, 0);
t('数据库仍保留这两条记录(不被删除)',
  ['莉莉蔻', 'SP黎瑟'].every((n) => all.some((c) => c.nickname === n)), true);
// 同名的「黎瑟」是在游戏内的,不能被误伤
t('黎瑟 仍在可猜池里(未被 SP黎瑟 误伤)', pool.some((c) => c.nickname === '黎瑟'), true);
// 联想不应给出不可用角色
t('拼音 llk 不给莉莉蔻', api.searchCharacters(pool, 'llk', 8).every((c) => c.nickname !== '莉莉蔻'), true);
t('拼音 spls 不给 SP黎瑟', api.searchCharacters(pool, 'spls', 8).every((c) => c.nickname !== 'SP黎瑟'), true);

// 随机选目标多次,绝不能选中被排除的角色
const seen = new Set();
for (let i = 0; i < 4000; i++) {
  const c = pool[Math.floor(Math.random() * pool.length)];
  seen.add(c.nickname);
}
const excludedSeen = [seen.has('莉莉蔻'), seen.has('SP黎瑟')];
t('随机抽 4000 次不出现被排除角色', excludedSeen, [false, false]);
console.log('       (池大小 ' + pool.length + ',4000 次抽到 ' + seen.size + ' 个不同角色)');

console.log('');
console.log(fail === 0 ? '全部通过 ✔' : fail + ' 项未通过 ✘');
process.exitCode = fail === 0 ? 0 : 1;
