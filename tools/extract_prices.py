#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 OCR 结果中提取卡片编号、稀有度和价格 (v7 - 合并卡名匹配版)
整合了 v5 的卡名匹配逻辑和 v6 的解析框架

核心策略:
1. 读取 card_ocr_results.json（单卡裁切后的OCR结果）
2. 提取编号、稀有度、价格
3. 编号缺失时：通过 cards.json 卡名匹配（sc_name > nwbbs_n > cn_name）+ 相邻卡片推断
4. 文件名中包含卡包信息（BLZD01_03_card06.png → BLZD）

输入：card_ocr_results.json（OCR原始数据）
输出：parsed_prices_v6.json（结构化价格数据）+ 控制台汇总
"""
import json, re, sys, os
from collections import defaultdict
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OCR_PATH = os.path.join(BASE_DIR, 'test_output', 'card_ocr_results.json')
OUTPUT_PATH = os.path.join(BASE_DIR, 'test_output', 'parsed_prices_v6.json')
SUMMARY_PATH = os.path.join(BASE_DIR, 'test_output', 'price_extract_summary.txt')

# ==============================
# 卡名映射加载（来自 v5）
# ==============================

def _load_cards_db():
    """加载 cards.json 并构建 password -> 卡片数据 的索引"""
    cards_path = os.path.join(BASE_DIR, 'tools', 'db', 'cards.json')
    pw_index = {}
    if os.path.exists(cards_path):
        cards_db = json.load(open(cards_path, 'r', encoding='utf-8'))
        for _cid, card_data in cards_db.items():
            pw = card_data.get('id')
            if pw:
                pw_index[pw] = card_data
    return pw_index


def _resolve_display_name(card, pw_index):
    """获取卡片的集换社显示名称（优先级：sc_name > nwbbs_n > cn_name）"""
    pw = card.get('id')
    db_card = pw_index.get(pw) if pw else None

    sc_name = db_card.get('sc_name') if db_card else None
    nwbbs_n = db_card.get('nwbbs_n') if db_card else None
    cn_name_db = db_card.get('cn_name') if db_card else None
    jp_name_db = db_card.get('jp_name') if db_card else None

    name_hint = card.get('name_hint', '')
    cn_name_ocg = card.get('cardData', {}).get('cn_name', '')
    jp_name_ocg = card.get('cardData', {}).get('jp_name', '')

    display_name = sc_name or nwbbs_n or cn_name_db or name_hint or cn_name_ocg or ''
    jp_name = jp_name_db or jp_name_ocg or ''

    return display_name, jp_name


def _generate_keywords(cn_name, jp_name):
    """生成匹配关键词列表"""
    keywords = []
    if cn_name:
        parts = re.split(r'[-\u2013\u2014\u00b7\s\u3000\u7684\u4e4b\u4e0e\u548c]+', cn_name)
        for p in parts:
            p = p.strip()
            if len(p) >= 2:
                keywords.append(p)
        if len(cn_name) >= 3:
            keywords.append(cn_name)
        for p in parts:
            p = p.strip()
            if len(p) > 3:
                keywords.append(p[:3])
    if jp_name:
        jp_parts = re.split(r'[-\u2013\u2014\u30fb\s\u3000\u306e]+', jp_name)
        for p in jp_parts:
            p = p.strip()
            if len(p) >= 2:
                keywords.append(p)
    return keywords


def load_card_name_map():
    """
    从卡片数据文件加载卡名映射（用于通过 OCR 识别的卡名反向查找编号）
    
    返回: {'LOCH': {编号: {cn_name, jp_name, keywords}}, 'LOSP': {...}, 'BLZD': {...}}
    
    【特殊规则】LOSP 是跨卡包的+1包：
      - LOSP vol1 (JP001~010) 属于 LOCH 的附属包，卡包价格存入 loch_prices.json
      - LOSP vol2 (JP011~020) 属于 LOCR 的附属包，卡包价格存入 locr_prices.json
      - 两个 vol 各自拥有独立的卡包价格，价格随市场动态变化（每次扫描可能不同）
      两个 vol 的卡名映射统一存在 name_map['LOSP'] 中，但价格分别写入对应的价格文件
      TODO: 后续需要在 merge 逻辑中根据编号范围自动分流到对应的价格文件
    """
    name_map = {'LOCH': {}, 'LOCR': {}, 'LOSP': {}, 'BLZD': {}}
    pw_index = _load_cards_db()
    print(f"  cards.json 索引: {len(pw_index)} 条记录")

    def _process_card(card, target_map):
        sn = card.get('setNumber', '')
        if not sn:
            return
        display_name, jp_name = _resolve_display_name(card, pw_index)
        keywords = _generate_keywords(display_name, jp_name)

        pw = card.get('id')
        db_card = pw_index.get(pw) if pw else None
        if db_card:
            alt_names = set()
            for field in ['sc_name', 'nwbbs_n', 'cn_name']:
                val = db_card.get(field)
                if val and val != display_name:
                    alt_names.add(val)
            for alt in alt_names:
                keywords.extend(_generate_keywords(alt, ''))

        name_hint = card.get('name_hint', '')
        if name_hint and name_hint != display_name:
            keywords.extend(_generate_keywords(name_hint, ''))

        keywords = list(dict.fromkeys(keywords))
        target_map[sn] = {
            'cn_name': display_name,
            'jp_name': jp_name,
            'keywords': keywords,
        }

    # 加载 LOCH 系列
    loch_path = os.path.join(BASE_DIR, 'data', 'ocg', 'cards', 'ocg_loch.json')
    if os.path.exists(loch_path):
        loch_data = json.load(open(loch_path, 'r', encoding='utf-8'))
        for card in loch_data.get('cardIds', []):
            _process_card(card, name_map['LOCH'])
        sp = loch_data.get('supplementPack', {})
        for card in sp.get('cards', []):
            _process_card(card, name_map['LOSP'])

    # 加载 LOCR 系列（主包 JP001~080 + LOSP vol2 JP011~020）
    locr_path = os.path.join(BASE_DIR, 'data', 'ocg', 'cards', 'ocg_locr.json')
    if os.path.exists(locr_path):
        locr_data = json.load(open(locr_path, 'r', encoding='utf-8'))
        for card in locr_data.get('cardIds', []):
            _process_card(card, name_map['LOCR'])
        sp = locr_data.get('supplementPack', {})
        for card in sp.get('cards', []):
            _process_card(card, name_map['LOSP'])

    # 加载 LOSP 独立文件（supplementPack 可能为空，LOSP 数据在独立 JSON 中）
    for vol_file in ['ocg_losp_vol1.json', 'ocg_losp_vol2.json']:
        vol_path = os.path.join(BASE_DIR, 'data', 'ocg', 'cards', vol_file)
        if os.path.exists(vol_path):
            vol_data = json.load(open(vol_path, 'r', encoding='utf-8'))
            for card in vol_data.get('cards', []):
                _process_card(card, name_map['LOSP'])

    # 加载 BLZD 系列
    blzd_path = os.path.join(BASE_DIR, 'data', 'ocg', 'cards', 'ocg_blzd.json')
    if os.path.exists(blzd_path):
        blzd_data = json.load(open(blzd_path, 'r', encoding='utf-8'))
        for card in blzd_data.get('cardIds', []):
            _process_card(card, name_map['BLZD'])
        sp = blzd_data.get('supplementPack', {})
        for card in sp.get('cards', []):
            _process_card(card, name_map['BLZD'])

    total = sum(len(m) for m in name_map.values())
    sc_count = sum(1 for pm in name_map.values() for info in pm.values() if info['cn_name'])
    print(f"  卡名覆盖率: {sc_count}/{total} 张卡有显示名称")
    print(f"  卡名映射: LOCH={len(name_map['LOCH'])}, LOCR={len(name_map['LOCR'])}, LOSP={len(name_map['LOSP'])}, BLZD={len(name_map['BLZD'])}")
    return name_map


# ==============================
# 卡名模糊匹配（来自 v5）
# ==============================

def _longest_common_substring_len(s1, s2):
    """计算两个字符串的最长公共子串长度"""
    if not s1 or not s2:
        return 0
    m, n = len(s1), len(s2)
    prev = [0] * (n + 1)
    best = 0
    for i in range(1, m + 1):
        curr = [0] * (n + 1)
        for j in range(1, n + 1):
            if s1[i-1] == s2[j-1]:
                curr[j] = prev[j-1] + 1
                if curr[j] > best:
                    best = curr[j]
        prev = curr
    return best


def _name_overlap(ocr_name, db_name):
    """检查OCR卡名和数据库卡名是否有足够的重叠"""
    if not ocr_name or not db_name:
        return False
    clean_ocr = re.sub(r'[.…\s]', '', ocr_name)
    clean_db = re.sub(r'[.…\s·・－-]', '', db_name)
    if len(clean_ocr) < 2 or len(clean_db) < 2:
        return False
    if clean_ocr in clean_db or clean_db in clean_ocr:
        return True
    lcs = _longest_common_substring_len(clean_ocr, clean_db)
    return lcs >= max(2, min(len(clean_ocr), len(clean_db)) * 0.5)


def fuzzy_match_card_name(ocr_text, pack_code, name_map):
    """通过OCR识别的卡名文本模糊匹配卡片编号"""
    if not ocr_text or len(ocr_text) < 2:
        return None
    clean_text = re.sub(r'[.\u2026\u3002\u3001\uff01!]+$', '', ocr_text).strip()
    if len(clean_text) < 2:
        return None

    pack_map = name_map.get(pack_code, {})
    best_match = None
    best_score = 0

    for set_number, info in pack_map.items():
        score = 0
        cn = info['cn_name']
        jp = info['jp_name']
        cn_nospace = cn.replace(' ', '').replace('\u3000', '').replace('－', '').replace('-', '').replace('·', '').replace('・', '')
        clean_nospace = clean_text.replace(' ', '').replace('\u3000', '').replace('－', '').replace('-', '').replace('·', '').replace('・', '')

        # 完全匹配
        if clean_nospace == cn_nospace or clean_text == cn:
            score = max(score, len(cn) * 5)
        # 子串匹配
        elif clean_nospace in cn_nospace or cn_nospace in clean_nospace:
            score = max(score, len(cn_nospace) * 2)
        elif clean_text in cn or cn in clean_text:
            score = max(score, len(cn) * 2)

        # 前缀匹配
        if cn_nospace.startswith(clean_nospace) and len(clean_nospace) >= 3:
            score = max(score, len(clean_nospace) * 3)
        # 后缀匹配
        if cn_nospace.endswith(clean_nospace) and len(clean_nospace) >= 3:
            score = max(score, len(clean_nospace) * 2)

        # 日语匹配
        if jp and (clean_text in jp or jp in clean_text):
            score = max(score, len(jp) * 2)

        # 关键词匹配
        for kw in info['keywords']:
            if kw in clean_text or clean_text in kw:
                score = max(score, len(kw))
            if kw in clean_nospace:
                score = max(score, len(kw))

        # 字符重叠匹配（LCS）
        if len(clean_nospace) >= 4 and len(cn_nospace) >= 4:
            lcs_len = _longest_common_substring_len(clean_nospace, cn_nospace)
            if lcs_len >= 3 and lcs_len >= len(clean_nospace) * 0.6:
                score = max(score, lcs_len * 1.5)

        if score > best_score and score >= 2:
            best_score = score
            best_match = set_number

    # ===== 宽松匹配模式 =====
    # 当严格匹配全部失败时，尝试移除 OCR 常见误识别字符后重新匹配
    # 典型场景：全角减号"－"被OCR识别为汉字"一"，导致卡名无法匹配
    # 宽松模式额外移除：汉字"一"（U+4E00）
    # 分数乘以 0.8 折扣系数，降低权重避免误匹配正常含"一"的卡名
    if best_score < 2:
        RELAXED_CHARS = '一'  # OCR常误识别的分隔符字符
        for set_number, info in pack_map.items():
            score = 0
            cn = info['cn_name']
            # 宽松清理：在原有基础上额外移除误识别字符
            cn_relaxed = cn.replace(' ', '').replace('\u3000', '').replace('－', '').replace('-', '').replace('·', '').replace('・', '')
            for c in RELAXED_CHARS:
                cn_relaxed = cn_relaxed.replace(c, '')
            ocr_relaxed = clean_text.replace(' ', '').replace('\u3000', '').replace('－', '').replace('-', '').replace('·', '').replace('・', '')
            for c in RELAXED_CHARS:
                ocr_relaxed = ocr_relaxed.replace(c, '')

            if len(ocr_relaxed) < 2 or len(cn_relaxed) < 2:
                continue

            # 子串匹配
            if ocr_relaxed in cn_relaxed or cn_relaxed in ocr_relaxed:
                score = max(score, len(cn_relaxed) * 2)
            # 前缀匹配
            if cn_relaxed.startswith(ocr_relaxed) and len(ocr_relaxed) >= 3:
                score = max(score, len(ocr_relaxed) * 3)
            # LCS匹配
            if len(ocr_relaxed) >= 4 and len(cn_relaxed) >= 4:
                lcs_len = _longest_common_substring_len(ocr_relaxed, cn_relaxed)
                if lcs_len >= 3 and lcs_len >= len(ocr_relaxed) * 0.6:
                    score = max(score, lcs_len * 1.5)

            # 宽松模式分数打折
            score = score * 0.8

            if score > best_score and score >= 2:
                best_score = score
                best_match = set_number

    return best_match


# ==============================
# 多轮编号补充（来自 v5）
# ==============================

def resolve_missing_ids(parsed_cards, name_map):
    """
    解决编号缺失问题（多轮执行）
    
    策略：
    1. 通过卡名模糊匹配推断编号
    2. 通过同一行相邻卡片的编号推断（考虑同一张卡可能占多个位置）
    """
    # 按行分组
    row_groups = defaultdict(list)
    for card in parsed_cards:
        row = card.get('row_filename', '')
        if row:
            row_groups[row].append(card)

    total_resolved = 0

    for round_num in range(3):
        resolved_this_round = 0

        for card in parsed_cards:
            if card['set_number'] is not None and '???' not in card['set_number']:
                continue
            if card.get('is_jpy'):
                continue

            pack = card.get('pack')
            if not pack:
                continue

            # 策略1：通过卡名匹配（附带相邻编号交叉验证）
            if card.get('card_name'):
                matched = fuzzy_match_card_name(card['card_name'], pack, name_map)
                if matched:
                    # 交叉验证：检查同行相邻卡片编号，防止截断卡名导致误匹配
                    # 典型场景：OCR卡名 "契印魔·咏." 同时匹配 JP066(叙圣棺) 和 JP073(咏圣颂)
                    # 但同行左侧卡片已确认为 JP073，说明当前卡也应该是 JP073
                    use_matched = True
                    row = card.get('row_filename', '')
                    card_idx = card.get('card_idx', -1)
                    if row and row in row_groups and card_idx >= 0:
                        siblings = row_groups[row]
                        # 找同行中最近的左侧已确认编号
                        left_confirmed = [s for s in siblings
                                          if s.get('card_idx', -1) >= 0
                                          and s['card_idx'] < card_idx
                                          and s['set_number']
                                          and '???' not in s['set_number']]
                        if left_confirmed:
                            nearest_left = max(left_confirmed, key=lambda s: s['card_idx'])
                            gap = card_idx - nearest_left['card_idx']
                            # 只在相邻（gap<=2）时验证
                            if gap <= 2:
                                m_left = re.match(r'(.+)-JPS?(\d{2,3})$', nearest_left['set_number'])
                                m_matched = re.match(r'(.+)-JPS?(\d{2,3})$', matched)
                                if m_left and m_matched:
                                    left_num = int(m_left.group(2))
                                    matched_num = int(m_matched.group(2))
                                    # 截图中卡片按编号递增排列，同一张卡不同稀有度编号相同
                                    # 纠正条件1: 匹配编号 < 左侧编号（编号倒退，不合理）
                                    # 纠正条件2: 匹配编号和左侧差距 > 2（跳跃太大）
                                    if matched_num < left_num or abs(matched_num - left_num) > 2:
                                        # 放弃卡名匹配，改用左侧编号（同一张卡的不同稀有度）
                                        card['set_number'] = nearest_left['set_number']
                                        card['id_source'] = 'name_match_corrected_by_neighbor'
                                        resolved_this_round += 1
                                        use_matched = False

                    if use_matched:
                        card['set_number'] = matched
                        card['id_source'] = 'name_match'
                        resolved_this_round += 1
                    continue

            # 策略2：通过同一行相邻卡片编号推断
            row = card.get('row_filename', '')
            if row and row in row_groups:
                siblings = row_groups[row]
                card_idx = card.get('card_idx', -1)

                # 收集同行中所有有编号的卡片
                anchors = []
                for sib in siblings:
                    if sib['set_number'] and '???' not in sib['set_number'] and sib.get('card_idx', -1) >= 0:
                        anchors.append(sib)

                if anchors:
                    left_anchors = [a for a in anchors if a['card_idx'] < card_idx]
                    right_anchors = [a for a in anchors if a['card_idx'] > card_idx]

                    if left_anchors:
                        nearest_left = max(left_anchors, key=lambda a: a['card_idx'])
                        gap = card_idx - nearest_left['card_idx']
                        if gap <= 2:
                            inferred_id = nearest_left['set_number']
                            pack_map = name_map.get(pack, {})
                            if inferred_id in pack_map:
                                # 验证：如果卡名匹配，确认是同一张卡
                                if card.get('card_name'):
                                    cn = pack_map[inferred_id].get('cn_name', '')
                                    if cn and (_name_overlap(card['card_name'], cn) or
                                              fuzzy_match_card_name(card['card_name'], pack, name_map) == inferred_id):
                                        card['set_number'] = inferred_id
                                        card['id_source'] = 'same_card_multi_rarity'
                                        resolved_this_round += 1
                                        continue
                                # 没有卡名可验证，尝试用右侧锚点判断
                                if right_anchors:
                                    nearest_right = min(right_anchors, key=lambda a: a['card_idx'])
                                    if nearest_right['set_number'] == inferred_id:
                                        card['set_number'] = inferred_id
                                        card['id_source'] = 'same_card_between'
                                        resolved_this_round += 1
                                        continue
                                    m_left = re.match(r'(.+)-JP(\d{3})$', nearest_left['set_number'])
                                    m_right = re.match(r'(.+)-JP(\d{3})$', nearest_right['set_number'])
                                    if m_left and m_right:
                                        left_num = int(m_left.group(2))
                                        right_num = int(m_right.group(2))
                                        if right_num - left_num > 1 and gap == 1:
                                            card['set_number'] = inferred_id
                                            card['id_source'] = 'same_card_guess'
                                            resolved_this_round += 1
                                            continue
                                else:
                                    card['set_number'] = inferred_id
                                    card['id_source'] = 'same_card_no_right'
                                    resolved_this_round += 1
                                    continue

        total_resolved += resolved_this_round
        if resolved_this_round == 0:
            break

    return total_resolved


# ==============================
# 稀有度识别（从编号行提取）
# ==============================
# 已知稀有度列表（按长度降序匹配，避免 SER 误匹配 PSER）
RARITIES = ['PSER-OF', 'GMR-OF', 'UR-OF', 'PSER', 'UTR', 'SER', 'GMR', 'UR', 'SR', 'CR', 'NR', 'N', 'R']

# OCR 常见误识别修正
RARITY_FIXES = {
    'UK': 'UR',    # K 和 R 形似
    'UR ': 'UR',
    'SR ': 'SR',
    ' N': 'N',
}

def parse_rarity_from_text(text_lines):
    """
    从OCR文本行中解析稀有度
    编号行格式举例：
      完整: BLZD-JP002SR / LOCH-JP001UR
      截断: LOCH-JPO...SER / LOCH...PSER-OF / LOCH-J...UR-OF / BLZD-JP...PSER
      分行: BLZD-JP... | PSER（编号和稀有度分成两行）
    """
    # 将所有文本行合并分析
    all_text = ' '.join([l['text'] for l in text_lines])
    
    # 先尝试在所有文本中查找稀有度
    for rarity in RARITIES:
        # 精确查找（带前后边界）
        pattern = re.escape(rarity)
        if re.search(pattern, all_text, re.IGNORECASE):
            return rarity
    
    return None


def parse_set_number(text_lines, name_map=None):
    """
    从OCR文本行中解析卡片编号（如 LOCH-JP001, BLZD-JP002, BLZD-JPS01）
    
    完整格式: LOCH-JP001UR / BLZD-JP002SR / BLZD-JPS01UR
    截断格式: LOCH-JPO...SER / BLZD-JP...PSER / LOCH-J...UR-OF
    """
    all_text = ' '.join([l['text'] for l in text_lines])
    
    # 1. 尝试匹配完整的编号 XXXX-JP(S)NNN
    #    LOCH-JP001, BLZD-JP002, BLZD-JPS01
    #    注意：编号数字部分至少2位才算完整，1位（如JP0）可能是截断的
    match = re.search(r'((?:LOCH|LOCR|BLZD|LOSP)-JPS?\d{2,3})', all_text, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    
    # 2. 对于 LOSP 系列，编号全部截断，从卡名匹配查找
    if 'LOSP' in all_text.upper() and name_map:
        card_name = text_lines[0]['text'] if text_lines else ''
        matched = fuzzy_match_card_name(card_name, 'LOSP', name_map)
        if matched:
            return matched
    
    # 3. 匹配截断的编号 XXXX-JP... 或 XXXX-JPO... 等
    #    这种情况无法恢复完整编号，返回前缀
    match = re.search(r'((?:LOCH|LOCR|BLZD|LOSP)-JP[S]?)', all_text, re.IGNORECASE)
    if match:
        return match.group(1).upper() + '???'  # 标记为未知编号
    
    return None


def parse_price(text_lines):
    """
    从OCR文本行中解析价格
    价格行格式: ￥0.5起 / ￥310起 / ￥879.99起 / ￥4.35w起 / ￥10w起 / ￥1.5W起
    特殊: ￥-- / ￥- / 4起（缺少￥符号）/ --夫（无效）
    """
    for line in text_lines:
        text = line['text']
        
        # 匹配带w/W的万元价格: ￥4.35w起 / ￥10w起
        match = re.search(r'[￥¥]?\s*(\d+(?:\.\d+)?)\s*[wW]\s*起?', text)
        if match:
            price = float(match.group(1)) * 10000
            return price
        
        # 匹配普通价格: ￥0.5起 / ￥310起 / ￥879.99起
        match = re.search(r'[￥¥]\s*(\d+(?:\.\d+)?)\s*起?', text)
        if match:
            return float(match.group(1))
        
        # 匹配没有￥的价格: 4起 / 0.3起（整行只有价格）
        match = re.match(r'^(\d+(?:\.\d+)?)\s*起\s*$', text.strip())
        if match:
            return float(match.group(1))
    
    # 检查是否是"未收录"标记：￥-- / ￥- / ￥== / --夫 等
    for line in text_lines:
        text = line['text']
        if re.search(r'[￥¥]\s*[-=]{1,2}', text) or re.match(r'^[-=]{1,2}', text.strip()):
            return '未收录'
    
    return None


def parse_rarity_precise(text_lines):
    """
    更精确地从编号行解析稀有度
    需要处理的复杂情况：
    1. 编号行内嵌: BLZD-JP002SR → SR
    2. 截断编号含稀有度后缀: LOCH-JPO...SER → SER
    3. 截断编号含OF后缀: LOCH...PSER-OF → PSER-OF, LOCH-J...UR-OF → UR-OF
    4. 编号和稀有度分行: "BLZD-JP..." + "PSER" → PSER
    5. 编号含空格: BLZD-JP026 N → N, BLZD-JPS06 UR → UR
    """
    # 收集所有可能的编号行（包含 LOCH/LOCR/BLZD/LOSP 关键字的行）
    code_lines = []
    other_lines = []
    for line in text_lines:
        text = line['text'].strip()
        if re.search(r'(?:LOCH|LOCR|BLZD|LOSP)', text, re.IGNORECASE):
            code_lines.append(text)
        else:
            other_lines.append(text)
    
    # 把编号行和紧随其后的独立稀有度行合并
    combined = ' '.join(code_lines + other_lines)
    
    # 按优先级从长到短匹配稀有度
    for rarity in RARITIES:
        # 在编号行之后查找稀有度
        # 支持 ...SER, ...PSER-OF, JP002SR, JP026 N 等格式
        escaped = re.escape(rarity)
        # 匹配：在非字母之后出现的稀有度，或在编号/省略号之后
        if re.search(r'(?:[\d.\s]|\.{2,})' + escaped + r'(?:\s|$|-|\b)', combined, re.IGNORECASE):
            return rarity
        # 作为独立文本出现（分行的情况）
        for text in other_lines:
            if text.strip().upper() == rarity:
                return rarity
    
    # 最后兜底：在所有文本中搜索（排除卡包名中的子串误匹配，如 "LOCR" 中的 "CR"）
    # 先从 combined 中移除卡包编号前缀，避免 LOCR/LOCH/BLZD 等包名干扰
    combined_no_pack = re.sub(r'(?:LOCR|LOCH|LOSP|BLZD|BLZDS)[-—]?JP\d{0,3}', '', combined, flags=re.IGNORECASE)
    for rarity in RARITIES:
        if re.search(r'(?<![A-Z])' + re.escape(rarity) + r'(?![A-Z])', combined_no_pack, re.IGNORECASE):
            return rarity
    
    # 特殊兜底：编号末尾只有单个字母，可能是 N 或 R
    # 如 BLZD-JP035（后面跟着空格或行尾，没有稀有度字母）
    # 检查编号行尾部是否有孤立的稀有度标记
    for text in code_lines:
        # 匹配 JPnnn 后面紧跟的字母（可能有空格）
        m = re.search(r'JP\d{1,3}\s*$', text)
        if m:
            # 编号后没有稀有度，检查 other_lines
            for ot in other_lines:
                ot_stripped = ot.strip().upper()
                for rarity in RARITIES:
                    if ot_stripped == rarity:
                        return rarity
    
    # OCR 误识别修正：如 UK → UR
    for text in code_lines:
        for wrong, correct in RARITY_FIXES.items():
            if wrong.upper() in text.upper():
                # 确认是在编号后面
                if re.search(r'JP\d{0,3}[.]*\s*' + re.escape(wrong.strip()), text, re.IGNORECASE):
                    return correct
    
    # 最终兜底：根据价格推断稀有度（仅对无法识别的情况）
    # 某些卡片编号后确实没有稀有度标记，但根据价格可以推断
    return None


def get_series_prefix(filename, text_lines=None):
    """
    从文件名或 OCR 文本中获取系列前缀
    
    优先级：
    1. 文件名前缀（BLZD/LOCH/LOSP 开头）
    2. OCR 文本中的编号前缀（如 LOCH-JP004UR）
    """
    # 1. 尝试从文件名获取
    if filename.startswith('BLZDS'):
        return 'blzd'  # BLZDS也归入blzd系列
    elif filename.startswith('BLZD'):
        return 'blzd'
    elif filename.startswith('LOCH'):
        return 'loch'
    elif filename.startswith('LOCR'):
        return 'locr'
    elif filename.startswith('LOSP'):
        return 'losp'
    
    # 2. 从 OCR 文本中提取
    if text_lines:
        all_text = ' '.join([l['text'] for l in text_lines])
        if 'LOCH' in all_text.upper():
            return 'loch'
        elif 'LOCR' in all_text.upper():
            return 'locr'
        elif 'LOSP' in all_text.upper():
            return 'losp'
        elif 'BLZD' in all_text.upper():
            return 'blzd'
    
    return None


def is_pack_price(text_lines):
    """判断是否是原盒/原包价格（不是单卡）"""
    all_text = ' '.join([l['text'] for l in text_lines])
    return bool(re.search(r'原盒|原包', all_text))


def is_junk_card(text_lines):
    """判断是否是无效卡片（空白卡、购买提示等）"""
    if not text_lines:
        return True
    all_text = ' '.join([l['text'] for l in text_lines])
    # 空白卡、购买提示、置信度过低的碎片
    if re.match(r'^白$', all_text.strip()):
        return True
    if '购买多张' in all_text:
        return True
    # 所有行置信度都太低
    avg_conf = sum(l['confidence'] for l in text_lines) / len(text_lines)
    if avg_conf < 0.5:
        return True
    return False


def extract_card_name(text_lines):
    """
    从OCR文本行中提取卡名（至少含2个中文字符的文本）
    排除编号行、价格行、无用文本
    """
    card_name = None
    for line in text_lines:
        text = line['text'].strip()
        if not text:
            continue
        # 跳过无用文本
        if any(kw in text for kw in ['集换分', '卡图暂缺', '批量上架', '购买多张']):
            continue
        # 跳过价格行
        if '¥' in text or '￥' in text:
            continue
        # 跳过编号行
        text_upper = text.upper()
        if any(p in text_upper for p in ['LOCH', 'LOCR', 'BLZD', 'LOSP', 'JPY']):
            continue
        # 跳过纯数字
        if re.match(r'^[\d.]+$', text):
            continue
        # 跳过纯稀有度文本
        if text.strip().upper() in ['PSER-OF', 'GMR-OF', 'UR-OF', 'PSER', 'UTR', 'SER', 'GMR', 'UR', 'SR', 'CR', 'NR', 'N', 'R']:
            continue
        # 含中文字符的视为卡名
        if re.search(r'[\u4e00-\u9fff]{2,}', text):
            if card_name is None:
                card_name = text
            elif len(text) > len(card_name):
                card_name = text
    return card_name


def infer_row_from_filename(filename):
    """从单卡文件名提取行文件名（如 BLZD01_03_card06.png → BLZD01_03.png）"""
    m = re.match(r'^(.+)_card\d+\.png$', filename)
    if m:
        return m.group(1) + '.png'
    return None


def infer_card_idx_from_filename(filename):
    """从单卡文件名提取卡片索引（如 BLZD01_03_card06.png → 6）"""
    m = re.search(r'_card(\d+)\.png$', filename)
    if m:
        return int(m.group(1))
    return -1


def infer_set_number_from_context(filename, text_lines, all_data):
    """
    当编号被截断无法解析时，根据上下文推断编号
    原理：同一张卡会有多个不同稀有度的截图，它们在截图中是连续排列的
    如果相邻卡片的编号已知，则可以推断出当前卡的编号
    """
    # 先尝试直接解析
    set_num = parse_set_number(text_lines)
    if set_num and '???' not in set_num:
        return set_num
    
    # 从卡名推断：如果同名卡在其他截图中有完整编号
    card_name = text_lines[0]['text'] if text_lines else ''
    
    # 获取同一截图页中的所有卡片
    page_prefix = filename.rsplit('_card', 1)[0]  # e.g. LOCH01_00
    page_cards = sorted([k for k in all_data.keys() if k.startswith(page_prefix)])
    
    # 尝试从前后卡片推断
    my_idx = page_cards.index(filename) if filename in page_cards else -1
    if my_idx >= 0:
        # 向前找最近的有完整编号的卡
        prev_num = None
        for i in range(my_idx - 1, -1, -1):
            prev_lines = all_data[page_cards[i]].get('text_lines', [])
            num = parse_set_number(prev_lines)
            if num and '???' not in num:
                prev_num = num
                break
        
        # 向后找最近的有完整编号的卡
        next_num = None
        for i in range(my_idx + 1, len(page_cards)):
            next_lines = all_data[page_cards[i]].get('text_lines', [])
            num = parse_set_number(next_lines)
            if num and '???' not in num:
                next_num = num
                break
        
        # 如果前后卡编号相同，则当前卡也是同一编号
        if prev_num and prev_num == next_num:
            return prev_num
        # 如果只有前面的编号
        if prev_num and not next_num:
            return prev_num
        # 如果只有后面的编号
        if next_num and not prev_num:
            return next_num
        # 如果前后编号不同，使用前面的（通常是同一卡的不同稀有度）
        if prev_num:
            return prev_num
    
    return set_num  # 返回原始结果（可能含???）


# ==============================
# 主流程
# ==============================
def main(date_str=None, ocr_path=None, output_path=None, summary_path=None, cut_info_path=None):
    """
    主函数
    date_str: 日期字符串 (YYYYMMDD格式)，如 '20260312'
    ocr_path: OCR结果文件路径（默认使用全局 OCR_PATH）
    output_path: 输出文件路径（默认使用全局 OUTPUT_PATH）
    summary_path: 汇总文件路径（默认使用全局 SUMMARY_PATH）
    cut_info_path: 裁切信息文件路径（默认使用 test_output/card_cut_info.json）
    """
    # 使用传入路径或默认值
    _ocr_path = ocr_path or OCR_PATH
    _output_path = output_path or OUTPUT_PATH
    _summary_path = summary_path or SUMMARY_PATH
    _cut_info_path = cut_info_path or os.path.join(BASE_DIR, 'test_output', 'card_cut_info.json')

    # 加载 OCR 数据
    with open(_ocr_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 处理日期
    if date_str:
        date_display = f'{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}'
    else:
        date_display = datetime.now().strftime('%Y-%m-%d')
    
    print(f'加载 OCR 数据: {len(data)} 张卡片')
    print(f'日期: {date_display}')
    
    # 加载卡名映射（来自 cards.json + ocg_loch.json + ocg_blzd.json）
    print('\n加载卡名映射...')
    name_map = load_card_name_map()
    print(f"  卡名映射: LOCH={len(name_map['LOCH'])}, LOCR={len(name_map['LOCR'])}, LOSP={len(name_map['LOSP'])}, BLZD={len(name_map['BLZD'])}")
    
    # 加载裁切信息（获取卡片索引）
    card_idx_map = {}
    if os.path.exists(_cut_info_path):
        with open(_cut_info_path, 'r', encoding='utf-8') as f:
            cut_info = json.load(f)
        for item in cut_info:
            if item.get('filename'):
                card_idx_map[item['filename']] = item.get('card_idx', -1)
    
    # 解析结果
    # 结构: { "loch": { "LOCH-JP001": { "UR": {"price": 0.5}, "SER": {"price": 2.0} } } }
    parsed = {
        'loch': {},
        'locr': {},
        'blzd': {},
        'losp': {}
    }
    
    # 包价格
    pack_prices = {
        'loch': {},
        'locr': {},
        'blzd': {},
        'losp': {}
    }
    
    # 统计
    stats = {
        'total': 0,
        'parsed': 0,
        'pack': 0,
        'junk': 0,
        'no_number': 0,
        'no_rarity': 0,
        'no_price': 0,
        'duplicates': 0,
        'name_resolved': 0
    }
    
    # 问题记录
    issues = []
    
    # 汇总行
    summary_lines = []
    
    # ===== 第一轮：逐张解析基础信息 =====
    parsed_cards = []
    
    for filename in sorted(data.keys()):
        info = data[filename]
        text_lines = info.get('text_lines', [])
        stats['total'] += 1
        
        # 跳过无效卡片
        if is_junk_card(text_lines):
            stats['junk'] += 1
            continue
        
        series = get_series_prefix(filename, text_lines)
        if not series:
            stats['junk'] += 1
            continue
        
        # 判断是否是原盒/原包
        if is_pack_price(text_lines):
            stats['pack'] += 1
            price = parse_price(text_lines)
            all_text = ' '.join([l['text'] for l in text_lines])
            if '原盒' in all_text and price:
                pack_prices[series]['box'] = price
            elif '原包' in all_text and price:
                pack_prices[series]['pack'] = price
            continue
        
        # 判断是否是JPY原盒标签
        all_text_upper = ' '.join([l['text'] for l in text_lines]).upper()
        is_jpy = 'JPY' in all_text_upper
        if is_jpy:
            continue
        
        # 解析编号（传入name_map支持LOSP卡名匹配）
        set_number = parse_set_number(text_lines, name_map=name_map)
        
        # 解析稀有度
        rarity = parse_rarity_precise(text_lines)
        
        # 解析价格
        price = parse_price(text_lines)
        
        # 提取卡名（用于后续卡名匹配补充编号）
        card_name = extract_card_name(text_lines)
        
        # 推断卡包编码
        pack = series.upper()
        # 【特殊规则】LOSP 是跨卡包的+1包（vol1=001~010归LOCH, vol2=011~020归LOCR）
        # 两个 vol 各自拥有独立的卡包价格，价格随市场动态变化
        # TODO: 后续 merge 时需根据编号范围将价格分流到 loch_prices.json 或 locr_prices.json
        if filename.startswith('LOSP'):
            pack = 'LOSP'
        
        parsed_cards.append({
            'filename': filename,
            'set_number': set_number,
            'rarity': rarity,
            'price': price,
            'card_name': card_name,
            'pack': pack,
            'series': series,
            'row_filename': infer_row_from_filename(filename),
            'card_idx': card_idx_map.get(filename, infer_card_idx_from_filename(filename)),
            'is_jpy': is_jpy,
        })
    
    # 统计初始解析结果
    has_id = sum(1 for c in parsed_cards if c['set_number'] and '???' not in c['set_number'])
    missing_id = sum(1 for c in parsed_cards if not c['set_number'] or '???' in (c['set_number'] or ''))
    print(f'\n===== 初始解析 =====')
    print(f'有效卡片: {len(parsed_cards)} 张')
    print(f'有完整编号: {has_id} 张')
    print(f'编号缺失/截断: {missing_id} 张')
    
    # ===== 第二轮：卡名匹配 + 相邻推断补充缺失编号 =====
    resolved = resolve_missing_ids(parsed_cards, name_map)
    has_id_after = sum(1 for c in parsed_cards if c['set_number'] and '???' not in c['set_number'])
    stats['name_resolved'] = resolved
    print(f'\n===== 编号补充 =====')
    print(f'通过卡名匹配/相邻推断: +{resolved} 张')
    print(f'补充后有编号: {has_id_after}/{len(parsed_cards)} 张')
    
    # ===== 第三轮：上下文推断（兜底，处理剩余的未解析编号）=====
    context_resolved = 0
    for card in parsed_cards:
        if card['set_number'] and '???' not in card['set_number']:
            continue
        # 使用 v6 原有的上下文推断
        inferred = infer_set_number_from_context(card['filename'], 
                                                   data[card['filename']].get('text_lines', []), 
                                                   data)
        if inferred and '???' not in inferred:
            card['set_number'] = inferred
            card['id_source'] = 'context_infer'
            context_resolved += 1
    
    if context_resolved > 0:
        print(f'通过上下文推断: +{context_resolved} 张')
    
    # ===== 汇总到最终结构 =====
    for card in parsed_cards:
        set_number = card['set_number']
        rarity = card['rarity']
        price = card['price']
        series = card['series']
        
        if not set_number or '???' in set_number:
            stats['no_number'] += 1
            all_text = ' | '.join([l['text'] for l in data[card['filename']].get('text_lines', [])])
            issues.append(f'[无编号] {card["filename"]}: {all_text}')
            continue
        
        if not rarity:
            # 尝试通过价格反推稀有度：如果该编号已有某个稀有度的价格与当前价格完全一致
            if price is not None and price != '未收录' and set_number in parsed[series]:
                for existing_r, existing_v in parsed[series][set_number].items():
                    if existing_v.get('price') == price:
                        rarity = existing_r
                        break
            # 硬修复兜底：对已确认的特定卡片直接赋予稀有度
            if not rarity:
                hardfix = {
                    ('BLZD-JP035', 0.3): 'R',
                    ('LOCH-JP046', 3.8): 'CR',
                    ('LOCH-JP071', 0.5): 'UTR',
                }
                rarity = hardfix.get((set_number, price))
            if not rarity:
                stats['no_rarity'] += 1
                all_text = ' | '.join([l['text'] for l in data[card['filename']].get('text_lines', [])])
                issues.append(f'[无稀有度] {card["filename"]}: {all_text} → 编号={set_number}')
                continue
        
        if price is None:
            stats['no_price'] += 1
            all_text = ' | '.join([l['text'] for l in data[card['filename']].get('text_lines', [])])
            issues.append(f'[无价格] {card["filename"]}: {all_text} → {set_number} {rarity}')
            continue
        
        # 处理"未收录"标记
        if price == '未收录':
            target = parsed[series]
            if set_number not in target:
                target[set_number] = {}
            if rarity not in target[set_number]:
                target[set_number][rarity] = {'price': '未收录'}
            stats['parsed'] += 1
            summary_lines.append(f'{set_number} {rarity}: 未收录')
            continue
        
        # 写入解析结果（去重：同一编号同一稀有度取最低价）
        target = parsed[series]
        if set_number not in target:
            target[set_number] = {}
        
        if rarity in target[set_number]:
            old_price = target[set_number][rarity]['price']
            if old_price != price and old_price != '未收录':
                stats['duplicates'] += 1
                price = min(old_price, price)
        
        target[set_number][rarity] = {'price': price}
        stats['parsed'] += 1
        
        summary_lines.append(f'{set_number} {rarity}: ￥{price}')
    
    # 输出统计
    print(f'\n===== 解析统计 =====')
    print(f'总计: {stats["total"]} 张')
    print(f'成功解析: {stats["parsed"]} 条价格')
    print(f'包价格: {stats["pack"]} 条')
    print(f'无效/空白: {stats["junk"]} 张')
    print(f'无编号: {stats["no_number"]} 张')
    print(f'无稀有度: {stats["no_rarity"]} 张')
    print(f'无价格: {stats["no_price"]} 张')
    print(f'重复(取低价): {stats["duplicates"]} 条')
    print(f'卡名/推断补充: {stats["name_resolved"]} 张')
    
    # 输出各系列统计
    print(f'\n===== 各系列解析结果 =====')
    for s in ['loch', 'locr', 'blzd', 'losp']:
        cards = parsed[s]
        total_prices = sum(len(v) for v in cards.values())
        print(f'{s.upper()}: {len(cards)} 张卡, {total_prices} 条价格')
        if pack_prices[s]:
            print(f'  包价格: {pack_prices[s]}')
    
    # 输出问题列表
    if issues:
        print(f'\n===== 问题列表 ({len(issues)} 条) =====')
        for issue in issues:
            print(f'  {issue}')
    
    # 保存 parsed_prices_v6.json
    output = {
        '_说明': '集换社价格OCR解析结果 (v7 合并卡名匹配版)',
        '_日期': date_display,
        '_备注': '从 card_ocr_results.json OCR 数据自动提取，支持 sc_name > nwbbs_n > cn_name 三级卡名匹配',
        'pack_prices': pack_prices,
    }
    output.update(parsed)
    
    with open(_output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f'\n已保存到: {_output_path}')
    
    # 保存汇总文件
    summary_output = []
    summary_output.append(f'价格提取汇总 - 共 {stats["parsed"]} 条价格 (v7 合并卡名匹配版)')
    summary_output.append('=' * 80)
    summary_output.append('')
    
    for s in ['loch', 'locr', 'blzd', 'losp']:
        cards = parsed[s]
        if not cards:
            continue
        summary_output.append(f'### {s.upper()} 系列')
        summary_output.append('-' * 60)
        
        if pack_prices[s]:
            for ptype, pprice in pack_prices[s].items():
                summary_output.append(f'  [包] {ptype}: ￥{pprice}')
            summary_output.append('')
        
        for set_num in sorted(cards.keys()):
            rarities = cards[set_num]
            prices_str = ', '.join([f'{r}=￥{v["price"]}' for r, v in sorted(rarities.items())])
            summary_output.append(f'  {set_num}: {prices_str}')
        
        summary_output.append('')
    
    # 添加问题列表
    if issues:
        summary_output.append(f'### 问题列表 ({len(issues)} 条)')
        summary_output.append('-' * 60)
        for issue in issues:
            summary_output.append(f'  {issue}')
        summary_output.append('')
    
    with open(_summary_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(summary_output))
    print(f'汇总已保存到: {_summary_path}')


if __name__ == '__main__':
    main()
