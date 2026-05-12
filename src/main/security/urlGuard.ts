export interface UrlGuardResult {
  ok: boolean;
  reason: string;
  normalized?: string;
}

const BLOCKED_HOSTS = new Set(["localhost.localdomain"]);
const BLOCKED_PROTOCOLS = new Set(["file:", "javascript:", "data:", "vbscript:"]);

export function validateExternalUrl(raw: string): UrlGuardResult {
  try {
    const url = new URL(raw);
    if (BLOCKED_PROTOCOLS.has(url.protocol)) {
      return { ok: false, reason: "不允许打开本地文件、脚本或 data URL。" };
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      return { ok: false, reason: "仅允许 http/https 外部链接。" };
    }
    if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
      return { ok: false, reason: "此主机不在允许范围内。" };
    }
    if (url.username || url.password) {
      return { ok: false, reason: "链接中不能包含用户名或密码。" };
    }
    return { ok: true, reason: "URL 通过检查。", normalized: url.toString() };
  } catch {
    return { ok: false, reason: "URL 格式无效。" };
  }
}

export function isAllowedExternalUrl(raw: string): boolean {
  return validateExternalUrl(raw).ok;
}

export function normalizeOpenAIBaseUrl(raw: string): string {
  const fallback = "https://newkey.versecraft.cn/";
  const value = raw.trim() || fallback;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("API Base URL 必须是 http 或 https。");
  return url.toString();
}

export function withV1BaseUrl(raw: string): string {
  const url = new URL(normalizeOpenAIBaseUrl(raw));
  if (!url.pathname.replace(/\/+$/, "").endsWith("/v1")) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/v1/`;
  }
  return url.toString();
}
