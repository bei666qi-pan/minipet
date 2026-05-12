import { loadBackendConfig, missingProductionConfig } from "./config";
import { createBackendServer } from "./server";

async function main(): Promise<void> {
  const config = loadBackendConfig();
  const missing = missingProductionConfig(config);
  if (config.nodeEnv === "production" && !config.jwtSecret) {
    throw new Error("JWT_SECRET is required in production");
  }
  if (config.nodeEnv === "production" && missing.length > 0) {
    console.warn("MiniPet backend missing recommended production config:", missing.join(", "));
  }
  const server = await createBackendServer(config);
  await server.ready;
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`MiniPet backend listening on ${config.port}`);
  });
}

void main().catch((error) => {
  console.error("MiniPet backend failed to start", error instanceof Error ? error.message : "unknown_error");
  process.exit(1);
});
