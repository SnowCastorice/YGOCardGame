# YGO Pack Opener - 卡图加载流程速查表

## 🔍 所有 img 标签 onerror 处理位置

```
js/game.js
├─ 行 44-47:    handleCardImageError(img)
│   ├─ 行 2396: 开包结果 - 主卡池
│   ├─ 行 2455: 开包结果 - 辅助包
│   ├─ 行 4268: 预览 - 主卡池
│   └─ 行 4422: 预览 - 辅助包

js/inventory.js
├─ 行 575:      onerror="this.src='data/ocg/printing.jpg';this.onerror=null;"
└─ 行 627:      onerror 函数
```

## 📍 data-* 属性使用位置

| 位置 | 行号 | data-large-url | data-card-name | data-card-foreign | data-card-set-code |
|------|------|---|---|---|---|
| 开包结果 | 2395-2396 | ✅ | ✅ | ✅ | ✅ |
| 辅助包 | 2454-2455 | ✅ | ✅ | ✅ | ✅ |
| 预览 | 4267-4268 | ❌ | ❌ | ❌ | ❌ |
| 预览辅助 | 4422 | ❌ | ❌ | ❌ | ❌ |
| 背包 | 574 | ❌ | ❌ | ❌ | ❌ |

## 🎨 关键隐藏字段

### 卡片对象上的字段
```
_packDir          string    buildOCGCardsFromLocalData()    图片目录
_isSupplement     boolean   buildSupplementCardsFromLocalData()  辅助包标记
_expandedRarity   string    showCardPreview()               展开版本稀有度
```

### DOM 元素上的字段
```
_packData         object    pack cover img                  卡包元数据
```

## 📊 card 对象的完整属性

```javascript
// 来自 buildOCGCardsFromLocalData 的卡片对象
{
  id: 12345,                          // 卡牌 ID（YGOCDB）
  name: "Blue-Eyes White Dragon",     // 外文名
  nameCN: "青眼白龍",                 // 中文名
  nameOriginal: "Blue-Eyes White Dragon",
  type: "Normal Monster",
  desc: "...",
  atk: 3000,
  def: 2500,
  level: 8,
  race: "Dragon",
  attribute: "LIGHT",
  rarity: "Ultra Rare",                        // 稀有度名称
  rarityVersions: ["SR", "SER", "PSER"],       // ⭐ 所有可能的稀有度
  cardSetCode: "LOCH-JP001",                   // ⭐ 卡包编号
  setNumber: 1,
  imageUrl: "data/ocg/images_dist/loch/LOCH-JP001_SR.webp",  // ⭐ 初始卡图
  imageLargeUrl: "data/ocg/images_dist/loch/LOCH-JP001_SR.webp",
  dataSource: "local",
  _packDir: "loch"                   // ⭐ 隐藏字段：图片目录
}
```

## 🔄 开包流程中的卡图 URL 更新

```
1️⃣ buildOCGCardsFromLocalData(pack, packDir)
   └─ imageUrl = getCardImageUrl(setNumber, packDir, rarityVersions[0])
      └─ 例：data/ocg/images_dist/loch/LOCH-JP001_SR.webp

2️⃣ drawCards() 中随机选择稀有度
   └─ card.rarityVersions[0] = 选中的稀有度（例如 "UR"）

3️⃣ updateCardsImageUrl(cards)
   └─ card.imageUrl = getCardImageUrl(cardSetCode, _packDir, rarityCode)
      └─ 例：data/ocg/images_dist/loch/LOCH-JP001_UR.webp

4️⃣ renderOpenPackResults()
   └─ <img src="${card.imageUrl}" onerror="handleCardImageError(this)">

5️⃣ InventorySystem.addCards()
   └─ 保存到 rarityImageUrls[rarity]
      └─ 例：rarityImageUrls["UR"] = { imageUrl: "...UR.webp", imageLargeUrl: "...UR.webp" }
```

## 🎯 getCardImageUrl() 核心调用点

| 调用者 | 行号 | 目的 | 稀有度参数 |
|-------|------|------|---------|
| buildOCGCardsFromLocalData | 781 | 初始卡图 | rarityVersions[0] |
| buildSupplementCardsFromLocalData | 848 | 辅助包初始卡图 | rarityVersions[0] |
| updateCardsImageUrl | 1389 | 实际稀有度卡图 | card.rarityVersions[0] |
| addCards (inventory.js) | 117 | 背包存储 | 实际稀有度 |
| showCardPreview | 4010 | 展开卡片 | 各稀有度版本 |

## 💾 rarityImageUrls 结构（背包中）

```javascript
// 开盒时收集到 SR, UR, UR-OF 三个版本
inventory[cardId] = {
  id: 12345,
  cardSetCode: "LOCH-JP001",
  name: "...",
  nameCN: "...",
  count: 3,                          // 总拥有数
  rarityVersionsOwned: {
    "SR": 1,
    "UR": 1,
    "UR-OF": 1
  },
  rarityImageUrls: {                 // ⭐ 各稀有度卡图映射
    "SR": {
      imageUrl: "data/ocg/images_dist/loch/LOCH-JP001_SR.webp",
      imageLargeUrl: "data/ocg/images_dist/loch/LOCH-JP001_SR.webp"
    },
    "UR": {
      imageUrl: "data/ocg/images_dist/loch/LOCH-JP001_UR.webp",
      imageLargeUrl: "data/ocg/images_dist/loch/LOCH-JP001_UR.webp"
    },
    "UR-OF": {
      imageUrl: "data/ocg/images_dist/loch/LOCH-JP001_UR-OF.webp",
      imageLargeUrl: "data/ocg/images_dist/loch/LOCH-JP001_UR-OF.webp"
    }
  }
}
```

## 📋 rarities.json 稀有度表（按 sortWeight）

```
sortWeight  code      name_cn    category  isOverFrame
10          N         普通       base      false
20          NR        平罕       base      false
30          R         银字       base      false
40          SR        亮面       base      false
50          UR        浮雕       base      false
55          UR-OF     浮雕破框   special   true      ← 特殊
60          UTR       立体浮雕   premium   false
65          CR        收藏闪     premium   false
70          SER       秘钻       premium   false
80          PSER      棱镜秘钻   premium   false
90          PSER-OF   棱镜秘钻破框 special true     ← 特殊
100         GMR-OF    特级大师破框 special true     ← 特殊
```

## ⚠️ 占位图路径

```javascript
const MISSING_IMAGE_PLACEHOLDER = 'data/ocg/printing.jpg';

// 三处使用：
// 1. api.js 行 507, 602  - cardData 缺失时
// 2. game.js 行 46       - handleCardImageError() 中
// 3. inventory.js 行 561, 577  - URL 校验失败时
```

## 🔧 URL 生成示例

```javascript
// 输入
cardSetCode = "LOCH-JP001"
packDir = "loch"
rarityCode = "UR-OF"

// 本地开发环境
url = "data/ocg/images_dist/loch/LOCH-JP001_UR-OF.webp"

// 线上环境
url = "https://pub-bafe4b6b5a6c4dc6a70d48ecc9a83f9e.r2.dev/ocg/dist/loch/LOCH-JP001_UR-OF.webp"

// 卡图不存在时的降级流程（当前无）
// UR-OF 不存在 → 应降级到 UR 或其他稀有度
// 目前没有实现，直接显示 printing.jpg
```

## 📌 关键发现

### 1. 多版本稀有度系统
- ✅ 完整支持多个稀有度版本（如 SR, SER, PSER）
- ✅ 背包中 `rarityImageUrls` 为每个版本存储独立卡图
- ❌ 但开包时只保存 `rarityVersions[0]` 的稀有度，其他版本在 `rarityVersionsOwned` 中

### 2. 动态卡图路径生成
- ✅ 使用 `_packDir` 参数完全支持不同卡包的不同目录
- ✅ `getCardImageUrl()` 直接拼接，无需 image map
- ✅ 支持本地开发和线上 R2 CDN 自动切换

### 3. 稀有度与卡图对应
- ✅ 每个稀有度版本有独立的卡图文件（`{setNumber}_{rarity}.webp`）
- ✅ 超框卡（UR-OF, PSER-OF, GMR-OF）在 rarities.json 中标记 `isOverFrame: true`
- ❌ 但代码中没有利用 isOverFrame 标记做任何特殊处理

### 4. 错误处理差异
- `handleCardImageError()` - 简单一步到位
- `handlePackCoverError()` - 级联 fallback + 元数据访问
- `inventory.js onerror` - 内联处理
- ❌ 三处处理不统一，缺少稀有度 fallback 链

---

## 📚 参考文件

- 完整分析：`CARD_IMAGE_FLOW_ANALYSIS.md`（896 行）
- 本文件：速查表

