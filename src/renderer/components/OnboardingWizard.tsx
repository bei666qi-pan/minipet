import { CheckCircle2, MousePointerClick, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";

const INTRO =
  "你好，我是爪爪，你的桌面学习/办公搭子。你可以直接问我问题，也可以让我帮你总结资料、提醒任务。需要离开聊天框做事时，我会先问你。";

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const { settings, update } = useSettingsStore();
  const { say, setTalkOpen } = useAppStore();
  const steps = ["点击说话", "直接使用", "做事先问"];
  if (settings?.onboarded) return null;

  async function finish() {
    await update({ onboarded: true, aiMode: "cloud" });
    say(INTRO, "idle_welcome");
    setTalkOpen(true);
  }

  return (
    <div className="modal-backdrop onboarding">
      <section className="wizard-card">
        <header>
          <strong>爪爪</strong>
          <span>{steps[step]}</span>
        </header>
        {step === 0 ? (
          <div className="wizard-page">
            <MousePointerClick size={42} />
            <h1>点一下桌宠，就能和我说话</h1>
            <p>{INTRO}</p>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="wizard-page">
            <Sparkles size={38} />
            <h1>默认可以直接用</h1>
            <p>普通聊天、整理资料和提醒任务都从同一个聊天框开始，不需要先理解复杂设置。</p>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="wizard-page">
            <ShieldCheck size={38} />
            <h1>离开聊天框做事会先问你</h1>
            <p>打开网页、处理文件或影响电脑状态前，爪爪会用简单的话问你是否继续。</p>
          </div>
        ) : null}
        <footer>
          <button disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
            上一步
          </button>
          {step < steps.length - 1 ? (
            <button className="primary-button" onClick={() => setStep((value) => value + 1)}>
              下一步
            </button>
          ) : (
            <button className="primary-button" onClick={() => void finish()}>
              <CheckCircle2 size={16} /> 开始使用
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
