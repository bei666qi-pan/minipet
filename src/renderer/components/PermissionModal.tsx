import { AlertTriangle, ShieldCheck } from "lucide-react";

export interface PermissionDecision {
  allowed: boolean;
  requireConfirmation: boolean;
  reason: string;
  risk: "low" | "medium" | "high" | "critical";
  scopes: string[];
}

interface Props {
  decision?: PermissionDecision;
  actionText: string;
  consequences: string;
  onCancel: () => void;
  onConfirm: (scope: "once" | "session") => void;
}

export function PermissionModal({ decision, actionText, consequences, onCancel, onConfirm }: Props) {
  if (!decision) return null;
  const highRisk = decision.risk === "critical" || decision.risk === "high";
  return (
    <div className="modal-backdrop">
      <section className={`modal-card permission-card risk-${decision.risk}`}>
        <div className="modal-title">
          {highRisk ? <AlertTriangle /> : <ShieldCheck />}
          <span>{decision.allowed ? "需要确认" : "当前模式不允许"}</span>
        </div>
        <p>{decision.reason}</p>
        <dl className="permission-details">
          <dt>即将执行</dt>
          <dd>{actionText}</dd>
          <dt>可能访问</dt>
          <dd>当前任务输入、你主动选择的文件、任务所需的网页或应用上下文。</dd>
          <dt>可能后果</dt>
          <dd>{consequences}</dd>
          <dt>是否可撤销</dt>
          <dd>{decision.risk === "critical" ? "可能不可撤销，请确认来源可信。" : "通常可以取消或重新生成。"}</dd>
        </dl>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          {decision.allowed ? (
            <>
              <button onClick={() => onConfirm("once")}>仅本次允许</button>
              <button className="primary-button" onClick={() => onConfirm("session")}>
                本次会话允许
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
