/**
 * ============================================
 * YGO Pack Opener - 市场价格系统模块
 * 版本: 1.0.0
 *
 * 【文件说明】
 * 负责管理卡片的真实市场价格（集换社数据）：
 * 1. 从独立价格文件加载市场价格数据
 * 2. 提供按卡片密码 + 稀有度查询价格的接口
 * 3. 支持多卡包价格文件（可扩展）
 * 4. 价格数据与卡片数据分离，便于独立更新
 *
 * 【价格文件位置】
 * data/ocg/prices/{packCode}_prices.json
 * 例如：data/ocg/prices/loch_prices.json
 * ============================================
 */
const PriceSystem = (function () {

    // ====== 内部状态 ======
    // 价格缓存：{ "卡片密码": { "UR": 0.5, "SER": 1.5, ... } }
    let priceCache = {};
    // 卡包价格：{ "LOCH": { box: 385, pack: 22 }, "LOSP": { pack: 77 } }
    let packPrices = {};
    // setNumber → 价格文件中的 cardId 反向索引（兼容临时密码卡片）
    // 当卡片数据 id 更新为真实密码后，仍能通过 setNumber 回退查找价格
    let setNumberIndex = {};
    // 已加载的价格文件列表
    let loadedFiles = [];
    // 是否已初始化
    let initialized = false;

    // ====== 价格文件映射 ======
    // packCode（小写）→ 价格文件路径
    const PRICE_FILES = {
        'loch': 'data/ocg/prices/loch_prices.json',
        'blzd': 'data/ocg/prices/blzd_prices.json',
        'locr': 'data/ocg/prices/locr_prices.json'
    };

    // ====== 初始化 ======

    /**
     * 初始化价格系统，加载所有价格文件
     * 在 game.js 初始化流程中调用
     */
    async function init() {
        if (initialized) return;

        console.log('💰 价格系统初始化中...');
        const startTime = performance.now();

        // 并行加载所有价格文件
        const loadPromises = Object.entries(PRICE_FILES).map(function (entry) {
            return loadPriceFile(entry[0], entry[1]);
        });

        await Promise.all(loadPromises);

        initialized = true;
        const elapsed = Math.round(performance.now() - startTime);
        const cardCount = Object.keys(priceCache).length;
        console.log('💰 价格系统初始化完成：' + cardCount + ' 张卡的价格数据已加载（' + elapsed + 'ms）');
    }

    /**
     * 加载单个价格文件
     * @param {string} packCode - 卡包代码（如 'loch'）
     * @param {string} filePath - 价格文件路径
     */
    async function loadPriceFile(packCode, filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                console.warn('⚠️ 价格文件加载失败: ' + filePath + ' (HTTP ' + response.status + ')');
                return;
            }
            const data = await response.json();

            // 加载卡包价格
            if (data.packPrices) {
                Object.assign(packPrices, data.packPrices);
            }

            // 加载卡片价格到缓存
            if (data.cards) {
                Object.keys(data.cards).forEach(function (cardId) {
                    var cardPrice = data.cards[cardId];
                    if (cardPrice && cardPrice.prices) {
                        priceCache[cardId] = cardPrice.prices;
                        // 建立 setNumber → cardId 反向索引（用于临时密码兼容）
                        if (cardPrice.setNumber) {
                            setNumberIndex[cardPrice.setNumber] = cardId;
                        }
                    }
                });
            }

            loadedFiles.push(packCode);
            console.log('💰 已加载价格文件: ' + filePath + ' (' + Object.keys(data.cards || {}).length + ' 张卡)');
        } catch (error) {
            console.warn('⚠️ 价格文件加载异常: ' + filePath, error);
        }
    }

    // ====== 查询接口 ======

    /**
     * 解析卡片ID：优先直接匹配 priceCache，查不到时通过 setNumber 反向索引回退
     * 用于兼容临时密码卡片（如 LOCR JP001-JP028 使用临时编号，未来 ygocdb 更新后 id 会变）
     * @param {number|string} cardId - 卡片密码或 setNumber
     * @returns {string|null} 价格缓存中的有效 key，未找到返回 null
     */
    function resolveCardId(cardId) {
        var key = String(cardId);
        if (priceCache[key]) return key;
        // 回退：尝试通过 setNumber 索引查找
        var mappedId = setNumberIndex[key];
        if (mappedId && priceCache[mappedId]) return mappedId;
        return null;
    }

    /**
     * 获取指定卡片指定稀有度的市场价格
     * @param {number|string} cardId - 卡片密码
     * @param {string} rarity - 稀有度代码（如 'UR', 'SER', 'PSER' 等）
     * @returns {number|null} 价格（人民币），未找到返回 null
     */
    function getCardPrice(cardId, rarity) {
        var resolvedId = resolveCardId(cardId);
        if (!resolvedId) return null;
        var prices = priceCache[resolvedId];
        var price = prices[rarity];
        return price !== undefined ? price : null;
    }

    /**
     * 获取指定卡片所有稀有度版本的价格
     * @param {number|string} cardId - 卡片密码
     * @returns {object|null} 价格映射 如 { "UR": 0.5, "SER": 1.5 }，未找到返回 null
     */
    function getCardPrices(cardId) {
        var resolvedId = resolveCardId(cardId);
        if (!resolvedId) return null;
        return Object.assign({}, priceCache[resolvedId]);
    }

    /**
     * 获取卡片最高稀有度版本的价格（用于排序展示）
     * @param {number|string} cardId - 卡片密码
     * @param {string} rarity - 卡片当前持有的稀有度
     * @returns {number} 价格（人民币），未找到返回 0
     */
    function getCardMarketPrice(cardId, rarity) {
        var price = getCardPrice(cardId, rarity);
        return price !== null ? price : 0;
    }

    /**
     * 获取卡包的整盒/单包价格
     * @param {string} packCode - 卡包代码（如 'LOCH', 'LOSP'）
     * @returns {object|null} 如 { box: 385, pack: 22 }，未找到返回 null
     */
    function getPackPrice(packCode) {
        if (packPrices[packCode]) return packPrices[packCode];
        // LOSP 特殊处理：拆分为 vol1（属于LOCH）和 vol2（属于LOCR），尝试回退匹配
        if (packCode === 'LOSP') {
            return packPrices['LOSP-vol1'] || packPrices['LOSP-vol2'] || null;
        }
        return null;
    }

    /**
     * 检查价格系统是否已加载指定卡片的价格
     * @param {number|string} cardId - 卡片密码
     * @returns {boolean}
     */
    function hasPrice(cardId) {
        return resolveCardId(cardId) !== null;
    }

    /**
     * 获取已加载的价格文件列表
     * @returns {Array<string>}
     */
    function getLoadedPacks() {
        return loadedFiles.slice();
    }

    /**
     * 获取价格系统状态信息（供调试用）
     * @returns {object}
     */
    function getStatus() {
        return {
            initialized: initialized,
            loadedFiles: loadedFiles.slice(),
            totalCards: Object.keys(priceCache).length,
            packPrices: Object.assign({}, packPrices)
        };
    }

    // ====== 公开 API ======
    return {
        init: init,
        getCardPrice: getCardPrice,
        getCardPrices: getCardPrices,
        getCardMarketPrice: getCardMarketPrice,
        getPackPrice: getPackPrice,
        hasPrice: hasPrice,
        getLoadedPacks: getLoadedPacks,
        getStatus: getStatus
    };

})();
