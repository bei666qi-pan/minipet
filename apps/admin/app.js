const state = {
  token: localStorage.getItem("minipet_admin_token") || "",
  admin: null,
  view: location.hash.replace("#", "") || "dashboard",
  users: [],
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
    setLoginError(error.message || "登录失败，请检查邮箱和密码。");
  }
}

async function loadCurrentView() {
  if (!state.token) return;
  if (state.view === "dashboard") return loadDashboard();
  if (state.view === "users") return loadUsers();
  if (state.view === "releases") return loadReleases();
  if (state.view === "logs") return loadLogs();
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
  if (!Number.isFinite(quota) || quota < 0) return toast("请输入有效额度。");
  const result = await api(`/admin/users/${encodeURIComponent(id)}/quota`, {
    method: "PATCH",
    body: { quota_total_tokens: quota }
  });
  toast("额度已更新。桌面端刷新额度后会看到新值。");
  await openUser(result.user.id);
}

async function resetUserQuota(id) {
  const result = await api(`/admin/users/${encodeURIComponent(id)}/reset-quota`, { method: "POST", body: {} });
  toast("本月已用额度已重置。");
  await openUser(result.user.id);
}

async function toggleUser(id, status) {
  const next = status === "disabled" ? "active" : "disabled";
  await api(`/admin/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status: next } });
  toast(next === "disabled" ? "用户已禁用，桌面端会提示账号暂不可用。" : "用户已启用。");
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
    sha256: form.sha256.value.trim(),
    size: Number(form.size.value || 0) || undefined,
    notes: form.notes.value.trim()
  };
  await api("/admin/releases", { method: "POST", body: payload });
  toast("latest manifest 已更新。");
  await loadReleases();
}

async function loadLogs() {
  const [usage, audit] = await Promise.all([api("/admin/usage"), api("/admin/audit-logs")]);
  renderLogs(usage.usage || [], audit.auditLogs || []);
}

function render() {
  if (!state.token) return renderLogin();
  renderShell();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-panel">
        <h1>MiniPet Admin</h1>
        <p class="muted">管理用户、额度、版本和使用情况。</p>
        <form id="login-form">
          <label class="field">Email <input name="email" type="email" autocomplete="username" required /></label>
          <label class="field">Password <input name="password" type="password" autocomplete="current-password" required /></label>
          <div id="login-error" class="error"></div>
          <button class="primary" type="submit">登录</button>
        </form>
      </section>
    </main>
  `;
}

function renderShell() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">MiniPet Admin</div>
        <nav class="nav">
          ${navButton("dashboard", "Dashboard")}
          ${navButton("users", "用户")}
          ${navButton("releases", "Release")}
          ${navButton("logs", "日志")}
        </nav>
      </aside>
      <main class="main">
        <div class="page-title">
          <div><h1>${pageTitle()}</h1><div class="muted">${pageSubtitle()}</div></div>
          <div class="actions"><button data-action="refresh">刷新</button><button data-action="logout">退出</button></div>
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
  return { dashboard: "Dashboard", users: "用户列表", "user-detail": "用户详情", releases: "Release 管理", logs: "日志" }[state.view] || "Dashboard";
}

function pageSubtitle() {
  return "同域调用后台接口，敏感字段只在服务端环境变量中保存。";
}

function renderDashboard(overview) {
  document.querySelector("#page").innerHTML = `
    <section class="metric-grid">
      ${metric("今日新增用户", overview.todayNewUsers)}
      ${metric("总用户数", overview.totalUsers)}
      ${metric("今日请求数", overview.todayRequests)}
      ${metric("今日 token 消耗", overview.todayTokens)}
      ${metric("当前默认额度", overview.defaultQuotaTokens)}
    </section>
    <section class="panel">
      <h2>最近错误</h2>
      ${table(["request_id", "user_id", "status", "model", "total_tokens", "created_at"], (overview.recentErrors || []).map(usageRow))}
    </section>
  `;
}

function renderUsers() {
  if (!document.querySelector("#page")) renderShell();
  const keyword = state.search.toLowerCase();
  const users = state.users.filter((user) => `${user.deviceId} ${user.displayName} ${user.status}`.toLowerCase().includes(keyword));
  document.querySelector("#page").innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <input id="user-search" class="search" value="${escapeHtml(state.search)}" placeholder="搜索 device_id / display_name / status" />
        <span class="muted">${users.length} / ${state.users.length} 个用户</span>
      </div>
      ${table(["device_id", "display_name", "status", "quota_total_tokens", "quota_used_tokens", "last_seen_at", "操作"], users.map(userRow))}
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
        ${kv("device_id", escapeHtml(user.deviceId))}
        ${kv("display_name", escapeHtml(user.displayName))}
        ${kv("status", `<span class="status ${user.status === "disabled" ? "disabled" : ""}">${user.status}</span>`)}
        ${kv("quota_total_tokens", formatNumber(user.quotaTotalTokens))}
        ${kv("quota_used_tokens", formatNumber(user.quotaUsedTokens))}
        ${kv("last_seen_at", escapeHtml(formatTime(user.lastSeenAt)))}
        <div class="form-row">
          <label>手动调整额度</label>
          <input id="quota-${escapeHtml(user.id)}" type="number" min="0" value="${user.quotaTotalTokens}" />
        </div>
        <div class="actions">
          <button class="primary" data-action="save-user-quota" data-id="${escapeHtml(user.id)}">保存额度</button>
          <button data-action="reset-user-quota" data-id="${escapeHtml(user.id)}">重置本月额度</button>
          <button class="danger" data-action="toggle-user" data-id="${escapeHtml(user.id)}" data-status="${user.status}">${user.status === "disabled" ? "启用用户" : "禁用用户"}</button>
        </div>
      </section>
      <section class="panel">
        <h2>最近请求</h2>
        ${table(["request_id", "status", "model", "prompt", "completion", "total", "estimated", "created_at"], usage.map(usageDetailRow))}
      </section>
    </div>
  `;
}

function renderReleases(latest, releases) {
  document.querySelector("#page").innerHTML = `
    <div class="release-grid">
      <section class="panel">
        <h2>当前最新版本</h2>
        ${kv("version", escapeHtml(latest.version))}
        ${kv("installer_url", `<span class="code">${escapeHtml(latest.installerUrl || latest.downloadUrl || "")}</span>`)}
        ${kv("sha256", escapeHtml(latest.sha256 || "-"))}
        ${kv("size", escapeHtml(latest.size ? formatNumber(latest.size) : "-"))}
        ${kv("changelog", escapeHtml(latest.notes || "-"))}
      </section>
      <section class="panel">
        <h2>手动更新 latest manifest</h2>
        <form id="release-form">
          <div class="form-row"><label>version</label><input name="version" required /></div>
          <div class="form-row"><label>channel</label><input name="channel" value="stable" /></div>
          <div class="form-row"><label>installer_url</label><input name="installer_url" required /></div>
          <div class="form-row"><label>sha256</label><input name="sha256" /></div>
          <div class="form-row"><label>size</label><input name="size" type="number" min="0" /></div>
          <div class="form-row"><label>changelog</label><textarea name="notes"></textarea></div>
          <button class="primary" type="submit">保存 Release</button>
        </form>
      </section>
    </div>
    <section class="panel">
      <h2>Release 历史</h2>
      ${table(["version", "channel", "installer_url", "sha256", "size", "created_at"], releases.map(releaseRow))}
    </section>
  `;
}

function renderLogs(usage, auditLogs) {
  const errors = usage.filter((item) => item.status !== "success");
  document.querySelector("#page").innerHTML = `
    <div class="logs-grid">
      <section class="panel">
        <h2>错误日志</h2>
        ${table(["request_id", "user_id", "status", "model", "created_at"], errors.map(errorRow))}
      </section>
      <section class="panel">
        <h2>审计日志</h2>
        ${table(["actor", "action", "target", "metadata", "created_at"], auditLogs.map(auditRow))}
      </section>
    </div>
    <section class="panel">
      <h2>用量日志</h2>
      ${table(["request_id", "user_id", "status", "model", "prompt", "completion", "total", "estimated", "created_at"], usage.map(usageDetailRow))}
    </section>
  `;
}

function metric(label, value) {
  return `<div class="metric"><span class="muted">${label}</span><strong>${formatNumber(value || 0)}</strong></div>`;
}

function table(headers, rows) {
  if (!rows.length) return `<div class="empty">暂无数据</div>`;
  return `<table><thead><tr>${headers.map((item) => `<th>${item}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function userRow(user) {
  return `<tr>
    <td class="code">${escapeHtml(user.deviceId)}</td>
    <td>${escapeHtml(user.displayName)}</td>
    <td><span class="status ${user.status === "disabled" ? "disabled" : ""}">${user.status}</span></td>
    <td>${formatNumber(user.quotaTotalTokens)}</td>
    <td>${formatNumber(user.quotaUsedTokens)}</td>
    <td>${formatTime(user.lastSeenAt)}</td>
    <td><div class="actions"><button data-action="view-user" data-id="${escapeHtml(user.id)}">查看</button><button class="danger" data-action="toggle-user" data-id="${escapeHtml(user.id)}" data-status="${user.status}">${user.status === "disabled" ? "启用" : "禁用"}</button></div></td>
  </tr>`;
}

function usageRow(item) {
  return `<tr><td class="code">${escapeHtml(item.requestId)}</td><td class="code">${escapeHtml(item.userId)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.model)}</td><td>${formatNumber(item.totalTokens)}</td><td>${formatTime(item.createdAt)}</td></tr>`;
}

function usageDetailRow(item) {
  return `<tr><td class="code">${escapeHtml(item.requestId)}</td><td class="code">${escapeHtml(item.userId)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.model)}</td><td>${formatNumber(item.promptTokens)}</td><td>${formatNumber(item.completionTokens)}</td><td>${formatNumber(item.totalTokens)}</td><td>${item.estimated ? "yes" : "no"}</td><td>${formatTime(item.createdAt)}</td></tr>`;
}

function releaseRow(item) {
  return `<tr><td>${escapeHtml(item.version)}</td><td>${escapeHtml(item.channel)}</td><td class="code">${escapeHtml(item.installerUrl)}</td><td class="code">${escapeHtml(item.sha256 || "")}</td><td>${item.size ? formatNumber(item.size) : ""}</td><td>${formatTime(item.createdAt)}</td></tr>`;
}

function errorRow(item) {
  return `<tr><td class="code">${escapeHtml(item.requestId)}</td><td class="code">${escapeHtml(item.userId)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.model)}</td><td>${formatTime(item.createdAt)}</td></tr>`;
}

function auditRow(item) {
  return `<tr><td>${escapeHtml(item.actorType)}:${escapeHtml(item.actorId)}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.target)}</td><td class="code">${escapeHtml(JSON.stringify(redact(parseJson(item.metadataJson)), null, 2))}</td><td>${formatTime(item.createdAt)}</td></tr>`;
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
  if (!response.ok) throw new Error(json.message || json.error || `请求失败：${response.status}`);
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
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
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => (/authorization|bearer|api[_-]?key|password|secret|token/i.test(key) ? [key, "[REDACTED]"] : [key, redact(entry)])));
  }
  if (typeof value === "string") return value.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");
  return value;
}
