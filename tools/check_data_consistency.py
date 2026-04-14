#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_data_consistency.py — 数据一致性自动检查脚本

从 packs.json 读取所有卡包配置，校验 4 类数据一致性：
  1. packs.json 文件引用检查（cardFile、imageMapFile、localImagesDir 等是否存在）
  2. image map ↔ 图片文件交叉校验（幽灵引用、孤儿文件）
  3. 卡片数据 ↔ image map 交叉校验（缺图卡片、多余条目）
  4. 价格文件 ↔ 卡片数据交叉校验（多余价格、缺价格卡片）

用法：
    python tools/check_data_consistency.py

退出码：
    0 = 无 ERROR（可能有 WARNING）
    1 = 有 ERROR
"""

import json
import os
import sys
import glob

# === 路径常量 ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

PACKS_JSON = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'packs.json')
CARDS_DIR = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'cards')
IMAGE_MAPS_DIR = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'image_maps')
IMAGES_DIR = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'images')
PRICES_DIR = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'prices')

# === 计数器 ===
errors = 0
warnings = 0


def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def print_header(title):
    print(f'\n{"=" * 60}')
    print(title)
    print('=' * 60)


def print_pass(msg):
    print(f'\n  ✅ {msg}')


def print_error(msg):
    global errors
    errors += 1
    print(f'  ❌ ERROR: {msg}')


def print_warning(msg):
    global warnings
    warnings += 1
    print(f'  ⚠️ WARNING: {msg}')


def print_section(title):
    print(f'\n  --- {title} ---')


def get_card_list(card_data):
    """从卡包数据中获取卡片列表（兼容 cardIds 和 cards 两种字段名）"""
    return card_data.get('cardIds', card_data.get('cards', []))


def resolve_images_dir(relative_dir):
    """将 packs.json 中的相对图片目录路径转为绝对路径"""
    return os.path.join(IMAGES_DIR, relative_dir)


# ============================================================
# 检查 1：packs.json 文件引用
# ============================================================
def check_file_references(packs):
    """检查 packs.json 中引用的所有文件和目录是否存在"""
    print_section('检查 1: packs.json 文件引用')
    all_ok = True

    for pack in packs:
        pack_name = pack.get('packCode', pack.get('packId', '未知'))

        # 主卡包文件
        checks = []
        if pack.get('cardFile'):
            checks.append(('cardFile', os.path.join(CARDS_DIR, pack['cardFile'])))
        if pack.get('imageMapFile'):
            checks.append(('imageMapFile', os.path.join(IMAGE_MAPS_DIR, pack['imageMapFile'])))
        if pack.get('localImagesDir'):
            checks.append(('localImagesDir', resolve_images_dir(pack['localImagesDir'])))

        # 辅助包文件
        if pack.get('supplementPackFile'):
            checks.append(('supplementPackFile', os.path.join(CARDS_DIR, pack['supplementPackFile'])))
        if pack.get('supplementImageMapFile'):
            checks.append(('supplementImageMapFile', os.path.join(IMAGE_MAPS_DIR, pack['supplementImageMapFile'])))
        if pack.get('supplementImagesDir'):
            checks.append(('supplementImagesDir', resolve_images_dir(pack['supplementImagesDir'])))

        for field, path in checks:
            if not os.path.exists(path):
                print_error(f'{pack_name}: {field} 路径不存在 → {path}')
                all_ok = False

    if all_ok:
        print_pass(f'packs.json 文件引用检查 — 全部通过（{len(packs)} 个卡包）')


# ============================================================
# 检查 2：image map ↔ 图片文件交叉校验
# ============================================================
def check_image_map_vs_files(packs):
    """检查 image map 引用的文件是否存在，以及目录中是否有未被引用的孤儿文件"""
    print_section('检查 2: image map ↔ 图片文件交叉校验')

    # 收集所有需要检查的 (image_map_file, images_dir, label) 组合
    check_pairs = []
    for pack in packs:
        pack_code = pack.get('packCode', pack.get('packId', '未知'))
        if pack.get('imageMapFile') and pack.get('localImagesDir'):
            check_pairs.append((
                os.path.join(IMAGE_MAPS_DIR, pack['imageMapFile']),
                resolve_images_dir(pack['localImagesDir']),
                pack_code
            ))
        if pack.get('supplementImageMapFile') and pack.get('supplementImagesDir'):
            # 从辅助包文件名推断标签
            supp_label = pack.get('supplementImageMapFile', '').replace('_image_map.json', '').upper()
            check_pairs.append((
                os.path.join(IMAGE_MAPS_DIR, pack['supplementImageMapFile']),
                resolve_images_dir(pack['supplementImagesDir']),
                supp_label
            ))

    all_ok = True
    for map_path, img_dir, label in check_pairs:
        if not os.path.exists(map_path) or not os.path.exists(img_dir):
            continue  # 检查 1 已经报过错

        image_map = load_json(map_path)
        cards = image_map.get('cards', {})

        # 收集 image map 中引用的所有文件名
        referenced_files = set()
        for sn, card_info in cards.items():
            local_images = card_info.get('localImages', {})
            for rarity, file_list in local_images.items():
                if isinstance(file_list, list):
                    referenced_files.update(file_list)
                elif isinstance(file_list, str):
                    referenced_files.add(file_list)

        # 收集目录中实际存在的 .webp 文件
        actual_files = set()
        for f in os.listdir(img_dir):
            if f.endswith('.webp'):
                actual_files.add(f)

        # 幽灵引用：image map 引用了但文件不存在
        ghost_refs = referenced_files - actual_files
        if ghost_refs:
            all_ok = False
            print_error(f'{label}: 幽灵引用 {len(ghost_refs)} 个（image map 引用了但文件不存在）')
            for f in sorted(ghost_refs)[:10]:  # 最多显示 10 个
                print(f'      - {f}')
            if len(ghost_refs) > 10:
                print(f'      ... 还有 {len(ghost_refs) - 10} 个')

        # 孤儿文件：文件存在但 image map 未引用
        orphan_files = actual_files - referenced_files
        if orphan_files:
            all_ok = False
            print_warning(f'{label}: 孤儿文件 {len(orphan_files)} 个（图片目录中存在但 image map 未引用）')
            for f in sorted(orphan_files)[:10]:
                print(f'      - {f}')
            if len(orphan_files) > 10:
                print(f'      ... 还有 {len(orphan_files) - 10} 个')

    if all_ok:
        print_pass(f'image map ↔ 图片文件交叉校验 — 全部通过（{len(check_pairs)} 组）')


# ============================================================
# 检查 3：卡片数据 ↔ image map 交叉校验
# ============================================================
def check_cards_vs_image_map(packs):
    """检查卡片数据中的 setNumber 与 image map 的 key 是否匹配"""
    print_section('检查 3: 卡片数据 ↔ image map 交叉校验')

    # 收集所有需要检查的 (card_file, image_map_file, label) 组合
    check_pairs = []
    for pack in packs:
        pack_code = pack.get('packCode', pack.get('packId', '未知'))
        if pack.get('cardFile') and pack.get('imageMapFile'):
            check_pairs.append((
                os.path.join(CARDS_DIR, pack['cardFile']),
                os.path.join(IMAGE_MAPS_DIR, pack['imageMapFile']),
                pack_code
            ))
        if pack.get('supplementPackFile') and pack.get('supplementImageMapFile'):
            supp_label = pack.get('supplementImageMapFile', '').replace('_image_map.json', '').upper()
            check_pairs.append((
                os.path.join(CARDS_DIR, pack['supplementPackFile']),
                os.path.join(IMAGE_MAPS_DIR, pack['supplementImageMapFile']),
                supp_label
            ))

    all_ok = True
    for card_path, map_path, label in check_pairs:
        if not os.path.exists(card_path) or not os.path.exists(map_path):
            continue

        card_data = load_json(card_path)
        card_ids = get_card_list(card_data)
        card_set_numbers = set()
        for card in card_ids:
            sn = card.get('setNumber', '')
            if sn:
                card_set_numbers.add(sn)

        image_map = load_json(map_path)
        map_keys = set(image_map.get('cards', {}).keys())

        # 缺图卡片：cardIds 中有 setNumber 但 image map 中没有
        missing_in_map = card_set_numbers - map_keys
        if missing_in_map:
            all_ok = False
            print_warning(f'{label}: 缺图卡片 {len(missing_in_map)} 张（卡片数据中有但 image map 中无条目）')
            for sn in sorted(missing_in_map)[:10]:
                print(f'      - {sn}')
            if len(missing_in_map) > 10:
                print(f'      ... 还有 {len(missing_in_map) - 10} 张')

        # 多余条目：image map 中有 key 但 cardIds 中没有对应 setNumber
        extra_in_map = map_keys - card_set_numbers
        if extra_in_map:
            all_ok = False
            print_warning(f'{label}: image map 多余条目 {len(extra_in_map)} 个（image map 中有但卡片数据中无）')
            for sn in sorted(extra_in_map)[:10]:
                print(f'      - {sn}')
            if len(extra_in_map) > 10:
                print(f'      ... 还有 {len(extra_in_map) - 10} 个')

    if all_ok:
        print_pass(f'卡片数据 ↔ image map 交叉校验 — 全部通过（{len(check_pairs)} 组）')


# ============================================================
# 检查 4：价格文件 ↔ 卡片数据交叉校验
# ============================================================
def check_prices_vs_cards(packs):
    """检查价格文件的 key 与卡片数据的 setNumber 是否匹配"""
    print_section('检查 4: 价格文件 ↔ 卡片数据交叉校验')

    # 收集所有卡包+辅助包的 setNumber
    all_set_numbers = set()
    for pack in packs:
        # 主卡包
        if pack.get('cardFile'):
            card_path = os.path.join(CARDS_DIR, pack['cardFile'])
            if os.path.exists(card_path):
                card_data = load_json(card_path)
                for card in get_card_list(card_data):
                    sn = card.get('setNumber', '')
                    if sn:
                        all_set_numbers.add(sn)
        # 辅助包
        if pack.get('supplementPackFile'):
            supp_path = os.path.join(CARDS_DIR, pack['supplementPackFile'])
            if os.path.exists(supp_path):
                supp_data = load_json(supp_path)
                for card in get_card_list(supp_data):
                    sn = card.get('setNumber', '')
                    if sn:
                        all_set_numbers.add(sn)

    # 扫描所有价格文件
    price_files = glob.glob(os.path.join(PRICES_DIR, '*_prices.json'))
    if not price_files:
        print_warning('未找到任何价格文件')
        return

    all_ok = True
    all_price_keys = set()

    for pf in sorted(price_files):
        filename = os.path.basename(pf)
        price_data = load_json(pf)

        # 提取价格 key（卡片价格在 cards 字段下）
        price_keys = set()
        cards_section = price_data.get('cards', {})
        if isinstance(cards_section, dict):
            for key in cards_section:
                if not key.startswith('_'):
                    price_keys.add(key)

        all_price_keys.update(price_keys)

        # 多余价格条目：价格文件中有但卡片数据中没有
        extra_prices = price_keys - all_set_numbers
        if extra_prices:
            all_ok = False
            print_warning(f'{filename}: 多余价格条目 {len(extra_prices)} 个（价格文件中有但卡片数据中无）')
            for sn in sorted(extra_prices)[:5]:
                print(f'      - {sn}')
            if len(extra_prices) > 5:
                print(f'      ... 还有 {len(extra_prices) - 5} 个')

    # 缺价格卡片：卡片数据中有但所有价格文件中都没有
    cards_without_price = all_set_numbers - all_price_keys
    if cards_without_price:
        all_ok = False
        # 按卡包前缀分组显示
        by_pack = {}
        for sn in cards_without_price:
            prefix = sn.split('-')[0] if '-' in sn else '未知'
            by_pack.setdefault(prefix, []).append(sn)

        total = len(cards_without_price)
        print_warning(f'缺价格卡片 {total} 张（卡片数据中有但无对应价格）')
        for prefix in sorted(by_pack):
            count = len(by_pack[prefix])
            print(f'      {prefix}: {count} 张')

    if all_ok:
        print_pass(f'价格文件 ↔ 卡片数据交叉校验 — 全部通过（{len(price_files)} 个价格文件）')


# ============================================================
# 主函数
# ============================================================
def main():
    global errors, warnings

    print_header('数据一致性检查报告')

    # 加载 packs.json
    if not os.path.exists(PACKS_JSON):
        print_error(f'packs.json 不存在: {PACKS_JSON}')
        sys.exit(1)

    packs_data = load_json(PACKS_JSON)
    packs = packs_data.get('packs', [])
    print(f'\n  已加载 {len(packs)} 个卡包配置')

    # 执行 4 类检查
    check_file_references(packs)
    check_image_map_vs_files(packs)
    check_cards_vs_image_map(packs)
    check_prices_vs_cards(packs)

    # 汇总
    print(f'\n{"=" * 60}')
    print(f'汇总：{errors} ERROR, {warnings} WARNING')
    print('=' * 60)

    sys.exit(1 if errors > 0 else 0)


if __name__ == '__main__':
    main()
