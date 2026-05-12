import { Menu, Tray, nativeImage } from "electron";

export interface TrayActions {
  show: () => void;
  hide: () => void;
  toggle: () => void;
  setAlwaysOnTop: (enabled: boolean) => void;
  isAlwaysOnTop: () => boolean;
  quit: () => void;
}

export function createTray(actions: TrayActions): Tray {
  const image = nativeImage.createEmpty();
  const tray = new Tray(image);
  tray.setToolTip("爪爪伙伴");
  const rebuildMenu = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
      {
        label: "显示爪爪伙伴",
        click: actions.show
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
        label: "隐藏",
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
