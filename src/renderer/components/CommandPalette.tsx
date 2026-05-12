import { Send, X } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useCompanionRunner } from "../hooks/useCompanionRunner";
import { CoreInstallModal } from "./CoreInstallModal";
import { PermissionModal } from "./PermissionModal";

export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useAppStore();
  const runner = useCompanionRunner();
  const [input, setInput] = useState("");
  if (!commandOpen) return null;

  async function send() {
    const content = input.trim();
    if (!content) return;
    setInput("");
    await runner.run(content);
  }

  return (
    <section className="command-palette no-drag">
      <header>
        <strong>和爪爪说</strong>
        <button title="关闭" onClick={() => setCommandOpen(false)}>
          <X size={16} />
        </button>
      </header>
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
        placeholder="输入一句话，爪爪会判断是聊天、做演示、写论文、找资料还是整理文件。"
      />
      <div className="palette-footer">
        <span>Enter 发送，Shift+Enter 换行</span>
        <button className="primary-button" onClick={() => void send()}>
          <Send size={16} /> 发送
        </button>
      </div>
      <CoreInstallModal message={runner.coreAuthorizationText} onCancel={runner.clearCoreAuthorization} onConfirm={() => void runner.confirmCoreInstall()} />
      <PermissionModal
        decision={runner.pendingPermission}
        actionText="让爪爪伙伴继续完成这件事"
        consequences="可能会读取你选择的文件或网页内容；不会自动付款、删除、发送消息或提交敏感信息。"
        onCancel={runner.clearPermission}
        onConfirm={() => void runner.confirmPermission()}
      />
    </section>
  );
}
