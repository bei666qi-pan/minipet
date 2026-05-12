import { Copy, PackageCheck, ShieldAlert } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";

const SKILLS = [
  {
    key: "felo-search",
    name: "felo-search",
    desc: "联网搜索和引用来源",
    risk: "中风险",
    command: "openclaw skill install felo-search",
    needKey: "可能需要搜索服务 API Key"
  },
  {
    key: "felo-slides",
    name: "felo-slides",
    desc: "生成 PPT / slide deck",
    risk: "中风险",
    command: "openclaw skill install felo-slides",
    needKey: "可能需要模型或素材服务 Key"
  },
  {
    key: "browser-automation",
    name: "browser automation / Playwright MCP",
    desc: "网页导航、读取、表单草稿",
    risk: "高风险",
    command: "openclaw mcp add playwright",
    needKey: "通常不需要"
  },
  {
    key: "document-file",
    name: "document/file skill",
    desc: "文件总结、转换、整理",
    risk: "中风险",
    command: "openclaw skill install document-file",
    needKey: "按工具而定"
  },
  {
    key: "scheduler",
    name: "scheduler/cron",
    desc: "定时提醒或自动化",
    risk: "高风险",
    command: "openclaw skill install scheduler",
    needKey: "通常不需要"
  }
];

export function SkillPanel() {
  const { settings, update } = useSettingsStore();
  const enabled = settings?.enabledSkills ?? {};
  return (
    <section className="panel-section">
      <div className="section-title">
        <PackageCheck size={17} />
        <span>推荐技能</span>
      </div>
      <p className="hint">MiniPet 不会自动安装第三方技能。安装前请确认来源可信，第三方 skill 可能执行未审计代码。</p>
      <div className="skill-grid">
        {SKILLS.map((skill) => (
          <article key={skill.key} className="skill-card">
            <header>
              <strong>{skill.name}</strong>
              <span>{skill.risk}</span>
            </header>
            <p>{skill.desc}</p>
            <p className="hint">{skill.needKey} · 需要 OpenClaw</p>
            <code>{skill.command}</code>
            <div className="toolbar-row">
              <button onClick={() => void navigator.clipboard.writeText(skill.command)}>
                <Copy size={14} /> 复制命令
              </button>
              <button onClick={() => void update({ enabledSkills: { ...enabled, [skill.key]: !enabled[skill.key] } })}>
                {enabled[skill.key] ? "已启用入口" : "我已安装"}
              </button>
            </div>
            <p className="warning-line">
              <ShieldAlert size={14} /> 安装或更新技能需要 Full Access + 管理员高级开关。
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
