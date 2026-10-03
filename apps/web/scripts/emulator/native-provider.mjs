import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createEmulator } from "emulate";

const [service, port, controlPort, filename] = process.argv.slice(2);
if (!["google", "microsoft"].includes(service))
  throw new Error("Native fixture provider must be Gmail or Graph");
const emulator = await createEmulator({
  service,
  port: Number(port),
  hostname: "127.0.0.1",
  baseUrl: `http://127.0.0.1:${port}`,
  seed: JSON.parse(readFileSync(filename, "utf8")),
});
const control = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/reset") {
    response.writeHead(404).end();
    return;
  }
  await emulator.reset();
  response.writeHead(200).end();
});
control.listen(Number(controlPort), "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await emulator.close();
    control.close(() => process.exit(0));
  });
}
