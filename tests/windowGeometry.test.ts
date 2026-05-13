import { describe, expect, it } from "vitest";
import { clampFloatingBallPosition, defaultFloatingBallPosition, isWindowPoint } from "../src/main/windowGeometry";

describe("floating ball geometry", () => {
  const workArea = { x: 0, y: 0, width: 320, height: 240 };

  it("places the floating ball near the bottom right by default", () => {
    expect(defaultFloatingBallPosition(workArea, 76, 28)).toEqual({ x: 216, y: 136 });
  });

  it("clamps persisted positions into the current work area", () => {
    expect(clampFloatingBallPosition({ x: -100, y: 999 }, workArea, 76, 12)).toEqual({ x: 12, y: 152 });
  });

  it("rejects malformed persisted positions", () => {
    expect(isWindowPoint({ x: 1, y: 2 })).toBe(true);
    expect(isWindowPoint({ x: "1", y: 2 })).toBe(false);
  });
});
