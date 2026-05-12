import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { safeStorage } from "electron";
import { defaultConfigDir } from "./configStore";

export type SecretKey = "openaiApiKey" | "openclawToken";

interface SecretRecord {
  encrypted: string;
  fallbackPlaintext?: never;
}

export class SecureStore {
  private readonly filePath: string;
  private sessionOnly = new Map<SecretKey, string>();

  constructor(configDir = defaultConfigDir()) {
    this.filePath = path.join(configDir, "secrets.json");
  }

  canPersistSecurely(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  async setSecret(key: SecretKey, value: string, persist = true): Promise<{ persisted: boolean; secure: boolean }> {
    if (!value) {
      await this.clearSecret(key);
      return { persisted: false, secure: this.canPersistSecurely() };
    }
    if (!persist || !this.canPersistSecurely()) {
      this.sessionOnly.set(key, value);
      return { persisted: false, secure: false };
    }
    const records = await this.readRecords();
    records[key] = {
      encrypted: safeStorage.encryptString(value).toString("base64")
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    this.sessionOnly.delete(key);
    return { persisted: true, secure: true };
  }

  async getSecret(key: SecretKey): Promise<string | undefined> {
    const session = this.sessionOnly.get(key);
    if (session) return session;
    if (!this.canPersistSecurely()) return undefined;
    const records = await this.readRecords();
    const encrypted = records[key]?.encrypted;
    if (!encrypted) return undefined;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return undefined;
    }
  }

  async clearSecret(key: SecretKey): Promise<void> {
    this.sessionOnly.delete(key);
    const records = await this.readRecords();
    delete records[key];
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  async hasSecret(key: SecretKey): Promise<boolean> {
    return Boolean(await this.getSecret(key));
  }

  async status(): Promise<Record<SecretKey, boolean> & { encryptionAvailable: boolean }> {
    return {
      openaiApiKey: await this.hasSecret("openaiApiKey"),
      openclawToken: await this.hasSecret("openclawToken"),
      encryptionAvailable: this.canPersistSecurely()
    };
  }

  private async readRecords(): Promise<Partial<Record<SecretKey, SecretRecord>>> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as Partial<Record<SecretKey, SecretRecord>>;
    } catch {
      return {};
    }
  }
}

export function maskSecret(value: string | undefined): string {
  if (!value) return "";
  const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
  return `已保存 · ${hash}`;
}
