export interface OpenClawHandshake {
  role: "operator";
  scopes: string[];
  sessionKey: string;
  token?: string;
}

export interface OpenClawRequest<TParams = unknown> {
  id: string;
  method: string;
  params?: TParams;
  role?: "operator";
  scopes?: string[];
  sessionKey?: string;
}

export interface OpenClawResponse<TResult = unknown> {
  id: string;
  result?: TResult;
  error?: {
    code?: string | number;
    message: string;
    data?: unknown;
  };
}

export interface OpenClawEvent {
  type: string;
  requestId?: string;
  localRequestId?: string;
  sessionId?: string;
  messageId?: string;
  method?: string;
  status?: string;
  text?: string;
  payload?: unknown;
  createdAt: string;
}

export interface OpenClawStatus {
  connected: boolean;
  url?: string;
  version?: string;
  scopes: string[];
  sessionKey: string;
  lastError?: string;
  demoMode: boolean;
}

export interface ChatSendParams {
  content: string;
  sessionKey: string;
  localRequestId: string;
  model?: string;
}

export interface ChatSendResult {
  requestId?: string;
  sessionId?: string;
  messageId?: string;
  text?: string;
  unsupported?: boolean;
}

export function makeRequestId(prefix = "mp"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
