#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
最终整合：将OCR价格解析结果合并到价格JSON文件中（v6版本）

流程：
1. 读取 parse_ocr_prices.py 输出的 parsed_prices_v6.json（OCR识别结果）
2. 读取已有的 loch_prices.json 和 blzd_prices.json
3. 读取 price_overrides.json（人工确认的价格覆盖配置）
4. 智能合并（串扰检测、异常过滤、变化幅度校验）
   - LOCH + LOSP 增量更新（自动识别 LOSP 编号前缀从对应数据源取价格）
   - BLZD 增量更新（对比旧价格，保留OCR未覆盖的稀有度）
   - 被异常规则拦截的价格，如果在 price_overrides.json 中有人工确认条目，则强制采用
5. 从OCR数据的 pack_prices 字段自动更新卡包/卡盒价格（LOCH盒/包、LOSP包、BLZD盒/包）
6. 输出价格对照表 CSV（包含旧价格、OCR价格、采用价格、备注）
7. 输出异常告警精简列表 price_alerts.csv（仅含需人工确认项）
8. 保存更新后的价格文件
9. 清理已消费的覆盖条目并保存 price_overrides.json
"""

import json
import os
import sys
import csv
import argparse
from datetime import datetime

# 特殊标记：价格未收录
PRICE_NOT_LISTED = "未收录"


def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(data, filepath):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_price_from_entry(entry):
    """从OCR条目中提取采用价格（GMR-OF采用亚洲版）"""
    if isinstance(entry, dict):
        # GMR-OF 优先使用亚洲版
        if 'gmr_asia' in entry:
            asia = entry.get('gmr_asia')
            if asia is not None:
                return asia
        return entry.get('price')
    return entry


def main(date_str=None):
    """主函数，date_str 为日期字符串（如 '20260309'），不传则使用当前日期"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # 日期处理：优先使用传入参数，其次命令行参数，最后使用当前日期
    if date_str is None:
        parser = argparse.ArgumentParser(description='合并OCR价格到价格JSON')
        parser.add_argument('--date', help='更新日期 (YYYYMMDD格式，如 20260309)')
        args, _ = parser.parse_known_args()
        date_str = args.date
    
    if date_str:
        date_display = f'{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}'
    else:
        date_display = datetime.now().strftime('%Y-%m-%d')

    # 加载OCR解析结果（v6格式 - 单卡裁切版）
    ocr_path = os.path.join(base_dir, 'test_output', 'parsed_prices_v6.json')
    if not os.path.exists(ocr_path):
        print(f"❌ 找不到OCR解析结果: {ocr_path}")
        print("   请先运行 extract_prices.py")
        sys.exit(1)

    ocr_data = load_json(ocr_path)
    loch_ocr = ocr_data['loch']
    losp_ocr = ocr_data.get('losp', {})
    blzd_ocr = ocr_data['blzd']

    # 加载已有价格文件
    loch_prices = load_json(os.path.join(base_dir, 'data', 'ocg', 'prices', 'loch_prices.json'))
    blzd_prices = load_json(os.path.join(base_dir, 'data', 'ocg', 'prices', 'blzd_prices.json'))

    # 加载人工确认的价格覆盖配置
    overrides_path = os.path.join(base_dir, 'data', 'ocg', 'prices', 'price_overrides.json')
    if os.path.exists(overrides_path):
        overrides_data = load_json(overrides_path)
    else:
        overrides_data = {'overrides': {}}
    price_overrides = overrides_data.get('overrides', {})
    consumed_overrides = []  # 记录本次消费的覆盖条目key
    if price_overrides:
        print(f"\n📋 已加载 {len(price_overrides)} 条人工确认覆盖配置")

    # 加载BLZD卡片数据（用于建立卡片条目）
    blzd_cards_data = load_json(os.path.join(base_dir, 'data', 'ocg', 'cards', 'ocg_blzd.json'))

    # 建立 setNumber -> id+name 映射（BLZD）
    blzd_card_map = {}
    for card in blzd_cards_data.get('cardIds', []):
        set_num = card.get('setNumber', '')
        if set_num:
            blzd_card_map[set_num] = {
                'password': str(card.get('id', '')),
                'name': card.get('name_hint', '') or card.get('cardData', {}).get('cn_name', ''),
                'rarityVersions': card.get('rarityVersions', []),
            }
    sp = blzd_cards_data.get('supplementPack', {})
    for card in sp.get('cards', []):
        set_num = card.get('setNumber', '')
        if set_num:
            blzd_card_map[set_num] = {
                'password': str(card.get('id', '')),
                'name': card.get('name_hint', '') or card.get('cardData', {}).get('cn_name', ''),
                'rarityVersions': card.get('rarityVersions', []),
            }
    print(f"BLZD 卡片映射: 正包 {len(blzd_cards_data.get('cardIds', []))} 张 + 辅助包 {len(sp.get('cards', []))} 张")

    # ===== 准备CSV对照表 =====
    csv_rows = []
    csv_rows.append(['卡包', '编号', '卡名', '稀有度', '旧价格', 'OCR价格', 'GMR亚洲版', 'GMR日本版', '采用价格', '备注'])

    # =====================
    # 更新 LOCH + LOSP 价格
    # =====================
    print("=" * 80)
    print("LOCH + LOSP 价格更新")
    print("=" * 80)

    loch_changes = 0
    loch_not_listed = 0

    for card_key, card_info in loch_prices['cards'].items():
        set_number = card_info['setNumber']
        card_name = card_info['name']
        old_prices = card_info.get('prices', {})

        # 从OCR结果中查找（根据编号前缀自动选择 LOCH 或 LOSP 数据源）
        if set_number.startswith('LOSP-'):
            ocr_card = losp_ocr.get(set_number, {})
            csv_pack_label = 'LOSP'
        else:
            ocr_card = loch_ocr.get(set_number, {})
            csv_pack_label = 'LOCH'

        # 智能合并
        new_prices = {}
        for rarity, old_p in old_prices.items():
            ocr_entry = ocr_card.get(rarity)
            ocr_p = get_price_from_entry(ocr_entry) if ocr_entry else None

            # GMR-OF 双版本信息
            gmr_asia_str = ''
            gmr_japan_str = ''
            if rarity == 'GMR-OF' and isinstance(ocr_entry, dict):
                asia = ocr_entry.get('gmr_asia')
                japan = ocr_entry.get('gmr_japan')
                gmr_asia_str = f'¥{asia}' if asia is not None and asia != PRICE_NOT_LISTED else ('--' if asia == PRICE_NOT_LISTED else '')
                gmr_japan_str = f'¥{japan}' if japan is not None and japan != PRICE_NOT_LISTED else ('--' if japan == PRICE_NOT_LISTED else '')

            note = ''
            is_suspect = False

            if ocr_p is not None:
                # 处理"未收录"
                if ocr_p == PRICE_NOT_LISTED:
                    new_prices[rarity] = old_p  # 保留旧值
                    note = '⚠️ 集换社未收录(--)'
                    loch_not_listed += 1
                    csv_rows.append([csv_pack_label, set_number, card_name, rarity,
                                    f'¥{old_p}', '--', gmr_asia_str, gmr_japan_str, f'¥{old_p}', note])
                    continue

                # === 串扰检测规则 ===

                # 规则1: GMR-OF 不应该低于 1000
                if rarity == 'GMR-OF' and ocr_p < 1000:
                    is_suspect = True
                    note = '⚠️ GMR-OF<1000，保留旧值'

                # 规则2: 普通 UR/SR/R/N 不应超过 100
                elif rarity in ('UR', 'SR', 'R', 'N') and ocr_p > 100:
                    is_suspect = True
                    note = '⚠️ 基础稀有度>100，保留旧值'

                # 规则3: SER/PSER 串扰检测
                elif rarity == 'SER' and ocr_p > 20:
                    pser_of_entry = ocr_card.get('PSER-OF')
                    pser_of_p = get_price_from_entry(pser_of_entry) if pser_of_entry else None
                    if pser_of_p and pser_of_p != PRICE_NOT_LISTED and abs(ocr_p - pser_of_p) < 1:
                        is_suspect = True
                        note = '⚠️ SER≈PSER-OF，疑似串扰'

                # 规则4: SER 突然变得比 PSER 还贵
                elif rarity == 'SER':
                    pser_entry = ocr_card.get('PSER') or ocr_card.get('PSER-OF')
                    pser_p = get_price_from_entry(pser_entry) if pser_entry else None
                    if pser_p and pser_p != PRICE_NOT_LISTED and ocr_p > pser_p * 0.8 and ocr_p > 10:
                        is_suspect = True
                        note = '⚠️ SER≥PSER，疑似串扰'

                # 规则5: N 出现在不该有 N 的卡上
                elif rarity == 'N':
                    is_suspect = True
                    note = '⚠️ LOCH无N稀有度'

                # 规则6: 价格变化超过10倍
                elif old_p > 2 and ocr_p > 0 and (ocr_p / old_p > 10 or old_p / ocr_p > 10):
                    is_suspect = True
                    note = f'⚠️ 变化>10x ({old_p}→{ocr_p})'

                # 检查人工确认覆盖
                override_key = f'{set_number}:{rarity}'
                if is_suspect and override_key in price_overrides:
                    override_info = price_overrides[override_key]
                    override_price = override_info.get('price', ocr_p)
                    override_reason = override_info.get('reason', '人工确认')
                    new_prices[rarity] = override_price
                    note = f'✅ 人工确认覆盖 ({override_reason})'
                    loch_changes += 1
                    consumed_overrides.append(override_key)
                    csv_rows.append([csv_pack_label, set_number, card_name, rarity,
                                    f'¥{old_p}', f'¥{ocr_p}', gmr_asia_str, gmr_japan_str, f'¥{override_price}', note])
                    continue

                if is_suspect:
                    new_prices[rarity] = old_p  # 保留旧值
                else:
                    new_prices[rarity] = ocr_p
                    if ocr_p != old_p:
                        note = '✅ 更新'
                        loch_changes += 1
            else:
                new_prices[rarity] = old_p
                note = '—（OCR未识别）'

            adopted = new_prices[rarity]
            ocr_str = f'¥{ocr_p}' if ocr_p is not None and ocr_p != PRICE_NOT_LISTED else ('--' if ocr_p == PRICE_NOT_LISTED else '-')
            csv_rows.append([csv_pack_label, set_number, card_name, rarity,
                            f'¥{old_p}', ocr_str, gmr_asia_str, gmr_japan_str, f'¥{adopted}', note])

        card_info['prices'] = new_prices

    # 更新时间
    loch_prices['_更新时间'] = date_display

    print(f"  LOCH 价格变更: {loch_changes} 项, 未收录: {loch_not_listed} 项")

    # =====================
    # 更新 BLZD 价格（增量更新模式）
    # =====================
    print(f"\n{'=' * 80}")
    print("BLZD 价格更新（增量）")
    print("=" * 80)

    # 建立旧价格映射：setNumber -> {rarity: price}
    blzd_old_by_set = {}  # setNumber -> old card info
    for card_key, card_info in blzd_prices.get('cards', {}).items():
        sn = card_info.get('setNumber', '')
        if sn:
            blzd_old_by_set[sn] = {
                'password': card_key,
                'name': card_info.get('name', ''),
                'prices': card_info.get('prices', {}),
            }

    blzd_cards = {}
    blzd_changes = 0
    blzd_not_listed = 0
    blzd_new_count = 0

    for set_number in sorted(blzd_ocr.keys()):
        ocr_card = blzd_ocr[set_number]
        card_mapping = blzd_card_map.get(set_number)

        if not card_mapping:
            print(f"  ⚠️ {set_number}: 在卡片数据中未找到")
            continue

        password = card_mapping['password']
        card_name = card_mapping['name']
        valid_rarities = card_mapping['rarityVersions']

        # 获取旧价格（如果有）
        old_card = blzd_old_by_set.get(set_number, {})
        old_prices = old_card.get('prices', {})

        # 过滤：只保留卡片数据中定义的稀有度版本
        filtered_prices = {}
        for rarity, entry in ocr_card.items():
            price = get_price_from_entry(entry)
            old_p = old_prices.get(rarity)
            old_p_str = f'¥{old_p}' if old_p is not None else '-'

            # 处理"未收录"
            if price == PRICE_NOT_LISTED:
                blzd_not_listed += 1
                # 保留旧值（如果有）
                if old_p is not None:
                    filtered_prices[rarity] = old_p
                csv_rows.append(['BLZD', set_number, card_name, rarity,
                                old_p_str, '--', '', '', old_p_str if old_p is not None else '-', '⚠️ 集换社未收录(--), 保留旧值' if old_p is not None else '⚠️ 集换社未收录(--), 跳过'])
                continue

            note = ''
            is_suspect = False
            target_rarity = rarity  # 可能被转换（N→NR, R→NR）

            if rarity in valid_rarities:
                # 过滤异常值（均支持人工覆盖）
                override_key = f'{set_number}:{rarity}'

                if rarity in ('N', 'R') and price > 5:
                    if override_key in price_overrides:
                        ov = price_overrides[override_key]
                        filtered_prices[rarity] = ov.get('price', price)
                        consumed_overrides.append(override_key)
                        blzd_changes += 1
                        csv_rows.append(['BLZD', set_number, card_name, rarity,
                                        old_p_str, f'¥{price}', '', '', f'¥{ov.get("price", price)}', f'✅ 人工确认覆盖 ({ov.get("reason", "人工确认")})'])
                    else:
                        if old_p is not None:
                            filtered_prices[rarity] = old_p
                        csv_rows.append(['BLZD', set_number, card_name, rarity,
                                        old_p_str, f'¥{price}', '', '', old_p_str if old_p is not None else '-', '⚠️ N/R>5, 异常保留旧值' if old_p else '⚠️ N/R>5, 异常跳过'])
                    continue
                if rarity in ('SR',) and price > 50:
                    if override_key in price_overrides:
                        ov = price_overrides[override_key]
                        filtered_prices[rarity] = ov.get('price', price)
                        consumed_overrides.append(override_key)
                        blzd_changes += 1
                        csv_rows.append(['BLZD', set_number, card_name, rarity,
                                        old_p_str, f'¥{price}', '', '', f'¥{ov.get("price", price)}', f'✅ 人工确认覆盖 ({ov.get("reason", "人工确认")})'])
                    else:
                        if old_p is not None:
                            filtered_prices[rarity] = old_p
                        csv_rows.append(['BLZD', set_number, card_name, rarity,
                                        old_p_str, f'¥{price}', '', '', old_p_str if old_p is not None else '-', '⚠️ SR>50, 异常保留旧值' if old_p else '⚠️ SR>50, 异常跳过'])
                    continue
                if rarity == 'PSER' and price < 1:
                    if override_key in price_overrides:
                        ov = price_overrides[override_key]
                        filtered_prices[rarity] = ov.get('price', price)
                        consumed_overrides.append(override_key)
                        blzd_changes += 1
                        csv_rows.append(['BLZD', set_number, card_name, rarity,
                                        old_p_str, f'¥{price}', '', '', f'¥{ov.get("price", price)}', f'✅ 人工确认覆盖 ({ov.get("reason", "人工确认")})'])
                    else:
                        if old_p is not None:
                            filtered_prices[rarity] = old_p
                        csv_rows.append(['BLZD', set_number, card_name, rarity,
                                        old_p_str, f'¥{price}', '', '', old_p_str if old_p is not None else '-', '⚠️ PSER<1, 异常保留旧值' if old_p else '⚠️ PSER<1, 异常跳过'])
                    continue

                # 变化幅度校验（有旧值时检查）
                if old_p is not None and old_p > 2 and price > 0:
                    if price / old_p > 10 or old_p / price > 10:
                        is_suspect = True
                        note = f'⚠️ 变化>10x ({old_p}→{price}), 保留旧值'

                # 检查人工确认覆盖（BLZD - 变化幅度异常）
                if is_suspect and override_key in price_overrides:
                    override_info = price_overrides[override_key]
                    override_price = override_info.get('price', price)
                    override_reason = override_info.get('reason', '人工确认')
                    filtered_prices[rarity] = override_price
                    note = f'✅ 人工确认覆盖 ({override_reason})'
                    blzd_changes += 1
                    consumed_overrides.append(override_key)
                    csv_rows.append(['BLZD', set_number, card_name, rarity,
                                    old_p_str, f'¥{price}', '', '', f'¥{override_price}', note])
                    continue

                if is_suspect:
                    filtered_prices[rarity] = old_p
                    csv_rows.append(['BLZD', set_number, card_name, rarity,
                                    old_p_str, f'¥{price}', '', '', old_p_str, note])
                else:
                    filtered_prices[rarity] = price
                    if old_p is not None and price != old_p:
                        note = '✅ 更新'
                        blzd_changes += 1
                    elif old_p is None:
                        note = '✅ 新建'
                        blzd_new_count += 1
                    csv_rows.append(['BLZD', set_number, card_name, rarity,
                                    old_p_str, f'¥{price}', '', '', f'¥{price}', note])
            elif rarity == 'N' and 'NR' in valid_rarities:
                target_rarity = 'NR'
                old_p_nr = old_prices.get('NR')
                old_p_nr_str = f'¥{old_p_nr}' if old_p_nr is not None else '-'
                if price <= 5:
                    filtered_prices['NR'] = price
                    note = '✅ 更新(N→NR)' if old_p_nr is not None and price != old_p_nr else ('✅ 新建(N→NR)' if old_p_nr is None else '')
                    csv_rows.append(['BLZD', set_number, card_name, 'NR(from N)',
                                    old_p_nr_str, f'¥{price}', '', '', f'¥{price}', note])
            elif rarity == 'R' and 'NR' in valid_rarities and 'R' not in valid_rarities:
                target_rarity = 'NR'
                old_p_nr = old_prices.get('NR')
                old_p_nr_str = f'¥{old_p_nr}' if old_p_nr is not None else '-'
                if price <= 5:
                    filtered_prices['NR'] = price
                    note = '✅ 更新(R→NR)' if old_p_nr is not None and price != old_p_nr else ('✅ 新建(R→NR)' if old_p_nr is None else '')
                    csv_rows.append(['BLZD', set_number, card_name, 'NR(from R)',
                                    old_p_nr_str, f'¥{price}', '', '', f'¥{price}', note])

        # N/NR 价格互补
        if 'N' in valid_rarities and 'NR' in valid_rarities:
            if 'N' in filtered_prices and 'NR' not in filtered_prices:
                filtered_prices['NR'] = filtered_prices['N']
                csv_rows.append(['BLZD', set_number, card_name, 'NR(互补)',
                                f'¥{old_prices.get("NR", "-")}' if old_prices.get("NR") else '-', f'¥{filtered_prices["N"]}', '', '', f'¥{filtered_prices["N"]}', '✅ 从N自动互补'])
            elif 'NR' in filtered_prices and 'N' not in filtered_prices:
                filtered_prices['N'] = filtered_prices['NR']
                csv_rows.append(['BLZD', set_number, card_name, 'N(互补)',
                                f'¥{old_prices.get("N", "-")}' if old_prices.get("N") else '-', f'¥{filtered_prices["NR"]}', '', '', f'¥{filtered_prices["NR"]}', '✅ 从NR自动互补'])

        # 合并：保留旧价格中OCR未覆盖的稀有度
        for rarity, old_p in old_prices.items():
            if rarity not in filtered_prices:
                filtered_prices[rarity] = old_p
                csv_rows.append(['BLZD', set_number, card_name, rarity,
                                f'¥{old_p}', '-', '', '', f'¥{old_p}', '—（OCR未识别，保留旧值）'])

        if filtered_prices:
            blzd_cards[password] = {
                'setNumber': set_number,
                'name': card_name,
                'prices': filtered_prices,
            }

            prices_str = ', '.join(f'{r}=¥{p}' for r, p in sorted(filtered_prices.items()))
            print(f"  {set_number:15s} {card_name[:18]:20s} {prices_str}")

    # 保留OCR中完全没有的旧卡片（如果有）
    for sn, old_info in blzd_old_by_set.items():
        if sn not in blzd_ocr:
            pw = old_info['password']
            if pw not in blzd_cards:
                blzd_cards[pw] = {
                    'setNumber': sn,
                    'name': old_info['name'],
                    'prices': old_info['prices'],
                }
                for r, p in old_info['prices'].items():
                    csv_rows.append(['BLZD', sn, old_info['name'], r,
                                    f'¥{p}', '-', '', '', f'¥{p}', '—（本次OCR无数据，保留旧值）'])

    blzd_prices['cards'] = blzd_cards
    blzd_prices['_更新时间'] = date_display
    blzd_prices['_数据来源'] = '集换社App截图 OCR 识别'

    print(f"  BLZD 更新: {len(blzd_cards)} 张, 变更: {blzd_changes} 项, 新建: {blzd_new_count} 项, 未收录: {blzd_not_listed} 项")

    # =====================
    # 卡包/卡盒价格（从OCR数据自动读取）
    # =====================
    print(f"\n{'=' * 80}")
    print("卡包/卡盒价格更新")
    print("=" * 80)

    # 从OCR解析结果中读取卡包价格
    ocr_pack_prices = ocr_data.get('pack_prices', {})

    csv_rows.append(['', '', '', '', '', '', '', '', '', ''])

    # LOCH 盒/包价格
    loch_pack = ocr_pack_prices.get('loch', {})
    if 'box' in loch_pack:
        loch_prices['packPrices']['LOCH']['box'] = loch_pack['box']
        print(f"  LOCH 盒=¥{loch_pack['box']} ✅ (OCR识别)")
        csv_rows.append(['卡包价格', 'LOCH', '', '盒', f"¥{loch_prices['packPrices']['LOCH'].get('box', '-')}", '', '', '', f"¥{loch_pack['box']}", 'OCR识别'])
    else:
        print(f"  LOCH 盒=¥{loch_prices['packPrices']['LOCH'].get('box', '?')} (沿用旧价，OCR未识别)")
        csv_rows.append(['卡包价格', 'LOCH', '', '盒', '', '', '', '', f"¥{loch_prices['packPrices']['LOCH'].get('box', '?')}", '沿用旧价'])

    if 'pack' in loch_pack:
        loch_prices['packPrices']['LOCH']['pack'] = loch_pack['pack']
        print(f"  LOCH 包=¥{loch_pack['pack']} ✅ (OCR识别)")
        csv_rows.append(['卡包价格', 'LOCH', '', '包', f"¥{loch_prices['packPrices']['LOCH'].get('pack', '-')}", '', '', '', f"¥{loch_pack['pack']}", 'OCR识别'])
    else:
        print(f"  LOCH 包=¥{loch_prices['packPrices']['LOCH'].get('pack', '?')} (沿用旧价，OCR未识别)")
        csv_rows.append(['卡包价格', 'LOCH', '', '包', '', '', '', '', f"¥{loch_prices['packPrices']['LOCH'].get('pack', '?')}", '沿用旧价'])

    # LOSP 包价格
    losp_pack = ocr_pack_prices.get('losp', {})
    if 'pack' in losp_pack:
        loch_prices['packPrices']['LOSP']['pack'] = losp_pack['pack']
        print(f"  LOSP 包=¥{losp_pack['pack']} ✅ (OCR识别)")
        csv_rows.append(['卡包价格', 'LOSP', '', '包', f"¥{loch_prices['packPrices']['LOSP'].get('pack', '-')}", '', '', '', f"¥{losp_pack['pack']}", 'OCR识别'])
    else:
        print(f"  LOSP 包=¥{loch_prices['packPrices']['LOSP'].get('pack', '?')} (沿用旧价，OCR未识别)")
        csv_rows.append(['卡包价格', 'LOSP', '', '包', '', '', '', '', f"¥{loch_prices['packPrices']['LOSP'].get('pack', '?')}", '沿用旧价'])

    # BLZD 盒/包价格
    blzd_pack = ocr_pack_prices.get('blzd', {})
    if 'box' in blzd_pack:
        blzd_prices['packPrices']['BLZD']['box'] = blzd_pack['box']
        print(f"  BLZD 盒=¥{blzd_pack['box']} ✅ (OCR识别)")
        csv_rows.append(['卡包价格', 'BLZD', '', '盒', f"¥{blzd_prices['packPrices']['BLZD'].get('box', '-')}", '', '', '', f"¥{blzd_pack['box']}", 'OCR识别'])
    else:
        print(f"  BLZD 盒=¥{blzd_prices['packPrices']['BLZD'].get('box', '?')} (沿用旧价，OCR未识别)")
        csv_rows.append(['卡包价格', 'BLZD', '', '盒', '', '', '', '', f"¥{blzd_prices['packPrices']['BLZD'].get('box', '?')}", '沿用旧价'])

    if 'pack' in blzd_pack:
        blzd_prices['packPrices']['BLZD']['pack'] = blzd_pack['pack']
        print(f"  BLZD 包=¥{blzd_pack['pack']} ✅ (OCR识别)")
        csv_rows.append(['卡包价格', 'BLZD', '', '包', f"¥{blzd_prices['packPrices']['BLZD'].get('pack', '-')}", '', '', '', f"¥{blzd_pack['pack']}", 'OCR识别'])
    else:
        print(f"  BLZD 包=¥{blzd_prices['packPrices']['BLZD'].get('pack', '?')} (沿用旧价，OCR未识别)")
        csv_rows.append(['卡包价格', 'BLZD', '', '包', '', '', '', '', f"¥{blzd_prices['packPrices']['BLZD'].get('pack', '?')}", '沿用旧价'])

    # 保存更新后的价格文件
    loch_out = os.path.join(base_dir, 'data', 'ocg', 'prices', 'loch_prices.json')
    blzd_out = os.path.join(base_dir, 'data', 'ocg', 'prices', 'blzd_prices.json')

    save_json(loch_prices, loch_out)
    save_json(blzd_prices, blzd_out)

    print(f"\n✅ 已保存 LOCH 价格: {loch_out}")
    print(f"✅ 已保存 BLZD 价格: {blzd_out}")

    # 清理已消费的覆盖条目
    if consumed_overrides:
        for key in consumed_overrides:
            price_overrides.pop(key, None)
        overrides_data['overrides'] = price_overrides
        save_json(overrides_data, overrides_path)
        print(f"\n🧹 已清理 {len(consumed_overrides)} 条已消费的覆盖配置")
        for key in consumed_overrides:
            print(f"   - {key}")

    # =====================
    # 导出CSV对照表
    # =====================
    csv_path = os.path.join(base_dir, 'test_output', 'price_comparison.csv')
    with open(csv_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(csv_rows)

    print(f"\n📊 价格对照表已导出: {csv_path}")
    print(f"   共 {len(csv_rows)-1} 行数据")

    # =====================
    # 导出异常告警精简列表（仅含需人工确认项）
    # =====================
    alert_rows = [['卡包', '编号', '卡名', '稀有度', '旧价格', 'OCR价格', '采用价格', '告警原因']]
    for row in csv_rows[1:]:  # 跳过表头
        if len(row) >= 10:
            note = row[9]
            # 只收集带 ⚠️ 的异常项 + 价格变化较大的更新项
            if '⚠️' in str(note):
                alert_rows.append([row[0], row[1], row[2], row[3], row[4], row[5], row[8], note])
            elif '✅ 更新' in str(note):
                # 检查价格变化幅度是否较大（>50%）
                old_str = str(row[4]).replace('¥', '').replace('-', '0')
                new_str = str(row[8]).replace('¥', '').replace('-', '0')
                try:
                    old_val = float(old_str)
                    new_val = float(new_str)
                    if old_val > 1 and new_val > 0:
                        change_pct = abs(new_val - old_val) / old_val * 100
                        if change_pct > 50:
                            alert_rows.append([row[0], row[1], row[2], row[3], row[4], row[5], row[8],
                                             f'📢 变化{change_pct:.0f}% ({old_val}→{new_val})'])
                except (ValueError, ZeroDivisionError):
                    pass

    alerts_path = os.path.join(base_dir, 'test_output', 'price_alerts.csv')
    with open(alerts_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(alert_rows)

    alert_count = len(alert_rows) - 1
    print(f"\n🚨 异常告警列表已导出: {alerts_path}")
    print(f"   共 {alert_count} 项需人工确认")

    # =====================
    # 覆盖率检查
    # =====================
    print(f"\n{'=' * 80}")
    print("覆盖率检查")
    print("=" * 80)

    # LOCH + LOSP 覆盖率
    loch_missing = []
    for card_key, card_info in loch_prices['cards'].items():
        sn = card_info['setNumber']
        if sn.startswith('LOSP-'):
            ocr_card = losp_ocr.get(sn, {})
        else:
            ocr_card = loch_ocr.get(sn, {})
        if not ocr_card:
            loch_missing.append(f"{sn} {card_info['name']}")
        else:
            # 检查各稀有度是否都有OCR数据
            for rarity in card_info.get('prices', {}).keys():
                if rarity not in ocr_card:
                    loch_missing.append(f"{sn} {card_info['name']} [{rarity}]")

    if loch_missing:
        print(f"  ⚠️ LOCH+LOSP 缺失OCR数据 ({len(loch_missing)} 项):")
        for item in loch_missing[:20]:  # 最多显示20条
            print(f"     - {item}")
        if len(loch_missing) > 20:
            print(f"     ... 还有 {len(loch_missing) - 20} 项")
    else:
        print(f"  ✅ LOCH+LOSP 全部稀有度均有OCR覆盖")

    # BLZD 覆盖率
    blzd_missing = []
    for set_number, mapping in sorted(blzd_card_map.items()):
        if set_number not in blzd_ocr:
            blzd_missing.append(f"{set_number} {mapping['name']} [整卡缺失]")
        else:
            ocr_card = blzd_ocr[set_number]
            for rarity in mapping['rarityVersions']:
                # N/NR 互补情况不算缺失
                if rarity == 'NR' and ('N' in ocr_card or 'NR' in ocr_card):
                    continue
                if rarity == 'N' and ('N' in ocr_card or 'NR' in ocr_card):
                    continue
                if rarity not in ocr_card:
                    blzd_missing.append(f"{set_number} {mapping['name']} [{rarity}]")

    if blzd_missing:
        print(f"  ⚠️ BLZD 缺失OCR数据 ({len(blzd_missing)} 项):")
        for item in blzd_missing[:20]:
            print(f"     - {item}")
        if len(blzd_missing) > 20:
            print(f"     ... 还有 {len(blzd_missing) - 20} 项")
    else:
        print(f"  ✅ BLZD 全部稀有度均有OCR覆盖")

    # =====================
    # 统计摘要
    # =====================
    print(f"\n{'=' * 80}")
    print("更新摘要")
    print("=" * 80)

    loch_total = len(loch_prices['cards'])
    loch_with_ocr = sum(1 for k, v in loch_prices['cards'].items()
                        if loch_ocr.get(v['setNumber']) or losp_ocr.get(v['setNumber']))
    losp_with_ocr = sum(1 for k, v in loch_prices['cards'].items()
                        if v['setNumber'].startswith('LOSP-') and losp_ocr.get(v['setNumber']))
    print(f"  LOCH+LOSP: {loch_total} 张卡，OCR覆盖 {loch_with_ocr} 张 (其中LOSP {losp_with_ocr} 张)")
    print(f"  LOCH 价格变更: {loch_changes} 项，未收录: {loch_not_listed} 项")

    blzd_total = len(blzd_cards)
    print(f"  BLZD: {blzd_total} 张卡，变更: {blzd_changes} 项，新建: {blzd_new_count} 项，未收录: {blzd_not_listed} 项")


if __name__ == '__main__':
    main()
