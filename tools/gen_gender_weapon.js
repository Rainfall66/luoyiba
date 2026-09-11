/* 螺一把 · 性别与武器精通(近战/远程)数据整理
 * ---------------------------------------------------------------
 * 数据来源:
 *   - 武器精通(近战/远程各一): dna-builder `char.data.ts` 的「精通」字段
 *     并按武器类别切分成近战/远程两类;与 boarhat.gg 的角色页交叉核对(见 _boarhat_chars.json)
 *   - 性别: dna-builder 没有该字段,取自 boarhat.gg 角色页 Profile 表的 Gender
 *     3 个主角(主角-暗/光/水)在 boarhat 上是 "-"(玩家自选性别),记为「男/女」
 *     莉莉蔻(2.0)boarhat 尚未收录,按确认结果填「女」
 *
 * 输出: tools/_db_gender_weapon.json
 *       tools/_weapon_review.txt (逐条打印,便于人工核对)
 * 用法: node tools/gen_gender_weapon.js
 */
const fs = require('fs');
const path = require('path');

const TOOLS = __dirname;
const GAME = process.env.LUOYIBA_GAME_DIR || path.join(TOOLS, '..');

/** 武器类别划分(依据游戏内武器分类:近战 6 种 / 远程 6 种)
 *  近战:单手剑 长柄 重剑 双刀 鞭刃 太刀
 *  远程:手枪 双枪 榴炮 霰弹枪 突击枪 弓
 *  注:游戏内「鞭刃」与「鞭剑」是同一把武器的两种写法,统一用 dna 的「鞭刃」 */
const MELEE = ['单手剑', '长柄', '重剑', '双刀', '鞭刃', '太刀'];
const RANGED = ['手枪', '双枪', '榴炮', '霰弹枪', '突击枪', '弓'];
const ALL_MELEE_LABEL = '全部近战';
const ALL_RANGED_LABEL = '全部远程';

const isAll = (list) => list.some((w) => /^全部/.test(w));

/** boarhat 英文武器名 -> 中文(dna 写法),用于交叉核对 */
const EN2CN = {
  Sword: '单手剑',
  Polearm: '长柄',
  Greatsword: '重剑',
  'Dual Blades': '双刀',
  Whipblade: '鞭刃',
  Whipsword: '鞭刃',
  Katana: '太刀',
  Pistol: '手枪',
  'Dual Pistols': '双枪',
  'Grenade Launcher': '榴炮',
  Shotgun: '霰弹枪',
  'Assault Rifle': '突击枪',
  Bow: '弓',
  'All Types': '全部类型',
};

(async () => {
  const sandbox = {};
  new Function('window', fs.readFileSync(path.join(GAME, 'characters.js'), 'utf8'))(sandbox);
  const list = sandbox.LUOYIBA_CHARACTERS;

  const boarhatPath = path.join(TOOLS, '_boarhat_chars.json');
  const boarhat = fs.existsSync(boarhatPath) ? JSON.parse(fs.readFileSync(boarhatPath, 'utf8')) : {};

  const GENDER_CN = { Male: '男', Female: '女' };

  const db = {};
  const review = [];
  const mismatches = [];

  for (const c of list) {
    const mastery = (c['精通'] || []).slice();
    // 近战 / 远程切分
    let melee;
    let ranged;
    if (isAll(mastery)) {
      melee = [ALL_MELEE_LABEL];
      ranged = [ALL_RANGED_LABEL];
    } else {
      melee = mastery.filter((w) => MELEE.includes(w));
      ranged = mastery.filter((w) => RANGED.includes(w));
    }

    // 性别
    const b = boarhat[c.nickname] || {};
    const raw = (b.gender || '').trim();
    let gender = GENDER_CN[raw] || '';
    let genderNote = '';
    if (!gender) {
      if (String(c.nickname).indexOf('主角') === 0) {
        // 3 名主角在 boarhat 上是「-」:游戏里性别由玩家自选,故记为「男/女」
        gender = '男/女';
        genderNote = '玩家自选性别';
      } else if (c.nickname === '莉莉蔻') {
        // boarhat 未收录,按甲方确认填「女」
        gender = '女';
        genderNote = '人工确认(boarhat 未收录)';
      } else {
        gender = '未知';
        genderNote = '上游资料库未收录';
      }
    }

    // 与 boarhat 的英文精通交叉核对
    if (b.proficiency) {
      const en = b.proficiency.split('/').map((s) => EN2CN[s.trim()] || s.trim()).filter(Boolean);
      if (en.includes('全部类型')) {
        if (!isAll(mastery)) mismatches.push(c.nickname + ': boarhat=AllTypes, dna=' + mastery.join('/'));
      } else {
        const dnaSet = new Set(mastery);
        const onlyBoarhat = en.filter((w) => !dnaSet.has(w));
        const onlyDna = mastery.filter((w) => !en.includes(w));
        if (onlyBoarhat.length || onlyDna.length) {
          mismatches.push(
            c.nickname + ': boarhat=[' + en.join('/') + '] dna=[' + mastery.join('/') + ']' +
            (onlyBoarhat.length ? ' 仅boarhat:' + onlyBoarhat.join('/') : '') +
            (onlyDna.length ? ' 仅dna:' + onlyDna.join('/') : '')
          );
        }
      }
    }

    db[c.id] = {
      性别: gender,
      近战精通: melee,
      远程精通: ranged,
      // 保留原始字段与出处,便于回溯
      _genderRaw: raw,
      _genderNote: genderNote,
      _精通原始: mastery,
    };

    review.push(
      [
        String(c.id).padEnd(5),
        c.nickname.padEnd(12),
        (gender + (genderNote ? '(' + genderNote + ')' : '')).padEnd(18),
        ('近战: ' + (melee.join('、') || '-')).padEnd(22),
        '远程: ' + (ranged.join('、') || '-'),
      ].join(' ')
    );
  }

  fs.writeFileSync(path.join(TOOLS, '_db_gender_weapon.json'), JSON.stringify(db, null, 1), 'utf8');
  fs.writeFileSync(
    path.join(TOOLS, '_weapon_review.txt'),
    review.join('\n') + '\n\n与 boarhat 不一致:\n' + (mismatches.length ? mismatches.join('\n') : '(无)') + '\n',
    'utf8'
  );

  console.log(review.join('\n'));
  console.log('');
  console.log('=== 与 boarhat 精通交叉核对 ===');
  console.log(mismatches.length ? mismatches.join('\n') : '(完全一致)');
  console.log('');
  const noGender = Object.entries(db).filter(([, v]) => v['性别'] === '未知');
  console.log('性别未知: ' + (noGender.length ? noGender.map(([id]) => id).join(',') : '无'));
  console.log('已写出: tools/_db_gender_weapon.json, tools/_weapon_review.txt');
})();
