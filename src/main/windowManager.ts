import path from "node:path";
import { BrowserWindow, app, screen, shell } from "electron";
import { validateExternalUrl } from "./security/urlGuard";

export function createMainWindow(): BrowserWindow {
  const width = 460;
  const height = 680;
  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.max(workArea.x + 24, workArea.x + workArea.width - width - 24);
  const y = Math.max(workArea.y + 24, workArea.y + workArea.height - height - 24);
  const window = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 340,
    minHeight: 480,
    transparent: true,
    frame: false,
    resizable: true,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#00000000",
    title: "MiniPet",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(app.getAppPath(), "dist-main", "preload.js")
    }
  });

  const revealWindow = () => {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();
    window.setAlwaysOnTop(false);
    window.setAlwaysOnTop(true, "screen-saver");
    window.moveTop();
    window.focus();
  };

  window.once("ready-to-show", revealWindow);
  window.webContents.once("did-finish-load", revealWindow);
  [300, 1000, 2500, 5000].forEach((delay) => setTimeout(revealWindow, delay));

  attachNavigationGuards(window);

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
  }

  return window;
}

export function createSettingsWindow(): BrowserWindow {
  const width = 820;
  const height = 720;
  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.max(workArea.x + 24, workArea.x + Math.round((workArea.width - width) / 2));
  const y = Math.max(workArea.y + 24, workArea.y + Math.round((workArea.height - height) / 2));
  const window = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 680,
    minHeight: 560,
    transparent: false,
    frame: true,
    resizable: true,
    show: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    backgroundColor: "#fffaf7",
    title: "MiniPet 设置",
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
  attachNavigationGuards(window);
  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/settings`);
  } else {
    void window.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"), { hash: "/settings" });
  }
  return window;
}

function attachNavigationGuards(window: BrowserWindow): void {
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
}
