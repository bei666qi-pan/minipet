import crypto from "node:crypto";
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";

const required = ["VOLCENGINE_ACCESS_KEY_ID", "VOLCENGINE_SECRET_ACCESS_KEY", "VOLCENGINE_TOS_BUCKET", "VOLCENGINE_TOS_ENDPOINT"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error("tos_upload_missing_env", { keys: missing });
  process.exit(1);
}

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const version = process.env.MINIPET_RELEASE_VERSION || packageJson.version;
const channel = process.env.MINIPET_RELEASE_CHANNEL || "stable";
const releaseNotes = process.env.MINIPET_RELEASE_NOTES || `MiniPet ${version}`;
const releaseDir = path.resolve("release");
const installerPath = await resolveInstallerPath(releaseDir, version);
const installerName = path.basename(installerPath);
const installerBytes = await fs.readFile(installerPath);
const sha256 = sha256Hex(installerBytes);
const size = installerBytes.length;
const cdnOrigin = normalizeCdnOrigin(process.env.VOLCENGINE_CDN_DOMAIN || process.env.MINIPET_DOWNLOAD_ORIGIN || "https://download.minipet.versecraft.cn");
const versionedKey = `releases/v${version}/${installerName}`;
const latestInstallerKey = "latest/MiniPetSetup.exe";
const latestJsonKey = "latest/latest.json";
const versionedUrl = `${cdnOrigin}/${versionedKey}`;
const latestInstallerUrl = `${cdnOrigin}/${latestInstallerKey}`;
const latestJsonUrl = `${cdnOrigin}/${latestJsonKey}`;
const publishedAt = new Date().toISOString();
const uploadTimeoutMs = Number(process.env.VOLCENGINE_TOS_UPLOAD_TIMEOUT_MS || 15 * 60 * 1000);
const uploadAttempts = Number(process.env.VOLCENGINE_TOS_UPLOAD_ATTEMPTS || 3);
const latestManifest = {
  version,
  channel,
  installer_url: latestInstallerUrl,
  sha256,
  size,
  release_notes: releaseNotes,
  published_at: publishedAt,
  versioned_installer_url: versionedUrl
};

const latestManifestPath = path.join(releaseDir, "latest.json");
const versionManifestPath = path.join(releaseDir, `release-manifest-${version}.json`);
const latestManifestBytes = Buffer.from(`${JSON.stringify(latestManifest, null, 2)}\n`, "utf8");
await fs.writeFile(latestManifestPath, latestManifestBytes);
await fs.writeFile(versionManifestPath, latestManifestBytes);

await putObject(versionedKey, installerBytes, contentTypeFor(versionedKey));
await putObject(latestInstallerKey, installerBytes, contentTypeFor(latestInstallerKey));
await putObject(latestJsonKey, latestManifestBytes, contentTypeFor(latestJsonKey));

const verification = await verifyPublished({ versionedUrl, latestInstallerUrl, latestJsonUrl, sha256, size });
console.log("tos_release_uploaded", {
  version,
  channel,
  installer: installerName,
  size,
  sha256,
  urls: {
    versioned: versionedUrl,
    latestInstaller: latestInstallerUrl,
    latestJson: latestJsonUrl
  },
  verification
});

async function resolveInstallerPath(dir, version) {
  const expected = path.join(dir, `MiniPetSetup-${version}-x64.exe`);
  if (await exists(expected)) return expected;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const installers = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^MiniPetSetup-.+-x64\.exe$/i.test(entry.name))
      .map(async (entry) => {
        const filePath = path.join(dir, entry.name);
        const stat = await fs.stat(filePath);
        return { filePath, mtime: stat.mtimeMs };
      })
  );
  installers.sort((a, b) => b.mtime - a.mtime);
  if (!installers[0]) throw new Error(`installer_not_found_for_version_${version}`);
  return installers[0].filePath;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function putObject(key, body, contentType) {
  const accessKeyId = process.env.VOLCENGINE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VOLCENGINE_SECRET_ACCESS_KEY;
  const bucket = process.env.VOLCENGINE_TOS_BUCKET;
  const region = process.env.VOLCENGINE_TOS_REGION || "cn-beijing";
  const endpoint = process.env.VOLCENGINE_TOS_ENDPOINT.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = `${bucket}.${endpoint}`;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const payloadHash = sha256Hex(body);
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    "content-type": contentType
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = ["PUT", `/${encodedKey}`, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, "s3");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = new URL(`https://${host}/${encodedKey}`);
  const uploadHeaders = { ...headers, authorization, "content-length": String(body.length) };
  const response = await retry(`tos_upload_${key}`, uploadAttempts, async () => {
    const result = await requestBuffer(url, { method: "PUT", headers: uploadHeaders, timeoutMs: uploadTimeoutMs }, body);
    if (result.statusCode >= 500) throw new Error(`tos_upload_retryable_${result.statusCode}_${key}`);
    return result;
  });
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`tos_upload_failed_${response.statusCode}_${key}`);
  console.log("tos_object_uploaded", { key, bytes: body.length });
}

async function verifyPublished(input) {
  const latestJsonResponse = await fetch(input.latestJsonUrl, { cache: "no-store" });
  if (!latestJsonResponse.ok) throw new Error(`latest_json_not_available_${latestJsonResponse.status}`);
  const latestJson = await latestJsonResponse.json();
  if (latestJson.sha256 !== input.sha256) throw new Error("latest_json_sha256_mismatch");
  if (Number(latestJson.size) !== input.size) throw new Error("latest_json_size_mismatch");

  const latestInstaller = await fetch(input.latestInstallerUrl, { cache: "no-store" });
  if (!latestInstaller.ok) throw new Error(`latest_installer_not_available_${latestInstaller.status}`);
  const latestLength = Number(latestInstaller.headers.get("content-length") || 0);
  const latestBuffer = Buffer.from(await latestInstaller.arrayBuffer());
  if (latestBuffer.length <= 0 || latestLength <= 0) throw new Error("latest_installer_empty");
  if (sha256Hex(latestBuffer) !== input.sha256) throw new Error("latest_installer_sha256_mismatch");

  const versioned = await fetch(input.versionedUrl, { method: "HEAD", cache: "no-store" });
  if (!versioned.ok) throw new Error(`versioned_installer_not_available_${versioned.status}`);
  const versionedLength = Number(versioned.headers.get("content-length") || 0);
  if (versionedLength <= 0) throw new Error("versioned_installer_empty");

  return { latestJson: latestJsonResponse.status, latestInstaller: latestInstaller.status, latestContentLength: latestLength, versionedInstaller: versioned.status, versionedContentLength: versionedLength };
}

function normalizeCdnOrigin(value) {
  return value.replace(/^([^:]+)$/, "https://$1").replace(/\/+$/, "");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

async function retry(label, attempts, operation) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      console.warn("tos_retry", { label, attempt, message: error instanceof Error ? error.message : String(error) });
      await sleep(attempt * 2_000);
    }
  }
  throw lastError;
}

function requestBuffer(url, options, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: options.method,
        headers: options.headers,
        timeout: options.timeoutMs
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error(`request_timeout_${options.timeoutMs}`)));
    request.on("error", reject);
    request.end(body);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSignatureKey(secret, date, regionName, serviceName) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}

function contentTypeFor(key) {
  if (/\.json$/i.test(key)) return "application/json; charset=utf-8";
  return "application/vnd.microsoft.portable-executable";
}
