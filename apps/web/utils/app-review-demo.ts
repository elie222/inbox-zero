import { z } from "zod";
import { env } from "@/env";

export type ReviewDemoAccount = {
  code: string;
  email: string;
};

const reviewDemoAccountsSchema = z.array(
  z.object({
    code: z.string().trim().min(1),
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
