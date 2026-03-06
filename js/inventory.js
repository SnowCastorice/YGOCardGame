/**
 * ============================================
 * YGO Pack Opener - 背包系统模块
 * 版本: 1.1.0
 * 
 * 【文件说明】
 * 负责管理玩家的卡片收藏（背包）：
 * 1. 开包获得的卡片自动存入背包
 * 2. 按卡片密码(id)去重，记录每张卡的数量
 * 3. 展示卡片市场价格（来源：集换社），未录入价格的卡片显示"暂无报价"
 * 4. 记录累计开包花费，计算总盈亏（背包总价值 - 累计花费）
 * 5. 数据通过 localStorage 持久化存储
 * 6. 提供背包弹窗 UI 渲染
 * ============================================
 */

const InventorySystem = (function () {



    // ====== localStorage 存储 key ======
    const STORAGE_KEY = 'ygo_inventory_data';
    const SPENT_KEY = 'ygo_inventory_spent'; // 累计开包花费（历史记录，不受价格调整影响）

    // ====== 内部状态 ======
    // 背包数据结构：{ "卡片密码": { id, name, nameCN, nameOriginal, rarityVersions, imageUrl, imageLargeUrl, count, rarityVersionsOwned: { "SR": 2, "SER": 1 }, firstObtained } }
    let inventory = {};
    let initialized = false;

    // 当前排序状态
    let currentSortBy = 'rarity';   // 当前排序维度
    let currentSortOrder = 'desc';  // 当前排序方向：desc=降序, asc=升序

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

            // 利用卡片上的 _imageMap 为当前稀有度预计算卡图URL
            // _imageMap 是运行时大对象不能直接存储，所以只保存计算后的URL
            let raritySmallUrl = card.imageUrl || '';
            let rarityLargeUrl = card.imageLargeUrl || '';
            if (card._imageMap && typeof getCardImageUrl === 'function') {
                const smallResult = getCardImageUrl(card.id, card._imageMap, 'small', rarity);
                const largeResult = getCardImageUrl(card.id, card._imageMap, 'large', rarity);
                if (smallResult && smallResult.url) raritySmallUrl = smallResult.url;
                if (largeResult && largeResult.url) rarityLargeUrl = largeResult.url;
            }

            if (inventory[cardId]) {
                // 已有该卡：总数量+1，并记录对应稀有度版本+1
                inventory[cardId].count += 1;
                if (!inventory[cardId].rarityVersionsOwned) {
                    inventory[cardId].rarityVersionsOwned = {};
                }
                inventory[cardId].rarityVersionsOwned[rarity] = (inventory[cardId].rarityVersionsOwned[rarity] || 0) + 1;
                // 保存该稀有度版本对应的卡图URL（超框卡等特殊版本使用不同卡图）
                if (!inventory[cardId].rarityImageUrls) {
                    inventory[cardId].rarityImageUrls = {};
                }
                if (!inventory[cardId].rarityImageUrls[rarity]) {
                    inventory[cardId].rarityImageUrls[rarity] = {
                        imageUrl: raritySmallUrl,
                        imageLargeUrl: rarityLargeUrl
                    };
                }
            } else {
                // 新卡：创建记录
                const versionsOwned = {};
                versionsOwned[rarity] = 1;
                // 初始化稀有度卡图映射
                const rarityImageUrls = {};
                rarityImageUrls[rarity] = {
                    imageUrl: raritySmallUrl,
                    imageLargeUrl: rarityLargeUrl
                };
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
                    rarityImageUrls: rarityImageUrls,
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
     * 获取背包中所有卡片（按 cardId + rarity 展开为独立条目）
     * 同一张卡的不同稀有度版本会分开显示，每条记录包含 displayRarity 和 displayCount
     * @returns {Array} 展开后的卡片数组
     */
    function getExpandedCards() {
        if (!initialized) init();
        var expandedList = [];
        Object.values(inventory).forEach(function (card) {
            var versionsOwned = card.rarityVersionsOwned || {};
            var rarityImages = card.rarityImageUrls || {};
            var hasVersions = Object.keys(versionsOwned).length > 0;
            if (hasVersions) {
                // 按每种稀有度版本各生成一条记录
                Object.keys(versionsOwned).forEach(function (rarity) {
                    var count = versionsOwned[rarity];
                    if (count > 0) {
                        // 优先使用该稀有度预存的卡图URL（超框卡等特殊版本使用不同卡图）
                        var imgUrls = rarityImages[rarity] || {};
                        expandedList.push({
                            id: card.id,
                            name: card.name,
                            nameCN: card.nameCN,
                            nameOriginal: card.nameOriginal,
                            imageUrl: imgUrls.imageUrl || card.imageUrl,
                            imageLargeUrl: imgUrls.imageLargeUrl || card.imageLargeUrl,
                            firstObtained: card.firstObtained,
                            displayRarity: rarity,
                            displayCount: count
                        });
                    }
                });
            } else {
                // 兼容旧数据：使用第一个稀有度
                expandedList.push({
                    id: card.id,
                    name: card.name,
                    nameCN: card.nameCN,
                    nameOriginal: card.nameOriginal,
                    imageUrl: card.imageUrl,
                    imageLargeUrl: card.imageLargeUrl,
                    firstObtained: card.firstObtained,
                    displayRarity: (card.rarityVersions || ['N'])[0],
                    displayCount: card.count || 1
                });
            }
        });
        return expandedList;
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
     * 获取卡片市场价格
     * @param {string} rarity - 稀有度代码
     * @param {number|string} [cardId] - 卡片密码
     * @returns {number} 市场价格，无报价返回 0
     */
    function getCardPrice(rarity, cardId) {
        if (cardId && typeof PriceSystem !== 'undefined') {
            var marketPrice = PriceSystem.getCardPrice(cardId, rarity);
            if (marketPrice !== null) return marketPrice;
        }
        // 无市场报价，价值为 0
        return 0;
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
     * 获取背包总价值（仅计入有市场报价的卡片）
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
    function renderInventoryModal(sortBy, sortOrder) {
        if (!initialized) init();

        const contentEl = document.getElementById('inventory-content');
        if (!contentEl) return;

        // 更新排序状态
        if (sortBy) currentSortBy = sortBy;
        if (sortOrder) currentSortOrder = sortOrder;
        sortBy = currentSortBy;
        sortOrder = currentSortOrder;

        // 使用展开后的卡片列表（同一张卡的不同稀有度版本分开显示）
        const cards = getExpandedCards();

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

        // 按指定方式排序（支持升序/降序）
        const sortedCards = sortCards(cards, sortBy || 'rarity', sortOrder || 'desc');

        // 统计信息（种类数 = 展开后的条目数，即 cardId+rarity 组合数）
        const totalCards = getTotalCardCount();
        const uniqueCards = cards.length; // 展开后的种类数（按 cardId+rarity 去重）
        const totalValue = getTotalValue();
        const totalSpent = getTotalSpent();
        const profitLoss = totalValue - totalSpent;
        const priceUnit = '🪙';

        // 盈亏显示：盈利绿色带+号，亏损红色带-号，持平白色
        let profitClass = 'stat-value--neutral';
        let profitPrefix = '';
        if (profitLoss > 0) {
            profitClass = 'stat-value--profit';
            profitPrefix = '+';
        } else if (profitLoss < 0) {
            profitClass = 'stat-value--loss';
            profitPrefix = '';  // 负号由数字自带
        }

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
                <div class="inventory-stat-item">
                    <span class="stat-label">总盈亏</span>
                    <span class="stat-value ${profitClass}">${priceUnit} ${profitPrefix}${formatPrice(profitLoss)}</span>
                </div>
            </div>
        `;

        // 排序控制栏（带升降序箭头提示）
        const sortOptions = [
            { key: 'rarity', label: '稀有度' },
            { key: 'count', label: '数量' },
            { key: 'price', label: '价格' },
            { key: 'newest', label: '最新' }
        ];
        html += '<div class="inventory-sort-bar">';
        html += '<span class="sort-label">排序：</span>';
        sortOptions.forEach(function (opt) {
            const isActive = (sortBy === opt.key) || (!sortBy && opt.key === 'rarity');
            const arrow = isActive ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : '';
            html += '<button class="sort-btn ' + (isActive ? 'active' : '') + '" data-sort="' + opt.key + '">' + opt.label + (arrow ? '<span class="sort-arrow">' + arrow + '</span>' : '') + '</button>';
        });
        html += '</div>';

        // 价格数据来源说明
        html += `
            <div class="inventory-price-note">
                💡 价格数据来源：集换社
            </div>
        `;

        // 卡片网格列表
        html += '<div class="inventory-grid">';
        sortedCards.forEach(function (card) {
            const rarityCode = card.displayRarity || (card.rarityVersions || ['N'])[0];
            const cardCount = card.displayCount || card.count || 1;
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

            // 有市场报价显示价格，无报价显示"暂无报价"
            let priceHtml;
            if (isMarket) {
                priceHtml = `<div class="inventory-card-price">🪙 ${formatPrice(price)}</div>`;
            } else {
                priceHtml = '<div class="inventory-card-price inventory-card-price--no-data">暂无报价</div>';
            }
            html += `
                <div class="inventory-card-item rarity-border-${rarityCode}" data-card-id="${card.id}" data-rarity="${rarityCode}">
                    <div class="inventory-card-img-wrapper">
                        ${imageHtml}
                        <span class="inventory-rarity-badge rarity-${rarityCode}">${rarityCode}</span>
                        ${cardCount > 1 ? `<span class="inventory-count-badge">×${cardCount}</span>` : ''}
                    </div>
                    <div class="inventory-card-info">
                        <div class="inventory-card-name" title="${displayName}">${displayName}</div>
                        ${priceHtml}
                    </div>
                </div>
            `;
        });
        html += '</div>';

        contentEl.innerHTML = html;

        // 绑定排序按钮事件（点击同一按钮切换升降序，点击不同按钮重置为降序）
        contentEl.querySelectorAll('.sort-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const clickedSort = this.getAttribute('data-sort');
                if (clickedSort === currentSortBy) {
                    // 同一按钮：切换排序方向
                    const newOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
                    renderInventoryModal(clickedSort, newOrder);
                } else {
                    // 不同按钮：切换维度，默认降序
                    renderInventoryModal(clickedSort, 'desc');
                }
            });
        });

        // 绑定卡片点击事件（放大查看卡图）
        contentEl.querySelectorAll('.inventory-card-item').forEach(function (item) {
            item.addEventListener('click', function () {
                const cardId = this.getAttribute('data-card-id');
                const rarity = this.getAttribute('data-rarity');
                const card = getCard(cardId);
                if (card) {
                    // 从 rarityImageUrls 中获取对应稀有度的大图URL（超框卡等特殊版本使用不同卡图）
                    const rarityImgs = (card.rarityImageUrls && card.rarityImageUrls[rarity]) || {};
                    const viewerCard = {
                        id: card.id,
                        name: card.name,
                        nameCN: card.nameCN,
                        nameOriginal: card.nameOriginal,
                        imageUrl: rarityImgs.imageUrl || card.imageUrl,
                        imageLargeUrl: rarityImgs.imageLargeUrl || card.imageLargeUrl
                    };
                    showCardViewer(viewerCard);
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
            // 先清空旧图，避免打开新卡片时闪现上一张图片
            img.src = '';
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
    function sortCards(cards, sortBy, sortOrder) {
        // 使用全局 RARITY_ORDER_ASC（由 rarities.json 动态生成）
        const rarityOrder = (typeof RARITY_ORDER_ASC !== 'undefined') ? RARITY_ORDER_ASC : {};
        const sorted = cards.slice(); // 复制一份
        // 排序方向系数：降序=1，升序=-1
        const dir = (sortOrder === 'asc') ? -1 : 1;

        // 辅助函数：获取卡片的稀有度（兼容展开后和原始格式）
        function getCardRarity(card) {
            return card.displayRarity || (card.rarityVersions || ['N'])[0];
        }
        // 辅助函数：获取卡片的数量（兼容展开后和原始格式）
        function getCardCount(card) {
            return card.displayCount || card.count || 1;
        }

        switch (sortBy) {
            case 'rarity':
                // 稀有度排序，同稀有度按数量排序
                sorted.sort(function (a, b) {
                    const rDiff = (rarityOrder[getCardRarity(b)] || 0) - (rarityOrder[getCardRarity(a)] || 0);
                    if (rDiff !== 0) return rDiff * dir;
                    return (getCardCount(b) - getCardCount(a)) * dir;
                });
                break;
            case 'count':
                // 数量排序
                sorted.sort(function (a, b) {
                    return (getCardCount(b) - getCardCount(a)) * dir;
                });
                break;
            case 'price':
                // 价格排序：无报价卡片（价值0）降序排最后，升序排最前
                sorted.sort(function (a, b) {
                    const aPrice = getCardPrice(getCardRarity(a), a.id);
                    const bPrice = getCardPrice(getCardRarity(b), b.id);
                    const pDiff = bPrice - aPrice;
                    if (pDiff !== 0) return pDiff * dir;
                    return (getCardCount(b) - getCardCount(a)) * dir;
                });
                break;
            case 'newest':
                // 按获得时间排序
                sorted.sort(function (a, b) {
                    return (b.firstObtained - a.firstObtained) * dir;
                });
                break;
            default:
                break;
        }
        return sorted;
    }

    /**
     * 格式化数字（大数字使用万/亿缩写）
     * - < 10000: 原样显示
     * - >= 10000 且 < 1亿: 显示为 x.xx万
     * - >= 1亿: 显示为 x.xx亿
     */
    function formatNumber(num) {
        if (num >= 100000000) {
            var val = (num / 100000000).toFixed(2).replace(/\.?0+$/, '');
            return val + '亿';
        }
        if (num >= 10000) {
            var val = (num / 10000).toFixed(2).replace(/\.?0+$/, '');
            return val + '万';
        }
        return String(num);
    }

    /**
     * 格式化价格（大数字使用万/亿缩写，小数字保留最多2位小数）
     * - < 10000: 原样显示（整数不显示小数点）
     * - >= 10000 且 < 1亿: 显示为 x.xx万
     * - >= 1亿: 显示为 x.xx亿
     */
    function formatPrice(price) {
        if (price === 0) return '0';
        // 处理负数：取绝对值格式化后再加负号
        var isNegative = price < 0;
        var absPrice = Math.abs(price);
        var result;
        if (absPrice >= 100000000) {
            // 亿级别
            result = (absPrice / 100000000).toFixed(2).replace(/\.?0+$/, '') + '亿';
        } else if (absPrice >= 10000) {
            // 万级别
            result = (absPrice / 10000).toFixed(2).replace(/\.?0+$/, '') + '万';
        } else if (Number.isInteger(absPrice)) {
            result = String(absPrice);
        } else {
            // 保留最多2位小数，去除尾部多余的0
            result = absPrice.toFixed(2).replace(/\.?0+$/, '');
        }
        return isNegative ? '-' + result : result;
    }

    // ====== 开包花费记录 ======

    /**
     * 记录一次开包花费
     * 每次开包时由 game.js 调用，将花费金额累加到历史记录中
     * @param {number} amount - 本次开包花费的金币数
     */
    function recordSpent(amount) {
        if (!amount || amount <= 0) return;
        var current = getTotalSpent();
        var newTotal = current + amount;
        try {
            localStorage.setItem(SPENT_KEY, String(newTotal));
        } catch (e) {
            console.warn('⚠️ 保存开包花费记录失败:', e);
        }
    }

    /**
     * 获取累计开包花费总额
     * @returns {number} 累计花费金币数
     */
    function getTotalSpent() {
        try {
            var saved = localStorage.getItem(SPENT_KEY);
            if (saved) return parseFloat(saved) || 0;
        } catch (e) {
            console.warn('⚠️ 读取开包花费记录失败:', e);
        }
        return 0;
    }

    /**
     * 清空累计开包花费记录（重置游戏时调用）
     */
    function clearSpent() {
        try {
            localStorage.removeItem(SPENT_KEY);
        } catch (e) {
            console.warn('⚠️ 清除开包花费记录失败:', e);
        }
    }

    // ====== 调试/管理接口 ======

    /**
     * 清空背包（调试用）
     */
    function clearAll() {
        inventory = {};
        saveToStorage();
        clearSpent();
        updateBadge();
        console.log('🎒 背包已清空（含花费记录）');
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
        recordSpent: recordSpent,
        getTotalSpent: getTotalSpent,

        updateBadge: updateBadge,
        renderInventoryModal: renderInventoryModal,
        clearAll: clearAll
    };

})();
