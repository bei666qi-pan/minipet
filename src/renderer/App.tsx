import { useEffect, useMemo, useRef, useState } from "react";
import { DesktopPet } from "./components/DesktopPet";
import { FloatingBall } from "./components/FloatingBall";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PetTalkPanel } from "./components/PetTalkPanel";
import { ProactiveSpeech } from "./components/ProactiveSpeech";
import { SettingsPanel } from "./components/SettingsPanel";
import { useAppStore } from "./store/appStore";
import { useSettingsStore } from "./store/settingsStore";
import { useTaskStore } from "./store/taskStore";
import { isInteractiveHitTarget } from "./windowHitTest";

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  const { load, settings, cloudStatus } = useSettingsStore();
  const setCoreStatus = useSettingsStore((state) => state.setCoreStatus);
  const handleOpenClawEvent = useTaskStore((state) => state.handleOpenClawEvent);
  const { addSelectedFiles, say, setTalkOpen, talkOpen } = useAppStore();
  const passThroughRef = useRef<boolean | undefined>(undefined);
  const isSettingsWindow = useMemo(() => hash.startsWith("#/settings"), [hash]);
  const isFloatingBallWindow = useMemo(() => hash.startsWith("#/floating-ball"), [hash]);

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
    const offCloud = window.minipet.on("cloud:status", (payload) => {
      const status = payload as { online?: boolean; message?: string };
      if (status.online === false && status.message) say(status.message, "surprised_alert");
    });
    return () => {
      offEvent();
      offStatus();
      offCore();
      offCloud();
    };
  }, [handleOpenClawEvent, load, say, setCoreStatus]);

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

  useEffect(() => {
    if (cloudStatus?.online === false && cloudStatus.message) say(cloudStatus.message, "surprised_alert");
  }, [cloudStatus?.message, cloudStatus?.online, say]);

  useEffect(() => {
    if (isSettingsWindow || isFloatingBallWindow) return;
    return () => {
      passThroughRef.current = undefined;
      void window.minipet.invoke("window:set-pass-through", { enabled: false });
    };
  }, [isFloatingBallWindow, isSettingsWindow]);

  function updatePassThrough(target: EventTarget | null) {
    const shouldPassThrough = !isInteractiveHitTarget(target);
    if (passThroughRef.current === shouldPassThrough) return;
    passThroughRef.current = shouldPassThrough;
    void window.minipet.invoke("window:set-pass-through", { enabled: shouldPassThrough });
  }

  if (isSettingsWindow) {
    return (
      <div className={`settings-window-root theme-${settings?.theme ?? "light"}`}>
        <SettingsPanel standalone />
      </div>
    );
  }

  if (isFloatingBallWindow) {
    return <FloatingBall />;
  }

  return (
    <div
      className={`app-root theme-${settings?.theme ?? "light"} ${talkOpen ? "is-talk-open" : ""}`}
      onMouseMove={(event) => updatePassThrough(event.target)}
      onMouseDown={(event) => updatePassThrough(event.target)}
      onMouseLeave={() => updatePassThrough(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const files = Array.from(event.dataTransfer.files)
          .map((file) => (file as File & { path?: string }).path)
          .filter(Boolean) as string[];
        if (files.length) {
          addSelectedFiles(files);
          setTalkOpen(true);
          say(`我看到了 ${files.length} 个文件。你可以直接告诉爪爪想怎么处理。`, "listening");
        }
      }}
    >
      <DesktopPet />
      <PetTalkPanel />
      <ProactiveSpeech />
      <OnboardingWizard />
    </div>
  );
}
