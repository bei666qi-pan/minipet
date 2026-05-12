export type PermissionMode = "demo" | "safe" | "assisted" | "full";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PermissionDecision =
  | {
      allowed: true;
      requireConfirmation: boolean;
      reason: string;
      risk: RiskLevel;
      scopes: string[];
    }
  | {
      allowed: false;
      requireConfirmation: false;
      reason: string;
      risk: RiskLevel;
      scopes: string[];
    };

export type ActionType =
  | "chat"
  | "search"
  | "ppt"
  | "browser_read"
  | "browser_fill"
  | "browser_submit"
  | "file_read"
  | "file_write"
  | "file_delete"
  | "skill_install"
  | "config_mutation"
  | "shell"
  | "secrets"
  | "payment"
  | "message_send"
  | "schedule"
  | "open_url"
  | "app_overlay_read"
  | "app_overlay_assist"
  | "app_overlay_control_request";

export interface PermissionContext {
  mode: PermissionMode;
  actionType: ActionType;
  method?: string;
  prompt?: string;
  paths?: string[];
  urls?: string[];
  userSelectedPaths?: string[];
  adminAdvanced?: boolean;
}

export const CONFIRM_FULL_ACCESS_PHRASE = "我理解风险并启用完全访问";

export const MODE_SCOPES: Record<PermissionMode, string[]> = {
  demo: [],
  safe: ["operator.read", "operator.write"],
  assisted: ["operator.read", "operator.write", "operator.approvals"],
  full: ["operator.read", "operator.write", "operator.approvals", "operator.pairing"]
};

export const MODE_LABELS: Record<PermissionMode, string> = {
  demo: "演示模式",
  safe: "安全模式",
  assisted: "辅助模式",
  full: "完全访问模式"
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
  critical: "关键风险"
};
