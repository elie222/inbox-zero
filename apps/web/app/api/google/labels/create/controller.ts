import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
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

export async function createLabel({
  gmail,
  emailAccountId,
  name,
  description,
}: {
  gmail: gmail_v1.Gmail;
  emailAccountId: string;
  name: string;
  description?: string;
}) {
  const label = await getOrCreateLabel({ gmail, name });

  if (!label.id) throw new SafeError("Failed to create label");

  const dbPromise = prisma.label.upsert({
    where: {
      gmailLabelId_emailAccountId: {
        gmailLabelId: label.id,
        emailAccountId,
      },
    },
    update: {},
    create: {
      name,
      description,
      gmailLabelId: label.id,
      enabled: true,
      emailAccountId,
    },
  });

  const redisPromise = saveUserLabel({
    emailAccountId,
    label: { id: label.id, name, description },
  });

  await Promise.all([dbPromise, redisPromise]);

  return { label };
}
