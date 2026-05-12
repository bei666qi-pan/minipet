/// <reference types="vite/client" />

type IpcChannel =
  | "app:get-state"
  | "app:update-settings"
  | "app:set-secret"
  | "app:clear-secret"
  | "app:open-external"
  | "asset:scan"
  | "asset:set-directory"
  | "openclaw:connect"
  | "openclaw:disconnect"
  | "openclaw:request"
  | "core:status"
  | "core:ensure-ready"
  | "companion:run-task"
  | "output:open-directory"
  | "llm:chat"
  | "permission:evaluate"
  | "audit:read"
  | "window:set-always-on-top"
  | "window:set-click-through"
  | "window:hide"
  | "window:show"
  | "window:move-by"
  | "window:open-settings"
  | "window:close-settings"
  | "window:open-pet-menu"
  | "dialog:select-directory"
  | "dialog:select-files"
  | "shell:open-path"
  | "shell:show-item";

interface Window {
  minipet: {
    invoke<T = unknown>(channel: IpcChannel, payload?: unknown): Promise<T>;
    on(channel: "openclaw:event" | "openclaw:status" | "core:progress", callback: (payload: unknown) => void): () => void;
  };
}
