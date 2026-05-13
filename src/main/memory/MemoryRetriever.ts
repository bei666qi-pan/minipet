import type { MemoryRecord } from "./MemoryStore";
import { tokenize } from "./MemoryStore";

export interface RetrievalOptions {
  limit?: number;
  maxChars?: number;
  now?: Date;
}

export class MemoryRetriever {
  search(query: string, memories: MemoryRecord[], options: RetrievalOptions = {}): MemoryRecord[] {
    const limit = options.limit ?? 6;
    const maxChars = options.maxChars ?? 1200;
    const now = options.now ?? new Date();
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return memories.slice(0, limit);
    let usedChars = 0;
    return memories
      .map((memory) => ({ memory, score: scoreMemory(queryTokens, memory, now) }))
      .filter((item) => item.score > 0.12)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.memory)
      .filter((memory) => {
        const next = usedChars + memory.text.length;
        if (next > maxChars && usedChars > 0) return false;
        usedChars = next;
        return true;
      })
      .slice(0, limit);
  }
}

function scoreMemory(queryTokens: string[], memory: MemoryRecord, now: Date): number {
  const memoryTokens = tokenize(`${memory.text} ${memory.tags.join(" ")}`);
  const memorySet = new Set(memoryTokens);
  const overlap = queryTokens.filter((token) => memorySet.has(token)).length / Math.max(1, queryTokens.length);
  const importance = memory.importance / 5;
  const sourceBoost = memory.source === "explicit" ? 0.18 : 0;
  const recency = recencyScore(memory.updatedAt, now);
  return overlap * 0.68 + importance * 0.18 + recency * 0.08 + sourceBoost;
}

function recencyScore(iso: string, now: Date): number {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return 0;
  const ageDays = Math.max(0, (now.getTime() - time) / 86_400_000);
  return Math.max(0, 1 - ageDays / 60);
}
