import { startWorkerRuntime } from "./runtime.mjs";

const runtime = await startWorkerRuntime();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    process.stdout.write(`[worker] received ${signal}, shutting down\n`);
    await runtime.close();
    process.exit(0);
  });
}
