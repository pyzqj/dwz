/**
 * EdgeLink Full REST API Handler
 * Handles:
 * 1. Auth & Session (Web Crypto SHA-256) & API Key
 * 2. System Overview Stats
 * 3. Short URLs (dwz) CRUD & Open API (JSON & text formats)
 * 4. Group Live Codes (qun) CRUD & Subcodes (zima) Management
 * 5. Blob Materials Upload, Discovery, and Direct File Streaming (/api/blob/*)
 */

import { getKV, getBlob, getAllBlobs, getBlobData } from "../utils/storage.js";
import {
  jsonResponse,
  getRandomKey,
  getTodayString,
  hashPassword,
  getAdminConfig,
  authenticate,
  createSession,
  verifySession,
} from "../utils/auth.js";

const MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  pdf: "application/pdf",
};

async function generateAutoShortKey(kv) {
  let length = 3;
  while (length <= 8) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = getRandomKey(length);
      const exists = await kv.getJSON(`dwz_key_${candidate}`);
      if (!exists) {
        return candidate;
      }
    }
    length++;
  }
  return getRandomKey(6);
}

export default async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Requested-With",
      },
    });
  }

  // -------------------------------------------------------------
  // Direct Blob Static File Streaming (/api/blob/*)
  // -------------------------------------------------------------
  if (path.startsWith("/blob/") && path !== "/blob/list" && method === "GET") {
    const rawKey = path.replace(/^\/blob\//, "");
    const blobKey = decodeURIComponent(rawKey);

    if (!blobKey) {
      return new Response("Missing file key", { status: 400 });
    }

    try {
      const data = await getBlobData(blobKey);
      if (!data) {
        return new Response("File not found in storage", { status: 404 });
      }

      const dotIdx = blobKey.lastIndexOf(".");
      const ext = dotIdx !== -1 ? blobKey.substring(dotIdx + 1).toLowerCase() : "";
      const contentType = MIME_TYPES[ext] || "image/jpeg";

      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response("Blob Read Error: " + err.message, { status: 500 });
    }
  }

  const kv = getKV(context);
  const blob = getBlob("dwz-blob");

  // Helper to check authorization (supports Session or API Key)
  async function checkAuth() {
    // 1. Check Session Token
    const session = await verifySession(request, kv);
    if (session) return { ok: true, user: session.username };

    // 2. Check API Key from header or query param
    const apiKey =
      request.headers.get("X-API-Key") ||
      request.headers.get("x-api-key") ||
      url.searchParams.get("api_key");

    if (apiKey) {
      let sysApiKey = await kv.get("system_api_key");
      if (!sysApiKey) {
        sysApiKey = "el_sec_" + getRandomKey(16);
        await kv.put("system_api_key", sysApiKey);
      }
      if (apiKey === sysApiKey) {
        return { ok: true, user: "api_client" };
      }
    }

    return { ok: false };
  }

  // Public config check for client
  if (path === "/system/public-config" && method === "GET") {
    const publicAllowed = (await kv.get("public_dwz_allowed")) === "1";
    return jsonResponse({ code: 200, data: { public_dwz_allowed: publicAllowed } });
  }

  // -------------------------------------------------------------
  // Public Auth Routes
  // -------------------------------------------------------------
  if (path === "/login" && method === "POST") {
    try {
      const body = await request.json();
      const { username, password } = body;
      const isValid = await authenticate(kv, username, password);

      if (!isValid) {
        return jsonResponse({ code: 401, msg: "账号或密码错误" }, 401);
      }

      const token = await createSession(kv, username);
      const headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `dwz_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
      };

      return new Response(
        JSON.stringify({
          code: 200,
          msg: "登录成功",
          data: { token, username },
        }),
        { status: 200, headers }
      );
    } catch (e) {
      return jsonResponse({ code: 500, msg: "请求格式错误: " + e.message }, 500);
    }
  }

  if (path === "/auth/check" && method === "GET") {
    const session = await verifySession(request, kv);
    if (session) {
      return jsonResponse({ code: 200, data: { loggedIn: true, username: session.username } });
    }
    return jsonResponse({ code: 200, data: { loggedIn: false } });
  }

  if (path === "/logout" && method === "POST") {
    const session = await verifySession(request, kv);
    if (session) {
      if (session.token) await kv.delete(`session_${session.token}`);
      if (session.username) await kv.delete(`user_session_token_${session.username}`);
    }
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "dwz_token=; Path=/; HttpOnly; Max-Age=0",
    };
    return new Response(JSON.stringify({ code: 200, msg: "已退出登录" }), { status: 200, headers });
  }

  // -------------------------------------------------------------
  // ⚡ Short URLs Creation (dwz/create supports GET & POST)
  // Supports Public Homepage Generation if enabled in settings
  // -------------------------------------------------------------
  if (path === "/dwz/create" && (method === "POST" || method === "GET")) {
    const auth = await checkAuth();
    if (!auth.ok) {
      const publicAllowed = (await kv.get("public_dwz_allowed")) === "1";
      if (!publicAllowed) {
        return jsonResponse({ code: 401, msg: "未授权：公开免登录生成短网址未开放，请登录后台生成" }, 401);
      }
    }

    let targetUrl, title, key, type, format;

    if (method === "POST") {
      try {
        const body = await request.json();
        targetUrl = body.url;
        title = body.title;
        key = body.key;
        type = body.type;
        format = body.format;
      } catch (e) {
        return jsonResponse({ code: 400, msg: "JSON 请求体格式错误" }, 400);
      }
    } else {
      targetUrl = url.searchParams.get("url");
      title = url.searchParams.get("title");
      key = url.searchParams.get("key");
      type = url.searchParams.get("type");
      format = url.searchParams.get("format");
    }

    if (!targetUrl) {
      return jsonResponse({ code: 400, msg: "目标链接不能为空 (参数 url)" }, 400);
    }

    targetUrl = targetUrl.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    key = (key || "").trim();
    if (!key) {
      // 默认 3 个字符，如果用完了自动自适应增加长度
      key = await generateAutoShortKey(kv);
    } else {
      if (!/^[a-zA-Z0-9_-]{2,32}$/.test(key)) {
        return jsonResponse({ code: 400, msg: "自定义短链仅限2-32位字母数字或下划线横线" }, 400);
      }
      const existing = await kv.getJSON(`dwz_key_${key}`);
      if (existing) {
        return jsonResponse({ code: 400, msg: `短链 Key [${key}] 已被占用，请更换` }, 400);
      }
    }

    let autoTitle = (title || "").trim();
    if (!autoTitle) {
      try {
        const parsed = new URL(targetUrl);
        autoTitle = `${parsed.hostname}_${key}`;
      } catch {
        autoTitle = "短网址_" + key;
      }
    }

    const dwzItem = {
      id: Date.now(),
      title: autoTitle,
      key,
      url: targetUrl,
      type: Number(type) || 1,
      android_url: "",
      ios_url: "",
      windows_url: "",
      status: 1,
      pv: 0,
      today_pv: { pv: 0, date: getTodayString() },
      createdAt: Date.now(),
      created_at: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    };

    await kv.putJSON(`dwz_key_${key}`, dwzItem);

    const dwzIndex = (await kv.getJSON("dwz_index")) || [];
    if (!dwzIndex.includes(key)) {
      dwzIndex.unshift(key);
      await kv.putJSON("dwz_index", dwzIndex);
    }

    const shortUrl = `${url.origin}/${key}`;

    if (format === "text") {
      return new Response(shortUrl, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return jsonResponse({
      code: 200,
      msg: "创建短网址成功",
      data: {
        ...dwzItem,
        shortUrl,
      },
    });
  }

  // -------------------------------------------------------------
  // Protected Routes (Require Session or API Key)
  // -------------------------------------------------------------
  const auth = await checkAuth();
  if (!auth.ok) {
    return jsonResponse({ code: 401, msg: "未登录或登录已过期" }, 401);
  }

  // API Key Management
  if (path === "/system/api-key" && method === "GET") {
    let key = await kv.get("system_api_key");
    if (!key) {
      key = "el_sec_" + getRandomKey(16);
      await kv.put("system_api_key", key);
    }
    return jsonResponse({ code: 200, data: { apiKey: key } });
  }

  if (path === "/system/api-key/regenerate" && method === "POST") {
    const newKey = "el_sec_" + getRandomKey(16);
    await kv.put("system_api_key", newKey);
    return jsonResponse({ code: 200, msg: "API Key 重置成功", data: { apiKey: newKey } });
  }

  // System Settings (Public Generation Switch)
  if (path === "/system/settings" && method === "GET") {
    const publicAllowed = (await kv.get("public_dwz_allowed")) === "1";
    return jsonResponse({
      code: 200,
      data: {
        public_dwz_allowed: publicAllowed,
      },
    });
  }

  if (path === "/system/settings" && method === "POST") {
    const body = await request.json();
    const isAllowed = body.public_dwz_allowed ? "1" : "0";
    await kv.put("public_dwz_allowed", isAllowed);
    return jsonResponse({
      code: 200,
      msg: isAllowed === "1" ? "已开启首页免登录直接生成短网址" : "已关闭首页免登录生成短网址",
      data: { public_dwz_allowed: isAllowed === "1" },
    });
  }

  // Change Password
  if (path === "/auth/change-password" && method === "POST") {
    const body = await request.json();
    const { oldPassword, newPassword } = body;
    const admin = await getAdminConfig(kv);

    const oldHash = await hashPassword(oldPassword);
    if (oldHash !== admin.passHash) {
      return jsonResponse({ code: 400, msg: "原密码不正确" }, 400);
    }

    if (!newPassword || newPassword.length < 5) {
      return jsonResponse({ code: 400, msg: "新密码长度不能少于5位" }, 400);
    }

    const newHash = await hashPassword(newPassword);
    await kv.putJSON("app_admin_settings", {
      username: admin.username,
      passHash: newHash,
      updatedAt: Date.now(),
    });

    return jsonResponse({ code: 200, msg: "密码修改成功，请牢记新密码" });
  }

  // System & Overview Statistics
  if (path === "/stats" && method === "GET") {
    const dwzIndex = (await kv.getJSON("dwz_index")) || [];
    const qunIndex = (await kv.getJSON("qun_index")) || [];
    const today = getTodayString();

    let totalDwzPv = 0;
    let todayDwzPv = 0;
    let totalQunPv = 0;
    let todayQunPv = 0;

    for (const key of dwzIndex) {
      const item = await kv.getJSON(`dwz_key_${key}`);
      if (item) {
        totalDwzPv += item.pv || 0;
        if (item.today_pv && item.today_pv.date === today) {
          todayDwzPv += item.today_pv.pv || 0;
        }
      }
    }

    for (const qid of qunIndex) {
      const item = await kv.getJSON(`qun_data_${qid}`);
      if (item) {
        totalQunPv += item.pv || 0;
        if (item.today_pv && item.today_pv.date === today) {
          todayQunPv += item.today_pv.pv || 0;
        }
      }
    }

    return jsonResponse({
      code: 200,
      data: {
        totalDwz: dwzIndex.length,
        totalQun: qunIndex.length,
        totalDwzPv,
        todayDwzPv,
        totalQunPv,
        todayQunPv,
        totalPv: totalDwzPv + totalQunPv,
        todayPv: todayDwzPv + todayQunPv,
        isMock: kv.isMock,
      },
    });
  }

  // -------------------------------------------------------------
  // 短网址 (dwz) Management Routes
  // -------------------------------------------------------------
  if (path === "/dwz/list" && method === "GET") {
    const dwzIndex = (await kv.getJSON("dwz_index")) || [];
    const list = [];
    const today = getTodayString();

    for (const key of dwzIndex) {
      const item = await kv.getJSON(`dwz_key_${key}`);
      if (item) {
        const todayPvCount = item.today_pv && item.today_pv.date === today ? item.today_pv.pv : 0;
        list.push({
          ...item,
          today_pv_count: todayPvCount,
        });
      }
    }

    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return jsonResponse({ code: 200, data: list });
  }

  if (path === "/dwz/update" && method === "POST") {
    const body = await request.json();
    const { key, title, url: targetUrl, type, android_url, ios_url, windows_url } = body;

    if (!key) return jsonResponse({ code: 400, msg: "缺少短网址 key" }, 400);

    const dwzItem = await kv.getJSON(`dwz_key_${key}`);
    if (!dwzItem) return jsonResponse({ code: 404, msg: "短网址不存在" }, 404);

    if (title !== undefined) dwzItem.title = title;
    if (targetUrl !== undefined) {
      let u = targetUrl.trim();
      if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
      dwzItem.url = u;
    }
    if (type !== undefined) dwzItem.type = Number(type) || 1;
    if (android_url !== undefined) dwzItem.android_url = android_url;
    if (ios_url !== undefined) dwzItem.ios_url = ios_url;
    if (windows_url !== undefined) dwzItem.windows_url = windows_url;

    await kv.putJSON(`dwz_key_${key}`, dwzItem);
    return jsonResponse({ code: 200, msg: "更新短网址成功", data: dwzItem });
  }

  if (path === "/dwz/toggle" && method === "POST") {
    const { key } = await request.json();
    if (!key) return jsonResponse({ code: 400, msg: "缺少短网址 key" }, 400);

    const dwzItem = await kv.getJSON(`dwz_key_${key}`);
    if (!dwzItem) return jsonResponse({ code: 404, msg: "短网址不存在" }, 404);

    dwzItem.status = dwzItem.status === 1 ? 2 : 1;
    await kv.putJSON(`dwz_key_${key}`, dwzItem);

    return jsonResponse({
      code: 200,
      msg: dwzItem.status === 1 ? "已启用该短网址" : "已停用该短网址",
      data: { status: dwzItem.status },
    });
  }

  if (path === "/dwz/reset-pv" && method === "POST") {
    const { key } = await request.json();
    if (!key) return jsonResponse({ code: 400, msg: "缺少短网址 key" }, 400);

    const dwzItem = await kv.getJSON(`dwz_key_${key}`);
    if (!dwzItem) return jsonResponse({ code: 404, msg: "短网址不存在" }, 404);

    dwzItem.pv = 0;
    dwzItem.today_pv = { pv: 0, date: getTodayString() };
    await kv.putJSON(`dwz_key_${key}`, dwzItem);

    return jsonResponse({ code: 200, msg: "访问量已成功清零" });
  }

  if (path === "/dwz/delete" && method === "POST") {
    const { key } = await request.json();
    if (!key) return jsonResponse({ code: 400, msg: "缺少短网址 key" }, 400);

    await kv.delete(`dwz_key_${key}`);
    const dwzIndex = (await kv.getJSON("dwz_index")) || [];
    const newIndex = dwzIndex.filter((k) => k !== key);
    await kv.putJSON("dwz_index", newIndex);

    return jsonResponse({ code: 200, msg: "短网址删除成功" });
  }

  // -------------------------------------------------------------
  // 群活码 (qun) Management Routes
  // -------------------------------------------------------------
  if (path === "/qun/list" && method === "GET") {
    const qunIndex = (await kv.getJSON("qun_index")) || [];
    const list = [];
    const today = getTodayString();

    for (const qid of qunIndex) {
      const item = await kv.getJSON(`qun_data_${qid}`);
      if (item) {
        const todayPvCount = item.today_pv && item.today_pv.date === today ? item.today_pv.pv : 0;
        const zimaList = item.zima || [];
        const activeZima = zimaList.filter((z) => z.status === 1);
        const totalCapacity = zimaList.reduce((sum, z) => sum + (Number(z.max_num) || 200), 0);
        const totalJoined = zimaList.reduce((sum, z) => sum + (Number(z.pv) || 0), 0);
        const currentActive = activeZima.find((z) => (Number(z.pv) || 0) < (Number(z.max_num) || 200));

        list.push({
          ...item,
          today_pv_count: todayPvCount,
          total_zima: zimaList.length,
          active_zima_count: activeZima.length,
          total_capacity: totalCapacity,
          total_joined: totalJoined,
          current_zima_num: currentActive ? zimaList.indexOf(currentActive) + 1 : 0,
        });
      }
    }

    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return jsonResponse({ code: 200, data: list });
  }

  if (path === "/qun/get" && method === "GET") {
    const qid = url.searchParams.get("id");
    if (!qid) return jsonResponse({ code: 400, msg: "缺少活码 id" }, 400);

    const item = await kv.getJSON(`qun_data_${qid}`);
    if (!item) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    return jsonResponse({ code: 200, data: item });
  }

  if (path === "/qun/create" && method === "POST") {
    const body = await request.json();
    const {
      title,
      beizhu = "",
      qc = 1,
      safety = 1,
      kf_status = 0,
      kf_qrcode = "",
      zima = [],
    } = body;

    if (!title || !title.trim()) {
      return jsonResponse({ code: 400, msg: "群活码标题不能为空" }, 400);
    }

    const qid = String(Date.now()).substring(3);

    const formattedZima = [];
    if (Array.isArray(zima)) {
      zima.forEach((zm, index) => {
        if (zm.qrcode) {
          formattedZima.push({
            id: `zm_${Date.now()}_${index}`,
            qrcode: zm.qrcode,
            max_num: Number(zm.max_num) || 200,
            pv: Number(zm.pv) || 0,
            leader: (zm.leader || "").trim(),
            status: 1,
            created_at: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
          });
        }
      });
    }

    const qunItem = {
      id: qid,
      title: title.trim(),
      beizhu: (beizhu || "").trim(),
      qc: Number(qc) === 1 ? 1 : 0,
      safety: Number(safety) === 1 ? 1 : 0,
      kf_status: Number(kf_status) === 1 ? 1 : 0,
      kf_qrcode: (kf_qrcode || "").trim(),
      status: 1,
      pv: 0,
      today_pv: { pv: 0, date: getTodayString() },
      createdAt: Date.now(),
      created_at: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      zima: formattedZima,
    };

    await kv.putJSON(`qun_data_${qid}`, qunItem);

    const qunIndex = (await kv.getJSON("qun_index")) || [];
    if (!qunIndex.includes(qid)) {
      qunIndex.unshift(qid);
      await kv.putJSON("qun_index", qunIndex);
    }

    return jsonResponse({
      code: 200,
      msg: "创建群活码成功",
      data: {
        ...qunItem,
        qunUrl: `${url.origin}/qun/${qid}`,
      },
    });
  }

  if (path === "/qun/update" && method === "POST") {
    const body = await request.json();
    const { id, title, beizhu, qc, safety, kf_status, kf_qrcode, zima } = body;

    if (!id) return jsonResponse({ code: 400, msg: "缺少活码 id" }, 400);

    const qunItem = await kv.getJSON(`qun_data_${id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    if (title !== undefined) qunItem.title = title.trim();
    if (beizhu !== undefined) qunItem.beizhu = beizhu.trim();
    if (qc !== undefined) qunItem.qc = Number(qc) === 1 ? 1 : 0;
    if (safety !== undefined) qunItem.safety = Number(safety) === 1 ? 1 : 0;
    if (kf_status !== undefined) qunItem.kf_status = Number(kf_status) === 1 ? 1 : 0;
    if (kf_qrcode !== undefined) qunItem.kf_qrcode = kf_qrcode.trim();
    if (Array.isArray(zima)) qunItem.zima = zima;

    await kv.putJSON(`qun_data_${id}`, qunItem);
    return jsonResponse({ code: 200, msg: "更新群活码成功", data: qunItem });
  }

  if (path === "/qun/toggle" && method === "POST") {
    const { id } = await request.json();
    if (!id) return jsonResponse({ code: 400, msg: "缺少活码 id" }, 400);

    const qunItem = await kv.getJSON(`qun_data_${id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    qunItem.status = qunItem.status === 1 ? 2 : 1;
    await kv.putJSON(`qun_data_${id}`, qunItem);

    return jsonResponse({
      code: 200,
      msg: qunItem.status === 1 ? "已启用该活码" : "已停用该活码",
      data: { status: qunItem.status },
    });
  }

  if (path === "/qun/reset-pv" && method === "POST") {
    const { id } = await request.json();
    if (!id) return jsonResponse({ code: 400, msg: "缺少活码 id" }, 400);

    const qunItem = await kv.getJSON(`qun_data_${id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    qunItem.pv = 0;
    qunItem.today_pv = { pv: 0, date: getTodayString() };
    if (Array.isArray(qunItem.zima)) {
      qunItem.zima.forEach((zm) => {
        zm.pv = 0;
      });
    }
    await kv.putJSON(`qun_data_${id}`, qunItem);

    return jsonResponse({ code: 200, msg: "群活码及所有子码访问量已全部清零" });
  }

  if (path === "/qun/delete" && method === "POST") {
    const { id } = await request.json();
    if (!id) return jsonResponse({ code: 400, msg: "缺少活码 id" }, 400);

    await kv.delete(`qun_data_${id}`);
    const qunIndex = (await kv.getJSON("qun_index")) || [];
    const newIndex = qunIndex.filter((qid) => qid !== id);
    await kv.putJSON("qun_index", newIndex);

    return jsonResponse({ code: 200, msg: "群活码删除成功" });
  }

  // Subcodes (Zima) Operations
  if (path === "/qun/zima/add" && method === "POST") {
    const { qun_id, qrcode, max_num = 200, leader = "" } = await request.json();

    if (!qun_id || !qrcode) {
      return jsonResponse({ code: 400, msg: "缺少群活码 ID 或二维码图片地址" }, 400);
    }

    const qunItem = await kv.getJSON(`qun_data_${qun_id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    if (!Array.isArray(qunItem.zima)) qunItem.zima = [];

    const newZima = {
      id: `zm_${Date.now()}_${getRandomKey(4)}`,
      qrcode: qrcode.trim(),
      max_num: Number(max_num) || 200,
      pv: 0,
      leader: (leader || "").trim(),
      status: 1,
      created_at: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    };

    qunItem.zima.push(newZima);
    await kv.putJSON(`qun_data_${qun_id}`, qunItem);

    return jsonResponse({ code: 200, msg: "添加子码成功", data: newZima });
  }

  if (path === "/qun/zima/toggle" && method === "POST") {
    const { qun_id, zm_id } = await request.json();
    const qunItem = await kv.getJSON(`qun_data_${qun_id}`);
    if (!qunItem || !Array.isArray(qunItem.zima)) return jsonResponse({ code: 404, msg: "群或子码不存在" }, 404);

    const targetId = String(zm_id || "").trim();
    const zm = qunItem.zima.find((z) => String(z.id || "").trim() === targetId || String(z.qrcode || "").trim() === targetId);
    if (!zm) return jsonResponse({ code: 404, msg: "子码不存在" }, 404);

    zm.status = zm.status === 1 ? 0 : 1;
    await kv.putJSON(`qun_data_${qun_id}`, qunItem);

    return jsonResponse({ code: 200, msg: zm.status === 1 ? "已启用该子码" : "已暂停该子码" });
  }

  if (path === "/qun/zima/delete" && method === "POST") {
    const { qun_id, zm_id } = await request.json();
    const qunItem = await kv.getJSON(`qun_data_${qun_id}`);
    if (!qunItem || !Array.isArray(qunItem.zima)) return jsonResponse({ code: 404, msg: "群或子码不存在" }, 404);

    const targetId = String(zm_id || "").trim();
    const beforeCount = qunItem.zima.length;
    qunItem.zima = qunItem.zima.filter((z) => {
      const zid = String(z.id || "").trim();
      const zqr = String(z.qrcode || "").trim();
      return zid !== targetId && zqr !== targetId;
    });
    await kv.putJSON(`qun_data_${qun_id}`, qunItem);

    return jsonResponse({ code: 200, msg: "子码删除成功", data: { beforeCount, afterCount: qunItem.zima.length } });
  }

  if (path === "/qun/zima/reset-pv" && method === "POST") {
    const { qun_id, zm_id } = await request.json();
    const qunItem = await kv.getJSON(`qun_data_${qun_id}`);
    if (!qunItem || !Array.isArray(qunItem.zima)) return jsonResponse({ code: 404, msg: "群或子码不存在" }, 404);

    const targetId = String(zm_id || "").trim();
    const zm = qunItem.zima.find((z) => String(z.id || "").trim() === targetId || String(z.qrcode || "").trim() === targetId);
    if (!zm) return jsonResponse({ code: 404, msg: "子码不存在" }, 404);

    zm.pv = 0;
    await kv.putJSON(`qun_data_${qun_id}`, qunItem);

    return jsonResponse({ code: 200, msg: "子码访问量已清零" });
  }

  // -------------------------------------------------------------
  // Blob Materials Upload & Discovery Routes
  // -------------------------------------------------------------
  if (path === "/upload" && method === "POST") {
    try {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file.arrayBuffer !== "function") {
        return jsonResponse({ code: 400, msg: "未检测到上传的文件" }, 400);
      }

      const originalName = file.name || "image.png";
      const dotIdx = originalName.lastIndexOf(".");
      const ext = dotIdx !== -1 ? originalName.substring(dotIdx) : ".png";
      const key = `uploads/${Date.now()}_${getRandomKey(6)}${ext}`;

      const buffer = await file.arrayBuffer();
      await blob.set(key, buffer, {
        cacheControl: "public, max-age=31536000, immutable",
      });

      return jsonResponse({
        code: 200,
        msg: "文件上传成功",
        data: {
          key,
          url: `/api/blob/${key}`,
        },
      });
    } catch (err) {
      return jsonResponse({ code: 500, msg: "文件上传失败: " + err.message }, 500);
    }
  }

  if (path === "/blob/list" && method === "GET") {
    try {
      const blobs = await getAllBlobs();
      return jsonResponse({
        code: 200,
        data: blobs.map((b) => ({
          key: b.key,
          url: `/api/blob/${encodeURIComponent(b.key)}`,
          storeName: b.storeName,
          size: b.size,
          etag: b.etag,
        })),
      });
    } catch (err) {
      return jsonResponse({ code: 500, msg: "获取素材列表失败: " + err.message }, 500);
    }
  }

  if (path === "/blob/delete" && method === "POST") {
    try {
      const { key } = await request.json();
      if (!key) return jsonResponse({ code: 400, msg: "缺少素材 key" }, 400);
      await blob.delete(key);
      return jsonResponse({ code: 200, msg: "素材删除成功" });
    } catch (err) {
      return jsonResponse({ code: 500, msg: "删除失败: " + err.message }, 500);
    }
  }

  // 404 Fallback
  return jsonResponse({ code: 404, msg: `API 接口未找到: ${method} ${path}` }, 404);
}
