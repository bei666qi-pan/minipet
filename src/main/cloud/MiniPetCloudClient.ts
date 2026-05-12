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

export class MiniPetCloudClient {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly secureStore: SecureStore
  ) {}

  async chat(messages: CloudChatMessage[], appVersion: string): Promise<CloudChatResult> {
    const settings = this.configStore.get();
    const auth = await this.ensureDevice(appVersion);
    const response = await fetch(new URL("/api/chat", settings.cloudApiOrigin), {
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
      const retryAuth = await this.ensureDevice(appVersion);
      return this.chatWithToken(messages, retryAuth.token, settings.cloudApiOrigin);
    }
    return parseChatResponse(response);
  }

  private async chatWithToken(messages: CloudChatMessage[], token: string, apiOrigin: string): Promise<CloudChatResult> {
    const response = await fetch(new URL("/api/chat", apiOrigin), {
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

  async ensureDevice(appVersion: string): Promise<{ deviceId: string; token: string; quotaRemaining?: number }> {
    const settings = this.configStore.get();
    const existingToken = await this.secureStore.getSecret("cloudDeviceToken");
    if (settings.cloudDeviceId && existingToken) {
      return { deviceId: settings.cloudDeviceId, token: existingToken };
    }
    const deviceId = settings.cloudDeviceId || makeDeviceId();
    const response = await fetch(new URL("/api/device/register", settings.cloudApiOrigin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, appVersion, platform: process.platform }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`云端注册失败：${response.status}`);
    const json = (await response.json()) as { token?: string; quotaRemaining?: number; device?: { id?: string } };
    if (!json.token) throw new Error("云端没有返回设备授权。");
    await this.configStore.update({ cloudDeviceId: json.device?.id || deviceId });
    await this.secureStore.setSecret("cloudDeviceToken", json.token, true);
    return { deviceId: json.device?.id || deviceId, token: json.token, quotaRemaining: json.quotaRemaining };
  }
}

async function parseChatResponse(response: Response): Promise<CloudChatResult> {
  const json = (await response.json().catch(() => ({}))) as { error?: string; text?: string; model?: string; quotaRemaining?: number; usage?: CloudChatResult["usage"] };
  if (!response.ok) {
    if (json.error === "quota_exceeded") throw new Error("当前设备额度已用完，请联系管理员增加额度。");
    if (json.error === "device_disabled") throw new Error("当前设备已被管理员禁用。");
    if (json.error === "model_backend_not_configured") throw new Error("MiniPet 云端模型暂未配置，请稍后再试。");
    throw new Error(`MiniPet 云端请求失败：${response.status}`);
  }
  return {
    text: json.text || "我暂时没有生成内容，请稍后再试。",
    model: json.model,
    quotaRemaining: json.quotaRemaining,
    usage: json.usage
  };
}

function makeDeviceId(): string {
  return `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
