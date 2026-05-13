import type { ActionType } from "../permissions/PermissionModes";

export type CompanionTaskType =
  | "chat"
  | "file_task"
  | "word_task"
  | "ppt_task"
  | "excel_task"
  | "paper_task"
  | "research_task"
  | "web_task"
  | "browser_task"
  | "open_url_task"
  | "overlay_assist";

export interface RoutedTask {
  type: CompanionTaskType;
  title: string;
  prompt: string;
  actionType: ActionType;
  needsCore: boolean;
  missingQuestion?: string;
  output: "none" | "pptx" | "docx" | "xlsx" | "paper" | "research";
  statusLabel: string;
  urls?: string[];
}

export class CapabilityRouter {
  route(input: string, files: string[] = []): RoutedTask {
    const text = input.trim();
    const lower = text.toLowerCase();
    const needsResearch = isWebTask(lower);

    if (isPpt(lower)) return this.pptTask(text, needsResearch);
    if (isExcel(lower)) return this.excelTask(text, needsResearch);
    if (isWord(lower)) return this.wordTask(text, needsResearch);
    if (isPaper(lower)) return this.paperTask(text, needsResearch);
    if (files.length > 0) return this.fileTask(text, files);
    if (isOpenUrlTask(lower)) return this.openUrlTask(text);
    if (isBrowserTask(lower)) return this.browserTask(text);
    if (isOverlayTask(lower)) return this.overlayTask(text);
    if (needsResearch) return this.researchTask(text);
    if (isFileTask(lower)) return this.fileTask(text, files);
    return {
      type: "chat",
      title: "问问爪爪",
      prompt: `请用中文直接回答用户的问题，语气简短清楚，适合新手阅读。\n\n用户：${text}`,
      actionType: "chat",
      needsCore: false,
      output: "none",
      statusLabel: "我在思考"
    };
  }

  private wordTask(text: string, needsResearch: boolean): RoutedTask {
    const hasTopic = hasOfficeTopic(text, /帮我|写|生成|制作|整理|一份|一个|word|docx|文档|报告|简历|方案|纪要|说明书|资料|联网|搜索|最新|来源|新闻|查一下|找一下/g);
    if (!hasTopic) {
      return {
        type: "word_task",
        title: "做文档",
        prompt: text,
        actionType: "office_generate",
        needsCore: false,
        missingQuestion: "文档主题是什么？",
        output: "docx",
        statusLabel: "我需要先知道主题"
      };
    }
    return {
      type: "word_task",
      title: "做文档",
      prompt:
        `请完成一个 Word 文档生成任务。\n` +
        `用户需求：${text}\n` +
        `要求：中文内容；结构清楚；标题、小标题和段落层级明确；${needsResearch ? "请先联网检索并保留来源链接；不要编造来源。" : "不需要联网时不要编造来源。"} ` +
        `完成后给出可直接写入 DOCX 的正文。`,
      actionType: needsResearch ? "search" : "office_generate",
      needsCore: needsResearch,
      output: "docx",
      statusLabel: needsResearch ? "我在查资料并写文档" : "我在做文档"
    };
  }

  private pptTask(text: string, needsResearch: boolean): RoutedTask {
    const hasTopic = text.replace(/帮我|做|生成|制作|一个|一份|ppt|PPT|演示|幻灯片|页|[0-9０-９]+/g, "").trim().length > 2;
    if (!hasTopic) {
      return {
        type: "ppt_task",
        title: "做演示",
        prompt: text,
        actionType: "office_generate",
        needsCore: false,
        missingQuestion: "演示的主题是什么？",
        output: "pptx",
        statusLabel: "我需要先知道主题"
      };
    }
    return {
      type: "ppt_task",
      title: "做演示",
      prompt:
        `请完成一个演示文稿任务。\n` +
        `用户需求：${text}\n` +
        `要求：中文内容；结构清楚；${needsResearch ? "请先联网检索并保留来源链接；不要编造来源；" : "不需要联网时不要编造来源；"}完成后给出可用于生成 PPTX 的标题、页标题和每页要点。`,
      actionType: needsResearch ? "search" : "office_generate",
      needsCore: needsResearch,
      output: "pptx",
      statusLabel: needsResearch ? "我在查资料并做演示" : "我在做演示"
    };
  }

  private excelTask(text: string, needsResearch: boolean): RoutedTask {
    const hasTopic = hasOfficeTopic(text, /帮我|做|生成|制作|一个|一份|excel|xlsx|表格|清单|计划表|对比表|数据|分析|资料|联网|搜索|最新|来源|新闻|查一下|找一下/g);
    if (!hasTopic) {
      return {
        type: "excel_task",
        title: "做表格",
        prompt: text,
        actionType: "office_generate",
        needsCore: false,
        missingQuestion: "表格要整理什么内容？",
        output: "xlsx",
        statusLabel: "我需要先知道内容"
      };
    }
    return {
      type: "excel_task",
      title: "做表格",
      prompt:
        `请完成一个 Excel 表格生成任务。\n` +
        `用户需求：${text}\n` +
        `要求：中文；优先输出 Markdown 表格；列名清楚；每行数据可直接写入 XLSX；${needsResearch ? "请先联网检索并保留来源链接；不要编造来源。" : "不需要联网时不要编造来源。"}`,
      actionType: needsResearch ? "search" : "office_generate",
      needsCore: needsResearch,
      output: "xlsx",
      statusLabel: needsResearch ? "我在查资料并做表格" : "我在做表格"
    };
  }

  private paperTask(text: string, needsResearch: boolean): RoutedTask {
    const hasTopic = text.replace(/帮我|写|生成|论文|文章|初稿|大纲|参考文献|一篇|关于/g, "").trim().length > 2;
    if (!hasTopic) {
      return {
        type: "paper_task",
        title: "写论文",
        prompt: text,
        actionType: needsResearch ? "search" : "office_generate",
        needsCore: needsResearch,
        missingQuestion: "论文主题是什么？",
        output: "paper",
        statusLabel: "我需要先知道主题"
      };
    }
    return {
      type: "paper_task",
      title: "写论文",
      prompt:
        `请完成论文写作辅助任务。\n` +
        `用户需求：${text}\n` +
        `要求：中文；先给提纲，再给正文草稿；${needsResearch ? "请先联网检索；引用必须附来源；" : ""}不确定来源时明确写“不确定”，不要编造。`,
      actionType: needsResearch ? "search" : "office_generate",
      needsCore: needsResearch,
      output: "paper",
      statusLabel: needsResearch ? "我在查资料并写大纲" : "我在写大纲"
    };
  }

  private fileTask(text: string, files: string[]): RoutedTask {
    return {
      type: "file_task",
      title: "整理文件",
      prompt:
        `请只处理用户主动提供的文件。\n` +
        `用户需求：${text || "请总结并整理这些文件。"}\n` +
        `文件列表：${files.length ? files.join("\n") : "用户稍后提供"}\n` +
        `限制：不要扫描全盘；如需写入、覆盖、移动或删除文件，必须先请求确认。`,
      actionType: "file_read",
      needsCore: true,
      output: "none",
      statusLabel: "我在整理文件"
    };
  }

  private researchTask(text: string): RoutedTask {
    return {
      type: "research_task",
      title: "找资料",
      prompt:
        `请完成资料检索任务。\n` +
        `用户需求：${text}\n` +
        `要求：中文总结；列出关键结论；提供来源链接；不确定就说明不确定；不要编造来源；完成后给出适合保存成资料整理文档的结构。`,
      actionType: "search",
      needsCore: true,
      output: "research",
      statusLabel: "我在找资料"
    };
  }

  private browserTask(text: string): RoutedTask {
    return {
      type: "browser_task",
      title: "看网页",
      prompt:
        `请使用浏览器辅助能力完成任务。\n` +
        `用户需求：${text}\n` +
        `限制：除非用户再次确认，不要提交表单、发送消息、付款、下载未知文件或读取敏感凭证。`,
      actionType: "browser_fill",
      needsCore: true,
      output: "none",
      statusLabel: "我在看网页"
    };
  }

  private openUrlTask(text: string): RoutedTask {
    const url = normalizeRequestedUrl(text);
    return {
      type: "open_url_task",
      title: "打开网页",
      prompt: `请打开网页：${url}`,
      actionType: "open_url",
      needsCore: false,
      output: "none",
      urls: [url],
      statusLabel: "我在打开网页"
    };
  }

  private overlayTask(text: string): RoutedTask {
    return {
      type: "overlay_assist",
      title: "帮我看当前应用",
      prompt:
        `请作为桌面辅助伙伴帮助用户理解当前应用相关任务。\n` +
        `用户需求：${text}\n` +
        `限制：先说明将要做什么；不直接提交、发送、删除、付款或读取敏感凭证。`,
      actionType: "app_overlay_assist",
      needsCore: true,
      output: "none",
      statusLabel: "我在旁边帮你"
    };
  }
}

function isOpenUrlTask(text: string): boolean {
  return /打开百度|百度一下|baidu|https?:\/\/|www\./i.test(text) || (/打开/.test(text) && /网页|网站|链接/.test(text));
}

function normalizeRequestedUrl(text: string): string {
  if (/百度|baidu/i.test(text)) return "https://www.baidu.com/";
  const explicit = /(https?:\/\/[^\s，。]+)/i.exec(text)?.[1];
  if (explicit) return new URL(explicit).toString();
  const www = /(www\.[^\s，。]+)/i.exec(text)?.[1];
  if (www) return new URL(`https://${www}`).toString();
  return "https://www.baidu.com/";
}

function isPpt(text: string): boolean {
  return /ppt|演示|幻灯|汇报|路演|presentation|slides?/.test(text);
}

function isWord(text: string): boolean {
  return /word|docx|写.*文档|生成.*文档|整理成.*文档|报告|简历|申请书|说明书|方案|纪要/.test(text);
}

function isExcel(text: string): boolean {
  return /excel|xlsx|电子表格|数据表|计划表|对比表|清单|台账|生成.*表格|制作.*表格|做.*表格/.test(text);
}

function isPaper(text: string): boolean {
  return /论文|文献|参考文献|开题|综述|正文|初稿|paper|essay|thesis/.test(text);
}

function isFileTask(text: string): boolean {
  return /文件|表格|文档|pdf|word|excel|整理|转换|总结这个/.test(text);
}

function isWebTask(text: string): boolean {
  return /搜索|联网|资料|查一下|找一下|新闻|价格|对比|来源|网页|最新|研究/.test(text);
}

function isBrowserTask(text: string): boolean {
  return /浏览器|打开网页|填写|网页操作|表单/.test(text);
}

function isOverlayTask(text: string): boolean {
  return /当前应用|这个窗口|屏幕上|帮我看|其他应用/.test(text);
}

function hasOfficeTopic(text: string, noise: RegExp): boolean {
  return text.replace(noise, "").replace(/[：:，。,.\s]/g, "").trim().length > 1;
}
