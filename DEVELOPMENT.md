# AI 协作开发指南

> **每次新会话开始时，AI 助手必须先阅读本文件。**
> **每次对话结束后，如有重要变更须同步更新本文件或对应子文档。**

## � 文档索引

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
- **部署**：Cloudflare Pages（纯静态部署）

---

## 📋 开发规范（必读）

### 基础规范
1. **版本管理**：每次提交维护版本记录
2. **更新日志**：网页内呈现更新日志（`data/changelog.json`）
3. **代码注释**：使用中文，简洁清晰
4. **Git 提交**：提交信息使用中文

### 资源版本号（缓存破坏）
> ⚠️ 每次更新 JS/CSS 后，**必须同步更新** `index.html` 中所有 `?v=` 版本号，否则浏览器缓存旧文件。

需更新位置：
- `<link>` 标签的 CSS 引用
- `<script>` 标签的 JS 引用
- 页脚版本号文字

### 设计原则
- **移动端专属**：桌面端与移动端完全一致（居中 `max-width: 500px`）
- **不使用媒体查询**：移动端样式即默认样式
- 使用 `viewport-fit=cover` + `safe-area-inset` 适配刘海屏

---

## 🧪 功能自测规范

完成代码后、提交前必须确认：

1. **调用链完整性** — 新函数是否在初始化流程中被调用
2. **DOM 元素存在性** — JS 引用的 ID 是否在 HTML 中存在
3. **CSS 样式生效** — class 名拼写一致、优先级无覆盖
4. **数据字段匹配** — JS 读取的字段与数据源一致
5. **事件委托正确** — `e.target.closest()` 选择器能匹配目标
6. **移动端兼容** — 触摸事件、弹窗关闭等功能正常
