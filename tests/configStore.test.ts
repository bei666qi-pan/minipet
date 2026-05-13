import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUESTED_PET_ASSET_FILES } from "../src/main/assetManager";
import { ConfigStore, defaultBundledAssetDirectory, MANAGED_API_ORIGIN } from "../src/main/configStore";

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

  it("migrates stale Electron runtime asset paths to the bundled sticker set", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minipet-config-"));
    const staleAssetDirectory = path.join(dir, "missing-electron-resources", "design", "one");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify(
        {
          ...minimalPersistedSettings(),
          assetDirectory: staleAssetDirectory,
          assetMapping: { idle_welcome: "stale-id" },
          cloudDeviceId: "mp_1234567890abcdef1234567890abcdef"
        },
        null,
        2
      ),
      "utf8"
    );

    const settings = await new ConfigStore(dir).load();
    expect(settings.assetDirectory).toBe(defaultBundledAssetDirectory());
    expect(settings.assetMapping).toEqual({});
    for (const fileName of Object.values(REQUESTED_PET_ASSET_FILES)) {
      await expect(fs.stat(path.join(settings.assetDirectory, fileName))).resolves.toMatchObject({ size: expect.any(Number) });
    }
  });

  it("keeps a custom complete sticker directory", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minipet-config-"));
    const customAssets = await fs.mkdtemp(path.join(os.tmpdir(), "minipet-custom-assets-"));
    for (const fileName of Object.values(REQUESTED_PET_ASSET_FILES)) {
      await fs.writeFile(path.join(customAssets, fileName), Buffer.from([1, 2, 3]));
    }
    await fs.writeFile(
      path.join(dir, "settings.json"),
      JSON.stringify(
        {
          ...minimalPersistedSettings(),
          assetDirectory: customAssets,
          cloudDeviceId: "mp_abcdefabcdefabcdefabcdefabcdef12"
        },
        null,
        2
      ),
      "utf8"
    );

    const settings = await new ConfigStore(dir).load();
    expect(settings.assetDirectory).toBe(customAssets);
  });
});

function minimalPersistedSettings() {
  return {
    onboarded: true,
    assetMapping: {},
    openClawUrls: ["ws://127.0.0.1:18789"],
    openClawSessionKey: "main",
    openAIBaseUrl: "https://newkey.versecraft.cn/",
    openAIModel: "minipet",
    aiMode: "cloud",
    cloudApiOrigin: MANAGED_API_ORIGIN,
    permissionMode: "safe",
    adminAdvanced: false,
    theme: "light",
    alwaysOnTop: true,
    clickThrough: false,
    petScale: 1,
    enabledSkills: {},
    coreInstallState: "not_started",
    runtimeDir: path.join(os.tmpdir(), "runtime"),
    coreAutoStart: true,
    advancedUnlocked: false,
    outputDirectory: path.join(os.tmpdir(), "output"),
    voiceInputEnabled: true,
    proactiveSpeechEnabled: true,
    quietHoursEnabled: true,
    quietHoursStart: "23:00",
    quietHoursEnd: "08:00",
    talkAutoHideSeconds: 30
  };
}
