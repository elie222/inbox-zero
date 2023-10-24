import { env } from "@/env.mjs";

// https://baselime.io/docs/sending-data/opentelemetry/next.js/
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { BaselimeSDK, VercelPlugin, BetterHttpInstrumentation } =
      await import("@baselime/node-opentelemetry");

    const sdk = new BaselimeSDK({
      serverless: true,
      service: env.BASELIME_PROJECT_NAME,
      instrumentations: [
        new BetterHttpInstrumentation({
          plugins: [
            new VercelPlugin(), // Add the Vercel plugin to enable correlation between your logs and traces for projects deployed on Vercel
          ],
        }),
      ],
    });

    sdk.start();
  }
}
