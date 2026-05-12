import type { PermissionMode } from "./store/settingsStore";
import type { TalkTurn } from "./store/appStore";

export type ProactiveSpeechEvent = "welcome" | "idle" | "night" | "task_success" | "task_error" | "permission";

export interface ProactiveSpeechPolicy {
  enabled: boolean;
  now: Date;
  lastSpokenAt?: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  priority: "normal" | "high";
  cooldownMs?: number;
}

export interface ProactiveContextInput {
  event: ProactiveSpeechEvent;
  permissionMode: PermissionMode;
  recentTalks: TalkTurn[];
  selectedFiles: string[];
  activeTaskTitle?: string;
  now: Date;
}

export const DEFAULT_PROACTIVE_COOLDOWN_MS = 20 * 60 * 1000;

export function canUseSelectedFiles(mode: PermissionMode): boolean {
  return mode === "assisted" || mode === "full";
}

export function isInQuietHours(now: Date, start: string, end: string): boolean {
  const current = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end);
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return current >= startMinutes && current < endMinutes;
  return current >= startMinutes || current < endMinutes;
}

export function shouldSpeak(policy: ProactiveSpeechPolicy): boolean {
  if (!policy.enabled) return false;
  if (policy.quietHoursEnabled && policy.priority !== "high" && isInQuietHours(policy.now, policy.quietHoursStart, policy.quietHoursEnd)) {
    return false;
  }
  const cooldown = policy.cooldownMs ?? DEFAULT_PROACTIVE_COOLDOWN_MS;
  if (policy.priority === "high") return true;
  return !policy.lastSpokenAt || policy.now.getTime() - policy.lastSpokenAt >= cooldown;
}

export function buildProactiveSpeechMessages(input: ProactiveContextInput): Array<{ role: "system" | "user"; content: string }> {
  const safeTurns = input.recentTalks
    .slice(-4)
    .map((turn) => `${turn.role === "user" ? "用户" : "MiniPet"}：${turn.text.slice(0, 80)}`)
    .join("\n");
  const fileContext = canUseSelectedFiles(input.permissionMode) && input.selectedFiles.length
    ? `\n用户主动选择的文件：${input.selectedFiles.map((file) => file.split(/[\\/]/).pop()).join("、")}`
    : "";
  return [
    {
      role: "system",
      content:
        "你是一个低打扰桌面宠物 MiniPet。只写 1 到 2 句简短中文，语气温柔自然，有陪伴感，不要装作看到了屏幕或文件内容，不要催促用户。"
    },
    {
      role: "user",
      content:
        `触发场景：${input.event}\n` +
        `当前时间：${input.now.toLocaleString("zh-CN")}\n` +
        `授权模式：${input.permissionMode}\n` +
        `当前任务：${input.activeTaskTitle ?? "无"}\n` +
        `最近对话：${safeTurns || "无"}${fileContext}`
    }
  ];
}

export function fallbackProactiveLine(event: ProactiveSpeechEvent): string {
  return {
    welcome: "点一下我就能说话。我会尽量安静地陪在这里，需要时再帮你接手任务。",
    idle: "我先安静待机。想到要整理、写作或查资料时，点我一下就好。",
    night: "时间有点晚了，我会降低打扰。还有任务的话，我们可以慢慢处理。",
    task_success: "完成啦。需要我继续整理成更好读的版本，也可以直接告诉我。",
    task_error: "这次没有顺利完成。我在这里，等你确认后再换一种办法。",
    permission: "这个动作需要你确认一下，我会等你决定。"
  }[event];
}

function parseClock(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return hours * 60 + minutes;
}
