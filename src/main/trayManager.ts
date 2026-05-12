import { Menu, Tray, nativeImage } from "electron";

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
  const image = nativeImage.createEmpty();
  const tray = new Tray(image);
  tray.setToolTip("MiniPet");
  const rebuildMenu = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "显示桌宠",
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
          label: "隐藏桌宠",
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
