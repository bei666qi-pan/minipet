import { Copy, Maximize2 } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useTaskStore } from "../store/taskStore";

export function SpeechBubble() {
  const bubbleText = useAppStore((state) => state.bubbleText);
  const activeTaskId = useTaskStore((state) => state.activeTaskId);
  const activeTask = useTaskStore((state) => state.tasks.find((task) => task.localRequestId === activeTaskId));
  const [expanded, setExpanded] = useState(false);
  const text = activeTask?.result || activeTask?.error || bubbleText;

  return (
    <aside className={`speech-bubble ${expanded ? "expanded" : ""}`}>
      <div className="bubble-header">
        <strong>{activeTask ? activeTask.title : "MiniPet"}</strong>
        <div>
          <button title="复制" onClick={() => void navigator.clipboard.writeText(text)}>
            <Copy size={14} />
          </button>
          <button title="展开" onClick={() => setExpanded(!expanded)}>
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <p>{text}</p>
      {activeTask ? (
        <div className="bubble-progress">
          <span>{statusLabel(activeTask.status)}</span>
          <span>{activeTask.timeline.at(-1)?.label}</span>
        </div>
      ) : null}
    </aside>
  );
}

function statusLabel(status: string): string {
  return {
    queued: "排队中",
    running: "进行中",
    waiting_confirmation: "等待确认",
    success: "已完成",
    error: "出错",
    stopped: "已停止"
  }[status] ?? status;
}
