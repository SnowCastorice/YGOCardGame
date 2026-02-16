/**
 * ============================================
 * YGO Pack Opener - API 调用与缓存管理模块
 * 版本: 0.4.0
 * 
 * 【文件说明】
 * 负责与两个数据源通信，并将数据缓存到玩家设备上：
 * 
 * OCG 模式数据源：
 *   - 卡牌信息：YGOCDB API (ygocdb.com) — 中文卡牌数据
 *   - 卡牌图片：YGOProDeck CDN — 通过卡牌ID构造图片URL
 * 
 * TCG 模式数据源：
 *   - 卡牌信息 + 图片：YGOProDeck API (db.ygoprodeck.com)
 * 
 * 缓存方式：
 *   1. IndexedDB — 缓存卡牌数据（名称、攻防、效果、图片URL等）
 *   2. Cache API — 缓存卡牌图片文件
 * ============================================
 */

// ====== 配置常量 ======
const API_CONFIG = {
    // === TCG 数据源：YGOProDeck ===
    YGOPRODECK: {
        BASE_URL: 'https://db.ygoprodeck.com/api/v7',
        IMAGE_SMALL_URL: 'https://images.ygoprodeck.com/images/cards_small',
        IMAGE_LARGE_URL: 'https://images.ygoprodeck.com/images/cards'
    },

    // === OCG 数据源：YGOCDB ===
    YGOCDB: {
        BASE_URL: 'https://ygocdb.com/api/v0',
        // OCG 卡图也用 YGOProDeck CDN（通过卡牌ID直接构造URL）
        IMAGE_SMALL_URL: 'https://images.ygoprodeck.com/images/cards_small',
        IMAGE_LARGE_URL: 'https://images.ygoprodeck.com/images/cards'
    },

    // 缓存过期时间（毫秒）
    CACHE_EXPIRY: {
        CARD_DATA: 7 * 24 * 60 * 60 * 1000,    // 卡牌数据：7天
        CARD_SETS: 1 * 24 * 60 * 60 * 1000,     // 卡包列表：1天
        CARD_IMAGES: 30 * 24 * 60 * 60 * 1000    // 卡牌图片：30天
    },

    // IndexedDB 数据库配置
    DB_NAME: 'YGOPackOpener',
    DB_VERSION: 2,

    // Cache API 存储名称
    IMAGE_CACHE_NAME: 'ygo-card-images',

    // 请求间隔（毫秒），避免请求过快
    REQUEST_INTERVAL: 80
};

// ====== IndexedDB 数据库管理 ======

/**
 * 打开（或创建）IndexedDB 数据库
 * 
 * 【简单解释】
 * IndexedDB 就像一个嵌入在浏览器里的小型数据库。
 * 玩家第一次打开网页时会自动创建，关掉浏览器数据也不会丢失。
 * 我们用它来存放从 API 下载的卡牌数据，避免每次打开网页都重新下载。
 */
function openDatabase() {
    return new Promise(function (resolve, reject) {
        const request = indexedDB.open(API_CONFIG.DB_NAME, API_CONFIG.DB_VERSION);

        // 第一次创建数据库（或版本升级时）会触发这个事件
        request.onupgradeneeded = function (event) {
            const db = event.target.result;

            // 创建"卡包卡牌数据"存储表
            if (!db.objectStoreNames.contains('cardSets')) {
                db.createObjectStore('cardSets', { keyPath: 'setCode' });
            }

            // 创建"缓存元信息"表（记录每条缓存的更新时间）
            if (!db.objectStoreNames.contains('cacheMeta')) {
                db.createObjectStore('cacheMeta', { keyPath: 'key' });
            }

            console.log('📦 IndexedDB 数据库结构创建完成');
        };

        request.onsuccess = function (event) {
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            console.error('❌ IndexedDB 打开失败:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * 向 IndexedDB 写入数据
 */
function dbPut(storeName, data) {
    return new Promise(async function (resolve, reject) {
        try {
            const db = await openDatabase();
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.put(data);
            tx.oncomplete = function () {
                db.close();
                resolve();
            };
            tx.onerror = function (event) {
                db.close();
                reject(event.target.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 从 IndexedDB 读取数据
 */
function dbGet(storeName, key) {
    return new Promise(async function (resolve, reject) {
        try {
            const db = await openDatabase();
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = function () {
                db.close();
                resolve(request.result || null);
            };
            request.onerror = function (event) {
                db.close();
                reject(event.target.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 从 IndexedDB 删除数据
 */
function dbDelete(storeName, key) {
    return new Promise(async function (resolve, reject) {
        try {
            const db = await openDatabase();
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.delete(key);
            tx.oncomplete = function () {
                db.close();
                resolve();
            };
            tx.onerror = function (event) {
                db.close();
                reject(event.target.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * 清空 IndexedDB 所有数据
 */
function dbClearAll() {
    return new Promise(async function (resolve, reject) {
        try {
            const db = await openDatabase();
            const storeNames = ['cardSets', 'cacheMeta'];
            const tx = db.transaction(storeNames, 'readwrite');
            storeNames.forEach(function (name) {
                tx.objectStore(name).clear();
            });
            tx.oncomplete = function () {
                db.close();
                resolve();
            };
            tx.onerror = function (event) {
                db.close();
                reject(event.target.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// ====== 缓存过期检查 ======

/**
 * 检查某个缓存是否已过期
 */
async function isCacheValid(cacheKey, maxAge) {
    try {
        const meta = await dbGet('cacheMeta', cacheKey);
        if (!meta) return false;
        const age = Date.now() - meta.timestamp;
        return age < maxAge;
    } catch (error) {
        return false;
    }
}

/**
 * 更新缓存的时间戳
 */
async function updateCacheTimestamp(cacheKey) {
    await dbPut('cacheMeta', {
        key: cacheKey,
        timestamp: Date.now()
    });
}

// ====== 工具函数 ======

/** 延迟函数，用于控制请求频率 */
function delay(ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

// ====== YGOCDB API（OCG 中文数据源） ======

/**
 * 从 YGOCDB 获取单张卡牌信息（通过卡牌ID）
 * 
 * @param {number} cardId - 卡牌ID
 * @returns {object|null} 卡牌信息对象，失败返回 null
 */
async function fetchCardFromYGOCDB(cardId) {
    const url = `${API_CONFIG.YGOCDB.BASE_URL}/?search=${cardId}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`YGOCDB 请求失败: ${response.status}`);
        }

        const data = await response.json();

        if (!data.result || data.result.length === 0) {
            console.warn(`⚠️ YGOCDB 未找到卡牌 ID: ${cardId}`);
            return null;
        }

        // 搜索结果可能有多张卡，找到 ID 精确匹配的那张
        const card = data.result.find(function (c) {
            return c.id === cardId;
        }) || data.result[0];

        return card;
    } catch (error) {
        console.error(`❌ YGOCDB 请求失败 [${cardId}]:`, error);
        return null;
    }
}

/**
 * 解析 YGOCDB 的 types 字段，提取种族、属性、等级等信息
 * 
 * 【格式示例】
 * "[怪兽|通常] 龙/光\n[★8] 3000/2500"
 * "[怪兽|效果] 机械/暗\n[★6] 2400/1500"
 * "[魔法|通常]"
 * "[陷阱|反击]"
 */
function parseYGOCDBTypes(typesStr) {
    const result = {
        cardType: 'Monster',   // Monster / Spell / Trap
        subType: '',            // 通常 / 效果 / 融合 / 仪式 / 同调 / 超量 / 链接
        race: '',               // 种族
        attribute: '',          // 属性
        level: null,
        atk: null,
        def: null
    };

    if (!typesStr) return result;

    // 判断卡牌大类
    if (typesStr.includes('[魔法')) {
        result.cardType = 'Spell Card';
        return result;
    }
    if (typesStr.includes('[陷阱')) {
        result.cardType = 'Trap Card';
        return result;
    }

    // 怪兽卡解析
    const lines = typesStr.split('\n');

    // 第一行: "[怪兽|通常] 龙/光" 或 "[怪兽|效果] 机械/暗"
    if (lines[0]) {
        const bracketMatch = lines[0].match(/\[怪兽\|(.+?)\]/);
        if (bracketMatch) {
            result.subType = bracketMatch[1]; // "通常", "效果", "融合" 等
        }

        // 提取种族/属性
        const afterBracket = lines[0].replace(/\[.*?\]/, '').trim();
        const parts = afterBracket.split('/');
        if (parts.length >= 2) {
            result.race = parts[0].trim();
            result.attribute = parts[1].trim();
        }
    }

    // 第二行: "[★8] 3000/2500"
    if (lines[1]) {
        const levelMatch = lines[1].match(/★(\d+)/);
        if (levelMatch) {
            result.level = parseInt(levelMatch[1]);
        }
        const statsMatch = lines[1].match(/(\d+)\/(\d+)/);
        if (statsMatch) {
            result.atk = parseInt(statsMatch[1]);
            result.def = parseInt(statsMatch[2]);
        }
    }

    // 决定怪兽类型名称
    if (result.subType.includes('融合')) {
        result.cardType = 'Fusion Monster';
    } else if (result.subType.includes('仪式')) {
        result.cardType = 'Ritual Monster';
    } else if (result.subType.includes('同调')) {
        result.cardType = 'Synchro Monster';
    } else if (result.subType.includes('超量')) {
        result.cardType = 'Xyz Monster';
    } else if (result.subType.includes('链接')) {
        result.cardType = 'Link Monster';
    } else if (result.subType.includes('效果')) {
        result.cardType = 'Effect Monster';
    } else {
        result.cardType = 'Normal Monster';
    }

    return result;
}

/**
 * 将 YGOCDB 的卡牌数据转换为我们统一的格式
 * 
 * @param {object} ygocdbCard - YGOCDB 返回的卡牌对象
 * @param {string} rarityCode - 稀有度编码（从 cards.json 预定义）
 * @returns {object} 统一格式的卡牌对象
 */
function convertYGOCDBCard(ygocdbCard, rarityCode) {
    const parsed = parseYGOCDBTypes(ygocdbCard.text ? ygocdbCard.text.types : '');
    const rarityNames = { 'UR': 'Ultra Rare', 'SR': 'Super Rare', 'R': 'Rare', 'N': 'Common' };

    return {
        id: ygocdbCard.id,
        name: ygocdbCard.cn_name || ygocdbCard.en_name || ('ID:' + ygocdbCard.id),
        nameJP: ygocdbCard.jp_name || '',
        nameEN: ygocdbCard.en_name || '',
        type: parsed.cardType,
        desc: ygocdbCard.text ? ygocdbCard.text.desc : '',
        atk: ygocdbCard.data ? ygocdbCard.data.atk : parsed.atk,
        def: ygocdbCard.data ? ygocdbCard.data.def : parsed.def,
        level: ygocdbCard.data ? ygocdbCard.data.level : parsed.level,
        race: parsed.race,
        attribute: parsed.attribute,
        rarity: rarityNames[rarityCode] || 'Common',
        rarityCode: rarityCode || 'N',
        // 卡图使用 YGOProDeck CDN（通过卡牌ID构造URL）
        imageUrl: `${API_CONFIG.YGOCDB.IMAGE_SMALL_URL}/${ygocdbCard.id}.jpg`,
        imageLargeUrl: `${API_CONFIG.YGOCDB.IMAGE_LARGE_URL}/${ygocdbCard.id}.jpg`,
        // 标记数据来源
        dataSource: 'ygocdb'
    };
}

/**
 * 【OCG 专用】获取 OCG 卡包的所有卡牌数据
 * 
 * 【工作流程】
 * 1. 从 cards.json 中读取卡包的 cardIds 列表
 * 2. 检查 IndexedDB 缓存
 * 3. 如果缓存有效 → 直接返回
 * 4. 如果缓存无效 → 逐个通过 YGOCDB API 获取卡牌信息，组合成卡包数据
 * 5. 存入 IndexedDB 缓存
 * 
 * @param {object} packConfig - 卡包配置（来自 cards.json 的 OCG 卡包对象）
 * @param {function} onProgress - 加载进度回调（可选）
 * @returns {object} 包含 cards 数组的卡包数据
 */
async function getOCGCardSetData(packConfig, onProgress) {
    const packId = packConfig.packId;
    const cacheKey = `cardSet_ocg_${packId}`;

    // 1. 检查缓存
    const cacheValid = await isCacheValid(cacheKey, API_CONFIG.CACHE_EXPIRY.CARD_DATA);

    if (cacheValid) {
        const cached = await dbGet('cardSets', packId);
        if (cached && cached.cards && cached.cards.length > 0) {
            console.log(`📦 从缓存加载 OCG 卡包 [${packConfig.packName}]，共 ${cached.cards.length} 张卡`);
            return cached;
        }
    }

    // 2. 缓存无效，从 YGOCDB API 获取
    console.log(`🌐 从 YGOCDB 加载 OCG 卡包 [${packConfig.packName}]...`);

    const cardIds = packConfig.cardIds || [];
    if (cardIds.length === 0) {
        throw new Error(`OCG 卡包 [${packConfig.packName}] 没有配置 cardIds`);
    }

    const cards = [];
    let loadedCount = 0;

    for (const cardDef of cardIds) {
        try {
            const ygocdbCard = await fetchCardFromYGOCDB(cardDef.id);

            if (ygocdbCard) {
                cards.push(convertYGOCDBCard(ygocdbCard, cardDef.rarityCode));
            } else {
                // API 获取失败，用基本信息创建卡牌（至少有 ID 和稀有度）
                console.warn(`⚠️ 卡牌 ${cardDef.id} (${cardDef.name_hint || '未知'}) 从 YGOCDB 获取失败，使用基本信息`);
                cards.push({
                    id: cardDef.id,
                    name: cardDef.name_hint || `卡牌 #${cardDef.id}`,
                    nameJP: '',
                    nameEN: '',
                    type: 'Unknown',
                    desc: '（卡牌信息加载失败）',
                    atk: null,
                    def: null,
                    level: null,
                    race: '',
                    attribute: '',
                    rarity: cardDef.rarityCode === 'UR' ? 'Ultra Rare' : cardDef.rarityCode === 'SR' ? 'Super Rare' : cardDef.rarityCode === 'R' ? 'Rare' : 'Common',
                    rarityCode: cardDef.rarityCode || 'N',
                    imageUrl: `${API_CONFIG.YGOCDB.IMAGE_SMALL_URL}/${cardDef.id}.jpg`,
                    imageLargeUrl: `${API_CONFIG.YGOCDB.IMAGE_LARGE_URL}/${cardDef.id}.jpg`,
                    dataSource: 'fallback'
                });
            }

            loadedCount++;
            if (onProgress) {
                onProgress(loadedCount, cardIds.length);
            }

            // 控制请求频率
            await delay(API_CONFIG.REQUEST_INTERVAL);

        } catch (error) {
            console.error(`❌ 获取卡牌 ${cardDef.id} 失败:`, error);
            loadedCount++;
        }
    }

    // 3. 构建缓存数据
    const setData = {
        setCode: packId,  // 用 packId 作为缓存 key
        cards: cards,
        totalCards: cards.length,
        fetchedAt: Date.now(),
        dataSource: 'ygocdb'
    };

    // 4. 存入缓存
    await dbPut('cardSets', setData);
    await updateCacheTimestamp(cacheKey);

    console.log(`✅ OCG 卡包 [${packConfig.packName}] 加载完成，共 ${cards.length} 张卡（来自 YGOCDB），已缓存`);
    return setData;
}

// ====== YGOProDeck API（TCG 数据源） ======

/**
 * 安全的 API 请求函数（YGOProDeck 专用）
 */
async function apiRequestYGOProDeck(endpoint) {
    const url = `${API_CONFIG.YGOPRODECK.BASE_URL}/${endpoint}`;
    console.log(`🌐 YGOProDeck API 请求: ${url}`);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        await delay(API_CONFIG.REQUEST_INTERVAL);
        return data;
    } catch (error) {
        console.error(`❌ YGOProDeck API 请求失败 [${endpoint}]:`, error);
        throw error;
    }
}

/**
 * 【TCG 专用】获取某个卡包的所有卡牌数据（从 YGOProDeck）
 * 
 * @param {string} setCode - 卡包编码（如 "Legend of Blue Eyes White Dragon"）
 * @returns {object} 包含 cards 数组的卡包数据
 */
async function getTCGCardSetData(setCode) {
    const cacheKey = `cardSet_tcg_${setCode}`;

    // 1. 检查缓存
    const cacheValid = await isCacheValid(cacheKey, API_CONFIG.CACHE_EXPIRY.CARD_DATA);

    if (cacheValid) {
        const cached = await dbGet('cardSets', setCode);
        if (cached) {
            console.log(`📦 从缓存加载 TCG 卡包 [${setCode}]，共 ${cached.cards.length} 张卡`);
            return cached;
        }
    }

    // 2. 从 YGOProDeck API 获取
    console.log(`🌐 从 YGOProDeck 加载 TCG 卡包 [${setCode}]...`);

    try {
        const apiData = await apiRequestYGOProDeck(`cardinfo.php?cardset=${encodeURIComponent(setCode)}`);

        if (!apiData || !apiData.data) {
            throw new Error(`卡包 [${setCode}] 未找到数据`);
        }

        // 提取需要的字段
        const cards = apiData.data.map(function (card) {
            let rarity = 'Common';
            let rarityCode = 'N';
            if (card.card_sets) {
                const setInfo = card.card_sets.find(function (s) {
                    return s.set_name === setCode || s.set_code.startsWith(setCode);
                });
                if (setInfo) {
                    rarity = setInfo.set_rarity;
                    rarityCode = mapRarityToCode(setInfo.set_rarity);
                }
            }

            return {
                id: card.id,
                name: card.name,
                type: card.type,
                desc: card.desc,
                atk: card.atk,
                def: card.def,
                level: card.level,
                race: card.race,
                attribute: card.attribute,
                rarity: rarity,
                rarityCode: rarityCode,
                imageUrl: card.card_images && card.card_images[0]
                    ? card.card_images[0].image_url_small
                    : null,
                imageLargeUrl: card.card_images && card.card_images[0]
                    ? card.card_images[0].image_url
                    : null,
                dataSource: 'ygoprodeck'
            };
        });

        // 存入缓存
        const setData = {
            setCode: setCode,
            cards: cards,
            totalCards: cards.length,
            fetchedAt: Date.now(),
            dataSource: 'ygoprodeck'
        };

        await dbPut('cardSets', setData);
        await updateCacheTimestamp(cacheKey);

        console.log(`✅ TCG 卡包 [${setCode}] 加载完成，共 ${cards.length} 张卡（来自 YGOProDeck），已缓存`);
        return setData;

    } catch (error) {
        // 尝试过期缓存
        const staleCache = await dbGet('cardSets', setCode);
        if (staleCache) {
            console.warn(`⚠️ API 请求失败，使用过期缓存 [${setCode}]`);
            return staleCache;
        }

        // 尝试离线备用数据
        if (window.FALLBACK_CARD_DATA && window.FALLBACK_CARD_DATA[setCode]) {
            console.warn(`⚠️ API 请求失败，使用离线备用数据 [${setCode}]`);
            const fallbackData = window.FALLBACK_CARD_DATA[setCode];
            const setData = {
                setCode: setCode,
                cards: fallbackData.cards,
                totalCards: fallbackData.cards.length,
                fetchedAt: Date.now(),
                isOfflineData: true
            };
            await dbPut('cardSets', setData);
            await updateCacheTimestamp(cacheKey);
            return setData;
        }

        throw error;
    }
}

/**
 * 【统一入口】根据模式获取卡包卡牌数据
 * 
 * @param {string} mode - 'ocg' 或 'tcg'
 * @param {object} packConfig - 卡包配置对象
 * @param {function} onProgress - 加载进度回调（OCG模式下有用）
 * @returns {object} 卡包数据
 */
async function getCardSetData(mode, packConfig, onProgress) {
    if (mode === 'ocg') {
        return await getOCGCardSetData(packConfig, onProgress);
    } else {
        return await getTCGCardSetData(packConfig.setCode);
    }
}

/**
 * 将 YGOProDeck 的稀有度名称映射为简短编码
 */
function mapRarityToCode(rarityName) {
    if (!rarityName) return 'N';

    const name = rarityName.toLowerCase();

    if (name.includes('secret')) return 'UR';
    if (name.includes('ultimate')) return 'UR';
    if (name.includes('ghost')) return 'UR';
    if (name.includes('ultra')) return 'UR';
    if (name.includes('super')) return 'SR';
    if (name.includes('rare') && !name.includes('common')) return 'R';
    return 'N';
}

// ====== 卡图缓存管理 ======

/**
 * 获取卡牌图片（优先使用缓存）
 */
async function getCachedImageUrl(imageUrl) {
    if (!imageUrl) return null;

    if (!('caches' in window)) {
        return imageUrl;
    }

    try {
        const cache = await caches.open(API_CONFIG.IMAGE_CACHE_NAME);
        const cachedResponse = await cache.match(imageUrl);
        if (cachedResponse) {
            const blob = await cachedResponse.blob();
            return URL.createObjectURL(blob);
        }

        // 缓存未命中，后台静默缓存
        cacheImageInBackground(imageUrl);
        return imageUrl;

    } catch (error) {
        console.warn('⚠️ 图片缓存操作失败，使用原始URL:', error);
        return imageUrl;
    }
}

/**
 * 后台静默缓存图片
 */
async function cacheImageInBackground(imageUrl) {
    try {
        const cache = await caches.open(API_CONFIG.IMAGE_CACHE_NAME);
        const response = await fetch(imageUrl, { mode: 'cors' });
        if (response.ok) {
            await cache.put(imageUrl, response);
            console.log(`🖼️ 图片已缓存: ${imageUrl.split('/').pop()}`);
        }
    } catch (error) {
        console.warn('⚠️ 后台图片缓存失败:', error.message);
    }
}

/**
 * 批量预加载卡包的所有卡图
 */
async function preloadCardImages(cards, onProgress) {
    if (!('caches' in window)) return;

    const cache = await caches.open(API_CONFIG.IMAGE_CACHE_NAME);
    let loaded = 0;
    const total = cards.filter(function (c) { return c.imageUrl; }).length;

    for (const card of cards) {
        if (!card.imageUrl) continue;

        try {
            const cached = await cache.match(card.imageUrl);
            if (!cached) {
                const response = await fetch(card.imageUrl, { mode: 'cors' });
                if (response.ok) {
                    await cache.put(card.imageUrl, response);
                }
                await delay(API_CONFIG.REQUEST_INTERVAL);
            }
        } catch (error) {
            // 单张图片失败不影响整体
        }

        loaded++;
        if (onProgress && total > 0) {
            onProgress(loaded, total);
        }
    }

    console.log(`🖼️ 卡图预加载完成：${loaded}/${total}`);
}

// ====== 缓存管理工具函数 ======

/**
 * 获取缓存状态信息
 */
async function getCacheStatus() {
    const status = {
        cardSets: [],
        totalCards: 0,
        imageCacheAvailable: 'caches' in window
    };

    try {
        const db = await openDatabase();
        const tx = db.transaction('cardSets', 'readonly');
        const store = tx.objectStore('cardSets');

        return new Promise(function (resolve) {
            const request = store.openCursor();
            request.onsuccess = function (event) {
                const cursor = event.target.result;
                if (cursor) {
                    const data = cursor.value;
                    status.cardSets.push({
                        setCode: data.setCode,
                        cardCount: data.cards.length,
                        fetchedAt: new Date(data.fetchedAt).toLocaleDateString('zh-CN'),
                        dataSource: data.dataSource || 'unknown'
                    });
                    status.totalCards += data.cards.length;
                    cursor.continue();
                } else {
                    db.close();
                    resolve(status);
                }
            };
            request.onerror = function () {
                db.close();
                resolve(status);
            };
        });
    } catch (error) {
        return status;
    }
}

/**
 * 清除所有缓存数据
 */
async function clearAllCache() {
    try {
        await dbClearAll();

        if ('caches' in window) {
            await caches.delete(API_CONFIG.IMAGE_CACHE_NAME);
        }

        console.log('🗑️ 所有缓存已清除');
        return true;
    } catch (error) {
        console.error('❌ 清除缓存失败:', error);
        return false;
    }
}

/**
 * 刷新指定卡包的缓存
 */
async function refreshCardSetCache(setCode) {
    await dbDelete('cardSets', setCode);
    await dbDelete('cacheMeta', `cardSet_ocg_${setCode}`);
    await dbDelete('cacheMeta', `cardSet_tcg_${setCode}`);
}

// ====== 导出供 game.js 使用的接口 ======

window.TCG_API = {
    // 统一入口：获取卡包卡牌数据
    getCardSetData: getCardSetData,

    // 获取缓存的图片 URL
    getCachedImageUrl: getCachedImageUrl,

    // 批量预加载卡图
    preloadCardImages: preloadCardImages,

    // 缓存管理
    getCacheStatus: getCacheStatus,
    clearAllCache: clearAllCache,
    refreshCardSetCache: refreshCardSetCache,

    // 稀有度映射
    mapRarityToCode: mapRarityToCode,

    // 常量
    CONFIG: API_CONFIG
};

console.log('🔌 API 模块加载完成（支持 YGOCDB + YGOProDeck 双数据源）');
