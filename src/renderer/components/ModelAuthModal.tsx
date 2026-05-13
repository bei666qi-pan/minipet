import { Settings, X } from "lucide-react";

interface Props {
  message?: string;
  onCancel: () => void;
  onOpenSettings: () => void;
}

export function ModelAuthModal({ message, onCancel, onOpenSettings }: Props) {
  if (!message) return null;
  return (
    <div className="modal-backdrop">
      <section className="modal-card auth-card">
        <div className="modal-title">
          <Settings />
          <span>需要先设置聊天</span>
        </div>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>
            <X size={16} /> 先不要
          </button>
          <button className="primary-button" onClick={onOpenSettings}>
            打开设置
          </button>
        </div>
      </section>
    </div>
  );
}
