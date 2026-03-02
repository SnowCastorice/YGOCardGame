/**
 * Cloudflare Pages Function - 开包统计 API
 * 
 * 功能说明：
 *   统计全球玩家的开包数量，支持按卡包分别统计。
 *   使用 Cloudflare KV 存储数据。
 * 
 * API 接口：
 *   POST /api/pack-stats           - 上报开包数据
 *   GET  /api/pack-stats            - 查询指定卡包的全球开包统计
 *   GET  /api/pack-stats?admin=1    - 查询所有卡包的全局统计（管理后台用）
 * 
 * KV 绑定名称：PACK_STATS（需要在 Cloudflare 控制台创建并绑定）
 * 
 * KV 数据结构：
 *   Key: "stats:{packCode}"  Value: JSON { totalPacks, totalBoxes, lastUpdated }
 *   Key: "stats:_all"        Value: JSON { totalPacks, totalBoxes, lastUpdated }
 *   Key: "index:packs"       Value: JSON [ "LOCH", "BLZD", ... ] （所有有数据的卡包列表）
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

/** 管理员密钥（用于后台查询全局数据，简单鉴权） */
const ADMIN_KEY = 'ygo-pack-stats-2026';

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
 * Body: { packCode: "LOCH", type: "pack" | "box", count: 1 }
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

  const { packCode, type, count } = body;

  // 参数校验
  if (!packCode || typeof packCode !== 'string') {
    return jsonResponse({ error: '缺少 packCode 参数' }, 400, origin);
  }
  if (!['pack', 'box'].includes(type)) {
    return jsonResponse({ error: 'type 必须是 "pack" 或 "box"' }, 400, origin);
  }
  const packCount = (type === 'pack') ? (count || 1) : 0;
  const boxCount = (type === 'box') ? (count || 1) : 0;

  try {
    // 更新卡包维度的统计
    const packKey = `stats:${packCode}`;
    const packStats = await getStats(KV, packKey);
    packStats.totalPacks += packCount;
    packStats.totalBoxes += boxCount;
    packStats.lastUpdated = new Date().toISOString();
    await KV.put(packKey, JSON.stringify(packStats));

    // 更新全局总计
    const allKey = 'stats:_all';
    const allStats = await getStats(KV, allKey);
    allStats.totalPacks += packCount;
    allStats.totalBoxes += boxCount;
    allStats.lastUpdated = new Date().toISOString();
    await KV.put(allKey, JSON.stringify(allStats));

    // 维护卡包索引（确保这个卡包在索引列表中）
    await addToPackIndex(KV, packCode);

    return jsonResponse({
      success: true,
      packStats: { packCode, totalPacks: packStats.totalPacks, totalBoxes: packStats.totalBoxes },
      globalStats: { totalPacks: allStats.totalPacks, totalBoxes: allStats.totalBoxes }
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
 * GET /api/pack-stats?admin=1&key=xxx      - 查询全局统计（管理后台）
 */
async function handleQuery(context) {
  const request = context.request;
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  const KV = context.env.PACK_STATS;

  if (!KV) {
    return jsonResponse({ error: 'KV 未绑定' }, 500, origin);
  }

  // 管理后台查询：返回所有卡包的统计
  const isAdmin = url.searchParams.get('admin') === '1';
  if (isAdmin) {
    const key = url.searchParams.get('key');
    if (key !== ADMIN_KEY) {
      return jsonResponse({ error: '管理员密钥错误' }, 403, origin);
    }

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
