import { useEffect } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { DesktopPet } from "./components/DesktopPet";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { QuickActions } from "./components/QuickActions";
import { OneSentenceBar } from "./components/OneSentenceBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { SpeechBubble } from "./components/SpeechBubble";
import { TaskTimeline } from "./components/TaskTimeline";
import { useAppStore } from "./store/appStore";
import { useSettingsStore } from "./store/settingsStore";
import { useTaskStore } from "./store/taskStore";

export default function App() {
  const { load, settings } = useSettingsStore();
  const setCoreStatus = useSettingsStore((state) => state.setCoreStatus);
  const handleOpenClawEvent = useTaskStore((state) => state.handleOpenClawEvent);
  const { setCommandOpen, commandOpen, addSelectedFiles, say } = useAppStore();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const offEvent = window.minipet.on("openclaw:event", (payload) => handleOpenClawEvent(payload as Record<string, unknown>));
    const offStatus = window.minipet.on("openclaw:status", () => void load());
    const offCore = window.minipet.on("core:progress", (payload) => setCoreStatus(payload as never));
    return () => {
      offEvent();
      offStatus();
      offCore();
    };
  }, [handleOpenClawEvent, load, setCoreStatus]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [commandOpen, setCommandOpen]);

  return (
    <div
      className={`app-root theme-${settings?.theme ?? "light"}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const files = Array.from(event.dataTransfer.files)
          .map((file) => (file as File & { path?: string }).path)
          .filter(Boolean) as string[];
        if (files.length) {
          addSelectedFiles(files);
          say(`我看到了 ${files.length} 个文件。你可以说“帮我整理这些文件”。`, "listening");
        }
      }}
    >
      <SpeechBubble />
      <DesktopPet />
      <OneSentenceBar />
      <QuickActions />
      <CommandPalette />
      <SettingsPanel />
      <div className="timeline-dock no-drag">
        <TaskTimeline />
      </div>
      <OnboardingWizard />
    </div>
  );
}
