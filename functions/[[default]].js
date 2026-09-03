/**
 * EdgeOne Edge Function: Root-level Short URL Redirection & Analytics
 * Route: /* (e.g. /:key like /37v)
 */

import { getKV } from "./utils/storage.js";

function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

const RESERVED_PREFIXES = new Set([
  "",
  "api",
  "console",
  "static",
  "qun",
  "s",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "index.html",
]);

function renderMessagePage(title, message, subtext = "", extraHtml = "") {
  return new Response(
    `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f7f9fa;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border-radius: 20px;
      padding: 40px 28px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
    }
    .icon {
      width: 68px;
      height: 68px;
      margin: 0 auto 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff7e6;
      color: #fa8c16;
      font-size: 32px;
    }
    h2 { font-size: 20px; font-weight: 600; margin-bottom: 12px; color: #262626; }
    p { font-size: 15px; color: #595959; line-height: 1.6; margin-bottom: 24px; }
    .btn {
      display: inline-block;
      padding: 12px 28px;
      background: #1677ff;
      color: #ffffff;
      border-radius: 12px;
      text-decoration: none;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn:hover { background: #0958d9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h2>${title}</h2>
    <p>${message}${subtext ? "<br><small style='color:#8c8c8c;'>" + subtext + "</small>" : ""}</p>
    ${extraHtml}
  </div>
</body>
</html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

function renderWeChatOpenInBrowserPage(targetUrl) {
  return new Response(
    `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
  <title>请在浏览器中打开</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1f1f1f; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; }
    .guide-box {
      padding: 40px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .arrow-container {
      position: fixed;
      top: 16px;
      right: 24px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .arrow-icon {
      font-size: 44px;
      animation: float 1.5s ease-in-out infinite alternate;
    }
    @keyframes float { 0% { transform: translateY(0); } 100% { transform: translateY(-8px); } }
    .tips {
      margin-top: 100px;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.6;
    }
    .copy-btn {
      margin-top: 40px;
      background: #07c160;
      color: #fff;
      border: none;
      padding: 14px 32px;
      font-size: 16px;
      border-radius: 24px;
      font-weight: 500;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="arrow-container">
    <div class="arrow-icon">↗</div>
  </div>
  <div class="guide-box">
    <div class="tips">
      点击右上角【...】<br>
      选择【在浏览器打开】
    </div>
    <button class="copy-btn" onclick="copyLink()">复制网页链接</button>
  </div>
  <script>
    function copyLink() {
      navigator.clipboard.writeText("${targetUrl}").then(function() {
        alert("链接已复制，可前往手机浏览器粘贴访问");
      }).catch(function() {
        alert("链接地址: ${targetUrl}");
      });
    }
  </script>
</body>
</html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

export default async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Let homepage, static assets, and dot files pass to static files
  if (pathname === "/" || pathname.includes(".")) {
    if (typeof next === "function") return next();
    if (context.env && typeof context.next === "function") return context.next();
  }

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    if (typeof next === "function") return next();
    return new Response("Not Found", { status: 404 });
  }

  const firstSegment = parts[0].toLowerCase();

  // If first segment is reserved (api, console, static, qun, s), let it pass to other functions or static CDN
  if (RESERVED_PREFIXES.has(firstSegment)) {
    if (typeof next === "function") return next();
    if (context.env && typeof context.next === "function") return context.next();
    return new Response("Not Found", { status: 404 });
  }

  // Treat first segment as a short URL Key!
  const key = parts[0].trim();
  const kv = getKV(context);
  const dwzItem = await kv.getJSON(`dwz_key_${key}`);

  if (!dwzItem) {
    // If not in KV, try next() in case it is a static file or directory
    if (typeof next === "function") {
      const resp = await next();
      if (resp && resp.status !== 404) return resp;
    }
    return renderMessagePage("温馨提示", "短网址链接不存在或已被删除", `Key: ${key}`);
  }

  // Check if status is enabled
  if (Number(dwzItem.status) !== 1) {
    return renderMessagePage(
      "温馨提示",
      "该短网址已被管理员暂时关闭访问",
      "",
      '<a class="btn" href="/">返回首页</a>'
    );
  }

  // Record PV asynchronously
  const today = getTodayString();
  dwzItem.pv = (Number(dwzItem.pv) || 0) + 1;
  if (!dwzItem.today_pv || dwzItem.today_pv.date !== today) {
    dwzItem.today_pv = { pv: 1, date: today };
  } else {
    dwzItem.today_pv.pv = (Number(dwzItem.today_pv.pv) || 0) + 1;
  }

  try {
    if (context && typeof context.waitUntil === "function") {
      context.waitUntil(kv.putJSON(`dwz_key_${key}`, dwzItem));
    } else {
      await kv.putJSON(`dwz_key_${key}`, dwzItem);
    }
  } catch (e) {
    console.error(`[PV Record Error] key: ${key}`, e);
  }

  // User Agent Inspection
  const userAgent = request.headers.get("user-agent") || "";
  const isWeChat = /micromessenger/i.test(userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(userAgent);
  const isAndroid = /android/i.test(userAgent);

  const type = Number(dwzItem.type) || 1;
  let targetUrl = dwzItem.url;

  switch (type) {
    case 1:
      // Direct 302 Redirection
      break;

    case 2:
      // WeChat Only
      if (!isWeChat) {
        return renderMessagePage("请在微信中打开", "该链接已被设置为仅限微信内置浏览器访问。");
      }
      break;

    case 3:
      // iOS Only
      if (!isIOS) {
        return renderMessagePage("系统不兼容", "该链接已被设置为仅限苹果 (iOS) 移动设备访问。");
      }
      break;

    case 4:
      // Android Only
      if (!isAndroid) {
        return renderMessagePage("系统不兼容", "该链接已被设置为仅限安卓 (Android) 移动设备访问。");
      }
      break;

    case 5:
      // Browser Only (Block WeChat)
      if (isWeChat) {
        return renderWeChatOpenInBrowserPage(targetUrl);
      }
      break;

    case 6:
      // OS Specific Routing
      if (isAndroid && dwzItem.android_url) {
        targetUrl = dwzItem.android_url;
      } else if (isIOS && dwzItem.ios_url) {
        targetUrl = dwzItem.ios_url;
      } else if (!isAndroid && !isIOS && dwzItem.windows_url) {
        targetUrl = dwzItem.windows_url;
      }
      break;

    default:
      break;
  }

  if (!targetUrl || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
    return renderMessagePage("链接格式错误", "目标跳转网址不合法或格式错误");
  }

  return Response.redirect(targetUrl, 302);
}
