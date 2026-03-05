/**
 * 开包统计模块（PackStats）
 * 
 * 功能：
 *   1. 本地统计：使用 localStorage 记录当前玩家的个人开包数据
 *   2. 全球统计：通过服务端 API 上报和查询全球开包数据
 *   3. UI 展示：在开包界面显示个人和全球开包数量
 * 
 * 优化：
 *   - 上报请求使用缓冲区 + 节流合并机制，减少 KV 写入次数
 *   - 30秒内的多次开包数据会被合并为一次请求上报
 *   - 页面关闭时通过 sendBeacon 发送最后一批缓冲数据
 * 
 * 依赖：
 *   - Cloudflare Pages Function: /api/pack-stats
 *   - Cloudflare KV: PACK_STATS 命名空间
 * 
 * localStorage Key: ygo_pack_stats
 */

const PackStats = (function() {
  'use strict';

  // ============================================
  // 配置
  // ============================================

  /** localStorage 存储键名 */
  const STORAGE_KEY = 'ygo_pack_stats';

  /** API 基础路径 */
  const API_URL = '/api/pack-stats';

  /** 全球统计缓存有效期（毫秒），避免频繁请求 */
  const CACHE_TTL = 60 * 1000; // 60秒

  /** 上报缓冲区刷写间隔（毫秒）：攒够这个时间后统一上报一次 */
  const REPORT_FLUSH_INTERVAL = 30 * 1000; // 30秒

  // ============================================
  // 本地数据管理
  // ============================================

  /** 获取本地全部统计数据 */
  function getLocalData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /** 保存本地统计数据 */
  function saveLocalData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('📊 开包统计：localStorage 保存失败', e);
    }
  }

  /**
   * 获取指定卡包的本地统计
   * @param {string} packCode - 卡包代码
   * @returns {{ totalPacks: number, totalBoxes: number }}
   */
  function getLocalPackStats(packCode) {
    const data = getLocalData();
    return data[packCode] || { totalPacks: 0, totalBoxes: 0 };
  }

  /**
   * 增加本地开包计数
   * @param {string} packCode - 卡包代码
   * @param {'pack'|'box'} type - 开包类型
   * @param {number} [count=1] - 数量
   */
  function addLocalCount(packCode, type, count) {
    count = count || 1;
    const data = getLocalData();
    if (!data[packCode]) {
      data[packCode] = { totalPacks: 0, totalBoxes: 0 };
    }
    if (type === 'pack') {
      data[packCode].totalPacks += count;
    } else if (type === 'box') {
      data[packCode].totalBoxes += count;
    }
    saveLocalData(data);
  }

  // ============================================
  // 全球统计（远程 API）
  // ============================================

  /** 全球统计缓存：{ packCode: { data, timestamp } } */
  const globalCache = {};

  // ============================================
  // 上报缓冲区（节流合并机制）
  // ============================================

  /**
   * 上报缓冲区：{ packCode: { packs: number, boxes: number } }
   * 将多次开包操作合并到缓冲区，定时批量上报
   */
  const reportBuffer = {};

  /** 定时刷写的 timer ID */
  let flushTimer = null;

  /**
   * 将开包数据写入缓冲区（不立即上报）
   * @param {string} packCode - 卡包代码
   * @param {'pack'|'box'} type - 开包类型
   * @param {number} [count=1] - 数量
   */
  function addToBuffer(packCode, type, count) {
    count = count || 1;
    if (!reportBuffer[packCode]) {
      reportBuffer[packCode] = { packs: 0, boxes: 0 };
    }
    if (type === 'pack') {
      reportBuffer[packCode].packs += count;
    } else if (type === 'box') {
      reportBuffer[packCode].boxes += count;
    }

    // 启动定时刷写（如果还没启动）
    if (!flushTimer) {
      flushTimer = setTimeout(function() {
        flushBuffer();
      }, REPORT_FLUSH_INTERVAL);
    }
  }

  /**
   * 刷写缓冲区：将所有缓冲的数据合并为一次批量请求发送
   * @param {boolean} [useBeacon=false] - 是否使用 sendBeacon（页面关闭时）
   */
  async function flushBuffer(useBeacon) {
    // 清除定时器
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    // 收集缓冲区数据
    const entries = [];
    for (const packCode in reportBuffer) {
      const buf = reportBuffer[packCode];
      if (buf.packs > 0 || buf.boxes > 0) {
        entries.push({
          packCode: packCode,
          packs: buf.packs,
          boxes: buf.boxes
        });
      }
    }

    // 清空缓冲区
    for (const key in reportBuffer) {
      delete reportBuffer[key];
    }

    // 没有数据则跳过
    if (entries.length === 0) return;

    const payload = JSON.stringify({ batch: entries });

    // 页面关闭时使用 sendBeacon（保证请求能发出去）
    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(API_URL, blob);
      console.log('📊 开包统计 sendBeacon 上报:', sent ? '成功' : '失败', entries);
      return;
    }

    // 正常情况使用 fetch
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (resp.ok) {
        const result = await resp.json();
        // 用返回的最新全球数据更新缓存
        if (result.updatedPacks) {
          for (const packCode in result.updatedPacks) {
            globalCache[packCode] = {
              data: result.updatedPacks[packCode],
              timestamp: Date.now()
            };
          }
        }
        if (result.globalStats) {
          globalCache['_all'] = {
            data: {
              totalPacks: result.globalStats.totalPacks,
              totalBoxes: result.globalStats.totalBoxes
            },
            timestamp: Date.now()
          };
        }
        console.log('📊 开包统计批量上报成功:', entries);
        return result;
      }
    } catch (e) {
      // 静默失败：网络问题不影响开包体验
      console.warn('📊 开包统计批量上报失败（不影响游戏）:', e.message);
    }
    return null;
  }

  // 页面关闭/切换时，用 sendBeacon 发送最后一批缓冲数据
  window.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      flushBuffer(true);
    }
  });
  window.addEventListener('beforeunload', function() {
    flushBuffer(true);
  });

  /**
   * 从服务端查询指定卡包的全球统计
   * @param {string} packCode - 卡包代码
   * @param {boolean} [forceRefresh=false] - 是否强制刷新缓存
   * @returns {Promise<{ packStats, globalStats } | null>}
   */
  async function fetchGlobalStats(packCode, forceRefresh) {
    // 检查缓存
    if (!forceRefresh && globalCache[packCode]) {
      const cached = globalCache[packCode];
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return { packStats: cached.data };
      }
    }

    try {
      const url = packCode ? `${API_URL}?packCode=${encodeURIComponent(packCode)}` : API_URL;
      const resp = await fetch(url);
      if (resp.ok) {
        const result = await resp.json();

        // 更新缓存
        if (result.packStats) {
          globalCache[packCode] = {
            data: result.packStats,
            timestamp: Date.now()
          };
        }
        if (result.globalStats) {
          globalCache['_all'] = {
            data: result.globalStats,
            timestamp: Date.now()
          };
        }

        return result;
      }
    } catch (e) {
      console.warn('📊 全球统计查询失败:', e.message);
    }
    return null;
  }

  // ============================================
  // 统一开包记录入口
  // ============================================

  /**
   * 记录一次开包（本地 + 远程上报）
   * 在 game.js 的 openPack / openMultiPacks 成功后调用
   * @param {string} packCode - 卡包代码（如 "LOCH"）
   * @param {'pack'|'box'} type - "pack" 开单包 / "box" 开整盒
   * @param {number} [count=1] - 数量（开单包时通常为1）
   * @param {number} [packsPerBox=30] - 每盒包数（用于计算开包总数）
   */
  function recordOpen(packCode, type, count, packsPerBox) {
    count = count || 1;
    if (!packCode) return;

    // 本地记录（同步，立即生效）
    addLocalCount(packCode, type, count);

    // 远程上报：写入缓冲区，30秒后批量合并发送（减少 KV 写入次数）
    addToBuffer(packCode, type, count);

    // 更新 UI 展示（传入每盒包数以正确折算）
    updateStatsDisplay(packCode, packsPerBox);
  }

  // ============================================
  // UI 展示
  // ============================================

  /**
   * 更新开包统计展示
   * 展示在开包界面的统计区域
   * 开包数 = 纯开包次数 + 开盒次数 × 每盒包数
   * @param {string} packCode - 当前卡包代码
   * @param {number} [packsPerBox=30] - 每盒包数（用于折算开盒为实际包数）
   */
  async function updateStatsDisplay(packCode, packsPerBox) {
    const container = document.getElementById('pack-stats-display');
    if (!container) return;

    const ppb = packsPerBox || 30;

    // 获取本地统计
    const local = getLocalPackStats(packCode);
    // 开包数 = 纯开包 + 开盒 × 每盒包数
    const localTotal = local.totalPacks + local.totalBoxes * ppb;

    // 先用本地数据显示
    renderStats(container, packCode, localTotal, null);

    // 异步获取全球数据并更新
    const global = await fetchGlobalStats(packCode);
    if (global && global.packStats) {
      const globalTotal = global.packStats.totalPacks + global.packStats.totalBoxes * ppb;
      renderStats(container, packCode, localTotal, globalTotal);
    } else {
      // API 不可用（本地调试环境），显示提示
      renderStats(container, packCode, localTotal, -1);
    }
  }

  /**
   * 渲染统计数据到容器
   * @param {HTMLElement} container - 统计容器元素
   * @param {string} packCode - 卡包代码
   * @param {number} localTotal - 本地开包总数
   * @param {number|null} globalTotal - 全球开包总数（null=加载中）
   */
  function renderStats(container, packCode, localTotal, globalTotal) {
    let globalText;
    if (globalTotal === null) {
      globalText = '<span class="pack-stats__loading">加载中...</span>';
    } else if (globalTotal === -1) {
      // 本地调试环境，API 不可用
      globalText = '<span class="pack-stats__unavailable">本地调试不可用</span>';
    } else {
      globalText = formatNumber(globalTotal);
    }

    container.innerHTML =
      '<div class="pack-stats">' +
        '<div class="pack-stats__item">' +
          '<span class="pack-stats__icon">👤</span>' +
          '<span class="pack-stats__label">我的开包</span>' +
          '<span class="pack-stats__value">' + formatNumber(localTotal) + '</span>' +
        '</div>' +
        '<div class="pack-stats__divider"></div>' +
        '<div class="pack-stats__item">' +
          '<span class="pack-stats__icon">🌍</span>' +
          '<span class="pack-stats__label">全球开包</span>' +
          '<span class="pack-stats__value">' + globalText + '</span>' +
        '</div>' +
      '</div>';
  }

  /**
   * 数字格式化：1234 → 1,234
   * @param {number} num
   * @returns {string}
   */
  function formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ============================================
  // 公开 API
  // ============================================

  return {
    recordOpen: recordOpen,
    updateStatsDisplay: updateStatsDisplay,
    getLocalPackStats: getLocalPackStats,
    fetchGlobalStats: fetchGlobalStats,
    getLocalData: getLocalData
  };

})();
