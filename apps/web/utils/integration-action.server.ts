import "server-only";
import prisma from "@/utils/prisma";
import { getPosthogLlmClient } from "@/utils/posthog";
import {
  INTEGRATION_ACTION_FEATURE_FLAG,
  isIntegrationActionGloballyEnabled,
} from "@/utils/integration-action";

export async function isIntegrationActionEnabledForUserId(userId: string) {
  if (isIntegrationActionGloballyEnabled()) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user ? isIntegrationActionEnabledForUserEmail(user.email) : false;
}

export async function isIntegrationActionEnabledForEmailAccountId(
  emailAccountId: string,
) {
  if (isIntegrationActionGloballyEnabled()) return true;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { user: { select: { email: true } } },
  });
  return emailAccount
    ? isIntegrationActionEnabledForUserEmail(emailAccount.user.email)
    : false;
}

async function isIntegrationActionEnabledForUserEmail(email: string) {
  const posthog = getPosthogLlmClient();
  if (!posthog) return false;

  try {
    const flags = await posthog.evaluateFlags(email, {
      flagKeys: [INTEGRATION_ACTION_FEATURE_FLAG],
    });
    return flags.isEnabled(INTEGRATION_ACTION_FEATURE_FLAG);
  } catch {
    return false;
  }
}
