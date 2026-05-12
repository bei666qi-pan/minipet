import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const [fileArg = "release/MiniPetSetup.exe", keyArg = "MiniPetSetup.exe"] = process.argv.slice(2);
const required = ["VOLCENGINE_ACCESS_KEY_ID", "VOLCENGINE_SECRET_ACCESS_KEY", "VOLCENGINE_TOS_BUCKET", "VOLCENGINE_TOS_ENDPOINT"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.warn("tos_upload_skipped_missing_env", { keys: missing });
  process.exit(0);
}

const accessKeyId = process.env.VOLCENGINE_ACCESS_KEY_ID;
const secretAccessKey = process.env.VOLCENGINE_SECRET_ACCESS_KEY;
const bucket = process.env.VOLCENGINE_TOS_BUCKET;
const region = process.env.VOLCENGINE_TOS_REGION || "cn-beijing";
const endpoint = process.env.VOLCENGINE_TOS_ENDPOINT.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const key = keyArg.replace(/^\/+/, "");
const body = await fs.readFile(path.resolve(fileArg));
const now = new Date();
const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
const dateStamp = amzDate.slice(0, 8);
const host = `${bucket}.${endpoint}`;
const encodedKey = key.split("/").map(encodeURIComponent).join("/");
const url = `https://${host}/${encodedKey}`;
const payloadHash = sha256Hex(body);
const headers = {
  host,
  "x-amz-content-sha256": payloadHash,
  "x-amz-date": amzDate,
  "content-type": "application/vnd.microsoft.portable-executable"
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

const response = await fetch(url, {
  method: "PUT",
  headers: { ...headers, authorization },
  body
});

if (!response.ok) {
  throw new Error(`tos_upload_failed_${response.status}`);
}

console.log("tos_upload_complete", { key, bytes: body.length });

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function getSignatureKey(secret, date, regionName, serviceName) {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}
