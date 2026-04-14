# YGOCardGame 项目数据一致性检查 - 探索报告

## 1. Image Map 与图片目录的关系

### 1.1 Image Maps 文件
**位置**: `data/ocg/image_maps/`

| 文件名 | 卡包代码 | 卡片数 | 说明 |
|--------|---------|--------|------|
| `blzd_image_map.json` | BLZD | 80张 | 炽热支配补充包 |
| `blzds_image_map.json` | BLZDS | - | 炽热支配辅助包 |
| `loch_image_map.json` | LOCH | 80张 | 界限超越典藏包-主角篇 |
| `locr_image_map.json` | LOCR | 80张 | 界限超越典藏包-对手篇 |
| `losp_vol1_image_map.json` | LOSP-VOL1 | 10张 | LOSP辅助包vol1 |
| `losp_vol2_image_map.json` | LOSP-VOL2 | 10张 | LOSP辅助包vol2 |

### 1.2 Cards Key 格式
**模式**: `{PACK}-{REGION}{NUM}`
- **例子**: `LOCH-JP001`, `BLZD-JP002`, `LOCR-JP080`
- **组成**: PACK (3-5字母) + 分隔符 `-` + REGION (2字母JP) + NUM (3位数字)

### 1.3 localImages 结构
每个稀有度对应文件名数组（按优先级排序）

**常见稀有度**: N, NR, R, SR, UR, SER, UTR, PSER, UR-OF, PSER-OF, GMR-OF

**文件名格式**: `{setNumber}_{rarity}_{source}_{type}.webp`
- 例: `LOCH-JP001_GMR-OF_ygometa_render_art.webp`

**图源优先级**: twitter_photo_art > twitter_render_art > tcgcorner_photo_art > ygojp_render_art > official_render_art > ygometa_render_art

### 1.4 图片目录
**位置**: `data/ocg/images/`

| 子目录 | 对应卡包 | 状态 |
|--------|---------|------|
| `blzd/`, `blzds/`, `loch/`, `locr/`, `losp_vol1/`, `losp_vol2/` | BLZD, BLZDS, LOCH, LOCR, LOSP-VOL1, LOSP-VOL2 | 全部存在 |

---

## 2. 价格文件与卡包数据的关系

### 2.1 价格文件 (data/ocg/prices/)
```
blzd_prices.json, loch_prices.json, locr_prices.json,
losp_vol1_prices.json, losp_vol2_prices.json, price_overrides.json
```

### 2.2 数据结构
**价格JSON**:
```json
{
  "packPrices": { "PACK": { "box": price, "pack": price } },
  "cards": { "PACK-JP001": { "name": "名字", "prices": { "rarity": price } } }
}
```

**卡牌数据JSON** (data/ocg/cards/):
```json
{
  "packId": "ocg_loch",
  "cardIds": [{
    "id": 88570003,
    "setNumber": "LOCH-JP001",
    "rarityVersions": ["UR", "UR-OF", "SER", "PSER-OF", "GMR-OF"],
    "cardData": { /* ... */ }
  }]
}
```

**文件列表** (6个): ocg_loch.json, ocg_locr.json, ocg_blzd.json, ocg_blzds.json, ocg_losp_vol1.json, ocg_losp_vol2.json

---

## 3. packs.json 中引用的文件路径

### 3.1 packs.json 结构 (data/ocg/packs.json)

每个卡包包含这些路径字段:

| 字段 | 值（例LOCH） | 说明 |
|------|-------------|------|
| cardFile | `ocg_loch.json` | 相对于 data/ocg/cards/ |
| imageMapFile | `loch_image_map.json` | 相对于 data/ocg/image_maps/ |
| localImagesDir | `data/ocg/images/loch` | 绝对路径 |
| supplementPackFile | `ocg_losp_vol1.json` | 辅助包数据(可选) |
| supplementImageMapFile | `losp_vol1_image_map.json` | 辅助包映射(可选) |
| supplementImagesDir | `data/ocg/images/losp_vol1` | 辅助包图目录(可选) |

### 3.2 所有卡包配置

**LOCH/LOCR/BLZD**: 各自有主卡包 + 辅助包配置
- LOCH: 补充包 LOSP-VOL1
- LOCR: 补充包 LOSP-VOL2  
- BLZD: 补充包 BLZDS

---

## 4. 现有的 Hooks 和验证脚本

### 4.1 .claude/hooks/ (3个脚本)
- `pre-push-check.sh`: 版本号+日志检查
- `version-check.sh`: 版本号一致性（4处）
- `pre-compact.sh`: 压缩检查

### 4.2 Git Pre-commit Hook
`.git/hooks/pre-commit` 调用 `tools/version-check.sh`

**检查**: APP_VERSION, changelog.json, CHANGELOG.md, README.md 四处版本必须一致

**排除**: .claude/*, data/ocg/prices/*, tools/*, docs/CHANGELOG.md等

### 4.3 验证脚本 (tools/)

| 脚本 | 功能 |
|------|------|
| `rebuild_image_maps.py` | 从 images/ 扫描卡图生成 image_map.json |
| `check_missing_images.py` | 检查缺失卡图，生成报告 |
| `extract_prices.py` | 解析卡价数据 |
| `migrate_card_images.py` | 迁移卡图文件 |
| `migrate_price_keys.py` | 转换价格文件key |

**rebuild_image_maps.py流程**:
1. 扫描 data/ocg/images/{pack}/*.webp
2. 解析文件名提取 setNumber, rarity, source
3. 按图源优先级排序
4. 生成 localImages 格式的 image_map.json

**check_missing_images.py流程**:
1. 加载 cards.json (cardIds[].setNumber, rarityVersions)
2. 加载 image_map.json (cards[setNumber].localImages)
3. 检查每个 rarity 是否有对应卡图
4. 支持 fallback 链（优先级链）
5. 生成 local/missing_images_report.txt

---

## 5. 数据一致性关键约束

| 约束 | 说明 |
|------|------|
| **setNumber格式** | 必须 `{PACK}-{REGION}{NUM}` (如LOCH-JP001) |
| **setNumber存在性** | cardIds[].setNumber 应在 image_map.cards 和 prices.cards 中都存在 |
| **rarityVersions覆盖** | 每个rarity应在localImages中存在或可fallback |
| **文件路径** | cardFile, imageMapFile, localImagesDir 必须存在 |
| **图片文件存在** | localImages[rarity]中的filename应对应存在 |
| **补充包一致** | supplementPackFile等路径应指向存在的文件 |

---

## 6. 统计数据

- 主卡包: 3个 (LOCH, LOCR, BLZD)
- 辅助包: 2个 (LOSP-VOL1, LOSP-VOL2)
- 卡牌数据文件: 6个
- 卡图映射文件: 6个
- 价格数据文件: 6个
- 图片目录: 6个
- 总卡片数: 320+ 张

