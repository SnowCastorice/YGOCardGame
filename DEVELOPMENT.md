# AI 协作开发指南

> 本文件记录 CLAUDE.md 未覆盖的设备特定信息。核心开发规范、架构、命令等请参阅 [CLAUDE.md](CLAUDE.md)。

## 🔖 当前版本：v1.7.9（2026-03-26）

最新变更：LOSP 拆分 + LOCR 临时密码兼容 + GMR-OF 价格规则。详见 [CHANGELOG.md](docs/CHANGELOG.md)。

> **📌 规则：DEVELOPMENT.md 不记录近期更新，所有变更统一记录到 [CHANGELOG.md](docs/CHANGELOG.md)。**

## 🐍 双设备 OCR 环境

项目在两台设备上交替开发，OCR 使用系统级 Python 3.11（非虚拟环境）。

| | 设备 A（CHIHAYADU-PC1） | 设备 B |
|---|---|---|
| **OS** | Windows 11 (22631) | 待更新 |
| **GPU** | RTX 4060 (8GB VRAM) | RTX 3070 (8GB VRAM) |
| **NVIDIA 驱动** | 591.74 | 待更新 |
| **CUDA Version** | 13.1 | 待更新 |
| **Python (OCR)** | 3.11.9（系统安装） | 待更新 |
| **PaddlePaddle-GPU** | 3.3.1 (cu126) | 待更新 |
| **PaddleOCR** | 3.4.0 | 待更新 |


### OCR 安装命令（两台设备统一）

```bash
# 1. 安装 PaddlePaddle GPU（通过飞桨官方源，cu126）
python -m pip install paddlepaddle-gpu -i https://www.paddlepaddle.org.cn/packages/stable/cu126/

# 2. 安装 PaddleOCR
python -m pip install paddleocr

# 3. 验证
python -c "import paddle; print(paddle.__version__, 'CUDA:', paddle.is_compiled_with_cuda())"
python -c "import paddleocr; print(paddleocr.__version__)"
```

> ⚠️ PaddlePaddle GPU 版必须通过飞桨官方源安装（PyPI 默认源只有 2.x 旧版）
> ⚠️ OCR 使用系统级 Python 3.11，不使用 local/venv/（那个是 3.14，不兼容 PaddleOCR）

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
