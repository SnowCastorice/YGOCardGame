# TCG Pack Opener - 项目说明与版本记录

## 📌 项目概览

- **项目名称**：TCG Pack Opener（卡包开封模拟器）
- **当前版本**：v0.2.0
- **部署方式**：Cloudflare Pages（通过GitHub仓库自动部署）
- **项目目标**：复刻游戏王实体卡包的开包体验，后续会添加电子游戏特有的功能
- **数据来源**：YGOProDeck API（卡牌数据自动获取，无需手动维护）

---

## 📁 项目目录结构

```
TCGGame/
├── index.html          ← 游戏主页面（入口文件）
├── css/
│   └── style.css       ← 所有样式（动画、布局、卡牌效果等）
├── js/
│   ├── api.js          ← 🆕 API 调用与缓存管理模块
│   └── game.js         ← 游戏核心逻辑（开包、抽卡、动画控制等）
├── data/
│   ├── cards.json      ← ⭐ 卡包配置表（策划编辑：卡包编码、概率、每包张数）
│   └── changelog.json  ← 更新日志数据（网页上展示的版本记录）
├── VERSION.md          ← 本文件（项目说明与开发记录）
└── 需求.txt             ← 原始需求文档
```

---

## 🎮 配置修改指引（策划必读）

### 如何添加新卡包？

打开 `data/cards.json`，在 `packs` 数组中添加一个新条目：

```json
{
  "packId": "pack_XXX",
  "packName": "卡包中文名",
  "setCode": "YGOProDeck 上的卡包英文全名",
  "cardsPerPack": 9,
  "rarityRates": {
    "UR": 3,
    "SR": 8,
    "R": 20,
    "N": 69
  },
  "guaranteedRareSlot": true
}
```

**关键字段说明：**
| 字段 | 含义 | 示例 |
|------|------|------|
| packId | 唯一ID（不能重复） | "pack_LOB" |
| packName | 网页上显示的中文名 | "传说之蓝眼白龙" |
| setCode | YGOProDeck API 的卡包名 | "Legend of Blue Eyes White Dragon" |
| cardsPerPack | 每包抽几张卡 | 9 |
| rarityRates | 各稀有度的权重 | UR:3, SR:8, R:20, N:69 |
| guaranteedRareSlot | 是否保底最后一张R以上 | true / false |

> **注意**：你不需要手动填写卡牌数据了！只要填对 setCode，系统会自动从 API 获取该卡包的所有卡牌。

### 如何调整抽卡概率？

修改每个卡包的 `rarityRates` 权重数字。数字越大越容易抽到。
例如把 UR 从 3 改成 10，UR 出现概率就会变高。

### 如何更新版本日志？

编辑 `data/changelog.json`，在 `versions` 数组**最前面**添加新版本条目。

---

## 🔧 技术信息（给AI助手看的）

- **纯前端项目**：HTML + CSS + JavaScript，无框架依赖，无需构建工具
- **数据来源**：YGOProDeck API v7（https://db.ygoprodeck.com/api/v7/）
- **API 使用规范**：每秒≤20次请求，卡图必须缓存，非商业用途
- **缓存系统**：
  - IndexedDB（`TCGPackOpener`数据库）— 存储卡牌数据，过期时间7天
  - Cache API（`tcg-card-images`）— 缓存卡牌图片，过期时间30天
- **部署要求**：直接推送到 GitHub 仓库，Cloudflare Pages 自动部署
- **稀有度映射**：Ultra/Secret/Ultimate/Ghost Rare → UR，Super Rare → SR，Rare → R，Common → N
- **保底机制**：`guaranteedRareSlot: true` 时，每包最后一张至少 R 稀有度
- **动画系统**：CSS 动画 + JS 控制时序，包含开包撕裂动画和卡牌逐张翻转展示

---

## 📋 版本历史

### v0.2.0（2026-02-13）— 接入 YGOProDeck API

**本版本完成的内容：**
- ✅ 接入 YGOProDeck API，自动获取真实游戏王卡牌数据
- ✅ 开包结果显示真实卡牌图片
- ✅ 实现 IndexedDB + Cache API 双缓存系统
- ✅ 卡包配置改为使用官方卡包编码，无需手动填写卡牌
- ✅ 新增保底机制（每包最后一张至少 R）
- ✅ 新增缓存管理界面
- ✅ 新增全局加载状态提示
- ✅ 添加版权声明（YGOProDeck & Konami）
- ✅ 初始配置3个经典卡包

### v0.1.0（2026-02-13）— 项目初始化

**本版本完成的内容：**
- ✅ 项目基础结构搭建（HTML + CSS + JS 三层分离）
- ✅ 卡牌配置表系统（JSON格式）
- ✅ 基础开包流程：选择卡包 → 开包动画 → 展示结果
- ✅ 稀有度系统：N / R / SR / UR 四个等级
- ✅ 更新日志弹窗
- ✅ 适配 Cloudflare Pages 部署

**待开发功能（后续版本）：**
- ⬜ 收藏系统 / 图鉴
- ⬜ 更丰富的开包动画效果
- ⬜ 电子游戏特有功能（连抽、天井等）
- ⬜ 卡包商店系统
- ⬜ 音效系统
- ⬜ 卡牌详情弹窗（点击查看大图和效果描述）

---

## 💡 给接手开发的AI助手的备忘

> 如果你是一个新的AI助手，正在帮助这个项目的用户继续开发，请注意：
>
> 1. 用户是**游戏策划**，编程经验有限，请用**简单易懂的方式**沟通
> 2. 本项目是**纯前端项目**，部署在 Cloudflare Pages 上，不要引入后端服务
> 3. 卡牌数据通过 **YGOProDeck API** 自动获取并缓存到玩家设备
> 4. `data/cards.json` 现在只包含**卡包配置**（编码、概率等），不包含卡牌数据
> 5. `js/api.js` 负责 API 调用和缓存管理，`js/game.js` 负责游戏逻辑
> 6. 每次版本更新后，请同时更新 `data/changelog.json` 和本文件的版本历史
> 7. 项目目标是复刻**游戏王实体卡包**的开包体验
> 8. API 使用规范：每秒≤20次，卡图必须缓存，需标注来源，不可商用
