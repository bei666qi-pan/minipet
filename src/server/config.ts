export interface ServerConfig {
  webOrigin: string;
  apiOrigin: string;
  downloadOrigin: string;
  newApiBaseUrl?: string;
  newApiKey?: string;
  newApiDefaultModel: string;
  databaseUrl?: string;
  jwtSecret?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminPasswordHash?: string;
  port: number;
  dataDir: string;
}

export const DEFAULT_DEVICE_QUOTA_TOKENS = 2_000_000;

export function loadServerConfig(env = process.env): ServerConfig {
  return {
    webOrigin: env.MINIPET_WEB_ORIGIN || "https://minipet.versecraft.cn",
    apiOrigin: env.MINIPET_API_ORIGIN || "https://api.minipet.versecraft.cn",
    downloadOrigin: env.MINIPET_DOWNLOAD_ORIGIN || "https://download.minipet.versecraft.cn",
    newApiBaseUrl: env.NEWAPI_BASE_URL || env.NEW_API_BASE_URL || env.OPENAI_BASE_URL,
    newApiKey: env.NEWAPI_API_KEY || env.NEW_API_KEY || env.OPENAI_API_KEY,
    newApiDefaultModel: env.NEWAPI_DEFAULT_MODEL || env.OPENAI_MODEL || "gpt-4o-mini",
    databaseUrl: env.DATABASE_URL || env.MINIPET_DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL,
    jwtSecret: env.JWT_SECRET || env.MINIPET_JWT_SECRET,
    adminEmail: env.ADMIN_EMAIL || env.MINIPET_ADMIN_EMAIL,
    adminPassword: env.ADMIN_PASSWORD || env.MINIPET_ADMIN_PASSWORD,
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || env.MINIPET_ADMIN_PASSWORD_HASH,
    port: Number(env.PORT || 8080),
    dataDir: env.MINIPET_DATA_DIR || ".runtime-data/server"
  };
}

export function missingProductionConfig(config: ServerConfig): string[] {
  const missing: string[] = [];
  if (!config.newApiBaseUrl) missing.push("NEWAPI_BASE_URL");
  if (!config.newApiKey) missing.push("NEWAPI_API_KEY");
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.jwtSecret) missing.push("JWT_SECRET");
  if (!config.adminEmail) missing.push("ADMIN_EMAIL");
  if (!config.adminPassword && !config.adminPasswordHash) missing.push("ADMIN_PASSWORD_HASH or ADMIN_PASSWORD");
  return missing;
}
