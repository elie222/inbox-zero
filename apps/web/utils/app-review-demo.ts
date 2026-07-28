import { z } from "zod";
import { env } from "@/env";

export type ReviewDemoAccount = {
  code: string;
  email: string;
};

const reviewDemoAccountsSchema = z.array(
  z.object({
    // The code is the ONLY credential guarding a real mailbox session and
    // the sign-in route has no rate limiting — a human-typeable code would
    // be brute-forceable
    code: z.string().trim().min(24),
    email: z.string().trim().toLowerCase().email(),
  }),
);

export function isAppReviewDemoEnabled(): boolean {
  return env.APP_REVIEW_DEMO_ENABLED;
}

export function getConfiguredAppReviewDemoAccounts(): ReviewDemoAccount[] {
  const value = env.APP_REVIEW_DEMO_ACCOUNTS;
  if (!value?.trim()) return [];

  try {
    const parsed = reviewDemoAccountsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
