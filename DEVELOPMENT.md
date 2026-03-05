# AI 协作开发指南

> **每次新会话开始时，AI 助手必须先阅读本文件。**
> **每次对话结束后，如有重要变更须同步更新本文件或对应子文档。**

## 🔖 当前版本：v1.7.1（2026-03-05）

最新变更：金币经济系统优化 + 价格配置独立化。详见 [CHANGELOG.md](docs/CHANGELOG.md)。

### 🔧 近期维护（2026-03-05）
- ✅ 新玩家初始金币从 10万 调整为 100万（已有存档用户不受影响）
- ✅ 金币不足提示文案优化：引导玩家去「⚙️ 设置」中手动添加金币（替代原"点击顶部货币栏兑换"文案）
- ✅ 大数字缩写展示：金币余额、背包总价值/总盈亏/卡片价格等，≥1万显示为"x.xx万"，≥1亿显示为"x.xx亿"，节省空间
- ✅ 「开发者工具」重命名为「设置」，图标从🔧改为⚙️；添加金币按钮数字支持缩写展示（100万）
- ✅ 背包系统新增「总盈亏」展示：总盈亏 = 背包总市场价值 - 累计开包花费
- ✅ 新增 localStorage Key：`ygo_inventory_spent`（累计开包花费，历史记录不受价格调整影响）
- ✅ 盈利显示绿色（+号），亏损显示红色（-号）
- ✅ 开包时自动记录花费金额，重置游戏时清零
- ✅ 优化 Cloudflare KV 写入频率：开包统计上报改为缓冲区 + 节流合并（30秒合并一次），预计减少 70-80% KV 写入
- ✅ 服务端 API 支持批量上报格式，全局统计只写入一次，卡包索引只在新增时写入
- ✅ 页面关闭时通过 sendBeacon 发送最后一批缓冲数据，确保数据不丢失
- ✅ KV 写入限流保护（方案A+C）：上报失败时数据持久化到 localStorage，后续自动补发；服务端追踪每日写入次数，接近限额（900/1000）时返回降级信号，前端暂停远程上报，次日自动恢复
- ✅ 新增 localStorage Key：`ygo_pending_reports`（待补发数据）、`ygo_report_throttled`（节流状态）
- ✅ 服务端新增 KV Key：`meta:daily_writes`（每日写入计数，UTC 跨天自动重置）
- ✅ KV 冗余清理：手动删除 `stats:TEST`（测试数据）、清理 `index:packs` 中的 TEST
- ✅ KV 写入进一步优化：POST 上报不再写入 `stats:_all`（全局统计改为各卡包实时累加计算）、不再检查/更新 `index:packs`（索引已固化），每次上报 KV 写入从 3读+3写 降为 1读+1写（单卡包场景），写入量减少约 66%
- ✅ **KV 免费额度深度优化**（触达 1000 次/天写入限额后的紧急优化）：
  - ✅ 服务端：`meta:daily_writes` 改用 Worker 内存变量追踪 + 每 50 次采样持久化（写入量减少 ~50%）
  - ✅ 服务端：GET 查询添加 30 秒内存缓存，绝大多数请求零 KV 读取（读取量减少 ~80%）
  - ✅ 服务端：恢复 `stats:_all` 懒更新策略，普通 GET 查询从 1+N 次 KV 读取降为 0-1 次
  - ✅ 前端：GET 缓存从 60 秒延长到 5 分钟，上报合并间隔从 30 秒延长到 60 秒
  - ✅ 前端：新增单用户每日上报上限（50 次），防止少量用户大量开包刷爆服务端额度
  - ✅ 新增 localStorage Key：`ygo_daily_report_count`（用户每日上报计数，UTC 跨天重置）
  - 📊 预计优化效果：单日 KV 写入从 1000+ 降至 200-400 次，远离免费限额
- ✅ 新增市场价格系统（`js/priceSystem.js`）：独立的价格查询模块，从 `data/ocg/prices/` 加载集换社市场价格
- ✅ 新增 LOCH+LOSP 价格数据（`data/ocg/prices/loch_prices.json`）：90张卡各稀有度版本真实市场价（OCR 识别）
- ✅ 背包系统接入真实价格：优先显示市场价格（🪙金币），无市场数据时回退到固定金币价格
- ✅ 价格数据与卡片数据分离（方案A），便于独立更新和扩展

### 🔧 近期维护（2026-03-05 下午）
- ✅ 新增 BLZD 价格配置文件（`data/ocg/prices/blzd_prices.json`）：整盒 300🪙，单包 10🪙
- ✅ 卡包金币价格改为从价格配置文件优先读取（`PriceSystem.getPackPrice`），无配置时回退到 `packs.json` 的 `price` 字段
- ✅ 整盒价格不再用「单包价 × 包数」计算，而是直接从价格配置文件的 `box` 字段读取
- ✅ LOCH 价格：1包=22🪙，1盒=385🪙（配置），3盒=1155🪙
- ✅ BLZD 价格：1包=10🪙，1盒=300🪙（配置）
- ✅ 修改涉及：开包扣费、按钮价格显示、卡包列表价格、盈亏计算，全部统一使用 PriceSystem

### 🔧 近期维护（2026-03-04）
- ✅ LOCH/LOSP 卡图 CDN 切换为 S3 优先 + Cloudflare 本地备份（已验证通过）
- 🔴 YGOProDeck 图源限流（Cloudflare Turnstile 人机验证拦截，挂起中）
- 🗑️ KONAMI 卡图代理问题已从待处理列表移除（无法解决）
- 🟡 新增待处理事项：优化网页 UI（大方向，待细化）
- 🟢 OCR 价格提取工具（`tools/ocr_price.py`）— 基于 PaddleOCR 3.x，可从集换社价格截图中提取卡名、编号、稀有度、价格

### 🐍 Python OCR 工具环境
- **虚拟环境**：`tools/venv/`（Python 3.11 + PaddlePaddle-GPU 3.0.0 CUDA 12.6 + PaddleOCR 3.4.0）
- **GPU 加速**：RTX 4060 (8GB VRAM)，每段识别 ~1 秒（CPU 约 8-10 秒/段，提速约 8x）
- **用法**：`tools/venv/Scripts/python.exe tools/ocr_price.py <截图路径> --output <输出JSON>`
- **注意**：PaddleOCR 不支持 Python 3.14，必须使用 3.11 虚拟环境运行

### 🔌 PaddleOCR MCP Server（2026-03-04 新增）
- **功能**：让 AI 编辑器直接调用本地 OCR 能力识别图片中的文字
- **配置文件**：`C:\Users\chihayadu\.gongfeng-copilot\mcp.json`（服务名: `paddleocr`）
- **启动方式**：CodeBuddy 自动通过 STDIO 模式管理进程，使用 GPU 加速
- **包版本**：`paddleocr-mcp 0.5.0`（pip 安装在 tools/venv 中）
- **验证**：重启 CodeBuddy 后，MCP 工具列表中应出现 PaddleOCR 相关工具

## 📚 文档索引

| 文档 | 内容 |
|------|------|
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 近期变更记录 + 待处理事项 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 数据源架构、API 限流、服务端代理、文件结构 |
| [docs/FEATURES.md](docs/FEATURES.md) | 背包系统、卡片预览/图鉴、货币系统、开包系统 |
| [docs/TOOLS.md](docs/TOOLS.md) | Python 工具脚本使用说明 |

---

## 👤 关于我

- **游戏策划**，代码水平较低，请用通俗易懂的语言沟通
- 愿意尝试新技术，但需要清晰的分步指引
- 可能在不同设备和不同 AI 模型之间切换，代码注释需清晰明了

## 💻 开发环境

- **默认终端**：Git Bash（使用 Bash 语法，非 PowerShell / CMD）
- **调试设备**：Chrome DevTools 模拟 Xiaomi 14（400×890）
- **临时文件**：截图/日志等必须保存到 `test_output/` 目录，严禁保存到桌面

## 🔗 项目信息

- **GitHub**：https://github.com/SnowCastorice/YGOCardGame
- **线上地址**：https://ygocardgame.pages.dev/
- **部署**：Cloudflare Pages（静态页面 + Functions API + KV 存储）
- **管理后台**：`/admin/stats.html`（在设置面板中连续点击标题5次解锁入口）
- **设置面板**（原「开发者工具」）：默认显示快捷操作、缓存管理两个板块；连点标题5次可解锁 TCG 测试模式、CDN 卡图对比、管理后台入口三个隐藏板块

---

## 📋 开发规范（必读）

### 基础规范
1. **版本管理**：每次提交维护版本记录
2. **更新日志**：网页内呈现更新日志（`data/changelog.json`）
3. **代码注释**：使用中文，简洁清晰
4. **Git 提交**：提交信息使用中文

### 资源版本号（缓存破坏）
> 所有资源版本号由 `index.html` 中的 `window.APP_VERSION` 统一控制。
> 更新时**只需修改这一处**，CSS/JS 的 `?v=` 参数和页脚版本号会自动同步。

修改位置（唯一）：
```html
<script>window.APP_VERSION = 'x.x.x';</script>
```

同时记得在 `data/changelog.json` 中添加对应版本的更新日志。

### 设计原则
- **移动端专属**：桌面端与移动端完全一致（居中 `max-width: 500px`）
- **不使用媒体查询**：移动端样式即默认样式
- 使用 `viewport-fit=cover` + `safe-area-inset` 适配刘海屏

---

## 🧪 功能自测规范

完成代码后、提交前必须确认：

1. **调用链完整性** — 新函数是否在初始化流程中被调用
2. **DOM 元素存在性** — JS 引用的 ID 是否在 HTML 中存在
3. **CSS 样式生效** — class 名拼写一致、优先级无覆盖
4. **数据字段匹配** — JS 读取的字段与数据源一致
5. **事件委托正确** — `e.target.closest()` 选择器能匹配目标
6. **移动端兼容** — 触摸事件、弹窗关闭等功能正常
