const state = {
  token: localStorage.getItem("minipet_admin_token") || "",
  admin: null,
  view: location.hash.replace("#", "") || "dashboard",
  users: [],
  usage: [],
  auditLogs: [],
  selectedUserId: "",
  search: ""
};

const app = document.querySelector("#app");

window.addEventListener("hashchange", () => {
  state.view = location.hash.replace("#", "") || "dashboard";
  render();
  void loadCurrentView();
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === "nav") return navigate(button.dataset.view);
  if (action === "logout") return logout();
  if (action === "view-user" && id) return openUser(id);
  if (action === "toggle-user" && id) return void toggleUser(id, button.dataset.status);
  if (action === "save-user-quota" && id) return void saveUserQuota(id);
  if (action === "reset-user-quota" && id) return void resetUserQuota(id);
  if (action === "refresh") return void loadCurrentView();
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "login-form") return void login(form);
  if (form.id === "release-form") return void saveRelease(form);
});

app.addEventListener("input", (event) => {
  if (event.target.id === "user-search") {
    state.search = event.target.value;
    renderUsers();
  }
});

render();
void loadCurrentView();

function navigate(view) {
  location.hash = view;
}

function logout() {
  state.token = "";
  state.admin = null;
  localStorage.removeItem("minipet_admin_token");
  render();
}

async function login(form) {
  setLoginError("");
  const email = form.email.value.trim();
  const password = form.password.value;
  try {
    const result = await api("/admin/login", { method: "POST", body: { email, password }, public: true });
    state.token = result.token;
    state.admin = result.admin;
    localStorage.setItem("minipet_admin_token", result.token);
    navigate("dashboard");
    render();
    await loadCurrentView();
  } catch (error) {
    setLoginError(error.message || "登录失败，请检查账号和密码。");
  }
}

async function loadCurrentView() {
  if (!state.token) return;
  if (state.view === "dashboard") return loadDashboard();
  if (state.view === "users") return loadUsers();
  if (state.view === "releases") return loadReleases();
  if (state.view === "usage") return loadUsage();
  if (state.view === "security") return loadSecurity();
}

async function loadDashboard() {
  const overview = await api("/admin/overview");
  renderDashboard(overview);
}

async function loadUsers() {
  const result = await api("/admin/users");
  state.users = result.users || [];
  renderUsers();
}

async function openUser(id) {
  state.selectedUserId = id;
  state.view = "user-detail";
  history.replaceState(null, "", "#user-detail");
  renderShell();
  const result = await api(`/admin/users/${encodeURIComponent(id)}`);
  renderUserDetail(result);
}

async function saveUserQuota(id) {
  const input = document.querySelector(`#quota-${cssEscape(id)}`);
  const quota = Number(input.value);
  if (!Number.isFinite(quota) || quota < 0) return toast("请输入有效的可用额度。");
  const result = await api(`/admin/users/${encodeURIComponent(id)}/quota`, {
    method: "PATCH",
    body: { quota_total_tokens: quota }
  });
  toast("可用额度已更新。");
  await openUser(result.user.id);
}

async function resetUserQuota(id) {
  const result = await api(`/admin/users/${encodeURIComponent(id)}/reset-quota`, { method: "POST", body: {} });
  toast("本月已用额度已清零。");
  await openUser(result.user.id);
}

async function toggleUser(id, status) {
  const next = status === "disabled" ? "active" : "disabled";
  await api(`/admin/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status: next } });
  toast(next === "disabled" ? "该用户已暂停使用。" : "该用户已恢复使用。");
  if (state.view === "user-detail") await openUser(id);
  else await loadUsers();
}

async function loadReleases() {
  const [latest, list] = await Promise.all([api("/v1/releases/latest", { public: true }), api("/admin/releases")]);
  renderReleases(latest, list.releases || []);
}

async function saveRelease(form) {
  const payload = {
    version: form.version.value.trim(),
    channel: form.channel.value.trim() || "stable",
    installer_url: form.installer_url.value.trim(),
    sha256: form.checksum.value.trim(),
    size: Number(form.size.value || 0) || undefined,
    notes: form.notes.value.trim()
  };
  await api("/admin/releases", { method: "POST", body: payload });
  toast("版本信息已保存，官网会展示最新可下载版本。");
  await loadReleases();
}

async function loadUsage() {
  const result = await api("/admin/usage");
  state.usage = result.usage || [];
  renderUsage();
}

async function loadSecurity() {
  const [usage, audit] = await Promise.all([api("/admin/usage"), api("/admin/audit-logs")]);
  state.usage = usage.usage || [];
  state.auditLogs = audit.auditLogs || [];
  renderSecurity();
}

function render() {
  if (!state.token) return renderLogin();
  renderShell();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-panel">
        <div class="login-brand">爪爪</div>
        <h1>运营后台</h1>
        <p class="muted">用于查看用户状态、管理额度和发布新版本。</p>
        <form id="login-form">
          <label class="field">管理员邮箱 <input name="email" type="email" autocomplete="username" required /></label>
          <label class="field">管理员密码 <input name="password" type="password" autocomplete="current-password" required /></label>
          <div id="login-error" class="error"></div>
          <button class="primary" type="submit">登录后台</button>
        </form>
      </section>
    </main>
  `;
}

function renderShell() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">爪爪运营台</div>
        <nav class="nav">
          ${navButton("dashboard", "总览")}
          ${navButton("users", "用户与额度")}
          ${navButton("releases", "版本发布")}
          ${navButton("usage", "使用记录")}
          ${navButton("security", "安全记录")}
        </nav>
      </aside>
      <main class="main">
        <div class="page-title">
          <div><h1>${pageTitle()}</h1><div class="muted">${pageSubtitle()}</div></div>
          <div class="actions"><button data-action="refresh">刷新</button><button data-action="logout">退出登录</button></div>
        </div>
        <div id="page"><div class="panel empty">正在加载...</div></div>
      </main>
    </div>
  `;
}

function navButton(view, label) {
  return `<button class="${state.view === view ? "active" : ""}" data-action="nav" data-view="${view}">${label}</button>`;
}

function pageTitle() {
  return {
    dashboard: "运营总览",
    users: "用户与额度",
    "user-detail": "用户详情",
    releases: "版本发布",
    usage: "使用记录",
    security: "安全记录"
  }[state.view] || "运营总览";
}

function pageSubtitle() {
  return {
    dashboard: "查看今日使用情况和需要关注的问题。",
    users: "查看用户状态，调整可用额度，必要时暂停使用。",
    "user-detail": "查看单个用户的使用概况和额度设置。",
    releases: "维护官网展示的最新下载版本。",
    usage: "查看近期服务使用情况，默认隐藏排障细节。",
    security: "查看登录、额度调整和异常请求等安全相关记录。"
  }[state.view] || "";
}

function renderDashboard(overview) {
  const recentErrors = overview.recentErrors || [];
  document.querySelector("#page").innerHTML = `
    <section class="metric-grid">
      ${metric("今日新增用户", overview.todayNewUsers)}
      ${metric("累计用户", overview.totalUsers)}
      ${metric("今日服务次数", overview.todayRequests)}
      ${metric("今日使用额度", overview.todayTokens)}
      ${metric("默认可用额度", overview.defaultQuotaTokens)}
    </section>
    <section class="panel">
      <h2>需要关注</h2>
      ${recentErrors.length ? table(["记录编号", "用户", "状态", "使用额度", "时间"], recentErrors.map(alertRow)) : empty("暂无需要处理的问题")}
    </section>
  `;
}

function renderUsers() {
  if (!document.querySelector("#page")) renderShell();
  const keyword = state.search.toLowerCase();
  const users = state.users.filter((user) => `${user.deviceId} ${user.displayName} ${statusLabel(user.status)}`.toLowerCase().includes(keyword));
  document.querySelector("#page").innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <input id="user-search" class="search" value="${escapeHtml(state.search)}" placeholder="搜索设备编号、用户名称或状态" />
        <span class="muted">当前显示 ${users.length} / ${state.users.length} 位用户</span>
      </div>
      ${table(["设备编号", "用户名称", "账号状态", "可用额度", "已用额度", "最近使用", "操作"], users.map(userRow))}
    </section>
  `;
}

function renderUserDetail(result) {
  const user = result.user;
  const usage = result.usage || [];
  document.querySelector("#page").innerHTML = `
    <div class="detail-grid">
      <section class="panel">
        <h2>基础信息</h2>
        ${kv("设备编号", escapeHtml(maskId(user.deviceId)))}
        ${kv("用户名称", escapeHtml(user.displayName || "匿名用户"))}
        ${kv("账号状态", `<span class="status ${user.status === "disabled" ? "disabled" : ""}">${statusLabel(user.status)}</span>`)}
        ${kv("可用额度", formatNumber(user.quotaTotalTokens))}
        ${kv("已用额度", formatNumber(user.quotaUsedTokens))}
        ${kv("剩余额度", formatNumber(user.quotaRemaining))}
        ${kv("最近使用", escapeHtml(formatTime(user.lastSeenAt)))}
        <div class="form-row">
          <label>调整可用额度</label>
          <input id="quota-${escapeHtml(user.id)}" type="number" min="0" value="${user.quotaTotalTokens}" />
        </div>
        <div class="actions">
          <button class="primary" data-action="save-user-quota" data-id="${escapeHtml(user.id)}">保存额度</button>
          <button data-action="reset-user-quota" data-id="${escapeHtml(user.id)}">清零本月已用</button>
          <button class="danger" data-action="toggle-user" data-id="${escapeHtml(user.id)}" data-status="${user.status}">${user.status === "disabled" ? "恢复使用" : "暂停使用"}</button>
        </div>
        <details class="debug-details">
          <summary>排障信息</summary>
          <p class="code">${escapeHtml(user.deviceId)}</p>
        </details>
      </section>
      <section class="panel">
        <h2>最近使用</h2>
        ${table(["记录编号", "处理结果", "使用额度", "是否估算", "时间"], usage.map(usageDetailRow))}
      </section>
    </div>
  `;
}

function renderReleases(latest, releases) {
  document.querySelector("#page").innerHTML = `
    <div class="release-grid">
      <section class="panel">
        <h2>官网当前展示</h2>
        ${kv("版本号", escapeHtml(latest.version || "-"))}
        ${kv("安装包地址", `<span class="wrap">${escapeHtml(latest.installerUrl || latest.downloadUrl || "")}</span>`)}
        ${kv("文件大小", escapeHtml(latest.size ? formatBytes(latest.size) : "待公布"))}
        ${kv("更新说明", escapeHtml(latest.notes || latest.release_notes || "-"))}
        <details class="debug-details">
          <summary>安全校验信息</summary>
          <p class="code">${escapeHtml(latest.sha256 || "暂未填写")}</p>
        </details>
      </section>
      <section class="panel">
        <h2>发布新版本</h2>
        <form id="release-form">
          <div class="form-row"><label>版本号</label><input name="version" required /></div>
          <div class="form-row"><label>发布渠道</label><input name="channel" value="stable" /></div>
          <div class="form-row"><label>安装包地址</label><input name="installer_url" required /></div>
          <div class="form-row"><label>安全校验码（可选）</label><input name="checksum" /></div>
          <div class="form-row"><label>文件大小（字节，可选）</label><input name="size" type="number" min="0" /></div>
          <div class="form-row"><label>面向用户的更新说明</label><textarea name="notes"></textarea></div>
          <button class="primary" type="submit">保存版本</button>
        </form>
      </section>
    </div>
    <section class="panel">
      <h2>历史版本</h2>
      ${table(["版本号", "渠道", "安装包", "文件大小", "发布时间"], releases.map(releaseRow))}
    </section>
  `;
}

function renderUsage() {
  document.querySelector("#page").innerHTML = `
    <section class="panel">
      <h2>近期使用记录</h2>
      ${table(["记录编号", "用户", "处理结果", "使用额度", "是否估算", "时间"], state.usage.map(usageRow))}
    </section>
  `;
}

function renderSecurity() {
  const errors = state.usage.filter((item) => item.status !== "success");
  document.querySelector("#page").innerHTML = `
    <div class="logs-grid">
      <section class="panel">
        <h2>异常记录</h2>
        ${errors.length ? table(["记录编号", "用户", "状态", "时间"], errors.map(errorRow)) : empty("暂无异常记录")}
      </section>
      <section class="panel">
        <h2>后台操作</h2>
        ${table(["操作人", "操作内容", "对象", "时间", "排障信息"], state.auditLogs.map(auditRow))}
      </section>
    </div>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span class="muted">${label}</span><strong>${formatNumber(value || 0)}</strong></div>`;
}

function table(headers, rows) {
  if (!rows.length) return empty("暂无数据");
  return `<div class="table-wrap"><table><thead><tr>${headers.map((item) => `<th>${item}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function empty(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function userRow(user) {
  return `<tr>
    <td>${escapeHtml(maskId(user.deviceId))}</td>
    <td>${escapeHtml(user.displayName || "匿名用户")}</td>
    <td><span class="status ${user.status === "disabled" ? "disabled" : ""}">${statusLabel(user.status)}</span></td>
    <td>${formatNumber(user.quotaTotalTokens)}</td>
    <td>${formatNumber(user.quotaUsedTokens)}</td>
    <td>${formatTime(user.lastSeenAt)}</td>
    <td><div class="actions"><button data-action="view-user" data-id="${escapeHtml(user.id)}">查看</button><button class="danger" data-action="toggle-user" data-id="${escapeHtml(user.id)}" data-status="${user.status}">${user.status === "disabled" ? "恢复" : "暂停"}</button></div></td>
  </tr>`;
}

function alertRow(item) {
  return `<tr><td>${escapeHtml(maskId(item.requestId))}</td><td>${escapeHtml(maskId(item.userId))}</td><td>${statusLabel(item.status)}</td><td>${formatNumber(item.totalTokens)}</td><td>${formatTime(item.createdAt)}</td></tr>`;
}

function usageRow(item) {
  return `<tr><td>${escapeHtml(maskId(item.requestId))}</td><td>${escapeHtml(maskId(item.userId))}</td><td>${statusLabel(item.status)}</td><td>${formatNumber(item.totalTokens)}</td><td>${item.estimated ? "是" : "否"}</td><td>${formatTime(item.createdAt)}</td></tr>`;
}

function usageDetailRow(item) {
  return `<tr><td>${escapeHtml(maskId(item.requestId))}</td><td>${statusLabel(item.status)}</td><td>${formatNumber(item.totalTokens)}</td><td>${item.estimated ? "是" : "否"}</td><td>${formatTime(item.createdAt)}</td></tr>`;
}

function releaseRow(item) {
  return `<tr><td>${escapeHtml(item.version)}</td><td>${channelLabel(item.channel)}</td><td class="wrap">${escapeHtml(item.installerUrl)}</td><td>${item.size ? formatBytes(item.size) : "待公布"}</td><td>${formatTime(item.createdAt)}</td></tr>`;
}

function errorRow(item) {
  return `<tr><td>${escapeHtml(maskId(item.requestId))}</td><td>${escapeHtml(maskId(item.userId))}</td><td>${statusLabel(item.status)}</td><td>${formatTime(item.createdAt)}</td></tr>`;
}

function auditRow(item) {
  const metadata = redact(parseJson(item.metadataJson));
  return `<tr>
    <td>${actorLabel(item.actorType)} ${escapeHtml(maskId(item.actorId))}</td>
    <td>${actionLabel(item.action)}</td>
    <td>${escapeHtml(maskId(item.target))}</td>
    <td>${formatTime(item.createdAt)}</td>
    <td><details class="debug-details"><summary>查看</summary><pre>${escapeHtml(JSON.stringify(metadata, null, 2))}</pre></details></td>
  </tr>`;
}

function kv(label, value) {
  return `<div class="form-row"><label class="muted">${label}</label><div>${value}</div></div>`;
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (!options.public && state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (response.status === 401 && !options.public) {
    logout();
    throw new Error("登录已过期，请重新登录。");
  }
  if (!response.ok) throw new Error(errorLabel(json.error || json.message) || `请求失败：${response.status}`);
  return json;
}

function setLoginError(message) {
  const element = document.querySelector("#login-error");
  if (element) element.textContent = message;
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3600);
}

function statusLabel(value) {
  return {
    active: "正常",
    disabled: "已暂停",
    success: "成功",
    failed: "失败",
    error: "失败",
    blocked: "已拦截",
    model_backend_error: "回复失败"
  }[value] || (value ? "需关注" : "-");
}

function channelLabel(value) {
  return value === "stable" ? "正式版" : escapeHtml(value || "-");
}

function actorLabel(value) {
  return value === "admin" ? "管理员" : value === "device" ? "用户设备" : "系统";
}

function actionLabel(value) {
  return {
    bootstrap: "设备首次连接",
    admin_login: "管理员登录",
    admin_login_failed: "管理员登录失败",
    user_quota_updated: "调整用户额度",
    user_quota_reset: "重置用户额度",
    user_status_updated: "调整用户状态",
    release_created: "保存版本信息",
    content_blocked: "内容被安全拦截"
  }[value] || "系统记录";
}

function errorLabel(value) {
  return {
    admin_login_required: "请先登录后台。",
    invalid_credentials: "登录失败，请检查账号和密码。",
    invalid_quota: "请输入有效额度。",
    user_not_found: "未找到该用户。",
    release_webhook_not_configured: "版本发布入口尚未配置。"
  }[value] || value;
}

function maskId(value) {
  const text = String(value || "-");
  if (text.length <= 8) return text;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function formatBytes(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "待公布";
  const units = ["B", "KB", "MB", "GB"];
  let size = number;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN") : String(value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function cssEscape(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function parseJson(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return { raw: value };
  }
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => (/authorization|bearer|api[_-]?key|password|secret|token/i.test(key) ? [key, "[已隐藏]"] : [key, redact(entry)])));
  }
  if (typeof value === "string") return value.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [已隐藏]");
  return value;
}
