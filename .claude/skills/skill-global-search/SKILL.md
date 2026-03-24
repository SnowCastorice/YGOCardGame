---
name: skill-global-search
description: 从 github、skills.sh 搜索和安装 Agent Skills（80,000+ 技能库）。当用户提到"skill"并有查找/搜索/安装意图时触发，如"有没有...skill"、"找个skill"、"搜索SQL相关的skill"。不用于普通网页搜索。
---

# Skill 全局搜索

从 skills.sh（80,000+ 技能目录）和 GitHub 搜索并安装 Agent Skills。

---

## ⛔ 强制执行规则（违反即失败）

```
┌─────────────────────────────────────────────────────────────┐
│  本 skill 采用【状态机】设计，必须按顺序完成每个阶段。      │
│  每个阶段有【硬性完成条件】，未满足不得进入下一阶段。       │
│  AI 不得以"CLI 已有结果"为由跳过 GitHub 搜索阶段。         │
└─────────────────────────────────────────────────────────────┘
```

**执行状态追踪**（每次响应必须在内部维护）：
```
□ PHASE_1_ENV_CHECK     - 环境检查
□ PHASE_2_CLI_SEARCH    - CLI 搜索（必须执行）
□ PHASE_3_GITHUB_SEARCH - GitHub 搜索（必须执行，至少 3 次 web_search）
□ PHASE_4_DEEP_FETCH    - 深度抓取与分类（必须对 GitHub 结果执行 web_fetch）
□ PHASE_5_OUTPUT        - 输出结果（必须包含三分区）
```

---

## 阶段 1：环境检查

**执行命令：**
```bash
node --version
```

**分支：**
- 成功 → 标记 `PHASE_1_ENV_CHECK = ✓`，进入阶段 2
- 失败 → 跳转到【降级方案】

---

## 阶段 2：CLI 搜索（必须执行）

**前置条件：** `PHASE_1_ENV_CHECK = ✓`

**必须执行的 tool call：**
```
execute_command: npx skills find "{英文关键词}"
```

**关键词扩展规则：**
- 中文 → 翻译为英文
- 单词 → 扩展同义词（如：prompt → prompt, template, prompts）
- 领域词 → 添加相关工具名（如：提示词 → prompt, chatgpt, template）

**完成条件：**
- [x] 已执行 `npx skills find` 命令
- [x] 已记录 CLI 返回的 skill 列表（可能为空）

**标记：** `PHASE_2_CLI_SEARCH = ✓`

```
⚠️ 禁止在此阶段输出最终结果！
⚠️ 无论 CLI 是否有结果，必须继续执行阶段 3！
```

---

## 阶段 3：GitHub 搜索（必须执行，硬性要求 ≥3 次）

**前置条件：** `PHASE_2_CLI_SEARCH = ✓`

**必须执行的 tool calls（同一批次并行发送）：**

```
┌────────────────────────────────────────────────────────────────────┐
│ 以下 4 个 web_search 必须在【同一个 tool call 批次】中并行执行：  │
└────────────────────────────────────────────────────────────────────┘

web_search #1 (精确搜): "github {关键词} repository stars"
web_search #2 (合集搜): "github awesome-{关键词} OR awesome {关键词} list"
web_search #3 (工具搜): "github {工具名} {关键词} library collection"
web_search #4 (Skill搜): "site:github.com SKILL.md {关键词}"
```

**搜索词模板示例：**

| 用户输入 | web_search #1 | web_search #2 | web_search #3 | web_search #4 |
|---------|--------------|---------------|---------------|---------------|
| 提示词 | github prompt repository stars | github awesome-prompts OR awesome prompt list | github chatgpt prompt library collection | site:github.com SKILL.md prompt |
| SQL | github sql repository stars | github awesome-sql OR awesome sql list | github sql query builder library | site:github.com SKILL.md sql |
| 视频剪辑 | github video editing repository stars | github awesome-video OR awesome video-editing list | github ffmpeg video editor library | site:github.com SKILL.md video |

**完成条件：**
- [x] 已执行 ≥3 次 web_search（4 次更佳）
- [x] 已从搜索结果中识别出 GitHub 仓库 URL

**标记：** `PHASE_3_GITHUB_SEARCH = ✓`

```
⚠️ 禁止在此阶段输出最终结果！
⚠️ 必须继续执行阶段 4 的 web_fetch！
```

---

## 阶段 4：深度抓取与分类（必须执行）

**前置条件：** `PHASE_3_GITHUB_SEARCH = ✓`

**必须执行的操作：**

从阶段 3 的搜索结果中，选择 TOP 1-3 个高价值 GitHub 仓库，执行 `web_fetch`：

```
web_fetch:
  url: "https://github.com/{owner}/{repo}"
  fetchInfo: "获取仓库描述、stars、主要功能、是否包含 SKILL.md 文件"
```

**优先抓取顺序：**
1. Stars 数量高的仓库（如 >10k stars）
2. 名称包含 `awesome-` 的合集仓库
3. 包含 `SKILL.md` 的独立 skill 仓库
4. 与用户关键词高度相关的专业仓库

**⛔ 必须判断并分类：**

```
┌────────────────────────────────────────────────────────────────────┐
│ 判断是否为 Skill 的标准：                                          │
│                                                                    │
│ ✅ 是 Skill（满足任一条件）：                                      │
│    - 仓库包含 SKILL.md 文件                                        │
│    - 仓库路径包含 .claude/skills/ 或 skills/ 目录结构              │
│    - 仓库在 skills.sh 索引中（来自 CLI 搜索结果）                  │
│    - README 明确说明是 "Claude Code Skill" 或 "Agent Skill"        │
│                                                                    │
│ ⚠️ 非 Skill（普通开源项目）：                                      │
│    - 不满足上述条件的仓库                                          │
│    - 但可能与用户需求高度相关，适合封装成 Skill                    │
└────────────────────────────────────────────────────────────────────┘
```

**分类存储结果：**
```
skill_list = []      # 存放真正的 Skill
project_list = []    # 存放普通开源项目
```

**完成条件：**
- [x] 已对至少 1 个 GitHub 仓库执行 web_fetch
- [x] 已提取仓库的 stars、描述、核心功能
- [x] 已判断每个仓库是否为 Skill 并分类

**标记：** `PHASE_4_DEEP_FETCH = ✓`

---

## 阶段 5：输出结果（强制三分区格式）

**前置条件：** 以下全部为 ✓
- `PHASE_2_CLI_SEARCH = ✓`
- `PHASE_3_GITHUB_SEARCH = ✓`
- `PHASE_4_DEEP_FETCH = ✓`

**强制输出格式（必须包含三个分区）：**

```markdown
找到 N 个关于 "{关键词}" 的资源：

## 📦 来自 skills.sh (CLI) - 可直接安装

| # | Skill | 安装命令 |
|---|-------|---------|
| 1 | {owner/repo@skill} | `npx skills add {owner/repo@skill}` |

<!-- 如果 CLI 无结果，必须写：-->
<!-- _CLI 未找到相关 skill_ -->

## ✅ GitHub 上的 Skill - 可直接安装

| # | 项目 | ⭐ Stars | 说明 | 安装命令 |
|---|-----|---------|-----|---------|
| 2 | {owner/repo} | ⭐ {数量} | {描述} | `npx skills add {owner/repo}` |

<!-- 如果 GitHub 无 Skill，必须写：-->
<!-- _GitHub 未找到相关 skill 仓库_ -->

## ⚠️ 相关开源项目 - 非 Skill（可自行封装）

| # | 项目 | ⭐ Stars | 说明 | 封装建议 |
|---|-----|---------|-----|---------|
| 3 | {owner/repo} | ⭐ {数量} | {描述} | 该项目可作为封装 skill 的基础，建议使用 skill-creator 进行封装 |

<!-- 如果无相关项目，必须写：-->
<!-- _无相关开源项目_ -->

---

💡 提示：带 ✅ 的是真正的 Skill，可直接安装；带 ⚠️ 的是普通项目，如需使用需自行封装成 Skill。
```

**输出前强制校验（必须全部通过）：**

```
□ 输出包含 "## 📦 来自 skills.sh" 分区？ → 必须有
□ 输出包含 "## ✅ GitHub 上的 Skill" 分区？ → 必须有
□ 输出包含 "## ⚠️ 相关开源项目" 分区？ → 必须有
□ 至少执行了 3 次 web_search？ → 必须是
□ 至少执行了 1 次 web_fetch？ → 必须是
□ 已对抓取的仓库进行 Skill/非Skill 分类？ → 必须是
```

**如果任一项未通过，禁止输出，返回补充执行缺失步骤。**

---

## 降级方案（无 Node.js）

**告知用户：**
```
未安装 Node.js。请选择：

1. **安装 Node.js**（推荐，完整功能）
   - macOS: `brew install node`
   - Ubuntu: `sudo apt install nodejs npm`
   - Windows: https://nodejs.org

2. **继续使用网页搜索**（功能受限但可用）

选择哪个？
```

**如果选择 2**，执行以下搜索（跳过 CLI，直接执行阶段 3-4）：

```
web_search #1: "skills.sh {英文关键词} skill"
web_search #2: "github claude code skill {英文关键词}"
web_search #3: "github awesome-{关键词} list"
```

从搜索结果中提取 GitHub URL，然后执行 `web_fetch` 获取详情，判断是否为 Skill 并分类，最后输出三分区结果。

---

## 安装流程

### 确认安装位置

**默认安装到 Claude Code：**
```
即将安装 {skill-name} 到：
  → {project_path}/.claude/skills/{skill-name}/

确认安装？(y/n)
```

### 执行安装

**推荐方式 - 手动 git clone：**
```bash
# 克隆到临时目录
git clone --depth 1 https://github.com/{owner}/{repo}.git /tmp/{repo}

# 创建 skill 目录
mkdir -p .claude/skills/{skill-name}

# 复制文件（检查 SKILL.md 位置）
if [ -f /tmp/{repo}/SKILL.md ]; then
  cp /tmp/{repo}/SKILL.md .claude/skills/{skill-name}/
elif [ -f /tmp/{repo}/dist/skills/{skill-name}/SKILL.md ]; then
  cp -r /tmp/{repo}/dist/skills/{skill-name}/* .claude/skills/{skill-name}/
elif [ -f /tmp/{repo}/skills/{skill-name}/SKILL.md ]; then
  cp -r /tmp/{repo}/skills/{skill-name}/* .claude/skills/{skill-name}/
elif [ -f /tmp/{repo}/.claude/skills/{skill-name}/SKILL.md ]; then
  cp -r /tmp/{repo}/.claude/skills/{skill-name}/* .claude/skills/{skill-name}/
fi

# 复制附加文件
cp -r /tmp/{repo}/scripts .claude/skills/{skill-name}/ 2>/dev/null
cp -r /tmp/{repo}/data .claude/skills/{skill-name}/ 2>/dev/null
cp -r /tmp/{repo}/references .claude/skills/{skill-name}/ 2>/dev/null

# 清理
rm -rf /tmp/{repo}
```

**备选方式 - npx skills add：**
```bash
npx skills add {owner/repo} -y
```

### 验证安装
```bash
ls -la .claude/skills/{skill-name}/
cat .claude/skills/{skill-name}/SKILL.md | head -10
```

---

## 快速参考

### 常用命令（npx skills）

| 命令 | 功能 |
|-----|-----|
| `npx skills find {关键词}` | 搜索 skills |
| `npx skills add {repo} -y` | 安装（会创建 symlink，多平台） |
| `npx skills add {repo} -g` | 全局安装 |
| `npx skills add {repo} -l` | 列出仓库中的 skills |
| `npx skills check` | 检查更新 |
| `npx skills update` | 更新全部 |

### 常见问题排查

| 问题 | 解决方案 |
|-----|---------|
| npx 未找到 | 安装 Node.js 或使用手动 git clone 方法 |
| 无搜索结果 | 尝试英文关键词、更宽泛的词、相关工具名 |
| 安装失败 | 检查网络；尝试手动 git clone |
| Skill 不工作 | 重启 IDE；检查路径是否正确 |
| SKILL.md 位置错误 | 检查仓库结构，可能在 `dist/skills/`、`skills/` 或 `.claude/skills/` 子目录中 |
| symlink 问题 | 使用手动 git clone 方式替代 npx skills add |

---

## 相关资源

- 浏览所有 skills: https://skills.sh
- 创建自己的 skill: 使用 **skill-creator** skill
