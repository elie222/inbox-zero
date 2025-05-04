"use server";

import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";

export const regenerateWebhookSecretAction = actionClient
  .metadata({ name: "regenerateWebhookSecret" })
  .action(async ({ ctx: { emailAccountId } }) => {
    const webhookSecret = generateWebhookSecret();

    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { webhookSecret },
    });
  });

function generateWebhookSecret(length = 32) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((x) => chars[x % chars.length])
    .join("");
}
