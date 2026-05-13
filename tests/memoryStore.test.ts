import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConversationContextManager, extractMemoryCandidates, MINIPET_PERSONA_PROMPT } from "../src/main/memory/ConversationContextManager";
import { MemoryRetriever } from "../src/main/memory/MemoryRetriever";
import { MemoryStore } from "../src/main/memory/MemoryStore";

describe("local long-term memory", () => {
  it("stores, merges, deletes and clears memories", async () => {
    const store = new MemoryStore(await tempDir());
    const first = await store.upsert({ kind: "preference", text: "用户偏好：用中文简洁回答", source: "explicit", importance: 5 });
    const second = await store.upsert({ kind: "preference", text: "用户偏好：用中文简洁回答", source: "auto", importance: 3 });
    expect(first?.id).toBe(second?.id);
    expect(await store.list()).toHaveLength(1);
    expect(await store.delete(first!.id)).toBe(true);
    expect(await store.list()).toHaveLength(0);
    await store.upsert({ kind: "project", text: "用户正在开发 MiniPet", source: "auto" });
    await store.clear();
    expect(await store.list()).toHaveLength(0);
  });

  it("extracts explicit memory but skips sensitive auto memory", () => {
    expect(extractMemoryCandidates("记住：我喜欢回答短一点", "auto")[0]).toMatchObject({ source: "explicit", importance: 5 });
    expect(extractMemoryCandidates("我的密码是 123456，请以后记得", "auto")).toHaveLength(0);
  });

  it("retrieves memories by sparse relevance, importance and character budget", async () => {
    const store = new MemoryStore(await tempDir());
    await store.upsert({ kind: "project", text: "用户正在开发 MiniPet 长期记忆功能", source: "explicit", importance: 5 });
    await store.upsert({ kind: "preference", text: "用户喜欢安静低打扰的提醒", source: "auto", importance: 3 });
    const retriever = new MemoryRetriever();
    const result = retriever.search("MiniPet 记忆怎么做", await store.list(), { maxChars: 80 });
    expect(result[0]?.text).toContain("长期记忆");
  });

  it("builds stable-prefix messages and falls back when model compression fails", async () => {
    const store = new MemoryStore(await tempDir());
    await store.upsert({ kind: "preference", text: "用户喜欢被叫小林", source: "explicit", importance: 5 });
    const manager = new ConversationContextManager(store);
    const messages = await manager.buildMessages({ currentUserText: "我今天继续做 MiniPet" });
    expect(messages[0]).toMatchObject({ role: "system", content: MINIPET_PERSONA_PROMPT });
    expect(messages.map((item) => item.content).join("\n")).toContain("小林");

    for (let index = 0; index < 9; index += 1) {
      await manager.recordExchange(`我正在开发第 ${index} 个 MiniPet 记忆功能模块`, "我记下这个进展。", {
        memoryEnabled: true,
        autoExtractEnabled: true,
        useModelCompression: true,
        summarize: async () => {
          throw new Error("model unavailable");
        }
      });
    }
    const context = await store.getContext();
    expect(context.summary || context.turns.map((turn) => turn.text).join("\n")).toContain("MiniPet");
    expect(context.turns.length).toBeLessThanOrEqual(8);
  });
});

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "minipet-memory-"));
}
