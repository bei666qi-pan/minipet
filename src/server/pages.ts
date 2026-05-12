import type { ServerConfig } from "./config";

export function landingPage(config: ServerConfig): string {
  const downloadUrl = `${config.downloadOrigin.replace(/\/+$/, "")}/MiniPetSetup.exe`;
  return html("MiniPet 桌面伙伴", `
    <main class="hero">
      <section>
        <p class="eyebrow">MiniPet Desktop Companion</p>
        <h1>打开电脑，它就已经在桌面等你。</h1>
        <p class="lead">下载安装后即可直接基础 AI 对话。无需配置 URL、API Key、NewAPI 或 OpenClaw；高级用户也可以切换到自带模型模式。</p>
        <div class="actions">
          <a class="primary" href="${escapeHtml(downloadUrl)}">下载 Windows 安装包</a>
          <a class="secondary" href="/admin">管理员后台</a>
        </div>
        <p class="note">默认每台设备 200 万 token 额度，管理员可在后台调整额度或禁用设备。</p>
      </section>
      <section class="pet-card">
        <div class="bubble">点一下我，就能和我说话。</div>
        <img src="/assets/Idle_Welcome.png" alt="MiniPet" />
      </section>
    </main>
  `);
}

export function adminPage(): string {
  return html("MiniPet 管理后台", `
    <main class="admin-shell">
      <section class="panel">
        <h1>MiniPet 管理后台</h1>
        <div id="login">
          <label>管理员邮箱<input id="email" autocomplete="username" /></label>
          <label>管理员密码<input id="password" type="password" autocomplete="current-password" /></label>
          <button id="loginButton">登录</button>
          <p id="loginError" class="error"></p>
        </div>
        <div id="dashboard" hidden>
          <div class="summary" id="summary"></div>
          <table>
            <thead><tr><th>设备</th><th>额度</th><th>已用</th><th>状态</th><th>最后活跃</th><th>操作</th></tr></thead>
            <tbody id="devices"></tbody>
          </table>
        </div>
      </section>
    </main>
    <script>
      let token = localStorage.getItem('minipet_admin_token') || '';
      const login = document.getElementById('login');
      const dashboard = document.getElementById('dashboard');
      const summary = document.getElementById('summary');
      const devices = document.getElementById('devices');
      document.getElementById('loginButton').onclick = async () => {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value, password: password.value })
        });
        if (!response.ok) {
          loginError.textContent = '登录失败';
          return;
        }
        token = (await response.json()).token;
        localStorage.setItem('minipet_admin_token', token);
        await load();
      };
      async function load() {
        const response = await fetch('/api/admin/devices', { headers: { Authorization: 'Bearer ' + token } });
        if (!response.ok) return;
        const data = await response.json();
        login.hidden = true;
        dashboard.hidden = false;
        summary.textContent = '设备 ' + data.summary.totalDevices + ' 台，已用 ' + data.summary.totalUsedTokens + ' / ' + data.summary.totalQuotaTokens + ' tokens';
        devices.innerHTML = '';
        for (const device of data.devices) {
          const tr = document.createElement('tr');
          tr.innerHTML = '<td><code>' + device.id + '</code></td><td><input type="number" value="' + device.quotaTokens + '" /></td><td>' + device.usedTokens + '</td><td>' + (device.disabled ? '禁用' : '启用') + '</td><td>' + device.lastSeenAt + '</td><td><button>保存</button></td>';
          tr.querySelector('button').onclick = async () => {
            await fetch('/api/admin/devices/' + encodeURIComponent(device.id), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
              body: JSON.stringify({ quotaTokens: Number(tr.querySelector('input').value), disabled: !device.disabled })
            });
            await load();
          };
          devices.appendChild(tr);
        }
      }
      if (token) load();
    </script>
  `);
}

function html(title: string, body: string): string {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root { color-scheme: light; font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif; color: #302b38; background: #fffaf6; }
        body { margin: 0; min-height: 100vh; background: linear-gradient(145deg, #d8f3ff 0%, #fffaf6 44%, #ffddea 100%); }
        .hero { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 360px; align-items: center; gap: 56px; max-width: 1120px; margin: 0 auto; padding: 48px 28px; }
        .eyebrow { color: #e96f9a; font-weight: 800; }
        h1 { font-size: clamp(36px, 6vw, 68px); line-height: 1.04; margin: 0 0 22px; }
        .lead { font-size: 18px; line-height: 1.75; max-width: 680px; color: #675f70; }
        .actions { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 28px; }
        a, button { border-radius: 14px; padding: 12px 18px; border: 1px solid rgba(94,75,118,.16); text-decoration: none; cursor: pointer; }
        .primary, button { background: linear-gradient(135deg, #e96f9a, #5ab8cb); color: #fff; font-weight: 800; border: 0; }
        .secondary { background: rgba(255,255,255,.74); color: #302b38; }
        .note { color: #736b7d; }
        .pet-card { display: grid; place-items: center; gap: 10px; }
        .pet-card img { width: 320px; max-width: 100%; filter: drop-shadow(0 22px 32px rgba(83,57,102,.18)); }
        .bubble, .panel { background: rgba(255,253,249,.92); border: 1px solid rgba(94,75,118,.16); box-shadow: 0 18px 38px rgba(83,57,102,.16); border-radius: 22px; padding: 18px; }
        .admin-shell { max-width: 1180px; margin: 0 auto; padding: 32px 20px; }
        label { display: grid; gap: 6px; margin: 12px 0; color: #736b7d; }
        input { padding: 10px; border-radius: 12px; border: 1px solid rgba(94,75,118,.16); }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        th, td { padding: 10px; border-bottom: 1px solid rgba(94,75,118,.16); text-align: left; }
        code { font-size: 12px; word-break: break-all; }
        .error { color: #c9435c; }
        @media (max-width: 820px) { .hero { grid-template-columns: 1fr; } }
      </style>
    </head>
    <body>${body}</body>
  </html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
