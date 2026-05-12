import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import type { ConfigStore } from "../configStore";
import type { OpenClawClient } from "../openclaw/OpenClawClient";
import type { PermissionGate } from "../permissions/PermissionGate";
import type { SecureStore } from "../secureStore";
import { defaultRuntimeDir, RuntimeInstaller, type CoreInstallState, type RuntimeProgress } from "./RuntimeInstaller";

export interface CoreStatus {
  connected: boolean;
  state: CoreInstallState;
  label: string;
  needsAuthorization: boolean;
  runtimeDir: string;
  lastError?: string;
}

export class CoreManager extends EventEmitter {
  private gatewayProcess?: ChildProcessWithoutNullStreams;
  private lastError?: string;

  constructor(
    private readonly installer: RuntimeInstaller,
    private readonly openClaw: OpenClawClient,
    private readonly configStore: ConfigStore,
    private readonly secureStore: SecureStore,
    private readonly permissionGate: PermissionGate
  ) {
    super();
    this.installer.on("progress", (progress: RuntimeProgress) => this.emit("progress", this.statusFromProgress(progress)));
  }

  status(): CoreStatus {
    const settings = this.configStore.get();
    const progress = this.installer.getState();
    return {
      connected: this.openClaw.status().connected,
      state: progress.state,
      label: this.openClaw.status().connected ? "智能核心已准备好" : progress.label,
      needsAuthorization: !this.openClaw.status().connected && progress.state !== "ready",
      runtimeDir: settings.runtimeDir || defaultRuntimeDir(),
      lastError: this.lastError
    };
  }

  async checkAndConnect(): Promise<CoreStatus> {
    const settings = this.configStore.get();
    await this.connectExisting(settings.runtimeDir).catch(() => undefined);
    return this.status();
  }

  async ensureReady(options: { allowInstall: boolean }): Promise<CoreStatus> {
    await this.connectExisting(this.configStore.get().runtimeDir).catch(() => undefined);
    if (this.openClaw.status().connected) return this.status();

    if (!options.allowInstall) {
      return {
        ...this.status(),
        state: "needs_authorization",
        label: "需要你同意后，我才能准备智能核心",
        needsAuthorization: true
      };
    }

    try {
      const settings = this.configStore.get();
      const runtimeDir = settings.runtimeDir || defaultRuntimeDir();
      await this.configStore.update({ coreInstallState: "installing", runtimeDir });
      const install = await this.installer.ensureInstalled(runtimeDir);
      if (!install.ok || !install.command) {
        this.lastError = install.message;
        await this.configStore.update({ coreInstallState: "failed" });
        return { ...this.status(), state: "failed", label: install.message, needsAuthorization: false, lastError: install.message };
      }
      await this.startGateway(install.command, runtimeDir);
      await this.connectExisting(runtimeDir);
      await this.configStore.update({ coreInstallState: this.openClaw.status().connected ? "ready" : "failed" });
      return this.status();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = simplifyError(message);
      await this.configStore.update({ coreInstallState: "failed" });
      return { ...this.status(), state: "failed", label: this.lastError, needsAuthorization: false, lastError: this.lastError };
    }
  }

  async startGateway(command: string, runtimeDir: string): Promise<void> {
    if (this.gatewayProcess && !this.gatewayProcess.killed) return;
    this.emit("progress", { ...this.status(), state: "starting", label: "我在启动智能核心" });
    const child = spawn(command, ["gateway", "run", "--allow-unconfigured", "--port", "18789"], {
      cwd: runtimeDir,
      windowsHide: true,
      shell: command.endsWith(".cmd"),
      env: { ...process.env, OPENCLAW_HOME: path.join(runtimeDir, "home") }
    });
    this.gatewayProcess = child;
    child.stderr.on("data", (chunk) => {
      this.lastError = simplifyError(String(chunk));
    });
    child.on("exit", () => {
      if (this.gatewayProcess === child) this.gatewayProcess = undefined;
    });
    await delay(2600);
  }

  private async connectExisting(runtimeDir?: string): Promise<void> {
    const settings = this.configStore.get();
    const token = await this.secureStore.getSecret("openclawToken");
    const urls = settings.openClawUrls?.length ? settings.openClawUrls : ["ws://127.0.0.1:18789", "ws://localhost:18789"];
    await this.openClaw.connect(urls, {
      role: "operator",
      scopes: this.permissionGate.scopesForMode(settings.permissionMode, settings.adminAdvanced),
      sessionKey: settings.openClawSessionKey,
      token
    });
    if (!this.openClaw.status().connected) {
      const command = await this.installer.findOpenClawCommand(runtimeDir);
      if (command) {
        await this.startGateway(command, runtimeDir || defaultRuntimeDir());
        await this.openClaw.connect(urls, {
          role: "operator",
          scopes: this.permissionGate.scopesForMode(settings.permissionMode, settings.adminAdvanced),
          sessionKey: settings.openClawSessionKey,
          token
        });
      }
    }
  }

  private statusFromProgress(progress: RuntimeProgress): CoreStatus {
    return {
      ...this.status(),
      state: progress.state,
      label: progress.label
    };
  }
}

function simplifyError(message: string): string {
  if (/ENOTFOUND|ECONN|network|timeout|timed out/i.test(message)) return "网络连接不稳定，智能核心下载失败。请检查网络后重试。";
  if (/permission|access denied|EPERM/i.test(message)) return "当前目录没有写入权限，请换一个安装位置后重试。";
  return message.slice(0, 180) || "智能核心准备失败，请重试。";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
