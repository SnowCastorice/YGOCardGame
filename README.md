# 🎴 YGO Pack Opener — 游戏王卡包开封模拟器

> 复刻游戏王实体卡包的开包体验！选择经典卡包，撕开包装，看看你能抽到什么稀有卡牌！

[![Deploy Status](https://img.shields.io/badge/deploy-Cloudflare%20Pages-orange?logo=cloudflare)](https://ygocardgame.pages.dev/)
[![Version](https://img.shields.io/badge/version-v1.11.2-blue)](#)
[![License](https://img.shields.io/badge/license-非商业用途-green)](#版权声明)

👉 **[点击这里在线体验！](https://ygocardgame.pages.dev/)**

---

## ✨ 功能特性

### 🎴 核心玩法
- **真实卡包开封** — OCG 经典卡包，还原实体开包体验（开包概率，+1包体验）

### 🎯 稀有度系统
- **LOCH 破框卡** — 浮雕破框、棱镜秘钻破框、特级大师破框三种超稀有版本

###  经济系统
- **市场价格** — 基于「集换社」真实市场价格的卡片价值系统
- **盈亏统计** — 背包显示总市场价值与累计开包花费的盈亏对比

### 📦 收藏与管理
- **背包系统** — 自动记录所有开到的卡片，支持多种排序和统计
- **图鉴系统** — 卡包预览 + 收集进度追踪
- **开包统计** — 显示个人开包数 / 全球开包数
- **数据管理** — 导出/导入存档，支持跨设备迁移游戏数据

---

## 🏗️ 技术栈

纯前端项目，无框架依赖，无构建工具，无后端服务。

| 技术 | 用途 |
|------|------|
| HTML + CSS + JavaScript | 页面结构、样式、游戏逻辑 |
| IndexedDB | 卡牌数据本地缓存 |
| Cloudflare Pages | 静态部署 + 无服务器函数 |
| Cloudflare KV | 全局开包统计存储 |

---

## 📁 项目结构

```
YGOCardGame/
├── index.html                    ← 游戏入口
├── css/style.css                 ← 全部样式
├── js/                           ← 核心逻辑（游戏、背包、货币、价格等）
├── data/
│   ├── ocg/                      ← OCG 数据（卡包配置、卡牌数据、市场价格、封面图）
│   └── common/                   ← 公共数据（稀有度定义、离线备用）
├── tools/                        ← 开发工具（OCR 价格更新、卡包数据构建等）
├── functions/api/                ← Cloudflare Pages Functions
├── admin/                        ← 管理后台
└── docs/                         ← 项目文档
```

---

## 🛠️ 开发相关

本项目使用 AI 辅助开发，详细的开发规范、数据架构、工具脚本说明等信息，请参阅 **[docs/SETUP.md](docs/SETUP.md)**。

### OCR 价格更新

- **一键工作流**：`local/venv/Scripts/python.exe tools/ocr_workflow.py <日期>`
- **自动流程**：截图裁切 → OCR 识别 → 解析价格 → 人工确认 → 合并 JSON

详见：[docs/TOOLS.md](docs/TOOLS.md)

---

## 📖 文档索引

| 文档 | 说明 |
|------|------|
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 近期变更记录 |
| [docs/SETUP.md](docs/SETUP.md) | 设备配置与环境指南 |
| [docs/TOOLS.md](docs/TOOLS.md) | 工具脚本使用说明 |

---

## 🌐 项目信息

- **GitHub**：https://github.com/SnowCastorice/YGOCardGame
- **线上地址**：https://ygocardgame.pages.dev/
- **部署**：Cloudflare Pages

---

## ⚖️ 版权声明

- 卡牌数据由 [YGOCDB](https://ygocdb.com/) 和 [YGOProDeck](https://ygoprodeck.com/) 提供
- Yu-Gi-Oh! 是 [Konami Digital Entertainment](https://www.konami.com/) 的注册商标
- 本项目仅供学习和娱乐用途，**不可用于商业目的**
