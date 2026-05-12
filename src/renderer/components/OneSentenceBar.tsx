import { FilePlus2, FolderOpen, Mic, SendHorizonal, X } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { useCompanionRunner } from "../hooks/useCompanionRunner";
import { CoreInstallModal } from "./CoreInstallModal";
import { PermissionModal } from "./PermissionModal";

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  start: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
};

export function OneSentenceBar() {
  const [input, setInput] = useState("");
  const { selectedFiles, addSelectedFiles, clearSelectedFiles, say } = useAppStore();
  const { settings, core } = useSettingsStore();
  const runner = useCompanionRunner();

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await runner.run(text);
  }

  async function selectFiles() {
    const files = await window.minipet.invoke<string[]>("dialog:select-files");
    if (files.length) {
      addSelectedFiles(files);
      say(`已加入 ${files.length} 个文件。你可以直接说“帮我整理这些文件”。`, "listening");
    }
  }

  function startVoice() {
    const ctor = (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor; SpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!settings?.voiceInputEnabled || !ctor) {
      say("这台电脑暂时不能直接听写，你可以用文字告诉我。", "listening");
      return;
    }
    const recognition = new ctor();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      setInput(text);
      say("我听到了，可以直接发送。", "listening");
    };
    recognition.onerror = () => say("我没听清，可以用文字再说一次。", "listening");
    recognition.start();
  }

  return (
    <section className="one-sentence-bar no-drag">
      <div className="core-pill">
        <span className={`core-dot ${core?.connected ? "ready" : ""}`} />
        <span>{core?.connected ? "智能核心已准备好" : core?.label ?? "我会在需要时准备智能核心"}</span>
      </div>
      <div className="one-input-row">
        <button title="选择文件" onClick={() => void selectFiles()}>
          <FilePlus2 size={17} />
        </button>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="和爪爪说一句话，例如：帮我做一个 8 页产品介绍演示"
        />
        <button title="语音输入" onClick={startVoice}>
          <Mic size={17} />
        </button>
        <button className="primary-button" title="发送" onClick={() => void send()}>
          <SendHorizonal size={17} />
        </button>
      </div>
      {selectedFiles.length ? (
        <div className="selected-files">
          <FolderOpen size={14} />
          <span>已选 {selectedFiles.length} 个文件</span>
          <button title="清空文件" onClick={clearSelectedFiles}>
            <X size={13} />
          </button>
        </div>
      ) : null}
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
