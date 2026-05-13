import { CheckCircle2, KeyRound, ServerCog, Trash2, Wifi } from "lucide-react";
import { useState } from "react";
import { useSettingsStore } from "../store/settingsStore";

export function ModelPanel() {
  const { settings, secrets, update, setSecret, clearSecret } = useSettingsStore();
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  if (!settings) return null;
  const current = settings;

  async function testConnection() {
    setTesting(true);
    setTestMessage("");
    try {
      const result = await window.minipet.invoke<{ ok: boolean; message: string; baseUrlUsed?: string }>("llm:test-connection", {
        apiKey,
        baseUrl: current.openAIBaseUrl,
        model: current.openAIModel
      });
      setTestMessage(result.ok ? `连接成功：${result.baseUrlUsed ?? current.openAIBaseUrl}` : result.message);
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="panel-section auth-focus-card">
      <div className="section-title">
        <ServerCog size={18} />
        <span>模型模式</span>
      </div>
      <p className="hint">默认使用爪爪托管聊天。普通用户不需要填写任何地址或密钥。</p>
      <div className="segmented">
        <button className={current.aiMode === "cloud" ? "active" : ""} onClick={() => void update({ aiMode: "cloud" })}>
          爪爪托管聊天
        </button>
        <button className={current.aiMode === "custom" ? "active" : ""} onClick={() => void update({ aiMode: "custom" })}>
          使用自己的模型
        </button>
      </div>

      {current.aiMode === "cloud" ? (
        <div className="friendly-checks">
          <span>
            <CheckCircle2 size={14} /> 已隐藏技术配置
          </span>
          <span>
            <Wifi size={14} /> 连接爪爪聊天
          </span>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Base URL</span>
            <input value={current.openAIBaseUrl} onChange={(event) => void update({ openAIBaseUrl: event.target.value })} />
          </label>
          <label className="field">
            <span>Model</span>
            <input value={current.openAIModel} onChange={(event) => void update({ openAIModel: event.target.value })} />
          </label>
          <label className="field token-field">
            <span>API Key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={secrets?.openaiApiKey ? "已保存在本机，测试或更换时重新输入" : "只会保存在本机 safeStorage"}
            />
          </label>
          <div className="toolbar-row">
            <button onClick={() => void testConnection()} disabled={testing || (!apiKey && !secrets?.openaiApiKey)}>
              <Wifi size={15} /> {testing ? "测试中" : "测试连接"}
            </button>
            <button className="primary-button" disabled={!apiKey} onClick={() => void setSecret("openaiApiKey", apiKey).then(() => setApiKey(""))}>
              <KeyRound size={15} /> 保存到本机
            </button>
            <button onClick={() => void clearSecret("openaiApiKey")}>
              <Trash2 size={15} /> 清除
            </button>
          </div>
          {testMessage ? <p className="hint">{testMessage}</p> : null}
          <p className="hint">自带聊天会从桌面端连接你自己的服务；密钥不会发送到爪爪后端。</p>
        </>
      )}
      {!secrets?.encryptionAvailable ? <p className="warning-line">当前系统无法使用 Electron safeStorage 安全持久化密钥。</p> : null}
    </section>
  );
}
