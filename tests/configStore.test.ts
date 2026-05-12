import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigStore, MANAGED_API_ORIGIN } from "../src/main/configStore";

describe("ConfigStore first run identity", () => {
  it("creates a secure anonymous device id and managed cloud defaults", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minipet-config-"));
    const store = new ConfigStore(dir);
    const settings = await store.load();
    expect(settings.aiMode).toBe("cloud");
    expect(settings.cloudApiOrigin).toBe(MANAGED_API_ORIGIN);
    expect(settings.cloudDeviceId).toMatch(/^mp_[a-f0-9]{32}$/);

    const reloaded = await new ConfigStore(dir).load();
    expect(reloaded.cloudDeviceId).toBe(settings.cloudDeviceId);
  });
});
