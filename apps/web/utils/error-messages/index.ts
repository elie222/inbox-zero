import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("error-messages");

// Used to store error messages for a user which we display in the UI

type ErrorMessageEntry = {
  message: string;
  timestamp: string;
};

type ErrorMessages = Record<string, ErrorMessageEntry>;

export async function getUserErrorMessages(
  userId: string,
): Promise<ErrorMessages | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { errorMessages: true },
  });
  return (user?.errorMessages as ErrorMessages) || null;
}

export async function addUserErrorMessage(
  userEmail: string,
  errorType: (typeof ErrorType)[keyof typeof ErrorType],
  errorMessage: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    logger.warn("User not found", { userEmail });
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
}: {
  userId: string;
}): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { errorMessages: {} },
  });
}

export const ErrorType = {
  INCORRECT_OPENAI_API_KEY: "Incorrect OpenAI API key",
  INVALID_OPENAI_MODEL: "Invalid OpenAI model",
  OPENAI_API_KEY_DEACTIVATED: "OpenAI API key deactivated",
  OPENAI_RETRY_ERROR: "OpenAI retry error",
  ANTHROPIC_INSUFFICIENT_BALANCE: "Anthropic insufficient balance",
};
