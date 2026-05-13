import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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

export interface PetAsset {
  id: string;
  fileName: string;
  absolutePath: string;
  extension: string;
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

export const PET_STATE_KEYS: PetState[] = [
  "idle_welcome",
  "listening",
  "thinking",
  "working_guide",
  "success_cheer",
  "idle_calm",
  "surprised_alert",
  "apology_sad",
  "laptop_working",
  "dragging"
];

export const REQUESTED_PET_ASSET_FILES: Record<PetState, string> = {
  idle_welcome: "Idle_Welcome.png",
  listening: "Listening.png",
  thinking: "Thinking.png",
  working_guide: "Working_Guide.png",
  success_cheer: "Success_Cheer.png",
  idle_calm: "Idle_Calm.png",
  surprised_alert: "Surprised_Alert.png",
  apology_sad: "Apology_Sad.png",
  laptop_working: "Laptop_Working.png",
  dragging: "pet_dragging.png"
};

export const OBSOLETE_PET_ASSET_FILES = ["Sleepy_Rest.png", "Shy_Smile.png", "Reminder_Warning.png"] as const;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const LEGACY_STATE_ALIASES: Record<string, PetState> = {
  idle: "idle_welcome",
  searching: "laptop_working",
  making_ppt: "working_guide",
  browsing: "laptop_working",
  file_working: "laptop_working",
  success: "success_cheer",
  error: "apology_sad",
  sleeping: "idle_calm",
  sleep: "idle_calm",
  sleepy_rest: "idle_calm",
  night: "idle_calm",
  shy_smile: "idle_welcome",
  reminder_warning: "surprised_alert",
  warning: "surprised_alert",
  permission: "surprised_alert"
};

const STATE_KEYWORDS: Array<[PetState, RegExp]> = [
  ["dragging", /pet[_-\s]*dragging|dragging|拖拽|拖动/i],
  ["idle_calm", /idle[_-\s]*calm|calm|sleep|sleepy|rest|night|安静|待机|低打扰|困倦|休息|夜间/i],
  ["idle_welcome", /idle[_-\s]*welcome|welcome|shy|smile|默认|空闲|欢迎|亲和|害羞|夸奖|初次见面/i],
  ["listening", /listening|listen|mic|voice|倾听|语音|输入/i],
  ["thinking", /thinking|think|plan|分析|规划|思考/i],
  ["working_guide", /working[_-\s]*guide|guide|board|指示|讲解|计划/i],
  ["success_cheer", /success|cheer|done|完成|成功|庆祝|鼓励/i],
  ["surprised_alert", /surprised|surprise|alert|reminder|warning|warn|异常|惊讶|突然|问题|高危|确认|提醒|不要忘记/i],
  ["apology_sad", /apology|sorry|sad|fail|error|失败|道歉|委屈|权限不足/i],
  ["laptop_working", /laptop|computer|openclaw|file|document|整理|电脑|工作|总结/i]
];

export function defaultAssetDirectory(projectRoot = process.cwd()): string {
  return path.join(projectRoot, "design", "one");
}

export function guessPetState(fileName: string): PetState {
  const exact = Object.entries(REQUESTED_PET_ASSET_FILES).find(([, expectedFileName]) => expectedFileName.toLowerCase() === fileName.toLowerCase());
  if (exact) return exact[0] as PetState;
  const hit = STATE_KEYWORDS.find(([, pattern]) => pattern.test(fileName));
  return hit?.[0] ?? "idle_welcome";
}

export function normalizePetStateKey(key: string): PetState | undefined {
  if ((PET_STATE_KEYS as string[]).includes(key)) return key as PetState;
  return LEGACY_STATE_ALIASES[key];
}

export function makeAssetId(absolutePath: string): string {
  return crypto.createHash("sha1").update(path.resolve(absolutePath).toLowerCase()).digest("hex").slice(0, 16);
}

export function makeAssetUrl(id: string, version?: string): string {
  return `minipet-asset://local/${id}${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}

export function isPathInside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export class AssetManager {
  private manifest: AssetManifest = {
    directory: defaultAssetDirectory(),
    generatedAt: new Date(0).toISOString(),
    assets: [],
    mapping: {}
  };

  async scan(directory = this.manifest.directory, savedMapping: Record<string, string> = {}): Promise<AssetManifest> {
    const resolvedDirectory = path.resolve(directory);
    const entries = await fs.readdir(resolvedDirectory, { withFileTypes: true }).catch(() => []);
    const assets: PetAsset[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) continue;
      const absolutePath = path.join(resolvedDirectory, entry.name);
      const stat = await fs.stat(absolutePath);
      const id = makeAssetId(absolutePath);
      const version = `${Math.trunc(stat.mtimeMs)}-${stat.size}`;
      assets.push({
        id,
        fileName: entry.name,
        absolutePath,
        extension,
        stateGuess: guessPetState(entry.name),
        url: makeAssetUrl(id, version),
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      });
    }

    assets.sort((a, b) => a.fileName.localeCompare(b.fileName, "zh-CN"));
    const mapping = this.buildMapping(assets, savedMapping);
    this.manifest = {
      directory: resolvedDirectory,
      generatedAt: new Date().toISOString(),
      assets,
      mapping
    };
    return this.manifest;
  }

  getManifest(): AssetManifest {
    return this.manifest;
  }

  getAssetPathById(id: string): string | undefined {
    return this.manifest.assets.find((asset) => asset.id === id)?.absolutePath;
  }

  resolveAssetPath(id: string): string | undefined {
    const found = this.getAssetPathById(id);
    if (!found) return undefined;
    if (!isPathInside(found, this.manifest.directory)) return undefined;
    return found;
  }

  private buildMapping(assets: PetAsset[], savedMapping: Record<string, string>): Partial<Record<PetState, string>> {
    const mapping: Partial<Record<PetState, string>> = {};
    const assetIds = new Set(assets.map((asset) => asset.id));
    for (const [state, assetId] of Object.entries(savedMapping)) {
      const normalized = normalizePetStateKey(state);
      if (normalized && assetIds.has(assetId) && !mapping[normalized]) mapping[normalized] = assetId;
    }
    for (const asset of assets) {
      if (!mapping[asset.stateGuess]) mapping[asset.stateGuess] = asset.id;
    }
    if (assets[0]) {
      const fallback = mapping.idle_welcome ?? assets[0].id;
      for (const state of PET_STATE_KEYS) {
        if (!mapping[state]) mapping[state] = fallback;
      }
    }
    return mapping;
  }
}

export async function readAssetBytes(manager: AssetManager, id: string): Promise<{ bytes: Buffer; mime: string } | undefined> {
  const filePath = manager.resolveAssetPath(id);
  if (!filePath) return undefined;
  const extension = path.extname(filePath).toLowerCase();
  const mime =
    extension === ".png"
      ? "image/png"
      : extension === ".jpg" || extension === ".jpeg"
        ? "image/jpeg"
        : extension === ".webp"
          ? "image/webp"
          : extension === ".gif"
            ? "image/gif"
            : "application/octet-stream";
  return { bytes: await fs.readFile(filePath), mime };
}
