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
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content?.trim() || "MiniPet did not receive a model reply. Please try again.";
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
