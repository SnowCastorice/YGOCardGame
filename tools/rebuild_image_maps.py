#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
重建 image map 文件：统一为 localImages 格式

根据迁移后的卡图文件名，自动生成 localImages 格式的 image map。
从文件名中提取 setNumber 和 rarity，通过旧 image map 的 password → setNumber 关系建立映射。

生成文件：
  - loch_image_map.json（重建，localImages 格式）
  - blzd_image_map.json（重建，localImages 格式）
  - blzds_image_map.json（新建）
  - losp_vol1_image_map.json（新建）
  - losp_vol2_image_map.json（新建）
  - locr_image_map.json（更新，移除 LOSP 条目）

用法：
    python tools/rebuild_image_maps.py
"""

import json
import os
import re
import sys


def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data, filepath):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def scan_local_images(images_dir):
    """扫描目录中的图片文件，按 setNumber 分组，提取稀有度 → 文件名列表映射

    每个稀有度对应一个数组，包含所有可用图源的文件名，按优先级从高到低排序。
    前端运行时从数组中取第一个（即最高优先级）使用。
    """
    # 文件名格式: {setNumber}_{rarity}_{source}_{type}.webp
    # 例: LOCH-JP001_UR_ygometa_render_art.webp
    #     LOCR-JP001_GMR-OF_twitter_photo_art.webp
    result = {}  # { setNumber: { rarity: [(priority, filename), ...] } }

    # 图源优先级（数字越小优先级越高）
    source_priority = {
        'twitter_photo_art': 1,
        'twitter_render_art': 2,
        'tcgcorner_photo_art': 3,
        'ygojp_render_art': 4,
        'official_render_art': 5,
        'ygometa_render_art': 6,
    }

    if not os.path.exists(images_dir):
        return {}

    for filename in sorted(os.listdir(images_dir)):
        if not filename.endswith('.webp'):
            continue

        # 解析文件名：setNumber 部分包含连字符(-)，稀有度也可能包含连字符(如 GMR-OF)
        # 格式: {PACK}-{REGION}{NUM}_{RARITY}_{SOURCE}_{TYPE}.webp
        match = re.match(r'^([A-Z]+-[A-Z]+\d+)_([A-Z]+(?:-[A-Z]+)?)_(.+)\.webp$', filename)
        if not match:
            print(f"  ⚠️ 无法解析文件名: {filename}")
            continue

        set_number = match.group(1)
        rarity = match.group(2)
        source_type = match.group(3)

        if set_number not in result:
            result[set_number] = {}
        if rarity not in result[set_number]:
            result[set_number][rarity] = []

        priority = source_priority.get(source_type, 99)
        result[set_number][rarity].append((priority, filename))

    # 对每个稀有度的文件列表按优先级排序，然后只保留文件名
    final = {}
    for set_number, rarity_map in result.items():
        final[set_number] = {}
        for rarity, file_list in rarity_map.items():
            file_list.sort(key=lambda x: x[0])  # 按优先级升序（数字越小越优先）
            final[set_number][rarity] = [f for _, f in file_list]

    return final


def build_image_map(images_dir, name_source, description):
    """构建 localImages 格式的 image map

    key 为 setNumber，值为 { name, localImages: { rarity: [filename, ...] } }

    Args:
        images_dir: 图片目录路径
        name_source: 卡名来源字典（setNumber → name），用于填充 name 字段
        description: 文件说明
    """
    # 扫描本地图片
    local_images = scan_local_images(images_dir)

    # 构建 cards 对象（key = setNumber）
    cards = {}
    for set_number, rarity_map in sorted(local_images.items()):
        name = name_source.get(set_number, '')
        cards[set_number] = {
            'name': name,
            'localImages': rarity_map,
        }

    return {
        '_说明': description,
        '_格式': 'localImages 中每个稀有度对应一个文件名数组，按图源优先级从高到低排序',
        '_生成方式': '由 tools/rebuild_image_maps.py 自动生成',
        'cards': cards,
    }


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ocg_dir = os.path.join(base_dir, 'data', 'ocg')
    maps_dir = os.path.join(ocg_dir, 'image_maps')

    # 确保 image_maps 目录存在
    os.makedirs(maps_dir, exist_ok=True)

    print("=" * 60)
    print("重建 image map 文件（统一为 localImages 格式）")
    print("=" * 60)

    # 从现有 image map 中提取 setNumber → name 映射
    # 现有 map 的 key 已经是 setNumber
    def extract_names(map_data):
        """从 image map 中提取 setNumber → name 映射"""
        names = {}
        for key, info in map_data.get('cards', {}).items():
            if isinstance(info, dict) and info.get('name'):
                names[key] = info['name']
        return names

    old_loch = load_json(os.path.join(maps_dir, 'loch_image_map.json'))
    old_blzd = load_json(os.path.join(maps_dir, 'blzd_image_map.json'))
    old_blzds = load_json(os.path.join(maps_dir, 'blzds_image_map.json'))
    old_locr = load_json(os.path.join(maps_dir, 'locr_image_map.json'))
    old_losp1 = load_json(os.path.join(maps_dir, 'losp_vol1_image_map.json'))
    old_losp2 = load_json(os.path.join(maps_dir, 'losp_vol2_image_map.json'))

    loch_names = extract_names(old_loch)
    blzd_names = extract_names(old_blzd)
    blzds_names = extract_names(old_blzds)
    locr_names = extract_names(old_locr)
    losp1_names = extract_names(old_losp1)
    losp2_names = extract_names(old_losp2)

    # ===== 1. LOCH =====
    print("\n🔄 重建 loch_image_map.json...")
    loch_map = build_image_map(
        os.path.join(base_dir, 'data', 'ocg', 'images', 'loch'),
        loch_names,
        'LOCH 卡图映射表 — setNumber -> 本地卡图文件名（按稀有度）',
    )
    save_json(loch_map, os.path.join(maps_dir, 'loch_image_map.json'))
    print(f"  ✅ {len(loch_map['cards'])} 张卡")

    # ===== 2. BLZD =====
    print("\n🔄 重建 blzd_image_map.json...")
    blzd_map = build_image_map(
        os.path.join(base_dir, 'data', 'ocg', 'images', 'blzd'),
        blzd_names,
        'BLZD 卡图映射表 — setNumber -> 本地卡图文件名（按稀有度）',
    )
    save_json(blzd_map, os.path.join(maps_dir, 'blzd_image_map.json'))
    print(f"  ✅ {len(blzd_map['cards'])} 张卡")

    # ===== 3. BLZDS =====
    print("\n🔄 重建 blzds_image_map.json...")
    blzds_map = build_image_map(
        os.path.join(base_dir, 'data', 'ocg', 'images', 'blzds'),
        blzds_names,
        'BLZDS 辅助包卡图映射表 — setNumber -> 本地卡图文件名',
    )
    save_json(blzds_map, os.path.join(maps_dir, 'blzds_image_map.json'))
    print(f"  ✅ {len(blzds_map['cards'])} 张卡")

    # ===== 4. LOSP vol1 =====
    print("\n🔄 重建 losp_vol1_image_map.json...")
    losp_vol1_map = build_image_map(
        os.path.join(base_dir, 'data', 'ocg', 'images', 'losp_vol1'),
        losp1_names,
        'LOSP vol1 辅助包卡图映射表 — setNumber -> 本地卡图文件名',
    )
    save_json(losp_vol1_map, os.path.join(maps_dir, 'losp_vol1_image_map.json'))
    print(f"  ✅ {len(losp_vol1_map['cards'])} 张卡")

    # ===== 5. LOSP vol2 =====
    print("\n🔄 重建 losp_vol2_image_map.json...")
    losp_vol2_map = build_image_map(
        os.path.join(base_dir, 'data', 'ocg', 'images', 'losp_vol2'),
        losp2_names,
        'LOSP vol2 辅助包卡图映射表 — setNumber -> 本地卡图文件名',
    )
    save_json(losp_vol2_map, os.path.join(maps_dir, 'losp_vol2_image_map.json'))
    print(f"  ✅ {len(losp_vol2_map['cards'])} 张卡")

    # ===== 6. LOCR =====
    print("\n🔄 重建 locr_image_map.json...")
    locr_map = build_image_map(
        os.path.join(base_dir, 'data', 'ocg', 'images', 'locr'),
        locr_names,
        'LOCR 卡图映射表 — setNumber -> 本地卡图文件名（按稀有度）',
    )
    save_json(locr_map, os.path.join(maps_dir, 'locr_image_map.json'))
    print(f"  ✅ {len(locr_map['cards'])} 张卡")

    # ===== 汇总 =====
    print(f"\n{'=' * 60}")
    print("📊 重建汇总")
    print("=" * 60)
    print(f"  loch_image_map.json: {len(loch_map['cards'])} 张卡")
    print(f"  blzd_image_map.json: {len(blzd_map['cards'])} 张卡")
    print(f"  blzds_image_map.json: {len(blzds_map['cards'])} 张卡")
    print(f"  losp_vol1_image_map.json: {len(losp_vol1_map['cards'])} 张卡")
    print(f"  losp_vol2_image_map.json: {len(losp_vol2_map['cards'])} 张卡")
    print(f"  locr_image_map.json: {len(locr_map['cards'])} 张卡")
    print(f"\n✅ 全部完成")


if __name__ == '__main__':
    main()
