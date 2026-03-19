# AI 协作开发指南

> **每次新会话开始时，AI 助手必须先阅读本文件。**
> **每次对话结束后，如有重要变更须同步更新本文件或对应子文档。**

## 🔖 当前版本：v1.7.6（2026-03-11）

最新变更：NR 价格修复 + 工作流文档全面更新。详见 [CHANGELOG.md](docs/CHANGELOG.md)。

> **📌 规则：DEVELOPMENT.md 不记录近期更新，所有变更统一记录到 [CHANGELOG.md](docs/CHANGELOG.md)。**

### 🐍 Python OCR 工具环境
- **虚拟环境**：`tools/venv/`（Python 3.11 + PaddlePaddle-GPU 3.0.0 CUDA 12.6 + PaddleOCR 3.4.0）
- **GPU 加速**：RTX 4060 (8GB VRAM)，每段识别 ~1 秒（CPU 约 8-10 秒/段，提速约 8x）
- **一键工作流**：`tools/venv/Scripts/python.exe tools/ocr_workflow.py <日期>`（推荐）
- **单独调用**：`tools/venv/Scripts/python.exe tools/ocr_price.py <截图路径> --output <输出JSON>`
- **注意**：PaddleOCR 不支持 Python 3.14，必须使用 3.11 虚拟环境运行

### 🔌 PaddleOCR MCP Server（2026-03-04 新增）
- **功能**：让 AI 编辑器直接调用本地 OCR 能力识别图片中的文字
- **配置文件**：`C:\Users\chihayadu\.gongfeng-copilot\mcp.json`（服务名: `paddleocr`）
- **启动方式**：CodeBuddy 自动通过 STDIO 模式管理进程，使用 GPU 加速
- **包版本**：`paddleocr-mcp 0.5.0`（pip 安装在 tools/venv 中）
- **验证**：重启 CodeBuddy 后，MCP 工具列表中应出现 PaddleOCR 相关工具

## 📚 文档索引

| 文档 | 内容 |
|------|------|
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 近期变更记录 + 待处理事项 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 数据源架构、API 限流、服务端代理、文件结构 |
| [docs/FEATURES.md](docs/FEATURES.md) | 背包系统、卡片预览/图鉴、货币系统、开包系统 |
| [docs/TOOLS.md](docs/TOOLS.md) | Python 工具脚本使用说明 |

---

## 👤 关于我

- **游戏策划**，代码水平较低，请用通俗易懂的语言沟通
- 愿意尝试新技术，但需要清晰的分步指引
- 可能在不同设备和不同 AI 模型之间切换，代码注释需清晰明了

## 💻 开发环境

- **默认终端**：Git Bash（使用 Bash 语法，非 PowerShell / CMD）
- **调试设备**：Chrome DevTools 模拟 Xiaomi 14（400×890）
- **临时文件**：截图/日志等必须保存到 `test_output/` 目录，严禁保存到桌面

## 🔗 项目信息

- **GitHub**：https://github.com/SnowCastorice/YGOCardGame
- **线上地址**：https://ygocardgame.pages.dev/
- **部署**：Cloudflare Pages（静态页面 + Functions API + KV 存储）
- **管理后台**：`/admin/stats.html`（在设置面板中连续点击标题5次解锁入口）
- **设置面板**（原「开发者工具」）：默认显示快捷操作、缓存管理两个板块；连点标题5次可解锁 CDN 卡图对比、管理后台入口等隐藏板块

---

## 🌿 分支管理规范

| 分支 | 用途 | 说明 |
|------|------|------|
| `main` | 线上稳定版 | Cloudflare Pages 监听此分支自动部署，只接受已测试通过的代码 |
| `dev` | 日常开发 | 所有新功能、bug 修复、价格更新等都在此分支进行 |

### 工作流程

```
1. 在 dev 分支上开发 → git checkout dev
2. 提交代码 → git add . && git commit -m "描述"
3. 推送到 dev（线上不受影响）→ git push
4. 测试通过 + 用户确认后，合并到 main 上线：
   git checkout main
   git merge dev
   git push
5. 切回 dev 继续开发 → git checkout dev
```

### 注意事项
- **日常开发始终在 `dev` 分支上进行**，不要直接在 `main` 上修改
- 合并到 `main` 前必须遵循发布流程（本地测试 → 展示确认 → 推送上线）
- push 到 `dev` 不会触发线上部署，可以放心提交半成品代码

---

## 📋 开发规范（必读）

### 基础规范
1. **版本管理**：每次提交维护版本记录
2. **更新日志**：网页内呈现更新日志（`data/changelog.json`）
3. **代码注释**：使用中文，简洁清晰
4. **Git 提交**：提交信息使用中文
5. **执行前规划**：所有任务执行前必须先列出规划方案，等待用户确认后才可执行（简单任务或用户明确允许的除外）

### 📁 临时文件管理规范
> **严禁随意创建文件夹或在任意位置生成临时文件。**

1. **统一临时目录**：所有临时文件（OCR 中间产物、调试截图、日志、测试脚本等）必须保存到 `test_output/` 目录
2. **禁止随意建目录**：不得在项目根目录或其他位置随意创建新文件夹；如确有需要，须选择已有的合理目录
3. **及时清理**：临时文件在使用完毕后必须删除，不得长期残留
4. **工作流清理**：OCR 工作流等批处理任务在开始前应先清理上一次的残留文件，避免历史数据污染
5. **目录已被 Git 忽略**：`test_output/` 在 `.gitignore` 中，不会进入版本控制

### ⚠️ 发布流程（重要！）
> **本项目已上线运营，任何代码推送到 `main` 都会自动部署到线上环境，务必严格遵守以下流程！**

1. **在 dev 分支开发** — 确认在 `dev` 分支上（`git checkout dev`）
2. **本地修改** — 完成代码编辑，提交到 `dev`
3. **本地测试** — 通过浏览器截图 / 脚本验证修改效果正确
4. **展示确认** — 将测试结果展示给用户查看，等待用户确认
5. **合并上线** — 用户确认后：`git checkout main && git merge dev && git push`
6. **切回开发** — `git checkout dev` 继续后续开发

❌ **严禁**：未经测试和用户确认就直接推送代码，避免线上事故

### 资源版本号（缓存破坏）
> 所有资源版本号由 `index.html` 中的 `window.APP_VERSION` 统一控制。
> 更新时**只需修改这一处**，CSS/JS 的 `?v=` 参数和页脚版本号会自动同步。

修改位置（唯一）：
```html
<script>window.APP_VERSION = 'x.x.x';</script>
```

同时记得在 `data/changelog.json` 中添加对应版本的更新日志。

### 设计原则
- **移动端专属**：桌面端与移动端完全一致（居中 `max-width: 500px`）
- **不使用媒体查询**：移动端样式即默认样式
- 使用 `viewport-fit=cover` + `safe-area-inset` 适配刘海屏

### 💰 业务规则
- **金币与人民币 1:1**：游戏内不出现真实货币，统一使用

---

## 🧪 功能自测规范

完成代码后、提交前必须确认：

1. **调用链完整性** — 新函数是否在初始化流程中被调用
2. **DOM 元素存在性** — JS 引用的 ID 是否在 HTML 中存在
3. **CSS 样式生效** — class 名拼写一致、优先级无覆盖
4. **数据字段匹配** — JS 读取的字段与数据源一致
5. **事件委托正确** — `e.target.closest()` 选择器能匹配目标
6. **移动端兼容** — 触摸事件、弹窗关闭等功能正常

---

## 🪝 会话结束 Hooks（必须执行）

> **每次对话结束前，AI 助手必须逐项检查以下 hooks，满足触发条件的必须执行。**
> **跳过任何一项都可能导致文档不同步或版本号混乱，这是严重的遗漏。**

| # | Hook 名称 | 检查内容 | 触发条件 |
|---|----------|---------|----------|
| 1 | **CHANGELOG 同步** | 本次会话的所有代码/文档变更已记录到 `docs/CHANGELOG.md` 对应版本中 | 任何代码或文档被修改 |
| 2 | **changelog.json 同步** | `data/changelog.json` 已同步更新（若版本号变更） | 版本号发生变化 |
| 3 | **版本号三处一致** | `APP_VERSION`（index.html）、`changelog.json`、`CHANGELOG.md` 三处版本号一致 | 版本号发生变化 |
### 执行流程

```
会话即将结束
  │
  ├─ 本次是否有代码/文档变更？
  │   ├─ 是 → 执行 Hook 1（CHANGELOG 同步）
  │   └─ 否 → 跳过
  │
  └─ 本次是否有版本号变更？
      ├─ 是 → 执行 Hook 2（changelog.json 同步）
      ├─ 是 → 执行 Hook 3（版本号三处一致检查）
      └─ 否 → 跳过
```

### ⚠️ 常见遗漏提醒
- **最容易遗漏的是 Hook 1**：修改了代码却忘记更新 CHANGELOG，曾发生过三次遗漏
- DEVELOPMENT.md 不记录近期更新，所有变更**只需记录到 CHANGELOG.md**，避免双文件同步导致的遗漏
- 如果本次会话只是回答问题、没有修改任何文件，则所有 hooks 均可跳过
