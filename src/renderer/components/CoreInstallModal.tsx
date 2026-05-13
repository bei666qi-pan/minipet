import { ShieldCheck, X } from "lucide-react";

interface Props {
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CoreInstallModal({ message, onCancel, onConfirm }: Props) {
  if (!message) return null;
  return (
    <div className="modal-backdrop">
      <section className="modal-card core-install-card">
        <div className="modal-title">
          <ShieldCheck />
          <span>需要你确认一下</span>
        </div>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>
            <X size={16} /> 先不要
          </button>
          <button className="primary-button" onClick={onConfirm}>
            继续
          </button>
        </div>
      </section>
    </div>
  );
}
