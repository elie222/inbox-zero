import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { attachmentQuery } from "@/app/api/messages/validation";

export const GET = withEmailProvider(async (request) => {
  const { emailProvider } = request;

  const { searchParams } = new URL(request.url);

  const query = attachmentQuery.parse({
    messageId: searchParams.get("messageId"),
    attachmentId: searchParams.get("attachmentId"),
    mimeType: searchParams.get("mimeType"),
    filename: searchParams.get("filename"),
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
