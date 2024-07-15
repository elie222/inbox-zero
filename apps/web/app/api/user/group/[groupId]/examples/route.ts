import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { getGmailClient } from "@/utils/gmail/client";
import { fetchGroupExampleMessages } from "@/app/api/user/rules/[id]/example/controller";

export type ExamplesResponse = Awaited<ReturnType<typeof getExamples>>;

async function getExamples(options: { groupId: string }) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  const group = await prisma.group.findUnique({
    where: { id: options.groupId, userId: session.user.id },
    include: { items: true },
  });

  if (!group) throw new Error("Rule not found");

  const gmail = getGmailClient(session);

  const exampleMessages = await fetchGroupExampleMessages(group, gmail);

  return exampleMessages;
}

export const GET = withError(async (_request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const groupId = params.groupId;
  if (!groupId) return NextResponse.json({ error: "Missing group id" });

  const result = await getExamples({ groupId });

  return NextResponse.json(result);
});
