import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { attachmentQuery } from "@/app/api/messages/validation";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);

  const query = attachmentQuery.parse({
    messageId: searchParams.get("messageId"),
    attachmentId: searchParams.get("attachmentId"),
    mimeType: searchParams.get("mimeType"),
    filename: searchParams.get("filename"),
  });

  // Get the email account to determine the provider
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: { provider: true },
      },
    },
  });

  if (!emailAccount) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
  });

  const attachmentData = await emailProvider.getAttachment(
    query.messageId,
    query.attachmentId,
  );

  if (!attachmentData.data) {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  const decodedData = Buffer.from(attachmentData.data, "base64");

  const headers = new Headers();
  headers.set("Content-Type", query.mimeType);
  headers.set(
    "Content-Disposition",
    `attachment; filename="${query.filename}"`,
  );

  return new NextResponse(decodedData, { headers });
});
