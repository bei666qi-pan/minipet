import { describe, expect, it } from "vitest";
import { isSupportedNodeVersion, isWhitelistedDownloadUrl, parseNodeVersion } from "../src/main/core/RuntimeInstaller";

describe("RuntimeInstaller helpers", () => {
  it("accepts supported Node versions", () => {
    expect(isSupportedNodeVersion("v22.14.0")).toBe(true);
    expect(isSupportedNodeVersion("v24.11.1")).toBe(true);
    expect(isSupportedNodeVersion("v20.11.1")).toBe(false);
  });

  it("parses node version", () => {
    expect(parseNodeVersion("v24.11.1")).toEqual({ major: 24, minor: 11, patch: 1 });
  });

  it("only allows official Node downloads", () => {
    expect(isWhitelistedDownloadUrl("https://nodejs.org/dist/v24.11.1/node-v24.11.1-win-x64.zip")).toBe(true);
    expect(isWhitelistedDownloadUrl("https://example.com/node.zip")).toBe(false);
    expect(isWhitelistedDownloadUrl("http://nodejs.org/dist/node.zip")).toBe(false);
  });
});
