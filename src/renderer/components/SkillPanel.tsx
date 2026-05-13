import { Copy, PackageCheck, ShieldAlert } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";

const SKILLS = [
  {
    key: "felo-search",
    name: "felo-search",
    desc: "联网搜索和引用来源",
    level: "需要确认",
    command: "openclaw skill install felo-search",
    hint: "可能需要你先登录对应服务"
  },
  {
    key: "felo-slides",
    name: "felo-slides",
    desc: "生成 PPT / slide deck",
    level: "需要确认",
    command: "openclaw skill install felo-slides",
    hint: "可能需要你准备素材或服务账号"
  },
  {
    key: "browser-automation",
    name: "browser automation / Playwright MCP",
    desc: "网页导航、读取、表单草稿",
    level: "会先询问",
    command: "openclaw mcp add playwright",
    hint: "涉及网页操作时会先问你"
  },
  {
    key: "document-file",
    name: "document/file skill",
    desc: "文件总结、转换、整理",
    level: "需要确认",
    command: "openclaw skill install document-file",
    hint: "处理文件前会先问你"
  },
  {
    key: "scheduler",
    name: "scheduler/cron",
    desc: "定时提醒或自动化",
    level: "会先询问",
    command: "openclaw skill install scheduler",
    hint: "自动执行前会先问你"
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
      <p className="hint">爪爪不会自动安装第三方技能。安装前请确认来源可信。</p>
      <div className="skill-grid">
        {SKILLS.map((skill) => (
          <article key={skill.key} className="skill-card">
            <header>
              <strong>{skill.name}</strong>
              <span>{skill.level}</span>
            </header>
            <p>{skill.desc}</p>
            <p className="hint">{skill.hint}</p>
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
              <ShieldAlert size={14} /> 安装或更新前，爪爪会再次让你确认。
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
