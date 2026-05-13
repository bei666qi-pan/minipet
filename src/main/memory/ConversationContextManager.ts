import type { LlmChatMessage } from "../llm/OpenAICompatibleClient";
import { MemoryRetriever } from "./MemoryRetriever";
import type { ConversationTurn, MemoryCandidate, MemoryKind, MemorySource, MemoryStore } from "./MemoryStore";
import { isSensitiveMemoryText } from "./MemoryStore";

export const MINIPET_PERSONA_PROMPT =
  "你是爪爪，一个低打扰、可信任的桌面陪伴伙伴。你可以自然记得用户明确告诉你的偏好、称呼、长期项目和重要事件，让用户感觉被持续陪伴；但不要假装拥有真实感官、不要编造你看到了屏幕或隐私内容。涉及文件、网页、系统操作、付款、发送消息、删除或敏感信息时，必须等待用户点头。请用简洁自然的中文回答，像稳定陪伴者，不像问答机器。";

export interface ContextBuildInput {
  currentUserText: string;
  systemPrompt?: string;
}

export interface RecordExchangeOptions {
  memoryEnabled: boolean;
  autoExtractEnabled: boolean;
  useModelCompression: boolean;
  summarize?: (prompt: string) => Promise<string>;
}

const MAX_RECENT_TURNS = 8;
const COMPACT_TURN_THRESHOLD = 16;
const COMPACT_CHAR_THRESHOLD = 8000;

export class ConversationContextManager {
  private readonly retriever = new MemoryRetriever();

  constructor(private readonly store: MemoryStore) {}

  async buildMessages(input: ContextBuildInput): Promise<LlmChatMessage[]> {
    const context = await this.store.getContext();
    const memories = await this.retriever.search(input.currentUserText, await this.store.list(), { limit: 6, maxChars: 1200 });
    if (memories.length) await this.store.touch(memories.map((memory) => memory.id));
    const contextText = buildContextText(context.summary, memories);
    const messages: LlmChatMessage[] = [{ role: "system", content: input.systemPrompt ?? MINIPET_PERSONA_PROMPT }];
    if (contextText) messages.push({ role: "system", content: contextText });
    messages.push(...context.turns.slice(-MAX_RECENT_TURNS).map(turnToMessage));
    messages.push({ role: "user", content: input.currentUserText });
    return messages;
  }

  async augmentMessages(messages: LlmChatMessage[]): Promise<LlmChatMessage[]> {
    const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? messages.map((message) => message.content).join("\n");
    const context = await this.store.getContext();
    const memories = await this.retriever.search(lastUser, await this.store.list(), { limit: 6, maxChars: 1200 });
    if (memories.length) await this.store.touch(memories.map((memory) => memory.id));
    const contextText = buildContextText(context.summary, memories);
    if (!contextText) return messages;
    const index = messages.findIndex((message) => message.role === "system");
    const injected: LlmChatMessage = { role: "system", content: contextText };
    if (index < 0) return [injected, ...messages];
    return [...messages.slice(0, index + 1), injected, ...messages.slice(index + 1)];
  }

  async buildPrompt(basePrompt: string, currentUserText: string): Promise<string> {
    const messages = await this.buildMessages({ currentUserText, systemPrompt: basePrompt });
    return messages.map((message) => `${roleLabel(message.role)}：${message.content}`).join("\n\n");
  }

  async recordExchange(userText: string, assistantText: string, options: RecordExchangeOptions): Promise<void> {
    if (!options.memoryEnabled) return;
    await this.applyForgetCommand(userText);
    if (options.autoExtractEnabled) {
      for (const candidate of extractMemoryCandidates(userText, "auto")) await this.store.upsert(candidate);
    }
    const context = await this.store.getContext();
    const now = new Date().toISOString();
    const turns: ConversationTurn[] = [
      ...context.turns,
      { role: "user" as const, text: userText, createdAt: now },
      { role: "assistant" as const, text: assistantText, createdAt: now }
    ].slice(-24);
    const next = { summary: context.summary, turns, updatedAt: now };
    if (shouldCompact(next.turns, next.summary)) {
      next.summary = await this.compact(next.summary, turns, options);
      next.turns = turns.slice(-MAX_RECENT_TURNS);
      next.updatedAt = new Date().toISOString();
    }
    await this.store.setContext(next);
  }

  private async applyForgetCommand(userText: string): Promise<void> {
    const match = /(忘记|不要记住|别记住|删掉记忆|forget)(.+)$/i.exec(userText);
    if (match?.[2]) await this.store.forgetMatching(match[2]);
  }

  private async compact(summary: string, turns: ConversationTurn[], options: RecordExchangeOptions): Promise<string> {
    const prompt =
      "请把爪爪与用户的对话压缩成长期上下文摘要。保留用户偏好、称呼、关系状态、长期项目、未完成事项、重要日期，以及爪爪需要保持连续性的状态。不要保存密码、密钥、验证码、银行卡、身份证、详细住址等敏感信息。用 8 条以内中文要点输出。\n\n" +
      `已有摘要：${summary || "无"}\n\n` +
      `最近对话：\n${turns.map((turn) => `${roleLabel(turn.role)}：${turn.text}`).join("\n")}`;
    if (options.useModelCompression && options.summarize) {
      try {
        const modelSummary = (await options.summarize(prompt)).trim();
        if (modelSummary) return modelSummary.slice(0, 4000);
      } catch {
        // Fall back to deterministic compression below.
      }
    }
    return fallbackSummary(summary, turns);
  }
}

export function extractMemoryCandidates(userText: string, defaultSource: MemorySource): MemoryCandidate[] {
  const explicit = /(记住|帮我记住|remember)\s*[：:，,]?\s*(.+)$/i.exec(userText);
  if (explicit?.[2]) {
    const text = explicit[2].trim();
    return [
      {
        kind: inferKind(text),
        text,
        source: "explicit",
        sensitivity: isSensitiveMemoryText(text) ? "sensitive" : "normal",
        importance: 5
      }
    ];
  }
  const candidates: MemoryCandidate[] = [];
  const patterns: Array<{ kind: MemoryKind; re: RegExp; prefix?: string; importance?: number }> = [
    { kind: "relationship", re: /(?:我叫|叫我)([^，。,.!?\s]{1,24})/, prefix: "用户希望被称呼为", importance: 4.5 },
    { kind: "preference", re: /我(?:喜欢|偏好|更喜欢|习惯|希望|不喜欢|讨厌)([^。.!?\n]{2,90})/, prefix: "用户偏好", importance: 4 },
    { kind: "project", re: /我(?:正在|在|要)(?:做|开发|写|准备|研究)([^。.!?\n]{3,100})/, prefix: "用户正在处理", importance: 4 },
    { kind: "event", re: /([^。.!?\n]{0,30}(?:明天|后天|下周|下个月|考试|面试|截止|生日|纪念日|DDL|ddl)[^。.!?\n]{2,100})/, importance: 3.5 }
  ];
  for (const pattern of patterns) {
    const match = pattern.re.exec(userText);
    if (!match?.[1]) continue;
    const raw = `${pattern.prefix ? `${pattern.prefix}：` : ""}${match[1].trim()}`;
    if (isSensitiveMemoryText(raw)) continue;
    candidates.push({ kind: pattern.kind, text: raw, source: defaultSource, importance: pattern.importance, sensitivity: "normal" });
  }
  return candidates;
}

function buildContextText(summary: string, memories: Array<{ text: string; kind: string; source: string }>): string {
  const parts: string[] = [];
  if (summary.trim()) parts.push(`长期摘要：\n${summary.trim()}`);
  if (memories.length) {
    parts.push(`可引用的长期记忆：\n${memories.map((memory) => `- [${memory.kind}/${memory.source}] ${memory.text}`).join("\n")}`);
  }
  if (!parts.length) return "";
  return `${parts.join("\n\n")}\n\n只在相关时自然引用这些记忆；不要逐条复述，也不要暴露内部检索过程。`;
}

function turnToMessage(turn: ConversationTurn): LlmChatMessage {
  return { role: turn.role, content: turn.text };
}

function roleLabel(role: string): string {
  return role === "assistant" ? "爪爪" : role === "system" ? "系统" : "用户";
}

function shouldCompact(turns: ConversationTurn[], summary: string): boolean {
  const chars = turns.reduce((total, turn) => total + turn.text.length, summary.length);
  return turns.length > COMPACT_TURN_THRESHOLD || chars > COMPACT_CHAR_THRESHOLD;
}

function fallbackSummary(summary: string, turns: ConversationTurn[]): string {
  const important = turns
    .filter((turn) => turn.role === "user")
    .flatMap((turn) => extractMemoryCandidates(turn.text, "auto").map((item) => item.text))
    .slice(-10);
  const lines = [summary, ...important.map((item) => `- ${item}`)].filter(Boolean).join("\n");
  return (lines || turns.slice(-6).map((turn) => `${roleLabel(turn.role)}：${turn.text}`).join("\n")).slice(0, 4000);
}

function inferKind(text: string): MemoryKind {
  if (/叫我|我叫|称呼|朋友|家人|同事|关系/.test(text)) return "relationship";
  if (/喜欢|偏好|习惯|希望|不喜欢|讨厌|风格/.test(text)) return "preference";
  if (/项目|论文|工作|学习|开发|研究|准备/.test(text)) return "project";
  if (/明天|后天|下周|考试|面试|截止|生日|纪念|ddl|DDL/.test(text)) return "event";
  return "fact";
}
