# 🖥️ 新设备配置 Claude Code 指南

> 本文档用于在新设备上从零配置 Claude Code 开发环境，确保多设备之间的开发体验一致。

---

## 第一步：项目配置（已随 Git 同步，无需手动操作）

以下文件已提交到仓库，`git pull` 后自动就位：

| 文件 | 作用 |
|------|------|
| `CLAUDE.md` | 项目指引（开发规范、架构、命令等） |
| `.mcp.json` | Chrome DevTools MCP 配置 |
| `.claude/settings.json` | 项目级共享设置 |
| `.claude/skills/skill-global-search/` | Skill 搜索安装技能 |
| `.claude/skills/self-improvement/` | 自我改进技能 |

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

首次使用 skill 搜索时会自动弹出权限请求，选择允许即可。或者手动添加：

```bash
# 允许 npx skills 命令（用于 skill-global-search）
# 在权限弹窗中选择 "Allow always" 即可
```

当前已授予的权限：
- `Bash(npx skills:*)` — 允许执行 npx skills 相关命令

### 安装 Git pre-commit Hook

版本号一致性检查脚本已提交到 `tools/version-check.sh`，需要在每台设备上手动安装到 Git hooks：

```bash
printf '#!/bin/bash\nexec bash tools/version-check.sh\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

安装后，每次 `git commit` 会自动检查 `APP_VERSION`、`changelog.json`、`CHANGELOG.md` 三处版本号是否一致。不一致则阻止提交。

## 第三步：验证一切就绪

在 Claude Code 中输入任意问题，确认：
- ✅ 中文交流正常
- ✅ CLAUDE.md 被自动读取（Claude 知道项目是"游戏王卡包开封模拟器"）
- ✅ MCP chrome-devtools 可用（打开 Chrome 后可调试）

---

## 📋 配置清单速查

| 项目 | 是否自动同步 | 备注 |
|------|:----------:|------|
| CLAUDE.md | ✅ Git | 项目指引 |
| .mcp.json | ✅ Git | MCP 配置 |
| .claude/settings.json | ✅ Git | 项目共享设置 |
| .claude/skills/ | ✅ Git | 2 个 Skill |
| .claude/hooks/ | ✅ Git | Claude Stop Hook（版本号检查） |
| tools/version-check.sh | ✅ Git | Git pre-commit Hook 脚本 |
| .git/hooks/pre-commit | ❌ 本地 | 需手动安装（见上方步骤） |
| 语言 chinese | ❌ 本地 | `/config` 设置 |
| 输出风格 Explanatory | ❌ 本地 | `/config` 设置 |
| 模型 Opus 4.6 | ❌ 本地 | `/model` 设置 |
| 权限 npx skills | ❌ 本地 | 首次使用时授权 |
| Python 虚拟环境 | ❌ 本地 | 需手动创建 `local/venv/` |
| .claude/settings.local.json | ❌ 本地 | 自动生成，无需手动创建 |

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
