import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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
}

const DEFAULT_PROJECT_ROOT = "D:\\minipet";

export function defaultBundledAssetDirectory(): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) return path.join(resourcesPath, "design", "one");
  return path.join(process.cwd() || DEFAULT_PROJECT_ROOT, "design", "one");
}

export const DEFAULT_SETTINGS: MiniPetSettings = {
  onboarded: false,
  assetDirectory: defaultBundledAssetDirectory(),
  assetMapping: {},
  openClawUrls: ["ws://127.0.0.1:18789", "ws://localhost:18789"],
  openClawSessionKey: "main",
  openAIBaseUrl: "https://newkey.versecraft.cn/",
  openAIModel: "minipet",
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
  voiceInputEnabled: true
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
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
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
}
