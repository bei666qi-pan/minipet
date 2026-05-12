import { loadServerConfig, missingProductionConfig } from "./config";
import { createMiniPetServer } from "./server";

async function main(): Promise<void> {
  const config = loadServerConfig();
  const missing = missingProductionConfig(config);
  if (missing.length) {
    console.warn("minipet_config_missing", { keys: missing });
  }
  const server = await createMiniPetServer(config);
  server.listen(config.port, () => {
    console.log("minipet_server_ready", { port: config.port });
  });
}

void main().catch((error) => {
  console.error("minipet_server_failed", { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
