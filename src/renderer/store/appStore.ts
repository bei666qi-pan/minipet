import { create } from "zustand";
import type { PetState } from "./settingsStore";

export interface TalkTurn {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

interface AppState {
  petState: PetState;
  bubbleText: string;
  talkOpen: boolean;
  talkLastInteractionAt: number;
  commandOpen: boolean;
  settingsOpen: boolean;
  quickOpen: boolean;
  selectedFiles: string[];
  recentTalks: TalkTurn[];
  setPetState: (state: PetState) => void;
  say: (text: string, state?: PetState) => void;
  setTalkOpen: (open: boolean) => void;
  touchTalkPanel: () => void;
  rememberTalk: (turn: Omit<TalkTurn, "createdAt">) => void;
  setCommandOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setQuickOpen: (open: boolean) => void;
  addSelectedFiles: (files: string[]) => void;
  clearSelectedFiles: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  petState: "idle_welcome",
  bubbleText:
    "你好，我是 MiniPet，你的桌面学习/办公搭子。你可以直接问我问题，也可以让我帮你总结资料、提醒任务。默认安全模式下，我不会自动删除文件或执行高危操作。",
  talkOpen: false,
  talkLastInteractionAt: Date.now(),
  commandOpen: false,
  settingsOpen: false,
  quickOpen: false,
  selectedFiles: [],
  recentTalks: [],
  setPetState: (petState) => set({ petState }),
  say: (bubbleText, petState) =>
    set((state) => ({
      bubbleText,
      petState: petState ?? state.petState,
      recentTalks: [...state.recentTalks, { role: "assistant" as const, text: bubbleText, createdAt: new Date().toISOString() }].slice(-8)
    })),
  setTalkOpen: (talkOpen) => set({ talkOpen, talkLastInteractionAt: Date.now() }),
  touchTalkPanel: () => set({ talkLastInteractionAt: Date.now() }),
  rememberTalk: (turn) =>
    set((state) => ({
      recentTalks: [...state.recentTalks, { ...turn, createdAt: new Date().toISOString() }].slice(-8)
    })),
  setCommandOpen: (commandOpen) =>
    set(commandOpen ? { commandOpen, talkOpen: true, talkLastInteractionAt: Date.now() } : { commandOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setQuickOpen: (quickOpen) => set({ quickOpen }),
  addSelectedFiles: (files) =>
    set((state) => ({
      selectedFiles: Array.from(new Set([...state.selectedFiles, ...files])).slice(0, 12),
      talkLastInteractionAt: Date.now()
    })),
  clearSelectedFiles: () => set({ selectedFiles: [], talkLastInteractionAt: Date.now() })
}));
