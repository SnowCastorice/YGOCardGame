#!/usr/bin/env python3
"""
check_missing_images.py — 检查 LOCR 卡包中缺失卡图的卡片
统计每张卡片的每个稀有度版本是否有对应卡图（精确匹配和 fallback 匹配）
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

IMAGE_MAP_FILE = os.path.join(PROJECT_ROOT, "data", "ocg", "locr_image_map.json")
CARD_DATA_FILE = os.path.join(PROJECT_ROOT, "data", "ocg", "cards", "ocg_locr.json")

# 稀有度 fallback 链
RARITY_FALLBACK_NORMAL = ['PSER', 'SER', 'CR', 'UTR', 'UR', 'SR', 'R', 'NR', 'N']
RARITY_FALLBACK_OF = ['GMR-OF', 'PSER-OF', 'UR-OF']

def is_of(r):
    return r and r.endswith('-OF')

def can_fallback(local_images, rarity):
    if not local_images:
        return False
    if rarity in local_images:
        return True
    chain = RARITY_FALLBACK_OF if is_of(rarity) else RARITY_FALLBACK_NORMAL
    idx = chain.index(rarity) if rarity in chain else -1
    start = idx + 1 if idx >= 0 else 0
    for i in range(start, len(chain)):
        if chain[i] in local_images:
            return True
    return False

def main():
    with open(IMAGE_MAP_FILE, "r", encoding="utf-8") as f:
        image_map = json.load(f)["cards"]

    with open(CARD_DATA_FILE, "r", encoding="utf-8") as f:
        card_data = json.load(f)

    all_cards = []

    # 主卡池
    for card_def in card_data.get("cardIds", []):
        card_id = str(card_def.get("id", ""))
        sn = card_def.get("setNumber", "")
        name = ""
        if card_def.get("cardData"):
            name = card_def["cardData"].get("cn_name", "") or card_def.get("name_hint", "")
        else:
            name = card_def.get("name_hint", "")
        rarities = card_def.get("rarityVersions", [])
        all_cards.append({"id": card_id, "setNumber": sn, "name": name, "rarities": rarities, "source": "主卡池"})

    # 辅助包
    supp = card_data.get("supplementPack", {})
    for card_def in supp.get("cards", []):
        card_id = str(card_def.get("id", ""))
        sn = card_def.get("setNumber", "")
        name = ""
        if card_def.get("cardData"):
            name = card_def["cardData"].get("cn_name", "") or card_def.get("name_hint", "")
        else:
            name = card_def.get("name_hint", "")
        rarities = card_def.get("rarityVersions", [])
        all_cards.append({"id": card_id, "setNumber": sn, "name": name, "rarities": rarities, "source": "辅助包(LOSP)"})

    lines = []
    lines.append("=" * 80)
    lines.append("LOCR 卡图缺失统计报告")
    lines.append("=" * 80)

    total_versions = sum(len(c["rarities"]) for c in all_cards)
    lines.append(f"总卡片数: {len(all_cards)}")
    lines.append(f"总稀有度版本数: {total_versions}")
    lines.append("")

    no_images_at_all = []
    compat_missing = []
    strict_missing_fallback = []

    for card in all_cards:
        card_id = card["id"]
        entry = image_map.get(card_id, {})
        local_images = entry.get("localImages", {})

        if not local_images:
            for rc in card["rarities"]:
                no_images_at_all.append({
                    "setNumber": card["setNumber"], "name": card["name"],
                    "rarity": rc, "source": card["source"]
                })
            continue

        for rc in card["rarities"]:
            has_exact = rc in local_images
            has_fallback = can_fallback(local_images, rc)

            if not has_fallback:
                compat_missing.append({
                    "setNumber": card["setNumber"], "name": card["name"],
                    "rarity": rc, "source": card["source"],
                    "available": list(local_images.keys())
                })
            elif not has_exact:
                strict_missing_fallback.append({
                    "setNumber": card["setNumber"], "name": card["name"],
                    "rarity": rc, "source": card["source"],
                    "available": list(local_images.keys())
                })

    lines.append("=" * 80)
    lines.append("🔴 兼容模式下缺图（玩家会看到 NOW PRINTING）")
    lines.append("=" * 80)

    if no_images_at_all:
        lines.append("")
        lines.append("【完全没有任何卡图的卡片】")
        for m in no_images_at_all:
            lines.append(f"  {m['setNumber']:<15s} {m['rarity']:<10s} {m['name']:<20s} [{m['source']}]")

    if compat_missing:
        lines.append("")
        lines.append("【有部分卡图但该稀有度无法 fallback 的】")
        for m in compat_missing:
            lines.append(f"  {m['setNumber']:<15s} {m['rarity']:<10s} {m['name']:<20s} [{m['source']}] 现有: {m['available']}")

    if not no_images_at_all and not compat_missing:
        lines.append("  ✅ 无！所有卡片在兼容模式下都能找到卡图")

    lines.append("")
    lines.append("=" * 80)
    lines.append("🟡 严格模式下缺图（仅开发者调试可见，兼容模式下可 fallback）")
    lines.append("=" * 80)

    if strict_missing_fallback:
        for m in strict_missing_fallback:
            lines.append(f"  {m['setNumber']:<15s} {m['rarity']:<10s} {m['name']:<20s} [{m['source']}] 现有: {m['available']}")
    else:
        lines.append("  ✅ 无！所有稀有度版本都有精确匹配的卡图")

    lines.append("")
    lines.append(f"总计: 兼容模式缺图 {len(no_images_at_all) + len(compat_missing)} 个版本, 严格模式额外缺图 {len(strict_missing_fallback)} 个版本")

    report = "\n".join(lines)
    
    output_file = os.path.join(PROJECT_ROOT, "local", "missing_images_report.txt")
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"报告已生成: {output_file}")

if __name__ == "__main__":
    main()
