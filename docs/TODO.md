# 📋 YGOCardGame 待办事项

> 本文件只记录待办事项和待解决的技术问题。已完成的工作记录在 [CHANGELOG.md](CHANGELOG.md)。

---

## 🟡 中优先级（降低维护成本 / 改善开发效率）

### 1. 准备自动切割卡图流程
- 避免手动切图效率低下且质量不一的问题
- 建立从原始图片到标准化卡图的自动化 pipeline

### 2. 将卡片价格识别流程提炼为 Claude Code skill
- 将现有的 OCR 工作流（截图裁切 → OCR 识别 → 解析价格 → 智能审核 → 合并 JSON）封装为可复用的 skill
- 参考 `tools/ocr_workflow.py` 和相关脚本，定义清晰的输入/输出接口
- 目标：一键触发即可完成整个价格更新流程，减少手动操作和跨工具切换

## 🔵 低优先级（长期规划 / 条件未满足）

### 3. 优化网页 UI
- 作为大方向记录，具体优化内容待后续细化

### 4. 分析 Cloudflare 日志，优化网页性能
- 基于 Cloudflare 访问日志和性能报告，分析瓶颈
- 针对性优化加载速度、资源体积等

### 5. 探索 MacBook M5 上 PaddleOCR 的可行性
- **背景**：当前 OCR 流程基于 CUDA 加速（NVIDIA GPU），MacBook M5 芯片无法使用 CUDA
- **目标**：调研 PaddleOCR 在 Apple Silicon（M5）上的运行方案
  - 是否支持 MPS（Metal Performance Shaders）加速？
  - 是否有 CoreML / ANE（Apple Neural Engine）后端？
  - 纯 CPU 推理速度是否可接受？
- **参考**：PaddleOCR 官方文档对 Apple Silicon 的支持情况、社区方案

---

## 🔵 已记录的技术问题

### ~~4. 卡图回退链结果缓存优化~~ ✅ v1.11.6 已修复
- 新增 `CARD_IMAGE_FALLBACK_CACHE` Map（api.js），缩略图 onload 自动缓存有效 URL
- 大图加载优先查缓存，避免重复走 404 回退链
