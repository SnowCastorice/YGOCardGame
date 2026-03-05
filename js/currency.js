/**
 * ============================================
 * YGO Pack Opener - 货币系统模块
 * 版本: 1.1.0
 * 
 * 【文件说明】
 * 负责管理游戏内的虚拟货币系统：
 * 1. 支持金币货币，余额增加、消费、查询
 * 2. 数据通过 localStorage 持久化存储
 * 3. 提供 UI 更新接口，自动同步页面显示
 * ============================================
 */

const CurrencySystem = (function () {

    // ====== 货币定义 ======
    // 当前仅支持金币一种货币
    const CURRENCY_DEFS = {
        gold: {
            id: 'gold',
            name: '金币',
            icon: '🪙',
            color: '#ffd700',
            // 初始赠送数量（新用户首次进入时赠送，100万金币）
            initialAmount: 1000000
        }
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
     * 格式化数字显示（大数字使用万/亿缩写，小数字千分位分隔）
     * - < 10000: 原样显示
     * - >= 10000 且 < 1亿: 显示为 x.xx万
     * - >= 1亿: 显示为 x.xx亿
     * @param {number} num - 数字
     * @returns {string} 格式化后的字符串
     */
    function formatNumber(num) {
        if (num >= 100000000) {
            // 亿级别
            var val = (num / 100000000).toFixed(2).replace(/\.?0+$/, '');
            return val + '亿';
        }
        if (num >= 10000) {
            // 万级别
            var val = (num / 10000).toFixed(2).replace(/\.?0+$/, '');
            return val + '万';
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

    /**
     * 重新加载货币数据（清除后重新从 localStorage 读取）
     * 供缓存管理模块在清除货币数据后调用
     */
    function reload() {
        balances = {};
        initialized = false;
        init();
        console.log('💰 货币系统已重新加载');
    }

    // ====== 公开 API ======
    return {
        init: init,
        reload: reload,
        getBalance: getBalance,
        getAllBalances: getAllBalances,
        addBalance: addBalance,
        spendBalance: spendBalance,
        canAfford: canAfford,
        getCurrencyDefs: getCurrencyDefs,
        getCurrencyDef: getCurrencyDef,
        updateUI: updateUI,
        resetAll: resetAll
    };

})();
