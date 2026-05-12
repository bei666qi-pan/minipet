import { Download, ShieldCheck, X } from "lucide-react";

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
          <Download />
          <span>准备智能核心</span>
        </div>
        <p>{message}</p>
        <div className="friendly-checks">
          <span>
            <ShieldCheck size={16} /> 只从官方来源下载
          </span>
          <span>
            <ShieldCheck size={16} /> 安装在你的用户目录
          </span>
          <span>
            <ShieldCheck size={16} /> 不会扫描全盘文件
          </span>
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>
            <X size={16} /> 暂时不用
          </button>
          <button className="primary-button" onClick={onConfirm}>
            <Download size={16} /> 同意并开始准备
          </button>
        </div>
      </section>
    </div>
  );
}
