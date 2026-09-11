/* 螺一把 · 拼音表生成器
 * ---------------------------------------------------------------
 * 游戏需要每个角色的 pinyin(全拼) 与 pinyinAbbr(首字母) 以支持拼音模糊联想。
 * 上游资料库没有拼音字段,这里用 pinyin-pro 自动生成 + 人工覆盖多音字。
 *
 * 输出: tools/_db_pinyin.json  (id -> { pinyin, pinyinAbbr })
 *       tools/_pinyin_review.txt (逐条打印,便于人工校对)
 *
 * 用法: node tools/gen_pinyin.js
 */
const fs = require('fs');
const path = require('path');

const TOOLS = __dirname;
const GAME = process.env.LUOYIBA_GAME_DIR || path.join(TOOLS, '..', 'game');

const lib = require(path.join(TOOLS, '_pinyin_pro', 'package', 'dist', 'index.js'));
const py = lib.pinyin || (lib.default && lib.default.pinyin);
if (typeof py !== 'function') throw new Error('pinyin-pro 未正确加载');

/** 多音字人工校准(整词替换)。
 *  依据《二重螺旋》里的读法:
 *   - 重剑 = chóng jiàn(游戏武器类型「重剑」读 chóng;pinyin-pro 默认给 zhòng)
 *   - 卡米拉 = kǎ mǐ lā(人名,不是 qiǎ)
 *   - 茜 在 法露茜 中读 xī(不是 qiàn;多音字,单人旁名字里常见 xī)
 *  其余字由 pinyin-pro 负责,逐条复核结果见 tools/_pinyin_review.txt。 */
const CUSTOM_WORDS = {
  重剑: 'chong jian',
  卡米拉: 'ka mi la',
  法露茜: 'fa lu xi',
};
// 单字级修正:确保「茜」在任何词里都读 xi(缩写也随之变成 x)
if (typeof lib.customPinyin === 'function') {
  lib.customPinyin(CUSTOM_WORDS);
  lib.customPinyin({ 茜: 'xi' });
} else {
  console.warn('警告: pinyin-pro 不支持 customPinyin,多音字校准未生效');
}

/** 转拼音(去声调,保证纯 ASCII)
 *  用 toneType:'num' 拿到 "ke4 zhou1" 再删掉声调数字;
 *  不要用 toneType:'none' —— 它返回带声调符号的 "kè zhōu",
 *  归一化时会把带声调的元音整个删掉(刻舟就会变成 kzhu)。 */
function toPinyin(text) {
  return py(String(text == null ? '' : text), { toneType: 'num' })
    .replace(/\d+/g, '')
    .trim();
}

/** 归一化:小写、去掉非字母数字(空格/中点/连字符/汉字标点都去掉) */
function norm(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/v/g, 'u');
}

/** 上游个别字段是占位符(如 {nickname}、UI_CHAR_SUBTITLE_xxx),不能当别名用 */
function cleanAlias(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\{.*\}$/.test(s)) return '';
  if (/^UI_/i.test(s)) return '';
  return s;
}

/** 取每个汉字的首字母;非汉字(字母/数字/符号)跳过,避免 "SP黎瑟" 变成 "spls"
 *  注意:不能用 toneType:'none' —— 它返回带声调的 "kè"/"zhōu",
 *  归一化时会把带声调的元音整个删掉,首字母就丢了。用 toneType:'num' 得到纯 ASCII。 */
function abbrOf(text) {
  let out = '';
  for (const ch of String(text == null ? '' : text)) {
    if (!/[\u4e00-\u9fff]/.test(ch)) continue;
    const letter = py(ch, { toneType: 'num' }).replace(/[^a-z]/gi, '')[0];
    if (letter) out += letter.toLowerCase();
  }
  return out;
}

(async () => {
  const sandbox = {};
  new Function('window', fs.readFileSync(path.join(GAME, 'characters.js'), 'utf8'))(sandbox);
  const list = sandbox.LUOYIBA_CHARACTERS;

  const db = {};
  const review = [];
  for (const c of list) {
    const alias = cleanAlias(c.alias);
    // 全拼 = 角色名拼音 + 别名(称号)拼音,两者都能搜到
    const namePy = norm(toPinyin(c.nickname));
    const aliasPy = alias ? norm(toPinyin(alias)) : '';
    const pinyin = namePy + aliasPy;
    // 首字母缩写:角色名首字母 + 别名的首字母(都只取汉字)
    const pinyinAbbr = abbrOf(c.nickname) + abbrOf(alias);
    db[c.id] = { pinyin, pinyinAbbr };
    review.push(
      [
        String(c.id).padEnd(5),
        c.nickname.padEnd(12),
        (alias || '-').padEnd(12),
        pinyin.padEnd(40),
        pinyinAbbr,
      ].join(' ')
    );
    if (String(c.alias || '').trim() && !alias) {
      review.push('      ^ 注意: 上游别名 "' + c.alias + '" 是占位符,已忽略');
    }
  }

  fs.writeFileSync(path.join(TOOLS, '_db_pinyin.json'), JSON.stringify(db, null, 1), 'utf8');
  fs.writeFileSync(
    path.join(TOOLS, '_pinyin_review.txt'),
    'id    角色名         别名(称号)     全拼(名+称号)                            首字母\n' + review.join('\n') + '\n',
    'utf8'
  );

  console.log('已生成 ' + Object.keys(db).length + ' 条拼音');
  console.log(review.join('\n'));
  console.log('');
  console.log('已写出: tools/_db_pinyin.json, tools/_pinyin_review.txt');
})();
