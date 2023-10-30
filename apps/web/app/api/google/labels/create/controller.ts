import { z } from "zod";
import { getGmailClient } from "@/utils/gmail/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { saveUserLabel, saveUserLabels } from "@/utils/redis/label";

export const createLabelBody = z.object({
  name: z.string(),
  description: z.string().nullish(),
});
export type CreateLabelBody = z.infer<typeof createLabelBody>;
export type CreateLabelResponse = Awaited<ReturnType<typeof createLabel>>;

export async function createLabel(body: CreateLabelBody) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not authenticated");
  const gmail = getGmailClient(session);
  const res = await gmail.users.labels.create({
    userId: "me",
    requestBody: { name: body.name },
  });
  const label = res.data;

  await prisma.label.create({
    data: {
      name: body.name,
      description: body.description,
      gmailLabelId: label.id!,
      enabled: true,
      userId: session.user.id,
    },
  });

  await saveUserLabel({
    email: session.user.email,
    label: { id: label.id!, name: body.name, description: body.description },
  });

  return { label };
}
