import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getGmailAttachment } from "@/utils/gmail/attachment";
import { getGmailClient } from "@/utils/gmail/client";

const attachmentQuery = z.object({
  messageId: z.string(),
  attachmentId: z.string(),
  mimeType: z.string(),
  filename: z.string(),
});
// export type AttachmentQuery = z.infer<typeof attachmentQuery>;
// export type AttachmentResponse = Awaited<ReturnType<typeof getGmailAttachment>>;

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);

  const { searchParams } = new URL(request.url);

  const query = attachmentQuery.parse({
    messageId: searchParams.get("messageId"),
    attachmentId: searchParams.get("attachmentId"),
    mimeType: searchParams.get("mimeType"),
    filename: searchParams.get("filename"),
  });

  const attachmentData = await getGmailAttachment(
    gmail,
    query.messageId,
    query.attachmentId,
  );

  if (!attachmentData.data) return NextResponse.json({ error: "No data" });

  const decodedData = Buffer.from(attachmentData.data, "base64");

  const headers = new Headers();
  headers.set("Content-Type", query.mimeType);
  headers.set(
    "Content-Disposition",
    `attachment; filename="${query.filename}"`,
  );

  return new NextResponse(decodedData, { headers });
});
