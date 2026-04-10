# 价格文件 key 机制优化 + LOSP 价格拆分方案

> 创建时间：2026-04-09
> 状态：待执行
> 关联 TODO：#1 价格文件 key 机制优化、#3 拆分卡包价格信息

---

## 背景与问题

两个 TODO 一起解决：

### 问题 1：价格文件 key 失配

当前价格文件（如 `locr_prices.json`）的 `cards` 对象用 **card password（数字密码）** 做 key：

```json
{
  "cards": {
    "100257001": { "setNumber": "LOCR-JP001", "name": "...", "prices": {...} }
  }
}
```

但新卡包上线初期使用**临时密码**（如 `100257001`），`tools/update_cards_db.py` 从 YGOCDB 更新后密码变为真实值（如 `30397786`），导致：
- 价格文件 key 还是旧密码 `100257001`
- 前端用新密码 `30397786` 查不到价格 → 显示"暂无报价"
- 最近一次：2026-04-07 LOCR 28 张卡全部失配

### 问题 2：LOSP 价格混在母包文件中

- LOSP vol1（JP001-010）的价格混在 `loch_prices.json` 中
- LOSP vol2（JP011-020）的价格混在 `locr_prices.json` 中
- `merge_prices.py` 中有复杂的 LOSP 路由逻辑（按编号前缀判断写入哪个文件）

### 解决方案

**setNumber（如 `LOCR-JP001`）是永久不变的标识符**，密码会变但 setNumber 不会。

方案：
1. 价格文件 key 从 password 改为 setNumber
2. LOSP 拆为独立价格文件
3. 前端查价格时用 `cardSetCode`（等于 setNumber）代替 `card.id`（password）

---

## 改动清单

### 第 1 步：写一次性迁移脚本

**新建** `tools/migrate_price_keys.py`，自动完成所有数据迁移：

1. 读取现有 3 个价格文件
2. 将 `cards` 对象的 key 从 password 转为 setNumber
3. 从 `loch_prices.json` 中拆出 LOSP-JP001~010 → `losp_vol1_prices.json`
4. 从 `locr_prices.json` 中拆出 LOSP-JP011~020 → `losp_vol2_prices.json`
5. 移除各 card 条目中冗余的 `setNumber` 字段（key 本身就是 setNumber）
6. 移除母包文件中的 LOSP packPrices
7. 打印迁移报告（验证条目数）

迁移后的文件结构示例：

**`losp_vol1_prices.json`（新建）：**
```json
{
  "_说明": "LOSP vol1 特殊+1包市场价格数据（集换社）",
  "_单位": "人民币/元",
  "_更新时间": "2026-03-21",
  "packPrices": {
    "LOSP-vol1": { "pack": 70.0 }
  },
  "cards": {
    "LOSP-JP001": { "name": "超魔导龙骑士-真红眼龙骑士", "prices": { "PSER-OF": 0.5 } },
    "LOSP-JP002": { "name": "...", "prices": { "PSER-OF": ... } }
  }
}
```

**`loch_prices.json`（改造后）：**
```json
{
  "packPrices": {
    "LOCH": { "box": 385.0, "pack": 22.0 }
  },
  "cards": {
    "LOCH-JP001": { "name": "王之仆人-黑魔术师", "prices": { "UR": 0.5, "UR-OF": 65.0, ... } },
    "LOCH-JP002": { "name": "...", "prices": { ... } }
  }
}
```

> 关键变化：key 从 `"88570003"` 变为 `"LOCH-JP001"`，移除条目中的 `"setNumber"` 字段

### 第 2 步：改造前端 `js/priceSystem.js`

**文件**：`js/priceSystem.js`

#### 2.1 PRICE_FILES 新增 LOSP

```javascript
// 旧
const PRICE_FILES = {
    'loch': 'data/ocg/prices/loch_prices.json',
    'blzd': 'data/ocg/prices/blzd_prices.json',
    'locr': 'data/ocg/prices/locr_prices.json'
};

// 新
const PRICE_FILES = {
    'loch': 'data/ocg/prices/loch_prices.json',
    'locr': 'data/ocg/prices/locr_prices.json',
    'blzd': 'data/ocg/prices/blzd_prices.json',
    'losp-vol1': 'data/ocg/prices/losp_vol1_prices.json',
    'losp-vol2': 'data/ocg/prices/losp_vol2_prices.json'
};
```

#### 2.2 loadPriceFile() 改造

```javascript
// 旧：用 cardId（password）做缓存 key，额外建 setNumberIndex
Object.keys(data.cards).forEach(function (cardId) {
    var cardPrice = data.cards[cardId];
    if (cardPrice && cardPrice.prices) {
        priceCache[cardId] = cardPrice.prices;
        if (cardPrice.setNumber) {
            setNumberIndex[cardPrice.setNumber] = cardId;
        }
    }
});

// 新：key 本身就是 setNumber，直接用
Object.keys(data.cards).forEach(function (setNumber) {
    var cardPrice = data.cards[setNumber];
    if (cardPrice && cardPrice.prices) {
        priceCache[setNumber] = cardPrice.prices;
    }
});
```

> `setNumberIndex` 变量可以完全删除（不再需要反向索引）

#### 2.3 resolveCardId() 简化

```javascript
// 旧
function resolveCardId(cardId) {
    var key = String(cardId);
    if (priceCache[key]) return key;
    var mappedId = setNumberIndex[key];
    if (mappedId && priceCache[mappedId]) return mappedId;
    return null;
}

// 新：直接查 setNumber
function resolveCardId(cardSetCode) {
    var key = String(cardSetCode);
    if (priceCache[key]) return key;
    return null;
}
```

#### 2.4 公开 API 注释更新

`getCardPrice`, `getCardPrices`, `getCardMarketPrice`, `hasPrice` 的 `@param` 注释从 "卡片密码" 改为 "卡片编号（如 LOCR-JP001）"，函数签名不变。

### 第 3 步：改造前端调用方

所有调用 PriceSystem 的地方，将传入的 `card.id`（password）改为 `card.cardSetCode`（setNumber）。

#### 3.1 `js/game.js`（1 处）

```javascript
// L2651 附近
// 旧
const price = PriceSystem.getCardPrice(cardId, rarity);
// 新
const price = PriceSystem.getCardPrice(card.cardSetCode, rarity);
```

需要同时调整上面 `cardId` 的取值：

```javascript
// 旧：const cardId = card.id;
// 新：改为直接用 card.cardSetCode
```

#### 3.2 `js/inventory.js`（多处）

**a) addCards() 函数补存 cardSetCode（约 L151）：**

```javascript
inventory[cardId] = {
    id: card.id,
    cardSetCode: card.cardSetCode || '',  // ← 新增这一行
    name: card.name || '',
    // ... 其余字段不变
};
```

**b) 内部 getCardPrice() 和 hasMarketPrice()（L283-298）：**

参数语义从 cardId 改为 cardSetCode（函数签名兼容，不需要改名）：

```javascript
// L283-290：内部 getCardPrice 不需要改，只是传入值变了
function getCardPrice(rarity, cardSetCode) {
    if (cardSetCode && typeof PriceSystem !== 'undefined') {
        var marketPrice = PriceSystem.getCardPrice(cardSetCode, rarity);
        if (marketPrice !== null) return marketPrice;
    }
    return 0;
}
```

**c) 所有调用处改为传 cardSetCode：**

| 行号（约） | 旧 | 新 |
|------------|-----|-----|
| L315 | `getCardPrice(rarity, card.id)` | `getCardPrice(rarity, card.cardSetCode)` |
| L319 | `getCardPrice(..., card.id)` | `getCardPrice(..., card.cardSetCode)` |
| L544 | `getCardPrice(rarityCode, card.id)` | `getCardPrice(rarityCode, card.cardSetCode)` |
| L545 | `hasMarketPrice(card.id)` | `hasMarketPrice(card.cardSetCode)` |
| L654 | `getCardPrice(getCardRarity(a), a.id)` | `getCardPrice(getCardRarity(a), a.cardSetCode)` |
| L655 | `getCardPrice(getCardRarity(b), b.id)` | `getCardPrice(getCardRarity(b), b.cardSetCode)` |

### 第 4 步：改造 `tools/merge_prices.py`

核心改动：输出价格文件时用 setNumber 做 key，不再用 password。

#### 4.1 LOCH 部分（L153 附近）

当前 LOCH 的循环已经是遍历 `loch_prices['cards']`，改 key 后：
- 旧 key: `"88570003"` → 新 key: `"LOCH-JP001"`
- 遍历时 `card_key` 就是 setNumber，不需要从 `card_info['setNumber']` 再取

#### 4.2 LOCR 部分（L398 附近）

```python
# 旧
locr_cards[password] = {
    'setNumber': set_number,
    'name': card_name,
    'prices': filtered_prices,
}

# 新
locr_cards[set_number] = {
    'name': card_name,
    'prices': filtered_prices,
}
```

#### 4.3 BLZD 部分（L651 附近）

同理：`blzd_cards[password]` → `blzd_cards[set_number]`

#### 4.4 LOSP 拆分

- 不再将 LOSP 条目写入 loch/locr 文件
- 新增 `losp_vol1_prices` 和 `losp_vol2_prices` 两个输出对象
- LOSP vol1（JP001-010）写入 `losp_vol1_prices.json`
- LOSP vol2（JP011-020）写入 `losp_vol2_prices.json`
- packPrices 分别放入各自文件
- 简化 merge 脚本中 LOSP 路由逻辑（不再根据编号前缀判断写哪个母包文件）

---

## 向后兼容

### localStorage 中已保存的背包数据

旧存档中的 inventory 条目没有 `cardSetCode` 字段：
- `card.cardSetCode` 为 `undefined` → 传入 PriceSystem 时返回 null → 显示价格为 0
- **不会报错**，只是旧存档中的卡暂时不显示价格
- 用户重新开包获得的新卡会自动带上 `cardSetCode`

这是可接受的降级行为，无需做复杂的旧数据迁移。

---

## 验证计划

### 1. 迁移脚本验证

```bash
cd /c/Users/chihayadu/Desktop/Github/YGOCardGame
local/venv/Scripts/python.exe tools/migrate_price_keys.py
```

检查：
- 5 个输出文件都存在
- LOCH 文件无 LOSP 条目
- LOCR 文件无 LOSP 条目
- LOSP vol1 有 10 个条目（JP001-010）
- LOSP vol2 有 10 个条目（JP011-020）
- 所有 key 都是 setNumber 格式（包含 `-JP`）
- 条目总数 = 迁移前总数

### 2. 本地浏览器验证

```bash
python -m http.server 8000
```

- 打开 `http://localhost:8000`
- 开包 LOCH / LOCR / BLZD，确认卡片显示价格（非"暂无报价"）
- 打开背包，确认总价值计算正确
- Console 输出 `💰 价格系统初始化完成：XX 张卡的价格数据已加载`（数量应与迁移前一致）
- Console 无报错

### 3. Chrome DevTools 验证

```javascript
PriceSystem.getStatus()
// 预期：loadedFiles 包含 5 个文件
// 预期：totalCards 数量与旧版一致

PriceSystem.getCardPrice('LOCH-JP001', 'UR')
// 预期：返回 0.5（非 null）

PriceSystem.getCardPrice('LOSP-JP001', 'PSER-OF')
// 预期：返回价格值（非 null）
```

---

## 执行顺序建议

1. 先写并运行迁移脚本（第 1 步）→ 确认数据文件正确
2. 改前端代码（第 2、3 步）→ 本地验证
3. 改 merge_prices.py（第 4 步）→ 用 dry-run 模式验证
4. 全部提交到 dev 分支，浏览器验证通过后合并到 main
