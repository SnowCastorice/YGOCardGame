/**
 * Cloudflare Pages Function - KONAMI 游戏王卡图代理
 * 
 * 功能说明：
 *   通过服务端代理的方式，绕过 KONAMI 官网 (db.yugioh-card.com) 的 Imperva WAF 跨域限制，
 *   使浏览器能正常加载 KONAMI 官方的日文卡图。
 * 
 * 访问路径：/api/card-image?cid=4007
 * 返回结果：KONAMI 官网的真实卡图（JPEG 格式）
 * 
 * 部署方式：Cloudflare Pages Functions（随项目自动部署，无需额外配置）
 * 适用项目：YGO Card Game (https://ygocardgame.pages.dev/)
 */

// ============================================
// 配置区域
// ============================================

/** 允许访问的域名白名单（防止被他人滥用） */
const ALLOWED_ORIGINS = [
  'https://ygocardgame.pages.dev',   // 线上地址
  'http://localhost',                 // 本地开发（任意端口）
  'http://127.0.0.1',                // 本地开发（任意端口）
];

/** KONAMI 官方卡图接口模板 */
const KONAMI_IMAGE_URL = 'https://www.db.yugioh-card.com/yugiohdb/get_image.action';

/** 图片缓存时间（秒）- 卡图不会变化，设置较长的缓存 */
const CACHE_MAX_AGE = 86400 * 30; // 30 天

// ============================================
// Pages Function 入口
// ============================================

/**
 * Cloudflare Pages Function 的标准入口
 * 支持 GET 和 OPTIONS 请求
 */
export async function onRequest(context) {
  const request = context.request;

  // 处理 CORS 预检请求（OPTIONS）
  if (request.method === 'OPTIONS') {
    return handleCORS(request);
  }

  // 只允许 GET 请求
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  return handleCardImage(request);
}

// ============================================
// 卡图代理处理
// ============================================

/**
 * 处理卡图代理请求
 * 从 KONAMI 官网获取卡图并转发给浏览器
 */
async function handleCardImage(request) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);

  // 获取必需参数 cid
  const cid = url.searchParams.get('cid');
  if (!cid || !/^\d+$/.test(cid)) {
    return new Response(JSON.stringify({
      error: '参数错误',
      message: '请提供有效的 cid 参数（纯数字）',
      example: '/api/card-image?cid=4007'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCORSHeaders(origin) }
    });
  }

  try {
    // 向 KONAMI 官网请求卡图
    const konamiUrl = `${KONAMI_IMAGE_URL}?type=1&osplang=1&cid=${cid}&ciid=1`;

    const konamiResponse = await fetch(konamiUrl, {
      headers: {
        // 模拟正常的浏览器请求头
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.9',
        'Referer': 'https://www.db.yugioh-card.com/',
      },
      redirect: 'follow',
    });

    // 检查响应是否成功
    if (!konamiResponse.ok) {
      return new Response(JSON.stringify({
        error: '上游请求失败',
        status: konamiResponse.status,
        message: `KONAMI 服务器返回 ${konamiResponse.status}`
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...getCORSHeaders(origin)
        }
      });
    }

    // 获取图片数据
    const imageData = await konamiResponse.arrayBuffer();
    const contentType = konamiResponse.headers.get('Content-Type') || 'image/jpeg';

    // 返回图片给浏览器，附带 CORS 头和缓存策略
    return new Response(imageData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`,
        ...getCORSHeaders(origin),
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: '代理请求异常',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCORSHeaders(origin)
      }
    });
  }
}

// ============================================
// CORS 处理
// ============================================

/** 处理 CORS 预检请求 (OPTIONS) */
function handleCORS(request) {
  const origin = request.headers.get('Origin') || '';

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  });
}

/** 生成 CORS 响应头 */
function getCORSHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Length',
  };
}

/**
 * 检查请求来源是否在白名单中
 * 支持 localhost 和 127.0.0.1 的任意端口
 */
function isAllowedOrigin(origin) {
  if (!origin) return true; // 允许无 Origin 的请求（如直接浏览器访问）

  // 精确匹配
  if (ALLOWED_ORIGINS.includes(origin)) return true;

  // localhost / 127.0.0.1 带端口的情况（本地开发）
  if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) return true;

  return false;
}
