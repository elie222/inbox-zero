import { hasAiAccess } from "@/utils/premium";
import prisma from "@/utils/prisma";

export async function validateUserAndAiAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      premium: { select: { aiAutomationAccess: true } },
      accounts: { select: { access_token: true } },
      oldestCategorizedEmailTime: true,
      newestCategorizedEmailTime: true,
    },
  });
  if (!user) return { error: "User not found" };

  const userHasAiAccess = hasAiAccess(
    user.premium?.aiAutomationAccess,
    user.aiApiKey,
  );
  if (!userHasAiAccess) return { error: "Please upgrade for AI access" };

  const accessToken = user.accounts?.[0]?.access_token;
  if (!accessToken) return { error: "No access token" };

  return { user, accessToken };
}
