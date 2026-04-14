# 改造 getCardImageUrl() + 卡图拆分重命名方案

> 创建时间：2026-04-10
> 更新时间：2026-04-13
> 状态：待执行
> 关联 TODO：#1 改造 getCardImageUrl() 图源优先级、#2 旧卡图重命名

---

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

### 外部 CDN 调用来源（需清理）— 完整审计

**`cdn.233.momobako.com`（YGOCDB CDN）— 7 处**：
1. `js/api.js` L42: `API_CONFIG.YGOCDB.IMAGE_URL` 配置常量
2. `js/api.js` L804: `getCardImageUrl()` 默认回退
3. `js/api.js` L485-486: `convertYGOCDBCard()` YGOCDB fallback 卡图
4. `js/api.js` L580-581: YGOProDeck 旧 API 回退卡图
5. `js/api.js` L943-944: `buildSupplementCardsFromLocalData()` 无 imageMap 时回退
6. `js/game.js` L880: `getPackCoverImageUrl()` OCG 卡包封面图
7. `js/game.js` L935: `handlePackCoverErrorFinal()` 封面图 fallback

**`s3.duellinksmeta.com`（YugiohMeta S3 CDN）— 2 处活跃代码**：
1. `js/api.js` L47: `API_CONFIG.YUGIOHMETA.CDN_BASE` 配置常量
2. `js/api.js` L795: `getCardImageUrl()` metaId 模式生成 S3 URL

**`images.ygoprodeck.com`（YGOProDeck CDN）— 6 处活跃代码**：
1. `js/api.js` L34-35: `API_CONFIG.YGOPRODECK.IMAGE_SMALL_URL/IMAGE_LARGE_URL`
2. `js/game.js` L882: `getPackCoverImageUrl()` TCG 卡包封面图
3. `js/game.js` L890/896: TCG 卡包 set image
4. `js/game.js` L936: `handlePackCoverErrorFinal()` TCG 封面 fallback
5. `js/inventory.js` L555: 背包卡图 fallbackUrl

**CDN 测试工具**（`js/game.js`）：
- L3199-3300: CDN 卡图对比工具（`CDN_SOURCES` 定义 + `showCDNCompare()` + 相关 UI）
- L3326-3480: 隐藏功能入口中的 CDN 对比入口
- L4614-结尾附近: CDN 批量速度测试（`runBatchCDNTest()` 等）
- **本次一并删除**，今后不再使用 CDN 相关功能

**KONAMI 官方 URL**（`packs.json` 等）：
- 卡包封面图 URL（`coverImage` 字段），**暂时保留**（后续卡包封面本地化时再处理）

**不在本次范围**：
- `static.cloudflareinsights.com`（Cloudflare 分析脚本，非图片）
- `functions/api/card-image.js`（服务端代理，非前端调用）

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

### 第 3 步：改造 `js/api.js` — 删除所有外部 CDN 卡图回退

**目标**：卡图只走 localImages 模式，找不到就显示占位图，不再请求任何外部 CDN。

#### 3a. 简化 `getCardImageUrl()`（L765-805）

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

**删除**：
- 整个 metaId 分支（旧 L786-800）
- YGOCDB CDN 回退（旧 L803-804）
- `size` 参数不再使用（只有一种尺寸），但保留签名兼容

#### 3b. 清理 `API_CONFIG` 中的 CDN 图源配置

- `API_CONFIG.YGOCDB.IMAGE_URL`（L42）：删除或注释（CDN 卡图不再使用）
- `API_CONFIG.YUGIOHMETA.CDN_BASE`（L47）：删除（S3 CDN 不再使用）
- `API_CONFIG.YUGIOHMETA.SIZE_SMALL/SIZE_LARGE`（L48-49）：删除
- `API_CONFIG.YGOPRODECK.IMAGE_SMALL_URL/IMAGE_LARGE_URL`（L34-35）：保留（TCG 模式可能用到，但卡图回退不再使用）

#### 3c. 清理 `buildSupplementCardsFromLocalData()`（L943-944）

```javascript
// 旧：无 imageMap 时用 YGOCDB CDN
const imgSmallResult = imageMap ? getCardImageUrl(...) : { url: `${API_CONFIG.YGOCDB.IMAGE_URL}/${cardDef.id}.jpg`, fallbackUrl: null };

// 新：无 imageMap 时直接用占位图
const imgSmallResult = imageMap ? getCardImageUrl(...) : { url: MISSING_IMAGE_PLACEHOLDER, fallbackUrl: null };
```

同理处理 `buildOCGCardsFromLocalData()` 中的类似回退。

#### 3d. 清理 `convertYGOCDBCard()`（L485-486）和旧 API 回退（L580-581）

这些是 YGOCDB fallback 路径中设置的图片 URL，改为占位图。

### 第 4 步：清理 onerror fallback — 卡图 + 卡包封面

#### 4a. `js/game.js` `handleCardImageError()`（L44-57）

所有 `fallbackUrl` 已经是 null（第 3 步改造后），`data-fallback` 不会有外部 URL。
简化为：加载失败 → 直接显示占位图。

```javascript
function handleCardImageError(img) {
    // 本地卡图加载失败，显示占位图
    if (img.src !== MISSING_IMAGE_PLACEHOLDER_URL) {
        img.src = 'data/ocg/images/printing.jpg';
    } else {
        img.style.display = 'none';
        if (img.nextElementSibling) img.nextElementSibling.style.display = 'flex';
    }
}
```

#### 4b. `js/game.js` `getPackCoverImageUrl()`（L880）和 `handlePackCoverErrorFinal()`（L935）

当前封面图回退链：KONAMI 官方 → cdn.233/ygoprodeck → 占位。
**改为**：KONAMI 官方 URL（packs.json 中的 coverImage）→ 本地封面图 → 占位图。
OCG 卡包已经有本地封面（如 `data/ocg/covers/LOCH-pack.webp`），不需要 CDN 回退。

#### 4c. `js/inventory.js` 背包卡图 fallback（L555）

```javascript
// 旧
const fallbackUrl = 'https://images.ygoprodeck.com/images/cards_small/' + card.id + '.jpg';

// 新：不再使用外部回退，onerror 直接隐藏图片显示占位
```

删除 `data-fallback` 属性，onerror 直接显示占位。

### 第 5 步：更新 packs.json 配置

为辅助包新增独立的 imageMapFile 和 localImagesDir：

需要在 api.js 中让辅助包能加载独立的 image map（当前辅助包共用父包的 imageMap）。

方案：在 `packs.json` 中新增 `supplementImageMapFile` 和 `supplementImagesDir` 字段，`buildSupplementCardsFromLocalData` 加载独立的 image map。

### 第 6 步：删除 CDN 测试工具 + 检查遗留引用

#### 6a. 删除 CDN 测试工具代码（`js/game.js`）

- **L3199-3300**: CDN 卡图对比工具（`CDN_SOURCES` 数组、`showCDNCompare()` 函数及 UI 渲染）
- **L3326-3480**: 隐藏功能入口中移除 CDN 对比相关的按钮和逻辑（保留其他隐藏功能如管理后台入口）
- **L4614-末尾附近**: CDN 批量速度测试（`runBatchCDNTest()`、`SAMPLE_CARD_IDS` 等）
- 同步清理 `css/style.css` 中 CDN 测试工具相关样式（如有）
- 同步清理 `admin/stats.html` 中 CDN 测试相关入口（如有）

#### 6b. 全局搜索确认零外部 CDN 卡图引用

| 域名 | 预期结果 |
|------|----------|
| `cdn.233.momobako.com` | 零引用（CDN 测试工具已删除） |
| `s3.duellinksmeta.com` | 仅 image map JSON 中的文档注释（无活跃代码引用） |
| `images.ygoprodeck.com` | 仅 `API_CONFIG` 中保留定义但不被卡图逻辑调用 |
| `ygoprodeck.com/images` | 零引用 |

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
