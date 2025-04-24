import { SafeError } from "@/utils/error";
import { hasAiAccess } from "@/utils/premium";
import prisma from "@/utils/prisma";

export async function validateUserAndAiAccess({
  email,
}: {
  email: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      userId: true,
      email: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      about: true,
      user: { select: { premium: { select: { aiAutomationAccess: true } } } },
    },
  });
  if (!emailAccount) throw new SafeError("User not found");

  const userHasAiAccess = hasAiAccess(
    emailAccount.user.premium?.aiAutomationAccess,
    emailAccount.aiApiKey,
  );
  if (!userHasAiAccess) throw new SafeError("Please upgrade for AI access");

  return { emailAccount };
}
