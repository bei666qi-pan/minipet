import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop cloud error copy", () => {
  it("shows the required disabled-account message", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/main/cloud/MiniPetCloudClient.ts"), "utf8");
    expect(source).toContain('error === "user_disabled"');
    expect(source).toContain("账号暂不可用");
    expect(source).toContain("当前网络异常，稍后再试");
  });

  it("checks releases on startup without forcing automatic updates", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    expect(source).toContain("setTimeout(() => void checkForUpdates(true, true), 2500)");
    expect(source).toContain("notifyOnlyWhenUpdate");
  });
});
