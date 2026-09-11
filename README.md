# 螺一把 · 二重螺旋角色猜测游戏(单机版)

> **非官方粉丝作品** —— 与《二重螺旋 Duet Night Abyss》及其开发/发行方无关。
> 猜角色类 Wordle 玩法:输入角色名,根据逐属性颜色反馈,6 次机会内猜出目标角色。

本作是「卡一把 · 卡拉彼丘角色猜测游戏(单机版)」的同构副本:前端结构、样式与交互沿用原项目,
**数据库与判定逻辑已整体替换为《二重螺旋》,并接入角色立绘**。

纯静态、零依赖、双击即玩:一个文件夹拷到任何电脑,浏览器打开 `index.html` 就能玩,无需 Node / 数据库 / 联网。

## 进度

| 步骤 | 状态 |
| --- | --- |
| 1. 角色数据库(33 名角色) | ✅ 完成 |
| 2. 判定逻辑改造(按二重螺旋属性反馈) | ✅ 完成 |
| 3. 角色头像 / 立绘接入 | ✅ 完成(33 名角色) |
| 3b. 头像换用**游戏内小头像** `T_Head`(256×256,圆角方形裁切) | ✅ 完成(共 2.23 MB) |
| 4. 拼音模糊搜索(只给候选,不自动提交) | ✅ 完成 |
| 5. 棋盘改版:去掉定位标签、加入性别、武器类型拆成近战/远程两行 | ✅ 完成 |
| 6. 机会提升到 6 次 + UI 风格/背景改为二重螺旋配色 | ✅ 完成 |

## UI 风格

整体配色不是随手挑的,而是取自《二重螺旋》官方资料库 **DNA Builder 的自定义主题 `abyss`**
(该主题就写在其线上 CSS 里,是官方资料站的既定视觉语言):

| 用途 | 色值 | 来源 token |
| --- | --- | --- |
| 页面底色 | `#00111d` | base-200 |
| 卡片 / 单元格 | `#001e29` | base-100 |
| 正文(暖白) | `#ffd6a7` | base-content |
| 主色(荧光青柠) | `#bdff00` | primary |
| 辅助(全息青) | `#00bafe` | info |
| 命中 / 接近 | `#01df72` / `#ffbf00` | success / warning |
| 错误 | `#f04e4f` | error |

- 原 token 是 oklch,用 `tools/oklch2hex.js` 换算成 hex 后写进 `style.css`;
- 背景做了三层:深青基底 + **青柠/青/紫三处星域辉光**(呼应「双螺旋」双色)+ **经纬网格与斜向拉丝**,
  再叠一层扫描线与暗角,接近游戏内全息界面的质感;
- 命中/接近格改用**深色字压高饱和底色**(原先是白字压琥珀色,对比度偏低);
- 9 列在桌面与移动端各有一组列宽规则,合计均为 100%,由 `verify_db.js` 自动校验,防止改列数时样式没跟上。

## 玩法

- 系统随机选一名角色作为答案(从 **31 名**已实装角色中选),输入角色名(带自动补全);
- **输入联想支持 4 种写法**(拼音只用于联想,不会直接算作一次猜测):

| 输入 | 命中 |
| --- | --- |
| `刻舟` / `刻` | 中文名(前缀优先) |
| `仗剑游` | 角色称号别名 |
| `kezhou` / `zhangjianyou` | 全拼(角色名 + 称号) |
| `kz` / `kzzjy` | 首字母缩写(角色名 + 称号) |

- 每次猜测新增一行,逐属性给出反馈:

| 列 | 反馈规则 |
| --- | --- |
| **属性**(光/暗/水/火/雷/风) | 与答案相同 = 🟩 绿 |
| **阵营** | 与答案相同 = 🟩 绿 |
| **势力** | 完全相同 = 🟩 绿;有共同项 = 🟨 黄 |
| **近战精通**(单手剑/长柄/重剑/双刀/鞭刃/太刀) | 完全相同 = 🟩 绿;有共同项 = 🟨 黄 |
| **远程精通**(手枪/双枪/榴炮/霰弹枪/突击枪/弓) | 完全相同 = 🟩 绿;有共同项 = 🟨 黄 |
| **性别**(男/女) | 与答案相同 = 🟩 绿 |
| **版本** | 相同 = 🟩 绿;不同 = 🟨 黄 + ▲▼ 箭头(目标版本更高 / 更低) |
| **生日** | 相同 = 🟩 绿;相差 ≤15 天(跨年环形)= 🟨 黄 + ▲▼(目标更晚 / 更早) |

> 「精通」按武器类别拆成**近战**与**远程**两行(如贝蕾妮卡 = 近战 单手剑 / 远程 双枪)。
> 刻舟精通全部武器,两行分别显示「全部近战」「全部远程」;它与任意具体同类武器算**有交集(黄)**,只有同为「全部」才判绿。
> 原上游数据里的「定位标签」已从棋盘移除(仍保留在 `characters.js` 里备查)。

- ➖ **"-"** —— 未知属性(部分角色无生日/势力数据,对比按灰色处理);
- 🖼 **图片** —— 输入框候选与猜测行显示角色头像,猜中/查看答案时在结算弹窗展示该角色头像大图;
- 6 次机会内猜中角色名即胜;战绩与最近目标保存在本机浏览器(localStorage,键名前缀 `luoyiba:`,不与「卡一把」共用)。

> 版本号按数值段比较:`1.10` 视为高于 `1.9`(不是字典序)。
> 生日 `02-29` 是合法生日(如妮弗尔夫人),不会因为平年 2 月只有 28 天被误判为未知。
> **拼音只是找人的手段,不是答案**:输入 `kz` 后按回车不会提交,必须点选候选项(或输入完整角色名/称号)再手动提交。
> 这样既保留了拼音输入的便利,又避免「随手打了个拼音就被算成一次猜测」。

### 关于角色名单

数据库收录上游资料库 `char.data.ts` 的全部 **33 条角色记录**,但**游戏内可猜的是 31 名**:

| | 角色 | 说明 |
| --- | --- | --- |
| 可猜(31) | 含 3 个主角形态(`主角-暗`/`主角-光`/`主角-水`) | 已在游戏内实装 |
| **仅存档(2)** | `莉莉蔻`(2.0)、`SP黎瑟`(1.7) | **尚未完整加入《二重螺旋》正式游戏** |

被排除的两名角色在数据里标记为 `可用: false`,它们:

- **保留在 `characters.js` 与 `characters.details.json` 中**(资料完整可查);
- **不会成为答案**(随机选目标只从 31 名里取);
- **不出现在输入联想候选里**,直接输入完整角色名也**不会被提交**;
- 注意 `SP黎瑟` 被排除**不影响**已在游戏内的 `黎瑟`,两者是独立记录。

其中 5 条记录在源数据里没有生日/势力(3 个主角、SP黎瑟、莉莉蔻),对局中相应格子显示 "-" 并按未知处理。
`莉莉蔻` 源数据暂无标签、也无独立立绘,立绘借用同资源名的 `达芙涅` 兜底(已在 `fetch_imgs.js` 里注明)。

### 关于「性别」数据

上游 dna-builder 数据库**没有性别字段**,这一列来自 [boarhat.gg](https://boarhat.gg/games/duet-night-abyss/character/) 角色页的 Profile 表:

- 29 名角色取到明确性别(男 6 人 / 女 23 人);
- **3 名主角**(`主角-暗`/`主角-光`/`主角-水`)在 boarhat 上是「-」——游戏里主角性别由玩家自选,故记为 **`男/女`**
  (三名主角互相猜性别为绿,与确定性别的角色互猜为灰);
- **莉莉蔻**(2.0)boarhat 尚未收录,经确认记为 **`女`**;
- 因此 33 名角色的性别已全部确定,不再有「未知」值。

同一次抓取还把 boarhat 的 `Weapon Proficiency` 与上游 `精通` 逐条交叉核对,**33 条全部一致**(见 `tools/_weapon_review.txt`)。

## 本地运行

```bash
# 方法1:直接双击 index.html
# 方法2:本地起个静态服务(可选,效果一样)
python3 -m http.server 8080    # 然后访问 http://localhost:8080
```

## 数据库

游戏直接加载 `characters.js`(暴露为 `window.LUOYIBA_CHARACTERS`)。每条记录:

```js
{ id: 1503, nickname: "刻舟",
  属性: "光",            // 六元素: 光 / 暗 / 水 / 火 / 雷 / 风
  阵营: "华胥",          // 六大阵营
  势力: "山外山·飘零人",  // 细分势力(部分角色为空)
  性别: "男",            // 男 / 女;主角=男/女(玩家自选)
  可用: true,            // false = 仅存档、不参与对局(莉莉蔻/SP黎瑟)
  近战精通: ["全部近战"],  // 武器精通·近战行(单手剑/长柄/重剑/双刀/鞭刃/太刀)
  远程精通: ["全部远程"],  // 武器精通·远程行(手枪/双枪/榴炮/霰弹枪/突击枪/弓)
  版本: "1.1",           // 实装版本
  精通: ["全部类型"],     // 上游原始武器精通数组
  额外精通: [],           // 需解锁的武器
  标签: ["输出", "武器伤害"], // 上游定位标签(保留备查,不上棋盘)
  birthday: "1101",      // 四位字符串 "MMDD"("" = 未录入)
  alias: "仗剑游",        // 搜索别名(角色称号)
  icon: "Kezhou",        // 上游资源名
  pinyin: "kezhouzhangjianyou", // 全拼(角色名+称号);仅用于联想
  pinyinAbbr: "kzzjy",          // 首字母缩写;仅用于联想
  avatar: "images/head-kezhou.webp",   // 游戏内小头像(256×256)
  images: ["images/head-kezhou.webp"], // 结算大图用
  team: "华胥", role: "输出", crystal: "光", weapon: "全部近战", gender: "男", age: 0 } // 兼容字段(不参与判定)
```

- 逐角色完整数据(含基础攻击/生命/防御/护盾/神智)**另见 `characters.details.json`**;
- **武器精通**由上游 `精通` 按武器类别切分成 `近战精通` / `远程精通` 两行;
  `刻舟` 的「全部类型」展开为「全部近战」「全部远程」;
- **年龄**本作没有数据(`age` 固定 0);**性别**来自 boarhat.gg(见上文「关于性别数据」);
- `pinyin` / `pinyinAbbr` 由 `tools/gen_pinyin.js` 用 pinyin-pro 生成,并人工校准了多音字
  (如游戏里的武器类型**重剑读 chóng jiàn**、人名**卡米拉读 kǎ mǐ lā**),逐条校对结果见 `tools/_pinyin_review.txt`;
- **不要手改 `characters.js`**:它由 `tools/build_chars_db.js` 生成,手改会在下次生成时被覆盖。

### 重新生成数据库与图片

```bash
cd gamedemo
node tools/fetch_char_data.js      # 下载上游角色数据 -> tools/_char.data.ts
node tools/fetch_imgs.js           # 下载角色小头像 -> game/images/,写 tools/_db_images.json
node tools/fetch_pinyin_lib.js     # 下载 pinyin-pro 到 tools/_pinyin_pro(仅生成期使用,不随游戏分发)
node tools/gen_pinyin.js           # 生成拼音表 -> tools/_db_pinyin.json
node tools/fetch_boarhat_chars.js  # 抓取性别/精通 -> tools/_boarhat_chars.json
node tools/gen_gender_weapon.js    # 生成性别 + 近战/远程精通 -> tools/_db_gender_weapon.json
node tools/build_chars_db.js       # 生成 characters.js / characters.details.json
```

### 自检

```bash
cd gamedemo
node tools/verify_db.js            # 数据库与页面一致性(字段、性别/精通取值、列头、品牌)
node tools/test_integration.js     # 数据库 ↔ app.js ↔ index.html ↔ images 的接缝检查
node tools/test_logic.js           # 判定逻辑单测(精确/重叠/版本/生日环形等 40+ 用例)
node tools/test_pinyin_search.js   # 拼音联想单测(全拼/首字母/称号 + 拼音不能直接提交)
node tools/test_ui_smoke.js        # 极简 DOM 垫片跑完整对局(开局/猜测/结算/连胜/再来一把/拼音候选)
node tools/test_static_serve.js    # 起临时静态服务,验证页面与图片等资源都能取到
node tools/test_preview_page.js    # 校验头像总览页可打开、图片全部可加载
```

> 想一次性看全部 33 名角色的头像,直接打开 `gamedemo/tools/avatar_preview/index.html`。

### tools/ 目录说明

| 文件 | 用途 |
| --- | --- |
| `fetch_char_data.js` | 从 dna-builder 仓库下载角色数据(优先 GitHub Contents API,回退 jsDelivr) |
| `fetch_imgs.js` | 下载游戏内小头像(`T_Head`,优先)并按 slug 落盘,缺失时回退半身立绘(`T_Bust`) |
| `preview_avatars.js` | 生成头像总览页 `tools/avatar_preview/index.html`(33 角色小头像一览,便于核对) |
| `fetch_pinyin_lib.js` | 从 npm 下载并解包 pinyin-pro(仅本地生成拼音时用) |
| `fetch_boarhat_chars.js` | 抓取 boarhat.gg 角色页的性别 / 武器精通 / 生日 |
| `gen_gender_weapon.js` | 生成性别与近战/远程精通表,并与 boarhat 交叉核对 |
| `gen_pinyin.js` | 生成全拼 / 首字母表,含多音字人工校准 |
| `build_chars_db.js` | 解析并生成游戏数据库(可读中文键 + 兼容字段 + 图片/拼音/性别) |
| `verify_db.js` / `test_integration.js` / `test_logic.js` / `test_pinyin_search.js` / `test_ui_smoke.js` / `test_static_serve.js` | 各级自检与测试 |
| `extract_char.js` / `img_size.js` | 排查用的小工具(字段抽取、WebP 尺寸) |
| `_char.data.ts` | 上游原始数据快照(仓库 master) |
| `_pinyin_review.txt` | 33 名角色的拼音对照表(人工校对用) |

## 文件结构

```
├── index.html                 # 入口(开始页 / 游戏页 / 规则与结算弹窗)
├── app.js                     # 全部逻辑:选目标 / 判定 / 补全 / 棋盘 / 图片 / 存档
├── characters.js              # 数据库:33 名《二重螺旋》角色(自动生成)
├── characters.details.json    # 逐角色完整数据(含基础属性)
├── style.css                  # 样式(配色取自 DNA Builder 主题 abyss)
├── images/                    # 33 张游戏内小头像(256×256 WebP,圆角方形裁切)
├── docs/BGM指南.md            # 背景音乐接入方案(含自动播放限制与版权注意事项)
└── LICENSE                    # AGPL-3.0
```

## 想加背景音乐(BGM)?

见 **[`docs/BGM指南.md`](docs/BGM指南.md)** —— 包含三条可行路径(单文件循环 / Web Audio 淡入淡出 / 程序化生成)、
浏览器自动播放限制的规避方式(挂在「开始游戏」按钮上)、静音开关与 localStorage 记忆、
以及素材版权注意事项。

## 数据来源与致谢

- **角色数据、头像与立绘**来自 [DNA Builder 二重螺旋资料库](https://dna-builder.cn/db/char) ——
  开源项目 [pa001024/dna-builder](https://github.com/pa001024/dna-builder)(MIT),
  取用 `src/data/d/char.data.ts`、`public/imgs/webp/T_Head_*.webp`(游戏内小头像)
  与 `public/imgs/bust/T_Bust_*.webp`(半身立绘,兜底);
  角色图片版权归游戏官方所有,此处仅用于粉丝向非商业交流;
- **性别 / 武器精通核对**来自 [boarhat.gg](https://boarhat.gg/games/duet-night-abyss/character/) 的角色资料页;
- **玩法与前端结构**基于 [Rainfall66/kayiba](https://github.com/Rainfall66/kayiba)「卡一把」单机版,
  其本身派生自 [shnlfriberg/csgofriberg](https://github.com/shnlfriberg/csgofriberg)(AGPL-3.0);
- **拼音生成**使用 [pinyin-pro](https://github.com/zh-lx/pinyin-pro)(MIT),仅在构建期使用,游戏运行时不依赖任何库。

## 免责声明

- 本项目为**非商业**粉丝作品,与《二重螺旋》及其开发/发行方**无任何关联或授权**;
- 角色名、设定、头像图片等版权均归游戏官方所有,本项目仅作粉丝向非商业交流使用,已使用小尺寸压缩图;
- 如官方或权利人要求,将立即配合删除相关内容。

## 许可证

[GNU AGPL-3.0](LICENSE) —— 本项目派生自「卡一把」单机版与 [shnlfriberg/csgofriberg](https://github.com/shnlfriberg/csgofriberg)(AGPL-3.0),
按协议要求以相同许可证开源,并保留原项目版权声明。
