export function isMicrosoftProvider(provider: string | null | undefined) {
  return provider ? provider === "microsoft" : false;
}

export function isGmailProvider(provider: string | null | undefined) {
  return provider ? provider === "google" : false;
}
