import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { defaultConfigDir } from "../configStore";

export type MemoryKind = "preference" | "relationship" | "project" | "event" | "fact";
export type MemorySensitivity = "normal" | "sensitive";
export type MemorySource = "auto" | "explicit";

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  text: string;
  tags: string[];
  importance: number;
  sensitivity: MemorySensitivity;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export interface ConversationContextState {
  summary: string;
  turns: ConversationTurn[];
  updatedAt?: string;
}

interface MemoryFileData {
  version: 1;
  memories: MemoryRecord[];
  context: ConversationContextState;
}

export interface MemoryCandidate {
  kind: MemoryKind;
  text: string;
  tags?: string[];
  importance?: number;
  sensitivity?: MemorySensitivity;
  source?: MemorySource;
}

const DEFAULT_DATA: MemoryFileData = {
  version: 1,
  memories: [],
  context: { summary: "", turns: [] }
};

export class MemoryStore {
  private data: MemoryFileData = cloneData(DEFAULT_DATA);
  private loaded = false;
  private readonly filePath: string;

  constructor(configDir = defaultConfigDir()) {
    this.filePath = path.join(configDir, "memory.json");
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")) as Partial<MemoryFileData>;
      this.data = {
        version: 1,
        memories: Array.isArray(parsed.memories) ? parsed.memories.map(normalizeMemory).filter(Boolean) as MemoryRecord[] : [],
        context: normalizeContext(parsed.context)
      };
    } catch {
      this.data = cloneData(DEFAULT_DATA);
      await this.save();
    }
    this.loaded = true;
  }

  async list(): Promise<MemoryRecord[]> {
    await this.load();
    return this.data.memories.map((item) => ({ ...item, tags: [...item.tags] }));
  }

  async upsert(candidate: MemoryCandidate): Promise<MemoryRecord | undefined> {
    await this.load();
    const text = normalizeText(candidate.text);
    if (!text) return undefined;
    const now = new Date().toISOString();
    const normalized: MemoryRecord = {
      id: newId(),
      kind: candidate.kind,
      text,
      tags: uniqueTags(candidate.tags ?? inferTags(text)),
      importance: clampImportance(candidate.importance ?? defaultImportance(candidate.kind, candidate.source ?? "auto")),
      sensitivity: candidate.sensitivity ?? "normal",
      source: candidate.source ?? "auto",
      createdAt: now,
      updatedAt: now
    };
    const existing = this.findSimilar(normalized);
    if (existing) {
      existing.text = chooseBetterText(existing.text, normalized.text);
      existing.tags = uniqueTags([...existing.tags, ...normalized.tags]);
      existing.importance = Math.max(existing.importance, normalized.importance);
      existing.sensitivity = existing.sensitivity === "sensitive" || normalized.sensitivity === "sensitive" ? "sensitive" : "normal";
      existing.source = existing.source === "explicit" || normalized.source === "explicit" ? "explicit" : "auto";
      existing.updatedAt = now;
      await this.save();
      return { ...existing, tags: [...existing.tags] };
    }
    this.data.memories.unshift(normalized);
    this.data.memories = this.data.memories.slice(0, 500);
    await this.save();
    return { ...normalized, tags: [...normalized.tags] };
  }

  async delete(id: string): Promise<boolean> {
    await this.load();
    const before = this.data.memories.length;
    this.data.memories = this.data.memories.filter((item) => item.id !== id);
    if (before === this.data.memories.length) return false;
    await this.save();
    return true;
  }

  async clear(): Promise<void> {
    await this.load();
    this.data.memories = [];
    this.data.context = { summary: "", turns: [] };
    await this.save();
  }

  async forgetMatching(query: string): Promise<number> {
    await this.load();
    const tokens = tokenize(query);
    if (!tokens.length) return 0;
    const before = this.data.memories.length;
    this.data.memories = this.data.memories.filter((item) => overlapScore(tokens, tokenize(item.text)) < 0.28);
    const removed = before - this.data.memories.length;
    if (removed) await this.save();
    return removed;
  }

  async touch(ids: string[]): Promise<void> {
    await this.load();
    const now = new Date().toISOString();
    const idSet = new Set(ids);
    let changed = false;
    for (const item of this.data.memories) {
      if (idSet.has(item.id)) {
        item.lastAccessedAt = now;
        changed = true;
      }
    }
    if (changed) await this.save();
  }

  async getContext(): Promise<ConversationContextState> {
    await this.load();
    return {
      summary: this.data.context.summary,
      turns: this.data.context.turns.map((turn) => ({ ...turn })),
      updatedAt: this.data.context.updatedAt
    };
  }

  async setContext(context: ConversationContextState): Promise<void> {
    await this.load();
    this.data.context = normalizeContext(context);
    await this.save();
  }

  private findSimilar(candidate: MemoryRecord): MemoryRecord | undefined {
    const candidateTokens = tokenize(candidate.text);
    return this.data.memories.find((item) => {
      if (item.kind !== candidate.kind) return false;
      if (item.text.includes(candidate.text) || candidate.text.includes(item.text)) return true;
      return overlapScore(candidateTokens, tokenize(item.text)) >= 0.58;
    });
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
  }
}

export function isSensitiveMemoryText(text: string): boolean {
  return /密码|密钥|api\s*key|token|secret|身份证|银行卡|验证码|手机号|电话|住址|地址|password/i.test(text) || /\b\d{11}\b/.test(text) || /\S+@\S+\.\S+/.test(text);
}

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens = new Set<string>();
  for (const word of normalized.match(/[a-z0-9_]{2,}/g) ?? []) tokens.add(word);
  const compact = normalized.replace(/[^\p{Script=Han}]/gu, "");
  for (let index = 0; index < compact.length; index += 1) {
    tokens.add(compact[index]);
    if (index + 1 < compact.length) tokens.add(compact.slice(index, index + 2));
  }
  return [...tokens];
}

function normalizeMemory(value: unknown): MemoryRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<MemoryRecord>;
  if (!record.id || !record.text || !record.kind) return undefined;
  return {
    id: String(record.id),
    kind: record.kind,
    text: normalizeText(record.text),
    tags: uniqueTags(record.tags ?? []),
    importance: clampImportance(record.importance ?? 3),
    sensitivity: record.sensitivity === "sensitive" ? "sensitive" : "normal",
    source: record.source === "explicit" ? "explicit" : "auto",
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
    lastAccessedAt: record.lastAccessedAt
  };
}

function normalizeContext(value: unknown): ConversationContextState {
  if (!value || typeof value !== "object") return { summary: "", turns: [] };
  const context = value as Partial<ConversationContextState>;
  return {
    summary: normalizeText(context.summary ?? "").slice(0, 4000),
    turns: Array.isArray(context.turns)
      ? context.turns
          .filter((turn): turn is ConversationTurn => Boolean(turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string"))
          .map((turn) => ({ role: turn.role, text: normalizeText(turn.text).slice(0, 2000), createdAt: turn.createdAt || new Date().toISOString() }))
          .slice(-20)
      : [],
    updatedAt: context.updatedAt
  };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))).slice(0, 12);
}

function inferTags(text: string): string[] {
  const tags: string[] = [];
  if (/喜欢|偏好|习惯|希望|不喜欢|讨厌/.test(text)) tags.push("preference");
  if (/项目|论文|考试|工作|学习|开发/.test(text)) tags.push("project");
  if (/叫我|我叫|朋友|家人|同事/.test(text)) tags.push("relationship");
  return tags;
}

function defaultImportance(kind: MemoryKind, source: MemorySource): number {
  const base = kind === "relationship" || kind === "project" ? 4 : kind === "event" ? 3.5 : 3;
  return source === "explicit" ? Math.min(5, base + 1) : base;
}

function clampImportance(value: number): number {
  return Math.min(5, Math.max(1, Number.isFinite(value) ? value : 3));
}

function chooseBetterText(current: string, next: string): string {
  if (next.length > current.length && next.length <= 220) return next;
  return current;
}

function overlapScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  const hits = a.filter((token) => bSet.has(token)).length;
  return hits / Math.max(1, Math.min(a.length, b.length));
}

function newId(): string {
  return `mem_${crypto.randomBytes(8).toString("hex")}`;
}

function cloneData(data: MemoryFileData): MemoryFileData {
  return JSON.parse(JSON.stringify(data)) as MemoryFileData;
}
