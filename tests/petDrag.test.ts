import { describe, expect, it } from "vitest";
import { hasDraggedBeyondThreshold, PET_DRAG_THRESHOLD_PX } from "../src/renderer/petDrag";

describe("desktop pet dragging", () => {
  it("does not treat ordinary click jitter as dragging", () => {
    expect(PET_DRAG_THRESHOLD_PX).toBe(4);
    expect(hasDraggedBeyondThreshold(0, 0, 2, 2)).toBe(false);
    expect(hasDraggedBeyondThreshold(0, 0, 4, 0)).toBe(true);
  });
});
