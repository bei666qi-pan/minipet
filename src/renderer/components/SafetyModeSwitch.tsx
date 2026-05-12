import { Shield, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useSettingsStore, type PermissionMode } from "../store/settingsStore";

const FULL_PHRASE = "我理解风险并启用完全访问";

export function SafetyModeSwitch() {
  const { settings, update } = useSettingsStore();
  const [phrase, setPhrase] = useState("");
  const mode = settings?.permissionMode ?? "safe";

  return (
    <section className="panel-section">
      <div className="section-title">
        {mode === "full" ? <ShieldAlert size={18} /> : <Shield size={18} />}
        <span>守护模式</span>
      </div>
      <div className="segmented">
        {(["demo", "safe", "assisted", "full"] as PermissionMode[]).map((item) => (
          <button key={item} className={mode === item ? "active" : ""} onClick={() => void switchMode(item, phrase, update)}>
            {modeLabel(item)}
          </button>
        ))}
      </div>
      <p className="hint">{description(mode)}</p>
      <label className="field">
        <span>启用完全访问前输入确认短语</span>
        <input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder={FULL_PHRASE} />
      </label>
      <label className="checkbox-line">
        <input
          type="checkbox"
          checked={Boolean(settings?.adminAdvanced)}
          disabled={mode !== "full"}
          onChange={(event) => void update({ adminAdvanced: event.target.checked })}
        />
        <span>高级管理开关：只建议在明确知道风险时开启</span>
      </label>
    </section>
  );
}

async function switchMode(mode: PermissionMode, phrase: string, update: (patch: { permissionMode?: PermissionMode }) => Promise<void>) {
  if (mode === "full" && phrase !== FULL_PHRASE) return;
  await update({ permissionMode: mode });
}

function modeLabel(mode: PermissionMode): string {
  return { demo: "体验", safe: "守护", assisted: "协助", full: "完全" }[mode];
}

function description(mode: PermissionMode): string {
  return {
    demo: "体验模式：只演示界面和普通聊天。",
    safe: "守护模式：适合第一次使用。会阻止删除文件、提交表单、安装能力等高风险操作。",
    assisted: "协助模式：允许更多任务，但写文件、下载、填写表单等操作需要确认。",
    full: "完全模式：可操作文件、浏览器和系统工具。高风险动作仍需要二次确认。"
  }[mode];
}
