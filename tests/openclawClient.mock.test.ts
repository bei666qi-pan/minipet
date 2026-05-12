import { describe, expect, it } from "vitest";
import { OpenClawMock } from "../src/main/openclaw/OpenClawMock";

describe("OpenClawMock", () => {
  it("returns demo status and chat response", async () => {
    const mock = new OpenClawMock();
    expect(mock.status().demoMode).toBe(true);
    const result = await mock.chat({
      content: "你好",
      sessionKey: "main",
      localRequestId: "local_test"
    });
    expect(result.text).toContain("我已收到");
    expect(mock.historyList()).toHaveLength(2);
  });
});
