import "dotenv/config";
import { AccountManager } from "./account-manager.js";
import { log } from "./log.js";

const manager = new AccountManager();
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("Stopping", { signal });
  await manager.stop();
  process.exit(0);
}
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
manager.start().catch((error) => {
  log("Startup failed", {
    error: error instanceof Error ? error.message : "Unknown failure",
  });
  process.exit(1);
});
