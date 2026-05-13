import { create } from "zustand";

export type PermissionMode = "demo" | "safe" | "assisted" | "full";
export type DesktopSurface = "floatingBall" | "mainWindow";
export interface WindowPoint {
  x: number;
  y: number;
}
export type PetState =
  | "idle_welcome"
  | "listening"
  | "thinking"
  | "working_guide"
  | "success_cheer"
  | "idle_calm"
  | "surprised_alert"
  | "apology_sad"
  | "laptop_working"
  | "dragging";

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
  coreInstallState: string;
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
  memoryEnabled: boolean;
  memoryAutoExtractEnabled: boolean;
  memoryUseModelCompression: boolean;
  lastDesktopSurface: DesktopSurface;
  floatingBallPosition?: WindowPoint;
}

export interface PetAsset {
  id: string;
  fileName: string;
  absolutePath: string;
  stateGuess: PetState;
  url: string;
  size: number;
  updatedAt: string;
}

export interface AssetManifest {
  directory: string;
  generatedAt: string;
  assets: PetAsset[];
  mapping: Partial<Record<PetState, string>>;
}

export interface SecretStatus {
  openaiApiKey: boolean;
  openclawToken: boolean;
  cloudDeviceToken: boolean;
  encryptionAvailable: boolean;
}

export interface OpenClawStatus {
  connected: boolean;
  url?: string;
  version?: string;
  scopes: string[];
  sessionKey: string;
  lastError?: string;
  demoMode: boolean;
}

export interface CoreStatus {
  connected: boolean;
  state: string;
  label: string;
  needsAuthorization: boolean;
  runtimeDir: string;
  lastError?: string;
}

export interface CloudStatus {
  online: boolean;
  message?: string;
  quotaRemaining?: number;
}

interface SettingsState {
  loading: boolean;
  settings?: MiniPetSettings;
  assets?: AssetManifest;
  secrets?: SecretStatus;
  openClaw?: OpenClawStatus;
  core?: CoreStatus;
  cloudStatus?: CloudStatus;
  audit: unknown[];
  load: () => Promise<void>;
  update: (patch: Partial<MiniPetSettings>) => Promise<void>;
  scanAssets: (directory?: string) => Promise<void>;
  setSecret: (key: "openaiApiKey" | "openclawToken", value: string, persist?: boolean) => Promise<void>;
  clearSecret: (key: "openaiApiKey" | "openclawToken") => Promise<void>;
  connectOpenClaw: () => Promise<OpenClawStatus>;
  ensureCore: (allowInstall?: boolean) => Promise<CoreStatus>;
  setCoreStatus: (core: CoreStatus) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  loading: false,
  audit: [],
  async load() {
    set({ loading: true });
    const state = await window.minipet.invoke<{
      settings: MiniPetSettings;
      secrets: SecretStatus;
      assets: AssetManifest;
      openClaw: OpenClawStatus;
      core: CoreStatus;
      cloudStatus?: CloudStatus;
      audit: unknown[];
    }>("app:get-state");
    set({ ...state, loading: false });
  },
  async update(patch) {
    const result = await window.minipet.invoke<{ settings: MiniPetSettings; assets: AssetManifest }>("app:update-settings", patch);
    set({ settings: result.settings, assets: result.assets });
  },
  async scanAssets(directory) {
    const manifest = await window.minipet.invoke<AssetManifest>("asset:scan", { directory: directory ?? get().settings?.assetDirectory });
    set((state) => ({
      assets: manifest,
      settings: state.settings ? { ...state.settings, assetDirectory: manifest.directory } : state.settings
    }));
  },
  async setSecret(key, value, persist = true) {
    await window.minipet.invoke("app:set-secret", { key, value, persist });
    await get().load();
  },
  async clearSecret(key) {
    const secrets = await window.minipet.invoke<SecretStatus>("app:clear-secret", { key });
    set({ secrets });
  },
  async connectOpenClaw() {
    const status = await window.minipet.invoke<OpenClawStatus>("openclaw:connect");
    set({ openClaw: status });
    return status;
  },
  async ensureCore(allowInstall = false) {
    const core = await window.minipet.invoke<CoreStatus>("core:ensure-ready", { allowInstall });
    set({ core });
    return core;
  },
  setCoreStatus(core) {
    set({ core });
  }
}));

export function getAssetUrlForState(manifest: AssetManifest | undefined, state: PetState): string | undefined {
  if (!manifest?.assets.length) return undefined;
  const id = manifest.mapping[state] ?? manifest.mapping.idle_welcome ?? manifest.assets[0]?.id;
  return manifest.assets.find((asset) => asset.id === id)?.url ?? manifest.assets[0]?.url;
}
