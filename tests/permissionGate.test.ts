import { describe, expect, it } from "vitest";
import { PermissionGate } from "../src/main/permissions/PermissionGate";

describe("PermissionGate", () => {
  const gate = new PermissionGate();

  it("blocks high risk browser submit in safe mode", () => {
    const decision = gate.evaluate({
      mode: "safe",
      actionType: "browser_submit",
      prompt: "提交表单"
    });
    expect(decision.allowed).toBe(false);
  });

  it("allows low risk chat in demo mode", () => {
    const decision = gate.evaluate({
      mode: "demo",
      actionType: "chat",
      prompt: "你好"
    });
    expect(decision.allowed).toBe(true);
    expect(decision.requireConfirmation).toBe(false);
  });

  it("requires confirmation for assisted file write", () => {
    const decision = gate.evaluate({
      mode: "assisted",
      actionType: "file_write",
      prompt: "保存 PPT 到用户选择目录"
    });
    expect(decision.allowed).toBe(true);
    expect(decision.requireConfirmation).toBe(true);
  });

  it("only allows skill install with full access admin advanced", () => {
    const blocked = gate.evaluate({
      mode: "full",
      actionType: "skill_install",
      method: "skill.install",
      adminAdvanced: false
    });
    expect(blocked.allowed).toBe(false);

    const allowed = gate.evaluate({
      mode: "full",
      actionType: "skill_install",
      method: "skill.install",
      adminAdvanced: true
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.requireConfirmation).toBe(true);
    expect(allowed.scopes).toContain("operator.admin");
  });

  it("requests authorization instead of hard rejecting requestable safe actions", () => {
    const decision = gate.evaluate({
      mode: "safe",
      actionType: "open_url",
      method: "shell.openExternal",
      urls: ["https://www.baidu.com/"],
      prompt: "打开百度"
    });
    expect(decision.allowed).toBe(false);
    expect(decision.requireConfirmation).toBe(true);
    expect(decision.requestable).toBe(true);
    expect(decision.authorizationChoices).toContain("turn");
    expect(decision.authorizationChoices).toContain("switch_assisted");
  });

  it("still hard rejects unsafe urls and critical actions", () => {
    const unsafeUrl = gate.evaluate({
      mode: "safe",
      actionType: "open_url",
      urls: ["javascript:alert(1)"]
    });
    expect(unsafeUrl.allowed).toBe(false);
    expect(unsafeUrl.requireConfirmation).toBe(false);
    expect(unsafeUrl.requestable).toBeFalsy();

    const shell = gate.evaluate({
      mode: "safe",
      actionType: "shell",
      method: "system.run"
    });
    expect(shell.allowed).toBe(false);
    expect(shell.requireConfirmation).toBe(false);
  });
});
