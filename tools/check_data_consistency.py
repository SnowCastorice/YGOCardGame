#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_data_consistency.py — 数据一致性自动检查脚本

从 packs.json 读取所有卡包配置，校验 2 类数据一致性：
  1. packs.json 文件引用检查（cardFile、localImagesDir 等是否存在）
  2. 价格文件 ↔ 卡片数据交叉校验（多余价格、缺价格卡片）

注：image map 已在双图库架构中移除，相关检查已删除。

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
IMAGES_DIST_DIR = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'images_dist')
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
        if pack.get('localImagesDir'):
            checks.append(('localImagesDir', os.path.join(IMAGES_DIST_DIR, pack['localImagesDir'])))

        # 辅助包文件
        if pack.get('supplementPackFile'):
            checks.append(('supplementPackFile', os.path.join(CARDS_DIR, pack['supplementPackFile'])))
        if pack.get('supplementImagesDir'):
            checks.append(('supplementImagesDir', os.path.join(IMAGES_DIST_DIR, pack['supplementImagesDir'])))

        for field, path in checks:
            if not os.path.exists(path):
                print_error(f'{pack_name}: {field} 路径不存在 → {path}')
                all_ok = False

    if all_ok:
        print_pass(f'packs.json 文件引用检查 — 全部通过（{len(packs)} 个卡包）')


# ============================================================
# 检查 2：价格文件 ↔ 卡片数据交叉校验
# ============================================================
def check_prices_vs_cards(packs):
    """检查价格文件的 key 与卡片数据的 setNumber 是否匹配"""
    print_section('检查 2: 价格文件 ↔ 卡片数据交叉校验')

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

    # 执行 2 类检查
    check_file_references(packs)
    check_prices_vs_cards(packs)

    # 汇总
    print(f'\n{"=" * 60}')
    print(f'汇总：{errors} ERROR, {warnings} WARNING')
    print('=' * 60)

    sys.exit(1 if errors > 0 else 0)


if __name__ == '__main__':
    main()
