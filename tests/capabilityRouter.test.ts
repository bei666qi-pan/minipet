import { describe, expect, it } from "vitest";
import { CapabilityRouter } from "../src/main/capabilities/CapabilityRouter";

describe("CapabilityRouter", () => {
  const router = new CapabilityRouter();

  it("routes PPT requests", () => {
    const task = router.route("帮我做一个 8 页的产品介绍 PPT");
    expect(task.type).toBe("ppt_task");
    expect(task.output).toBe("pptx");
    expect(task.actionType).toBe("office_generate");
    expect(task.needsCore).toBe(false);
  });

  it("routes Word document requests to local office generation", () => {
    const task = router.route("帮我生成一份项目复盘 Word 报告");
    expect(task.type).toBe("word_task");
    expect(task.output).toBe("docx");
    expect(task.actionType).toBe("office_generate");
    expect(task.needsCore).toBe(false);
  });

  it("routes Excel requests to XLSX output", () => {
    const task = router.route("帮我生成一个本周任务清单 Excel 表格");
    expect(task.type).toBe("excel_task");
    expect(task.output).toBe("xlsx");
    expect(task.actionType).toBe("office_generate");
    expect(task.needsCore).toBe(false);
  });

  it("routes research requests through OpenClaw search and saves a brief", () => {
    const task = router.route("请联网搜索并整理最新 AI 教育资料");
    expect(task.type).toBe("research_task");
    expect(task.output).toBe("research");
    expect(task.actionType).toBe("search");
    expect(task.needsCore).toBe(true);
  });

  it("uses OpenClaw search only when an Office task asks for web research", () => {
    const task = router.route("请联网搜索资料并生成一个 AI 教育 PPT");
    expect(task.type).toBe("ppt_task");
    expect(task.output).toBe("pptx");
    expect(task.actionType).toBe("search");
    expect(task.needsCore).toBe(true);
  });

  it("routes paper requests", () => {
    const task = router.route("帮我写一篇关于人工智能教育应用的论文大纲和初稿");
    expect(task.type).toBe("paper_task");
    expect(task.output).toBe("paper");
  });

  it("routes selected files to file task", () => {
    const task = router.route("帮我总结", ["D:/tmp/a.pdf"]);
    expect(task.type).toBe("file_task");
    expect(task.prompt).toContain("不要扫描全盘");
  });

  it("asks one beginner-friendly question when PPT topic is missing", () => {
    const task = router.route("帮我做一个 PPT");
    expect(task.missingQuestion).toBe("演示的主题是什么？");
  });

  it("routes opening Baidu to an open_url task", () => {
    const task = router.route("打开百度");
    expect(task.type).toBe("open_url_task");
    expect(task.actionType).toBe("open_url");
    expect(task.needsCore).toBe(false);
    expect(task.urls).toEqual(["https://www.baidu.com/"]);
  });
});
