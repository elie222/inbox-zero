/* eslint-disable no-process-env */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const isDev = process.env.NODE_ENV === "development";

    // sentry init - reduce sampling in dev for performance
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      // lower sampling in dev to reduce overhead
      tracesSampleRate: isDev ? 0.1 : 1,
      debug: false,
      // disable in dev unless explicitly enabled
      enabled: !isDev || process.env.SENTRY_ENABLED === "true",
    });

    // plugin runtime initialization
    // in dev mode, defer initialization to first use for faster startup
    if (isDev) {
      // lazy init - plugins load on first hook execution
    } else {
      // production - initialize immediately for predictable behavior
      const { pluginRuntime } = await import("@/lib/plugin-runtime/runtime");
      await pluginRuntime.initialize();
    }
  }

  // edge runtime sentry init
  if (process.env.NEXT_RUNTIME === "edge") {
    const isDev = process.env.NODE_ENV === "development";
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: isDev ? 0.1 : 1,
      debug: false,
      enabled: !isDev || process.env.SENTRY_ENABLED === "true",
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
