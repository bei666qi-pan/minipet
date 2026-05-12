const SENSITIVE_KEYS = /authorization|bearer|api[_-]?key|password|secret|token/i;

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SENSITIVE_KEYS.test(key) ? "[REDACTED]" : redactSensitive(entry);
    }
    return output;
  }
  if (typeof value === "string" && /Bearer\s+[A-Za-z0-9._-]+/.test(value)) return value.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");
  return value;
}
