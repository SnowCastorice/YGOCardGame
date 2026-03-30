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

---

## 🔵 已记录的技术问题

### YGOProDeck 图源限流（挂起）
- 现象：YGOProDeck 图源在 CDN 测试工具中始终加载失败
- 原因：YGOProDeck 启用了 Cloudflare Turnstile 人机验证，程序化请求被拦截
- 影响范围：仅影响 CDN 测试工具中的 YGOProDeck 图源对比，不影响游戏正常功能
- 待后续决策：是否从 CDN 测试工具中移除 YGOProDeck 图源
