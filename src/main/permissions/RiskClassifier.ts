import type { ActionType, RiskLevel } from "./PermissionModes";

const CRITICAL_PATTERNS = [
  /删除|清空|格式化|付款|支付|下单|购买|shell|命令行|powershell|cmd|ssh key|api key|密钥|钱包|浏览器密码|导出凭证|安装.*skill|安装.*技能/i,
  /delete|remove|format|payment|purchase|shell|system\.run|secret|credential|wallet|ssh|install/i
];

const HIGH_PATTERNS = [
  /提交表单|发送邮件|发邮件|发送消息|改配置|修改配置|定时任务|自动发布|提交订单/i,
  /submit|send email|send message|config|schedule|cron|publish/i
];

const MEDIUM_PATTERNS = [
  /写入|保存|下载|生成.*ppt|导出|填写表单|打开外部链接|处理文件|覆盖/i,
  /write|save|download|ppt|export|fill.*form|external link|overwrite/i
];

const ACTION_RISK: Record<ActionType, RiskLevel> = {
  chat: "low",
  search: "low",
  ppt: "medium",
  browser_read: "low",
  browser_fill: "medium",
  browser_submit: "high",
  file_read: "low",
  file_write: "medium",
  file_delete: "critical",
  skill_install: "critical",
  config_mutation: "high",
  shell: "critical",
  secrets: "critical",
  payment: "critical",
  message_send: "high",
  schedule: "high",
  open_url: "medium",
  app_overlay_read: "low",
  app_overlay_assist: "medium",
  app_overlay_control_request: "high"
};

export class RiskClassifier {
  classifyText(input = ""): RiskLevel {
    const text = input.trim();
    if (!text) return "low";
    if (CRITICAL_PATTERNS.some((pattern) => pattern.test(text))) return "critical";
    if (HIGH_PATTERNS.some((pattern) => pattern.test(text))) return "high";
    if (MEDIUM_PATTERNS.some((pattern) => pattern.test(text))) return "medium";
    return "low";
  }

  classifyAction(actionType: ActionType, prompt = ""): RiskLevel {
    return maxRisk(ACTION_RISK[actionType] ?? "low", this.classifyText(prompt));
  }
}

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: RiskLevel[] = ["low", "medium", "high", "critical"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))] ?? "low";
}
