/**
 * ============================================
 * YGO Pack Opener - 游戏核心逻辑
 * 
 * 【文件说明】
 * 这是游戏的"大脑"，负责：
 * 1. 读取卡包配置表（data/ocg/packs.json）
 * 2. 通过 API 模块获取卡牌数据（自动缓存到玩家设备）
 * 3. 读取更新日志（changelog.json）
 * 4. 实现开包抽卡逻辑（按稀有度权重随机抽取）
 * 5. 控制界面切换和动画播放
 * 6. 集成货币系统（开包消耗货币、货币兑换）
 * 7. 集成背包系统（开包卡片自动入库、查看收藏）
 * ============================================
 */

// ====== 全局数据存储 ======
let ocgPackConfig = null;    // OCG 卡包配置数据（来自 data/ocg/packs.json）
let changelogData = null;    // 更新日志数据
let currentPack = null;      // 当前选中的卡包配置
let currentPackCards = null;  // 当前选中卡包的卡牌数据（来自 API 缓存）
let currentSupplementCards = null;  // 当前卡包的辅助包卡池（仅开盒时使用）
let currentGameMode = 'ocg';  // 当前游戏模式（预留：未来可扩展 'tcg'）
let currentPackCategory = 'recent';  // 当前选中的卡包分类（recent/booster/structure/concept/special）
let currentOpenMode = 'pack';  // 当前开包模式：'pack'|'box'|'3box'，用于快捷再开按钮

// ====== 卡图严格匹配模式（开发者调试用，从 localStorage 恢复） ======
window._strictImageMatch = localStorage.getItem('strictImageMatch') === 'true';

// ====== 稀有度排序（由 rarities.json 动态生成，以下为兜底默认值） ======
// 升序映射：{ code: weight }，weight 越大越稀有 —— 用于开包结果排序（N→最稀有）
let RARITY_ORDER_ASC = { 'N': 10, 'NR': 20, 'R': 30, 'SR': 40, 'UR': 50, 'UR-OF': 55, 'UTR': 60, 'CR': 65, 'SER': 70, 'PSER': 80, 'PSER-OF': 90, 'GMR-OF': 100 };
// 降序映射：同 ASC（值相同），排序时取反即可 —— 用于预览/背包列表
let RARITY_ORDER_DESC = Object.assign({}, RARITY_ORDER_ASC);
// 降序稀有度代码数组：['GMR-OF', 'PSER-OF', 'PSER', ...] —— 用于遍历展示
let RARITY_CODES_DESC = Object.keys(RARITY_ORDER_ASC).sort(function (a, b) { return RARITY_ORDER_ASC[b] - RARITY_ORDER_ASC[a]; });

/**
 * 卡图 onerror 统一处理
 * 本地卡图加载失败 → 隐藏图片显示兜底内容（不再回退到外部 CDN）
 *
 * @param {HTMLImageElement} img - 加载失败的 img 元素
 */
function handleCardImageError(img) {
    img.style.display = 'none';
    img.classList.remove('clickable');
    const next = img.nextElementSibling;
    if (next) next.style.display = next.classList.contains('preview-card-placeholder') ? 'flex' : 'block';
}

// ====== 页面加载完成后初始化 ======
document.addEventListener('DOMContentLoaded', async function () {
    console.log('🚀 DOMContentLoaded 触发，开始初始化...');

    // 初始化货币系统（在绑定事件之前，确保余额数据已就绪）
    CurrencySystem.init();

    // 初始化背包系统
    InventorySystem.init();

    // 初始化市场价格系统（异步加载价格数据，不阻塞 UI）
    PriceSystem.init();

    // 先绑定导航栏按钮事件（缓存、日志、模式切换、货币兑换），确保即使加载失败也能使用
    bindNavEvents();

    // 当前仅支持 OCG 模式（预留：未来可扩展 TCG 模式）
    currentGameMode = 'ocg';

    try {
        showLoadingState('正在加载游戏配置...');
        console.log('📡 开始 fetch 配置文件...');

        // 加载 OCG 配置、更新日志和稀有度定义
        const [ocgResponse, changelogResponse, raritiesResponse] = await Promise.all([
            fetch('data/ocg/packs.json'),
            fetch('data/changelog.json'),
            fetch('data/common/rarities.json')
        ]);

        console.log('📡 fetch 完成，ocg/packs.json status:', ocgResponse.status, ', changelog.json status:', changelogResponse.status, ', rarities.json status:', raritiesResponse.status);

        // 检查 HTTP 响应状态
        if (!ocgResponse.ok) {
            throw new Error(`加载 ocg/packs.json 失败: HTTP ${ocgResponse.status} ${ocgResponse.statusText}`);
        }
        if (!changelogResponse.ok) {
            throw new Error(`加载 changelog.json 失败: HTTP ${changelogResponse.status} ${changelogResponse.statusText}`);
        }
        if (!raritiesResponse.ok) {
            throw new Error(`加载 rarities.json 失败: HTTP ${raritiesResponse.status} ${raritiesResponse.statusText}`);
        }

        ocgPackConfig = await ocgResponse.json();
        changelogData = await changelogResponse.json();
        const raritiesData = await raritiesResponse.json();
        console.log('✅ JSON 解析成功');

        // 从 rarities.json 动态注入稀有度 CSS 变量和颜色类
        applyRarityColors(raritiesData);
        console.log(`📦 OCG 卡包数量: ${ocgPackConfig.packs.length}`);

        // 初始化各个模块
        bindCategoryTabs();
        console.log('✅ bindCategoryTabs 完成');

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

        // 动态同步页脚版本号（从 changelog 数据读取最新版本）
        syncFooterVersion();

        hideLoadingState();

        const latestVer = window.APP_VERSION || '?';
        console.log(`🂴 YGO Pack Opener v${latestVer} 初始化完成！当前模式: ${currentGameMode.toUpperCase()}`);

        // 检查是否需要显示版本更新公告
        checkAnnouncement();
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

// ====== 稀有度颜色动态注入 ======

/**
 * 从 rarities.json 数据中读取颜色，动态生成 CSS 变量和稀有度颜色类。
 * 这样新增/修改稀有度颜色只需编辑 rarities.json，无需改动 CSS。
 * @param {Object} raritiesData - rarities.json 解析后的对象
 */
function applyRarityColors(raritiesData) {
    if (!raritiesData || !raritiesData.rarities) {
        console.warn('⚠️ rarities.json 数据格式不正确，跳过颜色注入');
        return;
    }

    // ---- 从 rarities.json 动态构建全局稀有度排序映射 ----
    const ascMap = {};
    raritiesData.rarities.forEach(function (r) {
        ascMap[r.code] = r.sortWeight;
    });
    RARITY_ORDER_ASC = ascMap;
    RARITY_ORDER_DESC = Object.assign({}, ascMap);
    // 按 sortWeight 从大到小排列的稀有度代码列表
    RARITY_CODES_DESC = Object.keys(ascMap).sort(function (a, b) { return ascMap[b] - ascMap[a]; });
    console.log('📊 已从 rarities.json 构建稀有度排序映射，共 ' + RARITY_CODES_DESC.length + ' 种：' + RARITY_CODES_DESC.join(', '));

    // ---- 动态注入 CSS 颜色 ----
    const root = document.documentElement;
    let dynamicCSS = '';

    // 根据十六进制颜色计算相对亮度，判断应使用白色还是黑色文字
    function getTextColorForBg(hexColor) {
        var hex = hexColor.replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        // 使用 W3C 推荐的相对亮度公式
        var luminance = (r * 299 + g * 587 + b * 114) / 1000;
        return luminance > 160 ? '#000' : '#fff';
    }

    // 将十六进制颜色转换为 "r, g, b" 格式字符串（用于 rgba() 表达式）
    function hexToRgb(hexColor) {
        var hex = hexColor.replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        return r + ', ' + g + ', ' + b;
    }

    raritiesData.rarities.forEach(function (r) {
        // 注入 CSS 变量到 :root（如 --rarity-UR: #f5c842）
        root.style.setProperty('--rarity-' + r.code, r.cssColor);

        // 计算该稀有度对应的文字颜色（亮背景用黑字，暗背景用白字）
        var textColor = getTextColorForBg(r.cssColor);
        var textShadow = textColor === '#fff'
            ? '0 1px 2px rgba(0, 0, 0, .6)'
            : '0 1px 1px rgba(255, 255, 255, .4)';

        // 生成 .rarity-color-{code} 颜色类（用于 JS 动态渲染文本颜色）
        dynamicCSS += '.rarity-color-' + r.code + ' { color: var(--rarity-' + r.code + '); }\n';

        // 生成角标实心背景色样式（覆盖所有稀有度，包括动态新增的）
        var badgeSelectors = ['.card-rarity-badge', '.inventory-rarity-badge', '.preview-rarity-badge', '.rarity-version-item', '.preview-owned-badge', '.owned-version-count'];
        badgeSelectors.forEach(function (sel) {
            dynamicCSS += sel + '.rarity-' + r.code + ' { background-color: var(--rarity-' + r.code + '); color: ' + textColor + '; text-shadow: ' + textShadow + '; }\n';
        });

        // 生成图鉴进度条标签颜色（rarity-tag-{code}）
        dynamicCSS += '.rarity-detail-label.rarity-tag-' + r.code + ' { color: var(--rarity-' + r.code + '); }\n';
        // 生成图鉴统计标签描边样式（preview-rarity-tag）
        dynamicCSS += '.preview-rarity-tag.rarity-tag-' + r.code + ' { color: var(--rarity-' + r.code + '); border: 1px solid var(--rarity-' + r.code + '); }\n';
        // 生成图鉴进度条填充颜色（rarity-fill-{code}）
        dynamicCSS += '.rarity-fill-' + r.code + ' { background: var(--rarity-' + r.code + '); }\n';

        // ---- 动态生成边框样式（确保所有稀有度都有对应的边框效果） ----
        // 根据 sortWeight 决定边框发光强度和动画
        var weight = r.sortWeight;
        var glowAlpha = weight >= 60 ? '.35' : (weight >= 40 ? '.2' : '0');
        var hasShine = weight >= 50; // UR及以上有呼吸光动画

        // 1. 开包结果卡片边框 .card-item.rarity-{code}
        dynamicCSS += '.card-item.rarity-' + r.code + ' { border-color: var(--rarity-' + r.code + ');';
        if (glowAlpha !== '0') {
            dynamicCSS += ' box-shadow: 0 0 ' + (weight >= 60 ? '25' : (weight >= 40 ? '18' : '8')) + 'px rgba(' + hexToRgb(r.cssColor) + ', ' + (weight >= 60 ? '0.6' : (weight >= 40 ? '0.5' : '0.3')) + ');';
        }
        if (hasShine) {
            dynamicCSS += ' animation: cardReveal .6s ease forwards, urShine 2s ease-in-out infinite;';
        }
        dynamicCSS += ' }\n';

        // 2. 背包卡片边框 .inventory-card-item.rarity-border-{code}
        dynamicCSS += '.inventory-card-item.rarity-border-' + r.code + ' { border-color: var(--rarity-' + r.code + ');';
        if (glowAlpha !== '0') {
            dynamicCSS += ' box-shadow: 0 0 ' + (weight >= 60 ? '8' : '6') + 'px rgba(' + hexToRgb(r.cssColor) + ', ' + glowAlpha + ');';
        }
        dynamicCSS += ' }\n';

        // 3. 图鉴预览卡片边框 .preview-card-item.owned.rarity-border-{code}
        dynamicCSS += '.preview-card-item.owned.rarity-border-' + r.code + ' { border-color: var(--rarity-' + r.code + ');';
        if (glowAlpha !== '0') {
            dynamicCSS += ' box-shadow: 0 0 ' + (weight >= 60 ? '8' : '6') + 'px rgba(' + hexToRgb(r.cssColor) + ', ' + (weight >= 60 ? '.3' : '.2') + ');';
        }
        dynamicCSS += ' }\n';

        // 4. 稀有度统计行颜色 .rarity-stats__item--{code}
        dynamicCSS += '.rarity-stats__item--' + r.code + ' { color: var(--rarity-' + r.code + '); }\n';

        // 5. 价格参考说明中的稀有度颜色 .inventory-price-note .rarity-price.rarity-{code}
        dynamicCSS += '.inventory-price-note .rarity-price.rarity-' + r.code + ' { color: var(--rarity-' + r.code + '); }\n';
    });

    // 将动态生成的颜色类注入到页面中
    const styleEl = document.createElement('style');
    styleEl.id = 'rarity-dynamic-colors';
    styleEl.textContent = dynamicCSS;
    document.head.appendChild(styleEl);

    console.log('🎨 已从 rarities.json 动态注入 ' + raritiesData.rarities.length + ' 种稀有度颜色');
}

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
    // 更新日志（从页脚版本号入口进入）
    bindEvent('footer-version', 'click', showChangelog);
    bindEvent('btn-close-changelog', 'click', hideChangelog);

    // OCG 模式按钮（预留：未来可扩展 TCG 模式切换）
    bindEvent('btn-mode-ocg', 'click', function () { switchGameMode('ocg'); });

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
    bindEvent('devtools-modal', 'click', function (e) {
        if (e.target === document.getElementById('devtools-modal')) hideDevTools();
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
async function switchGameMode(mode) {
    if (mode === currentGameMode) return; // 同一模式不重复切换

    // 预留：未来扩展 TCG 模式时在此添加加载逻辑
    if (mode !== 'ocg') {
        console.warn('⚠️ 当前仅支持 OCG 模式');
        return;
    }

    currentGameMode = mode;
    // 保存到本地存储，下次打开网页时记住选择
    localStorage.setItem('ygo_game_mode', mode);

    // 更新按钮激活状态
    updateModeButtons();

    // 重置当前选中的卡包
    currentPack = null;
    currentPackCards = null;
    currentSupplementCards = null;

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
    if (ocgBtn) {
        ocgBtn.classList.toggle('active', currentGameMode === 'ocg');
    }
}

/**
 * 获取当前模式的卡包配置
 * @returns {object} 当前模式的配置（packs数组 + defaultRarityRates）
 */
function getCurrentModeConfig() {
    // 预留：未来扩展 TCG 模式时在此添加分支
    return ocgPackConfig || null;
}

// ====== 绑定游戏区域按钮事件 ======
function bindGameEvents() {
    // 开包按钮
    bindEvent('btn-open-pack', 'click', openPack);

    // 再开一包
    bindEvent('btn-open-again', 'click', openPack);

    // 开整盒（从卡包配置读取包数，默认30包）
    bindEvent('btn-open-box', 'click', function () {
        const boxCount = (currentPack && currentPack.packsPerBox) || 30;
        openMultiPacks(boxCount);
    });

    // 再开整盒
    bindEvent('btn-open-again-box', 'click', function () {
        const boxCount = (currentPack && currentPack.packsPerBox) || 30;
        openMultiPacks(boxCount);
    });

    // 开3盒（仅LOCH等配置了boxesForBonus的卡包可用，买3盒赠1特别包）
    bindEvent('btn-open-3box', 'click', function () {
        const boxCount = (currentPack && currentPack.packsPerBox) || 30;
        const boxesForBonus = (currentPack && currentPack.boxesForBonus) || 3;
        openMultiPacks(boxCount * boxesForBonus, boxesForBonus);
    });

    // 再开3盒
    bindEvent('btn-open-again-3box', 'click', function () {
        const boxCount = (currentPack && currentPack.packsPerBox) || 30;
        const boxesForBonus = (currentPack && currentPack.boxesForBonus) || 3;
        openMultiPacks(boxCount * boxesForBonus, boxesForBonus);
    });

    // 快捷再开按钮（位于开包结果页顶部，根据当前模式动态执行对应操作）
    bindEvent('btn-quick-reopen', 'click', function () {
        if (currentOpenMode === '3box') {
            const boxCount = (currentPack && currentPack.packsPerBox) || 30;
            const boxesForBonus = (currentPack && currentPack.boxesForBonus) || 3;
            openMultiPacks(boxCount * boxesForBonus, boxesForBonus);
        } else if (currentOpenMode === 'box') {
            const boxCount = (currentPack && currentPack.packsPerBox) || 30;
            openMultiPacks(boxCount);
        } else {
            openPack();
        }
    });

    // 返回选择卡包（开包界面的返回按钮）
    bindEvent('btn-back-to-packs', 'click', showPackSelect);
    // 开包结果页返回按钮 → 返回开包界面（上一层）
    bindEvent('btn-back-from-result', 'click', backToOpenPack);
    bindEvent('btn-result-back', 'click', backToOpenPack);

    // 开包界面收藏预览按钮（和卡包列表的放大镜是同一个功能）
    bindEvent('btn-pack-preview', 'click', function () {
        if (currentPack) showCardPreview(currentPack);
    });

    // 卡片预览（关闭按钮 + 遮罩层点击关闭）
    bindEvent('btn-close-card-preview', 'click', hideCardPreview);
    bindEvent('card-preview-modal', 'click', function (e) {
        if (e.target === document.getElementById('card-preview-modal')) hideCardPreview();
    });
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
        const cardSetCode = img.getAttribute('data-card-set-code') || '';

        if (!largeUrl) return;

        // 先清空旧图，防止切换时闪现上一张图片
        viewerImage.src = '';
        // 设置大图和名称
        viewerImage.src = largeUrl;
        viewerImage.alt = cardName;
        viewerImage.onerror = null;

        // 构建显示名称（编号 + 中文名 + 外文名）
        let displayName = '';
        if (cardSetCode) {
            displayName += `<span style="font-size:0.95em;color:#f0c040;letter-spacing:0.5px;">${cardSetCode}</span><br>`;
        }
        displayName += cardName;
        if (foreignName && foreignName !== cardName) {
            displayName += `<br><span style="font-size:0.8em;opacity:0.7;">${foreignName}</span>`;
        }
        viewerName.innerHTML = displayName;

        // 打开查看器（带过渡动画）
        viewer.classList.add('active');
    });

    // 事件委托：监听辅助包区域的卡片点击（放大查看）
    const bonusCardsEl = document.getElementById('bonus-cards');
    if (bonusCardsEl) {
        bonusCardsEl.addEventListener('click', function (e) {
            const img = e.target.closest('.card-image.clickable');
            if (!img) return;

            e.stopPropagation();

            const bonusLargeUrl = img.getAttribute('data-large-url');
            const cardName = img.getAttribute('data-card-name') || '';
            const foreignName = img.getAttribute('data-card-foreign') || '';
            const cardSetCode = img.getAttribute('data-card-set-code') || '';

            if (!bonusLargeUrl) return;

            // 先清空旧图，防止切换时闪现上一张图片
            viewerImage.src = '';
            viewerImage.src = bonusLargeUrl;
            viewerImage.alt = cardName;
            viewerImage.onerror = null;

            let displayName = '';
            if (cardSetCode) {
                displayName += `<span style="font-size:0.95em;color:#f0c040;letter-spacing:0.5px;">${cardSetCode}</span><br>`;
            }
            displayName += cardName;
            if (foreignName && foreignName !== cardName) {
                displayName += `<br><span style="font-size:0.8em;opacity:0.7;">${foreignName}</span>`;
            }
            viewerName.innerHTML = displayName;

            viewer.classList.add('active');
        });
    }

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

    // 先清空旧图，防止切换时闪现上一张图片
    viewerImage.src = '';
    viewerImage.src = imgSrc;
viewerImage.alt = cardName || '';

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
    const img = viewer.querySelector('.viewer-image');
    viewer.classList.remove('active');
    // 等关闭动画播完后再清空图片（350ms 与 CSS 关闭过渡时间匹配）
    // 避免动画途中图片突然消失导致不流畅
    setTimeout(function () {
        // 仅在查看器仍处于关闭状态时才清空，防止快速重开时误清
        if (!viewer.classList.contains('active')) {
            img.src = '';
        }
    }, 350);
}

// ============================================
// 卡包列表渲染
// ============================================

/**
 * 渲染卡包选择列表
 * 根据当前 OCG/TCG 模式，读取对应的 packs 数组，生成可点击的卡包卡片
 */
/**
 * 绑定卡包分类选项卡事件
 */
function bindCategoryTabs() {
    const tabsContainer = document.getElementById('pack-category-tabs');
    if (!tabsContainer) return;
    tabsContainer.addEventListener('click', function (e) {
        const tab = e.target.closest('.pack-category-tab');
        if (!tab || tab.classList.contains('active')) return;
        // 切换激活状态
        tabsContainer.querySelectorAll('.pack-category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // 更新当前分类并重新渲染卡包列表
        currentPackCategory = tab.dataset.category;
        renderPackList();
    });
}

function renderPackList() {
    const packListEl = document.getElementById('pack-list');
    packListEl.innerHTML = '';

    const modeConfig = getCurrentModeConfig();
    if (!modeConfig || !modeConfig.packs) {
        packListEl.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">当前模式下暂无可用卡包</p>';
        return;
    }

    // 按当前分类筛选卡包
    let filteredPacks;
    if (currentPackCategory === 'recent') {
        // 「近期发售」：显示所有未锁定卡包，按发售日期从新到旧排序
        filteredPacks = modeConfig.packs
            .filter(pack => !pack.locked)
            .sort((a, b) => {
                const dateA = a.releaseDate || '0000-00-00';
                const dateB = b.releaseDate || '0000-00-00';
                return dateB.localeCompare(dateA);
            });
    } else {
        // 按发售日期从新到旧排序，与「近期发售」一致
        filteredPacks = modeConfig.packs.filter(pack => pack.category === currentPackCategory)
            .sort((a, b) => {
                const dateA = a.releaseDate || '0000-00-00';
                const dateB = b.releaseDate || '0000-00-00';
                return dateB.localeCompare(dateA);
            });
    }
    if (filteredPacks.length === 0) {
        packListEl.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px 0;">该分类暂无卡包，敬请期待 🌟</p>';
        return;
    }

    // P0-1: 首屏封面预加载 —— 「近期发售」分类的前3个卡包提前触发图片加载
    if (currentPackCategory === 'recent') {
        filteredPacks.slice(0, 3).forEach(pack => {
            const packCode = pack.packCode || pack.setCode || '';
            const url = getPackCoverImageUrl(pack, packCode, 'pack');
            const preImg = new Image();
            preImg.src = url;
        });
    }

    filteredPacks.forEach(function (pack, packIndex) {
        const packCard = document.createElement('div');
        packCard.className = 'pack-card' + (pack.locked ? ' pack-card--locked' : '');

        // OCG 卡包显示 packCode，TCG 卡包显示 setCode
        const displayCode = pack.packCode || pack.setCode || pack.packId;
        // OCG 卡包显示卡牌数量（优先使用 totalCards 字段，兼容旧的 cardIds 方式）
        const cardCountInfo = pack.totalCards ? ` | ${pack.totalCards} 种卡` : (pack.cardIds ? ` | ${pack.cardIds.length} 种卡` : '');

        // 价格信息（锁定卡包不显示价格），优先从价格配置文件读取单包价格
        const currencyDef = CurrencySystem.getCurrencyDef(pack.currency || 'gold');
        const priceIcon = currencyDef ? currencyDef.icon : '🪙';
        const packCodeList = pack.packCode || pack.setCode || '';
        const priceConfigList = typeof PriceSystem !== 'undefined' ? PriceSystem.getPackPrice(packCodeList) : null;
        const priceValue = (priceConfigList && priceConfigList.pack) ? priceConfigList.pack : (pack.price || 0);

        // ——— 卡包封面图逻辑 ———
        // 优先级：packs.json 中的 coverImage > YGOProDeck set_image > 卡包首卡卡图 > emoji fallback
        const packCode = pack.packCode || pack.setCode || '';
        const coverImageUrl = getPackCoverImageUrl(pack, packCode, 'pack');

        // 卡包名称：OCG 优先中文名 > 日文名，TCG 使用英文名
        const packNameDisplay = (currentGameMode === 'ocg' && pack.packNameCN) ? pack.packNameCN
            : (currentGameMode === 'ocg' && pack.packNameJP) ? pack.packNameJP : pack.packName;
        // 副标题：英文缩写 + 数字编号，如 BLZD（1304）
        const packNumberInfo = pack.packNumber ? `${displayCode}（${pack.packNumber}）` : displayCode;
        const subInfo = packNumberInfo;
        // 发售日期
        const releaseDateText = pack.releaseDate || '';

        // P0-4: 首屏前3个卡包使用 eager 加载，其余使用 lazy 加载
        const loadingAttr = (currentPackCategory === 'recent' && packIndex < 3) ? 'eager' : 'lazy';

        // 锁定卡包：不显示价格和预览按钮，显示锁定标志
        if (pack.locked) {
            packCard.innerHTML = `
                <div class="pack-card__cover">
                    <div class="pack-cover-container">
                        <img class="pack-cover-img" src="${coverImageUrl}" alt="${packNameDisplay}" loading="${loadingAttr}"
                             width="80" height="139"
                             referrerpolicy="no-referrer"
                             onerror="handlePackCoverError(this);" />
                        <span class="pack-icon pack-icon-fallback" style="display:none;">🎴</span>
                        <span class="pack-card__lock-badge">🔒</span>
                    </div>
                </div>
                <div class="pack-card__info">
                    <div class="pack-card__name">${packNameDisplay}</div>
                    <div class="pack-card__meta">${subInfo}</div>
                    ${releaseDateText ? `<div class="pack-card__date">${releaseDateText}</div>` : ''}
                    <div class="pack-card__locked-hint">即将推出</div>
                </div>
            `;
            // 锁定卡包绑定封面图数据（供 onerror 使用）
            const imgEl = packCard.querySelector('.pack-cover-img');
            if (imgEl) imgEl._packData = pack;
        } else {
            packCard.innerHTML = `
                <div class="pack-card__cover">
                    <div class="pack-cover-container">
                        <img class="pack-cover-img" src="${coverImageUrl}" alt="${packNameDisplay}" loading="${loadingAttr}"
                             width="80" height="139"
                             referrerpolicy="no-referrer"
                             onerror="handlePackCoverError(this);" />
                        <span class="pack-icon pack-icon-fallback" style="display:none;">🎴</span>
                        <button class="pack-card__preview-icon" title="预览卡包内容">🔍</button>
                    </div>
                </div>
                <div class="pack-card__info">
                    <div class="pack-card__price"><span class="pack-price-icon">${priceIcon}</span>${priceValue}</div>
                    <div class="pack-card__name">${packNameDisplay}</div>
                    <div class="pack-card__meta">${subInfo}</div>
                    ${releaseDateText ? `<div class="pack-card__date">${releaseDateText}</div>` : ''}
                </div>
            `;

            // 将 pack 数据绑定到 DOM 元素上，供 onerror 回调使用
            const imgEl = packCard.querySelector('.pack-cover-img');
            if (imgEl) imgEl._packData = pack;

            // 预览按钮点击事件（卡图右上角放大镜图标，阻止冒泡）
            const previewBtn = packCard.querySelector('.pack-card__preview-icon');
            previewBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                showCardPreview(pack);
            });

            // 点击卡图封面区域也触发预览（阻止冒泡，不触发开包）
            const coverArea = packCard.querySelector('.pack-card__cover');
            coverArea.addEventListener('click', function (e) {
                e.stopPropagation();
                showCardPreview(pack);
            });

            // 点击卡包整体（右侧信息区域）触发开包
            packCard.addEventListener('click', function () {
                selectPack(pack);
            });
        }
        packListEl.appendChild(packCard);
    });
}

/**
 * 获取卡包封面图 URL
 * @param {Object} pack - 卡包数据对象
 * @param {string} packCode - 卡包编码
 * @param {string} type - 图片类型：'pack'（主界面卡包列表）或 'box'（开包详情界面）
 * 优先级（OCG 且有本地封面图时）：本地封面图 > coverImage > coverCardId > YGOProDeck > 空
 * 其他情况：coverImage > coverCardId 卡图 > YGOProDeck set_image > 空占位
 */
function getPackCoverImageUrl(pack, packCode, type) {
    type = type || 'pack';

    // OCG 模式下，使用本地 WebP 封面图（data/ocg/covers/{packCode}-{type}.webp）
    // 加载失败时直接 fallback 到 emoji
    if (currentGameMode === 'ocg' && packCode) {
        return `data/ocg/covers/${packCode}-${type}.webp`;
    }

    // 以下为原有逻辑，也作为非 OCG 模式的 fallback 目标
    return getPackCoverFallbackUrl(pack, packCode);
}

/**
 * 获取卡包封面图的 fallback URL（原有外部图源逻辑）
 * 从 getPackCoverImageUrl 中抽出，供 onerror fallback 使用
 */
/**
 * 获取卡包封面图的 fallback URL
 * 优先使用 packs.json 中手动配置的 coverImage（如 KONAMI 官方 URL）
 * 不再回退到外部 CDN
 */
function getPackCoverFallbackUrl(pack, packCode) {
    // 如果 packs.json 中手动配置了 coverImage，直接使用
    if (pack.coverImage) {
        return pack.coverImage;
    }

    return '';
}

/**
 * 卡包封面图加载失败时的处理函数
 * 简化逻辑：.webp 加载失败 → 直接显示 emoji
 */
async function handlePackCoverError(imgEl) {
    const pack = imgEl._packData;
    const fallbackIcon = imgEl.nextElementSibling;
    const failedUrl = imgEl.src;

    console.warn(`⚠️ 卡包封面图加载失败: ${pack ? pack.packId : '未知'}, URL: ${failedUrl}`);

    // 直接显示 emoji 兜底
    imgEl.style.display = 'none';
    if (fallbackIcon) fallbackIcon.style.display = 'block';
}

/**
 * 卡包封面图最终 fallback：直接显示 emoji
 * 不再尝试外部 CDN 首卡卡图
 */
async function handlePackCoverErrorFinal(imgEl) {
    const pack = imgEl._packData;
    const fallbackIcon = imgEl.nextElementSibling;

    console.warn(`⚠️ 卡包封面图加载失败，显示 emoji 兜底: ${pack ? pack.packId : '未知'}`);
    imgEl.style.display = 'none';
    if (fallbackIcon) fallbackIcon.style.display = 'block';
}

// ============================================
// 界面切换（显示/隐藏不同区域）
// ============================================

/** 选中一个卡包，开始加载卡牌数据 */
async function selectPack(pack) {
    currentPack = pack;

    // 显示加载状态
    const dataSourceName = currentGameMode === 'ocg' ? '本地数据' : 'YGOProDeck + YGOCDB';
    showLoadingState(`正在加载「${pack.packName}」...`);

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
            // 将辅助包数据注入到 pack 对象中
            if (cardFileData.supplementPack) {
                // 旧格式：辅助包数据内嵌在母包文件中
                pack.supplementPack = cardFileData.supplementPack;
            } else if (cardFileData.supplementPackFile) {
                // 新格式：辅助包数据在独立文件中，额外加载
                const suppUrl = `data/ocg/cards/${cardFileData.supplementPackFile}?v=${window.APP_VERSION || '0'}`;
                const suppResponse = await fetch(suppUrl);
                if (suppResponse.ok) {
                    pack.supplementPack = await suppResponse.json();
                    console.log(`📄 已加载辅助包文件 [${cardFileData.supplementPackFile}]`);
                } else {
                    console.warn(`⚠️ 辅助包文件加载失败: ${suppUrl}`);
                }
            }
            console.log(`📄 已加载独立卡牌文件 [${pack.cardFile}]，共 ${pack.cardIds.length} 张卡`);
        }

        // 通过 API 模块获取卡牌数据（根据模式选择不同数据源）
        const setData = await TCG_API.getCardSetData(currentGameMode, pack, function (loaded, total) {
            // OCG 模式下显示逐张卡牌的加载进度
            updateLoadingText(`正在从 ${dataSourceName} 加载「${pack.packName}」... (${loaded}/${total})`);
        });
        currentPackCards = setData.cards;
        currentSupplementCards = setData.supplementCards || null;

        // 更新开包界面信息
        const offlineTag = setData.isOfflineData ? ' [离线模式]' : '';
        // 卡包详情页标题：第一行中文名·缩写（编号），第二行日文名，第三行英文名
        const detailCode = pack.packCode || pack.setCode || pack.packId;
        const detailNumberInfo = pack.packNumber ? `${detailCode}（${pack.packNumber}）` : detailCode;
        const detailCNName = (currentGameMode === 'ocg' && pack.packNameCN) ? pack.packNameCN : '';
        const detailTitle = detailCNName
            ? `${detailCNName}·${detailNumberInfo}`
            : `${pack.packName}·${detailNumberInfo}`;
        const offlineLabel = (typeof offlineTag !== 'undefined' && offlineTag) ? offlineTag : '';
        document.getElementById('current-pack-name').textContent = detailTitle + offlineLabel;
        // 日文名（第二行）
        const jpNameEl = document.getElementById('current-pack-name-jp');
        if (jpNameEl) {
            jpNameEl.textContent = (currentGameMode === 'ocg' && pack.packNameJP) ? pack.packNameJP : '';
            jpNameEl.style.display = pack.packNameJP ? '' : 'none';
        }
        // 英文名（第三行）
        const enNameEl = document.getElementById('current-pack-name-en');
        if (enNameEl) {
            enNameEl.textContent = pack.packName || '';
            enNameEl.style.display = pack.packName ? '' : 'none';
        }

        // 设置卡包封面图（直接用 img.src，利用浏览器 HTTP 缓存秒显）
        const packCode = pack.packCode || pack.setCode || pack.packId;
        const coverUrl = getPackCoverImageUrl(pack, packCode, 'box');
        const coverImg = document.getElementById('current-pack-cover');
        const coverWrapper = coverImg ? coverImg.closest('.pack-cover-wrapper') : null;
        if (coverImg && coverUrl) {
            // 绑定 _packData 供 onerror fallback 使用
            coverImg._packData = pack;
            coverImg.classList.remove('is-loaded');
            coverImg.style.display = '';
            coverImg.alt = pack.packName;
            coverImg.src = coverUrl;
            // 缓存命中时 img.complete 为 true，跳过骨架屏和淡入动画直接显示
            if (coverImg.complete && coverImg.naturalWidth > 0) {
                coverImg.classList.add('is-loaded');
                if (coverWrapper) coverWrapper.classList.remove('is-loading');
            } else {
                // 网络加载：显示骨架屏，加载完成后淡入
                if (coverWrapper) coverWrapper.classList.add('is-loading');
                coverImg.onload = function() {
                    coverImg.classList.add('is-loaded');
                    if (coverWrapper) coverWrapper.classList.remove('is-loading');
                };
                // 本地封面图加载失败时的 fallback 逻辑（支持 png → jpg → 外部 URL）
                coverImg.onerror = function() {
                    const failedUrl = coverImg.src;
                    // 如果是本地封面图失败
                    if (failedUrl.includes('data/ocg/covers/')) {
                        // 如果当前是 .png 失败，先尝试 .jpg 格式
                        if (failedUrl.endsWith('.png')) {
                            const jpgUrl = failedUrl.replace(/\.png$/, '.jpg');
                            console.log(`🔄 详情页本地封面图 .png 不存在，尝试 .jpg: ${pack.packId}`);
                            coverImg.src = jpgUrl;
                            coverImg.onerror = function() {
                                // .jpg 也失败，走外部 URL
                                const fallbackUrl = getPackCoverFallbackUrl(pack, packCode);
                                if (fallbackUrl) {
                                    console.log(`🔄 详情页本地封面图均不存在，尝试外部 URL: ${pack.packId}`);
                                    coverImg.src = fallbackUrl;
                                    coverImg.onerror = function() {
                                        coverImg.style.display = 'none';
                                        if (coverWrapper) coverWrapper.classList.remove('is-loading');
                                    };
                                } else {
                                    coverImg.style.display = 'none';
                                    if (coverWrapper) coverWrapper.classList.remove('is-loading');
                                }
                            };
                            return;
                        }
                        // 如果是 .jpg 或其他格式失败，直接走外部 URL
                        const fallbackUrl = getPackCoverFallbackUrl(pack, packCode);
                        if (fallbackUrl) {
                            console.log(`🔄 详情页本地封面图不存在，尝试外部 URL: ${pack.packId}`);
                            coverImg.src = fallbackUrl;
                            coverImg.onerror = function() {
                                coverImg.style.display = 'none';
                                if (coverWrapper) coverWrapper.classList.remove('is-loading');
                            };
                            return;
                        }
                    }
                    coverImg.style.display = 'none';
                    if (coverWrapper) coverWrapper.classList.remove('is-loading');
                };
            }
        } else if (coverImg) {
            coverImg.style.display = 'none';
            if (coverWrapper) coverWrapper.classList.remove('is-loading');
        }

        // 点击封面图弹出大图查看器
        if (coverImg) {
            coverImg.onclick = function() {
                if (coverImg.src && coverImg.naturalWidth > 0) {
                    openCardImageViewer(coverImg.src, pack.packName || '');
                }
            };
        }

        const displayCode = pack.packCode || pack.setCode || pack.packId;
        document.getElementById('current-pack-desc').textContent =
            `${displayCode} | 共 ${currentPackCards.length} 种卡牌 | 每包抽取 ${pack.cardsPerPack} 张 | 数据: ${dataSourceName}${setData.isOfflineData ? '\n⚠️ 当前使用离线备用数据' : ''}`;

        // 显示开包价格信息
        updateOpenPackPriceInfo();

        hideLoadingState();
        switchSection('open-pack-section');

        // 更新开包统计展示（进入开包界面时）
        if (typeof PackStats !== 'undefined') {
            const statsCode = pack.packCode || pack.setCode || pack.packId;
            const ppb = pack.packsPerBox || 30;
            PackStats.updateStatsDisplay(statsCode, ppb);
        }

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
    currentSupplementCards = null;
    switchSection('pack-select-section');
}

/**
 * 从开包结果页返回到开包界面（上一层），不清除当前卡包数据
 */
function backToOpenPack() {
    switchSection('open-pack-section');
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

/**
 * 根据开包模式切换结果界面的按钮显示
 * @param {'pack'|'box'} mode - 'pack' 只显示再开1包，'box' 只显示再开1盒
 */
function toggleResultButtons(mode) {
    const againBtn = document.getElementById('btn-open-again');
    const againBoxBtn = document.getElementById('btn-open-again-box');
    const again3BoxBtn = document.getElementById('btn-open-again-3box');
    const quickReopen = document.getElementById('quick-reopen');
    const quickBtn = document.getElementById('btn-quick-reopen');

    // 记录当前开包模式，供快捷按钮使用
    currentOpenMode = mode;

    if (mode === 'pack') {
        if (againBtn) againBtn.style.display = '';
        if (againBoxBtn) againBoxBtn.style.display = 'none';
        if (again3BoxBtn) again3BoxBtn.style.display = 'none';
    } else if (mode === '3box') {
        if (againBtn) againBtn.style.display = 'none';
        if (againBoxBtn) againBoxBtn.style.display = 'none';
        if (again3BoxBtn) again3BoxBtn.style.display = '';
    } else {
        // mode === 'box'
        if (againBtn) againBtn.style.display = 'none';
        if (againBoxBtn) againBoxBtn.style.display = '';
        if (again3BoxBtn) again3BoxBtn.style.display = 'none';
    }

    // 更新快捷再开按钮的样式和显示（仅开盒模式显示，单包模式隐藏）
    if (quickReopen) {
        quickReopen.style.display = (mode === 'pack') ? 'none' : '';
    }
    if (quickBtn) {
        // 移除所有模式样式类
        quickBtn.classList.remove('btn-quick-reopen--box', 'btn-quick-reopen--3box');
        if (mode === '3box') {
            quickBtn.classList.add('btn-quick-reopen--3box');
        } else if (mode === 'box') {
            quickBtn.classList.add('btn-quick-reopen--box');
        }
    }
}

async function openPack() {
    if (!currentPack || !currentPackCards) return;

    // 1. 检查货币余额
    const currency = currentPack.currency || 'gold';
    // 单包价格：优先从价格配置文件读取，回退到 packs.json 的 price 字段
    const packCode = currentPack.packCode || currentPack.setCode || '';
    const priceConfig = typeof PriceSystem !== 'undefined' ? PriceSystem.getPackPrice(packCode) : null;
    const price = (priceConfig && priceConfig.pack) ? priceConfig.pack : (currentPack.price || 0);

    if (price > 0 && !CurrencySystem.canAfford(currency, price)) {
        const currDef = CurrencySystem.getCurrencyDef(currency);
        alert(`${currDef.icon} ${currDef.name}不足！\n\n开包需要 ${price} ${currDef.icon}${currDef.name}，当前只有 ${CurrencySystem.getBalance(currency)} ${currDef.icon}。\n\n可以在「⚙️ 设置」中手动添加金币。`);
        return;
    }

    // 2. 扣除货币
    if (price > 0) {
        CurrencySystem.spendBalance(currency, price);
        // 记录开包花费（用于背包总盈亏计算）
        InventorySystem.recordSpent(price);
    }

    // 3. 抽卡
    const drawnCards = drawCards(currentPack, currentPackCards);

    // 4. 更新卡图URL
    // 5. 根据稀有度更新卡图URL后存入背包
    updateCardsImageUrl(drawnCards);
    InventorySystem.addCards(drawnCards);

    // 5.5 记录开包统计（本地 + 全球上报）
    if (typeof PackStats !== 'undefined') {
        const statsCode = currentPack.packCode || currentPack.setCode || currentPack.packId;
        const ppb = currentPack.packsPerBox || 30;
        PackStats.recordOpen(statsCode, 'pack', 1, ppb);
    }

    // 6. 展示结果
    await showResults(drawnCards);

    // 根据开包模式显示/隐藏对应的再开按钮
    toggleResultButtons('pack');

    // 更新价格信息（余额可能变化）
    updateOpenPackPriceInfo();
}

/**
 * 开十包（批量开包）
 * 一次性开 count 包，所有卡片汇总展示
 * @param {number} count - 开包数量
 */
async function openMultiPacks(count, boxesCount) {
    if (!currentPack || !currentPackCards) return;

    // boxesCount: 开几盒（默认1盒），用于3盒模式
    boxesCount = boxesCount || 1;

    const currency = currentPack.currency || 'gold';
    // 整盒/多盒价格：优先从价格配置文件读取整盒价格，回退到 单包价×包数
    const packCodeMulti = currentPack.packCode || currentPack.setCode || '';
    const priceConfigMulti = typeof PriceSystem !== 'undefined' ? PriceSystem.getPackPrice(packCodeMulti) : null;
    const packPrice = (priceConfigMulti && priceConfigMulti.pack) ? priceConfigMulti.pack : (currentPack.price || 0);
    const boxPrice = (priceConfigMulti && priceConfigMulti.box) ? priceConfigMulti.box : null;
    const ppb = (currentPack && currentPack.packsPerBox) || 30;
    // 计算总价：如果有整盒价格配置且是整盒倍数，按整盒价格计算；否则按单包价×数量
    let totalPrice;
    if (boxPrice && count >= ppb && count % ppb === 0) {
        totalPrice = boxPrice * (count / ppb);
    } else {
        totalPrice = packPrice * count;
    }

    // 1. 检查总费用
    if (totalPrice > 0 && !CurrencySystem.canAfford(currency, totalPrice)) {
        const currDef = CurrencySystem.getCurrencyDef(currency);
        const balance = CurrencySystem.getBalance(currency);
        // 计算当前余额最多能开几包
        const affordCount = packPrice > 0 ? Math.floor(balance / packPrice) : count;
        if (affordCount <= 0) {
            alert(`${currDef.icon} ${currDef.name}不足！\n\n开${count}包需要 ${totalPrice} ${currDef.icon}${currDef.name}，当前只有 ${balance} ${currDef.icon}。\n\n可以在「⚙️ 设置」中手动添加金币。`);
            return;
        }
        // 余额不足以开满，询问是否开能负担的数量
        const confirmOpen = confirm(`${currDef.icon} ${currDef.name}不足以开${count}包（需要 ${totalPrice}，当前 ${balance}）。\n\n是否改为开 ${affordCount} 包？（花费 ${affordCount * packPrice} ${currDef.icon}）`);
        if (!confirmOpen) return;
        count = affordCount;
    }

    // 2. 扣除总费用（重新计算实际扣费，因为 count 可能已调整）
    let actualTotalPrice;
    if (boxPrice && count >= ppb && count % ppb === 0) {
        actualTotalPrice = boxPrice * (count / ppb);
    } else {
        actualTotalPrice = packPrice * count;
    }
    if (actualTotalPrice > 0) {
        CurrencySystem.spendBalance(currency, actualTotalPrice);
        // 记录开包花费（用于背包总盈亏计算）
        InventorySystem.recordSpent(actualTotalPrice);
    }

    // 4. 整盒抽卡：使用盒封入规则分配稀有度（OCG方案时）
    let allCards = [];
    let boxHasPSER = false;
    const scheme = currentPack.packScheme || 'legacy';
    
    if (scheme === 'ocg_default' && count === ((currentPack && currentPack.packsPerBox) || 30)) {
        // OCG整盒方案：按盒封入规则分配 1SER+1UTR+3UR+6SR+19R
        const boxResult = drawCardsBox_OCG(currentPack, currentPackCards);
        allCards = boxResult.allCards;
        boxHasPSER = boxResult.boxHasPSER;
        console.log(`📦 整盒抽卡完成：${allCards.length}张卡，PSER=${boxHasPSER ? '是' : '否'}`);
    } else if (scheme === 'loch_special' && count >= ((currentPack && currentPack.packsPerBox) || 15)) {
        // LOCH整盒方案：支持1盒或多盒（如3盒）
        for (let b = 0; b < boxesCount; b++) {
            const boxResult = drawCardsBox_LOCH(currentPack, currentPackCards);
            allCards.push(...boxResult.allCards);
            if (boxResult.boxHasPSER) boxHasPSER = true;
        }
        console.log(`📦 LOCH ${boxesCount}盒抽卡完成：${allCards.length}张卡`);
    } else {
        // 非OCG方案或非整盒：沿用逐包抽卡
        for (let i = 0; i < count; i++) {
            const drawnCards = drawCards(currentPack, currentPackCards);
            allCards.push(...drawnCards);
        }
    }

    // 5. +1特别包：从辅助包专属卡池中抽1张卡（含PSER互斥规则）
    // 带 boxesForBonus 的卡包（如LOCH 3盒送1包）：仅在多盒模式才赠送特别包
    // 普通卡包（如BLZD）：每盒送1张辅助包
    const bonusCards = [];
    const suppPool = currentSupplementCards || [];
    const hasBoxesForBonus = currentPack.boxesForBonus && currentPack.boxesForBonus >= 2;
    // 带 boxesForBonus 配置的卡包，开1盒不赠送辅助包，只有开满指定盒数才赠送
    const shouldSkipBonus = hasBoxesForBonus && boxesCount < currentPack.boxesForBonus;
    if (suppPool.length > 0 && !shouldSkipBonus) {
        // 确定需要抽几张辅助包卡：
        // - 带 boxesForBonus 的卡包（如LOCH 3盒送1包）：固定送1张特别包
        // - 普通卡包（如BLZD）：每盒1张，多盒就多张
        const bonusCount = hasBoxesForBonus ? 1 : boxesCount;

        for (let bi = 0; bi < bonusCount; bi++) {
            // 辅助包的PSER处理（修复：先判定PSER再选卡）：
            // - 同一盒中，原盒包和+1包合计只会出现一张PSER
            // - 一箱24盒配4个辅助包PSER（概率约16.7%）
            // - LOSP 全部都是 PSER，无需互斥处理
            const bonusPSERChance = currentPack.bonusPSERChance || (4 / 24); // 约16.7%
            // 筛选出有PSER版本的卡（rarityVersions中包含'PSER'且有多个版本）
            const pserCandidates = suppPool.filter(c => {
                const v = c.rarityVersions || [];
                return v.length > 1 && v.indexOf('PSER') >= 0;
            });
            
            let bonusCard;
            // 先判定是否出PSER：原盒未出PSER + 有PSER候选卡 + 命中概率
            if (!boxHasPSER && pserCandidates.length > 0 && Math.random() < bonusPSERChance) {
                // 命中PSER → 从有PSER版本的卡中随机选一张，强制使用PSER稀有度
                const pserIndex = Math.floor(Math.random() * pserCandidates.length);
                bonusCard = { ...pserCandidates[pserIndex] };
                bonusCard.rarityVersions = ['PSER'];
            } else {
                // 未命中PSER → 从全部辅助包卡池随机选一张，使用基础稀有度
                const randomIndex = Math.floor(Math.random() * suppPool.length);
                bonusCard = { ...suppPool[randomIndex] };
                const versions = bonusCard.rarityVersions || [];
                if (versions.length > 1) {
                    // 有多版本的卡在非PSER情况下使用基础稀有度
                    bonusCard.rarityVersions = [versions[0]];
                }
            }
            
            // 标记为辅助包卡片，方便后续识别
            bonusCard._isBonus = true;
            bonusCards.push(bonusCard);
        }
    } else {
        if (!shouldSkipBonus) {
            console.warn('⚠️ 当前卡包没有辅助包卡池数据，跳过+1辅助包');
        }
    }

    // 6. 根据稀有度更新卡图URL后存入背包
    updateCardsImageUrl(allCards);
    InventorySystem.addCards(allCards);
    if (bonusCards.length > 0) {
        updateCardsImageUrl(bonusCards);
        InventorySystem.addCards(bonusCards);
    }

    // 6.5 记录开盒统计（本地 + 全球上报）
    // 开盒以 box 类型记录，多盒模式记录多次
    if (typeof PackStats !== 'undefined') {
        const statsCode = currentPack.packCode || currentPack.setCode || currentPack.packId;
        const ppb = currentPack.packsPerBox || 30;
        PackStats.recordOpen(statsCode, 'box', boxesCount, ppb);
    }

    // 7. 展示汇总结果（传入辅助包卡片）
    await showResults(allCards, bonusCards);

    // 根据开盒模式显示/隐藏对应的再开按钮
    toggleResultButtons(boxesCount > 1 ? '3box' : 'box');

    // 更新价格信息（余额可能变化）
    updateOpenPackPriceInfo();
}

/**
 * 根据卡片的 _imageMap 和最终稀有度，更新卡片的 imageUrl / imageLargeUrl
 *
 * 【用途】
 * 在存入背包之前调用，确保背包中保存的是正确的本地卡图地址。
 * 例如 LOCH 卡包的 OF 超框卡版本需要使用对应的超框卡图。
 *
 * @param {Array} cards - 卡片数组（会直接修改其中的 imageUrl / imageLargeUrl）
 */
function updateCardsImageUrl(cards) {
    if (!Array.isArray(cards)) return;
    cards.forEach(function (card) {
        if (card._imageMap) {
            const rarity = (card.rarityVersions || ['N'])[0];
            const smallResult = getCardImageUrl(card.cardSetCode, card._imageMap, 'small', rarity);
            const largeResult = getCardImageUrl(card.cardSetCode, card._imageMap, 'large', rarity);
            card.imageUrl = smallResult.url;
            card.imageLargeUrl = largeResult.url;
        }
    });
}

/**
 * 抽卡入口 —— 根据卡包的 packScheme 分发到不同的抽卡方案
 * 
 * 【方案说明】
 * - ocg_default：OCG 默认方案 → 4张N卡 + 1张非N稀有卡，同包编号不重复，支持多版本稀有度随机
 * - loch_special：LOCH 专用方案 → 1SR+1SR+1UR+1全卡池随机，无N/R，4卡位不出完全相同的卡
 * - legacy：旧版方案 → 所有位置按 rarityRates 权重随机稀有度（兼容 TCG 和未配置的卡包）
 */
function drawCards(pack, cards) {
    const scheme = pack.packScheme || 'legacy';

    if (scheme === 'ocg_default') {
        return drawCards_OCG(pack, cards);
    }
    if (scheme === 'loch_special') {
        return drawCards_LOCH(pack, cards);
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
 * 1. 把卡池分为 N卡池 和 非N卡池（按 rarityVersions[0] 判断）
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

    // 获取多版本稀有度概率配置
    const modeConfig = getCurrentModeConfig();
    const versionOdds = pack.versionOdds || modeConfig.defaultVersionOdds || {};

    // NR 卡的权重比例（相对于普通 N 卡，默认 0.2 即 20%）
    const nrWeightRatio = pack.nrWeightRatio || 0.2;

    // --- 分池逻辑 ---
    // N池：rarityVersions[0] === 'N' 的卡（NR 卡也属于 N 卡卡池，但选中概率更低）
    // 非N池按稀有度分类：{ 'R': [...], 'SR': [...], 'UR': [...] }
    const nPool = [];       // N卡池（含 NR 卡，NR 卡会被标记）
    const poolByRarity = {};  // { 'R': [...], 'SR': [...], 'UR': [...] }

    cards.forEach(function (card) {
        const code = (card.rarityVersions || ['N'])[0];
        if (code === 'N') {
            // 判断是否为 NR 卡：rarityVersions 中包含 'NR' 的 N 卡
            const versions = card.rarityVersions || ['N'];
            const isNR = versions.indexOf('NR') >= 0;
            nPool.push({ card: card, isNR: isNR });
        } else {
            if (!poolByRarity[code]) {
                poolByRarity[code] = [];
            }
            poolByRarity[code].push(card);
        }
    });

    // 计算需要抽几张N卡（总数 - 1张非N位）
    const nCount = pack.cardsPerPack - 1;

    // --- 步骤1：从N池按权重随机抽 nCount 张（编号不重复）---
    // NR 卡的权重是普通 N 卡的 nrWeightRatio 倍（默认 20%）
    // 使用加权随机选择
    function weightedPickFromNPool(pool, usedSet) {
        // 过滤掉已选编号
        const available = pool.filter(function(item) {
            return !usedSet.has(item.card.setNumber || item.card.id);
        });
        if (available.length === 0) return null;

        // 计算权重：普通N卡权重=1，NR卡权重=nrWeightRatio
        const totalW = available.reduce(function(sum, item) {
            return sum + (item.isNR ? nrWeightRatio : 1);
        }, 0);

        let r = Math.random() * totalW;
        for (let i = 0; i < available.length; i++) {
            const w = available[i].isNR ? nrWeightRatio : 1;
            r -= w;
            if (r <= 0) {
                return available[i];
            }
        }
        return available[available.length - 1]; // 兜底
    }

    for (let n = 0; n < nCount; n++) {
        const picked = weightedPickFromNPool(nPool, usedSetNumbers);
        if (picked) {
            const setNum = picked.card.setNumber || picked.card.id;
            usedSetNumbers.add(setNum);
        // 如果抽到了 NR 卡，将 rarityVersions 设为 ['NR']（而不是 ['N']）
            const finalCard = { ...picked.card };
            if (picked.isNR) {
            finalCard.rarityVersions = ['NR'];
            }
            results.push(finalCard);
        }
    }

    // N池不够时兜底：从R池补充
    if (results.length < nCount) {
        const rPool = poolByRarity['R'] || [];
        const shuffledR = shuffleArray([...rPool]);
        for (let i = 0; i < shuffledR.length && results.length < nCount; i++) {
            const card = shuffledR[i];
            const setNum = card.setNumber || card.id;
            if (!usedSetNumbers.has(setNum)) {
                usedSetNumbers.add(setNum);
                results.push({ ...card });
            }
        }
    }

    // --- 步骤2：非N位按盒规则概率选择目标稀有度，再从对应池子中选卡 ---
    // 盒规则概率（基于 1SER+1UTR+3UR+6SR+19R = 30包）：
    // R=63.33%, SR=20%, UR=10%, SER=3.33%, UTR=3.33%
    // 注意：NR 不在非N位出现，NR 只在 N 卡位以低概率出现
    const boxDist = pack.boxRarityDistribution || { SER: 1, UTR: 1, UR: 3, SR: 6, R: 19 };
    const pserChance = pack.boxPSERChance || 0.25;   // SER变PSER的概率

    // 计算各稀有度在整盒中的权重（即概率分布）
    const rarityWeights = [];
    const rarityNames = Object.keys(boxDist).filter(function(k) { return k !== '_说明'; });
    rarityNames.forEach(function(rarity) {
        rarityWeights.push({ rarity: rarity, weight: boxDist[rarity] });
    });
    const totalWeight = rarityWeights.reduce(function(sum, rw) { return sum + rw.weight; }, 0);

    // 按权重随机选一个目标稀有度
    let roll = Math.random() * totalWeight;
    let targetRarity = rarityWeights[rarityWeights.length - 1].rarity; // 兜底
    for (let i = 0; i < rarityWeights.length; i++) {
        roll -= rarityWeights[i].weight;
        if (roll <= 0) {
            targetRarity = rarityWeights[i].rarity;
            break;
        }
    }

    // SER卡位有概率变为PSER
    if (targetRarity === 'SER' && Math.random() < pserChance) {
        targetRarity = 'PSER';
    }

    // （已移除：R卡位不再变为NR。NR 只在 N 卡位以低概率出现。）

    // --- 步骤2b：从目标稀有度的卡池中选一张卡 ---
    let rareCard = null;

    // 查找 rarityVersions 中包含目标稀有度的所有卡
    function findCardsForTargetRarity(target) {
        const result = [];
        cards.forEach(function (card) {
        const versions = card.rarityVersions || ['N'];
            if (versions.indexOf(target) >= 0) {
                result.push(card);
            }
        });
        return result;
    }

    const candidates = findCardsForTargetRarity(targetRarity);
    // 过滤掉已被N位选中的编号
    const available = candidates.filter(function(card) {
        return !usedSetNumbers.has(card.setNumber || card.id);
    });

    if (available.length > 0) {
        const picked = available[Math.floor(Math.random() * available.length)];
        rareCard = { ...picked, rarityVersions: [targetRarity] };
    } else if (candidates.length > 0) {
        // 所有候选卡都与N位重复了，允许重复（极低概率）
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        rareCard = { ...picked, rarityVersions: [targetRarity] };
    } else {
        // 找不到目标稀有度的卡（数据问题兜底），从所有非N池中随机选
        const allNonN = Object.values(poolByRarity).reduce(function(acc, arr) { return acc.concat(arr); }, []);
        const fallback = allNonN.filter(function(card) {
            return !usedSetNumbers.has(card.setNumber || card.id);
        });
        if (fallback.length > 0) {
            const picked = fallback[Math.floor(Math.random() * fallback.length)];
            rareCard = resolveCardVersion(picked, versionOdds);
        }
    }

    if (rareCard) {
        results.push(rareCard);
    }

    // --- 步骤3：按稀有度排序（N在前，最稀有的在后面，营造惊喜感）---
    results.sort(function (a, b) {
    return (RARITY_ORDER_ASC[(a.rarityVersions || ['N'])[0]] || 0) - (RARITY_ORDER_ASC[(b.rarityVersions || ['N'])[0]] || 0);
    });

    return results;
}

/**
 * ====================================
 * OCG 整盒抽卡方案 —— 按盒封入规则分配30包的稀有度
 * ====================================
 * 
 * 【1304封入规则】
 * 1盒30包，每包5张（4N + 1非N位）
 * 1盒内的非N位出率为：1SER + 1UTR + 3UR + 6SR + 19R
 * - SER卡位有概率变为PSER（原盒概率约25%，即一箱24盒中6盒）
 * - R卡位有10%概率变为NR
 * 
 * @param {Object} pack - 卡包配置（含 boxRarityDistribution 等）
 * @param {Array} cards - 卡池（currentPackCards）
 * @returns {{ allCards: Array, boxHasPSER: boolean }} 150张卡 + 是否出了PSER
 */
function drawCardsBox_OCG(pack, cards) {
    const allCards = [];
    
    // 获取整盒封入配置（从卡包配置中读取，兜底用默认值）
    const boxDist = pack.boxRarityDistribution || {
        SER: 1, UTR: 1, UR: 3, SR: 6, R: 19
    };
    const pserChance = pack.boxPSERChance || 0.25;  // 原盒PSER概率（默认25%）
    // NR 卡的权重比例（相对于普通 N 卡，默认 0.2 即 20%）
    const nrWeightRatio = pack.nrWeightRatio || 0.2;
    
    // 获取多版本稀有度概率配置
    const modeConfig = getCurrentModeConfig();
    const versionOdds = pack.versionOdds || modeConfig.defaultVersionOdds || {};
    
    // --- 步骤1：生成30个非N位的稀有度分配列表 ---
    // 注意：NR 不在非N位出现，NR 只在 N 卡位以低概率出现
    const rareSlots = [];
    let boxHasPSER = false;
    
    // SER卡位（有概率变PSER）
    for (let i = 0; i < (boxDist.SER || 0); i++) {
        if (!boxHasPSER && Math.random() < pserChance) {
            rareSlots.push('PSER');
            boxHasPSER = true;
        } else {
            rareSlots.push('SER');
        }
    }
    // UTR卡位
    for (let i = 0; i < (boxDist.UTR || 0); i++) {
        rareSlots.push('UTR');
    }
    // UR卡位
    for (let i = 0; i < (boxDist.UR || 0); i++) {
        rareSlots.push('UR');
    }
    // SR卡位
    for (let i = 0; i < (boxDist.SR || 0); i++) {
        rareSlots.push('SR');
    }
    // R卡位（不再变NR——NR属于N卡卡池）
    for (let i = 0; i < (boxDist.R || 0); i++) {
        rareSlots.push('R');
    }
    
    // 打乱分配顺序（哪一包出什么稀有度是随机的）
    const shuffledSlots = shuffleArray([...rareSlots]);
    
    // --- 步骤2：按分池分类卡池 ---
    // N池：rarityVersions[0] === 'N' 的卡（NR 卡也属于 N 卡卡池，但选中概率更低）
    // 非N池按稀有度分类：{ 'R': [...], 'SR': [...], 'UR': [...] }
    const nPool = [];       // N卡池（含 NR 卡，NR 卡会被标记）
    const poolByRarity = {}; // { 'SR': [...], 'UR': [...], ... }
    
    cards.forEach(function (card) {
        const baseCode = (card.rarityVersions || ['N'])[0];
        if (baseCode === 'N') {
            // 判断是否为 NR 卡：rarityVersions 中包含 'NR' 的 N 卡
            const versions = card.rarityVersions || ['N'];
            const isNR = versions.indexOf('NR') >= 0;
            nPool.push({ card: card, isNR: isNR });
        } else {
            if (!poolByRarity[baseCode]) {
                poolByRarity[baseCode] = [];
            }
            poolByRarity[baseCode].push(card);
        }
    });
    
    // 构建 "可以出某种目标稀有度的卡" 的查找函数
    // 例如目标是SER → 找所有 rarityVersions 包含 SER 的卡
    // 例如目标是PSER → 找所有 rarityVersions 包含 PSER 的卡
    // 注意：NR 不在非N位出现，NR 只在 N 卡位以低概率出现
    function findCardsForTargetRarity(targetRarity) {
        const result = [];
        cards.forEach(function (card) {
            const versions = card.rarityVersions || ['N'];
            if (versions.indexOf(targetRarity) >= 0) {
                result.push(card);
            }
        });
        return result;
    }
    
    // --- 步骤3：为每个非N位分配具体的卡 ---
    const nCount = (pack.cardsPerPack || 5) - 1; // 每包N卡数量
    
    for (let packIdx = 0; packIdx < shuffledSlots.length; packIdx++) {
        const targetRarity = shuffledSlots[packIdx];
        const usedSetNumbers = new Set(); // 同包内编号不重复
        const packCards = [];
        
        // --- 步骤3a：先抽非N位的1张卡 ---
        let rareCard = null;
        
        if (targetRarity === 'PSER') {
            // PSER：需要找 rarityVersions 包含 PSER 的卡
            const candidates = findCardsForTargetRarity(targetRarity);
            if (candidates.length > 0) {
                const picked = candidates[Math.floor(Math.random() * candidates.length)];
                rareCard = { ...picked, rarityVersions: [targetRarity] };
            }
        }
        
        if (!rareCard) {
            // 普通稀有度（SER/UTR/UR/SR/R）：
            // 优先从 rarityVersions 包含该稀有度的卡中选
            const candidates = findCardsForTargetRarity(targetRarity);
            if (candidates.length > 0) {
                const picked = candidates[Math.floor(Math.random() * candidates.length)];
                rareCard = { ...picked, rarityVersions: [targetRarity] };
            } else {
                // 兜底：从对应基础稀有度池中选，走 versionOdds 随机
                const basePool = poolByRarity[targetRarity] || [];
                // 如果基础池也没有，从全部非N池中随机选
                const fallbackPool = basePool.length > 0 ? basePool : 
                    Object.values(poolByRarity).reduce(function(acc, arr) { return acc.concat(arr); }, []);
                if (fallbackPool.length > 0) {
                    const picked = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
                    rareCard = resolveCardVersion(picked, versionOdds);
                }
            }
        }
        
        if (rareCard) {
            usedSetNumbers.add(rareCard.setNumber || rareCard.id);
            packCards.push(rareCard);
        }
        
        // --- 步骤3b：抽 nCount 张N卡（编号不与非N位重复，NR卡以低概率出现）---
        // NR 卡属于 N 卡卡池，但权重只有普通 N 卡的 nrWeightRatio 倍
        function weightedPickFromNPoolBox(pool, usedSet) {
            const avail = pool.filter(function(item) {
                return !usedSet.has(item.card.setNumber || item.card.id);
            });
            if (avail.length === 0) return null;
            const totalW = avail.reduce(function(sum, item) {
                return sum + (item.isNR ? nrWeightRatio : 1);
            }, 0);
            let r = Math.random() * totalW;
            for (let j = 0; j < avail.length; j++) {
                const w = avail[j].isNR ? nrWeightRatio : 1;
                r -= w;
                if (r <= 0) return avail[j];
            }
            return avail[avail.length - 1];
        }
        
        let nDrawn = 0;
        for (let n = 0; n < nCount; n++) {
            const picked = weightedPickFromNPoolBox(nPool, usedSetNumbers);
            if (picked) {
                const setNum = picked.card.setNumber || picked.card.id;
                usedSetNumbers.add(setNum);
                const finalCard = { ...picked.card };
                if (picked.isNR) {
            finalCard.rarityVersions = ['NR'];
                }
                packCards.push(finalCard);
                nDrawn++;
            }
        }
        
        // --- 步骤3c：按稀有度排序（N在前，稀有在后，营造惊喜感）---
        packCards.sort(function (a, b) {
    return (RARITY_ORDER_ASC[(a.rarityVersions || ['N'])[0]] || 0) - (RARITY_ORDER_ASC[(b.rarityVersions || ['N'])[0]] || 0);
        });
        
        allCards.push(...packCards);
    }
    
    return { allCards: allCards, boxHasPSER: boxHasPSER };
}

// ============================================
// LOCH 专用方案：全稀有包（38UR+42SR），4卡位特殊规则
// ============================================

/**
 * LOCH 专用单包抽卡方案
 * 
 * 【规则】
 * - 1号位：从42种SR中随机1张，必出SR（基础稀有度）
 * - 2号位：从42种SR中随机1张，必出SR（基础稀有度），与1号位不同卡
 * - 3号位：从38种UR中随机1张，必出UR（基础稀有度）
 * - 4号位：从全80种中随机1张，按 versionOdds 概率随机决定版本
 * - 去重规则：4个卡位不得出现完全相同的卡（同编号不同稀有度版本 ≠ 相同）
 * 
 * 「完全相同」的定义：编号相同 且 稀有度版本相同
 */
function drawCards_LOCH(pack, cards) {
    const results = [];
    // usedCards 记录已选的 "编号+稀有度" 组合，用于去重
    const usedCards = new Set();

    // 获取多版本稀有度概率配置
    const modeConfig = getCurrentModeConfig();
    const versionOdds = pack.versionOdds || modeConfig.defaultVersionOdds || {};

    // --- 分池：SR池（基础稀有度为SR的42种）和UR池（基础稀有度为UR的38种）---
    const srPool = [];
    const urPool = [];
    cards.forEach(function(card) {
        const baseRarity = (card.rarityVersions || ['N'])[0];
        if (baseRarity === 'SR') {
            srPool.push(card);
        } else if (baseRarity === 'UR') {
            urPool.push(card);
        }
    });

    // 生成唯一标识：编号 + 稀有度版本
    function cardKey(setNumber, rarity) {
        return setNumber + '|' + rarity;
    }

    // 从池子中随机选一张，排除 usedCards 中已有的 "编号+稀有度" 组合
    function pickFromPool(pool, forcedRarity) {
        const available = pool.filter(function(card) {
            const sn = card.setNumber || card.id;
            return !usedCards.has(cardKey(sn, forcedRarity));
        });
        if (available.length === 0) return null;
        const picked = available[Math.floor(Math.random() * available.length)];
        return { ...picked, rarityVersions: [forcedRarity] };
    }

    // --- 1号位：SR池随机1张，必出SR ---
    const slot1 = pickFromPool(srPool, 'SR');
    if (slot1) {
        usedCards.add(cardKey(slot1.setNumber || slot1.id, 'SR'));
        results.push(slot1);
    }

    // --- 2号位：SR池随机1张，必出SR，不与1号位完全相同 ---
    const slot2 = pickFromPool(srPool, 'SR');
    if (slot2) {
        usedCards.add(cardKey(slot2.setNumber || slot2.id, 'SR'));
        results.push(slot2);
    }

    // --- 3号位：UR池随机1张，必出UR ---
    const slot3 = pickFromPool(urPool, 'UR');
    if (slot3) {
        usedCards.add(cardKey(slot3.setNumber || slot3.id, 'UR'));
        results.push(slot3);
    }

    // --- 4号位：按整盒分布概率决定版本类型，再从对应卡池随机选卡 ---
    // 散包4号位与整盒概率完全一致：
    //   先按 boxSlot4Distribution (OF:1, PSER:1, UTR:2, CR:2, SER:9) 概率决定版本
    //   如果命中OF，再按 ofTypeOdds (PSER-OF:36, UR-OF:107, GMR-OF:1) 决定OF子类型
    //   最后从拥有该版本的卡池中随机选一张卡
    //   GMR-OF概率 = 1/15 × 1/144 = 1/2160（6箱出1张）
    const boxSlot4Dist = pack.boxSlot4Distribution || { OF: 1, PSER: 1, UTR: 2, CR: 2, SER: 9 };
    const ofTypeOdds = pack.ofTypeOdds || { 'PSER-OF': 36, 'UR-OF': 107, 'GMR-OF': 1 };

    // 步骤1：按 boxSlot4Distribution 比例概率选择版本类型
    const slot4Types = Object.keys(boxSlot4Dist).filter(function(k) { return k !== '_说明'; });
    const slot4Weights = slot4Types.map(function(t) { return boxSlot4Dist[t]; });
    const slot4TotalWeight = slot4Weights.reduce(function(s, w) { return s + w; }, 0);

    function rollSlot4Rarity() {
        var roll = Math.random() * slot4TotalWeight;
        for (var i = 0; i < slot4Types.length; i++) {
            roll -= slot4Weights[i];
            if (roll <= 0) return slot4Types[i];
        }
        return slot4Types[slot4Types.length - 1]; // 兜底
    }

    var targetRarity = rollSlot4Rarity();

    // 步骤2：如果命中OF，按 ofTypeOdds 概率决定具体OF子类型
    if (targetRarity === 'OF') {
        var ofTypes = Object.keys(ofTypeOdds).filter(function(k) { return k !== '_说明'; });
        var ofWeights = ofTypes.map(function(t) { return ofTypeOdds[t]; });
        var ofTotal = ofWeights.reduce(function(s, w) { return s + w; }, 0);
        var ofRoll = Math.random() * ofTotal;
        targetRarity = ofTypes[ofTypes.length - 1]; // 兜底
        for (var i = 0; i < ofTypes.length; i++) {
            ofRoll -= ofWeights[i];
            if (ofRoll <= 0) {
                targetRarity = ofTypes[i];
                break;
            }
        }
    }

    // 步骤3：从拥有该版本的卡中随机选一张（排除包内重复）
    var candidates = cards.filter(function(card) {
        var versions = card.rarityVersions || ['N'];
        return versions.indexOf(targetRarity) >= 0;
    });
    var available = candidates.filter(function(card) {
        var sn = card.setNumber || card.id;
        return !usedCards.has(cardKey(sn, targetRarity));
    });

    let slot4 = null;
    if (available.length > 0) {
        var picked = available[Math.floor(Math.random() * available.length)];
        slot4 = { ...picked, rarityVersions: [targetRarity] };
    } else if (candidates.length > 0) {
        // 兜底：忽略包内去重
        var picked = candidates[Math.floor(Math.random() * candidates.length)];
        slot4 = { ...picked, rarityVersions: [targetRarity] };
    } else {
        // 极端兜底：全卡池SER
        var picked = cards[Math.floor(Math.random() * cards.length)];
        slot4 = { ...picked, rarityVersions: ['SER'] };
    }
    results.push(slot4);

    // --- 按稀有度排序（低→高，营造惊喜感）---
    results.sort(function(a, b) {
        return (RARITY_ORDER_ASC[(a.rarityVersions || ['N'])[0]] || 0) -
               (RARITY_ORDER_ASC[(b.rarityVersions || ['N'])[0]] || 0);
    });

    // --- 根据最终稀有度更新卡图URL（OF 超框卡版本使用不同卡图）---
    results.forEach(function(card) {
        if (card._imageMap) {
            const rarity = (card.rarityVersions || ['N'])[0];
            const smallResult = getCardImageUrl(card.cardSetCode, card._imageMap, 'small', rarity);
            const largeResult = getCardImageUrl(card.cardSetCode, card._imageMap, 'large', rarity);
            card.imageUrl = smallResult.url;
            card.imageLargeUrl = largeResult.url;
        }
    });

    return results;
}

/**
 * LOCH 专用整盒抽卡方案（15包）
 * 
 * 【规则】
 * - 1-3号位：每包与散包相同（1号位SR，2号位SR，3号位UR）
 * - 4号位：15包按 boxSlot4Distribution 强制分配稀有度
 *   1张OF + 1张PSER + 2张UTR + 2张CR + 9张SER = 15包
 * - OF卡按 ofTypeOdds 概率决定具体OF类型（PSER-OF / UR-OF / GMR-OF）
 * - 4号位的15张卡编号不重复（同编号不同版本不算重复）
 * - 每包内4个卡位不出完全相同的卡（同编号不同版本不算重复）
 */
function drawCardsBox_LOCH(pack, cards) {
    const allCards = [];

    // 获取配置
    const modeConfig = getCurrentModeConfig();
    const versionOdds = pack.versionOdds || modeConfig.defaultVersionOdds || {};
    const boxSlot4Dist = pack.boxSlot4Distribution || { OF: 1, PSER: 1, UTR: 2, CR: 2, SER: 9 };
    const ofTypeOdds = pack.ofTypeOdds || { 'PSER-OF': 36, 'UR-OF': 107, 'GMR-OF': 1 };

    // --- 分池 ---
    const srPool = [];
    const urPool = [];
    cards.forEach(function(card) {
        const baseRarity = (card.rarityVersions || ['N'])[0];
        if (baseRarity === 'SR') srPool.push(card);
        else if (baseRarity === 'UR') urPool.push(card);
    });

    // --- 步骤1：生成15包4号位的稀有度分配列表 ---
    const slot4Rarities = [];

    // OF卡位：按ofTypeOdds概率决定具体OF类型
    for (let i = 0; i < (boxSlot4Dist.OF || 0); i++) {
        const ofTypes = Object.keys(ofTypeOdds).filter(function(k) { return k !== '_说明'; });
        const ofWeights = ofTypes.map(function(t) { return ofTypeOdds[t]; });
        const ofTotal = ofWeights.reduce(function(s, w) { return s + w; }, 0);
        let ofRoll = Math.random() * ofTotal;
        let pickedOF = ofTypes[ofTypes.length - 1]; // 兜底
        for (let j = 0; j < ofTypes.length; j++) {
            ofRoll -= ofWeights[j];
            if (ofRoll <= 0) {
                pickedOF = ofTypes[j];
                break;
            }
        }
        slot4Rarities.push(pickedOF);
    }
    // PSER
    for (let i = 0; i < (boxSlot4Dist.PSER || 0); i++) {
        slot4Rarities.push('PSER');
    }
    // UTR
    for (let i = 0; i < (boxSlot4Dist.UTR || 0); i++) {
        slot4Rarities.push('UTR');
    }
    // CR
    for (let i = 0; i < (boxSlot4Dist.CR || 0); i++) {
        slot4Rarities.push('CR');
    }
    // SER
    for (let i = 0; i < (boxSlot4Dist.SER || 0); i++) {
        slot4Rarities.push('SER');
    }

    // 打乱4号位的稀有度分配顺序
    const shuffledSlot4 = shuffleArray([...slot4Rarities]);

    // 4号位已用编号集合（同编号不重复，不同版本不算重复）
    const usedSlot4SetNumbers = new Set();

    // 辅助函数：生成唯一标识
    function cardKey(setNumber, rarity) {
        return setNumber + '|' + rarity;
    }

    // 辅助函数：找到rarityVersions包含目标稀有度的卡
    function findCardsWithRarity(targetRarity) {
        return cards.filter(function(card) {
            const versions = card.rarityVersions || ['N'];
            return versions.indexOf(targetRarity) >= 0;
        });
    }

    // --- 步骤2：逐包生成卡片 ---
    for (let packIdx = 0; packIdx < shuffledSlot4.length; packIdx++) {
        const packCards = [];
        // 当前包内已用的 "编号+稀有度" 组合
        const usedInPack = new Set();

        // 从池子中随机选一张（排除包内重复）
        function pickFromPool(pool, forcedRarity) {
            const available = pool.filter(function(card) {
                const sn = card.setNumber || card.id;
                return !usedInPack.has(cardKey(sn, forcedRarity));
            });
            if (available.length === 0) return null;
            const picked = available[Math.floor(Math.random() * available.length)];
            return { ...picked, rarityVersions: [forcedRarity] };
        }

        // --- 1号位：SR ---
        const slot1 = pickFromPool(srPool, 'SR');
        if (slot1) {
            usedInPack.add(cardKey(slot1.setNumber || slot1.id, 'SR'));
            packCards.push(slot1);
        }

        // --- 2号位：SR ---
        const slot2 = pickFromPool(srPool, 'SR');
        if (slot2) {
            usedInPack.add(cardKey(slot2.setNumber || slot2.id, 'SR'));
            packCards.push(slot2);
        }

        // --- 3号位：UR ---
        const slot3 = pickFromPool(urPool, 'UR');
        if (slot3) {
            usedInPack.add(cardKey(slot3.setNumber || slot3.id, 'UR'));
            packCards.push(slot3);
        }

        // --- 4号位：按整盒分配的目标稀有度 ---
        const targetRarity = shuffledSlot4[packIdx];
        let slot4 = null;

        // 找所有 rarityVersions 包含该目标稀有度的卡
        const candidates = findCardsWithRarity(targetRarity);
        // 过滤掉：1) 包内已有完全相同的卡 2) 整盒4号位已用的编号
        const available = candidates.filter(function(card) {
            const sn = card.setNumber || card.id;
            return !usedInPack.has(cardKey(sn, targetRarity)) &&
                   !usedSlot4SetNumbers.has(sn);
        });

        if (available.length > 0) {
            const picked = available[Math.floor(Math.random() * available.length)];
            slot4 = { ...picked, rarityVersions: [targetRarity] };
        } else if (candidates.length > 0) {
            // 放宽条件：忽略整盒编号去重限制（极低概率兜底）
            const fallback = candidates.filter(function(card) {
                const sn = card.setNumber || card.id;
                return !usedInPack.has(cardKey(sn, targetRarity));
            });
            if (fallback.length > 0) {
                const picked = fallback[Math.floor(Math.random() * fallback.length)];
                slot4 = { ...picked, rarityVersions: [targetRarity] };
            } else {
                // 极端兜底
                const picked = candidates[Math.floor(Math.random() * candidates.length)];
                slot4 = { ...picked, rarityVersions: [targetRarity] };
            }
        }

        if (slot4) {
            const sn = slot4.setNumber || slot4.id;
            usedSlot4SetNumbers.add(sn);
            usedInPack.add(cardKey(sn, targetRarity));
            packCards.push(slot4);
        }

        // --- 按稀有度排序（低→高）---
        packCards.sort(function(a, b) {
            return (RARITY_ORDER_ASC[(a.rarityVersions || ['N'])[0]] || 0) -
                   (RARITY_ORDER_ASC[(b.rarityVersions || ['N'])[0]] || 0);
        });

        allCards.push(...packCards);
    }

    // --- 根据最终稀有度更新卡图URL（OF 超框卡版本使用不同卡图）---
    allCards.forEach(function(card) {
        if (card._imageMap) {
            const rarity = (card.rarityVersions || ['N'])[0];
            const smallResult = getCardImageUrl(card.cardSetCode, card._imageMap, 'small', rarity);
            const largeResult = getCardImageUrl(card.cardSetCode, card._imageMap, 'large', rarity);
            card.imageUrl = smallResult.url;
            card.imageLargeUrl = largeResult.url;
        }
    });

    // 返回格式与 drawCardsBox_OCG 一致
    return { allCards: allCards, boxHasPSER: false };
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
        result.rarityVersions = [versions[i]];
            return result;
        }
    }

    // 兜底：返回最后一个版本
    result.rarityVersions = [versions[versions.length - 1]];
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
        const code = (card.rarityVersions || ['N'])[0];
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

    // 按稀有度排序：N → NR → R → SR → UR → UTR → SER → PSER
    results.sort(function (a, b) {
    return (RARITY_ORDER_ASC[(a.rarityVersions || ['N'])[0]] || 0) - (RARITY_ORDER_ASC[(b.rarityVersions || ['N'])[0]] || 0);
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

/** 展示抽到的卡牌
 * @param {Array} cards - 主卡片数组（开包/开盒抽到的卡）
 * @param {Array} [bonusCards=[]] - 辅助包卡片数组（仅开盒时传入）
 */
async function showResults(cards, bonusCards) {
    bonusCards = bonusCards || [];
    const display = document.getElementById('cards-display');
    display.innerHTML = '';

    // 稀有度排序优先级（直接复用全局 RARITY_ORDER_ASC，由 rarities.json 动态生成）
    const RARITY_RANK = RARITY_ORDER_ASC;

    // 多包模式下：合并相同卡片 + 按稀有度排序
    let displayCards = cards;
    if (cards.length > 5) {
        // 按「卡片唯一标识 + 稀有度」分组合并
        // 优先使用 cardSetCode（如 BLZD-JP001），其次 id，最后 name
        const mergeMap = new Map();
        for (const card of cards) {
            const cardKey = card.cardSetCode || card.id || card.name;
        const key = `${cardKey}_${(card.rarityVersions || ['N'])[0]}`;
            if (mergeMap.has(key)) {
                mergeMap.get(key).count++;
            } else {
                mergeMap.set(key, { ...card, count: 1 });
            }
        }
        console.log(`🃏 合并前: ${cards.length} 张, 合并后: ${mergeMap.size} 张`);
        displayCards = Array.from(mergeMap.values());

        // 按稀有度从高到低排序
        displayCards.sort((a, b) => {
            const rankA = RARITY_RANK[(a.rarityVersions || ['N'])[0]] ?? 0;
            const rankB = RARITY_RANK[(b.rarityVersions || ['N'])[0]] ?? 0;
            return rankB - rankA;
        });
    }

    // 计算每张卡的动画延迟，总时长不超过 2 秒
    const maxTotalDelay = 2; // 秒
    const perCardDelay = Math.min(.15, maxTotalDelay / displayCards.length);

    // 使用 DocumentFragment 批量插入，避免逐个 appendChild 触发重排
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < displayCards.length; i++) {
        const card = displayCards[i];
        const cardEl = document.createElement('div');
        const rarityCode = (card.rarityVersions || ['N'])[0];
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
                              data-large-url="${largeUrl}" data-card-name="${cardName}" data-card-foreign="${foreignName}" data-card-set-code="${card.cardSetCode || ''}"
                              onerror="handleCardImageError(this)">
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

        // 数量角标（合并后数量 > 1 时显示）
        const countBadge = (card.count && card.count > 1)
            ? `<span class="card-count-badge">×${card.count}</span>`
            : '';

        cardEl.innerHTML = `
            <span class="card-rarity-badge rarity-${rarityCode}">${rarityCode}</span>
            ${countBadge}
            ${imageHtml}
            <div class="card-name-wrapper">
                ${nameHtml}
            </div>
        `;

        fragment.appendChild(cardEl);
    }
    display.appendChild(fragment);

    // 渲染+1辅助包区域（仅开盒时显示）
    const bonusDisplay = document.getElementById('bonus-display');
    const bonusCardsEl = document.getElementById('bonus-cards');
    if (bonusDisplay && bonusCardsEl) {
        if (bonusCards.length > 0) {
            bonusDisplay.style.display = '';
            bonusCardsEl.innerHTML = '';
            // 使用 DocumentFragment 批量插入附赠卡
            const bonusFragment = document.createDocumentFragment();
            for (const card of bonusCards) {
                const cardEl = document.createElement('div');
        const rarityCode = (card.rarityVersions || ['N'])[0];
        cardEl.className = `card-item rarity-${rarityCode}`;

                let imageHtml;
                if (card.imageUrl) {
                    const largeUrl = card.imageLargeUrl || card.imageUrl;
                    const cardName = card.nameCN || card.name;
                    const foreignName = card.nameOriginal || '';
                    imageHtml = `<img class="card-image clickable" src="${card.imageUrl}" alt="${cardName}" loading="lazy"
                                      data-large-url="${largeUrl}" data-card-name="${cardName}" data-card-foreign="${foreignName}" data-card-set-code="${card.cardSetCode || ''}"
                                      onerror="handleCardImageError(this)">
                                 <span class="card-icon" style="display:none;">${getCardIcon(rarityCode)}</span>`;
                } else {
                    imageHtml = `<span class="card-icon">${getCardIcon(rarityCode)}</span>`;
                }

                let nameHtml;
                if (card.nameCN && card.nameCN !== card.nameOriginal) {
                    nameHtml = `<span class="card-name-cn">${card.nameCN}</span>
                                <span class="card-name-foreign">${card.nameOriginal || card.name}</span>`;
                } else {
                    nameHtml = `<span class="card-name-single">${card.name}</span>`;
                }

                cardEl.innerHTML = `
                    <span class="card-rarity-badge rarity-${rarityCode}">${rarityCode}</span>
                    ${imageHtml}
                    <div class="card-name-wrapper">
                        ${nameHtml}
                    </div>
                `;
                bonusFragment.appendChild(cardEl);
            }
            bonusCardsEl.appendChild(bonusFragment);
        } else {
            // 非开盒模式，隐藏辅助包区域
            bonusDisplay.style.display = 'none';
            bonusCardsEl.innerHTML = '';
        }
    }

    // 更新结果标题（根据卡片数量判断是否为批量开包）
    const cardsPerPack = (currentPack && currentPack.cardsPerPack) || 5;
    const packCount = Math.round(cards.length / cardsPerPack);
    const resultTitle = document.querySelector('#result-section .section-title');
    if (resultTitle) {
        resultTitle.textContent = packCount > 1 ? `开包结果 (×${packCount})` : '开包结果';
    }

    // 统计各稀有度的数量（使用原始cards数组而非合并后的displayCards，含辅助包）
    const allStatsCards = cards.concat(bonusCards);
    const rarityStats = {};
    for (const card of allStatsCards) {
        const r = (card.rarityVersions || ['N'])[0];
        rarityStats[r] = (rarityStats[r] || 0) + 1;
    }
    // 按稀有度从高到低排序后渲染统计行（使用 rarities.json 动态生成的排序）
const rarityOrder = RARITY_CODES_DESC;
    const statsEl = document.getElementById('rarity-stats');
    if (statsEl) {
        const items = rarityOrder
            .filter(r => rarityStats[r])
            .map(r => `<span class="rarity-stats__item rarity-stats__item--${r}">${r} ×${rarityStats[r]}</span>`)
            .join('');
        statsEl.innerHTML = items;
        // 强制确保统计行在标题之后、辅助包之前
        const resultSection = document.getElementById('result-section');
        const bonusEl = document.getElementById('bonus-display');
        if (resultSection && bonusEl) {
            resultSection.insertBefore(statsEl, bonusEl);
        }
    }

    // ====== 价格统计：卡片价值 & 开包盈亏 ======
    const priceStatsEl = document.getElementById('price-stats');
    if (priceStatsEl && typeof PriceSystem !== 'undefined') {
        // 计算卡片总价值（含辅助包卡片）
        let totalCardValue = 0;
        let hasPriceData = false;
        for (const card of allStatsCards) {
            const cardSetCode = card.cardSetCode || '';
            const rarity = (card.rarityVersions || ['N'])[0];
            const price = PriceSystem.getCardPrice(cardSetCode, rarity);
            if (price !== null) {
                totalCardValue += price * (card.count || 1);
                hasPriceData = true;
            }
        }

        // 计算开包支出（不含 +1 附赠包的价格）
        const packCode = currentPack && (currentPack.packCode || currentPack.setCode || '');
        const packPriceInfo = PriceSystem.getPackPrice(packCode);
        let totalCost = 0;
        if (packPriceInfo) {
            // 根据开包数量判断是否按整盒计算
            const ppb = (currentPack && currentPack.packsPerBox) || 30;
            if (packPriceInfo.box && packCount >= ppb) {
                // 按整盒价格计算（包数 / 每盒包数 = 盒数）
                const boxCount = Math.round(packCount / ppb);
                totalCost = packPriceInfo.box * boxCount;
            } else if (packPriceInfo.pack) {
                // 按单包价格计算
                totalCost = packPriceInfo.pack * packCount;
            }
        }

        // 只在有价格数据时显示
        if (hasPriceData && totalCost > 0) {
            const profit = totalCardValue - totalCost;
            const profitClass = profit >= 0 ? 'price-stats__profit' : 'price-stats__loss';
            const profitSign = profit >= 0 ? '+' : '';
            priceStatsEl.innerHTML =
                '<span class="price-stats__item">' +
                    '<span class="price-stats__label">卡片价值</span>' +
                    '<span class="price-stats__value">🪙' + totalCardValue.toFixed(1) + '</span>' +
                '</span>' +
                '<span class="price-stats__divider"></span>' +
                '<span class="price-stats__item">' +
                    '<span class="price-stats__label">开包盈亏</span>' +
                    '<span class="price-stats__value ' + profitClass + '">' + profitSign + '🪙' + profit.toFixed(1) + '</span>' +
                '</span>';
            priceStatsEl.style.display = '';
        } else {
            priceStatsEl.style.display = 'none';
            priceStatsEl.innerHTML = '';
        }
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

/** 从 APP_VERSION 全局变量同步页脚版本号 */
function syncFooterVersion() {
    const footerEl = document.getElementById('footer-version');
    if (!footerEl) return;
    const ver = window.APP_VERSION || '?';
    footerEl.textContent = `YGO Pack Opener v${ver}`;
}

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

// ====== 版本更新公告 ======

/**
 * 检查是否需要显示版本更新公告
 * 对比 localStorage 中记录的"上次看过的版本号"与当前 APP_VERSION：
 * - 不一致 → 在比上次版本更新的所有条目中，查找最近一条有 announcement 的 → 弹出
 * - 不一致但所有新版本都无 announcement → 静默更新版本号
 * - 一致 → 不做任何事
 */
function checkAnnouncement() {
    var currentVersion = window.APP_VERSION || '';
    var lastSeenVersion = localStorage.getItem('ygo_last_seen_version') || '';

    // 版本号一致，无需弹窗
    if (currentVersion === lastSeenVersion) return;

    // 更新"已看过"的版本号
    localStorage.setItem('ygo_last_seen_version', currentVersion);

    // 在 changelog 中查找最近一条有 announcement 的条目
    // changelog.versions 按版本从新到旧排列，遍历到上次看过的版本为止
    var announcementEntry = null;
    if (changelogData && changelogData.versions) {
        for (var i = 0; i < changelogData.versions.length; i++) {
            var entry = changelogData.versions[i];
            // 遇到上次看过的版本就停止（更早的公告用户已看过）
            if (entry.version === lastSeenVersion) break;
            // 找到第一条（最新的）有公告的条目
            if (entry.announcement && !announcementEntry) {
                announcementEntry = entry;
            }
        }
    }

    // 无公告内容则静默跳过
    if (!announcementEntry) return;

    // 延迟弹出，确保页面渲染完毕，体验更好
    setTimeout(function () {
        showAnnouncement(announcementEntry.version, announcementEntry.announcement);
    }, 800);
}

/**
 * 显示公告弹窗
 * 复用 confirm-modal 结构，单按钮"我知道了"
 */
function showAnnouncement(version, message) {
    var titleEl = document.getElementById('confirm-modal-title');
    var messageEl = document.getElementById('confirm-modal-message');
    var cancelBtn = document.getElementById('btn-confirm-cancel');
    var cancelXBtn = document.getElementById('btn-confirm-cancel-x');
    var okBtn = document.getElementById('btn-confirm-ok');

    // 设置内容
    titleEl.textContent = '🎉 版本更新';
    titleEl.style.textAlign = 'center';
    titleEl.style.width = '100%';
    // 支持 \n 换行：将换行符转为 <br>
    var htmlMessage = message.replace(/\n/g, '<br>');
    messageEl.innerHTML = '<p class="announcement-text">' + htmlMessage + '</p>';

    // 隐藏取消按钮，只保留确认按钮
    cancelBtn.style.display = 'none';
    okBtn.textContent = '我知道了';
    okBtn.style.color = 'var(--accent-blue)';
    okBtn.style.borderLeft = 'none';

    // 绑定关闭事件
    var closeModal = function () {
        document.getElementById('confirm-modal').classList.remove('active');
        // 恢复 confirm-modal 的默认状态，避免影响后续使用
        cancelBtn.style.display = '';
        okBtn.style.color = '';
        okBtn.style.borderLeft = '';
        titleEl.style.textAlign = '';
        titleEl.style.width = '';
        okBtn.onclick = null;
        cancelXBtn.onclick = null;
    };

    okBtn.onclick = closeModal;
    cancelXBtn.onclick = closeModal;

    // 显示弹窗
    document.getElementById('confirm-modal').classList.add('active');
}

// ============================================
// 缓存管理界面
// ============================================

/** 显示缓存管理弹窗 */
/** 加载缓存信息到开发者工具内嵌区域 */
async function loadDevtoolsCacheInfo() {
    const container = document.getElementById('devtools-cache-content');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem;">正在获取缓存信息...</p>';

    try {
        const status = await TCG_API.getCacheStatus();
        const fmt = TCG_API.formatBytes;

        let html = '';

        // ─── 总览信息 ───
        html += `<div class="cache-summary">`;
        html += `<p>💾 API 缓存占用：<strong>${fmt(status.indexedDBSize)}</strong></p>`;
        html += `<p>🎮 当前模式：<strong>${currentGameMode.toUpperCase()}</strong></p>`;
        html += `</div>`;

        // ─── 板块1：API 缓存（IndexedDB） ───
        html += `<div class="cache-section">`;
        html += `<h3 class="cache-section-title">🌐 API 缓存 <span class="cache-section-size">${fmt(status.indexedDBSize)}</span></h3>`;

        if (status.cardSets.length > 0) {
            html += `<div class="cache-list">`;
            status.cardSets.forEach(function (set) {
                const sourceIcon = set.dataSource === 'ygocdb' ? '🎌' : set.dataSource === 'ygoprodeck' ? '🌎' : '📦';
                html += `<div class="cache-item">`;
                html += `<div class="cache-item-row">`;
                html += `<span class="cache-item-name">${sourceIcon} ${set.setCode}</span>`;
                html += `<button class="cache-item-delete" data-idb-set="${set.setCode}" title="清除此卡包缓存">✕</button>`;
                html += `</div>`;
                html += `<span class="cache-item-info">${set.cardCount} 张 · ${fmt(set.size)} · ${set.dataSource} · ${set.fetchedAt}</span>`;
                html += `</div>`;
            });
            html += `</div>`;
        } else {
            html += `<p class="cache-empty">暂无 API 缓存数据。</p>`;
            html += `<p class="cache-hint">💡 当前 OCG 卡包使用本地内嵌数据，无需 API 缓存。</p>`;
        }
        html += `</div>`;

        // ─── 板块3：图片缓存说明 ───
        html += `<div class="cache-section">`;
        html += `<h3 class="cache-section-title">🖼️ 图片缓存</h3>`;
        html += `<p class="cache-hint">卡图由浏览器 HTTP 缓存管理，清除浏览器缓存即可释放空间。</p>`;
        html += `</div>`;

        container.innerHTML = html;

        // ─── 绑定各条目的删除按钮事件 ───
        bindDevtoolsCacheDeleteEvents(container);

    } catch (error) {
        container.innerHTML = `<p style="color:#ff6b6b;font-size:.85rem;">获取缓存信息失败: ${error.message}</p>`;
    }
}

/** 绑定开发者工具内缓存条目的删除按钮事件 */
function bindDevtoolsCacheDeleteEvents(container) {
    container.addEventListener('click', async function (e) {
        const btn = e.target.closest('.cache-item-delete');
        if (!btn) return;

        // IndexedDB 卡包缓存删除
        const setCode = btn.getAttribute('data-idb-set');
        if (setCode) {
            if (!confirm(`确定要清除卡包「${setCode}」的缓存吗？`)) return;
            await TCG_API.refreshCardSetCache(setCode);
            loadDevtoolsCacheInfo(); // 刷新界面
        }
    });
}

/** 清除所有缓存（IndexedDB + Cache API，不含 localStorage 用户数据） */
async function handleClearCache() {
    if (!confirm('确定要清除所有 API 缓存数据吗？\n\n• 清除 IndexedDB 中的卡包缓存\n• 清除浏览器 Cache API 数据\n\n⚠️ 不会清除背包和货币数据。')) {
        return;
    }

    const success = await TCG_API.clearAllCache();
    if (success) {
        alert('✅ API 缓存已清除！');
        loadDevtoolsCacheInfo(); // 刷新开发者工具内的缓存信息
    } else {
        alert('❌ 清除缓存失败，请重试。');
    }
}

/**
 * 开发者工具：添加 10000 金币
 */
function devAddGold() {
    try {
        CurrencySystem.addBalance('gold', 1000000);
        CurrencySystem.updateUI();
alert('✅ 已添加 100万 🪙 金币！');
console.log('🛠️ [设置] 添加 100万 金币');
    } catch (error) {
        console.error('❌ 添加金币失败:', error);
        alert('❌ 添加金币失败：' + error.message);
    }
}

/**
 * 通用确认弹窗（替代原生 confirm，不阻塞主线程）
 * @param {string} title - 弹窗标题
 * @param {string} message - 弹窗内容（支持换行）
 * @param {function} onConfirm - 点击确定后的回调
 */
function showConfirmDialog(title, message, onConfirm) {
    var modal = document.getElementById('confirm-modal');
    var titleEl = document.getElementById('confirm-modal-title');
    var msgEl = document.getElementById('confirm-modal-message');
    var btnOk = document.getElementById('btn-confirm-ok');
    var btnCancel = document.getElementById('btn-confirm-cancel');
    var btnCancelX = document.getElementById('btn-confirm-cancel-x');

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.classList.add('active');

    // 清除旧事件（用克隆节点替换）
    var newBtnOk = btnOk.cloneNode(true);
    var newBtnCancel = btnCancel.cloneNode(true);
    var newBtnCancelX = btnCancelX.cloneNode(true);
    btnOk.parentNode.replaceChild(newBtnOk, btnOk);
    btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
    btnCancelX.parentNode.replaceChild(newBtnCancelX, btnCancelX);

    function close() { modal.classList.remove('active'); }

    newBtnCancel.addEventListener('click', close);
    newBtnCancelX.addEventListener('click', close);
    newBtnOk.addEventListener('click', function () {
        close();
        if (onConfirm) onConfirm();
    });
}

/**
 * 开发者工具：重置游戏（重置货币余额至初始值，不清除缓存）
 */
function devResetGame() {
    showConfirmDialog(
        '❗ 确定要重置游戏吗？',
        '这将重置以下数据：\n• 🪙 金币恢复为初始值\n• 🎒 背包清空所有卡片\n\n⚠️ 不会清除缓存数据。若需清除缓存，请前往「💾 缓存管理」。',
        function () {
            try {
                CurrencySystem.resetAll();
                CurrencySystem.updateUI();
                InventorySystem.clearAll();
                showDevtoolsToast('✅ 游戏已重置！货币已恢复，背包已清空。');
                console.log('🛠️ [设置] 游戏已重置（含背包清空）');
            } catch (error) {
                console.error('❌ 重置游戏失败:', error);
                showDevtoolsToast('❌ 重置失败：' + error.message);
            }
        }
    );
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
    // 清理事件监听器，防止内存泄漏
    InventorySystem.cleanupModal();
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
    // 从价格配置文件获取单包/整盒价格，回退到 packs.json 的 price
    const packCodeUI = currentPack.packCode || currentPack.setCode || '';
    const priceConfigUI = typeof PriceSystem !== 'undefined' ? PriceSystem.getPackPrice(packCodeUI) : null;
    const price = (priceConfigUI && priceConfigUI.pack) ? priceConfigUI.pack : (currentPack.price || 0);
    const boxPriceUI = (priceConfigUI && priceConfigUI.box) ? priceConfigUI.box : null;
    const currDef = CurrencySystem.getCurrencyDef(currency);
    const balance = CurrencySystem.getBalance(currency);
    const canAfford = price <= 0 || CurrencySystem.canAfford(currency, price);

    // 移除旧版花费信息行（如果存在）
    const oldPriceInfo = document.getElementById('open-pack-price-info');
    if (oldPriceInfo) oldPriceInfo.remove();

    // 更新开包按钮的可用状态
    const openBtn = document.getElementById('btn-open-pack');
    const openAgainBtn = document.getElementById('btn-open-again');

    if (openBtn) {
        if (!canAfford) {
            openBtn.classList.add('insufficient');
            openBtn.textContent = `余额不足 (需要 ${price} ${currDef.icon})`;
        } else {
            openBtn.classList.remove('insufficient');
            openBtn.textContent = price > 0 ? `开1包 (${currDef.icon} ${price})` : '开1包';
        }
    }

    if (openAgainBtn) {
        if (!canAfford) {
            openAgainBtn.classList.add('insufficient');
            openAgainBtn.textContent = `余额不足 (需要 ${price} ${currDef.icon})`;
        } else {
            openAgainBtn.classList.remove('insufficient');
            openAgainBtn.textContent = price > 0 ? `再开1包 (${currDef.icon} ${price})` : '再开1包';
        }
    }

    // 更新「开整盒」按钮的可用状态（优先使用价格配置的整盒价格）
    const boxCount = (currentPack && currentPack.packsPerBox) || 30;
    const totalPriceBox = boxPriceUI ? boxPriceUI : (price * boxCount);
    const canAffordBox = totalPriceBox <= 0 || CurrencySystem.canAfford(currency, totalPriceBox);

    const openBoxBtn = document.getElementById('btn-open-box');
    const openAgainBoxBtn = document.getElementById('btn-open-again-box');

    // 判断是否为普通辅助包卡包（有辅助包数据但没有 boxesForBonus，如BLZD）
    const hasNormalSupplement = currentSupplementCards && currentSupplementCards.length > 0 && !currentPack.boxesForBonus;
    const supplementSuffix = hasNormalSupplement ? '<span class="btn-box-sub">赠送 +1 辅助包</span>' : '';

    if (openBoxBtn) {
        if (!canAffordBox) {
            openBoxBtn.classList.add('insufficient');
            openBoxBtn.innerHTML = `余额不足 (需要 ${totalPriceBox} ${currDef.icon})`;
        } else {
        openBoxBtn.classList.remove('insufficient');
            openBoxBtn.innerHTML = (price > 0 ? `开1盒 (${boxCount}包 ${currDef.icon} ${totalPriceBox})` : `开1盒 (${boxCount}包)`) + supplementSuffix;
        }
    }

    if (openAgainBoxBtn) {
        if (!canAffordBox) {
            openAgainBoxBtn.classList.add('insufficient');
            openAgainBoxBtn.innerHTML = `余额不足 (需要 ${totalPriceBox} ${currDef.icon})`;
        } else {
        openAgainBoxBtn.classList.remove('insufficient');
            openAgainBoxBtn.innerHTML = (price > 0 ? `再开1盒 (${boxCount}包 ${currDef.icon} ${totalPriceBox})` : `再开1盒 (${boxCount}包)`) + supplementSuffix;
        }
    }

    // 更新「开3盒」按钮的可用状态（仅当配置了 boxesForBonus 时显示）
    const boxesForBonus = currentPack.boxesForBonus || 0;
    const open3BoxBtn = document.getElementById('btn-open-3box');
    const openAgain3BoxBtn = document.getElementById('btn-open-again-3box');

    if (boxesForBonus >= 2) {
        const totalPrice3Box = boxPriceUI ? (boxPriceUI * boxesForBonus) : (price * boxCount * boxesForBonus);
        const canAfford3Box = totalPrice3Box <= 0 || CurrencySystem.canAfford(currency, totalPrice3Box);

        if (open3BoxBtn) {
            open3BoxBtn.style.display = '';
            if (!canAfford3Box) {
                open3BoxBtn.classList.add('insufficient');
                open3BoxBtn.innerHTML = `余额不足 (需要 ${totalPrice3Box} ${currDef.icon})`;
            } else {
                open3BoxBtn.classList.remove('insufficient');
                const totalPacks3Box = boxCount * boxesForBonus;
                open3BoxBtn.innerHTML = price > 0
                    ? `开${boxesForBonus}盒 (${totalPacks3Box}包 ${currDef.icon} ${totalPrice3Box})<span class="btn-box-sub">赠送 +1 特别包</span>`
                    : `开${boxesForBonus}盒 (${totalPacks3Box}包)<span class="btn-box-sub">赠送 +1 特别包</span>`;
            }
        }

        if (openAgain3BoxBtn) {
            if (!canAfford3Box) {
                openAgain3BoxBtn.classList.add('insufficient');
                openAgain3BoxBtn.innerHTML = `余额不足 (需要 ${totalPrice3Box} ${currDef.icon})`;
            } else {
                openAgain3BoxBtn.classList.remove('insufficient');
                const totalPacks3Box = boxCount * boxesForBonus;
                openAgain3BoxBtn.innerHTML = price > 0
                    ? `再开${boxesForBonus}盒 (${totalPacks3Box}包 ${currDef.icon} ${totalPrice3Box})<span class="btn-box-sub">赠送 +1 特别包</span>`
                    : `再开${boxesForBonus}盒 (${totalPacks3Box}包)<span class="btn-box-sub">赠送 +1 特别包</span>`;
            }
        }
    } else {
        // 没有 boxesForBonus 配置时隐藏3盒按钮
        if (open3BoxBtn) open3BoxBtn.style.display = 'none';
        if (openAgain3BoxBtn) openAgain3BoxBtn.style.display = 'none';
    }

    // ====== 更新快捷再开按钮的文案和可用状态 ======
    const quickBtn = document.getElementById('btn-quick-reopen');
    if (quickBtn) {
        let quickText = '';
        let quickInsufficient = false;
        if (currentOpenMode === '3box' && boxesForBonus >= 2) {
            const totalPrice3Box = boxPriceUI ? (boxPriceUI * boxesForBonus) : (price * boxCount * boxesForBonus);
            const canAfford3Box = totalPrice3Box <= 0 || CurrencySystem.canAfford(currency, totalPrice3Box);
            const totalPacks3Box = boxCount * boxesForBonus;
            if (!canAfford3Box) {
                quickText = `余额不足 (需要 ${totalPrice3Box} ${currDef.icon})`;
                quickInsufficient = true;
            } else {
                quickText = price > 0 ? `再开${boxesForBonus}盒 (${currDef.icon} ${totalPrice3Box})` : `再开${boxesForBonus}盒`;
            }
        } else if (currentOpenMode === 'box') {
            if (!canAffordBox) {
                quickText = `余额不足 (需要 ${totalPriceBox} ${currDef.icon})`;
                quickInsufficient = true;
            } else {
                quickText = price > 0 ? `再开1盒 (${currDef.icon} ${totalPriceBox})` : '再开1盒';
            }
        } else {
            // pack 模式
            if (!canAfford) {
                quickText = `余额不足 (需要 ${price} ${currDef.icon})`;
                quickInsufficient = true;
            } else {
                quickText = price > 0 ? `再开1包 (${currDef.icon} ${price})` : '再开1包';
            }
        }
        quickBtn.textContent = quickText;
        if (quickInsufficient) {
            quickBtn.classList.add('insufficient');
        } else {
            quickBtn.classList.remove('insufficient');
        }
    }
}

/** 打开开发者工具弹窗 */
// ====== 开发者工具：Toast 提示 ======
function showDevtoolsToast(message) {
    // 移除已有的 toast
    var existing = document.querySelector('.devtools-toast');
    if (existing) existing.remove();
    // 创建 toast 元素
    var toast = document.createElement('div');
    toast.className = 'devtools-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    // 触发重排后添加显示动画
    requestAnimationFrame(function () {
        toast.classList.add('devtools-toast--visible');
    });
    // 2秒后自动消失
    setTimeout(function () {
        toast.classList.remove('devtools-toast--visible');
        toast.classList.add('devtools-toast--hide');
        // 动画结束后移除 DOM
        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 400);
    }, 2000);
}

// ====== 开发者工具：隐藏功能入口（点击标题5次解锁 TCG 测试模式、CDN 卡图对比、管理后台） ======
let devToolsTitleClickCount = 0;
let devToolsTitleClickTimer = null;
const DEV_TOOLS_UNLOCK_CLICKS = 5;

function showDevTools() {
    const modal = document.getElementById('devtools-modal');
    modal.classList.add('active');

    // 内网环境（localhost）自动解锁隐藏功能
    const _isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (_isLocal) {
        const hiddenSections = [
            document.getElementById('devtools-image-section'),
            document.getElementById('devtools-admin-section')
        ].filter(Boolean);
        hiddenSections.forEach(function (section) {
            section.style.display = '';
            section.classList.remove('devtools-admin-hidden');
            section.classList.add('devtools-admin-visible');
        });
    }

    // 绑定开发者快捷操作按钮
    const addGoldBtn = document.getElementById('btn-dev-add-gold');
    const resetGameBtn = document.getElementById('btn-dev-reset-game');
    if (addGoldBtn) addGoldBtn.onclick = devAddGold;
    if (resetGameBtn) resetGameBtn.onclick = devResetGame;

    // 加载缓存管理信息到开发者工具内嵌区域
    loadDevtoolsCacheInfo();
    // 绑定清除缓存按钮
    const clearCacheBtn = document.getElementById('btn-devtools-clear-cache');
    if (clearCacheBtn) clearCacheBtn.onclick = handleClearCache;

    // 绑定数据管理按钮（导出/导入存档）
    var exportBtn = document.getElementById('btn-export-save');
    var importBtn = document.getElementById('btn-import-save');
    if (exportBtn) exportBtn.onclick = exportSaveData;
    if (importBtn) importBtn.onclick = openImportModal;

    // 绑定导出弹窗的复制按钮
    var copyExportBtn = document.getElementById('btn-copy-export');
    if (copyExportBtn) copyExportBtn.onclick = copyExportText;

    // 绑定导入弹窗的解析和确认按钮
    var parseImportBtn = document.getElementById('btn-parse-import');
    var confirmImportBtn = document.getElementById('btn-confirm-import');
    if (parseImportBtn) parseImportBtn.onclick = parseImportData;
    if (confirmImportBtn) confirmImportBtn.onclick = confirmImport;

    // 绑定标题点击事件（5次连击解锁隐藏功能：TCG 测试模式、CDN 卡图对比、管理后台）
    const devtoolsHeader = modal.querySelector('.modal-header h2');
    if (devtoolsHeader && !devtoolsHeader._adminUnlockBound) {
        devtoolsHeader._adminUnlockBound = true;
        devtoolsHeader.style.cursor = 'pointer';
        devtoolsHeader.addEventListener('click', function () {
            devToolsTitleClickCount++;
            // 清除之前的计时器，3秒内连续点击才有效
            clearTimeout(devToolsTitleClickTimer);
            devToolsTitleClickTimer = setTimeout(() => {
                devToolsTitleClickCount = 0;
            }, 3000);

            const remaining = DEV_TOOLS_UNLOCK_CLICKS - devToolsTitleClickCount;
            if (remaining > 0 && remaining <= 3) {
                // 快到解锁次数时给予提示
                console.log(`🔧 再点击 ${remaining} 次解锁隐藏功能`);
            }

            if (devToolsTitleClickCount >= DEV_TOOLS_UNLOCK_CLICKS) {
                devToolsTitleClickCount = 0;
                clearTimeout(devToolsTitleClickTimer);
                // 同时控制所有隐藏板块：卡图调试、管理后台
                const hiddenSections = [
                    document.getElementById('devtools-image-section'),
                    document.getElementById('devtools-admin-section')
                ].filter(Boolean);
                // 以第一个板块的显示状态为基准判断当前是否已解锁
                const isCurrentlyHidden = hiddenSections.length > 0 && hiddenSections[0].style.display === 'none';
                hiddenSections.forEach(function (section) {
                    if (isCurrentlyHidden) {
                        section.style.display = '';
                        section.classList.remove('devtools-admin-hidden');
                        section.classList.add('devtools-admin-visible');
                    } else {
                        section.style.display = 'none';
                        section.classList.remove('devtools-admin-visible');
                        section.classList.add('devtools-admin-hidden');
                    }
                });
                if (isCurrentlyHidden) {
                    console.log('🔓 隐藏功能已解锁（卡图调试、管理后台）');
                    showDevtoolsToast('🔓 隐藏功能已解锁');
                } else {
                    console.log('🔒 隐藏功能已关闭');
                    showDevtoolsToast('🔒 隐藏功能已关闭');
                }
            }
        });
    }

    // 绑定卡图严格匹配模式 checkbox
    const strictImageCheckbox = document.getElementById('devtools-strict-image-match');
    if (strictImageCheckbox) {
        // 从 localStorage 恢复状态
        const savedStrict = localStorage.getItem('strictImageMatch') === 'true';
        strictImageCheckbox.checked = savedStrict;
        window._strictImageMatch = savedStrict;
        strictImageCheckbox.onchange = function () {
            window._strictImageMatch = this.checked;
            localStorage.setItem('strictImageMatch', this.checked);
            console.log(this.checked ? '🎨 卡图严格匹配模式：已开启' : '🎨 卡图严格匹配模式：已关闭');
            showDevtoolsToast(this.checked ? '🎨 严格匹配模式已开启' : '🎨 严格匹配模式已关闭');
        };
    }
    // 绑定 R2 图源切换 checkbox（仅内网环境显示）
    const forceR2Checkbox = document.getElementById('devtools-force-r2');
    const r2StatusEl = document.getElementById('devtools-r2-status');
    const forceR2Label = forceR2Checkbox ? forceR2Checkbox.closest('label') : null;
    if (forceR2Checkbox) {
        if (!_isLocal) {
            // 外网环境：隐藏开关（外网本身就走 R2，开关无意义）
            if (forceR2Label) forceR2Label.style.display = 'none';
        }

        // 从 localStorage 恢复状态
        const savedForceR2 = localStorage.getItem('forceR2') === 'true';
        forceR2Checkbox.checked = savedForceR2;
        window._forceR2 = savedForceR2;

        // 显示当前图源状态
        function updateR2Status() {
            if (r2StatusEl) {
                const isR2 = typeof isLocalDev === 'function' ? !isLocalDev() : !savedForceR2;
                const source = isR2 ? '☁️ R2 云端' : '📂 本地文件';
                const url = isR2 && typeof CARD_IMAGE_BASE_URL !== 'undefined' ? CARD_IMAGE_BASE_URL : 'data/ocg/images/';
                r2StatusEl.textContent = `当前图源：${source}（${url}）`;
            }
        }
        updateR2Status();

        forceR2Checkbox.onchange = function () {
            window._forceR2 = this.checked;
            localStorage.setItem('forceR2', this.checked);
            updateR2Status();
            console.log(this.checked ? '☁️ 强制 R2 图源：已开启' : '📂 强制 R2 图源：已关闭（使用本地图片）');
            showDevtoolsToast(this.checked ? '☁️ 已切换到 R2 图源（重选卡包生效）' : '📂 已切换到本地图源（重选卡包生效）');
        };
    }
}

/** 关闭开发者工具弹窗 */
function hideDevTools() {
    document.getElementById('devtools-modal').classList.remove('active');
}

// ====== 数据管理：导出/导入存档 ======

/**
 * 需要导出的 localStorage key 列表
 * 只包含玩家游戏进度数据，不包含设置和临时状态
 */
const SAVE_DATA_KEYS = [
    'ygo_inventory_data',   // 背包卡牌
    'ygo_currency_data',    // 金币余额
    'ygo_inventory_spent',  // 累计花费
    'ygo_pack_stats'        // 开包统计
];

// ====== Gzip 压缩/解压工具（使用浏览器原生 CompressionStream API） ======

/**
 * 从 ReadableStream 读取所有数据并合并为一个 Uint8Array
 * @param {ReadableStream} stream - 可读流
 * @returns {Promise<Uint8Array>} 合并后的二进制数据
 */
async function readAllBytes(stream) {
    var reader = stream.getReader();
    var chunks = [];
    var totalLength = 0;
    while (true) {
        var result = await reader.read();
        if (result.done) break;
        chunks.push(result.value);
        totalLength += result.value.length;
    }
    var output = new Uint8Array(totalLength);
    var offset = 0;
    for (var i = 0; i < chunks.length; i++) {
        output.set(chunks[i], offset);
        offset += chunks[i].length;
    }
    return output;
}

/**
 * 将字符串进行 Gzip 压缩
 * @param {string} str - 要压缩的字符串
 * @returns {Promise<Uint8Array>} 压缩后的二进制数据
 */
async function gzipCompress(str) {
    var encoder = new TextEncoder();
    var inputBytes = encoder.encode(str);
    var cs = new CompressionStream('gzip');
    var writer = cs.writable.getWriter();
    // 写入和关闭不能 await（会死锁），让它们异步执行，同时开始读取输出
    writer.write(inputBytes);
    writer.close();
    return readAllBytes(cs.readable);
}

/**
 * 将 Gzip 压缩的二进制数据解压为字符串
 * @param {Uint8Array} compressedData - Gzip 压缩的二进制数据
 * @returns {Promise<string>} 解压后的字符串
 */
async function gzipDecompress(compressedData) {
    var ds = new DecompressionStream('gzip');
    var writer = ds.writable.getWriter();
    // 写入和关闭不能 await（会死锁），让它们异步执行，同时开始读取输出
    writer.write(compressedData);
    writer.close();
    var bytes = await readAllBytes(ds.readable);
    var decoder = new TextDecoder();
    return decoder.decode(bytes);
}

/**
 * Uint8Array → Base64 字符串（分块处理避免大数组性能问题）
 * @param {Uint8Array} bytes - 二进制数据
 * @returns {string} Base64 编码字符串
 */
function uint8ArrayToBase64(bytes) {
    var CHUNK = 8192;
    var parts = [];
    for (var i = 0; i < bytes.length; i += CHUNK) {
        parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
    }
    return btoa(parts.join(''));
}

/**
 * Base64 字符串 → Uint8Array
 * @param {string} base64 - Base64 编码字符串
 * @returns {Uint8Array} 二进制数据
 */
function base64ToUint8Array(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * 导出存档：收集数据 → 精简 inventory → JSON → Gzip 压缩 → Base64 → 显示弹窗
 * v2 精简格式：inventory 每张卡只保留 c(count)、r(rarityVersionsOwned)、t(firstObtained)
 * 其余字段（卡名、图片URL等）导入时从卡包数据库重建
 */
async function exportSaveData() {
    // 浏览器兼容性检查
    if (typeof CompressionStream === 'undefined') {
        showDevtoolsToast('❌ 当前浏览器不支持压缩功能，请更新浏览器');
        return;
    }

    try {
    // 收集所有需要导出的数据
    var saveObj = {
        _version: 2,                       // v2 = 精简格式
        _exportTime: new Date().toISOString(),
        _appVersion: window.APP_VERSION || 'unknown'
    };

    SAVE_DATA_KEYS.forEach(function (key) {
        var raw = localStorage.getItem(key);
        if (raw === null) return;

        // inventory 数据需要精简，其他 key 原样保存
        if (key === 'ygo_inventory_data') {
            try {
                var fullInv = JSON.parse(raw);
                var slimInv = {};
                Object.keys(fullInv).forEach(function (cardId) {
                    var card = fullInv[cardId];
                    if (!card) return;
                    var slim = {};
                    slim.c = card.count || 0;
                    if (card.rarityVersionsOwned && Object.keys(card.rarityVersionsOwned).length > 0) {
                        slim.r = card.rarityVersionsOwned;
                    }
                    if (card.firstObtained) {
                        slim.t = card.firstObtained;
                    }
                    slimInv[cardId] = slim;
                });
                saveObj[key] = JSON.stringify(slimInv);
            } catch (e) {
                console.warn('⚠️ 存档精简失败，使用原始数据:', e);
                saveObj[key] = raw;
            }
        } else {
            saveObj[key] = raw;
        }
    });

    // JSON → Gzip 压缩 → Base64
    var jsonStr = JSON.stringify(saveObj);
    var compressed = await gzipCompress(jsonStr);
    var base64Str = uint8ArrayToBase64(compressed);

    // 分段处理：超过 3000 字符时自动分割
    var SEGMENT_LIMIT = 2800;  // 每段内容上限（留余量给前缀标识）
    var segmentNav = document.getElementById('export-segment-nav');
    var textarea = document.getElementById('export-text');
    var copyBtn = document.getElementById('btn-copy-export');

    if (base64Str.length <= 3000) {
        // 短文本：不分段，直接显示
        window._exportSegments = null;
        window._exportSegmentIndex = 0;
        textarea.value = base64Str;
        segmentNav.style.display = 'none';
    } else {
        // 长文本：分段
        var totalSegments = Math.ceil(base64Str.length / SEGMENT_LIMIT);
        var segments = [];
        for (var i = 0; i < totalSegments; i++) {
            var chunk = base64Str.substring(i * SEGMENT_LIMIT, (i + 1) * SEGMENT_LIMIT);
            segments.push('[' + (i + 1) + '/' + totalSegments + ']' + chunk);
        }
        window._exportSegments = segments;
        window._exportSegmentIndex = 0;
        textarea.value = segments[0];
        segmentNav.style.display = '';
        document.getElementById('export-segment-info').textContent = '第 1/' + totalSegments + ' 段';
        document.getElementById('btn-export-prev').disabled = true;
        document.getElementById('btn-export-next').disabled = (totalSegments <= 1);
    }

    // 重置复制按钮状态
    copyBtn.textContent = '📋 一键复制';
    copyBtn.classList.remove('copied');

    // 显示导出弹窗
    document.getElementById('export-modal').classList.add('active');

    } catch (e) {
        console.error('❌ 导出失败:', e);
        showDevtoolsToast('❌ 导出失败，请重试');
    }
}

/**
 * 一键复制导出文本到剪贴板
 */
function copyExportText() {
    var textarea = document.getElementById('export-text');
    var copyBtn = document.getElementById('btn-copy-export');

    // 复制成功后的提示文本（分段模式下显示段号）
    var segments = window._exportSegments;
    var successText = '✅ 已复制到剪贴板';
    if (segments && segments.length > 1) {
        successText = '✅ 第 ' + (window._exportSegmentIndex + 1) + ' 段已复制';
    }

    // 优先使用现代 Clipboard API，兼容降级到 execCommand
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textarea.value).then(function () {
            copyBtn.textContent = successText;
            copyBtn.classList.add('copied');
        }).catch(function () {
            fallbackCopy(textarea, copyBtn, successText);
        });
    } else {
        fallbackCopy(textarea, copyBtn, successText);
    }
}

/** 降级复制方案（用于不支持 Clipboard API 的浏览器） */
function fallbackCopy(textarea, copyBtn, successText) {
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    try {
        document.execCommand('copy');
        copyBtn.textContent = successText || '✅ 已复制到剪贴板';
        copyBtn.classList.add('copied');
    } catch (e) {
        copyBtn.textContent = '❌ 复制失败，请手动全选复制';
    }
}

/**
 * 切换导出分段显示
 * @param {string} direction - 'prev' 或 'next'
 */
function showExportSegment(direction) {
    var segments = window._exportSegments;
    if (!segments || segments.length <= 1) return;

    var idx = window._exportSegmentIndex || 0;
    if (direction === 'prev') idx--;
    else if (direction === 'next') idx++;

    // 边界限制
    if (idx < 0) idx = 0;
    if (idx >= segments.length) idx = segments.length - 1;

    window._exportSegmentIndex = idx;

    // 更新 UI
    document.getElementById('export-text').value = segments[idx];
    document.getElementById('export-segment-info').textContent = '第 ' + (idx + 1) + '/' + segments.length + ' 段';
    document.getElementById('btn-export-prev').disabled = (idx === 0);
    document.getElementById('btn-export-next').disabled = (idx === segments.length - 1);

    // 重置复制按钮
    var copyBtn = document.getElementById('btn-copy-export');
    copyBtn.textContent = '📋 一键复制';
    copyBtn.classList.remove('copied');
}

/**
 * 打开导入弹窗
 */
function openImportModal() {
    // 重置导入弹窗的所有状态
    document.getElementById('import-text').value = '';
    document.getElementById('import-preview').style.display = 'none';
    document.getElementById('import-preview').innerHTML = '';
    document.getElementById('btn-confirm-import').style.display = 'none';
    document.getElementById('btn-parse-import').style.display = '';

    // 显示导入弹窗
    document.getElementById('import-modal').classList.add('active');
}

/**
 * 解析存档：Base64 → Gzip 解压 → JSON → 校验 → 显示预览
 */
async function parseImportData() {
    var textarea = document.getElementById('import-text');
    var previewDiv = document.getElementById('import-preview');
    var confirmBtn = document.getElementById('btn-confirm-import');
    var parseBtn = document.getElementById('btn-parse-import');
    var rawText = textarea.value.trim();

    if (!rawText) {
        showDevtoolsToast('❌ 请先粘贴存档文本');
        return;
    }

    // 浏览器兼容性检查
    if (typeof DecompressionStream === 'undefined') {
        showDevtoolsToast('❌ 当前浏览器不支持解压功能，请更新浏览器');
        return;
    }

    // 分段拼接：检测是否包含 [X/N] 格式的分段标记
    var hasSegments = /\[\d+\/\d+\]/.test(rawText);
    if (hasSegments) {
        // 按分段前缀边界分割（支持无换行连续粘贴）
        var allMatches = [];
        var parts = rawText.split(/(?=\[\d+\/\d+\])/);
        for (var li = 0; li < parts.length; li++) {
            var part = parts[li].trim();
            if (!part) continue;
            var match = part.match(/^\[(\d+)\/(\d+)\](.+)$/);
            if (match) {
                allMatches.push({
                    index: parseInt(match[1], 10),
                    total: parseInt(match[2], 10),
                    data: match[3].trim()
                });
            }
        }
        if (allMatches.length > 0) {
            var total = allMatches[0].total;
            // 校验所有段的总数是否一致
            var totalsMatch = allMatches.every(function (m) { return m.total === total; });
            if (!totalsMatch) {
                showDevtoolsToast('❌ 段落总数不一致，请检查是否混入了其他存档');
                return;
            }
            // 检查是否收齐所有段
            var collected = {};
            for (var mi = 0; mi < allMatches.length; mi++) {
                collected[allMatches[mi].index] = allMatches[mi].data;
            }
            var missing = [];
            for (var si = 1; si <= total; si++) {
                if (!collected[si]) missing.push(si);
            }
            if (missing.length > 0) {
                showDevtoolsToast('❌ 缺少第 ' + missing.join('、') + ' 段，请补充后重试');
                return;
            }
            // 按段号顺序拼接
            var combined = '';
            for (var ci = 1; ci <= total; ci++) {
                combined += collected[ci];
            }
            rawText = combined;
        }
    }

    // Base64 解码 → Gzip 解压 → JSON 解析
    var saveObj;
    try {
        var compressedData = base64ToUint8Array(rawText);
        var jsonStr = await gzipDecompress(compressedData);
        saveObj = JSON.parse(jsonStr);
    } catch (e) {
        showDevtoolsToast('❌ 存档格式无效，无法解码');
        return;
    }

    // 校验：至少包含一个有效数据 key
    var hasAnyData = SAVE_DATA_KEYS.some(function (key) {
        return saveObj[key] !== undefined;
    });
    if (!hasAnyData) {
        showDevtoolsToast('❌ 存档中没有有效的游戏数据');
        return;
    }

    // 提取预览信息
    var cardCount = 0;
    var goldBalance = 0;
    var totalSpent = 0;
    var packStatsCount = 0;

    // 解析背包数据（v2 精简格式，字段名为 c）
    if (saveObj['ygo_inventory_data']) {
        try {
            var inv = JSON.parse(saveObj['ygo_inventory_data']);
            if (inv) {
                Object.keys(inv).forEach(function (cardId) {
                    var card = inv[cardId];
                    if (card && typeof card.c === 'number') {
                        cardCount += card.c;
                    }
                });
            }
        } catch (e) { /* 忽略解析错误 */ }
    }

    // 解析金币数据
    if (saveObj['ygo_currency_data']) {
        try {
            var curr = JSON.parse(saveObj['ygo_currency_data']);
            goldBalance = (curr && curr.gold) || 0;
        } catch (e) { /* 忽略解析错误 */ }
    }

    // 解析累计花费
    if (saveObj['ygo_inventory_spent']) {
        totalSpent = parseInt(saveObj['ygo_inventory_spent'], 10) || 0;
    }

    // 解析开包统计
    if (saveObj['ygo_pack_stats']) {
        try {
            var stats = JSON.parse(saveObj['ygo_pack_stats']);
            if (stats) {
                Object.keys(stats).forEach(function (packCode) {
                    var packStat = stats[packCode];
                    if (packStat && typeof packStat.totalPacks === 'number') {
                        packStatsCount += packStat.totalPacks;
                    }
                });
            }
        } catch (e) { /* 忽略解析错误 */ }
    }

    // 格式化导出时间
    var exportTime = '未知';
    if (saveObj._exportTime) {
        try {
            var d = new Date(saveObj._exportTime);
            exportTime = d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0') + ' ' +
                String(d.getHours()).padStart(2, '0') + ':' +
                String(d.getMinutes()).padStart(2, '0');
        } catch (e) { /* 使用默认值 */ }
    }

    // 渲染预览
    previewDiv.innerHTML =
        '<div class="save-preview-title">📦 存档概览</div>' +
        '<div class="save-preview-item"><span class="save-preview-label">导出时间</span><span class="save-preview-value">' + exportTime + '</span></div>' +
        '<div class="save-preview-item"><span class="save-preview-label">背包卡牌</span><span class="save-preview-value">' + cardCount.toLocaleString() + ' 张</span></div>' +
        '<div class="save-preview-item"><span class="save-preview-label">金币余额</span><span class="save-preview-value">' + goldBalance.toLocaleString() + '</span></div>' +
        '<div class="save-preview-item"><span class="save-preview-label">累计花费</span><span class="save-preview-value">' + totalSpent.toLocaleString() + '</span></div>' +
        '<div class="save-preview-item"><span class="save-preview-label">累计开包</span><span class="save-preview-value">' + packStatsCount.toLocaleString() + ' 次</span></div>';
    previewDiv.style.display = '';

    // 将解析后的数据暂存到按钮上，确认时直接使用
    confirmBtn._pendingSaveObj = saveObj;
    confirmBtn.style.display = '';
    parseBtn.style.display = 'none';

    showDevtoolsToast('✅ 存档解析成功，请确认后导入');
}

/**
 * 从卡包数据重建完整 inventory（用于精简存档导入）
 *
 * 精简存档中每张卡只有 { c, r, t }，需要从卡包 JSON 重建卡名、图片URL 等字段
 *
 * @param {object} slimInventory - 精简格式的 inventory 对象，如 { "89631139": { c:3, r:{UR:1}, t:1711856400000 } }
 * @returns {Promise<string>} 重建后的完整 inventory JSON 字符串
 */
async function rebuildInventoryFromPacks(slimInventory) {
    // 第1步：加载 packs.json 获取所有卡包配置
    var packsResp = await fetch('data/ocg/packs.json');
    var packsData = await packsResp.json();
    var packs = packsData.packs || [];

    // 第2步：并行加载所有卡包的 cardFile 和 imageMapFile（每包一对）
    var fetchPairs = packs.map(function (pack) {
        return Promise.all([
            pack.cardFile
                ? fetch('data/ocg/cards/' + pack.cardFile).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
                : Promise.resolve(null),
            pack.imageMapFile
                ? fetch('data/ocg/' + pack.imageMapFile).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
                : Promise.resolve(null)
        ]);
    });

    var results = await Promise.all(fetchPairs);

    // 第3步：构建全局卡牌索引 cardId → 卡牌完整信息
    var cardIndex = {};
    packs.forEach(function (pack, i) {
        var packData = results[i][0];
        var imageMapRaw = results[i][1];

        if (!packData) return;

        // 处理 imageMap：统一为以卡密为 key 的对象
        var imageMap = null;
        if (imageMapRaw && imageMapRaw.cards) {
            imageMap = {};
            // 添加 _localDir 属性（如果卡包配置了本地图片目录）
            if (pack.localImagesDir) {
                imageMap._localDir = pack.localImagesDir + '/';
            }
            Object.keys(imageMapRaw.cards).forEach(function (pw) {
                imageMap[pw] = imageMapRaw.cards[pw];
            });
        }

        // 遍历卡包中的每张卡
        var cardIds = packData.cardIds || packData;
        if (!Array.isArray(cardIds)) return;

        cardIds.forEach(function (cardDef) {
            var cardId = String(cardDef.id);
            if (cardIndex[cardId]) return;  // 已有则跳过

            var d = cardDef.cardData || {};
            var cnName = d.cn_name || '';
            var jpName = d.jp_name || '';
            var enName = d.en_name || '';
            var displayName = cnName || jpName || enName || ('ID:' + cardDef.id);
            var foreignName = jpName || enName || '';

            // 获取默认卡图 URL
            var setNumber = cardDef.setNumber || '';
            var imgSmallUrl = '';
            var imgLargeUrl = '';
            if (typeof getCardImageUrl === 'function' && imageMap) {
                var smallResult = getCardImageUrl(setNumber, imageMap, 'small');
                var largeResult = getCardImageUrl(setNumber, imageMap, 'large');
                if (smallResult && smallResult.url) imgSmallUrl = smallResult.url;
                if (largeResult && largeResult.url) imgLargeUrl = largeResult.url;
            }

            cardIndex[cardId] = {
                id: cardDef.id,
                cardSetCode: setNumber,
                name: displayName,
                nameCN: cnName,
                nameOriginal: foreignName,
                rarityVersions: cardDef.rarityVersions || ['N'],
                imageUrl: imgSmallUrl,
                imageLargeUrl: imgLargeUrl,
                _imageMap: imageMap  // 保留映射表引用，用于重建 rarityImageUrls
            };
        });
    });

    // 第4步：遍历精简 inventory，重建完整字段
    var fullInventory = {};
    Object.keys(slimInventory).forEach(function (cardId) {
        var slim = slimInventory[cardId];
        var info = cardIndex[cardId];

        if (info) {
            // 重建 rarityImageUrls：为每个已拥有的稀有度版本计算卡图 URL
            var rarityImageUrls = {};
            var versionsOwned = slim.r || {};
            Object.keys(versionsOwned).forEach(function (rarity) {
                if (typeof getCardImageUrl === 'function' && info._imageMap) {
                    var smallResult = getCardImageUrl(info.cardSetCode, info._imageMap, 'small', rarity);
                    var largeResult = getCardImageUrl(info.cardSetCode, info._imageMap, 'large', rarity);
                    rarityImageUrls[rarity] = {
                        imageUrl: (smallResult && smallResult.url) || info.imageUrl,
                        imageLargeUrl: (largeResult && largeResult.url) || info.imageLargeUrl
                    };
                } else {
                    rarityImageUrls[rarity] = {
                        imageUrl: info.imageUrl,
                        imageLargeUrl: info.imageLargeUrl
                    };
                }
            });

            fullInventory[cardId] = {
                id: info.id,
                name: info.name,
                nameCN: info.nameCN,
                nameOriginal: info.nameOriginal,
                rarityVersions: info.rarityVersions,
                imageUrl: info.imageUrl,
                imageLargeUrl: info.imageLargeUrl,
                count: slim.c || 0,
                rarityVersionsOwned: slim.r || {},
                rarityImageUrls: rarityImageUrls,
                firstObtained: slim.t || Date.now()
            };
        } else {
            // 卡包数据中找不到（如已下架卡包），用占位信息
            console.warn('⚠️ 重建存档时未找到卡牌 ID:', cardId);
            fullInventory[cardId] = {
                id: parseInt(cardId, 10) || 0,
                name: '未知卡牌 #' + cardId,
                nameCN: '',
                nameOriginal: '',
                rarityVersions: Object.keys(slim.r || { 'N': 1 }),
                imageUrl: '',
                imageLargeUrl: '',
                count: slim.c || 0,
                rarityVersionsOwned: slim.r || {},
                rarityImageUrls: {},
                firstObtained: slim.t || Date.now()
            };
        }
    });

    return JSON.stringify(fullInventory);
}

/**
 * 确认导入：精简存档重建 → 覆盖 localStorage → 刷新页面
 */
async function confirmImport() {
    var confirmBtn = document.getElementById('btn-confirm-import');
    var saveObj = confirmBtn._pendingSaveObj;

    if (!saveObj) {
        showDevtoolsToast('❌ 没有待导入的数据');
        return;
    }

    // 禁用按钮防止重复点击
    confirmBtn.disabled = true;
    confirmBtn.textContent = '⏳ 正在重建卡牌数据...';

    try {
        // 精简格式 inventory 需要从卡包数据重建完整字段
        if (saveObj['ygo_inventory_data']) {
            var slimInv = JSON.parse(saveObj['ygo_inventory_data']);
            var rebuiltInvJson = await rebuildInventoryFromPacks(slimInv);
            saveObj['ygo_inventory_data'] = rebuiltInvJson;
        }

        // 写入 localStorage
        SAVE_DATA_KEYS.forEach(function (key) {
            if (saveObj[key] !== undefined) {
                localStorage.setItem(key, saveObj[key]);
            }
        });

        showDevtoolsToast('✅ 存档导入成功，即将刷新页面...');

        // 延迟刷新，让用户看到提示
        setTimeout(function () {
            location.reload();
        }, 1500);
    } catch (e) {
        console.error('❌ 存档导入失败:', e);
        showDevtoolsToast('❌ 存档导入失败：' + (e.message || '未知错误'));
        confirmBtn.disabled = false;
        confirmBtn.textContent = '✅ 确认导入';
    }
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
            // 将辅助包数据注入到 pack 对象中
            if (cardFileData.supplementPack) {
                // 旧格式：辅助包数据内嵌在母包文件中
                targetPack.supplementPack = cardFileData.supplementPack;
            } else if (cardFileData.supplementPackFile) {
                // 新格式：辅助包数据在独立文件中，额外加载
                var suppUrl = 'data/ocg/cards/' + cardFileData.supplementPackFile + '?v=' + (window.APP_VERSION || '0');
                var suppResponse = await fetch(suppUrl);
                if (suppResponse.ok) {
                    targetPack.supplementPack = await suppResponse.json();
                    console.log('📄 [预览] 已加载辅助包文件 [' + cardFileData.supplementPackFile + ']');
                } else {
                    console.warn('⚠️ [预览] 辅助包文件加载失败: ' + suppUrl);
                }
            }
            console.log('📄 [预览] 已加载独立卡牌文件 [' + targetPack.cardFile + ']，共 ' + targetPack.cardIds.length + ' 张卡');
        }

        // 通过 API 模块获取卡牌数据
        var setData = await TCG_API.getCardSetData(currentGameMode, targetPack, function (loaded, total) {
            updateLoadingText('正在加载卡片数据... (' + loaded + '/' + total + ')');
        });

        // 用加载到的卡片数据渲染预览（含辅助包卡片）
        hideLoadingState();
        renderCardPreview('id', setData.cards, targetPack, setData.supplementCards || []);
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
function renderCardPreview(sortBy, cards, pack, supplementCards) {
    const contentEl = document.getElementById('card-preview-content');
    if (!contentEl) return;

    sortBy = sortBy || 'id';
    // 使用传入的数据或回退到全局变量
    const previewCards = cards || currentPackCards;
    const previewPack = pack || currentPack;
    const previewSupp = supplementCards || [];

    if (!previewCards || previewCards.length === 0) {
        contentEl.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:40px 0;">暂无卡片数据</p>';
        return;
    }

    // 获取当前卡包的所有卡片
    let allCards = previewCards.slice();

    // --- 图鉴默认展开模式：每种稀有度单独展示为一个卡位 ---
    // 同编号下，稀有度权重更大的排在前面
    {
        const expandedCards = [];
        allCards.forEach(function(card) {
            let versions = card.rarityVersions || ['N'];
            // 同时有N和NR时只保留NR
            if (versions.includes('N') && versions.includes('NR')) {
                versions = versions.filter(function(v) { return v !== 'N'; });
            }
            // 按稀有度权重从高到低排序（降序）
            const sorted = versions.slice().sort(function(a, b) {
                return (RARITY_ORDER_DESC[b] || 0) - (RARITY_ORDER_DESC[a] || 0);
            });
            sorted.forEach(function(rarity) {
                // 为每个稀有度版本创建独立的卡位对象
                // 获取对应稀有度的卡图URL（OF超框卡版本使用超框卡图，普通版使用普通卡图）
                const expSmall = card._imageMap ? getCardImageUrl(card.cardSetCode, card._imageMap, 'small', rarity) : null;
                const expLarge = card._imageMap ? getCardImageUrl(card.cardSetCode, card._imageMap, 'large', rarity) : null;
                const expanded = Object.assign({}, card, {
                    rarityVersions: [rarity],
                    imageUrl: expSmall ? expSmall.url : card.imageUrl,
                    imageLargeUrl: expLarge ? expLarge.url : card.imageLargeUrl,
                    // 标记用于区分展开后的卡位（用于收集判断）
                    _expandedRarity: rarity
                });
                expandedCards.push(expanded);
            });
        });
        allCards = expandedCards;
    }

    // 从背包系统获取已拥有的卡片信息（含各版本收集数量）
    const ownedMap = {};
    const ownedVersionsMap = {}; // { cardId: { "SR": 2, "SER": 1 } }
    let totalVersions = 0;   // 所有稀有度版本总数
    let ownedVersionCount = 0; // 已收集的稀有度版本数
    // 每个稀有度的已收集数（用于详情面板，动态初始化）
    const rarityOwnedCounts = {};
    RARITY_CODES_DESC.forEach(function (code) { rarityOwnedCounts[code] = 0; });
    allCards.forEach(function (card) {
        const invCard = InventorySystem.getCard(card.id);
        // 计算该卡的所有稀有度版本数（同时有N和NR时只算NR）
        let versions = card.rarityVersions || ['N'];
        if (versions.includes('N') && versions.includes('NR')) {
            versions = versions.filter(function (v) { return v !== 'N'; });
        }
        totalVersions += versions.length;
        if (invCard) {
            ownedMap[card.id] = invCard.count;
            const versionsOwned = InventorySystem.getCardVersions(card.id);
            ownedVersionsMap[card.id] = versionsOwned;
            // 统计该卡已收集了多少个稀有度版本
            versions.forEach(function (v) {
                if (versionsOwned[v] && versionsOwned[v] > 0) {
                    ownedVersionCount++;
                    rarityOwnedCounts[v] = (rarityOwnedCounts[v] || 0) + 1;
                }
            });
        }
    });

    // 排序
    const sortedCards = allCards.slice();

    switch (sortBy) {
        case 'id':
            // 按卡包内编号序号（如 BLZD-JP001 → 1, JP002 → 2）从小到大排序
            // 展开后同编号下按稀有度权重从高到低排列
            sortedCards.sort(function (a, b) {
                const numDiff = (Number(a.setNumber) || 0) - (Number(b.setNumber) || 0);
                if (numDiff !== 0) return numDiff;
                // 同编号：稀有度权重高的排前面（降序）
                return (RARITY_ORDER_DESC[(b.rarityVersions || ['N'])[0]] || 0) -
                       (RARITY_ORDER_DESC[(a.rarityVersions || ['N'])[0]] || 0);
            });
            break;
        case 'rarity':
            sortedCards.sort(function (a, b) {
        const rDiff = (RARITY_ORDER_DESC[(b.rarityVersions || ['N'])[0]] || 0) - (RARITY_ORDER_DESC[(a.rarityVersions || ['N'])[0]] || 0);
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
        return (RARITY_ORDER_DESC[(b.rarityVersions || ['N'])[0]] || 0) - (RARITY_ORDER_DESC[(a.rarityVersions || ['N'])[0]] || 0);
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
    // 同时有N和NR时只保留NR，与卡片渲染逻辑一致
// 稀有度计数器（从 rarities.json 动态生成 key）
const rarityCounts = {};
RARITY_CODES_DESC.forEach(function (code) { rarityCounts[code] = 0; });
    allCards.forEach(function (card) {
        let versions = card.rarityVersions || ['N'];
        // 同时有N和NR时，过滤掉N只保留NR
        if (versions.includes('N') && versions.includes('NR')) {
            versions = versions.filter(function (v) { return v !== 'N'; });
        }
        versions.forEach(function (v) {
            rarityCounts[v] = (rarityCounts[v] || 0) + 1;
        });
    });

    // 更新弹窗标题
    const titleEl = document.getElementById('card-preview-title');
    if (titleEl) {
        const code = previewPack ? previewPack.packCode || '卡包' : '卡包';
        const num = previewPack && previewPack.packNumber ? '（' + previewPack.packNumber + '）' : '';
        titleEl.textContent = '🔍 ' + code + num + ' 收集一览';
    }

    // 构建 HTML
    let html = '';

    // 收集进度条（按稀有度版本统计）
    const collectionPercent = totalVersions > 0 ? Math.round(ownedVersionCount / totalVersions * 100) : 0;
    // 构建每个稀有度的收集详情行
    const detailOrder = RARITY_CODES_DESC;
    let rarityDetailHtml = '';
    detailOrder.forEach(function (code) {
        if (rarityCounts[code] > 0) {
            const owned = rarityOwnedCounts[code] || 0;
            const total = rarityCounts[code];
            const pct = Math.round(owned / total * 100);
            const isComplete = owned >= total;
            rarityDetailHtml += `
                <div class="rarity-detail-row${isComplete ? ' rarity-detail-complete' : ''}">
                    <span class="rarity-detail-label rarity-tag-${code}">${code}</span>
                    <div class="rarity-detail-track">
                        <div class="rarity-detail-fill rarity-fill-${code}" style="width: ${pct}%"></div>
                    </div>
                    <span class="rarity-detail-num">${owned}/${total}</span>
                </div>`;
        }
    });
    html += `
        <div class="preview-collection-bar">
            <div class="preview-collection-info preview-collection-toggle" onclick="this.closest('.preview-collection-bar').classList.toggle('expanded')">
                <span>收集进度 <span class="toggle-arrow">▶</span></span>
                <span class="preview-collection-count">${ownedVersionCount} / ${totalVersions} (${collectionPercent}%)</span>
            </div>
            <div class="preview-progress-track">
                <div class="preview-progress-fill" style="width: ${collectionPercent}%"></div>
            </div>
            <div class="preview-collection-detail">
                ${rarityDetailHtml}
            </div>
        </div>
    `;

    // 稀有度分布（只展示数量>0的稀有度）
const rarityDisplayOrder = RARITY_CODES_DESC;
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
// 稀有度权重（用于确定边框颜色 —— 取最高稀有度版本），直接复用全局排序映射
const rarityWeight = RARITY_ORDER_ASC;
    html += '<div class="preview-card-grid">';
    sortedCards.forEach(function (card) {
        let isOwned = !!ownedMap[card.id];
        const ownedQty = ownedMap[card.id] || 0;
        const rarityCode = (card.rarityVersions || ['N'])[0];

        // LOCH 展开卡位：根据具体稀有度版本判断是否拥有
        if (card._expandedRarity && ownedVersionsMap[card.id]) {
            isOwned = !!(ownedVersionsMap[card.id][card._expandedRarity] && ownedVersionsMap[card.id][card._expandedRarity] > 0);
        }
        // 如果同时存在 N 和 NR，只保留 NR（NR 是 N 的上位，无需并列展示）
        let versions = card.rarityVersions || [rarityCode];
        if (versions.indexOf('N') !== -1 && versions.indexOf('NR') !== -1) {
            versions = versions.filter(function (v) { return v !== 'N'; });
        }
        const displayName = card.nameCN || card.name || card.nameOriginal || '未知卡片';

        // 取最高稀有度版本作为边框颜色
        const highestRarity = versions.reduce(function (best, v) {
            return (rarityWeight[v] || 0) > (rarityWeight[best] || 0) ? v : best;
        }, versions[0]);

        // 获取该卡各稀有度版本的收集数量
        const versionsOwned = ownedVersionsMap[card.id] || {};

        // 构建多版本稀有度角标 HTML（未收集的版本显示灰色，已收集的显示彩色）
        // 按稀有度从高到低排序（左边最高，右边最低）
        const sortedVersions = versions.slice().sort(function (a, b) {
            return (rarityWeight[b] || 0) - (rarityWeight[a] || 0);
        });
        let rarityBadgeHtml;
        if (sortedVersions.length > 1) {
            // 多版本：每个版本各自一个实心色块并列
            rarityBadgeHtml = '<span class="preview-rarity-badge preview-rarity-multi">';
            rarityBadgeHtml += sortedVersions.map(function (v) {
                const collected = versionsOwned[v] && versionsOwned[v] > 0;
                const bgClass = collected ? 'rarity-' + v : 'rarity-uncollected';
                return '<span class="rarity-version-item ' + bgClass + '">' + v + '</span>';
            }).join('');
            rarityBadgeHtml += '</span>';
        } else {
            // 单版本：根据收集状态决定颜色
            const singleRarity = sortedVersions[0] || rarityCode;
            const singleCollected = versionsOwned[singleRarity] && versionsOwned[singleRarity] > 0;
            const singleClass = singleCollected ? 'rarity-' + singleRarity : 'rarity-uncollected';
            rarityBadgeHtml = `<span class="preview-rarity-badge ${singleClass}">${singleRarity}</span>`;
        }

        // 构建右下角数量角标（按稀有度分别显示，每个版本独立色块）
        let ownedBadgeHtml = '';
        if (isOwned) {
            if (sortedVersions.length > 1) {
                // 多版本：每个版本各自一个实心色块并列
                let parts = [];
                sortedVersions.forEach(function (v) {
                    const vCount = versionsOwned[v] || 0;
                    if (vCount > 0) {
                        parts.push('<span class="owned-version-count rarity-' + v + '">×' + vCount + '</span>');
                    }
                });
                if (parts.length > 0) {
                    ownedBadgeHtml = '<span class="preview-owned-badge preview-owned-multi">' + parts.join('') + '</span>';
                }
            } else {
                // 单版本：实心色块显示总数（LOCH展开卡位显示该版本的数量）
                const singleRarityForBadge = sortedVersions[0] || rarityCode;
                const badgeQty = (card._expandedRarity && ownedVersionsMap[card.id])
                    ? (ownedVersionsMap[card.id][card._expandedRarity] || 0)
                    : ownedQty;
                ownedBadgeHtml = `<span class="preview-owned-badge rarity-${singleRarityForBadge}">×${badgeQty}</span>`;
            }
        }

        // 卡图
        let imageHtml;
        if (card.imageUrl) {
            imageHtml = `<img class="preview-card-image ${!isOwned ? 'not-owned' : ''}"
                              src="${card.imageUrl}" alt="${displayName}" loading="lazy"
                              onerror="handleCardImageError(this)">
                         <div class="preview-card-placeholder" style="display:none;">🃏</div>`;
        } else {
            imageHtml = `<div class="preview-card-placeholder ${!isOwned ? 'not-owned' : ''}">🃏</div>`;
        }

        html += `
            <div class="preview-card-item ${isOwned ? 'owned' : 'not-owned-card'} rarity-border-${highestRarity}" data-card-id="${card.id}" data-rarity="${card._expandedRarity || rarityCode}">
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

    // ========== +1辅助包区域 ==========
    if (previewSupp.length > 0) {
        // 辅助包收集统计
        let suppTotalVersions = 0;
        let suppOwnedVersions = 0;
        const suppRarityOwnedCounts = {};
        const suppRarityCounts = {};
        previewSupp.forEach(function (card) {
            let versions = card.rarityVersions || ['UR'];
            if (versions.includes('N') && versions.includes('NR')) {
                versions = versions.filter(function (v) { return v !== 'N'; });
            }
            suppTotalVersions += versions.length;
            versions.forEach(function (v) {
                suppRarityCounts[v] = (suppRarityCounts[v] || 0) + 1;
            });
            const invCard = InventorySystem.getCard(card.id);
            if (invCard) {
                const versionsOwned = InventorySystem.getCardVersions(card.id);
                versions.forEach(function (v) {
                    if (versionsOwned[v] && versionsOwned[v] > 0) {
                        suppOwnedVersions++;
                        suppRarityOwnedCounts[v] = (suppRarityOwnedCounts[v] || 0) + 1;
                    }
                });
            }
        });

        const suppPercent = suppTotalVersions > 0 ? Math.round(suppOwnedVersions / suppTotalVersions * 100) : 0;

        // 辅助包区域分隔标题
        html += '<div class="supplement-section">';
        html += '<div class="supplement-section-header">📦 +1 特别包</div>';

        // 辅助包收集进度条
        let suppDetailHtml = '';
        detailOrder.forEach(function (code) {
            if (suppRarityCounts[code] > 0) {
                const owned = suppRarityOwnedCounts[code] || 0;
                const total = suppRarityCounts[code];
                const pct = Math.round(owned / total * 100);
                const isComplete = owned >= total;
                suppDetailHtml += '<div class="rarity-detail-row' + (isComplete ? ' rarity-detail-complete' : '') + '">';
                suppDetailHtml += '<span class="rarity-detail-label rarity-tag-' + code + '">' + code + '</span>';
                suppDetailHtml += '<div class="rarity-detail-track"><div class="rarity-detail-fill rarity-fill-' + code + '" style="width: ' + pct + '%"></div></div>';
                suppDetailHtml += '<span class="rarity-detail-num">' + owned + '/' + total + '</span>';
                suppDetailHtml += '</div>';
            }
        });

        html += '<div class="preview-collection-bar">';
        html += '<div class="preview-collection-info preview-collection-toggle" onclick="this.closest(\'.preview-collection-bar\').classList.toggle(\'expanded\')">';
        html += '<span>收集进度 <span class="toggle-arrow">▶</span></span>';
        html += '<span class="preview-collection-count">' + suppOwnedVersions + ' / ' + suppTotalVersions + ' (' + suppPercent + '%)</span>';
        html += '</div>';
        html += '<div class="preview-progress-track"><div class="preview-progress-fill" style="width: ' + suppPercent + '%"></div></div>';
        html += '<div class="preview-collection-detail">' + suppDetailHtml + '</div>';
        html += '</div>';

        // 辅助包稀有度分布标签
        const suppRarityDisplayOrder = RARITY_CODES_DESC;
        let suppRarityTagsHtml = '';
        suppRarityDisplayOrder.forEach(function (code) {
            if (suppRarityCounts[code] > 0) {
                suppRarityTagsHtml += '<span class="preview-rarity-tag rarity-tag-' + code + '">' + code + ' ×' + suppRarityCounts[code] + '</span> ';
            }
        });
        if (suppRarityTagsHtml) {
            html += '<div class="preview-rarity-dist">' + suppRarityTagsHtml + '</div>';
        }

        // 辅助包卡片网格
        html += '<div class="preview-card-grid">';
        previewSupp.forEach(function (card) {
            const invCard = InventorySystem.getCard(card.id);
            const isOwned = !!invCard;
            const ownedQty = invCard ? invCard.count : 0;
            const rc = (card.rarityVersions || ['UR'])[0];
            let versions = card.rarityVersions || [rc];
            if (versions.indexOf('N') !== -1 && versions.indexOf('NR') !== -1) {
                versions = versions.filter(function (v) { return v !== 'N'; });
            }
            const displayName = card.nameCN || card.name || card.nameOriginal || '未知卡片';
            const highestRarity = versions.reduce(function (best, v) {
                return (rarityWeight[v] || 0) > (rarityWeight[best] || 0) ? v : best;
            }, versions[0]);
            const versionsOwned = invCard ? InventorySystem.getCardVersions(card.id) : {};
            const sortedVersions = versions.slice().sort(function (a, b) {
                return (rarityWeight[b] || 0) - (rarityWeight[a] || 0);
            });

            // 稀有度角标
            let rarityBadgeHtml;
            if (sortedVersions.length > 1) {
                // 多版本：每个版本各自一个实心色块并列
                rarityBadgeHtml = '<span class="preview-rarity-badge preview-rarity-multi">';
                rarityBadgeHtml += sortedVersions.map(function (v) {
                    const collected = versionsOwned[v] && versionsOwned[v] > 0;
                    const bgClass = collected ? 'rarity-' + v : 'rarity-uncollected';
                    return '<span class="rarity-version-item ' + bgClass + '">' + v + '</span>';
                }).join('');
                rarityBadgeHtml += '</span>';
            } else {
                const singleRarity = sortedVersions[0] || rc;
                const singleCollected = versionsOwned[singleRarity] && versionsOwned[singleRarity] > 0;
                const singleClass = singleCollected ? 'rarity-' + singleRarity : 'rarity-uncollected';
                rarityBadgeHtml = '<span class="preview-rarity-badge ' + singleClass + '">' + singleRarity + '</span>';
            }

            // 数量角标（每个版本独立色块）
            let ownedBadgeHtml = '';
            if (isOwned) {
                if (sortedVersions.length > 1) {
                    let parts = [];
                    sortedVersions.forEach(function (v) {
                        const vCount = versionsOwned[v] || 0;
                        if (vCount > 0) {
                            parts.push('<span class="owned-version-count rarity-' + v + '">×' + vCount + '</span>');
                        }
                    });
                    if (parts.length > 0) {
                        ownedBadgeHtml = '<span class="preview-owned-badge preview-owned-multi">' + parts.join('') + '</span>';
                    }
                } else {
                    const singleR = sortedVersions[0] || rc;
                    ownedBadgeHtml = '<span class="preview-owned-badge rarity-' + singleR + '">×' + ownedQty + '</span>';
                }
            }

            // 卡图
            let imageHtml;
            if (card.imageUrl) {
                imageHtml = '<img class="preview-card-image ' + (!isOwned ? 'not-owned' : '') + '" src="' + card.imageUrl + '" alt="' + displayName + '" loading="lazy" onerror="handleCardImageError(this)">';
                imageHtml += '<div class="preview-card-placeholder" style="display:none;">🃏</div>';
            } else {
                imageHtml = '<div class="preview-card-placeholder ' + (!isOwned ? 'not-owned' : '') + '">🃏</div>';
            }

            html += '<div class="preview-card-item ' + (isOwned ? 'owned' : 'not-owned-card') + ' rarity-border-' + highestRarity + '" data-card-id="' + card.id + '" data-supp="1">';
            html += '<div class="preview-card-img-wrapper">';
            html += imageHtml;
            html += rarityBadgeHtml;
            html += ownedBadgeHtml;
            html += (!isOwned ? '<div class="preview-lock-icon">🔒</div>' : '');
            html += '</div>';
            html += '<div class="preview-card-info"><div class="preview-card-name" title="' + displayName + '">' + displayName + '</div></div>';
            html += '</div>';
        });
        html += '</div>';
        html += '</div>'; // 关闭 supplement-section
    }

    contentEl.innerHTML = html;

    // 绑定排序按钮事件（保持 cards、pack、supplementCards 引用）
    contentEl.querySelectorAll('.preview-sort-bar .sort-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            renderCardPreview(this.getAttribute('data-sort'), previewCards, previewPack, previewSupp);
        });
    });

    // 绑定卡片点击事件（已拥有的卡可以放大查看，含辅助包卡片）
    // 使用排序/展开后的 sortedCards + 辅助包卡片，确保 LOCH 展开后的 OF 版本能找到正确的卡图
    const allClickableCards = sortedCards.concat(previewSupp);
    contentEl.querySelectorAll('.preview-card-item').forEach(function (item) {
        item.addEventListener('click', function () {
            const cardId = this.getAttribute('data-card-id');
            const isSupp = this.getAttribute('data-supp') === '1';
            // 获取当前卡位的稀有度（从 data-rarity 属性读取）
            const clickedRarity = this.getAttribute('data-rarity') || '';

            // 在展开后的卡片列表中查找匹配项
            // 对于 LOCH 展开卡位，需要同时匹配 cardId 和稀有度
            let card;
            if (isSupp) {
                card = previewSupp.find(function (c) { return String(c.id) === String(cardId); });
            } else {
                // 优先精确匹配（id + 稀有度），再回退到仅 id 匹配
                card = allClickableCards.find(function (c) {
                    return String(c.id) === String(cardId) &&
                           c._expandedRarity === clickedRarity;
                });
                if (!card) {
                    card = allClickableCards.find(function (c) { return String(c.id) === String(cardId); });
                }
            }

            if (card) {
                const imgUrl = card.imageLargeUrl || card.imageUrl;
                if (imgUrl) {
                    // 复用已有的卡片大图查看器
                    const viewer = document.getElementById('card-image-viewer');
                    if (!viewer) return;
                    const img = viewer.querySelector('.viewer-image');
                    const nameEl = viewer.querySelector('.viewer-card-name');
                    if (img) {
                        // 先清空旧图，防止切换时闪现上一张图片
                        img.src = '';
                        img.src = imgUrl;
                        img.onerror = null;
                    }
                    if (nameEl) {
                        const cardSetCode = card.cardSetCode || card.setNumber || '';
                        const displayName = card.nameCN || card.name || '';
                        const foreignName = card.nameOriginal || '';
                        let nameHtml = '';
                        if (cardSetCode) {
                            nameHtml += '<span style="font-size:0.95em;color:#f0c040;letter-spacing:0.5px;">' + cardSetCode + '</span><br>';
                        }
                        nameHtml += displayName;
                        if (foreignName && foreignName !== displayName) {
                            nameHtml += '<br><span style="font-size:0.8em;opacity:0.7;">' + foreignName + '</span>';
                        }
                        nameEl.innerHTML = nameHtml;
                    }
                    viewer.classList.add('active');
                }
            }
        });
    });
}
