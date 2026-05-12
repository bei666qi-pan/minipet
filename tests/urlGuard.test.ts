import { describe, expect, it } from "vitest";
import { validateExternalUrl, withV1BaseUrl } from "../src/main/security/urlGuard";

describe("urlGuard", () => {
  it("allows normal https URLs", () => {
    expect(validateExternalUrl("https://example.com/a").ok).toBe(true);
  });

  it("blocks javascript and file URLs", () => {
    expect(validateExternalUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateExternalUrl("file:///C:/Users/test.txt").ok).toBe(false);
  });

  it("normalizes OpenAI-compatible base URL to v1", () => {
    expect(withV1BaseUrl("https://newkey.versecraft.cn/")).toBe("https://newkey.versecraft.cn/v1/");
  });
});
