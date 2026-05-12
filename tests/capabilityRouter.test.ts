import { describe, expect, it } from "vitest";
import { CapabilityRouter } from "../src/main/capabilities/CapabilityRouter";

describe("CapabilityRouter", () => {
  const router = new CapabilityRouter();

  it("routes PPT requests", () => {
    const task = router.route("帮我做一个 8 页的产品介绍 PPT");
    expect(task.type).toBe("ppt_task");
    expect(task.output).toBe("pptx");
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
});
