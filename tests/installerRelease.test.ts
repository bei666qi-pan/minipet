import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows installer and release publishing", () => {
  it("uses a one-click per-user NSIS installer with versioned x64 artifact names", () => {
    const config = fs.readFileSync(path.join(process.cwd(), "electron-builder.yml"), "utf8");
    expect(config).toContain("productName: MiniPet");
    expect(config).toContain("artifactName: MiniPetSetup-${version}-x64.${ext}");
    expect(config).toContain("oneClick: true");
    expect(config).toContain("perMachine: false");
    expect(config).toContain("allowElevation: false");
    expect(config).toContain("allowToChangeInstallationDirectory: false");
    expect(config).toContain("createDesktopShortcut: true");
    expect(config).toContain("createStartMenuShortcut: true");
    expect(config).toContain("runAfterFinish: true");
  });

  it("generates and publishes a latest release manifest after dist:win", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(packageJson.scripts["dist:win"]).toContain("release:manifest");

    const manifestScript = fs.readFileSync(path.join(process.cwd(), "scripts/generate-release-manifest.mjs"), "utf8");
    expect(manifestScript).toContain("sha256");
    expect(manifestScript).toContain("installer_url");
    expect(manifestScript).toContain("release_notes");
    expect(manifestScript).toContain("published_at");
    expect(manifestScript).toContain("MiniPetSetup-${version}-x64.exe");

    const uploadScript = fs.readFileSync(path.join(process.cwd(), "scripts/upload-release-to-tos.mjs"), "utf8");
    expect(uploadScript).toContain("releases/v${version}");
    expect(uploadScript).toContain("latest/MiniPetSetup.exe");
    expect(uploadScript).toContain("latest/latest.json");
    expect(uploadScript).toContain("latest_json_sha256_mismatch");
    expect(uploadScript).toContain("latest_installer_size_mismatch");
    expect(uploadScript).toContain("request_timeout_");

    const workflow = fs.readFileSync(path.join(process.cwd(), ".github/workflows/build-windows.yml"), "utf8");
    expect(workflow).toContain("release/MiniPetSetup-*-x64.exe");
    expect(workflow).toContain("release/latest.json");
    expect(workflow).toContain("scripts/upload-release-to-tos.mjs");
  });

  it("defines the tag-driven desktop release workflow without embedding secrets", () => {
    const workflow = fs.readFileSync(path.join(process.cwd(), ".github/workflows/desktop-release.yml"), "utf8");
    expect(workflow).toContain('tags:');
    expect(workflow).toContain('- "v*"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("pnpm run typecheck");
    expect(workflow).toContain("pnpm test");
    expect(workflow).toContain("pnpm run build");
    expect(workflow).toContain("pnpm run dist:win");
    expect(workflow).toContain("gh release upload");
    expect(workflow).toContain("pnpm run release:upload");
    expect(workflow).toContain("/admin/releases/publish");
    expect(workflow).not.toMatch(/AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}/);
  });
});
