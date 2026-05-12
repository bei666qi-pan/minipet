import { normalizeOpenAIBaseUrl, withV1BaseUrl } from "../security/urlGuard";

export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmClientConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export interface LlmChatResult {
  text: string;
  baseUrlUsed: string;
  model: string;
  streamingUsed: boolean;
}

export class OpenAICompatibleClient {
  async listModels(config: LlmClientConfig): Promise<string[]> {
    const urls = uniqueBaseUrls(config.baseUrl);
    for (const baseUrl of urls) {
      try {
        const response = await fetch(new URL("models", ensureTrailingSlash(baseUrl)), {
          headers: this.headers(config.apiKey),
          signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) continue;
        const json = (await response.json()) as { data?: Array<{ id?: string }> };
        return (json.data ?? []).map((item) => item.id).filter(Boolean) as string[];
      } catch {
        // Some OpenAI-compatible gateways do not expose /models. Chat can still work.
      }
    }
    return [];
  }

  async chat(config: LlmClientConfig, messages: LlmChatMessage[]): Promise<LlmChatResult> {
    if (!config.apiKey) {
      return {
        text: "普通聊天还没有配置授权信息。你可以先准备智能核心，或在伙伴小屋的高级入口里配置聊天授权。",
        baseUrlUsed: config.baseUrl,
        model: config.model,
        streamingUsed: false
      };
    }
    const urls = uniqueBaseUrls(config.baseUrl);
    let lastError: unknown;
    for (const baseUrl of urls) {
      try {
        return await this.chatOnce(baseUrl, config, messages, true);
      } catch (error) {
        lastError = error;
        try {
          return await this.chatOnce(baseUrl, config, messages, false);
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }
    }
    throw new Error(lastError instanceof Error ? lastError.message : "聊天服务暂时不可用。");
  }

  async testConnection(config: LlmClientConfig): Promise<{ ok: boolean; message: string; baseUrlUsed?: string }> {
    if (!config.apiKey) return { ok: false, message: "未配置聊天授权。" };
    const urls = uniqueBaseUrls(config.baseUrl);
    for (const baseUrl of urls) {
      try {
        const response = await fetch(new URL("models", ensureTrailingSlash(baseUrl)), {
          headers: this.headers(config.apiKey),
          signal: AbortSignal.timeout(6000)
        });
        if (response.ok) return { ok: true, message: "连接成功。", baseUrlUsed: baseUrl };
      } catch {
        // Try chat probe next.
      }
      try {
        await this.chatOnce(baseUrl, config, [{ role: "user", content: "请回复 OK" }], false);
        return { ok: true, message: "模型接口可用。", baseUrlUsed: baseUrl };
      } catch {
        // Continue to normalized /v1 base.
      }
    }
    return { ok: false, message: "连接失败。已尝试原始 Base URL 和 /v1 规范化地址。" };
  }

  private async chatOnce(baseUrl: string, config: LlmClientConfig, messages: LlmChatMessage[], stream: boolean): Promise<LlmChatResult> {
    const response = await fetch(new URL("chat/completions", ensureTrailingSlash(baseUrl)), {
      method: "POST",
      headers: {
        ...this.headers(config.apiKey),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream,
        temperature: 0.6
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`模型接口返回 ${response.status}：${text.slice(0, 160)}`);
    }
    if (stream && response.body) {
      const text = await readOpenAIStream(response.body);
      return { text, baseUrlUsed: baseUrl, model: config.model, streamingUsed: true };
    }
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return {
      text: json.choices?.[0]?.message?.content ?? "模型没有返回内容。",
      baseUrlUsed: baseUrl,
      model: config.model,
      streamingUsed: false
    };
  }

  private headers(apiKey?: string): Record<string, string> {
    return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  }
}

function uniqueBaseUrls(baseUrl: string): string[] {
  const normalized = normalizeOpenAIBaseUrl(baseUrl);
  return Array.from(new Set([normalized, withV1BaseUrl(normalized)]));
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function readOpenAIStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        output += json.choices?.[0]?.delta?.content ?? "";
      } catch {
        // Ignore malformed stream fragments from partial compatible gateways.
      }
    }
  }
  return output || "模型没有返回内容。";
}
