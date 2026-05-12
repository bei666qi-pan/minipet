import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AssetManager, guessPetState, isPathInside } from "../src/main/assetManager";

describe("AssetManager", () => {
  it("guesses pet state from OpenClaw asset names", () => {
    expect(guessPetState("Thinking.png")).toBe("thinking");
    expect(guessPetState("Success_Cheer.png")).toBe("success");
    expect(guessPetState("Reminder_Warning.png")).toBe("warning");
  });

  it("scans images and builds fallback mapping", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minipet-assets-"));
    await fs.writeFile(path.join(dir, "Idle_Welcome.png"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(dir, "Thinking.webp"), Buffer.from([1, 2, 3]));
    await fs.writeFile(path.join(dir, "readme.txt"), "ignore");
    const manager = new AssetManager();
    const manifest = await manager.scan(dir);
    expect(manifest.assets).toHaveLength(2);
    expect(manifest.mapping.idle).toBeTruthy();
    expect(manifest.mapping.thinking).toBeTruthy();
  });

  it("detects path traversal outside selected directory", () => {
    expect(isPathInside("C:/safe/a.png", "C:/safe")).toBe(true);
    expect(isPathInside("C:/other/a.png", "C:/safe")).toBe(false);
  });
});
