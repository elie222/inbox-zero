import "server-only";
import prisma from "@/utils/prisma";
import { getPosthogLlmClient } from "@/utils/posthog";
import { createScopedLogger } from "@/utils/logger";
import {
  INTEGRATION_ACTION_FEATURE_FLAG,
  isIntegrationActionGloballyEnabled,
} from "@/utils/integration-action";

const logger = createScopedLogger("integration-action-access");

export async function isIntegrationActionEnabledForUserId(userId: string) {
  if (isIntegrationActionGloballyEnabled()) return true;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user ? isIntegrationActionEnabledForUserEmail(user.email) : false;
  } catch (error) {
    logger.error("Failed to look up user for integration action access", {
      error,
    });
    return false;
  }
}

export async function isIntegrationActionEnabledForEmailAccountId(
  emailAccountId: string,
) {
  if (isIntegrationActionGloballyEnabled()) return true;

  try {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { user: { select: { email: true } } },
    });
    return emailAccount
      ? isIntegrationActionEnabledForUserEmail(emailAccount.user.email)
      : false;
  } catch (error) {
    logger.error(
      "Failed to look up email account for integration action access",
      { error },
    );
    return false;
  }
}

async function isIntegrationActionEnabledForUserEmail(email: string) {
  const posthog = getPosthogLlmClient();
  if (!posthog) return false;

  try {
    const flags = await posthog.evaluateFlags(email, {
      flagKeys: [INTEGRATION_ACTION_FEATURE_FLAG],
    });
    return flags.isEnabled(INTEGRATION_ACTION_FEATURE_FLAG);
  } catch (error) {
    logger.error("Failed to evaluate integration action feature flag", {
      error,
    });
    return false;
  }
}
