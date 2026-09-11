# 给「螺一把」加背景音乐(BGM)的可行路径

本文是给本项目加 BGM 的实操指南。结论先讲:**最省事、最稳的是方案 A(单个 mp3 + `<audio>` 循环),
把播放动作挂在「开始游戏」按钮上**——因为这既是浏览器的硬性要求,又刚好是玩家进入游戏的天然节点。

---

## 0. 先决条件:浏览器的自动播放限制(所有方案都绕不开)

现代浏览器**禁止页面在没有用户交互前播放有声音的音频**。`file://` 直接双击打开时规则同样生效。所以:

- ❌ 打开 `index.html` 就自动响起 —— 会被浏览器拦截,`play()` 返回的 Promise 直接 reject;
- ✅ 挂在用户第一次点击(开始游戏 / 点击任意处 / 音量按钮)之后再播放 —— 一定成功。

本项目的 `index.html` 里已经有一个天然节点:`#start-btn`。**BGM 就从这里开始。**

> 注意:`file://` 下部分浏览器对本地音频的加载策略更严(尤其 Chrome 对 `file://` 的媒体请求)。
> 如果你打算长期使用 BGM,建议用本地静态服务器打开(`python3 -m http.server 8080`),
> 或把整套东西部署到 GitHub Pages —— 这一点在「部署建议」里有说明。

---

## 方案对比

| 方案 | 实现难度 | 体积 | 版权风险 | 听感 | 适合场景 |
| --- | --- | --- | --- | --- | --- |
| **A. 单个音频文件 + `<audio loop>`** | ★☆☆☆☆ | 1 首 1~4 MB(压到 96~128 kbps 可 <1 MB) | 取决于素材 | 最好(真实配乐) | **推荐起步** |
| **B. Web Audio API 播放 + 淡入淡出/交叉淡出** | ★★★☆☆ | 同上 | 同上 | 好,切换自然 | 想多首轮播、随开局/结算切曲 |
| **C. Web Audio 程序化生成(无音频文件)** | ★★★★☆ | ~0(纯代码几 KB) | 无 | 电子音效/氛围,较单调 | 不想处理版权与体积,接受合成音 |
| D. 外链在线音频(如某个 CDN 上的 mp3) | ★☆☆☆☆ | 0 | 高 | 取决于源 | 不建议:断网即失效、易被防盗链 |

---

## 方案 A:单文件循环(推荐先做这个)

### 1. 放文件

```
game/
├── index.html
├── app.js
├── style.css
└── audio/
    └── bgm.mp3        ← 放这里
```

### 2. 在 `index.html` 加一个 `<audio>` 和一个静音按钮

在 `<div id="toast" class="toast"></div>` 附近加:

```html
<audio id="bgm" src="audio/bgm.mp3" loop preload="auto"></audio>
```

顶栏(`.topbar .actions`)里加一个按钮:

```html
<button id="bgm-toggle" class="btn" aria-label="背景音乐开关">♪ 音乐</button>
```

### 3. 在 `app.js` 里接上

在 `bind()` 里加(和现有监听器放在一起即可):

```js
// ---------- 背景音乐 ----------
var BGM_KEY = 'luoyiba:bgm';          // 与其它存档键保持同一命名空间
var bgm = $('bgm');
var BGM_VOLUME = 0.35;                  // 先给个偏低的值,别盖过操作音

function bgmEnabled() {
  return localStorage.getItem(BGM_KEY) !== 'off';
}
function syncBgmButton() {
  var btn = $('bgm-toggle');
  if (btn) btn.textContent = bgmEnabled() ? '♪ 音乐' : '✕ 静音';
}
function playBgm() {
  if (!bgm || !bgmEnabled()) return;
  bgm.volume = BGM_VOLUME;
  // play() 可能返回 undefined(很老的浏览器)或 Promise,都不能让异常冒出去
  var p = bgm.play();
  if (p && typeof p.catch === 'function') p.catch(function () { /* 被自动播放策略拦下,忽略 */ });
}
function pauseBgm() {
  if (bgm) bgm.pause();
}

// 关键:在「开始游戏」这次用户点击里启动 —— 这是浏览器允许播放的时机
$('start-btn').addEventListener('click', playBgm);

if ($('bgm-toggle')) {
  $('bgm-toggle').addEventListener('click', function () {
    var on = !bgmEnabled();
    localStorage.setItem(BGM_KEY, on ? 'on' : 'off');
    if (on) playBgm(); else pauseBgm();
    syncBgmButton();
  });
  syncBgmButton();
}

// 标签页切到后台就暂停,回来再续上(省电,也避免多标签页一起响)
document.addEventListener('visibilitychange', function () {
  if (document.hidden) pauseBgm(); else playBgm();
});
```

### 4. 无缝循环的小技巧

`loop` 属性在 mp3 上会有几十毫秒的接缝。两个可选改善:

- 导出时给 mp3 写入 **gapless / LAME 标签**(Audacity、ffmpeg 都支持),接缝基本听不出来;
- 或改用 **OGG/Opus**(`bgm.ogg`),循环比 mp3 干净:

```html
<audio id="bgm" loop preload="auto">
  <source src="audio/bgm.ogg" type="audio/ogg" />
  <source src="audio/bgm.mp3" type="audio/mpeg" />
</audio>
```

---

## 方案 B:多首轮播 + 淡入淡出(在 A 的基础上加)

想「开局一首、结算换一首」或做交叉淡出,用 Web Audio API 接管播放:

```js
var audioCtx = null;
var srcNode = null;
var gainNode = null;

function ensureCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;          // 从 0 淡入
    gainNode.connect(audioCtx.destination);
  }
  // 从后台切回来时 AudioContext 可能是 suspended 状态
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTrack(url, fadeSeconds) {
  ensureCtx();
  fetch(url)                        // 若用 file:// 打开,fetch 本地文件会被拦;此时改用方案 A
    .then(function (r) { return r.arrayBuffer(); })
    .then(function (buf) { return audioCtx.decodeAudioData(buf); })
    .then(function (decoded) {
      if (srcNode) srcNode.stop();
      srcNode = audioCtx.createBufferSource();
      srcNode.buffer = decoded;
      srcNode.loop = true;
      srcNode.connect(gainNode);
      srcNode.start();
      var now = audioCtx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0.35, now + (fadeSeconds || 1.5));
    })
    .catch(function () { /* 解码/加载失败就当没有 BGM,不影响游戏 */ });
}
```

> ⚠️ 注意:`fetch` + `decodeAudioData` 这套在 **`file://` 下会被 CORS 拦掉**。
> 如果你想直接在 `file://` 双击运行,请用方案 A(`<audio src>` 不受此限制)。

---

## 方案 C:程序化生成(零素材、零版权)

不引入任何音频文件,用振荡器合成一段氛围铺底。体积极小、绝对没有版权问题,代价是「电子音」感明显:

```js
/** 生成一段极简氛围铺底:两个五度关系的正弦波 + 缓慢滤波扫动 */
function startProceduralBgm(volume) {
  var ctx = new (window.AudioContext || window.webkitAudioContext)();
  var master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  var filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 620;
  filter.Q.value = 6;
  filter.connect(master);

  [110, 164.81].forEach(function (freq, i) {  // A2 + E3
    var osc = ctx.createOscillator();
    osc.type = i ? 'triangle' : 'sine';
    osc.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.value = i ? 0.18 : 0.28;
    osc.connect(g).connect(filter);
    osc.start();
  });

  // 滤波器缓慢开合,制造“呼吸感”
  var t = ctx.currentTime;
  var lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  var lfoGain = ctx.createGain();
  lfoGain.gain.value = 280;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start(t);

  master.gain.linearRampToValueAtTime(volume || 0.12, t + 2);
  return ctx;
}
```

---

## 素材从哪来(版权是重点)

本项目是**非商业粉丝作品**,但音乐版权比图片更容易踩雷,务必注意:

| 来源 | 说明 |
| --- | --- |
| **自己制作 / 委托** | 最安全。用 FL Studio、LMMS(免费)、GarageBand 做一段 30~60 秒可循环的氛围曲 |
| **CC0 / 公共领域** | 如 FreePD、Pixabay Music、Openverse 上筛 CC0;可商用、可修改、无需署名(仍建议在 README 致谢) |
| **CC-BY** | 可用但**必须署名**,记得在 README「数据来源与致谢」里写清作者与链接 |
| **游戏原声** | ❌ **不要直接扒官方 OST**。这属于明确的商业音乐版权,和当前「只用小尺寸立绘 + 文本数据」的性质不同,风险高得多 |
| 方案 C 程序化生成 | 无版权问题(前提是音序完全自己写) |

> 现有 README 的免责声明里目前只写了「角色名、设定、立绘图片等版权均归游戏官方所有」,
> 并未提及音效/音乐。**如果加了 BGM,请把这一句一并更新**
> (例如补上「BGM 来自 XXX,遵循 CC0」或「未使用官方音效与音乐」),否则文档与实际不符。

---

## 别忘了这些细节

1. **默认音量别太大**:0.3 左右起步,并在 README 里说明有静音开关;
2. **记住用户的选择**:本指南用 `luoyiba:bgm` 存 localStorage,和现有的 `luoyiba:recent` / `luoyiba:stats` 同一命名空间,
   不要用 `kayi-ba:` 前缀(那是「卡一把」的键);
3. **切后台暂停**:`visibilitychange` 里暂停,回来再续;
4. **开头别抢跑**:等用户点「开始游戏」再播,顺带避开自动播放限制;
5. **兜底**:`play()` 的 Promise 一定要 `catch`,音频加载失败绝不能影响开局;
6. **移动端**:iOS 静音拨杆打开时,`<audio>` 也不出声,这是系统行为,不要试图绕过;
7. **`file://` 兼容**:要保证双击就能玩,就用方案 A(`<audio src>`);方案 B 的 `fetch` 需要 http(s);
8. **自检**:加完可以顺手在 `tools/verify_db.js` 里加一条
   「`audio/bgm.*` 存在且 `index.html` 引用了 `#bgm`」的断言,避免以后换目录忘了改路径。

---

## 建议的落地顺序

1. 先用**方案 A** + 一段 CC0 音乐跑通「点开始 → 有音乐 → 能静音 → 记得住选择」;
2. 听感满意后,若想要多首/交叉淡出再升级到**方案 B**(注意需要 http 环境);
3. 如果实在不想处理素材版权,用**方案 C** 的合成铺底,或干脆不加 BGM;
4. 完成后更新 README 的「数据来源与致谢」「免责声明」两节。
