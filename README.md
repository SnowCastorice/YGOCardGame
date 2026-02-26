# 🎴 YGO Pack Opener — 游戏王卡包开封模拟器

> 复刻游戏王实体卡包的开包体验！选择经典卡包，撕开包装，看看你能抽到什么稀有卡牌！

[![Deploy Status](https://img.shields.io/badge/deploy-Cloudflare%20Pages-orange?logo=cloudflare)](https://ygocardgame.pages.dev/)
[![Version](https://img.shields.io/badge/version-v1.4.6-blue)](#)
[![License](https://img.shields.io/badge/license-非商业用途-green)](#版权声明)

👉 **[点击这里在线体验！](https://ygocardgame.pages.dev/)**

---

## ✨ 功能特性

- 🎴 **真实卡包开封** — OCG 经典卡包，还原实体开包体验（每包 5 张）
- 🎯 **完整稀有度体系** — 支持 N / NR / R / SR / UR / SER / UTR / PSER 八种稀有度
- �️ **高清卡图** — 卡图来自 YGOCDB CDN，日文版高清卡图
- � **货币系统** — 金币 / 钻石双货币，开包消耗，可互相兑换
- 🎒 **背包收集** — 自动记录所有开到的卡片，支持多种排序和统计
- � **卡包预览** — 开包前可预览卡包内所有卡片及收集进度
- 📴 **离线可用** — OCG 模式采用本地数据，零 API 调用，加载几乎瞬时
- � **移动端专属** — 为手机用户设计，桌面端居中展示

---

## 🏗️ 技术栈

纯前端项目，无框架依赖，无构建工具，无后端服务。

| 技术 | 用途 |
|------|------|
| HTML + CSS + JavaScript | 页面结构、样式、游戏逻辑 |
| IndexedDB | 卡牌数据本地缓存 |
| YGOCDB CDN | 日文版卡图来源 |
| Cloudflare Pages | 静态部署 + 无服务器函数 |

---

## 📁 项目结构

```
YGOCardGame/
├── index.html                ← 游戏入口
├── css/style.css             ← 全部样式
├── js/
│   ├── api.js                ← API 调用 + 缓存管理
│   ├── game.js               ← 游戏核心逻辑
│   ├── currency.js           ← 货币系统
│   └── inventory.js          ← 背包系统
├── data/
│   ├── ocg/
│   │   ├── packs.json        ← OCG 卡包配置
│   │   ├── cards/*.json      ← 各卡包的卡牌数据（含完整详情）
│   │   └── covers/           ← 卡包封面图
│   ├── common/cards.json     ← YGOCDB 全量卡牌数据库
│   ├── changelog.json        ← 更新日志
│   └── fallback_cards.js     ← 离线备用数据
├── functions/api/             ← Cloudflare Pages Functions
├── DEVELOPMENT.md            ← AI 协作开发指南（详细开发文档）
└── README.md                 ← 本文件
```

---

## 🛠️ 开发相关

本项目使用 AI 辅助开发，详细的开发规范、数据架构、工具脚本说明等信息，请参阅 **[DEVELOPMENT.md](./DEVELOPMENT.md)**。

### 常用工具脚本

| 脚本 | 用途 |
|------|------|
| `python build_pack_data.py` | 构建 OCG 卡包本地数据（注入卡牌详情） |
| `python fetch_packs.py list ocg` | 从 YGOCDB 抓取卡包列表 |
| `python fetch_packs.py fetch <ID> --write` | 抓取指定卡包并写入本地文件 |

---

## ⚖️ 版权声明

- 卡牌数据由 [YGOCDB](https://ygocdb.com/) 和 [YGOProDeck](https://ygoprodeck.com/) 提供
- Yu-Gi-Oh! 是 [Konami Digital Entertainment](https://www.konami.com/) 的注册商标
- 本项目仅供学习和娱乐用途，**不可用于商业目的**
