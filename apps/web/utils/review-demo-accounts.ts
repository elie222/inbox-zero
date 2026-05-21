import { z } from "zod";

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

export function parseReviewDemoAccounts(
  value: string | undefined,
): ReviewDemoAccount[] {
  if (!value?.trim()) return [];

  try {
    const parsed = reviewDemoAccountsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
