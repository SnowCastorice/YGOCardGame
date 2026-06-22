/**
 * ============================================
 * YGO Pack Opener - API 调用与数据管理模块
 * 版本: 2.0.0
 * 
 * 【文件说明】
 * 负责获取卡牌数据并供游戏使用：
 * 
 * 主要数据获取方式：
 *   1. 本地数据优先（v2.0 新增）
 *      - OCG 卡包卡牌文件（data/ocg/cards/*.json）中已内嵌 cardData 节点
 *      - cardData 由 build_pack_data.py 脚本从 cards.json（YGOCDB 全量数据）提取注入
 *      - 网页运行时直接读取本地 JSON，零 API 调用！
 * 
 *   2. API 回退（兼容未构建的卡包）
 *      - YGOProDeck API (db.ygoprodeck.com) — 获取外文卡牌数据
 *      - YGOCDB API (ygocdb.com) — 获取中文卡牌名称
 * 
 * 卡牌展示方式（面向中国区用户）：
 *   - 主名称：中文名（来自 cardData / YGOCDB）
 *   - 副名称：外文名（OCG=日文）
 * 
 * 缓存方式（仅 API 回退模式使用）：
 *   1. IndexedDB — 缓存通过 API 获取的卡牌数据
 *   2. Cache API — 缓存卡牌图片文件
 * ============================================
 */

// ====== 配置常量 ======

/**
 * 卡图 CDN 基础 URL（Cloudflare R2 对象存储）
 * R2 目录结构：ocg/dist/{pack}/{setNumber}_{rarity}.webp（调用图库）
 *              ocg/source/{pack}/{原始文件名}.webp（原始图库备份）
 * 本地开发时自动回退到 data/ocg/images_dist（本地调用图库）
 * 切换自定义域名时只需改这一处
 */
const CARD_IMAGE_BASE_URL = 'https://pub-bafe4b6b5a6c4dc6a70d48ecc9a83f9e.r2.dev/ocg/dist';

/** 判断是否为本地开发环境 */
function isLocalDev() {
    // 从 localStorage 恢复 _forceR2 状态（设置面板中的开关）
    if (window._forceR2 === undefined) {
        window._forceR2 = localStorage.getItem('forceR2') === 'true';
    }
    if (window._forceR2) return false;
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

/** 获取卡图目录的完整 URL 前缀 */
function getCardImageDir(relativeDir) {
    if (isLocalDev()) {
        return 'data/ocg/images_dist/' + relativeDir;
    }
    return CARD_IMAGE_BASE_URL + '/' + relativeDir;
}

const API_CONFIG = {
    // === 主要数据源：YGOProDeck（支持多语言） ===
    YGOPRODECK: {
        BASE_URL: 'https://db.ygoprodeck.com/api/v7'
        // 注：YGOProDeck 卡图 CDN 已不再使用，所有卡图完全本地化
    },

    // === 备用数据源：YGOCDB（中文数据，OCG fallback 用） ===
    YGOCDB: {
        BASE_URL: 'https://ygocdb.com/api/v0'
        // 注：YGOCDB CDN 卡图已不再使用，所有卡图完全本地化
    },

    // === YugiohMeta（仅保留引用，CDN 卡图已不再使用） ===
    YUGIOHMETA: {},

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
        ocg: 'ja'    // OCG 默认日文
    },

    // 是否为中国区用户补充中文名（通过 YGOCDB 获取）
    ENABLE_CN_NAME: true,

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

    // === API 限流保护 ===
    // ⚠️ 重要：YGOProDeck 免费 API 限制为 20 requests/second
    // 超过限制会返回 403，严重违规可能被永久封禁！
    // 这里使用保守的间隔确保安全
    REQUEST_INTERVAL: 300,        // 请求间隔（毫秒），每秒约 3 次请求，远低于限制
    RETRY_BACKOFF_BASE: 2000,     // 限流退避基础等待时间（毫秒）
    RETRY_MAX_ATTEMPTS: 3,        // 限流重试最大次数

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

/**
 * 全局请求节流器
 * 
 * 【简单解释】
 * 确保所有 API 请求之间至少间隔 REQUEST_INTERVAL 毫秒，
 * 即使有多个调用链同时运行（如加载卡牌 + 补充中文名），
 * 也不会导致请求过快触发 API 限流。
 * 
 * ⚠️ YGOProDeck 免费 API 限制：20 requests/second
 *    超过限制会返回 403，严重违规可能被永久封禁！
 */
const requestThrottler = {
    lastRequestTime: 0,
    
    /**
     * 等待直到可以安全发送下一个请求
     * @param {number} interval - 最小间隔（毫秒），默认使用 REQUEST_INTERVAL
     */
    async waitForNext(interval) {
        const minInterval = interval || API_CONFIG.REQUEST_INTERVAL;
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < minInterval) {
            await delay(minInterval - elapsed);
        }
        this.lastRequestTime = Date.now();
    }
};

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
 * @param {string} mode - 游戏模式（当前仅支持 'ocg'）
 * @returns {object} 语言配置
 */
function getLanguageConfig(mode) {
    const langCode = getOCGLanguage();
    return API_CONFIG.LANGUAGES[langCode] || API_CONFIG.LANGUAGES['ja'];
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

    // 使用全局节流器确保请求间隔安全
    await requestThrottler.waitForNext();

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
function convertYGOCDBCard(ygocdbCard, rarityCode, rarityVersions) {
    const rarityNames = { 'PSER': 'Prismatic Secret Rare', 'UTR': 'Ultimate Rare', 'SER': 'Secret Rare', 'UR': 'Ultra Rare', 'SR': 'Super Rare', 'R': 'Rare', 'NR': 'Normal Rare', 'N': 'Common' };

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

    // 中文名作为主名称
    const cnName = ygocdbCard.cn_name || '';
    const jpName = ygocdbCard.jp_name || '';
    const enName = ygocdbCard.en_name || '';
    // 主显示名：优先中文，其次日文，最后英文
    const displayName = cnName || jpName || enName || ('ID:' + ygocdbCard.id);
    // 外文名：优先日文，其次英文
    const foreignName = jpName || enName || '';

    return {
        id: ygocdbCard.id,
        name: displayName,
        nameCN: cnName,
        nameOriginal: foreignName,
        type: cardType,
        desc: ygocdbCard.text ? ygocdbCard.text.desc : '',
        atk: ygocdbCard.data ? ygocdbCard.data.atk : atk,
        def: ygocdbCard.data ? ygocdbCard.data.def : def,
        level: ygocdbCard.data ? ygocdbCard.data.level : level,
        race: race,
        attribute: attribute,
        rarity: rarityNames[rarityCode] || 'Common',
        rarityVersions: rarityVersions || [rarityCode || 'N'],  // 多版本稀有度
        cardSetCode: '',             // YGOCDB 无卡包编号，后续由加载流程补充
        setNumber: 0,                // 编号序号，后续由加载流程补充
        // YGOCDB fallback 路径：使用占位图（卡图已完全本地化）
        imageUrl: MISSING_IMAGE_PLACEHOLDER,
        imageLargeUrl: MISSING_IMAGE_PLACEHOLDER,
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

    // 使用全局节流器确保请求间隔安全
    await requestThrottler.waitForNext();
    console.log(`🌐 YGOProDeck API 请求: ${url}`);

    // 带重试和退避的请求逻辑
    for (let attempt = 1; attempt <= API_CONFIG.RETRY_MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url);

            // 检测限流响应（403 或 429）
            if (response.status === 429 || response.status === 403) {
                const backoff = API_CONFIG.RETRY_BACKOFF_BASE * attempt;
                console.warn(`⚠️ API 限流 (${response.status})，等待 ${backoff}ms 后重试 (${attempt}/${API_CONFIG.RETRY_MAX_ATTEMPTS})...`);
                await delay(backoff);
                await requestThrottler.waitForNext();
                continue;
            }

            if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            if (attempt === API_CONFIG.RETRY_MAX_ATTEMPTS) {
                console.error(`❌ YGOProDeck API 请求失败 [${endpoint}] (${attempt}次尝试后放弃):`, error);
                throw error;
            }
            // 网络错误时也退避重试
            const backoff = API_CONFIG.RETRY_BACKOFF_BASE * attempt;
            console.warn(`⚠️ API 请求异常，等待 ${backoff}ms 后重试 (${attempt}/${API_CONFIG.RETRY_MAX_ATTEMPTS})...`);
            await delay(backoff);
        }
    }
}

/**
 * 将 YGOProDeck 返回的卡牌数据转换为统一格式
 * 
 * @param {object} card - YGOProDeck 返回的卡牌对象
 * @param {string} rarityCode - 稀有度编码（从 cards.json 预定义）
 * @param {string} setCode - 卡包编码（用于匹配稀有度）
 * @param {string} mode - 模式标识（当前仅支持 'ocg'）
 * @param {Array} rarityVersions - 多版本稀有度列表（如 ["SR", "SER", "PSER"]）
 * @returns {object} 统一格式的卡牌对象
 */
function convertYGOProDeckCard(card, rarityCode, setCode, mode, rarityVersions) {
    // 如果没有预定义稀有度，从 card_sets 中获取
    let rarity = 'Common';
    let code = rarityCode || 'N';

    // 从 card_sets 中查找本卡包的编号（如 BLZD-JP001）
    let cardSetCode = '';
    let setNumber = 0;

    if (!rarityCode && card.card_sets && setCode) {
        const setInfo = card.card_sets.find(function (s) {
            return s.set_name === setCode || s.set_code.startsWith(setCode);
        });
        if (setInfo) {
            rarity = setInfo.set_rarity;
            code = mapRarityToCode(setInfo.set_rarity);
            cardSetCode = setInfo.set_code || '';  // 如 "MZMU-EN001"
            // 从 set_code 末尾提取数字编号（如 "MZMU-EN001" → 1）
            var numMatch = cardSetCode.match(/(\d+)$/);
            if (numMatch) setNumber = parseInt(numMatch[1], 10);
        }
    } else {
        const rarityNames = { 'PSER': 'Prismatic Secret Rare', 'UTR': 'Ultimate Rare', 'SER': 'Secret Rare', 'UR': 'Ultra Rare', 'SR': 'Super Rare', 'R': 'Rare', 'NR': 'Normal Rare', 'N': 'Common' };
        rarity = rarityNames[code] || 'Common';
    }

    // 卡图使用占位图（旧 API 回退路径，卡图已完全本地化）
    let imageUrl = MISSING_IMAGE_PLACEHOLDER;
    let imageLargeUrl = MISSING_IMAGE_PLACEHOLDER;

    return {
        id: card.id,
        name: card.name,            // 外文名（OCG=日文）
        nameCN: '',                  // 中文名（后续通过 YGOCDB 补充）
        nameOriginal: card.name,     // 保存原始外文名（供双语展示用）
        type: card.type,
        desc: card.desc,
        atk: card.atk,
        def: card.def,
        level: card.level,
        race: card.race,
        attribute: card.attribute,
        rarity: rarity,
        rarityVersions: rarityVersions || [code],  // 多版本稀有度（如 ["SR", "SER", "PSER"]）
        cardSetCode: cardSetCode,    // 卡包内编号（如 "BLZD-JP001"）
        setNumber: setNumber,        // 编号序号（如 1, 2, 3...），用于排序
        imageUrl: imageUrl,
        imageLargeUrl: imageLargeUrl,
        dataSource: 'ygoprodeck'
    };
}

/**
 * 【OCG 专用】获取 OCG 卡包的所有卡牌数据
 * 
 * 【工作流程 —— v2.0 本地数据优先】
 * 1. 检查 cardIds 中是否有 cardData 节点（由 build_pack_data.py 脚本注入）
 * 2. 如果有 → 直接从本地数据构建卡牌信息，零 API 调用！
 * 3. 如果没有 → 回退到旧版 API 调用逻辑（兼容未构建的卡包）
 * 
 * @param {object} packConfig - 卡包配置（来自 packs.json 的 OCG 卡包对象）
 * @param {function} onProgress - 加载进度回调（可选）
 * @returns {object} 包含 cards 数组的卡包数据
 */
async function getOCGCardSetData(packConfig, onProgress) {
    const packId = packConfig.packId;
    const cardIds = packConfig.cardIds || [];

    if (cardIds.length === 0) {
        throw new Error(`OCG 卡包 [${packConfig.packName}] 没有配置 cardIds`);
    }

    // === 优先检查是否有本地数据（cardData 节点） ===
    // 只要有任意一张卡拥有 cardData，就走本地数据模式（有数据的直接读取，没有的生成占位信息）
    const hasLocalData = cardIds.length > 0 && cardIds.some(card => card.cardData);

    if (hasLocalData) {
        // 🎉 本地数据模式：零 API 调用，直接构建卡牌信息
        console.log(`📦 [本地数据] 加载 OCG 卡包 [${packConfig.packName}]，共 ${cardIds.length} 张卡`);

        // 获取卡图目录路径（本地用 images_dist/，线上用 R2）
        const packDir = packConfig.localImagesDir || '';
        const suppDir = packConfig.supplementImagesDir || '';

        const cards = buildOCGCardsFromLocalData(packConfig, packDir);

        // 构建辅助包卡池
        const supplementCards = buildSupplementCardsFromLocalData(packConfig, suppDir || packDir);

        const setData = {
            setCode: packId,
            cards: cards,
            supplementCards: supplementCards,
            totalCards: cards.length,
            fetchedAt: Date.now(),
            dataSource: 'local',
            language: 'local',
            packDir: packDir,      // 主卡包图片目录，供开包时按稀有度动态获取卡图
            suppDir: suppDir        // 辅助包图片目录
        };

        const suppInfo = supplementCards.length > 0 ? `，辅助包 ${supplementCards.length} 张` : '';
        console.log(`✅ OCG 卡包 [${packConfig.packName}] 本地加载完成，共 ${cards.length} 张卡${suppInfo}（零 API 调用）`);
        return setData;
    }

    // === 回退：旧版 API 调用逻辑（兼容未构建的卡包） ===
    console.log(`🌐 [API回退] 卡包 [${packConfig.packName}] 无本地数据，使用 API 加载...`);
    return await getOCGCardSetDataViaAPI(packConfig, onProgress);
}

/** 占位图路径（卡图缺失时显示） */
const MISSING_IMAGE_PLACEHOLDER = 'data/ocg/printing.jpg';

/**
 * 卡图 URL 缓存：记录缩略图/大图通过 onerror 回退链找到的有效 URL
 * key: "cardId_rarityCode"（如 "12345_UR"）
 * value: 有效的卡图 URL 字符串
 *
 * 用途：缩略图通过回退链加载成功后，大图直接使用缓存 URL，避免重复 404 请求
 */
const CARD_IMAGE_FALLBACK_CACHE = new Map();

/**
 * 稀有度卡图回退链：当前稀有度图加载失败时，尝试的下一个稀有度
 * 破框链：OF 之间互相回退，不降级到非 OF 卡图（画面不同）
 * 普通链：画面相同（只是闪光工艺不同），逐级回退到基础稀有度
 */
const RARITY_FALLBACK_CHAIN = {
    // 破框链（OF 之间互相回退，不降级到非 OF）
    'GMR-OF': 'PSER-OF',
    'PSER-OF': 'UR-OF',
    // UR-OF 不在 map 中 → OF 回退终点，显示 printing.jpg
    // 普通链
    'PSER': 'SER',
    'SER': 'CR',
    'CR': 'UTR',
    'UTR': 'UR',
    'UR': 'SR',
    'SR': 'R',
    'R': 'NR',
    'NR': 'N'
    // N 不在 map 中 → 回退终点，显示 printing.jpg
};

/**
 * 获取卡图 URL — 直接拼接路径，无需 image map
 *
 * URL 格式：{baseUrl}/{packDir}/{setNumber}_{rarity}.webp
 * 例：https://pub-xxx.r2.dev/ocg/dist/loch/LOCH-JP001_UR.webp
 *
 * 稀有度 fallback：高稀有度找不到独立卡图时，沿 fallback 链降级
 * （实际是否存在由 onerror 处理，这里只负责拼接 URL）
 *
 * @param {string} cardSetCode - 卡片编号（如 'LOCH-JP001'）
 * @param {string} packDir - 卡包图片目录（如 'loch'），由 packs.json 的 localImagesDir 提供
 * @param {string} [rarityCode] - 稀有度代码（如 'UR'、'GMR-OF'）
 * @returns {{ url: string }} 卡图URL
 */
function getCardImageUrl(cardSetCode, packDir, rarityCode) {
    if (!cardSetCode || !packDir) {
        return { url: MISSING_IMAGE_PLACEHOLDER };
    }

    const baseDir = getCardImageDir(packDir);
    const rarity = rarityCode || 'UR';
    const url = `${baseDir}/${cardSetCode}_${rarity}.webp`;
    return { url: url };
}

/**
 * 获取卡图URL字符串 —— 兼容旧逻辑，只返回主URL字符串
 */
function getCardImageUrlString(cardSetCode, packDir, rarityCode) {
    const result = getCardImageUrl(cardSetCode, packDir, rarityCode);
    return result.url;
}

/**
 * 从本地 cardData 构建 OCG 卡牌数组（零 API 调用）
 * 
 * 将 cardIds 中每张卡的 cardData 节点转换为网页统一格式
 * cardData 来源：build_pack_data.py 脚本从 cards.json（YGOCDB 全量数据）提取注入
 * 
 * @param {object} packConfig - 卡包配置
 * @returns {Array} 统一格式的卡牌数组
 */
function buildOCGCardsFromLocalData(packConfig, packDir) {
    const rarityNames = {
        'PSER': 'Prismatic Secret Rare', 'UTR': 'Ultimate Rare',
        'SER': 'Secret Rare', 'UR': 'Ultra Rare', 'SR': 'Super Rare',
        'R': 'Rare', 'NR': 'Normal Rare', 'N': 'Common'
    };
    const packCode = packConfig.packCode || '';
    const cards = [];

    (packConfig.cardIds || []).forEach(function (cardDef, index) {
        const d = cardDef.cardData || {};
        const rarityVersions = cardDef.rarityVersions || ['N'];
        const rarityCode = rarityVersions[0];
        const idx = index + 1;

        // 主显示名：优先中文名，其次日文名，最后英文名
        const cnName = d.cn_name || '';
        const jpName = d.jp_name || '';
        const enName = d.en_name || '';
        const displayName = cnName || jpName || enName || ('ID:' + cardDef.id);
        // 外文名（OCG 场景下优先日文）
        const foreignName = jpName || enName || '';

        // 解析 types 字段获取类型信息
        let cardType = 'Normal Monster';
        let race = '';
        let attribute = '';
        let level = d.level;
        let atk = d.atk;
        let def = d.def;

        const typesStr = d.types || '';
        if (typesStr) {
            if (typesStr.includes('[魔法')) cardType = 'Spell Card';
            else if (typesStr.includes('[陷阱')) cardType = 'Trap Card';
            else if (typesStr.includes('效果')) cardType = 'Effect Monster';
            else if (typesStr.includes('融合')) cardType = 'Fusion Monster';
            else if (typesStr.includes('同调')) cardType = 'Synchro Monster';
            else if (typesStr.includes('超量')) cardType = 'Xyz Monster';
            else if (typesStr.includes('链接') || typesStr.includes('LINK')) cardType = 'Link Monster';
            else if (typesStr.includes('灵摆')) cardType = 'Pendulum Monster';
            else if (typesStr.includes('仪式')) cardType = 'Ritual Monster';
        }

        // 卡包内编号
        const setNumber = cardDef.setNumber || (packCode + '-JP' + String(idx).padStart(3, '0'));

        // 获取卡图URL（直接拼接路径，使用默认稀有度）
        const cardSetCode = typeof setNumber === 'string' ? setNumber : (packCode + '-JP' + String(idx).padStart(3, '0'));
        const defaultRarity = (cardDef.rarityVersions || ['N'])[0];
        const imgSmallResult = getCardImageUrl(cardSetCode, packDir, defaultRarity);
        const imgLargeResult = getCardImageUrl(cardSetCode, packDir, defaultRarity);

        cards.push({
            id: cardDef.id,
            name: displayName,
            nameCN: cnName,
            nameOriginal: foreignName,
            type: cardType,
            desc: d.desc || '',
            atk: atk,
            def: def,
            level: level,
            race: race,
            attribute: attribute,
            rarity: rarityNames[rarityCode] || 'Common',
            rarityVersions: rarityVersions,
            cardSetCode: cardSetCode,
            setNumber: idx,
            imageUrl: imgSmallResult.url,
            imageLargeUrl: imgLargeResult.url,
            dataSource: 'local',
            _packDir: packDir  // 保存图片目录，用于开包时按稀有度动态获取对应卡图
        });
    });

    return cards;
}

/**
 * 从本地 supplementPack 数据构建辅助包卡牌数组
 * 辅助包卡池独立于主卡池，开整盒时随机抽1张
 * 
 * @param {object} packConfig - 卡包配置（含 supplementPack 节点）
 * @returns {Array} 辅助包卡牌数组（格式与主卡池一致），无辅助包时返回空数组
 */
function buildSupplementCardsFromLocalData(packConfig, packDir) {
    const supp = packConfig.supplementPack;
    if (!supp || !supp.cards || supp.cards.length === 0) {
        return [];
    }

    const rarityNames = {
        'PSER': 'Prismatic Secret Rare', 'UTR': 'Ultimate Rare',
        'SER': 'Secret Rare', 'UR': 'Ultra Rare', 'SR': 'Super Rare',
        'R': 'Rare', 'NR': 'Normal Rare', 'N': 'Common'
    };

    const cards = [];
    supp.cards.forEach(function (cardDef) {
        if (!cardDef.id) return;  // 跳过无 ID 的卡

        const d = cardDef.cardData || {};
        // 辅助包卡片默认稀有度取 rarityVersions 的第一个
        const rarityVersions = cardDef.rarityVersions || ['UR'];
        const rarityCode = rarityVersions[0];

        // 主显示名：优先中文名，其次日文名
        const cnName = d.cn_name || '';
        const jpName = d.jp_name || '';
        const enName = d.en_name || '';
        const displayName = cnName || jpName || enName || ('ID:' + cardDef.id);
        const foreignName = jpName || enName || '';

        const setNumber = cardDef.setNumber || '';

        // 卡图URL：直接拼接路径
        const imgSmallResult = getCardImageUrl(setNumber, packDir, rarityCode);
        const imgLargeResult = getCardImageUrl(setNumber, packDir, rarityCode);

        cards.push({
            id: cardDef.id,
            name: displayName,
            nameCN: cnName,
            nameOriginal: foreignName,
            type: 'Effect Monster',  // 简化处理
            desc: d.desc || '',
            atk: d.atk,
            def: d.def,
            level: d.level,
            rarity: rarityNames[rarityCode] || 'Ultra Rare',
            rarityVersions: rarityVersions,
            cardSetCode: setNumber,
            setNumber: setNumber,
            imageUrl: imgSmallResult.url,
            imageLargeUrl: imgLargeResult.url,
            dataSource: 'local',
            _isSupplement: true,
            _packDir: packDir   // 保存图片目录，供开包时按稀有度动态获取对应卡图
        });
    });

    return cards;
}

/**
 * 【旧版 API 回退】通过 YGOProDeck/YGOCDB API 获取 OCG 卡牌数据
 * 仅在本地数据不可用时调用（兼容未执行 build_pack_data.py 的卡包）
 */
async function getOCGCardSetDataViaAPI(packConfig, onProgress) {
    const packId = packConfig.packId;
    const langCode = getOCGLanguage();
    const langConfig = getLanguageConfig('ocg');
    const cacheKey = `cardSet_ocg_${langCode}_${packId}`;

    // 1. 检查缓存
    const cacheValid = await isCacheValid(cacheKey, API_CONFIG.CACHE_EXPIRY.CARD_DATA);

    if (cacheValid) {
        const cached = await dbGet('cardSets', `${packId}_${langCode}`);
        if (cached && cached.cards && cached.cards.length > 0) {
            console.log(`📦 [API缓存] 从缓存加载 OCG 卡包 [${packConfig.packName}]，共 ${cached.cards.length} 张卡`);
            return cached;
        }
    }

    // 2. 缓存无效，从 YGOProDeck API 批量获取
    console.log(`🌐 从 YGOProDeck 加载 OCG 卡包 [${packConfig.packName}] (${langConfig.nameLocal})...`);

    const cardIds = packConfig.cardIds || [];
    const rarityMap = {};
    const versionsMap = {};
    cardIds.forEach(function (cardDef) {
        rarityMap[cardDef.id] = cardDef.rarityVersions ? cardDef.rarityVersions[0] : 'N';
        if (cardDef.rarityVersions) {
            versionsMap[cardDef.id] = cardDef.rarityVersions;
        }
    });

    const allIds = cardIds.map(function (c) { return c.id; });
    let cards = [];

    try {
        cards = await fetchOCGCardsFromYGOProDeck(allIds, rarityMap, versionsMap, langConfig, onProgress);
        console.log(`✅ YGOProDeck 返回 ${cards.length} 张卡`);

        if (API_CONFIG.ENABLE_CN_NAME) {
            if (onProgress) onProgress(0, cards.length);
            await enrichCardsWithCNNames(cards, function (loaded, total) {
                updateLoadingTextIfAvailable(`正在补充中文名... (${loaded}/${total})`);
            });
        }
    } catch (error) {
        console.warn(`⚠️ YGOProDeck 批量获取失败:`, error.message);

        if (langConfig.fallbackSource === 'ygocdb') {
            console.log(`🔄 尝试 YGOCDB 备用数据源...`);
            try {
                cards = await fetchOCGCardsFromYGOCDB(allIds, rarityMap, versionsMap, onProgress);
            } catch (ygocdbError) {
                console.warn(`⚠️ YGOCDB 也失败了:`, ygocdbError.message);
            }
        }

        if (cards.length === 0) {
            throw new Error(`卡包 [${packConfig.packName}] 无法获取数据`);
        }
    }

    // 为卡片赋予卡包内编号
    const packCode = packConfig.packCode || '';
    const idToIndex = {};
    cardIds.forEach(function (cardDef, index) {
        idToIndex[cardDef.id] = index + 1;
    });
    cards.forEach(function (card) {
        var idx = idToIndex[card.id] || 0;
        card.setNumber = idx;
        if (packCode && idx > 0) {
            card.cardSetCode = packCode + '-JP' + String(idx).padStart(3, '0');
        }
    });

    // 存入缓存
    const setData = {
        setCode: `${packId}_${langCode}`,
        cards: cards,
        totalCards: cards.length,
        fetchedAt: Date.now(),
        dataSource: cards[0] ? cards[0].dataSource : 'unknown',
        language: langCode
    };
    await dbPut('cardSets', setData);
    await updateCacheTimestamp(cacheKey);

    console.log(`✅ OCG 卡包 [${packConfig.packName}] API加载完成，共 ${cards.length} 张卡，已缓存`);
    return setData;
}

/**
 * 通过 YGOProDeck 批量获取 OCG 卡牌（按 ID 列表）
 * 
 * @param {Array} allIds - 卡牌 ID 数组
 * @param {object} rarityMap - ID → rarityCode 映射
 * @param {object} versionsMap - ID → rarityVersions 映射（多版本稀有度）
 * @param {object} langConfig - 语言配置
 * @param {function} onProgress - 进度回调
 * @returns {Array} 统一格式的卡牌数组
 */
async function fetchOCGCardsFromYGOProDeck(allIds, rarityMap, versionsMap, langConfig, onProgress) {
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
                const rarityVersions = versionsMap[card.id] || [rarityCode];
                cards.push(convertYGOProDeckCard(card, rarityCode, null, 'ocg', rarityVersions));
            });
        }

        // 更新进度
        if (onProgress) {
            onProgress(Math.min(i + batchSize, allIds.length), allIds.length);
        }

        // 控制请求频率（已由全局节流器 requestThrottler 保障，无需额外延迟）
    }

    return cards;
}

/**
 * 通过 YGOCDB 逐张获取 OCG 卡牌（备用中文数据源）
 * 
 * @param {Array} allIds - 卡牌 ID 数组
 * @param {object} rarityMap - ID → rarityCode 映射
 * @param {object} versionsMap - ID → rarityVersions 映射（多版本稀有度）
 * @param {function} onProgress - 进度回调
 * @returns {Array} 统一格式的卡牌数组
 */
async function fetchOCGCardsFromYGOCDB(allIds, rarityMap, versionsMap, onProgress) {
    const cards = [];
    let loadedCount = 0;

    for (const cardId of allIds) {
        try {
            const ygocdbCard = await fetchCardFromYGOCDB(cardId);
            if (ygocdbCard) {
                const rarityCode = rarityMap[cardId] || 'N';
                const rarityVersions = versionsMap[cardId] || [rarityCode];
                cards.push(convertYGOCDBCard(ygocdbCard, rarityCode, rarityVersions));
            }
        } catch (error) {
            console.warn(`⚠️ YGOCDB 获取卡牌 ${cardId} 失败`);
        }

        loadedCount++;
        if (onProgress) {
            onProgress(loadedCount, allIds.length);
        }
        // 请求频率已由全局节流器 requestThrottler 保障，无需额外延迟
    }

    if (cards.length === 0) {
        throw new Error('YGOCDB 未返回任何有效卡牌');
    }

    return cards;
}

// ====== 中文名补充功能（YGOCDB） ======

/**
 * 辅助函数：更新加载提示文本（如果页面有加载遮罩的话）
 */
function updateLoadingTextIfAvailable(message) {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl && loadingEl.style.display !== 'none') {
        const textEl = loadingEl.querySelector('.loading-text');
        if (textEl) textEl.textContent = message;
    }
}

/**
 * 为卡牌数组批量补充中文名（通过 YGOCDB API）
 * 
 * 【用途】面向中国区用户，在卡牌上方显示中文主名称
 * 【工作方式】逐张卡通过 YGOCDB 查询中文名，填充到 nameCN 字段
 * 
 * @param {Array} cards - 已获取的卡牌数组（来自 YGOProDeck）
 * @param {function} onProgress - 进度回调（可选）
 * @returns {Array} 补充了中文名的卡牌数组（原地修改并返回）
 */
async function enrichCardsWithCNNames(cards, onProgress) {
    if (!API_CONFIG.ENABLE_CN_NAME) return cards;
    if (!cards || cards.length === 0) return cards;

    // 筛选出没有中文名的卡牌
    const cardsNeedCN = cards.filter(function (c) { return !c.nameCN; });
    if (cardsNeedCN.length === 0) return cards;

    console.log(`🇨🇳 开始从 YGOCDB 补充中文名，共 ${cardsNeedCN.length} 张卡...`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < cardsNeedCN.length; i++) {
        const card = cardsNeedCN[i];
        try {
            const ygocdbCard = await fetchCardFromYGOCDB(card.id);
            if (ygocdbCard && ygocdbCard.cn_name) {
                card.nameCN = ygocdbCard.cn_name;
                // 同时保存日文名和英文名（如果还没有的话）
                if (!card.nameJP && ygocdbCard.jp_name) {
                    card.nameJP = ygocdbCard.jp_name;
                }
                if (!card.nameEN && ygocdbCard.en_name) {
                    card.nameEN = ygocdbCard.en_name;
                }
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            failCount++;
            console.warn(`⚠️ YGOCDB 获取卡牌 ${card.id} 中文名失败`);
        }

        if (onProgress) {
            onProgress(i + 1, cardsNeedCN.length);
        }

        // 请求频率已由全局节流器 requestThrottler 保障，无需额外延迟
    }

    console.log(`🇨🇳 中文名补充完成：成功 ${successCount}/${cardsNeedCN.length}，失败 ${failCount}`);
    return cards;
}

/**
 * 【统一入口】获取卡包卡牌数据
 * 
 * @param {string} mode - 游戏模式（当前仅支持 'ocg'）
 * @param {object} packConfig - 卡包配置对象
 * @param {function} onProgress - 加载进度回调
 * @returns {object} 卡包数据
 */
async function getCardSetData(mode, packConfig, onProgress) {
    return await getOCGCardSetData(packConfig, onProgress);
}

/**
 * 【纯缓存查询】获取 IndexedDB 中已缓存的卡包数据（不触发 API 请求）
 * 用于卡包封面图预加载等场景，避免不必要的 API 调用
 * 
 * @param {string} setCode - 卡包编码
 * @returns {object|null} 缓存的卡包数据，无缓存返回 null
 */
async function getCachedSetData(setCode) {
    try {
        const cached = await dbGet('cardSets', setCode);
        if (cached && cached.cards && cached.cards.length > 0) {
            return cached;
        }
    } catch (e) {
        // 缓存查询失败不影响主流程
    }
    return null;
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
 * 批量预加载卡包的所有卡图
 * 使用 Image 对象预加载，利用浏览器 HTTP 缓存，避免 CORS 跨域问题
 */
async function preloadCardImages(cards, onProgress) {
    let loaded = 0;
    const imageCards = cards.filter(function (c) { return c.imageUrl; });
    const total = imageCards.length;

    // 并发控制：每批同时加载 6 张，避免堵塞带宽
    const batchSize = 6;
    for (let i = 0; i < imageCards.length; i += batchSize) {
        const batch = imageCards.slice(i, i + batchSize);
        await Promise.all(batch.map(function (card) {
            return new Promise(function (resolve) {
                const img = new Image();
                img.onload = function () {
                    loaded++;
                    if (onProgress && total > 0) {
                        onProgress(loaded, total);
                    }
                    resolve();
                };
                img.onerror = function () {
                    // 单张图片失败不影响整体
                    loaded++;
                    if (onProgress && total > 0) {
                        onProgress(loaded, total);
                    }
                    resolve();
                };
                img.src = card.imageUrl;
            });
        }));
    }

    console.log(`🖼️ 卡图预加载完成：${loaded}/${total}`);
}

// ====== 缓存管理工具函数 ======

/**
 * 计算字符串占用的字节数（UTF-8 编码）
 */
function getByteSize(str) {
    try {
        return new Blob([str]).size;
    } catch (e) {
        return str.length * 2; // 兜底估算
    }
}

/**
 * 格式化字节数为可读的文件大小
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

/**
 * 获取缓存状态信息
 * 同时统计 IndexedDB（API 缓存）和 localStorage（背包/货币/设置）
 */
async function getCacheStatus() {
    const status = {
        // IndexedDB 中的 API 缓存卡包
        cardSets: [],
        totalCards: 0,
        imageCacheAvailable: 'caches' in window,
        // localStorage 存储明细
        localStorage: {
            items: [],
            totalSize: 0
        },
        // IndexedDB 总大小估算
        indexedDBSize: 0
    };

    // === 1. 统计 IndexedDB 中的卡包缓存 ===
    try {
        const db = await openDatabase();
        const tx = db.transaction('cardSets', 'readonly');
        const store = tx.objectStore('cardSets');

        await new Promise(function (resolve) {
            const request = store.openCursor();
            request.onsuccess = function (event) {
                const cursor = event.target.result;
                if (cursor) {
                    const data = cursor.value;
                    // 估算此条记录的大小
                    const recordSize = getByteSize(JSON.stringify(data));
                    status.cardSets.push({
                        setCode: data.setCode,
                        cardCount: data.cards.length,
                        fetchedAt: new Date(data.fetchedAt).toLocaleDateString('zh-CN'),
                        dataSource: data.dataSource || 'unknown',
                        size: recordSize
                    });
                    status.totalCards += data.cards.length;
                    status.indexedDBSize += recordSize;
                    cursor.continue();
                } else {
                    db.close();
                    resolve();
                }
            };
            request.onerror = function () {
                db.close();
                resolve();
            };
        });
    } catch (error) {
        // IndexedDB 不可用时静默跳过
    }

    // === 2. 统计 localStorage 使用情况 ===
    try {
        // 定义需要统计的 localStorage key 及其显示名称
        const knownKeys = [
            { key: 'ygo_inventory_data', label: '🎒 背包数据' },
            { key: 'ygo_currency_data', label: '🪙 货币数据' },
            { key: 'ygo_game_mode', label: '🎮 游戏模式' },
            { key: 'ygo_ocg_language', label: '🌐 OCG 语言' }
        ];

        knownKeys.forEach(function (item) {
            const val = localStorage.getItem(item.key);
            if (val !== null) {
                const size = getByteSize(val);
                status.localStorage.items.push({
                    key: item.key,
                    label: item.label,
                    size: size,
                    // 为背包数据额外提供卡片计数
                    cardCount: item.key === 'ygo_inventory_data' ? Object.keys(JSON.parse(val) || {}).length : null
                });
                status.localStorage.totalSize += size;
            }
        });
    } catch (error) {
        // localStorage 不可用时静默跳过
    }

    return status;
}

/**
 * 清除所有缓存数据（IndexedDB + Cache API）
 * 注意：不清除 localStorage（背包/货币等用户数据）
 */
async function clearAllCache() {
    try {
        await dbClearAll();

        if ('caches' in window) {
            await caches.delete(API_CONFIG.IMAGE_CACHE_NAME);
        }

        console.log('🗑️ 所有缓存已清除（IndexedDB + Cache API）');
        return true;
    } catch (error) {
        console.error('❌ 清除缓存失败:', error);
        return false;
    }
}

/**
 * 清除指定的 localStorage 项
 */
function clearLocalStorageItem(key) {
    try {
        localStorage.removeItem(key);
        console.log(`🗑️ 已清除 localStorage: ${key}`);
        return true;
    } catch (error) {
        console.error(`❌ 清除 localStorage [${key}] 失败:`, error);
        return false;
    }
}

/**
 * 刷新指定卡包的缓存
 */
async function refreshCardSetCache(setCode) {
    await dbDelete('cardSets', setCode);
    await dbDelete('cacheMeta', `cardSet_ocg_${setCode}`);
}

// ====== 导出供 game.js 使用的接口 ======

window.TCG_API = {
    // 统一入口：获取卡包卡牌数据
    getCardSetData: getCardSetData,

    // 获取缓存中的卡包数据（不触发 API 请求）
    getCachedSetData: getCachedSetData,

    // 批量预加载卡图
    preloadCardImages: preloadCardImages,

    // 缓存管理
    getCacheStatus: getCacheStatus,
    clearAllCache: clearAllCache,
    refreshCardSetCache: refreshCardSetCache,
    clearLocalStorageItem: clearLocalStorageItem,
    formatBytes: formatBytes,

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

console.log('🔌 API 模块加载完成（YGOProDeck 多语言 + YGOCDB 中文名补充）');
