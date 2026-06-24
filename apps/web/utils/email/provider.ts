import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/email-account-client";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import type { EmailProvider } from "@/utils/email/types";
import { assertProviderNotRateLimited } from "@/utils/email/rate-limit";
import { toRateLimitProvider } from "@/utils/email/rate-limit-mode-error";
import { recordEmailAccountProviderIssue } from "@/utils/email/provider-health";
import type { Logger } from "@/utils/logger";
import { flushLoggerSafely } from "@/utils/logger-flush";

export async function createEmailProvider({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}): Promise<EmailProvider> {
  const rateLimitProvider = toRateLimitProvider(provider);
  if (!rateLimitProvider) throw new Error(`Unsupported provider: ${provider}`);

  try {
    await assertProviderNotRateLimited({
      emailAccountId,
      provider: rateLimitProvider,
      logger,
      source: "create-email-provider",
    });

    if (rateLimitProvider === "google") {
      const client = await getGmailClientForEmail({ emailAccountId, logger });
      return withProviderFailureLogging(
        new GmailProvider(client, logger, emailAccountId),
        { emailAccountId, provider: rateLimitProvider, logger },
      );
    }

    const client = await getOutlookClientForEmail({ emailAccountId, logger });
    return withProviderFailureLogging(new OutlookProvider(client, logger), {
      emailAccountId,
      provider: rateLimitProvider,
      logger,
    });
  } catch (error) {
    logger.warn("Failed to create email provider", {
      error,
      provider: rateLimitProvider,
      source: "create-email-provider",
    });
    await recordProviderIssueSafely({
      emailAccountId,
      provider: rateLimitProvider,
      error,
      logger,
      operation: "createEmailProvider",
    });
    await flushLoggerSafely(logger, {
      action: "createEmailProvider",
      flushReason: "provider-create-error",
      provider: rateLimitProvider,
    }).catch((loggingError) => {
      logger.warn("Failed to flush provider creation failure log", {
        error: loggingError,
        provider: rateLimitProvider,
        source: "create-email-provider",
      });
    });
    throw error;
  }
}

function withProviderFailureLogging(
  emailProvider: EmailProvider,
  {
    emailAccountId,
    provider,
    logger,
  }: {
    emailAccountId: string;
    provider: "google" | "microsoft";
    logger: Logger;
  },
): EmailProvider {
  return new Proxy(emailProvider, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;

      return (...args: unknown[]) => {
        try {
          const result = value.apply(target, args);
          if (!isPromiseLike(result)) return result;

          return result.catch(async (error: unknown) => {
            await logProviderOperationFailureSafely({
              error,
              emailAccountId,
              provider,
              logger,
              operation: String(property),
            });
            throw error;
          });
        } catch (error) {
          logProviderOperationFailureSafely({
            error,
            emailAccountId,
            provider,
            operation: String(property),
            logger,
          }).catch(() => undefined);
          throw error;
        }
      };
    },
  }) as EmailProvider;
}

async function logProviderOperationFailureSafely(
  input: ProviderOperationFailureLogInput,
) {
  try {
    await logProviderOperationFailure(input);
  } catch (loggingError) {
    input.logger.warn("Failed to log provider operation failure", {
      error: loggingError,
      emailAccountId: input.emailAccountId,
      provider: input.provider,
      operation: input.operation,
    });
  }
}

async function logProviderOperationFailure({
  error,
  emailAccountId,
  provider,
  logger,
  operation,
}: {
  error: unknown;
  emailAccountId: string;
  provider: "google" | "microsoft";
  logger: Logger;
  operation: string;
}) {
  logger.warn("Email provider operation failed", {
    error,
    emailAccountId,
    provider,
    operation,
  });
  await recordProviderIssueSafely({
    emailAccountId,
    provider,
    error,
    logger,
    operation,
  });
  await flushLoggerSafely(logger, {
    action: "emailProvider",
    flushReason: "provider-operation-error",
    provider,
    operation,
  });
}

async function recordProviderIssueSafely({
  emailAccountId,
  provider,
  error,
  logger,
  operation,
}: ProviderOperationFailureLogInput) {
  await recordEmailAccountProviderIssue({
    emailAccountId,
    provider,
    error,
    logger,
    operation,
  }).catch((recordError) => {
    logger.warn("Failed to record provider issue", {
      error: recordError,
      emailAccountId,
      provider,
      operation,
    });
  });
}

type ProviderOperationFailureLogInput = {
  error: unknown;
  emailAccountId: string;
  provider: "google" | "microsoft";
  logger: Logger;
  operation: string;
};

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function" &&
    "catch" in value &&
    typeof value.catch === "function"
  );
}
