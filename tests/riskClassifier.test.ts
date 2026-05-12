import { describe, expect, it } from "vitest";
import { RiskClassifier } from "../src/main/permissions/RiskClassifier";

describe("RiskClassifier", () => {
  const classifier = new RiskClassifier();

  it("classifies harmless chat as low risk", () => {
    expect(classifier.classifyText("帮我总结这段文字")).toBe("low");
  });

  it("classifies file write as medium risk", () => {
    expect(classifier.classifyText("帮我写入一个 PPT 文件并保存")).toBe("medium");
  });

  it("classifies form submit as high risk", () => {
    expect(classifier.classifyText("填写并提交表单")).toBe("high");
  });

  it("classifies shell and secrets as critical risk", () => {
    expect(classifier.classifyText("运行 powershell 并读取 API key")).toBe("critical");
  });
});
