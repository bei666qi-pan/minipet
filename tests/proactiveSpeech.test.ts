import { describe, expect, it } from "vitest";
import { buildProactiveSpeechMessages, canUseSelectedFiles, isInQuietHours, shouldSpeak } from "../src/renderer/proactiveSpeech";

describe("proactive speech policy", () => {
  it("respects quiet hours and cooldown for normal speech", () => {
    const now = new Date("2026-05-12T23:30:00+08:00");
    expect(isInQuietHours(now, "23:00", "08:00")).toBe(true);
    expect(
      shouldSpeak({
        enabled: true,
        now,
        lastSpokenAt: now.getTime() - 60_000,
        quietHoursEnabled: true,
        quietHoursStart: "23:00",
        quietHoursEnd: "08:00",
        priority: "normal"
      })
    ).toBe(false);
  });

  it("allows selected-file context only after stronger authorization", () => {
    expect(canUseSelectedFiles("safe")).toBe(false);
    expect(canUseSelectedFiles("assisted")).toBe(true);
    const safeMessages = buildProactiveSpeechMessages({
      event: "idle",
      permissionMode: "safe",
      recentTalks: [],
      selectedFiles: ["D:/secret/report.docx"],
      now: new Date("2026-05-12T10:00:00+08:00")
    });
    expect(safeMessages.map((item) => item.content).join("\n")).not.toContain("report.docx");
  });
});
