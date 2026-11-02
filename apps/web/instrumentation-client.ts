// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { env } from "@/env";
import { beforeSend, beforeSendTransaction } from "@/utils/sentry-scrub";
import { installStaleDeploymentReload } from "@/utils/stale-deployment";
import {
  canUseTrackingCookies,
  subscribeToCookieConsent,
} from "@/utils/cookie-consent";

const REPLAY_SESSION_SAMPLE_RATE = 0.1;

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Errors thrown by browser extensions, link scanners, and injected scripts.
  // Errors from browser extensions, in-app browsers, and ad blockers stopping
  // third-party trackers. None of them come from our code.
  ignoreErrors: [
    /Object Not Found Matching Id:\d+, MethodName:\w+/,
    /__firefox__/,
    /window\.webkit\.messageHandlers/,
    /Script message handler is unavailable/,
    /Invalid call to runtime\.sendMessage\(\)/,
    /MetaMask/,
    /Unlock Shield to use a DApp/,
    /Talisman extension has not been configured/,
    /Failed to fetch \((?:[\w-]+\.)*(?:doubleclick\.net|google-analytics\.com|analytics\.google\.com|googletagmanager\.com|facebook\.com)\)/,
  ],
  denyUrls: [
    /\/executors\/\d+\.js/,
    /^(?:chrome|moz|safari|safari-web)-extension:\/\//,
  ],

  // Redact PII/secrets before sending to Sentry (third party).
  beforeSend,
  beforeSendTransaction,

  // Session replay stores data in the browser, so it waits for cookie consent
  // where that is required.
  replaysOnErrorSampleRate: canUseTrackingCookies() ? 1.0 : 0,
  replaysSessionSampleRate: canUseTrackingCookies()
    ? REPLAY_SESSION_SAMPLE_RATE
    : 0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

if (!canUseTrackingCookies()) {
  const unsubscribe = subscribeToCookieConsent(() => {
    if (!canUseTrackingCookies()) return;

    unsubscribe();
    // Mirrors the sampling Sentry applies when consent exists at page load:
    // some sessions are recorded in full, the rest only around errors.
    const replay = Sentry.getReplay();
    if (Math.random() < REPLAY_SESSION_SAMPLE_RATE) replay?.start();
    else replay?.startBuffering();
  });
}

installStaleDeploymentReload();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
