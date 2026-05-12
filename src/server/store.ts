import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { DEFAULT_DEVICE_QUOTA_TOKENS } from "./config";

export interface DeviceRecord {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  disabled: boolean;
  quotaTokens: number;
  usedTokens: number;
  appVersion?: string;
  platform?: string;
}

export interface UsageRecord {
  id: string;
  deviceId: string;
  createdAt: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  upstreamStatus: number;
}

export interface UsageSummary {
  totalDevices: number;
  disabledDevices: number;
  totalQuotaTokens: number;
  totalUsedTokens: number;
}

export interface MiniPetStore {
  init(): Promise<void>;
  upsertDevice(input: { id: string; appVersion?: string; platform?: string }): Promise<DeviceRecord>;
  getDevice(id: string): Promise<DeviceRecord | undefined>;
  listDevices(): Promise<DeviceRecord[]>;
  updateDevice(id: string, patch: { quotaTokens?: number; disabled?: boolean }): Promise<DeviceRecord | undefined>;
  recordUsage(input: Omit<UsageRecord, "id" | "createdAt">): Promise<UsageRecord>;
  getUsageSummary(): Promise<UsageSummary>;
}

interface FileData {
  devices: DeviceRecord[];
  usage: UsageRecord[];
}

export class FileMiniPetStore implements MiniPetStore {
  private data: FileData = { devices: [], usage: [] };

  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.data = JSON.parse(await fs.readFile(this.filePath, "utf8")) as FileData;
    } catch {
      await this.save();
    }
  }

  async upsertDevice(input: { id: string; appVersion?: string; platform?: string }): Promise<DeviceRecord> {
    const now = new Date().toISOString();
    const found = this.data.devices.find((device) => device.id === input.id);
    if (found) {
      found.lastSeenAt = now;
      found.appVersion = input.appVersion || found.appVersion;
      found.platform = input.platform || found.platform;
      await this.save();
      return found;
    }
    const created: DeviceRecord = {
      id: input.id,
      createdAt: now,
      lastSeenAt: now,
      disabled: false,
      quotaTokens: DEFAULT_DEVICE_QUOTA_TOKENS,
      usedTokens: 0,
      appVersion: input.appVersion,
      platform: input.platform
    };
    this.data.devices.push(created);
    await this.save();
    return created;
  }

  async getDevice(id: string): Promise<DeviceRecord | undefined> {
    return this.data.devices.find((device) => device.id === id);
  }

  async listDevices(): Promise<DeviceRecord[]> {
    return [...this.data.devices].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  async updateDevice(id: string, patch: { quotaTokens?: number; disabled?: boolean }): Promise<DeviceRecord | undefined> {
    const found = this.data.devices.find((device) => device.id === id);
    if (!found) return undefined;
    if (typeof patch.quotaTokens === "number") found.quotaTokens = Math.max(0, Math.floor(patch.quotaTokens));
    if (typeof patch.disabled === "boolean") found.disabled = patch.disabled;
    await this.save();
    return found;
  }

  async recordUsage(input: Omit<UsageRecord, "id" | "createdAt">): Promise<UsageRecord> {
    const record: UsageRecord = {
      ...input,
      id: `usage_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString()
    };
    this.data.usage.push(record);
    const device = this.data.devices.find((item) => item.id === input.deviceId);
    if (device) {
      device.usedTokens += input.totalTokens;
      device.lastSeenAt = record.createdAt;
    }
    await this.save();
    return record;
  }

  async getUsageSummary(): Promise<UsageSummary> {
    return summarizeDevices(this.data.devices);
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.filePath, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
  }
}

export class PostgresMiniPetStore implements MiniPetStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS minipet_devices (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        disabled BOOLEAN NOT NULL DEFAULT false,
        quota_tokens BIGINT NOT NULL DEFAULT ${DEFAULT_DEVICE_QUOTA_TOKENS},
        used_tokens BIGINT NOT NULL DEFAULT 0,
        app_version TEXT,
        platform TEXT
      );
      CREATE TABLE IF NOT EXISTS minipet_usage_events (
        id BIGSERIAL PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES minipet_devices(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        model TEXT NOT NULL,
        upstream_status INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS minipet_usage_device_created_idx ON minipet_usage_events(device_id, created_at DESC);
    `);
  }

  async upsertDevice(input: { id: string; appVersion?: string; platform?: string }): Promise<DeviceRecord> {
    const result = await this.pool.query(
      `
        INSERT INTO minipet_devices (id, app_version, platform)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          last_seen_at = now(),
          app_version = COALESCE(EXCLUDED.app_version, minipet_devices.app_version),
          platform = COALESCE(EXCLUDED.platform, minipet_devices.platform)
        RETURNING *
      `,
      [input.id, input.appVersion, input.platform]
    );
    return rowToDevice(result.rows[0]);
  }

  async getDevice(id: string): Promise<DeviceRecord | undefined> {
    const result = await this.pool.query("SELECT * FROM minipet_devices WHERE id = $1", [id]);
    return result.rows[0] ? rowToDevice(result.rows[0]) : undefined;
  }

  async listDevices(): Promise<DeviceRecord[]> {
    const result = await this.pool.query("SELECT * FROM minipet_devices ORDER BY last_seen_at DESC LIMIT 500");
    return result.rows.map(rowToDevice);
  }

  async updateDevice(id: string, patch: { quotaTokens?: number; disabled?: boolean }): Promise<DeviceRecord | undefined> {
    const current = await this.getDevice(id);
    if (!current) return undefined;
    const result = await this.pool.query(
      "UPDATE minipet_devices SET quota_tokens = $2, disabled = $3 WHERE id = $1 RETURNING *",
      [id, patch.quotaTokens ?? current.quotaTokens, patch.disabled ?? current.disabled]
    );
    return rowToDevice(result.rows[0]);
  }

  async recordUsage(input: Omit<UsageRecord, "id" | "createdAt">): Promise<UsageRecord> {
    const result = await this.pool.query(
      `
        INSERT INTO minipet_usage_events (device_id, prompt_tokens, completion_tokens, total_tokens, model, upstream_status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [input.deviceId, input.promptTokens, input.completionTokens, input.totalTokens, input.model, input.upstreamStatus]
    );
    await this.pool.query("UPDATE minipet_devices SET used_tokens = used_tokens + $2, last_seen_at = now() WHERE id = $1", [input.deviceId, input.totalTokens]);
    return rowToUsage(result.rows[0]);
  }

  async getUsageSummary(): Promise<UsageSummary> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*)::int AS total_devices,
        COUNT(*) FILTER (WHERE disabled)::int AS disabled_devices,
        COALESCE(SUM(quota_tokens), 0)::bigint AS total_quota_tokens,
        COALESCE(SUM(used_tokens), 0)::bigint AS total_used_tokens
      FROM minipet_devices
    `);
    const row = result.rows[0];
    return {
      totalDevices: Number(row.total_devices),
      disabledDevices: Number(row.disabled_devices),
      totalQuotaTokens: Number(row.total_quota_tokens),
      totalUsedTokens: Number(row.total_used_tokens)
    };
  }
}

export function createStore(input: { databaseUrl?: string; dataDir: string }): MiniPetStore {
  if (input.databaseUrl) return new PostgresMiniPetStore(input.databaseUrl);
  return new FileMiniPetStore(path.join(input.dataDir, "store.json"));
}

function summarizeDevices(devices: DeviceRecord[]): UsageSummary {
  return {
    totalDevices: devices.length,
    disabledDevices: devices.filter((device) => device.disabled).length,
    totalQuotaTokens: devices.reduce((sum, device) => sum + device.quotaTokens, 0),
    totalUsedTokens: devices.reduce((sum, device) => sum + device.usedTokens, 0)
  };
}

function rowToDevice(row: Record<string, unknown>): DeviceRecord {
  return {
    id: String(row.id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastSeenAt: new Date(String(row.last_seen_at)).toISOString(),
    disabled: Boolean(row.disabled),
    quotaTokens: Number(row.quota_tokens),
    usedTokens: Number(row.used_tokens),
    appVersion: row.app_version ? String(row.app_version) : undefined,
    platform: row.platform ? String(row.platform) : undefined
  };
}

function rowToUsage(row: Record<string, unknown>): UsageRecord {
  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    promptTokens: Number(row.prompt_tokens),
    completionTokens: Number(row.completion_tokens),
    totalTokens: Number(row.total_tokens),
    model: String(row.model),
    upstreamStatus: Number(row.upstream_status)
  };
}
