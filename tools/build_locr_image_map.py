#!/usr/bin/env python3
"""
build_locr_image_map.py — LOCR 卡图映射表生成脚本

从 data/ocg/images/locr/ 目录扫描所有卡图文件名，
结合 data/ocg/cards/ocg_locr.json 中的卡片密码和卡编号信息，
自动生成 data/ocg/locr_image_map.json 映射表。

映射表格式（新格式，支持按 setNumber + 稀有度 查找本地文件名）：
{
  "cards": {
    "100257001": {
      "setNumber": "LOCR-JP001",
      "name": "白色幻兽-青眼白龙",
      "localImages": {
        "UR": "LOCR-JP001_UR_official_render_art.webp",
        "UR-OF": "LOCR-JP001_UR-OF_twitter_photo_art.webp",
        ...
      }
    }
  }
}

卡图来源优先级（同一稀有度有多张来源不同的图时，选最优的一张）：
  twitter_photo > twitter_render > ygojp > official > ygometa

用法：
  python tools/build_locr_image_map.py           # 生成映射表
  python tools/build_locr_image_map.py --dry-run  # 预览模式，不写入文件
  python tools/build_locr_image_map.py --stats     # 显示详细统计
"""

import json
import os
import re
import sys
from collections import defaultdict

# === 路径配置 ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
IMAGES_DIR = os.path.join(PROJECT_ROOT, "data", "ocg", "images", "locr")
CARD_DATA_FILE = os.path.join(PROJECT_ROOT, "data", "ocg", "cards", "ocg_locr.json")
OUTPUT_FILE = os.path.join(PROJECT_ROOT, "data", "ocg", "locr_image_map.json")

# === 卡图来源优先级（数字越大越优先） ===
# 来源 + 类型组合的优先级（twitter + photo_art 最高）
SOURCE_TYPE_PRIORITY = {
    ("twitter", "photo_art"): 5,
    ("twitter", "render_art"): 4,
    ("tcgcorner", "photo_art"): 3.5,
    ("ygojp", "render_art"): 3,
    ("ygojp", "photo_art"): 3,
    ("official", "render_art"): 2,
    ("official", "photo_art"): 2,
    ("ygometa", "render_art"): 1,
    ("ygometa", "photo_art"): 1,
}

# === 文件名解析正则 ===
# 格式: {卡编号}_{稀有度}_{来源}_{类型}.webp
# 例如: LOCR-JP001_UR-OF_twitter_photo_art.webp
#       LOCR-JP001_UR_official_render_art.webp
# 有些文件名末尾有 _0 _1 等序号后缀
FILENAME_PATTERN = re.compile(
    r"^((?:LOCR|LOSP)-JP\d{3})_"      # 卡编号 (LOCR-JP001 或 LOSP-JP011)
    r"([A-Z][A-Z0-9]*(?:-[A-Z]+)?)_"  # 稀有度 (UR, UR-OF, PSER-OF, GMR, GMR-OF 等)
    r"(twitter|ygojp|ygometa|official|tcgcorner)_"  # 来源
    r"(render_art|photo_art)"          # 类型
    r"(?:_\d+)?"                       # 可选序号后缀 (_0, _1)
    r"\.webp$"                         # 扩展名
)


def parse_filename(filename):
    """解析卡图文件名，返回 (卡编号, 稀有度, 来源, 类型) 或 None"""
    m = FILENAME_PATTERN.match(filename)
    if not m:
        return None
    set_number = m.group(1)
    rarity = m.group(2)
    source = m.group(3)
    art_type = m.group(4)
    return set_number, rarity, source, art_type


def load_card_data():
    """加载 ocg_locr.json，返回 setNumber → (id, name_hint) 映射"""
    with open(CARD_DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    mapping = {}

    # 主卡池
    for card_def in data.get("cardIds", []):
        sn = card_def.get("setNumber", "")
        card_id = card_def.get("id")
        name = card_def.get("name_hint", "")
        cn_name = ""
        if card_def.get("cardData"):
            cn_name = card_def["cardData"].get("cn_name", "")
        mapping[sn] = {
            "id": str(card_id),
            "name": cn_name or name,
            "rarityVersions": card_def.get("rarityVersions", []),
        }

    # 辅助包
    supp = data.get("supplementPack", {})
    for card_def in supp.get("cards", []):
        sn = card_def.get("setNumber", "")
        card_id = card_def.get("id")
        name = card_def.get("name_hint", "")
        cn_name = ""
        if card_def.get("cardData"):
            cn_name = card_def["cardData"].get("cn_name", "")
        mapping[sn] = {
            "id": str(card_id),
            "name": cn_name or name,
            "rarityVersions": card_def.get("rarityVersions", []),
        }

    return mapping


def scan_images():
    """扫描 locr 图片目录，返回 {卡编号: {稀有度: [(来源优先级, 文件名), ...]}} """
    result = defaultdict(lambda: defaultdict(list))
    unrecognized = []

    if not os.path.isdir(IMAGES_DIR):
        print(f"❌ 图片目录不存在: {IMAGES_DIR}")
        sys.exit(1)

    for filename in sorted(os.listdir(IMAGES_DIR)):
        if not filename.endswith(".webp"):
            continue
        parsed = parse_filename(filename)
        if parsed is None:
            unrecognized.append(filename)
            continue

        set_number, rarity, source, art_type = parsed
        priority = SOURCE_TYPE_PRIORITY.get((source, art_type), 0)
        result[set_number][rarity].append((priority, filename))

    return result, unrecognized


def build_image_map(card_data, image_data, show_stats=False):
    """构建映射表，每个稀有度选择优先级最高的卡图"""
    cards = {}
    stats = {
        "total_cards": 0,
        "cards_with_images": 0,
        "total_images_mapped": 0,
        "rarities_covered": defaultdict(int),
        "sources_used": defaultdict(int),
        "missing_cards": [],
    }

    # 遍历所有卡片
    for set_number, card_info in sorted(card_data.items()):
        card_id = card_info["id"]
        name = card_info["name"]
        stats["total_cards"] += 1

        local_images = {}

        if set_number in image_data:
            for rarity, file_list in sorted(image_data[set_number].items()):
                # 按优先级降序排序，取最高优先级的文件
                file_list.sort(key=lambda x: x[0], reverse=True)
                best_priority, best_file = file_list[0]
                local_images[rarity] = best_file
                stats["total_images_mapped"] += 1
                stats["rarities_covered"][rarity] += 1

                # 统计来源
                parsed = parse_filename(best_file)
                if parsed:
                    stats["sources_used"][f"{parsed[2]}+{parsed[3]}"] += 1

        if local_images:
            stats["cards_with_images"] += 1
        else:
            stats["missing_cards"].append(f"{set_number} ({name})")

        cards[card_id] = {
            "setNumber": set_number,
            "name": name,
            "localImages": local_images,
        }

    if show_stats:
        print("\n📊 映射统计：")
        print(f"  总卡片数: {stats['total_cards']}")
        print(f"  有卡图的卡片: {stats['cards_with_images']}")
        print(f"  总映射条目: {stats['total_images_mapped']}")
        print(f"\n  各稀有度覆盖：")
        for rarity, count in sorted(stats["rarities_covered"].items()):
            print(f"    {rarity}: {count} 张")
        print(f"\n  各来源使用：")
        for source, count in sorted(stats["sources_used"].items(), key=lambda x: -x[1]):
            print(f"    {source}: {count} 次")
        if stats["missing_cards"]:
            print(f"\n  ⚠️ 无卡图的卡片 ({len(stats['missing_cards'])} 张)：")
            for name in stats["missing_cards"]:
                print(f"    - {name}")

    return cards, stats


def main():
    dry_run = "--dry-run" in sys.argv
    show_stats = "--stats" in sys.argv or dry_run

    print("🔧 LOCR 卡图映射表生成工具")
    print(f"  卡片数据: {CARD_DATA_FILE}")
    print(f"  图片目录: {IMAGES_DIR}")
    print(f"  输出文件: {OUTPUT_FILE}")
    print(f"  来源优先级: twitter+photo > twitter+render > tcgcorner+photo > ygojp > official > ygometa")
    print()

    # 1. 加载卡片数据
    card_data = load_card_data()
    print(f"📦 已加载 {len(card_data)} 张卡片数据")

    # 2. 扫描图片
    image_data, unrecognized = scan_images()
    total_files = sum(len(files) for rarities in image_data.values() for files in rarities.values())
    print(f"🖼️ 已扫描 {total_files} 张可识别卡图，覆盖 {len(image_data)} 个卡编号")
    if unrecognized:
        print(f"  ⚠️ {len(unrecognized)} 个文件无法识别：")
        for f in unrecognized[:5]:
            print(f"    - {f}")
        if len(unrecognized) > 5:
            print(f"    ... 还有 {len(unrecognized) - 5} 个")

    # 3. 构建映射表
    cards, stats = build_image_map(card_data, image_data, show_stats=show_stats)

    # 4. 输出
    output = {
        "_说明": "LOCR 卡图映射表 — 卡片密码(password) -> 本地卡图文件名（按稀有度）",
        "_格式": "localImages 中每个稀有度对应一个本地 webp 文件名",
        "_来源优先级": "twitter_photo > twitter_render > tcgcorner_photo > ygojp > official > ygometa",
        "_生成方式": "由 tools/build_locr_image_map.py 自动生成",
        "cards": cards,
    }

    if dry_run:
        print("\n🔍 预览模式，不写入文件")
        # 输出前几条预览
        preview_count = 0
        for card_id, info in cards.items():
            if info["localImages"]:
                print(f"\n  {card_id} ({info['setNumber']} {info['name']}):")
                for rarity, filename in info["localImages"].items():
                    print(f"    {rarity}: {filename}")
                preview_count += 1
                if preview_count >= 3:
                    print(f"\n  ... 共 {len(cards)} 张卡片")
                    break
    else:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 已生成映射表: {OUTPUT_FILE}")
        print(f"  共 {len(cards)} 张卡片，{stats['total_images_mapped']} 条映射")


if __name__ == "__main__":
    main()
