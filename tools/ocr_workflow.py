#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCR价格更新一键工作流 (v4 - 预重命名版)

整合 截图重命名 → 行裁切 → 单卡裁切 → 单卡OCR → 结构化解析 → 合并到价格JSON 的完整流程。

行裁切方案：card_rect_cutter.py（基于OpenCV Canny边缘检测+卡图矩形定位，115px精确裁切）
OCR引擎：PaddleOCR PP-OCRv5 Server 高精度模型

优化点（v5）：
  - 新增 step_rename：先统一对所有截图做OCR识别卡包前缀并重命名
  - step_cut 不再需要OCR，纯OpenCV裁切，速度大幅提升
  - 流程更清晰：重命名和裁切职责分离
  - 移除行级OCR步骤：单卡裁切不依赖行级OCR结果，直接十等分裁切

使用方法:
  # 一键完整流程
  python tools/ocr_workflow.py 20260309

  # 分步执行（共6步）
  python tools/ocr_workflow.py 20260309 --step rename     # 仅重命名截图（OCR识别卡包）
  python tools/ocr_workflow.py 20260309 --step cut        # 仅裁切截图为行图
  python tools/ocr_workflow.py 20260309 --step card_cut   # 仅单卡裁切
  python tools/ocr_workflow.py 20260309 --step ocr_cards  # 仅单卡OCR
  python tools/ocr_workflow.py 20260309 --step parse      # 仅解析价格
  python tools/ocr_workflow.py 20260309 --step merge      # 仅合并到价格文件

  # 从某一步开始执行到最后
  python tools/ocr_workflow.py 20260309 --from card_cut   # 从单卡裁切开始执行

注意:
  - 需要使用 Python 3.11 虚拟环境运行: local/venv/Scripts/python.exe
  - 需要 PaddleOCR + GPU 环境（RTX 4060 推荐）
  - 截图需提前放入 local/OCRPics/<日期>/ 目录
  - 截图分辨率必须为 2064x2752 ppi264（MuMu模拟器）
"""

# ===== 抑制无关警告 =====
import os
os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'

import warnings
warnings.filterwarnings('ignore', message='urllib3.*doesn\'t match a supported version')
warnings.filterwarnings('ignore', message='No ccache found')

import argparse
import re
import sys
import time
from datetime import datetime

# 项目根目录
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 期望的截图分辨率
EXPECTED_WIDTH = 2064
EXPECTED_HEIGHT = 2752


def print_banner(title):
    """打印分隔横幅"""
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}\n")


def clean_test_output():
    """
    清理 test_output 目录中的历史数据
    
    在执行新的 OCR 流程前，清理旧的中间文件，避免数据混用
    """
    import shutil
    
    test_output_dir = os.path.join(BASE_DIR, 'test_output')
    
    # 需要清理的目录和文件
    dirs_to_clean = ['row_pics', 'card_pics']
    files_to_clean = [
        'card_ocr_results.json',
        'card_cut_info.json',
        'parsed_prices_v6.json',
        'price_comparison.csv',
        'price_extract_summary.txt',
    ]
    
    print("🧹 清理历史数据...")
    
    # 清理目录
    for dir_name in dirs_to_clean:
        dir_path = os.path.join(test_output_dir, dir_name)
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path)
            print(f"   ✅ 已删除目录: {dir_name}/")
    
    # 清理文件
    for file_name in files_to_clean:
        file_path = os.path.join(test_output_dir, file_name)
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"   ✅ 已删除文件: {file_name}")
    
    print("   ✅ 历史数据清理完成\n")


def check_screenshots(date_str):
    """
    检查截图目录是否存在，并验证分辨率
    
    返回: (截图目录路径, 截图文件列表)
    """
    pic_dir = os.path.join(BASE_DIR, 'local', 'OCRPics', date_str)
    
    if not os.path.exists(pic_dir):
        print(f"❌ 截图目录不存在: {pic_dir}")
        print(f"   请先将集换社截图放入该目录")
        sys.exit(1)
    
    # 获取PNG文件列表
    files = sorted([f for f in os.listdir(pic_dir) if f.lower().endswith('.png')])
    if not files:
        print(f"❌ 截图目录为空: {pic_dir}")
        sys.exit(1)
    
    print(f"📁 截图目录: {pic_dir}")
    print(f"📸 找到 {len(files)} 张截图")
    
    # 检查分辨率
    try:
        from PIL import Image
    except ImportError:
        print("⚠️ 未安装 Pillow，跳过分辨率检查")
        return pic_dir, files
    
    bad_files = []
    for f in files:
        img = Image.open(os.path.join(pic_dir, f))
        w, h = img.size
        if w != EXPECTED_WIDTH or h != EXPECTED_HEIGHT:
            bad_files.append((f, w, h))
        img.close()
    
    if bad_files:
        print(f"\n⚠️ 以下截图分辨率不正确（期望 {EXPECTED_WIDTH}x{EXPECTED_HEIGHT}）:")
        for f, w, h in bad_files:
            print(f"   {f}: {w}x{h}")
        print(f"\n   请在MuMu模拟器中调整分辨率为 {EXPECTED_WIDTH}x{EXPECTED_HEIGHT} ppi264")
        
        # 如果全部不正确，退出
        if len(bad_files) == len(files):
            sys.exit(1)
        
        # 部分不正确，询问是否继续
        print(f"   {len(files) - len(bad_files)} 张截图分辨率正确，继续处理...")
    else:
        print(f"✅ 所有截图分辨率正确 ({EXPECTED_WIDTH}x{EXPECTED_HEIGHT})")
    
    return pic_dir, files


def _detect_pack_from_filename(filename):
    """
    从文件名提取卡包前缀
    
    支持格式:
      - 以卡包名开头: LOCH01.png, BLZD02.png, BLZDS01.png, LOSP01.png
      - MuMu模拟器默认命名: MuMu-20260312-xxx.png（返回None，需OCR识别）
    """
    fn = filename.upper()
    for prefix in ['BLZDS', 'BLZD', 'LOCH', 'LOSP']:
        if fn.startswith(prefix):
            return prefix
    return None


def _detect_pack_from_ocr(ocr_items):
    """
    从OCR结果自动检测卡包类型
    
    对整张截图做一次快速OCR，通过编号文本判断卡包前缀。
    
    返回: 'LOCH', 'BLZD', 'BLZDS', 'LOSP' 或 'UNKNOWN'
    其中 'BLZD' 为主包(BLZD-JPXXX), 'BLZDS' 为+1辅助包(BLZD-JPSXX)
    """
    pack_counts = {'LOCH': 0, 'BLZD': 0, 'LOSP': 0}
    blzd_sub_count = 0
    blzd_main_count = 0
    
    for item in ocr_items:
        text = item.get('text', '').upper()
        for pack in pack_counts:
            if pack in text:
                pack_counts[pack] += 1
        # 对BLZD进一步区分主包和辅助包
        if 'BLZD' in text:
            if re.search(r'BLZD[-—]?JPS\d', text):
                blzd_sub_count += 1
            elif re.search(r'BLZD[-—]?JP\d', text):
                blzd_main_count += 1
    
    if max(pack_counts.values()) == 0:
        return 'UNKNOWN'
    best_pack = max(pack_counts, key=pack_counts.get)
    
    # 如果是BLZD，进一步判断是主包还是辅助包
    if best_pack == 'BLZD' and blzd_sub_count > blzd_main_count:
        return 'BLZDS'
    
    return best_pack


# 全局OCR引擎缓存（避免重复初始化，节省大量时间）
_pack_ocr_engine = None


def _get_pack_ocr_engine():
    """获取或创建用于卡包前缀识别的OCR引擎（单例）"""
    global _pack_ocr_engine
    if _pack_ocr_engine is not None:
        return _pack_ocr_engine
    
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        print("❌ 未安装 PaddleOCR")
        return None
    
    print("  正在初始化PP-OCRv5 Server引擎...")
    _pack_ocr_engine = PaddleOCR(
        text_detection_model_name='PP-OCRv5_server_det',
        text_recognition_model_name='PP-OCRv5_server_rec',
        use_textline_orientation=True,
    )
    print("  ✅ PP-OCRv5 Server引擎初始化完成")
    return _pack_ocr_engine


def _quick_ocr_for_pack(img_path):
    """
    对整张截图做一次快速OCR以识别卡包前缀
    
    使用 PP-OCRv5 Server 高精度模型（复用全局引擎）。
    返回: (卡包前缀, ocr_items列表)
    """
    ocr = _get_pack_ocr_engine()
    if ocr is None:
        return 'UNKNOWN', []
    
    results = ocr.predict(img_path)
    items = []
    if results:
        for r in results:
            texts = r.get('rec_texts', [])
            for text in texts:
                items.append({'text': text})
    
    pack = _detect_pack_from_ocr(items)
    return pack, items


def step_rename(date_str):
    """
    步骤1: 批量OCR识别卡包前缀 + 重命名原始截图
    
    对所有未命名的截图（MuMu默认命名等）做一次OCR识别卡包前缀，
    然后按卡包分组编号重命名为 {PACK}{序号}.png（如 LOCH01.png、BLZD03.png、BLZDS01.png）
    
    已经以卡包名开头的截图会跳过OCR，直接保留。
    """
    print_banner("步骤 1/6: 截图重命名（OCR识别卡包前缀）")
    
    pic_dir = os.path.join(BASE_DIR, 'local', 'OCRPics', date_str)
    screenshots = sorted([f for f in os.listdir(pic_dir) if f.lower().endswith('.png')])
    print(f"📂 找到 {len(screenshots)} 张截图")
    
    # 第一轮：确定每张截图的卡包前缀
    pack_list = []  # [(原始文件名, 卡包前缀)]
    need_ocr = []   # 需要OCR识别的截图索引
    
    for i, filename in enumerate(screenshots):
        pack = _detect_pack_from_filename(filename)
        if pack is not None:
            print(f"  ✅ {filename} → 已识别卡包: {pack}（从文件名）")
        else:
            need_ocr.append(i)
        pack_list.append((filename, pack))
    
    # 对需要OCR的截图批量识别
    if need_ocr:
        print(f"\n📋 有 {len(need_ocr)} 张截图需要OCR识别卡包前缀...")
        for idx in need_ocr:
            filename = pack_list[idx][0]
            img_path = os.path.join(pic_dir, filename)
            print(f"  🔍 [{need_ocr.index(idx)+1}/{len(need_ocr)}] OCR识别 {filename}...")
            pack, _ = _quick_ocr_for_pack(img_path)
            if pack == 'UNKNOWN':
                print(f"    ⚠️ 无法自动识别，标记为UNKNOWN")
            else:
                print(f"    → 识别为: {pack}")
            pack_list[idx] = (filename, pack)
    
    # 第二轮：按卡包分组编号重命名
    # 统计每个卡包的序号计数器
    pack_counters = {}  # {卡包前缀: 当前序号}
    rename_plan = []    # [(旧文件名, 新文件名, 卡包前缀)]
    
    for filename, pack in pack_list:
        if pack not in pack_counters:
            pack_counters[pack] = 1
        else:
            pack_counters[pack] += 1
        
        new_name = f"{pack}{pack_counters[pack]:02d}.png"
        
        if filename == new_name:
            # 文件名已经正确，无需重命名
            rename_plan.append((filename, new_name, pack, False))
        else:
            rename_plan.append((filename, new_name, pack, True))
    
    # 检查是否有重名冲突
    new_names = [r[1] for r in rename_plan]
    if len(new_names) != len(set(new_names)):
        print("\n❌ 重命名方案有重名冲突！请检查截图文件。")
        # 显示冲突
        from collections import Counter
        conflicts = {n: c for n, c in Counter(new_names).items() if c > 1}
        for name, count in conflicts.items():
            print(f"   {name}: 出现 {count} 次")
        sys.exit(1)
    
    # 执行重命名（分两步：先全部改为临时名，再改为目标名，避免覆盖）
    need_rename = [(old, new, pack) for old, new, pack, changed in rename_plan if changed]
    
    if not need_rename:
        print("\n✅ 所有截图文件名已正确，无需重命名")
    else:
        print(f"\n📝 执行重命名（{len(need_rename)} 张）...")
        
        # 第一步：先全部改为临时名（避免 A→B, B→C 时覆盖）
        temp_names = []
        for old_name, new_name, pack in need_rename:
            temp_name = f"_tmp_rename_{old_name}"
            old_path = os.path.join(pic_dir, old_name)
            temp_path = os.path.join(pic_dir, temp_name)
            os.rename(old_path, temp_path)
            temp_names.append((temp_name, new_name))
        
        # 第二步：从临时名改为目标名
        for temp_name, new_name in temp_names:
            temp_path = os.path.join(pic_dir, temp_name)
            new_path = os.path.join(pic_dir, new_name)
            os.rename(temp_path, new_path)
        
        # 打印重命名结果
        for old_name, new_name, pack in need_rename:
            print(f"   {old_name} → {new_name}")
    
    # 统计
    by_pack = {}
    for _, _, pack, _ in rename_plan:
        by_pack[pack] = by_pack.get(pack, 0) + 1
    
    print(f"\n📊 重命名完成: 共 {len(rename_plan)} 张截图")
    for pack, count in sorted(by_pack.items()):
        print(f"   {pack}: {count} 张")


def step_cut(date_str):
    """
    步骤2: 裁切截图为行级图片（纯OpenCV，不含OCR）
    
    基于OpenCV卡图矩形定位（card_rect_cutter.py）
    - 使用Canny边缘检测 + 轮廓查找定位卡图矩形（~154×224px）
    - 裁切范围: card_bottom+10 ~ card_bottom+125，总高度115px
    - 卡包前缀直接从文件名提取（需先运行 step_rename）
    """
    print_banner("步骤 2/6: 裁切截图为行图（OpenCV矩形定位）")
    
    import json
    
    # 导入裁切模块
    sys.path.insert(0, os.path.join(BASE_DIR, 'tools'))
    import card_rect_cutter
    
    pic_dir = os.path.join(BASE_DIR, 'local', 'OCRPics', date_str)
    output_dir = os.path.join(BASE_DIR, 'test_output')
    row_pics_dir = os.path.join(output_dir, 'row_pics')
    os.makedirs(row_pics_dir, exist_ok=True)
    
    # 清理旧的裁切图片
    old_rows = [f for f in os.listdir(row_pics_dir) if f.endswith('.png')]
    if old_rows:
        for f in old_rows:
            os.remove(os.path.join(row_pics_dir, f))
        print(f"🧹 清理旧裁切图片 {len(old_rows)} 张")
    
    # 获取截图文件列表
    screenshots = sorted([f for f in os.listdir(pic_dir) if f.lower().endswith('.png')])
    print(f"📂 找到 {len(screenshots)} 张截图")
    
    all_crops = []
    
    for idx, filename in enumerate(screenshots, 1):
        img_path = os.path.join(pic_dir, filename)
        
        # 直接从文件名提取卡包前缀（需先运行 step_rename）
        pack = _detect_pack_from_filename(filename)
        if pack is None:
            print(f"  ⚠️ 截图{filename}文件名无法识别卡包前缀，请先运行 --step rename")
            pack = 'UNKNOWN'
        
        # 构造裁切图的命名前缀: 直接使用文件名（不含后缀）
        source_name = os.path.splitext(filename)[0]
        
        # === 使用card_rect_cutter进行裁切 ===
        saved = card_rect_cutter.process_screenshot(
            img_path, row_pics_dir, source_name, debug=True
        )
        
        # 收集裁切信息
        for item in saved:
            item['pack'] = pack
            item['screenshot_idx'] = idx
            item['screenshot_filename'] = filename
        
        all_crops.extend(saved)
    
    # 保存裁切信息到 crop_info.json
    crop_info_path = os.path.join(output_dir, 'crop_info.json')
    with open(crop_info_path, 'w', encoding='utf-8') as f:
        json.dump(all_crops, f, ensure_ascii=False, indent=2)
    print(f"\n💾 裁切信息已保存: {crop_info_path}")
    
    # 统计
    by_pack = {}
    for c in all_crops:
        pack = c.get('pack', 'UNKNOWN')
        by_pack[pack] = by_pack.get(pack, 0) + 1
    
    print(f"\n📊 裁切完成: 共 {len(all_crops)} 行")
    for pack, count in sorted(by_pack.items()):
        print(f"   {pack}: {count} 行")
    
    return all_crops


def step_card_cut():
    """
    步骤3: 将行级图片裁切为单卡图片
    
    按十等分裁切，自动排除空白卡位。
    """
    print_banner("步骤 3/6: 单卡裁切")
    
    sys.path.insert(0, os.path.join(BASE_DIR, 'tools'))
    import card_cutter
    
    card_cutter.process_all_rows(BASE_DIR)


def step_ocr_cards():
    """
    步骤4: 使用PaddleOCR批量识别单卡图片
    
    单卡OCR精度远高于行级OCR（编号识别完美，无变体错误）
    速度也更快（~0.04s/张 vs ~0.58s/行）
    """
    print_banner("步骤 4/6: 单卡OCR识别")
    
    import json
    
    card_pics_dir = os.path.join(BASE_DIR, 'test_output', 'card_pics')
    results_path = os.path.join(BASE_DIR, 'test_output', 'card_ocr_results.json')
    cut_info_path = os.path.join(BASE_DIR, 'test_output', 'card_cut_info.json')
    
    # 获取所有单卡图片
    files = sorted([f for f in os.listdir(card_pics_dir) if f.endswith('.png')])
    if not files:
        print("❌ 没有找到单卡图片，请先运行 card_cut 步骤")
        sys.exit(1)
    
    # 加载裁切信息
    row_map = {}
    if os.path.exists(cut_info_path):
        with open(cut_info_path, 'r', encoding='utf-8') as f:
            cut_info = json.load(f)
        for item in cut_info:
            if item.get('filename'):
                row_map[item['filename']] = item.get('row_filename', '')
    
    # 加载已有结果
    all_results = {}
    if os.path.exists(results_path):
        with open(results_path, 'r', encoding='utf-8') as f:
            all_results = json.load(f)
    
    pending = [f for f in files if f not in all_results]
    print(f"总计 {len(files)} 张单卡图, 已处理 {len(files)-len(pending)}, 待处理 {len(pending)}")
    
    if not pending:
        print("✅ 全部已处理完成!")
        return
    
    # 初始化PaddleOCR
    print("正在初始化PaddleOCR...")
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        print("❌ 未安装 PaddleOCR")
        sys.exit(1)
    
    ocr = PaddleOCR(
        text_detection_model_name='PP-OCRv5_server_det',
        text_recognition_model_name='PP-OCRv5_server_rec',
        use_textline_orientation=True,
    )
    print("✅ PaddleOCR初始化完成（PP-OCRv5 Server 高精度模型）")
    
    start_time = time.time()
    
    for i, filename in enumerate(pending):
        filepath = os.path.join(card_pics_dir, filename)
        t0 = time.time()
        
        results = ocr.predict(filepath)
        
        items = []
        if results:
            for r in results:
                texts = r.get('rec_texts', [])
                scores = r.get('rec_scores', [])
                polys = r.get('dt_polys', [])
                for idx in range(len(texts)):
                    box = polys[idx].tolist() if idx < len(polys) and hasattr(polys[idx], 'tolist') else [[0,0],[0,0],[0,0],[0,0]]
                    items.append({
                        'text': texts[idx],
                        'confidence': round(float(scores[idx]), 4) if idx < len(scores) else 0,
                        'bbox': [
                            int(min(p[0] for p in box)),
                            int(min(p[1] for p in box)),
                            int(max(p[0] for p in box)),
                            int(max(p[1] for p in box)),
                        ]
                    })
        
        total_conf = sum(it['confidence'] for it in items) / len(items) if items else 0
        
        all_results[filename] = {
            'text_lines': items,
            'confidence': round(total_conf, 4),
            'row_filename': row_map.get(filename, ''),
        }
        
        elapsed = time.time() - t0
        if (i + 1) % 50 == 0 or i == 0 or i == len(pending) - 1:
            print(f"  [{i+1}/{len(pending)}] {filename}: {len(items)} lines, {elapsed:.2f}s")
        
        if (i + 1) % 100 == 0:
            with open(results_path, 'w', encoding='utf-8') as f:
                json.dump(all_results, f, ensure_ascii=False, indent=2)
    
    with open(results_path, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    
    total_time = time.time() - start_time
    print(f"\n✅ 单卡OCR完成! 共 {len(all_results)} 条结果, 耗时 {total_time:.1f}s")


def step_parse(date_str):
    """
    步骤5: 解析OCR数据为结构化价格
    
    调用 extract_prices.py 的 main() (v7 合并卡名匹配版)
    """
    print_banner("步骤 5/6: 解析价格数据")
    
    sys.path.insert(0, os.path.join(BASE_DIR, 'tools'))
    import extract_prices
    
    extract_prices.main(date_str)


def step_merge(date_str):
    """
    步骤6: 合并到价格JSON文件
    
    调用 merge_prices.py 的 main()
    """
    print_banner("步骤 6/6: 合并到价格文件")
    
    sys.path.insert(0, os.path.join(BASE_DIR, 'tools'))
    import merge_prices
    
    merge_prices.main()


def main():
    parser = argparse.ArgumentParser(
        description='OCR价格更新一键工作流 (v5 精简版)',
        epilog='''
使用示例:
  python tools/ocr_workflow.py 20260309                   # 一键完整流程（6步）
  python tools/ocr_workflow.py 20260309 --step rename     # 仅重命名截图（OCR识别卡包）
  python tools/ocr_workflow.py 20260309 --step cut        # 仅裁切截图（纯OpenCV）
  python tools/ocr_workflow.py 20260309 --step card_cut   # 仅单卡裁切
  python tools/ocr_workflow.py 20260309 --step ocr_cards  # 仅单卡OCR
  python tools/ocr_workflow.py 20260309 --step parse      # 仅解析价格
  python tools/ocr_workflow.py 20260309 --step merge      # 仅合并到价格文件
  python tools/ocr_workflow.py 20260309 --from card_cut   # 从单卡裁切开始执行到最后
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('date', help='截图日期目录名 (如 20260309)')
    parser.add_argument('--step', choices=['rename', 'cut', 'card_cut', 'ocr_cards', 'parse', 'merge'],
                       help='仅执行指定步骤')
    parser.add_argument('--from', dest='from_step', choices=['rename', 'cut', 'card_cut', 'ocr_cards', 'parse', 'merge'],
                       help='从指定步骤开始执行到最后')
    
    args = parser.parse_args()
    date_str = args.date
    
    # 验证日期格式
    try:
        datetime.strptime(date_str, '%Y%m%d')
    except ValueError:
        print(f"❌ 日期格式错误: {date_str}，期望格式: YYYYMMDD (如 20260309)")
        sys.exit(1)
    
    # 确保 test_output 目录存在
    os.makedirs(os.path.join(BASE_DIR, 'test_output'), exist_ok=True)
    
    print_banner(f"OCR价格更新工作流 v5 (精简版)  日期: {date_str}")
    
    # 检查截图
    check_screenshots(date_str)
    
    # 清理历史数据（仅在完整流程或从 rename/cut 开始时执行，避免删除部分步骤需要的数据）
    if args.step is None or args.step in ('rename', 'cut'):
        clean_test_output()
    
    # 确定要执行的步骤
    all_steps = ['rename', 'cut', 'card_cut', 'ocr_cards', 'parse', 'merge']
    
    if args.step:
        steps_to_run = [args.step]
        print(f"🔧 模式: 仅执行 [{args.step}] 步骤\n")
    elif args.from_step:
        start_idx = all_steps.index(args.from_step)
        steps_to_run = all_steps[start_idx:]
        print(f"🔧 模式: 从 [{args.from_step}] 开始执行 → {' → '.join(steps_to_run)}\n")
    else:
        steps_to_run = all_steps
        print(f"🔧 模式: 完整流程 rename → cut → card_cut → ocr_cards → parse → merge\n")
    
    total_start = time.time()
    
    # 执行步骤
    step_map = {
        'rename': lambda: step_rename(date_str),
        'cut': lambda: step_cut(date_str),
        'card_cut': lambda: step_card_cut(),
        'ocr_cards': lambda: step_ocr_cards(),
        'parse': lambda: step_parse(date_str),
        'merge': lambda: step_merge(date_str),
    }
    
    for step_name in steps_to_run:
        step_map[step_name]()
    
    total_time = time.time() - total_start
    
    # 完成摘要
    print_banner("工作流完成")
    print(f"  📅 日期: {date_str}")
    print(f"  ⏱️  总耗时: {total_time:.1f}s")
    print(f"  📂 输出目录: {os.path.join(BASE_DIR, 'test_output')}")
    
    if 'merge' in steps_to_run:
        print(f"\n  📊 请检查价格对照表:")
        print(f"     {os.path.join(BASE_DIR, 'test_output', 'price_comparison.csv')}")
        print(f"\n  确认无误后执行:")
        print(f"     git add data/ocg/prices/")
        print(f'     git commit -m "更新卡片市场价格 ({date_str[:4]}-{date_str[4:6]}-{date_str[6:]})"')
        print(f"     git push origin main")


if __name__ == '__main__':
    main()
