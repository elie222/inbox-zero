import type { EmailProvider } from "@/utils/email/types";

export type EmailProviderRateLimitProvider = EmailProvider["name"];

type EmailProviderRateLimitMetadata = {
  apiErrorType: string;
  messageProviderLabel: string;
  bannerProviderLabel: string;
};

const EMAIL_PROVIDER_RATE_LIMIT_METADATA = {
  google: {
    apiErrorType: "Gmail Rate Limit Exceeded",
    messageProviderLabel: "Gmail",
    bannerProviderLabel: "Gmail",
  },
  microsoft: {
    apiErrorType: "Outlook Rate Limit",
    messageProviderLabel: "Microsoft",
    bannerProviderLabel: "Microsoft Outlook",
  },
} satisfies Record<
  EmailProviderRateLimitProvider,
  EmailProviderRateLimitMetadata
>;

export class ProviderRateLimitModeError extends Error {
  provider: EmailProviderRateLimitProvider;
  retryAt?: string;

  constructor({
    provider,
    retryAt,
  }: {
    provider: EmailProviderRateLimitProvider;
    retryAt?: Date;
  }) {
    const providerLabel = getProviderRateLimitMessageLabel(provider);
    const message = `${providerLabel} is temporarily rate limiting this account. Retry after ${retryAt?.toISOString()}.`;

    super(message);
    this.name = "ProviderRateLimitModeError";
    this.provider = provider;
    this.retryAt = retryAt?.toISOString();
  }
}

export function toRateLimitProvider(
  provider: string | null | undefined,
): EmailProviderRateLimitProvider | null {
  if (provider === "google" || provider === "microsoft") return provider;
  return null;
}

export function getProviderFromRateLimitApiErrorType(
  apiErrorType: string,
): EmailProviderRateLimitProvider | null {
  for (const [provider, metadata] of Object.entries(
    EMAIL_PROVIDER_RATE_LIMIT_METADATA,
  )) {
    if (metadata.apiErrorType === apiErrorType) {
      return provider as EmailProviderRateLimitProvider;
    }
  }
  return null;
}

export function getProviderRateLimitApiErrorType(
  provider: EmailProviderRateLimitProvider,
): string {
  return EMAIL_PROVIDER_RATE_LIMIT_METADATA[provider].apiErrorType;
}

export function getProviderRateLimitMessageLabel(
  provider: EmailProviderRateLimitProvider,
): string {
  return EMAIL_PROVIDER_RATE_LIMIT_METADATA[provider].messageProviderLabel;
}

export function getProviderRateLimitBannerLabel(
  provider: EmailProviderRateLimitProvider,
): string {
  return EMAIL_PROVIDER_RATE_LIMIT_METADATA[provider].bannerProviderLabel;
}

export function isProviderRateLimitModeError(
  error: unknown,
): error is ProviderRateLimitModeError {
  if (error instanceof ProviderRateLimitModeError) return true;
  if (typeof error !== "object" || error === null) return false;

  const maybeError = error as Record<string, unknown>;
  return (
    maybeError.name === "ProviderRateLimitModeError" &&
    toRateLimitProvider(maybeError.provider as string | null | undefined) !==
      null
  );
}
