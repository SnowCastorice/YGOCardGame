#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_card_images.py — 从原始图库构建调用图库

扫描 data/ocg/images/ 下各卡包目录（原始图库，多图源），
按优先级选取每张卡每个稀有度的最优图，
复制到 data/ocg/images_dist/ （调用图库），
统一命名为 {setNumber}_{rarity}.webp。

用法：
    python tools/build_card_images.py              # 构建全部
    python tools/build_card_images.py --dry-run    # 预览模式
    python tools/build_card_images.py loch locr    # 只构建指定卡包
"""

import os
import re
import shutil
import sys

# === 路径 ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
IMAGES_SRC = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'images_source')
IMAGES_DIST = os.path.join(PROJECT_ROOT, 'data', 'ocg', 'images_dist')

# 卡图子目录列表
PACK_DIRS = ['loch', 'locr', 'blzd', 'blzds', 'losp_vol1', 'losp_vol2']

# 图源优先级（数字越小优先级越高）
SOURCE_PRIORITY = {
    'twitter_photo_art': 1,
    'twitter_render_art': 2,
    'tcgcorner_photo_art': 3,
    'ygojp_render_art': 4,
    'official_render_art': 5,
    'ygometa_render_art': 6,
}

# 文件名解析正则：{PACK}-{REGION}{NUM}_{RARITY}_{SOURCE}_{TYPE}.webp
FILE_PATTERN = re.compile(r'^([A-Z]+-[A-Z]+\d+)_([A-Z]+(?:-[A-Z]+)?)_(.+)\.webp$')


def scan_source_dir(src_dir):
    """扫描原始图库目录，返回 { (setNumber, rarity): [(priority, filename), ...] }"""
    result = {}

    if not os.path.exists(src_dir):
        return result

    for filename in sorted(os.listdir(src_dir)):
        if not filename.endswith('.webp'):
            continue

        match = FILE_PATTERN.match(filename)
        if not match:
            continue

        set_number = match.group(1)
        rarity = match.group(2)
        source_type = match.group(3)

        key = (set_number, rarity)
        priority = SOURCE_PRIORITY.get(source_type, 99)

        if key not in result:
            result[key] = []
        result[key].append((priority, filename))

    return result


def build_pack(pack_name, dry_run=False):
    """构建单个卡包的调用图库"""
    src_dir = os.path.join(IMAGES_SRC, pack_name)
    dist_dir = os.path.join(IMAGES_DIST, pack_name)

    if not os.path.exists(src_dir):
        print(f'  ⚠️ 源目录不存在: {src_dir}')
        return 0, 0

    # 扫描原始图库
    source_files = scan_source_dir(src_dir)

    if not source_files:
        print(f'  {pack_name}/: 无 webp 文件')
        return 0, 0

    if not dry_run:
        os.makedirs(dist_dir, exist_ok=True)

    built = 0
    skipped = 0

    for (set_number, rarity), candidates in sorted(source_files.items()):
        # 按优先级排序，取最优
        candidates.sort(key=lambda x: x[0])
        best_priority, best_file = candidates[0]

        # 目标文件名：{setNumber}_{rarity}.webp
        dist_filename = f'{set_number}_{rarity}.webp'
        src_path = os.path.join(src_dir, best_file)
        dist_path = os.path.join(dist_dir, dist_filename)

        # 检查是否需要更新（目标已存在且大小一致则跳过）
        if os.path.exists(dist_path) and os.path.getsize(dist_path) == os.path.getsize(src_path):
            skipped += 1
            continue

        if dry_run:
            source_name = best_file.replace(f'{set_number}_{rarity}_', '').replace('.webp', '')
            print(f'    {dist_filename} ← {source_name}')
        else:
            shutil.copy2(src_path, dist_path)

        built += 1

    status = ' [预览]' if dry_run else ''
    total = len(source_files)
    print(f'  {pack_name}/: {built} 个构建{status}，{skipped} 个已存在跳过（共 {total} 个稀有度版本）')
    return built, skipped


def main():
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    if dry_run:
        args.remove('--dry-run')

    target_packs = args if args else PACK_DIRS

    print('=' * 60)
    print('构建调用图库（原始图库 → 简化命名）')
    if dry_run:
        print('⚠️ 预览模式（不实际复制）')
    print('=' * 60)

    total_built = 0
    total_skipped = 0

    for pack in target_packs:
        b, s = build_pack(pack, dry_run)
        total_built += b
        total_skipped += s

    print(f'\n{"=" * 60}')
    print(f'汇总：{total_built} 个构建，{total_skipped} 个已存在跳过')
    print(f'输出目录：{IMAGES_DIST}')
    print('=' * 60)


if __name__ == '__main__':
    main()
