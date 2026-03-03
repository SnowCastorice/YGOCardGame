# 📝 近期变更记录

> 从 DEVELOPMENT.md 拆分，记录各版本的变更和待处理事项。

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

# ⏳ 待处理事项

> 以下是已确认但尚未完成的事项，请在后续开发中关注。

## 🟡 KONAMI 官方商品数据补全（进行中）
- 已完成：四个分类首页展示的商品信息采集（各 16 个，共 64 个商品），保存在 `pack_references/konami_official_products/` 下
- 待完成：各分类「もっと見る」（查看更多）内的早期商品数据录入
- 数据源：https://www.yugioh-card.com/japan/products/

## 🟡 OCG 稀有度问题
- BLZD 已完成真实数据录入，其他卡包（CH02、25DB）仍为测试稀有度
- 缓存同步：`api.js` 的 `getOCGCardSetData` 中已增加稀有度同步逻辑

## 🟢 多版本稀有度系统（已基本完成）
- 数据结构：统一使用 `rarityVersions` 数组（已移除冗余的 `rarityCode` 字段）
- **全局稀有度定义**：`data/common/rarities.json`，12种稀有度完整定义
- 12种稀有度 UI 支持（含破框版本 UR-OF / PSER-OF / GMR-OF）
- **已确认**：散包4号位复用整盒概率分布（`boxSlot4Distribution` + `ofTypeOdds`），不使用 `versionOdds`，概率与整盒完全一致

## 🔴 KONAMI 卡图代理无法获取真实卡图（挂起）
- 根本原因：KONAMI Imperva WAF 要求 JS 挑战验证，服务端代理无法通过
- 替代方案：使用 YGOProDeck / YGOCDB CDN（已集成）

## 🟢 图片资源自建 CDN 方案（后续规划）
- 当前使用第三方 CDN（YGOCDB / KONAMI / YugiohMeta），暂时够用
- 后续计划迁移到 Cloudflare R2 对象存储
- **触发时机**：活跃卡包超 10 个或第三方 CDN 不稳定时启动