# 📋 YGOCardGame 待办事项

> 本文件只记录待办事项和待解决的技术问题。已完成的工作记录在 [CHANGELOG.md](CHANGELOG.md)。

---

##  近期规划

### 1. 分析 Cloudflare 日志，优化网页性能
- 基于 Cloudflare 访问日志和性能报告，分析瓶颈
- 针对性优化加载速度、资源体积等

### 2. 旧卡图重命名
- 将旧卡图文件名统一为新的命名规范
- 确保所有引用路径同步更新

### 3. 同步卡图处理工具到本项目
- 将另一台计算机中关于卡图处理和命名的相关文件同步到项目中
- 使卡图处理流程可以在任何一台开发机中运行

### 4. 自建卡图 CDN
- 当前使用第三方 CDN（YGOCDB / KONAMI / YugiohMeta），暂时够用
- 后续计划迁移到 Cloudflare R2 对象存储
- **触发时机**：活跃卡包超 10 个或第三方 CDN 不稳定时启动

### 5. 准备自动切割卡图流程
- 避免手动切图效率低下且质量不一的问题
- 建立从原始图片到标准化卡图的自动化 pipeline

### 6. 优化网页 UI
- 作为大方向记录，具体优化内容待后续细化

### 7. 改造 getCardImageUrl() 图源优先级
- 去除调用第三方图源（YGOCDB CDN、S3 CDN 等）的处理方式
- 本地图源加载失败后直接使用 `printing.jpg`（NOW PRINTING）占位图
- 目标：所有卡图完全本地化，不依赖任何外部 CDN

### 8. 优化存档导出体积（精简字段方案）

**背景**：当前导出存档为完整 localStorage 的 Base64 编码，背包数据含大量冗余字段（卡名、图片URL等），数据量大时可能超出社交软件发送上限或被剪贴板截断。

**方案（方案 B：精简字段）**：导出时只保留核心字段，导入后由卡牌数据库重建完整数据。

- **核心思路**：inventory 每张卡从 ~500 字节精简到 ~50 字节（约缩小 90%）
- **需要保留的字段**：
  - `c` = count（拥有数量）
  - `r` = rarityVersionsOwned（各稀有度数量）
  - `t` = firstObtained（首次获得时间）
- **可丢弃的字段**（运行时可从卡牌数据库重建）：
  - `id`、`name`、`nameCN`、`nameOriginal`（卡牌基本信息）
  - `rarityVersions`（卡牌可用稀有度列表）
  - `imageUrl`、`imageLargeUrl`、`rarityImageUrls`（卡图URL）

**精简后的导出格式示例**：
```json
{
  "ygo_inventory_data": "{\"89631139\":{\"c\":3,\"r\":{\"UR\":1,\"SR\":2},\"t\":1711856400000}}"
}
```

**实现要点**：
1. `exportSaveData()` 中对 inventory 数据精简后再打包
2. `confirmImport()` 中检测到精简格式后，调用重建逻辑还原完整数据
3. 向下兼容：旧的完整格式存档仍然能正常导入
4. `currency` 和 `pack-stats` 数据本身很小，不需要优化
5. 如果未来数据量仍然过大，可叠加 pako.js 压缩（方案 C）

### 9. 建立完整的开发流程规范

**目标**：规范化 Claude Code 辅助开发的全流程，提高代码质量和发布稳定性。

**Code Review 流程**：
- 每次功能开发完成后、测试前，执行 Code Review 检查清单
- 检查项：调用链完整性、DOM 元素存在性、CSS 匹配、数据结构匹配、移动端兼容、边界情况
- 考虑使用子 agent 并行执行 Review（如一个 agent 查 HTML/CSS 一致性，一个 agent 查 JS 逻辑）

**测试流程**：
- 功能测试：启动本地服务器 → Chrome DevTools 模拟小米 14（400×890px）→ 截图验证 UI + 交互
- 边界测试：空输入、无效数据、异常格式等错误场景
- 回归测试：确认新功能不影响已有功能（开包、背包、金币等核心流程）
- 考虑使用子 agent 并行执行不同模块的测试

**合并/发布流程（MR）**：
- dev 分支开发 → Code Review → 测试通过 → 展示给用户确认
- 用户确认后合并到 main → Cloudflare Pages 自动部署
- 发布前检查清单：版本号四处一致、changelog 已更新、文档已同步

**版本号更新流程**：
- 新功能 → minor 版本（如 1.8.x → 1.9.0）
- 小修复/优化 → patch 版本（如 1.9.0 → 1.9.1）
- 四处同步：`index.html` APP_VERSION、`data/changelog.json`、`docs/CHANGELOG.md`、`README.md` badge
- 已有 pre-commit hook 自动检查一致性（`tools/version-check.sh`）

---

## 🔵 已记录的技术问题

### YGOProDeck 图源限流（挂起）
- 现象：YGOProDeck 图源在 CDN 测试工具中始终加载失败
- 原因：YGOProDeck 启用了 Cloudflare Turnstile 人机验证，程序化请求被拦截
- 影响范围：仅影响 CDN 测试工具中的 YGOProDeck 图源对比，不影响游戏正常功能
- 待后续决策：是否从 CDN 测试工具中移除 YGOProDeck 图源
