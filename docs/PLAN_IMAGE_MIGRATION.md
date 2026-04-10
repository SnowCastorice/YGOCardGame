# 改造 getCardImageUrl() + 卡图拆分重命名方案

## 背景

TODO #1（原 #2）：部分卡图仍在调用第三方 CDN（如 `cdn.233.momobako.com`、`s3.duellinksmeta.com`）。
目标：所有卡图完全本地化，本地加载失败后直接用 `printing.jpg` 占位图。

同时处理：
- BLZD 卡图需拆分出 BLZDS（辅助包）
- LOCH 卡图需拆分出 LOSP-vol1
- LOCR 卡图需拆分出 LOSP-vol2
- BLZD / LOCH 旧格式卡图（hash 命名 + w200/w420 双尺寸）需要重命名为新规范，只保留 w420

---

## 现状分析

### 三种卡图模式

| 卡包 | image map 格式 | 卡图文件命名 | 尺寸 | 辅助包卡图 |
|------|---------------|------------|------|-----------|
| LOCR | **localImages**（新格式） | `LOCR-JP001_UR_official_render_art.webp` | 仅 420px | LOSP vol2 物理文件在 locr 目录内，但 image map 中无引用 |
| LOCH | **metaId**（旧格式） | `{hash}_w200.webp` / `{hash}_w420.webp` | 200+420 | LOSP vol1 在 image map 中有 metaId，本地无文件 |
| BLZD | **metaId**（旧格式） | `{hash}_w200.webp` / `{hash}_w420.webp` | 200+420 | BLZDS 在 image map 中有 metaId，本地有 hash 文件 |

### 外部 CDN 调用来源（需清理）

1. **metaId 模式**（L795）：S3 CDN `s3.duellinksmeta.com` 作为主图源或 fallback
2. **默认回退**（L804）：YGOCDB CDN `cdn.233.momobako.com` 当 imageMap 中找不到卡时
3. **无 imageMap 时**（L943-944）：辅助包构建中直接用 YGOCDB CDN
4. **onerror fallback**（game.js L44-49）：`handleCardImageError` 中切换到 data-fallback URL

### 关键文件

| 文件 | 作用 |
|------|------|
| `js/api.js` L765-805 | `getCardImageUrl()` 核心函数 |
| `js/api.js` L698 | `MISSING_IMAGE_PLACEHOLDER` 常量 |
| `js/api.js` L720-762 | `resolveLocalImage()` localImages 模式匹配 |
| `js/game.js` L44-57 | `handleCardImageError()` onerror 处理 |
| `data/ocg/loch_image_map.json` | LOCH 卡图映射（metaId 旧格式） |
| `data/ocg/blzd_image_map.json` | BLZD 卡图映射（metaId 旧格式） |
| `data/ocg/locr_image_map.json` | LOCR 卡图映射（localImages 新格式） |
| `data/ocg/images/blzd/` | 200 文件（100 卡 × 2 尺寸） |
| `data/ocg/images/loch/` | 216 文件（108 卡 × 2 尺寸） |
| `data/ocg/images/locr/` | 192 文件（含 LOCR + LOSP vol2 混存） |

---

## 改动清单

### 第 1 步：卡图文件重命名 + 拆分（Python 脚本）

**新建** `tools/migrate_card_images.py`，自动完成：

#### 1a. BLZD 重命名 + 拆分 BLZDS

- 读取 `blzd_image_map.json`，建立 metaId → setNumber 映射
- 遍历 `data/ocg/images/blzd/` 中所有 `{hash}_w420.webp` 文件
- 重命名为 `{setNumber}_UR_ygometa_render_art.webp`（BLZD 所有卡图来源统一为 ygometa）
  - 对于有 altMetaId 的 OF 版本，稀有度改为对应的 OF 稀有度
- 删除所有 `_w200.webp` 文件（只保留 420）
- BLZD-JPS01~JPS20 的文件移到新目录 `data/ocg/images/blzds/`
- 打印报告：重命名数、删除数、拆分数
- 检查是否有只存在 w200 而没有 w420 的卡（通知用户）

#### 1b. LOCH 重命名 + 拆分 LOSP-vol1

- 同理：读取 `loch_image_map.json`，metaId → setNumber
- 重命名 `_w420.webp` → 新规范命名
- 删除 `_w200.webp`
- LOSP-JP001~JP010 的文件移到 `data/ocg/images/losp_vol1/`
- **注意**：LOSP vol1 在 LOCH 本地目录中可能没有文件（目前只有 metaId 指向 CDN）。如果缺文件需通知用户。

#### 1c. LOCR 拆分 LOSP-vol2

- LOCR 的文件命名已经是新规范，只需拆分
- 将 `LOSP-JP011~020` 开头的文件从 `data/ocg/images/locr/` 移到 `data/ocg/images/losp_vol2/`

### 第 2 步：重建 image map 文件

所有 image map 统一改为 **localImages 格式**（LOCR 已经是这个格式）。

#### 2a. 重建 `loch_image_map.json`

```json
{
  "cards": {
    "88570003": {
      "setNumber": "LOCH-JP001",
      "name": "...",
      "localImages": {
        "UR": "LOCH-JP001_UR_ygometa_render_art.webp",
        "UR-OF": "LOCH-JP001_UR-OF_ygometa_render_art.webp",
        ...
      }
    }
  }
}
```

#### 2b. 重建 `blzd_image_map.json`（同理）

#### 2c. 新建 `losp_vol1_image_map.json` 和 `losp_vol2_image_map.json`

#### 2d. 新建 `blzds_image_map.json`

#### 2e. 更新 `locr_image_map.json`（移除 LOSP 条目）

### 第 3 步：改造 `js/api.js` getCardImageUrl()

**目标**：删除 metaId 模式和所有外部 CDN 回退，只保留 localImages 模式。

```javascript
function getCardImageUrl(cardId, imageMap, size, rarityCode) {
    const pw = String(cardId);

    if (imageMap && imageMap[pw]) {
        const cardEntry = imageMap[pw];

        if (cardEntry.localImages) {
            const strictMode = window._strictImageMatch || false;
            const localDir = imageMap._localDir || '';
            const matchedFile = resolveLocalImage(cardEntry.localImages, rarityCode, strictMode);

            if (matchedFile) {
                const url = localDir ? `${localDir}/${matchedFile}` : matchedFile;
                return { url: url, fallbackUrl: null };
            }
        }
    }

    // 所有情况的兜底：显示占位图（不再回退到外部 CDN）
    return { url: MISSING_IMAGE_PLACEHOLDER, fallbackUrl: null };
}
```

关键删除：
- 删除整个 metaId 分支（L786-800）
- 删除 YGOCDB CDN 回退（L803-804）
- 删除 `API_CONFIG.YUGIOHMETA` 配置中的 CDN_BASE 等（仅删 CDN 相关，保留其他用途）
- `buildSupplementCardsFromLocalData` 中无 imageMap 时也用占位图而不是 YGOCDB CDN

### 第 4 步：清理 onerror fallback

**`js/game.js`** `handleCardImageError()`：
- 所有 fallbackUrl 已经是 null，data-fallback 不会有外部 CDN URL
- 简化为：加载失败直接显示占位图

**`js/inventory.js`**：
- onerror 中的 `data-fallback` 使用 `ygoprodeck.com` URL，改为直接显示占位图

### 第 5 步：更新 packs.json 配置

为辅助包新增独立的 imageMapFile 和 localImagesDir：

需要在 api.js 中让辅助包能加载独立的 image map（当前辅助包共用父包的 imageMap）。

方案：在 `packs.json` 中新增 `supplementImageMapFile` 和 `supplementImagesDir` 字段，`buildSupplementCardsFromLocalData` 加载独立的 image map。

### 第 6 步：检查遗留的外部 CDN 引用

全局搜索以下 URL，确保全部清理：
- `cdn.233.momobako.com`
- `s3.duellinksmeta.com`
- `ygoprodeck.com/images`
- `images.ygoprodeck.com`

---

## 验证计划

### 1. 迁移脚本验证

- 运行 `migrate_card_images.py`
- 检查新目录 `blzds/`、`losp_vol1/`、`losp_vol2/` 文件数正确
- 原目录 `blzd/`、`loch/`、`locr/` 中不再有辅助包文件
- 所有文件名符合 NAMING_CONVENTION.md 格式
- 无 w200 文件残留

### 2. 浏览器端到端验证（必须走完整流程！）

```
开包 LOCH → 查看卡片图片正常加载 → 打开背包 → 卡图正常
开包 LOCR → 同上
开包 BLZD → 同上
开 3 盒触发辅助包 → LOSP/BLZDS 卡图正常
```

### 3. 网络请求验证

- DevTools Network 面板过滤外部域名
- 确认 **零外部 CDN 请求**（`cdn.233`、`s3.duellinksmeta`、`ygoprodeck` 均不应出现）

### 4. 缺图卡片检查

- 脚本输出哪些卡片只有 w200 没有 w420（通知用户替换）
- 脚本输出哪些卡片在本地完全没有文件（通知用户补充）
