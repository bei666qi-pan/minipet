import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
import { DEFAULT_DEVICE_QUOTA_TOKENS } from "./config";

export type UserStatus = "active" | "disabled";

export interface UserRecord {
  id: string;
  deviceId: string;
  displayName: string;
  plan: string;
  status: UserStatus;
  quotaTotalTokens: number;
  quotaUsedTokens: number;
  quotaPeriodStart: string;
  quotaPeriodEnd: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface UsageLogRecord {
  id: string;
  userId: string;
  requestId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  status: string;
  estimated: boolean;
  createdAt: string;
}

export interface AdminUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: string;
}

export interface ReleaseManifestRecord {
  id: string;
  version: string;
  channel: string;
  installerUrl: string;
  portableUrl?: string;
  sha256?: string;
  size?: number;
  notes: string;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  target: string;
  metadataJson: string;
  createdAt: string;
}

export interface OverviewRecord {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  totalQuotaTokens: number;
  totalUsedTokens: number;
  totalRequests: number;
  todayNewUsers: number;
  todayRequests: number;
  todayTokens: number;
  recentErrors: UsageLogRecord[];
}

export interface MiniPetStore {
  init(): Promise<void>;
  bootstrapUser(input: { deviceId: string; displayName?: string }): Promise<UserRecord>;
  getUser(id: string): Promise<UserRecord | undefined>;
  listUsers(limit?: number): Promise<UserRecord[]>;
  updateUserQuota(id: string, quotaTotalTokens: number): Promise<UserRecord | undefined>;
  resetUserMonthlyUsage(id: string): Promise<UserRecord | undefined>;
  updateUserStatus(id: string, status: UserStatus): Promise<UserRecord | undefined>;
  overview(): Promise<OverviewRecord>;
  recordUsage(input: Omit<UsageLogRecord, "id" | "createdAt">): Promise<UsageLogRecord>;
  countUsageSince(userId: string, since: Date): Promise<number>;
  listUsage(limit?: number): Promise<UsageLogRecord[]>;
  getAdminByEmail(email: string): Promise<AdminUserRecord | undefined>;
  upsertAdmin(input: { email: string; passwordHash: string; role: string }): Promise<AdminUserRecord>;
  listReleases(): Promise<ReleaseManifestRecord[]>;
  latestRelease(channel: string): Promise<ReleaseManifestRecord | undefined>;
  createRelease(input: Omit<ReleaseManifestRecord, "id" | "createdAt">): Promise<ReleaseManifestRecord>;
  addAuditLog(input: Omit<AuditLogRecord, "id" | "createdAt">): Promise<AuditLogRecord>;
  listAuditLogs(limit?: number): Promise<AuditLogRecord[]>;
}

export function createStore(input: { databaseUrl?: string; dataDir: string }): MiniPetStore {
  if (input.databaseUrl) return new PostgresMiniPetStore(input.databaseUrl);
  fs.mkdirSync(input.dataDir, { recursive: true });
  return new SqliteMiniPetStore(path.join(input.dataDir, "minipet.sqlite"));
}

class SqliteMiniPetStore implements MiniPetStore {
  private readonly db: DatabaseSync;

  constructor(filePath: string) {
    this.db = new DatabaseSync(filePath);
  }

  async init(): Promise<void> {
    this.db.exec(SCHEMA_SQLITE);
  }

  async bootstrapUser(input: { deviceId: string; displayName?: string }): Promise<UserRecord> {
    const found = await this.getUserByDevice(input.deviceId);
    const now = new Date().toISOString();
    if (found) {
      const current = await this.resetIfExpired(found);
      this.db.prepare("UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?").run(now, now, current.id);
      return (await this.getUser(current.id))!;
    }
    const id = newId("usr");
    const [start, end] = currentPeriod();
    this.db
      .prepare(
        `INSERT INTO users (id, device_id, display_name, plan, status, quota_total_tokens, quota_used_tokens, quota_period_start, quota_period_end, created_at, updated_at, last_seen_at)
         VALUES (?, ?, ?, 'free', 'active', ?, 0, ?, ?, ?, ?, ?)`
      )
      .run(id, input.deviceId, input.displayName || "匿名设备", DEFAULT_DEVICE_QUOTA_TOKENS, start, end, now, now, now);
    return (await this.getUser(id))!;
  }

  async getUser(id: string): Promise<UserRecord | undefined> {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
    return row ? this.resetIfExpired(rowToUser(row)) : undefined;
  }

  async listUsers(limit = 200): Promise<UserRecord[]> {
    const rows = this.db.prepare("SELECT * FROM users ORDER BY last_seen_at DESC LIMIT ?").all(limit) as Row[];
    const users: UserRecord[] = [];
    for (const row of rows) users.push(await this.resetIfExpired(rowToUser(row)));
    return users;
  }

  async updateUserQuota(id: string, quotaTotalTokens: number): Promise<UserRecord | undefined> {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE users SET quota_total_tokens = ?, updated_at = ? WHERE id = ?").run(Math.max(0, Math.floor(quotaTotalTokens)), now, id);
    return this.getUser(id);
  }

  async resetUserMonthlyUsage(id: string): Promise<UserRecord | undefined> {
    const now = new Date().toISOString();
    const [start, end] = currentPeriod();
    this.db.prepare("UPDATE users SET quota_used_tokens = 0, quota_period_start = ?, quota_period_end = ?, updated_at = ? WHERE id = ?").run(start, end, now, id);
    return this.getUser(id);
  }

  async updateUserStatus(id: string, status: UserStatus): Promise<UserRecord | undefined> {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
    return this.getUser(id);
  }

  async overview(): Promise<OverviewRecord> {
    const since = startOfTodayIso();
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_users,
        SUM(CASE WHEN status = 'disabled' THEN 1 ELSE 0 END) AS disabled_users,
        COALESCE(SUM(quota_total_tokens), 0) AS total_quota_tokens,
        COALESCE(SUM(quota_used_tokens), 0) AS total_used_tokens,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today_new_users
      FROM users
    `).get(since) as Row;
    const usage = this.db.prepare(`
      SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today_requests,
        COALESCE(SUM(CASE WHEN created_at >= ? THEN total_tokens ELSE 0 END), 0) AS today_tokens
      FROM usage_logs
    `).get(since, since) as Row;
    const recentErrors = (this.db.prepare("SELECT * FROM usage_logs WHERE status != 'success' ORDER BY created_at DESC LIMIT 10").all() as Row[]).map(rowToUsage);
    return rowToOverview({ ...row, ...usage }, recentErrors);
  }

  async recordUsage(input: Omit<UsageLogRecord, "id" | "createdAt">): Promise<UsageLogRecord> {
    const id = newId("use");
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO usage_logs (id, user_id, request_id, provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, status, estimated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.userId, input.requestId, input.provider, input.model, input.promptTokens, input.completionTokens, input.totalTokens, input.estimatedCost, input.status, input.estimated ? 1 : 0, createdAt);
    if (input.status === "success") {
      this.db.prepare("UPDATE users SET quota_used_tokens = quota_used_tokens + ?, updated_at = ?, last_seen_at = ? WHERE id = ?").run(input.totalTokens, createdAt, createdAt, input.userId);
    }
    const row = this.db.prepare("SELECT * FROM usage_logs WHERE id = ?").get(id) as Row | undefined;
    return row ? rowToUsage(row) : { ...input, id, createdAt };
  }

  async countUsageSince(userId: string, since: Date): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM usage_logs WHERE user_id = ? AND created_at >= ?").get(userId, since.toISOString()) as Row;
    return Number(row.count || 0);
  }

  async listUsage(limit = 500): Promise<UsageLogRecord[]> {
    return (this.db.prepare("SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT ?").all(limit) as Row[]).map(rowToUsage);
  }

  async getAdminByEmail(email: string): Promise<AdminUserRecord | undefined> {
    const row = this.db.prepare("SELECT * FROM admin_users WHERE email = ?").get(email) as Row | undefined;
    return row ? rowToAdmin(row) : undefined;
  }

  async upsertAdmin(input: { email: string; passwordHash: string; role: string }): Promise<AdminUserRecord> {
    const found = await this.getAdminByEmail(input.email);
    if (found) {
      this.db.prepare("UPDATE admin_users SET password_hash = ?, role = ? WHERE id = ?").run(input.passwordHash, input.role, found.id);
      return (await this.getAdminByEmail(input.email))!;
    }
    const id = newId("adm");
    this.db.prepare("INSERT INTO admin_users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)").run(id, input.email, input.passwordHash, input.role, new Date().toISOString());
    return (await this.getAdminByEmail(input.email))!;
  }

  async listReleases(): Promise<ReleaseManifestRecord[]> {
    return (this.db.prepare("SELECT * FROM release_manifests ORDER BY created_at DESC").all() as Row[]).map(rowToRelease);
  }

  async latestRelease(channel: string): Promise<ReleaseManifestRecord | undefined> {
    const row = this.db.prepare("SELECT * FROM release_manifests WHERE channel = ? ORDER BY created_at DESC LIMIT 1").get(channel) as Row | undefined;
    return row ? rowToRelease(row) : undefined;
  }

  async createRelease(input: Omit<ReleaseManifestRecord, "id" | "createdAt">): Promise<ReleaseManifestRecord> {
    const id = newId("rel");
    const createdAt = new Date().toISOString();
    this.db
      .prepare("INSERT INTO release_manifests (id, version, channel, installer_url, portable_url, sha256, size, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.version, input.channel, input.installerUrl, input.portableUrl || null, input.sha256 || null, input.size || null, input.notes, createdAt);
    return rowToRelease(this.db.prepare("SELECT * FROM release_manifests WHERE id = ?").get(id) as Row);
  }

  async addAuditLog(input: Omit<AuditLogRecord, "id" | "createdAt">): Promise<AuditLogRecord> {
    const id = newId("aud");
    const createdAt = new Date().toISOString();
    this.db.prepare("INSERT INTO audit_logs (id, actor_type, actor_id, action, target, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, input.actorType, input.actorId, input.action, input.target, input.metadataJson, createdAt);
    return rowToAudit(this.db.prepare("SELECT * FROM audit_logs WHERE id = ?").get(id) as Row);
  }

  async listAuditLogs(limit = 500): Promise<AuditLogRecord[]> {
    return (this.db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?").all(limit) as Row[]).map(rowToAudit);
  }

  private async getUserByDevice(deviceId: string): Promise<UserRecord | undefined> {
    const row = this.db.prepare("SELECT * FROM users WHERE device_id = ?").get(deviceId) as Row | undefined;
    return row ? rowToUser(row) : undefined;
  }

  private async resetIfExpired(user: UserRecord): Promise<UserRecord> {
    if (new Date(user.quotaPeriodEnd).getTime() > Date.now()) return user;
    const [start, end] = currentPeriod();
    const now = new Date().toISOString();
    this.db.prepare("UPDATE users SET quota_used_tokens = 0, quota_period_start = ?, quota_period_end = ?, updated_at = ? WHERE id = ?").run(start, end, now, user.id);
    return (await this.getUser(user.id))!;
  }
}

class PostgresMiniPetStore implements MiniPetStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA_POSTGRES);
  }

  async bootstrapUser(input: { deviceId: string; displayName?: string }): Promise<UserRecord> {
    const id = newId("usr");
    const [start, end] = currentPeriod();
    const result = await this.pool.query(
      `INSERT INTO users (id, device_id, display_name, plan, status, quota_total_tokens, quota_used_tokens, quota_period_start, quota_period_end)
       VALUES ($1, $2, $3, 'free', 'active', $4, 0, $5, $6)
       ON CONFLICT (device_id) DO UPDATE SET last_seen_at = now(), updated_at = now()
       RETURNING *`,
      [id, input.deviceId, input.displayName || "匿名设备", DEFAULT_DEVICE_QUOTA_TOKENS, start, end]
    );
    return this.resetIfExpired(rowToUser(result.rows[0]));
  }

  async getUser(id: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0] ? this.resetIfExpired(rowToUser(result.rows[0])) : undefined;
  }

  async listUsers(limit = 200): Promise<UserRecord[]> {
    const result = await this.pool.query("SELECT * FROM users ORDER BY last_seen_at DESC LIMIT $1", [limit]);
    return Promise.all(result.rows.map((row) => this.resetIfExpired(rowToUser(row))));
  }

  async updateUserQuota(id: string, quotaTotalTokens: number): Promise<UserRecord | undefined> {
    const result = await this.pool.query("UPDATE users SET quota_total_tokens = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, Math.max(0, Math.floor(quotaTotalTokens))]);
    return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
  }

  async resetUserMonthlyUsage(id: string): Promise<UserRecord | undefined> {
    const [start, end] = currentPeriod();
    const result = await this.pool.query(
      "UPDATE users SET quota_used_tokens = 0, quota_period_start = $2, quota_period_end = $3, updated_at = now() WHERE id = $1 RETURNING *",
      [id, start, end]
    );
    return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
  }

  async updateUserStatus(id: string, status: UserStatus): Promise<UserRecord | undefined> {
    const result = await this.pool.query("UPDATE users SET status = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, status]);
    return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
  }

  async overview(): Promise<OverviewRecord> {
    const since = startOfTodayIso();
    const result = await this.pool.query(`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_users,
        COUNT(*) FILTER (WHERE status = 'disabled')::int AS disabled_users,
        COALESCE(SUM(quota_total_tokens), 0)::bigint AS total_quota_tokens,
        COALESCE(SUM(quota_used_tokens), 0)::bigint AS total_used_tokens,
        COUNT(*) FILTER (WHERE created_at >= $1)::int AS today_new_users,
        (SELECT COUNT(*)::int FROM usage_logs) AS total_requests,
        (SELECT COUNT(*)::int FROM usage_logs WHERE created_at >= $1) AS today_requests,
        (SELECT COALESCE(SUM(total_tokens), 0)::bigint FROM usage_logs WHERE created_at >= $1) AS today_tokens
      FROM users
    `, [since]);
    const recentErrors = await this.pool.query("SELECT * FROM usage_logs WHERE status != 'success' ORDER BY created_at DESC LIMIT 10");
    return rowToOverview(result.rows[0], recentErrors.rows.map(rowToUsage));
  }

  async recordUsage(input: Omit<UsageLogRecord, "id" | "createdAt">): Promise<UsageLogRecord> {
    const id = newId("use");
    const result = await this.pool.query(
      `INSERT INTO usage_logs (id, user_id, request_id, provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, status, estimated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, input.userId, input.requestId, input.provider, input.model, input.promptTokens, input.completionTokens, input.totalTokens, input.estimatedCost, input.status, input.estimated]
    );
    if (input.status === "success") {
      await this.pool.query("UPDATE users SET quota_used_tokens = quota_used_tokens + $2, updated_at = now(), last_seen_at = now() WHERE id = $1", [input.userId, input.totalTokens]);
    }
    return rowToUsage(result.rows[0]);
  }

  async countUsageSince(userId: string, since: Date): Promise<number> {
    const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM usage_logs WHERE user_id = $1 AND created_at >= $2", [userId, since.toISOString()]);
    return Number(result.rows[0]?.count || 0);
  }

  async listUsage(limit = 500): Promise<UsageLogRecord[]> {
    const result = await this.pool.query("SELECT * FROM usage_logs ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map(rowToUsage);
  }

  async getAdminByEmail(email: string): Promise<AdminUserRecord | undefined> {
    const result = await this.pool.query("SELECT * FROM admin_users WHERE email = $1", [email]);
    return result.rows[0] ? rowToAdmin(result.rows[0]) : undefined;
  }

  async upsertAdmin(input: { email: string; passwordHash: string; role: string }): Promise<AdminUserRecord> {
    const result = await this.pool.query(
      `INSERT INTO admin_users (id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
       RETURNING *`,
      [newId("adm"), input.email, input.passwordHash, input.role]
    );
    return rowToAdmin(result.rows[0]);
  }

  async listReleases(): Promise<ReleaseManifestRecord[]> {
    const result = await this.pool.query("SELECT * FROM release_manifests ORDER BY created_at DESC");
    return result.rows.map(rowToRelease);
  }

  async latestRelease(channel: string): Promise<ReleaseManifestRecord | undefined> {
    const result = await this.pool.query("SELECT * FROM release_manifests WHERE channel = $1 ORDER BY created_at DESC LIMIT 1", [channel]);
    return result.rows[0] ? rowToRelease(result.rows[0]) : undefined;
  }

  async createRelease(input: Omit<ReleaseManifestRecord, "id" | "createdAt">): Promise<ReleaseManifestRecord> {
    const result = await this.pool.query(
      `INSERT INTO release_manifests (id, version, channel, installer_url, portable_url, sha256, size, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [newId("rel"), input.version, input.channel, input.installerUrl, input.portableUrl, input.sha256, input.size, input.notes]
    );
    return rowToRelease(result.rows[0]);
  }

  async addAuditLog(input: Omit<AuditLogRecord, "id" | "createdAt">): Promise<AuditLogRecord> {
    const result = await this.pool.query(
      "INSERT INTO audit_logs (id, actor_type, actor_id, action, target, metadata_json) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [newId("aud"), input.actorType, input.actorId, input.action, input.target, input.metadataJson]
    );
    return rowToAudit(result.rows[0]);
  }

  async listAuditLogs(limit = 500): Promise<AuditLogRecord[]> {
    const result = await this.pool.query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map(rowToAudit);
  }

  private async resetIfExpired(user: UserRecord): Promise<UserRecord> {
    if (new Date(user.quotaPeriodEnd).getTime() > Date.now()) return user;
    const [start, end] = currentPeriod();
    const result = await this.pool.query(
      "UPDATE users SET quota_used_tokens = 0, quota_period_start = $2, quota_period_end = $3, updated_at = now() WHERE id = $1 RETURNING *",
      [user.id, start, end]
    );
    return rowToUser(result.rows[0]);
  }
}

type Row = Record<string, unknown>;

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  quota_total_tokens INTEGER NOT NULL,
  quota_used_tokens INTEGER NOT NULL,
  quota_period_start TEXT NOT NULL,
  quota_period_end TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  estimated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS release_manifests (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  channel TEXT NOT NULL,
  installer_url TEXT NOT NULL,
  portable_url TEXT,
  sha256 TEXT,
  size INTEGER,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS usage_logs_user_created_idx ON usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
`;

const SCHEMA_POSTGRES = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  quota_total_tokens BIGINT NOT NULL,
  quota_used_tokens BIGINT NOT NULL,
  quota_period_start TIMESTAMPTZ NOT NULL,
  quota_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  estimated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS release_manifests (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  channel TEXT NOT NULL,
  installer_url TEXT NOT NULL,
  portable_url TEXT,
  sha256 TEXT,
  size BIGINT,
  notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_logs_user_created_idx ON usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
`;

function rowToUser(row: Row): UserRecord {
  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    displayName: String(row.display_name),
    plan: String(row.plan),
    status: String(row.status) === "disabled" ? "disabled" : "active",
    quotaTotalTokens: Number(row.quota_total_tokens),
    quotaUsedTokens: Number(row.quota_used_tokens),
    quotaPeriodStart: toIso(row.quota_period_start),
    quotaPeriodEnd: toIso(row.quota_period_end),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastSeenAt: toIso(row.last_seen_at)
  };
}

function rowToUsage(row: Row): UsageLogRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    requestId: String(row.request_id),
    provider: String(row.provider),
    model: String(row.model),
    promptTokens: Number(row.prompt_tokens),
    completionTokens: Number(row.completion_tokens),
    totalTokens: Number(row.total_tokens),
    estimatedCost: Number(row.estimated_cost),
    status: String(row.status),
    estimated: Boolean(row.estimated),
    createdAt: toIso(row.created_at)
  };
}

function rowToAdmin(row: Row): AdminUserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: String(row.role),
    createdAt: toIso(row.created_at)
  };
}

function rowToRelease(row: Row): ReleaseManifestRecord {
  return {
    id: String(row.id),
    version: String(row.version),
    channel: String(row.channel),
    installerUrl: String(row.installer_url),
    portableUrl: row.portable_url ? String(row.portable_url) : undefined,
    sha256: row.sha256 ? String(row.sha256) : undefined,
    size: row.size === null || row.size === undefined ? undefined : Number(row.size),
    notes: String(row.notes || ""),
    createdAt: toIso(row.created_at)
  };
}

function rowToAudit(row: Row): AuditLogRecord {
  return {
    id: String(row.id),
    actorType: String(row.actor_type),
    actorId: String(row.actor_id),
    action: String(row.action),
    target: String(row.target),
    metadataJson: String(row.metadata_json || "{}"),
    createdAt: toIso(row.created_at)
  };
}

function rowToOverview(row: Row, recentErrors: UsageLogRecord[] = []): OverviewRecord {
  return {
    totalUsers: Number(row.total_users || 0),
    activeUsers: Number(row.active_users || 0),
    disabledUsers: Number(row.disabled_users || 0),
    totalQuotaTokens: Number(row.total_quota_tokens || 0),
    totalUsedTokens: Number(row.total_used_tokens || 0),
    totalRequests: Number(row.total_requests || 0),
    todayNewUsers: Number(row.today_new_users || 0),
    todayRequests: Number(row.today_requests || 0),
    todayTokens: Number(row.today_tokens || 0),
    recentErrors
  };
}

function startOfTodayIso(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function currentPeriod(): [string, string] {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return [start.toISOString(), end.toISOString()];
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}
