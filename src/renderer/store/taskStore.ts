import { create } from "zustand";

export type TaskStatus = "queued" | "running" | "waiting_confirmation" | "success" | "error" | "stopped";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface TaskTimelineItem {
  stage: string;
  label: string;
  createdAt: string;
}

export interface LocalTask {
  localRequestId: string;
  openClawRequestId?: string;
  sessionId?: string;
  messageId?: string;
  title: string;
  method: string;
  status: TaskStatus;
  risk: RiskLevel;
  createdAt: string;
  updatedAt: string;
  result?: string;
  error?: string;
  outputs?: Array<{ filePath: string; label: string; kind: string }>;
  timeline: TaskTimelineItem[];
}

const TERMINAL = new Set<TaskStatus>(["success", "error", "stopped"]);

interface TaskState {
  tasks: LocalTask[];
  activeTaskId?: string;
  createTask: (input: { title: string; method: string; risk?: RiskLevel }) => LocalTask;
  updateTask: (id: string, patch: Partial<LocalTask>, timeline?: Omit<TaskTimelineItem, "createdAt">) => void;
  handleOpenClawEvent: (event: Record<string, unknown>) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  createTask(input) {
    const now = new Date().toISOString();
    const task: LocalTask = {
      localRequestId: makeLocalRequestId(),
      title: input.title,
      method: input.method,
      status: "queued",
      risk: input.risk ?? "low",
      createdAt: now,
      updatedAt: now,
      timeline: [{ stage: "sent", label: "已发送", createdAt: now }]
    };
    set((state) => ({ tasks: [task, ...state.tasks].slice(0, 30), activeTaskId: task.localRequestId }));
    return task;
  },
  updateTask(id, patch, timeline) {
    set((state) => ({
      tasks: state.tasks.map((task) => {
        if (task.localRequestId !== id) return task;
        if (TERMINAL.has(task.status) && patch.status && !TERMINAL.has(patch.status)) return task;
        const now = new Date().toISOString();
        return {
          ...task,
          ...patch,
          updatedAt: now,
          timeline: timeline ? [...task.timeline, { ...timeline, createdAt: now }] : task.timeline
        };
      })
    }));
  },
  handleOpenClawEvent(event) {
    const localRequestId = stringValue(event.localRequestId ?? event.local_request_id);
    const requestId = stringValue(event.requestId ?? event.request_id);
    const task = get().tasks.find((item) => item.localRequestId === localRequestId || item.openClawRequestId === requestId);
    if (!task || TERMINAL.has(task.status)) return;
    const statusText = `${event.type ?? ""} ${event.status ?? ""} ${event.method ?? ""}`.toLowerCase();
    const patch: Partial<LocalTask> = {
      status: /complete|done|final|success/.test(statusText) ? "success" : /fail|error/.test(statusText) ? "error" : "running",
      openClawRequestId: requestId ?? task.openClawRequestId,
      sessionId: stringValue(event.sessionId ?? event.session_id) ?? task.sessionId,
      messageId: stringValue(event.messageId ?? event.message_id) ?? task.messageId
    };
    get().updateTask(task.localRequestId, patch, {
      stage: stringValue(event.status) ?? stringValue(event.type) ?? "event",
      label: labelFromEvent(statusText)
    });
  }
}));

function makeLocalRequestId(): string {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function labelFromEvent(text: string): string {
  if (/search|felo/.test(text)) return "正在搜索";
  if (/browser|playwright/.test(text)) return "正在浏览器操作";
  if (/ppt|slide/.test(text)) return "正在生成 PPT";
  if (/tool|skill|mcp/.test(text)) return "正在调用能力";
  if (/complete|done|final|success/.test(text)) return "完成";
  if (/fail|error/.test(text)) return "失败";
  return "智能核心进度";
}
