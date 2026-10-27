import Redis from "ioredis";
import { createRedisHttpServer } from "./local-dev/redis-http";

async function main() {
  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 2 });
  await redis.ping();
  const server = await createRedisHttpServer({
    redis,
    token: process.env.REDIS_HTTP_TOKEN!,
    port: 8079,
  });
  console.log(`[Redis HTTP] Ready at ${server.url}`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      await server.close();
      redis.disconnect();
    });
  }
}

main().catch(() => {
  console.error("Redis HTTP startup failed");
  process.exitCode = 1;
});
