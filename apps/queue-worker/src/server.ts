import { env } from "./env";
import { buildServer } from "./http";

async function start() {
  const server = buildServer();
  try {
    await server.listen({ port: env.PORT, host: "0.0.0.0" });
    server.log.info(`Queue Worker listening on :${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start().catch((err) => {
  /* biome-ignore lint/suspicious/noConsole: fallback error log on boot failure */
  console.error(err);
  process.exit(1);
});
