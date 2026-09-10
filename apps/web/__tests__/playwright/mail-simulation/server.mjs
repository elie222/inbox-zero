import { createServer } from "node:net";
import { createEmulator } from "emulate";
import { createQuotaProxy } from "./quota-proxy.mjs";

const port = Number(process.argv[2]);
const email = process.env.PLAYWRIGHT_TEST_EMAIL;
if (!email || !port)
  throw new Error("Simulation requires a port and PLAYWRIGHT_TEST_EMAIL");
const messages = [];
for (let thread = 0; thread < 1000; thread++) {
  const count = thread === 2 ? 150 : thread % 10 === 0 ? 8 : 1;
  for (let message = 0; message < count; message++) {
    const marker = `Simulation body ${thread} message ${message}`;
    messages.push({
      id: `sim_${thread}_${message}`,
      thread_id: `sim_thread_${thread}`,
      user_email: email,
      from: "sender@example.com",
      to: email,
      subject: `Simulation thread ${String(thread).padStart(4, "0")}`,
      body_text: marker,
      body_html: `<p>${marker}</p>${thread === 4 ? "<p>Large newsletter paragraph with a synthetic update.</p>".repeat(15_000) : ""}`,
      label_ids: ["INBOX", ...(thread % 2 === 0 ? ["UNREAD"] : [])],
      internal_date: String(
        Date.now() - thread * 60_000 - (count - message) * 100,
      ),
    });
  }
}
const allocator = createServer();
await new Promise((resolve) => allocator.listen(0, "127.0.0.1", resolve));
const upstreamPort = allocator.address().port;
await new Promise((resolve) => allocator.close(resolve));
const emulator = await createEmulator({
  service: "google",
  port: upstreamPort,
  baseUrl: `http://127.0.0.1:${port}`,
  seed: {
    google: {
      users: [{ email, name: "Simulation User" }],
      oauth_clients: [
        {
          client_id: "client_id",
          client_secret: "client_secret",
          redirect_uris: [
            new URL(
              "/api/auth/oauth2/callback/google",
              process.env.NEXT_PUBLIC_BASE_URL,
            ).href,
          ],
        },
      ],
      messages,
    },
  },
});
const proxy = await createQuotaProxy({
  upstream: `http://127.0.0.1:${upstreamPort}`,
  port,
  options: { latencyMs: 0, concurrency: 100, bytesPerSecond: 100_000_000 },
});
console.log(
  `Mail simulation ready at ${proxy.url}; ${messages.length} synthetic messages`,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    const deadline = setTimeout(() => process.exit(0), 5000);
    deadline.unref();
    for (const close of [() => proxy.close(), () => emulator.close()]) {
      try {
        await close();
      } catch (error) {
        console.error("Simulation shutdown failed", error);
      }
    }
    process.exit(0);
  });
