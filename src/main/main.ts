import { app, dialog, ipcMain, Menu, protocol, shell, type BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import path from "node:path";
import { AssetManager, readAssetBytes } from "./assetManager";
import { CapabilityRouter } from "./capabilities/CapabilityRouter";
import { MiniPetCloudClient } from "./cloud/MiniPetCloudClient";
import { ConfigStore } from "./configStore";
import { CoreManager } from "./core/CoreManager";
import { RuntimeInstaller } from "./core/RuntimeInstaller";
import { OpenAICompatibleClient } from "./llm/OpenAICompatibleClient";
import { OpenClawClient } from "./openclaw/OpenClawClient";
import { OpenClawMock } from "./openclaw/OpenClawMock";
import { OutputManager } from "./output/OutputManager";
import { PermissionGate } from "./permissions/PermissionGate";
import type { ActionType, PermissionContext } from "./permissions/PermissionModes";
import { readAuditLog, redactSecrets } from "./security/auditLog";
import { assertTrustedSender, type IpcChannel } from "./security/ipcGuard";
import { validateExternalUrl } from "./security/urlGuard";
import { SecureStore, type SecretKey } from "./secureStore";
import { createTray, type TrayActions } from "./trayManager";
import { createMainWindow, createSettingsWindow } from "./windowManager";

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

let mainWindow: BrowserWindow | undefined;
let settingsWindow: BrowserWindow | undefined;
let mainTray: ReturnType<typeof createTray> | undefined;
let isQuitting = false;
let latestCloudStatus: { online: boolean; message?: string; quotaRemaining?: number } | undefined;

function handle(channel: IpcChannel, listener: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown> | unknown): void {
  ipcMain.handle(channel, async (event, payload) => {
    assertTrustedSender(event, [getMainWindow()?.webContents, getSettingsWindow()?.webContents]);
    return listener(event, payload);
  });
}

app.whenReady().then(async () => {
  await configStore.load();
  const settings = configStore.get();
  await assetManager.scan(settings.assetDirectory, settings.assetMapping);
  registerAssetProtocol();
  getOrCreateMainWindow();
  mainTray = createTray({
    show: showMainWindow,
    hide: hideMainWindow,
    toggle: toggleMainWindow,
    openSettings: showSettingsWindow,
    checkForUpdates: () => void checkForUpdates(true),
    setAlwaysOnTop: (enabled) => getOrCreateMainWindow().setAlwaysOnTop(enabled),
    isAlwaysOnTop: () => getMainWindow()?.isAlwaysOnTop() ?? true,
    quit: () => {
      isQuitting = true;
      app.quit();
    }
  } satisfies TrayActions);
  registerIpc();
  openClaw.on("event", (event) => sendToRenderer("openclaw:event", redactSecrets(event)));
  openClaw.on("status", (status) => sendToRenderer("openclaw:status", redactSecrets(status)));
  coreManager.on("progress", (status) => sendToRenderer("core:progress", redactSecrets(status)));
  void bootstrapCloudSession();
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

function getOrCreateMainWindow(): BrowserWindow {
  const existing = getMainWindow();
  if (existing) return existing;
  const window = createMainWindow();
  mainWindow = window;
  window.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    if (!window.isDestroyed()) window.hide();
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
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

function showMainWindow(): void {
  const window = getOrCreateMainWindow();
  window.show();
  window.focus();
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
}

function toggleMainWindow(): void {
  const window = getOrCreateMainWindow();
  if (window.isVisible()) window.hide();
  else showMainWindow();
}

function openPetContextMenu(): void {
  const window = getMainWindow();
  if (!window) return;
  Menu.buildFromTemplate([
    {
      label: "打开设置",
      click: showSettingsWindow
    },
    {
      label: "检查更新",
      click: () => void checkForUpdates(true)
    },
    {
      label: "隐藏桌宠",
      click: hideMainWindow
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]).popup({ window });
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
    latestCloudStatus = { online: false, message: "网络不可用。MiniPet 已启动，等网络恢复后就能继续对话。" };
  }
  sendToRenderer("cloud:status", latestCloudStatus);
}

async function checkForUpdates(showDialog: boolean): Promise<unknown> {
  try {
    const release = await cloudClient.getLatestRelease();
    const current = app.getVersion();
    const hasUpdate = release.version !== current;
    if (showDialog) {
      const options = {
        type: hasUpdate ? "info" : "none",
        title: "MiniPet 更新",
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
      const options = { type: "warning", title: "MiniPet 更新", message } as const;
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
    if (window && typeof patch.clickThrough === "boolean") window.setIgnoreMouseEvents(patch.clickThrough, { forward: true });
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
    const { url } = payload as { url: string };
    const result = validateExternalUrl(url);
    if (!result.ok || !result.normalized) return result;
    await shell.openExternal(result.normalized);
    return result;
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
    };
    const settings = configStore.get();
    const decision = permissionGate.evaluate({
      mode: openClaw.status().connected ? settings.permissionMode : "demo",
      actionType: request.actionType ?? "chat",
      method: request.method,
      prompt: request.prompt,
      adminAdvanced: settings.adminAdvanced
    });
    if (!decision.allowed) return { permission: decision, error: decision.reason };
    if (decision.requireConfirmation && !request.confirmed) {
      return { permission: decision, requiresConfirmation: true, error: decision.reason };
    }
    if (!openClaw.status().connected) {
      if (request.method === "chat.send") {
        return { permission: decision, result: await openClawMock.chat(request.params as never) };
      }
      return { permission: decision, error: "这个任务需要先准备智能核心。你也可以先和 MiniPet 普通聊天。" };
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
    const decision = permissionGate.evaluate({
      mode: "demo",
      actionType: "chat",
      prompt: messages.map((item) => item.content).join("\n")
    });
    if (!decision.allowed) return { permission: decision, error: decision.reason };
    if (settings.aiMode === "cloud") {
      const result = await cloudClient.chat(messages, app.getVersion());
      return { permission: decision, result: redactSecrets(result) };
    }
    const apiKey = await secureStore.getSecret("openaiApiKey");
    if (!apiKey) return { permission: decision, error: "需要先在高级自带模型模式中保存 API Key。" };
    const result = await llmClient.chat(
      {
        baseUrl: settings.openAIBaseUrl,
        apiKey,
        model: settings.openAIModel
      },
      messages
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

  handle("companion:run-task", async (_event, payload) => {
    const request = payload as {
      input: string;
      files?: string[];
      allowInstall?: boolean;
      confirmed?: boolean;
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
      if (!core.connected) return { route, error: core.lastError || "智能核心还没有准备好，请重试。" };
    }

    const decision = permissionGate.evaluate({
      mode: route.needsCore ? settings.permissionMode : "demo",
      actionType: route.actionType,
      method: route.needsCore ? "chat.send" : "local.chat",
      prompt: route.prompt,
      paths: request.files,
      userSelectedPaths: request.files,
      adminAdvanced: settings.adminAdvanced
    });
    if (!decision.allowed) return { route, permission: decision, error: decision.reason };
    if (decision.requireConfirmation && !request.confirmed) {
      return { route, permission: decision, requiresConfirmation: true, error: decision.reason };
    }

    let text = "";
    let openClawResult: unknown;
    if (route.needsCore) {
      const result = await openClaw.chatSend({
        content: route.prompt,
        sessionKey: settings.openClawSessionKey,
        localRequestId: request.localRequestId,
        model: settings.openAIModel
      });
      openClawResult = result;
      text = result.text || "任务已经交给智能核心，后续进度会显示在记录里。";
    } else if (settings.aiMode === "cloud") {
      const result = await cloudClient.chat(
        [
          { role: "system", content: "你是 MiniPet 桌面陪伴助手，请用简短、清楚、中文的新手友好语气回答。" },
          { role: "user", content: request.input }
        ],
        app.getVersion()
      );
      text = result.text;
    } else {
      const apiKey = await secureStore.getSecret("openaiApiKey");
      if (!apiKey) return { route, needsModelAuthorization: true };
      const result = await llmClient.chat(
        {
          baseUrl: settings.openAIBaseUrl,
          apiKey,
          model: settings.openAIModel
        },
        [
          { role: "system", content: "你是 MiniPet 桌面陪伴助手，请用简短、清楚、中文的新手友好语气回答。" },
          { role: "user", content: request.input }
        ]
      );
      text = result.text;
    }

    const outputs =
      route.output === "pptx"
        ? [await outputManager.createPptx({ title: route.title, body: text, outputDirectory: settings.outputDirectory })]
        : route.output === "paper"
          ? await outputManager.createPaper({ title: route.title, body: text, outputDirectory: settings.outputDirectory })
          : [];

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
    const window = getMainWindow();
    if (window) window.setIgnoreMouseEvents(enabled, { forward: true });
    await configStore.update({ clickThrough: enabled });
    return { enabled };
  });

  handle("window:hide", async () => {
    hideMainWindow();
    return { hidden: true };
  });

  handle("window:show", async () => {
    showMainWindow();
    return { shown: true };
  });

  handle("window:move-by", async (_event, payload) => {
    const { dx, dy } = (payload ?? {}) as { dx?: number; dy?: number };
    const window = getMainWindow();
    if (!window) return { moved: false };
    const [x, y] = window.getPosition();
    window.setPosition(x + Math.round(Number(dx) || 0), y + Math.round(Number(dy) || 0), false);
    return { moved: true };
  });

  handle("window:open-settings", async () => {
    showSettingsWindow();
    return { opened: true };
  });

  handle("window:close-settings", async () => {
    closeSettingsWindow();
    return { closed: true };
  });

  handle("window:open-pet-menu", async () => {
    openPetContextMenu();
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
