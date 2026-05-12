import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useSettingsStore } from "../store/settingsStore";

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const { settings, update } = useSettingsStore();
  const steps = ["欢迎", "一句话", "守护"];
  if (settings?.onboarded) return null;
  return (
    <div className="modal-backdrop onboarding">
      <section className="wizard-card">
        <header>
          <strong>爪爪伙伴</strong>
          <span>{steps[step]}</span>
        </header>
        {step === 0 ? (
          <div className="wizard-page">
            <CheckCircle2 size={42} />
            <h1>你好，我是爪爪</h1>
            <p>我可以陪在桌面上。你只要说一句话，我会帮你判断是找资料、做演示、写论文，还是整理文件。</p>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="wizard-page">
            <Sparkles size={38} />
            <h1>需要时我会准备智能核心</h1>
            <p>第一次做演示、写论文、看网页或整理文件时，我会先征得你同意，再下载和启动所需能力。</p>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="wizard-page">
            <ShieldCheck size={38} />
            <h1>高风险动作会先问你</h1>
            <p>删除、付款、提交表单、发送消息等操作，不会自动执行。你可以随时让爪爪停止。</p>
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
            <button className="primary-button" onClick={() => void update({ onboarded: true })}>
              显示桌宠
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
