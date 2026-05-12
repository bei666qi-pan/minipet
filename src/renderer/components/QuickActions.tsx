import { BookOpenText, FileText, Globe2, Home, Monitor, Presentation, Square, WandSparkles } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useCompanionRunner } from "../hooks/useCompanionRunner";
import { CoreInstallModal } from "./CoreInstallModal";
import { PermissionModal } from "./PermissionModal";

const ACTIONS = [
  { label: "找资料", icon: Globe2, prompt: "帮我联网找资料，并用中文总结重点和来源。" },
  { label: "做演示", icon: Presentation, prompt: "帮我做一个 8 页演示，主题是：" },
  { label: "写论文", icon: BookOpenText, prompt: "帮我写一篇论文提纲和初稿，主题是：" },
  { label: "整理文件", icon: FileText, prompt: "帮我整理这些文件，给出摘要和重点。" },
  { label: "看网页", icon: Monitor, prompt: "帮我打开网页并总结内容，不要提交表单。" },
  { label: "能力小屋", icon: Home, settings: true },
  { label: "帮我看", icon: WandSparkles, prompt: "帮我看当前应用里这件事：" },
  { label: "停止", icon: Square, stop: true }
];

export function QuickActions() {
  const { quickOpen, setSettingsOpen, say, setCommandOpen } = useAppStore();
  const runner = useCompanionRunner();
  if (!quickOpen) return null;

  return (
    <>
      <section className="quick-actions no-drag">
        <div className="quick-grid">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => {
                  if (action.settings) setSettingsOpen(true);
                  else if (action.stop) say("我已经暂停当前显示的任务。若智能核心仍在处理，请在记录里查看。", "warning");
                else if (action.prompt) {
                  setCommandOpen(true);
                  void runner.run(action.prompt);
                }
                }}
              >
                <Icon size={18} /> {action.label}
              </button>
            );
          })}
        </div>
      </section>
      <CoreInstallModal message={runner.coreAuthorizationText} onCancel={runner.clearCoreAuthorization} onConfirm={() => void runner.confirmCoreInstall()} />
      <PermissionModal
        decision={runner.pendingPermission}
        actionText="让爪爪伙伴继续完成这件事"
        consequences="可能会读取你选择的文件或网页内容；不会自动付款、删除、发送消息或提交敏感信息。"
        onCancel={runner.clearPermission}
        onConfirm={() => void runner.confirmPermission()}
      />
    </>
  );
}
