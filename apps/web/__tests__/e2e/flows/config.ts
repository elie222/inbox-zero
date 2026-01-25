/**
 * Configuration for E2E flow tests
 *
 * Environment variables:
 * - E2E_GMAIL_EMAIL: Gmail test account email
 * - E2E_OUTLOOK_EMAIL: Outlook test account email
 * - E2E_RUN_ID: Unique run identifier (auto-generated if not set)
 * - E2E_WEBHOOK_URL: Tunnel URL for webhook delivery
 * - E2E_AI_MODEL: AI model to use (defaults to gpt-4o-mini for cost)
 */

// Test account configuration
export const E2E_GMAIL_EMAIL = process.env.E2E_GMAIL_EMAIL;
export const E2E_OUTLOOK_EMAIL = process.env.E2E_OUTLOOK_EMAIL;

// Generate unique run ID for this test session
export const E2E_RUN_ID =
  process.env.E2E_RUN_ID ||
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Generate unique message identifier using timestamp + random suffix
// This ensures uniqueness across all test files (unlike a module-scoped counter)
export function getNextMessageSequence(): string {
  const timestamp = Date.now().toString(36); // Base36 for shorter string
  const random = Math.random().toString(36).slice(2, 6); // 4 random chars
  return `${timestamp}-${random}`;
}

// Webhook tunnel URL (set by tunnel startup script)
export const E2E_WEBHOOK_URL = process.env.E2E_WEBHOOK_URL;

// AI model for tests - use cheap model
export const E2E_AI_MODEL = process.env.E2E_AI_MODEL || "gpt-4o-mini";

// Timeouts
export const TIMEOUTS = {
  /** How long to wait for webhook processing to complete */
  WEBHOOK_PROCESSING: 60_000,
  /** How long to wait for email delivery between accounts */
  EMAIL_DELIVERY: 90_000,
  /** Polling interval when waiting for state changes */
  POLL_INTERVAL: 3000,
  /** Default test timeout */
  TEST_DEFAULT: 120_000,
  /** Timeout for full reply cycle tests */
  FULL_CYCLE: 180_000,
} as const;

// Test email subject prefix for identification
export function getTestSubjectPrefix(): string {
  return `[E2E-${E2E_RUN_ID}]`;
}

// Check if flow tests should run
export function shouldRunFlowTests(): boolean {
  return (
    process.env.RUN_E2E_FLOW_TESTS === "true" ||
    process.env.RUN_E2E_TESTS === "true"
  );
}

// Validate required configuration
export function validateConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!E2E_GMAIL_EMAIL) {
    errors.push("E2E_GMAIL_EMAIL environment variable is required");
  }

  if (!E2E_OUTLOOK_EMAIL) {
    errors.push("E2E_OUTLOOK_EMAIL environment variable is required");
  }

  // Check webhook configuration
  const ngrokDomain = process.env.E2E_NGROK_DOMAIN;
  const webhookUrl = process.env.WEBHOOK_URL;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const effectiveUrl = webhookUrl || baseUrl || "";

  // If no ngrok domain and URL looks like localhost, warn
  if (!ngrokDomain) {
    if (!effectiveUrl) {
      warnings.push(
        "Neither E2E_NGROK_DOMAIN nor WEBHOOK_URL is set. Webhooks will not work.",
      );
    } else if (
      effectiveUrl.includes("localhost") ||
      effectiveUrl.includes("127.0.0.1")
    ) {
      warnings.push(
        `WEBHOOK_URL appears to be localhost (${effectiveUrl}). ` +
          "Webhooks require a publicly accessible URL. Set E2E_NGROK_DOMAIN.",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
