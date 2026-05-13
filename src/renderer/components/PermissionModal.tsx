import { ShieldCheck } from "lucide-react";

export interface PermissionDecision {
  allowed: boolean;
  requireConfirmation: boolean;
  requestable?: boolean;
  reason: string;
  risk: "low" | "medium" | "high" | "critical";
  scopes: string[];
  authorizationChoices?: Array<"turn" | "switch_assisted">;
  suggestedMode?: "demo" | "safe" | "assisted" | "full";
}

interface Props {
  decision?: PermissionDecision;
  actionText: string;
  onCancel: () => void;
  onConfirm: (scope: "turn" | "switch_assisted") => void;
}

export function PermissionModal({ decision, actionText, onCancel, onConfirm }: Props) {
  if (!decision) return null;
  const canAuthorize = decision.allowed || Boolean(decision.requestable);
  return (
    <div className="modal-backdrop">
      <section className="modal-card permission-card">
        <div className="modal-title">
          <ShieldCheck />
          <span>{canAuthorize ? "需要你点头" : "这件事不能直接做"}</span>
        </div>
        <div className="permission-simple">
          <p>{friendlyReason(decision, canAuthorize)}</p>
          <p>{actionText}</p>
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>先不要</button>
          {canAuthorize ? (
            <>
              <button onClick={() => onConfirm("turn")}>只允许这一次</button>
              <button className="primary-button" onClick={() => onConfirm("switch_assisted")}>
                以后同类也可以
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function friendlyReason(decision: PermissionDecision, canAuthorize: boolean): string {
  if (!canAuthorize) return "这件事可能不安全，爪爪不能直接做。";
  if (decision.risk === "high" || decision.risk === "critical") return "这一步影响比较大，爪爪需要先问你。";
  return "爪爪要离开聊天框去帮你做点事，先确认一下。";
}
