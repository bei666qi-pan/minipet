import { estimateTokensFromMessages, estimateTokensFromText, normalizeTokenCount } from "./tokens";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface NewApiChatResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  upstreamStatus: number;
  estimated: boolean;
}

type JsonRecord = Record<string, unknown>;

export async function chatWithNewApi(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs?: number;
}): Promise<NewApiChatResult> {
  const url = new URL("chat/completions", ensureTrailingSlash(normalizeBaseUrl(input.baseUrl)));
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: 0.7,
      stream: false
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 60_000)
  });
  const upstreamStatus = response.status;
  if (!response.ok) throw new Error(`upstream_status_${response.status}`);
  const json = (await response.json()) as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = extractChatText(json);
  if (!hasVisibleText(text)) throw new Error("upstream_empty_response");
  const promptFallback = estimateTokensFromMessages(input.messages);
  const completionFallback = estimateTokensFromText(text);
  const hasUsage = typeof json.usage?.total_tokens === "number";
  const promptTokens = normalizeTokenCount(json.usage?.prompt_tokens, promptFallback);
  const completionTokens = normalizeTokenCount(json.usage?.completion_tokens, completionFallback);
  return {
    text,
    model: json.model || input.model,
    promptTokens,
    completionTokens,
    totalTokens: normalizeTokenCount(json.usage?.total_tokens, promptTokens + completionTokens),
    upstreamStatus,
    estimated: !hasUsage
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (/\/v1\/?$/.test(trimmed)) return trimmed;
  return `${trimmed.replace(/\/+$/, "")}/v1`;
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
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

function extractChoiceText(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";
  const message = asRecord(record.message);
  const messageText = message ? extractFirstContent(message, ["content", "text", "output_text"]) : "";
  if (hasVisibleText(messageText)) return messageText;
  const delta = asRecord(record.delta);
  const deltaText = delta ? extractFirstContent(delta, ["content", "text", "output_text"]) : "";
  if (hasVisibleText(deltaText)) return deltaText;
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
