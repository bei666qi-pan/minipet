import type { OpenClawEvent } from "./OpenClawProtocol";

export type TimelineStage =
  | "sent"
  | "connected"
  | "thinking"
  | "tool"
  | "searching"
  | "browsing"
  | "making_ppt"
  | "waiting_confirmation"
  | "completed"
  | "failed"
  | "stopped";

export function parseOpenClawEvent(raw: unknown): OpenClawEvent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const type = String(value.type ?? value.event ?? "");
  if (!type) return undefined;
  return {
    type,
    requestId: stringOrUndefined(value.requestId ?? value.request_id),
    localRequestId: stringOrUndefined(value.localRequestId ?? value.local_request_id),
    sessionId: stringOrUndefined(value.sessionId ?? value.session_id),
    messageId: stringOrUndefined(value.messageId ?? value.message_id),
    method: stringOrUndefined(value.method),
    status: stringOrUndefined(value.status),
    text: stringOrUndefined(value.text ?? value.message),
    payload: value.payload ?? value.data,
    createdAt: new Date().toISOString()
  };
}

export function stageFromEvent(event: OpenClawEvent): TimelineStage | undefined {
  const key = `${event.type} ${event.status ?? ""} ${event.method ?? ""}`.toLowerCase();
  if (/stop|cancel/.test(key)) return "stopped";
  if (/fail|error/.test(key)) return "failed";
  if (/done|complete|final|success/.test(key)) return "completed";
  if (/approval|confirm|permission/.test(key)) return "waiting_confirmation";
  if (/ppt|slide/.test(key)) return "making_ppt";
  if (/browser|playwright|web/.test(key)) return "browsing";
  if (/search|felo/.test(key)) return "searching";
  if (/tool|mcp|skill/.test(key)) return "tool";
  if (/think|plan|agent|run/.test(key)) return "thinking";
  return undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
