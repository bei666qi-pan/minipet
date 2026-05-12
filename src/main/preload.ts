import { contextBridge, ipcRenderer } from "electron";

const IPC_CHANNELS = [
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
  "window:move-by",
  "window:open-settings",
  "window:close-settings",
  "window:open-pet-menu",
  "dialog:select-directory",
  "dialog:select-files",
  "shell:open-path",
  "shell:show-item"
] as const;

type IpcChannel = (typeof IPC_CHANNELS)[number];

const allowed = new Set<string>(IPC_CHANNELS);
const eventChannels = new Set(["openclaw:event", "openclaw:status", "core:progress"]);

contextBridge.exposeInMainWorld("minipet", {
  invoke(channel: IpcChannel, payload?: unknown) {
    if (!allowed.has(channel)) throw new Error(`IPC 通道未授权：${channel}`);
    return ipcRenderer.invoke(channel, payload);
  },
  on(channel: "openclaw:event" | "openclaw:status" | "core:progress", callback: (payload: unknown) => void) {
    if (!eventChannels.has(channel)) throw new Error(`事件通道未授权：${channel}`);
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
