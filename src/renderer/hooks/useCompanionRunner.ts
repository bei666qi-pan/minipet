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
  const { load, setCoreStatus } = useSettingsStore();
  const { createTask, updateTask } = useTaskStore();
  const [pendingInput, setPendingInput] = useState<string | undefined>();
  const [pendingRequest, setPendingRequest] = useState<{ input: string; localRequestId: string } | undefined>();
  const [pendingPermission, setPendingPermission] = useState<PermissionDecision | undefined>();
  const [permissionSubmitting, setPermissionSubmitting] = useState(false);
  const [coreAuthorizationText, setCoreAuthorizationText] = useState<string | undefined>();
  const [modelAuthorizationText, setModelAuthorizationText] = useState<string | undefined>();

  async function run(
    input: string,
    options: { allowInstall?: boolean; confirmed?: boolean; authorizationScope?: "turn" | "switch_assisted"; continueTaskId?: string; skipRemember?: boolean } = {}
  ) {
    const trimmed = input.trim();
    if (!trimmed) return;
    setPendingInput(trimmed);
    if (!options.skipRemember) rememberTalk({ role: "user", text: trimmed });
    setPetState("thinking");
    setTalkOpen(true);
    const localRequestId = options.continueTaskId ?? createTask({ title: guessTitle(trimmed), method: "一句话任务", risk: guessRisk(trimmed) }).localRequestId;
    setPendingRequest({ input: trimmed, localRequestId });
    updateTask(localRequestId, { status: "running", error: undefined }, { stage: "prepare", label: options.continueTaskId ? "继续处理" : "正在准备" });
    try {
      const response = await window.minipet.invoke<CompanionResponse>("companion:run-task", {
        input: trimmed,
        files: selectedFiles,
        localRequestId,
        allowInstall: Boolean(options.allowInstall),
        confirmed: Boolean(options.confirmed),
        authorizationScope: options.authorizationScope
      });

      if (response.needsMoreInput && response.question) {
        updateTask(localRequestId, { status: "stopped", result: response.question }, { stage: "need_input", label: "需要你补一句" });
        say(response.question, "listening");
        return;
      }

      if (response.needsModelAuthorization) {
        updateTask(localRequestId, { status: "waiting_confirmation" }, { stage: "model_auth", label: "等你设置聊天" });
        setModelAuthorizationText("爪爪现在还不能聊天。打开设置补一下聊天信息后，就能继续。");
        say("我需要你先补一下聊天设置。", "surprised_alert");
        return;
      }

      if (response.needsCoreAuthorization) {
        updateTask(localRequestId, { status: "waiting_confirmation" }, { stage: "core_auth", label: "等你确认" });
        setCoreAuthorizationText("这件事需要先准备一个小工具。确认后爪爪会继续。");
        say("这件事需要你先确认一下。", "surprised_alert");
        return;
      }

      if (response.requiresConfirmation && response.permission) {
        updateTask(localRequestId, { status: "waiting_confirmation", result: "这一步需要你点头后，我再继续。" }, { stage: "confirm", label: "等你确认" });
        setPendingPermission(response.permission);
        say("这一步需要你点头后，我再继续。", "surprised_alert");
        return;
      }

      if (response.error) throw new Error(friendlyError(response.error));

      const text = formatResult(response.text || "我已经接到这件事了。", response.outputs);
      updateTask(localRequestId, { status: "success", result: text, outputs: response.outputs }, { stage: "done", label: "已完成" });
      say(text, response.outputs?.length ? "success_cheer" : "idle_welcome");
      setPendingRequest(undefined);
      clearSelectedFiles();
    } catch (error) {
      const message = error instanceof Error ? error.message : friendlyError(String(error));
      updateTask(localRequestId, { status: "error", error: message }, { stage: "failed", label: "需要重试" });
      say(`我没能完成：${message}`, "apology_sad");
    }
  }

  return {
    run,
    pendingInput,
    pendingRequest,
    pendingPermission,
    permissionSubmitting,
    coreAuthorizationText,
    modelAuthorizationText,
    clearCoreAuthorization: () => setCoreAuthorizationText(undefined),
    clearModelAuthorization: () => setModelAuthorizationText(undefined),
    clearPermission: () => {
      const request = pendingRequest;
      setPendingPermission(undefined);
      setPendingRequest(undefined);
      if (request) updateTask(request.localRequestId, { status: "stopped", result: "好，我先不继续。" }, { stage: "cancelled", label: "已取消" });
      say("好，我先不继续。", "idle_calm");
    },
    openSettingsForModelAuthorization: async () => {
      setModelAuthorizationText(undefined);
      await window.minipet.invoke("window:open-settings", { focus: "model" });
    },
    confirmCoreInstall: async () => {
      const input = pendingInput;
      setCoreAuthorizationText(undefined);
      if (input) await run(input, { allowInstall: true });
    },
    confirmPermission: async (scope: "turn" | "switch_assisted") => {
      const request = pendingRequest;
      const input = request?.input ?? pendingInput;
      setPendingPermission(undefined);
      setPermissionSubmitting(true);
      try {
        if (request) updateTask(request.localRequestId, { status: "running", result: "好的，我继续处理。" }, { stage: "authorized", label: "已允许" });
        await window.minipet.invoke("permission:authorize-turn", { authorizationScope: scope });
        if (scope === "switch_assisted") await load();
        if (input) await run(input, { allowInstall: true, confirmed: true, authorizationScope: scope, continueTaskId: request?.localRequestId, skipRemember: true });
      } finally {
        setPermissionSubmitting(false);
      }
    },
    setCoreStatus
  };
}

function guessTitle(input: string): string {
  if (/word|docx|报告|简历|方案|纪要|说明书/i.test(input)) return "做文档";
  if (/ppt|演示|幻灯|汇报/i.test(input)) return "做演示";
  if (/excel|xlsx|表格|清单|计划表|对比表|台账/i.test(input)) return "做表格";
  if (/论文|文献|综述|初稿/i.test(input)) return "写文章";
  if (/文件|文档|pdf|表格|整理|总结/i.test(input)) return "整理文件";
  if (/搜索|资料|联网|查一下|网页/i.test(input)) return "找资料";
  if (/提醒|待办|任务/i.test(input)) return "任务提醒";
  return "和爪爪说话";
}

function guessRisk(input: string): RiskLevel {
  if (/删除|付款|支付|发送|提交|安装|命令/i.test(input)) return "high";
  if (/文件|保存|下载|填写|ppt|word|excel|docx|xlsx|演示|文档|表格|论文|总结/i.test(input)) return "medium";
  return "low";
}

function formatResult(text: string, outputs?: CompanionOutput[]): string {
  if (!outputs?.length) return text;
  return `${text}\n\n已生成：\n${outputs.map((item) => `- ${item.label}: ${item.filePath}`).join("\n")}`;
}

function friendlyError(text: string): string {
  if (/api|key|token|openclaw|scope|risk|mode|permission/i.test(text)) return "这一步还需要你确认或补充设置。";
  if (/network|fetch|timeout|ECONN|ENOTFOUND/i.test(text)) return "网络有点不稳定，稍后再试一次。";
  return text || "暂时没有完成。";
}
