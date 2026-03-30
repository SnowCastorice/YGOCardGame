# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个**游戏王开包模拟器**（YGO Pack Opener），纯前端 SPA，无框架依赖，无构建工具，部署在 Cloudflare Pages。

- **线上地址**：https://ygocardgame.pages.dev/
- **GitHub**：https://github.com/SnowCastorice/YGOCardGame
- **管理后台**：`/admin/stats.html`（在设置面板连续点击标题 5 次解锁入口）

## 用户背景

- **游戏策划**，代码水平较低，请用通俗易懂的语言沟通
- 愿意尝试新技术，但需要清晰的分步指引
- 可能在不同设备和不同 AI 模型之间切换，代码注释需清晰明了

## 开发环境

- **终端**：Git Bash（使用 Bash 语法，非 PowerShell / CMD）
- **调试**：Chrome DevTools 模拟 Xiaomi 14（400×890px）
- **本地预览**：直接打开 `index.html`，或 `python -m http.server 8000`
- **临时文件**：必须保存到 `test_output/`，不得在其他位置随意创建目录

## 常用命令

### 本地预览

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000
```

### Python 工具（需先激活虚拟环境 `local/venv/`）

> Python 虚拟环境路径统一为 `local/venv/`，该目录在 `.gitignore` 中，每台设备需各自安装依赖（`pip install -r tools/requirements.txt`）。

```bash
# 更新卡牌数据库 + 重建所有卡包（推荐一键操作）
python tools/update_cards_db.py --rebuild

# 只重建所有卡包（已有 cards.json 时）
python tools/build_pack_data.py

# 只重建指定卡包
python tools/build_pack_data.py ocg_blzd

# OCR 价格一键工作流（截图 → OCR → 解析 → 合并）
local/venv/Scripts/python.exe tools/ocr_workflow.py <日期>

# 抓取 YGOCDB 最新 OCG 卡包列表
python tools/fetch_packs.py list ocg
```

> OCR 工具依赖 PaddleOCR（Python 3.11，**不支持 3.14**），GPU 加速约 1 秒/段，CPU 约 8-10 秒/段。

## 分支管理

| 分支 | 用途 |
|------|------|
| `main` | 线上稳定版（Cloudflare Pages 自动部署） |
| `dev` | 日常开发（push 不触发部署） |

**工作流**：在 `dev` 分支开发 → 本地测试 → 用户确认 → 合并到 `main` 上线。
⚠️ 不得未经测试和用户确认就推送到 `main`。

### 发布流程

> 本项目已上线运营，任何代码推送到 `main` 都会自动部署到线上环境。

1. **在 dev 分支开发** — `git checkout dev`
2. **本地修改** — 完成代码编辑，提交到 `dev`
3. **本地测试** — 通过浏览器截图 / 脚本验证修改效果正确
4. **展示确认** — 将测试结果展示给用户查看，等待用户确认
5. **合并上线** — 用户确认后：`git checkout main && git merge dev && git push`
6. **切回开发** — `git checkout dev` 继续后续开发

❌ **严禁**：未经测试和用户确认就直接推送代码

## 代码架构

### 整体结构

纯前端 SPA，以 `index.html` 为唯一入口，所有 JS 模块通过 `<script>` 标签加载（无打包器）。

```
index.html          ← 入口 + window.APP_VERSION（缓存破坏唯一控制点）
css/style.css       ← 全部样式（移动端专属，不使用媒体查询）
js/
  game.js           ← 主逻辑：UI 流程、开包、动画、卡图解析
  api.js            ← 卡牌数据获取、IndexedDB 缓存、多级 CDN 图源
  currency.js       ← 金币系统（localStorage）
  inventory.js      ← 背包系统（localStorage）
  pack-stats.js     ← 开包统计（本地 + Cloudflare KV）
  priceSystem.js    ← 市场价格（本地 JSON 数据）
data/
  ocg/packs.json          ← 卡包元信息索引
  ocg/cards/*.json        ← 每个卡包的卡牌数据（含预注入的 cardData）
  ocg/prices/             ← 市场价格 JSON（从「集换社」OCR 提取）
  ocg/images/loch/        ← LOCH 本地卡图（196 张 webp）
  ocg/*_image_map.json    ← 卡密 → CDN objectId 映射表（稀有度专属图）
  common/rarities.json    ← 全局稀有度定义（名称/颜色/分类）
  changelog.json          ← 网页内展示的更新日志
functions/api/
  pack-stats.js     ← Cloudflare Function：全局统计 POST/GET
  card-image.js     ← Cloudflare Function：KONAMI 卡图代理
tools/              ← Python 开发工具（OCR、数据库更新、卡包构建等）
```

### JS 模块关系

所有核心系统使用 **IIFE 模块模式**（`const Foo = (function(){ ... return {...} })()`），私有状态 + 公开 API。

`game.js` 是主协调器，调用其他所有模块：
- `api.js`：数据和图片加载，含 IndexedDB 缓存（7 天过期）
- `currency.js` / `inventory.js` / `pack-stats.js` / `priceSystem.js`：各管理自己的 localStorage 状态

### 数据流：开包过程

```
用户点击卡包
  → game.js 从 data/ocg/cards/{packCode}.json 加载卡牌
  → api.js 的 buildOCGCardsFromLocalData() 本地处理（零 API 调用）
  → 应用稀有度规则（4×普通 + 1×稀有，概率来自卡包配置）
  → 解析卡图 URL（通过 imageMapFile 支持稀有度专属图）
  → inventory.js 存储到 localStorage
  → pack-stats.js 本地记录 + 异步上报到 /api/pack-stats
```

### 数据注入机制

卡牌数据**构建时预注入**，运行时无需 API 调用：

```
tools/db/cards.json (YGOCDB 全量, 12MB, 需提交到git)
  → build_pack_data.py 提取并注入
  → data/ocg/cards/ocg_xxx.json 的 cardData 节点
  → 运行时 buildOCGCardsFromLocalData() 本地解析
```

### 版本号管理

`index.html` 中的 `window.APP_VERSION` 是**唯一权威来源**。每次提交包含代码变更时，Claude 必须：

1. **递增 `APP_VERSION`**（`index.html` 第 8 行）
2. **同步 `data/changelog.json`**：新增版本条目，写面向玩家的更新说明（通俗、简短）
3. **同步 `docs/CHANGELOG.md`**：新增版本条目，写面向开发者的详细变更记录
4. **同步 `README.md`**：更新 badge 中的版本号

以下变更**不需要**更新版本号：价格数据、工具脚本、文档、配置文件、.claude/ 目录。

> ⚠️ 有 Git pre-commit Hook（`tools/version-check.sh`）和 Claude Stop Hook（`.claude/hooks/version-check.sh`）自动检查四处版本号一致性。

### 外部 API 限流

所有请求必须通过 `requestThrottler`（间隔 ≥ 300ms）。YGOProDeck 限制 20 req/s，违反可能导致封禁。

## 会话结束 Hooks（自动执行）

> 以下检查已通过 `.claude/hooks/session-end-check.sh` 自动化，在 Claude 结束回复时自动触发。
> 检查不通过会**阻止会话结束**，并提示需要修复的问题。

| # | 检查项 | 触发条件 |
|---|--------|----------|
| 1 | `docs/CHANGELOG.md` 已记录本次变更 | 任何代码或文档被修改 |
| 2 | `data/changelog.json` 已同步更新 | 版本号发生变化 |
| 3 | `APP_VERSION`（index.html）、`changelog.json`、`CHANGELOG.md` 三处版本号一致 | 版本号发生变化 |

⚠️ 如果本次会话只是回答问题、没有修改任何文件，则所有检查自动跳过。

## 开发规范

- **代码注释**使用中文
- **Git 提交信息**使用中文
- **所有较为复杂的任务**必须先运行探索模式（Explore）和规划模式（Plan），给用户确认计划后才能开始执行（简单任务除外）
- **执行过程中遇到阻塞时**，应即时和用户沟通后确定方案，不要直接开始尝试新方案
- **设计原则**：移动端专属，`max-width: 500px` 居中，不使用媒体查询，使用 `viewport-fit=cover` + `safe-area-inset` 适配刘海屏
- **业务规则**：金币与人民币 1:1，游戏内不出现真实货币

### 临时文件管理

1. **统一临时目录**：所有临时文件必须保存到 `test_output/`（已被 `.gitignore` 忽略）
2. **禁止随意建目录**：不得在项目根目录或其他位置随意创建新文件夹
3. **及时清理**：临时文件使用完毕后必须删除
4. **工作流清理**：OCR 工作流等批处理任务开始前应先清理上一次的残留文件

## 功能自测规范

完成代码修改后、提交前必须确认：

1. **调用链完整性** — 新函数是否在初始化流程中被调用
2. **DOM 元素存在性** — JS 引用的 ID 是否在 HTML 中存在
3. **CSS 样式生效** — class 名拼写一致、优先级无覆盖
4. **数据字段匹配** — JS 读取的字段与数据源一致
5. **事件委托正确** — `e.target.closest()` 选择器能匹配目标
6. **移动端兼容** — 触摸事件、弹窗关闭等功能正常

## 详细文档

| 文档 | 内容 |
|------|------|
| `docs/SETUP.md` | 设备配置、OCR 环境、文档索引 |
| `docs/CHANGELOG.md` | 近期变更记录 |
| `docs/ARCHITECTURE.md` | 数据源架构、API 限流、服务端代理 |
| `docs/FEATURES.md` | 背包、图鉴、货币、开包系统详细规格 |
| `docs/TOOLS.md` | Python 工具脚本详细用法 |
| `docs/TODO.md` | 待办事项与路线图 |
| `docs/SETUP.md` | 新设备配置 Claude Code 指南 |
