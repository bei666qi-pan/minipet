import { KeyRound, Settings, X } from "lucide-react";

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
          <KeyRound />
          <span>需要聊天授权</span>
        </div>
        <p>{message}</p>
        <div className="friendly-checks">
          <span>密钥只保存在本机安全存储</span>
          <span>不会写入日志</span>
          <span>设置区会突出显示输入位置</span>
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>
            <X size={16} /> 稍后再说
          </button>
          <button className="primary-button" onClick={onOpenSettings}>
            <Settings size={16} /> 打开设置
          </button>
        </div>
      </section>
    </div>
  );
}
