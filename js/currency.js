/**
 * ============================================
 * YGO Pack Opener - 货币系统模块
 * 版本: 1.0.0
 * 
 * 【文件说明】
 * 负责管理游戏内的虚拟货币系统：
 * 1. 支持多种货币（金币、钻石等），可扩展
 * 2. 不同货币之间按比例兑换
 * 3. 余额的增加、消费、查询
 * 4. 数据通过 localStorage 持久化存储
 * 5. 提供 UI 更新接口，自动同步页面显示
 * ============================================
 */

const CurrencySystem = (function () {

    // ====== 货币定义 ======
    // 每种货币的基本信息，方便扩展新货币
    const CURRENCY_DEFS = {
        gold: {
            id: 'gold',
            name: '金币',
            icon: '🪙',
            color: '#ffd700',
            // 初始赠送数量（新用户首次进入时赠送）
            initialAmount: 100000
        },
        diamond: {
            id: 'diamond',
            name: '钻石',
            icon: '💎',
            color: '#4a9eff',
            initialAmount: 10
        }
    };

    // ====== 兑换比例定义 ======
    // 格式：{ "源货币_目标货币": { from: 源数量, to: 目标数量 } }
    // 例如：10 金币 → 1 钻石
    const EXCHANGE_RATES = {
        'gold_diamond': { from: 10, to: 1 },
        'diamond_gold': { from: 1, to: 10 }
    };

    // ====== localStorage 存储 key ======
    const STORAGE_KEY = 'ygo_currency_data';

    // ====== 内部状态 ======
    let balances = {};       // 各货币余额 { gold: 1000, diamond: 10 }
    let initialized = false; // 是否已初始化

    // ====== 初始化 ======

    /**
     * 初始化货币系统
     * 从 localStorage 读取余额，如果没有则使用初始值
     */
    function init() {
        if (initialized) return;

        const saved = loadFromStorage();
        if (saved) {
            balances = saved;
            // 检查是否有新增的货币类型（版本升级时可能新增）
            Object.keys(CURRENCY_DEFS).forEach(function (id) {
                if (balances[id] === undefined) {
                    balances[id] = CURRENCY_DEFS[id].initialAmount;
                }
            });
        } else {
            // 首次使用，赠送初始货币
            Object.keys(CURRENCY_DEFS).forEach(function (id) {
                balances[id] = CURRENCY_DEFS[id].initialAmount;
            });
        }

        saveToStorage();
        initialized = true;
        console.log('💰 货币系统初始化完成:', JSON.stringify(balances));
    }

    // ====== 持久化存储 ======

    /** 保存余额到 localStorage */
    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(balances));
        } catch (e) {
            console.warn('⚠️ 保存货币数据失败:', e);
        }
    }

    /** 从 localStorage 读取余额 */
    function loadFromStorage() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn('⚠️ 读取货币数据失败:', e);
        }
        return null;
    }

    // ====== 余额管理 ======

    /**
     * 获取指定货币的余额
     * @param {string} currencyId - 货币ID（如 'gold', 'diamond'）
     * @returns {number} 余额数量
     */
    function getBalance(currencyId) {
        if (!initialized) init();
        return balances[currencyId] || 0;
    }

    /**
     * 获取所有货币的余额
     * @returns {object} 所有货币余额 { gold: 1000, diamond: 10 }
     */
    function getAllBalances() {
        if (!initialized) init();
        return { ...balances };
    }

    /**
     * 增加指定货币的余额
     * @param {string} currencyId - 货币ID
     * @param {number} amount - 增加数量（必须 > 0）
     * @returns {boolean} 是否成功
     */
    function addBalance(currencyId, amount) {
        if (!initialized) init();
        if (!CURRENCY_DEFS[currencyId]) {
            console.warn(`⚠️ 未知货币类型: ${currencyId}`);
            return false;
        }
        if (amount <= 0 || !Number.isInteger(amount)) {
            console.warn(`⚠️ 增加数量必须为正整数: ${amount}`);
            return false;
        }

        balances[currencyId] = (balances[currencyId] || 0) + amount;
        saveToStorage();
        updateUI();
        console.log(`💰 ${CURRENCY_DEFS[currencyId].icon} +${amount} ${CURRENCY_DEFS[currencyId].name}，当前余额: ${balances[currencyId]}`);
        return true;
    }

    /**
     * 消费指定货币
     * @param {string} currencyId - 货币ID
     * @param {number} amount - 消费数量（必须 > 0）
     * @returns {boolean} 是否成功（余额不足返回 false）
     */
    function spendBalance(currencyId, amount) {
        if (!initialized) init();
        if (!CURRENCY_DEFS[currencyId]) {
            console.warn(`⚠️ 未知货币类型: ${currencyId}`);
            return false;
        }
        if (amount <= 0 || !Number.isInteger(amount)) {
            console.warn(`⚠️ 消费数量必须为正整数: ${amount}`);
            return false;
        }

        const current = balances[currencyId] || 0;
        if (current < amount) {
            console.warn(`⚠️ ${CURRENCY_DEFS[currencyId].name}余额不足: 当前 ${current}，需要 ${amount}`);
            return false;
        }

        balances[currencyId] = current - amount;
        saveToStorage();
        updateUI();
        console.log(`💰 ${CURRENCY_DEFS[currencyId].icon} -${amount} ${CURRENCY_DEFS[currencyId].name}，当前余额: ${balances[currencyId]}`);
        return true;
    }

    /**
     * 检查余额是否足够
     * @param {string} currencyId - 货币ID
     * @param {number} amount - 需要的数量
     * @returns {boolean} 是否足够
     */
    function canAfford(currencyId, amount) {
        if (!initialized) init();
        return (balances[currencyId] || 0) >= amount;
    }

    // ====== 货币兑换 ======

    /**
     * 获取兑换比例信息
     * @param {string} fromCurrency - 源货币ID
     * @param {string} toCurrency - 目标货币ID
     * @returns {object|null} 兑换比例 { from: 10, to: 1 }，不支持兑换返回 null
     */
    function getExchangeRate(fromCurrency, toCurrency) {
        const key = `${fromCurrency}_${toCurrency}`;
        return EXCHANGE_RATES[key] || null;
    }

    /**
     * 执行货币兑换
     * @param {string} fromCurrency - 源货币ID
     * @param {string} toCurrency - 目标货币ID
     * @param {number} times - 兑换次数（每次按比例兑换）
     * @returns {object} { success: boolean, message: string, spent: number, gained: number }
     */
    function exchange(fromCurrency, toCurrency, times) {
        if (!initialized) init();

        if (times <= 0 || !Number.isInteger(times)) {
            return { success: false, message: '兑换次数必须为正整数' };
        }

        const rate = getExchangeRate(fromCurrency, toCurrency);
        if (!rate) {
            return { success: false, message: `不支持 ${fromCurrency} → ${toCurrency} 的兑换` };
        }

        const totalCost = rate.from * times;
        const totalGain = rate.to * times;

        if (!canAfford(fromCurrency, totalCost)) {
            const fromDef = CURRENCY_DEFS[fromCurrency];
            return {
                success: false,
                message: `${fromDef.name}不足！需要 ${totalCost}${fromDef.icon}，当前只有 ${getBalance(fromCurrency)}${fromDef.icon}`
            };
        }

        // 执行兑换：扣除源货币，增加目标货币
        balances[fromCurrency] -= totalCost;
        balances[toCurrency] = (balances[toCurrency] || 0) + totalGain;
        saveToStorage();
        updateUI();

        const fromDef = CURRENCY_DEFS[fromCurrency];
        const toDef = CURRENCY_DEFS[toCurrency];
        console.log(`💱 兑换成功: ${totalCost}${fromDef.icon} → ${totalGain}${toDef.icon}`);

        return {
            success: true,
            message: `成功兑换！消耗 ${totalCost} ${fromDef.icon}${fromDef.name}，获得 ${totalGain} ${toDef.icon}${toDef.name}`,
            spent: totalCost,
            gained: totalGain
        };
    }

    /**
     * 计算最大可兑换次数
     * @param {string} fromCurrency - 源货币ID
     * @param {string} toCurrency - 目标货币ID
     * @returns {number} 最大可兑换次数
     */
    function getMaxExchangeTimes(fromCurrency, toCurrency) {
        const rate = getExchangeRate(fromCurrency, toCurrency);
        if (!rate) return 0;
        return Math.floor(getBalance(fromCurrency) / rate.from);
    }

    // ====== UI 更新 ======

    /**
     * 更新页面上所有货币显示
     * 会自动查找页面中的货币显示元素并更新数值
     */
    function updateUI() {
        Object.keys(CURRENCY_DEFS).forEach(function (id) {
            // 更新导航栏中的货币余额显示
            const balanceEl = document.getElementById(`currency-balance-${id}`);
            if (balanceEl) {
                const newValue = balances[id] || 0;
                balanceEl.textContent = formatNumber(newValue);

                // 数字变化时添加一个短暂的动画效果
                balanceEl.classList.remove('balance-changed');
                // 强制重绘
                void balanceEl.offsetWidth;
                balanceEl.classList.add('balance-changed');
            }
        });
    }

    /**
     * 格式化数字显示（千分位分隔）
     * @param {number} num - 数字
     * @returns {string} 格式化后的字符串
     */
    function formatNumber(num) {
        if (num >= 10000) {
            return num.toLocaleString();
        }
        return String(num);
    }

    // ====== 查询接口 ======

    /**
     * 获取所有货币的定义信息
     * @returns {object} 货币定义字典
     */
    function getCurrencyDefs() {
        return { ...CURRENCY_DEFS };
    }

    /**
     * 获取指定货币的定义信息
     * @param {string} currencyId - 货币ID
     * @returns {object|null} 货币定义
     */
    function getCurrencyDef(currencyId) {
        return CURRENCY_DEFS[currencyId] || null;
    }

    /**
     * 获取所有支持的兑换比例
     * @returns {object} 兑换比例字典
     */
    function getAllExchangeRates() {
        return { ...EXCHANGE_RATES };
    }

    // ====== 调试/管理接口 ======

    /**
     * 重置所有货币到初始状态（调试用）
     */
    function resetAll() {
        Object.keys(CURRENCY_DEFS).forEach(function (id) {
            balances[id] = CURRENCY_DEFS[id].initialAmount;
        });
        saveToStorage();
        updateUI();
        console.log('💰 货币系统已重置为初始状态:', JSON.stringify(balances));
    }

    // ====== 公开 API ======
    return {
        init: init,
        getBalance: getBalance,
        getAllBalances: getAllBalances,
        addBalance: addBalance,
        spendBalance: spendBalance,
        canAfford: canAfford,
        exchange: exchange,
        getExchangeRate: getExchangeRate,
        getMaxExchangeTimes: getMaxExchangeTimes,
        getCurrencyDefs: getCurrencyDefs,
        getCurrencyDef: getCurrencyDef,
        getAllExchangeRates: getAllExchangeRates,
        updateUI: updateUI,
        resetAll: resetAll
    };

})();
