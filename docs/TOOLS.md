# 🛠️ 工具脚本说明

> 从 DEVELOPMENT.md 拆分，详述各 Python 工具脚本的用法。

## `update_cards_db.py` — 百鸽(YGOCDB) 卡牌数据库更新脚本

从百鸽 API (`ygocdb.com/api/v0/cards.zip`) 下载全量卡牌数据库，替换本地 `data/common/cards.json`。
使用 MD5 校验实现增量更新，只有数据有变化时才重新下载。

| 命令 | 说明 |
|------|------|
| `python update_cards_db.py` | 检查更新并下载（有更新才下载） |
| `python update_cards_db.py --force` | 强制重新下载（跳过 MD5 检查） |
| `python update_cards_db.py --check` | 只检查是否有更新，不下载 |
| `python update_cards_db.py --rebuild` | 下载后自动运行 build_pack_data.py 重建所有卡包 |
| `python update_cards_db.py --info` | 查看本地 cards.json 信息和远程 MD5 |

> 💡 推荐工作流：`python update_cards_db.py --rebuild`（一键更新数据库 + 重建卡包）
> ⚠️ 百鸽服务器是作者自费维护的，请合理使用，不要频繁调用。

## `build_pack_data.py` — OCG 卡包数据构建脚本

从 `data/common/cards.json`（YGOCDB 全量数据库）提取卡牌详情，注入到 `data/ocg/cards/*.json` 中。
构建后的卡包文件包含完整信息（中/日/英文名、攻防、效果），网页运行时无需调用 API。

| 命令 | 说明 |
|------|------|
| `python build_pack_data.py` | 构建所有 OCG 卡包 |
| `python build_pack_data.py ocg_blzd` | 只构建指定卡包 |
| `python build_pack_data.py --check` | 检查哪些卡找不到（不修改文件） |
| `python build_pack_data.py --info` | 查看 cards.json 统计信息 |

> ⚠️ 每次新增或更新卡包后，必须运行此脚本。

## `fetch_packs.py` — 卡包数据抓取工具

从 YGOCDB 网站抓取卡包数据的离线 Python 脚本。

| 命令 | 说明 |
|------|------|
| `python fetch_packs.py list ocg` | 列出 OCG 卡包列表（默认 20 个） |
| `python fetch_packs.py list tcg` | 列出 TCG 卡包列表 |
| `python fetch_packs.py fetch <ID>` | 获取指定卡包卡牌收录 |
| `python fetch_packs.py fetch <ID> --write` | 获取并写入独立文件 + 更新 packs.json |
| `python fetch_packs.py latest ocg` | 获取最新一期 OCG 补充包 |
| `python fetch_packs.py gen-list` | 更新卡包列表文件 |

## `fetch_yugiohmeta.py` — YugiohMeta 卡图映射表构建

从 YugiohMeta API 查询卡牌密码到 S3 CDN 图片 ID 的映射。

| 命令 | 说明 |
|------|------|
| `python fetch_yugiohmeta.py build-all` | 为所有 TCG 卡包构建映射 |
| `python fetch_yugiohmeta.py build "<setCode>"` | 为指定卡包构建映射 |
| `python fetch_yugiohmeta.py test <password>` | 测试单张卡映射 |
| `python fetch_yugiohmeta.py info` | 查看映射表信息 |