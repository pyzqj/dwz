/**
 * EdgeOne Edge Function: Short URL Redirection & Analytics
 * Route: /s/* (e.g. /s/:key or /s?key=:key)
 */

import { getKV } from "../utils/storage.js";

function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

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
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/s\/?/, "");
  const key = (path || url.searchParams.get("key") || "").trim();

  if (!key) {
    return renderMessagePage("温馨提示", "短网址请求参数为空");
  }

  const kv = getKV(context);
  const dwzItem = await kv.getJSON(`dwz_key_${key}`);

  if (!dwzItem) {
    return renderMessagePage("温馨提示", "短网址链接不存在或已被删除");
  }

  if (dwzItem.status !== 1) {
    return renderMessagePage("温馨提示", "该短网址链接已被暂停使用");
  }

  // Update analytics PV (asynchronously)
  dwzItem.pv = (dwzItem.pv || 0) + 1;
  const today = getTodayString();
  if (dwzItem.today_pv && dwzItem.today_pv.date === today) {
    dwzItem.today_pv.pv = (dwzItem.today_pv.pv || 0) + 1;
  } else {
    dwzItem.today_pv = { pv: 1, date: today };
  }
  // Store updated counts
  context.waitUntil
    ? context.waitUntil(kv.putJSON(`dwz_key_${key}`, dwzItem))
    : await kv.putJSON(`dwz_key_${key}`, dwzItem);

  const ua = request.headers.get("user-agent") || "";
  const isWeChat = /MicroMessenger/i.test(ua);
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isWindows = /Windows/i.test(ua);

  const type = Number(dwzItem.type) || 1;
  let targetUrl = dwzItem.url;

  // Type 1: No restriction
  if (type === 1) {
    return Response.redirect(targetUrl, 302);
  }

  // Type 2: WeChat only
  if (type === 2) {
    if (!isWeChat) {
      return renderMessagePage(
        "温馨提示",
        "该链接仅限在微信客户端内访问",
        "请使用微信扫一扫或将链接发送到微信内打开"
      );
    }
    return Response.redirect(targetUrl, 302);
  }

  // Type 3: iOS only
  if (type === 3) {
    if (!isIos) {
      return renderMessagePage("温馨提示", "该链接仅限在 iOS 设备（iPhone/iPad）上访问");
    }
    return Response.redirect(targetUrl, 302);
  }

  // Type 4: Android only
  if (type === 4) {
    if (!isAndroid) {
      return renderMessagePage("温馨提示", "该链接仅限在 Android 设备上访问");
    }
    return Response.redirect(targetUrl, 302);
  }

  // Type 5: Mobile browser only (prompt in WeChat)
  if (type === 5) {
    if (isWeChat) {
      return renderWeChatOpenInBrowserPage(targetUrl);
    }
    return Response.redirect(targetUrl, 302);
  }

  // Type 6: Device split
  if (type === 6) {
    if (isAndroid && dwzItem.android_url) {
      targetUrl = dwzItem.android_url;
    } else if (isIos && dwzItem.ios_url) {
      targetUrl = dwzItem.ios_url;
    } else if (isWindows && dwzItem.windows_url) {
      targetUrl = dwzItem.windows_url;
    }
    return Response.redirect(targetUrl, 302);
  }

  // Default fallback redirect
  return Response.redirect(targetUrl, 302);
}
