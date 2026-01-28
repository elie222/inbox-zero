export const ASSISTANT_ONBOARDING_COOKIE = "viewed_assistant_onboarding";
export const REPLY_ZERO_ONBOARDING_COOKIE = "viewed_reply_zero_onboarding";
export const INVITATION_COOKIE = "invitation_id";
export const LAST_EMAIL_ACCOUNT_COOKIE = "last_email_account_id";

export type LastEmailAccountCookieValue = {
  userId: string;
  emailAccountId: string;
};

export function markOnboardingAsCompleted(cookie: string) {
  document.cookie = `${cookie}=true; path=/; max-age=${Number.MAX_SAFE_INTEGER}; SameSite=Lax; Secure`;
}

export function setInvitationCookie(invitationId: string) {
  document.cookie = `${INVITATION_COOKIE}=${invitationId}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax; Secure`;
}

export function clearInvitationCookie() {
  document.cookie = `${INVITATION_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure`;
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
