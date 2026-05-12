import { KeyRound, ServerCog, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSettingsStore } from "../store/settingsStore";

export function ModelPanel() {
  const { settings, secrets, update, setSecret, clearSecret } = useSettingsStore();
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  if (!settings) return null;
  return (
    <section className="panel-section auth-focus-card">
      <div className="section-title">
        <ServerCog size={18} />
        <span>连接与授权</span>
      </div>
      <p className="hint">默认使用 MiniPet 云端基础 AI，对普通用户无需填写 URL、API Key、NewAPI 或 OpenClaw。高级用户可切换为自带模型。</p>
      <div className="segmented">
        <button className={settings.aiMode === "cloud" ? "active" : ""} onClick={() => void update({ aiMode: "cloud" })}>
          MiniPet 云端
        </button>
        <button className={settings.aiMode === "custom" ? "active" : ""} onClick={() => void update({ aiMode: "custom" })}>
          自带模型/API Key
        </button>
      </div>
      <label className="field">
        <span>MiniPet API 地址</span>
        <input value={settings.cloudApiOrigin} onChange={(event) => void update({ cloudApiOrigin: event.target.value })} />
      </label>
      <label className="field token-field">
        <span>大模型 API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          disabled={settings.aiMode !== "custom"}
          placeholder={secrets?.openaiApiKey ? "已安全保存，需要更换时重新输入" : "仅自带模型模式需要填写"}
        />
      </label>
      <div className="toolbar-row">
        <button className="primary-button" disabled={settings.aiMode !== "custom"} onClick={() => void setSecret("openaiApiKey", apiKey).then(() => setApiKey(""))}>
          <KeyRound size={15} /> 保存 API Key
        </button>
        <button onClick={() => void clearSecret("openaiApiKey")}>
          <Trash2 size={15} /> 清除
        </button>
      </div>
      <label className="field">
        <span>API Base URL</span>
        <input value={settings.openAIBaseUrl} onChange={(event) => void update({ openAIBaseUrl: event.target.value })} />
      </label>
      <label className="field">
        <span>模型名称</span>
        <input value={settings.openAIModel} onChange={(event) => void update({ openAIModel: event.target.value })} />
      </label>
      <div className="split-fields">
        <label className="field">
          <span>OpenClaw Gateway 地址，一行一个</span>
          <textarea
            value={settings.openClawUrls.join("\n")}
            onChange={(event) =>
              void update({
                openClawUrls: event.target.value
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean)
              })
            }
          />
        </label>
        <label className="field token-field">
          <span>OpenClaw Token / Password</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={secrets?.openclawToken ? "已安全保存，需要更换时重新输入" : "可留空"}
          />
        </label>
      </div>
      <div className="toolbar-row">
        <button onClick={() => void setSecret("openclawToken", token).then(() => setToken(""))}>
          <KeyRound size={15} /> 保存 OpenClaw Token
        </button>
        <button onClick={() => void clearSecret("openclawToken")}>
          <Trash2 size={15} /> 清除
        </button>
      </div>
      {!secrets?.encryptionAvailable ? <p className="warning-line">当前环境无法安全持久化密钥，可改为仅本次会话使用。</p> : null}
    </section>
  );
}
