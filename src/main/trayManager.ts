import { Menu, Tray } from "electron";
import { createBrandTrayImage } from "./brandAssets";

export interface TrayActions {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  openSettings: () => void;
  checkForUpdates: () => void;
  setAlwaysOnTop: (enabled: boolean) => void;
  isAlwaysOnTop: () => boolean;
  quit: () => void;
}

export function createTray(actions: TrayActions): Tray {
  const image = createBrandTrayImage();
  const tray = new Tray(image);
  tray.setToolTip("爪爪");
  const rebuildMenu = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "打开爪爪",
          click: actions.show
        },
        {
          label: "设置",
          click: actions.openSettings
        },
        {
          label: "检查更新",
          click: actions.checkForUpdates
        },
        {
          label: "置顶",
          type: "checkbox",
          checked: actions.isAlwaysOnTop(),
          click: (item) => {
            actions.setAlwaysOnTop(item.checked);
            rebuildMenu();
          }
        },
        {
          label: "收起到悬浮球",
          click: actions.hide
        },
        { type: "separator" },
        {
          label: "退出",
          click: actions.quit
        }
      ])
    );
  };
  rebuildMenu();
  tray.on("click", actions.toggle);
  return tray;
}
