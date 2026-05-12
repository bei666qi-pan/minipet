import { Bot, EyeOff, Settings, Sparkles } from "lucide-react";
import type { MouseEvent } from "react";
import { useAppStore } from "../store/appStore";
import { getAssetUrlForState, useSettingsStore } from "../store/settingsStore";

export function DesktopPet() {
  const { petState, setCommandOpen, commandOpen, setQuickOpen, quickOpen, setSettingsOpen } = useAppStore();
  const { assets, settings } = useSettingsStore();
  const assetUrl = getAssetUrlForState(assets, petState);
  const scale = settings?.petScale ?? 1;

  return (
    <section
      className="pet-shell no-drag"
      style={{ transform: `scale(${scale})`, transformOrigin: "bottom right" }}
      onClick={() => setQuickOpen(!quickOpen)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setCommandOpen(!commandOpen);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setSettingsOpen(true);
      }}
      title="单击打开快捷按钮，双击和爪爪说话，右键打开伙伴小屋。"
    >
      <div className="pet-drag-handle drag-region" title="拖动爪爪" />
      <div className={`pet-aura pet-aura-${petState}`} />
      {assetUrl ? (
        <img className="pet-image" src={assetUrl} alt="爪爪伙伴" />
      ) : (
        <div className="pet-placeholder" aria-label="爪爪伙伴占位">
          <div className="pet-ear left" />
          <div className="pet-ear right" />
          <div className="pet-face">
            <span />
            <span />
          </div>
          <Bot size={54} />
        </div>
      )}
      <div className="pet-mini-actions no-drag">
        <button onClick={(event) => toggleCommand(event, commandOpen, setCommandOpen)} title="命令面板">
          <Sparkles size={16} />
        </button>
        <button onClick={(event) => openSettings(event, setSettingsOpen)} title="伙伴小屋">
          <Settings size={16} />
        </button>
        <button onClick={(event) => hideWindow(event)} title="隐藏">
          <EyeOff size={16} />
        </button>
      </div>
    </section>
  );
}

function toggleCommand(event: MouseEvent, commandOpen: boolean, setCommandOpen: (open: boolean) => void) {
  event.stopPropagation();
  setCommandOpen(!commandOpen);
}

function openSettings(event: MouseEvent, setSettingsOpen: (open: boolean) => void) {
  event.stopPropagation();
  setSettingsOpen(true);
}

function hideWindow(event: MouseEvent) {
  event.stopPropagation();
  void window.minipet.invoke("window:hide");
}
