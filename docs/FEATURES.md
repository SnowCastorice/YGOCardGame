# 🎮 功能模块说明

> 从 DEVELOPMENT.md 拆分，详述各核心功能模块的设计和 API。

## 🎒 背包系统（v1.1.0+）

- 独立模块 `js/inventory.js`，全局对象 `InventorySystem`
- 数据存储：`localStorage`（key: `ygo_inventory_data`）
- 开包后自动入库，重复卡片合并计数

### 主要功能

| 功能 | 说明 |
|------|------|
| 导航栏角标 | 已收集卡片种类数 |
| 开包自动入库 | 每次开包 5 张卡自动存入 |
| 背包弹窗 | 展示所有收集卡片 + 统计概览 |
| 四种排序 | 稀有度 / 数量 / 价格 / 最新获取 |

### 公开 API

| 方法 | 说明 |
|------|------|
| `addCard(card)` | 添加卡片到背包 |
| `getCard(cardId)` | 查询指定卡片（含 count、rarityVersionsOwned） |
| `getCardVersions(cardId)` | 获取各稀有度版本收集数量（如 `{ "SR": 2, "SER": 1 }`） |
| `getAllCards()` | 获取所有卡片数组 |
| `clearAll()` | 清空所有卡片 |
| `updateBadge()` | 更新导航栏角标 |

### 稀有度等级与临时价格

> 排序（高→低）：PSER > SER > UTR > UR > SR > R > NR > N

| 稀有度 | 价格 | 配色 |
|--------|------|------|
| PSER | 2000🪙 | #ff44cc（品红） |
| SER | 1500🪙 | #ff6fa8（玫瑰粉） |
| UTR | 1000🪙 | #e8a030（琥珀橙金） |
| UR | 500🪙 | #f5c842（暖金） |
| SR | 200🪙 | #b464e0（紫罗兰） |
| R | 50🪙 | #4a9eff（蓝色） |
| NR | 20🪙 | #a8b4c8（银蓝灰） |
| N | 10🪙 | #8e8e8e（暗灰） |

---

## 🔍 卡片预览 / 图鉴功能（v1.2.0+）

卡包列表界面每个卡包点击封面可预览该卡包所有卡片的收集情况。

### 核心特性

| 特性 | 说明 |
|------|------|
| 横向卡片布局 | 左图右文，BEM 命名 |
| 收集进度条 | `已拥有/总数 (百分比%)`，可展开查看各稀有度详情 |
| 稀有度分布 | 标签展示各稀有度数量 |
| 已拥有/未拥有 | 灰度 + 降低透明度 + 🔒 图标 |
| 四种排序 | 编号、稀有度、已拥有优先、名称 |
| +1 辅助包 | 主卡池下方展示辅助包区域（v1.5.18+） |
| LOCH 展开卡位 | 每张卡按稀有度版本展开为独立卡位（共318个），权重高的排前面（v1.5.30+） |
| 稀有度专属卡图 | LOCH 图鉴中每个稀有度卡位显示对应版本的卡图（OF超框卡版本使用超框卡图）（v1.5.30+） |

### 涉及函数

- `showCardPreview(pack)` — 加载卡包数据并弹出预览弹窗
- `renderCardPreview(sortBy, cards, pack, supplementCards)` — 渲染预览内容
- `hideCardPreview` — 关闭弹窗

---

## 💰 货币系统（v1.0.0+）

- 多货币支持（`CURRENCY_DEFS` 字典），余额存储于 `localStorage`
- 兑换逻辑通过 `EXCHANGE_RATES` 字典定义

### 当前货币

| 货币 | 图标 | 初始赠送 | 用途 |
|------|------|---------|------|
| 金币 | 🪙 | 10000 | 开包消耗 |
| 钻石 | 💎 | 10 | 高级货币 |

兑换比例：10 🪙 = 1 💎

卡包价格配置在 `packs.json` 中（`price` + `currency` 字段），当前均为 100 金币。

---

## 📦 开包系统

### OCG 默认方案（`packScheme: "ocg_default"`）
- 每包 5 张：4 张 N 卡 + 1 张非 N 稀有卡
- 同一包内卡片编号不重复
- 非 N 卡若有多版本（如 SR/SER/PSER），按 `versionOdds` 权重概率随机
- NR 卡归属 N 卡卡池，选中概率为普通 N 卡的 20%（`nrWeightRatio`）

### 整盒模式（`drawCardsBox_OCG`）
- 30 包按真实封入规则分配稀有度：1SER + 1UTR + 3UR + 6SR + 19R
- SER 位 25% 概率变 PSER
- 辅助包 PSER 与原盒 PSER 互斥（同盒最多 1 张 PSER）

### LOCH 专用方案（`packScheme: "loch_special"`，v1.5.28+）
- 全稀有包（38种UR + 42种SR），无 N/R 卡
- 每包 4 张：1号位SR + 2号位SR + 3号位UR + 4号位全卡池随机
- 1-3号位必出基础稀有度（SR/SR/UR），不走版本概率
- 4号位按 `versionOdds` 概率随机决定最终稀有度版本
- 去重规则：同包4个卡位不出完全相同的卡（同编号不同稀有度版本 ≠ 相同）

### LOCH 整盒模式（`drawCardsBox_LOCH`，15包）
- 1-3号位与散包相同
- 4号位按 `boxSlot4Distribution` 强制分配：1OF + 1PSER + 2UTR + 2CR + 9SER
- OF卡按 `ofTypeOdds` 概率决定类型：PSER-OF(25%) / UR-OF(71%) / GMR-OF(0.69%)
- 整盒4号位编号不重复（不同稀有度版本不算重复）
- 无辅助包（+1包）

### LOCH 多稀有度卡图映射（v1.5.30+）
- `loch_image_map.json` 中每张卡可配置 `altMetaId` 字段，记录特定稀有度使用的不同卡图ID
- `getCardImageUrl(password, imageMap, size, rarityCode)` 支持按稀有度加载对应卡图
- JP001-JP018 新卡有「普通版」和「OF超框卡版」两种卡图，UR-OF/PSER-OF/GMR-OF 使用超框卡图，UR/SER 使用普通卡图
- 开包时（`drawCards_LOCH`/`drawCardsBox_LOCH`）根据实际抽到的稀有度更新图片 URL
- 图鉴中 LOCH 卡包将每张卡的每个稀有度版本展开为独立卡位（共 318 个），同编号按权重降序排列

### 旧版方案（`packScheme: "legacy"`）
- TCG 和未配置方案的卡包使用