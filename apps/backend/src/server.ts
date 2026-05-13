import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { hashPassword, readBearerToken, signToken, verifyPassword, verifyToken } from "./auth";
import type { BackendConfig } from "./config";
import { DEFAULT_DEVICE_QUOTA_TOKENS, loadBackendConfig, missingProductionConfig } from "./config";
import { chatWithNewApi, type ChatMessage } from "./newApiClient";
import { redactSensitive } from "./redact";
import { createStore, type AdminUserRecord, type MiniPetStore, type UserRecord, type UserStatus } from "./store";
import { estimateTokensFromMessages } from "./tokens";

type JsonRecord = Record<string, unknown>;

interface RequestContext {
  config: BackendConfig;
  store: MiniPetStore;
  jwtSecret: string;
  ipLimiter: FixedWindowLimiter;
}

interface BackendServer extends http.Server {
  ready: Promise<void>;
}

const DEVICE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;
const ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 12;
const ADMIN_ASSET_ROOT = path.resolve(process.cwd(), "apps/admin");
const WEBSITE_ASSET_ROOT = path.resolve(process.cwd(), "apps/website");

export async function createBackendServer(config: BackendConfig = loadBackendConfig()): Promise<BackendServer> {
  if (config.nodeEnv === "production" && !config.jwtSecret) throw new Error("JWT_SECRET is required in production");
  const store = createStore({ databaseUrl: config.databaseUrl, dataDir: config.dataDir });
  const jwtSecret = config.jwtSecret || crypto.randomBytes(32).toString("base64url");
  const context: RequestContext = {
    config,
    store,
    jwtSecret,
    ipLimiter: new FixedWindowLimiter(config.ipWindowMs)
  };
  const ready = (async () => {
    await store.init();
    await ensureConfiguredAdmin(store, config);
  })();
  const server = http.createServer((request, response) => {
    void ready.then(() => routeRequest(context, request, response)).catch((error) => {
      logError("server_ready_failed", error);
      sendJson(response, 500, { error: "server_not_ready" });
    });
  }) as BackendServer;
  server.ready = ready;
  return server;
}

export const createMiniPetServer = createBackendServer;

async function routeRequest(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  applyCors(context.config, response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", "http://127.0.0.1");
  const clientIp = getClientIp(request);
  if (url.pathname !== "/health" && !context.ipLimiter.take(clientIp, context.config.ipMaxRequests)) {
    sendJson(response, 429, { error: "rate_limited" });
    return;
  }

  try {
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) return await serveWebsiteAsset(response, "index.html");
    if (request.method === "GET" && url.pathname === "/website/app.js") return await serveWebsiteAsset(response, "app.js");
    if (request.method === "GET" && url.pathname === "/website/styles.css") return await serveWebsiteAsset(response, "styles.css");
    if (request.method === "GET" && ["/changelog", "/privacy", "/terms"].includes(url.pathname)) return await serveWebsiteAsset(response, "index.html");

    if (request.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/")) return await serveAdminAsset(response, "index.html");
    if (request.method === "GET" && url.pathname === "/admin/app.js") return await serveAdminAsset(response, "app.js");
    if (request.method === "GET" && url.pathname === "/admin/styles.css") return await serveAdminAsset(response, "styles.css");

    if (request.method === "GET" && url.pathname === "/health") return sendHealth(context, response);
    if (request.method === "POST" && url.pathname === "/v1/bootstrap") return await handleBootstrap(context, request, response);
    if (request.method === "GET" && url.pathname === "/v1/me") return await handleMe(context, request, response);
    if (request.method === "GET" && url.pathname === "/v1/me/quota") return await handleQuota(context, request, response);
    if (request.method === "POST" && url.pathname === "/v1/chat") return await handleChat(context, request, response);
    if (request.method === "GET" && url.pathname === "/v1/releases/latest") return await handleLatestRelease(context, response);

    if (request.method === "POST" && url.pathname === "/admin/login") return await handleAdminLogin(context, request, response);
    if (request.method === "GET" && url.pathname === "/admin/overview") return await handleAdminOverview(context, request, response);
    if (request.method === "GET" && url.pathname === "/admin/users") return await handleAdminUsers(context, request, response);
    if (request.method === "GET" && /^\/admin\/users\/[^/]+$/.test(url.pathname)) return await handleAdminUser(context, request, response, segment(url.pathname, 3));
    if (request.method === "PATCH" && /^\/admin\/users\/[^/]+\/quota$/.test(url.pathname)) return await handleAdminUserQuota(context, request, response, segment(url.pathname, 3));
    if (request.method === "POST" && /^\/admin\/users\/[^/]+\/reset-quota$/.test(url.pathname)) return await handleAdminResetQuota(context, request, response, segment(url.pathname, 3));
    if (request.method === "PATCH" && /^\/admin\/users\/[^/]+\/status$/.test(url.pathname)) return await handleAdminUserStatus(context, request, response, segment(url.pathname, 3));
    if (request.method === "GET" && url.pathname === "/admin/usage") return await handleAdminUsage(context, request, response);
    if (request.method === "GET" && url.pathname === "/admin/releases") return await handleAdminReleases(context, request, response);
    if (request.method === "POST" && url.pathname === "/admin/releases") return await handleAdminCreateRelease(context, request, response);
    if (request.method === "POST" && url.pathname === "/admin/releases/publish") return await handleReleaseWebhook(context, request, response);
    if (request.method === "GET" && url.pathname === "/admin/audit-logs") return await handleAdminAuditLogs(context, request, response);

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    logError("request_failed", { path: url.pathname, error });
    sendJson(response, 500, { error: "internal_error" });
  }
}

function sendHealth(context: RequestContext, response: http.ServerResponse): void {
  sendJson(response, 200, {
    ok: true,
    storage: context.config.databaseUrl ? "postgres" : "sqlite",
    modelConfigured: Boolean(context.config.newApiBaseUrl && context.config.newApiKey),
    missingProductionConfig: missingProductionConfig(context.config)
  });
}

async function handleBootstrap(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const body = await readJson(request);
  const deviceId = sanitizeDeviceId(asString(body.device_id) || asString(body.deviceId));
  const user = await context.store.bootstrapUser({ deviceId, displayName: "MiniPet Device" });
  await addAudit(context, "device", user.id, "bootstrap", user.id, {
    appVersion: asString(body.app_version) || asString(body.appVersion) || "",
    platform: asString(body.platform) || ""
  });
  sendJson(response, 200, {
    device: { id: user.deviceId },
    user: toPublicUser(user),
    token: signDeviceToken(context, user),
    quotaTokens: user.quotaTotalTokens,
    usedTokens: user.quotaUsedTokens,
    quotaRemaining: quotaRemaining(user),
    defaultQuotaTokens: DEFAULT_DEVICE_QUOTA_TOKENS
  });
}

async function handleMe(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const user = await requireDeviceUser(context, request, response);
  if (!user) return;
  sendJson(response, 200, { user: toPublicUser(user) });
}

async function handleQuota(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const user = await requireDeviceUser(context, request, response);
  if (!user) return;
  sendJson(response, 200, quotaPayload(user));
}

async function handleChat(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const user = await requireDeviceUser(context, request, response);
  if (!user) return;
  if (user.status === "disabled") {
    sendJson(response, 403, { error: "user_disabled" });
    return;
  }
  if (!context.config.newApiBaseUrl || !context.config.newApiKey) {
    sendJson(response, 503, { error: "model_backend_not_configured" });
    return;
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const requestCount = await context.store.countUsageSince(user.id, todayStart);
  if (requestCount >= context.config.deviceDailyRequestLimit) {
    sendJson(response, 429, { error: "device_daily_limit_reached" });
    return;
  }

  const body = await readJson(request);
  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    sendJson(response, 400, { error: "messages_required" });
    return;
  }
  const allText = messages.map((message) => message.content).join("\n");
  const blockedWord = findWord(allText, context.config.blockedWords);
  if (blockedWord) {
    await addAudit(context, "device", user.id, "content_blocked", user.id, { blockedWord });
    sendJson(response, 400, { error: "content_blocked", message: "The request contains blocked content." });
    return;
  }
  const promptEstimate = estimateTokensFromMessages(messages);
  if (quotaRemaining(user) <= Math.max(1, promptEstimate)) {
    sendJson(response, 402, { error: "quota_exhausted", quota: quotaPayload(user) });
    return;
  }

  const requestId = asString(body.request_id) || asString(body.requestId) || `req_${crypto.randomUUID()}`;
  try {
    const result = await chatWithNewApi({
      baseUrl: context.config.newApiBaseUrl,
      apiKey: context.config.newApiKey,
      model: asString(body.model) || context.config.newApiDefaultModel,
      messages
    });
    await context.store.recordUsage({
      userId: user.id,
      requestId,
      provider: "newapi",
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
      estimatedCost: 0,
      status: "success",
      estimated: result.estimated
    });
    const updated = (await context.store.getUser(user.id)) || user;
    sendJson(response, 200, {
      text: result.text,
      model: result.model,
      requestId,
      usage: {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        estimated: result.estimated
      },
      quotaRemaining: quotaRemaining(updated),
      safety: highRiskPayload(allText, context.config.highRiskWords)
    });
  } catch (error) {
    await context.store.recordUsage({
      userId: user.id,
      requestId,
      provider: "newapi",
      model: context.config.newApiDefaultModel,
      promptTokens: promptEstimate,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      status: "upstream_error",
      estimated: true
    });
    logError("newapi_request_failed", error);
    sendJson(response, 502, { error: "model_backend_error" });
  }
}

async function handleLatestRelease(context: RequestContext, response: http.ServerResponse): Promise<void> {
  const release = await context.store.latestRelease("stable");
  sendJson(response, 200, releaseToPayload(release, context.config));
}

async function handleAdminLogin(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const body = await readJson(request);
  const email = asString(body.email).toLowerCase();
  const password = asString(body.password);
  const admin = email ? await context.store.getAdminByEmail(email) : undefined;
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    await addAudit(context, "admin", "anonymous", "admin_login_failed", email || "unknown", {});
    sendJson(response, 401, { error: "invalid_credentials" });
    return;
  }
  await addAudit(context, "admin", admin.id, "admin_login", admin.id, {});
  sendJson(response, 200, {
    token: signAdminToken(context, admin),
    admin: { id: admin.id, email: admin.email, role: admin.role }
  });
}

async function handleAdminOverview(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  sendJson(response, 200, { ...(await context.store.overview()), defaultQuotaTokens: DEFAULT_DEVICE_QUOTA_TOKENS });
}

async function handleAdminUsers(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  sendJson(response, 200, { users: (await context.store.listUsers()).map(toPublicUser) });
}

async function handleAdminUser(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse, id: string): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  const user = await context.store.getUser(id);
  if (!user) return sendJson(response, 404, { error: "user_not_found" });
  const usage = (await context.store.listUsage()).filter((entry) => entry.userId === id);
  sendJson(response, 200, { user: toPublicUser(user), usage, recentRequests: usage.slice(0, 20) });
}

async function handleAdminUserQuota(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse, id: string): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  const body = await readJson(request);
  const quota = Number(body.quota_total_tokens ?? body.quotaTotalTokens ?? body.quota);
  if (!Number.isFinite(quota) || quota < 0) return sendJson(response, 400, { error: "invalid_quota" });
  const user = await context.store.updateUserQuota(id, quota);
  if (!user) return sendJson(response, 404, { error: "user_not_found" });
  await addAudit(context, "admin", admin.id, "user_quota_updated", id, { quotaTotalTokens: user.quotaTotalTokens });
  sendJson(response, 200, { user: toPublicUser(user) });
}

async function handleAdminResetQuota(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse, id: string): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  const user = await context.store.resetUserMonthlyUsage(id);
  if (!user) return sendJson(response, 404, { error: "user_not_found" });
  await addAudit(context, "admin", admin.id, "user_quota_reset", id, { quotaUsedTokens: user.quotaUsedTokens });
  sendJson(response, 200, { user: toPublicUser(user) });
}

async function handleAdminUserStatus(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse, id: string): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  const body = await readJson(request);
  const status = asString(body.status);
  if (status !== "active" && status !== "disabled") return sendJson(response, 400, { error: "invalid_status" });
  const user = await context.store.updateUserStatus(id, status as UserStatus);
  if (!user) return sendJson(response, 404, { error: "user_not_found" });
  await addAudit(context, "admin", admin.id, "user_status_updated", id, { status: user.status });
  sendJson(response, 200, { user: toPublicUser(user) });
}

async function handleAdminUsage(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  sendJson(response, 200, { usage: await context.store.listUsage() });
}

async function handleAdminReleases(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  sendJson(response, 200, { releases: await context.store.listReleases() });
}

async function handleAdminCreateRelease(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  const body = await readJson(request);
  const version = asString(body.version);
  const installerUrl = asString(body.installer_url) || asString(body.installerUrl);
  if (!version || !installerUrl) return sendJson(response, 400, { error: "version_and_installer_url_required" });
  const release = await context.store.createRelease({
    version,
    channel: asString(body.channel) || "stable",
    installerUrl,
    portableUrl: asString(body.portable_url) || asString(body.portableUrl) || undefined,
    sha256: asString(body.sha256) || undefined,
    size: Number.isFinite(Number(body.size)) ? Number(body.size) : undefined,
    notes: asString(body.notes) || ""
  });
  await addAudit(context, "admin", admin.id, "release_created", release.id, { version: release.version, channel: release.channel });
  sendJson(response, 201, { release });
}

async function handleReleaseWebhook(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  if (!context.config.releaseWebhookSecret) {
    sendJson(response, 503, { error: "release_webhook_not_configured" });
    return;
  }
  const token = readBearerToken(request.headers.authorization);
  if (!token || !timingSafeStringEqual(token, context.config.releaseWebhookSecret)) {
    sendJson(response, 401, { error: "release_webhook_unauthorized" });
    return;
  }
  const body = await readJson(request);
  const version = asString(body.version);
  const installerUrl = asString(body.installer_url) || asString(body.installerUrl);
  if (!version || !installerUrl) return sendJson(response, 400, { error: "version_and_installer_url_required" });
  const release = await context.store.createRelease({
    version,
    channel: asString(body.channel) || "stable",
    installerUrl,
    portableUrl: asString(body.portable_url) || asString(body.portableUrl) || undefined,
    sha256: asString(body.sha256) || undefined,
    size: Number.isFinite(Number(body.size)) ? Number(body.size) : undefined,
    notes: asString(body.release_notes) || asString(body.notes) || ""
  });
  await addAudit(context, "release_bot", "github_actions", "release_published", release.id, {
    version: release.version,
    channel: release.channel,
    installerUrl: release.installerUrl,
    sha256: release.sha256,
    size: release.size
  });
  sendJson(response, 201, { release });
}

async function handleAdminAuditLogs(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  const admin = await requireAdmin(context, request, response);
  if (!admin) return;
  sendJson(response, 200, { auditLogs: await context.store.listAuditLogs() });
}

async function requireDeviceUser(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<UserRecord | undefined> {
  const payload = verifyToken(readBearerToken(request.headers.authorization), context.jwtSecret, "device");
  if (!payload) {
    sendJson(response, 401, { error: "unauthorized" });
    return undefined;
  }
  const user = await context.store.getUser(payload.sub);
  if (!user) sendJson(response, 401, { error: "unauthorized" });
  return user;
}

async function requireAdmin(context: RequestContext, request: http.IncomingMessage, response: http.ServerResponse): Promise<AdminUserRecord | undefined> {
  const payload = verifyToken(readBearerToken(request.headers.authorization), context.jwtSecret, "admin");
  if (!payload) {
    sendJson(response, 401, { error: "admin_login_required" });
    return undefined;
  }
  const admin = await getConfiguredAdminById(context.store, context.config, payload.sub);
  if (!admin) sendJson(response, 401, { error: "admin_login_required" });
  return admin;
}

async function getConfiguredAdminById(store: MiniPetStore, config: BackendConfig, id: string): Promise<AdminUserRecord | undefined> {
  if (!config.adminEmail) return undefined;
  const admin = await store.getAdminByEmail(config.adminEmail.toLowerCase());
  return admin?.id === id ? admin : undefined;
}

async function ensureConfiguredAdmin(store: MiniPetStore, config: BackendConfig): Promise<void> {
  if (!config.adminEmail) return;
  const email = config.adminEmail.toLowerCase();
  const passwordHash = config.adminPasswordHash || (config.adminPassword ? hashPassword(config.adminPassword) : undefined);
  if (!passwordHash) return;
  await store.upsertAdmin({ email, passwordHash, role: "admin" });
}

function signDeviceToken(context: RequestContext, user: UserRecord): string {
  return signToken({ sub: user.id, kind: "device", exp: nowSeconds() + DEVICE_TOKEN_TTL_SECONDS }, context.jwtSecret);
}

function signAdminToken(context: RequestContext, admin: AdminUserRecord): string {
  return signToken({ sub: admin.id, kind: "admin", exp: nowSeconds() + ADMIN_TOKEN_TTL_SECONDS }, context.jwtSecret);
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return undefined;
      const record = entry as JsonRecord;
      const role = record.role === "system" || record.role === "assistant" ? record.role : "user";
      const content = asString(record.content).slice(0, 20_000);
      return content ? { role, content } : undefined;
    })
    .filter((message): message is ChatMessage => Boolean(message));
}

function highRiskPayload(text: string, words: string[]): { highRisk: boolean; message?: string } {
  const highRiskWord = findWord(text, words);
  return highRiskWord
    ? { highRisk: true, message: "This request may affect files, payments, messages, or external actions. MiniPet will ask before high-risk operations." }
    : { highRisk: false };
}

function findWord(text: string, words: string[]): string | undefined {
  const normalized = text.toLowerCase();
  return words.find((word) => word && normalized.includes(word.toLowerCase()));
}

function toPublicUser(user: UserRecord): JsonRecord {
  return {
    id: user.id,
    deviceId: user.deviceId,
    displayName: user.displayName,
    plan: user.plan,
    status: user.status,
    quotaTotalTokens: user.quotaTotalTokens,
    quotaUsedTokens: user.quotaUsedTokens,
    quotaRemaining: quotaRemaining(user),
    quotaPeriodStart: user.quotaPeriodStart,
    quotaPeriodEnd: user.quotaPeriodEnd,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSeenAt: user.lastSeenAt
  };
}

function quotaPayload(user: UserRecord): JsonRecord {
  return {
    quotaTokens: user.quotaTotalTokens,
    quotaTotalTokens: user.quotaTotalTokens,
    usedTokens: user.quotaUsedTokens,
    quotaUsedTokens: user.quotaUsedTokens,
    quotaRemaining: quotaRemaining(user),
    disabled: user.status === "disabled",
    quotaPeriodStart: user.quotaPeriodStart,
    quotaPeriodEnd: user.quotaPeriodEnd
  };
}

function quotaRemaining(user: UserRecord): number {
  return Math.max(0, user.quotaTotalTokens - user.quotaUsedTokens);
}

function releaseToPayload(release: Awaited<ReturnType<MiniPetStore["latestRelease"]>>, config: BackendConfig): JsonRecord {
  const installerUrl = release?.installerUrl || `${config.downloadOrigin.replace(/\/+$/, "")}/latest/MiniPetSetup.exe`;
  return {
    version: release?.version || config.releaseVersion,
    channel: release?.channel || "stable",
    installerUrl,
    downloadUrl: installerUrl,
    portableUrl: release?.portableUrl,
    sha256: release?.sha256,
    size: release?.size,
    release_notes: release?.notes || config.releaseNotes,
    notes: release?.notes || config.releaseNotes,
    published_at: release?.createdAt
  };
}

async function readJson(request: http.IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonRecord;
}

async function serveAdminAsset(response: http.ServerResponse, fileName: "index.html" | "app.js" | "styles.css"): Promise<void> {
  return serveStaticAsset(response, ADMIN_ASSET_ROOT, fileName);
}

async function serveWebsiteAsset(response: http.ServerResponse, fileName: "index.html" | "app.js" | "styles.css"): Promise<void> {
  return serveStaticAsset(response, WEBSITE_ASSET_ROOT, fileName);
}

async function serveStaticAsset(response: http.ServerResponse, root: string, fileName: "index.html" | "app.js" | "styles.css"): Promise<void> {
  const filePath = path.join(root, fileName);
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType(fileName) });
    response.end(content);
  } catch {
    sendJson(response, 500, { error: "static_asset_not_found" });
  }
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function contentType(fileName: string): string {
  if (fileName.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (fileName.endsWith(".css")) return "text/css; charset=utf-8";
  return "text/html; charset=utf-8";
}

function applyCors(config: BackendConfig, response: http.ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", config.webOrigin);
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
}

function sanitizeDeviceId(value?: string): string {
  const candidate = (value || "").trim();
  if (/^[A-Za-z0-9_.:-]{8,128}$/.test(candidate)) return candidate;
  return `mp_${crypto.randomBytes(16).toString("hex")}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function segment(pathname: string, index: number): string {
  return decodeURIComponent(pathname.split("/")[index] || "");
}

function getClientIp(request: http.IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || request.socket.remoteAddress || "unknown";
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function addAudit(context: RequestContext, actorType: string, actorId: string, action: string, target: string, metadata: JsonRecord): Promise<void> {
  await context.store.addAuditLog({ actorType, actorId, action, target, metadataJson: JSON.stringify(redactSensitive(metadata)) });
}

function logError(event: string, value: unknown): void {
  console.error(event, redactSensitive(value));
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly windowMs: number) {}

  take(key: string, max: number): boolean {
    const now = Date.now();
    const hit = this.hits.get(key);
    if (!hit || hit.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (hit.count >= max) return false;
    hit.count += 1;
    return true;
  }
}
