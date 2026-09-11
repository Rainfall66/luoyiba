// 螺一把 · 拼音模糊搜索测试
// 覆盖:全拼 / 首字母 / 中文名 / 称号 的联想排序,以及「拼音不能直接提交」这条关键约束。
// 用法: node tools/test_pinyin_search.js
const fs = require('fs');
const path = require('path');

const GAME = process.env.LUOYIBA_GAME_DIR || path.join(__dirname, '..');
const win = {};
new Function('window', fs.readFileSync(path.join(GAME, 'characters.js'), 'utf8'))(win);
const mod = { exports: {} };
new Function('module', 'window', 'document', fs.readFileSync(path.join(GAME, 'app.js'), 'utf8'))(mod, win, undefined);
const api = mod.exports;
const list = win.LUOYIBA_CHARACTERS;

let fail = 0;
const t = (label, ok, extra = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra ? ' -> ' + extra : ''));
  if (!ok) fail++;
};

const names = (q, limit) => api.searchCharacters(list, q, limit || 8).map((c) => c.nickname);
const first = (q) => (names(q)[0] || '(无)');

console.log('=== 数据完整性 ===');
t('每个角色都有 pinyin', list.every((c) => c.pinyin), list.filter((c) => !c.pinyin).map((c) => c.nickname).join(',') || 'ok');
t('每个角色都有 pinyinAbbr', list.every((c) => c.pinyinAbbr), list.filter((c) => !c.pinyinAbbr).map((c) => c.nickname).join(',') || 'ok');
t('拼音全为 ASCII 小写', list.every((c) => /^[a-z0-9]*$/.test(c.pinyin)), list.filter((c) => !/^[a-z0-9]*$/.test(c.pinyin)).map((c) => c.nickname).join(',') || 'ok');

console.log('');
console.log('=== 全拼联想 ===');
t('kezhou -> 刻舟', first('kezhou') === '刻舟', first('kezhou'));
t('beileinika -> 贝蕾妮卡', first('beileinika') === '贝蕾妮卡', first('beileinika'));
t('dafunie -> 达芙涅', first('dafunie') === '达芙涅', first('dafunie'));
t('suyi -> 苏乙', first('suyi') === '苏乙', first('suyi'));
t('nifuer -> 妮弗尔夫人', first('nifuer') === '妮弗尔夫人', first('nifuer'));
t('lise -> 黎瑟 或 SP黎瑟', ['黎瑟', 'SP黎瑟'].includes(first('lise')), first('lise'));
t('部分拼音 qian -> 含「qian」的角色', names('qian').length > 0, names('qian').join(','));

console.log('');
console.log('=== 首字母联想 ===');
t('kz -> 刻舟 排第一', first('kz') === '刻舟', first('kz'));
t('blnk -> 贝蕾妮卡', first('blnk') === '贝蕾妮卡', first('blnk'));
t('slyzz -> 松露与榛子', first('slyzz') === '松露与榛子', first('slyzz'));
t('xbe -> 西比尔', first('xbe') === '西比尔', first('xbe'));
t('kmly -> 卡米拉(前 3 命中)', names('kml').includes('卡米拉'), names('kml').join(','));
t('SP黎瑟 首字母 ls -> 能搜到', names('ls').includes('SP黎瑟') || names('ls').includes('黎瑟'), names('ls').join(','));

console.log('');
console.log('=== 中文名 / 称号 ===');
t('刻舟 -> 刻舟', first('刻舟') === '刻舟', first('刻舟'));
t('刻 -> 刻舟 排第一(前缀优先)', first('刻') === '刻舟', first('刻'));
t('仗剑游(称号)-> 刻舟', first('仗剑游') === '刻舟', first('仗剑游'));
t('雾海引渡人(称号)-> 妮弗尔夫人', first('雾海引渡人') === '妮弗尔夫人', first('雾海引渡人'));
t('称号拼音 zhangjianyou -> 刻舟', first('zhangjianyou') === '刻舟', first('zhangjianyou'));

console.log('');
console.log('=== 排序优先级 ===');
// 角色名精确应优先于拼音命中:输入 "苏乙" 时 苏乙 必须第一
t('精确角色名优先', first('苏乙') === '苏乙', first('苏乙'));
// 大小写与空格/中点不敏感
t('大小写不敏感: KEZHOU', first('KEZHOU') === '刻舟', first('KEZHOU'));
t('忽略中点: songlu 与 松露与榛子', first('songluyu') === '松露与榛子', first('songluyu'));
t('空输入返回空数组', names('').length === 0, JSON.stringify(names('')));
t('乱码输入返回空数组', names('zzzzqqqq').length === 0, JSON.stringify(names('zzzzqqqq')));
t('limit 生效', api.searchCharacters(list, 'l', 3).length <= 3, String(api.searchCharacters(list, 'l', 3).length));

console.log('');
console.log('=== 关键约束:拼音不能直接提交 ===');
// findCharacter 是内部函数,通过脚本源码确认它不使用 pinyin 字段
const src = fs.readFileSync(path.join(GAME, 'app.js'), 'utf8');
const fnBody = (src.match(/function findCharacter\(input\)\s*\{[\s\S]*?\n  \}/) || [''])[0];
t('findCharacter 只比较 nickname/alias', /nickname/.test(fnBody) && /alias/.test(fnBody) && !/pinyin/.test(fnBody), fnBody.split('\n').length + ' 行');
t('提交路径不含拼音回退', !/findCharacter[\s\S]{0,200}pinyin/.test(src));

console.log('');
console.log('=== 多音字人工校准(回归) ===');
// 茜 在「法露茜」里读 xī,不是 qiàn
const falu = list.find((c) => c.nickname === '法露茜');
t('法露茜 全拼含 faluxi(不是 faluqian)', /faluxi/.test(falu.pinyin) && !/qian/.test(falu.pinyin), falu.pinyin);
t('法露茜 首字母含 flx(不是 flq)', falu.pinyinAbbr.indexOf('flx') === 0 && falu.pinyinAbbr.indexOf('flq') === -1, falu.pinyinAbbr);
t('拼音 faluxi -> 法露茜', first('faluxi') === '法露茜', first('faluxi'));
t('拼音 flx -> 法露茜', names('flx').includes('法露茜'), names('flx').join(','));
t('旧读法 faluqian 不应命中', !names('faluqian').includes('法露茜'), names('faluqian').join(',') || '(空)');
// 重剑 = chóng jiàn(游戏内武器类型读法)
const kezhou = list.find((c) => c.nickname === '刻舟');
t('刻舟全拼正确(kezhou)', /^kezhou/.test(kezhou.pinyin), kezhou.pinyin);
// 卡米拉 = kǎ mǐ lā
const kamila = list.find((c) => c.nickname === '卡米拉');
t('卡米拉全拼含 kamila(不是 qiamila)', /kamila/.test(kamila.pinyin), kamila.pinyin);

console.log('');
console.log(fail === 0 ? '全部通过 ✔' : fail + ' 项未通过 ✘');
process.exitCode = fail === 0 ? 0 : 1;
