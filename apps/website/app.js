const releaseState = {
  fallbackUrl: "https://download.minipet.versecraft.cn/latest/MiniPetSetup.exe"
};

void loadRelease();

async function loadRelease() {
  const release = await fetchRelease();
  const installerUrl = normalizeInstallerUrl(release.installer_url || release.installerUrl || release.downloadUrl || releaseState.fallbackUrl);
  document.querySelector("#download-button").href = installerUrl;
  document.querySelector("#version").textContent = release.version || "0.1.0";
  document.querySelector("#size").textContent = release.size ? formatBytes(release.size) : "待公布";
  document.querySelector("#sha256").textContent = release.sha256 || "待公布";
  document.querySelector("#changelog-content").innerHTML = `
    <p><strong>${escapeHtml(release.version || "0.1.0")}</strong></p>
    <p>${escapeHtml(release.release_notes || release.notes || "最新 Windows 安装包已准备好。")}</p>
    <p>下载地址：<a href="${escapeHtml(installerUrl)}">${escapeHtml(installerUrl)}</a></p>
  `;
}

async function fetchRelease() {
  const endpoints = ["/v1/releases/latest", "https://download.minipet.versecraft.cn/latest/latest.json", "https://api.minipet.versecraft.cn/v1/releases/latest"];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      // Try the next endpoint.
    }
  }
  return {
    version: "0.1.0",
    installerUrl: releaseState.fallbackUrl,
    notes: "暂时无法获取最新版本信息，请稍后刷新。"
  };
}

function normalizeInstallerUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname === "download.minipet.versecraft.cn") return url.toString();
  } catch {
    // Fall through to safe fallback.
  }
  return releaseState.fallbackUrl;
}

function formatBytes(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "待公布";
  const units = ["B", "KB", "MB", "GB"];
  let size = number;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
