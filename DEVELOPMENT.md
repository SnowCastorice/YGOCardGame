# AI 协作开发指南

> 本文件记录 CLAUDE.md 未覆盖的设备特定信息。核心开发规范、架构、命令等请参阅 [CLAUDE.md](CLAUDE.md)。

## 🔖 当前版本：v1.7.8（2026-03-21）

最新变更：LOSP 拆分 + LOCR 临时密码兼容 + GMR-OF 价格规则。详见 [CHANGELOG.md](docs/CHANGELOG.md)。

> **📌 规则：DEVELOPMENT.md 不记录近期更新，所有变更统一记录到 [CHANGELOG.md](docs/CHANGELOG.md)。**

## 🐍 双设备 OCR 环境

项目在两台设备上交替开发，虚拟环境路径统一为 `local/venv/`。

| | 设备 A | 设备 B |
|---|---|---|
| **用户名** | `chihayadu` | `snow9` |
| **GPU** | RTX 4060 (8GB VRAM) | RTX 3070 (8GB VRAM) |
| **Python** | 3.11 | 3.11 |
| **PaddlePaddle-GPU** | 3.0.0 (CUDA 12.6) | 3.0.0 (CUDA 12.6) |
| **PaddleOCR** | 3.4.0 | 3.4.0 |

> 虚拟环境目录 `local/` 在 `.gitignore` 中，不会被提交。每台设备需各自安装依赖。

## 🔌 PaddleOCR MCP Server（仅设备 A）

- **功能**：让 AI 编辑器直接调用本地 OCR 能力识别图片中的文字
- **配置文件**：`C:\Users\chihayadu\.gongfeng-copilot\mcp.json`（服务名: `paddleocr`）
- **启动方式**：CodeBuddy 自动通过 STDIO 模式管理进程，使用 GPU 加速
- **包版本**：`paddleocr-mcp 0.5.0`（pip 安装在 local/venv 中）
- **验证**：重启 CodeBuddy 后，MCP 工具列表中应出现 PaddleOCR 相关工具
- **设备 B 不配置此 MCP**，OCR 工作流通过命令行脚本执行即可

## 📚 文档索引

| 文档 | 内容 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | **主指引**：开发规范、架构、命令、Hooks 等 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 近期变更记录 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 数据源架构、API 限流、服务端代理、文件结构 |
| [docs/FEATURES.md](docs/FEATURES.md) | 背包系统、卡片预览/图鉴、货币系统、开包系统 |
| [docs/TOOLS.md](docs/TOOLS.md) | Python 工具脚本使用说明 |
| [docs/TODO.md](docs/TODO.md) | 待办事项与路线图 |
| [docs/SETUP.md](docs/SETUP.md) | 新设备配置 Claude Code 指南 |
