#!/usr/bin/env python3
"""
BLZD 卡图映射表生成器 v2
========================
使用从 YugiohMeta 页面提取的 {metaId, englishName} 硬编码数据，
通过英文名在 YGOCDB API 搜索获取 password，
结合 ocg_blzd.json 中的 setNumber，生成 blzd_image_map.json。

用法:
  python tools/build_blzd_image_map.py              # 仅生成映射表
  python tools/build_blzd_image_map.py --download   # 生成映射表 + 下载本地卡图
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent
BLZD_DATA_FILE = PROJECT_ROOT / "data" / "ocg" / "cards" / "ocg_blzd.json"
OUTPUT_MAP_FILE = PROJECT_ROOT / "data" / "ocg" / "blzd_image_map.json"
LOCAL_IMAGES_DIR = PROJECT_ROOT / "data" / "ocg" / "images" / "blzd"

# S3 CDN
S3_CDN_BASE = "https://s3.duellinksmeta.com/cards"
YGOCDB_API = "https://ygocdb.com/api/v0/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# ========================================
# 从 YugiohMeta BLZD 页面提取的 80 张卡数据
# 提取时间: 2026-03-06
# 来源: https://www.yugiohmeta.com/articles/sets/ocg/blzd
# ========================================
YUGIOHMETA_CARDS = [
    {"metaId": "6951ee2bdd1e2c58763c9d40", "name": "Lahamu the Messenger of Sacred Scripture"},
    {"metaId": "69662bdc2c7c9b5c492cf594", "name": "Clown Clan Diablo"},
    {"metaId": "69662c04d823ec5fce0ffa67", "name": "Clown Clan Meteor"},
    {"metaId": "696b88e8a9ac30c9e561d6b6", "name": "Kewl Tune Crackle"},
    {"metaId": "694871a81bf6012e25188bbd", "name": "Predaplant Baalthea"},
    {"metaId": "69662c26a629bbc400008773", "name": "Clown Clan Devils"},
    {"metaId": "69658b280789ce3f707bef6e", "name": "Trito Enneacraft - \"exapatisIA\""},
    {"metaId": "6932294cbed2c9fcaaebfe00", "name": "Heavy Knight Babel Decker"},
    {"metaId": "69322970bed2c9fcaaec02b5", "name": "Noctilucent Train Bleu Traveler"},
    {"metaId": "6942d52ee40446483d3d706d", "name": "Transient Masquerader of Illusion"},
    {"metaId": "6962438afb04d3eac8bf4fee", "name": "Diabrocken of the Ghost Light"},
    {"metaId": "691435fb4e1cf3894cc791be", "name": "Fiend Piece Golem"},
    {"metaId": "696243afac9d56a1a13d92f6", "name": "Convex Knight"},
    {"metaId": "694874d85e1745f6741984c8", "name": "Familiars of the Spiritual Arts"},
    {"metaId": "691435c6fbbf5786cf6e1b2c", "name": "Darkness Resonator"},
    {"metaId": "694870c78665ec9779b06d42", "name": "Predaplant Lilizard"},
    {"metaId": "6948731ee7e7f1a00108fc1b", "name": "Assault Sonic Warrior"},
    {"metaId": "695014ece5a2d4f4e91de8a4", "name": "Mimighoul Flower"},
    {"metaId": "694871101bf6012e25188b80", "name": "Predaplant Longinephila"},
    {"metaId": "6942d4f7eb1dc3118af40691", "name": "Archfiend Usurpation"},
    {"metaId": "69663096dd1b651fdc4cf9fa", "name": "Clown Clan \"Matinee\""},
    {"metaId": "69143687fbbf5786cf6e2742", "name": "Crimson Call"},
    {"metaId": "696247a99aa8d52569898db4", "name": "DoomZ Command \"A.D.R.A.S.T.E.I.A.\""},
    {"metaId": "696580a4dbb23bd17dc22983", "name": "Enneacraft Reset"},
    {"metaId": "69322a8bbed2c9fcaaec24de", "name": "Exceptional Schedule"},
    {"metaId": "69322abd60185ac022e751ed", "name": "Fairy Tail Ball"},
    {"metaId": "69322aaabed2c9fcaaec2921", "name": "Fairy Tail Long Long Ago"},
    {"metaId": "6965639f9f53ecd95a0b9017", "name": "H-E-R-O Flash!"},
    {"metaId": "696246449429ca88fd501edb", "name": "Null Power Patron Realm - Vidria"},
    {"metaId": "69322ad17f4cc0feb5fb9717", "name": "Tales of Fairy Tail"},
    {"metaId": "696246522c4839f55b2899ed", "name": "Artmage Impact -Recapture-"},
    {"metaId": "69624473f33102e9961baeb9", "name": "Bayt'al-Hecahands"},
    {"metaId": "69662cccaa260c1f9eae514f", "name": "Clown Clan \"New Face\""},
    {"metaId": "69662caee456c14d7305b51a", "name": "Clown Clan \"Soiree\""},
    {"metaId": "696243d3cf183019a7088b0f", "name": "Northern Cross Fire"},
    {"metaId": "6962452c406c1f415578116e", "name": "Summon Shock"},
    {"metaId": "69143696fbbf5786cf6e2841", "name": "The Ruler's Rumbling"},
    {"metaId": "695015513331e53ebe34d200", "name": "Breachborrel Dragon"},
    {"metaId": "69624447a700f195572b0c5a", "name": "Hecahands Dandalos"},
    {"metaId": "693229cbd655c36a12358cc4", "name": "Weaver of Fairy Tail Tales"},
    {"metaId": "691436674e1cf3894cc798b5", "name": "Crimson Blade Dragon"},
    {"metaId": "69322a3cbed2c9fcaaec1b79", "name": "Superdreadnought Rail Cannon Flying Launcher"},
    {"metaId": "69487025bff3bb5609e270af", "name": "Cherubidamn Irisfiel"},
    {"metaId": "69624790e917a5c4777c229f", "name": "DoomZ XIII Over - Graflario"},
    {"metaId": "69322a6bd655c36a123597d0", "name": "Fairy Tail - Wickat"},
    {"metaId": "6942d4c9e40446483d3d6812", "name": "Doom Regina Archfiend"},
    {"metaId": "696245ecd1f607e0b4acbf67", "name": " Power Patron Shadow Machine Zegredo"},
    {"metaId": "696245c8fe9d307cf941f8f5", "name": "Power Patron Shadow Beast Nervedo"},
    {"metaId": "696246090bf84b9e66f834ce", "name": "Power Patron Shadow Spirit Junordo"},
    {"metaId": "6914361e4e1cf3894cc793cc", "name": "Red Nova Dragon/Assault Mode"},
    {"metaId": "69662c5a29c16f0dd070049a", "name": "Clown Clan \"Rehearsal\""},
    {"metaId": "6948760ce3ea042050503480", "name": "Junk Signal"},
    {"metaId": "694875c9a3979e6ba7dbdfd6", "name": "Possessed Resonance"},
    {"metaId": "6948763415ce6383c718d88b", "name": "Predaprimitive"},
    {"metaId": "69624638898826496ac8bfa9", "name": "Unleashed Power Patron Portal - Terminus"},
    {"metaId": "69679eb1ba187bd58177f466", "name": "WAKE CUP! Kuro"},
    {"metaId": "6962451089a952251fd5f4a8", "name": "One of Two"},
    {"metaId": "696571f9fc9b47d64540bf32", "name": "Moving Point Pendulum"},
    {"metaId": "69662bb0b83740f36d78ea0f", "name": "Clown Clan Flare"},
    {"metaId": "696586b246773047f47a4cc9", "name": "Enneacraft - Atil.SPIA"},
    {"metaId": "69624625108f2e0703ef807c", "name": "Elfnote Regina"},
    {"metaId": "6962442efc2eade1a1a8d6cb", "name": "Hecahands Makibel"},
    {"metaId": "691435de4e1cf3894cc78f88", "name": "Power Vice Dragon"},
    {"metaId": "693229b3d655c36a12358ae4", "name": "Fairy Tail - Matchlille"},
    {"metaId": "6950151b95146ba563150964", "name": "Draselea the Blood Tree Dragon Princess"},
    {"metaId": "696b88b8fe4fb91ad3c5d9a5", "name": "Kewl Tune Rotary"},
    {"metaId": "69662c86960003a75e055eda", "name": "Clown Clan \"Malabarism\""},
    {"metaId": "6968e3c658fa67626497da31", "name": "Solemn Report"},
    {"metaId": "694871576b25e2eb8c8be599", "name": "Starving Venom Wing Dragon"},
    {"metaId": "693229eebed2c9fcaaec12d1", "name": "Chronicler of Fairy Tail Tales"},
    {"metaId": "696b8914053d62f0578501fe", "name": "Kewl Tune Back 2 Back"},
    {"metaId": "6914363bfbbf5786cf6e2252", "name": "The Crimson King"},
    {"metaId": "69322a1ed655c36a12359229", "name": "Superdreadnought Rail Cannon Gustav Rocket"},
    {"metaId": "696245a2101885d4c40e9c91", "name": "Vidrium the Power Patron of Chaos Extermination"},
    {"metaId": "69662b7a9c97d6fb5e3940e4", "name": "Clown Clan Whiteface"},
    {"metaId": "694876616b25e2eb8c8be7bf", "name": "Apex Polymerization"},
    {"metaId": "6948753abff3bb5609e271ac", "name": "Four Charmers in Profusion"},
    {"metaId": "6948720c131604f9a8437f10", "name": "Red Hypernova Dragon"},
    {"metaId": "696244059aa8d525698984ac", "name": "Fidraulis Harmonia"},
    {"metaId": "696b893cc11fc3c444cf73fd", "name": "Dominus Spark"},
]


def fetch_json(url, timeout=15):
    """发送 HTTP GET 请求并返回 JSON"""
    req = urllib.request.Request(url, headers=HEADERS)
    resp = urllib.request.urlopen(req, timeout=timeout)
    return json.loads(resp.read().decode("utf-8"))


def load_blzd_data():
    """加载 ocg_blzd.json，返回 {setNumber -> password} 映射"""
    with open(BLZD_DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    cards = {}
    for card in data["cardIds"]:
        password = str(card["id"])
        set_number = card["setNumber"]
        cards[password] = set_number
    
    print(f"[OK] 从 ocg_blzd.json 加载了 {len(cards)} 张卡")
    return cards


def build_mapping():
    """用英文名通过 YGOCDB API 搜索获取 password，建立 password -> metaId 映射"""
    blzd_data = load_blzd_data()  # password -> setNumber
    
    # 反转为 setNumber -> password，方便后续匹配
    sn_to_pw = {sn: pw for pw, sn in blzd_data.items()}
    
    # 建立英文名索引（用于匹配）
    name_to_meta = {}
    for card in YUGIOHMETA_CARDS:
        name_to_meta[card["name"].strip()] = card["metaId"]
    
    print(f"[OK] YugiohMeta 数据: {len(YUGIOHMETA_CARDS)} 张卡")
    print(f"\n[...] 通过 YGOCDB API 搜索英文名获取 password...")
    
    result = {}
    matched = 0
    failed = []
    
    for i, card in enumerate(YUGIOHMETA_CARDS):
        en_name = card["name"].strip()
        meta_id = card["metaId"]
        
        print(f"  [{i+1}/80] '{en_name[:50]}'... ", end="", flush=True)
        
        url = f"{YGOCDB_API}?search={urllib.parse.quote(en_name)}"
        try:
            data = fetch_json(url)
            if "result" in data and len(data["result"]) > 0:
                password = str(data["result"][0]["id"])
                set_number = blzd_data.get(password, "???")
                
                if password in blzd_data:
                    result[password] = {
                        "metaId": meta_id,
                        "name": en_name,
                        "setNumber": set_number
                    }
                    matched += 1
                    print(f"OK pw={password} ({set_number})")
                else:
                    # YGOCDB 返回的卡不在 BLZD 中，可能是同名卡
                    print(f"WARN pw={password} 不在 BLZD 中")
                    failed.append((en_name, meta_id, f"password {password} 不在 BLZD"))
            else:
                print("NOT FOUND")
                failed.append((en_name, meta_id, "YGOCDB 无结果"))
        except Exception as e:
            print(f"ERROR: {e}")
            failed.append((en_name, meta_id, str(e)))
        
        time.sleep(0.3)
    
    print(f"\n=== 匹配结果: 成功 {matched}/80, 失败 {len(failed)} ===")
    if failed:
        print("\n--- 未匹配的卡片 ---")
        for name, mid, reason in failed:
            print(f"  '{name}' (metaId={mid}): {reason}")
    
    return result, failed


def generate_image_map(card_mappings):
    """生成 blzd_image_map.json"""
    output = {
        "_说明": "BLZD 卡图映射表 -- 卡片密码(password) -> YugiohMeta S3 CDN 图片ID",
        "_图片URL格式": f"{S3_CDN_BASE}/{{metaId}}_w{{尺寸}}.webp",
        "_可用尺寸": "w100, w140, w200, w260, w360, w420",
        "_数据来源": "从 yugiohmeta.com/articles/sets/ocg/blzd 页面提取 + YGOCDB API 匹配",
        "_更新时间": time.strftime("%Y-%m-%d"),
        "cards": card_mappings
    }
    
    with open(OUTPUT_MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n[OK] 映射表已保存: {OUTPUT_MAP_FILE}")
    print(f"     包含 {len(card_mappings)} 张卡")


def download_images(card_mappings):
    """从 S3 CDN 下载卡图到本地"""
    LOCAL_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    
    sizes = ["_w200", "_w420"]
    total = len(card_mappings)
    downloaded = 0
    skipped = 0
    errors = 0
    
    print(f"\n[...] 下载卡图到 {LOCAL_IMAGES_DIR}")
    print(f"      共 {total} 张卡 x {len(sizes)} 尺寸 = {total * len(sizes)} 个文件")
    
    for i, (password, info) in enumerate(card_mappings.items()):
        meta_id = info["metaId"]
        set_number = info.get("setNumber", "???")
        
        for suffix in sizes:
            filename = f"{meta_id}{suffix}.webp"
            filepath = LOCAL_IMAGES_DIR / filename
            
            if filepath.exists():
                skipped += 1
                continue
            
            url = f"{S3_CDN_BASE}/{meta_id}{suffix}.webp"
            try:
                req = urllib.request.Request(url, headers=HEADERS)
                resp = urllib.request.urlopen(req, timeout=15)
                data = resp.read()
                
                with open(filepath, "wb") as f:
                    f.write(data)
                
                downloaded += 1
                size_kb = len(data) / 1024
                print(f"  [{i+1}/{total}] {set_number} {suffix}: {size_kb:.1f}KB OK")
            except Exception as e:
                errors += 1
                print(f"  [{i+1}/{total}] {set_number} {suffix}: FAIL {e}")
            
            time.sleep(0.1)
    
    print(f"\n=== 下载完成: 新增 {downloaded}, 跳过 {skipped}, 失败 {errors} ===")
    total_size = sum(f.stat().st_size for f in LOCAL_IMAGES_DIR.glob("*.webp"))
    print(f"    本地目录大小: {total_size / 1024 / 1024:.1f} MB")


def main():
    download = "--download" in sys.argv
    
    print("=" * 60)
    print("BLZD Image Map Builder v2")
    print("=" * 60)
    
    # 第一步: 通过 YGOCDB 搜索英文名获取 password，建立映射
    card_mappings, failed = build_mapping()
    
    if not card_mappings:
        print("[FAIL] 未获取到任何映射数据")
        sys.exit(1)
    
    # 第二步: 生成映射表文件
    generate_image_map(card_mappings)
    
    # 第三步: 可选下载本地卡图
    if download:
        download_images(card_mappings)
    else:
        print("\n[TIP] 添加 --download 参数可下载本地卡图备份")
    
    print("\n[DONE]")


if __name__ == "__main__":
    main()
