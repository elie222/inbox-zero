import { env } from "@/env";
import type { MessagingProvider } from "@/generated/prisma/enums";
import { isAppReviewDemoAccountEmail } from "@/utils/app-review-demo";
import { isPosthogFeatureEnabled } from "@/utils/posthog";

const TEAMS_EARLY_ACCESS_FLAG_KEY = "microsoft-teams";

export async function getAvailableMessagingProviders({
  email,
}: {
  email?: string | null;
} = {}): Promise<MessagingProvider[]> {
  const providers: MessagingProvider[] = [];
  if (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET) providers.push("SLACK");
  if (await isTeamsProviderAvailable({ email })) providers.push("TEAMS");
  if (env.TELEGRAM_BOT_TOKEN) providers.push("TELEGRAM");
  return providers;
}

async function isTeamsProviderAvailable({ email }: { email?: string | null }) {
  if (!env.TEAMS_BOT_APP_ID || !env.TEAMS_BOT_APP_PASSWORD) return false;

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  if (isAppReviewDemoAccountEmail(normalizedEmail)) return true;

  return isPosthogFeatureEnabled({
    distinctId: normalizedEmail,
    flagKey: TEAMS_EARLY_ACCESS_FLAG_KEY,
  });
}

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}
