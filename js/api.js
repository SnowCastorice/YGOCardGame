/**
 * ============================================
 * YGO Pack Opener - API 调用与缓存管理模块
 * 版本: 0.3.0
 * 
 * 【文件说明】
 * 负责与 YGOProDeck API 通信，并将数据缓存到玩家设备上：
 * 1. IndexedDB — 缓存卡牌数据（名称、攻防、效果、图片URL等）
 * 2. Cache API — 缓存卡牌图片文件
 * 
 * 【YGOProDeck API 使用规范】
 * - 每秒最多 20 次请求
 * - 卡图必须缓存到本地，重复请求会导致 IP 封禁
 * - 非商业用途免费使用
 * - 版权归 Konami Digital Entertainment
 * ============================================
 */

// ====== 配置常量 ======
const API_CONFIG = {
    // API 基础地址
    BASE_URL: 'https://db.ygoprodeck.com/api/v7',
    // 卡图基础地址（小图，节省流量）
    IMAGE_BASE_URL: 'https://images.ygoprodeck.com/images/cards_small',
    // 卡图大图地址（点击查看详情时使用）
    IMAGE_LARGE_URL: 'https://images.ygoprodeck.com/images/cards',

    // 缓存过期时间（毫秒）
    CACHE_EXPIRY: {
        CARD_DATA: 7 * 24 * 60 * 60 * 1000,    // 卡牌数据：7天
        CARD_SETS: 1 * 24 * 60 * 60 * 1000,     // 卡包列表：1天
        CARD_IMAGES: 30 * 24 * 60 * 60 * 1000    // 卡牌图片：30天
    },

    // IndexedDB 数据库配置
    DB_NAME: 'TCGPackOpener',
    DB_VERSION: 1,

    // Cache API 存储名称
    IMAGE_CACHE_NAME: 'tcg-card-images',

    // 请求间隔（毫秒），确保不超过每秒 20 次
    REQUEST_INTERVAL: 60
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
            // keyPath: 'setCode' 表示用卡包编码作为主键（唯一标识）
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
 * @param {string} storeName - 存储表名称
 * @param {object} data - 要存储的数据
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
 * @param {string} storeName - 存储表名称
 * @param {string} key - 主键值
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
 * @param {string} storeName - 存储表名称
 * @param {string} key - 主键值
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
 * @param {string} cacheKey - 缓存的标识符（如 "cardSet_LOB"）
 * @param {number} maxAge - 最大缓存时间（毫秒）
 * @returns {boolean} true = 未过期可使用, false = 已过期需要刷新
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
 * @param {string} cacheKey - 缓存的标识符
 */
async function updateCacheTimestamp(cacheKey) {
    await dbPut('cacheMeta', {
        key: cacheKey,
        timestamp: Date.now()
    });
}

// ====== YGOProDeck API 调用 ======

/**
 * 延迟函数，用于控制请求频率
 */
function delay(ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

/**
 * 安全的 API 请求函数（带频率控制和错误处理）
 * @param {string} endpoint - API 端点路径
 * @returns {object} API 返回的 JSON 数据
 */
async function apiRequest(endpoint) {
    const url = `${API_CONFIG.BASE_URL}/${endpoint}`;
    console.log(`🌐 API 请求: ${url}`);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // 请求成功后等待一小段时间，避免连续请求过快
        await delay(API_CONFIG.REQUEST_INTERVAL);

        return data;
    } catch (error) {
        console.error(`❌ API 请求失败 [${endpoint}]:`, error);
        throw error;
    }
}

/**
 * 获取某个卡包的所有卡牌数据
 * 
 * 【工作流程】
 * 1. 先检查 IndexedDB 中有没有这个卡包的缓存
 * 2. 如果有且未过期 → 直接返回缓存数据（不调用 API）
 * 3. 如果没有或已过期 → 调用 API 获取，存入缓存后返回
 * 
 * @param {string} setCode - 卡包编码（如 "LOB", "MRD" 等）
 * @returns {object} 包含 cards 数组的卡包数据
 */
async function getCardSetData(setCode) {
    const cacheKey = `cardSet_${setCode}`;

    // 1. 检查缓存
    const cacheValid = await isCacheValid(cacheKey, API_CONFIG.CACHE_EXPIRY.CARD_DATA);

    if (cacheValid) {
        const cached = await dbGet('cardSets', setCode);
        if (cached) {
            console.log(`📦 从缓存加载卡包 [${setCode}]，共 ${cached.cards.length} 张卡`);
            return cached;
        }
    }

    // 2. 缓存不存在或已过期，从 API 获取
    console.log(`🌐 从 API 加载卡包 [${setCode}]...`);

    try {
        const apiData = await apiRequest(`cardinfo.php?cardset=${encodeURIComponent(setCode)}`);

        if (!apiData || !apiData.data) {
            throw new Error(`卡包 [${setCode}] 未找到数据`);
        }

        // 3. 提取我们需要的字段，减少存储空间
        const cards = apiData.data.map(function (card) {
            // 查找该卡在这个卡包中的稀有度
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
                nameCN: card.name,  // API 目前只有英文名，后续可扩展
                type: card.type,
                desc: card.desc,
                atk: card.atk,
                def: card.def,
                level: card.level,
                race: card.race,
                attribute: card.attribute,
                rarity: rarity,
                rarityCode: rarityCode,
                // 卡图 URL（小图）
                imageUrl: card.card_images && card.card_images[0]
                    ? card.card_images[0].image_url_small
                    : null,
                // 卡图 URL（大图）
                imageLargeUrl: card.card_images && card.card_images[0]
                    ? card.card_images[0].image_url
                    : null
            };
        });

        // 4. 构建缓存数据并存入 IndexedDB
        const setData = {
            setCode: setCode,
            cards: cards,
            totalCards: cards.length,
            fetchedAt: Date.now()
        };

        await dbPut('cardSets', setData);
        await updateCacheTimestamp(cacheKey);

        console.log(`✅ 卡包 [${setCode}] 加载完成，共 ${cards.length} 张卡，已缓存`);
        return setData;

    } catch (error) {
        // API 失败时，按优先级尝试兜底方案

        // 方案1：尝试用过期的缓存
        const staleCache = await dbGet('cardSets', setCode);
        if (staleCache) {
            console.warn(`⚠️ API 请求失败，使用过期缓存 [${setCode}]`);
            return staleCache;
        }

        // 方案2：使用离线备用数据
        if (window.FALLBACK_CARD_DATA && window.FALLBACK_CARD_DATA[setCode]) {
            console.warn(`⚠️ API 请求失败，使用离线备用数据 [${setCode}]`);
            const fallbackData = window.FALLBACK_CARD_DATA[setCode];
            // 把备用数据也存入缓存，下次可以直接使用
            const setData = {
                setCode: setCode,
                cards: fallbackData.cards,
                totalCards: fallbackData.cards.length,
                fetchedAt: Date.now(),
                isOfflineData: true  // 标记为离线数据
            };
            await dbPut('cardSets', setData);
            await updateCacheTimestamp(cacheKey);
            return setData;
        }

        throw error;
    }
}

/**
 * 将 YGOProDeck 的稀有度名称映射为简短编码
 * 
 * 【对照表】
 * API 返回的名称很长，如 "Ultra Rare"
 * 我们转成简短的 UR / SR / R / N，方便前端展示和样式处理
 */
function mapRarityToCode(rarityName) {
    if (!rarityName) return 'N';

    const name = rarityName.toLowerCase();

    // 按稀有度从高到低判断
    if (name.includes('secret')) return 'UR';           // Secret Rare → UR
    if (name.includes('ultimate')) return 'UR';         // Ultimate Rare → UR
    if (name.includes('ghost')) return 'UR';            // Ghost Rare → UR
    if (name.includes('ultra')) return 'UR';            // Ultra Rare → UR
    if (name.includes('super')) return 'SR';            // Super Rare → SR
    if (name.includes('rare') && !name.includes('common')) return 'R';  // Rare → R
    return 'N';                                          // Common → N
}

// ====== 卡图缓存管理 ======

/**
 * 获取卡牌图片（优先使用缓存）
 * 
 * 【工作原理】
 * 1. 检查浏览器的 Cache API 中有没有这张图片
 * 2. 如果有 → 直接返回缓存的图片 URL
 * 3. 如果没有 → 下载图片并存入 Cache，然后返回
 * 
 * @param {string} imageUrl - 原始图片 URL
 * @returns {string} 可用的图片 URL（可能来自缓存）
 */
async function getCachedImageUrl(imageUrl) {
    if (!imageUrl) return null;

    // 检查浏览器是否支持 Cache API
    if (!('caches' in window)) {
        return imageUrl; // 不支持缓存就直接用原始 URL
    }

    try {
        const cache = await caches.open(API_CONFIG.IMAGE_CACHE_NAME);

        // 检查缓存中是否存在
        const cachedResponse = await cache.match(imageUrl);
        if (cachedResponse) {
            // 缓存命中，创建 Blob URL 返回
            const blob = await cachedResponse.blob();
            return URL.createObjectURL(blob);
        }

        // 缓存未命中，下载并缓存
        // 注意：这里不 await 下载，而是先返回原始 URL，后台静默缓存
        cacheImageInBackground(imageUrl);
        return imageUrl;

    } catch (error) {
        console.warn('⚠️ 图片缓存操作失败，使用原始URL:', error);
        return imageUrl;
    }
}

/**
 * 后台静默缓存图片（不阻塞主流程）
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
        // 静默失败，不影响主流程
        console.warn('⚠️ 后台图片缓存失败:', error.message);
    }
}

/**
 * 批量预加载卡包的所有卡图
 * 在玩家选择卡包后，后台开始预加载所有卡图
 * 这样开包时卡图就能快速显示
 * 
 * @param {Array} cards - 卡牌数组
 * @param {function} onProgress - 进度回调（可选）
 */
async function preloadCardImages(cards, onProgress) {
    if (!('caches' in window)) return;

    const cache = await caches.open(API_CONFIG.IMAGE_CACHE_NAME);
    let loaded = 0;
    const total = cards.filter(function (c) { return c.imageUrl; }).length;

    for (const card of cards) {
        if (!card.imageUrl) continue;

        try {
            // 检查是否已缓存
            const cached = await cache.match(card.imageUrl);
            if (!cached) {
                const response = await fetch(card.imageUrl, { mode: 'cors' });
                if (response.ok) {
                    await cache.put(card.imageUrl, response);
                }
                // 控制请求频率
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
 * 展示给玩家看的缓存使用情况
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
                        fetchedAt: new Date(data.fetchedAt).toLocaleDateString('zh-CN')
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
 * 包括 IndexedDB 中的卡牌数据和 Cache API 中的图片
 */
async function clearAllCache() {
    try {
        // 清除 IndexedDB
        await dbClearAll();

        // 清除图片缓存
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
 * @param {string} setCode - 卡包编码
 */
async function refreshCardSetCache(setCode) {
    // 删除旧缓存
    await dbDelete('cardSets', setCode);
    await dbDelete('cacheMeta', `cardSet_${setCode}`);

    // 重新获取
    return await getCardSetData(setCode);
}

// ====== 导出供 game.js 使用的接口 ======
// （由于是纯前端项目不使用模块打包，通过全局变量暴露接口）

window.TCG_API = {
    // 获取卡包卡牌数据（自动缓存）
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

console.log('🔌 API 模块加载完成');
