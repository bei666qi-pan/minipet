import path from "node:path";
import { BrowserWindow, app, shell } from "electron";
import { validateExternalUrl } from "./security/urlGuard";

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 460,
    height: 680,
    minWidth: 340,
    minHeight: 480,
    transparent: true,
    frame: false,
    resizable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#00000000",
    title: "爪爪伙伴",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(app.getAppPath(), "dist-main", "preload.js")
    }
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    const result = validateExternalUrl(url);
    if (result.ok && result.normalized) void shell.openExternal(result.normalized);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const rendererUrl = devUrl || `file://${path.join(app.getAppPath(), "dist", "renderer", "index.html")}`;
    if (url.startsWith(rendererUrl)) return;
    event.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
  }

  return window;
}
