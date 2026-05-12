import crypto from "node:crypto";
import fs from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { readBearerToken, signToken, verifyPassword, verifyToken } from "./auth";
import { DEFAULT_DEVICE_QUOTA_TOKENS, loadServerConfig, missingProductionConfig, type ServerConfig } from "./config";
import { chatWithNewApi, type ChatMessage } from "./newApiClient";
import { adminPage, landingPage } from "./pages";
import { createStore, type MiniPetStore } from "./store";
import { estimateTokensFromMessages } from "./tokens";

interface ServerContext {
  config: ServerConfig;
  store: MiniPetStore;
}

export async function createMiniPetServer(config = loadServerConfig()): Promise<http.Server> {
  const store = createStore({ databaseUrl: config.databaseUrl, dataDir: config.dataDir });
  await store.init();
  const context: ServerContext = { config, store };
  return http.createServer((request, response) => {
    void route(context, request, response).catch((error) => {
      console.error("request_failed", { path: request.url, message: error instanceof Error ? error.message : String(error) });
      json(response, 500, { error: "internal_error" });
    });
  });
}

async function route(context: ServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || "/", context.config.webOrigin);
  addCors(context.config, response);
  if (request.method === "OPTIONS") return empty(response, 204);
  if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true, missing: missingProductionConfig(context.config) });
  if (request.method === "GET" && url.pathname === "/") return html(response, landingPage(context.config));
  if (request.method === "GET" && url.pathname === "/admin") return html(response, adminPage());
  if (request.method === "GET" && url.pathname === "/assets/Idle_Welcome.png") return serveAsset(response, "design/one/Idle_Welcome.png");
  if (request.method === "GET" && url.pathname === "/download/MiniPetSetup.exe") {
    response.writeHead(302, { Location: `${context.config.downloadOrigin.replace(/\/+$/, "")}/MiniPetSetup.exe` });
    response.end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/device/register") return registerDevice(context, request, response);
  if (request.method === "GET" && url.pathname === "/api/me") return getMe(context, request, response);
  if (request.method === "POST" && url.pathname === "/api/chat") return chat(context, request, response);
  if (request.method === "POST" && url.pathname === "/api/admin/login") return adminLogin(context, request, response);
  if (request.method === "GET" && url.pathname === "/api/admin/devices") return adminListDevices(context, request, response);
  const match = /^\/api\/admin\/devices\/([^/]+)$/.exec(url.pathname);
  if (request.method === "PATCH" && match) return adminUpdateDevice(context, request, response, decodeURIComponent(match[1]));
  return json(response, 404, { error: "not_found" });
}

async function registerDevice(context: ServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson<{ deviceId?: string; appVersion?: string; platform?: string }>(request);
  const deviceId = sanitizeDeviceId(body.deviceId) || crypto.randomUUID();
  const device = await context.store.upsertDevice({ id: deviceId, appVersion: body.appVersion, platform: body.platform });
  return json(response, 200, {
    device,
    token: signDeviceToken(context.config, device.id),
    quotaRemaining: Math.max(0, device.quotaTokens - device.usedTokens),
    defaultQuotaTokens: DEFAULT_DEVICE_QUOTA_TOKENS
  });
}

async function getMe(context: ServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const device = await requireDevice(context, request);
  if (!device) return json(response, 401, { error: "unauthorized" });
  return json(response, 200, { device, quotaRemaining: Math.max(0, device.quotaTokens - device.usedTokens) });
}

async function chat(context: ServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const device = await requireDevice(context, request);
  if (!device) return json(response, 401, { error: "unauthorized" });
  if (device.disabled) return json(response, 403, { error: "device_disabled" });
  if (!context.config.newApiBaseUrl || !context.config.newApiKey) return json(response, 503, { error: "model_backend_not_configured" });

  const body = await readJson<{ messages?: ChatMessage[]; model?: string }>(request);
  const messages = normalizeMessages(body.messages);
  if (!messages.length) return json(response, 400, { error: "messages_required" });
  const estimatedPrompt = estimateTokensFromMessages(messages);
  if (device.usedTokens + estimatedPrompt >= device.quotaTokens) return json(response, 402, { error: "quota_exceeded", quotaRemaining: Math.max(0, device.quotaTokens - device.usedTokens) });

  const result = await chatWithNewApi({
    baseUrl: context.config.newApiBaseUrl,
    apiKey: context.config.newApiKey,
    model: body.model || context.config.newApiDefaultModel,
    messages
  });
  await context.store.recordUsage({
    deviceId: device.id,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens: result.totalTokens,
    model: result.model,
    upstreamStatus: result.upstreamStatus
  });
  const updated = await context.store.getDevice(device.id);
  return json(response, 200, {
    text: result.text,
    model: result.model,
    usage: {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens
    },
    quotaRemaining: updated ? Math.max(0, updated.quotaTokens - updated.usedTokens) : undefined
  });
}

async function adminLogin(context: ServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson<{ email?: string; password?: string }>(request);
  if (!context.config.adminEmail || (!context.config.adminPassword && !context.config.adminPasswordHash)) return json(response, 503, { error: "admin_not_configured" });
  const emailOk = body.email === context.config.adminEmail;
  const passwordOk = context.config.adminPasswordHash
    ? verifyPassword(body.password || "", context.config.adminPasswordHash)
    : body.password === context.config.adminPassword;
  if (!emailOk || !passwordOk) return json(response, 401, { error: "invalid_credentials" });
  return json(response, 200, { token: signAdminToken(context.config, context.config.adminEmail) });
}

async function adminListDevices(context: ServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!requireAdmin(context, request)) return json(response, 401, { error: "unauthorized" });
  const [devices, summary] = await Promise.all([context.store.listDevices(), context.store.getUsageSummary()]);
  return json(response, 200, { devices, summary });
}

async function adminUpdateDevice(context: ServerContext, request: IncomingMessage, response: ServerResponse, id: string): Promise<void> {
  if (!requireAdmin(context, request)) return json(response, 401, { error: "unauthorized" });
  const body = await readJson<{ quotaTokens?: number; disabled?: boolean }>(request);
  const device = await context.store.updateDevice(id, {
    quotaTokens: typeof body.quotaTokens === "number" ? body.quotaTokens : undefined,
    disabled: typeof body.disabled === "boolean" ? body.disabled : undefined
  });
  if (!device) return json(response, 404, { error: "device_not_found" });
  return json(response, 200, { device });
}

async function requireDevice(context: ServerContext, request: IncomingMessage) {
  const payload = verifyToken(readBearerToken(request.headers.authorization), getJwtSecret(context.config), "device");
  if (!payload) return undefined;
  return context.store.getDevice(payload.sub);
}

function requireAdmin(context: ServerContext, request: IncomingMessage): boolean {
  return Boolean(verifyToken(readBearerToken(request.headers.authorization), getJwtSecret(context.config), "admin"));
}

function signDeviceToken(config: ServerConfig, deviceId: string): string {
  return signToken({ sub: deviceId, kind: "device", exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 365 }, getJwtSecret(config));
}

function signAdminToken(config: ServerConfig, email: string): string {
  return signToken({ sub: email, kind: "admin", exp: Math.floor(Date.now() / 1000) + 3600 * 12 }, getJwtSecret(config));
}

function getJwtSecret(config: ServerConfig): string {
  return config.jwtSecret || "minipet-local-dev-secret-change-me";
}

function normalizeMessages(messages: ChatMessage[] | undefined): ChatMessage[] {
  return (messages || [])
    .filter((message) => ["system", "user", "assistant"].includes(message.role) && typeof message.content === "string")
    .map((message) => ({ role: message.role, content: message.content.slice(0, 16_000) }));
}

function sanitizeDeviceId(value: string | undefined): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]{8,128}$/.test(value) ? value : undefined;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function addCors(config: ServerConfig, response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", config.webOrigin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function html(response: ServerResponse, body: string): void {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(body);
}

function empty(response: ServerResponse, status: number): void {
  response.writeHead(status);
  response.end();
}

async function serveAsset(response: ServerResponse, relativePath: string): Promise<void> {
  const file = await fs.readFile(path.resolve(relativePath));
  response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
  response.end(file);
}
