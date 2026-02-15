# 🎴 TCG Pack Opener — 游戏王卡包开封模拟器

> 复刻游戏王实体卡包的开包体验！选择经典卡包，撕开包装，看看你能抽到什么稀有卡牌！

[![Deploy Status](https://img.shields.io/badge/deploy-Cloudflare%20Pages-orange?logo=cloudflare)](https://pages.cloudflare.com/)
[![Version](https://img.shields.io/badge/version-v0.2.0-blue)](#版本历史)
[![License](https://img.shields.io/badge/license-非商业用途-green)](#版权声明)

---

## ✨ 功能特性

- 🎴 **真实卡包开封体验** — 从经典游戏王卡包中抽取卡牌，体验开包的快感
- 🌐 **接入 YGOProDeck API** — 自动获取真实卡牌数据和高清卡图
- 🎯 **稀有度系统** — N / R / SR / UR 四个等级，带权重随机抽取
- 🛡️ **保底机制** — 每包最后一张卡至少为 R 稀有度
- 💾 **智能缓存系统** — IndexedDB + Cache API 双缓存，减少网络请求
- 📴 **离线可用** — API 不可用时自动降级为内置备用数据
- 📱 **响应式设计** — 完美适配手机和平板
- 📋 **更新日志** — 内置版本更新记录查看

### 已收录卡包

| 卡包名称 | 编码 | 每包张数 |
|----------|------|---------|
| 传说之蓝眼白龙 | LOB | 9 张 |
| 金属侵略者 | MRD | 9 张 |
| 法老的仆从 | PSV | 9 张 |

> 更多经典卡包持续添加中...

---

## 🚀 在线体验

👉 **[点击这里开始开包！](https://ygocardgame.pages.dev/)**

项目部署在 Cloudflare Pages 上，推送到 GitHub 后自动部署。

---

## 🏗️ 技术栈

| 技术 | 用途 |
|------|------|
| HTML5 | 页面结构 |
| CSS3 | 样式、动画（CSS 变量 + Keyframe 动画） |
| JavaScript (ES6+) | 游戏逻辑、API 调用、缓存管理 |
| IndexedDB | 卡牌数据本地缓存（7天有效期） |
| Cache API | 卡牌图片本地缓存（30天有效期） |
| [YGOProDeck API v7](https://ygoprodeck.com/api-guide/) | 卡牌数据与图片来源 |
| Cloudflare Pages | 自动部署 |

> **纯前端项目**，无框架依赖，无构建工具，无后端服务。

---

## 📁 项目结构

```
TCGGame/
├── index.html              ← 游戏主页面入口
├── css/
│   └── style.css           ← 全部样式与动画
├── js/
│   ├── api.js              ← API 调用 + 缓存管理模块
│   └── game.js             ← 游戏核心逻辑
├── data/
│   ├── cards.json          ← ⭐ 卡包配置表（策划编辑用）
│   ├── changelog.json      ← 更新日志数据
│   └── fallback_cards.js   ← 离线备用卡牌数据
├── VERSION.md              ← 项目说明与版本记录
└── README.md               ← 本文件
```

---

## 🎮 如何添加新卡包

编辑 `data/cards.json`，在 `packs` 数组中添加一个新条目：

```json
{
  "packId": "pack_XXX",
  "packName": "卡包中文名",
  "setCode": "YGOProDeck 上的卡包英文全名",
  "cardsPerPack": 9,
  "rarityRates": { "UR": 3, "SR": 8, "R": 20, "N": 69 },
  "guaranteedRareSlot": true
}
```

| 字段 | 含义 | 示例 |
|------|------|------|
| `packId` | 唯一 ID（不能重复） | `"pack_LOB"` |
| `packName` | 网页上显示的中文名 | `"传说之蓝眼白龙"` |
| `setCode` | YGOProDeck API 的卡包英文全名 | `"Legend of Blue Eyes White Dragon"` |
| `cardsPerPack` | 每包抽几张卡 | `9` |
| `rarityRates` | 各稀有度的权重（数字越大越容易抽到） | `UR:3, SR:8, R:20, N:69` |
| `guaranteedRareSlot` | 是否保底最后一张 R 以上 | `true` / `false` |

> 💡 **你不需要手动填写卡牌数据！** 只要填对 `setCode`，系统会自动从 API 获取该卡包的所有卡牌。

---

## 🗺️ 开发路线图

- [ ] 🃏 收藏系统 / 图鉴 — 记录已抽到的卡牌
- [ ] 🎬 更丰富的开包动画 — 更接近实体卡包的撕开体验
- [ ] 🔄 连抽 / 天井机制 — 电子游戏特有的抽卡机制
- [ ] 🏪 卡包商店系统
- [ ] 🔊 音效系统 — 开包、稀有卡出现等音效
- [ ] 🔍 卡牌详情弹窗 — 点击查看大图和效果描述

---

## 📋 版本历史

### v0.2.0（2026-02-13）— 接入 YGOProDeck API

- 🌐 接入 YGOProDeck API，自动获取真实卡牌数据和卡图
- 💾 实现 IndexedDB + Cache API 双缓存系统
- 🖼️ 开包结果显示真实卡牌图片
- 📦 卡包配置改为使用官方卡包编码
- 🎯 新增保底机制（每包最后一张至少 R）
- 💾 新增缓存管理界面
- 📱 优化移动端适配
- 初始配置 3 个经典卡包

### v0.1.0（2026-02-13）— 项目初始化

- 创建项目基础结构（HTML + CSS + JS 三层分离）
- 实现卡牌配置表系统（JSON 格式）
- 实现基础开包动画和卡牌展示
- 添加稀有度系统：N / R / SR / UR
- 添加更新日志页面
- 适配 Cloudflare Pages 部署

---

## ⚖️ 版权声明

- 卡牌数据由 [YGOProDeck](https://ygoprodeck.com/) 提供
- Yu-Gi-Oh! 是 [Konami Digital Entertainment](https://www.konami.com/) 的注册商标
- 本项目仅供学习和娱乐用途，**不可用于商业目的**
- 使用 YGOProDeck API 需遵守其使用规范（每秒 ≤20 次请求，卡图必须缓存）
