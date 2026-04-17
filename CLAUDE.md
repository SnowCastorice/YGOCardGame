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
- **本地预览**：`python -m http.server 8000`，访问 `http://localhost:8000`
- **临时文件**：必须保存到 `test_output/`，不得在其他位置随意创建目录
- **Python 工具**：通过虚拟环境 `local/venv/Scripts/python.exe` 执行（详见 `docs/TOOLS.md`）

## 分支管理与发布

| 分支 | 用途 |
|------|------|
| `main` | 线上稳定版（Cloudflare Pages 自动部署） |
| `dev` | 日常开发（push 不触发部署） |

**工作流**：`dev` 开发 → CR & 测试 → 用户确认 → 合并到 `main` 上线。

⚠️ **严禁未经测试和用户确认就推送到 `main`。**

> 详细的 MR 流程、CR & 测试流程、回退流程见 [`docs/WORKFLOW.md`](docs/WORKFLOW.md)。

## 版本号管理

`index.html` 中的 `window.APP_VERSION` 是**唯一权威来源**。

| 变更类型 | 版本递增 | 示例 |
|----------|----------|------|
| 新功能（用户可感知的） | minor | 1.9.0 → 1.10.0 |
| bug 修复 / 小优化 | patch | 1.9.0 → 1.9.1 |
| 价格数据、工具脚本、文档、配置、.claude/ | **不更新** | — |

每次更新版本号时必须**同步修改 4 处**：`index.html` APP_VERSION、`data/changelog.json`、`docs/CHANGELOG.md`、`README.md` badge。

> ⚠️ 有 Claude Hook（`.claude/hooks/pre-push-check.sh`）自动检查版本号一致性和数据一致性，跨设备生效。

## 代码架构（概要）

纯前端 SPA，`index.html` 为唯一入口，所有 JS 通过 `<script>` 标签加载（无打包器）。

| 文件/目录 | 职责 |
|-----------|------|
| `js/game.js` | 主协调器：UI 流程、开包、动画 |
| `js/api.js` | 数据获取、IndexedDB 缓存、CDN 图源 |
| `js/currency.js` / `inventory.js` / `pack-stats.js` / `priceSystem.js` | 各子系统（localStorage 状态管理） |
| `data/ocg/cards/*.json` | 卡包数据（含预注入的 cardData，运行时零 API 调用） |
| `data/ocg/prices/*.json` | 市场价格（OCR 提取） |
| `tools/` | Python 工具（OCR、数据库更新、卡包构建） |

所有模块使用 **IIFE 模式**（`const Foo = (function(){ ... return {...} })()`）。

> 详细架构、数据流、数据注入机制见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。
> 背包、图鉴、货币、开包系统规格见 [`docs/FEATURES.md`](docs/FEATURES.md)。

## 开发规范

- **代码注释**使用中文
- **Git 提交信息**使用中文
- **复杂任务**必须先出方案再执行（详见下方「任务执行流程」）
- **遇到阻塞时**即时和用户沟通，不要自行尝试新方案
- **设计原则**：移动端专属，`max-width: 500px` 居中，`viewport-fit=cover` + `safe-area-inset` 适配刘海屏
- **业务规则**：金币与人民币 1:1，游戏内不出现真实货币
- **临时文件**：统一保存到 `test_output/`（已 .gitignore），禁止随意建目录，及时清理。CR 报告、审查文档等生成物也保存在此目录，**严禁保存到用户桌面或项目外路径**
- **Edit 后验证语法**：JS 文件用 `node --check file.js`，Python 文件用 `python -c "import ast; ast.parse(open('file.py').read())"`
- **外部 API**：所有请求通过 `requestThrottler`（间隔 ≥ 300ms），YGOProDeck 限制 20 req/s

## 任务执行流程

### 1. 复杂任务必须先出方案
- 不要直接动手，先探索代码现状 + 分析影响范围
- 将方案以清晰的步骤列出，和用户讨论确认后再执行
- 方案文档保存在 `docs/PLAN_*.md`，完成后归档到 `docs/archive/`

### 2. 分步执行，逐步确认
- 不要一口气把所有事情做完
- 每完成一步，汇报结果并等待用户确认后再进行下一步
- 使用 TodoList 跟踪多步任务的进度

### 3. 推送需要用户确认
- 不要频繁推送，不要自行决定推送时机
- 代码修改完成后告知用户，等待用户明确说"推送"后再执行 `git push`

### 4. 代码修改后必须 CR + 测试
- 代码变更完成后，主动进行 CR（代码审查）：检查调用一致性、残留引用、语法正确性
- CR 通过后进行端到端浏览器测试（不能只靠 console API 验证）
- 测试前列出 CR 检查清单和测试计划

### 5. 版本号管理
- 所有步骤完成、测试通过后再统一更新版本号
- 中间步骤不单独递增版本号（除非被 hook 拦截）

## 会话结束 Hooks（自动执行）

| # | 检查项 | 触发条件 |
|---|--------|----------|
| 1 | `docs/CHANGELOG.md` 已记录本次变更 | 任何代码或文档被修改 |
| 2 | `data/changelog.json` 已同步更新 | 版本号发生变化 |
| 3 | 版本号四处一致 | 版本号发生变化 |

⚠️ 只回答问题、没有修改文件时，所有检查自动跳过。

## 详细文档

| 文档 | 内容 |
|------|------|
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | **MR 发布流程、CR & 测试流程、回退流程** |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 数据源架构、数据流、数据注入、API 限流 |
| [`docs/FEATURES.md`](docs/FEATURES.md) | 背包、图鉴、货币、开包、存档系统规格 |
| [`docs/TOOLS.md`](docs/TOOLS.md) | Python 工具脚本详细用法 |
| [`docs/SETUP.md`](docs/SETUP.md) | 设备配置、OCR 环境、Claude Code 配置 |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | 变更记录 |
| [`docs/TODO.md`](docs/TODO.md) | 待办事项与路线图 |
