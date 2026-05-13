import type { ServerConfig } from "./config";

const CONTACT_EMAIL = "bei666qi@gmail.com";

export function landingPage(config: ServerConfig, pathname = "/"): string {
  if (pathname === "/privacy") return privacyPage();
  if (pathname === "/terms") return termsPage();
  if (pathname === "/changelog") return changelogPage(config);

  const downloadUrl = `${config.downloadOrigin.replace(/\/+$/, "")}/MiniPetSetup.exe`;
  return html("爪爪 MiniPet - 温和的桌面 AI 伙伴", `
    <main class="hero">
      <section>
        <div class="server-brand"><img src="/assets/minipet-logo.png" alt="" /><span>爪爪 MiniPet</span></div>
        <p class="eyebrow">Windows 桌面伙伴</p>
        <h1>打开电脑，爪爪在桌面陪你整理思路。</h1>
        <p class="lead">适合学习、办公和日常记录。下载安装后即可开始聊天，遇到文件、发送、删除等重要操作时，会先请你确认。</p>
        <div class="actions">
          <a class="primary" href="${escapeHtml(downloadUrl)}">下载 Windows 版</a>
          <a class="secondary" href="/privacy">隐私政策</a>
          <a class="secondary" href="/terms">用户协议</a>
        </div>
        <p class="note">下载或使用前，请阅读用户协议与隐私政策。如需帮助，请联系 ${CONTACT_EMAIL}。</p>
      </section>
      <section class="pet-card">
        <div class="bubble">点一下我，就能和我说话。</div>
        <img src="/assets/Idle_Welcome.png" alt="爪爪" />
      </section>
    </main>
    ${simpleSections()}
  `);
}

export function adminPage(): string {
  return html("爪爪运营后台", `
    <main class="admin-shell">
      <section class="panel">
        <h1>爪爪运营后台</h1>
        <p class="note">用于查看用户状态、管理额度和维护下载版本。</p>
        <div id="login">
          <label>管理员邮箱<input id="email" autocomplete="username" /></label>
          <label>管理员密码<input id="password" type="password" autocomplete="current-password" /></label>
          <button id="loginButton">登录后台</button>
          <p id="loginError" class="error"></p>
        </div>
        <div id="dashboard" hidden>
          <div class="summary" id="summary"></div>
          <table>
            <thead><tr><th>设备编号</th><th>可用额度</th><th>已用额度</th><th>账号状态</th><th>最近使用</th><th>操作</th></tr></thead>
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
      const mask = (value) => String(value || '-').length > 8 ? String(value).slice(0, 4) + '...' + String(value).slice(-4) : String(value || '-');
      document.getElementById('loginButton').onclick = async () => {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value, password: password.value })
        });
        if (!response.ok) {
          loginError.textContent = '登录失败，请检查账号和密码。';
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
        summary.textContent = '共有 ' + data.summary.totalDevices + ' 台设备，已用 ' + data.summary.totalUsedTokens + ' / ' + data.summary.totalQuotaTokens + '。';
        devices.innerHTML = '';
        for (const device of data.devices) {
          const tr = document.createElement('tr');
          tr.innerHTML = '<td>' + mask(device.id) + '</td><td><input type="number" value="' + device.quotaTokens + '" /></td><td>' + device.usedTokens + '</td><td>' + (device.disabled ? '已暂停' : '正常') + '</td><td>' + (device.lastSeenAt || '-') + '</td><td><button>保存</button></td>';
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

function privacyPage(): string {
  return html("爪爪隐私政策", documentShell("隐私政策", `
    <p>本政策由 MiniPet 项目组发布。我们会尽量用清晰、易懂的方式说明爪爪如何处理与你有关的信息。联系邮箱：${CONTACT_EMAIL}。</p>
    <h2>我们会处理哪些信息</h2>
    <p>为了提供服务，爪爪可能处理匿名设备编号、应用版本、系统类型、服务请求记录、使用额度和必要的错误记录。你主动提交文件或资料时，相关内容只会在完成该次请求所需范围内使用。</p>
    <h2>用途与保存</h2>
    <p>相关信息用于提供回复、保障服务稳定、防止滥用、统计额度、排查故障以及回应你的权利请求。我们会在实现处理目的所需的最短期限内保存。</p>
    <h2>你的权利</h2>
    <p>你可以通过 ${CONTACT_EMAIL} 申请查询、复制、更正、补充、删除相关个人信息，或撤回同意。我们会在核验身份和请求范围后依法处理。</p>
    <h2>投诉与联系</h2>
    <p>如你认为信息处理方式存在问题，或希望反馈安全、隐私、内容合规相关事项，请发送邮件到 ${CONTACT_EMAIL}。</p>
  `));
}

function termsPage(): string {
  return html("爪爪用户协议", documentShell("用户协议", `
    <p>本协议由 MiniPet 项目组发布。下载、安装或使用爪爪，即表示你理解并同意本协议和隐私政策。联系邮箱：${CONTACT_EMAIL}。</p>
    <h2>服务用途</h2>
    <p>爪爪提供学习、办公和日常整理辅助。AI 输出可能存在不准确、不完整或不适合特定场景的情况，重要事项请自行核验。</p>
    <h2>使用边界</h2>
    <p>你不得利用爪爪从事违法违规、侵权、欺诈、骚扰、危害网络安全、侵犯个人信息权益或其他损害国家利益、公共利益、他人合法权益的行为。</p>
    <h2>安全确认</h2>
    <p>涉及文件、支付、发送消息、删除、安装、提交等重要或高风险操作时，爪爪会尽量提示你确认。你仍需自行判断操作后果。</p>
    <h2>争议与反馈</h2>
    <p>如出现争议，双方应先友好沟通。你可以通过 ${CONTACT_EMAIL} 联系 MiniPet 项目组。</p>
  `));
}

function changelogPage(config: ServerConfig): string {
  return html("爪爪更新说明", documentShell("更新说明", `
    <p>当前版本：${escapeHtml(config.releaseVersion)}</p>
    <p>${escapeHtml(config.releaseNotes || "最新 Windows 版本已准备好。")}</p>
    <p><a class="primary" href="${escapeHtml(config.downloadOrigin.replace(/\/+$/, ""))}/MiniPetSetup.exe">下载 Windows 版</a></p>
  `));
}

function simpleSections(): string {
  return `
    <section class="section-grid">
      <article class="panel"><h2>系统要求</h2><p>推荐 Windows 10 或 Windows 11。安装前请确认电脑可以正常联网。</p></article>
      <article class="panel"><h2>安装说明</h2><p>下载、双击安装、启动后点击桌宠即可开始聊天。</p></article>
      <article class="panel"><h2>安全说明</h2><p>重要操作先确认，个人信息按必要范围处理。隐私与协议请见页面底部链接。</p></article>
    </section>
    <footer><span>MiniPet 项目组</span><a href="/privacy">隐私政策</a><a href="/terms">用户协议</a><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></footer>
  `;
}

function documentShell(title: string, body: string): string {
  return `
    <main class="document">
      <p class="eyebrow">爪爪 MiniPet</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="note">生效日期：2026 年 5 月 13 日</p>
      ${body}
      <p><a href="/">返回首页</a></p>
    </main>
  `;
}

function html(title: string, body: string): string {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="icon" type="image/png" href="/favicon.png" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root { color-scheme: light; font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif; color: #233146; background: #f7fbff; }
        body { margin: 0; min-height: 100vh; background: linear-gradient(145deg, #dff0ff 0%, #fffaf0 58%, #f7fbff 100%); }
        .hero { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 340px; align-items: center; gap: 56px; max-width: 1120px; margin: 0 auto; padding: 48px 28px; }
        .eyebrow { color: #4e9b76; font-weight: 800; }
        .server-brand { display: inline-flex; align-items: center; gap: 10px; margin-bottom: 18px; font-weight: 800; }
        .server-brand img { width: 38px; height: 38px; object-fit: contain; }
        h1 { font-size: 64px; line-height: 1.08; margin: 0 0 22px; letter-spacing: 0; }
        h2 { margin: 0 0 12px; }
        .lead, p { line-height: 1.75; color: #53667c; }
        .actions, footer { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
        a, button { border-radius: 8px; padding: 10px 15px; border: 1px solid rgba(94,75,118,.16); text-decoration: none; cursor: pointer; color: #21649f; background: rgba(255,255,255,.78); }
        .primary, button { background: #3b82c4; color: #fff; font-weight: 800; border: 0; }
        .secondary { color: #233146; }
        .note { color: #66768a; }
        .pet-card { display: grid; place-items: center; gap: 10px; }
        .pet-card img { width: 320px; max-width: 100%; filter: drop-shadow(0 22px 32px rgba(83,57,102,.18)); }
        .bubble, .panel, .document { background: rgba(255,255,255,.92); border: 1px solid rgba(94,75,118,.16); box-shadow: 0 18px 38px rgba(83,57,102,.12); border-radius: 8px; padding: 20px; }
        .section-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; max-width: 1120px; margin: 0 auto; padding: 0 28px 42px; }
        .document { max-width: 880px; margin: 36px auto; }
        .admin-shell { max-width: 1180px; margin: 0 auto; padding: 32px 20px; }
        label { display: grid; gap: 6px; margin: 12px 0; color: #66768a; }
        input { padding: 10px; border-radius: 8px; border: 1px solid rgba(94,75,118,.16); }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        th, td { padding: 10px; border-bottom: 1px solid rgba(94,75,118,.16); text-align: left; }
        .error { color: #c9435c; }
        footer { max-width: 1120px; margin: 0 auto; padding: 24px 28px 42px; }
        @media (max-width: 820px) { .hero, .section-grid { grid-template-columns: 1fr; } h1 { font-size: 44px; } .document { margin: 20px; } }
        @media (max-width: 480px) { h1 { font-size: 36px; } }
      </style>
    </head>
    <body>${body}</body>
  </html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
