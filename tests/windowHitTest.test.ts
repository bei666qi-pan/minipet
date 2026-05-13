import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("Element", class {});

describe("window hit test", () => {
  it("captures interactive companion elements and passes blank space through", async () => {
    const { isInteractiveHitTarget } = await import("../src/renderer/windowHitTest");
    const interactive = Object.assign(new Element(), {
      closest: (selector: string) => (selector.includes(".pet-shell") ? {} : null)
    });
    const blank = Object.assign(new Element(), {
      closest: () => null
    });
    expect(isInteractiveHitTarget(interactive)).toBe(true);
    expect(isInteractiveHitTarget(blank)).toBe(false);
    expect(isInteractiveHitTarget(null)).toBe(false);
  });
});
