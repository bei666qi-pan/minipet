import { Bell, Home, Images, Moon, Power, ScrollText, Settings, Shield, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { AssetMapper } from "./AssetMapper";
import { AuditLogPanel } from "./AuditLogPanel";
import { CoreStatusPanel } from "./CoreStatusPanel";
import { MemoryPanel } from "./MemoryPanel";
import { ModelPanel } from "./ModelPanel";
import { SafetyModeSwitch } from "./SafetyModeSwitch";
import { TaskTimeline } from "./TaskTimeline";

const TABS = ["基础", "外观", "陪伴", "记录", "高级", "关于"] as const;
type Tab = (typeof TABS)[number];

interface Props {
  standalone?: boolean;
}

export function SettingsPanel({ standalone = false }: Props) {
  const { settingsOpen, setSettingsOpen, say } = useAppStore();
  const { settings, update } = useSettingsStore();
  const [tab, setTab] = useState<Tab>("基础");
  if (!settings || (!standalone && !settingsOpen)) return null;

  const close = () => {
    if (standalone) void window.minipet.invoke("window:close-settings");
    else setSettingsOpen(false);
  };

  async function checkUpdate() {
    const result = await window.minipet.invoke<{ hasUpdate?: boolean; latest?: { version?: string }; error?: string }>("app:check-update");
    if (result.error) say(result.error, "surprised_alert");
    else say(result.hasUpdate ? `发现新版本 ${result.latest?.version}，可以通过托盘菜单下载。` : "当前已是最新版本。", "idle_calm");
  }

  return (
    <div className={standalone ? "settings-page no-drag" : "side-panel companion-room no-drag"}>
      <header className="panel-header settings-header">
        <div className="room-title">
          <Home size={21} />
          <strong>爪爪设置</strong>
        </div>
        <button title="关闭" onClick={close}>
          <X size={18} />
        </button>
      </header>
      <nav className="room-tabs settings-tabs">
        {TABS.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {iconFor(item)}
            <span>{item}</span>
          </button>
        ))}
      </nav>
      <main className="panel-content settings-content">
        {tab === "基础" ? (
          <>
            <section className="panel-section">
              <div className="section-title">
                <Shield size={18} />
                <span>默认托管模式</span>
              </div>
              <p>爪爪默认可以直接聊天。普通用户不需要填写复杂配置。</p>
              <div className="friendly-checks">
                <span>匿名设备 ID</span>
                <span>默认 200 万 token 额度</span>
                <span>安全模式</span>
              </div>
              <button onClick={() => void checkUpdate()}>检查更新</button>
            </section>
            <SafetyModeSwitch />
          </>
        ) : null}

        {tab === "外观" ? (
          <>
            <section className="panel-section">
              <div className="section-title">
                <Images size={18} />
                <span>桌面显示</span>
              </div>
              <label className="field">
                <span>桌宠大小</span>
                <input
                  type="range"
                  min="0.75"
                  max="1.35"
                  step="0.05"
                  value={settings.petScale}
                  onChange={(event) => void update({ petScale: Number(event.target.value) })}
                />
              </label>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={settings.alwaysOnTop}
                  onChange={(event) =>
                    void window.minipet.invoke("window:set-always-on-top", { enabled: event.target.checked }).then(() => update({ alwaysOnTop: event.target.checked }))
                  }
                />
                <span>保持在桌面上方陪伴</span>
              </label>
              <button onClick={() => void window.minipet.invoke("window:collapse-to-floating-ball")}>
                <Power size={16} /> 隐藏桌宠
              </button>
            </section>
            <AssetMapper />
          </>
        ) : null}

        {tab === "陪伴" ? (
          <>
          <section className="panel-section">
            <div className="section-title">
              <Bell size={18} />
              <span>主动开口</span>
            </div>
            <label className="checkbox-line">
              <input type="checkbox" checked={settings.proactiveSpeechEnabled} onChange={(event) => void update({ proactiveSpeechEnabled: event.target.checked })} />
              <span>允许爪爪低打扰地主动开口</span>
            </label>
            <label className="field">
              <span>对话入口闲置后自动隐藏（秒）</span>
              <input
                type="number"
                min="8"
                max="120"
                value={settings.talkAutoHideSeconds}
                onChange={(event) => void update({ talkAutoHideSeconds: Number(event.target.value) })}
              />
            </label>
            <div className="section-title">
              <Moon size={18} />
              <span>安静时段</span>
            </div>
            <label className="checkbox-line">
              <input type="checkbox" checked={settings.quietHoursEnabled} onChange={(event) => void update({ quietHoursEnabled: event.target.checked })} />
              <span>安静时段只保留重要提醒</span>
            </label>
            <div className="split-fields two">
              <label className="field">
                <span>开始</span>
                <input value={settings.quietHoursStart} onChange={(event) => void update({ quietHoursStart: event.target.value })} />
              </label>
              <label className="field">
                <span>结束</span>
                <input value={settings.quietHoursEnd} onChange={(event) => void update({ quietHoursEnd: event.target.value })} />
              </label>
            </div>
          </section>
          <MemoryPanel />
          </>
        ) : null}

        {tab === "记录" ? (
          <>
            <TaskTimeline />
            <AuditLogPanel />
          </>
        ) : null}

        {tab === "高级" ? (
          <>
            <ModelPanel />
            <CoreStatusPanel />
          </>
        ) : null}

        {tab === "关于" ? (
          <section className="panel-section">
            <div className="section-title">
              <ScrollText size={18} />
              <span>关于爪爪</span>
            </div>
            <p>爪爪是低打扰桌面陪伴入口。点击桌宠即可打开唯一聊天框；离开聊天框做事前，会先用简单的话问你。</p>
            <p className="hint">默认不会采集真实姓名、手机号或邮箱。托管模式只使用匿名设备 ID 识别额度。</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function iconFor(tab: Tab) {
  const props = { size: 18 };
  return {
    基础: <Shield {...props} />,
    外观: <Images {...props} />,
    陪伴: <Sparkles {...props} />,
    记录: <ScrollText {...props} />,
    高级: <Settings {...props} />,
    关于: <Home {...props} />
  }[tab];
}
