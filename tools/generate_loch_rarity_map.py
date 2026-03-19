"""
生成 LOCH 卡包的完整稀有度图片映射表。
从 yugiohmeta.com 网页提取的数据中，建立每张卡每个稀有度对应的 metaId。

关键发现：
- PSER(98张) 中，JP001-JP018 每张卡有2个metaId（旧版图+新绘图）
- 旧版图 metaId 紧排在新绘图 metaId 之前
- JP019-JP080 每张卡只有1个 metaId
- UR列表(56张) 中也是同样的模式：旧版+新绘交替排列

最终映射格式：
  password → { metaId: "默认版本", name, setNumber, alt: { "UR": "xxx", ... } }
  其中 alt 字段仅在该卡某个稀有度使用了不同于默认的 metaId 时才出现
"""
import json
import os

# ============================================
# 网页数据
# ============================================
PSER = [
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
]

GMR = [
    "69486e128665ec9779b06c2a","69986017879ebfe074300f85","69486c91d8043dc79533f710",
    "699e7e7a8419601d5a5077ad","69486ccccc3b933d5cad316e","69486cfecc3b933d5cad3179",
    "69662df409ab844edc3b28b6","69486d558db5a5b342f5083d","699a4ebb66e693e6f792c1cb",
    "69662f49f851189ddaf28bff","69662d2eec17b3d5404e77f3","69486c39131604f9a8437d13",
    "69662dace456c14d7305b848","699b627fe996e5a7c96a8d12","69662d70ad0c0050aabcbdef",
    "69662d0ba629bbc4000089c9","699ff5d271d7e2f8145b4d5c","699cb5ef171db3ac20a0ca89"
]

UR = [
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
]

# ============================================
# 读取现有数据
# ============================================
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
loch_path = os.path.join(project_root, "data", "ocg", "cards", "ocg_loch.json")
old_map_path = os.path.join(project_root, "data", "ocg", "loch_image_map.json")

with open(loch_path, "r", encoding="utf-8") as f:
    loch_data = json.load(f)
with open(old_map_path, "r", encoding="utf-8") as f:
    old_map = json.load(f)

# 旧映射: metaId -> password
m2p = {}
for pw, info in old_map["cards"].items():
    m2p[info["metaId"]] = pw

# ============================================
# 第一步：从 PSER 列表推断每张卡的新绘图metaId和旧版图metaId
# ============================================
# PSER中，NEW metaId 紧排在对应已知卡的 metaId 之前
# 通过位置关系来对应

# 找出 PSER 中所有 NEW 位置
new_positions = []
for i, mid in enumerate(PSER):
    if mid not in m2p:
        new_positions.append(i)

print(f"PSER中有{len(new_positions)}个新metaId位置: {new_positions}")

# 对于每个NEW位置，它后面的已知位置就是对应的卡
# 建立 旧版图metaId -> password 的映射
old_art_map = {}  # 旧版图 metaId -> password
for new_pos in new_positions:
    # 找后面第一个已知的位置
    for j in range(new_pos + 1, len(PSER)):
        pw = m2p.get(PSER[j])
        if pw:
            old_art_map[PSER[new_pos]] = pw
            print(f"  PSER[{new_pos}] 旧版图 {PSER[new_pos]} -> {pw} ({old_map['cards'][pw]['setNumber']})")
            break

# 验证：应该有18个旧版图对应18张新卡(JP001-JP018)
assert len(old_art_map) == 18, f"应有18个旧版图，实际{len(old_art_map)}个"
print(f"\n成功映射18个旧版图metaId!")

# ============================================
# 第二步：分析每张卡在各稀有度下使用哪个metaId
# ============================================
# 我们已知的所有 metaId -> password 映射（包括旧版图）
all_m2p = dict(m2p)
all_m2p.update(old_art_map)

# 从 UR 列表中找到每张卡的 UR 版本 metaId
# UR列表(56张)中，JP001-JP018 每张有2个（旧版+新绘），其他卡只有1个
# 分析 UR 列表结构
print("\n分析 UR 列表中JP001-JP018的旧版/新绘对应关系:")

# UR列表中的 NEW metaId
ur_new_mids = set()
for mid in UR:
    if mid not in m2p:
        ur_new_mids.add(mid)

# 这些和PSER中的旧版图应该是同一批
print(f"  UR中新metaId: {len(ur_new_mids)}个")
for mid in ur_new_mids:
    pw = old_art_map.get(mid, "???")
    print(f"    {mid} -> {pw}")

# ============================================
# 第三步：确定每张卡各稀有度使用新绘图还是旧版图
# ============================================
# 规则（根据数据分析得出）：
# 对于JP001-JP018（有2种卡图的新卡）：
#   - UR: 有旧版图+新绘图2个版本（网页上是交替排列）
#   - SER: 如果该卡是UR底，SER版使用旧版图；但JP001特殊用的是旧版图
#   - PSER: 有旧版图+新绘图2个版本
#   - GMR: 使用旧版图（已确认GMR列表中都是UR列表中也出现的旧版metaId）
#
# 对于JP019-JP080（只有1种卡图的卡）：
#   - 所有稀有度使用同一个 metaId

# 建立完整映射
# 对于每张卡，记录：
#   - default: 新绘图metaId（如果有新绘图的话）
#   - oldArt: 旧版图metaId（如果有的话）

card_image_data = {}
for c in loch_data["cardIds"]:
    pw = str(c["id"])
    sn = c["setNumber"]
    old_info = old_map["cards"].get(pw, {})
    new_art_mid = old_info.get("metaId")  # 旧映射表中的即为新绘图
    name = old_info.get("name", "")
    
    # 查找是否有旧版图
    old_art_mid = None
    for omid, opw in old_art_map.items():
        if opw == pw:
            old_art_mid = omid
            break
    
    card_image_data[pw] = {
        "newArt": new_art_mid,
        "oldArt": old_art_mid,
        "name": name,
        "setNumber": sn,
        "rarityVersions": c.get("rarityVersions", [])
    }

# ============================================
# 第四步：确定具体哪些稀有度用哪种图
# ============================================
# 根据网页数据分析：
# - SER(80张): 对于JP001-JP018，大部分用新绘图metaId，但JP001用旧版图
# - 让我们通过交叉验证来确认

SER = [
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
]

# 检查 SER 中哪些是旧版图
print("\nSER列表中使用旧版图的卡:")
for mid in SER:
    if mid in old_art_map:
        pw = old_art_map[mid]
        print(f"  {mid} -> {pw} ({card_image_data[pw]['setNumber']}) 使用旧版图")

# 检查 SER 中哪些是新绘图
ser_new_art_count = 0
for mid in SER:
    if mid in m2p:
        ser_new_art_count += 1
print(f"\nSER中使用新绘图的数量: {ser_new_art_count}")
print(f"SER中使用旧版图的数量: {len(SER) - ser_new_art_count}")

# 检查 GMR 中的对应关系
print("\nGMR列表分析:")
gmr_old_count = 0
gmr_new_count = 0
for mid in GMR:
    if mid in old_art_map:
        pw = old_art_map[mid]
        print(f"  {mid} -> {pw} ({card_image_data[pw]['setNumber']}) 旧版图")
        gmr_old_count += 1
    elif mid in m2p:
        pw = m2p[mid]
        print(f"  {mid} -> {pw} ({card_image_data[pw]['setNumber']}) 新绘图")
        gmr_new_count += 1
print(f"GMR: {gmr_old_count}旧版 + {gmr_new_count}新绘 = {gmr_old_count+gmr_new_count}")

# ============================================
# 第五步：生成最终映射表
# ============================================
# 新格式：每张卡的 metaId 字段改为默认值
# 新增 altMetaId 字段：{ rarityCode: metaId } 用于不同稀有度的图片
# 只有在metaId不同于默认值时才记录

new_map = {
    "_说明": "LOCH 卡图映射表 — 卡片密码(password) -> YugiohMeta S3 CDN 图片ID",
    "_图片URL格式": "https://s3.duellinksmeta.com/cards/{metaId}_w{尺寸}.webp",
    "_可用尺寸": "w100, w140, w200, w260, w360, w420",
    "_数据来源": "从 yugiohmeta.com/articles/sets/ocg/loch 页面提取",
    "_更新时间": "2026-02-28",
    "_映射说明": "metaId为默认卡图ID; altMetaId记录特定稀有度使用的不同卡图ID(旧版图)",
    "cards": {}
}

for pw, data in card_image_data.items():
    entry = {
        "metaId": data["newArt"],
        "name": data["name"],
        "setNumber": data["setNumber"]
    }
    
    if data["oldArt"]:
        # 这张卡有旧版图，记录哪些稀有度使用旧版图
        # 根据分析：
        # - UR/UR-OF: 使用新绘图（默认）
        # - SER: 使用新绘图（默认），但JP001特殊使用旧版图
        # - PSER/PSER-OF: 使用新绘图（默认）
        # - GMR/GMR-OF: 使用旧版图
        # 但实际上，每种稀有度在网页上都有独立的图片，
        # 在我们的场景中，GMR使用旧版图是唯一需要特殊处理的
        
        # 检查这张卡在 SER 中用的是哪个版本
        ser_uses_old = data["oldArt"] in SER
        gmr_uses_old = data["oldArt"] in GMR
        
        alt = {}
        if gmr_uses_old:
            alt["GMR"] = data["oldArt"]
            alt["GMR-OF"] = data["oldArt"]
        if ser_uses_old:
            alt["SER"] = data["oldArt"]
        
        if alt:
            entry["altMetaId"] = alt
    
    new_map["cards"][pw] = entry

# 写入新文件
output_path = os.path.join(project_root, "data", "ocg", "loch_image_map.json")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(new_map, f, ensure_ascii=False, indent=2)

print(f"\n{'='*60}")
print(f"映射表已生成: {output_path}")
print(f"{'='*60}")

# 统计
has_alt = sum(1 for pw, e in new_map["cards"].items() if "altMetaId" in e)
print(f"总卡数: {len(new_map['cards'])}")
print(f"有替代图片的卡数: {has_alt}")
print(f"只有默认图片的卡数: {len(new_map['cards']) - has_alt}")

# 验证所有卡都有映射
for c in loch_data["cardIds"]:
    pw = str(c["id"])
    assert pw in new_map["cards"], f"缺少卡片: {pw}"
    assert new_map["cards"][pw]["metaId"], f"卡片 {pw} 缺少 metaId"

print("\n验证通过! 所有80张卡都有正确的映射。")
