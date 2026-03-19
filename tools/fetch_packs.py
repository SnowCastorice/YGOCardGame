#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 YGOCDB (ygocdb.com) 抓取 OCG/TCG 卡包列表和 OCG 卡包收录信息

【数据存储结构】
  - data/ocg/packs.json          → 卡包元信息（不含卡牌列表，只有 cardFile 引用）
  - data/ocg/cards/{packId}.json → 每个卡包的独立卡牌列表文件
  - data/tcg/packs.json          → TCG 卡包配置（只需 setCode，无需卡牌列表）

使用方法:
  1. 列出所有 OCG 卡包（最新20个）:
     python fetch_packs.py list ocg
     python fetch_packs.py list ocg --limit 50
     
  2. 列出所有 TCG 卡包（最新20个）:
     python fetch_packs.py list tcg
     
  3. 获取指定 OCG 卡包的卡牌收录:
     python fetch_packs.py fetch <packId>
     例: python fetch_packs.py fetch 1000009559000
     
  4. 获取指定 OCG 卡包并写入独立文件 + 更新 packs.json:
     python fetch_packs.py fetch <packId> --write
     （会写入 data/ocg/cards/{packId}.json 卡牌文件，并更新 packs.json 元信息）
     
  5. 获取最新一期 OCG 补充包:
     python fetch_packs.py latest ocg
     python fetch_packs.py latest ocg --write

  6. 更新卡包列表文件 (data/ocg/pack_list.json + data/tcg/pack_list.json):
     python fetch_packs.py gen-list
"""

import urllib.request
import re
import json
import sys
import time
import os
from datetime import datetime

# ===== 配置 =====
YGOCDB_BASE = "https://ygocdb.com"
REQUEST_INTERVAL = 0.35  # 请求间隔（秒），遵守 API 限流规范
# 拆分后的独立路径：OCG 和 TCG 分别存储
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))  # tools/
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)                # 项目根目录
OCG_PACKS_PATH = os.path.join(PROJECT_ROOT, "data", "ocg", "packs.json")
TCG_PACKS_PATH = os.path.join(PROJECT_ROOT, "data", "tcg", "packs.json")
OCG_CARDS_DIR = os.path.join(PROJECT_ROOT, "data", "ocg", "cards")  # OCG 独立卡牌文件目录
OCG_PACK_LIST_PATH = os.path.join(PROJECT_ROOT, "data", "ocg", "pack_list.json")
TCG_PACK_LIST_PATH = os.path.join(PROJECT_ROOT, "data", "tcg", "pack_list.json")
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def fetch_html(url):
    """获取网页 HTML 内容"""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.read().decode("utf-8")
    except Exception as e:
        print(f"  ❌ 请求失败: {url} - {e}")
        return None


def parse_pack_list(html, region="ocg"):
    """
    从 /packs 页面 HTML 解析卡包列表
    region: 'ocg' 或 'tcg'
    
    返回格式: [
        {
            "packId": "1000009559000",    # YGOCDB 内部ID
            "packCode": "BLZD",           # 卡包编码
            "packName": "ブレイジング・ドミニオン [BLAZING DOMINION]",  # 日文包名
            "releaseDate": "2026-01-24",  # 发售日期
            "cardCount": 80               # 收录张数
        },
        ...
    ]
    """
    # 定位 OCG/TCG 区域
    if region == "ocg":
        # OCG 区域: 从 id="ocg" 到 id="tcg"
        match = re.search(r'id="ocg">(.*?)(?=<div[^>]*id="tcg")', html, re.DOTALL)
    else:
        # TCG 区域: 从 id="tcg" 到结尾
        match = re.search(r'id="tcg">(.*?)(?=</div>\s*</div>\s*</div>\s*$|$)', html, re.DOTALL)
    
    if not match:
        print(f"  ❌ 未找到 {region.upper()} 区域")
        return []
    
    region_html = match.group(1)
    
    # 解析每个卡包条目
    # 格式: <li class="pack">
    #          <span>日期</span><span>编码</span><span>数量</span>
    #          <a href="/pack/{id}">包名</a>
    #        </li>
    packs = []
    pack_pattern = re.compile(
        r'<li\s+class="pack">\s*'
        r'<span>([^<]*)</span>\s*'          # 发售日期
        r'<span>([^<]*)</span>\s*'          # 卡包编码
        r'<span>([^<]*)</span>\s*'          # 收录张数
        r'<a\s+href="/pack/(\d+)"[^>]*>'   # packId
        r'([^<]*)</a>',                     # 卡包名称
        re.DOTALL
    )
    
    for m in pack_pattern.finditer(region_html):
        release_date = m.group(1).strip()
        pack_code = m.group(2).strip()
        card_count = m.group(3).strip()
        pack_id = m.group(4).strip()
        pack_name = m.group(5).strip()
        
        packs.append({
            "packId": pack_id,
            "packCode": pack_code,
            "packName": pack_name,
            "releaseDate": release_date,
            "cardCount": int(card_count) if card_count.isdigit() else 0
        })
    
    return packs


def parse_pack_cards(html):
    """
    从 /pack/{id} 详情页解析卡牌列表
    
    返回格式: [
        {
            "id": 83445539,        # 卡牌密码（YGOProDeck 中的 id）
            "cid": 22510,          # YGOCDB 内部 cid
            "name_cn": "暗冥共鸣者",  # 中文名
            "name_jp": "ダークネス・リゾネーター",  # 日文名
        },
        ...
    ]
    """
    cards = []
    
    # 每张卡的区域以 <div class="row card result"> 开始
    card_blocks = re.split(r'<div\s+class="row card result">', html)
    
    for block in card_blocks[1:]:  # 跳过第一个（不是卡牌区块）
        card = {}
        
        # 提取密码: <a href="/card/83445539">
        pwd_match = re.search(r'<a\s+href="/card/(\d+)"', block)
        if pwd_match:
            card["id"] = int(pwd_match.group(1))
        else:
            continue  # 没有密码则跳过
        
        # 提取中文名: <span lang="zh-Hans">暗冥共鸣者</span>
        cn_match = re.search(r'<span\s+lang="zh-Hans">([^<]*)</span>', block)
        card["name_cn"] = cn_match.group(1).strip() if cn_match else ""
        
        # 提取日文名: <span lang="ja-Jpan">xxx</span>
        jp_match = re.search(r'<span\s+lang="ja-Jpan">([^<]*)</span>', block)
        card["name_jp"] = jp_match.group(1).strip() if jp_match else ""
        
        # 提取 cid: <span class="cid text-muted">22510</span>
        cid_match = re.search(r'<span\s+class="cid text-muted">(\d+)</span>', block)
        card["cid"] = int(cid_match.group(1)) if cid_match else 0
        
        cards.append(card)
    
    return cards


def format_cards_json(cards):
    """
    将卡牌列表格式化为 cards.json 中 cardIds 的格式
    注意：暂不包含稀有度信息，默认全部为 "N"
    """
    entries = []
    for c in cards:
        hint = c.get("name_cn") or c.get("name_jp") or str(c["id"])
        entries.append({
            "id": c["id"],
            "rarityCode": "N",
            "name_hint": hint
        })
    return entries


def generate_pack_config(pack_info, card_entries):
    """
    生成 packs.json 中一个 OCG 卡包的元信息配置（不含 cardIds）
    cardIds 存储在独立文件 data/ocg/cards/{packId}.json 中
    """
    # 生成 packId: ocg_ + 小写编码
    pack_code = pack_info["packCode"]
    pack_id = f"ocg_{pack_code.lower()}"
    card_file = f"{pack_id}.json"  # 独立卡牌文件名
    
    config = {
        "packId": pack_id,
        "packName": pack_info["packName"],
        "packCode": pack_code,
        "releaseDate": pack_info["releaseDate"],
        "ygocdbPackId": pack_info["packId"],
        "cardsPerPack": 5,
        "totalCards": len(card_entries),
        "cardFile": card_file,
        "rarityRates": {
            "UR": 1,
            "SR": 4,
            "R": 25,
            "N": 70
        },
        "guaranteedRareSlot": True,
        "_说明": f"通过 YGOCDB 自动拉取，共{len(card_entries)}张卡，稀有度待补充"
    }
    
    return config


def write_card_file(pack_id, pack_code, pack_info, card_entries):
    """
    将卡牌列表写入独立的 JSON 文件 data/ocg/cards/{packId}.json
    """
    # 确保目录存在
    os.makedirs(OCG_CARDS_DIR, exist_ok=True)
    
    card_file_name = f"{pack_id}.json"
    card_file_path = os.path.join(OCG_CARDS_DIR, card_file_name)
    
    card_data = {
        "_说明": f"{pack_info['packName']} ({pack_code}) 卡包卡牌列表 —— 从 packs.json 拆分独立管理",
        "_数据源": f"通过 YGOCDB 自动拉取 (ygocdb.com/pack/{pack_info['packId']})",
        "packId": pack_id,
        "packCode": pack_code,
        "totalCards": len(card_entries),
        "cardIds": card_entries
    }
    
    with open(card_file_path, "w", encoding="utf-8") as f:
        json.dump(card_data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    
    print(f"  ✅ 卡牌文件已写入: {card_file_path}")
    return card_file_name


def write_to_ocg_packs(pack_config, card_entries, pack_info):
    """
    将卡包元信息写入 data/ocg/packs.json 的 packs 数组
    并将卡牌列表写入独立文件 data/ocg/cards/{packId}.json
    如果同 packCode 的卡包已存在则更新，否则插入到数组开头
    """
    # 1. 写入独立卡牌文件
    write_card_file(pack_config["packId"], pack_config["packCode"], pack_info, card_entries)
    
    # 2. 更新 packs.json 元信息（不含 cardIds）
    with open(OCG_PACKS_PATH, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    
    ocg_packs = data["packs"]
    
    # 查找是否已有同编码的卡包
    existing_idx = None
    for i, p in enumerate(ocg_packs):
        if p.get("packCode") == pack_config["packCode"] or p.get("packId") == pack_config["packId"]:
            existing_idx = i
            break
    
    if existing_idx is not None:
        print(f"  ♻️ 更新已有卡包: {pack_config['packName']} (位置 {existing_idx})")
        ocg_packs[existing_idx] = pack_config
    else:
        print(f"  ✨ 新增卡包: {pack_config['packName']}")
        ocg_packs.insert(0, pack_config)
    
    with open(OCG_PACKS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")  # 文件末尾换行
    
    print(f"  ✅ 元信息已写入 {OCG_PACKS_PATH}")


def cmd_list(region, limit=20):
    """列出卡包"""
    print(f"\n📦 正在获取 {region.upper()} 卡包列表...")
    html = fetch_html(f"{YGOCDB_BASE}/packs")
    if not html:
        return
    
    packs = parse_pack_list(html, region)
    print(f"  共找到 {len(packs)} 个 {region.upper()} 卡包\n")
    
    # 只显示前 limit 个
    show_packs = packs[:limit]
    
    # 表头
    print(f"  {'序号':>4}  {'发售日期':<12}  {'编码':<8}  {'张数':>4}  {'YGOCDB_ID':<16}  包名")
    print(f"  {'─' * 4}  {'─' * 12}  {'─' * 8}  {'─' * 4}  {'─' * 16}  {'─' * 30}")
    
    for i, p in enumerate(show_packs, 1):
        print(f"  {i:>4}  {p['releaseDate']:<12}  {p['packCode']:<8}  {p['cardCount']:>4}  {p['packId']:<16}  {p['packName']}")
    
    if len(packs) > limit:
        print(f"\n  ... 还有 {len(packs) - limit} 个卡包未显示 (使用 --limit 参数查看更多)")
    
    print(f"\n💡 提示: 使用 'python fetch_packs.py fetch <YGOCDB_ID>' 来获取指定卡包的卡牌列表")


def cmd_fetch(pack_id, write=False):
    """获取指定卡包的卡牌收录"""
    # 先获取卡包基本信息
    print(f"\n📦 正在获取卡包列表以查找包信息...")
    list_html = fetch_html(f"{YGOCDB_BASE}/packs")
    if not list_html:
        return
    
    # 在 OCG 和 TCG 中查找
    pack_info = None
    for region in ["ocg", "tcg"]:
        packs = parse_pack_list(list_html, region)
        for p in packs:
            if p["packId"] == pack_id:
                pack_info = p
                pack_info["region"] = region
                break
        if pack_info:
            break
    
    if not pack_info:
        print(f"  ❌ 未找到 YGOCDB_ID={pack_id} 的卡包")
        return
    
    print(f"  📋 找到卡包: {pack_info['packName']}")
    print(f"     编码: {pack_info['packCode']} | 日期: {pack_info['releaseDate']} | 区域: {pack_info['region'].upper()} | 收录: {pack_info['cardCount']}张")
    
    # 获取卡牌详情
    time.sleep(REQUEST_INTERVAL)
    print(f"\n🃏 正在获取卡牌列表...")
    detail_html = fetch_html(f"{YGOCDB_BASE}/pack/{pack_id}")
    if not detail_html:
        return
    
    cards = parse_pack_cards(detail_html)
    print(f"  ✅ 成功解析 {len(cards)} 张卡牌")
    
    if not cards:
        print("  ⚠️ 未解析到任何卡牌")
        return
    
    # 显示卡牌列表
    print(f"\n  {'序号':>4}  {'密码':<12}  {'CID':<8}  中文名")
    print(f"  {'─' * 4}  {'─' * 12}  {'─' * 8}  {'─' * 20}")
    for i, c in enumerate(cards, 1):
        name = c.get("name_cn") or c.get("name_jp") or "????"
        print(f"  {i:>4}  {c['id']:<12}  {c['cid']:<8}  {name}")
    
    # 格式化为 cardIds 格式
    card_entries = format_cards_json(cards)
    
    if write:
        pack_config = generate_pack_config(pack_info, card_entries)
        write_to_ocg_packs(pack_config, card_entries, pack_info)
    else:
        # 输出 JSON 到文件
        output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"_pack_{pack_id}_output.json")
        output_data = {
            "packInfo": pack_info,
            "cardIds": card_entries
        }
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"\n  📄 已输出到: {output_path}")
        print(f"  💡 使用 --write 参数可直接写入 cards.json")


def cmd_latest(region, write=False):
    """获取最新一期卡包"""
    print(f"\n📦 正在获取最新 {region.upper()} 卡包...")
    html = fetch_html(f"{YGOCDB_BASE}/packs")
    if not html:
        return
    
    packs = parse_pack_list(html, region)
    if not packs:
        print(f"  ❌ 未找到任何 {region.upper()} 卡包")
        return
    
    # 过滤掉只有1-2张卡的附录卡/赠品包，找到第一个有一定收录数量的卡包
    main_packs = [p for p in packs if p["cardCount"] >= 10]
    
    if not main_packs:
        print(f"  ❌ 未找到收录数 >= 10 的 {region.upper()} 卡包")
        return
    
    latest = main_packs[0]
    print(f"  📋 最新卡包: {latest['packName']}")
    print(f"     编码: {latest['packCode']} | 日期: {latest['releaseDate']} | 收录: {latest['cardCount']}张")
    
    # 获取卡牌详情
    time.sleep(REQUEST_INTERVAL)
    cmd_fetch(latest["packId"], write=write)


def cmd_gen_list():
    """从 YGOCDB 抓取完整 OCG/TCG 卡包列表，分别写入 data/ocg/pack_list.json 和 data/tcg/pack_list.json"""
    print("\n📦 正在从 YGOCDB 抓取完整卡包列表...")
    html = fetch_html(f"{YGOCDB_BASE}/packs")
    if not html:
        return
    
    ocg_packs = parse_pack_list(html, "ocg")
    tcg_packs = parse_pack_list(html, "tcg")
    
    print(f"  OCG: {len(ocg_packs)} 个卡包")
    print(f"  TCG: {len(tcg_packs)} 个卡包")
    
    # 将 packId 重命名为 ygocdbId，与 pack_list.json 的字段名保持一致
    for p in ocg_packs + tcg_packs:
        p["ygocdbId"] = p.pop("packId")
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    format_desc = {
        "ygocdbId": "YGOCDB 内部卡包ID（用于拉取卡包详情: ygocdb.com/pack/{ygocdbId}）",
        "packCode": "卡包编码",
        "packName": "卡包名称（日文/英文，取决于卡包类型）",
        "releaseDate": "发售日期",
        "cardCount": "收录卡牌数量"
    }
    
    # 写入 OCG 卡包列表
    ocg_data = {
        "_说明": "OCG 卡包列表数据 —— 数据来源: https://ygocdb.com/packs",
        "_格式说明": format_desc,
        "_更新时间": now_str,
        "_更新方式": "运行 python fetch_packs.py gen-list",
        "packs": ocg_packs
    }
    with open(OCG_PACK_LIST_PATH, "w", encoding="utf-8") as f:
        json.dump(ocg_data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    
    # 写入 TCG 卡包列表
    tcg_data = {
        "_说明": "TCG 卡包列表数据 —— 数据来源: https://ygocdb.com/packs",
        "_格式说明": format_desc,
        "_更新时间": now_str,
        "_更新方式": "运行 python fetch_packs.py gen-list",
        "packs": tcg_packs
    }
    with open(TCG_PACK_LIST_PATH, "w", encoding="utf-8") as f:
        json.dump(tcg_data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    
    print(f"\n  ✅ OCG 已写入: {OCG_PACK_LIST_PATH}")
    print(f"  ✅ TCG 已写入: {TCG_PACK_LIST_PATH}")
    print(f"  📅 更新时间: {now_str}")


def main():
    args = sys.argv[1:]
    
    if not args:
        print(__doc__)
        return
    
    command = args[0].lower()
    
    if command == "list":
        region = args[1].lower() if len(args) > 1 else "ocg"
        limit = 20
        if "--limit" in args:
            idx = args.index("--limit")
            if idx + 1 < len(args):
                limit = int(args[idx + 1])
        cmd_list(region, limit)
    
    elif command == "fetch":
        if len(args) < 2:
            print("❌ 请指定卡包 YGOCDB_ID，例: python fetch_packs.py fetch 1000009559000")
            return
        pack_id = args[1]
        write = "--write" in args
        cmd_fetch(pack_id, write=write)
    
    elif command == "latest":
        region = args[1].lower() if len(args) > 1 else "ocg"
        write = "--write" in args
        cmd_latest(region, write=write)
    
    elif command == "gen-list":
        cmd_gen_list()
    
    else:
        print(f"❌ 未知命令: {command}")
        print(__doc__)


if __name__ == "__main__":
    main()
