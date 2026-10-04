export function isGoogleProvider(
  provider: string | null | undefined,
): provider is "google" {
  return provider === "google";
}

export function isMicrosoftProvider(
  provider: string | null | undefined,
): provider is "microsoft" {
  return provider === "microsoft";
}

export function isFastmailProvider(provider: string | null | undefined) {
  return provider === "fastmail";
}

export function supportsServerFilters(provider: string | null | undefined) {
  return provider === "google" || provider === "microsoft";
}

export function supportsPushNotifications(provider: string | null | undefined) {
  return provider === "google" || provider === "microsoft";
}
