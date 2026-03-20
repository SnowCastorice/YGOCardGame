#!/usr/bin/env python3
"""
基于卡图矩形定位的行裁切工具 v2

方案原理：
1. 用 OpenCV 边缘检测 + 轮廓查找，定位截图中的卡图矩形
   卡图是固定尺寸的竖向矩形，约 154×224px，面积约 34000，宽高比约 0.688
2. 通过严格的面积+高度+宽高比过滤，精确排除UI元素（按钮、标签栏等）
3. 将检测到的卡图矩形按 y 坐标聚类成行，取每行的 max_bottom（卡图底边）
4. 行间距固定为 ~375px，从第一行推算后续行位置
5. 裁切范围 = [card_bottom + 10, card_bottom + 125]，仅覆盖集换分~价格区域

关键数据（从像素分析得出）：
- 卡图矩形: 154×224px, 面积~34000, 宽高比~0.688
- 文字区域相对 card_bottom 的固定偏移:
    集换分: +24~26px
    卡名:   +55~57px
    编号:   +88~91px
    价格底: +111~112px
- 行间距(卡图cy): 374~375px，完全稳定
- 文字无漂移: 各行偏移量一致（±2px以内）
"""

import cv2
import numpy as np
import os
import sys
from PIL import Image


# ===== 核心常量 =====

# 卡图矩形过滤条件（精确值，排除所有UI元素）
CARD_RECT_MIN_AREA = 25000     # 卡图面积下限（实测最小27682）
CARD_RECT_MAX_AREA = 38000     # 卡图面积上限（实测最大34648）
CARD_RECT_ASPECT_MIN = 0.65    # 宽高比下限（实测0.686~0.688）
CARD_RECT_ASPECT_MAX = 0.72    # 宽高比上限
CARD_RECT_MIN_H = 215          # 高度下限（实测224~226）
CARD_RECT_MAX_H = 235          # 高度上限
CARD_RECT_MIN_W = 140          # 宽度下限（实测154~157）
CARD_RECT_MAX_W = 170          # 宽度上限

# 行间距
ROW_SPACING = 375              # 行间距（卡图cy之间，实测374~375）
ROW_CLUSTER_THRESHOLD = 80     # 聚类阈值（cy差值>此值视为不同行）

# 裁切偏移（相对 card_bottom 的固定偏移，无需漂移补偿）
CROP_OFFSET_TOP = 10           # 裁切上沿 = card_bottom + 10（集换分上方留14px余量）
CROP_OFFSET_BOTTOM = 125       # 裁切下沿 = card_bottom + 125（价格底部留13px余量）
# 总高度 = 125 - 10 = 115px


def detect_card_rects(img_path):
    """
    检测图片中的卡图矩形

    检测策略：
    1. 快速路径：严格面积+形状过滤（面积25k~38k + 四边形 + 宽高比 + 高度）
       适用于大多数正常截图（卡图边缘完整，面积约34000）
    2. 回退路径：仅用 boundingRect 尺寸过滤（宽140~170 + 高215~235 + 宽高比）
       适用于特殊截图（如卡包页面，卡图内容复杂导致Canny边缘不完整，轮廓面积远小于预期）
       使用 RETR_LIST 模式获取所有层级轮廓，并对同位置的重复轮廓去重

    返回: (rects, (img_h, img_w))
      rects: list of dict, 每个包含 x, y, w, h, cx, cy, bottom, area
    """
    img = cv2.imread(img_path)
    if img is None:
        raise ValueError(f"无法读取图片: {img_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)

    # === 快速路径：严格面积+四边形过滤 ===
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    rects = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if CARD_RECT_MIN_AREA < area < CARD_RECT_MAX_AREA:
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
            if len(approx) == 4:
                x, y, rw, rh = cv2.boundingRect(approx)
                aspect = rw / rh if rh > 0 else 0
                if (CARD_RECT_ASPECT_MIN < aspect < CARD_RECT_ASPECT_MAX
                        and CARD_RECT_MIN_H < rh < CARD_RECT_MAX_H):
                    rects.append({
                        'x': x, 'y': y, 'w': rw, 'h': rh,
                        'cx': x + rw // 2,
                        'cy': y + rh // 2,
                        'bottom': y + rh,
                        'area': area
                    })

    fast_rects = list(rects)  # 保存快速路径结果，继续执行回退路径

    # === 回退路径：用 boundingRect 尺寸过滤（不依赖轮廓面积）===
    # 某些截图（如卡包页面）卡图内容复杂，Canny边缘不完整导致轮廓面积远小于预期
    # 但 boundingRect 的宽高仍然准确
    # 无论快速路径是否有结果，都执行回退路径以捕获遗漏的矩形
    contours_all, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for cnt in contours_all:
        x, y, rw, rh = cv2.boundingRect(cnt)
        if (CARD_RECT_MIN_W < rw < CARD_RECT_MAX_W
                and CARD_RECT_MIN_H < rh < CARD_RECT_MAX_H):
            aspect = rw / rh if rh > 0 else 0
            if CARD_RECT_ASPECT_MIN < aspect < CARD_RECT_ASPECT_MAX:
                area = cv2.contourArea(cnt)
                candidates.append({
                    'x': x, 'y': y, 'w': rw, 'h': rh,
                    'cx': x + rw // 2,
                    'cy': y + rh // 2,
                    'bottom': y + rh,
                    'area': area
                })

    # 对同位置的重复轮廓去重（保留面积最大的）
    candidates.sort(key=lambda r: (r['cy'], r['cx']))
    fallback_rects = []
    for c in candidates:
        if not fallback_rects or abs(c['cy'] - fallback_rects[-1]['cy']) > 10 or abs(c['cx'] - fallback_rects[-1]['cx']) > 10:
            fallback_rects.append(c)
        elif c['area'] > fallback_rects[-1]['area']:
            fallback_rects[-1] = c

    # === 合并快速路径和回退路径的结果 ===
    if fast_rects and not fallback_rects:
        # 只有快速路径有结果
        print(f"  [快速路径] 检测到 {len(fast_rects)} 个卡图矩形")
        return fast_rects, img.shape[:2]
    elif not fast_rects and fallback_rects:
        # 只有回退路径有结果
        print(f"  [回退路径] 检测到 {len(fallback_rects)} 个卡图矩形")
        return fallback_rects, img.shape[:2]
    elif fast_rects and fallback_rects:
        # 两个路径都有结果，合并去重（同位置保留面积最大的）
        merged = list(fast_rects)
        for fb in fallback_rects:
            is_dup = False
            for i, m in enumerate(merged):
                if abs(fb['cy'] - m['cy']) <= 15 and abs(fb['cx'] - m['cx']) <= 15:
                    is_dup = True
                    if fb['area'] > m['area']:
                        merged[i] = fb
                    break
            if not is_dup:
                merged.append(fb)
        print(f"  [合并] 快速路径={len(fast_rects)}个, 回退路径={len(fallback_rects)}个, 合并后={len(merged)}个")
        return merged, img.shape[:2]
    else:
        # 两个路径都没结果
        return [], img.shape[:2]


def cluster_rects_to_rows(rects):
    """
    将卡图矩形按cy聚类成行

    返回: list of dict, 每个包含:
      - avg_cy: 平均中心y
      - max_bottom: 最大底边y（用于裁切基准）
      - count: 该行矩形数量
    """
    if not rects:
        return []

    # 按cy排序
    rects_sorted = sorted(rects, key=lambda r: r['cy'])

    # 聚类
    groups = []
    for r in rects_sorted:
        if not groups or r['cy'] - groups[-1][-1]['cy'] > ROW_CLUSTER_THRESHOLD:
            groups.append([r])
        else:
            groups[-1].append(r)

    rows = []
    for g in groups:
        avg_cy = sum(r['cy'] for r in g) // len(g)
        max_bottom = max(r['bottom'] for r in g)
        avg_h = sum(r['h'] for r in g) // len(g)
        rows.append({
            'avg_cy': avg_cy,
            'max_bottom': max_bottom,
            'avg_h': avg_h,
            'count': len(g),
        })

    return rows


def compute_crop_regions(rows, img_height):
    """
    根据卡图行信息计算裁切区域（固定偏移，无漂移补偿）

    裁切策略：
    - crop_top = card_bottom + CROP_OFFSET_TOP
    - crop_bottom = card_bottom + CROP_OFFSET_BOTTOM
    - 总高度 = 115px（精确覆盖集换分~价格区域）
    - 从第一行推算后续行，用固定行间距 ROW_SPACING
    """
    if not rows:
        return []

    # 第一行就是第一个检测到的卡图行（严格过滤后不会有UI元素误入）
    first_row = rows[0]

    crops = []

    # 处理检测到的行
    for i, row in enumerate(rows):
        card_bottom = row['max_bottom']
        crop_top = card_bottom + CROP_OFFSET_TOP
        crop_bottom = min(img_height, card_bottom + CROP_OFFSET_BOTTOM)

        if crop_top >= img_height - 30:
            break

        crops.append({
            'crop_top': crop_top,
            'crop_bottom': crop_bottom,
            'card_bottom': card_bottom,
            'card_cy': row['avg_cy'],
            'rect_count': row['count'],
            'row_index': i,
            'source': 'detected',
        })

    # 用行间距推算更多行（图片底部可能还有未检测到的卡图行）
    if rows:
        last_cy = rows[-1]['avg_cy']
        last_h = rows[-1].get('avg_h', 224)
        last_idx = len(rows) - 1

        next_cy = last_cy + ROW_SPACING
        extra_idx = 1
        while True:
            next_bottom = next_cy + last_h // 2
            crop_top = next_bottom + CROP_OFFSET_TOP
            crop_bottom = min(img_height, next_bottom + CROP_OFFSET_BOTTOM)

            actual_h = crop_bottom - crop_top
            if actual_h < 60:  # 剩余高度不足，停止
                break
            if crop_top >= img_height - 30:
                break

            crops.append({
                'crop_top': crop_top,
                'crop_bottom': crop_bottom,
                'card_bottom': next_bottom,
                'card_cy': next_cy,
                'rect_count': 0,
                'row_index': last_idx + extra_idx,
                'source': 'inferred',
            })

            next_cy += ROW_SPACING
            extra_idx += 1

    return crops


def crop_and_save(img_path, crops, output_dir, source_name):
    """
    执行裁切并保存

    对推断行进行空白检测：暗色像素占比<2%的裁切区域视为无内容，跳过保存

    参数:
      source_name: 源文件名（不含后缀），如 LOCH01、BLZD02，用于裁切图命名前缀

    返回: list of 保存信息
    """
    img = Image.open(img_path)
    img_w, img_h = img.size
    # 用于空白检测的灰度数组
    img_arr = np.array(img)[:, :, :3].mean(axis=2)

    saved = []
    save_idx = 0  # 实际保存的序号（跳过空白行后的连续编号）
    for crop in crops:
        # 推断行需要做空白检测，避免输出无意义的空白裁切图
        if crop['source'] == 'inferred':
            region_gray = img_arr[crop['crop_top']:crop['crop_bottom'], :]
            dark_pct = (region_gray < 150).mean() * 100
            if dark_pct < 2.0:
                print(f"    [跳过] 推断行 [{crop['crop_top']}~{crop['crop_bottom']}] 暗色像素={dark_pct:.1f}%（空白区域）")
                continue

        region = img.crop((0, crop['crop_top'], img_w, crop['crop_bottom']))

        filename = f"{source_name}_{save_idx:02d}.png"
        filepath = os.path.join(output_dir, filename)
        region.save(filepath)

        saved.append({
            'filepath': filename,
            'crop_top': crop['crop_top'],
            'crop_bottom': crop['crop_bottom'],
            'crop_height': crop['crop_bottom'] - crop['crop_top'],
            'card_cy': crop['card_cy'],
            'card_bottom': crop['card_bottom'],
            'rect_count': crop['rect_count'],
            'source': crop['source'],
        })
        save_idx += 1

    return saved


def process_screenshot(img_path, output_dir, source_name, debug=False):
    """
    处理单张截图：检测卡图 → 聚类成行 → 计算裁切区域 → 裁切保存

    参数:
      source_name: 源文件名（不含后缀），如 LOCH01、BLZD02，用于裁切图命名前缀
    """
    print(f"\n===== 处理截图: {source_name} ({os.path.basename(img_path)}) =====")

    # 1. 检测卡图矩形（严格过滤）
    rects, (img_h, img_w) = detect_card_rects(img_path)
    print(f"  检测到 {len(rects)} 个卡图矩形（过滤后）")

    if rects:
        areas = [r['area'] for r in rects]
        aspects = [r['w'] / r['h'] for r in rects]
        heights = [r['h'] for r in rects]
        print(f"  面积范围: {min(areas):.0f}~{max(areas):.0f}")
        print(f"  宽高比范围: {min(aspects):.3f}~{max(aspects):.3f}")
        print(f"  高度范围: {min(heights)}~{max(heights)}")

    # 2. 聚类成行
    rows = cluster_rects_to_rows(rects)
    print(f"  聚类为 {len(rows)} 行:")
    for ri, row in enumerate(rows):
        print(f"    行{ri}: cy={row['avg_cy']}, bottom={row['max_bottom']}, count={row['count']}")

    # 行间距验证
    if len(rows) >= 2:
        gaps = [rows[i + 1]['avg_cy'] - rows[i]['avg_cy'] for i in range(len(rows) - 1)]
        print(f"  行间距: {gaps}")

    # 3. 计算裁切区域
    crops = compute_crop_regions(rows, img_h)
    print(f"  计算出 {len(crops)} 个裁切区域:")
    for ci, crop in enumerate(crops):
        h = crop['crop_bottom'] - crop['crop_top']
        print(f"    裁切{ci}: [{crop['crop_top']}~{crop['crop_bottom']}] h={h}px "
              f"(card_bottom={crop['card_bottom']}, {crop['source']})")

    # 4. 裁切保存
    saved = crop_and_save(img_path, crops, output_dir, source_name)
    print(f"  保存 {len(saved)} 张裁切图")

    # 5. 保存调试图
    if debug:
        save_debug_image(img_path, rects, rows, crops, output_dir, source_name)

    return saved


def save_debug_image(img_path, rects, rows, crops, output_dir, source_name):
    """保存调试标注图"""
    img = cv2.imread(img_path)

    # 画卡图矩形（绿色）
    for r in rects:
        cv2.rectangle(img, (r['x'], r['y']), (r['x'] + r['w'], r['y'] + r['h']), (0, 255, 0), 2)

    # 画行的底边线（黄色）
    for row in rows:
        bot = row['max_bottom']
        cv2.line(img, (0, bot), (img.shape[1], bot), (0, 255, 255), 1)
        cv2.putText(img, f"bottom={bot}", (10, bot - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

    # 画裁切区域（红色=上沿，蓝色=下沿）
    for crop in crops:
        cv2.line(img, (0, crop['crop_top']), (img.shape[1], crop['crop_top']), (0, 0, 255), 2)
        cv2.line(img, (0, crop['crop_bottom']), (img.shape[1], crop['crop_bottom']), (255, 0, 0), 2)

    debug_path = os.path.join(output_dir, f"debug_{source_name}.png")
    cv2.imwrite(debug_path, img)
    print(f"  调试图已保存: {debug_path}")


if __name__ == '__main__':
    pack_date = sys.argv[1] if len(sys.argv) > 1 else '20260309'
    pic_dir = os.path.join('pack_references', 'ORCPics', pack_date)
    output_dir = os.path.join('test_output', 'row_pics')

    os.makedirs(output_dir, exist_ok=True)

    screenshots = sorted(f for f in os.listdir(pic_dir) if f.endswith('.png'))

    # 默认只处理第一张截图（测试用），传入 all 参数处理全部
    if len(sys.argv) > 2 and sys.argv[2] == 'all':
        to_process = screenshots
    else:
        to_process = screenshots[:1]
        print(f"测试模式：只处理第一张截图 ({screenshots[0]})")

    all_results = []
    for filename in to_process:
        img_path = os.path.join(pic_dir, filename)
        # 从文件名提取不含后缀的名称作为裁切图命名前缀
        source_name = os.path.splitext(filename)[0]
        results = process_screenshot(img_path, output_dir, source_name, debug=True)
        all_results.extend(results)

    print(f"\n===== 完成 =====")
    print(f"总计输出 {len(all_results)} 张裁切图")
    print(f"输出目录: {os.path.abspath(output_dir)}")
