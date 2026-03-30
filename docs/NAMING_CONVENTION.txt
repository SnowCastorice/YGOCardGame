================================================================================
  PreviewCards 先行卡图 文件命名规范
================================================================================

一、命名格式
--------------------------------------------------------------------------------

  {卡片编号}_{稀有度}_{卡图来源}_{卡图类型}.{扩展名}

  分隔符: _ (下划线)
  卡片编号内部保留 - (连字符)，这是官方卡号的固有格式

二、字段说明
--------------------------------------------------------------------------------

  1. 卡片编号
     - 格式: {卡包代号}-{地区}{编号}
     - 示例: LOCR-JP001, LOCH-JP038

  2. 稀有度
     - 基础稀有度: SR, UR, PSER, GMR 等
     - 超框(Over Frame)变种: 在基础稀有度后加 -OF
       * UR     = 普通 UR（传统卡框）
       * UR-OF  = 超框 UR（Over Frame 版本，突破传统卡框的特殊设计）
       * PSER    = 普通 Prismatic Secret Rare
       * PSER-OF = 超框 Prismatic Secret Rare
       * GMR     = 普通 Ghost Millennium Rare
       * GMR-OF  = 超框 Ghost Millennium Rare

     ★ 重要说明：
       OF = Over Frame（超框），不是 Official（官方）的缩写！
       有 OF 的卡是超框版本，没有 OF 的是传统卡框版本。
       超框卡图与普通卡图的卡面设计不同，需要区分保存。

  3. 卡图来源
     - official : 官方网站（如 yu-gioh.jp 产品页面）
     - twitter  : 官方推特/X 账号发布的图片
     - ygojp    : ygojp.com 等第三方游戏王数据站点
     - ygometa  : ygometa.com 游戏王元数据站点

  4. 卡图类型（格式: {来源方式}_{处理状态}）
     - render_art    : 渲染图成品（来自官方渲染图，可直接导入游戏使用）
     - photo_art     : 实卡照片成品（来自实卡拍照，可直接导入游戏使用）
     - render_source : 渲染图素材（来自官方渲染图，包含背景/介绍等内容，需裁切后才能使用）
     - photo_source  : 实卡照片素材（来自实卡拍照，包含背景/介绍等内容，需裁切后才能使用）

     ★ art vs source 说明：
       art    = 成品卡图，已经是纯卡图区域，可直接导入游戏作为卡图使用
       source = 原始素材，包含背景、介绍文字等无效信息，需要后期裁切去除无效区域

三、命名示例
--------------------------------------------------------------------------------

  完整文件名示例:

  LOCR-JP001_GMR-OF_twitter_render_art.jpg
    → LOCR-JP001 的超框GMR版本，来源于官推，渲染图成品（可直接使用）

  LOCR-JP001_GMR-OF_twitter_render_source.jpg
    → LOCR-JP001 的超框GMR版本，来源于官推，渲染图素材（需裁切）

  LOCR-JP001_GMR-OF_twitter_photo_art.jpg
    → LOCR-JP001 的超框GMR版本，来源于官推，实卡照片成品（可直接使用）

  LOCR-JP001_GMR-OF_twitter_photo_source.jpg
    → LOCR-JP001 的超框GMR版本，来源于官推，实卡照片素材（需裁切）

  LOCR-JP005_PSER-OF_twitter_render_art.jpg
    → LOCR-JP005 的超框PSER版本，来源于官推，渲染图成品

  LOCR-JP019_UR_ygojp_render_art.webp
    → LOCR-JP019 的普通UR版本，来源于ygojp，渲染图成品

  LOCR-JP031_UR_ygojp_render_art.jpg
    → LOCR-JP031 的普通UR版本，来源于ygojp，渲染图成品

  LOCR-JP018_UR_twitter_render_art.jpg
    → LOCR-JP018 的普通UR版本（无OF = 传统卡框），来源于官推，渲染图成品

四、目录结构说明
--------------------------------------------------------------------------------

  PreviewCards/
  ├── NAMING_CONVENTION.txt    ← 本文件（命名规范）
  ├── {卡包代号}/
  │   ├── cards/               ← 最终整理好的卡图（按命名规范命名）
  │   └── origin/              ← 原始素材（按来源分类存放）
  │       ├── ygojp/           ← 来自 ygojp 的原始图片
  │       ├── twitter/         ← 来自官方推特的原始图片（原"官方推特"目录）
  │       ├── official/        ← 来自官方网站的原始图片
  │       └── ygometa/         ← 来自 ygometa.com 的原始图片

五、注意事项
--------------------------------------------------------------------------------

  1. 扩展名保持原始格式，不做强制转换（jpg/webp/png 等均可）
  2. 同一张卡可能有多个版本（不同稀有度、不同来源、不同裁切方式），均需分别保存
  3. origin 目录中的文件为收集到的原始素材，可保留原始文件名
  4. cards 目录中的文件必须按本规范重命名
  5. 当一个来源的图片同时有 source（素材）和 art（成品）时，cards 目录中只保留 art 版本
  6. 重复命名处理：当两张图按规则生成相同文件名但 MD5 值不同时，
     在文件名末尾（扩展名前）追加 _X 后缀区分：
     - 先命名的文件用 _0，后续依次 _1、_2……
     - 无冲突的文件不加任何后缀
     - 示例: LOCR-JP001_UR-OF_official_render_art_0.jpg
             LOCR-JP001_UR-OF_official_render_art_1.jpg
