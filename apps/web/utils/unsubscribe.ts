import { addDays } from "date-fns/addDays";
import prisma from "./prisma";
import { generateSecureToken } from "./api-key";

type UnsubscribeAction = "all-emails" | "meeting-recorder-recap";

export async function createUnsubscribeToken({
  emailAccountId,
  action = "all-emails",
}: {
  emailAccountId: string;
  action?: UnsubscribeAction;
}) {
  const secureToken = generateSecureToken();
  const token =
    action === "all-emails" ? secureToken : `${action}.${secureToken}`;

  await prisma.emailToken.create({
    data: {
      token,
      emailAccountId,
      expiresAt: addDays(new Date(), 30),
    },
  });

  return token;
}

export function getUnsubscribeAction(token: string): UnsubscribeAction {
  return token.startsWith("meeting-recorder-recap.")
    ? "meeting-recorder-recap"
    : "all-emails";
}
