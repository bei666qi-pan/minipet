import { useEffect, useRef } from "react";
import {
  buildProactiveSpeechMessages,
  fallbackProactiveLine,
  shouldSpeak,
  type ProactiveSpeechEvent
} from "../proactiveSpeech";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { useTaskStore } from "../store/taskStore";
import type { PetState } from "../store/settingsStore";

const IDLE_TRIGGER_MS = 10 * 60 * 1000;

export function ProactiveSpeech() {
  const { settings, secrets } = useSettingsStore();
  const { recentTalks, selectedFiles, say, talkLastInteractionAt } = useAppStore();
  const activeTaskId = useTaskStore((state) => state.activeTaskId);
  const activeTask = useTaskStore((state) => state.tasks.find((task) => task.localRequestId === activeTaskId));
  const lastSpokenAt = useRef<number | undefined>(undefined);
  const welcomed = useRef(false);
  const speaking = useRef(false);

  useEffect(() => {
    if (!settings?.onboarded || !settings.proactiveSpeechEnabled || welcomed.current) return;
    if (window.sessionStorage.getItem("minipet-proactive-welcome") === "1") return;
    welcomed.current = true;
    window.sessionStorage.setItem("minipet-proactive-welcome", "1");
    void speak("welcome", "high");
  }, [settings?.onboarded, settings?.proactiveSpeechEnabled]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!settings?.proactiveSpeechEnabled) return;
      if (Date.now() - talkLastInteractionAt < IDLE_TRIGGER_MS) return;
      void speak("idle", "normal");
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [settings?.proactiveSpeechEnabled, talkLastInteractionAt]);

  async function speak(event: ProactiveSpeechEvent, priority: "normal" | "high") {
    if (!settings || speaking.current) return;
    const now = new Date();
    if (
      !shouldSpeak({
        enabled: settings.proactiveSpeechEnabled,
        now,
        lastSpokenAt: lastSpokenAt.current,
        quietHoursEnabled: settings.quietHoursEnabled,
        quietHoursStart: settings.quietHoursStart,
        quietHoursEnd: settings.quietHoursEnd,
        priority
      })
    ) {
      return;
    }

    speaking.current = true;
    lastSpokenAt.current = now.getTime();
    try {
      let text = fallbackProactiveLine(event);
      if (secrets?.openaiApiKey) {
        const result = await window.minipet.invoke<{ result?: { text?: string }; text?: string }>("llm:chat", {
          messages: buildProactiveSpeechMessages({
            event,
            permissionMode: settings.permissionMode,
            recentTalks,
            selectedFiles,
            activeTaskTitle: activeTask?.title,
            now
          })
        });
        text = sanitizeLine(result.result?.text ?? result.text ?? text) || text;
      }
      say(text, stateForEvent(event));
    } catch {
      say(fallbackProactiveLine(event), stateForEvent(event));
    } finally {
      speaking.current = false;
    }
  }

  return null;
}

function sanitizeLine(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 90);
}

function stateForEvent(event: ProactiveSpeechEvent): PetState {
  const states: Record<ProactiveSpeechEvent, PetState> = {
    welcome: "idle_welcome",
    idle: "idle_calm",
    night: "sleepy_rest",
    task_success: "success_cheer",
    task_error: "apology_sad",
    permission: "reminder_warning"
  };
  return states[event];
}
