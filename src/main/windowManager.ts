import path from "node:path";
import { BrowserWindow, app, screen, shell, type Rectangle } from "electron";
import { brandAssetPath } from "./brandAssets";
import { validateExternalUrl } from "./security/urlGuard";
import {
  FLOATING_BALL_SIZE,
  clampFloatingBallPosition,
  defaultFloatingBallPosition,
  type WindowPoint
} from "./windowGeometry";

export function createMainWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const bounds = fitBoundsToWorkArea(workArea, { width: 460, height: 680, minWidth: 340, minHeight: 480 });
  const window = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    transparent: true,
    frame: false,
    resizable: true,
    show: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#00000000",
    title: "爪爪",
    icon: brandAssetPath("icon.ico"),
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

export function createFloatingBallWindow(position?: WindowPoint): BrowserWindow {
  const size = FLOATING_BALL_SIZE;
  const { workArea } = screen.getPrimaryDisplay();
  const initial = position ? clampFloatingBallPosition(position, workArea, size) : defaultFloatingBallPosition(workArea, size);
  const window = new BrowserWindow({
    x: initial.x,
    y: initial.y,
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#00000000",
    title: "爪爪",
    icon: brandAssetPath("icon.ico"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(app.getAppPath(), "dist-main", "preload.js")
    }
  });

  attachNavigationGuards(window);

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/floating-ball`);
  } else {
    void window.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"), { hash: "/floating-ball" });
  }

  return window;
}

export function createSettingsWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const bounds = fitBoundsToWorkArea(workArea, { width: 820, height: 720, minWidth: 680, minHeight: 560, centered: true });
  const window = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    transparent: false,
    frame: true,
    resizable: true,
    show: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    backgroundColor: "#fffaf7",
    icon: brandAssetPath("icon.ico"),
    title: "爪爪设置",
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

export function clampFloatingBallPositionForDisplay(position: WindowPoint): WindowPoint {
  const display = screen.getDisplayNearestPoint(position);
  return clampFloatingBallPosition(position, display.workArea, FLOATING_BALL_SIZE);
}

function fitBoundsToWorkArea(
  workArea: Rectangle,
  options: { width: number; height: number; minWidth: number; minHeight: number; centered?: boolean }
): { x: number; y: number; width: number; height: number; minWidth: number; minHeight: number } {
  const margin = 24;
  const availableWidth = Math.max(260, workArea.width - margin * 2);
  const availableHeight = Math.max(360, workArea.height - margin * 2);
  const width = Math.min(options.width, availableWidth);
  const height = Math.min(options.height, availableHeight);
  const minWidth = Math.min(options.minWidth, width);
  const minHeight = Math.min(options.minHeight, height);
  const preferredX = options.centered ? workArea.x + Math.round((workArea.width - width) / 2) : workArea.x + workArea.width - width - margin;
  const preferredY = options.centered ? workArea.y + Math.round((workArea.height - height) / 2) : workArea.y + workArea.height - height - margin;
  const minX = workArea.x + margin;
  const minY = workArea.y + margin;
  const maxX = workArea.x + workArea.width - width - margin;
  const maxY = workArea.y + workArea.height - height - margin;
  return {
    x: clamp(preferredX, minX, Math.max(minX, maxX)),
    y: clamp(preferredY, minY, Math.max(minY, maxY)),
    width,
    height,
    minWidth,
    minHeight
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
