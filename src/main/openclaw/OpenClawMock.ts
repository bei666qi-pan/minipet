import type { ChatSendParams, ChatSendResult, OpenClawStatus } from "./OpenClawProtocol";

export class OpenClawMock {
  private history: Array<{ role: "user" | "assistant"; content: string; createdAt: string }> = [];

  status(sessionKey = "main"): OpenClawStatus {
    return {
      connected: false,
      scopes: [],
      sessionKey,
      demoMode: true,
      lastError: "高级功能还没有准备好，当前先用普通聊天。"
    };
  }

  async chat(params: ChatSendParams): Promise<ChatSendResult> {
    const now = new Date().toISOString();
    this.history.push({ role: "user", content: params.content, createdAt: now });
    const text = `我已收到「${params.content.slice(0, 80)}」。做演示、看网页和整理文件需要先准备一下。`;
    this.history.push({ role: "assistant", content: text, createdAt: new Date().toISOString() });
    return {
      requestId: params.localRequestId,
      sessionId: params.sessionKey,
      messageId: `mock_${Date.now()}`,
      text
    };
  }

  sessionsList(): Array<{ key: string; title: string }> {
    return [{ key: "main", title: "默认会话" }];
  }

  historyList(): Array<{ role: "user" | "assistant"; content: string; createdAt: string }> {
    return [...this.history];
  }
}
