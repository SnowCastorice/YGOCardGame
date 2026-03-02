# 📊 数据源架构

> 从 DEVELOPMENT.md 拆分，详述 OCG/TCG 数据获取方案、服务端代理和文件结构。

## OCG 模式（v1.4.0+ 本地数据优先）

> **零 API 调用**：卡牌数据内嵌在 JSON 文件中，加载几乎瞬时。

| 维度 | 来源 | 说明 |
|------|------|------|
| **卡包列表** | `data/ocg/packs.json` | 卡包元信息索引（轻量级） |
| **卡牌收录** | `data/ocg/cards/*.json` | 每个卡包独立文件，含 cardIds + cardData |
| **卡牌详情** | `cardData` 节点（本地） | 由 `build_pack_data.py` 从 `cards.json` 提取注入 |
| **中文名** | `cardData.cn_name`（本地） | 不再调用 YGOCDB API |
| **卡图** | YGOCDB CDN (`cdn.233.momobako.com`) | 日文版卡图（默认图源），新卡包可通过 `imageMapFile` 切换到 S3 CDN |
| **本地卡图** | `data/ocg/images/{packCode}/`（可选） | 通过 `localImagesDir` 配置，优先从本地加载卡图，避免依赖国外 CDN（v1.5.33+） |
| **卡图映射** | `data/ocg/loch_image_map.json`（可选） | 卡密→S3 CDN objectId 映射表，解决新卡包图源更新不及时问题（v1.5.28+） |
| **稀有度** | `cardIds[].rarityVersions` | 手动配置在卡包文件中，定义参见 `data/common/rarities.json` |
| **API 回退** | YGOProDeck + YGOCDB | 仅当卡包未构建本地数据时才调用 |

**工作流程**：
```
页面加载 packs.json（轻量索引）
    ↓
用户点击卡包 → 加载 ocg_blzd.json（含 cardData 节点）
    ↓
buildOCGCardsFromLocalData()（纯本地转换）
    ↓
直接开包！卡图从 CDN 加载
```

## TCG 模式（暂停开发）

> ⚠️ TCG 开发已暂停，入口默认隐藏。

| 维度 | 来源 | 说明 |
|------|------|------|
| **卡包列表** | YGOCDB (`ygocdb.com/packs`) | 在线获取 |
| **卡牌收录** | YGOProDeck API (`?cardset=xxx`) | 自动返回全部卡牌 + 稀有度 |
| **卡图** | YugiohMeta S3 CDN + YGOProDeck CDN | 英文版卡图 |
| **稀有度** | YGOProDeck API | `card_sets.set_rarity` 自动映射 |

## 外部 API 限流规范

> ⚠️ **违反限流规则可能导致 API 被永久封禁！**

| API | 限流规则 | 安全间隔 |
|---|---|---|
| **YGOProDeck** | 20 req/s | 300ms |
| **YGOCDB** | 无明确限制 | 300ms |
| **CDN 图源** | 宽松 | 300ms |

**必须遵守**：
1. 所有请求经过全局节流器 `requestThrottler`（间隔 ≥ 300ms）
2. 禁止无间隔循环请求
3. 新增 API 调用使用 `requestThrottler.waitForNext()` 或已有封装函数
4. 遇到 403/429 执行退避重试（2s × 尝试次数）

## 服务端代理（Cloudflare Pages Functions）

| 接口 | 路径 | 说明 |
|------|------|------|
| KONAMI 卡图代理 | `/api/card-image?cid=<CID>` | 代理 KONAMI 官网卡图（当前因 WAF 限制无法获取真实卡图） |
| 开包统计 API | `/api/pack-stats` | POST 上报开包数据 / GET 查询统计（需 KV 绑定 `PACK_STATS`） |

文件位置：`functions/api/card-image.js`、`functions/api/pack-stats.js`

## 卡包封面图来源（多级 fallback）

| 优先级 | 来源 |
|--------|------|
| 1 | `packs.json` 中的 `coverImage` 字段（手动配置） |
| 2 | `packs.json` 中的 `coverCardId` → 对应卡图 |
| 3 | 本地封面 `data/ocg/covers/{packCode}.png` |
| 4 | YGOProDeck set_image（TCG 卡包） |
| 5 | 异步加载 cardFile → 首张卡的 CDN 卡图 |
| 6 | emoji 🎴（兜底） |

## 关键数据文件

| 文件 | 用途 |
|------|------|
| `js/currency.js` | 货币系统核心模块 |
| `js/inventory.js` | 背包系统核心模块 |
| `js/pack-stats.js` | 开包统计模块（本地 + 全球） |
| `data/ocg/packs.json` | OCG 卡包元信息 |
| `data/ocg/cards/*.json` | OCG 各卡包独立卡牌列表 |
| `data/tcg/packs.json` | TCG 卡包配置表 |
| `data/tcg/yugiohmeta_map.json` | TCG 卡图映射表 |
| `data/changelog.json` | 更新日志（网页内展示） |
| `data/fallback_cards.js` | 离线兜底卡牌数据 |
| `data/common/cards.json` | YGOCDB 全量数据库（12MB，13900+ 张卡），通过 `update_cards_db.py` 自动更新 |
| `data/common/rarities.json` | 全局稀有度定义文件，管理所有稀有度元数据（名称/描述/颜色/分类等） |

### OCG 卡包数据目录结构

```
data/ocg/
├── packs.json           ← 卡包元信息索引
├── pack_list.json       ← 完整卡包目录
├── loch_image_map.json  ← LOCH 卡图映射表（metaId / altMetaId）
├── covers/              ← 本地封面图（{packCode}.png）
├── images/              ← 本地卡图目录（v1.5.33+）
│   └── loch/            ← LOCH 卡图（196 个 webp 文件，约 7.3MB）
└── cards/               ← 独立卡牌列表文件
    ├── ocg_blzd.json
    ├── ocg_ch02.json
    └── ocg_25db.json
```

### KONAMI 官方商品参考数据

```
pack_references/konami_official_products/
├── basic_packs.json       ← 基本卡包（16 个）
├── structure_decks.json   ← 预组卡组（16 个）
├── concept_packs.json     ← 概念卡包（16 个）
└── special_packs.json     ← 特殊卡包（16 个）
```

数据源：https://www.yugioh-card.com/japan/products/（采集日期 2026-02-27）