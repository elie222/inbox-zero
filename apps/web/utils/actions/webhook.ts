"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withActionInstrumentation } from "@/utils/actions/middleware";

export const regenerateWebhookSecretAction = withActionInstrumentation(
  "regenerateWebhookSecret",
  async () => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const webhookSecret = generateWebhookSecret();

    await prisma.user.update({
      where: { id: userId },
      data: { webhookSecret },
    });

    revalidatePath("/settings");
  },
);

function generateWebhookSecret(length = 32) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((x) => chars[x % chars.length])
    .join("");
}
