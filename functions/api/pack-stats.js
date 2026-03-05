/**
 * Cloudflare Pages Function - 开包统计 API
 * 
 * 功能说明：
 *   统计全球玩家的开包数量，支持按卡包分别统计。
 *   使用 Cloudflare KV 存储数据。
 * 
 * API 接口：
 *   POST /api/pack-stats           - 上报开包数据（支持批量合并上报，减少 KV 写入）
 *   GET  /api/pack-stats            - 查询指定卡包的全球开包统计
 *   GET  /api/pack-stats?admin=1    - 查询所有卡包的全局统计（管理后台用，无需鉴权）
 * 
 * KV 写入限流保护：
 *   - 使用 Worker 内存变量追踪每日 KV 写入次数（零 KV 开销）
 *   - 每 50 次写入才采样持久化一次到 KV（meta:daily_writes）
 *   - 接近免费限额（1000次/天）时返回 throttled 信号，前端暂停上报
 *   - 前端收到信号后将数据暂存 localStorage，次日自动补发
 * 
 * 服务端内存缓存：
 *   - GET 查询使用 30 秒内存缓存，避免重复读取 KV
 *   - POST 写入时同步更新内存缓存，保证数据新鲜
 *   - stats:_all 使用懒更新策略，GET 只需 1 次 KV 读取（而非 1+N 次）
 * 
 * POST 请求格式：
 *   批量上报（推荐）: { batch: [{ packCode: "LOCH", packs: 5, boxes: 1 }, ...] }
 *   单条上报（兼容）: { packCode: "LOCH", type: "pack"|"box", count: 1 }
 * 
 * KV 绑定名称：PACK_STATS（需要在 Cloudflare 控制台创建并绑定）
 * 
 * KV 数据结构：
 *   Key: "stats:{packCode}"  Value: JSON { totalPacks, totalBoxes, lastUpdated }
 *   Key: "stats:_all"        Value: JSON { totalPacks, totalBoxes, lastUpdated } （全局统计缓存，懒更新）
 *   Key: "index:packs"       Value: JSON [ "LOCH", "BLZD", ... ] （所有有数据的卡包列表，仅管理后台查询时使用）
 *   Key: "meta:daily_writes"  Value: JSON { date, count } （每日写入计数，采样写入减少开销）
 * 
 * KV 操作优化：
 *   - 批量上报时，同一卡包的数据先合并
 *   - daily_writes 改用内存变量追踪，每 50 次才写一次 KV（节省约 50% 写入）
 *   - GET 查询使用 30 秒内存缓存，绝大多数请求零 KV 读取
 *   - stats:_all 懒更新：POST 时异步写回，GET 时只读 1 次（而非遍历所有卡包）
 *   - 单次批量请求的 KV 写入次数 = 卡包种类数（仅各卡包统计）
 * 
 * 部署方式：Cloudflare Pages Functions（随项目自动部署）
 * 需要先在 Cloudflare 控制台创建 KV 命名空间并绑定到 PACK_STATS
 */

// ============================================
// 配置区域
// ============================================

/** 允许访问的域名白名单 */
const ALLOWED_ORIGINS = [
  'https://ygocardgame.pages.dev',
  'http://localhost',
  'http://127.0.0.1',
];

/**
 * 每日 KV 写入限额保护阈值
 * Cloudflare 免费计划每日允许 1,000 次写入
 * 设为 900，预留 100 次作为安全余量
 */
const DAILY_WRITE_THRESHOLD = 900;

/** 每日写入计数的 KV Key（采样写入，非每次写入） */
const DAILY_WRITES_KEY = 'meta:daily_writes';

/** daily_writes 采样写入间隔（每隔 N 次内存计数才持久化一次到 KV） */
const DAILY_WRITES_SAMPLE_INTERVAL = 50;

/** 服务端 GET 查询内存缓存 TTL（毫秒） */
const SERVER_CACHE_TTL = 30 * 1000; // 30秒

// ============================================
// Worker 内存级缓存（同一实例多请求共享）
// ============================================

/**
 * 每日写入计数器（内存级）
 * Worker 实例重启时会丢失，但下次 POST 会从 KV 恢复
 * 用内存追踪代替每次写 KV，节省约 50% 的 KV 写入
 */
let dailyWriteCounter = { date: '', count: 0, initialized: false };

/**
 * GET 查询内存缓存
 * 缓存 stats:_all 的全局统计结果，30 秒内直接返回，0 次 KV 读取
 */
let globalStatsCache = { data: null, timestamp: 0 };

/**
 * 各卡包统计内存缓存（POST 写入时同步更新）
 * { packCode: { data: {...}, timestamp: number } }
 */
let packStatsCache = {};

// ============================================
// Pages Function 入口
// ============================================

export async function onRequest(context) {
  const request = context.request;

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return handleCORS(request);
  }

  // POST: 上报开包数据
  if (request.method === 'POST') {
    return handleReport(context);
  }

  // GET: 查询统计数据
  if (request.method === 'GET') {
    return handleQuery(context);
  }

  return new Response('Method Not Allowed', { status: 405 });
}

// ============================================
// 上报开包数据
// ============================================

/**
 * 处理开包上报请求
 * POST /api/pack-stats
 * 
 * 支持两种格式：
 *   1. 批量上报（推荐）: { batch: [{ packCode: "LOCH", packs: 5, boxes: 1 }, ...] }
 *   2. 单条上报（兼容旧版）: { packCode: "LOCH", type: "pack" | "box", count: 1 }
 * 
 * 批量上报可将多次开包合并为一次请求，大幅减少 KV 写入次数
 */
async function handleReport(context) {
  const request = context.request;
  const origin = request.headers.get('Origin') || '';
  const KV = context.env.PACK_STATS;

  // 检查 KV 绑定
  if (!KV) {
    return jsonResponse({ error: 'KV 未绑定，请在 Cloudflare 控制台配置 PACK_STATS' }, 500, origin);
  }

  // 冷启动时从 KV 恢复每日写入计数（只执行一次）
  await initDailyWriteCounter(KV);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体必须是有效的 JSON' }, 400, origin);
  }

  // 统一转换为批量格式
  let entries;
  if (body.batch && Array.isArray(body.batch)) {
    // 新格式：批量上报
    entries = body.batch.map(function(item) {
      return {
        packCode: item.packCode,
        packs: item.packs || 0,
        boxes: item.boxes || 0
      };
    });
  } else if (body.packCode) {
    // 旧格式：单条上报，转换为批量格式
    const { packCode, type, count } = body;
    if (!['pack', 'box'].includes(type)) {
      return jsonResponse({ error: 'type 必须是 "pack" 或 "box"' }, 400, origin);
    }
    entries = [{
      packCode: packCode,
      packs: (type === 'pack') ? (count || 1) : 0,
      boxes: (type === 'box') ? (count || 1) : 0
    }];
  } else {
    return jsonResponse({ error: '缺少 batch 或 packCode 参数' }, 400, origin);
  }

  // 参数校验
  for (const entry of entries) {
    if (!entry.packCode || typeof entry.packCode !== 'string') {
      return jsonResponse({ error: '每条记录必须包含有效的 packCode' }, 400, origin);
    }
  }

  try {
    // 先合并同一卡包的数据（如果批量中有多个相同 packCode）
    const merged = {};
    for (const entry of entries) {
      if (!merged[entry.packCode]) {
        merged[entry.packCode] = { packs: 0, boxes: 0 };
      }
      merged[entry.packCode].packs += entry.packs;
      merged[entry.packCode].boxes += entry.boxes;
    }

    // 汇总全局增量（用于更新 stats:_all 缓存）
    let totalPacksDelta = 0;
    let totalBoxesDelta = 0;
    const updatedPacks = {};

    // 逐个更新卡包维度的统计
    const packCodes = Object.keys(merged);
    for (const packCode of packCodes) {
      const delta = merged[packCode];
      totalPacksDelta += delta.packs;
      totalBoxesDelta += delta.boxes;

      const packKey = `stats:${packCode}`;
      const packStats = await getStats(KV, packKey);
      packStats.totalPacks += delta.packs;
      packStats.totalBoxes += delta.boxes;
      packStats.lastUpdated = new Date().toISOString();
      await KV.put(packKey, JSON.stringify(packStats));

      // 同步更新内存缓存
      packStatsCache[packCode] = {
        data: { totalPacks: packStats.totalPacks, totalBoxes: packStats.totalBoxes, lastUpdated: packStats.lastUpdated },
        timestamp: Date.now()
      };

      updatedPacks[packCode] = {
        totalPacks: packStats.totalPacks,
        totalBoxes: packStats.totalBoxes
      };
    }

    // 更新内存中的全局统计缓存（增量更新，避免重新计算）
    if (globalStatsCache.data) {
      globalStatsCache.data.totalPacks += totalPacksDelta;
      globalStatsCache.data.totalBoxes += totalBoxesDelta;
      globalStatsCache.data.lastUpdated = new Date().toISOString();
      globalStatsCache.timestamp = Date.now();
    }

    // 懒更新 stats:_all：异步写回 KV（不阻塞响应，不计入限流）
    // 使用 waitUntil 确保异步操作完成
    if (globalStatsCache.data) {
      context.waitUntil(
        KV.put('stats:_all', JSON.stringify(globalStatsCache.data)).catch(function() {})
      );
    }

    // 内存级每日写入计数（不消耗 KV 写入）
    const writesThisRequest = packCodes.length;
    const dailyStatus = updateDailyWriteCountInMemory(writesThisRequest);
    const isThrottled = dailyStatus.count >= DAILY_WRITE_THRESHOLD;

    // 采样持久化：每 N 次才写一次 KV，大幅减少 daily_writes 的写入开销
    if (dailyStatus.count % DAILY_WRITES_SAMPLE_INTERVAL < writesThisRequest) {
      context.waitUntil(
        KV.put(DAILY_WRITES_KEY, JSON.stringify({ date: dailyStatus.date, count: dailyStatus.count })).catch(function() {})
      );
    }

    // 全局统计从各卡包的更新结果实时累加
    const globalTotalPacks = Object.values(updatedPacks).reduce(function(sum, p) { return sum + p.totalPacks; }, 0);
    const globalTotalBoxes = Object.values(updatedPacks).reduce(function(sum, p) { return sum + p.totalBoxes; }, 0);

    return jsonResponse({
      success: true,
      updatedPacks: updatedPacks,
      globalStats: { totalPacks: globalTotalPacks, totalBoxes: globalTotalBoxes },
      throttled: isThrottled,
      dailyWrites: dailyStatus.count
    }, 200, origin);
  } catch (error) {
    return jsonResponse({ error: '统计更新失败', message: error.message }, 500, origin);
  }
}

// ============================================
// 查询统计数据
// ============================================

/**
 * 处理统计查询请求
 * GET /api/pack-stats?packCode=LOCH        - 查询指定卡包统计
 * GET /api/pack-stats?admin=1               - 查询全局统计（管理后台）
 */
async function handleQuery(context) {
  const request = context.request;
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  const KV = context.env.PACK_STATS;

  if (!KV) {
    return jsonResponse({ error: 'KV 未绑定' }, 500, origin);
  }

  // 管理后台查询：返回所有卡包的统计（无需密码，开发者模式已有入口保护）
  const isAdmin = url.searchParams.get('admin') === '1';
  if (isAdmin) {

    try {
      // 管理后台不走缓存，直接读取各卡包最新数据
      const packIndex = await getPackIndex(KV);
      const result = {};

      let globalTotalPacks = 0;
      let globalTotalBoxes = 0;
      let globalLastUpdated = null;
      for (const code of packIndex) {
        const stats = await getStats(KV, `stats:${code}`);
        result[code] = stats;
        globalTotalPacks += stats.totalPacks;
        globalTotalBoxes += stats.totalBoxes;
        if (stats.lastUpdated && (!globalLastUpdated || stats.lastUpdated > globalLastUpdated)) {
          globalLastUpdated = stats.lastUpdated;
        }
      }

      const globalStats = { totalPacks: globalTotalPacks, totalBoxes: globalTotalBoxes, lastUpdated: globalLastUpdated };

      // 顺便更新内存缓存和 stats:_all KV
      globalStatsCache = {
        data: { ...globalStats },
        timestamp: Date.now()
      };
      context.waitUntil(
        KV.put('stats:_all', JSON.stringify(globalStats)).catch(function() {})
      );

      return jsonResponse({
        globalStats,
        packStats: result,
        packList: packIndex,
        queriedAt: new Date().toISOString()
      }, 200, origin);

    } catch (error) {
      return jsonResponse({ error: '查询失败', message: error.message }, 500, origin);
    }
  }

  // 普通查询：优先使用内存缓存，其次读取 stats:_all（1 次 KV 读取）
  const packCode = url.searchParams.get('packCode');
  try {
    // 获取全局统计（带缓存）
    const globalStats = await getCachedGlobalStats(KV);

    // 获取指定卡包统计（带缓存）
    let packStats = null;
    if (packCode) {
      // 先查内存缓存
      const cached = packStatsCache[packCode];
      if (cached && (Date.now() - cached.timestamp < SERVER_CACHE_TTL)) {
        packStats = cached.data;
      } else {
        // 缓存未命中，从 KV 读取
        packStats = await getStats(KV, `stats:${packCode}`);
        packStatsCache[packCode] = { data: packStats, timestamp: Date.now() };
      }
    }

    return jsonResponse({
      globalStats: { totalPacks: globalStats.totalPacks, totalBoxes: globalStats.totalBoxes },
      packStats: packCode ? { packCode, totalPacks: packStats.totalPacks, totalBoxes: packStats.totalBoxes } : null
    }, 200, origin);

  } catch (error) {
    return jsonResponse({ error: '查询失败', message: error.message }, 500, origin);
  }
}

// ============================================
// 内存缓存辅助函数
// ============================================

/**
 * 获取带缓存的全局统计
 * 优先使用内存缓存（30秒），其次读 stats:_all KV（1次读取），
 * 最后才遍历所有卡包（1+N次读取，同时回写 stats:_all）
 */
async function getCachedGlobalStats(KV) {
  // 1. 内存缓存命中（30秒内）→ 0 次 KV 读取
  if (globalStatsCache.data && (Date.now() - globalStatsCache.timestamp < SERVER_CACHE_TTL)) {
    return globalStatsCache.data;
  }

  // 2. 从 stats:_all KV 读取 → 1 次 KV 读取
  const allStats = await KV.get('stats:_all', 'json');
  if (allStats && allStats.totalPacks !== undefined) {
    globalStatsCache = { data: allStats, timestamp: Date.now() };
    return allStats;
  }

  // 3. 兜底：遍历所有卡包计算（首次或 stats:_all 被删除时）→ 1+N 次 KV 读取
  const packIndex = await getPackIndex(KV);
  let totalPacks = 0;
  let totalBoxes = 0;
  let lastUpdated = null;
  for (const code of packIndex) {
    const stats = await getStats(KV, `stats:${code}`);
    totalPacks += stats.totalPacks;
    totalBoxes += stats.totalBoxes;
    if (stats.lastUpdated && (!lastUpdated || stats.lastUpdated > lastUpdated)) {
      lastUpdated = stats.lastUpdated;
    }
  }

  const computed = { totalPacks, totalBoxes, lastUpdated };
  globalStatsCache = { data: computed, timestamp: Date.now() };

  // 回写 stats:_all 到 KV，后续 GET 只需 1 次读取
  try {
    await KV.put('stats:_all', JSON.stringify(computed));
  } catch {}

  return computed;
}

/**
 * 内存级每日写入计数（不消耗 KV）
 * Worker 实例重启时从 KV 恢复（首次 POST 时触发），之后纯内存追踪
 */
function updateDailyWriteCountInMemory(writes) {
  const today = new Date().toISOString().slice(0, 10);

  // 跨天重置
  if (dailyWriteCounter.date !== today) {
    dailyWriteCounter = { date: today, count: 0, initialized: true };
  }

  dailyWriteCounter.count += writes;
  return dailyWriteCounter;
}

/**
 * 从 KV 恢复每日写入计数（Worker 实例冷启动时调用一次）
 * 之后使用内存变量追踪，不再读写 KV
 */
async function initDailyWriteCounter(KV) {
  if (dailyWriteCounter.initialized) return;

  const today = new Date().toISOString().slice(0, 10);
  try {
    const data = await KV.get(DAILY_WRITES_KEY, 'json');
    if (data && data.date === today) {
      dailyWriteCounter = { date: today, count: data.count || 0, initialized: true };
    } else {
      dailyWriteCounter = { date: today, count: 0, initialized: true };
    }
  } catch {
    dailyWriteCounter = { date: today, count: 0, initialized: true };
  }
}

// ============================================
// KV 辅助函数
// ============================================

/** 从 KV 获取统计数据，不存在则返回初始值 */
async function getStats(KV, key) {
  const data = await KV.get(key, 'json');
  return data || { totalPacks: 0, totalBoxes: 0, lastUpdated: null };
}

/** 获取卡包索引列表 */
async function getPackIndex(KV) {
  const data = await KV.get('index:packs', 'json');
  return data || [];
}

/** 将卡包添加到索引列表（去重） */
async function addToPackIndex(KV, packCode) {
  const index = await getPackIndex(KV);
  if (!index.includes(packCode)) {
    index.push(packCode);
    await KV.put('index:packs', JSON.stringify(index));
  }
}

/** 批量将卡包添加到索引列表（只读一次索引，最多写一次） */
async function addToPackIndexBatch(KV, packCodes) {
  const index = await getPackIndex(KV);
  let changed = false;
  for (const code of packCodes) {
    if (!index.includes(code)) {
      index.push(code);
      changed = true;
    }
  }
  if (changed) {
    await KV.put('index:packs', JSON.stringify(index));
  }
}

// ============================================
// 响应辅助函数
// ============================================

/** 返回 JSON 响应 */
function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCORSHeaders(origin),
    }
  });
}

/** 处理 CORS 预检请求 */
function handleCORS(request) {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  });
}

/** 生成 CORS 响应头 */
function getCORSHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

/** 检查请求来源是否在白名单中 */
function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) return true;
  return false;
}
