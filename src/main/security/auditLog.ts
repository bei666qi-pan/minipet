import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const SECRET_PATTERNS = [
  /sk-[a-z0-9_-]{16,}/gi,
  /(api[_-]?key|token|secret|password)["':=\s]+[^\s"',;]+/gi,
  /(bearer\s+)[a-z0-9._-]+/gi
];

export interface AuditEntry {
  action: string;
  mode?: string;
  method?: string;
  risk?: string;
  allowed?: boolean;
  requireConfirmation?: boolean;
  reason?: string;
  details?: unknown;
  createdAt?: string;
}

export function defaultLogDir(): string {
  return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "minipet", "logs");
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, (match, prefix = "") => `${prefix}[REDACTED]`), value);
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/apiKey|token|secret|password|cookie/i.test(key)) output[key] = "[REDACTED]";
      else output[key] = redactSecrets(item);
    }
    return output;
  }
  return value;
}

export async function appendAuditLog(entry: AuditEntry, logDir = defaultLogDir()): Promise<void> {
  try {
    await fs.mkdir(logDir, { recursive: true });
    const safeEntry = redactSecrets({
      ...entry,
      createdAt: entry.createdAt ?? new Date().toISOString()
    });
    await fs.appendFile(path.join(logDir, "audit.log"), `${JSON.stringify(safeEntry)}\n`, "utf8");
  } catch {
    // Audit logging must never crash the pet UI or block a user task.
  }
}

export async function readAuditLog(limit = 120, logDir = defaultLogDir()): Promise<AuditEntry[]> {
  try {
    const file = path.join(logDir, "audit.log");
    const text = await fs.readFile(file, "utf8");
    return text
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as AuditEntry);
  } catch {
    return [];
  }
}
