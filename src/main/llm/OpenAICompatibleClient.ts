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

type JsonRecord = Record<string, unknown>;

const EMPTY_MODEL_RESPONSE_MESSAGE = "模型返回了空内容，请稍后再试或检查模型配置。";

class EmptyModelResponseError extends Error {
  constructor() {
    super(EMPTY_MODEL_RESPONSE_MESSAGE);
  }
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
        text: "爪爪还不能用你的自带聊天。你也可以切回默认聊天直接使用。",
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
    if (!config.apiKey) return { ok: false, message: "请先填写聊天凭证。" };
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
    return { ok: false, message: "连接失败，请检查地址和凭证后再试。" };
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
      throw new Error(`模型接口返回 ${response.status}: ${text.slice(0, 160)}`);
    }
    if (stream && response.body) {
      const text = await readOpenAIStream(response.body);
      if (!hasVisibleText(text)) throw new EmptyModelResponseError();
      return { text, baseUrlUsed: baseUrl, model: config.model, streamingUsed: true };
    }
    const json = await response.json();
    const text = extractChatText(json);
    if (!hasVisibleText(text)) throw new EmptyModelResponseError();
    return {
      text,
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
    for (const line of lines) output += extractSseLineText(line);
  }
  buffer += decoder.decode();
  if (buffer.trim()) output += extractSseLineText(buffer);
  return output;
}

function extractSseLineText(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return "";
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  try {
    return extractStreamText(JSON.parse(payload));
  } catch {
    // Ignore malformed stream fragments from partial compatible gateways.
    return "";
  }
}

function extractChatText(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";
  const choices = Array.isArray(record.choices) ? record.choices : [];
  for (const choice of choices) {
    const text = extractChoiceText(choice);
    if (hasVisibleText(text)) return text.trim();
  }
  return extractFirstContent(record, ["text", "output_text"]).trim();
}

function extractStreamText(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";
  const choices = Array.isArray(record.choices) ? record.choices : [];
  for (const choice of choices) {
    const text = extractChoiceText(choice);
    if (hasVisibleText(text)) return text;
  }
  return extractFirstContent(record, ["text", "output_text"]);
}

function extractChoiceText(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";
  const delta = asRecord(record.delta);
  const deltaText = delta ? extractFirstContent(delta, ["content", "text", "output_text"]) : "";
  if (hasVisibleText(deltaText)) return deltaText;
  const message = asRecord(record.message);
  const messageText = message ? extractFirstContent(message, ["content", "text", "output_text"]) : "";
  if (hasVisibleText(messageText)) return messageText;
  return extractFirstContent(record, ["text", "output_text"]);
}

function extractFirstContent(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const text = extractContentText(record[key]);
    if (hasVisibleText(text)) return text;
  }
  return "";
}

function extractContentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractContentText).join("");
  const record = asRecord(value);
  if (!record) return "";
  return extractFirstContent(record, ["text", "content", "output_text"]);
}

function hasVisibleText(value: string): boolean {
  return value.trim().length > 0;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}
