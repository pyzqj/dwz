/**
 * EdgeOne Edge Function: WeChat Group Live QR Code Landing Page & Rotation
 * Route: /qun/* (e.g. /qun/:qid or /qun?qid=:qid)
 */

import { getKV } from "../utils/storage.js";

function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

function renderMessagePage(title, message, subtext = "") {
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
      background: #ededed;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border-radius: 16px;
      padding: 36px 24px;
      max-width: 380px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    }
    .icon { font-size: 40px; margin-bottom: 16px; }
    h2 { font-size: 18px; font-weight: 600; color: #222; margin-bottom: 10px; }
    p { font-size: 14px; color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">💬</div>
    <h2>${title}</h2>
    <p>${message}${subtext ? "<br><small style='color:#999;'>" + subtext + "</small>" : ""}</p>
  </div>
</body>
</html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

function renderQunPage(qunItem, activeZima, isKfFallback = false, cookieHeaderToSet = null) {
  const qrImage = isKfFallback ? qunItem.kf_qrcode : activeZima ? activeZima.qrcode : "";
  const subtitle = isKfFallback
    ? "当前群已满员，请扫描下方客服二维码协助进群"
    : "微信扫一扫或长按二维码加入群聊";
  const leaderTip = !isKfFallback && activeZima && activeZima.leader
    ? `<div class="leader-tip">如二维码失效或无法进群，可添加群主微信：<strong>${activeZima.leader}</strong></div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0, viewport-fit=cover">
  <title>${qunItem.title || "微信群聊邀请"}</title>
  <link rel="shortcut icon" href="https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background-color: #ededed;
      color: #191919;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: ${qunItem.safety ? "60px 16px 30px" : "30px 16px"};
      position: relative;
    }

    /* 微信官方风格安全认证条 */
    .safety-bar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 42px;
      background: #e8f5e9;
      border-bottom: 1px solid #c8e6c9;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      color: #2e7d32;
      z-index: 100;
    }
    .safety-bar svg {
      width: 16px;
      height: 16px;
      margin-right: 6px;
      fill: #2e7d32;
    }

    /* 核心卡片容器 */
    .qun-card {
      background: #ffffff;
      border-radius: 16px;
      width: 100%;
      max-width: 380px;
      padding: 24px 18px 22px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      text-align: center;
      position: relative;
    }

    .group-header {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
    }
    .group-avatar {
      width: 48px;
      height: 48px;
      background: #07c160;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 24px;
      margin-right: 12px;
      flex-shrink: 0;
    }
    .group-info {
      text-align: left;
    }
    .group-title {
      font-size: 18px;
      font-weight: 600;
      color: #191919;
      line-height: 1.3;
      word-break: break-word;
    }
    .group-sub {
      font-size: 12px;
      color: #888888;
      margin-top: 4px;
    }

    /* 二维码展示区 */
    .qrcode-wrapper {
      width: 210px;
      height: 210px;
      max-width: 100%;
      margin: 10px auto 16px;
      border-radius: 12px;
      padding: 8px;
      background: #ffffff;
      border: 1px solid #eeeeee;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
    }
    .qrcode-img {
      max-width: 100%;
      max-height: 100%;
      border-radius: 8px;
      display: block;
      pointer-events: auto;
      user-select: all;
      -webkit-user-select: all;
    }

    .action-tip {
      font-size: 15px;
      font-weight: 500;
      color: #07c160;
      margin-bottom: 8px;
    }
    .expiry-tip {
      font-size: 12px;
      color: #999999;
      margin-bottom: 16px;
    }

    .leader-tip {
      background: #f7f7f7;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #555555;
      margin-top: 12px;
      line-height: 1.5;
    }

    /* 进群须知与公告 */
    .announcement {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px dashed #e8e8e8;
      text-align: left;
    }
    .announcement-title {
      font-size: 13px;
      font-weight: 600;
      color: #444444;
      margin-bottom: 6px;
    }
    .announcement-text {
      font-size: 13px;
      color: #666666;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .footer-tip {
      margin-top: 24px;
      font-size: 12px;
      color: #aaaaaa;
      text-align: center;
    }
  </style>
</head>
<body>
  ${
    qunItem.safety
      ? `<div class="safety-bar">
          <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
          该二维码已通过微信安全规范认证
        </div>`
      : ""
  }

  <div class="qun-card">
    <div class="group-header">
      <div class="group-avatar">👥</div>
      <div class="group-info">
        <div class="group-title">${qunItem.title || "微信交流群"}</div>
        <div class="group-sub">${isKfFallback ? "客服专线" : "加入官方微信群"}</div>
      </div>
    </div>

    <div class="qrcode-wrapper">
      <img class="qrcode-img" src="${qrImage}" alt="群二维码">
    </div>

    <div class="action-tip">${subtitle}</div>
    <div class="expiry-tip">长按上方二维码识别进群</div>

    ${leaderTip}

    ${
      qunItem.beizhu
        ? `<div class="announcement">
            <div class="announcement-title">📌 进群须知</div>
            <div class="announcement-text">${qunItem.beizhu}</div>
          </div>`
        : ""
    }
  </div>

  <div class="footer-tip">EdgeLink 安全链接已就绪</div>
</body>
</html>`;

  const headers = {
    "Content-Type": "text/html; charset=utf-8",
  };
  if (cookieHeaderToSet) {
    headers["Set-Cookie"] = cookieHeaderToSet;
  }

  return new Response(html, { status: 200, headers });
}

export default async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/qun\/?/, "");
  const qid = (path || url.searchParams.get("qid") || url.searchParams.get("id") || "").trim();

  if (!qid) {
    return renderMessagePage("温馨提示", "群活码请求参数为空");
  }

  const kv = getKV(context);
  const qunItem = await kv.getJSON(`qun_data_${qid}`);

  if (!qunItem) {
    return renderMessagePage("温馨提示", "该群活码不存在或已被删除");
  }

  if (qunItem.status !== 1) {
    return renderMessagePage("温馨提示", "该群活码已被暂停使用");
  }

  // Update total PV
  qunItem.pv = (qunItem.pv || 0) + 1;
  const today = getTodayString();
  if (qunItem.today_pv && qunItem.today_pv.date === today) {
    qunItem.today_pv.pv = (qunItem.today_pv.pv || 0) + 1;
  } else {
    qunItem.today_pv = { pv: 1, date: today };
  }

  const zimaList = Array.isArray(qunItem.zima) ? qunItem.zima : [];
  let selectedZima = null;
  let cookieHeaderToSet = null;

  // 1. Check deduplication (7-day cookie)
  if (qunItem.qc === 1) {
    const cookieHeader = request.headers.get("Cookie") || request.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)qun_qc_${qid}=([^;]+)`));
    if (match) {
      const cachedZmid = match[1].trim();
      const foundZima = zimaList.find((z) => String(z.id) === cachedZmid && z.status === 1);
      if (foundZima) {
        selectedZima = foundZima;
      }
    }
  }

  // 2. If no cached subcode, find the first available active subcode where pv < max_num
  if (!selectedZima) {
    const availableZima = zimaList.find((z) => {
      const max = Number(z.max_num) || 200;
      return z.status === 1 && (z.pv || 0) < max;
    });

    if (availableZima) {
      selectedZima = availableZima;
      selectedZima.pv = (selectedZima.pv || 0) + 1;

      // Set cookie if deduplication is enabled
      if (qunItem.qc === 1) {
        cookieHeaderToSet = `qun_qc_${qid}=${selectedZima.id}; Path=/; Max-Age=604800; SameSite=Lax`;
      }
    }
  }

  // Save updated PV counts to KV
  context.waitUntil
    ? context.waitUntil(kv.putJSON(`qun_data_${qid}`, qunItem))
    : await kv.putJSON(`qun_data_${qid}`, qunItem);

  // 3. If a valid subcode was found
  if (selectedZima) {
    return renderQunPage(qunItem, selectedZima, false, cookieHeaderToSet);
  }

  // 4. All subcodes are full or no subcode uploaded
  if (qunItem.kf_qrcode && qunItem.kf_status === 1) {
    // Show Customer Service QR code fallback
    return renderQunPage(qunItem, null, true);
  }

  // No customer service fallback available
  return renderMessagePage(
    qunItem.title || "微信群聊",
    "抱歉，当前所有微信群已满员",
    "请稍后再试或联系群管理员更新群二维码。"
  );
}
