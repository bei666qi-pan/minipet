import type { PointerEvent } from "react";
import { useRef } from "react";
import { hasDraggedBeyondThreshold } from "../petDrag";

const LOGO_URL = "./assets/minipet-logo.png";

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

export function FloatingBall() {
  const passThroughRef = useRef<boolean | undefined>(undefined);
  const dragRef = useRef<DragSession | undefined>(undefined);

  function setPassThrough(enabled: boolean) {
    if (passThroughRef.current === enabled) return;
    passThroughRef.current = enabled;
    void window.minipet.invoke("window:set-pass-through", { enabled });
  }

  function openContextMenu() {
    dragRef.current = undefined;
    setPassThrough(false);
    void window.minipet.invoke("window:open-pet-menu");
  }

  function updatePassThrough(target: EventTarget | null) {
    if (dragRef.current) return;
    const onBall = target instanceof Element && Boolean(target.closest(".floating-ball-button"));
    setPassThrough(!onBall);
  }

  function startPointer(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    setPassThrough(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      lastX: event.screenX,
      lastY: event.screenY,
      moved: false
    };
  }

  function movePointer(event: PointerEvent<HTMLButtonElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (!session.moved && hasDraggedBeyondThreshold(session.startX, session.startY, event.screenX, event.screenY)) {
      session.moved = true;
    }
    if (!session.moved) return;
    const dx = Math.round(event.screenX - session.lastX);
    const dy = Math.round(event.screenY - session.lastY);
    session.lastX = event.screenX;
    session.lastY = event.screenY;
    if (dx || dy) void window.minipet.invoke("window:move-by", { dx, dy });
  }

  function endPointer(event: PointerEvent<HTMLButtonElement>) {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (session.moved) return;
    void window.minipet.invoke("window:expand-from-floating-ball");
  }

  return (
    <main
      className="floating-ball-root"
      onMouseMove={(event) => updatePassThrough(event.target)}
      onMouseDown={(event) => updatePassThrough(event.target)}
      onMouseLeave={() => setPassThrough(true)}
      onContextMenu={(event) => {
        event.preventDefault();
        openContextMenu();
      }}
    >
      <button
        className="floating-ball-button"
        type="button"
        title="打开爪爪"
        aria-label="打开爪爪"
        onPointerDown={startPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onContextMenu={(event) => {
          event.preventDefault();
          openContextMenu();
        }}
      >
        <img src={LOGO_URL} alt="" draggable={false} />
      </button>
    </main>
  );
}
