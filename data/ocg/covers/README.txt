OCG 卡包本地封面图目录
========================

此目录用于存放 OCG 卡包的本地封面图，用于替代远程日服图源（LCP 优化）。
程序会优先从此目录加载封面图，加载失败时自动 fallback 到外部 URL。

文件命名规则：
  {卡包编码}-{类型}.{png|jpg}

  类型说明：
    -pack   → 主界面卡包列表使用的封面图（通常是卡包正面）
    -box    → 开包详情界面使用的封面图（通常是整盒包装）
    -spack  → 预留用途（暂不由程序自动加载）

示例：
  LOCH-pack.png    → LEGACY OF CHAOS 主界面封面图
  LOCH-box.png     → LEGACY OF CHAOS 详情页封面图
  LOCH-spack.jpg   → LEGACY OF CHAOS 预留图（不自动加载）
  BLZD-pack.png    → BLAZING DOMINION 主界面封面图
  BLZD-box.png     → BLAZING DOMINION 详情页封面图
  LOCR-pack.jpg    → LEGACY OF CARD REVOLUTION 主界面封面图
  LOCR-box.png     → LEGACY OF CARD REVOLUTION 详情页封面图
  LOCR-spack.jpg   → LEGACY OF CARD REVOLUTION 预留图（不自动加载）

支持格式：PNG（推荐）、JPG
  程序会按 png → jpg 顺序自动尝试，无需手动指定后缀。

封面图加载 fallback 链：
  主界面（type=pack）：
    1. 本地封面图 data/ocg/covers/{packCode}-pack.png（不存在则尝试 .jpg）
    2. packs.json 中的 coverImage 字段（如 Yugipedia 日文封面 URL）
    3. coverCardId 对应的卡图
    4. YGOProDeck set_image
    5. 卡包首张卡的卡图（自动从 YGOCDB CDN 获取）
    6. emoji 🎴 兜底

  详情页（type=box）：
    1. 本地封面图 data/ocg/covers/{packCode}-box.png（不存在则尝试 .jpg）
    2. packs.json 中的 coverImage 字段
    3. coverCardId 对应的卡图
    4. YGOProDeck set_image
    5. 隐藏图片

如何获取 OCG 封面图：
  - Yugipedia: https://yugipedia.com/
    通过 API 查询：
    https://yugipedia.com/api.php?action=query&titles={卡包英文名}&prop=images&format=json
    找到 BoosterJP.png / DeckJP.png 等文件后，再查其真实 URL：
    https://yugipedia.com/api.php?action=query&titles=File:{文件名}&prop=imageinfo&iiprop=url&format=json
