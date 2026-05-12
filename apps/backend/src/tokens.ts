export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 3));
}

export function estimateTokensFromMessages(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, message) => sum + estimateTokensFromText(message.content), 0);
}

export function normalizeTokenCount(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
