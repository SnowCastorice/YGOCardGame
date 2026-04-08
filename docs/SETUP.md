# 🖥️ 设备配置与环境指南

> 本文档包含新设备 Claude Code 配置步骤、双设备 OCR 环境信息、文档索引。

---

## 第一步：项目配置（已随 Git 同步，无需手动操作）

以下文件已提交到仓库，`git pull` 后自动就位：

| 文件 | 作用 |
|------|------|
| `CLAUDE.md` | 项目指引（开发规范、架构、命令等） |
| `.mcp.json` | Chrome DevTools MCP 配置 |
| `.claude/settings.json` | 项目级共享设置（含 Hooks） |
| `.claude/skills/` | Skills（skill-global-search、self-improvement 等） |
| `.claude/hooks/` | Claude Stop Hook（版本号检查） |
| `tools/version-check.sh` | Git pre-commit Hook 脚本 |

## 第二步：首次启动后的手动配置

在 Claude Code 中依次执行以下 `/config` 设置：

| 设置项 | 值 | 说明 |
|--------|-----|------|
| Response language | `chinese` | 响应语言为中文 |
| Output style | `Explanatory` | 解释型输出风格 |
| Model | `Opus 4.6 (1M context)` | 使用 Opus 模型 |

```bash
# 通过 /config 命令逐项设置
/config    # 选择 Response language → chinese
/config    # 选择 Output style → Explanatory
/model     # 选择 Opus 4.6 (1M context)

#（可选）配置 Shift+Enter 换行
/terminal-setup
```

### 权限配置

首次使用 skill 搜索时会自动弹出权限请求，选择允许即可。

当前已授予的权限：
- `Bash(npx skills:*)` — 允许执行 npx skills 相关命令

### 安装 Git pre-commit Hook

版本号一致性检查脚本已提交到 `tools/version-check.sh`，需要在每台设备上手动安装到 Git hooks：

```bash
echo '#!/bin/bash' > .git/hooks/pre-commit
echo 'exec bash tools/version-check.sh' >> .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

安装后，每次 `git commit` 会自动检查 `APP_VERSION`、`changelog.json`、`CHANGELOG.md`、`README.md` 四处版本号是否一致。不一致则阻止提交。

## 第三步：验证一切就绪

在 Claude Code 中输入任意问题，确认：
- ✅ 中文交流正常
- ✅ CLAUDE.md 被自动读取（Claude 知道项目是"游戏王卡包开封模拟器"）
- ✅ MCP chrome-devtools 可用（打开 Chrome 后可调试）

---

## 🐍 Python 虚拟环境与 OCR 环境

项目在两台设备上交替开发。OCR 工具链运行在 `local/venv/`（Python 3.11）虚拟环境中。

> ⚠️ PaddleOCR 仅支持 Python ≤ 3.12，**不支持 3.13/3.14**。系统 Python 版本不影响，只需 venv 为 3.11 即可。

### 设备信息

| | 设备 A（CHIHAYADU-PC1） | 设备 B |
|---|---|---|
| **OS** | Windows 11 (22631) | 待更新 |
| **GPU** | RTX 4060 (8GB VRAM) | RTX 3070 (8GB VRAM) |
| **NVIDIA 驱动** | 591.74 | 待更新 |
| **系统 Python** | 3.14.3 | 待更新 |
| **venv Python** | 3.11.9（`local/venv/`） | 待更新 |
| **PaddlePaddle-GPU** | 3.2.0 (cu126) | 待更新 |
| **PaddleOCR** | 3.4.0 | 待更新 |

### 新设备安装步骤

```bash
# ========== 1. 创建虚拟环境（需先安装 Python 3.11） ==========
# 下载 Python 3.11：https://www.python.org/downloads/release/python-3119/
# 安装时勾选 "Add to PATH" 不是必须的，只需记住安装路径

# 用 Python 3.11 创建 venv（示例路径，按实际替换）
"C:\Python311\python.exe" -m venv local/venv

# ========== 2. 安装 PaddlePaddle GPU ==========
# ⚠️ 必须通过飞桨官方源安装，PyPI 默认源只有旧版
# ⚠️ 必须指定版本号，避免安装到不兼容的版本

# 显卡驱动 ≥ 550.54 → 用 cu126（推荐）
local/venv/Scripts/python.exe -m pip install paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu126/

# 显卡驱动 ≥ 452.39 但 < 550 → 用 cu118
# local/venv/Scripts/python.exe -m pip install paddlepaddle-gpu==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/

# ========== 3. 安装其他依赖 ==========
local/venv/Scripts/python.exe -m pip install -r tools/requirements.txt

# ========== 4. 验证安装 ==========
local/venv/Scripts/python.exe -c "import paddle; print('版本:', paddle.__version__); print('GPU:', paddle.device.is_compiled_with_cuda()); print('设备:', paddle.device.get_device())"
local/venv/Scripts/python.exe -c "import paddleocr; print('PaddleOCR:', paddleocr.__version__)"
```

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `GPU: False` | 安装了 CPU 版 paddlepaddle | 先 `pip uninstall paddlepaddle`，再用飞桨官方源装 GPU 版 |
| `ModuleNotFoundError: paddle` | venv 未安装 | 按上方步骤 2 安装 |
| OCR 速度很慢（8-10s/卡） | 用了 CPU 版 | 确认 `paddle.device.is_compiled_with_cuda()` 为 True |
| `No module named '_papi'` | Python 版本不兼容 | 确认 venv 是 Python 3.11，不是 3.13/3.14 |

### 调用方式

所有 Python 脚本必须通过 venv 执行，**不要用系统 Python**：

```bash
local/venv/Scripts/python.exe tools/<脚本名>.py <参数>
```

---

## 📋 配置清单速查

| 项目 | 是否自动同步 | 备注 |
|------|:----------:|------|
| CLAUDE.md | ✅ Git | 项目指引 |
| .mcp.json | ✅ Git | MCP 配置 |
| .claude/settings.json | ✅ Git | 项目共享设置 |
| .claude/skills/ | ✅ Git | Skills |
| .claude/hooks/ | ✅ Git | Claude Stop Hook |
| tools/version-check.sh | ✅ Git | Git pre-commit Hook 脚本 |
| .git/hooks/pre-commit | ❌ 本地 | 需手动安装（见上方步骤） |
| 语言 chinese | ❌ 本地 | `/config` 设置 |
| 输出风格 Explanatory | ❌ 本地 | `/config` 设置 |
| 模型 Opus 4.6 | ❌ 本地 | `/model` 设置 |
| 权限 npx skills | ❌ 本地 | 首次使用时授权 |
| Python 虚拟环境 | ❌ 本地 | Python 3.11 venv，见上方 OCR 环境章节 |
| .claude/settings.local.json | ❌ 本地 | 自动生成，无需手动创建 |

---

## 📚 文档索引

| 文档 | 内容 |
|------|------|
| [CLAUDE.md](../CLAUDE.md) | **主指引**：开发规范、架构、命令、Hooks 等 |
| [docs/CHANGELOG.md](CHANGELOG.md) | 近期变更记录 |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md) | 数据源架构、API 限流、服务端代理、文件结构 |
| [docs/FEATURES.md](FEATURES.md) | 背包系统、卡片预览/图鉴、货币系统、开包系统 |
| [docs/TOOLS.md](TOOLS.md) | Python 工具脚本使用说明 |
| [docs/TODO.md](TODO.md) | 待办事项与路线图 |

---

## 常用快捷键

| 操作 | 快捷键 |
|------|--------|
| 发送消息 | `Enter` |
| 换行（不发送） | `\` + `Enter` |

## 常用斜杠命令

| 命令 | 用途 |
|------|------|
| `/config` | 设置语言、输出风格等 |
| `/terminal-setup` | 配置 Shift+Enter 换行 |
| `/model` | 切换模型 |
| `/help` | 查看帮助 |
