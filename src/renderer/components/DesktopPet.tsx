import { Bot } from "lucide-react";
import type { PointerEvent } from "react";
import { useRef } from "react";
import { hasDraggedBeyondThreshold } from "../petDrag";
import { useAppStore } from "../store/appStore";
import { getAssetUrlForState, useSettingsStore, type PetState } from "../store/settingsStore";

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  previousState: PetState;
}

export function DesktopPet() {
  const { petState, setPetState, setTalkOpen, touchTalkPanel } = useAppStore();
  const { assets, settings } = useSettingsStore();
  const assetUrl = getAssetUrlForState(assets, petState);
  const scale = settings?.petScale ?? 1;
  const dragRef = useRef<DragSession | undefined>(undefined);

  function startPointer(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      lastX: event.screenX,
      lastY: event.screenY,
      moved: false,
      previousState: petState
    };
  }

  function movePointer(event: PointerEvent<HTMLElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.moved && hasDraggedBeyondThreshold(session.startX, session.startY, event.screenX, event.screenY)) {
      session.moved = true;
      setPetState("dragging");
    }
    if (!session.moved) return;
    const dx = Math.round(event.screenX - session.lastX);
    const dy = Math.round(event.screenY - session.lastY);
    session.lastX = event.screenX;
    session.lastY = event.screenY;
    if (dx || dy) void window.minipet.invoke("window:move-by", { dx, dy });
  }

  function endPointer(event: PointerEvent<HTMLElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (session.moved) {
      setPetState(session.previousState);
      return;
    }
    setPetState("idle_welcome");
    setTalkOpen(true);
    touchTalkPanel();
  }

  return (
    <section
      className={`pet-shell no-drag ${petState === "dragging" ? "is-dragging" : ""}`}
      style={{ transform: `scale(${scale})`, transformOrigin: "bottom right" }}
      onPointerDown={startPointer}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onContextMenu={(event) => {
        event.preventDefault();
        void window.minipet.invoke("window:open-pet-menu");
      }}
      title="点一下爪爪，就能和它说话。按住拖动可以移动位置。"
    >
      {assetUrl ? (
        <img className="pet-image" src={assetUrl} alt="爪爪桌宠" draggable={false} />
      ) : (
        <div className="pet-placeholder" aria-label="爪爪桌宠占位">
          <div className="pet-ear left" />
          <div className="pet-ear right" />
          <div className="pet-face">
            <span />
            <span />
          </div>
          <Bot size={54} />
        </div>
      )}
    </section>
  );
}
