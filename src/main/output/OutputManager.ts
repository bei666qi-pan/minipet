import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import pptxgen from "pptxgenjs";

export interface GeneratedOutput {
  kind: "pptx" | "docx" | "xlsx" | "markdown";
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

  async createDocx(input: { title: string; body: string; outputDirectory?: string; label?: string }): Promise<GeneratedOutput> {
    const outputDir = await this.ensureOutputDirectory(input.outputDirectory);
    const safeTitle = safeFileName(input.title || "文档");
    const filePath = path.join(outputDir, `${safeTitle}-${timestamp()}.docx`);
    await fs.writeFile(filePath, await Packer.toBuffer(createDocxDocument(input.title, normalizeDocumentText(input.title, input.body))));
    return { kind: "docx", filePath, label: input.label || "Word 文档" };
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

  async createXlsx(input: { title: string; body: string; outputDirectory?: string }): Promise<GeneratedOutput> {
    const outputDir = await this.ensureOutputDirectory(input.outputDirectory);
    const safeTitle = safeFileName(input.title || "表格");
    const filePath = path.join(outputDir, `${safeTitle}-${timestamp()}.xlsx`);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "爪爪伙伴";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = input.title;
    workbook.title = input.title;
    const worksheet = workbook.addWorksheet("整理结果", {
      views: [{ state: "frozen", ySplit: 1 }]
    });
    const rows = buildWorksheetRows(input.body);
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF7C6AA0" }
    };
    worksheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE8E1EC" } },
          left: { style: "thin", color: { argb: "FFE8E1EC" } },
          bottom: { style: "thin", color: { argb: "FFE8E1EC" } },
          right: { style: "thin", color: { argb: "FFE8E1EC" } }
        };
      });
    });
    worksheet.columns.forEach((column) => {
      const maxLength = Math.max(
        10,
        ...((column.values ?? []) as unknown[]).map((value) => String(value ?? "").replace(/\s+/g, " ").slice(0, 40).length)
      );
      column.width = Math.min(42, maxLength + 4);
    });
    await workbook.xlsx.writeFile(filePath);
    return { kind: "xlsx", filePath, label: "Excel 表格" };
  }

  async createPaper(input: { title: string; body: string; outputDirectory?: string }): Promise<GeneratedOutput[]> {
    const outputDir = await this.ensureOutputDirectory(input.outputDirectory);
    const safeTitle = safeFileName(input.title || "论文草稿");
    const base = `${safeTitle}-${timestamp()}`;
    const markdownPath = path.join(outputDir, `${base}.md`);
    const docxPath = path.join(outputDir, `${base}.docx`);
    const body = normalizePaperText(input.title, input.body);

    await fs.writeFile(markdownPath, body, "utf8");
    await fs.writeFile(docxPath, await Packer.toBuffer(createDocxDocument(input.title, body)));
    return [
      { kind: "docx", filePath: docxPath, label: "论文文档" },
      { kind: "markdown", filePath: markdownPath, label: "可编辑草稿" }
    ];
  }

  async createResearchBrief(input: { title: string; body: string; outputDirectory?: string }): Promise<GeneratedOutput[]> {
    const outputDir = await this.ensureOutputDirectory(input.outputDirectory);
    const safeTitle = safeFileName(input.title || "资料整理");
    const base = `${safeTitle}-${timestamp()}`;
    const markdownPath = path.join(outputDir, `${base}.md`);
    const docxPath = path.join(outputDir, `${base}.docx`);
    const body = normalizeResearchText(input.title, input.body);

    await fs.writeFile(markdownPath, body, "utf8");
    await fs.writeFile(docxPath, await Packer.toBuffer(createDocxDocument(input.title, body)));
    return [
      { kind: "docx", filePath: docxPath, label: "资料整理文档" },
      { kind: "markdown", filePath: markdownPath, label: "资料整理草稿" }
    ];
  }
}

function createDocxDocument(title: string, body: string): Document {
  return new Document({
    creator: "爪爪伙伴",
    title,
    sections: [
      {
        children: body.split(/\r?\n/).map((line, index) => {
          if (index === 0 || line.startsWith("# ")) {
            return new Paragraph({ text: line.replace(/^#\s*/, "") || title, heading: HeadingLevel.TITLE });
          }
          if (line.startsWith("## ")) {
            return new Paragraph({ text: line.replace(/^##\s*/, ""), heading: HeadingLevel.HEADING_1 });
          }
          if (line.startsWith("### ")) {
            return new Paragraph({ text: line.replace(/^###\s*/, ""), heading: HeadingLevel.HEADING_2 });
          }
          return new Paragraph({
            children: [new TextRun(line || " ")],
            spacing: { after: 140 }
          });
        })
      }
    ]
  });
}

function buildWorksheetRows(body: string): Array<Array<string | number>> {
  const markdownRows = extractMarkdownTable(body);
  if (markdownRows.length) return markdownRows;

  const lines = body
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*•]\s*/, "").replace(/^\d+[.、]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 80);

  const pairs = lines
    .map((line) => {
      const match = /^([^:：]{1,30})[:：]\s*(.+)$/.exec(line);
      return match ? [match[1].trim(), match[2].trim()] : undefined;
    })
    .filter(Boolean) as string[][];

  if (pairs.length >= 2) return [["项目", "内容"], ...pairs];
  if (!lines.length) return [["序号", "内容"], [1, "暂无可写入表格的内容。"]];
  return [["序号", "内容"], ...lines.map((line, index) => [index + 1, line] as [number, string])];
}

function extractMarkdownTable(body: string): Array<Array<string | number>> {
  const rows = body
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.includes("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length >= 2 && !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));

  if (rows.length < 2) return [];
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => Array.from({ length: width }, (_unused, index) => row[index] ?? ""));
}

function normalizeDocumentText(title: string, body: string): string {
  const text = body.trim();
  if (!text) return `# ${title}\n\n请继续补充内容。`;
  if (/^#\s/m.test(text)) return text;
  return `# ${title}\n\n${text}`;
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

function normalizeResearchText(title: string, body: string): string {
  const text = body.trim();
  if (!text) return `# ${title}\n\n## 关键结论\n\n不确定。\n\n## 来源\n\n暂无可靠来源。`;
  if (/^#\s/m.test(text)) return text;
  return `# ${title}\n\n${text}\n\n## 来源\n\n如上文没有列出可靠来源，请视为不确定，不要当作正式引用。`;
}

function safeFileName(input: string): string {
  return input.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "").slice(0, 32) || "爪爪伙伴";
}

function timestamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
