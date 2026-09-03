/**
 * EdgeLink (极连) Console SPA Frontend Application
 * Fully responsive, modern, cloud-native
 */

const STATE = {
  activeTab: "overview",
  isLoggedIn: false,
  username: "admin",
  apiKey: "",
  dwzList: [],
  qunList: [],
  blobList: [],
  currentQunId: null,
  newQunSubcodes: [], // Temp subcodes during creation
};

// Toast Notifications
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Mobile Menu Navigation Toggle
function toggleMobileMenu() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const isOpen = sidebar.classList.toggle("open");
  if (overlay) overlay.classList.toggle("show", isOpen);
}

function closeMobileMenu() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("show");
}

// Forward any EdgeOne preview parameters (eo_token, eo_time)
function getPreviewQueryParams() {
  const currentParams = new URLSearchParams(window.location.search);
  const forwardParams = new URLSearchParams();
  for (const [k, v] of currentParams.entries()) {
    if (k.startsWith("eo_") || k === "token" || k === "preview") {
      forwardParams.set(k, v);
    }
  }
  return forwardParams.toString();
}

// Unified API Helper
async function apiRequest(endpoint, method = "GET", body = null) {
  const previewQuery = getPreviewQueryParams();
  let fullUrl = endpoint;
  if (previewQuery) {
    fullUrl += (fullUrl.includes("?") ? "&" : "?") + previewQuery;
  }

  const options = {
    method,
    headers: {},
  };

  const token = localStorage.getItem("dwz_token");
  if (token) {
    options.headers["Authorization"] = `Bearer ${token}`;
  }

  if (body) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
  }

  try {
    const res = await fetch(fullUrl, options);

    // Detect if EdgeOne preview gateway blocked the request
    const eoMsg = res.headers.get("X-EOP-MSG") || "";
    if (eoMsg.includes("eo_time") || eoMsg.includes("token") || (res.status === 401 && eoMsg)) {
      showToast("EdgeOne 预览保护生效中，请使用自定义域名 https://d.pyz.me 访问，或在项目设置中关闭预览保护", "error");
      return null;
    }

    if (res.status === 401) {
      if (!endpoint.includes("/login")) {
        STATE.isLoggedIn = false;
        document.getElementById("authOverlay").style.display = "flex";
        document.getElementById("appContainer").style.display = "none";
        return null;
      }
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.warn("Non-JSON API response:", text.substring(0, 200));
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    showToast("网络请求异常: " + err.message, "error");
    return null;
  }
}

// Tab Switching
function switchTab(tabId) {
  closeMobileMenu();
  STATE.activeTab = tabId;
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.id === `tab-${tabId}`);
  });

  const titleMap = {
    overview: "概览面板",
    dwz: "短网址管理",
    qun: "群活码管理",
    blob: "素材库",
    api: "开放 API 文档",
    settings: "系统设置",
  };
  document.getElementById("currentPageTitle").textContent = titleMap[tabId] || "控制台";

  if (tabId === "overview") loadOverview();
  if (tabId === "dwz") loadDwzList();
  if (tabId === "qun") loadQunList();
  if (tabId === "blob") loadBlobList();
  if (tabId === "api") loadApiDocs();
  if (tabId === "settings") loadSystemSettings();
}

// Copy to Clipboard
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("已成功复制到剪贴板！");
    });
  } else {
    const input = document.createElement("input");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    showToast("已成功复制到剪贴板！");
  }
}

// Download QR Code Image
function downloadQrCode(containerId, filename = "qrcode.png") {
  const container = document.getElementById(containerId);
  if (!container) return;
  const img = container.querySelector("img");
  const canvas = container.querySelector("canvas");
  let dataUrl = "";
  if (img && img.src && img.src.startsWith("data:")) {
    dataUrl = img.src;
  } else if (canvas) {
    dataUrl = canvas.toDataURL("image/png");
  } else if (img && img.src) {
    dataUrl = img.src;
  }
  if (!dataUrl) {
    showToast("二维码生成中，请稍后再试", "error");
    return;
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  const cleanName = filename.replace(/[/\\?%*:|"<>]/g, "_");
  a.download = cleanName.endsWith(".png") ? cleanName : `${cleanName}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast("已开始下载二维码图片！");
}

// -------------------------------------------------------------
// Auth Logic
// -------------------------------------------------------------
async function checkAuth() {
  const res = await apiRequest("/api/auth/check");
  if (res && res.data && res.data.loggedIn) {
    STATE.isLoggedIn = true;
    STATE.username = res.data.username || "admin";
    document.getElementById("authOverlay").style.display = "none";
    document.getElementById("appContainer").style.display = "flex";
    document.getElementById("headerUsername").textContent = STATE.username;
    loadOverview();
  } else {
    STATE.isLoggedIn = false;
    document.getElementById("authOverlay").style.display = "flex";
    document.getElementById("appContainer").style.display = "none";
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const alertBox = document.getElementById("loginErrorAlert");
  if (alertBox) alertBox.style.display = "none";

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!username || !password) {
    if (alertBox) {
      alertBox.innerHTML = "<span>⚠️</span><span>请输入管理员账号和密码</span>";
      alertBox.style.display = "flex";
    }
    showToast("请输入管理员账号和密码", "error");
    return;
  }

  showToast("正在验证登录...", "info");
  const res = await apiRequest("/api/login", "POST", { username, password });
  if (res && res.code === 200) {
    showToast("登录成功！");
    localStorage.setItem("dwz_token", res.data.token);
    STATE.isLoggedIn = true;
    STATE.username = res.data.username;
    document.getElementById("authOverlay").style.display = "none";
    document.getElementById("appContainer").style.display = "flex";
    document.getElementById("headerUsername").textContent = STATE.username;
    if (alertBox) alertBox.style.display = "none";
    loadOverview();
  } else {
    const errorMsg = res?.msg || "账号或密码错误，请重新输入";
    if (alertBox) {
      alertBox.innerHTML = `<span>❌</span><span>${errorMsg}</span>`;
      alertBox.style.display = "flex";
    }
    showToast(errorMsg, "error");
  }
}

async function handleLogout() {
  if (!confirm("确定要退出登录吗？")) return;
  await apiRequest("/api/logout", "POST");
  localStorage.removeItem("dwz_token");
  STATE.isLoggedIn = false;
  document.getElementById("authOverlay").style.display = "flex";
  document.getElementById("appContainer").style.display = "none";
  showToast("已安全退出登录");
}

// -------------------------------------------------------------
// Overview Statistics
// -------------------------------------------------------------
async function loadOverview() {
  const res = await apiRequest("/api/stats");
  if (res && res.data) {
    const d = res.data;
    document.getElementById("statTotalDwz").textContent = d.totalDwz || 0;
    document.getElementById("statTodayDwzPv").textContent = d.todayDwzPv || 0;
    document.getElementById("statTotalQun").textContent = d.totalQun || 0;
    document.getElementById("statTodayQunPv").textContent = d.todayQunPv || 0;
    document.getElementById("statTotalPv").textContent = d.totalPv || 0;
    document.getElementById("statTodayPv").textContent = d.todayPv || 0;

    const runtimeBadge = document.getElementById("runtimeStatusBadge");
    if (d.isMock) {
      runtimeBadge.textContent = "🟡 本地开发模式 (Mock 存储)";
    } else {
      runtimeBadge.textContent = "🟢 边缘节点在线";
    }
  }
}

// -------------------------------------------------------------
// ⚡ 1-Step Quick Short URL Generator (粘贴长链一秒出短链)
// -------------------------------------------------------------
async function handleQuickGenerate(e, inputId = "quickUrlInput") {
  if (e) e.preventDefault();
  const inputEl = document.getElementById(inputId);
  const longUrl = inputEl ? inputEl.value.trim() : "";

  if (!longUrl) {
    showToast("请粘贴或输入长链接", "error");
    if (inputEl) inputEl.focus();
    return;
  }

  showToast("⚡ 正在生成短网址...", "info");
  const res = await apiRequest("/api/dwz/create", "POST", { url: longUrl });

  if (res && res.code === 200) {
    const shortUrl = res.data.shortUrl || `${window.location.origin}/${res.data.key}`;
    inputEl.value = "";

    // Automatically copy generated short link to clipboard
    copyText(shortUrl);

    // Pop up instant result modal with QR code
    showGeneratedResultModal(res.data, shortUrl);

    // Refresh active list
    if (STATE.activeTab === "dwz") loadDwzList();
    if (STATE.activeTab === "overview") loadOverview();
  } else {
    showToast(res?.msg || "生成短网址失败", "error");
  }
}

function showGeneratedResultModal(item, shortUrl) {
  document.getElementById("resultModalShortUrl").textContent = shortUrl;
  document.getElementById("resultModalOriginalUrl").textContent = item.url;
  document.getElementById("resultModalKey").textContent = item.key;

  const qrContainer = document.getElementById("resultModalCanvas");
  qrContainer.innerHTML = "";
  if (typeof QRCode !== "undefined") {
    new QRCode(qrContainer, {
      text: shortUrl,
      width: 180,
      height: 180,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });
  }

  document.getElementById("generatedResultModal").classList.add("show");
}

// -------------------------------------------------------------
// 短网址 (dwz) Management
// -------------------------------------------------------------
const DWZ_TYPE_MAP = {
  1: { text: "通用跳转", class: "badge-primary" },
  2: { text: "微信内专跳", class: "badge-success" },
  3: { text: "仅限 iOS", class: "badge-secondary" },
  4: { text: "仅限 Android", class: "badge-secondary" },
  5: { text: "仅手机浏览器", class: "badge-warning" },
  6: { text: "按设备分流", class: "badge-primary" },
};

async function loadDwzList() {
  const res = await apiRequest("/api/dwz/list");
  if (res && res.data) {
    STATE.dwzList = res.data;
    renderDwzTable(STATE.dwzList);
  }
}

function renderDwzTable(list) {
  const tbody = document.getElementById("dwzTableBody");
  const mobileContainer = document.getElementById("dwzMobileCardsContainer");
  tbody.innerHTML = "";
  if (mobileContainer) mobileContainer.innerHTML = "";

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">🔗</div><p>暂无短网址，直接在上方输入框粘贴长链接即可生成</p></td></tr>`;
    if (mobileContainer) {
      mobileContainer.innerHTML = `<div class="empty-state" style="padding: 24px; background: #fff; border-radius: 12px; border: 1px solid var(--border-color);"><p>暂无短网址，直接在上方输入框粘贴长链接即可生成</p></div>`;
    }
    return;
  }

  const origin = window.location.origin;

  list.forEach((item) => {
    // Root-level short URL (e.g. https://d.pyz.me/37v)
    const fullShortUrl = `${origin}/${item.key}`;
    const typeInfo = DWZ_TYPE_MAP[item.type] || { text: "通用跳转", class: "badge-primary" };

    // 1. Desktop Table Row
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="min-width: 170px;">
        <strong>${item.title || "短网址"}</strong>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${item.created_at || ""}</div>
      </td>
      <td style="min-width: 160px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <code style="background: #f1f5f9; padding: 4px 7px; border-radius: 6px; font-weight: 700; font-size: 13px;">${item.key}</code>
          <button class="btn btn-secondary btn-sm" onclick="copyText('${fullShortUrl}')" title="复制短链接">📋 复制</button>
        </div>
      </td>
      <td style="max-width: 260px;">
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <a href="${item.url}" target="_blank" style="color: var(--primary); text-decoration: none;" title="${item.url}">${item.url}</a>
        </div>
      </td>
      <td style="min-width: 110px;"><span class="badge ${typeInfo.class}">${typeInfo.text}</span></td>
      <td style="min-width: 100px;">
        <div><strong>${item.pv || 0}</strong> <small style="color: var(--text-muted);">次</small></div>
        <div style="font-size: 11px; color: var(--text-light);">今日: ${item.today_pv_count || 0}</div>
      </td>
      <td style="min-width: 70px;">
        <label class="switch">
          <input type="checkbox" ${item.status === 1 ? "checked" : ""} onchange="toggleDwzStatus('${item.key}')">
          <span class="slider"></span>
        </label>
      </td>
      <td style="min-width: 180px; white-space: nowrap;">
        <div style="display: flex; gap: 5px;">
          <button class="btn btn-secondary btn-sm" onclick="showQrModal('${fullShortUrl}', '${item.title}')" title="查看二维码">📱 码</button>
          <button class="btn btn-secondary btn-sm" onclick="openEditDwzModal('${item.key}')" title="编辑短网址">✏️</button>
          <button class="btn btn-secondary btn-sm" onclick="resetDwzPv('${item.key}')" title="清零访问量">🔄</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDwz('${item.key}')" title="删除短网址">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    // 2. Mobile Card (Clean vertical layout, no horizontal scroll needed)
    if (mobileContainer) {
      const card = document.createElement("div");
      card.className = "mobile-data-card";
      card.innerHTML = `
        <div class="mobile-card-header">
          <div>
            <div class="mobile-card-title">${item.title || "短网址"}</div>
            <div class="mobile-card-date">${item.created_at || ""}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge ${typeInfo.class}">${typeInfo.text}</span>
            <label class="switch" style="transform: scale(0.85);">
              <input type="checkbox" ${item.status === 1 ? "checked" : ""} onchange="toggleDwzStatus('${item.key}')">
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="mobile-short-url-box">
          <a href="${fullShortUrl}" target="_blank" class="mobile-short-url-link">${fullShortUrl}</a>
          <button class="btn btn-secondary btn-sm" onclick="copyText('${fullShortUrl}')" style="padding: 4px 10px; font-size: 12px;">📋 复制</button>
        </div>

        <div class="mobile-target-url-text" title="${item.url}">
          目标: <a href="${item.url}" target="_blank" style="color: var(--primary); text-decoration: underline;">${item.url}</a>
        </div>

        <div class="mobile-card-stats">
          <span>总访问: <strong style="color: var(--text-main);">${item.pv || 0}</strong> 次</span>
          <span>今日: <strong style="color: var(--primary);">${item.today_pv_count || 0}</strong> 次</span>
          <span>${item.status === 1 ? '<span style="color: var(--success); font-weight: 600;">● 启用中</span>' : '<span style="color: var(--danger); font-weight: 600;">● 已暂停</span>'}</span>
        </div>

        <div class="mobile-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="showQrModal('${fullShortUrl}', '${item.title}')">📱 码</button>
          <button class="btn btn-secondary btn-sm" onclick="openEditDwzModal('${item.key}')">✏️ 改</button>
          <button class="btn btn-secondary btn-sm" onclick="resetDwzPv('${item.key}')">🔄 清</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDwz('${item.key}')">🗑️ 删</button>
        </div>
      `;
      mobileContainer.appendChild(card);
    }
  });
}

function filterDwz() {
  const q = document.getElementById("dwzSearchInput").value.trim().toLowerCase();
  if (!q) {
    renderDwzTable(STATE.dwzList);
    return;
  }
  const filtered = STATE.dwzList.filter(
    (item) =>
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.key && item.key.toLowerCase().includes(q)) ||
      (item.url && item.url.toLowerCase().includes(q))
  );
  renderDwzTable(filtered);
}

function openCreateDwzModal() {
  document.getElementById("dwzModalTitle").textContent = "新建短网址 (高级设置)";
  document.getElementById("dwzFormKey").value = "";
  document.getElementById("dwzFormKeyInput").value = "";
  document.getElementById("dwzFormKeyInput").disabled = false;
  document.getElementById("dwzFormTitle").value = "";
  document.getElementById("dwzFormUrl").value = "";
  document.getElementById("dwzFormType").value = "1";
  document.getElementById("dwzFormAndroid").value = "";
  document.getElementById("dwzFormIos").value = "";
  document.getElementById("dwzFormWindows").value = "";
  handleDwzTypeChange();
  document.getElementById("dwzModal").classList.add("show");
}

function openEditDwzModal(key) {
  const item = STATE.dwzList.find((d) => d.key === key);
  if (!item) return;

  document.getElementById("dwzModalTitle").textContent = "编辑短网址";
  document.getElementById("dwzFormKey").value = item.key;
  document.getElementById("dwzFormKeyInput").value = item.key;
  document.getElementById("dwzFormKeyInput").disabled = true;
  document.getElementById("dwzFormTitle").value = item.title || "";
  document.getElementById("dwzFormUrl").value = item.url || "";
  document.getElementById("dwzFormType").value = String(item.type || 1);
  document.getElementById("dwzFormAndroid").value = item.android_url || "";
  document.getElementById("dwzFormIos").value = item.ios_url || "";
  document.getElementById("dwzFormWindows").value = item.windows_url || "";
  handleDwzTypeChange();
  document.getElementById("dwzModal").classList.add("show");
}

function handleDwzTypeChange() {
  const type = document.getElementById("dwzFormType").value;
  const splitBox = document.getElementById("deviceSplitFields");
  splitBox.style.display = type === "6" ? "block" : "none";
}

async function handleDwzSubmit(e) {
  e.preventDefault();
  const editingKey = document.getElementById("dwzFormKey").value;
  const keyInput = document.getElementById("dwzFormKeyInput").value.trim();
  const title = document.getElementById("dwzFormTitle").value.trim();
  const url = document.getElementById("dwzFormUrl").value.trim();
  const type = Number(document.getElementById("dwzFormType").value);
  const android_url = document.getElementById("dwzFormAndroid").value.trim();
  const ios_url = document.getElementById("dwzFormIos").value.trim();
  const windows_url = document.getElementById("dwzFormWindows").value.trim();

  if (!url) {
    showToast("请输入目标链接", "error");
    return;
  }

  if (editingKey) {
    const res = await apiRequest("/api/dwz/update", "POST", {
      key: editingKey,
      title,
      url,
      type,
      android_url,
      ios_url,
      windows_url,
    });
    if (res && res.code === 200) {
      showToast("修改短网址成功");
      closeModal("dwzModal");
      loadDwzList();
    } else {
      showToast(res?.msg || "修改失败", "error");
    }
  } else {
    const res = await apiRequest("/api/dwz/create", "POST", {
      key: keyInput,
      title,
      url,
      type,
      android_url,
      ios_url,
      windows_url,
    });
    if (res && res.code === 200) {
      showToast("创建短网址成功");
      closeModal("dwzModal");
      loadDwzList();
    } else {
      showToast(res?.msg || "创建失败", "error");
    }
  }
}

async function toggleDwzStatus(key) {
  const res = await apiRequest("/api/dwz/toggle", "POST", { key });
  if (res && res.code === 200) {
    showToast(res.msg);
    loadDwzList();
  }
}

async function resetDwzPv(key) {
  if (!confirm("确定要将此短网址的访问量清零吗？")) return;
  const res = await apiRequest("/api/dwz/reset-pv", "POST", { key });
  if (res && res.code === 200) {
    showToast("访问量已清零");
    loadDwzList();
  }
}

async function deleteDwz(key) {
  if (!confirm(`确定要删除短网址 [${key}] 吗？删除后不可恢复！`)) return;
  const res = await apiRequest("/api/dwz/delete", "POST", { key });
  if (res && res.code === 200) {
    showToast("删除成功");
    loadDwzList();
  }
}

// -------------------------------------------------------------
// 👥 群活码 (qun) Completely Rewritten Architecture
// -------------------------------------------------------------
async function loadQunList() {
  const res = await apiRequest("/api/qun/list");
  if (res && res.data) {
    STATE.qunList = res.data;
    renderQunTable(STATE.qunList);
  }
}

function renderQunTable(list) {
  const tbody = document.getElementById("qunTableBody");
  const mobileContainer = document.getElementById("qunMobileCardsContainer");
  tbody.innerHTML = "";
  if (mobileContainer) mobileContainer.innerHTML = "";

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">👥</div><p>暂无群活码，点击右上角【+ 新建群活码】一步完成配置</p></td></tr>`;
    if (mobileContainer) {
      mobileContainer.innerHTML = `<div class="empty-state" style="padding: 24px; background: #fff; border-radius: 12px; border: 1px solid var(--border-color);"><p>暂无群活码，点击右上角【+ 新建群活码】一步完成配置</p></div>`;
    }
    return;
  }

  const origin = window.location.origin;

  list.forEach((item) => {
    const fullQunUrl = `${origin}/qun/${item.id}`;
    const zimaCount = item.total_zima || 0;
    const activeCount = item.active_zima_count || 0;
    const currentNum = item.current_zima_num || 0;

    let subcodeStatusHtml = "";
    if (zimaCount === 0) {
      subcodeStatusHtml = `<span class="badge badge-danger">未上传群二维码</span>`;
    } else if (currentNum > 0) {
      subcodeStatusHtml = `
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="badge badge-success">第 ${currentNum}/${zimaCount} 群进客中</span>
        </div>
      `;
    } else {
      subcodeStatusHtml = `<span class="badge badge-warning">所有群码已满员</span>`;
    }

    // 1. Desktop Table Row
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="min-width: 170px;">
        <strong>${item.title || "微信群活码"}</strong>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">ID: ${item.id} &bull; ${item.created_at || ""}</div>
      </td>
      <td style="min-width: 170px;">
        <div style="margin-bottom: 5px;">${subcodeStatusHtml}</div>
        <button class="btn btn-secondary btn-sm" onclick="openZimaDrawer('${item.id}')" style="font-size: 11px; padding: 3px 8px;">
          ⚙️ 管理 ${zimaCount} 个子码 & 进群阈值
        </button>
      </td>
      <td style="min-width: 130px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${item.safety === 1 ? '<span class="badge badge-success" style="font-size: 11px;">🛡️ 微信安全绿标</span>' : '<span class="badge badge-secondary" style="font-size: 11px;">常规模式</span>'}
          ${item.qc === 1 ? '<span class="badge badge-primary" style="font-size: 11px;">🔄 7天去重防重复</span>' : '<span class="badge badge-secondary" style="font-size: 11px;">无去重</span>'}
          ${item.kf_status === 1 ? '<span class="badge badge-warning" style="font-size: 11px;">👤 群满客服兜底</span>' : ''}
        </div>
      </td>
      <td style="min-width: 100px;">
        <div><strong>${item.pv || 0}</strong> <small style="color: var(--text-muted);">次</small></div>
        <div style="font-size: 11px; color: var(--text-light);">今日: ${item.today_pv_count || 0}</div>
      </td>
      <td style="min-width: 70px;">
        <label class="switch">
          <input type="checkbox" ${item.status === 1 ? "checked" : ""} onchange="toggleQunStatus('${item.id}')">
          <span class="slider"></span>
        </label>
      </td>
      <td style="min-width: 220px; white-space: nowrap;">
        <div style="display: flex; gap: 5px;">
          <button class="btn btn-primary btn-sm" onclick="copyText('${fullQunUrl}')" title="复制活码永久链接">📋 复制</button>
          <button class="btn btn-secondary btn-sm" onclick="showQrModal('${fullQunUrl}', '${item.title}')" title="查看活码二维码">📱 码</button>
          <button class="btn btn-secondary btn-sm" onclick="openPhoneSimulator('${fullQunUrl}')" title="真机模拟器预览真实微信效果">📱 模拟器</button>
          <button class="btn btn-secondary btn-sm" onclick="openEditQunModal('${item.id}')" title="编辑活码设置">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQun('${item.id}')" title="删除活码">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);

    // 2. Mobile Card (Clean vertical layout, no horizontal scroll needed)
    if (mobileContainer) {
      const card = document.createElement("div");
      card.className = "mobile-data-card";
      card.innerHTML = `
        <div class="mobile-card-header">
          <div>
            <div class="mobile-card-title">${item.title || "微信群活码"}</div>
            <div class="mobile-card-date">ID: ${item.id} &bull; ${item.created_at || ""}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <label class="switch" style="transform: scale(0.85);">
              <input type="checkbox" ${item.status === 1 ? "checked" : ""} onchange="toggleQunStatus('${item.id}')">
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="mobile-short-url-box">
          <a href="${fullQunUrl}" target="_blank" class="mobile-short-url-link">${fullQunUrl}</a>
          <button class="btn btn-primary btn-sm" onclick="copyText('${fullQunUrl}')" style="padding: 4px 10px; font-size: 12px;">📋 复制</button>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${subcodeStatusHtml}
          ${item.safety === 1 ? '<span class="badge badge-success" style="font-size: 11px;">🛡️ 微信安全绿标</span>' : ''}
          ${item.qc === 1 ? '<span class="badge badge-primary" style="font-size: 11px;">🔄 7天去重</span>' : ''}
        </div>

        <div class="mobile-card-stats">
          <span>累计进客: <strong style="color: var(--text-main);">${item.pv || 0}</strong> 人</span>
          <span>今日: <strong style="color: var(--primary);">${item.today_pv_count || 0}</strong> 人</span>
          <button class="btn btn-secondary btn-sm" onclick="openZimaDrawer('${item.id}')" style="padding: 3px 8px; font-size: 11px;">
            ⚙️ 管理 ${zimaCount} 个子码
          </button>
        </div>

        <div class="mobile-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="showQrModal('${fullQunUrl}', '${item.title}')">📱 码</button>
          <button class="btn btn-secondary btn-sm" onclick="openPhoneSimulator('${fullQunUrl}')">📱 模拟器</button>
          <button class="btn btn-secondary btn-sm" onclick="openEditQunModal('${item.id}')">✏️ 改</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQun('${item.id}')">🗑️ 删</button>
        </div>
      `;
      mobileContainer.appendChild(card);
    }
  });
}

function filterQun() {
  const q = document.getElementById("qunSearchInput").value.trim().toLowerCase();
  if (!q) {
    renderQunTable(STATE.qunList);
    return;
  }
  const filtered = STATE.qunList.filter(
    (item) => item.title && item.title.toLowerCase().includes(q)
  );
  renderQunTable(filtered);
}

// Open Unified Create Modal
function openCreateQunModal() {
  STATE.newQunSubcodes = [];
  const wrapper = document.getElementById("newQunSubcodesWrapper");
  if (wrapper) wrapper.style.display = "block";

  document.getElementById("qunModalTitle").textContent = "新建微信群活码 (一站式配置)";
  document.getElementById("qunFormId").value = "";
  document.getElementById("qunFormTitle").value = "";
  document.getElementById("qunFormBeizhu").value = "";
  document.getElementById("qunFormQc").checked = true;
  document.getElementById("qunFormSafety").checked = true;
  document.getElementById("qunFormKfStatus").checked = false;
  document.getElementById("qunFormKfQrcode").value = "";
  renderNewQunSubcodeList();
  document.getElementById("qunModal").classList.add("show");
}

function renderNewQunSubcodeList() {
  const container = document.getElementById("newQunSubcodesContainer");
  if (!container) return;
  container.innerHTML = "";

  if (STATE.newQunSubcodes.length === 0) {
    container.innerHTML = `
      <label for="groupBatchFileInput" class="subcode-dropzone">
        <div style="font-size: 32px; color: var(--primary);">📷</div>
        <strong style="font-size: 14px; color: var(--text-main);">点击此处上传微信群二维码</strong>
        <span style="font-size: 12px; color: var(--text-muted);">支持批量多选图片，系统将自动依次排入轮换顺位</span>
        <span class="btn btn-primary btn-sm" style="margin-top: 6px; pointer-events: none;">+ 选择群二维码图片</span>
      </label>
    `;
    return;
  }

  STATE.newQunSubcodes.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "subcode-card-item";
    card.innerHTML = `
      <div class="subcode-thumb-box">
        <img src="${item.qrcode}" class="subcode-thumb-img">
        <span class="subcode-order-badge">#${index + 1}</span>
      </div>
      <div class="subcode-content-box">
        <div class="subcode-card-header">
          <strong style="font-size: 13px;">第 ${index + 1} 顺位群码</strong>
          <span class="badge badge-success" style="font-size: 11px;">生效中</span>
        </div>
        <div class="subcode-fields-grid">
          <div>
            <label class="subcode-field-label">进群上限阈值 (满额自动切码)</label>
            <input type="number" class="subcode-input" value="${item.max_num}" min="1" max="500" placeholder="默认200人" onchange="updateNewSubcodeThreshold(${index}, this.value)">
          </div>
          <div>
            <label class="subcode-field-label">群主微信号 (失效备用)</label>
            <input type="text" class="subcode-input" value="${item.leader || ''}" placeholder="选填，如 wxid_xxx" onchange="updateNewSubcodeLeader(${index}, this.value)">
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-danger btn-sm" style="align-self: center;" onclick="removeNewSubcode(${index})" title="移除此群码">🗑️ 移除</button>
    `;
    container.appendChild(card);
  });
}

function updateNewSubcodeThreshold(index, val) {
  if (STATE.newQunSubcodes[index]) {
    STATE.newQunSubcodes[index].max_num = Number(val) || 200;
  }
}

function updateNewSubcodeLeader(index, val) {
  if (STATE.newQunSubcodes[index]) {
    STATE.newQunSubcodes[index].leader = val.trim();
  }
}

function removeNewSubcode(index) {
  STATE.newQunSubcodes.splice(index, 1);
  renderNewQunSubcodeList();
}

async function handleBatchAddGroupImages(e) {
  const files = e.target ? e.target.files : e;
  if (!files || files.length === 0) return;

  const total = files.length;
  const progressBox = document.getElementById("qunModalUploadProgress");
  const progressTitle = document.getElementById("qunModalProgressTitle");
  const progressPercent = document.getElementById("qunModalProgressPercent");
  const progressBar = document.getElementById("qunModalProgressBar");

  if (progressBox) progressBox.style.display = "block";

  let successCount = 0;
  for (let i = 0; i < total; i++) {
    const file = files[i];
    if (progressTitle) progressTitle.textContent = `正在上传第 ${i + 1}/${total} 张群二维码 (${(file.size / 1024).toFixed(1)} KB)...`;

    try {
      const url = await uploadFileToBlobWithProgress(file, (pct) => {
        const overall = Math.round(((i + pct / 100) / total) * 100);
        if (progressPercent) progressPercent.textContent = `${overall}%`;
        if (progressBar) progressBar.style.width = `${overall}%`;
      });

      if (url) {
        STATE.newQunSubcodes.push({
          qrcode: url,
          max_num: 200,
          leader: "",
        });
        successCount++;
        renderNewQunSubcodeList();
      }
    } catch (err) {
      showToast(`图片 ${file.name} 上传失败: ${err.message}`, "error");
    }
  }

  if (progressTitle) progressTitle.textContent = `🎉 上传完成！成功加入 ${successCount} 张群二维码`;
  if (progressPercent) progressPercent.textContent = "100%";
  if (progressBar) progressBar.style.width = "100%";

  if (e.target && e.target.value) e.target.value = "";
  renderNewQunSubcodeList();

  setTimeout(() => {
    if (progressBox) progressBox.style.display = "none";
  }, 1000);
}

async function handleKfUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const progressBox = document.getElementById("qunKfUploadProgress");
  const progressTitle = document.getElementById("qunKfProgressTitle");
  const progressPercent = document.getElementById("qunKfProgressPercent");
  const progressBar = document.getElementById("qunKfProgressBar");

  if (progressBox) progressBox.style.display = "block";
  if (progressTitle) progressTitle.textContent = `正在上传客服二维码 (${(file.size / 1024).toFixed(1)} KB)...`;

  try {
    const url = await uploadFileToBlobWithProgress(file, (pct) => {
      if (progressPercent) progressPercent.textContent = `${pct}%`;
      if (progressBar) progressBar.style.width = `${pct}%`;
    });

    if (url) {
      document.getElementById("qunFormKfQrcode").value = url;
      if (progressTitle) progressTitle.textContent = "✅ 客服二维码上传成功！";
      showToast("客服二维码已上传并填入");
    }
  } catch (err) {
    showToast(`上传客服二维码失败: ${err.message}`, "error");
  } finally {
    e.target.value = "";
    setTimeout(() => {
      if (progressBox) progressBox.style.display = "none";
    }, 1000);
  }
}

async function handleQunSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("qunFormId").value;
  const title = document.getElementById("qunFormTitle").value.trim();
  const qc = document.getElementById("qunFormQc").checked ? 1 : 0;
  const safety = document.getElementById("qunFormSafety").checked ? 1 : 0;
  const kf_status = document.getElementById("qunFormKfStatus").checked ? 1 : 0;
  const kf_qrcode = document.getElementById("qunFormKfQrcode").value.trim();
  const beizhu = document.getElementById("qunFormBeizhu").value.trim();

  if (!title) {
    showToast("请输入群活码标题", "error");
    return;
  }

  if (id) {
    // Update existing
    const res = await apiRequest("/api/qun/update", "POST", {
      id,
      title,
      beizhu,
      qc,
      safety,
      kf_status,
      kf_qrcode,
    });
    if (res && res.code === 200) {
      showToast("更新群活码配置成功");
      closeModal("qunModal");
      loadQunList();
    } else {
      showToast(res?.msg || "更新失败", "error");
    }
  } else {
    // Create new with subcodes
    showToast("正在创建群活码...", "info");
    const res = await apiRequest("/api/qun/create", "POST", {
      title,
      beizhu,
      qc,
      safety,
      kf_status,
      kf_qrcode,
      zima: STATE.newQunSubcodes,
    });

    if (res && res.code === 200) {
      showToast("🎉 群活码创建成功！");
      closeModal("qunModal");
      loadQunList();
      // Show QR popup for newly created group code
      if (res.data && res.data.qunUrl) {
        showQrModal(res.data.qunUrl, res.data.title);
      }
    } else {
      showToast(res?.msg || "创建失败", "error");
    }
  }
}

function openEditQunModal(id) {
  const item = STATE.qunList.find((q) => String(q.id) === String(id));
  if (!item) return;

  document.getElementById("qunModalTitle").textContent = "编辑群活码设置";
  document.getElementById("qunFormId").value = item.id;
  document.getElementById("qunFormTitle").value = item.title || "";
  document.getElementById("qunFormQc").checked = item.qc === 1;
  document.getElementById("qunFormSafety").checked = item.safety === 1;
  document.getElementById("qunFormKfStatus").checked = item.kf_status === 1;
  document.getElementById("qunFormKfQrcode").value = item.kf_qrcode || "";
  document.getElementById("qunFormBeizhu").value = item.beizhu || "";

  // Hide subcodes creation block during basic edit (manage in drawer)
  const subcodesBlock = document.getElementById("newQunSubcodesWrapper");
  if (subcodesBlock) subcodesBlock.style.display = "none";

  document.getElementById("qunModal").classList.add("show");
}

async function toggleQunStatus(id) {
  const res = await apiRequest("/api/qun/toggle", "POST", { id });
  if (res && res.code === 200) {
    showToast(res.msg);
    loadQunList();
  }
}

async function deleteQun(id) {
  if (!confirm("确定要删除该群活码吗？删除后所有进群子码将同步移除！")) return;
  const res = await apiRequest("/api/qun/delete", "POST", { id });
  if (res && res.code === 200) {
    showToast("群活码已删除");
    loadQunList();
  }
}

// -------------------------------------------------------------
// 子码抽屉/详情 (Subcodes Drawer)
// -------------------------------------------------------------
async function openZimaDrawer(qunId) {
  STATE.currentQunId = qunId;
  const res = await apiRequest(`/api/qun/get?id=${qunId}`);
  if (!res || !res.data) {
    showToast("获取群活码详情失败", "error");
    return;
  }

  const qun = res.data;
  document.getElementById("zimaModalTitle").textContent = `子码管理 - ${qun.title}`;
  renderExistingZimaList(qun.zima || []);
  document.getElementById("zimaModal").classList.add("show");
}

function renderExistingZimaList(zimaList) {
  const container = document.getElementById("zimaListContainer");
  container.innerHTML = "";

  if (!zimaList || zimaList.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 24px;"><p>暂无群二维码，请在下方点击上传新微信群二维码</p></div>`;
    return;
  }

  zimaList.forEach((zm, index) => {
    const max = Number(zm.max_num) || 200;
    const pv = Number(zm.pv) || 0;
    const percent = Math.min(100, Math.round((pv / max) * 100));
    const isFull = pv >= max;

    const card = document.createElement("div");
    card.className = "zima-subcode-card";
    card.innerHTML = `
      <div class="zima-card-top-row">
        <div style="display: flex; align-items: center; gap: 8px;">
          <strong style="font-size: 14px;">第 ${index + 1} 顺位群码</strong>
          ${isFull ? '<span class="badge badge-danger">已满员</span>' : '<span class="badge badge-success">进客中</span>'}
          ${zm.status !== 1 ? '<span class="badge badge-secondary">已暂停</span>' : ""}
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">
          群主微信: <strong style="color: var(--text-main);">${zm.leader || "未设置"}</strong>
        </div>
      </div>

      <div class="zima-card-main-content">
        <div class="zima-card-qr-thumb">
          <img src="${zm.qrcode}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
            <span>进群进度 (${pv}/${max} 人)</span>
            <span style="font-weight: 700; color: ${isFull ? 'var(--danger)' : 'var(--primary)'};">${percent}%</span>
          </div>
          <div style="width: 100%; background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
            <div style="width: ${percent}%; height: 100%; background: ${isFull ? "var(--danger)" : "var(--primary)"}; border-radius: 4px;"></div>
          </div>
          <div style="font-size: 11px; color: var(--text-muted);">
            达到阈值 (${max}人) 后系统自动切入下一个群二维码
          </div>
        </div>
      </div>

      <div class="zima-card-actions-grid">
        <button type="button" class="btn btn-secondary btn-sm" onclick="toggleZimaStatus('${zm.id}')">
          ${zm.status === 1 ? "⏸️ 暂停此码" : "▶️ 启用此码"}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="resetZimaPv('${zm.id}')" title="清零该码访问量">
          🔄 清零进客
        </button>
        <button type="button" class="btn btn-danger btn-sm" onclick="deleteZima('${zm.id}')">
          🗑️ 删除此码
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

async function handleAddZimaInDrawer(e) {
  e.preventDefault();
  const qun_id = STATE.currentQunId;
  if (!qun_id) return;

  const fileInput = document.getElementById("drawerZimaFileInput");
  const max_num = document.getElementById("drawerZimaMaxNum").value || 200;
  const leader = document.getElementById("drawerZimaLeader").value.trim();
  const submitBtn = document.getElementById("zimaDrawerSubmitBtn");

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast("请先选择群二维码图片文件", "error");
    return;
  }

  const file = fileInput.files[0];
  const progressBox = document.getElementById("zimaDrawerUploadProgress");
  const progressTitle = document.getElementById("zimaDrawerProgressTitle");
  const progressPercent = document.getElementById("zimaDrawerProgressPercent");
  const progressBar = document.getElementById("zimaDrawerProgressBar");

  if (progressBox) progressBox.style.display = "block";
  if (progressTitle) progressTitle.textContent = `正在上传 (${(file.size / 1024).toFixed(1)} KB)...`;
  if (submitBtn) submitBtn.disabled = true;

  try {
    const qrcodeUrl = await uploadFileToBlobWithProgress(file, (pct) => {
      if (progressPercent) progressPercent.textContent = `${pct}%`;
      if (progressBar) progressBar.style.width = `${pct}%`;
    });

    if (!qrcodeUrl) return;

    if (progressTitle) progressTitle.textContent = "正在写入轮换池...";
    const res = await apiRequest("/api/qun/zima/add", "POST", {
      qun_id,
      qrcode: qrcodeUrl,
      max_num,
      leader,
    });

    if (res && res.code === 200) {
      if (progressTitle) progressTitle.textContent = "✅ 上传并加入轮换池成功！";
      showToast("群子码添加成功");
      fileInput.value = "";
      document.getElementById("drawerZimaLeader").value = "";
      setTimeout(() => {
        if (progressBox) progressBox.style.display = "none";
        openZimaDrawer(qun_id);
        loadQunList();
      }, 600);
    } else {
      showToast(res?.msg || "添加失败", "error");
    }
  } catch (err) {
    showToast(`上传失败: ${err.message}`, "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function toggleZimaStatus(zm_id) {
  const qun_id = STATE.currentQunId;
  const res = await apiRequest("/api/qun/zima/toggle", "POST", { qun_id, zm_id });
  if (res && res.code === 200) {
    showToast(res.msg);
    openZimaDrawer(qun_id);
    loadQunList();
  }
}

async function resetZimaPv(zm_id) {
  if (!confirm("确定要将此子码的进群量清零吗？")) return;
  const qun_id = STATE.currentQunId;
  const res = await apiRequest("/api/qun/zima/reset-pv", "POST", { qun_id, zm_id });
  if (res && res.code === 200) {
    showToast("已清零进群计数");
    openZimaDrawer(qun_id);
    loadQunList();
  }
}

async function deleteZima(zm_id) {
  if (!confirm("确定要删除此子码吗？")) return;
  const qun_id = STATE.currentQunId;
  const res = await apiRequest("/api/qun/zima/delete", "POST", { qun_id, zm_id });
  if (res && res.code === 200) {
    showToast("子码已删除");
    openZimaDrawer(qun_id);
    loadQunList();
  }
}

// -------------------------------------------------------------
// EdgeOne Blob 素材库 (Discovers all buckets and files)
// -------------------------------------------------------------
function uploadFileToBlobWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && typeof onProgress === "function") {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct, e.loaded, e.total);
      }
    });

    xhr.addEventListener("load", () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.code === 200) {
          resolve(res.data.url);
        } else {
          reject(new Error(res.msg || "文件上传失败"));
        }
      } catch (err) {
        reject(new Error("解析响应失败"));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("网络传输异常")));
    xhr.addEventListener("abort", () => reject(new Error("上传已被取消")));

    const token = localStorage.getItem("dwz_token");
    xhr.open("POST", "/api/upload");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

async function uploadFileToBlob(file) {
  try {
    return await uploadFileToBlobWithProgress(file);
  } catch (e) {
    showToast(e.message || "上传失败", "error");
    return null;
  }
}

async function loadBlobList() {
  const res = await apiRequest("/api/blob/list");
  if (res && res.data) {
    STATE.blobList = res.data;
    renderBlobGallery(STATE.blobList);
  }
}

function renderBlobGallery(list) {
  const container = document.getElementById("blobGalleryContainer");
  container.innerHTML = "";

  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <div class="empty-icon">🖼️</div>
        <p>暂无素材图片。可将图片直接拖入上方虚线框或点击上传</p>
      </div>
    `;
    return;
  }

  list.forEach((item) => {
    const origin = window.location.origin;
    const fullUrl = item.url.startsWith("http") ? item.url : `${origin}${item.url}`;
    const card = document.createElement("div");
    card.style.cssText = `
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      overflow: hidden;
      box-shadow: var(--shadow-sm);
      display: flex;
      flex-direction: column;
    `;

    card.innerHTML = `
      <div style="height: 160px; background: #f8fafc; display: flex; align-items: center; justify-content: center; overflow: hidden; border-bottom: 1px solid #f1f5f9;">
        <img src="${fullUrl}" style="max-height: 100%; max-width: 100%; object-fit: contain;" onerror="this.src='/static/img/noData.png'">
      </div>
      <div style="padding: 12px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="font-size: 11px; color: var(--text-muted); word-break: break-all; margin-bottom: 8px;">
          ${item.key}
          <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">存储桶: ${item.storeName || 'dwz-blob'}</div>
        </div>
        <div style="display: flex; gap: 6px; justify-content: flex-end;">
          <button class="btn btn-secondary btn-sm" onclick="copyText('${fullUrl}')">复制链接</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBlobItem('${item.key}')">删除</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function handleBlobUpload(e) {
  const files = e.target ? e.target.files : e;
  if (!files || files.length === 0) return;

  const total = files.length;
  const progressCard = document.getElementById("uploadProgressCard");
  const progressTitle = document.getElementById("uploadProgressTitle");
  const progressPercent = document.getElementById("uploadProgressPercent");
  const progressBar = document.getElementById("uploadProgressBar");
  const progressFileName = document.getElementById("uploadProgressFileName");
  const progressSpeed = document.getElementById("uploadProgressSpeed");

  if (progressCard) progressCard.style.display = "block";

  let successCount = 0;
  for (let i = 0; i < total; i++) {
    const file = files[i];
    if (progressTitle) progressTitle.textContent = `正在上传第 ${i + 1}/${total} 个素材...`;
    if (progressFileName) progressFileName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    if (progressSpeed) progressSpeed.textContent = "正在传输数据并写入云端存储...";

    try {
      await uploadFileToBlobWithProgress(file, (pct) => {
        const overall = Math.round(((i + pct / 100) / total) * 100);
        if (progressPercent) progressPercent.textContent = `${overall}%`;
        if (progressBar) progressBar.style.width = `${overall}%`;
      });
      successCount++;
    } catch (err) {
      showToast(`文件 [${file.name}] 上传失败: ${err.message}`, "error");
    }
  }

  if (progressTitle) progressTitle.textContent = `🎉 上传完成！成功上传 ${successCount}/${total} 个素材`;
  if (progressPercent) progressPercent.textContent = "100%";
  if (progressBar) progressBar.style.width = "100%";
  if (progressSpeed) progressSpeed.textContent = "已写入云存储";

  showToast(`已成功上传 ${successCount} 个文件至素材库`);
  if (e.target && e.target.value) e.target.value = "";

  setTimeout(() => {
    if (progressCard) progressCard.style.display = "none";
    loadBlobList();
  }, 1200);
}

function initBlobDropzone() {
  const dropzone = document.getElementById("blobDropzone");
  if (!dropzone) return;

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      handleBlobUpload(files);
    }
  });
}

async function deleteBlobItem(key) {
  if (!confirm(`确定要从存储中删除文件 [${key}] 吗？`)) return;
  const res = await apiRequest("/api/blob/delete", "POST", { key });
  if (res && res.code === 200) {
    showToast("素材删除成功");
    loadBlobList();
  }
}

// -------------------------------------------------------------
// ⚡ 开放 API 文档与管理 (Open API)
// -------------------------------------------------------------
async function loadApiDocs() {
  const res = await apiRequest("/api/system/api-key");
  if (res && res.data) {
    STATE.apiKey = res.data.apiKey;
    const keyEl = document.getElementById("apiKeyDisplay");
    if (keyEl) keyEl.textContent = STATE.apiKey;

    // Update code examples
    const origin = window.location.origin;
    const curlEl = document.getElementById("apiCurlExample");
    if (curlEl) {
      curlEl.textContent = `curl -X POST "${origin}/api/dwz/create" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${STATE.apiKey}" \\
  -d '{"url": "https://example.com/item/12345"}'`;
    }

    const curlGetEl = document.getElementById("apiCurlGetExample");
    if (curlGetEl) {
      curlGetEl.textContent = `curl "${origin}/api/dwz/create?api_key=${STATE.apiKey}&url=https://example.com/item/12345&format=text"`;
    }

    const pyEl = document.getElementById("apiPythonExample");
    if (pyEl) {
      pyEl.textContent = `import requests

res = requests.post(
    "${origin}/api/dwz/create",
    headers={"X-API-Key": "${STATE.apiKey}"},
    json={"url": "https://example.com/item/12345"}
)
print(res.json()["data"]["shortUrl"])`;
    }

    const jsEl = document.getElementById("apiJsExample");
    if (jsEl) {
      jsEl.textContent = `const res = await fetch("${origin}/api/dwz/create", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "${STATE.apiKey}",
  },
  body: JSON.stringify({ url: "https://example.com/item/12345" }),
});
const data = await res.json();
console.log("短网址:", data.data.shortUrl);`;
    }
  }
}

async function regenerateApiKey() {
  if (!confirm("确定要重置 API Key 吗？旧的 API Key 将立即失效！")) return;
  const res = await apiRequest("/api/system/api-key/regenerate", "POST");
  if (res && res.code === 200) {
    showToast("API Key 已成功重置！");
    loadApiDocs();
  }
}

// -------------------------------------------------------------
// 系统设置 (Settings)
// -------------------------------------------------------------
async function handleChangePassword(e) {
  e.preventDefault();
  const oldPassword = document.getElementById("oldPasswordInput").value;
  const newPassword = document.getElementById("newPasswordInput").value;
  const confirmPassword = document.getElementById("confirmPasswordInput").value;

  if (newPassword !== confirmPassword) {
    showToast("两次输入的新密码不一致", "error");
    return;
  }

  const res = await apiRequest("/api/auth/change-password", "POST", {
    oldPassword,
    newPassword,
  });

  if (res && res.code === 200) {
    showToast(res.msg);
    document.getElementById("passwordForm").reset();
  } else {
    showToast(res?.msg || "修改密码失败", "error");
  }
}

// -------------------------------------------------------------
// Modals & Helpers
// -------------------------------------------------------------
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove("show");
}

function showQrModal(url, title) {
  document.getElementById("qrModalTitle").textContent = title || "二维码预览";
  document.getElementById("qrModalLinkText").textContent = url;
  const qrContainer = document.getElementById("qrModalCanvas");
  qrContainer.innerHTML = "";

  if (typeof QRCode !== "undefined") {
    new QRCode(qrContainer, {
      text: url,
      width: 220,
      height: 220,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });
  }

  document.getElementById("qrModal").classList.add("show");
}

function openPhoneSimulator(targetUrl) {
  const iframe = document.getElementById("phoneSimulatorFrame");
  iframe.src = targetUrl;
  document.getElementById("phoneSimulatorModal").classList.add("show");
}

// -------------------------------------------------------------
// Mobile Table Horizontal Scroll Helpers
// -------------------------------------------------------------
function scrollTableTo(containerId, direction) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const targetX = direction === "right" ? el.scrollWidth : 0;
  el.scrollTo({ left: targetX, behavior: "smooth" });
}

function initTableScrollDrag() {
  // Only attach mouse drag scroll on desktop devices with fine pointer (mouse)
  if (!window.matchMedia || !window.matchMedia("(pointer: fine)").matches) return;

  document.querySelectorAll(".table-responsive").forEach((container) => {
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    container.addEventListener("mousedown", (e) => {
      isDown = true;
      container.style.cursor = "grabbing";
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
    });

    container.addEventListener("mouseleave", () => {
      isDown = false;
      container.style.cursor = "default";
    });

    container.addEventListener("mouseup", () => {
      isDown = false;
      container.style.cursor = "default";
    });

    container.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX) * 1.5;
      container.scrollLeft = scrollLeft - walk;
    });
  });
}

// -------------------------------------------------------------
// System Settings (Public Generation Switch)
// -------------------------------------------------------------
async function loadSystemSettings() {
  const res = await apiRequest("/api/system/settings");
  if (res && res.data) {
    const sw = document.getElementById("publicDwzSwitch");
    if (sw) sw.checked = !!res.data.public_dwz_allowed;
  }
}

async function togglePublicDwzSetting(checked) {
  const res = await apiRequest("/api/system/settings", "POST", {
    public_dwz_allowed: checked,
  });
  if (res && res.code === 200) {
    showToast(res.msg);
  } else {
    showToast(res?.msg || "保存系统设置失败", "error");
    const sw = document.getElementById("publicDwzSwitch");
    if (sw) sw.checked = !checked;
  }
}

// Global Initialization
window.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  initBlobDropzone();
  initTableScrollDrag();
});
