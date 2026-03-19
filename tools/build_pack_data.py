#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_pack_data.py — OCG 卡包数据构建脚本

【功能说明】
从 tools/db/cards.json（YGOCDB 全量卡牌数据库）提取卡牌详情，
注入到 data/ocg/cards/*.json 卡包文件中，使网页运行时无需调用任何 API。

【使用方法】
  python build_pack_data.py                  # 构建所有 OCG 卡包
  python build_pack_data.py ocg_blzd         # 只构建指定卡包
  python build_pack_data.py --check          # 检查哪些卡在 cards.json 中找不到
  python build_pack_data.py --info           # 查看 cards.json 统计信息

【数据流】
  cards.json (12MB 全量数据) + ocg_blzd.json (id+稀有度)
      ↓
  ocg_blzd.json (增强版：id+稀有度+完整卡牌信息)

【输出格式】
  每张卡的 cardsData 节点包含：
  - cn_name: 中文名
  - jp_name: 日文名
  - en_name: 英文名
  - jp_ruby: 日文假名（振假名）
  - desc: 中文效果描述
  - types: 类型描述字符串（如 "[怪兽|效果] 龙/光\\n[★8] 3000/2500"）
  - atk: 攻击力
  - def: 防御力
  - level: 等级/阶级/LINK数
  - race: 种族（数值编码）
  - attribute: 属性（数值编码）
  - type: 卡牌类型（数值编码）
"""

import json
import os
import sys
import time


# ====== 路径配置 ======
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))  # tools/
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)                # 项目根目录
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
COMMON_CARDS_PATH = os.path.join(SCRIPT_DIR, 'db', 'cards.json')
OCG_PACKS_PATH = os.path.join(DATA_DIR, 'ocg', 'packs.json')
OCG_CARDS_DIR = os.path.join(DATA_DIR, 'ocg', 'cards')


def load_cards_db():
    """
    加载 cards.json 全量卡牌数据库
    返回两个映射：
      - by_id: { 卡牌密码(int) → 卡牌数据(dict) }
      - by_cid: { cid(int) → 卡牌数据(dict) }
    """
    print(f'📂 正在加载 cards.json ...')
    start = time.time()

    with open(COMMON_CARDS_PATH, 'r', encoding='utf-8') as f:
        raw = json.load(f)

    by_id = {}   # 卡牌密码 → 数据
    by_cid = {}  # cid → 数据

    for cid_str, card in raw.items():
        card_id = card.get('id')
        cid = card.get('cid')
        if card_id:
            by_id[int(card_id)] = card
        if cid:
            by_cid[int(cid)] = card

    elapsed = time.time() - start
    print(f'✅ cards.json 加载完成：{len(by_id)} 张卡（耗时 {elapsed:.1f}s）')
    return by_id, by_cid


def extract_card_details(card_db_entry):
    """
    从 cards.json 的一条记录中提取网页需要的卡牌详情
    """
    text = card_db_entry.get('text', {})
    data = card_db_entry.get('data', {})

    return {
        'cn_name': card_db_entry.get('cn_name', ''),
        'jp_name': card_db_entry.get('jp_name', ''),
        'en_name': card_db_entry.get('en_name', ''),
        'jp_ruby': card_db_entry.get('jp_ruby', ''),
        'desc': text.get('desc', ''),
        'pdesc': text.get('pdesc', ''),
        'types': text.get('types', ''),
        'atk': data.get('atk'),
        'def': data.get('def'),
        'level': data.get('level'),
        'race': data.get('race'),
        'attribute': data.get('attribute'),
        'type': data.get('type'),
        'ot': data.get('ot'),
        'cid': card_db_entry.get('cid'),
    }


def build_pack(pack_file, by_id, dry_run=False):
    """
    为单个卡包文件注入卡牌详情数据

    参数:
      pack_file: 卡包文件路径（如 data/ocg/cards/ocg_blzd.json）
      by_id: 卡牌密码 → 卡牌数据的映射
      dry_run: 只检查不写入

    返回:
      (found_count, missing_count, missing_ids)
    """
    with open(pack_file, 'r', encoding='utf-8') as f:
        pack_data = json.load(f)

    card_ids = pack_data.get('cardIds', [])
    if not card_ids:
        print(f'  ⚠️ 卡包中没有 cardIds，跳过')
        return 0, 0, []

    found = 0
    missing = 0
    missing_ids = []

    # 为每张卡注入详情
    for card_def in card_ids:
        card_id = card_def.get('id')
        if not card_id:
            continue

        db_entry = by_id.get(int(card_id))
        if db_entry:
            # 注入卡牌详情到 cardDef 中
            details = extract_card_details(db_entry)
            card_def['cardData'] = details
            found += 1
        else:
            missing += 1
            missing_ids.append(card_id)

    # 同样处理辅助包（supplementPack）
    supp = pack_data.get('supplementPack', {})
    supp_cards = supp.get('cards', [])
    for card_def in supp_cards:
        card_id = card_def.get('id')
        if not card_id:
            continue

        db_entry = by_id.get(int(card_id))
        if db_entry:
            details = extract_card_details(db_entry)
            card_def['cardData'] = details
            found += 1
        else:
            missing += 1
            missing_ids.append(card_id)

    if not dry_run:
        # 写回文件
        with open(pack_file, 'w', encoding='utf-8') as f:
            json.dump(pack_data, f, ensure_ascii=False, indent=2)

    return found, missing, missing_ids


def cmd_build(target_pack=None):
    """
    构建卡包数据（主命令）
    """
    # 加载全量卡牌数据库
    by_id, by_cid = load_cards_db()

    # 加载 OCG 卡包配置
    with open(OCG_PACKS_PATH, 'r', encoding='utf-8') as f:
        packs_config = json.load(f)

    packs = packs_config.get('packs', [])

    if target_pack:
        # 只构建指定卡包
        packs = [p for p in packs if p.get('packId') == target_pack or p.get('cardFile', '').replace('.json', '') == target_pack]
        if not packs:
            print(f'❌ 未找到卡包: {target_pack}')
            print(f'   可用的卡包: {", ".join(p["packId"] for p in packs_config["packs"])}')
            sys.exit(1)

    total_found = 0
    total_missing = 0
    all_missing = []

    for pack in packs:
        card_file = pack.get('cardFile')
        if not card_file:
            print(f'  ⚠️ {pack["packId"]}: 没有 cardFile，跳过')
            continue

        file_path = os.path.join(OCG_CARDS_DIR, card_file)
        if not os.path.exists(file_path):
            print(f'  ⚠️ {pack["packId"]}: 文件不存在 {file_path}，跳过')
            continue

        print(f'\n📦 处理卡包: {pack["packName"]} ({pack["packId"]})')
        print(f'   文件: {card_file}')

        found, missing, missing_ids = build_pack(file_path, by_id)

        total_found += found
        total_missing += missing
        all_missing.extend(missing_ids)

        print(f'   ✅ 找到: {found} 张')
        if missing > 0:
            print(f'   ⚠️ 缺失: {missing} 张')
            for mid in missing_ids:
                print(f'      - ID: {mid}')

    # 汇总
    print(f'\n{"=" * 50}')
    print(f'📊 构建完成汇总:')
    print(f'   处理卡包: {len(packs)} 个')
    print(f'   成功注入: {total_found} 张卡牌')
    if total_missing > 0:
        print(f'   ⚠️ 缺失: {total_missing} 张（在 cards.json 中找不到）')
        print(f'   缺失 ID: {all_missing}')
        print(f'   💡 提示: 这些卡可能是最新发售的，需要更新 cards.json')
    else:
        print(f'   🎉 所有卡牌数据完整，无缺失！')


def cmd_check(target_pack=None):
    """
    检查哪些卡在 cards.json 中找不到（不修改文件）
    """
    by_id, _ = load_cards_db()

    with open(OCG_PACKS_PATH, 'r', encoding='utf-8') as f:
        packs_config = json.load(f)

    packs = packs_config.get('packs', [])
    if target_pack:
        packs = [p for p in packs if p.get('packId') == target_pack]

    for pack in packs:
        card_file = pack.get('cardFile')
        if not card_file:
            continue

        file_path = os.path.join(OCG_CARDS_DIR, card_file)
        if not os.path.exists(file_path):
            continue

        print(f'\n📦 检查卡包: {pack["packName"]}')
        found, missing, missing_ids = build_pack(file_path, by_id, dry_run=True)
        print(f'   找到: {found}, 缺失: {missing}')
        for mid in missing_ids:
            print(f'   ❌ 缺失 ID: {mid}')


def cmd_info():
    """
    显示 cards.json 统计信息
    """
    by_id, by_cid = load_cards_db()
    print(f'\n📊 cards.json 统计:')
    print(f'   卡牌总数（按密码）: {len(by_id)}')
    print(f'   卡牌总数（按 cid）: {len(by_cid)}')

    # 统计有中文名的卡
    cn_count = sum(1 for card in by_id.values() if card.get('cn_name'))
    jp_count = sum(1 for card in by_id.values() if card.get('jp_name'))
    en_count = sum(1 for card in by_id.values() if card.get('en_name'))
    print(f'   有中文名: {cn_count}')
    print(f'   有日文名: {jp_count}')
    print(f'   有英文名: {en_count}')


def main():
    if len(sys.argv) < 2:
        # 默认：构建所有卡包
        cmd_build()
        return

    arg = sys.argv[1]

    if arg == '--check':
        target = sys.argv[2] if len(sys.argv) > 2 else None
        cmd_check(target)
    elif arg == '--info':
        cmd_info()
    elif arg == '--help' or arg == '-h':
        print(__doc__)
    else:
        # 构建指定卡包
        cmd_build(arg)


if __name__ == '__main__':
    main()
