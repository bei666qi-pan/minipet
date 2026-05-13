import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  AssetManager,
  guessPetState,
  isPathInside,
  normalizePetStateKey,
  OBSOLETE_PET_ASSET_FILES,
  PET_STATE_KEYS,
  REQUESTED_PET_ASSET_FILES
} from "../src/main/assetManager";

describe("AssetManager", () => {
  it("guesses the requested MiniPet states from asset names", () => {
    for (const [state, fileName] of Object.entries(REQUESTED_PET_ASSET_FILES)) {
      expect(guessPetState(fileName)).toBe(state);
    }
  });

  it("keeps the bundled reference sticker set complete", async () => {
    const referenceDir = path.resolve("design", "one");
    for (const fileName of Object.values(REQUESTED_PET_ASSET_FILES)) {
      await expect(fs.stat(path.join(referenceDir, fileName))).resolves.toMatchObject({ size: expect.any(Number) });
    }

    const manager = new AssetManager();
    const manifest = await manager.scan(referenceDir);
    for (const [state, fileName] of Object.entries(REQUESTED_PET_ASSET_FILES)) {
      const asset = manifest.assets.find((candidate) => candidate.id === manifest.mapping[state as keyof typeof REQUESTED_PET_ASSET_FILES]);
      expect(asset?.fileName).toBe(fileName);
    }
  });

  it("keeps bundled sticker backgrounds transparent", async () => {
    const referenceDir = path.resolve("design", "one");
    for (const fileName of Object.values(REQUESTED_PET_ASSET_FILES)) {
      await expect(readPngCornerAlphas(path.join(referenceDir, fileName))).resolves.toEqual([0, 0, 0, 0]);
    }
  }, 15000);

  it("normalizes legacy state keys without losing saved mappings", () => {
    expect(normalizePetStateKey("idle")).toBe("idle_welcome");
    expect(normalizePetStateKey("success")).toBe("success_cheer");
    expect(normalizePetStateKey("file_working")).toBe("laptop_working");
    expect(normalizePetStateKey("sleepy_rest")).toBe("idle_calm");
    expect(normalizePetStateKey("shy_smile")).toBe("idle_welcome");
    expect(normalizePetStateKey("reminder_warning")).toBe("surprised_alert");
  });

  it("scans images and builds fallback mapping for every pet state", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minipet-assets-"));
    await fs.writeFile(path.join(dir, "Idle_Welcome.png"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(dir, "Thinking.webp"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(dir, "pet_dragging.png"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(dir, "readme.txt"), "ignore");
    const manager = new AssetManager();
    const manifest = await manager.scan(dir);
    expect(manifest.assets).toHaveLength(3);
    expect(manifest.assets[0]?.url).toContain("?v=");
    for (const state of PET_STATE_KEYS) {
      expect(manifest.mapping[state]).toBeTruthy();
    }
    expect(manifest.mapping.dragging).toBeTruthy();
  });

  it("detects path traversal outside selected directory", () => {
    expect(isPathInside("C:/safe/a.png", "C:/safe")).toBe(true);
    expect(isPathInside("C:/other/a.png", "C:/safe")).toBe(false);
  });

  it("documents the obsolete 13-state asset names that should not be required anymore", () => {
    expect(OBSOLETE_PET_ASSET_FILES).toEqual(["Sleepy_Rest.png", "Shy_Smile.png", "Reminder_Warning.png"]);
  });
});

async function readPngCornerAlphas(filePath: string): Promise<number[]> {
  const png = await fs.readFile(filePath);
  const signature = png.subarray(0, 8).toString("hex");
  expect(signature).toBe("89504e470d0a1a0a");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }

  expect(bitDepth).toBe(8);
  expect(colorType).toBe(6);
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  let inputOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  let firstRow: Buffer | undefined;
  let current = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y++) {
    const filter = inflated[inputOffset++];
    const raw = inflated.subarray(inputOffset, inputOffset + rowBytes);
    inputOffset += rowBytes;
    current = Buffer.alloc(rowBytes);
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      current[x] = (raw[x] + unfilterDelta(filter, left, up, upLeft)) & 0xff;
    }
    if (y === 0) firstRow = Buffer.from(current);
    previous = current;
  }

  expect(firstRow).toBeDefined();
  return [firstRow![3], firstRow![(width - 1) * bytesPerPixel + 3], current[3], current[(width - 1) * bytesPerPixel + 3]];
}

function unfilterDelta(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) return paeth(left, up, upLeft);
  throw new Error(`Unsupported PNG filter ${filter}`);
}

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}
