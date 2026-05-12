import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OutputManager } from "../src/main/output/OutputManager";

describe("OutputManager", () => {
  it("creates PPTX output", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zhaozhao-ppt-"));
    const manager = new OutputManager();
    const output = await manager.createPptx({
      title: "产品介绍",
      body: "第一页：产品定位\n- 面向新手\n- 一句话完成任务\n第二页：核心能力\n- 做演示\n- 写论文",
      outputDirectory: dir
    });
    await expect(fs.stat(output.filePath)).resolves.toBeTruthy();
    expect(output.filePath.endsWith(".pptx")).toBe(true);
  });

  it("creates DOCX and Markdown paper outputs with uncertainty note", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zhaozhao-paper-"));
    const manager = new OutputManager();
    const outputs = await manager.createPaper({ title: "人工智能教育应用", body: "", outputDirectory: dir });
    expect(outputs.map((item) => item.kind).sort()).toEqual(["docx", "markdown"]);
    const markdown = outputs.find((item) => item.kind === "markdown")!;
    const text = await fs.readFile(markdown.filePath, "utf8");
    expect(text).toContain("不确定");
  });
});
