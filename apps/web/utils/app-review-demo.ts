import { env } from "@/env";
import {
  parseReviewDemoAccounts,
  type ReviewDemoAccount,
} from "@/utils/review-demo-accounts";

export function isAppReviewDemoEnabled(): boolean {
  return env.APP_REVIEW_DEMO_ENABLED;
}

export function getConfiguredAppReviewDemoAccounts(): ReviewDemoAccount[] {
  return parseReviewDemoAccounts(env.APP_REVIEW_DEMO_ACCOUNTS);
}

export function isAppReviewDemoAccountEmail(
  email: string | null | undefined,
): boolean {
  if (!isAppReviewDemoEnabled()) return false;

  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;

  return getConfiguredAppReviewDemoAccounts().some(
    (account) => account.email === normalizedEmail,
  );
}
