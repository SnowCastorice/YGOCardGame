# 🪟 Windows 设备 Claude Code 同步配置指南

> 本文档用于在新 Windows 设备上快速同步 Claude Code 完整开发环境。
> macOS 主机配置快照时间：2026-09-21

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

### 3.3 chrome-devtools MCP 的 Windows 本地覆盖（必做）

项目里的 `.mcp.json`（随 Git 同步）保存的是**通用写法** `"command": "npx"`，macOS/Linux 开箱即用。但 **Windows 上 Claude Code 无法直接执行 `npx`**（`npx` 实际是 `npx.cmd` 批处理文件，启动会报 `Windows requires 'cmd /c' wrapper to execute npx`），需要在**设备本地**加一个同名覆盖。

**原理**：Claude Code 的 MCP 作用域优先级为 `local > project > user`，同名服务器以最高优先级的定义为准。因此本地覆盖会盖过 `.mcp.json`，且只影响这台设备。

**操作步骤**（手动编辑最稳）：

1. 关闭 Claude Code
2. 编辑 `%USERPROFILE%\.claude.json`，找到 `projects` → 本项目路径的条目 → 在其中的 `mcpServers` 加入：

```json
"chrome-devtools": {
  "command": "cmd",
  "args": ["/c", "npx", "-y", "chrome-devtools-mcp@latest"]
}
```

3. 保存后运行 `claude mcp list` 验证，应显示 `chrome-devtools ... ✔ Connected`

> ⚠️ 不要用 `claude mcp add` 配置这个（已知 bug 会把 `/c` 误判为路径，见 anthropics/claude-code#46360），手动编辑 `~/.claude.json` 最稳。
> ⚠️ 若 `claude mcp list` 提示同名服务器冲突警告，属正常现象——local 覆盖生效，实际用的是 Windows 写法。

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
| 3 | Skills 可用 | `/skills` | 显示 skill 列表（含用户级 18 个）|
| 4 | Playwright MCP 可用 | `/mcp` | 显示 playwright 的 23 个工具 |
| 5 | price-ocr Agent 可用 | `/agents` | 显示 price-ocr agent |
| 6 | Hooks 生效 | 尝试 git commit | 触发版本号检查 |
| 7 | Chrome DevTools MCP | 完成 3.3 本地覆盖后 `/mcp` | 显示 chrome-devtools 工具 |
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
| .mcp.json | 项目根目录 | ✅ Git（通用写法，Windows 另需本地覆盖）|
| `~/.claude/settings.json` | 用户级 | ❌ 手动创建 |
| `~/.claude.json` (MCP) | 用户级 + local 覆盖 | ❌ 手动添加 |
| `~/.claude/skills/` (18个) | 用户级 | ❌ `npx skills add` |
| Python venv | `local/venv/` | ❌ 手动安装 |
| Global npm 包 | 系统级 | ❌ `npm install -g` |

---

## 🔄 同步提醒

- **chrome-devtools MCP 的平台差异**（重要）：
  - `.mcp.json`（随 Git 同步）统一使用 `npx` 通用写法，**macOS/Linux 直接可用**
  - **Windows 无法直接执行 `npx`**，需在设备本地加 `cmd /c` 覆盖（见 3.3），该覆盖不随 Git 同步，每台 Windows 设备配置一次即可
- 用户级 `~/.claude/settings.json` 中的 API 配置如果不同设备用不同 API key，记得各自修改
- macOS 的 `~/.claude/skills/` 目录可以直接复制到 Windows 的 `%USERPROFILE%\.claude\skills\`，但推荐用 `npx skills add` 重新安装以保持一致
