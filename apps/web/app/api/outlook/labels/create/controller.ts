import { z } from "zod";
import prisma from "@/utils/prisma";
import { saveUserLabel } from "@/utils/redis/label";
import { SafeError } from "@/utils/error";
import { getOrCreateLabel } from "@/utils/outlook/label";
import type { OutlookClient } from "@/utils/outlook/client";

export const createLabelBody = z.object({
  name: z.string(),
  description: z.string().nullish(),
});
export type CreateLabelBody = z.infer<typeof createLabelBody>;
export type CreateLabelResponse = Awaited<ReturnType<typeof createLabel>>;

export async function createLabel({
  client,
  emailAccountId,
  name,
  description,
}: {
  client: OutlookClient;
  emailAccountId: string;
  name: string;
  description?: string;
}) {
  const label = await getOrCreateLabel({ client, name });

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
