/**
 * Runs the Stripe emulator as a standalone server so the app can be pointed at
 * it during Playwright runs and local development:
 *
 *   pnpm emulate:stripe
 *   # then in .env.local
 *   STRIPE_API_BASE_URL=http://127.0.0.1:4005
 *   STRIPE_SECRET_KEY=emulator-stripe-key
 *   STRIPE_WEBHOOK_SECRET=whsec_emulator
 *
 * Checkout is completed from the browser on the emulator's own hosted page.
 * Trials are driven from the console: `list` shows subscriptions, and
 * `end-trial <subscriptionId> paid|failed` ends one the way Stripe does.
 */
import { createInterface } from "node:readline";
import { createStripeEmulator } from "../__tests__/emulators/stripe";

const PORT = Number(
  process.env.STRIPE_EMULATOR_PORT ?? process.argv[2] ?? 4005,
);
const WEBHOOK_URL =
  process.env.STRIPE_EMULATOR_WEBHOOK_URL ??
  "http://localhost:3000/api/stripe/webhook";

const USAGE = "Commands: end-trial <subscriptionId> paid|failed | reset";

async function main() {
  const emulator = await createStripeEmulator({
    port: PORT,
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    webhookUrl: WEBHOOK_URL,
  });

  console.log(`Stripe emulator listening on ${emulator.url}`);
  console.log(`  STRIPE_API_BASE_URL=${emulator.url}`);
  console.log(`  webhooks -> ${WEBHOOK_URL}`);
  // The key and webhook secret are never printed: they are whatever the
  // environment supplied, and this output reaches CI logs. The defaults are
  // documented at the top of this file.
  console.log(`\n${USAGE}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  rl.on("line", (line) => {
    const [command, subscriptionId, outcome] = line.trim().split(/\s+/);

    if (command === "reset") {
      emulator.reset();
      console.log("Emulator state cleared");
      return;
    }

    if (
      command === "end-trial" &&
      subscriptionId &&
      (outcome === "paid" || outcome === "failed")
    ) {
      emulator
        .endTrial(subscriptionId, outcome)
        .then(() =>
          console.log(`Trial ended for ${subscriptionId} (${outcome})`),
        )
        .catch((error) => console.error(error));
      return;
    }

    console.log(USAGE);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      await emulator.close();
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error("Failed to start the Stripe emulator", error);
  process.exit(1);
});
