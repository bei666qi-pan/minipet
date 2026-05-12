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
  return (
    <div className="modal-backdrop">
      <section className={`modal-card risk-${decision.risk}`}>
        <div className="modal-title">
          {decision.risk === "critical" || decision.risk === "high" ? <AlertTriangle /> : <ShieldCheck />}
          <span>需要确认</span>
        </div>
        <p>{decision.reason}</p>
        <dl className="permission-details">
          <dt>即将执行</dt>
          <dd>{actionText}</dd>
          <dt>可能访问的数据</dt>
          <dd>当前任务输入、你选择的文件或网页内容。</dd>
          <dt>可能后果</dt>
          <dd>{consequences}</dd>
          <dt>是否可撤销</dt>
          <dd>{decision.risk === "critical" ? "可能不可撤销，请确认来源可信。" : "通常可取消或重新生成。"}</dd>
        </dl>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button onClick={() => onConfirm("once")}>仅本次允许</button>
          <button className="primary-button" onClick={() => onConfirm("session")}>
            本会话允许
          </button>
        </div>
      </section>
    </div>
  );
}
