import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { attachmentQuery } from "@/app/api/messages/validation";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";

export const maxDuration = 300;

export const GET = withAuth("messages/attachment", async (request) => {
  const { searchParams } = new URL(request.url);
  // Native browser downloads cannot supply the account header used by fetch.
  const emailAccountId =
    request.headers.get(EMAIL_ACCOUNT_HEADER) ??
    searchParams.get("emailAccountId");
  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account ID is required" },
      { status: 400 },
    );
  }
  const query = attachmentQuery.parse({
    messageId: searchParams.get("messageId"),
    attachmentId: searchParams.get("attachmentId"),
    mimeType: searchParams.get("mimeType"),
    filename: searchParams.get("filename"),
  });
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId, userId: request.auth.userId },
    select: { id: true, account: { select: { provider: true } } },
  });
  if (!emailAccount) {
    return NextResponse.json({ error: "Invalid account ID" }, { status: 403 });
  }
  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.account.provider,
    logger: request.logger,
  });
  const headers = new Headers({
    "Content-Type": /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(query.mimeType)
      ? query.mimeType
      : "application/octet-stream",
    "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(query.filename.toWellFormed()).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const stream = await emailProvider.getAttachmentStream(
    query.messageId,
    query.attachmentId,
    request.signal,
  );
  return new NextResponse(stream, { headers });
});
