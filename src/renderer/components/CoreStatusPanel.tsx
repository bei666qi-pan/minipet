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
        <span>OpenClaw 高级能力</span>
      </div>
      <p className="hint">普通问答不需要 OpenClaw。只有高级自动化任务才会用到这里。</p>
      <div className="status-grid">
        <span>连接</span>
        <strong>{connected ? "已准备好" : "未连接"}</strong>
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
          void connectOpenClaw().then((status) => say(status.connected ? "OpenClaw 已准备好。" : "暂时没有发现 OpenClaw。"));
        }}
      >
        <RefreshCw size={16} /> 重新检查
      </button>
    </section>
  );
}
