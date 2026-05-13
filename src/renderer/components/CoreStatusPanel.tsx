import { Plug, RefreshCw, WifiOff } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";

export function CoreStatusPanel() {
  const { openClaw, connectOpenClaw } = useSettingsStore();
  const say = useAppStore((state) => state.say);
  const connected = openClaw?.connected;
  return (
    <section className="panel-section gateway-status">
      <div className="section-title">
        {connected ? <Plug size={18} /> : <WifiOff size={18} />}
        <span>高级能力</span>
      </div>
      <p className="hint">普通聊天可以直接用。处理网页、文件和应用里的复杂任务时，爪爪会先征得你的同意。</p>
      <div className="status-grid">
        <span>状态</span>
        <strong>{connected ? "已准备好" : "还没准备好"}</strong>
        <span>用途</span>
        <strong>帮你完成更复杂的桌面任务</strong>
      </div>
      {openClaw?.lastError ? <p className="hint">暂时没准备好，稍后再试一次。</p> : null}
      <button
        className="primary-button"
        onClick={() => {
          void connectOpenClaw().then((status) => say(status.connected ? "高级能力已准备好。" : "暂时还没准备好。"));
        }}
      >
        <RefreshCw size={16} /> 重新检查
      </button>
    </section>
  );
}
