import { addDays } from "date-fns/addDays";
import prisma from "./prisma";
import { generateSecureToken } from "./api-key";

export async function createUnsubscribeToken({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const token = generateSecureToken();

  await prisma.emailToken.create({
    data: {
      token,
      emailAccountId,
      expiresAt: addDays(new Date(), 30),
    },
  });

  return token;
}
