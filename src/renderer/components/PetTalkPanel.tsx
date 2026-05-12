import { Bell, FilePlus2, FolderOpen, Mic, SendHorizonal, Settings, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCompanionRunner } from "../hooks/useCompanionRunner";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { CoreInstallModal } from "./CoreInstallModal";
import { ModelAuthModal } from "./ModelAuthModal";
import { PermissionModal } from "./PermissionModal";

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  start: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
};

export function PetTalkPanel() {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    talkOpen,
    talkLastInteractionAt,
    selectedFiles,
    addSelectedFiles,
    clearSelectedFiles,
    say,
    setTalkOpen,
    touchTalkPanel
  } = useAppStore();
  const { settings } = useSettingsStore();
  const runner = useCompanionRunner();
  const hasBlockingModal = Boolean(runner.coreAuthorizationText || runner.modelAuthorizationText || runner.pendingPermission);
  const autoHideMs = Math.max(8, settings?.talkAutoHideSeconds ?? 30) * 1000;

  useEffect(() => {
    if (!talkOpen) return;
    const handle = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(handle);
  }, [talkOpen]);

  useEffect(() => {
    if (!talkOpen || hasBlockingModal || input.trim() || selectedFiles.length) return;
    const timer = window.setInterval(() => {
      if (Date.now() - talkLastInteractionAt >= autoHideMs) setTalkOpen(false);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoHideMs, hasBlockingModal, input, selectedFiles.length, setTalkOpen, talkLastInteractionAt, talkOpen]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    touchTalkPanel();
    await runner.run(text);
  }

  async function selectFiles() {
    touchTalkPanel();
    const files = await window.minipet.invoke<string[]>("dialog:select-files");
    if (files.length) {
      addSelectedFiles(files);
      say(`已加入 ${files.length} 个文件。你可以直接告诉我想怎么总结或整理。`, "listening");
      setInput("请帮我总结这些文件");
    }
  }

  function startVoice() {
    touchTalkPanel();
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
      touchTalkPanel();
      say("我听到了，可以直接发送。", "listening");
    };
    recognition.onerror = () => say("我没听清，可以用文字再说一次。", "listening");
    recognition.start();
  }

  function openSettings() {
    touchTalkPanel();
    void window.minipet.invoke("window:open-settings");
  }

  return (
    <>
      {talkOpen ? (
        <section className="pet-talk-panel no-drag" onPointerDown={touchTalkPanel} onFocus={touchTalkPanel}>
          <div className="talk-status">
            <span className="core-dot ready" />
            <span>{settings?.aiMode === "custom" ? "自带模型模式" : "托管模式已开启"}</span>
            <button title="收起" onClick={() => setTalkOpen(false)}>
              <X size={15} />
            </button>
          </div>
          <div className="quick-intents">
            <button onClick={() => inputRef.current?.focus()}>
              <Sparkles size={15} /> 问我一下
            </button>
            <button onClick={() => void selectFiles()}>
              <FilePlus2 size={15} /> 总结文件
            </button>
            <button onClick={() => setInput("提醒我：")}>
              <Bell size={15} /> 任务提醒
            </button>
            <button onClick={openSettings}>
              <Settings size={15} /> 设置
            </button>
            <button onClick={openSettings}>高级</button>
          </div>
          <div className="talk-input-row">
            <button title="选择文件" onClick={() => void selectFiles()}>
              <FilePlus2 size={18} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                touchTalkPanel();
              }}
              onKeyDown={(event) => {
                touchTalkPanel();
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="直接问我，例如：帮我整理今天的任务"
            />
            <button title="语音输入" onClick={startVoice}>
              <Mic size={18} />
            </button>
            <button className="primary-button" title="发送" onClick={() => void send()}>
              <SendHorizonal size={18} />
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
        </section>
      ) : null}
      <CoreInstallModal message={runner.coreAuthorizationText} onCancel={runner.clearCoreAuthorization} onConfirm={() => void runner.confirmCoreInstall()} />
      <ModelAuthModal
        message={runner.modelAuthorizationText}
        onCancel={runner.clearModelAuthorization}
        onOpenSettings={() => void runner.openSettingsForModelAuthorization()}
      />
      <PermissionModal
        decision={runner.pendingPermission}
        actionText="让 MiniPet 继续完成这件事"
        consequences="可能会读取你主动选择的文件或任务内容；不会自动付款、删除、发送消息或提交敏感信息。"
        onCancel={runner.clearPermission}
        onConfirm={() => void runner.confirmPermission()}
      />
    </>
  );
}
