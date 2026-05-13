import type { ConfigStore } from "../configStore";
import type { SecureStore } from "../secureStore";

export interface CloudChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CloudChatResult {
  text: string;
  model?: string;
  quotaRemaining?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface CloudQuotaResult {
  quotaTokens: number;
  usedTokens: number;
  quotaRemaining: number;
  disabled: boolean;
}

export interface CloudReleaseInfo {
  version: string;
  downloadUrl: string;
  notes: string;
  publishedAt: string;
}

export class MiniPetCloudClient {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly secureStore: SecureStore
  ) {}

  async bootstrap(appVersion: string): Promise<{ deviceId: string; token: string; quotaRemaining?: number }> {
    const settings = this.configStore.get();
    const response = await fetch(new URL("/v1/bootstrap", settings.cloudApiOrigin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: settings.cloudDeviceId, app_version: appVersion, platform: process.platform }),
      signal: AbortSignal.timeout(15_000)
    });
    const json = (await response.json().catch(() => ({}))) as { token?: string; quota_remaining?: number; quotaRemaining?: number; device?: { id?: string } };
    if (!response.ok) throw new Error(mapCloudError(undefined, response.status));
    if (!json.token) throw new Error("云端没有返回设备授权。");
    const deviceId = json.device?.id || settings.cloudDeviceId;
    await this.configStore.update({ aiMode: "cloud", cloudDeviceId: deviceId });
    await this.secureStore.setSecret("cloudDeviceToken", json.token, true);
    return { deviceId, token: json.token, quotaRemaining: json.quota_remaining ?? json.quotaRemaining };
  }

  async ensureDevice(appVersion: string): Promise<{ deviceId: string; token: string; quotaRemaining?: number }> {
    const settings = this.configStore.get();
    const existingToken = await this.secureStore.getSecret("cloudDeviceToken");
    if (settings.cloudDeviceId && existingToken) return { deviceId: settings.cloudDeviceId, token: existingToken };
    return this.bootstrap(appVersion);
  }

  async getQuota(appVersion: string): Promise<CloudQuotaResult> {
    const settings = this.configStore.get();
    const auth = await this.ensureDevice(appVersion);
    const response = await fetch(new URL("/v1/me/quota", settings.cloudApiOrigin), {
      headers: { Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (response.status === 401) {
      await this.secureStore.clearSecret("cloudDeviceToken");
      await this.bootstrap(appVersion);
      return this.getQuota(appVersion);
    }
    const json = (await response.json().catch(() => ({}))) as Partial<CloudQuotaResult> & { error?: string };
    if (!response.ok) throw new Error(mapCloudError(json.error, response.status));
    return {
      quotaTokens: Number(json.quotaTokens ?? 0),
      usedTokens: Number(json.usedTokens ?? 0),
      quotaRemaining: Number(json.quotaRemaining ?? 0),
      disabled: Boolean(json.disabled)
    };
  }

  async chat(messages: CloudChatMessage[], appVersion: string): Promise<CloudChatResult> {
    const settings = this.configStore.get();
    const auth = await this.ensureDevice(appVersion);
    const response = await fetch(new URL("/v1/chat", settings.cloudApiOrigin), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(60_000)
    });
    if (response.status === 401) {
      await this.secureStore.clearSecret("cloudDeviceToken");
      const retryAuth = await this.bootstrap(appVersion);
      return this.chatWithToken(messages, retryAuth.token, settings.cloudApiOrigin);
    }
    return parseChatResponse(response);
  }

  async getLatestRelease(): Promise<CloudReleaseInfo> {
    const settings = this.configStore.get();
    const response = await fetch(new URL("/v1/releases/latest", settings.cloudApiOrigin), {
      signal: AbortSignal.timeout(10_000)
    });
    const json = (await response.json().catch(() => ({}))) as Partial<CloudReleaseInfo>;
    if (!response.ok || !json.version || !json.downloadUrl) throw new Error("暂时无法检查更新。");
    return {
      version: json.version,
      downloadUrl: json.downloadUrl,
      notes: json.notes || "",
      publishedAt: json.publishedAt || ""
    };
  }

  private async chatWithToken(messages: CloudChatMessage[], token: string, apiOrigin: string): Promise<CloudChatResult> {
    const response = await fetch(new URL("/v1/chat", apiOrigin), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(60_000)
    });
    return parseChatResponse(response);
  }
}

async function parseChatResponse(response: Response): Promise<CloudChatResult> {
  const json = (await response.json().catch(() => ({}))) as { error?: string; text?: string; model?: string; quotaRemaining?: number; usage?: CloudChatResult["usage"] };
  if (!response.ok) throw new Error(mapCloudError(json.error, response.status));
  return {
    text: json.text || "我暂时没有生成内容，请稍后再试。",
    model: json.model,
    quotaRemaining: json.quotaRemaining,
    usage: json.usage
  };
}

function mapCloudError(error: string | undefined, status: number): string {
  if (error === "quota_exhausted" || error === "quota_exceeded") return "当前额度已用完，请联系管理员增加额度。";
  if (error === "user_disabled" || error === "device_disabled") return "账号暂不可用";
  if (error === "model_backend_not_configured") return "MiniPet 云端模型暂未配置，请稍后再试。";
  if (status === 0 || status >= 500) return "当前网络异常，稍后再试";
  return `MiniPet 云端请求失败：${status}`;
}
