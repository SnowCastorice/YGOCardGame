# 📝 近期变更记录

> 从 DEVELOPMENT.md 拆分，记录各版本的变更和待处理事项。

## v1.7.9（2026-03-26）— 内存泄漏修复 + 卡包排序优化 + TODO 更新

### .gitignore 更新
- 新增 `screenshots/` 和 `*.bak` 忽略规则

### TODO 更新（`docs/TODO.md`）
- 新增第 9 条：修复连点页面时触发双击缩放的问题（快速连续点击导致页面放大）

## v1.7.9（2026-03-25）— 内存泄漏修复 + 卡包排序优化

### 背包弹窗内存泄漏修复（`js/inventory.js`、`js/game.js`）
- **根因**：每次打开背包弹窗都添加新的 scroll/click 事件监听器，关闭时从不清理，导致监听器和闭包中的卡片数据持续堆积
- 新增 `_scrollHandler` / `_clickHandler` 模块级变量，保存监听器引用
- `renderInventoryModal()` 开头先移除旧监听器再绑定新的
- scroll 事件添加 `requestAnimationFrame` 节流，避免每帧高频触发 DOM 操作
- 新增 `cleanupModal()` 方法，`hideInventory()` 关闭弹窗时调用

### 卡包排序优化（`js/game.js`）
- 所有标签页（特殊包/补充包/主题卡组/系列补充包）按发售日期从新到旧排序，与「近期发售」一致

## 文档整理 + INP 性能优化 + Stop Hook（2026-03-25）

### 说明文件查漏补缺
- **DEVELOPMENT.md**：版本号 v1.7.6 → v1.7.8，脚本路径 `ocr_price.py` → `ocr_workflow.py`
- **README.md**：版本号 badge v1.7.6 → v1.7.8，文档路径 `docs/DEVELOPMENT.md` → `DEVELOPMENT.md`
- **ARCHITECTURE.md**：`cards.json` 描述改为"已提交到 Git"，目录结构补充 locr/blzd 相关文件
- **CHANGELOG.md**：删除重复标题，末尾待处理事项替换为指向 TODO.md 的引用
- **FEATURES.md**：初始金币 10 万 → 100 万
- **CLAUDE.md 与 DEVELOPMENT.md 合并**：CLAUDE.md 整合了用户背景、发布流程、临时文件规范、业务规则等独有内容；DEVELOPMENT.md 精简为仅保留双设备 OCR 环境和 PaddleOCR MCP 配置
- **docs/TOOLS.md**：新增 `local/` 目录结构规范（PreviewCards 命名规范、OCRPricePics 归档规范）

### INP 性能优化（3 项）
- **P0: showResults() DocumentFragment 批量插入**（`js/game.js`）：主卡和附赠卡的 DOM 插入从逐个 `appendChild()` 改为 `DocumentFragment` 一次性批量插入，减少重排。影响 `#btn-quick-reopen`、`#btn-open-box`、`#btn-open-3box` 三个按钮
- **P1: 背包分批渲染 + 事件委托**（`js/inventory.js`）：`renderInventoryModal()` 首屏只渲染 30 张卡片，滚动到底部时追加下一批；排序按钮和卡片点击改为事件委托。新增 `buildCardItemsHtml()` 公共函数
- **P2: devResetGame() 自定义确认弹窗**（`js/game.js`、`index.html`、`css/style.css`）：新增 `#confirm-modal` 通用确认弹窗组件（z-index:500），替代原生 `confirm()`/`alert()` 阻塞对话框。新增 `showConfirmDialog()` 通用函数，成功/失败提示改用 `showDevtoolsToast()`

### Claude Code Stop Hook
- **新增 `.claude/hooks/session-end-check.sh`**：会话结束前自动检查 CHANGELOG 同步 + 版本号一致性
- **`.claude/settings.json`**：注册 Stop hook
- **`CLAUDE.md`**：会话结束 Hooks 章节从"手动必须执行"更新为"自动执行"说明

### 文档更新
- **`docs/TODO.md`**：新增"版本号唯一来源改造"待办事项

## v1.7.8（2026-03-21）— LOSP 拆分 + LOCR 临时密码兼容 + GMR-OF 价格规则

### LOSP 辅助包拆分为 vol1 / vol2
- **`loch_prices.json`**：LOSP 包价键名从 `LOSP` 改为 `LOSP-vol1`（属于 LOCH 卡包）
- **`locr_prices.json`**：LOSP 包价键名从 `LOSP` 改为 `LOSP-vol2`（属于 LOCR 卡包）
- **`priceSystem.js`**：`getPackPrice('LOSP')` 自动回退查找 `LOSP-vol1` 或 `LOSP-vol2`

### LOCR 临时密码兼容方案
- **问题背景**：LOCR 是最新发售卡包，百鸽数据库（ygocdb）尚未收录正确的卡片密码，使用的是临时密码（≥100000000），导致价格文件中的 cardId 与卡片数据中的 id 不一致
- **`priceSystem.js` 新增 `setNumberIndex` 反向索引**：加载价格数据时，自动建立 `setNumber → cardId` 的反向映射
- **新增 `resolveCardId()` 内部函数**：查询价格时先尝试直接匹配 cardId，失败后通过 setNumber 反向索引回退查找
- **影响**：LOCR 所有卡片（含 LOSP-vol2）现在可以正确获取到市场价格，当百鸽后续更新真实密码后也能自动兼容

### LOCR-JP018 价格修复
- **修复**：移除 `locr_prices.json` 中 LOCR-JP018 错误的 `GMR` 稀有度价格（¥35,900），该卡包不存在单纯的 GMR 稀有度，正确的是 `GMR-OF`（¥9,600，已正确录入）

### LOCH 卡片密码更新
- **`loch_prices.json`**：LOCH-JP001~JP018 的 cardId 从临时密码（100256xxx）更新为百鸽已收录的真实密码（如 88570003 等）

### GMR-OF 亚洲版价格规则说明
- **`loch_prices.json`** 和 **`locr_prices.json`** 均添加 `_GMR-OF价格规则` 元数据字段
- **规则**：GMR-OF 稀有度在集换社会出现两列价格（亚洲版在左、日本版在右），本项目只录入亚洲版（左侧）价格，不录入日本版价格
- 所有 36 张 GMR-OF 卡片（LOCH 18张 + LOCR 18张）的亚洲版价格已确认正确
- **涉及修改文件**：`js/priceSystem.js`、`data/ocg/prices/loch_prices.json`、`data/ocg/prices/locr_prices.json`、`data/changelog.json`、`index.html`

### 管理后台统计修复 — LOCR 缺失
- **问题**：管理后台（`/admin/stats.html`）的"各卡包明细"中缺少 LOCR，只显示 LOCH 和 BLZD
- **原因**：`functions/api/pack-stats.js` 的 `handleReport` 函数在上报数据时，只更新了各卡包的 `stats:{packCode}` 统计数据，但从未调用 `addToPackIndexBatch` 将新卡包注册到 `index:packs` 索引中
- **修复**：在 `handleReport` 中逐个更新卡包统计后，添加 `await addToPackIndexBatch(KV, packCodes)` 调用，新卡包首次上报时自动加入索引
- **影响**：LOCR 及后续新卡包上报数据后会自动出现在管理后台统计中

### KV 写入限流参数调整 — 升级 Cloudflare 付费计划
- **背景**：已购买 Cloudflare 基础数据服务，KV 每日写入限额大幅提升，不再受免费计划 1,000 次/天的限制
- **`DAILY_WRITE_THRESHOLD`**：`900` → `100,000`，保留充足余量
- **`DAILY_WRITES_SAMPLE_INTERVAL`**：`50` → `500`，采样持久化间隔扩大 10 倍，进一步减少 daily_writes 本身的 KV 写入开销
- **保留 throttled 降级逻辑**：服务端 daily_writes 限流机制和前端 throttled 降级逻辑均保持不变，作为安全兜底
- **涉及修改文件**：`functions/api/pack-stats.js`

## OCR 价格数据更新（2026-03-21）— BLZD + LOCH + LOCR 三包价格

### OCR 工具链增强
- **`extract_prices.py`**：新增 LOCR 主包的卡名映射加载和编号前缀解析支持
- **`merge_prices.py`**：新增 LOCR 主包的合并逻辑（正包 80 张 + LOSP vol2 附属包 10 张）
- **`ocr_workflow.py`**：新增 LOCR 主包的 review 价格对比步骤支持
- **`card_cutter.py`** / **`card_rect_cutter.py`**：OCR 切图工具优化

### 价格数据更新
- **`blzd_prices.json`**：BLZD 主包价格更新（卡盒 ¥370、单包 ¥9.9 + 全卡价格）
- **`loch_prices.json`**：LOCH 主包价格更新（卡盒 ¥345、单包 ¥9.5 + LOSP vol1 包 ¥70 + 全卡价格）
- **`locr_prices.json`**：LOCR 主包价格更新（卡盒 ¥370、单包 ¥9.9 + LOSP vol2 包 ¥88.88 + 90 张卡 322 条价格）

### 文档更新
- **`docs/TOOLS.md`**：OCR 工作流工具使用说明更新
- **涉及修改文件**：`tools/extract_prices.py`、`tools/merge_prices.py`、`tools/ocr_workflow.py`、`tools/card_cutter.py`、`tools/card_rect_cutter.py`、`data/ocg/prices/blzd_prices.json`、`data/ocg/prices/loch_prices.json`、`data/ocg/prices/locr_prices.json`、`docs/TOOLS.md`

## 文档更新（2026-03-21）— 双设备配置 + MCP 设备区分

### DEVELOPMENT.md 双设备配置
- **Python OCR 工具环境** 改为双设备表格，记录设备 A（chihayadu / RTX 4060）和设备 B（snow9 / RTX 3070）的硬件配置
- 虚拟环境路径统一为 `local/venv/`，每台设备各自安装依赖
- **PaddleOCR MCP Server** 标注仅设备 A 使用，设备 B 不配置此 MCP，OCR 工作流通过命令行脚本执行
- **涉及修改文件**：`DEVELOPMENT.md`

## LOCR 卡图本地化 + 卡图系统重构（2026-03-20）

### LOCR 卡图本地化
- **新增 171 张 LOCR 本地卡图**：`data/ocg/images/locr/` 目录下，覆盖 LOCR-JP001~JP018 + LOSP-JP011~JP020 的 UR、UR-OF、PSER-OF 等多稀有度卡图
- **新增 `locr_image_map.json` 映射表**：采用 **localImages 新格式**，按卡编号 + 稀有度查找本地文件名（与 LOCH/BLZD 的 metaId 格式不同）
- **新增 `tools/build_locr_image_map.py`**：自动扫描卡图文件并生成映射表，支持 `--dry-run`（预览）和 `--stats`（统计）参数
- **新增 `tools/check_missing_images.py`**：缺图检测脚本，统计哪些卡片/稀有度缺少保底卡图
- **卡图来源优先级**：`twitter_photo(5)` > `twitter_render(4)` > `ygojp(3)` > `official(2)` > `ygometa(1)`
- **文件命名规范**：`{卡编号}_{稀有度}_{来源}_{类型}.webp`（如 `LOCR-JP001_UR-OF_twitter_photo_art.webp`）

### 卡图系统重构（`api.js`）
- **新增 localImages 模式**：`getCardImageUrl()` 现支持两种映射表格式——旧格式 `metaId`（LOCH/BLZD）和新格式 `localImages`（LOCR），按稀有度直接查找本地文件名
- **新增稀有度 fallback 机制**：高稀有度卡图缺失时，自动向低稀有度方向查找替代卡图。普通卡和 OF 卡（破框卡）拥有独立 fallback 链，互不共享
  - 普通卡链：PSER → SER → CR → UTR → UR → SR → R → NR → N
  - OF 卡链：GMR-OF → PSER-OF → UR-OF
- **新增占位图**：卡图完全缺失时显示 `printing.jpg` 占位图，替代浏览器加载失败的破碎图标
- **新增 `resolveLocalImage()` 函数**：核心查找逻辑，支持严格匹配和兼容匹配两种模式

### 卡图严格匹配模式（设置面板新增调试功能）
- **新增隐藏板块「🎨 卡图调试」**：设置面板连点标题 5 次解锁后可见
- 开启后，缺少对应稀有度卡图的卡片显示占位图（方便排查缺失卡图）；关闭时高稀有度自动回退到低稀有度卡图
- 设置持久化到 `localStorage`，刷新页面不丢失

### 数据修复
- **`ocg_locr.json` 格式修复**：修复多张卡片 `name_hint` 字段后缺少逗号的 JSON 语法问题（8处）
- **LOCR-JP018 命名修正**：卡图稀有度从错误的 `UR` 修正为 `UR-OF`

### 文档更新
- **`docs/TOOLS.md`**：新增 `build_locr_image_map.py` 工具使用说明（命令、格式、命名规范）
- **涉及修改文件**：`js/api.js`、`js/game.js`、`index.html`、`data/ocg/cards/ocg_locr.json`、`docs/TOOLS.md`
- **新增文件**：`data/ocg/locr_image_map.json`、`data/ocg/images/locr/`（171 张卡图）、`tools/build_locr_image_map.py`、`tools/check_missing_images.py`

## Bug 修复（2026-03-20）— LOSP 辅助包卡图显示修复

### 辅助包卡图加载 Bug 修复
- **问题**：LOCR 收集一览中辅助包（LOSP-JP011~020）的 PSER-OF 卡图全部显示 "NOW PRINTING" 占位图
- **根因**：`api.js` 的 `buildSupplementCardsFromLocalData()` 函数调用 `getCardImageUrl()` 时未传递 `rarityCode` 参数，导致 `localImages` 模式下无法匹配到对应稀有度的卡图
- **修复**：在 `getCardImageUrl()` 调用中补充 `rarityCode` 参数，辅助包卡图现在能正确按稀有度查找本地卡图文件
- **影响范围**：修复后 LOCR/LOCH 两个卡包的辅助包卡图均能正确显示
- **涉及修改文件**：`js/api.js`

## 工具链更新（2026-03-19）— build_pack_data.py 自动填充卡牌密码

### build_pack_data.py 新增 name_hint 自动回查机制
- **问题背景**：新卡包发售初期，部分卡片在百鸽数据库中的密码为 0 或临时密码（≥100000000），导致 build 时无法匹配卡牌详情
- **方案A 实施**：在 `build_pack_data.py` 中集成自动填充逻辑，当卡片 `id=0` 时，通过 `name_hint` 字段在 `cards.json` 中进行 NFKC 标准化名称匹配，自动填充正确的卡牌密码
- **`load_cards_db()` 增强**：新增返回 `by_name` 映射（按 `nwbbs_n`/`cn_name`/`jp_name` 三个字段索引），支持名称回查
- **`build_pack()` 增强**：新增 `by_name` 参数，cardIds 和 supplementPack 中的卡片均支持 id=0 时自动填充
- **构建日志增强**：自动填充时输出 `🔄 自动填充密码: X 张` 提示，方便追踪
- **卡牌数据库更新**：`cards.json` 同步更新至百鸽最新数据
- **卡包数据重新构建**：LOCH、LOCR 卡包数据使用最新 cards.json 重新构建
- **涉及修改文件**：`tools/build_pack_data.py`、`tools/db/cards.json`、`tools/db/.cards_md5`、`data/ocg/cards/ocg_loch.json`、`data/ocg/cards/ocg_locr.json`

## v1.7.7（2026-03-18）— 新增 LOCR 价格配置 + 卡包列表更新
- **新增 LOCR 独立价格文件**：`data/ocg/prices/locr_prices.json`，单包 35🪙、整盒 488🪙，卡片市场价格待集换社数据补充
- **价格系统注册 LOCR**：`priceSystem.js` 的 `PRICE_FILES` 新增 `locr` 映射，游戏启动时自动加载 LOCR 价格
- **LOCR 回退价格更新**：`packs.json` 中 LOCR 单包价格从 22 更新为 35
- **卡包列表更新**：通过 `fetch_packs.py gen-list` 更新 OCG/TCG 卡包列表至最新数据
- **涉及修改文件**：`locr_prices.json`（新增）、`priceSystem.js`、`packs.json`、`pack_list.json`

## 工具链更新（2026-03-16）— merge_prices.py v6 升级：人工覆盖机制

### 问题排查：JSON 逗号丢失根因
- **根因定位**：之前 `loch_prices.json` 中出现的逗号丢失（导致盒价 434→330），**不是** `merge_prices.py` 导致的（`json.dump` 不会产生语法错误），而是上一轮使用编辑工具手动修改 JSON 文件时，替换操作意外吞掉了对象间的 `,` 分隔符
- **根本解决方案**：新增 `price_overrides.json` 人工覆盖机制，彻底杜绝手动编辑 JSON 价格文件的需求

### merge_prices.py v5 → v6 改进
- **新增 `price_overrides.json` 人工覆盖机制**：
  - 当 merge 因异常规则拦截了某个价格（如变化>10x），但经人工确认该价格正确时，在 `price_overrides.json` 中添加覆盖条目
  - 下次 merge 自动采用覆盖价格，无需手动编辑 JSON 价格文件
  - 覆盖条目是一次性的：成功消费后自动清理，避免过期覆盖影响后续更新
  - 覆盖操作在 CSV 对照表中有完整记录（标注"✅ 人工确认覆盖"）
- **覆盖范围覆盖所有异常规则**：LOCH（串扰检测6条规则）+ BLZD（N/R>5, SR>50, PSER<1, 变化>10x）

## 工具链更新（2026-03-13）— merge_prices.py v5 升级

### merge_prices.py v4 → v5 四项改进
- **🐛 修复 LOSP 价格未合并 Bug**：之前 merge 只查 `loch_ocr` 数据源，LOSP 编号的卡片一直无法被 OCR 价格更新。现在根据 `setNumber` 前缀自动选择 LOCH 或 LOSP 数据源
- **BLZD 改为增量更新模式**：不再每次全量新建，改为读取旧 `blzd_prices.json` 进行增量对比更新，保留旧价格参考、支持变化幅度校验（>10x 拦截）、异常时保留旧值而非丢弃
- **新增 `price_alerts.csv` 精简告警列表**：merge 结束后自动导出仅含异常拦截项（⚠️）和大幅变化更新项（>50%）的精简列表，减少人工校验工作量
- **新增覆盖率检查**：统计摘要中列出 LOCH+LOSP 和 BLZD 缺失 OCR 数据的卡片/稀有度，方便发现遗漏

## v1.7.6（2026-03-11）— NR 价格修复 + 工作流文档全面更新

### NR 价格修复 + 工作流文档全面更新（3月11日）
- **修复 N/NR 价格互补**：`blzd_prices.json` 中 3 张卡（JP028/JP070/JP080）补充缺失的 N 或 NR 价格
- **`merge_prices.py` 增加 N/NR 自动互补逻辑**：当卡片同时定义了 N 和 NR 稀有度时，集换社只收录一种的情况自动互补另一种
- **`docs/TOOLS.md` 全面重写 OCR 工作流文档**：
  - 从旧版 4 步流程更新为实际的 6 步流程（行裁切→行OCR→单卡裁切→单卡OCR→解析→合并）
  - 新增 `card_cutter.py` 和 `batch_ocr_cards.py` 独立工具说明
  - 新增解析核心逻辑流程图（卡名匹配 5 级策略、编号补充流程）
  - 新增已知问题与排错经验（编号截断、NR 稀有度、GMR-OF 双版本、价格 `--`）
  - 更新文件索引：按工具脚本/辅助工具/数据文件/中间文件分类，标注产生步骤

## v1.7.5（2026-03-09~10）— OCR 工具链 v3/v4 优化 + 价格更新 + TCG 代码清理

### 项目目录整理（3月10日晚）
- **`cards.json` 移入 `tools/db/`**：12MB 的 YGOCDB 全量数据库从 `data/common/` 移到 `tools/db/`，明确区分网页运行时数据（`data/`）和离线工具数据（`tools/db/`）
- **根目录 Python 脚本移入 `tools/`**：`update_cards_db.py`、`build_pack_data.py`、`fetch_packs.py`、`fetch_yugiohmeta.py` 四个脚本从根目录移到 `tools/` 目录，项目根目录不再有散落的 py 文件
- **`.gitignore` 更新**：`tools/db/` 整体忽略（cards.json 等大文件不提交到 Git），修正注释
- **所有脚本路径常量统一重构**：使用 `SCRIPT_DIR`（tools/）+ `PROJECT_ROOT`（项目根）的标准模式，移动后不影响功能
- **`TOOLS.md` 补充卡牌数据库更新工作流**：增加完整工作流图（Mermaid）和命令说明
- 更新 README.md、ARCHITECTURE.md、TOOLS.md 中的路径描述

### 变更记录规则简化（3月10日晚）
- **移除 DEVELOPMENT.md「近期维护」机制**：所有变更统一只记录到 CHANGELOG.md，不再在 DEVELOPMENT.md 中维护「近期维护」区块
- **Hooks 从 5 项精简为 3 项**：移除 Hook 2（DEVELOPMENT.md 同步）和 Hook 3（近期维护清理），消除双文件同步导致的遗漏风险（此前已发生三次遗漏）
- 更新执行流程图和常见遗漏提醒

### 会话结束 Hooks 机制（3月10日晚）
- **新增 `DEVELOPMENT.md` 会话结束 Hooks 章节**：定义 5→3 项必检 hooks（CHANGELOG 同步、changelog.json 同步、版本号三处一致检查）
- 每项 hook 配有触发条件，非相关变更可跳过，避免不必要的操作
- 包含执行流程图和常见遗漏提醒，确保新 AI 会话也能正确执行

### 裁切工作流文档化（3月10日晚）
- **完善 `docs/TOOLS.md`**：为 `card_rect_cutter.py` 添加完整工作流文档
  - 核心原理流程图（Mermaid）、关键像素数据表、双路径检测策略说明
  - 使用命令、输入/输出说明、调试技巧、核心常量参考
- 在 TOOLS.md「相关文件」表格中补充 `card_rect_cutter.py` 条目
- 确保未来 AI 助手能完整理解并正确使用裁切工具

### 卡图矩形裁切工具 v2（3月10日晚）— `card_rect_cutter.py`
- **新建 `tools/card_rect_cutter.py`**：基于卡图矩形轮廓定位的行裁切工具
- **双路径检测策略**：快速路径（面积+四边形近似）→ 回退路径（boundingRect 尺寸过滤），确保各种截图均能检测到卡图
- **固定行间距推算**：通过第一行精确定位后，利用稳定的 374~375px 行间距推算后续行位置
- **空白行自动跳过**：暗色像素占比 <2% 的推断行自动跳过，不输出空白裁切图
- **关键参数**：卡图矩形 ~154×224px，面积 25k~38k，宽高比 0.65~0.72，裁切偏移 card_bottom +10~+125（总高 115px）
- **特殊适配**：末尾不足一行（如 LOSP 仅 10 张卡片）的情况自动处理
- 12 张截图裁切输出 61 张有效裁切图，OCR 通过率 100%

### OCR 工具链 v4（3月10日下午）— 卡名匹配+裁切参数+PaddleOCR v3 适配
- **卡名匹配体系重构**：加载 `cards.json` 的 `sc_name` 字段（集换社实际使用的译名），匹配优先级改为 `sc_name > nwbbs_n > cn_name`
- 新增 `_load_cards_db()` 和 `_resolve_display_name()` 函数，通过 password 关联 `ocg_*.json` 和 `cards.json`
- 所有译名体系（sc_name、nwbbs_n、cn_name、name_hint）均加入关键词，提高容错率
- **裁切参数v2**：ROW_TOP_OFFSET 110→140，ROW_BOTTOM_OFFSET 90→120（总高度200→260px），避免截断卡名和价格
- 同步调整 `parse_ocr_prices.py` 中 y 坐标分层范围（偏移+30px）
- **PaddleOCR v3 适配**：修复 `show_log`/`use_angle_cls` 参数废弃问题，兼容 `OCRResult` 新返回格式（`rec_texts`/`rec_scores`/`rec_boxes`）
- 修复 `ocr_row_cutter.py` LOSP截图在无整图OCR数据时无法裁切的问题（改用固定间距推算）
- 修复超出12张截图映射时，通过文件名关键词自动推断卡包
- 清理 `test_output/` 临时文件，移动构建脚本到 `tools/` 目录
- 手动修正 LOCH-JP041/JP042/JP028 等价格数据
- 重新执行完整 OCR 工作流（cut→ocr→parse→merge），PaddleOCR v3 识别84行耗时27秒

### OCR 工作流整合（3月10日）
- 新建 `tools/ocr_workflow.py`：一键 OCR 价格更新工作流入口脚本，串联 裁切→OCR→解析→合并 全流程
- 支持日期参数（如 `20260309`）和 `--step`/`--from` 分步执行
- 自动检测截图分辨率，不正确时提醒用户调整到 2064×2752 ppi264
- 用法：`local/venv/Scripts/python.exe tools/ocr_workflow.py 20260309`

### 清理 TCG 代码 + 价格更新 + OCR工具v3优化（3月9日）
- 清理所有 TCG 相关代码（HTML/CSS/JS），保留今后扩展 TCG 开卡模式的架构设计
- 删除 `data/tcg/` 目录
- 恢复 `API_CONFIG.YUGIOHMETA` CDN 配置（OCG 卡包图源依赖该配置）
- 修复 `loadYugiohMetaMap()` 被删除但仍被调用的遗留问题
- 使用 PaddleOCR 从集换社 App 截图更新 LOCH/BLZD/LOSP 卡片市场价格
- LOCH 80张 + LOSP 10张 + BLZD 98张卡价格更新
- 卡包/卡盒价格更新：LOCH 盒=455/包=22，BLZD 盒=310/包=10
- 新增"未收录"价格识别（集换社显示 `--` 的情况），保留旧价格
- **OCR工具v3优化**：卡名+稀有度匹配机制、"最近完整编号"分组策略、OCR识别价格表CSV中间文件、中文卡名连接词分隔符

### 辅助包 PSER 概率修复（3月6日深夜）
- 修复 BLZD 辅助包中 PSER 稀有度真红莲新星龙几乎不可能出现的问题
- 原因：旧逻辑先选卡再判定 PSER，只有 JPS06 有 PSER 版本（1/20=5%），命中 PSER 概率后 19/20 被浪费
- 修复：改为先判定是否出 PSER，如果命中则从有 PSER 版本的卡中选择
- PSER 概率从 ~0.63%（约160盒出1次）修正为 ~12.5%（约8盒出1次）

### BLZD 卡图 CDN 切换 + 本地备份（3月6日晚间）
- BLZD 卡图从 YGOCDB CDN（被 Chrome ORB 拦截）切换到 S3 CDN
- 新增 `data/ocg/blzd_image_map.json`：100张卡映射表（正包80+辅助包20）
- 新增 `data/ocg/images/blzd/`：100张卡本地 webp 备份（共200文件，7.0MB）
- 图源优先级：S3 CDN → Cloudflare 本地 webp → YGOCDB CDN 回退

### LCP 优化：本地封面图优先加载（3月6日晚间）
- OCG 卡包封面图改为本地优先加载（`data/ocg/covers/{packCode}-{type}.png`），消除日本服务器延迟
- 新增 `getPackCoverFallbackUrl()` + `getPackCoverImageUrl()` type 参数
- 采用 onerror 机制，无需维护本地图片列表

### 其他修复（3月4日~6日）
- 修复 LOSP 卡片价格键名（PSER → PSER-OF）
- 开包结果页新增快捷「再开」按钮（适配 pack/box/3box 三种模式）
- 初始金币 10万 → 100万，金币不足提示引导去「设置」添加
- 大数字缩写展示（≥1万→x.xx万，≥1亿→x.xx亿）
- 「开发者工具」重命名为「设置」，图标⚙️
- 背包新增「总盈亏」展示（总市场价值 - 累计开包花费）
- KV 写入深度优化（缓冲区+节流合并60s，每日上报上限50次，内存缓存30s）
- 新增市场价格系统（`js/priceSystem.js`），从 `data/ocg/prices/` 加载集换社市场价格
- 修复背包同一张卡不同稀有度混显问题，改为按「cardId + rarity」展开
- BLZD 价格配置 + 卡包价格从价格配置文件优先读取
- LOCH/LOSP 卡图 CDN 切换为 S3 优先 + Cloudflare 本地备份
- PaddleOCR MCP Server 配置（GPU 加速，STDIO 模式）

## v1.7.4（2026-03-06）— LOSP 卡片价格修复
- **修复 LOSP 卡片价格获取失败**：`loch_prices.json` 中 10 张 LOSP 卡片的价格键名从 `PSER` 修正为 `PSER-OF`，与卡片数据中的稀有度保持一致
- **涉及修改文件**：`data/ocg/prices/loch_prices.json`

## v1.7.0（2026-03-03）— LOSP 特别包 + LOCH 开3盒功能
- **新增 LOSP 特别包（10张全 PSER 卡片）**：购买 LOCH 3盒赠送1包 LOSP 特别包，随机获得1张
- **LOCH 新增「开3盒」按钮**：一次性开 45 包（3盒），蓝金渐变风格，按钮宽度与开1包/开1盒统一
- **LOSP 卡片数据**：10 张经典王牌怪兽（真红眼龙骑士、流天类星龙、超融合等），全部 PSER 稀有度
- **LOSP 卡图本地化**：20 个卡图文件（10张×2尺寸）已下载到 `data/ocg/images/loch/`
- **修复 BLZD 开1盒按钮**：恢复「赠送+1辅助包」提示文字（之前被误删）
- **LOCH 特殊逻辑**：开1盒不赠送辅助包，只有开3盒才赠送+1 LOSP 特别包
- **修复背包大图卡名换行**：中文名和日文名之间正确换行显示（`inventory.js` 的 `showCardViewer` 函数）
- **卡图放大查看器卡名宽度优化**：从 `max-width: min(90vw, 420px)` 改为 `left:8px; right:8px` 布局，长卡名不再不必要换行
- **涉及修改文件**：`ocg_loch.json`、`loch_image_map.json`、`packs.json`、`index.html`、`game.js`、`api.js`、`inventory.js`、`style.css`
- **新增卡图文件**：`data/ocg/images/loch/` 下 20 个 LOSP 卡图

## v1.6.6（2026-03-02）— 开包统计数据清零修复
- **清零线上KV脏数据**：由于 v1.6.5 期间开盒操作被错误记录为 `type='pack'` 导致 `totalPacks` 虚高、`totalBoxes` 未增加，已通过临时 DELETE 接口清零全部 KV 统计数据
- 统计数据从零重新开始，此后开包/开盒记录将正确统计
- **涉及修改文件**：`functions/api/pack-stats.js`（临时添加清零接口后已移除）

## v1.6.5（2026-03-02）— 统计后台修复 + 返回按钮优化
- **修复统计后台数据**：开包和开盒数合并为总开包数显示，数据不再分开误导
- **取消后台密码限制**：管理后台无需密码，进入开发者模式点击入口即可直接查看
- **返回按钮优化**：开包结果页返回按钮改为"返回上一层"（回到开包界面），不再直接跳回主页
- **左上角返回按钮样式优化**：改为无边框简洁箭头风格，点击有缩放反馈
- **本地调试提示**：全球统计在本地环境显示"本地调试不可用"
- **涉及修改文件**：`admin/stats.html`、`functions/api/pack-stats.js`、`js/pack-stats.js`、`js/game.js`、`index.html`、`css/style.css`

## v1.6.4（2026-03-02）— 取消钻石货币与兑换功能
- **移除钻石货币**：顶部导航栏不再显示钻石，货币系统简化为仅金币
- **移除金币兑换功能**：删除货币兑换弹窗及相关 UI、事件绑定和函数
- **统一金币消费**：所有卡包统一使用金币购买，`packs.json` 中 `currency` 字段仅保留 `gold`
- **涉及修改文件**：`js/currency.js`、`index.html`、`js/game.js`、`css/style.css`、`data/ocg/packs.json`、`data/tcg/packs.json`、`docs/FEATURES.md`

## v1.6.3（2026-03-02）— 隐藏功能统一管理
- **TCG 测试模式、CDN 卡图对比移入隐藏菜单**：与管理后台入口统一，需在开发者工具中连续点击标题5次才能解锁显示
- 开发者工具面板默认仅显示：快捷操作、缓存管理两个板块
- 连点5次解锁后额外显示：TCG 测试模式、CDN 卡图对比、管理后台入口三个隐藏板块
- **涉及修改文件**：`index.html`、`js/game.js`

## v1.6.2（2026-03-02）— 缓存管理合并到开发者工具
- **缓存管理整合**：将独立的「💾 缓存管理」弹窗和顶部导航栏按钮移除，功能合并到「🔧 开发者工具」面板中
- 开发者工具面板现包含：基础信息、缓存管理、管理后台入口（隐藏）三个板块
- 顶部导航栏更简洁，减少一个按钮入口
- **涉及修改文件**：`index.html`、`js/game.js`、`css/style.css`

## v1.6.1（2026-03-02）— 管理后台入口隐藏化 + 密码更新
- **隐藏管理后台入口**：管理后台不再需要手动输入网址，改为隐藏在开发者工具面板中
- **类似安卓开发者选项的解锁方式**：在开发者工具弹窗中，连续快速点击「🔧 开发者工具」标题 5 次即可解锁隐藏的「📊 数据统计后台」入口按钮
- 3秒内未完成5次点击则重置计数，再次触发5次连击可重新隐藏入口
- **管理员密码已更新**（已变更，不在文档中记录）
- **涉及修改文件**：`index.html`、`js/game.js`、`css/style.css`、`functions/api/pack-stats.js`

## v1.6.0（2026-03-02）— 开包统计系统
- **新增开包统计功能**：玩家可在开包界面看到当前卡包的个人开包数和全球开包数
- **个人统计**：使用 localStorage 记录每个卡包的开包/开盒次数，无网络依赖，即时生效
- **全球统计**：通过 Cloudflare Workers + KV 存储记录全球玩家的开包数据，每次开包静默上报
- **管理后台**：新增 `admin/stats.html` 页面，可通过密钥查看全局开包统计数据
- **新增模块**：`js/pack-stats.js`（前端统计模块）、`functions/api/pack-stats.js`（服务端 API）
- **UI 展示**：开包界面卡包描述下方显示 👤 我的开包 / 🌍 全球开包 两项数据
- **⚠️ 部署前提**：需要在 Cloudflare 控制台创建 KV 命名空间 `PACK_STATS` 并绑定到 Pages 项目
- **涉及修改文件**：`game.js`、`index.html`、`css/style.css`、`CHANGELOG.md`、`ARCHITECTURE.md`、`FEATURES.md`
- **新增文件**：`js/pack-stats.js`、`functions/api/pack-stats.js`、`admin/stats.html`

## v1.5.33（2026-03-01）— LOCH 卡图本地化
- **LOCH 卡图本地化**：所有 98 个唯一 metaId（80 张普通版 + 18 张 OF 超框版）的小图（_w200）和大图（_w420）共 196 个文件已下载到 `data/ocg/images/loch/`
- 总大小约 7.3MB，部署到 Cloudflare Pages 后从国内访问速度大幅提升
- **新增 `localImagesDir` 机制**：`packs.json` 中可为卡包配置 `localImagesDir` 字段，指定本地卡图目录
- `getCardImageUrl` 加载优先级：本地图片（`localImagesDir`）→ S3 CDN → YGOCDB CDN
- imageMap 加载时自动附加 `_localDir` 属性，无需修改函数签名，现有所有调用点自动生效
- **新增工具脚本**：`tools/download_loch_images.py`（从映射表批量下载卡图到本地目录，支持断点续传和重试）
- **涉及修改文件**：`api.js`、`packs.json`、`index.html`、`changelog.json`、`CHANGELOG.md`、`ARCHITECTURE.md`、`TOOLS.md`

## v1.5.30（2026-02-28）— LOCH 多稀有度卡图支持 + 图鉴展开卡位
- **扩展卡图映射表**：`loch_image_map.json` 新增 `altMetaId` 字段，支持每张卡不同稀有度使用不同的卡图（OF 超框卡版本使用超框卡图，普通版使用普通卡图）
- 从 yugiohmeta.com 网页提取全部 346 张图片数据（108 个唯一 metaId），建立完整的稀有度→卡图映射
- **`getCardImageUrl` 增强**：新增可选的 `rarityCode` 参数，根据稀有度查找对应的 `altMetaId`，加载正确版本的卡图
- **开包逻辑更新**：`drawCards_LOCH` 和 `drawCardsBox_LOCH` 在排序后、返回前，根据实际抽到的稀有度更新 `imageUrl` 和 `imageLargeUrl`
- **图鉴 LOCH 特殊处理**：每张卡的每个稀有度版本展开为独立卡位（共 318 个卡位），同编号下稀有度权重从高到低排列（GMR-OF > PSER-OF > SER > UR-OF > UR ...）
- 图鉴中每个展开卡位显示对应稀有度的卡图、独立的收集状态和数量
- `buildOCGCardsFromLocalData` 在每张卡对象上保存 `_imageMap` 引用，`setData` 中也保存 `imageMap`
- **涉及修改文件**：`api.js`、`game.js`、`loch_image_map.json`、`CHANGELOG.md`
- **新增工具脚本**：`test_output/generate_loch_rarity_map.py`（从网页数据生成完整映射表）

## v1.5.29（2026-02-28）— LOCH 散包 GMR-OF 概率修正：1/2160
- **修正 `ofTypeOdds` 权重**：从 `{PSER-OF:6, UR-OF:17, GMR-OF:1}`（总24）改为 `{PSER-OF:36, UR-OF:107, GMR-OF:1}`（总144）
- GMR-OF 是 6 箱（6×24盒×15包 = 2160 包）才出 1 张，正确概率为 **1/2160 ≈ 0.046%**
- 修正前 GMR-OF 概率 = 1/15 × 1/24 = 1/360 ≈ 0.28%（偏高约 6 倍）
- 修正后 GMR-OF 概率 = 1/15 × 1/144 = **1/2160 ≈ 0.046%** ✅
- 以 6 箱 = 144 个 OF 位为基数：PSER-OF = 36个(25%)，UR-OF = 107个(74.3%)，GMR-OF = 1个(0.69%)
- **涉及修改文件**：`packs.json`、`game.js`、`CHANGELOG.md`

## v1.5.28（2026-02-28）— LOCH 散包4号位修复：与整盒概率完全一致
- **修复散包4号位逻辑**：不再使用 `versionOdds` 权重随机，改为复用整盒分布概率
- 散包4号位现在按 `boxSlot4Distribution`（OF:1, PSER:1, UTR:2, CR:2, SER:9）比例概率决定版本类型
- 命中 OF 后再按 `ofTypeOdds` 决定 OF 子类型
- 最后从拥有该版本的卡池中随机选一张卡，确保散包和整盒的出货概率完全一致
- **涉及修改文件**：`game.js`、`packs.json`、`CHANGELOG.md`

## v1.5.27（2026-02-28）— 版本号统一管理 + 更新日志补全
- 新增全局版本号变量 `APP_VERSION`，所有资源缓存参数、页脚版本号、console 输出统一从此变量读取
- 更新版本时只需修改 `index.html` 中 `window.APP_VERSION = 'x.x.x'` 这一行
- CSS/JS 资源的 `?v=` 参数通过 `document.write` 动态注入，自动跟随 `APP_VERSION`
- 补全 `changelog.json` 中 v1.5.6 ~ v1.5.26 缺失的更新日志记录
- **涉及修改文件**：`index.html`、`game.js`、`changelog.json`

## v1.5.26（2026-02-28）— 角标立体质感升级
- 所有稀有度角标从纯实心色块升级为立体质感风格
- 添加顶部渐变高光（`linear-gradient` 白色透明叠加），模拟光泽感
- 添加内发光 + 外投影复合阴影（`inset 0 1px 0 rgba(255,255,255,.3)` + `0 1px 3px rgba(0,0,0,.5)`）
- 文字改为白色 + 文字阴影（`text-shadow: 0 1px 2px rgba(0,0,0,.6)`），提升可读性
- JS 动态注入亮度检测：亮色背景（如 UR 金色、GMR 金色）自动切换为黑色文字，避免对比度不足
- 覆盖所有角标：抽卡结果、图鉴、背包、多版本子项、数量角标

## v1.5.25（2026-02-28）— 统一角标高度 + 添加描边
- 统一单版本和多版本角标的 `padding`/`font-size`/`border-radius`，解决高度不一致问题
- 所有实心色块添加 `box-shadow: 0 0 0 1px rgba(0, 0, 0, .5)` 暗色描边，防止浅色角标和卡图背景混在一起
- 多版本容器（`.preview-rarity-multi`、`.preview-owned-multi`）设置 `box-shadow: none`，避免容器重复描边
- 覆盖范围：抽卡结果（`.card-rarity-badge`）、图鉴（`.preview-rarity-badge`）、背包（`.inventory-rarity-badge`）、右下角数量（`.preview-owned-badge`）

## v1.5.24（2026-02-28）— 多版本数量角标改为独立实心色块并列
- **右下角数量角标**：多版本卡片的数量角标从暗色背景+彩色文字改为**独立实心色块并列**
- 单版本数量角标也改为实心色块风格（背景色 = 稀有度颜色 + 黑色文字）
- `applyRarityColors` 的 `badgeSelectors` 新增 `.preview-owned-badge` 和 `.owned-version-count`

## v1.5.23（2026-02-28）— 多版本稀有度角标改为实心色块并列
- 多版本左上角稀有度角标从暗色背景+竖线分隔+彩色文字改为**多个实心色块并列**
- 去掉 `<span class="rarity-sep">|</span>` 分隔符
- `.rarity-version-item` 子项各自有独立实心背景色 + 黑色文字 + 圆角

## v1.5.22（2026-02-28）— 统一稀有度角标为实心色块风格
- 抽卡结果（`.card-rarity-badge`）、图鉴（`.preview-rarity-badge`）、背包（`.inventory-rarity-badge`）三处统一为**实心色块**风格
- 位置统一固定在左上角，去掉暗色背景/毛玻璃/描边效果
- `applyRarityColors` 新增动态生成角标 `background-color` 样式，覆盖所有稀有度

## v1.5.21（2026-02-28）— 抽卡结果页稀有度角标移至左上角
- 抽卡结果页的稀有度角标从右上角移至左上角，与图鉴保持一致

## v1.5.20（2026-02-28）— 移除冗余 rarityCode 字段，统一使用 rarityVersions
- **数据结构简化**：卡牌对象不再包含 `rarityCode` 字段，统一使用 `rarityVersions` 数组
- 需要"基础稀有度"时，直接取 `rarityVersions[0]`
- 开包 roll 到具体稀有度版本后，将 `rarityVersions` 设为 `[目标稀有度]`
- **涉及修改文件**：`api.js`、`game.js`、`inventory.js`、5个 JSON 卡牌数据文件、`fallback_cards.js`、`rarities.json`、`changelog.json`
- 为 `ocg_25db.json`、`ocg_ch02.json`、`ocg_26pp.json` 补充了缺失的 `rarityVersions` 字段

## v1.5.19（2026-02-28）— 新建稀有度管理文件 + LOCH 稀有度修正
- **新建 `data/common/rarities.json`**：全局稀有度定义文件，统一管理所有稀有度的元数据（中英日名称、简称、描述、排序权重、CSS颜色、分类、破框/限量标记）
- 定义了12种稀有度：N / NR / R / SR / UR / UTR / CR / SER / PSER / UR-OF / PSER-OF / GMR-OF
- **修正 LOCH 卡包稀有度**：正确区分 `UR-OF`（浮雕破框）、`PSER-OF`（棱镜秘钻破框）、`GMR-OF`（特级大师破框）为独立稀有度，不再合并到 UR/PSER 中
- LOCH 卡包稀有度组合修正为4种：18张(UR/UR-OF/SER/PSER-OF/GMR-OF) + 20张(UR/SER/PSER) + 21张(SR/CR/SER/PSER) + 21张(SR/UTR/SER/PSER)
- `packs.json` 中 LOCH 的 `versionOdds` 新增 UR-OF(2) / PSER-OF(1) / GMR-OF(0.5) 权重
- `docs/ARCHITECTURE.md` 更新稀有度来源说明和关键数据文件列表

## v1.5.18（2026-02-28）— 图鉴新增 +1 辅助包收集进度
- **辅助包集成到图鉴**：收集一览弹窗中，主卡池卡片下方新增「📦 +1 辅助包」区域
- 辅助包区域包含独立的收集进度条（可展开查看各稀有度详情）、稀有度分布标签、卡片网格
- 辅助包卡片支持已拥有/未拥有区分（与主卡池一致的灰度+🔒图标效果）
- 点击辅助包卡片可放大查看卡图
- `showCardPreview` 中增加辅助包数据注入（`supplementPack`），确保从卡包列表直接预览时也能加载辅助包数据
- `renderCardPreview` 新增第四个参数 `supplementCards`，排序切换时保持辅助包数据引用
- 新增 CSS 样式：`.supplement-section`（虚线分隔）、`.supplement-section-header`（琥珀橙金标题）

## v1.5.17（2026-02-28）— 移除非补充包的数字别名
- 移除 26PP、CH02、25DB、LOCH 的 packNumber 字段
- 数字别名（如1304）仅补充包（booster）使用，代表期数+弹数
- 其他分类卡包仅显示 packCode（如 CH02、26PP）

## v1.5.16（2026-02-28）— 解锁 LOCH + 新增「近期发售」标签页
- **解锁卡包**：LOCH（界限超越典藏包 －主角篇－）从锁定状态改为可开包状态
- **新增「近期发售」标签页**：作为默认标签页，进入主界面时首先展示
  - 显示所有未锁定的卡包，按发售日期从新到旧排序
  - 已锁定的卡包不会出现在该标签页中
- 标签页顺序：近期发售 > 补充包 > 主题卡组 > 系列补充包 > 特殊包
- `currentPackCategory` 默认值从 `'booster'` 改为 `'recent'`
- `renderPackList()` 新增 `recent` 分类的特殊筛选逻辑

## v1.5.15（2026-02-28）— 新增 LOCH 卡包（界限超越典藏包 －主角篇－）
- **新增卡包**：`LIMIT OVER COLLECTION - THE HEROES -`（LOCH），归类为特殊包（`category: "special"`），当前为锁定状态
- 中文名：界限超越典藏包 －主角篇－，发售日：2026-02-28，含税价格：385日元/包
- 封面图来源：KONAMI 官网（`cg2069-pack.png`）
- 创建占位卡牌文件 `data/ocg/cards/ocg_loch.json`，卡片收录和开包概率待后续配置
- **注意**：LOCH 的开包规则与普通补充包（如 BLZD）不同，`packScheme` 和概率参数待专门配置

## v1.5.14（2026-02-28）— 卡包页面显示优化 + 开包排序修复
- **卡包选择页**：第一行改为中文名（如"炽热支配"），第二行为英文缩写+数字编号（如"BLZD（1304）"），第三行独立显示发售日期；金币价格显示在中文名上方，两者之间有间距
- **卡包详情页**：标题区域改为三行显示——第一行"炽热支配·BLZD（1304）"，第二行日文名（小字），第三行英文名（小字）
- **packs.json 新增字段**：`packNameCN`（中文名）和 `packNumber`（数字编号），用于各页面显示
- **开包结果排序修复**：`showResults` 函数中的 `RARITY_RANK` 映射同步修正（SER=6, UTR=5），与稀有度统计排序一致
- **稀有度配色方案**：采用渐进式过渡配色，减少视觉割裂感

## v1.5.5（2026-02-28）— NR 卡归池修正：NR 属于 N 卡卡池
- **NR 卡归属修正**：NR 卡（JP028/JP070/JP080）的基础稀有度改为 `"N"`，回到 N 卡卡池
- NR 卡的选中概率为普通 N 卡的 20%（通过加权随机实现，由 `nrWeightRatio` 配置控制）
- `rarityVersions` 保留 NR 标记（如 `["N", "NR", "PSER"]`），用于展示和背包系统识别
- **非 N 位不再产出 NR**：移除了旧的 "R 位 10% 变 NR" 逻辑（`boxNRChance` 已废弃）

## v1.5.4（2026-02-28）— 开包概率修正：NR卡归池 + 单包概率对齐盒规则
- **单包概率对齐**：`drawCards_OCG` 的非N位改为按 `boxRarityDistribution` 权重概率选择目标稀有度
- **NR卡归池修正**：NR卡不进任何卡池，只作为R位的10%概率变异产出

## v1.5.3（2026-02-28）— 开盒封入规则算法重构
- **整盒抽卡**：新增 `drawCardsBox_OCG` 函数，按真实封入规则分配30包的非N位稀有度（1SER+1UTR+3UR+6SR+19R）
- SER卡位有25%概率变为PSER（一箱24盒配6个原盒PSER）
- **辅助包PSER互斥**：同一盒中原盒包和+1辅助包合计只出现一张PSER

## v1.5.2（2026-02-27）— +1辅助包专属卡池 + 卡图放大修复
- 辅助包使用专属卡池（`supplementPack` 节点，BLZD-JPS01~JPS20 共 20 张卡）
- `api.js` 新增 `buildSupplementCardsFromLocalData` 函数
- 新增全局变量 `currentSupplementCards`

## v1.5.1（2026-02-27）— 新增「开整盒」（30包）选项
- 开包界面和结果界面新增「📦×30 开整盒」按钮
- 按钮采用紫金渐变 + 光效动画样式

## v1.5.0（2026-02-27）— 卡包锁定状态 UI
- 未开放的卡包以锁定状态展示，封面灰度 + 锁图标
- packs.json 新增 `locked` 字段

## v1.4.9（2026-02-27）— 开包界面新增收藏预览按钮

## v1.4.8（2026-02-27）— 卡包分类选项卡 + 新增 PREMIUM PACK 2026

## v1.4.7（2026-02-26）— 开包界面封面图可点击放大查看

## v1.4.6（2026-02-26）— 代码质量清理

## v1.4.5（2026-02-26）— 封面图加载优化

## v1.4.4（2026-02-26）— 开包界面 UI 优化

---

> 📋 **待办事项和路线图**已迁移到 [TODO.md](TODO.md)，不再在此维护。