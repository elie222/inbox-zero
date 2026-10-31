export const ASSISTANT_ONBOARDING_COOKIE = "viewed_assistant_onboarding";
export const LAST_EMAIL_ACCOUNT_COOKIE = "last_email_account_id";

export type LastEmailAccountCookieValue = {
  userId: string;
  emailAccountId: string;
};

export function markOnboardingAsCompleted(cookie: string) {
  document.cookie = `${cookie}=true; path=/; max-age=${Number.MAX_SAFE_INTEGER}; SameSite=Lax; Secure`;
}

export function parseLastEmailAccountCookieValue({
  userId,
  cookieValue,
}: {
  userId: string;
  cookieValue: string | undefined;
}): string | null {
  if (!cookieValue) return null;

  // Handle backward compatibility: old cookies stored just the emailAccountId as a plain string
  // New cookies store JSON with { userId, emailAccountId }
  try {
    const parsed = JSON.parse(cookieValue) as LastEmailAccountCookieValue;
    if (parsed.userId !== userId) return null;
    return parsed.emailAccountId;
  } catch {
    return cookieValue;
  }
}

export function ownedLastEmailAccountId(
  lastEmailAccountId: string | null,
  accountIds: readonly string[],
) {
  if (!lastEmailAccountId) return null;
  return accountIds.includes(lastEmailAccountId) ? lastEmailAccountId : null;
}
