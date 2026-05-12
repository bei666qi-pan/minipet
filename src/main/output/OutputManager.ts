import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import pptxgen from "pptxgenjs";

export interface GeneratedOutput {
  kind: "pptx" | "docx" | "markdown";
  filePath: string;
  label: string;
}

export function defaultOutputDirectory(): string {
  return path.join(os.homedir(), "Documents", "爪爪伙伴输出");
}

export class OutputManager {
  async ensureOutputDirectory(directory = defaultOutputDirectory()): Promise<string> {
    await fs.mkdir(directory, { recursive: true });
    return directory;
  }

  async createPptx(input: { title: string; body: string; outputDirectory?: string }): Promise<GeneratedOutput> {
    const outputDir = await this.ensureOutputDirectory(input.outputDirectory);
    const safeTitle = safeFileName(input.title || "演示文稿");
    const filePath = path.join(outputDir, `${safeTitle}-${timestamp()}.pptx`);
    const pptx = new pptxgen();
    pptx.author = "爪爪伙伴";
    pptx.subject = input.title;
    pptx.title = input.title;
    pptx.company = "爪爪伙伴";
    pptx.layout = "LAYOUT_WIDE";
    pptx.theme = {
      headFontFace: "Microsoft YaHei",
      bodyFontFace: "Microsoft YaHei"
    };

    const slides = buildSlides(input.title, input.body);
    for (const [index, slideData] of slides.entries()) {
      const slide = pptx.addSlide();
      slide.background = { color: index === 0 ? "FFF6FA" : "FFFFFF" };
      slide.addText(slideData.title, {
        x: 0.65,
        y: 0.55,
        w: 11,
        h: 0.6,
        fontFace: "Microsoft YaHei",
        fontSize: index === 0 ? 34 : 24,
        bold: true,
        color: "47364E"
      });
      slide.addText(slideData.points.map((point) => `• ${point}`).join("\n"), {
        x: 0.78,
        y: 1.48,
        w: 10.7,
        h: 4.8,
        fontFace: "Microsoft YaHei",
        fontSize: 16,
        breakLine: false,
        fit: "shrink",
        color: "51485A",
        valign: "top"
      });
      slide.addShape(pptx.ShapeType.arc, { x: 10.5, y: 5.75, w: 1.4, h: 0.32, line: { color: "E86F9D", transparency: 30 } });
    }
    await pptx.writeFile({ fileName: filePath });
    return { kind: "pptx", filePath, label: "演示文件" };
  }

  async createPaper(input: { title: string; body: string; outputDirectory?: string }): Promise<GeneratedOutput[]> {
    const outputDir = await this.ensureOutputDirectory(input.outputDirectory);
    const safeTitle = safeFileName(input.title || "论文草稿");
    const base = `${safeTitle}-${timestamp()}`;
    const markdownPath = path.join(outputDir, `${base}.md`);
    const docxPath = path.join(outputDir, `${base}.docx`);
    const body = normalizePaperText(input.title, input.body);

    await fs.writeFile(markdownPath, body, "utf8");

    const doc = new Document({
      sections: [
        {
          children: body.split(/\r?\n/).map((line, index) => {
            if (index === 0 || line.startsWith("# ")) {
              return new Paragraph({ text: line.replace(/^#\s*/, ""), heading: HeadingLevel.TITLE });
            }
            if (line.startsWith("## ")) {
              return new Paragraph({ text: line.replace(/^##\s*/, ""), heading: HeadingLevel.HEADING_1 });
            }
            return new Paragraph({
              children: [new TextRun(line || " ")],
              spacing: { after: 140 }
            });
          })
        }
      ]
    });
    await fs.writeFile(docxPath, await Packer.toBuffer(doc));
    return [
      { kind: "docx", filePath: docxPath, label: "论文文档" },
      { kind: "markdown", filePath: markdownPath, label: "可编辑草稿" }
    ];
  }
}

function buildSlides(title: string, body: string): Array<{ title: string; points: string[] }> {
  const clean = body.replace(/\r/g, "").trim();
  const sections = clean
    .split(/\n(?=#+\s|\d+[.、]\s|第.{1,4}页|幻灯片)/)
    .map((section) => section.trim())
    .filter(Boolean);
  if (!sections.length) {
    return [
      { title, points: ["任务已完成。", "可继续让爪爪帮你补充资料、改风格或压缩页数。"] }
    ];
  }
  const slides = sections.slice(0, 12).map((section, index) => {
    const lines = section
      .split(/\n+/)
      .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
    return {
      title: index === 0 ? title : lines[0]?.slice(0, 28) || `${title} ${index + 1}`,
      points: (index === 0 ? lines : lines.slice(1)).slice(0, 6).map((line) => line.slice(0, 90))
    };
  });
  return slides.map((slide) => ({
    ...slide,
    points: slide.points.length ? slide.points : ["这一页可以继续补充要点。"]
  }));
}

function normalizePaperText(title: string, body: string): string {
  const text = body.trim();
  if (!text) return `# ${title}\n\n## 提纲\n\n不确定。\n\n## 正文草稿\n\n不确定。\n\n## 参考来源\n\n暂无可靠来源。`;
  if (/^#\s/m.test(text)) return text;
  return `# ${title}\n\n${text}\n\n## 参考来源\n\n如上文没有列出可靠来源，请视为不确定，不要当作正式引用。`;
}

function safeFileName(input: string): string {
  return input.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "").slice(0, 32) || "爪爪伙伴";
}

function timestamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
