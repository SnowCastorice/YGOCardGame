#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一次性迁移脚本：卡图文件重命名 + 辅助包拆分

功能：
1a. BLZD: hash命名 → 新规范命名，删除 w200，拆分 BLZDS 到独立目录
1b. LOCH: hash命名 → 新规范命名，删除 w200，拆分 LOSP-vol1 到独立目录
1c. LOCR: 拆分 LOSP-vol2 到独立目录（命名已是新规范）

命名规范：{setNumber}_{rarity}_{source}_{type}.webp
参考：docs/NAMING_CONVENTION.md

用法：
    python tools/migrate_card_images.py          # 实际执行
    python tools/migrate_card_images.py --dry-run # 仅预览，不修改文件
"""

import json
import os
import sys
import shutil
import argparse


def load_json(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)


def ensure_dir(dirpath):
    """确保目录存在"""
    os.makedirs(dirpath, exist_ok=True)


def migrate_blzd(base_dir, dry_run=False):
    """1a. BLZD 重命名 + 拆分 BLZDS"""
    print("=" * 60)
    print("1a. BLZD 重命名 + 拆分 BLZDS")
    print("=" * 60)

    image_map = load_json(os.path.join(base_dir, 'data', 'ocg', 'blzd_image_map.json'))
    cards = image_map['cards']
    images_dir = os.path.join(base_dir, 'data', 'ocg', 'images', 'blzd')
    blzds_dir = os.path.join(base_dir, 'data', 'ocg', 'images', 'blzds')

    # 建立 metaId → (setNumber, rarity, is_supplement) 映射
    # BLZD 没有 altMetaId，每张卡只有一个 metaId，只有默认稀有度
    meta_to_info = {}
    for pw, info in cards.items():
        if not isinstance(info, dict):
            continue
        meta_id = info['metaId']
        set_number = info.get('setNumber', '')
        is_supplement = set_number.startswith('BLZD-JPS')

        # 默认稀有度版本（BLZD 无 altMetaId）
        meta_to_info[meta_id] = {
            'setNumber': set_number,
            'rarity': 'UR' if is_supplement else 'N',  # 辅助包默认 UR，正包卡图无特定稀有度标注
            'is_supplement': is_supplement,
        }

    # 先确定每张卡的实际稀有度（从 card data 获取更准确）
    # BLZD 是旧格式，每个 metaId 只对应一张卡的一个默认卡图
    # 命名中稀有度用该卡的最低稀有度（因为默认卡图就是普通版）

    renamed = 0
    deleted_w200 = 0
    split_to_blzds = 0
    missing_w420 = []

    # 获取所有文件
    all_files = os.listdir(images_dir)
    w420_files = [f for f in all_files if f.endswith('_w420.webp')]
    w200_files = [f for f in all_files if f.endswith('_w200.webp')]

    # 检查仅有 w200 没有 w420 的
    w420_hashes = set(f.replace('_w420.webp', '') for f in w420_files)
    w200_hashes = set(f.replace('_w200.webp', '') for f in w200_files)
    only_w200 = w200_hashes - w420_hashes
    if only_w200:
        for h in only_w200:
            # 找到对应的 setNumber
            for meta_id, info in meta_to_info.items():
                if meta_id == h:
                    missing_w420.append(f"{info['setNumber']} (metaId: {h})")
                    break
            else:
                missing_w420.append(f"未知卡片 (metaId: {h})")

    # 重命名 w420 文件
    for w420_file in sorted(w420_files):
        meta_id = w420_file.replace('_w420.webp', '')
        info = meta_to_info.get(meta_id)

        if not info:
            print(f"  ⚠️ 未知 metaId: {meta_id}，跳过")
            continue

        set_number = info['setNumber']
        # BLZD 卡图来源统一为 ygometa，类型为 render_art
        # 稀有度：使用通用标记（BLZD 的 metaId 图是不分稀有度的默认卡图）
        new_name = f"{set_number}_N_ygometa_render_art.webp"
        if info['is_supplement']:
            new_name = f"{set_number}_UR_ygometa_render_art.webp"

        target_dir = blzds_dir if info['is_supplement'] else images_dir
        old_path = os.path.join(images_dir, w420_file)
        new_path = os.path.join(target_dir, new_name)

        if info['is_supplement']:
            split_to_blzds += 1
            if not dry_run:
                ensure_dir(blzds_dir)
                shutil.move(old_path, new_path)
            print(f"  → BLZDS: {w420_file} → blzds/{new_name}")
        else:
            renamed += 1
            if not dry_run:
                os.rename(old_path, new_path)
            print(f"  ✅ {w420_file} → {new_name}")

    # 删除 w200 文件
    for w200_file in sorted(w200_files):
        old_path = os.path.join(images_dir, w200_file)
        if not dry_run:
            os.remove(old_path)
        deleted_w200 += 1

    print(f"\n📊 BLZD 结果: 重命名 {renamed} 张, 拆分到 blzds/ {split_to_blzds} 张, 删除 w200 {deleted_w200} 张")
    if missing_w420:
        print(f"  ⚠️ 以下卡片只有 w200 没有 w420，需要用户补充:")
        for m in missing_w420:
            print(f"     - {m}")
    return {'renamed': renamed, 'split': split_to_blzds, 'deleted': deleted_w200, 'missing': missing_w420}


def migrate_loch(base_dir, dry_run=False):
    """1b. LOCH 重命名 + 拆分 LOSP-vol1"""
    print(f"\n{'=' * 60}")
    print("1b. LOCH 重命名 + 拆分 LOSP-vol1")
    print("=" * 60)

    image_map = load_json(os.path.join(base_dir, 'data', 'ocg', 'loch_image_map.json'))
    cards = image_map['cards']
    images_dir = os.path.join(base_dir, 'data', 'ocg', 'images', 'loch')
    losp_dir = os.path.join(base_dir, 'data', 'ocg', 'images', 'losp_vol1')

    # 建立 metaId → (setNumber, rarity) 映射
    # LOCH 有 altMetaId：默认 metaId 对应普通版，altMetaId 对应 OF 版
    meta_to_info = {}
    for pw, info in cards.items():
        if not isinstance(info, dict):
            continue
        meta_id = info['metaId']
        set_number = info.get('setNumber', '')
        is_losp = set_number.startswith('LOSP-')

        # 默认卡图 → 普通版稀有度
        if is_losp:
            default_rarity = 'PSER-OF'  # LOSP 全部是 PSER-OF
        else:
            default_rarity = 'UR'  # LOCH 默认卡图对应普通 UR

        meta_to_info[meta_id] = {
            'setNumber': set_number,
            'rarity': default_rarity,
            'is_losp': is_losp,
        }

        # altMetaId 中的 OF 版本
        for rarity, alt_meta_id in info.get('altMetaId', {}).items():
            if alt_meta_id != meta_id:  # 不同的图才需要单独映射
                meta_to_info[alt_meta_id] = {
                    'setNumber': set_number,
                    'rarity': rarity,
                    'is_losp': is_losp,
                }

    renamed = 0
    deleted_w200 = 0
    split_to_losp = 0
    missing_w420 = []
    losp_missing = []  # LOSP vol1 本地缺图的卡

    all_files = os.listdir(images_dir)
    w420_files = [f for f in all_files if f.endswith('_w420.webp')]
    w200_files = [f for f in all_files if f.endswith('_w200.webp')]

    # 检查仅有 w200 的
    w420_hashes = set(f.replace('_w420.webp', '') for f in w420_files)
    w200_hashes = set(f.replace('_w200.webp', '') for f in w200_files)
    only_w200 = w200_hashes - w420_hashes
    if only_w200:
        for h in only_w200:
            info = meta_to_info.get(h)
            if info:
                missing_w420.append(f"{info['setNumber']} {info['rarity']} (metaId: {h})")
            else:
                missing_w420.append(f"未知卡片 (metaId: {h})")

    # 重命名 w420 文件
    for w420_file in sorted(w420_files):
        meta_id = w420_file.replace('_w420.webp', '')
        info = meta_to_info.get(meta_id)

        if not info:
            print(f"  ⚠️ 未知 metaId: {meta_id}，跳过")
            continue

        set_number = info['setNumber']
        rarity = info['rarity']
        new_name = f"{set_number}_{rarity}_ygometa_render_art.webp"

        target_dir = losp_dir if info['is_losp'] else images_dir
        old_path = os.path.join(images_dir, w420_file)
        new_path = os.path.join(target_dir, new_name)

        if info['is_losp']:
            split_to_losp += 1
            if not dry_run:
                ensure_dir(losp_dir)
                shutil.move(old_path, new_path)
            print(f"  → LOSP: {w420_file} → losp_vol1/{new_name}")
        else:
            renamed += 1
            if not dry_run:
                os.rename(old_path, new_path)
            print(f"  ✅ {w420_file} → {new_name}")

    # 删除 w200 文件
    for w200_file in sorted(w200_files):
        old_path = os.path.join(images_dir, w200_file)
        if not dry_run:
            os.remove(old_path)
        deleted_w200 += 1

    # 检查 LOSP vol1 是否所有卡都有本地文件
    losp_cards_in_map = [info for info in meta_to_info.values() if info['is_losp']]
    losp_meta_ids = [mid for mid, info in meta_to_info.items() if info['is_losp']]
    for mid in losp_meta_ids:
        if mid not in w420_hashes:
            info = meta_to_info[mid]
            losp_missing.append(f"{info['setNumber']} {info['rarity']} (metaId: {mid})")

    print(f"\n📊 LOCH 结果: 重命名 {renamed} 张, 拆分到 losp_vol1/ {split_to_losp} 张, 删除 w200 {deleted_w200} 张")
    if missing_w420:
        print(f"  ⚠️ 以下卡片只有 w200 没有 w420，需要用户补充:")
        for m in missing_w420:
            print(f"     - {m}")
    if losp_missing:
        print(f"  ⚠️ 以下 LOSP vol1 卡片本地无文件，需要用户补充:")
        for m in losp_missing:
            print(f"     - {m}")

    return {'renamed': renamed, 'split': split_to_losp, 'deleted': deleted_w200,
            'missing_w420': missing_w420, 'losp_missing': losp_missing}


def migrate_locr(base_dir, dry_run=False):
    """1c. LOCR 拆分 LOSP-vol2"""
    print(f"\n{'=' * 60}")
    print("1c. LOCR 拆分 LOSP-vol2")
    print("=" * 60)

    images_dir = os.path.join(base_dir, 'data', 'ocg', 'images', 'locr')
    losp_dir = os.path.join(base_dir, 'data', 'ocg', 'images', 'losp_vol2')

    all_files = os.listdir(images_dir)
    losp_files = [f for f in all_files if f.startswith('LOSP-')]
    locr_remaining = len(all_files) - len(losp_files)

    split_count = 0
    for losp_file in sorted(losp_files):
        old_path = os.path.join(images_dir, losp_file)
        new_path = os.path.join(losp_dir, losp_file)
        if not dry_run:
            ensure_dir(losp_dir)
            shutil.move(old_path, new_path)
        split_count += 1
        print(f"  → LOSP: {losp_file} → losp_vol2/{losp_file}")

    print(f"\n📊 LOCR 结果: 拆分到 losp_vol2/ {split_count} 张, LOCR 目录剩余 {locr_remaining} 张")
    return {'split': split_count, 'remaining': locr_remaining}


def main():
    parser = argparse.ArgumentParser(description='卡图文件重命名 + 辅助包拆分')
    parser.add_argument('--dry-run', action='store_true', help='仅预览，不修改文件')
    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dry_run = args.dry_run

    if dry_run:
        print("🔍 DRY RUN 模式：仅预览，不修改文件\n")
    else:
        print("🚀 执行模式：将实际修改文件\n")

    blzd_result = migrate_blzd(base_dir, dry_run)
    loch_result = migrate_loch(base_dir, dry_run)
    locr_result = migrate_locr(base_dir, dry_run)

    # 汇总报告
    print(f"\n{'=' * 60}")
    print("📊 迁移汇总")
    print("=" * 60)
    print(f"  BLZD: 重命名 {blzd_result['renamed']}, 拆分 BLZDS {blzd_result['split']}, 删除 w200 {blzd_result['deleted']}")
    print(f"  LOCH: 重命名 {loch_result['renamed']}, 拆分 LOSP-vol1 {loch_result['split']}, 删除 w200 {loch_result['deleted']}")
    print(f"  LOCR: 拆分 LOSP-vol2 {locr_result['split']}")

    # 需要用户处理的问题
    all_issues = []
    all_issues.extend(blzd_result.get('missing', []))
    all_issues.extend(loch_result.get('missing_w420', []))
    all_issues.extend(loch_result.get('losp_missing', []))

    if all_issues:
        print(f"\n⚠️ 需要用户处理的问题（{len(all_issues)} 项）:")
        for issue in all_issues:
            print(f"   - {issue}")
    else:
        print(f"\n✅ 无需用户处理的问题")

    if dry_run:
        print(f"\n🔍 以上为预览结果，实际文件未被修改。去掉 --dry-run 参数执行实际迁移。")


if __name__ == '__main__':
    main()
