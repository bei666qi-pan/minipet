import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export type CoreInstallState =
  | "not_started"
  | "checking"
  | "needs_authorization"
  | "downloading"
  | "installing"
  | "starting"
  | "ready"
  | "failed";

export interface RuntimeProgress {
  state: CoreInstallState;
  label: string;
  detail?: string;
}

export interface RuntimeInstallResult {
  ok: boolean;
  command?: string;
  runtimeDir: string;
  state: CoreInstallState;
  message: string;
}

export const NODE_MAJOR = 24;
const FALLBACK_NODE_VERSION = "24.11.1";
const OPENCLAW_PACKAGE = "openclaw@latest";

export function defaultRuntimeDir(): string {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "ZhaoZhaoPartner", "runtime");
}

export function isWhitelistedDownloadUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ["nodejs.org"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function parseNodeVersion(output: string): { major: number; minor: number; patch: number } | undefined {
  const match = output.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function isSupportedNodeVersion(output: string): boolean {
  const version = parseNodeVersion(output);
  if (!version) return false;
  if (version.major > 22) return true;
  return version.major === 22 && version.minor >= 14;
}

export class RuntimeInstaller extends EventEmitter {
  private state: RuntimeProgress = {
    state: "not_started",
    label: "智能核心还没有准备"
  };

  getState(): RuntimeProgress {
    return { ...this.state };
  }

  async ensureInstalled(runtimeDir = defaultRuntimeDir()): Promise<RuntimeInstallResult> {
    this.progress("checking", "我在检查智能核心");
    await fs.mkdir(runtimeDir, { recursive: true });

    const existing = await this.findOpenClawCommand(runtimeDir);
    if (existing) {
      this.progress("ready", "智能核心已准备好");
      return { ok: true, command: existing, runtimeDir, state: "ready", message: "智能核心已准备好。" };
    }

    this.progress("downloading", "我在下载运行环境");
    const nodeDir = await this.ensurePortableNode(runtimeDir);
    const npmCommand = path.join(nodeDir, "npm.cmd");

    this.progress("installing", "我在安装智能核心");
    const prefix = path.join(runtimeDir, "smart-core");
    await fs.mkdir(prefix, { recursive: true });
    await runProcess(npmCommand, ["install", "--prefix", prefix, OPENCLAW_PACKAGE, "--no-fund", "--no-audit"], runtimeDir, 180000);

    const command = await this.findOpenClawCommand(runtimeDir);
    if (!command) {
      this.progress("failed", "智能核心安装后没有找到启动入口");
      return { ok: false, runtimeDir, state: "failed", message: "智能核心安装后没有找到启动入口，请重试。" };
    }

    this.progress("ready", "智能核心已准备好");
    return { ok: true, command, runtimeDir, state: "ready", message: "智能核心已准备好。" };
  }

  async findOpenClawCommand(runtimeDir = defaultRuntimeDir()): Promise<string | undefined> {
    const localCommand = path.join(runtimeDir, "smart-core", "node_modules", ".bin", "openclaw.cmd");
    if (await exists(localCommand)) return localCommand;
    const global = await whereCommand("openclaw");
    return global;
  }

  async ensurePortableNode(runtimeDir = defaultRuntimeDir()): Promise<string> {
    const marker = path.join(runtimeDir, "node", "node.exe");
    if (await exists(marker)) return path.dirname(marker);

    const version = await resolveNodeVersion();
    const archiveUrl = `https://nodejs.org/dist/v${version}/node-v${version}-win-x64.zip`;
    if (!isWhitelistedDownloadUrl(archiveUrl)) throw new Error("下载来源没有通过安全检查。");

    const cacheDir = path.join(runtimeDir, "cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const archivePath = path.join(cacheDir, `node-v${version}-win-x64.zip`);
    await downloadFile(archiveUrl, archivePath);

    const extractDir = path.join(cacheDir, `node-v${version}-win-x64`);
    await fs.rm(extractDir, { recursive: true, force: true });
    await runProcess(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Expand-Archive", "-LiteralPath", archivePath, "-DestinationPath", cacheDir, "-Force"],
      runtimeDir,
      120000
    );
    const unpacked = path.join(cacheDir, `node-v${version}-win-x64`);
    await fs.rm(path.join(runtimeDir, "node"), { recursive: true, force: true });
    await fs.rename(unpacked, path.join(runtimeDir, "node"));
    return path.join(runtimeDir, "node");
  }

  private progress(state: CoreInstallState, label: string, detail?: string): void {
    this.state = { state, label, detail };
    this.emit("progress", this.state);
  }
}

export async function resolveNodeVersion(): Promise<string> {
  try {
    const response = await fetch("https://nodejs.org/dist/index.json", { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return FALLBACK_NODE_VERSION;
    const versions = (await response.json()) as Array<{ version?: string; files?: string[]; lts?: string | boolean }>;
    const hit = versions.find((item) => item.version?.startsWith(`v${NODE_MAJOR}.`) && item.files?.includes("win-x64-zip"));
    return hit?.version?.replace(/^v/, "") ?? FALLBACK_NODE_VERSION;
  } catch {
    return FALLBACK_NODE_VERSION;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function whereCommand(name: string): Promise<string | undefined> {
  try {
    const result = await runProcess("where.exe", [name], process.cwd(), 6000);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const file = createWriteStream(destination);
    https
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          void fs.rm(destination, { force: true }).finally(() => {
            downloadFile(response.headers.location!, destination).then(resolve).catch(reject);
          });
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          reject(new Error(`下载失败：${response.statusCode ?? "未知状态"}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (error) => {
        file.close();
        reject(error);
      });
  });
}

export async function runProcess(command: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: command.endsWith(".cmd")
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("准备智能核心超时，请稍后重试。"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || "智能核心准备失败。"));
    });
  });
}
