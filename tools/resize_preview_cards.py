#!/usr/bin/env python3
"""
LOCR+LOSP 预览卡图批量处理工具

将 FinalCardArt 目录中的所有卡图统一处理：
- 缩放到宽度 420px（高度按比例自适应）
- 转换为 webp 格式（质量 85%）
- 保持原文件名结构，仅更改扩展名为 .webp

用法：
    python tools/resize_preview_cards.py                    # 处理所有图片
    python tools/resize_preview_cards.py --dry-run          # 预览模式，不实际处理
    python tools/resize_preview_cards.py --width 200        # 指定目标宽度
    python tools/resize_preview_cards.py --quality 90       # 指定 webp 质量
"""

import os
import sys
import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("错误：需要 Pillow 库。请运行: pip install Pillow")
    sys.exit(1)

# 项目根目录
PROJECT_ROOT = Path(__file__).resolve().parent.parent
# 源目录：FinalCardArt（原始裁切卡图）
SOURCE_DIR = PROJECT_ROOT / "local" / "PreviewCards" / "LOCR+LOSP" / "FinalCardArt"
# 目标目录：ProcessedCardArt（处理后的统一规格卡图）
OUTPUT_DIR = PROJECT_ROOT / "local" / "PreviewCards" / "LOCR+LOSP" / "ProcessedCardArt"

# 默认参数
DEFAULT_WIDTH = 420       # 目标宽度（像素），与 CDN _w420 尺寸对齐
DEFAULT_QUALITY = 85      # webp 压缩质量
SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"}


def process_images(target_width: int, quality: int, dry_run: bool = False):
    """批量处理所有卡图"""
    
    if not SOURCE_DIR.exists():
        print(f"错误：源目录不存在: {SOURCE_DIR}")
        sys.exit(1)
    
    # 收集所有支持的图片文件
    files = sorted([
        f for f in SOURCE_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTS
    ])
    
    if not files:
        print(f"未找到图片文件: {SOURCE_DIR}")
        sys.exit(1)
    
    print(f"=== LOCR+LOSP 预览卡图批量处理 ===")
    print(f"源目录: {SOURCE_DIR}")
    print(f"输出目录: {OUTPUT_DIR}")
    print(f"目标宽度: {target_width}px")
    print(f"webp 质量: {quality}")
    print(f"待处理文件: {len(files)} 张")
    print()
    
    if dry_run:
        print("【预览模式】不会实际处理文件\n")
    
    # 创建输出目录
    if not dry_run:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 统计
    total = len(files)
    success = 0
    skipped = 0
    errors = 0
    total_src_size = 0
    total_dst_size = 0
    
    for i, src_path in enumerate(files, 1):
        # 输出文件名：保持原名，扩展名改为 .webp
        dst_name = src_path.stem + ".webp"
        dst_path = OUTPUT_DIR / dst_name
        
        src_size = src_path.stat().st_size
        total_src_size += src_size
        
        try:
            img = Image.open(src_path)
            orig_w, orig_h = img.size
            
            # 计算目标高度（按比例缩放）
            ratio = target_width / orig_w
            target_height = round(orig_h * ratio)
            
            if dry_run:
                # 预览模式：只打印信息
                print(f"  [{i}/{total}] {src_path.name}")
                print(f"    {orig_w}x{orig_h} → {target_width}x{target_height}, "
                      f"{src_size // 1024}KB → ~??KB")
                success += 1
                continue
            
            # 缩放图片（使用高质量 LANCZOS 重采样）
            if orig_w != target_width:
                img_resized = img.resize((target_width, target_height), Image.LANCZOS)
            else:
                img_resized = img
            
            # 转换为 RGB（webp 不支持某些颜色模式）
            if img_resized.mode in ("RGBA", "P"):
                # 保留 alpha 通道
                img_resized = img_resized.convert("RGBA")
            elif img_resized.mode != "RGB":
                img_resized = img_resized.convert("RGB")
            
            # 保存为 webp
            img_resized.save(dst_path, "WEBP", quality=quality, method=4)
            
            dst_size = dst_path.stat().st_size
            total_dst_size += dst_size
            
            # 计算压缩率
            compress_ratio = (1 - dst_size / src_size) * 100 if src_size > 0 else 0
            
            print(f"  [{i}/{total}] {src_path.name} → {dst_name}")
            print(f"    {orig_w}x{orig_h} → {target_width}x{target_height}, "
                  f"{src_size // 1024}KB → {dst_size // 1024}KB "
                  f"(节省 {compress_ratio:.0f}%)")
            
            success += 1
            
        except Exception as e:
            errors += 1
            print(f"  [{i}/{total}] ❌ {src_path.name}: {e}")
    
    # 打印汇总
    print()
    print(f"=== 处理完成 ===")
    print(f"成功: {success}/{total}")
    if errors > 0:
        print(f"失败: {errors}")
    if skipped > 0:
        print(f"跳过: {skipped}")
    
    if not dry_run and success > 0:
        print(f"\n总大小变化: {total_src_size // 1024 // 1024}MB → {total_dst_size // 1024 // 1024}MB "
              f"(节省 {(1 - total_dst_size / total_src_size) * 100:.1f}%)")
        print(f"平均文件大小: {total_dst_size // success // 1024}KB")
        print(f"\n输出目录: {OUTPUT_DIR}")


def main():
    parser = argparse.ArgumentParser(
        description="LOCR+LOSP 预览卡图批量处理（统一缩放 + 转 webp）"
    )
    parser.add_argument(
        "--width", type=int, default=DEFAULT_WIDTH,
        help=f"目标宽度（像素），默认 {DEFAULT_WIDTH}"
    )
    parser.add_argument(
        "--quality", type=int, default=DEFAULT_QUALITY,
        help=f"webp 压缩质量（1-100），默认 {DEFAULT_QUALITY}"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="预览模式，只显示处理计划，不实际执行"
    )
    
    args = parser.parse_args()
    
    # 参数校验
    if args.width < 100 or args.width > 2000:
        print(f"错误：宽度应在 100-2000 之间，当前: {args.width}")
        sys.exit(1)
    if args.quality < 1 or args.quality > 100:
        print(f"错误：质量应在 1-100 之间，当前: {args.quality}")
        sys.exit(1)
    
    process_images(args.width, args.quality, args.dry_run)


if __name__ == "__main__":
    main()
