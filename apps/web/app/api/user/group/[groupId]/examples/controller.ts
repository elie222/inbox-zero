import prisma from "@/utils/prisma";
import { fetchGroupExampleMessages } from "@/app/api/user/rules/[id]/example/controller";
import { gmail_v1 } from "googleapis";

export type ExamplesResponse = Awaited<ReturnType<typeof getExamples>>;

export async function getExamples({
  groupId,
  userId,
  gmail,
}: {
  groupId: string;
  userId: string;
  gmail: gmail_v1.Gmail;
}) {
  const group = await prisma.group.findUnique({
    where: { id: groupId, userId },
    include: { items: true },
  });

  if (!group) throw new Error("Rule not found");

  const exampleMessages = await fetchGroupExampleMessages(group, gmail);

  return exampleMessages;
}
