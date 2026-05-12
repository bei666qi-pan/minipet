import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_QUOTA_TOKENS } from "../src/server/config";
import { FileMiniPetStore } from "../src/server/store";

describe("MiniPet server store", () => {
  it("creates devices with the default quota and records usage", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minipet-store-"));
    const store = new FileMiniPetStore(path.join(dir, "store.json"));
    await store.init();
    const device = await store.upsertDevice({ id: "device-test-001", appVersion: "0.1.0", platform: "win32" });
    expect(device.quotaTokens).toBe(DEFAULT_DEVICE_QUOTA_TOKENS);
    expect(device.usedTokens).toBe(0);

    await store.recordUsage({
      deviceId: device.id,
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      model: "test-model",
      upstreamStatus: 200
    });
    const updated = await store.getDevice(device.id);
    expect(updated?.usedTokens).toBe(20);
  });
});
