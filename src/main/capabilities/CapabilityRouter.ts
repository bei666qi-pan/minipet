import type { ActionType } from "../permissions/PermissionModes";

export type CompanionTaskType = "chat" | "file_task" | "ppt_task" | "paper_task" | "web_task" | "browser_task" | "overlay_assist";

export interface RoutedTask {
  type: CompanionTaskType;
  title: string;
  prompt: string;
  actionType: ActionType;
  needsCore: boolean;
  missingQuestion?: string;
  output: "none" | "pptx" | "paper";
  statusLabel: string;
}

export class CapabilityRouter {
  route(input: string, files: string[] = []): RoutedTask {
    const text = input.trim();
    const lower = text.toLowerCase();

    if (isPpt(lower)) return this.pptTask(text);
    if (isPaper(lower)) return this.paperTask(text);
    if (isFileTask(lower) || files.length > 0) return this.fileTask(text, files);
    if (isBrowserTask(lower)) return this.browserTask(text);
    if (isOverlayTask(lower)) return this.overlayTask(text);
    if (isWebTask(lower)) return this.webTask(text);
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

  private pptTask(text: string): RoutedTask {
    const hasTopic = text.replace(/帮我|做|生成|制作|一个|一份|ppt|PPT|演示|幻灯片|页|[0-9０-９]+/g, "").trim().length > 2;
    if (!hasTopic) {
      return {
        type: "ppt_task",
        title: "做演示",
        prompt: text,
        actionType: "ppt",
        needsCore: true,
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
        `要求：中文内容；结构清楚；如需资料请先检索；不要编造来源；完成后给出可用于生成 PPTX 的标题、页标题和每页要点。`,
      actionType: "ppt",
      needsCore: true,
      output: "pptx",
      statusLabel: "我在做演示"
    };
  }

  private paperTask(text: string): RoutedTask {
    const hasTopic = text.replace(/帮我|写|生成|论文|文章|初稿|大纲|参考文献|一篇|关于/g, "").trim().length > 2;
    if (!hasTopic) {
      return {
        type: "paper_task",
        title: "写论文",
        prompt: text,
        actionType: "search",
        needsCore: true,
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
        `要求：中文；先给提纲，再给正文草稿；需要资料时先检索；引用必须附来源；不确定来源时明确写“不确定”，不要编造。`,
      actionType: "search",
      needsCore: true,
      output: "paper",
      statusLabel: "我在写大纲"
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

  private webTask(text: string): RoutedTask {
    return {
      type: "web_task",
      title: "找资料",
      prompt:
        `请完成资料检索任务。\n` +
        `用户需求：${text}\n` +
        `要求：中文总结；列出关键结论；提供来源链接；不确定就说明不确定；不要编造来源。`,
      actionType: "search",
      needsCore: true,
      output: "none",
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

function isPpt(text: string): boolean {
  return /ppt|演示|幻灯|汇报|路演|presentation|slides?/.test(text);
}

function isPaper(text: string): boolean {
  return /论文|文献|参考文献|开题|综述|正文|初稿|paper|essay|thesis/.test(text);
}

function isFileTask(text: string): boolean {
  return /文件|表格|文档|pdf|word|excel|整理|转换|总结这个/.test(text);
}

function isWebTask(text: string): boolean {
  return /搜索|联网|资料|查一下|找一下|新闻|价格|对比|来源|网页/.test(text);
}

function isBrowserTask(text: string): boolean {
  return /浏览器|打开网页|填写|网页操作|表单/.test(text);
}

function isOverlayTask(text: string): boolean {
  return /当前应用|这个窗口|屏幕上|帮我看|其他应用/.test(text);
}
