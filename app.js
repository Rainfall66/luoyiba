/* 螺一把 · 纯静态单机版(无后端,双击 index.html 即玩)
 * ---------------------------------------------------------------
 * 判定规则(《二重螺旋》角色数据库版):
 * - 属性 / 出生地 / 性别 / 版本:与答案相同 = 绿
 * - 势力 / 近战精通 / 远程精通:完全相同 = 绿;有共同项(子集或相交)= 黄
 * - 版本:与答案相同 = 绿,不同 = 灰(只判对与不对,不给高低方向)
 * - 生日:一年内相差 ≤15 天(环形) = 黄 + 更早/更晚箭头
 * - 未知属性(空值)一律灰 "-"
 * - 6 次机会内猜中角色名即胜
 *
 * 输入联想:
 * - 支持 中文名 / 称号别名 / 全拼 / 首字母缩写 模糊搜索(kz -> 刻舟、beilei -> 贝蕾妮卡);
 * - 联想只提供候选项,**不参与提交判定**:按回车不会把拼音当成有效猜测,
 *   必须点选候选项(或输入完整角色名/称号)后手动提交。
 *
 * 数据库: window.LUOYIBA_CHARACTERS (见 characters.js,由 tools/build_chars_db.js 生成)
 */
(function () {
  'use strict';

  var LUOYIBA = {};

  // ---------- 纯逻辑(可被 node 测试) ----------
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MAX_GUESSES = 6;
  var BIRTHDAY_CLOSE_DAYS = 15;

  // 参与「精确匹配」的属性列(值相同即绿)
  var EXACT_FIELDS = ['属性', '出生地', '性别', '版本'];
  // 参与「重叠判定」的属性列(完全相同=绿,有交集=黄)
  var OVERLAP_FIELDS = ['势力', '近战精通', '远程精通'];

  // 棋盘列顺序:必须与 index.html 的 <th> 以及 characters.js 字段一致
  // (compare() 会用到,故必须在使用前声明,不能放到下面的 UI 段)
  var COLUMN_ORDER = ['属性', '出生地', '势力', '近战精通', '远程精通', '性别', '版本', 'birthday'];

  /** 解析生日。数据格式:四位字符串 "MMDD"(如 "0105"=1月5日;"0"或""=未录入);
   *  兼容旧数字格式(月*100+日,如 105=1月5日)。非法日期(2月30日、4月31日等)返回 null,按未知处理。
   *  特例:2月29日(如妮弗尔夫人 02-29)是合法生日,但 2 月平年只有 28 天,故单独放行。 */
  function parseMonthDay(value) {
    if (typeof value === 'string') {
      if (value === '0' || value === '') return null;
      if (!/^\d{4}$/.test(value)) return null;
      value = Number(value);
    }
    if (!Number.isInteger(value) || value <= 0) return null;
    var month = Math.floor(value / 100);
    var day = value % 100;
    if (month < 1 || month > 12 || day < 1) return null;
    if (month === 2 && day === 29) return { month: month, day: day };
    if (day > MONTH_DAYS[month - 1]) return null;
    return { month: month, day: day };
  }

  function dayOfYear(value) {
    var md = parseMonthDay(value);
    if (!md) return null;
    var result = md.day;
    for (var i = 0; i < md.month - 1; i++) result += MONTH_DAYS[i];
    return result;
  }

  function birthdayLabel(value) {
    var md = parseMonthDay(value);
    return md ? md.month + '月' + md.day + '日' : '';
  }

  /** 版本号比较:"1.10" > "1.9" > "1.0"(按数值段比较,避免字典序把 1.10 判成小于 1.9)。
   *  无法解析(空/非版本格式)返回 null。 */
  function parseVersion(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    var parts = raw.split('.');
    var nums = [];
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d+$/.test(parts[i])) return null;
      nums.push(Number(parts[i]));
    }
    return nums;
  }

  function compareVersion(a, b) {
    var va = parseVersion(a);
    var vb = parseVersion(b);
    if (!va || !vb) return null;
    var len = Math.max(va.length, vb.length);
    for (var i = 0; i < len; i++) {
      var x = va[i] || 0;
      var y = vb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  /** 把属性值统一成「字符串数组」:字符串按空白/、/、/· 拆分,数组原样。 */
  function toList(value) {
    if (value == null) return [];
    if (Array.isArray(value)) {
      return value.map(function (v) { return String(v).trim(); }).filter(Boolean);
    }
    return String(value)
      .split(/[\s、,，/|·]+/)
      .map(function (v) { return v.trim(); })
      .filter(Boolean);
  }

  function toText(value) {
    return toList(value).join(' / ');
  }

  /** 精确匹配:两边都有值且一致 = 绿,否则灰(空值视为未知) */
  function exactAttr(guessValue, targetValue) {
    var g = String(guessValue == null ? '' : guessValue).trim();
    var t = String(targetValue == null ? '' : targetValue).trim();
    if (!g || !t) return { value: g, level: 'wrong' };
    return { value: g, level: g === t ? 'correct' : 'wrong' };
  }

  /** 集合匹配:完全相同 = 绿;有共同项 = 黄;否则灰。
   *  例:猜「输出/武器伤害」而答案是「输出/技能伤害/武器伤害」→ 黄(有交集)。
   *  特例:「全部近战」/「全部远程」是所有该类武器的并集,因此对任意具体同类武器算「有交集」(黄),
   *  但不等于「完全相同」。 */
  var MELEE_ALL = '全部近战';
  var RANGED_ALL = '全部远程';
  var MELEE_WEAPONS = ['单手剑', '长柄', '重剑', '双刀', '鞭刃', '太刀'];
  var RANGED_WEAPONS = ['手枪', '双枪', '榴炮', '霰弹枪', '突击枪', '弓'];

  /** 把「全部近战/全部远程」展开成具体武器列表,便于做集合比较 */
  function expandMastery(list) {
    var out = [];
    list.forEach(function (w) {
      if (w === MELEE_ALL) out = out.concat(MELEE_WEAPONS);
      else if (w === RANGED_ALL) out = out.concat(RANGED_WEAPONS);
      else out.push(w);
    });
    return out;
  }

  function overlapAttr(guessValue, targetValue) {
    var g = toList(guessValue);
    var t = toList(targetValue);
    var display = g.join(' / ');
    if (!g.length || !t.length) return { value: display, level: 'wrong' };
    // 先判断「完全相同」(按原始取值,「全部近战」与具体武器不算相同)
    var same =
      g.length === t.length &&
      g.every(function (v) { return t.indexOf(v) !== -1; });
    if (same) return { value: display, level: 'correct' };
    // 再判断「有交集」:把「全部」展开后比较
    var tSet = {};
    expandMastery(t).forEach(function (v) { tSet[v] = true; });
    var hit = expandMastery(g).filter(function (v) { return tSet[v]; });
    if (hit.length) return { value: display, level: 'close' };
    return { value: display, level: 'wrong' };
  }

  /** 版本:与答案相同 = 绿;不同 = 灰(只判对与不对,不给任何方向提示) */
  function versionAttr(guessValue, targetValue) {
    var g = String(guessValue == null ? '' : guessValue).trim();
    var t = String(targetValue == null ? '' : targetValue).trim();
    if (!g || !t) return { value: g, level: 'wrong' };
    var cmp = compareVersion(g, t);
    if (cmp === null) return { value: g, level: 'wrong' };
    return { value: g, level: cmp === 0 ? 'correct' : 'wrong' };
  }

  function birthdayAttr(guessValue, targetValue) {
    var g = parseMonthDay(guessValue);
    var t = parseMonthDay(targetValue);
    if (!g || !t) return { value: typeof guessValue === 'string' ? guessValue : '', level: 'wrong' };
    if (g.month === t.month && g.day === t.day) {
      return { value: guessValue, level: 'correct' };
    }
    var gDay = dayOfYear(guessValue);
    var tDay = dayOfYear(targetValue);
    // 黄色(接近):一年内相差 ≤15 天(环形,跨年也算)
    var raw = Math.abs(gDay - tDay);
    var diff = Math.min(raw, 366 - raw);
    var level = diff <= BIRTHDAY_CLOSE_DAYS ? 'close' : 'wrong';
    // 箭头:按自然年内排名(非环形)——目标在自然年里更晚(排名更靠后)= ▲,更早 = ▼
    var hint = tDay > gDay ? 'higher' : 'lower';
    return { value: guessValue, level: level, hint: hint };
  }

  /** 逐属性对比:返回 { nickname, correct, attrs } */
  function compare(guess, target) {
    var attrs = {
      属性: exactAttr(guess['属性'], target['属性']),
      出生地: exactAttr(guess['出生地'], target['出生地']),
      势力: overlapAttr(guess['势力'], target['势力']),
      近战精通: overlapAttr(guess['近战精通'], target['近战精通']),
      远程精通: overlapAttr(guess['远程精通'], target['远程精通']),
      性别: exactAttr(guess['性别'], target['性别']),
      版本: versionAttr(guess['版本'], target['版本']),
      birthday: birthdayAttr(guess.birthday, target.birthday),
    };
    return {
      nickname: guess.nickname,
      correct: guess.nickname === target.nickname,
      attrs: attrs,
      // 与 COLUMNS 顺序一致的取值序列,渲染时直接消费
      cells: COLUMN_ORDER.map(function (key) { return attrs[key]; }),
    };
  }

  /** 随机挑一张立绘(对局开始时确定并固定,避免重渲染时换图);无图返回 '' */
  function pickPortrait(character) {
    var list = (character && character.images) || [];
    if (!list.length) return '';
    return list[Math.floor(Math.random() * list.length)];
  }

  /** 归一化联想串:小写、去掉空格/中点/连字符等分隔符,ü 统一写成 u(v) */
  function normalizeSearch(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/[\s\u00b7\-_'’.,，。、]/g, '')
      .replace(/v/g, 'u');
  }

  /** 单个角色的联想优先级(越小越靠前);null = 不匹配。
   *  顺序:角色名精确 > 别名精确 > 角色名前缀 > 全拼精确 > 首字母精确 > 角色名包含 > 别名包含 > 全拼包含 > 首字母包含 */
  function matchRank(character, query) {
    if (!query) return null;
    var nickname = normalizeSearch(character.nickname);
    var alias = normalizeSearch(character.alias);
    var pinyin = normalizeSearch(character.pinyin);
    var abbr = normalizeSearch(character.pinyinAbbr);
    if (nickname === query) return 0;
    if (alias && alias === query) return 1;
    if (nickname.indexOf(query) === 0) return 2;
    if (pinyin && pinyin === query) return 3;
    if (abbr && abbr === query) return 4;
    if (nickname.indexOf(query) !== -1) return 5;
    if (alias && alias.indexOf(query) !== -1) return 6;
    if (pinyin && pinyin.indexOf(query) !== -1) return 7;
    if (abbr && abbr.indexOf(query) !== -1) return 8;
    return null;
  }

  /** 联想搜索:支持中文名 / 称号别名 / 全拼 / 首字母缩写;同分保持原数据顺序。
   *  仅用于候选联想,不参与提交判定(见 findCharacter)。 */
  function searchCharacters(list, input, limit) {
    var query = normalizeSearch(input);
    if (!query) return [];
    var hits = [];
    list.forEach(function (c, index) {
      var rank = matchRank(c, query);
      if (rank !== null) hits.push({ c: c, rank: rank, index: index });
    });
    hits.sort(function (a, b) { return a.rank - b.rank || a.index - b.index; });
    return hits.slice(0, limit || 8).map(function (h) { return h.c; });
  }

  LUOYIBA.MAX_GUESSES = MAX_GUESSES;
  LUOYIBA.compare = compare;
  LUOYIBA.dayOfYear = dayOfYear;
  LUOYIBA.birthdayLabel = birthdayLabel;
  LUOYIBA.compareVersion = compareVersion;
  LUOYIBA.pickPortrait = pickPortrait;
  LUOYIBA.normalizeSearch = normalizeSearch;
  LUOYIBA.matchRank = matchRank;
  LUOYIBA.searchCharacters = searchCharacters;
  LUOYIBA.EXACT_FIELDS = EXACT_FIELDS;
  LUOYIBA.OVERLAP_FIELDS = OVERLAP_FIELDS;

  var CHARACTERS = (typeof window !== 'undefined' && (window.LUOYIBA_CHARACTERS || window.KAYIBA_CHARACTERS)) || [];

  /** 可猜池:数据库里 可用 === false 的角色只做存档,不参与对局。
   *  当前被排除:莉莉蔻(2.0)、SP黎瑟(1.7) —— 这两个角色尚未完整加入《二重螺旋》正式游戏。
   *  用「可用」字段驱动而非硬编码名字,以后上游补齐数据只要改 build_chars_db.js 的名单即可。 */
  var PLAYABLE = CHARACTERS.filter(function (c) { return c['可用'] !== false; });
  if (!PLAYABLE.length) PLAYABLE = CHARACTERS; // 兜底:字段缺失时不影响可玩性

  LUOYIBA.characters = CHARACTERS; // 完整数据库(33 条)
  LUOYIBA.playable = PLAYABLE; // 游戏内实际可猜的角色

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LUOYIBA;
  }

  // ---------- 浏览器 UI ----------
  if (typeof document === 'undefined') return;

  var RECENT_KEY = 'luoyiba:recent';
  var STATS_KEY = 'luoyiba:stats';
  var RECENT_WINDOW_MS = 60 * 60 * 1000;

  var state = { target: null, guesses: [], status: 'ready', portrait: '' };
  var $ = function (id) { return document.getElementById(id); };

  function storageGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* 忽略 */ }
  }

  function loadRecent() {
    var list = storageGet(RECENT_KEY) || [];
    var cutoff = Date.now() - RECENT_WINDOW_MS;
    return list.filter(function (item) { return item && item.t >= cutoff; });
  }
  function rememberRecent(nickname) {
    var list = loadRecent().filter(function (item) { return item.n !== nickname; });
    list.push({ n: nickname, t: Date.now() });
    storageSet(RECENT_KEY, list.slice(-20));
  }
  function loadStats() {
    return storageGet(STATS_KEY) || { wins: 0, losses: 0, streak: 0, bestStreak: 0 };
  }
  function saveStats(stats) { storageSet(STATS_KEY, stats); }

  function pickTarget() {
    var pool = PLAYABLE;
    var recent = new Set(loadRecent().map(function (item) { return item.n; }));
    var candidates = pool.filter(function (c) { return !recent.has(c.nickname); });
    if (!candidates.length) candidates = pool;
    var target = candidates[Math.floor(Math.random() * candidates.length)];
    rememberRecent(target.nickname);
    return target;
  }

  /** 提交判定:只认角色名 / 称号别名的完全一致。
   *  拼音(全拼、首字母)仅用于候选联想,不能直接提交 —— 避免「打拼音就自动算提交」。
   *  未加入游戏的角色(可用=false)不可提交。 */
  function findCharacter(input) {
    var q = String(input || '').trim().toLowerCase();
    return PLAYABLE.find(function (c) {
      return c.nickname.toLowerCase() === q
        || (c.alias && c.alias.toLowerCase() === q);
    }) || null;
  }

  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  // ---------- 棋盘渲染 ----------
  function cellHtml(attr) {
    if (!attr) return '<td class="wrong">-</td>';
    var arrow = attr.hint && attr.level !== 'correct'
      ? '<span class="dir">' + (attr.hint === 'higher' ? '&#9650;' : '&#9660;') + '</span>'
      : '';
    var raw = String(attr.value === undefined || attr.value === null ? '' : attr.value);
    var display = (raw === '' || raw === '0') ? '-' : raw;
    return '<td class="' + attr.level + '">' + escapeHtml(display) + arrow + '</td>';
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function renderBoard() {
    var tbody = $('board-body');
    tbody.innerHTML = '';
    state.guesses.forEach(function (row, index) {
      var tr = document.createElement('tr');
      if (index === state.guesses.length - 1) tr.className = 'row-latest';
      if (row.correct) tr.className = (tr.className ? tr.className + ' ' : '') + 'row-correct';
      var avatarHtml = row.avatar
        ? '<img class="row-avatar" src="' + escapeHtml(row.avatar) + '" alt="" loading="lazy" onerror="this.remove()" />'
        : '';
      tr.innerHTML = '<td class="name' + (row.correct ? ' correct' : '') + '">' + avatarHtml + escapeHtml(row.nickname) + '</td>'
        + row.cells.map(cellHtml).join('');
      tbody.appendChild(tr);
    });
    renderProgress();
  }

  function renderProgress() {
    var dots = '';
    for (var i = 0; i < MAX_GUESSES; i++) {
      dots += '<i' + (i < state.guesses.length ? ' class="used"' : '') + '></i>';
    }
    $('progress').innerHTML = dots;
  }

  // ---------- 对局流程 ----------
  function startGame() {
    state.target = pickTarget();
    state.guesses = [];
    state.status = 'playing';
    state.portrait = pickPortrait(state.target);
    $('guess-input').value = '';
    closeSuggestions();
    renderBoard();
    $('status-text').textContent = '输入角色名开始猜测,共 ' + MAX_GUESSES + ' 次机会';
    $('guess-input').disabled = false;
    $('guess-submit').disabled = false;
    $('guess-input').focus();
  }

  function submitGuess(character) {
    if (!character || state.status !== 'playing') return;
    if (state.guesses.some(function (g) { return g.nickname === character.nickname; })) {
      toast('已经猜过这个角色了');
      return;
    }
    var row = compare(character, state.target);
    row.avatar = character.avatar || '';
    row.guessedAt = Date.now();
    state.guesses.push(row);
    renderBoard();

    if (row.correct) {
      finish('won');
    } else if (state.guesses.length >= MAX_GUESSES) {
      finish('lost');
    } else {
      $('guess-input').value = '';
      closeSuggestions();
      $('guess-input').focus();
    }
  }

  function finish(result) {
    state.status = 'finished';
    $('guess-input').disabled = true;
    $('guess-submit').disabled = true;
    var stats = loadStats();
    if (result === 'won') {
      stats.wins += 1;
      stats.streak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    } else {
      stats.losses += 1;
      stats.streak = 0;
    }
    saveStats(stats);
    showResult(result, stats);
  }

  function showResult(result, stats) {
    var t = state.target;
    $('result-title').textContent = result === 'won' ? '恭喜,猜对了!' : '很遗憾,未能猜中';
    $('result-tone').className = result === 'won' ? 'overlay-card win' : 'overlay-card lose';
    $('result-name').textContent = t.nickname;
    $('result-stats').textContent = '共 ' + state.guesses.length + ' 次 · 总场次 ' + (stats.wins + stats.losses)
      + ' · 胜 ' + stats.wins + ' · 负 ' + stats.losses
      + ' · 当前连胜 ' + stats.streak;
    $('result-info').innerHTML =
      row2('属性', t['属性'])
      + row2('出生地', t['出生地'])
      + row2('势力', t['势力'])
      + row2('性别', t['性别'])
      + row2('近战精通', toText(t['近战精通']))
      + row2('远程精通', toText(t['远程精通']))
      + row2('版本', t['版本'])
      + row2('生日', birthdayLabel(t.birthday))
      + row2('称号', t.alias);
    var portrait = $('result-portrait');
    var portraitWrap = $('result-portrait-wrap');
    if (state.portrait) {
      portrait.src = state.portrait;
      portraitWrap.classList.remove('hidden');
    } else {
      portrait.removeAttribute('src');
      portraitWrap.classList.add('hidden');
    }
    $('result-overlay').classList.add('show');
  }

  function row2(label, value) {
    return '<tr><td class="label">' + escapeHtml(label) + '</td><td>' + escapeHtml(value || '-') + '</td></tr>';
  }

  function hideResult() { $('result-overlay').classList.remove('show'); }

  // ---------- 输入补全 ----------
  var suggestions = [];

  function closeSuggestions() { suggestions = []; $('suggestions').innerHTML = ''; $('suggestions').classList.remove('open'); }

  function updateSuggestions() {
    var q = $('guess-input').value.trim();
    if (!q) { closeSuggestions(); return; }
    // 中文名 / 称号别名 / 全拼 / 首字母都能联想;只给候选,不自动提交
    suggestions = searchCharacters(PLAYABLE, q, 8);
    var list = $('suggestions');
    list.innerHTML = '';
    if (!suggestions.length) { list.classList.remove('open'); return; }
    suggestions.forEach(function (c, index) {
      var li = document.createElement('li');
      if (c.avatar) {
        var thumb = document.createElement('img');
        thumb.className = 'sug-avatar';
        thumb.src = c.avatar;
        thumb.alt = '';
        thumb.loading = 'lazy';
        thumb.onerror = function () { this.remove(); };
        li.appendChild(thumb);
      }
      li.appendChild(document.createTextNode(c.nickname));
      li.className = index === 0 ? 'active' : '';
      li.onmousedown = function (event) {
        // 只把候选填入输入框,提交由玩家手动点击"提交猜测"
        event.preventDefault();
        $('guess-input').value = c.nickname;
        closeSuggestions();
      };
      list.appendChild(li);
    });
    list.classList.add('open');
  }

  // ---------- 规则弹窗 ----------
  function toggleRules(show) {
    $('rules-overlay').classList.toggle('show', show);
  }

  // ---------- 事件绑定 ----------
  function bind() {
    $('start-btn').addEventListener('click', function () {
      $('start-screen').classList.add('hidden');
      $('game-screen').classList.remove('hidden');
      startGame();
    });
    $('back-btn').addEventListener('click', function () {
      if (state.status === 'playing') {
        if (!confirm('返回首页将结束本局,确定吗?')) return;
      }
      $('game-screen').classList.add('hidden');
      $('start-screen').classList.remove('hidden');
    });
    $('restart-btn').addEventListener('click', function () {
      if (state.status === 'playing' && !confirm('重新开始将清除本局进度,确定吗?')) return;
      startGame();
    });
    $('again-btn').addEventListener('click', function () { hideResult(); startGame(); });
    $('view-btn').addEventListener('click', hideResult);
    $('giveup-btn').addEventListener('click', function () {
      if (state.status !== 'playing') return;
      if (!confirm('查看答案将按失败结束本局,确定吗?')) return;
      finish('lost');
    });
    $('rules-trigger').addEventListener('click', function () { toggleRules(true); });
    $('rules-close').addEventListener('click', function () { toggleRules(false); });
    $('rules-overlay').addEventListener('mousedown', function (event) {
      if (event.target === $('rules-overlay')) toggleRules(false);
    });
    $('result-overlay').addEventListener('mousedown', function (event) {
      if (event.target === $('result-overlay')) hideResult();
    });
    // 立绘加载失败时收起图片区,避免出现破图
    $('result-portrait').addEventListener('error', function () {
      $('result-portrait-wrap').classList.add('hidden');
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if ($('rules-overlay').classList.contains('show')) toggleRules(false);
        else if ($('result-overlay').classList.contains('show')) hideResult();
      }
    });

    var input = $('guess-input');
    // 手动提交:输入必须与某个角色名/别名完全一致
    function submitFromInput() {
      if (state.status !== 'playing') return;
      var q = input.value.trim();
      if (!q) { toast('请输入角色名'); return; }
      var character = findCharacter(q);
      if (!character) {
        toast('没有完全匹配的角色(拼音仅用于联想),请点选候选项后提交');
        return;
      }
      input.value = character.nickname;
      closeSuggestions();
      submitGuess(character);
    }
    $('guess-submit').addEventListener('click', submitFromInput);
    input.addEventListener('input', updateSuggestions);
    input.addEventListener('focus', updateSuggestions);
    input.addEventListener('blur', function () { setTimeout(closeSuggestions, 150); });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitFromInput();
      } else if (event.key === 'ArrowDown' && suggestions.length) {
        event.preventDefault();
        moveActive(1);
      } else if (event.key === 'ArrowUp' && suggestions.length) {
        event.preventDefault();
        moveActive(-1);
      } else if (event.key === 'Tab' && suggestions.length) {
        event.preventDefault();
        $('guess-input').value = suggestions[0].nickname;
        updateSuggestions();
      }
    });
  }

  function moveActive(direction) {
    var items = $('suggestions').children;
    var current = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].classList.contains('active')) { current = i; break; }
    }
    var next = (current + direction + items.length) % items.length;
    for (var j = 0; j < items.length; j++) items[j].classList.toggle('active', j === next);
    $('guess-input').value = suggestions[next].nickname;
  }

  bind();

  // ---------- 手机端优化:输入框聚焦 = 键盘弹起 ----------
  var gameScreenEl = $('game-screen');
  var guessInputEl = $('guess-input');
  function syncKeyboardActive() {
    if (gameScreenEl) {
      gameScreenEl.classList.toggle('keyboard-active', document.activeElement === guessInputEl);
    }
  }
  if (guessInputEl) {
    guessInputEl.addEventListener('focus', syncKeyboardActive);
    guessInputEl.addEventListener('blur', syncKeyboardActive);
  }
  // 视觉视口高度(移动端键盘弹起时输入坞贴底)
  function syncViewportHeight() {
    var vh = window.visualViewport && window.visualViewport.height;
    if (vh) document.documentElement.style.setProperty('--visual-viewport-height', Math.round(vh) + 'px');
  }
  syncViewportHeight();
  if (window.visualViewport) window.visualViewport.addEventListener('resize', syncViewportHeight);
})();
