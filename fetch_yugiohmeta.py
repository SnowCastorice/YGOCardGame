#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 YugiohMeta (yugiohmeta.com) 构建卡牌密码 → 卡图ID映射表

【说明】
  yugiohmeta 的卡图存储在 S3 CDN，URL 格式为：
    https://s3.duellinksmeta.com/cards/{_id}_w{尺寸}.webp
  
  但 _id 是 MongoDB ObjectID，不能直接从卡牌密码推导。
  本脚本通过查询 yugiohmeta API，批量构建 "卡牌密码 → _id" 的映射表，
  供前端直接拼接卡图 URL，无需运行时再调用 API。

【输出文件】
  data/tcg/yugiohmeta_map.json — TCG 卡图映射表

【使用方法】
  1. 为指定卡包构建映射（通过 setCode）:
     python fetch_yugiohmeta.py build "Maze of Muertos"
     python fetch_yugiohmeta.py build "Burst Protocol"
  
  2. 为所有已配置的 TCG 卡包构建映射:
     python fetch_yugiohmeta.py build-all
  
  3. 查看已有映射表信息:
     python fetch_yugiohmeta.py info
  
  4. 测试单张卡的映射:
     python fetch_yugiohmeta.py test 89631141

【可用卡图尺寸】
  w100 (~5KB), w140 (~10KB), w200 (~17KB), w260 (~28KB), w360 (~47KB), w420 (~59KB)

【注意事项】
  - yugiohmeta API 不支持批量查询，每张卡需要单独请求
  - 请保持合理的请求间隔，避免被限流
  - 映射表是增量更新的，不会覆盖已有的映射
"""

import urllib.request
import json
import sys
import time
import os
from datetime import datetime

# ===== 配置 =====
YUGIOHMETA_API = "https://www.yugiohmeta.com/api/v1"
S3_CDN_BASE = "https://s3.duellinksmeta.com/cards"
REQUEST_INTERVAL = 0.5  # 请求间隔（秒），保守设置避免被限流
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# 文件路径
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TCG_PACKS_PATH = os.path.join(SCRIPT_DIR, "data", "tcg", "packs.json")
MAP_OUTPUT_PATH = os.path.join(SCRIPT_DIR, "data", "tcg", "yugiohmeta_map.json")

# YGOProDeck API（用于获取卡包中所有卡牌的密码列表）
YGOPRODECK_API = "https://db.ygoprodeck.com/api/v7"
YGOPRODECK_INTERVAL = 0.35  # YGOProDeck 限流间隔


def api_request(url):
    """发送 API 请求，返回 JSON 数据"""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode("utf-8"))
        return data
    except urllib.error.HTTPError as e:
        print(f"  ❌ HTTP 错误: {e.code} - {url}")
        return None
    except Exception as e:
        print(f"  ❌ 请求失败: {url} - {e}")
        return None


def load_map():
    """加载已有的映射表"""
    if os.path.exists(MAP_OUTPUT_PATH):
        with open(MAP_OUTPUT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "_说明": "YugiohMeta 卡图映射表 —— 卡牌密码(password) → S3 CDN 图片ID",
        "_图片URL格式": f"{S3_CDN_BASE}/{{_id}}_w{{尺寸}}.webp",
        "_可用尺寸": "w100, w140, w200, w260, w360, w420",
        "_更新方式": "运行 python fetch_yugiohmeta.py build-all",
        "_更新时间": "",
        "cards": {},
        "stats": {
            "totalCards": 0,
            "totalPacks": 0,
            "packList": []
        }
    }


def save_map(map_data):
    """保存映射表到文件"""
    map_data["_更新时间"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    map_data["stats"]["totalCards"] = len(map_data["cards"])

    os.makedirs(os.path.dirname(MAP_OUTPUT_PATH), exist_ok=True)
    with open(MAP_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(map_data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"\n  ✅ 映射表已保存: {MAP_OUTPUT_PATH}")
    print(f"     共 {map_data['stats']['totalCards']} 张卡的映射")


def get_passwords_from_ygoprodeck(set_code):
    """
    从 YGOProDeck API 获取指定卡包中所有卡牌的密码列表
    返回: [(password, cardName), ...]
    """
    print(f"  📡 正在从 YGOProDeck 获取卡包 [{set_code}] 的卡牌列表...")
    url = f"{YGOPRODECK_API}/cardinfo.php?cardset={urllib.parse.quote(set_code)}"
    data = api_request(url)

    if not data or "data" not in data:
        print(f"  ❌ 从 YGOProDeck 获取卡包 [{set_code}] 失败")
        return []

    cards = []
    for card in data["data"]:
        password = card.get("id")
        name = card.get("name", "")
        if password:
            cards.append((str(password), name))

    print(f"  ✅ 获取到 {len(cards)} 张卡牌")
    return cards


def query_yugiohmeta(password):
    """
    查询 yugiohmeta API，获取指定密码的卡图映射信息
    返回: {
        "id": "MongoDB _id (标准版卡图)",
        "name": "英文卡名",
        "alts": { "卡包名": "_id", ... }  # 异画版映射
    } 或 None
    """
    url = f"{YUGIOHMETA_API}/cards?konamiID={password}"
    data = api_request(url)

    if not data or len(data) == 0:
        return None

    result = {
        "id": None,
        "name": "",
        "alts": {}
    }

    for card in data:
        is_alt = card.get("alternateArt", False)
        card_id = card.get("_id", "")

        if not is_alt:
            # 标准版卡图
            result["id"] = card_id
            result["name"] = card.get("name", "")
        else:
            # 异画版：记录来源卡包 → _id 的映射
            for obtain in card.get("obtain", []):
                source = obtain.get("source", {})
                pack_name = source.get("name", "")
                if pack_name:
                    result["alts"][pack_name] = card_id

    # 如果没有找到标准版（所有条目都是异画），取第一个作为默认
    if result["id"] is None and data:
        result["id"] = data[0].get("_id", "")
        result["name"] = data[0].get("name", "")

    return result


def build_map_for_pack(set_code, map_data):
    """
    为指定 TCG 卡包构建映射
    """
    print(f"\n{'='*60}")
    print(f"📦 正在为卡包 [{set_code}] 构建映射...")
    print(f"{'='*60}")

    # 1. 从 YGOProDeck 获取卡牌密码列表
    cards = get_passwords_from_ygoprodeck(set_code)
    if not cards:
        print(f"  ⚠️ 卡包 [{set_code}] 没有获取到卡牌，跳过")
        return 0

    time.sleep(YGOPRODECK_INTERVAL)

    # 2. 逐个查询 yugiohmeta
    new_count = 0
    skip_count = 0
    fail_count = 0

    for i, (password, name) in enumerate(cards, 1):
        # 检查是否已有映射
        if password in map_data["cards"]:
            skip_count += 1
            continue

        # 查询 yugiohmeta
        time.sleep(REQUEST_INTERVAL)
        result = query_yugiohmeta(password)

        if result and result["id"]:
            map_data["cards"][password] = result
            new_count += 1
            status = "✅"
        else:
            fail_count += 1
            status = "❌"

        # 进度显示
        progress = f"[{i}/{len(cards)}]"
        print(f"  {status} {progress} {password} → {result['id'][:12] + '...' if result and result['id'] else 'NOT FOUND'} | {name}")

    # 更新卡包列表统计
    if set_code not in map_data["stats"]["packList"]:
        map_data["stats"]["packList"].append(set_code)
        map_data["stats"]["totalPacks"] = len(map_data["stats"]["packList"])

    print(f"\n  📊 卡包 [{set_code}] 完成:")
    print(f"     新增: {new_count} | 跳过(已有): {skip_count} | 失败: {fail_count}")

    return new_count


def cmd_build(set_code):
    """为指定卡包构建映射"""
    map_data = load_map()
    new_count = build_map_for_pack(set_code, map_data)
    save_map(map_data)
    return new_count


def cmd_build_all():
    """为所有已配置的 TCG 卡包构建映射"""
    # 读取 TCG 卡包配置
    if not os.path.exists(TCG_PACKS_PATH):
        print(f"  ❌ 未找到 TCG 卡包配置: {TCG_PACKS_PATH}")
        return

    with open(TCG_PACKS_PATH, "r", encoding="utf-8") as f:
        tcg_config = json.load(f)

    packs = tcg_config.get("packs", [])
    if not packs:
        print("  ⚠️ TCG 卡包配置中没有任何卡包")
        return

    print(f"\n🚀 开始为 {len(packs)} 个 TCG 卡包构建 YugiohMeta 映射...")
    print(f"   请求间隔: {REQUEST_INTERVAL}s (yugiohmeta) / {YGOPRODECK_INTERVAL}s (ygoprodeck)")

    map_data = load_map()
    total_new = 0

    for i, pack in enumerate(packs, 1):
        set_code = pack.get("setCode", "")
        pack_name = pack.get("packName", "")
        if not set_code:
            print(f"\n  ⚠️ 跳过无 setCode 的卡包: {pack_name}")
            continue

        print(f"\n{'─'*60}")
        print(f"  [{i}/{len(packs)}] {pack_name} (setCode: {set_code})")
        new_count = build_map_for_pack(set_code, map_data)
        total_new += new_count

        # 每个卡包完成后保存（防止中途中断丢失数据）
        save_map(map_data)

        if i < len(packs):
            time.sleep(YGOPRODECK_INTERVAL)

    print(f"\n{'='*60}")
    print(f"🎉 全部完成！新增映射: {total_new} 张卡")
    print(f"   映射表总计: {map_data['stats']['totalCards']} 张卡 / {map_data['stats']['totalPacks']} 个卡包")


def cmd_test(password):
    """测试单张卡的映射"""
    print(f"\n🔍 测试查询: 密码 {password}")

    result = query_yugiohmeta(password)
    if not result:
        print(f"  ❌ 未找到密码 {password} 的卡图信息")
        return

    print(f"  卡名: {result['name']}")
    print(f"  标准版 _id: {result['id']}")
    print(f"  标准版图片 URL:")
    print(f"    小图: {S3_CDN_BASE}/{result['id']}_w200.webp")
    print(f"    大图: {S3_CDN_BASE}/{result['id']}_w420.webp")

    if result["alts"]:
        print(f"\n  异画版 ({len(result['alts'])} 个):")
        for pack_name, alt_id in result["alts"].items():
            print(f"    📦 {pack_name}")
            print(f"       _id: {alt_id}")
            print(f"       图片: {S3_CDN_BASE}/{alt_id}_w420.webp")
    else:
        print(f"\n  无异画版")


def cmd_info():
    """显示映射表信息"""
    if not os.path.exists(MAP_OUTPUT_PATH):
        print(f"  ⚠️ 映射表文件不存在: {MAP_OUTPUT_PATH}")
        print(f"  💡 运行 'python fetch_yugiohmeta.py build-all' 来生成映射表")
        return

    map_data = load_map()
    print(f"\n📊 YugiohMeta 映射表信息")
    print(f"{'─'*40}")
    print(f"  文件路径: {MAP_OUTPUT_PATH}")
    print(f"  更新时间: {map_data.get('_更新时间', '未知')}")
    print(f"  总卡牌数: {map_data['stats']['totalCards']}")
    print(f"  总卡包数: {map_data['stats']['totalPacks']}")

    if map_data["stats"]["packList"]:
        print(f"\n  已映射的卡包:")
        for pack_name in map_data["stats"]["packList"]:
            print(f"    📦 {pack_name}")

    # 统计有异画的卡
    alt_count = sum(1 for v in map_data["cards"].values() if v.get("alts"))
    print(f"\n  有异画版的卡: {alt_count}")


def main():
    # 需要 urllib.parse
    import urllib.parse

    args = sys.argv[1:]

    if not args:
        print(__doc__)
        return

    command = args[0].lower()

    if command == "build":
        if len(args) < 2:
            print("❌ 请指定卡包 setCode，例: python fetch_yugiohmeta.py build \"Maze of Muertos\"")
            return
        set_code = args[1]
        cmd_build(set_code)

    elif command == "build-all":
        cmd_build_all()

    elif command == "test":
        if len(args) < 2:
            print("❌ 请指定卡牌密码，例: python fetch_yugiohmeta.py test 89631141")
            return
        cmd_test(args[1])

    elif command == "info":
        cmd_info()

    else:
        print(f"❌ 未知命令: {command}")
        print(__doc__)


if __name__ == "__main__":
    # 在文件顶部导入会在某些环境下失败，这里确保可用
    import urllib.parse
    main()
