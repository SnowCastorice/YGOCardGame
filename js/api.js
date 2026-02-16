/**
 * ============================================
 * YGO Pack Opener - API 调用与缓存管理模块
 * 版本: 0.5.0
 * 
 * 【文件说明】
 * 负责与数据源通信，并将数据缓存到玩家设备上：
 * 
 * 主要数据源：YGOProDeck API (db.ygoprodeck.com)
 *   - 支持多语言：?language=ja（日文）/ en（英文）/ ko（韩文）等
 *   - OCG 模式默认使用日文（language=ja）
 *   - TCG 模式默认使用英文（language=en）
 * 
 * 备用数据源：YGOCDB API (ygocdb.com)
 *   - 提供中文卡牌数据（简体中文）
 *   - 当 YGOProDeck 不可用时作为 OCG 的 fallback
 * 
 * 缓存方式：
 *   1. IndexedDB — 缓存卡牌数据（名称、攻防、效果、图片URL等）
 *   2. Cache API — 缓存卡牌图片文件
 * ============================================
 */

// ====== 配置常量 ======
const API_CONFIG = {
    // === 主要数据源：YGOProDeck（支持多语言） ===
    YGOPRODECK: {
        BASE_URL: 'https://db.ygoprodeck.com/api/v7',
        IMAGE_SMALL_URL: 'https://images.ygoprodeck.com/images/cards_small',
        IMAGE_LARGE_URL: 'https://images.ygoprodeck.com/images/cards'
    },

    // === 备用数据源：YGOCDB（中文数据，OCG fallback 用） ===
    YGOCDB: {
        BASE_URL: 'https://ygocdb.com/api/v0'
    },

    // === 语言配置 ===
    // 【扩展指南】如需新增语言，只需在此添加新条目：
    //   1. 添加语言代码（如 'zh'）
    //   2. YGOProDeck 支持的语言参数：en, fr, de, it, pt, ja, ko
    //   3. 如果 YGOProDeck 不支持该语言，设置 ygoprodeckLang 为 null，
    //      并配置 fallbackSource 为 'ygocdb'（中文可走 YGOCDB）
    LANGUAGES: {
        'ja': {
            code: 'ja',
            name: '日本語',
            nameLocal: '日文',
            ygoprodeckLang: 'ja',      // YGOProDeck 支持的语言参数
            fallbackSource: 'ygocdb',  // API 失败时的备用数据源
            nameField: 'jp_name',      // YGOCDB 中对应的名称字段
            descField: null            // YGOCDB 无日文描述，用中文代替
        },
        'en': {
            code: 'en',
            name: 'English',
            nameLocal: '英文',
            ygoprodeckLang: null,       // 英文是 YGOProDeck 的默认语言，不需要 language 参数
            fallbackSource: null,
            nameField: 'en_name',
            descField: null
        },
        'ko': {
            code: 'ko',
            name: '한국어',
            nameLocal: '韩文',
            ygoprodeckLang: 'ko',
            fallbackSource: null,
            nameField: null,
            descField: null
        }
        // 【预留】简体中文 — YGOProDeck 暂不支持 zh，需要走 YGOCDB
        // 'zh': {
        //     code: 'zh',
        //     name: '简体中文',
        //     nameLocal: '简体中文',
        //     ygoprodeckLang: null,       // YGOProDeck 不支持中文
        //     fallbackSource: 'ygocdb',   // 中文数据走 YGOCDB
        //     nameField: 'cn_name',
        //     descField: 'desc'           // YGOCDB 的描述是中文
        // }
    },

    // 各模式的默认语言
    DEFAULT_LANG: {
        ocg: 'ja',   // OCG 默认日文
        tcg: 'en'    // TCG 默认英文
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
    REQUEST_INTERVAL: 80,

    // OCG 批量查询每批最大 ID 数（YGOProDeck 支持逗号分隔多个 ID）
    BATCH_SIZE: 20
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

// ====== 语言与数据源管理 ======

/**
 * 获取当前 OCG 语言设置
 * 默认日文（ja），可通过 localStorage 切换
 */
function getOCGLanguage() {
    const saved = localStorage.getItem('ygo_ocg_language');
    if (saved && API_CONFIG.LANGUAGES[saved]) {
        return saved;
    }
    return API_CONFIG.DEFAULT_LANG.ocg;
}

/**
 * 设置 OCG 语言
 * @param {string} langCode - 语言代码（如 'ja', 'en', 'ko'）
 */
function setOCGLanguage(langCode) {
    if (API_CONFIG.LANGUAGES[langCode]) {
        localStorage.setItem('ygo_ocg_language', langCode);
    }
}

/**
 * 获取当前语言配置对象
 * @param {string} mode - 'ocg' 或 'tcg'
 * @returns {object} 语言配置
 */
function getLanguageConfig(mode) {
    if (mode === 'ocg') {
        const langCode = getOCGLanguage();
        return API_CONFIG.LANGUAGES[langCode] || API_CONFIG.LANGUAGES['ja'];
    }
    return API_CONFIG.LANGUAGES['en'];
}

/**
 * 获取所有可用的语言列表
 * @returns {Array} 语言配置数组
 */
function getAvailableLanguages() {
    return Object.values(API_CONFIG.LANGUAGES);
}

// ====== YGOCDB API（备用中文数据源） ======

/**
 * 从 YGOCDB 获取单张卡牌信息（通过卡牌ID）
 * 【备用数据源】当 YGOProDeck 不可用时，OCG 模式会 fallback 到这里
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
 * 将 YGOCDB 的卡牌数据转换为统一格式（用于中文 fallback）
 */
function convertYGOCDBCard(ygocdbCard, rarityCode) {
    const rarityNames = { 'UR': 'Ultra Rare', 'SR': 'Super Rare', 'R': 'Rare', 'N': 'Common' };

    // 解析 types 字段获取种族/属性/等级
    let cardType = 'Normal Monster';
    let race = '';
    let attribute = '';
    let level = null;
    let atk = null;
    let def = null;

    const typesStr = ygocdbCard.text ? ygocdbCard.text.types : '';
    if (typesStr) {
        if (typesStr.includes('[魔法')) cardType = 'Spell Card';
        else if (typesStr.includes('[陷阱')) cardType = 'Trap Card';
        else if (typesStr.includes('效果')) cardType = 'Effect Monster';
        else if (typesStr.includes('融合')) cardType = 'Fusion Monster';

        const lines = typesStr.split('\n');
        if (lines[0]) {
            const afterBracket = lines[0].replace(/\[.*?\]/, '').trim();
            const parts = afterBracket.split('/');
            if (parts.length >= 2) {
                race = parts[0].trim();
                attribute = parts[1].trim();
            }
        }
        if (lines[1]) {
            const levelMatch = lines[1].match(/★(\d+)/);
            if (levelMatch) level = parseInt(levelMatch[1]);
            const statsMatch = lines[1].match(/(\d+)\/(\d+)/);
            if (statsMatch) {
                atk = parseInt(statsMatch[1]);
                def = parseInt(statsMatch[2]);
            }
        }
    }

    return {
        id: ygocdbCard.id,
        name: ygocdbCard.cn_name || ygocdbCard.jp_name || ygocdbCard.en_name || ('ID:' + ygocdbCard.id),
        nameJP: ygocdbCard.jp_name || '',
        nameEN: ygocdbCard.en_name || '',
        nameCN: ygocdbCard.cn_name || '',
        type: cardType,
        desc: ygocdbCard.text ? ygocdbCard.text.desc : '',
        atk: ygocdbCard.data ? ygocdbCard.data.atk : atk,
        def: ygocdbCard.data ? ygocdbCard.data.def : def,
        level: ygocdbCard.data ? ygocdbCard.data.level : level,
        race: race,
        attribute: attribute,
        rarity: rarityNames[rarityCode] || 'Common',
        rarityCode: rarityCode || 'N',
        imageUrl: `${API_CONFIG.YGOPRODECK.IMAGE_SMALL_URL}/${ygocdbCard.id}.jpg`,
        imageLargeUrl: `${API_CONFIG.YGOPRODECK.IMAGE_LARGE_URL}/${ygocdbCard.id}.jpg`,
        dataSource: 'ygocdb'
    };
}

// ====== YGOProDeck API（主数据源，支持多语言） ======

/**
 * 安全的 API 请求函数（YGOProDeck 专用）
 * @param {string} endpoint - API 端点
 * @param {string|null} language - 语言参数（如 'ja', 'ko'），null 表示默认英文
 */
async function apiRequestYGOProDeck(endpoint, language) {
    let url = `${API_CONFIG.YGOPRODECK.BASE_URL}/${endpoint}`;
    // 添加语言参数（如果有）
    if (language) {
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}language=${language}`;
    }
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
 * 将 YGOProDeck 返回的卡牌数据转换为统一格式
 * 
 * @param {object} card - YGOProDeck 返回的卡牌对象
 * @param {string} rarityCode - 稀有度编码（从 cards.json 预定义，OCG 模式专用）
 * @param {string} setCode - 卡包编码（TCG 模式用于匹配稀有度）
 * @returns {object} 统一格式的卡牌对象
 */
function convertYGOProDeckCard(card, rarityCode, setCode) {
    // 如果没有预定义稀有度，从 card_sets 中获取（TCG 模式）
    let rarity = 'Common';
    let code = rarityCode || 'N';

    if (!rarityCode && card.card_sets && setCode) {
        const setInfo = card.card_sets.find(function (s) {
            return s.set_name === setCode || s.set_code.startsWith(setCode);
        });
        if (setInfo) {
            rarity = setInfo.set_rarity;
            code = mapRarityToCode(setInfo.set_rarity);
        }
    } else {
        const rarityNames = { 'UR': 'Ultra Rare', 'SR': 'Super Rare', 'R': 'Rare', 'N': 'Common' };
        rarity = rarityNames[code] || 'Common';
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
        rarityCode: code,
        imageUrl: card.card_images && card.card_images[0]
            ? card.card_images[0].image_url_small
            : `${API_CONFIG.YGOPRODECK.IMAGE_SMALL_URL}/${card.id}.jpg`,
        imageLargeUrl: card.card_images && card.card_images[0]
            ? card.card_images[0].image_url
            : `${API_CONFIG.YGOPRODECK.IMAGE_LARGE_URL}/${card.id}.jpg`,
        dataSource: 'ygoprodeck'
    };
}

/**
 * 【OCG 专用】获取 OCG 卡包的所有卡牌数据
 * 
 * 【工作流程】
 * 1. 从 cards.json 中读取卡包的 cardIds 列表
 * 2. 检查 IndexedDB 缓存
 * 3. 缓存有效 → 直接返回
 * 4. 缓存无效 → 通过 YGOProDeck API 批量获取（?id=xxx,yyy&language=ja）
 * 5. 如果 YGOProDeck 失败 → fallback 到 YGOCDB（中文）或离线备用数据
 * 6. 存入 IndexedDB 缓存
 * 
 * @param {object} packConfig - 卡包配置（来自 cards.json 的 OCG 卡包对象）
 * @param {function} onProgress - 加载进度回调（可选）
 * @returns {object} 包含 cards 数组的卡包数据
 */
async function getOCGCardSetData(packConfig, onProgress) {
    const packId = packConfig.packId;
    const langCode = getOCGLanguage();
    const langConfig = getLanguageConfig('ocg');
    const cacheKey = `cardSet_ocg_${langCode}_${packId}`;

    // 1. 检查缓存
    const cacheValid = await isCacheValid(cacheKey, API_CONFIG.CACHE_EXPIRY.CARD_DATA);

    if (cacheValid) {
        const cached = await dbGet('cardSets', `${packId}_${langCode}`);
        if (cached && cached.cards && cached.cards.length > 0) {
            console.log(`📦 从缓存加载 OCG 卡包 [${packConfig.packName}] (${langConfig.nameLocal})，共 ${cached.cards.length} 张卡`);
            return cached;
        }
    }

    // 2. 缓存无效，从 YGOProDeck API 批量获取
    console.log(`🌐 从 YGOProDeck 加载 OCG 卡包 [${packConfig.packName}] (${langConfig.nameLocal})...`);

    const cardIds = packConfig.cardIds || [];
    if (cardIds.length === 0) {
        throw new Error(`OCG 卡包 [${packConfig.packName}] 没有配置 cardIds`);
    }

    // 构建稀有度映射表（ID → rarityCode）
    const rarityMap = {};
    cardIds.forEach(function (cardDef) {
        rarityMap[cardDef.id] = cardDef.rarityCode;
    });

    // 获取所有卡牌 ID 列表
    const allIds = cardIds.map(function (c) { return c.id; });

    let cards = [];

    try {
        // 2.1 尝试 YGOProDeck 批量查询
        cards = await fetchOCGCardsFromYGOProDeck(allIds, rarityMap, langConfig, onProgress);
        console.log(`✅ YGOProDeck 返回 ${cards.length} 张卡`);

    } catch (error) {
        console.warn(`⚠️ YGOProDeck 批量获取失败:`, error.message);

        // 2.2 Fallback：尝试 YGOCDB（中文数据）
        if (langConfig.fallbackSource === 'ygocdb') {
            console.log(`🔄 尝试 YGOCDB 备用数据源...`);
            try {
                cards = await fetchOCGCardsFromYGOCDB(allIds, rarityMap, onProgress);
                console.log(`✅ YGOCDB 返回 ${cards.length} 张卡`);
            } catch (ygocdbError) {
                console.warn(`⚠️ YGOCDB 也失败了:`, ygocdbError.message);
            }
        }

        // 2.3 Fallback：使用离线备用数据
        if (cards.length === 0) {
            console.warn(`⚠️ 所有 API 不可用，尝试离线备用数据 [${packId}]`);
            if (window.FALLBACK_CARD_DATA && window.FALLBACK_CARD_DATA[packId]) {
                const fallbackData = window.FALLBACK_CARD_DATA[packId];
                const setData = {
                    setCode: `${packId}_${langCode}`,
                    cards: fallbackData.cards,
                    totalCards: fallbackData.cards.length,
                    fetchedAt: Date.now(),
                    isOfflineData: true,
                    dataSource: 'fallback',
                    language: langCode
                };
                await dbPut('cardSets', setData);
                await updateCacheTimestamp(cacheKey);
                console.log(`📦 使用离线备用数据 [${packConfig.packName}]，共 ${setData.cards.length} 张卡`);
                return setData;
            }
            throw new Error(`卡包 [${packConfig.packName}] 无法获取数据（API 和离线数据均不可用）`);
        }
    }

    // 3. 构建缓存数据
    const setData = {
        setCode: `${packId}_${langCode}`,
        cards: cards,
        totalCards: cards.length,
        fetchedAt: Date.now(),
        dataSource: cards[0] ? cards[0].dataSource : 'unknown',
        language: langCode
    };

    // 4. 存入缓存
    await dbPut('cardSets', setData);
    await updateCacheTimestamp(cacheKey);

    const sourceLabel = setData.dataSource === 'ygoprodeck' ? 'YGOProDeck' : 'YGOCDB';
    console.log(`✅ OCG 卡包 [${packConfig.packName}] (${langConfig.nameLocal}) 加载完成，共 ${cards.length} 张卡（来自 ${sourceLabel}），已缓存`);
    return setData;
}

/**
 * 通过 YGOProDeck 批量获取 OCG 卡牌（按 ID 列表）
 * 
 * @param {Array} allIds - 卡牌 ID 数组
 * @param {object} rarityMap - ID → rarityCode 映射
 * @param {object} langConfig - 语言配置
 * @param {function} onProgress - 进度回调
 * @returns {Array} 统一格式的卡牌数组
 */
async function fetchOCGCardsFromYGOProDeck(allIds, rarityMap, langConfig, onProgress) {
    const cards = [];
    const batchSize = API_CONFIG.BATCH_SIZE;

    // 分批查询
    for (let i = 0; i < allIds.length; i += batchSize) {
        const batchIds = allIds.slice(i, i + batchSize);
        const idParam = batchIds.join(',');

        const apiData = await apiRequestYGOProDeck(
            `cardinfo.php?id=${idParam}`,
            langConfig.ygoprodeckLang
        );

        if (apiData && apiData.data) {
            apiData.data.forEach(function (card) {
                const rarityCode = rarityMap[card.id] || 'N';
                cards.push(convertYGOProDeckCard(card, rarityCode, null));
            });
        }

        // 更新进度
        if (onProgress) {
            onProgress(Math.min(i + batchSize, allIds.length), allIds.length);
        }

        // 控制请求频率（批次间间隔）
        if (i + batchSize < allIds.length) {
            await delay(API_CONFIG.REQUEST_INTERVAL);
        }
    }

    return cards;
}

/**
 * 通过 YGOCDB 逐张获取 OCG 卡牌（备用中文数据源）
 * 
 * @param {Array} allIds - 卡牌 ID 数组
 * @param {object} rarityMap - ID → rarityCode 映射
 * @param {function} onProgress - 进度回调
 * @returns {Array} 统一格式的卡牌数组
 */
async function fetchOCGCardsFromYGOCDB(allIds, rarityMap, onProgress) {
    const cards = [];
    let loadedCount = 0;

    for (const cardId of allIds) {
        try {
            const ygocdbCard = await fetchCardFromYGOCDB(cardId);
            if (ygocdbCard) {
                const rarityCode = rarityMap[cardId] || 'N';
                cards.push(convertYGOCDBCard(ygocdbCard, rarityCode));
            }
        } catch (error) {
            console.warn(`⚠️ YGOCDB 获取卡牌 ${cardId} 失败`);
        }

        loadedCount++;
        if (onProgress) {
            onProgress(loadedCount, allIds.length);
        }
        await delay(API_CONFIG.REQUEST_INTERVAL);
    }

    if (cards.length === 0) {
        throw new Error('YGOCDB 未返回任何有效卡牌');
    }

    return cards;
}

// ====== TCG 卡包获取（YGOProDeck，英文） ======

/**
 * 【TCG 专用】获取某个卡包的所有卡牌数据（从 YGOProDeck，英文）
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

    // 2. 从 YGOProDeck API 获取（TCG 默认英文，不传 language 参数）
    console.log(`🌐 从 YGOProDeck 加载 TCG 卡包 [${setCode}]...`);

    try {
        const apiData = await apiRequestYGOProDeck(
            `cardinfo.php?cardset=${encodeURIComponent(setCode)}`,
            null  // TCG 用英文（默认语言）
        );

        if (!apiData || !apiData.data) {
            throw new Error(`卡包 [${setCode}] 未找到数据`);
        }

        // 使用统一转换函数
        const cards = apiData.data.map(function (card) {
            return convertYGOProDeckCard(card, null, setCode);
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

    // 语言管理
    getOCGLanguage: getOCGLanguage,
    setOCGLanguage: setOCGLanguage,
    getLanguageConfig: getLanguageConfig,
    getAvailableLanguages: getAvailableLanguages,

    // 常量
    CONFIG: API_CONFIG
};

console.log('🔌 API 模块加载完成（YGOProDeck 多语言 + YGOCDB 中文备用）');
