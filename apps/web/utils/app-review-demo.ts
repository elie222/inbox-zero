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
