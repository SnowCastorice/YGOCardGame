# AI 协作开发指南

> **重要提示：每次开始新的工作会话时，AI 助手必须首先阅读本文件，以确保工作连续性和规范一致性。**
>
> **重要提示：每次对话结束后，如果有重要信息更新（如新增功能、架构变更、数据源变更、待处理事项等），AI 助手必须及时将这些信息同步更新到本文件中，保持本文件始终反映项目最新状态。**

## 👤 关于我

- 我是一名**游戏策划**，代码水平较低，请用**通俗易懂的语言**与我沟通技术问题
- 虽然技术能力有限，但我**愿意尝试新的实现方式和技术**，只要解释清楚即可
- 如果涉及复杂操作，请提供**分步骤的指引**

## 💻 开发环境

- 我可能需要**移动办公**，会在不同设备上继续开发
- 我可能会**更换不同的 AI 模型**来协助开发
- 因此，项目结构和代码注释需要**清晰明了**，方便任何 AI 快速理解和接手
- 关键决策和设计思路应记录在代码注释或文档中
- **默认终端为 Git Bash**（非 PowerShell / CMD），AI 助手执行终端命令时应使用 Bash 语法

## 📱 Chrome DevTools MCP 调试规范

- 使用 Chrome DevTools MCP 截图调试时，应**先将页面模拟为手机分辨率**（用户常用 **Xiaomi 14** 设备，**400×890** 分辨率），再进行截图查看
- 用户日常开发也是以手机分辨率模式调试的，所有 UI 调试均以移动端视图为准
- **【必须】测试过程中生成的所有截图、日志等临时文件，必须保存到 `test_output/` 目录下**（路径：`c:\Users\chihayadu\Desktop\Github\YGOCardGame\test_output`），**严禁保存到桌面或其他目录**
## 📋 开发规范

1. **版本管理**：每次提交都要维护好相应的版本记录
2. **更新日志**：网页内必须呈现更新日志，让用户可见
3. **代码注释**：使用中文注释，保持简洁清晰
4. **提交说明**：Git 提交信息使用中文，简要说明改动内容
5. **⚠️ 资源版本号（缓存破坏）**：每次更新 JS/CSS 代码后，**必须同步更新** `index.html` 中所有资源引用的 `?v=` 版本号（如 `?v=1.1.1` → `?v=1.1.2`），否则用户浏览器会缓存旧文件导致新功能不生效。需要更新的位置包括：
   - `<link>` 标签中的 CSS 文件引用
   - `<script>` 标签中的 JS 文件引用
   - 页脚的版本号文字显示
## ⚠️ API 限流规范（严格遵守）

> **违反限流规则可能导致 API 被永久封禁，这将直接导致整个项目无法运行！**

### 外部 API 及其限制

| API | 用途 | 限流规则 | 当前安全间隔 |
|---|---|---|---|
| **YGOProDeck** (`db.ygoprodeck.com`) | 卡牌数据（主数据源） | 免费版：**20 requests/second** | 300ms（~3次/秒） |
| **YGOCDB** (`ygocdb.com`) | 中文卡名补充 | 无明确限制，但应友好使用 | 300ms（共享节流器） |
| **YGOCDB CDN** (`cdn.233.momobako.com`) | 日文版卡图 | CDN，限制宽松 | 300ms（图片预加载） |
| **YGOProDeck CDN** (`images.ygoprodeck.com`) | 英文版卡图（TCG 备用） | CDN，限制宽松 | 300ms（图片预加载） |
| **YugiohMeta S3 CDN** (`s3.duellinksmeta.com`) | TCG 英文卡图（主图源） | CDN，无 WAF 拦截 | 无限流（前端直连） |
| **YugiohMeta API** (`yugiohmeta.com`) | 映射表构建（离线脚本用） | 无明确限制，保守使用 | 500ms（脚本中） |

### 开发中必须遵守的规则

1. **所有 API 请求必须经过全局节流器** (`requestThrottler`)，确保任意两个请求之间至少间隔 `REQUEST_INTERVAL`（当前 300ms）
2. **禁止在循环中无间隔地发起 API 请求**，即使是测试代码也不可以
3. **新增 API 调用时**，必须使用 `requestThrottler.waitForNext()` 或通过已有的 `apiRequestYGOProDeck` / `fetchCardFromYGOCDB` 函数（它们内部已集成节流器）
4. **遇到 403/429 响应时**，必须执行退避重试（当前实现：2s × 尝试次数），绝不可以立即重试
5. **编写测试脚本访问外部 API 时**，也必须加入足够的请求间隔（至少 300ms），不得快速连续请求
6. **`REQUEST_INTERVAL` 的值不得低于 200ms**，修改前需评估对限流的影响

## 🧪 功能自测规范（严格遵守）

> **每次完成功能开发或修复后，AI 助手必须进行代码自测，确认功能可正常工作后再提交。**

### 自测检查清单

完成代码编写后，**提交前**必须依次确认以下内容：

1. **调用链完整性**：新增的函数/事件绑定是否被正确调用？
   - 检查函数定义后，是否在初始化流程（如 `DOMContentLoaded`）中被实际调用
   - 不能只定义函数而忘记在入口处调用它
   - 特别注意：如果新增了 `bindXxx()` 类的事件绑定函数，必须确认它在初始化流程中被调用

2. **DOM 元素存在性**：JS 中引用的 DOM 元素 ID 是否在 HTML 中存在？
   - 新增的 `document.getElementById('xxx')` 是否在 `index.html` 中有对应元素
   - 元素的 class 名是否与 CSS 中的选择器一致

3. **CSS 样式生效**：新增的 CSS 选择器是否能匹配到对应的 HTML 元素？
   - class 名拼写是否一致
   - 样式优先级是否会被覆盖

4. **数据字段匹配**：JS 中读取的数据字段是否与 API 返回 / 数据源中的字段一致？
   - 如 `card.imageLargeUrl`、`card.nameCN` 等字段是否在数据流中正确传递

5. **事件冒泡/委托**：使用事件委托时，`e.target.closest()` 的选择器是否正确？
   - 确认选择器能匹配到目标元素

6. **移动端兼容**：在移动端分辨率下功能是否正常？
   - 触摸事件是否与 click 事件兼容
   - 弹窗/遮罩层是否能正确关闭

### 自测流程

```
代码编写完成
    ↓
通读代码，逐项检查上述清单
    ↓
确认所有检查项通过
    ↓
提交代码
```

## 🎯 设计优先级

1. **移动端专属体验** — 网页只面向手机用户，桌面端显示效果与移动端完全一致（居中展示）
2. **适配不同手机宽度和刘海屏** — 使用 `viewport-fit=cover` + `safe-area-inset` 确保所有设备安全显示
3. **CSS 不使用媒体查询** — v1.4.3 起移除所有 `@media` 断点，移动端样式即默认样式，桌面端 `max-width: 500px` 居中显示

## 🔗 项目信息

- **GitHub 仓库**：https://github.com/SnowCastorice/YGOCardGame
- **线上地址**：https://ygocardgame.pages.dev/
- **部署平台**：Cloudflare Pages（纯静态部署，无需构建命令）

## 📊 数据源架构

> **v1.4.0 架构重构：OCG 本地数据优先，零 API 调用**
>
> OCG 和 TCG 采用**不同的数据获取方案**，这是经过讨论后确定的重要架构决策。

### OCG 模式（v1.4.0+ 本地数据优先）

| 维度 | 来源 | 说明 |
|------|------|------|
| **卡包列表** | `data/ocg/packs.json` | 卡包元信息索引（轻量级） |
| **卡牌收录** | `data/ocg/cards/*.json` | 每个卡包独立文件，含 cardIds + cardData |
| **卡牌详情** | `cardData` 节点（本地） | 由 `build_pack_data.py` 从 `cards.json` 提取注入，含中/日/英文名、攻防、效果 |
| **中文名** | `cardData.cn_name`（本地） | 直接从本地数据读取，不再调用 YGOCDB API |
| **卡图** | YGOCDB CDN (`cdn.233.momobako.com`) | 日文版卡图（仅卡图从 CDN 加载） |
| **稀有度** | `cardIds[].rarityCode` + `rarityVersions` | 手动配置在卡包文件中 |
| **API 回退** | YGOProDeck + YGOCDB | 仅当卡包未构建本地数据时才调用 API |

**工作流程（零 API 调用）**：
```
页面加载 packs.json（轻量索引）
    ↓
用户点击卡包 → 加载 ocg_blzd.json（含 cardData 节点）
    ↓
buildOCGCardsFromLocalData()（纯本地转换）
    ↓
直接开包！卡图从 CDN 加载
```

### TCG 模式（暂停开发，仅测试）

> ⚠️ TCG 开发已暂停，入口默认隐藏，可在开发者工具中开启测试模式

| 维度 | 来源 | 说明 |
|------|------|------|
| **卡包列表** | YGOCDB (`ygocdb.com/packs`) | 同 OCG |
| **卡牌收录** | YGOProDeck API (`?cardset=xxx`) | 只需 `setCode`，API 自动返回全部卡牌 + 稀有度 |
| **卡牌详情** | YGOProDeck API（默认英文） | 同上一步自动获取 |
| **中文名补充** | YGOCDB API | 同 OCG |
| **卡图** | YugiohMeta S3 CDN (`s3.duellinksmeta.com`) | 英文版卡图（WebP 格式，无 WAF，通过预构建映射表查询） |
| **卡图 Fallback** | YGOProDeck CDN (`images.ygoprodeck.com`) | 英文版卡图（映射表中找不到的卡用这个） |
| **稀有度** | YGOProDeck API | `card_sets.set_rarity` 自动映射 |

### 关键区别

- **OCG** 本地数据优先，卡牌数据内嵌在 JSON 文件中，零 API 调用，加载几乎瞬时
- **TCG** 需要通过 YGOProDeck API 实时获取，加载较慢（开发已暂停）
- OCG 的全量数据库 `data/common/cards.json`（12MB）来源于 YGOCDB，含 13900+ 张卡的完整信息

### 卡包封面图来源（v1.0.1 新增）

卡包列表中的封面图采用多级 fallback 策略，按优先级：

| 优先级 | 来源 | 适用场景 |
|--------|------|----------|
| 1 | `packs.json` 中的 `coverImage` 字段 | 手动配置的自定义封面 URL（OCG 使用 Yugipedia 日文封面） |
| 2 | `packs.json` 中的 `coverCardId` 字段 → 对应卡图 | 手动指定某张卡的卡图作为封面 |
| 3 | 本地封面图 `data/ocg/covers/{packCode}.png` | OCG 卡包：Yugipedia 上找不到封面时，用户手动放置的本地图片 |
| 4 | YGOProDeck set_image：`images.ygoprodeck.com/images/sets/{packCode}.jpg` | TCG 卡包（官方封面图，✅ 自动获取） |
| 5 | 异步加载 `cardFile` → 首张卡的 YGOCDB CDN 卡图 | OCG 卡包（所有图源均失败时的自动 fallback） |
| 6 | emoji 🎴 | 所有图源均失败时的兜底 |

**OCG 封面图来源**：Yugipedia (`ms.yugipedia.com`)，通过 MediaWiki API 查询日文版卡包封面图 URL，手动写入 `coverImage` 字段。
**本地封面图目录**：`data/ocg/covers/`，命名规则为 `{packCode}.png`（如 `BLZD.png`），适用于 Yugipedia 上找不到的卡包。
**扩展方式**：在 `packs.json` 中给卡包添加 `"coverCardId": 卡牌密码`（数字），即可使用该卡的卡图作为封面。

## 🌐 服务端代理（Cloudflare Pages Functions）

> **v0.9.2 架构变更：KONAMI 卡图代理从独立 Worker 迁移到 Pages Functions**

由于 Cloudflare `workers.dev` 域名在国内被墙，原先独立部署的 Worker（`konami-image-proxy.snow961003.workers.dev`）无法访问。
现已将代理逻辑迁移为 **Cloudflare Pages Functions**，直接集成在本项目中，访问路径为：

| 接口 | 路径 | 说明 |
|------|------|------|
| KONAMI 卡图代理 | `/api/card-image?cid=<CID>` | 代理 KONAMI 官网卡图，绕过 WAF 跨域限制 |

### 文件位置

```
functions/
└── api/
    └── card-image.js    ← KONAMI 卡图代理（Pages Function）
```

### 工作原理

Cloudflare Pages 会自动检测项目根目录下的 `functions/` 文件夹，将其中的 JS 文件部署为无服务器函数。
文件路径即为 API 路径：`functions/api/card-image.js` → `https://ygocardgame.pages.dev/api/card-image`

### 历史文件

`cloudflare-worker/konami-image-proxy.js` 为原独立 Worker 代码，已弃用，保留作为参考。

## 🛠️ 工具脚本

### `build_pack_data.py` — OCG 卡包数据构建脚本（v1.4.0 新增）

从 `data/common/cards.json`（YGOCDB 全量数据库）提取卡牌详情，注入到 `data/ocg/cards/*.json` 文件中。
构建后的卡包文件包含完整的卡牌信息（中文名/日文名/英文名/攻防/效果），网页运行时无需调用任何 API。

| 命令 | 说明 |
|------|------|
| `python build_pack_data.py` | 构建所有 OCG 卡包（将 cardData 注入到每个卡包文件） |
| `python build_pack_data.py ocg_blzd` | 只构建指定卡包 |
| `python build_pack_data.py --check` | 检查哪些卡在 cards.json 中找不到（不修改文件） |
| `python build_pack_data.py --info` | 查看 cards.json 统计信息 |

**⚠️ 重要**：每次新增或更新卡包后，必须运行此脚本以确保本地数据完整。

### `fetch_packs.py` — 卡包数据抓取工具

从 YGOCDB 网站抓取卡包数据的离线 Python 脚本（需要 Python 3.x 环境）。

| 命令 | 说明 |
|------|------|
| `python fetch_packs.py list ocg` | 列出 OCG 卡包列表（默认最新 20 个，可加 `--limit 50`） |
| `python fetch_packs.py list tcg` | 列出 TCG 卡包列表 |
| `python fetch_packs.py fetch <ID>` | 获取指定卡包的卡牌收录（YGOCDB_ID） |
| `python fetch_packs.py fetch <ID> --write` | 获取并写入独立卡牌文件 `data/ocg/cards/{packId}.json` + 更新 `packs.json` 元信息 |
| `python fetch_packs.py latest ocg` | 获取最新一期 OCG 补充包 |
| `python fetch_packs.py gen-list` | 更新 `data/ocg/pack_list.json` 和 `data/tcg/pack_list.json` 卡包列表文件 |

### `fetch_yugiohmeta.py` — YugiohMeta 卡图映射表构建工具

从 YugiohMeta (`yugiohmeta.com`) API 批量查询卡牌密码到 S3 CDN 图片 ID 的映射，生成 `data/tcg/yugiohmeta_map.json`。

| 命令 | 说明 |
|------|------|
| `python fetch_yugiohmeta.py build-all` | 为所有已配置的 TCG 卡包构建映射（增量更新，不会覆盖已有） |
| `python fetch_yugiohmeta.py build "<setCode>"` | 为指定卡包构建映射（如 `"Maze of Muertos"`） |
| `python fetch_yugiohmeta.py test <password>` | 测试单张卡的映射（如 `89631141`） |
| `python fetch_yugiohmeta.py info` | 查看已有映射表信息 |

## 📁 关键数据文件

> **v0.9.1 架构优化：OCG 卡牌列表拆分为独立文件**

| 文件 | 用途 | 更新方式 |
|------|------|----------|
| `js/currency.js` | 货币系统核心模块（货币定义、余额管理、兑换逻辑、localStorage 持久化） | 修改货币配置时编辑 |
| `js/inventory.js` | 背包系统核心模块（卡片收集、持久化、统计、排序） | 修改背包逻辑时编辑 |

| 文件 | 用途 | 更新方式 |
|------|------|----------|
| `data/ocg/packs.json` | OCG 卡包元信息（卡包定义 + cardFile 引用，不含卡牌列表） | `fetch_packs.py fetch <ID> --write` 或手动编辑 |
| `data/ocg/cards/*.json` | OCG 各卡包的独立卡牌列表（每个卡包一个文件） | `fetch_packs.py fetch <ID> --write` 自动生成 |
| `data/tcg/packs.json` | TCG 卡包配置表（只需 setCode，较简洁） | 手动编辑 |
| `data/tcg/yugiohmeta_map.json` | TCG 卡图映射表（password → S3 CDN _id） | `python fetch_yugiohmeta.py build-all` |
| `data/ocg/pack_list.json` | OCG 完整卡包目录（1400+），来源 YGOCDB | `python fetch_packs.py gen-list` |
| `data/tcg/pack_list.json` | TCG 完整卡包目录（900+），来源 YGOCDB | `python fetch_packs.py gen-list` |
| `data/changelog.json` | 更新日志，网页内展示给用户 | 每次版本更新时手动维护 |
| `data/fallback_cards.js` | 离线兆底卡牌数据 | 需要时手动更新 |

### OCG 卡包数据存储结构（v0.9.1+）

```
data/ocg/
├── packs.json           ← 卡包元信息索引（轻量级，不含卡牌列表）
├── pack_list.json       ← 完整卡包目录
├── covers/              ← OCG 卡包本地封面图（命名: {packCode}.png）
│   └── README.txt       ← 使用说明
└── cards/               ← 每个卡包的独立卡牌列表文件
    ├── ocg_blzd.json    ← BLAZING DOMINION 的卡牌列表
    ├── ocg_ch02.json    ← THE CHRONICLES DECK 的卡牌列表
    └── ocg_25db.json    ← DUELIST BOX 的卡牌列表
```

### KONAMI 官方商品信息参考（v1.4.6+ 新增）

```
pack_references/konami_official_products/
├── basic_packs.json       ← 基本卡包（基本パック）16 个，2022.07 ~ 2026.04
├── structure_decks.json   ← 预组卡组（構築済みデッキ）16 个，2021.08 ~ 2026.01
├── concept_packs.json     ← 概念卡包（コンセプトパック）16 个，2023.11 ~ 2026.06
└── special_packs.json     ← 特殊卡包/套装（スペシャルパック/セット）16 个，2022.04 ~ 2026.03
```

**数据来源**：https://www.yugioh-card.com/japan/products/
**采集日期**：2026-02-27
**包含字段**：商品名称、packCode、分类（中日双语）、发售日期（中日双语）、含税/不含税价格、封面图 URL、商品详情页 URL、限定销售渠道（部分）
**注意**：当前仅采集了各分类首页展示的商品（近 3~4 年），早期商品待后续补充录入。

**工作流程**：页面加载时只读取轻量级的 `packs.json`，当用户点击某个卡包时，才动态加载该卡包的 `cards/{cardFile}` 文件。
## 🎒 背包系统（v1.1.0 新增）

### 架构设计

- 独立模块 `js/inventory.js`，通过全局对象 `InventorySystem` 暴露 API
- 数据存储在浏览器 `localStorage` 中（key: `ygo_inventory_data`）
- 开包后自动将获得的卡片存入背包，重复卡片自动合并计数
- 重置游戏时同步清空背包数据（`devResetGame` 中调用 `InventorySystem.clearAll()`）

### 主要功能

| 功能 | 说明 |
|------|------|
| **导航栏角标** | 背包按钮上显示已收集的卡片种类数 |
| **开包自动入库** | 每次开包的 5 张卡自动存入背包 |
| **背包弹窗** | 展示所有收集的卡片，含统计概览（种类数/总张数/总价值） |
| **四种排序** | 稀有度 / 数量 / 价格 / 最新获取 |
| **卡图展示** | 卡图 + 稀有度角标 + 数量角标，点击可放大查看 |

### 稀有度临时价格（后续可替换）

| 稀有度 | 英文名 | 价格 | 配色 |
|--------|--------|------|------|
| PSER | Prismatic Secret Rare（棱镜秘密闪） | 2000🪙 | #ff6ec7（粉紫） |
| UTR | Ultimate Rare（终极闪） | 1500🪙 | #e0e0e0（铂金） |
| SER | Secret Rare（秘密闪） | 1000🪙 | #00e5ff（青蓝） |
| UR | Ultra Rare（极稀有） | 500🪙 | #ffd700（金色） |
| SR | Super Rare（超稀有） | 200🪙 | #c850c0（紫色） |
| R | Rare（稀有） | 50🪙 | #4a9eff（蓝色） |
| NR | Normal Rare（普通闪） | 20🪙 | #c0c0d0（银白） |
| N | Common（普通） | 10🪙 | #a0a0a0（灰色） |

> 稀有度等级排序（高→低）：PSER > UTR > SER > UR > SR > R > NR > N

### 公开 API

| 方法 | 说明 |
|------|------|
| `InventorySystem.addCard(card)` | 添加一张卡片到背包 |
| `InventorySystem.getCard(cardId)` | 查询指定卡片（返回 `{...card, count, rarityVersionsOwned}` 或 `null`） |
| `InventorySystem.getCardVersions(cardId)` | 获取指定卡片各稀有度版本的收集数量（返回如 `{ "SR": 2, "SER": 1 }`） |
| `InventorySystem.getAllCards()` | 获取所有卡片数组 |
| `InventorySystem.clearAll()` | 清空所有卡片数据 |
| `InventorySystem.updateBadge()` | 更新导航栏角标数字 |

## 🔍 卡片预览功能（v1.2.0 新增）

### 功能说明

在卡包列表界面，每个卡包采用**横向卡片布局**（左图右文），价格和预览按钮作为独立的操作按钮放在右侧信息区底部。点击预览按钮后自动加载卡包数据并弹出预览弹窗，展示该卡包内**所有可开出的卡片**。玩家无需先进入开包界面即可查看卡包内容，减少操作步骤。

### 核心特性

| 特性 | 说明 |
|------|------|
| **横向卡片布局** | 卡包封面在左（固定高度），信息在右（卡名、编码·发售日期、金币价格），BEM 命名（`.pack-card__cover` / `.pack-card__info`） |
| **卡图预览入口** | 卡图右上角半透明放大镜图标（`.pack-card__preview-icon`），hover 显示，移动端始终可见；点击卡图/图标进入预览界面 |
| **金币价格胶囊** | 价格标签（`.pack-card__price`）位于卡名下方，小胶囊样式，不再占用独立操作行 |
| **收集进度条** | 显示 `已拥有/总数 (百分比%)`，带可视化进度条 |
| **稀有度分布** | 标签形式展示 UR、SR、R、N 各多少张 |
| **已拥有/未拥有区分** | 已拥有：正常显示 + 绿色数量角标；未拥有：**灰度 + 降低透明度 + 🔒 图标** |
| **四种排序** | 编号（默认，按卡包内编号如 BLZD-JP001 排序）、稀有度、已拥有优先、名称排序 |
| **点击放大** | 点击任意卡片可弹出大图查看（复用已有的卡图查看器） |

### 涉及文件

| 文件 | 变更 |
|------|------|
| `index.html` | 预览弹窗 HTML 结构 |
| `js/game.js` | `showCardPreview(pack)` / `hideCardPreview` / `renderCardPreview(sortBy, cards, pack)` 函数 + `renderPackList` 中使用横向卡片布局，点击卡图区域触发预览，点击右侧信息区触发开包 |
| `css/style.css` | `.pack-card`（横向 flex 布局、固定高度）、`.pack-card__cover`（左侧封面）、`.pack-card__info`（右侧信息）、`.pack-card__preview-icon`（右上角半透明放大镜叠加图标）、`.pack-card__price`（金币胶囊）+ 预览弹窗完整样式（进度条、灰度效果、网格布局、响应式适配） |

### 数据依赖

- 卡包卡牌列表：`showCardPreview` 接受 `pack` 参数，自动加载对应的 cardFile 和 API 数据
- 已拥有判断：通过 `InventorySystem.getCard(cardId)` 查询背包

## 💰 货币系统（v1.0.0 新增）

### 架构设计

- 支持多种货币，通过 `CURRENCY_DEFS` 字典定义，新增货币只需加一个条目
- 兑换比例通过 `EXCHANGE_RATES` 字典定义，支持任意方向的货币兑换
- 余额数据存储在浏览器 `localStorage` 中（key: `ygo_currency_data`）

### 当前货币

| 货币 | ID | 图标 | 初始赠送 | 用途 |
|------|----|----|---------|------|
| 金币 | `gold` | 🪙 | 10000 | 开包消耗 |
| 钻石 | `diamond` | 💎 | 10 | 开包消耗（高级货币） |

### 兑换比例

| 方向 | 比例 |
|------|------|
| 金币 → 钻石 | 10 🪙 = 1 💎 |
| 钻石 → 金币 | 1 💎 = 10 🪙 |

### 卡包价格配置

在 `packs.json` 中每个卡包新增两个字段：
- `price`: 开包所需货币数量（整数）
- `currency`: 使用的货币类型（`"gold"` 或 `"diamond"`）

当前所有卡包均设为 100 金币。

## 📝 近期变更记录

### v1.5.2（2026-02-27）— +1辅助包专属卡池 + 卡图放大修复
- 辅助包使用专属卡池（`supplementPack` 节点，BLZD-JPS01~JPS20 共 20 张卡），不再从主卡池抽取
- 补全辅助包 20 张卡的 ID 和 `cardData`，通过 `build_pack_data.py` 注入完整卡牌信息
- `api.js` 新增 `buildSupplementCardsFromLocalData` 函数，加载卡包时同时构建辅助包卡池
- 修复辅助包卡片无法点击放大查看的问题（给 `#bonus-cards` 容器绑定事件委托）
- 新增全局变量 `currentSupplementCards`，与 `currentPackCards` 生命周期同步

### v1.5.1（2026-02-27）— 新增「开整盒」（30包）选项
- 开包界面和结果界面新增「📦×30 开整盒」按钮，价格为单包价格 ×30
- 整盒按钮下方配有「整盒购入赠送 +1 辅助包」文字说明
- 按钮采用紫金渐变 + 光效动画样式，宽度 90%（大于开一包/开十包的 75%），形成视觉层级
- 余额不足时自动变灰并提示所需金额

### v1.5.0（2026-02-27）— 卡包锁定状态 UI
- 未开放的卡包（26PP、CH02、25DB）现以锁定状态展示，封面灰度 + 锁图标
- 锁定卡包无价格显示、无卡片预览、不可点击开包，显示"即将推出"提示
- packs.json 新增 `locked` 字段（布尔值），替代之前的 `hidden` 字段
- 新增 CSS 样式：`.pack-card--locked`（BEM 修饰符）、`.pack-card__lock-badge`（锁图标）、`.pack-card__locked-hint`（提示文字）

### v1.4.9（2026-02-27）— 开包界面新增收藏预览按钮
- 开包界面标题旁新增🔍收藏预览按钮，点击可直接预览当前卡包的所有卡片收集情况
- 复用已有的 `showCardPreview` 功能，无需返回卡包列表即可查看

### v1.4.8（2026-02-27）— 卡包分类选项卡 + 新增 PREMIUM PACK 2026
- 主页卡包列表新增分类选项卡：补充包、主题卡组、系列补充包、特殊包
- 分类字段 `category` 加入 packs.json 数据结构，支持 booster/structure/concept/special 四类
- 新增卡包 PREMIUM PACK 2026（26PP，系列补充包分类，32张卡）
- 25DB 归类为特殊包（当前特殊包页签显示"暂无卡包"的空态提示，25DB 待正式收录）

### v1.4.7（2026-02-26）— 开包界面封面图可点击放大查看
- 点击开包界面的卡包封面图弹出大图查看器，复用已有的 card-image-viewer

### v1.4.6（2026-02-26）— 代码质量清理
- `changelog.json` 补全 v1.4.4、v1.4.5 版本记录
- `game.js`：移除文件头过时的版本号注释；删除从未被调用的 `bindEvents()` 函数；提取 `rarityOrder` 为模块级常量 `RARITY_ORDER_ASC` / `RARITY_ORDER_DESC`，消除 3 处重复定义
- `style.css`：移除文件头过时的版本号注释；修复 `.viewer-hint` 重复的 `font-size` 声明；清理空注释残留
- `api.js`：删除空壳函数 `getCachedImageUrl`（仅透传 URL，无实际逻辑）及重复 JSDoc 注释，并从导出表中移除

### v1.4.5（2026-02-26）— 封面图加载优化
- 移除无效的 Cache API 缓存方案（外部图源不支持 CORS，`fetch` 每次失败后回退到 `img.src`）
- 改为直接设置 `img.src`，利用浏览器 HTTP 缓存实现二次进入秒显
- 缓存命中时（`img.complete === true`）跳过骨架屏和淡入动画
- 统一 `referrerpolicy="no-referrer"`，确保列表页和开包页缓存键一致

### v1.4.4（2026-02-26）— 开包界面 UI 优化
- 移除冗余的「开包花费」信息行（按钮和顶栏已显示价格与余额）
- 新增卡包封面图展示：标题下方显示封面，带骨架屏加载效果
- 「返回选择卡包」按钮整合到按钮容器中，布局更紧凑
- 优化按钮间距和整体排版

## ⏳ 待处理事项

> 以下是已确认但尚未完成的事项，请在后续开发中关注。

0. **🟡 KONAMI 官方商品数据补全**（进行中）
   - 已完成：四个分类首页展示的商品信息采集（各 16 个，共 64 个商品），保存在 `pack_references/konami_official_products/` 下
   - 待完成：各分类「もっと見る」（查看更多）内的早期商品数据录入
   - 数据源：https://www.yugioh-card.com/japan/products/

1. **🟡 OCG 稀有度问题**（BLZD 已完成真实数据录入，其他卡包仍为测试数据）
   - 原始问题：通过 YGOCDB 抓取的 OCG 卡包数据**不包含稀有度信息**，默认全部设为 "N"
- **BLZD 已完成**：已从 `pack_references` 手动整理真实稀有度数据，写入 `ocg_blzd.json`
   - 其他 OCG 卡包（CH02、25DB）仍为随机测试稀有度，后续需逐个替换为真实数据
   - 缓存同步：已在 `api.js` 的 `getOCGCardSetData` 中增加**稀有度同步逻辑**，缓存命中时自动用 `cards.json` 中最新的 `rarityCode` 覆盖缓存旧值
   - 影响范围：所有通过 `fetch_packs.py` 抓取的 OCG 卡包

3. **� 多版本稀有度系统**（已基本完成，概率待用户确认）
   - 数据结构：`ocg_blzd.json` 中每张卡新增 `rarityVersions` 数组，记录该卡所有稀有度版本（如 `["SR", "SER"]`）
   - `rarityCode` 字段保留为基础稀有度（兼容现有代码逻辑），`setNumber` 字段记录卡包编号（如 `"BLZD-JP001"`）
   - 辅助包（JPS01~JPS20）数据已启用，存储在 `supplementPack` 节点中，开整盒时从中随机抽 1 张
   - **已完成**：8种稀有度的完整 UI 样式支持（CSS 颜色/边框/角标/光效 + JS 排序/价格/名称映射）
   - 新增稀有度类型：NR（普通闪）、SER（秘密闪）、PSER（棱镜秘密闪）、UTR（终极闪）
   - **已完成**：OCG 默认抽卡方案实现（`packScheme: "ocg_default"`）
     - 每包 5 张：4 张 N 卡 + 1 张非 N 稀有卡
     - 同一包内卡片编号不重复
     - 非 N 卡若有多个稀有度版本（如 SR/SER/PSER），按 `versionOdds` 权重概率随机
     - 旧版方案（`packScheme: "legacy"`）保留兼容，用于 TCG 和未配置方案的卡包
   - **已完成**：`api.js` 全链路支持 `rarityVersions` 传递（获取→缓存→同步→抽卡）
   - **待用户确认**：`versionOdds` 各稀有度的实际概率权重（当前为临时值）
   - **TCG 抽卡方案**：挂起待补充
2. **🔴 KONAMI 卡图代理无法获取真实卡图**（挂起）
   - 当前状态：`functions/api/card-image.js` 代理已正确部署且功能正常，但 KONAMI 服务器对**所有服务端请求**（无论 Python/Cloudflare fetch/curl）统一返回 "Coming Soon" 占位图（200×290 PNG, ~40KB）
   - 根本原因：KONAMI 的 **Imperva WAF（Web 应用防火墙）** 要求客户端执行 JavaScript 挑战验证后才返回真实卡图，服务端代理无法通过此验证
   - 验证记录：已测试 type=1/2/4 参数、带 session Cookie、带 enc 参数等多种方式，均返回相同的占位图
   - 可行替代方案：
     - **方案 A**：使用 YGOProDeck / YGOCDB CDN 图源（项目中已集成，推荐）
     - **方案 B**：移除或禁用 KONAMI 卡图源，避免用户看到 "Coming Soon" 造成困惑
     - **方案 C**：通过浏览器预下载真实卡图，存储到自有 CDN（如 Cloudflare R2）
   - 待用户决定处理方案

4. **🟢 图片资源自建 CDN 方案（Cloudflare R2）**（后续规划，当前维持现状）
   - **当前状态（方案 C）**：使用第三方 CDN 加载图片，暂时够用
     - OCG 卡图：YGOCDB CDN (`cdn.233.momobako.com`)
     - 卡包封面：KONAMI 官网 (`img.yugioh-card.com`)
     - TCG 卡图：YugiohMeta S3 (`s3.duellinksmeta.com`) + YGOProDeck CDN (`images.ygoprodeck.com`)
   - **后续方案（方案 A）**：迁移到 Cloudflare R2 对象存储 + 自定义域名
     - **为什么选 R2**：项目已部署在 Cloudflare Pages，R2 零配置集成，免费额度充足（10GB 存储 + 每月 1000 万次读取）
     - **实施步骤**：
       1. Cloudflare 后台创建 R2 存储桶，绑定自定义域名（如 `cdn.ygocardgame.pages.dev`）
       2. 编写 Python 脚本批量下载卡图 → 压缩为 WebP（~20KB/张）→ 上传到 R2
       3. 修改代码中的 `CDN_SOURCES`，指向自有 CDN
       4. 保留原有图源作为 fallback
     - **预期收益**：
       - 图片加载速度提升（Cloudflare 全球 CDN 节点）
       - 可统一转 WebP + 压缩，体积减少约 60%
       - 彻底摆脱第三方 CDN 下线/封禁/防盗链风险
       - 解决 KONAMI 卡图 WAF 拦截问题（预下载后托管到 R2）
     - **触发时机**：当活跃卡包超过 10 个、或第三方 CDN 出现不稳定时启动
     - **成本**：免费（当前图片规模远低于 R2 免费额度）
