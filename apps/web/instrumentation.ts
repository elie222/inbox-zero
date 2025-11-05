/* eslint-disable no-process-env */
import * as Sentry from "@sentry/nextjs";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // this is your Sentry.init call from `sentry.server.config.js|ts`
    if (
      process.env.NEXT_PUBLIC_SENTRY_DSN &&
      process.env.NEXT_PUBLIC_PRIVACY_MODE !== "true"
    ) {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 1,
        debug: false,
      });
    }
  }

  // This is your Sentry.init call from `sentry.edge.config.js|ts`
  if (process.env.NEXT_RUNTIME === "edge") {
    if (
      process.env.NEXT_PUBLIC_SENTRY_DSN &&
      process.env.NEXT_PUBLIC_PRIVACY_MODE !== "true"
    ) {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 1,
        debug: false,
      });
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
