export function estimateTokensFromMessages(messages: Array<{ content?: string }>): number {
  const chars = messages.reduce((sum, message) => sum + String(message.content || "").length, 0);
  return Math.max(1, Math.ceil(chars / 3.2));
}

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.2));
}

export function normalizeTokenCount(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.ceil(number);
}
