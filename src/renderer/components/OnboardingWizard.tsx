import { CheckCircle2, MousePointerClick, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";

const INTRO =
  "你好，我是 MiniPet，你的桌面学习/办公搭子。你可以直接问我问题，也可以让我帮你总结资料、提醒任务。默认安全模式下，我不会自动删除文件或执行高危操作。";

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const { settings, update } = useSettingsStore();
  const { say, setTalkOpen } = useAppStore();
  const steps = ["点击说话", "直接使用", "安全确认"];
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
          <strong>MiniPet</strong>
          <span>{steps[step]}</span>
        </header>
        {step === 0 ? (
          <div className="wizard-page">
            <MousePointerClick size={42} />
            <h1>点击桌宠，就能和我说话</h1>
            <p>{INTRO}</p>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="wizard-page">
            <Sparkles size={38} />
            <h1>默认不用配置</h1>
            <p>MiniPet 会使用托管模式连接官方云端。你不需要填写技术配置，也不需要理解底层技术。</p>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="wizard-page">
            <ShieldCheck size={38} />
            <h1>高风险动作会先问你</h1>
            <p>总结文件、提醒任务、普通问答可以直接开始；删除、付款、提交表单、发送消息等高风险动作不会自动执行。</p>
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
