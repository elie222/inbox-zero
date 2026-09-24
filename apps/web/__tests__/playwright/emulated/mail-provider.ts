export const playwrightMailProvider =
  process.env.PLAYWRIGHT_MAIL_PROVIDER === "microsoft" ? "microsoft" : "google";

export function isMicrosoftPlaywright() {
  return playwrightMailProvider === "microsoft";
}
