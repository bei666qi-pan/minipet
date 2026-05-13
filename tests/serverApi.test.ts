import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BackendConfig } from "../apps/backend/src/config";
import { createBackendServer } from "../apps/backend/src/server";

const servers: http.Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

describe("MiniPet backend API", () => {
  it("bootstraps anonymous devices, exposes quota, releases, health, and guarded chat", async () => {
    const { base } = await startBackend({
      releaseVersion: "9.9.9",
      releaseNotes: "test release"
    });

    const healthResponse = await fetch(`${base}/health`);
    await expect(healthResponse.json()).resolves.toMatchObject({ ok: true, storage: "sqlite" });

    const bootstrapResponse = await postJson(`${base}/v1/bootstrap`, {
      device_id: "mp_1234567890abcdef1234567890abcdef",
      app_version: "0.1.0",
      platform: "win32"
    });
    expect(bootstrapResponse.status).toBe(200);
    const bootstrap = (await bootstrapResponse.json()) as { token: string; quotaRemaining: number; device: { id: string } };
    expect(bootstrap.device.id).toBe("mp_1234567890abcdef1234567890abcdef");
    expect(bootstrap.quotaRemaining).toBe(2_000_000);

    const meResponse = await fetch(`${base}/v1/me`, { headers: { Authorization: `Bearer ${bootstrap.token}` } });
    await expect(meResponse.json()).resolves.toMatchObject({ user: { deviceId: "mp_1234567890abcdef1234567890abcdef" } });

    const quotaResponse = await fetch(`${base}/v1/me/quota`, { headers: { Authorization: `Bearer ${bootstrap.token}` } });
    expect(quotaResponse.status).toBe(200);
    await expect(quotaResponse.json()).resolves.toMatchObject({ quotaTokens: 2_000_000, usedTokens: 0, disabled: false });

    const releaseResponse = await fetch(`${base}/v1/releases/latest`);
    await expect(releaseResponse.json()).resolves.toMatchObject({
      version: "9.9.9",
      downloadUrl: "https://download.minipet.versecraft.cn/latest/MiniPetSetup.exe"
    });

    const chatResponse = await postJson(
      `${base}/v1/chat`,
      { messages: [{ role: "user", content: "hello" }] },
      { Authorization: `Bearer ${bootstrap.token}` }
    );
    expect(chatResponse.status).toBe(503);
    await expect(chatResponse.json()).resolves.toMatchObject({ error: "model_backend_not_configured" });
  });

  it("proxies hosted chat through NewAPI and records upstream usage", async () => {
    const upstream = await startUpstream({
      model: "mock-model",
      text: "hello from MiniPet",
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
    });
    const { base } = await startBackend({
      newApiBaseUrl: upstream.base,
      newApiKey: "fixture-value",
      newApiDefaultModel: "mock-model"
    });

    const bootstrap = await bootstrapDevice(base, "mp_abcdefabcdefabcdefabcdefabcdef12");
    const chatResponse = await postJson(
      `${base}/v1/chat`,
      { messages: [{ role: "user", content: "hello" }] },
      { Authorization: `Bearer ${bootstrap.token}` }
    );
    expect(chatResponse.status).toBe(200);
    await expect(chatResponse.json()).resolves.toMatchObject({
      text: "hello from MiniPet",
      model: "mock-model",
      usage: { totalTokens: 18, estimated: false },
      quotaRemaining: 1_999_982
    });

    const quotaResponse = await fetch(`${base}/v1/me/quota`, { headers: { Authorization: `Bearer ${bootstrap.token}` } });
    await expect(quotaResponse.json()).resolves.toMatchObject({ usedTokens: 18, quotaRemaining: 1_999_982 });
  });

  it("estimates usage when NewAPI omits usage fields", async () => {
    const upstream = await startUpstream({ model: "mock-model", text: "estimated reply" });
    const { base } = await startBackend({
      newApiBaseUrl: upstream.base,
      newApiKey: "fixture-value",
      newApiDefaultModel: "mock-model"
    });
    const bootstrap = await bootstrapDevice(base, "mp_estimatedusage000000000000000000");

    const chatResponse = await postJson(
      `${base}/v1/chat`,
      { messages: [{ role: "user", content: "hello without usage" }] },
      { Authorization: `Bearer ${bootstrap.token}` }
    );
    expect(chatResponse.status).toBe(200);
    const chat = (await chatResponse.json()) as { usage: { totalTokens: number; estimated: boolean }; quotaRemaining: number };
    expect(chat.usage.estimated).toBe(true);
    expect(chat.usage.totalTokens).toBeGreaterThan(0);
    expect(chat.quotaRemaining).toBe(2_000_000 - chat.usage.totalTokens);
  });

  it("lets admins adjust quota, create releases, inspect usage, and disable chat", async () => {
    const upstream = await startUpstream({
      model: "mock-model",
      text: "admin test reply",
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
    });
    const { base } = await startBackend({
      newApiBaseUrl: upstream.base,
      newApiKey: "fixture-value",
      newApiDefaultModel: "mock-model",
      adminEmail: "admin@example.com",
      adminPassword: "local-pass"
    });
    const bootstrap = await bootstrapDevice(base, "mp_adminquota0000000000000000000000");

    const chatResponse = await postJson(
      `${base}/v1/chat`,
      { messages: [{ role: "user", content: "hello admin" }] },
      { Authorization: `Bearer ${bootstrap.token}` }
    );
    expect(chatResponse.status).toBe(200);

    const loginResponse = await postJson(`${base}/admin/login`, { email: "admin@example.com", password: "local-pass" });
    expect(loginResponse.status).toBe(200);
    const login = (await loginResponse.json()) as { token: string };
    const adminHeaders = { Authorization: `Bearer ${login.token}` };

    const usersResponse = await fetch(`${base}/admin/users`, { headers: adminHeaders });
    const users = (await usersResponse.json()) as { users: Array<{ id: string }> };
    expect(users.users.length).toBe(1);
    const userId = users.users[0].id;

    await expect(fetch(`${base}/admin/overview`, { headers: adminHeaders }).then((response) => response.json())).resolves.toMatchObject({ totalUsers: 1, totalRequests: 1 });
    await expect(fetch(`${base}/admin/overview`, { headers: adminHeaders }).then((response) => response.json())).resolves.toMatchObject({
      todayNewUsers: 1,
      todayRequests: 1,
      todayTokens: 10,
      defaultQuotaTokens: 2_000_000
    });
    await expect(fetch(`${base}/admin/users/${userId}`, { headers: adminHeaders }).then((response) => response.json())).resolves.toMatchObject({ user: { id: userId } });
    await expect(fetch(`${base}/admin/usage`, { headers: adminHeaders }).then((response) => response.json())).resolves.toMatchObject({ usage: [{ totalTokens: 10 }] });

    const quota100k = await patchJson(`${base}/admin/users/${userId}/quota`, { quota_total_tokens: 100_000 }, adminHeaders);
    await expect(quota100k.json()).resolves.toMatchObject({ user: { quotaTotalTokens: 100_000 } });
    const quota5m = await patchJson(`${base}/admin/users/${userId}/quota`, { quota_total_tokens: 5_000_000 }, adminHeaders);
    await expect(quota5m.json()).resolves.toMatchObject({ user: { quotaTotalTokens: 5_000_000 } });
    const resetQuota = await postJson(`${base}/admin/users/${userId}/reset-quota`, {}, adminHeaders);
    await expect(resetQuota.json()).resolves.toMatchObject({ user: { quotaUsedTokens: 0 } });

    const releaseResponse = await postJson(
      `${base}/admin/releases`,
      { version: "1.2.3", channel: "stable", installer_url: "https://download.minipet.versecraft.cn/MiniPetSetup.exe", notes: "release notes" },
      adminHeaders
    );
    expect(releaseResponse.status).toBe(201);
    await expect(fetch(`${base}/admin/releases`, { headers: adminHeaders }).then((response) => response.json())).resolves.toMatchObject({ releases: [{ version: "1.2.3" }] });

    const disabled = await patchJson(`${base}/admin/users/${userId}/status`, { status: "disabled" }, adminHeaders);
    await expect(disabled.json()).resolves.toMatchObject({ user: { status: "disabled" } });
    const blockedChat = await postJson(
      `${base}/v1/chat`,
      { messages: [{ role: "user", content: "should fail" }] },
      { Authorization: `Bearer ${bootstrap.token}` }
    );
    expect(blockedChat.status).toBe(403);
    await expect(fetch(`${base}/admin/audit-logs`, { headers: adminHeaders }).then((response) => response.json())).resolves.toMatchObject({ auditLogs: expect.any(Array) });
  });

  it("allows GitHub Actions to publish releases through a bearer webhook", async () => {
    const { base } = await startBackend({ releaseWebhookSecret: "release-fixture" });

    const unauthorized = await postJson(`${base}/admin/releases/publish`, {
      version: "2.0.0",
      channel: "stable",
      installer_url: "https://download.minipet.versecraft.cn/latest/MiniPetSetup.exe"
    });
    expect(unauthorized.status).toBe(401);

    const published = await postJson(
      `${base}/admin/releases/publish`,
      {
        version: "2.0.0",
        channel: "stable",
        installer_url: "https://download.minipet.versecraft.cn/latest/MiniPetSetup.exe",
        sha256: "abc123",
        size: 123456,
        release_notes: "release from workflow"
      },
      { Authorization: "Bearer release-fixture" }
    );
    expect(published.status).toBe(201);
    await expect(published.json()).resolves.toMatchObject({ release: { version: "2.0.0", sha256: "abc123", size: 123456, notes: "release from workflow" } });

    const latest = await fetch(`${base}/v1/releases/latest`);
    await expect(latest.json()).resolves.toMatchObject({
      version: "2.0.0",
      downloadUrl: "https://download.minipet.versecraft.cn/latest/MiniPetSetup.exe",
      sha256: "abc123",
      size: 123456,
      release_notes: "release from workflow"
    });
  });

  it("serves the browser admin console", async () => {
    const { base } = await startBackend({
      adminEmail: "admin@example.com",
      adminPassword: "local-pass"
    });
    const html = await fetch(`${base}/admin`);
    expect(html.status).toBe(200);
    await expect(html.text()).resolves.toContain("MiniPet Admin");

    const js = await fetch(`${base}/admin/app.js`);
    expect(js.status).toBe(200);
    const jsText = await js.text();
    expect(jsText).toContain("/admin/users");
    expect(jsText).toContain("账号暂不可用");

    const css = await fetch(`${base}/admin/styles.css`);
    expect(css.status).toBe(200);
    await expect(css.text()).resolves.toContain(".app-shell");
  });

  it("serves the public download website", async () => {
    const { base } = await startBackend({
      releaseVersion: "1.0.0",
      releaseNotes: "public website release"
    });
    const html = await fetch(`${base}/`);
    expect(html.status).toBe(200);
    const htmlText = await html.text();
    expect(htmlText).toContain("MiniPet");
    expect(htmlText).toContain("Windows 10 / Windows 11");
    expect(htmlText).toContain("默认不需要配置 API Key");
    expect(htmlText).toContain("隐私政策");
    expect(htmlText).toContain("用户协议");

    const js = await fetch(`${base}/website/app.js`);
    expect(js.status).toBe(200);
    const jsText = await js.text();
    expect(jsText).toContain("/v1/releases/latest");
    expect(jsText).toContain("https://download.minipet.versecraft.cn/latest/latest.json");
    expect(jsText).toContain("download.minipet.versecraft.cn");
    expect(jsText).toContain("sha256");
    expect(jsText).toContain("formatBytes");

    const css = await fetch(`${base}/website/styles.css`);
    expect(css.status).toBe(200);
    await expect(css.text()).resolves.toContain(".hero");
  });
});

async function startBackend(overrides: Partial<BackendConfig> = {}): Promise<{ base: string }> {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "minipet-api-"));
  const server = await createBackendServer({
    webOrigin: "http://127.0.0.1",
    apiOrigin: "http://127.0.0.1",
    downloadOrigin: "https://download.minipet.versecraft.cn",
    newApiDefaultModel: "test-model",
    jwtSecret: "local-signing-fixture",
    releaseVersion: "0.1.0",
    releaseNotes: "test release",
    blockedWords: [],
    highRiskWords: ["delete", "payment"],
    ipWindowMs: 60_000,
    ipMaxRequests: 200,
    deviceDailyRequestLimit: 100,
    port: 0,
    dataDir,
    nodeEnv: "test",
    ...overrides
  });
  await server.ready;
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return { base: `http://127.0.0.1:${address.port}` };
}

async function startUpstream(input: {
  model: string;
  text: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}): Promise<{ base: string }> {
  const upstream = http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ model: input.model, choices: [{ message: { content: input.text } }], usage: input.usage }));
  });
  servers.push(upstream);
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("upstream did not bind");
  return { base: `http://127.0.0.1:${address.port}` };
}

async function bootstrapDevice(base: string, deviceId: string): Promise<{ token: string }> {
  const response = await postJson(`${base}/v1/bootstrap`, { device_id: deviceId });
  expect(response.status).toBe(200);
  return (await response.json()) as { token: string };
}

function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

function patchJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}
