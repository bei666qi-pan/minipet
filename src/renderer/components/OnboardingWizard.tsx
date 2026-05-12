import { CheckCircle2, MousePointerClick, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const { settings, update } = useSettingsStore();
  const { say, setTalkOpen } = useAppStore();
  const steps = ["点击说话", "一句话任务", "守护确认"];
  if (settings?.onboarded) return null;

  async function finish() {
    await update({ onboarded: true });
    say("点一下我就能说话。我会尽量安静地陪在这里，需要时再帮你接手任务。", "idle_welcome");
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
            <h1>点一下桌宠，就能和我说话</h1>
            <p>主界面只保留桌宠、气泡和同一个输入入口。入口会在闲置后自动收起，不挡你的桌面。</p>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="wizard-page">
            <Sparkles size={38} />
            <h1>一句话交给我</h1>
            <p>你可以让我查资料、做演示、写初稿或整理主动选择的文件。需要更强能力时，我会先请求授权。</p>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="wizard-page">
            <ShieldCheck size={38} />
            <h1>高风险动作会先问你</h1>
            <p>删除、付款、提交表单、发送消息等动作不会自动执行。你也可以在设置里调整守护模式。</p>
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
              <CheckCircle2 size={16} /> 显示桌宠
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
