import type { IpcMainInvokeEvent, WebContents } from "electron";

export const IPC_CHANNELS = [
  "app:get-state",
  "app:update-settings",
  "app:set-secret",
  "app:clear-secret",
  "app:open-external",
  "app:check-update",
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
  "llm:test-connection",
  "permission:evaluate",
  "audit:read",
  "window:set-always-on-top",
  "window:set-click-through",
  "window:hide",
  "window:show",
  "window:move-by",
  "window:open-settings",
  "window:close-settings",
  "window:open-pet-menu",
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

export function assertTrustedSender(event: IpcMainInvokeEvent, trustedWebContents: WebContents | Array<WebContents | undefined> | undefined): void {
  const trusted = Array.isArray(trustedWebContents)
    ? trustedWebContents.filter((webContents): webContents is WebContents => Boolean(webContents))
    : trustedWebContents
      ? [trustedWebContents]
      : [];
  if (!trusted.some((webContents) => webContents.id === event.sender.id)) {
    throw new Error("IPC 请求来源不可信。");
  }
}
