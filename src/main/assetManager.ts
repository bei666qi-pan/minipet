import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type PetState =
  | "idle"
  | "listening"
  | "thinking"
  | "searching"
  | "making_ppt"
  | "browsing"
  | "file_working"
  | "success"
  | "error"
  | "sleeping"
  | "warning";

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

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

const STATE_KEYWORDS: Array<[PetState, RegExp]> = [
  ["idle", /idle[_-\s]*(welcome|calm)?|welcome|默认|空闲|待机/i],
  ["listening", /listening|listen|mic|voice|倾听|语音|输入/i],
  ["thinking", /thinking|think|plan|思考|分析/i],
  ["searching", /search|web|联网|搜索/i],
  ["making_ppt", /ppt|slide|slides|presentation|演示|汇报/i],
  ["browsing", /browser|browse|web|网页|浏览器/i],
  ["file_working", /file|document|working[_-\s]*guide|laptop|文件|电脑|整理|工作/i],
  ["success", /success|cheer|done|完成|成功|庆祝/i],
  ["error", /error|apology|sad|fail|失败|道歉|委屈/i],
  ["sleeping", /sleep|sleepy|rest|night|休息|困/i],
  ["warning", /warning|alert|surprise|reminder|提醒|警告|惊讶/i]
];

export function defaultAssetDirectory(projectRoot = process.cwd()): string {
  return path.join(projectRoot, "design", "one");
}

export function guessPetState(fileName: string): PetState {
  const hit = STATE_KEYWORDS.find(([, pattern]) => pattern.test(fileName));
  return hit?.[0] ?? "idle";
}

export function makeAssetId(absolutePath: string): string {
  return crypto.createHash("sha1").update(path.resolve(absolutePath).toLowerCase()).digest("hex").slice(0, 16);
}

export function makeAssetUrl(id: string): string {
  return `minipet-asset://local/${id}`;
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

  async scan(directory = this.manifest.directory, savedMapping: Partial<Record<PetState, string>> = {}): Promise<AssetManifest> {
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
      assets.push({
        id,
        fileName: entry.name,
        absolutePath,
        extension,
        stateGuess: guessPetState(entry.name),
        url: makeAssetUrl(id),
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

  private buildMapping(assets: PetAsset[], savedMapping: Partial<Record<PetState, string>>): Partial<Record<PetState, string>> {
    const mapping: Partial<Record<PetState, string>> = {};
    const assetIds = new Set(assets.map((asset) => asset.id));
    for (const [state, assetId] of Object.entries(savedMapping) as Array<[PetState, string]>) {
      if (assetIds.has(assetId)) mapping[state] = assetId;
    }
    for (const asset of assets) {
      if (!mapping[asset.stateGuess]) mapping[asset.stateGuess] = asset.id;
    }
    if (assets[0]) {
      const fallback = assets[0].id;
      const states: PetState[] = [
        "idle",
        "listening",
        "thinking",
        "searching",
        "making_ppt",
        "browsing",
        "file_working",
        "success",
        "error",
        "sleeping",
        "warning"
      ];
      for (const state of states) {
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
