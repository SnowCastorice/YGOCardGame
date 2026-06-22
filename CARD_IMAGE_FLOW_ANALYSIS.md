# YGO Pack Opener - 卡图加载与错误处理流程完整分析

## 📋 执行摘要

本文档详细分析了 YGO Pack Opener 项目中卡图加载、错误处理和稀有度反射机制的完整流程。跨越 4 个核心文件：`js/game.js`、`js/api.js`、`js/inventory.js`、`data/common/rarities.json`。

---

## 🎯 1. rarities.json - 稀有度定义文件

### 文件位置
`/data/common/rarities.json`

### 关键字段结构

```json
{
  "rarities": [
    {
      "code": "N",                          // 稀有度编码（主要使用字段）
      "name_cn": "普通",
      "name_en": "Normal",
      "abbreviation": "N",
      "sortWeight": 10,                    // ⭐ 排序权重（越大越稀有，用于开包结果排序）
      "cssColor": "#8e8e8e",
      "category": "base",                  // base|premium|special（决定卡池归属）
      "isOverFrame": false,                // 是否为破框卡（影响卡图路径）
      "isNumbered": false                  // 是否为限量编号卡
    }
  ]
}
```

### 所有稀有度定义（按 sortWeight 升序）

| code | name_cn | sortWeight | category | isOverFrame | 备注 |
|------|---------|-----------|----------|-----------|------|
| N | 普通 | 10 | base | false | 基础稀有度 |
| NR | 平罕 | 20 | base | false | 非官方，外观与N相同 |
| R | 银字 | 30 | base | false | 卡名银色闪光 |
| SR | 亮面 | 40 | base | false | 卡图闪光 |
| UR | 浮雕 | 50 | base | false | 卡图闪光+金色卡名 |
| **UR-OF** | 浮雕破框 | **55** | **special** | **true** | 🎨 超框设计 |
| UTR | 立体浮雕 | 60 | premium | false | 卡框立体浮雕 |
| CR | 收藏闪 | 65 | premium | false | 全面闪光处理 |
| SER | 秘钻 | 70 | premium | false | 彩虹色闪光 |
| PSER | 棱镜秘钻 | 80 | premium | false | 棱镜状彩虹闪光 |
| **PSER-OF** | 棱镜秘钻破框 | **90** | **special** | **true** | 🎨 超框+棱镜 |
| **GMR-OF** | 特级大师破框 | **100** | **special** | **true** | 🎨 超框+限量编号 |

### 动态注入机制（game.js 行 98）
```javascript
applyRarityColors(raritiesData);  // 从 rarities.json 生成全局 CSS 变量和颜色类
// 结果：
//   CSS 变量：--rarity-N, --rarity-SR, --rarity-UR-OF 等
//   颜色类：.rarity-color-N, .rarity-color-UR-OF 等
//   全局映射：RARITY_ORDER_ASC = { N: 10, NR: 20, ... GMR-OF: 100 }
```

---

## 🎨 2. js/api.js - 卡图 URL 生成与资源管理

### 核心常量

#### 2.1 卡图 CDN 基础 URL
**行 38-56**
```javascript
const CARD_IMAGE_BASE_URL = 'https://pub-bafe4b6b5a6c4dc6a70d48ecc9a83f9e.r2.dev/ocg/dist';

function isLocalDev() {
    if (window._forceR2 === undefined) {
        window._forceR2 = localStorage.getItem('forceR2') === 'true';
    }
    if (window._forceR2) return false;
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function getCardImageDir(relativeDir) {
    if (isLocalDev()) {
        return 'data/ocg/images_dist/' + relativeDir;  // 本地开发
    }
    return CARD_IMAGE_BASE_URL + '/' + relativeDir;    // 线上 R2 CDN
}
```

**URL 格式**
```
本地：data/ocg/images_dist/{packDir}/{setNumber}_{rarity}.webp
线上：https://pub-xxx.r2.dev/ocg/dist/{packDir}/{setNumber}_{rarity}.webp

示例：
  - data/ocg/images_dist/loch/LOCH-JP001_UR.webp
  - https://pub-xxx.r2.dev/ocg/dist/loch/LOCH-JP001_UR.webp
```

#### 2.2 占位图常量
**行 687**
```javascript
const MISSING_IMAGE_PLACEHOLDER = 'data/ocg/printing.jpg';  // 卡图缺失显示卡背
```

### 核心函数

#### 2.3 getCardImageUrl 函数
**行 703-712** ⭐ **最关键函数**

```javascript
/**
 * 获取卡图 URL — 直接拼接路径，无需 image map
 *
 * URL 格式：{baseUrl}/{packDir}/{setNumber}_{rarity}.webp
 * 例：https://pub-xxx.r2.dev/ocg/dist/loch/LOCH-JP001_UR.webp
 *
 * 稀有度 fallback：高稀有度找不到独立卡图时，沿 fallback 链降级
 * （实际是否存在由 onerror 处理，这里只负责拼接 URL）
 *
 * @param {string} cardSetCode - 卡片编号（如 'LOCH-JP001'）
 * @param {string} packDir - 卡包图片目录（如 'loch'）
 * @param {string} [rarityCode] - 稀有度代码（如 'UR'、'GMR-OF'）
 * @returns {{ url: string }} 卡图URL
 */
function getCardImageUrl(cardSetCode, packDir, rarityCode) {
    if (!cardSetCode || !packDir) {
        return { url: MISSING_IMAGE_PLACEHOLDER };
    }

    const baseDir = getCardImageDir(packDir);
    const rarity = rarityCode || 'UR';
    const url = `${baseDir}/${cardSetCode}_${rarity}.webp`;
    return { url: url };
}
```

**关键特点**
- ✅ 直接拼接 URL，不查询 image map
- ✅ 返回 `{ url: string }` 对象，方便扩展
- ❌ **不做 fallback**（fallback 由 onerror 负责）

#### 2.4 buildOCGCardsFromLocalData 函数
**行 731-808** ⭐ **本地数据构建**

```javascript
function buildOCGCardsFromLocalData(packConfig, packDir) {
    const rarityNames = {
        'PSER': 'Prismatic Secret Rare', 'UTR': 'Ultimate Rare',
        'SER': 'Secret Rare', 'UR': 'Ultra Rare', 'SR': 'Super Rare',
        'R': 'Rare', 'NR': 'Normal Rare', 'N': 'Common'
    };
    
    const cards = [];
    (packConfig.cardIds || []).forEach(function (cardDef, index) {
        const d = cardDef.cardData || {};
        const rarityVersions = cardDef.rarityVersions || ['N'];  // ⭐ 多版本稀有度
        const rarityCode = rarityVersions[0];                    // 默认展示的稀有度
        const idx = index + 1;

        // 生成卡片编号
        const setNumber = cardDef.setNumber || (packCode + '-JP' + String(idx).padStart(3, '0'));
        const cardSetCode = typeof setNumber === 'string' ? setNumber : (packCode + '-JP' + String(idx).padStart(3, '0'));

        // 🎨 关键：获取卡图 URL，使用默认稀有度
        const defaultRarity = (cardDef.rarityVersions || ['N'])[0];
        const imgSmallResult = getCardImageUrl(cardSetCode, packDir, defaultRarity);
        const imgLargeResult = getCardImageUrl(cardSetCode, packDir, defaultRarity);

        cards.push({
            id: cardDef.id,
            name: displayName,
            nameCN: cnName,
            nameOriginal: foreignName,
            type: cardType,
            desc: d.desc || '',
            atk: atk,
            def: def,
            level: level,
            rarity: rarityNames[rarityCode] || 'Common',
            rarityVersions: rarityVersions,      // ⭐ 多版本稀有度数组
            cardSetCode: cardSetCode,            // ⭐ 卡包编号（如 LOCH-JP001）
            setNumber: idx,
            imageUrl: imgSmallResult.url,        // ⭐ 初始卡图 URL
            imageLargeUrl: imgLargeResult.url,
            dataSource: 'local',
            _packDir: packDir                    // ⭐ 保存图片目录，用于动态获取不同稀有度卡图
        });
    });

    return cards;
}
```

**关键字段**
- `rarityVersions[]` - 该卡的所有可能稀有度（如 `["SR", "SER", "PSER"]`）
- `cardSetCode` - 卡包编号（如 `"LOCH-JP001"`）
- `_packDir` - **关键隐藏字段**，保存图片目录用于后续动态获取卡图
- `imageUrl / imageLargeUrl` - 初始卡图，使用 `rarityVersions[0]`

#### 2.5 buildSupplementCardsFromLocalData 函数
**行 817-874** ⭐ **辅助包卡牌构建**

```javascript
function buildSupplementCardsFromLocalData(packConfig, packDir) {
    const supp = packConfig.supplementPack;
    if (!supp || !supp.cards || supp.cards.length === 0) {
        return [];
    }

    const cards = [];
    supp.cards.forEach(function (cardDef) {
        if (!cardDef.id) return;
        
        const d = cardDef.cardData || {};
        const rarityVersions = cardDef.rarityVersions || ['UR'];
        const rarityCode = rarityVersions[0];

        // 卡图URL
        const imgSmallResult = getCardImageUrl(setNumber, packDir, rarityCode);
        const imgLargeResult = getCardImageUrl(setNumber, packDir, rarityCode);

        cards.push({
            id: cardDef.id,
            name: displayName,
            nameCN: cnName,
            nameOriginal: foreignName,
            rarity: rarityNames[rarityCode] || 'Ultra Rare',
            rarityVersions: rarityVersions,
            cardSetCode: setNumber,
            imageUrl: imgSmallResult.url,
            imageLargeUrl: imgLargeResult.url,
            dataSource: 'local',
            _isSupplement: true,           // ⭐ 辅助包标记
            _packDir: packDir               // ⭐ 保存图片目录
        });
    });

    return cards;
}
```

---

## 🎮 3. js/game.js - 卡图加载错误处理与动态稀有度更新

### 核心错误处理

#### 3.1 handleCardImageError 函数
**行 44-47** ⭐ **关键错误处理**

```javascript
/**
 * 卡图 onerror 统一处理
 * 本地卡图加载失败 → 显示默认卡背占位图
 *
 * @param {HTMLImageElement} img - 加载失败的 img 元素
 */
function handleCardImageError(img) {
    img.onerror = null;  // 防止死循环
    img.src = 'data/ocg/printing.jpg';  // 显示卡背占位图
}
```

**特点**
- ✅ 简单直接，一步到位
- ✅ 防止死循环（清空 onerror）
- ❌ 无级联 fallback（无法逐级降级）
- ❌ 无数据属性访问（无法获取卡包目录）

#### 3.2 handlePackCoverError 函数
**行 862-872** ⭐ **卡包封面图错误处理**

```javascript
async function handlePackCoverError(imgEl) {
    const pack = imgEl._packData;  // ⭐ 从 DOM 元素上读取 pack 数据
    const fallbackIcon = imgEl.nextElementSibling;
    const failedUrl = imgEl.src;

    console.warn(`⚠️ 卡包封面图加载失败: ${pack ? pack.packId : '未知'}, URL: ${failedUrl}`);

    // 直接显示 emoji 兜底（不再重试外部 CDN）
    imgEl.style.display = 'none';
    if (fallbackIcon) fallbackIcon.style.display = 'block';
}
```

**关键差异点**
- ✅ 通过 `_packData` 获取元数据
- ✅ 有级联 fallback（隐藏图片，显示 emoji）
- 💡 **对比**：`handleCardImageError` 缺少这样的元数据访问

### img 标签 onerror 属性位置统计

**行号** | **位置** | **代码片段** | **上下文**
---|---|---|---
2396 | 开包结果显示 | `onerror="handleCardImageError(this)"` | 主卡池卡片
2455 | 辅助包卡片 | `onerror="handleCardImageError(this)"` | +1 特别包卡片
4268 | 卡包预览 | `onerror="handleCardImageError(this)"` | 预览/图鉴视图
4422 | 辅助包预览 | `onerror="handleCardImageError(this)"` | 预览中的 +1 包

#### 3.3 开包结果显示中的 img 标签
**行 2386-2401** ⭐ **主要卡片渲染**

```javascript
let imageHtml;
if (card.imageUrl) {
    const largeUrl = card.imageLargeUrl || card.imageUrl;
    const cardName = card.nameCN || card.name;
    const foreignName = card.nameOriginal || '';
    
    // 🎨 关键：多个 data-* 属性
    imageHtml = `<img class="card-image clickable" src="${card.imageUrl}" alt="${cardName}" loading="lazy"
                      data-large-url="${largeUrl}" 
                      data-card-name="${cardName}" 
                      data-card-foreign="${foreignName}" 
                      data-card-set-code="${card.cardSetCode || ''}"
                      onerror="handleCardImageError(this)">
                 <span class="card-icon" style="display:none;">${getCardIcon(rarityCode)}</span>`;
} else {
    imageHtml = `<span class="card-icon">${getCardIcon(rarityCode)}</span>`;
}
```

**data-* 属性详解**

| 属性 | 值示例 | 用途 | 来源 |
|-----|--------|------|------|
| `data-large-url` | `https://...LOCH-JP001_UR.webp` | 放大查看时使用 | `card.imageLargeUrl \|\| card.imageUrl` |
| `data-card-name` | `青眼白龍` | 显示卡名 | `card.nameCN \|\| card.name` |
| `data-card-foreign` | `Blue-Eyes White Dragon` | 显示外文名 | `card.nameOriginal` |
| `data-card-set-code` | `LOCH-JP001` | 显示卡包编号 | `card.cardSetCode` |
| `data-rarity` | `UR` 或 `_expandedRarity` | 显示稀有度 | 见下节 |

#### 3.4 辅助包卡片渲染
**行 2448-2459** ⭐ **+1 特别包**

```javascript
let imageHtml;
if (card.imageUrl) {
    const largeUrl = card.imageLargeUrl || card.imageUrl;
    const cardName = card.nameCN || card.name;
    const foreignName = card.nameOriginal || '';
    
    // ⭐ 几乎相同的 img 标签结构
    imageHtml = `<img class="card-image clickable" src="${card.imageUrl}" alt="${cardName}" loading="lazy"
                      data-large-url="${largeUrl}" 
                      data-card-name="${cardName}" 
                      data-card-foreign="${foreignName}" 
                      data-card-set-code="${card.cardSetCode || ''}"
                      onerror="handleCardImageError(this)">
                 <span class="card-icon" style="display:none;">${getCardIcon(rarityCode)}</span>`;
} else {
    imageHtml = `<span class="card-icon">${getCardIcon(rarityCode)}</span>`;
}
```

#### 3.5 卡包预览中的 img 标签
**行 4264-4272** ⭐ **预览/图鉴视图**

```javascript
let imageHtml;
if (card.imageUrl) {
    imageHtml = `<img class="preview-card-image ${!isOwned ? 'not-owned' : ''}"
                      src="${card.imageUrl}" alt="${displayName}" loading="lazy"
                      onerror="handleCardImageError(this)">
                 <div class="preview-card-placeholder" style="display:none;">🃏</div>`;
} else {
    imageHtml = `<div class="preview-card-placeholder ${!isOwned ? 'not-owned' : ''}">🃏</div>`;
}
```

**差异**
- ❌ **缺少** `data-card-set-code` 等属性
- ❌ **缺少** 放大查看功能的 data-large-url
- ✅ 只需要本地加载即可

#### 3.6 预览中的辅助包 img 标签
**行 4420-4426** ⭐ **预览中的 +1 包**

```javascript
let imageHtml;
if (card.imageUrl) {
    imageHtml = '<img class="preview-card-image ' + (!isOwned ? 'not-owned' : '') + '" src="' + card.imageUrl + '" alt="' + displayName + '" loading="lazy" onerror="handleCardImageError(this)">';
    imageHtml += '<div class="preview-card-placeholder" style="display:none;">🃏</div>';
} else {
    imageHtml = '<div class="preview-card-placeholder ' + (!isOwned ? 'not-owned' : '') + '">🃏</div>';
}
```

### 动态卡图更新机制

#### 3.7 updateCardsImageUrl 函数
**行 1384-1395** ⭐ **稀有度对应卡图更新**

```javascript
/**
 * 根据卡片的 _packDir 和最终稀有度，更新卡片的 imageUrl / imageLargeUrl
 *
 * 【用途】
 * 在存入背包之前调用，确保背包中保存的是正确的本地卡图地址。
 * 例如 LOCH 卡包的 OF 超框卡版本需要使用对应的超框卡图。
 *
 * @param {Array} cards - 卡片数组（会直接修改其中的 imageUrl / imageLargeUrl）
 */
function updateCardsImageUrl(cards) {
    if (!Array.isArray(cards)) return;
    cards.forEach(function (card) {
        if (card._packDir) {                                          // ⭐ 检查图片目录
            const rarity = (card.rarityVersions || ['N'])[0];         // 获取实际稀有度
            const smallResult = getCardImageUrl(card.cardSetCode, card._packDir, rarity);
            const largeResult = getCardImageUrl(card.cardSetCode, card._packDir, rarity);
            card.imageUrl = smallResult.url;                          // 更新卡图 URL
            card.imageLargeUrl = largeResult.url;
        }
    });
}
```

**工作流程**
```
drawCards() 
  → pickRandomCard() / selectCard() 
    → card.rarityVersions[0] = 选中的稀有度
  → updateCardsImageUrl(cards) 
    → getCardImageUrl(cardSetCode, _packDir, rarity)
      → 返回 {setNumber}_{rarity}.webp
  → 背包存储
```

**为什么需要**
- 初始 URL 使用默认稀有度（通常是最低稀有度）
- 开包时随机选择实际稀有度
- 需要重新生成对应稀有度的卡图 URL
- 例：`LOCH-JP001_SR.webp` → `LOCH-JP001_UR-OF.webp`

#### 3.8 展开卡片及稀有度反射
**行 3999-4020** ⭐ **预览展开逻辑**

```javascript
// 构建展开卡片列表（每张卡的每个稀有度版本单独显示一条记录）
let versions = card.rarityVersions || ['N'];
if (versions.includes('N') && versions.includes('NR')) {
    // 处理特殊情况：某些卡既有 N 又有 NR，只显示 NR
    versions = versions.filter(function (v) { return v !== 'N'; });
}

versions.forEach(function (rarity) {
    totalVersions += 1;
    rarityCounts[rarity] = (rarityCounts[rarity] || 0) + 1;

    // 🎨 关键：为每个版本生成展开卡片
    const expSmall = card._packDir ? getCardImageUrl(card.cardSetCode, card._packDir, rarity) : null;
    const expLarge = card._packDir ? getCardImageUrl(card.cardSetCode, card._packDir, rarity) : null;

    expandedCards.push({
        ...card,
        imageUrl: expSmall ? expSmall.url : card.imageUrl,
        imageLargeUrl: expLarge ? expLarge.url : card.imageLargeUrl,
        _expandedRarity: rarity                              // ⭐ 展开版本的稀有度
    });
});
```

**_expandedRarity 隐藏字段**
- 用于预览中区分展开后的稀有度版本
- 在 img 的 `data-rarity` 属性中使用：`data-rarity="${card._expandedRarity || rarityCode}"`
- 用于收集统计（line 4197 检查 `ownedVersionsMap[card.id][card._expandedRarity]`）

---

## 🎒 4. js/inventory.js - 背包中的卡图管理

### 核心存储结构

#### 4.1 背包数据格式
**行 25-26** ⭐ **关键数据结构**

```javascript
// 背包数据结构：
// { 
//   "卡片密码": { 
//     id, name, nameCN, nameOriginal, 
//     rarityVersions,           // 该卡所有可能的稀有度
//     imageUrl, imageLargeUrl,  // 初始卡图
//     count,                    // 总数量
//     rarityVersionsOwned: { "SR": 2, "SER": 1 },  // 各稀有度拥有数
//     rarityImageUrls: {        // ⭐ 各稀有度对应的卡图
//       "SR": { imageUrl: "...", imageLargeUrl: "..." },
//       "SER": { imageUrl: "...", imageLargeUrl: "..." }
//     },
//     firstObtained
//   }
// }
```

#### 4.2 addCards 函数
**行 105-175** ⭐ **卡片入库逻辑**

```javascript
function addCards(cards) {
    if (!initialized) init();
    if (!Array.isArray(cards) || cards.length === 0) return;

    cards.forEach(function (card) {
        const cardId = String(card.id);
        const rarity = (card.rarityVersions || ['N'])[0];  // 获取实际稀有度

        // 🎨 关键：为当前稀有度预计算卡图URL
        let raritySmallUrl = card.imageUrl || '';
        let rarityLargeUrl = card.imageLargeUrl || '';
        if (card._packDir && typeof getCardImageUrl === 'function') {
            const result = getCardImageUrl(card.cardSetCode, card._packDir, rarity);
            if (result && result.url) {
                raritySmallUrl = result.url;
                rarityLargeUrl = result.url;
            }
        }

        if (inventory[cardId]) {
            // 已有该卡：总数量+1
            inventory[cardId].count += 1;
            
            // 记录该稀有度版本+1
            if (!inventory[cardId].rarityVersionsOwned) {
                inventory[cardId].rarityVersionsOwned = {};
            }
            inventory[cardId].rarityVersionsOwned[rarity] = 
                (inventory[cardId].rarityVersionsOwned[rarity] || 0) + 1;
            
            // 保存该稀有度版本对应的卡图URL
            if (!inventory[cardId].rarityImageUrls) {
                inventory[cardId].rarityImageUrls = {};
            }
            if (!inventory[cardId].rarityImageUrls[rarity]) {
                inventory[cardId].rarityImageUrls[rarity] = {
                    imageUrl: raritySmallUrl,
                    imageLargeUrl: rarityLargeUrl
                };
            }
        } else {
            // 新卡：创建记录
            const versionsOwned = {};
            versionsOwned[rarity] = 1;
            
            // 初始化稀有度卡图映射
            const rarityImageUrls = {};
            rarityImageUrls[rarity] = {
                imageUrl: raritySmallUrl,
                imageLargeUrl: rarityLargeUrl
            };
            
            inventory[cardId] = {
                id: card.id,
                cardSetCode: card.cardSetCode || '',
                name: card.name || '',
                nameCN: card.nameCN || '',
                nameOriginal: card.nameOriginal || '',
                rarityVersions: card.rarityVersions || ['N'],
                imageUrl: card.imageUrl || '',
                imageLargeUrl: card.imageLargeUrl || '',
                count: 1,
                rarityVersionsOwned: versionsOwned,
                rarityImageUrls: rarityImageUrls,
                firstObtained: Date.now()
            };
        }
    });

    saveToStorage();
    updateBadge();
    console.log(`🎒 背包新增 ${cards.length} 张卡片`);
}
```

**关键特点**
- ✅ 利用 `card._packDir` 为每个稀有度预计算卡图 URL
- ✅ 保存在 `rarityImageUrls` 中供后续使用
- ✅ 使用 `getCardImageUrl` 确保路径一致性

#### 4.3 buildCardItemsHtml 函数
**行 547-601** ⭐ **卡片列表 HTML 渲染**

```javascript
function buildCardItemsHtml(cards) {
    let html = '';
    cards.forEach(function (card) {
        const rarityCode = card.displayRarity || (card.rarityVersions || ['N'])[0];
        const cardCount = card.displayCount || card.count || 1;
        const price = getCardPrice(rarityCode, card.cardSetCode);
        const isMarket = hasMarketPrice(card.cardSetCode);
        const displayName = card.nameCN || card.name || card.nameOriginal || '未知卡片';

        let imageHtml;
        // 检测旧存档中的无效 imageUrl
        let validImageUrl = card.imageUrl || '';
        if (validImageUrl === 'data/ocg/images/printing.jpg') {
            validImageUrl = 'data/ocg/printing.jpg';  // 修正旧路径
        }
        if (validImageUrl && !validImageUrl.includes('printing.jpg')) {
            // 旧 hash 格式检测
            if (validImageUrl.match(/_w\d+\.webp/) || validImageUrl.match(/\/[a-f0-9]{20,}_/)) {
                validImageUrl = '';
            }
            // 旧目录路径检测
            if (validImageUrl.match(/data\/ocg\/images\/[^_]/)) {
                validImageUrl = '';
            }
        }
        
        if (validImageUrl) {
            // 🎨 关键：img 标签 onerror 处理
            imageHtml = `<img class="inventory-card-image" src="${validImageUrl}" alt="${displayName}" loading="lazy"
                              onerror="this.src='data/ocg/printing.jpg';this.onerror=null;">`;
        } else {
            imageHtml = `<img class="inventory-card-image" src="data/ocg/printing.jpg" alt="${displayName}">`;
        }

        let priceHtml;
        if (isMarket) {
            priceHtml = `<div class="inventory-card-price">🪙 ${formatPrice(price)}</div>`;
        } else {
            priceHtml = '<div class="inventory-card-price inventory-card-price--no-data">暂无报价</div>';
        }
        
        html += `
            <div class="inventory-card-item rarity-border-${rarityCode}" data-card-id="${card.id}" data-rarity="${rarityCode}">
                <div class="inventory-card-img-wrapper">
                    ${imageHtml}
                    <span class="inventory-rarity-badge rarity-${rarityCode}">${rarityCode}</span>
                    ${cardCount > 1 ? `<span class="inventory-count-badge">×${cardCount}</span>` : ''}
                </div>
                <div class="inventory-card-info">
                    <div class="inventory-card-name" title="${displayName}">${displayName}</div>
                    ${priceHtml}
                </div>
            </div>
        `;
    });
    return html;
}
```

**onerror 处理**
```javascript
onerror="this.src='data/ocg/printing.jpg';this.onerror=null;"
```
- ✅ 内联处理，简洁
- ✅ 清空 onerror 防止死循环
- ❌ 无法访问 _packDir 做级联 fallback

#### 4.4 showCardViewer 函数
**行 607-645** ⭐ **大图查看器**

```javascript
function showCardViewer(card) {
    const viewer = document.getElementById('card-image-viewer');
    if (!viewer) return;

    const img = viewer.querySelector('.viewer-image');
    const nameEl = viewer.querySelector('.viewer-card-name');

    if (img) {
        // 先清空旧图，避免打开新卡片时闪现上一张图片
        img.src = '';
        let largeUrl = card.imageLargeUrl || card.imageUrl || '';
        
        // 修正旧占位图路径
        if (largeUrl === 'data/ocg/images/printing.jpg') {
            largeUrl = 'data/ocg/printing.jpg';
        }
        
        // 检测旧存档中的无效 URL
        if (largeUrl && (largeUrl.match(/_w\d+\.webp/) || largeUrl.match(/\/[a-f0-9]{20,}_/) || largeUrl.match(/data\/ocg\/images\/[^_]/))) {
            largeUrl = 'data/ocg/printing.jpg';
        }
        
        img.src = largeUrl || 'data/ocg/printing.jpg';
        img.onerror = function () { 
            this.src = 'data/ocg/printing.jpg'; 
            this.onerror = null; 
        };
    }
    
    if (nameEl) {
        const cardSetCode = card.cardSetCode || '';
        const displayName = card.nameCN || card.name || '';
        const foreignName = card.nameOriginal || '';
        let nameHtml = '';
        if (cardSetCode) {
            nameHtml += '<span style="font-size:0.95em;color:#f0c040;letter-spacing:0.5px;">' + cardSetCode + '</span><br>';
        }
        nameHtml += displayName;
        if (foreignName && foreignName !== displayName) {
            nameHtml += '<br><span style="font-size:0.8em;opacity:0.7;">' + foreignName + '</span>';
        }
        nameEl.innerHTML = nameHtml;
    }

    viewer.classList.add('active');
}
```

---

## 📊 完整工作流程图

### A. 初始化阶段
```
DOMContentLoaded
  ├─ fetch('data/common/rarities.json')
  │   └─ applyRarityColors() 生成全局 RARITY_ORDER_ASC, CSS 变量
  │
  ├─ fetch('data/ocg/packs.json')
  │   └─ 加载卡包配置（包含 localImagesDir 图片目录）
  │
  └─ 初始化 InventorySystem, CurrencySystem, PriceSystem
```

### B. 选择卡包阶段
```
selectPack(pack)
  ├─ 动态加载 cardIds（如果 cardFile 配置）
  ├─ TCG_API.getCardSetData(mode, pack)
  │   └─ buildOCGCardsFromLocalData(pack, packDir)
  │       └─ 为每张卡生成初始 imageUrl（使用 rarityVersions[0]）
  │       └─ 保存 _packDir（图片目录）用于后续动态获取
  │
  └─ currentPackCards = 返回的卡牌数组
```

### C. 开包阶段
```
openPack() / openBox()
  ├─ drawCards(pack, currentPackCards)
  │   ├─ 根据 packScheme 分发到不同的抽卡逻辑
  │   └─ pickRandomCard(card, scheme) / selectCard()
  │       └─ 随机选择 rarityVersions[N] 中的一个稀有度
  │       └─ card.rarityVersions[0] = 选中的稀有度
  │
  ├─ updateCardsImageUrl(selectedCards)
  │   └─ 利用 _packDir 为每张卡重新生成对应稀有度的卡图 URL
  │       └─ getCardImageUrl(cardSetCode, _packDir, rarity)
  │       └─ 返回 {packDir}/{setNumber}_{rarity}.webp
  │
  ├─ renderOpenPackResults(selectedCards, bonusCards)
  │   ├─ 生成卡片 HTML，含 data-* 属性
  │   └─ img 标签 onerror="handleCardImageError(this)"
  │       └─ 卡图加载失败 → 显示 data/ocg/printing.jpg
  │
  └─ InventorySystem.addCards(selectedCards)
      ├─ 为每个卡片的实际稀有度预计算卡图 URL
      │   └─ 利用 _packDir（来自 currentPackCards）
      │   └─ 保存到 rarityImageUrls[rarity]
      │
      └─ 背包数据持久化（localStorage）
```

### D. 背包展示阶段
```
renderInventoryModal()
  ├─ getExpandedCards()
  │   └─ 将每张卡按所拥有的稀有度版本展开为独立条目
  │   └─ 为每条记录生成 _expandedRarity
  │
  ├─ buildCardItemsHtml(expandedCards)
  │   └─ 生成卡片网格 HTML
  │   └─ img onerror="this.src='data/ocg/printing.jpg';this.onerror=null;"
  │
  └─ 点击卡片 → showCardViewer()
      └─ 从 rarityImageUrls[displayRarity] 获取对应稀有度卡图
      └─ 大图 img onerror 处理
```

### E. 预览阶段
```
showCardPreview(pack)
  ├─ 获取卡包的所有卡牌
  ├─ 为每张卡展开其所有稀有度版本
  │   └─ expandedCards 中每条记录有 _expandedRarity
  │
  ├─ 生成预览 HTML，分为：
  │   ├─ 主卡池（按稀有度分组）
  │   └─ +1 辅助包
  │
  └─ img 标签 onerror="handleCardImageError(this)"
      └─ 加载失败 → 显示 data/ocg/printing.jpg
```

---

## 🔑 关键隐藏字段汇总

### 在卡片对象上的隐藏字段

| 字段 | 类型 | 来源 | 用途 | 生命周期 |
|-----|------|------|------|---------|
| `_packDir` | string | `buildOCGCardsFromLocalData()` | 保存图片目录，用于动态获取不同稀有度卡图 | 从加载卡包到存入背包 |
| `_isSupplement` | boolean | `buildSupplementCardsFromLocalData()` | 标记是否为辅助包卡片 | 从加载卡包到存入背包 |
| `_expandedRarity` | string | 预览展开逻辑 | 标记展开后的稀有度版本 | 仅在预览中使用 |

### 在 DOM 元素上的隐藏字段

| 字段 | 类型 | 绑定位置 | 来源 | 用途 |
|-----|------|---------|------|------|
| `_packData` | object | pack cover img | `handlePackCoverError()` | 从错误处理中获取卡包元数据 |

### 在 img 标签上的 data-* 属性

| 属性 | 值示例 | 用途 | 访问方式 |
|-----|--------|------|---------|
| `data-large-url` | `...LOCH-JP001_UR.webp` | 放大查看时的大图 URL | `img.getAttribute('data-large-url')` |
| `data-card-name` | `青眼白龍` | 显示卡名 | `img.getAttribute('data-card-name')` |
| `data-card-foreign` | `Blue-Eyes White Dragon` | 显示外文名 | `img.getAttribute('data-card-foreign')` |
| `data-card-set-code` | `LOCH-JP001` | 显示卡包编号 | `img.getAttribute('data-card-set-code')` |
| `data-rarity` | `UR` 或 `_expandedRarity` | 识别稀有度版本 | `img.getAttribute('data-rarity')` |

---

## 🚨 当前问题与改进方向

### 问题 1：handleCardImageError 缺乏元数据
**当前**
```javascript
function handleCardImageError(img) {
    img.onerror = null;
    img.src = 'data/ocg/printing.jpg';
}
```

**问题**
- ❌ 无法访问 `data-card-set-code` 等元数据
- ❌ 无法进行级联 fallback（如尝试不同稀有度）
- ❌ 无法记录错误日志（缺少卡牌信息）

**对比 handlePackCoverError**
```javascript
async function handlePackCoverError(imgEl) {
    const pack = imgEl._packData;  // ✅ 获取元数据
    console.warn(`⚠️ 卡包封面图加载失败: ${pack ? pack.packId : '未知'}, URL: ${imgEl.src}`);
    // ... 级联 fallback
}
```

### 问题 2：没有稀有度 fallback 链
**场景**
- 某个稀有度版本的卡图缺失（例如 `LOCH-JP001_UR-OF.webp` 不存在）
- 当前直接显示卡背，没有尝试降级到其他稀有度

**期望**
```
URL 加载失败
  └─ 尝试 UR-OF (失败)
     └─ 尝试 UR (成功)
        └─ 或降级到列表中的下一个稀有度
```

### 问题 3：inventory.js 中的 onerror 处理不一致
**当前**
```javascript
// 背包中
onerror="this.src='data/ocg/printing.jpg';this.onerror=null;"

// 开包结果中
onerror="handleCardImageError(this)"
```

**问题**
- ❌ 两处处理逻辑不统一
- ❌ 无法统一管理错误日志

### 问题 4：_packDir 数据可能丢失的场景
**场景**
- 旧存档中的卡片没有 `_packDir`（迁移时补充失败）
- 导致无法动态获取不同稀有度卡图
- 特别是对超框卡（UR-OF, PSER-OF, GMR-OF）的处理

---

## 📝 关键代码统计

| 组件 | 行号 | 主要功能 |
|-----|-----|---------|
| rarities.json | 1-174 | 稀有度定义、权重、颜色、分类 |
| api.js 行 687 | - | MISSING_IMAGE_PLACEHOLDER |
| api.js 行 703-712 | - | getCardImageUrl() 核心函数 |
| api.js 行 731-808 | - | buildOCGCardsFromLocalData() |
| api.js 行 817-874 | - | buildSupplementCardsFromLocalData() |
| game.js 行 44-47 | - | handleCardImageError() 错误处理 |
| game.js 行 1384-1395 | - | updateCardsImageUrl() 稀有度卡图更新 |
| game.js 行 2386-2401 | - | 开包结果 img 标签 |
| game.js 行 2448-2459 | - | 辅助包 img 标签 |
| game.js 行 3999-4020 | - | 展开卡片及稀有度反射 |
| game.js 行 4264-4272 | - | 预览 img 标签 |
| game.js 行 4420-4426 | - | 预览中的辅助包 |
| inventory.js 行 105-175 | - | addCards() 入库逻辑 |
| inventory.js 行 547-601 | - | buildCardItemsHtml() 渲染 |
| inventory.js 行 607-645 | - | showCardViewer() 大图查看 |

