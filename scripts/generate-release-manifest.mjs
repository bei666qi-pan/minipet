import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const version = process.env.MINIPET_RELEASE_VERSION || packageJson.version;
const defaultInstaller = path.join("release", `MiniPetSetup-${version}-x64.exe`);
const installerPath = process.argv[2] || defaultInstaller;
const outputPath = process.argv[3] || path.join("release", "latest.json");
const channel = process.env.MINIPET_RELEASE_CHANNEL || "stable";
const notes = process.env.MINIPET_RELEASE_NOTES || `爪爪 ${version}`;
const downloadOrigin = (process.env.MINIPET_DOWNLOAD_ORIGIN || process.env.VOLCENGINE_CDN_DOMAIN || "https://download.minipet.versecraft.cn").replace(/^([^:]+)$/, "https://$1").replace(/\/+$/, "");
const installerName = path.basename(installerPath);
const versionedInstallerUrl = `${downloadOrigin}/releases/v${version}/${installerName}`;
const latestInstallerUrl = `${downloadOrigin}/latest/MiniPetSetup.exe`;
const publishedAt = new Date().toISOString();

const bytes = await fs.readFile(installerPath);
const manifest = {
  version,
  channel,
  installer_url: latestInstallerUrl,
  installerUrl: latestInstallerUrl,
  downloadUrl: latestInstallerUrl,
  versioned_installer_url: versionedInstallerUrl,
  versionedInstallerUrl,
  portable_url: null,
  sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  size: bytes.length,
  release_notes: notes,
  notes,
  published_at: publishedAt,
  created_at: publishedAt
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await fs.writeFile(path.join(path.dirname(outputPath), `release-manifest-${version}.json`), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("release_manifest_generated", { version, installer: installerPath, output: outputPath, size: bytes.length, sha256: manifest.sha256 });
