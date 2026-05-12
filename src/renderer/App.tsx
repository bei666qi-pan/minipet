import { useEffect, useMemo, useState } from "react";
import { DesktopPet } from "./components/DesktopPet";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PetTalkPanel } from "./components/PetTalkPanel";
import { ProactiveSpeech } from "./components/ProactiveSpeech";
import { SettingsPanel } from "./components/SettingsPanel";
import { SpeechBubble } from "./components/SpeechBubble";
import { useAppStore } from "./store/appStore";
import { useSettingsStore } from "./store/settingsStore";
import { useTaskStore } from "./store/taskStore";

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  const { load, settings } = useSettingsStore();
  const setCoreStatus = useSettingsStore((state) => state.setCoreStatus);
  const handleOpenClawEvent = useTaskStore((state) => state.handleOpenClawEvent);
  const { addSelectedFiles, say, setTalkOpen } = useAppStore();
  const isSettingsWindow = useMemo(() => hash.startsWith("#/settings"), [hash]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

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
        setTalkOpen(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [setTalkOpen]);

  if (isSettingsWindow) {
    return (
      <div className={`settings-window-root theme-${settings?.theme ?? "light"}`}>
        <SettingsPanel standalone />
      </div>
    );
  }

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
          setTalkOpen(true);
          say(`我看到了 ${files.length} 个文件。你可以告诉我想怎么处理它们。`, "listening");
        }
      }}
    >
      <SpeechBubble />
      <DesktopPet />
      <PetTalkPanel />
      <ProactiveSpeech />
      <OnboardingWizard />
    </div>
  );
}
