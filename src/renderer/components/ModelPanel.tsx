import { KeyRound, ServerCog } from "lucide-react";
import { useState } from "react";
import { useSettingsStore } from "../store/settingsStore";

export function ModelPanel() {
  const { settings, secrets, update, setSecret, clearSecret } = useSettingsStore();
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  if (!settings) return null;
  return (
    <section className="panel-section">
      <div className="section-title">
        <ServerCog size={17} />
        <span>OpenClaw 与大模型 API</span>
      </div>
      <label className="field">
        <span>OpenClaw Gateway 地址，一行一个</span>
        <textarea value={settings.openClawUrls.join("\n")} onChange={(event) => void update({ openClawUrls: event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) })} />
      </label>
      <label className="field">
        <span>OpenClaw Auth Token / Password</span>
        <input value={token} onChange={(event) => setToken(event.target.value)} placeholder={secrets?.openclawToken ? "已安全保存" : "可留空"} />
      </label>
      <div className="toolbar-row">
        <button onClick={() => void setSecret("openclawToken", token).then(() => setToken(""))}>
          <KeyRound size={14} /> 保存 OpenClaw Token
        </button>
        <button onClick={() => void clearSecret("openclawToken")}>清除 Token</button>
      </div>
      <label className="field">
        <span>API Base URL</span>
        <input value={settings.openAIBaseUrl} onChange={(event) => void update({ openAIBaseUrl: event.target.value })} />
      </label>
      <label className="field">
        <span>本地 LLM 模型名</span>
        <input value={settings.openAIModel} onChange={(event) => void update({ openAIModel: event.target.value })} />
      </label>
      <label className="field">
        <span>API Key</span>
        <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={secrets?.openaiApiKey ? "已安全保存" : "不会写入日志"} />
      </label>
      <div className="toolbar-row">
        <button onClick={() => void setSecret("openaiApiKey", apiKey).then(() => setApiKey(""))}>
          <KeyRound size={14} /> 保存 API Key
        </button>
        <button onClick={() => void clearSecret("openaiApiKey")}>清除 API Key</button>
      </div>
      {!secrets?.encryptionAvailable ? <p className="warning-line">当前环境无法安全持久化密钥，可改为仅本次会话使用。</p> : null}
    </section>
  );
}
