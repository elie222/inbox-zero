import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { processPreviousSentEmails } from "@/utils/reply-tracker/check-previous-emails";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";

export const maxDuration = 300;

const processPreviousSchema = z.object({ userId: z.string() });
export type ProcessPreviousBody = z.infer<typeof processPreviousSchema>;

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = processPreviousSchema.parse(json);

  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!user) return NextResponse.json({ error: "User not found" });

  const gmail = getGmailClient(session);

  const result = await processPreviousSentEmails(gmail, user);

  return NextResponse.json(result);
});
