/**
 * EdgeOne Short URL & Group Live Code Console SPA Application Logic
 */

const STATE = {
  activeTab: "overview",
  isLoggedIn: false,
  username: "admin",
  stats: {},
  dwzList: [],
  qunList: [],
  blobList: [],
  currentQunId: null,
};

// Toast Notifications
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️";
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// API Helper
async function apiRequest(endpoint, method = "GET", body = null) {
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
    const res = await fetch(endpoint, options);
    const data = await res.json();
    if (res.status === 401) {
      STATE.isLoggedIn = false;
      document.getElementById("authOverlay").style.display = "flex";
      return null;
    }
    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    showToast("网络请求异常: " + err.message, "error");
    return null;
  }
}

// Tab Switching
function switchTab(tabId) {
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
    blob: "EdgeOne Blob 素材库",
    settings: "系统设置",
  };
  document.getElementById("currentPageTitle").textContent = titleMap[tabId] || "控制台";

  if (tabId === "overview") loadOverview();
  if (tabId === "dwz") loadDwzList();
  if (tabId === "qun") loadQunList();
  if (tabId === "blob") loadBlobList();
}

// Copy to Clipboard
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("链接已复制到剪贴板");
    });
  } else {
    const input = document.createElement("input");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    showToast("链接已复制到剪贴板");
  }
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
    document.getElementById("headerUsername").textContent = STATE.username;
    loadOverview();
  } else {
    STATE.isLoggedIn = false;
    document.getElementById("authOverlay").style.display = "flex";
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  if (!username || !password) {
    showToast("请输入账号和密码", "error");
    return;
  }

  const res = await apiRequest("/api/login", "POST", { username, password });
  if (res && res.code === 200) {
    showToast("登录成功");
    localStorage.setItem("dwz_token", res.data.token);
    STATE.isLoggedIn = true;
    STATE.username = res.data.username;
    document.getElementById("authOverlay").style.display = "none";
    document.getElementById("headerUsername").textContent = STATE.username;
    loadOverview();
  } else {
    showToast(res?.msg || "账号或密码错误", "error");
  }
}

async function handleLogout() {
  if (!confirm("确定要退出登录吗？")) return;
  await apiRequest("/api/logout", "POST");
  localStorage.removeItem("dwz_token");
  STATE.isLoggedIn = false;
  document.getElementById("authOverlay").style.display = "flex";
}

// -------------------------------------------------------------
// Overview / Stats
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
      runtimeBadge.textContent = "🟡 本地开发模式 (Mock 缓存)";
      runtimeBadge.className = "badge badge-warning";
    } else {
      runtimeBadge.textContent = "🟢 腾讯云 EdgeOne 边缘生产就绪";
      runtimeBadge.className = "badge badge-success";
    }
  }
}

// -------------------------------------------------------------
// 短网址 (dwz)
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
  tbody.innerHTML = "";

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">🔗</div><p>暂无短网址，点击右上角新建</p></td></tr>`;
    return;
  }

  const origin = window.location.origin;

  list.forEach((item) => {
    const fullShortUrl = `${origin}/s/${item.key}`;
    const typeInfo = DWZ_TYPE_MAP[item.type] || { text: "未知类型", class: "badge-secondary" };

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <strong>${item.title || "短网址"}</strong>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${item.created_at || ""}</div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px; font-weight: 600;">${item.key}</code>
          <button class="btn btn-secondary btn-sm" onclick="copyText('${fullShortUrl}')" title="复制短链接">📋 复制</button>
        </div>
      </td>
      <td>
        <div style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <a href="${item.url}" target="_blank" style="color: var(--primary); text-decoration: none;">${item.url}</a>
        </div>
      </td>
      <td><span class="badge ${typeInfo.class}">${typeInfo.text}</span></td>
      <td>
        <div><strong>${item.pv || 0}</strong> <small style="color: var(--text-muted);">次</small></div>
        <div style="font-size: 11px; color: var(--text-light);">今日: ${item.today_pv_count || 0}</div>
      </td>
      <td>
        <label class="switch">
          <input type="checkbox" ${item.status === 1 ? "checked" : ""} onchange="toggleDwzStatus('${item.key}')">
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="showQrModal('${fullShortUrl}', '${item.title}')">📱 码</button>
          <button class="btn btn-secondary btn-sm" onclick="openEditDwzModal('${item.key}')">✏️</button>
          <button class="btn btn-secondary btn-sm" onclick="resetDwzPv('${item.key}')" title="清零访问量">🔄</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDwz('${item.key}')" title="删除">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
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
  document.getElementById("dwzModalTitle").textContent = "新建短网址";
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
  document.getElementById("dwzFormKeyInput").disabled = true; // Key cannot be edited
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
    // Update
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
      showToast("修改成功");
      closeModal("dwzModal");
      loadDwzList();
    } else {
      showToast(res?.msg || "修改失败", "error");
    }
  } else {
    // Create
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
      showToast("创建成功");
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
// 群活码 (qun)
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
  tbody.innerHTML = "";

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">👥</div><p>暂无群活码，点击右上角新建</p></td></tr>`;
    return;
  }

  const origin = window.location.origin;

  list.forEach((item) => {
    const fullQunUrl = `${origin}/qun/${item.id}`;
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <strong>${item.title || "微信群活码"}</strong>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${item.created_at || ""}</div>
      </td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="openZimaModal('${item.id}')">
          📋 子码管理 (${item.total_zima || 0})
        </button>
      </td>
      <td>
        ${item.safety === 1 ? '<span class="badge badge-success" title="显示微信官方安全绿标认证">🛡️ 绿标</span>' : '<span class="badge badge-secondary">无安全标</span>'}
        ${item.qc === 1 ? '<span class="badge badge-primary" title="7天去重Cookie生效">🔄 7天去重</span>' : '<span class="badge badge-secondary">每次轮换</span>'}
      </td>
      <td>
        <div><strong>${item.pv || 0}</strong> <small style="color: var(--text-muted);">次</small></div>
        <div style="font-size: 11px; color: var(--text-light);">今日: ${item.today_pv_count || 0}</div>
      </td>
      <td>
        <label class="switch">
          <input type="checkbox" ${item.status === 1 ? "checked" : ""} onchange="toggleQunStatus('${item.id}')">
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="copyText('${fullQunUrl}')" title="复制活码链接">🔗 链接</button>
          <button class="btn btn-secondary btn-sm" onclick="showQrModal('${fullQunUrl}', '${item.title}')" title="查看活码二维码">📱 码</button>
          <button class="btn btn-secondary btn-sm" onclick="openPhoneSimulator('${fullQunUrl}')" title="真机模拟器实时预览">📱 模拟器</button>
          <button class="btn btn-secondary btn-sm" onclick="openEditQunModal('${item.id}')">✏️</button>
          <button class="btn btn-secondary btn-sm" onclick="resetQunPv('${item.id}')" title="清零访问量">🔄</button>
          <button class="btn btn-danger btn-sm" onclick="deleteQun('${item.id}')" title="删除">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
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

function openCreateQunModal() {
  document.getElementById("qunModalTitle").textContent = "新建群活码";
  document.getElementById("qunFormId").value = "";
  document.getElementById("qunFormTitle").value = "";
  document.getElementById("qunFormQc").checked = true;
  document.getElementById("qunFormSafety").checked = true;
  document.getElementById("qunFormKfStatus").checked = false;
  document.getElementById("qunFormKfQrcode").value = "";
  document.getElementById("qunFormBeizhu").value = "";
  document.getElementById("qunModal").classList.add("show");
}

function openEditQunModal(id) {
  const item = STATE.qunList.find((q) => String(q.id) === String(id));
  if (!item) return;

  document.getElementById("qunModalTitle").textContent = "编辑群活码";
  document.getElementById("qunFormId").value = item.id;
  document.getElementById("qunFormTitle").value = item.title || "";
  document.getElementById("qunFormQc").checked = item.qc === 1;
  document.getElementById("qunFormSafety").checked = item.safety === 1;
  document.getElementById("qunFormKfStatus").checked = item.kf_status === 1;
  document.getElementById("qunFormKfQrcode").value = item.kf_qrcode || "";
  document.getElementById("qunFormBeizhu").value = item.beizhu || "";
  document.getElementById("qunModal").classList.add("show");
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
    const res = await apiRequest("/api/qun/update", "POST", {
      id,
      title,
      qc,
      safety,
      kf_status,
      kf_qrcode,
      beizhu,
    });
    if (res && res.code === 200) {
      showToast("修改成功");
      closeModal("qunModal");
      loadQunList();
    } else {
      showToast(res?.msg || "修改失败", "error");
    }
  } else {
    const res = await apiRequest("/api/qun/create", "POST", {
      title,
      qc,
      safety,
      kf_status,
      kf_qrcode,
      beizhu,
    });
    if (res && res.code === 200) {
      showToast("创建成功");
      closeModal("qunModal");
      loadQunList();
    } else {
      showToast(res?.msg || "创建失败", "error");
    }
  }
}

async function toggleQunStatus(id) {
  const res = await apiRequest("/api/qun/toggle", "POST", { id });
  if (res && res.code === 200) {
    showToast(res.msg);
    loadQunList();
  }
}

async function resetQunPv(id) {
  if (!confirm("确定要将此群活码的访问量清零吗？")) return;
  const res = await apiRequest("/api/qun/reset-pv", "POST", { id });
  if (res && res.code === 200) {
    showToast("访问量已清零");
    loadQunList();
  }
}

async function deleteQun(id) {
  if (!confirm("确定要删除该群活码吗？其下所有子码配置也将被删除！")) return;
  const res = await apiRequest("/api/qun/delete", "POST", { id });
  if (res && res.code === 200) {
    showToast("删除成功");
    loadQunList();
  }
}

// -------------------------------------------------------------
// 子码 (Zima) 管理
// -------------------------------------------------------------
async function openZimaModal(qunId) {
  STATE.currentQunId = qunId;
  const res = await apiRequest(`/api/qun/get?id=${qunId}`);
  if (!res || !res.data) {
    showToast("获取群详情失败", "error");
    return;
  }

  const qun = res.data;
  document.getElementById("zimaModalTitle").textContent = `子码管理 - ${qun.title}`;
  renderZimaList(qun.zima || []);
  document.getElementById("zimaModal").classList.add("show");
}

function renderZimaList(zimaList) {
  const listEl = document.getElementById("zimaListContainer");
  listEl.innerHTML = "";

  if (!zimaList || zimaList.length === 0) {
    listEl.innerHTML = `<div class="empty-state" style="padding: 24px;"><p>暂无子码，请在下方点击上传新群二维码</p></div>`;
    return;
  }

  zimaList.forEach((zm, index) => {
    const max = Number(zm.max_num) || 200;
    const pv = Number(zm.pv) || 0;
    const percent = Math.min(100, Math.round((pv / max) * 100));
    const isFull = pv >= max;

    const itemDiv = document.createElement("div");
    itemDiv.style.cssText = `
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px;
      background: #f8fafc;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      margin-bottom: 12px;
    `;

    itemDiv.innerHTML = `
      <div style="width: 60px; height: 60px; border-radius: 8px; overflow: hidden; background: #fff; border: 1px solid #e2e8f0; flex-shrink: 0;">
        <img src="${zm.qrcode}" style="width: 100%; height: 100%; object-fit: contain;">
      </div>
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <strong>子码 #${index + 1}</strong>
          ${isFull ? '<span class="badge badge-danger">已满员</span>' : '<span class="badge badge-success">生效中</span>'}
          ${zm.status !== 1 ? '<span class="badge badge-secondary">已暂停</span>' : ""}
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">
          阈值上限: ${max} 人 | 当前已进: ${pv} 人 | 群主微信: ${zm.leader || "未设置"}
        </div>
        <div style="width: 100%; background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;">
          <div style="width: ${percent}%; height: 100%; background: ${isFull ? "var(--danger)" : "var(--primary)"}; border-radius: 3px;"></div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <button class="btn btn-secondary btn-sm" onclick="toggleZimaStatus('${zm.id}')">${zm.status === 1 ? "暂停" : "启用"}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteZima('${zm.id}')">删除</button>
      </div>
    `;
    listEl.appendChild(itemDiv);
  });
}

async function uploadFileToBlob(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiRequest("/api/upload", "POST", formData);
  if (res && res.code === 200) {
    return res.data.url;
  } else {
    showToast(res?.msg || "上传失败", "error");
    return null;
  }
}

async function handleAddZima(e) {
  e.preventDefault();
  const qun_id = STATE.currentQunId;
  if (!qun_id) return;

  const fileInput = document.getElementById("zimaFileInput");
  const max_num = document.getElementById("zimaFormMax").value || 200;
  const leader = document.getElementById("zimaFormLeader").value.trim();

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast("请先选择群二维码图片文件", "error");
    return;
  }

  showToast("正在上传群二维码至 EdgeOne Blob 存储...", "info");
  const qrcodeUrl = await uploadFileToBlob(fileInput.files[0]);
  if (!qrcodeUrl) return;

  const res = await apiRequest("/api/qun/zima/add", "POST", {
    qun_id,
    qrcode: qrcodeUrl,
    max_num,
    leader,
  });

  if (res && res.code === 200) {
    showToast("子码添加成功");
    fileInput.value = "";
    document.getElementById("zimaFormLeader").value = "";
    openZimaModal(qun_id); // Refresh
    loadQunList();
  }
}

async function toggleZimaStatus(zm_id) {
  const qun_id = STATE.currentQunId;
  const res = await apiRequest("/api/qun/zima/toggle", "POST", { qun_id, zm_id });
  if (res && res.code === 200) {
    showToast(res.msg);
    openZimaModal(qun_id);
    loadQunList();
  }
}

async function deleteZima(zm_id) {
  if (!confirm("确定要删除此子码吗？")) return;
  const qun_id = STATE.currentQunId;
  const res = await apiRequest("/api/qun/zima/delete", "POST", { qun_id, zm_id });
  if (res && res.code === 200) {
    showToast("子码已删除");
    openZimaModal(qun_id);
    loadQunList();
  }
}

// -------------------------------------------------------------
// EdgeOne Blob 素材库
// -------------------------------------------------------------
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
    container.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><div class="empty-icon">🖼️</div><p>暂无存储的素材图片，可通过下方上传</p></div>`;
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
      <div style="height: 160px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; overflow: hidden;">
        <img src="${fullUrl}" style="max-height: 100%; max-width: 100%; object-fit: contain;">
      </div>
      <div style="padding: 12px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="font-size: 12px; color: var(--text-muted); word-break: break-all; margin-bottom: 8px;">
          ${item.key}
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
  const files = e.target.files;
  if (!files || files.length === 0) return;

  showToast(`正在上传 ${files.length} 个文件至 EdgeOne Blob...`, "info");
  for (let i = 0; i < files.length; i++) {
    await uploadFileToBlob(files[i]);
  }
  showToast("上传完成");
  e.target.value = "";
  loadBlobList();
}

async function deleteBlobItem(key) {
  if (!confirm(`确定要从 EdgeOne Blob 中删除文件 [${key}] 吗？`)) return;
  const res = await apiRequest("/api/blob/delete", "POST", { key });
  if (res && res.code === 200) {
    showToast("素材删除成功");
    loadBlobList();
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

let activeQrInstance = null;
function showQrModal(url, title) {
  document.getElementById("qrModalTitle").textContent = title || "二维码预览";
  document.getElementById("qrModalLinkText").textContent = url;
  const qrContainer = document.getElementById("qrModalCanvas");
  qrContainer.innerHTML = "";

  if (typeof QRCode !== "undefined") {
    activeQrInstance = new QRCode(qrContainer, {
      text: url,
      width: 220,
      height: 220,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });
  } else {
    qrContainer.innerHTML = `<p style="color: red;">QRCode 库加载失败</p>`;
  }

  document.getElementById("qrModal").classList.add("show");
}

function openPhoneSimulator(targetUrl) {
  const iframe = document.getElementById("phoneSimulatorFrame");
  iframe.src = targetUrl;
  document.getElementById("phoneSimulatorModal").classList.add("show");
}

// Global Initialization
window.addEventListener("DOMContentLoaded", () => {
  checkAuth();
});
