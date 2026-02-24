OCG 卡包本地封面图目录
========================

此目录用于存放 OCG 卡包的本地封面图。
当 packs.json 中没有配置 coverImage（在线封面 URL）时，
程序会自动尝试从此目录加载对应卡包的封面图。

文件命名规则：
  {卡包编码}.png
  
例如：
  BLZD.png    → BLAZING DOMINION 的封面图
  CH02.png    → THE CHRONICLES DECK 的封面图
  25DB.png    → DUELIST BOX 的封面图

支持格式：PNG（推荐）

封面图获取 fallback 链：
  1. packs.json 中的 coverImage 字段（如 Yugipedia 日文封面 URL）
  2. 本目录中的本地封面图（data/ocg/covers/{packCode}.png）
  3. 卡包首张卡的卡图（自动从 YGOCDB CDN 获取）
  4. emoji 🎴 兜底

如何获取 OCG 封面图：
  - Yugipedia: https://yugipedia.com/
    通过 API 查询：
    https://yugipedia.com/api.php?action=query&titles={卡包英文名}&prop=images&format=json
    找到 BoosterJP.png / DeckJP.png 等文件后，再查其真实 URL：
    https://yugipedia.com/api.php?action=query&titles=File:{文件名}&prop=imageinfo&iiprop=url&format=json
