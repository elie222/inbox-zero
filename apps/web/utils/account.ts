import prisma from "@/utils/prisma";

export async function getTokens({ email }: { email: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      account: { select: { access_token: true, refresh_token: true } },
    },
  });

  return {
    accessToken: emailAccount?.account.access_token ?? undefined,
    refreshToken: emailAccount?.account.refresh_token ?? undefined,
  };
}
