import { Home, Images, LockKeyhole, ScrollText, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { AssetMapper } from "./AssetMapper";
import { AuditLogPanel } from "./AuditLogPanel";
import { CoreStatusPanel } from "./CoreStatusPanel";
import { ModelPanel } from "./ModelPanel";
import { SafetyModeSwitch } from "./SafetyModeSwitch";
import { TaskTimeline } from "./TaskTimeline";

const TABS = ["换装", "能力", "授权", "记录", "关于"] as const;
type Tab = (typeof TABS)[number];

const CAPABILITIES = [
  { icon: "🔎", title: "找资料", desc: "联网查资料，整理中文摘要和来源。" },
  { icon: "📊", title: "做演示", desc: "一句话生成演示文件，可继续让爪爪修改。" },
  { icon: "📄", title: "写论文", desc: "帮你写提纲、初稿和可编辑文档。" },
  { icon: "🗂", title: "整理文件", desc: "只处理你选择或拖入的文件。" },
  { icon: "🌐", title: "看网页", desc: "总结网页、对比信息，不自动提交。" },
  { icon: "🪄", title: "帮我看", desc: "授权后在其他应用旁边陪你处理任务。" }
];

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen } = useAppStore();
  const { settings, update } = useSettingsStore();
  const [tab, setTab] = useState<Tab>("换装");
  const [aboutClicks, setAboutClicks] = useState(0);
  if (!settingsOpen || !settings) return null;

  return (
    <div className="side-panel companion-room no-drag">
      <header className="panel-header">
        <div className="room-title">
          <Home size={20} />
          <strong>伙伴小屋</strong>
        </div>
        <button title="关闭" onClick={() => setSettingsOpen(false)}>
          <X size={18} />
        </button>
      </header>
      <nav className="room-tabs">
        {TABS.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {iconFor(item)}
            <span>{item}</span>
          </button>
        ))}
      </nav>
      <main className="panel-content">
        {tab === "换装" ? (
          <>
            <section className="panel-section">
              <div className="section-title">
                <Images size={17} />
                <span>桌宠样子</span>
              </div>
              <label className="field">
                <span>大小</span>
                <input type="range" min="0.75" max="1.35" step="0.05" value={settings.petScale} onChange={(event) => void update({ petScale: Number(event.target.value) })} />
              </label>
              <label className="checkbox-line">
                <input type="checkbox" checked={settings.alwaysOnTop} onChange={(event) => void window.minipet.invoke("window:set-always-on-top", { enabled: event.target.checked }).then(() => update({ alwaysOnTop: event.target.checked }))} />
                一直在桌面上陪我
              </label>
            </section>
            <AssetMapper />
          </>
        ) : null}
        {tab === "能力" ? (
          <section className="panel-section">
            <div className="section-title">
              <Sparkles size={17} />
              <span>爪爪会做什么</span>
            </div>
            <div className="capability-grid">
              {CAPABILITIES.map((item) => (
                <article className="capability-card" key={item.title}>
                  <span>{item.icon}</span>
                  <strong>{item.title}</strong>
                  <p>{item.desc}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {tab === "授权" ? <SafetyModeSwitch /> : null}
        {tab === "记录" ? (
          <>
            <TaskTimeline />
            <AuditLogPanel />
          </>
        ) : null}
        {tab === "关于" ? (
          <section className="panel-section">
            <div className="section-title">
              <ScrollText size={17} />
              <span>关于爪爪伙伴</span>
            </div>
            <p>爪爪伙伴会尽量把复杂任务变成一句话。需要更强能力时，会先征得你同意再准备智能核心。</p>
            <p className="hint">删除、付款、提交表单、发送消息等高风险动作，都需要你再次确认。</p>
            <button
              className="ghost-button"
              onClick={() => {
                const next = aboutClicks + 1;
                setAboutClicks(next);
                if (next >= 5) void update({ advancedUnlocked: true });
              }}
            >
              版本 0.2.0
            </button>
            {settings.advancedUnlocked ? (
              <div className="advanced-box">
                <div className="section-title">
                  <LockKeyhole size={17} />
                  <span>高级诊断</span>
                </div>
                <CoreStatusPanel />
                <ModelPanel />
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

function iconFor(tab: Tab) {
  return {
    换装: "🎀",
    能力: "✨",
    授权: "🛡",
    记录: "📒",
    关于: "🐾"
  }[tab];
}
