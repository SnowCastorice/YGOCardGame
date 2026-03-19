#!/usr/bin/env python3
"""
LOCH 卡图映射表生成脚本
将 ocg_loch.json 中的卡片密码映射到 YugiohMeta S3 CDN 的 objectId
"""
import json
import os

# 路径配置
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCH_JSON = os.path.join(BASE_DIR, 'data', 'ocg', 'cards', 'ocg_loch.json')
OUTPUT_JSON = os.path.join(BASE_DIR, 'data', 'ocg', 'loch_image_map.json')

# 从网页提取的 英文卡名 → [objectId] 映射（来自 yugiohmeta.com/articles/sets/ocg/loch）
# 多个objectId时：[0]是原始卡图，[-1]是LOCH专属插画
WEB_DATA = {
    "Cyberse Wicckid": ["60c2b3aaa0e24f2d54a51b35"],
    "Platinum Gadget": ["60c2b3aca0e24f2d54a5312c"],
    "G Golem Crystal Heart": ["62de1eaae9066c4257aa951d"],
    "Fiendsmith's Sequence": ["65ef2ba586dad12f01d138a8"],
    "Lunalight Sabre Dancer": ["60c2b3aba0e24f2d54a52a0e"],
    "Dark Cavalry": ["60c2b3aaa0e24f2d54a51bf3"],
    "Trident Dragion": ["60c2b3aca0e24f2d54a53bb6"],
    "Power Tool Braver Dragon": ["62e0316e5f0fd2a1fe373774"],
    "Pilgrim Reaper": ["60c2b3aca0e24f2d54a53113"],
    "Evolzar Dolkka": ["60c2b3aaa0e24f2d54a5206a"],
    "King of the Feral Imps": ["60c2b3aba0e24f2d54a5286b"],
    "Gallant Granite": ["60c2b3aaa0e24f2d54a522c4"],
    "Eclipse Twins": ["6704df48a250ffc82814b093"],
    "Toadally Awesome": ["60c2b3aca0e24f2d54a53af3"],
    "Number 29: Mannequin Cat": ["60c2b3aba0e24f2d54a52e95"],
    "Guardian Slime": ["60c2b3aba0e24f2d54a52536"],
    "Wandering Gryphon Rider": ["6265e6d53ecc89b0e4f3052d"],
    "Fiendsmith Engraver": ["65ef2abfa96c38cc7f2002c9"],
    "Evil HERO Sinister Necrom": ["60c2b3aaa0e24f2d54a52030"],
    "Subterror Guru": ["60c2b3aca0e24f2d54a5382a"],
    "Tri-Brigade Fraktall": ["60c2b3aca0e24f2d54a53b76"],
    "Mulcharmy Purulia": ["661bce466ec87b0f4bd79a25"],
    "Lacrima the Crimson Tears": ["669a5f474d5f5fd7b2abaed4"],
    "Mulcharmy Fuwalos": ["668e7b81f41bde5827d1a22d"],
    "Mulcharmy Meowls": ["6713a5e9bc976516c1d27e40"],
    "Junk Anchor": ["60c2b3aba0e24f2d54a527de"],
    "EM:P Meowmine": ["652fcfec6dd9a84bf7678315"],
    "Pillar of the Future - Cyanos": ["655728058e692d8e1ffd8ee8"],
    "Metamorphosis": ["60c2b3aba0e24f2d54a52c52"],
    "Book of Eclipse": ["60c2b3a9a0e24f2d54a517b6"],
    "Mask Change II": ["60c2b3aba0e24f2d54a52b5d"],
    "Slash Draw": ["60c2b3aca0e24f2d54a5365e"],
    "Ancient Chant": ["60c2b3a9a0e24f2d54a51488"],
    "Jack-In-The-Hand": ["60c2b3aba0e24f2d54a527a3"],
    "Soul Crossing": ["60c2b3aca0e24f2d54a536b5"],
    "Piercing the Darkness": ["6126b426f9d784006595dd66"],
    "Rite of Aramesir": ["61ef0edf39cb086ec8b2b51e"],
    "WANTED: Seeker of Sinful Spoils": ["64a64fc26cee34962d2172f3"],
    "Fiendsmith's Tract": ["65ef2bc786dad12f01d13dc6"],
    "Heavy Polymerization": ["66e55ddd21d86b033a2cc34d"],
    "Rivalry of Warlords": ["60c2b3aca0e24f2d54a533e4"],
    "Statue of Anguish Pattern": ["60c2b3aca0e24f2d54a537c9"],
    "A Bao A Qu, the Lightless Shadow": ["6995c2dfabf90aebae0850ed"],
    "Mekk-Knight Crusadia Avramax": ["69931a4fbd8db41d05ddda9c"],
    "Decode Talker Integration": ["69486e128665ec9779b06c2a", "69a1612fb4acf1e9c446ef82"],
    "W:P Fancy Ball": ["698451cccd341e76339cc0af"],
    "Cyberse Contract Witch": ["69986017879ebfe074300f85", "69a161413a5983362c9b5a61"],
    "I:P Masquerena": ["698451154580b534f0889ca7"],
    "S:P Little Knight": ["69845124ae09650287fba880"],
    "Master Spirit Tech Force - Pendulum Ruler": ["69486dc17fff721c2d2ab34f"],
    "Favorite HERO Shining Flare Wingman": ["69486c91d8043dc79533f710", "69a160098f8cbf98a4c80878"],
    "Favorite HERO Flame Wingman": ["699e7e7a8419601d5a5077ad", "69a1602d30626f425bb8c799"],
    "Assault Blackwing - Kusanagi the Gathering Storm": ["69931761a8ccf2a075b2af3a"],
    "Stardust Dragon - Victim Sanctuary": ["69486ccccc3b933d5cad316e", "69a160773a5983362c9b58e5"],
    "Ib the World Chalice Justiciar": ["699319f6946fea90719975f4"],
    "Divine Arsenal AA-ZEUS - Sky Thunder": ["69a16760c6f106084c30adba"],
    "Exosisters Magnifica": ["69931a224f241633125ed353"],
    "Number 39: Utopia the Envoy of Light": ["69486cfecc3b933d5cad3179", "69a160ed8f8cbf98a4c80a19"],
    "Cyberse Code Magician": ["69662df409ab844edc3b28b6", "69a16138211547f9667024b1"],
    "Odd-Eyes Pendulum Dragon of the Four Heavenly Dragons": ["69486d558db5a5b342f5083d", "69a1610f30626f425bb8ca0c"],
    "Astrograph Sorcerer, the Star Magician": ["699a4ebb66e693e6f792c1cb", "69a161276dd1798949025a58"],
    "Horoscope Sorcerer, the Stargazer Magician": ["69662f49f851189ddaf28bff", "69a16118d8c34705d06d9ac2"],
    "Winged Kuriboh Sabatiel LV10": ["69662d2eec17b3d5404e77f3", "69a1605495af605565618e5a"],
    "Witchcrafter Madame Verre": ["69a16736c6b06f7caddbd753"],
    "Dark Magician, the Pharaoh's Servant": ["69486a45cc3b933d5cad30e8", "69486c39131604f9a8437d13"],
    "Diabellstar the Black Witch": ["6983b335952466cf6d37a3c0"],
    "Gagaga Magician - Gagaga Magic": ["69662dace456c14d7305b848", "69a160f7ccd9119f5dbe826e"],
    "Visas Samsara": ["699319c8ce44cd72ea36fc97"],
    "Gagaga Girl - Cell Phone Subtraction": ["699b627fe996e5a7c96a8d12", "69a160ffc064194636d37858"],
    "Starjunk Synchron": ["69662d70ad0c0050aabcbdef", "69a160a671d7e2f8145eb5ed"],
    "Multiplying Kuriboh!": ["69662d0ba629bbc4000089c9", "69a15fabebc6ba57ea226e3e"],
    "Dark Magical Curtain": ["699ff5d271d7e2f8145b4d5c", "69a15fe60c46bf1a132b10ec"],
    "Dark Ruler No More": ["69931a7d866e8d87c0fa0c1d"],
    "Orichalcos Sword of Sealing": ["699317801e1e98f458b6ce8e"],
    "Rainbow Bridge Bifrost": ["699317db67288245fc68bb0c"],
    "Sky Striker Mobilize - Engage!": ["697a0b736e58fb3757c39a26"],
    "Underworld Circle": ["694875e734407dc060a04be8"],
    "Malefic Force": ["699318271e1e98f458b6cfe2"],
    "Malefic Paradigm Shift": ["69931b371c07d7474854db33"],
    "Synchro Emergency": ["699cb5ef171db3ac20a0ca89", "69a160ca38bd7bd36297d9f9"],
}

# 新卡手动映射（100256xxx 卡密 → 英文卡名）
# 这些卡在网页上只有英文名，通过中文名对照确定
NEW_CARD_EN_NAMES = {
    "100256001": "Dark Magician, the Pharaoh's Servant",      # 王之仆人-黑魔术师
    "100256002": "Multiplying Kuriboh!",                       # 增殖的栗子球！
    "100256003": "Dark Magical Curtain",                       # 黑魔导的幕帘
    "100256004": "Favorite HERO Shining Flare Wingman",        # 至爱英雄 闪光火焰翼侠
    "100256005": "Favorite HERO Flame Wingman",                # 至爱英雄 火焰翼侠
    "100256006": "Winged Kuriboh Sabatiel LV10",               # 羽翼栗子球·萨巴希尔 LV10
    "100256007": "Stardust Dragon - Victim Sanctuary",         # 星尘龙-牺牲者的圣域
    "100256008": "Starjunk Synchron",                          # 群星废品同调士
    "100256009": "Synchro Emergency",                          # 同调紧急
    "100256010": "Number 39: Utopia the Envoy of Light",       # No.39 光之使者 希望皇 霍普
    "100256011": "Gagaga Magician - Gagaga Magic",             # 我我我魔术师-我我我魔导
    "100256012": "Gagaga Girl - Cell Phone Subtraction",       # 我我我少女-零零通话
    "100256013": "Odd-Eyes Pendulum Dragon of the Four Heavenly Dragons",  # 四天之龙 异色眼灵摆龙
    "100256014": "Horoscope Sorcerer, the Stargazer Magician", # 星读之魔术师-星占之魔术士
    "100256015": "Astrograph Sorcerer, the Star Magician",     # 星霜之魔术师-宙读之魔术士
    "100256016": "Decode Talker Integration",                  # 解码语者·集成
    "100256017": "Cyberse Code Magician",                      # 电子界代码魔术师
    "100256018": "Cyberse Contract Witch",                     # 电子界契约魔女
    "100256019": "Underworld Circle",                          # 黄泉天轮
    "100256020": "Orichalcos Sword of Sealing",                # 山铜魔封剑
    "100256021": "Rainbow Bridge Bifrost",                     # 虹桥 碧佛洛斯特
    "100256022": "Malefic Force",                              # 罪 力量
    "100256023": "Malefic Paradigm Shift",                     # 罪 范式转移
    "100256024": "Assault Blackwing - Kusanagi the Gathering Storm",  # 强袭黑羽-丛云之草薙剑鸟
    "100256025": "Master Spirit Tech Force - Pendulum Ruler",  # 大精灵机巧军-灵摆支配者
}

# W:P Fancy Ball 的密码（100201001）
NEW_CARD_EN_NAMES["100201001"] = "W:P Fancy Ball"


def main():
    with open(LOCH_JSON, 'r', encoding='utf-8') as f:
        loch_data = json.load(f)

    result = {}
    matched_count = 0
    unmatched = []

    for card_def in loch_data['cardIds']:
        pw = str(card_def['id'])
        sn = card_def.get('setNumber', '')
        en_name = card_def.get('cardData', {}).get('en_name', '')
        hint = card_def.get('name_hint', '')

        # 先尝试英文名直接匹配
        if en_name and en_name in WEB_DATA:
            ids = WEB_DATA[en_name]
            # 有多个objectId时，取最后一个（LOCH专属卡图，通常是新绘插画）
            result[pw] = {
                "metaId": ids[-1],
                "name": en_name,
                "setNumber": sn
            }
            matched_count += 1
        # 再尝试新卡手动映射
        elif pw in NEW_CARD_EN_NAMES:
            mapped_name = NEW_CARD_EN_NAMES[pw]
            if mapped_name in WEB_DATA:
                ids = WEB_DATA[mapped_name]
                # 新卡优先使用LOCH专属卡图（最后一个objectId）
                result[pw] = {
                    "metaId": ids[-1],
                    "name": mapped_name,
                    "setNumber": sn
                }
                matched_count += 1
            else:
                unmatched.append(f"  {pw}|{sn}|{hint} (手动映射名'{mapped_name}'未在网页中找到)")
        else:
            unmatched.append(f"  {pw}|{sn}|{hint} (无英文名)")

    print(f"匹配结果: {matched_count}/80")
    if unmatched:
        print(f"未匹配 ({len(unmatched)}):")
        for u in unmatched:
            print(u)

    # 生成映射表JSON
    output = {
        "_说明": "LOCH 卡图映射表 — 卡片密码(password) → YugiohMeta S3 CDN 图片ID",
        "_图片URL格式": "https://s3.duellinksmeta.com/cards/{metaId}_w{尺寸}.webp",
        "_可用尺寸": "w100, w140, w200, w260, w360, w420",
        "_数据来源": "从 yugiohmeta.com/articles/sets/ocg/loch 页面提取",
        "_更新时间": "2026-02-28",
        "cards": result
    }

    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n映射表已保存到: {OUTPUT_JSON}")
    print(f"总条目数: {len(result)}")


if __name__ == '__main__':
    main()
