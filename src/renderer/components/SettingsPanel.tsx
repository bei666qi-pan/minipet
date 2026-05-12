import { Bell, Home, Images, Moon, Power, ScrollText, Shield, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { AssetMapper } from "./AssetMapper";
import { AuditLogPanel } from "./AuditLogPanel";
import { CoreStatusPanel } from "./CoreStatusPanel";
import { ModelPanel } from "./ModelPanel";
import { SafetyModeSwitch } from "./SafetyModeSwitch";
import { TaskTimeline } from "./TaskTimeline";

const TABS = ["连接授权", "外观贴图", "陪伴提醒", "记录", "关于"] as const;
type Tab = (typeof TABS)[number];

interface Props {
  standalone?: boolean;
}

export function SettingsPanel({ standalone = false }: Props) {
  const { settingsOpen, setSettingsOpen } = useAppStore();
  const { settings, update } = useSettingsStore();
  const [tab, setTab] = useState<Tab>("连接授权");
  if (!settings || (!standalone && !settingsOpen)) return null;

  const close = () => {
    if (standalone) void window.minipet.invoke("window:close-settings");
    else setSettingsOpen(false);
  };

  return (
    <div className={standalone ? "settings-page no-drag" : "side-panel companion-room no-drag"}>
      <header className="panel-header settings-header">
        <div className="room-title">
          <Home size={21} />
          <strong>MiniPet 设置</strong>
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
        {tab === "连接授权" ? (
          <>
            <ModelPanel />
            <CoreStatusPanel />
            <SafetyModeSwitch />
          </>
        ) : null}

        {tab === "外观贴图" ? (
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
                <span>始终在桌面上方陪伴</span>
              </label>
              <button onClick={() => void window.minipet.invoke("window:hide")}>
                <Power size={16} /> 隐藏桌宠
              </button>
            </section>
            <AssetMapper />
          </>
        ) : null}

        {tab === "陪伴提醒" ? (
          <section className="panel-section">
            <div className="section-title">
              <Bell size={18} />
              <span>主动说话</span>
            </div>
            <label className="checkbox-line">
              <input type="checkbox" checked={settings.proactiveSpeechEnabled} onChange={(event) => void update({ proactiveSpeechEnabled: event.target.checked })} />
              <span>允许 MiniPet 低打扰地主动开口</span>
            </label>
            <label className="field">
              <span>对话入口闲置后自动隐藏</span>
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
        ) : null}

        {tab === "记录" ? (
          <>
            <TaskTimeline />
            <AuditLogPanel />
          </>
        ) : null}

        {tab === "关于" ? (
          <section className="panel-section">
            <div className="section-title">
              <ScrollText size={18} />
              <span>关于 MiniPet</span>
            </div>
            <p>
              MiniPet 是低打扰桌面陪伴入口。点击桌宠即可打开唯一对话入口；涉及安装、文件、网页、提交等敏感动作时，会先弹窗确认。
            </p>
            <p className="hint">视觉风格采用清透水彩、柔和高明度、细描边和清晰层级，不仿具体作品角色。</p>
            <div className="section-title">
              <Shield size={18} />
              <span>隐私边界</span>
            </div>
            <p className="hint">主动说话会按授权模式裁剪上下文；默认不会读取屏幕、全盘文件或敏感凭据。</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function iconFor(tab: Tab) {
  const props = { size: 18 };
  return {
    连接授权: <Shield {...props} />,
    外观贴图: <Images {...props} />,
    陪伴提醒: <Sparkles {...props} />,
    记录: <ScrollText {...props} />,
    关于: <Home {...props} />
  }[tab];
}
