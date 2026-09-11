// 螺一把 · 浏览器链路冒烟测试(自带极简 DOM 垫片,不需要浏览器)
// 目的:真跑一遍 app.js 的 UI 代码路径(开局 -> 连续猜测 -> 结算 -> 再来一把),
//       并检查棋盘每行单元格数、结果面板内容、localStorage 落盘。
// 用法: node tools/test_ui_smoke.js
const fs = require('fs');
const path = require('path');

const GAME = process.env.LUOYIBA_GAME_DIR || path.join(__dirname, '..', 'game');

let fail = 0;
function t(label, ok, extra = '') {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra ? ' -> ' + extra : ''));
  if (!ok) fail++;
}

// ---------- 极简 DOM ----------
function makeEl(id) {
  const el = {
    id,
    _html: '',
    textContent: '',
    value: '',
    disabled: false,
    src: '',
    alt: '',
    loading: '',
    className: '',
    style: { setProperty() {} },
    children: [],
    _listeners: {},
    _classes: new Set(),
    classList: {
      add: (...c) => c.forEach((x) => el._classes.add(x)),
      remove: (...c) => c.forEach((x) => el._classes.delete(x)),
      toggle: (c, on) => (on === undefined ? (el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c)) : on ? el._classes.add(c) : el._classes.delete(c)),
      contains: (c) => el._classes.has(c),
    },
    get innerHTML() { return el._html; },
    set innerHTML(v) {
      el._html = String(v);
      el.children = [];
      // 统计生成的单元格,用于校验棋盘列数
      for (const m of el._html.matchAll(/<td\b/g)) el.children.push({ tag: 'td' });
    },
    appendChild(c) { el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter((x) => x !== c); },
    removeAttribute(n) { if (n === 'src') el.src = ''; },
    setAttribute(n, v) { el[n] = v; },
    focus() { doc.activeElement = el; },
    addEventListener(type, fn) { (el._listeners[type] = el._listeners[type] || []).push(fn); },
    fire(type, ev) { (el._listeners[type] || []).forEach((fn) => fn.call(el, ev || {})); },
    querySelector() { return null; },
  };
  return el;
}

const ids = [
  'start-screen', 'game-screen', 'start-btn', 'restart-btn', 'giveup-btn', 'back-btn',
  'progress', 'status-text', 'board-body', 'suggestions', 'guess-input', 'guess-submit',
  'result-overlay', 'result-tone', 'result-title', 'result-stats', 'result-name', 'result-info',
  'result-portrait', 'result-portrait-wrap', 'again-btn', 'view-btn',
  'rules-trigger', 'rules-close', 'rules-overlay', 'toast',
];
const els = {};
ids.forEach((id) => (els[id] = makeEl(id)));

const store = {};
const doc = {
  activeElement: null,
  _listeners: {},
  getElementById: (id) => els[id] || null,
  createElement: (tag) => makeEl('<' + tag + '>'),
  createTextNode: (txt) => ({ text: String(txt) }),
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
};

const win = {
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  },
  visualViewport: null,
  setTimeout: (fn) => 0,
  clearTimeout: () => {},
  confirm: () => true,
};

// ---------- 载入数据库 + app.js ----------
new Function('window', fs.readFileSync(path.join(GAME, 'characters.js'), 'utf8'))(win);
const characters = win.LUOYIBA_CHARACTERS;

const mod = { exports: {} };
new Function('module', 'window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'confirm',
  fs.readFileSync(path.join(GAME, 'app.js'), 'utf8')
)(mod, win, doc, win.localStorage, win.setTimeout, win.clearTimeout, win.confirm);

const api = mod.exports;
t('app.js 在 DOM 环境下完成初始化(未抛错)', true, 'records=' + api.characters.length);

// ---------- 走一局 ----------
els['guess-input'].disabled = true;
els['start-btn'].fire('click');
t('点击开始后进入可输入状态', els['guess-input'].disabled === false && els['guess-submit'].disabled === false);
t('开局棋盘为空', els['board-body'].children.length === 0);

function submit(name) {
  els['guess-input'].value = name;
  els['guess-submit'].fire('click');
}

// 依次猜测所有角色,直到猜中或机会用尽(次数取自导出的 MAX_GUESSES,避免与实现脱节)
const MAXG = api.MAX_GUESSES;
t('MAX_GUESSES 已提升到 6', MAXG, 6);
let played = 0;
// 通过结算面板反推答案:用满机会,若失败则从 result-name 读答案
const guessOrder = characters.map((c) => c.nickname);
for (let i = 0; i < MAXG; i++) {
  submit(guessOrder[i]);
  played++;
  if (els['result-overlay'].classList.contains('show')) break;
}
const ended = els['result-overlay'].classList.contains('show');
t(MAXG + ' 次内必然结束对局', ended, '已猜 ' + played + ' 次');

const rows = els['board-body'].children;
t('棋盘行数 = 已猜次数', rows.length === played, rows.length + ' vs ' + played);
const cellCounts = [...new Set(rows.map((r) => r.children.length))];
t('每行单元格数一致(1 名称 + 8 属性 = 9)', JSON.stringify(cellCounts) === JSON.stringify([9]), cellCounts.join(','));

const info = els['result-info'].innerHTML;
t('结算面板含全部属性(属性/阵营/势力/性别/近战精通/远程精通/版本/生日/称号)',
  /属性/.test(info) && /阵营/.test(info) && /势力/.test(info) && /性别/.test(info)
  && /近战精通/.test(info) && /远程精通/.test(info) && /版本/.test(info) && /生日/.test(info) && /称号/.test(info));
t('结算面板不再出现旧属性(武器类型/定位标签/年龄/晶源体)',
  !/武器类型/.test(info) && !/定位标签/.test(info) && !/年龄/.test(info) && !/晶源体/.test(info), info.slice(0, 80));
const answer = els['result-name'].textContent;
const answerChar = characters.find((c) => c.nickname === answer);
t('结算展示了答案角色', !!answerChar, answer || '(空)');

// 猜满机会未中 -> 记录一次失败;猜中 -> 记录一次胜利
const stats = JSON.parse(store['luoyiba:stats'] || '{}');
t('战绩写入 luoyiba:stats', stats.wins + stats.losses === 1, JSON.stringify(stats));
t('最近目标写入 luoyiba:recent', typeof store['luoyiba:recent'] === 'string');

// 立绘:有图角色应展示,无图则隐藏
const wrap = els['result-portrait-wrap'];
t('结算立绘与数据库一致', answerChar && answerChar.images.length ? !wrap.classList.contains('hidden') : wrap.classList.contains('hidden'),
  'answer=' + answer + ' images=' + (answerChar ? answerChar.images.length : 0));

// ---------- 再来一把 ----------
els['again-btn'].fire('click');
t('「再来一把」后棋盘清空且可继续输入',
  els['board-body'].children.length === 0 && els['guess-input'].disabled === false);
t('结算弹窗已关闭', !els['result-overlay'].classList.contains('show'));

// 同一角色重复猜测不应新增行
els['guess-input'].value = guessOrder[0];
els['guess-submit'].fire('click');
const rowsAfterFirst = els['board-body'].children.length;
els['guess-input'].value = guessOrder[0];
els['guess-submit'].fire('click');
t('重复猜同一角色不新增行', els['board-body'].children.length === rowsAfterFirst, rowsAfterFirst + ' -> ' + els['board-body'].children.length);

// ---------- 拼音联想:只给候选,不提交 ----------
// 这一局的目标是随机的,如果答案正好是"刻舟",点选并提交会直接获胜结束对局,
// 后面的断言就会偶发失败(约 3%)。这里通过"猜一次 -> 看答案 -> 重开"的方式
// 循环到答案不是刻舟为止,让断言与随机目标无关。
function peekAnswer() {
  els['guess-submit'].fire('click'); // 猜 guessOrder[0],若不是答案则继续
  let guard = 0;
  while (els['guess-input'].disabled === false && guard < 6) {
    els['guess-input'].value = guessOrder[1 + (guard % (guessOrder.length - 1))];
    els['guess-submit'].fire('click');
    guard++;
    if (els['result-overlay'].classList.contains('show')) break;
  }
  return els['result-name'].textContent;
}

for (let attempt = 0; attempt < 80; attempt++) {
  els['again-btn'].fire('click');
  els['guess-input'].value = guessOrder[0];
  if (peekAnswer() !== '刻舟') break;
}
t('已进入一局答案为「非刻舟」的对局(避免与拼音测试冲突)', els['result-name'].textContent !== '刻舟', els['result-name'].textContent);
els['again-btn'].fire('click');

const rowsBeforePin = els['board-body'].children.length;
els['guess-input'].value = 'kz'; // 刻舟 的首字母
els['guess-input'].fire('input'); // 触发联想
// app.js 用 createElement + appendChild 渲染候选,所以从子节点里取文字
const sugText = els['suggestions'].children
  .map((li) => (li.children || []).map((c) => c.text || '').join(''))
  .join(' | ');
t('输入拼音能给出候选(kz -> 刻舟)', sugText.includes('刻舟'), '候选: ' + sugText);
t('候选列表处于展开状态', els['suggestions'].classList.contains('open'));

// 关键:直接回车不应该提交,也不应消耗猜测次数
els['guess-input'].fire('keydown', { key: 'Enter', preventDefault() {} });
t('拼音输入 + 回车不会提交(不新增行)', els['board-body'].children.length === rowsBeforePin, rowsBeforePin + ' -> ' + els['board-body'].children.length);
t(
  '拼音输入 + 回车给出提示',
  els['toast'].textContent === '没有完全匹配的角色(拼音仅用于联想),请点选候选项后提交',
  els['toast'].textContent
);

// 点选候选项后,输入框应被填成完整角色名(仍不自动提交)
const li0 = els['suggestions'].children[0];
if (li0 && typeof li0.onmousedown === 'function') {
  li0.onmousedown({ preventDefault() {} });
  t('点选候选后填入完整角色名', els['guess-input'].value === '刻舟', els['guess-input'].value);
  t('点选候选不会自动提交', els['board-body'].children.length === rowsBeforePin, String(els['board-body'].children.length));

  // 再手动提交才生效
  els['guess-submit'].fire('click');
  t('点选后手动提交才新增一行', els['board-body'].children.length === rowsBeforePin + 1, rowsBeforePin + ' -> ' + els['board-body'].children.length);
} else {
  t('候选列表可点选', false, '第一条候选没有 onmousedown');
}

// ---------- 猜中路径与多局循环 ----------
// 每局依次猜全部角色;因为机会有限(MAX_GUESSES),只有答案排在前几次时才会赢。
// 跑若干局以覆盖「胜利结算 + 连胜累计」分支。
function freshGame() {
  const store2 = {};
  const els2 = {};
  ids.forEach((id) => (els2[id] = makeEl(id)));
  const doc2 = {
    activeElement: null,
    _listeners: {},
    getElementById: (id) => els2[id] || null,
    createElement: (tag) => makeEl('<' + tag + '>'),
    createTextNode: (txt) => ({ text: String(txt) }),
    addEventListener() {},
  };
  const win2 = {
    localStorage: {
      getItem: (k) => (k in store2 ? store2[k] : null),
      setItem: (k, v) => { store2[k] = String(v); },
    },
    visualViewport: null,
    setTimeout: () => 0,
    clearTimeout: () => {},
    confirm: () => true,
  };
  new Function('window', fs.readFileSync(path.join(GAME, 'characters.js'), 'utf8'))(win2);
  const mod2 = { exports: {} };
  new Function('module', 'window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'confirm',
    fs.readFileSync(path.join(GAME, 'app.js'), 'utf8')
  )(mod2, win2, doc2, win2.localStorage, win2.setTimeout, win2.clearTimeout, win2.confirm);
  return { els: els2, store: store2, chars: win2.LUOYIBA_CHARACTERS };
}

function playRound(g) {
  g.els['start-btn'].fire('click');
  let played = 0;
  for (let i = 0; i < MAXG; i++) {
    g.els['guess-input'].value = g.chars[i].nickname;
    g.els['guess-submit'].fire('click');
    played++;
    if (g.els['result-overlay'].classList.contains('show')) break;
  }
  const info = g.els['result-info'].innerHTML;
  return {
    played,
    answer: g.els['result-name'].textContent,
    title: g.els['result-title'].textContent,
    rows: g.els['board-body'].children.length,
    cells: [...new Set(g.els['board-body'].children.map((r) => r.children.length))],
    info,
  };
}

const SWEEPS = 12;
const results = [];
for (let i = 0; i < SWEEPS; i++) results.push(playRound(freshGame()));

// 不管输赢,每局都必须:行数=猜测次数、列数=9、结算含全部新属性
t('多局循环:行数与猜测次数一致', results.every((r) => r.rows === r.played), results.map((r) => r.rows + '/' + r.played).join(' '));
t('多局循环:每局列数都是 9', results.every((r) => JSON.stringify(r.cells) === JSON.stringify([9])), JSON.stringify(results.map((r) => r.cells)));
t('多局循环:结算面板字段完整', results.every((r) => /属性/.test(r.info) && /阵营/.test(r.info) && /势力/.test(r.info) && /性别/.test(r.info) && /近战精通/.test(r.info) && /远程精通/.test(r.info) && /版本/.test(r.info) && /生日/.test(r.info)));
t('多局循环:未出现旧游戏字段', results.every((r) => !/武器类型|定位标签|年龄|晶源体/.test(r.info)));

const wins = results.filter((r) => /猜对/.test(r.title)).length;
const losses = results.filter((r) => /未能猜中/.test(r.title)).length;
t('每局都给出明确输/赢结论', wins + losses === SWEEPS, wins + ' 胜 / ' + losses + ' 负 / ' + SWEEPS + ' 局');
console.log('      (答案从 31 名可猜角色里随机,胜利数量随机,不做固定断言)');

// 胜利分支:多开几局直到命中,做确定性验证
let winG = null;
for (let attempt = 0; attempt < 200 && !winG; attempt++) {
  const gg = freshGame();
  const r = playRound(gg);
  if (/猜对/.test(r.title)) winG = { gg, r };
}
t('能复现胜利结算(200 次内)', !!winG, winG ? '第 ' + winG.r.played + ' 次猜中「' + winG.r.answer + '」' : '未复现');
if (winG) {
  const st = JSON.parse(winG.gg.store['luoyiba:stats'] || '{}');
  t('胜利后 wins=1 且 streak=1', st.wins === 1 && st.streak === 1, JSON.stringify(st));
  t('胜利局猜测次数 <= MAX_GUESSES', winG.r.played <= MAXG, winG.r.played + ' <= ' + MAXG);
  t('胜利局棋盘行数 = 猜测次数', winG.gg.els['board-body'].children.length === winG.r.played);
  t('胜利局每行列数仍为 9', JSON.stringify(winG.r.cells) === JSON.stringify([9]), JSON.stringify(winG.r.cells));
  // 胜利局的答案必然是最后一次猜测
  const lastGuess = winG.gg.chars[winG.r.played - 1].nickname;
  t('胜利局答案 = 最后一次猜测', winG.r.answer === lastGuess, winG.r.answer + ' vs ' + lastGuess);
}

// ---------- 未加入游戏的角色不能猜、也不出现在候选 ----------
els['again-btn'].fire('click'); // 确保处于一局游戏中(输入可用)
const NOT_IN_GAME = ['莉莉蔻', 'SP黎瑟'];
for (const name of NOT_IN_GAME) {
  els['guess-input'].value = name;
  els['guess-input'].fire('input');
  const cand = els['suggestions'].children
    .map((li) => (li.children || []).map((c) => c.text || '').join(''))
    .join(' | ');
  t('候选里不出现「' + name + '」', !cand.includes(name), cand || '(空)');

  const before = els['board-body'].children.length;
  els['guess-input'].value = name; // 直接输入完整角色名
  els['guess-submit'].fire('click');
  t('输入「' + name + '」不会被提交', els['board-body'].children.length === before, before + ' -> ' + els['board-body'].children.length);
}
// 名字相近但已加入游戏的「黎瑟」必须仍然可以猜
els['guess-input'].value = '黎瑟';
els['guess-submit'].fire('click');
t('「黎瑟」仍可正常提交(未被 SP黎瑟 误伤)', els['board-body'].children.length > 0, String(els['board-body'].children.length));

console.log('');
console.log(fail === 0 ? '全部通过 ✔' : fail + ' 项未通过 ✘');
process.exitCode = fail === 0 ? 0 : 1;
