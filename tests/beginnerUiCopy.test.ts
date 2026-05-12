import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ORDINARY_UI_FILES = [
  "src/renderer/App.tsx",
  "src/renderer/components/CommandPalette.tsx",
  "src/renderer/components/CoreInstallModal.tsx",
  "src/renderer/components/DesktopPet.tsx",
  "src/renderer/components/OneSentenceBar.tsx",
  "src/renderer/components/OnboardingWizard.tsx",
  "src/renderer/components/QuickActions.tsx",
  "src/renderer/components/SettingsPanel.tsx",
  "src/renderer/components/SpeechBubble.tsx",
  "src/renderer/components/TaskTimeline.tsx"
];

describe("beginner UI copy", () => {
  it("does not expose technical English in ordinary screens", () => {
    const combined = ORDINARY_UI_FILES.map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");
    expect(combined).not.toMatch(/Gateway|Token|API Key|Base URL|Skill|Full Access/);
  });
});
