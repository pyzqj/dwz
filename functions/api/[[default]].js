/**
 * EdgeOne Edge Function: REST API Endpoint
 * Handles: /api/*
 */

import { getKV, getBlob } from "../utils/storage.js";
import { authenticate, createSession, verifySession, hashPassword, jsonResponse, getAdminConfig } from "../utils/auth.js";

function getTodayString() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

function getRandomKey(len = 6) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let res = "";
  for (let i = 0; i < len; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
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
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      },
    });
  }

  const kv = getKV(context);
  const blob = getBlob("dwz-blob");

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
    if (session && session.token) {
      await kv.delete(`session_${session.token}`);
    }
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "dwz_token=; Path=/; HttpOnly; Max-Age=0",
    };
    return new Response(JSON.stringify({ code: 200, msg: "已退出登录" }), { status: 200, headers });
  }

  // -------------------------------------------------------------
  // Protected Routes Verification
  // -------------------------------------------------------------
  const session = await verifySession(request, kv);
  if (!session) {
    return jsonResponse({ code: 401, msg: "未登录或登录已过期" }, 401);
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
        // compute today's pv if date matched
        const todayPvCount = item.today_pv && item.today_pv.date === today ? item.today_pv.pv : 0;
        list.push({
          ...item,
          today_pv_count: todayPvCount,
        });
      }
    }

    // Sort by createdAt descending
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return jsonResponse({ code: 200, data: list });
  }

  if (path === "/dwz/create" && method === "POST") {
    const body = await request.json();
    let { title, url: targetUrl, key, type = 1, android_url = "", ios_url = "", windows_url = "" } = body;

    if (!targetUrl) {
      return jsonResponse({ code: 400, msg: "目标链接不能为空" }, 400);
    }
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    key = (key || "").trim();
    if (!key) {
      key = getRandomKey(6);
    } else {
      if (!/^[a-zA-Z0-9_-]{2,32}$/.test(key)) {
        return jsonResponse({ code: 400, msg: "自定义短链仅限2-32位字母数字或下划线横线" }, 400);
      }
    }

    // Check if key exists
    const existing = await kv.getJSON(`dwz_key_${key}`);
    if (existing) {
      return jsonResponse({ code: 400, msg: `短链 Key [${key}] 已被占用，请更换` }, 400);
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
      android_url: android_url || "",
      ios_url: ios_url || "",
      windows_url: windows_url || "",
      status: 1, // 1: 启用, 2: 停用
      pv: 0,
      today_pv: { pv: 0, date: getTodayString() },
      createdAt: Date.now(),
      created_at: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    };

    await kv.putJSON(`dwz_key_${key}`, dwzItem);

    // Update index
    const dwzIndex = (await kv.getJSON("dwz_index")) || [];
    if (!dwzIndex.includes(key)) {
      dwzIndex.unshift(key);
      await kv.putJSON("dwz_index", dwzIndex);
    }

    return jsonResponse({
      code: 200,
      msg: "创建短网址成功",
      data: {
        ...dwzItem,
        shortUrl: `${url.origin}/s/${key}`,
      },
    });
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
      if (u && !u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
      dwzItem.url = u;
    }
    if (type !== undefined) dwzItem.type = Number(type);
    if (android_url !== undefined) dwzItem.android_url = android_url;
    if (ios_url !== undefined) dwzItem.ios_url = ios_url;
    if (windows_url !== undefined) dwzItem.windows_url = windows_url;
    dwzItem.updatedAt = Date.now();

    await kv.putJSON(`dwz_key_${key}`, dwzItem);
    return jsonResponse({ code: 200, msg: "修改短网址成功", data: dwzItem });
  }

  if (path === "/dwz/toggle" && method === "POST") {
    const { key } = await request.json();
    const dwzItem = await kv.getJSON(`dwz_key_${key}`);
    if (!dwzItem) return jsonResponse({ code: 404, msg: "短网址不存在" }, 404);

    dwzItem.status = dwzItem.status === 1 ? 2 : 1;
    await kv.putJSON(`dwz_key_${key}`, dwzItem);
    return jsonResponse({
      code: 200,
      msg: dwzItem.status === 1 ? "已开启该短网址" : "已暂停该短网址",
      data: { status: dwzItem.status },
    });
  }

  if (path === "/dwz/reset-pv" && method === "POST") {
    const { key } = await request.json();
    const dwzItem = await kv.getJSON(`dwz_key_${key}`);
    if (!dwzItem) return jsonResponse({ code: 404, msg: "短网址不存在" }, 404);

    dwzItem.pv = 0;
    dwzItem.today_pv = { pv: 0, date: getTodayString() };
    await kv.putJSON(`dwz_key_${key}`, dwzItem);
    return jsonResponse({ code: 200, msg: "访问量已清零" });
  }

  if (path === "/dwz/delete" && method === "POST") {
    const { key } = await request.json();
    await kv.delete(`dwz_key_${key}`);

    const dwzIndex = (await kv.getJSON("dwz_index")) || [];
    const newIndex = dwzIndex.filter((k) => k !== key);
    await kv.putJSON("dwz_index", newIndex);

    return jsonResponse({ code: 200, msg: "删除成功" });
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
        const activeZimaCount = zimaList.filter((z) => z.status === 1).length;

        list.push({
          ...item,
          today_pv_count: todayPvCount,
          total_zima: zimaList.length,
          active_zima: activeZimaCount,
        });
      }
    }

    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return jsonResponse({ code: 200, data: list });
  }

  if (path === "/qun/get" && method === "GET") {
    const qid = url.searchParams.get("id");
    if (!qid) return jsonResponse({ code: 400, msg: "缺少活码 ID" }, 400);

    const item = await kv.getJSON(`qun_data_${qid}`);
    if (!item) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    return jsonResponse({ code: 200, data: item });
  }

  if (path === "/qun/create" && method === "POST") {
    const body = await request.json();
    const { title, qc = 1, safety = 1, kf_qrcode = "", kf_status = 0, beizhu = "" } = body;

    if (!title) {
      return jsonResponse({ code: 400, msg: "群活码标题不能为空" }, 400);
    }

    const qid = Date.now();
    const qunItem = {
      id: qid,
      title,
      status: 1, // 1: 启用, 2: 停用
      qc: Number(qc) || 0, // 1: 开启去重 (Cookie 7天固定展示首次扫码的子码)
      safety: Number(safety) || 0, // 1: 展示安全认证提示绿标
      kf_qrcode: kf_qrcode || "", // 客服二维码图片 (全满兜底)
      kf_status: Number(kf_status) || 0,
      beizhu: beizhu || "",
      pv: 0,
      today_pv: { pv: 0, date: getTodayString() },
      createdAt: Date.now(),
      created_at: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      zima: [], // 子码列表
    };

    await kv.putJSON(`qun_data_${qid}`, qunItem);

    const qunIndex = (await kv.getJSON("qun_index")) || [];
    qunIndex.unshift(qid);
    await kv.putJSON("qun_index", qunIndex);

    return jsonResponse({ code: 200, msg: "创建群活码成功", data: qunItem });
  }

  if (path === "/qun/update" && method === "POST") {
    const body = await request.json();
    const { id, title, qc, safety, kf_qrcode, kf_status, beizhu } = body;

    if (!id) return jsonResponse({ code: 400, msg: "缺少活码 ID" }, 400);

    const qunItem = await kv.getJSON(`qun_data_${id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    if (title !== undefined) qunItem.title = title;
    if (qc !== undefined) qunItem.qc = Number(qc);
    if (safety !== undefined) qunItem.safety = Number(safety);
    if (kf_qrcode !== undefined) qunItem.kf_qrcode = kf_qrcode;
    if (kf_status !== undefined) qunItem.kf_status = Number(kf_status);
    if (beizhu !== undefined) qunItem.beizhu = beizhu;
    qunItem.updatedAt = Date.now();

    await kv.putJSON(`qun_data_${id}`, qunItem);
    return jsonResponse({ code: 200, msg: "修改群活码成功", data: qunItem });
  }

  if (path === "/qun/toggle" && method === "POST") {
    const { id } = await request.json();
    const qunItem = await kv.getJSON(`qun_data_${id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    qunItem.status = qunItem.status === 1 ? 2 : 1;
    await kv.putJSON(`qun_data_${id}`, qunItem);
    return jsonResponse({
      code: 200,
      msg: qunItem.status === 1 ? "已开启该群活码" : "已暂停该群活码",
      data: { status: qunItem.status },
    });
  }

  if (path === "/qun/reset-pv" && method === "POST") {
    const { id } = await request.json();
    const qunItem = await kv.getJSON(`qun_data_${id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    qunItem.pv = 0;
    qunItem.today_pv = { pv: 0, date: getTodayString() };
    await kv.putJSON(`qun_data_${id}`, qunItem);
    return jsonResponse({ code: 200, msg: "访问量已清零" });
  }

  if (path === "/qun/delete" && method === "POST") {
    const { id } = await request.json();
    await kv.delete(`qun_data_${id}`);

    const qunIndex = (await kv.getJSON("qun_index")) || [];
    const newIndex = qunIndex.filter((qid) => String(qid) !== String(id));
    await kv.putJSON("qun_index", newIndex);

    return jsonResponse({ code: 200, msg: "删除成功" });
  }

  // -------------------------------------------------------------
  // 群子码 (zima) Management Routes
  // -------------------------------------------------------------
  if (path === "/qun/zima/add" && method === "POST") {
    const body = await request.json();
    const { qun_id, qrcode, max_num = 200, leader = "" } = body;

    if (!qun_id || !qrcode) {
      return jsonResponse({ code: 400, msg: "请上传群二维码图片" }, 400);
    }

    const qunItem = await kv.getJSON(`qun_data_${qun_id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    const newZima = {
      id: Date.now(),
      qrcode,
      max_num: Number(max_num) || 200,
      pv: 0,
      status: 1, // 1: 启用, 2: 停用
      leader: leader || "",
      createdAt: Date.now(),
    };

    if (!Array.isArray(qunItem.zima)) qunItem.zima = [];
    qunItem.zima.push(newZima);

    await kv.putJSON(`qun_data_${qun_id}`, qunItem);
    return jsonResponse({ code: 200, msg: "添加子码成功", data: newZima });
  }

  if (path === "/qun/zima/update" && method === "POST") {
    const body = await request.json();
    const { qun_id, zm_id, qrcode, max_num, leader, pv } = body;

    const qunItem = await kv.getJSON(`qun_data_${qun_id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    const zima = (qunItem.zima || []).find((z) => String(z.id) === String(zm_id));
    if (!zima) return jsonResponse({ code: 404, msg: "子码不存在" }, 404);

    if (qrcode !== undefined) zima.qrcode = qrcode;
    if (max_num !== undefined) zima.max_num = Number(max_num);
    if (leader !== undefined) zima.leader = leader;
    if (pv !== undefined) zima.pv = Number(pv);

    await kv.putJSON(`qun_data_${qun_id}`, qunItem);
    return jsonResponse({ code: 200, msg: "修改子码成功", data: zima });
  }

  if (path === "/qun/zima/toggle" && method === "POST") {
    const { qun_id, zm_id } = await request.json();
    const qunItem = await kv.getJSON(`qun_data_${qun_id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    const zima = (qunItem.zima || []).find((z) => String(z.id) === String(zm_id));
    if (!zima) return jsonResponse({ code: 404, msg: "子码不存在" }, 404);

    zima.status = zima.status === 1 ? 2 : 1;
    await kv.putJSON(`qun_data_${qun_id}`, qunItem);
    return jsonResponse({ code: 200, msg: zima.status === 1 ? "子码已启用" : "子码已暂停" });
  }

  if (path === "/qun/zima/reset-pv" && method === "POST") {
    const { qun_id, zm_id } = await request.json();
    const qunItem = await kv.getJSON(`qun_data_${qun_id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    const zima = (qunItem.zima || []).find((z) => String(z.id) === String(zm_id));
    if (!zima) return jsonResponse({ code: 404, msg: "子码不存在" }, 404);

    zima.pv = 0;
    await kv.putJSON(`qun_data_${qun_id}`, qunItem);
    return jsonResponse({ code: 200, msg: "子码访问量已清零" });
  }

  if (path === "/qun/zima/delete" && method === "POST") {
    const { qun_id, zm_id } = await request.json();
    const qunItem = await kv.getJSON(`qun_data_${qun_id}`);
    if (!qunItem) return jsonResponse({ code: 404, msg: "群活码不存在" }, 404);

    qunItem.zima = (qunItem.zima || []).filter((z) => String(z.id) !== String(zm_id));
    await kv.putJSON(`qun_data_${qun_id}`, qunItem);
    return jsonResponse({ code: 200, msg: "子码删除成功" });
  }

  // -------------------------------------------------------------
  // EdgeOne Blob Upload & Material Management
  // -------------------------------------------------------------
  if (path === "/upload" && method === "POST") {
    try {
      const contentType = request.headers.get("content-type") || "";

      let buffer;
      let filename = "";
      let ext = "png";

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!file || typeof file.arrayBuffer !== "function") {
          return jsonResponse({ code: 400, msg: "未找到上传的文件" }, 400);
        }
        buffer = new Uint8Array(await file.arrayBuffer());
        filename = file.name || "upload.png";
        const dotIdx = filename.lastIndexOf(".");
        if (dotIdx !== -1) ext = filename.substring(dotIdx + 1).toLowerCase();
      } else if (contentType.includes("application/json")) {
        const json = await request.json();
        const base64Data = json.base64 || "";
        filename = json.filename || "upload.png";
        const match = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (match) {
          ext = match[1].toLowerCase();
          const binary = atob(match[2]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          buffer = bytes;
        } else {
          return jsonResponse({ code: 400, msg: "Base64 图片格式无效" }, 400);
        }
      } else {
        buffer = new Uint8Array(await request.arrayBuffer());
      }

      if (!buffer || buffer.length === 0) {
        return jsonResponse({ code: 400, msg: "文件内容为空" }, 400);
      }

      // Generate unique key
      const key = `uploads/${Date.now()}_${getRandomKey(8)}.${ext}`;
      await blob.set(key, buffer, { cacheControl: "public, max-age=31536000, immutable" });

      const fileUrl = `/api/blob/${key}`;
      return jsonResponse({
        code: 200,
        msg: "上传成功",
        data: {
          url: fileUrl,
          key,
          size: buffer.length,
          name: filename,
        },
      });
    } catch (err) {
      return jsonResponse({ code: 500, msg: "文件上传失败: " + err.message }, 500);
    }
  }

  if (path === "/blob/list" && method === "GET") {
    try {
      const list = await blob.list({ prefix: "uploads/" });
      const blobs = list.blobs || [];
      return jsonResponse({
        code: 200,
        data: blobs.map((b) => ({
          key: b.key,
          url: `/api/blob/${b.key}`,
          size: b.size,
          lastModified: b.uploadedAt || b.lastModified,
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
  return jsonResponse({ code: 404, msg: "API 端点不存在: " + path }, 404);
}
