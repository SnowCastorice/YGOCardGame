/**
 * ============================================
 * YGO Pack Opener - 背包系统模块
 * 版本: 1.1.0
 * 
 * 【文件说明】
 * 负责管理玩家的卡片收藏（背包）：
 * 1. 开包获得的卡片自动存入背包
 * 2. 按卡片密码(id)去重，记录每张卡的数量
 * 3. 根据稀有度设定卡片价格（优先使用真实市场价格，回退到固定金币价格）
 * 4. 数据通过 localStorage 持久化存储
 * 5. 提供背包弹窗 UI 渲染
 * ============================================
 */

const InventorySystem = (function () {

    // ====== 稀有度 → 固定金币价格（兜底用，当真实市场价格不可用时使用） ======
    const RARITY_PRICES = {
        'PSER': 2000,   // 棱镜秘密闪
        'PSER-OF': 2000,// 棱镜秘密闪-OF
        'GMR-OF': 3000, // 幽金闪-OF
        'SER':  1500,   // 秘密闪
        'UTR':  1000,   // 终极闪
        'UR':   500,    // 极稀有
        'UR-OF': 500,   // 极稀有-OF
        'CR':   300,    // 收藏闪
        'SR':   200,    // 超稀有
        'R':    50,     // 稀有
        'NR':   20,     // 普通闪
        'N':    10      // 普通
    };

    // ====== localStorage 存储 key ======
    const STORAGE_KEY = 'ygo_inventory_data';

    // ====== 内部状态 ======
    // 背包数据结构：{ "卡片密码": { id, name, nameCN, nameOriginal, rarityVersions, imageUrl, imageLargeUrl, count, rarityVersionsOwned: { "SR": 2, "SER": 1 }, firstObtained } }
    let inventory = {};
    let initialized = false;

    // ====== 初始化 ======

    /**
     * 初始化背包系统
     * 从 localStorage 读取背包数据，自动迁移旧格式（补充 rarityVersionsOwned）
     */
    function init() {
        if (initialized) return;

        const saved = loadFromStorage();
        if (saved) {
            inventory = saved;
            // 迁移旧数据：为没有 rarityVersionsOwned 的卡片补充默认值
            let migrated = false;
            Object.keys(inventory).forEach(function (cardId) {
                const card = inventory[cardId];
                if (!card.rarityVersionsOwned) {
                    const rarity = (card.rarityVersions || ['N'])[0];
                    const versionsOwned = {};
                    versionsOwned[rarity] = card.count || 1;
                    card.rarityVersionsOwned = versionsOwned;
                    migrated = true;
                }
            });
            if (migrated) {
                saveToStorage();
                console.log('🎒 背包数据已自动迁移（补充 rarityVersionsOwned）');
            }
        }

        initialized = true;
        const totalCards = getTotalCardCount();
        const uniqueCards = getUniqueCardCount();
        console.log(`🎒 背包系统初始化完成: ${uniqueCards} 种卡片，共 ${totalCards} 张`);
    }

    // ====== 持久化存储 ======

    /** 保存背包到 localStorage */
    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
        } catch (e) {
            console.warn('⚠️ 保存背包数据失败:', e);
        }
    }

    /** 从 localStorage 读取背包 */
    function loadFromStorage() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.warn('⚠️ 读取背包数据失败:', e);
        }
        return null;
    }

    // ====== 卡片管理 ======

    /**
     * 将一组卡片添加到背包（通常是开包结果）
     * @param {Array} cards - 卡片数组，每个元素包含 { id, name, nameCN, nameOriginal, rarityVersions, imageUrl, imageLargeUrl }
     * 注意：rarityVersions[0] 是开包时实际获得的稀有度版本
     */
    function addCards(cards) {
        if (!initialized) init();
        if (!Array.isArray(cards) || cards.length === 0) return;

        cards.forEach(function (card) {
            const cardId = String(card.id);
            const rarity = (card.rarityVersions || ['N'])[0];

            if (inventory[cardId]) {
                // 已有该卡：总数量+1，并记录对应稀有度版本+1
                inventory[cardId].count += 1;
                if (!inventory[cardId].rarityVersionsOwned) {
                    inventory[cardId].rarityVersionsOwned = {};
                }
                inventory[cardId].rarityVersionsOwned[rarity] = (inventory[cardId].rarityVersionsOwned[rarity] || 0) + 1;
            } else {
                // 新卡：创建记录
                const versionsOwned = {};
                versionsOwned[rarity] = 1;
                inventory[cardId] = {
                    id: card.id,
                    name: card.name || '',
                    nameCN: card.nameCN || '',
                    nameOriginal: card.nameOriginal || '',
                    rarityVersions: card.rarityVersions || ['N'],
                    imageUrl: card.imageUrl || '',
                    imageLargeUrl: card.imageLargeUrl || '',
                    count: 1,
                    rarityVersionsOwned: versionsOwned,
                    firstObtained: Date.now()
                };
            }
        });

        saveToStorage();
        updateBadge();
        console.log(`🎒 背包新增 ${cards.length} 张卡片`);
    }

    /**
     * 获取背包中指定卡片的信息
     * @param {number|string} cardId - 卡片密码
     * @returns {object|null} 卡片信息（含数量和各版本收集数），不存在返回 null
     */
    function getCard(cardId) {
        if (!initialized) init();
        return inventory[String(cardId)] || null;
    }

    /**
     * 获取指定卡片各稀有度版本的收集数量
     * @param {number|string} cardId - 卡片密码
     * @returns {object} 如 { "SR": 2, "SER": 1 }，未拥有返回空对象
     */
    function getCardVersions(cardId) {
        if (!initialized) init();
        const card = inventory[String(cardId)];
        if (!card) return {};
        return card.rarityVersionsOwned || {};
    }

    /**
     * 获取背包中所有卡片
     * @returns {Array} 卡片数组（按首次获得时间排序，最新的在前）
     */
    function getAllCards() {
        if (!initialized) init();
        return Object.values(inventory).sort(function (a, b) {
            return b.firstObtained - a.firstObtained;
        });
    }

    /**
     * 获取背包中卡片的种类数
     * @returns {number}
     */
    function getUniqueCardCount() {
        if (!initialized) init();
        return Object.keys(inventory).length;
    }

    /**
     * 获取背包中卡片的总张数
     * @returns {number}
     */
    function getTotalCardCount() {
        if (!initialized) init();
        return Object.values(inventory).reduce(function (sum, card) {
            return sum + card.count;
        }, 0);
    }

    // ====== 价格相关 ======

    /**
     * 获取卡片价格（优先真实市场价格，回退到固定金币价格）
     * @param {string} rarity - 稀有度代码
     * @param {number|string} [cardId] - 卡片密码（传入则尝试获取真实市场价格）
     * @returns {number} 价格
     */
    function getCardPrice(rarity, cardId) {
        // 优先尝试获取真实市场价格
        if (cardId && typeof PriceSystem !== 'undefined') {
            var marketPrice = PriceSystem.getCardPrice(cardId, rarity);
            if (marketPrice !== null) return marketPrice;
        }
        // 回退到固定金币价格
        return RARITY_PRICES[rarity] || RARITY_PRICES['N'];
    }

    /**
     * 检查指定卡片是否有真实市场价格数据
     * @param {number|string} cardId - 卡片密码
     * @returns {boolean}
     */
    function hasMarketPrice(cardId) {
        return typeof PriceSystem !== 'undefined' && PriceSystem.hasPrice(cardId);
    }

    /**
     * 获取背包总价值（市场价格，人民币）
     * @returns {number} 总价值
     */
    function getTotalValue() {
        if (!initialized) init();
        return Object.values(inventory).reduce(function (sum, card) {
            // 遍历每个稀有度版本分别计算价值
            var cardValue = 0;
            var versionsOwned = card.rarityVersionsOwned || {};
            var hasVersions = Object.keys(versionsOwned).length > 0;
            if (hasVersions) {
                Object.keys(versionsOwned).forEach(function (rarity) {
                    var count = versionsOwned[rarity];
                    cardValue += getCardPrice(rarity, card.id) * count;
                });
            } else {
                // 兼容旧数据：使用第一个稀有度
                cardValue = getCardPrice((card.rarityVersions || ['N'])[0], card.id) * card.count;
            }
            return sum + cardValue;
        }, 0);
    }

    /**
     * 获取固定稀有度价格表（供UI展示兜底用）
     * @returns {object}
     */
    function getRarityPrices() {
        return { ...RARITY_PRICES };
    }

    // ====== UI 渲染 ======

    /** 更新导航栏背包图标上的角标数字 */
    function updateBadge() {
        const badgeEl = document.getElementById('inventory-badge');
        if (!badgeEl) return;

        const uniqueCount = getUniqueCardCount();
        if (uniqueCount > 0) {
            badgeEl.textContent = uniqueCount > 99 ? '99+' : String(uniqueCount);
            badgeEl.style.display = 'inline-block';
        } else {
            badgeEl.style.display = 'none';
        }
    }

    /**
     * 渲染背包弹窗内容
     * 
     * 【排序规则】
     * 默认按稀有度排序：UR → SR → R → N，同稀有度按数量降序
     */
    function renderInventoryModal(sortBy) {
        if (!initialized) init();

        const contentEl = document.getElementById('inventory-content');
        if (!contentEl) return;

        const cards = getAllCards();

        // 如果背包为空
        if (cards.length === 0) {
            contentEl.innerHTML = `
                <div class="inventory-empty">
                    <p class="inventory-empty-icon">🎒</p>
                    <p class="inventory-empty-text">背包空空如也~</p>
                    <p class="inventory-empty-hint">开几包卡试试吧！</p>
                </div>
            `;
            return;
        }

        // 按指定方式排序
        const sortedCards = sortCards(cards, sortBy || 'rarity');

        // 统计信息
        const totalCards = getTotalCardCount();
        const uniqueCards = getUniqueCardCount();
        const totalValue = getTotalValue();
        // 判断是否有市场价格数据（如果有，展示人民币；没有则展示金币）
        const hasAnyMarketPrice = Object.values(inventory).some(function (c) { return hasMarketPrice(c.id); });
        const priceUnit = hasAnyMarketPrice ? '¥' : '🪙';

        // 构建HTML
        let html = '';

        // 概览统计栏
        html += `
            <div class="inventory-stats">
                <div class="inventory-stat-item">
                    <span class="stat-label">种类</span>
                    <span class="stat-value">${uniqueCards}</span>
                </div>
                <div class="inventory-stat-item">
                    <span class="stat-label">总计</span>
                    <span class="stat-value">${totalCards} 张</span>
                </div>
                <div class="inventory-stat-item">
                    <span class="stat-label">总价值</span>
                    <span class="stat-value">${priceUnit} ${formatPrice(totalValue)}</span>
                </div>
            </div>
        `;

        // 排序控制栏
        html += `
            <div class="inventory-sort-bar">
                <span class="sort-label">排序：</span>
                <button class="sort-btn ${sortBy === 'rarity' || !sortBy ? 'active' : ''}" data-sort="rarity">稀有度</button>
                <button class="sort-btn ${sortBy === 'count' ? 'active' : ''}" data-sort="count">数量</button>
                <button class="sort-btn ${sortBy === 'price' ? 'active' : ''}" data-sort="price">价格</button>
                <button class="sort-btn ${sortBy === 'newest' ? 'active' : ''}" data-sort="newest">最新</button>
            </div>
        `;

        // 价格参考说明
        if (hasAnyMarketPrice) {
            html += `
                <div class="inventory-price-note">
                    💡 价格数据来源：集换社（单位：人民币元）
                </div>
            `;
        } else {
            html += `
                <div class="inventory-price-note">
                    💡 价格参考：<span class="rarity-price rarity-PSER">PSER ${RARITY_PRICES['PSER']}🪙</span> 
                    <span class="rarity-price rarity-UTR">UTR ${RARITY_PRICES['UTR']}🪙</span> 
                    <span class="rarity-price rarity-SER">SER ${RARITY_PRICES['SER']}🪙</span> 
                    <span class="rarity-price rarity-UR">UR ${RARITY_PRICES['UR']}🪙</span> 
                    <span class="rarity-price rarity-SR">SR ${RARITY_PRICES['SR']}🪙</span> 
                    <span class="rarity-price rarity-R">R ${RARITY_PRICES['R']}🪙</span> 
                    <span class="rarity-price rarity-NR">NR ${RARITY_PRICES['NR']}🪙</span> 
                    <span class="rarity-price rarity-N">N ${RARITY_PRICES['N']}🪙</span>
                </div>
            `;
        }

        // 卡片网格列表
        html += '<div class="inventory-grid">';
        sortedCards.forEach(function (card) {
            const rarityCode = (card.rarityVersions || ['N'])[0];
            const price = getCardPrice(rarityCode, card.id);
            const isMarket = hasMarketPrice(card.id);
            const displayName = card.nameCN || card.name || card.nameOriginal || '未知卡片';

            // 卡图 HTML —— 带 fallback 机制：主图源失败时自动尝试备用 CDN
            // 备用图源：YGOProDeck CDN（小图）
            const fallbackUrl = 'https://images.ygoprodeck.com/images/cards_small/' + card.id + '.jpg';
            let imageHtml;
            if (card.imageUrl) {
                imageHtml = `<img class="inventory-card-image" src="${card.imageUrl}" alt="${displayName}" loading="lazy"
                                  data-fallback="${fallbackUrl}"
                                  onerror="if(!this.dataset.tried){this.dataset.tried='1';this.src=this.dataset.fallback;}else{this.style.display='none';this.nextElementSibling.style.display='flex';}">
                             <div class="inventory-card-placeholder" style="display:none;">🃏</div>`;
            } else {
                // 无 imageUrl 时直接用 fallback 图源尝试加载
                imageHtml = `<img class="inventory-card-image" src="${fallbackUrl}" alt="${displayName}" loading="lazy"
                                  onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                             <div class="inventory-card-placeholder" style="display:none;">🃏</div>`;
            }

            html += `
                <div class="inventory-card-item rarity-border-${rarityCode}" data-card-id="${card.id}">
                    <div class="inventory-card-img-wrapper">
                        ${imageHtml}
                        <span class="inventory-rarity-badge rarity-${rarityCode}">${rarityCode}</span>
                        ${card.count > 1 ? `<span class="inventory-count-badge">×${card.count}</span>` : ''}
                    </div>
                    <div class="inventory-card-info">
                        <div class="inventory-card-name" title="${displayName}">${displayName}</div>
                        <div class="inventory-card-price">${isMarket ? '¥' : '🪙'} ${formatPrice(price)}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        contentEl.innerHTML = html;

        // 绑定排序按钮事件
        contentEl.querySelectorAll('.sort-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                renderInventoryModal(this.getAttribute('data-sort'));
            });
        });

        // 绑定卡片点击事件（放大查看卡图）
        contentEl.querySelectorAll('.inventory-card-item').forEach(function (item) {
            item.addEventListener('click', function () {
                const cardId = this.getAttribute('data-card-id');
                const card = getCard(cardId);
                if (card && card.imageLargeUrl) {
                    showCardViewer(card);
                } else if (card && card.imageUrl) {
                    showCardViewer(card);
                }
            });
        });
    }

    /**
     * 在卡片大图查看器中展示卡片
     * 复用 game.js 中已有的 card-image-viewer
     */
    function showCardViewer(card) {
        const viewer = document.getElementById('card-image-viewer');
        if (!viewer) return;

        const img = viewer.querySelector('.viewer-image');
        const nameEl = viewer.querySelector('.viewer-card-name');

        if (img) {
            img.src = card.imageLargeUrl || card.imageUrl || '';
        }
        if (nameEl) {
            const displayName = card.nameCN || card.name || '';
            const foreignName = card.nameOriginal || '';
            // 中文名和日文名之间用换行分隔
            if (foreignName && foreignName !== displayName) {
                nameEl.innerHTML = displayName + '<br><span style="font-size:0.8em;opacity:0.7;">' + foreignName + '</span>';
            } else {
                nameEl.textContent = displayName;
            }
        }

        viewer.classList.add('active');
    }

    /**
     * 卡片排序
     * @param {Array} cards - 卡片数组
     * @param {string} sortBy - 排序方式
     * @returns {Array} 排序后的数组
     */
    function sortCards(cards, sortBy) {
        // 使用全局 RARITY_ORDER_ASC（由 rarities.json 动态生成）
        const rarityOrder = (typeof RARITY_ORDER_ASC !== 'undefined') ? RARITY_ORDER_ASC : {};
        const sorted = cards.slice(); // 复制一份

        switch (sortBy) {
            case 'rarity':
                // 稀有度高→低，同稀有度按数量降序
                sorted.sort(function (a, b) {
                    const rDiff = (rarityOrder[(b.rarityVersions || ['N'])[0]] || 0) - (rarityOrder[(a.rarityVersions || ['N'])[0]] || 0);
                    if (rDiff !== 0) return rDiff;
                    return b.count - a.count;
                });
                break;
            case 'count':
                // 数量多→少
                sorted.sort(function (a, b) {
                    return b.count - a.count;
                });
                break;
            case 'price':
                // 价格高→低（使用真实市场价格排序）
                sorted.sort(function (a, b) {
                    const pDiff = getCardPrice((b.rarityVersions || ['N'])[0], b.id) - getCardPrice((a.rarityVersions || ['N'])[0], a.id);
                    if (pDiff !== 0) return pDiff;
                    return b.count - a.count;
                });
                break;
            case 'newest':
                // 最新获得在前
                sorted.sort(function (a, b) {
                    return b.firstObtained - a.firstObtained;
                });
                break;
            default:
                break;
        }
        return sorted;
    }

    /**
     * 格式化数字（千分位）
     */
    function formatNumber(num) {
        if (num >= 10000) {
            return num.toLocaleString();
        }
        return String(num);
    }

    /**
     * 格式化价格（小数点后最多2位，整数不显示小数点）
     */
    function formatPrice(price) {
        if (price === 0) return '0';
        if (Number.isInteger(price)) {
            return price >= 10000 ? price.toLocaleString() : String(price);
        }
        // 保留最多2位小数，去除尾部多余的0
        var formatted = price.toFixed(2).replace(/\.?0+$/, '');
        var num = parseFloat(formatted);
        return num >= 10000 ? num.toLocaleString() : formatted;
    }

    // ====== 调试/管理接口 ======

    /**
     * 清空背包（调试用）
     */
    function clearAll() {
        inventory = {};
        saveToStorage();
        updateBadge();
        console.log('🎒 背包已清空');
    }

    /**
     * 重新加载背包数据（清除后重新从 localStorage 读取）
     * 供缓存管理模块在清除背包数据后调用
     */
    function reload() {
        inventory = {};
        initialized = false;
        init();
        console.log('🎒 背包系统已重新加载');
    }

    // ====== 公开 API ======
    return {
        init: init,
        reload: reload,
        addCards: addCards,
        getCard: getCard,
        getCardVersions: getCardVersions,
        getAllCards: getAllCards,
        getUniqueCardCount: getUniqueCardCount,
        getTotalCardCount: getTotalCardCount,
        getCardPrice: getCardPrice,
        hasMarketPrice: hasMarketPrice,
        getTotalValue: getTotalValue,
        getRarityPrices: getRarityPrices,
        updateBadge: updateBadge,
        renderInventoryModal: renderInventoryModal,
        clearAll: clearAll
    };

})();
