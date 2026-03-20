# 📋 YGOCardGame 待办事项

> 本文件记录项目的待办事项和规划，按优先级和状态分类管理。

---

## 🔴 上线前剩余工作

### 价格数据更新
- [x] 更新 LOCR 的价格（OCR 识别完成，77张卡/286条价格）
- [ ] 更新 LOCR 的 LOSP 包价格
- [ ] 更新 LOCH 的价格
- [ ] 更新 LOCH 的 LOSP 包价格
- [ ] 更新 BLZD 和对应的+1包价格

### LOCR 价格补充（OCR 缺失项）
- [ ] 补充 LOCR-JP054（星义旗舰兽）整卡价格
- [ ] 补充 LOCR-JP055（PSY骨架装备·γ）整卡价格
- [ ] 补充 LOCR-JP065（No.65 裁断魔人）部分稀有度价格
- [ ] 补充其余 24 项缺失稀有度价格（详见 test_output/price_comparison.csv）

---

## 🟡 近期规划

### 1. 自建卡图 CDN
- 当前使用第三方 CDN（YGOCDB / KONAMI / YugiohMeta），暂时够用
- 后续计划迁移到 Cloudflare R2 对象存储
- **触发时机**：活跃卡包超 10 个或第三方 CDN 不稳定时启动

### 2. LOSP 包单独拆分
- 包括卡片信息文件、卡图保存文件等
- LOCH 和 LOCR 的+1包只是调用 LOSP 包中的部分编号的卡片
- 这样有利于项目的管理，避免数据冗余

### 3. BLZD 的+1包也单独拆分
- 理由同 LOSP 包拆分
- 将+1包数据独立管理，主包只引用+1包中的卡片编号

### 4. 准备自动切割卡图流程
- 避免手动切图效率低下且质量不一的问题
- 建立从原始图片到标准化卡图的自动化 pipeline

---

## 🔵 已记录的技术问题

### YGOProDeck 图源限流（挂起）
- 现象：YGOProDeck 图源在 CDN 测试工具中始终加载失败
- 原因：YGOProDeck 启用了 Cloudflare Turnstile 人机验证，程序化请求被拦截
- 影响范围：仅影响 CDN 测试工具中的 YGOProDeck 图源对比，不影响游戏正常功能
- 待后续决策：是否从 CDN 测试工具中移除 YGOProDeck 图源

### 优化网页 UI（待规划）
- 作为大方向记录，具体优化内容待后续细化

---

## ✅ 已完成

### LOCR 卡图本地化（2026-03-20）
- 新增 171 张 LOCR 本地卡图
- 新增 locr_image_map.json 映射表
- 卡图系统重构（新增 localImages 模式）
- 修复 LOSP 辅助包卡图显示问题

### LOCR 价格数据首次填充（2026-03-21）
- OCR 识别 77 张卡片，286 条价格记录
- 盒价 ¥370.0，包价 ¥9.9
- OCR 工具链扩展支持 LOCR（extract_prices.py + merge_prices.py + ocr_workflow.py）

### LOCH/LOSP 卡图 CDN 切换（2026-03-04）
- S3 CDN 作为主图源，Cloudflare Pages 本地图片作为备份
- 已验证通过
