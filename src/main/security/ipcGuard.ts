import type { IpcMainInvokeEvent, WebContents } from "electron";

export const IPC_CHANNELS = [
  "app:get-state",
  "app:update-settings",
  "app:set-secret",
  "app:clear-secret",
  "app:open-external",
  "asset:scan",
  "asset:set-directory",
  "openclaw:connect",
  "openclaw:disconnect",
  "openclaw:request",
  "core:status",
  "core:ensure-ready",
  "companion:run-task",
  "output:open-directory",
  "llm:chat",
  "permission:evaluate",
  "audit:read",
  "window:set-always-on-top",
  "window:set-click-through",
  "window:hide",
  "window:show",
  "dialog:select-directory",
  "dialog:select-files",
  "shell:open-path",
  "shell:show-item"
] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];

const channelSet = new Set<string>(IPC_CHANNELS);

export function isAllowedIpcChannel(channel: string): channel is IpcChannel {
  return channelSet.has(channel);
}

export function assertTrustedSender(event: IpcMainInvokeEvent, mainWebContents: WebContents | undefined): void {
  if (!mainWebContents || event.sender.id !== mainWebContents.id) {
    throw new Error("IPC 请求来源不可信。");
  }
}
