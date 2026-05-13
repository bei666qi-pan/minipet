import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
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

  it("creates DOCX output for Word tasks", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zhaozhao-word-"));
    const manager = new OutputManager();
    const output = await manager.createDocx({
      title: "项目复盘报告",
      body: "## 背景\n本周完成桌宠办公能力补全。\n## 结论\n可以生成 Word 文档。",
      outputDirectory: dir
    });
    await expect(fs.stat(output.filePath)).resolves.toBeTruthy();
    expect(output.kind).toBe("docx");
    expect(output.filePath.endsWith(".docx")).toBe(true);
  });

  it("creates XLSX output from markdown tables", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zhaozhao-excel-"));
    const manager = new OutputManager();
    const output = await manager.createXlsx({
      title: "任务清单",
      body: "| 任务 | 状态 |\n| --- | --- |\n| Word | 完成 |\n| Excel | 进行中 |",
      outputDirectory: dir
    });
    await expect(fs.stat(output.filePath)).resolves.toBeTruthy();
    expect(output.kind).toBe("xlsx");
    expect(output.filePath.endsWith(".xlsx")).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(output.filePath);
    const sheet = workbook.getWorksheet("整理结果");
    expect(sheet?.getCell("A1").value).toBe("任务");
    expect(sheet?.getCell("B3").value).toBe("进行中");
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

  it("creates research DOCX and Markdown outputs with source warning", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zhaozhao-research-"));
    const manager = new OutputManager();
    const outputs = await manager.createResearchBrief({
      title: "AI 教育资料",
      body: "关键结论：需要保留来源。\n来源：https://example.com",
      outputDirectory: dir
    });
    expect(outputs.map((item) => item.kind).sort()).toEqual(["docx", "markdown"]);
    const markdown = outputs.find((item) => item.kind === "markdown")!;
    const text = await fs.readFile(markdown.filePath, "utf8");
    expect(text).toContain("https://example.com");
  });
});
