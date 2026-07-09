#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCR价格更新一键工作流 (v6 - 卡包+日期隔离版)

整合 截图归档 → 截图重命名 → 行裁切 → 单卡裁切 → 单卡OCR → 结构化解析 的完整流程。

目录结构:
  截图目录: local/OCRPricePics/<卡包>/<日期>/sources/
  中间产物: test_output/<卡包>/<日期>/01_rows/
            test_output/<卡包>/<日期>/02_cards/
            test_output/<卡包>/<日期>/03_ocr_results.json
            test_output/<卡包>/<日期>/04_parsed_prices.json
            test_output/<卡包>/<日期>/06_price_comparison.csv
            ...

行裁切方案：card_rect_cutter.py（基于OpenCV Canny边缘检测+卡图矩形定位，115px精确裁切）
OCR引擎：PaddleOCR PP-OCRv5 Server 高精度模型

使用方法:
  # 指定卡包+日期，完整流程（不含organize和merge）
  python tools/ocr_workflow.py --pack BLZDS --date 20260321

  # 分步执行（共8步）
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step organize   # 归档截图到日期目录
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step rename     # 重命名截图（OCR识别卡包）
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step cut        # 裁切截图为行图
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step card_cut   # 单卡裁切
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step ocr_cards  # 单卡OCR
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step parse      # 解析价格
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step review     # 审核价格（输出需确认项）
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step merge      # 合并到价格文件

  # 从某一步开始执行到最后
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --from card_cut

注意:
  - 需要使用 Python 3.11 虚拟环境运行: local/venv/Scripts/python.exe
  - 需要 PaddleOCR + GPU 环境
  - 截图需提前放入 local/OCRPricePics/<卡包>/ 目录（organize步骤会按日期归档）
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
import shutil
import sys
import time
from datetime import datetime

# 项目根目录
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 期望的截图分辨率
EXPECTED_WIDTH = 2064
EXPECTED_HEIGHT = 2752

# 支持的卡包列表（按长度降序排列，避免 BLZD 先匹配 BLZDS）
SUPPORTED_PACKS = ['BLZDS', 'BLZD', 'LOCH', 'LOCR', 'LOSP-Vol2', 'LOSP-Vol1']

# 输出子目录/文件名（编号前缀，流程顺序一目了然）
ROWS_DIR = '01_rows'
CARDS_DIR = '02_cards'
OCR_RESULTS_FILE = '03_ocr_results.json'
PARSED_PRICES_FILE = '04_parsed_prices.json'
REVIEW_REPORT_FILE = '05_review_report.txt'
PRICE_COMPARISON_FILE = '06_price_comparison.csv'
CARD_CUT_INFO_FILE = 'card_cut_info.json'  # 裁切元信息（OCR步骤需要）

# 截图根目录
PICS_ROOT = os.path.join(BASE_DIR, 'local', 'OCRPricePics')


def print_banner(title):
    """打印分隔横幅"""
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print(f"{'=' * 70}\n")


def _extract_date_from_filename(filename):
    """
    从截图文件名中提取日期

    支持格式:
      - MuMu模拟器: MuMu-20260321-004001-592.png → 20260321
      - 已重命名: BLZDS01.png → None（无法提取，需要从目录推断）
    """
    m = re.search(r'(\d{8})', filename)
    if m:
        date_str = m.group(1)
        try:
            datetime.strptime(date_str, '%Y%m%d')
            return date_str
        except ValueError:
            pass
    return None


def get_sources_dir(pack, date_str):
    """获取截图源文件目录: local/OCRPricePics/<卡包>/<日期>/sources/"""
    return os.path.join(PICS_ROOT, pack, date_str, 'sources')


def get_pics_dir(pack, date_str):
    """获取截图目录路径: local/OCRPricePics/<卡包>/<日期>/（兼容旧接口）"""
    return os.path.join(PICS_ROOT, pack, date_str)


def get_output_dir(pack, date_str):
    """获取中间产物目录路径: test_output/<卡包>/<日期>/"""
    return os.path.join(BASE_DIR, 'test_output', pack, date_str)


def clean_test_output(pack, date_str):
    """
    清理指定卡包+日期的中间产物目录

    在执行新的 OCR 流程前，清理旧的中间文件，避免数据混用
    """
    output_dir = get_output_dir(pack, date_str)

    if not os.path.exists(output_dir):
        print("🧹 无历史数据需要清理")
        return

    # 需要清理的目录和文件
    dirs_to_clean = [ROWS_DIR, CARDS_DIR]
    files_to_clean = [
        OCR_RESULTS_FILE,
        CARD_CUT_INFO_FILE,
        'crop_info.json',
        PARSED_PRICES_FILE,
        PRICE_COMPARISON_FILE,
        'price_extract_summary.txt',
    ]

    print("🧹 清理历史数据...")

    # 清理目录
    for dir_name in dirs_to_clean:
        dir_path = os.path.join(output_dir, dir_name)
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path)
            print(f"   ✅ 已删除目录: {dir_name}/")

    # 清理文件
    for file_name in files_to_clean:
        file_path = os.path.join(output_dir, file_name)
        if os.path.exists(file_path):
            os.remove(file_path)
            print(f"   ✅ 已删除文件: {file_name}")

    print("   ✅ 历史数据清理完成\n")


def check_screenshots(pack, date_str):
    """
    检查截图目录是否存在，并验证分辨率

    返回: (截图目录路径, 截图文件列表)
    """
    pic_dir = get_sources_dir(pack, date_str)

    if not os.path.exists(pic_dir):
        print(f"❌ 截图目录不存在: {pic_dir}")
        print(f"   请将截图放入 local/OCRPricePics/{pack}/{date_str}/sources/ 目录")
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
        print(f"\n⚠️ 以下截图分辨率不正确（期望 {EXPECTED_WIDTH}x{EXPECTED_HEIGHT} 或其旋转）:")
        for f, w, h in bad_files:
            print(f"   {f}: {w}x{h}")
        print(f"\n   请在MuMu模拟器中调整分辨率为 {EXPECTED_WIDTH}x{EXPECTED_HEIGHT} ppi264")

        # 如果全部不正确，退出
        if len(bad_files) == len(files):
            sys.exit(1)

        # 部分不正确，继续处理正确的
        print(f"   {len(files) - len(bad_files)} 张截图分辨率正确，继续处理...")
    else:
        print(f"✅ 所有截图分辨率正确 ({EXPECTED_WIDTH}x{EXPECTED_HEIGHT})")

    return pic_dir, files


def _detect_pack_from_filename(filename):
    """
    从文件名提取卡包前缀

    支持格式:
      - 以卡包名开头: LOCH01.png, BLZD02.png, BLZDS01.png, LOSP-Vol201.png
      - MuMu模拟器默认命名: MuMu-20260312-xxx.png（返回None，需OCR识别）
    """
    fn = filename.upper()
    for prefix in SUPPORTED_PACKS:
        if fn.startswith(prefix):
            return prefix
    return None


def _detect_pack_from_ocr(ocr_items):
    """
    从OCR结果自动检测卡包类型

    对整张截图做一次快速OCR，通过编号文本判断卡包前缀。

    返回: 'LOCH', 'BLZD', 'BLZDS', 'LOSP-Vol1', 'LOSP-Vol2', 'LOCR' 或 'UNKNOWN'
    其中 'BLZD' 为主包(BLZD-JPXXX), 'BLZDS' 为+1辅助包(BLZD-JPSXX)
    """
    pack_counts = {'LOCH': 0, 'BLZD': 0, 'LOSP': 0, 'LOCR': 0}
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


def step_organize(pack, date_str):
    """
    步骤0: 将卡包目录下的截图按日期归档到 sources/ 子目录

    扫描 local/OCRPricePics/<卡包>/ 目录下的 .png 截图，
    从文件名提取日期，移动到 <卡包>/<日期>/sources/ 子目录下。

    如果指定了 date_str，只处理该日期的截图。
    """
    print_banner(f"步骤 0: 截图归档（{pack} → 按日期分目录）")

    pack_dir = os.path.join(PICS_ROOT, pack)
    if not os.path.exists(pack_dir):
        print(f"❌ 卡包目录不存在: {pack_dir}")
        sys.exit(1)

    # 扫描卡包目录下直接存放的截图（不扫描子目录）
    screenshots = [f for f in os.listdir(pack_dir)
                   if f.lower().endswith('.png') and os.path.isfile(os.path.join(pack_dir, f))]
    screenshots.sort()

    if not screenshots:
        print(f"📂 {pack}/ 下没有需要归档的截图（可能已归档完毕）")
        return

    print(f"📂 找到 {len(screenshots)} 张待归档截图")

    moved = 0
    skipped = 0
    for filename in screenshots:
        file_date = _extract_date_from_filename(filename)
        if not file_date:
            print(f"  ⚠️ 无法从文件名提取日期: {filename}，跳过")
            skipped += 1
            continue

        # 如果指定了日期，只处理该日期的截图
        if date_str and file_date != date_str:
            print(f"  ⏭️ {filename} 日期={file_date}，不匹配目标日期{date_str}，跳过")
            skipped += 1
            continue

        # 创建日期+sources目录并移动
        sources_dir = os.path.join(pack_dir, file_date, 'sources')
        os.makedirs(sources_dir, exist_ok=True)

        src = os.path.join(pack_dir, filename)
        dst = os.path.join(sources_dir, filename)
        if os.path.exists(dst):
            print(f"  ⚠️ 目标已存在: {file_date}/sources/{filename}，跳过")
            skipped += 1
            continue

        shutil.move(src, dst)
        print(f"  📦 {filename} → {pack}/{file_date}/sources/")
        moved += 1

    print(f"\n📊 归档完成: 移动 {moved} 张，跳过 {skipped} 张")


def step_rename(pack, date_str):
    """
    步骤1: 批量OCR识别卡包前缀 + 重命名原始截图

    对所有未命名的截图（MuMu默认命名等）做一次OCR识别卡包前缀，
    然后按卡包分组编号重命名为 {PACK}{序号}.png（如 BLZDS01.png）

    已经以卡包名开头的截图会跳过OCR，直接保留。
    """
    print_banner(f"步骤 1: 截图重命名（{pack}/{date_str}）")

    pic_dir = get_sources_dir(pack, date_str)
    screenshots = sorted([f for f in os.listdir(pic_dir) if f.lower().endswith('.png')])
    print(f"📂 找到 {len(screenshots)} 张截图")

    # 第一轮：确定每张截图的卡包前缀
    # rename 步骤始终使用 --pack 参数指定的卡包名，无需 OCR
    # OCR 识别卡包前缀仅用于未指定 --pack 的场景（保留函数但当前不调用）
    pack_list = []  # [(原始文件名, 卡包前缀)]

    for i, filename in enumerate(screenshots):
        detected = _detect_pack_from_filename(filename)
        if detected is None:
            detected = pack  # 无法从文件名识别时直接使用 --pack 参数
        pack_list.append((filename, detected))
        print(f"  ✅ {filename} → 卡包: {detected}")

    # 第二轮：按卡包分组编号重命名
    pack_counters = {}
    rename_plan = []

    for filename, detected_pack in pack_list:
        # 使用目录指定的卡包名（而非OCR识别的），保持一致性
        use_pack = pack
        if use_pack not in pack_counters:
            pack_counters[use_pack] = 1
        else:
            pack_counters[use_pack] += 1

        new_name = f"{use_pack}{pack_counters[use_pack]:02d}.png"

        if filename == new_name:
            rename_plan.append((filename, new_name, use_pack, False))
        else:
            rename_plan.append((filename, new_name, use_pack, True))

    # 检查是否有重名冲突
    new_names = [r[1] for r in rename_plan]
    if len(new_names) != len(set(new_names)):
        print("\n❌ 重命名方案有重名冲突！请检查截图文件。")
        from collections import Counter
        conflicts = {n: c for n, c in Counter(new_names).items() if c > 1}
        for name, count in conflicts.items():
            print(f"   {name}: 出现 {count} 次")
        sys.exit(1)

    # 执行重命名
    need_rename = [(old, new, p) for old, new, p, changed in rename_plan if changed]

    if not need_rename:
        print("\n✅ 所有截图文件名已正确，无需重命名")
    else:
        print(f"\n📝 执行重命名（{len(need_rename)} 张）...")

        # 第一步：先全部改为临时名（避免覆盖）
        temp_names = []
        for old_name, new_name, p in need_rename:
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

        for old_name, new_name, p in need_rename:
            print(f"   {old_name} → {new_name}")

    # 统计
    print(f"\n📊 重命名完成: 共 {len(rename_plan)} 张截图 ({pack})")


def step_cut(pack, date_str):
    """
    步骤2: 裁切截图为行级图片（纯OpenCV，不含OCR）

    基于OpenCV卡图矩形定位（card_rect_cutter.py）
    """
    print_banner(f"步骤 2: 裁切截图为行图（{pack}/{date_str}）")

    import json

    sys.path.insert(0, os.path.join(BASE_DIR, 'tools'))
    import card_rect_cutter

    pic_dir = get_sources_dir(pack, date_str)
    output_dir = get_output_dir(pack, date_str)
    row_pics_dir = os.path.join(output_dir, ROWS_DIR)
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

        # 直接从文件名提取卡包前缀
        detected = _detect_pack_from_filename(filename)
        if detected is None:
            print(f"  ⚠️ 截图{filename}文件名无法识别卡包前缀，请先运行 --step rename")
            detected = pack

        # 构造裁切图的命名前缀
        source_name = os.path.splitext(filename)[0]

        # 使用card_rect_cutter进行裁切
        saved = card_rect_cutter.process_screenshot(
            img_path, row_pics_dir, source_name, debug=True
        )

        for item in saved:
            item['pack'] = detected
            item['screenshot_idx'] = idx
            item['screenshot_filename'] = filename

        all_crops.extend(saved)

    # 保存裁切信息
    crop_info_path = os.path.join(output_dir, 'crop_info.json')
    with open(crop_info_path, 'w', encoding='utf-8') as f:
        json.dump(all_crops, f, ensure_ascii=False, indent=2)
    print(f"\n💾 裁切信息已保存: {crop_info_path}")

    # 统计
    print(f"\n📊 裁切完成: 共 {len(all_crops)} 行 ({pack}/{date_str})")

    return all_crops


def step_card_cut(pack, date_str):
    """
    步骤3: 将行级图片裁切为单卡图片

    按十等分裁切，自动排除空白卡位。
    """
    print_banner(f"步骤 3: 单卡裁切（{pack}/{date_str}）")

    sys.path.insert(0, os.path.join(BASE_DIR, 'tools'))
    import card_cutter

    output_dir = get_output_dir(pack, date_str)
    row_pics_dir = os.path.join(output_dir, ROWS_DIR)
    card_pics_dir = os.path.join(output_dir, CARDS_DIR)

    card_cutter.process_all_rows(BASE_DIR, row_pics_dir=row_pics_dir, card_pics_dir=card_pics_dir, output_dir=output_dir)


def step_ocr_cards(pack, date_str):
    """
    步骤4: 使用PaddleOCR批量识别单卡图片
    """
    print_banner(f"步骤 4: 单卡OCR识别（{pack}/{date_str}）")

    import json

    output_dir = get_output_dir(pack, date_str)
    card_pics_dir = os.path.join(output_dir, CARDS_DIR)
    results_path = os.path.join(output_dir, OCR_RESULTS_FILE)
    cut_info_path = os.path.join(output_dir, CARD_CUT_INFO_FILE)

    # 获取所有单卡图片
    if not os.path.exists(card_pics_dir):
        print("❌ 单卡图片目录不存在，请先运行 card_cut 步骤")
        sys.exit(1)

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


def step_parse(pack, date_str):
    """
    步骤5: 解析OCR数据为结构化价格

    调用 extract_prices.py 的 main() (v7 合并卡名匹配版)
    """
    print_banner(f"步骤 5: 解析价格数据（{pack}/{date_str}）")

    sys.path.insert(0, os.path.join(BASE_DIR, 'tools'))
    import extract_prices

    output_dir = get_output_dir(pack, date_str)
    ocr_path = os.path.join(output_dir, OCR_RESULTS_FILE)
    output_path = os.path.join(output_dir, PARSED_PRICES_FILE)
    summary_path = os.path.join(output_dir, 'price_extract_summary.txt')
    cut_info_path = os.path.join(output_dir, CARD_CUT_INFO_FILE)

    extract_prices.main(date_str,
                        ocr_path=ocr_path,
                        output_path=output_path,
                        summary_path=summary_path,
                        cut_info_path=cut_info_path)


def _should_flag_price(old_price, new_price):
    """
    判断价格变动是否需要人工确认

    规则（兼顾绝对变动和相对变动）:
    - 绝对变动 < 2元 → 直接放行
    - 绝对变动 ≥ 10元 → 无条件标记
    - 绝对变动 ≥ 5元 且 相对变动 ≥ 30% → 标记
    - 绝对变动 ≥ 2元 且 相对变动 ≥ 50% → 标记
    - 其他 → 放行

    返回: (是否标记, 标记原因)
    """
    if old_price is None or new_price is None:
        return False, ''
    if old_price == 0 and new_price == 0:
        return False, ''

    abs_change = abs(new_price - old_price)
    # 计算相对变动（以旧价格为基准，旧价为0则以新价为基准）
    base = old_price if old_price > 0 else new_price
    rel_change = abs_change / base if base > 0 else 0

    # 规则1: 小额波动，直接放行
    if abs_change < 2:
        return False, ''

    # 规则2: 巨额变动，无条件标记
    if abs_change >= 10:
        return True, f'绝对变动¥{abs_change:.1f} (≥10元)'

    # 规则3: 大额变动 + 中等相对变动
    if abs_change >= 5 and rel_change >= 0.30:
        return True, f'变动¥{abs_change:.1f} / {rel_change*100:.0f}% (≥5元且≥30%)'

    # 规则4: 中额变动 + 大相对变动
    if abs_change >= 2 and rel_change >= 0.50:
        return True, f'变动¥{abs_change:.1f} / {rel_change*100:.0f}% (≥2元且≥50%)'

    return False, ''


def step_review(pack, date_str):
    """
    步骤5.5: 价格审核（不写入文件，仅终端输出需确认项）

    加载OCR解析结果与现有价格文件，对比新旧价格，
    标记波动异常、置信率低、规则拦截项。终端输出审核报告。
    """
    print_banner(f"步骤 5.5: 价格审核（{pack}/{date_str}）")

    import json

    output_dir = get_output_dir(pack, date_str)
    parsed_path = os.path.join(output_dir, PARSED_PRICES_FILE)
    ocr_results_path = os.path.join(output_dir, OCR_RESULTS_FILE)

    if not os.path.exists(parsed_path):
        print("❌ 找不到解析结果，请先运行 parse 步骤")
        sys.exit(1)

    with open(parsed_path, 'r', encoding='utf-8') as f:
        ocr_data = json.load(f)

    # 加载OCR置信度数据（用于低置信度检测）
    ocr_confidence = {}
    if os.path.exists(ocr_results_path):
        with open(ocr_results_path, 'r', encoding='utf-8') as f:
            ocr_raw = json.load(f)
        for filename, info in ocr_raw.items():
            ocr_confidence[filename] = info.get('confidence', 1.0)

    # 加载现有价格文件
    loch_prices_path = os.path.join(BASE_DIR, 'data', 'ocg', 'prices', 'loch_prices.json')
    locr_prices_path = os.path.join(BASE_DIR, 'data', 'ocg', 'prices', 'locr_prices.json')
    blzd_prices_path = os.path.join(BASE_DIR, 'data', 'ocg', 'prices', 'blzd_prices.json')

    with open(loch_prices_path, 'r', encoding='utf-8') as f:
        loch_prices = json.load(f)
    with open(locr_prices_path, 'r', encoding='utf-8') as f:
        locr_prices = json.load(f)
    with open(blzd_prices_path, 'r', encoding='utf-8') as f:
        blzd_prices = json.load(f)

    # 建立 setNumber → 旧价格映射
    old_prices_map = {}  # setNumber → {rarity: price}
    for prices_file in [loch_prices, locr_prices, blzd_prices]:
        for card_key, card_info in prices_file.get('cards', {}).items():
            # card_key 就是 setNumber（如 BLZD-JP001）
            sn = card_key
            if not sn:
                continue
            old_prices_map[sn] = card_info.get('prices', {})

    # 建立 setNumber → 卡名映射
    card_name_map = {}
    for prices_file in [loch_prices, locr_prices, blzd_prices]:
        for card_key, card_info in prices_file.get('cards', {}).items():
            sn = card_key
            if not sn:
                continue
            card_name_map[sn] = card_info.get('name', '')

    # 从OCR解析结果中提取新价格
    # parsed_prices_v6.json 结构: {loch: {setNumber: {rarity: price|entry}}, blzd: {...}, losp: {...}}
    flagged_items = []  # [(编号, 卡名, 稀有度, 旧价, 新价, 原因)]
    auto_pass_items = []  # 自动通过的项目
    new_card_items = []   # 全新卡片（旧数据中没有）
    rule_blocked = []     # 被异常规则拦截的项目

    PRICE_NOT_LISTED = "未收录"

    def _get_price(entry):
        """从OCR条目提取价格值"""
        if isinstance(entry, dict):
            if 'gmr_asia' in entry:
                asia = entry.get('gmr_asia')
                if asia is not None:
                    return asia
            return entry.get('price')
        return entry

    # 遍历所有卡包的OCR数据
    for pack_key in ['loch', 'locr', 'losp', 'blzd']:
        ocr_cards = ocr_data.get(pack_key, {})
        for set_number, rarities in ocr_cards.items():
            old_prices = old_prices_map.get(set_number, {})
            card_name = card_name_map.get(set_number, '???')

            for rarity, entry in rarities.items():
                new_price = _get_price(entry)

                # 跳过未收录
                if new_price == PRICE_NOT_LISTED or new_price is None:
                    continue

                old_price = old_prices.get(rarity)

                # 全新卡片（旧数据中没有这个编号或这个稀有度）
                if old_price is None:
                    new_card_items.append((set_number, card_name, rarity, None, new_price, '新卡/新稀有度'))
                    continue

                # 异常规则检测（来自 merge_prices.py 的规则）
                blocked = False
                block_reason = ''

                # LOCH 规则
                if set_number.startswith('LOCH-') or set_number.startswith('LOSP-'):
                    if rarity == 'GMR-OF' and new_price < 1000:
                        blocked = True
                        block_reason = 'GMR-OF价格<1000，疑似异常'
                    elif rarity in ('UR', 'SR', 'R', 'N') and new_price > 100:
                        blocked = True
                        block_reason = f'基础稀有度{rarity}价格>100，疑似异常'
                    elif rarity == 'N':
                        blocked = True
                        block_reason = 'LOCH无N稀有度'

                # LOCR 规则（同LOCH，全稀有度包）
                if set_number.startswith('LOCR-'):
                    if rarity == 'GMR-OF' and new_price < 1000:
                        blocked = True
                        block_reason = 'GMR-OF价格<1000，疑似异常'
                    elif rarity in ('UR', 'SR') and new_price > 100:
                        blocked = True
                        block_reason = f'基础稀有度{rarity}价格>100，疑似异常'

                # BLZD 规则
                if set_number.startswith('BLZD-'):
                    if rarity in ('N', 'R') and new_price > 5:
                        blocked = True
                        block_reason = f'{rarity}价格>5，疑似异常'
                    elif rarity == 'SR' and new_price > 50:
                        blocked = True
                        block_reason = 'SR价格>50，疑似异常'
                    elif rarity == 'PSER' and new_price < 1:
                        blocked = True
                        block_reason = 'PSER价格<1，疑似异常'

                if blocked:
                    rule_blocked.append((set_number, card_name, rarity, old_price, new_price, block_reason))
                    continue

                # 价格波动检测
                should_flag, reason = _should_flag_price(old_price, new_price)
                if should_flag:
                    flagged_items.append((set_number, card_name, rarity, old_price, new_price, reason))
                else:
                    auto_pass_items.append((set_number, card_name, rarity, old_price, new_price))

    # 检查OCR低置信度（平均置信度 < 0.85 的单卡）
    low_conf_items = []
    for filename, conf in ocr_confidence.items():
        if conf < 0.85:
            low_conf_items.append((filename, conf))

    # ===== 终端输出审核报告 =====
    print(f"📊 审核统计:")
    print(f"   自动通过: {len(auto_pass_items)} 条")
    print(f"   需确认(价格波动): {len(flagged_items)} 条")
    print(f"   需确认(规则拦截): {len(rule_blocked)} 条")
    print(f"   新卡/新稀有度: {len(new_card_items)} 条")
    print(f"   低置信度单卡: {len(low_conf_items)} 张")

    total_review = len(flagged_items) + len(rule_blocked)

    if total_review == 0 and len(new_card_items) == 0 and len(low_conf_items) == 0:
        print(f"\n✅ 所有价格变动均在正常范围内，可直接执行 merge 步骤")
        return

    # 输出需确认的价格波动
    if flagged_items:
        print(f"\n{'─' * 80}")
        print(f"⚠️  价格波动需确认 ({len(flagged_items)} 条)")
        print(f"{'─' * 80}")
        print(f"{'编号':17s} {'卡名':20s} {'稀有度':10s} {'旧价':>10s} {'新价':>10s} {'原因'}")
        print(f"{'─' * 80}")
        for sn, name, rarity, old_p, new_p, reason in sorted(flagged_items):
            display_name = name[:18] if len(name) > 18 else name
            print(f"{sn:17s} {display_name:20s} {rarity:10s} {'¥'+str(old_p):>10s} {'¥'+str(new_p):>10s} {reason}")

    # 输出规则拦截项
    if rule_blocked:
        print(f"\n{'─' * 80}")
        print(f"🚫 规则拦截项 ({len(rule_blocked)} 条) — 将保留旧值，除非人工覆盖")
        print(f"{'─' * 80}")
        print(f"{'编号':17s} {'卡名':20s} {'稀有度':10s} {'旧价':>10s} {'OCR价':>10s} {'拦截原因'}")
        print(f"{'─' * 80}")
        for sn, name, rarity, old_p, new_p, reason in sorted(rule_blocked):
            display_name = name[:18] if len(name) > 18 else name
            old_str = f'¥{old_p}' if old_p is not None else '-'
            print(f"{sn:17s} {display_name:20s} {rarity:10s} {old_str:>10s} {'¥'+str(new_p):>10s} {reason}")

    # 输出新卡片
    if new_card_items:
        print(f"\n{'─' * 80}")
        print(f"🆕 新卡/新稀有度 ({len(new_card_items)} 条) — 将直接录入")
        print(f"{'─' * 80}")
        for sn, name, rarity, _, new_p, _ in sorted(new_card_items)[:30]:
            display_name = name[:18] if len(name) > 18 else name
            print(f"  {sn:17s} {display_name:20s} {rarity:10s} ¥{new_p}")
        if len(new_card_items) > 30:
            print(f"  ... 还有 {len(new_card_items) - 30} 条")

    # 输出低置信度
    if low_conf_items:
        print(f"\n{'─' * 80}")
        print(f"⚡ 低置信度单卡 ({len(low_conf_items)} 张) — OCR平均置信度<0.85")
        print(f"{'─' * 80}")
        for filename, conf in sorted(low_conf_items, key=lambda x: x[1])[:20]:
            print(f"  {filename}: {conf:.4f}")
        if len(low_conf_items) > 20:
            print(f"  ... 还有 {len(low_conf_items) - 20} 张")

    # 包价格对比
    ocr_pack_prices = ocr_data.get('pack_prices', {})
    pack_changes = []
    # LOCH 盒/包
    loch_pack_ocr = ocr_pack_prices.get('loch', {})
    loch_pack_old = loch_prices.get('packPrices', {}).get('LOCH', {})
    if 'box' in loch_pack_ocr:
        old_box = loch_pack_old.get('box', 0)
        new_box = loch_pack_ocr['box']
        if old_box != new_box:
            pack_changes.append(('LOCH盒', old_box, new_box))
    if 'pack' in loch_pack_ocr:
        old_pack = loch_pack_old.get('pack', 0)
        new_pack = loch_pack_ocr['pack']
        if old_pack != new_pack:
            pack_changes.append(('LOCH包', old_pack, new_pack))
    # LOSP 包
    losp_pack_ocr = ocr_pack_prices.get('losp', {})
    losp_pack_old = loch_prices.get('packPrices', {}).get('LOSP', {})
    if 'pack' in losp_pack_ocr:
        old_pack = losp_pack_old.get('pack', 0)
        new_pack = losp_pack_ocr['pack']
        if old_pack != new_pack:
            pack_changes.append(('LOSP包', old_pack, new_pack))
    # LOCR 盒/包
    locr_pack_ocr = ocr_pack_prices.get('locr', {})
    locr_pack_old = locr_prices.get('packPrices', {}).get('LOCR', {})
    if 'box' in locr_pack_ocr:
        old_box = locr_pack_old.get('box', 0)
        new_box = locr_pack_ocr['box']
        if old_box != new_box:
            pack_changes.append(('LOCR盒', old_box, new_box))
    if 'pack' in locr_pack_ocr:
        old_pack = locr_pack_old.get('pack', 0)
        new_pack = locr_pack_ocr['pack']
        if old_pack != new_pack:
            pack_changes.append(('LOCR包', old_pack, new_pack))
    # BLZD 盒/包
    blzd_pack_ocr = ocr_pack_prices.get('blzd', {})
    blzd_pack_old = blzd_prices.get('packPrices', {}).get('BLZD', {})
    if 'box' in blzd_pack_ocr:
        old_box = blzd_pack_old.get('box', 0)
        new_box = blzd_pack_ocr['box']
        if old_box != new_box:
            pack_changes.append(('BLZD盒', old_box, new_box))
    if 'pack' in blzd_pack_ocr:
        old_pack = blzd_pack_old.get('pack', 0)
        new_pack = blzd_pack_ocr['pack']
        if old_pack != new_pack:
            pack_changes.append(('BLZD包', old_pack, new_pack))

    if pack_changes:
        print(f"\n{'─' * 80}")
        print(f"📦 卡包/卡盒价格变动")
        print(f"{'─' * 80}")
        for name, old_v, new_v in pack_changes:
            print(f"  {name}: ¥{old_v} → ¥{new_v}")

    print(f"\n{'=' * 80}")
    print(f"审核完成。如确认无误，可执行:")
    print(f"  python tools/ocr_workflow.py --pack {pack} --date {date_str} --step merge")
    print(f"{'=' * 80}")


def step_merge(pack, date_str):
    """
    步骤7: 合并到价格JSON文件

    调用 merge_prices.py 的 main()
    """
    print_banner(f"步骤 7: 合并到价格文件（{pack}/{date_str}）")

    sys.path.insert(0, os.path.join(BASE_DIR, 'tools'))
    import merge_prices

    output_dir = get_output_dir(pack, date_str)
    parsed_path = os.path.join(output_dir, PARSED_PRICES_FILE)
    csv_path = os.path.join(output_dir, PRICE_COMPARISON_FILE)

    merge_prices.main(date_str=date_str, parsed_path=parsed_path, csv_path=csv_path)


def main():
    parser = argparse.ArgumentParser(
        description='OCR价格更新一键工作流 (v6 卡包+日期隔离版)',
        epilog='''
使用示例:
  python tools/ocr_workflow.py --pack BLZDS --date 20260321                    # 完整流程
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step organize    # 仅归档截图
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step rename      # 仅重命名
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step cut         # 仅裁切
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step card_cut    # 仅单卡裁切
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step ocr_cards   # 仅单卡OCR
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step parse       # 仅解析价格
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step review      # 仅审核价格
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --step merge       # 仅合并到价格文件
  python tools/ocr_workflow.py --pack BLZDS --date 20260321 --from card_cut    # 从单卡裁切开始执行
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('--pack', required=True,
                       choices=[p.upper() for p in SUPPORTED_PACKS],
                       help='卡包名称 (如 BLZDS, BLZD, LOCH, LOCR, LOSP-Vol1, LOSP-Vol2)')
    parser.add_argument('--date', required=True,
                       help='截图日期 (如 20260321)')
    parser.add_argument('--step', choices=['organize', 'rename', 'cut', 'card_cut', 'ocr_cards', 'parse', 'review', 'merge'],
                       help='仅执行指定步骤')
    parser.add_argument('--from', dest='from_step',
                       choices=['organize', 'rename', 'cut', 'card_cut', 'ocr_cards', 'parse', 'review', 'merge'],
                       help='从指定步骤开始执行到最后')

    args = parser.parse_args()
    pack = args.pack.upper()
    date_str = args.date

    # 验证日期格式
    try:
        datetime.strptime(date_str, '%Y%m%d')
    except ValueError:
        print(f"❌ 日期格式错误: {date_str}，期望格式: YYYYMMDD (如 20260321)")
        sys.exit(1)

    # 确保输出目录存在
    output_dir = get_output_dir(pack, date_str)
    os.makedirs(output_dir, exist_ok=True)

    print_banner(f"OCR价格更新工作流 v6  卡包: {pack}  日期: {date_str}")

    # 确定要执行的步骤
    all_steps = ['organize', 'rename', 'cut', 'card_cut', 'ocr_cards', 'parse', 'review', 'merge']
    # 默认完整流程不含 organize 和 merge（organize需显式执行，merge需确认后执行）
    default_steps = ['rename', 'cut', 'card_cut', 'ocr_cards', 'parse', 'review']

    if args.step:
        steps_to_run = [args.step]
        print(f"🔧 模式: 仅执行 [{args.step}] 步骤\n")
    elif args.from_step:
        start_idx = all_steps.index(args.from_step)
        steps_to_run = all_steps[start_idx:]
        print(f"🔧 模式: 从 [{args.from_step}] 开始执行 → {' → '.join(steps_to_run)}\n")
    else:
        steps_to_run = default_steps
        print(f"🔧 模式: 默认流程 {' → '.join(default_steps)}\n")

    # 如果要执行 rename 以后的步骤（非 organize），先检查截图目录
    non_organize_steps = [s for s in steps_to_run if s != 'organize']
    if non_organize_steps:
        check_screenshots(pack, date_str)

    # 清理历史数据：仅当从头开始（rename/cut）时才清理
    # --from 模式不清理（保留中间产物用于断点恢复）
    should_clean = False
    if args.from_step:
        # 从早期步骤开始时清理
        should_clean = args.from_step in ('rename', 'cut')
    elif args.step is None or args.step in ('rename', 'cut'):
        should_clean = args.step != 'organize'

    if should_clean:
        clean_test_output(pack, date_str)

    total_start = time.time()

    # 执行步骤
    step_map = {
        'organize': lambda: step_organize(pack, date_str),
        'rename': lambda: step_rename(pack, date_str),
        'cut': lambda: step_cut(pack, date_str),
        'card_cut': lambda: step_card_cut(pack, date_str),
        'ocr_cards': lambda: step_ocr_cards(pack, date_str),
        'parse': lambda: step_parse(pack, date_str),
        'review': lambda: step_review(pack, date_str),
        'merge': lambda: step_merge(pack, date_str),
    }

    for step_name in steps_to_run:
        step_map[step_name]()

    total_time = time.time() - total_start

    # 完成摘要
    print_banner("工作流完成")
    print(f"  📦 卡包: {pack}")
    print(f"  📅 日期: {date_str}")
    print(f"  ⏱️  总耗时: {total_time:.1f}s")
    print(f"  📂 截图目录: {get_sources_dir(pack, date_str)}")
    print(f"  📂 输出目录: {output_dir}")

    if 'merge' in steps_to_run:
        print(f"\n  📊 请检查价格对照表:")
        print(f"     {os.path.join(output_dir, PRICE_COMPARISON_FILE)}")
        print(f"\n  确认无误后执行:")
        print(f"     git add data/ocg/prices/")
        print(f'     git commit -m "更新卡片市场价格 ({date_str[:4]}-{date_str[4:6]}-{date_str[6:]})"')
        print(f"     git push origin main")


if __name__ == '__main__':
    main()
