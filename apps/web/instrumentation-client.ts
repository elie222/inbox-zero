// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";
import { beforeSend, beforeSendTransaction } from "@/utils/sentry-scrub";
import { installStaleDeploymentReload } from "@/utils/stale-deployment";
import { canUseTrackingCookies } from "@/utils/cookie-consent";

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Redact PII/secrets before sending to Sentry (third party).
  beforeSend,
  beforeSendTransaction,

  // Session replay stores data in the browser, so it waits for cookie consent
  // where that is required.
  replaysOnErrorSampleRate: canUseTrackingCookies() ? 1.0 : 0,
  replaysSessionSampleRate: canUseTrackingCookies() ? 0.1 : 0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

installStaleDeploymentReload();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
