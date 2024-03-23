import prisma from "@/utils/prisma";

export async function LastLogin({ email }: { email: string }) {
  await prisma.user.update({
    where: { email },
    data: { lastLogin: new Date() },
  });

  return null;
}
