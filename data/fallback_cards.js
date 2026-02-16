/**
 * ============================================
 * YGO Pack Opener - 离线备用卡牌数据
 * 版本: 0.4.0
 * 
 * 【文件说明】
 * 当 API 无法访问时使用这些内嵌数据。
 * - TCG 卡包：英文数据（对应 YGOProDeck API 离线时）
 * - OCG 卡包：中文数据（对应 YGOCDB API 离线时）
 * 卡牌数据版权归 Konami Digital Entertainment
 * ============================================
 */

window.FALLBACK_CARD_DATA = {

    // ====== LOB - 传说之蓝眼白龙 ======
    "Legend of Blue Eyes White Dragon": {
        setCode: "Legend of Blue Eyes White Dragon",
        totalCards: 126,
        fetchedAt: 0,
        cards: [
            // === UR (Ultra Rare / Secret Rare) ===
            { id: 89631139, name: "Blue-Eyes White Dragon", type: "Normal Monster", desc: "This legendary dragon is a powerful engine of destruction. Virtually invincible, very few have faced this awesome creature and lived to tell the tale.", atk: 3000, def: 2500, level: 8, race: "Dragon", attribute: "LIGHT", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 46986414, name: "Dark Magician", type: "Normal Monster", desc: "The ultimate wizard in terms of attack and defense.", atk: 2500, def: 2100, level: 7, race: "Spellcaster", attribute: "DARK", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 6368038, name: "Gaia The Fierce Knight", type: "Normal Monster", desc: "A knight whose horse travels faster than the wind.", atk: 2300, def: 2100, level: 7, race: "Warrior", attribute: "EARTH", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 74677422, name: "Red-Eyes Black Dragon", type: "Normal Monster", desc: "A ferocious dragon with a deadly attack.", atk: 2400, def: 2000, level: 7, race: "Dragon", attribute: "DARK", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 39111158, name: "Tri-Horned Dragon", type: "Normal Monster", desc: "An unworthy dragon with three sharp horns sprouting from its head.", atk: 2850, def: 2350, level: 8, race: "Dragon", attribute: "DARK", rarity: "Secret Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },

            // === SR (Super Rare) ===
            { id: 44209392, name: "Celtic Guardian", type: "Normal Monster", desc: "An elf who learned to wield a sword.", atk: 1400, def: 1200, level: 4, race: "Warrior", attribute: "EARTH", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 45231177, name: "Flame Swordsman", type: "Fusion Monster", desc: "A fusion of Flame Manipulator and Masaki the Legendary Swordsman.", atk: 1800, def: 1600, level: 5, race: "Warrior", attribute: "FIRE", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 53129443, name: "Dark Hole", type: "Spell Card", desc: "Destroy all monsters on the field.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 12580477, name: "Raigeki", type: "Spell Card", desc: "Destroy all monsters your opponent controls.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 24094653, name: "Polymerization", type: "Spell Card", desc: "Fusion Summon 1 Fusion Monster from your Extra Deck.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 87796900, name: "Curse of Dragon", type: "Normal Monster", desc: "A wicked dragon that taps into dark forces to execute a powerful attack.", atk: 2000, def: 1500, level: 5, race: "Dragon", attribute: "DARK", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 70781052, name: "Fissure", type: "Spell Card", desc: "Destroy the 1 face-up monster your opponent controls that has the lowest ATK.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },

            // === R (Rare) ===
            { id: 37313786, name: "Hitotsu-Me Giant", type: "Normal Monster", desc: "A one-eyed behemoth with thick, powerful arms.", atk: 1200, def: 1000, level: 4, race: "Beast-Warrior", attribute: "EARTH", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 26202165, name: "Koumori Dragon", type: "Normal Monster", desc: "A vicious dragon with origins in the dark.", atk: 1500, def: 1200, level: 4, race: "Dragon", attribute: "DARK", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 41392891, name: "Rogue Doll", type: "Normal Monster", desc: "A deadly doll gifted with mystical power.", atk: 1600, def: 1000, level: 4, race: "Spellcaster", attribute: "LIGHT", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 54652250, name: "Man-Eater Bug", type: "Effect Monster", desc: "FLIP: Target 1 monster on the field; destroy that target.", atk: 450, def: 600, level: 2, race: "Insect", attribute: "EARTH", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 50045299, name: "Dragon Capture Jar", type: "Trap Card", desc: "Change all face-up Dragon monsters on the field to Defense Position.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 83764718, name: "Monster Reborn", type: "Spell Card", desc: "Target 1 monster in either GY; Special Summon it.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 19159413, name: "Book of Secret Arts", type: "Spell Card", desc: "Equip only to a Spellcaster monster. It gains 300 ATK and DEF.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 78706415, name: "Legendary Sword", type: "Spell Card", desc: "Equip only to a Warrior monster. It gains 300 ATK and DEF.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 46130346, name: "Trap Hole", type: "Trap Card", desc: "When your opponent Normal or Flip Summons 1 monster with 1000 or more ATK: Destroy that monster.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 86325596, name: "Charubin the Fire Knight", type: "Fusion Monster", desc: "Monster Egg + Hinotama Soul", atk: 1100, def: 800, level: 3, race: "Pyro", attribute: "FIRE", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },

            // === N (Common) ===
            { id: 32274490, name: "Skull Servant", type: "Normal Monster", desc: "A skeletal ghost that isn't strong but can mean trouble in large numbers.", atk: 300, def: 200, level: 1, race: "Zombie", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 90357090, name: "Silver Fang", type: "Normal Monster", desc: "A snow wolf that's beautiful to the eye but fierce in battle.", atk: 1200, def: 800, level: 3, race: "Beast", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 65622692, name: "Mystical Elf", type: "Normal Monster", desc: "A delicate elf that lacks offense but has a terrific defense backed by mystical power.", atk: 800, def: 2000, level: 4, race: "Spellcaster", attribute: "LIGHT", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 40374923, name: "Feral Imp", type: "Normal Monster", desc: "A playful little fiend that lurks in the dark.", atk: 1300, def: 1400, level: 4, race: "Fiend", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 69455834, name: "Winged Dragon, Guardian of the Fortress #1", type: "Normal Monster", desc: "A dragon commonly found guarding mountain fortresses.", atk: 1400, def: 1200, level: 4, race: "Dragon", attribute: "WIND", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 49218300, name: "Beaver Warrior", type: "Normal Monster", desc: "What this creature lacks in size it makes up for in defense when battling in the prairie.", atk: 1200, def: 1500, level: 4, race: "Beast-Warrior", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 85602018, name: "Sorcerer of the Doomed", type: "Normal Monster", desc: "A sorcerer who conjures dark magic.", atk: 1450, def: 1200, level: 4, race: "Spellcaster", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 15401633, name: "Armaill", type: "Normal Monster", desc: "A strange warrior who manipulates three swords with both hands and tail.", atk: 700, def: 1300, level: 3, race: "Warrior", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 76184692, name: "Dark Titan of Terror", type: "Normal Monster", desc: "A fiend that dwells in the world of darkness.", atk: 1300, def: 1100, level: 4, race: "Fiend", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 66788016, name: "Witty Phantom", type: "Normal Monster", desc: "A phantom known for its tricky and cunning ways.", atk: 1400, def: 1300, level: 4, race: "Fiend", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 97590747, name: "Larvas", type: "Normal Monster", desc: "A fast-moving creature with a razor-sharp tail.", atk: 800, def: 1000, level: 3, race: "Beast", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 44287299, name: "Hard Armor", type: "Normal Monster", desc: "A living suit of armor that attacks enemies with razor-sharp claws.", atk: 300, def: 1200, level: 3, race: "Warrior", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 62340868, name: "Two-Mouth Darkruler", type: "Normal Monster", desc: "A dinosaur with two deadly jaws.", atk: 900, def: 700, level: 3, race: "Dinosaur", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 13945283, name: "Nemuriko", type: "Normal Monster", desc: "A child-like creature that controls a sleep fiend to protect itself.", atk: 800, def: 700, level: 3, race: "Spellcaster", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 75745607, name: "Ancient Elf", type: "Normal Monster", desc: "This elf is said to have lived for thousands of years.", atk: 1450, def: 1200, level: 4, race: "Spellcaster", attribute: "LIGHT", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
        ]
    },

    // ====== MRD - 金属侵略者 ======
    "Metal Raiders": {
        setCode: "Metal Raiders",
        totalCards: 144,
        fetchedAt: 0,
        cards: [
            // === UR ===
            { id: 70368879, name: "Gate Guardian", type: "Effect Monster", desc: "Cannot be Normal Summoned/Set. Must first be Special Summoned by Tributing 1 \"Sanga of the Thunder\", \"Kazejin\", and \"Suijin\".", atk: 3750, def: 3400, level: 11, race: "Warrior", attribute: "DARK", rarity: "Secret Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 70781052, name: "Summoned Skull", type: "Normal Monster", desc: "A fiend with dark powers for confusing the enemy.", atk: 2500, def: 1200, level: 6, race: "Fiend", attribute: "DARK", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 11384280, name: "Mirror Force", type: "Trap Card", desc: "When an opponent's monster declares an attack: Destroy all your opponent's Attack Position monsters.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 41420027, name: "Solemn Judgment", type: "Trap Card", desc: "When a monster would be Summoned, OR a Spell/Trap Card is activated: Pay half your LP; negate the Summon or activation, and if you do, destroy that card.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 19613556, name: "Heavy Storm", type: "Spell Card", desc: "Destroy all Spell and Trap Cards on the field.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },

            // === SR ===
            { id: 12511899, name: "Sanga of the Thunder", type: "Effect Monster", desc: "Cannot be Normal Summoned/Set. Must be Special Summoned.", atk: 2600, def: 2200, level: 7, race: "Thunder", attribute: "LIGHT", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 62340868, name: "Kazejin", type: "Effect Monster", desc: "During damage calculation, if your opponent's monster attacks this card.", atk: 2400, def: 2200, level: 7, race: "Spellcaster", attribute: "WIND", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 98434877, name: "Suijin", type: "Effect Monster", desc: "During damage calculation, if your opponent's monster attacks this card.", atk: 2500, def: 2400, level: 7, race: "Aqua", attribute: "WATER", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 12510878, name: "Harpie Lady Sisters", type: "Effect Monster", desc: "Cannot be Normal Summoned/Set.", atk: 1950, def: 2100, level: 6, race: "Winged Beast", attribute: "WIND", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 24068492, name: "Elegant Egotist", type: "Spell Card", desc: "If you control a \"Harpie Lady\": Special Summon 1 \"Harpie Lady\" or \"Harpie Lady Sisters\" from your hand or Deck.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 11868825, name: "Black Skull Dragon", type: "Fusion Monster", desc: "\"Summoned Skull\" + \"Red-Eyes Black Dragon\"", atk: 3200, def: 2500, level: 9, race: "Dragon", attribute: "DARK", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },

            // === R ===
            { id: 28279543, name: "Mask of Darkness", type: "Effect Monster", desc: "FLIP: Target 1 Trap Card in your GY; add that target to your hand.", atk: 900, def: 400, level: 2, race: "Fiend", attribute: "DARK", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 15150365, name: "White Magical Hat", type: "Effect Monster", desc: "When this card inflicts Battle Damage to your opponent: Discard 1 random card from their hand.", atk: 1000, def: 700, level: 3, race: "Spellcaster", attribute: "LIGHT", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 31890399, name: "Magician of Faith", type: "Effect Monster", desc: "FLIP: Target 1 Spell Card in your GY; add that target to your hand.", atk: 300, def: 400, level: 1, race: "Spellcaster", attribute: "LIGHT", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 77414722, name: "Magic Jammer", type: "Trap Card", desc: "When a Spell Card is activated: Discard 1 card; negate the activation, and if you do, destroy it.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 29155212, name: "Seven Tools of the Bandit", type: "Trap Card", desc: "When a Trap Card is activated: Pay 1000 LP; negate the activation, and if you do, destroy it.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 37820550, name: "Rush Recklessly", type: "Spell Card", desc: "Target 1 face-up monster on the field; it gains 700 ATK until the end of this turn.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },

            // === N ===
            { id: 41392891, name: "Feral Imp", type: "Normal Monster", desc: "A playful little fiend that lurks in the dark.", atk: 1300, def: 1400, level: 4, race: "Fiend", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 46986414, name: "Larvae Moth", type: "Effect Monster", desc: "This monster can be placed on Petit Moth equipped with Cocoon of Evolution.", atk: 500, def: 400, level: 2, race: "Insect", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 17985575, name: "Mega Thunderball", type: "Normal Monster", desc: "A thunder ball that mercilessly rolls over all enemies.", atk: 750, def: 600, level: 2, race: "Thunder", attribute: "WIND", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 72842870, name: "Toad Master", type: "Normal Monster", desc: "A frog-like creature.", atk: 1000, def: 1000, level: 3, race: "Aqua", attribute: "WATER", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 55784832, name: "Kuriboh", type: "Effect Monster", desc: "During your opponent's turn, you can discard this card to reduce Battle Damage to 0.", atk: 300, def: 200, level: 1, race: "Fiend", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 14851496, name: "Mystic Lamp", type: "Effect Monster", desc: "An electric lamp with a mystical light.", atk: 400, def: 300, level: 1, race: "Spellcaster", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 37580756, name: "Steel Scorpion", type: "Effect Monster", desc: "A scorpion made from steel.", atk: 250, def: 300, level: 1, race: "Machine", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 96851799, name: "Dorover", type: "Normal Monster", desc: "A strange creature.", atk: 500, def: 500, level: 3, race: "Fiend", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 66672569, name: "Gruesome Goo", type: "Normal Monster", desc: "A slimy creature.", atk: 1300, def: 700, level: 3, race: "Aqua", attribute: "WATER", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 13039848, name: "Flying Penguin", type: "Normal Monster", desc: "A penguin that can soar through the skies.", atk: 1200, def: 1000, level: 4, race: "Aqua", attribute: "WATER", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
        ]
    },

    // ====== PSV - 法老的仆从 ======
    "Pharaoh's Servant": {
        setCode: "Pharaoh's Servant",
        totalCards: 105,
        fetchedAt: 0,
        cards: [
            // === UR ===
            { id: 14536035, name: "Jinzo", type: "Effect Monster", desc: "Trap Cards, and their effects on the field, are negated.", atk: 2400, def: 1500, level: 6, race: "Machine", attribute: "DARK", rarity: "Secret Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 63515678, name: "Imperial Order", type: "Trap Card", desc: "Negate all Spell effects on the field.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 44095762, name: "Mirror Wall", type: "Trap Card", desc: "Each attacking monster has its ATK halved.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 20060230, name: "Premature Burial", type: "Spell Card", desc: "Activate this card by paying 800 LP, then target 1 monster in your GY; Special Summon that target in Attack Position and equip it with this card.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },

            // === SR ===
            { id: 52077741, name: "Nobleman of Crossout", type: "Spell Card", desc: "Target 1 face-down monster on the field; destroy that target, and if you do, banish it.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 43154985, name: "Limiter Removal", type: "Spell Card", desc: "Double the ATK of all Machine monsters you currently control, until the end of this turn.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 17375316, name: "Dust Tornado", type: "Trap Card", desc: "Target 1 Spell/Trap your opponent controls; destroy that target, then you can Set 1 Spell/Trap from your hand.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 44256816, name: "Call of the Haunted", type: "Trap Card", desc: "Target 1 monster in your GY; Special Summon that target in Attack Position.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 49721904, name: "Gearfried the Iron Knight", type: "Effect Monster", desc: "If an Equip Card(s) is equipped to this card: Destroy that Equip Card(s).", atk: 1800, def: 1600, level: 4, race: "Warrior", attribute: "EARTH", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },

            // === R ===
            { id: 52038441, name: "Thousand-Eyes Restrict", type: "Fusion Monster", desc: "\"Relinquished\" + \"Thousand-Eyes Idol\"", atk: 0, def: 0, level: 1, race: "Spellcaster", attribute: "DARK", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 2111707, name: "Relinquished", type: "Ritual Monster", desc: "You can Ritual Summon this card with \"Black Illusion Ritual\".", atk: 0, def: 0, level: 1, race: "Spellcaster", attribute: "DARK", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 94773007, name: "Ceasefire", type: "Trap Card", desc: "Flip all face-down Defense Position monsters on the field face-up. Inflict 500 damage to your opponent for each Effect Monster on the field.", atk: null, def: null, level: null, race: "Trap", attribute: "TRAP", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 81385346, name: "Gravekeeper's Servant", type: "Spell Card", desc: "Your opponent must send the top card of their Deck to the GY to declare an attack.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 8753087, name: "Needle Worm", type: "Effect Monster", desc: "FLIP: Send the top 5 cards of your opponent's Deck to the GY.", atk: 750, def: 600, level: 2, race: "Insect", attribute: "EARTH", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },

            // === N ===
            { id: 13945283, name: "Dharma Cannon", type: "Normal Monster", desc: "A strange spirit monster.", atk: 900, def: 500, level: 2, race: "Machine", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 75745607, name: "Gear Golem the Moving Fortress", type: "Effect Monster", desc: "A fortress-like machine monster.", atk: 800, def: 2200, level: 4, race: "Machine", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 42348802, name: "Hayabusa Knight", type: "Effect Monster", desc: "This card can attack twice during each Battle Phase.", atk: 1000, def: 700, level: 3, race: "Warrior", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 34743446, name: "Humanoid Slime", type: "Normal Monster", desc: "A slime with a human-like shape.", atk: 800, def: 2000, level: 4, race: "Aqua", attribute: "WATER", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 60862676, name: "Parasitic Ticky", type: "Normal Monster", desc: "A small parasitic creature.", atk: 500, def: 400, level: 2, race: "Insect", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 76232340, name: "Spikebot", type: "Normal Monster", desc: "A robot covered in sharp spikes.", atk: 1800, def: 1700, level: 5, race: "Machine", attribute: "EARTH", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 38199696, name: "Mucus Yolk", type: "Effect Monster", desc: "A strange creature.", atk: 0, def: 100, level: 3, race: "Aqua", attribute: "WATER", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 88240808, name: "The Shallow Grave", type: "Spell Card", desc: "Each player targets 1 monster in their GY; Special Summon them in face-down Defense Position.", atk: null, def: null, level: null, race: "Spell", attribute: "SPELL", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 68827491, name: "Labyrinth Tank", type: "Fusion Monster", desc: "Giga-Tech Wolf + Cannon Soldier", atk: 2400, def: 2400, level: 7, race: "Machine", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 87880531, name: "Science Soldier", type: "Normal Monster", desc: "A soldier equipped with high-tech equipment.", atk: 800, def: 800, level: 3, race: "Warrior", attribute: "DARK", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
        ]
    }
};

    // ====================================================================
    // OCG 卡包备用数据（亚洲版）
    // ====================================================================

    // ====== OCG Vol.1（中文备用数据，key 对应 packId） ======
    "ocg_vol1": {
        setCode: "ocg_vol1",
        totalCards: 30,
        fetchedAt: 0,
        dataSource: 'fallback',
        cards: [
            // === UR ===
            { id: 89631139, name: "青眼白龙", type: "Normal Monster", desc: "以高攻击力著称的传说之龙。任何对手都能粉碎，其破坏力不可估量。", atk: 3000, def: 2500, level: 8, race: "龙", attribute: "光", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 46986414, name: "黑魔术师", type: "Normal Monster", desc: "作为魔术师，攻击力和守备力是最高级别。", atk: 2500, def: 2100, level: 7, race: "魔法师", attribute: "暗", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 74677422, name: "真红眼黑龙", type: "Normal Monster", desc: "用锐利的爪子攻击敌人的凶恶之龙。", atk: 2400, def: 2000, level: 7, race: "龙", attribute: "暗", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },

            // === SR ===
            { id: 44209392, name: "凯尔特守护者", type: "Normal Monster", desc: "掌握了剑技的精灵。", atk: 1400, def: 1200, level: 4, race: "战士", attribute: "地", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 12580477, name: "雷击", type: "Spell Card", desc: "破坏对方场上所有怪兽。", atk: null, def: null, level: null, race: "魔法", attribute: "魔法", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 53129443, name: "黑洞", type: "Spell Card", desc: "破坏场上所有怪兽。", atk: null, def: null, level: null, race: "魔法", attribute: "魔法", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 87796900, name: "诅咒之龙", type: "Normal Monster", desc: "借助暗之力量进行强力攻击的邪恶之龙。", atk: 2000, def: 1500, level: 5, race: "龙", attribute: "暗", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 70781052, name: "恶魔召唤", type: "Normal Monster", desc: "用电击攻击使敌人混乱的恶魔。", atk: 2500, def: 1200, level: 6, race: "恶魔", attribute: "暗", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },

            // === R ===
            { id: 6368038, name: "暗黑骑士盖亚", type: "Normal Monster", desc: "骑着比风还快的马的骑士。", atk: 2300, def: 2100, level: 7, race: "战士", attribute: "地", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 83764718, name: "死者苏生", type: "Spell Card", desc: "从任意一方墓地选择1只怪兽特殊召唤。", atk: null, def: null, level: null, race: "魔法", attribute: "魔法", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 46130346, name: "陷坑", type: "Trap Card", desc: "对方通常召唤或翻转召唤攻击力1000以上怪兽时破坏该怪兽。", atk: null, def: null, level: null, race: "陷阱", attribute: "陷阱", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 54652250, name: "食人虫", type: "Effect Monster", desc: "翻转：选择场上1只怪兽破坏。", atk: 450, def: 600, level: 2, race: "昆虫", attribute: "地", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 24094653, name: "融合", type: "Spell Card", desc: "从额外卡组融合召唤1只融合怪兽。", atk: null, def: null, level: null, race: "魔法", attribute: "魔法", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 19159413, name: "大风暴", type: "Spell Card", desc: "破坏场上所有魔法·陷阱卡。", atk: null, def: null, level: null, race: "魔法", attribute: "魔法", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },

            // === N ===
            { id: 32274490, name: "骷髅仆人", type: "Normal Monster", desc: "力量虽弱但数量多了就很麻烦的骷髅幽灵。", atk: 300, def: 200, level: 1, race: "不死", attribute: "暗", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 90357090, name: "白银之牙", type: "Normal Monster", desc: "美丽但凶猛的雪狼。", atk: 1200, def: 800, level: 3, race: "兽", attribute: "地", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 65622692, name: "神秘的精灵", type: "Normal Monster", desc: "攻击力虽低但守备力极高的精灵。", atk: 800, def: 2000, level: 4, race: "魔法师", attribute: "光", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 40374923, name: "小恶魔", type: "Normal Monster", desc: "潜伏在黑暗中的淘气小恶魔。", atk: 1300, def: 1400, level: 4, race: "恶魔", attribute: "暗", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 69455834, name: "守护要塞的翼龙", type: "Normal Monster", desc: "常见于守卫山岳要塞的龙。", atk: 1400, def: 1200, level: 4, race: "龙", attribute: "风", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 49218300, name: "河童战士", type: "Normal Monster", desc: "体型虽小但在草原战斗中守备力很强。", atk: 1200, def: 1500, level: 4, race: "兽战士", attribute: "地", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 37313786, name: "独眼巨人", type: "Normal Monster", desc: "拥有粗壮手臂的独眼巨人。", atk: 1200, def: 1000, level: 4, race: "兽战士", attribute: "地", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 76184692, name: "暗黑恐惧巨人", type: "Normal Monster", desc: "栖息在暗之世界的恶魔。", atk: 1300, def: 1100, level: 4, race: "恶魔", attribute: "暗", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 75745607, name: "古代精灵", type: "Normal Monster", desc: "据说活了几千年的精灵。", atk: 1450, def: 1200, level: 4, race: "魔法师", attribute: "光", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
        ]
    },

    // ====== OCG Vol.2（中文备用数据） ======
    "ocg_vol2": {
        setCode: "ocg_vol2",
        totalCards: 25,
        fetchedAt: 0,
        dataSource: 'fallback',
        cards: [
            // === UR ===
            { id: 70368879, name: "守护神", type: "Effect Monster", desc: "不能通常召唤。必须用「雷魔神-桑加」「风魔神-修加」「水魔神-苏伽」作为祭品特殊召唤。", atk: 3750, def: 3400, level: 11, race: "战士", attribute: "暗", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 11384280, name: "神圣防护罩-反射镜力-", type: "Trap Card", desc: "对方怪兽攻击宣言时，破坏对方场上所有攻击表示怪兽。", atk: null, def: null, level: null, race: "陷阱", attribute: "陷阱", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 41420027, name: "神之宣告", type: "Trap Card", desc: "支付一半基本分；怪兽的召唤·魔法·陷阱的发动无效并破坏。", atk: null, def: null, level: null, race: "陷阱", attribute: "陷阱", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },

            // === SR ===
            { id: 12511899, name: "雷魔神-桑加", type: "Effect Monster", desc: "守护神的组件之一。", atk: 2600, def: 2200, level: 7, race: "雷", attribute: "光", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 98434877, name: "水魔神-苏伽", type: "Effect Monster", desc: "守护神的组件之一。", atk: 2500, def: 2400, level: 7, race: "水", attribute: "水", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 45231177, name: "火焰剑士", type: "Fusion Monster", desc: "火焰操纵者+传说之剑豪 将兵", atk: 1800, def: 1600, level: 5, race: "战士", attribute: "炎", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 11868825, name: "黑暗骷髅龙", type: "Fusion Monster", desc: "恶魔召唤+真红眼黑龙", atk: 3200, def: 2500, level: 9, race: "龙", attribute: "暗", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },

            // === R ===
            { id: 77414722, name: "魔法干扰阵", type: "Trap Card", desc: "丢弃1张手卡；魔法卡的发动无效并破坏。", atk: null, def: null, level: null, race: "陷阱", attribute: "陷阱", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 28279543, name: "黑暗假面", type: "Effect Monster", desc: "翻转：从墓地选择1张陷阱卡加入手卡。", atk: 900, def: 400, level: 2, race: "恶魔", attribute: "暗", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 31890399, name: "圣之魔术师", type: "Effect Monster", desc: "翻转：从墓地选择1张魔法卡加入手卡。", atk: 300, def: 400, level: 1, race: "魔法师", attribute: "光", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 37820550, name: "突进", type: "Spell Card", desc: "选择1只怪兽；该怪兽攻击力上升700直到回合结束。", atk: null, def: null, level: null, race: "魔法", attribute: "魔法", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },

            // === N ===
            { id: 55784832, name: "栗子球", type: "Effect Monster", desc: "丢弃此卡使战斗伤害变为0。", atk: 300, def: 200, level: 1, race: "恶魔", attribute: "暗", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 17985575, name: "雷电球", type: "Normal Monster", desc: "无情地碾过所有敌人的雷球。", atk: 750, def: 600, level: 2, race: "雷", attribute: "风", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 72842870, name: "青蛙大师", type: "Normal Monster", desc: "像青蛙一样的生物。", atk: 1000, def: 1000, level: 3, race: "水", attribute: "水", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 85602018, name: "诅咒之术师", type: "Normal Monster", desc: "操纵暗黑魔法的术师。", atk: 1450, def: 1200, level: 4, race: "魔法师", attribute: "暗", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 15401633, name: "阿玛伊尔", type: "Normal Monster", desc: "用双手和尾巴操纵三把剑的奇特战士。", atk: 700, def: 1300, level: 3, race: "战士", attribute: "地", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 66788016, name: "灵巧幻影", type: "Normal Monster", desc: "以诡计和狡猾而闻名的幻影。", atk: 1400, def: 1300, level: 4, race: "恶魔", attribute: "暗", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 13039848, name: "飞行企鹅", type: "Normal Monster", desc: "可以在天空翱翔的企鹅。", atk: 1200, def: 1000, level: 4, race: "水", attribute: "水", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
        ]
    },

    // ====== OCG Vol.3（中文备用数据） ======
    "ocg_vol3": {
        setCode: "ocg_vol3",
        totalCards: 20,
        fetchedAt: 0,
        dataSource: 'fallback',
        cards: [
            // === UR ===
            { id: 14536035, name: "人造人-Psycho Shocker", type: "Effect Monster", desc: "场上的陷阱卡的效果无效化。", atk: 2400, def: 1500, level: 6, race: "机械", attribute: "暗", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 63515678, name: "王宫的敕命", type: "Trap Card", desc: "场上的魔法卡的效果无效化。", atk: null, def: null, level: null, race: "陷阱", attribute: "陷阱", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },
            { id: 44095762, name: "银幕之镜壁", type: "Trap Card", desc: "攻击怪兽的攻击力减半。", atk: null, def: null, level: null, race: "陷阱", attribute: "陷阱", rarity: "Ultra Rare", rarityCode: "UR", imageUrl: null, imageLargeUrl: null },

            // === SR ===
            { id: 44256816, name: "活死人的呼声", type: "Trap Card", desc: "从墓地特殊召唤1只怪兽。", atk: null, def: null, level: null, race: "陷阱", attribute: "陷阱", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 43154985, name: "限制器解除", type: "Spell Card", desc: "自己场上机械族怪兽攻击力翻倍。", atk: null, def: null, level: null, race: "魔法", attribute: "魔法", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },
            { id: 49721904, name: "铁骑士 基尔弗里德", type: "Effect Monster", desc: "装备卡装备时破坏该装备卡。", atk: 1800, def: 1600, level: 4, race: "战士", attribute: "地", rarity: "Super Rare", rarityCode: "SR", imageUrl: null, imageLargeUrl: null },

            // === R ===
            { id: 17375316, name: "尘旋风", type: "Trap Card", desc: "破坏对方场上1张魔法·陷阱卡。", atk: null, def: null, level: null, race: "陷阱", attribute: "陷阱", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 8753087, name: "针虫", type: "Effect Monster", desc: "翻转：将对方卡组上方5张卡送入墓地。", atk: 750, def: 600, level: 2, race: "昆虫", attribute: "地", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 52077741, name: "贵族的抹杀者", type: "Spell Card", desc: "破坏并除外1只里侧守备表示怪兽。", atk: null, def: null, level: null, race: "魔法", attribute: "魔法", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },
            { id: 94773007, name: "停战协定", type: "Trap Card", desc: "将里侧怪兽全部翻转；每有1只效果怪兽给予对方500伤害。", atk: null, def: null, level: null, race: "陷阱", attribute: "陷阱", rarity: "Rare", rarityCode: "R", imageUrl: null, imageLargeUrl: null },

            // === N ===
            { id: 42348802, name: "隼之骑士", type: "Effect Monster", desc: "可以进行2次攻击。", atk: 1000, def: 700, level: 3, race: "战士", attribute: "地", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 34743446, name: "人型黏液怪", type: "Normal Monster", desc: "人形的黏液。", atk: 800, def: 2000, level: 4, race: "水", attribute: "水", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 76232340, name: "尖钉机器人", type: "Normal Monster", desc: "全身覆盖尖刺的机器人。", atk: 1800, def: 1700, level: 5, race: "机械", attribute: "地", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 87880531, name: "科学战士", type: "Normal Monster", desc: "装备高科技设备的战士。", atk: 800, def: 800, level: 3, race: "战士", attribute: "暗", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 37580756, name: "钢铁蝎子", type: "Effect Monster", desc: "钢铁制成的蝎子。", atk: 250, def: 300, level: 1, race: "机械", attribute: "地", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
            { id: 44287299, name: "钢铁骑士", type: "Normal Monster", desc: "活着的铠甲。", atk: 300, def: 1200, level: 3, race: "战士", attribute: "地", rarity: "Common", rarityCode: "N", imageUrl: null, imageLargeUrl: null },
        ]
    }
};

console.log('📂 离线备用卡牌数据已加载（OCG 中文 + TCG 英文）');
