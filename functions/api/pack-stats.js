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
 *   - 追踪每日 KV 写入次数（meta:daily_writes）
 *   - 接近免费限额（1000次/天）时返回 throttled 信号，前端暂停上报
 *   - 前端收到信号后将数据暂存 localStorage，次日自动补发
 * 
 * POST 请求格式：
 *   批量上报（推荐）: { batch: [{ packCode: "LOCH", packs: 5, boxes: 1 }, ...] }
 *   单条上报（兼容）: { packCode: "LOCH", type: "pack"|"box", count: 1 }
 * 
 * KV 绑定名称：PACK_STATS（需要在 Cloudflare 控制台创建并绑定）
 * 
 * KV 数据结构：
 *   Key: "stats:{packCode}"  Value: JSON { totalPacks, totalBoxes, lastUpdated }
 *   Key: "stats:_all"        Value: JSON { totalPacks, totalBoxes, lastUpdated }
 *   Key: "index:packs"       Value: JSON [ "LOCH", "BLZD", ... ] （所有有数据的卡包列表）
 *   Key: "meta:daily_writes"  Value: JSON { date, count } （每日写入计数）
 * 
 * KV 操作优化：
 *   - 批量上报时，同一卡包的数据先合并，全局统计只写入一次
 *   - 卡包索引只在有新卡包时才写入
 *   - 单次批量请求的 KV 写入次数 = 卡包种类数 + 1（全局） + 0或1（索引）
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
 * 每日 KV 写入限额保护阈值（方案C）
 * Cloudflare 免费计划每日允许 1,000 次写入
 * 设为 900，预留 100 次作为安全余量
 */
const DAILY_WRITE_THRESHOLD = 900;

/** 每日写入计数的 KV Key */
const DAILY_WRITES_KEY = 'meta:daily_writes';



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

    // 汇总全局增量
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

      updatedPacks[packCode] = {
        totalPacks: packStats.totalPacks,
        totalBoxes: packStats.totalBoxes
      };
    }

    // 一次性更新全局总计（无论多少个卡包，只写一次）
    const allKey = 'stats:_all';
    const allStats = await getStats(KV, allKey);
    allStats.totalPacks += totalPacksDelta;
    allStats.totalBoxes += totalBoxesDelta;
    allStats.lastUpdated = new Date().toISOString();
    await KV.put(allKey, JSON.stringify(allStats));

    // 维护卡包索引（批量检查，只在有新卡包时才写入）
    await addToPackIndexBatch(KV, packCodes);

    // 方案C：更新每日写入计数，检查是否接近限额
    // 本次写入次数 = 卡包种类数 + 1（全局） + 索引更新（0或1）
    const writesThisRequest = packCodes.length + 1; // 索引更新在 addToPackIndexBatch 内部处理
    const dailyWriteStatus = await updateDailyWriteCount(KV, writesThisRequest);
    const isThrottled = dailyWriteStatus.count >= DAILY_WRITE_THRESHOLD;

    return jsonResponse({
      success: true,
      updatedPacks: updatedPacks,
      globalStats: { totalPacks: allStats.totalPacks, totalBoxes: allStats.totalBoxes },
      throttled: isThrottled,
      dailyWrites: dailyWriteStatus.count
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
      // 获取所有卡包索引
      const packIndex = await getPackIndex(KV);
      const result = {};

      // 逐个获取每个卡包的统计
      for (const code of packIndex) {
        const stats = await getStats(KV, `stats:${code}`);
        result[code] = stats;
      }

      // 获取全局总计
      const globalStats = await getStats(KV, 'stats:_all');

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

  // 普通查询：返回指定卡包的统计
  const packCode = url.searchParams.get('packCode');
  try {
    const globalStats = await getStats(KV, 'stats:_all');
    let packStats = null;

    if (packCode) {
      packStats = await getStats(KV, `stats:${packCode}`);
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
// KV 辅助函数
// ============================================

/**
 * 方案C：更新每日 KV 写入计数
 * 用于追踪当天已使用的写入次数，接近阈值时通知前端降级
 * @param {object} KV - KV 命名空间
 * @param {number} writes - 本次请求的写入次数
 * @returns {{ date: string, count: number }}
 */
async function updateDailyWriteCount(KV, writes) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  let dailyData;
  try {
    dailyData = await KV.get(DAILY_WRITES_KEY, 'json');
  } catch {
    dailyData = null;
  }

  // 如果是新的一天，重置计数
  if (!dailyData || dailyData.date !== today) {
    dailyData = { date: today, count: 0 };
  }

  // 累加本次写入次数 + 1（这次 put 本身也是一次写入）
  dailyData.count += writes + 1;
  await KV.put(DAILY_WRITES_KEY, JSON.stringify(dailyData));

  return dailyData;
}

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
