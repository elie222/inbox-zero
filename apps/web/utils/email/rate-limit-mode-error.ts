import type { EmailProvider } from "@/utils/email/types";

export type EmailProviderRateLimitProvider = EmailProvider["name"];

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
    const message =
      provider === "google"
        ? `Gmail is temporarily rate limiting this account. Retry after ${retryAt?.toISOString()}.`
        : `Microsoft is temporarily rate limiting this account. Retry after ${retryAt?.toISOString()}.`;

    super(message);
    this.name = "ProviderRateLimitModeError";
    this.provider = provider;
    this.retryAt = retryAt?.toISOString();
  }
}

export function isProviderRateLimitModeError(
  error: unknown,
): error is ProviderRateLimitModeError {
  if (error instanceof ProviderRateLimitModeError) return true;
  if (typeof error !== "object" || error === null) return false;

  const maybeError = error as Record<string, unknown>;
  return (
    maybeError.name === "ProviderRateLimitModeError" &&
    (maybeError.provider === "google" || maybeError.provider === "microsoft")
  );
}
