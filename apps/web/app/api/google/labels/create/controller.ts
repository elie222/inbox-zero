import { z } from "zod";
import { getGmailClient } from "@/utils/gmail/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { saveUserLabel } from "@/utils/redis/label";
import { SafeError } from "@/utils/error";
import { getOrCreateLabel } from "@/utils/gmail/label";

export const createLabelBody = z.object({
  name: z.string(),
  description: z.string().nullish(),
});
export type CreateLabelBody = z.infer<typeof createLabelBody>;
export type CreateLabelResponse = Awaited<ReturnType<typeof createLabel>>;

export async function createLabel(body: CreateLabelBody) {
  const session = await auth();
  if (!session?.user.email) throw new SafeError("Not authenticated");
  const gmail = getGmailClient(session);
  const label = await getOrCreateLabel({ gmail, name: body.name });

  if (!label.id) throw new SafeError("Failed to create label");

  const dbPromise = prisma.label.upsert({
    where: {
      gmailLabelId_userId: {
        gmailLabelId: label.id,
        userId: session.user.id,
      },
    },
    update: {},
    create: {
      name: body.name,
      description: body.description,
      gmailLabelId: label.id,
      enabled: true,
      userId: session.user.id,
    },
  });

  const redisPromise = saveUserLabel({
    email: session.user.email,
    label: { id: label.id, name: body.name, description: body.description },
  });

  await Promise.all([dbPromise, redisPromise]);

  return { label };
}
