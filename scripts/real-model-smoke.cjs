const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const electron = require("electron");

if (!electron.app) {
  const electronPath = typeof electron === "string" ? electron : electron.default;
  if (!electronPath) {
    console.log(JSON.stringify({ ok: false, errorType: "electron_runtime_unavailable" }));
    process.exit(1);
  }
  const result = spawnSync(electronPath, [__filename], {
    env: { ...process.env, MINIPET_SMOKE_ELECTRON: "1" },
    stdio: "inherit"
  });
  process.exit(result.status ?? 1);
}

const { app, safeStorage } = electron;

app.setPath("userData", path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "minipet-openclaw-companion"));

async function main() {
  const configDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "ZhaoZhaoPartner");
  const settings = await readJson(path.join(configDir, "settings.json"));
  const secrets = await readJson(path.join(configDir, "secrets.json"));
  const encrypted = secrets.openaiApiKey?.encrypted;
  if (!encrypted) return report({ ok: false, errorType: "missing_saved_key" });
  if (!safeStorage.isEncryptionAvailable()) return report({ ok: false, errorType: "encryption_unavailable" });

  const apiKey = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  const model = settings.openAIModel || "minipet";
  const baseUrls = uniqueBaseUrls(settings.openAIBaseUrl || "https://newkey.versecraft.cn/");
  let lastError;
  for (const baseUrl of baseUrls) {
    try {
      const streamed = await chat(baseUrl, apiKey, model, true);
      if (streamed.text.trim()) {
        return report({ ok: true, model, baseUrlUsed: baseUrl, streamingUsed: true, textLength: streamed.text.trim().length, httpStatus: streamed.httpStatus });
      }
      const fallback = await chat(baseUrl, apiKey, model, false);
      if (fallback.text.trim()) {
        return report({ ok: true, model, baseUrlUsed: baseUrl, streamingUsed: false, textLength: fallback.text.trim().length, httpStatus: fallback.httpStatus });
      }
      lastError = { errorType: "empty_model_response", httpStatus: fallback.httpStatus };
    } catch (error) {
      lastError = { errorType: error.name || "request_failed", message: sanitizeError(error.message) };
    }
  }
  return report({ ok: false, model, baseUrlUsed: baseUrls.at(-1), ...lastError });
}

async function chat(baseUrl, apiKey, model, stream) {
  const response = await fetch(new URL("chat/completions", ensureTrailingSlash(baseUrl)), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      stream,
      temperature: 0,
      messages: [{ role: "user", content: "请用中文回复两个字：正常" }]
    }),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`http_${response.status}:${body.slice(0, 120)}`);
    error.name = "http_error";
    throw error;
  }
  if (stream && response.body) return { text: await readStream(response.body), httpStatus: response.status };
  return { text: extractChatText(await response.json()), httpStatus: response.status };
}

async function readStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) output += extractSseLineText(line);
  }
  buffer += decoder.decode();
  if (buffer.trim()) output += extractSseLineText(buffer);
  return output;
}

function extractSseLineText(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return "";
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  try {
    return extractChatText(JSON.parse(payload));
  } catch {
    return "";
  }
}

function extractChatText(value) {
  if (!value || typeof value !== "object") return "";
  const choices = Array.isArray(value.choices) ? value.choices : [];
  for (const choice of choices) {
    const text = extractChoiceText(choice);
    if (text.trim()) return text;
  }
  return extractContent(value.text) || extractContent(value.output_text);
}

function extractChoiceText(choice) {
  if (!choice || typeof choice !== "object") return "";
  return (
    extractContent(choice.delta?.content) ||
    extractContent(choice.delta?.text) ||
    extractContent(choice.message?.content) ||
    extractContent(choice.text) ||
    extractContent(choice.output_text) ||
    ""
  );
}

function extractContent(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractContent).join("");
  if (value && typeof value === "object") return extractContent(value.text) || extractContent(value.content) || extractContent(value.output_text);
  return "";
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

function uniqueBaseUrls(baseUrl) {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const withV1 = /\/v1\/?$/.test(normalized) ? normalized : new URL("v1/", normalized).toString();
  return Array.from(new Set([normalized, withV1]));
}

function ensureTrailingSlash(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function sanitizeError(message = "") {
  return message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]").slice(0, 180);
}

function report(result) {
  console.log(JSON.stringify(result));
  app.exit(result.ok ? 0 : 1);
}

app.whenReady().then(main).catch((error) => report({ ok: false, errorType: error.name || "smoke_failed", message: sanitizeError(error.message) }));
