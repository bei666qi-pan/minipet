import { CircleStop, Clock3, Copy, ExternalLink, FolderOpen } from "lucide-react";
import { useTaskStore } from "../store/taskStore";

export function TaskTimeline() {
  const { tasks, updateTask } = useTaskStore();
  return (
    <section className="panel-section task-timeline">
      <div className="section-title">
        <Clock3 size={17} />
        <span>任务时间线</span>
      </div>
      {tasks.length === 0 ? <p className="hint">还没有任务。你可以先问一句，或从快捷按钮开始。</p> : null}
      {tasks.map((task) => (
        <article className={`task-card task-${task.status}`} key={task.localRequestId}>
          <header>
            <div>
              <strong>{task.title}</strong>
              <span>{task.method} · {riskLabel(task.risk)}</span>
            </div>
            <div className="task-actions">
              {task.result ? (
                <button title="复制结果" onClick={() => void navigator.clipboard.writeText(task.result ?? "")}>
                  <Copy size={14} />
                </button>
              ) : null}
              {!["success", "error", "stopped"].includes(task.status) ? (
                <button title="停止任务" onClick={() => updateTask(task.localRequestId, { status: "stopped", error: "已由用户停止。" }, { stage: "stopped", label: "已停止" })}>
                  <CircleStop size={14} />
                </button>
              ) : null}
            </div>
          </header>
          <ol>
            {task.timeline.map((item, index) => (
              <li key={`${item.createdAt}-${index}`}>
                <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                <b>{item.label}</b>
              </li>
            ))}
          </ol>
          {task.result ? <p className="task-result">{task.result}</p> : null}
          {task.outputs?.length ? (
            <div className="output-actions">
              {task.outputs.map((output) => (
                <button key={output.filePath} onClick={() => void window.minipet.invoke("shell:open-path", { filePath: output.filePath })}>
                  <ExternalLink size={14} /> 打开{output.label}
                </button>
              ))}
              <button onClick={() => void window.minipet.invoke("output:open-directory")}>
                <FolderOpen size={14} /> 打开输出文件夹
              </button>
            </div>
          ) : null}
          {task.error ? <p className="task-error">{task.error}</p> : null}
        </article>
      ))}
    </section>
  );
}

function riskLabel(risk: string): string {
  return { low: "普通", medium: "需要留意", high: "需要确认", critical: "不能直接做" }[risk] ?? "普通";
}
