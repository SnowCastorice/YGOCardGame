# 🪟 Windows 设备 Claude Code 同步配置指南

> 本文档用于在新 Windows 设备上快速同步 Claude Code 完整开发环境。
> macOS 主机配置快照时间：2026-07-01

---

## 📦 第一步：安装基础软件

### 1.1 Git
```powershell
winget install Git.Git
```

### 1.2 Node.js（含 npm）
```powershell
winget install OpenJS.NodeJS.LTS
```

### 1.3 Claude Code（全局安装）
```powershell
npm install -g @anthropic-ai/claude-code
```

### 1.4 Playwright（全局安装）
```powershell
npm install -g @playwright/test@1.61.0
```

---

## 🔧 第二步：克隆项目

```powershell
git clone git@github.com:SnowCastorice/YGOCardGame.git
cd YGOCardGame
git checkout dev
```

> 项目 `dev` 分支已包含：CLAUDE.md、.claude/settings.json、.claude/agents/、.claude/hooks/、.mcp.json

---

## ⚙️ 第三步：用户级 Claude 配置

### 3.1 用户设置（`~/.claude/settings.json`）

创建 `%USERPROFILE%\.claude\settings.json`：

```json
{
  "editorMode": "normal",
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<在此填入你的 API Key>",
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-flash",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v4-pro[1M]",
    "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME": "deepseek-v4-pro",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v4-flash[1M]",
    "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME": "deepseek-v4-flash",
    "ANTHROPIC_MODEL": "deepseek-v4-pro",
    "CLAUDE_CODE_EFFORT_LEVEL": "max"
  },
  "includeCoAuthoredBy": false,
  "language": "简体中文",
  "theme": "auto"
}
```

> ⚠️ 这是 DeepSeek API 代理配置。如果 Windows 设备用其他 API（如官方 Anthropic），请修改 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN`。

### 3.2 用户级 MCP 服务器（`~/.claude.json`）

在 `%USERPROFILE%\.claude.json` 中添加 `mcpServers` 字段（如果文件已有其他内容，只合并 `mcpServers` 部分）：

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "@playwright/mcp@latest"
      ],
      "env": {}
    }
  }
}
```

---

## 🎨 第四步：安装 Skills（用户级，18 个）

在 Claude Code 中依次执行 `/skills` 命令搜索并安装以下 skill，或直接用 `npx skills add` 命令：

```powershell
# CKM 设计套件（4 个）
npx skills add ckm-brand
npx skills add ckm-design
npx skills add ckm-design-system
npx skills add ckm-ui-styling

# 开发流程（6 个）
npx skills add find-skills
npx skills add finishing-a-development-branch
npx skills add receiving-code-review
npx skills add requesting-code-review
npx skills add subagent-driven-development
npx skills add test-driven-development

# 调试与验证（3 个）
npx skills add systematic-debugging
npx skills add verification-before-completion
npx skills add using-superpowers

# 文档与报告（3 个）
npx skills add self-improvement
npx skills add writing-plans
npx skills add writing-skills

# UI 设计（1 个）
npx skills add ui-ux-pro-max

# Git 工作树（1 个）
npx skills add using-git-worktrees
```

> 安装后会自动出现在 `~/.claude/skills/` 目录，共 18 个 skill。

---

## 🐍 第五步：Python OCR 环境（仅 Windows）

> ⚠️ OCR 任务在 **Windows 上执行**（GPU 加速），Mac 不跑 OCR。

### 5.1 安装 Python 3.11

下载安装：https://www.python.org/downloads/release/python-3119/

```powershell
# 验证安装
python3.11 --version
```

### 5.2 创建虚拟环境

```powershell
cd YGOCardGame
python3.11 -m venv local/venv
```

### 5.3 安装 PaddlePaddle GPU

> 先确认 NVIDIA 驱动版本（`nvidia-smi`），≥ 550 用 cu126，否则用 cu118。

```powershell
# 驱动 ≥ 550 → cu126（推荐）
local\venv\Scripts\python.exe -m pip install paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/

# 驱动 ≥ 452 但 < 550 → cu118
# local\venv\Scripts\python.exe -m pip install paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/
```

### 5.4 安装其他依赖

```powershell
local\venv\Scripts\python.exe -m pip install -r tools/requirements.txt
```

### 5.5 验证安装

```powershell
local\venv\Scripts\python.exe -c "import paddle; print('版本:', paddle.__version__); print('GPU:', paddle.device.is_compiled_with_cuda()); print('设备:', paddle.device.get_device())"
local\venv\Scripts\python.exe -c "import paddleocr; print('PaddleOCR:', paddleocr.__version__)"
```

期望输出：`GPU: True`，`设备: NVIDIA GeForce RTX 4060`（或 3070）

---

## ✅ 第六步：验证清单

启动 Claude Code 后逐项检查：

```powershell
cd YGOCardGame
claude
```

| # | 检查项 | 命令/方法 | 期望结果 |
|---|--------|-----------|----------|
| 1 | CLAUDE.md 被读取 | 直接问 Claude "当前项目是什么" | 回答"游戏王开包模拟器" |
| 2 | 中文交流正常 | 直接对话 | Claude 用中文回复 |
| 3 | Skills 可用 | `/skills` | 列出 36 个 skill |
| 4 | Playwright MCP 可用 | `/mcp` | 显示 playwright 的 23 个工具 |
| 5 | price-ocr Agent 可用 | `/agents` | 显示 price-ocr agent |
| 6 | Hooks 生效 | 尝试 git commit | 触发版本号检查 |
| 7 | Chrome DevTools MCP | 打开 Chrome 后 `/mcp` | 显示 chrome-devtools 工具 |
| 8 | OCR 环境 | `local\venv\Scripts\python.exe -c "import paddle; print(paddle.device.is_compiled_with_cuda())"` | `True` |

---

## 📋 配置清单速查

| 配置项 | 位置 | 同步方式 |
|--------|------|----------|
| CLAUDE.md | 项目根目录 | ✅ Git |
| .claude/settings.json | 项目级 | ✅ Git |
| .claude/hooks/ | 项目级 | ✅ Git |
| .claude/agents/ | 项目级 | ✅ Git |
| .claude/commands/ | 项目级 | ✅ Git |
| .mcp.json | 项目根目录 | ✅ Git |
| `~/.claude/settings.json` | 用户级 | ❌ 手动创建 |
| `~/.claude.json` (MCP) | 用户级 | ❌ 手动添加 |
| `~/.claude/skills/` (21个) | 用户级 | ❌ `npx skills add` |
| Python venv | `local/venv/` | ❌ 手动安装 |
| Global npm 包 | 系统级 | ❌ `npm install -g` |

---

## 🔄 同步提醒

- macOS 和 Windows 的 `.mcp.json` 中 `chrome-devtools` 的 `command` 字段不同：
  - **macOS**: `"command": "cmd"`, `"args": ["/c", "npx", ...]`
  - **Windows**: `"command": "cmd"`, `"args": ["/c", "npx", ...]`（Windows 上相同，用 `cmd /c` 均可）
- 用户级 `~/.claude/settings.json` 中的 API 配置如果不同设备用不同 API key，记得各自修改
- macOS 的 `~/.claude/skills/` 目录可以直接复制到 Windows 的 `%USERPROFILE%\.claude\skills\`，但推荐用 `npx skills add` 重新安装以保持一致
