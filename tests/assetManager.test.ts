import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AssetManager,
  guessPetState,
  isPathInside,
  normalizePetStateKey,
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

  it("normalizes legacy state keys without losing saved mappings", () => {
    expect(normalizePetStateKey("idle")).toBe("idle_welcome");
    expect(normalizePetStateKey("success")).toBe("success_cheer");
    expect(normalizePetStateKey("file_working")).toBe("laptop_working");
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
    for (const state of PET_STATE_KEYS) {
      expect(manifest.mapping[state]).toBeTruthy();
    }
    expect(manifest.mapping.dragging).toBeTruthy();
  });

  it("detects path traversal outside selected directory", () => {
    expect(isPathInside("C:/safe/a.png", "C:/safe")).toBe(true);
    expect(isPathInside("C:/other/a.png", "C:/safe")).toBe(false);
  });
});
