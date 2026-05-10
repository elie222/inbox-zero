import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import { sendActionRequiredEmail } from "@inboxzero/resend";
import { env } from "@/env";
import { createUnsubscribeToken } from "@/utils/unsubscribe";

// Used to store error messages for a user which we display in the UI

export const ErrorType = {
  INCORRECT_API_KEY: "Incorrect API key",
  INVALID_AI_MODEL: "Invalid AI model",
  API_KEY_DEACTIVATED: "API key deactivated",
  AI_QUOTA_ERROR: "AI quota error",
  INSUFFICIENT_CREDITS: "Insufficient AI credits",
  TRIAL_AI_LIMIT_REACHED: "Trial AI limit reached",
  ACCOUNT_DISCONNECTED: "Account disconnected",
  // Legacy keys kept for clearing old stored errors
  INCORRECT_OPENAI_API_KEY: "Incorrect OpenAI API key",
  OPENAI_API_KEY_DEACTIVATED: "OpenAI API key deactivated",
  ANTHROPIC_INSUFFICIENT_BALANCE: "Anthropic insufficient balance",
} as const;

type ErrorMessageEntry = {
  message: string;
  timestamp: string;
  emailSentAt?: string;
};

type ErrorMessages = Record<string, ErrorMessageEntry>;
type ErrorTypeValue = (typeof ErrorType)[keyof typeof ErrorType];
export type PersistedErrorType = Exclude<
  ErrorTypeValue,
  typeof ErrorType.TRIAL_AI_LIMIT_REACHED
>;

export async function getUserErrorMessages(
  userId: string,
): Promise<ErrorMessages | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { errorMessages: true },
  });
  const errorMessages = (user?.errorMessages as ErrorMessages) || null;

  if (errorMessages?.[ErrorType.TRIAL_AI_LIMIT_REACHED]) {
    const updatedErrorMessages = { ...errorMessages };
    delete updatedErrorMessages[ErrorType.TRIAL_AI_LIMIT_REACHED];

    await prisma.user.update({
      where: { id: userId },
      data: { errorMessages: updatedErrorMessages },
    });

    return Object.keys(updatedErrorMessages).length
      ? updatedErrorMessages
      : null;
  }

  return errorMessages;
}

export async function addUserErrorMessage(
  userId: string,
  errorType: PersistedErrorType,
  errorMessage: string,
  logger: Logger,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    logger.warn("User not found");
    return;
  }

  const currentErrorMessages = (user?.errorMessages as ErrorMessages) || {};

  const newErrorMessages = {
    ...currentErrorMessages,
    [errorType]: {
      message: errorMessage,
      timestamp: new Date().toISOString(),
    },
  };

  await prisma.user.update({
    where: { id: user.id },
    data: { errorMessages: newErrorMessages },
  });
}

export async function clearUserErrorMessages({
  userId,
  logger,
}: {
  userId: string;
  logger: Logger;
}): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { errorMessages: {} },
    });
  } catch (error) {
    logger.error("Error clearing user error messages:", { error });
    captureException(error, { extra: { userId } });
  }
}

export async function clearSpecificErrorMessages({
  userId,
  errorTypes,
  logger,
}: {
  userId: string;
  errorTypes: ErrorTypeValue[];
  logger: Logger;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { errorMessages: true },
    });

    if (!user) return;

    const currentErrorMessages = (user.errorMessages as ErrorMessages) || {};
    const updatedErrorMessages = { ...currentErrorMessages };

    for (const errorType of errorTypes) {
      delete updatedErrorMessages[errorType];
    }

    await prisma.user.update({
      where: { id: userId },
      data: { errorMessages: updatedErrorMessages },
    });
  } catch (error) {
    logger.error("Error clearing specific error messages:", {
      userId,
      errorTypes,
      error,
    });
    captureException(error, { extra: { userId, errorTypes } });
  }
}

const errorTypeConfig: Record<
  PersistedErrorType,
  { label: string; actionUrl: string; actionLabel: string }
> = {
  [ErrorType.INCORRECT_API_KEY]: {
    label: "API Key Issue",
    actionUrl: "/settings",
    actionLabel: "Update API Key",
  },
  [ErrorType.INVALID_AI_MODEL]: {
    label: "Invalid AI Model",
    actionUrl: "/settings",
    actionLabel: "Update Settings",
  },
  [ErrorType.API_KEY_DEACTIVATED]: {
    label: "API Key Deactivated",
    actionUrl: "/settings",
    actionLabel: "Update API Key",
  },
  [ErrorType.AI_QUOTA_ERROR]: {
    label: "AI Rate Limited",
    actionUrl: "/settings",
    actionLabel: "Update Settings",
  },
  [ErrorType.INSUFFICIENT_CREDITS]: {
    label: "Insufficient Credits",
    actionUrl: "/settings",
    actionLabel: "Update Settings",
  },
  [ErrorType.ACCOUNT_DISCONNECTED]: {
    label: "Account Disconnected",
    actionUrl: "/accounts",
    actionLabel: "Reconnect Account",
  },
  // Legacy keys — only needed so old stored errors can still render
  [ErrorType.INCORRECT_OPENAI_API_KEY]: {
    label: "API Key Issue",
    actionUrl: "/settings",
    actionLabel: "Update API Key",
  },
  [ErrorType.OPENAI_API_KEY_DEACTIVATED]: {
    label: "API Key Deactivated",
    actionUrl: "/settings",
    actionLabel: "Update API Key",
  },
  [ErrorType.ANTHROPIC_INSUFFICIENT_BALANCE]: {
    label: "Insufficient Credits",
    actionUrl: "/settings",
    actionLabel: "Update Settings",
  },
};

export async function addUserErrorMessageWithNotification({
  userId,
  userEmail,
  emailAccountId,
  errorType,
  errorMessage,
  logger,
}: {
  userId: string;
  userEmail: string;
  emailAccountId: string;
  errorType: PersistedErrorType;
  errorMessage: string;
  logger: Logger;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { errorMessages: true },
    });

    if (!user) {
      logger.warn("User not found");
      return;
    }

    const currentErrorMessages = (user.errorMessages as ErrorMessages) || {};
    const existingEntry = currentErrorMessages[errorType];
    const shouldSendEmail = !existingEntry?.emailSentAt;

    const newEntry: ErrorMessageEntry = {
      message: errorMessage,
      timestamp: new Date().toISOString(),
      emailSentAt: existingEntry?.emailSentAt,
    };

    if (shouldSendEmail) {
      try {
        const config = errorTypeConfig[errorType];
        const unsubscribeToken = await createUnsubscribeToken({
          emailAccountId,
        });

        await sendActionRequiredEmail({
          from: env.RESEND_FROM_EMAIL,
          to: userEmail,
          emailProps: {
            baseUrl: env.NEXT_PUBLIC_BASE_URL,
            email: userEmail,
            unsubscribeToken,
            errorType: config.label,
            errorMessage,
            actionUrl: config.actionUrl,
            actionLabel: config.actionLabel,
          },
        });

        newEntry.emailSentAt = new Date().toISOString();
        logger.info("Sent action required email", { errorType });
      } catch (emailError) {
        logger.error("Failed to send action required email", {
          error: emailError,
        });
        // Continue to save the error message even if email fails
      }
    }

    const newErrorMessages = {
      ...currentErrorMessages,
      [errorType]: newEntry,
    };

    await prisma.user.update({
      where: { id: userId },
      data: { errorMessages: newErrorMessages },
    });
  } catch (error) {
    logger.error("Error in addUserErrorMessageWithNotification", { error });
    captureException(error, { extra: { userId, errorType } });
  }
}
