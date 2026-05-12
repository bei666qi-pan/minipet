import { create } from "zustand";
import type { PetState } from "./settingsStore";

interface AppState {
  petState: PetState;
  bubbleText: string;
  commandOpen: boolean;
  settingsOpen: boolean;
  quickOpen: boolean;
  selectedFiles: string[];
  setPetState: (state: PetState) => void;
  say: (text: string, state?: PetState) => void;
  setCommandOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setQuickOpen: (open: boolean) => void;
  addSelectedFiles: (files: string[]) => void;
  clearSelectedFiles: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  petState: "idle",
  bubbleText: "你好，我是爪爪。你可以直接说：帮我做演示、写论文、找资料或整理文件。",
  commandOpen: false,
  settingsOpen: false,
  quickOpen: false,
  selectedFiles: [],
  setPetState: (petState) => set({ petState }),
  say: (bubbleText, petState) => set((state) => ({ bubbleText, petState: petState ?? state.petState })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setQuickOpen: (quickOpen) => set({ quickOpen }),
  addSelectedFiles: (files) =>
    set((state) => ({
      selectedFiles: Array.from(new Set([...state.selectedFiles, ...files])).slice(0, 12)
    })),
  clearSelectedFiles: () => set({ selectedFiles: [] })
}));
