import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const deleteSchema = z.object({
  emailAccountId: z.string().min(1),
});

export const DELETE = withAuth("imap/linking/delete", async (request) => {
  const userId = request.auth.userId;
  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const emailAccount = await prisma.emailAccount.findFirst({
    where: { id: parsed.data.emailAccountId, userId },
    select: { accountId: true },
  });

  if (!emailAccount) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  // Deleting the Account cascades to ImapCredential and EmailAccount
  await prisma.account.delete({
    where: { id: emailAccount.accountId },
  });

  return NextResponse.json({ success: true });
});
