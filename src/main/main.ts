import { app, dialog, ipcMain, Menu, protocol, shell, type BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import path from "node:path";
import { AssetManager, readAssetBytes } from "./assetManager";
import { CapabilityRouter } from "./capabilities/CapabilityRouter";
import { MiniPetCloudClient } from "./cloud/MiniPetCloudClient";
import { ConfigStore } from "./configStore";
import { CoreManager } from "./core/CoreManager";
import { RuntimeInstaller } from "./core/RuntimeInstaller";
import { OpenAICompatibleClient } from "./llm/OpenAICompatibleClient";
import { ConversationContextManager, MINIPET_PERSONA_PROMPT } from "./memory/ConversationContextManager";
import { MemoryStore } from "./memory/MemoryStore";
import { OpenClawClient } from "./openclaw/OpenClawClient";
import { OpenClawMock } from "./openclaw/OpenClawMock";
import { OutputManager } from "./output/OutputManager";
import { PermissionGate } from "./permissions/PermissionGate";
import type { ActionType, AuthorizationChoice, PermissionContext, PermissionDecision, PermissionMode } from "./permissions/PermissionModes";
import { readAuditLog, redactSecrets } from "./security/auditLog";
import { assertTrustedSender, type IpcChannel } from "./security/ipcGuard";
import { validateExternalUrl } from "./security/urlGuard";
import { SecureStore, type SecretKey } from "./secureStore";
import { createTray, type TrayActions } from "./trayManager";
import { createFloatingBallWindow, createMainWindow, createSettingsWindow, clampFloatingBallPositionForDisplay } from "./windowManager";
import type { WindowPoint } from "./windowGeometry";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "minipet-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

const configStore = new ConfigStore();
const secureStore = new SecureStore();
const assetManager = new AssetManager();
const openClaw = new OpenClawClient();
const openClawMock = new OpenClawMock();
const permissionGate = new PermissionGate();
const llmClient = new OpenAICompatibleClient();
const runtimeInstaller = new RuntimeInstaller();
const coreManager = new CoreManager(runtimeInstaller, openClaw, configStore, secureStore, permissionGate);
const capabilityRouter = new CapabilityRouter();
const outputManager = new OutputManager();
const cloudClient = new MiniPetCloudClient(configStore, secureStore);
const memoryStore = new MemoryStore();
const contextManager = new ConversationContextManager(memoryStore);

let mainWindow: BrowserWindow | undefined;
let settingsWindow: BrowserWindow | undefined;
let floatingBallWindow: BrowserWindow | undefined;
let mainTray: ReturnType<typeof createTray> | undefined;
let isQuitting = false;
let runtimePassThrough = false;
let floatingBallPassThrough = false;
let latestCloudStatus: { online: boolean; message?: string; quotaRemaining?: number } | undefined;

function handle(channel: IpcChannel, listener: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown> | unknown): void {
  ipcMain.handle(channel, async (event, payload) => {
    assertTrustedSender(event, [getMainWindow()?.webContents, getSettingsWindow()?.webContents, getFloatingBallWindow()?.webContents]);
    return listener(event, payload);
  });
}

app.whenReady().then(async () => {
  await configStore.load();
  await memoryStore.load();
  const settings = configStore.get();
  await assetManager.scan(settings.assetDirectory, settings.assetMapping);
  registerAssetProtocol();
  registerIpc();
  if (settings.lastDesktopSurface === "mainWindow") showMainWindow({ persist: false });
  else showFloatingBall({ persist: false });
  mainTray = createTray({
    show: showMainWindow,
    hide: hideMainWindow,
    toggle: toggleMainWindow,
    openSettings: showSettingsWindow,
    checkForUpdates: () => void checkForUpdates(true),
    hideFloatingBall,
    setAlwaysOnTop: (enabled) => {
      getMainWindow()?.setAlwaysOnTop(enabled);
      void configStore.update({ alwaysOnTop: enabled });
    },
    isAlwaysOnTop: () => getMainWindow()?.isAlwaysOnTop() ?? configStore.get().alwaysOnTop,
    quit: quitApp
  } satisfies TrayActions);
  openClaw.on("event", (event) => sendToRenderer("openclaw:event", redactSecrets(event)));
  openClaw.on("status", (status) => sendToRenderer("openclaw:status", redactSecrets(status)));
  coreManager.on("progress", (status) => sendToRenderer("core:progress", redactSecrets(status)));
  void bootstrapCloudSession();
  setTimeout(() => void checkForUpdates(true, true), 2500);
  if (settings.coreAutoStart) void coreManager.checkAndConnect();
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // The window normally hides to tray from its close handler. If a destroyed
  // window reaches this event, do not touch the stale BrowserWindow reference.
});

app.on("activate", () => {
  showMainWindow();
});

function isUsableWindow(window: BrowserWindow | undefined): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed());
}

function getMainWindow(): BrowserWindow | undefined {
  if (!isUsableWindow(mainWindow)) mainWindow = undefined;
  return mainWindow;
}

function getSettingsWindow(): BrowserWindow | undefined {
  if (!isUsableWindow(settingsWindow)) settingsWindow = undefined;
  return settingsWindow;
}

function getFloatingBallWindow(): BrowserWindow | undefined {
  if (!isUsableWindow(floatingBallWindow)) floatingBallWindow = undefined;
  return floatingBallWindow;
}

function getOrCreateMainWindow(): BrowserWindow {
  const existing = getMainWindow();
  if (existing) return existing;
  const window = createMainWindow();
  mainWindow = window;
  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideMainWindow();
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  return window;
}

function getOrCreateFloatingBallWindow(): BrowserWindow {
  const existing = getFloatingBallWindow();
  if (existing) return existing;
  const window = createFloatingBallWindow(configStore.get().floatingBallPosition);
  floatingBallWindow = window;
  window.on("closed", () => {
    if (floatingBallWindow === window) floatingBallWindow = undefined;
  });
  return window;
}

function getOrCreateSettingsWindow(): BrowserWindow {
  const existing = getSettingsWindow();
  if (existing) return existing;
  const window = createSettingsWindow();
  settingsWindow = window;
  window.on("closed", () => {
    if (settingsWindow === window) settingsWindow = undefined;
  });
  return window;
}

function showMainWindow(options: { persist?: boolean } = {}): void {
  const floatingBall = getFloatingBallWindow();
  if (floatingBall) {
    floatingBallPassThrough = false;
    floatingBall.setIgnoreMouseEvents(false);
    floatingBall.hide();
  }
  runtimePassThrough = false;
  const window = getOrCreateMainWindow();
  window.show();
  window.focus();
  applyMainWindowMousePolicy();
  if (options.persist !== false) void configStore.update({ lastDesktopSurface: "mainWindow" });
}

function showSettingsWindow(): void {
  const window = getOrCreateSettingsWindow();
  if (!window.isVisible()) window.show();
  window.focus();
}

function closeSettingsWindow(): void {
  const window = getSettingsWindow();
  if (window) window.close();
}

function hideMainWindow(): void {
  const window = getMainWindow();
  if (window) window.hide();
  showFloatingBall();
}

function hideFloatingBall(): void {
  const window = getFloatingBallWindow();
  floatingBallPassThrough = false;
  if (!window) return;
  window.setIgnoreMouseEvents(false);
  window.hide();
}

function showFloatingBall(options: { persist?: boolean } = {}): void {
  const window = getOrCreateFloatingBallWindow();
  const position = clampFloatingBallPositionForDisplay(configStore.get().floatingBallPosition ?? pointFromWindow(window));
  window.setPosition(position.x, position.y, false);
  floatingBallPassThrough = false;
  window.setIgnoreMouseEvents(false);
  if (!window.isVisible()) window.showInactive();
  window.setAlwaysOnTop(true, "screen-saver");
  window.moveTop();
  if (options.persist !== false || !configStore.get().floatingBallPosition) {
    void configStore.update({
      ...(options.persist !== false ? { lastDesktopSurface: "floatingBall" as const } : {}),
      floatingBallPosition: position
    });
  }
}

function pointFromWindow(window: BrowserWindow): WindowPoint {
  const [x, y] = window.getPosition();
  return { x, y };
}

function toggleMainWindow(): void {
  const window = getMainWindow();
  if (window?.isVisible()) hideMainWindow();
  else showMainWindow();
}

function openPetContextMenu(window?: BrowserWindow): void {
  const targetWindow = window && !window.isDestroyed() ? window : getMainWindow() ?? getFloatingBallWindow();
  if (!targetWindow) return;
  const hasVisibleFloatingBall = Boolean(getFloatingBallWindow()?.isVisible());
  const hasVisibleMainWindow = Boolean(getMainWindow()?.isVisible());
  Menu.buildFromTemplate([
    {
      label: "打开爪爪",
      enabled: !hasVisibleMainWindow,
      click: () => showMainWindow()
    },
    {
      label: "设置",
      click: showSettingsWindow
    },
    {
      label: "检查更新",
      click: () => void checkForUpdates(true)
    },
    {
      label: "收起到悬浮球",
      enabled: hasVisibleMainWindow,
      click: hideMainWindow
    },
    {
      label: "关闭悬浮球",
      enabled: hasVisibleFloatingBall,
      click: hideFloatingBall
    },
    { type: "separator" },
    {
      label: "退出爪爪",
      click: quitApp
    }
  ]).popup({ window: targetWindow });
}

function quitApp(): void {
  isQuitting = true;
  app.quit();
}

function windowForSender(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  for (const window of [getMainWindow(), getSettingsWindow(), getFloatingBallWindow()]) {
    if (window && !window.webContents.isDestroyed() && window.webContents.id === event.sender.id) return window;
  }
  return undefined;
}

function applyMainWindowMousePolicy(): void {
  const window = getMainWindow();
  if (!window) return;
  const settings = configStore.get();
  window.setIgnoreMouseEvents(Boolean(settings.clickThrough || runtimePassThrough), { forward: true });
}

function applyFloatingBallMousePolicy(): void {
  const window = getFloatingBallWindow();
  if (!window) return;
  window.setIgnoreMouseEvents(floatingBallPassThrough, { forward: true });
}

function sendToRenderer(channel: "openclaw:event" | "openclaw:status" | "core:progress" | "cloud:status", payload: unknown): void {
  const window = getMainWindow();
  if (!window || window.webContents.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

async function bootstrapCloudSession(): Promise<void> {
  try {
    if (configStore.get().aiMode !== "cloud") return;
    const result = await cloudClient.bootstrap(app.getVersion());
    latestCloudStatus = { online: true, quotaRemaining: result.quotaRemaining };
  } catch {
    latestCloudStatus = { online: false, message: "当前网络异常，稍后再试" };
  }
  sendToRenderer("cloud:status", latestCloudStatus);
}

async function checkForUpdates(showDialog: boolean, notifyOnlyWhenUpdate = false): Promise<unknown> {
  try {
    const release = await cloudClient.getLatestRelease();
    const current = app.getVersion();
    const hasUpdate = release.version !== current;
    if (showDialog && (!notifyOnlyWhenUpdate || hasUpdate)) {
      const options = {
        type: hasUpdate ? "info" : "none",
        title: "爪爪更新",
        message: hasUpdate ? `发现新版本 ${release.version}` : "当前已是最新版本",
        detail: hasUpdate ? release.notes || "可以前往下载最新版安装包。" : `当前版本：${current}`,
        buttons: hasUpdate ? ["下载", "稍后"] : ["知道了"],
        defaultId: 0,
        cancelId: hasUpdate ? 1 : 0
      } as const;
      const parent = getMainWindow();
      const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
      if (hasUpdate && result.response === 0) await shell.openExternal(release.downloadUrl);
    }
    return { current, latest: release, hasUpdate };
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法检查更新。";
    if (showDialog) {
      const parent = getMainWindow();
      const options = { type: "warning", title: "爪爪更新", message } as const;
      if (parent) await dialog.showMessageBox(parent, options);
      else await dialog.showMessageBox(options);
    }
    return { error: message };
  }
}

function registerAssetProtocol(): void {
  protocol.handle("minipet-asset", async (request) => {
    const url = new URL(request.url);
    const id = url.pathname.replace(/^\/+/, "");
    const asset = await readAssetBytes(assetManager, id);
    if (!asset) return new Response("not found", { status: 404 });
    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        "Content-Type": asset.mime,
        "Cache-Control": "no-store"
      }
    });
  });
}

interface AuthorizationPayload {
  confirmed?: boolean;
  authorizationScope?: AuthorizationChoice;
}

async function permissionModeForScope(current: PermissionMode, scope?: AuthorizationChoice): Promise<PermissionMode> {
  if (scope !== "switch_assisted") return current;
  await configStore.update({ permissionMode: "assisted" });
  return "assisted";
}

function permissionNeedsUser(decision: PermissionDecision, request: AuthorizationPayload): boolean {
  if (decision.allowed) return decision.requireConfirmation && !request.confirmed;
  return Boolean(decision.requestable && !request.authorizationScope);
}

function permissionDenied(decision: PermissionDecision, request: AuthorizationPayload): boolean {
  return !decision.allowed && !decision.requestable;
}

function userPermissionMessage(decision: PermissionDecision): string {
  if (decision.requestable) return "这一步需要你点头后，我再继续。";
  if (decision.risk === "critical" || decision.risk === "high") return "这件事可能不安全，爪爪不能直接做。";
  return "这件事现在还不能直接做。";
}

async function buildCompanionMessages(currentUserText: string) {
  const settings = configStore.get();
  if (!settings.memoryEnabled) {
    return [
      { role: "system" as const, content: MINIPET_PERSONA_PROMPT },
      { role: "user" as const, content: currentUserText }
    ];
  }
  return contextManager.buildMessages({ currentUserText });
}

async function maybeRememberExchange(userText: string, assistantText: string): Promise<void> {
  const settings = configStore.get();
  if (!settings.memoryEnabled) return;
  await contextManager.recordExchange(userText, assistantText, {
    memoryEnabled: settings.memoryEnabled,
    autoExtractEnabled: settings.memoryAutoExtractEnabled,
    useModelCompression: settings.memoryUseModelCompression,
    summarize: settings.memoryUseModelCompression ? summarizeWithCurrentModel : undefined
  });
}

async function summarizeWithCurrentModel(prompt: string): Promise<string> {
  const settings = configStore.get();
  const messages = [
    { role: "system" as const, content: "你是爪爪的本地上下文压缩器。只输出摘要，不输出解释。" },
    { role: "user" as const, content: prompt }
  ];
  if (settings.aiMode === "cloud") {
    return (await cloudClient.chat(messages, app.getVersion())).text;
  }
  const apiKey = await secureStore.getSecret("openaiApiKey");
  if (!apiKey) throw new Error("missing_api_key");
  return (
    await llmClient.chat(
      {
        baseUrl: settings.openAIBaseUrl,
        apiKey,
        model: settings.openAIModel
      },
      messages
    )
  ).text;
}

function registerIpc(): void {
  handle("app:get-state", async () => ({
    settings: configStore.get(),
    secrets: await secureStore.status(),
    assets: assetManager.getManifest(),
    openClaw: openClaw.status(true),
    core: coreManager.status(),
    cloudStatus: latestCloudStatus,
    audit: await readAuditLog(80)
  }));

  handle("app:update-settings", async (_event, payload) => {
    const patch = (payload ?? {}) as Record<string, unknown>;
    const next = await configStore.update(patch);
    if (patch.assetDirectory || patch.assetMapping) await assetManager.scan(next.assetDirectory, next.assetMapping);
    const window = getMainWindow();
    if (window && typeof patch.alwaysOnTop === "boolean") window.setAlwaysOnTop(patch.alwaysOnTop);
    if (window && typeof patch.clickThrough === "boolean") applyMainWindowMousePolicy();
    return { settings: next, assets: assetManager.getManifest() };
  });

  handle("app:set-secret", async (_event, payload) => {
    const { key, value, persist } = payload as { key: SecretKey; value: string; persist?: boolean };
    if (!["openaiApiKey", "openclawToken", "cloudDeviceToken"].includes(key)) throw new Error("未知密钥类型。");
    return secureStore.setSecret(key, value, persist ?? true);
  });

  handle("app:clear-secret", async (_event, payload) => {
    const { key } = payload as { key: SecretKey };
    await secureStore.clearSecret(key);
    return secureStore.status();
  });

  handle("app:open-external", async (_event, payload) => {
    const { url, confirmed, authorizationScope } = payload as { url: string } & AuthorizationPayload;
    const result = validateExternalUrl(url);
    if (!result.ok || !result.normalized) return result;
    const settings = configStore.get();
    const mode = await permissionModeForScope(settings.permissionMode, authorizationScope);
    const decision = permissionGate.evaluate({
      mode,
      actionType: "open_url",
      method: "shell.openExternal",
      prompt: result.normalized,
      urls: [result.normalized],
      adminAdvanced: settings.adminAdvanced
    });
    if (permissionDenied(decision, { confirmed, authorizationScope })) return { ...result, permission: decision, requiresConfirmation: false, error: userPermissionMessage(decision) };
    if (permissionNeedsUser(decision, { confirmed, authorizationScope })) return { ...result, permission: decision, requiresConfirmation: true, error: userPermissionMessage(decision) };
    await shell.openExternal(result.normalized);
    return { ...result, permission: decision };
  });

  handle("app:check-update", async () => checkForUpdates(false));

  handle("asset:scan", async (_event, payload) => {
    const directory = typeof payload === "object" && payload ? String((payload as { directory?: string }).directory ?? configStore.get().assetDirectory) : configStore.get().assetDirectory;
    const manifest = await assetManager.scan(directory, configStore.get().assetMapping);
    await configStore.update({ assetDirectory: manifest.directory });
    return manifest;
  });

  handle("asset:set-directory", async (_event, payload) => {
    const { directory } = payload as { directory: string };
    const next = await configStore.update({ assetDirectory: directory });
    return assetManager.scan(next.assetDirectory, next.assetMapping);
  });

  handle("openclaw:connect", async () => {
    await coreManager.checkAndConnect();
    const status = openClaw.status(true);
    sendToRenderer("openclaw:status", redactSecrets(status));
    return status;
  });

  handle("core:status", async () => coreManager.status());

  handle("core:ensure-ready", async (_event, payload) => {
    const { allowInstall } = (payload ?? {}) as { allowInstall?: boolean };
    const status = await coreManager.ensureReady({ allowInstall: Boolean(allowInstall) });
    sendToRenderer("core:progress", redactSecrets(status));
    return status;
  });

  handle("openclaw:disconnect", async () => {
    openClaw.disconnect();
    const status = openClaw.status(true);
    sendToRenderer("openclaw:status", status);
    return status;
  });

  handle("openclaw:request", async (_event, payload) => {
    const request = payload as {
      method: string;
      params?: unknown;
      actionType?: ActionType;
      prompt?: string;
      localRequestId?: string;
      confirmed?: boolean;
      authorizationScope?: AuthorizationChoice;
    };
    const settings = configStore.get();
    const mode = await permissionModeForScope(openClaw.status().connected ? settings.permissionMode : "demo", request.authorizationScope);
    const decision = permissionGate.evaluate({
      mode,
      actionType: request.actionType ?? "chat",
      method: request.method,
      prompt: request.prompt,
      adminAdvanced: settings.adminAdvanced
    });
    if (permissionDenied(decision, request)) return { permission: decision, error: userPermissionMessage(decision) };
    if (permissionNeedsUser(decision, request)) {
      return { permission: decision, requiresConfirmation: true, error: userPermissionMessage(decision) };
    }
    if (!openClaw.status().connected) {
      if (request.method === "chat.send") {
        return { permission: decision, result: await openClawMock.chat(request.params as never) };
      }
      return { permission: decision, error: "这件事需要先准备一下。你也可以先和爪爪普通聊天。" };
    }
    const result =
      request.method === "chat.send"
        ? await openClaw.chatSend(request.params as never)
        : await openClaw.request(request.method, request.params);
    return { permission: decision, result: redactSecrets(result) };
  });

  handle("llm:chat", async (_event, payload) => {
    const { messages } = payload as { messages: Array<{ role: "system" | "user" | "assistant"; content: string }> };
    const settings = configStore.get();
    const effectiveMessages = settings.memoryEnabled ? await contextManager.augmentMessages(messages) : messages;
    const decision = permissionGate.evaluate({
      mode: "demo",
      actionType: "chat",
      prompt: effectiveMessages.map((item) => item.content).join("\n")
    });
    if (!decision.allowed) return { permission: decision, error: userPermissionMessage(decision) };
    if (settings.aiMode === "cloud") {
      const result = await cloudClient.chat(effectiveMessages, app.getVersion());
      return { permission: decision, result: redactSecrets(result) };
    }
    const apiKey = await secureStore.getSecret("openaiApiKey");
    if (!apiKey) return { permission: decision, error: "需要先补一下聊天设置。" };
    const result = await llmClient.chat(
      {
        baseUrl: settings.openAIBaseUrl,
        apiKey,
        model: settings.openAIModel
      },
      effectiveMessages
    );
    return { permission: decision, result: redactSecrets(result) };
  });

  handle("llm:test-connection", async (_event, payload) => {
    const settings = configStore.get();
    const input = (payload ?? {}) as { apiKey?: string; baseUrl?: string; model?: string };
    const apiKey = input.apiKey || (await secureStore.getSecret("openaiApiKey"));
    return llmClient.testConnection({
      baseUrl: input.baseUrl || settings.openAIBaseUrl,
      model: input.model || settings.openAIModel,
      apiKey
    });
  });

  handle("memory:list", async () => memoryStore.list());

  handle("memory:delete", async (_event, payload) => {
    const { id } = payload as { id: string };
    return { deleted: await memoryStore.delete(id) };
  });

  handle("memory:clear", async () => {
    await memoryStore.clear();
    return { cleared: true };
  });

  handle("permission:authorize-turn", async (_event, payload) => {
    const { authorizationScope } = (payload ?? {}) as { authorizationScope?: AuthorizationChoice };
    if (authorizationScope === "switch_assisted") await configStore.update({ permissionMode: "assisted" });
    return { authorized: true, authorizationScope: authorizationScope ?? "turn", settings: configStore.get() };
  });

  handle("companion:run-task", async (_event, payload) => {
    const request = payload as {
      input: string;
      files?: string[];
      allowInstall?: boolean;
      confirmed?: boolean;
      authorizationScope?: AuthorizationChoice;
      localRequestId: string;
    };
    const settings = configStore.get();
    const route = capabilityRouter.route(request.input, request.files ?? []);
    if (route.missingQuestion) {
      return { route, needsMoreInput: true, question: route.missingQuestion };
    }

    if (route.needsCore) {
      const core = await coreManager.ensureReady({ allowInstall: Boolean(request.allowInstall) });
      if (core.needsAuthorization) return { route, needsCoreAuthorization: true, core };
      if (!core.connected) return { route, error: core.lastError || "这件事还没准备好，请稍后再试。" };
    }

    const permissionMode = await permissionModeForScope(settings.permissionMode, request.authorizationScope);
    const method = route.needsCore ? "chat.send" : route.actionType === "office_generate" ? "local.office.generate" : "local.chat";
    const decision = permissionGate.evaluate({
      mode: permissionMode,
      actionType: route.actionType,
      method,
      prompt: route.prompt,
      paths: request.files,
      urls: route.urls,
      userSelectedPaths: request.files,
      adminAdvanced: settings.adminAdvanced
    });
    if (permissionDenied(decision, request)) return { route, permission: decision, error: userPermissionMessage(decision) };
    if (permissionNeedsUser(decision, request)) {
      return { route, permission: decision, requiresConfirmation: true, error: userPermissionMessage(decision) };
    }

    let text = "";
    let openClawResult: unknown;
    if (route.actionType === "open_url" && route.urls?.[0]) {
      await shell.openExternal(route.urls[0]);
      text = `已经打开：${route.urls[0]}`;
    } else if (route.needsCore) {
      const content = settings.memoryEnabled ? await contextManager.buildPrompt(route.prompt, request.input) : route.prompt;
      const result = await openClaw.chatSend({
        content,
        sessionKey: settings.openClawSessionKey,
        localRequestId: request.localRequestId,
        model: settings.openAIModel
      });
      openClawResult = result;
      text = result.text || "我已经开始处理，后续进度会显示在记录里。";
    } else if (settings.aiMode === "cloud") {
      const result = await cloudClient.chat(await buildCompanionMessages(request.input), app.getVersion());
      text = result.text;
    } else if (settings.aiMode === "custom") {
      const apiKey = await secureStore.getSecret("openaiApiKey");
      if (!apiKey) return { route, needsModelAuthorization: true };
      const result = await llmClient.chat(
        {
          baseUrl: settings.openAIBaseUrl,
          apiKey,
          model: settings.openAIModel
        },
        await buildCompanionMessages(request.input)
      );
      text = result.text;
    }

    const outputs =
      route.output === "pptx"
        ? [await outputManager.createPptx({ title: route.title, body: text, outputDirectory: settings.outputDirectory })]
        : route.output === "docx"
          ? [await outputManager.createDocx({ title: route.title, body: text, outputDirectory: settings.outputDirectory })]
          : route.output === "xlsx"
            ? [await outputManager.createXlsx({ title: route.title, body: text, outputDirectory: settings.outputDirectory })]
            : route.output === "paper"
              ? await outputManager.createPaper({ title: route.title, body: text, outputDirectory: settings.outputDirectory })
              : route.output === "research"
                ? await outputManager.createResearchBrief({ title: route.title, body: text, outputDirectory: settings.outputDirectory })
                : [];

    await maybeRememberExchange(request.input, text);

    return {
      route,
      permission: decision,
      result: redactSecrets(openClawResult),
      text,
      outputs
    };
  });

  handle("output:open-directory", async () => {
    const directory = await outputManager.ensureOutputDirectory(configStore.get().outputDirectory);
    await shell.openPath(directory);
    return { directory };
  });

  handle("permission:evaluate", async (_event, payload) => {
    return permissionGate.evaluate(payload as PermissionContext);
  });

  handle("audit:read", async () => readAuditLog(150));

  handle("window:set-always-on-top", async (_event, payload) => {
    const enabled = Boolean((payload as { enabled?: boolean })?.enabled);
    const window = getMainWindow();
    if (window) window.setAlwaysOnTop(enabled);
    await configStore.update({ alwaysOnTop: enabled });
    return { enabled };
  });

  handle("window:set-click-through", async (_event, payload) => {
    const enabled = Boolean((payload as { enabled?: boolean })?.enabled);
    await configStore.update({ clickThrough: enabled });
    applyMainWindowMousePolicy();
    return { enabled };
  });

  handle("window:set-pass-through", async (event, payload) => {
    const enabled = Boolean((payload as { enabled?: boolean })?.enabled);
    if (event.sender.id === getFloatingBallWindow()?.webContents.id) {
      floatingBallPassThrough = enabled;
      applyFloatingBallMousePolicy();
      return { enabled };
    }
    runtimePassThrough = enabled;
    applyMainWindowMousePolicy();
    return { enabled: runtimePassThrough };
  });

  handle("window:hide", async () => {
    hideMainWindow();
    return { hidden: true };
  });

  handle("window:show", async () => {
    showMainWindow();
    return { shown: true };
  });

  handle("window:expand-from-floating-ball", async () => {
    showMainWindow();
    return { expanded: true };
  });

  handle("window:collapse-to-floating-ball", async () => {
    hideMainWindow();
    return { collapsed: true };
  });

  handle("window:hide-floating-ball", async () => {
    hideFloatingBall();
    return { hidden: true };
  });

  handle("window:move-by", async (event, payload) => {
    const { dx, dy } = (payload ?? {}) as { dx?: number; dy?: number };
    const deltaX = Math.round(Number(dx) || 0);
    const deltaY = Math.round(Number(dy) || 0);
    const floatingBall = getFloatingBallWindow();
    if (floatingBall && event.sender.id === floatingBall.webContents.id) {
      const current = pointFromWindow(floatingBall);
      const next = clampFloatingBallPositionForDisplay({ x: current.x + deltaX, y: current.y + deltaY });
      floatingBall.setPosition(next.x, next.y, false);
      await configStore.update({ floatingBallPosition: next });
      return { moved: true, target: "floatingBall" };
    }
    const window = getMainWindow();
    if (!window) return { moved: false };
    const [x, y] = window.getPosition();
    window.setPosition(x + deltaX, y + deltaY, false);
    return { moved: true, target: "mainWindow" };
  });

  handle("window:open-settings", async () => {
    showSettingsWindow();
    return { opened: true };
  });

  handle("window:close-settings", async () => {
    closeSettingsWindow();
    return { closed: true };
  });

  handle("window:open-pet-menu", async (event) => {
    openPetContextMenu(windowForSender(event));
    return { opened: true };
  });

  handle("dialog:select-directory", async () => {
    const options: OpenDialogOptions = { properties: ["openDirectory"] };
    const window = getMainWindow();
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths[0];
  });

  handle("dialog:select-files", async () => {
    const options: OpenDialogOptions = { properties: ["openFile", "multiSelections"] };
    const window = getMainWindow();
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });

  handle("shell:open-path", async (_event, payload) => {
    const { filePath } = payload as { filePath: string };
    return shell.openPath(path.resolve(filePath));
  });

  handle("shell:show-item", async (_event, payload) => {
    const { filePath } = payload as { filePath: string };
    shell.showItemInFolder(path.resolve(filePath));
    return { ok: true };
  });
}
