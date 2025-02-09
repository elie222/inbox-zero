import prisma from "@/utils/prisma";

export async function getAiUserByEmail({ email }: { email: string }) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
    },
  });
}
