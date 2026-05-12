import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MAIN_UI_FILES = [
  "src/renderer/App.tsx",
  "src/renderer/components/DesktopPet.tsx",
  "src/renderer/components/PetTalkPanel.tsx",
  "src/renderer/components/SpeechBubble.tsx",
  "src/renderer/components/OnboardingWizard.tsx"
];

describe("beginner UI copy", () => {
  it("keeps the main surface focused on one conversational entry", () => {
    const combined = MAIN_UI_FILES.map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");
    expect(combined).toMatch(/问我一下/);
    expect(combined).toMatch(/总结文件/);
    expect(combined).toMatch(/任务提醒/);
    expect(combined).not.toMatch(/Gateway|Token|API Key|Base URL|NewAPI|模型供应商|Full Access/);
    expect(fs.existsSync(path.join(process.cwd(), "src/renderer/components/QuickActions.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "src/renderer/components/CommandPalette.tsx"))).toBe(false);
  });
});
