#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一次性迁移脚本：价格文件 key 从 password 改为 setNumber + LOSP 拆分

功能：
1. 读取现有 3 个价格文件（loch、locr、blzd）
2. 将 cards 对象的 key 从 password 转为 setNumber
3. 从 loch_prices.json 中拆出 LOSP-JP001~010 → losp_vol1_prices.json
4. 从 locr_prices.json 中拆出 LOSP-JP011~020 → losp_vol2_prices.json
5. 移除各 card 条目中冗余的 setNumber 字段（key 本身就是 setNumber）
6. 移除母包文件中的 LOSP packPrices
7. 打印迁移报告

用法：
    python tools/migrate_price_keys.py
"""

import json
import os
import sys


def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data, filepath):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def migrate_cards(cards_dict):
    """将 cards 字典的 key 从 password 改为 setNumber，并移除冗余的 setNumber 字段"""
    new_cards = {}
    for password, card_info in cards_dict.items():
        set_number = card_info.get('setNumber', '')
        if not set_number:
            print(f"  ⚠️ 跳过无 setNumber 的条目: password={password}")
            continue
        # 构建新条目（不含 setNumber 字段）
        new_entry = {}
        for key, value in card_info.items():
            if key != 'setNumber':
                new_entry[key] = value
        new_cards[set_number] = new_entry
    return new_cards


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    prices_dir = os.path.join(base_dir, 'data', 'ocg', 'prices')

    print("=" * 60)
    print("价格文件 key 迁移：password → setNumber + LOSP 拆分")
    print("=" * 60)

    # ===== 加载现有文件 =====
    loch_path = os.path.join(prices_dir, 'loch_prices.json')
    locr_path = os.path.join(prices_dir, 'locr_prices.json')
    blzd_path = os.path.join(prices_dir, 'blzd_prices.json')

    loch_data = load_json(loch_path)
    locr_data = load_json(locr_path)
    blzd_data = load_json(blzd_path)

    # 统计迁移前数量
    loch_before = len(loch_data.get('cards', {}))
    locr_before = len(locr_data.get('cards', {}))
    blzd_before = len(blzd_data.get('cards', {}))
    total_before = loch_before + locr_before + blzd_before

    print(f"\n📊 迁移前统计:")
    print(f"  loch_prices.json: {loch_before} 张卡")
    print(f"  locr_prices.json: {locr_before} 张卡")
    print(f"  blzd_prices.json: {blzd_before} 张卡")
    print(f"  总计: {total_before} 张卡")

    # ===== 迁移 LOCH：转换 key + 拆出 LOSP vol1 =====
    print(f"\n🔄 处理 LOCH + LOSP vol1...")

    loch_cards_new = {}
    losp_vol1_cards = {}

    for password, card_info in loch_data['cards'].items():
        set_number = card_info.get('setNumber', '')
        # 构建新条目（不含 setNumber）
        new_entry = {k: v for k, v in card_info.items() if k != 'setNumber'}

        if set_number.startswith('LOSP-'):
            losp_vol1_cards[set_number] = new_entry
            print(f"  → LOSP vol1: {set_number} ({card_info.get('name', '')})")
        else:
            loch_cards_new[set_number] = new_entry

    # 更新 LOCH 数据
    loch_data['cards'] = loch_cards_new
    loch_data['_说明'] = 'LOCH 卡包市场价格数据（集换社）'
    # 移除 LOSP 相关元数据
    loch_data.pop('_特殊说明_LOSP', None)
    # 移除 LOSP-vol1 packPrices
    losp_vol1_pack_price = loch_data['packPrices'].pop('LOSP-vol1', None)

    # ===== 迁移 LOCR：转换 key + 拆出 LOSP vol2 =====
    print(f"\n🔄 处理 LOCR + LOSP vol2...")

    locr_cards_new = {}
    losp_vol2_cards = {}

    for password, card_info in locr_data['cards'].items():
        set_number = card_info.get('setNumber', '')
        new_entry = {k: v for k, v in card_info.items() if k != 'setNumber'}

        if set_number.startswith('LOSP-'):
            losp_vol2_cards[set_number] = new_entry
            print(f"  → LOSP vol2: {set_number} ({card_info.get('name', '')})")
        else:
            locr_cards_new[set_number] = new_entry

    # 更新 LOCR 数据
    locr_data['cards'] = locr_cards_new
    locr_data['_说明'] = 'LOCR 卡包市场价格数据（集换社）'
    locr_data.pop('_特殊说明_LOSP', None)
    losp_vol2_pack_price = locr_data['packPrices'].pop('LOSP-vol2', None)

    # ===== 迁移 BLZD：仅转换 key =====
    print(f"\n🔄 处理 BLZD...")
    blzd_data['cards'] = migrate_cards(blzd_data['cards'])

    # ===== 构建 LOSP vol1 独立文件 =====
    losp_vol1_data = {
        '_说明': 'LOSP vol1 特殊+1包市场价格数据（集换社）',
        '_单位': '人民币/元',
        '_数据来源': '集换社App截图 OCR 识别',
        '_更新时间': loch_data.get('_更新时间', ''),
        '_价格说明': '所有价格为集换社\'起\'价（最低在售价）',
        '_归属': 'LOSP vol1（JP001-010）属于 LOCH，购买3盒赠送1包',
        'packPrices': {
            'LOSP-vol1': losp_vol1_pack_price or {'pack': 0}
        },
        'cards': losp_vol1_cards
    }

    # ===== 构建 LOSP vol2 独立文件 =====
    losp_vol2_data = {
        '_说明': 'LOSP vol2 特殊+1包市场价格数据（集换社）',
        '_单位': '人民币/元',
        '_数据来源': '集换社App截图 OCR 识别',
        '_更新时间': locr_data.get('_更新时间', ''),
        '_价格说明': '所有价格为集换社\'起\'价（最低在售价）',
        '_归属': 'LOSP vol2（JP011-020）属于 LOCR，购买3盒赠送1包',
        'packPrices': {
            'LOSP-vol2': losp_vol2_pack_price or {'pack': 0}
        },
        'cards': losp_vol2_cards
    }

    # ===== 保存所有文件 =====
    print(f"\n💾 保存文件...")

    save_json(loch_data, loch_path)
    print(f"  ✅ {loch_path}")

    save_json(locr_data, locr_path)
    print(f"  ✅ {locr_path}")

    save_json(blzd_data, blzd_path)
    print(f"  ✅ {blzd_path}")

    losp_vol1_path = os.path.join(prices_dir, 'losp_vol1_prices.json')
    save_json(losp_vol1_data, losp_vol1_path)
    print(f"  ✅ {losp_vol1_path} (新建)")

    losp_vol2_path = os.path.join(prices_dir, 'losp_vol2_prices.json')
    save_json(losp_vol2_data, losp_vol2_path)
    print(f"  ✅ {losp_vol2_path} (新建)")

    # ===== 迁移报告 =====
    loch_after = len(loch_data['cards'])
    locr_after = len(locr_data['cards'])
    blzd_after = len(blzd_data['cards'])
    vol1_count = len(losp_vol1_cards)
    vol2_count = len(losp_vol2_cards)
    total_after = loch_after + locr_after + blzd_after + vol1_count + vol2_count

    print(f"\n{'=' * 60}")
    print(f"📊 迁移报告")
    print(f"{'=' * 60}")
    print(f"  loch_prices.json: {loch_before} → {loch_after} 张卡（拆出 {vol1_count} 张 LOSP vol1）")
    print(f"  locr_prices.json: {locr_before} → {locr_after} 张卡（拆出 {vol2_count} 张 LOSP vol2）")
    print(f"  blzd_prices.json: {blzd_before} → {blzd_after} 张卡")
    print(f"  losp_vol1_prices.json: {vol1_count} 张卡 (新建)")
    print(f"  losp_vol2_prices.json: {vol2_count} 张卡 (新建)")
    print(f"\n  总计: {total_before} → {total_after} 张卡", end='')
    if total_before == total_after:
        print(" ✅ 数量一致")
    else:
        print(f" ❌ 数量不一致！差 {total_after - total_before}")
        sys.exit(1)

    # 验证所有 key 都是 setNumber 格式
    print(f"\n🔍 验证 key 格式...")
    all_ok = True
    for name, cards in [('loch', loch_data['cards']), ('locr', locr_data['cards']),
                         ('blzd', blzd_data['cards']), ('losp_vol1', losp_vol1_cards),
                         ('losp_vol2', losp_vol2_cards)]:
        for key in cards:
            if '-JP' not in key:
                print(f"  ❌ {name}: key '{key}' 不是 setNumber 格式")
                all_ok = False
    if all_ok:
        print("  ✅ 所有 key 均为 setNumber 格式")

    print(f"\n✅ 迁移完成！")


if __name__ == '__main__':
    main()
