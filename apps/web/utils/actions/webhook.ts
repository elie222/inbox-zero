"use server";

import prisma from "@/utils/prisma";
import { actionClientUser } from "@/utils/actions/safe-action";
import { ensureWebhookActionEnabled } from "@/utils/webhook-action";

export const regenerateWebhookSecretAction = actionClientUser
  .metadata({ name: "regenerateWebhookSecret" })
  .action(async ({ ctx: { userId } }) => {
    ensureWebhookActionEnabled();

    const webhookSecret = generateWebhookSecret();

    await prisma.user.update({
      where: { id: userId },
      data: { webhookSecret },
    });

    return { webhookSecret };
  });

function generateWebhookSecret(length = 32) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((x) => chars[x % chars.length])
    .join("");
}
