/* eslint-disable no-process-env */
import * as Sentry from "@sentry/nextjs";

declare global {
  // Flag to avoid starting workers multiple times in dev hot-reload
  // eslint-disable-next-line no-var
  var __inboxZeroWorkersStarted: boolean | undefined;
}

export function startBullMQWorkers() {
  // Avoid duplicate starts during hot reloads
  if (!globalThis.__inboxZeroWorkersStarted) {
    globalThis.__inboxZeroWorkersStarted = true;

    // Defer heavy imports until after env is available
    import("@/env")
      .then(async ({ env }) => {
        if (env.QUEUE_SYSTEM !== "redis") return;

        try {
          const [{ registerWorker }, { QUEUE_HANDLERS }] = await Promise.all([
            import("@/utils/queue/worker"),
            import("@/utils/queue/queues"),
          ]);

          const entries = Object.entries(QUEUE_HANDLERS) as Array<
            [string, (data: unknown) => Promise<unknown>]
          >;
          for (const [queueName, handler] of entries) {
            registerWorker(queueName, async (job: unknown) => {
              try {
                const data = (job as { data: unknown }).data;
                await handler(data);
              } catch (error) {
                throw error instanceof Error ? error : new Error(String(error));
              }
            });
          }
        } catch {
          // Worker registration errors are logged by the worker module
        }
      })
      .catch((error) => {
        // biome-ignore lint/suspicious/noConsole: Required during startup before logger is available
        console.error(
          "[instrumentation] Failed to load environment variables during worker initialization",
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        );
        // biome-ignore lint/suspicious/noConsole: Required during startup before logger is available
        console.error(
          "[instrumentation] This usually indicates invalid or missing environment variables. Exiting process.",
        );
        process.exit(1);
      });
  }
}

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // this is your Sentry.init call from `sentry.server.config.js|ts`
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1,
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
      // uncomment the line below to enable Spotlight (https://spotlightjs.com)
      // spotlight: process.env.NODE_ENV === 'development',
    });

    // Start BullMQ workers inside the Next.js server process when enabled
    // Can be enabled via ENABLE_WORKER_QUEUES=true or automatically in development mode
    if (
      process.env.NODE_ENV === "development" &&
      process.env.ENABLE_WORKER_QUEUES === "true"
    ) {
      startBullMQWorkers();
    }
  }

  // This is your Sentry.init call from `sentry.edge.config.js|ts`
  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1,
      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
