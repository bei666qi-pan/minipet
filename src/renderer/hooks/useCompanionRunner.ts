import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { useTaskStore, type RiskLevel } from "../store/taskStore";
import type { PermissionDecision } from "../components/PermissionModal";

interface CompanionOutput {
  filePath: string;
  label: string;
  kind: string;
}

interface CompanionResponse {
  route?: {
    title: string;
    statusLabel: string;
    output: string;
  };
  needsMoreInput?: boolean;
  question?: string;
  needsCoreAuthorization?: boolean;
  needsModelAuthorization?: boolean;
  requiresConfirmation?: boolean;
  permission?: PermissionDecision;
  error?: string;
  text?: string;
  outputs?: CompanionOutput[];
}

export function useCompanionRunner() {
  const { selectedFiles, clearSelectedFiles, say, setPetState, rememberTalk, setTalkOpen } = useAppStore();
  const { setCoreStatus } = useSettingsStore();
  const { createTask, updateTask } = useTaskStore();
  const [pendingInput, setPendingInput] = useState<string | undefined>();
  const [pendingPermission, setPendingPermission] = useState<PermissionDecision | undefined>();
  const [coreAuthorizationText, setCoreAuthorizationText] = useState<string | undefined>();
  const [modelAuthorizationText, setModelAuthorizationText] = useState<string | undefined>();

  async function run(input: string, options: { allowInstall?: boolean; confirmed?: boolean } = {}) {
    const trimmed = input.trim();
    if (!trimmed) return;
    setPendingInput(trimmed);
    rememberTalk({ role: "user", text: trimmed });
    setPetState("thinking");
    setTalkOpen(true);
    const task = createTask({ title: guessTitle(trimmed), method: "一句话任务", risk: guessRisk(trimmed) });
    updateTask(task.localRequestId, { status: "running" }, { stage: "prepare", label: "正在准备" });
    try {
      const response = await window.minipet.invoke<CompanionResponse>("companion:run-task", {
        input: trimmed,
        files: selectedFiles,
        localRequestId: task.localRequestId,
        allowInstall: Boolean(options.allowInstall),
        confirmed: Boolean(options.confirmed)
      });

      if (response.needsMoreInput && response.question) {
        updateTask(task.localRequestId, { status: "stopped", result: response.question }, { stage: "need_input", label: "需要补充一句" });
        say(response.question, "listening");
        return;
      }

      if (response.needsModelAuthorization) {
        updateTask(task.localRequestId, { status: "waiting_confirmation" }, { stage: "model_auth", label: "等待自带模型配置" });
        setModelAuthorizationText("自带模型模式需要先保存你自己的 API Key。你也可以切回 MiniPet 托管模式直接聊天。");
        say("我需要先拿到你的自带模型授权，或者切回托管模式。", "reminder_warning");
        return;
      }

      if (response.needsCoreAuthorization) {
        updateTask(task.localRequestId, { status: "waiting_confirmation" }, { stage: "core_auth", label: "等待准备高级能力" });
        setCoreAuthorizationText("这个任务需要准备 OpenClaw 高级能力和运行环境。确认后我会开始下载或启动所需能力。");
        say("这个任务需要你确认后，我才能准备高级能力。", "reminder_warning");
        return;
      }

      if (response.requiresConfirmation && response.permission) {
        updateTask(task.localRequestId, { status: "waiting_confirmation" }, { stage: "confirm", label: "等待确认" });
        setPendingPermission(response.permission);
        say("这个操作需要你确认后继续。", "reminder_warning");
        return;
      }

      if (response.error) throw new Error(response.error);

      const text = formatResult(response.text || "我已经把任务交给智能核心了。", response.outputs);
      updateTask(task.localRequestId, { status: "success", result: text, outputs: response.outputs }, { stage: "done", label: "已完成" });
      say(text, response.outputs?.length ? "success_cheer" : "idle_welcome");
      clearSelectedFiles();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateTask(task.localRequestId, { status: "error", error: message }, { stage: "failed", label: "需要重试" });
      say(`我没能完成：${message}`, "apology_sad");
    }
  }

  return {
    run,
    pendingInput,
    pendingPermission,
    coreAuthorizationText,
    modelAuthorizationText,
    clearCoreAuthorization: () => setCoreAuthorizationText(undefined),
    clearModelAuthorization: () => setModelAuthorizationText(undefined),
    clearPermission: () => setPendingPermission(undefined),
    openSettingsForModelAuthorization: async () => {
      setModelAuthorizationText(undefined);
      await window.minipet.invoke("window:open-settings", { focus: "model" });
    },
    confirmCoreInstall: async () => {
      const input = pendingInput;
      setCoreAuthorizationText(undefined);
      if (input) await run(input, { allowInstall: true });
    },
    confirmPermission: async () => {
      const input = pendingInput;
      setPendingPermission(undefined);
      if (input) await run(input, { allowInstall: true, confirmed: true });
    },
    setCoreStatus
  };
}

function guessTitle(input: string): string {
  if (/ppt|演示|幻灯|汇报/i.test(input)) return "做演示";
  if (/论文|文献|综述|初稿/i.test(input)) return "写文章";
  if (/文件|文档|pdf|表格|整理|总结/i.test(input)) return "整理文件";
  if (/搜索|资料|联网|查一下|网页/i.test(input)) return "找资料";
  if (/提醒|待办|任务/i.test(input)) return "任务提醒";
  return "和 MiniPet 说话";
}

function guessRisk(input: string): RiskLevel {
  if (/删除|付款|支付|发送|提交|安装|命令/i.test(input)) return "high";
  if (/文件|保存|下载|填写|ppt|演示|论文|总结/i.test(input)) return "medium";
  return "low";
}

function formatResult(text: string, outputs?: CompanionOutput[]): string {
  if (!outputs?.length) return text;
  return `${text}\n\n已生成：\n${outputs.map((item) => `- ${item.label}: ${item.filePath}`).join("\n")}`;
}
