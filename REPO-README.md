# 螺一把 · 仓库说明

面向维护者。**玩家请直接看 [`README.md`](README.md)**,或打开 <https://rainfall66.github.io/luoyiba/>。

## 这个仓库是什么

「螺一把」是《二重螺旋 Duet Night Abyss》的猜角色小游戏(非官方粉丝作品),纯静态、零依赖。
仓库根目录就是**可以直接托管的站点根目录** —— 双击 `index.html` 即可游玩,也可直接交给 GitHub Pages。

## 目录

| 路径 | 说明 |
| --- | --- |
| `index.html` / `app.js` / `style.css` | 游戏本体 |
| `characters.js` | 角色数据库(**自动生成,勿手改**) |
| `characters.details.json` | 逐角色完整资料(基础攻血防等) |
| `images/` | 33 张游戏内角色小头像(256×256 WebP) |
| `docs/BGM指南.md` | 给游戏加背景音乐的三条路径 |
| `tools/` | 抓取 / 生成 / 自检脚本 |
| `README.md` | 玩家向说明 |
| `LICENSE` | AGPL-3.0 |

## 常用命令

```bash
npm run serve      # 本地起静态服务预览(等价 python3 -m http.server)
npm run verify     # 跑全部 6 个自检套件
npm run build:all  # 从上游全量重建数据库与图片
```

零散命令:

```bash
node tools/fetch_char_data.js     # 下载上游角色数据 -> tools/_char.data.ts
node tools/fetch_imgs.js          # 下载游戏内小头像 -> images/
node tools/fetch_pinyin_lib.js    # 下载 pinyin-pro(仅生成期)
node tools/gen_pinyin.js          # 生成拼音表(含多音字校准)
node tools/fetch_gender.js        # 抓取性别/精通 -> tools/_boarhat_chars.json
node tools/gen_gender_weapon.js   # 生成性别 + 近战/远程精通
node tools/build_chars_db.js      # 汇总生成 characters.js / characters.details.json
```

## 自检

```bash
node tools/verify_db.js           # 数据库与页面一致性
node tools/test_integration.js    # 数据库 ↔ app.js ↔ index.html ↔ images 的接缝
node tools/test_logic.js          # 判定逻辑单测
node tools/test_pinyin_search.js  # 拼音联想单测
node tools/test_ui_smoke.js       # 极简 DOM 垫片跑完整对局
node tools/test_static_serve.js   # 静态服务与资源可加载性
```

## 数据流

```
dna-builder 仓库  ──fetch_char_data──▶  _char.data.ts
                  ──fetch_imgs──────▶  images/head-*.webp
boarhat.gg        ──fetch_gender────▶  _boarhat_chars.json
npm pinyin-pro    ──gen_pinyin─────▶  _db_pinyin.json
                                      _db_gender_weapon.json
                          build_chars_db  ──▶  characters.js
```

## 部署到 GitHub Pages

仓库根目录即为站点根,所以:**Settings → Pages → Source 选 `Deploy from a branch`,分支 `main`、目录 `/ (root)`**。
站点地址:<https://rainfall66.github.io/luoyiba/>

## 许可

[GNU AGPL-3.0](LICENSE)
