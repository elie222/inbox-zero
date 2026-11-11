import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type MessagingPlatform = "slack" | "teams" | "telegram";
export type MessagingProvider = "SLACK" | "TEAMS" | "TELEGRAM";

const PROVIDER_NAMES: Record<MessagingProvider, string> = {
  SLACK: "Slack",
  TEAMS: "Teams",
  TELEGRAM: "Telegram",
};

export function getMessagingProviderName(
  provider: MessagingProvider | MessagingPlatform,
): string {
  return PROVIDER_NAMES[provider.toUpperCase() as MessagingProvider];
}

export function getConnectAppLabel(
  providers: ReadonlyArray<MessagingProvider | MessagingPlatform>,
  i18n: I18n,
): string {
  const names = providers.map(getMessagingProviderName);
  if (names.length === 0) return i18n._(msg`Connect app`);
  const providerList = new Intl.ListFormat(i18n.locale, {
    type: "disjunction",
  }).format(names);
  return i18n._(msg`Connect ${providerList}`);
}
