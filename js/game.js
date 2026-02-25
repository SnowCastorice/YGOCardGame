/**
 * ============================================
 * YGO Pack Opener - 游戏核心逻辑
 * 版本: 1.1.0
 * 
 * 【文件说明】
 * 这是游戏的"大脑"，负责：
 * 1. 读取卡包配置表（data/ocg/packs.json + data/tcg/packs.json）— OCG / TCG 独立管理
 * 2. 通过 API 模块获取卡牌数据（自动缓存到玩家设备）
 * 3. 读取更新日志（changelog.json）
 * 4. 实现开包抽卡逻辑（按稀有度权重随机抽取）
 * 5. 控制界面切换和动画播放
 * 6. 管理 OCG/TCG 模式切换
 * 7. 集成货币系统（开包消耗货币、货币兑换）
 * 8. 集成背包系统（开包卡片自动入库、查看收藏）
 * ============================================
 */

// ====== 全局数据存储 ======
let ocgPackConfig = null;    // OCG 卡包配置数据（来自 data/ocg/packs.json）
let tcgPackConfig = null;    // TCG 卡包配置数据（来自 data/tcg/packs.json）
let changelogData = null;    // 更新日志数据
let currentPack = null;      // 当前选中的卡包配置
let currentPackCards = null;  // 当前选中卡包的卡牌数据（来自 API 缓存）
let currentGameMode = 'ocg';  // 当前游戏模式：'ocg' 或 'tcg'，默认 OCG

// ====== 页面加载完成后初始化 ======
document.addEventListener('DOMContentLoaded', async function () {
    console.log('🚀 DOMContentLoaded 触发，开始初始化...');

    // 初始化货币系统（在绑定事件之前，确保余额数据已就绪）
    CurrencySystem.init();

    // 初始化背包系统
    InventorySystem.init();

    // 先绑定导航栏按钮事件（缓存、日志、模式切换、货币兑换），确保即使加载失败也能使用
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

        // 同时加载三个配置文件（OCG/TCG 独立存储），加快速度
        const [ocgResponse, tcgResponse, changelogResponse] = await Promise.all([
            fetch('data/ocg/packs.json'),
            fetch('data/tcg/packs.json'),
            fetch('data/changelog.json')
        ]);

        console.log('📡 fetch 完成，ocg/packs.json status:', ocgResponse.status, ', tcg/packs.json status:', tcgResponse.status, ', changelog.json status:', changelogResponse.status);

        // 检查 HTTP 响应状态
        if (!ocgResponse.ok) {
            throw new Error(`加载 ocg/packs.json 失败: HTTP ${ocgResponse.status} ${ocgResponse.statusText}`);
        }
        if (!tcgResponse.ok) {
            throw new Error(`加载 tcg/packs.json 失败: HTTP ${tcgResponse.status} ${tcgResponse.statusText}`);
        }
        if (!changelogResponse.ok) {
            throw new Error(`加载 changelog.json 失败: HTTP ${changelogResponse.status} ${changelogResponse.statusText}`);
        }

        ocgPackConfig = await ocgResponse.json();
        tcgPackConfig = await tcgResponse.json();
        changelogData = await changelogResponse.json();
        console.log('✅ JSON 解析成功');
        console.log(`📦 OCG 卡包数量: ${ocgPackConfig.packs.length}`);
        console.log(`📦 TCG 卡包数量: ${tcgPackConfig.packs.length}`);

        // 初始化各个模块
        renderPackList();
        console.log('✅ renderPackList 完成');

        bindGameEvents();
        console.log('✅ bindGameEvents 完成');

        bindCardImageViewer();
        console.log('✅ bindCardImageViewer 完成');

        // 更新货币 UI 显示
        CurrencySystem.updateUI();

        // 更新背包角标
        InventorySystem.updateBadge();

        hideLoadingState();

        console.log(`🎴 YGO Pack Opener v1.0.0 初始化完成！当前模式: ${currentGameMode.toUpperCase()}`);

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

    // 货币兑换
    bindEvent('btn-close-exchange', 'click', hideExchange);
    // 货币栏点击 → 打开兑换弹窗
    bindEvent('currency-item-gold', 'click', showExchange);
    bindEvent('currency-item-diamond', 'click', showExchange);

    // 背包
    bindEvent('btn-inventory', 'click', showInventory);
    bindEvent('btn-close-inventory', 'click', hideInventory);

    // 开发者工具
    bindEvent('btn-dev-tools', 'click', showDevTools);
    bindEvent('btn-close-devtools', 'click', hideDevTools);

    // 点击弹窗外部关闭
    bindEvent('changelog-modal', 'click', function (e) {
        if (e.target === document.getElementById('changelog-modal')) hideChangelog();
    });
    bindEvent('cache-modal', 'click', function (e) {
        if (e.target === document.getElementById('cache-modal')) hideCacheManage();
    });
    bindEvent('devtools-modal', 'click', function (e) {
        if (e.target === document.getElementById('devtools-modal')) hideDevTools();
    });
    bindEvent('exchange-modal', 'click', function (e) {
        if (e.target === document.getElementById('exchange-modal')) hideExchange();
    });
    bindEvent('inventory-modal', 'click', function (e) {
        if (e.target === document.getElementById('inventory-modal')) hideInventory();
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
    if (getCurrentModeConfig()) {
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
            modeInfoText.textContent = '🎌 OCG 模式（亚洲版） — 每包5张 | 中文名+日文名 | 数据源: YGOProDeck + YGOCDB';
        } else {
            modeInfoText.textContent = '🌎 TCG 模式（欧美版） — 每包9张 | 中文名+英文名 | 数据源: YGOProDeck + YGOCDB';
        }
    }
}

/**
 * 获取当前模式的卡包配置
 * @returns {object} 当前模式的配置（packs数组 + defaultRarityRates）
 */
function getCurrentModeConfig() {
    if (currentGameMode === 'ocg') {
        return ocgPackConfig || null;
    } else {
        return tcgPackConfig || null;
    }
}

// ====== 绑定游戏区域按钮事件 ======
function bindGameEvents() {
    // 开包按钮
    bindEvent('btn-open-pack', 'click', openPack);

    // 开十包按钮
    bindEvent('btn-open-multi', 'click', function () { openMultiPacks(10); });

    // 再开一包
    bindEvent('btn-open-again', 'click', openPack);

    // 再开十包
    bindEvent('btn-open-again-multi', 'click', function () { openMultiPacks(10); });

    // 返回选择卡包（两个返回按钮）
    bindEvent('btn-back-to-packs', 'click', showPackSelect);
    bindEvent('btn-back-from-result', 'click', showPackSelect);

    // 卡片预览（关闭按钮 + 遮罩层点击关闭）
    bindEvent('btn-close-card-preview', 'click', hideCardPreview);
    bindEvent('card-preview-modal', 'click', function (e) {
        if (e.target === document.getElementById('card-preview-modal')) hideCardPreview();
    });
}

// ====== 绑定所有按钮事件 ======
function bindEvents() {
    bindNavEvents();
    bindGameEvents();
    bindCardImageViewer();
}

// ============================================
// 卡片图片放大查看器
// ============================================

/**
 * 初始化卡片图片放大查看器
 * 
 * 【工作原理（简单解释）】
 * 使用事件委托：监听整个卡片展示区域的点击事件，
 * 如果点到了带 clickable 类的卡图，就打开全屏大图查看器。
 * 再次点击任意位置即可关闭。
 */
function bindCardImageViewer() {
    const viewer = document.getElementById('card-image-viewer');
    const viewerImage = viewer.querySelector('.viewer-image');
    const viewerName = viewer.querySelector('.viewer-card-name');
    const cardsDisplay = document.getElementById('cards-display');

    // 事件委托：监听卡片展示区域的点击
    cardsDisplay.addEventListener('click', function (e) {
        const img = e.target.closest('.card-image.clickable');
        if (!img) return;

        // 阻止事件冒泡到 card-item
        e.stopPropagation();

        // 获取大图 URL 和卡片名称
        const largeUrl = img.getAttribute('data-large-url');
        const cardName = img.getAttribute('data-card-name') || '';
        const foreignName = img.getAttribute('data-card-foreign') || '';

        if (!largeUrl) return;

        // 设置大图和名称
        viewerImage.src = largeUrl;
        viewerImage.alt = cardName;

        // 构建显示名称（中文名 + 外文名）
        let displayName = cardName;
        if (foreignName && foreignName !== cardName) {
            displayName += `<br><span style="font-size:0.8em;opacity:0.7;">${foreignName}</span>`;
        }
        viewerName.innerHTML = displayName;

        // 打开查看器（带过渡动画）
        viewer.classList.add('active');
    });

    // 事件委托：监听开发者工具 CDN 面板中的卡图点击（放大查看）
    var devtoolsCompareArea = document.getElementById('devtools-compare-area');
    if (devtoolsCompareArea) {
        devtoolsCompareArea.addEventListener('click', function (e) {
            var img = e.target.closest('.devtools-cdn-img-clickable');
            if (!img) return;

            e.stopPropagation();

            var imgSrc = img.src;
            var cdnName = img.getAttribute('data-cdn-name') || '';

            // 使用通用方法打开查看器
            openCardImageViewer(imgSrc, '', cdnName);
        });
    }

    // 点击查看器任意位置关闭
    viewer.addEventListener('click', function () {
        closeCardImageViewer();
    });

    // ESC 键也可以关闭
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && viewer.classList.contains('active')) {
            closeCardImageViewer();
        }
    });
}

/**
 * 打开卡片图片查看器（通用方法）
 * 可从开包结果或开发者工具中调用
 * 
 * @param {string} imgSrc - 图片 URL
 * @param {string} [cardName] - 卡片名称（可选）
 * @param {string} [subText] - 副标题文字（可选，如 CDN 源名称）
 */
function openCardImageViewer(imgSrc, cardName, subText) {
    var viewer = document.getElementById('card-image-viewer');
    var viewerImage = viewer.querySelector('.viewer-image');
    var viewerName = viewer.querySelector('.viewer-card-name');

    if (!imgSrc) return;

    viewerImage.src = imgSrc;
    viewerImage.alt = cardName || '卡牌大图';

    // 构建显示名称
    var displayName = cardName || '';
    if (subText) {
        displayName += (displayName ? '<br>' : '') + '<span style="font-size:0.8em;opacity:0.7;">' + subText + '</span>';
    }
    viewerName.innerHTML = displayName;

    // 打开查看器（带过渡动画）
    viewer.classList.add('active');
}

/** 关闭卡片图片查看器（带过渡动画） */
function closeCardImageViewer() {
    const viewer = document.getElementById('card-image-viewer');
    viewer.classList.remove('active');

    // 过渡动画结束后清除图片 src（释放内存）
    setTimeout(function () {
        const img = viewer.querySelector('.viewer-image');
        if (!viewer.classList.contains('active')) {
            img.src = '';
        }
    }, 400);
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

        // OCG 卡包显示 packCode，TCG 卡包显示 setCode
        const displayCode = pack.packCode || pack.setCode || pack.packId;
        // OCG 卡包显示卡牌数量（优先使用 totalCards 字段，兼容旧的 cardIds 方式）
        const cardCountInfo = pack.totalCards ? ` | ${pack.totalCards} 种卡` : (pack.cardIds ? ` | ${pack.cardIds.length} 种卡` : '');

        // 价格信息
        const currencyDef = CurrencySystem.getCurrencyDef(pack.currency || 'gold');
        const priceIcon = currencyDef ? currencyDef.icon : '🪙';
        const priceValue = pack.price || 0;

        // ——— 卡包封面图逻辑 ———
        // 优先级：packs.json 中的 coverImage > YGOProDeck set_image > 卡包首卡卡图 > emoji fallback
        const packCode = pack.packCode || pack.setCode || '';
        const coverImageUrl = getPackCoverImageUrl(pack, packCode);

        packCard.innerHTML = `
            <div class="pack-cover-wrapper">
                <div class="pack-cover-container">
                    <img class="pack-cover-img" src="${coverImageUrl}" alt="${pack.packName}" loading="lazy"
                         referrerpolicy="no-referrer"
                         onerror="handlePackCoverError(this);" />
                    <span class="pack-icon pack-icon-fallback" style="display:none;">🎴</span>
                    <div class="pack-price pack-overlay-tag"><span class="pack-price-icon">${priceIcon}</span> ${priceValue}</div>
                    <button class="btn-pack-preview pack-overlay-tag" title="查看卡包内所有卡片">🔍 预览</button>
                </div>
            </div>
            <div class="pack-name">${(currentGameMode === 'ocg' && pack.packNameJP) ? pack.packNameJP : pack.packName}</div>
            <div class="pack-code">${(currentGameMode === 'ocg' && pack.packNameJP) ? pack.packName + '<br>' : ''}${displayCode}${pack.releaseDate ? ' (' + pack.releaseDate + ')' : ''}</div>
            <div class="pack-count">每包 ${pack.cardsPerPack} 张${cardCountInfo} | ${pack.guaranteedRareSlot ? '保底R以上' : '纯随机'} ${modeIcon}</div>
        `;

        // 将 pack 数据绑定到 DOM 元素上，供 onerror 回调使用
        const imgEl = packCard.querySelector('.pack-cover-img');
        if (imgEl) imgEl._packData = pack;

        // 预览按钮点击事件（阻止冒泡，不触发 selectPack）
        const previewBtn = packCard.querySelector('.btn-pack-preview');
        previewBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            showCardPreview(pack);
        });

        packCard.addEventListener('click', function () {
            selectPack(pack);
        });
        packListEl.appendChild(packCard);

        // OCG 卡包：预加载 cardFile 获取首卡 ID，缓存到 pack 对象上（Promise 供 onerror 回调等待）
        if (currentGameMode === 'ocg' && !pack.coverCardId && pack.cardFile) {
            pack._coverCardIdPromise = preloadOcgCoverCardId(pack);
        }
        // TCG 卡包：预加载首卡 ID 作为封面图 fallback（通过 YGOProDeck API 获取首卡）
        if (currentGameMode === 'tcg' && !pack.coverCardId && pack.setCode) {
            pack._coverCardIdPromise = preloadTcgCoverCardId(pack);
        }
    });
}

/**
 * 获取卡包封面图 URL
 * 优先级：coverImage > coverCardId 卡图 > YGOProDeck set_image > 空占位
 */
function getPackCoverImageUrl(pack, packCode) {
    // 1. 如果 packs.json 中手动配置了 coverImage（如 Yugipedia 日文封面 URL），直接使用
    if (pack.coverImage) {
        return pack.coverImage;
    }

    // 2. 如果配置了 coverCardId，使用该卡的卡图作为封面
    if (pack.coverCardId) {
        if (currentGameMode === 'ocg') {
            return `https://cdn.233.momobako.com/ygopro/pics/${pack.coverCardId}.jpg`;
        } else {
            return `https://images.ygoprodeck.com/images/cards_small/${pack.coverCardId}.jpg`;
        }
    }

    // 3. TCG 卡包：使用 YGOProDeck 官方卡包封面图（优先 packCode 短代码，fallback 编码后的 setCode）
    if (currentGameMode === 'tcg') {
        const tcgCode = pack.packCode || '';
        if (tcgCode) {
            return `https://images.ygoprodeck.com/images/sets/${encodeURIComponent(tcgCode)}.jpg`;
        }
    }

    // 4. OCG 卡包：先尝试 YGOProDeck set_image（部分 OCG 卡包有 TCG 同版）
    if (packCode) {
        return `https://images.ygoprodeck.com/images/sets/${encodeURIComponent(packCode)}.jpg`;
    }

    return '';
}

/**
 * 卡包封面图加载失败时的处理函数
 * 如果 pack 有异步预加载 Promise（OCG 卡包），等待其完成后用首卡卡图替代
 * 否则直接显示 emoji fallback
 */
async function handlePackCoverError(imgEl) {
    const pack = imgEl._packData;
    const fallbackIcon = imgEl.nextElementSibling;
    const failedUrl = imgEl.src;

    console.warn(`⚠️ 卡包封面图加载失败: ${pack ? pack.packId : '未知'}, URL: ${failedUrl}`);

    // ——— OCG 本地封面图 fallback ———
    // 如果当前失败的不是本地 covers 路径，且卡包有 packCode，尝试加载本地封面图
    // 本地封面图路径：data/ocg/covers/{packCode}.png（或 .jpg/.webp）
    if (currentGameMode === 'ocg' && pack && pack.packCode && !failedUrl.includes('data/ocg/covers/')) {
        const localCoverUrl = `data/ocg/covers/${pack.packCode}.png`;
        console.log(`🔄 尝试本地封面图: ${pack.packId}, URL: ${localCoverUrl}`);
        imgEl.src = localCoverUrl;
        // 本地封面图也失败时，继续走后续 fallback（首卡卡图 → emoji）
        imgEl.onerror = function () {
            handlePackCoverErrorFinal(imgEl);
        };
        return;
    }

    // ——— 首卡卡图 / emoji fallback ———
    await handlePackCoverErrorFinal(imgEl);
}

/**
 * 卡包封面图最终 fallback：首卡卡图 → emoji
 * 从 handlePackCoverError 中抽出，供本地 covers 失败后继续调用
 */
async function handlePackCoverErrorFinal(imgEl) {
    const pack = imgEl._packData;
    const fallbackIcon = imgEl.nextElementSibling;

    // 如果有正在进行的预加载 Promise，等待其完成
    if (pack && pack._coverCardIdPromise) {
        await pack._coverCardIdPromise;
        pack._coverCardIdPromise = null; // 防止重复等待
    }

    // 如果已有缓存的首卡 ID，尝试用首卡卡图替代
    if (pack && pack._coverCardId) {
        const cardImgUrl = currentGameMode === 'ocg'
            ? `https://cdn.233.momobako.com/ygopro/pics/${pack._coverCardId}.jpg`
            : `https://images.ygoprodeck.com/images/cards_small/${pack._coverCardId}.jpg`;
        console.log(`🔄 使用首卡卡图替代: ${pack.packId}, cardId: ${pack._coverCardId}`);
        imgEl.referrerPolicy = 'no-referrer';
        imgEl.src = cardImgUrl;
        // 下次失败就直接显示 emoji
        imgEl.onerror = function () {
            console.warn(`⚠️ 首卡卡图也加载失败: ${pack.packId}, URL: ${cardImgUrl}`);
            imgEl.style.display = 'none';
            if (fallbackIcon) fallbackIcon.style.display = 'block';
        };
        // 清除 _coverCardId 防止无限循环
        pack._coverCardId = null;
        return;
    }

    // 没有备选图源，显示 emoji fallback
    console.warn(`⚠️ 无备选图源，显示 emoji 兜底: ${pack ? pack.packId : '未知'}`);
    imgEl.style.display = 'none';
    if (fallbackIcon) fallbackIcon.style.display = 'block';
}

/**
 * OCG 卡包：预加载 cardFile，获取首张卡 ID 并缓存到 pack 对象上
 * 当 YGOProDeck set_image 加载失败触发 onerror 时，handlePackCoverError 可使用此 ID
 */
async function preloadOcgCoverCardId(pack) {
    try {
        const cardFileUrl = `data/ocg/cards/${pack.cardFile}`;
        const response = await fetch(cardFileUrl);
        if (!response.ok) return;
        const cardFileData = await response.json();
        if (cardFileData.cardIds && cardFileData.cardIds.length > 0) {
            // 将首卡 ID 缓存到 pack 对象上
            pack._coverCardId = cardFileData.cardIds[0].id || cardFileData.cardIds[0];
        }
    } catch (e) {
        console.warn(`⚠️ 预加载 OCG 卡包 ${pack.packId} 首卡ID失败:`, e);
    }
}

/**
 * TCG 卡包：通过 YGOProDeck API 获取首张卡 ID 并缓存到 pack 对象上
 * 当 YGOProDeck set_image 加载失败时，handlePackCoverError 可使用此 ID 显示首卡卡图作为封面
 * 使用 num=1 参数只获取一张卡，减少 API 负担
 */
async function preloadTcgCoverCardId(pack) {
    try {
        // 仅查询 IndexedDB 缓存，不发送额外 API 请求（避免 CORS / 限流问题）
        // 用户打开过该卡包后，缓存中就会有数据，下次回到卡包列表时封面图即可显示
        if (typeof TCG_API !== 'undefined' && TCG_API.getCachedSetData) {
            const cached = await TCG_API.getCachedSetData(pack.setCode);
            if (cached && cached.cards && cached.cards.length > 0) {
                pack._coverCardId = cached.cards[0].id;
                return;
            }
        }
        // 无缓存时不做额外请求，依赖 packCode 对应的 set_image 封面图
        // 如果 set_image 也加载失败，则显示 emoji 兜底
    } catch (e) {
        console.warn(`⚠️ 预加载 TCG 卡包 ${pack.packId} 首卡ID失败:`, e);
    }
}

// ============================================
// 界面切换（显示/隐藏不同区域）
// ============================================

/** 选中一个卡包，开始加载卡牌数据 */
async function selectPack(pack) {
    currentPack = pack;

    // 显示加载状态
    const dataSourceName = 'YGOProDeck + YGOCDB';
    showLoadingState(`正在从 ${dataSourceName} 加载「${pack.packName}」...`);

    try {
        // OCG 模式：如果卡包使用独立文件存储 cardIds，先动态加载
        if (currentGameMode === 'ocg' && pack.cardFile && !pack.cardIds) {
            updateLoadingText(`正在加载「${pack.packName}」卡牌列表...`);
            const cardFileUrl = `data/ocg/cards/${pack.cardFile}`;
            const cardFileResponse = await fetch(cardFileUrl);
            if (!cardFileResponse.ok) {
                throw new Error(`加载卡牌文件失败: ${cardFileUrl} (HTTP ${cardFileResponse.status})`);
            }
            const cardFileData = await cardFileResponse.json();
            // 将 cardIds 注入到 pack 对象中，供 API 模块使用
            pack.cardIds = cardFileData.cardIds;
            console.log(`📄 已加载独立卡牌文件 [${pack.cardFile}]，共 ${pack.cardIds.length} 张卡`);
        }

        // 通过 API 模块获取卡牌数据（根据模式选择不同数据源）
        const setData = await TCG_API.getCardSetData(currentGameMode, pack, function (loaded, total) {
            // OCG 模式下显示逐张卡牌的加载进度
            updateLoadingText(`正在从 ${dataSourceName} 加载「${pack.packName}」... (${loaded}/${total})`);
        });
        currentPackCards = setData.cards;

        // 更新开包界面信息
        const offlineTag = setData.isOfflineData ? ' [离线模式]' : '';
        const modeTag = currentGameMode === 'ocg' ? ' [OCG]' : ' [TCG]';
        document.getElementById('current-pack-name').textContent = pack.packName + modeTag + offlineTag;

        const displayCode = pack.packCode || pack.setCode || pack.packId;
        document.getElementById('current-pack-desc').textContent =
            `${displayCode} | 共 ${currentPackCards.length} 种卡牌 | 每包抽取 ${pack.cardsPerPack} 张 | 数据: ${dataSourceName}${setData.isOfflineData ? '\n⚠️ 当前使用离线备用数据' : ''}`;

        // 显示开包价格信息
        updateOpenPackPriceInfo();

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
        const apiName = currentGameMode === 'ocg' ? 'YGOProDeck' : 'YGOProDeck';
        alert(`加载卡包「${pack.packName}」失败。\n\n可能原因：\n1. 网络无法连接到 ${apiName} API\n2. 该卡包没有对应的离线备用数据\n\n错误详情: ${error.message}`);
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
 * 1. 检查货币余额是否足够
 * 2. 扣除货币
 * 3. 播放开包动画
 * 4. 根据稀有度权重随机抽取卡牌
 * 5. 展示抽到的卡牌（含卡图）
 */
async function openPack() {
    if (!currentPack || !currentPackCards) return;

    // 1. 检查货币余额
    const currency = currentPack.currency || 'gold';
    const price = currentPack.price || 0;

    if (price > 0 && !CurrencySystem.canAfford(currency, price)) {
        const currDef = CurrencySystem.getCurrencyDef(currency);
        alert(`${currDef.icon} ${currDef.name}不足！\n\n开包需要 ${price} ${currDef.icon}${currDef.name}，当前只有 ${CurrencySystem.getBalance(currency)} ${currDef.icon}。\n\n点击顶部货币栏可以进行兑换。`);
        return;
    }

    // 2. 扣除货币
    if (price > 0) {
        CurrencySystem.spendBalance(currency, price);
    }

    // 3. 播放开包动画
    await playOpeningAnimation();

    // 4. 抽取卡牌
    const drawnCards = drawCards(currentPack, currentPackCards);

    // 5. 将抽到的卡片存入背包
    InventorySystem.addCards(drawnCards);

    // 6. 展示结果
    await showResults(drawnCards);

    // 更新价格信息（余额可能变化）
    updateOpenPackPriceInfo();
}

/**
 * 开十包（批量开包）
 * 一次性开 count 包，所有卡片汇总展示
 * @param {number} count - 开包数量
 */
async function openMultiPacks(count) {
    if (!currentPack || !currentPackCards) return;

    const currency = currentPack.currency || 'gold';
    const price = currentPack.price || 0;
    const totalPrice = price * count;

    // 1. 检查总费用
    if (totalPrice > 0 && !CurrencySystem.canAfford(currency, totalPrice)) {
        const currDef = CurrencySystem.getCurrencyDef(currency);
        const balance = CurrencySystem.getBalance(currency);
        // 计算当前余额最多能开几包
        const affordCount = price > 0 ? Math.floor(balance / price) : count;
        if (affordCount <= 0) {
            alert(`${currDef.icon} ${currDef.name}不足！\n\n开${count}包需要 ${totalPrice} ${currDef.icon}${currDef.name}，当前只有 ${balance} ${currDef.icon}。\n\n点击顶部货币栏可以进行兑换。`);
            return;
        }
        // 余额不足以开满，询问是否开能负担的数量
        const confirmOpen = confirm(`${currDef.icon} ${currDef.name}不足以开${count}包（需要 ${totalPrice}，当前 ${balance}）。\n\n是否改为开 ${affordCount} 包？（花费 ${affordCount * price} ${currDef.icon}）`);
        if (!confirmOpen) return;
        count = affordCount;
    }

    // 2. 扣除总费用
    const actualTotalPrice = price * count;
    if (actualTotalPrice > 0) {
        CurrencySystem.spendBalance(currency, actualTotalPrice);
    }

    // 3. 播放开包动画
    await playOpeningAnimation();

    // 4. 批量抽卡，汇总所有结果
    const allCards = [];
    for (let i = 0; i < count; i++) {
        const drawnCards = drawCards(currentPack, currentPackCards);
        allCards.push(...drawnCards);
    }

    // 5. 将抽到的卡片存入背包
    InventorySystem.addCards(allCards);

    // 6. 展示汇总结果
    await showResults(allCards);

    // 更新价格信息（余额可能变化）
    updateOpenPackPriceInfo();
}

/**
 * 抽卡入口 —— 根据卡包的 packScheme 分发到不同的抽卡方案
 * 
 * 【方案说明】
 * - ocg_default：OCG 默认方案 → 4张N卡 + 1张非N稀有卡，同包编号不重复，支持多版本稀有度随机
 * - legacy：旧版方案 → 所有位置按 rarityRates 权重随机稀有度（兼容 TCG 和未配置的卡包）
 */
function drawCards(pack, cards) {
    const scheme = pack.packScheme || 'legacy';

    if (scheme === 'ocg_default') {
        return drawCards_OCG(pack, cards);
    }
    return drawCards_Legacy(pack, cards);
}

// ============================================
// OCG 默认方案：4N + 1非N + 多版本稀有度
// ============================================

/**
 * OCG 默认抽卡方案
 * 
 * 【流程】
 * 1. 把卡池分为 N卡池 和 非N卡池（按 rarityCode 判断）
 * 2. 从 N卡池 随机抽 4 张（编号不重复）
 * 3. 从 非N卡池 随机抽 1 张（编号不与已抽的重复）
 * 4. 对非N卡检查 rarityVersions：
 *    - 只有1个版本 → 直接使用
 *    - 有多个版本 → 按 versionOdds 概率随机选一个稀有度
 * 5. 按稀有度排序展示
 */
function drawCards_OCG(pack, cards) {
    const results = [];
    const usedSetNumbers = new Set(); // 已选编号，防止同包重复

    // 按基础稀有度（rarityCode）把卡分成 N池 和 非N池
    const nPool = [];
    const nonNPool = [];
    cards.forEach(function (card) {
        const code = card.rarityCode || 'N';
        if (code === 'N') {
            nPool.push(card);
        } else {
            nonNPool.push(card);
        }
    });

    // 获取多版本稀有度概率配置
    const modeConfig = getCurrentModeConfig();
    const versionOdds = pack.versionOdds || modeConfig.defaultVersionOdds || {};

    // 计算需要抽几张N卡（总数 - 1张非N位）
    const nCount = pack.cardsPerPack - 1;

    // --- 步骤1：从N池随机抽 nCount 张（编号不重复）---
    const shuffledN = shuffleArray([...nPool]);
    for (let i = 0; i < shuffledN.length && results.length < nCount; i++) {
        const card = shuffledN[i];
        const setNum = card.setNumber || card.id;
        if (!usedSetNumbers.has(setNum)) {
            usedSetNumbers.add(setNum);
            // N卡也可能有多版本（如 NR/PSER），同样走版本随机
            const finalCard = resolveCardVersion(card, versionOdds);
            results.push(finalCard);
        }
    }

    // N池不够时兜底：用非N池补充
    if (results.length < nCount) {
        const shuffledNonN = shuffleArray([...nonNPool]);
        for (let i = 0; i < shuffledNonN.length && results.length < nCount; i++) {
            const card = shuffledNonN[i];
            const setNum = card.setNumber || card.id;
            if (!usedSetNumbers.has(setNum)) {
                usedSetNumbers.add(setNum);
                const finalCard = resolveCardVersion(card, versionOdds);
                results.push(finalCard);
            }
        }
    }

    // --- 步骤2：从非N池随机抽 1 张（编号不与已抽的重复）---
    const availableNonN = nonNPool.filter(function (card) {
        const setNum = card.setNumber || card.id;
        return !usedSetNumbers.has(setNum);
    });

    if (availableNonN.length > 0) {
        const picked = availableNonN[Math.floor(Math.random() * availableNonN.length)];
        const setNum = picked.setNumber || picked.id;
        usedSetNumbers.add(setNum);
        // 对非N卡进行多版本稀有度随机
        const finalCard = resolveCardVersion(picked, versionOdds);
        results.push(finalCard);
    } else {
        // 非N池为空的极端情况（理论上不会出现），从N池兜底
        const fallbackN = nPool.filter(function (card) {
            return !usedSetNumbers.has(card.setNumber || card.id);
        });
        if (fallbackN.length > 0) {
            const picked = fallbackN[Math.floor(Math.random() * fallbackN.length)];
            results.push(resolveCardVersion(picked, versionOdds));
        }
    }

    // --- 步骤3：按稀有度排序（N在前，最稀有的在后面，营造惊喜感）---
    const rarityOrder = { 'N': 0, 'NR': 1, 'R': 2, 'SR': 3, 'UR': 4, 'SER': 5, 'UTR': 6, 'PSER': 7 };
    results.sort(function (a, b) {
        return (rarityOrder[a.rarityCode] || 0) - (rarityOrder[b.rarityCode] || 0);
    });

    return results;
}

/**
 * 多版本稀有度随机 —— 根据 versionOdds 从 rarityVersions 中选一个
 * 
 * 【举例】
 * 一张卡的 rarityVersions = ["SR", "SER", "PSER"]
 * versionOdds = { SR: 80, SER: 10, PSER: 3 }
 * → 总权重 = 80 + 10 + 3 = 93
 * → SR 约 86%, SER 约 10.8%, PSER 约 3.2%
 * 
 * @param {Object} card - 原始卡牌数据
 * @param {Object} versionOdds - 各稀有度的概率权重
 * @returns {Object} 带最终稀有度的卡牌副本
 */
function resolveCardVersion(card, versionOdds) {
    const versions = card.rarityVersions;
    const result = { ...card };

    // 没有 rarityVersions 或只有1个版本，直接返回
    if (!versions || versions.length <= 1) {
        return result;
    }

    // 收集各版本的权重
    const weights = [];
    let totalWeight = 0;
    for (let i = 0; i < versions.length; i++) {
        const w = versionOdds[versions[i]] || 1; // 未配置的稀有度默认权重1
        weights.push(w);
        totalWeight += w;
    }

    // 按权重随机选择
    let random = Math.random() * totalWeight;
    for (let i = 0; i < versions.length; i++) {
        random -= weights[i];
        if (random <= 0) {
            result.rarityCode = versions[i];
            return result;
        }
    }

    // 兜底：返回最后一个版本
    result.rarityCode = versions[versions.length - 1];
    return result;
}

/**
 * 数组洗牌（Fisher-Yates 算法）
 * @param {Array} arr - 要洗牌的数组（会创建副本，不修改原数组）
 * @returns {Array} 洗牌后的新数组
 */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

// ============================================
// 旧版方案：按权重随机稀有度（兼容 TCG / legacy 卡包）
// ============================================

/**
 * 旧版抽卡方案 —— 按 rarityRates 权重随机
 * 
 * 【工作原理】
 * 假设 UR=3, SR=8, R=20, N=69，总共 100
 * 就好比一个转盘，各稀有度按权重占据不同面积
 * 每次随机转一下，看指针落在哪个区域，就抽到哪个稀有度的卡
 * 然后从该稀有度的卡牌中随机选一张
 * 
 * 如果开启了「保底R以上」，最后一张卡至少是 R 稀有度
 */
function drawCards_Legacy(pack, cards) {
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

    // 按稀有度排序：N → NR → R → SR → UR → SER → UTR → PSER
    const rarityOrder = { 'N': 0, 'NR': 1, 'R': 2, 'SR': 3, 'UR': 4, 'SER': 5, 'UTR': 6, 'PSER': 7 };
    results.sort(function (a, b) {
        return (rarityOrder[a.rarityCode] || 0) - (rarityOrder[b.rarityCode] || 0);
    });

    return results;
}

/** 随机抽取一个稀有度（旧版方案用） */
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

/** 保底抽取：至少 R 以上（旧版方案用） */
function drawGuaranteedRare(rates, totalWeight) {
    const rareRates = { R: rates['R'] || 0, SR: rates['SR'] || 0, UR: rates['UR'] || 0 };
    const rareRarities = Object.keys(rareRates);
    const rareTotal = rareRarities.reduce(function (sum, r) { return sum + rareRates[r]; }, 0);

    if (rareTotal === 0) return 'R';

    let random = Math.random() * rareTotal;
    for (let j = 0; j < rareRarities.length; j++) {
        random -= rareRates[rareRarities[j]];
        if (random <= 0) {
            return rareRarities[j];
        }
    }
    return 'R';
}

/** 查找最近的有卡牌的稀有度（旧版方案用） */
function findAvailableRarity(cardsByRarity, targetRarity) {
    const fallbackOrder = ['N', 'NR', 'R', 'SR', 'UR', 'SER', 'UTR', 'PSER'];
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

    // 稀有度排序优先级（数字越大越稀有，排在越前面）
    const RARITY_RANK = {
        'N': 0,
        'NR': 1,
        'R': 2,
        'SR': 3,
        'UR': 4,
        'SER': 5,
        'UTR': 6,
        'PSER': 7
    };

    // 多包模式下按稀有度从高到低排序
    if (cards.length > 5) {
        cards.sort((a, b) => {
            const rankA = RARITY_RANK[a.rarityCode] ?? 0;
            const rankB = RARITY_RANK[b.rarityCode] ?? 0;
            return rankB - rankA;
        });
    }

    // 计算每张卡的动画延迟，总时长不超过 2 秒
    const maxTotalDelay = 2; // 秒
    const perCardDelay = Math.min(.15, maxTotalDelay / cards.length);

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const cardEl = document.createElement('div');
        const rarityCode = card.rarityCode || 'N';
        cardEl.className = `card-item rarity-${rarityCode}`;
        // 动态设置动画延迟（覆盖 CSS nth-child 规则）
        cardEl.style.animationDelay = (i * perCardDelay).toFixed(2) + 's';

        // 构建卡片 HTML
        // 有卡图时，点击图片可放大查看（使用 imageLargeUrl 作为大图源）
        let imageHtml;
        if (card.imageUrl) {
            const largeUrl = card.imageLargeUrl || card.imageUrl;
            const cardName = card.nameCN || card.name;
            const foreignName = card.nameOriginal || '';
            // 使用 API 提供的卡图，添加 clickable 类和 data 属性供放大查看
            imageHtml = `<img class="card-image clickable" src="${card.imageUrl}" alt="${cardName}" loading="lazy" 
                              data-large-url="${largeUrl}" data-card-name="${cardName}" data-card-foreign="${foreignName}"
                              onerror="this.style.display='none';this.classList.remove('clickable');this.nextElementSibling.style.display='block';">
                         <span class="card-icon" style="display:none;">${getCardIcon(rarityCode)}</span>`;
        } else {
            // 没有卡图时显示图标
            imageHtml = `<span class="card-icon">${getCardIcon(rarityCode)}</span>`;
        }

        // 构建双语卡名显示
        // 如果有中文名：中文名（主） + 外文名（副）
        // 如果没有中文名：只显示外文名
        let nameHtml;
        if (card.nameCN && card.nameCN !== card.nameOriginal) {
            // 有中文名，双语展示
            nameHtml = `<span class="card-name-cn">${card.nameCN}</span>
                        <span class="card-name-foreign">${card.nameOriginal || card.name}</span>`;
        } else {
            // 没有中文名，只显示原始名
            nameHtml = `<span class="card-name-single">${card.name}</span>`;
        }

        cardEl.innerHTML = `
            <span class="card-rarity-badge rarity-${rarityCode}">${rarityCode}</span>
            ${imageHtml}
            <div class="card-name-wrapper">
                ${nameHtml}
            </div>
        `;

        display.appendChild(cardEl);
    }

    // 更新结果标题（根据卡片数量判断是否为批量开包）
    const cardsPerPack = (currentPack && currentPack.cardsPerPack) || 5;
    const packCount = Math.round(cards.length / cardsPerPack);
    const resultTitle = document.querySelector('#result-section .section-title');
    if (resultTitle) {
        resultTitle.textContent = packCount > 1 ? `开包结果 (×${packCount})` : '开包结果';
    }

    switchSection('result-section');

    // 滚动到顶部，方便查看结果
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
                const sourceIcon = set.dataSource === 'ygocdb' ? '🎌' : set.dataSource === 'ygoprodeck' ? '🌎' : '📦';
                html += `<div class="cache-item">`;
                html += `<span class="cache-item-name">${sourceIcon} ${set.setCode}</span>`;
                html += `<span class="cache-item-info">${set.cardCount} 张 | ${set.dataSource || '未知来源'} | ${set.fetchedAt}</span>`;
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

/**
 * 开发者工具：添加 10000 金币
 */
function devAddGold() {
    try {
        CurrencySystem.addBalance('gold', 10000);
        CurrencySystem.updateUI();
        alert('✅ 已添加 10000 🪙 金币！');
        console.log('🛠️ [开发者工具] 添加 10000 金币');
    } catch (error) {
        console.error('❌ 添加金币失败:', error);
        alert('❌ 添加金币失败：' + error.message);
    }
}

/**
 * 开发者工具：重置游戏（重置货币余额至初始值，不清除缓存）
 */
function devResetGame() {
    if (!confirm('❗ 确定要重置游戏吗？\n\n这将重置以下数据：\n• 🪙 金币恢复为初始值\n• 💎 钻石恢复为初始值\n• 🎒 背包清空所有卡片\n\n⚠️ 不会清除缓存数据。若需清除缓存，请前往「💾 缓存管理」。')) {
        return;
    }

    try {
        CurrencySystem.resetAll();
        CurrencySystem.updateUI();
        // 重置背包
        InventorySystem.clearAll();
        alert('✅ 游戏已重置！货币已恢复为初始值，背包已清空。');
        console.log('🛠️ [开发者工具] 游戏已重置（含背包清空）');
    } catch (error) {
        console.error('❌ 重置游戏失败:', error);
        alert('❌ 重置失败：' + error.message);
    }
}
// ============================================
// 货币兑换弹窗
// ============================================

/** 显示货币兑换弹窗 */
function showExchange() {
    const container = document.getElementById('exchange-content');
    const defs = CurrencySystem.getCurrencyDefs();
    const rates = CurrencySystem.getAllExchangeRates();

    let html = '';

    // 当前余额展示
    html += '<div class="exchange-balance-display">';
    Object.keys(defs).forEach(function (id) {
        const def = defs[id];
        html += '<div class="exchange-balance-item">';
        html += `<span class="exchange-balance-icon">${def.icon}</span>`;
        html += `<span class="exchange-balance-value" id="exchange-display-${id}">${CurrencySystem.getBalance(id)}</span>`;
        html += `<span class="exchange-balance-name">${def.name}</span>`;
        html += '</div>';
    });
    html += '</div>';

    // 兑换操作区（为每种兑换方向生成一个区域）
    Object.keys(rates).forEach(function (rateKey) {
        const rate = rates[rateKey];
        const parts = rateKey.split('_');
        const fromId = parts[0];
        const toId = parts[1];
        const fromDef = defs[fromId];
        const toDef = defs[toId];

        if (!fromDef || !toDef) return;

        html += '<div class="exchange-section">';
        html += `<div class="exchange-section-title">${fromDef.icon} ${fromDef.name} → ${toDef.icon} ${toDef.name}</div>`;
        html += `<div class="exchange-rate-info">兑换比例: ${rate.from} ${fromDef.icon} = ${rate.to} ${toDef.icon}</div>`;
        html += '<div class="exchange-controls">';
        html += '<div class="exchange-input-group">';
        html += `<label>兑换次数:</label>`;
        html += `<input type="number" class="exchange-input" id="exchange-times-${rateKey}" value="1" min="1" max="9999" />`;
        html += '</div>';
        html += `<div class="exchange-preview" id="exchange-preview-${rateKey}">消耗 ${rate.from} ${fromDef.icon} → 获得 ${rate.to} ${toDef.icon}</div>`;
        html += '</div>';
        html += '<div class="exchange-btn-group">';
        html += `<button class="btn-exchange" id="exchange-btn-${rateKey}" data-rate-key="${rateKey}">确认兑换</button>`;
        html += `<button class="btn-exchange-max" id="exchange-max-${rateKey}" data-rate-key="${rateKey}">全部兑换</button>`;
        html += '</div>';
        html += `<div id="exchange-result-${rateKey}"></div>`;
        html += '</div>';
    });

    container.innerHTML = html;

    // 绑定兑换事件
    Object.keys(rates).forEach(function (rateKey) {
        const rate = rates[rateKey];
        const parts = rateKey.split('_');
        const fromId = parts[0];
        const toId = parts[1];
        const fromDef = defs[fromId];
        const toDef = defs[toId];

        const timesInput = document.getElementById(`exchange-times-${rateKey}`);
        const previewEl = document.getElementById(`exchange-preview-${rateKey}`);
        const exchangeBtn = document.getElementById(`exchange-btn-${rateKey}`);
        const maxBtn = document.getElementById(`exchange-max-${rateKey}`);
        const resultEl = document.getElementById(`exchange-result-${rateKey}`);

        // 输入时实时预览
        if (timesInput) {
            timesInput.addEventListener('input', function () {
                const times = parseInt(timesInput.value) || 0;
                if (times > 0) {
                    previewEl.textContent = `消耗 ${rate.from * times} ${fromDef.icon} → 获得 ${rate.to * times} ${toDef.icon}`;
                } else {
                    previewEl.textContent = '请输入兑换次数';
                }
            });
        }

        // 确认兑换按钮
        if (exchangeBtn) {
            exchangeBtn.addEventListener('click', function () {
                const times = parseInt(timesInput.value) || 0;
                if (times <= 0) {
                    resultEl.innerHTML = '<div class="exchange-result error">请输入有效的兑换次数</div>';
                    return;
                }
                const result = CurrencySystem.exchange(fromId, toId, times);
                if (result.success) {
                    resultEl.innerHTML = `<div class="exchange-result success">✅ ${result.message}</div>`;
                    // 更新弹窗内的余额显示
                    updateExchangeBalanceDisplay();
                } else {
                    resultEl.innerHTML = `<div class="exchange-result error">❌ ${result.message}</div>`;
                }
            });
        }

        // 全部兑换按钮
        if (maxBtn) {
            maxBtn.addEventListener('click', function () {
                const maxTimes = CurrencySystem.getMaxExchangeTimes(fromId, toId);
                if (maxTimes <= 0) {
                    resultEl.innerHTML = `<div class="exchange-result error">❌ ${fromDef.name}不足，无法兑换</div>`;
                    return;
                }
                timesInput.value = maxTimes;
                // 触发预览更新
                timesInput.dispatchEvent(new Event('input'));
            });
        }
    });

    document.getElementById('exchange-modal').classList.add('active');
}

/** 关闭货币兑换弹窗 */
function hideExchange() {
    document.getElementById('exchange-modal').classList.remove('active');
}

// ============================================
// 背包弹窗
// ============================================

/** 打开背包弹窗 */
function showInventory() {
    InventorySystem.renderInventoryModal();
    document.getElementById('inventory-modal').classList.add('active');
}

/** 关闭背包弹窗 */
function hideInventory() {
    document.getElementById('inventory-modal').classList.remove('active');
}

/** 更新兑换弹窗内的余额显示 */
function updateExchangeBalanceDisplay() {
    const defs = CurrencySystem.getCurrencyDefs();
    Object.keys(defs).forEach(function (id) {
        const el = document.getElementById(`exchange-display-${id}`);
        if (el) {
            el.textContent = CurrencySystem.getBalance(id);
        }
    });
}

// ============================================
// 开包区域价格信息更新
// ============================================

/**
 * 更新开包区域的价格和余额信息
 * 在进入开包界面和每次开包后调用
 */
function updateOpenPackPriceInfo() {
    if (!currentPack) return;

    const currency = currentPack.currency || 'gold';
    const price = currentPack.price || 0;
    const currDef = CurrencySystem.getCurrencyDef(currency);
    const balance = CurrencySystem.getBalance(currency);
    const canAfford = price <= 0 || CurrencySystem.canAfford(currency, price);

    // 更新开包按钮区域的价格提示
    let priceInfoEl = document.getElementById('open-pack-price-info');
    if (!priceInfoEl) {
        // 如果元素不存在，动态创建并插入到开包按钮之前
        priceInfoEl = document.createElement('div');
        priceInfoEl.id = 'open-pack-price-info';
        priceInfoEl.className = 'open-pack-price-info';
        const btnContainer = document.querySelector('.open-btn-container');
        if (btnContainer) {
            btnContainer.parentElement.insertBefore(priceInfoEl, btnContainer);
        }
    }

    if (price > 0 && currDef) {
        priceInfoEl.innerHTML = `开包花费: ${currDef.icon} ${price} ${currDef.name} | 当前余额: ${currDef.icon} ${balance}`;
        priceInfoEl.style.display = 'block';
    } else {
        priceInfoEl.style.display = 'none';
    }

    // 更新开包按钮的可用状态
    const openBtn = document.getElementById('btn-open-pack');
    const openAgainBtn = document.getElementById('btn-open-again');

    if (openBtn) {
        if (!canAfford) {
            openBtn.classList.add('insufficient');
            openBtn.textContent = `🪙 余额不足 (需要 ${price} ${currDef.icon})`;
        } else {
            openBtn.classList.remove('insufficient');
            openBtn.textContent = price > 0 ? `🎴 开启卡包 (${currDef.icon} ${price})` : '🎴 开启卡包';
        }
    }

    if (openAgainBtn) {
        if (!canAfford) {
            openAgainBtn.classList.add('insufficient');
            openAgainBtn.textContent = `🪙 余额不足 (需要 ${price} ${currDef.icon})`;
        } else {
            openAgainBtn.classList.remove('insufficient');
            openAgainBtn.textContent = price > 0 ? `🎴 再开一包 (${currDef.icon} ${price})` : '🎴 再开一包';
        }
    }

    // 更新「开十包」按钮的可用状态
    const multiCount = 10;
    const totalPriceMulti = price * multiCount;
    const canAffordMulti = totalPriceMulti <= 0 || CurrencySystem.canAfford(currency, totalPriceMulti);

    const openMultiBtn = document.getElementById('btn-open-multi');
    const openAgainMultiBtn = document.getElementById('btn-open-again-multi');

    if (openMultiBtn) {
        if (!canAffordMulti) {
            openMultiBtn.classList.add('insufficient');
            openMultiBtn.textContent = `🪙 余额不足 (需要 ${totalPriceMulti} ${currDef.icon})`;
        } else {
            openMultiBtn.classList.remove('insufficient');
            openMultiBtn.textContent = price > 0 ? `🎴×10 开十包 (${currDef.icon} ${totalPriceMulti})` : '🎴×10 开十包';
        }
    }

    if (openAgainMultiBtn) {
        if (!canAffordMulti) {
            openAgainMultiBtn.classList.add('insufficient');
            openAgainMultiBtn.textContent = `🪙 余额不足 (需要 ${totalPriceMulti} ${currDef.icon})`;
        } else {
            openAgainMultiBtn.classList.remove('insufficient');
            openAgainMultiBtn.textContent = price > 0 ? `🎴×10 再开十包 (${currDef.icon} ${totalPriceMulti})` : '🎴×10 再开十包';
        }
    }
}

// ====== 开发者工具：CDN 卡图对比 ======

/**
 * CDN 图片源定义
 * 每个源包含：名称、URL 模板、格式说明、是否为当前使用的源
 */
const CDN_SOURCES = [
    {
        id: 'ygocdb_pics',
        name: 'YGOCDB CDN (pics)',
        urlTemplate: 'https://cdn.233.momobako.com/ygopro/pics/{id}.jpg',
        format: 'JPEG',
        desc: '萌卡 YGOPro 卡图（当前 OCG 使用）',
        usedBy: 'ocg'
    },
    {
        id: 'ygocdb_ygoimg_webp',
        name: 'YGOCDB CDN (ygoimg/webp)',
        urlTemplate: 'https://cdn.233.momobako.com/ygoimg/ygopro/{id}.webp',
        format: 'WebP',
        desc: 'YGOCDB 高清卡图（WebP 格式）',
        usedBy: null
    },
    {
        id: 'ygocdb_ygoimg_scaled',
        name: 'YGOCDB CDN (ygoimg/压缩)',
        urlTemplate: 'https://cdn.233.momobako.com/ygoimg/ygopro/{id}.webp!/fw/400/quality/85',
        format: 'WebP (压缩)',
        desc: 'YGOCDB CDN 处理：宽400 + 质量85',
        usedBy: null
    },
    {
        id: 'ygoprodeck_small',
        name: 'YGOProDeck (small)',
        urlTemplate: 'https://images.ygoprodeck.com/images/cards_small/{id}.jpg',
        format: 'JPEG',
        desc: 'YGOProDeck 小图（TCG 备用图源）',
        usedBy: null
    },
    {
        id: 'ygoprodeck_large',
        name: 'YGOProDeck (large)',
        urlTemplate: 'https://images.ygoprodeck.com/images/cards/{id}.jpg',
        format: 'JPEG',
        desc: 'YGOProDeck 大图',
        usedBy: null
    },
    {
        id: 'konami_official',
        name: 'KONAMI 官网（日文卡图）',
        urlTemplate: '/api/card-image?cid={cid}',
        format: 'JPEG',
        desc: 'KONAMI 游戏王官方数据库（通过 Pages Function 代理，需要 cid 映射，图片较小 200×290）',
        usedBy: null,
        needsCid: true  // 标记此源需要 cid 而非卡片密码
    },
    {
        id: 'yugiohmeta_s3',
        name: 'YugiohMeta S3 CDN',
        urlTemplate: 'https://s3.duellinksmeta.com/cards/{metaId}_w420.webp',
        format: 'WebP',
        desc: 'YugiohMeta 英文卡图（当前 TCG 使用，需要映射表）',
        usedBy: 'tcg',
        needsMetaMap: true  // 标记此源需要 YugiohMeta 映射表
    }
];

// 一些常用卡片 ID，用于随机测试
const SAMPLE_CARD_IDS = [
    89631139,  // 青眼白龙
    46986414,  // 黑魔导
    70903634,  // 骷髅仆人
    66788016,  // 地割れ
    74677422,  // 陷阱之穴
    44095762,  // 死者苏生
    5318639,   // 光之护封剑
    80604091,  // 混沌帝龙
    36996508,  // 灰流丽
    14558127,  // 増殖するG
    24094653,  // 屋敷わらし
    59438930,  // 电脑堺娘-娘々
];

/** 打开开发者工具弹窗 */
function showDevTools() {
    const modal = document.getElementById('devtools-modal');
    modal.classList.add('active');

    // 显示当前模式信息
    const modeInfo = document.getElementById('devtools-mode-info');
    const modeText = currentGameMode === 'ocg' ? 'OCG（使用 YGOCDB CDN 卡图）' : 'TCG（使用 YGOProDeck CDN 卡图）';
    modeInfo.textContent = `当前模式：${modeText}`;
    modeInfo.classList.add('visible');

    // 绑定开发者快捷操作按钮
    const addGoldBtn = document.getElementById('btn-dev-add-gold');
    const resetGameBtn = document.getElementById('btn-dev-reset-game');
    if (addGoldBtn) addGoldBtn.onclick = devAddGold;
    if (resetGameBtn) resetGameBtn.onclick = devResetGame;

    // 绑定按钮事件（仅首次）
    const loadBtn = document.getElementById('btn-devtools-load');
    const randomBtn = document.getElementById('btn-devtools-random');
    const input = document.getElementById('devtools-card-id');

    // 移除旧事件，防止重复绑定
    loadBtn.onclick = function () {
        const cardId = input.value.trim();
        if (!cardId || isNaN(cardId)) {
            alert('请输入有效的卡片ID（纯数字）');
            return;
        }
        loadCDNComparison(parseInt(cardId));
    };

    randomBtn.onclick = function () {
        const randomId = SAMPLE_CARD_IDS[Math.floor(Math.random() * SAMPLE_CARD_IDS.length)];
        input.value = randomId;
        loadCDNComparison(randomId);
    };

    // 回车键触发加载
    input.onkeydown = function (e) {
        if (e.key === 'Enter') loadBtn.click();
    };
}

/** 关闭开发者工具弹窗 */
function hideDevTools() {
    document.getElementById('devtools-modal').classList.remove('active');
}

/**
 * 通过 YGOCDB API 获取卡片的 KONAMI cid 编号
 * KONAMI 官网使用内部 cid 而非卡片密码，YGOCDB API 返回数据中包含 cid 字段
 * 
 * @param {number} cardId - 卡片密码（password）
 * @returns {number|null} KONAMI 内部 cid 编号，失败返回 null
 */
async function fetchCidFromYGOCDB(cardId) {
    try {
        const url = `https://ygocdb.com/api/v0/?search=${cardId}`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        if (!data.result || data.result.length === 0) return null;

        // 找到 ID 精确匹配的卡片
        const card = data.result.find(function (c) {
            return c.id === cardId || c.id === parseInt(cardId);
        });

        if (card && card.cid) {
            return card.cid;
        }

        // 如果第一个结果有 cid，也可以用
        if (data.result[0] && data.result[0].cid) {
            return data.result[0].cid;
        }

        return null;
    } catch (error) {
        console.warn(`⚠️ 获取卡片 ${cardId} 的 cid 失败:`, error);
        return null;
    }
}

/**
 * 加载 CDN 对比数据
 * 对指定卡片 ID，同时从所有 CDN 源加载图片并对比
 * @param {number} cardId - 卡片 ID
 */
async function loadCDNComparison(cardId) {
    const compareArea = document.getElementById('devtools-compare-area');
    compareArea.innerHTML = '<p class="devtools-placeholder">⏳ 正在加载各 CDN 源的图片...</p>';

    // 检查是否有需要 cid 的源，如果有则先获取 cid 映射
    let cidValue = null;
    const hasCidSource = CDN_SOURCES.some(function (s) { return s.needsCid; });
    if (hasCidSource) {
        cidValue = await fetchCidFromYGOCDB(cardId);
        if (cidValue) {
            console.log(`🔗 卡片 ${cardId} 的 KONAMI cid = ${cidValue}`);
        } else {
            console.warn(`⚠️ 无法获取卡片 ${cardId} 的 cid 映射`);
        }
    }

    // 并行加载所有 CDN 源的图片
    const results = await Promise.all(
        CDN_SOURCES.map(function (source) {
            return loadSingleCDN(source, cardId, cidValue);
        })
    );

    // 渲染对比结果
    renderCDNComparison(results, cardId);
}

/**
 * 加载单个 CDN 源的图片并获取性能数据
 * @param {object} source - CDN 源配置
 * @param {number} cardId - 卡片 ID
 * @returns {object} 加载结果（含时间、大小、状态等）
 */
function loadSingleCDN(source, cardId, cidValue) {
    // 处理需要 cid 的特殊源（如 KONAMI 官网）
    let url;
    if (source.needsCid) {
        if (!cidValue) {
            // 没有 cid 映射，直接返回错误
            return Promise.resolve({
                source: source,
                url: '（无法获取 cid 映射）',
                status: 'error',
                loadTime: 0,
                fileSize: null,
                width: null,
                height: null,
                errorMsg: '未找到此卡片的 KONAMI cid 编号'
            });
        }
        url = source.urlTemplate.replace('{cid}', cidValue);
    } else {
        url = source.urlTemplate.replace('{id}', cardId);
    }
    const startTime = performance.now();

    return new Promise(function (resolve) {
        const img = new Image();
        // 注意：不设置 crossOrigin，因为大多数图片 CDN 不支持 CORS
        // 设置 crossOrigin 会导致浏览器在 CDN 不返回 CORS 头时直接拒绝加载

        // 设置超时（15秒，给慢速 CDN 更多时间）
        const timeout = setTimeout(function () {
            resolve({
                source: source,
                url: url,
                status: 'timeout',
                loadTime: 15000,
                fileSize: null,
                width: null,
                height: null
            });
        }, 15000);

        img.onload = function () {
            clearTimeout(timeout);
            const loadTime = Math.round(performance.now() - startTime);

            // 延迟一点获取文件大小，等 Performance API 记录完成
            setTimeout(function () {
                fetchImageSize(img.src).then(function (fileSize) {
                    resolve({
                        source: source,
                        url: url,
                        status: 'ok',
                        loadTime: loadTime,
                        fileSize: fileSize,
                        width: img.naturalWidth,
                        height: img.naturalHeight,
                        imgElement: img
                    });
                });
            }, 100);
        };

        img.onerror = function () {
            clearTimeout(timeout);
            const loadTime = Math.round(performance.now() - startTime);
            resolve({
                source: source,
                url: url,
                status: 'error',
                loadTime: loadTime,
                fileSize: null,
                width: null,
                height: null
            });
        };

        // 直接使用原始 URL，不添加时间戳
        // 时间戳可能导致某些 CDN 返回 404 或绕过缓存策略
        img.src = url;
    });
}

/**
 * 通过 fetch HEAD 请求获取图片文件大小
 * @param {string} url - 图片 URL
 * @returns {number|null} 文件大小（字节），失败返回 null
 */
/**
 * 获取图片文件大小
 * 优先使用 Performance API（无需 CORS），失败时尝试 fetch
 * 
 * @param {string} url - 图片 URL
 * @returns {number|null} 文件大小（字节），失败返回 null
 */
async function fetchImageSize(url) {
    // 方案1：使用 Performance API 获取 transferSize（无需 CORS）
    try {
        const entries = performance.getEntriesByName(url);
        if (entries.length > 0) {
            const entry = entries[entries.length - 1];
            if (entry.transferSize > 0) {
                return entry.transferSize;
            }
            if (entry.encodedBodySize > 0) {
                return entry.encodedBodySize;
            }
        }
    } catch (e) {
        // Performance API 不可用，忽略
    }

    // 方案2：尝试 fetch（部分 CDN 支持 CORS）
    try {
        const resp = await fetch(url, { method: 'HEAD', mode: 'cors' });
        const size = resp.headers.get('content-length');
        return size ? parseInt(size) : null;
    } catch (e) {
        // CORS 被拦截，返回 null（不影响图片显示）
        return null;
    }
}

/**
 * 格式化文件大小（字节 → KB/MB）
 * @param {number|null} bytes - 字节数
 * @returns {string} 格式化后的大小字符串
 */
function formatFileSize(bytes) {
    if (bytes === null || bytes === undefined) return '未知';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * 渲染 CDN 对比结果
 * @param {Array} results - 所有 CDN 源的加载结果
 * @param {number} cardId - 卡片 ID
 */
function renderCDNComparison(results, cardId) {
    const compareArea = document.getElementById('devtools-compare-area');
    let html = '';

    // 找出加载成功的结果中的最佳值
    const okResults = results.filter(function (r) { return r.status === 'ok'; });
    const bestLoadTime = okResults.length > 0 ? Math.min.apply(null, okResults.map(function (r) { return r.loadTime; })) : null;
    const bestSize = okResults.length > 0 ? Math.min.apply(null, okResults.filter(function (r) { return r.fileSize; }).map(function (r) { return r.fileSize; })) : null;
    const bestRes = okResults.length > 0 ? Math.max.apply(null, okResults.map(function (r) { return (r.width || 0) * (r.height || 0); })) : null;

    // 渲染每个 CDN 源
    results.forEach(function (result) {
        const isCurrentSource = result.source.usedBy === currentGameMode;
        const activeClass = isCurrentSource ? 'active-source' : '';
        const badge = isCurrentSource
            ? '<span class="devtools-cdn-badge badge-current">当前使用</span>'
            : (result.source.usedBy ? '<span class="devtools-cdn-badge badge-alt">' + result.source.usedBy.toUpperCase() + '用</span>' : '');

        html += '<div class="devtools-cdn-card ' + activeClass + '">';
        html += '<div class="devtools-cdn-header">';
        html += '<span class="devtools-cdn-name">' + result.source.name + '</span>';
        html += badge;
        html += '</div>';
        html += '<div class="devtools-cdn-body">';

        // 图片区域
        html += '<div class="devtools-img-container">';
        if (result.status === 'ok') {
            html += '<img class="devtools-cdn-img-clickable" src="' + result.url + '" alt="' + result.source.name + '" data-cdn-name="' + result.source.name + '" />';
        } else if (result.status === 'timeout') {
            html += '<div class="devtools-img-error">⏰ 加载超时 (>10s)</div>';
        } else {
            html += '<div class="devtools-img-error">❌ ' + (result.errorMsg || '加载失败') + '</div>';
        }
        html += '</div>';

        // 信息面板
        html += '<div class="devtools-info-panel">';

        // 状态
        if (result.status === 'ok') {
            html += '<div class="devtools-info-row">';
            html += '<span class="devtools-info-label">状态</span>';
            html += '<span class="devtools-info-value good">✅ 加载成功</span>';
            html += '</div>';
        } else {
            html += '<div class="devtools-info-row">';
            html += '<span class="devtools-info-label">状态</span>';
            html += '<span class="devtools-info-value bad">❌ ' + (result.status === 'timeout' ? '超时' : (result.errorMsg || '失败')) + '</span>';
            html += '</div>';
        }

        // 加载时间
        const timeClass = result.status === 'ok' && result.loadTime === bestLoadTime ? 'good' : (result.loadTime > 3000 ? 'bad' : '');
        html += '<div class="devtools-info-row">';
        html += '<span class="devtools-info-label">加载时间</span>';
        html += '<span class="devtools-info-value ' + timeClass + '">' + result.loadTime + 'ms' + (result.loadTime === bestLoadTime ? ' 🏆' : '') + '</span>';
        html += '</div>';

        // 文件大小
        if (result.fileSize) {
            const sizeClass = result.fileSize === bestSize ? 'good' : (result.fileSize > 100 * 1024 ? 'warn' : '');
            html += '<div class="devtools-info-row">';
            html += '<span class="devtools-info-label">文件大小</span>';
            html += '<span class="devtools-info-value ' + sizeClass + '">' + formatFileSize(result.fileSize) + (result.fileSize === bestSize ? ' 🏆' : '') + '</span>';
            html += '</div>';
        }

        // 分辨率
        if (result.width && result.height) {
            const res = result.width * result.height;
            const resClass = res === bestRes ? 'good' : '';
            html += '<div class="devtools-info-row">';
            html += '<span class="devtools-info-label">分辨率</span>';
            html += '<span class="devtools-info-value ' + resClass + '">' + result.width + '×' + result.height + (res === bestRes ? ' 🏆' : '') + '</span>';
            html += '</div>';
        }

        // 格式
        html += '<div class="devtools-info-row">';
        html += '<span class="devtools-info-label">格式</span>';
        html += '<span class="devtools-info-value">' + result.source.format + '</span>';
        html += '</div>';

        // 说明
        html += '<div class="devtools-info-row">';
        html += '<span class="devtools-info-label">说明</span>';
        html += '<span class="devtools-info-value" style="font-weight:normal;font-size:0.75rem;">' + result.source.desc + '</span>';
        html += '</div>';

        // URL
        html += '<div class="devtools-url-row">';
        html += '<div class="devtools-url-text">' + result.url.split('?')[0] + '</div>';
        html += '</div>';

        html += '</div>'; // info-panel
        html += '</div>'; // cdn-body
        html += '</div>'; // cdn-card
    });

    // 总结对比
    if (okResults.length > 1) {
        html += '<div class="devtools-summary">';
        html += '<h3>📊 对比总结（Card ID: ' + cardId + '）</h3>';
        html += '<div class="devtools-summary-grid">';

        // 最快加载
        const fastest = okResults.reduce(function (a, b) { return a.loadTime < b.loadTime ? a : b; });
        html += '<div class="devtools-summary-item">';
        html += '<div class="label">⚡ 最快加载</div>';
        html += '<div class="value best">' + fastest.source.name.split('(')[0].trim() + '</div>';
        html += '<div class="label">' + fastest.loadTime + 'ms</div>';
        html += '</div>';

        // 最小体积
        const sizedResults = okResults.filter(function (r) { return r.fileSize; });
        if (sizedResults.length > 0) {
            const smallest = sizedResults.reduce(function (a, b) { return a.fileSize < b.fileSize ? a : b; });
            html += '<div class="devtools-summary-item">';
            html += '<div class="label">📦 最小体积</div>';
            html += '<div class="value best">' + smallest.source.name.split('(')[0].trim() + '</div>';
            html += '<div class="label">' + formatFileSize(smallest.fileSize) + '</div>';
            html += '</div>';
        }

        // 最高分辨率
        const highestRes = okResults.reduce(function (a, b) {
            return (a.width || 0) * (a.height || 0) > (b.width || 0) * (b.height || 0) ? a : b;
        });
        if (highestRes.width) {
            html += '<div class="devtools-summary-item">';
            html += '<div class="label">🔍 最高分辨率</div>';
            html += '<div class="value best">' + highestRes.source.name.split('(')[0].trim() + '</div>';
            html += '<div class="label">' + highestRes.width + '×' + highestRes.height + '</div>';
            html += '</div>';
        }

        html += '</div>'; // summary-grid

        // 带宽节省建议
        if (sizedResults.length >= 2) {
            const sorted = sizedResults.slice().sort(function (a, b) { return a.fileSize - b.fileSize; });
            const smallest = sorted[0];
            const largest = sorted[sorted.length - 1];
            const savedPercent = Math.round((1 - smallest.fileSize / largest.fileSize) * 100);
            if (savedPercent > 10) {
                html += '<p style="margin-top:12px;font-size:0.82rem;color:var(--text-secondary);">';
                html += '💡 使用 <strong style="color:var(--accent-gold);">' + smallest.source.name + '</strong> 相比 ' + largest.source.name;
                html += ' 可节省约 <strong style="color:#4caf50;">' + savedPercent + '%</strong> 带宽';
                html += ' （' + formatFileSize(largest.fileSize - smallest.fileSize) + '/张卡）';
                html += '</p>';
            }
        }

        html += '</div>'; // summary
    }

    compareArea.innerHTML = html;
}

// ============================================
// 卡片预览功能
// ============================================

/**
 * 打开卡片预览弹窗
 * 展示当前卡包内所有可开出的卡片，已拥有的卡片正常显示，
 * 未拥有的卡片添加灰度效果
 */
/**
 * 显示卡片预览弹窗
 * 支持从卡包列表直接调用（传入 pack 参数），也支持从开包界面调用（使用已加载的 currentPack）
 * 
 * @param {Object} [pack] - 卡包对象（可选，不传则使用 currentPack）
 */
async function showCardPreview(pack) {
    // 确定要预览的卡包
    const targetPack = pack || currentPack;

    if (!targetPack) {
        alert('当前没有加载任何卡包数据，请先选择一个卡包。');
        return;
    }

    // 显示加载状态
    showLoadingState('正在加载「' + (targetPack.packName || '卡包') + '」的卡片数据...');

    try {
        // OCG 模式：如果卡包使用独立文件存储 cardIds，先动态加载
        if (currentGameMode === 'ocg' && targetPack.cardFile && !targetPack.cardIds) {
            updateLoadingText('正在加载「' + targetPack.packName + '」卡牌列表...');
            var cardFileUrl = 'data/ocg/cards/' + targetPack.cardFile;
            var cardFileResponse = await fetch(cardFileUrl);
            if (!cardFileResponse.ok) {
                throw new Error('加载卡牌文件失败: ' + cardFileUrl + ' (HTTP ' + cardFileResponse.status + ')');
            }
            var cardFileData = await cardFileResponse.json();
            targetPack.cardIds = cardFileData.cardIds;
            console.log('📄 [预览] 已加载独立卡牌文件 [' + targetPack.cardFile + ']，共 ' + targetPack.cardIds.length + ' 张卡');
        }

        // 通过 API 模块获取卡牌数据
        var setData = await TCG_API.getCardSetData(currentGameMode, targetPack, function (loaded, total) {
            updateLoadingText('正在加载卡片数据... (' + loaded + '/' + total + ')');
        });

        // 用加载到的卡片数据渲染预览
        hideLoadingState();
        renderCardPreview('id', setData.cards, targetPack);
        document.getElementById('card-preview-modal').classList.add('active');

    } catch (error) {
        console.error('❌ [预览] 加载卡包数据失败:', error);
        hideLoadingState();
        alert('加载卡包「' + (targetPack.packName || '') + '」失败。\n\n错误详情: ' + error.message);
    }
}

/** 关闭卡片预览弹窗 */
function hideCardPreview() {
    document.getElementById('card-preview-modal').classList.remove('active');
}

/**
 * 渲染卡片预览弹窗内容
 * 支持排序切换（默认按编号排序）
 * 
 * @param {string} sortBy - 排序方式（'id' | 'rarity' | 'owned' | 'name'），默认 'id'
 * @param {Array} [cards] - 卡片数组（可选，不传则使用 currentPackCards）
 * @param {Object} [pack] - 卡包对象（可选，不传则使用 currentPack）
 */
function renderCardPreview(sortBy, cards, pack) {
    const contentEl = document.getElementById('card-preview-content');
    if (!contentEl) return;

    sortBy = sortBy || 'id';
    // 使用传入的数据或回退到全局变量
    const previewCards = cards || currentPackCards;
    const previewPack = pack || currentPack;

    if (!previewCards || previewCards.length === 0) {
        contentEl.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px 0;">暂无卡片数据</p>';
        return;
    }

    // 获取当前卡包的所有卡片
    const allCards = previewCards.slice();

    // 从背包系统获取已拥有的卡片信息（含各版本收集数量）
    const ownedMap = {};
    const ownedVersionsMap = {}; // { cardId: { "SR": 2, "SER": 1 } }
    let ownedCount = 0;
    allCards.forEach(function (card) {
        const invCard = InventorySystem.getCard(card.id);
        if (invCard) {
            ownedMap[card.id] = invCard.count;
            ownedVersionsMap[card.id] = InventorySystem.getCardVersions(card.id);
            ownedCount++;
        }
    });

    // 排序
    const rarityOrder = { 'PSER': 8, 'UTR': 7, 'SER': 6, 'UR': 5, 'SR': 4, 'R': 3, 'NR': 2, 'N': 1 };
    const sortedCards = allCards.slice();

    switch (sortBy) {
        case 'id':
            // 按卡包内编号序号（如 BLZD-JP001 → 1, JP002 → 2）从小到大排序
            sortedCards.sort(function (a, b) {
                return (Number(a.setNumber) || 0) - (Number(b.setNumber) || 0);
            });
            break;
        case 'rarity':
            sortedCards.sort(function (a, b) {
                const rDiff = (rarityOrder[b.rarityCode] || 0) - (rarityOrder[a.rarityCode] || 0);
                if (rDiff !== 0) return rDiff;
                // 同稀有度，已拥有的排前面
                const aOwned = ownedMap[a.id] ? 1 : 0;
                const bOwned = ownedMap[b.id] ? 1 : 0;
                return bOwned - aOwned;
            });
            break;
        case 'owned':
            // 已拥有的排前面，未拥有的排后面
            sortedCards.sort(function (a, b) {
                const aOwned = ownedMap[a.id] ? 1 : 0;
                const bOwned = ownedMap[b.id] ? 1 : 0;
                if (aOwned !== bOwned) return bOwned - aOwned;
                return (rarityOrder[b.rarityCode] || 0) - (rarityOrder[a.rarityCode] || 0);
            });
            break;
        case 'name':
            sortedCards.sort(function (a, b) {
                const nameA = a.nameCN || a.name || '';
                const nameB = b.nameCN || b.name || '';
                return nameA.localeCompare(nameB, 'zh-CN');
            });
            break;
    }

    // 稀有度分布统计（统计所有版本，一张卡有多个版本则每个版本各计一次）
    const rarityCounts = { 'PSER': 0, 'UTR': 0, 'SER': 0, 'UR': 0, 'SR': 0, 'R': 0, 'NR': 0, 'N': 0 };
    allCards.forEach(function (card) {
        const versions = card.rarityVersions || [card.rarityCode || 'N'];
        versions.forEach(function (v) {
            rarityCounts[v] = (rarityCounts[v] || 0) + 1;
        });
    });

    // 更新弹窗标题
    const titleEl = document.getElementById('card-preview-title');
    if (titleEl) {
        titleEl.textContent = '🔍 ' + (previewPack ? previewPack.packName || '卡包' : '卡包') + ' — 卡片预览';
    }

    // 构建 HTML
    let html = '';

    // 收集进度条
    const collectionPercent = allCards.length > 0 ? Math.round(ownedCount / allCards.length * 100) : 0;
    html += `
        <div class="preview-collection-bar">
            <div class="preview-collection-info">
                <span>收集进度</span>
                <span class="preview-collection-count">${ownedCount} / ${allCards.length} (${collectionPercent}%)</span>
            </div>
            <div class="preview-progress-track">
                <div class="preview-progress-fill" style="width: ${collectionPercent}%"></div>
            </div>
        </div>
    `;

    // 稀有度分布（只展示数量>0的稀有度）
    const rarityDisplayOrder = ['PSER', 'UTR', 'SER', 'UR', 'SR', 'R', 'NR', 'N'];
    let rarityTagsHtml = '';
    rarityDisplayOrder.forEach(function (code) {
        if (rarityCounts[code] > 0) {
            rarityTagsHtml += `<span class="preview-rarity-tag rarity-tag-${code}">${code} ×${rarityCounts[code]}</span>\n            `;
        }
    });
    html += `
        <div class="preview-rarity-dist">
            ${rarityTagsHtml}
        </div>
    `;

    // 排序控制栏
    html += `
        <div class="preview-sort-bar">
            <span class="sort-label">排序：</span>
            <button class="sort-btn ${sortBy === 'id' ? 'active' : ''}" data-sort="id">编号</button>
            <button class="sort-btn ${sortBy === 'rarity' ? 'active' : ''}" data-sort="rarity">稀有度</button>
            <button class="sort-btn ${sortBy === 'owned' ? 'active' : ''}" data-sort="owned">已拥有</button>
            <button class="sort-btn ${sortBy === 'name' ? 'active' : ''}" data-sort="name">名称</button>
        </div>
    `;

    // 卡片网格
    // 稀有度权重（用于确定边框颜色 —— 取最高稀有度版本）
    const rarityWeight = { 'PSER': 8, 'UTR': 7, 'SER': 6, 'UR': 5, 'SR': 4, 'R': 3, 'NR': 2, 'N': 1 };
    html += '<div class="preview-card-grid">';
    sortedCards.forEach(function (card) {
        const isOwned = !!ownedMap[card.id];
        const ownedQty = ownedMap[card.id] || 0;
        const rarityCode = card.rarityCode || 'N';
        const versions = card.rarityVersions || [rarityCode];
        const displayName = card.nameCN || card.name || card.nameOriginal || '未知卡片';

        // 取最高稀有度版本作为边框颜色
        const highestRarity = versions.reduce(function (best, v) {
            return (rarityWeight[v] || 0) > (rarityWeight[best] || 0) ? v : best;
        }, versions[0]);

        // 获取该卡各稀有度版本的收集数量
        const versionsOwned = ownedVersionsMap[card.id] || {};

        // 构建多版本稀有度角标 HTML（未收集的版本显示灰色，已收集的显示彩色）
        let rarityBadgeHtml;
        if (versions.length > 1) {
            // 多版本：展示所有版本，用竖线分隔
            rarityBadgeHtml = '<span class="preview-rarity-badge preview-rarity-multi">';
            rarityBadgeHtml += versions.map(function (v) {
                const collected = versionsOwned[v] && versionsOwned[v] > 0;
                const colorClass = collected ? 'rarity-color-' + v : 'rarity-color-uncollected';
                return '<span class="rarity-version-item ' + colorClass + '">' + v + '</span>';
            }).join('<span class="rarity-sep">|</span>');
            rarityBadgeHtml += '</span>';
        } else {
            // 单版本：根据收集状态决定颜色
            const singleCollected = versionsOwned[rarityCode] && versionsOwned[rarityCode] > 0;
            const singleClass = singleCollected ? 'rarity-' + rarityCode : 'rarity-uncollected';
            rarityBadgeHtml = `<span class="preview-rarity-badge ${singleClass}">${rarityCode}</span>`;
        }

        // 构建右下角数量角标（按稀有度分别显示，颜色对应稀有度）
        let ownedBadgeHtml = '';
        if (isOwned) {
            if (versions.length > 1) {
                // 多版本：每个版本单独显示数量
                let parts = [];
                versions.forEach(function (v) {
                    const vCount = versionsOwned[v] || 0;
                    if (vCount > 0) {
                        parts.push('<span class="owned-version-count rarity-color-' + v + '">×' + vCount + '</span>');
                    }
                });
                if (parts.length > 0) {
                    ownedBadgeHtml = '<span class="preview-owned-badge preview-owned-multi">' + parts.join('') + '</span>';
                }
            } else {
                // 单版本：显示总数，颜色对应稀有度
                ownedBadgeHtml = `<span class="preview-owned-badge rarity-color-${rarityCode}">×${ownedQty}</span>`;
            }
        }

        // 卡图
        let imageHtml;
        if (card.imageUrl) {
            imageHtml = `<img class="preview-card-image ${!isOwned ? 'not-owned' : ''}" 
                              src="${card.imageUrl}" alt="${displayName}" loading="lazy"
                              onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
                         <div class="preview-card-placeholder" style="display:none;">🃏</div>`;
        } else {
            imageHtml = `<div class="preview-card-placeholder ${!isOwned ? 'not-owned' : ''}">🃏</div>`;
        }

        html += `
            <div class="preview-card-item ${isOwned ? 'owned' : 'not-owned-card'} rarity-border-${highestRarity}" data-card-id="${card.id}">
                <div class="preview-card-img-wrapper">
                    ${imageHtml}
                    ${rarityBadgeHtml}
                    ${ownedBadgeHtml}
                    ${!isOwned ? '<div class="preview-lock-icon">🔒</div>' : ''}
                </div>
                <div class="preview-card-info">
                    <div class="preview-card-name" title="${displayName}">${displayName}</div>
                </div>
            </div>
        `;
    });
    html += '</div>';

    contentEl.innerHTML = html;

    // 绑定排序按钮事件（保持 cards 和 pack 引用）
    contentEl.querySelectorAll('.preview-sort-bar .sort-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            renderCardPreview(this.getAttribute('data-sort'), previewCards, previewPack);
        });
    });

    // 绑定卡片点击事件（已拥有的卡可以放大查看）
    contentEl.querySelectorAll('.preview-card-item').forEach(function (item) {
        item.addEventListener('click', function () {
            const cardId = this.getAttribute('data-card-id');
            const card = previewCards.find(function (c) { return String(c.id) === String(cardId); });
            if (card) {
                const imgUrl = card.imageLargeUrl || card.imageUrl;
                if (imgUrl) {
                    // 复用已有的卡片大图查看器
                    const viewer = document.getElementById('card-image-viewer');
                    if (!viewer) return;
                    const img = viewer.querySelector('.viewer-image');
                    const nameEl = viewer.querySelector('.viewer-card-name');
                    if (img) img.src = imgUrl;
                    if (nameEl) {
                        const displayName = card.nameCN || card.name || '';
                        const foreignName = card.nameOriginal || '';
                        nameEl.textContent = foreignName ? displayName + '  ' + foreignName : displayName;
                    }
                    viewer.classList.add('active');
                }
            }
        });
    });
}
