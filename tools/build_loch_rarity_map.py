"""
从 yugiohmeta.com 网页提取的 LOCH 卡包各稀有度 metaId 数据分析脚本。
建立 password → { rarity → metaId } 的完整映射。
"""
import json
import os

# ============================================
# 网页上按稀有度分组提取的 metaId 列表（按卡包内顺序排列）
# ============================================
WEB_DATA = {
    # Super Rare - 42张 (JP039-JP080)
    "SR": [
        "60c2b3aaa0e24f2d54a51b35","60c2b3aca0e24f2d54a5312c","62de1eaae9066c4257aa951d",
        "65ef2ba586dad12f01d138a8","60c2b3aba0e24f2d54a52a0e","60c2b3aaa0e24f2d54a51bf3",
        "60c2b3aca0e24f2d54a53bb6","62e0316e5f0fd2a1fe373774","60c2b3aca0e24f2d54a53113",
        "60c2b3aaa0e24f2d54a5206a","60c2b3aba0e24f2d54a5286b","60c2b3aaa0e24f2d54a522c4",
        "6704df48a250ffc82814b093","60c2b3aca0e24f2d54a53af3","60c2b3aba0e24f2d54a52e95",
        "60c2b3aba0e24f2d54a52536","6265e6d53ecc89b0e4f3052d","65ef2abfa96c38cc7f2002c9",
        "60c2b3aaa0e24f2d54a52030","60c2b3aca0e24f2d54a5382a","60c2b3aca0e24f2d54a53b76",
        "661bce466ec87b0f4bd79a25","669a5f474d5f5fd7b2abaed4","668e7b81f41bde5827d1a22d",
        "6713a5e9bc976516c1d27e40","60c2b3aba0e24f2d54a527de","652fcfec6dd9a84bf7678315",
        "655728058e692d8e1ffd8ee8","60c2b3aba0e24f2d54a52c52","60c2b3a9a0e24f2d54a517b6",
        "60c2b3aba0e24f2d54a52b5d","60c2b3aca0e24f2d54a5365e","60c2b3a9a0e24f2d54a51488",
        "60c2b3aba0e24f2d54a527a3","60c2b3aca0e24f2d54a536b5","6126b426f9d784006595dd66",
        "61ef0edf39cb086ec8b2b51e","64a64fc26cee34962d2172f3","65ef2bc786dad12f01d13dc6",
        "66e55ddd21d86b033a2cc34d","60c2b3aca0e24f2d54a533e4","60c2b3aca0e24f2d54a537c9"
    ],
    # Ultra Rare - 56张
    # JP001-JP018新卡每种有2个metaId（旧版图+LOCH新绘图），共36张
    # JP019-JP038（20种reprint UR卡），各1张，共20张
    # 总计 36 + 20 = 56
    "UR": [
        "6995c2dfabf90aebae0850ed","69931a4fbd8db41d05ddda9c","69486e128665ec9779b06c2a",
        "69a1612fb4acf1e9c446ef82","698451cccd341e76339cc0af","69986017879ebfe074300f85",
        "69a161413a5983362c9b5a61","698451154580b534f0889ca7","69845124ae09650287fba880",
        "69486dc17fff721c2d2ab34f","69486c91d8043dc79533f710","69a160098f8cbf98a4c80878",
        "699e7e7a8419601d5a5077ad","69a1602d30626f425bb8c799","69931761a8ccf2a075b2af3a",
        "69486ccccc3b933d5cad316e","69a160773a5983362c9b58e5","699319f6946fea90719975f4",
        "69a16760c6f106084c30adba","69931a224f241633125ed353","69486cfecc3b933d5cad3179",
        "69a160ed8f8cbf98a4c80a19","69662df409ab844edc3b28b6","69a16138211547f9667024b1",
        "69486d558db5a5b342f5083d","69a1610f30626f425bb8ca0c","699a4ebb66e693e6f792c1cb",
        "69a161276dd1798949025a58","69662f49f851189ddaf28bff","69a16118d8c34705d06d9ac2",
        "69662d2eec17b3d5404e77f3","69a1605495af605565618e5a","69a16736c6b06f7caddbd753",
        "69486a45cc3b933d5cad30e8","69486c39131604f9a8437d13","6983b335952466cf6d37a3c0",
        "69662dace456c14d7305b848","69a160f7ccd9119f5dbe826e","699319c8ce44cd72ea36fc97",
        "699b627fe996e5a7c96a8d12","69a160ffc064194636d37858","69662d70ad0c0050aabcbdef",
        "69a160a671d7e2f8145eb5ed","69662d0ba629bbc4000089c9","69a15fabebc6ba57ea226e3e",
        "699ff5d271d7e2f8145b4d5c","69a15fe60c46bf1a132b10ec","69931a7d866e8d87c0fa0c1d",
        "699317801e1e98f458b6ce8e","699317db67288245fc68bb0c","697a0b736e58fb3757c39a26",
        "694875e734407dc060a04be8","699318271e1e98f458b6cfe2","69931b371c07d7474854db33",
        "699cb5ef171db3ac20a0ca89","69a160ca38bd7bd36297d9f9"
    ],
    # Ultimate Rare - 21张 (同 SR 中的一部分，对应 UR 卡中的21张)
    "UTR": [
        "60c2b3aaa0e24f2d54a51b35","60c2b3aca0e24f2d54a53113","60c2b3aba0e24f2d54a5286b",
        "60c2b3aaa0e24f2d54a522c4","6704df48a250ffc82814b093","60c2b3aca0e24f2d54a53af3",
        "6265e6d53ecc89b0e4f3052d","60c2b3aaa0e24f2d54a52030","60c2b3aca0e24f2d54a5382a",
        "60c2b3aca0e24f2d54a53b76","652fcfec6dd9a84bf7678315","655728058e692d8e1ffd8ee8",
        "60c2b3aba0e24f2d54a52c52","60c2b3a9a0e24f2d54a517b6","60c2b3aba0e24f2d54a52b5d",
        "60c2b3aca0e24f2d54a5365e","60c2b3aba0e24f2d54a527a3","61ef0edf39cb086ec8b2b51e",
        "64a64fc26cee34962d2172f3","60c2b3aca0e24f2d54a533e4","60c2b3aca0e24f2d54a537c9"
    ],
    # Collector's Rare - 21张 (同 SR 中的另一部分，对应 SR 卡中的21张)
    "CR": [
        "60c2b3aca0e24f2d54a5312c","62de1eaae9066c4257aa951d","65ef2ba586dad12f01d138a8",
        "60c2b3aba0e24f2d54a52a0e","60c2b3aaa0e24f2d54a51bf3","60c2b3aca0e24f2d54a53bb6",
        "62e0316e5f0fd2a1fe373774","60c2b3aaa0e24f2d54a5206a","60c2b3aba0e24f2d54a52e95",
        "60c2b3aba0e24f2d54a52536","65ef2abfa96c38cc7f2002c9","661bce466ec87b0f4bd79a25",
        "669a5f474d5f5fd7b2abaed4","668e7b81f41bde5827d1a22d","6713a5e9bc976516c1d27e40",
        "60c2b3aba0e24f2d54a527de","60c2b3a9a0e24f2d54a51488","60c2b3aca0e24f2d54a536b5",
        "6126b426f9d784006595dd66","65ef2bc786dad12f01d13dc6","66e55ddd21d86b033a2cc34d"
    ],
    # Secret Rare - 80张 (全部80种卡)
    "SER": [
        "6995c2dfabf90aebae0850ed","69931a4fbd8db41d05ddda9c","69a1612fb4acf1e9c446ef82",
        "698451cccd341e76339cc0af","69a161413a5983362c9b5a61","698451154580b534f0889ca7",
        "69845124ae09650287fba880","60c2b3aaa0e24f2d54a51b35","60c2b3aca0e24f2d54a5312c",
        "62de1eaae9066c4257aa951d","65ef2ba586dad12f01d138a8","69486dc17fff721c2d2ab34f",
        "60c2b3aba0e24f2d54a52a0e","69a160098f8cbf98a4c80878","60c2b3aaa0e24f2d54a51bf3",
        "69a1602d30626f425bb8c799","60c2b3aca0e24f2d54a53bb6","69931761a8ccf2a075b2af3a",
        "62e0316e5f0fd2a1fe373774","69a160773a5983362c9b58e5","699319f6946fea90719975f4",
        "69a16760c6f106084c30adba","69931a224f241633125ed353","60c2b3aca0e24f2d54a53113",
        "69a160ed8f8cbf98a4c80a19","60c2b3aaa0e24f2d54a5206a","60c2b3aba0e24f2d54a5286b",
        "60c2b3aaa0e24f2d54a522c4","6704df48a250ffc82814b093","60c2b3aca0e24f2d54a53af3",
        "60c2b3aba0e24f2d54a52e95","69a16138211547f9667024b1","69a1610f30626f425bb8ca0c",
        "69a161276dd1798949025a58","69a16118d8c34705d06d9ac2","69a1605495af605565618e5a",
        "60c2b3aba0e24f2d54a52536","69a16736c6b06f7caddbd753","69486a45cc3b933d5cad30e8",
        "6983b335952466cf6d37a3c0","6265e6d53ecc89b0e4f3052d","65ef2abfa96c38cc7f2002c9",
        "60c2b3aaa0e24f2d54a52030","69a160f7ccd9119f5dbe826e","699319c8ce44cd72ea36fc97",
        "60c2b3aca0e24f2d54a5382a","60c2b3aca0e24f2d54a53b76","661bce466ec87b0f4bd79a25",
        "669a5f474d5f5fd7b2abaed4","668e7b81f41bde5827d1a22d","6713a5e9bc976516c1d27e40",
        "69a160ffc064194636d37858","69a160a671d7e2f8145eb5ed","60c2b3aba0e24f2d54a527de",
        "652fcfec6dd9a84bf7678315","69a15fabebc6ba57ea226e3e","655728058e692d8e1ffd8ee8",
        "69a15fe60c46bf1a132b10ec","69931a7d866e8d87c0fa0c1d","699317801e1e98f458b6ce8e",
        "699317db67288245fc68bb0c","697a0b736e58fb3757c39a26","694875e734407dc060a04be8",
        "60c2b3aba0e24f2d54a52c52","60c2b3a9a0e24f2d54a517b6","60c2b3aba0e24f2d54a52b5d",
        "60c2b3aca0e24f2d54a5365e","60c2b3a9a0e24f2d54a51488","60c2b3aba0e24f2d54a527a3",
        "60c2b3aca0e24f2d54a536b5","6126b426f9d784006595dd66","61ef0edf39cb086ec8b2b51e",
        "64a64fc26cee34962d2172f3","65ef2bc786dad12f01d13dc6","66e55ddd21d86b033a2cc34d",
        "699318271e1e98f458b6cfe2","69931b371c07d7474854db33","69a160ca38bd7bd36297d9f9",
        "60c2b3aca0e24f2d54a533e4","60c2b3aca0e24f2d54a537c9"
    ],
    # Prismatic Secret Rare - 98张 (全部80种 + 18种新卡多一个旧版本)
    "PSER": [
        "6995c2dfabf90aebae0850ed","69931a4fbd8db41d05ddda9c","69486e128665ec9779b06c2a",
        "69a1612fb4acf1e9c446ef82","698451cccd341e76339cc0af","69986017879ebfe074300f85",
        "69a161413a5983362c9b5a61","698451154580b534f0889ca7","69845124ae09650287fba880",
        "60c2b3aaa0e24f2d54a51b35","60c2b3aca0e24f2d54a5312c","62de1eaae9066c4257aa951d",
        "65ef2ba586dad12f01d138a8","69486dc17fff721c2d2ab34f","60c2b3aba0e24f2d54a52a0e",
        "69486c91d8043dc79533f710","69a160098f8cbf98a4c80878","60c2b3aaa0e24f2d54a51bf3",
        "699e7e7a8419601d5a5077ad","69a1602d30626f425bb8c799","60c2b3aca0e24f2d54a53bb6",
        "69931761a8ccf2a075b2af3a","62e0316e5f0fd2a1fe373774","69486ccccc3b933d5cad316e",
        "69a160773a5983362c9b58e5","699319f6946fea90719975f4","69a16760c6f106084c30adba",
        "69931a224f241633125ed353","60c2b3aca0e24f2d54a53113","69486cfecc3b933d5cad3179",
        "69a160ed8f8cbf98a4c80a19","60c2b3aaa0e24f2d54a5206a","60c2b3aba0e24f2d54a5286b",
        "60c2b3aaa0e24f2d54a522c4","6704df48a250ffc82814b093","60c2b3aca0e24f2d54a53af3",
        "60c2b3aba0e24f2d54a52e95","69662df409ab844edc3b28b6","69a16138211547f9667024b1",
        "69486d558db5a5b342f5083d","69a1610f30626f425bb8ca0c","699a4ebb66e693e6f792c1cb",
        "69a161276dd1798949025a58","69662f49f851189ddaf28bff","69a16118d8c34705d06d9ac2",
        "69662d2eec17b3d5404e77f3","69a1605495af605565618e5a","60c2b3aba0e24f2d54a52536",
        "69a16736c6b06f7caddbd753","69486a45cc3b933d5cad30e8","69486c39131604f9a8437d13",
        "6983b335952466cf6d37a3c0","6265e6d53ecc89b0e4f3052d","65ef2abfa96c38cc7f2002c9",
        "60c2b3aaa0e24f2d54a52030","69662dace456c14d7305b848","69a160f7ccd9119f5dbe826e",
        "699319c8ce44cd72ea36fc97","60c2b3aca0e24f2d54a5382a","60c2b3aca0e24f2d54a53b76",
        "661bce466ec87b0f4bd79a25","669a5f474d5f5fd7b2abaed4","668e7b81f41bde5827d1a22d",
        "6713a5e9bc976516c1d27e40","699b627fe996e5a7c96a8d12","69a160ffc064194636d37858",
        "69662d70ad0c0050aabcbdef","69a160a671d7e2f8145eb5ed","60c2b3aba0e24f2d54a527de",
        "652fcfec6dd9a84bf7678315","69662d0ba629bbc4000089c9","69a15fabebc6ba57ea226e3e",
        "655728058e692d8e1ffd8ee8","699ff5d271d7e2f8145b4d5c","69a15fe60c46bf1a132b10ec",
        "69931a7d866e8d87c0fa0c1d","699317801e1e98f458b6ce8e","699317db67288245fc68bb0c",
        "697a0b736e58fb3757c39a26","694875e734407dc060a04be8","60c2b3aba0e24f2d54a52c52",
        "60c2b3a9a0e24f2d54a517b6","60c2b3aba0e24f2d54a52b5d","60c2b3aca0e24f2d54a5365e",
        "60c2b3a9a0e24f2d54a51488","60c2b3aba0e24f2d54a527a3","60c2b3aca0e24f2d54a536b5",
        "6126b426f9d784006595dd66","61ef0edf39cb086ec8b2b51e","64a64fc26cee34962d2172f3",
        "65ef2bc786dad12f01d13dc6","66e55ddd21d86b033a2cc34d","699318271e1e98f458b6cfe2",
        "69931b371c07d7474854db33","699cb5ef171db3ac20a0ca89","69a160ca38bd7bd36297d9f9",
        "60c2b3aca0e24f2d54a533e4","60c2b3aca0e24f2d54a537c9"
    ],
    # Grandmaster Rare - 18张 (JP001-JP018 的新卡)
    "GMR": [
        "69486e128665ec9779b06c2a","69986017879ebfe074300f85","69486c91d8043dc79533f710",
        "699e7e7a8419601d5a5077ad","69486ccccc3b933d5cad316e","69486cfecc3b933d5cad3179",
        "69662df409ab844edc3b28b6","69486d558db5a5b342f5083d","699a4ebb66e693e6f792c1cb",
        "69662f49f851189ddaf28bff","69662d2eec17b3d5404e77f3","69486c39131604f9a8437d13",
        "69662dace456c14d7305b848","699b627fe996e5a7c96a8d12","69662d70ad0c0050aabcbdef",
        "69662d0ba629bbc4000089c9","699ff5d271d7e2f8145b4d5c","699cb5ef171db3ac20a0ca89"
    ],
    # Prismatic Secret Rare 特别包 - 10张
    "PSER_SPECIAL": [
        "694981a44673698fff9b6bc1","69498195ea609b2f5710487c","6947072c73f1136e4c0c27f6",
        "694981ba4673698fff9b6d49","6947062fcaeb20b7384c25d4","6947073d8f70e9b6225d24aa",
        "694981852206957906e8c09b","694706f0caeb20b7384c3576","6947071b73f1136e4c0c26d3",
        "6947063a649f7306c2078e47"
    ]
}

# 读取 LOCH 卡片数据
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
loch_path = os.path.join(project_root, "data", "ocg", "cards", "ocg_loch.json")
old_map_path = os.path.join(project_root, "data", "ocg", "loch_image_map.json")
new_map_path = os.path.join(project_root, "data", "ocg", "loch_image_map.json")

with open(loch_path, "r", encoding="utf-8") as f:
    loch_data = json.load(f)

with open(old_map_path, "r", encoding="utf-8") as f:
    old_map = json.load(f)

# 获取80张卡的 password 列表（按卡包顺序 JP001-JP080）
card_passwords = [str(c["id"]) for c in loch_data["cardIds"]]
card_names = {}
card_rarity_versions = {}
for c in loch_data["cardIds"]:
    pw = str(c["id"])
    card_names[pw] = c.get("name_hint", c.get("setNumber", pw))
    card_rarity_versions[pw] = c.get("rarityVersions", [])

# ============================================
# 分析阶段：确认 SER 列表的顺序对应关系
# ============================================
print("=" * 60)
print("第一步：验证 SER(80张) 与现有映射表的对应关系")
print("=" * 60)

ser_list = WEB_DATA["SER"]
assert len(ser_list) == 80, f"SER应有80张，实际有{len(ser_list)}张"

# SER 列表应该按 JP026-JP038, JP039-JP080... 等某种顺序排列
# 让我们通过现有映射表来找对应关系
old_metaid_to_pw = {}
for pw, info in old_map["cards"].items():
    old_metaid_to_pw[info["metaId"]] = pw

# 检查 SER 中的 metaId 是否在现有映射表中
ser_match_count = 0
ser_order = []
for i, mid in enumerate(ser_list):
    pw = old_metaid_to_pw.get(mid, "???")
    if pw != "???":
        ser_match_count += 1
    ser_order.append((i, mid, pw))
    
print(f"SER中有{ser_match_count}/80个metaId与现有映射表匹配")

# SER中可能不是所有都在旧映射表中（旧映射表用的是新绘版本的metaId，
# 而SER的JP001-JP025可能用的是旧版metaId）
# 让我打印出未匹配的
unmatched = [(i, mid) for i, mid, pw in ser_order if pw == "???"]
print(f"\n未匹配的SER metaId ({len(unmatched)}个):")
for i, mid in unmatched:
    # 看看这个 metaId 在哪些稀有度中出现
    found_in = []
    for rarity, ids in WEB_DATA.items():
        if mid in ids:
            found_in.append(f"{rarity}[{ids.index(mid)}]")
    print(f"  SER[{i}]: {mid} - 出现在: {', '.join(found_in)}")

# ============================================
# 分析 UR 列表的结构
# ============================================
print("\n" + "=" * 60)
print("第二步：分析 UR(56张) 的结构")
print("=" * 60)

ur_list = WEB_DATA["UR"]
print(f"UR列表共{len(ur_list)}张")

# 检查UR中哪些在旧映射表中
ur_matched = 0
ur_new = 0
for mid in ur_list:
    if mid in old_metaid_to_pw:
        ur_matched += 1
    else:
        ur_new += 1
print(f"UR中: {ur_matched}个已知metaId, {ur_new}个新metaId")

# ============================================
# 核心分析：建立完整的 password → 各稀有度metaId 映射
# ============================================
print("\n" + "=" * 60)
print("第三步：建立完整映射")
print("=" * 60)

# 策略：
# 1. SER 有80张，顺序应该对应全部80张卡
# 2. 但SER的排列顺序可能不是 JP001-JP080
# 3. 需要通过已知的 metaId↔password 映射来推断顺序

# 先从旧映射表建立 metaId→password 的反向映射
metaid_to_pw = {}
for pw, info in old_map["cards"].items():
    metaid_to_pw[info["metaId"]] = pw

# SER列表中，有些卡可能用了不同的metaId（旧版图而非新绘图）
# 让我们用SER来推断对应关系
# 假设 SER 的顺序是按照某种固定规则（可能不是简单的 JP001-JP080）

# 更好的策略：利用所有已知数据交叉验证
# 首先，SR(42张) 和 SER 的后42张应该有重叠
sr_list = WEB_DATA["SR"]
ser_last_42 = ser_list[-42:]  # 假设SER后42张对应SR卡

# 检查SR和SER后42张是否重合
sr_in_ser = sum(1 for mid in sr_list if mid in ser_list)
print(f"SR中有{sr_in_ser}/{len(sr_list)}个metaId出现在SER中")

# 检查SR列表的metaId顺序与SER的对应
print("\nSR列表的metaId在SER中的位置:")
for i, mid in enumerate(sr_list[:5]):
    if mid in ser_list:
        print(f"  SR[{i}] = SER[{ser_list.index(mid)}]")

# ============================================
# 关键洞察：通过metaId反查来确定SER的顺序
# ============================================
# 用旧映射表中的 metaId↔password 关系来确认
# 旧映射表中的 metaId 就是 LOCH 新绘版本的

# 建立 metaId → setNumber 映射
metaid_to_setnumber = {}
for pw, info in old_map["cards"].items():
    metaid_to_setnumber[info["metaId"]] = info["setNumber"]

# 分析SER的排列顺序
print("\nSER 顺序分析（通过已知metaId推断）:")
ser_positions = {}  # metaId → JP编号
for i, mid in enumerate(ser_list):
    sn = metaid_to_setnumber.get(mid, None)
    if sn:
        ser_positions[i] = sn
        
# 打印匹配的位置关系
matched_positions = sorted(ser_positions.items())
for pos, sn in matched_positions[:10]:
    print(f"  SER位置[{pos}] → {sn}")
print(f"  ... (共{len(matched_positions)}个匹配)")

# 看看SER未匹配的位置，它们的metaId应该是旧版卡图
# （新卡JP001-JP018的旧版图不在旧映射表中）
unmatched_positions = [i for i in range(80) if i not in ser_positions]
print(f"\nSER中未通过旧映射表匹配的位置: {unmatched_positions}")

# ============================================
# 推断SER的完整顺序
# ============================================
# 假设 SER 的排列不是 JP001-JP080 的简单顺序
# 实际上网页上 SER 的排列可能是：先JP026-JP038(reprint UR)，再JP039-JP080(SR)，
# 中间穿插 JP001-JP025(新卡，但用的旧版metaId)

# 让我换个思路：先用 SER 中能匹配的来建立索引
# 然后用位置推断法来填充剩余的

# 进一步分析：检查 PSER 和 SER 的关系
pser_list = WEB_DATA["PSER"]
print(f"\nPSER列表共{len(pser_list)}张")

# PSER 比 SER 多了18张，这18张应该是JP001-JP018的额外旧版图
# 找出 PSER 中有但 SER 中没有的 metaId
pser_extra = [mid for mid in pser_list if mid not in ser_list]
print(f"PSER中有但SER中没有的metaId: {len(pser_extra)}个")
for mid in pser_extra:
    # 检查这些在旧映射表中是否存在
    pw = metaid_to_pw.get(mid, "新metaId")
    print(f"  {mid} → {pw}")

# ============================================
# 最终策略：使用 PSER(98张) 来建立完整映射
# ============================================
# PSER 的结构：对于每张卡，
# - 如果是JP001-JP018（有旧版+新绘两版图），PSER中有2个metaId
# - 如果是JP019-JP080（只有一版图），PSER中有1个metaId
# PSER的排列应该是某种固定顺序，每张卡的多个版本相邻

# 让我分析 PSER 中与旧映射表的匹配
print("\n" + "=" * 60)
print("分析 PSER(98张) 的排列模式")
print("=" * 60)

# 找出旧映射表能匹配的位置
pser_to_pw = {}
for i, mid in enumerate(pser_list):
    pw = metaid_to_pw.get(mid, None)
    if pw:
        pser_to_pw[i] = pw

# 按位置排序输出
for pos in sorted(pser_to_pw.keys())[:30]:
    sn = old_map["cards"][pser_to_pw[pos]]["setNumber"]
    print(f"  PSER[{pos}] → {pser_to_pw[pos]} ({sn})")

print(f"\n已匹配 {len(pser_to_pw)}/98 个位置")

# ============================================
# 分析 PSER 的模式
# ============================================
# 从上面的数据我们可以看到 PSER 的排列模式
# 让我详细分析连续的匹配/未匹配模式

print("\n" + "=" * 60)
print("PSER 完整位置分析")
print("=" * 60)

for i in range(len(pser_list)):
    mid = pser_list[i]
    pw = metaid_to_pw.get(mid, None)
    if pw:
        sn = old_map["cards"][pw]["setNumber"]
        print(f"  PSER[{i:2d}]: {mid} → {pw} ({sn}) ✓")
    else:
        # 未匹配的，看是否在UR列表中（可能是旧版图）
        in_ur = "UR中" if mid in ur_list else ""
        in_gmr = "GMR中" if mid in WEB_DATA["GMR"] else ""
        print(f"  PSER[{i:2d}]: {mid} → ??? {in_ur} {in_gmr}")
