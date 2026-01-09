/**
 * Logging utilities for E2E flow tests
 *
 * Provides verbose logging for debugging test failures
 */

import { E2E_RUN_ID } from "../config";

// Track test start time for elapsed time logging
let testStartTimestamp: number | null = null;

export function setTestStartTime(): void {
  testStartTimestamp = Date.now();
}

function getElapsedTime(): string {
  if (!testStartTimestamp) return "";
  const elapsed = Date.now() - testStartTimestamp;
  return `+${(elapsed / 1000).toFixed(1)}s`;
}

interface WebhookPayload {
  timestamp: Date;
  provider: "google" | "microsoft";
  payload: unknown;
}

interface ApiCall {
  timestamp: Date;
  method: string;
  endpoint: string;
  request?: unknown;
  response?: unknown;
  duration: number;
}

// In-memory log storage for current test run
const webhookLog: WebhookPayload[] = [];
const apiCallLog: ApiCall[] = [];

/**
 * Log a webhook payload received during test
 */
export function logWebhook(
  provider: "google" | "microsoft",
  payload: unknown,
): void {
  const entry: WebhookPayload = {
    timestamp: new Date(),
    provider,
    payload,
  };
  webhookLog.push(entry);
  console.log(
    `[E2E-${E2E_RUN_ID}] Webhook received from ${provider}:`,
    JSON.stringify(payload, null, 2),
  );
}

/**
 * Log an API call made during test
 */
export function logApiCall(
  method: string,
  endpoint: string,
  request: unknown,
  response: unknown,
  duration: number,
): void {
  const entry: ApiCall = {
    timestamp: new Date(),
    method,
    endpoint,
    request,
    response,
    duration,
  };
  apiCallLog.push(entry);

  // Only log detailed info in verbose mode
  if (process.env.E2E_VERBOSE === "true") {
    console.log(
      `[E2E-${E2E_RUN_ID}] API ${method} ${endpoint} (${duration}ms)`,
    );
  }
}

/**
 * Get all webhook payloads logged during current test
 */
export function getWebhookLog(): WebhookPayload[] {
  return [...webhookLog];
}

/**
 * Get all API calls logged during current test
 */
export function getApiCallLog(): ApiCall[] {
  return [...apiCallLog];
}

/**
 * Clear all logs (call between tests)
 */
export function clearLogs(): void {
  webhookLog.length = 0;
  apiCallLog.length = 0;
}

/**
 * Log a test step with context and elapsed time
 */
export function logStep(step: string, details?: Record<string, unknown>): void {
  const elapsed = getElapsedTime();
  const timePrefix = elapsed ? `[${elapsed}] ` : "";
  const detailStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[E2E-${E2E_RUN_ID}] ${timePrefix}${step}${detailStr}`);
}

/**
 * Log test assertion result
 */
export function logAssertion(
  name: string,
  passed: boolean,
  details?: string,
): void {
  const status = passed ? "PASS" : "FAIL";
  const detailStr = details ? ` (${details})` : "";
  console.log(`[E2E-${E2E_RUN_ID}] [${status}] ${name}${detailStr}`);
}

/**
 * Log test summary at end of test
 */
export function logTestSummary(
  testName: string,
  result: {
    passed: boolean;
    duration: number;
    webhooksReceived: number;
    apiCalls: number;
    error?: string;
  },
): void {
  console.log(`\n[E2E-${E2E_RUN_ID}] ===== Test Summary: ${testName} =====`);
  console.log(`  Status: ${result.passed ? "PASSED" : "FAILED"}`);
  console.log(`  Duration: ${result.duration}ms`);
  console.log(`  Webhooks received: ${result.webhooksReceived}`);
  console.log(`  API calls: ${result.apiCalls}`);
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
  console.log("========================================\n");
}
