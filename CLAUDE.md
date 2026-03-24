# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个**游戏王卡包开封模拟器**（YGO Pack Opener），纯前端 SPA，无框架依赖，无构建工具，部署在 Cloudflare Pages。

- **线上地址**：https://ygocardgame.pages.dev/
- **GitHub**：https://github.com/SnowCastorice/YGOCardGame
- **管理后台**：`/admin/stats.html`（在设置面板连续点击标题 5 次解锁入口）

## 开发环境

- **终端**：Git Bash（使用 Bash 语法，非 PowerShell / CMD）
- **调试**：Chrome DevTools 模拟 Xiaomi 14（400×890px）
- **本地预览**：直接打开 `index.html`，或 `python -m http.server 8000`
- **临时文件**：必须保存到 `test_output/`，不得在其他位置随意创建目录

## 常用命令

### Python 工具（需先激活虚拟环境 `local/venv/`）

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

## 分支管理

| 分支 | 用途 |
|------|------|
| `main` | 线上稳定版（Cloudflare Pages 自动部署） |
| `dev` | 日常开发（push 不触发部署） |

**工作流**：在 `dev` 分支开发 → 本地测试 → 用户确认 → 合并到 `main` 上线。
⚠️ 不得未经测试和用户确认就推送到 `main`。

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
tools/db/cards.json (YGOCDB 全量, 12MB, 不提交 git)
  → build_pack_data.py 提取并注入
  → data/ocg/cards/ocg_xxx.json 的 cardData 节点
  → 运行时 buildOCGCardsFromLocalData() 本地解析
```

### 版本号管理

`index.html` 中的 `window.APP_VERSION` 是**唯一控制点**，所有资源的 `?v=` 参数自动使用此值。更新版本时只需修改这一处，同时在 `data/changelog.json` 添加对应更新日志。

### 外部 API 限流

所有请求必须通过 `requestThrottler`（间隔 ≥ 300ms）。YGOProDeck 限制 20 req/s，违反可能导致封禁。

## 会话结束 Hooks（必须执行）

每次对话结束前检查：

1. **CHANGELOG 同步**：若有代码/文档变更，必须记录到 `docs/CHANGELOG.md`
2. **changelog.json 同步**：若版本号变更，同步更新 `data/changelog.json`
3. **版本号三处一致**：`APP_VERSION`（index.html）、`data/changelog.json`、`docs/CHANGELOG.md` 三处一致

## 开发规范

- **代码注释**使用中文
- **Git 提交信息**使用中文
- **所有任务执行前**必须先列出规划方案，等待用户确认后才可执行（简单任务除外）
- **设计原则**：移动端专属，`max-width: 500px` 居中，不使用媒体查询

## 详细文档

| 文档 | 内容 |
|------|------|
| `docs/CHANGELOG.md` | 近期变更记录 |
| `docs/ARCHITECTURE.md` | 数据源架构、API 限流、服务端代理 |
| `docs/FEATURES.md` | 背包、图鉴、货币、开包系统详细规格 |
| `docs/TOOLS.md` | Python 工具脚本详细用法 |
| `docs/TODO.md` | 待办事项与路线图 |
