import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_QUOTA_TOKENS } from "../apps/backend/src/config";
import { createStore } from "../apps/backend/src/store";

describe("MiniPet backend store", () => {
  it("creates anonymous users with the default quota and records usage", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minipet-store-"));
    const store = createStore({ dataDir: dir });
    await store.init();
    const user = await store.bootstrapUser({ deviceId: "device-test-001" });
    expect(user.quotaTotalTokens).toBe(DEFAULT_DEVICE_QUOTA_TOKENS);
    expect(user.quotaUsedTokens).toBe(0);

    await store.recordUsage({
      userId: user.id,
      requestId: "req-1",
      provider: "newapi",
      model: "test-model",
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      estimatedCost: 0,
      status: "success",
      estimated: false
    });
    const updated = await store.getUser(user.id);
    expect(updated?.quotaUsedTokens).toBe(20);
  });
});
