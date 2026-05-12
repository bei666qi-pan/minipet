import { Plug, RefreshCw, WifiOff } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";

export function CoreStatusPanel() {
  const { openClaw, settings, connectOpenClaw } = useSettingsStore();
  const say = useAppStore((state) => state.say);
  const connected = openClaw?.connected;
  return (
    <section className="panel-section gateway-status">
      <div className="section-title">
        {connected ? <Plug size={18} /> : <WifiOff size={18} />}
        <span>智能核心状态</span>
      </div>
      <div className="status-grid">
        <span>连接</span>
        <strong>{connected ? "已准备好" : "还没准备好"}</strong>
        <span>地址</span>
        <strong>{openClaw?.url ?? settings?.openClawUrls[0] ?? "ws://127.0.0.1:18789"}</strong>
        <span>会话</span>
        <strong>{openClaw?.sessionKey ?? settings?.openClawSessionKey ?? "main"}</strong>
        <span>范围</span>
        <strong>{openClaw?.scopes?.join(", ") || "未请求"}</strong>
      </div>
      {openClaw?.lastError ? <p className="hint">{openClaw.lastError}</p> : null}
      <button
        className="primary-button"
        onClick={() => {
          void connectOpenClaw().then((status) => say(status.connected ? "智能核心已准备好。" : "暂时没有发现智能核心。"));
        }}
      >
        <RefreshCw size={16} /> 重新检查
      </button>
    </section>
  );
}
