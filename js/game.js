/**
 * ============================================
 * YGO Pack Opener - 游戏核心逻辑
 * 版本: 0.3.0
 * 
 * 【文件说明】
 * 这是游戏的"大脑"，负责：
 * 1. 读取卡包配置表（cards.json）— 支持 OCG / TCG 双模式
 * 2. 通过 API 模块获取卡牌数据（自动缓存到玩家设备）
 * 3. 读取更新日志（changelog.json）
 * 4. 实现开包抽卡逻辑（按稀有度权重随机抽取）
 * 5. 控制界面切换和动画播放
 * 6. 管理 OCG/TCG 模式切换
 * ============================================
 */

// ====== 全局数据存储 ======
let packConfig = null;     // 卡包配置数据（来自 cards.json，包含 ocg 和 tcg 两组）
let changelogData = null;  // 更新日志数据
let currentPack = null;    // 当前选中的卡包配置
let currentPackCards = null; // 当前选中卡包的卡牌数据（来自 API 缓存）
let currentGameMode = 'ocg'; // 当前游戏模式：'ocg' 或 'tcg'，默认 OCG

// ====== 页面加载完成后初始化 ======
document.addEventListener('DOMContentLoaded', async function () {
    console.log('🚀 DOMContentLoaded 触发，开始初始化...');

    // 先绑定导航栏按钮事件（缓存、日志、模式切换），确保即使加载失败也能使用
    bindNavEvents();

    // 从本地存储读取上次的游戏模式（如果有的话）
    const savedMode = localStorage.getItem('ygo_game_mode');
    if (savedMode === 'tcg' || savedMode === 'ocg') {
        currentGameMode = savedMode;
    }
    // 更新切换按钮的激活状态
    updateModeButtons();

    try {
        showLoadingState('正在加载游戏配置...');
        console.log('📡 开始 fetch 配置文件...');

        // 同时加载两个配置文件，加快速度
        const [cardsResponse, changelogResponse] = await Promise.all([
            fetch('data/cards.json'),
            fetch('data/changelog.json')
        ]);

        console.log('📡 fetch 完成，cards.json status:', cardsResponse.status, ', changelog.json status:', changelogResponse.status);

        // 检查 HTTP 响应状态
        if (!cardsResponse.ok) {
            throw new Error(`加载 cards.json 失败: HTTP ${cardsResponse.status} ${cardsResponse.statusText}`);
        }
        if (!changelogResponse.ok) {
            throw new Error(`加载 changelog.json 失败: HTTP ${changelogResponse.status} ${changelogResponse.statusText}`);
        }

        packConfig = await cardsResponse.json();
        changelogData = await changelogResponse.json();
        console.log('✅ JSON 解析成功');
        console.log(`📦 OCG 卡包数量: ${packConfig.ocg.packs.length}`);
        console.log(`📦 TCG 卡包数量: ${packConfig.tcg.packs.length}`);

        // 初始化各个模块
        renderPackList();
        console.log('✅ renderPackList 完成');

        bindGameEvents();
        console.log('✅ bindGameEvents 完成');

        hideLoadingState();

        console.log(`🎴 YGO Pack Opener v0.3.0 初始化完成！当前模式: ${currentGameMode.toUpperCase()}`);

    } catch (error) {
        console.error('❌ 加载配置文件失败:', error);
        hideLoadingState();

        // 在卡包选择区域显示错误信息（不破坏整个 game-area 结构）
        const packListEl = document.getElementById('pack-list');
        if (packListEl) {
            packListEl.innerHTML =
                `<p style="text-align:center;color:#ff6b6b;padding:40px;grid-column:1/-1;">
                    ⚠️ 加载游戏数据失败，请检查 data 目录下的配置文件是否存在。
                    <br><br>错误详情: ${error.message}
                    <br><br><small style="color:#a0a0cc;">请打开浏览器控制台（F12）查看详细错误信息</small>
                </p>`;
        } else {
            document.querySelector('.game-area').innerHTML =
                `<p style="text-align:center;color:#ff6b6b;padding:40px;">
                    ⚠️ 加载游戏数据失败。<br><br>错误详情: ${error.message}
                </p>`;
        }
    }
});

// ====== 加载状态管理 ======

/** 显示加载中状态 */
function showLoadingState(message) {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl) {
        const textEl = loadingEl.querySelector('.loading-text');
        if (textEl) textEl.textContent = message || '加载中...';
        loadingEl.style.display = 'flex';
    }
}

/** 隐藏加载状态 */
function hideLoadingState() {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl) {
        loadingEl.style.display = 'none';
    }
}

/** 更新加载进度文本 */
function updateLoadingText(message) {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl) {
        const textEl = loadingEl.querySelector('.loading-text');
        if (textEl) textEl.textContent = message;
    }
}

// ====== 安全绑定事件的辅助函数 ======
/**
 * 安全地为 DOM 元素绑定事件
 * 如果元素不存在，会在控制台输出警告而不是报错崩溃
 * @param {string} id - 元素的 id
 * @param {string} event - 事件类型，如 'click'
 * @param {Function} handler - 事件处理函数
 */
function bindEvent(id, event, handler) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, handler);
    } else {
        console.warn(`⚠️ 未找到元素 #${id}，跳过事件绑定`);
    }
}

// ====== 绑定导航栏按钮事件（缓存、日志、模式切换） ======
function bindNavEvents() {
    // 更新日志
    bindEvent('btn-changelog', 'click', showChangelog);
    bindEvent('btn-close-changelog', 'click', hideChangelog);

    // 缓存管理
    bindEvent('btn-cache-manage', 'click', showCacheManage);
    bindEvent('btn-close-cache', 'click', hideCacheManage);
    bindEvent('btn-clear-cache', 'click', handleClearCache);

    // OCG / TCG 模式切换按钮
    bindEvent('btn-mode-ocg', 'click', function () { switchGameMode('ocg'); });
    bindEvent('btn-mode-tcg', 'click', function () { switchGameMode('tcg'); });

    // 点击弹窗外部关闭
    bindEvent('changelog-modal', 'click', function (e) {
        if (e.target === document.getElementById('changelog-modal')) hideChangelog();
    });
    bindEvent('cache-modal', 'click', function (e) {
        if (e.target === document.getElementById('cache-modal')) hideCacheManage();
    });

    console.log('✅ 导航栏事件绑定完成');
}

// ====== OCG / TCG 模式切换 ======

/**
 * 切换游戏模式
 * @param {string} mode - 'ocg' 或 'tcg'
 */
function switchGameMode(mode) {
    if (mode === currentGameMode) return; // 同一模式不重复切换

    currentGameMode = mode;
    // 保存到本地存储，下次打开网页时记住选择
    localStorage.setItem('ygo_game_mode', mode);

    // 更新按钮激活状态
    updateModeButtons();

    // 重置当前选中的卡包
    currentPack = null;
    currentPackCards = null;

    // 回到卡包选择界面并重新渲染
    if (packConfig) {
        renderPackList();
        switchSection('pack-select-section');
    }

    console.log(`🔄 游戏模式切换为: ${mode.toUpperCase()}`);
}

/**
 * 更新模式切换按钮的激活状态和模式提示文本
 */
function updateModeButtons() {
    const ocgBtn = document.getElementById('btn-mode-ocg');
    const tcgBtn = document.getElementById('btn-mode-tcg');
    const modeInfoText = document.getElementById('mode-info-text');

    if (ocgBtn) {
        ocgBtn.classList.toggle('active', currentGameMode === 'ocg');
    }
    if (tcgBtn) {
        tcgBtn.classList.toggle('active', currentGameMode === 'tcg');
    }

    // 更新模式提示文本
    if (modeInfoText) {
        if (currentGameMode === 'ocg') {
            modeInfoText.textContent = '🎌 OCG 模式（亚洲版） — 每包5张卡牌';
        } else {
            modeInfoText.textContent = '🌎 TCG 模式（欧美版） — 每包9张卡牌';
        }
    }
}

/**
 * 获取当前模式的卡包配置
 * @returns {object} 当前模式的配置（packs数组 + defaultRarityRates）
 */
function getCurrentModeConfig() {
    if (!packConfig) return null;
    return packConfig[currentGameMode] || packConfig.ocg;
}

// ====== 绑定游戏区域按钮事件 ======
function bindGameEvents() {
    // 开包按钮
    bindEvent('btn-open-pack', 'click', openPack);

    // 再开一包
    bindEvent('btn-open-again', 'click', openPack);

    // 返回选择卡包（两个返回按钮）
    bindEvent('btn-back-to-packs', 'click', showPackSelect);
    bindEvent('btn-back-from-result', 'click', showPackSelect);
}

// ====== 绑定所有按钮事件 ======
function bindEvents() {
    bindNavEvents();
    bindGameEvents();
}

// ============================================
// 卡包列表渲染
// ============================================

/**
 * 渲染卡包选择列表
 * 根据当前 OCG/TCG 模式，读取对应的 packs 数组，生成可点击的卡包卡片
 */
function renderPackList() {
    const packListEl = document.getElementById('pack-list');
    packListEl.innerHTML = '';

    const modeConfig = getCurrentModeConfig();
    if (!modeConfig || !modeConfig.packs) {
        packListEl.innerHTML = '<p style="text-align:center;color:var(--text-secondary);grid-column:1/-1;">当前模式下暂无可用卡包</p>';
        return;
    }

    modeConfig.packs.forEach(function (pack) {
        const packCard = document.createElement('div');
        packCard.className = 'pack-card';

        // 根据模式显示不同的图标
        const modeIcon = currentGameMode === 'ocg' ? '🎌' : '🌎';

        packCard.innerHTML = `
            <span class="pack-icon">🎴</span>
            <div class="pack-name">${pack.packName}</div>
            <div class="pack-code">${pack.setCode}</div>
            <div class="pack-count">每包 ${pack.cardsPerPack} 张 | ${pack.guaranteedRareSlot ? '保底R以上' : '纯随机'} ${modeIcon}</div>
        `;
        packCard.addEventListener('click', function () {
            selectPack(pack);
        });
        packListEl.appendChild(packCard);
    });
}

// ============================================
// 界面切换（显示/隐藏不同区域）
// ============================================

/** 选中一个卡包，开始加载卡牌数据 */
async function selectPack(pack) {
    currentPack = pack;

    // 显示加载状态
    showLoadingState(`正在加载卡包「${pack.packName}」的卡牌数据...`);

    try {
        // 通过 API 模块获取卡牌数据（自动缓存）
        const setData = await TCG_API.getCardSetData(pack.setCode);
        currentPackCards = setData.cards;

        // 更新开包界面信息
        const offlineTag = setData.isOfflineData ? ' [离线模式]' : '';
        const modeTag = currentGameMode === 'ocg' ? ' [OCG]' : ' [TCG]';
        document.getElementById('current-pack-name').textContent = pack.packName + modeTag + offlineTag;
        document.getElementById('current-pack-desc').textContent =
            `${pack.setCode} | 共 ${currentPackCards.length} 种卡牌 | 每包抽取 ${pack.cardsPerPack} 张${setData.isOfflineData ? '\n⚠️ 当前使用离线备用数据，联网后可获取完整卡牌数据和卡图' : ''}`;

        hideLoadingState();
        switchSection('open-pack-section');

        // 后台预加载卡图（不阻塞主流程，离线模式下跳过）
        if (!setData.isOfflineData) {
            TCG_API.preloadCardImages(currentPackCards, function (loaded, total) {
                console.log(`🖼️ 卡图预加载进度: ${loaded}/${total}`);
            });
        }

    } catch (error) {
        console.error('❌ 加载卡包数据失败:', error);
        hideLoadingState();
        alert(`加载卡包「${pack.packName}」失败。\n\n可能原因：\n1. 网络无法连接到 YGOProDeck API\n2. 该卡包没有对应的离线备用数据\n\n错误详情: ${error.message}`);
    }
}

/** 返回卡包选择界面 */
function showPackSelect() {
    currentPack = null;
    currentPackCards = null;
    switchSection('pack-select-section');
}

/**
 * 切换显示的区域
 * sectionId: 要显示的区域的 id
 */
function switchSection(sectionId) {
    // 隐藏所有区域
    const sections = ['pack-select-section', 'open-pack-section', 'result-section'];
    sections.forEach(function (id) {
        document.getElementById(id).style.display = 'none';
    });
    // 显示目标区域
    const target = document.getElementById(sectionId);
    target.style.display = 'block';
    // 重新触发动画
    target.style.animation = 'none';
    target.offsetHeight; // 强制浏览器重绘
    target.style.animation = '';
}

// ============================================
// 核心：开包抽卡逻辑
// ============================================

/**
 * 开包！这是游戏的核心功能
 * 步骤：
 * 1. 播放开包动画
 * 2. 根据稀有度权重随机抽取卡牌
 * 3. 展示抽到的卡牌（含卡图）
 */
async function openPack() {
    if (!currentPack || !currentPackCards) return;

    // 1. 播放开包动画
    await playOpeningAnimation();

    // 2. 抽取卡牌
    const drawnCards = drawCards(currentPack, currentPackCards);

    // 3. 展示结果
    await showResults(drawnCards);
}

/**
 * 根据稀有度权重随机抽取卡牌
 * 
 * 【工作原理（简单解释）】：
 * 假设 UR=3, SR=8, R=20, N=69，总共 100
 * 就好比一个转盘，各稀有度按权重占据不同面积
 * 每次随机转一下，看指针落在哪个区域，就抽到哪个稀有度的卡
 * 然后从该稀有度的卡牌中随机选一张
 * 
 * 如果开启了「保底R以上」，最后一张卡至少是 R 稀有度
 */
function drawCards(pack, cards) {
    // 使用卡包自己的概率配置，如果没有就用当前模式的默认值
    const modeConfig = getCurrentModeConfig();
    const rates = pack.rarityRates || modeConfig.defaultRarityRates;
    const results = [];

    // 按稀有度把卡牌分组
    const cardsByRarity = {};
    cards.forEach(function (card) {
        const code = card.rarityCode || 'N';
        if (!cardsByRarity[code]) {
            cardsByRarity[code] = [];
        }
        cardsByRarity[code].push(card);
    });

    // 计算总权重
    const rarities = Object.keys(rates);
    const totalWeight = rarities.reduce(function (sum, r) {
        return sum + rates[r];
    }, 0);

    // 抽取指定数量的卡牌
    for (let i = 0; i < pack.cardsPerPack; i++) {
        let selectedRarity;

        // 最后一张卡：如果开启保底，至少为 R
        if (i === pack.cardsPerPack - 1 && pack.guaranteedRareSlot) {
            selectedRarity = drawGuaranteedRare(rates, totalWeight);
        } else {
            selectedRarity = drawRandomRarity(rates, rarities, totalWeight);
        }

        // 如果该稀有度没有卡牌，降级到最近的有卡牌的稀有度
        if (!cardsByRarity[selectedRarity] || cardsByRarity[selectedRarity].length === 0) {
            selectedRarity = findAvailableRarity(cardsByRarity, selectedRarity);
        }

        // 从该稀有度中随机选一张卡
        const pool = cardsByRarity[selectedRarity];
        if (pool && pool.length > 0) {
            const card = pool[Math.floor(Math.random() * pool.length)];
            results.push({ ...card });
        }
    }

    // 按稀有度排序：N → R → SR → UR（最稀有的放后面，营造惊喜感）
    const rarityOrder = { 'N': 0, 'R': 1, 'SR': 2, 'UR': 3 };
    results.sort(function (a, b) {
        return (rarityOrder[a.rarityCode] || 0) - (rarityOrder[b.rarityCode] || 0);
    });

    return results;
}

/** 随机抽取一个稀有度 */
function drawRandomRarity(rates, rarities, totalWeight) {
    let random = Math.random() * totalWeight;
    for (let j = 0; j < rarities.length; j++) {
        random -= rates[rarities[j]];
        if (random <= 0) {
            return rarities[j];
        }
    }
    return 'N';
}

/** 保底抽取（至少 R 以上） */
function drawGuaranteedRare(rates, totalWeight) {
    // 只从 R、SR、UR 中按权重抽取
    const rareRates = { R: rates['R'] || 0, SR: rates['SR'] || 0, UR: rates['UR'] || 0 };
    const rareRarities = Object.keys(rareRates);
    const rareTotal = rareRarities.reduce(function (sum, r) { return sum + rareRates[r]; }, 0);

    if (rareTotal === 0) return 'R'; // 兜底

    let random = Math.random() * rareTotal;
    for (let j = 0; j < rareRarities.length; j++) {
        random -= rareRates[rareRarities[j]];
        if (random <= 0) {
            return rareRarities[j];
        }
    }
    return 'R';
}

/** 查找最近的有卡牌的稀有度 */
function findAvailableRarity(cardsByRarity, targetRarity) {
    // 优先尝试降级
    const fallbackOrder = ['N', 'R', 'SR', 'UR'];
    for (const r of fallbackOrder) {
        if (cardsByRarity[r] && cardsByRarity[r].length > 0) {
            return r;
        }
    }
    return 'N';
}

// ============================================
// 开包动画
// ============================================

/** 播放开包动画（等待动画播完再继续） */
function playOpeningAnimation() {
    return new Promise(function (resolve) {
        const overlay = document.getElementById('opening-overlay');
        overlay.style.display = 'flex';

        // 动画持续 1.5 秒后自动关闭
        setTimeout(function () {
            overlay.style.display = 'none';
            resolve();
        }, 1500);
    });
}

// ============================================
// 卡牌结果展示（带卡图）
// ============================================

/** 展示抽到的卡牌 */
async function showResults(cards) {
    const display = document.getElementById('cards-display');
    display.innerHTML = '';

    for (const card of cards) {
        const cardEl = document.createElement('div');
        const rarityCode = card.rarityCode || 'N';
        cardEl.className = `card-item rarity-${rarityCode}`;

        // 构建卡片 HTML
        let imageHtml;
        if (card.imageUrl) {
            // 使用 API 提供的卡图
            imageHtml = `<img class="card-image" src="${card.imageUrl}" alt="${card.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                         <span class="card-icon" style="display:none;">${getCardIcon(rarityCode)}</span>`;
        } else {
            // 没有卡图时显示图标
            imageHtml = `<span class="card-icon">${getCardIcon(rarityCode)}</span>`;
        }

        cardEl.innerHTML = `
            <span class="card-rarity-badge rarity-${rarityCode}">${rarityCode}</span>
            ${imageHtml}
            <span class="card-name">${card.name}</span>
        `;

        display.appendChild(cardEl);
    }

    switchSection('result-section');
}

/**
 * 根据稀有度返回不同的卡牌图标
 * 仅在卡图加载失败时显示
 */
function getCardIcon(rarity) {
    switch (rarity) {
        case 'UR': return '🌟';
        case 'SR': return '⭐';
        case 'R':  return '💎';
        case 'N':  return '🃏';
        default:   return '🃏';
    }
}

// ============================================
// 更新日志
// ============================================

/** 显示更新日志弹窗 */
function showChangelog() {
    const container = document.getElementById('changelog-content');
    container.innerHTML = '';

    if (!changelogData || !changelogData.versions) {
        container.innerHTML = '<p style="color:var(--text-secondary);">暂无更新日志</p>';
    } else {
        changelogData.versions.forEach(function (ver) {
            const versionEl = document.createElement('div');
            versionEl.className = 'changelog-version';

            let changesHTML = '';
            ver.changes.forEach(function (change) {
                changesHTML += `<li>${change}</li>`;
            });

            versionEl.innerHTML = `
                <div class="changelog-version-header">
                    <span class="changelog-version-tag">v${ver.version}</span>
                    <span class="changelog-version-date">${ver.date}</span>
                </div>
                <div class="changelog-version-title">${ver.title}</div>
                <ul class="changelog-changes">${changesHTML}</ul>
            `;

            container.appendChild(versionEl);
        });
    }

    document.getElementById('changelog-modal').classList.add('active');
}

/** 关闭更新日志弹窗 */
function hideChangelog() {
    document.getElementById('changelog-modal').classList.remove('active');
}

// ============================================
// 缓存管理界面
// ============================================

/** 显示缓存管理弹窗 */
async function showCacheManage() {
    const container = document.getElementById('cache-content');
    container.innerHTML = '<p style="color:var(--text-secondary);">正在获取缓存信息...</p>';

    document.getElementById('cache-modal').classList.add('active');

    try {
        const status = await TCG_API.getCacheStatus();

        let html = '';

        // 总体信息
        html += `<div class="cache-summary">`;
        html += `<p>📊 已缓存 <strong>${status.cardSets.length}</strong> 个卡包，共 <strong>${status.totalCards}</strong> 张卡牌数据</p>`;
        html += `<p>🖼️ 图片缓存：${status.imageCacheAvailable ? '✅ 可用' : '❌ 浏览器不支持'}</p>`;
        html += `<p>🎮 当前模式：<strong>${currentGameMode.toUpperCase()}</strong></p>`;
        html += `</div>`;

        // 各卡包详情
        if (status.cardSets.length > 0) {
            html += `<div class="cache-list">`;
            html += `<h3>已缓存的卡包：</h3>`;
            status.cardSets.forEach(function (set) {
                html += `<div class="cache-item">`;
                html += `<span class="cache-item-name">📦 ${set.setCode}</span>`;
                html += `<span class="cache-item-info">${set.cardCount} 张 | 缓存于 ${set.fetchedAt}</span>`;
                html += `</div>`;
            });
            html += `</div>`;
        } else {
            html += `<p style="color:var(--text-secondary);margin-top:12px;">暂无缓存数据。选择一个卡包后会自动缓存。</p>`;
        }

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<p style="color:#ff6b6b;">获取缓存信息失败: ${error.message}</p>`;
    }
}

/** 关闭缓存管理弹窗 */
function hideCacheManage() {
    document.getElementById('cache-modal').classList.remove('active');
}

/** 清除所有缓存 */
async function handleClearCache() {
    if (!confirm('确定要清除所有缓存数据吗？\n\n清除后下次打开卡包需要重新从网络下载数据。')) {
        return;
    }

    const success = await TCG_API.clearAllCache();
    if (success) {
        alert('✅ 缓存已清除！');
        showCacheManage(); // 刷新显示
    } else {
        alert('❌ 清除缓存失败，请重试。');
    }
}
