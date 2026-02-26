import prisma from "@/utils/prisma";
import {
  isLocalAuthBypassEnabled,
  isLocalBypassProviderAccountId,
} from "@/utils/auth/local-bypass-config";

export async function isLocalBypassEmailAccount(emailAccountId: string) {
  if (!isLocalAuthBypassEnabled()) return false;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          providerAccountId: true,
        },
      },
    },
  });

  return isLocalBypassProviderAccountId(
    emailAccount?.account.providerAccountId,
  );
}
