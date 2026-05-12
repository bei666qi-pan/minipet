import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type IpcChannel } from "./security/ipcGuard";

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
