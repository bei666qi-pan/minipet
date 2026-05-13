import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("floating ball context menu", () => {
  it("opens the pet menu from the floating ball context menu", () => {
    const source = read("src/renderer/components/FloatingBall.tsx");
    expect(source).toMatch(/onContextMenu/);
    expect(source).toMatch(/event\.preventDefault\(\)/);
    expect(source).toMatch(/window:open-pet-menu/);
    expect(source).toMatch(/setPassThrough\(false\)/);
  });

  it("keeps hide floating ball IPC channel in all allowlists", () => {
    for (const file of ["src/main/preload.ts", "src/main/security/ipcGuard.ts", "src/renderer/vite-env.d.ts"]) {
      expect(read(file)).toContain("window:hide-floating-ball");
    }
  });

  it("uses the sender window for the native pet menu and exposes close and quit actions", () => {
    const source = read("src/main/main.ts");
    expect(source).toMatch(/openPetContextMenu\(windowForSender\(event\)\)/);
    expect(source).toMatch(/关闭悬浮球/);
    expect(source).toMatch(/退出爪爪/);
    expect(source).toMatch(/function quitApp\(\): void/);
    expect(source).toMatch(/app\.quit\(\)/);
  });
});
