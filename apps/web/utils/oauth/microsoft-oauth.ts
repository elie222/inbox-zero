export function extractAadstsCode(errorMessage: string | null | undefined) {
  if (!errorMessage) return null;

  const match = errorMessage.match(/AADSTS\d+/);
  return match ? match[0] : null;
}

export function parseMicrosoftScopes(scope: string | null | undefined) {
  if (!scope) return [];

  return scope
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getMissingMicrosoftScopes(
  grantedScope: string | null | undefined,
  expectedScopes: readonly string[],
) {
  const grantedScopes = new Set(parseMicrosoftScopes(grantedScope));
  return expectedScopes.filter((scope) => !grantedScopes.has(scope));
}

export function classifyMicrosoftOAuthError(
  errorMessage: string | null | undefined,
) {
  const aadstsCode = extractAadstsCode(errorMessage);
  const normalizedError = errorMessage?.toLowerCase();

  if (aadstsCode === "AADSTS65001") {
    return {
      errorCode: "admin_consent_required",
      aadstsCode,
      userMessage:
        "Your Microsoft 365 organization requires admin approval before this app can access this account. Ask your Microsoft 365 admin to grant consent for the app, then try again.",
    };
  }

  if (aadstsCode === "AADSTS70011" || aadstsCode === "AADSTS500011") {
    return {
      errorCode: "invalid_scope_configuration",
      aadstsCode,
      userMessage:
        "Microsoft rejected the requested permissions for this app. Please ask your admin to verify the Inbox Zero app registration, delegated Microsoft Graph permissions, and redirect URLs, then try again.",
    };
  }

  if (
    normalizedError?.includes("no refresh token") ||
    normalizedError?.includes("did not grant all required permissions") ||
    normalizedError?.includes("approve every requested permission") ||
    normalizedError?.includes("missing one or more required")
  ) {
    return {
      errorCode: "consent_incomplete",
      aadstsCode,
      userMessage:
        "Microsoft connected the account, but did not grant all required permissions. Please reconnect and approve every requested permission. If your organization restricts consent, ask your admin to approve the app first.",
    };
  }

  return null;
}

export function classifyMicrosoftOAuthCallbackError(params: {
  oauthError: string | null | undefined;
  errorDescription: string | null | undefined;
}) {
  const aadstsCode = extractAadstsCode(params.errorDescription);

  if (aadstsCode === "AADSTS65004") {
    return {
      errorCode: "consent_declined",
      aadstsCode,
      userMessage:
        "Microsoft sign-in was canceled before this app received the required permissions. Please try again and complete the consent screen.",
    };
  }

  const classifiedError = classifyMicrosoftOAuthError(params.errorDescription);
  if (classifiedError) {
    return classifiedError;
  }

  if (params.oauthError === "access_denied") {
    return {
      errorCode: "consent_declined",
      aadstsCode,
      userMessage:
        "Microsoft denied the request before Inbox Zero could connect your account. Please try again and complete the consent screen.",
    };
  }

  return null;
}

export function getSafeMicrosoftOAuthErrorDescription(
  errorMessage: string | null | undefined,
) {
  const aadstsCode = extractAadstsCode(errorMessage);
  if (!aadstsCode) return null;

  return `Microsoft error ${aadstsCode}.`;
}
