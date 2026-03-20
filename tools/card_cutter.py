#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
单卡裁切模块 — 从行裁切图中按十等分裁切出单卡图

核心策略：
1. 每张行裁切图宽度固定为 2064px，包含最多 10 张卡片信息
2. 按十等分裁切（2064/10=206.4px 每张卡）
3. 裁切后检测空白区域，跳过未占满的行尾空白卡位
4. 输出命名格式: {卡包}{截图序号}_{行序号}_card{卡序号}.png

使用方法:
  local/venv/Scripts/python.exe tools/card_cutter.py
"""

import json
import os
import sys
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

# ========================
# 配置参数
# ========================

# 每行卡片数量（十等分）
CARDS_PER_ROW = 10

# 空白检测阈值：像素标准差低于此值视为空白图
BLANK_STD_THRESHOLD = 15


def is_blank_image(img_array, threshold=BLANK_STD_THRESHOLD):
    """
    检测图片是否为空白（纯色或接近纯色）
    
    通过像素值的标准差来判断：
    - 标准差很低 → 几乎是纯色 → 空白
    - 标准差较高 → 有丰富内容 → 非空白
    
    参数:
      img_array: numpy数组格式的图片
      threshold: 标准差阈值
      
    返回: True 表示空白
    """
    std = np.std(img_array)
    return std < threshold


def cut_row_to_cards(row_img_path, output_dir, row_filename):
    """
    将一张行裁切图按十等分裁切为单卡图
    
    参数:
      row_img_path: 行裁切图路径
      output_dir: 单卡图输出目录
      row_filename: 行裁切图文件名（如 BLZD01_03.png）
      
    返回: 裁切信息列表 [{'filename': str, 'left': int, 'right': int, 'is_blank': bool}, ...]
    """
    img = Image.open(row_img_path)
    w, h = img.size
    
    # 十等分计算每张卡的宽度
    card_width = w / float(CARDS_PER_ROW)
    
    # 文件名前缀：去掉.png后缀
    prefix = os.path.splitext(row_filename)[0]
    
    cards = []
    for i in range(CARDS_PER_ROW):
        left = round(card_width * i)
        right = round(card_width * (i + 1))
        
        # 裁切
        card_img = img.crop((left, 0, right, h))
        card_array = np.array(card_img)
        
        # 空白检测
        blank = is_blank_image(card_array)
        
        if blank:
            # 空白图，跳过保存
            cards.append({
                'filename': None,
                'left': left,
                'right': right,
                'width': right - left,
                'is_blank': True,
                'card_idx': i,
            })
            continue
        
        # 保存非空白卡片
        card_filename = f"{prefix}_card{i:02d}.png"
        card_path = os.path.join(output_dir, card_filename)
        card_img.save(card_path)
        
        cards.append({
            'filename': card_filename,
            'left': left,
            'right': right,
            'width': right - left,
            'is_blank': False,
            'card_idx': i,
        })
    
    return cards


def process_all_rows(base_dir, row_pics_dir=None, card_pics_dir=None, output_dir=None):
    """
    处理所有行裁切图，裁切为单卡图
    
    参数:
      base_dir: 项目根目录
      row_pics_dir: 行裁切图目录（默认 test_output/row_pics/）
      card_pics_dir: 单卡图输出目录（默认 test_output/card_pics/）
      output_dir: 中间产物输出目录（默认 test_output/）
      
    返回: 全部裁切信息
    """
    if output_dir is None:
        output_dir = os.path.join(base_dir, 'test_output')
    if row_pics_dir is None:
        row_pics_dir = os.path.join(output_dir, 'row_pics')
    if card_pics_dir is None:
        card_pics_dir = os.path.join(output_dir, 'card_pics')
    
    # 确保单卡图目录存在
    os.makedirs(card_pics_dir, exist_ok=True)
    
    # 清理旧的单卡图
    old_cards = [f for f in os.listdir(card_pics_dir) if f.endswith('.png')]
    if old_cards:
        for f in old_cards:
            os.remove(os.path.join(card_pics_dir, f))
        print(f"清理旧单卡图 {len(old_cards)} 张")
    
    # 获取行裁切图列表
    row_files = sorted([
        f for f in os.listdir(row_pics_dir)
        if f.endswith('.png') and not f.startswith('debug_') and not f.startswith('test_')
    ])
    
    print(f"\n行裁切图: {len(row_files)} 张")
    print(f"单卡图输出: {card_pics_dir}")
    print(f"裁切方式: 十等分 (每张卡 ~{2064/CARDS_PER_ROW:.1f}px)")
    
    all_card_info = []
    total_cards = 0
    blank_cards = 0
    
    for row_filename in row_files:
        row_path = os.path.join(row_pics_dir, row_filename)
        
        # 十等分裁切
        cards = cut_row_to_cards(row_path, card_pics_dir, row_filename)
        
        n_valid = sum(1 for c in cards if not c['is_blank'])
        n_blank = sum(1 for c in cards if c['is_blank'])
        total_cards += n_valid
        blank_cards += n_blank
        
        # 记录裁切信息
        for card in cards:
            card['row_filename'] = row_filename
            all_card_info.append(card)
        
        print(f"  {row_filename}: {n_valid} 张卡片" + (f" ({n_blank} 张空白跳过)" if n_blank > 0 else ""))
    
    # 保存裁切信息
    info_path = os.path.join(output_dir, 'card_cut_info.json')
    with open(info_path, 'w', encoding='utf-8') as f:
        json.dump(all_card_info, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'=' * 50}")
    print(f"单卡裁切完成!")
    print(f"  有效卡片: {total_cards} 张")
    print(f"  空白跳过: {blank_cards} 张")
    print(f"  裁切信息: {info_path}")
    print(f"  单卡图目录: {card_pics_dir}")
    
    return all_card_info


def main():
    """主函数"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    print("=" * 60)
    print("单卡裁切工具 — 十等分裁切")
    print(f"  每行 {CARDS_PER_ROW} 等分")
    print(f"  空白检测阈值: std < {BLANK_STD_THRESHOLD}")
    print("=" * 60)
    
    process_all_rows(base_dir)


if __name__ == '__main__':
    main()
