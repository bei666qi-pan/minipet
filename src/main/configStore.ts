import * as fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { REQUESTED_PET_ASSET_FILES } from "./assetManager";
import type { PermissionMode } from "./permissions/PermissionModes";
import type { CoreInstallState } from "./core/RuntimeInstaller";
import { defaultRuntimeDir } from "./core/RuntimeInstaller";
import { defaultOutputDirectory } from "./output/OutputManager";

export interface MiniPetSettings {
  onboarded: boolean;
  assetDirectory: string;
  assetMapping: Record<string, string>;
  openClawUrls: string[];
  openClawSessionKey: string;
  openAIBaseUrl: string;
  openAIModel: string;
  aiMode: "cloud" | "custom";
  cloudApiOrigin: string;
  cloudDeviceId: string;
  permissionMode: PermissionMode;
  adminAdvanced: boolean;
  theme: "light" | "dark" | "system";
  alwaysOnTop: boolean;
  clickThrough: boolean;
  petScale: number;
  enabledSkills: Record<string, boolean>;
  coreInstallState: CoreInstallState;
  runtimeDir: string;
  coreAutoStart: boolean;
  advancedUnlocked: boolean;
  outputDirectory: string;
  voiceInputEnabled: boolean;
  proactiveSpeechEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  talkAutoHideSeconds: number;
}

const DEFAULT_PROJECT_ROOT = "D:\\minipet";
export const MANAGED_API_ORIGIN = "https://api.minipet.versecraft.cn";

export function defaultBundledAssetDirectory(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const candidates = [
    resourcesPath ? path.join(resourcesPath, "design", "one") : undefined,
    path.join(process.cwd() || DEFAULT_PROJECT_ROOT, "design", "one"),
    path.join(DEFAULT_PROJECT_ROOT, "design", "one")
  ].filter(Boolean) as string[];
  return candidates.find(hasRequestedAssetSetSync) ?? candidates[0];
}

export const DEFAULT_SETTINGS: MiniPetSettings = {
  onboarded: false,
  assetDirectory: defaultBundledAssetDirectory(),
  assetMapping: {},
  openClawUrls: ["ws://127.0.0.1:18789", "ws://localhost:18789"],
  openClawSessionKey: "main",
  openAIBaseUrl: "https://newkey.versecraft.cn/",
  openAIModel: "minipet",
  aiMode: "cloud",
  cloudApiOrigin: MANAGED_API_ORIGIN,
  cloudDeviceId: "",
  permissionMode: "safe",
  adminAdvanced: false,
  theme: "light",
  alwaysOnTop: true,
  clickThrough: false,
  petScale: 1,
  enabledSkills: {},
  coreInstallState: "not_started",
  runtimeDir: defaultRuntimeDir(),
  coreAutoStart: true,
  advancedUnlocked: false,
  outputDirectory: defaultOutputDirectory(),
  voiceInputEnabled: true,
  proactiveSpeechEnabled: true,
  quietHoursEnabled: true,
  quietHoursStart: "23:00",
  quietHoursEnd: "08:00",
  talkAutoHideSeconds: 30
};

export function defaultConfigDir(): string {
  return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "ZhaoZhaoPartner");
}

export class ConfigStore {
  private settings: MiniPetSettings = { ...DEFAULT_SETTINGS };
  private readonly filePath: string;

  constructor(configDir = defaultConfigDir()) {
    this.filePath = path.join(configDir, "settings.json");
  }

  async load(): Promise<MiniPetSettings> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<MiniPetSettings>;
      this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      await this.ensureLocalSettings();
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
      await this.ensureLocalSettings();
      await this.save();
    }
    return this.get();
  }

  get(): MiniPetSettings {
    return JSON.parse(JSON.stringify(this.settings)) as MiniPetSettings;
  }

  async update(patch: Partial<MiniPetSettings>): Promise<MiniPetSettings> {
    this.settings = { ...this.settings, ...patch };
    await this.save();
    return this.get();
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(this.settings, null, 2)}\n`, "utf8");
  }

  private async ensureLocalSettings(): Promise<void> {
    let changed = false;
    if (!this.settings.cloudDeviceId || !/^mp_[a-f0-9]{32}$/.test(this.settings.cloudDeviceId)) {
      this.settings.cloudDeviceId = `mp_${crypto.randomBytes(16).toString("hex")}`;
      changed = true;
    }
    if (!this.settings.cloudApiOrigin) {
      this.settings.cloudApiOrigin = MANAGED_API_ORIGIN;
      changed = true;
    }
    if (!this.settings.aiMode) {
      this.settings.aiMode = "cloud";
      changed = true;
    }
    if (!this.settings.assetDirectory || !(await hasRequestedAssetSet(this.settings.assetDirectory))) {
      this.settings.assetDirectory = defaultBundledAssetDirectory();
      this.settings.assetMapping = {};
      changed = true;
    }
    if (changed) await this.save();
  }
}

function hasRequestedAssetSetSync(directory: string | undefined): boolean {
  if (!directory) return false;
  return Object.values(REQUESTED_PET_ASSET_FILES).every((fileName) => fsSync.existsSync(path.join(directory, fileName)));
}

async function hasRequestedAssetSet(directory: string | undefined): Promise<boolean> {
  if (!directory) return false;
  try {
    await Promise.all(Object.values(REQUESTED_PET_ASSET_FILES).map((fileName) => fs.access(path.join(directory, fileName))));
    return true;
  } catch {
    return false;
  }
}
