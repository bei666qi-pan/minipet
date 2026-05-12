import crypto from "node:crypto";

export interface SignedTokenPayload {
  sub: string;
  kind: "device" | "admin";
  exp: number;
}

export function signToken(payload: SignedTokenPayload, secret: string): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const signature = hmac(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string | undefined, secret: string, expectedKind: SignedTokenPayload["kind"]): SignedTokenPayload | undefined {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  const [header, body, signature] = parts;
  const expected = hmac(`${header}.${body}`, secret);
  if (!safeEqual(signature, expected)) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedTokenPayload;
    if (payload.kind !== expectedKind || payload.exp < Math.floor(Date.now() / 1000)) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("base64url")): string {
  const derived = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, salt, stored] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !stored) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("base64url");
  return safeEqual(derived, stored);
}

export function readBearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(.+)$/i.exec(value || "");
  return match?.[1];
}

function base64Url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(input: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
