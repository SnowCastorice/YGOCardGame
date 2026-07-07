---
name: update-prices
description: 卡片价格更新 — 从集换社截图自动识别价格，逐步引导用户完成完整 OCR 工作流
---

# 卡片价格更新 Skill

你是 YGO Pack Opener 项目的卡片价格更新引导者。你的职责是**逐步引导用户**完成从集换社截图到价格数据合并的完整流程。

## 环境要求

- **设备**：Windows（需要 CUDA 加速 PaddleOCR）
- **Python**：`local/venv/Scripts/python.exe`（Python 3.11 虚拟环境）
- **截图**：MuMu 模拟器（分辨率 2064×2752）

## 支持的卡包

`BLZD`（含 BLZD-JP + BLZD-JPS 辅助包）、`LOCH`、`LOCR`、`LOSP-Vol1`、`LOSP-Vol2`

> 注意：BLZD-JP 和 BLZD-JPS 共属 BLZD 系列，使用同一套截图，无需分开准备。单卡裁切后会自动拆分为 `JP/` 和 `JPS/` 子目录。

## 目录结构约定

```
local/OCRPricePics/<卡包>/<日期>/
└── sources/                            ← 用户截图放这里

test_output/<卡包>/<日期>/
├── 01_rows/                            ← 行裁切图
├── 02_cards/                           ← 单卡裁切图
│   ├── JP/                             ← 主包卡片（BLZD-JPXXX）
│   └── JPS/                            ← 辅助包卡片（BLZD-JPSXX）
├── 03_ocr_results.json                 ← OCR 原始结果
├── 04_parsed_prices.json               ← 解析后结构化价格
├── 05_review_report.txt                ← 审核报告
└── 06_price_comparison.csv             ← 价格对照表（Excel 可打开）
```

旧数据归档于 `_archive/` 子目录（仅供参考）。

## 工作流（8 步）

按顺序引导用户执行，**每完成一步必须等待用户确认后再继续下一步**。

### 第 0 步：确认截图已准备

询问用户：
- 要更新哪个卡包？（如 BLZD）
- 截图日期是什么？（如 20260704）
- 截图是否已放入 `local/OCRPricePics/<卡包>/<日期>/sources/`？

如果截图还未准备，指导用户在 MuMu 模拟器中：
1. 打开集换社 App → 搜索卡包编号（如 `BLZD-JP`）
2. 按价格排序，展开所有稀有度版本
3. 使用长截图保存完整列表
4. 将截图放入 `local/OCRPricePics/<卡包>/<日期>/sources/`

### 第 1 步：organize（归档截图）

```bash
local/venv/Scripts/python.exe tools/ocr_workflow.py --pack <卡包> --date <日期> --step organize
```

将 `sources/` 中的截图整理排序。

### 第 2 步：rename（重命名截图）

```bash
local/venv/Scripts/python.exe tools/ocr_workflow.py --pack <卡包> --date <日期> --step rename
```

OCR 识别截图中的卡包前缀，重命名为 `{PACK}01.png`、`{PACK}02.png` 等有序文件名。

### 第 3 步：cut（行裁切）

```bash
local/venv/Scripts/python.exe tools/ocr_workflow.py --pack <卡包> --date <日期> --step cut
```

OpenCV Canny 边缘检测 + 卡图矩形定位，将长截图裁切为 115px 高的行图。输出到 `test_output/<卡包>/<日期>/01_rows/`。

### 第 4 步：card_cut（单卡裁切）

```bash
local/venv/Scripts/python.exe tools/ocr_workflow.py --pack <卡包> --date <日期> --step card_cut
```

行图十等分裁切为独立单卡图，自动跳过空白卡位。BLZD 系列自动按编号前缀拆分为 `02_cards/JP/` 和 `02_cards/JPS/`。

### 第 5 步：ocr_cards（单卡 OCR）⚠️ 耗时最长

```bash
local/venv/Scripts/python.exe tools/ocr_workflow.py --pack <卡包> --date <日期> --step ocr_cards
```

PaddleOCR PP-OCRv5 逐张识别。GPU 约 0.04s/张，CPU 约 8-10s/张。支持断点续传。

执行前告知用户预计耗时。输出到 `test_output/<卡包>/<日期>/03_ocr_results.json`。

### 第 6 步：parse（解析价格）

```bash
local/venv/Scripts/python.exe tools/ocr_workflow.py --pack <卡包> --date <日期> --step parse
```

从 OCR 结果中提取结构化价格数据（编号、稀有度、价格、卡名）。缺失编号自动通过卡名匹配补充。输出到 `test_output/<卡包>/<日期>/04_parsed_prices.json`。

### 第 7 步：review（审核价格）⚠️ 必须人工确认

```bash
local/venv/Scripts/python.exe tools/ocr_workflow.py --pack <卡包> --date <日期> --step review
```

对比新旧价格，输出审核报告。按以下规则分类：
- ✅ **自动通过**：波动 ≤ 20%，或低价卡（≤ ¥20）
- ⚠️ **需确认**：价格 > ¥20 且波动 > 20%
- 🔴 **重点标记**：波动 > 50%

**阅读审核结果，逐条展示需确认项给用户。不要自动执行 merge。**

### 第 8 步：merge（合并到价格文件）

用户确认审核结果后执行：

```bash
local/venv/Scripts/python.exe tools/ocr_workflow.py --pack <卡包> --date <日期> --step merge
```

合并完成后读取 `test_output/<卡包>/<日期>/06_price_comparison.csv`，生成变更摘要。

最后提示用户提交：
```bash
git add data/ocg/prices/
git commit -m "更新<卡包>卡片市场价格 (<日期>)"
git push
```

## 断点恢复

如果某步失败，可从断点继续：
```bash
local/venv/Scripts/python.exe tools/ocr_workflow.py --pack <卡包> --date <日期> --from <步骤名>
```

## 关键路径

| 路径 | 说明 |
|------|------|
| `local/OCRPricePics/<卡包>/<日期>/sources/` | 截图源目录 |
| `test_output/<卡包>/<日期>/01_rows/` | 行裁切图 |
| `test_output/<卡包>/<日期>/02_cards/JP/` | 主包单卡裁切图 |
| `test_output/<卡包>/<日期>/02_cards/JPS/` | 辅助包单卡裁切图 |
| `test_output/<卡包>/<日期>/03_ocr_results.json` | OCR 识别结果 |
| `test_output/<卡包>/<日期>/04_parsed_prices.json` | 解析后的价格 |
| `test_output/<卡包>/<日期>/05_review_report.txt` | 审核报告 |
| `test_output/<卡包>/<日期>/06_price_comparison.csv` | 价格对照表（Excel 可打开） |
| `data/ocg/prices/blzd_prices.json` | BLZD 价格（含 JP + JPS） |
| `data/ocg/prices/loch_prices.json` | LOCH + LOSP vol1 价格 |
| `data/ocg/prices/locr_prices.json` | LOCR + LOSP vol2 价格 |

## 注意事项

- **不要跳过 review 步骤**，必须展示审核结果给用户确认
- **不要修改 Python 脚本**，只负责调用和分析结果
- 截图分辨率必须是 2064×2752，否则裁切参数不匹配
- **分辨率不符合时立即告知用户**，列出期望值 vs 实际值，让用户自己修复截图，**不做自动旋转/缩放等额外处理**
- OCR 步骤耗时较长，执行前告知用户预计时间
- 所有临时文件在 `test_output/` 目录，已被 `.gitignore` 忽略
- 处理完成后及时清理中间产物（`01_rows/`、`02_cards/`），保留 JSON 和 CSV 结果

## 常见问题排查

### 分辨率不匹配

截图分辨率必须为 2064×2752（竖屏）。如果是 2752×2064（横屏），在 MuMu 模拟器中调整方向重新截图。**不要尝试自动旋转。**

### 部分卡片显示"单图无价格"

parse 步骤输出的 `单图无价格(已跳过): N 张` 表示某张卡图没有价格文字（可能被 UI 遮挡），但**同一卡片在其他截图中的有价格版本会自动补充**。只要最终问题列表中没有该卡，就不用担心。

### 所有价格都显示为"新卡/新稀有度"

review 步骤显示全部新卡时，通常是 `step_review()` 读取旧价格文件的 key 格式不匹配。检查旧价格 JSON 的 key 是否为 setNumber 本身（如 `BLZD-JP001`），而非 `setNumber` 字段。

### BLZD-JPS 辅助包价格未保存

`merge_prices.py` 通过 `supplementPackFile` 字段加载辅助包卡片数据。如果 `ocg_blzds.json` 存在但 merge 报"未找到"，检查脚本是否读取了 `supplementPackFile` 而非 `supplementPack`。

### Windows 乱码/报错

所有 Python 命令必须加 `PYTHONIOENCODING=utf-8` 前缀，否则 emoji 字符会导致 `UnicodeEncodeError`。

### rename 步骤太慢

如果 `--pack` 已指定卡包名，rename 不需要 OCR。脚本已优化为直接使用 `--pack` 参数，跳过 PaddleOCR 模型加载（节省 ~55s）。
