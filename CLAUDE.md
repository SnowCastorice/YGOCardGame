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

### 发布流程（MR）

> 本项目已上线运营，任何代码推送到 `main` 都会自动部署到线上环境。

```
dev 开发提交 → CR & 测试 → 展示确认 → 合并到 main → 自动部署
```

**详细步骤**：

1. **在 dev 分支开发** — `git checkout dev`
2. **本地修改** — 完成代码编辑，提交到 `dev`，推送到远程
3. **CR & 测试** — 按「Code Review & 测试流程」执行全部 4 步
4. **展示确认** — 将测试结果展示给用户查看，**等待用户明确说"确认"**
5. **合并上线** — 用户确认后：`git checkout main && git merge dev && git push`
6. **线上验证** — 合并后访问 https://ygocardgame.pages.dev/ 确认线上正常
7. **切回开发** — `git checkout dev` 继续后续开发

**合并前检查清单**（Claude 必须在合并前逐项确认）：

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | `git diff main..dev --stat` 只包含预期文件 | 无多余文件被修改 |
| 2 | 版本号四处一致（如需更新） | index.html、changelog.json、CHANGELOG.md、README.md |
| 3 | 浏览器验证通过 | 无控制台报错、核心功能正常 |
| 4 | 用户已明确确认 | 不可跳过 |

❌ **严禁**：
- 未经测试和用户确认就推送到 `main`
- 合并后不做线上验证
- 一次性合并大量未经验证的改动（应分批合并，每批验证）

### 回退流程（线上出问题时）

```bash
# 1. 确认要回退到的稳定版本
git log --oneline main

# 2. 回退 main（需用户确认目标版本）
git checkout main
git reset --hard <稳定版本hash>
git push origin main --force

# 3. 切回 dev 排查问题
git checkout dev
```

### 版本号管理

`index.html` 中的 `window.APP_VERSION` 是**唯一权威来源**。

**版本号递增规则**：

| 变更类型 | 版本递增 | 示例 |
|----------|----------|------|
| 新功能（用户可感知的） | minor | 1.9.0 → 1.10.0 |
| bug 修复 / 小优化 | patch | 1.9.0 → 1.9.1 |
| 价格数据、工具脚本、文档、配置文件、.claude/ | **不更新** | — |

**每次需要更新版本号时，Claude 必须同步修改 4 处**：

| # | 文件 | 修改内容 |
|---|------|----------|
| 1 | `index.html` 第 8 行 | `window.APP_VERSION = 'x.y.z'` |
| 2 | `data/changelog.json` | 新增版本条目（面向玩家，通俗简短） |
| 3 | `docs/CHANGELOG.md` | 新增版本条目（面向开发者，详细技术描述） |
| 4 | `README.md` | 更新 badge 中的版本号 |

> ⚠️ 有 Git pre-commit Hook（`tools/version-check.sh`）和 Claude Stop Hook（`.claude/hooks/version-check.sh`）自动检查四处版本号一致性。不一致会阻止提交/结束。

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

### 数据管理：导出/导入存档

`game.js` 中实现存档的导出和导入功能，涉及以下 4 个 localStorage key：

| Key | 内容 | 数据结构 |
|-----|------|---------|
| `ygo_inventory_data` | 背包卡牌 | 扁平对象 `{ "cardId": { count, rarityVersionsOwned, ... } }` |
| `ygo_currency_data` | 金币余额 | `{ "gold": number }` |
| `ygo_inventory_spent` | 累计花费 | 纯数字字符串 |
| `ygo_pack_stats` | 开包统计 | 扁平对象 `{ "packCode": { totalPacks, totalBoxes } }` |

导出流程（v2 精简格式）：inventory 精简为 `{ "cardId": { c, r, t } }` → 合并其他 key → JSON → Gzip 压缩 → Base64 → 超 3000 字符自动分段（`[X/N]` 前缀）
导入流程：粘贴（支持多段拼接） → 分段检测拼接 → Base64 解码 → Gzip 解压 → JSON 校验 → 预览确认 → `rebuildInventoryFromPacks()` 重建 → 覆盖写入 → 刷新页面

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

## Code Review & 测试流程

> 适用于所有涉及代码/数据文件修改的功能开发（纯文档修改除外）。
> 流程：**开发完成 → ① Claude 自检 → ② 浏览器验证 → ③ 展示确认 → ④ 合并上线**

### ① Claude 自检（每次修改完成后，Claude 自行执行）

**代码检查**：
1. **调用链完整性** — 新函数是否在初始化流程中被调用
2. **DOM 元素存在性** — JS 引用的 ID 是否在 HTML 中存在
3. **CSS 样式生效** — class 名拼写一致、优先级无覆盖
4. **数据字段匹配** — JS 读取的字段与数据源一致
5. **事件委托正确** — `e.target.closest()` 选择器能匹配目标
6. **移动端兼容** — 触摸事件、弹窗关闭等功能正常

**数据一致性检查**（修改了 data/ 目录下的文件时必须执行）：
1. **价格文件 cardId 匹配** — 价格文件中的 cardId 必须在对应卡包数据文件中存在
2. **稀有度匹配** — 价格文件中的稀有度必须在卡包的 rarityVersions 中存在
3. **文件引用有效** — JSON 中引用的文件路径必须真实存在
4. **编号连续** — 价格文件的 setNumber 无遗漏

**变更范围检查**：
1. 执行 `git diff --stat` 列出所有被修改的文件
2. 逐个解释每个文件的修改原因
3. 确认没有多余的文件被修改（如：只改 LOCR 时不应修改 BLZD/LOCH 的文件）
4. 连带修改需要说明为什么必须改

### ② 浏览器验证（通过 Chrome DevTools MCP）

**基础验证**（所有修改都要做）：
- 启动本地服务器（`python -m http.server 8000`）
- 打开页面，确认无白屏
- 控制台无红色报错

**功能验证**（根据修改范围选做）：

| 修改范围 | 验证操作 |
|----------|----------|
| 开包逻辑 | 开一包确认正常出卡、稀有度显示正确 |
| 价格/数据文件 | 打开对应卡包，确认价格显示正常（非"暂无报价"） |
| UI/CSS | 截图确认布局正确（400×890px 模拟小米 14） |
| 背包/金币 | 验证存取操作正常 |
| 存档导入/导出 | 导出再导入，确认数据一致 |

### ③ 展示确认（Claude 向用户汇报）

完成 ①② 后，Claude 必须向用户汇报以下内容：

```
📋 本次修改：
- [1-3 句话概括改了什么]

📁 修改的文件：
- [文件列表 + 每个文件改了什么]

✅ 验证结果：
- [自检通过项]
- [浏览器验证截图/结果]

⚠️ 风险点（如有）：
- [可能影响的其他功能]
```

**等用户说"确认"后才能进入下一步。严禁跳过确认直接合并。**

### ④ 合并上线

用户确认后按发布流程执行：`dev 提交 → 本地验证 → 用户确认 → 合并到 main`

### 推荐配合使用的 Skill

| Skill | 什么时候用 |
|-------|-----------|
| `verification-before-completion` | 宣称"完成"前，强制跑验证命令确认结果 |
| `simplify` | 较大功能开发完成后，检查代码质量和可复用性 |
| `systematic-debugging` | 遇到 bug 时，系统化排查而不是乱猜 |

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
