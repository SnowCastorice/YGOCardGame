#!/usr/bin/env python3
"""
LOCH 卡图本地化下载脚本
从 loch_image_map.json 读取所有 metaId / altMetaId，
批量下载 _w200（小图）和 _w420（大图）到 data/ocg/images/loch/ 目录。

用法：
  cd YGOCardGame
  python tools/download_loch_images.py
"""

import json
import os
import time
import urllib.request
import urllib.error

# 配置
CDN_BASE = "https://s3.duellinksmeta.com/cards"
SIZES = ["_w200", "_w420"]
MAP_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "ocg", "loch_image_map.json")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "ocg", "images", "loch")

# 重试配置
MAX_RETRIES = 3
RETRY_DELAY = 2  # 秒


def download_file(url, filepath):
    """下载文件，带重试机制"""
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            with urllib.request.urlopen(req, timeout=30) as response:
                data = response.read()
                with open(filepath, "wb") as f:
                    f.write(data)
                return len(data)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  ⚠ 重试 ({attempt + 1}/{MAX_RETRIES}): {e}")
                time.sleep(RETRY_DELAY)
            else:
                print(f"  ✗ 下载失败: {url} -> {e}")
                return None
    return None


def main():
    # 读取映射表
    with open(MAP_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    cards = data.get("cards", {})

    # 收集所有需要下载的 metaId（去重）
    meta_ids = set()
    for pw, info in cards.items():
        if info.get("metaId"):
            meta_ids.add(info["metaId"])
        # 收集 altMetaId（OF 超框卡图）
        alt = info.get("altMetaId", {})
        for rarity, alt_id in alt.items():
            if alt_id:
                meta_ids.add(alt_id)

    print(f"📦 LOCH 卡图本地化下载")
    print(f"   卡片总数: {len(cards)}")
    print(f"   去重后 metaId 数: {len(meta_ids)}")
    print(f"   每个 metaId 下载 {len(SIZES)} 个尺寸: {', '.join(SIZES)}")
    print(f"   总共需要下载: {len(meta_ids) * len(SIZES)} 个文件")
    print(f"   输出目录: {os.path.abspath(OUTPUT_DIR)}")
    print()

    # 创建输出目录
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 下载
    total = len(meta_ids) * len(SIZES)
    done = 0
    skipped = 0
    failed = 0
    total_bytes = 0

    for meta_id in sorted(meta_ids):
        for size in SIZES:
            done += 1
            filename = f"{meta_id}{size}.webp"
            filepath = os.path.join(OUTPUT_DIR, filename)

            # 如果文件已存在且大小 > 0，跳过
            if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                skipped += 1
                print(f"  [{done}/{total}] ⏭ 已存在: {filename}")
                continue

            url = f"{CDN_BASE}/{meta_id}{size}.webp"
            print(f"  [{done}/{total}] ⬇ 下载: {filename} ...", end=" ", flush=True)

            file_size = download_file(url, filepath)
            if file_size is not None:
                total_bytes += file_size
                print(f"✓ ({file_size / 1024:.1f} KB)")
            else:
                failed += 1

            # 请求间隔，避免被 CDN 限流
            time.sleep(.3)

    print()
    print(f"✅ 下载完成!")
    print(f"   成功: {done - skipped - failed}")
    print(f"   跳过(已存在): {skipped}")
    print(f"   失败: {failed}")
    print(f"   总大小: {total_bytes / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
