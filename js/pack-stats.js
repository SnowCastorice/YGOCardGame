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
 *   - 方案A：上报失败时数据持久化到 localStorage，后续自动补发
 *   - 方案C：服务端 KV 写入接近限额时返回降级信号，前端暂停上报
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

  /** localStorage 待补发数据存储键名（上报失败时暂存） */
  const PENDING_KEY = 'ygo_pending_reports';

  /** localStorage 节流状态存储键名（服务端降级信号） */
  const THROTTLE_KEY = 'ygo_report_throttled';

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

  // ============================================
  // 待补发数据持久化（方案A）
  // ============================================

  /** 从 localStorage 加载待补发数据 */
  function loadPendingReports() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** 将待补发数据保存到 localStorage */
  function savePendingReports(entries) {
    try {
      // 合并同卡包数据，避免无限膨胀
      const merged = {};
      for (const entry of entries) {
        if (!merged[entry.packCode]) {
          merged[entry.packCode] = { packCode: entry.packCode, packs: 0, boxes: 0 };
        }
        merged[entry.packCode].packs += entry.packs;
        merged[entry.packCode].boxes += entry.boxes;
      }
      const compacted = Object.values(merged);
      // 最多保留 100 条，防止极端情况下 localStorage 溢出
      const limited = compacted.slice(0, 100);
      localStorage.setItem(PENDING_KEY, JSON.stringify(limited));
    } catch (e) {
      console.warn('📊 待补发数据保存失败:', e);
    }
  }

  /** 清空待补发数据 */
  function clearPendingReports() {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {}
  }

  /** 追加条目到待补发列表 */
  function appendPendingReports(newEntries) {
    const existing = loadPendingReports();
    savePendingReports(existing.concat(newEntries));
  }

  // ============================================
  // 服务端降级状态管理（方案C）
  // ============================================

  /**
   * 检查当前是否处于服务端降级（节流）状态
   * 降级状态每天 UTC 00:00 自动重置
   */
  function isThrottled() {
    try {
      const raw = localStorage.getItem(THROTTLE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      // 检查是否已跨天（UTC），跨天则自动恢复
      const today = new Date().toISOString().slice(0, 10);
      if (data.date !== today) {
        localStorage.removeItem(THROTTLE_KEY);
        return false;
      }
      return data.throttled === true;
    } catch {
      return false;
    }
  }

  /** 设置节流状态 */
  function setThrottled(throttled) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(THROTTLE_KEY, JSON.stringify({
        throttled: throttled,
        date: today
      }));
    } catch {}
  }

  // ============================================
  // 缓冲区刷写
  // ============================================

  /**
   * 刷写缓冲区：将所有缓冲的数据合并为一次批量请求发送
   * - 方案A：失败时保存到 localStorage，下次成功时补发
   * - 方案C：收到 throttled 信号后暂停上报，数据暂存本地
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

    // 方案C：如果服务端已降级，直接存入本地待补发队列
    if (isThrottled()) {
      appendPendingReports(entries);
      console.log('📊 服务端限流中，数据已暂存本地，待恢复后补发:', entries.length, '条');
      return;
    }

    // 合并本地待补发的历史数据（如果有），一起发送
    const pending = loadPendingReports();
    const allEntries = pending.concat(entries);

    const payload = JSON.stringify({ batch: allEntries });

    // 页面关闭时使用 sendBeacon（保证请求能发出去）
    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(API_URL, blob);
      if (sent) {
        // sendBeacon 只保证发出，无法获取响应，乐观清除待补发
        clearPendingReports();
        console.log('📊 sendBeacon 上报成功（含补发数据）:', allEntries.length, '条');
      } else {
        // sendBeacon 失败，保存全部数据到 localStorage
        appendPendingReports(entries);
        console.warn('📊 sendBeacon 发送失败，数据已暂存本地');
      }
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

        // 上报成功：清除待补发数据
        clearPendingReports();

        // 方案C：检查服务端返回的节流信号
        if (result.throttled) {
          setThrottled(true);
          console.warn('📊 服务端通知：KV 写入接近限额，暂停远程上报');
        } else {
          // 如果之前是节流状态，现在恢复了
          setThrottled(false);
        }

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
        console.log('📊 开包统计批量上报成功（含补发）:', allEntries.length, '条');
        return result;
      } else {
        // 服务端返回错误（如 429），保存到本地待补发
        appendPendingReports(entries);
        console.warn('📊 上报失败（HTTP', resp.status + '），数据已暂存本地');
      }
    } catch (e) {
      // 网络错误：保存到本地待补发
      appendPendingReports(entries);
      console.warn('📊 上报失败（网络错误），数据已暂存本地:', e.message);
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
   * 同时检查节流状态是否已恢复（新的一天），如已恢复则自动补发
   * @param {string} packCode - 卡包代码
   * @param {boolean} [forceRefresh=false] - 是否强制刷新缓存
   * @returns {Promise<{ packStats, globalStats } | null>}
   */
  async function fetchGlobalStats(packCode, forceRefresh) {
    // 方案C：查询时检查节流状态是否已跨天恢复
    if (!isThrottled()) {
      // 节流已恢复（新的一天），尝试补发历史待补发数据
      const pending = loadPendingReports();
      if (pending.length > 0) {
        console.log('📊 检测到', pending.length, '条待补发数据，尝试补发...');
        try {
          const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch: pending })
          });
          if (resp.ok) {
            const result = await resp.json();
            clearPendingReports();
            console.log('📊 历史数据补发成功:', pending.length, '条');
            // 检查补发后是否又触发了节流
            if (result.throttled) {
              setThrottled(true);
              console.warn('📊 补发后服务端再次进入限流状态');
            }
          } else {
            console.warn('📊 历史数据补发失败（HTTP', resp.status + '）');
          }
        } catch (e) {
          console.warn('📊 历史数据补发失败:', e.message);
        }
      }
    }

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
