import path from "node:path";
import { appendAuditLog } from "../security/auditLog";
import { isAllowedExternalUrl } from "../security/urlGuard";
import { RiskClassifier } from "./RiskClassifier";
import type { PermissionContext, PermissionDecision, PermissionMode, RiskLevel } from "./PermissionModes";
import { MODE_SCOPES } from "./PermissionModes";

const DEMO_ALLOWED = new Set(["chat"]);
const SAFE_ALLOWED = new Set(["chat", "search", "ppt", "browser_read", "file_read", "app_overlay_read", "app_overlay_assist"]);
const ASSISTED_ALLOWED = new Set([
  "chat",
  "search",
  "ppt",
  "browser_read",
  "browser_fill",
  "file_read",
  "file_write",
  "open_url",
  "schedule",
  "app_overlay_read",
  "app_overlay_assist"
]);

const NEVER_WITHOUT_CONFIRM = new Set([
  "browser_submit",
  "file_delete",
  "skill_install",
  "config_mutation",
  "shell",
  "secrets",
  "payment",
  "message_send",
  "app_overlay_assist",
  "app_overlay_control_request"
]);

const METHOD_RISK: Array<{ pattern: RegExp; risk: RiskLevel }> = [
  { pattern: /system\.run|shell|exec/i, risk: "critical" },
  { pattern: /skill.*install|install.*skill/i, risk: "critical" },
  { pattern: /config\.(set|update|delete)|settings\.(set|update|delete)/i, risk: "high" },
  { pattern: /browser\.(submit|clickPay|checkout)/i, risk: "high" },
  { pattern: /files?\.(delete|remove)/i, risk: "critical" }
];

export class PermissionGate {
  private readonly classifier = new RiskClassifier();

  evaluate(context: PermissionContext): PermissionDecision {
    const methodRisk = this.classifyMethod(context.method);
    const actionRisk = this.classifier.classifyAction(context.actionType, context.prompt);
    const risk = this.max(methodRisk, actionRisk);
    const scopes = this.scopesForMode(context.mode, context.adminAdvanced);

    const pathDecision = this.checkPaths(context);
    if (!pathDecision.allowed) {
      return this.logAndReturn(context, {
        allowed: false,
        requireConfirmation: false,
        reason: pathDecision.reason,
        risk,
        scopes
      });
    }

    const urlDecision = this.checkUrls(context);
    if (!urlDecision.allowed) {
      return this.logAndReturn(context, {
        allowed: false,
        requireConfirmation: false,
        reason: urlDecision.reason,
        risk,
        scopes
      });
    }

    if (!this.actionAllowedInMode(context.mode, context.actionType)) {
      return this.logAndReturn(context, {
        allowed: false,
        requireConfirmation: false,
        reason: `${this.modeName(context.mode)}不允许执行此操作。`,
        risk,
        scopes
      });
    }

    if (context.actionType === "config_mutation" || context.actionType === "skill_install") {
      if (!(context.mode === "full" && context.adminAdvanced)) {
        return this.logAndReturn(context, {
          allowed: false,
          requireConfirmation: false,
          reason: "安装技能或修改 OpenClaw 配置需要完全访问模式，并单独开启管理员高级开关。",
          risk: "critical",
          scopes
        });
      }
    }

    const requireConfirmation =
      risk === "critical" ||
      risk === "high" ||
      NEVER_WITHOUT_CONFIRM.has(context.actionType) ||
      (context.mode === "assisted" && risk === "medium") ||
      (context.mode === "full" && NEVER_WITHOUT_CONFIRM.has(context.actionType));

    return this.logAndReturn(context, {
      allowed: true,
      requireConfirmation,
      reason: requireConfirmation ? "此操作需要你确认后才会继续。" : "权限检查通过。",
      risk,
      scopes
    });
  }

  scopesForMode(mode: PermissionMode, adminAdvanced = false): string[] {
    const scopes = [...MODE_SCOPES[mode]];
    if (mode === "full" && adminAdvanced) scopes.push("operator.admin");
    return scopes;
  }

  private classifyMethod(method = ""): RiskLevel {
    const hit = METHOD_RISK.find((entry) => entry.pattern.test(method));
    return hit?.risk ?? "low";
  }

  private actionAllowedInMode(mode: PermissionMode, actionType: string): boolean {
    if (mode === "demo") return DEMO_ALLOWED.has(actionType);
    if (mode === "safe") return SAFE_ALLOWED.has(actionType);
    if (mode === "assisted") return ASSISTED_ALLOWED.has(actionType);
    return true;
  }

  private checkPaths(context: PermissionContext): { allowed: true } | { allowed: false; reason: string } {
    if (!context.paths?.length) return { allowed: true };
    const selected = new Set((context.userSelectedPaths ?? []).map((item) => path.resolve(item).toLowerCase()));
    if (context.mode === "safe" || context.mode === "demo") {
      for (const candidate of context.paths) {
        const resolved = path.resolve(candidate).toLowerCase();
        const allowed = Array.from(selected).some((base) => resolved === base || resolved.startsWith(`${base}${path.sep}`));
        if (!allowed) return { allowed: false, reason: "安全模式只允许读取你主动选择或拖入的文件。" };
      }
    }
    return { allowed: true };
  }

  private checkUrls(context: PermissionContext): { allowed: true } | { allowed: false; reason: string } {
    for (const url of context.urls ?? []) {
      if (!isAllowedExternalUrl(url)) return { allowed: false, reason: "URL 未通过安全检查。" };
    }
    return { allowed: true };
  }

  private max(a: RiskLevel, b: RiskLevel): RiskLevel {
    const order: RiskLevel[] = ["low", "medium", "high", "critical"];
    return order[Math.max(order.indexOf(a), order.indexOf(b))] ?? "low";
  }

  private logAndReturn(context: PermissionContext, decision: PermissionDecision): PermissionDecision {
    void appendAuditLog({
      action: context.actionType,
      method: context.method,
      mode: context.mode,
      risk: decision.risk,
      allowed: decision.allowed,
      requireConfirmation: decision.requireConfirmation,
      reason: decision.reason
    });
    return decision;
  }

  private modeName(mode: PermissionMode): string {
    return {
      demo: "演示模式",
      safe: "安全模式",
      assisted: "辅助模式",
      full: "完全访问模式"
    }[mode];
  }
}
