import { Bell, Copy, FilePlus2, FileText, FolderOpen, Mic, Presentation, Search, SendHorizonal, Settings, Sparkles, Table2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCompanionRunner } from "../hooks/useCompanionRunner";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { useTaskStore } from "../store/taskStore";

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
    bubbleText,
    addSelectedFiles,
    clearSelectedFiles,
    say,
    setTalkOpen,
    touchTalkPanel
  } = useAppStore();
  const { settings } = useSettingsStore();
  const activeTaskId = useTaskStore((state) => state.activeTaskId);
  const activeTask = useTaskStore((state) => state.tasks.find((task) => task.localRequestId === activeTaskId));
  const runner = useCompanionRunner();
  const hasBlockingPrompt = Boolean(runner.coreAuthorizationText || runner.modelAuthorizationText || runner.pendingPermission);
  const autoHideMs = Math.max(8, settings?.talkAutoHideSeconds ?? 30) * 1000;
  const outputText = activeTask?.result || activeTask?.error || bubbleText;

  useEffect(() => {
    if (!talkOpen) return;
    const handle = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(handle);
  }, [talkOpen]);

  useEffect(() => {
    if (!talkOpen || hasBlockingPrompt || input.trim() || selectedFiles.length) return;
    const timer = window.setInterval(() => {
      if (Date.now() - talkLastInteractionAt >= autoHideMs) setTalkOpen(false);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoHideMs, hasBlockingPrompt, input, selectedFiles.length, setTalkOpen, talkLastInteractionAt, talkOpen]);

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
      say(`已加入 ${files.length} 个文件。你可以直接告诉我想怎么处理。`, "listening");
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

  function fillPrompt(text: string) {
    touchTalkPanel();
    setInput(text);
    inputRef.current?.focus();
  }

  function renderBlockingPrompt() {
    if (runner.pendingPermission) {
      return (
        <div className="permission-inline permission-dock" role="group" aria-label="爪爪需要你确认">
          <span>允许后我会直接继续这件事。</span>
          <div>
            <button disabled={runner.permissionSubmitting} onClick={runner.clearPermission}>
              先不要
            </button>
            <button disabled={runner.permissionSubmitting} onClick={() => void runner.confirmPermission("turn")}>
              只允许这一次
            </button>
            <button className="primary-button" disabled={runner.permissionSubmitting} onClick={() => void runner.confirmPermission("switch_assisted")}>
              以后同类也可以
            </button>
          </div>
        </div>
      );
    }

    if (runner.coreAuthorizationText) {
      return (
        <div className="permission-inline permission-dock" role="group" aria-label="爪爪需要你确认准备工具">
          <span>{runner.coreAuthorizationText}</span>
          <div>
            <button onClick={runner.clearCoreAuthorization}>先不要</button>
            <button className="primary-button" onClick={() => void runner.confirmCoreInstall()}>
              继续
            </button>
          </div>
        </div>
      );
    }

    if (runner.modelAuthorizationText) {
      return (
        <div className="permission-inline permission-dock" role="group" aria-label="爪爪需要你设置聊天">
          <span>{runner.modelAuthorizationText}</span>
          <div>
            <button onClick={runner.clearModelAuthorization}>先不要</button>
            <button className="primary-button" onClick={() => void runner.openSettingsForModelAuthorization()}>
              打开设置
            </button>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <>
      {talkOpen ? (
        <section className="pet-talk-panel no-drag" onPointerDown={touchTalkPanel} onFocus={touchTalkPanel}>
          <div className="talk-status">
            <span className="core-dot ready" />
            <span>{settings?.aiMode === "custom" ? "自带聊天已开启" : "爪爪在线"}</span>
            <button title="收起" onClick={() => setTalkOpen(false)}>
              <X size={15} />
            </button>
          </div>
          <div className={`talk-output ${activeTask?.status === "error" ? "is-error" : ""}`}>
            <div className="talk-output-header">
              <strong>{activeTask ? activeTask.title : "爪爪"}</strong>
              <span>{activeTask ? statusLabel(activeTask.status) : "随时可以开始"}</span>
              <button title="复制回复" onClick={() => void navigator.clipboard.writeText(outputText)}>
                <Copy size={14} />
              </button>
            </div>
            <p>{outputText}</p>
            {activeTask ? (
              <div className="talk-output-meta">
                <span>{activeTask.timeline.at(-1)?.label}</span>
                {activeTask.outputs?.length ? <span>已生成 {activeTask.outputs.length} 个文件</span> : null}
              </div>
            ) : null}
          </div>
          <div className="quick-intents">
            <button onClick={() => inputRef.current?.focus()}>
              <Sparkles size={15} /> 问爪爪
            </button>
            <button onClick={() => void selectFiles()}>
              <FilePlus2 size={15} /> 总结文件
            </button>
            <button onClick={() => fillPrompt("帮我生成一份 Word 报告，主题是：")}>
              <FileText size={15} /> Word
            </button>
            <button onClick={() => fillPrompt("帮我做一份 PPT，主题是：")}>
              <Presentation size={15} /> PPT
            </button>
            <button onClick={() => fillPrompt("帮我生成一个 Excel 表格，内容是：")}>
              <Table2 size={15} /> Excel
            </button>
            <button onClick={() => fillPrompt("请联网搜索并整理资料，主题是：")}>
              <Search size={15} /> 找资料
            </button>
            <button onClick={() => fillPrompt("提醒我：")}>
              <Bell size={15} /> 任务提醒
            </button>
            <button onClick={openSettings}>
              <Settings size={15} /> 设置
            </button>
          </div>
          {renderBlockingPrompt()}
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
              placeholder="直接问爪爪，例如：帮我整理今天的任务"
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
    </>
  );
}

function statusLabel(status: string): string {
  return {
    queued: "准备中",
    running: "进行中",
    waiting_confirmation: "等你确认",
    success: "已完成",
    error: "没完成",
    stopped: "已停止"
  }[status] ?? status;
}
