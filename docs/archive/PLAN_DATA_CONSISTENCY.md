# 数据一致性自动检查脚本方案

> 对应 TODO #2，待执行。

## 背景

项目中有多种数据文件（卡包配置、卡片数据、image map、价格、图片文件）互相引用，人工维护容易出现遗漏。需要一个自动化脚本在提交前或手动运行时，快速发现数据不一致问题。

现有 `tools/check_missing_images.py` 只检查 LOCR 一个卡包的缺图情况，且路径已过时（仍指向旧的 `data/ocg/locr_image_map.json`），需要一个通用的全量检查脚本。

---

## 方案：新建 `tools/check_data_consistency.py`

一个 Python 脚本，从 `packs.json` 读取所有卡包配置，自动校验 4 类数据一致性，输出报告。

### 检查项

#### 1. packs.json 文件引用检查
- `cardFile` → `data/ocg/cards/{cardFile}` 是否存在
- `imageMapFile` → `data/ocg/image_maps/{imageMapFile}` 是否存在
- `localImagesDir` → 目录是否存在
- `supplementPackFile` → `data/ocg/cards/{file}` 是否存在
- `supplementImageMapFile` → `data/ocg/image_maps/{file}` 是否存在
- `supplementImagesDir` → 目录是否存在

#### 2. image map 与图片文件交叉校验
对每个 image map：
- image map 中引用的每个文件名，在对应 `localImagesDir` 中是否存在（**幽灵引用**）
- `localImagesDir` 中的每个 .webp 文件，是否被 image map 引用（**孤儿文件**）
- 报告级别：幽灵引用 = ERROR，孤儿文件 = WARNING

#### 3. 卡片数据与 image map 交叉校验
对每个卡包的 cardFile：
- cardIds 中每个 setNumber 是否在对应 image map 中有条目（**缺图卡片**）
- image map 中每个 key 是否在 cardIds 的 setNumber 中存在（**多余条目**）
- 辅助包同理（supplementPackFile ↔ supplementImageMapFile）

#### 4. 价格文件与卡片数据交叉校验
- 扫描 `data/ocg/prices/` 下所有 `*_prices.json`
- 价格文件中每个 key 是否在某个卡包的 cardIds setNumber 中存在（**多余价格条目**）
- 每个卡包的 cardIds setNumber 是否在对应价格文件中有条目（**缺价格卡片**，WARNING 级别——新卡可能暂无价格）

### 输出格式

```
============================================================
数据一致性检查报告
============================================================

✅ packs.json 文件引用检查 — 全部通过（3 个卡包 + 3 个辅助包）

⚠️ image map ↔ 图片文件交叉校验
  LOCR:
    WARNING: 孤儿文件 2 个（图片目录中存在但 image map 未引用）
      - LOCR-JP001_UR-OF_official_render_art_0.webp
      - LOCR-JP001_UR-OF_official_render_art_1.webp

✅ 卡片数据 ↔ image map 交叉校验 — 全部通过

✅ 价格文件 ↔ 卡片数据交叉校验 — 全部通过

============================================================
汇总：0 ERROR, 2 WARNING
============================================================
```

### 退出码
- `0`：无 ERROR（可能有 WARNING）
- `1`：有 ERROR

### 关键文件

| 文件 | 作用 |
|------|------|
| `tools/check_data_consistency.py` | **新建**，主检查脚本 |
| `data/ocg/packs.json` | 数据源：卡包配置，所有文件引用的起点 |
| `data/ocg/image_maps/*.json` | 校验对象：image map |
| `data/ocg/cards/*.json` | 校验对象：卡片数据 |
| `data/ocg/prices/*.json` | 校验对象：价格文件 |
| `data/ocg/images/*/` | 校验对象：图片目录 |
| `tools/check_missing_images.py` | 删除（功能被新脚本覆盖且路径已过时） |

### 价格文件与卡包的映射关系

直接收集所有卡包+辅助包的 setNumber 集合，与所有价格文件的 key 集合做交叉比对（无需硬编码映射关系）。

---

## 验证计划

1. 运行脚本：`PYTHONIOENCODING=utf-8 local/venv/Scripts/python.exe tools/check_data_consistency.py`
2. 预期结果：当前数据应该基本通过，可能有少量 WARNING（如 LOCR 的带后缀孤儿文件）
3. 人为制造错误（如临时删除一个 image map 条目）验证 ERROR 检测
4. 确认退出码正确（0 = 无 ERROR，1 = 有 ERROR）
