import { EventEmitter } from "node:events";
import type {
  ChatSendParams,
  ChatSendResult,
  OpenClawHandshake,
  OpenClawRequest,
  OpenClawResponse,
  OpenClawStatus
} from "./OpenClawProtocol";
import { makeRequestId } from "./OpenClawProtocol";
import { parseOpenClawEvent } from "./OpenClawEvents";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

export class OpenClawClient extends EventEmitter {
  private socket?: WebSocket;
  private pending = new Map<string, PendingRequest>();
  private activeUrl?: string;
  private version?: string;
  private lastError?: string;
  private handshake: OpenClawHandshake = { role: "operator", scopes: [], sessionKey: "main" };

  async connect(urls: string[], handshake: OpenClawHandshake, timeoutMs = 2500): Promise<OpenClawStatus> {
    this.handshake = handshake;
    this.disconnect();
    for (const url of urls) {
      try {
        await this.connectOne(url, timeoutMs);
        this.activeUrl = url;
        this.lastError = undefined;
        await this.request("health", { client: "MiniPet OpenClaw Companion" }, 1800).catch(() => undefined);
        const status = await this.request<Record<string, unknown>>("status", { sessionKey: handshake.sessionKey }, 1800).catch(() => undefined);
        this.version = typeof status?.version === "string" ? status.version : undefined;
        return this.status();
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.disconnect();
      }
    }
    return this.status(true);
  }

  disconnect(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("OpenClaw 连接已关闭。"));
    }
    this.pending.clear();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) this.socket.close();
    }
    this.socket = undefined;
    this.activeUrl = undefined;
  }

  status(forceDemo = false): OpenClawStatus {
    const connected = this.socket?.readyState === WebSocket.OPEN;
    return {
      connected,
      url: this.activeUrl,
      version: this.version,
      scopes: this.handshake.scopes,
      sessionKey: this.handshake.sessionKey,
      lastError: this.lastError,
      demoMode: forceDemo || !connected
    };
  }

  async chatSend(params: ChatSendParams): Promise<ChatSendResult> {
    return this.request<ChatSendResult>("chat.send", params, 120000).catch((error) => {
      if (/not found|unknown method|unsupported/i.test(String(error.message))) {
        return {
          unsupported: true,
          text: "当前 OpenClaw 版本不支持 chat.send。"
        };
      }
      throw error;
    });
  }

  async request<TResult = unknown>(method: string, params?: unknown, timeoutMs = 30000): Promise<TResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("OpenClaw Gateway 未连接。");
    const id = makeRequestId("oc");
    const payload: OpenClawRequest = {
      id,
      method,
      params,
      role: this.handshake.role,
      scopes: this.handshake.scopes,
      sessionKey: this.handshake.sessionKey
    };
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OpenClaw 请求超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as TResult),
        reject,
        timer
      });
      this.socket?.send(JSON.stringify(payload));
    });
  }

  private async connectOne(url: string, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`连接 OpenClaw 超时：${url}`));
      }, timeoutMs);

      socket.onopen = () => {
        clearTimeout(timer);
        this.socket = socket;
        this.installSocketHandlers(socket);
        socket.send(
          JSON.stringify({
            id: makeRequestId("hello"),
            method: "connect",
            params: this.handshake
          })
        );
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`无法连接 OpenClaw：${url}`));
      };
    });
  }

  private installSocketHandlers(socket: WebSocket): void {
    socket.onmessage = (message) => {
      const data = String(message.data);
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        this.emit("event", {
          type: "log.text",
          text: data,
          createdAt: new Date().toISOString()
        });
        return;
      }
      const maybeResponse = parsed as Partial<OpenClawResponse>;
      if (maybeResponse.id && this.pending.has(maybeResponse.id)) {
        const pending = this.pending.get(maybeResponse.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(maybeResponse.id);
        if (maybeResponse.error) pending.reject(new Error(maybeResponse.error.message || "OpenClaw 请求失败。"));
        else pending.resolve(maybeResponse.result);
        return;
      }
      const event = parseOpenClawEvent(parsed);
      if (event) this.emit("event", event);
    };
    socket.onclose = () => {
      this.lastError = "OpenClaw 连接已断开。";
      this.emit("status", this.status(true));
    };
  }
}
