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

## � Chrome DevTools MCP 调试规范

- 使用 Chrome DevTools MCP 截图调试时，应**先将页面模拟为手机分辨率**（用户常用 **Xiaomi 14** 设备，**400×890** 分辨率），再进行截图查看
- 用户日常开发也是以手机分辨率模式调试的，所有 UI 调试均以移动端视图为准

## �📋 开发规范

1. **版本管理**：每次提交都要维护好相应的版本记录
2. **更新日志**：网页内必须呈现更新日志，让用户可见
3. **代码注释**：使用中文注释，保持简洁清晰
4. **提交说明**：Git 提交信息使用中文，简要说明改动内容

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

1. **移动端体验优先** — 网页主要面向手机用户，优先保证移动端的交互和显示效果
2. **PC 端次之** — 在移动端体验良好的基础上兼顾桌面端

## 🔗 项目信息

- **GitHub 仓库**：https://github.com/SnowCastorice/YGOCardGame
- **线上地址**：https://ygocardgame.pages.dev/
- **部署平台**：Cloudflare Pages（纯静态部署，无需构建命令）

## 📊 数据源架构

> OCG 和 TCG 采用**不同的数据获取方案**，这是经过讨论后确定的重要架构决策。

### OCG 模式

| 维度 | 来源 | 说明 |
|------|------|------|
| **卡包列表** | YGOCDB (`ygocdb.com/packs`) | 通过 `fetch_packs.py` 离线抓取 HTML 解析 |
| **卡牌收录** | YGOCDB (`ygocdb.com/pack/{id}`) | 从卡包详情页解析卡牌密码列表，写入 `cards.json` 的 `cardIds` |
| **卡牌详情** | YGOProDeck API (`?language=ja`) | 按密码批量获取 `?id=xxx,yyy` |
| **中文名补充** | YGOCDB API (`/api/v0/?search=`) | 补充中文卡名 `cn_name` |
| **卡图** | YGOCDB CDN (`cdn.233.momobako.com`) | 日文版卡图 |
| **稀有度** | ⚠️ 需手动配置 | YGOCDB 不提供稀有度信息（**待处理**） |

### TCG 模式

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

- **TCG** 只需一个 `setCode` 就能获取完整卡牌列表 + 稀有度（YGOProDeck 天然支持）
- **OCG** 需要预定义 `cardIds` 数组（YGOProDeck 的 OCG 数据覆盖率低），通过 YGOCDB 获取卡牌列表

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

**工作流程**：页面加载时只读取轻量级的 `packs.json`，当用户点击某个卡包时，才动态加载该卡包的 `cards/{cardFile}` 文件。
## 💰 货币系统（v1.0.0 新增）

### 架构设计

- 支持多种货币，通过 `CURRENCY_DEFS` 字典定义，新增货币只需加一个条目
- 兑换比例通过 `EXCHANGE_RATES` 字典定义，支持任意方向的货币兑换
- 余额数据存储在浏览器 `localStorage` 中（key: `ygo_currency_data`）

### 当前货币

| 货币 | ID | 图标 | 初始赠送 | 用途 |
|------|----|----|---------|------|
| 金币 | `gold` | 🪙 | 1000 | 开包消耗 |
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

## ⏳ 待处理事项

> 以下是已确认但尚未完成的事项，请在后续开发中关注。

1. **🔴 OCG 稀有度问题**（挂起）
   - 当前状态：通过 YGOCDB 抓取的 OCG 卡包数据**不包含稀有度信息**，默认全部设为 "N"
   - YGOCDB 的卡包详情页不提供稀有度字段
   - 需要用户决定处理方案：手动补充 / 其他数据源获取 / 使用默认分布
   - 影响范围：所有通过 `fetch_packs.py` 抓取的 OCG 卡包

2. **🔴 KONAMI 卡图代理无法获取真实卡图**（挂起）
   - 当前状态：`functions/api/card-image.js` 代理已正确部署且功能正常，但 KONAMI 服务器对**所有服务端请求**（无论 Python/Cloudflare fetch/curl）统一返回 "Coming Soon" 占位图（200×290 PNG, ~40KB）
   - 根本原因：KONAMI 的 **Imperva WAF（Web 应用防火墙）** 要求客户端执行 JavaScript 挑战验证后才返回真实卡图，服务端代理无法通过此验证
   - 验证记录：已测试 type=1/2/4 参数、带 session Cookie、带 enc 参数等多种方式，均返回相同的占位图
   - 可行替代方案：
     - **方案 A**：使用 YGOProDeck / YGOCDB CDN 图源（项目中已集成，推荐）
     - **方案 B**：移除或禁用 KONAMI 卡图源，避免用户看到 "Coming Soon" 造成困惑
     - **方案 C**：通过浏览器预下载真实卡图，存储到自有 CDN（如 Cloudflare R2）
   - 待用户决定处理方案
